#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/frontend"

if command -v npm >/dev/null 2>&1; then
  npm install
  npm run dev -- --host
else
  echo "npm is required to run the frontend" >&2
  exit 1
fi
