import { NetConfig } from '@/lib/constants';
import type { DiscoveredPeer } from '@/lib/net/types';

export type ProximityBucket = 'veryClose' | 'nearby' | 'withinRange';

/**
 * Prefer BLE RSSI when present; otherwise LAN announce freshness.
 */
export function proximityBucket(
  peer: DiscoveredPeer | number,
  now = Date.now(),
): ProximityBucket {
  if (typeof peer === 'number') {
    const age = Math.max(0, now - peer);
    const ttl = NetConfig.peerTtlMs;
    if (age <= ttl * 0.35) return 'veryClose';
    if (age <= ttl * 0.7) return 'nearby';
    return 'withinRange';
  }

  if (typeof peer.rssi === 'number') {
    if (peer.rssi >= -60) return 'veryClose';
    if (peer.rssi >= -80) return 'nearby';
    return 'withinRange';
  }

  const age = Math.max(0, now - peer.lastSeenAt);
  const ttl = NetConfig.peerTtlMs;
  if (age <= ttl * 0.35) return 'veryClose';
  if (age <= ttl * 0.7) return 'nearby';
  return 'withinRange';
}

export function groupPeersByProximity(peers: DiscoveredPeer[], now = Date.now()) {
  const veryClose: DiscoveredPeer[] = [];
  const nearby: DiscoveredPeer[] = [];
  const withinRange: DiscoveredPeer[] = [];

  const sorted = [...peers].sort((a, b) => {
    if (typeof a.rssi === 'number' && typeof b.rssi === 'number') {
      return b.rssi - a.rssi;
    }
    return b.lastSeenAt - a.lastSeenAt;
  });
  for (const peer of sorted) {
    const bucket = proximityBucket(peer, now);
    if (bucket === 'veryClose') veryClose.push(peer);
    else if (bucket === 'nearby') nearby.push(peer);
    else withinRange.push(peer);
  }

  return { veryClose, nearby, withinRange };
}
