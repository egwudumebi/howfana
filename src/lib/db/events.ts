import type { SQLiteDatabase } from 'expo-sqlite';

import { type MeshEvent, verifyEvent } from '@/lib/crypto/events';

export class DuplicateEventError extends Error {
  constructor(eventId: string) {
    super(`Event already exists: ${eventId}`);
    this.name = 'DuplicateEventError';
  }
}

export class InvalidEventSignatureError extends Error {
  constructor(eventId: string) {
    super(`Invalid signature for event: ${eventId}`);
    this.name = 'InvalidEventSignatureError';
  }
}

export async function appendEvent(db: SQLiteDatabase, event: MeshEvent): Promise<void> {
  const valid = await verifyEvent(event);
  if (!valid) {
    throw new InvalidEventSignatureError(event.id);
  }

  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM events WHERE id = ?',
    [event.id],
  );
  if (existing) {
    throw new DuplicateEventError(event.id);
  }

  await db.runAsync(
    `INSERT INTO events (id, type, author, timestamp, payload_json, signature, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id,
      event.type,
      event.author,
      event.timestamp,
      JSON.stringify(event.payload),
      event.signature,
      Date.now(),
    ],
  );
}

export async function getEventById(
  db: SQLiteDatabase,
  id: string,
): Promise<MeshEvent | null> {
  const row = await db.getFirstAsync<{
    id: string;
    type: string;
    author: string;
    timestamp: number;
    payload_json: string;
    signature: string;
  }>('SELECT id, type, author, timestamp, payload_json, signature FROM events WHERE id = ?', [
    id,
  ]);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    type: row.type,
    author: row.author,
    timestamp: row.timestamp,
    payload: JSON.parse(row.payload_json) as unknown,
    signature: row.signature,
  };
}
