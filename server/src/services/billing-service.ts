// server/src/services/billing-service.ts
// 課金/トライアルの抽象。SSOT §7 / §9-3 の差し替え点（本番は RevenueCat）。
// MVPプレビューはモック：subscribe でプレミアム化、トライアル方式は config フラグ。

export type TrialMode = 'opt_in_no_card' | 'opt_out_card_required'; // §9-3 未決→config化

export interface BillingProvider {
  trialMode: TrialMode;
  trialDays: number;
  monthlyPriceJpy: number;
}

export const mockBilling: BillingProvider = {
  trialMode: 'opt_in_no_card', // 既定（低成約・高流入）。本番で要検証
  trialDays: 7,
  monthlyPriceJpy: 500,
};
