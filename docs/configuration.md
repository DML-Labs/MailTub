# Configuration

All MailTub configuration is done via environment variables. No config file is required — copy `.env.example` to `.env` and edit it, or pass variables directly to the process.

---

## Core

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | `int` | `8080` | HTTP and WebSocket server port |
| `SMTP_PORT` | `int` | `2525` | SMTP server port |
| `MAILTUB_DOMAIN` | `string` | `localhost` | Mail domain (e.g. `mail.example.com`). Must match your MX record in production. |
| `DATABASE_PATH` | `string` | `./data/mailtub.db` | Path to the SQLite database file. Directory is created on first run. |
| `MAILBOX_TTL` | `duration` | `24h` | Default mailbox lifetime. Valid values: `1h`, `6h`, `24h`, `168h` |
| `LOG_LEVEL` | `string` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `APP_VERSION` | `string` | `dev` | Version string shown in the UI and `/api/v1/health`. Set automatically by GoReleaser. |

---

## SMTP / TLS

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SMTP_MAX_SIZE_MB` | `int` | `25` | Maximum accepted SMTP message size in MiB. Messages over this limit are rejected at the protocol level before the DATA stream. |
| `SMTP_STARTTLS` | `bool` | `false` | Enable STARTTLS on the SMTP server. Set to `true` to advertise STARTTLS. |
| `TLS_CERT_FILE` | `string` | _(auto)_ | Path to TLS certificate PEM file. When `SMTP_STARTTLS=true` and this is empty, an ephemeral self-signed ECDSA-P256 cert is generated in memory at startup. |
| `TLS_KEY_FILE` | `string` | _(auto)_ | Path to TLS private key PEM file. Paired with `TLS_CERT_FILE`. |

---

## Attachment Limits

MailTub enforces two independent layers of size control:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MAX_ATTACHMENT_SIZE_MB` | `int` | `25` | Per-attachment cap in MiB. Attachments exceeding this are silently skipped; the email body is still saved. |
| `MAX_TOTAL_ATTACHMENT_MB` | `int` | `50` | Total attachment budget per email in MiB. Once exhausted, remaining attachments are skipped. |
| `MAX_BODY_KB` | `int` | `512` | Body text/HTML cap in KiB. Oversized bodies are truncated with a notice appended. |

### Example — restricting attachment sizes

```bash
MAX_ATTACHMENT_SIZE_MB=10 MAX_TOTAL_ATTACHMENT_MB=20 MAX_BODY_KB=256 ./mailtub
```

---

## Security

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ADMIN_PASSWORD` | `string` | _(empty)_ | **Optional.** Overrides the DB-managed admin password for Docker/CI deployments. When set, the password cannot be changed from the browser UI. When unset, MailTub stores the password as a bcrypt hash in SQLite — set it via the browser first-run wizard at `/admin/setup` (recommended for bare-metal installs). |
| `API_KEY` | `string` | _(empty)_ | Protects all `/api/v1/*` endpoints with `X-API-Key` header authentication. When unset, the API is open. Generate with `openssl rand -hex 32`. |

---

## Cache (Optional)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `REDIS_URL` | `string` | _(empty)_ | Redis or Upstash URL for optional mailbox caching. Supports `redis://` and `rediss://` (TLS). When empty, SQLite is used exclusively. |

### Example — Upstash Redis

```bash
REDIS_URL=rediss://:<token>@<host>:<port> ./mailtub
```

---

## Quick Reference

```bash
# Minimal production config
PORT=8080
SMTP_PORT=2525
MAILTUB_DOMAIN=mail.example.com
DATABASE_PATH=/data/mailtub.db
MAILBOX_TTL=24h
ADMIN_PASSWORD=$(openssl rand -hex 32)

# With STARTTLS (production cert)
SMTP_STARTTLS=true
TLS_CERT_FILE=/etc/letsencrypt/live/mail.example.com/fullchain.pem
TLS_KEY_FILE=/etc/letsencrypt/live/mail.example.com/privkey.pem

# With API key protection
API_KEY=$(openssl rand -hex 32)
```

---

## Loading `.env` Files

MailTub uses [`godotenv`](https://github.com/joho/godotenv) to automatically load a `.env` file from the current working directory at startup. Variables set in the environment always take precedence over `.env` file values.

```bash
cp .env.example .env
$EDITOR .env
./mailtub
```

---

## Config in Docker

When running via Docker or Docker Compose, pass variables via `environment:` or `--env-file`:

```bash
docker run -p 8080:8080 -p 2525:2525 \
  -e MAILTUB_DOMAIN=mail.example.com \
  -e ADMIN_PASSWORD=changeme \
  -v mailtub_data:/data \
  ghcr.io/dml-labs/mailtub:latest
```

See [deployment.md](deployment.md) for the full Docker Compose example.
