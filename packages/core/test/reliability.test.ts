// packages/core/test/reliability.test.ts
import { describe, it, expect } from 'vitest';
import { reliability, reliabilityStageIndex, reliabilityProgress, RELIABILITY_STAGES } from '../src/reliability.js';
import { normalizeCategory } from '../src/categories.js';

describe('reliability(n)（§6）', () => {
  it('SSOT 記載のアンカー値に一致', () => {
    expect(reliability(1)).toBe(30);
    expect(reliability(5)).toBe(69);
    expect(reliability(10)).toBe(78);
    expect(reliability(25)).toBe(86);
    expect(reliability(50)).toBe(90);
  });
  it('n<=0 は 0、上限は99', () => {
    expect(reliability(0)).toBe(0);
    expect(reliability(-3)).toBe(0);
    expect(reliability(100000)).toBeLessThanOrEqual(99);
  });
});

describe('段階ガイド（§6）', () => {
  it('4段階・節目は昇順、信頼度は reliability(min) と一致', () => {
    expect(RELIABILITY_STAGES).toHaveLength(4);
    for (let i = 1; i < RELIABILITY_STAGES.length; i++) {
      expect(RELIABILITY_STAGES[i]!.minReceipts).toBeGreaterThan(RELIABILITY_STAGES[i - 1]!.minReceipts);
    }
    for (const s of RELIABILITY_STAGES) expect(s.reliability).toBe(reliability(s.minReceipts));
  });
  it('stageIndex: 記録なしは-1、節目で段階が上がる', () => {
    expect(reliabilityStageIndex(0)).toBe(-1);
    expect(reliabilityStageIndex(1)).toBe(0);
    expect(reliabilityStageIndex(4)).toBe(0);
    expect(reliabilityStageIndex(5)).toBe(1);
    expect(reliabilityStageIndex(15)).toBe(2);
    expect(reliabilityStageIndex(30)).toBe(3);
    expect(reliabilityStageIndex(999)).toBe(3); // 最終段階で頭打ち
  });
  it('progress: 次の節目まであと何枚', () => {
    const p = reliabilityProgress(3);
    expect(p.stage?.key).toBe('start');
    expect(p.nextStage?.key).toBe('seen');
    expect(p.toNext).toBe(2); // 5枚まであと2
    const last = reliabilityProgress(40);
    expect(last.nextStage).toBeNull();
    expect(last.toNext).toBe(0);
    const none = reliabilityProgress(0);
    expect(none.stageIndex).toBe(-1);
    expect(none.nextStage?.key).toBe('start'); // 最初の1枚が次の目標
  });
});

describe('normalizeCategory（§5.1）', () => {
  it('固定6分類はそのまま', () => {
    expect(normalizeCategory('生鮮食品')).toBe('生鮮食品');
    expect(normalizeCategory('外食')).toBe('外食');
  });
  it('範囲外・空・null は 調味料・その他 にフォールバック', () => {
    expect(normalizeCategory('日用品')).toBe('調味料・その他');
    expect(normalizeCategory('')).toBe('調味料・その他');
    expect(normalizeCategory(null)).toBe('調味料・その他');
    expect(normalizeCategory(undefined)).toBe('調味料・その他');
  });
});
