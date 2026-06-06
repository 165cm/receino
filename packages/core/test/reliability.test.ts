// packages/core/test/reliability.test.ts
import { describe, it, expect } from 'vitest';
import { reliability } from '../src/reliability.js';
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
