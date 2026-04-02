#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"
LOG_FILE="${LOG_DIR}/ingest-hourly.log"
RUNNER_COMMAND=(bun run ingest:once)
STATE_DIR="${WPR_STATE_DIR:-${WPM_STATE_DIR:-${PROJECT_ROOT}/.wpr-state}}"
LOCK_DIR="${STATE_DIR}/ingest-hourly.lock"
LOCK_PID_FILE="${LOCK_DIR}/pid"
LOCK_STARTED_FILE="${LOCK_DIR}/started_at_utc"
INGEST_MAX_RUNTIME_SECONDS="${WPR_INGEST_MAX_RUNTIME_SECONDS:-${WPM_INGEST_MAX_RUNTIME_SECONDS:-5400}}"
INGEST_TIMEOUT_GRACE_SECONDS="${WPR_INGEST_TIMEOUT_GRACE_SECONDS:-${WPM_INGEST_TIMEOUT_GRACE_SECONDS:-60}}"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

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

find_timeout_command() {
  command -v gtimeout >/dev/null 2>&1 && command -v gtimeout && return 0
  command -v timeout >/dev/null 2>&1 && command -v timeout && return 0
  return 1
}

release_lock() {
  rm -rf "${LOCK_DIR}"
}

send_skip_notice() {
  local holder_pid="$1"
  local holder_started_at="$2"

  if [ "${WPR_POST_INGEST_REPORTS:-${WPM_POST_INGEST_REPORTS:-1}}" = "0" ]; then
    return 0
  fi

  local notice
  notice=$(
    cat <<EOF
⚠️ WPR ingest skipped ($(date -u '+%Y-%m-%dT%H:%M:%SZ'))
Reason: previous hourly ingest is still running, so this launch was skipped to avoid overlap.
Current holder PID: ${holder_pid}
Current holder started: ${holder_started_at}
Action: waiting for the active ingest to finish before the next scheduled run.
EOF
  )

  if ! bash "${SCRIPT_DIR}/run-news-country-discord-report.sh" --notice "${notice}" >>"${LOG_FILE}" 2>&1; then
    log_utc "WARN: failed to post ingest-skip discord notice" >>"${LOG_FILE}"
  fi
}

acquire_single_flight_lock() {
  if mkdir "${LOCK_DIR}" 2>/dev/null; then
    printf '%s\n' "$$" > "${LOCK_PID_FILE}"
    date -u '+%Y-%m-%dT%H:%M:%SZ' > "${LOCK_STARTED_FILE}"
    trap release_lock EXIT
    return 0
  fi

  local holder_pid=""
  local holder_started_at="unknown"
  if [ -f "${LOCK_PID_FILE}" ]; then
    holder_pid="$(tr -d '[:space:]' < "${LOCK_PID_FILE}" 2>/dev/null || true)"
  fi
  if [ -f "${LOCK_STARTED_FILE}" ]; then
    holder_started_at="$(tr -d '\n' < "${LOCK_STARTED_FILE}" 2>/dev/null || printf 'unknown')"
  fi

  if [ -n "${holder_pid}" ] && kill -0 "${holder_pid}" 2>/dev/null; then
    log_utc "SKIP: previous hourly ingest still running (pid=${holder_pid}, started=${holder_started_at})." >>"${LOG_FILE}"
    send_skip_notice "${holder_pid}" "${holder_started_at}"
    return 1
  fi

  log_utc "Removing stale hourly ingest lock (pid=${holder_pid:-unknown}, started=${holder_started_at})." >>"${LOG_FILE}"
  rm -rf "${LOCK_DIR}"

  if mkdir "${LOCK_DIR}" 2>/dev/null; then
    printf '%s\n' "$$" > "${LOCK_PID_FILE}"
    date -u '+%Y-%m-%dT%H:%M:%SZ' > "${LOCK_STARTED_FILE}"
    trap release_lock EXIT
    return 0
  fi

  log_utc "SKIP: unable to acquire hourly ingest lock after stale-lock cleanup." >>"${LOG_FILE}"
  return 1
}

if ! acquire_single_flight_lock; then
  exit 0
fi

if ! DB_PING_OUTPUT="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtAX -c 'SELECT 1' 2>&1)"; then
  printf '\n[%s] START BLOCKED: DATABASE_URL connection check failed.\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" >>"${LOG_FILE}"
  printf 'psql error: %s\n' "${DB_PING_OUTPUT}" >>"${LOG_FILE}"
  exit 1
fi

export INGEST_OUTLET_CHUNK_SIZE="${INGEST_OUTLET_CHUNK_SIZE:-20000}"

run_hourly_ingest() {
  local timeout_cmd=""
  local exit_code=0

  if [ "${INGEST_MAX_RUNTIME_SECONDS}" -le 0 ]; then
    printf 'Timeout: disabled (INGEST_MAX_RUNTIME_SECONDS<=0)\n'
    "${RUNNER_COMMAND[@]}"
    return 0
  fi

  timeout_cmd="$(find_timeout_command || true)"
  if [ -z "${timeout_cmd}" ]; then
    printf 'Timeout: disabled (timeout binary not found)\n'
    "${RUNNER_COMMAND[@]}"
    return 0
  fi

  printf 'Timeout: %ss (grace %ss) via %s\n' "${INGEST_MAX_RUNTIME_SECONDS}" "${INGEST_TIMEOUT_GRACE_SECONDS}" "${timeout_cmd}"
  set +e
  "${timeout_cmd}" --signal=TERM --kill-after="${INGEST_TIMEOUT_GRACE_SECONDS}s" "${INGEST_MAX_RUNTIME_SECONDS}s" "${RUNNER_COMMAND[@]}"
  exit_code=$?
  set -e
  if [ "${exit_code}" -eq 124 ] || [ "${exit_code}" -eq 137 ]; then
    printf '[%s] ERROR: hourly ingest exceeded timeout (%ss) and was terminated\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" "${INGEST_MAX_RUNTIME_SECONDS}"
  fi
  return "${exit_code}"
}

send_ingest_failure_notice() {
  local exit_code="$1"
  local reason="failed"
  local detail="exit code ${exit_code}"
  local started_at="unknown"
  local timed_out=0

  if [ -f "${LOCK_STARTED_FILE}" ]; then
    started_at="$(tr -d '\n' < "${LOCK_STARTED_FILE}" 2>/dev/null || printf 'unknown')"
  fi

  if [ "${exit_code}" -eq 124 ] || [ "${exit_code}" -eq 137 ]; then
    reason="timed out"
    detail="exceeded ${INGEST_MAX_RUNTIME_SECONDS}s runtime limit (+${INGEST_TIMEOUT_GRACE_SECONDS}s grace)"
    timed_out=1
  fi

  local notice
  notice=$(
    cat <<EOF
⚠️ WPR ingest ${reason} ($(date -u '+%Y-%m-%dT%H:%M:%SZ'))
Started: ${started_at}
Reason: ${detail}
Action: this run did not reach post-ingest reporting, so no fresh hourly country/ops Discord report was published from it.
Next step: the next scheduled hourly ingest will retry automatically.
EOF
  )

  if ! bash "${SCRIPT_DIR}/run-news-country-discord-report.sh" --notice "${notice}" >>"${LOG_FILE}" 2>&1; then
    log_utc "WARN: failed to post ingest-failure discord notice" >>"${LOG_FILE}"
  fi

  if [ "${timed_out}" -eq 1 ]; then
    log_utc "Timeout failure notice sent for hourly ingest." >>"${LOG_FILE}"
  else
    log_utc "Failure notice sent for hourly ingest exit code ${exit_code}." >>"${LOG_FILE}"
  fi
}

run_post_ingest_hooks() {
  if [ "${WPR_POST_INGEST_REPORTS:-${WPM_POST_INGEST_REPORTS:-1}}" = "0" ]; then
    printf '[%s] Post-ingest hooks disabled via WPR_POST_INGEST_REPORTS=0\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
    return 0
  fi

  printf '[%s] Trigger post-ingest hourly reports\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"

  if ! bun run map:snapshots:build; then
    printf '[%s] WARN: map snapshot build hook failed\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  fi

  if ! bun run benchmark:build; then
    printf '[%s] WARN: country benchmark build hook failed\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  fi

  if ! bash "${SCRIPT_DIR}/run-news-country-discord-report.sh"; then
    printf '[%s] WARN: news-country discord hook failed\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  fi

  if ! bash "${SCRIPT_DIR}/run-ingest-ops-hourly.sh"; then
    printf '[%s] WARN: ingest-ops hourly hook failed\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  fi
}

ingest_exit_code=0
{
  printf '\n[%s] Start hourly ingest pipeline\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  printf 'Project: %s\n' "${PROJECT_ROOT}"
  printf 'Env file: %s\n' "${WPR_ENV_FILE_SOURCE:-${WPM_ENV_FILE_SOURCE:-inline-defaults}}"
  printf 'Command: %s\n' "${RUNNER_COMMAND[*]}"
  run_hourly_ingest
} >>"${LOG_FILE}" 2>&1 || ingest_exit_code=$?

if [ "${ingest_exit_code}" -ne 0 ]; then
  send_ingest_failure_notice "${ingest_exit_code}"
  exit "${ingest_exit_code}"
fi

run_post_ingest_hooks >>"${LOG_FILE}" 2>&1
