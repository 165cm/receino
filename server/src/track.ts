// server/src/track.ts
// 計測イベント記録のヘルパー。SSOT §8。
import type { Context } from './context.js';

export function track(ctx: Context, userId: string | null, type: string, props?: Record<string, unknown>) {
  try {
    ctx.repo.addEvent({ user_id: userId, type, props, ts: ctx.now().toISOString() });
  } catch {
    /* 計測失敗は本処理を止めない */
  }
}
