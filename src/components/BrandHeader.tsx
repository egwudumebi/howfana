import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { HowfanaMark } from '@/components/HowfanaMark';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';

type BrandHeaderProps = {
  title?: string;
  onAction?: () => void;
  actionIcon?: keyof typeof Ionicons.glyphMap;
  actionDisabled?: boolean;
};

export function BrandHeader({
  title,
  onAction,
  actionIcon = 'sync-outline',
  actionDisabled,
}: BrandHeaderProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <View style={styles.brandRow}>
        <HowfanaMark size={30} />
        <Text style={[styles.brand, title ? styles.pageTitle : null]}>
          {title ?? 'Howfana'}
        </Text>
      </View>
      {onAction ? (
        <Pressable
          onPress={onAction}
          disabled={actionDisabled}
          style={[styles.iconBtn, actionDisabled && styles.disabled]}
          hitSlop={8}
        >
          <Ionicons name={actionIcon} size={22} color={colors.text} />
        </Pressable>
      ) : (
        <View style={styles.iconBtnPlaceholder} />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 8,
      backgroundColor: colors.chrome,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    brand: {
      fontSize: 26,
      fontWeight: '700',
      color: colors.accent,
      letterSpacing: -0.5,
    },
    pageTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.title,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBtnPlaceholder: {
      width: 40,
      height: 40,
    },
    disabled: {
      opacity: 0.4,
    },
  });
}
