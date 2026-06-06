// server/src/server.ts
// ローカル起動エントリ。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp } from './app.js';
import { createContext } from './context.js';
import { InMemoryRepo } from './db/repo.js';

// リポジトリルートの .env を読み込む（依存追加なしの簡易ローダ）。
// 例: ANTHROPIC_API_KEY=sk-ant-... / CLAUDE_MODEL=claude-opus-4-8
function loadEnv() {
  for (const p of ['../.env', '.env']) {
    try {
      const text = readFileSync(resolve(process.cwd(), p), 'utf8');
      for (const line of text.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const key = m[1]!;
        let val = m[2]!.trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
      // eslint-disable-next-line no-console
      console.log(`[env] loaded ${p}`);
      break;
    } catch {
      /* ファイルが無ければ無視 */
    }
  }
}

loadEnv();

const PORT = Number(process.env.PORT ?? 3001);

// dev用にファイル永続化（再起動してもユーザー/レシートが残る）。
const dataFile = process.env.DATA_FILE || resolve(process.cwd(), '../.data.json');
const repo = new InMemoryRepo(dataFile);
// eslint-disable-next-line no-console
console.log(`[db] persistence: ${dataFile}`);
const { app } = buildApp(createContext({ repo }));

app
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => {
    // eslint-disable-next-line no-console
    console.log(`🍱 食べレコ API listening on http://localhost:${PORT}`);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
