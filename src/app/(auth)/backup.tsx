import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import {
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppAlert } from '@/components/AppAlert';
import { normalizeRecoveryKey } from '@/lib/identity/store';
import { useIdentity } from '@/providers/IdentityProvider';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';

export default function BackupScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { alert } = useAppAlert();
  const { recoveryKeyFormatted } = useIdentity();
  const [confirmed, setConfirmed] = useState(false);
  const recoveryKey = recoveryKeyFormatted ?? '';

  const onShare = async () => {
    try {
      await Share.share({
        message: normalizeRecoveryKey(recoveryKey),
      });
    } catch {
      alert('Share failed', 'Copy the key manually from the box above.');
    }
  };

  const onContinue = () => {
    if (!confirmed) {
      alert(
        'Confirm backup',
        'Check the box to confirm you saved your recovery key.',
      );
      return;
    }
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.warnIcon}>
          <Ionicons name="shield-checkmark" size={28} color={colors.accent} />
        </View>
        <Text style={styles.title}>Save your recovery key</Text>
        <Text style={styles.sub}>
          This is the only way to sign in on another phone. Howfana cannot email a
          reset link.
        </Text>
      </View>

      <View style={styles.keyCard}>
        <Text style={styles.keyLabel}>Recovery key</Text>
        <Text style={styles.key} selectable>
          {recoveryKey || 'Unavailable'}
        </Text>
        <Pressable style={styles.shareBtn} onPress={() => void onShare()}>
          <Ionicons name="share-outline" size={18} color={colors.accent} />
          <Text style={styles.shareText}>Share / copy</Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.checkRow}
        onPress={() => setConfirmed((v) => !v)}
      >
        <View style={[styles.checkbox, confirmed && styles.checkboxOn]}>
          {confirmed ? (
            <Ionicons name="checkmark" size={16} color="#fff" />
          ) : null}
        </View>
        <Text style={styles.checkText}>
          I saved this recovery key in a safe place
        </Text>
      </Pressable>

      <Pressable
        style={[styles.primary, !confirmed && styles.disabled]}
        onPress={onContinue}
      >
        <Text style={styles.primaryText}>Continue to Howfana</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingHorizontal: 24,
      paddingTop: 24,
    },
    header: {
      gap: 10,
      marginBottom: 24,
    },
    warnIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
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
    keyCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      gap: 10,
    },
    keyLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.muted,
    },
    key: {
      fontFamily: Platform.select({
        ios: 'Menlo',
        android: 'monospace',
        default: 'monospace',
      }),
      fontSize: 14,
      lineHeight: 22,
      color: colors.text,
    },
    shareBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingVertical: 6,
    },
    shareText: {
      color: colors.accent,
      fontWeight: '700',
      fontSize: 14,
    },
    checkRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
      marginTop: 24,
      marginBottom: 16,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    checkboxOn: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    checkText: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      fontWeight: '500',
    },
    primary: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 'auto',
      marginBottom: 24,
    },
    primaryText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 16,
    },
    disabled: {
      opacity: 0.45,
    },
  });
}
