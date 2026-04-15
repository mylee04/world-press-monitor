#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

# WPR names are the primary runtime contract. Legacy aliases remain here only so
# older local env files can migrate without breaking install/update.
WPR_RUNTIME_ROOT="${WPR_RUNTIME_ROOT:-${WPM_RUNTIME_ROOT:-${HOME}/srv/world-press-radar}}"
WPR_RUNTIME_REPO="${WPR_RUNTIME_REPO:-${WPM_RUNTIME_REPO:-${WPR_RUNTIME_ROOT}/repo}}"
WPR_RUNTIME_LOG_DIR="${WPR_RUNTIME_LOG_DIR:-${WPM_RUNTIME_LOG_DIR:-${WPR_RUNTIME_ROOT}/logs}}"
WPR_LAUNCHD_DIR="${WPR_LAUNCHD_DIR:-${WPM_LAUNCHD_DIR:-${HOME}/Library/LaunchAgents}}"
LAUNCHD_GUI_DOMAIN="gui/$(id -u)"
LAUNCHD_USER_DOMAIN="user/$(id -u)"
LAUNCHD_STATUS_DOMAINS=("${LAUNCHD_GUI_DOMAIN}" "${LAUNCHD_USER_DOMAIN}")
WPR_LAUNCHD_FORCE_ACTIVE_RELOAD="${WPR_LAUNCHD_FORCE_ACTIVE_RELOAD:-0}"

PLIST_NAMES=(
  "com.wpr.api-news.plist"
  "com.wpr.api-tunnel.plist"
  "com.wpr.api-runtime-watchdog.plist"
  "com.wpr.ingest-hourly.plist"
  "com.wpr.ingest-cold-tail-hourly.plist"
  "com.wpr.ingest-benchmark-hourly.plist"
  "com.wpr.map-snapshots-hourly.plist"
  "com.wpr.customer-dashboard-hourly.plist"
  "com.wpr.news-country-discord-hourly.plist"
  "com.wpr.ingest-ops-hourly.plist"
  "com.wpr.health-daily.plist"
)

LEGACY_PLIST_NAMES=(
  "com.wpm.api-news.plist"
  "com.wpm.api-tunnel.plist"
  "com.wpm.api-runtime-watchdog.plist"
  "com.wpm.ingest-hourly.plist"
  "com.wpm.ingest-rss-fastlane-strict.plist"
  "com.wpm.ingest-rss-fastlane-relaxed.plist"
  "com.wpm.health-daily.plist"
  "com.wpm.news-country-discord.plist"
  "com.wpm.ingest-ops-hourly.plist"
)

RETIRED_PLIST_NAMES=(
  "com.wpr.ingest-rss-fastlane-strict.plist"
  "com.wpr.ingest-rss-fastlane-relaxed.plist"
)

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[\/&|]/\\&/g'
}

is_truthy() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_protected_running_job_label() {
  local label=$1
  case "${label}" in
    com.wpr.ingest-hourly|com.wpm.ingest-hourly|com.wpr.ingest-cold-tail-hourly|com.wpr.ingest-benchmark-hourly|com.wpr.map-snapshots-hourly|com.wpr.customer-dashboard-hourly|com.wpr.news-country-discord-hourly|com.wpr.ingest-ops-hourly)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

label_is_running() {
  local label=$1
  local domain=""
  local output=""

  for domain in "${LAUNCHD_STATUS_DOMAINS[@]}"; do
    output="$(launchctl print "${domain}/${label}" 2>/dev/null || true)"
    if [ -z "${output}" ]; then
      continue
    fi
    if printf '%s\n' "${output}" | rg -q 'active count = [1-9][0-9]*|state = running|state = xpcproxy'; then
      return 0
    fi
  done

  return 1
}

should_defer_reload_for_label() {
  local label=$1

  if is_truthy "${WPR_LAUNCHD_FORCE_ACTIVE_RELOAD}"; then
    return 1
  fi

  if ! is_protected_running_job_label "${label}"; then
    return 1
  fi

  label_is_running "${label}"
}

bootout_label_all_domains() {
  local label=$1
  local domain=""
  for domain in "${LAUNCHD_STATUS_DOMAINS[@]}"; do
    launchctl bootout "${domain}/${label}" >/dev/null 2>&1 || true
  done
}

print_label_status() {
  local label=$1
  local domain=""
  local output=""

  for domain in "${LAUNCHD_STATUS_DOMAINS[@]}"; do
    output="$(launchctl print "${domain}/${label}" 2>/dev/null || true)"
    if [ -n "${output}" ]; then
      echo "domain = ${domain}"
      printf '%s\n' "${output}" | rg 'state =|runs =|last exit code =|path =|working directory =|stdout path =|stderr path ='
      return 0
    fi
  done

  echo "state = not loaded"
}

bootstrap_domain_for_label() {
  local label=$1
  case "${label}" in
    com.wpr.ingest-hourly|com.wpm.ingest-hourly|com.wpr.ingest-cold-tail-hourly|com.wpr.ingest-benchmark-hourly|com.wpr.map-snapshots-hourly|com.wpr.customer-dashboard-hourly|com.wpr.news-country-discord-hourly|com.wpr.ingest-ops-hourly)
      printf '%s\n' "${LAUNCHD_USER_DOMAIN}"
      ;;
    *)
      printf '%s\n' "${LAUNCHD_GUI_DOMAIN}"
      ;;
  esac
}

bootstrap_label() {
  local label=$1
  local target_path=$2
  local bootstrap_domain=""
  local attempt=0

  bootstrap_domain="$(bootstrap_domain_for_label "${label}")"
  launchctl enable "${bootstrap_domain}/${label}" >/dev/null 2>&1 || true
  while [ "${attempt}" -lt 3 ]; do
    if launchctl bootstrap "${bootstrap_domain}" "${target_path}" >/dev/null 2>&1; then
      return 0
    fi

    if launchctl print "${bootstrap_domain}/${label}" >/dev/null 2>&1; then
      echo "WARN: launchctl bootstrap returned non-zero but ${label} is loaded in ${bootstrap_domain}" >&2
      return 0
    fi

    sleep 1
    attempt=$((attempt + 1))
  done

  echo "ERROR: failed to bootstrap ${label} in ${bootstrap_domain}" >&2
  return 1
}

sync_runtime_repo() {
  mkdir -p "${WPR_RUNTIME_REPO}" "${WPR_RUNTIME_LOG_DIR}" "${WPR_LAUNCHD_DIR}"

  rsync -a --delete \
    --exclude '.git' \
    --exclude '.env*.local' \
    --exclude 'node_modules' \
    --exclude 'logs' \
    --exclude 'postgres' \
    --exclude 'exports' \
    --exclude 'web-dist' \
    --exclude 'out' \
    --exclude '.next' \
    --exclude '.wpr-state' \
    --exclude 'audits/browser-sitemap-profile' \
    --exclude 'audits/playwright-sitemap-profile' \
    --exclude 'audits/playwright-sitemap-profile-debug' \
    --exclude 'data/articles.db' \
    --exclude 'data/news.db' \
    --exclude 'data/dashboard-summary.snapshot.json' \
    --exclude 'data/country-benchmark.snapshot.json' \
    --exclude 'data/map-country-metrics.snapshot.*.json' \
    --exclude 'data/map-publishers.snapshot.*.json' \
    --exclude 'data/map-country-sources.snapshot.*.json' \
    "${PROJECT_ROOT}/" "${WPR_RUNTIME_REPO}/"

  chmod +x \
    "${WPR_RUNTIME_REPO}/scripts/ensure-api-runtime-local.sh" \
    "${WPR_RUNTIME_REPO}/scripts/run-ingest-downstream-task.sh" \
    "${WPR_RUNTIME_REPO}/scripts/run-api-news.sh" \
    "${WPR_RUNTIME_REPO}/scripts/run-ingest-cold-tail-local.sh" \
    "${WPR_RUNTIME_REPO}/scripts/run-ingest-hourly-local.sh" \
    "${WPR_RUNTIME_REPO}/scripts/run-ingest-rss-fastlane-local.sh" \
    "${WPR_RUNTIME_REPO}/scripts/run-news-country-discord-report.sh" \
    "${WPR_RUNTIME_REPO}/scripts/run-ingest-ops-hourly.sh" \
    "${WPR_RUNTIME_REPO}/scripts/run-rss-health-daily-local.sh"

  (
    cd "${WPR_RUNTIME_REPO}"
    bun install
  )

  bootout_label_all_domains "com.wpm.export-deploy"
  bootout_label_all_domains "com.wpr.export-deploy"
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

    bootout_label_all_domains "${label}"
    rm -f "${target_path}"
  done

  for plist_name in "${RETIRED_PLIST_NAMES[@]}"; do
    local label="${plist_name%.plist}"
    local target_path="${WPR_LAUNCHD_DIR}/${plist_name}"

    bootout_label_all_domains "${label}"
    rm -f "${target_path}"
  done

  for plist_name in "${PLIST_NAMES[@]}"; do
    local label="${plist_name%.plist}"
    local template_path="${PROJECT_ROOT}/ops/launchd/${plist_name}"
    local target_path="${WPR_LAUNCHD_DIR}/${plist_name}"

    render_plist "${template_path}" "${target_path}"
    if should_defer_reload_for_label "${label}"; then
      echo "INFO: ${label} is currently running; keeping the active job alive and deferring launchd reload." >&2
      continue
    fi
    bootout_label_all_domains "${label}"
    bootstrap_label "${label}" "${target_path}"
  done
}

remove_launch_agents() {
  for plist_name in "${RETIRED_PLIST_NAMES[@]}"; do
    local label="${plist_name%.plist}"
    local target_path="${WPR_LAUNCHD_DIR}/${plist_name}"

    bootout_label_all_domains "${label}"
    rm -f "${target_path}"
  done

  for plist_name in "${PLIST_NAMES[@]}"; do
    local label="${plist_name%.plist}"
    local target_path="${WPR_LAUNCHD_DIR}/${plist_name}"

    bootout_label_all_domains "${label}"
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
    print_label_status "${label}"
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
  - Hourly ingest only runs head + warm ingest:once and records a success marker.
  - Cold-tail rotation runs as a separate launchd job and no longer adds load to the main hourly ingest.
  - Benchmark/map/customer/news-country/ingest-ops run as separate downstream jobs with their own locks.
  - update/install keeps active ingest/downstream jobs alive by default; set WPR_LAUNCHD_FORCE_ACTIVE_RELOAD=1 to force a reload anyway.
  - Legacy pre-radar launch agents are removed on install/update.
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
