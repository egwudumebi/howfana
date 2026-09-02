import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type SoftPressableProps = PressableProps & {
  style?: StyleProp<ViewStyle>;
};

/** Light tap feedback (opacity + slight scale) — Instagram/WhatsApp feel. */
export function SoftPressable({ style, disabled, ...rest }: SoftPressableProps) {
  return (
    <Pressable
      disabled={disabled}
      style={({ pressed }) => [
        style,
        pressed && !disabled ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : null,
      ]}
      {...rest}
    />
  );
}
