package smtp

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	gosmtp "github.com/emersion/go-smtp"

	"github.com/dml-labs/mailtub/internal/config"
	"github.com/dml-labs/mailtub/internal/domain"
	"github.com/dml-labs/mailtub/internal/ws"
)

// Backend implements gosmtp.Backend — one instance per running server.
type Backend struct {
	domain    string
	mailboxes domain.MailboxRepository
	emails    domain.EmailRepository
	hub       *ws.Hub
	ctx       context.Context

	// MIME-level limits (populated from config).
	maxAttachmentBytes      int64
	maxTotalAttachmentBytes int64
	maxBodyBytes            int64
}

// NewSession creates a fresh session for each incoming SMTP connection.
func (b *Backend) NewSession(_ *gosmtp.Conn) (gosmtp.Session, error) {
	return &session{backend: b}, nil
}

// Server wraps the go-smtp server with MailTub configuration.
type Server struct {
	inner *gosmtp.Server
}

// NewServer builds and configures the SMTP server.
// When cfg.SMTPStartTLS is true, STARTTLS is advertised. A self-signed
// certificate is generated automatically unless cfg.TLSCertFile/TLSKeyFile
// are provided.
func NewServer(
	cfg *config.Config,
	mailboxes domain.MailboxRepository,
	emails domain.EmailRepository,
	hub *ws.Hub,
) *Server {
	backend := &Backend{
		domain:                  cfg.SMTPDomain,
		mailboxes:               mailboxes,
		emails:                  emails,
		hub:                     hub,
		ctx:                     context.Background(),
		maxAttachmentBytes:      cfg.MaxAttachmentBytes(),
		maxTotalAttachmentBytes: cfg.MaxTotalAttachmentBytes(),
		maxBodyBytes:            cfg.MaxBodyBytes(),
	}

	s := gosmtp.NewServer(backend)
	s.Addr = fmt.Sprintf(":%d", cfg.SMTPPort)
	s.Domain = cfg.SMTPDomain
	s.WriteTimeout = 30 * time.Second
	s.ReadTimeout = 30 * time.Second
	s.MaxMessageBytes = cfg.SMTPMaxSize
	s.MaxRecipients = 50

	// STARTTLS — load or generate TLS config when enabled.
	if cfg.SMTPStartTLS {
		tlsCfg, err := LoadTLSConfig(cfg.TLSCertFile, cfg.TLSKeyFile, cfg.SMTPDomain)
		if err != nil {
			slog.Warn("smtp: STARTTLS requested but TLS setup failed — falling back to plain",
				"error", err,
			)
			s.AllowInsecureAuth = true
		} else {
			s.TLSConfig = tlsCfg
			s.AllowInsecureAuth = false
			certMode := "self-signed"
			if cfg.TLSCertFile != "" {
				certMode = cfg.TLSCertFile
			}
			slog.Info("smtp: STARTTLS enabled", "cert", certMode)
		}
	} else {
		s.AllowInsecureAuth = true
	}

	slog.Info("smtp: server configured",
		"domain", cfg.SMTPDomain,
		"addr", s.Addr,
		"maxMsgMB", cfg.SMTPMaxSize/(1024*1024),
		"maxAttachMB", cfg.MaxAttachmentSizeMB,
		"maxTotalAttachMB", cfg.MaxTotalAttachmentMB,
		"starttls", cfg.SMTPStartTLS,
	)

	return &Server{inner: s}
}

// ListenAndServe starts the SMTP server (blocks).
func (s *Server) ListenAndServe() error {
	return s.inner.ListenAndServe()
}

// Close shuts down the SMTP server.
func (s *Server) Close() error {
	return s.inner.Close()
}
