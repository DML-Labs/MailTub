// Package api wires up the HTTP router for MailTub's REST API and
// WebSocket endpoint.  The embedded React SPA is served as a catch-all.
package api

import (
	"embed"
	"io/fs"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/dml-labs/mailtub/internal/api/admin"
	"github.com/dml-labs/mailtub/internal/api/handler"
	"github.com/dml-labs/mailtub/internal/api/middleware"
	"github.com/dml-labs/mailtub/internal/config"
	"github.com/dml-labs/mailtub/internal/domain"
	"github.com/dml-labs/mailtub/internal/logbuf"
	"github.com/dml-labs/mailtub/internal/metrics"
	"github.com/dml-labs/mailtub/internal/ratelimit"
	"github.com/dml-labs/mailtub/internal/storage"
	"github.com/dml-labs/mailtub/internal/ws"
)

// NewRouter builds and returns the main HTTP mux.
func NewRouter(
	cfg *config.Config,
	mailboxes domain.MailboxRepository,
	emails domain.EmailRepository,
	hub *ws.Hub,
	webFS embed.FS,
	ring *logbuf.RingBuffer,
	settings *storage.SettingsStore,
) http.Handler {
	r := chi.NewRouter()

	// Core middleware
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.RequestID)
	r.Use(requestLogger)
	r.Use(chimiddleware.Recoverer)
	r.Use(corsMiddleware)

	// Admin handler — created first so we can use its HasValidCookie for /metrics.
	adm := admin.NewHandler(cfg, mailboxes, emails, ring, settings)

	// Prometheus metrics endpoint.
	// Protected when a password is configured (env var or DB). Rules:
	//   - Bearer token matching ADMIN_PASSWORD env var (for Prometheus scrape configs).
	//   - OR a valid admin session cookie.
	// When no password is configured yet (first-run), metrics are open.
	metricsHandler := promhttp.Handler()
	r.Get("/metrics", func(w http.ResponseWriter, req *http.Request) {
		if !adm.NeedsSetup() {
			authHeader := req.Header.Get("Authorization")
			tokenOK := cfg.AdminPassword != "" && authHeader == "Bearer "+cfg.AdminPassword
			if !tokenOK && !adm.HasValidCookie(req) {
				w.Header().Set("WWW-Authenticate", `Bearer realm="MailTub metrics"`)
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
		}
		metricsHandler.ServeHTTP(w, req)
	})

	// WebSocket
	r.Get("/ws", func(w http.ResponseWriter, req *http.Request) {
		ws.ServeWS(hub, w, req)
	})

	// Rate limiter: max 20 new mailboxes per IP per hour.
	mailboxLimiter := ratelimit.New(20, time.Hour)

	// REST API v1
	mbh := handler.NewMailboxHandler(cfg, mailboxes, emails)
	eh := handler.NewEmailHandler(mailboxes, emails)

	r.Route("/api/v1", func(r chi.Router) {
		// Optional API key authentication — enabled when API_KEY env var is set.
		r.Use(middleware.APIKeyAuth(cfg.APIKey))

		r.Get("/health", handler.Health)
		r.Get("/config", handler.Config(cfg))

		r.With(mailboxLimiter.Middleware).Post("/mailbox", mbh.Create)
		r.Get("/mailbox/{address}", mbh.Get)
		r.Delete("/mailbox/{address}", mbh.Delete)

		r.Get("/mailbox/{address}/emails", eh.List)
		r.Get("/mailbox/{address}/emails/{id}", eh.Get)
		r.Delete("/mailbox/{address}/emails/{id}", eh.Delete)
		r.Patch("/mailbox/{address}/emails/{id}/read", eh.MarkRead)
		r.Get("/mailbox/{address}/emails/{id}/attachments/{attachmentId}", eh.GetAttachment)
	})

	// Admin panel API
	r.Route("/admin/api", func(r chi.Router) {
		// Public endpoints (no auth required)
		r.Get("/setup-status", adm.SetupStatus)
		r.Post("/setup", adm.Setup)
		r.Post("/login", adm.Login)
		r.Post("/logout", adm.Logout)

		// Protected endpoints
		r.Group(func(r chi.Router) {
			r.Use(adm.RequireAuth)
			r.Get("/stats", adm.Stats)
			r.Get("/mailboxes", adm.ListMailboxes)
			r.Get("/mailboxes/{id}/emails", adm.ListMailboxEmails)
			r.Delete("/mailboxes/{id}", adm.PurgeMailbox)
			r.Post("/purge-expired", adm.PurgeExpired)
			r.Get("/logs", adm.Logs)
			r.Get("/config", adm.GetConfig)
			r.Post("/change-password", adm.ChangePassword)
		})
	})

	// SPA fallback — serve embedded React build (catches /admin/login, /admin/dashboard etc.)
	r.Handle("/*", spaHandler(webFS))

	return r
}

// spaHandler serves the embedded React build and falls back to index.html
// for any path not found in the dist directory (client-side routing).
func spaHandler(webFS embed.FS) http.Handler {
	dist, err := fs.Sub(webFS, "web/dist")
	if err != nil {
		slog.Warn("api: embedded frontend not found; serving empty page", "error", err)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "Frontend not built. Run: make frontend", http.StatusServiceUnavailable)
		})
	}
	fileServer := http.FileServer(http.FS(dist))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		if _, err := dist.Open(path); err != nil {
			r2 := r.Clone(r.Context())
			r2.URL.Path = "/"
			fileServer.ServeHTTP(w, r2)
			return
		}
		fileServer.ServeHTTP(w, r)
	})
}

// corsMiddleware adds CORS headers permitting any origin.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, X-Request-ID")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// requestLogger logs every request and records Prometheus metrics.
func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		dur := time.Since(start)

		// Route label: collapse IDs to keep cardinality low
		route := routeLabel(r.URL.Path)
		statusStr := strconv.Itoa(ww.Status())

		metrics.HTTPRequests.WithLabelValues(r.Method, route, statusStr).Inc()
		metrics.HTTPDuration.WithLabelValues(r.Method, route).Observe(dur.Seconds())

		slog.Info("http",
			"method", r.Method,
			"path", r.URL.Path,
			"status", ww.Status(),
			"latency", dur.String(),
			"ip", r.RemoteAddr,
		)
	})
}

// routeLabel collapses dynamic path segments so Prometheus cardinality stays low.
// e.g. /api/v1/mailbox/foo@bar/emails/some-uuid → /api/v1/mailbox/:addr/emails/:id
func routeLabel(path string) string {
	// Trim trailing slash
	path = strings.TrimRight(path, "/")
	parts := strings.Split(path, "/")
	for i, p := range parts {
		if strings.Contains(p, "@") {
			parts[i] = ":addr"
		} else if isUUID(p) {
			parts[i] = ":id"
		}
	}
	result := strings.Join(parts, "/")
	if result == "" {
		return "/"
	}
	return result
}

func isUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i, c := range s {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if c != '-' {
				return false
			}
		} else if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}
