package handler

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/dml-labs/mailtub/internal/domain"
)

// urlParam is defined in mailbox.go and shared across the handler package.

// EmailHandler groups all email-related HTTP handlers.
type EmailHandler struct {
	mailboxes domain.MailboxRepository
	emails    domain.EmailRepository
}

// NewEmailHandler constructs an EmailHandler.
func NewEmailHandler(mailboxes domain.MailboxRepository, emails domain.EmailRepository) *EmailHandler {
	return &EmailHandler{mailboxes: mailboxes, emails: emails}
}

// List handles GET /api/v1/mailbox/{address}/emails
func (h *EmailHandler) List(w http.ResponseWriter, r *http.Request) {
	mb, ok := h.resolveMailbox(w, r)
	if !ok {
		return
	}

	limit := queryInt(r, "limit", 50)
	offset := queryInt(r, "offset", 0)

	emails, err := h.emails.ListByMailbox(r.Context(), mb.ID, limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if emails == nil {
		emails = []*domain.Email{}
	}

	total, _ := h.emails.CountByMailbox(r.Context(), mb.ID)
	writeJSON(w, http.StatusOK, map[string]any{
		"emails": emails,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// Get handles GET /api/v1/mailbox/{address}/emails/{id}
func (h *EmailHandler) Get(w http.ResponseWriter, r *http.Request) {
	mb, ok := h.resolveMailbox(w, r)
	if !ok {
		return
	}

	id := chi.URLParam(r, "id")
	email, err := h.emails.FindByID(r.Context(), id)
	if err != nil || email == nil || email.MailboxID != mb.ID {
		writeError(w, http.StatusNotFound, "email not found")
		return
	}

	// Auto-mark as read when fetched.
	_ = h.emails.MarkRead(r.Context(), id)
	email.IsRead = true

	writeJSON(w, http.StatusOK, email)
}

// Delete handles DELETE /api/v1/mailbox/{address}/emails/{id}
func (h *EmailHandler) Delete(w http.ResponseWriter, r *http.Request) {
	mb, ok := h.resolveMailbox(w, r)
	if !ok {
		return
	}

	id := chi.URLParam(r, "id")
	email, err := h.emails.FindByID(r.Context(), id)
	if err != nil || email == nil || email.MailboxID != mb.ID {
		writeError(w, http.StatusNotFound, "email not found")
		return
	}

	if err := h.emails.Delete(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete email")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// MarkRead handles PATCH /api/v1/mailbox/{address}/emails/{id}/read
func (h *EmailHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	mb, ok := h.resolveMailbox(w, r)
	if !ok {
		return
	}

	id := chi.URLParam(r, "id")
	email, err := h.emails.FindByID(r.Context(), id)
	if err != nil || email == nil || email.MailboxID != mb.ID {
		writeError(w, http.StatusNotFound, "email not found")
		return
	}

	_ = h.emails.MarkRead(r.Context(), id)
	w.WriteHeader(http.StatusNoContent)
}

// GetAttachment handles GET /api/v1/mailbox/{address}/emails/{id}/attachments/{attachmentId}
// It streams the raw attachment data with correct Content-Type for the browser to download.
func (h *EmailHandler) GetAttachment(w http.ResponseWriter, r *http.Request) {
	mb, ok := h.resolveMailbox(w, r)
	if !ok {
		return
	}

	emailID := chi.URLParam(r, "id")
	email, err := h.emails.FindByID(r.Context(), emailID)
	if err != nil || email == nil || email.MailboxID != mb.ID {
		writeError(w, http.StatusNotFound, "email not found")
		return
	}

	attachmentID := chi.URLParam(r, "attachmentId")
	att, err := h.emails.GetAttachment(r.Context(), attachmentID)
	if err != nil || att == nil || att.EmailID != emailID {
		writeError(w, http.StatusNotFound, "attachment not found")
		return
	}

	ct := att.ContentType
	if ct == "" {
		ct = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, att.Filename))
	w.Header().Set("Content-Length", strconv.FormatInt(att.Size, 10))
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(att.Data)
}

// resolveMailbox looks up the mailbox by URL param and writes a 404 if missing.
func (h *EmailHandler) resolveMailbox(w http.ResponseWriter, r *http.Request) (*domain.Mailbox, bool) {
	address := urlParam(r, "address")
	mb, err := h.mailboxes.FindByAddress(r.Context(), address)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return nil, false
	}
	if mb == nil || mb.IsExpired() {
		writeError(w, http.StatusNotFound, "mailbox not found or expired")
		return nil, false
	}
	return mb, true
}

func queryInt(r *http.Request, key string, def int) int {
	if v := r.URL.Query().Get(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			return n
		}
	}
	return def
}
