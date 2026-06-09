package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/dml-labs/mailtub/internal/config"
	"github.com/dml-labs/mailtub/internal/domain"
)

// MailboxHandler groups all mailbox-related HTTP handlers.
type MailboxHandler struct {
	cfg       *config.Config
	mailboxes domain.MailboxRepository
	emails    domain.EmailRepository
}

// NewMailboxHandler constructs a MailboxHandler.
func NewMailboxHandler(
	cfg *config.Config,
	mailboxes domain.MailboxRepository,
	emails domain.EmailRepository,
) *MailboxHandler {
	return &MailboxHandler{cfg: cfg, mailboxes: mailboxes, emails: emails}
}

// allowedTTLs is the set of valid per-request TTL hours.
var allowedTTLs = map[int]bool{1: true, 6: true, 24: true, 168: true}

type createMailboxRequest struct {
	LocalPart string `json:"localPart"`
	TTLHours  int    `json:"ttlHours"` // 0 = server default; 1, 6, 24, or 168
}

// Create handles POST /api/v1/mailbox
// Accepts an optional JSON body { "localPart": "...", "ttlHours": 24 }.
// If localPart is omitted a random address is generated.
// If ttlHours is omitted the server-configured default is used.
func (h *MailboxHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createMailboxRequest
	if r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}

	req.LocalPart = strings.TrimSpace(strings.ToLower(req.LocalPart))

	// Resolve TTL: per-request value overrides server default.
	ttl := h.cfg.MailboxTTL
	if req.TTLHours > 0 {
		if !allowedTTLs[req.TTLHours] {
			writeError(w, http.StatusBadRequest, "invalid ttlHours: must be 1, 6, 24, or 168")
			return
		}
		ttl = time.Duration(req.TTLHours) * time.Hour
	}

	var mb *domain.Mailbox

	if req.LocalPart != "" {
		if err := domain.ValidateLocalPart(req.LocalPart); err != nil {
			if errors.Is(err, domain.ErrInvalidLocalPart) {
				writeError(w, http.StatusUnprocessableEntity, err.Error())
			} else {
				writeError(w, http.StatusBadRequest, err.Error())
			}
			return
		}

		address := req.LocalPart + "@" + h.cfg.SMTPDomain
		existing, err := h.mailboxes.FindByAddress(r.Context(), address)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "database error")
			return
		}
		if existing != nil && !existing.IsExpired() {
			writeError(w, http.StatusConflict, "address already taken")
			return
		}

		mb = domain.NewMailboxWithLocal(req.LocalPart, h.cfg.SMTPDomain, ttl)
	} else {
		mb = domain.NewMailbox(h.cfg.SMTPDomain, ttl)
	}

	if err := h.mailboxes.Create(r.Context(), mb); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create mailbox")
		return
	}
	writeJSON(w, http.StatusCreated, mb)
}

// Get handles GET /api/v1/mailbox/{address}
func (h *MailboxHandler) Get(w http.ResponseWriter, r *http.Request) {
	address := urlParam(r, "address")
	mb, err := h.mailboxes.FindByAddress(r.Context(), address)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if mb == nil || mb.IsExpired() {
		writeError(w, http.StatusNotFound, "mailbox not found or expired")
		return
	}

	count, _ := h.emails.CountByMailbox(r.Context(), mb.ID)
	writeJSON(w, http.StatusOK, map[string]any{
		"mailbox":    mb,
		"emailCount": count,
	})
}

// Delete handles DELETE /api/v1/mailbox/{address}
func (h *MailboxHandler) Delete(w http.ResponseWriter, r *http.Request) {
	address := urlParam(r, "address")
	mb, err := h.mailboxes.FindByAddress(r.Context(), address)
	if err != nil || mb == nil {
		writeError(w, http.StatusNotFound, "mailbox not found")
		return
	}
	if err := h.mailboxes.Delete(r.Context(), mb.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete mailbox")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// helpers ----------------------------------------------------------------

func urlParam(r *http.Request, key string) string {
	v := chi.URLParam(r, key)
	if decoded, err := url.PathUnescape(v); err == nil {
		return decoded
	}
	return v
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
