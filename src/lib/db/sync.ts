import type { SQLiteDatabase } from 'expo-sqlite';

import { NetConfig, SYNCABLE_EVENT_TYPES } from '@/lib/constants';
import type { MeshEvent } from '@/lib/crypto/events';

export async function listSyncableEventIds(
  db: SQLiteDatabase,
  limit = NetConfig.syncOfferLimit,
): Promise<string[]> {
  const types = SYNCABLE_EVENT_TYPES;
  const placeholders = types.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM events
     WHERE type IN (${placeholders})
     ORDER BY timestamp DESC
     LIMIT ?`,
    [...types, limit],
  );
  return rows.map((r) => r.id);
}

export async function getEventsByIds(
  db: SQLiteDatabase,
  ids: string[],
): Promise<MeshEvent[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.getAllAsync<{
    id: string;
    type: string;
    author: string;
    timestamp: number;
    payload_json: string;
    signature: string;
  }>(
    `SELECT id, type, author, timestamp, payload_json, signature
     FROM events WHERE id IN (${placeholders})`,
    ids,
  );
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    author: row.author,
    timestamp: row.timestamp,
    payload: JSON.parse(row.payload_json) as unknown,
    signature: row.signature,
  }));
}

export async function filterMissingEventIds(
  db: SQLiteDatabase,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM events WHERE id IN (${placeholders})`,
    ids,
  );
  const have = new Set(rows.map((r) => r.id));
  return ids.filter((id) => !have.has(id));
}

/** Pure helper: which offered ids should we request? */
export function selectWantedIds(
  offeredIds: string[],
  alreadyHave: Set<string>,
): string[] {
  return offeredIds.filter((id) => !alreadyHave.has(id));
}

export function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export function chunkList<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
