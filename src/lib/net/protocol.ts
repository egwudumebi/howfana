import { EventType } from '@/lib/constants';
import {
  createSignedEvent,
  verifyEvent,
  type MeshEvent,
} from '@/lib/crypto/events';
import type { AnnouncePacket, Frame, HelloPayload } from '@/lib/net/types';

export function parseAnnounce(raw: string): AnnouncePacket | null {
  try {
    const data = JSON.parse(raw) as Partial<AnnouncePacket>;
    if (
      data.v !== 1 ||
      data.type !== 'howfana.announce' ||
      typeof data.pk !== 'string' ||
      typeof data.name !== 'string' ||
      typeof data.port !== 'number' ||
      typeof data.ts !== 'number'
    ) {
      return null;
    }
    if (!/^[0-9a-f]{64}$/i.test(data.pk)) {
      return null;
    }
    return {
      v: 1,
      type: 'howfana.announce',
      pk: data.pk.toLowerCase(),
      name: data.name,
      port: data.port,
      ts: data.ts,
    };
  } catch {
    return null;
  }
}

export function buildAnnounce(input: {
  publicKey: string;
  displayName: string;
  port: number;
  ts?: number;
}): AnnouncePacket {
  return {
    v: 1,
    type: 'howfana.announce',
    pk: input.publicKey.toLowerCase(),
    name: input.displayName,
    port: input.port,
    ts: input.ts ?? Date.now(),
  };
}

export async function createHelloEvent(
  author: string,
  secretKey: string,
  payload: HelloPayload,
): Promise<MeshEvent> {
  return createSignedEvent(
    {
      type: EventType.PeerHello,
      author,
      timestamp: Date.now(),
      payload,
    },
    secretKey,
  );
}

export async function verifyHelloEvent(event: MeshEvent): Promise<HelloPayload | null> {
  if (event.type !== EventType.PeerHello) {
    return null;
  }
  const ok = await verifyEvent(event);
  if (!ok) {
    return null;
  }
  const payload = event.payload as Partial<HelloPayload>;
  if (typeof payload.displayName !== 'string') {
    return null;
  }
  return {
    displayName: payload.displayName,
    avatarUri: payload.avatarUri ?? null,
  };
}

export function isControlFrame(frame: Frame): boolean {
  return (
    frame.type === 'hello' ||
    frame.type === 'hello_ack' ||
    frame.type === 'ping' ||
    frame.type === 'pong'
  );
}
