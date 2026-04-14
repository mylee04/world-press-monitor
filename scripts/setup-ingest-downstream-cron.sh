#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

RUNNER="${PROJECT_ROOT}/scripts/run-ingest-downstream-task.sh"
MARKER="## WPR-INGEST-DOWNSTREAM"
CRON_TZ="America/Chicago"

if [ -n "${INGEST_TZ:-}" ]; then
  CRON_TZ="${INGEST_TZ}"
fi

ENV_PREFIX="TZ=${CRON_TZ}"
CRON_LINE_BENCHMARK="0-59/5 * * * * ${ENV_PREFIX} /bin/bash ${RUNNER} --task=benchmark >> ${PROJECT_ROOT}/logs/ingest-downstream-benchmark.log 2>&1"
CRON_LINE_MAP="1-59/5 * * * * ${ENV_PREFIX} /bin/bash ${RUNNER} --task=map >> ${PROJECT_ROOT}/logs/ingest-downstream-map-snapshots.log 2>&1"
CRON_LINE_CUSTOMER="2-59/5 * * * * ${ENV_PREFIX} /bin/bash ${RUNNER} --task=customer >> ${PROJECT_ROOT}/logs/ingest-downstream-customer-dashboard.log 2>&1"
CRON_LINE_NEWS_COUNTRY="3-59/5 * * * * ${ENV_PREFIX} /bin/bash ${RUNNER} --task=news-country >> ${PROJECT_ROOT}/logs/ingest-downstream-news-country.log 2>&1"
CRON_LINE_INGEST_OPS="4-59/5 * * * * ${ENV_PREFIX} /bin/bash ${RUNNER} --task=ingest-ops >> ${PROJECT_ROOT}/logs/ingest-downstream-ingest-ops.log 2>&1"

deprecation_notice() {
  echo "Deprecated: local macOS scheduling should use launchd via scripts/setup-launchd-local.sh. Keep this cron path only for legacy/manual hosts." >&2
}

usage() {
  cat <<'USAGE'
Usage:
  scripts/setup-ingest-downstream-cron.sh install
  scripts/setup-ingest-downstream-cron.sh uninstall
  scripts/setup-ingest-downstream-cron.sh print

Commands:
  install   Add or refresh the split downstream cron jobs that poll for new ingest success markers.
  uninstall Remove WPR downstream cron jobs.
  print     Print crontab entries only.

Deprecated:
  Local macOS runtime should use `scripts/setup-launchd-local.sh`.
  This cron helper remains only for legacy/manual hosts.
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
  echo "${CRON_LINE_BENCHMARK}"
  echo "${CRON_LINE_MAP}"
  echo "${CRON_LINE_CUSTOMER}"
  echo "${CRON_LINE_NEWS_COUNTRY}"
  echo "${CRON_LINE_INGEST_OPS}"
}

case "${1:-install}" in
  install)
    deprecation_notice
    ensure_cron_available
    CURRENT="$(crontab -l 2>/dev/null || true)"
    CLEANED="$(echo "${CURRENT}" | awk -v m="${MARKER}" -v r="${RUNNER}" 'index($0, m) == 0 && index($0, r) == 0 {print}')"
    {
      echo "${CLEANED}"
      print_entry
    } | sed '/^$/N;/^\n$/d' | crontab -
    echo "Installed downstream cron jobs:"
    print_entry
    ;;
  uninstall)
    deprecation_notice
    ensure_cron_available
    CURRENT="$(crontab -l 2>/dev/null || true)"
    echo "${CURRENT}" | \
      awk -v m="${MARKER}" -v r="${RUNNER}" 'index($0, m) == 0 && index($0, r) == 0 {print}' | \
      crontab -
    echo "Removed downstream cron jobs if they existed."
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
