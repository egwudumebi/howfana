# Phase 5 — Multi-hop relay (Locked)

**Status:** Locked for implementation  
**Exit criterion:** With devices A–B and B–C connected (A never talks to C), a post and a DM from A reach C via B as relay.

## Goal

Extend beyond 1-hop: signed events flood through intermediate peers with TTL, path-based loop prevention, and duplicate suppression.

## In scope

| ID | Requirement | Acceptance |
|---|---|---|
| P5-1 | `relay` wire frame with TTL + path | Frames parse; invalid envelopes dropped |
| P5-2 | Signature required before relay | Tampered events never forwarded |
| P5-3 | Duplicate detection | Same `event.id` not re-forwarded / re-ingested |
| P5-4 | Hop limit | Drop when `ttl` reaches 0 |
| P5-5 | Epidemic flood for public + DM events | Posts and `message.create` cross one relay hop |
| P5-6 | Do not echo to sender / path peers | No loops on triangle topologies |
| P5-7 | Rate limit | Excess relays dropped locally |
| P5-8 | Mesh activity UI | Peers tab shows recent relay log |
| P5-9 | Unit tests | TTL / path / target selection covered |

## Out of scope

- Multi-hop media chunk relay (media stays opportunistic 1-hop)
- Source routing / DHT
- Encrypted sealed DM payloads (still signed cleartext like Phase 3)
- City-scale routing

## Constants (locked)

| Name | Value |
|---|---|
| Default TTL | `3` hops |
| Seen-set capacity | `2000` event ids |
| Relay rate limit | `120` / minute |

## Relay envelope (locked)

```ts
{
  type: 'relay';
  envelope: {
    id: string;          // === event.id
    ttl: number;         // hops remaining (decremented by each forwarder)
    path: string[];      // public keys that already handled this envelope
    origin: string;      // injector public key
    event: MeshEvent;
  }
}
```

## Exit checklist

- [ ] A–B and B–C connected; A ↛ C directly
- [ ] A post appears on C after relay
- [ ] A DM to C appears on C (via B)
- [x] Unit tests for TTL / path / target selection
- [x] `npm test` passes
