import { wasmInputsHash } from './wasm-inputs.ts';
import { access, mkdir, readdir, writeFile, readFile } from 'node:fs/promises';
import { run as runProcess } from './process.ts';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
await Promise.all(['bramstein/sfnt2woff-zopfli/woff.c', 'google/woff2/src/woff2_enc.cc', 'google/brotli/c/include/brotli/encode.h', 'madler/zlib/zlib.h', 'google/zopfli/src/zopfli/zopfli.h'].map(async file => {
  try { await access(`submodules/${file}`); }
  catch (cause) { throw new Error('Initialize pinned sources with git submodule update --init before building', { cause }); }
}));
async function run(command: string, args: string[]): Promise<void> {
  await runProcess(command, args, { stdio: 'inherit' });
}
const python = await runProcess('mise', ['where', 'python@3.14.7']);
if (python.status !== 0) throw new Error('Install the pinned Python with mise install python');
process.env.EMSDK_PYTHON = `${python.stdout.toString().trim()}/bin/python3`;
const version = await runProcess('emcc', ['--version']);
if (!version.stdout.includes('6.0.9')) throw new Error('Use the pinned Emscripten: mise install && mise exec -- npm run build:wasm');
await mkdir('.cache/objects', { recursive: true });
const flags = ['-O3', '-DNDEBUG', '-fno-ident', '-ffile-prefix-map=' + process.cwd() + '=.'];
const link = ['--no-entry', '-sSTANDALONE_WASM=1', '-sALLOW_MEMORY_GROWTH=1', '-sINITIAL_MEMORY=16777216', '-sMAXIMUM_MEMORY=2147483648', '-sSTACK_SIZE=1048576', '-sMALLOC=emmalloc', '-sFILESYSTEM=0', '-sASSERTIONS=0', '-sEXPORTED_FUNCTIONS=["_malloc","_free","_codec_run","_codec_size","_codec_status","_codec_release"]'];
const zlib = ['adler32','compress','crc32','deflate','inflate','inffast','inftrees','trees','uncompr','zutil'].map(n => `submodules/madler/zlib/${n}.c`);
await mkdir('packages/woff1-codec/wasm', { recursive: true });
await run('emcc', [...flags, '-Isubmodules/madler/zlib', '-Dcompress2=codec_compress2', '-c', 'submodules/bramstein/sfnt2woff-zopfli/woff.c', '-o', '.cache/objects/mozilla-woff.o']);
const zopfli = (await readdir('submodules/google/zopfli/src/zopfli')).filter(f => f.endsWith('.c') && f !== 'zopfli_bin.c').sort().map(f => `submodules/google/zopfli/src/zopfli/${f}`);
await run('emcc', [...flags, '-Isubmodules/google/zopfli/src/zopfli', '-Isubmodules/bramstein/sfnt2woff-zopfli', '-Isubmodules/madler/zlib', 'native/woff1.c', 'native/compression.c', '.cache/objects/mozilla-woff.o', ...zlib, ...zopfli, ...link, '-o', 'packages/woff1-codec/wasm/codec.wasm']);
const brotli = (await Promise.all(['common','dec','enc'].map(async dir => (await readdir(`submodules/google/brotli/c/${dir}`)).filter(f => f.endsWith('.c')).sort().map(f => `submodules/google/brotli/c/${dir}/${f}`)))).flat();
const objects: string[] = [];
for (const source of brotli) {
  const object = `.cache/objects/${source.replaceAll('/', '_')}.o`;
  await run('emcc', [...flags, '-Isubmodules/google/brotli/c/include', '-c', source, '-o', object]);
  objects.push(object);
}
const woff2 = ['table_tags','variable_length','woff2_common','woff2_dec','woff2_out','font','glyph','normalize','transform','woff2_enc'].map(n => `submodules/google/woff2/src/${n}.cc`);
await mkdir('packages/woff2-codec/wasm', { recursive: true });
await run('em++', [...flags, '-std=c++11', '-fno-exceptions', '-Isubmodules/google/woff2/include', '-Isubmodules/google/brotli/c/include', 'native/woff2.cc', ...woff2, ...objects, ...link, '-o', 'packages/woff2-codec/wasm/codec.wasm']);
const artifacts = Object.fromEntries(await Promise.all(['woff1','woff2'].map(async codec => [codec, createHash('sha256').update((await readFile(`packages/${codec}-codec/wasm/codec.wasm`))).digest('hex')])));
await writeFile('native/artifacts.json', JSON.stringify({ emscripten: '6.0.9', inputsSha256: await wasmInputsHash(), sha256: artifacts }, null, 2) + '\n');
console.log('Built codecs from upstream sources:', artifacts);
