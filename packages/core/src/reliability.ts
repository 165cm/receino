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

// ───────── 「正しい分析に何枚必要か」の段階ガイド（4段階）。SSOT §6。 ─────────
// 枚数の節目ごとに「到達した信頼度」と「何が信頼できるようになるか」を事例で示す。
// 信頼度は reliability(minReceipts) から導出（係数を変えても自動追従）。閾値はMVPの目安。
export interface ReliabilityStage {
  key: string;
  label: string; // 段階名
  minReceipts: number; // この段階に入る最小枚数
  reliability: number; // 到達時の信頼度（%）
  summary: string; // この段階でできること（事例）
}

export const RELIABILITY_STAGES: ReliabilityStage[] = [
  { key: 'start', label: '始めたばかり', minReceipts: 1, reliability: reliability(1), summary: 'ざっくりした傾向と全体像がつかめます' },
  { key: 'seen', label: '見えてきた', minReceipts: 5, reliability: reliability(5), summary: 'カテゴリ別の構成や“よく買う上位”が安定します' },
  { key: 'solid', label: 'しっかり', minReceipts: 15, reliability: reliability(15), summary: '月ごとの比較や必需/嗜好バランスが信頼できます' },
  { key: 'enough', label: '十分', minReceipts: 30, reliability: reliability(30), summary: '年間見込み・節約余地まで高い精度で読めます' },
];

/** 枚数 n が属する段階インデックス（0..）。記録なし(節目未満)は -1。 */
export function reliabilityStageIndex(n: number): number {
  if (n < RELIABILITY_STAGES[0]!.minReceipts) return -1;
  let idx = 0;
  for (let i = 0; i < RELIABILITY_STAGES.length; i++) {
    if (n >= RELIABILITY_STAGES[i]!.minReceipts) idx = i;
  }
  return idx;
}

export interface ReliabilityProgress {
  n: number;
  score: number; // 現在の信頼度%
  stageIndex: number; // -1 = まだ記録なし
  stage: ReliabilityStage | null; // 現在の段階
  nextStage: ReliabilityStage | null; // 次の段階（最終段階なら null）
  toNext: number; // 次の段階まであと何枚（次が無ければ 0）
}

/** 現在地（段階・次の節目まで何枚）をまとめて返す。UIの進捗表示用。 */
export function reliabilityProgress(n: number): ReliabilityProgress {
  const stageIndex = reliabilityStageIndex(n);
  const stage = stageIndex >= 0 ? RELIABILITY_STAGES[stageIndex]! : null;
  const nextStage = RELIABILITY_STAGES[stageIndex + 1] ?? null; // -1のときは先頭が「次」
  const toNext = nextStage ? Math.max(0, nextStage.minReceipts - n) : 0;
  return { n, score: reliability(n), stageIndex, stage, nextStage, toNext };
}
