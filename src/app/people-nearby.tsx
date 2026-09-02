import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppAlert } from '@/components/AppAlert';
import { PeopleNearbyView } from '@/components/PeopleNearbyView';
import { useColors } from '@/providers/ThemeProvider';

export default function PeopleNearbyScreen() {
  const colors = useColors();
  const router = useRouter();
  const { alert } = useAppAlert();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.bg },
      }),
    [colors.bg],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <PeopleNearbyView
        showHeader
        onBack={() => router.back()}
        onFilter={() =>
          alert(
            'Filters',
            'Proximity uses Bluetooth signal when available, otherwise how recently someone was seen on Wi‑Fi.',
          )
        }
      />
    </SafeAreaView>
  );
}
