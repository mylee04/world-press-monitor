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

prefer_default_prefixed_env() {
  local preferred_key=$1
  local legacy_key=$2
  local default_value="${3:-}"
  local current_value="${!preferred_key:-}"

  if [ -z "${current_value}" ] && [ -n "${default_value}" ]; then
    current_value="${default_value}"
  fi
  if [ -z "${current_value}" ]; then
    current_value="${!legacy_key:-}"
  fi

  if [ -n "${current_value}" ]; then
    export "${preferred_key}=${current_value}"
    export "${legacy_key}=${current_value}"
  fi
}

default_wpr_runtime_root() {
  local project_root="${WPR_PROJECT_ROOT:-${PWD}}"
  if [ "$(basename "${project_root}")" = "repo" ]; then
    local parent_dir
    parent_dir="$(cd "${project_root}/.." && pwd)"
    if [ "$(basename "${parent_dir}")" = "world-press-radar" ]; then
      printf '%s\n' "${parent_dir}"
      return 0
    fi
  fi
  printf '%s\n' "${HOME}/srv/world-press-radar"
}

default_wpr_log_dir() {
  local runtime_root_default="$1"
  local project_root="${WPR_PROJECT_ROOT:-${PWD}}"
  if [ "$(basename "${project_root}")" = "repo" ] && [ "$(basename "$(cd "${project_root}/.." && pwd)")" = "world-press-radar" ]; then
    printf '%s\n' "${runtime_root_default}/logs"
    return 0
  fi
  printf '%s\n' "${project_root}/logs"
}

pick_env_files() {
  local preferred_env_file="${WPR_ENV_FILE:-${WPM_ENV_FILE:-}}"
  if [ -n "${preferred_env_file}" ] && [ -f "${preferred_env_file}" ]; then
    printf '%s\n' "${preferred_env_file}"
    return 0
  fi

  local emitted=0
  if [ -f "${WPR_PROJECT_ROOT}/.env.local" ]; then
    printf '%s\n' "${WPR_PROJECT_ROOT}/.env.local"
    emitted=1
  fi
  if [ -f "${WPR_PROJECT_ROOT}/.env.macmini.local" ]; then
    printf '%s\n' "${WPR_PROJECT_ROOT}/.env.macmini.local"
    emitted=1
  fi
  if [ "${emitted}" -eq 1 ]; then
    return 0
  fi
  local runtime_root_default runtime_repo_candidate
  runtime_root_default="$(default_wpr_runtime_root)"
  runtime_repo_candidate="${WPR_RUNTIME_REPO:-${WPM_RUNTIME_REPO:-${runtime_root_default}/repo}}"

  if [ -d "${runtime_repo_candidate}" ] && [ "${runtime_repo_candidate}" != "${WPR_PROJECT_ROOT}" ]; then
    emitted=0
    if [ -f "${runtime_repo_candidate}/.env.local" ]; then
      printf '%s\n' "${runtime_repo_candidate}/.env.local"
      emitted=1
    fi
    if [ -f "${runtime_repo_candidate}/.env.macmini.local" ]; then
      printf '%s\n' "${runtime_repo_candidate}/.env.macmini.local"
      emitted=1
    fi
    if [ "${emitted}" -eq 1 ]; then
      return 0
    fi
    if [ -f "${runtime_repo_candidate}/.env" ]; then
      printf '%s\n' "${runtime_repo_candidate}/.env"
      return 0
    fi
  fi

  if [ -s "${WPR_PROJECT_ROOT}/.env.example" ]; then
    printf '%s\n' "${WPR_PROJECT_ROOT}/.env.example"
    return 0
  fi
  return 1
}

load_local_env() {
  local env_files env_file loaded_sources=()
  env_files="$(pick_env_files || true)"
  if [ -n "${env_files}" ]; then
    while IFS= read -r env_file; do
      [ -z "${env_file}" ] && continue
      [ ! -f "${env_file}" ] && continue
      set -a
      # shellcheck disable=SC1090
      source "${env_file}"
      set +a
      loaded_sources+=("${env_file}")
    done <<EOF
${env_files}
EOF
    if [ "${#loaded_sources[@]}" -gt 0 ]; then
      local joined_sources
      joined_sources="$(printf '%s\n' "${loaded_sources[@]}" | paste -sd ',' -)"
      export WPR_ENV_FILE_SOURCE="${joined_sources}"
      export WPM_ENV_FILE_SOURCE="${joined_sources}"
    else
      export WPR_ENV_FILE_SOURCE=""
      export WPM_ENV_FILE_SOURCE=""
    fi
  else
    export WPR_ENV_FILE_SOURCE=""
    export WPM_ENV_FILE_SOURCE=""
  fi

  local runtime_root_default runtime_repo_default runtime_log_dir_default log_dir_default state_dir_default launchd_dir_default pgdata_dir_default
  runtime_root_default="$(default_wpr_runtime_root)"
  prefer_default_prefixed_env "WPR_RUNTIME_ROOT" "WPM_RUNTIME_ROOT" "${runtime_root_default}"
  runtime_repo_default="${WPR_RUNTIME_ROOT}/repo"
  runtime_log_dir_default="${WPR_RUNTIME_ROOT}/logs"
  pgdata_dir_default="${WPR_RUNTIME_ROOT}/postgres"
  log_dir_default="$(default_wpr_log_dir "${WPR_RUNTIME_ROOT}")"
  state_dir_default="${WPR_PROJECT_ROOT}/.wpr-state"
  launchd_dir_default="${HOME}/Library/LaunchAgents"

  mirror_prefixed_env "WPR_ENV_FILE" "WPM_ENV_FILE"
  mirror_prefixed_env "WPR_PG_PORT" "WPM_PG_PORT" "5432"
  mirror_prefixed_env "WPR_DATABASE_NAME" "WPM_DATABASE_NAME" "wpr"
  prefer_default_prefixed_env "WPR_PGDATA_DIR" "WPM_PGDATA_DIR" "${pgdata_dir_default}"
  prefer_default_prefixed_env "WPR_RUNTIME_REPO" "WPM_RUNTIME_REPO" "${runtime_repo_default}"
  prefer_default_prefixed_env "WPR_RUNTIME_LOG_DIR" "WPM_RUNTIME_LOG_DIR" "${runtime_log_dir_default}"
  prefer_default_prefixed_env "WPR_LOG_DIR" "WPM_LOG_DIR" "${log_dir_default}"
  mirror_prefixed_env "WPR_PRIMARY_WORKTREE" "WPM_PRIMARY_WORKTREE"
  prefer_default_prefixed_env "WPR_STATE_DIR" "WPM_STATE_DIR" "${state_dir_default}"
  mirror_prefixed_env "WPR_POST_INGEST_REPORTS" "WPM_POST_INGEST_REPORTS"
  prefer_default_prefixed_env "WPR_LAUNCHD_DIR" "WPM_LAUNCHD_DIR" "${launchd_dir_default}"
  mirror_prefixed_env "WPR_PUBLIC_API_HEALTH_URL" "WPM_PUBLIC_API_HEALTH_URL"
  mirror_prefixed_env "WPR_LOCAL_API_HEALTH_URL" "WPM_LOCAL_API_HEALTH_URL"
  mirror_prefixed_env "WPR_HOURLY_DISCORD_WEBHOOK" "WPM_HOURLY_DISCORD_WEBHOOK"
  mirror_prefixed_env "WPR_INGEST_MAX_RUNTIME_SECONDS" "WPM_INGEST_MAX_RUNTIME_SECONDS"
  mirror_prefixed_env "WPR_INGEST_TIMEOUT_GRACE_SECONDS" "WPM_INGEST_TIMEOUT_GRACE_SECONDS"
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
