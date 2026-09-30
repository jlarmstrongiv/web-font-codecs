/** Publish the tested tarballs using GitHub Actions OIDC, in dependency order. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { assertReleaseEvent, releasePackages } from './release-policy.ts';
import { run } from './process.ts';

const tag = assertReleaseEvent(process.env.GITHUB_EVENT_NAME, process.env.GITHUB_REF);
const version = tag.slice(1);
const directory = '.cache/release-assets';
const manifest = JSON.parse(await readFile(`${directory}/release.json`, 'utf8'));
assert.equal(manifest.tag, tag);
assert.match(process.env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/);
assert.equal(manifest.commit, process.env.GITHUB_SHA);
assert.deepEqual(manifest.packages, [...releasePackages]);
assert.deepEqual((await readdir(directory)).sort(), [
  ...releasePackages.map(name => `${name}-${version}.tgz`), 'SHA256SUMS.txt', 'release.json',
].sort());
const sums = [];
for (const name of [...releasePackages].sort()) {
  const filename = `${name}-${version}.tgz`;
  const bytes = await readFile(`${directory}/${filename}`);
  sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${filename}`);
}
assert.equal(await readFile(`${directory}/SHA256SUMS.txt`, 'utf8'), sums.join('\n') + '\n');

for (const name of releasePackages) {
  const tarball = `${directory}/${name}-${version}.tgz`;
  const response = await fetch(`https://registry.npmjs.org/${name}/${version}`);
  if (response.ok) {
    const existing = await response.json() as { dist: { integrity: string } };
    const integrity = `sha512-${createHash('sha512').update(await readFile(tarball)).digest('base64')}`;
    assert.equal(existing.dist.integrity, integrity, `${name}@${version} already exists with different contents`);
    console.log(`${name}@${version} already published with identical contents`);
    continue;
  }
  assert.equal(response.status, 404, `Cannot check ${name}@${version}: HTTP ${response.status}`);
  await run('npm', ['publish', tarball, '--access=public', '--tag=latest', '--ignore-scripts', '--registry=https://registry.npmjs.org/'], { stdio: 'inherit' });
}
