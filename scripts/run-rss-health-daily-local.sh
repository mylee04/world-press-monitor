#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

LOG_DIR="${WPM_LOG_DIR:-${PROJECT_ROOT}/logs}"
LOG_FILE="${LOG_DIR}/rss-health-daily-local.log"
RUNNER_COMMAND=(bun run rss:health:daily)

TIMEZONE="${RSS_HEALTH_TZ:-America/Chicago}"

mkdir -p "${LOG_DIR}"
cd "${PROJECT_ROOT}"
export TZ="${TIMEZONE}"
export PATH="${PATH}:/opt/homebrew/bin:/usr/local/bin"

: "${DATABASE_URL:=postgresql://postgres:postgres@127.0.0.1:${WPM_PG_PORT:-5432}/wpm}"

if ! DB_PING_OUTPUT="$(psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -qtAX -c 'SELECT 1' 2>&1)"; then
  printf '\n[%s] START BLOCKED: local DATABASE_URL connection check failed.\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" >>"${LOG_FILE}"
  printf 'psql error: %s\n' "${DB_PING_OUTPUT}" >>"${LOG_FILE}"
  exit 1
fi

{
  printf '\n[%s] Start daily RSS health pipeline (local postgres)\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  printf 'Project: %s\n' "${PROJECT_ROOT}"
  printf 'Env file: %s\n' "${WPM_ENV_FILE_SOURCE:-inline-defaults}"
  printf 'Command: %s\n' "${RUNNER_COMMAND[*]}"
  "${RUNNER_COMMAND[@]}"
} >>"${LOG_FILE}" 2>&1
