# web-font-codecs

Convert fonts between TTF/OTF, WOFF and WOFF2 in Node or the browser.

- Every direction: TTF/OTF to WOFF or WOFF2, back again, and WOFF to WOFF2.
- Uses Mozilla's original WOFF codec and Google's WOFF2 codec, compiled to WebAssembly.
- Loads only the codec a conversion needs.
- Keeps outlines as they are. The result tells you whether to save it as `.ttf` or `.otf`.
- Runs locally. No uploads, no CDN.

```sh
npm install web-font-codecs
```

## Node

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { createFontConverter } from 'web-font-codecs';

using converter = createFontConverter();
const result = await converter.convert(await readFile('font.ttf'), { to: 'woff2' });
await writeFile(`font.${result.extension}`, result.data);
```

## Browser

The same code works in the browser. Vite and Astro bundle the `.wasm` files automatically. With other bundlers, serve `woff1-codec/codec.wasm` and `woff2-codec/codec.wasm` yourself and pass their URLs:

```ts
import { createFontConverter } from 'web-font-codecs';

using converter = createFontConverter({
  woff1: { wasm: '/assets/woff1.wasm' },
  woff2: { wasm: '/assets/woff2.wasm' },
});
const response = await fetch('/font.woff2');
const result = await converter.convert(new Uint8Array(await response.arrayBuffer()), { to: 'sfnt' });
```

`wasm` also accepts a `URL`, `Response`, bytes, compiled `WebAssembly.Module`, `ReadableStream<Uint8Array>`, or a promise of any of these.

Conversion blocks the thread it runs on and cannot be interrupted. For large fonts or Zopfli, run it in a Worker and call `worker.terminate()` to cancel.

## Options

```ts
await converter.convert(input, { to: 'sfnt' });
await converter.convert(input, { to: 'woff1', encode: { compression: 'zopfli', iterations: 15 } });
await converter.convert(input, { to: 'woff2', encode: { quality: 11, allowTransforms: true } });
```

WOFF (`to: 'woff1'`):

| Option | Default | Values |
| --- | --- | --- |
| `compression` | `'zlib'` | `'zlib'` or `'zopfli'` (slower, smaller) |
| `iterations` | `15` | 1 to 100. Only with `'zopfli'`. |
| `majorVersion`, `minorVersion` | `1`, `0` | 0 to 65535 |
| `metadata` | none | XML as UTF-8 `Uint8Array`. Not validated. |
| `privateData` | none | Any `Uint8Array` |

WOFF2 (`to: 'woff2'`):

| Option | Default | Values |
| --- | --- | --- |
| `quality` | `11` | Brotli quality, 0 to 11 |
| `allowTransforms` | `true` | Google's glyph table transforms |
| `metadata` | none | XML as UTF-8 `Uint8Array`. Not validated. |

Converting to the same format without `encode` returns a copy of the input. Pass `encode` (even `{}`) to re-encode it.

## Result

| Field | Value |
| --- | --- |
| `data` | The converted font, as a `Uint8Array` you own |
| `extension` | `'ttf'`, `'otf'`, `'woff'` or `'woff2'`. CFF fonts decode to `'otf'`. |
| `from`, `to` | `'sfnt'`, `'woff1'` or `'woff2'` |
| `warnings` | Repair names, e.g. `['checksumMismatch']`; `[]` when none were reported. |
| `discardedAuxiliaryData` | `true` if the input's WOFF metadata or private data was dropped |

WOFF metadata and private data do not carry over when a font is decoded or re-encoded. To keep WOFF blocks, read them with `readAuxiliaryData` from `woff1-codec` and pass them back through `encode`. WOFF2 offers no way to read them.

`detectFormat(bytes)` returns `'sfnt'`, `'woff1'` or `'woff2'` from the file signature.

## Limits

- Single fonts only. TTC/OTC and WOFF2 collections are rejected.
- Input and output: 512 MiB each by default and at most. Lower them per codec with `maxInputBytes` and `maxOutputBytes` under `woff1` and `woff2`. Set both, since a conversion may use either codec.
- Each codec has up to 2 GiB of WASM memory, which a large font can exhaust before reaching the output limit.
- Round trips are not byte-identical. Mozilla may repair checksums and alignment; Google normalizes glyph storage and may drop `DSIG`.
- These are codecs, not font validators or sanitizers.

## Errors and cleanup

Failures throw `FontCodecError` with a `code`: `INVALID_INPUT`, `UNSUPPORTED_FORMAT`, `LIMIT_EXCEEDED`, `INVALID_OPTION`, `CODEC_FAILURE`, `WASM_INIT` or `DISPOSED`. Native failures also set `nativeStatus`.

```ts
import { FontCodecError } from 'web-font-codecs';

try {
  await converter.convert(input, { to: 'woff2' });
} catch (error) {
  if (error instanceof FontCodecError && error.code === 'UNSUPPORTED_FORMAT') console.error(error.message);
  else throw error;
}
```

`using` (via `Symbol.dispose`) or `dispose()` releases both codecs; later calls throw `DISPOSED`. Results stay valid after disposal. If the WASM fails to load, the next `convert` tries again. If the WASM itself crashes (`CODEC_FAILURE`), create a new converter.

## License

MIT. The WOFF codec it depends on is MPL 1.1 and ships its own source. See [LICENSING.md](LICENSING.md) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
