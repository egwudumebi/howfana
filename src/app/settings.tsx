import { useMemo, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppAlert } from '@/components/AppAlert';
import { SoftPressable } from '@/components/SoftPressable';
import { PremiumConfig } from '@/lib/constants';
import { PremiumPlanCards } from '@/components/PremiumPlanCards';
import { useIdentity } from '@/providers/IdentityProvider';
import { usePeers } from '@/providers/PeerProvider';
import { usePremium } from '@/providers/PremiumProvider';
import { useColors, useTheme } from '@/providers/ThemeProvider';
import type { ThemeColors, ThemePreference } from '@/theme/colors';
import { Radius, Space } from '@/theme/spacing';

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] =
  [
    { value: 'light', label: 'Light', icon: 'sunny-outline' },
    { value: 'dark', label: 'Dark', icon: 'moon-outline' },
    { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  ];

function shortenKey(key: string): string {
  if (key.length <= 16) return key;
  return `${key.slice(0, 8)}…${key.slice(-8)}`;
}

function Section({
  title,
  children,
  styles,
}: {
  title: string;
  children: ReactNode;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  title,
  subtitle,
  onPress,
  right,
  styles,
  colors,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  last?: boolean;
}) {
  const content = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      {right ??
        (onPress ? (
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        ) : null)}
    </>
  );

  if (onPress) {
    return (
      <SoftPressable
        style={[styles.row, !last && styles.rowBorder]}
        onPress={onPress}
      >
        {content}
      </SoftPressable>
    );
  }

  return <View style={[styles.row, !last && styles.rowBorder]}>{content}</View>;
}

export default function SettingsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { alert } = useAppAlert();
  const { preference, setPreference, resolved } = useTheme();
  const { publicKey, recoveryKeyFormatted } = useIdentity();
  const {
    nearbyDiscoveryEnabled,
    setNearbyDiscoveryEnabled,
    invisibleMode,
    setInvisibleMode,
    available,
  } = usePeers();
  const {
    isPremium,
    subscription,
    pinLimit,
    cancelSubscription,
  } = usePremium();
  const [showFullKey, setShowFullKey] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);

  const version =
    Constants.expoConfig?.version ??
    Constants.nativeAppVersion ??
    '1.0.0';

  const copyText = async (label: string, value: string) => {
    try {
      await Clipboard.setStringAsync(value);
      alert('Copied', `${label} copied to clipboard.`);
    } catch {
      alert('Copy failed', 'Could not copy to clipboard.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <SoftPressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.title} />
        </SoftPressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Section title="Appearance" styles={styles}>
          <View style={styles.themeBlock}>
            <Text style={styles.themeHint}>
              Currently {resolved === 'dark' ? 'dark' : 'light'}
            </Text>
            <View style={styles.themeRow}>
              {THEME_OPTIONS.map((opt) => {
                const active = preference === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.themeChip, active && styles.themeChipActive]}
                    onPress={() => setPreference(opt.value)}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={16}
                      color={active ? '#fff' : colors.text}
                    />
                    <Text
                      style={[
                        styles.themeChipText,
                        active && styles.themeChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Section>

        <Section title="Privacy & nearby" styles={styles}>
          <Row
            icon="wifi"
            title="Nearby Discovery"
            subtitle={
              available
                ? 'Find and be found on Wi‑Fi / Bluetooth'
                : 'Needs a native build on this device'
            }
            styles={styles}
            colors={colors}
            right={
              <Switch
                value={nearbyDiscoveryEnabled}
                onValueChange={(v) => {
                  void setNearbyDiscoveryEnabled(v);
                }}
                trackColor={{ false: colors.border, true: colors.accentSoft }}
                thumbColor={
                  nearbyDiscoveryEnabled ? colors.accent : colors.muted
                }
              />
            }
          />
          <Row
            icon="eye-off-outline"
            title="Invisible Mode"
            subtitle="You won’t appear to nearby people"
            styles={styles}
            colors={colors}
            last
            right={
              <Switch
                value={invisibleMode}
                disabled={!nearbyDiscoveryEnabled}
                onValueChange={(v) => {
                  void setInvisibleMode(v);
                }}
                trackColor={{ false: colors.border, true: colors.accentSoft }}
                thumbColor={invisibleMode ? colors.accent : colors.muted}
              />
            }
          />
        </Section>

        <Section title="Account" styles={styles}>
          <Row
            icon="person-outline"
            title="Edit profile"
            subtitle="Name, avatar, and About"
            onPress={() => router.push('/(tabs)/profile' as Href)}
            styles={styles}
            colors={colors}
          />
          <Row
            icon="key-outline"
            title="Public key"
            subtitle={publicKey ? shortenKey(publicKey) : 'Unavailable'}
            onPress={() => setShowFullKey((v) => !v)}
            styles={styles}
            colors={colors}
            last={!showFullKey && !recoveryKeyFormatted}
            right={
              <Ionicons
                name={showFullKey ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.muted}
              />
            }
          />
          {showFullKey && publicKey ? (
            <View
              style={[
                styles.expandBlock,
                !recoveryKeyFormatted && styles.expandLast,
              ]}
            >
              <Text style={styles.mono} selectable>
                {publicKey}
              </Text>
              <SoftPressable
                style={styles.copyBtn}
                onPress={() => void copyText('Public key', publicKey)}
              >
                <Ionicons name="copy-outline" size={16} color={colors.accent} />
                <Text style={styles.copyText}>Copy</Text>
              </SoftPressable>
            </View>
          ) : null}
          {recoveryKeyFormatted ? (
            <>
              <Row
                icon="lock-closed-outline"
                title="Recovery key"
                subtitle="Keep private — unlock another device"
                onPress={() => setShowRecovery((v) => !v)}
                styles={styles}
                colors={colors}
                last={!showRecovery}
                right={
                  <Ionicons
                    name={showRecovery ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.muted}
                  />
                }
              />
              {showRecovery ? (
                <View style={[styles.expandBlock, styles.expandLast]}>
                  <Text style={styles.mono} selectable>
                    {recoveryKeyFormatted}
                  </Text>
                  <SoftPressable
                    style={styles.copyBtn}
                    onPress={() =>
                      void copyText('Recovery key', recoveryKeyFormatted)
                    }
                  >
                    <Ionicons
                      name="copy-outline"
                      size={16}
                      color={colors.accent}
                    />
                    <Text style={styles.copyText}>Copy</Text>
                  </SoftPressable>
                </View>
              ) : null}
            </>
          ) : null}
        </Section>

        <Section title="Notifications" styles={styles}>
          <Row
            icon="notifications-outline"
            title="Notification center"
            subtitle="Likes, comments, and friend requests"
            onPress={() => router.push('/notifications' as Href)}
            styles={styles}
            colors={colors}
            last
          />
        </Section>

        <Section title="Premium" styles={styles}>
          <View style={styles.premiumBlock}>
            <Text style={styles.premiumStatus}>
              {isPremium ? 'Premium active' : 'Free plan'}
            </Text>
            {isPremium ? (
              <>
                <Text style={styles.premiumBody}>
                  {subscription.expiresAt
                    ? `Renews ${new Date(subscription.expiresAt).toLocaleDateString()}`
                    : 'Active'}{' '}
                  · {pinLimit} pinned posts · edit for 1 hour · schedule · better
                  reach. Ads still show.
                </Text>
                <SoftPressable
                  style={styles.premiumBtnOutline}
                  onPress={() =>
                    alert('Cancel Premium?', 'You can resubscribe anytime.', [
                      { text: 'Keep Premium', style: 'cancel' },
                      {
                        text: 'Cancel',
                        style: 'destructive',
                        onPress: () => void cancelSubscription(),
                      },
                    ])
                  }
                >
                  <Text style={styles.premiumBtnOutlineText}>
                    Cancel subscription
                  </Text>
                </SoftPressable>
              </>
            ) : (
              <>
                <Text style={styles.premiumBody}>
                  Free: {PremiumConfig.freePinLimit} pins, no edits after publish,
                  normal reach, ads. Premium: {PremiumConfig.premiumPinLimit} pins,
                  edit 1 hour, schedule posts, better reach — ads still show.
                </Text>
                <PremiumPlanCards />
              </>
            )}
          </View>
        </Section>

        <Section title="About" styles={styles}>
          <Row
            icon="information-circle-outline"
            title="Howfana"
            subtitle={`Version ${version}`}
            styles={styles}
            colors={colors}
            last
          />
        </Section>

        <Text style={styles.footer}>
          Offline-first · identity stays on your device
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.screen,
      paddingBottom: Space.md,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.title,
    },
    scroll: {
      paddingHorizontal: Space.screen,
      paddingBottom: 48,
      gap: Space.lg,
    },
    section: {
      gap: Space.sm,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: 4,
    },
    card: {
      backgroundColor: colors.chrome,
      borderRadius: Radius.lg,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      paddingHorizontal: Space.lg,
      paddingVertical: 14,
    },
    rowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowMain: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.title,
    },
    rowSub: {
      fontSize: 13,
      color: colors.muted,
      lineHeight: 18,
    },
    themeBlock: {
      padding: Space.lg,
      gap: Space.md,
    },
    themeHint: {
      fontSize: 13,
      color: colors.muted,
    },
    themeRow: {
      flexDirection: 'row',
      gap: 8,
    },
    themeChip: {
      flex: 1,
      flexDirection: 'row',
      gap: 6,
      paddingVertical: 12,
      borderRadius: Radius.sm,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    themeChipActive: {
      backgroundColor: colors.accent,
    },
    themeChipText: {
      fontWeight: '700',
      fontSize: 13,
      color: colors.text,
    },
    themeChipTextActive: {
      color: '#fff',
    },
    expandBlock: {
      paddingHorizontal: Space.lg,
      paddingBottom: Space.lg,
      gap: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    expandLast: {
      borderBottomWidth: 0,
    },
    mono: {
      fontFamily: 'monospace',
      fontSize: 11,
      lineHeight: 16,
      color: colors.muted,
    },
    copyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: Radius.pill,
      backgroundColor: colors.accentSoft,
    },
    copyText: {
      color: colors.accent,
      fontWeight: '700',
      fontSize: 13,
    },
    premiumBlock: {
      padding: Space.lg,
      gap: Space.md,
    },
    premiumStatus: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.title,
    },
    premiumBody: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.muted,
    },
    premiumBtn: {
      backgroundColor: colors.accent,
      borderRadius: Radius.sm,
      paddingVertical: 12,
      alignItems: 'center',
    },
    premiumBtnText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 15,
    },
    premiumBtnOutline: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.sm,
      paddingVertical: 12,
      alignItems: 'center',
    },
    premiumBtnOutlineText: {
      color: colors.danger,
      fontWeight: '700',
      fontSize: 15,
    },
    footer: {
      textAlign: 'center',
      fontSize: 12,
      color: colors.textLight,
      marginTop: Space.sm,
    },
  });
}
