// server/src/security.ts
// テスト公開向けの簡易ガード（不正利用・コスト青天井の防止）。env で有効化。
// 未設定なら全て無効＝従来どおり（ローカル開発・テストに影響しない）。
//  - PREMIUM_ACCESS_CODE: プレミアム化(/subscribe)に必要な共有パスワード。
//  - DAILY_OCR_LIMIT:     1日あたりの実OCR(Gemini等)呼び出し上限。
import type { Context } from './context.js';

/** プレミアム用アクセスコードのゲートが有効か。 */
export function premiumGateEnabled(ctx: Context): boolean {
  return !!ctx.security.premiumAccessCode;
}

/** 与えられたコードがプレミアム解放に有効か（ゲート無効時は常に true）。 */
export function premiumCodeOk(ctx: Context, provided: unknown): boolean {
  const code = ctx.security.premiumAccessCode;
  if (!code) return true; // ゲート無効
  return typeof provided === 'string' && timingSafeEqualStr(provided, code);
}

/**
 * 1日あたりの実OCR上限を消費して可否を返す（上限なしなら常に true）。
 * カウンタはプロセス内・日付で自動リセット（簡易。再起動でリセットされる）。
 */
export function tryConsumeOcrQuota(ctx: Context, now: Date): boolean {
  const limit = ctx.security.dailyOcrLimit;
  if (limit == null) return true; // 無制限
  const day = now.toISOString().slice(0, 10);
  if (ctx.ocrUsage.day !== day) {
    ctx.ocrUsage.day = day;
    ctx.ocrUsage.count = 0;
  }
  if (ctx.ocrUsage.count >= limit) return false;
  ctx.ocrUsage.count += 1;
  return true;
}

/** 長さ差・内容差をまとめて見る簡易な定数時間比較（タイミング攻撃の軽減）。 */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
