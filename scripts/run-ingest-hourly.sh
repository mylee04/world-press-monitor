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

unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLROOTCERT PGSSLCERT PGSSLKEY PGPASSFILE PGSSLMODE
TIMEZONE="${INGEST_TZ:-America/Chicago}"

mkdir -p "${LOG_DIR}"
cd "${PROJECT_ROOT}"
export TZ="${TIMEZONE}"
export PATH="${PATH}:/opt/homebrew/bin:/usr/local/bin"

if [ -z "${DATABASE_URL:-}" ]; then
  printf '\n[%s] START BLOCKED: DATABASE_URL is missing in environment.\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" >>"${LOG_FILE}"
  exit 1
fi

DB_HOST_PORT="${DATABASE_URL#*//}"
DB_HOST_PORT="${DB_HOST_PORT#*@}"
DB_HOST_PORT="${DB_HOST_PORT%%/*}"
DB_HOST="${DB_HOST_PORT%%:*}"
DB_PORT="${DB_HOST_PORT#*:}"
if [ "${DB_HOST_PORT}" = "${DB_HOST}" ]; then
  DB_PORT="(default)"
fi
if [ "${DB_HOST}" = "localhost" ] || [ "${DB_HOST}" = "127.0.0.1" ] || [ "${DB_HOST}" = "::1" ]; then
  printf '\n[%s] START BLOCKED: DATABASE_URL points to local host (%s). Set Neon/remote DATABASE_URL in .env.local.\n' \
    "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" "${DB_HOST}" >>"${LOG_FILE}"
  exit 1
fi

DB_CHECK_RESULT="ok"
DNS_CHECK_OUTPUT=""

if command -v nslookup >/dev/null 2>&1; then
  if DNS_CHECK_OUTPUT="$(nslookup "${DB_HOST}" 2>&1)"; then
    DB_CHECK_RESULT="ok"
  else
    DB_CHECK_RESULT="nslookup failed"
  fi
elif command -v getent >/dev/null 2>&1; then
  if DNS_CHECK_OUTPUT="$(getent hosts "${DB_HOST}" 2>&1)"; then
    DB_CHECK_RESULT="ok"
  else
    DB_CHECK_RESULT="getent hosts failed"
  fi
else
  DB_CHECK_RESULT="no dns tool (nslookup/getent)"
fi

{
  printf '\n[%s] DB target: %s:%s\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" "${DB_HOST}" "${DB_PORT}"
  printf 'DATABASE_URL masked: postgresql://%s:***@%s\n' "$(printf '%s' "${DATABASE_URL#*//}" | awk -F@ '{print $1}')" "${DB_HOST_PORT}"
  printf 'DNS precheck: %s\n' "${DB_CHECK_RESULT}"
  if [ "${DB_CHECK_RESULT}" != "ok" ]; then
    printf 'DNS check output:\n'
    printf '%s\n' "${DNS_CHECK_OUTPUT}" | sed 's/^/  /'
  fi
} >>"${LOG_FILE}"

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
