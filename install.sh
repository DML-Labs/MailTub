#!/usr/bin/env bash
# MailTub Installer — Linux, macOS, Termux
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/dml-labs/mailtub/main/install.sh | bash
#   bash install.sh [--dir /usr/local/bin] [--version v1.0.0] [--no-service]
#
# Copyright 2026 DML Labs — Apache 2.0

set -euo pipefail

REPO="dml-labs/mailtub"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
DATA_DIR="${DATA_DIR:-$HOME/.mailtub}"
SERVICE_NAME="mailtub"
NO_SERVICE=false
REQUESTED_VERSION=""

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[mailtub]${NC} $*"; }
ok()    { echo -e "${GREEN}[mailtub]${NC} $*"; }
warn()  { echo -e "${YELLOW}[mailtub]${NC} $*"; }
die()   { echo -e "${RED}[mailtub] ERROR:${NC} $*" >&2; exit 1; }

# ── Arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --dir)       INSTALL_DIR="$2"; shift 2 ;;
    --version)   REQUESTED_VERSION="$2"; shift 2 ;;
    --no-service) NO_SERVICE=true; shift ;;
    *) die "Unknown option: $1" ;;
  esac
done

# ── Platform detection ────────────────────────────────────────────────────────
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64)  ARCH_SLUG="amd64" ;;
  aarch64|arm64) ARCH_SLUG="arm64" ;;
  armv7*)  ARCH_SLUG="arm" ;;
  *) die "Unsupported architecture: $ARCH" ;;
esac

case "$OS" in
  linux)  OS_SLUG="linux" ;;
  darwin) OS_SLUG="darwin" ;;
  *)
    # Termux (Android)
    if [[ -n "${TERMUX_VERSION:-}" ]]; then
      OS_SLUG="linux"
      INSTALL_DIR="${INSTALL_DIR:-$PREFIX/bin}"
      DATA_DIR="${DATA_DIR:-$HOME/.mailtub}"
      NO_SERVICE=true
    else
      die "Unsupported OS: $OS. Use install.ps1 on Windows."
    fi
    ;;
esac

# ── Resolve version ───────────────────────────────────────────────────────────
if [[ -z "$REQUESTED_VERSION" ]]; then
  info "Fetching latest release..."
  REQUESTED_VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"
  [[ -n "$REQUESTED_VERSION" ]] || die "Failed to determine latest version"
fi
info "Installing MailTub ${REQUESTED_VERSION} (${OS_SLUG}/${ARCH_SLUG})"

# ── Download ──────────────────────────────────────────────────────────────────
ARCHIVE="mailtub_${REQUESTED_VERSION#v}_${OS_SLUG}_${ARCH_SLUG}.tar.gz"
URL="https://github.com/${REPO}/releases/download/${REQUESTED_VERSION}/${ARCHIVE}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

info "Downloading ${ARCHIVE}..."
curl -fsSL "$URL" -o "$TMP/$ARCHIVE" || die "Download failed: $URL"

info "Extracting..."
tar -xzf "$TMP/$ARCHIVE" -C "$TMP"

# ── Install binary ────────────────────────────────────────────────────────────
BINARY="$TMP/mailtub"
[[ -f "$BINARY" ]] || BINARY="$(find "$TMP" -name mailtub -type f | head -1)"
[[ -f "$BINARY" ]] || die "Binary not found in archive"

mkdir -p "$INSTALL_DIR"
if [[ ! -w "$INSTALL_DIR" ]]; then
  warn "Installing to $INSTALL_DIR requires sudo..."
  sudo install -m 755 "$BINARY" "$INSTALL_DIR/mailtub"
else
  install -m 755 "$BINARY" "$INSTALL_DIR/mailtub"
fi

# ── Data directory ────────────────────────────────────────────────────────────
mkdir -p "$DATA_DIR"
info "Data directory: $DATA_DIR"

# ── systemd service (Linux only) ──────────────────────────────────────────────
if [[ "$NO_SERVICE" == false && "$OS_SLUG" == "linux" && -d /etc/systemd/system ]]; then
  SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
  info "Installing systemd service..."
  sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=MailTub — Self-hosted Disposable Email Service
After=network.target
Documentation=https://github.com/dml-labs/mailtub

[Service]
Type=simple
User=${USER:-mailtub}
WorkingDirectory=${DATA_DIR}
ExecStart=${INSTALL_DIR}/mailtub serve
Restart=on-failure
RestartSec=5
Environment=PORT=8080
Environment=SMTP_PORT=2525
Environment=DATABASE_PATH=${DATA_DIR}/mailtub.db
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  ok "systemd service installed: ${SERVICE_FILE}"
  info "Start with: sudo systemctl enable --now ${SERVICE_NAME}"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
ok "MailTub ${REQUESTED_VERSION} installed to ${INSTALL_DIR}/mailtub"
echo
echo "  Quick start:"
echo "    mailtub serve                          # Start server (HTTP :8080, SMTP :2525)"
echo "    mailtub new                            # Create a mailbox"
echo "    mailtub --version                      # Show version"
echo
echo "  Docs: https://github.com/dml-labs/mailtub"
