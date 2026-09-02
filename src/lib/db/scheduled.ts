import type { SQLiteDatabase } from 'expo-sqlite';

export type ScheduledPostRow = {
  id: string;
  body: string;
  mediaUris: string[];
  mediaLayout: string | null;
  publishAt: number;
  createdAt: number;
  status: 'pending' | 'published' | 'cancelled';
};

export async function insertScheduledPost(
  db: SQLiteDatabase,
  row: {
    id: string;
    body: string;
    mediaUris: string[];
    mediaLayout?: string | null;
    publishAt: number;
  },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO scheduled_posts
      (id, body, media_uris_json, media_layout, publish_at, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [
      row.id,
      row.body,
      JSON.stringify(row.mediaUris),
      row.mediaLayout ?? null,
      row.publishAt,
      Date.now(),
    ],
  );
}

export async function listPendingScheduled(
  db: SQLiteDatabase,
  now = Date.now(),
): Promise<ScheduledPostRow[]> {
  const rows = await db.getAllAsync<{
    id: string;
    body: string;
    media_uris_json: string;
    media_layout: string | null;
    publish_at: number;
    created_at: number;
    status: string;
  }>(
    `SELECT * FROM scheduled_posts
     WHERE status = 'pending' AND publish_at <= ?
     ORDER BY publish_at ASC`,
    [now],
  );
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    mediaUris: parseUris(r.media_uris_json),
    mediaLayout: r.media_layout,
    publishAt: r.publish_at,
    createdAt: r.created_at,
    status: 'pending',
  }));
}

export async function listUpcomingScheduled(
  db: SQLiteDatabase,
): Promise<ScheduledPostRow[]> {
  const rows = await db.getAllAsync<{
    id: string;
    body: string;
    media_uris_json: string;
    media_layout: string | null;
    publish_at: number;
    created_at: number;
    status: string;
  }>(
    `SELECT * FROM scheduled_posts
     WHERE status = 'pending'
     ORDER BY publish_at ASC
     LIMIT 20`,
  );
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    mediaUris: parseUris(r.media_uris_json),
    mediaLayout: r.media_layout,
    publishAt: r.publish_at,
    createdAt: r.created_at,
    status: 'pending',
  }));
}

export async function markScheduledPublished(
  db: SQLiteDatabase,
  id: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE scheduled_posts SET status = 'published' WHERE id = ?`,
    [id],
  );
}

export async function cancelScheduledPost(
  db: SQLiteDatabase,
  id: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE scheduled_posts SET status = 'cancelled' WHERE id = ?`,
    [id],
  );
}

function parseUris(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}
