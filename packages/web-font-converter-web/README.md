# web-font-converter-web

The browser demo for [`web-font-converter`](../web-font-converter/README.md). [Try it](https://jlarmstrongiv.github.io/web-font-codecs/).

Drop in a TTF, OTF, WOFF or WOFF2 file, pick an output format, and download the result. The font never leaves your browser.

- Converts as soon as you choose a font or change an option. There is no convert button.
- WOFF output: zlib or Zopfli, with 1 to 100 Zopfli iterations.
- WOFF2 output: quality 0 to 11, and glyph transforms on or off.
- Shows the original and converted sizes, and any repairs or dropped metadata.
- Downloads with the right extension: `.ttf` or `.otf` to match the outlines, `.woff`, or `.woff2`.
- Four sample fonts to try: Open Sans as TTF, WOFF and WOFF2, and Rochester as OTF.

Conversion runs in a Web Worker. Cancel terminates the worker; Retry, a new font, or a new option starts over. Limits match the library: single fonts only, 512 MiB in and out, and no TrueType to CFF conversion.

The demo is deployed to [GitHub Pages](https://jlarmstrongiv.github.io/web-font-codecs/). To convert fonts in your own app, use [`web-font-converter`](../web-font-converter/README.md).

## Develop

From the repository root, after the setup in the [root README](../../README.md#develop):

```sh
npm run web:dev
```

| Command | What it does |
| --- | --- |
| `npm run web:build` | Builds the static site into `packages/web-font-converter-web/dist` |
| `npm run preview --workspace web-font-converter-web` | Serves the built site |
| `npm run typecheck --workspace web-font-converter-web` | Type-checks the demo |
| `npm run test:browser` | Tests the built site in Chromium, Firefox and WebKit |
| `npm run test:live` | Tests a running dev server on port 4324 while a production build runs |
| `npm run samples:build --workspace web-font-converter-web` | Regenerates the sample fonts |

The site is static: serve `dist` from any web server. The WASM files and samples are included, and nothing is loaded from other sites.

Set `ASTRO_BASE_PATH` (for example `/web-font-codecs/`) to build for a subpath. Tagged releases set it for GitHub Pages automatically.

`test:browser` covers every container pair for six fonts, both WOFF encoders, all four samples, cancel and retry, download names and MIME types, mobile layout, and checks that no request leaves the page's origin. Playwright's WebKit is not Safari, so it does not certify Safari or iOS.

`test:live` needs `npm run web:dev -- --port 4324` running first (or `DEMO_URL` set). It checks that a production build does not break the running dev server; Astro dev and build use separate caches under `node_modules/.vite` for this reason.

## Sample fonts

The TTF and OTF samples are unmodified test fixtures. The WOFF and WOFF2 samples were made with this project's codecs (WOFF2 at quality 11, transforms on). Both fonts are Apache 2.0. `public/samples/` holds the license, `NOTICE.txt`, and the hashes of each source, output and codec in `provenance.json`.

## License

MIT. The codecs it bundles keep their licenses: [WOFF](../woff1-codec/README.md) is MPL 1.1 and [WOFF2](../woff2-codec/README.md) is MIT. If you redistribute the built site, keep the notices and source availability described in the repository's [LICENSING.md](../../LICENSING.md) and [THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md).
