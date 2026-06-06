// app/app/referral.tsx — 友達紹介（SSOT §4.4）
import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, TextInput, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '../src/api';
import { useStore } from '../src/store';
import { Card, Btn } from '../src/components';
import { shareInvite } from '../src/share';
import { colors, space } from '../src/theme';

export default function Referral() {
  const { user, refresh } = useStore();
  const [status, setStatus] = useState<any | null>(null);
  const [code, setCode] = useState('');
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  async function invite() {
    if (!user?.referral_code) return;
    const { result, url } = await shareInvite(user.referral_code);
    if (result === 'copied') setShareMsg(`招待リンクをコピーしました：${url}`);
    else if (result === 'manual') setShareMsg(`このリンクを送ってね：${url}`);
    else setShareMsg(null);
  }

  const load = useCallback(() => {
    api.referralStatus().then(setStatus).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function claim() {
    try {
      const r = await api.claimReferral(code.trim());
      await refresh();
      Alert.alert('紹介成立！', `あなたに +${r.granted_to_you}枚`);
      setCode('');
      load();
    } catch (e: any) {
      Alert.alert('適用できません', String(e?.message ?? e));
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.c}>
      <Card>
        <Text style={styles.h}>友達を招待して双方に +5枚</Text>
        <Text style={styles.sub}>友達が登録するとあなたと友達の両方に5枚。生涯{status?.lifetime_cap ?? 15}枚まで。</Text>
      </Card>

      <Card>
        <Text style={styles.label}>あなたの紹介コード</Text>
        <Text style={styles.code}>{user?.referral_code ?? status?.referral_code ?? '...'}</Text>
        <Text style={styles.sub}>
          獲得済み {status?.lifetime_granted ?? 0} / {status?.lifetime_cap ?? 15} 枚（残り{status?.remaining_cap ?? 0}）
        </Text>
        <View style={{ height: space(1.5) }} />
        <Btn label="招待リンクを送る" onPress={invite} />
        {shareMsg && <Text style={styles.note}>{shareMsg}</Text>}
      </Card>

      <Card>
        <Text style={styles.label}>紹介コードを入力（被紹介者）</Text>
        <TextInput value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" placeholder="ABCD1234" style={styles.input} />
        <View style={{ height: space(1) }} />
        <Btn label="コードを適用" onPress={claim} disabled={!code.trim()} />
        {!user?.registered && <Text style={styles.note}>※ 適用にはアカウント登録が必要です（設定から）</Text>}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c: { padding: space(2), paddingBottom: space(6) },
  h: { fontSize: 17, fontWeight: '800', color: colors.text },
  sub: { color: colors.sub, fontSize: 13, marginTop: 4 },
  label: { fontSize: 12, color: colors.sub, marginBottom: 6 },
  code: { fontSize: 32, fontWeight: '900', letterSpacing: 4, color: colors.primary },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, fontSize: 18, letterSpacing: 2, color: colors.text, backgroundColor: '#fff' },
  note: { color: colors.warn, fontSize: 12, marginTop: space(1), textAlign: 'center' },
});
