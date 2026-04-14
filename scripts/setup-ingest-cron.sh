#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

RUNNER="${PROJECT_ROOT}/scripts/run-ingest-hourly.sh"
MARKER="## WPR-INGEST-HOURLY"
CRON_TZ="America/Chicago"
CRON_MINUTE="25"

if [ -n "${INGEST_TZ:-}" ]; then
  CRON_TZ="${INGEST_TZ}"
fi

ENV_PREFIX="TZ=${CRON_TZ}"
CRON_LINE_HOURLY="${CRON_MINUTE} * * * * ${ENV_PREFIX} /bin/bash ${RUNNER} >> ${PROJECT_ROOT}/logs/ingest-hourly.log 2>&1"

deprecation_notice() {
  echo "Deprecated: local macOS scheduling should use launchd via scripts/setup-launchd-local.sh. Keep this cron path only for legacy/manual hosts." >&2
}

usage() {
  cat <<'USAGE'
Usage:
  scripts/setup-ingest-cron.sh install
  scripts/setup-ingest-cron.sh uninstall
  scripts/setup-ingest-cron.sh print

Commands:
  install   Add or refresh hourly ingest cron job (at minute 25) using America/Chicago by default.
  uninstall Remove WPR hourly ingest cron job.
  print     Print crontab entry only.

Deprecated:
  Local macOS runtime should use `scripts/setup-launchd-local.sh`.
  This cron helper remains only for legacy/manual hosts.

Important:
  This helper installs only the core hourly ingest.
  Install `scripts/setup-ingest-downstream-cron.sh` separately for benchmark/map/customer/Discord downstream jobs.
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
    deprecation_notice
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
    deprecation_notice
    ensure_cron_available
    CURRENT="$(crontab -l 2>/dev/null || true)"
    echo "${CURRENT}" | awk -v m="${MARKER}" -v h="${RUNNER}" '\
          index($0, m) == 0 && index($0, h) == 0 {print}' \
      | crontab -
    echo "Removed cron job if it existed."
    ;;
  print)
    deprecation_notice
    print_entry
    ;;
  *)
    usage
    exit 1
    ;;
esac
