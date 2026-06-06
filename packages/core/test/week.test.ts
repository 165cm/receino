// packages/core/test/week.test.ts
import { describe, it, expect } from 'vitest';
import { weekKey } from '../src/week.js';

describe('weekKey（月曜起算・ユーザーTZ）', () => {
  it('ISO週番号を "YYYY-Www" で返す', () => {
    expect(weekKey(new Date('2026-06-03T00:00:00Z'), 'Asia/Tokyo')).toBe('2026-W23');
  });

  it('日曜と翌月曜は別の週キーになる（週境界）', () => {
    // 2026-06-07 は日曜, 06-08 は月曜
    const sun = weekKey(new Date('2026-06-07T12:00:00Z'), 'Asia/Tokyo');
    const mon = weekKey(new Date('2026-06-08T12:00:00Z'), 'Asia/Tokyo');
    expect(sun).toBe('2026-W23');
    expect(mon).toBe('2026-W24');
  });

  it('TZによって週がまたぐ瞬間が変わる', () => {
    // UTC 月曜 00:30 は、Asia/Tokyo では既に月曜 09:30（同じ週）
    // だが UTC 日曜 23:30 は Tokyo では月曜 08:30 → 週が違う
    const utcMoment = new Date('2026-06-07T23:30:00Z'); // UTC=日曜, JST=月曜
    expect(weekKey(utcMoment, 'UTC')).toBe('2026-W23');
    expect(weekKey(utcMoment, 'Asia/Tokyo')).toBe('2026-W24');
  });

  it('年跨ぎ週もISO規約に従う', () => {
    // 2026-12-31 は木曜 → 2026-W53
    expect(weekKey(new Date('2026-12-31T00:00:00Z'), 'UTC')).toBe('2026-W53');
  });
});
