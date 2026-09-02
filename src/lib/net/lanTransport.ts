import { Platform } from 'react-native';
import * as Network from 'expo-network';

import { NetConfig } from '@/lib/constants';
import {
  chunkToUint8Array,
  encodeFrame,
  FrameDecoder,
} from '@/lib/net/framing';
import { buildAnnounce, parseAnnounce } from '@/lib/net/protocol';
import type {
  DiscoveredPeer,
  Frame,
  LocalPeerInfo,
  MeshTransport,
  TransportEvent,
} from '@/lib/net/types';

type TcpSocketLike = {
  remoteAddress?: string;
  remotePort?: number;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  write: (data: string | Uint8Array) => void;
  destroy: () => void;
};

type TcpServerLike = {
  listen: (
    opts: { port: number; host: string; reuseAddress?: boolean },
    cb?: () => void,
  ) => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  close: () => void;
};

type UdpSocketLike = {
  bind: (port: number) => void;
  setBroadcast: (enabled: boolean) => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  send: (
    data: string,
    offset: number,
    length: number,
    port: number,
    address: string,
    cb?: (err?: Error) => void,
  ) => void;
  close: () => void;
};

function loadNative(): {
  TcpSocket: {
    createServer: (cb: (socket: TcpSocketLike) => void) => TcpServerLike;
    createConnection: (
      opts: { port: number; host: string },
      cb?: () => void,
    ) => TcpSocketLike;
  };
  UdpSocket: {
    createSocket: (opts: {
      type: string;
      reusePort?: boolean;
      debug?: boolean;
    }) => UdpSocketLike;
  };
} | null {
  if (Platform.OS === 'web') {
    return null;
  }
  try {
    // Native modules — unavailable in Expo Go / web.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TcpSocket = require('react-native-tcp-socket');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const UdpSocket = require('react-native-udp');
    return { TcpSocket, UdpSocket };
  } catch {
    return null;
  }
}

let connectionSeq = 0;
function nextConnectionId(): string {
  connectionSeq += 1;
  return `c${connectionSeq}-${Date.now()}`;
}

export function isLanTransportAvailable(): boolean {
  if (Platform.OS === 'web') {
    return false;
  }
  const native = loadNative();
  if (!native) {
    return false;
  }
  // Expo Go ships JS stubs but not these native modules.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NativeModules } = require('react-native') as {
    NativeModules: Record<string, unknown>;
  };
  return Boolean(NativeModules.TcpSockets && NativeModules.UdpSockets);
}

/**
 * LAN transport: UDP announce + TCP sessions.
 * Requires a development build (not Expo Go).
 */
export class LanTransport implements MeshTransport {
  readonly name = 'lan';
  readonly available = isLanTransportAvailable();

  private handlers = new Set<(event: TransportEvent) => void>();
  private local: LocalPeerInfo | null = null;
  private udp: UdpSocketLike | null = null;
  private server: TcpServerLike | null = null;
  private announceTimer: ReturnType<typeof setInterval> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private peers = new Map<string, DiscoveredPeer>();
  private sockets = new Map<
    string,
    { socket: TcpSocketLike; decoder: FrameDecoder; host: string; port: number }
  >();
  private localIp: string | null = null;
  /** When false, listen/browse but do not UDP-announce (invisible / discovery off announce). */
  private announcing = true;

  subscribe(handler: (event: TransportEvent) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  private emit(event: TransportEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }

  async start(local: LocalPeerInfo): Promise<void> {
    if (!this.available) {
      throw new Error(
        'LAN transport requires a development build (UDP/TCP native modules). Run: npx expo run:android or npx expo run:ios',
      );
    }
    const native = loadNative();
    if (!native) {
      throw new Error('Native socket modules unavailable');
    }

    await this.stop();
    this.local = local;

    try {
      this.localIp = await Network.getIpAddressAsync();
    } catch {
      this.localIp = '0.0.0.0';
    }

    this.server = native.TcpSocket.createServer((socket) => {
      const host = socket.remoteAddress ?? '0.0.0.0';
      const port = socket.remotePort ?? NetConfig.tcpPort;
      this.attachSocket(socket, host, port, true);
    });

    await new Promise<void>((resolve, reject) => {
      const server = this.server!;
      let settled = false;
      server.on('error', (err: unknown) => {
        if (!settled) {
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
      try {
        server.listen(
          { port: NetConfig.tcpPort, host: '0.0.0.0', reuseAddress: true },
          () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          },
        );
      } catch (err) {
        if (!settled) {
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    });

    this.udp = native.UdpSocket.createSocket({ type: 'udp4', reusePort: true });
    await new Promise<void>((resolve, reject) => {
      const udp = this.udp!;
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      udp.on('listening', done);
      udp.on('error', (err: unknown) => {
        if (!settled) {
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
      udp.on('message', (msg: unknown, rinfo: unknown) => {
        this.onUdpMessage(msg, rinfo);
      });
      try {
        udp.bind(NetConfig.udpPort);
        setTimeout(done, 100);
      } catch (err) {
        if (!settled) {
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    });

    try {
      this.udp.setBroadcast(true);
    } catch {
      // Some platforms require broadcast after bind; ignore if unsupported.
    }

    this.announcing = true;
    this.announceTimer = setInterval(() => {
      if (this.announcing) void this.announce();
    }, NetConfig.announceIntervalMs);
    void this.announce();

    this.pruneTimer = setInterval(() => {
      this.prunePeers();
    }, NetConfig.announceIntervalMs);
  }

  /**
   * Toggle UDP announce without tearing down the transport.
   * Invisible Mode / privacy: listen for peers but stop appearing on the LAN.
   */
  setAnnouncing(enabled: boolean): void {
    this.announcing = enabled;
    if (enabled && this.udp && this.local) {
      void this.announce();
    }
  }

  isAnnouncing(): boolean {
    return this.announcing;
  }

  async stop(): Promise<void> {
    if (this.announceTimer) {
      clearInterval(this.announceTimer);
      this.announceTimer = null;
    }
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }

    for (const [id] of [...this.sockets.keys()]) {
      await this.disconnect(id);
    }

    if (this.udp) {
      try {
        this.udp.close();
      } catch {
        // ignore
      }
      this.udp = null;
    }

    if (this.server) {
      try {
        this.server.close();
      } catch {
        // ignore
      }
      this.server = null;
    }

    this.peers.clear();
    this.local = null;
  }

  async connect(peer: DiscoveredPeer): Promise<string> {
    const native = loadNative();
    if (!native) {
      throw new Error('Native socket modules unavailable');
    }

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const socket = native.TcpSocket.createConnection(
        { port: peer.port, host: peer.host },
        () => {
          if (settled) return;
          settled = true;
          const id = this.attachSocket(socket, peer.host, peer.port, false);
          resolve(id);
        },
      );
      socket.on('error', (err: unknown) => {
        if (settled) return;
        settled = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  async disconnect(connectionId: string): Promise<void> {
    const entry = this.sockets.get(connectionId);
    if (!entry) {
      return;
    }
    this.sockets.delete(connectionId);
    try {
      entry.socket.destroy();
    } catch {
      // ignore
    }
    this.emit({ kind: 'disconnected', connectionId });
  }

  async send(connectionId: string, frame: Frame): Promise<void> {
    const entry = this.sockets.get(connectionId);
    if (!entry) {
      throw new Error(`Unknown connection: ${connectionId}`);
    }
    entry.socket.write(encodeFrame(frame));
  }

  private attachSocket(
    socket: TcpSocketLike,
    host: string,
    port: number,
    incoming: boolean,
  ): string {
    const connectionId = nextConnectionId();
    const decoder = new FrameDecoder();
    this.sockets.set(connectionId, { socket, decoder, host, port });

    socket.on('data', (data: unknown) => {
      try {
        const frames = decoder.push(chunkToUint8Array(data));
        for (const frame of frames) {
          this.emit({ kind: 'frame', connectionId, frame });
        }
      } catch (err) {
        this.emit({
          kind: 'error',
          error: err instanceof Error ? err : new Error(String(err)),
        });
        void this.disconnect(connectionId);
      }
    });

    socket.on('error', (err: unknown) => {
      this.emit({
        kind: 'error',
        error: err instanceof Error ? err : new Error(String(err)),
      });
    });

    socket.on('close', () => {
      if (this.sockets.has(connectionId)) {
        this.sockets.delete(connectionId);
        this.emit({ kind: 'disconnected', connectionId, reason: 'closed' });
      }
    });

    if (incoming) {
      this.emit({ kind: 'incoming', connectionId });
    } else {
      this.emit({ kind: 'connected', connectionId, host, port });
    }

    return connectionId;
  }

  private onUdpMessage(msg: unknown, rinfo: unknown): void {
    const info = rinfo as { address?: string; port?: number };
    const host = info.address;
    if (!host) {
      return;
    }

    let text: string;
    if (typeof msg === 'string') {
      text = msg;
    } else if (msg instanceof Uint8Array) {
      text = new TextDecoder().decode(msg);
    } else if (msg && typeof msg === 'object' && 'toString' in msg) {
      text = String(msg);
    } else {
      return;
    }

    const packet = parseAnnounce(text);
    if (!packet || !this.local) {
      return;
    }
    if (packet.pk === this.local.publicKey) {
      return;
    }

    const peer: DiscoveredPeer = {
      sources: ['wifi'],
      rssi: null,
      blePrefix: null,
      publicKey: packet.pk,
      displayName: packet.name,
      host,
      port: packet.port,
      lastSeenAt: Date.now(),
    };
    this.peers.set(peer.publicKey, peer);
    this.emit({ kind: 'peer', peer });
  }

  private async announce(): Promise<void> {
    if (!this.udp || !this.local) {
      return;
    }
    const packet = buildAnnounce({
      publicKey: this.local.publicKey,
      displayName: this.local.displayName,
      port: NetConfig.tcpPort,
    });
    const payload = JSON.stringify(packet);
    const bytes = new TextEncoder().encode(payload);

    await new Promise<void>((resolve) => {
      this.udp!.send(
        payload,
        0,
        bytes.length,
        NetConfig.udpPort,
        '255.255.255.255',
        () => resolve(),
      );
      if (this.localIp && /^\d+\.\d+\.\d+\.\d+$/.test(this.localIp)) {
        const parts = this.localIp.split('.');
        const subnet = `${parts[0]}.${parts[1]}.${parts[2]}.255`;
        this.udp!.send(
          payload,
          0,
          bytes.length,
          NetConfig.udpPort,
          subnet,
          () => undefined,
        );
      }
    });
  }

  private prunePeers(): void {
    const now = Date.now();
    for (const [pk, peer] of this.peers) {
      if (now - peer.lastSeenAt > NetConfig.peerTtlMs) {
        this.peers.delete(pk);
        this.emit({ kind: 'peerLost', publicKey: pk });
      }
    }
  }
}
