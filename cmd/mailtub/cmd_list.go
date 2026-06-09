package main

import (
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/dml-labs/mailtub/internal/cli"
)

func runList(args []string) {
	fs := flag.NewFlagSet("list", flag.ExitOnError)
	server := fs.String("server", envOr("MAILTUB_SERVER", "http://localhost:3000"), "MailTub server URL")
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "Usage: mailtub list <address> [flags]")
		fmt.Fprintln(os.Stderr, "\nList all emails in a mailbox.")
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
	emails, err := c.ListEmails(address)
	die(err, "list emails")

	dim := "\033[2m"
	bold := "\033[1m"
	reset := "\033[0m"
	violet := "\033[38;5;141m"
	yellow := "\033[33m"

	if len(emails) == 0 {
		fmt.Printf("\n%sNo emails in %s%s\n\n", dim, address, reset)
		return
	}

	fmt.Printf("\n%s%d email(s) in %s%s%s\n\n", bold, len(emails), violet, address, reset)

	// Header
	fmt.Printf("%s%-24s  %-30s  %-38s  %s%s\n",
		dim, "ID (first 22 chars)", "From", "Subject", "Received", reset)
	fmt.Println(strings.Repeat("─", 110))

	for _, e := range emails {
		unread := " "
		if !e.IsRead {
			unread = yellow + "●" + reset
		}
		shortID := e.ID
		if len(shortID) > 22 {
			shortID = shortID[:22] + "…"
		}
		from := truncate(e.From, 30)
		subject := truncate(e.Subject, 38)
		if subject == "" {
			subject = dim + "(no subject)" + reset
		}
		age := formatAge(time.Since(e.ReceivedAt))
		fmt.Printf("%s %-24s  %-30s  %-38s  %s\n",
			unread, shortID, from, subject, age)
	}
	fmt.Println()
	fmt.Printf("%sTo read an email: mailtub read %s <id>%s\n\n", dim, address, reset)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-1] + "…"
}

func formatAge(d time.Duration) string {
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd ago", int(d.Hours()/24))
	}
}
