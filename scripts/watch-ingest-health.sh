#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$ROOT_DIR/audits/watch-ingest-health.log"
LOCK_FILE="$ROOT_DIR/audits/watch-ingest-health.lock"
BUN_BIN="${BUN_BIN:-$(command -v bun || true)}"
PIPELINE_FALLBACK_COMMAND=( "$BUN_BIN" run ingest:once )
CAFFEINATE_BIN="${CAFFEINATE_BIN:-$(command -v caffeinate || true)}"
PIPELINE_LOCK_FILE="$ROOT_DIR/audits/ingest-worker.lock"
PIPELINE_CMD=( "$BUN_BIN" run ingest:once )
if [[ -n "$CAFFEINATE_BIN" ]] && [[ -x "$CAFFEINATE_BIN" ]]; then
  PIPELINE_CMD=("$CAFFEINATE_BIN" -i "${PIPELINE_CMD[@]}")
  PIPELINE_FALLBACK_COMMAND=("$CAFFEINATE_BIN" -i "${PIPELINE_FALLBACK_COMMAND[@]}")
fi
mkdir -p "$ROOT_DIR/audits"

timestamp() {
  date -u +'%Y-%m-%dT%H:%M:%SZ'
}

log() {
  printf '%s [watch-ingest] %s\n' "$(timestamp)" "$*" >> "$LOG_FILE"
}

file_epoch() {
  local path="$1"
  local epoch
  epoch="$(stat -f '%m' "$path" 2>/dev/null || stat -c '%Y' "$path" 2>/dev/null || true)"
  if [[ -z "$epoch" ]]; then
    echo 0
  else
    echo "$epoch"
  fi
}

query_health_metrics() {
  local sql="$1"
  psql "$DATABASE_URL" -At -F '|' -P null='' -c "$sql" 2>>"$LOG_FILE"
}

load_env() {
  if [[ -f "$ROOT_DIR/.env.local" ]]; then
    set -a
    source "$ROOT_DIR/.env.local"
    set +a
  fi
}

load_env

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found in PATH"
  exit 1
fi

if ! command -v pg_isready >/dev/null 2>&1; then
  echo "pg_isready not found in PATH"
  exit 1
fi

if [[ -z "$BUN_BIN" ]]; then
  echo "bun not found in PATH"
  exit 1
fi

DATABASE_URL="${DATABASE_URL:-}"
if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL missing in .env.local or environment"
  exit 1
fi

if ! pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; then
  log "DB not ready; skip health check/recovery"
  exit 0
fi

WATCH_INGEST_STALE_MINUTES="${WATCH_INGEST_STALE_MINUTES:-30}"
WATCH_INGEST_RECOVERY_COOLDOWN_MINUTES="${WATCH_INGEST_RECOVERY_COOLDOWN_MINUTES:-20}"
WATCH_INGEST_MIN_ATTEMPTED_1H="${WATCH_INGEST_MIN_ATTEMPTED_1H:-1}"
WATCH_INGEST_MIN_CREATED_1H="${WATCH_INGEST_MIN_CREATED_1H:-1}"
WATCH_INGEST_MIN_TOUCHED_1H="${WATCH_INGEST_MIN_TOUCHED_1H:-1}"
WATCH_INGEST_RECOVERY_TIMEOUT_MIN="${WATCH_INGEST_RECOVERY_TIMEOUT_MIN:-60}"
WATCH_INGEST_DRY_RUN="${WATCH_INGEST_DRY_RUN:-false}"

metrics_query="
with endpoint_health as (
  select
    coalesce(count(*) filter (where ran_at > now() - interval '1 hour' and attempted), 0) as attempted_1h,
    max(ran_at) as last_endpoint_run
  from ingestion_endpoint_runs
  where runner = 'worker'
),
article_health as (
  select
    coalesce(count(*) filter (where created_at > now() - interval '1 hour'), 0) as created_1h,
    coalesce(count(*) filter (where last_seen_at > now() - interval '1 hour'), 0) as touched_1h,
    max(last_seen_at) as last_seen_at
  from external_news_articles
)
select
  endpoint_health.attempted_1h::text,
  coalesce((extract(epoch from now() - endpoint_health.last_endpoint_run) / 60)::bigint, 99999) as endpoint_gap_minutes,
  coalesce((extract(epoch from now() - article_health.last_seen_at) / 60)::bigint, 99999) as seen_gap_minutes,
  article_health.created_1h::text,
  article_health.touched_1h::text
from endpoint_health
cross join article_health;
"

if ! metrics_line="$(query_health_metrics "$metrics_query")"; then
  log "health query failed"
  exit 1
fi

IFS='|' read -r attempted_1h endpoint_gap_minutes seen_gap_minutes created_1h touched_1h <<< "$metrics_line"
attempted_1h="${attempted_1h:-0}"
endpoint_gap_minutes="${endpoint_gap_minutes:-99999}"
seen_gap_minutes="${seen_gap_minutes:-99999}"
created_1h="${created_1h:-0}"
touched_1h="${touched_1h:-0}"

log "snapshot attempted_1h=${attempted_1h} created_1h=${created_1h} touched_1h=${touched_1h} endpoint_gap=${endpoint_gap_minutes}m seen_gap=${seen_gap_minutes}m"

needs_recovery=0
is_endpoint_stale=0
is_seen_stale=0
has_progress_issue=0

if (( endpoint_gap_minutes >= WATCH_INGEST_STALE_MINUTES )); then
  is_endpoint_stale=1
fi
if (( seen_gap_minutes >= WATCH_INGEST_STALE_MINUTES )); then
  is_seen_stale=1
fi

if (( attempted_1h <= WATCH_INGEST_MIN_ATTEMPTED_1H || created_1h <= WATCH_INGEST_MIN_CREATED_1H || touched_1h <= WATCH_INGEST_MIN_TOUCHED_1H )); then
  has_progress_issue=1
fi

if (( (is_endpoint_stale || is_seen_stale) && has_progress_issue )); then
  needs_recovery=1
  log "recovery needed: endpoint_stale=${is_endpoint_stale} seen_stale=${is_seen_stale} has_progress_issue=1 thresholds(attempted<=${WATCH_INGEST_MIN_ATTEMPTED_1H}, created<=${WATCH_INGEST_MIN_CREATED_1H}, touched<=${WATCH_INGEST_MIN_TOUCHED_1H})"
fi

if (( needs_recovery == 0 )); then
  log "health ok, no recovery needed"
  exit 0
fi

now_epoch="$(date +%s)"
if [[ -f "$LOCK_FILE" ]]; then
  lock_epoch="$(file_epoch "$LOCK_FILE")"
  lock_age=$(( now_epoch - lock_epoch ))
  if (( now_epoch - lock_epoch < WATCH_INGEST_RECOVERY_COOLDOWN_MINUTES * 60 )); then
    log "recovery skipped: lock active (${lock_age}s ago)"
    exit 0
  fi
fi

printf '%s' "$$" > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

if [[ "$WATCH_INGEST_DRY_RUN" == "true" ]]; then
  log "DRY RUN: would run ${PIPELINE_CMD[*]} now"
  exit 0
fi

log "starting recovery: ${PIPELINE_CMD[*]}"

set +e
if command -v timeout >/dev/null 2>&1; then
  timeout "${WATCH_INGEST_RECOVERY_TIMEOUT_MIN}m" "${PIPELINE_CMD[@]}" >> "$LOG_FILE" 2>&1
  recovery_exit=$?
else
  "${PIPELINE_CMD[@]}" >> "$LOG_FILE" 2>&1
  recovery_exit=$?
fi
set -e

if (( recovery_exit == 124 )); then
  log "recovery timed out after ${WATCH_INGEST_RECOVERY_TIMEOUT_MIN}m"
  exit 1
fi

if (( recovery_exit == 126 || recovery_exit == 127 )); then
  if [[ -f "$PIPELINE_LOCK_FILE" ]]; then
    existing_pid="$(cat "$PIPELINE_LOCK_FILE" 2>/dev/null || true)"
    if [[ -n "$existing_pid" ]] && ps -p "$existing_pid" >/dev/null 2>&1; then
      log "fallback recovery skipped: pipeline lock held by pid=${existing_pid}"
      recovery_exit=0
    else
      recovery_exit=0
      if command -v timeout >/dev/null 2>&1; then
        timeout "${WATCH_INGEST_RECOVERY_TIMEOUT_MIN}m" "${PIPELINE_FALLBACK_COMMAND[@]}" >> "$LOG_FILE" 2>&1
        recovery_exit=$?
      else
        "${PIPELINE_FALLBACK_COMMAND[@]}" >> "$LOG_FILE" 2>&1
        recovery_exit=$?
      fi
    fi
  else
    if command -v timeout >/dev/null 2>&1; then
      timeout "${WATCH_INGEST_RECOVERY_TIMEOUT_MIN}m" "${PIPELINE_FALLBACK_COMMAND[@]}" >> "$LOG_FILE" 2>&1
      recovery_exit=$?
    else
      "${PIPELINE_FALLBACK_COMMAND[@]}" >> "$LOG_FILE" 2>&1
      recovery_exit=$?
    fi
  fi
fi

if (( recovery_exit != 0 )); then
  log "recovery failed with exit ${recovery_exit}"
  exit 1
fi

if ! post_recovery_metrics_line="$(query_health_metrics "$metrics_query")"; then
  log "post-recovery health query failed"
  exit 1
fi

IFS='|' read -r post_attempted_1h post_endpoint_gap_minutes post_seen_gap_minutes post_created_1h post_touched_1h <<< "$post_recovery_metrics_line"
post_attempted_1h="${post_attempted_1h:-0}"
post_endpoint_gap_minutes="${post_endpoint_gap_minutes:-99999}"
post_seen_gap_minutes="${post_seen_gap_minutes:-99999}"
post_created_1h="${post_created_1h:-0}"
post_touched_1h="${post_touched_1h:-0}"

log "recovery done: attempted_1h=${post_attempted_1h} created_1h=${post_created_1h} touched_1h=${post_touched_1h} endpoint_gap=${post_endpoint_gap_minutes}m seen_gap=${post_seen_gap_minutes}m"

exit 0
