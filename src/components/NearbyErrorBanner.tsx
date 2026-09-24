import { useMemo } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { SoftPressable } from '@/components/SoftPressable';
import { parseNearbyError } from '@/lib/net/nearbyErrors';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';
import { Radius, Space } from '@/theme/spacing';

type NearbyErrorBannerProps = {
  message: string;
  onDismiss: () => void;
  onRetry?: () => void;
};

export function NearbyErrorBanner({
  message,
  onDismiss,
  onRetry,
}: NearbyErrorBannerProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const parsed = useMemo(() => parseNearbyError(message), [message]);

  return (
    <View style={styles.banner}>
      <View style={styles.iconWrap}>
        <Ionicons
          name={
            parsed.kind === 'permission'
              ? 'bluetooth-outline'
              : 'warning-outline'
          }
          size={18}
          color={colors.danger}
        />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{parsed.title}</Text>
        <Text style={styles.body}>{parsed.body}</Text>
        <View style={styles.actions}>
          {parsed.canRetry && onRetry ? (
            <SoftPressable style={styles.actionBtn} onPress={onRetry}>
              <Text style={styles.actionText}>Grant permission</Text>
            </SoftPressable>
          ) : null}
          {parsed.canOpenSettings ? (
            <SoftPressable
              style={styles.actionBtnGhost}
              onPress={() => {
                void Linking.openSettings();
              }}
            >
              <Text style={styles.actionTextGhost}>
                {Platform.OS === 'ios' ? 'Open Settings' : 'App settings'}
              </Text>
            </SoftPressable>
          ) : null}
        </View>
      </View>
      <SoftPressable style={styles.dismiss} onPress={onDismiss} hitSlop={8}>
        <Ionicons name="close" size={18} color={colors.muted} />
      </SoftPressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      marginTop: Space.sm,
      padding: Space.md,
      borderRadius: Radius.lg,
      backgroundColor: `${colors.danger}14`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${colors.danger}33`,
    },
    iconWrap: {
      marginTop: 2,
    },
    copy: {
      flex: 1,
      gap: 4,
    },
    title: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    body: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.muted,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
      marginTop: Space.xs,
    },
    actionBtn: {
      paddingHorizontal: Space.md,
      paddingVertical: 6,
      borderRadius: Radius.pill,
      backgroundColor: colors.accent,
    },
    actionText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '700',
    },
    actionBtnGhost: {
      paddingHorizontal: Space.md,
      paddingVertical: 6,
      borderRadius: Radius.pill,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    actionTextGhost: {
      color: colors.accent,
      fontSize: 13,
      fontWeight: '600',
    },
    dismiss: {
      padding: 2,
    },
  });
}
