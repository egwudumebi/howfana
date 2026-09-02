/**
 * Hex / bytes helpers shared by crypto modules.
 */

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim().toLowerCase();
  if (normalized.length % 2 !== 0) {
    throw new Error('Invalid hex length');
  }
  if (!/^[0-9a-f]*$/.test(normalized)) {
    throw new Error('Invalid hex characters');
  }
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function utf8ToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
