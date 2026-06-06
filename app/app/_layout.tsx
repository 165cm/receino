// app/app/_layout.tsx
import React from 'react';
import { LogBox } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StoreProvider } from '../src/store';
import { colors } from '../src/theme';

// ライブラリ/ブラウザ拡張由来のノイズ警告を抑止（自前のログは残す）。
LogBox.ignoreLogs([
  'MetaMask',
  'Failed to connect to MetaMask',
  'props.pointerEvents is deprecated',
  '"shadow*" style props are deprecated',
]);

export default function RootLayout() {
  return (
    <StoreProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '800' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: '食べレコ' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="scan" options={{ title: 'レシートを撮る', presentation: 'modal' }} />
        <Stack.Screen name="records/index" options={{ title: '記録一覧' }} />
        <Stack.Screen name="records/[id]" options={{ title: '記録の詳細' }} />
        <Stack.Screen name="analysis" options={{ title: 'カテゴリ別分析' }} />
        <Stack.Screen name="referral" options={{ title: '友達紹介' }} />
        <Stack.Screen name="paywall" options={{ title: 'プレミアム', presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ title: '設定' }} />
      </Stack>
    </StoreProvider>
  );
}
