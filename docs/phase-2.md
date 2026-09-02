# Phase 2 — Social MVP (Locked)

**Status:** Locked for implementation  
**Exit criterion:** A follows B; B creates a text post; after sync (auto on connect or Sync now), A sees the post and can react / comment.

## Goal

1-hop social loop over Phase 1 sessions: follow graph, text posts, reactions, comments, and event sync.

## In scope

| ID | Requirement | Acceptance |
|---|---|---|
| P2-1 | `follow.add` / `follow.remove` signed events | Follow toggles from Peers; persisted in SQLite |
| P2-2 | `post.create` text posts | Composer on Feed; own posts appear immediately |
| P2-3 | `reaction.add` (one emoji per author/post) | Tap react on a post; count updates |
| P2-4 | `comment.create` | Add comment under a post |
| P2-5 | Sync protocol over TCP frames | `sync_offer` → `sync_want` → `sync_batch` |
| P2-6 | Auto-sync after hello; manual Sync now | Connected peers exchange missing social events |
| P2-7 | Feed ranking: self + following, then recency | Non-followed remote posts stay out of main feed |
| P2-8 | Gossip new local social events to connected peers | Post while connected reaches peer without full resync |
| P2-9 | Unit tests for apply + sync selection | `npm test` passes |

## Out of scope

- Media posts, stories, communities
- Multi-hop gossip
- Push OS notifications (in-app sync status only)
- DMs (Phase 3)
- Session encryption

## Social event payloads (locked)

```ts
// follow.add / follow.remove
{ followee: string }

// post.create
{ body: string }

// reaction.add
{ postId: string; emoji: string }  // emoji ∈ {'👍','❤️','🔥','😂'}

// comment.create
{ postId: string; body: string; parentId?: string | null }
```

## Sync frames (locked)

```ts
| { type: 'sync_offer'; ids: string[] }           // social event ids I have (capped)
| { type: 'sync_want'; ids: string[] }            // ids I need
| { type: 'sync_batch'; events: MeshEvent[] }     // requested events
```

Social event types eligible for sync:  
`profile.update`, `follow.add`, `follow.remove`, `post.create`, `reaction.add`, `comment.create`

Limits: offer ≤ 300 ids; batch ≤ 40 events per frame.

## Exit checklist

- [ ] Follow peer from Peers screen *(needs two devices / dev build)*
- [ ] Create post on Feed
- [ ] Sync to second device; post appears for follower
- [ ] React + comment sync both ways
- [x] `npm test` passes (sync selection + social event signing)

## Implemented layout

```
docs/phase-2.md
src/lib/db/{applyEvent,sync,social}.ts
src/providers/SocialProvider.tsx
src/app/(tabs)/index.tsx   # Feed
src/app/(tabs)/peers.tsx   # Follow actions
src/__tests__/social.test.ts
```
