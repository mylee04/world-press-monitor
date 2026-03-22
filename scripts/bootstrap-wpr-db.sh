#!/usr/bin/env bash
set -euo pipefail
set -o pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "${ROOT_DIR}/scripts/load-local-env.sh"
load_local_env

if ! command -v psql >/dev/null 2>&1; then
  echo "[bootstrap] ERROR: psql command not found. Install PostgreSQL client first."
  exit 1
fi

FRESH=0
MIGRATE_FROM_TEMPLATE=1
RUN_SCHEMA_SYNC=1

usage() {
  cat <<'EOF'
Usage: scripts/bootstrap-wpr-db.sh [options]

Options:
  --fresh              Remove docker volume and recreate from scratch.
  --no-migrate         Skip presslab/wpm -> target migration if the target DB is missing.
  --skip-sync-check    Skip db:check-schema-sync after bootstrap.
  -h, --help           Show this help.
EOF
}

while (($# > 0)); do
  case "$1" in
    --fresh)
      FRESH=1
      shift
      ;;
    --no-migrate)
      MIGRATE_FROM_TEMPLATE=0
      shift
      ;;
    --skip-sync-check)
      RUN_SCHEMA_SYNC=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

: "${DATABASE_URL:=postgresql://postgres:postgres@127.0.0.1:${WPR_PG_PORT:-5432}/${WPR_DATABASE_NAME:-wpr}}"

ADMIN_DATABASE_URL="${DATABASE_URL%/*}/postgres"
TARGET_DB_NAME="${DATABASE_URL##*/}"
TARGET_DB_NAME="${TARGET_DB_NAME%%\?*}"

if [[ ! "${TARGET_DB_NAME}" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "[bootstrap] ERROR: unsupported target database name '${TARGET_DB_NAME}'."
  exit 1
fi

mask_db_url() {
  local input=$1
  if [[ "$input" == *"@"* ]]; then
    local proto="${input%%://*}"
    local rest="${input#*://}"
    local userpass="${rest%%@*}"
    local hostpart="${rest#*@}"
    local user="${userpass%%:*}"
    echo "${proto}://$user:***@${hostpart}"
  else
    echo "$input"
  fi
}

MASKED_DATABASE_URL="$(mask_db_url "$DATABASE_URL")"
MASKED_ADMIN_DATABASE_URL="$(mask_db_url "$ADMIN_DATABASE_URL")"

echo "[bootstrap] DATABASE_URL=${MASKED_DATABASE_URL}"
echo "[bootstrap] ADMIN_DATABASE_URL=${MASKED_ADMIN_DATABASE_URL}"

if [ "$FRESH" -eq 1 ]; then
  echo "[bootstrap] Recreating PostgreSQL service and data volume (--fresh)"
  docker compose down -v postgres
else
  echo "[bootstrap] Stopping PostgreSQL service (keeping volume)"
  docker compose down postgres
fi

echo "[bootstrap] Starting PostgreSQL service"
docker compose up -d postgres

echo "[bootstrap] Waiting for PostgreSQL readiness"
for i in {1..60}; do
  if psql "$ADMIN_DATABASE_URL" -c '\q' >/dev/null 2>&1; then
    echo "[bootstrap] PostgreSQL is ready."
    break
  fi
  echo "[bootstrap] retry ${i}/60..."
  sleep 2
done

if ! psql "$ADMIN_DATABASE_URL" -c '\q' >/dev/null 2>&1; then
  echo "[bootstrap] PostgreSQL did not become ready in time."
  exit 1
fi

target_exists="$(psql "$ADMIN_DATABASE_URL" -tAX -c "select 1 from pg_database where datname='${TARGET_DB_NAME}';" | tr -d '[:space:]')"

if [ -z "$target_exists" ]; then
  if [ "$MIGRATE_FROM_TEMPLATE" -eq 1 ]; then
    has_presslab="$(psql "$ADMIN_DATABASE_URL" -tAX -c "select 1 from pg_database where datname='presslab';" | tr -d '[:space:]')"
    has_legacy_wpm="$(psql "$ADMIN_DATABASE_URL" -tAX -c "select 1 from pg_database where datname='wpm';" | tr -d '[:space:]')"

    if [ -n "$has_presslab" ]; then
      echo "[bootstrap] ${TARGET_DB_NAME} DB missing, creating from presslab template..."
      psql "$ADMIN_DATABASE_URL" -c "CREATE DATABASE ${TARGET_DB_NAME} WITH TEMPLATE presslab OWNER postgres;"
    elif [ -n "$has_legacy_wpm" ] && [ "${TARGET_DB_NAME}" != 'wpm' ]; then
      echo "[bootstrap] ${TARGET_DB_NAME} DB missing, creating from legacy wpm template..."
      psql "$ADMIN_DATABASE_URL" -c "CREATE DATABASE ${TARGET_DB_NAME} WITH TEMPLATE wpm OWNER postgres;"
    else
      echo "[bootstrap] ${TARGET_DB_NAME} DB missing, creating empty database..."
      psql "$ADMIN_DATABASE_URL" -c "CREATE DATABASE ${TARGET_DB_NAME} OWNER postgres;"
    fi
  else
    echo "[bootstrap] ${TARGET_DB_NAME} DB missing, creating empty database..."
    psql "$ADMIN_DATABASE_URL" -c "CREATE DATABASE ${TARGET_DB_NAME} OWNER postgres;"
  fi
fi

echo "[bootstrap] Applying schema (db/schema.sql) to ${MASKED_DATABASE_URL}"
psql "$DATABASE_URL" -f db/schema.sql

if [ "$RUN_SCHEMA_SYNC" -eq 1 ]; then
  echo "[bootstrap] Running schema sync check"
  bun run db:check-schema-sync
fi

echo "[bootstrap] Done."
