import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';

import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { SoftPressable } from '@/components/SoftPressable';
import { getProfile } from '@/lib/db/profiles';
import { groupPeersByProximity } from '@/lib/net/proximity';
import type { DiscoveredPeer, PeerSession } from '@/lib/net/types';
import { usePeers } from '@/providers/PeerProvider';
import { useSocial } from '@/providers/SocialProvider';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';
import { Radius, Space } from '@/theme/spacing';

type SectionKey = 'veryClose' | 'nearby' | 'withinRange';

const SECTION_META: Record<
  SectionKey,
  { title: string; subtitle: string; accentKey: 'online' | 'accent' | 'muted' }
> = {
  veryClose: {
    title: 'Very Close',
    subtitle: 'Very close to you',
    accentKey: 'online',
  },
  nearby: {
    title: 'Nearby',
    subtitle: 'In your area',
    accentKey: 'accent',
  },
  withinRange: {
    title: 'Within Range',
    subtitle: 'Still within range',
    accentKey: 'muted',
  },
};

function bioLine(skills: string, bio: string): string {
  const parts = [skills, bio].map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return 'On the same Wi‑Fi';
  return parts.slice(0, 2).join(' · ');
}

function PeerRow({
  peer,
  session,
  bio,
  following,
  dotColor,
  onConnect,
  onToggleFollow,
  styles,
  colors,
}: {
  peer: DiscoveredPeer;
  session?: PeerSession;
  bio: string;
  following: boolean;
  dotColor: string;
  onConnect: () => void;
  onToggleFollow: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  const connected = session?.status === 'connected';
  const busy =
    session?.status === 'connecting' || session?.status === 'handshaking';

  return (
    <View style={styles.row}>
      <Avatar name={peer.displayName} seed={peer.publicKey} size={48} />
      <View style={styles.rowMain}>
        <Text style={styles.rowName}>{peer.displayName || 'Nearby user'}</Text>
        <Text style={styles.rowBio} numberOfLines={1}>
          {bio}
        </Text>
      </View>
      <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
      <SoftPressable
        style={[styles.smallBtn, following && styles.smallBtnGhost]}
        onPress={onToggleFollow}
      >
        <Text
          style={[styles.smallBtnText, following && styles.smallBtnGhostText]}
        >
          {following ? 'Friends' : 'Add'}
        </Text>
      </SoftPressable>
      {!connected ? (
        <SoftPressable
          style={styles.iconBtn}
          disabled={busy}
          onPress={onConnect}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="link-outline" size={18} color={colors.accent} />
          )}
        </SoftPressable>
      ) : null}
    </View>
  );
}

export function PeopleNearbyView({
  showHeader = false,
  onBack,
  onFilter,
}: {
  showHeader?: boolean;
  onBack?: () => void;
  onFilter?: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const db = useSQLiteContext();
  const {
    nearbyPeers,
    sessions,
    available,
    connectPeer,
    setNearbyDiscoveryEnabled,
    nearbyDiscoveryEnabled,
  } = usePeers();
  const { followingMap, toggleFollow, refreshFollowing } = useSocial();
  const [bios, setBios] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    veryClose: true,
    nearby: true,
    withinRange: true,
  });
  const [showAll, setShowAll] = useState<Record<SectionKey, boolean>>({
    veryClose: false,
    nearby: false,
    withinRange: false,
  });

  const grouped = useMemo(
    () => groupPeersByProximity(nearbyPeers),
    [nearbyPeers],
  );

  useEffect(() => {
    void refreshFollowing(nearbyPeers.map((p) => p.publicKey));
  }, [nearbyPeers, refreshFollowing]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const peer of nearbyPeers) {
        const profile = await getProfile(db, peer.publicKey);
        next[peer.publicKey] = bioLine(
          profile?.about.skills ?? '',
          profile?.about.bio ?? '',
        );
      }
      if (!cancelled) setBios(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, nearbyPeers]);

  const sessionByKey = useMemo(() => {
    const map = new Map<string, PeerSession>();
    for (const s of sessions) map.set(s.publicKey, s);
    return map;
  }, [sessions]);

  const renderSection = (key: SectionKey) => {
    const meta = SECTION_META[key];
    const list = grouped[key];
    const accent =
      meta.accentKey === 'online'
        ? colors.online
        : meta.accentKey === 'accent'
          ? colors.accent
          : colors.muted;
    const open = expanded[key];
    const visible = showAll[key] ? list : list.slice(0, 2);

    return (
      <View key={key} style={styles.sectionCard}>
        <SoftPressable
          style={styles.sectionHeader}
          onPress={() => setExpanded((e) => ({ ...e, [key]: !e[key] }))}
        >
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionDot, { backgroundColor: accent }]} />
            <View>
              <Text style={styles.sectionTitle}>
                {meta.title} ({list.length})
              </Text>
              <Text style={styles.sectionSub}>{meta.subtitle}</Text>
            </View>
          </View>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.muted}
          />
        </SoftPressable>

        {open ? (
          <>
            {visible.map((peer) => (
              <PeerRow
                key={peer.publicKey}
                peer={peer}
                session={sessionByKey.get(peer.publicKey)}
                bio={bios[peer.publicKey] ?? 'On the same Wi‑Fi'}
                following={Boolean(followingMap[peer.publicKey])}
                dotColor={accent}
                onConnect={() => {
                  void connectPeer(peer.publicKey);
                }}
                onToggleFollow={() => {
                  void toggleFollow(peer.publicKey);
                }}
                styles={styles}
                colors={colors}
              />
            ))}
            {list.length > 2 ? (
              <SoftPressable
                onPress={() =>
                  setShowAll((s) => ({ ...s, [key]: !s[key] }))
                }
              >
                <Text style={[styles.viewAll, { color: accent }]}>
                  {showAll[key]
                    ? 'Show less'
                    : `View all (${list.length}) >`}
                </Text>
              </SoftPressable>
            ) : null}
          </>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {showHeader ? (
        <View style={styles.header}>
          <SoftPressable onPress={onBack} hitSlop={10} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.title} />
          </SoftPressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>People Nearby</Text>
            <Text style={styles.headerSub}>
              Discover people around you over Wi‑Fi & Bluetooth
            </Text>
          </View>
          <SoftPressable
            onPress={onFilter}
            hitSlop={10}
            style={styles.headerBtn}
          >
            <Ionicons name="options-outline" size={22} color={colors.accent} />
          </SoftPressable>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.scroll}>
        {!available ? (
          <EmptyState
            icon="wifi-outline"
            title="Nearby discovery unavailable"
            body="Nearby people need a Howfana native build with Wi‑Fi and Bluetooth support."
          />
        ) : nearbyPeers.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="Nobody nearby yet"
            body={
              nearbyDiscoveryEnabled
                ? 'Keep this screen open while friends nearby open Howfana (same Wi‑Fi helps for chat & calls).'
                : 'Turn on Nearby Discovery to find people over Wi‑Fi & Bluetooth.'
            }
            actionLabel={
              nearbyDiscoveryEnabled ? undefined : 'Enable discovery'
            }
            onAction={
              nearbyDiscoveryEnabled
                ? undefined
                : () => void setNearbyDiscoveryEnabled(true)
            }
          />
        ) : (
          (['veryClose', 'nearby', 'withinRange'] as SectionKey[]).map(
            renderSection,
          )
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: Space.screen,
      paddingBottom: Space.lg,
      gap: Space.sm,
    },
    headerBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
      paddingTop: 4,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.title,
    },
    headerSub: {
      fontSize: 12,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 16,
    },
    scroll: {
      paddingHorizontal: Space.screen,
      paddingBottom: 120,
      gap: Space.lg,
    },
    sectionCard: {
      backgroundColor: colors.surface,
      borderRadius: Radius.card,
      padding: Space.lg,
      gap: Space.md,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      flex: 1,
    },
    sectionDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.title,
    },
    sectionSub: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      paddingVertical: Space.sm,
    },
    rowMain: { flex: 1, gap: 2 },
    rowName: { fontSize: 15, fontWeight: '700', color: colors.title },
    rowBio: { fontSize: 12, color: colors.muted },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    smallBtn: {
      backgroundColor: colors.accent,
      borderRadius: Radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    smallBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
    smallBtnGhost: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
    },
    smallBtnGhostText: { color: colors.title },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewAll: {
      fontWeight: '700',
      fontSize: 13,
      marginTop: Space.xs,
    },
  });
}
