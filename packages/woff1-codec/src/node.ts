/* SPDX-License-Identifier: MPL-1.1
 * Copyright (c) 2026 John L. Armstrong IV. See LICENSE-MPL-1.1 / package LICENSE.
 * This WOFF1-specific file is subject to Mozilla Public License 1.1.
 */
import { readFile } from 'node:fs/promises';
import { createWoff1CodecFromSource, wasmUrl } from './index.ts';
import type { Woff1Codec } from './index.ts';
import { FontCodecError } from 'web-font-codecs';
import type { CodecInitOptions } from 'web-font-codecs';
export * from './index.ts';
export async function createWoff1Codec(options: CodecInitOptions = {}): Promise<Woff1Codec> {
  try {
    const source = await (options.wasm ?? wasmUrl);
    return await createWoff1CodecFromSource(source instanceof URL && source.protocol === 'file:' ? await readFile(source) : source, options);
  } catch (cause) {
    if (cause instanceof FontCodecError) throw cause;
    throw new FontCodecError('WASM_INIT', 'Could not load the font codec WASM', { cause });
  }
}
