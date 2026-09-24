import type { SQLiteDatabase } from 'expo-sqlite';

import { resolveAvatarUri } from '@/lib/db/profiles';
import {
  normalizeMediaLayout,
  type MediaLayout,
} from '@/lib/social/mediaLayout';
import {
  normalizePostMedia,
  parseMediaJson,
  type PostMediaItem,
} from '@/lib/social/mediaPayload';

export type FeedMediaItem = PostMediaItem & {
  uri: string | null;
  status: 'none' | 'pending' | 'complete' | 'failed';
  progress: number;
};

export type FeedPost = {
  id: string;
  author: string;
  authorName: string;
  authorAvatarUri: string | null;
  body: string;
  createdAt: number;
  editedAt: number | null;
  visibilityBoost: boolean;
  reactionCounts: Record<string, number>;
  myReaction: string | null;
  commentCount: number;
  /** @deprecated Prefer `media` — first CID for compat */
  mediaCid: string | null;
  mediaMime: string | null;
  mediaSize: number | null;
  mediaUri: string | null;
  mediaStatus: 'none' | 'pending' | 'complete' | 'failed';
  mediaProgress: number;
  media: FeedMediaItem[];
  mediaLayout: MediaLayout;
  kind: 'post' | 'reel';
  durationMs: number | null;
  repostOf: string | null;
  original: FeedPost | null;
  iReposted: boolean;
};

export type CommentRow = {
  id: string;
  postId: string;
  author: string;
  authorName: string;
  body: string;
  createdAt: number;
};

export async function isFollowing(
  db: SQLiteDatabase,
  follower: string,
  followee: string,
): Promise<boolean> {
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM follows WHERE follower = ? AND followee = ?`,
    [follower, followee],
  );
  return (row?.c ?? 0) > 0;
}

export async function listFollowees(
  db: SQLiteDatabase,
  follower: string,
): Promise<string[]> {
  const rows = await db.getAllAsync<{ followee: string }>(
    `SELECT followee FROM follows WHERE follower = ?`,
    [follower],
  );
  return rows.map((r) => r.followee);
}

export async function hasReposted(
  db: SQLiteDatabase,
  author: string,
  originalPostId: string,
): Promise<boolean> {
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM posts WHERE author = ? AND repost_of = ?`,
    [author, originalPostId],
  );
  return (row?.c ?? 0) > 0;
}

type PostRow = {
  id: string;
  author: string;
  body: string;
  created_at: number;
  edited_at: number | null;
  visibility_boost: number | null;
  display_name: string | null;
  avatar_uri: string | null;
  avatar_cid: string | null;
  media_cid: string | null;
  media_mime: string | null;
  media_size: number | null;
  media_json: string | null;
  media_layout: string | null;
  kind: string | null;
  duration_ms: number | null;
  repost_of: string | null;
};

async function resolveMediaItems(
  db: SQLiteDatabase,
  items: PostMediaItem[],
): Promise<FeedMediaItem[]> {
  const out: FeedMediaItem[] = [];
  for (const item of items) {
    const media = await db.getFirstAsync<{
      status: string;
      local_uri: string | null;
      chunk_count: number;
    }>('SELECT status, local_uri, chunk_count FROM media_objects WHERE cid = ?', [
      item.cid,
    ]);
    if (!media) {
      out.push({
        ...item,
        uri: null,
        status: 'pending',
        progress: 0,
      });
      continue;
    }
    if (media.status === 'complete') {
      out.push({
        ...item,
        uri: media.local_uri,
        status: 'complete',
        progress: 1,
      });
      continue;
    }
    if (media.status === 'failed') {
      out.push({ ...item, uri: null, status: 'failed', progress: 0 });
      continue;
    }
    const have = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) as c FROM media_chunks WHERE cid = ?',
      [item.cid],
    );
    out.push({
      ...item,
      uri: null,
      status: 'pending',
      progress:
        media.chunk_count > 0
          ? Math.min(1, (have?.c ?? 0) / media.chunk_count)
          : 0,
    });
  }
  return out;
}

async function hydratePost(
  db: SQLiteDatabase,
  row: PostRow,
  viewerPublicKey: string,
  depth = 0,
): Promise<FeedPost> {
  const reactions = await db.getAllAsync<{ emoji: string; c: number }>(
    `SELECT emoji, COUNT(*) as c FROM reactions WHERE post_id = ? GROUP BY emoji`,
    [row.id],
  );
  const mine = await db.getFirstAsync<{ emoji: string }>(
    `SELECT emoji FROM reactions WHERE post_id = ? AND author = ?`,
    [row.id, viewerPublicKey],
  );
  const commentCount = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM comments WHERE post_id = ?`,
    [row.id],
  );
  const reactionCounts: Record<string, number> = {};
  for (const r of reactions) {
    reactionCounts[r.emoji] = r.c;
  }

  let mediaItems = parseMediaJson(row.media_json);
  if (mediaItems.length === 0) {
    mediaItems = normalizePostMedia({
      mediaCid: row.media_cid,
      mediaMime: row.media_mime,
      mediaSize: row.media_size,
    });
  }
  const media = await resolveMediaItems(db, mediaItems);
  const first = media[0];
  const mediaLayout = normalizeMediaLayout(row.media_layout, media.length);

  let original: FeedPost | null = null;
  if (row.repost_of && depth < 1) {
    const origRow = await db.getFirstAsync<PostRow>(
      `SELECT p.id, p.author, p.body, p.created_at, p.edited_at, p.visibility_boost,
              pr.display_name, pr.avatar_uri, pr.avatar_cid,
              p.media_cid, p.media_mime, p.media_size, p.media_json, p.media_layout,
              p.kind, p.duration_ms, p.repost_of
       FROM posts p
       LEFT JOIN profiles pr ON pr.public_key = p.author
       WHERE p.id = ?`,
      [row.repost_of],
    );
    if (origRow) {
      original = await hydratePost(db, origRow, viewerPublicKey, depth + 1);
    }
  }

  const iReposted =
    !row.repost_of &&
    (await hasReposted(db, viewerPublicKey, row.id));

  const authorAvatarUri = await resolveAvatarUri(
    db,
    row.avatar_uri,
    row.avatar_cid,
  );

  return {
    id: row.id,
    author: row.author,
    authorName: row.display_name || shorten(row.author),
    authorAvatarUri,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
    visibilityBoost: (row.visibility_boost ?? 0) > 0,
    reactionCounts,
    myReaction: mine?.emoji ?? null,
    commentCount: commentCount?.c ?? 0,
    mediaCid: first?.cid ?? row.media_cid,
    mediaMime: first?.mime ?? row.media_mime,
    mediaSize: first?.size ?? row.media_size,
    mediaUri: first?.uri ?? null,
    mediaStatus: first?.status ?? 'none',
    mediaProgress: first?.progress ?? 0,
    media,
    mediaLayout,
    kind: row.kind === 'reel' ? 'reel' : 'post',
    durationMs: row.duration_ms ?? null,
    repostOf: row.repost_of,
    original,
    iReposted,
  };
}

const POST_SELECT = `SELECT p.id, p.author, p.body, p.created_at, p.edited_at, p.visibility_boost,
            pr.display_name, pr.avatar_uri, pr.avatar_cid,
            p.media_cid, p.media_mime, p.media_size, p.media_json, p.media_layout,
            p.kind, p.duration_ms, p.repost_of
     FROM posts p
     LEFT JOIN profiles pr ON pr.public_key = p.author`;

function sortFeed(posts: FeedPost[]): FeedPost[] {
  return [...posts].sort((a, b) => {
    if (a.visibilityBoost !== b.visibilityBoost) {
      return a.visibilityBoost ? -1 : 1;
    }
    return b.createdAt - a.createdAt;
  });
}

export async function listFeedPosts(
  db: SQLiteDatabase,
  viewerPublicKey: string,
  limit = 100,
): Promise<FeedPost[]> {
  const rows = await db.getAllAsync<PostRow>(
    `${POST_SELECT}
     WHERE (p.kind IS NULL OR p.kind = '' OR p.kind = 'post')
       AND (
         p.author = ?
         OR p.author IN (SELECT followee FROM follows WHERE follower = ?)
       )
     ORDER BY COALESCE(p.visibility_boost, 0) DESC, p.created_at DESC
     LIMIT ?`,
    [viewerPublicKey, viewerPublicKey, limit],
  );

  const posts: FeedPost[] = [];
  for (const row of rows) {
    posts.push(await hydratePost(db, row, viewerPublicKey));
  }
  return sortFeed(posts);
}

/** Local community feed: self + currently nearby peers (+ followed peers). */
export async function listNearbyFeedPosts(
  db: SQLiteDatabase,
  viewerPublicKey: string,
  nearbyPublicKeys: string[],
  limit = 100,
): Promise<FeedPost[]> {
  const keys = [
    ...new Set(
      nearbyPublicKeys
        .map((k) => k.toLowerCase())
        .filter((k) => k && k !== viewerPublicKey.toLowerCase()),
    ),
  ];
  const placeholders = keys.map(() => '?').join(', ');
  const nearbyClause =
    keys.length > 0 ? `OR LOWER(p.author) IN (${placeholders})` : '';

  const rows = await db.getAllAsync<PostRow>(
    `${POST_SELECT}
     WHERE (p.kind IS NULL OR p.kind = '' OR p.kind = 'post')
       AND (
         p.author = ?
         OR p.author IN (SELECT followee FROM follows WHERE follower = ?)
         ${nearbyClause}
       )
     ORDER BY COALESCE(p.visibility_boost, 0) DESC, p.created_at DESC
     LIMIT ?`,
    [viewerPublicKey, viewerPublicKey, ...keys, limit],
  );

  const posts: FeedPost[] = [];
  for (const row of rows) {
    posts.push(await hydratePost(db, row, viewerPublicKey));
  }
  return sortFeed(posts);
}

export async function listReels(
  db: SQLiteDatabase,
  viewerPublicKey: string,
  limit = 100,
): Promise<FeedPost[]> {
  const rows = await db.getAllAsync<PostRow>(
    `${POST_SELECT}
     WHERE p.kind = 'reel'
       AND (
         p.author = ?
         OR p.author IN (SELECT followee FROM follows WHERE follower = ?)
       )
     ORDER BY p.created_at DESC
     LIMIT ?`,
    [viewerPublicKey, viewerPublicKey, limit],
  );

  const posts: FeedPost[] = [];
  for (const row of rows) {
    posts.push(await hydratePost(db, row, viewerPublicKey));
  }
  return posts;
}

export async function getPostById(
  db: SQLiteDatabase,
  postId: string,
  viewerPublicKey: string,
): Promise<FeedPost | null> {
  const row = await db.getFirstAsync<PostRow>(
    `${POST_SELECT}
     WHERE p.id = ?`,
    [postId],
  );
  if (!row) return null;
  return hydratePost(db, row, viewerPublicKey);
}

export async function listComments(
  db: SQLiteDatabase,
  postId: string,
): Promise<CommentRow[]> {
  const rows = await db.getAllAsync<{
    id: string;
    post_id: string;
    author: string;
    body: string;
    created_at: number;
    display_name: string | null;
  }>(
    `SELECT c.id, c.post_id, c.author, c.body, c.created_at, pr.display_name
     FROM comments c
     LEFT JOIN profiles pr ON pr.public_key = c.author
     WHERE c.post_id = ?
     ORDER BY c.created_at ASC`,
    [postId],
  );
  return rows.map((row) => ({
    id: row.id,
    postId: row.post_id,
    author: row.author,
    authorName: row.display_name || shorten(row.author),
    body: row.body,
    createdAt: row.created_at,
  }));
}

function shorten(key: string): string {
  return `${key.slice(0, 6)}…`;
}
