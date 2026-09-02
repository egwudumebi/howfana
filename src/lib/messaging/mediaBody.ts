const PHOTO_PREFIX = 'howfana:photo:';

export function photoMessageBody(cid: string): string {
  return `${PHOTO_PREFIX}${cid}`;
}

export function parsePhotoMessageBody(body: string): string | null {
  if (!body.startsWith(PHOTO_PREFIX)) return null;
  const cid = body.slice(PHOTO_PREFIX.length).trim();
  return cid.length > 0 ? cid : null;
}

export function isPhotoMessageBody(body: string): boolean {
  return parsePhotoMessageBody(body) != null;
}
