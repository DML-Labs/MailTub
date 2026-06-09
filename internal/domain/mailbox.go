// Package domain contains the core business entities and rules for MailTub.
// These types are pure value objects — no framework or infrastructure concerns.
package domain

import (
	"errors"
	"fmt"
	"math/rand"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Mailbox represents a temporary email inbox.
type Mailbox struct {
	ID        string    `json:"id"`
	Address   string    `json:"address"`
	LocalPart string    `json:"localPart"`
	Domain    string    `json:"domain"`
	ExpiresAt time.Time `json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
}

// IsExpired reports whether the mailbox has passed its TTL.
func (m *Mailbox) IsExpired() bool {
	return time.Now().After(m.ExpiresAt)
}

// NewMailbox generates a fresh mailbox with a random human-readable local part.
func NewMailbox(domain string, ttl time.Duration) *Mailbox {
	return NewMailboxWithLocal(generateLocalPart(), domain, ttl)
}

// NewMailboxWithLocal creates a mailbox with the given local part.
// The caller is responsible for validating localPart with ValidateLocalPart first.
func NewMailboxWithLocal(localPart, domain string, ttl time.Duration) *Mailbox {
	local := strings.ToLower(localPart)
	now := time.Now().UTC()
	return &Mailbox{
		ID:        uuid.NewString(),
		LocalPart: local,
		Domain:    domain,
		Address:   local + "@" + domain,
		ExpiresAt: now.Add(ttl),
		CreatedAt: now,
	}
}

// localPartRe matches valid local parts: 3–32 lowercase alphanumeric chars,
// hyphens, and dots. No leading/trailing or consecutive special chars.
var localPartRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9.\-]{1,30})[a-z0-9]$`)

// ErrInvalidLocalPart is returned when a custom local part fails validation.
var ErrInvalidLocalPart = errors.New("invalid local part")

// ValidateLocalPart checks that a custom local part is safe to use.
// Rules: 3–32 chars, lowercase alphanumeric + hyphens + dots,
// no leading/trailing dot/hyphen, no consecutive dot/hyphen.
func ValidateLocalPart(s string) error {
	s = strings.ToLower(strings.TrimSpace(s))
	if len(s) < 3 || len(s) > 32 {
		return fmt.Errorf("%w: must be 3–32 characters", ErrInvalidLocalPart)
	}
	if !localPartRe.MatchString(s) {
		return fmt.Errorf("%w: only lowercase letters, numbers, hyphens and dots allowed (no leading/trailing special chars)", ErrInvalidLocalPart)
	}
	if strings.Contains(s, "..") || strings.Contains(s, "--") || strings.Contains(s, ".-") || strings.Contains(s, "-.") {
		return fmt.Errorf("%w: consecutive special characters not allowed", ErrInvalidLocalPart)
	}
	return nil
}

var adjectives = []string{
	"swift", "bold", "calm", "dark", "fast", "gray", "jade", "keen",
	"loud", "mute", "neon", "oval", "pink", "rare", "sage", "teal",
	"vast", "warm", "xeno", "zany", "blue", "cool", "deep", "epic",
}

var nouns = []string{
	"atom", "base", "byte", "cell", "core", "data", "edge", "flux",
	"gate", "hash", "icon", "key", "link", "mesh", "node", "peak",
	"root", "seed", "star", "tune", "unit", "void", "wave", "wire",
}

// generateLocalPart produces a human-readable random string like "swiftbyte4821".
func generateLocalPart() string {
	adj := adjectives[rand.Intn(len(adjectives))]
	noun := nouns[rand.Intn(len(nouns))]
	num := rand.Intn(9000) + 1000
	return strings.ToLower(fmt.Sprintf("%s%s%d", adj, noun, num))
}
