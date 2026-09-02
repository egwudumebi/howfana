import { MediaConfig } from '@/lib/constants';
import { bytesToHex } from '@/lib/crypto/encoding';
import { sha256 } from '@noble/hashes/sha2.js';

export function hashBytes(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

export function splitIntoChunks(
  bytes: Uint8Array,
  chunkSize: number = MediaConfig.chunkSize,
): Uint8Array[] {
  if (chunkSize <= 0) {
    throw new Error('chunkSize must be positive');
  }
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(bytes.slice(offset, offset + chunkSize));
  }
  return chunks;
}

export function reassembleChunks(
  chunks: Array<Uint8Array | null | undefined>,
  expectedSize?: number,
): Uint8Array {
  if (chunks.length === 0) {
    return new Uint8Array(0);
  }
  for (let i = 0; i < chunks.length; i++) {
    if (!chunks[i]) {
      throw new Error(`Missing chunk at index ${i}`);
    }
  }
  const total = chunks.reduce((sum, c) => sum + (c?.length ?? 0), 0);
  if (expectedSize !== undefined && total !== expectedSize) {
    throw new Error(`Size mismatch: got ${total}, expected ${expectedSize}`);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk!, offset);
    offset += chunk!.length;
  }
  return out;
}

export function missingChunkIndexes(
  present: Iterable<number>,
  chunkCount: number,
): number[] {
  const have = new Set(present);
  const missing: number[] = [];
  for (let i = 0; i < chunkCount; i++) {
    if (!have.has(i)) missing.push(i);
  }
  return missing;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return globalThis.btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function chunkCountForSize(
  size: number,
  chunkSize: number = MediaConfig.chunkSize,
): number {
  if (size <= 0) return 0;
  return Math.ceil(size / chunkSize);
}
