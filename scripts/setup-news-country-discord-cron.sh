#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MARKER="## WPR-NEWS-COUNTRY-DISCORD"
CRON_TZ="America/Chicago"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

CRON_MINUTE="30"
RUNNER="${PROJECT_ROOT}/scripts/run-news-country-discord-report.sh"

if [ -n "${NEWS_COUNTRY_REPORT_TZ:-}" ]; then
  CRON_TZ="${NEWS_COUNTRY_REPORT_TZ}"
fi

CRON_LINE="${CRON_MINUTE} * * * * TZ=${CRON_TZ} /bin/bash ${RUNNER} >> ${PROJECT_ROOT}/logs/news-country-discord-hourly.log 2>&1"

usage() {
  cat <<'USAGE'
Usage:
  scripts/setup-news-country-discord-cron.sh install
  scripts/setup-news-country-discord-cron.sh uninstall
  scripts/setup-news-country-discord-cron.sh print

Commands:
  install   Add or refresh hourly country-count discord report cron job (at minute 30).
  uninstall Remove WPR news-country-discord cron job.
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
    CLEANED="$(echo "${CURRENT}" | awk -v m="${MARKER}" -v r="${RUNNER}" '$0 !~ m && index($0, r) == 0 {print}')"
    {
      echo "${CLEANED}"
      print_entry
    } | sed '/^$/N;/^\n$/d' | crontab -
    echo "Installed crontab entry:"
    print_entry
    ;;

  uninstall)
    ensure_cron_available
    CURRENT="$(crontab -l 2>/dev/null || true)"
    echo "${CURRENT}" |
      awk -v m="${MARKER}" -v r="${RUNNER}" '$0 !~ m && index($0, r) == 0 {print}' |
      crontab -
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
