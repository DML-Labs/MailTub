// Package smtp implements the embedded SMTP server that receives incoming
// email and stores it in the database.
package smtp

import (
	"io"
	"log/slog"
	"strings"

	"github.com/emersion/go-message/mail"
)

// ParsedAttachment holds a single decoded attachment from an email.
type ParsedAttachment struct {
	Filename    string
	ContentType string
	Data        []byte
}

// ParsedEmail holds the extracted fields from a raw MIME message.
type ParsedEmail struct {
	From        string
	Subject     string
	TextBody    string
	HTMLBody    string
	Headers     map[string]string
	Size        int64
	Attachments []ParsedAttachment
	// Skipped reports how many attachments were dropped due to size limits.
	Skipped int
}

// ParseOptions configures MIME-level size enforcement applied after the
// SMTP-level MaxMessageBytes check.
type ParseOptions struct {
	// MaxAttachmentBytes caps each individual attachment.
	// Attachments that exceed this are logged and skipped.
	// 0 means unlimited.
	MaxAttachmentBytes int64

	// MaxTotalAttachmentBytes caps the total size of all accepted attachments.
	// Once exceeded, remaining attachments are skipped.
	// 0 means unlimited.
	MaxTotalAttachmentBytes int64

	// MaxBodyBytes caps each text/plain or text/html body part.
	// Parts that exceed this are truncated with a trailing notice appended.
	// 0 means unlimited.
	MaxBodyBytes int64
}

// Parse reads a raw email from r and extracts headers, body parts, and
// attachments, enforcing the limits in opts.
func Parse(r io.Reader, opts ParseOptions) (*ParsedEmail, error) {
	raw, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}

	parsed := &ParsedEmail{
		Headers: make(map[string]string),
		Size:    int64(len(raw)),
	}

	mr, err := mail.CreateReader(strings.NewReader(string(raw)))
	if err != nil {
		// Fallback: return raw bytes as plain text, respecting body limit.
		body := string(raw)
		if opts.MaxBodyBytes > 0 && int64(len(body)) > opts.MaxBodyBytes {
			body = body[:opts.MaxBodyBytes] + "\n[body truncated — exceeded limit]"
		}
		parsed.TextBody = body
		return parsed, nil
	}

	h := mr.Header
	parsed.From, _ = h.Text("From")
	parsed.Subject, _ = h.Text("Subject")

	for _, name := range []string{"From", "To", "Subject", "Date", "Message-ID", "Reply-To", "CC"} {
		if v, _ := h.Text(name); v != "" {
			parsed.Headers[name] = v
		}
	}

	var totalAttachBytes int64

	for {
		p, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}

		switch ph := p.Header.(type) {
		case *mail.InlineHeader:
			ct, _, _ := ph.ContentType()

			var bodyReader io.Reader = p.Body
			truncated := false
			if opts.MaxBodyBytes > 0 {
				// Read one byte over the limit to detect truncation.
				bodyReader = io.LimitReader(p.Body, opts.MaxBodyBytes+1)
			}

			body, _ := io.ReadAll(bodyReader)

			if opts.MaxBodyBytes > 0 && int64(len(body)) > opts.MaxBodyBytes {
				body = body[:opts.MaxBodyBytes]
				truncated = true
			}

			bodyStr := string(body)
			if truncated {
				bodyStr += "\n[body truncated — exceeded limit]"
			}

			switch {
			case strings.HasPrefix(ct, "text/html"):
				parsed.HTMLBody = bodyStr
			case strings.HasPrefix(ct, "text/plain"):
				parsed.TextBody = bodyStr
			}

		case *mail.AttachmentHeader:
			ct, _, _ := ph.ContentType()
			filename, _ := ph.Filename()
			if filename == "" {
				filename = "attachment"
			}
			if ct == "" {
				ct = "application/octet-stream"
			}

			// Read attachment — one byte over limit so we can detect oversize.
			var attReader io.Reader = p.Body
			var limit int64
			if opts.MaxAttachmentBytes > 0 {
				limit = opts.MaxAttachmentBytes
				attReader = io.LimitReader(p.Body, limit+1)
			}

			data, _ := io.ReadAll(attReader)

			// Per-attachment size check.
			if opts.MaxAttachmentBytes > 0 && int64(len(data)) > opts.MaxAttachmentBytes {
				slog.Warn("smtp: skipping oversized attachment",
					"filename", filename,
					"size_bytes", len(data),
					"limit_bytes", opts.MaxAttachmentBytes,
				)
				parsed.Skipped++
				continue
			}

			// Total-attachment size check.
			if opts.MaxTotalAttachmentBytes > 0 && totalAttachBytes+int64(len(data)) > opts.MaxTotalAttachmentBytes {
				slog.Warn("smtp: skipping attachment — total attachment budget exhausted",
					"filename", filename,
					"size_bytes", len(data),
					"total_so_far", totalAttachBytes,
					"limit_bytes", opts.MaxTotalAttachmentBytes,
				)
				parsed.Skipped++
				continue
			}

			totalAttachBytes += int64(len(data))
			parsed.Attachments = append(parsed.Attachments, ParsedAttachment{
				Filename:    filename,
				ContentType: ct,
				Data:        data,
			})
		}
	}

	return parsed, nil
}
