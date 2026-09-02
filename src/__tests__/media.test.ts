import { MediaConfig } from '@/lib/constants';
import {
  chunkCountForSize,
  hashBytes,
  missingChunkIndexes,
  reassembleChunks,
  splitIntoChunks,
} from '@/lib/media/chunking';

describe('media chunking', () => {
  it('hashes deterministically', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(hashBytes(a)).toEqual(hashBytes(b));
    expect(hashBytes(a)).toHaveLength(64);
  });

  it('splits and reassembles bytes', () => {
    const bytes = new Uint8Array(100);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const chunks = splitIntoChunks(bytes, 32);
    expect(chunks.length).toBe(4);
    const rebuilt = reassembleChunks(chunks, bytes.length);
    expect(Array.from(rebuilt)).toEqual(Array.from(bytes));
  });

  it('computes missing indexes for resume', () => {
    expect(missingChunkIndexes([0, 2], 4)).toEqual([1, 3]);
    expect(chunkCountForSize(MediaConfig.chunkSize * 2 + 1)).toBe(3);
  });

  it('rejects reassembly with gaps', () => {
    expect(() =>
      reassembleChunks([new Uint8Array([1]), null as unknown as Uint8Array]),
    ).toThrow(/Missing chunk/);
  });
});
