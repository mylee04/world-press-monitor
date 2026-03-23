#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

if [ -z "${WPR_PRIMARY_WORKTREE:-${WPM_PRIMARY_WORKTREE:-}}" ] && [ -f "${PROJECT_ROOT}/.env.macmini.local" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${PROJECT_ROOT}/.env.macmini.local"
  set +a
fi

LAUNCHD_DOMAIN="gui/$(id -u)"
API_NEWS_LABEL="${WPR_API_NEWS_LABEL:-com.wpr.api-news}"
API_TUNNEL_LABEL="${WPR_API_TUNNEL_LABEL:-com.wpr.api-tunnel}"
API_NEWS_PLIST="${HOME}/Library/LaunchAgents/${API_NEWS_LABEL}.plist"
API_TUNNEL_PLIST="${HOME}/Library/LaunchAgents/${API_TUNNEL_LABEL}.plist"
PUBLIC_HEALTH_URL="${WPR_PUBLIC_API_HEALTH_URL:-${WPM_PUBLIC_API_HEALTH_URL:-https://api.worldpressradar.com/health}}"
LOCAL_HEALTH_URL="${WPR_LOCAL_API_HEALTH_URL:-${WPM_LOCAL_API_HEALTH_URL:-http://127.0.0.1:${NEWS_API_PORT:-4100}/health}}"
PRIMARY_WORKTREE="${WPR_PRIMARY_WORKTREE:-${WPM_PRIMARY_WORKTREE:-}}"
SYNC_REMOTE="${WPR_RUNTIME_SYNC_REMOTE:-${WPM_RUNTIME_SYNC_REMOTE:-origin}}"
SYNC_BRANCH="${WPR_RUNTIME_SYNC_BRANCH:-${WPM_RUNTIME_SYNC_BRANCH:-develop}}"
RUNTIME_REPO="${WPR_RUNTIME_REPO:-${WPM_RUNTIME_REPO:-${PROJECT_ROOT}}}"
STATE_DIR="${WPR_STATE_DIR:-${WPM_STATE_DIR:-${PROJECT_ROOT}/.wpr-state}}"
SYNC_HEAD_FILE="${STATE_DIR}/runtime-api-synced-head"
LOG_DIR="${WPR_LOG_DIR:-${WPM_LOG_DIR:-${PROJECT_ROOT}/logs}}"
LOG_FILE="${LOG_DIR}/api-runtime-watchdog.log"

mkdir -p "${LOG_DIR}" "${STATE_DIR}"

timestamp() {
  date -u '+%Y-%m-%d %H:%M:%S %Z'
}

service_exists() {
  launchctl print "${LAUNCHD_DOMAIN}/$1" >/dev/null 2>&1
}

ensure_loaded() {
  local label=$1
  local plist_path=$2

  if service_exists "${label}"; then
    return 0
  fi

  if [ -f "${plist_path}" ]; then
    launchctl enable "${LAUNCHD_DOMAIN}/${label}" >/dev/null 2>&1 || true
    launchctl bootstrap "${LAUNCHD_DOMAIN}" "${plist_path}" >/dev/null 2>&1 || true
  fi
}

restart_service() {
  local label=$1
  local plist_path=$2

  ensure_loaded "${label}" "${plist_path}"
  launchctl kickstart -k "${LAUNCHD_DOMAIN}/${label}" >/dev/null 2>&1 || true
}

http_status() {
  curl --max-time 10 -sS -o /dev/null -w '%{http_code}' "$1" || true
}

resolved_dir() {
  local dir=$1
  if [ -d "${dir}" ]; then
    (
      cd "${dir}"
      pwd -P
    )
  fi
}

sync_runtime_repo_if_pushed() {
  if [ -z "${PRIMARY_WORKTREE}" ] || [ ! -d "${PRIMARY_WORKTREE}" ]; then
    printf 'Runtime sync: skipped (primary worktree unavailable)\n'
    return 0
  fi

  local primary_real runtime_real
  primary_real="$(resolved_dir "${PRIMARY_WORKTREE}")"
  runtime_real="$(resolved_dir "${RUNTIME_REPO}")"

  if [ -z "${primary_real}" ] || [ -z "${runtime_real}" ] || [ "${primary_real}" = "${runtime_real}" ]; then
    printf 'Runtime sync: skipped (primary/runtime paths are not distinct)\n'
    return 0
  fi

  if ! git -C "${PRIMARY_WORKTREE}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf 'Runtime sync: skipped (%s is not a git worktree)\n' "${PRIMARY_WORKTREE}"
    return 0
  fi

  local branch current_head last_synced_head remote_head
  branch="$(git -C "${PRIMARY_WORKTREE}" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  if [ "${branch}" != "${SYNC_BRANCH}" ]; then
    printf 'Runtime sync: skipped (branch=%s, target=%s)\n' "${branch:-unknown}" "${SYNC_BRANCH}"
    return 0
  fi

  current_head="$(git -C "${PRIMARY_WORKTREE}" rev-parse HEAD 2>/dev/null || true)"
  last_synced_head="$(cat "${SYNC_HEAD_FILE}" 2>/dev/null || true)"
  if [ -n "${current_head}" ] && [ "${current_head}" = "${last_synced_head}" ]; then
    printf 'Runtime sync: already at %s\n' "${current_head:0:12}"
    return 0
  fi

  remote_head="$(git -C "${PRIMARY_WORKTREE}" ls-remote --heads "${SYNC_REMOTE}" "${SYNC_BRANCH}" 2>/dev/null | awk 'NR==1 { print $1 }')"
  if [ -z "${remote_head}" ]; then
    printf 'Runtime sync: skipped (failed to resolve %s/%s)\n' "${SYNC_REMOTE}" "${SYNC_BRANCH}"
    return 0
  fi

  if [ "${current_head}" != "${remote_head}" ]; then
    printf 'Runtime sync: skipped (local=%s remote=%s)\n' "${current_head:0:12}" "${remote_head:0:12}"
    return 0
  fi

  printf 'Runtime sync: syncing pushed head %s from %s\n' "${current_head:0:12}" "${PRIMARY_WORKTREE}"

  local sync_tmp
  sync_tmp="$(mktemp -d "${TMPDIR:-/tmp}/wpr-runtime-sync.XXXXXX")"
  if ! git -C "${PRIMARY_WORKTREE}" archive --format=tar "${current_head}" | tar -xf - -C "${sync_tmp}"; then
    rm -rf "${sync_tmp}"
    printf 'Runtime sync: failed to export git snapshot for %s\n' "${current_head:0:12}"
    return 0
  fi

  rsync -a --delete \
    --exclude '.env' \
    --exclude '.env.local' \
    --exclude '.env.macmini.local' \
    --exclude '.git' \
    --exclude '.vercel' \
    --exclude 'node_modules' \
    --exclude 'logs' \
    --exclude 'postgres' \
    --exclude 'exports' \
    --exclude 'web-dist' \
    --exclude 'out' \
    --exclude '.next' \
    --exclude '.wpr-state' \
    --exclude 'data/news.db' \
    "${sync_tmp}/" "${RUNTIME_REPO}/"

  (
    cd "${RUNTIME_REPO}"
    bun install >/dev/null
  )

  rm -rf "${sync_tmp}"

  restart_service "${API_NEWS_LABEL}" "${API_NEWS_PLIST}"
  printf '%s\n' "${current_head}" > "${SYNC_HEAD_FILE}"
  printf 'Runtime sync: complete for %s\n' "${current_head:0:12}"
}

{
  printf '\n[%s] Watchdog run\n' "$(timestamp)"

  sync_runtime_repo_if_pushed

  local_status="$(http_status "${LOCAL_HEALTH_URL}")"
  printf 'Local API health: %s (%s)\n' "${local_status:-curl-error}" "${LOCAL_HEALTH_URL}"
  if [ "${local_status}" != "200" ]; then
    printf 'Action: restart %s\n' "${API_NEWS_LABEL}"
    restart_service "${API_NEWS_LABEL}" "${API_NEWS_PLIST}"
    sleep 2
    local_status="$(http_status "${LOCAL_HEALTH_URL}")"
    printf 'Local API health after restart: %s\n' "${local_status:-curl-error}"
  fi

  public_status="$(http_status "${PUBLIC_HEALTH_URL}")"
  printf 'Public API health: %s (%s)\n' "${public_status:-curl-error}" "${PUBLIC_HEALTH_URL}"
  if [ "${public_status}" != "200" ]; then
    printf 'Action: restart %s\n' "${API_TUNNEL_LABEL}"
    restart_service "${API_TUNNEL_LABEL}" "${API_TUNNEL_PLIST}"
    sleep 3
    public_status="$(http_status "${PUBLIC_HEALTH_URL}")"
    printf 'Public API health after restart: %s\n' "${public_status:-curl-error}"
  fi
} >>"${LOG_FILE}" 2>&1
