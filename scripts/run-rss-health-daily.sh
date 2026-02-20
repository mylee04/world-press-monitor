#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"
LOG_FILE="${LOG_DIR}/rss-health-daily.log"
RUNNER_COMMAND="bun run rss:health:daily"

ENV_FILE="${PROJECT_ROOT}/.env.local"
if [ -f "${ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

TIMEZONE="${RSS_HEALTH_TZ:-America/Chicago}"

mkdir -p "${LOG_DIR}"
cd "${PROJECT_ROOT}"
export TZ="${TIMEZONE}"
export PATH="${PATH}:/opt/homebrew/bin:/usr/local/bin"

{
  printf '\n[%s] Start daily RSS health pipeline\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  printf 'Project: %s\n' "${PROJECT_ROOT}"
  printf 'Command: %s\n' "${RUNNER_COMMAND}"
  ${RUNNER_COMMAND}
} >>"${LOG_FILE}" 2>&1
