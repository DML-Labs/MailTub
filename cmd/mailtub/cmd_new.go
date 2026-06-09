package main

import (
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/dml-labs/mailtub/internal/cli"
)

func runNew(args []string) {
	fs := flag.NewFlagSet("new", flag.ExitOnError)
	server := fs.String("server", envOr("MAILTUB_SERVER", "http://localhost:3000"), "MailTub server URL")
	localPart := fs.String("local-part", "", "custom local part (e.g. myname)")
	quiet := fs.Bool("q", false, "print address only, no decorations")
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "Usage: mailtub new [flags]")
		fmt.Fprintln(os.Stderr, "\nCreate a new temporary mailbox and print its address.")
		fmt.Fprintln(os.Stderr, "\nFlags:")
		fs.PrintDefaults()
	}
	must(fs.Parse(args))

	c := cli.NewClient(*server)
	mb, err := c.CreateMailbox(*localPart)
	die(err, "create mailbox")

	if *quiet {
		fmt.Println(mb.Address)
		return
	}

	ttl := time.Until(mb.ExpiresAt).Round(time.Minute)

	bold := "\033[1m"
	violet := "\033[38;5;141m"
	dim := "\033[2m"
	reset := "\033[0m"
	green := "\033[32m"

	fmt.Printf("\n%s%s✓ New mailbox created%s\n\n", bold, green, reset)
	fmt.Printf("  %sAddress%s   %s%s%s\n", dim, reset, violet, mb.Address, reset)
	fmt.Printf("  %sExpires%s   in %s\n", dim, reset, formatDuration(ttl))
	fmt.Printf("  %sID%s        %s%s%s\n\n", dim, reset, dim, mb.ID, reset)
	fmt.Printf("%sTo watch for incoming mail:%s\n", dim, reset)
	fmt.Printf("  mailtub watch %s --server %s\n\n", mb.Address, *server)
}

func formatDuration(d time.Duration) string {
	d = d.Round(time.Minute)
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	if h > 0 {
		return fmt.Sprintf("%dh %dm", h, m)
	}
	return fmt.Sprintf("%dm", m)
}
