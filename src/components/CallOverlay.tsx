import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { SoftPressable } from '@/components/SoftPressable';
import { useCall } from '@/providers/CallProvider';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';
import { Radius, Space } from '@/theme/spacing';

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function RTCVideo({
  stream,
  style,
  mirror,
}: {
  stream: unknown;
  style: ViewStyle;
  mirror?: boolean;
}) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RTCView } = require('react-native-webrtc') as {
      RTCView: React.ComponentType<{
        streamURL: string;
        style: ViewStyle;
        objectFit?: string;
        mirror?: boolean;
      }>;
    };
    const url =
      stream && typeof (stream as { toURL?: () => string }).toURL === 'function'
        ? (stream as { toURL: () => string }).toURL()
        : '';
    if (!url) return <View style={style} />;
    return (
      <RTCView
        streamURL={url}
        style={style}
        objectFit="cover"
        mirror={mirror}
      />
    );
  } catch {
    return <View style={style} />;
  }
}

function ControlButton({
  icon,
  label,
  onPress,
  active,
  danger,
  success,
  size = 58,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  success?: boolean;
  size?: number;
}) {
  const bg = danger
    ? '#E53935'
    : success
      ? '#25D366'
      : active
        ? '#fff'
        : 'rgba(255,255,255,0.18)';
  const iconColor =
    danger || success ? '#fff' : active ? '#111B21' : '#fff';

  return (
    <SoftPressable style={stylesCtrl.wrap} onPress={onPress}>
      <View
        style={[
          stylesCtrl.btn,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: bg,
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={size > 60 ? 30 : 24}
          color={iconColor}
          style={danger ? stylesCtrl.hangIcon : undefined}
        />
      </View>
      <Text style={stylesCtrl.label}>{label}</Text>
    </SoftPressable>
  );
}

const stylesCtrl = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 8,
    minWidth: 72,
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hangIcon: {
    transform: [{ rotate: '135deg' }],
  },
  label: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '500',
  },
});

export function CallOverlay() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    session,
    localStream,
    remoteStream,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    flipCamera,
  } = useCall();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!session?.startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session?.startedAt]);

  if (!session) return null;

  const isVideo = session.kind === 'video';
  const inCall =
    session.phase === 'in_call' || session.phase === 'connecting';
  const showRemoteVideo =
    isVideo && !!remoteStream && session.phase === 'in_call';

  const statusText =
    session.phase === 'incoming'
      ? isVideo
        ? 'Incoming video call'
        : 'Incoming voice call'
      : session.phase === 'outgoing'
        ? 'Calling…'
        : session.phase === 'connecting'
          ? 'Connecting…'
          : session.startedAt
            ? formatDuration(now - session.startedAt)
            : 'Connected';

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => void hangup()}
    >
      <View style={styles.root}>
        {showRemoteVideo ? (
          <RTCVideo stream={remoteStream} style={styles.remoteVideo} />
        ) : (
          <View style={styles.audioBackdrop} />
        )}

        {/* Dim top/bottom for readability over video */}
        {showRemoteVideo ? <View style={styles.topScrim} pointerEvents="none" /> : null}
        {showRemoteVideo ? (
          <View style={styles.bottomScrim} pointerEvents="none" />
        ) : null}

        {isVideo && localStream && !session.cameraOff ? (
          <View
            style={[
              styles.localPip,
              { top: insets.top + 12 },
            ]}
          >
            <RTCVideo stream={localStream} style={styles.localVideo} mirror />
            <SoftPressable
              style={styles.flipFab}
              onPress={() => void flipCamera()}
            >
              <Ionicons name="camera-reverse" size={18} color="#fff" />
            </SoftPressable>
          </View>
        ) : null}

        {/* Header — WhatsApp: name + status at top */}
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + (showRemoteVideo ? 16 : 48) },
          ]}
        >
          <Text style={styles.name} numberOfLines={1}>
            {session.peerName}
          </Text>
          <Text style={styles.phase}>{statusText}</Text>
          {session.error ? (
            <Text style={styles.error}>{session.error}</Text>
          ) : null}
        </View>

        {/* Center avatar for voice / ringing video */}
        {!showRemoteVideo ? (
          <View style={styles.avatarStage}>
            <View style={styles.avatarRing}>
              <Avatar
                name={session.peerName}
                seed={session.peerPublicKey}
                size={148}
              />
            </View>
          </View>
        ) : (
          <View style={styles.avatarSpacer} />
        )}

        {/* Incoming: Decline / Accept */}
        {session.phase === 'incoming' ? (
          <View
            style={[
              styles.incomingBar,
              { paddingBottom: Math.max(insets.bottom, 28) },
            ]}
          >
            <ControlButton
              icon="call"
              label="Decline"
              danger
              size={68}
              onPress={() => void rejectCall()}
            />
            <ControlButton
              icon="call"
              label="Accept"
              success
              size={68}
              onPress={() => void acceptCall()}
            />
          </View>
        ) : null}

        {/* Outgoing: End only */}
        {session.phase === 'outgoing' ? (
          <View
            style={[
              styles.outgoingBar,
              { paddingBottom: Math.max(insets.bottom, 28) },
            ]}
          >
            <ControlButton
              icon="call"
              label="End"
              danger
              size={68}
              onPress={() => void hangup()}
            />
          </View>
        ) : null}

        {/* In-call controls — WhatsApp bottom tray */}
        {inCall ? (
          <View
            style={[
              styles.controlsTray,
              { paddingBottom: Math.max(insets.bottom, 20) },
            ]}
          >
            <View style={styles.controlsRow}>
              <ControlButton
                icon={session.speakerOn ? 'volume-high' : 'volume-medium'}
                label="Speaker"
                active={session.speakerOn}
                onPress={() => void toggleSpeaker()}
              />
              <ControlButton
                icon={session.muted ? 'mic-off' : 'mic'}
                label={session.muted ? 'Unmute' : 'Mute'}
                active={session.muted}
                onPress={toggleMute}
              />
              {isVideo ? (
                <ControlButton
                  icon={session.cameraOff ? 'videocam-off' : 'videocam'}
                  label="Camera"
                  active={!session.cameraOff}
                  onPress={toggleCamera}
                />
              ) : null}
              <ControlButton
                icon="call"
                label="End"
                danger
                size={62}
                onPress={() => void hangup()}
              />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: '#0B141A',
    },
    remoteVideo: {
      ...StyleSheet.absoluteFill,
    },
    audioBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: '#0B141A',
    },
    topScrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 160,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    bottomScrim: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 220,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    localPip: {
      position: 'absolute',
      right: 16,
      width: 108,
      height: 152,
      borderRadius: Radius.md,
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.35)',
      zIndex: 5,
      backgroundColor: '#1F2C34',
    },
    localVideo: {
      width: '100%',
      height: '100%',
    },
    flipFab: {
      position: 'absolute',
      bottom: 8,
      alignSelf: 'center',
      left: '50%',
      marginLeft: -16,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    header: {
      alignItems: 'center',
      paddingHorizontal: Space.xl,
      zIndex: 2,
      gap: 6,
    },
    name: {
      color: '#E9EDEF',
      fontSize: 28,
      fontWeight: '400',
      letterSpacing: 0.2,
      textAlign: 'center',
    },
    phase: {
      color: 'rgba(233,237,239,0.7)',
      fontSize: 15,
      fontWeight: '400',
    },
    error: {
      color: colors.danger,
      marginTop: 8,
      textAlign: 'center',
      fontSize: 13,
    },
    avatarStage: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
      marginBottom: 24,
    },
    avatarSpacer: {
      flex: 1,
    },
    avatarRing: {
      padding: 4,
      borderRadius: 80,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.12)',
    },
    incomingBar: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'flex-end',
      paddingHorizontal: 36,
      paddingTop: 16,
      zIndex: 3,
    },
    outgoingBar: {
      alignItems: 'center',
      paddingTop: 16,
      zIndex: 3,
    },
    controlsTray: {
      zIndex: 3,
      paddingTop: 12,
      paddingHorizontal: 12,
    },
    controlsRow: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      alignItems: 'flex-end',
      backgroundColor: 'rgba(17, 27, 33, 0.72)',
      borderRadius: 28,
      paddingVertical: 18,
      paddingHorizontal: 8,
    },
  });
}
