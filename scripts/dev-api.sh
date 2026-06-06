#!/usr/bin/env bash
# scripts/dev-api.sh — APIサーバを起動（.env を読み込み、0.0.0.0 で公開）。
set -e
export PATH="$HOME/.local/node/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec npm run start -w @receino/server
