package domain

import (
	"strings"
	"testing"
	"time"
)

// ── ValidateLocalPart ──────────────────────────────────────────────────────

func TestValidateLocalPart_valid(t *testing.T) {
	cases := []string{
		"abc",
		"hello",
		"hello-world",
		"foo.bar",
		"test123",
		"a1b2c3d4",
		"my-address",
		"user.name",
		"ab1",
		strings.Repeat("a", 32),
	}
	for _, tc := range cases {
		t.Run(tc, func(t *testing.T) {
			if err := ValidateLocalPart(tc); err != nil {
				t.Errorf("expected valid, got error: %v", err)
			}
		})
	}
}

func TestValidateLocalPart_invalid(t *testing.T) {
	cases := []struct {
		input string
		desc  string
	}{
		{"ab", "too short (2 chars)"},
		{strings.Repeat("a", 33), "too long (33 chars)"},
		{"-hello", "leading hyphen"},
		{"hello-", "trailing hyphen"},
		{".hello", "leading dot"},
		{"hello.", "trailing dot"},
		{"hello..world", "consecutive dots"},
		{"hello--world", "consecutive hyphens"},
		{"hello.-world", "dot-hyphen"},
		{"hello world", "space"},
		{"hello@world", "at sign"},
	}
	for _, tc := range cases {
		t.Run(tc.desc, func(t *testing.T) {
			if err := ValidateLocalPart(tc.input); err == nil {
				t.Errorf("expected error for %q, got nil", tc.input)
			}
		})
	}
}

// ── NewMailbox ─────────────────────────────────────────────────────────────

func TestNewMailbox_fields(t *testing.T) {
	const domain = "example.com"
	ttl := 24 * time.Hour
	mb := NewMailbox(domain, ttl)

	if mb.ID == "" {
		t.Error("ID should not be empty")
	}
	if mb.Domain != domain {
		t.Errorf("domain = %q, want %q", mb.Domain, domain)
	}
	if mb.Address != mb.LocalPart+"@"+domain {
		t.Errorf("address = %q, want %q@%q", mb.Address, mb.LocalPart, domain)
	}
	if mb.ExpiresAt.Before(mb.CreatedAt) {
		t.Error("ExpiresAt should be after CreatedAt")
	}
	diff := mb.ExpiresAt.Sub(mb.CreatedAt)
	if diff < ttl-time.Second || diff > ttl+time.Second {
		t.Errorf("TTL diff = %v, want ~%v", diff, ttl)
	}
}

func TestNewMailboxWithLocal_lowercases(t *testing.T) {
	mb := NewMailboxWithLocal("HelloWorld", "test.com", time.Hour)
	if mb.LocalPart != "helloworld" {
		t.Errorf("local part not lowercased: %q", mb.LocalPart)
	}
}

// ── IsExpired ──────────────────────────────────────────────────────────────

func TestIsExpired(t *testing.T) {
	mb := &Mailbox{ExpiresAt: time.Now().Add(-time.Second)}
	if !mb.IsExpired() {
		t.Error("expected expired")
	}
	mb.ExpiresAt = time.Now().Add(time.Hour)
	if mb.IsExpired() {
		t.Error("expected not expired")
	}
}

// ── Snippet ────────────────────────────────────────────────────────────────

func TestSnippet_plainText(t *testing.T) {
	e := &Email{BodyText: "Hello, world!"}
	got := e.Snippet()
	if got != "Hello, world!" {
		t.Errorf("snippet = %q", got)
	}
}

func TestSnippet_truncates(t *testing.T) {
	body := strings.Repeat("a", 200)
	e := &Email{BodyText: body}
	got := e.Snippet()
	if len([]rune(got)) > 165 { // 160 + "…" (multi-byte)
		t.Errorf("snippet too long: %d chars", len(got))
	}
	if !strings.HasSuffix(got, "…") {
		t.Errorf("expected ellipsis suffix, got %q", got[len(got)-4:])
	}
}

func TestSnippet_fallbackToHTML(t *testing.T) {
	e := &Email{BodyText: "", BodyHTML: "<b>bold</b>"}
	got := e.Snippet()
	if got != "<b>bold</b>" {
		t.Errorf("snippet = %q, want HTML body", got)
	}
}
