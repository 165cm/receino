// app/src/referral-link.ts
// 招待リンク(?ref=CODE)で来た被紹介者の保留コードを記録し、登録完了時に自動成立させる。SSOT §4.4 / §9-2。

import { storage } from './storage';
import { api } from './api';

const PENDING_KEY = 'taberec.pending_ref';

/** URLの ?ref= を取り込んで保留（Web初回起動時に呼ぶ）。 */
export function capturePendingReferral(): void {
  if (typeof window === 'undefined' || !window.location?.search) return;
  try {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && !storage.get(PENDING_KEY)) {
      storage.set(PENDING_KEY, ref.trim().toUpperCase());
    }
  } catch {
    /* noop */
  }
}

export function getPendingReferral(): string | null {
  return storage.get(PENDING_KEY);
}
function clearPendingReferral(): void {
  storage.remove(PENDING_KEY);
}

/**
 * 登録完了後に保留コードがあれば成立を試みる。SSOT §4.4。
 * @param alreadyReferredBy 既に被紹介済みなら何もしない。
 * @returns 自分への付与枚数（成立時）/ null（対象なし・失敗）。
 */
export async function tryClaimPendingReferral(alreadyReferredBy: string | null): Promise<number | null> {
  const code = getPendingReferral();
  if (!code || alreadyReferredBy) return null;
  try {
    const r = await api.claimReferral(code);
    clearPendingReferral();
    return r.granted_to_you;
  } catch (e: any) {
    // 自己紹介/二重適用/無効コード等の恒久エラーは保留を破棄。一時的エラーは保持してリトライ余地を残す。
    const status = e instanceof api.ApiError ? e.status : 0;
    if ([400, 404, 409].includes(status)) clearPendingReferral();
    return null;
  }
}
