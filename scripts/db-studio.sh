#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

: "${DATABASE_URL:=postgresql://postgres:postgres@127.0.0.1:${WPR_PG_PORT:-${WPM_PG_PORT:-5432}}/${WPR_DATABASE_NAME:-${WPM_DATABASE_NAME:-wpr}}}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. Check .env.macmini.local or the shell environment."
  exit 1
fi

STUDIO_PORT="${DRIZZLE_STUDIO_PORT:-4983}"
STUDIO_HOST="${DRIZZLE_STUDIO_HOST:-127.0.0.1}"

bunx drizzle-kit studio --config drizzle.config.ts --host "$STUDIO_HOST" --port "$STUDIO_PORT"
