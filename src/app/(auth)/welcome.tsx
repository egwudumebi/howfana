import { useEffect, useMemo } from 'react';
import { router, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HowfanaMark } from '@/components/HowfanaMark';
import { useIdentity } from '@/providers/IdentityProvider';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';

export default function WelcomeScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const nav = useRouter();
  const { ready, hasKeys, isAuthenticated } = useIdentity();

  useEffect(() => {
    if (!ready) return;
    if (isAuthenticated) {
      nav.replace('/(tabs)');
      return;
    }
    if (hasKeys) {
      nav.replace('/(auth)/register');
    }
  }, [ready, hasKeys, isAuthenticated, nav]);

  if (!ready || isAuthenticated || hasKeys) {
    return (
      <View style={[styles.safe, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.hero}>
        <View style={styles.markWrap}>
          <HowfanaMark size={72} />
        </View>
        <Text style={styles.brand}>Howfana</Text>
        <Text style={styles.tagline}>
          Local mesh social — your identity lives on this device, not a server.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={styles.primary}
          onPress={() => router.push('/(auth)/register')}
        >
          <Text style={styles.primaryText}>Create account</Text>
        </Pressable>
        <Pressable
          style={styles.secondary}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.secondaryText}>Sign in</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(auth)/recover')}>
          <Text style={styles.link}>Forgot recovery key?</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingHorizontal: 24,
      justifyContent: 'space-between',
    },
    centered: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 0,
    },
    hero: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
      paddingBottom: 24,
    },
    markWrap: {
      width: 96,
      height: 96,
      borderRadius: 28,
      backgroundColor: colors.chrome,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    brand: {
      fontSize: 40,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -1,
    },
    tagline: {
      fontSize: 16,
      lineHeight: 24,
      color: colors.muted,
      textAlign: 'center',
      maxWidth: 300,
    },
    actions: {
      gap: 12,
      paddingBottom: 24,
    },
    primary: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
    },
    primaryText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 16,
    },
    secondary: {
      backgroundColor: colors.chrome,
      borderWidth: 1.5,
      borderColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
    },
    secondaryText: {
      color: colors.accent,
      fontWeight: '700',
      fontSize: 16,
    },
    link: {
      textAlign: 'center',
      color: colors.accent,
      fontWeight: '600',
      fontSize: 14,
      paddingVertical: 8,
    },
  });
}
