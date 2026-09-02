import { Image, type StyleProp, type ViewStyle, View } from 'react-native';

type MarkVariant = 'color' | 'mono' | 'monoInverse';

const MARK = require('../../assets/brand/howfana-mark.png');

/**
 * Howfana brand mark — handshake “H”.
 * `mono` / `monoInverse` keep the color artwork (final logo is a single terracotta mark).
 */
export function HowfanaMark({
  size = 32,
  variant: _variant = 'color',
  style,
}: {
  size?: number;
  variant?: MarkVariant;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ width: size, height: size }, style]}>
      <Image
        source={MARK}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel="Howfana"
      />
    </View>
  );
}

/** @deprecated Use HowfanaMark */
export const MeshyMark = HowfanaMark;
