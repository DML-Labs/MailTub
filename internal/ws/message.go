// Package ws implements the WebSocket hub for real-time inbox updates.
package ws

import "github.com/dml-labs/mailtub/internal/domain"

// EventType enumerates the events the server pushes to clients.
type EventType string

const (
	EventNewEmail    EventType = "new_email"
	EventEmailRead   EventType = "email_read"
	EventEmailDelete EventType = "email_delete"
	EventHeartbeat   EventType = "heartbeat"
	EventSubscribed  EventType = "subscribed"
)

// ServerMessage is sent from the server to connected clients.
type ServerMessage struct {
	Type    EventType     `json:"type"`
	Email   *domain.Email `json:"email,omitempty"`
	EmailID string        `json:"emailId,omitempty"`
	Mailbox string        `json:"mailbox,omitempty"`
}

// ClientMessage is sent from clients to the server.
type ClientMessage struct {
	Type    string `json:"type"`
	Mailbox string `json:"mailbox"`
}
