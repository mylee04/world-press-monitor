#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

LOG_DIR="${WPR_LOG_DIR:-${WPM_LOG_DIR:-${PROJECT_ROOT}/logs}}"
LOG_FILE="${LOG_DIR}/static-export-local.log"
EXPORT_DIR="${PUBLIC_EXPORT_DIR:-${PROJECT_ROOT}/exports/public-data}"
PUBLIC_DATA_DIR="${WPR_PUBLIC_DATA_DIR:-${WPM_PUBLIC_DATA_DIR:-${PROJECT_ROOT}/public/data}}"
RUNNER_COMMAND=(bun run export:public:news)

mkdir -p "${LOG_DIR}" "${EXPORT_DIR}" "${PUBLIC_DATA_DIR}"
cd "${PROJECT_ROOT}"
export PATH="${PATH}:/opt/homebrew/bin:/usr/local/bin"

: "${DATABASE_URL:=postgresql://postgres:postgres@127.0.0.1:${WPR_PG_PORT:-${WPM_PG_PORT:-5432}}/${WPR_DATABASE_NAME:-${WPM_DATABASE_NAME:-wpr}}}"

if ! DB_PING_OUTPUT="$(psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -qtAX -c 'SELECT 1' 2>&1)"; then
  printf '\n[%s] START BLOCKED: local DATABASE_URL connection check failed.\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" >>"${LOG_FILE}"
  printf 'psql error: %s\n' "${DB_PING_OUTPUT}" >>"${LOG_FILE}"
  exit 1
fi

{
  printf '\n[%s] Start static export generation\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  printf 'Project: %s\n' "${PROJECT_ROOT}"
  printf 'Export dir: %s\n' "${EXPORT_DIR}"
  printf 'Public data dir: %s\n' "${PUBLIC_DATA_DIR}"
  printf 'Env file: %s\n' "${WPR_ENV_FILE_SOURCE:-${WPM_ENV_FILE_SOURCE:-inline-defaults}}"
  printf 'Command: %s\n' "${RUNNER_COMMAND[*]}"
  "${RUNNER_COMMAND[@]}"
  rsync -a --delete "${EXPORT_DIR}/" "${PUBLIC_DATA_DIR}/"
  printf '[%s] Static export sync complete\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
} >>"${LOG_FILE}" 2>&1
