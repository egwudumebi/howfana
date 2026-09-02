import { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useRouter, type Href } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';

import { SoftPressable } from '@/components/SoftPressable';
import type { FeedPost } from '@/lib/db/social';
import { safePause, safePlay } from '@/lib/media/safeVideo';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';
import { Radius, Space } from '@/theme/spacing';

function ReelPreviewCard({
  reel,
  onPress,
  styles,
  accent,
  active,
}: {
  reel: FeedPost;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  accent: string;
  /** Home is focused — mount & play muted preview */
  active: boolean;
}) {
  const media = reel.media[0];
  const uri =
    media?.status === 'complete' && media.uri ? media.uri : null;
  const loading = Boolean(media && media.status === 'pending');

  const player = useVideoPlayer(uri || '', (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (!uri || !active) {
      safePause(player);
      return;
    }
    try {
      player.muted = true;
    } catch {
      // ignore
    }
    safePlay(player);
  }, [uri, active, player]);

  return (
    <SoftPressable style={styles.card} onPress={onPress}>
      {uri && active ? (
        <VideoView
          style={styles.preview}
          player={player}
          contentFit="cover"
          nativeControls={false}
          pointerEvents="none"
        />
      ) : (
        <View style={[styles.previewFallback, { backgroundColor: accent }]}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="videocam-outline" size={32} color="#fff" />
          )}
        </View>
      )}

      <View style={styles.scrim} pointerEvents="none" />

      <View style={styles.playBadge}>
        <Ionicons name="play" size={14} color="#fff" />
      </View>

      <View style={styles.cardMeta}>
        <Text style={styles.cardName} numberOfLines={1}>
          {reel.authorName}
        </Text>
        {reel.body ? (
          <Text style={styles.cardCaption} numberOfLines={2}>
            {reel.body}
          </Text>
        ) : null}
      </View>
    </SoftPressable>
  );
}

type ReelsRailProps = {
  reels: FeedPost[];
};

export function ReelsRail({ reels }: ReelsRailProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const isFocused = useIsFocused();
  const openReels = () => router.push('/(tabs)/reels' as Href);
  const previewReels = reels.slice(0, 6);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Reels</Text>
        <SoftPressable onPress={openReels} hitSlop={8}>
          <Text style={styles.seeAll}>See all</Text>
        </SoftPressable>
      </View>

      {previewReels.length === 0 ? (
        <SoftPressable style={styles.emptyCard} onPress={openReels}>
          <Ionicons name="film-outline" size={28} color={colors.accent} />
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyTitle}>No reels nearby yet</Text>
            <Text style={styles.emptyBody}>
              Record a short video or open Reels to watch
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </SoftPressable>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {previewReels.map((reel, index) => (
            <ReelPreviewCard
              key={reel.id}
              reel={reel}
              onPress={openReels}
              styles={styles}
              accent={index % 2 === 0 ? colors.accent : colors.terracotta400}
              active={isFocused}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      gap: Space.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    seeAll: {
      color: colors.accent,
      fontWeight: '700',
      fontSize: 13,
    },
    row: {
      gap: Space.md,
      paddingRight: Space.sm,
    },
    card: {
      width: 132,
      height: 220,
      borderRadius: Radius.lg,
      overflow: 'hidden',
      backgroundColor: '#111',
      justifyContent: 'flex-end',
      padding: Space.md,
    },
    preview: {
      ...StyleSheet.absoluteFill,
    },
    previewFallback: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.22)',
    },
    playBadge: {
      position: 'absolute',
      top: Space.md,
      left: Space.md,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: 2,
      zIndex: 2,
    },
    cardMeta: {
      gap: 4,
      zIndex: 2,
    },
    cardName: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 13,
      textShadowColor: 'rgba(0,0,0,0.5)',
      textShadowRadius: 4,
    },
    cardCaption: {
      color: 'rgba(255,255,255,0.95)',
      fontSize: 12,
      textShadowColor: 'rgba(0,0,0,0.5)',
      textShadowRadius: 4,
    },
    emptyCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      backgroundColor: colors.surface,
      borderRadius: Radius.card,
      padding: Space.lg,
    },
    emptyCopy: {
      flex: 1,
      gap: 2,
    },
    emptyTitle: {
      fontWeight: '700',
      color: colors.title,
      fontSize: 15,
    },
    emptyBody: {
      color: colors.muted,
      fontSize: 13,
    },
  });
}
