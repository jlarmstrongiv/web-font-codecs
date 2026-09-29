# web-font-codecs

Shared types, errors and format checks for [`woff1-codec`](../woff1-codec/README.md) and [`woff2-codec`](../woff2-codec/README.md).

This package has no encoder or decoder. To convert fonts, install [`web-font-converter`](../web-font-converter/README.md), which re-exports everything most apps need from here. Use this package directly to check a font's format without loading any WASM.

```sh
npm install web-font-codecs
```

## Check a font

```ts
import { readFile } from 'node:fs/promises';
import { detectFormat, validateFont } from 'web-font-codecs';

const bytes = await readFile('font.ttf');
const format = detectFormat(bytes); // 'sfnt', 'woff1' or 'woff2'
validateFont(bytes, format, 512 * 1024 * 1024);
```

Both functions throw `FontCodecError` on failure. Neither needs WASM, so both run instantly in Node or the browser.

- `detectFormat(data)` reads the file signature. It rejects TTC/OTC collections and unknown signatures.
- `validateFont(data, expected, maximumBytes)` checks the size, the format, and the headers. For TTF/OTF it also checks that the table directory is sorted, unique, in bounds and not overlapping. For WOFF and WOFF2 it checks the header only.

These are structural checks that protect the codecs. They do not validate a font.

## Exports

| Export | What it is |
| --- | --- |
| `FontFormat` | `'sfnt' \| 'woff1' \| 'woff2'` |
| `FontCodecError` | Error with `code` and, for native failures, `nativeStatus` |
| `CodecErrorCode` | `INVALID_INPUT`, `UNSUPPORTED_FORMAT`, `LIMIT_EXCEEDED`, `INVALID_OPTION`, `CODEC_FAILURE`, `WASM_INIT`, `DISPOSED` |
| `CodecInitOptions` | `CodecLimits` plus `wasm?: WasmSource` |
| `CodecLimits` | `maxInputBytes?` and `maxOutputBytes?`: 1 byte to 512 MiB, default 512 MiB |
| `WasmSource` | URL string, `URL`, `Response`, `BufferSource`, `WebAssembly.Module`, `ReadableStream<Uint8Array>`, or a promise of any of these |
| `CodecResult` | `data: Uint8Array` (an independent copy) and `warnings: string[]` (repair names) |
| `CodecLifecycle` | `[Symbol.dispose](): void`, `dispose(): void` |
| `integerOption(value, name, min, max)` | Returns `value`, or throws `INVALID_OPTION` if it is not an integer in range |
| `createRuntime(source, limits?)`, `CodecRuntime` | The WASM loader the two codec packages use. It only runs their WASM builds. |

## License

MIT. See [LICENSING.md](LICENSING.md) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
