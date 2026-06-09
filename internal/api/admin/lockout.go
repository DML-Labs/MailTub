package admin

import (
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"
)

const (
	maxAttempts     = 5
	lockoutDuration = 15 * time.Minute
)

type ipEntry struct {
	attempts int
	lockedAt time.Time
}

// Lockout tracks failed login attempts per IP and enforces temporary bans.
type Lockout struct {
	mu      sync.Mutex
	entries map[string]*ipEntry
}

func newLockout() *Lockout {
	return &Lockout{entries: make(map[string]*ipEntry)}
}

// IsLocked returns true if the IP is currently locked, plus remaining duration.
func (l *Lockout) IsLocked(ip string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	e, ok := l.entries[ip]
	if !ok || e.attempts < maxAttempts {
		return false, 0
	}
	remaining := lockoutDuration - time.Since(e.lockedAt)
	if remaining <= 0 {
		delete(l.entries, ip)
		return false, 0
	}
	return true, remaining
}

// Record marks a failed attempt for the IP.
func (l *Lockout) Record(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	e, ok := l.entries[ip]
	if !ok {
		e = &ipEntry{}
		l.entries[ip] = e
	}
	e.attempts++
	if e.attempts >= maxAttempts {
		e.lockedAt = time.Now()
	}
}

// Reset clears the failed-attempt count on successful login.
func (l *Lockout) Reset(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.entries, ip)
}

// Attempts returns the current failure count for an IP (for error messages).
func (l *Lockout) Attempts(ip string) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	if e, ok := l.entries[ip]; ok {
		return e.attempts
	}
	return 0
}

// remoteIP extracts a stable IP from a request, honouring X-Forwarded-For / X-Real-IP.
func remoteIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if ip, _, err := net.SplitHostPort(xff); err == nil {
			return ip
		}
		return xff
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// LockoutError formats a human-readable lockout message.
func LockoutError(remaining time.Duration) string {
	mins := int(remaining.Minutes()) + 1
	return fmt.Sprintf("Too many failed attempts. Try again in %d minute(s).", mins)
}
