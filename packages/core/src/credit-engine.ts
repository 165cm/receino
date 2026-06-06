// packages/core/src/credit-engine.ts
// クレジットエンジン（純関数）。SSOT §4 全文。★本アプリ最重要ロジック。
//
// 設計原則:
//  - I/O を持たない。現在時刻・TZ は引数で受ける（テストで完全制御するため）。
//  - すべて新しい CreditBucket を返す（入力を破壊しない / イミュータブル）。
//  - サーバが唯一の呼び出し主体。判定はクライアントに持たせない（SSOT §5.3 末尾）。

import type { CreditBucket, CreditKind } from './types.js';
import {
  REFERRAL_BONUS,
  REFERRAL_LIFETIME_CAP,
  SIGNUP_BONUS,
  WEEKLY_GRANT,
} from './constants.js';
import { weekKey } from './week.js';

/** 新規ユーザーの初期バケット（まだ初回付与前）。 */
export function emptyBucket(weekKeyValue: string): CreditBucket {
  return {
    signup_remaining: 0,
    weekly_remaining: 0,
    weekly_week_key: weekKeyValue,
    referral_remaining: 0,
    referral_lifetime_granted: 0,
  };
}

/** 残高合計。SSOT §4.5。 */
export function computeBalance(b: CreditBucket): number {
  return b.signup_remaining + b.weekly_remaining + b.referral_remaining;
}

/**
 * 初回付与 +5。SSOT §4.1。
 * 「1回のみ」の保証は呼び出し側（初回起動フラグ）が担う。
 */
export function grantSignupBonus(b: CreditBucket): CreditBucket {
  return { ...b, signup_remaining: b.signup_remaining + SIGNUP_BONUS };
}

/**
 * 週次付与の遅延評価。SSOT §4.3。
 * - now/tz から算出した週キーが保存済みキーと異なれば「週が切り替わった」とみなす:
 *     前週分の weekly_grant を失効（0 リセット）→ 今週分 +1 → キー更新。
 * - 同一週内では何もしない（★冪等：複数回呼んでも増えない）。
 * 残高参照・消費の前に必ず通すことで cron なしでも整合する。
 */
export function ensureWeeklyGrant(b: CreditBucket, now: Date, tz: string): CreditBucket {
  const currentKey = weekKey(now, tz);
  if (currentKey === b.weekly_week_key) {
    return b; // 同一週 → 変化なし（冪等）
  }
  // 週切替: 前週の weekly 残は失効（繰越なし）。今週分を新規付与。
  return {
    ...b,
    weekly_remaining: WEEKLY_GRANT,
    weekly_week_key: currentKey,
  };
}

export interface ConsumeResult {
  bucket: CreditBucket;
  consumed: boolean;
  kind: CreditKind | null; // どのバケットから引いたか
}

/**
 * スキャン保存成功時の1枚消費。SSOT §4.2。
 * 消費優先順位: weekly_grant（失効が早い）→ signup_bonus → referral_bonus。
 * 残高0なら状態を変えず consumed=false を返す（§4.6 のガード分岐元）。
 */
export function consumeCredit(b: CreditBucket): ConsumeResult {
  if (b.weekly_remaining > 0) {
    return {
      bucket: { ...b, weekly_remaining: b.weekly_remaining - 1 },
      consumed: true,
      kind: 'weekly_grant',
    };
  }
  if (b.signup_remaining > 0) {
    return {
      bucket: { ...b, signup_remaining: b.signup_remaining - 1 },
      consumed: true,
      kind: 'signup_bonus',
    };
  }
  if (b.referral_remaining > 0) {
    return {
      bucket: { ...b, referral_remaining: b.referral_remaining - 1 },
      consumed: true,
      kind: 'referral_bonus',
    };
  }
  return { bucket: b, consumed: false, kind: null };
}

export interface ReferralGrantResult {
  bucket: CreditBucket;
  granted: number; // 実際に付与された枚数（打ち止め時は 0）
}

/**
 * 紹介成立時の付与。SSOT §4.4。
 * - 生涯上限 REFERRAL_LIFETIME_CAP(15) を超えない範囲で +REFERRAL_BONUS(5)。
 * - 上限到達後は granted=0（コード自体は機能してよい＝呼び出しは成功扱い・付与なし）。
 * - 紹介者・被紹介者の双方に対して本関数を各々呼ぶ（双方向は呼び出し側で2回適用）。
 */
export function grantReferral(b: CreditBucket): ReferralGrantResult {
  const room = REFERRAL_LIFETIME_CAP - b.referral_lifetime_granted;
  const granted = Math.max(0, Math.min(REFERRAL_BONUS, room));
  if (granted === 0) {
    return { bucket: b, granted: 0 };
  }
  return {
    bucket: {
      ...b,
      referral_remaining: b.referral_remaining + granted,
      referral_lifetime_granted: b.referral_lifetime_granted + granted,
    },
    granted,
  };
}
