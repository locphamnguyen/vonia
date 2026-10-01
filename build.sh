#!/usr/bin/env bash
# Build Vonia Voice Studio trên macOS / Linux.
# Tự cài uv (và bun nếu máy chưa có bun lẫn Node.js), rồi chạy scripts/build.py.
# Dùng: ./build.sh [--torch auto|cuda|cpu] [--download-model] [--skip-web] [--dev]
set -euo pipefail
cd "$(dirname "$0")"

export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$HOME/.bun/bin:$PATH"

if ! command -v uv >/dev/null 2>&1; then
  echo "==> Cài uv"
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi

if ! command -v bun >/dev/null 2>&1 && ! command -v npm >/dev/null 2>&1; then
  echo "==> Cài bun (cần để build giao diện web)"
  command -v unzip >/dev/null 2>&1 || { echo "[LỖI] Cần 'unzip' để cài bun (vd: sudo apt install unzip)"; exit 1; }
  curl -fsSL https://bun.sh/install | bash
fi

exec uv run --no-project --python 3.12 scripts/build.py "$@"
