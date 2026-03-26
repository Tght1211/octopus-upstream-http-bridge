#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${INSTALL_DIR:-/opt/octopus-upstream-http-bridge}"
CONFIG_PATH="${CONFIG_PATH:-/etc/octopus-upstream-http-bridge/config.json}"
SERVICE_NAME="${SERVICE_NAME:-octopus-upstream-http-bridge}"
NODE_BIN="${NODE_BIN:-$(command -v node)}"

if [[ -z "${NODE_BIN}" ]]; then
  echo "node not found in PATH"
  exit 1
fi

mkdir -p "${INSTALL_DIR}" "$(dirname "${CONFIG_PATH}")"
cp -a "${REPO_DIR}/." "${INSTALL_DIR}/"

if [[ ! -f "${CONFIG_PATH}" ]]; then
  cp "${INSTALL_DIR}/config.example.json" "${CONFIG_PATH}"
fi

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Octopus Upstream HTTP Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
ExecStart=${NODE_BIN} ${INSTALL_DIR}/src/index.mjs --config ${CONFIG_PATH}
Restart=always
RestartSec=2
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}.service"

echo "Installed to ${INSTALL_DIR}"
echo "Config: ${CONFIG_PATH}"
echo "Service: ${SERVICE_NAME}.service"
