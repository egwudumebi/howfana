import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { SoftPressable } from '@/components/SoftPressable';
import { useAppAlert } from '@/components/AppAlert';
import type { SponsoredAd } from '@/lib/ads/catalog';
import { usePremium } from '@/providers/PremiumProvider';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';
import { Radius, Space } from '@/theme/spacing';

export function AdCard({ ad }: { ad: SponsoredAd }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { alert } = useAppAlert();
  const { recordAdFeedback } = usePremium();

  const openMenu = () => {
    alert('Ad options', ad.advertiser, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'About this ad',
        onPress: () =>
          alert(
            'About this ad',
            `${ad.advertiser}\n\n${ad.headline}\n\nCategory: ${ad.category}\n\nAds help support Howfana. Businesses pay to appear here — Premium members still see ads.`,
          ),
      },
      {
        text: 'Why am I seeing this ad?',
        onPress: () => alert('Why this ad?', ad.targetingHint),
      },
      {
        text: 'Interested',
        onPress: () => {
          void recordAdFeedback(ad.id, 'interested');
          alert('Thanks', 'We’ll show more ads like this when we can.');
        },
      },
      {
        text: 'Not interested',
        onPress: () => {
          void recordAdFeedback(ad.id, 'not_interested');
          alert('Got it', 'We’ll hide this ad on this device.');
        },
      },
      {
        text: 'Report ad',
        style: 'destructive',
        onPress: () => {
          void recordAdFeedback(ad.id, 'reported');
          alert(
            'Ad reported',
            'Thanks — this was flagged as inappropriate or misleading on this device.',
          );
        },
      },
    ]);
  };

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Sponsored</Text>
        </View>
        <SoftPressable onPress={openMenu} hitSlop={10} accessibilityLabel="Ad menu">
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
        </SoftPressable>
      </View>
      <Text style={styles.advertiser}>{ad.advertiser}</Text>
      <Text style={styles.headline}>{ad.headline}</Text>
      <Text style={styles.body}>{ad.body}</Text>
      <SoftPressable style={styles.cta} onPress={openMenu}>
        <Text style={styles.ctaText}>{ad.cta}</Text>
      </SoftPressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.chrome,
      borderRadius: Radius.card,
      padding: Space.lg,
      gap: Space.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    badge: {
      backgroundColor: colors.surface,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radius.pill,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    advertiser: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.muted,
    },
    headline: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.title,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.text,
    },
    cta: {
      alignSelf: 'flex-start',
      marginTop: 4,
      backgroundColor: colors.accentSoft,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: Radius.pill,
    },
    ctaText: {
      color: colors.accent,
      fontWeight: '700',
      fontSize: 13,
    },
  });
}
