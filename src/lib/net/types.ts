import type { MeshEvent } from '@/lib/crypto/events';

export type SessionStatus =
  | 'discovered'
  | 'connecting'
  | 'handshaking'
  | 'connected'
  | 'disconnected';

export type DiscoverySource = 'wifi' | 'ble';

export type DiscoveredPeer = {
  publicKey: string;
  displayName: string;
  host: string;
  port: number;
  lastSeenAt: number;
  /** How this peer was seen (merged over time). */
  sources?: DiscoverySource[];
  /** BLE RSSI when last seen over Bluetooth (dBm). */
  rssi?: number | null;
  /** 16-byte hex prefix from BLE ads (for merging with full Wi‑Fi identity). */
  blePrefix?: string | null;
};

export type PeerSession = {
  publicKey: string;
  displayName: string;
  host: string;
  port: number;
  status: SessionStatus;
  lastHeartbeatAt: number | null;
  error: string | null;
};

export type AnnouncePacket = {
  v: 1;
  type: 'howfana.announce';
  pk: string;
  name: string;
  port: number;
  ts: number;
};

export type HelloPayload = {
  displayName: string;
  avatarUri: string | null;
  avatarCid?: string | null;
};

export type CallKind = 'audio' | 'video';

export type Frame =
  | { type: 'hello'; event: MeshEvent }
  | { type: 'hello_ack'; event: MeshEvent }
  | { type: 'ping'; ts: number }
  | { type: 'pong'; ts: number }
  | { type: 'sync_offer'; ids: string[] }
  | { type: 'sync_want'; ids: string[] }
  | { type: 'sync_batch'; events: MeshEvent[] }
  | {
      type: 'media_offer';
      cid: string;
      size: number;
      mime: string;
      chunkSize: number;
      chunkCount: number;
    }
  | { type: 'media_want'; cid: string; indexes: number[] }
  | { type: 'media_chunk'; cid: string; index: number; data: string }
  | {
      type: 'relay';
      envelope: {
        id: string;
        ttl: number;
        path: string[];
        origin: string;
        event: MeshEvent;
      };
    }
  | {
      type: 'call_invite';
      callId: string;
      from: string;
      to: string;
      kind: CallKind;
    }
  | {
      type: 'call_accept';
      callId: string;
      from: string;
      to: string;
    }
  | {
      type: 'call_reject';
      callId: string;
      from: string;
      to: string;
      reason?: string;
    }
  | {
      type: 'call_hangup';
      callId: string;
      from: string;
      to: string;
    }
  | {
      type: 'call_sdp';
      callId: string;
      from: string;
      to: string;
      sdpType: 'offer' | 'answer';
      sdp: string;
    }
  | {
      type: 'call_ice';
      callId: string;
      from: string;
      to: string;
      candidate: string;
      sdpMid: string | null;
      sdpMLineIndex: number | null;
    };

export type LocalPeerInfo = {
  publicKey: string;
  displayName: string;
};

export type TransportEvent =
  | { kind: 'peer'; peer: DiscoveredPeer }
  | { kind: 'peerLost'; publicKey: string }
  | { kind: 'incoming'; publicKeyHint?: string; connectionId: string }
  | { kind: 'connected'; connectionId: string; host: string; port: number }
  | { kind: 'disconnected'; connectionId: string; reason?: string }
  | { kind: 'frame'; connectionId: string; frame: Frame }
  | { kind: 'error'; error: Error };

export interface MeshTransport {
  readonly name: string;
  readonly available: boolean;
  start(local: LocalPeerInfo): Promise<void>;
  stop(): Promise<void>;
  /** Open outbound TCP to a discovered peer. Returns connectionId. */
  connect(peer: DiscoveredPeer): Promise<string>;
  disconnect(connectionId: string): Promise<void>;
  send(connectionId: string, frame: Frame): Promise<void>;
  subscribe(handler: (event: TransportEvent) => void): () => void;
}

export function isCallFrame(
  frame: Frame,
): frame is Extract<
  Frame,
  {
    type:
      | 'call_invite'
      | 'call_accept'
      | 'call_reject'
      | 'call_hangup'
      | 'call_sdp'
      | 'call_ice';
  }
> {
  return (
    frame.type === 'call_invite' ||
    frame.type === 'call_accept' ||
    frame.type === 'call_reject' ||
    frame.type === 'call_hangup' ||
    frame.type === 'call_sdp' ||
    frame.type === 'call_ice'
  );
}
