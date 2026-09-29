import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertReleaseEvent, pagesBase, releaseVersion } from '../scripts/release-policy.ts';
test('publishing requires push of a stable complete version tag',()=>{
  assert.equal(assertReleaseEvent('push','refs/tags/v0.1.0'),'v0.1.0');
  for(const event of ['workflow_dispatch','pull_request','workflow_call',undefined]) assert.throws(()=>assertReleaseEvent(event,'refs/tags/v0.1.0'));
  for(const ref of ['refs/heads/v0.1.0','refs/tags/v1','refs/tags/v1.2.3-beta.1','refs/tags/v01.2.3','refs/tags/v1.2.3/evil',undefined]) assert.throws(()=>assertReleaseEvent('push',ref));
  assert.equal(releaseVersion('v12.0.30'),'12.0.30');
});
test('Pages base supports project sites and owner sites without hardcoded owner',()=>{
  assert.equal(pagesBase('someone/web-font-codecs'),'/web-font-codecs/');
  assert.equal(pagesBase('Someone/someone.github.io'),'/');
  assert.throws(()=>pagesBase('bad/repo/extra'));
});
