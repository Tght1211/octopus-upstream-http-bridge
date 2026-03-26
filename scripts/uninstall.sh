#!/usr/bin/env bash
set -euo pipefail

OS_NAME="$(uname -s)"
DEFAULT_INSTALL_DIR="/opt/octopus-upstream-http-bridge"
DEFAULT_METADATA_PATH="/etc/octopus-upstream-http-bridge/install.env"
DEFAULT_OPS_BIN_PATH="/usr/local/bin/octopus-bridgectl"
DEFAULT_SERVICE_MANAGER="systemd"
DEFAULT_LAUNCHD_PLIST_PATH=""

if [[ "${OS_NAME}" == "Darwin" ]]; then
  DEFAULT_INSTALL_DIR="/usr/local/lib/octopus-upstream-http-bridge"
  DEFAULT_METADATA_PATH="/usr/local/etc/octopus-upstream-http-bridge/install.env"
  DEFAULT_SERVICE_MANAGER="launchd"
  DEFAULT_LAUNCHD_PLIST_PATH="/Library/LaunchDaemons/octopus-upstream-http-bridge.plist"
fi

INSTALL_DIR="${INSTALL_DIR:-${DEFAULT_INSTALL_DIR}}"
SERVICE_NAME="${SERVICE_NAME:-octopus-upstream-http-bridge}"
OPS_BIN_PATH="${OPS_BIN_PATH:-${DEFAULT_OPS_BIN_PATH}}"
METADATA_PATH="${METADATA_PATH:-${DEFAULT_METADATA_PATH}}"
SERVICE_MANAGER="${SERVICE_MANAGER:-${DEFAULT_SERVICE_MANAGER}}"
LAUNCHD_PLIST_PATH="${LAUNCHD_PLIST_PATH:-${DEFAULT_LAUNCHD_PLIST_PATH}}"

if [[ -f "${METADATA_PATH}" ]]; then
  # shellcheck disable=SC1090
  source "${METADATA_PATH}"
fi

if [[ "${SERVICE_MANAGER}" == "systemd" ]]; then
  systemctl disable --now "${SERVICE_NAME}.service" || true
  rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
elif [[ "${SERVICE_MANAGER}" == "launchd" ]]; then
  launchctl bootout system "${LAUNCHD_PLIST_PATH}" >/dev/null 2>&1 || true
  rm -f "${LAUNCHD_PLIST_PATH}"
fi

rm -f "${OPS_BIN_PATH}"
rm -f "${METADATA_PATH}"

echo "Service Manager: ${SERVICE_MANAGER}"
if [[ "${SERVICE_MANAGER}" == "systemd" ]]; then
  echo "Service removed: ${SERVICE_NAME}.service"
else
  echo "Launchd label removed: ${SERVICE_NAME}"
  echo "Launchd plist removed: ${LAUNCHD_PLIST_PATH}"
fi
echo "Ops command removed: ${OPS_BIN_PATH}"
echo "Project files kept at: ${INSTALL_DIR}"
