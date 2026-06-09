// Package storage implements SQLite-backed repositories for MailTub.
// It uses modernc.org/sqlite — a pure-Go SQLite driver with no CGO dependency —
// so the binary stays truly self-contained on every platform.
package storage

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

const schema = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS mailboxes (
    id         TEXT PRIMARY KEY,
    address    TEXT UNIQUE NOT NULL,
    local_part TEXT NOT NULL,
    domain     TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mailboxes_address    ON mailboxes(address);
CREATE INDEX IF NOT EXISTS idx_mailboxes_expires_at ON mailboxes(expires_at);

CREATE TABLE IF NOT EXISTS emails (
    id          TEXT PRIMARY KEY,
    mailbox_id  TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    from_addr   TEXT NOT NULL,
    to_addr     TEXT NOT NULL,
    subject     TEXT NOT NULL DEFAULT '',
    body_text   TEXT NOT NULL DEFAULT '',
    body_html   TEXT NOT NULL DEFAULT '',
    headers     TEXT NOT NULL DEFAULT '{}',
    size        INTEGER NOT NULL DEFAULT 0,
    is_read     INTEGER NOT NULL DEFAULT 0,
    received_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_emails_mailbox_id  ON emails(mailbox_id);
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at);

CREATE TABLE IF NOT EXISTS attachments (
    id           TEXT PRIMARY KEY,
    email_id     TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    filename     TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    size         INTEGER NOT NULL DEFAULT 0,
    data         BLOB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
`

// DB wraps *sql.DB and exposes the two repositories.
type DB struct {
	sql       *sql.DB
	Mailboxes *MailboxStore
	Emails    *EmailStore
	Settings  *SettingsStore
}

// Open opens (or creates) the SQLite database at path and runs migrations.
func Open(path string) (*DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("storage: create data dir: %w", err)
	}

	sqldb, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("storage: open sqlite: %w", err)
	}

	// Single writer, multiple readers — keep one connection for writes.
	sqldb.SetMaxOpenConns(1)

	if _, err := sqldb.ExecContext(context.Background(), schema); err != nil {
		return nil, fmt.Errorf("storage: migrate: %w", err)
	}

	db := &DB{sql: sqldb}
	db.Mailboxes = &MailboxStore{db: sqldb}
	db.Emails = &EmailStore{db: sqldb}
	db.Settings = &SettingsStore{db: sqldb}
	return db, nil
}

// Close releases the database connection.
func (db *DB) Close() error { return db.sql.Close() }
