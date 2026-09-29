# Corresponding WOFF1 source

This directory is shipped inside every `woff1-codec` tarball. It contains the
complete Mozilla covered source, unchanged original interface headers, our
MPL-1.1 C ABI adapter, zlib, build script, license notices and change record.
The original tri-license notices remain intact; we use their MPL 1.1 option.

To rebuild (no npm dependencies required):

    mise trust
    mise install
    mise exec -- node build-woff1.ts

This produces `codec.wasm` in the current directory with the same code and compiler
settings as the package's `wasm/codec.wasm`. Source paths are different from the
monorepo, so binary byte identity is not promised for the source-bundle build.
The WASM exports memory, malloc/free, codec_run/size/status/release and _initialize.
`adapter.c` defines the ABI. The package's `src/` directory supplies the complete
TypeScript binding and public interface definitions. Emscripten 6.0.9 provisions
the pinned compiler, allocator, libc and libc++; their licenses accompany this
bundle, and the toolchain source is https://github.com/emscripten-core/emscripten/tree/6.0.9.

Modified covered files must retain the relevant MPL notices and source availability
obligations. The date and description of this distribution's changes are in CHANGES.md.

## Selectable compression, unchanged upstream source

Mozilla `woff.c`/`woff.h` and Google Zopfli are pristine. Our `compression.c` defines a bounded `compress2`-compatible adapter. Only the Mozilla translation unit is built with `-Dcompress2=codec_compress2`. This intercepts its two compression calls (font tables and XML metadata); zlib itself is compiled normally. The default delegates directly to zlib. Zopfli emits a standard zlib stream; if its stream exceeds Mozilla's zlib `compressBound` allocation, the adapter falls back to bounded zlib compression. Mozilla retains its original uncompressed-table fallback, checksums, metadata and private-data logic. Decoding always uses zlib. The adapter frees Zopfli's output allocation after copying it. A WASM allocation trap invalidates that codec instance; callers can initialize a new one.

Options: `compression: 'zlib'` (default), or `compression: 'zopfli'` with optional integer `iterations` 1–100 (default 15). Iterations with zlib are rejected. Zopfli is CPU intensive; browser usage belongs in a terminable worker. Zero upstream files/lines are changed; replay consists only of the compiler flag and our separate adapter.

The compiler requires Python >=3.10. Bootstrap with `mise install python node` then `EMSDK_PYTHON="$(mise where python@3.14.7)/bin/python3" mise install emsdk`. The build helper selects the pinned Python explicitly. Zopfli sources and Apache-2.0 license are included beside Mozilla and zlib in the source bundle.
