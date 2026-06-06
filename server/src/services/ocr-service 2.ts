// server/src/services/ocr-service.ts
// レシート画像→構造化JSON の抽象。SSOT §5.1 / §9-4 の差し替え点。
// MVP第一段はモックプロバイダ。将来は画像/テキストでモデル分離した実装に差し替える。

import { normalizeCategory, type ReceiptItem } from '@taberec/core';

export interface OcrResult {
  store: string;
  date: string; // YYYY-MM-DD
  items: ReceiptItem[];
  total: number;
}

export interface OcrError {
  error: 'read_failed';
}

export interface OcrProvider {
  /** base64画像を解析。読取不能時は {error:'read_failed'} を返す。 */
  parse(imageBase64: string): Promise<OcrResult | OcrError>;
}

/**
 * モックOCR。ローカルプレビュー用。
 * - "" や "fail" を渡すと read_failed を返す（失敗パスの検証用）。
 * - それ以外はサンプルレシートを返す。category は固定6分類へ正規化。
 */
export class MockOcrProvider implements OcrProvider {
  async parse(imageBase64: string): Promise<OcrResult | OcrError> {
    if (!imageBase64 || imageBase64 === 'fail') {
      return { error: 'read_failed' };
    }
    const rawItems = [
      { name: 'とりむね肉', amount: 398, category: '生鮮食品' },
      { name: '牛乳 1L', amount: 218, category: '飲料' },
      { name: '冷凍餃子', amount: 268, category: '加工食品・惣菜' },
      { name: 'ポテトチップス', amount: 138, category: 'お菓子・嗜好品' },
      { name: '醤油', amount: 0, category: '不明カテゴリ' }, // 範囲外→フォールバック検証
    ];
    const items: ReceiptItem[] = rawItems.map((i) => ({
      name: i.name,
      amount: i.amount,
      category: normalizeCategory(i.category),
    }));
    const total = items.reduce((s, i) => s + i.amount, 0);
    return { store: 'スーパーたべれこ', date: '2026-06-03', items, total };
  }
}

export function isOcrError(r: OcrResult | OcrError): r is OcrError {
  return (r as OcrError).error === 'read_failed';
}
