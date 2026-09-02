import { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppAlert } from '@/components/AppAlert';
import { PeopleNearbyView } from '@/components/PeopleNearbyView';
import { SoftPressable } from '@/components/SoftPressable';
import { NetConfig } from '@/lib/constants';
import { usePeers } from '@/providers/PeerProvider';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';
import { Radius, Space } from '@/theme/spacing';

export default function PeopleScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { alert } = useAppAlert();
  const { connectManual, transportError } = usePeers();
  const [host, setHost] = useState('');
  const [connecting, setConnecting] = useState(false);

  const onManual = async () => {
    const trimmed = host.trim();
    if (!trimmed) {
      alert('IP required', 'Enter a peer IP on the same Wi‑Fi.');
      return;
    }
    setConnecting(true);
    try {
      await connectManual(trimmed, NetConfig.tcpPort);
      setHost('');
    } catch (err) {
      alert('Connect failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.top}>
        <Text style={styles.title}>People</Text>
        <Text style={styles.subtitle}>
          Find friends nearby over Wi‑Fi & Bluetooth
        </Text>
      </View>

      <View style={styles.manualCard}>
        <Text style={styles.manualLabel}>Connect by IP</Text>
        <View style={styles.manualRow}>
          <TextInput
            style={styles.input}
            placeholder="192.168.1.10"
            placeholderTextColor={colors.muted}
            value={host}
            onChangeText={setHost}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
          />
          <SoftPressable
            style={[styles.connectBtn, connecting && styles.disabled]}
            disabled={connecting}
            onPress={() => void onManual()}
          >
            <Ionicons name="link" size={18} color="#fff" />
          </SoftPressable>
        </View>
        {transportError ? (
          <Text style={styles.error}>{transportError}</Text>
        ) : null}
      </View>

      <PeopleNearbyView />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    top: {
      paddingHorizontal: Space.screen,
      paddingBottom: Space.md,
      gap: 4,
    },
    title: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.title,
    },
    subtitle: {
      fontSize: 14,
      color: colors.muted,
    },
    manualCard: {
      marginHorizontal: Space.screen,
      marginBottom: Space.lg,
      backgroundColor: colors.surface,
      borderRadius: Radius.card,
      padding: Space.lg,
      gap: Space.sm,
    },
    manualLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.title,
    },
    manualRow: {
      flexDirection: 'row',
      gap: Space.sm,
      alignItems: 'center',
    },
    input: {
      flex: 1,
      backgroundColor: colors.bg,
      borderRadius: Radius.pill,
      paddingHorizontal: Space.lg,
      paddingVertical: 12,
      color: colors.title,
      fontSize: 15,
    },
    connectBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    disabled: { opacity: 0.5 },
    error: { color: colors.danger, fontSize: 12 },
  });
}
