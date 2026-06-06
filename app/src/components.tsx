// app/src/components.tsx
// 共通UI部品。
import React from 'react';
import { Text, View, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { reliability, RELIABILITY_DISCLAIMER, FREE_REACH_CAP } from '@taberec/core';
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

// 信頼度メーター（SSOT §6）。現在値 + 無料到達上限を薄く + 「試算」注記。
export function ReliabilityMeter({ n }: { n: number }) {
  const score = reliability(n);
  return (
    <View>
      <View style={styles.meterTrack}>
        <View style={[styles.meterCapGhost, { width: `${FREE_REACH_CAP}%` }]} />
        <View style={[styles.meterFill, { width: `${score}%` }]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={styles.meterLabel}>分析の信頼度 {score}%（{n}枚）</Text>
        <Text style={styles.meterCapLabel}>無料の目安 {FREE_REACH_CAP}%</Text>
      </View>
      <Text style={styles.disclaimer}>※ {RELIABILITY_DISCLAIMER}</Text>
    </View>
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
});
