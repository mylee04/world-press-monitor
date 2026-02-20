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

export WPM_API_GATEWAY_HOST="${WPM_API_GATEWAY_HOST:-0.0.0.0}"
export WPM_API_GATEWAY_PORT="${WPM_API_GATEWAY_PORT:-8000}"
export NEWS_API_DEFAULT_BASE_URL="${NEWS_API_DEFAULT_BASE_URL:-http://127.0.0.1:4100}"

cd "${PROJECT_ROOT}"

python3 -m uvicorn api_gateway.main:app \
  --host "${WPM_API_GATEWAY_HOST}" \
  --port "${WPM_API_GATEWAY_PORT}"
