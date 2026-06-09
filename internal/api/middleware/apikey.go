// Package middleware provides shared HTTP middleware for MailTub's REST API.
package middleware

import (
	"net/http"
)

// APIKeyAuth returns middleware that enforces X-API-Key header authentication.
// If apiKey is empty the middleware is a no-op (authentication is disabled).
// The /api/v1/health endpoint is always allowed through without a key.
func APIKeyAuth(apiKey string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		// No key configured → no-op passthrough.
		if apiKey == "" {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Always allow health and public config so monitoring + UI work without a key.
			if r.URL.Path == "/api/v1/health" || r.URL.Path == "/api/v1/config" {
				next.ServeHTTP(w, r)
				return
			}
			key := r.Header.Get("X-API-Key")
			if key == "" {
				key = r.URL.Query().Get("api_key")
			}
			if key != apiKey {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte(`{"error":"missing or invalid X-API-Key"}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
