import type { Frame } from '@/lib/net/types';
import { isCallFrame } from '@/lib/net/types';

describe('call frames', () => {
  it('detects call signaling frame types', () => {
    const invite: Frame = {
      type: 'call_invite',
      callId: 'c1',
      from: 'a',
      to: 'b',
      kind: 'audio',
    };
    expect(isCallFrame(invite)).toBe(true);
    expect(
      isCallFrame({ type: 'ping', ts: 1 }),
    ).toBe(false);
  });
});
