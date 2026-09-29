# woff2-codec

Encode and decode WOFF2 fonts with Google's WOFF2 codec and Brotli, compiled to WebAssembly.

- Google's C++ source, unmodified, including the decoder safety fixes made after its last tagged release. Output is byte-identical to a native build.
- Open Sans shrinks from 217,360 bytes to 59,820 at the default quality.
- Brotli quality 0 to 11, and glyph transforms on or off.
- Node and browser, with TypeScript types.

Most apps should use [`web-font-converter`](../web-font-converter/README.md), which picks the codec for you. Use this package when you only need WOFF2.

```sh
npm install woff2-codec
```

## Encode and decode

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { createWoff2Codec } from 'woff2-codec';

using codec = await createWoff2Codec();
const woff2 = codec.encode(await readFile('font.ttf'));
await writeFile('font.woff2', woff2.data);
const ttf = codec.decode(woff2.data);
await writeFile('font.ttf', ttf.data);
```

`createWoff2Codec` is async; `encode` and `decode` are synchronous. Decoding a CFF font gives OTF bytes, so save it as `.otf`.

## Browser

The same code works in the browser. Vite and Astro bundle the `.wasm` file automatically. With other bundlers, serve `woff2-codec/codec.wasm` yourself and pass its URL:

```ts
using codec = await createWoff2Codec({ wasm: '/assets/woff2.wasm' });
```

`wasm` also accepts a `URL`, `Response`, bytes, compiled `WebAssembly.Module`, `ReadableStream<Uint8Array>`, or a promise of any of these. `wasmUrl` is the default location.

Encoding blocks the thread it runs on, and quality 11 took about 600 ms on Open Sans. In the browser, run it in a Worker and call `worker.terminate()` to cancel.

## Encode options

```ts
codec.encode(font, { quality: 8, allowTransforms: true });
```

| Option | Default | Values |
| --- | --- | --- |
| `quality` | `11` | Brotli quality, 0 to 11 |
| `allowTransforms` | `true` | Google's glyph table transforms |
| `metadata` | none | XML as UTF-8 `Uint8Array`. Not validated. |

On Open Sans, quality 8 took 15 ms for 69,820 bytes and quality 11 took 593 ms for 59,820 bytes. Turning transforms off cost 7,504 bytes at quality 11. Transforms made no difference to the Rochester CFF font.

## What decoding returns

- The font only. The WOFF2 metadata block cannot be read back, and private data cannot be written.
- Not byte-identical to the original. Google normalizes glyph storage and may drop `DSIG`. The outline format does not change.
- `warnings` is always `[]`.

## Limits and errors

- Single fonts only. TTC/OTC and WOFF2 collections are rejected.
- `maxInputBytes` and `maxOutputBytes`: 512 MiB each by default and at most. Metadata counts toward input.
- Up to 2 GiB of WASM memory per codec, which a large font can exhaust before reaching the output limit.
- Failures throw `FontCodecError` with a `code`: `INVALID_INPUT`, `UNSUPPORTED_FORMAT`, `LIMIT_EXCEEDED`, `INVALID_OPTION`, `CODEC_FAILURE`, `WASM_INIT` or `DISPOSED`.
- After `using` scope exit or `dispose()`, calls throw `DISPOSED`. Results you already have stay valid. If the WASM crashes, the codec is unusable; create a new one.
- This is a codec, not a font validator or sanitizer.

## License

MIT, including Google WOFF2 and Brotli. Their license files are in `upstream-source/licenses/`. See [LICENSING.md](LICENSING.md) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
