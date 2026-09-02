import { useMemo } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HowfanaMark } from '@/components/HowfanaMark';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';

/**
 * Howfana has no server passwords — "forgot password" maps to recovery-key help.
 */
export default function RecoverScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.safe}>
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
        <Text style={styles.title}>Forgot recovery key?</Text>
        <Text style={styles.sub}>
          Howfana does not use email passwords. Your account is a private key stored
          on your device. Without the recovery key, identity cannot be reset from
          a server.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="key-outline" size={20} color={colors.accent} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Have your recovery key?</Text>
            <Text style={styles.rowSub}>
              Sign in and paste the 64-character key you saved at signup.
            </Text>
          </View>
        </View>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: '#E7F8ED' }]}>
            <Ionicons name="phone-portrait-outline" size={20} color={colors.online} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Still on this phone?</Text>
            <Text style={styles.rowSub}>
              Open Menu to view or copy your recovery key while signed in.
            </Text>
          </View>
        </View>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: '#FDE8E8' }]}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Key lost forever?</Text>
            <Text style={styles.rowSub}>
              Create a new account. Your old posts and chats on other devices
              will not follow the new identity.
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={styles.primary}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.primaryText}>Sign in with recovery key</Text>
        </Pressable>
        <Pressable
          style={styles.secondary}
          onPress={() => router.push('/(auth)/register')}
        >
          <Text style={styles.secondaryText}>Create a new account</Text>
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
      marginBottom: 20,
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
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      gap: 16,
    },
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    icon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowText: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    rowSub: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.muted,
    },
    actions: {
      marginTop: 'auto',
      gap: 12,
      paddingBottom: 24,
      paddingTop: 24,
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
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
    },
    secondaryText: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 16,
    },
  });
}
