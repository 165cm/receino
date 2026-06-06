// server/src/routes/referrals.ts
// 紹介。SSOT §4.4 / §9-2（確定: 成立=被紹介者の登録完了）。
//  POST /referrals/claim : 被紹介者が紹介コードを適用（登録完了が前提）。双方向 +5。
//  GET  /referrals/status : 自分のコード・成立件数・生涯付与・残り上限。

import type { FastifyInstance } from 'fastify';
import { REFERRAL_LIFETIME_CAP, type Referral } from '@receino/core';
import type { Context } from '../context.js';
import { requireUser } from '../middleware/auth.js';
import { track } from '../track.js';

export function registerReferralRoutes(app: FastifyInstance, ctx: Context) {
  app.post('/referrals/claim', async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return;
    const now = ctx.now();
    const body = (req.body ?? {}) as { code?: string };
    const code = (body.code ?? '').trim().toUpperCase();

    // 成立条件: 被紹介者がアカウント登録完了していること（§9-2 確定）
    if (user.registered_at == null) {
      return reply.code(409).send({ error: 'not_registered', message: '登録完了後に適用できます' });
    }
    if (!code) {
      return reply.code(400).send({ error: 'missing_code' });
    }
    const referrer = ctx.repo.getUserByReferralCode(code);
    if (!referrer) {
      return reply.code(404).send({ error: 'invalid_code', message: 'コードが無効です' });
    }
    // 不正対策（§9-2）: 自己紹介禁止 / 二重適用禁止。
    if (referrer.id === user.id) {
      return reply.code(400).send({ error: 'self_referral', message: '自分のコードは使えません' });
    }
    if (user.referred_by != null || ctx.repo.hasBeenReferred(user.id)) {
      return reply.code(409).send({ error: 'already_referred', message: '既に適用済みです' });
    }

    // 成立記録
    const referral: Referral = {
      referrer_user_id: referrer.id,
      referred_user_id: user.id,
      status: 'completed',
      completed_at: now.toISOString(),
    };
    ctx.repo.addReferral(referral);
    ctx.repo.updateUser(user.id, { referred_by: code });

    // 双方向 +5（紹介者は生涯上限15で打ち止め。被紹介者も同関数で付与）。SSOT §4.4。
    const grantedToReferrer = ctx.credits.applyReferralGrant(referrer.id, now);
    const grantedToReferred = ctx.credits.applyReferralGrant(user.id, now);
    track(ctx, user.id, 'referral_completed', { referrer: referrer.id, granted_to_referrer: grantedToReferrer, granted_to_referred: grantedToReferred }); // §8

    return reply.send({
      status: 'completed',
      granted_to_you: grantedToReferred,
      granted_to_referrer: grantedToReferrer,
      credits: ctx.credits.getBalance(user.id, now),
    });
  });

  app.get('/referrals/status', async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return;
    const view = ctx.credits.getBalance(user.id, ctx.now());
    return reply.send({
      referral_code: user.referral_code,
      lifetime_granted: view.referral_lifetime_granted,
      lifetime_cap: REFERRAL_LIFETIME_CAP,
      remaining_cap: Math.max(0, REFERRAL_LIFETIME_CAP - view.referral_lifetime_granted),
    });
  });
}
