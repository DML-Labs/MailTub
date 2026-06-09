package main

import (
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/dml-labs/mailtub/internal/cli"
)

func runRead(args []string) {
	fs := flag.NewFlagSet("read", flag.ExitOnError)
	server := fs.String("server", envOr("MAILTUB_SERVER", "http://localhost:3000"), "MailTub server URL")
	showHeaders := fs.Bool("headers", false, "print raw headers")
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "Usage: mailtub read <address> <email-id> [flags]")
		fmt.Fprintln(os.Stderr, "\nDisplay the full content of an email.")
		fmt.Fprintln(os.Stderr, "\nFlags:")
		fs.PrintDefaults()
	}
	must(fs.Parse(args))

	if fs.NArg() < 2 {
		fmt.Fprintln(os.Stderr, "error: address and email-id required")
		fs.Usage()
		os.Exit(1)
	}
	address := fs.Arg(0)
	emailID := fs.Arg(1)

	c := cli.NewClient(*server)
	email, err := c.GetEmail(address, emailID)
	die(err, "get email")

	dim := "\033[2m"
	bold := "\033[1m"
	reset := "\033[0m"
	violet := "\033[38;5;141m"
	green := "\033[32m"
	sep := strings.Repeat("─", 72)

	fmt.Printf("\n%s%s\n%s\n", bold, sep, reset)
	fmt.Printf("  %sFrom%s     %s\n", dim, reset, email.From)
	fmt.Printf("  %sTo%s       %s\n", dim, reset, email.To)
	fmt.Printf("  %sSubject%s  %s%s%s\n", dim, reset, bold, email.Subject, reset)
	fmt.Printf("  %sID%s       %s%s%s\n", dim, reset, dim, email.ID, reset)
	fmt.Printf("  %sReceived%s %s\n", dim, reset, email.ReceivedAt.Local().Format("2006-01-02 15:04:05 MST"))
	if len(email.Attachments) > 0 {
		fmt.Printf("  %sFiles%s    ", dim, reset)
		for i, a := range email.Attachments {
			if i > 0 {
				fmt.Print(", ")
			}
			fmt.Printf("%s%s%s %s(%s)%s", green, a.Filename, reset, dim, formatBytes(a.Size), reset)
		}
		fmt.Println()
	}
	fmt.Printf("%s%s%s\n\n", bold, sep, reset)

	body := email.BodyText
	if body == "" && email.BodyHTML != "" {
		// Strip basic HTML tags for terminal display.
		body = stripHTML(email.BodyHTML)
	}
	if body != "" {
		fmt.Println(body)
	} else {
		fmt.Printf("%s(no body)%s\n", dim, reset)
	}

	if *showHeaders && len(email.Headers) > 0 {
		fmt.Printf("\n%s%s%s\n", dim, sep, reset)
		fmt.Printf("%sHeaders:%s\n", dim, reset)
		keys := make([]string, 0, len(email.Headers))
		for k := range email.Headers {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			fmt.Printf("  %s%s:%s %s\n", violet, k, reset, email.Headers[k])
		}
	}
	fmt.Println()
}

func formatBytes(n int64) string {
	switch {
	case n < 1024:
		return fmt.Sprintf("%d B", n)
	case n < 1024*1024:
		return fmt.Sprintf("%.1f KB", float64(n)/1024)
	default:
		return fmt.Sprintf("%.1f MB", float64(n)/(1024*1024))
	}
}

// stripHTML removes angle-bracket tags from HTML so it's readable in a terminal.
func stripHTML(s string) string {
	var out strings.Builder
	inTag := false
	for _, r := range s {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		case !inTag:
			out.WriteRune(r)
		}
	}
	// Collapse runs of blank lines.
	lines := strings.Split(out.String(), "\n")
	var result []string
	blank := 0
	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		if trimmed == "" {
			blank++
			if blank <= 1 {
				result = append(result, "")
			}
		} else {
			blank = 0
			result = append(result, trimmed)
		}
	}
	return strings.Join(result, "\n")
}
