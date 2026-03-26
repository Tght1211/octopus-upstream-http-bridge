#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/octopus-upstream-http-bridge}"
SERVICE_NAME="${SERVICE_NAME:-octopus-upstream-http-bridge}"
OPS_BIN_PATH="${OPS_BIN_PATH:-/usr/local/bin/octopus-bridgectl}"
METADATA_PATH="${METADATA_PATH:-/etc/octopus-upstream-http-bridge/install.env}"

systemctl disable --now "${SERVICE_NAME}.service" || true
rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
rm -f "${OPS_BIN_PATH}"
rm -f "${METADATA_PATH}"
systemctl daemon-reload

echo "Service removed: ${SERVICE_NAME}.service"
echo "Ops command removed: ${OPS_BIN_PATH}"
echo "Project files kept at: ${INSTALL_DIR}"
