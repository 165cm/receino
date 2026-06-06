// packages/core/test/credit-engine.test.ts
// SSOT §10 受け入れ基準のうちクレジット系を直接カバーする。
import { describe, it, expect } from 'vitest';
import {
  emptyBucket,
  computeBalance,
  grantSignupBonus,
  ensureWeeklyGrant,
  consumeCredit,
  grantReferral,
} from '../src/credit-engine.js';
import type { CreditBucket } from '../src/types.js';

const TZ = 'Asia/Tokyo';
const W23 = new Date('2026-06-03T00:00:00Z'); // 2026-W23
const W24 = new Date('2026-06-08T12:00:00Z'); // 2026-W24（翌週月曜）

function freshRegistered(): CreditBucket {
  // 初回起動(+5) → 週次付与 を反映済みの登録ユーザー
  let b = emptyBucket('2026-W23');
  b = grantSignupBonus(b);
  b = ensureWeeklyGrant(b, W23, TZ); // 同一週キーなので付与されない点に注意
  return b;
}

describe('初回付与 signup +5', () => {
  it('emptyBucket から +5 される', () => {
    const b = grantSignupBonus(emptyBucket('2026-W23'));
    expect(b.signup_remaining).toBe(5);
    expect(computeBalance(b)).toBe(5);
  });
});

describe('週次付与と失効（§4.3）', () => {
  it('週キーが進むと weekly が +1 される', () => {
    const b0 = emptyBucket('2026-W23'); // 既に W23 を記録済み
    const b1 = ensureWeeklyGrant(b0, W24, TZ); // W24 に進む
    expect(b1.weekly_remaining).toBe(1);
    expect(b1.weekly_week_key).toBe('2026-W24');
  });

  it('同一週で複数回呼んでも増えない（冪等）', () => {
    let b = emptyBucket('2026-W22'); // 別週から開始
    b = ensureWeeklyGrant(b, W23, TZ); // → W23, +1
    expect(b.weekly_remaining).toBe(1);
    b = ensureWeeklyGrant(b, W23, TZ);
    b = ensureWeeklyGrant(b, W23, TZ);
    expect(b.weekly_remaining).toBe(1); // 増えない
  });

  it('週切替で前週分の weekly が失効（繰越なし）', () => {
    let b = emptyBucket('2026-W22');
    b = ensureWeeklyGrant(b, W23, TZ); // weekly=1 (W23)
    expect(b.weekly_remaining).toBe(1);
    // 前週分を使わずに翌週へ
    b = ensureWeeklyGrant(b, W24, TZ);
    expect(b.weekly_remaining).toBe(1); // 失効後に新規+1。溜まらない
    expect(b.weekly_week_key).toBe('2026-W24');
  });
});

describe('消費の優先順位 weekly→signup→referral（§4.2）', () => {
  it('weekly があれば weekly から減る', () => {
    let b = emptyBucket('2026-W22');
    b = grantSignupBonus(b); // signup=5
    b = ensureWeeklyGrant(b, W23, TZ); // weekly=1
    b = grantReferral(b).bucket; // referral=5
    const r = consumeCredit(b);
    expect(r.consumed).toBe(true);
    expect(r.kind).toBe('weekly_grant');
    expect(r.bucket.weekly_remaining).toBe(0);
    expect(r.bucket.signup_remaining).toBe(5);
    expect(r.bucket.referral_remaining).toBe(5);
  });

  it('weekly 枯渇後は signup から減る', () => {
    let b = emptyBucket('2026-W23');
    b = grantSignupBonus(b); // signup=5, weekly=0（同一週で付与なし）
    const r = consumeCredit(b);
    expect(r.kind).toBe('signup_bonus');
    expect(r.bucket.signup_remaining).toBe(4);
  });

  it('signup 枯渇後は referral から減る', () => {
    let b = emptyBucket('2026-W23');
    b = grantReferral(b).bucket; // referral=5 のみ
    const r = consumeCredit(b);
    expect(r.kind).toBe('referral_bonus');
    expect(r.bucket.referral_remaining).toBe(4);
  });

  it('残高0は状態不変で consumed=false（§4.6 ガード分岐元）', () => {
    const b = emptyBucket('2026-W23');
    const r = consumeCredit(b);
    expect(r.consumed).toBe(false);
    expect(r.kind).toBeNull();
    expect(r.bucket).toEqual(b);
  });

  it('全種を順に使い切る統合シナリオ', () => {
    let b = emptyBucket('2026-W22');
    b = grantSignupBonus(b); // signup=5
    b = ensureWeeklyGrant(b, W23, TZ); // weekly=1
    b = grantReferral(b).bucket; // referral=5
    expect(computeBalance(b)).toBe(11);
    const kinds: (string | null)[] = [];
    for (let i = 0; i < 11; i++) {
      const r = consumeCredit(b);
      b = r.bucket;
      kinds.push(r.kind);
    }
    expect(kinds[0]).toBe('weekly_grant');
    expect(kinds.slice(1, 6)).toEqual(Array(5).fill('signup_bonus'));
    expect(kinds.slice(6, 11)).toEqual(Array(5).fill('referral_bonus'));
    expect(computeBalance(b)).toBe(0);
    // さらに消費は不可
    expect(consumeCredit(b).consumed).toBe(false);
  });
});

describe('紹介付与と生涯上限15（§4.4）', () => {
  it('1回で +5', () => {
    const r = grantReferral(emptyBucket('2026-W23'));
    expect(r.granted).toBe(5);
    expect(r.bucket.referral_remaining).toBe(5);
    expect(r.bucket.referral_lifetime_granted).toBe(5);
  });

  it('3件(=15枚)で打ち止め、4件目は付与0', () => {
    let b = emptyBucket('2026-W23');
    for (let i = 0; i < 3; i++) b = grantReferral(b).bucket;
    expect(b.referral_lifetime_granted).toBe(15);
    expect(b.referral_remaining).toBe(15);
    const fourth = grantReferral(b);
    expect(fourth.granted).toBe(0);
    expect(fourth.bucket.referral_lifetime_granted).toBe(15);
    expect(fourth.bucket.referral_remaining).toBe(15);
  });

  it('消費して残が減っても生涯上限は維持され、再付与されない', () => {
    let b = emptyBucket('2026-W23');
    for (let i = 0; i < 3; i++) b = grantReferral(b).bucket; // 15付与
    b = consumeCredit(b).bucket; // referral=14
    expect(b.referral_remaining).toBe(14);
    expect(grantReferral(b).granted).toBe(0); // 上限到達済み
  });
});

describe('イミュータビリティ', () => {
  it('入力バケットを破壊しない', () => {
    const b = grantSignupBonus(emptyBucket('2026-W23'));
    const snapshot = { ...b };
    consumeCredit(b);
    grantReferral(b);
    ensureWeeklyGrant(b, W24, TZ);
    expect(b).toEqual(snapshot);
  });
});
