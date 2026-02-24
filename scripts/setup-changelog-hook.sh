#!/usr/bin/env bash
set -euo pipefail

git config core.hooksPath .githooks
echo "Git hook path set to .githooks"
echo "Run `bun run changelog:append` manually once to seed initial entry."

