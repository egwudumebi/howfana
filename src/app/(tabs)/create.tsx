import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppAlert } from '@/components/AppAlert';
import { SoftPressable } from '@/components/SoftPressable';
import { PremiumConfig } from '@/lib/constants';
import { useIdentity } from '@/providers/IdentityProvider';
import { usePeers } from '@/providers/PeerProvider';
import { usePremium } from '@/providers/PremiumProvider';
import { useSocial } from '@/providers/SocialProvider';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';
import { Radius, Space } from '@/theme/spacing';

type Mode = 'menu' | 'text';

const SCHEDULE_PRESETS = [
  { label: 'In 1 hour', offsetMs: 60 * 60 * 1000 },
  { label: 'In 3 hours', offsetMs: 3 * 60 * 60 * 1000 },
  { label: 'Tomorrow morning', offsetMs: null as number | null },
] as const;

function tomorrowNineAm(): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

export default function CreateScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { alert } = useAppAlert();
  const { profile } = useIdentity();
  const { createPost, syncNow } = useSocial();
  const { connectedKeys } = usePeers();
  const { isPremium } = usePremium();
  const [mode, setMode] = useState<Mode>('menu');
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [schedulePreset, setSchedulePreset] = useState<number | 'tomorrow' | null>(
    null,
  );

  const scheduleAt =
    schedulePreset === 'tomorrow'
      ? tomorrowNineAm()
      : typeof schedulePreset === 'number'
        ? Date.now() + schedulePreset
        : null;

  const finish = async (fn: () => Promise<void>) => {
    if (!profile?.displayName) {
      alert('Set a display name', 'Save your profile before posting.');
      return;
    }
    setPosting(true);
    try {
      await fn();
      if (connectedKeys.length > 0) void syncNow();
      router.replace('/(tabs)' as Href);
    } catch (err) {
      alert('Post failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setPosting(false);
    }
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      alert('Permission needed', 'Allow photo library access to share a picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: 4,
    });
    if (result.canceled || !result.assets.length) return;
    const uris = result.assets.map((a) => a.uri);
    await finish(() =>
      createPost('', uris, scheduleAt ? { scheduleAt } : undefined),
    );
  };

  if (mode === 'text') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <SoftPressable onPress={() => setMode('menu')} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.title} />
          </SoftPressable>
          <Text style={styles.title}>New post</Text>
          <SoftPressable
            disabled={posting || !body.trim()}
            onPress={() =>
              finish(() =>
                createPost(
                  body.trim(),
                  null,
                  scheduleAt ? { scheduleAt } : undefined,
                ),
              )
            }
            style={[styles.postBtn, (!body.trim() || posting) && styles.disabled]}
          >
            {posting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.postBtnText}>
                {scheduleAt ? 'Schedule' : 'Post'}
              </Text>
            )}
          </SoftPressable>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Say hello to everyone…"
          placeholderTextColor={colors.muted}
          value={body}
          onChangeText={setBody}
          multiline
          autoFocus
          maxLength={2000}
        />

        <View style={styles.scheduleBlock}>
          <Text style={styles.scheduleTitle}>
            Schedule {isPremium ? '' : '(Premium)'}
          </Text>
          <View style={styles.presetRow}>
            <SoftPressable
              style={[
                styles.presetChip,
                schedulePreset === null && styles.presetChipActive,
              ]}
              onPress={() => setSchedulePreset(null)}
            >
              <Text
                style={[
                  styles.presetText,
                  schedulePreset === null && styles.presetTextActive,
                ]}
              >
                Now
              </Text>
            </SoftPressable>
            {SCHEDULE_PRESETS.map((p) => {
              const key = p.offsetMs === null ? 'tomorrow' : p.offsetMs;
              const active = schedulePreset === key;
              return (
                <SoftPressable
                  key={p.label}
                  style={[styles.presetChip, active && styles.presetChipActive]}
                  onPress={() => {
                    if (!isPremium) {
                      alert(
                        'Premium feature',
                        `Schedule posts with Premium (${PremiumConfig.priceLabel}).`,
                      );
                      return;
                    }
                    setSchedulePreset(key);
                  }}
                >
                  <Text
                    style={[
                      styles.presetText,
                      active && styles.presetTextActive,
                    ]}
                  >
                    {p.label}
                  </Text>
                </SoftPressable>
              );
            })}
          </View>
          {scheduleAt ? (
            <Text style={styles.scheduleHint}>
              Publishes {new Date(scheduleAt).toLocaleString()}
            </Text>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Create</Text>
        <SoftPressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={26} color={colors.title} />
        </SoftPressable>
      </View>
      <Text style={styles.subtitle}>Share with people nearby on Wi‑Fi</Text>

      <View style={styles.actions}>
        <SoftPressable style={styles.card} onPress={() => setMode('text')}>
          <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="create-outline" size={26} color={colors.accent} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Text post</Text>
            <Text style={styles.cardBody}>Say hello to everyone nearby</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </SoftPressable>

        <SoftPressable
          style={styles.card}
          onPress={() => {
            void pickPhoto();
          }}
          disabled={posting}
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="image-outline" size={26} color={colors.accent} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Photo</Text>
            <Text style={styles.cardBody}>Share a picture with the local feed</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </SoftPressable>

        <SoftPressable
          style={styles.card}
          onPress={() => router.push('/(tabs)/reels' as Href)}
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="videocam-outline" size={26} color={colors.accent} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Video</Text>
            <Text style={styles.cardBody}>Post a short video reel</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </SoftPressable>
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingHorizontal: Space.screen,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: Space.sm,
      marginBottom: Space.sm,
      gap: Space.md,
    },
    title: {
      flex: 1,
      fontSize: 28,
      fontWeight: '800',
      color: colors.title,
    },
    subtitle: {
      fontSize: 15,
      color: colors.muted,
      marginBottom: Space.xl,
    },
    postBtn: {
      backgroundColor: colors.accent,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: Radius.pill,
      minWidth: 72,
      alignItems: 'center',
    },
    postBtnText: {
      color: '#fff',
      fontWeight: '700',
    },
    disabled: { opacity: 0.45 },
    input: {
      flex: 1,
      fontSize: 18,
      color: colors.text,
      textAlignVertical: 'top',
      paddingTop: Space.md,
    },
    scheduleBlock: {
      paddingBottom: Space.xxl,
      gap: Space.sm,
    },
    scheduleTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    presetRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    presetChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radius.pill,
      backgroundColor: colors.surface,
    },
    presetChipActive: {
      backgroundColor: colors.accent,
    },
    presetText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    presetTextActive: {
      color: '#fff',
    },
    scheduleHint: {
      fontSize: 12,
      color: colors.muted,
    },
    actions: { gap: Space.md },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      backgroundColor: colors.chrome,
      borderRadius: Radius.lg,
      padding: Space.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardText: { flex: 1, gap: 2 },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.title,
    },
    cardBody: {
      fontSize: 13,
      color: colors.muted,
    },
  });
}
