package admin

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/dml-labs/mailtub/internal/config"
	"github.com/dml-labs/mailtub/internal/domain"
	"github.com/dml-labs/mailtub/internal/logbuf"
	"github.com/dml-labs/mailtub/internal/storage"
)

// Handler holds dependencies for all admin REST endpoints.
type Handler struct {
	cfg       *config.Config
	mailboxes domain.MailboxRepository
	emails    domain.EmailRepository
	ring      *logbuf.RingBuffer
	lockout   *Lockout
	settings  *storage.SettingsStore

	mu        sync.RWMutex
	adminHash []byte // bcrypt hash currently in use (loaded from DB or derived from env var)
}

// NewHandler constructs an admin Handler. Password priority:
//  1. ADMIN_PASSWORD env var — hashed in memory, never written to DB.
//  2. DB settings table (key: admin_password_hash) — written by the setup/change-password API.
//  3. Neither set → needsSetup() returns true; the browser wizard handles first-run.
func NewHandler(cfg *config.Config, mb domain.MailboxRepository, em domain.EmailRepository,
	ring *logbuf.RingBuffer, settings *storage.SettingsStore) *Handler {

	h := &Handler{
		cfg:       cfg,
		mailboxes: mb,
		emails:    em,
		ring:      ring,
		lockout:   newLockout(),
		settings:  settings,
	}

	if cfg.AdminPassword != "" {
		// Env-var override: use as-is (plain text or pre-computed bcrypt hash).
		pw := []byte(cfg.AdminPassword)
		if isBcryptHash(cfg.AdminPassword) {
			h.adminHash = pw
		} else {
			if hash, err := bcrypt.GenerateFromPassword(pw, bcrypt.DefaultCost); err == nil {
				h.adminHash = hash
			}
		}
	} else {
		// Load hash from DB (written by Setup or ChangePassword endpoints).
		if hashStr, ok, _ := settings.Get(context.Background(), storage.KeyAdminPasswordHash); ok && hashStr != "" {
			h.adminHash = []byte(hashStr)
		}
		// nil adminHash → first-run wizard required.
	}

	return h
}

// currentHash returns the active bcrypt hash string (safe for concurrent reads).
func (h *Handler) currentHash() string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return string(h.adminHash)
}

// setHash updates the in-memory hash (safe for concurrent writes).
func (h *Handler) setHash(hash []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.adminHash = hash
}

// NeedsSetup reports whether neither an env-var password nor a DB hash has been set.
// Exported so the router can use it for the /metrics protection logic.
func (h *Handler) NeedsSetup() bool { return h.currentHash() == "" }

// isBcryptHash returns true when s is a bcrypt hash ($2a$, $2b$, $2y$ prefix).
func isBcryptHash(s string) bool {
	return strings.HasPrefix(s, "$2a$") ||
		strings.HasPrefix(s, "$2b$") ||
		strings.HasPrefix(s, "$2y$")
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// audit writes a structured audit event to slog (captured by the ring buffer).
func (h *Handler) audit(r *http.Request, event string, extra ...any) {
	attrs := []any{
		"audit", true,
		"event", event,
		"ip", remoteIP(r),
	}
	attrs = append(attrs, extra...)
	slog.Info("AUDIT "+event, attrs...)
}

// SetupStatus handles GET /admin/api/setup-status
// Public endpoint — returns whether the first-run wizard must be completed and
// whether the password is locked to the ADMIN_PASSWORD environment variable.
func (h *Handler) SetupStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"needsSetup":  h.NeedsSetup(),
		"envOverride": h.cfg.AdminPassword != "",
	})
}

// Setup handles POST /admin/api/setup
// Body: {"password":"...", "confirmPassword":"..."}
// Only succeeds when no password is configured yet (needsSetup = true) and
// ADMIN_PASSWORD env var is not set.
func (h *Handler) Setup(w http.ResponseWriter, r *http.Request) {
	if h.cfg.AdminPassword != "" {
		writeJSON(w, http.StatusForbidden, map[string]string{
			"error": "Admin password is managed via the ADMIN_PASSWORD environment variable. Remove it to use the browser setup wizard.",
			"code":  "env_override",
		})
		return
	}
	if !h.NeedsSetup() {
		writeJSON(w, http.StatusConflict, map[string]string{
			"error": "Admin password is already configured.",
			"code":  "already_configured",
		})
		return
	}

	var body struct {
		Password        string `json:"password"`
		ConfirmPassword string `json:"confirmPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request.", "code": "bad_request"})
		return
	}
	if body.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Password cannot be empty.", "code": "empty_password"})
		return
	}
	if len(body.Password) < 8 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Password must be at least 8 characters.", "code": "too_short"})
		return
	}
	if body.Password != body.ConfirmPassword {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Passwords do not match.", "code": "mismatch"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to hash password.", "code": "internal"})
		return
	}
	if err := h.settings.Set(r.Context(), storage.KeyAdminPasswordHash, string(hash)); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save password.", "code": "internal"})
		return
	}

	h.setHash(hash)
	h.audit(r, "setup_complete")

	// Issue session cookie so user lands directly on the dashboard.
	h.SetAuthCookie(w, r)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ChangePassword handles POST /admin/api/change-password  (requires auth)
// Body: {"currentPassword":"...", "newPassword":"...", "confirmPassword":"..."}
// Not allowed when ADMIN_PASSWORD env var is set (env-managed deployments should
// update the env var instead).
func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	if h.cfg.AdminPassword != "" {
		writeJSON(w, http.StatusForbidden, map[string]string{
			"error": "Password is managed via the ADMIN_PASSWORD environment variable. Update the env var to change it.",
			"code":  "env_override",
		})
		return
	}

	var body struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
		ConfirmPassword string `json:"confirmPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request.", "code": "bad_request"})
		return
	}
	if body.NewPassword == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "New password cannot be empty.", "code": "empty_password"})
		return
	}
	if len(body.NewPassword) < 8 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "New password must be at least 8 characters.", "code": "too_short"})
		return
	}
	if body.NewPassword != body.ConfirmPassword {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Passwords do not match.", "code": "mismatch"})
		return
	}

	currentHash := []byte(h.currentHash())
	if err := bcrypt.CompareHashAndPassword(currentHash, []byte(body.CurrentPassword)); err != nil {
		h.audit(r, "change_password_failed")
		writeJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Current password is incorrect.",
			"code":  "wrong_password",
		})
		return
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to hash password.", "code": "internal"})
		return
	}
	if err := h.settings.Set(r.Context(), storage.KeyAdminPasswordHash, string(newHash)); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save password.", "code": "internal"})
		return
	}

	h.setHash(newHash)
	h.audit(r, "password_changed")

	// Re-issue session cookie signed with the new hash key so this session stays alive.
	h.SetAuthCookie(w, r)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Login handles POST /admin/api/login
// Body: {"password":"..."}
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	if h.NeedsSetup() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error": "Admin password not configured. Complete the setup wizard first.",
			"code":  "needs_setup",
		})
		return
	}

	ip := remoteIP(r)

	if locked, remaining := h.lockout.IsLocked(ip); locked {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{
			"error": LockoutError(remaining),
			"code":  "locked_out",
		})
		return
	}

	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Invalid request. Expected JSON with a \"password\" field.",
			"code":  "bad_request",
		})
		return
	}
	if body.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Password cannot be empty.",
			"code":  "empty_password",
		})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(h.currentHash()), []byte(body.Password)); err != nil {
		h.lockout.Record(ip)
		attempts := h.lockout.Attempts(ip)
		remaining := maxAttempts - attempts
		h.audit(r, "login_failed", "attempts", attempts)

		if remaining <= 0 {
			writeJSON(w, http.StatusTooManyRequests, map[string]string{
				"error": LockoutError(lockoutDuration),
				"code":  "locked_out",
			})
			return
		}
		msg := "Incorrect password."
		if remaining <= 2 {
			msg += " " + strconv.Itoa(remaining) + " attempt(s) remaining before 15-minute lockout."
		}
		writeJSON(w, http.StatusUnauthorized, map[string]string{
			"error": msg,
			"code":  "wrong_password",
		})
		return
	}

	h.lockout.Reset(ip)
	h.SetAuthCookie(w, r)
	h.audit(r, "login_success")
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Logout handles POST /admin/api/logout
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	h.audit(r, "logout")
	ClearAuthCookie(w)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Stats handles GET /admin/api/stats
func (h *Handler) Stats(w http.ResponseWriter, r *http.Request) {
	mbCount, _ := h.mailboxes.CountAll(r.Context())
	emCount, _ := h.emails.CountAll(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{
		"mailboxes": mbCount,
		"emails":    emCount,
		"version":   h.cfg.AppVersion,
		"domain":    h.cfg.SMTPDomain,
	})
}

// mailboxRow extends Mailbox with a per-mailbox email count.
type mailboxRow struct {
	*domain.Mailbox
	EmailCount int64 `json:"emailCount"`
}

// ListMailboxes handles GET /admin/api/mailboxes?page=1&limit=50
func (h *Handler) ListMailboxes(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 200 {
		limit = 50
	}
	offset := (page - 1) * limit

	boxes, err := h.mailboxes.ListAll(r.Context(), limit, offset)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	total, _ := h.mailboxes.CountAll(r.Context())

	rows := make([]mailboxRow, 0, len(boxes))
	for _, mb := range boxes {
		count, _ := h.emails.CountByMailbox(r.Context(), mb.ID)
		rows = append(rows, mailboxRow{mb, count})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"mailboxes": rows,
		"total":     total,
		"page":      page,
		"limit":     limit,
	})
}

// ListMailboxEmails handles GET /admin/api/mailboxes/{id}/emails?page=1&limit=20
func (h *Handler) ListMailboxEmails(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing mailbox id"})
		return
	}
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	emails, err := h.emails.ListByMailbox(r.Context(), id, limit, offset)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	total, _ := h.emails.CountByMailbox(r.Context(), id)

	writeJSON(w, http.StatusOK, map[string]any{
		"emails": emails,
		"total":  total,
		"page":   page,
		"limit":  limit,
	})
}

// PurgeMailbox handles DELETE /admin/api/mailboxes/{id}
func (h *Handler) PurgeMailbox(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing id"})
		return
	}
	if err := h.mailboxes.Delete(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	h.audit(r, "mailbox_deleted", "mailbox_id", id)
	writeJSON(w, http.StatusOK, map[string]string{"status": "purged"})
}

// PurgeExpired handles POST /admin/api/purge-expired
func (h *Handler) PurgeExpired(w http.ResponseWriter, r *http.Request) {
	n, err := h.mailboxes.DeleteExpired(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	h.audit(r, "purge_expired", "count", n)
	writeJSON(w, http.StatusOK, map[string]any{"purged": n})
}

// Logs handles GET /admin/api/logs?n=200
func (h *Handler) Logs(w http.ResponseWriter, r *http.Request) {
	n, _ := strconv.Atoi(r.URL.Query().Get("n"))
	if n <= 0 || n > 500 {
		n = 200
	}
	entries := h.ring.Last(n)
	if entries == nil {
		entries = []logbuf.Entry{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"logs":  entries,
		"count": len(entries),
	})
}

// GetConfig handles GET /admin/api/config
func (h *Handler) GetConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"domain":        h.cfg.SMTPDomain,
		"httpPort":      h.cfg.HTTPPort,
		"smtpPort":      h.cfg.SMTPPort,
		"mailboxTTL":    h.cfg.MailboxTTL.String(),
		"smtpMaxSizeMB": h.cfg.SMTPMaxSize / (1024 * 1024),
		"starttls":      h.cfg.SMTPStartTLS,
		"redisEnabled":  h.cfg.RedisURL != "",
		"logLevel":      h.cfg.LogLevel.String(),
		"version":       h.cfg.AppVersion,
		"dbPath":        h.cfg.DatabasePath,
		"adminEnabled":  !h.NeedsSetup(),
		"envOverride":   h.cfg.AdminPassword != "",
		"apiKeySet":     h.cfg.APIKey != "",
		"rateLimit":     "20 mailboxes / IP / hour",
	})
}
