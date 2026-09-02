import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

/**
 * React Native has no WebCrypto `subtle`. @noble/ed25519 async APIs default to it,
 * so we wire pure-JS SHA-512 for both sync and async paths.
 * Import this module once at app start (and before any sign/verify).
 */
ed.hashes.sha512 = sha512;
ed.hashes.sha512Async = (message: Uint8Array) => Promise.resolve(sha512(message));
