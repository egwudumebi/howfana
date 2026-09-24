import type { TextStyle } from 'react-native';

/** Scale story caption text so long posts stay readable on screen. */
export function storyTextStyle(body: string): TextStyle {
  const len = body.trim().length;
  if (len <= 60) {
    return { fontSize: 22, lineHeight: 28, fontWeight: '600' };
  }
  if (len <= 140) {
    return { fontSize: 18, lineHeight: 24, fontWeight: '600' };
  }
  return { fontSize: 15, lineHeight: 22, fontWeight: '500' };
}
