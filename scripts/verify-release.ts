/** Read-only release preflight; an argument supports local dry runs without tags. */
import { readFile, appendFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { assertReleaseEvent, pagesBase, releasePackages, releaseVersion } from './release-policy.ts';
const tag = process.argv[2] ?? assertReleaseEvent(process.env.GITHUB_EVENT_NAME, process.env.GITHUB_REF);
const version = releaseVersion(tag);
const lock = JSON.parse(await readFile('package-lock.json', 'utf8')) as { packages: Record<string, {version?: string; dependencies?: Record<string, string>}> };
for (const name of releasePackages) {
  const path = `packages/${name}`;
  const pkg = JSON.parse(await readFile(`${path}/package.json`, 'utf8')) as {name: string; version: string; private?: boolean; dependencies?: Record<string, string>};
  assert.equal(pkg.name, name);
  assert.notEqual(pkg.private, true);
  assert.equal(pkg.version, version, `${name} does not match ${tag}`);
  assert.equal(lock.packages[path]?.version, version, `${name} lockfile version`);
  for (const dependency of releasePackages) if (pkg.dependencies?.[dependency] !== undefined) {
    assert.equal(pkg.dependencies[dependency], version, `${name} -> ${dependency}`);
    assert.equal(lock.packages[path]?.dependencies?.[dependency], version, `${name} lockfile dependency ${dependency}`);
  }
}
const base = pagesBase(process.env.GITHUB_REPOSITORY ?? 'local/web-font-codecs');
if (process.env.GITHUB_OUTPUT && !process.argv[2]) await appendFile(process.env.GITHUB_OUTPUT, `pages-base=${base}\n`);
console.log(`${tag}: five package versions/dependencies and lockfile match; Pages base ${base}`);
