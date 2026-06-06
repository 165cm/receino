// app/src/onboarding.ts
// オンボーディングの選択肢・推定ロジック・完了フラグ（SSOT §3.1）。

import { storage } from './storage';

const ONBOARDED_KEY = 'receino.onboarded';
export function isOnboarded(): boolean {
  return storage.get(ONBOARDED_KEY) === '1';
}
export function setOnboarded(): void {
  storage.set(ONBOARDED_KEY, '1');
}

export interface Goal { key: string; label: string; emoji: string }
export const GOALS: Goal[] = [
  { key: 'reduce', label: '食費を減らす', emoji: '✂️' },
  { key: 'grasp', label: '食費を把握する', emoji: '🔍' },
  { key: 'automate', label: '記録を自動化する', emoji: '⚡' },
  { key: 'family', label: '家族で共有する', emoji: '👨‍👩‍👧' },
];

export interface BudgetRange { key: string; label: string; mid: number }
export const BUDGET_RANGES: BudgetRange[] = [
  { key: 'lt2', label: '〜2万円', mid: 15000 },
  { key: '2to4', label: '2〜4万円', mid: 30000 },
  { key: '4to6', label: '4〜6万円', mid: 50000 },
  { key: 'gt6', label: '6万円以上', mid: 70000 },
];

// 年間節約見込みの試算（控えめな改善率）。SSOT §3.1-7（必ず「試算」と明記）。
export const IMPROVEMENT_RATE = 0.08; // 8%（仮置き・実データで較正 §8）
export const PREMIUM_YEARLY = 500 * 12;

export function estimatedAnnualSaving(monthlyBudgetMid: number): number {
  return Math.round((monthlyBudgetMid * IMPROVEMENT_RATE * 12) / 100) * 100;
}
