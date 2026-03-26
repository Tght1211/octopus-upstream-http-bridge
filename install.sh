#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${INSTALL_DIR:-/opt/octopus-upstream-http-bridge}"
CONFIG_PATH="${CONFIG_PATH:-/etc/octopus-upstream-http-bridge/config.json}"
SERVICE_NAME="${SERVICE_NAME:-octopus-upstream-http-bridge}"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
LISTEN_HOST="${LISTEN_HOST:-127.0.0.1}"
LISTEN_PORT="${LISTEN_PORT:-8330}"
UPSTREAM_BASE_URL="${UPSTREAM_BASE_URL:-}"

usage() {
  cat <<'EOF'
Usage:
  bash install.sh --upstream-url https://your-upstream-host
  bash install.sh https://your-upstream-host

Optional env:
  UPSTREAM_BASE_URL=https://your-upstream-host
  INSTALL_DIR=/opt/octopus-upstream-http-bridge
  CONFIG_PATH=/etc/octopus-upstream-http-bridge/config.json
  SERVICE_NAME=octopus-upstream-http-bridge
  NODE_BIN=/usr/bin/node
  LISTEN_HOST=127.0.0.1
  LISTEN_PORT=8330
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --upstream-url)
      if [[ $# -lt 2 ]]; then
        echo "--upstream-url requires a value"
        exit 1
      fi
      UPSTREAM_BASE_URL="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -z "${UPSTREAM_BASE_URL}" ]]; then
        UPSTREAM_BASE_URL="$1"
        shift
      else
        echo "unexpected argument: $1"
        usage
        exit 1
      fi
      ;;
  esac
done

if [[ -z "${UPSTREAM_BASE_URL}" ]]; then
  read -r -p "Upstream API base URL: " UPSTREAM_BASE_URL
fi

if [[ -z "${NODE_BIN}" ]]; then
  echo "node not found in PATH"
  exit 1
fi

if [[ -z "${UPSTREAM_BASE_URL}" ]]; then
  echo "upstream API base URL is required"
  exit 1
fi

if ! [[ "${LISTEN_PORT}" =~ ^[0-9]+$ ]]; then
  echo "LISTEN_PORT must be a number"
  exit 1
fi

if ! [[ "${UPSTREAM_BASE_URL}" =~ ^https?:// ]]; then
  echo "upstream API base URL must start with http:// or https://"
  exit 1
fi

mkdir -p "${INSTALL_DIR}" "$(dirname "${CONFIG_PATH}")"
cp -a "${REPO_DIR}/." "${INSTALL_DIR}/"

cat > "${CONFIG_PATH}" <<EOF
{
  "listen": {
    "host": "${LISTEN_HOST}",
    "port": ${LISTEN_PORT}
  },
  "upstream": {
    "base_url": "${UPSTREAM_BASE_URL}"
  },
  "proxy": {
    "require_authorization": true,
    "strip_request_headers": [
      "host",
      "content-length",
      "connection",
      "keep-alive",
      "transfer-encoding",
      "accept-encoding"
    ],
    "strip_response_headers": [
      "content-length",
      "connection",
      "transfer-encoding",
      "content-encoding"
    ]
  }
}
EOF

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
echo "Upstream: ${UPSTREAM_BASE_URL}"
echo "Bridge URL: http://${LISTEN_HOST}:${LISTEN_PORT}/v1"
