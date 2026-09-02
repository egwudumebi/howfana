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
import { useSQLiteContext } from 'expo-sqlite';

import { RelayConfig } from '@/lib/constants';
import { verifyEvent, type MeshEvent } from '@/lib/crypto/events';
import { ingestEvent } from '@/lib/db/applyEvent';
import {
  createInjectEnvelope,
  nextEnvelope,
  RateLimiter,
  SeenSet,
  selectRelayTargets,
  type RelayEnvelope,
  type RelayLogEntry,
} from '@/lib/net/relay';
import type { Frame } from '@/lib/net/types';
import { useIdentity } from '@/providers/IdentityProvider';
import { usePeers } from '@/providers/PeerProvider';

type RelayState = {
  log: RelayLogEntry[];
  floodEvent: (event: MeshEvent) => Promise<void>;
  clearLog: () => void;
  /** Fired after a relayed event is newly ingested. */
  onRelayApplied: (handler: (event: MeshEvent) => void) => () => void;
};

const RelayContext = createContext<RelayState | null>(null);

function shorten(pk: string): string {
  if (pk.length <= 10) return pk;
  return `${pk.slice(0, 6)}…`;
}

export function RelayProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { publicKey } = useIdentity();
  const { connectedKeys, sendToPeer, setRelayFrameHandler } = usePeers();

  const seenRef = useRef(new SeenSet(RelayConfig.seenSetCapacity));
  const limiterRef = useRef(new RateLimiter(RelayConfig.rateLimitPerMinute));
  const connectedKeysRef = useRef(connectedKeys);
  const appliedHandlersRef = useRef(new Set<(event: MeshEvent) => void>());
  const [log, setLog] = useState<RelayLogEntry[]>([]);

  useEffect(() => {
    connectedKeysRef.current = connectedKeys;
  }, [connectedKeys]);

  const pushLog = useCallback((entry: Omit<RelayLogEntry, 'at'>) => {
    setLog((prev) => {
      const next = [{ ...entry, at: Date.now() }, ...prev];
      return next.slice(0, RelayConfig.logLimit);
    });
  }, []);

  const clearLog = useCallback(() => setLog([]), []);

  const onRelayApplied = useCallback((handler: (event: MeshEvent) => void) => {
    appliedHandlersRef.current.add(handler);
    return () => {
      appliedHandlersRef.current.delete(handler);
    };
  }, []);

  const forwardEnvelope = useCallback(
    async (envelope: RelayEnvelope, fromPublicKey: string | null) => {
      if (!publicKey) return;

      // Inject keeps path/ttl as created; forwarders decrement and append self.
      const toSend =
        fromPublicKey === null
          ? envelope
          : nextEnvelope(envelope, publicKey);

      if (!toSend) {
        pushLog({
          eventId: envelope.id,
          eventType: envelope.event.type,
          from: fromPublicKey ?? 'local',
          action: 'drop',
          detail: 'ttl exhausted or path loop',
          ttl: envelope.ttl,
        });
        return;
      }

      const targets = selectRelayTargets({
        localPublicKey: publicKey,
        fromPublicKey,
        connectedKeys: connectedKeysRef.current,
        path: toSend.path,
        ttl: toSend.ttl,
      });

      if (targets.length === 0) {
        pushLog({
          eventId: envelope.id,
          eventType: envelope.event.type,
          from: fromPublicKey ?? 'local',
          action: 'drop',
          detail: 'no eligible neighbors',
          ttl: toSend.ttl,
        });
        return;
      }

      const frame: Frame = { type: 'relay', envelope: toSend };
      for (const target of targets) {
        try {
          await sendToPeer(target, frame);
        } catch {
          // Peer may have disconnected mid-flood.
        }
      }

      pushLog({
        eventId: envelope.id,
        eventType: envelope.event.type,
        from: fromPublicKey ?? 'local',
        action: fromPublicKey ? 'forward' : 'inject',
        detail: `→ ${targets.map(shorten).join(', ')}`,
        ttl: toSend.ttl,
      });
    },
    [publicKey, sendToPeer, pushLog],
  );

  const floodEvent = useCallback(
    async (event: MeshEvent) => {
      if (!publicKey) return;
      if (seenRef.current.has(event.id)) return;
      seenRef.current.add(event.id);

      const envelope = createInjectEnvelope({
        event,
        localPublicKey: publicKey,
        ttl: RelayConfig.defaultTtl,
      });

      await forwardEnvelope(envelope, null);
    },
    [publicKey, forwardEnvelope],
  );

  const handleRelayFrame = useCallback(
    async (
      _connectionId: string,
      remotePublicKey: string,
      frame: Extract<Frame, { type: 'relay' }>,
    ) => {
      const envelope = frame.envelope;
      if (!envelope?.event || envelope.id !== envelope.event.id) {
        pushLog({
          eventId: envelope?.id ?? '?',
          eventType: envelope?.event?.type ?? 'unknown',
          from: remotePublicKey,
          action: 'drop',
          detail: 'malformed envelope',
          ttl: envelope?.ttl ?? 0,
        });
        return;
      }

      if (envelope.ttl <= 0) {
        pushLog({
          eventId: envelope.id,
          eventType: envelope.event.type,
          from: remotePublicKey,
          action: 'drop',
          detail: 'ttl exhausted',
          ttl: envelope.ttl,
        });
        return;
      }

      if (!limiterRef.current.allow()) {
        pushLog({
          eventId: envelope.id,
          eventType: envelope.event.type,
          from: remotePublicKey,
          action: 'drop',
          detail: 'rate limited',
          ttl: envelope.ttl,
        });
        return;
      }

      if (seenRef.current.has(envelope.id)) {
        pushLog({
          eventId: envelope.id,
          eventType: envelope.event.type,
          from: remotePublicKey,
          action: 'drop',
          detail: 'duplicate',
          ttl: envelope.ttl,
        });
        return;
      }

      const valid = await verifyEvent(envelope.event);
      if (!valid) {
        pushLog({
          eventId: envelope.id,
          eventType: envelope.event.type,
          from: remotePublicKey,
          action: 'drop',
          detail: 'bad signature',
          ttl: envelope.ttl,
        });
        return;
      }

      seenRef.current.add(envelope.id);

      try {
        const isNew = await ingestEvent(db, envelope.event);
        pushLog({
          eventId: envelope.id,
          eventType: envelope.event.type,
          from: remotePublicKey,
          action: 'accept',
          detail: isNew ? 'ingested' : 'already had event',
          ttl: envelope.ttl,
        });
        if (isNew) {
          for (const handler of appliedHandlersRef.current) {
            handler(envelope.event);
          }
        }
      } catch (err) {
        pushLog({
          eventId: envelope.id,
          eventType: envelope.event.type,
          from: remotePublicKey,
          action: 'drop',
          detail: err instanceof Error ? err.message : 'ingest failed',
          ttl: envelope.ttl,
        });
        return;
      }

      await forwardEnvelope(envelope, remotePublicKey);
    },
    [db, forwardEnvelope, pushLog],
  );

  useEffect(() => {
    setRelayFrameHandler(handleRelayFrame);
    return () => setRelayFrameHandler(null);
  }, [handleRelayFrame, setRelayFrameHandler]);

  const value = useMemo(
    () => ({
      log,
      floodEvent,
      clearLog,
      onRelayApplied,
    }),
    [log, floodEvent, clearLog, onRelayApplied],
  );

  return (
    <RelayContext.Provider value={value}>{children}</RelayContext.Provider>
  );
}

export function useRelay(): RelayState {
  const ctx = useContext(RelayContext);
  if (!ctx) {
    throw new Error('useRelay must be used within RelayProvider');
  }
  return ctx;
}
