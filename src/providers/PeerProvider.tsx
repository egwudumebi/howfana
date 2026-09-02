import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { useSQLiteContext } from 'expo-sqlite';

import {
  INVISIBLE_MODE_KEY,
  NEARBY_DISCOVERY_KEY,
  NetConfig,
} from '@/lib/constants';
import { appendEvent, DuplicateEventError } from '@/lib/db/events';
import { upsertRemotePeer } from '@/lib/db/profiles';
import { loadOrCreateIdentity } from '@/lib/identity/store';
import {
  BleDiscovery,
  isBleDiscoveryAvailable,
} from '@/lib/net/bleDiscovery';
import { LanTransport, isLanTransportAvailable } from '@/lib/net/lanTransport';
import {
  removeDiscoveredPeer,
  upsertDiscoveredPeer,
} from '@/lib/net/mergePeers';
import { requestNearbyPermissions } from '@/lib/net/permissions';
import { createHelloEvent, verifyHelloEvent } from '@/lib/net/protocol';
import type {
  DiscoveredPeer,
  Frame,
  PeerSession,
  SessionStatus,
} from '@/lib/net/types';
import { isCallFrame } from '@/lib/net/types';
import { useIdentity } from '@/providers/IdentityProvider';

export type SyncFrameHandler = (
  connectionId: string,
  remotePublicKey: string,
  frame: Extract<Frame, { type: 'sync_offer' | 'sync_want' | 'sync_batch' }>,
) => Promise<void>;

export type MediaFrameHandler = (
  connectionId: string,
  remotePublicKey: string,
  frame: Extract<Frame, { type: 'media_offer' | 'media_want' | 'media_chunk' }>,
) => Promise<void>;

export type RelayFrameHandler = (
  connectionId: string,
  remotePublicKey: string,
  frame: Extract<Frame, { type: 'relay' }>,
) => Promise<void>;

export type CallFrameHandler = (
  connectionId: string,
  remotePublicKey: string,
  frame: Extract<
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
  >,
) => Promise<void>;

export type PeerReadyHandler = (
  connectionId: string,
  remotePublicKey: string,
) => void;

type PeerState = {
  discovering: boolean;
  available: boolean;
  bleAvailable: boolean;
  transportError: string | null;
  peers: DiscoveredPeer[];
  /** Peers currently visible on LAN/BLE, newest first */
  nearbyPeers: DiscoveredPeer[];
  nearbyCount: number;
  sessions: PeerSession[];
  connectedKeys: string[];
  nearbyDiscoveryEnabled: boolean;
  invisibleMode: boolean;
  /** True when we are announcing on the LAN/BLE (discoverable). */
  isVisibleNearby: boolean;
  setNearbyDiscoveryEnabled: (enabled: boolean) => Promise<void>;
  setInvisibleMode: (enabled: boolean) => Promise<void>;
  startDiscovery: () => Promise<void>;
  stopDiscovery: () => Promise<void>;
  connectPeer: (publicKey: string) => Promise<void>;
  connectManual: (host: string, port?: number) => Promise<void>;
  disconnectPeer: (publicKey: string) => Promise<void>;
  sendFrame: (connectionId: string, frame: Frame) => Promise<void>;
  sendToPeer: (publicKey: string, frame: Frame) => Promise<void>;
  broadcastFrame: (frame: Frame) => Promise<void>;
  /** Broadcast to all connected peers except an optional excluded public key. */
  broadcastFrameExcept: (
    frame: Frame,
    exceptPublicKey: string | null,
  ) => Promise<void>;
  setSyncFrameHandler: (handler: SyncFrameHandler | null) => void;
  setMediaFrameHandler: (handler: MediaFrameHandler | null) => void;
  setRelayFrameHandler: (handler: RelayFrameHandler | null) => void;
  setCallFrameHandler: (handler: CallFrameHandler | null) => void;
  /** Register a peer-ready listener; returns unsubscribe. */
  onPeerReady: (handler: PeerReadyHandler) => () => void;
};

const PeerContext = createContext<PeerState | null>(null);

type ConnMeta = {
  connectionId: string;
  publicKey: string | null;
  host: string;
  port: number;
  outbound: boolean;
};

function hostPortKey(host: string, port: number): string {
  return `${host}:${port}`;
}

function shortenError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isSyncFrame(
  frame: Frame,
): frame is Extract<Frame, { type: 'sync_offer' | 'sync_want' | 'sync_batch' }> {
  return (
    frame.type === 'sync_offer' ||
    frame.type === 'sync_want' ||
    frame.type === 'sync_batch'
  );
}

function isMediaFrame(
  frame: Frame,
): frame is Extract<Frame, { type: 'media_offer' | 'media_want' | 'media_chunk' }> {
  return (
    frame.type === 'media_offer' ||
    frame.type === 'media_want' ||
    frame.type === 'media_chunk'
  );
}

function isRelayFrame(
  frame: Frame,
): frame is Extract<Frame, { type: 'relay' }> {
  return frame.type === 'relay';
}

export function PeerProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { ready, publicKey, profile } = useIdentity();
  const transportRef = useRef(new LanTransport());
  const bleRef = useRef(new BleDiscovery());
  const connsRef = useRef(new Map<string, ConnMeta>());
  const pkToConnRef = useRef(new Map<string, string>());
  const pendingOutboundRef = useRef(new Map<string, string>());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncHandlerRef = useRef<SyncFrameHandler | null>(null);
  const mediaHandlerRef = useRef<MediaFrameHandler | null>(null);
  const relayHandlerRef = useRef<RelayFrameHandler | null>(null);
  const callHandlerRef = useRef<CallFrameHandler | null>(null);
  const peerReadyHandlersRef = useRef(new Set<PeerReadyHandler>());

  const [discovering, setDiscovering] = useState(false);
  const [transportError, setTransportError] = useState<string | null>(null);
  const [peers, setPeers] = useState<DiscoveredPeer[]>([]);
  const [sessions, setSessions] = useState<PeerSession[]>([]);
  const [nearbyDiscoveryEnabled, setNearbyDiscoveryEnabledState] =
    useState(true);
  const [invisibleMode, setInvisibleModeState] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);

  const available = isLanTransportAvailable() || isBleDiscoveryAvailable();
  const bleAvailable = isBleDiscoveryAvailable();

  const nearbyPeers = useMemo(
    () => [...peers].sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    [peers],
  );
  const nearbyCount = nearbyPeers.length;
  const isVisibleNearby = discovering && nearbyDiscoveryEnabled && !invisibleMode;

  const connectedKeys = useMemo(
    () =>
      sessions
        .filter((s) => s.status === 'connected' && !s.publicKey.startsWith('manual:'))
        .map((s) => s.publicKey),
    [sessions],
  );

  const applyAnnouncePolicy = useCallback(() => {
    const shouldAnnounce = nearbyDiscoveryEnabled && !invisibleMode;
    transportRef.current.setAnnouncing(shouldAnnounce);
    bleRef.current.setAnnouncing(shouldAnnounce);
  }, [nearbyDiscoveryEnabled, invisibleMode]);

  const upsertSession = useCallback((next: PeerSession) => {
    setSessions((prev) => {
      const others = prev.filter((s) => s.publicKey !== next.publicKey);
      return [...others, next];
    });
  }, []);

  const patchSession = useCallback(
    (publicKeyValue: string, patch: Partial<PeerSession>) => {
      setSessions((prev) => {
        const existing = prev.find((s) => s.publicKey === publicKeyValue);
        if (!existing) {
          return prev;
        }
        return prev.map((s) =>
          s.publicKey === publicKeyValue ? { ...s, ...patch } : s,
        );
      });
    },
    [],
  );

  const sendFrame = useCallback(async (connectionId: string, frame: Frame) => {
    await transportRef.current.send(connectionId, frame);
  }, []);

  const sendToPeer = useCallback(
    async (peerPublicKey: string, frame: Frame) => {
      const connectionId = pkToConnRef.current.get(peerPublicKey);
      if (!connectionId) {
        throw new Error('Peer not connected');
      }
      await transportRef.current.send(connectionId, frame);
    },
    [],
  );

  const broadcastFrame = useCallback(async (frame: Frame) => {
    const sends: Promise<void>[] = [];
    for (const [connectionId, meta] of connsRef.current) {
      if (!meta.publicKey || meta.publicKey.startsWith('manual:')) continue;
      sends.push(transportRef.current.send(connectionId, frame));
    }
    await Promise.allSettled(sends);
  }, []);

  const broadcastFrameExcept = useCallback(
    async (frame: Frame, exceptPublicKey: string | null) => {
      const sends: Promise<void>[] = [];
      for (const [connectionId, meta] of connsRef.current) {
        if (!meta.publicKey || meta.publicKey.startsWith('manual:')) continue;
        if (exceptPublicKey && meta.publicKey === exceptPublicKey) continue;
        sends.push(transportRef.current.send(connectionId, frame));
      }
      await Promise.allSettled(sends);
    },
    [],
  );

  const setSyncFrameHandler = useCallback((handler: SyncFrameHandler | null) => {
    syncHandlerRef.current = handler;
  }, []);

  const setMediaFrameHandler = useCallback((handler: MediaFrameHandler | null) => {
    mediaHandlerRef.current = handler;
  }, []);

  const setRelayFrameHandler = useCallback((handler: RelayFrameHandler | null) => {
    relayHandlerRef.current = handler;
  }, []);

  const setCallFrameHandler = useCallback((handler: CallFrameHandler | null) => {
    callHandlerRef.current = handler;
  }, []);

  const onPeerReady = useCallback((handler: PeerReadyHandler) => {
    peerReadyHandlersRef.current.add(handler);
    return () => {
      peerReadyHandlersRef.current.delete(handler);
    };
  }, []);

  const sendHello = useCallback(
    async (connectionId: string, asAck: boolean) => {
      if (!profile) {
        throw new Error('Identity not ready');
      }
      const identity = await loadOrCreateIdentity();
      const event = await createHelloEvent(identity.publicKey, identity.secretKey, {
        displayName: profile.displayName || 'Howfana user',
        avatarUri: profile.avatarUri,
      });
      const frame: Frame = asAck
        ? { type: 'hello_ack', event }
        : { type: 'hello', event };
      await transportRef.current.send(connectionId, frame);
    },
    [profile],
  );

  const markAuthenticated = useCallback(
    (
      connectionId: string,
      remotePk: string,
      displayName: string,
      host: string,
      port: number,
    ) => {
      const meta = connsRef.current.get(connectionId);
      if (meta) {
        if (meta.publicKey?.startsWith('manual:')) {
          setSessions((prev) => prev.filter((s) => s.publicKey !== meta.publicKey));
          pkToConnRef.current.delete(meta.publicKey);
        }
        meta.publicKey = remotePk;
        meta.host = host || meta.host;
        meta.port = port || meta.port;
        connsRef.current.set(connectionId, meta);
        pkToConnRef.current.set(remotePk, connectionId);
      }

      upsertSession({
        publicKey: remotePk,
        displayName,
        host: host || meta?.host || '',
        port: port || meta?.port || NetConfig.tcpPort,
        status: 'connected',
        lastHeartbeatAt: Date.now(),
        error: null,
      });

      peerReadyHandlersRef.current.forEach((handler) => {
        handler(connectionId, remotePk);
      });
    },
    [upsertSession],
  );

  const onFrame = useCallback(
    async (connectionId: string, frame: Frame) => {
      if (frame.type === 'hello' || frame.type === 'hello_ack') {
        const payload = await verifyHelloEvent(frame.event);
        if (!payload) {
          setTransportError('Rejected peer hello: invalid signature');
          await transportRef.current.disconnect(connectionId);
          return;
        }

        const remotePk = frame.event.author.toLowerCase();
        if (publicKey && remotePk === publicKey.toLowerCase()) {
          await transportRef.current.disconnect(connectionId);
          return;
        }

        try {
          await appendEvent(db, frame.event);
        } catch (err) {
          if (!(err instanceof DuplicateEventError)) {
            console.warn('hello event append', err);
          }
        }

        await upsertRemotePeer(db, remotePk, {
          displayName: payload.displayName,
          avatarUri: payload.avatarUri,
        });

        const meta = connsRef.current.get(connectionId);
        markAuthenticated(
          connectionId,
          remotePk,
          payload.displayName,
          meta?.host ?? '',
          meta?.port ?? NetConfig.tcpPort,
        );

        if (frame.type === 'hello') {
          await sendHello(connectionId, true);
        }
        return;
      }

      if (frame.type === 'ping') {
        await transportRef.current.send(connectionId, {
          type: 'pong',
          ts: frame.ts,
        });
        return;
      }

      if (frame.type === 'pong') {
        const meta = connsRef.current.get(connectionId);
        if (meta?.publicKey) {
          patchSession(meta.publicKey, {
            lastHeartbeatAt: Date.now(),
            status: 'connected',
          });
        }
        return;
      }

      if (isSyncFrame(frame)) {
        const meta = connsRef.current.get(connectionId);
        if (!meta?.publicKey || meta.publicKey.startsWith('manual:')) {
          return;
        }
        await syncHandlerRef.current?.(connectionId, meta.publicKey, frame);
        return;
      }

      if (isMediaFrame(frame)) {
        const meta = connsRef.current.get(connectionId);
        if (!meta?.publicKey || meta.publicKey.startsWith('manual:')) {
          return;
        }
        await mediaHandlerRef.current?.(connectionId, meta.publicKey, frame);
        return;
      }

      if (isRelayFrame(frame)) {
        const meta = connsRef.current.get(connectionId);
        if (!meta?.publicKey || meta.publicKey.startsWith('manual:')) {
          return;
        }
        await relayHandlerRef.current?.(connectionId, meta.publicKey, frame);
        return;
      }

      if (isCallFrame(frame)) {
        const meta = connsRef.current.get(connectionId);
        if (!meta?.publicKey || meta.publicKey.startsWith('manual:')) {
          return;
        }
        await callHandlerRef.current?.(connectionId, meta.publicKey, frame);
      }
    },
    [db, publicKey, sendHello, markAuthenticated, patchSession],
  );

  useEffect(() => {
    const transport = transportRef.current;
    return transport.subscribe((event) => {
      switch (event.kind) {
        case 'peer':
          setPeers((prev) => upsertDiscoveredPeer(prev, event.peer));
          break;
        case 'peerLost':
          setPeers((prev) => removeDiscoveredPeer(prev, event.publicKey));
          break;
        case 'incoming':
          connsRef.current.set(event.connectionId, {
            connectionId: event.connectionId,
            publicKey: null,
            host: '',
            port: NetConfig.tcpPort,
            outbound: false,
          });
          break;
        case 'connected': {
          const pendingKey = pendingOutboundRef.current.get(
            hostPortKey(event.host, event.port),
          );
          pendingOutboundRef.current.delete(hostPortKey(event.host, event.port));
          connsRef.current.set(event.connectionId, {
            connectionId: event.connectionId,
            publicKey: pendingKey ?? null,
            host: event.host,
            port: event.port,
            outbound: true,
          });
          if (pendingKey) {
            pkToConnRef.current.set(pendingKey, event.connectionId);
            patchSession(pendingKey, { status: 'handshaking' });
          }
          void sendHello(event.connectionId, false).catch((err) => {
            setTransportError(shortenError(err));
          });
          break;
        }
        case 'disconnected': {
          const meta = connsRef.current.get(event.connectionId);
          connsRef.current.delete(event.connectionId);
          if (meta?.publicKey) {
            pkToConnRef.current.delete(meta.publicKey);
            patchSession(meta.publicKey, {
              status: 'disconnected',
              error: event.reason ?? 'disconnected',
            });
          }
          break;
        }
        case 'frame':
          void onFrame(event.connectionId, event.frame);
          break;
        case 'error':
          setTransportError(event.error.message);
          break;
      }
    });
  }, [onFrame, sendHello, patchSession]);

  useEffect(() => {
    if (!discovering) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }

    heartbeatRef.current = setInterval(() => {
      const now = Date.now();
      for (const [connectionId, meta] of connsRef.current) {
        if (!meta.publicKey || meta.publicKey.startsWith('manual:')) continue;
        void transportRef.current
          .send(connectionId, { type: 'ping', ts: now })
          .catch(() => undefined);

        setSessions((prev) =>
          prev.map((s) => {
            if (s.publicKey !== meta.publicKey || s.status !== 'connected') {
              return s;
            }
            if (
              s.lastHeartbeatAt &&
              now - s.lastHeartbeatAt > NetConfig.heartbeatTimeoutMs
            ) {
              void transportRef.current.disconnect(connectionId);
              return {
                ...s,
                status: 'disconnected' as SessionStatus,
                error: 'heartbeat timeout',
              };
            }
            return s;
          }),
        );
      }
    }, NetConfig.heartbeatIntervalMs);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [discovering]);

  const startDiscovery = useCallback(async () => {
    if (!ready || !publicKey || !profile) {
      throw new Error('Identity not ready');
    }
    setTransportError(null);
    const local = {
      publicKey,
      displayName: profile.displayName || 'Howfana user',
    };
    const shouldAnnounce = nearbyDiscoveryEnabled && !invisibleMode;
    const errors: string[] = [];

    if (isBleDiscoveryAvailable()) {
      const nearby = await requestNearbyPermissions();
      if (!nearby.ok && nearby.message) {
        errors.push(nearby.message);
      }
    }

    if (isLanTransportAvailable()) {
      try {
        await transportRef.current.start(local);
        transportRef.current.setAnnouncing(shouldAnnounce);
      } catch (err) {
        errors.push(shortenError(err));
      }
    }

    if (isBleDiscoveryAvailable()) {
      try {
        await bleRef.current.start(local);
        bleRef.current.setAnnouncing(shouldAnnounce);
      } catch (err) {
        errors.push(`Bluetooth: ${shortenError(err)}`);
      }
    }

    if (!isLanTransportAvailable() && !isBleDiscoveryAvailable()) {
      setDiscovering(false);
      throw new Error(
        'Nearby discovery needs a native build (Wi‑Fi and/or Bluetooth modules).',
      );
    }

    if (errors.length > 0) {
      setTransportError(errors.join(' · '));
    }
    setDiscovering(true);
  }, [ready, publicKey, profile, nearbyDiscoveryEnabled, invisibleMode]);

  const stopDiscovery = useCallback(async () => {
    await Promise.allSettled([
      transportRef.current.stop(),
      bleRef.current.stop(),
    ]);
    setDiscovering(false);
    setPeers([]);
    connsRef.current.clear();
    pkToConnRef.current.clear();
    pendingOutboundRef.current.clear();
    setSessions((prev) =>
      prev.map((s) => ({ ...s, status: 'disconnected' as SessionStatus })),
    );
  }, []);

  useEffect(() => {
    return bleRef.current.subscribe((event) => {
      if (event.kind === 'peer') {
        setPeers((prev) => upsertDiscoveredPeer(prev, event.peer));
      } else if (event.kind === 'peerLost') {
        setPeers((prev) => removeDiscoveredPeer(prev, event.publicKey));
      } else if (event.kind === 'error') {
        setTransportError(event.error.message);
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [disc, invis] = await Promise.all([
          SecureStore.getItemAsync(NEARBY_DISCOVERY_KEY),
          SecureStore.getItemAsync(INVISIBLE_MODE_KEY),
        ]);
        if (cancelled) return;
        if (disc === '0') setNearbyDiscoveryEnabledState(false);
        if (invis === '1') setInvisibleModeState(true);
      } catch {
        // defaults
      } finally {
        if (!cancelled) setPrefsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Auto-start LAN when discovery enabled; stop when disabled. */
  useEffect(() => {
    if (!prefsReady || !ready || !publicKey || !profile || !available) return;

    if (!nearbyDiscoveryEnabled) {
      if (discovering) {
        void stopDiscovery().catch(() => undefined);
      }
      return;
    }

    if (!discovering) {
      void startDiscovery().catch(() => undefined);
    } else {
      applyAnnouncePolicy();
    }
  }, [
    prefsReady,
    ready,
    publicKey,
    profile,
    available,
    nearbyDiscoveryEnabled,
    discovering,
    startDiscovery,
    stopDiscovery,
    applyAnnouncePolicy,
  ]);

  useEffect(() => {
    if (discovering) applyAnnouncePolicy();
  }, [invisibleMode, discovering, applyAnnouncePolicy]);

  const setNearbyDiscoveryEnabled = useCallback(
    async (enabled: boolean) => {
      setNearbyDiscoveryEnabledState(enabled);
      try {
        await SecureStore.setItemAsync(NEARBY_DISCOVERY_KEY, enabled ? '1' : '0');
      } catch {
        // ignore persist errors
      }
      if (!enabled) {
        await stopDiscovery().catch(() => undefined);
      } else if (ready && publicKey && profile && available) {
        await startDiscovery().catch(() => undefined);
      }
    },
    [stopDiscovery, startDiscovery, ready, publicKey, profile, available],
  );

  const setInvisibleMode = useCallback(async (enabled: boolean) => {
    setInvisibleModeState(enabled);
    try {
      await SecureStore.setItemAsync(INVISIBLE_MODE_KEY, enabled ? '1' : '0');
    } catch {
      // ignore
    }
    transportRef.current.setAnnouncing(
      nearbyDiscoveryEnabled && !enabled && discovering,
    );
  }, [nearbyDiscoveryEnabled, discovering]);

  const connectPeer = useCallback(
    async (peerPublicKey: string) => {
      const peer = peers.find((p) => p.publicKey === peerPublicKey);
      if (!peer) {
        throw new Error('Peer not in discovery list');
      }
      if (!peer.host) {
        throw new Error(
          'This peer was seen over Bluetooth only. Join the same Wi‑Fi to connect and call.',
        );
      }
      upsertSession({
        publicKey: peerPublicKey,
        displayName: peer.displayName,
        host: peer.host,
        port: peer.port,
        status: 'connecting',
        lastHeartbeatAt: null,
        error: null,
      });
      pendingOutboundRef.current.set(hostPortKey(peer.host, peer.port), peerPublicKey);
      try {
        await transportRef.current.connect(peer);
      } catch (err) {
        pendingOutboundRef.current.delete(hostPortKey(peer.host, peer.port));
        patchSession(peerPublicKey, {
          status: 'disconnected',
          error: shortenError(err),
        });
        throw err;
      }
    },
    [peers, upsertSession, patchSession],
  );

  const connectManual = useCallback(
    async (host: string, port: number = NetConfig.tcpPort) => {
      const trimmed = host.trim();
      const tempKey = `manual:${trimmed}:${port}`;
      upsertSession({
        publicKey: tempKey,
        displayName: `${trimmed}:${port}`,
        host: trimmed,
        port,
        status: 'connecting',
        lastHeartbeatAt: null,
        error: null,
      });
      pendingOutboundRef.current.set(hostPortKey(trimmed, port), tempKey);
      try {
        await transportRef.current.connect({
          publicKey: tempKey,
          displayName: tempKey,
          host: trimmed,
          port,
          lastSeenAt: Date.now(),
        });
      } catch (err) {
        pendingOutboundRef.current.delete(hostPortKey(trimmed, port));
        patchSession(tempKey, {
          status: 'disconnected',
          error: shortenError(err),
        });
        throw err;
      }
    },
    [upsertSession, patchSession],
  );

  const disconnectPeer = useCallback(
    async (peerPublicKey: string) => {
      const connectionId = pkToConnRef.current.get(peerPublicKey);
      if (connectionId) {
        await transportRef.current.disconnect(connectionId);
      }
      patchSession(peerPublicKey, { status: 'disconnected' });
    },
    [patchSession],
  );

  const value = useMemo(
    () => ({
      discovering,
      available,
      bleAvailable,
      transportError,
      peers,
      nearbyPeers,
      nearbyCount,
      sessions,
      connectedKeys,
      nearbyDiscoveryEnabled,
      invisibleMode,
      isVisibleNearby,
      setNearbyDiscoveryEnabled,
      setInvisibleMode,
      startDiscovery,
      stopDiscovery,
      connectPeer,
      connectManual,
      disconnectPeer,
      sendFrame,
      sendToPeer,
      broadcastFrame,
      broadcastFrameExcept,
      setSyncFrameHandler,
      setMediaFrameHandler,
      setRelayFrameHandler,
      setCallFrameHandler,
      onPeerReady,
    }),
    [
      discovering,
      available,
      bleAvailable,
      transportError,
      peers,
      nearbyPeers,
      nearbyCount,
      sessions,
      connectedKeys,
      nearbyDiscoveryEnabled,
      invisibleMode,
      isVisibleNearby,
      setNearbyDiscoveryEnabled,
      setInvisibleMode,
      startDiscovery,
      stopDiscovery,
      connectPeer,
      connectManual,
      disconnectPeer,
      sendFrame,
      sendToPeer,
      broadcastFrame,
      broadcastFrameExcept,
      setSyncFrameHandler,
      setMediaFrameHandler,
      setRelayFrameHandler,
      setCallFrameHandler,
      onPeerReady,
    ],
  );

  return <PeerContext.Provider value={value}>{children}</PeerContext.Provider>;
}

export function usePeers(): PeerState {
  const ctx = useContext(PeerContext);
  if (!ctx) {
    throw new Error('usePeers must be used within PeerProvider');
  }
  return ctx;
}
