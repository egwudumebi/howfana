import type { SQLiteDatabase } from 'expo-sqlite';

export async function migrate(db: SQLiteDatabase): Promise<void> {
  // Base schema only — never reference columns added later in this batch.
  // Existing installs keep their old posts table via IF NOT EXISTS.
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS identities (
      public_key TEXT PRIMARY KEY NOT NULL,
      created_at INTEGER NOT NULL,
      is_local INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS profiles (
      public_key TEXT PRIMARY KEY NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      avatar_uri TEXT,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (public_key) REFERENCES identities(public_key)
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY NOT NULL,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      event_id TEXT NOT NULL UNIQUE,
      FOREIGN KEY (author) REFERENCES identities(public_key)
    );

    CREATE TABLE IF NOT EXISTS follows (
      follower TEXT NOT NULL,
      followee TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      event_id TEXT NOT NULL UNIQUE,
      PRIMARY KEY (follower, followee),
      FOREIGN KEY (follower) REFERENCES identities(public_key),
      FOREIGN KEY (followee) REFERENCES identities(public_key)
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id TEXT PRIMARY KEY NOT NULL,
      post_id TEXT NOT NULL,
      author TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      event_id TEXT NOT NULL UNIQUE,
      UNIQUE (author, post_id),
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (author) REFERENCES identities(public_key)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY NOT NULL,
      post_id TEXT NOT NULL,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      parent_id TEXT,
      created_at INTEGER NOT NULL,
      event_id TEXT NOT NULL UNIQUE,
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (author) REFERENCES identities(public_key)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      recipient TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      event_id TEXT NOT NULL UNIQUE,
      FOREIGN KEY (sender) REFERENCES identities(public_key),
      FOREIGN KEY (recipient) REFERENCES identities(public_key)
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      author TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      signature TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      FOREIGN KEY (author) REFERENCES identities(public_key)
    );

    CREATE TABLE IF NOT EXISTS media_objects (
      cid TEXT PRIMARY KEY NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      chunk_size INTEGER NOT NULL,
      chunk_count INTEGER NOT NULL,
      status TEXT NOT NULL,
      local_uri TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_chunks (
      cid TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      data_b64 TEXT NOT NULL,
      PRIMARY KEY (cid, chunk_index),
      FOREIGN KEY (cid) REFERENCES media_objects(cid)
    );

    CREATE INDEX IF NOT EXISTS idx_events_author ON events(author);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
    CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_reactions_post ON reactions(post_id);
    CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_media_status ON media_objects(status);
  `);

  // Additive columns for older installs (and fresh installs after the slim CREATE TABLE).
  await addColumnIfMissing(db, 'posts', 'media_cid', 'TEXT');
  await addColumnIfMissing(db, 'posts', 'media_mime', 'TEXT');
  await addColumnIfMissing(db, 'posts', 'media_size', 'INTEGER');
  await addColumnIfMissing(db, 'posts', 'media_json', 'TEXT');
  await addColumnIfMissing(db, 'posts', 'repost_of', 'TEXT');
  await addColumnIfMissing(db, 'posts', 'media_layout', 'TEXT');
  await addColumnIfMissing(db, 'posts', 'kind', "TEXT DEFAULT 'post'");
  await addColumnIfMissing(db, 'posts', 'duration_ms', 'INTEGER');
  await addColumnIfMissing(db, 'posts', 'edited_at', 'INTEGER');
  await addColumnIfMissing(db, 'posts', 'visibility_boost', 'INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'profiles', 'about_json', 'TEXT');
  await addColumnIfMissing(db, 'profiles', 'avatar_cid', 'TEXT');

  await db.runAsync(
    `UPDATE posts SET kind = 'post' WHERE kind IS NULL OR kind = ''`,
  );

  const postCols = await listColumnNames(db, 'posts');
  if (!postCols.has('repost_of') || !postCols.has('media_json')) {
    throw new Error(
      `posts migration incomplete; columns=${[...postCols].join(',')}`,
    );
  }

  // One statement per call — avoids multi-statement exec failing mid-batch.
  await db.runAsync(
    'CREATE INDEX IF NOT EXISTS idx_posts_media_cid ON posts(media_cid)',
  );
  await db.runAsync(
    'CREATE INDEX IF NOT EXISTS idx_posts_repost_of ON posts(repost_of)',
  );
  await db.runAsync(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_author_repost
     ON posts(author, repost_of)
     WHERE repost_of IS NOT NULL`,
  );

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY NOT NULL,
      author TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      event_id TEXT NOT NULL UNIQUE,
      media_cid TEXT,
      media_mime TEXT,
      media_size INTEGER,
      FOREIGN KEY (author) REFERENCES identities(public_key)
    );

    CREATE TABLE IF NOT EXISTS story_views (
      story_id TEXT NOT NULL,
      viewer TEXT NOT NULL,
      viewed_at INTEGER NOT NULL,
      PRIMARY KEY (story_id, viewer)
    );

    CREATE INDEX IF NOT EXISTS idx_stories_author_created
      ON stories(author, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_stories_expires
      ON stories(expires_at);
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id TEXT PRIMARY KEY NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      media_uris_json TEXT NOT NULL DEFAULT '[]',
      media_layout TEXT,
      publish_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_posts_publish
      ON scheduled_posts(status, publish_at);
  `);

  // Backfill media_json from legacy scalar media_cid when missing.
  const legacy = await db.getAllAsync<{
    id: string;
    media_cid: string;
    media_mime: string | null;
    media_size: number | null;
  }>(
    `SELECT id, media_cid, media_mime, media_size FROM posts
     WHERE media_cid IS NOT NULL AND media_cid != ''
       AND (media_json IS NULL OR media_json = '')`,
  );
  for (const row of legacy) {
    const mediaJson = JSON.stringify([
      {
        cid: row.media_cid,
        mime: row.media_mime || 'image/jpeg',
        size: row.media_size ?? 0,
      },
    ]);
    await db.runAsync('UPDATE posts SET media_json = ? WHERE id = ?', [
      mediaJson,
      row.id,
    ]);
  }
}

async function listColumnNames(
  db: SQLiteDatabase,
  table: string,
): Promise<Set<string>> {
  const cols = await db.getAllAsync<Record<string, unknown>>(
    `PRAGMA table_info(${table})`,
  );
  const names = new Set<string>();
  for (const col of cols) {
    const name = col.name ?? col.Name;
    if (typeof name === 'string') names.add(name);
  }
  return names;
}

async function addColumnIfMissing(
  db: SQLiteDatabase,
  table: string,
  column: string,
  typeSql: string,
): Promise<void> {
  const cols = await listColumnNames(db, table);
  if (cols.has(column)) {
    return;
  }
  try {
    await db.runAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeSql}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Concurrent / retry-safe: column may already exist.
    if (/duplicate column/i.test(message)) {
      return;
    }
    throw err;
  }
}
