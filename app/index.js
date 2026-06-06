// app/index.js
// モノレポでルートに hoist された expo-router を確実に解決するためのローカルエントリ。

// --- 開始: 修正箇所 - ブラウザ拡張(MetaMask等)由来の未処理エラーを無視する ---
// 一部のブラウザ拡張(MetaMask の inpage.js 等)は全ページに注入され、
// "Failed to connect to MetaMask" を未処理 Promise 拒否として投げる。
// これは食べレコと無関係だが RN-Web の LogBox が全画面エラーで覆ってしまうため、
// 拡張由来のものだけを抑止する（自前アプリのエラーはそのまま表示）。
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  const isExtensionNoise = (text) => {
    const s = String(text || '');
    return (
      s.includes('MetaMask') ||
      s.includes('Failed to connect to MetaMask') ||
      s.includes('chrome-extension://') ||
      s.includes('inpage.js')
    );
  };
  window.addEventListener(
    'unhandledrejection',
    (e) => {
      const reason = e && (e.reason?.stack || e.reason?.message || e.reason);
      if (isExtensionNoise(reason)) {
        e.preventDefault();
        e.stopImmediatePropagation && e.stopImmediatePropagation();
      }
    },
    true,
  );
  window.addEventListener(
    'error',
    (e) => {
      if (isExtensionNoise(e?.message) || isExtensionNoise(e?.filename) || isExtensionNoise(e?.error?.stack)) {
        e.preventDefault();
        e.stopImmediatePropagation && e.stopImmediatePropagation();
      }
    },
    true,
  );
}
// --- 終了: 修正箇所 ---

import 'expo-router/entry';
