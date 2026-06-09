#!/usr/bin/env bash
# MailTub Updater — Linux, macOS, Termux
# Stops the running service, installs the latest release, restarts.
# Usage: bash update.sh [--version v1.1.0] [--dir /usr/local/bin]
#
# Copyright 2026 DML Labs — Apache 2.0

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
SERVICE_NAME="mailtub"
REQUESTED_VERSION=""

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${CYAN}[mailtub]${NC} $*"; }
ok()   { echo -e "${GREEN}[mailtub]${NC} $*"; }

while [[ $# -gt 0 ]]; do
  case $1 in
    --version) REQUESTED_VERSION="$2"; shift 2 ;;
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Show current version
CURRENT="$("${INSTALL_DIR}/mailtub" --version 2>/dev/null | head -1 || echo "unknown")"
info "Current version: ${CURRENT}"

# Stop service if running
WAS_RUNNING=false
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  info "Stopping $SERVICE_NAME..."
  sudo systemctl stop "$SERVICE_NAME"
  WAS_RUNNING=true
fi

# Run installer
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/install.sh" ]]; then
  INSTALLER="$SCRIPT_DIR/install.sh"
else
  INSTALLER="$(mktemp)"
  trap 'rm -f "$INSTALLER"' EXIT
  curl -fsSL https://raw.githubusercontent.com/dml-labs/mailtub/main/install.sh -o "$INSTALLER"
fi

ARGS=(--dir "$INSTALL_DIR" --no-service)
[[ -n "$REQUESTED_VERSION" ]] && ARGS+=(--version "$REQUESTED_VERSION")
bash "$INSTALLER" "${ARGS[@]}"

# Restart service
if [[ "$WAS_RUNNING" == true ]]; then
  info "Restarting $SERVICE_NAME..."
  sudo systemctl start "$SERVICE_NAME"
  ok "$SERVICE_NAME restarted"
fi

NEW="$("${INSTALL_DIR}/mailtub" --version 2>/dev/null | head -1 || echo "unknown")"
ok "Update complete: ${CURRENT} → ${NEW}"
