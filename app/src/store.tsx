// app/src/store.tsx
// アプリ全体の表示状態（ユーザー・クレジット）。真実はサーバ、ここはキャッシュ。

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getUserId, type CreditView, type PublicUser } from './api';
import { capturePendingReferral } from './referral-link';

interface Store {
  ready: boolean;
  user: PublicUser | null;
  credits: CreditView | null;
  refresh: () => Promise<void>;
  setUser: (u: PublicUser) => void;
  setCredits: (c: CreditView) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [credits, setCredits] = useState<CreditView | null>(null);

  const refresh = useCallback(async () => {
    if (!getUserId()) return;
    const [me, c] = await Promise.all([api.me(), api.credits()]);
    setUser(me.user);
    setCredits(c);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        capturePendingReferral(); // ?ref= があれば保留（登録完了時に成立）
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';
        if (!getUserId()) {
          // 初回起動＝DL → signup +5（SSOT §4.1）
          const r = await api.createUser(tz);
          setUser(r.user);
          setCredits(r.credits);
        } else {
          await refresh();
        }
      } catch (e) {
        // サーバ未起動などはそのまま（画面側でハンドリング）
        // eslint-disable-next-line no-console
        console.warn('bootstrap failed', e);
      } finally {
        setReady(true);
      }
    })();
  }, [refresh]);

  return (
    <Ctx.Provider value={{ ready, user, credits, refresh, setUser, setCredits }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}
