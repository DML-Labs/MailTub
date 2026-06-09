// Package cli provides a typed HTTP + WebSocket client for MailTub's REST API.
// It is used by CLI subcommands to communicate with any MailTub server.
package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ── API response types ────────────────────────────────────────────────────────

// Mailbox is the API representation of a temporary mailbox.
type Mailbox struct {
	ID        string    `json:"id"`
	Address   string    `json:"address"`
	LocalPart string    `json:"localPart"`
	Domain    string    `json:"domain"`
	ExpiresAt time.Time `json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
}

// Email is the API representation of a received email.
type Email struct {
	ID          string            `json:"id"`
	MailboxID   string            `json:"mailboxId"`
	From        string            `json:"from"`
	To          string            `json:"to"`
	Subject     string            `json:"subject"`
	BodyText    string            `json:"bodyText"`
	BodyHTML    string            `json:"bodyHtml"`
	Headers     map[string]string `json:"headers"`
	Size        int64             `json:"size"`
	IsRead      bool              `json:"isRead"`
	ReceivedAt  time.Time         `json:"receivedAt"`
	Attachments []Attachment      `json:"attachments,omitempty"`
}

// Attachment is metadata for an email attachment.
type Attachment struct {
	ID          string `json:"id"`
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
}

// EmailListResponse is the envelope returned by GET /mailbox/{addr}/emails.
type EmailListResponse struct {
	Emails []*Email `json:"emails"`
	Total  int      `json:"total"`
}

// ── HTTP client ───────────────────────────────────────────────────────────────

// Client is a typed HTTP client for the MailTub REST API.
type Client struct {
	BaseURL    string
	HTTPClient *http.Client
}

// NewClient creates a Client targeting baseURL (e.g. "http://localhost:3000").
func NewClient(baseURL string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTPClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// CreateMailbox creates a new mailbox. Pass an empty localPart for a random address.
func (c *Client) CreateMailbox(localPart string) (*Mailbox, error) {
	var body io.Reader
	if localPart != "" {
		b, _ := json.Marshal(map[string]string{"localPart": localPart})
		body = bytes.NewReader(b)
	} else {
		body = http.NoBody
	}

	req, err := http.NewRequest(http.MethodPost, c.BaseURL+"/api/v1/mailbox", body)
	if err != nil {
		return nil, err
	}
	if localPart != "" {
		req.Header.Set("Content-Type", "application/json")
	}

	var mb Mailbox
	if err := c.do(req, &mb); err != nil {
		return nil, err
	}
	return &mb, nil
}

// GetMailbox fetches a mailbox by address.
func (c *Client) GetMailbox(address string) (*Mailbox, error) {
	req, err := http.NewRequest(http.MethodGet,
		c.BaseURL+"/api/v1/mailbox/"+address, nil)
	if err != nil {
		return nil, err
	}
	var mb Mailbox
	if err := c.do(req, &mb); err != nil {
		return nil, err
	}
	return &mb, nil
}

// ListEmails returns all emails in a mailbox (up to 200).
func (c *Client) ListEmails(address string) ([]*Email, error) {
	req, err := http.NewRequest(http.MethodGet,
		c.BaseURL+"/api/v1/mailbox/"+address+"/emails?limit=200", nil)
	if err != nil {
		return nil, err
	}
	var resp EmailListResponse
	if err := c.do(req, &resp); err != nil {
		return nil, err
	}
	return resp.Emails, nil
}

// GetEmail returns a single email by ID.
func (c *Client) GetEmail(address, emailID string) (*Email, error) {
	req, err := http.NewRequest(http.MethodGet,
		c.BaseURL+"/api/v1/mailbox/"+address+"/emails/"+emailID, nil)
	if err != nil {
		return nil, err
	}
	var email Email
	if err := c.do(req, &email); err != nil {
		return nil, err
	}
	return &email, nil
}

// DeleteEmail deletes a single email.
func (c *Client) DeleteEmail(address, emailID string) error {
	req, err := http.NewRequest(http.MethodDelete,
		c.BaseURL+"/api/v1/mailbox/"+address+"/emails/"+emailID, nil)
	if err != nil {
		return err
	}
	return c.do(req, nil)
}

// DeleteMailbox deletes a mailbox and all its emails.
func (c *Client) DeleteMailbox(address string) error {
	req, err := http.NewRequest(http.MethodDelete,
		c.BaseURL+"/api/v1/mailbox/"+address, nil)
	if err != nil {
		return err
	}
	return c.do(req, nil)
}

// WSEndpoint converts the HTTP base URL to its WebSocket equivalent.
func (c *Client) WSEndpoint() string {
	base := c.BaseURL
	if strings.HasPrefix(base, "https://") {
		return "wss://" + base[8:] + "/ws"
	}
	return "ws://" + strings.TrimPrefix(base, "http://") + "/ws"
}

// do executes a request and unmarshals the JSON response body into dst.
// If dst is nil the response body is discarded.
func (c *Client) do(req *http.Request, dst any) error {
	req.Header.Set("Accept", "application/json")
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		// Try to surface a JSON error message.
		var e struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(raw, &e)
		if e.Error != "" {
			return fmt.Errorf("server returned %d: %s", resp.StatusCode, e.Error)
		}
		return fmt.Errorf("server returned %d", resp.StatusCode)
	}

	if dst != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, dst); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}
	}
	return nil
}
