#!/usr/bin/env bash
# scripts/demo.sh — ローカルAPIの受け入れ基準フローを一通り実演する。
set -euo pipefail
B="${BASE_URL:-http://localhost:3001}"
CT=(-H 'Content-Type: application/json')

jqp(){ node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.stringify(JSON.parse(d),null,2))}catch(e){console.log(d)}})'; }
field(){ node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const o=JSON.parse(d);console.log(eval("o."+process.argv[1]))})' "$1"; }

line(){ printf '\n\033[1;36m▼ %s\033[0m\n' "$1"; }

line "1) ユーザー作成（初回起動＝DL → signup +5）"
U=$(curl -s -X POST "$B/users" "${CT[@]}" -d '{"timezone":"Asia/Tokyo"}')
echo "$U" | jqp
A=$(echo "$U" | field user.id)

line "2) スキャン（残高あり → 解析ドラフト返却・★未消費）"
curl -s -X POST "$B/scan" -H "x-user-id: $A" "${CT[@]}" -d '{"image":"BASE64"}' | jqp

line "3) 残高（スキャンだけでは減らない＝5のまま）"
curl -s "$B/credits" -H "x-user-id: $A" | jqp

line "4) 保存（確定 → ★ここで1枚消費。signup 5→4、信頼度 n=1）"
curl -s -X POST "$B/receipts" -H "x-user-id: $A" "${CT[@]}" \
  -d '{"store":"スーパーたべれこ","date":"2026-06-03","total":616,"items":[{"name":"とりむね肉","amount":398,"category":"生鮮食品"},{"name":"牛乳","amount":218,"category":"飲料"}]}' | jqp

line "5) 残り4枚を使い切る（signup 4→0）"
for i in 1 2 3 4; do
  curl -s -X POST "$B/receipts" -H "x-user-id: $A" "${CT[@]}" \
    -d '{"date":"2026-06-03","items":[{"name":"item","amount":100,"category":"飲料"}]}' >/dev/null
done
curl -s "$B/credits" -H "x-user-id: $A" | jqp

line "6) 残高0でスキャン → 402 PayWall（★OCR未呼び出し）"
curl -s -X POST "$B/scan" -H "x-user-id: $A" "${CT[@]}" -d '{"image":"BASE64"}' | jqp

line "7) 月次集計（GET /receipts?month=2026-06：カテゴリ別＋信頼度）"
curl -s "$B/receipts?month=2026-06" -H "x-user-id: $A" | jqp

line "8) 紹介：被紹介者Bを作成・登録 → Aのコード適用で双方向+5"
VB=$(curl -s -X POST "$B/users" "${CT[@]}" -d '{"timezone":"Asia/Tokyo"}')
BID=$(echo "$VB" | field user.id)
curl -s -X POST "$B/register" -H "x-user-id: $BID" "${CT[@]}" -d '{"goal":"把握する"}' >/dev/null
ACODE=$(echo "$U" | field user.referral_code)
echo "Aの紹介コード: $ACODE"
curl -s -X POST "$B/referrals/claim" -H "x-user-id: $BID" "${CT[@]}" -d "{\"code\":\"$ACODE\"}" | jqp

line "9) プレミアム化（trial）→ 保存しても消費されない"
curl -s -X POST "$B/subscribe" -H "x-user-id: $BID" "${CT[@]}" -d '{"trial":true}' >/dev/null
curl -s -X POST "$B/receipts" -H "x-user-id: $BID" "${CT[@]}" \
  -d '{"items":[{"name":"外食","amount":1200,"category":"外食"}]}' | jqp

printf '\n\033[1;32m✅ デモ完了\033[0m\n'
