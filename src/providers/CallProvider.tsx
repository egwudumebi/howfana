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
import { AppState, Vibration } from 'react-native';

import { randomCallId } from '@/lib/crypto/ids';
import { resolveCallGlare } from '@/lib/net/callGlare';
import {
  requestCallPermissions,
  setCallAudioRoute,
} from '@/lib/net/permissions';
import type { CallKind, Frame } from '@/lib/net/types';
import { useIdentity } from '@/providers/IdentityProvider';
import { usePeers } from '@/providers/PeerProvider';

export type CallPhase =
  | 'idle'
  | 'outgoing'
  | 'incoming'
  | 'connecting'
  | 'in_call'
  | 'ended';

export type CallSession = {
  callId: string;
  peerPublicKey: string;
  peerName: string;
  kind: CallKind;
  phase: CallPhase;
  muted: boolean;
  cameraOff: boolean;
  speakerOn: boolean;
  startedAt: number | null;
  error: string | null;
};

type WebRTCModule = typeof import('react-native-webrtc');
type MediaStreamLike = {
  getTracks: () => Array<{
    kind: string;
    enabled: boolean;
    stop: () => void;
    _switchCamera?: () => void;
  }>;
  toURL?: () => string;
};

type IceCandidateInit = {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
};

type CallState = {
  session: CallSession | null;
  localStream: unknown | null;
  remoteStream: unknown | null;
  webrtcAvailable: boolean;
  startCall: (
    peerPublicKey: string,
    peerName: string,
    kind: CallKind,
  ) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  hangup: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleSpeaker: () => Promise<void>;
  flipCamera: () => Promise<void>;
};

const CallContext = createContext<CallState | null>(null);
const RING_TIMEOUT_MS = 45_000;

function loadWebRTC(): WebRTCModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-webrtc') as WebRTCModule;
  } catch {
    return null;
  }
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { publicKey } = useIdentity();
  const { sendToPeer, setCallFrameHandler, connectedKeys, sessions } =
    usePeers();
  const webrtc = useMemo(() => loadWebRTC(), []);

  const [session, setSession] = useState<CallSession | null>(null);
  const [localStream, setLocalStream] = useState<unknown | null>(null);
  const [remoteStream, setRemoteStream] = useState<unknown | null>(null);

  const pcRef = useRef<InstanceType<WebRTCModule['RTCPeerConnection']> | null>(
    null,
  );
  const localStreamRef = useRef<MediaStreamLike | null>(null);
  const sessionRef = useRef<CallSession | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIceRef = useRef<IceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const clearRingTimer = () => {
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
  };

  const peerNameFor = useCallback(
    (pk: string, fallback: string) => {
      const s = sessions.find((x) => x.publicKey === pk);
      return s?.displayName || fallback;
    },
    [sessions],
  );

  const teardownMedia = useCallback(() => {
    clearRingTimer();
    pendingIceRef.current = [];
    remoteDescSetRef.current = false;
    try {
      localStreamRef.current?.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    try {
      pcRef.current?.close();
    } catch {
      // ignore
    }
    pcRef.current = null;
    void setCallAudioRoute(false).catch(() => undefined);
  }, []);

  const sendCall = useCallback(
    async (peerPublicKey: string, frame: Frame) => {
      await sendToPeer(peerPublicKey, frame);
    },
    [sendToPeer],
  );

  const flushPendingIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !remoteDescSetRef.current) return;
    const queued = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const c of queued) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        // ignore stale
      }
    }
  }, []);

  const setupPeerConnection = useCallback(
    (peerPublicKey: string, callId: string) => {
      if (!webrtc || !publicKey) {
        throw new Error('WebRTC unavailable');
      }
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {
          // ignore
        }
      }
      remoteDescSetRef.current = false;
      pendingIceRef.current = [];
      const pc = new webrtc.RTCPeerConnection({ iceServers: [] });
      pcRef.current = pc;

      pc.onicecandidate = (ev: {
        candidate?: {
          candidate: string;
          sdpMid: string | null;
          sdpMLineIndex: number | null;
        } | null;
      }) => {
        if (!ev.candidate) return;
        void sendCall(peerPublicKey, {
          type: 'call_ice',
          callId,
          from: publicKey,
          to: peerPublicKey,
          candidate: ev.candidate.candidate,
          sdpMid: ev.candidate.sdpMid,
          sdpMLineIndex: ev.candidate.sdpMLineIndex,
        });
      };

      pc.ontrack = (ev: { streams: unknown[] }) => {
        if (ev.streams[0]) setRemoteStream(ev.streams[0]);
      };

      pc.onconnectionstatechange = () => {
        const state = (pc as { connectionState?: string }).connectionState;
        if (state === 'failed' || state === 'closed') {
          const cur = sessionRef.current;
          if (cur && (cur.phase === 'in_call' || cur.phase === 'connecting')) {
            setSession((s) =>
              s
                ? {
                    ...s,
                    phase: 'ended',
                    error: 'Connection lost',
                  }
                : s,
            );
            teardownMedia();
          }
        }
      };

      return pc;
    },
    [webrtc, publicKey, sendCall, teardownMedia],
  );

  const captureLocal = useCallback(
    async (
      kind: CallKind,
      pc: InstanceType<WebRTCModule['RTCPeerConnection']>,
    ) => {
      if (!webrtc) throw new Error('WebRTC unavailable');
      await setCallAudioRoute(sessionRef.current?.speakerOn ?? true);
      const stream = (await webrtc.mediaDevices.getUserMedia({
        audio: true,
        video:
          kind === 'video'
            ? { width: 640, height: 480, frameRate: 24, facingMode: 'user' }
            : false,
      })) as unknown as MediaStreamLike;
      localStreamRef.current = stream;
      setLocalStream(stream);
      stream.getTracks().forEach((track) => {
        // @ts-expect-error RN WebRTC addTrack
        pc.addTrack(track, stream);
      });
    },
    [webrtc],
  );

  const hangup = useCallback(async () => {
    const current = sessionRef.current;
    teardownMedia();
    if (current && publicKey) {
      try {
        await sendCall(current.peerPublicKey, {
          type: 'call_hangup',
          callId: current.callId,
          from: publicKey,
          to: current.peerPublicKey,
        });
      } catch {
        // ignore
      }
    }
    setSession(null);
  }, [publicKey, sendCall, teardownMedia]);

  const rejectCall = useCallback(async () => {
    const current = sessionRef.current;
    clearRingTimer();
    if (current && publicKey) {
      try {
        await sendCall(current.peerPublicKey, {
          type: 'call_reject',
          callId: current.callId,
          from: publicKey,
          to: current.peerPublicKey,
          reason: 'declined',
        });
      } catch {
        // ignore
      }
    }
    teardownMedia();
    setSession(null);
  }, [publicKey, sendCall, teardownMedia]);

  const startCall = useCallback(
    async (peerPublicKey: string, peerName: string, kind: CallKind) => {
      if (!publicKey) throw new Error('Identity not ready');
      if (!connectedKeys.includes(peerPublicKey)) {
        throw new Error('Peer must be connected over Wi‑Fi to call');
      }
      if (sessionRef.current) throw new Error('Already in a call');
      if (!webrtc) throw new Error('Calls need a native rebuild with WebRTC');

      const perms = await requestCallPermissions(kind);
      if (!perms.ok) throw new Error(perms.message ?? 'Permission denied');

      const callId = randomCallId();
      const next: CallSession = {
        callId,
        peerPublicKey,
        peerName,
        kind,
        phase: 'outgoing',
        muted: false,
        cameraOff: false,
        speakerOn: true,
        startedAt: null,
        error: null,
      };
      setSession(next);
      sessionRef.current = next;
      await setCallAudioRoute(true);

      await sendCall(peerPublicKey, {
        type: 'call_invite',
        callId,
        from: publicKey,
        to: peerPublicKey,
        kind,
      });

      ringTimerRef.current = setTimeout(() => {
        void hangup();
      }, RING_TIMEOUT_MS);
    },
    [publicKey, connectedKeys, webrtc, sendCall, hangup],
  );

  const acceptCall = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || current.phase !== 'incoming' || !publicKey || !webrtc) {
      return;
    }
    clearRingTimer();

    const perms = await requestCallPermissions(current.kind);
    if (!perms.ok) {
      await rejectCall();
      return;
    }

    setSession({ ...current, phase: 'connecting' });

    try {
      await sendCall(current.peerPublicKey, {
        type: 'call_accept',
        callId: current.callId,
        from: publicKey,
        to: current.peerPublicKey,
      });

      const pc = setupPeerConnection(current.peerPublicKey, current.callId);
      await captureLocal(current.kind, pc);
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      await sendCall(current.peerPublicKey, {
        type: 'call_sdp',
        callId: current.callId,
        from: publicKey,
        to: current.peerPublicKey,
        sdpType: 'offer',
        sdp: offer.sdp ?? '',
      });
      setSession((s) =>
        s ? { ...s, phase: 'in_call', startedAt: Date.now() } : s,
      );
    } catch (err) {
      setSession((s) =>
        s
          ? {
              ...s,
              phase: 'ended',
              error: err instanceof Error ? err.message : 'Call failed',
            }
          : s,
      );
      teardownMedia();
    }
  }, [
    publicKey,
    webrtc,
    sendCall,
    setupPeerConnection,
    captureLocal,
    teardownMedia,
    rejectCall,
  ]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextMuted = !sessionRef.current?.muted;
    stream.getTracks().forEach((t) => {
      if (t.kind === 'audio') t.enabled = !nextMuted;
    });
    setSession((s) => (s ? { ...s, muted: Boolean(nextMuted) } : s));
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextOff = !sessionRef.current?.cameraOff;
    stream.getTracks().forEach((t) => {
      if (t.kind === 'video') t.enabled = !nextOff;
    });
    setSession((s) => (s ? { ...s, cameraOff: Boolean(nextOff) } : s));
  }, []);

  const toggleSpeaker = useCallback(async () => {
    const next = !(sessionRef.current?.speakerOn ?? true);
    await setCallAudioRoute(next);
    setSession((s) => (s ? { ...s, speakerOn: next } : s));
  }, []);

  const flipCamera = useCallback(async () => {
    const track = localStreamRef.current
      ?.getTracks()
      .find((t) => t.kind === 'video');
    try {
      track?._switchCamera?.();
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setCallFrameHandler(async (_connId, remotePk, frame) => {
      if (!publicKey) return;
      const current = sessionRef.current;

      if (frame.type === 'call_invite') {
        if (current?.phase === 'outgoing') {
          const decision = resolveCallGlare(current.callId, frame.callId);
          if (decision === 'keep-local') {
            await sendCall(remotePk, {
              type: 'call_reject',
              callId: frame.callId,
              from: publicKey,
              to: remotePk,
              reason: 'glare',
            });
            return;
          }
          // Adopt remote invite — drop our outgoing
          try {
            await sendCall(current.peerPublicKey, {
              type: 'call_reject',
              callId: current.callId,
              from: publicKey,
              to: current.peerPublicKey,
              reason: 'glare',
            });
          } catch {
            // ignore
          }
          teardownMedia();
        } else if (current) {
          await sendCall(remotePk, {
            type: 'call_reject',
            callId: frame.callId,
            from: publicKey,
            to: remotePk,
            reason: 'busy',
          });
          return;
        }

        try {
          Vibration.vibrate([0, 400, 200, 400]);
        } catch {
          // ignore
        }
        const incoming: CallSession = {
          callId: frame.callId,
          peerPublicKey: remotePk,
          peerName: peerNameFor(remotePk, remotePk.slice(0, 8)),
          kind: frame.kind,
          phase: 'incoming',
          muted: false,
          cameraOff: false,
          speakerOn: true,
          startedAt: null,
          error: null,
        };
        setSession(incoming);
        sessionRef.current = incoming;
        ringTimerRef.current = setTimeout(() => {
          void rejectCall();
        }, RING_TIMEOUT_MS);
        return;
      }

      if (!current || current.callId !== frame.callId) return;

      if (frame.type === 'call_reject' || frame.type === 'call_hangup') {
        teardownMedia();
        setSession(null);
        return;
      }

      if (frame.type === 'call_accept' && current.phase === 'outgoing') {
        clearRingTimer();
        setSession({ ...current, phase: 'connecting' });
        return;
      }

      if (frame.type === 'call_sdp' && webrtc) {
        try {
          if (!pcRef.current) {
            const pc = setupPeerConnection(
              current.peerPublicKey,
              current.callId,
            );
            await captureLocal(current.kind, pc);
          }
          const pc = pcRef.current!;
          await pc.setRemoteDescription({
            type: frame.sdpType,
            sdp: frame.sdp,
          });
          remoteDescSetRef.current = true;
          await flushPendingIce();
          if (frame.sdpType === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendCall(remotePk, {
              type: 'call_sdp',
              callId: frame.callId,
              from: publicKey,
              to: remotePk,
              sdpType: 'answer',
              sdp: answer.sdp ?? '',
            });
          }
          setSession((s) =>
            s
              ? {
                  ...s,
                  phase: 'in_call',
                  startedAt: s.startedAt ?? Date.now(),
                }
              : s,
          );
        } catch (err) {
          setSession((s) =>
            s
              ? {
                  ...s,
                  phase: 'ended',
                  error: err instanceof Error ? err.message : 'SDP failed',
                }
              : s,
          );
        }
        return;
      }

      if (frame.type === 'call_ice') {
        const candidate: IceCandidateInit = {
          candidate: frame.candidate,
          sdpMid: frame.sdpMid,
          sdpMLineIndex: frame.sdpMLineIndex,
        };
        if (!pcRef.current || !remoteDescSetRef.current) {
          pendingIceRef.current.push(candidate);
          return;
        }
        try {
          await pcRef.current.addIceCandidate(candidate);
        } catch {
          // ignore
        }
      }
    });
    return () => setCallFrameHandler(null);
  }, [
    publicKey,
    setCallFrameHandler,
    sendCall,
    rejectCall,
    teardownMedia,
    setupPeerConnection,
    captureLocal,
    webrtc,
    peerNameFor,
    flushPendingIce,
  ]);

  // Tear down media if app backgrounds during a ringing-only session
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        const cur = sessionRef.current;
        if (cur && (cur.phase === 'outgoing' || cur.phase === 'incoming')) {
          // keep ringing briefly in background; no teardown
          return;
        }
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => () => teardownMedia(), [teardownMedia]);

  const value = useMemo(
    () => ({
      session,
      localStream,
      remoteStream,
      webrtcAvailable: webrtc != null,
      startCall,
      acceptCall,
      rejectCall,
      hangup,
      toggleMute,
      toggleCamera,
      toggleSpeaker,
      flipCamera,
    }),
    [
      session,
      localStream,
      remoteStream,
      webrtc,
      startCall,
      acceptCall,
      rejectCall,
      hangup,
      toggleMute,
      toggleCamera,
      toggleSpeaker,
      flipCamera,
    ],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall(): CallState {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
