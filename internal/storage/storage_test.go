package storage

import (
	"context"
	"testing"
	"time"

	"github.com/dml-labs/mailtub/internal/domain"
)

// openTestDB opens an in-memory SQLite database and runs migrations.
func openTestDB(t *testing.T) *DB {
	t.Helper()
	db, err := Open(":memory:")
	if err != nil {
		t.Fatalf("openTestDB: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func newTestMailbox(localPart string) *domain.Mailbox {
	return domain.NewMailboxWithLocal(localPart, "test.local", 24*time.Hour)
}

// ── Mailbox store ──────────────────────────────────────────────────────────

func TestMailboxStore_CreateAndFind(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()

	mb := newTestMailbox("testuser")
	if err := db.Mailboxes.Create(ctx, mb); err != nil {
		t.Fatalf("Create: %v", err)
	}

	found, err := db.Mailboxes.FindByAddress(ctx, mb.Address)
	if err != nil {
		t.Fatalf("FindByAddress: %v", err)
	}
	if found == nil {
		t.Fatal("expected mailbox, got nil")
	}
	if found.ID != mb.ID {
		t.Errorf("ID = %q, want %q", found.ID, mb.ID)
	}
	if found.Address != mb.Address {
		t.Errorf("Address = %q, want %q", found.Address, mb.Address)
	}
}

func TestMailboxStore_FindByAddress_notFound(t *testing.T) {
	db := openTestDB(t)
	mb, err := db.Mailboxes.FindByAddress(context.Background(), "nobody@test.local")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mb != nil {
		t.Errorf("expected nil, got %+v", mb)
	}
}

func TestMailboxStore_Delete(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()

	mb := newTestMailbox("deletetest")
	_ = db.Mailboxes.Create(ctx, mb)
	if err := db.Mailboxes.Delete(ctx, mb.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	found, _ := db.Mailboxes.FindByAddress(ctx, mb.Address)
	if found != nil {
		t.Error("expected mailbox to be deleted")
	}
}

func TestMailboxStore_DeleteExpired(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()

	// Create an already-expired mailbox.
	mb := &domain.Mailbox{
		ID:        "exp-id",
		Address:   "expired@test.local",
		LocalPart: "expired",
		Domain:    "test.local",
		ExpiresAt: time.Now().Add(-time.Second),
		CreatedAt: time.Now().Add(-time.Hour),
	}
	_ = db.Mailboxes.Create(ctx, mb)

	// Create a non-expired mailbox.
	alive := newTestMailbox("alive")
	_ = db.Mailboxes.Create(ctx, alive)

	n, err := db.Mailboxes.DeleteExpired(ctx)
	if err != nil {
		t.Fatalf("DeleteExpired: %v", err)
	}
	if n != 1 {
		t.Errorf("deleted %d, want 1", n)
	}

	// alive should still exist.
	found, _ := db.Mailboxes.FindByAddress(ctx, alive.Address)
	if found == nil {
		t.Error("alive mailbox was unexpectedly deleted")
	}
}

func TestMailboxStore_CountAll(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()

	for _, lp := range []string{"aa", "bb", "cc"} {
		_ = db.Mailboxes.Create(ctx, newTestMailbox(lp))
	}
	n, err := db.Mailboxes.CountAll(ctx)
	if err != nil {
		t.Fatalf("CountAll: %v", err)
	}
	if n != 3 {
		t.Errorf("count = %d, want 3", n)
	}
}

// ── Email store ────────────────────────────────────────────────────────────

func TestEmailStore_SaveAndList(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()

	mb := newTestMailbox("emailowner")
	_ = db.Mailboxes.Create(ctx, mb)

	e := &domain.Email{
		ID:         "email-001",
		MailboxID:  mb.ID,
		From:       "sender@example.com",
		To:         mb.Address,
		Subject:    "Test email",
		BodyText:   "Hello",
		ReceivedAt: time.Now(),
	}
	if err := db.Emails.Save(ctx, e); err != nil {
		t.Fatalf("Save: %v", err)
	}

	list, err := db.Emails.ListByMailbox(ctx, mb.ID, 10, 0)
	if err != nil {
		t.Fatalf("ListByMailbox: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("got %d emails, want 1", len(list))
	}
	if list[0].Subject != "Test email" {
		t.Errorf("Subject = %q", list[0].Subject)
	}
}

func TestEmailStore_MarkRead(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()

	mb := newTestMailbox("readtest")
	_ = db.Mailboxes.Create(ctx, mb)

	e := &domain.Email{
		ID: "read-001", MailboxID: mb.ID,
		From: "a@b.com", To: mb.Address, Subject: "Unread",
		ReceivedAt: time.Now(),
	}
	_ = db.Emails.Save(ctx, e)

	if err := db.Emails.MarkRead(ctx, "read-001"); err != nil {
		t.Fatalf("MarkRead: %v", err)
	}

	found, err := db.Emails.FindByID(ctx, "read-001")
	if err != nil {
		t.Fatalf("FindByID: %v", err)
	}
	if !found.IsRead {
		t.Error("expected email to be marked as read")
	}
}

func TestEmailStore_Delete(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()

	mb := newTestMailbox("deltest")
	_ = db.Mailboxes.Create(ctx, mb)

	e := &domain.Email{
		ID: "del-001", MailboxID: mb.ID,
		From: "x@y.com", To: mb.Address, Subject: "Delete me",
		ReceivedAt: time.Now(),
	}
	_ = db.Emails.Save(ctx, e)
	_ = db.Emails.Delete(ctx, "del-001")

	found, err := db.Emails.FindByID(ctx, "del-001")
	if err != nil {
		t.Fatalf("FindByID after delete: %v", err)
	}
	if found != nil {
		t.Error("expected email to be deleted")
	}
}

func TestEmailStore_CountByMailbox(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()

	mb := newTestMailbox("countme")
	_ = db.Mailboxes.Create(ctx, mb)

	for i, subj := range []string{"a", "b", "c"} {
		_ = db.Emails.Save(ctx, &domain.Email{
			ID:         "cnt-00" + subj,
			MailboxID:  mb.ID,
			From:       "x@y.com",
			To:         mb.Address,
			Subject:    subj,
			ReceivedAt: time.Now().Add(time.Duration(i) * time.Second),
		})
	}

	n, err := db.Emails.CountByMailbox(ctx, mb.ID)
	if err != nil {
		t.Fatalf("CountByMailbox: %v", err)
	}
	if n != 3 {
		t.Errorf("count = %d, want 3", n)
	}
}
