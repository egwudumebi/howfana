import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';
import { Radius, Space } from '@/theme/spacing';

type EmptyStateProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
};

export function EmptyState({
  icon = 'sparkles-outline',
  title,
  body,
  actionLabel,
  onAction,
  children,
}: EmptyStateProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={32} color={colors.accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
          onPress={onAction}
        >
          <Text style={styles.btnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
      {children}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.xxl,
      paddingVertical: Space.section,
      gap: Space.md,
    },
    iconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Space.sm,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.title,
      textAlign: 'center',
    },
    body: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.muted,
      textAlign: 'center',
    },
    btn: {
      marginTop: Space.sm,
      backgroundColor: colors.accent,
      paddingHorizontal: Space.xl,
      paddingVertical: Space.md,
      borderRadius: Radius.pill,
    },
    btnText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 14,
    },
    pressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }],
    },
  });
}
