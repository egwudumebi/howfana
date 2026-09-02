import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';

import { SoftPressable } from '@/components/SoftPressable';
import { useAppAlert } from '@/components/AppAlert';
import {
  PREMIUM_FEATURES,
  PREMIUM_PLANS,
  formatNgn,
  type PremiumPlan,
} from '@/lib/premium/plans';
import {
  buildPaystackReference,
  isPaystackCheckoutReady,
  isPaystackConfigured,
  paystackEmailForUser,
} from '@/lib/premium/paystack';
import {
  getPaystackModule,
  type PaystackClient,
} from '@/lib/premium/paystackNative';
import { useIdentity } from '@/providers/IdentityProvider';
import { usePremium } from '@/providers/PremiumProvider';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';
import { Radius, Space } from '@/theme/spacing';

function PlanCard({
  plan,
  loading,
  inactive,
  onSelect,
  colors,
  styles,
}: {
  plan: PremiumPlan;
  loading: boolean;
  inactive: boolean;
  onSelect: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const featured = plan.featured;

  return (
    <View
      style={[
        styles.card,
        featured && styles.cardFeatured,
        inactive && styles.cardInactive,
      ]}
    >
      {plan.badge ? (
        <View style={[styles.badge, featured && styles.badgeFeatured]}>
          <Text style={[styles.badgeText, featured && styles.badgeTextFeatured]}>
            {plan.badge}
          </Text>
        </View>
      ) : null}

      <View style={styles.cardBody}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{plan.title}</Text>
          <Text style={styles.cardSubtitle}>{plan.subtitle}</Text>
        </View>
        <Text style={styles.cardPrice}>{formatNgn(plan.priceNgn)}</Text>
      </View>

      <SoftPressable
        style={[styles.cardBtn, featured && styles.cardBtnFeatured]}
        disabled={loading}
        onPress={onSelect}
      >
        {loading ? (
          <ActivityIndicator color={featured ? '#fff' : colors.accent} size="small" />
        ) : (
          <>
            <Ionicons
              name="card-outline"
              size={16}
              color={featured ? '#fff' : colors.accent}
            />
            <Text style={[styles.cardBtnText, featured && styles.cardBtnTextFeatured]}>
              Subscribe
            </Text>
          </>
        )}
      </SoftPressable>
    </View>
  );
}

function FeatureRow({
  label,
  styles,
}: {
  label: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.featureRow}>
      <Text style={styles.featureBullet}>•</Text>
      <Text style={styles.featureText}>{label}</Text>
    </View>
  );
}

export function PremiumPlanCards() {
  if (isPaystackCheckoutReady()) {
    return <PremiumPlanCardsWithPaystack />;
  }
  return (
    <PremiumPlanCardsContent
      paystack={null}
      nativeRebuildRequired={isPaystackConfigured()}
    />
  );
}

function PremiumPlanCardsContent({
  paystack,
  nativeRebuildRequired,
}: {
  paystack: PaystackClient | null;
  nativeRebuildRequired: boolean;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { alert } = useAppAlert();
  const { publicKey, profile } = useIdentity();
  const { isPremium, subscription, activatePlan } = usePremium();
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);

  const paystackReady = isPaystackConfigured() && paystack != null;

  const onSelectPlan = (plan: PremiumPlan) => {
    if (isPremium) return;

    if (!publicKey) {
      alert(
        'Identity required',
        'Set up or restore your Howfana account before subscribing.',
      );
      return;
    }

    if (nativeRebuildRequired) {
      alert(
        'Dev build required',
        'Premium checkout needs a fresh install with WebView. From the project root run:\n\nnpx expo run:android --device Infinix_X669 --port 8082',
      );
      return;
    }

    if (!isPaystackConfigured()) {
      alert(
        'Paystack not configured',
        'Add EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_… to a .env file in the project root, then restart Metro.',
      );
      return;
    }

    if (!paystackReady || !paystack) {
      alert(
        'Checkout unavailable',
        'Paystack could not start on this build. Reinstall the dev client, then try again.',
      );
      return;
    }

    const email = paystackEmailForUser(
      publicKey,
      profile?.displayName || 'Howfana Member',
    );
    const reference = buildPaystackReference(plan.id, publicKey);

    setLoadingPlanId(plan.id);
    paystack.popup.checkout({
      email,
      amount: plan.priceNgn,
      reference,
      metadata: {
        planId: plan.id,
        publicKeyPrefix: publicKey.slice(0, 12),
      },
      onSuccess: (res) => {
        setLoadingPlanId(null);
        void activatePlan(plan.id, res.reference ?? reference).then(() => {
          alert(
            'Welcome to Premium',
            `Your ${plan.title.toLowerCase()} plan is active. Pin more posts, edit, schedule, and reach more people nearby.`,
          );
        });
      },
      onCancel: () => {
        setLoadingPlanId(null);
      },
      onError: (err) => {
        setLoadingPlanId(null);
        alert(
          'Payment failed',
          err?.message ?? 'Paystack checkout could not be completed.',
        );
      },
    });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="diamond-outline" size={20} color={colors.accent} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>HOWFANA PREMIUM</Text>
          <Text style={styles.headerSub}>
            {isPremium
              ? subscription.planId
                ? `Active · ${PREMIUM_PLANS.find((p) => p.id === subscription.planId)?.title ?? 'Plan'}`
                : 'Active'
              : 'Unlock more with Premium ✨'}
          </Text>
        </View>
      </View>

      {nativeRebuildRequired ? (
        <View style={styles.notice}>
          <Ionicons name="phone-portrait-outline" size={16} color={colors.accent} />
          <Text style={styles.noticeText}>
            Premium checkout needs a fresh dev build with WebView. From the
            project root run: npx expo run:android --device Infinix_X669 --port
            8082
          </Text>
        </View>
      ) : !paystackReady ? (
        <View style={styles.notice}>
          <Ionicons name="key-outline" size={16} color={colors.accent} />
          <Text style={styles.noticeText}>
            Add your Paystack test public key to `.env` as
            EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY, then restart Metro.
          </Text>
        </View>
      ) : null}

      <View style={styles.cardList}>
        {PREMIUM_PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            loading={loadingPlanId === plan.id}
            inactive={isPremium}
            onSelect={() => onSelectPlan(plan)}
            colors={colors}
            styles={styles}
          />
        ))}
      </View>

      <View style={styles.benefitsBlock}>
        <Text style={styles.benefitsTitle}>PREMIUM USERS</Text>
        {PREMIUM_FEATURES.map((feature) => (
          <FeatureRow key={feature} label={feature} styles={styles} />
        ))}
      </View>

      <Text style={styles.footer}>
        Secure checkout via Paystack · NGN · Test mode supported
      </Text>
    </View>
  );
}

function PremiumPlanCardsWithPaystack() {
  const mod = getPaystackModule();
  if (!mod) {
    return (
      <PremiumPlanCardsContent
        paystack={null}
        nativeRebuildRequired={isPaystackConfigured()}
      />
    );
  }
  return <PremiumPlanCardsPaystackHook usePaystack={mod.usePaystack} />;
}

function PremiumPlanCardsPaystackHook({
  usePaystack,
}: {
  usePaystack: NonNullable<ReturnType<typeof getPaystackModule>>['usePaystack'];
}) {
  const paystack = usePaystack();
  return (
    <PremiumPlanCardsContent paystack={paystack} nativeRebuildRequired={false} />
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
      gap: Space.md,
    },
    headerIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: {
      flex: 1,
      gap: 2,
    },
    headerTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.title,
      letterSpacing: 0.6,
    },
    headerSub: {
      fontSize: 13,
      color: colors.muted,
      lineHeight: 18,
    },
    notice: {
      flexDirection: 'row',
      gap: Space.sm,
      alignItems: 'flex-start',
      backgroundColor: colors.accentSoft,
      borderRadius: Radius.md,
      padding: Space.md,
    },
    noticeText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 17,
      color: colors.text,
    },
    cardList: {
      gap: Space.md,
    },
    card: {
      backgroundColor: colors.chrome,
      borderRadius: Radius.card,
      borderWidth: 1.5,
      borderColor: colors.border,
      padding: Space.lg,
      gap: Space.sm,
    },
    cardFeatured: {
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    cardInactive: {
      opacity: 0.72,
    },
    badge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surface,
      borderRadius: Radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    badgeFeatured: {
      backgroundColor: colors.accent,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.accent,
    },
    badgeTextFeatured: {
      color: '#fff',
    },
    cardBody: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Space.md,
    },
    cardInfo: {
      flex: 1,
      gap: 4,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.title,
      letterSpacing: 0.4,
    },
    cardSubtitle: {
      fontSize: 13,
      color: colors.muted,
    },
    cardPrice: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.accent,
      letterSpacing: -0.5,
    },
    benefitsBlock: {
      backgroundColor: colors.surface,
      borderRadius: Radius.md,
      padding: Space.lg,
      gap: Space.sm,
    },
    benefitsTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.muted,
      letterSpacing: 0.5,
      marginBottom: Space.xs,
    },
    featureList: {
      gap: 6,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    featureBullet: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.text,
      width: 10,
    },
    featureText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
      color: colors.text,
    },
    cardBtn: {
      marginTop: Space.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1.5,
      borderColor: colors.accent,
      borderRadius: Radius.md,
      paddingVertical: 12,
      backgroundColor: colors.chrome,
    },
    cardBtnFeatured: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    cardBtnText: {
      color: colors.accent,
      fontWeight: '700',
      fontSize: 14,
    },
    cardBtnTextFeatured: {
      color: '#fff',
    },
    footer: {
      fontSize: 11,
      color: colors.muted,
      textAlign: 'center',
    },
  });
}
