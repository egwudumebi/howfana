import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import QRCode from 'react-native-qrcode-svg';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppAlert } from '@/components/AppAlert';
import { Avatar } from '@/components/Avatar';
import { MediaGallery } from '@/components/MediaGallery';
import { SoftPressable } from '@/components/SoftPressable';
import { EMPTY_ABOUT, type ProfileAbout } from '@/lib/db/profiles';
import type { FeedPost } from '@/lib/db/social';
import { useIdentity } from '@/providers/IdentityProvider';
import { usePeers } from '@/providers/PeerProvider';
import { usePremium } from '@/providers/PremiumProvider';
import { useSocial } from '@/providers/SocialProvider';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';
import { Radius, Space } from '@/theme/spacing';

type ProfileTab = 'posts' | 'about' | 'media' | 'connections' | 'activity';

const ABOUT_FIELDS: {
  key: keyof ProfileAbout;
  label: string;
  placeholder: string;
  multiline?: boolean;
}[] = [
  { key: 'bio', label: 'About', placeholder: 'A short intro', multiline: true },
  { key: 'education', label: 'Education', placeholder: 'School, degree, year' },
  { key: 'dateOfBirth', label: 'Date of birth', placeholder: 'YYYY-MM-DD' },
  { key: 'stateOfOrigin', label: 'State of origin', placeholder: 'State / region' },
  { key: 'skills', label: 'Skills', placeholder: 'Design, farming, TypeScript…' },
  { key: 'jobs', label: 'Jobs', placeholder: 'Current or past roles' },
];

const TABS: {
  id: ProfileTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'posts', label: 'Posts', icon: 'grid-outline' },
  { id: 'about', label: 'About', icon: 'person-outline' },
  { id: 'media', label: 'Media', icon: 'images-outline' },
  { id: 'connections', label: 'Connections', icon: 'people-outline' },
  { id: 'activity', label: 'Activity', icon: 'pulse-outline' },
];

function profileHandle(name: string, publicKey: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 20);
  return slug ? `@${slug}` : `@${publicKey.slice(0, 8)}`;
}

function timeAgo(ts: number): string {
  const delta = Math.max(0, Date.now() - ts);
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function shortenKey(key: string): string {
  if (key.length <= 16) return key;
  return `${key.slice(0, 8)}…${key.slice(-8)}`;
}

function AboutChip({
  icon,
  title,
  value,
  colors,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.aboutChip}>
      <View style={[styles.aboutChipIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <Text style={styles.aboutChipTitle}>{title}</Text>
      <Text style={styles.aboutChipValue} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

function ProfilePostCard({
  post,
  pinned,
  name,
  avatarUri,
  publicKey,
  colors,
  styles,
}: {
  post: FeedPost;
  pinned?: boolean;
  name: string;
  avatarUri: string | null;
  publicKey: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const likeCount = Object.values(post.reactionCounts).reduce((a, b) => a + b, 0);

  return (
    <View style={styles.postCard}>
      {pinned ? (
        <View style={styles.pinnedLabel}>
          <Ionicons name="pin" size={14} color={colors.accent} />
          <Text style={styles.pinnedLabelText}>Pinned post</Text>
        </View>
      ) : null}
      <View style={styles.postHeader}>
        <Avatar name={name} uri={avatarUri} seed={publicKey} size={40} />
        <View style={styles.postHeaderText}>
          <Text style={styles.postAuthor}>{post.authorName || name}</Text>
          <Text style={styles.postMeta}>
            {timeAgo(post.createdAt)} · Howfana
          </Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
      </View>
      {post.body ? <Text style={styles.postBody}>{post.body}</Text> : null}
      {post.media.length > 0 ? (
        <MediaGallery media={post.media} layout={post.mediaLayout} />
      ) : null}
      <View style={styles.postActions}>
        <View style={styles.postActionLeft}>
          <Ionicons
            name={post.myReaction ? 'heart' : 'heart-outline'}
            size={20}
            color={post.myReaction ? colors.like : colors.accent}
          />
          {likeCount > 0 ? (
            <Text style={styles.postActionCount}>{likeCount}</Text>
          ) : null}
          <Ionicons
            name="chatbubble-outline"
            size={18}
            color={colors.accent}
            style={styles.postActionIconGap}
          />
          {post.commentCount > 0 ? (
            <Text style={styles.postActionCount}>{post.commentCount}</Text>
          ) : null}
          <Ionicons
            name="paper-plane-outline"
            size={18}
            color={colors.accent}
            style={styles.postActionIconGap}
          />
        </View>
        <Ionicons name="bookmark-outline" size={18} color={colors.accent} />
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { alert } = useAppAlert();
  const { ready, publicKey, profile, error, saveProfile, refresh, recoveryKeyFormatted } =
    useIdentity();
  const { posts } = useSocial();
  const { pinnedPostIds, isPremium } = usePremium();
  const { connectedKeys, sessions } = usePeers();

  const [displayName, setDisplayName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [about, setAbout] = useState<ProfileAbout>({ ...EMPTY_ABOUT });
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingAbout, setEditingAbout] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;
    if (!hydrated) {
      setDisplayName(profile.displayName);
      setAvatarUri(profile.avatarUri);
      setAbout(profile.about ?? { ...EMPTY_ABOUT });
      setHydrated(true);
      return;
    }
    if (!editingAbout) {
      setAbout(profile.about ?? { ...EMPTY_ABOUT });
    }
  }, [profile, hydrated, editingAbout]);

  const myPosts = useMemo(
    () => (publicKey ? posts.filter((p) => p.author === publicKey) : []),
    [posts, publicKey],
  );
  const pinnedPosts = useMemo(
    () => myPosts.filter((p) => pinnedPostIds.includes(p.id)),
    [myPosts, pinnedPostIds],
  );
  const mediaPosts = useMemo(
    () => myPosts.filter((p) => p.media.length > 0),
    [myPosts],
  );
  const connectedSessions = useMemo(
    () =>
      sessions.filter(
        (s) => s.status === 'connected' && connectedKeys.includes(s.publicKey),
      ),
    [sessions, connectedKeys],
  );

  if (!ready) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (error || !publicKey || !profile) {
    return (
      <View style={styles.centered}>
        <Ionicons name="warning-outline" size={40} color={colors.danger} />
        <Text style={styles.error}>{error ?? 'Identity unavailable'}</Text>
        <Pressable style={styles.primaryBtn} onPress={() => void refresh()}>
          <Text style={styles.primaryBtnText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const name = profile.displayName || displayName || 'Your profile';
  const handle = profileHandle(name, publicKey);
  const bio =
    profile.about?.bio?.trim() ||
    'Add a short bio so people nearby know what you do.';
  const location = profile.about?.stateOfOrigin?.trim() || 'Add location';
  const workStatus = profile.about?.jobs?.trim() || 'Open to work';
  const connectionCount = connectedKeys.length;

  const qrPayload = JSON.stringify({
    v: 1,
    pk: publicKey,
    name: profile.displayName || displayName.trim() || null,
  });

  const onPickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      alert('Permission needed', 'Allow photo library access to set an avatar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setAvatarUri(result.assets[0].uri);
      setEditing(true);
    }
  };

  const onSave = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      alert('Display name required', 'Choose a name others will see nearby.');
      return;
    }
    setSaving(true);
    try {
      await saveProfile({ displayName: trimmed, avatarUri });
      setEditing(false);
      alert('Saved', 'Your profile was updated on this device.');
    } catch (err) {
      alert('Save failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const onSaveAbout = async () => {
    setSaving(true);
    try {
      await saveProfile({
        about: {
          bio: about.bio.trim(),
          education: about.education.trim(),
          dateOfBirth: about.dateOfBirth.trim(),
          stateOfOrigin: about.stateOfOrigin.trim(),
          skills: about.skills.trim(),
          jobs: about.jobs.trim(),
        },
      });
      setEditingAbout(false);
      alert('Saved', 'Your About details were updated.');
    } catch (err) {
      alert('Save failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const onShareProfile = async () => {
    try {
      await Share.share({
        message: `${name} on Howfana\n${handle}\n${bio}\n\nIdentity: ${shortenKey(publicKey)}`,
      });
    } catch {
      // user dismissed
    }
  };

  const openMenu = () => {
    alert('Profile', undefined, [
      { text: 'Settings', onPress: () => router.push('/settings' as Href) },
      { text: 'Identity QR', onPress: () => setQrOpen(true) },
      {
        text: 'Public key',
        onPress: () =>
          alert('Public key', publicKey, [{ text: 'OK', style: 'default' }]),
      },
      ...(recoveryKeyFormatted
        ? [
            {
              text: 'Recovery key',
              onPress: () =>
                alert('Recovery key', recoveryKeyFormatted, [
                  { text: 'OK', style: 'default' },
                ]),
            },
          ]
        : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const aboutChips = [
    {
      icon: 'school-outline' as const,
      title: 'Education',
      value: profile.about?.education?.trim() || 'Add education',
    },
    {
      icon: 'briefcase-outline' as const,
      title: 'Work',
      value: profile.about?.jobs?.trim() || 'Add work history',
    },
    {
      icon: 'sparkles-outline' as const,
      title: 'Skills',
      value: profile.about?.skills?.trim() || 'Add skills',
    },
    {
      icon: 'heart-outline' as const,
      title: 'Interests',
      value: profile.about?.dateOfBirth?.trim()
        ? `Born ${profile.about.dateOfBirth.trim()}`
        : 'Add interests in About',
    },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'about':
        return (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>About me</Text>
              <Pressable onPress={() => setEditingAbout((v) => !v)} hitSlop={8}>
                <Text style={styles.sectionLink}>
                  {editingAbout ? 'Cancel' : 'Edit'}
                </Text>
              </Pressable>
            </View>
            {editingAbout ? (
              <View style={styles.aboutForm}>
                {ABOUT_FIELDS.map((field) => (
                  <View key={field.key} style={styles.aboutField}>
                    <Text style={styles.fieldLabel}>{field.label}</Text>
                    <TextInput
                      value={about[field.key]}
                      onChangeText={(text) =>
                        setAbout((prev) => ({ ...prev, [field.key]: text }))
                      }
                      placeholder={field.placeholder}
                      placeholderTextColor={colors.muted}
                      style={[styles.input, field.multiline && styles.inputMulti]}
                      multiline={field.multiline}
                      maxLength={field.key === 'bio' ? 280 : 120}
                    />
                  </View>
                ))}
                <Pressable
                  onPress={onSaveAbout}
                  disabled={saving}
                  style={[styles.primaryBtn, saving && styles.disabled]}
                >
                  <Text style={styles.primaryBtnText}>
                    {saving ? 'Saving…' : 'Save About'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={styles.aboutParagraph}>{bio}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.aboutChipRow}
                >
                  {aboutChips.map((chip) => (
                    <AboutChip key={chip.title} {...chip} colors={colors} styles={styles} />
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        );
      case 'media':
        return mediaPosts.length > 0 ? (
          mediaPosts.map((post) => (
            <ProfilePostCard
              key={post.id}
              post={post}
              name={name}
              avatarUri={avatarUri}
              publicKey={publicKey}
              colors={colors}
              styles={styles}
            />
          ))
        ) : (
          <Text style={styles.emptyTab}>No media posts yet.</Text>
        );
      case 'connections':
        return connectedSessions.length > 0 ? (
          connectedSessions.map((session) => (
            <View key={session.publicKey} style={styles.connectionRow}>
              <Avatar
                name={session.displayName}
                seed={session.publicKey}
                size={44}
              />
              <View style={styles.connectionText}>
                <Text style={styles.connectionName}>{session.displayName}</Text>
                <Text style={styles.connectionMeta}>Connected · Howfana</Text>
              </View>
              <View style={styles.onlineDot} />
            </View>
          ))
        ) : (
          <Text style={styles.emptyTab}>
            No active connections. Say hello on the feed or find people nearby.
          </Text>
        );
      case 'activity':
        return myPosts.length > 0 ? (
          myPosts.slice(0, 8).map((post) => (
            <View key={post.id} style={styles.activityRow}>
              <Ionicons name="radio-button-on" size={10} color={colors.accent} />
              <View style={styles.activityText}>
                <Text style={styles.activityTitle}>Posted to Howfana</Text>
                <Text style={styles.activityMeta} numberOfLines={2}>
                  {post.body || 'Shared media'} · {timeAgo(post.createdAt)}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyTab}>No activity yet.</Text>
        );
      case 'posts':
      default:
        return (
          <>
            {pinnedPosts.map((post) => (
              <ProfilePostCard
                key={post.id}
                post={post}
                pinned
                name={name}
                avatarUri={avatarUri}
                publicKey={publicKey}
                colors={colors}
                styles={styles}
              />
            ))}
            {myPosts
              .filter((p) => !pinnedPostIds.includes(p.id))
              .map((post) => (
                <ProfilePostCard
                  key={post.id}
                  post={post}
                  name={name}
                  avatarUri={avatarUri}
                  publicKey={publicKey}
                  colors={colors}
                  styles={styles}
                />
              ))}
            {myPosts.length === 0 ? (
              <Text style={styles.emptyTab}>
                No posts yet. Share something from the home feed.
              </Text>
            ) : null}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>About me</Text>
                <Pressable onPress={() => setActiveTab('about')} hitSlop={8}>
                  <Text style={styles.sectionLink}>View all</Text>
                </Pressable>
              </View>
              <Text style={styles.aboutParagraph} numberOfLines={3}>
                {bio}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.aboutChipRow}
              >
                {aboutChips.map((chip) => (
                  <AboutChip key={chip.title} {...chip} colors={colors} styles={styles} />
                ))}
              </ScrollView>
            </View>
          </>
        );
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cover}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.coverImage} blurRadius={18} />
          ) : null}
          <View style={styles.coverOverlay} />
          <View style={styles.coverActions}>
            <View style={styles.coverSpacer} />
            <View style={styles.coverActionsRight}>
              <SoftPressable style={styles.coverIconBtn} onPress={onShareProfile}>
                <Ionicons name="share-outline" size={20} color="#fff" />
              </SoftPressable>
              <SoftPressable style={styles.coverIconBtn} onPress={openMenu}>
                <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
              </SoftPressable>
            </View>
          </View>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.heroRow}>
            <Pressable style={styles.avatarWrap} onPress={onPickAvatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
              ) : (
                <Avatar name={name} seed={publicKey} size={108} />
              )}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={14} color={colors.text} />
              </View>
            </Pressable>

            <View style={styles.heroMain}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={2}>
                  {name}
                </Text>
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark" size={12} color="#fff" />
                </View>
              </View>
              <Text style={styles.handle}>{handle}</Text>
              <View style={styles.memberBadge}>
                <Text style={styles.memberBadgeText}>
                  {isPremium ? 'Howfana Premium' : 'Howfana Member'}
                </Text>
              </View>
              <Text style={styles.heroBio} numberOfLines={3}>
                {bio}
              </Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons name="location-outline" size={16} color={colors.accent} />
              <Text style={styles.statText} numberOfLines={1}>
                {location}
              </Text>
            </View>
            <View style={styles.stat}>
              <Ionicons name="briefcase-outline" size={16} color={colors.accent} />
              <Text style={styles.statText} numberOfLines={1}>
                {workStatus}
              </Text>
            </View>
            <View style={styles.stat}>
              <Ionicons name="people-outline" size={16} color={colors.accent} />
              <Text style={styles.statText}>{connectionCount} Connections</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => setEditing((v) => !v)}
            >
              <Ionicons name="create-outline" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>
                {editing ? 'Cancel' : 'Edit profile'}
              </Text>
            </Pressable>
            <Pressable style={styles.outlineBtn} onPress={onShareProfile}>
              <Ionicons name="share-social-outline" size={16} color={colors.accent} />
              <Text style={styles.outlineBtnText}>Share profile</Text>
            </Pressable>
          </View>

          {editing ? (
            <View style={styles.editCard}>
              <Text style={styles.fieldLabel}>Display name</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoCapitalize="words"
                maxLength={40}
              />
              <Pressable
                onPress={onSave}
                disabled={saving}
                style={[styles.primaryBtn, saving && styles.disabled]}
              >
                <Text style={styles.primaryBtnText}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                style={[styles.tabItem, active && styles.tabItemActive]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Ionicons
                  name={tab.icon}
                  size={18}
                  color={active ? colors.accent : colors.muted}
                />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.tabContent}>{renderTabContent()}</View>
      </ScrollView>

      <Modal visible={qrOpen} transparent animationType="fade" onRequestClose={() => setQrOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setQrOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>Identity QR</Text>
            <Text style={styles.modalSub}>Share offline for friend verification</Text>
            <QRCode
              value={qrPayload}
              size={200}
              backgroundColor={colors.chrome}
              color={colors.text}
              ecl="H"
              logo={require('../../../assets/brand/howfana-app-icon.png')}
              logoSize={48}
              logoBackgroundColor={colors.chrome}
              logoMargin={4}
              logoBorderRadius={10}
            />
            <Pressable style={styles.primaryBtn} onPress={() => setQrOpen(false)}>
              <Text style={styles.primaryBtnText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
      padding: 24,
      gap: 12,
    },
    container: {
      paddingBottom: 48,
    },
    cover: {
      height: 132,
      backgroundColor: colors.cover,
      overflow: 'hidden',
    },
    coverImage: {
      ...StyleSheet.absoluteFillObject,
      opacity: 0.55,
    },
    coverOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(90, 42, 24, 0.35)',
    },
    coverActions: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: Space.lg,
      paddingTop: Space.sm,
    },
    coverSpacer: { width: 40 },
    coverActionsRight: {
      flexDirection: 'row',
      gap: Space.sm,
    },
    coverIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(0,0,0,0.22)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileCard: {
      marginTop: -28,
      marginHorizontal: Space.lg,
      backgroundColor: colors.chrome,
      borderRadius: Radius.card,
      padding: Space.lg,
      gap: Space.md,
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    heroRow: {
      flexDirection: 'row',
      gap: Space.md,
      alignItems: 'flex-start',
    },
    avatarWrap: {
      marginTop: -52,
      borderRadius: 58,
      borderWidth: 4,
      borderColor: colors.chrome,
    },
    avatarImg: {
      width: 108,
      height: 108,
      borderRadius: 54,
      backgroundColor: colors.divider,
    },
    cameraBadge: {
      position: 'absolute',
      right: 2,
      bottom: 2,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    heroMain: {
      flex: 1,
      gap: 4,
      paddingTop: 2,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
    },
    name: {
      flexShrink: 1,
      fontSize: 22,
      fontWeight: '800',
      color: colors.title,
      letterSpacing: -0.3,
    },
    verifiedBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    handle: {
      fontSize: 14,
      color: colors.muted,
      fontWeight: '500',
    },
    memberBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.accentSoft,
      borderRadius: Radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginTop: 2,
    },
    memberBadgeText: {
      color: colors.accent,
      fontSize: 11,
      fontWeight: '700',
    },
    heroBio: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.text,
      marginTop: 4,
    },
    statsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
    },
    stat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      maxWidth: '100%',
    },
    statText: {
      fontSize: 12,
      color: colors.muted,
      flexShrink: 1,
    },
    actionRow: {
      flexDirection: 'row',
      gap: Space.sm,
    },
    primaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.accent,
      borderRadius: Radius.md,
      paddingVertical: 11,
    },
    primaryBtnText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 14,
    },
    outlineBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1.5,
      borderColor: colors.accent,
      borderRadius: Radius.md,
      paddingVertical: 11,
      backgroundColor: colors.chrome,
    },
    outlineBtnText: {
      color: colors.accent,
      fontWeight: '700',
      fontSize: 14,
    },
    editCard: {
      gap: Space.sm,
      paddingTop: Space.sm,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: Radius.sm,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
    },
    inputMulti: {
      minHeight: 88,
      textAlignVertical: 'top',
    },
    tabRow: {
      paddingHorizontal: Space.lg,
      paddingTop: Space.lg,
      paddingBottom: Space.sm,
      gap: Space.lg,
    },
    tabItem: {
      alignItems: 'center',
      gap: 4,
      paddingBottom: 8,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
      minWidth: 64,
    },
    tabItemActive: {
      borderBottomColor: colors.accent,
    },
    tabLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.muted,
    },
    tabLabelActive: {
      color: colors.accent,
    },
    tabContent: {
      paddingHorizontal: Space.lg,
      gap: Space.md,
    },
    sectionCard: {
      backgroundColor: colors.chrome,
      borderRadius: Radius.card,
      padding: Space.lg,
      gap: Space.md,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.title,
    },
    sectionLink: {
      color: colors.accent,
      fontWeight: '700',
      fontSize: 13,
    },
    aboutParagraph: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.text,
    },
    aboutChipRow: {
      gap: Space.sm,
      paddingRight: Space.lg,
    },
    aboutChip: {
      width: 156,
      backgroundColor: colors.surface,
      borderRadius: Radius.md,
      padding: Space.md,
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    aboutChipIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    aboutChipTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.title,
    },
    aboutChipValue: {
      fontSize: 12,
      lineHeight: 17,
      color: colors.muted,
    },
    aboutForm: {
      gap: Space.sm,
    },
    aboutField: {
      gap: 6,
    },
    postCard: {
      backgroundColor: colors.chrome,
      borderRadius: Radius.card,
      padding: Space.lg,
      gap: Space.md,
    },
    pinnedLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    pinnedLabelText: {
      color: colors.accent,
      fontWeight: '700',
      fontSize: 13,
    },
    postHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    postHeaderText: {
      flex: 1,
      gap: 2,
    },
    postAuthor: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.title,
    },
    postMeta: {
      fontSize: 12,
      color: colors.muted,
    },
    postBody: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.text,
    },
    postActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    postActionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    postActionIconGap: {
      marginLeft: Space.lg,
    },
    postActionCount: {
      marginLeft: 4,
      fontSize: 13,
      color: colors.muted,
      fontWeight: '600',
    },
    connectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      backgroundColor: colors.chrome,
      borderRadius: Radius.md,
      padding: Space.md,
    },
    connectionText: {
      flex: 1,
      gap: 2,
    },
    connectionName: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.title,
    },
    connectionMeta: {
      fontSize: 12,
      color: colors.muted,
    },
    onlineDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.online,
    },
    activityRow: {
      flexDirection: 'row',
      gap: Space.md,
      backgroundColor: colors.chrome,
      borderRadius: Radius.md,
      padding: Space.md,
      alignItems: 'flex-start',
    },
    activityText: {
      flex: 1,
      gap: 2,
    },
    activityTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.title,
    },
    activityMeta: {
      fontSize: 13,
      color: colors.muted,
      lineHeight: 18,
    },
    emptyTab: {
      textAlign: 'center',
      color: colors.muted,
      fontSize: 14,
      lineHeight: 21,
      paddingVertical: Space.xl,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: Space.xl,
    },
    modalCard: {
      width: '100%',
      maxWidth: 320,
      backgroundColor: colors.chrome,
      borderRadius: Radius.card,
      padding: Space.xl,
      alignItems: 'center',
      gap: Space.md,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.title,
    },
    modalSub: {
      fontSize: 13,
      color: colors.muted,
      textAlign: 'center',
    },
    error: {
      color: colors.danger,
      textAlign: 'center',
      fontSize: 16,
    },
    disabled: {
      opacity: 0.55,
    },
  });
}
