// app/app/settings.tsx — 設定（プラン状態・登録・世帯構成・1タップ解約）SSOT §3.2 / §7
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Alert, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../src/store';
import { api, type HouseholdComposition } from '../src/api';
import { Card, Btn } from '../src/components';
import { tryClaimPendingReferral } from '../src/referral-link';
import { colors, space } from '../src/theme';

const EMPTY_HH: HouseholdComposition = { adults: 2, children: 0, elderly: 0 };

export default function Settings() {
  const router = useRouter();
  const { user, refresh } = useStore();
  const [busy, setBusy] = useState(false);
  const [hh, setHh] = useState<HouseholdComposition>(user?.household_composition ?? EMPTY_HH);
  const [hhBusy, setHhBusy] = useState(false);

  // ユーザー読込/更新に追従（初期表示・別画面からの戻り）。
  useEffect(() => {
    if (user?.household_composition) setHh(user.household_composition);
  }, [user?.household_composition]);

  async function register() {
    setBusy(true);
    try {
      const reg = await api.register('把握する');
      const granted = await tryClaimPendingReferral(reg.user.referred_by); // 招待リンク経由なら成立
      await refresh();
      Alert.alert('登録完了', granted ? `週次クレジット有効化 + 紹介で+${granted}枚🎁` : '週次クレジット（毎週+1枚）が有効になりました');
    } finally { setBusy(false); }
  }
  async function unsubscribe() {
    setBusy(true);
    try { await api.unsubscribe(); await refresh(); Alert.alert('解約しました', 'プレミアムを解約しました'); }
    finally { setBusy(false); }
  }

  function setMember(key: keyof HouseholdComposition, delta: number) {
    setHh((c) => ({ ...c, [key]: Math.max(0, Math.min(50, c[key] + delta)) }));
  }
  const totalPeople = hh.adults + hh.children + hh.elderly;
  async function saveHousehold() {
    if (totalPeople < 1) { Alert.alert('世帯構成', '少なくとも1人を設定してください'); return; }
    setHhBusy(true);
    try { await api.updateHousehold(hh); await refresh(); Alert.alert('保存しました', '世帯構成を分析に反映しました'); }
    finally { setHhBusy(false); }
  }

  return (
    <ScrollView contentContainerStyle={styles.c}>
      <Card>
        <Text style={styles.label}>プラン</Text>
        <Text style={styles.val}>{user?.is_premium ? 'プレミアム（¥500/月）' : '無料プラン'}</Text>
        {user?.trial_ends_at && <Text style={styles.sub}>トライアル終了: {new Date(user.trial_ends_at).toLocaleDateString()}</Text>}
      </Card>

      <Card>
        <Text style={styles.label}>アカウント</Text>
        <Text style={styles.val}>{user?.registered ? '登録済み（週次付与 有効）' : '未登録（DLのみ）'}</Text>
        {!user?.registered && (
          <>
            <View style={{ height: space(1) }} />
            <Btn label="アカウント登録（週次+1枚を有効化）" onPress={register} loading={busy} />
          </>
        )}
      </Card>

      <Card>
        <Text style={styles.label}>世帯構成</Text>
        <Text style={styles.sub}>食事の量に合わせて分析の想定量を調整します（合計 {totalPeople}人）。</Text>
        <View style={{ height: space(1) }} />
        <MemberRow label="大人" hint="13〜64歳" value={hh.adults} onMinus={() => setMember('adults', -1)} onPlus={() => setMember('adults', 1)} />
        <MemberRow label="子供" hint="〜12歳" value={hh.children} onMinus={() => setMember('children', -1)} onPlus={() => setMember('children', 1)} />
        <MemberRow label="高齢者" hint="65歳〜" value={hh.elderly} onMinus={() => setMember('elderly', -1)} onPlus={() => setMember('elderly', 1)} />
        <View style={{ height: space(1) }} />
        <Btn label="この構成で保存" onPress={saveHousehold} loading={hhBusy} disabled={totalPeople < 1} />
      </Card>

      <Card>
        <Text style={styles.label}>サブスクリプション</Text>
        {user?.is_premium ? (
          <Btn label="解約する（1タップ）" variant="danger" onPress={unsubscribe} loading={busy} />
        ) : (
          <Btn label="プレミアムを見る" variant="ghost" onPress={() => router.push('/paywall')} />
        )}
        <Text style={styles.sub}>いつでも解約OK。課金2日前に通知します。</Text>
      </Card>

      <Card>
        <Text style={styles.label}>接続先API</Text>
        <Text style={styles.sub}>{api.baseUrl}</Text>
        <Text style={styles.sub}>ユーザーID: {user?.id?.slice(0, 8)}…</Text>
      </Card>
    </ScrollView>
  );
}

function MemberRow({ label, hint, value, onMinus, onPlus }: {
  label: string; hint: string; value: number; onMinus: () => void; onPlus: () => void;
}) {
  return (
    <View style={styles.memberRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.memberLabel}>{label}</Text>
        <Text style={styles.memberHint}>{hint}</Text>
      </View>
      <Pressable onPress={onMinus} disabled={value <= 0} style={[styles.stepBtn, value <= 0 && styles.stepBtnDisabled]}>
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <Text style={styles.memberValue}>{value}</Text>
      <Pressable onPress={onPlus} style={styles.stepBtn}>
        <Text style={styles.stepBtnText}>＋</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { padding: space(2), paddingBottom: space(6) },
  label: { fontSize: 12, color: colors.sub, marginBottom: 4 },
  val: { fontSize: 16, fontWeight: '800', color: colors.text },
  sub: { color: colors.sub, fontSize: 12, marginTop: 4 },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space(1), borderTopWidth: 1, borderTopColor: colors.line },
  memberLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  memberHint: { fontSize: 11, color: colors.sub },
  memberValue: { minWidth: 32, textAlign: 'center', fontSize: 20, fontWeight: '900', color: colors.text },
  stepBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginHorizontal: 6 },
  stepBtnDisabled: { opacity: 0.35 },
  stepBtnText: { color: '#fff', fontSize: 22, fontWeight: '900', lineHeight: 24 },
});
