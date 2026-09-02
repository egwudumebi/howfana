import { sha256 } from '@noble/hashes/sha2.js';

import { canonicalize } from './canonical';
import { bytesToHex, utf8ToBytes } from './encoding';
import { sign, verify } from './identity';

export type MeshEvent = {
  id: string;
  type: string;
  author: string;
  timestamp: number;
  payload: unknown;
  signature: string;
};

export type UnsignedEvent = Omit<MeshEvent, 'id' | 'signature'>;

function signingPayload(event: Omit<MeshEvent, 'signature'>): Uint8Array {
  return utf8ToBytes(
    canonicalize({
      id: event.id,
      type: event.type,
      author: event.author,
      timestamp: event.timestamp,
      payload: event.payload,
    }),
  );
}

export function computeEventId(input: UnsignedEvent): string {
  const body = canonicalize({
    type: input.type,
    author: input.author,
    timestamp: input.timestamp,
    payload: input.payload,
  });
  return bytesToHex(sha256(utf8ToBytes(body)));
}

export async function createSignedEvent(
  input: UnsignedEvent,
  secretKeyHex: string,
): Promise<MeshEvent> {
  const id = computeEventId(input);
  const unsigned = { ...input, id };
  const signature = await sign(signingPayload(unsigned), secretKeyHex);
  return { ...unsigned, signature };
}

export async function verifyEvent(event: MeshEvent): Promise<boolean> {
  const expectedId = computeEventId({
    type: event.type,
    author: event.author,
    timestamp: event.timestamp,
    payload: event.payload,
  });
  if (expectedId !== event.id) {
    return false;
  }
  return verify(signingPayload(event), event.signature, event.author);
}
