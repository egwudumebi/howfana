import * as ed from '@noble/ed25519';

import { EventType, SYNCABLE_EVENT_TYPES } from '@/lib/constants';
import { createSignedEvent, verifyEvent } from '@/lib/crypto/events';
import { bytesToHex, hexToBytes } from '@/lib/crypto/encoding';
import '@/lib/crypto/setup';
import {
  MAX_POST_MEDIA,
  mediaJsonString,
  normalizePostMedia,
  parseMediaJson,
} from '@/lib/social/mediaPayload';
import { shouldUnlike } from '@/lib/social/reactions';

async function testKeyPair() {
  const secretKey = bytesToHex(ed.utils.randomSecretKey());
  const publicKey = bytesToHex(await ed.getPublicKeyAsync(hexToBytes(secretKey)));
  return { secretKey, publicKey };
}

describe('reaction unlike', () => {
  it('unlikes when the same emoji is chosen again', () => {
    expect(shouldUnlike('👍', '👍')).toBe(true);
    expect(shouldUnlike('❤️', '❤️')).toBe(true);
  });

  it('adds or switches when emoji differs or is absent', () => {
    expect(shouldUnlike(null, '👍')).toBe(false);
    expect(shouldUnlike(undefined, '❤️')).toBe(false);
    expect(shouldUnlike('👍', '❤️')).toBe(false);
  });

  it('signs reaction.remove events', async () => {
    const { secretKey, publicKey } = await testKeyPair();
    const event = await createSignedEvent(
      {
        type: EventType.ReactionRemove,
        author: publicKey,
        timestamp: Date.now(),
        payload: { postId: 'ab'.repeat(32) },
      },
      secretKey,
    );
    await expect(verifyEvent(event)).resolves.toBe(true);
    expect(event.type).toBe(EventType.ReactionRemove);
  });
});

describe('multi-media normalize', () => {
  it('accepts legacy scalar mediaCid as one-item list', () => {
    expect(
      normalizePostMedia({
        mediaCid: 'cid-1',
        mediaMime: 'image/jpeg',
        mediaSize: 1200,
      }),
    ).toEqual([{ cid: 'cid-1', mime: 'image/jpeg', size: 1200 }]);
  });

  it('prefers media array and caps at MAX_POST_MEDIA', () => {
    const media = Array.from({ length: 6 }, (_, i) => ({
      cid: `c${i}`,
      mime: 'image/jpeg',
      size: i,
    }));
    const normalized = normalizePostMedia({ media, mediaCid: 'ignored' });
    expect(normalized).toHaveLength(MAX_POST_MEDIA);
    expect(normalized[0].cid).toBe('c0');
    expect(normalized[3].cid).toBe('c3');
  });

  it('round-trips media_json', () => {
    const items = [
      { cid: 'a', mime: 'image/jpeg', size: 1 },
      { cid: 'b', mime: 'image/jpeg', size: 2 },
    ];
    const json = mediaJsonString(items);
    expect(parseMediaJson(json)).toEqual(items);
    expect(mediaJsonString([])).toBeNull();
  });

  it('signs post.create with media array', async () => {
    const { secretKey, publicKey } = await testKeyPair();
    const event = await createSignedEvent(
      {
        type: EventType.PostCreate,
        author: publicKey,
        timestamp: Date.now(),
        payload: {
          body: 'pics',
          media: [
            { cid: 'c1', mime: 'image/jpeg', size: 10 },
            { cid: 'c2', mime: 'image/jpeg', size: 20 },
          ],
          mediaCid: 'c1',
          mediaMime: 'image/jpeg',
          mediaSize: 10,
        },
      },
      secretKey,
    );
    await expect(verifyEvent(event)).resolves.toBe(true);
    const payload = event.payload as { media: unknown[] };
    expect(payload.media).toHaveLength(2);
  });
});

describe('repost', () => {
  it('signs post.repost with originalPostId', async () => {
    const { secretKey, publicKey } = await testKeyPair();
    const originalPostId = 'cd'.repeat(32);
    const event = await createSignedEvent(
      {
        type: EventType.PostRepost,
        author: publicKey,
        timestamp: Date.now(),
        payload: { originalPostId },
      },
      secretKey,
    );
    await expect(verifyEvent(event)).resolves.toBe(true);
    expect(event.type).toBe(EventType.PostRepost);
    expect((event.payload as { originalPostId: string }).originalPostId).toBe(
      originalPostId,
    );
  });

  it('uses distinct event ids for different authors on the same original', async () => {
    const a = await testKeyPair();
    const b = await testKeyPair();
    const originalPostId = 'ef'.repeat(32);
    const ts = 1_700_000_000_000;
    const eventA = await createSignedEvent(
      {
        type: EventType.PostRepost,
        author: a.publicKey,
        timestamp: ts,
        payload: { originalPostId },
      },
      a.secretKey,
    );
    const eventB = await createSignedEvent(
      {
        type: EventType.PostRepost,
        author: b.publicKey,
        timestamp: ts,
        payload: { originalPostId },
      },
      b.secretKey,
    );
    expect(eventA.id).not.toBe(eventB.id);
  });

  it('keeps PostRepost and ReactionRemove in syncable types', () => {
    expect(SYNCABLE_EVENT_TYPES).toContain(EventType.PostRepost);
    expect(SYNCABLE_EVENT_TYPES).toContain(EventType.ReactionRemove);
  });

  it('signs reel.create events', async () => {
    const { secretKey, publicKey } = await testKeyPair();
    const event = await createSignedEvent(
      {
        type: EventType.ReelCreate,
        author: publicKey,
        timestamp: Date.now(),
        payload: {
          caption: 'mesh reel',
          media: [{ cid: 'v1', mime: 'video/mp4', size: 1000 }],
          mediaCid: 'v1',
          durationMs: 12_000,
        },
      },
      secretKey,
    );
    await expect(verifyEvent(event)).resolves.toBe(true);
    expect(SYNCABLE_EVENT_TYPES).toContain(EventType.ReelCreate);
  });

  it('signs story.create events', async () => {
    const { secretKey, publicKey } = await testKeyPair();
    const event = await createSignedEvent(
      {
        type: EventType.StoryCreate,
        author: publicKey,
        timestamp: Date.now(),
        payload: {
          body: 'hello nearby',
          mediaCid: null,
          mediaMime: null,
          mediaSize: null,
        },
      },
      secretKey,
    );
    await expect(verifyEvent(event)).resolves.toBe(true);
    expect(SYNCABLE_EVENT_TYPES).toContain(EventType.StoryCreate);
  });
});
