// server/src/routes/credits.ts
// GET /credits : クレジット残高（バケット内訳）。SSOT §5.3 / §4.5。

import type { FastifyInstance } from 'fastify';
import type { Context } from '../context.js';
import { requireUser } from '../middleware/auth.js';

export function registerCreditRoutes(app: FastifyInstance, ctx: Context) {
  app.get('/credits', async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return;
    return reply.send(ctx.credits.getBalance(user.id, ctx.now()));
  });
}
