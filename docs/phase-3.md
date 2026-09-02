# Phase 3 — Messaging MVP (Locked)

**Status:** Locked for implementation  
**Exit criterion:** A sends a 1:1 DM to B (no Internet). After the next sync/handshake, B sees the message in the Chat tab, and A can continue the conversation. Reconnecting works after app restart.

## Goal

Implement **offline-capable one-to-one messaging** on top of Phase 1 sessions and Phase 2 sync.

Messages are replicated as signed events (`message.create`) over the same `sync_offer` / `sync_want` / `sync_batch` TCP exchange.

## In scope

| ID | Requirement | Acceptance |
|---|---|---|
| P3-1 | `message.create` signed events | Send message and verify signature works offline |
| P3-2 | Conversation storage | Messages persist in SQLite and render in correct threads |
| P3-3 | Conversation ID determinism | Same 2 peers => same `conversation_id` on all devices |
| P3-4 | Incoming message rendering | After sync, remote messages appear in correct conversation |
| P3-5 | Bidirectional sync | If B replies, A sees it after sync |
| P3-6 | Chat UI works end-to-end | Chat tab lets you select a peer and send/receive |
| P3-7 | Sync eligibility | `message.create` is included in syncable event IDs |
| P3-8 | Unit tests | ConversationId + message event signing/verify pass (`npm test`) |

## Out of scope

- Attachments / media
- Group chats
- Read receipts / delivery receipts
- Session encryption (plaintext frames; authenticated via signatures)
- Multi-hop relay

## Message event payload (locked)

```ts
// authored by sender (event.author)
message.create payload:
{
  conversationId: string; // deterministic id for (sender, recipient)
  recipient: string;      // recipient public key hex
  body: string;           // message text
}
```

## Notes

- For Phase 3 MVP, a “conversation” is strictly 1:1 between two public keys.
- `conversation_id` is computed deterministically from the two public keys by sorting them lexicographically and hashing.

## Exit checklist

- [ ] Start a new DM to a connected peer
- [ ] A sends a message; B sees it
- [ ] B replies; A sees it
- [ ] App restart does not lose messages
- [x] `npm test` passes

