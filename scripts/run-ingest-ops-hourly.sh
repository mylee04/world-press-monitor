#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"
LOG_FILE="${LOG_DIR}/ingest-ops-hourly.log"
RUNNER_COMMAND=(bun scripts/ingest-ops-report.ts --hours=1 --write-json)
STATE_DIR="${WPM_STATE_DIR:-${PROJECT_ROOT}/.wpm-state}"
LAST_SUCCESS_FILE="${STATE_DIR}/ingest-ops-hourly-last-success"
MIN_INTERVAL_MINUTES="${WPM_INGEST_OPS_MIN_INTERVAL_MINUTES:-20}"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

TIMEZONE="${INGEST_OPS_TZ:-America/Chicago}"
: "${DATABASE_URL:=postgresql://postgres:postgres@127.0.0.1:${WPM_PG_PORT:-5432}/wpm}"

if [ -n "${WPM_HOURLY_DISCORD_WEBHOOK:-}" ] || [ -n "${INGEST_OPS_DISCORD_WEBHOOK:-}" ] || [ -n "${RSS_HEALTH_DISCORD_WEBHOOK_URL:-}" ] || [ -n "${DISCORD_WEBHOOK_URL:-}" ]; then
  RUNNER_COMMAND+=(--discord)
fi

mkdir -p "${LOG_DIR}"
mkdir -p "${STATE_DIR}"
cd "${PROJECT_ROOT}"
export TZ="${TIMEZONE}"
export PATH="${PATH}:/opt/homebrew/bin:/usr/local/bin"

if [ "${WPM_FORCE_INGEST_OPS_REPORT:-0}" != "1" ] && [ -f "${LAST_SUCCESS_FILE}" ]; then
  now_epoch="$(date +%s)"
  last_success_epoch="$(cat "${LAST_SUCCESS_FILE}" 2>/dev/null || printf '0')"
  case "${last_success_epoch}" in
    ''|*[!0-9]*)
      last_success_epoch=0
      ;;
  esac
  min_interval_seconds=$((MIN_INTERVAL_MINUTES * 60))
  if [ "${last_success_epoch}" -gt 0 ] && [ $((now_epoch - last_success_epoch)) -lt "${min_interval_seconds}" ]; then
    {
      printf '\n[%s] Recent successful ingest-ops report exists; skip.\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
    } >>"${LOG_FILE}" 2>&1
    exit 0
  fi
fi

{
  printf '\n[%s] Start ingest ops hourly report\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  printf 'Project: %s\n' "${PROJECT_ROOT}"
  printf 'Env file: %s\n' "${WPM_ENV_FILE_SOURCE:-inline-defaults}"
  printf 'Command: %s\n' "${RUNNER_COMMAND[*]}"
  "${RUNNER_COMMAND[@]}"
} >>"${LOG_FILE}" 2>&1

date +%s > "${LAST_SUCCESS_FILE}"
