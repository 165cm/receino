// app/src/components.tsx
// 共通UI部品。
import React, { useState } from 'react';
import { Text, View, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { reliabilityProgress, RELIABILITY_STAGES, RELIABILITY_DISCLAIMER, FREE_REACH_CAP } from '@receino/core';
import { colors, radius, space } from './theme';

// 円グラフ用の配色パレット。
export const PIE_COLORS = ['#FF7A45', '#2BB673', '#4C8DFF', '#E8B400', '#9B59B6', '#1ABC9C', '#E5719A', '#7F8C8D', '#D6C1A8'];

/** ドーナツ円グラフ。slices = [{ value, color }]。strokeDasharrayで各セグメントを描画。 */
export function Donut({ slices, size = 160, thickness = 26 }: { slices: { value: number; color: string }[]; size?: number; thickness?: number }) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  let offset = 0;
  return (
    <Svg width={size} height={size}>
      <G rotation={-90} origin={`${cx}, ${cx}`}>
        {/* 背景リング */}
        <Circle cx={cx} cy={cx} r={r} stroke={colors.line} strokeWidth={thickness} fill="none" />
        {total > 0 && slices.map((s, i) => {
          const frac = Math.max(0, s.value) / total;
          const seg = frac * c;
          const el = (
            <Circle
              key={i}
              cx={cx}
              cy={cx}
              r={r}
              stroke={s.color}
              strokeWidth={thickness}
              fill="none"
              strokeDasharray={`${seg} ${c - seg}`}
              strokeDashoffset={-offset}
            />
          );
          offset += seg;
          return el;
        })}
      </G>
    </Svg>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Btn({
  label, onPress, variant = 'primary', disabled, loading,
}: { label: string; onPress: () => void; variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; loading?: boolean }) {
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : 'transparent';
  const fg = variant === 'ghost' ? colors.primary : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, borderWidth: variant === 'ghost' ? 1.5 : 0, borderColor: colors.primary },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function CreditBadge({ balance, premium }: { balance: number; premium: boolean }) {
  return (
    <View style={[styles.badge, { backgroundColor: premium ? colors.good : balance > 0 ? colors.primary : colors.danger }]}>
      <Text style={styles.badgeText}>{premium ? '∞ プレミアム' : `クレジット ${balance}`}</Text>
    </View>
  );
}

// 段階 i の枚数レンジ表示（最終段は「N枚〜」）。
function stageRange(i: number): string {
  const cur = RELIABILITY_STAGES[i]!;
  const nxt = RELIABILITY_STAGES[i + 1];
  return nxt ? `${cur.minReceipts}〜${nxt.minReceipts - 1}枚` : `${cur.minReceipts}枚〜`;
}

// 信頼度パネル（SSOT §6）。メーター＋「くわしく」で“何枚必要か”の4段階ガイドをアコーディオン展開。
export function ReliabilityPanel({ n }: { n: number }) {
  const [open, setOpen] = useState(false);
  const p = reliabilityProgress(n);
  return (
    <Card>
      <Pressable onPress={() => setOpen((o) => !o)} hitSlop={6}>
        <View style={styles.meterTrack}>
          <View style={[styles.meterCapGhost, { width: `${FREE_REACH_CAP}%` }]} />
          <View style={[styles.meterFill, { width: `${p.score}%` }]} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <Text style={styles.meterLabel}>分析の信頼度 {p.score}%（{n}枚）</Text>
          <Text style={styles.calcToggle}>くわしく {open ? '▾' : '▸'}</Text>
        </View>
        {p.nextStage ? (
          <Text style={styles.nextNudge}>
            あと<Text style={styles.nextStrong}>{p.toNext}枚</Text>で「{p.nextStage.label}」（信頼度{p.nextStage.reliability}%目安）
          </Text>
        ) : n > 0 ? (
          <Text style={styles.nextNudge}>十分な枚数に到達しています👍</Text>
        ) : null}
      </Pressable>

      {open && (
        <View style={styles.ladder}>
          <Text style={styles.ladderTitle}>正しく分析するには何枚必要？</Text>
          {RELIABILITY_STAGES.map((s, i) => {
            const reached = n >= s.minReceipts;
            const current = i === p.stageIndex;
            return (
              <View key={s.key} style={[styles.stageRow, current && styles.stageRowCurrent]}>
                <Text style={[styles.stageMark, { color: reached ? colors.primary : colors.lock }]}>{reached ? '●' : '○'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stageLabel}>
                    {s.label}
                    <Text style={styles.stageRange}>　{stageRange(i)}・信頼度{s.reliability}%</Text>
                    {current && <Text style={styles.stageHere}>　← 今ここ</Text>}
                  </Text>
                  <Text style={styles.stageSummary}>{s.summary}</Text>
                </View>
              </View>
            );
          })}
          <Text style={styles.disclaimer}>※ {RELIABILITY_DISCLAIMER}</Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space(2), borderWidth: 1, borderColor: colors.line, marginBottom: space(1.5) },
  btn: { borderRadius: radius.lg, paddingVertical: space(1.5), paddingHorizontal: space(2.5), alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  btnText: { fontSize: 16, fontWeight: '700' },
  badge: { paddingHorizontal: space(1.5), paddingVertical: space(0.75), borderRadius: radius.lg },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  meterTrack: { height: 12, borderRadius: 6, backgroundColor: colors.line, overflow: 'hidden', justifyContent: 'center' },
  meterCapGhost: { position: 'absolute', height: 12, backgroundColor: '#FFE0D2' },
  meterFill: { position: 'absolute', height: 12, backgroundColor: colors.primary, borderRadius: 6 },
  meterLabel: { fontSize: 12, color: colors.text, fontWeight: '600' },
  meterCapLabel: { fontSize: 12, color: colors.sub },
  disclaimer: { fontSize: 11, color: colors.sub, marginTop: 4 },
  calcToggle: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  nextNudge: { fontSize: 12, color: colors.sub, marginTop: 6 },
  nextStrong: { fontWeight: '900', color: colors.primaryDark },
  ladder: { marginTop: space(1.5), borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space(1.5) },
  ladderTitle: { fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: space(1) },
  stageRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, paddingHorizontal: 8, borderRadius: radius.md },
  stageRowCurrent: { backgroundColor: '#FFF4EE' },
  stageMark: { width: 18, fontSize: 12, fontWeight: '900', marginTop: 1 },
  stageLabel: { fontSize: 13, fontWeight: '800', color: colors.text },
  stageRange: { fontSize: 11, fontWeight: '600', color: colors.sub },
  stageHere: { fontSize: 11, fontWeight: '800', color: colors.primaryDark },
  stageSummary: { fontSize: 12, color: colors.sub, marginTop: 2, lineHeight: 17 },
});
