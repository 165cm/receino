// server/src/routes/me.ts
// GET /me : プラン/トライアル状態。POST /subscribe : プレミアム化（モック課金）。
// SSOT §5.3 / §7 / §9-3。

import type { FastifyInstance } from 'fastify';
import type { Context } from '../context.js';
import { requireUser } from '../middleware/auth.js';
import { publicUser } from './users.js';
import { track } from '../track.js';
import { premiumCodeOk } from '../security.js';

export function registerMeRoutes(app: FastifyInstance, ctx: Context) {
  app.get('/me', async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return;
    return reply.send({
      user: publicUser(user),
      billing: {
        monthly_price_jpy: ctx.billing.monthlyPriceJpy,
        trial_days: ctx.billing.trialDays,
        trial_mode: ctx.billing.trialMode,
      },
    });
  });

  // モック課金。本番は RevenueCat のレシート検証に差し替え（§9-3）。
  app.post('/subscribe', async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return;
    const now = ctx.now();
    const body = (req.body ?? {}) as { trial?: boolean; access_code?: string };
    // テスト公開ガード: PREMIUM_ACCESS_CODE 設定時は共有パスワード必須（コスト不正利用の防止）。
    if (!premiumCodeOk(ctx, body.access_code)) {
      track(ctx, user.id, 'subscribe_denied_code'); // §8
      return reply.code(403).send({
        error: 'invalid_access_code',
        message: 'プレミアムの利用にはアクセスコードが必要です',
      });
    }
    const trialEnds = body.trial
      ? new Date(now.getTime() + ctx.billing.trialDays * 86_400_000).toISOString()
      : null;
    const updated = ctx.repo.updateUser(user.id, {
      is_premium: true,
      premium_since: now.toISOString(),
      trial_ends_at: trialEnds,
    });
    track(ctx, user.id, 'subscribe', { trial: !!body.trial }); // §8
    return reply.send({ user: publicUser(updated) });
  });

  // 解約（設定から1タップ・SSOT §7）。本番は RevenueCat 連携。
  app.post('/unsubscribe', async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return;
    const updated = ctx.repo.updateUser(user.id, {
      is_premium: false,
      premium_since: null,
      trial_ends_at: null,
    });
    track(ctx, user.id, 'unsubscribe'); // §8（解約率）
    return reply.send({ user: publicUser(updated) });
  });
}
