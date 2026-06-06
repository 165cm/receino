// packages/core/test/taxonomy.test.ts
import { describe, it, expect } from 'vitest';
import { grainKey, isValidL2, l1OfL2, inferL2, normalizeKey } from '../src/taxonomy.js';
import { computeAnalysis } from '../src/analysis.js';
import type { Receipt } from '../src/types.js';

describe('taxonomy', () => {
  it('L2の検証とL1導出', () => {
    expect(isValidL2('鶏肉')).toBe(true);
    expect(isValidL2('存在しない')).toBe(false);
    expect(l1OfL2('鶏肉')).toBe('肉類');
    expect(l1OfL2('冷凍食品')).toBe('加工食品・惣菜');
  });

  it('inferL2: 辞書による推定（紛らわしい語の優先順）', () => {
    expect(inferL2('牛乳')).toBe('牛乳'); // 牛肉ではない
    expect(inferL2('ＭＯギュウニュウ')).toBe('牛乳');
    expect(inferL2('鶏むね肉')).toBe('鶏肉');
    expect(inferL2('豚バラ')).toBe('豚肉');
    expect(inferL2('牛こま切れ')).toBe('牛肉');
    expect(inferL2('ベーコン')).toBe('加工肉');
    expect(inferL2('絹豆腐')).toBe('豆腐・納豆');
    expect(inferL2('ポテトチップス')).toBe('スナック菓子');
    expect(inferL2('謎の文字列xyz')).toBeUndefined();
  });

  it('normalizeKey: 全角/カタカナ/サイズの表記ゆれを吸収', () => {
    expect(normalizeKey('ギュウニュウ')).toBe(normalizeKey('ぎゅうにゅう'));
    expect(normalizeKey('牛乳 1L')).toBe(normalizeKey('牛乳(1000ml)'));
    expect(normalizeKey('ＣＯＫＥ')).toBe(normalizeKey('coke'));
  });

  it('grainKey: 辞書フォールバックで既存データもL2分類', () => {
    // l2未付与でも canonical/name から推定
    const old = { name: '鶏もも肉', category: '生鮮食品' as const };
    expect(grainKey(old, 'l2')).toBe('鶏肉');
    expect(grainKey(old, 'l1')).toBe('肉類');
  });

  it('grainKey: l1/l2/item とフォールバック', () => {
    const tagged = { name: 'とりむね', canonical_name: '鶏むね肉', l1: '肉類', l2: '鶏肉', category: '生鮮食品' as const };
    expect(grainKey(tagged, 'l1')).toBe('肉類');
    expect(grainKey(tagged, 'l2')).toBe('鶏肉');
    expect(grainKey(tagged, 'item')).toBe('鶏むね肉');
    // タクソノミー無し → 6分類フォールバック
    const bare = { name: 'なにか', category: '飲料' as const };
    expect(grainKey(bare, 'l2')).toBe('飲料');
    expect(grainKey(bare, 'l1')).toBe('飲料');
  });
});

describe('computeAnalysis grain', () => {
  const rcpt: Receipt = {
    id: 'r', user_id: 'u', store: 'S', date: '2026-06-01', total: 900,
    items: [
      { name: 'とりむね', canonical_name: '鶏むね肉', l1: '肉類', l2: '鶏肉', category: '生鮮食品', amount: 300 },
      { name: 'とりもも', canonical_name: '鶏もも肉', l1: '肉類', l2: '鶏肉', category: '生鮮食品', amount: 400 },
      { name: '牛こま', canonical_name: '牛こま切れ', l1: '肉類', l2: '牛肉', category: '生鮮食品', amount: 200 },
    ],
    created_at: '2026-06-01',
  };

  it('l1粒度では「肉類」に集約', () => {
    const a = computeAnalysis([rcpt], { grain: 'l1' });
    expect(a.ranking.length).toBe(1);
    expect(a.ranking[0]!.name).toBe('肉類');
    expect(a.ranking[0]!.count).toBe(3);
  });
  it('l2粒度では「鶏肉」「牛肉」に分かれる', () => {
    const a = computeAnalysis([rcpt], { grain: 'l2' });
    const names = a.ranking.map((r) => r.name).sort();
    expect(names).toEqual(['牛肉', '鶏肉']);
  });
  it('item粒度では正式名で分かれる', () => {
    const a = computeAnalysis([rcpt], { grain: 'item' });
    expect(a.ranking.map((r) => r.name).sort()).toEqual(['牛こま切れ', '鶏むね肉', '鶏もも肉']);
  });

  it('大分類は一般的な年間購入数の事前に引き寄せられる（小分類より高頻度）', () => {
    // 1ヶ月・肉類3点。L1事前=肉類60回/年 → l1の年間頻度は実績ベースのitemより大きいはず。
    const l1 = computeAnalysis([rcpt], { grain: 'l1' }).ranking[0]!;
    const item = computeAnalysis([rcpt], { grain: 'item' }).ranking[0]!;
    expect(l1.name).toBe('肉類');
    expect(l1.annual_freq).toBeGreaterThan(20); // 事前60に引き寄せ
    expect(l1.annual_freq).toBeGreaterThan(item.annual_freq);
  });
});
