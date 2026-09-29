import { readFile } from 'node:fs/promises';
import { createWoff2CodecFromSource, wasmUrl } from './index.ts';
import type { Woff2Codec } from './index.ts';
import { FontCodecError } from 'web-font-codecs';
import type { CodecInitOptions } from 'web-font-codecs';
export * from './index.ts';
export async function createWoff2Codec(options: CodecInitOptions = {}): Promise<Woff2Codec> {
  try {
    const source = await (options.wasm ?? wasmUrl);
    return await createWoff2CodecFromSource(source instanceof URL && source.protocol === 'file:' ? await readFile(source) : source, options);
  } catch (cause) {
    if (cause instanceof FontCodecError) throw cause;
    throw new FontCodecError('WASM_INIT', 'Could not load the font codec WASM', { cause });
  }
}
