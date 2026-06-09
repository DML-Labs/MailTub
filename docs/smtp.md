# SMTP Setup

MailTub includes a built-in SMTP server that listens for inbound email. This guide explains how to configure it for production use so real email reaches your mailboxes.

---

## How It Works

1. A sender's mail server does a DNS MX lookup for your domain.
2. The MX record points to your MailTub server's IP.
3. The sender connects to port 25 (standard SMTP) on your server.
4. A firewall rule or `iptables` redirect forwards port 25 → your `SMTP_PORT` (default `2525`).
5. MailTub accepts the message, parses MIME, and pushes it to the matching mailbox via WebSocket.

---

## Prerequisites

| Item | Requirement |
|------|-------------|
| Domain | Any domain you control (e.g. `mail.example.com`) |
| DNS MX record | `mail.example.com. 300 IN MX 10 mail.example.com.` |
| DNS A record | `mail.example.com. 300 IN A <your-server-ip>` |
| Port 25 | Open inbound in your firewall / security group |
| `MAILTUB_DOMAIN` | Set to match your MX domain exactly |

---

## DNS Configuration

### MX Record

```
Type:     MX
Name:     mail          (for mail.example.com)
Value:    mail.example.com.
Priority: 10
TTL:      300
```

### A Record

```
Type:  A
Name:  mail
Value: <your-server-ip>
TTL:   300
```

Test propagation:

```bash
dig MX mail.example.com
dig A  mail.example.com
```

---

## Port Forwarding (Linux)

Standard SMTP uses port 25. Most systems require root to bind to ports below 1024. Instead, run MailTub unprivileged on port 2525 and redirect port 25 with `iptables`:

```bash
# Redirect inbound TCP 25 → 2525
sudo iptables -t nat -A PREROUTING -p tcp --dport 25 -j REDIRECT --to-port 2525

# Persist across reboots (Debian/Ubuntu)
sudo apt install iptables-persistent
sudo netfilter-persistent save
```

Verify:

```bash
# From another machine or MX check tool
telnet mail.example.com 25
```

---

## Environment Variables

```bash
SMTP_PORT=2525
MAILTUB_DOMAIN=mail.example.com
SMTP_MAX_SIZE_MB=25      # reject messages larger than this (MiB)
SMTP_STARTTLS=false      # set true to advertise STARTTLS
```

---

## STARTTLS

MailTub advertises STARTTLS on the SMTP server when `SMTP_STARTTLS=true`. Two modes are supported:

### Auto-generated self-signed cert (dev / testing)

```bash
SMTP_STARTTLS=true ./mailtub
```

An ephemeral ECDSA-P256 certificate is generated in memory at startup. It will not be trusted by external servers but is useful for local testing.

### Production certificate

```bash
SMTP_STARTTLS=true \
  TLS_CERT_FILE=/etc/letsencrypt/live/mail.example.com/fullchain.pem \
  TLS_KEY_FILE=/etc/letsencrypt/live/mail.example.com/privkey.pem \
  ./mailtub
```

#### Getting a certificate with Certbot

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d mail.example.com

# Auto-renew hook to reload MailTub
echo "0 0 * * * root certbot renew --quiet && systemctl reload mailtub" \
  | sudo tee /etc/cron.d/mailtub-certbot
```

---

## Testing SMTP Locally

```bash
# 1. Start MailTub
./mailtub

# 2. Create a mailbox
./mailtub new --local-part test

# 3. Send a test email via CLI
./mailtub send test@localhost --subject "Hello!"

# 4. Or send via Python (useful in CI)
python3 -c "
import smtplib, email.mime.text
msg = email.mime.text.MIMEText('Hello MailTub!')
msg['Subject'] = 'Test'
msg['From']    = 'sender@example.com'
msg['To']      = 'test@localhost'
smtplib.SMTP('localhost', 2525).send_message(msg)
"
```

---

## Testing STARTTLS

```bash
# Using openssl s_client
openssl s_client -connect mail.example.com:25 -starttls smtp

# Using swaks
swaks --to test@mail.example.com --server mail.example.com --tls
```

---

## Firewall Notes

| Port | Protocol | Direction | Purpose |
|------|----------|-----------|---------|
| 25   | TCP | Inbound | Standard SMTP (redirect → 2525) |
| 2525 | TCP | Inbound (localhost) | MailTub SMTP listener |
| 8080 | TCP | Inbound | HTTP / WebSocket / Admin |

If you use `ufw`:

```bash
sudo ufw allow 25/tcp
sudo ufw allow 8080/tcp
```

---

## Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Email not delivered | MX record not propagated | Wait for TTL, check with `dig MX` |
| Connection refused on port 25 | Firewall blocking | Open port 25 in security group / `ufw` |
| `553 no such mailbox` | Domain mismatch | Ensure `MAILTUB_DOMAIN` matches MX target exactly |
| STARTTLS handshake fails | Self-signed cert | Expected for dev; use real cert in production |
| Oversized message rejected | `SMTP_MAX_SIZE_MB` too low | Increase `SMTP_MAX_SIZE_MB` |
