import assert from 'node:assert/strict';
export const releasePackages = ['web-font-codecs', 'woff1-codec', 'woff2-codec', 'web-font-converter', 'web-font-converter-cli'] as const;
export function releaseVersion(tag: string): string {
  assert.match(tag, /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'Release tags must be stable vX.Y.Z versions');
  return tag.slice(1);
}
export function assertReleaseEvent(event: string | undefined, ref: string | undefined): string {
  assert.equal(event, 'push', 'Publishing requires a pushed version tag');
  assert.equal(typeof ref, 'string', 'Publishing requires a ref');
  assert.ok(ref && ref.startsWith('refs/tags/'), 'Publishing requires a tag ref');
  releaseVersion(ref.slice('refs/tags/'.length));
  return ref.slice('refs/tags/'.length);
}
export function pagesBase(repository: string): string {
  assert.match(repository, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'Expected owner/repository');
  const [owner, name] = repository.split('/') as [string, string];
  return name.toLowerCase() === `${owner.toLowerCase()}.github.io` ? '/' : `/${name}/`;
}
