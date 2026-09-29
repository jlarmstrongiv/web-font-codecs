import { createRuntime, FontCodecError, integerOption, validateFont } from 'web-font-codecs';
import type { CodecInitOptions, CodecLifecycle, CodecResult, WasmSource } from 'web-font-codecs';
export { FontCodecError } from 'web-font-codecs';
export type { CodecInitOptions, CodecLimits, CodecResult, WasmSource, CodecErrorCode } from 'web-font-codecs';
export interface Woff2EncodeOptions {
  /** Brotli quality from 0 to 11. Default: 11 (Google's default). */
  quality?: number;
  /** Enable Google's font table transforms. Default: true. */
  allowTransforms?: boolean;
  /** UTF-8 XML bytes, compressed by Google. XML validity is the caller's responsibility. */
  metadata?: Uint8Array;
}
export interface Woff2Codec extends CodecLifecycle {
  encode(input: Uint8Array, options?: Woff2EncodeOptions): CodecResult;
  /** Decode only font tables. Container metadata/private data are not returned by Google. */
  decode(input: Uint8Array): CodecResult;
}
export const wasmUrl = new URL('../wasm/codec.wasm', import.meta.url);
export async function createWoff2Codec(options: CodecInitOptions = {}): Promise<Woff2Codec> {
  return createWoff2CodecFromSource(options.wasm ?? wasmUrl, options);
}
export async function createWoff2CodecFromSource(source: WasmSource, options: CodecInitOptions = {}): Promise<Woff2Codec> {
  const runtime = await createRuntime(source, options);
  return {
    dispose: runtime.dispose,
    [Symbol.dispose]: runtime[Symbol.dispose],
    encode(input, options = {}) {
      validateFont(input, 'sfnt', runtime.maxInputBytes);
      const quality = integerOption(options.quality ?? 11, 'quality', 0, 11);
      if (options.allowTransforms !== undefined && typeof options.allowTransforms !== 'boolean') throw new FontCodecError('INVALID_OPTION', 'allowTransforms must be boolean');
      if (options.metadata !== undefined && !(options.metadata instanceof Uint8Array)) throw new FontCodecError('INVALID_OPTION', 'metadata must be Uint8Array');
      return { data: runtime.run(input, 1, quality, options.allowTransforms === false ? 0 : 1, options.metadata).data, warnings: [] };
    },
    decode(input) {
      validateFont(input, 'woff2', runtime.maxInputBytes);
      // Actual reconstructed bytes are bounded by WOFF2StringOut, not an untrusted totalSfntSize.
      return { data: runtime.run(input, 2).data, warnings: [] };
    },
  };
}
