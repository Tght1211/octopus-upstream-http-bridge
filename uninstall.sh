#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/octopus-upstream-http-bridge}"
SERVICE_NAME="${SERVICE_NAME:-octopus-upstream-http-bridge}"

systemctl disable --now "${SERVICE_NAME}.service" || true
rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload

echo "Service removed: ${SERVICE_NAME}.service"
echo "Project files kept at: ${INSTALL_DIR}"
