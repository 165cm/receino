// app/src/store.tsx
// アプリ全体の表示状態（ユーザー・クレジット）。真実はサーバ、ここはキャッシュ。
// 起動は「サーバ起床（/health 連打）→ ユーザー確保」の順。Render 無料枠のコールドスタート対策。

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { api, getUserId, type CreditView, type PublicUser } from './api';
import { capturePendingReferral } from './referral-link';
import { colors, radius, space } from './theme';

interface Store {
  ready: boolean;
  user: PublicUser | null;
  credits: CreditView | null;
  refresh: () => Promise<void>;
  setUser: (u: PublicUser) => void;
  setCredits: (c: CreditView) => void;
  bootMsg: string;
  bootError: boolean;
  retryBoot: () => void;
}

const Ctx = createContext<Store | null>(null);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BOOT_HINT = '開発中のサーバーのため、初回の起動に最大1分ほどかかることがあります。';

/** サーバが起きるまで /health を再試行（最大 maxMs）。進捗を onProgress で通知。 */
async function wakeServer(onProgress: (s: string) => void, maxMs = 80_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      await api.health(12_000);
      return true;
    } catch {
      const sec = Math.round((Date.now() - start) / 1000);
      onProgress(`開発中のサーバーを起動しています…（約${sec}秒）`);
      await sleep(1500);
    }
  }
  return false;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [credits, setCredits] = useState<CreditView | null>(null);
  const [bootMsg, setBootMsg] = useState('起動中…');
  const [bootError, setBootError] = useState(false);
  const [bootNonce, setBootNonce] = useState(0);

  const refresh = useCallback(async () => {
    if (!getUserId()) return;
    const [me, c] = await Promise.all([api.me(), api.credits()]);
    setUser(me.user);
    setCredits(c);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setReady(false);
      setBootError(false);
      try {
        capturePendingReferral(); // ?ref= があれば保留（登録完了時に成立）
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';
        // 1) サーバ起床を待つ（コールドスタート中の createUser タイムアウトを防ぐ）
        const woke = await wakeServer((s) => alive && setBootMsg(s));
        if (!alive) return;
        if (!woke) throw new Error('server did not wake in time');
        // 2) ユーザー確保（初回は signup +5 / 既存は最新化）
        setBootMsg('準備しています…');
        if (!getUserId()) {
          const r = await api.createUser(tz);
          if (!alive) return;
          setUser(r.user);
          setCredits(r.credits);
        } else {
          await refresh();
        }
        if (alive) setReady(true);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('bootstrap failed', e);
        if (alive) setBootError(true);
      }
    })();
    return () => { alive = false; };
  }, [refresh, bootNonce]);

  const retryBoot = useCallback(() => {
    setBootError(false);
    setBootMsg('再接続しています…');
    setBootNonce((n) => n + 1);
  }, []);

  return (
    <Ctx.Provider value={{ ready, user, credits, refresh, setUser, setCredits, bootMsg, bootError, retryBoot }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}

/** 起動オーバーレイ。サーバ起床/ユーザー確保が済むまで全面に表示（初見の不安を回避）。 */
export function BootOverlay() {
  const { ready, bootError, bootMsg, retryBoot } = useStore();
  if (ready) return null;
  return (
    <View style={styles.overlay}>
      <Text style={styles.logo}>🧾 Receino</Text>
      {bootError ? (
        <>
          <Text style={styles.title}>サーバーに接続できませんでした</Text>
          <Text style={styles.hint}>{BOOT_HINT}{'\n'}少し待ってから再試行してください。</Text>
          <Pressable style={styles.retry} onPress={retryBoot}>
            <Text style={styles.retryText}>再試行</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: space(2) }} />
          <Text style={styles.title}>{bootMsg}</Text>
          <Text style={styles.hint}>{BOOT_HINT}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space(4), zIndex: 1000,
  },
  logo: { fontSize: 28, fontWeight: '900', color: colors.primary, marginBottom: space(1) },
  title: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'center' },
  hint: { fontSize: 13, color: colors.sub, textAlign: 'center', marginTop: space(1.5), lineHeight: 20 },
  retry: { marginTop: space(2.5), backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: space(1.5), paddingHorizontal: space(4) },
  retryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
