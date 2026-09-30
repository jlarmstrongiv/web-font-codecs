import { FontCodecError } from 'web-font-codecs';

export const maxInputBytes = 512 * 1024 * 1024;

/** Bound stdin while reading, before retaining each chunk. */
export async function readInputStream(stream: AsyncIterable<Uint8Array>, limit = maxInputBytes): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of stream) {
    if (chunk.byteLength > limit - length) throw new FontCodecError('LIMIT_EXCEEDED', `Input exceeds ${limit / (1024 * 1024)} MiB`);
    length += chunk.byteLength;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}
