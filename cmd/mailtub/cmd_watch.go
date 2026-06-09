package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"github.com/dml-labs/mailtub/internal/cli"
)

// wsMessage mirrors the server-side ws.ServerMessage for JSON decoding.
type wsMessage struct {
	Type    string     `json:"type"`
	Email   *cli.Email `json:"email,omitempty"`
	EmailID string     `json:"emailId,omitempty"`
	Mailbox string     `json:"mailbox,omitempty"`
}

func runWatch(args []string) {
	fs := flag.NewFlagSet("watch", flag.ExitOnError)
	server := fs.String("server", envOr("MAILTUB_SERVER", "http://localhost:3000"), "MailTub server URL")
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "Usage: mailtub watch <address> [flags]")
		fmt.Fprintln(os.Stderr, "\nStream new emails to stdout in real time via WebSocket.")
		fmt.Fprintln(os.Stderr, "\nFlags:")
		fs.PrintDefaults()
	}
	must(fs.Parse(args))

	if fs.NArg() < 1 {
		fmt.Fprintln(os.Stderr, "error: address required")
		fs.Usage()
		os.Exit(1)
	}
	address := fs.Arg(0)

	c := cli.NewClient(*server)
	wsURL := c.WSEndpoint()

	dim := "\033[2m"
	bold := "\033[1m"
	reset := "\033[0m"
	violet := "\033[38;5;141m"
	green := "\033[32m"
	yellow := "\033[33m"
	sep := strings.Repeat("─", 72)

	fmt.Printf("\n%s%sMailTub watch%s %s%s%s\n", bold, violet, reset, bold, address, reset)
	fmt.Printf("%sConnecting to %s …%s\n\n", dim, wsURL, reset)

	var conn *websocket.Conn
	var err error

	// Retry loop with backoff.
	backoff := time.Second
	for attempt := 1; ; attempt++ {
		conn, _, err = websocket.DefaultDialer.Dial(wsURL, nil)
		if err == nil {
			break
		}
		if attempt >= 5 {
			fmt.Fprintf(os.Stderr, "failed to connect after %d attempts: %v\n", attempt, err)
			os.Exit(1)
		}
		fmt.Printf("%sconnect failed (%v), retrying in %s…%s\n", dim, err, backoff, reset)
		time.Sleep(backoff)
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
	defer conn.Close()

	// Subscribe to the mailbox.
	sub, _ := json.Marshal(map[string]string{"type": "subscribe", "mailbox": address})
	if err := conn.WriteMessage(websocket.TextMessage, sub); err != nil {
		die(err, "subscribe")
	}

	fmt.Printf("%s%sWaiting for email…%s  (Ctrl-C to quit)\n\n", bold, green, reset)

	emailCount := 0

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			fmt.Printf("\n%sConnection closed: %v%s\n", dim, err, reset)
			break
		}

		var msg wsMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case "subscribed":
			// Already printed the waiting message above.

		case "heartbeat":
			// Silently ignore heartbeats.

		case "new_email":
			if msg.Email == nil {
				continue
			}
			emailCount++
			e := msg.Email
			now := time.Now().Format("15:04:05")

			fmt.Printf("%s[%s]%s %s#%d new email%s\n", dim, now, reset, bold, emailCount, reset)
			fmt.Printf("%s\n", sep)
			fmt.Printf("  %sFrom%s     %s\n", dim, reset, e.From)
			fmt.Printf("  %sSubject%s  %s%s%s\n", dim, reset, bold, e.Subject, reset)
			if len(e.Attachments) > 0 {
				fmt.Printf("  %sFiles%s    %d attachment(s)\n", dim, reset, len(e.Attachments))
			}
			fmt.Printf("  %sID%s       %s%s%s\n", dim, reset, dim, e.ID, reset)
			fmt.Printf("%s\n\n", sep)

			// Show a snippet of the body.
			body := e.BodyText
			if body == "" {
				body = stripHTML(e.BodyHTML)
			}
			if body != "" {
				snippet := body
				if len(snippet) > 400 {
					snippet = snippet[:400] + "…"
				}
				fmt.Println(snippet)
				fmt.Println()
			}

			fmt.Printf("%sTo read: mailtub read %s %s%s\n\n", dim, address, e.ID, reset)
			fmt.Printf("%s%s%s\n\n", yellow, strings.Repeat("═", 72), reset)

		case "email_delete":
			fmt.Printf("%s[deleted] email %s%s\n", dim, msg.EmailID, reset)
		}
	}
}
