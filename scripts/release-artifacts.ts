/** Pack already-tested outputs without rerunning build hooks; nothing is published. */
import { execute } from './process.ts';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { releasePackages, releaseVersion } from './release-policy.ts';
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? '';
releaseVersion(tag);
const preflight = await execute(process.execPath, ['scripts/verify-release.ts', tag], {stdio:'inherit'});
assert.equal(preflight.status, 0, 'Release preflight');
const destination = resolve('.cache/release-assets');
await mkdir(destination, {recursive:true});
assert.deepEqual(await readdir(destination), [], 'Release asset destination must be empty');
for (const name of releasePackages) {
  const packed = await execute('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', destination, `--workspace=${name}`]);
  assert.equal(packed.status, 0, packed.stderr.toString());
  const parsed = JSON.parse(packed.stdout.toString()) as Record<string,{filename:string}>;
  const records = Object.values(parsed);
  assert.equal(records.length, 1);
  console.log(records[0]!.filename);
}
const hashes:string[]=[];
for(const filename of (await readdir(destination)).sort()) hashes.push(`${createHash('sha256').update(await readFile(resolve(destination,filename))).digest('hex')}  ${filename}`);
await writeFile(resolve(destination,'SHA256SUMS.txt'),hashes.join('\n')+'\n');
await writeFile(resolve(destination,'release.json'),JSON.stringify({tag,commit:process.env.GITHUB_SHA??null,packages:[...releasePackages]},null,2)+'\n');
