#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

LOG_DIR="${WPR_LOG_DIR:-${WPM_LOG_DIR:-${PROJECT_ROOT}/logs}}"
LOG_FILE="${LOG_DIR}/rss-health-daily-local.log"
RUNNER_COMMAND=(bun run rss:health:daily)
PRIMARY_WORKTREE="${WPR_PRIMARY_WORKTREE:-${WPM_PRIMARY_WORKTREE:-}}"

TIMEZONE="${RSS_HEALTH_TZ:-America/Chicago}"

mkdir -p "${LOG_DIR}"
cd "${PROJECT_ROOT}"
export TZ="${TIMEZONE}"
export PATH="${PATH}:/opt/homebrew/bin:/usr/local/bin"

: "${DATABASE_URL:=postgresql://postgres:postgres@127.0.0.1:${WPR_PG_PORT:-${WPM_PG_PORT:-5432}}/${WPR_DATABASE_NAME:-${WPM_DATABASE_NAME:-wpr}}}"

if ! DB_PING_OUTPUT="$(psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -qtAX -c 'SELECT 1' 2>&1)"; then
  printf '\n[%s] START BLOCKED: local DATABASE_URL connection check failed.\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" >>"${LOG_FILE}"
  printf 'psql error: %s\n' "${DB_PING_OUTPUT}" >>"${LOG_FILE}"
  exit 1
fi

sync_primary_worktree_outputs() {
  if [ -z "${PRIMARY_WORKTREE}" ] || [ ! -d "${PRIMARY_WORKTREE}" ] || [ "${PRIMARY_WORKTREE}" = "${PROJECT_ROOT}" ]; then
    return 0
  fi

  mkdir -p "${PRIMARY_WORKTREE}/audits" "${PRIMARY_WORKTREE}/data"

  rsync -a "${PROJECT_ROOT}/README.md" "${PRIMARY_WORKTREE}/README.md"

  for artifact in \
    "${PROJECT_ROOT}/audits/readme_rss_health_latest.json" \
    "${PROJECT_ROOT}/audits/readme_network_precheck_latest.json" \
    "${PROJECT_ROOT}/data/rss-catalog.csv" \
    "${PROJECT_ROOT}/data/rss-catalog.opml"; do
    if [ -f "${artifact}" ]; then
      case "${artifact}" in
        */audits/*)
          rsync -a "${artifact}" "${PRIMARY_WORKTREE}/audits/"
          ;;
        */data/*)
          rsync -a "${artifact}" "${PRIMARY_WORKTREE}/data/"
          ;;
      esac
    fi
  done

  latest_dated_report="$(ls -1t "${PROJECT_ROOT}"/audits/readme_rss_health_*.json 2>/dev/null | head -n 1 || true)"
  if [ -n "${latest_dated_report}" ] && [ -f "${latest_dated_report}" ]; then
    rsync -a "${latest_dated_report}" "${PRIMARY_WORKTREE}/audits/"
  fi
}

{
  printf '\n[%s] Start daily RSS health pipeline (local postgres)\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  printf 'Project: %s\n' "${PROJECT_ROOT}"
  printf 'Env file: %s\n' "${WPR_ENV_FILE_SOURCE:-${WPM_ENV_FILE_SOURCE:-inline-defaults}}"
  printf 'Command: %s\n' "${RUNNER_COMMAND[*]}"
  "${RUNNER_COMMAND[@]}"
} >>"${LOG_FILE}" 2>&1

sync_primary_worktree_outputs >>"${LOG_FILE}" 2>&1
