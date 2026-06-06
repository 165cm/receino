#!/usr/bin/env bash
# scripts/phone.sh — スマホ実機テスト用に Expo を起動する（Expo Go / ネイティブ）。
# 以前のエラー原因（家ディレクトリでの実行・npx が expo 最新版を取得）を回避し、
# 必ずリポジトリ内のローカル expo(51) を使う。
set -e
export PATH="$HOME/.local/node/bin:$PATH"

# リポジトリルートへ（このスクリプトの2つ上）
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# LAN IP を自動取得し、アプリのAPI接続先に設定
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [ -z "$IP" ]; then echo "LAN IP を取得できませんでした。Wi-Fi接続を確認してください。"; exit 1; fi
export EXPO_PUBLIC_API_URL="http://${IP}:3001"

echo "──────────────────────────────────────────"
echo " 食べレコ スマホ起動"
echo "  API 接続先 : $EXPO_PUBLIC_API_URL"
echo "  ※ 別ターミナルで API を起動しておくこと: bash scripts/dev-api.sh"
echo "  Expo Go(スマホ) で表示QRを読み取ってください（同一Wi-Fi必須）"
echo "──────────────────────────────────────────"

cd "$ROOT/app"
# ローカルの expo を使用（node_modules/.bin/expo が優先される）
exec npx expo start
