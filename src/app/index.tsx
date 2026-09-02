import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { hasAcceptedAgreement } from '@/lib/legal/agreement';
import { useIdentity } from '@/providers/IdentityProvider';
import { useColors } from '@/providers/ThemeProvider';

export default function Index() {
  const colors = useColors();
  const router = useRouter();
  const { ready, hasKeys, isAuthenticated } = useIdentity();
  const [legalReady, setLegalReady] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const accepted = await hasAcceptedAgreement();
      if (cancelled) return;
      setAgreementAccepted(accepted);
      setLegalReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !legalReady) return;

    if (!agreementAccepted) {
      router.replace('/(auth)/agreement');
      return;
    }

    if (!hasKeys) {
      router.replace('/(auth)/welcome');
      return;
    }
    if (!isAuthenticated) {
      router.replace('/(auth)/register');
      return;
    }
    router.replace('/(tabs)');
  }, [
    ready,
    legalReady,
    agreementAccepted,
    hasKeys,
    isAuthenticated,
    router,
  ]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bg,
      }}
    >
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}
