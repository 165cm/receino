// packages/core/src/analysis.ts
// 食費分析エンジン（純関数）。SSOT §3.2 分析。
// 総合分析（全期間）/詳細分析（月）共通。採用アイデア:
//  ①年間効きランキング（頻度×金額）②必需vs嗜好ポートフォリオ ③マイ最安値/置き換え ④節約余地+目標ペース。
// ※ 年間推定は現状シンプルな線形射影（観測月数で年換算）。将来ベイズ推定に差し替え予定。

import type { Category } from './categories.js';
import type { Receipt } from './types.js';
import { grainKey, normalizeKey, typicalAnnual, TYPICAL_ANNUAL_DEFAULT, type Grain } from './taxonomy.js';
import { householdScale } from './household.js';

/** 嗜好/贅沢とみなすカテゴリ（それ以外を必需とする）。ヒューリスティック。 */
export const DISCRETIONARY_CATEGORIES: Category[] = ['お菓子・嗜好品', '外食'];

export interface RankingItem {
  name: string;
  category: Category;
  count: number; // 観測購入回数（頻度）
  spend: number; // 期間内の観測支出
  avg_price: number; // 観測平均単価
  min_price: number; // マイ最安値
  // --- ベイズ事後推定 ---
  annual_freq: number; // 想定年間購入回数（Gamma–Poisson事後）
  est_price: number; // 想定単価（カテゴリ平均へ縮小したNormal事後）
  annual_spend: number; // 年間支出見込み = annual_freq × est_price
  annual_saving_10pct: number; // 単価10%減で年間節約見込み
  annual_saving_to_min: number; // 常に最安で買えた場合の年間節約見込み
}

// 品目ベイズの事前パラメータ
const FREQ_PRIOR_A = 1; // 品目(小分類)の弱情報事前: 年1回程度（実購入回数で素直に推定）
const FREQ_PRIOR_B = 1; // Gamma レート（年単位）
const PRICE_PRIOR_STRENGTH = 1; // 単価をカテゴリ平均へ縮小する擬似観測数
// 大分類/中分類は「一般的な年間購入数」を情報事前に。事前の重み(年)。小さいほどデータで速く補正。
const TAXO_PRIOR_YEARS = 0.5;

export interface AnalysisResult {
  period_total: number;
  receipt_count: number;
  item_count: number;
  months_observed: number;
  by_category: { category: string; amount: number; pct: number }[];
  composition: { name: string; spend: number; pct: number }[]; // 選択粒度での支出構成（全項目・降順）
  groups: RankingItem[]; // 選択粒度の全グループ（spend=実績/annual_spend=見込み を両方保持。クライアントで指標切替）
  portfolio: { necessity: number; discretionary: number; necessity_pct: number; discretionary_pct: number };
  ranking: RankingItem[];
  annual: AnnualEstimate;
  savings: {
    projected_monthly: number; // 月平均支出
    discretionary_monthly: number; // 月平均の嗜好支出
    headroom_monthly: number; // 節約余地（月・目安）
    target_monthly: number | null; // 目標（月予算）
    over_budget_monthly: number | null; // 目標との差（+超過/-余裕）
  };
}

/** 品目名の正規化（サイズ・数量・括弧書きを除去してグルーピング）。 */
export function normalizeItemName(s: string): string {
  const cleaned = s
    .replace(/[（(].*?[)）]/g, '')
    .replace(/\d+(\.\d+)?\s*(g|kg|ml|l|個|本|枚|パック|袋|ｇ|ｋｇ|ｍｌ|ｌ)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || s.trim();
}

const round = (n: number) => Math.round(n);

export interface AnnualEstimate {
  projected_total: number; // 参考: 単純な線形年換算（観測月数→12ヶ月）
  estimate: number; // ベイズ事後平均 × 12（年間見込み）
  low: number; // 95%信用区間 下限
  high: number; // 95%信用区間 上限
  monthly_mean: number; // 事後の月平均
  prior_mean: number; // 事前の月平均（予算 or 既定）
  months_observed: number;
  data_driven_ratio: number; // 0..1。推定がデータにどれだけ依存しているか（1=ほぼデータ、0=ほぼ事前）
}

/**
 * 年間食費のベイズ推定（Normal–Normal 共役）。SSOT §6 の「データが増えるほど確度が上がる」を支出額に適用。
 * 月次総額 x_i を Normal(μ, σ²) とみなし、μ に事前 Normal(m0, s0²) を置く。
 *  - 予算があれば m0=予算, s0=0.5*予算（±50%の事前）。無ければ弱情報事前（データ平均中心・広め）。
 *  - σ は月次のばらつき（n≥2は標本SD、n<2は0.5*平均で「1ヶ月では不確実」を表現）。
 * 事後: postMean=(m0/s0² + n·x̄/σ²)/(1/s0² + n/σ²), 年間=12·postMean, 区間=12·(postMean±1.96·√postVar)。
 */
export function bayesianAnnualSpend(monthlyTotals: number[], opts: { budget?: number | null } = {}): AnnualEstimate {
  const n = monthlyTotals.length;
  const mean = n ? monthlyTotals.reduce((s, v) => s + v, 0) / n : 0;

  // 事前
  const budget = opts.budget && opts.budget > 0 ? opts.budget : null;
  const m0 = budget ?? (n ? mean : 30000); // データも予算も無ければ全国的な目安として3万円/月
  const s0 = budget ? 0.5 * budget : Math.max(m0, 10000); // 予算ありは±50%、無しは広め(±100%)

  // 観測のばらつき σ
  let sd: number;
  if (n >= 2) {
    const v = monthlyTotals.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
    sd = Math.sqrt(v);
    if (sd < 0.1 * mean) sd = 0.1 * mean; // 偶然の一致で過信しない下限
  } else {
    sd = 0.5 * Math.max(mean, 1); // 1ヶ月分は不確実
  }

  const prec0 = 1 / (s0 * s0);
  const precData = n > 0 ? n / (sd * sd) : 0;
  const postPrec = prec0 + precData;
  const postMean = (m0 * prec0 + mean * precData) / postPrec;
  const postSd = Math.sqrt(1 / postPrec);

  const estimate = round(12 * postMean);
  const low = Math.max(0, round(12 * (postMean - 1.96 * postSd)));
  const high = round(12 * (postMean + 1.96 * postSd));

  return {
    projected_total: 0, // computeAnalysis 側で線形値を埋める
    estimate,
    low,
    high,
    monthly_mean: round(postMean),
    prior_mean: round(m0),
    months_observed: n,
    data_driven_ratio: postPrec > 0 ? Math.round((precData / postPrec) * 100) / 100 : 0,
  };
}

export function computeAnalysis(
  receipts: Receipt[],
  opts: { monthlyBudget?: number | null; grain?: Grain; householdUnits?: number | null } = {},
): AnalysisResult {
  const grain: Grain = opts.grain ?? 'item';
  // 世帯規模で年間頻度の事前を調整（人数が多いほど「一般的な購入回数」も増える）。未設定なら1.0。
  const hScale = householdScale(opts.householdUnits);
  const periodTotal = receipts.reduce((s, r) => s + r.total, 0);
  const receiptCount = receipts.length;

  // 観測月数（年換算の係数に使用）
  const monthTotals = new Map<string, number>();
  for (const r of receipts) {
    const key = (r.date || '').slice(0, 7);
    if (key) monthTotals.set(key, (monthTotals.get(key) ?? 0) + r.total);
  }
  const monthsObserved = Math.max(1, monthTotals.size);
  const annualFactor = 12 / monthsObserved;

  // カテゴリ別 + ポートフォリオ + 品目集計
  const byCat: Record<string, number> = {};
  const catCount: Record<string, number> = {}; // カテゴリ別の品目点数（単価事前用）
  let itemCount = 0;
  let discretionary = 0;
  const groups = new Map<string, { name: string; category: Category; count: number; spend: number; prices: number[] }>();

  for (const r of receipts) {
    for (const it of r.items) {
      itemCount += 1;
      byCat[it.category] = (byCat[it.category] ?? 0) + it.amount;
      catCount[it.category] = (catCount[it.category] ?? 0) + 1;
      if (DISCRETIONARY_CATEGORIES.includes(it.category)) discretionary += it.amount;
      // 粒度に応じたグルーピングキー/表示名
      // item粒度は normalizeKey で表記ゆれを吸収してまとめ、表示は綺麗な正式名にする。
      let key: string;
      let displayName: string;
      if (grain === 'item') {
        const base = it.canonical_name?.trim() || it.name;
        key = normalizeKey(base);
        displayName = it.canonical_name?.trim() || normalizeItemName(it.name) || it.name;
      } else {
        key = grainKey(it, grain);
        displayName = key;
      }
      const g = groups.get(key) ?? { name: displayName, category: it.category, count: 0, spend: 0, prices: [] };
      g.count += 1;
      g.spend += it.amount;
      if (it.amount > 0) g.prices.push(it.amount);
      groups.set(key, g);
    }
  }

  const by_category = Object.entries(byCat)
    .map(([category, amount]) => ({ category, amount, pct: periodTotal > 0 ? round((amount / periodTotal) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);

  const necessity = periodTotal - discretionary;
  const portfolio = {
    necessity,
    discretionary,
    necessity_pct: periodTotal > 0 ? round((necessity / periodTotal) * 100) : 0,
    discretionary_pct: periodTotal > 0 ? round((discretionary / periodTotal) * 100) : 0,
  };

  // 観測期間（年）。1ヶ月なら 1/12。年間頻度の事後推定に使用。
  const T = monthsObserved / 12;
  // カテゴリ平均単価（品目単価の事前=縮小先）
  const catAvgPrice: Record<string, number> = {};
  for (const c of Object.keys(byCat)) catAvgPrice[c] = catCount[c] ? byCat[c]! / catCount[c]! : 0;

  // 全グループを年間見込みでスコアリング（円グラフ・ランキングを同一指標で揃える）。
  const scored: RankingItem[] = [...groups.values()]
    .map((g) => {
      const avg = g.count ? round(g.spend / g.count) : 0;
      const min = g.prices.length ? Math.min(...g.prices) : avg;
      // 頻度: Gamma–Poisson 事後平均 = (a0 + 回数) / (b0 + 観測年数)。
      //  小分類(item): 弱情報事前（実購入回数ベース）。
      //  大/中分類: 「一般的な年間購入数」を中心にした情報事前 → 購入が増えるほど実績へ補正。
      let a0 = FREQ_PRIOR_A;
      let b0 = FREQ_PRIOR_B;
      if (grain !== 'item') {
        // 世帯規模で目安を補正（基準世帯=hScale 1.0）。データが増えれば実績へ補正される。
        const typ = (typicalAnnual(grain, g.name) ?? TYPICAL_ANNUAL_DEFAULT) * hScale;
        b0 = TAXO_PRIOR_YEARS;
        a0 = typ * TAXO_PRIOR_YEARS; // 事前平均 = a0/b0 = typ（年間typ回）
      }
      const annualFreqRaw = (a0 + g.count) / (b0 + T);
      // 単価: 品目粒度ではカテゴリ平均へ縮小（Normal事後）。粗い粒度では群平均をそのまま使う。
      const catAvg = grain === 'item' ? (catAvgPrice[g.category] || avg) : avg;
      const estPrice = round((PRICE_PRIOR_STRENGTH * catAvg + g.count * avg) / (PRICE_PRIOR_STRENGTH + g.count));
      const annualSpend = round(annualFreqRaw * estPrice);
      return {
        name: g.name,
        category: g.category,
        count: g.count,
        spend: g.spend,
        avg_price: avg,
        min_price: min,
        annual_freq: Math.round(annualFreqRaw * 10) / 10,
        est_price: estPrice,
        annual_spend: annualSpend,
        annual_saving_10pct: round(annualSpend * 0.1),
        annual_saving_to_min: round(Math.max(0, avg - min) * annualFreqRaw),
      };
    })
    .sort((a, b) => b.annual_spend - a.annual_spend);

  const ranking = scored.slice(0, 15);
  // 円グラフ構成（ランキングと同一指標＝年間見込み支出のシェア）。
  const totalAnnualByGroup = scored.reduce((s, x) => s + x.annual_spend, 0);
  const composition = scored.map((s) => ({
    name: s.name,
    spend: s.annual_spend,
    pct: totalAnnualByGroup > 0 ? round((s.annual_spend / totalAnnualByGroup) * 100) : 0,
  }));

  const projectedMonthly = round(periodTotal / monthsObserved);
  const discretionaryMonthly = round(discretionary / monthsObserved);
  const target = opts.monthlyBudget ?? null;

  // ベイズ年間推定（事前=月予算）。
  const annual = bayesianAnnualSpend([...monthTotals.values()], { budget: target });
  annual.projected_total = round(periodTotal * annualFactor); // 参考の線形値も併記

  return {
    period_total: periodTotal,
    receipt_count: receiptCount,
    item_count: itemCount,
    months_observed: monthsObserved,
    by_category,
    composition,
    groups: scored.slice(0, 60),
    portfolio,
    ranking,
    annual,
    savings: {
      projected_monthly: projectedMonthly,
      discretionary_monthly: discretionaryMonthly,
      headroom_monthly: round(discretionaryMonthly * 0.3), // 嗜好の3割を見直し余地の目安
      target_monthly: target,
      over_budget_monthly: target != null ? projectedMonthly - target : null,
    },
  };
}
