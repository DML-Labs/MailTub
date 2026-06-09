# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✅ Yes     |
| < 1.0   | ❌ No      |

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Report security issues by emailing **devmayank-inbox@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

You will receive an acknowledgement within **48 hours** and a full response within **7 days**.

We follow [responsible disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure). Public disclosure will be coordinated with you after a fix is released.

## Security Considerations

### Self-Hosting

- Always run behind a reverse proxy (nginx, Caddy, Traefik) that terminates TLS
- Set `ADMIN_PASSWORD` to a long, random string (32+ characters)
- Use `SMTP_STARTTLS=true` with a valid certificate in production
- Restrict direct access to port `2525` (SMTP) to trusted networks
- MailTub stores emails in SQLite — back up `/data/mailtub.db` regularly
- Rate limiting is per-IP; add a CDN/WAF layer for additional protection

### Admin Panel

- The admin panel (`/admin`) uses HMAC-SHA256 signed cookies
- Sessions expire after 24 hours
- If `ADMIN_PASSWORD` is not set, the admin panel is completely disabled

### Email Content

- MailTub does **not** scan email content for malware or spam
- HTML emails are rendered in an iframe — XSS from malicious senders is possible
- Do not use MailTub to receive sensitive information

## Credits

Security researchers who responsibly disclose vulnerabilities will be credited here (with their permission).

---

*Maintained by [DML Labs](https://github.com/dml-labs) — Founder & Lead Engineer: [@Devmayank-official](https://github.com/Devmayank-official)*
