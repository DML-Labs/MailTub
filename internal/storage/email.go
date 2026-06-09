package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/dml-labs/mailtub/internal/domain"
)

// EmailStore is the SQLite implementation of domain.EmailRepository.
type EmailStore struct{ db *sql.DB }

func (s *EmailStore) Save(ctx context.Context, e *domain.Email) error {
	hdrs, _ := json.Marshal(e.Headers)
	const q = `INSERT INTO emails
                   (id, mailbox_id, from_addr, to_addr, subject, body_text, body_html, headers, size, is_read, received_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := s.db.ExecContext(ctx, q,
		e.ID, e.MailboxID, e.From, e.To, e.Subject,
		e.BodyText, e.BodyHTML, string(hdrs), e.Size,
		boolToInt(e.IsRead),
		e.ReceivedAt.UTC().Format(time.RFC3339Nano),
	)
	return err
}

func (s *EmailStore) ListByMailbox(ctx context.Context, mailboxID string, limit, offset int) ([]*domain.Email, error) {
	const q = `SELECT id, mailbox_id, from_addr, to_addr, subject, body_text, body_html, headers, size, is_read, received_at
                   FROM emails WHERE mailbox_id = ?
                   ORDER BY received_at DESC LIMIT ? OFFSET ?`
	rows, err := s.db.QueryContext(ctx, q, mailboxID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("email list: %w", err)
	}
	defer rows.Close()
	emails, err := scanEmails(rows)
	if err != nil {
		return nil, err
	}
	// Load attachment metadata for each email.
	for _, e := range emails {
		e.Attachments, _ = s.loadAttachments(ctx, e.ID)
	}
	return emails, nil
}

func (s *EmailStore) FindByID(ctx context.Context, id string) (*domain.Email, error) {
	const q = `SELECT id, mailbox_id, from_addr, to_addr, subject, body_text, body_html, headers, size, is_read, received_at
                   FROM emails WHERE id = ?`
	row := s.db.QueryRowContext(ctx, q, id)
	e, err := scanEmail(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	e.Attachments, _ = s.loadAttachments(ctx, e.ID)
	return e, nil
}

func (s *EmailStore) MarkRead(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE emails SET is_read = 1 WHERE id = ?`, id)
	return err
}

func (s *EmailStore) Delete(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM emails WHERE id = ?`, id)
	return err
}

func (s *EmailStore) CountByMailbox(ctx context.Context, mailboxID string) (int64, error) {
	var n int64
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM emails WHERE mailbox_id = ?`, mailboxID,
	).Scan(&n)
	return n, err
}

// SaveAttachment stores binary attachment data and returns the metadata record.
func (s *EmailStore) SaveAttachment(ctx context.Context, emailID string, input *domain.AttachmentInput) (*domain.Attachment, error) {
	id := uuid.NewString()
	const q = `INSERT INTO attachments (id, email_id, filename, content_type, size, data)
                   VALUES (?, ?, ?, ?, ?, ?)`
	_, err := s.db.ExecContext(ctx, q,
		id, emailID, input.Filename, input.ContentType, int64(len(input.Data)), input.Data,
	)
	if err != nil {
		return nil, fmt.Errorf("save attachment: %w", err)
	}
	return &domain.Attachment{
		ID:          id,
		EmailID:     emailID,
		Filename:    input.Filename,
		ContentType: input.ContentType,
		Size:        int64(len(input.Data)),
	}, nil
}

// GetAttachment retrieves attachment metadata AND binary data for download.
func (s *EmailStore) GetAttachment(ctx context.Context, attachmentID string) (*domain.AttachmentData, error) {
	const q = `SELECT id, email_id, filename, content_type, size, data FROM attachments WHERE id = ?`
	var a domain.AttachmentData
	err := s.db.QueryRowContext(ctx, q, attachmentID).Scan(
		&a.ID, &a.EmailID, &a.Filename, &a.ContentType, &a.Size, &a.Data,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get attachment: %w", err)
	}
	return &a, nil
}

// loadAttachments fetches attachment metadata (no blob data) for an email.
func (s *EmailStore) loadAttachments(ctx context.Context, emailID string) ([]*domain.Attachment, error) {
	const q = `SELECT id, email_id, filename, content_type, size FROM attachments WHERE email_id = ?`
	rows, err := s.db.QueryContext(ctx, q, emailID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var atts []*domain.Attachment
	for rows.Next() {
		var a domain.Attachment
		if err := rows.Scan(&a.ID, &a.EmailID, &a.Filename, &a.ContentType, &a.Size); err != nil {
			return nil, err
		}
		atts = append(atts, &a)
	}
	return atts, rows.Err()
}

func scanEmails(rows *sql.Rows) ([]*domain.Email, error) {
	var out []*domain.Email
	for rows.Next() {
		e, err := scanEmailRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func scanEmail(row *sql.Row) (*domain.Email, error) {
	var (
		e          domain.Email
		hdrs       string
		receivedAt string
		isRead     int
	)
	err := row.Scan(
		&e.ID, &e.MailboxID, &e.From, &e.To, &e.Subject,
		&e.BodyText, &e.BodyHTML, &hdrs, &e.Size, &isRead, &receivedAt,
	)
	if err != nil {
		return nil, err
	}
	e.IsRead = isRead == 1
	e.ReceivedAt, _ = time.Parse(time.RFC3339Nano, receivedAt)
	_ = json.Unmarshal([]byte(hdrs), &e.Headers)
	return &e, nil
}

func scanEmailRow(rows *sql.Rows) (*domain.Email, error) {
	var (
		e          domain.Email
		hdrs       string
		receivedAt string
		isRead     int
	)
	err := rows.Scan(
		&e.ID, &e.MailboxID, &e.From, &e.To, &e.Subject,
		&e.BodyText, &e.BodyHTML, &hdrs, &e.Size, &isRead, &receivedAt,
	)
	if err != nil {
		return nil, err
	}
	e.IsRead = isRead == 1
	e.ReceivedAt, _ = time.Parse(time.RFC3339Nano, receivedAt)
	_ = json.Unmarshal([]byte(hdrs), &e.Headers)
	return &e, nil
}

// CountAll returns the total number of emails stored across all mailboxes.
func (s *EmailStore) CountAll(ctx context.Context) (int64, error) {
	var n int64
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM emails`).Scan(&n)
	return n, err
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
