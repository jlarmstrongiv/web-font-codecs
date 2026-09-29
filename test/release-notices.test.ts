import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderReleaseNotice } from '../scripts/release-notices.ts';

test('package source notices follow the package version without rewriting upstream pins', async () => {
  const repository = 'https://github.com/jlarmstrongiv/web-font-codecs';
  for (const name of ['LICENSING.md', 'THIRD-PARTY-NOTICES.md']) {
    const template = await readFile(new URL(`../${name}`, import.meta.url), 'utf8');
    assert.ok(template.includes(`[package-release-source]: ${repository}/tags`));
    assert.doesNotMatch(template, /web-font-codecs\/(?:tree|archive\/refs\/tags)\/v\d/);
    for (const version of ['2.3.4', '12.34.56']) {
      const rendered = renderReleaseNotice(template, version);
      assert.ok(rendered.includes(`[package-release-source]: ${repository}/tree/v${version}/`));
      if (name === 'THIRD-PARTY-NOTICES.md') {
        assert.ok(rendered.includes(`[package-release-archive]: ${repository}/archive/refs/tags/v${version}.tar.gz`));
      }
      const prose = (text: string) => text.split('\n').filter(line => !line.startsWith('[package-release-')).join('\n');
      assert.equal(prose(rendered), prose(template), 'Release substitution preserves all other notice text and upstream pins');
    }
  }
});
