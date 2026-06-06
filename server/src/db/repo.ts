// server/src/db/repo.ts
// 永続化層の抽象 + インメモリ実装。
// MVPプレビュー用にインメモリだが、同インターフェースで Postgres 実装へ差し替え可能。
// SSOT §5.2 のスキーマに対応。

import { readFileSync, writeFileSync } from 'node:fs';
import type { CreditBucket, Receipt, Referral, User } from '@taberec/core';

/** 自前計測イベント。SSOT §8。 */
export interface AnalyticsEvent {
  user_id: string | null;
  type: string;
  props?: Record<string, unknown>;
  ts: string; // ISO8601
}

export interface Repo {
  // User
  createUser(u: User): User;
  getUser(id: string): User | undefined;
  getUserByReferralCode(code: string): User | undefined;
  updateUser(id: string, patch: Partial<User>): User;
  listUsers(): User[];

  // Analytics（§8）
  addEvent(e: AnalyticsEvent): void;
  listEvents(): AnalyticsEvent[];

  // CreditBucket
  getBucket(userId: string): CreditBucket | undefined;
  setBucket(userId: string, b: CreditBucket): void;

  // Receipt
  addReceipt(r: Receipt): Receipt;
  listReceiptsByMonth(userId: string, month: string): Receipt[]; // month="YYYY-MM"
  listReceipts(userId: string): Receipt[]; // 全期間
  getReceipt(userId: string, id: string): Receipt | undefined;
  updateReceipt(userId: string, id: string, patch: Partial<Receipt>): Receipt | undefined;
  deleteReceipt(userId: string, id: string): boolean;
  countReceipts(userId: string): number;

  // Referral
  addReferral(r: Referral): void;
  findReferral(referrer: string, referred: string): Referral | undefined;
  hasBeenReferred(referredUserId: string): boolean;
}

export class InMemoryRepo implements Repo {
  private users = new Map<string, User>();
  private buckets = new Map<string, CreditBucket>();
  private receipts: Receipt[] = [];
  private referrals: Referral[] = [];
  private events: AnalyticsEvent[] = [];

  // 任意のファイル永続化。path を渡すと再起動後もデータが残る（dev用）。
  // テストでは path 未指定＝完全インメモリ（相互に影響しない）。
  constructor(private persistPath?: string) {
    if (persistPath) this.load();
  }

  private load() {
    try {
      const d = JSON.parse(readFileSync(this.persistPath!, 'utf8'));
      this.users = new Map(d.users ?? []);
      this.buckets = new Map(d.buckets ?? []);
      this.receipts = d.receipts ?? [];
      this.referrals = d.referrals ?? [];
      this.events = d.events ?? [];
    } catch {
      /* 初回はファイルなし */
    }
  }

  private save() {
    if (!this.persistPath) return;
    try {
      writeFileSync(
        this.persistPath,
        JSON.stringify({
          users: [...this.users],
          buckets: [...this.buckets],
          receipts: this.receipts,
          referrals: this.referrals,
          events: this.events,
        }),
      );
    } catch {
      /* 書き込み失敗は致命ではない */
    }
  }

  createUser(u: User): User {
    this.users.set(u.id, u);
    this.save();
    return u;
  }
  getUser(id: string) {
    return this.users.get(id);
  }
  getUserByReferralCode(code: string) {
    for (const u of this.users.values()) if (u.referral_code === code) return u;
    return undefined;
  }
  updateUser(id: string, patch: Partial<User>): User {
    const cur = this.users.get(id);
    if (!cur) throw new Error(`user not found: ${id}`);
    const next = { ...cur, ...patch };
    this.users.set(id, next);
    this.save();
    return next;
  }
  listUsers(): User[] {
    return [...this.users.values()];
  }

  addEvent(e: AnalyticsEvent) {
    this.events.push(e);
    this.save();
  }
  listEvents(): AnalyticsEvent[] {
    return this.events;
  }

  getBucket(userId: string) {
    return this.buckets.get(userId);
  }
  setBucket(userId: string, b: CreditBucket) {
    this.buckets.set(userId, b);
    this.save();
  }

  addReceipt(r: Receipt): Receipt {
    this.receipts.push(r);
    this.save();
    return r;
  }
  listReceiptsByMonth(userId: string, month: string): Receipt[] {
    return this.receipts.filter(
      (r) => r.user_id === userId && r.date.startsWith(month),
    );
  }
  listReceipts(userId: string): Receipt[] {
    return this.receipts.filter((r) => r.user_id === userId);
  }
  getReceipt(userId: string, id: string): Receipt | undefined {
    return this.receipts.find((r) => r.id === id && r.user_id === userId);
  }
  updateReceipt(userId: string, id: string, patch: Partial<Receipt>): Receipt | undefined {
    const idx = this.receipts.findIndex((r) => r.id === id && r.user_id === userId);
    if (idx === -1) return undefined;
    const next = { ...this.receipts[idx]!, ...patch, id, user_id: userId };
    this.receipts[idx] = next;
    this.save();
    return next;
  }
  deleteReceipt(userId: string, id: string): boolean {
    const before = this.receipts.length;
    this.receipts = this.receipts.filter((r) => !(r.id === id && r.user_id === userId));
    const removed = this.receipts.length < before;
    if (removed) this.save();
    return removed;
  }
  countReceipts(userId: string): number {
    return this.receipts.filter((r) => r.user_id === userId).length;
  }

  addReferral(r: Referral) {
    this.referrals.push(r);
    this.save();
  }
  findReferral(referrer: string, referred: string) {
    return this.referrals.find(
      (r) => r.referrer_user_id === referrer && r.referred_user_id === referred,
    );
  }
  hasBeenReferred(referredUserId: string): boolean {
    return this.referrals.some((r) => r.referred_user_id === referredUserId);
  }
}
