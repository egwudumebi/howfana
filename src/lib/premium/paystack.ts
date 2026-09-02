import type { PremiumPlanId } from '@/lib/premium/plans';

/** Paystack public key — set EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY in .env */
export function getPaystackPublicKey(): string | null {
  const key = process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY?.trim();
  if (!key || key.includes('your_key')) return null;
  return key;
}

export function isPaystackConfigured(): boolean {
  return getPaystackPublicKey() != null;
}

import { isPaystackNativeAvailable } from '@/lib/premium/paystackNative';

export function isPaystackCheckoutReady(): boolean {
  return isPaystackConfigured() && isPaystackNativeAvailable();
}

export function buildPaystackReference(
  planId: PremiumPlanId,
  publicKey: string,
): string {
  const suffix = publicKey.replace(/[^a-zA-Z0-9]/g, '').slice(-8);
  return `hf_${planId}_${Date.now()}_${suffix}`;
}

/** Checkout email — Paystack requires a valid address. */
export function paystackEmailForUser(publicKey: string, displayName: string): string {
  const slug =
    displayName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 24) || 'member';
  const id = publicKey.slice(0, 8).toLowerCase();
  return `${slug}.${id}@howfana.app`;
}
