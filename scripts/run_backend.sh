#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
ENV_DIR="$BACKEND_DIR/.venv"
VENV_MARKER="$ENV_DIR/pyvenv.cfg"
LOCK_FILE="$BACKEND_DIR/uv.lock"
PYPROJECT_FILE="$BACKEND_DIR/pyproject.toml"

cd "$BACKEND_DIR"

if command -v uv >/dev/null 2>&1; then
  export UV_PROJECT_ENVIRONMENT="$ENV_DIR"

  need_sync=false
  if [ ! -f "$VENV_MARKER" ]; then
    echo "Creating backend virtual environment with uv at $ENV_DIR"
    need_sync=true
  elif { [ -f "$LOCK_FILE" ] && [ "$LOCK_FILE" -nt "$VENV_MARKER" ]; } || [ "$PYPROJECT_FILE" -nt "$VENV_MARKER" ]; then
    echo "Updating backend virtual environment to match project dependencies"
    need_sync=true
  fi

  if [ "$need_sync" = true ]; then
    uv sync --frozen
  fi

  uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload "$@"
else
  echo "uv is not installed; falling back to system Python virtual environment" >&2

  if [ ! -f "$VENV_MARKER" ]; then
    python3 -m venv "$ENV_DIR"
  fi

  # shellcheck disable=SC1090
  source "$ENV_DIR/bin/activate"

  pip install --upgrade pip
  pip install -r requirements.txt

  python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload "$@"
fi
