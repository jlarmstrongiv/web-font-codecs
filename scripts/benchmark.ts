// SPDX-License-Identifier: MIT
// End-to-end synchronous public API measurements, deliberately outside CI gates.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWoff1Codec } from 'woff1-codec';
import type { Woff1EncodeOptions } from 'woff1-codec';
import { createWoff2Codec } from 'woff2-codec';
import type { Woff2EncodeOptions } from 'woff2-codec';
import { validateFont } from 'web-font-codecs-core';
import { wasmInputsHash } from './wasm-inputs.ts';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const args = process.argv.slice(2);
if (args.some(arg => !['--quick', '--full'].includes(arg)) || args.length > 1) throw new Error('Usage: npm run benchmark -- [--quick|--full]');
const profile = args.includes('--full') ? 'full' : 'quick';
const repeats = profile === 'full' ? 7 : 3;
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const fixtures = ['OpenSans-Regular.ttf', 'Rochester.otf', ...['variable-truetype.ttf','variable-cff2.otf','cjk.otf','color-colrv1.ttf'].map(name => `corpus/${name}`)];
type Config = { label: string; kind: 'woff1'; options: Woff1EncodeOptions } | { label: string; kind: 'woff2'; options: Woff2EncodeOptions };
const configs: Config[] = [
  { label: 'zlib', kind: 'woff1', options: { compression: 'zlib' } },
  ...(profile === 'full' ? [1,5,15,30] : [1,15]).map(iterations => ({ label: `zopfli-${iterations}`, kind: 'woff1' as const, options: { compression: 'zopfli' as const, iterations } })),
  ...[4,8,11].map(quality => ({ label: `woff2-q${quality}`, kind: 'woff2' as const, options: { quality, allowTransforms: true } })),
  { label: 'woff2-q11-no-transforms', kind: 'woff2', options: { quality: 11, allowTransforms: false } },
];
function summary(samples: number[]) {
  const sorted = [...samples].sort((a,b)=>a-b);
  return { medianMs: sorted[Math.floor(sorted.length/2)]!, minMs: sorted[0]!, maxMs: sorted.at(-1)!, samplesMs: samples };
}
function tables(bytes: Uint8Array) {
  validateFont(bytes, 'sfnt', 512*1024*1024);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), result = new Map<string, Uint8Array>();
  for (let i=0;i<view.getUint16(4);i++) {
    const p=12+i*16, tag=new TextDecoder().decode(bytes.subarray(p,p+4));
    const value=Uint8Array.from(bytes.subarray(view.getUint32(p+8),view.getUint32(p+8)+view.getUint32(p+12)));
    if(tag==='head') value.fill(0,8,12); // Whole-font checksum depends on repacking.
    result.set(tag,value);
  }
  return result;
}
function verify(input: Uint8Array, decoded: Uint8Array, transformed: boolean) {
  const expected=tables(input), actual=tables(decoded);
  if(transformed && !actual.has('DSIG')) expected.delete('DSIG'); // Google removes obsolete signatures.
  assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort());
  for(const[tag,bytes]of expected) {
    // Google can canonicalize TrueType glyph serialization/loca and head flags.
    if(transformed && ['glyf','loca','head'].includes(tag)) continue;
    assert.deepEqual(actual.get(tag), bytes, `Round-trip table mismatch: ${tag}`);
  }
}
const build = JSON.parse(await readFile('native/artifacts.json','utf8')) as {inputsSha256:string;sha256:{woff1:string;woff2:string}};
assert.equal(build.inputsSha256,await wasmInputsHash(),'WASM inputs changed: run npm run build:wasm first');
for(const kind of ['woff1','woff2'] as const) assert.equal(hash(await readFile(`packages/${kind}-codec/wasm/codec.wasm`)),build.sha256[kind],'WASM artifact hash mismatch');
const startedAt = new Date().toISOString();
// Fail on preservation regressions before spending minutes on Zopfli timings.
for(const fixture of fixtures) {
  const input=await readFile(`test/fixtures/${fixture}`);
  using one=await createWoff1Codec(),two=await createWoff2Codec();
  verify(input,one.decode(one.encode(input).data).data,false); verify(input,two.decode(two.encode(input,{quality:4}).data).data,true);
}
const results = [];
for(const fixture of fixtures) {
  const input=await readFile(`test/fixtures/${fixture}`);
  for(const config of configs) {
    const rssBefore=process.memoryUsage().rss;
    const initStart=performance.now();
    const {codec,encode} = await (async () => {
      if(config.kind==='woff1') {
        const codec=await createWoff1Codec();
        return {codec,encode:()=>codec.encode(input,config.options)};
      }
      const codec=await createWoff2Codec();
      return {codec,encode:()=>codec.encode(input,config.options)};
    })();
    using ownedCodec = codec;
    const initializationMs=performance.now()-initStart;
    const coldStart=performance.now(), encoded=encode();
    const firstEncodeMs=performance.now()-coldStart;
    const coldDecodeStart=performance.now(), decoded=codec.decode(encoded.data);
    const firstDecodeMs=performance.now()-coldDecodeStart;
    verify(input,decoded.data,config.kind==='woff2');
    // One additional warm-up. Validation/hashing never occurs in timed intervals.
    encode(); codec.decode(encoded.data);
    const encodeTimes:number[]=[], decodeTimes:number[]=[];
    for(let i=0;i<repeats;i++) {
      const t=performance.now(), output=encode(); encodeTimes.push(performance.now()-t);
      assert.deepEqual(output.data,encoded.data);
      const d=performance.now(), roundtrip=codec.decode(encoded.data); decodeTimes.push(performance.now()-d);
      verify(input,roundtrip.data,config.kind==='woff2');
    }
    results.push({ fixture, inputBytes:input.length, inputSha256:hash(input), ...config,
      outputBytes:encoded.data.length, outputSha256:hash(encoded.data), outputToInputRatio:encoded.data.length/input.length,
      warnings:encoded.warnings, removedTables:[...tables(input).keys()].filter(tag=>!tables(decoded.data).has(tag)), initializationMs, firstEncodeMs, firstDecodeMs,
      encode:summary(encodeTimes), decode:summary(decodeTimes),
      processRssBytesBefore:rssBefore, processRssBytesAfter:process.memoryUsage().rss });
    console.log(`${fixture} ${config.label}: ${encoded.data.length} bytes, encode ${summary(encodeTimes).medianMs.toFixed(2)} ms`);
  }
}
const report = {
  schemaVersion:2, profile, repeats, startedAt, completedAt:new Date().toISOString(),
  environment:{node:process.version,v8:process.versions.v8},
  build,
  wasm:await Promise.all(['woff1-codec','woff2-codec'].map(async name=>{const b=await readFile(`packages/${name}/wasm/codec.wasm`);return{name,bytes:b.length,sha256:hash(b)};})),
  upstreamSources:JSON.parse(await readFile('vendor/SOURCES.json','utf8')) as unknown,
  corpusProvenance:JSON.parse(await readFile('test/fixtures/corpus/provenance.json','utf8')) as unknown,
  originalFixtureProvenance:await readFile('test/fixtures/README.md','utf8'),
  scriptSha256:hash(await readFile(fileURLToPath(import.meta.url))),
  memoryNotes:'RSS samples are whole-process observations, include JS/WASM/JIT/previous instances, and are not allocation peaks or per-codec memory. WASM memory capacity and native heap peaks are not measured. Disposing an instance does not force garbage collection.',
  timingNotes:'Sequential fixed order, one new instance per row; first call plus one warm-up, then repeated public API calls (includes validation/copies/allocations). Initialization includes file loading and compilation/instantiation but may benefit from OS/V8 cache; first calls are not guaranteed process-cold. Hash/table validation is outside timers. Ratios are output/input. No CI performance thresholds.',
  validationNotes:'Every decoded font passes structural validation and table-set equality except permitted WOFF2 DSIG removal (recorded per row). Table bytes must match, ignoring head checksum adjustment; for WOFF2 head/glyf/loca are excluded because canonicalization may change representation. This is not a full glyph geometry equivalence test.',
  results,
};
await mkdir('benchmarks',{recursive:true});
const destination=resolve(`benchmarks/${profile}.json`);
await writeFile(destination,JSON.stringify(report,null,2)+'\n');
console.log(`Saved ${destination}`);
