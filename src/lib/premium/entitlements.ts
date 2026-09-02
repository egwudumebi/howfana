import type { PremiumPlanId } from '@/lib/premium/plans';
import { getPremiumPlan } from '@/lib/premium/plans';
import { PremiumConfig } from '@/lib/constants';

export type PremiumSubscription = {
  active: boolean;
  /** Epoch ms when current period ends; null if inactive. */
  expiresAt: number | null;
  startedAt: number | null;
  planId: PremiumPlanId | null;
  paystackReference: string | null;
};

export const EMPTY_SUBSCRIPTION: PremiumSubscription = {
  active: false,
  expiresAt: null,
  startedAt: null,
  planId: null,
  paystackReference: null,
};

export function isSubscriptionActive(sub: PremiumSubscription, now = Date.now()): boolean {
  if (!sub.active || !sub.expiresAt) return false;
  return sub.expiresAt > now;
}

export function pinLimitFor(isPremium: boolean): number {
  return isPremium ? PremiumConfig.premiumPinLimit : PremiumConfig.freePinLimit;
}

export function canEditPost(
  isPremium: boolean,
  createdAt: number,
  now = Date.now(),
): boolean {
  if (!isPremium) return false;
  return now - createdAt <= PremiumConfig.editWindowMs;
}

export function activateSubscription(
  planId: PremiumPlanId,
  reference: string | null = null,
  now = Date.now(),
): PremiumSubscription {
  const plan = getPremiumPlan(planId);
  return {
    active: true,
    startedAt: now,
    expiresAt: now + plan.durationMs,
    planId,
    paystackReference: reference,
  };
}

/** @deprecated Test helper — use activateSubscription */
export function startMockSubscription(now = Date.now()): PremiumSubscription {
  return activateSubscription('monthly', 'mock', now);
}
