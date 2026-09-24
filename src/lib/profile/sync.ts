import type { MeshEvent } from '@/lib/crypto/events';

export type ProfileMediaOffer = {
  cid: string;
  size: number;
  mime: string;
  chunkSize: number;
  chunkCount: number;
};

type ProfileSyncHandler = (
  event: MeshEvent,
  mediaOffer?: ProfileMediaOffer | null,
) => Promise<void>;

let profileSyncHandler: ProfileSyncHandler | null = null;

export function registerProfileSync(
  handler: ProfileSyncHandler | null,
): void {
  profileSyncHandler = handler;
}

export async function broadcastProfileUpdate(
  event: MeshEvent,
  mediaOffer?: ProfileMediaOffer | null,
): Promise<void> {
  if (profileSyncHandler) {
    await profileSyncHandler(event, mediaOffer);
  }
}
