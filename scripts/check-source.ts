/** Build WASM from source and compare it with the checked-in provenance hashes. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execute } from './process.ts';
import assert from 'node:assert/strict';
const manifest = 'native/artifacts.json';
const before = await readFile(manifest);
const expected = JSON.parse(before.toString()) as { sha256: Record<string, string> };
const result=await execute('npm',['run','build:wasm'],{stdio:'inherit'});

assert.equal(result.status,0,'Source WASM build');
assert.deepEqual(await readFile(manifest), before, 'WASM provenance drifted; review and regenerate artifacts intentionally');
for (const codec of ['woff1', 'woff2']) {
  const file = `packages/${codec}-codec/wasm/codec.wasm`;
  const actual = createHash('sha256').update(await readFile(file)).digest('hex');
  assert.equal(actual, expected.sha256[codec], `Built ${file} differs from its recorded hash`);
}
console.log('Source-built WASM matches the recorded hashes and provenance.');
