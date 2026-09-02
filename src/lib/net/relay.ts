import type { MeshEvent } from '@/lib/crypto/events';

export type RelayEnvelope = {
  id: string;
  ttl: number;
  path: string[];
  origin: string;
  event: MeshEvent;
};

export type RelayLogEntry = {
  at: number;
  eventId: string;
  eventType: string;
  from: string;
  action: 'inject' | 'accept' | 'forward' | 'drop';
  detail: string;
  ttl: number;
};

/** Pure: which neighbors should receive a forwarded envelope? */
export function selectRelayTargets(input: {
  localPublicKey: string;
  fromPublicKey: string | null;
  connectedKeys: string[];
  path: string[];
  ttl: number;
}): string[] {
  if (input.ttl <= 0) return [];

  return input.connectedKeys.filter((pk) => {
    if (pk === input.localPublicKey) return false;
    if (input.fromPublicKey && pk === input.fromPublicKey) return false;
    if (input.path.includes(pk)) return false;
    return true;
  });
}

export function nextEnvelope(
  envelope: RelayEnvelope,
  localPublicKey: string,
): RelayEnvelope | null {
  if (envelope.ttl <= 0) return null;
  if (envelope.path.includes(localPublicKey)) return null;
  return {
    ...envelope,
    ttl: envelope.ttl - 1,
    path: [...envelope.path, localPublicKey],
  };
}

export function createInjectEnvelope(input: {
  event: MeshEvent;
  localPublicKey: string;
  ttl: number;
}): RelayEnvelope {
  return {
    id: input.event.id,
    ttl: input.ttl,
    path: [input.localPublicKey],
    origin: input.localPublicKey,
    event: input.event,
  };
}

/** Bounded seen-set with insertion order eviction. */
export class SeenSet {
  private map = new Map<string, number>();
  constructor(private readonly capacity: number) {}

  has(id: string): boolean {
    return this.map.has(id);
  }

  add(id: string, at = Date.now()): void {
    if (this.map.has(id)) {
      this.map.delete(id);
    }
    this.map.set(id, at);
    while (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }
}

/** Simple token-bucket style per-minute counter. */
export class RateLimiter {
  private timestamps: number[] = [];

  constructor(private readonly maxPerMinute: number) {}

  allow(now = Date.now()): boolean {
    const windowStart = now - 60_000;
    this.timestamps = this.timestamps.filter((t) => t >= windowStart);
    if (this.timestamps.length >= this.maxPerMinute) {
      return false;
    }
    this.timestamps.push(now);
    return true;
  }
}
