# REST API Reference

MailTub exposes a REST API at `/api/v1`. All request and response bodies use JSON (`Content-Type: application/json`).

---

## Authentication

When `API_KEY` is set, every `/api/v1/*` request must include the key. The `/api/v1/health` endpoint is always public.

```
X-API-Key: <your-api-key>
```

Alternatively, pass it as a query parameter:

```
GET /api/v1/mailbox?api_key=<your-api-key>
```

When `API_KEY` is not set, the API is open (default for self-hosting).

---

## Mailboxes

### Create mailbox

```
POST /api/v1/mailbox
```

**Request body** (all fields optional):

```json
{
  "localPart": "mytemp",
  "ttlHours": 1
}
```

| Field | Type | Constraint |
|-------|------|-----------|
| `localPart` | `string` | 3–32 chars, `[a-z0-9][a-z0-9\-\.]*[a-z0-9]`, no consecutive dots/hyphens |
| `ttlHours` | `int` | `1`, `6`, `24`, or `168`. Omit for server default (`MAILBOX_TTL`) |

**Responses:**

| Status | Meaning |
|--------|---------|
| `201 Created` | Mailbox created — body is the mailbox object |
| `400 Bad Request` | Invalid `ttlHours` value |
| `409 Conflict` | `localPart` already taken |
| `422 Unprocessable Entity` | `localPart` failed validation |
| `429 Too Many Requests` | Rate limit exceeded (20 creations / IP / hour) |

**Example:**

```bash
curl -X POST http://localhost:8080/api/v1/mailbox \
  -H "Content-Type: application/json" \
  -d '{"localPart": "mytemp", "ttlHours": 1}'
```

```json
{
  "id": "01HXYZ...",
  "address": "mytemp@localhost",
  "localPart": "mytemp",
  "domain": "localhost",
  "createdAt": "2026-06-04T08:00:00Z",
  "expiresAt": "2026-06-04T09:00:00Z",
  "emailCount": 0
}
```

---

### Get mailbox

```
GET /api/v1/mailbox/{address}
```

Returns mailbox info including email count.

**Example:**

```bash
curl http://localhost:8080/api/v1/mailbox/mytemp@localhost
```

---

### Delete mailbox

```
DELETE /api/v1/mailbox/{address}
```

Permanently deletes the mailbox and all its emails and attachments.

**Response:** `204 No Content`

---

## Emails

### List emails

```
GET /api/v1/mailbox/{address}/emails?limit=50&offset=0
```

| Query param | Default | Description |
|-------------|---------|-------------|
| `limit` | `50` | Max emails to return (1–200) |
| `offset` | `0` | Pagination offset |

**Response** is an array of email summary objects (no body text or attachments — use the detail endpoint for those).

---

### Get email

```
GET /api/v1/mailbox/{address}/emails/{emailId}
```

Returns full email with `bodyText`, `bodyHTML`, and attachment metadata.

```json
{
  "id": "01HXYZ...",
  "from": "noreply@github.com",
  "to": "mytemp@localhost",
  "subject": "Verify your email address",
  "bodyText": "Thanks for signing up...",
  "bodyHTML": "<html>...",
  "isRead": false,
  "receivedAt": "2026-06-04T08:01:00Z",
  "attachments": [
    {
      "id": "01HABC...",
      "filename": "document.pdf",
      "contentType": "application/pdf",
      "size": 204800
    }
  ]
}
```

---

### Delete email

```
DELETE /api/v1/mailbox/{address}/emails/{emailId}
```

**Response:** `204 No Content`

---

### Mark email as read

```
PATCH /api/v1/mailbox/{address}/emails/{emailId}/read
```

**Response:** `200 OK`

---

### Download attachment

```
GET /api/v1/mailbox/{address}/emails/{emailId}/attachments/{attachmentId}
```

Returns the raw attachment file. The `Content-Disposition` header is set to `attachment; filename="<filename>"`.

> **Note:** Attachment binary data is never included in the email JSON — only metadata. Always use this endpoint to download the file.

---

## Health Check

```
GET /api/v1/health
```

Always public — no API key required. Suitable for load balancer health checks.

```json
{
  "status": "ok",
  "version": "v1.0.0",
  "domain": "localhost",
  "uptime": "3h22m"
}
```

---

## WebSocket

```
GET /ws?address={mailbox-address}
```

Establishes a WebSocket connection for real-time email delivery to a specific mailbox. The server sends JSON frames:

### Message types

**`subscribed`** — connection confirmed

```json
{ "type": "subscribed", "address": "mytemp@localhost" }
```

**`new_email`** — email arrived

```json
{
  "type": "new_email",
  "email": { "id": "...", "from": "...", "subject": "...", ... }
}
```

**`email_delete`** — email deleted by another client

```json
{ "type": "email_delete", "emailId": "01HXYZ..." }
```

**`heartbeat`** — keep-alive ping every 30 seconds

```json
{ "type": "heartbeat" }
```

---

## Prometheus Metrics

```
GET /metrics
```

Prometheus text format. Protected by `Authorization: Bearer <ADMIN_PASSWORD>` when `ADMIN_PASSWORD` is set; open otherwise.

```bash
curl -H "Authorization: Bearer $ADMIN_PASSWORD" http://localhost:8080/metrics
```

| Metric | Type | Description |
|--------|------|-------------|
| `mailtub_mailboxes_created_total` | Counter | Mailboxes created (by domain) |
| `mailtub_mailboxes_deleted_total` | Counter | Mailboxes deleted (by domain + reason) |
| `mailtub_emails_received_total` | Counter | Emails received via SMTP |
| `mailtub_ws_connections_active` | Gauge | Active WebSocket connections |
| `mailtub_smtp_connections_total` | Counter | SMTP connections accepted |
| `mailtub_http_requests_total` | Counter | HTTP requests by method, route, status |
| `mailtub_http_request_duration_seconds` | Histogram | HTTP request latency |

---

## Admin API

All admin endpoints require a valid admin session cookie (set by `POST /admin/login`) or `Authorization: Bearer <ADMIN_PASSWORD>`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/admin/login` | Log in — sets `mailtub_admin` cookie |
| `GET` | `/admin/logout` | Clear admin cookie |
| `GET` | `/admin/api/stats` | Server stats (mailbox count, email count, DB size, uptime) |
| `GET` | `/admin/api/mailboxes` | Paginated mailbox list |
| `DELETE` | `/admin/api/mailboxes` | Purge all expired mailboxes |
| `DELETE` | `/admin/api/mailboxes/{address}` | Delete a specific mailbox |
| `GET` | `/admin/api/config` | Sanitised runtime config (no secrets) |

---

## Error Format

All errors return a JSON body:

```json
{
  "error": "human-readable message"
}
```

## Rate Limiting

Mailbox creation is rate-limited to **20 per IP per hour** using a fixed-window counter. Exceeding this returns `429 Too Many Requests`.
