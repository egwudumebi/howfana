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
import { useIdentity } from '@/providers/IdentityProvider';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';

export default function RegisterScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const nav = useRouter();
  const { alert } = useAppAlert();
  const { ready, isAuthenticated, hasKeys, register, completeProfile } =
    useIdentity();
  const [displayName, setDisplayName] = useState('');
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
    const trimmed = displayName.trim();
    if (!trimmed) {
      alert('Display name required', 'Choose a name friends will see nearby.');
      return;
    }
    setBusy(true);
    try {
      if (hasKeys) {
        await completeProfile(trimmed);
        router.replace('/(tabs)');
        return;
      }
      const { recoveryKey: _recoveryKey } = await register(trimmed);
      router.replace('/(auth)/backup');
    } catch (err) {
      alert(
        'Could not create account',
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
          <Text style={styles.title}>
            {hasKeys ? 'Finish your profile' : 'Create account'}
          </Text>
          <Text style={styles.sub}>
            {hasKeys
              ? 'Add a display name so nearby friends can recognize you.'
              : 'No email or password. Howfana creates a private key on this device.'}
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Display name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor={colors.muted}
            autoCapitalize="words"
            maxLength={40}
            autoFocus
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
              <Text style={styles.primaryText}>
                {hasKeys ? 'Continue' : 'Create account'}
              </Text>
            )}
          </Pressable>
        </View>

        {!hasKeys ? (
          <Pressable onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.link}>Already have a recovery key? Sign in</Text>
          </Pressable>
        ) : null}
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
      fontSize: 17,
      color: colors.text,
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
