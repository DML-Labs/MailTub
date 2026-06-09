package domain

import "context"

// MailboxRepository defines persistence operations for mailboxes.
type MailboxRepository interface {
	Create(ctx context.Context, m *Mailbox) error
	FindByAddress(ctx context.Context, address string) (*Mailbox, error)
	FindByID(ctx context.Context, id string) (*Mailbox, error)
	Delete(ctx context.Context, id string) error
	DeleteExpired(ctx context.Context) (int64, error)

	// Admin operations
	ListAll(ctx context.Context, limit, offset int) ([]*Mailbox, error)
	CountAll(ctx context.Context) (int64, error)
}

// EmailRepository defines persistence operations for emails and attachments.
type EmailRepository interface {
	Save(ctx context.Context, e *Email) error
	ListByMailbox(ctx context.Context, mailboxID string, limit, offset int) ([]*Email, error)
	FindByID(ctx context.Context, id string) (*Email, error)
	MarkRead(ctx context.Context, id string) error
	Delete(ctx context.Context, id string) error
	CountByMailbox(ctx context.Context, mailboxID string) (int64, error)

	// Admin operations
	CountAll(ctx context.Context) (int64, error)

	// Attachments
	SaveAttachment(ctx context.Context, emailID string, input *AttachmentInput) (*Attachment, error)
	GetAttachment(ctx context.Context, attachmentID string) (*AttachmentData, error)
}
