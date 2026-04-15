#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

LOG_DIR="${WPR_LOG_DIR:-${WPM_LOG_DIR:-${PROJECT_ROOT}/logs}}"
LOG_FILE="${LOG_DIR}/ingest-cold-tail-local.log"
RUNNER_COMMAND=(bun scripts/run-ingest-cold-tail-local.ts)
STATE_DIR="${WPR_STATE_DIR:-${WPM_STATE_DIR:-${PROJECT_ROOT}/.wpr-state}}"
COLD_LOCK_DIR="${STATE_DIR}/ingest-cold-tail.lock"
COLD_LOCK_PID_FILE="${COLD_LOCK_DIR}/pid"
COLD_LOCK_STARTED_FILE="${COLD_LOCK_DIR}/started_at_utc"
HOURLY_LOCK_DIR="${STATE_DIR}/ingest-hourly.lock"
HOURLY_LOCK_PID_FILE="${HOURLY_LOCK_DIR}/pid"
HOURLY_LOCK_STARTED_FILE="${HOURLY_LOCK_DIR}/started_at_utc"
COLD_MAX_RUNTIME_SECONDS="${WPR_INGEST_COLD_MAX_RUNTIME_SECONDS:-${WPM_INGEST_COLD_MAX_RUNTIME_SECONDS:-480}}"
COLD_TIMEOUT_GRACE_SECONDS="${WPR_INGEST_COLD_TIMEOUT_GRACE_SECONDS:-${WPM_INGEST_COLD_TIMEOUT_GRACE_SECONDS:-60}}"
HOURLY_SLOT_MINUTE="${WPR_INGEST_SLOT_MINUTE:-${WPM_INGEST_SLOT_MINUTE:-25}}"
HOURLY_SLOT_GUARD_BEFORE_SECONDS="${WPR_INGEST_COLD_HOURLY_GUARD_BEFORE_SECONDS:-${WPM_INGEST_COLD_HOURLY_GUARD_BEFORE_SECONDS:-120}}"
HOURLY_SLOT_GUARD_AFTER_SECONDS="${WPR_INGEST_COLD_HOURLY_GUARD_AFTER_SECONDS:-${WPM_INGEST_COLD_HOURLY_GUARD_AFTER_SECONDS:-120}}"

unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLROOTCERT PGSSLCERT PGSSLKEY PGPASSFILE PGSSLMODE
TIMEZONE="${INGEST_TZ:-America/Chicago}"

mkdir -p "${LOG_DIR}"
mkdir -p "${STATE_DIR}"
cd "${PROJECT_ROOT}"
export TZ="${TIMEZONE}"
export PATH="${PATH}:/opt/homebrew/bin:/usr/local/bin"

: "${DATABASE_URL:=postgresql://postgres:postgres@127.0.0.1:${WPR_PG_PORT:-${WPM_PG_PORT:-5432}}/${WPR_DATABASE_NAME:-${WPM_DATABASE_NAME:-wpr}}}"

log_utc() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" "$1"
}

seconds_until_next_hourly_slot() {
  local minute second seconds_into_hour slot_seconds
  minute=$((10#$(date '+%M')))
  second=$((10#$(date '+%S')))
  seconds_into_hour=$((minute * 60 + second))
  slot_seconds=$((25 * 60))
  if [ "${seconds_into_hour}" -lt "${slot_seconds}" ]; then
    printf '%s\n' "$((slot_seconds - seconds_into_hour))"
    return 0
  fi
  printf '%s\n' "$((3600 - seconds_into_hour + slot_seconds))"
}

is_within_hourly_guard_window() {
  local minute second current_seconds slot_seconds lower upper
  minute=$((10#$(date '+%M')))
  second=$((10#$(date '+%S')))
  current_seconds=$((minute * 60 + second))
  slot_seconds=$((HOURLY_SLOT_MINUTE * 60))
  lower=$((slot_seconds - HOURLY_SLOT_GUARD_BEFORE_SECONDS))
  upper=$((slot_seconds + HOURLY_SLOT_GUARD_AFTER_SECONDS))

  if [ "${lower}" -ge 0 ] && [ "${upper}" -lt 3600 ]; then
    [ "${current_seconds}" -ge "${lower}" ] && [ "${current_seconds}" -le "${upper}" ]
    return $?
  fi

  if [ "${lower}" -lt 0 ]; then
    [ "${current_seconds}" -le "${upper}" ] || [ "${current_seconds}" -ge $((3600 + lower)) ]
    return $?
  fi

  [ "${current_seconds}" -ge "${lower}" ] || [ "${current_seconds}" -le $((upper - 3600)) ]
}

find_timeout_command() {
  command -v gtimeout >/dev/null 2>&1 && command -v gtimeout && return 0
  command -v timeout >/dev/null 2>&1 && command -v timeout && return 0
  return 1
}

if [ "${COLD_MAX_RUNTIME_SECONDS}" -gt 0 ]; then
  DEFAULT_COLD_MIN_IDLE_WINDOW_SECONDS=$((COLD_MAX_RUNTIME_SECONDS + 120))
else
  DEFAULT_COLD_MIN_IDLE_WINDOW_SECONDS=600
fi
COLD_MIN_IDLE_WINDOW_SECONDS="${WPR_INGEST_COLD_MIN_IDLE_WINDOW_SECONDS:-${WPM_INGEST_COLD_MIN_IDLE_WINDOW_SECONDS:-${DEFAULT_COLD_MIN_IDLE_WINDOW_SECONDS}}}"

release_lock() {
  rm -rf "${COLD_LOCK_DIR}"
}

read_active_hourly_holder() {
  local holder_pid=""
  local holder_started_at="unknown"

  if [ -f "${HOURLY_LOCK_PID_FILE}" ]; then
    holder_pid="$(tr -d '[:space:]' < "${HOURLY_LOCK_PID_FILE}" 2>/dev/null || true)"
  fi
  if [ -f "${HOURLY_LOCK_STARTED_FILE}" ]; then
    holder_started_at="$(tr -d '\n' < "${HOURLY_LOCK_STARTED_FILE}" 2>/dev/null || printf 'unknown')"
  fi

  if [ -n "${holder_pid}" ] && kill -0 "${holder_pid}" 2>/dev/null; then
    printf '%s\t%s\n' "${holder_pid}" "${holder_started_at}"
    return 0
  fi

  return 1
}

acquire_single_flight_lock() {
  if mkdir "${COLD_LOCK_DIR}" 2>/dev/null; then
    printf '%s\n' "$$" > "${COLD_LOCK_PID_FILE}"
    date -u '+%Y-%m-%dT%H:%M:%SZ' > "${COLD_LOCK_STARTED_FILE}"
    trap release_lock EXIT
    return 0
  fi

  local holder_pid=""
  local holder_started_at="unknown"
  if [ -f "${COLD_LOCK_PID_FILE}" ]; then
    holder_pid="$(tr -d '[:space:]' < "${COLD_LOCK_PID_FILE}" 2>/dev/null || true)"
  fi
  if [ -f "${COLD_LOCK_STARTED_FILE}" ]; then
    holder_started_at="$(tr -d '\n' < "${COLD_LOCK_STARTED_FILE}" 2>/dev/null || printf 'unknown')"
  fi

  if [ -n "${holder_pid}" ] && kill -0 "${holder_pid}" 2>/dev/null; then
    log_utc "SKIP: previous cold-tail ingest still running (pid=${holder_pid}, started=${holder_started_at})." >>"${LOG_FILE}"
    return 1
  fi

  log_utc "Removing stale cold-tail ingest lock (pid=${holder_pid:-unknown}, started=${holder_started_at})." >>"${LOG_FILE}"
  rm -rf "${COLD_LOCK_DIR}"

  if mkdir "${COLD_LOCK_DIR}" 2>/dev/null; then
    printf '%s\n' "$$" > "${COLD_LOCK_PID_FILE}"
    date -u '+%Y-%m-%dT%H:%M:%SZ' > "${COLD_LOCK_STARTED_FILE}"
    trap release_lock EXIT
    return 0
  fi

  log_utc "SKIP: unable to acquire cold-tail ingest lock after stale-lock cleanup." >>"${LOG_FILE}"
  return 1
}

if ! acquire_single_flight_lock; then
  exit 0
fi

if read_active_hourly_holder >/tmp/wpr-cold-tail-hourly-holder.$$; then
  IFS=$'\t' read -r hourly_pid hourly_started < /tmp/wpr-cold-tail-hourly-holder.$$
  rm -f /tmp/wpr-cold-tail-hourly-holder.$$
  log_utc "SKIP: hourly ingest still active (pid=${hourly_pid}, started=${hourly_started}); cold-tail rotation deferred." >>"${LOG_FILE}"
  exit 0
fi
rm -f /tmp/wpr-cold-tail-hourly-holder.$$

if is_within_hourly_guard_window; then
  log_utc "SKIP: inside hourly slot guard window around minute ${HOURLY_SLOT_MINUTE}; cold-tail rotation deferred." >>"${LOG_FILE}"
  exit 0
fi

seconds_until_next_hourly="$(seconds_until_next_hourly_slot)"
if [ "${seconds_until_next_hourly}" -le 120 ]; then
  log_utc "SKIP: only ${seconds_until_next_hourly}s until next hourly ingest slot; cold-tail rotation deferred by hard slot guard." >>"${LOG_FILE}"
  exit 0
fi

if [ "${seconds_until_next_hourly}" -lt "${COLD_MIN_IDLE_WINDOW_SECONDS}" ]; then
  log_utc "SKIP: only ${seconds_until_next_hourly}s until next hourly ingest slot; require at least ${COLD_MIN_IDLE_WINDOW_SECONDS}s idle window." >>"${LOG_FILE}"
  exit 0
fi

if ! DB_PING_OUTPUT="$(psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -qtAX -c 'SELECT 1' 2>&1)"; then
  printf '\n[%s] START BLOCKED: local DATABASE_URL connection check failed.\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" >>"${LOG_FILE}"
  printf 'psql error: %s\n' "${DB_PING_OUTPUT}" >>"${LOG_FILE}"
  exit 1
fi

export INGEST_OUTLET_CHUNK_SIZE="${INGEST_OUTLET_CHUNK_SIZE:-20000}"

run_cold_tail_ingest() {
  local timeout_cmd=""
  local exit_code=0

  if [ "${COLD_MAX_RUNTIME_SECONDS}" -le 0 ]; then
    printf 'Timeout: disabled (COLD_MAX_RUNTIME_SECONDS<=0)\n'
    "${RUNNER_COMMAND[@]}"
    return 0
  fi

  timeout_cmd="$(find_timeout_command || true)"
  if [ -z "${timeout_cmd}" ]; then
    printf 'Timeout: disabled (timeout binary not found)\n'
    "${RUNNER_COMMAND[@]}"
    return 0
  fi

  printf 'Timeout: %ss (grace %ss) via %s\n' "${COLD_MAX_RUNTIME_SECONDS}" "${COLD_TIMEOUT_GRACE_SECONDS}" "${timeout_cmd}"
  set +e
  "${timeout_cmd}" --signal=TERM --kill-after="${COLD_TIMEOUT_GRACE_SECONDS}s" "${COLD_MAX_RUNTIME_SECONDS}s" "${RUNNER_COMMAND[@]}"
  exit_code=$?
  set -e
  if [ "${exit_code}" -eq 124 ] || [ "${exit_code}" -eq 137 ]; then
    printf '[%s] ERROR: cold-tail ingest exceeded timeout (%ss) and was terminated\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" "${COLD_MAX_RUNTIME_SECONDS}"
  fi
  return "${exit_code}"
}

cold_exit_code=0
{
  printf '\n[%s] Start cold-tail ingest rotation (local postgres)\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  printf 'Project: %s\n' "${PROJECT_ROOT}"
  printf 'Env file: %s\n' "${WPR_ENV_FILE_SOURCE:-${WPM_ENV_FILE_SOURCE:-inline-defaults}}"
  printf 'Command: %s\n' "${RUNNER_COMMAND[*]}"
  printf 'Hourly slot minute: %s\n' "${HOURLY_SLOT_MINUTE}"
  printf 'Hourly slot guard: -%ss/+%ss\n' "${HOURLY_SLOT_GUARD_BEFORE_SECONDS}" "${HOURLY_SLOT_GUARD_AFTER_SECONDS}"
  printf 'Cold min idle window: %ss\n' "${COLD_MIN_IDLE_WINDOW_SECONDS}"
  printf 'Seconds until next hourly slot: %ss\n' "${seconds_until_next_hourly}"
  run_cold_tail_ingest
} >>"${LOG_FILE}" 2>&1 || cold_exit_code=$?

if [ "${cold_exit_code}" -ne 0 ]; then
  exit "${cold_exit_code}"
fi
