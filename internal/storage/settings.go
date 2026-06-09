package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// Setting key constants.
const KeyAdminPasswordHash = "admin_password_hash"

// SettingsStore is a simple key-value store backed by the settings table.
type SettingsStore struct{ db *sql.DB }

// Get retrieves a setting by key. Returns ("", false, nil) when the key does not exist.
func (s *SettingsStore) Get(ctx context.Context, key string) (string, bool, error) {
	var value string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("settings get %q: %w", key, err)
	}
	return value, true, nil
}

// Set inserts or replaces a setting.
func (s *SettingsStore) Set(ctx context.Context, key, value string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO settings (key, value) VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		key, value)
	if err != nil {
		return fmt.Errorf("settings set %q: %w", key, err)
	}
	return nil
}
