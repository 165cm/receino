#!/usr/bin/env bash
# scripts/web-preview.sh — preview ツールから Expo Web を起動するラッパ。
# preview spawner の PATH には node が無いため、ここで通す。
export PATH="$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")/../app" || exit 1
PORT="${PORT:-8081}"
exec env CI=1 EXPO_NO_TELEMETRY=1 npx expo start --web --port "$PORT"
