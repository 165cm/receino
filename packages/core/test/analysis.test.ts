// packages/core/test/analysis.test.ts
import { describe, it, expect } from 'vitest';
import { computeAnalysis, normalizeItemName, bayesianAnnualSpend } from '../src/analysis.js';
import type { Receipt } from '../src/types.js';

function receipt(date: string, items: [string, number, any][]): Receipt {
  return {
    id: Math.random().toString(36),
    user_id: 'u',
    store: 'S',
    date,
    total: items.reduce((s, [, a]) => s + a, 0),
    items: items.map(([name, amount, category]) => ({ name, amount, category })),
    created_at: date,
  };
}

describe('normalizeItemName', () => {
  it('サイズ/括弧を除去してグルーピングキー化', () => {
    expect(normalizeItemName('牛乳 1L')).toBe('牛乳');
    expect(normalizeItemName('とりむね肉（国産）')).toBe('とりむね肉');
  });
});

describe('computeAnalysis', () => {
  const data: Receipt[] = [
    receipt('2026-05-10', [['牛乳 1L', 200, '飲料'], ['ポテトチップス', 150, 'お菓子・嗜好品']]),
    receipt('2026-06-10', [['牛乳 1L', 180, '飲料'], ['ラーメン', 800, '外食']]),
  ];

  it('合計・件数・観測月数・年換算', () => {
    const a = computeAnalysis(data);
    expect(a.period_total).toBe(1330);
    expect(a.receipt_count).toBe(2);
    expect(a.months_observed).toBe(2); // 2026-05, 2026-06
    expect(a.annual.projected_total).toBe(1330 * 6); // ×(12/2)
  });

  it('ポートフォリオ: 嗜好=菓子+外食', () => {
    const a = computeAnalysis(data);
    expect(a.portfolio.discretionary).toBe(150 + 800);
    expect(a.portfolio.necessity).toBe(200 + 180);
  });

  it('ランキング: 牛乳は2回でグルーピングされ最安180', () => {
    const a = computeAnalysis(data);
    const milk = a.ranking.find((r) => r.name === '牛乳');
    expect(milk?.count).toBe(2);
    expect(milk?.spend).toBe(380);
    expect(milk?.min_price).toBe(180);
    expect(milk?.avg_price).toBe(190);
  });

  it('ベイズ品目: 短期間に1回の品は年間頻度が線形(×12等)より小さく縮小される', () => {
    // 1ヶ月に1回だけ買った品目。線形なら年12回だが、事後は大きく縮小されるはず。
    const a = computeAnalysis([receipt('2026-06-01', [['プリン', 150, 'お菓子・嗜好品']])]);
    const pudding = a.ranking.find((r) => r.name === 'プリン')!;
    expect(pudding.annual_freq).toBeGreaterThan(0);
    expect(pudding.annual_freq).toBeLessThan(12); // 過大評価しない
    // 線形(150×12=1800)よりはるかに小さく縮小される
    expect(pudding.annual_spend).toBeLessThan(1800);
    expect(pudding.annual_spend).toBeGreaterThan(0);
  });

  it('ベイズ品目: よく買う品ほど年間頻度が高い', () => {
    const many = computeAnalysis([
      receipt('2026-06-01', [['卵', 200, '生鮮食品']]),
      receipt('2026-06-08', [['卵', 200, '生鮮食品']]),
      receipt('2026-06-15', [['卵', 200, '生鮮食品']]),
      receipt('2026-06-22', [['チョコ', 300, 'お菓子・嗜好品']]),
    ]);
    const egg = many.ranking.find((r) => r.name === '卵')!;
    const choco = many.ranking.find((r) => r.name === 'チョコ')!;
    expect(egg.annual_freq).toBeGreaterThan(choco.annual_freq);
  });

  it('ベイズ年間: データが増えるほど信用区間が狭まる', () => {
    const budget = 40000;
    const one = bayesianAnnualSpend([42000], { budget });
    const many = bayesianAnnualSpend([42000, 41000, 43000, 40000, 42000, 41000], { budget });
    const widthOne = one.high - one.low;
    const widthMany = many.high - many.low;
    expect(widthMany).toBeLessThan(widthOne); // データ多→区間が狭い
    expect(many.data_driven_ratio).toBeGreaterThan(one.data_driven_ratio);
    // 区間内に点推定が入る
    expect(many.estimate).toBeGreaterThanOrEqual(many.low);
    expect(many.estimate).toBeLessThanOrEqual(many.high);
  });

  it('ベイズ年間: データが無ければ事前（予算×12）に寄る', () => {
    const est = bayesianAnnualSpend([], { budget: 30000 });
    expect(est.estimate).toBe(360000); // 12 × 30000
    expect(est.data_driven_ratio).toBe(0);
  });

  it('目標ペース: 月予算との差', () => {
    const a = computeAnalysis(data, { monthlyBudget: 500 });
    expect(a.savings.target_monthly).toBe(500);
    // projected_monthly = 1330/2 = 665 → +165 超過
    expect(a.savings.over_budget_monthly).toBe(165);
  });
});
