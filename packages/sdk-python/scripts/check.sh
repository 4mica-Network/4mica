#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -x .venv/bin/python ]; then
  echo "packages/sdk-python has no .venv; run: uv venv && uv pip install -e '.[dev,cdp]'" >&2
  exit 1
fi
export PATH="$PWD/.venv/bin:$PATH"

ruff format --check .
ruff check .
mypy
vulture
deptry .
pip-audit --skip-editable --progress-spinner off
pytest -q --cov
