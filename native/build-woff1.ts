/* SPDX-License-Identifier: MPL-1.1
 * Copyright (c) 2026 John L. Armstrong IV. See LICENSE-MPL-1.1 / package LICENSE.
 * This WOFF1-specific file is subject to Mozilla Public License 1.1.
 */
/** Rebuild the packaged codec from this source bundle: mise exec -- node build-woff1.ts */
import { readdir } from 'node:fs/promises';
import { execute } from './process.ts';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('.', import.meta.url)));
const python = await execute('mise', ['where', 'python@3.14.7']);
if (python.status !== 0) throw new Error('Install the pinned Python with mise install python');
process.env.EMSDK_PYTHON = `${python.stdout.toString().trim()}/bin/python3`;
const version = await execute('emcc', ['--version']);
if (!version.stdout.includes('6.0.9')) throw new Error('Use the pinned Emscripten 6.0.9 from mise.toml');
const zlib = ['adler32','compress','crc32','deflate','inflate','inffast','inftrees','trees','uncompr','zutil'].map(n => `zlib/${n}.c`);
const hook = await execute('emcc', ['-O3','-DNDEBUG','-fno-ident','-ffile-prefix-map=' + process.cwd() + '=.', '-Izlib','-Dcompress2=codec_compress2','-c','mozilla-woff/woff.c','-o','mozilla-woff.o'], {stdio:'inherit'});
if (hook.status !== 0) throw new Error('Mozilla hook build failed');
const zopfli = (await readdir('zopfli/src/zopfli')).filter(f => f.endsWith('.c') && f !== 'zopfli_bin.c').sort().map(f => `zopfli/src/zopfli/${f}`);
const result = await execute('emcc', ['-O3','-DNDEBUG','-fno-ident','-ffile-prefix-map=' + process.cwd() + '=.', '-Izopfli/src/zopfli','-Imozilla-woff','-Izlib','adapter.c','compression.c','mozilla-woff.o',...zlib,...zopfli,'--no-entry','-sSTANDALONE_WASM=1','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=2147483648','-sSTACK_SIZE=1048576','-sMALLOC=emmalloc','-sFILESYSTEM=0','-sASSERTIONS=0','-sEXPORTED_FUNCTIONS=["_malloc","_free","_codec_run","_codec_size","_codec_status","_codec_release"]','-o','codec.wasm'], { stdio: 'inherit' });

if (result.status !== 0) throw new Error(`emcc failed: ${result.status}`);
