#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "[bootstrap] scripts/bootstrap-wpm-db.sh is deprecated; forwarding to scripts/bootstrap-wpr-db.sh"
exec bash "${ROOT_DIR}/scripts/bootstrap-wpr-db.sh" "$@"
