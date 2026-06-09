// Package ratelimit provides a simple per-IP fixed-window rate limiter
// with no external dependencies.
package ratelimit

import (
	"net"
	"net/http"
	"sync"
	"time"
)

type bucket struct {
	count   int
	resetAt time.Time
}

// IPLimiter is a per-IP fixed-window rate limiter.
type IPLimiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	limit   int
	window  time.Duration
}

// New creates a limiter allowing up to limit requests per window per IP.
func New(limit int, window time.Duration) *IPLimiter {
	l := &IPLimiter{
		buckets: make(map[string]*bucket),
		limit:   limit,
		window:  window,
	}
	go l.cleanup()
	return l
}

// Allow returns true if the IP is within its rate limit.
func (l *IPLimiter) Allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	b, ok := l.buckets[ip]
	if !ok || now.After(b.resetAt) {
		l.buckets[ip] = &bucket{count: 1, resetAt: now.Add(l.window)}
		return true
	}
	if b.count >= l.limit {
		return false
	}
	b.count++
	return true
}

// Middleware returns an http.Handler middleware that rate-limits by real IP.
func (l *IPLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := realIP(r)
		if !l.Allow(ip) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "3600")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":"rate limit exceeded — too many mailboxes created from this IP"}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// cleanup periodically removes expired buckets to prevent memory growth.
func (l *IPLimiter) cleanup() {
	t := time.NewTicker(10 * time.Minute)
	defer t.Stop()
	for range t.C {
		l.mu.Lock()
		now := time.Now()
		for ip, b := range l.buckets {
			if now.After(b.resetAt) {
				delete(l.buckets, ip)
			}
		}
		l.mu.Unlock()
	}
}

func realIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		for i, c := range forwarded {
			if c == ',' {
				return forwarded[:i]
			}
		}
		return forwarded
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
