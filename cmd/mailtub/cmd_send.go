package main

import (
	"crypto/tls"
	"flag"
	"fmt"
	"net/smtp"
	"os"
	"strings"
	"time"
)

func runSend(args []string) {
	fs := flag.NewFlagSet("send", flag.ExitOnError)
	smtpAddr := fs.String("smtp", envOr("MAILTUB_SMTP", "localhost:2525"), "SMTP server address (host:port)")
	from := fs.String("from", "test@example.com", "sender address")
	subject := fs.String("subject", "Test email from MailTub CLI", "email subject")
	body := fs.String("body", "", "plain text body (default: auto-generated)")
	starttls := fs.Bool("starttls", false, "use STARTTLS (skips certificate verification)")
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "Usage: mailtub send <to> [flags]")
		fmt.Fprintln(os.Stderr, "\nSend a test email to a mailbox via SMTP.")
		fmt.Fprintln(os.Stderr, "\nFlags:")
		fs.PrintDefaults()
	}
	must(fs.Parse(args))

	if fs.NArg() < 1 {
		fmt.Fprintln(os.Stderr, "error: recipient address required")
		fs.Usage()
		os.Exit(1)
	}
	to := fs.Arg(0)

	if *body == "" {
		*body = fmt.Sprintf("Hello from the MailTub CLI!\n\nSent at: %s\nTo: %s\n\n-- MailTub",
			time.Now().Format(time.RFC1123), to)
	}

	msg := buildMessage(*from, to, *subject, *body)

	dim := "\033[2m"
	bold := "\033[1m"
	reset := "\033[0m"
	green := "\033[32m"

	fmt.Printf("\n%sSending via %s…%s\n", dim, *smtpAddr, reset)

	var err error
	if *starttls {
		err = sendSTARTTLS(*smtpAddr, *from, to, msg)
	} else {
		err = smtp.SendMail(*smtpAddr, nil, *from, []string{to}, msg)
	}
	die(err, "send email")

	fmt.Printf("%s%s✓ Email sent%s\n\n", bold, green, reset)
	fmt.Printf("  %sFrom%s    %s\n", dim, reset, *from)
	fmt.Printf("  %sTo%s      %s\n", dim, reset, to)
	fmt.Printf("  %sSubject%s %s\n\n", dim, reset, *subject)
}

// buildMessage assembles a minimal RFC-5322 message.
func buildMessage(from, to, subject, body string) []byte {
	var sb strings.Builder
	sb.WriteString("From: " + from + "\r\n")
	sb.WriteString("To: " + to + "\r\n")
	sb.WriteString("Subject: " + subject + "\r\n")
	sb.WriteString("Date: " + time.Now().Format(time.RFC1123Z) + "\r\n")
	sb.WriteString("MIME-Version: 1.0\r\n")
	sb.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	sb.WriteString("\r\n")
	sb.WriteString(body)
	return []byte(sb.String())
}

// sendSTARTTLS connects via plain TCP then upgrades to TLS before sending.
func sendSTARTTLS(addr, from, to string, msg []byte) error {
	host := addr
	if idx := strings.LastIndex(addr, ":"); idx >= 0 {
		host = addr[:idx]
	}

	c, err := smtp.Dial(addr)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer c.Close()

	if err := c.StartTLS(&tls.Config{
		InsecureSkipVerify: true, //nolint:gosec // CLI test tool — user accepted self-signed
		ServerName:         host,
	}); err != nil {
		return fmt.Errorf("STARTTLS: %w", err)
	}

	if err := c.Mail(from); err != nil {
		return err
	}
	if err := c.Rcpt(to); err != nil {
		return err
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(msg); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return c.Quit()
}
