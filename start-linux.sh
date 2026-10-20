#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd -- "$PROJECT_DIR"
if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This launcher is for Linux / WSL. On Windows double-click Start-MediaSlimX.cmd."
  exit 1
fi
if [[ ! -x "$PROJECT_DIR/.venv/bin/python" ]]; then
  python3 -m venv "$PROJECT_DIR/.venv"
fi
if ! "$PROJECT_DIR/.venv/bin/python" -c "import os,sys; assert os.name == 'posix' and sys.version_info >= (3,10); import fastapi,uvicorn,PIL" 2>/dev/null; then
  "$PROJECT_DIR/.venv/bin/python" -m pip install -r "$PROJECT_DIR/requirements-lock.txt"
fi
# Keep the existing data directory so WSL users retain their task history.
exec "$PROJECT_DIR/.venv/bin/python" -m mediaslimx \
  --allow-root "$PROJECT_DIR" --data-dir "$PROJECT_DIR/.mediaslimx/wsl" --port 8765 "$@"
