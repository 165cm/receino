// server/src/services/ocr-service.ts
// レシート画像→構造化JSON の抽象。SSOT §5.1 / §9-4 の差し替え点。
// 既定の本物のAI解析は Google Gemini（マルチモーダル＝文字認識＋構造化を1コールで）。
//  - GoogleOcrProvider: Gemini Vision（GEMINI_API_KEY / GOOGLE_API_KEY）。
//  - ClaudeOcrProvider: Anthropic Claude Vision（ANTHROPIC_API_KEY）※任意の代替。
//  - MockOcrProvider:  サンプル/プレビュー用の固定レシート。
// プロバイダ選択は context.ts（Google → Claude → Mock の順）。

import Anthropic from '@anthropic-ai/sdk';
import { CATEGORIES, normalizeCategory, TAXONOMY, isValidL2, l1OfL2, inferL2, type ReceiptItem } from '@receino/core';

const TAXONOMY_TREE_TEXT = Object.entries(TAXONOMY)
  .map(([l1, l2s]) => `  ${l1}: ${l2s.join('・')}`)
  .join('\n');

export interface OcrResult {
  store: string;
  store_address?: string;
  store_phone?: string;
  date: string; // YYYY-MM-DD
  items: ReceiptItem[];
  total: number;
}
export interface OcrError {
  error: 'read_failed';
}
export interface OcrProvider {
  /** base64画像（データURL接頭辞は許容）を解析。読取不能/レシートでない時は read_failed。 */
  parse(imageBase64: string, mediaType?: string): Promise<OcrResult | OcrError>;
}
export function isOcrError(r: OcrResult | OcrError): r is OcrError {
  return (r as OcrError).error === 'read_failed';
}

// ───────── 共有: プロンプト・JSON抽出・整形 ─────────
const SYSTEM_PROMPT = `あなたは日本のスーパー/コンビニ等のレシート画像を構造化する抽出エンジンです。
画像を丁寧に読み取り、指定のJSONだけを返してください（説明やマークダウンは禁止、JSONのみ）。

【抽出ルール】
- store: 店名。チェーン名や店舗名（レシート上部に多い。例「業務スーパー ○○店」「西友 ○○」）。不明なら空文字。
- store_address: 店舗住所（レシート上部/下部に記載があれば。なければ空文字）。
- store_phone: 店舗電話番号（"TEL"等。なければ空文字）。ハイフン込みでよい。
- date: 購入日を西暦 "YYYY-MM-DD"。和暦や "26/05/31" 等も西暦に正規化。時刻は無視。不明なら空文字。
- items: 実際に購入した飲食料品の各行。
    name          : レシート表記のまま（略記/見切れOK。例「ＭＯギュウニュウ」）
    canonical_name: 略記/見切れを展開した一般的な正式名を推測（例「牛乳」「鶏むね肉」「からあげ(惣菜)」「ロールキャベツ」）
    amount        : その品目の支払金額(円, 整数)。税込価格があれば税込を優先。単価×数量なら小計額。
    category      : 下記6分類のいずれか
    l2            : 下の食品ツリーの「中分類」から最も近いものを1つ厳密に選ぶ（ツリーに無い語は使わない。迷えば その他）
- total : レシートの「合計」金額(円, 整数)。お預り/お釣りではなく請求合計。

【食品ツリー（l2は各行の右側の語から1つ選ぶ）】
${TAXONOMY_TREE_TEXT}

【略記→正式名→l2 の例（参考）】
  "ＭＯギュウニュウ" → canonical_name:"牛乳", l2:"牛乳"
  "ＴＲホウジュン2マキ" → canonical_name:"納豆", l2:"豆腐・納豆"
  "とりむね" → canonical_name:"鶏むね肉", l2:"鶏肉"
  "ﾌﾞﾀﾊﾞﾗ" → canonical_name:"豚バラ肉", l2:"豚肉"
  "ﾛｰﾙｷｬﾍﾞﾂ" → canonical_name:"ロールキャベツ", l2:"惣菜"
  "ｺﾏｷﾚ牛" → canonical_name:"牛こま切れ肉", l2:"牛肉"
  "ＣＯＫＥ500" → canonical_name:"コーラ", l2:"ジュース・炭酸"
  "ﾌﾟﾚﾐｱﾑﾓﾙﾂ" → canonical_name:"ビール", l2:"ビール・発泡酒"

【items に含めない行】
- 小計 / 合計 / 税抜対象 / 消費税 / お預り / お釣り / クレジット / ポイント / 釣銭
- 「値引」「割引」「まとめ買い値引」などの値引き行（マイナス金額の行）。
  値引きは品目として追加しない（金額の符号調整も不要。各品目は表示額のまま）。
- 点数・バーコード番号だけの行。

【カテゴリ】必ず次のいずれか: ${CATEGORIES.join(' / ')}。
  例: 肉・魚・野菜・卵→生鮮食品 / 惣菜・冷凍食品・パン・乳製品→加工食品・惣菜 /
      水・お茶・ジュース・酒→飲料 / 菓子・スナック・アイス→お菓子・嗜好品 /
      調味料・米・粉・日用品的な食材→調味料・その他 / 店内飲食・外食→外食。
  迷う場合は「調味料・その他」。

食品レシートでない、または読み取れない場合は
{"is_receipt": false, "store":"", "date":"", "items":[], "total":0} を返す。

出力スキーマ（このキー構成のJSONのみ）:
{"is_receipt": true, "store": "店名", "store_address": "住所", "store_phone": "03-0000-0000", "date": "YYYY-MM-DD", "items": [{"name":"ＭＯギュウニュウ","canonical_name":"牛乳","amount":218,"category":"飲料","l2":"牛乳"}], "total": 1234}`;

const USER_PROMPT = 'このレシートを抽出し、指定JSONのみを返してください。';

type Raw = {
  is_receipt?: boolean;
  store?: string;
  store_address?: string;
  store_phone?: string;
  date?: string;
  items?: { name?: string; canonical_name?: string; amount?: number | string; category?: string; l2?: string }[];
  total?: number | string;
};

/** サンプル/プレビュー判定（実画像base64は十分長い）。 */
function isSampleSentinel(image: string): boolean {
  return !image || image.length < 200 || image === 'fail' ||
    image === 'BASE64' || image.endsWith('SAMPLE');
}

/** データURL接頭辞があれば除去して生base64を返す。 */
function stripDataUrl(image: string): string {
  return image.includes(',') ? image.slice(image.indexOf(',') + 1) : image;
}

/** コードフェンス/前後テキストを除去してJSONを取り出す。 */
function extractJson(text: string): Raw | null {
  let t = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  t = t.slice(start, end + 1);
  try {
    return JSON.parse(t) as Raw;
  } catch {
    return null;
  }
}

function toInt(v: number | string | undefined): number {
  if (typeof v === 'number') return Math.round(v);
  if (typeof v === 'string') return Math.round(Number(v.replace(/[^0-9.-]/g, ''))) || 0;
  return 0;
}

/** 生JSON → OcrResult|OcrError へ正規化（カテゴリは固定6分類へ寄せる）。 */
function toResult(raw: Raw | null): OcrResult | OcrError {
  if (!raw || raw.is_receipt === false) return { error: 'read_failed' };
  const items: ReceiptItem[] = (raw.items ?? []).map((i) => {
    const canonical = String(i.canonical_name ?? '').trim() || undefined;
    const name = String(i.name ?? '').trim();
    // AIのl2を優先、無効/欠落なら辞書(inferL2)で補完。
    const l2 = isValidL2(i.l2) ? i.l2 : inferL2(canonical || name);
    return {
      name,
      amount: toInt(i.amount),
      category: normalizeCategory(i.category),
      canonical_name: canonical,
      l2,
      l1: l2 ? l1OfL2(l2) : undefined,
    };
  });
  const total = toInt(raw.total) || items.reduce((s, i) => s + i.amount, 0);
  return {
    store: String(raw.store ?? '').trim(),
    store_address: String(raw.store_address ?? '').trim() || undefined,
    store_phone: String(raw.store_phone ?? '').trim() || undefined,
    date: String(raw.date ?? '').trim(),
    items,
    total,
  };
}

// ───────────────────────── Mock ─────────────────────────
export class MockOcrProvider implements OcrProvider {
  async parse(imageBase64: string): Promise<OcrResult | OcrError> {
    if (imageBase64 === 'fail') return { error: 'read_failed' };
    const rawItems = [
      { name: 'とりむね肉', canonical: '鶏むね肉', amount: 398, category: '生鮮食品', l2: '鶏肉' },
      { name: 'ＭＯギュウニュウ', canonical: '牛乳', amount: 218, category: '飲料', l2: '牛乳' },
      { name: '冷凍餃子', canonical: '冷凍餃子', amount: 268, category: '加工食品・惣菜', l2: '冷凍食品' },
      { name: 'ポテトチップス', canonical: 'ポテトチップス', amount: 138, category: 'お菓子・嗜好品', l2: 'スナック菓子' },
      { name: '醤油', canonical: '醤油', amount: 0, category: '不明カテゴリ', l2: '調味料' },
    ];
    const items: ReceiptItem[] = rawItems.map((i) => ({
      name: i.name,
      amount: i.amount,
      category: normalizeCategory(i.category),
      canonical_name: i.canonical,
      l2: isValidL2(i.l2) ? i.l2 : undefined,
      l1: isValidL2(i.l2) ? l1OfL2(i.l2) : undefined,
    }));
    return { store: 'スーパーレシーノ', date: '2026-06-03', items, total: items.reduce((s, i) => s + i.amount, 0) };
  }
}

// ─────────────────── Google Gemini（既定） ───────────────────
export class GoogleOcrProvider implements OcrProvider {
  private apiKey: string;
  private model: string;
  private fallback = new MockOcrProvider();

  constructor(apiKey: string, model = process.env.GEMINI_MODEL || 'gemini-2.5-flash') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async parse(imageBase64: string, mediaType = 'image/jpeg'): Promise<OcrResult | OcrError> {
    if (isSampleSentinel(imageBase64)) return this.fallback.parse(imageBase64);
    const data = stripDataUrl(imageBase64);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        // 通信が停止しても固まらないよう40秒で打ち切る。
        signal: AbortSignal.timeout(40_000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              role: 'user',
              parts: [
                { inline_data: { mime_type: mediaType, data } },
                { text: USER_PROMPT },
              ],
            },
          ],
          // thinkingBudget:0 で 2.5系の内部思考を抑制し、レイテンシ/コストを削減。
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      });
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error(`[GoogleOcrProvider] HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return { error: 'read_failed' };
      }
      const json: any = await res.json();
      const text: string = (json?.candidates?.[0]?.content?.parts ?? [])
        .map((p: any) => p?.text ?? '')
        .join('')
        .trim();
      return toResult(extractJson(text));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[GoogleOcrProvider] parse failed:', (e as Error).message);
      return { error: 'read_failed' };
    }
  }
}

// ─────────────────── Claude Vision（代替・任意） ───────────────────
export class ClaudeOcrProvider implements OcrProvider {
  private client: Anthropic;
  private model: string;
  private fallback = new MockOcrProvider();

  constructor(apiKey: string, model = process.env.CLAUDE_MODEL || 'claude-opus-4-8') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async parse(imageBase64: string, mediaType = 'image/jpeg'): Promise<OcrResult | OcrError> {
    if (isSampleSentinel(imageBase64)) return this.fallback.parse(imageBase64);
    const data = stripDataUrl(imageBase64);
    try {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType as any, data } },
              { type: 'text', text: USER_PROMPT },
            ],
          },
        ],
      });
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      return toResult(extractJson(text));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[ClaudeOcrProvider] parse failed:', (e as Error).message);
      return { error: 'read_failed' };
    }
  }
}
