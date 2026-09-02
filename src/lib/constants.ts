export const SECRET_KEY_STORAGE_KEY = 'howfana.identity.secretKey';

export const DATABASE_NAME = 'howfana.db';

/** Nearby discovery prefs (SecureStore) */
export const NEARBY_DISCOVERY_KEY = 'howfana.nearby.discoveryEnabled';
export const INVISIBLE_MODE_KEY = 'howfana.nearby.invisibleMode';
export const PREMIUM_SUB_KEY = 'howfana.premium.subscription';
export const PINNED_POSTS_KEY = 'howfana.premium.pinnedPosts';
export const AD_FEEDBACK_KEY = 'howfana.ads.feedback';

/** Legal — user must accept before onboarding (SecureStore). */
export const LEGAL_AGREEMENT_KEY = 'howfana.legal.agreementVersion';
export const LEGAL_AGREEMENT_VERSION = '1.0';

export const EventType = {
  ProfileUpdate: 'profile.update',
  PostCreate: 'post.create',
  PostEdit: 'post.edit',
  PostRepost: 'post.repost',
  PostDelete: 'post.delete',
  ReelCreate: 'reel.create',
  StoryCreate: 'story.create',
  FollowAdd: 'follow.add',
  FollowRemove: 'follow.remove',
  MessageCreate: 'message.create',
  PeerHello: 'peer.hello',
  ReactionAdd: 'reaction.add',
  ReactionRemove: 'reaction.remove',
  CommentCreate: 'comment.create',
} as const;

export type EventTypeName = (typeof EventType)[keyof typeof EventType];

/** Event types replicated over sync. */
export const SYNCABLE_EVENT_TYPES: readonly string[] = [
  EventType.ProfileUpdate,
  EventType.FollowAdd,
  EventType.FollowRemove,
  EventType.PostCreate,
  EventType.PostEdit,
  EventType.PostRepost,
  EventType.PostDelete,
  EventType.ReelCreate,
  EventType.StoryCreate,
  EventType.ReactionAdd,
  EventType.ReactionRemove,
  EventType.CommentCreate,
  EventType.MessageCreate,
];

/** Nearby stories expire after 24 hours. */
export const StoryConfig = {
  ttlMs: 24 * 60 * 60 * 1000,
} as const;

/** Free vs Premium entitlements (client brief). */
export const PremiumConfig = {
  freePinLimit: 2,
  premiumPinLimit: 4,
  editWindowMs: 60 * 60 * 1000,
  priceLabel: 'from ₦1,500 / month',
} as const;

/** Sponsored ads in the community feed (shown to everyone). */
export const AdConfig = {
  insertEvery: 4,
  maxPerFeed: 3,
} as const;

export const REACTION_EMOJIS = ['👍', '❤️', '🔥', '😂'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export const MediaConfig = {
  maxWidth: 1280,
  jpegQuality: 0.7,
  chunkSize: 32_768,
  maxBytes: 2_000_000,
  maxImagesPerPost: 4,
  /** Short-form reel video caps (mesh transfer cost). */
  maxReelBytes: 8_000_000,
  maxReelDurationMs: 30_000,
} as const;

export const RelayConfig = {
  defaultTtl: 3,
  seenSetCapacity: 2000,
  rateLimitPerMinute: 120,
  logLimit: 40,
} as const;

/** Phase 1 LAN discovery / session ports and timers */
export const NetConfig = {
  udpPort: 47337,
  tcpPort: 47338,
  announceIntervalMs: 2000,
  peerTtlMs: 8000,
  heartbeatIntervalMs: 3000,
  heartbeatTimeoutMs: 10000,
  maxFrameBytes: 256_000,
  syncOfferLimit: 300,
  syncBatchLimit: 40,
  mediaWantBatch: 32,
} as const;
