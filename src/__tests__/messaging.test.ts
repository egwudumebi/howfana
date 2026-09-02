import * as ed from '@noble/ed25519';

import { EventType } from '@/lib/constants';
import { createSignedEvent, verifyEvent } from '@/lib/crypto/events';
import { bytesToHex, hexToBytes } from '@/lib/crypto/encoding';
import '@/lib/crypto/setup';
import { computeConversationId } from '@/lib/db/messages';

async function testKeyPair() {
  const secretKey = bytesToHex(ed.utils.randomSecretKey());
  const publicKey = bytesToHex(await ed.getPublicKeyAsync(hexToBytes(secretKey)));
  return { secretKey, publicKey };
}

describe('conversationId', () => {
  it('is order-independent for the same 2 peers', async () => {
    const a = 'aa'.repeat(32);
    const b = 'bb'.repeat(32);
    expect(computeConversationId(a, b)).toEqual(computeConversationId(b, a));
  });
});

describe('message.create events', () => {
  it('signs and verifies offline', async () => {
    const { secretKey, publicKey } = await testKeyPair();
    const recipient = 'cc'.repeat(32);
    const conversationId = computeConversationId(publicKey, recipient);

    const event = await createSignedEvent(
      {
        type: EventType.MessageCreate,
        author: publicKey,
        timestamp: 1_700_000_000_000,
        payload: { conversationId, recipient, body: 'hello dm' },
      },
      secretKey,
    );

    await expect(verifyEvent(event)).resolves.toBe(true);
    expect(event.type).toBe(EventType.MessageCreate);
  });
});

