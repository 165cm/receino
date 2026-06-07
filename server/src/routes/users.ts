// server/src/routes/users.ts
// ユーザー作成（初回起動=DL）と登録（週次付与の有効化）。SSOT §4.1。

import type { FastifyInstance } from 'fastify';
import { grantSignupBonus, emptyBucket, weekKey, compositionFromSize, type User, type HouseholdComposition } from '@receino/core';
import type { Context } from '../context.js';
import { newId, newReferralCode } from '../util.js';
import { requireUser } from '../middleware/auth.js';
import { track } from '../track.js';

export function registerUserRoutes(app: FastifyInstance, ctx: Context) {
  // POST /users : 初回起動。signup_bonus +5 を付与（1回のみ）。SSOT §4.1。
  app.post('/users', async (req, reply) => {
    const body = (req.body ?? {}) as { timezone?: string };
    const tz = body.timezone || 'Asia/Tokyo';
    const now = ctx.now();
    const user: User = {
      id: newId(),
      created_at: now.toISOString(),
      registered_at: null, // 未登録（DLのみ）→ 週次付与はまだ無効
      timezone: tz,
      is_premium: false,
      premium_since: null,
      trial_ends_at: null,
      goal: '',
      referral_code: newReferralCode(),
      referred_by: null,
    };
    ctx.repo.createUser(user);
    // 初回付与 +5（失効なし・1回のみ）
    const bucket = grantSignupBonus(emptyBucket(weekKey(now, tz)));
    ctx.repo.setBucket(user.id, bucket);
    track(ctx, user.id, 'signup'); // §8
    reply.code(201).send({
      user: publicUser(user),
      credits: ctx.credits.getBalance(user.id, now),
    });
  });

  // POST /register : アカウント登録完了 → 週次付与を有効化。SSOT §4.1 / §10。
  app.post('/register', async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return;
    const body = (req.body ?? {}) as { goal?: string; monthly_budget_jpy?: number; household_size?: number };
    const now = ctx.now();
    // オンボは人数のみ受け取り、全員大人として構成化（設定で後から微調整可）。
    const household =
      typeof body.household_size === 'number' && body.household_size > 0
        ? compositionFromSize(body.household_size)
        : user.household_composition ?? null;
    const updated = ctx.repo.updateUser(user.id, {
      registered_at: user.registered_at ?? now.toISOString(),
      goal: body.goal ?? user.goal,
      monthly_budget_jpy:
        typeof body.monthly_budget_jpy === 'number' ? body.monthly_budget_jpy : user.monthly_budget_jpy ?? null,
      household_composition: household,
    });
    if (user.registered_at == null) track(ctx, user.id, 'register'); // 初回登録のみ §8
    // 登録直後に週次付与を反映
    const credits = ctx.credits.getBalance(updated.id, now);
    reply.send({ user: publicUser(updated), credits });
  });

  // POST /household : 世帯構成の微調整（設定画面・大人/子供/高齢者）。分析の年間頻度事前に反映。
  app.post('/household', async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return;
    const b = (req.body ?? {}) as Partial<HouseholdComposition>;
    const clamp = (n: unknown) => Math.max(0, Math.min(50, Math.round(Number(n) || 0)));
    const composition: HouseholdComposition = {
      adults: clamp(b.adults),
      children: clamp(b.children),
      elderly: clamp(b.elderly),
    };
    const updated = ctx.repo.updateUser(user.id, { household_composition: composition });
    reply.send({ user: publicUser(updated) });
  });
}

export function publicUser(u: User) {
  return {
    id: u.id,
    timezone: u.timezone,
    is_premium: u.is_premium,
    trial_ends_at: u.trial_ends_at,
    registered: u.registered_at != null,
    goal: u.goal,
    household_composition: u.household_composition ?? null,
    referral_code: u.referral_code,
    referred_by: u.referred_by,
  };
}
