// app/app/paywall.tsx — PayWall（SSOT §7。誠実な提示・ダークパターン不採用）
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../src/store';
import { api } from '../src/api';
import { Card, Btn } from '../src/components';
import { colors, space } from '../src/theme';

export default function Paywall() {
  const router = useRouter();
  const { refresh } = useStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.track('paywall_viewed'); }, []); // §8

  async function startTrial() {
    setLoading(true);
    try {
      await api.subscribe(true);
      await refresh();
      Alert.alert('プレミアム開始', '7日間の無料トライアルを開始しました');
      router.replace('/');
    } catch (e: any) {
      Alert.alert('エラー', String(e?.message ?? e));
    } finally { setLoading(false); }
  }

  return (
    <ScrollView contentContainerStyle={styles.c}>
      <Text style={styles.title}>プレミアムで食費をまるごと見える化</Text>
      <Card>
        {['スキャン無制限', 'カテゴリ別分析', '月次レポート', '広告なし'].map((f) => (
          <Text key={f} style={styles.feat}>✓ {f}</Text>
        ))}
      </Card>

      <Card>
        <Text style={styles.price}>¥500<Text style={styles.per}>/月</Text></Text>
        <Text style={styles.sub}>7日間無料 → 課金2日前に通知 → いつでも1タップ解約</Text>
        <View style={styles.timeline}>
          <Text style={styles.tl}>今日: 全機能オープン</Text>
          <Text style={styles.tl}>5日目: 課金前リマインド通知</Text>
          <Text style={styles.tl}>7日目: 継続でご請求（¥500）</Text>
        </View>
      </Card>

      <Btn label="7日間無料で始める" onPress={startTrial} loading={loading} />
      <View style={{ height: space(1) }} />
      <Btn label="あとで" variant="ghost" onPress={() => router.back()} />
      <Text style={styles.fine}>解約は設定からいつでも1タップ。無断更新の通知なしは行いません。</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c: { padding: space(2), paddingBottom: space(6) },
  title: { fontSize: 22, fontWeight: '900', color: colors.text, marginBottom: space(2), textAlign: 'center' },
  feat: { fontSize: 16, color: colors.text, fontWeight: '600', marginVertical: 4 },
  price: { fontSize: 40, fontWeight: '900', color: colors.primary },
  per: { fontSize: 16, color: colors.sub, fontWeight: '700' },
  sub: { color: colors.sub, fontSize: 13, marginTop: 4 },
  timeline: { marginTop: space(1.5), gap: 6 as any },
  tl: { color: colors.text, fontSize: 13 },
  fine: { color: colors.sub, fontSize: 11, textAlign: 'center', marginTop: space(2) },
});
