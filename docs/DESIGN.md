// docs/DESIGN.md
# レシ活（Reshikatsu）設計書（実装着手前のアーキテクチャ）

> 親仕様（SSOT）= ルートの開発仕様書。本書はそれを実装可能な構造へ落とす設計レイヤ。
> 本書はコードを含まない。実装は本設計の合意後に着手する。
> 最終更新: 2026-06-03

---

## 0. 本セッションで確定した前提

| 項目 | 決定 | 根拠 |
|---|---|---|
| 初手 | **設計のみ**（ディレクトリ/モジュール/テスト方針） | 着手前に構造を固める |
| スタック | **React Native（Expo）+ Node サーバ** | クレジット/紹介/課金の真実はサーバ側（SSOT §2, §4） |
| §9-1 週の起点 | **月曜 0:00 / ユーザーTZ 起算** | SSOT デフォルト案。config 化して将来変更可 |
| §9-2 紹介成立 | **被紹介者の「アカウント登録完了」時点** | SSOT デフォルト案。不正対策は将来強化（後述 §6.4） |

未確定のまま残す項目（実装に影響が小さい / 後段で決める）:
§9-3 トライアル方式・§9-4 OCRモデル構成・§9-5 オフライン・§9-6 移行・§9-7 買い切り。
→ いずれも「設定/差し替え可能」な形でインターフェースだけ用意し、本体ロジックを汚さない。

---

## 1. 全体アーキテクチャ

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│  React Native (Expo)     │  HTTPS │  Node サーバ (Fastify)        │
│  app/                    │ ─────▶ │  server/                      │
│  ・UI / 画面遷移          │        │  ・API (§5.3)                 │
│  ・表示キャッシュのみ      │        │  ・クレジット真実 / 紹介 / 課金 │
│  ・残高は GET /credits    │ ◀───── │  ・DB (Postgres 想定)         │
└─────────────────────────┘  JSON   └──────────────┬───────────────┘
              │                                     │
              └──────────── packages/core ──────────┘
                 （プラットフォーム非依存の純ロジック）
                 ・クレジットエンジン（純関数）
                 ・型定義 / カテゴリ正規化 / 信頼度メーター式
                 app と server の両方が import する
```

**設計原則**
- クレジットの増減・失効・上限・紹介の判定は **`packages/core` の純関数**に集約し、**サーバが唯一の呼び出し主体**。アプリは結果を表示するだけ（SSOT §4 冒頭・§5.3 末尾）。
- 純関数は「現在時刻」「TZ」を**引数で受け取る**（`Date.now()` を内部で呼ばない）。→ テストで時刻を完全制御できる。
- DB アクセスと純ロジックを分離（純ロジックは I/O を持たない）。

---

## 2. モノレポ構成

```
TabeRec/
├─ docs/
│  └─ DESIGN.md                    ← 本書
├─ package.json                    ← workspaces 定義
├─ tsconfig.base.json
│
├─ packages/
│  └─ core/                        ★最重要・最初に固める（SSOT §11-1）
│     ├─ src/
│     │  ├─ types.ts               User/CreditBucket/Receipt/Referral 型（§5.2）
│     │  ├─ categories.ts          固定6分類・範囲外→「調味料・その他」フォールバック
│     │  ├─ week.ts                weekKey(now, tz) → "2026-W23"（月曜0:00起算）
│     │  ├─ credit-engine.ts       付与/消費/失効/紹介の純関数（§4 全文）
│     │  ├─ reliability.ts         信頼度メーター式（§6）
│     │  └─ index.ts
│     └─ test/
│        ├─ credit-engine.test.ts  ★単体テスト最重要（受け入れ基準 §10）
│        ├─ week.test.ts
│        └─ reliability.test.ts
│
├─ server/
│  ├─ src/
│  │  ├─ app.ts                    Fastify 起動
│  │  ├─ routes/                   §5.3 のエンドポイント
│  │  │  ├─ scan.ts                POST /scan（残高チェック→解析→ドラフト返却・未消費）
│  │  │  ├─ receipts.ts            POST /receipts（確定保存＝ここで1枚消費）/ GET /receipts
│  │  │  ├─ credits.ts             GET /credits（バケット内訳）
│  │  │  ├─ referrals.ts           POST /referrals/claim
│  │  │  ├─ me.ts                  GET /me（プラン/トライアル）
│  │  │  └─ subscribe.ts           POST /subscribe（RevenueCat 連携）
│  │  ├─ services/
│  │  │  ├─ credit-service.ts      core エンジン＋DBトランザクション境界
│  │  │  ├─ ocr-service.ts         解析プロバイダの抽象（§9-4 差し替え点）
│  │  │  └─ billing-service.ts     RevenueCat 抽象（§9-3 差し替え点）
│  │  ├─ db/                       マイグレーション/リポジトリ
│  │  └─ middleware/               認証・残高ガード（§4.6）
│  └─ test/
│     └─ *.integration.test.ts
│
└─ app/                            React Native (Expo)
   ├─ app/                         画面（§3）
   │  ├─ onboarding/               §3.1 ステップ1〜8
   │  ├─ home.tsx                  今月合計/枚数/クレジット残高
   │  ├─ scan.tsx                  撮影→解析→確認修正カード→保存
   │  ├─ records.tsx               記録一覧
   │  ├─ analysis.tsx              カテゴリ別分析（無料ブラー/プレミアム解除）
   │  ├─ referral.tsx              紹介
   │  ├─ paywall.tsx               枯渇時/機能タップ時/オンボ最終
   │  └─ settings.tsx              プラン状態・1タップ解約導線
   ├─ src/
   │  ├─ api/                      サーバ呼び出しクライアント
   │  ├─ components/               ReliabilityMeter / CreditBadge / ReceiptCard 等
   │  └─ state/                    表示キャッシュ（真実はサーバ）
   └─ assets/
      └─ sample-receipt.*          オンボのサンプルレシート体験用
```

---

## 3. クレジットエンジン設計（`packages/core/credit-engine.ts`）★中核

### 3.1 状態（バケット）
SSOT §5.2 の `CreditBucket` に一致。**合算1値で持たず、バケット別に残数を保持**（失効・上限判定のため）。

```
CreditBucket {
  signup_remaining            // 0 or 正（初回+5の残, 失効なし）
  weekly_remaining            // 0 or 1（今週分, 週末失効）
  weekly_week_key             // "2026-W23"。週切替検知用
  referral_remaining          // 付与済み紹介クレジットの残（0..）
  referral_lifetime_granted   // 生涯付与累計（上限15判定）
}
```

### 3.2 純関数 API（すべて I/O なし・新しい状態を返す）

| 関数 | 役割 | SSOT |
|---|---|---|
| `grantSignupBonus(b)` | `signup_remaining += 5`（呼び出し側で「1回のみ」を保証） | §4.1 |
| `ensureWeeklyGrant(b, now, tz)` | `weekKey(now,tz)` が `weekly_week_key` と異なれば、前週分を失効(0)→`weekly_remaining=1`・キー更新。同一週なら何もしない | §4.3 |
| `consumeCredit(b)` | 優先順位 `weekly → signup → referral` で1枚減算。全0なら消費不可を示す結果を返す | §4.2 |
| `grantReferral(b)` | `referral_lifetime_granted < 15` の範囲で +5（15超過分は付与しない＝打ち止め） | §4.4 |
| `computeBalance(b)` | `signup_remaining + weekly_remaining + referral_remaining` | §4.5 |

**重要な不変条件（テストで保証）**
- `ensureWeeklyGrant` は**冪等**：同一週に複数回呼んでも残高は増えない（週切替時のみ加算）。
- `consumeCredit` の優先順位は厳格に `weekly→signup→referral`（失効が早い順）。
- `grantReferral` は `referral_lifetime_granted` が 15 に達したら以降の付与を 0 に（コード自体は機能してよい＝呼び出しは成功扱い、付与0）。
- 残高 0 のとき `consumeCredit` は状態を変えず「不可」を返す（§4.6 のガードはこの結果で PayWall 分岐）。

### 3.3 週キー（`packages/core/week.ts`）
- `weekKey(now: Date, tz: string): string` — ユーザーTZで**月曜0:00**を週境界とし `"YYYY-Www"` を返す。
- 月曜起算のため ISO 8601 週番号に近いが、年跨ぎの扱い（第1週の定義）はテストで固定する。
- 失効の発火点はリクエスト到来時の遅延評価（`ensureWeeklyGrant` を残高参照・消費の前に必ず通す）＝バッチcron不要でも整合する設計。cron 併用も可。

### 3.4 サーバでのトランザクション境界（`server/services/credit-service.ts`）
- 「残高読込 → `ensureWeeklyGrant` → `consumeCredit` → 永続化」を**単一DBトランザクション**で実行（同時スキャンの二重消費防止／行ロック）。
- 純関数は core に、ロック/永続化は service に。

---

## 4. 解析フローと残高ガード（SSOT §4.6 / §5.1）

```
POST /scan
  1. 認証
  2. ensureWeeklyGrant（週切替反映）
  3. computeBalance == 0 → 402相当 + PayWall フラグ返却、★OCR呼び出しは行わない（APIコスト防止）
  4. balance>0 → ocr-service で解析 → §5.1 のJSONドラフトを返す（★ここでは消費しない）
POST /receipts
  5. ドラフト確定保存（トランザクション内で consumeCredit → 成功時のみ1枚消費・Receipt永続化）
     解析失敗/キャンセルは /receipts を呼ばない＝消費されない（§4.2）
```
- OCR出力の `category` は `categories.ts` で固定6分類に正規化（範囲外→「調味料・その他」）。
- `ocr-service` は §9-4 を吸収する抽象：MVP第一段=単一モデル、将来=画像/テキストでモデル分離に差し替え可能なインターフェース。

---

## 5. 信頼度メーター（`packages/core/reliability.ts` / SSOT §6）
- `reliability(n) = min(99, round(100 - 70/sqrt(n)))`（係数70・上限93はプレースホルダ、実データで較正）。
- UIは現在値＋無料到達上限（薄く）を表示し差分をロック表示。
- **「枚数からの試算（誤差は概ね1/√枚数で縮小）」注記を必須**（優良誤認回避・受け入れ基準）。

---

## 6. 各画面と機能のマッピング（SSOT §3）
- オンボ完了時にスキャン済みレシートを本編保存（記録ゼロ回避）。完了フラグで2回目以降スキップ。
- カテゴリ別分析：無料=ブラー、プレミアム=解除。
- PayWall 表示：①残高0 ②分析タップ ③オンボ最終。
- 設定：1タップ解約導線・課金2日前通知。ダークパターン不採用（§7）。
- 紹介（§6.4 = SSOT §4.4）：登録ユーザーに1コード。被紹介者の登録完了で双方向+5。紹介者は生涯15で打ち止め。自己紹介/多重端末の検知強度は §9-2 の将来課題として `referrals/claim` 内にフック点だけ用意。

---

## 7. テスト方針

| レイヤ | 対象 | ツール | 重点 |
|---|---|---|---|
| 単体（最優先） | `packages/core` 全純関数 | vitest | クレジットの付与/消費順/週次失効/紹介上限。時刻はテストで固定し週切替を再現 |
| 統合 | server routes + DB | vitest + テストDB | 残高ガードでOCR未呼び出し、二重消費防止（並行リクエスト）、トランザクション |
| 受け入れ | SSOT §10 のチェックリスト | E2E（後段） | 各項目をテストIDで紐付け |

**core のテストで §10 を直接カバーする項目**
- 初回 `signup +5` / 消費が `weekly→signup→referral` / 週切替で `weekly` +1 & 前週失効 / 紹介双方向+5 & 生涯15打ち止め / 残高0で消費不可（→ガード分岐）。

---

## 8. 実装ロードマップ（合意後・SSOT §11 準拠）
1. **`packages/core`**：型・週キー・クレジットエンジン・信頼度式＋**単体テスト**（ここを完全に緑にする）
2. **server**：DBスキーマ＋ `credit-service` トランザクション＋ `/scan`・`/receipts`・`/credits` ＋残高ガード
3. **app**：スキャン→保存フロー＋信頼度メーター
4. オンボーディング（§3.1）
5. 紹介フロー（§4.4）
6. 課金/トライアル（RevenueCat）＋PayWall
7. 計測埋め込み（§8）

---

## 9. 差し替え点（未決事項を本体ロジックから隔離）
| 未決 | 隔離方法 |
|---|---|
| §9-3 トライアル方式（カード要否） | `billing-service` の設定フラグ。core/ロジックは非依存 |
| §9-4 OCR構成 | `ocr-service` インターフェース（単一→分離へ差し替え） |
| §9-5 オフライン | `/scan` はサーバ必須。オフライン時はUIで明示（残高判定をローカル偽装しない） |
| §9-6 移行 | MVPは新規前提。ローカル参考実装からの移行は対象外 |
| §9-7 買い切り | `billing-service` に将来追加。スキーマに余地のみ残す |
| §9-1 週起点 / §9-2 紹介成立 | config 化（既定=月曜0:00 / 登録完了）。`week.ts` と `referrals/claim` に集約 |
