package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	mailtub "github.com/dml-labs/mailtub"
	"github.com/dml-labs/mailtub/internal/api"
	"github.com/dml-labs/mailtub/internal/api/handler"
	"github.com/dml-labs/mailtub/internal/cache"
	"github.com/dml-labs/mailtub/internal/config"
	"github.com/dml-labs/mailtub/internal/logbuf"
	"github.com/dml-labs/mailtub/internal/smtp"
	"github.com/dml-labs/mailtub/internal/storage"
	"github.com/dml-labs/mailtub/internal/ws"
	"github.com/joho/godotenv"
)

func runServe(args []string) {
	// Propagate the ldflags build-time version to the health handler.
	handler.AppVersion = version

	fs := flag.NewFlagSet("serve", flag.ExitOnError)

	var debugFlag bool
	var verboseFlag bool
	var configFile string
	fs.BoolVar(&debugFlag, "debug", false, "Enable debug-level logging (overrides LOG_LEVEL)")
	fs.BoolVar(&verboseFlag, "verbose", false, "Enable verbose/debug logging (alias for --debug)")
	fs.StringVar(&configFile, "config", "", "Path to a .env config file (default: .env in CWD)")

	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "Usage: mailtub serve [flags]")
		fmt.Fprintln(os.Stderr, "\nFlags:")
		fs.PrintDefaults()
		fmt.Fprintln(os.Stderr, "\nEnvironment variables:")
		fmt.Fprintln(os.Stderr, "  PORT              HTTP port (default 8080)")
		fmt.Fprintln(os.Stderr, "  SMTP_PORT         SMTP port (default 2525)")
		fmt.Fprintln(os.Stderr, "  MAILTUB_DOMAIN    Email domain (default localhost)")
		fmt.Fprintln(os.Stderr, "  DATABASE_PATH     SQLite path (default ./data/mailtub.db)")
		fmt.Fprintln(os.Stderr, "  MAILBOX_TTL       Mailbox lifetime (default 24h)")
		fmt.Fprintln(os.Stderr, "  SMTP_STARTTLS     Enable STARTTLS: true/false (default false)")
		fmt.Fprintln(os.Stderr, "  TLS_CERT_FILE     PEM cert for STARTTLS (auto-generated if unset)")
		fmt.Fprintln(os.Stderr, "  TLS_KEY_FILE      PEM key for STARTTLS")
		fmt.Fprintln(os.Stderr, "  REDIS_URL         Optional Redis cache URL")
		fmt.Fprintln(os.Stderr, "  LOG_LEVEL         debug|info|warn|error (default info)")
		fmt.Fprintln(os.Stderr, "  ADMIN_PASSWORD    Override DB-managed admin password (Docker/CI deployments)")
		fmt.Fprintln(os.Stderr, "\nSee: https://github.com/dml-labs/mailtub/blob/main/docs/configuration.md")
	}
	_ = fs.Parse(args)

	// --config / --env-file: load a specific .env file before config.Load()
	if configFile != "" {
		if err := os.Setenv("GODOTENV_PATH", configFile); err == nil {
			// godotenv.Load() in config.Load() will pick this up via the path below
			_ = loadEnvFile(configFile)
		}
	}

	// --debug / --verbose: override LOG_LEVEL
	if debugFlag || verboseFlag {
		_ = os.Setenv("LOG_LEVEL", "debug")
	}

	cfg := config.Load()

	ring := logbuf.New(500)
	logger := slog.New(logbuf.NewHandler(ring, slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: cfg.LogLevel,
	})))
	slog.SetDefault(logger)

	slog.Info("MailTub starting",
		"version", cfg.AppVersion,
		"domain", cfg.SMTPDomain,
		"http_port", cfg.HTTPPort,
		"smtp_port", cfg.SMTPPort,
	)

	// Database
	db, err := storage.Open(cfg.DatabasePath)
	if err != nil {
		slog.Error("failed to open database", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	slog.Info("database ready", "path", cfg.DatabasePath)

	// Optional Redis cache
	redisCache := cache.New(cfg.RedisURL)
	if redisCache.Enabled() {
		slog.Info("redis cache enabled")
	}

	// WebSocket hub
	hub := ws.NewHub()

	// SMTP server
	smtpSrv := smtp.NewServer(cfg, db.Mailboxes, db.Emails, hub)
	go func() {
		slog.Info("smtp: listening", "port", cfg.SMTPPort)
		if err := smtpSrv.ListenAndServe(); err != nil {
			slog.Error("smtp server stopped", "error", err)
		}
	}()

	// Expired mailbox cleanup
	go cleanupLoop(db, 30*time.Minute)

	// HTTP server with embedded frontend
	router := api.NewRouter(cfg, db.Mailboxes, db.Emails, hub, mailtub.WebFS, ring, db.Settings)
	addr := fmt.Sprintf(":%d", cfg.HTTPPort)
	httpSrv := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		slog.Info("http: listening", "addr", addr)
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("http server stopped", "error", err)
			os.Exit(1)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := httpSrv.Shutdown(ctx); err != nil {
		slog.Error("http shutdown error", "error", err)
	}
	smtpSrv.Close()
	slog.Info("MailTub stopped")
}

// loadEnvFile loads a specific .env file via godotenv, overriding any already-set
// environment variables only if they are not already present (same semantics as
// godotenv.Load for unset keys).  Errors are silently ignored so the binary
// remains usable even if the file is missing.
func loadEnvFile(path string) error {
	return godotenv.Overload(path)
}

// cleanupLoop periodically deletes expired mailboxes (and their cascaded emails).
func cleanupLoop(db *storage.DB, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for range t.C {
		n, err := db.Mailboxes.DeleteExpired(context.Background())
		if err != nil {
			slog.Error("cleanup: delete expired mailboxes", "error", err)
			continue
		}
		if n > 0 {
			slog.Info("cleanup: removed expired mailboxes", "count", n)
		}
	}
}
