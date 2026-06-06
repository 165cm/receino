// server/src/context.ts
// 依存をまとめて各ルートへ注入する（テスト時に差し替え可能にするため）。

import { InMemoryRepo, type Repo } from './db/repo.js';
import { CreditService } from './services/credit-service.js';
import { MockOcrProvider, type OcrProvider } from './services/ocr-service.js';
import { mockBilling, type BillingProvider } from './services/billing-service.js';

export interface Context {
  repo: Repo;
  credits: CreditService;
  ocr: OcrProvider;
  billing: BillingProvider;
  now: () => Date; // テストで時刻を差し替えられるよう関数化
}

export function createContext(overrides: Partial<Context> = {}): Context {
  const repo = overrides.repo ?? new InMemoryRepo();
  return {
    repo,
    credits: overrides.credits ?? new CreditService(repo),
    ocr: overrides.ocr ?? new MockOcrProvider(),
    billing: overrides.billing ?? mockBilling,
    now: overrides.now ?? (() => new Date()),
  };
}
