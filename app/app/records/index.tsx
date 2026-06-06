// app/app/records/index.tsx — 記録一覧（全期間・タップで詳細・削除）SSOT §3.2
import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Pressable, Platform, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api } from '../../src/api';
import { Card } from '../../src/components';
import { colors, space } from '../../src/theme';

export default function Records() {
  const router = useRouter();
  const [data, setData] = useState<any | null>(null);

  const load = useCallback(() => {
    api.allReceipts().then(setData).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function remove(id: string, label: string) {
    const ok = Platform.OS === 'web'
      ? (typeof window !== 'undefined' && window.confirm ? window.confirm(`「${label}」を削除しますか？`) : true)
      : await new Promise<boolean>((res) =>
          Alert.alert('削除', `「${label}」を削除しますか？`, [
            { text: 'キャンセル', style: 'cancel', onPress: () => res(false) },
            { text: '削除', style: 'destructive', onPress: () => res(true) },
          ]),
        );
    if (!ok) return;
    try { await api.deleteReceipt(id); load(); } catch { /* ignore */ }
  }

  const receipts: any[] = (data?.receipts ?? []).slice().reverse();

  return (
    <ScrollView contentContainerStyle={styles.c}>
      <Text style={styles.month}>全期間 ・ {data?.count ?? 0}枚 ・ ¥{(data?.total ?? 0).toLocaleString()}</Text>
      {receipts.length === 0 && <Text style={styles.empty}>まだ記録がありません。レシートを撮ってみましょう。</Text>}
      {receipts.map((r) => (
        <Pressable key={r.id} onPress={() => router.push(`/records/${r.id}`)} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
          <Card>
            <View style={styles.row}>
              <Text style={styles.store}>{r.store || '(店名なし)'}{r.image_id ? ' 📷' : ''}</Text>
              <Text style={styles.total}>¥{r.total.toLocaleString()}</Text>
            </View>
            <Text style={styles.date}>{r.date}・{r.items.length}品目{r.store_address ? '・住所あり' : ''}</Text>
            <View style={styles.tags}>
              {Array.from(new Set(r.items.map((i: any) => i.category))).map((cat: any) => (
                <Text key={cat} style={styles.tag}>{cat}</Text>
              ))}
            </View>
            <View style={styles.actions}>
              <Text style={styles.detailHint}>タップで詳細・編集 ›</Text>
              <Pressable onPress={() => remove(r.id, r.store || r.date)} hitSlop={8} style={styles.delBtn}>
                <Text style={styles.delText}>削除</Text>
              </Pressable>
            </View>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c: { padding: space(2), paddingBottom: space(6) },
  month: { fontWeight: '800', color: colors.text, marginBottom: space(1.5), fontSize: 15 },
  empty: { color: colors.sub, textAlign: 'center', marginTop: space(4) },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  store: { fontWeight: '800', color: colors.text, fontSize: 16, flex: 1 },
  total: { fontWeight: '800', color: colors.text, fontSize: 16 },
  date: { color: colors.sub, fontSize: 12, marginTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 as any, marginTop: space(1) },
  tag: { backgroundColor: '#FFF0E8', color: colors.primaryDark, fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space(1) },
  detailHint: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  delBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  delText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
});
