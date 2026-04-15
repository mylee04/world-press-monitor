#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

LOG_DIR="${WPR_LOG_DIR:-${WPM_LOG_DIR:-${PROJECT_ROOT}/logs}}"
LOG_FILE="${LOG_DIR}/ingest-backfill-last24h-local.log"
STATE_DIR="${WPR_STATE_DIR:-${WPM_STATE_DIR:-${PROJECT_ROOT}/.wpr-state}}"
LOCK_DIR="${STATE_DIR}/ingest-backfill-last24h.lock"
LOCK_PID_FILE="${LOCK_DIR}/pid"
LOCK_STARTED_FILE="${LOCK_DIR}/started_at_utc"

mkdir -p "${LOG_DIR}"
mkdir -p "${STATE_DIR}"
cd "${PROJECT_ROOT}"

release_lock() {
  rm -rf "${LOCK_DIR}"
}

if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  printf '[%s] ERROR: chunked 24h backfill is already running\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" >>"${LOG_FILE}"
  exit 1
fi

printf '%s\n' "$$" > "${LOCK_PID_FILE}"
date -u '+%Y-%m-%dT%H:%M:%SZ' > "${LOCK_STARTED_FILE}"
trap release_lock EXIT

{
  printf '\n[%s] Start 24h chunked ingest backfill (local postgres)\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  printf 'Project: %s\n' "${PROJECT_ROOT}"
  printf 'Env file: %s\n' "${WPR_ENV_FILE_SOURCE:-${WPM_ENV_FILE_SOURCE:-inline-defaults}}"
  printf 'Command: bun scripts/run-ingest-backfill-last24h-local.ts'
  if [ "$#" -gt 0 ]; then
    printf ' %s' "$@"
  fi
  printf '\n'
} >>"${LOG_FILE}" 2>&1

bun scripts/run-ingest-backfill-last24h-local.ts "$@"
