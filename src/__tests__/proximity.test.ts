import { NetConfig } from '@/lib/constants';
import { groupPeersByProximity, proximityBucket } from '@/lib/net/proximity';
import type { DiscoveredPeer } from '@/lib/net/types';

describe('proximity buckets', () => {
  const now = 1_000_000;
  const ttl = NetConfig.peerTtlMs;

  function peer(
    partial: Partial<DiscoveredPeer> & { publicKey: string },
  ): DiscoveredPeer {
    return {
      displayName: 'P',
      host: '1',
      port: 1,
      lastSeenAt: now,
      ...partial,
    };
  }

  it('classifies very fresh peers as veryClose', () => {
    expect(
      proximityBucket(peer({ publicKey: 'a', lastSeenAt: now - ttl * 0.1 }), now),
    ).toBe('veryClose');
  });

  it('classifies mid-fresh peers as nearby', () => {
    expect(
      proximityBucket(peer({ publicKey: 'a', lastSeenAt: now - ttl * 0.5 }), now),
    ).toBe('nearby');
  });

  it('classifies aging peers as withinRange', () => {
    expect(
      proximityBucket(peer({ publicKey: 'a', lastSeenAt: now - ttl * 0.9 }), now),
    ).toBe('withinRange');
  });

  it('prefers BLE RSSI when present', () => {
    expect(
      proximityBucket(
        peer({ publicKey: 'a', lastSeenAt: now - ttl, rssi: -50 }),
        now,
      ),
    ).toBe('veryClose');
    expect(
      proximityBucket(
        peer({ publicKey: 'a', lastSeenAt: now, rssi: -90 }),
        now,
      ),
    ).toBe('withinRange');
  });

  it('groups peers by bucket', () => {
    const peers: DiscoveredPeer[] = [
      peer({ publicKey: 'a', lastSeenAt: now - ttl * 0.1 }),
      peer({ publicKey: 'b', lastSeenAt: now - ttl * 0.5 }),
      peer({ publicKey: 'c', lastSeenAt: now - ttl * 0.9 }),
    ];
    const g = groupPeersByProximity(peers, now);
    expect(g.veryClose.map((p) => p.publicKey)).toEqual(['a']);
    expect(g.nearby.map((p) => p.publicKey)).toEqual(['b']);
    expect(g.withinRange.map((p) => p.publicKey)).toEqual(['c']);
  });
});
