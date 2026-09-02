import {
  isPhotoMessageBody,
  parsePhotoMessageBody,
  photoMessageBody,
} from '@/lib/messaging/mediaBody';

describe('chat photo message bodies', () => {
  it('round-trips a photo cid', () => {
    const cid = 'abc123';
    const body = photoMessageBody(cid);
    expect(isPhotoMessageBody(body)).toBe(true);
    expect(parsePhotoMessageBody(body)).toBe(cid);
  });

  it('ignores normal text', () => {
    expect(isPhotoMessageBody('hello')).toBe(false);
    expect(parsePhotoMessageBody('hello')).toBeNull();
  });
});
