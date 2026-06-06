// packages/core/src/reliability.ts
// 統計的信頼度メーター。SSOT §6。
// 係数(70)・無料到達上限(93)はプレースホルダ。実データで較正する。

export const RELIABILITY_COEFF = 70; // 較正対象
export const FREE_REACH_CAP = 93; // 無料で到達できる目安（薄く表示する上限）

/**
 * 枚数 n からの信頼度スコア（%）。SSOT §6。
 * reliability(n) = min(99, round(100 - 70/sqrt(n)))
 * n<=0 は 0 を返す。
 */
export function reliability(n: number): number {
  if (n <= 0) return 0;
  return Math.min(99, Math.round(100 - RELIABILITY_COEFF / Math.sqrt(n)));
}

/** UI 注記（優良誤認回避・必須表示）。SSOT §6。 */
export const RELIABILITY_DISCLAIMER =
  '枚数からの試算（誤差は概ね1/√枚数で縮小）';
