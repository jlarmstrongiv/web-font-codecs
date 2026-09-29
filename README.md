# web-font-codecs

Convert fonts between TTF/OTF, WOFF and WOFF2 in Node or the browser, using Mozilla's and Google's own codecs compiled to WebAssembly.

- Every direction: TTF/OTF to WOFF or WOFF2, back again, and WOFF to WOFF2.
- Mozilla's original WOFF encoder and Google's WOFF2 encoder, built from source. WASM output is byte-identical to native builds of the same code.
- Outlines stay as they are. TrueType comes back as `.ttf`, CFF as `.otf`.
- Zopfli for WOFF files 12% smaller than zlib (Open Sans, 15 iterations).
- Runs locally. Fonts are never uploaded, and nothing is fetched except the packaged `.wasm` file.
- Typed TypeScript API, typed error codes, and a CLI.
- Tested on every container pair for six fonts (TrueType, CFF, variable TrueType, variable CFF2, CJK, COLRv1 color) in Chromium, Firefox and WebKit.

[Try it in your browser](https://jlarmstrongiv.github.io/web-font-codecs/).

## Quick start

```sh
npm install web-font-converter
```

```ts
import { readFile, writeFile } from "node:fs/promises";
import { createFontConverter } from "web-font-converter";

using converter = createFontConverter();
const result = await converter.convert(await readFile("font.ttf"), {
  to: "woff2",
});
await writeFile(`font.${result.extension}`, result.data);
```

From the command line:

```sh
npx web-font-converter-cli font.ttf -o font.woff2
```

## Packages

| Package                                                               | Use it for                                      | License |
| --------------------------------------------------------------------- | ----------------------------------------------- | ------- |
| [`web-font-converter`](packages/web-font-converter/README.md)         | Converting between any two formats. Start here. | MIT     |
| [`web-font-converter-cli`](packages/web-font-converter-cli/README.md) | Converting files from a terminal                | MIT     |
| [`woff1-codec`](packages/woff1-codec/README.md)                       | WOFF only, including metadata and private data  | MPL 1.1 |
| [`woff2-codec`](packages/woff2-codec/README.md)                       | WOFF2 only                                      | MIT     |
| [`web-font-codecs`](packages/web-font-codecs/README.md)               | Shared types, errors and format detection       | MIT     |
| [`web-font-converter-web`](packages/web-font-converter-web/README.md) | The browser demo                                | MIT     |

## File sizes

Open Sans Regular, 217,360 bytes as TTF:

| Output                      |   Bytes | Encode time |
| --------------------------- | ------: | ----------: |
| WOFF, zlib                  | 112,520 |       14 ms |
| WOFF, Zopfli 15 iterations  |  99,144 |       3.7 s |
| WOFF2, quality 8            |  69,820 |       15 ms |
| WOFF2, quality 11 (default) |  59,820 |      593 ms |

Median of 7 runs in Node. Timings vary by hardware and system load. Gains depend on the font: Zopfli saved 2% on the Rochester CFF font. The full results for six fonts are in [`benchmarks/full.json`](benchmarks/full.json).

## Limits

- Single fonts only. TTC/OTC collections and WOFF2 collections are rejected.
- Input and output: 512 MiB each by default and at most. Each codec instance has up to 2 GiB of WASM memory.
- Converts containers, not outlines. There is no TrueType to CFF conversion.
- Round trips are not byte-identical. Mozilla may repair checksums and alignment; Google normalizes glyph storage and may drop `DSIG`.
- WOFF metadata and private data are dropped when converting to another container. The result reports it.
- Encoding is synchronous and has no timeout. In the browser, run it in a Worker so you can terminate it.
- These are codecs, not font validators or sanitizers.

## Develop

Upstream sources are pinned Git submodules. Tools are pinned with [mise](https://mise.jdx.dev/). The Emscripten plugin needs Python set explicitly:

```sh
git submodule update --init
mise trust
mise install python node npm
EMSDK_PYTHON="$(mise where python@3.14.7)/bin/python3" mise install emsdk
mise exec -- npm ci
mise exec -- npm run check:source
mise exec -- npm run browsers:install
```

| Command                  | What it does                                                             |
| ------------------------ | ------------------------------------------------------------------------ |
| `npm run build:ts`       | Builds JavaScript and types using locally built WASM                    |
| `npm run build`          | Rebuilds both WASM codecs from source, then the TypeScript               |
| `npm test`               | Unit and CLI tests                                                       |
| `npm run typecheck`      | TypeScript for every package and the demo                                |
| `npm run test:reference` | Compares WASM output with native builds (needs `cc` and `c++`)           |
| `npm run test:pack`      | Installs the packed tarballs into a fresh TypeScript project             |
| `npm run test:browser`   | Converts every format pair in Chromium, Firefox and WebKit               |
| `npm run check`          | All of the above, in order. CI runs this.                                |
| `npm run check:source`   | Builds WASM and verifies the recorded source and binary hashes          |
| `npm run web:dev`        | Starts the demo                                                          |
| `npm run benchmark`      | Measures sizes and timings (`-- --full` for the full matrix)             |

The compiled `.wasm` files are gitignored. Build them once during setup; TypeScript-only changes reuse them. If native sources or build flags change, `npm run build` refreshes WASM and its recorded hashes in `native/artifacts.json`. Other builds reject stale WASM. On Linux, install browser dependencies with `npx playwright install --with-deps chromium firefox webkit`.

Inside this repository, packages import each other's TypeScript source through the `web-font-codecs:source` export condition. Installed packages use the built JavaScript; do not enable that condition in your own app.

The repository's `.npmrc` disables lifecycle scripts with `ignore-scripts=true`, including our packages' `prepack` hooks. Explicit commands such as `npm run build:ts` and `npm test` still run. Before manually running `npm pack` or `npm publish` for a workspace, run `npm run build:ts` (or `npm run build` if WASM inputs changed). `npm run test:pack` builds explicitly before packing, and CI runs the build through `npm run check` before creating release tarballs. Browser installation is also an explicit setup step above.

Pushing a `vX.Y.Z` tag runs `npm run check`, then publishes a GitHub Release with the package tarballs and deploys the demo to [GitHub Pages](https://jlarmstrongiv.github.io/web-font-codecs/). npm publishing is not automated.

## License

WOFF-specific code (`woff1-codec` and `native/woff1.c`, `native/compression.c`) is MPL 1.1. Everything else written for this project is MIT. Mozilla's WOFF source keeps its tri-license, used here under MPL 1.1; Google WOFF2 and Brotli are MIT; zlib and Zopfli keep their own licenses. Every `woff1-codec` tarball includes its complete corresponding source. See [LICENSING.md](LICENSING.md) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
