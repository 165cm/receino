// app/app/onboarding.tsx — 価値実証型オンボーディング（SSOT §3.1 全8ステップ）
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { api, type Draft } from '../src/api';
import { useStore } from '../src/store';
import { Btn, Card } from '../src/components';
import { colors, radius, space } from '../src/theme';
import {
  GOALS, BUDGET_RANGES, estimatedAnnualSaving, PREMIUM_YEARLY, setOnboarded, type Goal, type BudgetRange,
} from '../src/onboarding';
import { tryClaimPendingReferral } from '../src/referral-link';

const TOTAL = 8;
const ANALYZE_STEPS = ['読取', '抽出', '分類', '仕上げ'];

export default function Onboarding() {
  const router = useRouter();
  const { refresh } = useStore();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [budget, setBudget] = useState<BudgetRange | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [animIdx, setAnimIdx] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const startedRef = useRef(false);

  const next = () => setStep((s) => Math.min(s + 1, TOTAL - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  // ステップ4: 解析演出（段階表示）+ 実解析（モックOCR）
  useEffect(() => {
    if (step !== 4 || startedRef.current) return;
    startedRef.current = true;
    setAnimIdx(0);
    const timer = setInterval(() => setAnimIdx((i) => Math.min(i + 1, ANALYZE_STEPS.length - 1)), 400);
    (async () => {
      try {
        const r = await api.scan('ONBOARDING_SAMPLE');
        setDraft(r.draft);
      } catch {
        /* プレビューのモックは失敗しない想定 */
      } finally {
        setTimeout(() => { clearInterval(timer); setStep(5); }, 1700);
      }
    })();
    return () => clearInterval(timer);
  }, [step]);

  async function finish(startTrial: boolean) {
    setFinishing(true);
    try {
      // 完了時にスキャンしたレシートを本編へ保存（記録ゼロ回避・SSOT §3.1）。1枚消費。
      if (draft) {
        await api.saveReceipt({ store: draft.store, date: draft.date, total: draft.total, items: draft.items });
      }
      // ゴール＋月予算を保存しつつアカウント登録（週次付与を有効化）
      const reg = await api.register(goal?.label ?? '', budget?.mid);
      // 招待リンク(?ref=)経由なら成立を試みる（双方向+5）。SSOT §4.4。
      await tryClaimPendingReferral(reg.user.referred_by);
      if (startTrial) await api.subscribe(true);
      api.track('onboarding_completed', { goal: goal?.key, budget: budget?.key, started_trial: startTrial }); // §8
      setOnboarded();
      await refresh();
      router.replace('/');
    } catch {
      setFinishing(false);
    }
  }

  return (
    <View style={styles.root}>
      {/* 進捗バー */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((step + 1) / TOTAL) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {step === 0 && (
          <Center>
            <Text style={styles.logo}>🍱 食べレコ</Text>
            <Text style={styles.h1}>撮るだけ3秒、{'\n'}食費の正体がわかる。</Text>
            <Text style={styles.lead}>レシートを撮るとAIが品目・カテゴリ・金額を自動でわけて記録。手入力はもう不要です。</Text>
          </Center>
        )}

        {step === 1 && (
          <View>
            <Text style={styles.h2}>いちばんの目的は？</Text>
            <Text style={styles.sub}>あなたに合わせて提案します。</Text>
            {GOALS.map((g) => (
              <Choice key={g.key} selected={goal?.key === g.key} onPress={() => setGoal(g)} label={`${g.emoji}  ${g.label}`} />
            ))}
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={styles.h2}>月の食費はどのくらい？</Text>
            <Text style={styles.sub}>節約見込みの目安に使います。</Text>
            {BUDGET_RANGES.map((b) => (
              <Choice key={b.key} selected={budget?.key === b.key} onPress={() => setBudget(b)} label={b.label} />
            ))}
          </View>
        )}

        {step === 3 && (
          <Center>
            <Text style={styles.h2}>まずは1枚、撮ってみましょう</Text>
            <Text style={styles.lead}>“魔法の瞬間”を体験。プレビューではサンプルのレシートを解析します。{'\n'}（実機ではカメラで撮影できます）</Text>
            <View style={styles.receiptMock}><Text style={{ fontSize: 72 }}>🧾</Text></View>
          </Center>
        )}

        {step === 4 && (
          <Center>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.h2, { marginTop: space(2) }]}>AIが解析中…</Text>
            <View style={styles.animRow}>
              {ANALYZE_STEPS.map((s, i) => (
                <Text key={s} style={{ color: i <= animIdx ? colors.primary : colors.lock, fontWeight: '700' }}>
                  {i <= animIdx ? '●' : '○'} {s}
                </Text>
              ))}
            </View>
          </Center>
        )}

        {step === 5 && (
          <View>
            <Text style={styles.h2}>✨ できました！</Text>
            <Text style={styles.lead}>数秒で <Text style={styles.accent}>{draft?.items.length ?? 0}品目</Text> を自動で分類しました。</Text>
            <Card>
              <Text style={styles.store}>{draft?.store}　<Text style={styles.sub}>{draft?.date}</Text></Text>
              {draft?.items.map((it, i) => (
                <View key={i} style={styles.itemRow}>
                  <Text style={styles.itemName}>{it.name}</Text>
                  <Text style={styles.tag}>{it.category}</Text>
                  <Text style={styles.itemAmt}>¥{it.amount.toLocaleString()}</Text>
                </View>
              ))}
              <View style={styles.totalRow}><Text style={styles.totalLbl}>合計</Text><Text style={styles.totalVal}>¥{(draft?.total ?? 0).toLocaleString()}</Text></View>
            </Card>
          </View>
        )}

        {step === 6 && (
          <View>
            <Text style={styles.h2}>あなたの年間節約見込み</Text>
            <Card>
              <Text style={styles.bigSave}>¥{estimatedAnnualSaving(budget?.mid ?? 30000).toLocaleString()}<Text style={styles.perYear}> / 年</Text></Text>
              <Text style={styles.sub}>食費（{budget?.label ?? '2〜4万円'}）× 改善率の試算です。</Text>
              <View style={styles.vsRow}>
                <Text style={styles.vs}>プレミアム ¥{PREMIUM_YEARLY.toLocaleString()}/年 と比べても、見える化で十分に取り返せる試算。</Text>
              </View>
              <Text style={styles.disclaimer}>※ あくまで試算です（改善率は仮置き、実利用で変動します）。</Text>
            </Card>
          </View>
        )}

        {step === 7 && (
          <View>
            <Text style={styles.h2}>7日間、無料でお試し</Text>
            <Card>
              {['スキャン無制限', 'カテゴリ別分析', '月次レポート', '広告なし'].map((f) => <Text key={f} style={styles.feat}>✓ {f}</Text>)}
            </Card>
            <Card>
              <Text style={styles.tl}>今日　：全機能オープン</Text>
              <Text style={styles.tl}>5日目：課金前リマインド通知</Text>
              <Text style={styles.tl}>7日目：継続でご請求（¥500/月）</Text>
              <Text style={styles.disclaimer}>いつでも設定から1タップで解約できます。</Text>
            </Card>
          </View>
        )}
      </ScrollView>

      {/* フッターCTA */}
      <View style={styles.footer}>
        {step === 0 && <Btn label="はじめる" onPress={next} />}
        {step === 1 && <Btn label="次へ" onPress={next} disabled={!goal} />}
        {step === 2 && <Btn label="次へ" onPress={next} disabled={!budget} />}
        {step === 3 && <Btn label="サンプルを解析する" onPress={next} />}
        {step === 4 && <Text style={styles.waiting}>解析しています…</Text>}
        {step === 5 && <Btn label="すごい！次へ" onPress={next} />}
        {step === 6 && <Btn label="続ける" onPress={next} />}
        {step === 7 && (
          <>
            <Btn label="7日間無料で始める" onPress={() => finish(true)} loading={finishing} />
            <View style={{ height: space(1) }} />
            <Btn label="まずは無料で使う" variant="ghost" onPress={() => finish(false)} loading={finishing} />
          </>
        )}
        {step > 0 && step !== 4 && step !== 7 && (
          <Pressable onPress={back} style={styles.backBtn}><Text style={styles.backText}>戻る</Text></Pressable>
        )}
      </View>
    </View>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View style={styles.center}>{children}</View>;
}
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceSel]}>
      <Text style={[styles.choiceText, selected && styles.choiceTextSel]}>{label}</Text>
      {selected && <Text style={styles.check}>✓</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  progressTrack: { height: 6, backgroundColor: colors.line, marginTop: space(6), marginHorizontal: space(2), borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: colors.primary, borderRadius: 3 },
  body: { padding: space(3), flexGrow: 1, justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  logo: { fontSize: 28, fontWeight: '900', color: colors.primary, marginBottom: space(2) },
  h1: { fontSize: 30, fontWeight: '900', color: colors.text, textAlign: 'center', lineHeight: 40 },
  h2: { fontSize: 24, fontWeight: '900', color: colors.text, marginBottom: 6 },
  lead: { fontSize: 15, color: colors.sub, textAlign: 'center', marginTop: space(1.5), lineHeight: 22 },
  sub: { fontSize: 13, color: colors.sub, marginBottom: space(1.5) },
  accent: { color: colors.primary, fontWeight: '900' },
  choice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line, borderRadius: radius.md, padding: space(2), marginBottom: space(1.5) },
  choiceSel: { borderColor: colors.primary, backgroundColor: '#FFF4EE' },
  choiceText: { fontSize: 16, fontWeight: '700', color: colors.text },
  choiceTextSel: { color: colors.primaryDark },
  check: { color: colors.primary, fontWeight: '900', fontSize: 18 },
  receiptMock: { backgroundColor: '#2B2B2B', borderRadius: 20, width: 200, height: 240, alignItems: 'center', justifyContent: 'center', marginTop: space(3) },
  animRow: { flexDirection: 'row', gap: space(1.5) as any, marginTop: space(2), flexWrap: 'wrap', justifyContent: 'center' },
  store: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: space(1) },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line },
  itemName: { flex: 1, fontSize: 14, color: colors.text },
  tag: { fontSize: 11, color: colors.primaryDark, backgroundColor: '#FFF0E8', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginHorizontal: 6 },
  itemAmt: { fontSize: 14, fontWeight: '700', color: colors.text, minWidth: 64, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space(1), paddingTop: space(1), borderTopWidth: 2, borderTopColor: colors.line },
  totalLbl: { fontWeight: '800', color: colors.text }, totalVal: { fontWeight: '900', color: colors.text },
  bigSave: { fontSize: 40, fontWeight: '900', color: colors.good }, perYear: { fontSize: 18, color: colors.sub },
  vsRow: { marginTop: space(1.5) }, vs: { color: colors.text, fontSize: 14, lineHeight: 20 },
  disclaimer: { fontSize: 11, color: colors.sub, marginTop: space(1.5) },
  feat: { fontSize: 16, fontWeight: '600', color: colors.text, marginVertical: 4 },
  tl: { fontSize: 14, color: colors.text, marginVertical: 3 },
  footer: { padding: space(2), borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  backBtn: { alignItems: 'center', paddingVertical: space(1.5) }, backText: { color: colors.sub, fontSize: 14 },
  waiting: { textAlign: 'center', color: colors.sub, paddingVertical: space(1.5) },
});
