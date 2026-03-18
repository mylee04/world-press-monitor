#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"
LOG_FILE="${LOG_DIR}/news-country-discord-hourly.log"
RUNNER_COMMAND="bun run news:country:discord"
LOCK_DIR="${PROJECT_ROOT}/.wpm-news-country-discord-report-lock"
STATE_DIR="${WPM_STATE_DIR:-${PROJECT_ROOT}/.wpm-state}"
LAST_SUCCESS_FILE="${STATE_DIR}/news-country-discord-last-success"
MIN_INTERVAL_MINUTES="${WPM_NEWS_COUNTRY_REPORT_MIN_INTERVAL_MINUTES:-20}"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

TIMEZONE="${NEWS_COUNTRY_REPORT_TZ:-America/Chicago}"
: "${DATABASE_URL:=postgresql://postgres:postgres@127.0.0.1:${WPM_PG_PORT:-5432}/wpm}"

mkdir -p "${LOG_DIR}"
mkdir -p "${STATE_DIR}"
if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  echo "[$(date -u '+%Y-%m-%d %H:%M:%S %Z')] Another report instance is already running; skip."
  exit 0
fi
trap 'rm -rf "${LOCK_DIR}"' EXIT

if [ "${WPM_FORCE_NEWS_COUNTRY_REPORT:-0}" != "1" ] && [ -f "${LAST_SUCCESS_FILE}" ]; then
  now_epoch="$(date +%s)"
  last_success_epoch="$(cat "${LAST_SUCCESS_FILE}" 2>/dev/null || printf '0')"
  case "${last_success_epoch}" in
    ''|*[!0-9]*)
      last_success_epoch=0
      ;;
  esac
  min_interval_seconds=$((MIN_INTERVAL_MINUTES * 60))
  if [ "${last_success_epoch}" -gt 0 ] && [ $((now_epoch - last_success_epoch)) -lt "${min_interval_seconds}" ]; then
    echo "[$(date -u '+%Y-%m-%d %H:%M:%S %Z')] Recent successful news-country report exists; skip."
    exit 0
  fi
fi

cd "${PROJECT_ROOT}"
export TZ="${TIMEZONE}"
export PATH="${PATH}:/opt/homebrew/bin:/usr/local/bin"

{
  printf '\n[%s] Start news country discord report\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  printf 'Project: %s\n' "${PROJECT_ROOT}"
  printf 'Env file: %s\n' "${WPM_ENV_FILE_SOURCE:-inline-defaults}"
  printf 'Command: %s\n' "${RUNNER_COMMAND}"
  ${RUNNER_COMMAND}
} >>"${LOG_FILE}" 2>&1

date +%s > "${LAST_SUCCESS_FILE}"
