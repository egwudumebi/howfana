/** Max images attached to a single post.create */
export const MAX_POST_MEDIA = 4;

export type PostMediaItem = {
  cid: string;
  mime: string;
  size: number;
};

/**
 * Normalize post.create media from either legacy scalar fields or a `media` array.
 * Old payloads with only mediaCid become a one-item list.
 */
export function normalizePostMedia(payload: {
  media?: unknown;
  mediaCid?: string | null;
  mediaMime?: string | null;
  mediaSize?: number | null;
}): PostMediaItem[] {
  if (Array.isArray(payload.media)) {
    const items: PostMediaItem[] = [];
    for (const raw of payload.media) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      if (typeof item.cid !== 'string' || !item.cid) continue;
      items.push({
        cid: item.cid,
        mime: typeof item.mime === 'string' ? item.mime : 'image/jpeg',
        size: typeof item.size === 'number' ? item.size : 0,
      });
      if (items.length >= MAX_POST_MEDIA) break;
    }
    return items;
  }

  if (typeof payload.mediaCid === 'string' && payload.mediaCid) {
    return [
      {
        cid: payload.mediaCid,
        mime:
          typeof payload.mediaMime === 'string'
            ? payload.mediaMime
            : 'image/jpeg',
        size: typeof payload.mediaSize === 'number' ? payload.mediaSize : 0,
      },
    ];
  }

  return [];
}

export function mediaJsonString(items: PostMediaItem[]): string | null {
  if (items.length === 0) return null;
  return JSON.stringify(items);
}

export function parseMediaJson(raw: string | null | undefined): PostMediaItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizePostMedia({ media: parsed });
  } catch {
    return [];
  }
}
