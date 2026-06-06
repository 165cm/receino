// app/app/index.tsx — ホーム（SSOT §3.2）
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useStore } from '../src/store';
import { api } from '../src/api';
import { isOnboarded } from '../src/onboarding';
import { Card, Btn, CreditBadge, ReliabilityMeter } from '../src/components';
import { colors, space } from '../src/theme';

function thisMonth() { return new Date().toISOString().slice(0, 7); }

export default function Home() {
  const router = useRouter();
  const { ready, user, credits, refresh } = useStore();
  const [monthKey, setMonthKey] = useState<string>(thisMonth());
  const [mData, setMData] = useState<{ total: number; count: number } | null>(null);

  // 初回はオンボーディングへ（完了フラグで2回目以降スキップ・SSOT §3.1）
  useEffect(() => {
    if (ready && !isOnboarded()) router.replace('/onboarding');
  }, [ready, router]);

  function shiftMonth(delta: number) {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
    setMonthKey(d.toISOString().slice(0, 7));
  }

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          await refresh();
          const m = await api.month(monthKey);
          if (alive) setMData({ total: m.total, count: m.count });
        } catch { /* ignore */ }
      })();
      return () => { alive = false; };
    }, [refresh, monthKey]),
  );

  if (!ready || !user || !credits || !isOnboarded()) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /><Text style={{ marginTop: 12, color: colors.sub }}>起動中…</Text></View>;
  }

  const premium = user.is_premium;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <View style={styles.monthRow}>
            <Pressable onPress={() => shiftMonth(-1)} hitSlop={10}><Text style={styles.navArrow}>◀</Text></Pressable>
            <Text style={styles.hello}>{monthKey === thisMonth() ? '今月' : monthKey} の食費</Text>
            <Pressable onPress={() => shiftMonth(1)} hitSlop={10}><Text style={styles.navArrow}>▶</Text></Pressable>
          </View>
          <Text style={styles.total}>¥{(mData?.total ?? 0).toLocaleString()}</Text>
          <Text style={styles.sub}>レシート {mData?.count ?? 0} 枚</Text>
        </View>
        <CreditBadge balance={credits.balance} premium={premium} />
      </View>

      {/* スキャンCTA */}
      <Card>
        <Text style={styles.cardTitle}>📸 撮るだけ3秒</Text>
        <Text style={styles.sub}>レシートを撮ると品目・カテゴリ・金額を自動でわけて記録します。</Text>
        <View style={{ height: space(1.5) }} />
        <Btn label="レシートを撮る" onPress={() => router.push(premium || credits.balance > 0 ? '/scan' : '/paywall')} />
        {!premium && (
          <Text style={styles.creditNote}>
            残り {credits.balance} 枚（週次{credits.buckets.weekly_remaining} / 初回{credits.buckets.signup_remaining} / 紹介{credits.buckets.referral_remaining}）
          </Text>
        )}
      </Card>

      {/* 信頼度メーター */}
      <Card>
        <ReliabilityMeter n={mData?.count ?? 0} />
      </Card>

      {/* ナビ */}
      <View style={styles.grid}>
        <Tile label="📊 分析" onPress={() => router.push('/analysis')} />
        <Tile label="🧾 記録一覧" onPress={() => router.push('/records')} />
        <Tile label="🎁 友達紹介" onPress={() => router.push('/referral')} />
        <Tile label="⚙️ 設定" onPress={() => router.push('/settings')} />
      </View>

      {!user.registered && (
        <Card style={{ borderColor: colors.primary }}>
          <Text style={styles.cardTitle}>アカウント登録で毎週+1枚</Text>
          <Text style={styles.sub}>登録すると週次クレジット（毎週1枚・日曜失効）が有効になります。</Text>
          <View style={{ height: space(1) }} />
          <Btn label="登録する" variant="ghost" onPress={() => router.push('/settings')} />
        </Card>
      )}
    </ScrollView>
  );
}

function Tile({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.8 : 1 }]}>
      <Text style={styles.tileText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: space(2), paddingBottom: space(6) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: space(2) },
  hello: { color: colors.sub, fontSize: 14 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 10 as any },
  navArrow: { color: colors.primary, fontSize: 16, fontWeight: '800' },
  total: { fontSize: 36, fontWeight: '900', color: colors.text },
  sub: { color: colors.sub, fontSize: 13 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 4 },
  creditNote: { marginTop: space(1), fontSize: 12, color: colors.sub, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1.5) as any, marginTop: space(1) },
  tile: { flexGrow: 1, flexBasis: '46%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: space(2), alignItems: 'center' },
  tileText: { fontSize: 16, fontWeight: '700', color: colors.text },
});
