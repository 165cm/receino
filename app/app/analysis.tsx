// app/app/analysis.tsx — 分析。SSOT §3.2 / §7
// 2タブで「見込み（将来予測・ベイズ年間）」と「実績（これまでの実支出）」を切り分け。
// 円グラフ／ランキングは選択中タブの指標で揃える。粒度: 大分類/中分類/品目。
import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api, type AnalysisView, type RankingItem } from '../src/api';
import { useStore } from '../src/store';
import { Card, Btn, Donut, PIE_COLORS } from '../src/components';
import { colors, space } from '../src/theme';

const yen = (n: number) => `¥${(n ?? 0).toLocaleString()}`;
type Mode = 'forecast' | 'actual';
type Grain = 'l1' | 'l2' | 'item';

export default function Analysis() {
  const router = useRouter();
  const { user } = useStore();
  const [mode, setMode] = useState<Mode>('forecast'); // 既定=見込み
  const [grain, setGrain] = useState<Grain>('l1');
  const [showCalc, setShowCalc] = useState(false); // 計算方法アコーディオン（既定=閉）
  const [d, setD] = useState<AnalysisView | null>(null);

  useFocusEffect(useCallback(() => {
    let alive = true;
    api.analysis('all', undefined, grain).then((r) => alive && setD(r)).catch(() => {});
    return () => { alive = false; };
  }, [grain]));

  const premium = !!user?.is_premium;
  const sv = d?.savings;
  const pf = d?.portfolio;
  const grainLabel = grain === 'l1' ? '大分類' : grain === 'l2' ? '中分類' : '品目';
  const isForecast = mode === 'forecast';
  const metricLabel = isForecast ? '年間見込み' : '実績';

  // 指標（見込み=annual_spend / 実績=spend）でソートしてランキング・円グラフを作る。
  const groups: RankingItem[] = d?.groups ?? [];
  const valueOf = (g: RankingItem) => (isForecast ? g.annual_spend : g.spend);
  const sorted = [...groups].sort((a, b) => valueOf(b) - valueOf(a));
  const ranking = sorted.slice(0, 15);

  // 円グラフ（上位7＋その他に集約）
  const totalVal = sorted.reduce((s, g) => s + valueOf(g), 0);
  const TOPN = 7;
  const top = sorted.slice(0, TOPN);
  const pieSlices = top.map((g, i) => ({
    name: g.name, value: valueOf(g),
    pct: totalVal > 0 ? Math.round((valueOf(g) / totalVal) * 100) : 0,
    color: PIE_COLORS[i % PIE_COLORS.length]!,
  }));
  const restVal = sorted.slice(TOPN).reduce((s, g) => s + valueOf(g), 0);
  if (restVal > 0) {
    pieSlices.push({ name: `その他(${sorted.length - TOPN}件)`, value: restVal, pct: totalVal > 0 ? Math.round((restVal / totalVal) * 100) : 0, color: '#C9C2B8' });
  }

  return (
    <ScrollView contentContainerStyle={styles.c}>
      {/* 見込み / 実績 切替 */}
      <View style={styles.toggle}>
        <Pressable style={[styles.tab, isForecast && styles.tabOn]} onPress={() => setMode('forecast')}>
          <Text style={[styles.tabText, isForecast && styles.tabTextOn]}>見込み</Text>
        </Pressable>
        <Pressable style={[styles.tab, !isForecast && styles.tabOn]} onPress={() => setMode('actual')}>
          <Text style={[styles.tabText, !isForecast && styles.tabTextOn]}>実績</Text>
        </Pressable>
      </View>
      {/* タブ下の固定位置に説明＋計算方法トグル（位置はタブ切替で動かない） */}
      <View style={styles.captionRow}>
        <Text style={styles.modeCaption}>
          {isForecast ? '将来予測：年間の支出見込み（全データから予測）' : 'これまで：実際に記録した支出'}
        </Text>
        <Pressable onPress={() => setShowCalc((s) => !s)} hitSlop={8}>
          <Text style={styles.calcToggle}>計算方法 {showCalc ? '▾' : '▸'}</Text>
        </Pressable>
      </View>
      {showCalc && (
        <Card style={styles.calcCard}>
          {isForecast ? (
            <Text style={styles.calcText}>
              年間見込み＝<Text style={styles.calcB}>想定購入回数 × 想定単価</Text>。{'\n'}
              ・購入回数：Gamma–Poissonベイズ。大/中分類は「一般的な年間購入数」を初期値に、購入が増えるほど実績で補正。品目は実績回数ベース。{'\n'}
              ・単価：同カテゴリ平均へ縮小したNormal事後。{'\n'}
              ・総額：月次からNormalベイズで年間¥と95%信用区間を算出（月予算 {d?.annual.prior_mean ? yen(d.annual.prior_mean) : '—'} を事前、{d?.annual.months_observed ?? 0}ヶ月分・データ依存度 {Math.round((d?.annual.data_driven_ratio ?? 0) * 100)}%）。データが増えるほど精度が上がります。
            </Text>
          ) : (
            <Text style={styles.calcText}>
              実際に記録したレシートの金額をそのまま集計しています。{'\n'}
              必需＝生鮮・主食・調味料など／嗜好・贅沢＝お菓子・嗜好品・外食。
            </Text>
          )}
        </Card>
      )}

      {/* サマリー */}
      <Card>
        <Text style={styles.sub}>全期間（{d?.months_observed ?? 0}ヶ月分）・{d?.receipt_count ?? 0}枚・{d?.item_count ?? 0}点</Text>
        {isForecast ? (
          <>
            <Text style={styles.bigTotal}>{yen(d?.annual.estimate ?? 0)}<Text style={styles.unit}>/年</Text></Text>
            <Text style={styles.sub}>95%信用区間 {yen(d?.annual.low ?? 0)} 〜 {yen(d?.annual.high ?? 0)}</Text>
          </>
        ) : (
          <>
            <Text style={styles.bigTotal}>{yen(d?.period_total ?? 0)}</Text>
            <Text style={styles.sub}>実支出合計・月平均 {yen(sv?.projected_monthly ?? 0)}</Text>
          </>
        )}
        {sv?.target_monthly != null && (
          <Text style={[styles.pace, { color: (sv.over_budget_monthly ?? 0) > 0 ? colors.danger : colors.good }]}>
            目標 {yen(sv.target_monthly)}/月 に対し {(sv.over_budget_monthly ?? 0) > 0 ? `${yen(sv.over_budget_monthly!)} 超過ペース` : `${yen(Math.abs(sv.over_budget_monthly ?? 0))} 余裕`}
          </Text>
        )}
      </Card>

      {/* 本体（無料はロックでチラ見せ） */}
      <View style={styles.lockWrap}>
        <View style={!premium ? styles.blurred : undefined} pointerEvents={premium ? 'auto' : 'none'}>
          {/* ポートフォリオ（タブ指標に連動：見込み=年間¥ / 実績=実額¥。%は共通） */}
          {pf && (() => {
            const periodTotal = d?.period_total ?? 0;
            const annualEst = d?.annual.estimate ?? 0;
            const scale = isForecast && periodTotal > 0 ? annualEst / periodTotal : 1;
            const necAmt = Math.round(pf.necessity * scale);
            const disAmt = Math.round(pf.discretionary * scale);
            const headroom = isForecast ? Math.round((sv?.headroom_monthly ?? 0) * 12) : (sv?.headroom_monthly ?? 0);
            const hUnit = isForecast ? '/年' : '/月';
            return (
              <Card>
                <Text style={styles.cardH}>必需 vs 嗜好のバランス（{metricLabel}）</Text>
                <View style={styles.pfBar}>
                  <View style={[styles.pfNec, { flex: Math.max(pf.necessity, 0.001) }]} />
                  <View style={[styles.pfDis, { flex: Math.max(pf.discretionary, 0.001) }]} />
                </View>
                <View style={styles.pfLegend}>
                  <Text style={styles.pfNecText}>必需 {pf.necessity_pct}%（{yen(necAmt)}）</Text>
                  <Text style={styles.pfDisText}>嗜好/贅沢 {pf.discretionary_pct}%（{yen(disAmt)}）</Text>
                </View>
                <Text style={styles.insight}>💡 節約余地の目安 <Text style={styles.insightStrong}>{yen(headroom)}{hUnit}</Text>（嗜好の約3割を見直し）</Text>
              </Card>
            );
          })()}

          {/* 粒度切替 */}
          <Text style={styles.sectionTitle}>{metricLabel}支出の内訳</Text>
          <View style={styles.grainRow}>
            {([['l1', '大分類'], ['l2', '中分類'], ['item', '品目']] as const).map(([g, label]) => (
              <Pressable key={g} onPress={() => setGrain(g)} style={[styles.grainTab, grain === g && styles.grainTabOn]}>
                <Text style={[styles.grainText, grain === g && styles.grainTextOn]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.grainNote}>
            {isForecast
              ? (grain === 'item'
                  ? '※ 品目の見込みは購入実績の回数から推定（観測ベース）。'
                  : '※ 大/中分類は「一般的な年間購入数」を初期値に、購入が増えるほど実績で補正。')
              : '※ 実際に記録した支出額の合計です。'}
          </Text>

          {/* 円グラフ */}
          {pieSlices.length > 0 && (
            <Card>
              <Text style={styles.cardH}>{metricLabel}支出の構成（{grainLabel}）</Text>
              <View style={styles.donutRow}>
                <Donut slices={pieSlices.map((s) => ({ value: s.value, color: s.color }))} size={150} thickness={26} />
                <View style={styles.legend}>
                  {pieSlices.map((s, i) => (
                    <View key={i} style={styles.legendRow}>
                      <View style={[styles.dot, { backgroundColor: s.color }]} />
                      <Text style={styles.legendName} numberOfLines={1}>{s.name}</Text>
                      <Text style={styles.legendPct}>{s.pct}%</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Card>
          )}

          {/* ランキング */}
          <Text style={styles.sectionTitle}>{metricLabel}ランキング</Text>
          {ranking.length === 0 && <Card><Text style={styles.sub}>データがありません</Text></Card>}
          {ranking.map((it, i) => (
            <Card key={it.name + i}>
              <View style={styles.rankRow}>
                <Text style={styles.rankNo}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rankName}>{it.name}{grain === 'item' ? <Text style={styles.rankCat}> {it.category}</Text> : null}</Text>
                  {isForecast ? (
                    <Text style={styles.rankMeta}>想定 {it.annual_freq}回/年 × {yen(it.est_price)}（実績{it.count}{grain === 'item' ? '回' : '点'}）</Text>
                  ) : (
                    <Text style={styles.rankMeta}>実績{it.count}{grain === 'item' ? '回' : '点'}・平均{yen(it.avg_price)}{it.min_price < it.avg_price ? ` / 最安${yen(it.min_price)}` : ''}</Text>
                  )}
                </View>
                <Text style={styles.rankAnnual}>{isForecast ? `年${yen(it.annual_spend)}` : yen(it.spend)}</Text>
              </View>
              {isForecast && (
                <View style={styles.savingRow}>
                  <Text style={styles.saveTag}>単価-10%で年{yen(it.annual_saving_10pct)}減</Text>
                  {it.annual_saving_to_min > 0 && <Text style={styles.saveTag2}>最安購入で年{yen(it.annual_saving_to_min)}減</Text>}
                </View>
              )}
            </Card>
          ))}
        </View>

        {!premium && (
          <View style={styles.lockOverlay} pointerEvents="box-none">
            <Card style={styles.lockCard}>
              <Text style={styles.cardH}>🔒 詳しい分析はプレミアム</Text>
              <Text style={styles.sub}>効きランキング・ポートフォリオ・節約余地で“同じ満足を安く”。</Text>
              <View style={{ height: space(1.5) }} />
              <Btn label="プレミアムを見る（¥500/月）" onPress={() => router.push('/paywall')} />
            </Card>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c: { padding: space(2), paddingBottom: space(6) },
  toggle: { flexDirection: 'row', backgroundColor: colors.line, borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: space(1), alignItems: 'center', borderRadius: 9 },
  tabOn: { backgroundColor: '#fff' },
  tabText: { color: colors.sub, fontWeight: '700', fontSize: 14 },
  tabTextOn: { color: colors.primaryDark },
  captionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: space(1.5) },
  modeCaption: { fontSize: 11, color: colors.sub, flex: 1 },
  calcToggle: { fontSize: 12, color: colors.primary, fontWeight: '700', marginLeft: 8 },
  calcCard: { backgroundColor: '#FFF7F0' },
  calcText: { fontSize: 12, color: colors.text, lineHeight: 19 },
  calcB: { fontWeight: '800', color: colors.primaryDark },
  sub: { color: colors.sub, fontSize: 13, marginTop: 2 },
  cardH: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: space(1) },
  bigTotal: { fontSize: 32, fontWeight: '900', color: colors.text, marginTop: 2 },
  unit: { fontSize: 15, color: colors.sub, fontWeight: '700' },
  pace: { marginTop: space(1.5), fontSize: 13, fontWeight: '700' },
  lockWrap: { position: 'relative' },
  blurred: { opacity: 0.15 },
  lockOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  lockCard: { borderColor: colors.primary, borderWidth: 2, width: '92%' },
  pfBar: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.line },
  pfNec: { backgroundColor: colors.good },
  pfDis: { backgroundColor: colors.warn },
  pfLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  pfNecText: { color: colors.good, fontWeight: '700', fontSize: 12 },
  pfDisText: { color: colors.warn, fontWeight: '700', fontSize: 12 },
  insight: { marginTop: space(1.5), fontSize: 13, color: colors.text },
  insightStrong: { fontWeight: '900', color: colors.primaryDark },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: space(2), marginBottom: space(1) },
  grainRow: { flexDirection: 'row', gap: 6 as any, marginBottom: space(1) },
  grainTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
  grainTabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  grainText: { fontSize: 12, fontWeight: '700', color: colors.sub },
  grainTextOn: { color: '#fff' },
  grainNote: { fontSize: 11, color: colors.sub, marginBottom: space(1) },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) as any },
  legend: { flex: 1, gap: 4 as any },
  legendRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendName: { flex: 1, fontSize: 12, color: colors.text, fontWeight: '600' },
  legendPct: { fontSize: 12, color: colors.sub, fontWeight: '700' },
  rankRow: { flexDirection: 'row', alignItems: 'center' },
  rankNo: { width: 24, fontSize: 16, fontWeight: '900', color: colors.primary },
  rankName: { fontSize: 14, fontWeight: '800', color: colors.text },
  rankCat: { fontSize: 11, color: colors.sub, fontWeight: '600' },
  rankMeta: { fontSize: 11, color: colors.sub, marginTop: 2 },
  rankAnnual: { fontSize: 13, fontWeight: '800', color: colors.text, marginLeft: 6 },
  savingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 as any, marginTop: space(1) },
  saveTag: { fontSize: 11, color: colors.primaryDark, backgroundColor: '#FFF0E8', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, fontWeight: '700' },
  saveTag2: { fontSize: 11, color: colors.good, backgroundColor: '#E7F7EF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, fontWeight: '700' },
});
