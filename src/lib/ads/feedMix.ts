import { AdConfig } from '@/lib/constants';
import { DEMO_ADS, type SponsoredAd } from '@/lib/ads/catalog';
import type { FeedPost } from '@/lib/db/social';

export type FeedItem =
  | { kind: 'post'; post: FeedPost }
  | { kind: 'ad'; ad: SponsoredAd };

/** Interleave sponsored ads into the post list (everyone sees ads). */
export function buildFeedWithAds(
  posts: FeedPost[],
  isAdHidden: (adId: string) => boolean,
): FeedItem[] {
  const ads = DEMO_ADS.filter((a) => !isAdHidden(a.id));
  if (ads.length === 0 || posts.length === 0) {
    return posts.map((post) => ({ kind: 'post' as const, post }));
  }

  const out: FeedItem[] = [];
  let adIndex = 0;
  let adsInserted = 0;

  posts.forEach((post, i) => {
    out.push({ kind: 'post', post });
    const after = i + 1;
    if (
      after % AdConfig.insertEvery === 0 &&
      adsInserted < AdConfig.maxPerFeed &&
      adIndex < ads.length
    ) {
      out.push({ kind: 'ad', ad: ads[adIndex]! });
      adIndex += 1;
      adsInserted += 1;
    }
  });

  return out;
}
