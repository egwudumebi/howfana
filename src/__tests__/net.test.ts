import * as ed from '@noble/ed25519';

import { bytesToHex, hexToBytes } from '@/lib/crypto/encoding';
import '@/lib/crypto/setup';
import { encodeFrame, FrameDecoder } from '@/lib/net/framing';
import {
  buildAnnounce,
  createHelloEvent,
  parseAnnounce,
  verifyHelloEvent,
} from '@/lib/net/protocol';

async function testKeyPair() {
  const secretKey = bytesToHex(ed.utils.randomSecretKey());
  const publicKey = bytesToHex(await ed.getPublicKeyAsync(hexToBytes(secretKey)));
  return { secretKey, publicKey };
}

describe('announce protocol', () => {
  it('round-trips a valid announce packet', () => {
    const packet = buildAnnounce({
      publicKey: 'ab'.repeat(32),
      displayName: 'Ada',
      port: 47338,
      ts: 1000,
    });
    const parsed = parseAnnounce(JSON.stringify(packet));
    expect(parsed).toEqual(packet);
  });

  it('rejects malformed announces', () => {
    expect(parseAnnounce('{"v":2}')).toBeNull();
    expect(parseAnnounce('not-json')).toBeNull();
  });
});

describe('frame codec', () => {
  it('encodes and decodes frames, including split chunks', () => {
    const frame = { type: 'ping' as const, ts: 42 };
    const encoded = encodeFrame(frame);
    const decoder = new FrameDecoder();

    const mid = Math.floor(encoded.length / 2);
    expect(decoder.push(encoded.slice(0, mid))).toEqual([]);
    expect(decoder.push(encoded.slice(mid))).toEqual([frame]);
  });

  it('decodes multiple frames in one chunk', () => {
    const a = encodeFrame({ type: 'ping', ts: 1 });
    const b = encodeFrame({ type: 'pong', ts: 1 });
    const combined = new Uint8Array(a.length + b.length);
    combined.set(a, 0);
    combined.set(b, a.length);
    expect(new FrameDecoder().push(combined)).toEqual([
      { type: 'ping', ts: 1 },
      { type: 'pong', ts: 1 },
    ]);
  });
});

describe('peer hello', () => {
  it('creates and verifies a signed hello', async () => {
    const { secretKey, publicKey } = await testKeyPair();
    const event = await createHelloEvent(publicKey, secretKey, {
      displayName: 'Ada',
      avatarUri: null,
    });
    await expect(verifyHelloEvent(event)).resolves.toEqual({
      displayName: 'Ada',
      avatarUri: null,
    });
  });

  it('rejects tampered hello payloads', async () => {
    const { secretKey, publicKey } = await testKeyPair();
    const event = await createHelloEvent(publicKey, secretKey, {
      displayName: 'Ada',
      avatarUri: null,
    });
    const tampered = {
      ...event,
      payload: { displayName: 'Eve', avatarUri: null },
    };
    await expect(verifyHelloEvent(tampered)).resolves.toBeNull();
  });
});
