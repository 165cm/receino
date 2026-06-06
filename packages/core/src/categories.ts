// packages/core/src/categories.ts
// 食費カテゴリ（固定6分類）。SSOT §1。

export const CATEGORIES = [
  '生鮮食品',
  '加工食品・惣菜',
  '飲料',
  'お菓子・嗜好品',
  '調味料・その他',
  '外食',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** 範囲外フォールバック先（SSOT §5.1）。 */
export const FALLBACK_CATEGORY: Category = '調味料・その他';

/**
 * OCR出力等の任意文字列を固定6分類へ正規化する。
 * 範囲外・空・undefined はすべて FALLBACK_CATEGORY に寄せる（SSOT §5.1）。
 */
export function normalizeCategory(input: string | null | undefined): Category {
  if (typeof input !== 'string') return FALLBACK_CATEGORY;
  const trimmed = input.trim();
  return (CATEGORIES as readonly string[]).includes(trimmed)
    ? (trimmed as Category)
    : FALLBACK_CATEGORY;
}
