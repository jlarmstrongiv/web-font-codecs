# Third-party notices and source availability

Our WOFF1-specific TypeScript wrapper, native adapter and build helper are MPL 1.1
licensed. All other authored TypeScript and native adapters are MIT licensed. Codec binaries contain
separately licensed third-party code; the root MIT license does not replace those
licenses. Exact source pins are recorded in `vendor/SOURCES.json` in this repository.

Matching release source: the package's `v<version>` [source tag][package-release-source].
Repository archive: the matching tag's [source archive][package-release-archive] (upstream submodule contents are separate).
Package builds set these links from the package version. They identify the
intended public release destination; verify availability before distribution.

## Mozilla WOFF1

Copyright (C) 2009 Mozilla Corporation. Original code: WOFF font packaging code.
Contributor: Jonathan Kew. This distribution selects the **MPL 1.1 option** of the
original MPL 1.1 / GPL 2.0-or-later / LGPL 2.1-or-later tri-license. Original file
license notices, including the alternative license options, are preserved.

Source location: the `woff1-codec` package includes `upstream-source/` beside this
notice. It contains the complete covered Mozilla source, the added adapter,
interface headers, build script and pinned tool configuration, zlib source, dated
change record, and reproduction instructions. No separate download or source
request is needed. The full MPL 1.1 is in this package's `LICENSE` and in
`upstream-source/mozilla-woff/LICENSE-MPL-1.1`. The source is also pinned as a Git
submodule at `vendor/woff1/`. Upstream source is preserved at
https://github.com/bramstein/sfnt2woff-zopfli/tree/64833aa89615b59b25f887443dfd344f24bbe3dc
(the original Mozilla import, before Zopfli was introduced).

MPL source and notices obligations apply when distributing the covered executable,
even without changes. A larger application may remain under its own license;
covered source and modifications retain their applicable MPL obligations. When
redistributing a bare WASM file, retain these notices and make its corresponding
covered source available as required by MPL 1.1. This package includes source to
make that possible; application distributors must preserve the source arrangement.

## Google WOFF2 and Brotli

Google WOFF2: Copyright 2014 Google Inc. MIT license.
Google Brotli: Copyright 2009, 2010, 2013–2016 by the Brotli Authors. MIT license.
Full upstream notices are copied in the `woff2-codec` package under
`upstream-source/licenses/` and preserved in `vendor/woff2/LICENSE` and
`vendor/brotli/LICENSE`. Source pins are in `vendor/SOURCES.json`.

## zlib

Copyright (C) 1995–2026 Jean-loup Gailly and Mark Adler. zlib license.
The full license is preserved in `vendor/zlib/LICENSE` and the WOFF1 package's
`upstream-source/zlib/LICENSE`. Vendored version: 1.3.2.

## Emscripten runtime

WASM builds use Emscripten 6.0.9, including its emmalloc allocator and libc/libc++
runtime components. Emscripten is MIT/NCSA licensed; LLVM/libc++ and musl retain
their upstream notices. Toolchain license files are shipped with each codec in
`upstream-source/toolchain-licenses/` by the build script.

## Test fonts

Open Sans 1.10 (Google Corporation) and Rochester 1.005 (Font Diner, Inc. DBA
Sideshow): Apache License 2.0. See `test/fixtures/README.md` and
`test/fixtures/LICENSE-APACHE-2.0`. They are not included in npm packages.

Google Zopfli 1.0.3 (2019-11-27), original C encoder, copyright Google Inc., Apache-2.0. The unmodified source and license are in `vendor/zopfli` and the WOFF1 package source bundle.

[package-release-source]: https://github.com/jlarmstrongiv/web-font-codecs/tags
[package-release-archive]: https://github.com/jlarmstrongiv/web-font-codecs/tags
