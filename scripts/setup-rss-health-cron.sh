#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env.local"

if [ -f "${ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

RUNNER="${PROJECT_ROOT}/scripts/run-rss-health-daily.sh"
MARKER="## WPM-RSS-HEALTH-DAILY"
CRON_TZ="America/Chicago"

quote_cron_env_value() {
  local value="$1"
  printf "'%s'" "$(printf "%s" "$value" | sed "s/'/'\"'\"'/g")"
}

build_cron_env_prefix() {
  local parts=()

  if [ -n "${RSS_HEALTH_DISCORD_WEBHOOK_URL:-}" ]; then
    parts+=("RSS_HEALTH_DISCORD_WEBHOOK_URL=$(quote_cron_env_value "${RSS_HEALTH_DISCORD_WEBHOOK_URL}")")
  fi
  if [ -n "${RSS_HEALTH_DISCORD_MENTION:-}" ]; then
    parts+=("RSS_HEALTH_DISCORD_MENTION=$(quote_cron_env_value "${RSS_HEALTH_DISCORD_MENTION}")")
  fi
  if [ -n "${RSS_HEALTH_DISCORD_USERNAME:-}" ]; then
    parts+=("RSS_HEALTH_DISCORD_USERNAME=$(quote_cron_env_value "${RSS_HEALTH_DISCORD_USERNAME}")")
  fi
  if [ -n "${RSS_HEALTH_DISCORD_TIMEOUT_MS:-}" ]; then
    parts+=("RSS_HEALTH_DISCORD_TIMEOUT_MS=${RSS_HEALTH_DISCORD_TIMEOUT_MS}")
  fi
  if [ -n "${RSS_HEALTH_TZ:-}" ]; then
    CRON_TZ="${RSS_HEALTH_TZ}"
  fi
  parts+=("TZ=${CRON_TZ}")

  printf '%s' "${parts[*]}"
}

ENV_PREFIX="$(build_cron_env_prefix)"
CRON_LINE="0 1 * * * ${ENV_PREFIX} ${RUNNER} >> ${PROJECT_ROOT}/logs/rss-health-daily.log 2>&1"

usage() {
  cat <<'USAGE'
Usage:
  scripts/setup-rss-health-cron.sh install
  scripts/setup-rss-health-cron.sh uninstall
  scripts/setup-rss-health-cron.sh print

Commands:
  install   Add or refresh daily 01:00 America/Chicago cron job.
  uninstall Remove WPM RSS health cron job.
  print     Print crontab entry only.
USAGE
}

ensure_cron_available() {
  if ! command -v crontab >/dev/null 2>&1; then
    echo "crontab is not available on this system."
    exit 1
  fi
}

print_entry() {
  echo "${MARKER}"
  echo "${CRON_LINE}"
}

case "${1:-install}" in
  install)
    ensure_cron_available
    CURRENT="$(crontab -l 2>/dev/null || true)"
    CLEANED="$(echo "${CURRENT}" | awk -v m="${MARKER}" '$0 !~ m')"
    {
      echo "${CLEANED}"
      echo "${MARKER}"
      echo "${CRON_LINE}"
    } | sed '/^$/N;/^\n$/d' | crontab -
    echo "Installed cron job:"
    print_entry
    ;;
  uninstall)
    ensure_cron_available
    CURRENT="$(crontab -l 2>/dev/null || true)"
    echo "${CURRENT}" | awk -v m="${MARKER}" '$0 !~ m && $0 !~ /run-rss-health-daily.sh/ {print}' | crontab -
    echo "Removed cron job if it existed."
    ;;
  print)
    print_entry
    ;;
  *)
    usage
    exit 1
    ;;
esac
