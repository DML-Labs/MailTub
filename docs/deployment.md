# Deployment Guide

This guide covers every supported platform: Linux (all major distros), macOS (Intel & Apple Silicon), Windows 10/11, Android (Termux), Docker, Podman, Docker Compose, and Nginx reverse proxy.

---

## Linux

Supports all major distributions: **Ubuntu, Debian, Fedora, Arch, Mint, Pop!_OS, Manjaro**, and any other distro with glibc 2.17+.

> **One-line installer** — detects your distro, downloads the right binary, and optionally installs a systemd service:
> ```bash
> curl -fsSL https://raw.githubusercontent.com/dml-labs/mailtub/main/install.sh | bash
> ```

### Manual install + systemd

#### 1. Download & install

```bash
# Replace linux_amd64 with your platform (linux_amd64, linux_arm64, linux_arm)
curl -L https://github.com/dml-labs/mailtub/releases/latest/download/mailtub_linux_amd64.tar.gz \
  | tar -xz -C /usr/local/bin
chmod +x /usr/local/bin/mailtub
```

> **Architecture reference**
> | CPU | Slug |
> |-----|------|
> | x86-64 (most desktops/VPS) | `linux_amd64` |
> | ARM 64-bit (Raspberry Pi 4/5, Oracle ARM) | `linux_arm64` |
> | ARM 32-bit (Raspberry Pi 2/3) | `linux_arm` |

#### 2. Create data directory

```bash
sudo mkdir -p /var/lib/mailtub
sudo useradd --system --no-create-home --shell /sbin/nologin mailtub
sudo chown mailtub:mailtub /var/lib/mailtub
```

#### 3. Create environment file

```bash
sudo tee /etc/mailtub.env << 'EOF'
PORT=8080
SMTP_PORT=2525
MAILTUB_DOMAIN=mail.example.com
DATABASE_PATH=/var/lib/mailtub/mailtub.db
MAILBOX_TTL=24h
ADMIN_PASSWORD=changeme_use_openssl_rand_hex_32
LOG_LEVEL=info
EOF
sudo chmod 600 /etc/mailtub.env
```

#### 4. Create systemd service

```ini
# /etc/systemd/system/mailtub.service
[Unit]
Description=MailTub — self-hosted disposable email
After=network.target
Wants=network.target

[Service]
Type=simple
User=mailtub
Group=mailtub
ExecStart=/usr/local/bin/mailtub
EnvironmentFile=/etc/mailtub.env
Restart=always
RestartSec=5
# Harden the service
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/mailtub

[Install]
WantedBy=multi-user.target
```

#### 5. Enable & start

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mailtub
sudo systemctl status mailtub
```

#### 6. Port forwarding (port 25 → 2525)

Standard SMTP uses port 25. Redirect it to MailTub's unprivileged port:

```bash
sudo iptables -t nat -A PREROUTING -p tcp --dport 25 -j REDIRECT --to-port 2525
# Persist:
sudo apt install iptables-persistent && sudo netfilter-persistent save
```

---

## Podman

Podman is a rootless drop-in alternative to Docker. All `docker` commands work with `podman`:

```bash
podman run -d \
  --name mailtub \
  -p 8080:8080 \
  -p 2525:2525 \
  -e MAILTUB_DOMAIN=mail.example.com \
  -v mailtub_data:/data \
  ghcr.io/dml-labs/mailtub:latest
```

### Podman Compose

```bash
# Same docker-compose.yml works with podman-compose
podman-compose up -d
```

### Systemd socket activation (rootless, auto-start)

```bash
podman generate systemd --name mailtub --new --files
mkdir -p ~/.config/systemd/user
cp container-mailtub.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now container-mailtub
loginctl enable-linger $USER
```

---

## macOS

Supports **Intel (x86-64)** and **Apple Silicon (M1/M2/M3/M4)** — no Rosetta required.

```bash
# Apple Silicon
curl -L https://github.com/dml-labs/mailtub/releases/latest/download/mailtub_darwin_arm64.tar.gz \
  | tar -xz -C /usr/local/bin

# Intel Mac
curl -L https://github.com/dml-labs/mailtub/releases/latest/download/mailtub_darwin_amd64.tar.gz \
  | tar -xz -C /usr/local/bin

chmod +x /usr/local/bin/mailtub
mailtub
```

Open [http://localhost:8080](http://localhost:8080). Visit `/admin` to create your admin password on first run.

Or use the one-line installer (auto-detects Intel vs Apple Silicon):

```bash
curl -fsSL https://raw.githubusercontent.com/dml-labs/mailtub/main/install.sh | bash
```

### Run as a launchd service (auto-start on login)

```bash
mkdir -p ~/.mailtub
cat > ~/Library/LaunchAgents/com.dmllabs.mailtub.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>             <string>com.dmllabs.mailtub</string>
  <key>ProgramArguments</key> <array><string>/usr/local/bin/mailtub</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>          <string>8080</string>
    <key>SMTP_PORT</key>     <string>2525</string>
    <key>DATABASE_PATH</key> <string>/Users/YOU/.mailtub/mailtub.db</string>
  </dict>
  <key>RunAtLoad</key> <true/>
  <key>KeepAlive</key> <true/>
  <key>StandardOutPath</key>   <string>/tmp/mailtub.log</string>
  <key>StandardErrorPath</key> <string>/tmp/mailtub.log</string>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.dmllabs.mailtub.plist
```

---

## Windows 10 / 11

MailTub ships a native Windows binary — no WSL, no Cygwin required.

**PowerShell (run as Administrator):**

```powershell
# Download and extract
$ver = (Invoke-RestMethod "https://api.github.com/repos/dml-labs/mailtub/releases/latest").tag_name
$url = "https://github.com/dml-labs/mailtub/releases/download/$ver/mailtub_windows_amd64.zip"
Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\mailtub.zip"
Expand-Archive -Path "$env:TEMP\mailtub.zip" -DestinationPath "C:\mailtub" -Force

# Run
cd C:\mailtub
.\mailtub.exe
```

Open [http://localhost:8080](http://localhost:8080). Visit `/admin` to create your admin password.

### Set environment variables (PowerShell)

```powershell
$env:PORT="8080"
$env:MAILTUB_DOMAIN="mail.example.com"
$env:DATABASE_PATH="C:\mailtub\data\mailtub.db"
.\mailtub.exe
```

### Run as a Windows Service (auto-start, Task Scheduler)

```powershell
New-Item -ItemType Directory -Force -Path "C:\mailtub\data"

$action   = New-ScheduledTaskAction -Execute "C:\mailtub\mailtub.exe"
$trigger  = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "MailTub" `
  -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force
Start-ScheduledTask -TaskName "MailTub"
```

### Windows Firewall

```powershell
New-NetFirewallRule -DisplayName "MailTub HTTP" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
New-NetFirewallRule -DisplayName "MailTub SMTP" -Direction Inbound -Protocol TCP -LocalPort 2525 -Action Allow
```

---

## Android (Termux)

Run MailTub on your Android phone or tablet via [Termux](https://termux.dev/).

```bash
pkg update && pkg install curl tar
curl -fsSL https://raw.githubusercontent.com/dml-labs/mailtub/main/install.sh | bash
mailtub
```

Open `http://localhost:8080` in your mobile browser.

> **Note:** Termux runs at user level — port 2525 works, port 25 does not (Android blocks ports < 1024). For production SMTP you need a VPS.

---

## Docker

```bash
docker run -d \
  --name mailtub \
  --restart unless-stopped \
  -p 8080:8080 \
  -p 2525:2525 \
  -e MAILTUB_DOMAIN=mail.example.com \
  -e ADMIN_PASSWORD=$(openssl rand -hex 32) \
  -e DATABASE_PATH=/data/mailtub.db \
  -v mailtub_data:/data \
  ghcr.io/dml-labs/mailtub:latest
```

---

## Docker Compose

```yaml
# docker-compose.yml
version: '3.9'

services:
  mailtub:
    image: ghcr.io/dml-labs/mailtub:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
      - "2525:2525"
    environment:
      PORT: "8080"
      SMTP_PORT: "2525"
      MAILTUB_DOMAIN: mail.example.com
      DATABASE_PATH: /data/mailtub.db
      MAILBOX_TTL: 24h
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      API_KEY: ${API_KEY}
      LOG_LEVEL: info
    volumes:
      - mailtub_data:/data
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/api/v1/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

volumes:
  mailtub_data:
```

```bash
echo "ADMIN_PASSWORD=$(openssl rand -hex 32)" > .env
echo "API_KEY=$(openssl rand -hex 32)" >> .env
docker compose up -d
```

---

## Nginx Reverse Proxy

Drop this config into `/etc/nginx/sites-available/mailtub` and symlink it. Works with Certbot / Cloudflare for TLS.

```nginx
upstream mailtub {
    server 127.0.0.1:8080;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name mail.example.com;

    # ACME challenge for Certbot
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name mail.example.com;

    ssl_certificate     /etc/letsencrypt/live/mail.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mail.example.com/privkey.pem;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    client_max_body_size 30M;
    proxy_buffering off;

    # WebSocket — must be proxied with upgrade headers
    location /ws {
        proxy_pass         http://mailtub;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_read_timeout 86400;
    }

    # API + SPA frontend
    location / {
        proxy_pass         http://mailtub;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/mailtub /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Certbot (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d mail.example.com
```

---

## Fly.io

```bash
fly launch --name mailtub --region iad
fly secrets set ADMIN_PASSWORD=$(openssl rand -hex 32)
fly secrets set MAILTUB_DOMAIN=mailtub.fly.dev
fly volumes create mailtub_data --size 1
fly deploy
```

`fly.toml`:
```toml
[build]

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    handlers = ["http"]
    port = 80
    force_https = true

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

[mounts]
  source = "mailtub_data"
  destination = "/data"
```

---

## Building from Source

```bash
git clone https://github.com/dml-labs/mailtub
cd mailtub

# 1. Build the React frontend (output embedded into the binary)
cd web && pnpm install --ignore-workspace && pnpm build && cd ..

# 2. Build the Go binary
go build -buildvcs=false -ldflags="-s -w" -o bin/mailtub ./cmd/mailtub

# 3. Run
./bin/mailtub
```

Requirements: Go 1.25+, Node.js 22+, pnpm 10+

---

## Updating

### Binary

```bash
curl -L https://github.com/dml-labs/mailtub/releases/latest/download/mailtub_linux_amd64.tar.gz \
  | tar -xz -C /usr/local/bin
sudo systemctl restart mailtub
```

### Docker

```bash
docker pull ghcr.io/dml-labs/mailtub:latest
docker compose up -d --force-recreate
```

---

## Health Check Endpoint

```bash
curl http://localhost:8080/api/v1/health
# {"status":"ok","version":"v1.0.0","domain":"localhost","uptime":"3h22m"}
```

Use this for load balancer health checks and uptime monitoring.
