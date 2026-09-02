/** Same emoji again means unlike (publish reaction.remove). */
export function shouldUnlike(
  currentEmoji: string | null | undefined,
  nextEmoji: string,
): boolean {
  return Boolean(currentEmoji) && currentEmoji === nextEmoji;
}
