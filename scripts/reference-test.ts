/** Native reference parity uses the same pinned, unmodified upstream codec sources. */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { run as runProcess } from './process.ts';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createWoff1Codec } from 'woff1-codec';
import { createWoff2Codec } from 'woff2-codec';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
async function run(command: string, args: string[]): Promise<void> {
  await runProcess(command, args, { stdio: 'inherit' });
}
await mkdir('.cache/reference/corpus', { recursive: true });
const zlib = ['adler32','compress','crc32','deflate','inflate','inffast','inftrees','trees','uncompr','zutil'].map(n => `vendor/zlib/${n}.c`);
await run('cc', ['-O2','-Ivendor/zlib','-Dcompress2=codec_compress2','-c','vendor/woff1/woff.c','-o','.cache/reference/mozilla-woff.o']);
const zopfli = (await readdir('vendor/zopfli/src/zopfli')).filter(f => f.endsWith('.c') && f !== 'zopfli_bin.c').sort().map(f => `vendor/zopfli/src/zopfli/${f}`);
await run('cc', ['-O2','-Ivendor/zopfli/src/zopfli','-Ivendor/woff1','-Ivendor/zlib','native/reference.c','native/woff1.c','native/compression.c','.cache/reference/mozilla-woff.o',...zlib,...zopfli,'-lm','-o','.cache/reference/woff1']);
// Also compare the untouched Mozilla/zlib path without the compression hook.
await run('cc', ['-O2','-Ivendor/zopfli/src/zopfli','-Ivendor/woff1','-Ivendor/zlib','native/reference.c','native/woff1.c','native/compression.c','vendor/woff1/woff.c',...zlib,...zopfli,'-lm','-o','.cache/reference/mozilla-original']);
const sources = (await Promise.all(['common','dec','enc'].map(async dir => (await readdir(`vendor/brotli/c/${dir}`)).filter(n => n.endsWith('.c')).sort().map(n => `vendor/brotli/c/${dir}/${n}`)))).flat();
const objects: string[] = [];
for (const file of sources) {
  const output = `.cache/reference/${file.replaceAll('/','_')}.o`;
  await run('cc', ['-O2','-Ivendor/brotli/c/include','-c',file,'-o',output]); objects.push(output);
}
const woff2 = ['table_tags','variable_length','woff2_common','woff2_dec','woff2_out','font','glyph','normalize','transform','woff2_enc'].map(n => `vendor/woff2/src/${n}.cc`);
await run('c++', ['-O2','-std=c++11','-DWOFF2_REFERENCE','-Ivendor/woff2/include','-Ivendor/brotli/c/include','native/reference.c','native/woff2.cc',...woff2,...objects,'-o','.cache/reference/woff2']);
for (const [name, create] of [['woff1', createWoff1Codec], ['woff2', createWoff2Codec]] as const) {
  using codec = await create();
  for (const font of ['OpenSans-Regular.ttf','Rochester.otf','corpus/variable-truetype.ttf','corpus/variable-cff2.otf','corpus/cjk.otf','corpus/color-colrv1.ttf']) {
    const input = `test/fixtures/${font}`, encoded = `.cache/reference/${font}.${name}`, decoded = `${encoded}.sfnt`;
    await run(`.cache/reference/${name}`, ['encode',input,encoded]);
    const wasm = codec.encode((await readFile(input))).data;
    if(name === 'woff1') {
      await run('.cache/reference/mozilla-original',['encode',input,`${encoded}.original`]);
      assert.deepEqual(wasm,new Uint8Array((await readFile(`${encoded}.original`))),'Default zlib is byte-identical to unhooked Mozilla');
    }
    assert.deepEqual(wasm, new Uint8Array((await readFile(encoded))), `${name}: native/WASM encoding parity (${font})`);
    await run(`.cache/reference/${name}`, ['decode',encoded,decoded]);
    assert.deepEqual(codec.decode(wasm).data, new Uint8Array((await readFile(decoded))), `${name}: native/WASM decoding parity (${font})`);
    console.log(`${name} ${font}: native and WASM encode/decode byte-identical`);
  }
}

using zopfliCodec = await createWoff1Codec();
for (const font of ['OpenSans-Regular.ttf','Rochester.otf','corpus/variable-truetype.ttf','corpus/variable-cff2.otf','corpus/cjk.otf','corpus/color-colrv1.ttf']) {
  const input = `test/fixtures/${font}`, output = `.cache/reference/${font}.zopfli.woff`;
  await run('.cache/reference/woff1',['encode',input,output,'zopfli']);
  const result=zopfliCodec.encode((await readFile(input)),{compression:'zopfli'}).data;
  assert.deepEqual(result,new Uint8Array((await readFile(output))),`Zopfli native/WASM parity: ${font}`);
  await run('.cache/reference/woff1',['decode',output,`${output}.sfnt`]);
  assert.deepEqual(zopfliCodec.decode(result).data,new Uint8Array((await readFile(`${output}.sfnt`))));
  console.log(`Zopfli ${font}: native/WASM encode and zlib decode parity`);
}
