#!/usr/bin/env bash
set -euo pipefail

DEFAULT_INSTALL_DIR="/opt/octopus-upstream-http-bridge"
DEFAULT_CONFIG_PATH="/etc/octopus-upstream-http-bridge/config.json"
DEFAULT_METADATA_PATH="/etc/octopus-upstream-http-bridge/install.env"
DEFAULT_SERVICE_NAME="octopus-upstream-http-bridge"
DEFAULT_LISTEN_HOST="127.0.0.1"
DEFAULT_LISTEN_PORT="8330"

INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
CONFIG_PATH="${CONFIG_PATH:-$DEFAULT_CONFIG_PATH}"
METADATA_PATH="${METADATA_PATH:-$DEFAULT_METADATA_PATH}"
SERVICE_NAME="${SERVICE_NAME:-$DEFAULT_SERVICE_NAME}"
LISTEN_HOST="${LISTEN_HOST:-$DEFAULT_LISTEN_HOST}"
LISTEN_PORT="${LISTEN_PORT:-$DEFAULT_LISTEN_PORT}"

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
  service: ${SERVICE_NAME}.service
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
  sudo octopus-bridgectl logs 100
  sudo octopus-bridgectl follow
  sudo octopus-bridgectl restart
  sudo octopus-bridgectl config-show
  sudo octopus-bridgectl config-edit
  sudo octopus-bridgectl update
EOF
}

show_summary() {
  cat <<EOF
service=${SERVICE_NAME}.service
install_dir=${INSTALL_DIR}
config_path=${CONFIG_PATH}
bridge_url=http://${LISTEN_HOST}:${LISTEN_PORT}/v1
health_url=http://${LISTEN_HOST}:${LISTEN_PORT}/health
metadata_path=${METADATA_PATH}
EOF
}

show_health() {
  require_command curl
  curl -fsS "http://${LISTEN_HOST}:${LISTEN_PORT}/health"
  printf '\n'
}

show_logs() {
  local lines="${1:-50}"
  journalctl -u "${SERVICE_NAME}.service" -n "${lines}" --no-pager
}

follow_logs() {
  journalctl -u "${SERVICE_NAME}.service" -f
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
  if [[ ! -x "${INSTALL_DIR}/install.sh" ]]; then
    echo "install script not found: ${INSTALL_DIR}/install.sh"
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
  UPSTREAM_BASE_URL="${UPSTREAM_BASE_URL}" \
  bash "${INSTALL_DIR}/install.sh"
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
    systemctl status "${SERVICE_NAME}.service" --no-pager
    ;;
  health)
    show_health
    ;;
  logs)
    show_logs "${2:-50}"
    ;;
  follow)
    follow_logs
    ;;
  restart)
    require_root
    systemctl restart "${SERVICE_NAME}.service"
    systemctl status "${SERVICE_NAME}.service" --no-pager
    ;;
  start)
    require_root
    systemctl start "${SERVICE_NAME}.service"
    systemctl status "${SERVICE_NAME}.service" --no-pager
    ;;
  stop)
    require_root
    systemctl stop "${SERVICE_NAME}.service"
    systemctl status "${SERVICE_NAME}.service" --no-pager || true
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
