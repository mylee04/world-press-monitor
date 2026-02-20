#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

set -a
source ./.env.local
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. Check .env.local"
  exit 1
fi

STUDIO_PORT="${DRIZZLE_STUDIO_PORT:-4983}"
STUDIO_HOST="${DRIZZLE_STUDIO_HOST:-127.0.0.1}"

bunx drizzle-kit studio --config drizzle.config.ts --host "$STUDIO_HOST" --port "$STUDIO_PORT"
