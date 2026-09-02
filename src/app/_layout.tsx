import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppAlertProvider } from '@/components/AppAlert';
import { DATABASE_NAME } from '@/lib/constants';
import '@/lib/crypto/setup';
import { migrate } from '@/lib/db/schema';
import { IdentityProvider } from '@/providers/IdentityProvider';
import { PeerProvider } from '@/providers/PeerProvider';
import { PremiumProvider } from '@/providers/PremiumProvider';
import { MessagingProvider } from '@/providers/MessagingProvider';
import { MediaProvider } from '@/providers/MediaProvider';
import { RelayProvider } from '@/providers/RelayProvider';
import { CallProvider } from '@/providers/CallProvider';
import { SocialProvider } from '@/providers/SocialProvider';
import { ThemeProvider, useColors, useTheme } from '@/providers/ThemeProvider';
import { CallOverlay } from '@/components/CallOverlay';

function LoadingBackdrop() {
  const colors = useColors();
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.centered,
        { backgroundColor: colors.bg },
      ]}
      pointerEvents="none"
    >
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

function RootStatusBar() {
  const { resolved } = useTheme();
  return <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />;
}

function AppTree() {
  const colors = useColors();
  return (
    <AppAlertProvider>
      <View style={[styles.fill, { backgroundColor: colors.bg }]}>
        <LoadingBackdrop />
        {/*
          Avoid useSuspense + Suspense around navigators — it races with
          expo-router linking and triggers "state update on unmounted" errors.
        */}
                        <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate}>
          <IdentityProvider>
            <PeerProvider>
              <PremiumProvider>
                <RelayProvider>
                  <SocialProvider>
                    <MediaProvider>
                      <MessagingProvider>
                        <CallProvider>
                          <RootStatusBar />
                          <Stack screenOptions={{ headerShown: false }}>
                            <Stack.Screen name="index" />
                            <Stack.Screen name="(auth)" />
                            <Stack.Screen name="(tabs)" />
                            <Stack.Screen name="people-nearby" />
                            <Stack.Screen name="notifications" />
                            <Stack.Screen name="settings" />
                          </Stack>
                          <CallOverlay />
                        </CallProvider>
                      </MessagingProvider>
                    </MediaProvider>
                  </SocialProvider>
                </RelayProvider>
              </PremiumProvider>
            </PeerProvider>
          </IdentityProvider>
        </SQLiteProvider>
      </View>
    </AppAlertProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppTree />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
