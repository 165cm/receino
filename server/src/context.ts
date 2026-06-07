// server/src/context.ts
// 依存をまとめて各ルートへ注入する（テスト時に差し替え可能にするため）。

import { InMemoryRepo, type Repo } from './db/repo.js';
import { CreditService } from './services/credit-service.js';
import { ClaudeOcrProvider, GoogleOcrProvider, MockOcrProvider, type OcrProvider } from './services/ocr-service.js';
import { mockBilling, type BillingProvider } from './services/billing-service.js';

// 本物のAI解析の選択順: Google Gemini → Claude → モック。
function defaultOcr(): OcrProvider {
  const googleKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (googleKey) {
    // eslint-disable-next-line no-console
    console.log('[ocr] Google Gemini を使用 (model=' + (process.env.GEMINI_MODEL || 'gemini-2.5-flash') + ')');
    return new GoogleOcrProvider(googleKey);
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    // eslint-disable-next-line no-console
    console.log('[ocr] Claude Vision を使用 (model=' + (process.env.CLAUDE_MODEL || 'claude-opus-4-8') + ')');
    return new ClaudeOcrProvider(anthropicKey);
  }
  // eslint-disable-next-line no-console
  console.log('[ocr] APIキー未設定のためモックOCRを使用（GEMINI_API_KEY を設定すると実解析）');
  return new MockOcrProvider();
}

/** テスト公開向けの簡易ガード設定（security.ts）。env から読み込む。 */
export interface SecurityConfig {
  premiumAccessCode: string | null; // /subscribe に必要な共有パスワード（null=ゲート無効）
  dailyOcrLimit: number | null; // 1日あたりの実OCR呼び出し上限（null=無制限）
}

export interface Context {
  repo: Repo;
  credits: CreditService;
  ocr: OcrProvider;
  billing: BillingProvider;
  now: () => Date; // テストで時刻を差し替えられるよう関数化
  security: SecurityConfig;
  ocrUsage: { day: string; count: number }; // 日次OCRカウンタ（プロセス内・簡易）
}

function defaultSecurity(): SecurityConfig {
  const raw = process.env.DAILY_OCR_LIMIT ? Number(process.env.DAILY_OCR_LIMIT) : NaN;
  return {
    premiumAccessCode: process.env.PREMIUM_ACCESS_CODE || null,
    dailyOcrLimit: Number.isFinite(raw) && raw > 0 ? raw : null,
  };
}

export function createContext(overrides: Partial<Context> = {}): Context {
  const repo = overrides.repo ?? new InMemoryRepo();
  return {
    repo,
    credits: overrides.credits ?? new CreditService(repo),
    ocr: overrides.ocr ?? defaultOcr(),
    billing: overrides.billing ?? mockBilling,
    now: overrides.now ?? (() => new Date()),
    security: overrides.security ?? defaultSecurity(),
    ocrUsage: overrides.ocrUsage ?? { day: '', count: 0 },
  };
}
