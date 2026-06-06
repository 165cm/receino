// server/src/services/credit-service.ts
// コアのクレジットエンジンと永続化(Repo)を繋ぐ。トランザクション境界はここ。SSOT §4 / 設計 §3.4。
//
// インメモリ実装は同期的なので原子性は自明だが、Postgres 化の際は
// 各メソッドを「行ロック付き単一トランザクション」で包む（同時スキャンの二重消費防止）。

import {
  computeBalance,
  consumeCredit,
  ensureWeeklyGrant,
  grantReferral,
  type CreditBucket,
  type CreditKind,
} from '@receino/core';
import type { Repo } from '../db/repo.js';

export interface BalanceView {
  balance: number;
  buckets: {
    signup_remaining: number;
    weekly_remaining: number;
    referral_remaining: number;
  };
  referral_lifetime_granted: number;
}

function toView(b: CreditBucket): BalanceView {
  return {
    balance: computeBalance(b),
    buckets: {
      signup_remaining: b.signup_remaining,
      weekly_remaining: b.weekly_remaining,
      referral_remaining: b.referral_remaining,
    },
    referral_lifetime_granted: b.referral_lifetime_granted,
  };
}

export class CreditService {
  constructor(private repo: Repo) {}

  /**
   * 週次付与の遅延評価を適用して永続化し、最新バケットを返す。
   * 登録ユーザーのみ週次付与（§4.1「登録ユーザーのみ」）。未登録は signup/referral のみ。
   * 残高参照・消費の前に必ず通す。★トランザクション境界。
   */
  private refreshBucket(userId: string, now: Date): CreditBucket {
    const user = this.repo.getUser(userId);
    if (!user) throw new Error('user_not_found');
    const cur = this.repo.getBucket(userId);
    if (!cur) throw new Error('bucket_not_found');

    // 登録済みユーザー(registered_at != null)のみ週次付与を反映（§4.1「登録ユーザーのみ」）。
    const next =
      user.registered_at != null
        ? ensureWeeklyGrant(cur, now, user.timezone)
        : cur;
    if (next !== cur) this.repo.setBucket(userId, next);
    return next;
  }

  /** GET /credits 相当。SSOT §5.3。 */
  getBalance(userId: string, now: Date): BalanceView {
    return toView(this.refreshBucket(userId, now));
  }

  /**
   * スキャン保存成功時の1枚消費。SSOT §4.2 / §10。
   * 残高0なら consumed=false（呼び出し側で PayWall ガード）。
   */
  consumeOnSave(
    userId: string,
    now: Date,
  ): { consumed: boolean; kind: CreditKind | null; view: BalanceView } {
    const refreshed = this.refreshBucket(userId, now);
    const r = consumeCredit(refreshed);
    if (r.consumed) this.repo.setBucket(userId, r.bucket);
    return { consumed: r.consumed, kind: r.kind, view: toView(r.bucket) };
  }

  /** 紹介成立時に片側へ +5（上限15で打ち止め）。双方向は2回呼ぶ。SSOT §4.4。 */
  applyReferralGrant(userId: string, now: Date): number {
    const refreshed = this.refreshBucket(userId, now);
    const r = grantReferral(refreshed);
    if (r.granted > 0) this.repo.setBucket(userId, r.bucket);
    return r.granted;
  }
}
