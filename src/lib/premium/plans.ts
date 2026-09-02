export type PremiumPlanId = 'monthly' | 'semiannual' | 'yearly';

export type PremiumPlan = {
  id: PremiumPlanId;
  title: string;
  subtitle: string;
  priceNgn: number;
  durationMs: number;
  badge?: string;
  savingsLabel?: string;
  featured?: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const PREMIUM_PLANS: PremiumPlan[] = [
  {
    id: 'monthly',
    title: 'MONTHLY',
    subtitle: 'Premium access for 1 month',
    priceNgn: 1500,
    durationMs: 30 * DAY_MS,
  },
  {
    id: 'semiannual',
    title: '6 MONTHS',
    subtitle: 'Save ₦1,500 compared with monthly payments',
    priceNgn: 7500,
    durationMs: 183 * DAY_MS,
    badge: '⭐ BEST VALUE',
    featured: true,
  },
  {
    id: 'yearly',
    title: 'YEARLY',
    subtitle: 'Premium access for 12 months',
    priceNgn: 17000,
    durationMs: 365 * DAY_MS,
  },
];

export const PREMIUM_FEATURES = [
  '4 pinned posts',
  'Can edit posts for up to 1 hour after posting',
  'Can schedule posts to automatically publish at a chosen date and time',
  'Better visibility and growth — Premium posts have a better chance of reaching more people',
  'Still see ads',
] as const;

export function getPremiumPlan(id: PremiumPlanId): PremiumPlan {
  const plan = PREMIUM_PLANS.find((p) => p.id === id);
  if (!plan) {
    throw new Error(`Unknown premium plan: ${id}`);
  }
  return plan;
}

export function formatNgn(amount: number): string {
  return `₦${amount.toLocaleString('en-NG')}`;
}

export function planMonthlyEquivalent(plan: PremiumPlan): string {
  const months =
    plan.id === 'monthly' ? 1 : plan.id === 'semiannual' ? 6 : 12;
  const perMonth = Math.round(plan.priceNgn / months);
  return `${formatNgn(perMonth)}/mo`;
}
