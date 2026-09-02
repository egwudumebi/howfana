export const MEDIA_LAYOUTS = ['carousel', 'grid', 'spotlight'] as const;
export type MediaLayout = (typeof MEDIA_LAYOUTS)[number];

export function normalizeMediaLayout(
  value: unknown,
  mediaCount: number,
): MediaLayout {
  if (mediaCount < 2) return 'carousel';
  if (value === 'grid' || value === 'spotlight' || value === 'carousel') {
    return value;
  }
  return 'carousel';
}

export function layoutOptionsForCount(
  count: number,
): { id: MediaLayout; label: string; hint: string }[] {
  if (count < 2) return [];
  return [
    { id: 'carousel', label: 'Swipe', hint: 'One at a time' },
    { id: 'grid', label: 'Grid', hint: 'Equal tiles' },
    { id: 'spotlight', label: 'Spotlight', hint: 'Hero + thumbs' },
  ];
}
