import type { SQLiteDatabase } from 'expo-sqlite';

import { StoryConfig } from '@/lib/constants';

export type StoryItem = {
  id: string;
  author: string;
  authorName: string;
  authorAvatarUri: string | null;
  body: string;
  createdAt: number;
  expiresAt: number;
  mediaCid: string | null;
  mediaMime: string | null;
  mediaSize: number | null;
  mediaUri: string | null;
  mediaStatus: 'none' | 'pending' | 'complete' | 'failed';
  viewed: boolean;
};

export type StoryRing = {
  author: string;
  authorName: string;
  authorAvatarUri: string | null;
  stories: StoryItem[];
  hasUnviewed: boolean;
};

type StoryRow = {
  id: string;
  author: string;
  body: string;
  created_at: number;
  expires_at: number;
  media_cid: string | null;
  media_mime: string | null;
  media_size: number | null;
  display_name: string | null;
  avatar_uri: string | null;
};

async function hydrateStory(
  db: SQLiteDatabase,
  row: StoryRow,
  viewerPublicKey: string,
): Promise<StoryItem> {
  let mediaUri: string | null = null;
  let mediaStatus: StoryItem['mediaStatus'] = 'none';

  if (row.media_cid) {
    const media = await db.getFirstAsync<{
      status: string;
      local_uri: string | null;
    }>('SELECT status, local_uri FROM media_objects WHERE cid = ?', [
      row.media_cid,
    ]);
    if (!media) {
      mediaStatus = 'pending';
    } else if (media.status === 'complete') {
      mediaStatus = 'complete';
      mediaUri = media.local_uri;
    } else if (media.status === 'failed') {
      mediaStatus = 'failed';
    } else {
      mediaStatus = 'pending';
    }
  }

  const view = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM story_views WHERE story_id = ? AND viewer = ?`,
    [row.id, viewerPublicKey],
  );

  return {
    id: row.id,
    author: row.author,
    authorName: row.display_name?.trim() || 'Nearby',
    authorAvatarUri: row.avatar_uri,
    body: row.body,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    mediaCid: row.media_cid,
    mediaMime: row.media_mime,
    mediaSize: row.media_size,
    mediaUri,
    mediaStatus,
    viewed: (view?.c ?? 0) > 0,
  };
}

export async function purgeExpiredStories(db: SQLiteDatabase): Promise<void> {
  const now = Date.now();
  await db.runAsync(`DELETE FROM story_views WHERE story_id IN (
    SELECT id FROM stories WHERE expires_at <= ?
  )`, [now]);
  await db.runAsync(`DELETE FROM stories WHERE expires_at <= ?`, [now]);
}

/** Active stories for self + nearby authors, grouped into rings. */
export async function listNearbyStoryRings(
  db: SQLiteDatabase,
  viewerPublicKey: string,
  nearbyPublicKeys: string[],
): Promise<StoryRing[]> {
  await purgeExpiredStories(db);

  const keys = [
    ...new Set(
      [viewerPublicKey, ...nearbyPublicKeys]
        .map((k) => k.toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (keys.length === 0) return [];

  const placeholders = keys.map(() => '?').join(', ');
  const now = Date.now();
  const rows = await db.getAllAsync<StoryRow>(
    `SELECT s.id, s.author, s.body, s.created_at, s.expires_at,
            s.media_cid, s.media_mime, s.media_size,
            pr.display_name, pr.avatar_uri
     FROM stories s
     LEFT JOIN profiles pr ON pr.public_key = s.author
     WHERE s.expires_at > ?
       AND LOWER(s.author) IN (${placeholders})
     ORDER BY s.created_at ASC`,
    [now, ...keys],
  );

  const byAuthor = new Map<string, StoryItem[]>();
  for (const row of rows) {
    const item = await hydrateStory(db, row, viewerPublicKey);
    const list = byAuthor.get(item.author) ?? [];
    list.push(item);
    byAuthor.set(item.author, list);
  }

  const rings: StoryRing[] = [];
  for (const [author, stories] of byAuthor) {
    const first = stories[0]!;
    rings.push({
      author,
      authorName: first.authorName,
      authorAvatarUri: first.authorAvatarUri,
      stories,
      hasUnviewed: stories.some((s) => !s.viewed),
    });
  }

  // Self first, then unviewed, then by newest story.
  rings.sort((a, b) => {
    const aSelf = a.author.toLowerCase() === viewerPublicKey.toLowerCase();
    const bSelf = b.author.toLowerCase() === viewerPublicKey.toLowerCase();
    if (aSelf !== bSelf) return aSelf ? -1 : 1;
    if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1;
    const aMax = Math.max(...a.stories.map((s) => s.createdAt));
    const bMax = Math.max(...b.stories.map((s) => s.createdAt));
    return bMax - aMax;
  });

  return rings;
}

export async function markStoryViewed(
  db: SQLiteDatabase,
  storyId: string,
  viewerPublicKey: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO story_views (story_id, viewer, viewed_at)
     VALUES (?, ?, ?)
     ON CONFLICT(story_id, viewer) DO UPDATE SET viewed_at = excluded.viewed_at`,
    [storyId, viewerPublicKey, Date.now()],
  );
}

export function storyExpiresAt(createdAt: number): number {
  return createdAt + StoryConfig.ttlMs;
}
