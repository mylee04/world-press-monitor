#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

RUNNER_HOURLY="${PROJECT_ROOT}/scripts/run-ingest-ops-hourly.sh"
RUNNER_DAILY="${PROJECT_ROOT}/scripts/run-ingest-ops-daily.sh"
MARKER="## WPM-INGEST-OPS"
CRON_TZ="America/Chicago"

if [ -n "${INGEST_OPS_TZ:-}" ]; then
  CRON_TZ="${INGEST_OPS_TZ}"
fi

ENV_PREFIX="TZ=${CRON_TZ}"
CRON_LINE_HOURLY="0 * * * * ${ENV_PREFIX} ${RUNNER_HOURLY} >> ${PROJECT_ROOT}/logs/ingest-ops-hourly.log 2>&1"
CRON_LINE_DAILY="0 2 * * * ${ENV_PREFIX} ${RUNNER_DAILY} >> ${PROJECT_ROOT}/logs/ingest-ops-daily.log 2>&1"

usage() {
  cat <<'USAGE'
Usage:
  scripts/setup-ingest-ops-cron.sh install
  scripts/setup-ingest-ops-cron.sh uninstall
  scripts/setup-ingest-ops-cron.sh print

Commands:
  install   Add or refresh ingest ops cron jobs (hourly + daily at 02:00) using America/Chicago by default.
  uninstall Remove WPM ingest ops cron jobs.
  print     Print crontab entries only.
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
  echo "${CRON_LINE_DAILY}"
}

case "${1:-install}" in
  install)
    ensure_cron_available
    CURRENT="$(crontab -l 2>/dev/null || true)"
    CLEANED="$(echo "${CURRENT}" | awk -v m="${MARKER}" -v h="${RUNNER_HOURLY}" -v d="${RUNNER_DAILY}" '\
          index($0, m) == 0 && index($0, h) == 0 && index($0, d) == 0 {print}')"
    {
      echo "${CLEANED}"
      print_entry
    } | sed '/^$/N;/^\n$/d' | crontab -
    echo "Installed cron jobs:"
    print_entry
    ;;
  uninstall)
    ensure_cron_available
    CURRENT="$(crontab -l 2>/dev/null || true)"
    echo "${CURRENT}" | \
      awk -v m="${MARKER}" -v h="${RUNNER_HOURLY}" -v d="${RUNNER_DAILY}" '\
          index($0, m) == 0 && index($0, h) == 0 && index($0, d) == 0 {print}' \
      | crontab -
    echo "Removed cron jobs if they existed."
    ;;
  print)
    print_entry
    ;;
  *)
    usage
    exit 1
    ;;
esac
