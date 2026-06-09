package ratelimit

import (
	"testing"
	"time"
)

func TestAllow_withinLimit(t *testing.T) {
	l := &IPLimiter{
		buckets: make(map[string]*bucket),
		limit:   5,
		window:  time.Minute,
	}
	for i := 0; i < 5; i++ {
		if !l.Allow("1.2.3.4") {
			t.Errorf("call %d should be allowed", i+1)
		}
	}
}

func TestAllow_exceedsLimit(t *testing.T) {
	l := &IPLimiter{
		buckets: make(map[string]*bucket),
		limit:   3,
		window:  time.Minute,
	}
	for i := 0; i < 3; i++ {
		l.Allow("10.0.0.1")
	}
	if l.Allow("10.0.0.1") {
		t.Error("4th call should be blocked")
	}
}

func TestAllow_differentIPsAreIndependent(t *testing.T) {
	l := &IPLimiter{
		buckets: make(map[string]*bucket),
		limit:   1,
		window:  time.Minute,
	}
	if !l.Allow("192.168.1.1") {
		t.Error("first IP first call should be allowed")
	}
	if !l.Allow("192.168.1.2") {
		t.Error("second IP first call should be allowed")
	}
	if l.Allow("192.168.1.1") {
		t.Error("first IP second call should be blocked")
	}
}

func TestAllow_windowReset(t *testing.T) {
	l := &IPLimiter{
		buckets: make(map[string]*bucket),
		limit:   2,
		window:  10 * time.Millisecond,
	}
	l.Allow("5.5.5.5")
	l.Allow("5.5.5.5")
	if l.Allow("5.5.5.5") {
		t.Error("should be blocked before window expires")
	}
	time.Sleep(20 * time.Millisecond)
	if !l.Allow("5.5.5.5") {
		t.Error("should be allowed after window reset")
	}
}

func TestAllow_zeroCountAfterReset(t *testing.T) {
	l := &IPLimiter{
		buckets: make(map[string]*bucket),
		limit:   1,
		window:  5 * time.Millisecond,
	}
	l.Allow("7.7.7.7")
	time.Sleep(10 * time.Millisecond)
	// After reset, the bucket count should start at 1 again.
	if !l.Allow("7.7.7.7") {
		t.Error("first call after window reset should succeed")
	}
	if l.Allow("7.7.7.7") {
		t.Error("second call in new window should fail (limit=1)")
	}
}
