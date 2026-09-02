# Phase 1 — Direct peer link (Locked)

**Status:** Locked for implementation  
**Exit criterion:** Device A discovers Device B on the same LAN (no Internet required), connects, and both show each other’s verified profile (signed `peer.hello`).

## Goal

Discover nearby Howfana peers on the **local Wi‑Fi LAN**, open a direct TCP session, exchange signed identity/profile, and maintain connection health via heartbeats.

Nearby Connections / Multipeer are **out of scope for Phase 1** (Phase 1.5+). Transport is pluggable so those can replace LAN later.

## In scope

| ID | Requirement | Acceptance |
|---|---|---|
| P1-1 | Transport interface (`start`, `stop`, `connect`, events) | LAN implements it; UI depends only on the interface |
| P1-2 | UDP announce / discover on LAN | Peers appear in list within a few seconds on same Wi‑Fi |
| P1-3 | TCP session connect / disconnect | Status shows connecting → connected / disconnected |
| P1-4 | Signed `peer.hello` + `peer.hello_ack` exchange | Remote display name + public key shown; bad signatures rejected |
| P1-5 | Heartbeat ping/pong | Unresponsive peers marked unhealthy / disconnected |
| P1-6 | Persist remote identity + profile locally | SQLite `identities` / `profiles` updated after hello |
| P1-7 | Peers UI: discover toggle, list, connect, status | Usable on device |
| P1-8 | Manual connect by `host:port` | Works when multicast is blocked |
| P1-9 | Protocol unit tests | Framing + hello verify covered by `npm test` |

## Out of scope

- Multi-hop relay
- E2E session encryption (Noise) — Phase 1 authenticates via signatures on cleartext LAN frames
- Feed sync, follows, DMs
- BLE / Wi‑Fi Direct / Nearby / Multipeer

## Runtime note

UDP/TCP native sockets **do not work in Expo Go**. Phase 1 requires a **development build**:

```bash
npx expo prebuild
npx expo run:android
# or
npx expo run:ios
```

## Ports & timing (locked)

| Constant | Value |
|---|---|
| UDP discovery port | `47337` |
| TCP session port | `47338` |
| Announce interval | `2000` ms |
| Peer stale after | `8000` ms without announce |
| Heartbeat interval | `3000` ms |
| Heartbeat timeout | `10000` ms |

## Wire protocol (locked)

### UDP announce (JSON datagram)

```ts
{
  v: 1,
  type: 'howfana.announce',
  pk: string,       // Ed25519 public key hex
  name: string,     // display name
  port: number,     // TCP listen port
  ts: number        // Unix ms
}
```

### TCP frames

4-byte big-endian length prefix + UTF-8 JSON body.

```ts
type Frame =
  | { type: 'hello'; event: MeshEvent }      // event.type === 'peer.hello'
  | { type: 'hello_ack'; event: MeshEvent }  // event.type === 'peer.hello'
  | { type: 'ping'; ts: number }
  | { type: 'pong'; ts: number };
```

`peer.hello` payload:

```ts
{ displayName: string; avatarUri: string | null }
```

## Session state machine

`discovered` → `connecting` → `handshaking` → `connected` → `disconnected`

## Exit checklist

- [ ] Two devices on same Wi‑Fi, no cellular data needed *(needs dev build)*
- [ ] A sees B in Peers list
- [ ] Connect shows verified name + public key
- [ ] Disconnect / heartbeat timeout updates UI
- [x] `npm test` passes (protocol + framing)

## Implemented layout

```
docs/phase-1.md
src/lib/net/{types,framing,protocol,lanTransport}.ts
src/providers/PeerProvider.tsx
src/app/(tabs)/peers.tsx
src/__tests__/net.test.ts
```
