import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useIsFocused } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppAlert } from '@/components/AppAlert';
import { Avatar } from '@/components/Avatar';
import { MediaConfig } from '@/lib/constants';
import type { FeedPost } from '@/lib/db/social';
import { safePause, safePlay } from '@/lib/media/safeVideo';
import { useIdentity } from '@/providers/IdentityProvider';
import { usePeers } from '@/providers/PeerProvider';
import { useSocial } from '@/providers/SocialProvider';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

function ReelPlayer({
  uri,
  active,
}: {
  uri: string;
  active: boolean;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
  });

  useEffect(() => {
    if (active) {
      safePlay(player);
    } else {
      safePause(player);
    }
    // Do not pause in cleanup — native player may already be released.
  }, [active, player]);

  return (
    <VideoView
      style={styles.video}
      player={player}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

function ReelSlide({
  reel,
  active,
  mountPlayer,
  colors,
  styles: s,
  onReact,
  canDelete,
  onDelete,
}: {
  reel: FeedPost;
  active: boolean;
  /** Unmount players when the screen blurs so audio cannot leak. */
  mountPlayer: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  onReact: () => void;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const media = reel.media[0];
  const ready = media?.status === 'complete' && media.uri;
  const liked = Boolean(reel.myReaction);
  const likeCount = Object.values(reel.reactionCounts).reduce((a, b) => a + b, 0);

  return (
    <View style={[s.slide, { height: SCREEN_H }]}>
      {ready && media.uri && mountPlayer ? (
        <ReelPlayer uri={media.uri} active={active} />
      ) : (
        <View style={s.loadingMedia}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={s.loadingText}>
            {media?.status === 'failed'
              ? 'Video unavailable'
              : `Loading… ${Math.round((media?.progress ?? 0) * 100)}%`}
          </Text>
        </View>
      )}

      <View style={s.overlay}>
        <View style={s.metaCol}>
          <View style={s.authorRow}>
            <Avatar
              name={reel.authorName}
              uri={reel.authorAvatarUri}
              seed={reel.author}
              size={40}
            />
            <Text style={s.authorName}>{reel.authorName}</Text>
          </View>
          {reel.body ? <Text style={s.caption}>{reel.body}</Text> : null}
        </View>

        <View style={s.actions}>
          <Pressable style={s.action} onPress={onReact}>
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={32}
              color={liked ? colors.like : '#fff'}
            />
            <Text style={s.actionCount}>{likeCount || ''}</Text>
          </Pressable>
          {canDelete ? (
            <Pressable style={s.action} onPress={onDelete}>
              <Ionicons name="trash-outline" size={28} color="#fff" />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default function ReelsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isFocused = useIsFocused();
  const { alert } = useAppAlert();
  const { publicKey, profile } = useIdentity();
  const { connectedKeys } = usePeers();
  const {
    reels,
    refreshReels,
    syncNow,
    createReel,
    reactToPost,
    deletePost,
  } = useSocial();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoMime, setVideoMime] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    void refreshReels();
  }, [refreshReels]);

  useEffect(() => {
    if (reels.length > 0 && !activeId) {
      setActiveId(reels[0].id);
    }
  }, [reels, activeId]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0]?.item as FeedPost | undefined;
      if (first?.id) setActiveId(first.id);
    },
    [],
  );

  const viewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 80 }),
    [],
  );

  const pickVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      alert('Permission needed', 'Allow media library access to pick a reel.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 1,
      videoMaxDuration: Math.round(MediaConfig.maxReelDurationMs / 1000),
      allowsEditing: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.duration && asset.duration > MediaConfig.maxReelDurationMs) {
      alert(
        'Too long',
        `Reels must be ${Math.round(MediaConfig.maxReelDurationMs / 1000)} seconds or less.`,
      );
      return;
    }
    setVideoUri(asset.uri);
    setVideoMime(asset.mimeType ?? 'video/mp4');
    setDurationMs(typeof asset.duration === 'number' ? Math.round(asset.duration) : null);
    setComposerOpen(true);
  };

  const recordVideo = async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      alert('Permission needed', 'Allow camera access to record a reel.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: Math.round(MediaConfig.maxReelDurationMs / 1000),
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.duration && asset.duration > MediaConfig.maxReelDurationMs) {
      alert(
        'Too long',
        `Reels must be ${Math.round(MediaConfig.maxReelDurationMs / 1000)} seconds or less.`,
      );
      return;
    }
    setVideoUri(asset.uri);
    setVideoMime(asset.mimeType ?? 'video/mp4');
    setDurationMs(typeof asset.duration === 'number' ? Math.round(asset.duration) : null);
    setComposerOpen(true);
  };

  const onPublish = async () => {
    if (!profile?.displayName) {
      alert('Set a display name', 'Save your profile before posting a reel.');
      return;
    }
    if (!videoUri) {
      alert('No video', 'Pick or record a short video first.');
      return;
    }
    setPosting(true);
    try {
      await createReel(caption, videoUri, {
        mime: videoMime,
        durationMs,
      });
      setCaption('');
      setVideoUri(null);
      setVideoMime(null);
      setDurationMs(null);
      setComposerOpen(false);
      if (connectedKeys.length > 0) void syncNow();
    } catch (err) {
      alert('Reel failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setPosting(false);
    }
  };

  return (
    <View style={styles.root}>
      {reels.length === 0 ? (
        <SafeAreaView style={styles.emptySafe} edges={['top']}>
          <Ionicons name="film-outline" size={48} color="#fff" />
          <Text style={styles.emptyTitle}>No reels yet</Text>
          <Text style={styles.emptyBody}>
            Record a short video (max {Math.round(MediaConfig.maxReelDurationMs / 1000)}s)
            or follow friends nearby and sync.
          </Text>
        </SafeAreaView>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={(item) => item.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={SCREEN_H}
          decelerationRate="fast"
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          renderItem={({ item }) => (
            <ReelSlide
              reel={item}
              mountPlayer={isFocused}
              active={isFocused && activeId === item.id}
              colors={colors}
              styles={styles}
              onReact={() => {
                void reactToPost(item.id, '❤️');
              }}
              canDelete={Boolean(publicKey && item.author === publicKey)}
              onDelete={() => {
                alert('Delete reel?', 'Remove this reel for you and synced peers.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                      void deletePost(item.id).catch((err) =>
                        alert(
                          'Delete failed',
                          err instanceof Error ? err.message : 'Unknown error',
                        ),
                      );
                    },
                  },
                ]);
              }}
            />
          )}
        />
      )}

      <SafeAreaView style={styles.fabBar} edges={['bottom']}>
        <Pressable style={styles.fab} onPress={pickVideo}>
          <Ionicons name="images-outline" size={22} color="#fff" />
        </Pressable>
        <Pressable style={[styles.fab, styles.fabPrimary]} onPress={recordVideo}>
          <Ionicons name="videocam" size={24} color="#fff" />
          <Text style={styles.fabLabel}>Reel</Text>
        </Pressable>
      </SafeAreaView>

      {composerOpen ? (
        <View style={styles.composerBackdrop}>
          <View style={styles.composerCard}>
            <Text style={styles.composerTitle}>New reel</Text>
            <Text style={styles.composerHint}>
              {videoUri
                ? `Video ready${durationMs ? ` · ${Math.round(durationMs / 1000)}s` : ''}`
                : 'No video selected'}
            </Text>
            <TextInput
              style={styles.captionInput}
              placeholder="Add a caption…"
              placeholderTextColor={colors.muted}
              value={caption}
              onChangeText={setCaption}
              maxLength={200}
              multiline
            />
            <View style={styles.composerActions}>
              <Pressable
                style={styles.composerCancel}
                onPress={() => {
                  setComposerOpen(false);
                  setVideoUri(null);
                }}
              >
                <Text style={styles.composerCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.composerPost,
                  (!videoUri || posting) && styles.disabled,
                ]}
                disabled={!videoUri || posting}
                onPress={onPublish}
              >
                <Text style={styles.composerPostText}>
                  {posting ? 'Posting…' : 'Post reel'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: '#000',
    },
    emptySafe: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 32,
      backgroundColor: '#000',
    },
    emptyTitle: {
      color: '#fff',
      fontSize: 20,
      fontWeight: '800',
    },
    emptyBody: {
      color: 'rgba(255,255,255,0.7)',
      textAlign: 'center',
      lineHeight: 20,
    },
    slide: {
      width: SCREEN_W,
      backgroundColor: '#000',
    },
    video: {
      ...StyleSheet.absoluteFill,
    },
    loadingMedia: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    loadingText: {
      color: 'rgba(255,255,255,0.8)',
    },
    overlay: {
      ...StyleSheet.absoluteFill,
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 14,
      paddingBottom: 100,
      justifyContent: 'space-between',
    },
    metaCol: {
      flex: 1,
      gap: 10,
      paddingRight: 12,
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    authorName: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 16,
      textShadowColor: 'rgba(0,0,0,0.5)',
      textShadowRadius: 4,
    },
    caption: {
      color: '#fff',
      fontSize: 15,
      lineHeight: 20,
      textShadowColor: 'rgba(0,0,0,0.5)',
      textShadowRadius: 4,
    },
    actions: {
      gap: 18,
      alignItems: 'center',
    },
    action: {
      alignItems: 'center',
      gap: 4,
    },
    actionCount: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 13,
    },
    fabBar: {
      position: 'absolute',
      right: 16,
      bottom: 16,
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
    },
    fab: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: 'rgba(40,40,40,0.85)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    fabPrimary: {
      width: 'auto',
      paddingHorizontal: 16,
      flexDirection: 'row',
      gap: 8,
      backgroundColor: colors.accent,
    },
    fabLabel: {
      color: '#fff',
      fontWeight: '800',
    },
    composerBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    composerCard: {
      backgroundColor: colors.chrome,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 20,
      gap: 12,
      paddingBottom: 32,
    },
    composerTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
    },
    composerHint: {
      color: colors.muted,
      fontSize: 13,
    },
    captionInput: {
      minHeight: 72,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      color: colors.text,
      fontSize: 16,
      textAlignVertical: 'top',
    },
    composerActions: {
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'flex-end',
    },
    composerCancel: {
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    composerCancelText: {
      color: colors.muted,
      fontWeight: '700',
    },
    composerPost: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 18,
    },
    composerPostText: {
      color: '#fff',
      fontWeight: '800',
    },
    disabled: {
      opacity: 0.45,
    },
  });
}

const styles = StyleSheet.create({
  video: {
    width: '100%',
    height: '100%',
  },
});
