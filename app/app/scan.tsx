// app/app/scan.tsx — スキャン→解析→確認/修正→保存（SSOT §3.2 / §5.1 / §4.2）
import React, { useState } from 'react';
import { ScrollView, Text, View, StyleSheet, TextInput, Pressable, ActivityIndicator, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { CATEGORIES, type Category } from '@receino/core';
import { api, type Draft, type DraftItem } from '../src/api';
import { useStore } from '../src/store';
import { Card, Btn } from '../src/components';
import { shareInvite } from '../src/share';
import { colors, space } from '../src/theme';

type Phase = 'idle' | 'analyzing' | 'review' | 'saving' | 'done';
const STEPS = ['読取', '抽出', '分類', '仕上げ'];

export default function Scan() {
  const router = useRouter();
  const { user, setCredits, refresh } = useStore();
  const [phase, setPhase] = useState<Phase>('idle');
  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ base64: string; mediaType: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ score: number; n: number; balance: number } | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  function mediaTypeFromAsset(a: ImagePicker.ImagePickerAsset): string {
    if (a.mimeType) return a.mimeType;
    const u = (a.uri || '').toLowerCase();
    if (u.endsWith('.png')) return 'image/png';
    if (u.endsWith('.webp')) return 'image/webp';
    if (u.endsWith('.heic') || u.endsWith('.heif')) return 'image/heic';
    return 'image/jpeg';
  }

  // uri から base64 を取り出すフォールバック（Web/iOS Safari で base64 が空のとき）。
  async function base64FromUri(uri: string): Promise<{ base64: string; mediaType?: string }> {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error('read failed'));
      fr.readAsDataURL(blob);
    });
    const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
    return { base64, mediaType: blob.type || undefined };
  }

  // カメラ or ライブラリから実画像を取得（解析は明示ボタンで実行）。
  async function capture(useCamera: boolean) {
    setErr(null);
    try {
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { setErr('カメラの権限が必要です（設定から許可してください）'); return; }
      }
      const opts = { base64: true, quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images } as const;
      const result = useCamera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      // アップロード前にリサイズ＋JPEG化（容量削減で高速化・HEIC等を正規化）。
      try {
        if (asset.uri) {
          const m = await ImageManipulator.manipulateAsync(
            asset.uri,
            [{ resize: { width: 1500 } }],
            { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
          );
          if (m.base64) {
            setPreview(m.uri);
            setPicked({ base64: m.base64, mediaType: 'image/jpeg' });
            return;
          }
        }
      } catch {
        /* 失敗時は元画像にフォールバック */
      }

      let base64 = asset.base64 ?? '';
      let mediaType = mediaTypeFromAsset(asset);
      if (!base64 && asset.uri) {
        const f = await base64FromUri(asset.uri); // iOS Safari 等のフォールバック
        base64 = f.base64;
        if (f.mediaType) mediaType = f.mediaType;
      }
      if (!base64) { setErr('画像を取得できませんでした。別の写真でお試しください。'); return; }

      setPreview(asset.uri ?? null);
      setPicked({ base64, mediaType });
    } catch (e: any) {
      setErr('画像の取得でエラー: ' + String(e?.message ?? e));
    }
  }

  async function analyze(image: string, mediaType?: string) {
    setErr(null);
    setPhase('analyzing');
    setStepIdx(0);
    // 演出：段階表示（読取→抽出→分類→仕上げ）SSOT §3.1-5
    const timer = setInterval(() => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1)), 450);
    try {
      const r = await api.scan(image, mediaType);
      clearInterval(timer);
      setDraft(r.draft);
      setPhase('review');
    } catch (e: any) {
      clearInterval(timer);
      setPhase('idle');
      const msg = String(e?.message ?? e);
      if (e instanceof api.ApiError && e.status === 402) {
        router.replace('/paywall');
      } else if (e instanceof api.ApiError && e.status === 422) {
        setErr('読み取れませんでした。レシート全体が明るく写るように撮り直してください。');
      } else {
        setErr(msg);
      }
    }
  }

  function cycleCategory(idx: number) {
    if (!draft) return;
    const items = [...draft.items];
    const cur = CATEGORIES.indexOf(items[idx]!.category);
    const next = CATEGORIES[(cur + 1) % CATEGORIES.length]!;
    items[idx] = { ...items[idx]!, category: next };
    setDraft({ ...draft, items });
  }
  function editAmount(idx: number, v: string) {
    if (!draft) return;
    const items = [...draft.items];
    items[idx] = { ...items[idx]!, amount: Number(v.replace(/[^0-9]/g, '')) || 0 };
    setDraft({ ...draft, items, total: items.reduce((s, i) => s + i.amount, 0) });
  }
  function editName(idx: number, v: string) {
    if (!draft) return;
    const items = [...draft.items];
    items[idx] = { ...items[idx]!, name: v };
    setDraft({ ...draft, items });
  }
  function addItem() {
    if (!draft) return;
    setDraft({ ...draft, items: [...draft.items, { name: '', amount: 0, category: CATEGORIES[0] }] });
  }
  function removeItem(idx: number) {
    if (!draft) return;
    const items = draft.items.filter((_, i) => i !== idx);
    setDraft({ ...draft, items, total: items.reduce((s, i) => s + i.amount, 0) });
  }
  // 手入力で記録（写真なし・OCR失敗時のフォールバック）SSOT §3.2
  function startManual() {
    setErr(null);
    setDraft({ store: '', date: new Date().toISOString().slice(0, 10), items: [{ name: '', amount: 0, category: CATEGORIES[0] }], total: 0 });
    setPhase('review');
  }

  async function save() {
    if (!draft) return;
    setPhase('saving');
    try {
      const r = await api.saveReceipt({
        store: draft.store,
        store_address: draft.store_address,
        store_phone: draft.store_phone,
        date: draft.date,
        total: draft.total,
        items: draft.items,
        image: picked?.base64, // 実画像があれば一緒に保存
        mediaType: picked?.mediaType,
      });
      setCredits(r.credits);
      await refresh();
      // 保存成功 → 埋め込み招待つきの完了画面へ（SSOT §4.4）
      setSaved({ score: r.reliability.score, n: r.reliability.n, balance: r.credits.balance });
      setPhase('done');
    } catch (e: any) {
      setPhase('review');
      if (e instanceof api.ApiError && e.status === 402) router.replace('/paywall');
      else Alert.alert('エラー', String(e?.message ?? e));
    }
  }

  async function invite() {
    if (!user?.referral_code) return;
    const { result, url } = await shareInvite(user.referral_code);
    if (result === 'copied') setShareMsg(`招待リンクをコピーしました：${url}`);
    else if (result === 'manual') setShareMsg(`このリンクを友達に送ってね：${url}`);
    else setShareMsg(null);
  }

  // 保存完了 + 埋め込み招待（スキャン直後に「友達に+5枚あげる」）SSOT §4.4
  if (phase === 'done') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Card>
          <Text style={styles.doneTitle}>✅ 保存しました</Text>
          <Text style={styles.sub}>分析の信頼度 {saved?.score}%（{saved?.n}枚）{user?.is_premium ? '' : ` ・ 残り ${saved?.balance} 枚`}</Text>
        </Card>

        <Card style={{ borderColor: colors.primary, borderWidth: 2 }}>
          <Text style={styles.inviteTitle}>🎁 友達を誘って、二人に +5枚</Text>
          <Text style={styles.sub}>あなたの紹介コード <Text style={styles.code}>{user?.referral_code}</Text>。友達が登録するとお互いに5枚もらえます（生涯15枚まで）。</Text>
          <View style={{ height: space(1.5) }} />
          <Btn label="友達に +5枚あげる（招待を送る）" onPress={invite} />
          {shareMsg && <Text style={styles.shareMsg}>{shareMsg}</Text>}
        </Card>

        <Btn label="ホームへ戻る" variant="ghost" onPress={() => router.replace('/')} />
      </ScrollView>
    );
  }

  if (phase === 'idle') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Card>
          <Text style={styles.h}>レシートをAIで読み取る</Text>
          <Text style={styles.sub}>レシート全体が入るように撮影/選択してください。AIが品目・カテゴリ・金額を自動で構造化します。</Text>
        </Card>
        {preview ? (
          <Image source={{ uri: preview }} style={styles.preview} resizeMode="contain" />
        ) : (
          <View style={styles.cameraMock}><Text style={{ fontSize: 64 }}>🧾</Text></View>
        )}

        {err && <Text style={styles.err}>⚠️ {err}</Text>}

        {picked ? (
          // 写真が選択済み → 明示的に解析を実行
          <>
            <Btn label="🔍 この写真を解析する" onPress={() => analyze(picked.base64, picked.mediaType)} />
            <View style={{ height: space(1) }} />
            <Btn label="別の写真を選ぶ" variant="ghost" onPress={() => { setPicked(null); setPreview(null); }} />
          </>
        ) : (
          <>
            <Btn label="📷 カメラで撮る" onPress={() => capture(true)} />
            <View style={{ height: space(1) }} />
            <Btn label="🖼 ライブラリから選ぶ" variant="ghost" onPress={() => capture(false)} />
            <View style={{ height: space(1) }} />
            <Btn label="サンプルで試す" variant="ghost" onPress={() => analyze('BASE64_SAMPLE')} />
            <View style={{ height: space(1) }} />
            <Btn label="✏️ 手入力で追加（写真なし）" variant="ghost" onPress={startManual} />
            <Text style={styles.note}>※ サンプルは固定のレシートで動作確認用です。</Text>
          </>
        )}
      </ScrollView>
    );
  }

  if (phase === 'analyzing') {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.h, { marginTop: space(2) }]}>AIが解析中…</Text>
        <View style={{ flexDirection: 'row', gap: space(1) as any, marginTop: space(2) }}>
          {STEPS.map((s, i) => (
            <Text key={s} style={{ color: i <= stepIdx ? colors.primary : colors.lock, fontWeight: '700' }}>
              {i <= stepIdx ? '●' : '○'} {s}
            </Text>
          ))}
        </View>
      </View>
    );
  }

  // review / saving
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <Text style={styles.h}>確認・修正</Text>
        <Text style={styles.sub}>店名 / 日付 / 品目 / カテゴリ / 金額をチェックして保存。</Text>
      </Card>
      <Card>
        <Field label="店名" value={draft?.store ?? ''} onChange={(v) => draft && setDraft({ ...draft, store: v })} />
        <Field label="日付（購入日）" value={draft?.date ?? ''} onChange={(v) => draft && setDraft({ ...draft, date: v })} />
        <Text style={styles.dateHint}>※ YYYY-MM-DD。記録はこの日付の月に集計されます。</Text>
      </Card>
      {draft?.items.map((it, idx) => (
        <Card key={idx}>
          <View style={styles.itemTopRow}>
            <TextInput
              value={it.name}
              onChangeText={(v) => editName(idx, v)}
              placeholder="品目名"
              style={styles.nameInput}
            />
            <Pressable onPress={() => removeItem(idx)} hitSlop={8} style={styles.removeBtn}>
              <Text style={styles.removeText}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.itemRow}>
            <Pressable onPress={() => cycleCategory(idx)} style={styles.catChip}>
              <Text style={styles.catChipText}>{it.category} ▸</Text>
            </Pressable>
            <View style={styles.amountBox}>
              <Text style={styles.yen}>¥</Text>
              <TextInput
                value={String(it.amount)}
                onChangeText={(v) => editAmount(idx, v)}
                keyboardType="number-pad"
                style={styles.amountInput}
              />
            </View>
          </View>
        </Card>
      ))}
      <Btn label="＋ 品目を追加" variant="ghost" onPress={addItem} />
      <View style={{ height: space(1) }} />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={styles.h}>合計</Text>
          <Text style={styles.h}>¥{(draft?.total ?? 0).toLocaleString()}</Text>
        </View>
      </Card>
      <Btn
        label={user?.is_premium ? 'この内容で保存' : 'この内容で保存（1枚消費）'}
        onPress={save}
        loading={phase === 'saving'}
        disabled={!draft || draft.items.length === 0}
      />
      <View style={{ height: space(1) }} />
      <Btn label="やめる" variant="ghost" onPress={() => router.back()} />
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
  container: { padding: space(2), paddingBottom: space(6), flexGrow: 1 },
  h: { fontSize: 18, fontWeight: '800', color: colors.text },
  sub: { color: colors.sub, fontSize: 13, marginTop: 2 },
  cameraMock: { backgroundColor: '#2B2B2B', borderRadius: 18, height: 260, alignItems: 'center', justifyContent: 'center', marginVertical: space(2) },
  preview: { width: '100%', height: 280, borderRadius: 14, backgroundColor: '#000', marginVertical: space(2) },
  note: { color: colors.sub, fontSize: 11, textAlign: 'center', marginTop: space(1) },
  err: { color: colors.danger, fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: space(1.5) },
  itemName: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 6 },
  dateHint: { fontSize: 11, color: colors.sub, marginTop: -2 },
  itemTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  nameInput: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 4 },
  removeBtn: { marginLeft: 8, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.danger, fontSize: 16, fontWeight: '800' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catChip: { backgroundColor: '#FFF0E8', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  catChipText: { color: colors.primaryDark, fontWeight: '700' },
  amountBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 8 },
  yen: { color: colors.sub, fontSize: 16 },
  amountInput: { minWidth: 80, paddingVertical: 8, fontSize: 16, textAlign: 'right', color: colors.text },
  fieldLabel: { fontSize: 12, color: colors.sub, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text, backgroundColor: '#fff' },
  doneTitle: { fontSize: 20, fontWeight: '900', color: colors.good },
  inviteTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 4 },
  code: { fontWeight: '900', color: colors.primary, letterSpacing: 1 },
  shareMsg: { marginTop: space(1), fontSize: 12, color: colors.sub },
});
