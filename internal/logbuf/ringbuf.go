// Package logbuf provides a fixed-size in-memory ring buffer for log entries,
// together with a slog.Handler that captures records into that buffer while
// also delegating to an inner handler (e.g. the JSON stdout handler).
package logbuf

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

// Entry is a single captured log record.
type Entry struct {
	Time  time.Time      `json:"time"`
	Level string         `json:"level"`
	Msg   string         `json:"msg"`
	Attrs map[string]any `json:"attrs,omitempty"`
}

// RingBuffer is a thread-safe circular buffer of log entries.
type RingBuffer struct {
	mu    sync.RWMutex
	buf   []Entry
	cap   int
	head  int // next write position
	count int // how many entries are valid
}

// New creates a RingBuffer that stores at most cap entries.
func New(cap int) *RingBuffer {
	if cap <= 0 {
		cap = 500
	}
	return &RingBuffer{buf: make([]Entry, cap), cap: cap}
}

// add appends an entry, overwriting the oldest if full.
func (rb *RingBuffer) add(e Entry) {
	rb.mu.Lock()
	rb.buf[rb.head] = e
	rb.head = (rb.head + 1) % rb.cap
	if rb.count < rb.cap {
		rb.count++
	}
	rb.mu.Unlock()
}

// All returns all entries in chronological order (oldest → newest).
func (rb *RingBuffer) All() []Entry {
	rb.mu.RLock()
	defer rb.mu.RUnlock()
	if rb.count == 0 {
		return nil
	}
	out := make([]Entry, rb.count)
	start := (rb.head - rb.count + rb.cap) % rb.cap
	for i := 0; i < rb.count; i++ {
		out[i] = rb.buf[(start+i)%rb.cap]
	}
	return out
}

// Last returns up to n most-recent entries.
func (rb *RingBuffer) Last(n int) []Entry {
	all := rb.All()
	if n >= len(all) {
		return all
	}
	return all[len(all)-n:]
}

// ── slog.Handler integration ──────────────────────────────────────────────

// Handler is a slog.Handler that captures records into a RingBuffer
// while delegating every call to an inner handler.
type Handler struct {
	ring  *RingBuffer
	inner slog.Handler
	group string
	attrs []slog.Attr
}

// NewHandler wraps inner with a RingBuffer capture layer.
func NewHandler(ring *RingBuffer, inner slog.Handler) slog.Handler {
	return &Handler{ring: ring, inner: inner}
}

func (h *Handler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.inner.Enabled(ctx, level)
}

func (h *Handler) Handle(ctx context.Context, r slog.Record) error {
	attrs := make(map[string]any, r.NumAttrs()+len(h.attrs))
	for _, a := range h.attrs {
		attrs[a.Key] = a.Value.Any()
	}
	r.Attrs(func(a slog.Attr) bool {
		key := a.Key
		if h.group != "" {
			key = h.group + "." + key
		}
		attrs[key] = a.Value.Any()
		return true
	})
	if len(attrs) == 0 {
		attrs = nil
	}
	h.ring.add(Entry{
		Time:  r.Time,
		Level: r.Level.String(),
		Msg:   r.Message,
		Attrs: attrs,
	})
	return h.inner.Handle(ctx, r)
}

func (h *Handler) WithAttrs(attrs []slog.Attr) slog.Handler {
	merged := make([]slog.Attr, 0, len(h.attrs)+len(attrs))
	merged = append(merged, h.attrs...)
	merged = append(merged, attrs...)
	return &Handler{ring: h.ring, inner: h.inner.WithAttrs(attrs), group: h.group, attrs: merged}
}

func (h *Handler) WithGroup(name string) slog.Handler {
	return &Handler{ring: h.ring, inner: h.inner.WithGroup(name), group: name, attrs: h.attrs}
}
