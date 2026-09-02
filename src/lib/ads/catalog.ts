export type SponsoredAd = {
  id: string;
  advertiser: string;
  headline: string;
  body: string;
  cta: string;
  category: string;
  /** Why this ad might show (shown in “Why am I seeing this ad?”). */
  targetingHint: string;
};

/** Placeholder catalog until a real ad network / Howfana dashboard exists. */
export const DEMO_ADS: SponsoredAd[] = [
  {
    id: 'ad-local-market',
    advertiser: 'Howfana Market',
    headline: 'Shop nearby this weekend',
    body: 'Discover vendors around you — no account server required.',
    cta: 'Learn more',
    category: 'local_commerce',
    targetingHint: 'Shown because you’re active in a local community feed.',
  },
  {
    id: 'ad-campus-events',
    advertiser: 'Campus Pulse',
    headline: 'Events happening near you',
    body: 'Concerts, meetups, and study groups shared by people nearby.',
    cta: 'Explore',
    category: 'events',
    targetingHint: 'Shown based on general interest in nearby activity.',
  },
  {
    id: 'ad-mesh-skills',
    advertiser: 'SkillShare Local',
    headline: 'Trade skills offline',
    body: 'Find tutors and collaborators on your Wi‑Fi mesh.',
    cta: 'Get started',
    category: 'education',
    targetingHint: 'Shown to help grow useful local connections.',
  },
];

export type AdFeedbackKind = 'interested' | 'not_interested' | 'reported';

export type AdFeedbackMap = Record<
  string,
  { kind: AdFeedbackKind; at: number }
>;
