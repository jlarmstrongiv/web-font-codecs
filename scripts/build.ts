import { wasmInputsHash } from './wasm-inputs.ts';
import { renderReleaseNotice } from './release-notices.ts';
import { createHash } from 'node:crypto';
import { rolldown } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
const sourceCopyOptions = { recursive: true, filter: (source: string) => basename(source) !== '.git' };
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const artifacts = JSON.parse((await readFile('native/artifacts.json','utf8'))) as { inputsSha256: string; sha256: Record<string,string> };
if (artifacts.inputsSha256 !== await wasmInputsHash()) throw new Error('WASM source inputs changed: run npm run build:wasm before packaging');
for (const codec of ['woff1','woff2']) {
  const file = `packages/${codec}-codec/wasm/codec.wasm`;
  const bytes = await readFile(file).catch((cause: NodeJS.ErrnoException) => {
    if (cause.code === 'ENOENT') throw new Error(`Missing ${codec} WASM: run npm run check:source to build it`, { cause });
    throw cause;
  });
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== artifacts.sha256[codec]) throw new Error(`${codec} WASM hash mismatch: rebuild from source`);
}
const packages = ['web-font-codecs', 'woff1-codec', 'woff2-codec', 'web-font-converter', 'web-font-converter-cli'];
const selected = process.argv[2];
if (selected && !packages.includes(selected)) throw new Error(`Unknown package: ${selected}`);
for (const name of selected ? [selected] : packages) {
  const root = `packages/${name}`;
  await rm(`${root}/dist`, { recursive: true, force: true });
  const entries: Record<string, string> = { index: `${root}/src/index.ts` };
  if (name === 'woff1-codec' || name === 'woff2-codec') entries.node = `${root}/src/node.ts`;
  if (name === 'web-font-converter-cli') entries.cli = `${root}/src/cli.ts`;
  const bundle = await rolldown({ input: entries, external: [...packages, /^node:/], plugins: [dts({ tsconfig: `${root}/tsconfig.json`, sourcemap: true })] });
  await bundle.write({ dir: `${root}/dist`, format: 'es', sourcemap: true });
  await bundle.close();
  await cp('LICENSE', `${root}/LICENSE`);
  const packageVersion = (JSON.parse((await readFile(`${root}/package.json`, 'utf8'))) as { version: string }).version;
  for (const notice of ['LICENSING.md', 'THIRD-PARTY-NOTICES.md']) {
    const text = renderReleaseNotice(await readFile(notice, 'utf8'), packageVersion);
    await writeFile(`${root}/${notice}`, text);
  }
  if (name === 'woff1-codec') {
    // Ship the complete MPL-covered source plus adapter/build instructions in the tarball.
    const source = `${root}/upstream-source`;
    await rm(source, { recursive: true, force: true });
    await mkdir(source, { recursive: true });
    await cp('vendor/woff1', `${source}/mozilla-woff`, sourceCopyOptions);
    await cp('LICENSE-MPL-1.1', `${source}/mozilla-woff/LICENSE-MPL-1.1`);
    await cp('native/woff1.c', `${source}/adapter.c`);
    await cp('native/compression.c', `${source}/compression.c`);
    await cp('vendor/zopfli', `${source}/zopfli`, sourceCopyOptions);
    await cp('vendor/zlib', `${source}/zlib`, sourceCopyOptions);
    await cp('native/build-woff1.ts', `${source}/build-woff1.ts`);
    await cp('scripts/process.ts', `${source}/process.ts`);
    await cp('LICENSE', `${source}/LICENSE-MIT`);
    await cp('native/CHANGES.md', `${source}/CHANGES.md`);
    await cp('native/SOURCE-README.md', `${source}/README.md`);
    await cp('vendor/SOURCES.json', `${source}/SOURCES.json`);
    await writeFile(`${source}/mise.toml`, '[tools]\nnode = "24.21.0"\npython = "3.14.7"\nemsdk = "6.0.9"\n');
    await cp('LICENSE-MPL-1.1', `${root}/LICENSE`);
    await cp('LICENSE-MPL-1.1', `${source}/LICENSE-MPL-1.1`);
  }
  if (name === 'woff1-codec' || name === 'woff2-codec') {
    await cp('vendor/toolchain-licenses', `${root}/upstream-source/toolchain-licenses`, { recursive: true });
  }
  if (name === 'woff2-codec') {
    await mkdir(`${root}/upstream-source/licenses`, { recursive: true });
    await cp('vendor/woff2/LICENSE', `${root}/upstream-source/licenses/WOFF2-LICENSE`);
    await cp('vendor/brotli/LICENSE', `${root}/upstream-source/licenses/BROTLI-LICENSE`);
    await cp('vendor/SOURCES.json', `${root}/upstream-source/SOURCES.json`);
  }
  console.log(`Built ${name}`);
}
