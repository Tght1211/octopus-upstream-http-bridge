#!/usr/bin/env bash
set -euo pipefail

OS_NAME="$(uname -s)"
DEFAULT_INSTALL_DIR="/opt/octopus-upstream-http-bridge"
DEFAULT_CONFIG_PATH="/etc/octopus-upstream-http-bridge/config.json"
DEFAULT_METADATA_PATH="/etc/octopus-upstream-http-bridge/install.env"
DEFAULT_SERVICE_NAME="octopus-upstream-http-bridge"
DEFAULT_LISTEN_HOST="127.0.0.1"
DEFAULT_LISTEN_PORT="8330"
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

INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
CONFIG_PATH="${CONFIG_PATH:-$DEFAULT_CONFIG_PATH}"
METADATA_PATH="${METADATA_PATH:-$DEFAULT_METADATA_PATH}"
SERVICE_NAME="${SERVICE_NAME:-$DEFAULT_SERVICE_NAME}"
LISTEN_HOST="${LISTEN_HOST:-$DEFAULT_LISTEN_HOST}"
LISTEN_PORT="${LISTEN_PORT:-$DEFAULT_LISTEN_PORT}"
SERVICE_MANAGER="${SERVICE_MANAGER:-$DEFAULT_SERVICE_MANAGER}"
LAUNCHD_PLIST_PATH="${LAUNCHD_PLIST_PATH:-$DEFAULT_LAUNCHD_PLIST_PATH}"
STDOUT_LOG_PATH="${STDOUT_LOG_PATH:-$DEFAULT_STDOUT_LOG_PATH}"
STDERR_LOG_PATH="${STDERR_LOG_PATH:-$DEFAULT_STDERR_LOG_PATH}"

if [[ -f "${METADATA_PATH}" ]]; then
  # shellcheck disable=SC1090
  source "${METADATA_PATH}"
fi

usage() {
  cat <<EOF
Usage:
  octopus-bridgectl summary
  octopus-bridgectl status
  octopus-bridgectl health
  octopus-bridgectl ready
  octopus-bridgectl doctor
  octopus-bridgectl logs [lines]
  octopus-bridgectl follow
  octopus-bridgectl restart
  octopus-bridgectl start
  octopus-bridgectl stop
  octopus-bridgectl config-path
  octopus-bridgectl config-show
  octopus-bridgectl config-edit
  octopus-bridgectl update
  octopus-bridgectl commands

Resolved values:
  service_manager: ${SERVICE_MANAGER}
  service: ${SERVICE_NAME}
  config:  ${CONFIG_PATH}
  bridge:  http://${LISTEN_HOST}:${LISTEN_PORT}/v1
EOF
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "this command must be run with sudo"
    exit 1
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "required command not found: $1"
    exit 1
  fi
}

print_commands() {
  cat <<EOF
Common operations:
  sudo octopus-bridgectl status
  sudo octopus-bridgectl health
  sudo octopus-bridgectl ready
  sudo octopus-bridgectl doctor
  sudo octopus-bridgectl logs 100
  sudo octopus-bridgectl follow
  sudo octopus-bridgectl restart
  sudo octopus-bridgectl config-show
  sudo octopus-bridgectl config-edit
  sudo octopus-bridgectl update
EOF
}

show_summary() {
  local service_identifier="${SERVICE_NAME}.service"
  if [[ "${SERVICE_MANAGER}" == "launchd" ]]; then
    service_identifier="${SERVICE_NAME}"
  fi

  cat <<EOF
service=${service_identifier}
service_manager=${SERVICE_MANAGER}
install_dir=${INSTALL_DIR}
config_path=${CONFIG_PATH}
bridge_url=http://${LISTEN_HOST}:${LISTEN_PORT}/v1
health_url=http://${LISTEN_HOST}:${LISTEN_PORT}/health
ready_url=http://${LISTEN_HOST}:${LISTEN_PORT}/ready
metadata_path=${METADATA_PATH}
launchd_plist_path=${LAUNCHD_PLIST_PATH}
stdout_log_path=${STDOUT_LOG_PATH}
stderr_log_path=${STDERR_LOG_PATH}
EOF
}

request_probe() {
  require_command curl
  curl -fsS "$1"
  printf '\n'
}

show_health() {
  request_probe "http://${LISTEN_HOST}:${LISTEN_PORT}/health"
}

show_ready() {
  request_probe "http://${LISTEN_HOST}:${LISTEN_PORT}/ready"
}

show_logs() {
  local lines="${1:-50}"
  if [[ "${SERVICE_MANAGER}" == "systemd" ]]; then
    journalctl -u "${SERVICE_NAME}.service" -n "${lines}" --no-pager
  else
    echo "--- stdout (${STDOUT_LOG_PATH}) ---"
    tail -n "${lines}" "${STDOUT_LOG_PATH}" 2>/dev/null || true
    echo "--- stderr (${STDERR_LOG_PATH}) ---"
    tail -n "${lines}" "${STDERR_LOG_PATH}" 2>/dev/null || true
  fi
}

follow_logs() {
  if [[ "${SERVICE_MANAGER}" == "systemd" ]]; then
    journalctl -u "${SERVICE_NAME}.service" -f
  else
    touch "${STDOUT_LOG_PATH}" "${STDERR_LOG_PATH}"
    tail -f "${STDOUT_LOG_PATH}" "${STDERR_LOG_PATH}"
  fi
}

run_doctor() {
  local checks_failed=0

  echo "[doctor] summary"
  show_summary
  echo

  echo "[doctor] config file"
  if [[ -f "${CONFIG_PATH}" ]]; then
    echo "ok: config exists at ${CONFIG_PATH}"
  else
    echo "fail: config missing at ${CONFIG_PATH}"
    checks_failed=1
  fi
  echo

  echo "[doctor] service state"
  if [[ "${SERVICE_MANAGER}" == "systemd" ]]; then
    if systemctl is-active --quiet "${SERVICE_NAME}.service"; then
      echo "ok: ${SERVICE_NAME}.service is active"
    else
      echo "fail: ${SERVICE_NAME}.service is not active"
      checks_failed=1
    fi
  else
    if launchctl print "system/${SERVICE_NAME}" >/dev/null 2>&1; then
      echo "ok: launchd label ${SERVICE_NAME} is loaded"
    else
      echo "fail: launchd label ${SERVICE_NAME} is not loaded"
      checks_failed=1
    fi
  fi
  echo

  echo "[doctor] health probe"
  if curl -fsS "http://${LISTEN_HOST}:${LISTEN_PORT}/health" >/tmp/octopus-bridge-health.out 2>/tmp/octopus-bridge-health.err; then
    cat /tmp/octopus-bridge-health.out
    printf '\n'
  else
    echo "fail: /health probe failed"
    cat /tmp/octopus-bridge-health.err 2>/dev/null || true
    checks_failed=1
  fi
  echo

  echo "[doctor] ready probe"
  if curl -fsS "http://${LISTEN_HOST}:${LISTEN_PORT}/ready" >/tmp/octopus-bridge-ready.out 2>/tmp/octopus-bridge-ready.err; then
    cat /tmp/octopus-bridge-ready.out
    printf '\n'
  else
    echo "fail: /ready probe failed"
    cat /tmp/octopus-bridge-ready.err 2>/dev/null || true
    checks_failed=1
  fi
  echo

  echo "[doctor] recent errors"
  if [[ "${SERVICE_MANAGER}" == "systemd" ]]; then
    if command -v rg >/dev/null 2>&1; then
      journalctl -u "${SERVICE_NAME}.service" -n 100 --no-pager | rg '"level":"error"|"level":"warn"' || true
    else
      journalctl -u "${SERVICE_NAME}.service" -n 100 --no-pager | grep -E '"level":"(error|warn)"' || true
    fi
  else
    echo "--- stdout (${STDOUT_LOG_PATH}) ---"
    tail -n 100 "${STDOUT_LOG_PATH}" 2>/dev/null | grep -E '"level":"(error|warn)"' || true
    echo "--- stderr (${STDERR_LOG_PATH}) ---"
    tail -n 100 "${STDERR_LOG_PATH}" 2>/dev/null | grep -E '"level":"(error|warn)"' || true
  fi
  echo

  rm -f /tmp/octopus-bridge-health.out /tmp/octopus-bridge-health.err /tmp/octopus-bridge-ready.out /tmp/octopus-bridge-ready.err

  if [[ "${checks_failed}" -eq 0 ]]; then
    echo "[doctor] ok"
  else
    echo "[doctor] failed"
    exit 1
  fi
}

show_config() {
  cat "${CONFIG_PATH}"
}

edit_config() {
  require_root
  "${EDITOR:-vi}" "${CONFIG_PATH}"
}

run_update() {
  require_root
  require_command node

  if [[ ! -x "${INSTALL_DIR}/scripts/install.sh" ]]; then
    echo "install script not found: ${INSTALL_DIR}/scripts/install.sh"
    exit 1
  fi

  UPSTREAM_BASE_URL="$(node --input-type=module -e "import fs from 'node:fs'; const cfg = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); process.stdout.write(String(cfg?.upstream?.base_url || ''));" "${CONFIG_PATH}")"
  if [[ -z "${UPSTREAM_BASE_URL}" ]]; then
    echo "failed to read upstream base URL from ${CONFIG_PATH}"
    exit 1
  fi

  INSTALL_DIR="${INSTALL_DIR}" \
  CONFIG_PATH="${CONFIG_PATH}" \
  SERVICE_NAME="${SERVICE_NAME}" \
  LISTEN_HOST="${LISTEN_HOST}" \
  LISTEN_PORT="${LISTEN_PORT}" \
  SERVICE_MANAGER="${SERVICE_MANAGER}" \
  LAUNCHD_PLIST_PATH="${LAUNCHD_PLIST_PATH}" \
  STDOUT_LOG_PATH="${STDOUT_LOG_PATH}" \
  STDERR_LOG_PATH="${STDERR_LOG_PATH}" \
  UPSTREAM_BASE_URL="${UPSTREAM_BASE_URL}" \
  bash "${INSTALL_DIR}/scripts/install.sh"
}

cmd="${1:-summary}"

case "${cmd}" in
  -h|--help|help)
    usage
    ;;
  summary)
    show_summary
    ;;
  commands)
    print_commands
    ;;
  status)
    if [[ "${SERVICE_MANAGER}" == "systemd" ]]; then
      systemctl status "${SERVICE_NAME}.service" --no-pager
    else
      launchctl print "system/${SERVICE_NAME}"
    fi
    ;;
  health)
    show_health
    ;;
  ready)
    show_ready
    ;;
  doctor)
    run_doctor
    ;;
  logs)
    show_logs "${2:-50}"
    ;;
  follow)
    follow_logs
    ;;
  restart)
    require_root
    if [[ "${SERVICE_MANAGER}" == "systemd" ]]; then
      systemctl restart "${SERVICE_NAME}.service"
      systemctl status "${SERVICE_NAME}.service" --no-pager
    else
      launchctl kickstart -k "system/${SERVICE_NAME}"
      launchctl print "system/${SERVICE_NAME}"
    fi
    ;;
  start)
    require_root
    if [[ "${SERVICE_MANAGER}" == "systemd" ]]; then
      systemctl start "${SERVICE_NAME}.service"
      systemctl status "${SERVICE_NAME}.service" --no-pager
    else
      launchctl bootstrap system "${LAUNCHD_PLIST_PATH}" >/dev/null 2>&1 || true
      launchctl kickstart -k "system/${SERVICE_NAME}"
      launchctl print "system/${SERVICE_NAME}"
    fi
    ;;
  stop)
    require_root
    if [[ "${SERVICE_MANAGER}" == "systemd" ]]; then
      systemctl stop "${SERVICE_NAME}.service"
      systemctl status "${SERVICE_NAME}.service" --no-pager || true
    else
      launchctl bootout system "${LAUNCHD_PLIST_PATH}" >/dev/null 2>&1 || true
      launchctl print "system/${SERVICE_NAME}" >/dev/null 2>&1 || true
    fi
    ;;
  config-path)
    printf '%s\n' "${CONFIG_PATH}"
    ;;
  config-show)
    show_config
    ;;
  config-edit)
    edit_config
    ;;
  update)
    run_update
    ;;
  *)
    echo "unknown command: ${cmd}"
    usage
    exit 1
    ;;
esac
