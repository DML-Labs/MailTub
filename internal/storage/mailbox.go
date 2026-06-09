package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/dml-labs/mailtub/internal/domain"
)

// MailboxStore is the SQLite implementation of domain.MailboxRepository.
type MailboxStore struct{ db *sql.DB }

func (s *MailboxStore) Create(ctx context.Context, m *domain.Mailbox) error {
	const q = `INSERT INTO mailboxes (id, address, local_part, domain, expires_at, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)`
	_, err := s.db.ExecContext(ctx, q,
		m.ID, m.Address, m.LocalPart, m.Domain,
		m.ExpiresAt.UTC().Format(time.RFC3339Nano),
		m.CreatedAt.UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		return fmt.Errorf("mailbox create: %w", err)
	}
	return nil
}

func (s *MailboxStore) FindByAddress(ctx context.Context, address string) (*domain.Mailbox, error) {
	const q = `SELECT id, address, local_part, domain, expires_at, created_at
                   FROM mailboxes WHERE address = ?`
	row := s.db.QueryRowContext(ctx, q, address)
	return scanMailbox(row)
}

func (s *MailboxStore) FindByID(ctx context.Context, id string) (*domain.Mailbox, error) {
	const q = `SELECT id, address, local_part, domain, expires_at, created_at
                   FROM mailboxes WHERE id = ?`
	row := s.db.QueryRowContext(ctx, q, id)
	return scanMailbox(row)
}

func (s *MailboxStore) Delete(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM mailboxes WHERE id = ?`, id)
	return err
}

func (s *MailboxStore) DeleteExpired(ctx context.Context) (int64, error) {
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM mailboxes WHERE expires_at < ?`,
		time.Now().UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// ListAll returns all mailboxes ordered by creation date descending.
func (s *MailboxStore) ListAll(ctx context.Context, limit, offset int) ([]*domain.Mailbox, error) {
	const q = `SELECT id, address, local_part, domain, expires_at, created_at
                   FROM mailboxes ORDER BY created_at DESC LIMIT ? OFFSET ?`
	rows, err := s.db.QueryContext(ctx, q, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("mailbox list all: %w", err)
	}
	defer rows.Close()
	var out []*domain.Mailbox
	for rows.Next() {
		var m domain.Mailbox
		var expiresAt, createdAt string
		if err := rows.Scan(&m.ID, &m.Address, &m.LocalPart, &m.Domain, &expiresAt, &createdAt); err != nil {
			return nil, fmt.Errorf("mailbox scan row: %w", err)
		}
		m.ExpiresAt, _ = time.Parse(time.RFC3339Nano, expiresAt)
		m.CreatedAt, _ = time.Parse(time.RFC3339Nano, createdAt)
		out = append(out, &m)
	}
	return out, rows.Err()
}

// CountAll returns the total number of mailboxes in the database.
func (s *MailboxStore) CountAll(ctx context.Context) (int64, error) {
	var n int64
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM mailboxes`).Scan(&n)
	return n, err
}

func scanMailbox(row *sql.Row) (*domain.Mailbox, error) {
	var m domain.Mailbox
	var expiresAt, createdAt string
	err := row.Scan(&m.ID, &m.Address, &m.LocalPart, &m.Domain, &expiresAt, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("mailbox scan: %w", err)
	}
	m.ExpiresAt, _ = time.Parse(time.RFC3339Nano, expiresAt)
	m.CreatedAt, _ = time.Parse(time.RFC3339Nano, createdAt)
	return &m, nil
}
