import {
  formatRecoveryKey,
  isValidRecoveryKey,
  normalizeRecoveryKey,
} from '@/lib/identity/store';

describe('recovery key helpers', () => {
  it('normalizes spaced and 0x-prefixed keys', () => {
    const raw = '0xABCD 1234 eeee ffff 0000 1111 2222 3333 4444 5555 6666 7777 8888 9999 aaaa bbbb';
    expect(normalizeRecoveryKey(raw)).toBe(
      'abcd1234eeeeffff0000111122223333444455556666777788889999aaaabbbb',
    );
  });

  it('validates 64 hex chars only', () => {
    expect(isValidRecoveryKey('aa'.repeat(32))).toBe(true);
    expect(isValidRecoveryKey('aa'.repeat(31))).toBe(false);
    expect(isValidRecoveryKey('zz'.repeat(32))).toBe(false);
  });

  it('formats into 4-char groups', () => {
    expect(formatRecoveryKey('abcd1234eeeeffff')).toBe('abcd 1234 eeee ffff');
  });
});
