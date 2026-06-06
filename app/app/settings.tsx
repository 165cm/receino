// app/app/settings.tsx — 設定（プラン状態・登録・1タップ解約）SSOT §3.2 / §7
import React, { useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../src/store';
import { api } from '../src/api';
import { Card, Btn } from '../src/components';
import { tryClaimPendingReferral } from '../src/referral-link';
import { colors, space } from '../src/theme';

export default function Settings() {
  const router = useRouter();
  const { user, refresh } = useStore();
  const [busy, setBusy] = useState(false);

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

const styles = StyleSheet.create({
  c: { padding: space(2), paddingBottom: space(6) },
  label: { fontSize: 12, color: colors.sub, marginBottom: 4 },
  val: { fontSize: 16, fontWeight: '800', color: colors.text },
  sub: { color: colors.sub, fontSize: 12, marginTop: 4 },
});
