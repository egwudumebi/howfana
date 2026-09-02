import { useMemo } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';

const AVATAR_PALETTE = [
  '#B85C38',
  '#D97D5A',
  '#9A4B2F',
  '#E9A88C',
  '#7A3A23',
  '#C4785A',
  '#5A2A18',
];

function colorForKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash + key.charCodeAt(i) * (i + 1)) % 997;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export function Avatar({
  name,
  uri,
  seed,
  size = 40,
  online,
  style,
}: {
  name?: string | null;
  uri?: string | null;
  seed?: string | null;
  size?: number;
  online?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const initial = (name?.trim()?.[0] || '?').toUpperCase();
  const bg = colorForKey(seed || name || initial);

  return (
    <View style={[{ width: size, height: size }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.divider,
          }}
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontWeight: '700',
              fontSize: size * 0.4,
            }}
          >
            {initial}
          </Text>
        </View>
      )}
      {online ? (
        <View
          style={[
            styles.onlineDot,
            {
              width: Math.max(10, size * 0.28),
              height: Math.max(10, size * 0.28),
              borderRadius: Math.max(5, size * 0.14),
              right: 0,
              bottom: 0,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    onlineDot: {
      position: 'absolute',
      backgroundColor: colors.online,
      borderWidth: 2,
      borderColor: colors.surface,
    },
  });
}
