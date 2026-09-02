import * as ed from '@noble/ed25519';

import { createSignedEvent, verifyEvent } from '@/lib/crypto/events';
import { bytesToHex, hexToBytes } from '@/lib/crypto/encoding';
import { sign, verify } from '@/lib/crypto/identity';
import '@/lib/crypto/setup';
import {
  DuplicateEventError,
  InvalidEventSignatureError,
} from '@/lib/db/events';

async function testKeyPair() {
  const secretKey = bytesToHex(ed.utils.randomSecretKey());
  const publicKey = bytesToHex(await ed.getPublicKeyAsync(hexToBytes(secretKey)));
  return { secretKey, publicKey };
}

/** Mirrors appendEvent integrity rules without SQLite. */
async function appendInMemory(
  store: Map<string, unknown>,
  event: Awaited<ReturnType<typeof createSignedEvent>>,
) {
  const valid = await verifyEvent(event);
  if (!valid) {
    throw new InvalidEventSignatureError(event.id);
  }
  if (store.has(event.id)) {
    throw new DuplicateEventError(event.id);
  }
  store.set(event.id, event);
}

describe('identity crypto', () => {
  it('signs and verifies a message', async () => {
    const { secretKey, publicKey } = await testKeyPair();
    const message = new TextEncoder().encode('howfana-phase-0');
    const signature = await sign(message, secretKey);
    await expect(verify(message, signature, publicKey)).resolves.toBe(true);
  });

  it('rejects tampered messages', async () => {
    const { secretKey, publicKey } = await testKeyPair();
    const message = new TextEncoder().encode('howfana-phase-0');
    const signature = await sign(message, secretKey);
    const tampered = new TextEncoder().encode('howfana-phase-0!');
    await expect(verify(tampered, signature, publicKey)).resolves.toBe(false);
  });
});

describe('signed events', () => {
  it('creates a verifiable event envelope', async () => {
    const { secretKey, publicKey } = await testKeyPair();
    const event = await createSignedEvent(
      {
        type: 'profile.update',
        author: publicKey,
        timestamp: 1_700_000_000_000,
        payload: { displayName: 'Ada' },
      },
      secretKey,
    );

    expect(event.id).toHaveLength(64);
    expect(event.signature).toHaveLength(128);
    await expect(verifyEvent(event)).resolves.toBe(true);
  });

  it('rejects events with a bad signature', async () => {
    const { secretKey, publicKey } = await testKeyPair();
    const event = await createSignedEvent(
      {
        type: 'post.create',
        author: publicKey,
        timestamp: 1_700_000_000_001,
        payload: { body: 'hello mesh' },
      },
      secretKey,
    );

    const tampered = { ...event, signature: '00'.repeat(64) };
    await expect(verifyEvent(tampered)).resolves.toBe(false);
  });

  it('rejects events whose id does not match content', async () => {
    const { secretKey, publicKey } = await testKeyPair();
    const event = await createSignedEvent(
      {
        type: 'post.create',
        author: publicKey,
        timestamp: 1_700_000_000_002,
        payload: { body: 'hello' },
      },
      secretKey,
    );

    await expect(verifyEvent({ ...event, id: 'ab'.repeat(32) })).resolves.toBe(
      false,
    );
  });
});

describe('event append rules', () => {
  it('appends a valid event once and rejects duplicates', async () => {
    const { secretKey, publicKey } = await testKeyPair();
    const store = new Map<string, unknown>();
    const event = await createSignedEvent(
      {
        type: 'follow.add',
        author: publicKey,
        timestamp: 1_700_000_000_003,
        payload: { followee: 'aa'.repeat(32) },
      },
      secretKey,
    );

    await appendInMemory(store, event);
    expect(store.has(event.id)).toBe(true);
    await expect(appendInMemory(store, event)).rejects.toBeInstanceOf(
      DuplicateEventError,
    );
  });

  it('rejects invalid signatures on append', async () => {
    const { secretKey, publicKey } = await testKeyPair();
    const store = new Map<string, unknown>();
    const event = await createSignedEvent(
      {
        type: 'message.create',
        author: publicKey,
        timestamp: 1_700_000_000_004,
        payload: { body: 'ping' },
      },
      secretKey,
    );

    await expect(
      appendInMemory(store, { ...event, signature: 'ff'.repeat(64) }),
    ).rejects.toBeInstanceOf(InvalidEventSignatureError);
  });
});
