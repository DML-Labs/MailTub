package admin

import (
	"testing"
	"time"
)

// ── IsLocked ───────────────────────────────────────────────────────────────

func TestLockout_notLockedInitially(t *testing.T) {
	l := newLockout()
	locked, _ := l.IsLocked("1.2.3.4")
	if locked {
		t.Error("new IP should not be locked")
	}
}

func TestLockout_notLockedBelowThreshold(t *testing.T) {
	l := newLockout()
	for i := 0; i < maxAttempts-1; i++ {
		l.Record("10.0.0.1")
	}
	locked, _ := l.IsLocked("10.0.0.1")
	if locked {
		t.Errorf("should not be locked after %d attempts (threshold is %d)", maxAttempts-1, maxAttempts)
	}
}

func TestLockout_lockedAtThreshold(t *testing.T) {
	l := newLockout()
	for i := 0; i < maxAttempts; i++ {
		l.Record("10.0.0.2")
	}
	locked, remaining := l.IsLocked("10.0.0.2")
	if !locked {
		t.Error("should be locked after maxAttempts failures")
	}
	if remaining <= 0 {
		t.Errorf("remaining lockout duration should be positive, got %v", remaining)
	}
}

// ── Attempts ───────────────────────────────────────────────────────────────

func TestLockout_attemptsCounter(t *testing.T) {
	l := newLockout()
	if l.Attempts("5.5.5.5") != 0 {
		t.Error("unknown IP should have 0 attempts")
	}
	l.Record("5.5.5.5")
	l.Record("5.5.5.5")
	if got := l.Attempts("5.5.5.5"); got != 2 {
		t.Errorf("Attempts = %d, want 2", got)
	}
}

// ── Reset ──────────────────────────────────────────────────────────────────

func TestLockout_resetClearsLock(t *testing.T) {
	l := newLockout()
	for i := 0; i < maxAttempts; i++ {
		l.Record("7.7.7.7")
	}
	locked, _ := l.IsLocked("7.7.7.7")
	if !locked {
		t.Fatal("should be locked before reset")
	}

	l.Reset("7.7.7.7")

	locked, _ = l.IsLocked("7.7.7.7")
	if locked {
		t.Error("should not be locked after Reset")
	}
	if l.Attempts("7.7.7.7") != 0 {
		t.Error("Attempts should be 0 after Reset")
	}
}

func TestLockout_resetOnUnknownIPIsNoop(t *testing.T) {
	l := newLockout()
	l.Reset("unknown.ip") // should not panic
}

// ── Expiry ─────────────────────────────────────────────────────────────────

func TestLockout_lockExpires(t *testing.T) {
	// Override lockoutDuration for this test by manipulating the entry directly.
	l := newLockout()
	for i := 0; i < maxAttempts; i++ {
		l.Record("9.9.9.9")
	}

	// Backdate the lockedAt time so the lockout window appears expired.
	l.mu.Lock()
	l.entries["9.9.9.9"].lockedAt = time.Now().Add(-lockoutDuration - time.Second)
	l.mu.Unlock()

	locked, _ := l.IsLocked("9.9.9.9")
	if locked {
		t.Error("lock should have expired")
	}
	// After expiry check, the entry should be removed.
	if l.Attempts("9.9.9.9") != 0 {
		t.Error("expired entry should be removed")
	}
}

// ── Independent IPs ────────────────────────────────────────────────────────

func TestLockout_differentIPsAreIndependent(t *testing.T) {
	l := newLockout()
	for i := 0; i < maxAttempts; i++ {
		l.Record("a.a.a.a")
	}
	locked, _ := l.IsLocked("a.a.a.a")
	if !locked {
		t.Fatal("a.a.a.a should be locked")
	}
	locked, _ = l.IsLocked("b.b.b.b")
	if locked {
		t.Error("b.b.b.b should not be affected")
	}
}

// ── LockoutError ───────────────────────────────────────────────────────────

func TestLockoutError_containsMinutes(t *testing.T) {
	msg := LockoutError(14 * time.Minute)
	if msg == "" {
		t.Error("LockoutError should return non-empty message")
	}
	// Should mention at least "minute" or a number
	for _, want := range []string{"minute", "15"} {
		found := false
		for i := 0; i <= len(msg)-len(want); i++ {
			if msg[i:i+len(want)] == want {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("LockoutError(%v) = %q, expected to contain %q", 14*time.Minute, msg, want)
		}
	}
}
