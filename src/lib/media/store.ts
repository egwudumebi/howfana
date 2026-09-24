import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { SQLiteDatabase } from 'expo-sqlite';

import { MediaConfig } from '@/lib/constants';
import {
  base64ToBytes,
  bytesToBase64,
  chunkCountForSize,
  hashBytes,
  missingChunkIndexes,
  reassembleChunks,
  splitIntoChunks,
} from '@/lib/media/chunking';

export type MediaStatus = 'pending' | 'complete' | 'failed';

export type MediaObject = {
  cid: string;
  mime: string;
  size: number;
  chunkSize: number;
  chunkCount: number;
  status: MediaStatus;
  localUri: string | null;
  createdAt: number;
  updatedAt: number;
};

function mediaDir(): Directory {
  const dir = new Directory(Paths.document, 'howfana-media');
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

function mediaFile(cid: string, mime: string): File {
  let ext = 'bin';
  if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
  else if (mime.includes('png')) ext = 'png';
  else if (mime.includes('mp4')) ext = 'mp4';
  else if (mime.includes('quicktime')) ext = 'mov';
  else if (mime.includes('webm')) ext = 'webm';
  return new File(mediaDir(), `${cid}.${ext}`);
}

export async function getMediaObject(
  db: SQLiteDatabase,
  cid: string,
): Promise<MediaObject | null> {
  const row = await db.getFirstAsync<{
    cid: string;
    mime: string;
    size: number;
    chunk_size: number;
    chunk_count: number;
    status: string;
    local_uri: string | null;
    created_at: number;
    updated_at: number;
  }>('SELECT * FROM media_objects WHERE cid = ?', [cid]);
  if (!row) return null;
  return {
    cid: row.cid,
    mime: row.mime,
    size: row.size,
    chunkSize: row.chunk_size,
    chunkCount: row.chunk_count,
    status: row.status as MediaStatus,
    localUri: row.local_uri,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPresentChunkIndexes(
  db: SQLiteDatabase,
  cid: string,
): Promise<number[]> {
  const rows = await db.getAllAsync<{ chunk_index: number }>(
    'SELECT chunk_index FROM media_chunks WHERE cid = ? ORDER BY chunk_index ASC',
    [cid],
  );
  return rows.map((r) => r.chunk_index);
}

export async function getMissingIndexes(
  db: SQLiteDatabase,
  cid: string,
): Promise<number[]> {
  const media = await getMediaObject(db, cid);
  if (!media) return [];
  if (media.status === 'complete') return [];
  const present = await listPresentChunkIndexes(db, cid);
  return missingChunkIndexes(present, media.chunkCount);
}

export async function upsertMediaMeta(
  db: SQLiteDatabase,
  input: {
    cid: string;
    mime: string;
    size: number;
    chunkSize: number;
    chunkCount: number;
    status: MediaStatus;
    localUri?: string | null;
  },
): Promise<void> {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO media_objects
       (cid, mime, size, chunk_size, chunk_count, status, local_uri, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cid) DO UPDATE SET
       mime = excluded.mime,
       size = excluded.size,
       chunk_size = excluded.chunk_size,
       chunk_count = excluded.chunk_count,
       status = excluded.status,
       local_uri = COALESCE(excluded.local_uri, media_objects.local_uri),
       updated_at = excluded.updated_at`,
    [
      input.cid,
      input.mime,
      input.size,
      input.chunkSize,
      input.chunkCount,
      input.status,
      input.localUri ?? null,
      now,
      now,
    ],
  );
}

export async function storeChunk(
  db: SQLiteDatabase,
  cid: string,
  index: number,
  dataB64: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO media_chunks (cid, chunk_index, data_b64)
     VALUES (?, ?, ?)
     ON CONFLICT(cid, chunk_index) DO UPDATE SET data_b64 = excluded.data_b64`,
    [cid, index, dataB64],
  );
}

export async function getChunkBase64(
  db: SQLiteDatabase,
  cid: string,
  index: number,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ data_b64: string }>(
    'SELECT data_b64 FROM media_chunks WHERE cid = ? AND chunk_index = ?',
    [cid, index],
  );
  return row?.data_b64 ?? null;
}

export async function tryFinalizeMedia(
  db: SQLiteDatabase,
  cid: string,
): Promise<MediaObject | null> {
  const media = await getMediaObject(db, cid);
  if (!media) return null;
  if (media.status === 'complete' && media.localUri) return media;

  const missing = await getMissingIndexes(db, cid);
  if (missing.length > 0) return media;

  const rows = await db.getAllAsync<{ chunk_index: number; data_b64: string }>(
    'SELECT chunk_index, data_b64 FROM media_chunks WHERE cid = ? ORDER BY chunk_index ASC',
    [cid],
  );
  if (rows.length !== media.chunkCount) return media;

  const chunks = rows.map((r) => base64ToBytes(r.data_b64));
  let bytes: Uint8Array;
  try {
    bytes = reassembleChunks(chunks, media.size);
  } catch {
    await upsertMediaMeta(db, { ...media, status: 'failed' });
    return getMediaObject(db, cid);
  }

  const digest = hashBytes(bytes);
  if (digest !== cid) {
    await upsertMediaMeta(db, { ...media, status: 'failed' });
    return getMediaObject(db, cid);
  }

  const file = mediaFile(cid, media.mime);
  if (!file.exists) {
    file.create();
  }
  file.write(bytes);

  await upsertMediaMeta(db, {
    ...media,
    status: 'complete',
    localUri: file.uri,
  });
  return getMediaObject(db, cid);
}

/**
 * Compress a local image URI, content-address it, and store as complete media.
 */
export async function importLocalImage(
  db: SQLiteDatabase,
  sourceUri: string,
  opts?: { maxWidth?: number },
): Promise<MediaObject> {
  const context = ImageManipulator.manipulate(sourceUri);
  context.resize({ width: opts?.maxWidth ?? MediaConfig.maxWidth });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: MediaConfig.jpegQuality,
    format: SaveFormat.JPEG,
  });

  const source = new File(saved.uri);
  const bytes = await source.bytes();
  if (bytes.byteLength > MediaConfig.maxBytes) {
    throw new Error(
      `Image too large after compress (${bytes.byteLength} bytes). Max ${MediaConfig.maxBytes}.`,
    );
  }

  const cid = hashBytes(bytes);
  const existing = await getMediaObject(db, cid);
  if (existing?.status === 'complete' && existing.localUri) {
    return existing;
  }

  const mime = 'image/jpeg';
  const chunks = splitIntoChunks(bytes, MediaConfig.chunkSize);
  await upsertMediaMeta(db, {
    cid,
    mime,
    size: bytes.byteLength,
    chunkSize: MediaConfig.chunkSize,
    chunkCount: chunks.length,
    status: 'pending',
  });

  for (let i = 0; i < chunks.length; i++) {
    await storeChunk(db, cid, i, bytesToBase64(chunks[i]!));
  }

  const finalized = await tryFinalizeMedia(db, cid);
  if (!finalized || finalized.status !== 'complete') {
    throw new Error('Failed to finalize local media');
  }
  return finalized;
}

/** Square avatar — smaller payload for profile sync. */
export async function importAvatarImage(
  db: SQLiteDatabase,
  sourceUri: string,
): Promise<MediaObject> {
  return importLocalImage(db, sourceUri, { maxWidth: 512 });
}

/**
 * Import a local video for reels — no re-encode; size-capped for mesh transfer.
 */
export async function importLocalVideo(
  db: SQLiteDatabase,
  sourceUri: string,
  mimeHint?: string | null,
): Promise<MediaObject> {
  const source = new File(sourceUri);
  if (!source.exists) {
    throw new Error('Video file not found');
  }
  const bytes = await source.bytes();
  if (bytes.byteLength > MediaConfig.maxReelBytes) {
    throw new Error(
      `Video too large (${Math.round(bytes.byteLength / 1_000_000)}MB). Max ${Math.round(MediaConfig.maxReelBytes / 1_000_000)}MB for mesh reels.`,
    );
  }
  if (bytes.byteLength === 0) {
    throw new Error('Video is empty');
  }

  const cid = hashBytes(bytes);
  const existing = await getMediaObject(db, cid);
  if (existing?.status === 'complete' && existing.localUri) {
    return existing;
  }

  const mime =
    mimeHint && mimeHint.startsWith('video/')
      ? mimeHint
      : 'video/mp4';
  const chunks = splitIntoChunks(bytes, MediaConfig.chunkSize);
  await upsertMediaMeta(db, {
    cid,
    mime,
    size: bytes.byteLength,
    chunkSize: MediaConfig.chunkSize,
    chunkCount: chunks.length,
    status: 'pending',
  });

  for (let i = 0; i < chunks.length; i++) {
    await storeChunk(db, cid, i, bytesToBase64(chunks[i]!));
  }

  const finalized = await tryFinalizeMedia(db, cid);
  if (!finalized || finalized.status !== 'complete') {
    throw new Error('Failed to finalize local video');
  }
  return finalized;
}

export async function ensurePendingMedia(
  db: SQLiteDatabase,
  offer: {
    cid: string;
    size: number;
    mime: string;
    chunkSize: number;
    chunkCount: number;
  },
): Promise<MediaObject> {
  const existing = await getMediaObject(db, offer.cid);
  if (existing?.status === 'complete') return existing;

  const count =
    offer.chunkCount || chunkCountForSize(offer.size, offer.chunkSize);
  await upsertMediaMeta(db, {
    cid: offer.cid,
    mime: offer.mime,
    size: offer.size,
    chunkSize: offer.chunkSize,
    chunkCount: count,
    status: 'pending',
  });
  return (await getMediaObject(db, offer.cid))!;
}

export async function listIncompleteMediaCidsFromPosts(
  db: SQLiteDatabase,
): Promise<
  Array<{
    cid: string;
    mime: string;
    size: number;
  }>
> {
  const rows = await db.getAllAsync<{
    media_cid: string | null;
    media_mime: string | null;
    media_size: number | null;
    media_json: string | null;
  }>(
    `SELECT media_cid, media_mime, media_size, media_json
     FROM posts
     WHERE (media_cid IS NOT NULL AND media_cid != '')
        OR (media_json IS NOT NULL AND media_json != '' AND media_json != '[]')
     UNION ALL
     SELECT media_cid, media_mime, media_size, NULL as media_json
     FROM stories
     WHERE media_cid IS NOT NULL AND media_cid != ''
       AND expires_at > ?`,
    [Date.now()],
  );

  const seen = new Set<string>();
  const out: Array<{ cid: string; mime: string; size: number }> = [];

  const avatarRows = await db.getAllAsync<{
    avatar_cid: string | null;
  }>(
    `SELECT avatar_cid FROM profiles
     WHERE avatar_cid IS NOT NULL AND avatar_cid != ''`,
  );
  for (const row of avatarRows) {
    if (!row.avatar_cid || seen.has(row.avatar_cid)) continue;
    seen.add(row.avatar_cid);
    const media = await getMediaObject(db, row.avatar_cid);
    if (media?.status === 'complete') continue;
    out.push({
      cid: row.avatar_cid,
      mime: media?.mime || 'image/jpeg',
      size: media?.size ?? 0,
    });
  }

  for (const row of rows) {
    const items: Array<{ cid: string; mime: string; size: number }> = [];
    if (row.media_json) {
      try {
        const parsed = JSON.parse(row.media_json) as unknown;
        if (Array.isArray(parsed)) {
          for (const raw of parsed) {
            if (!raw || typeof raw !== 'object') continue;
            const item = raw as Record<string, unknown>;
            if (typeof item.cid !== 'string' || !item.cid) continue;
            items.push({
              cid: item.cid,
              mime: typeof item.mime === 'string' ? item.mime : 'image/jpeg',
              size: typeof item.size === 'number' ? item.size : 0,
            });
          }
        }
      } catch {
        // fall through to scalar
      }
    }
    if (items.length === 0 && row.media_cid) {
      items.push({
        cid: row.media_cid,
        mime: row.media_mime || 'image/jpeg',
        size: row.media_size ?? 0,
      });
    }

    for (const item of items) {
      if (seen.has(item.cid)) continue;
      seen.add(item.cid);
      const media = await getMediaObject(db, item.cid);
      if (media?.status === 'complete') continue;
      out.push({
        cid: item.cid,
        mime: item.mime || media?.mime || 'image/jpeg',
        size: item.size || media?.size || 0,
      });
    }
  }
  return out;
}
