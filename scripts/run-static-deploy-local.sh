#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

LOG_DIR="${WPR_LOG_DIR:-${WPM_LOG_DIR:-${PROJECT_ROOT}/logs}}"
LOG_FILE="${LOG_DIR}/static-deploy-local.log"
WEB_DIST_DIR="${WPR_WEB_DIST_DIR:-${WPM_WEB_DIST_DIR:-${PROJECT_ROOT}/web-dist}}"
SOURCE_PUBLIC_DATA_DIR="${WPR_PUBLIC_DATA_DIR:-${WPM_PUBLIC_DATA_DIR:-${PROJECT_ROOT}/public/data}}"
BUILD_PUBLIC_DATA_DIR="${PROJECT_ROOT}/public/data"
STATIC_OVERLAY_DIR="${PROJECT_ROOT}/.wpr-static-overlay"
LOCK_DIR="${PROJECT_ROOT}/.wpr-static-deploy-lock"
VERCEL_DEPLOY_ARCHIVE="${VERCEL_DEPLOY_ARCHIVE:-tgz}"

mkdir -p "${LOG_DIR}" "${WEB_DIST_DIR}" "${BUILD_PUBLIC_DATA_DIR}" "${STATIC_OVERLAY_DIR}"
cd "${PROJECT_ROOT}"
export PATH="${PATH}:/opt/homebrew/bin:/usr/local/bin"

if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  printf '[%s] Another static deploy instance is already running; skip.\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')" >>"${LOG_FILE}"
  exit 0
fi
trap 'rm -rf "${LOCK_DIR}"' EXIT

run_default_vercel_deploy() {
  local -a build_command
  local -a deploy_command
  build_command=(vercel build --prod --yes)
  deploy_command=(vercel deploy --prebuilt --prod --yes --archive "${VERCEL_DEPLOY_ARCHIVE}")

  if [ -n "${VERCEL_SCOPE:-}" ]; then
    build_command+=(--scope "${VERCEL_SCOPE}")
    deploy_command+=(--scope "${VERCEL_SCOPE}")
  fi
  if [ -n "${VERCEL_TOKEN:-}" ]; then
    build_command+=(--token "${VERCEL_TOKEN}")
    deploy_command+=(--token "${VERCEL_TOKEN}")
  fi

  printf 'Auto deploy target: linked Vercel project with static output overlay\n'
  printf 'Build command:'
  printf ' %q' "${build_command[@]}"
  printf '\n'
  if [ "${STATIC_OVERLAY_READY:-0}" = "1" ]; then
    printf 'Overlay source: %s\n' "${STATIC_OVERLAY_DIR}"
  else
    printf 'Overlay source: none (deploying direct Vercel build output)\n'
  fi
  printf 'Deploy command:'
  printf ' %q' "${deploy_command[@]}"
  printf '\n'
  "${build_command[@]}"
  if [ "${STATIC_OVERLAY_READY:-0}" = "1" ]; then
    mkdir -p "${PROJECT_ROOT}/.vercel/output/static"
    rsync -a --delete "${STATIC_OVERLAY_DIR}/" "${PROJECT_ROOT}/.vercel/output/static/"
  fi
  "${deploy_command[@]}"
}

validate_public_manifests() {
  python3 - "$1" <<'PY'
import json
import pathlib
import sys

base = pathlib.Path(sys.argv[1])
manifest_path = base / "manifest.json"
integration_path = base / "integration-manifest.json"

manifest = json.loads(manifest_path.read_text())
integration = json.loads(integration_path.read_text())

manifest_generated = manifest.get("generatedAt")
integration_generated = integration.get("generatedAt")

if not manifest_generated or not integration_generated:
    raise SystemExit("manifest validation failed: missing generatedAt")

if manifest_generated != integration_generated:
    raise SystemExit(
        f"manifest validation failed: manifest generatedAt={manifest_generated} integration generatedAt={integration_generated}"
    )

print(f"Manifest validation OK: {manifest_generated}")
PY
}

{
  printf '\n[%s] Start static export + deploy pipeline\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  printf 'Project: %s\n' "${PROJECT_ROOT}"
  printf 'Web dist dir: %s\n' "${WEB_DIST_DIR}"
  printf 'Source public data dir: %s\n' "${SOURCE_PUBLIC_DATA_DIR}"
  printf 'Build public data dir: %s\n' "${BUILD_PUBLIC_DATA_DIR}"
  printf 'Env file: %s\n' "${WPR_ENV_FILE_SOURCE:-${WPM_ENV_FILE_SOURCE:-inline-defaults}}"
  bash "${SCRIPT_DIR}/run-static-export-local.sh"
  if [ "${SOURCE_PUBLIC_DATA_DIR}" != "${BUILD_PUBLIC_DATA_DIR}" ]; then
    rsync -a --delete "${SOURCE_PUBLIC_DATA_DIR}/" "${BUILD_PUBLIC_DATA_DIR}/"
  fi
  validate_public_manifests "${BUILD_PUBLIC_DATA_DIR}"
  bun run web:build
  rm -rf "${STATIC_OVERLAY_DIR}"
  mkdir -p "${STATIC_OVERLAY_DIR}"
  STATIC_OVERLAY_READY=0
  if [ -d "${PROJECT_ROOT}/out" ]; then
    rsync -a --delete "${PROJECT_ROOT}/out/" "${STATIC_OVERLAY_DIR}/"
  else
    printf 'No local out/ directory produced by web:build; using data-only overlay.\n'
  fi
  mkdir -p "${STATIC_OVERLAY_DIR}/data"
  rsync -a --delete "${BUILD_PUBLIC_DATA_DIR}/" "${STATIC_OVERLAY_DIR}/data/"
  STATIC_OVERLAY_READY=1
  export STATIC_OVERLAY_READY
  if [ -n "${STATIC_DEPLOY_COMMAND:-}" ]; then
    printf 'Deploy command: %s\n' "${STATIC_DEPLOY_COMMAND}"
    /bin/zsh -lc "${STATIC_DEPLOY_COMMAND}"
  elif command -v vercel >/dev/null 2>&1 && [ -f "${PROJECT_ROOT}/.vercel/project.json" ]; then
    run_default_vercel_deploy
  else
    printf 'No STATIC_DEPLOY_COMMAND configured; synced build artifacts only.\n'
    if ! command -v vercel >/dev/null 2>&1; then
      printf 'Reason: Vercel CLI not found in PATH.\n'
    elif [ ! -f "${PROJECT_ROOT}/.vercel/project.json" ]; then
      printf 'Reason: no linked Vercel project found. Run `vercel link --project <your-vercel-project-name>` once.\n'
    fi
  fi
} >>"${LOG_FILE}" 2>&1
