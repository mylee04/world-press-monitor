#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

LAUNCHD_DOMAIN="gui/$(id -u)"
API_NEWS_LABEL="${WPR_API_NEWS_LABEL:-com.wpr.api-news}"
API_TUNNEL_LABEL="${WPR_API_TUNNEL_LABEL:-com.wpr.api-tunnel}"
API_NEWS_PLIST="${HOME}/Library/LaunchAgents/${API_NEWS_LABEL}.plist"
API_TUNNEL_PLIST="${HOME}/Library/LaunchAgents/${API_TUNNEL_LABEL}.plist"
PUBLIC_HEALTH_URL="${WPR_PUBLIC_API_HEALTH_URL:-${WPM_PUBLIC_API_HEALTH_URL:-https://api.worldpressradar.com/health}}"
LOCAL_HEALTH_URL="${WPR_LOCAL_API_HEALTH_URL:-${WPM_LOCAL_API_HEALTH_URL:-http://127.0.0.1:${NEWS_API_PORT:-4100}/health}}"
LOG_DIR="${WPR_LOG_DIR:-${WPM_LOG_DIR:-${PROJECT_ROOT}/logs}}"
LOG_FILE="${LOG_DIR}/api-runtime-watchdog.log"

mkdir -p "${LOG_DIR}"

timestamp() {
  date -u '+%Y-%m-%d %H:%M:%S %Z'
}

service_exists() {
  launchctl print "${LAUNCHD_DOMAIN}/$1" >/dev/null 2>&1
}

ensure_loaded() {
  local label=$1
  local plist_path=$2

  if service_exists "${label}"; then
    return 0
  fi

  if [ -f "${plist_path}" ]; then
    launchctl enable "${LAUNCHD_DOMAIN}/${label}" >/dev/null 2>&1 || true
    launchctl bootstrap "${LAUNCHD_DOMAIN}" "${plist_path}" >/dev/null 2>&1 || true
  fi
}

restart_service() {
  local label=$1
  local plist_path=$2

  ensure_loaded "${label}" "${plist_path}"
  launchctl kickstart -k "${LAUNCHD_DOMAIN}/${label}" >/dev/null 2>&1 || true
}

http_status() {
  curl --max-time 10 -sS -o /dev/null -w '%{http_code}' "$1" || true
}

{
  printf '\n[%s] Watchdog run\n' "$(timestamp)"

  local_status="$(http_status "${LOCAL_HEALTH_URL}")"
  printf 'Local API health: %s (%s)\n' "${local_status:-curl-error}" "${LOCAL_HEALTH_URL}"
  if [ "${local_status}" != "200" ]; then
    printf 'Action: restart %s\n' "${API_NEWS_LABEL}"
    restart_service "${API_NEWS_LABEL}" "${API_NEWS_PLIST}"
    sleep 2
    local_status="$(http_status "${LOCAL_HEALTH_URL}")"
    printf 'Local API health after restart: %s\n' "${local_status:-curl-error}"
  fi

  public_status="$(http_status "${PUBLIC_HEALTH_URL}")"
  printf 'Public API health: %s (%s)\n' "${public_status:-curl-error}" "${PUBLIC_HEALTH_URL}"
  if [ "${public_status}" != "200" ]; then
    printf 'Action: restart %s\n' "${API_TUNNEL_LABEL}"
    restart_service "${API_TUNNEL_LABEL}" "${API_TUNNEL_PLIST}"
    sleep 3
    public_status="$(http_status "${PUBLIC_HEALTH_URL}")"
    printf 'Public API health after restart: %s\n' "${public_status:-curl-error}"
  fi
} >>"${LOG_FILE}" 2>&1
