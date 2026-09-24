import type { SQLiteDatabase } from 'expo-sqlite';

import { EventType } from '@/lib/constants';
import type { MeshEvent } from '@/lib/crypto/events';
import {
  appendEvent,
  DuplicateEventError,
} from '@/lib/db/events';
import {
  normalizeAbout,
  parseAboutJson,
} from '@/lib/db/profiles';
import { normalizeMediaLayout } from '@/lib/social/mediaLayout';
import { storyExpiresAt } from '@/lib/db/stories';
import {
  mediaJsonString,
  normalizePostMedia,
} from '@/lib/social/mediaPayload';

export async function ensureIdentity(
  db: SQLiteDatabase,
  publicKey: string,
): Promise<void> {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO identities (public_key, created_at, is_local)
     VALUES (?, ?, 0)
     ON CONFLICT(public_key) DO NOTHING`,
    [publicKey, now],
  );
  await db.runAsync(
    `INSERT INTO profiles (public_key, display_name, avatar_uri, updated_at)
     VALUES (?, '', NULL, ?)
     ON CONFLICT(public_key) DO NOTHING`,
    [publicKey, now],
  );
}

async function applyProfileUpdate(db: SQLiteDatabase, event: MeshEvent): Promise<void> {
  const payload = event.payload as {
    displayName?: string;
    avatarUri?: string | null;
    avatarCid?: string | null;
    about?: unknown;
  };
  await ensureIdentity(db, event.author);
  const existing = await db.getFirstAsync<{ about_json: string | null }>(
    'SELECT about_json FROM profiles WHERE public_key = ?',
    [event.author],
  );
  const about =
    payload.about !== undefined
      ? normalizeAbout(payload.about)
      : parseAboutJson(existing?.about_json);
  const avatarCid =
    typeof payload.avatarCid === 'string' && payload.avatarCid
      ? payload.avatarCid
      : null;
  await db.runAsync(
    `UPDATE profiles
     SET display_name = ?, avatar_uri = ?, avatar_cid = ?, updated_at = ?, about_json = ?
     WHERE public_key = ?`,
    [
      typeof payload.displayName === 'string' ? payload.displayName : '',
      avatarCid ? null : (payload.avatarUri ?? null),
      avatarCid,
      event.timestamp,
      JSON.stringify(about),
      event.author,
    ],
  );
}

async function applyFollowAdd(db: SQLiteDatabase, event: MeshEvent): Promise<void> {
  const payload = event.payload as { followee?: string };
  if (typeof payload.followee !== 'string') return;
  await ensureIdentity(db, event.author);
  await ensureIdentity(db, payload.followee);
  await db.runAsync(
    `INSERT INTO follows (follower, followee, created_at, event_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(follower, followee) DO UPDATE SET
       created_at = excluded.created_at,
       event_id = excluded.event_id`,
    [event.author, payload.followee.toLowerCase(), event.timestamp, event.id],
  );
}

async function applyFollowRemove(db: SQLiteDatabase, event: MeshEvent): Promise<void> {
  const payload = event.payload as { followee?: string };
  if (typeof payload.followee !== 'string') return;
  await db.runAsync(
    `DELETE FROM follows WHERE follower = ? AND followee = ?`,
    [event.author, payload.followee.toLowerCase()],
  );
}

async function applyPostCreate(db: SQLiteDatabase, event: MeshEvent): Promise<void> {
  const payload = event.payload as {
    body?: string;
    media?: unknown;
    mediaCid?: string | null;
    mediaMime?: string | null;
    mediaSize?: number | null;
    mediaLayout?: unknown;
    visibilityBoost?: boolean;
  };
  if (typeof payload.body !== 'string') return;
  const body = payload.body.trim();
  const media = normalizePostMedia(payload);
  const first = media[0] ?? null;
  const mediaLayout = normalizeMediaLayout(payload.mediaLayout, media.length);
  const boost = payload.visibilityBoost === true ? 1 : 0;
  await ensureIdentity(db, event.author);
  await db.runAsync(
    `INSERT INTO posts (id, author, body, created_at, event_id, media_cid, media_mime, media_size, media_json, repost_of, media_layout, kind, duration_ms, visibility_boost)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'post', NULL, ?)
     ON CONFLICT(id) DO NOTHING`,
    [
      event.id,
      event.author,
      body,
      event.timestamp,
      event.id,
      first?.cid ?? null,
      first?.mime ?? null,
      first?.size ?? null,
      mediaJsonString(media),
      mediaLayout,
      boost,
    ],
  );
}

async function applyPostEdit(db: SQLiteDatabase, event: MeshEvent): Promise<void> {
  const payload = event.payload as { postId?: string; body?: string };
  if (typeof payload.postId !== 'string' || typeof payload.body !== 'string') {
    return;
  }
  const body = payload.body.trim();
  if (!payload.postId || !body) return;

  const post = await db.getFirstAsync<{ id: string; author: string }>(
    'SELECT id, author FROM posts WHERE id = ?',
    [payload.postId],
  );
  if (!post || post.author !== event.author) return;

  await db.runAsync(
    `UPDATE posts SET body = ?, edited_at = ? WHERE id = ?`,
    [body, event.timestamp, payload.postId],
  );
}

async function applyReelCreate(db: SQLiteDatabase, event: MeshEvent): Promise<void> {
  const payload = event.payload as {
    caption?: string;
    body?: string;
    media?: unknown;
    mediaCid?: string | null;
    mediaMime?: string | null;
    mediaSize?: number | null;
    durationMs?: number | null;
  };
  const caption =
    typeof payload.caption === 'string'
      ? payload.caption.trim()
      : typeof payload.body === 'string'
        ? payload.body.trim()
        : '';
  const media = normalizePostMedia(payload);
  if (media.length === 0) return;
  const first = media[0]!;
  const durationMs =
    typeof payload.durationMs === 'number' && payload.durationMs > 0
      ? Math.min(payload.durationMs, 120_000)
      : null;
  await ensureIdentity(db, event.author);
  await db.runAsync(
    `INSERT INTO posts (id, author, body, created_at, event_id, media_cid, media_mime, media_size, media_json, repost_of, media_layout, kind, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'reel', ?)
     ON CONFLICT(id) DO NOTHING`,
    [
      event.id,
      event.author,
      caption,
      event.timestamp,
      event.id,
      first.cid,
      first.mime,
      first.size,
      mediaJsonString(media),
      durationMs,
    ],
  );
}

async function applyPostDelete(db: SQLiteDatabase, event: MeshEvent): Promise<void> {
  const payload = event.payload as { postId?: string };
  if (typeof payload.postId !== 'string' || !payload.postId) return;

  const post = await db.getFirstAsync<{ id: string; author: string }>(
    'SELECT id, author FROM posts WHERE id = ?',
    [payload.postId],
  );
  if (!post || post.author !== event.author) {
    return;
  }

  await db.runAsync('DELETE FROM reactions WHERE post_id = ?', [payload.postId]);
  await db.runAsync('DELETE FROM comments WHERE post_id = ?', [payload.postId]);
  // Remove dependent reposts of this post
  const reposts = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM posts WHERE repost_of = ?',
    [payload.postId],
  );
  for (const r of reposts) {
    await db.runAsync('DELETE FROM reactions WHERE post_id = ?', [r.id]);
    await db.runAsync('DELETE FROM comments WHERE post_id = ?', [r.id]);
  }
  await db.runAsync('DELETE FROM posts WHERE repost_of = ?', [payload.postId]);
  await db.runAsync('DELETE FROM posts WHERE id = ? AND author = ?', [
    payload.postId,
    event.author,
  ]);
}

async function applyPostRepost(db: SQLiteDatabase, event: MeshEvent): Promise<void> {
  const payload = event.payload as { originalPostId?: string };
  if (typeof payload.originalPostId !== 'string' || !payload.originalPostId) {
    return;
  }
  await ensureIdentity(db, event.author);
  try {
    await db.runAsync(
      `INSERT INTO posts (id, author, body, created_at, event_id, media_cid, media_mime, media_size, media_json, repost_of, media_layout, kind, duration_ms)
       VALUES (?, ?, '', ?, ?, NULL, NULL, NULL, NULL, ?, NULL, 'post', NULL)
       ON CONFLICT(id) DO NOTHING`,
      [
        event.id,
        event.author,
        event.timestamp,
        event.id,
        payload.originalPostId,
      ],
    );
  } catch (err) {
    // Unique (author, repost_of) — ignore duplicate reposts
    const message = err instanceof Error ? err.message : String(err);
    if (!/UNIQUE|unique/i.test(message)) {
      throw err;
    }
  }
}

async function applyReactionAdd(db: SQLiteDatabase, event: MeshEvent): Promise<void> {
  const payload = event.payload as { postId?: string; emoji?: string };
  if (typeof payload.postId !== 'string' || typeof payload.emoji !== 'string') return;
  await ensureIdentity(db, event.author);
  const post = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM posts WHERE id = ?',
    [payload.postId],
  );
  if (!post) {
    return;
  }
  await db.runAsync(
    `INSERT INTO reactions (id, post_id, author, emoji, created_at, event_id)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(author, post_id) DO UPDATE SET
       emoji = excluded.emoji,
       created_at = excluded.created_at,
       event_id = excluded.event_id,
       id = excluded.id`,
    [event.id, payload.postId, event.author, payload.emoji, event.timestamp, event.id],
  );
}

async function applyReactionRemove(db: SQLiteDatabase, event: MeshEvent): Promise<void> {
  const payload = event.payload as { postId?: string };
  if (typeof payload.postId !== 'string') return;
  await db.runAsync(
    `DELETE FROM reactions WHERE author = ? AND post_id = ?`,
    [event.author, payload.postId],
  );
}

async function applyCommentCreate(db: SQLiteDatabase, event: MeshEvent): Promise<void> {
  const payload = event.payload as {
    postId?: string;
    body?: string;
    parentId?: string | null;
  };
  if (typeof payload.postId !== 'string' || typeof payload.body !== 'string') return;
  if (!payload.body.trim()) return;
  await ensureIdentity(db, event.author);
  const post = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM posts WHERE id = ?',
    [payload.postId],
  );
  if (!post) return;
  await db.runAsync(
    `INSERT INTO comments (id, post_id, author, body, parent_id, created_at, event_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    [
      event.id,
      payload.postId,
      event.author,
      payload.body.trim(),
      payload.parentId ?? null,
      event.timestamp,
      event.id,
    ],
  );
}

async function applyMessageCreate(db: SQLiteDatabase, event: MeshEvent): Promise<void> {
  const payload = event.payload as {
    conversationId?: string;
    recipient?: string;
    body?: string;
  };
  if (typeof payload.conversationId !== 'string') return;
  if (typeof payload.recipient !== 'string') return;
  if (typeof payload.body !== 'string' || !payload.body.trim()) return;

  const recipient = payload.recipient.toLowerCase();
  await ensureIdentity(db, event.author);
  await ensureIdentity(db, recipient);

  await db.runAsync(
    `INSERT INTO messages (id, conversation_id, sender, recipient, body, created_at, event_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    [
      event.id,
      payload.conversationId,
      event.author,
      recipient,
      payload.body.trim(),
      event.timestamp,
      event.id,
    ],
  );
}

async function applyStoryCreate(db: SQLiteDatabase, event: MeshEvent): Promise<void> {
  const payload = event.payload as {
    body?: string;
    mediaCid?: string | null;
    mediaMime?: string | null;
    mediaSize?: number | null;
  };
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  const mediaCid =
    typeof payload.mediaCid === 'string' && payload.mediaCid
      ? payload.mediaCid
      : null;
  if (!body && !mediaCid) return;

  await ensureIdentity(db, event.author);
  const expiresAt = storyExpiresAt(event.timestamp);
  await db.runAsync(
    `INSERT INTO stories (
       id, author, body, created_at, expires_at, event_id,
       media_cid, media_mime, media_size
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    [
      event.id,
      event.author,
      body,
      event.timestamp,
      expiresAt,
      event.id,
      mediaCid,
      mediaCid
        ? typeof payload.mediaMime === 'string'
          ? payload.mediaMime
          : 'image/jpeg'
        : null,
      mediaCid && typeof payload.mediaSize === 'number' ? payload.mediaSize : null,
    ],
  );
}

export async function applyEventProjection(
  db: SQLiteDatabase,
  event: MeshEvent,
): Promise<void> {
  switch (event.type) {
    case EventType.ProfileUpdate:
      await applyProfileUpdate(db, event);
      break;
    case EventType.FollowAdd:
      await applyFollowAdd(db, event);
      break;
    case EventType.FollowRemove:
      await applyFollowRemove(db, event);
      break;
    case EventType.PostCreate:
      await applyPostCreate(db, event);
      break;
    case EventType.PostEdit:
      await applyPostEdit(db, event);
      break;
    case EventType.ReelCreate:
      await applyReelCreate(db, event);
      break;
    case EventType.StoryCreate:
      await applyStoryCreate(db, event);
      break;
    case EventType.PostRepost:
      await applyPostRepost(db, event);
      break;
    case EventType.PostDelete:
      await applyPostDelete(db, event);
      break;
    case EventType.ReactionAdd:
      await applyReactionAdd(db, event);
      break;
    case EventType.ReactionRemove:
      await applyReactionRemove(db, event);
      break;
    case EventType.CommentCreate:
      await applyCommentCreate(db, event);
      break;
    case EventType.MessageCreate:
      await applyMessageCreate(db, event);
      break;
    default:
      break;
  }
}

/**
 * Verify, append to event log, and project into domain tables.
 * Returns true if newly applied; false if duplicate.
 */
export async function ingestEvent(
  db: SQLiteDatabase,
  event: MeshEvent,
): Promise<boolean> {
  try {
    await ensureIdentity(db, event.author);
    await appendEvent(db, event);
  } catch (err) {
    if (err instanceof DuplicateEventError) {
      return false;
    }
    throw err;
  }
  await applyEventProjection(db, event);
  if (
    event.type === EventType.PostCreate ||
    event.type === EventType.PostRepost ||
    event.type === EventType.ReelCreate
  ) {
    await reprojectOrphansForPost(db, event.id);
  }
  return true;
}

async function reprojectOrphansForPost(
  db: SQLiteDatabase,
  postId: string,
): Promise<void> {
  const rows = await db.getAllAsync<{
    id: string;
    type: string;
    author: string;
    timestamp: number;
    payload_json: string;
    signature: string;
  }>(
    `SELECT id, type, author, timestamp, payload_json, signature
     FROM events
     WHERE type IN (?, ?)
       AND payload_json LIKE ?`,
    [EventType.ReactionAdd, EventType.CommentCreate, `%"postId":"${postId}"%`],
  );
  for (const row of rows) {
    await applyEventProjection(db, {
      id: row.id,
      type: row.type,
      author: row.author,
      timestamp: row.timestamp,
      payload: JSON.parse(row.payload_json) as unknown,
      signature: row.signature,
    });
  }
}
