import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HowfanaMark } from '@/components/HowfanaMark';
import { SoftPressable } from '@/components/SoftPressable';
import {
  acceptAgreement,
  PRIVACY_SECTIONS,
  TERMS_SECTIONS,
  type PolicySection,
} from '@/lib/legal/agreement';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';
import { Radius, Space } from '@/theme/spacing';

type PolicyTab = 'terms' | 'privacy';

function PolicyBlock({
  section,
  styles,
}: {
  section: PolicySection;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.policySection}>
      <Text style={styles.policyTitle}>{section.title}</Text>
      {section.paragraphs.map((paragraph) => (
        <Text key={paragraph.slice(0, 24)} style={styles.policyBody}>
          {paragraph}
        </Text>
      ))}
      {section.bullets?.map((bullet) => (
        <View key={bullet.slice(0, 24)} style={styles.bulletRow}>
          <Text style={styles.bulletMark}>•</Text>
          <Text style={styles.bulletText}>{bullet}</Text>
        </View>
      ))}
    </View>
  );
}

export default function AgreementScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<PolicyTab>('terms');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  const sections = tab === 'terms' ? TERMS_SECTIONS : PRIVACY_SECTIONS;

  const onAccept = async () => {
    if (!checked || busy) return;
    setBusy(true);
    try {
      await acceptAgreement();
      router.replace('/(auth)/welcome');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <HowfanaMark size={48} />
        <Text style={styles.title}>Before you start</Text>
        <Text style={styles.subtitle}>
          Please read and accept our Terms of Service and Privacy Policy to use
          Howfana.
        </Text>
      </View>

      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, tab === 'terms' && styles.tabActive]}
          onPress={() => setTab('terms')}
        >
          <Text style={[styles.tabText, tab === 'terms' && styles.tabTextActive]}>
            Terms
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'privacy' && styles.tabActive]}
          onPress={() => setTab('privacy')}
        >
          <Text
            style={[styles.tabText, tab === 'privacy' && styles.tabTextActive]}
          >
            Privacy
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        {sections.map((section) => (
          <PolicyBlock key={section.id} section={section} styles={styles} />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={styles.checkRow}
          onPress={() => setChecked((value) => !value)}
        >
          <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
            {checked ? (
              <Ionicons name="checkmark" size={16} color="#fff" />
            ) : null}
          </View>
          <Text style={styles.checkLabel}>
            I have read and agree to the Terms of Service and Privacy Policy
          </Text>
        </Pressable>

        <SoftPressable
          style={[styles.acceptBtn, (!checked || busy) && styles.acceptBtnDisabled]}
          disabled={!checked || busy}
          onPress={() => {
            void onAccept();
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.acceptText}>Accept & continue</Text>
          )}
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
    },
    header: {
      alignItems: 'center',
      paddingHorizontal: Space.screen,
      paddingTop: Space.md,
      paddingBottom: Space.sm,
      gap: Space.sm,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.title,
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.muted,
      textAlign: 'center',
    },
    tabRow: {
      flexDirection: 'row',
      marginHorizontal: Space.screen,
      marginBottom: Space.sm,
      backgroundColor: colors.surface,
      borderRadius: Radius.sm,
      padding: 4,
      gap: 4,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: Radius.sm - 2,
      alignItems: 'center',
    },
    tabActive: {
      backgroundColor: colors.chrome,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.muted,
    },
    tabTextActive: {
      color: colors.accent,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: Space.screen,
      paddingBottom: Space.lg,
      gap: Space.lg,
    },
    policySection: {
      gap: Space.sm,
    },
    policyTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.title,
    },
    policyBody: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.text,
    },
    bulletRow: {
      flexDirection: 'row',
      gap: 8,
      paddingLeft: 4,
    },
    bulletMark: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.text,
      width: 12,
    },
    bulletText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 21,
      color: colors.text,
    },
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.divider,
      paddingHorizontal: Space.screen,
      paddingTop: Space.md,
      paddingBottom: Space.lg,
      gap: Space.md,
      backgroundColor: colors.chrome,
    },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
      backgroundColor: colors.bg,
    },
    checkboxChecked: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    checkLabel: {
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
      color: colors.text,
    },
    acceptBtn: {
      backgroundColor: colors.accent,
      borderRadius: Radius.sm,
      paddingVertical: 16,
      alignItems: 'center',
    },
    acceptBtnDisabled: {
      opacity: 0.45,
    },
    acceptText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 16,
    },
  });
}
