// packages/core/src/constants.ts
// クレジット制の確定値。SSOT §4.1 / §4.4。

export const SIGNUP_BONUS = 5; // 初回起動の付与（1回のみ・失効なし）
export const WEEKLY_GRANT = 1; // 登録後の週次付与（週末失効）
export const REFERRAL_BONUS = 5; // 紹介成立時の双方向付与
export const REFERRAL_LIFETIME_CAP = 15; // 紹介者の生涯付与上限（=3件相当）

/** プレミアムの内部ソフト上限（乱用検知用・SSOT §4.2）。 */
export const PREMIUM_SOFT_MONTHLY_LIMIT = 1000;
