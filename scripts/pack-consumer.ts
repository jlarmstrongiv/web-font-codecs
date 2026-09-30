import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { run as runProcess } from './process.ts';
import assert from 'node:assert/strict';
const root = resolve('.'), dir = (await mkdtemp(join(tmpdir(), 'web-font-pack-')));
const env = { ...process.env, NODE_OPTIONS: '' };
async function run(command: string, args: string[], cwd = root): Promise<string> {
  return (await runProcess(command,args,{cwd,env})).stdout.toString();
}
try {
  await run(process.execPath,['scripts/build.ts']);
  for (const codec of ['woff1', 'woff2']) {
    const files = await readdir(`packages/${codec}-codec/upstream-source`, { recursive: true });
    assert.ok(files.every(file => !file.replaceAll('\\', '/').split('/').includes('.git')), `${codec} source bundle excludes Git checkout metadata`);
  }
  const packages = ['web-font-codecs-core','woff1-codec','woff2-codec','web-font-codecs','web-font-codecs-cli'];
  const tarballs: string[] = [];
  for (const name of packages) {
    const packed = JSON.parse(await run('npm',['pack','--ignore-scripts','--workspace',name,'--pack-destination',dir,'--json'])) as Record<string, { filename: string; files: { path: string }[] }>;
    const entry = packed[name]!;
    assert.ok(entry.files.every(file => !file.path.split('/').includes('.git')), `${name} excludes Git checkout metadata`);
    assert.ok(entry.files.some(f=>f.path==='dist/index.d.ts'));
    assert.ok(entry.files.some(f=>f.path==='dist/index.d.ts.map'));
    if (name==='woff1-codec') for(const file of ['upstream-source/mozilla-woff/woff.c','upstream-source/build-woff1.ts','upstream-source/adapter.c','upstream-source/process.ts','upstream-source/LICENSE-MIT','upstream-source/compression.c','upstream-source/zopfli/COPYING','upstream-source/zopfli/src/zopfli/zopfli.h','upstream-source/zlib/zlib.h','upstream-source/CHANGES.md','LICENSE']) assert.ok(entry.files.some(f=>f.path===file),file);
    tarballs.push(join(dir,entry.filename));
  }
  await writeFile(join(dir,'package.json'),JSON.stringify({private:true,type:'module'}));
  await run('npm',['install','--ignore-scripts','--no-audit','--no-fund',...tarballs],dir);
  for (const name of packages) {
    const installed = join(dir, 'node_modules', name);
    const { version } = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8')) as { version: string };
    for (const notice of ['LICENSING.md', 'THIRD-PARTY-NOTICES.md']) {
      const text = await readFile(join(installed, notice), 'utf8');
      assert.ok(text.includes(`[package-release-source]: https://github.com/jlarmstrongiv/web-font-codecs/tree/v${version}/`), `${name}/${notice} matching source`);
      if (notice === 'THIRD-PARTY-NOTICES.md') assert.ok(text.includes(`[package-release-archive]: https://github.com/jlarmstrongiv/web-font-codecs/archive/refs/tags/v${version}.tar.gz`), `${name}/${notice} matching archive`);
    }
  }
  const font = join(root,'test/fixtures/Rochester.otf');
  await writeFile(join(dir,'consumer.mjs'),`import assert from 'node:assert/strict';\nimport {readFile} from 'node:fs/promises';\nimport {createFontConverter} from 'web-font-codecs';\nimport {createWoff1Codec} from 'woff1-codec';\nimport {createWoff2Codec} from 'woff2-codec';\nconst font = await readFile(${JSON.stringify(font)});\nfor(const create of [createWoff1Codec,createWoff2Codec]) {using codec=await create();const encoded=codec.encode(font);assert.deepEqual(encoded.warnings,[]);const decoded=codec.decode(encoded.data);assert.deepEqual(decoded.warnings,[]);assert.ok(decoded.data.length);}\nusing z=await createWoff1Codec();assert.ok(z.decode(z.encode(font,{compression:'zopfli',iterations:1}).data).data.length);\nusing converter=createFontConverter();assert.equal((await converter.convert(font,{to:'woff2'})).extension,'woff2');\n`);
  await run(process.execPath,['consumer.mjs'],dir);
  await writeFile(join(dir,'consumer.ts'),`import { createFontConverter } from 'web-font-codecs';\nimport {createWoff1Codec} from 'woff1-codec';\nusing converter = createFontConverter();\nconst result = await converter.convert(new Uint8Array(), {to:'woff2',encode:{quality:8}});\nconst bytes: Uint8Array<ArrayBuffer> = result.data;\nconst warnings: string[] = result.warnings;\nusing codec=await createWoff1Codec();codec.encode(bytes,{majorVersion:2,privateData:bytes});\ncodec.encode(bytes,{compression:'zopfli',iterations:15});\n// @ts-expect-error iterations are exclusive to Zopfli\ncodec.encode(bytes,{compression:'zlib',iterations:15});\n// @ts-expect-error explicit engine required for iterations\ncodec.encode(bytes,{iterations:15});\n// @ts-expect-error wrong encoder options\nvoid converter.convert(bytes,{to:'woff1',encode:{quality:5}});\n`);
  await writeFile(join(dir,'async-sources.ts'),`import type { WasmSource } from 'web-font-codecs';
import {createWoff1Codec} from 'woff1-codec';
import {createWoff2Codec} from 'woff2-codec';
const bytes = new Uint8Array();
const sources: WasmSource[] = [Promise.resolve(bytes), fetch('/codec.wasm'), WebAssembly.compile(bytes), new ReadableStream<Uint8Array>(), Promise.resolve(new ReadableStream<Uint8Array>()), Promise.resolve(new URL('file:///codec.wasm'))];
for (const wasm of sources) { using one = await createWoff1Codec({wasm}); using two = await createWoff2Codec({wasm}); }
`);
  await writeFile(join(dir,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2023',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2023','DOM'],types:[],strict:true,noEmit:true},include:['consumer.ts','async-sources.ts']}));
  await run(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--project','tsconfig.json'],dir);
  const cli=join(dir,'node_modules/.bin/web-font-codecs-cli');
  await run(cli,[font,'-o',join(dir,'font.woff')],dir);
  assert.equal((await readFile(join(dir,'font.woff'))).subarray(0,4).toString(),'wOFF');
  await run('npx',['--offline','web-font-codecs-cli',font,'-o',join(dir,'npx-font.woff')],dir);
  assert.equal((await readFile(join(dir,'npx-font.woff'))).subarray(0,4).toString(),'wOFF');
  console.log('All five packed packages: default JS, declarations/maps, WASM, source/licenses and CLI passed.');
} finally { await rm(dir,{recursive:true,force:true}); }
