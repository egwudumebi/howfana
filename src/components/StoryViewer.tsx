import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import type { StoryRing } from '@/lib/db/stories';
import { useColors } from '@/providers/ThemeProvider';
import type { ThemeColors } from '@/theme/colors';
import { Space } from '@/theme/spacing';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const STORY_MS = 5000;

type StoryViewerProps = {
  rings: StoryRing[];
  startAuthor: string;
  visible: boolean;
  onClose: () => void;
  onViewed: (storyIds: string[]) => void;
};

export function StoryViewer({
  rings,
  startAuthor,
  visible,
  onClose,
  onViewed,
}: StoryViewerProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const startIndex = Math.max(
    0,
    rings.findIndex((r) => r.author === startAuthor),
  );
  const [ringIndex, setRingIndex] = useState(startIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const viewedRef = useRef(new Set<string>());
  const ringIndexRef = useRef(ringIndex);
  const storyIndexRef = useRef(storyIndex);
  const ringsRef = useRef(rings);
  const onCloseRef = useRef(onClose);
  const onViewedRef = useRef(onViewed);

  ringIndexRef.current = ringIndex;
  storyIndexRef.current = storyIndex;
  ringsRef.current = rings;
  onCloseRef.current = onClose;
  onViewedRef.current = onViewed;

  const ring = rings[ringIndex];
  const story = ring?.stories[storyIndex];

  const flushViewed = () => {
    const ids = [...viewedRef.current];
    if (ids.length) onViewedRef.current(ids);
  };

  const close = () => {
    flushViewed();
    onCloseRef.current();
  };

  const goNext = () => {
    const ri = ringIndexRef.current;
    const si = storyIndexRef.current;
    const list = ringsRef.current;
    const current = list[ri];
    if (!current) {
      close();
      return;
    }
    if (si < current.stories.length - 1) {
      setStoryIndex(si + 1);
      return;
    }
    if (ri < list.length - 1) {
      setRingIndex(ri + 1);
      setStoryIndex(0);
      return;
    }
    close();
  };

  const goPrev = () => {
    const ri = ringIndexRef.current;
    const si = storyIndexRef.current;
    const list = ringsRef.current;
    if (si > 0) {
      setStoryIndex(si - 1);
      return;
    }
    if (ri > 0) {
      const prev = list[ri - 1]!;
      setRingIndex(ri - 1);
      setStoryIndex(Math.max(0, prev.stories.length - 1));
      return;
    }
    setProgress(0);
  };

  useEffect(() => {
    if (!visible) return;
    setRingIndex(startIndex);
    setStoryIndex(0);
    setProgress(0);
    viewedRef.current = new Set();
  }, [visible, startIndex, startAuthor]);

  useEffect(() => {
    if (!visible || !story) return;

    viewedRef.current.add(story.id);
    setProgress(0);
    const started = Date.now();

    const timer = setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / STORY_MS);
      setProgress(p);
      if (p >= 1) {
        clearInterval(timer);
        goNext();
      }
    }, 50);

    return () => clearInterval(timer);
  }, [visible, story?.id]);

  if (!visible || !ring || !story) return null;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={close}>
      <View style={styles.root}>
        {story.mediaUri ? (
          <Image
            source={{ uri: story.mediaUri }}
            style={styles.media}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.textBackdrop}>
            <Text style={styles.textBody}>{story.body || '…'}</Text>
          </View>
        )}

        <SafeAreaView style={styles.overlay} edges={['top']}>
          <View style={styles.progressRow}>
            {ring.stories.map((s, i) => (
              <View key={s.id} style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width:
                        i < storyIndex
                          ? '100%'
                          : i === storyIndex
                            ? `${Math.round(progress * 100)}%`
                            : '0%',
                    },
                  ]}
                />
              </View>
            ))}
          </View>

          <View style={styles.header}>
            <Avatar
              name={ring.authorName}
              uri={ring.authorAvatarUri}
              seed={ring.author}
              size={36}
            />
            <Text style={styles.name}>{ring.authorName}</Text>
            <Pressable onPress={close} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </View>

          {story.body && story.mediaUri ? (
            <Text style={styles.caption}>{story.body}</Text>
          ) : null}
        </SafeAreaView>

        <View style={styles.tapZones}>
          <Pressable style={styles.tapLeft} onPress={goPrev} />
          <Pressable style={styles.tapRight} onPress={goNext} />
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: '#000',
      width: SCREEN_W,
      height: SCREEN_H,
    },
    media: {
      ...StyleSheet.absoluteFill,
      width: SCREEN_W,
      height: SCREEN_H,
    },
    textBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.xxl,
    },
    textBody: {
      color: '#fff',
      fontSize: 28,
      fontWeight: '800',
      textAlign: 'center',
      lineHeight: 36,
    },
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 2,
      paddingHorizontal: Space.md,
      gap: Space.md,
    },
    progressRow: {
      flexDirection: 'row',
      gap: 4,
      marginTop: 4,
    },
    progressTrack: {
      flex: 1,
      height: 3,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.35)',
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: '#fff',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    name: {
      flex: 1,
      color: '#fff',
      fontWeight: '700',
      fontSize: 15,
    },
    closeBtn: { padding: 4 },
    caption: {
      color: '#fff',
      fontSize: 15,
      marginTop: Space.sm,
      textShadowColor: 'rgba(0,0,0,0.5)',
      textShadowRadius: 4,
    },
    tapZones: {
      ...StyleSheet.absoluteFill,
      flexDirection: 'row',
      zIndex: 1,
    },
    tapLeft: { flex: 1 },
    tapRight: { flex: 1 },
  });
}
