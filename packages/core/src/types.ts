// packages/core/src/types.ts
// 永続データの型定義。SSOT §5.2。

import type { Category } from './categories.js';
import type { HouseholdComposition } from './household.js';

export interface User {
  id: string;
  created_at: string; // ISO8601（初回起動＝DL時点）
  registered_at: string | null; // アカウント登録完了時刻。null=未登録(DLのみ)。週次付与はこれが非nullのときのみ有効（§4.1）
  timezone: string; // IANA TZ 例: "Asia/Tokyo"
  is_premium: boolean;
  premium_since: string | null;
  trial_ends_at: string | null;
  goal: string; // オンボのゴール選択
  monthly_budget_jpy?: number | null; // 月の食費目安（オンボの食費レンジ）。目標ペース用
  household_composition?: HouseholdComposition | null; // 世帯構成（分析の年間頻度事前の調整用）。オンボは人数のみ→全員大人
  referral_code: string; // 自分の紹介コード
  referred_by: string | null; // 被紹介の場合の紹介者コード
}

/**
 * クレジット残高。SSOT §4.1 / §5.2。
 * 合算1値で持たず、バケット別に残数を保持する（失効・上限判定のため §4.5）。
 */
export interface CreditBucket {
  signup_remaining: number; // 初回+5の残（失効なし）
  weekly_remaining: number; // 今週分（0 or 1, 週末失効）
  weekly_week_key: string; // "2026-W23" 等。週切替検知用
  referral_remaining: number; // 付与済み紹介クレジットの残
  referral_lifetime_granted: number; // 生涯付与累計（上限15判定用）
}

export interface ReceiptItem {
  name: string; // レシート表記（略記そのまま）
  amount: number;
  category: Category; // 固定6分類（会計・残高用）
  canonical_name?: string; // 略記を展開した推定正式名（L3・分析用）
  l1?: string; // 大分類（taxonomy）
  l2?: string; // 中分類（taxonomy）
}

export interface Receipt {
  id: string;
  user_id: string;
  store: string;
  store_address?: string; // 店舗住所（取得できた場合。将来のMAP機能用）
  store_phone?: string; // 店舗電話番号（取得できた場合）
  date: string; // YYYY-MM-DD
  total: number;
  items: ReceiptItem[];
  image_id?: string | null; // 保存したレシート画像の識別子（ディスク上）
  created_at: string;
  updated_at?: string; // 再編集時刻
}

export type ReferralStatus = 'pending' | 'completed';

export interface Referral {
  referrer_user_id: string;
  referred_user_id: string;
  status: ReferralStatus;
  completed_at: string | null;
}

/** 消費が引かれたバケット種別（SSOT §4.2 の優先順位）。 */
export type CreditKind = 'weekly_grant' | 'signup_bonus' | 'referral_bonus';
