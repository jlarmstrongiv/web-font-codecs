# Change record

2026-09-27 — John L. Armstrong IV / web-font-codecs contributors:

- Imported Mozilla's original WOFF source at revision
  64833aa89615b59b25f887443dfd344f24bbe3dc without editing its C source or headers.
- Added MPL-1.1-licensed `native/woff1.c`, a memory-only C ABI adapter,
  and build/interface tooling for Emscripten 4.0.13.
- Added input validation in the separate TypeScript wrapper before calling the
  historical encoder; native codec source remains unmodified.
- Added the MPL 1.1 license text and this source availability/change record.

The original files remain under their original tri-license notice; this
executable distribution uses the MPL 1.1 option. No warranty is offered.

2026-09-28 — web-font-codecs contributors:

- Upgraded the compiler to Emscripten 6.0.9 (2026-09-01), the newest stable
  release older than 14 days at the audit cutoff.
- Upgraded zlib to 1.3.2. Mozilla WOFF1 source and headers remain unmodified.
- Updated the covered-source build tool pins/instructions consistently.

2026-09-28: Added selectable original Google Zopfli compression in separate MPL-1.1 `compression.c`. Only the Mozilla translation unit uses `-Dcompress2=codec_compress2`; zero upstream source lines changed. zlib remains default and decoder. Original table fallback and metadata/private handling remain in Mozilla. Bounded buffer fallback uses zlib if a Zopfli stream exceeds zlib compressBound. Added typed engine/iteration options and distributable build/source instructions.
