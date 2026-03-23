#!/usr/bin/env bash

if [ -z "${WPR_ENV_HELPER_LOADED:-${WPM_ENV_HELPER_LOADED:-}}" ]; then
  export WPR_ENV_HELPER_LOADED=1
  export WPM_ENV_HELPER_LOADED=1
fi

if [ -z "${WPR_SCRIPT_DIR:-${WPM_SCRIPT_DIR:-}}" ]; then
  WPR_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
if [ -z "${WPR_PROJECT_ROOT:-${WPM_PROJECT_ROOT:-}}" ]; then
  WPR_PROJECT_ROOT="$(cd "${WPR_SCRIPT_DIR}/.." && pwd)"
fi
export WPR_SCRIPT_DIR
export WPM_SCRIPT_DIR="${WPM_SCRIPT_DIR:-${WPR_SCRIPT_DIR}}"
export WPR_PROJECT_ROOT
export WPM_PROJECT_ROOT="${WPM_PROJECT_ROOT:-${WPR_PROJECT_ROOT}}"

mirror_prefixed_env() {
  local preferred_key=$1
  local legacy_key=$2
  local default_value="${3:-}"
  local current_value="${!preferred_key:-${!legacy_key:-${default_value}}}"

  if [ -n "${current_value}" ]; then
    export "${preferred_key}=${current_value}"
    export "${legacy_key}=${current_value}"
  fi
}

pick_env_file() {
  local preferred_env_file="${WPR_ENV_FILE:-${WPM_ENV_FILE:-}}"
  if [ -n "${preferred_env_file}" ] && [ -f "${preferred_env_file}" ]; then
    printf '%s\n' "${preferred_env_file}"
    return 0
  fi
  if [ -f "${WPR_PROJECT_ROOT}/.env.local" ]; then
    printf '%s\n' "${WPR_PROJECT_ROOT}/.env.local"
    return 0
  fi
  if [ -f "${WPR_PROJECT_ROOT}/.env.macmini.local" ]; then
    printf '%s\n' "${WPR_PROJECT_ROOT}/.env.macmini.local"
    return 0
  fi
  if [ -f "${WPR_PROJECT_ROOT}/.env.example" ]; then
    printf '%s\n' "${WPR_PROJECT_ROOT}/.env.example"
    return 0
  fi
  return 1
}

load_local_env() {
  local env_file
  env_file="$(pick_env_file || true)"
  if [ -n "${env_file}" ] && [ -f "${env_file}" ]; then
    set -a
    # shellcheck disable=SC1090
    source "${env_file}"
    set +a
    export WPR_ENV_FILE_SOURCE="${env_file}"
    export WPM_ENV_FILE_SOURCE="${env_file}"
  else
    export WPR_ENV_FILE_SOURCE=""
    export WPM_ENV_FILE_SOURCE=""
  fi

  mirror_prefixed_env "WPR_ENV_FILE" "WPM_ENV_FILE"
  mirror_prefixed_env "WPR_PG_PORT" "WPM_PG_PORT" "5432"
  mirror_prefixed_env "WPR_DATABASE_NAME" "WPM_DATABASE_NAME" "wpr"
  mirror_prefixed_env "WPR_PGDATA_DIR" "WPM_PGDATA_DIR"
  mirror_prefixed_env "WPR_LOG_DIR" "WPM_LOG_DIR"
  mirror_prefixed_env "WPR_PRIMARY_WORKTREE" "WPM_PRIMARY_WORKTREE"
  mirror_prefixed_env "WPR_STATE_DIR" "WPM_STATE_DIR"
  mirror_prefixed_env "WPR_POST_INGEST_REPORTS" "WPM_POST_INGEST_REPORTS"
  mirror_prefixed_env "WPR_RUNTIME_ROOT" "WPM_RUNTIME_ROOT"
  mirror_prefixed_env "WPR_RUNTIME_REPO" "WPM_RUNTIME_REPO"
  mirror_prefixed_env "WPR_RUNTIME_LOG_DIR" "WPM_RUNTIME_LOG_DIR"
  mirror_prefixed_env "WPR_LAUNCHD_DIR" "WPM_LAUNCHD_DIR"
  mirror_prefixed_env "WPR_PUBLIC_API_HEALTH_URL" "WPM_PUBLIC_API_HEALTH_URL"
  mirror_prefixed_env "WPR_LOCAL_API_HEALTH_URL" "WPM_LOCAL_API_HEALTH_URL"
  mirror_prefixed_env "WPR_HOURLY_DISCORD_WEBHOOK" "WPM_HOURLY_DISCORD_WEBHOOK"
  mirror_prefixed_env "WPR_NEWS_COUNTRY_REPORT_MIN_INTERVAL_MINUTES" "WPM_NEWS_COUNTRY_REPORT_MIN_INTERVAL_MINUTES"
  mirror_prefixed_env "WPR_FORCE_NEWS_COUNTRY_REPORT" "WPM_FORCE_NEWS_COUNTRY_REPORT"
  mirror_prefixed_env "WPR_INGEST_OPS_MIN_INTERVAL_MINUTES" "WPM_INGEST_OPS_MIN_INTERVAL_MINUTES"
  mirror_prefixed_env "WPR_FORCE_INGEST_OPS_REPORT" "WPM_FORCE_INGEST_OPS_REPORT"

  : "${DATABASE_URL:=postgresql://postgres:postgres@127.0.0.1:${WPR_PG_PORT}/wpr}"

  local database_name="${DATABASE_URL##*/}"
  database_name="${database_name%%\?*}"
  if [ -n "${database_name}" ]; then
    export WPR_DATABASE_NAME="${WPR_DATABASE_NAME:-${database_name}}"
    export WPM_DATABASE_NAME="${WPM_DATABASE_NAME:-${WPR_DATABASE_NAME}}"
  fi
  export DATABASE_URL
  export PATH="${HOME}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:${PATH}"
}
