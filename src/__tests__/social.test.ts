import * as ed from '@noble/ed25519';

import { EventType } from '@/lib/constants';
import { createSignedEvent, verifyEvent } from '@/lib/crypto/events';
import { bytesToHex, hexToBytes } from '@/lib/crypto/encoding';
import '@/lib/crypto/setup';
import { chunkIds, selectWantedIds } from '@/lib/db/sync';

async function testKeyPair() {
  const secretKey = bytesToHex(ed.utils.randomSecretKey());
  const publicKey = bytesToHex(await ed.getPublicKeyAsync(hexToBytes(secretKey)));
  return { secretKey, publicKey };
}

describe('sync selection', () => {
  it('requests only missing ids', () => {
    const offered = ['a', 'b', 'c', 'd'];
    const have = new Set(['b', 'd']);
    expect(selectWantedIds(offered, have)).toEqual(['a', 'c']);
  });

  it('chunks ids for batch limits', () => {
    expect(chunkIds(['1', '2', '3', '4', '5'], 2)).toEqual([
      ['1', '2'],
      ['3', '4'],
      ['5'],
    ]);
  });
});

describe('social events', () => {
  it('signs post.create events', async () => {
    const { secretKey, publicKey } = await testKeyPair();
    const event = await createSignedEvent(
      {
        type: EventType.PostCreate,
        author: publicKey,
        timestamp: Date.now(),
        payload: { body: 'Hello mesh' },
      },
      secretKey,
    );
    await expect(verifyEvent(event)).resolves.toBe(true);
    expect(event.type).toBe(EventType.PostCreate);
  });

  it('signs follow.add and reaction.add', async () => {
    const { secretKey, publicKey } = await testKeyPair();
    const follow = await createSignedEvent(
      {
        type: EventType.FollowAdd,
        author: publicKey,
        timestamp: Date.now(),
        payload: { followee: 'ab'.repeat(32) },
      },
      secretKey,
    );
    const reaction = await createSignedEvent(
      {
        type: EventType.ReactionAdd,
        author: publicKey,
        timestamp: Date.now(),
        payload: { postId: follow.id, emoji: '👍' },
      },
      secretKey,
    );
    await expect(verifyEvent(follow)).resolves.toBe(true);
    await expect(verifyEvent(reaction)).resolves.toBe(true);
  });

  it('signs comment.create', async () => {
    const { secretKey, publicKey } = await testKeyPair();
    const event = await createSignedEvent(
      {
        type: EventType.CommentCreate,
        author: publicKey,
        timestamp: Date.now(),
        payload: { postId: 'cd'.repeat(32), body: 'nice', parentId: null },
      },
      secretKey,
    );
    await expect(verifyEvent(event)).resolves.toBe(true);
  });
});
