import { useEffect, useMemo, useState } from 'react';
import { router, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppAlert } from '@/components/AppAlert';
import { HowfanaMark } from '@/components/HowfanaMark';
import { isValidRecoveryKey } from '@/lib/identity/store';
import { useIdentity } from '@/providers/IdentityProvider';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';

export default function LoginScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const nav = useRouter();
  const { alert } = useAppAlert();
  const { ready, isAuthenticated, login } = useIdentity();
  const [recoveryKey, setRecoveryKey] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && isAuthenticated) {
      nav.replace('/(tabs)');
    }
  }, [ready, isAuthenticated, nav]);

  if (!ready || isAuthenticated) {
    return (
      <View style={[styles.safe, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const onSubmit = async () => {
    if (!isValidRecoveryKey(recoveryKey)) {
      alert(
        'Invalid recovery key',
        'Paste the 64-character hex key you saved when you created your account.',
      );
      return;
    }
    setBusy(true);
    try {
      const { needsProfile } = await login(recoveryKey);
      router.replace(needsProfile ? '/(auth)/register' : '/(tabs)');
    } catch (err) {
      alert(
        'Sign in failed',
        err instanceof Error ? err.message : 'Unknown error',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.back}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(auth)/welcome');
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.accent} />
        </Pressable>

        <View style={styles.header}>
          <HowfanaMark size={40} />
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.sub}>
            Enter the recovery key from when you created your Howfana identity.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Recovery key</Text>
          <TextInput
            style={[styles.input, styles.mono]}
            value={recoveryKey}
            onChangeText={setRecoveryKey}
            placeholder="abcd 1234 …"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            textAlignVertical="top"
          />
          <Pressable
            style={[styles.primary, busy && styles.disabled]}
            disabled={busy}
            onPress={() => {
              void onSubmit();
            }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Sign in</Text>
            )}
          </Pressable>
        </View>

        <Pressable onPress={() => router.push('/(auth)/recover')}>
          <Text style={styles.link}>Forgot recovery key?</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    flex: {
      flex: 1,
      paddingHorizontal: 24,
    },
    back: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -8,
      marginTop: 4,
    },
    header: {
      gap: 10,
      marginTop: 12,
      marginBottom: 28,
    },
    title: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.text,
    },
    sub: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.muted,
    },
    form: {
      gap: 10,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.muted,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 15,
      color: colors.text,
      minHeight: 110,
    },
    mono: {
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
      lineHeight: 22,
    },
    primary: {
      marginTop: 8,
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
    disabled: {
      opacity: 0.55,
    },
    link: {
      marginTop: 24,
      textAlign: 'center',
      color: colors.accent,
      fontWeight: '600',
      fontSize: 14,
    },
  });
}
