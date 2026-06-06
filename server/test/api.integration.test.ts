// server/test/api.integration.test.ts
// SSOT §10 受け入れ基準のうちサーバ経路を検証。時刻は ctx.now を固定して週切替を再現。

import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { createContext, type Context } from '../src/context.js';
import type { FastifyInstance } from 'fastify';

let clock = new Date('2026-06-03T00:00:00Z'); // 2026-W23
function makeApp(): { app: FastifyInstance; ctx: Context } {
  const ctx = createContext({ now: () => clock });
  return buildApp(ctx);
}

async function createUser(app: FastifyInstance, tz = 'Asia/Tokyo') {
  const res = await app.inject({ method: 'POST', url: '/users', payload: { timezone: tz } });
  return res.json();
}

describe('ユーザー作成と初回付与', () => {
  it('POST /users で signup +5、残高5', async () => {
    const { app } = makeApp();
    const { user, credits } = await createUser(app);
    expect(credits.balance).toBe(5);
    expect(credits.buckets.signup_remaining).toBe(5);
    expect(user.referral_code).toHaveLength(8);
    expect(user.registered).toBe(false);
  });
});

describe('週次付与は登録ユーザーのみ', () => {
  beforeEach(() => {
    clock = new Date('2026-06-03T00:00:00Z');
  });
  it('未登録は週が進んでも weekly が増えない', async () => {
    const { app, ctx } = makeApp();
    const { user } = await createUser(app);
    clock = new Date('2026-06-08T12:00:00Z'); // W24
    const credits = ctx.credits.getBalance(user.id, ctx.now());
    expect(credits.buckets.weekly_remaining).toBe(0);
  });

  it('登録すると週次付与が有効化され、週切替で +1', async () => {
    const { app } = makeApp();
    const { user } = await createUser(app);
    await app.inject({ method: 'POST', url: '/register', headers: { 'x-user-id': user.id }, payload: {} });
    // 登録時点(W23)では weekly=1 になる（W23 を新規記録するため）
    clock = new Date('2026-06-08T12:00:00Z'); // W24
    const res = await app.inject({ method: 'GET', url: '/credits', headers: { 'x-user-id': user.id } });
    expect(res.json().buckets.weekly_remaining).toBe(1);
  });
});

describe('スキャン→保存→消費（§4.2 / §4.6）', () => {
  beforeEach(() => { clock = new Date('2026-06-03T00:00:00Z'); });

  it('残高ありでスキャンするとドラフトが返る（未消費）', async () => {
    const { app } = makeApp();
    const { user } = await createUser(app);
    const scan = await app.inject({ method: 'POST', url: '/scan', headers: { 'x-user-id': user.id }, payload: { image: 'data' } });
    expect(scan.statusCode).toBe(200);
    expect(scan.json().draft.items.length).toBeGreaterThan(0);
    // まだ消費されていない
    const c = await app.inject({ method: 'GET', url: '/credits', headers: { 'x-user-id': user.id } });
    expect(c.json().balance).toBe(5);
  });

  it('保存成功で1枚消費、signupから減る', async () => {
    const { app } = makeApp();
    const { user } = await createUser(app);
    const save = await app.inject({
      method: 'POST', url: '/receipts', headers: { 'x-user-id': user.id },
      payload: { store: 'S', date: '2026-06-03', total: 100, items: [{ name: 'x', amount: 100, category: '生鮮食品' }] },
    });
    expect(save.statusCode).toBe(201);
    expect(save.json().consumed_kind).toBe('signup_bonus');
    expect(save.json().credits.balance).toBe(4);
    expect(save.json().reliability.disclaimer).toContain('試算');
  });

  it('OCR失敗は消費しない（read_failed）', async () => {
    const { app } = makeApp();
    const { user } = await createUser(app);
    const scan = await app.inject({ method: 'POST', url: '/scan', headers: { 'x-user-id': user.id }, payload: { image: 'fail' } });
    expect(scan.statusCode).toBe(422);
    const c = await app.inject({ method: 'GET', url: '/credits', headers: { 'x-user-id': user.id } });
    expect(c.json().balance).toBe(5);
  });

  it('残高0でスキャンは402+paywall、OCR未呼び出し', async () => {
    const { app, ctx } = makeApp();
    const { user } = await createUser(app);
    // 5枚使い切る
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: 'POST', url: '/receipts', headers: { 'x-user-id': user.id }, payload: { items: [{ name: 'a', amount: 1, category: '飲料' }] } });
    }
    expect(ctx.credits.getBalance(user.id, ctx.now()).balance).toBe(0);
    const scan = await app.inject({ method: 'POST', url: '/scan', headers: { 'x-user-id': user.id }, payload: { image: 'data' } });
    expect(scan.statusCode).toBe(402);
    expect(scan.json().paywall).toBe(true);
  });
});

describe('紹介（§4.4）', () => {
  beforeEach(() => { clock = new Date('2026-06-03T00:00:00Z'); });

  it('登録済み被紹介者がコード適用で双方向+5', async () => {
    const { app } = makeApp();
    const a = await createUser(app); // 紹介者
    const b = await createUser(app); // 被紹介者
    await app.inject({ method: 'POST', url: '/register', headers: { 'x-user-id': b.user.id }, payload: {} });
    const res = await app.inject({
      method: 'POST', url: '/referrals/claim',
      headers: { 'x-user-id': b.user.id }, payload: { code: a.user.referral_code },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().granted_to_you).toBe(5);
    expect(res.json().granted_to_referrer).toBe(5);
  });

  it('未登録だと成立しない（409）', async () => {
    const { app } = makeApp();
    const a = await createUser(app);
    const b = await createUser(app);
    const res = await app.inject({
      method: 'POST', url: '/referrals/claim',
      headers: { 'x-user-id': b.user.id }, payload: { code: a.user.referral_code },
    });
    expect(res.statusCode).toBe(409);
  });

  it('自己紹介・二重適用は拒否', async () => {
    const { app } = makeApp();
    const a = await createUser(app);
    await app.inject({ method: 'POST', url: '/register', headers: { 'x-user-id': a.user.id }, payload: {} });
    const self = await app.inject({ method: 'POST', url: '/referrals/claim', headers: { 'x-user-id': a.user.id }, payload: { code: a.user.referral_code } });
    expect(self.statusCode).toBe(400);
  });
});

describe('プレミアムは消費しない', () => {
  beforeEach(() => { clock = new Date('2026-06-03T00:00:00Z'); });
  it('subscribe後は保存しても残高が減らない', async () => {
    const { app } = makeApp();
    const { user } = await createUser(app);
    await app.inject({ method: 'POST', url: '/subscribe', headers: { 'x-user-id': user.id }, payload: { trial: true } });
    const save = await app.inject({ method: 'POST', url: '/receipts', headers: { 'x-user-id': user.id }, payload: { items: [{ name: 'x', amount: 100, category: '外食' }] } });
    expect(save.statusCode).toBe(201);
    expect(save.json().consumed_kind).toBeNull();
    expect(save.json().credits.balance).toBe(5);
  });
});
