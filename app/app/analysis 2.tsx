// app/app/analysis.tsx — カテゴリ別分析（プレミアム機能。無料はブラー＝チラ見せ）SSOT §3.2 / §7
import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api } from '../src/api';
import { useStore } from '../src/store';
import { Card, Btn } from '../src/components';
import { colors, space } from '../src/theme';

function prevMonthOf(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 2, 1)).toISOString().slice(0, 7);
}

export default function Analysis() {
  const router = useRouter();
  const { user } = useStore();
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [monthKey, setMonthKey] = useState<string>(thisMonth);
  const [data, setData] = useState<any | null>(null);
  const [prevTotal, setPrevTotal] = useState<number | null>(null);

  function shiftMonth(delta: number) {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
    setMonthKey(d.toISOString().slice(0, 7));
  }

  useFocusEffect(useCallback(() => {
    let alive = true;
    api.month(monthKey).then((m) => alive && setData(m)).catch(() => {});
    api.month(prevMonthOf(monthKey)).then((m) => alive && setPrevTotal(m.total)).catch(() => { if (alive) setPrevTotal(null); });
    return () => { alive = false; };
  }, [monthKey]));

  const premium = !!user?.is_premium;
  const total: number = data?.total ?? 0;
  const count: number = data?.count ?? 0;
  const itemCount: number = (data?.receipts ?? []).reduce((s: number, r: any) => s + (r.items?.length ?? 0), 0);
  const cats: [string, number][] = Object.entries(data?.by_category ?? {}).sort((a, b) => (b[1] as number) - (a[1] as number)) as [string, number][];

  // 前月比
  const diff = prevTotal != null ? total - prevTotal : null;
  const diffPct = prevTotal && prevTotal > 0 ? Math.round((diff! / prevTotal) * 100) : null;

  return (
    <ScrollView contentContainerStyle={styles.c}>
      <Card>
        <View style={styles.headRow}>
          <Pressable onPress={() => shiftMonth(-1)} hitSlop={10}><Text style={styles.nav}>◀</Text></Pressable>
          <Text style={styles.h}>{monthKey === thisMonth ? '今月' : monthKey}</Text>
          <Pressable onPress={() => shiftMonth(1)} hitSlop={10}><Text style={styles.nav}>▶</Text></Pressable>
        </View>
        <Text style={styles.bigTotal}>¥{total.toLocaleString()}</Text>
        <View style={styles.metaRow}>
          {diff != null ? (
            <Text style={[styles.delta, { color: diff > 0 ? colors.danger : diff < 0 ? colors.good : colors.sub }]}>
              前月比 {diff > 0 ? '▲' : diff < 0 ? '▼' : '±'}¥{Math.abs(diff).toLocaleString()}{diffPct != null ? `（${diff > 0 ? '+' : ''}${diffPct}%）` : ''}
            </Text>
          ) : <Text style={styles.metaSub}>前月データなし</Text>}
        </View>
        <View style={styles.statsRow}>
          <Stat label="レシート" value={`${count}枚`} />
          <Stat label="品目" value={`${itemCount}点`} />
          <Stat label="1枚あたり" value={`¥${count ? Math.round(total / count).toLocaleString() : 0}`} />
          <Stat label="1品目あたり" value={`¥${itemCount ? Math.round(total / itemCount).toLocaleString() : 0}`} />
        </View>
      </Card>

      <Text style={styles.sectionTitle}>カテゴリ別の内訳</Text>

      {/* カテゴリ内訳（無料はロックでチラ見せ） */}
      <View style={styles.lockWrap}>
        <View style={!premium ? styles.blurred : undefined} pointerEvents={premium ? 'auto' : 'none'}>
          {cats.length === 0 && <Card><Text style={styles.sub}>データがありません</Text></Card>}
          {cats.map(([name, v]) => {
            const pct = total > 0 ? Math.round((v / total) * 100) : 0;
            return (
              <Card key={name}>
                <View style={styles.row}>
                  <Text style={styles.cat}>{name}</Text>
                  <Text style={styles.amt}>¥{v.toLocaleString()} <Text style={styles.pct}>{pct}%</Text></Text>
                </View>
                <View style={styles.barTrack}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>
              </Card>
            );
          })}
        </View>

        {!premium && cats.length > 0 && (
          <View style={styles.lockOverlay} pointerEvents="box-none">
            <Card style={styles.lockCard}>
              <Text style={styles.h}>🔒 カテゴリ別分析はプレミアム</Text>
              <Text style={styles.sub}>どの分類にいくら使ったかを%で正確に把握。</Text>
              <View style={{ height: space(1.5) }} />
              <Btn label="プレミアムを見る（¥500/月）" onPress={() => router.push('/paywall')} />
            </Card>
          </View>
        )}
      </View>

      {!premium && cats.length === 0 && (
        <Card style={{ borderColor: colors.primary }}>
          <Text style={styles.h}>🔒 カテゴリ別分析はプレミアム機能</Text>
          <Text style={styles.sub}>レシートをためると、ここに分類別の内訳が出ます。</Text>
          <View style={{ height: space(1.5) }} />
          <Btn label="プレミアムを見る（¥500/月）" onPress={() => router.push('/paywall')} />
        </Card>
      )}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { padding: space(2), paddingBottom: space(6) },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h: { fontSize: 17, fontWeight: '800', color: colors.text },
  nav: { color: colors.primary, fontSize: 18, fontWeight: '800' },
  sub: { color: colors.sub, fontSize: 13, marginTop: 2 },
  bigTotal: { fontSize: 34, fontWeight: '900', color: colors.text, marginTop: space(1) },
  metaRow: { marginTop: 2 },
  delta: { fontSize: 14, fontWeight: '700' },
  metaSub: { fontSize: 13, color: colors.sub },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space(1.5), gap: 6 as any },
  stat: { flex: 1, alignItems: 'center', backgroundColor: '#FFF4EE', borderRadius: 10, paddingVertical: space(1) },
  statValue: { fontSize: 15, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.sub, marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: space(2), marginBottom: space(1) },
  lockWrap: { position: 'relative' },
  blurred: { opacity: 0.15 },
  lockOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  lockCard: { borderColor: colors.primary, borderWidth: 2, width: '92%' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' },
  cat: { fontWeight: '700', color: colors.text },
  amt: { fontWeight: '700', color: colors.text },
  pct: { color: colors.sub, fontSize: 12, fontWeight: '700' },
  barTrack: { height: 10, backgroundColor: colors.line, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: 10, backgroundColor: colors.primary, borderRadius: 5 },
});
