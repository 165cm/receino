// packages/core/src/household.ts
// 世帯構成 → 消費単位（成人換算）。分析の年間頻度の事前（taxonomy の typicalAnnual）を世帯規模で調整する。
// オンボは「人数のみ」（=全員大人とみなす）、設定で大人/子供/高齢者に細分化して微調整できる。SSOT §3.1。

/** 成人を1.0とした食品消費の換算係数（仮置き・実データで較正 §8）。家計調査の等価尺度の考え方に倣う。 */
export const ADULT_EQUIVALENT = { adults: 1, children: 0.6, elderly: 0.8 } as const;

/** typicalAnnual（年間購入回数の目安）が前提とする基準世帯の消費単位。約2人世帯を基準とする（仮置き）。 */
export const HOUSEHOLD_BASELINE_UNITS = 2;

/** 世帯規模スケールの下限/上限（事前を極端に振らないためのクランプ）。 */
export const HOUSEHOLD_SCALE_MIN = 0.5;
export const HOUSEHOLD_SCALE_MAX = 3;

export interface HouseholdComposition {
  adults: number; // 大人（13歳〜64歳目安）
  children: number; // 子供（〜12歳目安）
  elderly: number; // 高齢者（65歳〜目安）
}

/** 人数のみ（オンボ初期）から構成を作る。全員を大人として扱う。 */
export function compositionFromSize(size: number): HouseholdComposition {
  return { adults: Math.max(0, Math.round(size)), children: 0, elderly: 0 };
}

/** 構成 → 消費単位（成人換算の合計）。null/未設定は 0。 */
export function householdUnits(c: HouseholdComposition | null | undefined): number {
  if (!c) return 0;
  return (
    c.adults * ADULT_EQUIVALENT.adults +
    c.children * ADULT_EQUIVALENT.children +
    c.elderly * ADULT_EQUIVALENT.elderly
  );
}

/** 消費単位 → 事前頻度のスケール係数。基準世帯=1.0。未設定(0以下)は 1.0（=従来どおり調整なし）。 */
export function householdScale(units: number | null | undefined): number {
  if (!units || units <= 0) return 1;
  const raw = units / HOUSEHOLD_BASELINE_UNITS;
  return Math.min(HOUSEHOLD_SCALE_MAX, Math.max(HOUSEHOLD_SCALE_MIN, raw));
}
