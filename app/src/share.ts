// app/src/share.ts
// 招待リンクの生成と共有（Web Share API / クリップボード / ネイティブ Share）。SSOT §4.4。

import { Platform, Share } from 'react-native';

/** 招待リンク。Web は現在のオリジン、ネイティブ/本番は taberec.com。?ref=コードで被紹介者を判定。 */
export function buildInviteUrl(code: string): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/?ref=${encodeURIComponent(code)}`;
  }
  return `https://taberec.com/?ref=${encodeURIComponent(code)}`;
}

export function inviteMessage(code: string): string {
  const url = buildInviteUrl(code);
  return `食べレコで一緒に食費管理しない？このリンクから登録すると、お互いにスキャン5枚プレゼント🎁\n${url}`;
}

export type ShareResult = 'shared' | 'copied' | 'manual';

/**
 * 招待を共有する。
 * - ネイティブ: OSの共有シート。
 * - Web: navigator.share があればそれ、無ければクリップボードへコピー、最後の手段は manual。
 */
export async function shareInvite(code: string): Promise<{ result: ShareResult; url: string }> {
  const url = buildInviteUrl(code);
  const message = inviteMessage(code);

  if (Platform.OS !== 'web') {
    await Share.share({ message });
    return { result: 'shared', url };
  }

  const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav?.share) {
    try {
      await nav.share({ title: '食べレコ', text: message, url });
      return { result: 'shared', url };
    } catch {
      /* ユーザーキャンセル等 → コピーにフォールバック */
    }
  }
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(message);
      return { result: 'copied', url };
    } catch {
      /* 非セキュアコンテキスト(http)等でコピー不可 */
    }
  }
  return { result: 'manual', url };
}
