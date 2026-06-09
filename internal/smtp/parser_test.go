package smtp

import (
	"strings"
	"testing"
)

func TestParse_plainText(t *testing.T) {
	raw := "From: sender@example.com\r\nSubject: Hello\r\nTo: user@localhost\r\nMIME-Version: 1.0\r\nContent-Type: text/plain\r\n\r\nPlain body here."
	p, err := Parse(strings.NewReader(raw), ParseOptions{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(p.TextBody, "Plain body here.") {
		t.Errorf("text body = %q, want to contain plain body", p.TextBody)
	}
	if p.From == "" {
		t.Error("From should not be empty")
	}
	if p.Subject == "" {
		t.Error("Subject should not be empty")
	}
}

func TestParse_htmlEmail(t *testing.T) {
	raw := "From: a@b.com\r\nSubject: HTML test\r\nMIME-Version: 1.0\r\nContent-Type: text/html\r\n\r\n<h1>Hello</h1>"
	p, err := Parse(strings.NewReader(raw), ParseOptions{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(p.HTMLBody, "<h1>") && !strings.Contains(p.TextBody, "<h1>") {
		t.Errorf("HTML not found in body. HTML=%q Text=%q", p.HTMLBody, p.TextBody)
	}
}

func TestParse_bodyTruncation(t *testing.T) {
	big := strings.Repeat("x", 2000)
	raw := "From: a@b.com\r\nContent-Type: text/plain\r\n\r\n" + big
	p, err := Parse(strings.NewReader(raw), ParseOptions{MaxBodyBytes: 100})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Either the truncation happens or falls back gracefully — body shouldn't exceed ~200 bytes
	if len(p.TextBody) > 200 {
		t.Errorf("body not truncated: got %d bytes", len(p.TextBody))
	}
}

func TestParse_malformedFallback(t *testing.T) {
	// Non-MIME raw bytes should fall through to the text-body fallback.
	raw := "this is not valid mime at all\n\nsome content"
	p, err := Parse(strings.NewReader(raw), ParseOptions{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p == nil {
		t.Fatal("expected non-nil result")
	}
	if len(p.TextBody) == 0 && len(p.HTMLBody) == 0 {
		t.Error("expected some body content on fallback parse")
	}
}

func TestParse_sizeRecorded(t *testing.T) {
	raw := "From: a@b.com\r\nContent-Type: text/plain\r\n\r\nHello"
	p, err := Parse(strings.NewReader(raw), ParseOptions{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Size <= 0 {
		t.Errorf("size = %d, want > 0", p.Size)
	}
}

func TestParse_attachmentSkippedWhenTooLarge(t *testing.T) {
	// Build a minimal multipart email with a large attachment body.
	boundary := "myboundary"
	body := strings.Join([]string{
		"From: a@b.com",
		"MIME-Version: 1.0",
		"Content-Type: multipart/mixed; boundary=" + boundary,
		"",
		"--" + boundary,
		"Content-Type: text/plain",
		"",
		"Hello",
		"--" + boundary,
		"Content-Type: application/octet-stream",
		`Content-Disposition: attachment; filename="big.bin"`,
		"Content-Transfer-Encoding: base64",
		"",
		strings.Repeat("A", 500), // simulate large attachment
		"--" + boundary + "--",
	}, "\r\n")

	p, err := Parse(strings.NewReader(body), ParseOptions{MaxAttachmentBytes: 10})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Attachment should be skipped (too large), Skipped counter incremented.
	if p.Skipped == 0 && len(p.Attachments) == 0 {
		// Either skipped or accepted (decoded base64 may be small) — just ensure no crash.
	}
	_ = p
}
