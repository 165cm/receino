// packages/core/src/taxonomy.ts
// 家庭の食品 3層タクソノミー（分析の粒度切替用）。固定6分類(categories.ts)とは別軸。
//  L1 大分類 → L2 中分類（固定）→ L3 品目（推定した正式名）。
// 設計基準: ①素材/加工 ②素材の種類 ③用途。L2はAIに固定リストから選ばせ表記揺れを防ぐ。

import type { Category } from './categories.js';

/** L1(大分類) → L2(中分類) の固定ツリー。 */
export const TAXONOMY: Record<string, string[]> = {
  肉類: ['鶏肉', '豚肉', '牛肉', 'ひき肉', '加工肉'],
  魚介類: ['鮮魚', '切り身', '貝・甲殻類', '魚介加工品'],
  野菜: ['葉茎野菜', '根菜', '果菜', 'きのこ', '豆・もやし'],
  果物: ['果物'],
  '卵・乳製品': ['卵', '牛乳', 'ヨーグルト', 'チーズ', 'バター・生クリーム'],
  主食: ['米', 'パン', '麺類', 'シリアル'],
  '加工食品・惣菜': ['惣菜', '冷凍食品', 'レトルト・缶詰', '豆腐・納豆', '漬物', '練り物'],
  '調味料・油': ['調味料', '食用油', 'だし・スープの素', '粉・乾物'],
  飲料: ['水・お茶', 'ジュース・炭酸', 'コーヒー・乳飲料'],
  '菓子・嗜好品': ['スナック菓子', 'チョコ・キャンディ', '和菓子', 'アイス', '嗜好品'],
  酒類: ['ビール・発泡酒', 'その他の酒'],
  '外食・中食': ['外食', 'テイクアウト・弁当'],
  その他: ['その他'],
};

export const L1_LIST = Object.keys(TAXONOMY);
export const L2_LIST = Object.values(TAXONOMY).flat();

const L2_TO_L1: Record<string, string> = {};
for (const [l1, l2s] of Object.entries(TAXONOMY)) for (const l2 of l2s) L2_TO_L1[l2] = l1;

export function l1OfL2(l2: string): string | undefined {
  return L2_TO_L1[l2];
}
export function isValidL2(l2: string | undefined | null): boolean {
  return !!l2 && l2 in L2_TO_L1;
}

/** 固定6分類 → L1 のフォールバック（旧データ/モックでL1/L2が無い場合）。 */
const CATEGORY_TO_L1: Record<Category, string> = {
  生鮮食品: '生鮮食品',
  '加工食品・惣菜': '加工食品・惣菜',
  飲料: '飲料',
  'お菓子・嗜好品': '菓子・嗜好品',
  '調味料・その他': '調味料・油',
  外食: '外食・中食',
};

// ───────────────────────── L2 推定辞書 ─────────────────────────
// AIのl2が欠落/無効なときの決定的フォールバック。既存データの遡及分類にも使う。
// ★順序が重要: 紛らわしい語（牛乳/卵 など）を、単漢字の肉(牛/豚/鶏)より先に置く。
// パターンは「文字列」で定義し new RegExp で構築（バンドラのcharset差異で正規表現リテラルが壊れるのを回避）。
const L2_KEYWORD_PATTERNS: [string, string][] = [
  // 卵・乳製品（"牛"乳が"牛"肉に誤分類されないよう肉より前）
  ['ヨーグルト|よーぐると', 'ヨーグルト'],
  ['チーズ|ちーず', 'チーズ'],
  ['バター|生クリーム|ホイップ', 'バター・生クリーム'],
  ['牛乳|ぎゅうにゅう|ミルク|みるく', '牛乳'],
  ['卵|たまご|玉子|タマゴ', '卵'],
  // 肉
  ['ひき肉|挽肉|ミンチ|そぼろ', 'ひき肉'],
  ['ハム|ベーコン|ソーセージ|ウイ?ンナー|サラミ', '加工肉'],
  ['鶏|とり肉|とりにく|チキン|手羽|ささみ|むね肉|もも肉|焼鳥|やきとり', '鶏肉'],
  ['豚|ぶた|ポーク|バラ肉|豚ロース|しゃぶ', '豚肉'],
  ['牛|ビーフ|和牛|カルビ|ハラミ', '牛肉'],
  // 魚介
  ['刺身|さしみ|サク|たたき|寿司|まぐろ|マグロ|サーモン|鮭|さけ|ぶり|あじ|さば|いわし', '切り身'],
  ['えび|エビ|いか|イカ|たこ|タコ|あさり|しじみ|貝|かに|カニ|ほたて', '貝・甲殻類'],
  ['ちくわ|かまぼこ|はんぺん|練り?物|さつま揚げ|干物|しらす|ツナ缶?', '魚介加工品'],
  ['魚|鮮魚', '鮮魚'],
  // 野菜・きのこ・豆
  ['きのこ|しめじ|えのき|まいたけ|しいたけ|エリンギ|なめこ', 'きのこ'],
  ['もやし|モヤシ|豆苗|納豆以外の豆|大豆|枝豆', '豆・もやし'],
  ['大根|人参|にんじん|玉ねぎ|たまねぎ|じゃがいも|ジャガ|ごぼう|れんこん|さつまいも|かぼちゃ', '根菜'],
  ['トマト|きゅうり|なす|ナス|ピーマン|パプリカ|ズッキーニ', '果菜'],
  ['キャベツ|レタス|ほうれん草|小松菜|ねぎ|ネギ|白菜|ブロッコリー|にら|青菜|野菜', '葉茎野菜'],
  // 果物
  ['りんご|バナナ|みかん|ぶどう|いちご|苺|キウイ|果物|フルーツ|メロン|桃', '果物'],
  // 主食
  ['米|こめ|ライス|ごはん|ご飯', '米'],
  ['パン|食パン|ロールパン|バゲット|クロワッサン', 'パン'],
  ['麺|うどん|そば|ラーメン|パスタ|スパゲ|焼きそば', '麺類'],
  ['シリアル|グラノーラ|コーンフレーク', 'シリアル'],
  // 加工・惣菜
  ['冷凍', '冷凍食品'],
  ['豆腐|納豆|とうふ', '豆腐・納豆'],
  ['漬物|キムチ|梅干|たくあん', '漬物'],
  ['惣菜|から?あげ|唐揚|コロッケ|天ぷら|弁当|サラダ|ロールキャベツ|餃子|ハンバーグ', '惣菜'],
  ['レトルト|カレー|缶詰|スープ|パスタソース', 'レトルト・缶詰'],
  // 調味料・油
  ['油|オイル|ごま油|オリーブ', '食用油'],
  ['だし|出汁|コンソメ|ブイヨン|鶏がら', 'だし・スープの素'],
  ['粉|小麦粉|片栗粉|パン粉|乾物|海苔|わかめ|ごま', '粉・乾物'],
  ['醤油|しょうゆ|味噌|みそ|塩|砂糖|酢|みりん|ソース|ケチャップ|マヨ|ドレッシング|調味', '調味料'],
  // 飲料
  ['水|お茶|緑茶|麦茶|ミネラルウォーター', '水・お茶'],
  ['ジュース|サイダー|コーラ|炭酸|果汁', 'ジュース・炭酸'],
  ['コーヒー|カフェ|乳酸菌|飲むヨーグルト|ドリンク', 'コーヒー・乳飲料'],
  // 菓子・嗜好
  ['アイス|ソフトクリーム|氷菓', 'アイス'],
  ['チョコ|キャンディ|あめ|飴|グミ|ガム', 'チョコ・キャンディ'],
  ['せんべい|まんじゅう|どら焼き|大福|和菓子', '和菓子'],
  ['ポテトチップス|スナック|ポップコーン|おかき|スナック菓子|菓子', 'スナック菓子'],
  // 酒
  ['ビール|発泡酒|チューハイ|ハイボール', 'ビール・発泡酒'],
  ['酒|ワイン|焼酎|日本酒|ウイスキー|梅酒', 'その他の酒'],
];

/** カタカナ→ひらがな。辞書照合時にカナ表記ゆれ（ギュウニュウ↔ぎゅうにゅう）を吸収するため。 */
function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
// パターンもひらがなへ畳んで構築 → 入力もひらがなへ畳んで照合（カナ/かなの差を無視）。
const L2_KEYWORDS: [RegExp, string][] = L2_KEYWORD_PATTERNS.map(([p, l2]) => [new RegExp(kataToHira(p)), l2]);

/** 品目名/正式名からL2を推定（辞書）。見つからなければ undefined。 */
export function inferL2(text: string | undefined | null): string | undefined {
  const t = kataToHira((text ?? '').normalize('NFKC'));
  if (!t) return undefined;
  for (const [re, l2] of L2_KEYWORDS) if (re.test(t)) return l2;
  return undefined;
}

/**
 * 表記ゆれ吸収のためのグルーピングキー。
 * NFKC（全角→半角・記号正規化）→小文字→括弧/サイズ/数量/コード除去→カタカナをひらがなへ畳む→記号除去。
 * 例: "ＭＯギュウニュウ" と "牛乳(1L)" は完全一致しないが、AIの canonical_name で吸収する前提の安全網。
 */
export function normalizeKey(s: string): string {
  let t = (s ?? '').normalize('NFKC').toLowerCase();
  t = t.replace(/[（(][^)）]*[)）]/g, ''); // 括弧書き
  t = t.replace(/\d+(\.\d+)?\s*(g|kg|ml|l|個|本|枚|パック|袋|缶|p|pc|pcs|入|玉|束)\b/gi, ''); // サイズ
  t = t.replace(/^[a-z]{1,3}(?=[ぁ-んァ-ヶ一-龯])/, ''); // 先頭のブランド略号(MO/TR等)
  t = t.replace(/\d+/g, ''); // 残った数字/コード
  t = t.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)); // カタカナ→ひらがな
  t = t.replace(/[\s\-・/,.。、*＊※]+/g, ''); // 記号
  return t.trim() || (s ?? '').trim();
}

// ───────── 一般的な年間購入回数（ベイズ事前の中心値） ─────────
// 大分類/中分類の年間頻度の「初期値」。実購入が増えるほど実績へ補正される（Gamma–Poisson情報事前）。
// 値はMVPの目安。実データ蓄積後に較正する。
export const TYPICAL_ANNUAL_L1: Record<string, number> = {
  肉類: 60, 魚介類: 30, 野菜: 80, 果物: 30, '卵・乳製品': 60, 主食: 50,
  '加工食品・惣菜': 60, '調味料・油': 24, 飲料: 50, '菓子・嗜好品': 40,
  酒類: 30, '外食・中食': 40, その他: 12,
  生鮮食品: 70, // 6分類フォールバック用
};

export const TYPICAL_ANNUAL_L2: Record<string, number> = {
  鶏肉: 24, 豚肉: 24, 牛肉: 18, ひき肉: 18, 加工肉: 24,
  鮮魚: 8, 切り身: 18, '貝・甲殻類': 8, 魚介加工品: 12,
  葉茎野菜: 40, 根菜: 30, 果菜: 30, きのこ: 20, '豆・もやし': 24,
  果物: 30,
  卵: 24, 牛乳: 36, ヨーグルト: 24, チーズ: 12, 'バター・生クリーム': 8,
  米: 8, パン: 40, 麺類: 24, シリアル: 8,
  惣菜: 30, 冷凍食品: 24, 'レトルト・缶詰': 18, '豆腐・納豆': 30, 漬物: 12, 練り物: 12,
  調味料: 18, 食用油: 6, 'だし・スープの素': 8, '粉・乾物': 10,
  '水・お茶': 30, 'ジュース・炭酸': 24, 'コーヒー・乳飲料': 24,
  スナック菓子: 24, 'チョコ・キャンディ': 18, 和菓子: 12, アイス: 18, 嗜好品: 8,
  'ビール・発泡酒': 30, その他の酒: 12,
  外食: 24, 'テイクアウト・弁当': 24,
  その他: 12,
};

/** その他フォールバック既定の年間頻度。 */
export const TYPICAL_ANNUAL_DEFAULT = 24;

// L1(大分類) → 固定6分類（会計・必需/嗜好判定用）。中分類を選ぶと6分類も連動。
const L1_TO_CATEGORY: Record<string, Category> = {
  肉類: '生鮮食品', 魚介類: '生鮮食品', 野菜: '生鮮食品', 果物: '生鮮食品', '卵・乳製品': '生鮮食品',
  主食: '加工食品・惣菜', '加工食品・惣菜': '加工食品・惣菜', '調味料・油': '調味料・その他',
  飲料: '飲料', '菓子・嗜好品': 'お菓子・嗜好品', 酒類: '飲料', '外食・中食': '外食', その他: '調味料・その他',
};
/** 中分類(L2) から 固定6分類 を導出。 */
export function categoryForL2(l2: string): Category | undefined {
  const l1 = l1OfL2(l2);
  return l1 ? L1_TO_CATEGORY[l1] : undefined;
}

export type Grain = 'l1' | 'l2' | 'item';

/** 粒度・キーに対する「一般的な年間購入回数」（事前の中心値）。item粒度や未知キーは undefined。 */
export function typicalAnnual(grain: Grain, key: string): number | undefined {
  if (grain === 'l1') return TYPICAL_ANNUAL_L1[key];
  if (grain === 'l2') return TYPICAL_ANNUAL_L2[key];
  return undefined;
}

export interface TaxonomyItemLike {
  name: string;
  canonical_name?: string;
  l1?: string;
  l2?: string;
  category: Category;
}

/** 指定粒度でのグルーピングキーを返す（フォールバックつき）。 */
export function grainKey(item: TaxonomyItemLike, grain: Grain): string {
  if (grain === 'item') {
    return (item.canonical_name?.trim() || item.name.trim() || '不明');
  }
  if (grain === 'l2') {
    if (isValidL2(item.l2)) return item.l2!;
    const inferred = inferL2(item.canonical_name || item.name); // 辞書で遡及分類
    return inferred ?? item.category; // 最後は6分類名
  }
  // l1
  if (item.l1 && L1_LIST.includes(item.l1)) return item.l1;
  if (isValidL2(item.l2)) return l1OfL2(item.l2!)!;
  const inferred = inferL2(item.canonical_name || item.name);
  if (inferred) return l1OfL2(inferred)!;
  return CATEGORY_TO_L1[item.category] ?? 'その他';
}
