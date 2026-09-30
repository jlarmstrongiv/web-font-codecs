/* SPDX-License-Identifier: MPL-1.1
 * Copyright (c) 2026 John L. Armstrong IV. See LICENSE-MPL-1.1 / package LICENSE.
 * This WOFF1-specific file is subject to Mozilla Public License 1.1.
 */
import { createRuntime, FontCodecError, integerOption, validateFont } from 'web-font-codecs-core';
import type { CodecInitOptions, CodecLifecycle, CodecResult, WasmSource } from 'web-font-codecs-core';
export { FontCodecError } from 'web-font-codecs-core';
export type { CodecInitOptions, CodecLimits, CodecResult, WasmSource, CodecErrorCode } from 'web-font-codecs-core';
/** Native Mozilla repair flags, decoded automatically in CodecResult.warnings. */
export const WOFF1_WARNINGS = {
  unknownVersion: 0x0100,
  checksumMismatch: 0x0200,
  misalignedTable: 0x0400,
  trailingData: 0x0800,
  unpaddedTable: 0x1000,
  removedDsig: 0x2000,
} as const;
export type Woff1Warning = keyof typeof WOFF1_WARNINGS;
export function woff1WarningNames(warnings: number): Woff1Warning[] {
  return (Object.keys(WOFF1_WARNINGS) as Woff1Warning[]).filter(name => (warnings & WOFF1_WARNINGS[name]) !== 0);
}
export interface Woff1CommonEncodeOptions {
  majorVersion?: number;
  minorVersion?: number;
  /** UTF-8 XML bytes. Compression is handled by Mozilla; XML validity is the caller's responsibility. */
  metadata?: Uint8Array;
  /** Opaque, uncompressed auxiliary data. */
  privateData?: Uint8Array;
}
/** Zopfli trades substantially more CPU time for smaller DEFLATE streams. */
export type Woff1EncodeOptions = Woff1CommonEncodeOptions & (
  | { compression?: 'zlib'; iterations?: never }
  | { compression: 'zopfli'; /** Integer 1–100, default 15. */ iterations?: number }
);
export interface Woff1AuxiliaryData {
  majorVersion: number;
  minorVersion: number;
  metadata: Uint8Array<ArrayBuffer>;
  privateData: Uint8Array<ArrayBuffer>;
}
export interface Woff1Codec extends CodecLifecycle {
  encode(input: Uint8Array, options?: Woff1EncodeOptions): CodecResult;
  /** Returns only SFNT bytes. Use readAuxiliaryData to obtain container-only data. */
  decode(input: Uint8Array): CodecResult;
  readAuxiliaryData(input: Uint8Array): Woff1AuxiliaryData;
}
export const wasmUrl = new URL('../wasm/codec.wasm', import.meta.url);
/** Explicit asynchronous initialization; encode/decode are synchronous after initialization. */
export async function createWoff1Codec(options: CodecInitOptions = {}): Promise<Woff1Codec> {
  return createWoff1CodecFromSource(options.wasm ?? wasmUrl, options);
}
/** Shared adapter used by the Node entry point. */
export async function createWoff1CodecFromSource(source: WasmSource, options: CodecInitOptions = {}): Promise<Woff1Codec> {
  const runtime = await createRuntime(source, options);
  const check = (input: Uint8Array): DataView => {
    validateFont(input, 'woff1', runtime.maxInputBytes);
    return new DataView(input.buffer, input.byteOffset, input.byteLength);
  };
  return {
    dispose: runtime.dispose,
    [Symbol.dispose]: runtime[Symbol.dispose],
    encode(input, options = {}) {
      validateFont(input, 'sfnt', runtime.maxInputBytes);
      const major = integerOption(options.majorVersion ?? 1, 'majorVersion', 0, 65535);
      const minor = integerOption(options.minorVersion ?? 0, 'minorVersion', 0, 65535);
      for (const key of ['metadata', 'privateData'] as const) if (options[key] !== undefined && !(options[key] instanceof Uint8Array)) throw new FontCodecError('INVALID_OPTION', `${key} must be Uint8Array`);
      const compression = options.compression ?? 'zlib';
      if (compression !== 'zlib' && compression !== 'zopfli') throw new FontCodecError('INVALID_OPTION', 'compression must be zlib or zopfli');
      if (compression !== 'zopfli' && options.iterations !== undefined) throw new FontCodecError('INVALID_OPTION', 'iterations requires zopfli compression');
      const iterations = integerOption(options.iterations ?? 15, 'iterations', 1, 100);
      const { data, warningFlags } = runtime.run(input, 1, major, minor, options.metadata, options.privateData, compression === 'zopfli' ? 1 : 0, iterations);
      return { data, warnings: woff1WarningNames(warningFlags) };
    },
    decode(input) {
      const view = check(input);
      if (view.getUint32(16) > runtime.maxOutputBytes) throw new FontCodecError('LIMIT_EXCEEDED', 'Decoded font exceeds output limit');
      const { data, warningFlags } = runtime.run(input, 2);
      return { data, warnings: woff1WarningNames(warningFlags) };
    },
    readAuxiliaryData(input) {
      const view = check(input);
      // Validate the complete font first, including Mozilla's directory checks.
      runtime.run(input, 2);
      if (view.getUint32(32) > runtime.maxOutputBytes || view.getUint32(40) > runtime.maxOutputBytes) throw new FontCodecError('LIMIT_EXCEEDED', 'Auxiliary data exceeds output limit');
      return { majorVersion: view.getUint16(20), minorVersion: view.getUint16(22), metadata: runtime.run(input, 3).data, privateData: runtime.run(input, 4).data };
    },
  };
}
