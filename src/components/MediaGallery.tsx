import { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { FeedMediaItem } from '@/lib/db/social';
import type { MediaLayout } from '@/lib/social/mediaLayout';
import { useColors } from '@/providers/ThemeProvider';

const SCREEN_W = Dimensions.get('window').width;

function MediaTile({
  item,
  style,
  accent,
}: {
  item: FeedMediaItem;
  style: object;
  accent: string;
}) {
  if (item.status === 'complete' && item.uri) {
    return <Image source={{ uri: item.uri }} style={style} />;
  }
  return (
    <View style={[style, styles.placeholder]}>
      <ActivityIndicator color={accent} />
    </View>
  );
}

export function MediaGallery({
  media,
  layout = 'carousel',
  width = SCREEN_W,
}: {
  media: FeedMediaItem[];
  layout?: MediaLayout;
  width?: number;
}) {
  const colors = useColors();
  const [page, setPage] = useState(0);
  const gap = 2;

  if (media.length === 0) return null;

  if (media.length === 1 || layout === 'carousel') {
    if (media.length === 1) {
      return (
        <MediaTile
          item={media[0]}
          accent={colors.accent}
          style={{ width, height: 280, backgroundColor: colors.divider }}
        />
      );
    }
    return (
      <View>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            setPage(Math.round(e.nativeEvent.contentOffset.x / width));
          }}
        >
          {media.map((item) => (
            <MediaTile
              key={item.cid}
              item={item}
              accent={colors.accent}
              style={{ width, height: 280, backgroundColor: colors.divider }}
            />
          ))}
        </ScrollView>
        <View style={styles.dots}>
          {media.map((item, i) => (
            <View
              key={item.cid}
              style={[
                styles.dot,
                { backgroundColor: colors.iconInactive },
                i === page && { backgroundColor: colors.accent },
              ]}
            />
          ))}
        </View>
      </View>
    );
  }

  if (layout === 'spotlight') {
    const [hero, ...rest] = media;
    const thumbH = 96;
    const heroH = 220;
    return (
      <View style={{ width, gap }}>
        <MediaTile
          item={hero}
          accent={colors.accent}
          style={{ width, height: heroH, backgroundColor: colors.divider }}
        />
        {rest.length > 0 ? (
          <View style={{ flexDirection: 'row', gap }}>
            {rest.map((item) => (
              <MediaTile
                key={item.cid}
                item={item}
                accent={colors.accent}
                style={{
                  flex: 1,
                  height: thumbH,
                  backgroundColor: colors.divider,
                }}
              />
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  // grid
  const count = media.length;
  if (count === 2) {
    const cellW = (width - gap) / 2;
    return (
      <View style={{ flexDirection: 'row', gap, width }}>
        {media.map((item) => (
          <MediaTile
            key={item.cid}
            item={item}
            accent={colors.accent}
            style={{
              width: cellW,
              height: 220,
              backgroundColor: colors.divider,
            }}
          />
        ))}
      </View>
    );
  }

  if (count === 3) {
    const sideW = (width - gap) / 2;
    return (
      <View style={{ flexDirection: 'row', gap, width, height: 280 }}>
        <MediaTile
          item={media[0]}
          accent={colors.accent}
          style={{
            width: sideW,
            height: 280,
            backgroundColor: colors.divider,
          }}
        />
        <View style={{ width: sideW, gap }}>
          <MediaTile
            item={media[1]}
            accent={colors.accent}
            style={{
              width: sideW,
              height: (280 - gap) / 2,
              backgroundColor: colors.divider,
            }}
          />
          <MediaTile
            item={media[2]}
            accent={colors.accent}
            style={{
              width: sideW,
              height: (280 - gap) / 2,
              backgroundColor: colors.divider,
            }}
          />
        </View>
      </View>
    );
  }

  // 4+ → 2x2
  const cellW = (width - gap) / 2;
  const cellH = 140;
  return (
    <View style={{ width, gap }}>
      <View style={{ flexDirection: 'row', gap }}>
        {media.slice(0, 2).map((item) => (
          <MediaTile
            key={item.cid}
            item={item}
            accent={colors.accent}
            style={{
              width: cellW,
              height: cellH,
              backgroundColor: colors.divider,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap }}>
        {media.slice(2, 4).map((item) => (
          <MediaTile
            key={item.cid}
            item={item}
            accent={colors.accent}
            style={{
              width: cellW,
              height: cellH,
              backgroundColor: colors.divider,
            }}
          />
        ))}
      </View>
      {media.length > 4 ? (
        <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 12 }}>
          +{media.length - 4} more
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
