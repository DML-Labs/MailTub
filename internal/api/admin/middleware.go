// Package admin implements the MailTub admin panel: bcrypt login verification,
// HMAC-signed session cookies, brute-force lockout, and REST handlers.
package admin

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	cookieName = "mailtub_admin"
	cookieTTL  = 24 * time.Hour
)

// isHTTPS returns true when the request arrived over a TLS connection,
// either directly or through a TLS-terminating proxy.
func isHTTPS(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	if proto := r.Header.Get("X-Forwarded-Proto"); strings.EqualFold(proto, "https") {
		return true
	}
	return false
}

// adminKey derives a stable HMAC signing key from the active admin hash.
// Using SHA-256 of the bcrypt hash string means old cookies are automatically
// invalidated whenever the password changes (the hash changes → key changes).
func adminKey(hashStr string) []byte {
	h := sha256.Sum256([]byte(hashStr))
	return h[:]
}

// makeToken creates a "{unix_ts}.{hmac_hex}" session token.
func makeToken(hashStr string) string {
	ts := time.Now().Unix()
	key := adminKey(hashStr)
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(fmt.Sprintf("%d", ts)))
	return fmt.Sprintf("%d.%s", ts, hex.EncodeToString(mac.Sum(nil)))
}

// validateToken checks that token is well-formed, not expired, and HMAC-valid.
func validateToken(hashStr, token string) bool {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return false
	}
	ts, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return false
	}
	if time.Since(time.Unix(ts, 0)) > cookieTTL {
		return false
	}
	key := adminKey(hashStr)
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(parts[0]))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(parts[1]))
}

// SetAuthCookie writes an HMAC session cookie to the response.
// Uses the handler's current live hash as signing key.
func (h *Handler) SetAuthCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    makeToken(h.currentHash()),
		Path:     "/",
		HttpOnly: true,
		Secure:   isHTTPS(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(cookieTTL.Seconds()),
	})
}

// ClearAuthCookie expires the session cookie.
func ClearAuthCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
}

// HasValidCookie reports whether the request carries a valid HMAC admin cookie.
// Uses the handler's current live hash; returns false when no hash is configured.
func (h *Handler) HasValidCookie(r *http.Request) bool {
	hash := h.currentHash()
	if hash == "" {
		return false
	}
	cookie, err := r.Cookie(cookieName)
	if err != nil {
		return false
	}
	return validateToken(hash, cookie.Value)
}

// RequireAuth is HTTP middleware that validates the HMAC session cookie.
// Returns 503 (needs_setup) when no password is configured; 401 for bad/missing tokens.
func (h *Handler) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		hash := h.currentHash()
		if hash == "" {
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte(`{"error":"Admin setup not complete.","code":"needs_setup"}`))
			return
		}
		cookie, err := r.Cookie(cookieName)
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"error":"Not signed in. Please log in to access the admin panel.","code":"no_session"}`))
			return
		}
		if !validateToken(hash, cookie.Value) {
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"error":"Session expired or invalid. Please sign in again.","code":"session_invalid"}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}
