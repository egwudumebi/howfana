import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { SoftPressable } from '@/components/SoftPressable';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';
import { Space } from '@/theme/spacing';

const TABS = ['All', 'Likes', 'Comments', 'Friend Requests', 'Mentions'] as const;

export default function NotificationsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <SoftPressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.title} />
        </SoftPressable>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 22 }} />
      </View>
      <View style={styles.tabs}>
        {TABS.map((tab, i) => (
          <View
            key={tab}
            style={[styles.tab, i === 0 && styles.tabActive]}
          >
            <Text style={[styles.tabText, i === 0 && styles.tabTextActive]}>
              {tab}
            </Text>
          </View>
        ))}
      </View>
      <EmptyState
        icon="notifications-outline"
        title="You’re all caught up"
        body="Likes, comments, and friend requests from people nearby will show up here."
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.screen,
      paddingBottom: Space.md,
    },
    title: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.title,
    },
    tabs: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
      paddingHorizontal: Space.screen,
      marginBottom: Space.lg,
    },
    tab: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.surface,
    },
    tabActive: {
      backgroundColor: colors.accentSoft,
    },
    tabText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.muted,
    },
    tabTextActive: {
      color: colors.accent,
    },
  });
}
