import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { SECRET_KEY_STORAGE_KEY } from '@/lib/constants';
import {
  generateKeyPair,
  publicKeyFromSecret,
  type KeyPair,
} from '@/lib/crypto/identity';

const webMemoryFallback = new Map<string, string>();

async function setSecret(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(SECRET_KEY_STORAGE_KEY, value);
    } catch {
      webMemoryFallback.set(SECRET_KEY_STORAGE_KEY, value);
    }
    return;
  }
  await SecureStore.setItemAsync(SECRET_KEY_STORAGE_KEY, value);
}

async function getSecret(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(SECRET_KEY_STORAGE_KEY) ?? null;
    } catch {
      return webMemoryFallback.get(SECRET_KEY_STORAGE_KEY) ?? null;
    }
  }
  return SecureStore.getItemAsync(SECRET_KEY_STORAGE_KEY);
}

async function clearSecret(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(SECRET_KEY_STORAGE_KEY);
    } catch {
      webMemoryFallback.delete(SECRET_KEY_STORAGE_KEY);
    }
    return;
  }
  await SecureStore.deleteItemAsync(SECRET_KEY_STORAGE_KEY);
}

/** 32-byte Ed25519 seed as 64 lowercase hex chars. */
export function normalizeRecoveryKey(input: string): string {
  return input.replace(/\s+/g, '').replace(/^0x/i, '').toLowerCase();
}

export function isValidRecoveryKey(input: string): boolean {
  return /^[0-9a-f]{64}$/.test(normalizeRecoveryKey(input));
}

/** Format recovery key into readable 4-char groups. */
export function formatRecoveryKey(secretKeyHex: string): string {
  const hex = normalizeRecoveryKey(secretKeyHex);
  return hex.match(/.{1,4}/g)?.join(' ') ?? hex;
}

export async function hasIdentity(): Promise<boolean> {
  const existing = await getSecret();
  return Boolean(existing && isValidRecoveryKey(existing));
}

/** Load existing identity without creating one. */
export async function loadIdentity(): Promise<KeyPair | null> {
  const existing = await getSecret();
  if (!existing || !isValidRecoveryKey(existing)) {
    return null;
  }
  const publicKey = await publicKeyFromSecret(existing);
  return { secretKey: existing, publicKey };
}

/** Create a new local identity (registration). */
export async function createIdentity(): Promise<KeyPair> {
  const keyPair = await generateKeyPair();
  await setSecret(keyPair.secretKey);
  return keyPair;
}

/** Restore identity from recovery key (login). */
export async function restoreIdentity(recoveryKey: string): Promise<KeyPair> {
  const secretKey = normalizeRecoveryKey(recoveryKey);
  if (!isValidRecoveryKey(secretKey)) {
    throw new Error('Recovery key must be 64 hex characters.');
  }
  const publicKey = await publicKeyFromSecret(secretKey);
  await setSecret(secretKey);
  return { secretKey, publicKey };
}

export async function clearIdentity(): Promise<void> {
  await clearSecret();
}

/**
 * @deprecated Prefer loadIdentity + createIdentity for explicit auth flows.
 * Kept for tests / scripts that expect auto-provisioning.
 */
export async function loadOrCreateIdentity(): Promise<KeyPair> {
  const existing = await loadIdentity();
  if (existing) return existing;
  return createIdentity();
}
