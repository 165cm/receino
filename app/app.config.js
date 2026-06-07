// app/app.config.js — app.json を拡張し、Web のベースパスをビルド時 env で切り替える。
// GitHub Pages のプロジェクトサイト（https://165cm.github.io/receino/）では EXPO_BASE_URL=/receino。
// ローカル開発・カスタムドメインのルート配信は未設定（=''）でよい。
// （app.json はそのまま `config` として渡ってくるので、必要箇所だけ上書きする）
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...(config.experiments || {}),
    baseUrl: process.env.EXPO_BASE_URL || '',
  },
});
