import * as Crypto from 'expo-crypto';

export function randomCallId(): string {
  return Crypto.randomUUID();
}
