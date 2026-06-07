// server/src/routes/analysis.ts
// GET /analysis?scope=all|month&month=YYYY-MM
//  scope=all（既定）: 総合分析（全期間を一括処理）
//  scope=month       : 詳細分析（指定月）
// 集計は core の computeAnalysis（純関数）に委譲。SSOT §3.2。

import type { FastifyInstance } from 'fastify';
import { computeAnalysis, householdUnits, type Grain } from '@receino/core';
import type { Context } from '../context.js';
import { requireUser } from '../middleware/auth.js';

export function registerAnalysisRoutes(app: FastifyInstance, ctx: Context) {
  app.get('/analysis', async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return;
    const q = req.query as { scope?: string; month?: string; grain?: string };
    const all = ctx.repo.listReceipts(user.id);
    const months = Array.from(new Set(all.map((r) => r.date.slice(0, 7)).filter(Boolean))).sort().reverse();

    const scope = q.scope === 'month' ? 'month' : 'all';
    const month = scope === 'month' ? (q.month || ctx.now().toISOString().slice(0, 7)) : 'all';
    const receipts = scope === 'month' ? all.filter((r) => r.date.startsWith(month)) : all;
    const grain: Grain = q.grain === 'l1' || q.grain === 'l2' ? q.grain : 'item';

    const result = computeAnalysis(receipts, {
      monthlyBudget: user.monthly_budget_jpy ?? null,
      grain,
      householdUnits: householdUnits(user.household_composition),
    });
    return reply.send({ scope, month, months, grain, ...result });
  });
}
