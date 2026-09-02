import { NetConfig } from '@/lib/constants';
import type { Frame } from '@/lib/net/types';

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export function encodeFrame(frame: Frame): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(frame));
  if (body.length > NetConfig.maxFrameBytes) {
    throw new Error(`Frame too large: ${body.length}`);
  }
  const out = new Uint8Array(4 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length, false);
  out.set(body, 4);
  return out;
}

/** Incremental TCP length-prefix decoder. */
export class FrameDecoder {
  private buffer = new Uint8Array(0);

  push(chunk: Uint8Array): Frame[] {
    this.buffer = new Uint8Array(concatBytes(this.buffer, chunk));
    const frames: Frame[] = [];

    while (this.buffer.length >= 4) {
      const view = new DataView(this.buffer.buffer);
      const length = view.getUint32(0, false);
      if (length > NetConfig.maxFrameBytes) {
        throw new Error(`Frame length exceeds limit: ${length}`);
      }
      if (this.buffer.length < 4 + length) {
        break;
      }
      const body = this.buffer.slice(4, 4 + length);
      this.buffer = new Uint8Array(this.buffer.slice(4 + length));
      const text = new TextDecoder().decode(body);
      frames.push(JSON.parse(text) as Frame);
    }

    return frames;
  }

  reset(): void {
    this.buffer = new Uint8Array(0);
  }
}

export function chunkToUint8Array(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) {
    return new Uint8Array(chunk);
  }
  if (typeof chunk === 'string') {
    return new TextEncoder().encode(chunk);
  }
  if (chunk && typeof chunk === 'object' && 'data' in (chunk as object)) {
    const data = (chunk as { data: unknown }).data;
    if (Array.isArray(data)) {
      return Uint8Array.from(data);
    }
  }
  if (
    chunk &&
    typeof chunk === 'object' &&
    typeof (chunk as { length?: number }).length === 'number'
  ) {
    return Uint8Array.from(chunk as ArrayLike<number>);
  }
  throw new Error('Unsupported TCP chunk type');
}
