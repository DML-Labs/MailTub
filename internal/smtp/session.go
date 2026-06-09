package smtp

import (
	"errors"
	"io"
	"log/slog"
	"strings"
	"time"

	gosmtp "github.com/emersion/go-smtp"
	"github.com/google/uuid"

	"github.com/dml-labs/mailtub/internal/domain"
	"github.com/dml-labs/mailtub/internal/metrics"
)

// session handles a single SMTP client connection.
type session struct {
	backend *Backend
	from    string
	to      []string
}

func (s *session) AuthPlain(_, _ string) error {
	// MailTub is a receive-only MTA; we accept but do not verify credentials.
	return nil
}

func (s *session) Mail(from string, _ *gosmtp.MailOptions) error {
	s.from = from
	return nil
}

func (s *session) Rcpt(to string, _ *gosmtp.RcptOptions) error {
	domain := s.backend.domain
	if !strings.HasSuffix(strings.ToLower(to), "@"+strings.ToLower(domain)) {
		return &gosmtp.SMTPError{
			Code:         550,
			EnhancedCode: gosmtp.EnhancedCode{5, 1, 1},
			Message:      "User not found",
		}
	}
	s.to = append(s.to, strings.ToLower(to))
	return nil
}

func (s *session) Data(r io.Reader) error {
	if len(s.to) == 0 {
		return errors.New("no recipients")
	}

	opts := ParseOptions{
		MaxAttachmentBytes:      s.backend.maxAttachmentBytes,
		MaxTotalAttachmentBytes: s.backend.maxTotalAttachmentBytes,
		MaxBodyBytes:            s.backend.maxBodyBytes,
	}

	parsed, err := Parse(r, opts)
	if err != nil {
		return err
	}

	ctx := s.backend.ctx

	for _, addr := range s.to {
		mb, err := s.backend.mailboxes.FindByAddress(ctx, addr)
		if err != nil {
			slog.Error("smtp: lookup mailbox", "addr", addr, "error", err)
			continue
		}
		if mb == nil || mb.IsExpired() {
			slog.Debug("smtp: no active mailbox for address", "addr", addr)
			continue
		}

		email := &domain.Email{
			ID:         uuid.NewString(),
			MailboxID:  mb.ID,
			From:       coalesce(parsed.From, s.from),
			To:         addr,
			Subject:    parsed.Subject,
			BodyText:   parsed.TextBody,
			BodyHTML:   parsed.HTMLBody,
			Headers:    parsed.Headers,
			Size:       parsed.Size,
			IsRead:     false,
			ReceivedAt: time.Now().UTC(),
		}

		if err := s.backend.emails.Save(ctx, email); err != nil {
			slog.Error("smtp: save email", "error", err)
			continue
		}

		// Persist attachments (failures are non-fatal).
		for _, att := range parsed.Attachments {
			a, err := s.backend.emails.SaveAttachment(ctx, email.ID, &domain.AttachmentInput{
				Filename:    att.Filename,
				ContentType: att.ContentType,
				Data:        att.Data,
			})
			if err != nil {
				slog.Warn("smtp: save attachment", "filename", att.Filename, "error", err)
				continue
			}
			email.Attachments = append(email.Attachments, a)
		}

		metrics.EmailsReceived.WithLabelValues(s.backend.domain).Inc()
		s.backend.hub.BroadcastNewEmail(addr, email)
		slog.Info("smtp: email received",
			"to", addr,
			"from", email.From,
			"subject", email.Subject,
			"attachments", len(email.Attachments),
			"skipped_attachments", parsed.Skipped,
		)
	}

	return nil
}

func (s *session) Reset() {
	s.from = ""
	s.to = nil
}

func (s *session) Logout() error { return nil }

func coalesce(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
