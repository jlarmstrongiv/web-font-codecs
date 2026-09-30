# woff1-codec

Encode and decode WOFF fonts with Mozilla's original WOFF codec, compiled to WebAssembly.

- Mozilla's C source, unmodified, with zlib. Output is byte-identical to a native build.
- Optional Google Zopfli: 12% smaller than zlib on Open Sans at 15 iterations.
- Reads and writes WOFF metadata and private data.
- Reports each repair Mozilla makes, by name.
- Node and browser, with TypeScript types.

Most apps should use [`web-font-codecs`](../web-font-codecs/README.md), which picks the codec for you. Use this package when you only need WOFF or want its metadata.

```sh
npm install woff1-codec
```

## Encode and decode

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { createWoff1Codec } from 'woff1-codec';

using codec = await createWoff1Codec();
const woff = codec.encode(await readFile('font.ttf'));
await writeFile('font.woff', woff.data);
const ttf = codec.decode(woff.data);
await writeFile('font.ttf', ttf.data);
```

`createWoff1Codec` is async; `encode` and `decode` are synchronous. Decoding a CFF font gives OTF bytes, so save it as `.otf`.

## Browser

The same code works in the browser. Vite and Astro bundle the `.wasm` file automatically. With other bundlers, serve `woff1-codec/codec.wasm` yourself and pass its URL:

```ts
using codec = await createWoff1Codec({ wasm: '/assets/woff1.wasm' });
```

`wasm` also accepts a `URL`, `Response`, bytes, compiled `WebAssembly.Module`, `ReadableStream<Uint8Array>`, or a promise of any of these. `wasmUrl` is the default location.

Encoding blocks the thread it runs on, and Zopfli can take seconds. In the browser, run it in a Worker and call `worker.terminate()` to cancel.

## Encode options

```ts
codec.encode(font, { compression: 'zopfli', iterations: 15 });
```

| Option | Default | Values |
| --- | --- | --- |
| `compression` | `'zlib'` | `'zlib'` or `'zopfli'` (slower, smaller) |
| `iterations` | `15` | 1 to 100. Only with `'zopfli'`. |
| `majorVersion`, `minorVersion` | `1`, `0` | 0 to 65535 |
| `metadata` | none | XML as UTF-8 `Uint8Array`. Not validated. |
| `privateData` | none | Any `Uint8Array` |

Zopfli does not shrink every font by the same amount: it saved 12% on Open Sans and 2% on Rochester. Decoding always uses zlib.

## Metadata and private data

`decode` returns only the font. `readAuxiliaryData` returns the rest:

```ts
const { majorVersion, minorVersion, metadata, privateData } = codec.readAuxiliaryData(woff);
const xml = new TextDecoder().decode(metadata);
```

## Repairs

Mozilla's codec fixes some problems instead of rejecting the font. Each result's `warnings` array names the repairs, or is empty when none were reported:

```ts
const { warnings } = codec.encode(font);
console.log(warnings); // e.g. ['checksumMismatch']
```

The names are `unknownVersion`, `checksumMismatch`, `misalignedTable`, `trailingData`, `unpaddedTable` and `removedDsig`. Because of these repairs, a decoded font is not always byte-identical to the original.

## Limits and errors

- Single fonts only. TTC/OTC collections are rejected.
- `maxInputBytes` and `maxOutputBytes`: 512 MiB each by default and at most. Metadata and private data count toward input.
- Up to 2 GiB of WASM memory per codec, which a large font can exhaust before reaching the output limit.
- Failures throw `FontCodecError` with a `code`: `INVALID_INPUT`, `UNSUPPORTED_FORMAT`, `LIMIT_EXCEEDED`, `INVALID_OPTION`, `CODEC_FAILURE`, `WASM_INIT` or `DISPOSED`.
- After `using` scope exit or `dispose()`, calls throw `DISPOSED`. Results you already have stay valid. If the WASM crashes, the codec is unusable; create a new one.
- This is a codec, not a font validator or sanitizer.

## License

MPL 1.1. Mozilla's original source keeps its tri-license and is used here under MPL 1.1. zlib and Zopfli keep their own licenses. The package ships the complete source and build script for its WASM in `upstream-source/`; if you redistribute the package or its `.wasm` file, keep that source available. See [LICENSING.md](LICENSING.md) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
