/** Compile-only public API expectations, including invalid discriminated options. */
import { createFontConverter } from 'web-font-codecs';
import { createWoff1Codec } from 'woff1-codec';
import { createWoff2Codec } from 'woff2-codec';
import type { CodecErrorCode, FontFormat } from 'web-font-codecs';
using converter = createFontConverter({ woff1: { maxInputBytes: 100 } });
const result = await converter.convert(new Uint8Array(), { to: 'woff2', encode: { quality: 8, allowTransforms: false } });
const format: FontFormat = result.from;
const bytes: Uint8Array<ArrayBuffer> = result.data;
const warnings: string[] = result.warnings;
// @ts-expect-error warnings are decoded names, not a bitmask
const warningMask: number = result.warnings;
// @ts-expect-error quality is a WOFF2-only option
void converter.convert(bytes, { to: 'woff1', encode: { quality: 5 } });
// @ts-expect-error SFNT output has no encoder options
void converter.convert(bytes, { to: 'sfnt', encode: { quality: 5 } });
// @ts-expect-error collections are not a supported format
const collection: FontFormat = 'ttc';
using one = await createWoff1Codec(); using two = await createWoff2Codec();
one.encode(bytes, { metadata: bytes, privateData: bytes, majorVersion: 2 });
two.encode(bytes, { metadata: bytes, quality: 6 });
// @ts-expect-error no private-data writer in Google's WOFF2 API
two.encode(bytes, { privateData: bytes });
const code: CodecErrorCode = 'LIMIT_EXCEEDED';
void [format,bytes,collection,code];

// All public factories accept asynchronous WASM sources.
import type { WasmSource } from 'web-font-codecs';
const sourceBytes = new Uint8Array();
const sourceStream = new ReadableStream<Uint8Array>();
const thenable: PromiseLike<Uint8Array<ArrayBuffer>> = Promise.resolve(sourceBytes);
const wasmSources: WasmSource[] = [
  thenable, fetch('/codec.wasm'), Promise.resolve('/codec.wasm'),
  Promise.resolve(new URL('file:///codec.wasm')), Promise.resolve(sourceBytes.buffer),
  WebAssembly.compile(sourceBytes), sourceStream, Promise.resolve(sourceStream),
];
for (const wasm of wasmSources) {
  using sourceOne = await createWoff1Codec({ wasm });
  using sourceTwo = await createWoff2Codec({ wasm });
  using sourceConverter = createFontConverter({ woff1: { wasm }, woff2: { wasm } });
}
