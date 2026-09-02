import { buildFeedWithAds } from '@/lib/ads/feedMix';
import type { FeedPost } from '@/lib/db/social';
import {
  canEditPost,
  pinLimitFor,
  startMockSubscription,
  isSubscriptionActive,
} from '@/lib/premium/entitlements';
import { getPremiumPlan } from '@/lib/premium/plans';
import { PremiumConfig } from '@/lib/constants';

function stubPost(id: string, boost = false): FeedPost {
  return {
    id,
    author: 'a',
    authorName: 'Ada',
    authorAvatarUri: null,
    body: 'hi',
    createdAt: 1,
    editedAt: null,
    visibilityBoost: boost,
    reactionCounts: {},
    myReaction: null,
    commentCount: 0,
    mediaCid: null,
    mediaMime: null,
    mediaSize: null,
    mediaUri: null,
    mediaStatus: 'none',
    mediaProgress: 0,
    media: [],
    mediaLayout: 'grid',
    kind: 'post',
    durationMs: null,
    repostOf: null,
    original: null,
    iReposted: false,
  };
}

describe('premium entitlements', () => {
  it('gives free and premium pin limits', () => {
    expect(pinLimitFor(false)).toBe(PremiumConfig.freePinLimit);
    expect(pinLimitFor(true)).toBe(PremiumConfig.premiumPinLimit);
  });

  it('allows edit only for premium within the window', () => {
    const now = 1_000_000;
    expect(canEditPost(false, now - 1000, now)).toBe(false);
    expect(canEditPost(true, now - 1000, now)).toBe(true);
    expect(
      canEditPost(true, now - PremiumConfig.editWindowMs - 1, now),
    ).toBe(false);
  });

  it('activates a monthly subscription', () => {
    const now = Date.now();
    const sub = startMockSubscription(now);
    expect(isSubscriptionActive(sub, now)).toBe(true);
    expect(sub.planId).toBe('monthly');
    expect(
      isSubscriptionActive(sub, now + getPremiumPlan('monthly').durationMs + 1),
    ).toBe(false);
  });
});

describe('feed ads', () => {
  it('inserts sponsored ads and skips hidden ones', () => {
    const posts = [1, 2, 3, 4, 5].map((n) => stubPost(`p${n}`));
    const mixed = buildFeedWithAds(posts, () => false);
    expect(mixed.some((i) => i.kind === 'ad')).toBe(true);
    expect(mixed.filter((i) => i.kind === 'post')).toHaveLength(5);

    const none = buildFeedWithAds(posts, () => true);
    expect(none.every((i) => i.kind === 'post')).toBe(true);
  });
});
