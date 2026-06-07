# Receino（レシーノ） — Developer Guide

> ユーザー向け説明は [README.md](./README.md) を参照。

仕様の単一の真実(SSOT)はルートの開発仕様書、実装設計は [`docs/DESIGN.md`](docs/DESIGN.md)。
設計原則: **クレジットの付与・消費・失効・紹介の判定はすべてサーバが真実**。アプリは表示のみ（SSOT §4 / §5.3）。

## 技術スタック

| レイヤ | 採用技術 |
|---|---|
| 言語 / フレームワーク | TypeScript／Expo (React Native)（iOS・Android・Web を単一コード）／Fastify (API) |
| データ | インメモリ + JSON ファイル永続（MVP）。同インターフェースで Postgres へ差し替え可 |
| 外部API | Google Gemini（OCR＋構造化を1コール・既定）／Anthropic Claude（代替） |
| デプロイ | Web 静的書き出し（receino.com）／Expo で iOS・Android |

## セットアップ

前提: **Node.js >= 20**。このリポジトリでは Node を `~/.local/node` に展開して使用するため、各シェルで PATH を通すこと。

```bash
export PATH="$HOME/.local/node/bin:$PATH"
npm install
npm run build -w @receino/core   # core を dist へビルド（app/server はこれを参照）
cp .env.example .env             # 本物のAI解析を使う場合のみ（未設定はモックOCR）
```

> ⚠️ `packages/core` を変更したら必ず `npm run build -w @receino/core` を実行。app/server は実行時に `packages/core/dist` を読むため、型チェックが通っても dist が古いと実行時に落ちる。

## 環境変数

`.env.example` をコピーして `.env` を作成。すべて任意（未設定ならモックOCRで動作）。

| 変数 | 説明 | 必須 |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini のキー（OCR＋構造化）。[AI Studio](https://aistudio.google.com/apikey) で取得 | 任意 |
| `GEMINI_MODEL` | 使用モデル（既定 `gemini-2.5-flash`） | 任意 |
| `ANTHROPIC_API_KEY` | 代替: Claude を使う場合のみ（Google 未設定時に使用） | 任意 |
| `CLAUDE_MODEL` | Claude のモデル名 | 任意 |
| `PORT` | API ポート（既定 `3001`） | 任意 |
| `EXPO_PUBLIC_API_URL` | アプリのAPI接続先の上書き（既定 `http://localhost:3001`） | 任意 |

## スクリプト

| コマンド | 役割 |
|---|---|
| `npm test` | 全ワークスペースのテスト（core 50 + server 11） |
| `npm run build` | 全ワークスペースのビルド |
| `npm run dev:server` | API 開発サーバ（`http://localhost:3001`） |
| `npm run web -w @receino/app` | Expo Web（`http://localhost:8081`） |
| `npm run export:web -w @receino/app` | 本番Web を `app/dist/` へ静的書き出し |
| `bash scripts/dev-api.sh` | API サーバ（`.env` 読込・`0.0.0.0` 公開） |
| `bash scripts/phone.sh` | Expo Go 用（LAN IP / API 接続先を自動設定・ローカル expo 51 を使用） |
| `bash scripts/demo.sh` | 受け入れフローを一通り実演（作成→スキャン→保存→消費→PayWall→紹介→課金） |

## ディレクトリ構成

```
packages/core/  プラットフォーム非依存のコアロジック（クレジットエンジン・型・信頼度メーター）+ 単体テスト
server/         Fastify API。クレジット/紹介/課金の真実を保持（残高ガード・トランザクション境界）
app/            Expo (React Native) アプリ。iOS/Android/Web を単一コードで。receino.com は Web 書き出し
scripts/        demo.sh / dev-api.sh / phone.sh / web-preview.sh
docs/           DESIGN.md（実装設計）, screenshots/
```

## ローカルプレビュー

```bash
# 1) API サーバ（:3001）
npm run dev:server
curl http://localhost:3001/health

# 2) アプリ（Expo Web・:8081）
npm run web -w @receino/app
```

> アプリは既定で `http://localhost:3001` の API に接続。変更は `EXPO_PUBLIC_API_URL` で。

### スマホ実機でテストする

`localhost` はスマホから見えないため **PC の LAN IP** でアクセスする。アプリのAPI接続先は、Web で localhost 以外から開かれると自動でそのホストの `:3001` を叩く（`app/src/api.ts`）。

**方法A（推奨・最速）: 同じ Wi-Fi でブラウザ Web**
1. PC とスマホを同じ Wi-Fi に接続。
2. PC で `npm run dev:server`（:3001）と `npm run web -w @receino/app`（:8081）を起動（どちらも `0.0.0.0` 公開）。
3. スマホのブラウザで `http://<PCのLAN_IP>:8081` を開く（例 `http://192.168.11.4:8081`）→ 自動で `http://<PCのLAN_IP>:3001` の API に接続。
4. つながらない場合は macOS の「システム設定 → ネットワーク → ファイアウォール」で `node` の受信接続を許可。

> PC の IP 確認: `ipconfig getifaddr en0`

**方法B: Expo Go（ネイティブ挙動の確認）**
> ⚠️ ホームディレクトリで実行したり `npx expo start` を直接叩くと、npx が最新 `expo` を取得して Node 要件エラーになる。必ず下記スクリプト（ローカル expo 51 を使い LAN IP も自動設定）を使う。

```bash
# ターミナル1: APIサーバ
bash scripts/dev-api.sh
# ターミナル2: アプリ（LAN IP と API 接続先を自動設定）
bash scripts/phone.sh
```
表示された QR を Expo Go（Android）/ カメラ（iOS）で読み取る。別ネットワークなら `cd app && npx expo start --tunnel`。

## 本物のAI解析（Google Gemini）

レシート実画像を Google Gemini（マルチモーダル）で文字認識・構造化（品目・カテゴリ・金額）まで1コールで行う（SSOT §5.1）。

1. [Google AI Studio](https://aistudio.google.com/apikey) で `AIza...` キーを発行。
2. `.env` に `GEMINI_API_KEY=AIza...` を記入。
3. API サーバを再起動（`bash scripts/dev-api.sh`）。起動ログに `[ocr] Google Gemini を使用` が出れば有効。
4. アプリの「レシートを撮る」→ カメラ/ライブラリで実レシートを解析。
   - キー未設定時は自動でモックOCR（固定サンプル）にフォールバック。
   - 「サンプルで試す」はキーの有無に関わらず固定サンプルで動作確認できる。

## デプロイ手順

- **Web（receino.com）**: `npm run export:web -w @receino/app` で `app/dist/` に静的ファイルを生成し、任意の静的ホスティング（Cloud Storage + CDN 等）へデプロイ。
- **ネイティブ（iOS/Android）**: 同じ `app/` から Expo でビルド。
- 公開URL: https://receino.com（公開予定）

## 実装状況（SSOT §10 受け入れ基準）

- [x] 初回起動で signup +5
- [x] スキャン→解析→修正→保存、保存成功時のみ1枚消費
- [x] 消費優先順位 weekly→signup→referral
- [x] 週切替で weekly +1 / 前週分失効（ユーザーTZ 月曜0:00起算）
- [x] アカウント登録で週次付与が有効化
- [x] 紹介成立で双方向+5、紹介者は生涯15枚で打ち止め
- [x] 残高0で PayWall ガード・OCR 未呼び出し
- [x] 信頼度メーター（枚数連動・「試算」注記・4段階ガイド）
- [x] カテゴリ別分析は無料ブラー / プレミアム解除
- [x] トライアル開始/解約（モック課金。本番は RevenueCat に差し替え）
- [x] 残高・消費・失効・紹介の判定はすべてサーバ側
- [x] オンボーディング（価値実証型ファネル＋世帯人数の取得）。完了で実スキャンへ誘導・以降スキップ
- [x] 紹介の埋め込み導線（保存直後の「友達に+5枚」）＋招待リンク `?ref=CODE` で登録時に自動成立

### 紹介リンクの動作確認（ローカル）
1. 通常ウィンドウ（ユーザーA）で「友達紹介」を開き紹介コードを控える（または招待リンクをコピー）。
2. シークレットウィンドウ（新規ユーザーB）で `http://localhost:8081/?ref=<Aのコード>` を開く。
3. オンボーディングを完走（＝アカウント登録）すると、被紹介者Bと紹介者Aの双方に +5枚。
   自己紹介・二重適用・無効コードはサーバが拒否。紹介者は生涯15枚で打ち止め。

## 未決事項の確定（§9）

- 週起点 = **月曜0:00 / ユーザーTZ**（config 化済み・`packages/core/src/week.ts`）
- 紹介成立 = **被紹介者のアカウント登録完了**時点
- トライアル方式・OCRモデル構成・課金は service の抽象（`server/src/services/`）で差し替え可能

## AI 開発メモ

- このリポジトリは **Claude Code** で開発。
- リポジトリ固有の作法は [`.github/AGENTS.md`](./.github/AGENTS.md)（未整備の場合は追加予定）。
- 中央マニュアル: https://github.com/165cm/portfolio/tree/main/docs/standards
- 注意点（ハマりどころ）:
  - `packages/core` 変更後は `dist` を再ビルドし、API(:3001) と Metro(:8081) を再起動する（実行時は dist を参照）。
  - Metro は CI モードで watch 無効。変更反映には Metro の再起動が必要。

## ライセンス

README と同じ。
