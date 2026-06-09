#!/usr/bin/env bash
# MailTub Uninstaller — Linux, macOS, Termux
# Usage: bash uninstall.sh [--keep-data] [--dir /usr/local/bin]
#
# Copyright 2026 DML Labs — Apache 2.0

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
SERVICE_NAME="mailtub"
KEEP_DATA=false

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${CYAN}[mailtub]${NC} $*"; }
ok()   { echo -e "${GREEN}[mailtub]${NC} $*"; }
warn() { echo -e "${YELLOW}[mailtub]${NC} $*"; }

while [[ $# -gt 0 ]]; do
  case $1 in
    --keep-data) KEEP_DATA=true; shift ;;
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Stop + disable systemd service
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  info "Stopping $SERVICE_NAME service..."
  sudo systemctl stop "$SERVICE_NAME" || true
fi
if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
  sudo systemctl disable "$SERVICE_NAME" || true
fi
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
if [[ -f "$SERVICE_FILE" ]]; then
  sudo rm -f "$SERVICE_FILE"
  sudo systemctl daemon-reload
  ok "Removed systemd service"
fi

# Remove binary
BINARY="$INSTALL_DIR/mailtub"
if [[ -f "$BINARY" ]]; then
  if [[ -w "$INSTALL_DIR" ]]; then
    rm -f "$BINARY"
  else
    sudo rm -f "$BINARY"
  fi
  ok "Removed $BINARY"
else
  warn "Binary not found at $BINARY — already removed?"
fi

# Data directory
if [[ "$KEEP_DATA" == false ]]; then
  DATA_DIR="${DATA_DIR:-$HOME/.mailtub}"
  if [[ -d "$DATA_DIR" ]]; then
    warn "Removing data directory: $DATA_DIR"
    read -rp "  Are you sure? This deletes all stored emails. [y/N] " confirm
    if [[ "${confirm,,}" == "y" ]]; then
      rm -rf "$DATA_DIR"
      ok "Data directory removed"
    else
      ok "Keeping data directory"
    fi
  fi
else
  ok "Data directory preserved (--keep-data)"
fi

ok "MailTub uninstalled successfully"
