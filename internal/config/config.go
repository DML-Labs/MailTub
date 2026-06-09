// Package config handles all application configuration loaded from
// environment variables, optional .env files, and an optional mailtub.yaml.
package config

import (
	"log/slog"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
	"gopkg.in/yaml.v3"
)

// Config holds the complete runtime configuration for MailTub.
type Config struct {
	// HTTP server
	HTTPPort int

	// SMTP server
	SMTPPort    int
	SMTPDomain  string
	SMTPMaxSize int64 // total raw message size cap (SMTP protocol level)

	// SMTP TLS / STARTTLS
	SMTPStartTLS bool
	TLSCertFile  string
	TLSKeyFile   string

	// MIME / attachment limits (parser level, enforced after SMTP accept)
	MaxAttachmentSizeMB  int // per-attachment cap; 0 = use SMTPMaxSize as fallback
	MaxTotalAttachmentMB int // total accumulated attachment cap; 0 = unlimited
	MaxBodyKB            int // plain-text + HTML body cap (KB); 0 = unlimited

	// Database
	DatabasePath string

	// Mailbox lifecycle
	MailboxTTL time.Duration

	// Cache (Redis/Upstash — optional)
	RedisURL string

	// Logging
	LogLevel slog.Level

	// App metadata
	AppVersion string

	// Admin panel — password is stored as a bcrypt hash in the DB (settings table).
	// ADMIN_PASSWORD env var overrides the DB hash (for Docker/CI deployments).
	// When neither is set, the browser first-run wizard handles initial setup.
	AdminPassword string // ADMIN_PASSWORD env var only; never loaded from mailtub.yaml

	// API key (optional) — if set, X-API-Key header is required on /api/v1/* endpoints.
	APIKey string // API_KEY env var; empty = no authentication required
}

// MaxAttachmentBytes returns the per-attachment byte limit.
// Falls back to SMTPMaxSize when not explicitly configured.
func (c *Config) MaxAttachmentBytes() int64 {
	if c.MaxAttachmentSizeMB > 0 {
		return int64(c.MaxAttachmentSizeMB) * 1024 * 1024
	}
	return c.SMTPMaxSize
}

// MaxTotalAttachmentBytes returns the total-attachment byte limit, or 0 for unlimited.
func (c *Config) MaxTotalAttachmentBytes() int64 {
	if c.MaxTotalAttachmentMB > 0 {
		return int64(c.MaxTotalAttachmentMB) * 1024 * 1024
	}
	return 0
}

// MaxBodyBytes returns the body byte limit, or 0 for unlimited.
func (c *Config) MaxBodyBytes() int64 {
	if c.MaxBodyKB > 0 {
		return int64(c.MaxBodyKB) * 1024
	}
	return 0
}

// fileConfig is the YAML schema for mailtub.yaml.
// Any field set here acts as a fallback when the corresponding env var is absent.
// Environment variables always take priority over the file.
type fileConfig struct {
	Domain               string `yaml:"domain"`
	HTTPPort             int    `yaml:"http_port"`
	SMTPPort             int    `yaml:"smtp_port"`
	SMTPMaxSizeMB        int    `yaml:"smtp_max_size_mb"`
	SMTPStartTLS         *bool  `yaml:"smtp_starttls"`
	TLSCertFile          string `yaml:"tls_cert_file"`
	TLSKeyFile           string `yaml:"tls_key_file"`
	MaxAttachmentSizeMB  int    `yaml:"max_attachment_size_mb"`
	MaxTotalAttachmentMB int    `yaml:"max_total_attachment_mb"`
	MaxBodyKB            int    `yaml:"max_body_kb"`
	DatabasePath         string `yaml:"database_path"`
	MailboxTTL           string `yaml:"mailbox_ttl"`
	RedisURL             string `yaml:"redis_url"`
	LogLevel             string `yaml:"log_level"`
	APIKey               string `yaml:"api_key"`
}

// loadYAML reads mailtub.yaml (or the path in MAILTUB_CONFIG) and sets
// environment variables for any keys that are not already set. This makes
// env vars always win over the file while keeping the file as a convenient
// alternative to a long list of exports.
func loadYAML() {
	path := os.Getenv("MAILTUB_CONFIG")
	if path == "" {
		path = "mailtub.yaml"
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return // file absent or unreadable — silently skip
	}
	var fc fileConfig
	if err := yaml.Unmarshal(data, &fc); err != nil {
		return // invalid YAML — silently skip
	}
	setIfAbsent("MAILTUB_DOMAIN", fc.Domain)
	setIfAbsentInt("PORT", fc.HTTPPort)
	setIfAbsentInt("SMTP_PORT", fc.SMTPPort)
	setIfAbsentInt("SMTP_MAX_SIZE_MB", fc.SMTPMaxSizeMB)
	if fc.SMTPStartTLS != nil {
		if *fc.SMTPStartTLS {
			setIfAbsent("SMTP_STARTTLS", "true")
		} else {
			setIfAbsent("SMTP_STARTTLS", "false")
		}
	}
	setIfAbsent("TLS_CERT_FILE", fc.TLSCertFile)
	setIfAbsent("TLS_KEY_FILE", fc.TLSKeyFile)
	setIfAbsentInt("MAX_ATTACHMENT_SIZE_MB", fc.MaxAttachmentSizeMB)
	setIfAbsentInt("MAX_TOTAL_ATTACHMENT_MB", fc.MaxTotalAttachmentMB)
	setIfAbsentInt("MAX_BODY_KB", fc.MaxBodyKB)
	setIfAbsent("DATABASE_PATH", fc.DatabasePath)
	setIfAbsent("MAILBOX_TTL", fc.MailboxTTL)
	setIfAbsent("REDIS_URL", fc.RedisURL)
	setIfAbsent("LOG_LEVEL", fc.LogLevel)
	setIfAbsent("API_KEY", fc.APIKey)
}

func setIfAbsent(key, value string) {
	if value == "" {
		return
	}
	if _, ok := os.LookupEnv(key); !ok {
		_ = os.Setenv(key, value)
	}
}

func setIfAbsentInt(key string, value int) {
	if value == 0 {
		return
	}
	setIfAbsent(key, strconv.Itoa(value))
}

// Load reads configuration from (in priority order):
//  1. Environment variables already set in the process
//  2. .env file (via godotenv)
//  3. mailtub.yaml (via loadYAML)
//  4. Built-in defaults
func Load() *Config {
	// Priority: existing env vars > .env file > mailtub.yaml > defaults
	_ = godotenv.Load()
	loadYAML()

	return &Config{
		HTTPPort:             getInt("PORT", 8080),
		SMTPPort:             getInt("SMTP_PORT", 2525),
		SMTPDomain:           getStr("MAILTUB_DOMAIN", "localhost"),
		SMTPMaxSize:          int64(getInt("SMTP_MAX_SIZE_MB", 25)) * 1024 * 1024,
		SMTPStartTLS:         getBool("SMTP_STARTTLS", false),
		TLSCertFile:          getStr("TLS_CERT_FILE", ""),
		TLSKeyFile:           getStr("TLS_KEY_FILE", ""),
		MaxAttachmentSizeMB:  getInt("MAX_ATTACHMENT_SIZE_MB", 25),
		MaxTotalAttachmentMB: getInt("MAX_TOTAL_ATTACHMENT_MB", 50),
		MaxBodyKB:            getInt("MAX_BODY_KB", 512),
		DatabasePath:         getStr("DATABASE_PATH", "./data/mailtub.db"),
		MailboxTTL:           getDuration("MAILBOX_TTL", 24*time.Hour),
		RedisURL:             getStr("REDIS_URL", ""),
		LogLevel:             getLogLevel("LOG_LEVEL", slog.LevelInfo),
		AppVersion:           getStr("APP_VERSION", "dev"),
		AdminPassword:        getStr("ADMIN_PASSWORD", ""),
		APIKey:               getStr("API_KEY", ""),
	}
}

func getStr(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func getInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func getBool(key string, fallback bool) bool {
	switch os.Getenv(key) {
	case "true", "1", "yes":
		return true
	case "false", "0", "no":
		return false
	}
	return fallback
}

func getDuration(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

func getLogLevel(key string, fallback slog.Level) slog.Level {
	switch os.Getenv(key) {
	case "debug", "DEBUG":
		return slog.LevelDebug
	case "warn", "WARN":
		return slog.LevelWarn
	case "error", "ERROR":
		return slog.LevelError
	default:
		return fallback
	}
}
