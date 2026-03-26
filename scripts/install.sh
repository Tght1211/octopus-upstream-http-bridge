#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OS_NAME="$(uname -s)"
DEFAULT_INSTALL_DIR="/opt/octopus-upstream-http-bridge"
DEFAULT_CONFIG_PATH="/etc/octopus-upstream-http-bridge/config.json"
DEFAULT_OPS_BIN_PATH="/usr/local/bin/octopus-bridgectl"
DEFAULT_METADATA_PATH="/etc/octopus-upstream-http-bridge/install.env"
DEFAULT_SERVICE_MANAGER="systemd"
DEFAULT_LAUNCHD_PLIST_PATH=""
DEFAULT_STDOUT_LOG_PATH=""
DEFAULT_STDERR_LOG_PATH=""

if [[ "${OS_NAME}" == "Darwin" ]]; then
  DEFAULT_INSTALL_DIR="/usr/local/lib/octopus-upstream-http-bridge"
  DEFAULT_CONFIG_PATH="/usr/local/etc/octopus-upstream-http-bridge/config.json"
  DEFAULT_METADATA_PATH="/usr/local/etc/octopus-upstream-http-bridge/install.env"
  DEFAULT_SERVICE_MANAGER="launchd"
  DEFAULT_LAUNCHD_PLIST_PATH="/Library/LaunchDaemons/octopus-upstream-http-bridge.plist"
  DEFAULT_STDOUT_LOG_PATH="/var/log/octopus-upstream-http-bridge.log"
  DEFAULT_STDERR_LOG_PATH="/var/log/octopus-upstream-http-bridge.error.log"
fi

INSTALL_DIR="${INSTALL_DIR:-${DEFAULT_INSTALL_DIR}}"
CONFIG_PATH="${CONFIG_PATH:-${DEFAULT_CONFIG_PATH}}"
SERVICE_NAME="${SERVICE_NAME:-octopus-upstream-http-bridge}"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
LISTEN_HOST="${LISTEN_HOST:-127.0.0.1}"
LISTEN_PORT="${LISTEN_PORT:-8330}"
UPSTREAM_BASE_URL="${UPSTREAM_BASE_URL:-}"
OPS_BIN_PATH="${OPS_BIN_PATH:-${DEFAULT_OPS_BIN_PATH}}"
METADATA_PATH="${METADATA_PATH:-${DEFAULT_METADATA_PATH}}"
FORCE_REWRITE_CONFIG="${FORCE_REWRITE_CONFIG:-0}"
SERVICE_MANAGER="${SERVICE_MANAGER:-${DEFAULT_SERVICE_MANAGER}}"
LAUNCHD_PLIST_PATH="${LAUNCHD_PLIST_PATH:-${DEFAULT_LAUNCHD_PLIST_PATH}}"
STDOUT_LOG_PATH="${STDOUT_LOG_PATH:-${DEFAULT_STDOUT_LOG_PATH}}"
STDERR_LOG_PATH="${STDERR_LOG_PATH:-${DEFAULT_STDERR_LOG_PATH}}"

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
  OPS_BIN_PATH=/usr/local/bin/octopus-bridgectl
  FORCE_REWRITE_CONFIG=0
  SERVICE_MANAGER=systemd|launchd
  LAUNCHD_PLIST_PATH=/Library/LaunchDaemons/octopus-upstream-http-bridge.plist
EOF
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "this command must be run with sudo"
    exit 1
  fi
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

require_root

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
chmod +x \
  "${INSTALL_DIR}/install.sh" \
  "${INSTALL_DIR}/uninstall.sh" \
  "${INSTALL_DIR}/ops.sh" \
  "${INSTALL_DIR}/scripts/install.sh" \
  "${INSTALL_DIR}/scripts/uninstall.sh" \
  "${INSTALL_DIR}/scripts/ops.sh"

if [[ "${SERVICE_MANAGER}" == "launchd" ]]; then
  mkdir -p "$(dirname "${LAUNCHD_PLIST_PATH}")" "$(dirname "${STDOUT_LOG_PATH}")"
fi

if [[ ! -f "${CONFIG_PATH}" || "${FORCE_REWRITE_CONFIG}" == "1" ]]; then
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
    "max_body_bytes": 10485760,
    "upstream_timeout_ms": 300000,
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
  },
  "server": {
    "headers_timeout_ms": 65000,
    "request_timeout_ms": 300000,
    "keep_alive_timeout_ms": 5000,
    "shutdown_timeout_ms": 15000
  }
}
EOF
  CONFIG_ACTION="generated"
else
  CONFIG_ACTION="preserved"
fi

cat > "${METADATA_PATH}" <<EOF
OS_NAME="${OS_NAME}"
INSTALL_DIR="${INSTALL_DIR}"
CONFIG_PATH="${CONFIG_PATH}"
SERVICE_NAME="${SERVICE_NAME}"
LISTEN_HOST="${LISTEN_HOST}"
LISTEN_PORT="${LISTEN_PORT}"
METADATA_PATH="${METADATA_PATH}"
SERVICE_MANAGER="${SERVICE_MANAGER}"
LAUNCHD_PLIST_PATH="${LAUNCHD_PLIST_PATH}"
STDOUT_LOG_PATH="${STDOUT_LOG_PATH}"
STDERR_LOG_PATH="${STDERR_LOG_PATH}"
EOF

install -m 0755 "${INSTALL_DIR}/scripts/ops.sh" "${OPS_BIN_PATH}"

if [[ "${SERVICE_MANAGER}" == "systemd" ]]; then
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
elif [[ "${SERVICE_MANAGER}" == "launchd" ]]; then
  cat > "${LAUNCHD_PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SERVICE_NAME}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${INSTALL_DIR}/src/index.mjs</string>
    <string>--config</string>
    <string>${CONFIG_PATH}</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${INSTALL_DIR}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${STDOUT_LOG_PATH}</string>

  <key>StandardErrorPath</key>
  <string>${STDERR_LOG_PATH}</string>
</dict>
</plist>
EOF

  launchctl bootout system "${LAUNCHD_PLIST_PATH}" >/dev/null 2>&1 || true
  launchctl bootstrap system "${LAUNCHD_PLIST_PATH}"
  launchctl enable "system/${SERVICE_NAME}" >/dev/null 2>&1 || true
  launchctl kickstart -k "system/${SERVICE_NAME}"
else
  echo "unsupported SERVICE_MANAGER: ${SERVICE_MANAGER}"
  exit 1
fi

echo "Installed to ${INSTALL_DIR}"
echo "Config: ${CONFIG_PATH}"
echo "Config Action: ${CONFIG_ACTION}"
echo "Service Manager: ${SERVICE_MANAGER}"
if [[ "${SERVICE_MANAGER}" == "systemd" ]]; then
  echo "Service: ${SERVICE_NAME}.service"
else
  echo "Launchd Label: ${SERVICE_NAME}"
  echo "Launchd Plist: ${LAUNCHD_PLIST_PATH}"
  echo "Stdout Log: ${STDOUT_LOG_PATH}"
  echo "Stderr Log: ${STDERR_LOG_PATH}"
fi
echo "Upstream: ${UPSTREAM_BASE_URL}"
echo "Bridge URL: http://${LISTEN_HOST}:${LISTEN_PORT}/v1"
echo "Ops Command: ${OPS_BIN_PATH}"
echo "Try:"
echo "  sudo $(basename "${OPS_BIN_PATH}") status"
echo "  sudo $(basename "${OPS_BIN_PATH}") logs 100"
echo "  sudo $(basename "${OPS_BIN_PATH}") config-show"
