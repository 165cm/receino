// app/app/records/[id].tsx — 記録の詳細・再編集・削除 SSOT §3.2
// 品目名=正式名(canonical)を編集、分類は中分類(L2)をリスト選択（L1・6分類も自動連動）。
import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, TextInput, Pressable, Image, ActivityIndicator, Platform, Alert, Modal } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { CATEGORIES, TAXONOMY, l1OfL2, categoryForL2 } from '@receino/core';
import { api, type DraftItem } from '../../src/api';
import { Card, Btn } from '../../src/components';
import { colors, space } from '../../src/theme';

interface Draftish {
  store: string; store_address?: string; store_phone?: string;
  date: string; items: DraftItem[]; total: number;
}

export default function ReceiptDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [image, setImage] = useState<string | null>(null);
  const [d, setD] = useState<Draftish | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null); // 中分類選択中の品目

  useFocusEffect(useCallback(() => {
    let alive = true;
    api.getReceipt(String(id)).then((res) => {
      if (!alive) return;
      setImage(res.image);
      const r = res.receipt;
      setD({ store: r.store ?? '', store_address: r.store_address, store_phone: r.store_phone, date: r.date ?? '', items: r.items ?? [], total: r.total ?? 0 });
    }).catch(() => {});
    return () => { alive = false; };
  }, [id]));

  function setItems(items: DraftItem[]) {
    setD((p) => p && ({ ...p, items, total: items.reduce((s, i) => s + i.amount, 0) }));
  }
  function patchItem(i: number, patch: Partial<DraftItem>) {
    if (!d) return;
    const items = [...d.items];
    items[i] = { ...items[i]!, ...patch };
    setItems(items);
  }
  function selectL2(l2: string) {
    if (pickerIndex == null) return;
    patchItem(pickerIndex, { l2, l1: l1OfL2(l2), category: categoryForL2(l2) ?? d!.items[pickerIndex]!.category });
    setPickerIndex(null);
  }

  async function save() {
    if (!d) return;
    setBusy(true);
    try {
      await api.updateReceipt(String(id), {
        store: d.store, store_address: d.store_address, store_phone: d.store_phone,
        date: d.date, total: d.total, items: d.items,
      });
      router.back();
    } catch (e: any) {
      Alert.alert('エラー', String(e?.message ?? e));
    } finally { setBusy(false); }
  }

  async function remove() {
    const ok = Platform.OS === 'web'
      ? (typeof window !== 'undefined' && window.confirm ? window.confirm('この記録を削除しますか？') : true)
      : await new Promise<boolean>((res) => Alert.alert('削除', '削除しますか？', [
          { text: 'キャンセル', style: 'cancel', onPress: () => res(false) },
          { text: '削除', style: 'destructive', onPress: () => res(true) },
        ]));
    if (!ok) return;
    try { await api.deleteReceipt(String(id)); router.back(); } catch { /* ignore */ }
  }

  if (!d) return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;

  return (
    <ScrollView contentContainerStyle={styles.c}>
      {image && <Image source={{ uri: image }} style={styles.image} resizeMode="contain" />}

      <Card>
        <Field label="店名" value={d.store} onChange={(v) => setD({ ...d, store: v })} />
        <Field label="日付（YYYY-MM-DD）" value={d.date} onChange={(v) => setD({ ...d, date: v })} />
        <Field label="店舗住所（任意・MAP用）" value={d.store_address ?? ''} onChange={(v) => setD({ ...d, store_address: v })} />
        <Field label="電話（任意）" value={d.store_phone ?? ''} onChange={(v) => setD({ ...d, store_phone: v })} />
      </Card>

      {d.items.map((it, i) => (
        <Card key={i}>
          <View style={styles.itemTop}>
            <TextInput
              value={it.canonical_name ?? it.name}
              placeholder="品目名（正式名）"
              onChangeText={(v) => patchItem(i, { canonical_name: v })}
              style={styles.nameInput}
            />
            <Pressable onPress={() => setItems(d.items.filter((_, idx) => idx !== i))} hitSlop={8} style={styles.rm}><Text style={styles.rmText}>✕</Text></Pressable>
          </View>
          <View style={styles.itemRow}>
            <Pressable onPress={() => setPickerIndex(i)} style={styles.chip}>
              <Text style={styles.chipText}>中分類: {it.l2 || '未分類'} ▾</Text>
            </Pressable>
            <View style={styles.amtBox}>
              <Text style={styles.yen}>¥</Text>
              <TextInput value={String(it.amount)} keyboardType="number-pad" onChangeText={(v) => patchItem(i, { amount: Number(v.replace(/[^0-9]/g, '')) || 0 })} style={styles.amtInput} />
            </View>
          </View>
        </Card>
      ))}
      <Btn label="＋ 品目を追加" variant="ghost" onPress={() => setItems([...d.items, { name: '', amount: 0, category: CATEGORIES[0] }])} />

      <View style={{ height: space(1) }} />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={styles.h}>合計</Text><Text style={styles.h}>¥{d.total.toLocaleString()}</Text>
        </View>
      </Card>

      <Btn label="変更を保存" onPress={save} loading={busy} />
      <View style={{ height: space(1) }} />
      <Btn label="この記録を削除" variant="danger" onPress={remove} />

      {/* 中分類リスト選択モーダル */}
      <Modal visible={pickerIndex != null} transparent animationType="slide" onRequestClose={() => setPickerIndex(null)}>
        <Pressable style={styles.modalBg} onPress={() => setPickerIndex(null)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>中分類を選択</Text>
            <Pressable onPress={() => setPickerIndex(null)} hitSlop={8}><Text style={styles.sheetClose}>閉じる</Text></Pressable>
          </View>
          <ScrollView style={{ maxHeight: 460 }}>
            {Object.entries(TAXONOMY).map(([l1, l2s]) => (
              <View key={l1}>
                <Text style={styles.l1Head}>{l1}</Text>
                <View style={styles.l2Wrap}>
                  {(l2s as string[]).map((l2) => {
                    const selected = pickerIndex != null && d.items[pickerIndex]?.l2 === l2;
                    return (
                      <Pressable key={l2} onPress={() => selectL2(l2)} style={[styles.l2Chip, selected && styles.l2ChipOn]}>
                        <Text style={[styles.l2ChipText, selected && styles.l2ChipTextOn]}>{l2}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ marginBottom: space(1) }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} style={styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { padding: space(2), paddingBottom: space(6) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  image: { width: '100%', height: 320, borderRadius: 14, backgroundColor: '#000', marginBottom: space(2) },
  h: { fontSize: 17, fontWeight: '800', color: colors.text },
  fieldLabel: { fontSize: 12, color: colors.sub, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text, backgroundColor: '#fff' },
  itemTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  nameInput: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 4 },
  rm: { marginLeft: 8, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  rmText: { color: colors.danger, fontSize: 16, fontWeight: '800' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chip: { backgroundColor: '#FFF0E8', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { color: colors.primaryDark, fontWeight: '700' },
  amtBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 8 },
  yen: { color: colors.sub, fontSize: 16 },
  amtInput: { minWidth: 80, paddingVertical: 8, fontSize: 16, textAlign: 'right', color: colors.text },
  modalBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: space(2), maxHeight: '80%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space(1) },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  sheetClose: { color: colors.primary, fontWeight: '700' },
  l1Head: { fontSize: 13, fontWeight: '800', color: colors.sub, marginTop: space(1.5), marginBottom: 4 },
  l2Wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 as any },
  l2Chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  l2ChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  l2ChipText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  l2ChipTextOn: { color: '#fff' },
});
