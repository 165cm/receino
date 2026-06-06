// server/src/util.ts
import { randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

/** 紹介コード（読みやすい8桁・大文字英数字）。SSOT §4.4。 */
export function newReferralCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい I,O,0,1 を除外
  let s = '';
  for (let i = 0; i < 8; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}
