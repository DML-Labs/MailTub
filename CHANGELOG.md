# Changelog

All notable changes to MailTub are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).  
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v1.0.0] — 2026-06-04

### Added

#### Core
- Single Go binary embedding React frontend via `embed.FS`
- SQLite database via `modernc.org/sqlite` (no CGO, fully portable)
- SMTP server with STARTTLS support (auto-generated self-signed cert or custom PEM)
- WebSocket real-time email delivery per mailbox tab
- Per-IP rate limiting (20 mailbox creations / IP / hour)

#### Mailboxes
- Create random or custom mailboxes with `POST /api/v1/mailbox`
- Custom TTL selection: 1h, 6h, 24h (default), 7 days
- Custom local-part validation (3–32 chars, alphanumeric + hyphen + dot)
- Multi-tab support — each browser tab maintains its own inbox
- Tab persistence via `mailtub_tabs_v2` localStorage key

#### Emails
- MIME parsing — plain text, HTML, mixed, and alternative content types
- Attachment support with size limits (per-attachment and total budget)
- Body size cap (configurable `MAX_BODY_KB`)
- Star/unstar emails (client-side, localStorage)
- Mark as read, delete single email
- Export as JSON or ZIP of `.eml` files (client-side, no server roundtrip)

#### UI
- Dark / light / system theme with CSS custom properties + ThemeContext
- Animated email list (Framer Motion)
- QR code generation for sharing addresses (client-side canvas)
- Settings panel: appearance, default TTL, export, about

#### Admin Panel
- Password-protected admin panel at `/admin` (HMAC-SHA256 signed cookies)
- Stats dashboard: mailbox count, email count, domain, version
- Paginated mailbox table with individual purge
- Bulk purge-expired action
- Disabled automatically when `ADMIN_PASSWORD` is unset

#### Infrastructure
- Docker multi-stage build → distroless final image (~20 MB)
- Docker Compose with health checks and Traefik labels
- GoReleaser configuration for multi-platform binary releases
- GitHub Actions CI (Go test + build) and release pipeline
- `.env` / `.env.example` for local configuration

#### CLI
- `mailtub new [--local-part NAME]` — create mailbox
- `mailtub list <address>` — list emails
- `mailtub read <address> <id>` — read email
- `mailtub watch <address>` — stream via WebSocket
- `mailtub send <address> [--starttls]` — send test email

---

[v1.0.0]: https://github.com/dml-labs/mailtub/releases/tag/v1.0.0
