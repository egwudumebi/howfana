import { bleMatchesPublicKey } from '@/lib/net/bleDiscovery';
import type { DiscoveredPeer, DiscoverySource } from '@/lib/net/types';

function uniqSources(
  a: DiscoverySource[] | undefined,
  b: DiscoverySource[] | undefined,
): DiscoverySource[] {
  return [...new Set([...(a ?? []), ...(b ?? [])])];
}

function findIndex(peers: DiscoveredPeer[], incoming: DiscoveredPeer): number {
  const exact = peers.findIndex((p) => p.publicKey === incoming.publicKey);
  if (exact >= 0) return exact;

  if (incoming.publicKey.startsWith('ble:')) {
    const prefix = incoming.blePrefix ?? incoming.publicKey.slice(4);
    return peers.findIndex(
      (p) =>
        !p.publicKey.startsWith('ble:') &&
        bleMatchesPublicKey(prefix, p.publicKey),
    );
  }

  if (!incoming.publicKey.startsWith('ble:')) {
    return peers.findIndex(
      (p) =>
        p.publicKey.startsWith('ble:') &&
        bleMatchesPublicKey(p.publicKey, incoming.publicKey),
    );
  }

  return -1;
}

/** Upsert a discovered peer, merging Wi‑Fi + BLE sightings. */
export function upsertDiscoveredPeer(
  peers: DiscoveredPeer[],
  incoming: DiscoveredPeer,
): DiscoveredPeer[] {
  const idx = findIndex(peers, incoming);
  if (idx < 0) {
    return [...peers, incoming];
  }

  const existing = peers[idx]!;
  const preferWifiIdentity = !incoming.publicKey.startsWith('ble:');
  const merged: DiscoveredPeer = {
    publicKey: preferWifiIdentity ? incoming.publicKey : existing.publicKey.startsWith('ble:')
      ? incoming.publicKey.startsWith('ble:')
        ? incoming.publicKey
        : existing.publicKey
      : existing.publicKey,
    displayName: incoming.displayName || existing.displayName,
    host: incoming.host || existing.host,
    port: incoming.host ? incoming.port : existing.port || incoming.port,
    lastSeenAt: Math.max(existing.lastSeenAt, incoming.lastSeenAt),
    sources: uniqSources(existing.sources, incoming.sources),
    rssi:
      typeof incoming.rssi === 'number' ? incoming.rssi : existing.rssi ?? null,
    blePrefix:
      incoming.blePrefix ??
      existing.blePrefix ??
      (incoming.publicKey.startsWith('ble:')
        ? incoming.publicKey.slice(4)
        : existing.publicKey.startsWith('ble:')
          ? existing.publicKey.slice(4)
          : null),
  };

  // Prefer full Wi‑Fi public key when either side has it.
  if (!existing.publicKey.startsWith('ble:')) {
    merged.publicKey = existing.publicKey;
  }
  if (!incoming.publicKey.startsWith('ble:')) {
    merged.publicKey = incoming.publicKey;
  }

  const next = [...peers];
  next[idx] = merged;
  // Drop stale ble: entry if we upgraded to full key under a different slot
  return next.filter(
    (p, i) =>
      i === idx ||
      !(
        p.publicKey.startsWith('ble:') &&
        merged.blePrefix &&
        bleMatchesPublicKey(p.publicKey, merged.publicKey)
      ),
  );
}

export function removeDiscoveredPeer(
  peers: DiscoveredPeer[],
  publicKey: string,
): DiscoveredPeer[] {
  return peers.filter((p) => p.publicKey !== publicKey);
}
