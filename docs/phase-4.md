# Phase 4 — Media + efficiency (Locked)

**Status:** Locked for implementation  
**Exit criterion:** A posts a compressed photo; after sync + chunk transfer, B sees the image in the feed. Interrupted transfer resumes from missing chunks. Content hash verifies integrity.

## Goal

Efficient photo posts over the Phase 1 session: compress, content-address, chunk, resume, and display when complete.

## In scope

| ID | Requirement | Acceptance |
|---|---|---|
| P4-1 | Image compress before share | JPEG ≤ ~1280px wide, quality ~0.7 |
| P4-2 | Content-addressed media (`cid` = sha256 hex) | Same bytes ⇒ same cid; dedupe local store |
| P4-3 | Chunked transfer frames | `media_offer` / `media_want` / `media_chunk` |
| P4-4 | Resume incomplete downloads | Only missing chunk indexes requested |
| P4-5 | Integrity check on complete | Hash mismatch rejected; status stays incomplete |
| P4-6 | `post.create` may include `mediaCid` | Feed shows image when local media ready |
| P4-7 | Placeholder while downloading | Post text visible; image area shows progress/pending |
| P4-8 | Unit tests | Chunk/hash/reassembly helpers pass |

## Out of scope

- Video
- Chat attachments
- Multi-hop media relay beyond connected peers
- Adaptive bitrate / multiple resolutions

## Constants (locked)

| Name | Value |
|---|---|
| Max image width | `1280` px |
| JPEG quality | `0.7` |
| Chunk size | `32_768` bytes |
| Max media size | `2_000_000` bytes (after compress) |

## Wire frames (locked)

```ts
| { type: 'media_offer'; cid: string; size: number; mime: string; chunkSize: number; chunkCount: number }
| { type: 'media_want'; cid: string; indexes: number[] }
| { type: 'media_chunk'; cid: string; index: number; data: string } // base64
```

## `post.create` payload (extended)

```ts
{
  body: string;
  mediaCid?: string | null;
  mediaMime?: string | null;
  mediaSize?: number | null;
}
```

## Exit checklist

- [ ] Pick photo → post → local feed shows image *(needs device)*
- [ ] Peer receives post + image after sync/transfer
- [ ] Kill mid-transfer → reconnect → resumes missing chunks
- [x] `npm test` passes

## Implemented layout

```
docs/phase-4.md
src/lib/media/{chunking,store}.ts
src/providers/MediaProvider.tsx
src/lib/db/schema.ts          # media_objects, media_chunks, posts.media_*
src/app/(tabs)/index.tsx      # photo composer + image render
src/__tests__/media.test.ts
```
