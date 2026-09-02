import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import {
  EventType,
  MediaConfig,
  NetConfig,
  type ReactionEmoji,
} from '@/lib/constants';
import { createSignedEvent, type MeshEvent } from '@/lib/crypto/events';
import { ingestEvent } from '@/lib/db/applyEvent';
import {
  cancelScheduledPost,
  insertScheduledPost,
  listPendingScheduled,
  listUpcomingScheduled,
  markScheduledPublished,
  type ScheduledPostRow,
} from '@/lib/db/scheduled';
import {
  getPostById,
  hasReposted,
  isFollowing,
  listComments,
  listNearbyFeedPosts,
  listReels,
  type CommentRow,
  type FeedPost,
} from '@/lib/db/social';
import {
  listNearbyStoryRings,
  markStoryViewed,
  type StoryRing,
} from '@/lib/db/stories';
import {
  chunkIds,
  filterMissingEventIds,
  getEventsByIds,
  listSyncableEventIds,
} from '@/lib/db/sync';
import { loadOrCreateIdentity } from '@/lib/identity/store';
import { importLocalImage, importLocalVideo } from '@/lib/media/store';
import type { Frame } from '@/lib/net/types';
import { canEditPost } from '@/lib/premium/entitlements';
import { normalizeMediaLayout, type MediaLayout } from '@/lib/social/mediaLayout';
import { MAX_POST_MEDIA, type PostMediaItem } from '@/lib/social/mediaPayload';
import { shouldUnlike } from '@/lib/social/reactions';
import { useIdentity } from '@/providers/IdentityProvider';
import { usePeers } from '@/providers/PeerProvider';
import { usePremium } from '@/providers/PremiumProvider';
import { useRelay } from '@/providers/RelayProvider';

type CreatePostOptions = {
  mediaLayout?: MediaLayout;
  /** Epoch ms — Premium only. When set, post is queued instead of published now. */
  scheduleAt?: number | null;
};

type SocialState = {
  posts: FeedPost[];
  reels: FeedPost[];
  storyRings: StoryRing[];
  scheduledPosts: ScheduledPostRow[];
  syncing: boolean;
  lastSyncMessage: string | null;
  followingMap: Record<string, boolean>;
  refreshFeed: () => Promise<void>;
  refreshReels: () => Promise<void>;
  refreshStories: () => Promise<void>;
  refreshScheduled: () => Promise<void>;
  syncNow: () => Promise<void>;
  createPost: (
    body: string,
    imageUris?: string[] | string | null,
    options?: CreatePostOptions | MediaLayout,
  ) => Promise<void>;
  editPost: (postId: string, body: string) => Promise<void>;
  schedulePost: (
    body: string,
    publishAt: number,
    imageUris?: string[] | null,
  ) => Promise<void>;
  cancelScheduled: (id: string) => Promise<void>;
  createReel: (
    caption: string,
    videoUri: string,
    opts?: { mime?: string | null; durationMs?: number | null },
  ) => Promise<void>;
  createStory: (body: string, imageUri?: string | null) => Promise<void>;
  markStoriesViewed: (storyIds: string[]) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  follow: (followee: string) => Promise<void>;
  unfollow: (followee: string) => Promise<void>;
  toggleFollow: (followee: string) => Promise<void>;
  reactToPost: (postId: string, emoji: ReactionEmoji) => Promise<void>;
  repostPost: (originalPostId: string) => Promise<void>;
  commentOnPost: (postId: string, body: string) => Promise<void>;
  loadComments: (postId: string) => Promise<CommentRow[]>;
  refreshFollowing: (keys: string[]) => Promise<void>;
};

const SocialContext = createContext<SocialState | null>(null);

export function SocialProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { ready, publicKey } = useIdentity();
  const {
    connectedKeys,
    nearbyPeers,
    sendFrame,
    broadcastFrame,
    setSyncFrameHandler,
    onPeerReady,
  } = usePeers();
  const { floodEvent, onRelayApplied } = useRelay();
  const { isPremium } = usePremium();

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [reels, setReels] = useState<FeedPost[]>([]);
  const [storyRings, setStoryRings] = useState<StoryRing[]>([]);
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPostRow[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});

  const refreshFeed = useCallback(async () => {
    if (!publicKey) {
      setPosts([]);
      return;
    }
    const nearbyKeys = nearbyPeers.map((p) => p.publicKey);
    const feed = await listNearbyFeedPosts(db, publicKey, nearbyKeys);
    setPosts(feed);
  }, [db, publicKey, nearbyPeers]);

  const refreshReels = useCallback(async () => {
    if (!publicKey) {
      setReels([]);
      return;
    }
    setReels(await listReels(db, publicKey));
  }, [db, publicKey]);

  const refreshScheduled = useCallback(async () => {
    setScheduledPosts(await listUpcomingScheduled(db));
  }, [db]);

  const refreshStories = useCallback(async () => {
    if (!publicKey) {
      setStoryRings([]);
      return;
    }
    const nearbyKeys = nearbyPeers.map((p) => p.publicKey);
    setStoryRings(await listNearbyStoryRings(db, publicKey, nearbyKeys));
  }, [db, publicKey, nearbyPeers]);

  const refreshFollowing = useCallback(
    async (keys: string[]) => {
      if (!publicKey) return;
      const next: Record<string, boolean> = {};
      for (const key of keys) {
        next[key] = await isFollowing(db, publicKey, key);
      }
      setFollowingMap((prev) => ({ ...prev, ...next }));
    },
    [db, publicKey],
  );

  const publishAndGossip = useCallback(
    async (event: MeshEvent) => {
      await ingestEvent(db, event);
      await broadcastFrame({ type: 'sync_batch', events: [event] });
      await floodEvent(event);
      await refreshFeed();
      await refreshReels();
      await refreshStories();
    },
    [db, broadcastFrame, floodEvent, refreshFeed, refreshReels, refreshStories],
  );

  const createPost = useCallback(
    async (
      body: string,
      imageUris?: string[] | string | null,
      options?: CreatePostOptions | MediaLayout,
    ) => {
      const opts: CreatePostOptions =
        typeof options === 'string' || options == null
          ? { mediaLayout: options ?? undefined }
          : options;
      const trimmed = body.trim();
      const uris = Array.isArray(imageUris)
        ? imageUris.filter(Boolean)
        : imageUris
          ? [imageUris]
          : [];
      const capped = uris.slice(0, MediaConfig.maxImagesPerPost ?? MAX_POST_MEDIA);
      if (!trimmed && capped.length === 0) {
        throw new Error('Post cannot be empty');
      }

      if (opts.scheduleAt != null) {
        if (!isPremium) {
          throw new Error('Scheduling posts requires Premium');
        }
        if (opts.scheduleAt <= Date.now()) {
          throw new Error('Pick a future date and time');
        }
        await insertScheduledPost(db, {
          id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          body: trimmed,
          mediaUris: capped,
          mediaLayout: opts.mediaLayout ?? null,
          publishAt: opts.scheduleAt,
        });
        await refreshScheduled();
        return;
      }

      const media: PostMediaItem[] = [];
      const mediaOffers: Array<{
        cid: string;
        size: number;
        mime: string;
        chunkSize: number;
        chunkCount: number;
      }> = [];

      for (const uri of capped) {
        const imported = await importLocalImage(db, uri);
        media.push({
          cid: imported.cid,
          mime: imported.mime,
          size: imported.size,
        });
        mediaOffers.push({
          cid: imported.cid,
          size: imported.size,
          mime: imported.mime,
          chunkSize: imported.chunkSize,
          chunkCount: imported.chunkCount,
        });
      }

      const first = media[0] ?? null;
      const layout = normalizeMediaLayout(opts.mediaLayout, media.length);
      const identity = await loadOrCreateIdentity();
      const event = await createSignedEvent(
        {
          type: EventType.PostCreate,
          author: identity.publicKey,
          timestamp: Date.now(),
          payload: {
            body: trimmed,
            media,
            mediaCid: first?.cid ?? null,
            mediaMime: first?.mime ?? null,
            mediaSize: first?.size ?? null,
            mediaLayout: layout,
            visibilityBoost: isPremium,
          },
        },
        identity.secretKey,
      );
      await publishAndGossip(event);
      for (const offer of mediaOffers) {
        await broadcastFrame({ type: 'media_offer', ...offer });
      }
    },
    [db, publishAndGossip, broadcastFrame, isPremium, refreshScheduled],
  );

  const editPost = useCallback(
    async (postId: string, body: string) => {
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Post cannot be empty');
      if (!publicKey) throw new Error('Identity not ready');
      if (!isPremium) {
        throw new Error('Editing posts requires Premium');
      }

      const existing = await getPostById(db, postId, publicKey);
      if (!existing || existing.author !== publicKey) {
        throw new Error('You can only edit your own posts');
      }
      if (!canEditPost(true, existing.createdAt)) {
        throw new Error('Edit window is 1 hour after posting');
      }

      const identity = await loadOrCreateIdentity();
      const event = await createSignedEvent(
        {
          type: EventType.PostEdit,
          author: identity.publicKey,
          timestamp: Date.now(),
          payload: { postId, body: trimmed },
        },
        identity.secretKey,
      );
      await publishAndGossip(event);
    },
    [db, publicKey, isPremium, publishAndGossip],
  );

  const schedulePost = useCallback(
    async (body: string, publishAt: number, imageUris?: string[] | null) => {
      await createPost(body, imageUris ?? null, { scheduleAt: publishAt });
    },
    [createPost],
  );

  const cancelScheduled = useCallback(
    async (id: string) => {
      await cancelScheduledPost(db, id);
      await refreshScheduled();
    },
    [db, refreshScheduled],
  );

  const flushScheduled = useCallback(async () => {
    if (!isPremium) return;
    const due = await listPendingScheduled(db);
    for (const row of due) {
      try {
        await createPost(row.body, row.mediaUris, {
          mediaLayout: (row.mediaLayout as MediaLayout | null) ?? undefined,
        });
        await markScheduledPublished(db, row.id);
      } catch {
        // leave pending for retry
      }
    }
    if (due.length > 0) await refreshScheduled();
  }, [db, isPremium, createPost, refreshScheduled]);

  const createStory = useCallback(
    async (body: string, imageUri?: string | null) => {
      const trimmed = body.trim();
      if (!trimmed && !imageUri) {
        throw new Error('Story needs text or a photo');
      }

      let mediaCid: string | null = null;
      let mediaMime: string | null = null;
      let mediaSize: number | null = null;
      let offer: {
        cid: string;
        size: number;
        mime: string;
        chunkSize: number;
        chunkCount: number;
      } | null = null;

      if (imageUri) {
        const imported = await importLocalImage(db, imageUri);
        mediaCid = imported.cid;
        mediaMime = imported.mime;
        mediaSize = imported.size;
        offer = {
          cid: imported.cid,
          size: imported.size,
          mime: imported.mime,
          chunkSize: imported.chunkSize,
          chunkCount: imported.chunkCount,
        };
      }

      const identity = await loadOrCreateIdentity();
      const event = await createSignedEvent(
        {
          type: EventType.StoryCreate,
          author: identity.publicKey,
          timestamp: Date.now(),
          payload: {
            body: trimmed,
            mediaCid,
            mediaMime,
            mediaSize,
          },
        },
        identity.secretKey,
      );
      await publishAndGossip(event);
      if (offer) {
        await broadcastFrame({ type: 'media_offer', ...offer });
      }
    },
    [db, publishAndGossip, broadcastFrame],
  );

  const markStoriesViewed = useCallback(
    async (storyIds: string[]) => {
      if (!publicKey || storyIds.length === 0) return;
      for (const id of storyIds) {
        await markStoryViewed(db, id, publicKey);
      }
      await refreshStories();
    },
    [db, publicKey, refreshStories],
  );

  const createReel = useCallback(
    async (
      caption: string,
      videoUri: string,
      opts?: { mime?: string | null; durationMs?: number | null },
    ) => {
      if (!videoUri) {
        throw new Error('Reel needs a video');
      }
      if (
        typeof opts?.durationMs === 'number' &&
        opts.durationMs > MediaConfig.maxReelDurationMs
      ) {
        throw new Error(
          `Reel must be ${Math.round(MediaConfig.maxReelDurationMs / 1000)}s or shorter`,
        );
      }

      const imported = await importLocalVideo(db, videoUri, opts?.mime);
      const media: PostMediaItem[] = [
        {
          cid: imported.cid,
          mime: imported.mime,
          size: imported.size,
        },
      ];
      const identity = await loadOrCreateIdentity();
      const event = await createSignedEvent(
        {
          type: EventType.ReelCreate,
          author: identity.publicKey,
          timestamp: Date.now(),
          payload: {
            caption: caption.trim(),
            body: caption.trim(),
            media,
            mediaCid: media[0].cid,
            mediaMime: media[0].mime,
            mediaSize: media[0].size,
            durationMs: opts?.durationMs ?? null,
          },
        },
        identity.secretKey,
      );
      await publishAndGossip(event);
      await broadcastFrame({
        type: 'media_offer',
        cid: imported.cid,
        size: imported.size,
        mime: imported.mime,
        chunkSize: imported.chunkSize,
        chunkCount: imported.chunkCount,
      });
    },
    [db, publishAndGossip, broadcastFrame],
  );

  const deletePost = useCallback(
    async (postId: string) => {
      const identity = await loadOrCreateIdentity();
      const owned = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM posts WHERE id = ? AND author = ?',
        [postId, identity.publicKey],
      );
      if (!owned) {
        throw new Error('You can only delete your own posts');
      }
      const event = await createSignedEvent(
        {
          type: EventType.PostDelete,
          author: identity.publicKey,
          timestamp: Date.now(),
          payload: { postId },
        },
        identity.secretKey,
      );
      await publishAndGossip(event);
    },
    [db, publishAndGossip],
  );

  const follow = useCallback(
    async (followee: string) => {
      const identity = await loadOrCreateIdentity();
      const event = await createSignedEvent(
        {
          type: EventType.FollowAdd,
          author: identity.publicKey,
          timestamp: Date.now(),
          payload: { followee: followee.toLowerCase() },
        },
        identity.secretKey,
      );
      await publishAndGossip(event);
      setFollowingMap((prev) => ({ ...prev, [followee.toLowerCase()]: true }));
    },
    [publishAndGossip],
  );

  const unfollow = useCallback(
    async (followee: string) => {
      const identity = await loadOrCreateIdentity();
      const event = await createSignedEvent(
        {
          type: EventType.FollowRemove,
          author: identity.publicKey,
          timestamp: Date.now(),
          payload: { followee: followee.toLowerCase() },
        },
        identity.secretKey,
      );
      await publishAndGossip(event);
      setFollowingMap((prev) => ({ ...prev, [followee.toLowerCase()]: false }));
    },
    [publishAndGossip],
  );

  const toggleFollow = useCallback(
    async (followee: string) => {
      if (!publicKey) {
        throw new Error('Identity not ready');
      }
      const key = followee.toLowerCase();
      const currently = followingMap[key] ?? (await isFollowing(db, publicKey, key));
      if (currently) {
        await unfollow(key);
      } else {
        await follow(key);
      }
    },
    [db, publicKey, followingMap, follow, unfollow],
  );

  const reactToPost = useCallback(
    async (postId: string, emoji: ReactionEmoji) => {
      const identity = await loadOrCreateIdentity();
      const current = await db.getFirstAsync<{ emoji: string }>(
        `SELECT emoji FROM reactions WHERE post_id = ? AND author = ?`,
        [postId, identity.publicKey],
      );

      if (shouldUnlike(current?.emoji, emoji)) {
        const event = await createSignedEvent(
          {
            type: EventType.ReactionRemove,
            author: identity.publicKey,
            timestamp: Date.now(),
            payload: { postId },
          },
          identity.secretKey,
        );
        await publishAndGossip(event);
        return;
      }

      const event = await createSignedEvent(
        {
          type: EventType.ReactionAdd,
          author: identity.publicKey,
          timestamp: Date.now(),
          payload: { postId, emoji },
        },
        identity.secretKey,
      );
      await publishAndGossip(event);
    },
    [db, publishAndGossip],
  );

  const repostPost = useCallback(
    async (originalPostId: string) => {
      const identity = await loadOrCreateIdentity();
      if (await hasReposted(db, identity.publicKey, originalPostId)) {
        throw new Error('You already reposted this');
      }
      const event = await createSignedEvent(
        {
          type: EventType.PostRepost,
          author: identity.publicKey,
          timestamp: Date.now(),
          payload: { originalPostId },
        },
        identity.secretKey,
      );
      await publishAndGossip(event);
    },
    [db, publishAndGossip],
  );

  const commentOnPost = useCallback(
    async (postId: string, body: string) => {
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Comment cannot be empty');
      const identity = await loadOrCreateIdentity();
      const event = await createSignedEvent(
        {
          type: EventType.CommentCreate,
          author: identity.publicKey,
          timestamp: Date.now(),
          payload: { postId, body: trimmed, parentId: null },
        },
        identity.secretKey,
      );
      await publishAndGossip(event);
    },
    [publishAndGossip],
  );

  const loadComments = useCallback(
    async (postId: string) => listComments(db, postId),
    [db],
  );

  const startOffer = useCallback(
    async (connectionId: string) => {
      const ids = await listSyncableEventIds(db);
      await sendFrame(connectionId, { type: 'sync_offer', ids });
    },
    [db, sendFrame],
  );

  const handleSyncFrame = useCallback(
    async (
      connectionId: string,
      _remotePublicKey: string,
      frame: Extract<Frame, { type: 'sync_offer' | 'sync_want' | 'sync_batch' }>,
    ) => {
      if (frame.type === 'sync_offer') {
        const missing = await filterMissingEventIds(db, frame.ids);
        for (const chunk of chunkIds(missing, NetConfig.syncBatchLimit)) {
          if (chunk.length === 0) continue;
          await sendFrame(connectionId, { type: 'sync_want', ids: chunk });
        }
        return;
      }

      if (frame.type === 'sync_want') {
        const events = await getEventsByIds(db, frame.ids);
        for (const chunk of chunkIds(
          events.map((e) => e.id),
          NetConfig.syncBatchLimit,
        )) {
          const batch = events.filter((e) => chunk.includes(e.id));
          if (batch.length === 0) continue;
          await sendFrame(connectionId, { type: 'sync_batch', events: batch });
        }
        return;
      }

      if (frame.type === 'sync_batch') {
        let applied = 0;
        for (const event of frame.events) {
          try {
            const isNew = await ingestEvent(db, event);
            if (isNew) applied += 1;
          } catch (err) {
            console.warn('sync ingest failed', event.id, err);
          }
        }
        if (applied > 0) {
          setLastSyncMessage(`Synced ${applied} new event${applied === 1 ? '' : 's'}`);
          await refreshFeed();
          await refreshReels();
          await refreshStories();
        }
      }
    },
    [db, sendFrame, refreshFeed, refreshReels, refreshStories],
  );

  const syncNow = useCallback(async () => {
    if (connectedKeys.length === 0) {
      setLastSyncMessage('No connected peers');
      return;
    }
    setSyncing(true);
    try {
      const ids = await listSyncableEventIds(db);
      await broadcastFrame({ type: 'sync_offer', ids });
      setLastSyncMessage(`Offered ${ids.length} events to ${connectedKeys.length} peer(s)`);
    } finally {
      setSyncing(false);
    }
  }, [connectedKeys, db, broadcastFrame]);

  useEffect(() => {
    setSyncFrameHandler(handleSyncFrame);
    const unsub = onPeerReady((connectionId) => {
      void startOffer(connectionId);
    });
    return () => {
      setSyncFrameHandler(null);
      unsub();
    };
  }, [handleSyncFrame, startOffer, setSyncFrameHandler, onPeerReady]);

  useEffect(() => {
    if (ready && publicKey) {
      void refreshFeed();
      void refreshReels();
      void refreshStories();
    }
  }, [ready, publicKey, refreshFeed, refreshReels, refreshStories]);

  useEffect(() => {
    void refreshStories();
  }, [nearbyPeers, refreshStories]);

  useEffect(() => {
    return onRelayApplied((event) => {
      setLastSyncMessage(`Relayed ${event.type}`);
      void refreshFeed();
      void refreshReels();
      void refreshStories();
    });
  }, [onRelayApplied, refreshFeed, refreshReels, refreshStories]);

  useEffect(() => {
    if (connectedKeys.length > 0) {
      void refreshFollowing(connectedKeys);
    }
  }, [connectedKeys, refreshFollowing]);

  useEffect(() => {
    void refreshScheduled();
  }, [refreshScheduled]);

  useEffect(() => {
    void flushScheduled();
    const t = setInterval(() => {
      void flushScheduled();
    }, 30_000);
    return () => clearInterval(t);
  }, [flushScheduled]);

  const value = useMemo(
    () => ({
      posts,
      reels,
      storyRings,
      scheduledPosts,
      syncing,
      lastSyncMessage,
      followingMap,
      refreshFeed,
      refreshReels,
      refreshStories,
      refreshScheduled,
      syncNow,
      createPost,
      editPost,
      schedulePost,
      cancelScheduled,
      createReel,
      createStory,
      markStoriesViewed,
      deletePost,
      follow,
      unfollow,
      toggleFollow,
      reactToPost,
      repostPost,
      commentOnPost,
      loadComments,
      refreshFollowing,
    }),
    [
      posts,
      reels,
      storyRings,
      scheduledPosts,
      syncing,
      lastSyncMessage,
      followingMap,
      refreshFeed,
      refreshReels,
      refreshStories,
      refreshScheduled,
      syncNow,
      createPost,
      editPost,
      schedulePost,
      cancelScheduled,
      createReel,
      createStory,
      markStoriesViewed,
      deletePost,
      follow,
      unfollow,
      toggleFollow,
      reactToPost,
      repostPost,
      commentOnPost,
      loadComments,
      refreshFollowing,
    ],
  );

  return (
    <SocialContext.Provider value={value}>{children}</SocialContext.Provider>
  );
}

export function useSocial(): SocialState {
  const ctx = useContext(SocialContext);
  if (!ctx) {
    throw new Error('useSocial must be used within SocialProvider');
  }
  return ctx;
}
