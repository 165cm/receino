// server/src/routes/scan.ts
// POST /scan : 残高チェック→解析→未保存ドラフト返却。SSOT §5.1 / §5.3 / §4.6。
// ★残高0なら OCR を呼ばずに PayWall（APIコスト防止）。ここでは消費しない。

import type { FastifyInstance } from 'fastify';
import type { Context } from '../context.js';
import { requireUser } from '../middleware/auth.js';
import { isOcrError } from '../services/ocr-service.js';
import { track } from '../track.js';

export function registerScanRoutes(app: FastifyInstance, ctx: Context) {
  app.post('/scan', async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return;
    const now = ctx.now();

    // 1. 残高ガード（§4.6）。プレミアムは無制限。
    if (!user.is_premium) {
      const view = ctx.credits.getBalance(user.id, now);
      if (view.balance <= 0) {
        // ★OCRを呼ばない
        track(ctx, user.id, 'scan_no_credits'); // §8
        return reply.code(402).send({
          error: 'no_credits',
          paywall: true,
          message: 'クレジットが不足しています',
          credits: view,
        });
      }
    }

    // 2. 解析（未保存ドラフト）。消費はまだしない。
    const body = (req.body ?? {}) as { image?: string; mediaType?: string };
    const kb = Math.round((body.image?.length ?? 0) / 1024);
    const t0 = Date.now();
    track(ctx, user.id, 'scan_started', { kb }); // §8
    // eslint-disable-next-line no-console
    console.log(`[scan] start user=${user.id.slice(0, 8)} image=${kb}KB type=${body.mediaType ?? '-'}`);
    const result = await ctx.ocr.parse(body.image ?? '', body.mediaType);
    const ms = Date.now() - t0;
    if (isOcrError(result)) {
      track(ctx, user.id, 'scan_read_failed', { ms, kb }); // §8
      // eslint-disable-next-line no-console
      console.log(`[scan] read_failed in ${ms}ms`);
      return reply.code(422).send({ error: 'read_failed', message: '読み取れませんでした' });
    }
    track(ctx, user.id, 'scan_ok', { ms, kb, items: result.items.length }); // §8（1スキャンの所要・コスト分析）
    // eslint-disable-next-line no-console
    console.log(`[scan] ok in ${ms}ms items=${result.items.length} total=${result.total}`);
    return reply.send({ draft: result });
  });
}
