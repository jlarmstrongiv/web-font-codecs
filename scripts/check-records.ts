/** Verify lockfile manifests and generated sample provenance. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createWoff1Codec } from 'woff1-codec';
import { createWoff2Codec } from 'woff2-codec';
const json=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
const lock=await json('package-lock.json');
for(const directory of ['.',...Object.keys(lock.packages).filter(path=>path.startsWith('packages/')&&!path.includes('node_modules'))]) {
  const manifest=await json(`${directory}/package.json`);
  for(const key of ['dependencies','devDependencies','optionalDependencies']) assert.deepEqual(manifest[key]??{},lock.packages[directory==='.'?'':directory]?.[key]??{},`${directory} ${key} matches lockfile`);
}
const artifacts=await json('native/artifacts.json');
const directory='packages/web-font-converter-web/public/samples';
const provenance=await json(`${directory}/provenance.json`);
assert.deepEqual(provenance.codecWasmSha256,artifacts.sha256);
for(const [name,record] of Object.entries(provenance.files) as [string,{sha256:string;bytes:number}][]) {
  const bytes=await readFile(`${directory}/${name}`);
  assert.equal(bytes.length,record.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256,name);
}
using one=await createWoff1Codec(),two=await createWoff2Codec();
const ttf=await readFile('test/fixtures/OpenSans-Regular.ttf');
assert.deepEqual(await readFile(`${directory}/OpenSans-Regular.ttf`),ttf);
assert.deepEqual(await readFile(`${directory}/Rochester.otf`),await readFile('test/fixtures/Rochester.otf'));
assert.deepEqual(Buffer.from(one.encode(ttf).data),await readFile(`${directory}/OpenSans-Regular.woff`));
assert.deepEqual(Buffer.from(two.encode(ttf,{quality:11,allowTransforms:true}).data),await readFile(`${directory}/OpenSans-Regular.woff2`));
console.log('Lockfile manifests, sample hashes and codec regeneration match.');
