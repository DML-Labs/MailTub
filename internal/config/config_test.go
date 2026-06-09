package config

import (
	"testing"
	"time"
)

// ── Helper methods ─────────────────────────────────────────────────────────

func TestMaxAttachmentBytes_whenSet(t *testing.T) {
	c := &Config{MaxAttachmentSizeMB: 10}
	want := int64(10 * 1024 * 1024)
	if got := c.MaxAttachmentBytes(); got != want {
		t.Errorf("MaxAttachmentBytes = %d, want %d", got, want)
	}
}

func TestMaxAttachmentBytes_fallbackToSMTPMax(t *testing.T) {
	c := &Config{MaxAttachmentSizeMB: 0, SMTPMaxSize: 5 * 1024 * 1024}
	if got := c.MaxAttachmentBytes(); got != c.SMTPMaxSize {
		t.Errorf("MaxAttachmentBytes = %d, want %d (SMTP max)", got, c.SMTPMaxSize)
	}
}

func TestMaxTotalAttachmentBytes_whenSet(t *testing.T) {
	c := &Config{MaxTotalAttachmentMB: 50}
	want := int64(50 * 1024 * 1024)
	if got := c.MaxTotalAttachmentBytes(); got != want {
		t.Errorf("MaxTotalAttachmentBytes = %d, want %d", got, want)
	}
}

func TestMaxTotalAttachmentBytes_zeroIsUnlimited(t *testing.T) {
	c := &Config{MaxTotalAttachmentMB: 0}
	if got := c.MaxTotalAttachmentBytes(); got != 0 {
		t.Errorf("MaxTotalAttachmentBytes = %d, want 0 (unlimited)", got)
	}
}

func TestMaxBodyBytes_whenSet(t *testing.T) {
	c := &Config{MaxBodyKB: 512}
	want := int64(512 * 1024)
	if got := c.MaxBodyBytes(); got != want {
		t.Errorf("MaxBodyBytes = %d, want %d", got, want)
	}
}

func TestMaxBodyBytes_zeroIsUnlimited(t *testing.T) {
	c := &Config{MaxBodyKB: 0}
	if got := c.MaxBodyBytes(); got != 0 {
		t.Errorf("MaxBodyBytes = %d, want 0 (unlimited)", got)
	}
}

// ── Load — defaults ────────────────────────────────────────────────────────

func TestLoad_defaults(t *testing.T) {
	// Unset any vars that might bleed in from the host environment.
	for _, k := range []string{
		"PORT", "SMTP_PORT", "MAILTUB_DOMAIN", "DATABASE_PATH",
		"MAILBOX_TTL", "LOG_LEVEL", "ADMIN_PASSWORD", "API_KEY",
		"SMTP_STARTTLS", "SMTP_MAX_SIZE_MB", "MAX_ATTACHMENT_SIZE_MB",
		"MAX_TOTAL_ATTACHMENT_MB", "MAX_BODY_KB",
	} {
		t.Setenv(k, "")
	}
	// Point MAILTUB_CONFIG to a nonexistent path so loadYAML is a no-op.
	t.Setenv("MAILTUB_CONFIG", "/tmp/mailtub_test_nonexistent.yaml")

	cfg := Load()

	if cfg.HTTPPort != 8080 {
		t.Errorf("HTTPPort = %d, want 8080", cfg.HTTPPort)
	}
	if cfg.SMTPPort != 2525 {
		t.Errorf("SMTPPort = %d, want 2525", cfg.SMTPPort)
	}
	if cfg.SMTPDomain != "localhost" {
		t.Errorf("SMTPDomain = %q, want localhost", cfg.SMTPDomain)
	}
	if cfg.MailboxTTL != 24*time.Hour {
		t.Errorf("MailboxTTL = %v, want 24h", cfg.MailboxTTL)
	}
	if cfg.AdminPassword != "" {
		t.Errorf("AdminPassword = %q, want empty", cfg.AdminPassword)
	}
	if cfg.SMTPStartTLS {
		t.Error("SMTPStartTLS should default to false")
	}
}

// ── Load — env var overrides ───────────────────────────────────────────────

func TestLoad_envOverridesPort(t *testing.T) {
	t.Setenv("MAILTUB_CONFIG", "/tmp/mailtub_test_nonexistent.yaml")
	t.Setenv("PORT", "9090")
	t.Setenv("SMTP_PORT", "2600")

	cfg := Load()

	if cfg.HTTPPort != 9090 {
		t.Errorf("HTTPPort = %d, want 9090", cfg.HTTPPort)
	}
	if cfg.SMTPPort != 2600 {
		t.Errorf("SMTPPort = %d, want 2600", cfg.SMTPPort)
	}
}

func TestLoad_envOverridesDomain(t *testing.T) {
	t.Setenv("MAILTUB_CONFIG", "/tmp/mailtub_test_nonexistent.yaml")
	t.Setenv("MAILTUB_DOMAIN", "mail.example.com")

	cfg := Load()

	if cfg.SMTPDomain != "mail.example.com" {
		t.Errorf("SMTPDomain = %q, want mail.example.com", cfg.SMTPDomain)
	}
}

func TestLoad_envOverridesMailboxTTL(t *testing.T) {
	t.Setenv("MAILTUB_CONFIG", "/tmp/mailtub_test_nonexistent.yaml")
	t.Setenv("MAILBOX_TTL", "1h")

	cfg := Load()

	if cfg.MailboxTTL != time.Hour {
		t.Errorf("MailboxTTL = %v, want 1h", cfg.MailboxTTL)
	}
}

func TestLoad_starttlsTrue(t *testing.T) {
	t.Setenv("MAILTUB_CONFIG", "/tmp/mailtub_test_nonexistent.yaml")
	t.Setenv("SMTP_STARTTLS", "true")

	cfg := Load()

	if !cfg.SMTPStartTLS {
		t.Error("SMTPStartTLS should be true")
	}
}

func TestLoad_adminPassword(t *testing.T) {
	t.Setenv("MAILTUB_CONFIG", "/tmp/mailtub_test_nonexistent.yaml")
	t.Setenv("ADMIN_PASSWORD", "supersecret")

	cfg := Load()

	if cfg.AdminPassword != "supersecret" {
		t.Errorf("AdminPassword = %q, want supersecret", cfg.AdminPassword)
	}
}

func TestLoad_smtpMaxSizeBytes(t *testing.T) {
	t.Setenv("MAILTUB_CONFIG", "/tmp/mailtub_test_nonexistent.yaml")
	t.Setenv("SMTP_MAX_SIZE_MB", "10")

	cfg := Load()

	want := int64(10 * 1024 * 1024)
	if cfg.SMTPMaxSize != want {
		t.Errorf("SMTPMaxSize = %d, want %d", cfg.SMTPMaxSize, want)
	}
}
