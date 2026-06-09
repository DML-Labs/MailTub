package domain

import "time"

// Attachment is the metadata for a file attachment on an email.
// Binary data is stored separately and served via a download endpoint.
type Attachment struct {
	ID          string `json:"id"`
	EmailID     string `json:"emailId"`
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
}

// AttachmentInput is the write-side model used when saving an attachment.
// Data is included here but is never serialised to JSON responses.
type AttachmentInput struct {
	Filename    string
	ContentType string
	Data        []byte
}

// AttachmentData extends Attachment with the binary payload for downloads.
type AttachmentData struct {
	Attachment
	Data []byte
}

// Email represents a received email message stored in a mailbox.
type Email struct {
	ID          string            `json:"id"`
	MailboxID   string            `json:"mailboxId"`
	From        string            `json:"from"`
	To          string            `json:"to"`
	Subject     string            `json:"subject"`
	BodyText    string            `json:"bodyText"`
	BodyHTML    string            `json:"bodyHtml"`
	Headers     map[string]string `json:"headers"`
	Size        int64             `json:"size"`
	IsRead      bool              `json:"isRead"`
	ReceivedAt  time.Time         `json:"receivedAt"`
	Attachments []*Attachment     `json:"attachments,omitempty"`
}

// Snippet returns a short preview of the email body (max 160 chars).
func (e *Email) Snippet() string {
	body := e.BodyText
	if body == "" {
		body = e.BodyHTML
	}
	if len(body) > 160 {
		return body[:160] + "…"
	}
	return body
}
