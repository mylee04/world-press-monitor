#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

WPR_RUNTIME_ROOT="${WPR_RUNTIME_ROOT:-${WPM_RUNTIME_ROOT:-${HOME}/srv/world-press-radar}}"
WPR_RUNTIME_REPO="${WPR_RUNTIME_REPO:-${WPM_RUNTIME_REPO:-${WPR_RUNTIME_ROOT}/repo}}"
WPR_RUNTIME_LOG_DIR="${WPR_RUNTIME_LOG_DIR:-${WPM_RUNTIME_LOG_DIR:-${WPR_RUNTIME_ROOT}/logs}}"
WPR_LAUNCHD_DIR="${WPR_LAUNCHD_DIR:-${WPM_LAUNCHD_DIR:-${HOME}/Library/LaunchAgents}}"
LAUNCHD_DOMAIN="gui/$(id -u)"

PLIST_NAMES=(
  "com.wpr.api-news.plist"
  "com.wpr.api-tunnel.plist"
  "com.wpr.api-runtime-watchdog.plist"
  "com.wpr.ingest-hourly.plist"
  "com.wpr.health-daily.plist"
)

LEGACY_PLIST_NAMES=(
  "com.wpm.api-news.plist"
  "com.wpm.api-tunnel.plist"
  "com.wpm.api-runtime-watchdog.plist"
  "com.wpm.ingest-hourly.plist"
  "com.wpm.health-daily.plist"
  "com.wpm.news-country-discord.plist"
  "com.wpm.ingest-ops-hourly.plist"
)

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[\/&|]/\\&/g'
}

sync_runtime_repo() {
  mkdir -p "${WPR_RUNTIME_REPO}" "${WPR_RUNTIME_LOG_DIR}" "${WPR_LAUNCHD_DIR}"

  rsync -a --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude 'logs' \
    --exclude 'postgres' \
    --exclude 'exports' \
    --exclude 'web-dist' \
    --exclude 'out' \
    --exclude '.next' \
    "${PROJECT_ROOT}/" "${WPR_RUNTIME_REPO}/"

  chmod +x \
    "${WPR_RUNTIME_REPO}/scripts/ensure-api-runtime-local.sh" \
    "${WPR_RUNTIME_REPO}/scripts/run-api-news.sh" \
    "${WPR_RUNTIME_REPO}/scripts/run-ingest-hourly-local.sh" \
    "${WPR_RUNTIME_REPO}/scripts/run-news-country-discord-report.sh" \
    "${WPR_RUNTIME_REPO}/scripts/run-ingest-ops-hourly.sh" \
    "${WPR_RUNTIME_REPO}/scripts/run-rss-health-daily-local.sh"

  (
    cd "${WPR_RUNTIME_REPO}"
    bun install
  )

  launchctl bootout "${LAUNCHD_DOMAIN}/com.wpm.export-deploy" >/dev/null 2>&1 || true
  launchctl bootout "${LAUNCHD_DOMAIN}/com.wpr.export-deploy" >/dev/null 2>&1 || true
  rm -f "${WPR_LAUNCHD_DIR}/com.wpm.export-deploy.plist"
  rm -f "${WPR_LAUNCHD_DIR}/com.wpr.export-deploy.plist"
}

render_plist() {
  local template_path=$1
  local target_path=$2
  local repo_escaped
  local logs_escaped

  repo_escaped="$(escape_sed_replacement "${WPR_RUNTIME_REPO}")"
  logs_escaped="$(escape_sed_replacement "${WPR_RUNTIME_LOG_DIR}")"

  sed \
    -e "s|/Users/your-user/srv/world-press-radar/repo|${repo_escaped}|g" \
    -e "s|/Users/your-user/srv/world-press-monitor/repo|${repo_escaped}|g" \
    -e "s|/Users/your-user/srv/world-press-radar/logs|${logs_escaped}|g" \
    -e "s|/Users/your-user/srv/world-press-monitor/logs|${logs_escaped}|g" \
    "${template_path}" > "${target_path}"
}

install_launch_agents() {
  mkdir -p "${WPR_LAUNCHD_DIR}"

  for plist_name in "${LEGACY_PLIST_NAMES[@]}"; do
    local label="${plist_name%.plist}"
    local target_path="${WPR_LAUNCHD_DIR}/${plist_name}"

    launchctl bootout "${LAUNCHD_DOMAIN}/${label}" >/dev/null 2>&1 || true
    rm -f "${target_path}"
  done

  for plist_name in "${PLIST_NAMES[@]}"; do
    local label="${plist_name%.plist}"
    local template_path="${PROJECT_ROOT}/ops/launchd/${plist_name}"
    local target_path="${WPR_LAUNCHD_DIR}/${plist_name}"

    render_plist "${template_path}" "${target_path}"
    launchctl bootout "${LAUNCHD_DOMAIN}/${label}" >/dev/null 2>&1 || true
    launchctl bootstrap "${LAUNCHD_DOMAIN}" "${target_path}"
  done
}

remove_launch_agents() {
  for plist_name in "${PLIST_NAMES[@]}"; do
    local label="${plist_name%.plist}"
    local target_path="${WPR_LAUNCHD_DIR}/${plist_name}"

    launchctl bootout "${LAUNCHD_DOMAIN}/${label}" >/dev/null 2>&1 || true
    rm -f "${target_path}"
  done
}

print_launch_agents() {
  for plist_name in "${PLIST_NAMES[@]}"; do
    local template_path="${PROJECT_ROOT}/ops/launchd/${plist_name}"
    echo "=== ${plist_name} ==="
    render_plist "${template_path}" /dev/stdout
    echo
  done
}

print_status() {
  for plist_name in "${PLIST_NAMES[@]}"; do
    local label="${plist_name%.plist}"
    echo "=== ${label} ==="
    launchctl print "${LAUNCHD_DOMAIN}/${label}" 2>/dev/null | rg 'state =|runs =|last exit code =|path =|working directory =|stdout path ='
    echo
  done
}

usage() {
  cat <<'USAGE'
Usage:
  scripts/setup-launchd-local.sh install
  scripts/setup-launchd-local.sh update
  scripts/setup-launchd-local.sh uninstall
  scripts/setup-launchd-local.sh print
  scripts/setup-launchd-local.sh status

Notes:
  - Runtime repo defaults to ~/srv/world-press-radar/repo.
  - Hourly country Discord report and hourly ingest ops report are chained from run-ingest-hourly-local.sh.
  - Legacy com.wpm.* agents are removed on install/update.
  - Do not point launchd at Desktop/Documents/Downloads worktrees.
USAGE
}

case "${1:-install}" in
  install|update)
    sync_runtime_repo
    install_launch_agents
    print_status
    ;;
  uninstall)
    remove_launch_agents
    ;;
  print)
    print_launch_agents
    ;;
  status)
    print_status
    ;;
  *)
    usage
    exit 1
    ;;
esac
