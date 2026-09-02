import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';

import {
  AD_FEEDBACK_KEY,
  PINNED_POSTS_KEY,
  PREMIUM_SUB_KEY,
  PremiumConfig,
} from '@/lib/constants';
import type { AdFeedbackKind, AdFeedbackMap } from '@/lib/ads/catalog';
import {
  EMPTY_SUBSCRIPTION,
  activateSubscription,
  isSubscriptionActive,
  pinLimitFor,
  type PremiumSubscription,
} from '@/lib/premium/entitlements';
import type { PremiumPlanId } from '@/lib/premium/plans';
import { getPaystackPublicKey, isPaystackCheckoutReady } from '@/lib/premium/paystack';
import { getPaystackModule } from '@/lib/premium/paystackNative';

type PremiumState = {
  ready: boolean;
  isPremium: boolean;
  subscription: PremiumSubscription;
  pinnedPostIds: string[];
  pinLimit: number;
  paystackConfigured: boolean;
  paystackCheckoutReady: boolean;
  activatePlan: (planId: PremiumPlanId, reference: string) => Promise<void>;
  cancelSubscription: () => Promise<void>;
  togglePin: (postId: string) => Promise<{ ok: boolean; message?: string }>;
  isPinned: (postId: string) => boolean;
  recordAdFeedback: (adId: string, kind: AdFeedbackKind) => Promise<void>;
  adFeedback: AdFeedbackMap;
  isAdHidden: (adId: string) => boolean;
};

const PremiumContext = createContext<PremiumState | null>(null);

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeSubscription(raw: PremiumSubscription): PremiumSubscription {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_SUBSCRIPTION };
  return {
    active: Boolean(raw.active),
    expiresAt: typeof raw.expiresAt === 'number' ? raw.expiresAt : null,
    startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : null,
    planId: raw.planId ?? null,
    paystackReference:
      typeof raw.paystackReference === 'string' ? raw.paystackReference : null,
  };
}

function PremiumProviderInner({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [subscription, setSubscription] =
    useState<PremiumSubscription>(EMPTY_SUBSCRIPTION);
  const [pinnedPostIds, setPinnedPostIds] = useState<string[]>([]);
  const [adFeedback, setAdFeedback] = useState<AdFeedbackMap>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [sub, pins, feedback] = await Promise.all([
        readJson(PREMIUM_SUB_KEY, EMPTY_SUBSCRIPTION),
        readJson<string[]>(PINNED_POSTS_KEY, []),
        readJson<AdFeedbackMap>(AD_FEEDBACK_KEY, {}),
      ]);
      if (cancelled) return;
      const normalized = normalizeSubscription(sub);
      const active = isSubscriptionActive(normalized)
        ? normalized
        : { ...EMPTY_SUBSCRIPTION };
      if (sub.active && !isSubscriptionActive(normalized)) {
        await SecureStore.setItemAsync(
          PREMIUM_SUB_KEY,
          JSON.stringify(active),
        );
      }
      setSubscription(active);
      setPinnedPostIds(Array.isArray(pins) ? pins : []);
      setAdFeedback(feedback && typeof feedback === 'object' ? feedback : {});
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isPremium = isSubscriptionActive(subscription);
  const pinLimit = pinLimitFor(isPremium);
  const paystackConfigured = getPaystackPublicKey() != null;
  const paystackCheckoutReady = isPaystackCheckoutReady();

  useEffect(() => {
    if (!ready) return;
    if (pinnedPostIds.length <= pinLimit) return;
    const next = pinnedPostIds.slice(0, pinLimit);
    setPinnedPostIds(next);
    void SecureStore.setItemAsync(PINNED_POSTS_KEY, JSON.stringify(next));
  }, [ready, pinLimit, pinnedPostIds]);

  const activatePlan = useCallback(
    async (planId: PremiumPlanId, reference: string) => {
      const next = activateSubscription(planId, reference);
      setSubscription(next);
      await SecureStore.setItemAsync(PREMIUM_SUB_KEY, JSON.stringify(next));
    },
    [],
  );

  const cancelSubscription = useCallback(async () => {
    setSubscription(EMPTY_SUBSCRIPTION);
    await SecureStore.setItemAsync(
      PREMIUM_SUB_KEY,
      JSON.stringify(EMPTY_SUBSCRIPTION),
    );
  }, []);

  const togglePin = useCallback(
    async (postId: string): Promise<{ ok: boolean; message?: string }> => {
      const has = pinnedPostIds.includes(postId);
      if (has) {
        const next = pinnedPostIds.filter((id) => id !== postId);
        setPinnedPostIds(next);
        await SecureStore.setItemAsync(PINNED_POSTS_KEY, JSON.stringify(next));
        return { ok: true };
      }
      if (pinnedPostIds.length >= pinLimit) {
        return {
          ok: false,
          message: isPremium
            ? `Premium allows up to ${PremiumConfig.premiumPinLimit} pinned posts.`
            : `Free accounts can pin ${PremiumConfig.freePinLimit} posts. Upgrade to Premium for ${PremiumConfig.premiumPinLimit}.`,
        };
      }
      const next = [postId, ...pinnedPostIds];
      setPinnedPostIds(next);
      await SecureStore.setItemAsync(PINNED_POSTS_KEY, JSON.stringify(next));
      return { ok: true };
    },
    [pinnedPostIds, pinLimit, isPremium],
  );

  const isPinned = useCallback(
    (postId: string) => pinnedPostIds.includes(postId),
    [pinnedPostIds],
  );

  const recordAdFeedback = useCallback(
    async (adId: string, kind: AdFeedbackKind) => {
      const next: AdFeedbackMap = {
        ...adFeedback,
        [adId]: { kind, at: Date.now() },
      };
      setAdFeedback(next);
      await SecureStore.setItemAsync(AD_FEEDBACK_KEY, JSON.stringify(next));
    },
    [adFeedback],
  );

  const isAdHidden = useCallback(
    (adId: string) => {
      const fb = adFeedback[adId];
      return fb?.kind === 'not_interested' || fb?.kind === 'reported';
    },
    [adFeedback],
  );

  const value = useMemo(
    () => ({
      ready,
      isPremium,
      subscription,
      pinnedPostIds,
      pinLimit,
      paystackConfigured,
      paystackCheckoutReady,
      activatePlan,
      cancelSubscription,
      togglePin,
      isPinned,
      recordAdFeedback,
      adFeedback,
      isAdHidden,
    }),
    [
      ready,
      isPremium,
      subscription,
      pinnedPostIds,
      pinLimit,
      paystackConfigured,
      paystackCheckoutReady,
      activatePlan,
      cancelSubscription,
      togglePin,
      isPinned,
      recordAdFeedback,
      adFeedback,
      isAdHidden,
    ],
  );

  return (
    <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>
  );
}

function PaystackShell({
  publicKey,
  children,
}: {
  publicKey: string;
  children: ReactNode;
}) {
  const mod = getPaystackModule();
  if (!mod) {
    return <>{children}</>;
  }
  const { PaystackProvider } = mod;
  return (
    <PaystackProvider publicKey={publicKey} currency="NGN">
      {children}
    </PaystackProvider>
  );
}

export function PremiumProvider({ children }: { children: ReactNode }) {
  const publicKey = getPaystackPublicKey();

  if (!publicKey) {
    return <PremiumProviderInner>{children}</PremiumProviderInner>;
  }

  return (
    <PaystackShell publicKey={publicKey}>
      <PremiumProviderInner>{children}</PremiumProviderInner>
    </PaystackShell>
  );
}

export function usePremium(): PremiumState {
  const ctx = useContext(PremiumContext);
  if (!ctx) throw new Error('usePremium must be used within PremiumProvider');
  return ctx;
}
