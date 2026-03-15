#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"
LOG_FILE="${LOG_DIR}/ingest-hourly.log"
RUNNER_COMMAND="bun run ingest:once"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLROOTCERT PGSSLCERT PGSSLKEY PGPASSFILE PGSSLMODE
TIMEZONE="${INGEST_TZ:-America/Chicago}"

mkdir -p "${LOG_DIR}"
cd "${PROJECT_ROOT}"
export TZ="${TIMEZONE}"
export PATH="${PATH}:/opt/homebrew/bin:/usr/local/bin"

: "${DATABASE_URL:=postgresql://postgres:postgres@127.0.0.1:${WPM_PG_PORT:-5432}/wpm}"

if ! DB_PING_OUTPUT="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtAX -c 'SELECT 1' 2>&1)"; then
  printf '\n[%s] START BLOCKED: DATABASE_URL connection check failed.\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" >>"${LOG_FILE}"
  printf 'psql error: %s\n' "${DB_PING_OUTPUT}" >>"${LOG_FILE}"
  exit 1
fi

export INGEST_OUTLET_CHUNK_SIZE="${INGEST_OUTLET_CHUNK_SIZE:-20000}"

run_post_ingest_hooks() {
  if [ "${WPM_POST_INGEST_REPORTS:-1}" = "0" ]; then
    printf '[%s] Post-ingest hooks disabled via WPM_POST_INGEST_REPORTS=0\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
    return 0
  fi

  printf '[%s] Trigger post-ingest hourly reports\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"

  if ! bash "${SCRIPT_DIR}/run-news-country-discord-report.sh"; then
    printf '[%s] WARN: news-country discord hook failed\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  fi

  if ! bash "${SCRIPT_DIR}/run-ingest-ops-hourly.sh"; then
    printf '[%s] WARN: ingest-ops hourly hook failed\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  fi
}

{
  printf '\n[%s] Start hourly ingest pipeline\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  printf 'Project: %s\n' "${PROJECT_ROOT}"
  printf 'Env file: %s\n' "${WPM_ENV_FILE_SOURCE:-inline-defaults}"
  printf 'Command: %s\n' "${RUNNER_COMMAND}"
  ${RUNNER_COMMAND}
} >>"${LOG_FILE}" 2>&1

run_post_ingest_hooks >>"${LOG_FILE}" 2>&1
