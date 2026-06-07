// packages/core/test/household.test.ts
import { describe, it, expect } from 'vitest';
import {
  householdUnits,
  householdScale,
  compositionFromSize,
  HOUSEHOLD_BASELINE_UNITS,
  HOUSEHOLD_SCALE_MAX,
  HOUSEHOLD_SCALE_MIN,
} from '../src/household.js';

describe('householdUnits', () => {
  it('成人換算で合算（大人1.0/子供0.6/高齢者0.8）', () => {
    expect(householdUnits({ adults: 2, children: 0, elderly: 0 })).toBe(2);
    expect(householdUnits({ adults: 2, children: 1, elderly: 1 })).toBeCloseTo(2 + 0.6 + 0.8);
  });
  it('null は 0', () => {
    expect(householdUnits(null)).toBe(0);
    expect(householdUnits(undefined)).toBe(0);
  });
});

describe('compositionFromSize', () => {
  it('人数のみ→全員大人', () => {
    expect(compositionFromSize(3)).toEqual({ adults: 3, children: 0, elderly: 0 });
  });
});

describe('householdScale', () => {
  it('基準世帯はちょうど1.0', () => {
    expect(householdScale(HOUSEHOLD_BASELINE_UNITS)).toBe(1);
  });
  it('未設定(0/null)は1.0（従来どおり調整なし）', () => {
    expect(householdScale(0)).toBe(1);
    expect(householdScale(null)).toBe(1);
  });
  it('大人数は上限、極小は下限でクランプ', () => {
    expect(householdScale(100)).toBe(HOUSEHOLD_SCALE_MAX);
    expect(householdScale(0.1)).toBe(HOUSEHOLD_SCALE_MIN);
  });
});
