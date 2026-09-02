import * as ed from '@noble/ed25519';
import * as Crypto from 'expo-crypto';

import './setup';
import { bytesToHex, hexToBytes } from './encoding';

export type KeyPair = {
  publicKey: string;
  secretKey: string;
};

export async function generateKeyPair(): Promise<KeyPair> {
  const secretKeyBytes = await Crypto.getRandomBytesAsync(32);
  const publicKeyBytes = await ed.getPublicKeyAsync(secretKeyBytes);
  return {
    secretKey: bytesToHex(secretKeyBytes),
    publicKey: bytesToHex(publicKeyBytes),
  };
}

export async function publicKeyFromSecret(secretKeyHex: string): Promise<string> {
  const publicKeyBytes = await ed.getPublicKeyAsync(hexToBytes(secretKeyHex));
  return bytesToHex(publicKeyBytes);
}

export async function sign(message: Uint8Array, secretKeyHex: string): Promise<string> {
  const signature = await ed.signAsync(message, hexToBytes(secretKeyHex));
  return bytesToHex(signature);
}

export async function verify(
  message: Uint8Array,
  signatureHex: string,
  publicKeyHex: string,
): Promise<boolean> {
  try {
    return await ed.verifyAsync(
      hexToBytes(signatureHex),
      message,
      hexToBytes(publicKeyHex),
    );
  } catch {
    return false;
  }
}
