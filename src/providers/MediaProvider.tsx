import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { MediaConfig, NetConfig } from '@/lib/constants';
import { chunkList } from '@/lib/db/sync';
import { applyAvatarMediaReady } from '@/lib/db/profiles';
import {
  ensurePendingMedia,
  getChunkBase64,
  getMediaObject,
  getMissingIndexes,
  listIncompleteMediaCidsFromPosts,
  storeChunk,
  tryFinalizeMedia,
} from '@/lib/media/store';
import { chunkCountForSize } from '@/lib/media/chunking';
import type { Frame } from '@/lib/net/types';
import { useIdentity } from '@/providers/IdentityProvider';
import { usePeers } from '@/providers/PeerProvider';
import { useSocial } from '@/providers/SocialProvider';

type MediaState = {
  requestMissingMedia: () => Promise<void>;
};

const MediaContext = createContext<MediaState | null>(null);

export function MediaProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { refresh: refreshIdentity } = useIdentity();
  const {
    connectedKeys,
    sendFrame,
    broadcastFrame,
    setMediaFrameHandler,
    onPeerReady,
  } = usePeers();
  const { lastSyncMessage, refreshFeed, refreshStories } = useSocial();
  const requestingRef = useRef(new Set<string>());

  const offerCompleteMedia = useCallback(
    async (connectionId: string, cid: string) => {
      const media = await getMediaObject(db, cid);
      if (!media || media.status !== 'complete') return;
      await sendFrame(connectionId, {
        type: 'media_offer',
        cid: media.cid,
        size: media.size,
        mime: media.mime,
        chunkSize: media.chunkSize,
        chunkCount: media.chunkCount,
      });
    },
    [db, sendFrame],
  );

  const requestCid = useCallback(
    async (
      cid: string,
      hint?: { mime?: string; size?: number },
    ) => {
      if (requestingRef.current.has(cid)) return;
      requestingRef.current.add(cid);
      try {
        let media = await getMediaObject(db, cid);
        if (media?.status === 'complete') return;

        if (!media) {
          const size = hint?.size ?? 0;
          const chunkSize = MediaConfig.chunkSize;
          media = await ensurePendingMedia(db, {
            cid,
            size,
            mime: hint?.mime || 'image/jpeg',
            chunkSize,
            chunkCount: size > 0 ? chunkCountForSize(size, chunkSize) : 0,
          });
        }

        const missing = await getMissingIndexes(db, cid);
        if (missing.length === 0) {
          if (media.chunkCount > 0) {
            const finalized = await tryFinalizeMedia(db, cid);
            if (finalized?.localUri) {
              await applyAvatarMediaReady(db, cid, finalized.localUri);
              await refreshIdentity();
            }
            await refreshFeed();
            await refreshStories();
          } else {
            // Unknown size — ask peers to offer metadata.
            await broadcastFrame({
              type: 'media_want',
              cid,
              indexes: [],
            });
          }
          return;
        }

        for (const batch of chunkList(missing, NetConfig.mediaWantBatch)) {
          await broadcastFrame({ type: 'media_want', cid, indexes: batch });
        }
      } finally {
        requestingRef.current.delete(cid);
      }
    },
    [db, broadcastFrame, refreshFeed],
  );

  const requestMissingMedia = useCallback(async () => {
    const incomplete = await listIncompleteMediaCidsFromPosts(db);
    for (const item of incomplete) {
      await requestCid(item.cid, { mime: item.mime, size: item.size });
    }
  }, [db, requestCid]);

  const handleMediaFrame = useCallback(
    async (
      connectionId: string,
      _remotePublicKey: string,
      frame: Extract<Frame, { type: 'media_offer' | 'media_want' | 'media_chunk' }>,
    ) => {
      if (frame.type === 'media_offer') {
        const existing = await getMediaObject(db, frame.cid);
        if (existing?.status === 'complete') return;

        await ensurePendingMedia(db, {
          cid: frame.cid,
          size: frame.size,
          mime: frame.mime,
          chunkSize: frame.chunkSize,
          chunkCount: frame.chunkCount,
        });
        const missing = await getMissingIndexes(db, frame.cid);
        for (const batch of chunkList(missing, NetConfig.mediaWantBatch)) {
          if (batch.length === 0) continue;
          await sendFrame(connectionId, {
            type: 'media_want',
            cid: frame.cid,
            indexes: batch,
          });
        }
        return;
      }

      if (frame.type === 'media_want') {
        const media = await getMediaObject(db, frame.cid);
        if (!media || media.status !== 'complete') {
          return;
        }

        if (frame.indexes.length === 0) {
          await offerCompleteMedia(connectionId, frame.cid);
          return;
        }

        for (const index of frame.indexes) {
          const data = await getChunkBase64(db, frame.cid, index);
          if (!data) continue;
          await sendFrame(connectionId, {
            type: 'media_chunk',
            cid: frame.cid,
            index,
            data,
          });
        }
        return;
      }

      if (frame.type === 'media_chunk') {
        let media = await getMediaObject(db, frame.cid);
        if (!media) {
          // Create a placeholder pending object; size unknown until offer.
          await ensurePendingMedia(db, {
            cid: frame.cid,
            size: 0,
            mime: 'image/jpeg',
            chunkSize: MediaConfig.chunkSize,
            chunkCount: 0,
          });
          media = await getMediaObject(db, frame.cid);
        }
        if (!media || media.status === 'complete') return;

        await storeChunk(db, frame.cid, frame.index, frame.data);

        // If chunkCount unknown, grow it to cover received index.
        if (media.chunkCount <= frame.index) {
          await ensurePendingMedia(db, {
            cid: media.cid,
            size: media.size,
            mime: media.mime,
            chunkSize: media.chunkSize || MediaConfig.chunkSize,
            chunkCount: frame.index + 1,
          });
        }

        const finalized = await tryFinalizeMedia(db, frame.cid);
        if (finalized?.status === 'complete') {
          if (finalized.localUri) {
            await applyAvatarMediaReady(db, frame.cid, finalized.localUri);
            await refreshIdentity();
          }
          await refreshFeed();
          await refreshStories();
        }
      }
    },
    [db, sendFrame, offerCompleteMedia, refreshFeed, refreshStories, refreshIdentity],
  );

  useEffect(() => {
    setMediaFrameHandler(handleMediaFrame);
    return () => setMediaFrameHandler(null);
  }, [handleMediaFrame, setMediaFrameHandler]);

  useEffect(() => {
    const unsub = onPeerReady((connectionId) => {
      void (async () => {
        const incomplete = await listIncompleteMediaCidsFromPosts(db);
        for (const item of incomplete) {
          // Prefer asking the newly ready peer via want; also re-offer completes we have.
          const local = await getMediaObject(db, item.cid);
          if (local?.status === 'complete') {
            await offerCompleteMedia(connectionId, item.cid);
          } else {
            await requestCid(item.cid, { mime: item.mime, size: item.size });
          }
        }
      })();
    });
    return unsub;
  }, [onPeerReady, db, offerCompleteMedia, requestCid]);

  useEffect(() => {
    if (connectedKeys.length === 0) return;
    void requestMissingMedia();
  }, [connectedKeys, lastSyncMessage, requestMissingMedia]);

  const value = useMemo(
    () => ({ requestMissingMedia }),
    [requestMissingMedia],
  );

  return (
    <MediaContext.Provider value={value}>{children}</MediaContext.Provider>
  );
}

export function useMedia(): MediaState {
  const ctx = useContext(MediaContext);
  if (!ctx) {
    throw new Error('useMedia must be used within MediaProvider');
  }
  return ctx;
}
