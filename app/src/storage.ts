// app/src/storage.ts
// 軽量ストレージ。Web は localStorage、それ以外はメモリ（MVPプレビュー用）。
// 本番RNは expo-secure-store / AsyncStorage に差し替える。

const mem = new Map<string, string>();

export const storage = {
  get(key: string): string | null {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
    return mem.get(key) ?? null;
  },
  set(key: string, value: string): void {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    else mem.set(key, value);
  },
  remove(key: string): void {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    else mem.delete(key);
  },
};
