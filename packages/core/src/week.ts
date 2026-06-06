// packages/core/src/week.ts
// 週キー算出。SSOT §4.3 / §9-1。
// 確定仕様: 週はユーザーTZの「月曜 0:00」起算。キーは ISO8601 週番号 "YYYY-Www"。
// 週起点は将来 config 化する想定（WEEK_START）。現状は月曜固定。

/** ユーザーTZでの暦日 (年/月/日) を取り出す。 */
function localCalendarDate(now: Date, tz: string): { y: number; m: number; d: number } {
  // en-CA は "YYYY-MM-DD" 形式を返すため分解が安定する。
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.format(now); // 例: "2026-06-03"
  const [y, m, d] = parts.split('-').map((s) => parseInt(s, 10));
  return { y: y!, m: m!, d: d! };
}

/**
 * 指定時刻・TZにおける ISO8601 週キー "YYYY-Www" を返す（月曜起算）。
 * 年跨ぎ（第1週=その年最初の木曜を含む週）も ISO 規約に従う。
 *
 * @example weekKey(new Date('2026-06-03T00:00:00Z'), 'Asia/Tokyo') // "2026-W23"
 */
export function weekKey(now: Date, tz: string): string {
  const { y, m, d } = localCalendarDate(now, tz);
  // 暦日のみで週計算するため UTC 基準の Date を組む（TZ二重適用を避ける）。
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = date.getUTCDay() || 7; // 月=1 .. 日=7
  // ISO: 週を代表する木曜へ寄せる。
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}
