#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

TASK=""
FORCE=0

usage() {
  cat <<'USAGE'
Usage:
  scripts/run-ingest-downstream-task.sh --task=<benchmark|map|customer|news-country|ingest-ops> [--force]

Tasks:
  benchmark     Build country benchmark snapshots after a successful hourly ingest.
  map           Build map snapshots after a successful hourly ingest.
  customer      Build customer dashboard snapshots after a successful hourly ingest.
  news-country  Post the hourly publisher-country Discord report after a successful hourly ingest.
  ingest-ops    Post the hourly ingest-ops report after a successful hourly ingest.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --task)
      TASK="${2:-}"
      shift 2
      ;;
    --task=*)
      TASK="${1#*=}"
      shift
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -z "${TASK}" ]; then
  usage >&2
  exit 1
fi

LOG_DIR="${WPR_LOG_DIR:-${WPM_LOG_DIR:-${PROJECT_ROOT}/logs}}"
STATE_DIR="${WPR_STATE_DIR:-${WPM_STATE_DIR:-${PROJECT_ROOT}/.wpr-state}}"
TIMEZONE="${INGEST_TZ:-America/Chicago}"

TASK_LABEL=""
TASK_DESCRIPTION=""
TASK_DEPENDENCY=""
LOG_FILE=""
RUNNER_COMMAND=()

case "${TASK}" in
  benchmark)
    TASK_LABEL="benchmark"
    TASK_DESCRIPTION="country benchmark snapshots"
    LOG_FILE="${LOG_DIR}/ingest-downstream-benchmark.log"
    RUNNER_COMMAND=(bun run benchmark:build)
    ;;
  map)
    TASK_LABEL="map-snapshots"
    TASK_DESCRIPTION="map snapshots"
    LOG_FILE="${LOG_DIR}/ingest-downstream-map-snapshots.log"
    RUNNER_COMMAND=(bun run map:snapshots:build)
    ;;
  customer)
    TASK_LABEL="customer-dashboard"
    TASK_DESCRIPTION="customer dashboard snapshots"
    TASK_DEPENDENCY="benchmark"
    LOG_FILE="${LOG_DIR}/ingest-downstream-customer-dashboard.log"
    RUNNER_COMMAND=(bun run customer:dashboard:snapshots:build)
    ;;
  news-country)
    TASK_LABEL="news-country-discord"
    TASK_DESCRIPTION="publisher-country Discord report"
    LOG_FILE="${LOG_DIR}/ingest-downstream-news-country.log"
    RUNNER_COMMAND=(env WPR_FORCE_NEWS_COUNTRY_REPORT=1 WPM_FORCE_NEWS_COUNTRY_REPORT=1 bash "${SCRIPT_DIR}/run-news-country-discord-report.sh")
    ;;
  ingest-ops)
    TASK_LABEL="ingest-ops"
    TASK_DESCRIPTION="ingest-ops hourly report"
    LOG_FILE="${LOG_DIR}/ingest-downstream-ingest-ops.log"
    RUNNER_COMMAND=(env WPR_FORCE_INGEST_OPS_REPORT=1 WPM_FORCE_INGEST_OPS_REPORT=1 bash "${SCRIPT_DIR}/run-ingest-ops-hourly.sh")
    ;;
  *)
    echo "Unsupported task: ${TASK}" >&2
    usage >&2
    exit 1
    ;;
esac

TASK_LOCK_DIR="${STATE_DIR}/ingest-downstream-${TASK_LABEL}.lock"
TASK_LOCK_PID_FILE="${TASK_LOCK_DIR}/pid"
TASK_LOCK_STARTED_FILE="${TASK_LOCK_DIR}/started_at_utc"
LATEST_INGEST_RUN_ID_FILE="${STATE_DIR}/ingest-hourly-last-success-run-id"
LATEST_INGEST_COMPLETED_FILE="${STATE_DIR}/ingest-hourly-last-success-completed-at-utc"
TASK_LAST_SUCCESS_RUN_ID_FILE="${STATE_DIR}/ingest-downstream-${TASK_LABEL}-last-success-run-id"
TASK_LAST_SUCCESS_COMPLETED_FILE="${STATE_DIR}/ingest-downstream-${TASK_LABEL}-last-success-completed-at-utc"
DEPENDENCY_LAST_SUCCESS_RUN_ID_FILE=""
if [ -n "${TASK_DEPENDENCY}" ]; then
  DEPENDENCY_LAST_SUCCESS_RUN_ID_FILE="${STATE_DIR}/ingest-downstream-${TASK_DEPENDENCY}-last-success-run-id"
fi

: "${DATABASE_URL:=postgresql://postgres:postgres@127.0.0.1:${WPR_PG_PORT:-${WPM_PG_PORT:-5432}}/${WPR_DATABASE_NAME:-${WPM_DATABASE_NAME:-wpr}}}"

mkdir -p "${LOG_DIR}"
mkdir -p "${STATE_DIR}"
cd "${PROJECT_ROOT}"
export TZ="${TIMEZONE}"
export PATH="${PATH}:/opt/homebrew/bin:/usr/local/bin"

log_utc() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" "$1"
}

read_state_file() {
  local file_path="$1"
  if [ ! -f "${file_path}" ]; then
    return 0
  fi
  tr -d '\n' < "${file_path}" 2>/dev/null || true
}

should_force_task_run() {
  if [ "${FORCE}" = "1" ]; then
    return 0
  fi
  if [ "${WPR_FORCE_INGEST_DOWNSTREAM_TASKS:-${WPM_FORCE_INGEST_DOWNSTREAM_TASKS:-0}}" = "1" ]; then
    return 0
  fi

  case "${TASK}" in
    benchmark)
      [ "${WPR_FORCE_BENCHMARK_BUILD:-${WPM_FORCE_BENCHMARK_BUILD:-0}}" = "1" ] && return 0
      ;;
    map)
      [ "${WPR_FORCE_MAP_SNAPSHOTS_BUILD:-${WPM_FORCE_MAP_SNAPSHOTS_BUILD:-0}}" = "1" ] && return 0
      ;;
    customer)
      [ "${WPR_FORCE_CUSTOMER_DASHBOARD_SNAPSHOTS_BUILD:-${WPM_FORCE_CUSTOMER_DASHBOARD_SNAPSHOTS_BUILD:-0}}" = "1" ] && return 0
      ;;
    news-country)
      [ "${WPR_FORCE_NEWS_COUNTRY_REPORT:-${WPM_FORCE_NEWS_COUNTRY_REPORT:-0}}" = "1" ] && return 0
      ;;
    ingest-ops)
      [ "${WPR_FORCE_INGEST_OPS_REPORT:-${WPM_FORCE_INGEST_OPS_REPORT:-0}}" = "1" ] && return 0
      ;;
  esac

  return 1
}

release_task_lock() {
  rm -rf "${TASK_LOCK_DIR}"
}

acquire_task_lock() {
  if mkdir "${TASK_LOCK_DIR}" 2>/dev/null; then
    printf '%s\n' "$$" > "${TASK_LOCK_PID_FILE}"
    date -u '+%Y-%m-%dT%H:%M:%SZ' > "${TASK_LOCK_STARTED_FILE}"
    trap release_task_lock EXIT
    return 0
  fi

  local holder_pid=""
  local holder_started_at="unknown"
  if [ -f "${TASK_LOCK_PID_FILE}" ]; then
    holder_pid="$(tr -d '[:space:]' < "${TASK_LOCK_PID_FILE}" 2>/dev/null || true)"
  fi
  if [ -f "${TASK_LOCK_STARTED_FILE}" ]; then
    holder_started_at="$(tr -d '\n' < "${TASK_LOCK_STARTED_FILE}" 2>/dev/null || printf 'unknown')"
  fi

  if [ -n "${holder_pid}" ] && kill -0 "${holder_pid}" 2>/dev/null; then
    log_utc "SKIP: downstream task ${TASK_LABEL} still running (pid=${holder_pid}, started=${holder_started_at})." >>"${LOG_FILE}"
    return 1
  fi

  log_utc "Removing stale downstream lock for ${TASK_LABEL} (pid=${holder_pid:-unknown}, started=${holder_started_at})." >>"${LOG_FILE}"
  rm -rf "${TASK_LOCK_DIR}"

  if mkdir "${TASK_LOCK_DIR}" 2>/dev/null; then
    printf '%s\n' "$$" > "${TASK_LOCK_PID_FILE}"
    date -u '+%Y-%m-%dT%H:%M:%SZ' > "${TASK_LOCK_STARTED_FILE}"
    trap release_task_lock EXIT
    return 0
  fi

  log_utc "SKIP: unable to acquire downstream lock for ${TASK_LABEL} after stale-lock cleanup." >>"${LOG_FILE}"
  return 1
}

if [ "${WPR_POST_INGEST_REPORTS:-${WPM_POST_INGEST_REPORTS:-1}}" = "0" ]; then
  log_utc "SKIP: downstream task ${TASK_LABEL} disabled via WPR_POST_INGEST_REPORTS=0." >>"${LOG_FILE}"
  exit 0
fi

if ! acquire_task_lock; then
  exit 0
fi

FORCE_TASK_RUN=0
if should_force_task_run; then
  FORCE_TASK_RUN=1
fi

LATEST_INGEST_RUN_ID="$(read_state_file "${LATEST_INGEST_RUN_ID_FILE}")"
LATEST_INGEST_COMPLETED_AT="$(read_state_file "${LATEST_INGEST_COMPLETED_FILE}")"
if [ -z "${LATEST_INGEST_RUN_ID}" ]; then
  if [ "${FORCE_TASK_RUN}" = "0" ]; then
    log_utc "SKIP: no successful hourly ingest marker available for downstream task ${TASK_LABEL}." >>"${LOG_FILE}"
    exit 0
  fi

  LATEST_INGEST_RUN_ID="manual-$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  LATEST_INGEST_COMPLETED_AT="${LATEST_INGEST_RUN_ID#manual-}"
fi

if [ -n "${TASK_DEPENDENCY}" ] && [ "${FORCE_TASK_RUN}" = "0" ]; then
  DEPENDENCY_LAST_SUCCESS_RUN_ID="$(read_state_file "${DEPENDENCY_LAST_SUCCESS_RUN_ID_FILE}")"
  if [ "${DEPENDENCY_LAST_SUCCESS_RUN_ID}" != "${LATEST_INGEST_RUN_ID}" ]; then
    log_utc "SKIP: downstream task ${TASK_LABEL} waiting for dependency ${TASK_DEPENDENCY} to finish run_id=${LATEST_INGEST_RUN_ID}." >>"${LOG_FILE}"
    exit 0
  fi
fi

TASK_LAST_SUCCESS_RUN_ID="$(read_state_file "${TASK_LAST_SUCCESS_RUN_ID_FILE}")"
if [ "${FORCE_TASK_RUN}" = "0" ] && [ "${TASK_LAST_SUCCESS_RUN_ID}" = "${LATEST_INGEST_RUN_ID}" ]; then
  log_utc "SKIP: downstream task ${TASK_LABEL} already processed latest ingest run_id=${LATEST_INGEST_RUN_ID}." >>"${LOG_FILE}"
  exit 0
fi

if ! DB_PING_OUTPUT="$(psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -qtAX -c 'SELECT 1' 2>&1)"; then
  printf '\n[%s] START BLOCKED: downstream task %s DATABASE_URL connection check failed.\n' \
    "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" \
    "${TASK_LABEL}" >>"${LOG_FILE}"
  printf 'psql error: %s\n' "${DB_PING_OUTPUT}" >>"${LOG_FILE}"
  exit 1
fi

task_exit_code=0
{
  printf '\n[%s] Start downstream task: %s\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" "${TASK_DESCRIPTION}"
  printf 'Project: %s\n' "${PROJECT_ROOT}"
  printf 'Env file: %s\n' "${WPR_ENV_FILE_SOURCE:-${WPM_ENV_FILE_SOURCE:-inline-defaults}}"
  printf 'Ingest run id: %s\n' "${LATEST_INGEST_RUN_ID}"
  printf 'Ingest completed: %s\n' "${LATEST_INGEST_COMPLETED_AT:-unknown}"
  if [ -n "${TASK_DEPENDENCY}" ]; then
    printf 'Dependency: %s\n' "${TASK_DEPENDENCY}"
  fi
  printf 'Command: %s\n' "${RUNNER_COMMAND[*]}"
  "${RUNNER_COMMAND[@]}"
} >>"${LOG_FILE}" 2>&1 || task_exit_code=$?

if [ "${task_exit_code}" -ne 0 ]; then
  printf '[%s] ERROR: downstream task %s failed with exit code %s\n' \
    "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" \
    "${TASK_LABEL}" \
    "${task_exit_code}" >>"${LOG_FILE}"
  exit "${task_exit_code}"
fi

printf '%s\n' "${LATEST_INGEST_RUN_ID}" > "${TASK_LAST_SUCCESS_RUN_ID_FILE}"
date -u '+%Y-%m-%dT%H:%M:%SZ' > "${TASK_LAST_SUCCESS_COMPLETED_FILE}"
printf '[%s] Recorded downstream success marker task=%s run_id=%s\n' \
  "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" \
  "${TASK_LABEL}" \
  "${LATEST_INGEST_RUN_ID}" >>"${LOG_FILE}"
