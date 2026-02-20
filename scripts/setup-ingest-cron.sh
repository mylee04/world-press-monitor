#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUNNER="${PROJECT_ROOT}/scripts/run-ingest-hourly.sh"
MARKER="## WPM-INGEST-HOURLY"
CRON_TZ="America/Chicago"
CRON_MINUTE="${INGEST_CRON_MINUTE:-55}"

if [ -n "${INGEST_TZ:-}" ]; then
  CRON_TZ="${INGEST_TZ}"
fi

ENV_PREFIX="TZ=${CRON_TZ}"
CRON_LINE_HOURLY="${CRON_MINUTE} * * * * ${ENV_PREFIX} /bin/bash ${RUNNER} >> ${PROJECT_ROOT}/logs/ingest-hourly.log 2>&1"

usage() {
  cat <<'USAGE'
Usage:
  scripts/setup-ingest-cron.sh install
  scripts/setup-ingest-cron.sh uninstall
  scripts/setup-ingest-cron.sh print

Commands:
  install   Add or refresh hourly ingest cron job (at INGEST_CRON_MINUTE, default 55) using America/Chicago by default.
  uninstall Remove WPM hourly ingest cron job.
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
  echo "${CRON_LINE_HOURLY}"
}

case "${1:-install}" in
  install)
    ensure_cron_available
    CURRENT="$(crontab -l 2>/dev/null || true)"
CLEANED="$(echo "${CURRENT}" | awk -v m="${MARKER}" -v h="${RUNNER}" '\
          index($0, m) == 0 && index($0, h) == 0 {print}')"
    {
      echo "${CLEANED}"
      print_entry
    } | sed '/^$/N;/^\n$/d' | crontab -
    echo "Installed cron job:"
    print_entry
    ;;
  uninstall)
    ensure_cron_available
    CURRENT="$(crontab -l 2>/dev/null || true)"
    echo "${CURRENT}" | awk -v m="${MARKER}" -v h="${RUNNER}" '\
          index($0, m) == 0 && index($0, h) == 0 {print}' \
      | crontab -
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
