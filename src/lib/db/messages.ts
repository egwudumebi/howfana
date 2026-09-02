import type { SQLiteDatabase } from 'expo-sqlite';
import { sha256 } from '@noble/hashes/sha2.js';

import { bytesToHex, utf8ToBytes } from '@/lib/crypto/encoding';
import { getProfile, type Profile } from '@/lib/db/profiles';

export type ConversationSummary = {
  conversationId: string;
  otherPublicKey: string;
  otherName: string;
  lastMessageBody: string;
  lastAt: number;
};

export type MessageRow = {
  id: string;
  sender: string;
  body: string;
  createdAt: number;
  senderName: string;
};

export function computeConversationId(pkA: string, pkB: string): string {
  const a = pkA.toLowerCase();
  const b = pkB.toLowerCase();
  const [x, y] = a < b ? [a, b] : [b, a];
  const input = `${x}:${y}`;
  return bytesToHex(sha256(utf8ToBytes(input)));
}

export async function listConversations(
  db: SQLiteDatabase,
  viewerPublicKey: string,
  limit = 50,
): Promise<ConversationSummary[]> {
  const rows = await db.getAllAsync<{
    conversation_id: string;
    sender: string;
    recipient: string;
    body: string;
    created_at: number;
  }>(
    `SELECT conversation_id, sender, recipient, body, created_at
     FROM messages
     WHERE sender = ? OR recipient = ?
     ORDER BY created_at DESC
     LIMIT 200`,
    [viewerPublicKey, viewerPublicKey],
  );

  const byConversation = new Map<
    string,
    { otherPublicKey: string; lastMessageBody: string; lastAt: number }
  >();

  for (const row of rows) {
    const conversationId = row.conversation_id;
    if (byConversation.has(conversationId)) continue;
    const otherPk =
      row.sender === viewerPublicKey ? row.recipient : row.sender;
    byConversation.set(conversationId, {
      otherPublicKey: otherPk,
      lastMessageBody: row.body,
      lastAt: row.created_at,
    });
    if (byConversation.size >= limit) break;
  }

  const out: ConversationSummary[] = [];
  for (const [conversationId, meta] of byConversation) {
    const profile = await getProfile(db, meta.otherPublicKey);
    out.push({
      conversationId,
      otherPublicKey: meta.otherPublicKey,
      otherName: profile?.displayName || shorten(meta.otherPublicKey),
      lastMessageBody: meta.lastMessageBody,
      lastAt: meta.lastAt,
    });
  }

  out.sort((a, b) => b.lastAt - a.lastAt);
  return out;
}

export async function listMessages(
  db: SQLiteDatabase,
  conversationId: string,
  limit = 200,
): Promise<MessageRow[]> {
  const rows = await db.getAllAsync<{
    id: string;
    sender: string;
    body: string;
    created_at: number;
    display_name: string | null;
  }>(
    `SELECT m.id, m.sender, m.body, m.created_at, pr.display_name
     FROM messages m
     LEFT JOIN profiles pr ON pr.public_key = m.sender
     WHERE m.conversation_id = ?
     ORDER BY m.created_at ASC
     LIMIT ?`,
    [conversationId, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    sender: row.sender,
    body: row.body,
    createdAt: row.created_at,
    senderName: row.display_name || shorten(row.sender),
  }));
}

function shorten(key: string): string {
  return `${key.slice(0, 6)}…`;
}

