import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppAlert } from '@/components/AppAlert';
import { AdCard } from '@/components/AdCard';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { MediaGallery } from '@/components/MediaGallery';
import { HowfanaMark } from '@/components/HowfanaMark';
import { NearbyErrorBanner } from '@/components/NearbyErrorBanner';
import { ReelsRail } from '@/components/ReelsRail';
import { SoftPressable } from '@/components/SoftPressable';
import { StoryViewer } from '@/components/StoryViewer';
import { buildFeedWithAds } from '@/lib/ads/feedMix';
import type { CommentRow, FeedPost } from '@/lib/db/social';
import { canEditPost } from '@/lib/premium/entitlements';
import { useIdentity } from '@/providers/IdentityProvider';
import { usePeers } from '@/providers/PeerProvider';
import { usePremium } from '@/providers/PremiumProvider';
import { useSocial } from '@/providers/SocialProvider';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';
import { Radius, Space } from '@/theme/spacing';

function timeAgo(ts: number): string {
  const delta = Math.max(0, Date.now() - ts);
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function PostCard({
  post,
  visibilityLabel,
  visibilityColor,
  pinned,
  canDelete,
  onLike,
  onComment,
  onShare,
  onMenu,
  commentsOpen,
  comments,
  commentDraft,
  onChangeComment,
  onSubmitComment,
  colors,
  styles,
}: {
  post: FeedPost;
  visibilityLabel: string;
  visibilityColor: string;
  pinned?: boolean;
  canDelete: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onMenu: () => void;
  commentsOpen: boolean;
  comments: CommentRow[];
  commentDraft: string;
  onChangeComment: (v: string) => void;
  onSubmitComment: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const liked = Boolean(post.myReaction);
  const likeCount = Object.values(post.reactionCounts).reduce((a, b) => a + b, 0);

  return (
    <View style={styles.post}>
      <View style={styles.postHeader}>
        <Avatar
          name={post.authorName}
          uri={post.authorAvatarUri}
          seed={post.author}
          size={44}
        />
        <View style={styles.postHeaderText}>
          <View style={styles.authorRow}>
            <Text style={styles.author}>{post.authorName}</Text>
            {pinned ? (
              <Ionicons name="pin" size={14} color={colors.accent} />
            ) : null}
            {post.visibilityBoost ? (
              <Text style={styles.boostBadge}>Boost</Text>
            ) : null}
          </View>
          <Text style={styles.metaLine}>
            {timeAgo(post.createdAt)}
            {post.editedAt ? ' · Edited' : ''}
            <Text style={{ color: visibilityColor }}> · {visibilityLabel}</Text>
          </Text>
        </View>
        <SoftPressable onPress={onMenu} hitSlop={8} style={styles.menuBtn}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
        </SoftPressable>
      </View>

      {post.body ? <Text style={styles.body}>{post.body}</Text> : null}
      {post.media.length > 0 ? (
        <MediaGallery media={post.media} layout={post.mediaLayout} />
      ) : null}

      <View style={styles.actions}>
        <SoftPressable style={styles.action} onPress={onLike}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={22}
            color={liked ? colors.like : colors.accent}
          />
          {likeCount > 0 ? (
            <Text style={styles.actionCount}>{likeCount}</Text>
          ) : null}
        </SoftPressable>
        <SoftPressable style={styles.action} onPress={onComment}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.accent} />
          {post.commentCount > 0 ? (
            <Text style={styles.actionCount}>{post.commentCount}</Text>
          ) : null}
        </SoftPressable>
        <SoftPressable style={styles.action} onPress={onShare}>
          <Ionicons name="paper-plane-outline" size={20} color={colors.accent} />
        </SoftPressable>
        {canDelete ? null : null}
      </View>

      {commentsOpen ? (
        <View style={styles.comments}>
          {comments.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <Text style={styles.commentAuthor}>{c.authorName}</Text>
              <Text style={styles.commentBody}>{c.body}</Text>
            </View>
          ))}
          <View style={styles.commentComposer}>
            <TextInput
              style={styles.commentInput}
              placeholder="Write a comment…"
              placeholderTextColor={colors.muted}
              value={commentDraft}
              onChangeText={onChangeComment}
            />
            <SoftPressable onPress={onSubmitComment}>
              <Text style={styles.commentSend}>Send</Text>
            </SoftPressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { alert } = useAppAlert();
  const { publicKey, profile } = useIdentity();
  const {
    nearbyCount,
    nearbyPeers,
    nearbyDiscoveryEnabled,
    invisibleMode,
    isVisibleNearby,
    setNearbyDiscoveryEnabled,
    setInvisibleMode,
    available,
    transportError,
    clearTransportError,
    retryNearbyPermissions,
    connectedKeys,
  } = usePeers();
  const {
    posts,
    reels,
    storyRings,
    refreshFeed,
    refreshReels,
    refreshStories,
    syncNow,
    createPost,
    createStory,
    markStoriesViewed,
    deletePost,
    editPost,
    reactToPost,
    commentOnPost,
    loadComments,
    syncing,
  } = useSocial();
  const {
    isPremium,
    pinnedPostIds,
    togglePin,
    isPinned,
    isAdHidden,
  } = usePremium();

  const [refreshing, setRefreshing] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [commentsOpenId, setCommentsOpenId] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [storyDraft, setStoryDraft] = useState('');
  const [editPostId, setEditPostId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const feedItems = useMemo(() => {
    const pinned = posts.filter((p) => pinnedPostIds.includes(p.id));
    const rest = posts.filter((p) => !pinnedPostIds.includes(p.id));
    return buildFeedWithAds([...pinned, ...rest], isAdHidden);
  }, [posts, pinnedPostIds, isAdHidden]);
  const [storyImageUri, setStoryImageUri] = useState<string | null>(null);
  const [storyPosting, setStoryPosting] = useState(false);
  const [viewerAuthor, setViewerAuthor] = useState<string | null>(null);

  const peersWithoutStories = useMemo(() => {
    const withStories = new Set(
      storyRings.map((r) => r.author.toLowerCase()),
    );
    return nearbyPeers
      .filter((p) => !withStories.has(p.publicKey.toLowerCase()))
      .slice(0, 8);
  }, [nearbyPeers, storyRings]);

  useEffect(() => {
    void refreshFeed();
    void refreshReels();
  }, [nearbyPeers, refreshFeed, refreshReels]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshFeed();
      await refreshReels();
      await refreshStories();
      if (connectedKeys.length > 0) await syncNow();
    } finally {
      setRefreshing(false);
    }
  }, [refreshFeed, refreshReels, refreshStories, syncNow, connectedKeys.length]);

  const pickStoryImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      alert('Permission needed', 'Allow photo access to add a story image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    setStoryImageUri(result.assets[0].uri);
  };

  const publishStory = async () => {
    if (!profile?.displayName) {
      alert('Set a display name', 'Save your profile before posting a story.');
      return;
    }
    if (!storyDraft.trim() && !storyImageUri) {
      alert('Empty story', 'Add a caption or a photo.');
      return;
    }
    setStoryPosting(true);
    try {
      await createStory(storyDraft, storyImageUri);
      setStoryDraft('');
      setStoryImageUri(null);
      setStoryComposerOpen(false);
      if (connectedKeys.length > 0) void syncNow();
    } catch (err) {
      alert('Story failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setStoryPosting(false);
    }
  };

  const openComments = async (postId: string) => {
    if (commentsOpenId === postId) {
      setCommentsOpenId(null);
      return;
    }
    setCommentsOpenId(postId);
    setComments(await loadComments(postId));
  };

  const submitComment = async (postId: string) => {
    const body = commentDraft.trim();
    if (!body) return;
    try {
      await commentOnPost(postId, body);
      setCommentDraft('');
      setComments(await loadComments(postId));
    } catch (err) {
      alert('Comment failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const publishQuick = async () => {
    if (!profile?.displayName) {
      alert('Set a display name', 'Save your profile before posting.');
      return;
    }
    if (!draft.trim()) return;
    setPosting(true);
    try {
      await createPost(draft.trim());
      setDraft('');
      setComposerOpen(false);
      if (connectedKeys.length > 0) void syncNow();
    } catch (err) {
      alert('Post failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setPosting(false);
    }
  };

  const postMenu = (post: FeedPost) => {
    const own = publicKey && post.author === publicKey;
    const pinned = isPinned(post.id);
    alert('Post options', undefined, [
      { text: 'Cancel', style: 'cancel' },
      ...(own
        ? [
            ...(canEditPost(isPremium, post.createdAt)
              ? [
                  {
                    text: 'Edit',
                    onPress: () => {
                      setEditPostId(post.id);
                      setEditDraft(post.body);
                    },
                  },
                ]
              : isPremium
                ? []
                : [
                    {
                      text: 'Edit (Premium)',
                      onPress: () =>
                        alert(
                          'Premium feature',
                          'Premium members can edit posts for 1 hour after publishing.',
                        ),
                    },
                  ]),
            {
              text: pinned ? 'Unpin' : 'Pin post',
              onPress: () => {
                void togglePin(post.id).then((res) => {
                  if (!res.ok) {
                    alert('Pin limit', res.message ?? 'Could not pin this post.');
                  }
                });
              },
            },
            {
              text: 'Delete',
              style: 'destructive' as const,
              onPress: () => {
                void deletePost(post.id).catch((err) =>
                  alert(
                    'Delete failed',
                    err instanceof Error ? err.message : 'Unknown error',
                  ),
                );
              },
            },
          ]
        : [
            {
              text: 'Report',
              onPress: () =>
                alert('Reported', 'Thanks — we’ll review this locally for now.'),
            },
          ]),
    ]);
  };

  const saveEdit = async () => {
    if (!editPostId || !editDraft.trim()) return;
    setSavingEdit(true);
    try {
      await editPost(editPostId, editDraft.trim());
      setEditPostId(null);
      setEditDraft('');
    } catch (err) {
      alert('Edit failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <HowfanaMark size={28} />
          <Text style={styles.brand}>Howfana</Text>
        </View>
        <SoftPressable
          style={styles.bellBtn}
          onPress={() => router.push('/notifications' as Href)}
        >
          <Ionicons name="notifications-outline" size={22} color={colors.accent} />
        </SoftPressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || syncing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.nearbyCard}>
          <View style={styles.nearbyTop}>
            <View style={styles.wifiIcon}>
              <Ionicons name="wifi" size={22} color="#fff" />
            </View>
            <View style={styles.nearbyCopy}>
              <Text style={styles.nearbyTitle}>People Around You</Text>
              <View style={styles.nearbySubRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.nearbySub}>
                  {available
                    ? `${nearbyCount} people nearby`
                    : 'Nearby discovery needs a native build'}
                </Text>
              </View>
            </View>
            <SoftPressable
              style={styles.viewNearbyBtn}
              onPress={() => router.push('/people-nearby' as Href)}
            >
              <Text style={styles.viewNearbyText}>View Nearby</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accent} />
            </SoftPressable>
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Nearby Discovery</Text>
            <Switch
              value={nearbyDiscoveryEnabled}
              onValueChange={(v) => {
                void setNearbyDiscoveryEnabled(v);
              }}
              trackColor={{ false: colors.border, true: colors.accentSoft }}
              thumbColor={nearbyDiscoveryEnabled ? colors.accent : colors.muted}
            />
          </View>

          {(!nearbyDiscoveryEnabled || invisibleMode) && (
            <View style={styles.invisibleRow}>
              <Ionicons name="shield-outline" size={16} color={colors.muted} />
              <Text style={styles.invisibleText}>
                Invisible Mode — You won’t appear to nearby people.
              </Text>
            </View>
          )}

          {nearbyDiscoveryEnabled ? (
            <SoftPressable
              style={styles.invisibleToggle}
              onPress={() => void setInvisibleMode(!invisibleMode)}
            >
              <Text style={styles.invisibleToggleText}>
                {invisibleMode ? 'Turn off Invisible Mode' : 'Go invisible'}
              </Text>
            </SoftPressable>
          ) : null}

          {transportError ? (
            <NearbyErrorBanner
              message={transportError}
              onDismiss={clearTransportError}
              onRetry={() => {
                void retryNearbyPermissions();
              }}
            />
          ) : null}
        </View>

        <View style={styles.quickPost}>
          <Avatar
            name={profile?.displayName || 'You'}
            uri={profile?.avatarUri}
            seed={publicKey ?? 'me'}
            size={42}
          />
          <Pressable
            style={styles.quickInput}
            onPress={() => setComposerOpen(true)}
          >
            <Text style={styles.quickPlaceholder}>Say hello to everyone…</Text>
          </Pressable>
          <SoftPressable
            style={styles.quickPlus}
            onPress={() => router.push('/(tabs)/create' as Href)}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </SoftPressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stories}
        >
          <SoftPressable
            style={styles.storyItem}
            onPress={() => setStoryComposerOpen(true)}
          >
            <View style={[styles.storyRing, styles.addStoryRing]}>
              <View style={styles.addStoryInner}>
                <Ionicons name="add" size={28} color={colors.accent} />
              </View>
            </View>
            <Text style={styles.storyName}>Add Story</Text>
          </SoftPressable>
          {storyRings.map((ring) => (
            <SoftPressable
              key={ring.author}
              style={styles.storyItem}
              onPress={() => setViewerAuthor(ring.author)}
            >
              <View
                style={[
                  styles.storyRing,
                  !ring.hasUnviewed && styles.storyRingViewed,
                ]}
              >
                <Avatar
                  name={ring.authorName}
                  uri={ring.authorAvatarUri}
                  seed={ring.author}
                  size={62}
                />
                <View style={styles.storyDot} />
              </View>
              <Text style={styles.storyName} numberOfLines={1}>
                {publicKey &&
                ring.author.toLowerCase() === publicKey.toLowerCase()
                  ? 'Your story'
                  : ring.authorName.split(' ')[0] || 'Nearby'}
              </Text>
            </SoftPressable>
          ))}
          {peersWithoutStories.map((peer) => (
            <SoftPressable
              key={peer.publicKey}
              style={styles.storyItem}
              onPress={() => router.push('/(tabs)/peers' as Href)}
            >
              <View style={[styles.storyRing, styles.storyRingIdle]}>
                <Avatar
                  name={peer.displayName}
                  seed={peer.publicKey}
                  size={62}
                />
                <View style={styles.storyDot} />
              </View>
              <Text style={[styles.storyName, styles.storyNameIdle]} numberOfLines={1}>
                {peer.displayName.split(' ')[0] || 'Nearby'}
              </Text>
            </SoftPressable>
          ))}
        </ScrollView>

        <ReelsRail reels={reels} />

        <Text style={styles.feedHeading}>Local Community</Text>

        {posts.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No local posts yet"
            body="Say hello, or turn on Nearby Discovery so friends nearby (Wi‑Fi & Bluetooth) can sync with you."
            actionLabel="Write a post"
            onAction={() => setComposerOpen(true)}
          />
        ) : (
          feedItems.map((item) =>
            item.kind === 'ad' ? (
              <AdCard key={`ad-${item.ad.id}`} ad={item.ad} />
            ) : (
              <PostCard
                key={item.post.id}
                post={item.post}
                pinned={isPinned(item.post.id)}
                visibilityLabel={
                  publicKey && item.post.author === publicKey
                    ? isVisibleNearby
                      ? 'Visible nearby'
                      : 'Invisible mode'
                    : 'Visible nearby'
                }
                visibilityColor={
                  publicKey &&
                  item.post.author === publicKey &&
                  !isVisibleNearby
                    ? colors.muted
                    : colors.online
                }
                canDelete={Boolean(
                  publicKey && item.post.author === publicKey,
                )}
                onLike={() => void reactToPost(item.post.id, '❤️')}
                onComment={() => void openComments(item.post.id)}
                onShare={() =>
                  alert(
                    'Share',
                    'Forwarding to chat peers is coming soon. Friends nearby will sync this post over Wi‑Fi.',
                  )
                }
                onMenu={() => postMenu(item.post)}
                commentsOpen={commentsOpenId === item.post.id}
                comments={comments}
                commentDraft={commentDraft}
                onChangeComment={setCommentDraft}
                onSubmitComment={() => void submitComment(item.post.id)}
                colors={colors}
                styles={styles}
              />
            ),
          )
        )}
      </ScrollView>

      <Modal
        visible={Boolean(editPostId)}
        transparent
        animationType="fade"
        onRequestClose={() => setEditPostId(null)}
      >
        <View style={styles.composerBackdrop}>
          <View style={styles.composerCard}>
            <Text style={styles.composerTitle}>Edit post</Text>
            <TextInput
              style={styles.composerInput}
              value={editDraft}
              onChangeText={setEditDraft}
              multiline
              autoFocus
              maxLength={2000}
            />
            <View style={styles.composerActions}>
              <SoftPressable onPress={() => setEditPostId(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </SoftPressable>
              <SoftPressable
                style={[
                  styles.publishBtn,
                  (!editDraft.trim() || savingEdit) && styles.disabled,
                ]}
                disabled={!editDraft.trim() || savingEdit}
                onPress={() => void saveEdit()}
              >
                <Text style={styles.publishText}>
                  {savingEdit ? 'Saving…' : 'Save'}
                </Text>
              </SoftPressable>
            </View>
          </View>
        </View>
      </Modal>

      {composerOpen ? (
        <View style={styles.composerBackdrop}>
          <View style={styles.composerCard}>
            <Text style={styles.composerTitle}>Quick post</Text>
            <TextInput
              style={styles.composerInput}
              placeholder="Say hello to everyone…"
              placeholderTextColor={colors.muted}
              value={draft}
              onChangeText={setDraft}
              multiline
              autoFocus
            />
            <View style={styles.composerActions}>
              <SoftPressable onPress={() => setComposerOpen(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </SoftPressable>
              <SoftPressable
                style={[
                  styles.publishBtn,
                  (!draft.trim() || posting) && styles.disabled,
                ]}
                disabled={!draft.trim() || posting}
                onPress={() => void publishQuick()}
              >
                <Text style={styles.publishText}>
                  {posting ? 'Posting…' : 'Post'}
                </Text>
              </SoftPressable>
            </View>
          </View>
        </View>
      ) : null}

      {storyComposerOpen ? (
        <View style={styles.composerBackdrop}>
          <View style={styles.composerCard}>
            <Text style={styles.composerTitle}>Add story</Text>
            <Text style={styles.storyHint}>Visible to nearby people for 24 hours</Text>
            {storyImageUri ? (
              <View style={styles.storyPreviewFrame}>
                <Image
                  source={{ uri: storyImageUri }}
                  style={styles.storyPreview}
                  resizeMode="contain"
                />
              </View>
            ) : null}
            <TextInput
              style={styles.composerInput}
              placeholder="Share what’s happening nearby…"
              placeholderTextColor={colors.muted}
              value={storyDraft}
              onChangeText={setStoryDraft}
              multiline
              maxLength={280}
              autoFocus
            />
            <View style={styles.composerActions}>
              <SoftPressable onPress={() => void pickStoryImage()}>
                <Text style={styles.photoLink}>Photo</Text>
              </SoftPressable>
              <View style={{ flex: 1 }} />
              <SoftPressable
                onPress={() => {
                  setStoryComposerOpen(false);
                  setStoryDraft('');
                  setStoryImageUri(null);
                }}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </SoftPressable>
              <SoftPressable
                style={[
                  styles.publishBtn,
                  ((!storyDraft.trim() && !storyImageUri) || storyPosting) &&
                    styles.disabled,
                ]}
                disabled={
                  (!storyDraft.trim() && !storyImageUri) || storyPosting
                }
                onPress={() => void publishStory()}
              >
                <Text style={styles.publishText}>
                  {storyPosting ? 'Sharing…' : 'Share'}
                </Text>
              </SoftPressable>
            </View>
          </View>
        </View>
      ) : null}

      <StoryViewer
        visible={Boolean(viewerAuthor)}
        rings={storyRings}
        startAuthor={viewerAuthor ?? ''}
        onClose={() => setViewerAuthor(null)}
        onViewed={(ids) => {
          void markStoriesViewed(ids);
        }}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.screen,
      paddingBottom: Space.md,
      paddingTop: Space.xs,
    },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
    brand: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.accent,
      letterSpacing: -0.4,
    },
    bellBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: {
      paddingHorizontal: Space.screen,
      paddingBottom: 100,
      gap: Space.xl,
    },
    nearbyCard: {
      backgroundColor: colors.surface,
      borderRadius: Radius.card,
      padding: Space.lg,
      gap: Space.md,
    },
    nearbyTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
    },
    wifiIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nearbyCopy: { flex: 1, gap: 4 },
    nearbyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.title,
    },
    nearbySubRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    onlineDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.online,
    },
    nearbySub: { fontSize: 13, color: colors.muted },
    viewNearbyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      borderWidth: 1.5,
      borderColor: colors.accent,
      borderRadius: Radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    viewNearbyText: {
      color: colors.accent,
      fontWeight: '700',
      fontSize: 12,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: Space.sm,
    },
    toggleLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.title,
    },
    invisibleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    invisibleText: {
      flex: 1,
      fontSize: 12,
      color: colors.muted,
      lineHeight: 17,
    },
    invisibleToggle: { alignSelf: 'flex-start' },
    invisibleToggleText: {
      color: colors.accent,
      fontWeight: '600',
      fontSize: 13,
    },
    errorText: { color: colors.danger, fontSize: 12 },
    quickPost: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
    },
    quickInput: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: Radius.pill,
      paddingHorizontal: Space.lg,
      paddingVertical: 14,
    },
    quickPlaceholder: { color: colors.muted, fontSize: 15 },
    quickPlus: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stories: {
      gap: Space.lg,
      paddingVertical: Space.xs,
    },
    storyItem: {
      width: 76,
      alignItems: 'center',
      gap: 6,
    },
    storyRing: {
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 2.5,
      borderColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    storyRingViewed: {
      borderColor: colors.border,
    },
    storyRingIdle: {
      borderColor: colors.divider,
    },
    addStoryRing: {
      borderStyle: 'solid',
    },
    addStoryInner: {
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    storyDot: {
      position: 'absolute',
      right: 4,
      bottom: 4,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.online,
      borderWidth: 2,
      borderColor: colors.bg,
    },
    storyName: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.accent,
      maxWidth: 72,
      textAlign: 'center',
    },
    storyNameIdle: {
      color: colors.muted,
    },
    storyHint: {
      fontSize: 13,
      color: colors.muted,
      marginTop: -Space.sm,
    },
    storyPreviewFrame: {
      width: '100%',
      aspectRatio: 9 / 16,
      maxHeight: 320,
      borderRadius: Radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surface,
    },
    storyPreview: {
      width: '100%',
      height: '100%',
    },
    photoLink: {
      color: colors.accent,
      fontWeight: '700',
      fontSize: 15,
    },
    feedHeading: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: Space.sm,
    },
    post: {
      backgroundColor: colors.bg,
      paddingBottom: Space.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
      gap: Space.md,
    },
    postHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
    },
    postHeaderText: { flex: 1, gap: 2 },
    author: { fontSize: 15, fontWeight: '700', color: colors.title },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    boostBadge: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.accent,
      backgroundColor: colors.accentSoft,
      overflow: 'hidden',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      textTransform: 'uppercase',
    },
    metaLine: { fontSize: 12, color: colors.muted },
    menuBtn: { padding: 4 },
    body: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.text,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xxl,
      paddingTop: Space.xs,
    },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    actionCount: {
      color: colors.accent,
      fontWeight: '600',
      fontSize: 13,
    },
    comments: {
      gap: Space.sm,
      backgroundColor: colors.surface,
      borderRadius: Radius.md,
      padding: Space.md,
    },
    commentRow: { gap: 2 },
    commentAuthor: { fontWeight: '700', color: colors.title, fontSize: 13 },
    commentBody: { color: colors.text, fontSize: 13 },
    commentComposer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.sm,
    },
    commentInput: {
      flex: 1,
      backgroundColor: colors.bg,
      borderRadius: Radius.pill,
      paddingHorizontal: Space.md,
      paddingVertical: 8,
      color: colors.title,
    },
    commentSend: { color: colors.accent, fontWeight: '700' },
    composerBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'flex-end',
    },
    composerCard: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      padding: Space.xxl,
      gap: Space.lg,
      paddingBottom: 40,
    },
    composerTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.title,
    },
    composerInput: {
      minHeight: 100,
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      padding: Space.lg,
      color: colors.title,
      textAlignVertical: 'top',
      fontSize: 16,
    },
    composerActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: Space.lg,
    },
    cancelText: { color: colors.muted, fontWeight: '600', fontSize: 15 },
    publishBtn: {
      backgroundColor: colors.accent,
      borderRadius: Radius.pill,
      paddingHorizontal: Space.xl,
      paddingVertical: Space.md,
    },
    publishText: { color: '#fff', fontWeight: '800' },
    disabled: { opacity: 0.45 },
  });
}
