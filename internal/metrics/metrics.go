// Package metrics exposes Prometheus counters and gauges for MailTub.
// All metrics are registered on the default Prometheus registry so that
// the /metrics HTTP endpoint served by promhttp.Handler() picks them up.
package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// MailboxesCreated counts successful mailbox creations.
	MailboxesCreated = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "mailtub_mailboxes_created_total",
			Help: "Total number of mailboxes successfully created.",
		},
		[]string{"domain"},
	)

	// MailboxesDeleted counts mailbox deletions (manual + expiry purge).
	MailboxesDeleted = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "mailtub_mailboxes_deleted_total",
			Help: "Total number of mailboxes deleted.",
		},
		[]string{"domain", "reason"}, // reason: "manual" | "purge"
	)

	// EmailsReceived counts emails received over SMTP.
	EmailsReceived = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "mailtub_emails_received_total",
			Help: "Total number of emails received via SMTP.",
		},
		[]string{"domain"},
	)

	// EmailsDeleted counts emails deleted by users.
	EmailsDeleted = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "mailtub_emails_deleted_total",
			Help: "Total number of emails deleted.",
		},
		[]string{"domain"},
	)

	// ActiveWSConnections tracks the current number of open WebSocket connections.
	ActiveWSConnections = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "mailtub_ws_connections_active",
			Help: "Current number of active WebSocket connections.",
		},
	)

	// SMTPConnections counts total SMTP connections accepted.
	SMTPConnections = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "mailtub_smtp_connections_total",
			Help: "Total number of SMTP connections accepted.",
		},
		[]string{"tls"},
	)

	// HTTPRequests counts HTTP requests by method, path prefix, and status code.
	HTTPRequests = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "mailtub_http_requests_total",
			Help: "Total number of HTTP requests served.",
		},
		[]string{"method", "route", "status"},
	)

	// HTTPDuration tracks HTTP request latency.
	HTTPDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "mailtub_http_request_duration_seconds",
			Help:    "HTTP request latency in seconds.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "route"},
	)

	// RateLimitHits counts rate-limited requests.
	RateLimitHits = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "mailtub_ratelimit_hits_total",
			Help: "Total number of requests rejected by the rate limiter.",
		},
		[]string{"ip"},
	)
)
