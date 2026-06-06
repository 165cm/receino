# Receino（レシーノ）

> Scan. Know. Save. — 撮って、知って、節約する。

撮るだけ3秒、食費の正体がわかる家計簿。レシート撮影 → AIが品目・カテゴリ・金額を自動構造化 → 食費を見える化。

公開予定: **https://receino.com**

仕様の単一の真実(SSOT)はルートの開発仕様書、実装設計は [`docs/DESIGN.md`](docs/DESIGN.md)。

## 構成（モノレポ）

```
packages/core/  プラットフォーム非依存のコアロジック（クレジットエンジン・型・信頼度メーター）+ 単体テスト
server/         Fastify API。クレジット/紹介/課金の真実を保持（残高ガード・トランザクション境界）
app/            Expo (React Native) アプリ。iOS/Android/Web を単一コードで。receino.com は Web 書き出し
scripts/        demo.sh（受け入れフロー実演）, web-preview.sh
```

設計原則: **クレジットの付与・消費・失効・紹介の判定はすべてサーバが真実**。アプリは表示のみ（SSOT §4/§5.3）。

## 前提

- Node.js >= 20
- このリポジトリでは Node を `~/.local/node` に展開して使用。各シェルで `export PATH="$HOME/.local/node/bin:$PATH"` を通すこと。

## セットアップ

```bash
export PATH="$HOME/.local/node/bin:$PATH"
npm install
npm run build -w @receino/core   # core を dist へビルド（app/server はこれを参照）
```

## テスト

```bash
npm test                      # 全ワークスペース（core 21 + server 11）
npm run test -w @receino/core
npm run test -w @receino/server
```

## ローカルプレビュー

1) API サーバ（ポート3001）

```bash
npm run dev:server            # http://localhost:3001
curl http://localhost:3001/health
bash scripts/demo.sh          # 受け入れフローを一通り実演（作成→スキャン→保存→消費→PayWall→紹介→課金）
```

2) アプリ（Expo Web・ポート8081）

```bash
npm run web -w @receino/app   # http://localhost:8081 をブラウザで開く
```

> アプリは既定で `http://localhost:3001` の API に接続。変更は `EXPO_PUBLIC_API_URL` で。

## スマホ実機でテストする

`localhost` はスマホからは見えないため、**PCのLAN IP**でアクセスします。アプリのAPI接続先は
Web で localhost 以外から開かれると自動でそのホストの `:3001` を叩くよう実装済み（`src/api.ts`）。

### 方法A（推奨・最速）: 同じWi-FiでブラウザWeb
1. PCとスマホを**同じWi-Fi**に接続。
2. PCで API とWeb を起動（どちらも `0.0.0.0` 公開済み）:
   ```bash
   npm run dev:server                 # :3001
   npm run web -w @receino/app        # :8081
   ```
3. スマホのブラウザで **`http://<PCのLAN_IP>:8081`** を開く（例: `http://192.168.11.4:8081`）。
   → アプリは自動で `http://<PCのLAN_IP>:3001` のAPIに接続します。
4. つながらない場合は macOS の「システム設定 → ネットワーク → ファイアウォール」で
   `node` の受信接続を許可（初回はダイアログが出ることがあります）。

> PCのIP確認: `ipconfig getifaddr en0`

### 方法B: Expo Go（ネイティブの挙動を確認）
> ⚠️ よくある失敗: **ホームディレクトリで実行**したり `npx expo start` を直接叩くと、
> npx が最新の `expo@56` を取得して Node 要件エラーになります。必ず下記スクリプトを使ってください
> （リポジトリ内のローカル expo 51 を使い、LAN IP も自動設定します）。

1. スマホに **Expo Go** アプリをインストール（同一Wi-Fi）。
2. 2つのターミナルで:
   ```bash
   # ターミナル1: APIサーバ
   bash scripts/dev-api.sh
   # ターミナル2: アプリ（LAN IPとAPI接続先を自動設定）
   bash scripts/phone.sh
   ```
3. 表示されたQRコードを Expo Go（Android）/ カメラ（iOS）で読み取る。
   別ネットワークなら `cd app && npx expo start --tunnel`（APIは別途到達可能にする必要あり）。

## 本物のAI解析（Google Gemini）

レシートの実画像を Google Gemini（マルチモーダル）で文字認識・構造化します（SSOT §5.1）。
文字認識と「品目・カテゴリ・金額」の構造化を1コールで行います。

1. **APIキーを取得**: Google AI Studio → https://aistudio.google.com/apikey で発行（`AIza...`）。
2. `.env` を作成してキーを設定:
   ```bash
   cp .env.example .env
   open -e .env      # TextEditで開く。GEMINI_API_KEY=AIza... を記入
   ```
3. APIサーバを再起動（`bash scripts/dev-api.sh`）。起動ログに `[ocr] Google Gemini を使用` と出れば有効。
4. アプリの「レシートを撮る」→ **カメラ/ライブラリ**で実レシートを解析。
   - キー未設定時は自動でモックOCR（固定サンプル）にフォールバック。
   - 「サンプルで試す」はキーの有無に関わらず固定サンプルで動作確認できます。
   - 初回登録枠5枚を実レシートで使い切り、カテゴリ別分析（プレミアム）で精度・満足感を確認できます。

> モデルは既定 `gemini-2.0-flash`。`.env` の `GEMINI_MODEL` で変更可（`gemini-2.5-flash` 等）。
> 代替として Anthropic Claude も利用可（`ANTHROPIC_API_KEY`。Google 未設定時に使用）。

## receino.com への書き出し（本番Web）

```bash
npm run export:web -w @receino/app   # app/dist/ に静的ファイルを生成
# app/dist/ を任意の静的ホスティング（Cloud Storage + CDN 等）へデプロイ
```

ネイティブ（iOS/Android）は同じ `app/` から Expo でビルド。

## 実装状況（SSOT §10 受け入れ基準）

- [x] 初回起動で signup +5
- [x] スキャン→解析→修正→保存、保存成功時のみ1枚消費
- [x] 消費優先順位 weekly→signup→referral
- [x] 週切替で weekly +1 / 前週分失効（ユーザーTZ月曜0:00起算）
- [x] アカウント登録で週次付与が有効化
- [x] 紹介成立で双方向+5、紹介者は生涯15枚で打ち止め
- [x] 残高0でPayWallガード・OCR未呼び出し
- [x] 信頼度メーター（枚数連動・「試算」注記）
- [x] カテゴリ別分析は無料ブラー / プレミアム解除
- [x] トライアル開始/解約（モック課金。本番は RevenueCat に差し替え）
- [x] 残高・消費・失効・紹介の判定はすべてサーバ側
- [x] オンボーディング8ステップ（価値実証型ファネル）。完了でスキャン1件保存・登録・以降スキップ
- [x] 紹介の埋め込み導線（スキャン保存直後に「友達に+5枚あげる」）＋招待リンク `?ref=CODE` で登録時に自動成立

### 紹介リンクの動作確認（ローカル）
1. 通常ウィンドウ（ユーザーA）で「友達紹介」を開き、紹介コードを控える（または「招待リンクを送る」でコピー）。
2. シークレットウィンドウ（履歴/localStorageが空＝新規ユーザーB）で `http://localhost:8081/?ref=<Aのコード>` を開く。
3. オンボーディングを完走（＝アカウント登録）すると、被紹介者Bと紹介者Aの双方に +5枚。
   - 自己紹介・二重適用・無効コードはサーバが拒否。紹介者は生涯15枚で打ち止め。

## 未決事項の確定（§9）

- 週起点 = **月曜0:00 / ユーザーTZ**（config化済み・`packages/core/src/week.ts`）
- 紹介成立 = **被紹介者のアカウント登録完了**時点
- トライアル方式・OCRモデル構成・課金は service の抽象（`server/src/services/`）で差し替え可能
