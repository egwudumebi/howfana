import type { VideoPlayer } from 'expo-video';

/** Avoid native crashes when the player was already released. */
export function safePause(player: VideoPlayer | null | undefined): void {
  if (!player) return;
  try {
    player.pause();
  } catch {
    // released / invalid native handle
  }
}

export function safePlay(player: VideoPlayer | null | undefined): void {
  if (!player) return;
  try {
    player.play();
  } catch {
    // released / invalid native handle
  }
}
