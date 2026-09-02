# Phase 0 — Foundations (Locked)

**Status:** Locked for implementation  
**Exit criterion:** Create a profile offline; kill and restart the app; the same Ed25519 identity and profile persist.

## Goal

Ship local identity, local storage, signed event envelopes, and the tab shell. **No networking.**

## In scope

| ID | Requirement | Acceptance |
|---|---|---|
| P0-1 | App shell with Expo Router tabs: Feed, Peers, Chat, Profile | All four tabs render without crash |
| P0-2 | Generate Ed25519 keypair on first launch | Public key shown on Profile; private key never shown |
| P0-3 | Persist private key in SecureStore | Key survives app restart |
| P0-4 | Local profile: display name + optional avatar URI | Editable on Profile; saved to SQLite |
| P0-5 | Show identity QR (public key payload) | QR renders on Profile |
| P0-6 | SQLite schema for identities, profiles, posts, follows, messages, events | Migrations run on launch; tables exist |
| P0-7 | Signed event envelope `{ id, type, author, timestamp, payload, signature }` | Can create and verify events offline |
| P0-8 | Unit tests: sign/verify + append event | `npm test` passes |

## Out of scope (Phase 0)

- Peer discovery, transport, sync
- Feed ranking, reactions, comments UI beyond placeholders
- Messaging send/receive
- Media transfer
- Multi-hop / mesh

## Event envelope (locked)

```ts
type MeshEvent = {
  id: string;          // content-addressed: sha256(canonical bytes without signature), hex
  type: string;        // e.g. profile.update, post.create, follow.add
  author: string;      // author public key, hex
  timestamp: number;   // Unix ms (author clock; not trusted alone in later phases)
  payload: unknown;    // JSON-serializable
  signature: string;   // Ed25519 over canonical bytes of {id,type,author,timestamp,payload}
};
```

## Storage

- **SecureStore:** `howfana.identity.secretKey` (hex)
- **SQLite DB:** `howfana.db`
- Public key derived from secret; also mirrored in `identities` / `profiles` for joins

## Exit checklist

- [x] Fresh install creates identity automatically
- [x] User sets display name; optional avatar
- [x] Force-quit → relaunch → same public key + display name *(implemented; confirm on device)*
- [x] Invalid signature rejected by verify helper
- [x] Duplicate event id rejected on append

## Implemented layout

```
docs/phase-0.md
src/app/(tabs)/{index,peers,chat,profile}.tsx
src/lib/crypto/{identity,events,encoding,canonical}.ts
src/lib/db/{schema,events,profiles}.ts
src/lib/identity/store.ts
src/providers/IdentityProvider.tsx
src/__tests__/crypto.test.ts
```
