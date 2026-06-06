// app/src/api.ts
// APIクライアント。真実はサーバ（SSOT §5.3）。クライアントは表示のみ。

import Constants from 'expo-constants';
import { storage } from './storage';
import type { Category } from '@receino/core';

// API接続先の解決順:
//  1) 明示設定（app.json extra.apiUrl / EXPO_PUBLIC_API_URL）
//  2) Web で localhost 以外から開かれている場合、その host の :3001 を自動採用
//     （同一LANのスマホ実機ブラウザから http://<PCのIP>:8081 を開くと自動で <PCのIP>:3001 を叩く）
//  3) 既定 localhost:3001
function resolveBaseUrl(): string {
  const explicit = (Constants.expoConfig?.extra as any)?.apiUrl || process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit;
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const h = window.location.hostname;
    if (h !== 'localhost' && h !== '127.0.0.1') {
      return `${window.location.protocol}//${h}:3001`;
    }
  }
  return 'http://localhost:3001';
}

const BASE_URL: string = resolveBaseUrl();

const USER_KEY = 'taberec.user_id';

export function getUserId(): string | null {
  return storage.get(USER_KEY);
}
export function setUserId(id: string): void {
  storage.set(USER_KEY, id);
}

export interface CreditView {
  balance: number;
  buckets: { signup_remaining: number; weekly_remaining: number; referral_remaining: number };
  referral_lifetime_granted: number;
}
export interface PublicUser {
  id: string;
  timezone: string;
  is_premium: boolean;
  trial_ends_at: string | null;
  registered: boolean;
  goal: string;
  referral_code: string;
  referred_by: string | null;
}
export interface DraftItem { name: string; amount: number; category: Category; canonical_name?: string; l1?: string; l2?: string }
export interface Draft { store: string; store_address?: string; store_phone?: string; date: string; items: DraftItem[]; total: number }
export interface SaveReceiptInput {
  store: string; store_address?: string; store_phone?: string;
  date: string; total: number; items: DraftItem[];
  image?: string; mediaType?: string;
}
export interface Reliability { score: number; n: number; disclaimer: string }

export interface RankingItem {
  name: string; category: string; count: number; spend: number;
  avg_price: number; min_price: number;
  annual_freq: number; est_price: number; annual_spend: number;
  annual_saving_10pct: number; annual_saving_to_min: number;
}
export interface AnalysisView {
  scope: 'all' | 'month'; month: string; months: string[]; grain: 'l1' | 'l2' | 'item';
  period_total: number; receipt_count: number; item_count: number; months_observed: number;
  by_category: { category: string; amount: number; pct: number }[];
  composition: { name: string; spend: number; pct: number }[];
  groups: RankingItem[];
  portfolio: { necessity: number; discretionary: number; necessity_pct: number; discretionary_pct: number };
  ranking: RankingItem[];
  annual: {
    projected_total: number; estimate: number; low: number; high: number;
    monthly_mean: number; prior_mean: number; months_observed: number; data_driven_ratio: number;
  };
  savings: {
    projected_monthly: number; discretionary_monthly: number; headroom_monthly: number;
    target_monthly: number | null; over_budget_monthly: number | null;
  };
}

class ApiError extends Error {
  constructor(public status: number, public body: any) {
    super(body?.message || body?.error || `HTTP ${status}`);
  }
}

async function req<T>(method: string, path: string, body?: unknown, timeoutMs = 60_000, _retried = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const uid = getUserId();
  if (uid) headers['x-user-id'] = uid;
  // タイムアウト（応答が無くてもUIが固まらないよう打ち切る）。
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') {
      throw new ApiError(408, { error: 'timeout', message: '通信がタイムアウトしました。電波の良い場所で、レシート全体が写るように撮り直してください。' });
    }
    throw new ApiError(0, { error: 'network', message: `通信に失敗しました（接続先: ${BASE_URL}）` });
  }
  clearTimeout(timer);
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    // サーバ再起動でユーザーが消えた等（401）→ 作り直して1回だけ再試行。
    if (res.status === 401 && !_retried && path !== '/users') {
      storage.remove(USER_KEY);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';
      const created = await req<{ user: PublicUser }>('POST', '/users', { timezone: tz }, timeoutMs, true);
      setUserId(created.user.id);
      return req<T>(method, path, body, timeoutMs, true);
    }
    throw new ApiError(res.status, json);
  }
  return json as T;
}

export const api = {
  baseUrl: BASE_URL,
  ApiError,

  async createUser(timezone: string) {
    const r = await req<{ user: PublicUser; credits: CreditView }>('POST', '/users', { timezone });
    setUserId(r.user.id);
    return r;
  },
  register(goal: string, monthlyBudgetJpy?: number) {
    return req<{ user: PublicUser; credits: CreditView }>('POST', '/register', {
      goal,
      monthly_budget_jpy: monthlyBudgetJpy,
    });
  },
  analysis(scope: 'all' | 'month', month?: string, grain: 'l1' | 'l2' | 'item' = 'item') {
    const base = scope === 'month' && month ? `?scope=month&month=${month}` : `?scope=all`;
    return req<AnalysisView>('GET', `/analysis${base}&grain=${grain}`);
  },
  me() {
    return req<{ user: PublicUser; billing: any }>('GET', '/me');
  },
  credits() {
    return req<CreditView>('GET', '/credits');
  },
  scan(image: string, mediaType?: string) {
    return req<{ draft: Draft }>('POST', '/scan', { image, mediaType });
  },
  saveReceipt(receipt: SaveReceiptInput) {
    return req<{ receipt: any; consumed_kind: string | null; credits: CreditView; reliability: Reliability }>(
      'POST',
      '/receipts',
      receipt,
    );
  },
  getReceipt(id: string) {
    return req<{ receipt: any; image: string | null }>('GET', `/receipts/${id}`);
  },
  updateReceipt(id: string, patch: Partial<SaveReceiptInput>) {
    return req<{ receipt: any }>('PATCH', `/receipts/${id}`, patch);
  },
  month(month: string) {
    return req<{
      month: string; months: string[]; count: number; total: number; receipts: any[];
      by_category: Record<string, number>; reliability: Reliability;
    }>('GET', `/receipts?month=${month}`);
  },
  // 計測イベント（§8）。失敗してもUIは止めない。
  track(type: string, props?: Record<string, unknown>) {
    return req<{ ok: boolean }>('POST', '/events', { type, props }).catch(() => undefined);
  },
  deleteReceipt(id: string) {
    return req<{ deleted: boolean }>('DELETE', `/receipts/${id}`);
  },
  allReceipts() {
    return req<{
      month: string; months: string[]; count: number; total: number; receipts: any[];
      by_category: Record<string, number>; reliability: Reliability;
    }>('GET', `/receipts?month=all`);
  },
  referralStatus() {
    return req<{ referral_code: string; lifetime_granted: number; lifetime_cap: number; remaining_cap: number }>(
      'GET',
      '/referrals/status',
    );
  },
  claimReferral(code: string) {
    return req<{ status: string; granted_to_you: number; granted_to_referrer: number; credits: CreditView }>(
      'POST',
      '/referrals/claim',
      { code },
    );
  },
  subscribe(trial: boolean) {
    return req<{ user: PublicUser }>('POST', '/subscribe', { trial });
  },
  unsubscribe() {
    return req<{ user: PublicUser }>('POST', '/unsubscribe');
  },
};
