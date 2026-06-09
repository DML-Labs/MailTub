package ws

import (
	"log/slog"
	"sync"

	"github.com/dml-labs/mailtub/internal/domain"
)

// Hub manages all active WebSocket clients and routes events to
// subscribers of specific mailbox addresses.
type Hub struct {
	mu      sync.RWMutex
	clients map[*Client]struct{}
	// mailboxClients maps a mailbox address to its subscribed clients.
	mailboxClients map[string]map[*Client]struct{}
}

// NewHub initialises an empty hub.
func NewHub() *Hub {
	return &Hub{
		clients:        make(map[*Client]struct{}),
		mailboxClients: make(map[string]map[*Client]struct{}),
	}
}

// Register adds a client to the hub.
func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c] = struct{}{}
}

// Unregister removes a client and cleans up its subscriptions.
func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, c)
	for addr, clients := range h.mailboxClients {
		delete(clients, c)
		if len(clients) == 0 {
			delete(h.mailboxClients, addr)
		}
	}
}

// Subscribe registers a client to receive events for the given mailbox address.
func (h *Hub) Subscribe(c *Client, address string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.mailboxClients[address] == nil {
		h.mailboxClients[address] = make(map[*Client]struct{})
	}
	h.mailboxClients[address][c] = struct{}{}
}

// BroadcastNewEmail sends a new-email event to all clients watching address.
func (h *Hub) BroadcastNewEmail(address string, email *domain.Email) {
	h.broadcast(address, ServerMessage{
		Type:  EventNewEmail,
		Email: email,
	})
}

// BroadcastEmailDelete notifies subscribers that an email was deleted.
func (h *Hub) BroadcastEmailDelete(address, emailID string) {
	h.broadcast(address, ServerMessage{
		Type:    EventEmailDelete,
		EmailID: emailID,
	})
}

func (h *Hub) broadcast(address string, msg ServerMessage) {
	h.mu.RLock()
	clients := make([]*Client, 0, len(h.mailboxClients[address]))
	for c := range h.mailboxClients[address] {
		clients = append(clients, c)
	}
	h.mu.RUnlock()

	for _, c := range clients {
		select {
		case c.send <- msg:
		default:
			slog.Warn("ws: client send buffer full, dropping message", "mailbox", address)
		}
	}
}
