// server/src/routes/metrics.ts
// 計測（§8）: クライアントからのイベント受付 + 集計ダッシュボード。
//  POST /events  { type, props }  … 任意の funnel イベントを記録
//  GET  /metrics                  … §8 指標を集計して返す（dev用・認証は簡易）

import type { FastifyInstance } from 'fastify';
import type { Context } from '../context.js';
import { requireUser } from '../middleware/auth.js';
import { track } from '../track.js';

export function registerMetricsRoutes(app: FastifyInstance, ctx: Context) {
  // クライアントイベント記録（オンボ完了・PayWall表示など）
  app.post('/events', async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return;
    const body = (req.body ?? {}) as { type?: string; props?: Record<string, unknown> };
    if (!body.type) return reply.code(400).send({ error: 'missing_type' });
    track(ctx, user.id, body.type, body.props);
    return reply.send({ ok: true });
  });

  // 集計（SSOT §8）。MVP: 認証ゲートは簡易（本番は管理者制限を入れる）。
  app.get('/metrics', async (_req, reply) => {
    const events = ctx.repo.listEvents();
    const users = ctx.repo.listUsers();
    const by = (t: string) => events.filter((e) => e.type === t);
    const num = (v: unknown) => (typeof v === 'number' ? v : 0);

    const scanOk = by('scan_ok');
    const avgMs = scanOk.length
      ? Math.round(scanOk.reduce((s, e) => s + num(e.props?.ms), 0) / scanOk.length)
      : 0;

    // クレジット種別ごとの消費（receipt_saved.consumed_kind）
    const consumeByKind: Record<string, number> = {};
    for (const e of by('receipt_saved')) {
      const k = (e.props?.consumed_kind as string) ?? 'premium_or_none';
      consumeByKind[k] = (consumeByKind[k] ?? 0) + 1;
    }

    const usersTotal = users.length;
    const registered = users.filter((u) => u.registered_at != null).length;
    const premium = users.filter((u) => u.is_premium).length;
    const referralCompleted = by('referral_completed').length;

    return reply.send({
      generated_at: ctx.now().toISOString(),
      funnel: {
        users_total: usersTotal,
        registered_total: registered,
        premium_total: premium,
        onboarding_completed: by('onboarding_completed').length,
        paywall_viewed: by('paywall_viewed').length,
      },
      conversion: {
        free_to_paid_pct: usersTotal ? Math.round((premium / usersTotal) * 1000) / 10 : 0,
        trial_started: by('subscribe').filter((e) => e.props?.trial === true).length,
        subscribed_total: by('subscribe').length,
        churn_unsubscribe: by('unsubscribe').length,
      },
      referral: {
        completed: referralCompleted,
        // 近似 k係数 = 紹介成立数 / 登録ユーザー数
        k_factor: registered ? Math.round((referralCompleted / registered) * 100) / 100 : 0,
      },
      scans: {
        started: by('scan_started').length,
        ok: scanOk.length,
        read_failed: by('scan_read_failed').length,
        no_credits: by('scan_no_credits').length,
        avg_ms: avgMs,
      },
      receipts_saved: by('receipt_saved').length,
      credit_consumption_by_kind: consumeByKind,
      events_total: events.length,
    });
  });
}
