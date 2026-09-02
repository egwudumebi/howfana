import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import { useAppAlert } from '@/components/AppAlert';
import { Avatar } from '@/components/Avatar';
import { BrandHeader } from '@/components/BrandHeader';
import { ChatComposer } from '@/components/ChatComposer';
import { EmptyState } from '@/components/EmptyState';
import {
  computeConversationId,
  listConversations,
  listMessages,
  type ConversationSummary,
  type MessageRow,
} from '@/lib/db/messages';
import { SoftPressable } from '@/components/SoftPressable';
import { importLocalImage, getMediaObject } from '@/lib/media/store';
import {
  parsePhotoMessageBody,
  photoMessageBody,
} from '@/lib/messaging/mediaBody';
import { useCall } from '@/providers/CallProvider';
import { useIdentity } from '@/providers/IdentityProvider';
import { useMessaging } from '@/providers/MessagingProvider';
import { usePeers } from '@/providers/PeerProvider';
import { useSocial } from '@/providers/SocialProvider';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';

export default function ChatScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const db = useSQLiteContext();
  const { alert } = useAppAlert();
  const { ready, publicKey, error: identityError } = useIdentity();
  const { sessions, connectedKeys } = usePeers();
  const { lastSyncMessage, syncNow } = useSocial();
  const { sendMessage, sending } = useMessaging();
  const { startCall, webrtcAvailable } = useCall();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [selectedOtherPk, setSelectedOtherPk] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string>('');

  const [composer, setComposer] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const connectedPeers = useMemo(() => {
    return sessions
      .filter((s) => s.status === 'connected' && !s.publicKey.startsWith('manual:'))
      .map((s) => ({
        publicKey: s.publicKey,
        displayName: s.displayName,
      }));
  }, [sessions]);

  const refreshConversations = useCallback(async () => {
    if (!publicKey) return;
    setLoadingConversations(true);
    try {
      const rows = await listConversations(db, publicKey);
      setConversations(rows);
    } finally {
      setLoadingConversations(false);
    }
  }, [db, publicKey]);

  const refreshMessages = useCallback(
    async (conversationId: string) => {
      setLoadingMessages(true);
      try {
        const rows = await listMessages(db, conversationId);
        setMessages(rows);
      } finally {
        setLoadingMessages(false);
      }
    },
    [db],
  );

  const selectConversation = useCallback(
    async (otherPk: string, name?: string) => {
      if (!publicKey) return;
      const other = otherPk.toLowerCase();
      const conversationId = computeConversationId(publicKey, other);
      setSelectedOtherPk(other);
      setSelectedConversationId(conversationId);
      setSelectedName(name || shortenPk(other));
      await refreshMessages(conversationId);
    },
    [publicKey, refreshMessages],
  );

  const closeThread = () => {
    setSelectedOtherPk(null);
    setSelectedConversationId(null);
    setSelectedName('');
    setMessages([]);
    setComposer('');
  };

  const onSend = useCallback(async () => {
    if (!selectedOtherPk) return;
    const text = composer.trim();
    if (!text) return;
    try {
      await sendMessage(selectedOtherPk, text);
      setComposer('');
      await refreshConversations();
      if (selectedConversationId) {
        await refreshMessages(selectedConversationId);
      }
    } catch (err) {
      alert(
        'Send failed',
        err instanceof Error ? err.message : 'Unknown error',
      );
    }
  }, [
    alert,
    composer,
    refreshConversations,
    refreshMessages,
    sendMessage,
    selectedConversationId,
    selectedOtherPk,
  ]);

  const sendPhoto = useCallback(
    async (source: 'gallery' | 'camera') => {
      if (!selectedOtherPk) return;

      if (source === 'gallery') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          alert('Permission needed', 'Allow photo library access to send images.');
          return;
        }
      } else {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          alert('Permission needed', 'Allow camera access to take photos.');
          return;
        }
      }

      const result =
        source === 'gallery'
          ? await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.85,
            })
          : await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.85,
            });

      if (result.canceled || !result.assets[0]?.uri) return;

      try {
        const media = await importLocalImage(db, result.assets[0].uri);
        await sendMessage(selectedOtherPk, photoMessageBody(media.cid));
        await refreshConversations();
        if (selectedConversationId) {
          await refreshMessages(selectedConversationId);
        }
      } catch (err) {
        alert(
          'Photo failed',
          err instanceof Error ? err.message : 'Could not send photo.',
        );
      }
    },
    [
      alert,
      db,
      refreshConversations,
      refreshMessages,
      selectedConversationId,
      selectedOtherPk,
      sendMessage,
    ],
  );

  useEffect(() => {
    if (ready && publicKey) {
      void refreshConversations();
    }
  }, [ready, publicKey, refreshConversations]);

  useEffect(() => {
    if (!publicKey) return;
    void refreshConversations();
    if (selectedConversationId) {
      void refreshMessages(selectedConversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSyncMessage]);

  if (!ready) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!publicKey) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <BrandHeader title="Chat" />
        <EmptyState
          icon="warning-outline"
          title="Identity unavailable"
          body={identityError ?? 'Open Profile to check your keys.'}
        />
      </SafeAreaView>
    );
  }

  if (selectedConversationId && selectedOtherPk) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.threadHeader}>
          <Pressable onPress={closeThread} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={colors.accent} />
          </Pressable>
          <Avatar name={selectedName} seed={selectedOtherPk} size={36} />
          <Text style={styles.threadTitle} numberOfLines={1}>
            {selectedName}
          </Text>
          <SoftPressable
            style={styles.callBtn}
            hitSlop={8}
            onPress={() => {
              if (!connectedKeys.includes(selectedOtherPk)) {
                alert(
                  'Connect first',
                  'Voice and video calls need an active Wi‑Fi mesh connection.',
                );
                return;
              }
              if (!webrtcAvailable) {
                alert(
                  'Rebuild required',
                  'Install a fresh native build to enable WebRTC calls.',
                );
                return;
              }
              void startCall(selectedOtherPk, selectedName, 'audio').catch(
                (err) =>
                  alert(
                    'Call failed',
                    err instanceof Error ? err.message : 'Unknown error',
                  ),
              );
            }}
          >
            <Ionicons name="call-outline" size={22} color={colors.accent} />
          </SoftPressable>
          <SoftPressable
            style={styles.callBtn}
            hitSlop={8}
            onPress={() => {
              if (!connectedKeys.includes(selectedOtherPk)) {
                alert(
                  'Connect first',
                  'Voice and video calls need an active Wi‑Fi mesh connection.',
                );
                return;
              }
              if (!webrtcAvailable) {
                alert(
                  'Rebuild required',
                  'Install a fresh native build to enable WebRTC calls.',
                );
                return;
              }
              void startCall(selectedOtherPk, selectedName, 'video').catch(
                (err) =>
                  alert(
                    'Call failed',
                    err instanceof Error ? err.message : 'Unknown error',
                  ),
              );
            }}
          >
            <Ionicons name="videocam-outline" size={22} color={colors.accent} />
          </SoftPressable>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={8}
        >
          {loadingMessages ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <FlatList
              data={messages}
              keyExtractor={(m) => m.id}
              contentContainerStyle={styles.threadList}
              ListEmptyComponent={
                <Text style={styles.emptyThread}>
                  Say hi — messages sync over the local mesh.
                </Text>
              }
              renderItem={({ item: m }) => {
                const mine = m.sender === publicKey;
                return (
                  <View
                    style={[
                      styles.msgRow,
                      mine ? styles.msgRowMine : styles.msgRowTheirs,
                    ]}
                  >
                    {!mine ? (
                      <Avatar
                        name={m.senderName || selectedName}
                        seed={m.sender}
                        size={28}
                      />
                    ) : null}
                    <ChatMessageBubble
                      body={m.body}
                      mine={mine}
                      styles={styles}
                      colors={colors}
                      db={db}
                    />
                  </View>
                );
              }}
            />
          )}

          <ChatComposer
            value={composer}
            onChangeText={setComposer}
            onSend={() => {
              void onSend();
            }}
            onOpenGallery={() => {
              void sendPhoto('gallery');
            }}
            onOpenCamera={() => {
              void sendPhoto('camera');
            }}
            onOpenDocument={() => {
              alert('Coming soon', 'Document sharing is not available yet.');
            }}
            onVoiceNote={() => {
              alert('Coming soon', 'Voice messages are not available yet.');
            }}
            sending={sending}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BrandHeader
        title="Chat"
        onAction={() => {
          void syncNow();
        }}
        actionIcon="sync-outline"
      />

      <FlatList
        data={conversations}
        keyExtractor={(c) => c.conversationId}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.newChatSection}>
            <Text style={styles.sectionLabel}>Active now</Text>
            {connectedPeers.length === 0 ? (
              <Text style={styles.meta}>
                Connect friends on the People tab to start a chat.
              </Text>
            ) : (
              <FlatList
                horizontal
                data={connectedPeers}
                keyExtractor={(p) => p.publicKey}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.stories}
                renderItem={({ item: p }) => (
                  <Pressable
                    style={styles.story}
                    onPress={() => {
                      void selectConversation(
                        p.publicKey,
                        p.displayName || shortenPk(p.publicKey),
                      );
                    }}
                  >
                    <Avatar
                      name={p.displayName}
                      seed={p.publicKey}
                      size={56}
                      online
                    />
                    <Text style={styles.storyName} numberOfLines={1}>
                      {p.displayName || 'Friend'}
                    </Text>
                  </Pressable>
                )}
              />
            )}
            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Chats</Text>
            {loadingConversations && conversations.length === 0 ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loadingConversations ? (
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title="No messages yet"
              body="Tap someone who’s active nearby to start a conversation over Wi‑Fi."
            />
          ) : null
        }
        renderItem={({ item: c }) => (
          <Pressable
            style={styles.convRow}
            onPress={() => {
              void selectConversation(
                c.otherPublicKey,
                c.otherName || shortenPk(c.otherPublicKey),
              );
            }}
          >
            <Avatar name={c.otherName} seed={c.otherPublicKey} size={56} />
            <View style={styles.convMain}>
              <View style={styles.convTop}>
                <Text style={styles.convTitle}>
                  {c.otherName || shortenPk(c.otherPublicKey)}
                </Text>
                <Text style={styles.convTime}>{timeAgo(c.lastAt)}</Text>
              </View>
              <Text style={styles.convPreview} numberOfLines={1}>
                {c.lastMessageBody || ' '}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function ChatMessageBubble({
  body,
  mine,
  styles,
  colors,
  db,
}: {
  body: string;
  mine: boolean;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  db: ReturnType<typeof useSQLiteContext>;
}) {
  const photoCid = parsePhotoMessageBody(body);
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    if (!photoCid) {
      setUri(null);
      return;
    }
    let cancelled = false;
    void getMediaObject(db, photoCid).then((media) => {
      if (!cancelled) {
        setUri(media?.localUri ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [db, photoCid]);

  return (
    <View
      style={[
        styles.bubble,
        mine ? styles.bubbleMine : styles.bubbleTheirs,
        photoCid ? styles.bubbleMedia : null,
      ]}
    >
      {photoCid ? (
        uri ? (
          <Image source={{ uri }} style={styles.bubbleImage} resizeMode="cover" />
        ) : (
          <View style={styles.bubbleImagePlaceholder}>
            <Ionicons
              name="image-outline"
              size={28}
              color={mine ? '#fff' : colors.muted}
            />
            <Text
              style={[
                styles.bubbleText,
                mine ? styles.bubbleTextMine : styles.bubbleTextTheirs,
              ]}
            >
              Photo
            </Text>
          </View>
        )
      ) : (
        <Text
          style={[
            styles.bubbleText,
            mine ? styles.bubbleTextMine : styles.bubbleTextTheirs,
          ]}
        >
          {body}
        </Text>
      )}
    </View>
  );
}

function shortenPk(key: string): string {
  if (key.length <= 12) return key;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

function timeAgo(ts: number): string {
  const delta = Math.max(0, Date.now() - ts);
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.chrome,
    },
    flex: {
      flex: 1,
      backgroundColor: colors.chrome,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
      gap: 10,
      paddingHorizontal: 32,
    },
    listContent: {
      paddingBottom: 24,
      flexGrow: 1,
    },
    newChatSection: {
      paddingTop: 8,
      paddingBottom: 4,
    },
    sectionLabel: {
      paddingHorizontal: 16,
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 10,
    },
    stories: {
      paddingHorizontal: 12,
      gap: 12,
    },
    story: {
      width: 72,
      alignItems: 'center',
      gap: 6,
    },
    storyName: {
      fontSize: 12,
      color: colors.text,
      fontWeight: '500',
      textAlign: 'center',
      width: 72,
    },
    meta: {
      fontSize: 13,
      color: colors.muted,
      paddingHorizontal: 16,
      lineHeight: 18,
    },
    empty: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 48,
      paddingHorizontal: 32,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    emptyThread: {
      textAlign: 'center',
      color: colors.muted,
      marginTop: 40,
      paddingHorizontal: 32,
    },
    convRow: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
      alignItems: 'center',
    },
    convMain: {
      flex: 1,
      gap: 2,
    },
    convTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
    },
    convTitle: {
      fontWeight: '700',
      color: colors.text,
      fontSize: 16,
      flex: 1,
    },
    convPreview: {
      color: colors.muted,
      fontSize: 14,
    },
    convTime: {
      color: colors.muted,
      fontSize: 12,
    },
    threadHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 8,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
      backgroundColor: colors.chrome,
    },
    backBtn: {
      padding: 6,
    },
    threadTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    callBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    threadList: {
      padding: 12,
      flexGrow: 1,
    },
    msgRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
      marginBottom: 6,
    },
    msgRowMine: {
      justifyContent: 'flex-end',
    },
    msgRowTheirs: {
      justifyContent: 'flex-start',
    },
    bubble: {
      maxWidth: '75%',
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    bubbleMine: {
      backgroundColor: colors.bubbleMine,
    },
    bubbleTheirs: {
      backgroundColor: colors.bubbleTheirs,
    },
    bubbleMedia: {
      paddingHorizontal: 4,
      paddingVertical: 4,
      overflow: 'hidden',
    },
    bubbleImage: {
      width: 220,
      height: 220,
      borderRadius: 14,
    },
    bubbleImagePlaceholder: {
      width: 220,
      height: 120,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.surface,
    },
    bubbleText: {
      fontSize: 15,
      lineHeight: 20,
    },
    bubbleTextMine: {
      color: '#fff',
    },
    bubbleTextTheirs: {
      color: colors.text,
    },
  });
}
