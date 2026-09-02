/**
 * Perfect negotiation / glare: when both sides invite, the lower callId wins.
 * Returns 'keep-local' | 'adopt-remote' | 'ignore'.
 */
export function resolveCallGlare(
  localCallId: string,
  remoteCallId: string,
): 'keep-local' | 'adopt-remote' {
  return remoteCallId < localCallId ? 'adopt-remote' : 'keep-local';
}
