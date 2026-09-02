import {
  createInjectEnvelope,
  nextEnvelope,
  RateLimiter,
  SeenSet,
  selectRelayTargets,
  type RelayEnvelope,
} from '@/lib/net/relay';
import type { MeshEvent } from '@/lib/crypto/events';

const stubEvent = (id: string): MeshEvent =>
  ({
    id,
    type: 'post.create',
    author: 'aa',
    timestamp: 1,
    payload: {},
    signature: 'sig',
  }) as MeshEvent;

describe('selectRelayTargets', () => {
  test('excludes self, sender, and path peers', () => {
    const targets = selectRelayTargets({
      localPublicKey: 'b',
      fromPublicKey: 'a',
      connectedKeys: ['a', 'b', 'c', 'd'],
      path: ['a', 'b'],
      ttl: 2,
    });
    expect(targets.sort()).toEqual(['c', 'd']);
  });

  test('inject fans out to all neighbors', () => {
    const targets = selectRelayTargets({
      localPublicKey: 'a',
      fromPublicKey: null,
      connectedKeys: ['b', 'c'],
      path: ['a'],
      ttl: 3,
    });
    expect(targets.sort()).toEqual(['b', 'c']);
  });

  test('returns empty when ttl exhausted', () => {
    expect(
      selectRelayTargets({
        localPublicKey: 'b',
        fromPublicKey: 'a',
        connectedKeys: ['a', 'c'],
        path: ['a'],
        ttl: 0,
      }),
    ).toEqual([]);
  });
});

describe('nextEnvelope', () => {
  test('decrements ttl and appends local key', () => {
    const envelope: RelayEnvelope = {
      id: 'e1',
      ttl: 3,
      path: ['a'],
      origin: 'a',
      event: stubEvent('e1'),
    };
    const next = nextEnvelope(envelope, 'b');
    expect(next).toEqual({
      ...envelope,
      ttl: 2,
      path: ['a', 'b'],
    });
  });

  test('returns null on path loop', () => {
    const envelope: RelayEnvelope = {
      id: 'e1',
      ttl: 2,
      path: ['a', 'b'],
      origin: 'a',
      event: stubEvent('e1'),
    };
    expect(nextEnvelope(envelope, 'b')).toBeNull();
  });

  test('returns null when ttl already zero', () => {
    const envelope: RelayEnvelope = {
      id: 'e1',
      ttl: 0,
      path: ['a'],
      origin: 'a',
      event: stubEvent('e1'),
    };
    expect(nextEnvelope(envelope, 'b')).toBeNull();
  });
});

describe('createInjectEnvelope', () => {
  test('seeds path with origin', () => {
    const event = stubEvent('post1');
    const envelope = createInjectEnvelope({
      event,
      localPublicKey: 'alice',
      ttl: 3,
    });
    expect(envelope).toEqual({
      id: 'post1',
      ttl: 3,
      path: ['alice'],
      origin: 'alice',
      event,
    });
  });
});

describe('SeenSet', () => {
  test('evicts oldest when over capacity', () => {
    const seen = new SeenSet(2);
    seen.add('a');
    seen.add('b');
    seen.add('c');
    expect(seen.has('a')).toBe(false);
    expect(seen.has('b')).toBe(true);
    expect(seen.has('c')).toBe(true);
  });
});

describe('RateLimiter', () => {
  test('blocks after max per minute', () => {
    const limiter = new RateLimiter(2);
    const t0 = 1_000_000;
    expect(limiter.allow(t0)).toBe(true);
    expect(limiter.allow(t0 + 1)).toBe(true);
    expect(limiter.allow(t0 + 2)).toBe(false);
    expect(limiter.allow(t0 + 60_001)).toBe(true);
  });
});
