#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"
LOG_FILE="${LOG_DIR}/ingest-hourly.log"
RUNNER_COMMAND="bun run ingest:once"

ENV_FILE="${PROJECT_ROOT}/.env.local"
if [ -f "${ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

TIMEZONE="${INGEST_TZ:-America/Chicago}"

mkdir -p "${LOG_DIR}"
cd "${PROJECT_ROOT}"
export TZ="${TIMEZONE}"
export PATH="${PATH}:/opt/homebrew/bin:/usr/local/bin"

if [ -z "${DATABASE_URL:-}" ]; then
  printf '\n[%s] START BLOCKED: DATABASE_URL is missing in environment.\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" >>"${LOG_FILE}"
  exit 1
fi

if ! DB_PING_OUTPUT="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtAX -c 'SELECT 1' 2>&1)"; then
  printf '\n[%s] START BLOCKED: DATABASE_URL connection check failed.\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" >>"${LOG_FILE}"
  printf 'psql error: %s\n' "${DB_PING_OUTPUT}" >>"${LOG_FILE}"
  exit 1
fi

export INGEST_OUTLET_CHUNK_SIZE="${INGEST_OUTLET_CHUNK_SIZE:-20000}"

{
  printf '\n[%s] Start hourly ingest pipeline\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  printf 'Project: %s\n' "${PROJECT_ROOT}"
  printf 'Command: %s\n' "${RUNNER_COMMAND}"
  ${RUNNER_COMMAND}
} >>"${LOG_FILE}" 2>&1
