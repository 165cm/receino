// server/src/app.ts
// Fastify アプリ生成（テスト/起動の双方から使う）。

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { createContext, type Context } from './context.js';
import { registerUserRoutes } from './routes/users.js';
import { registerScanRoutes } from './routes/scan.js';
import { registerReceiptRoutes } from './routes/receipts.js';
import { registerCreditRoutes } from './routes/credits.js';
import { registerReferralRoutes } from './routes/referrals.js';
import { registerMeRoutes } from './routes/me.js';
import { registerMetricsRoutes } from './routes/metrics.js';
import { registerAnalysisRoutes } from './routes/analysis.js';

export function buildApp(ctx: Context = createContext()): { app: FastifyInstance; ctx: Context } {
  // bodyLimit: スマホ写真(base64)は数MBになるため既定1MBから拡大。
  const app = Fastify({ logger: false, bodyLimit: 25 * 1024 * 1024 });
  app.register(cors, { origin: true });

  app.get('/health', async () => ({ ok: true, app: '食べレコ', ts: new Date().toISOString() }));

  registerUserRoutes(app, ctx);
  registerScanRoutes(app, ctx);
  registerReceiptRoutes(app, ctx);
  registerCreditRoutes(app, ctx);
  registerReferralRoutes(app, ctx);
  registerMeRoutes(app, ctx);
  registerMetricsRoutes(app, ctx);
  registerAnalysisRoutes(app, ctx);

  return { app, ctx };
}
