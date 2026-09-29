/** Invoked only by the tag-gated release job. Never used by local checks. */
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { assertReleaseEvent, pagesBase, releasePackages } from './release-policy.ts';
const tag=assertReleaseEvent(process.env.GITHUB_EVENT_NAME,process.env.GITHUB_REF);
const repository=process.env.GITHUB_REPOSITORY??'';
pagesBase(repository); // Validate owner/repo before using it in request paths.
const token=process.env.GH_TOKEN;
assert.ok(token,'Missing GitHub token');
const commit=process.env.GITHUB_SHA??'';
assert.match(commit,/^[a-f0-9]{40}$/);
const directory='.cache/release-assets';
const manifest=JSON.parse(await readFile(`${directory}/release.json`,'utf8')) as {tag:string;commit:string};
assert.equal(manifest.tag,tag);assert.equal(manifest.commit,commit);
const expectedFiles=[...releasePackages.map(name=>`${name}-${tag.slice(1)}.tgz`),'SHA256SUMS.txt','release.json'].sort();
assert.deepEqual((await readdir(directory)).sort(),expectedFiles,'Unexpected or missing release assets');
const sums=await readFile(`${directory}/SHA256SUMS.txt`,'utf8');
const checksumLines=sums.trim().split('\n');
assert.equal(checksumLines.length,releasePackages.length);
for(const line of checksumLines) {
  const match=/^([a-f0-9]{64})  ([a-z0-9.-]+\.tgz)$/.exec(line);
  assert.ok(match,'Invalid checksum entry');
  assert.equal(createHash('sha256').update(await readFile(`${directory}/${match[2]}`)).digest('hex'),match[1]);
}
const api=process.env.GITHUB_API_URL??'https://api.github.com';
async function request(path:string,method='GET',body?:unknown):Promise<Record<string,unknown>> {
  const response=await fetch(`${api}/repos/${repository}${path}`,{method,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.ok(response.ok,`GitHub ${method} ${path} failed with ${response.status}`);
  return await response.json() as Record<string,unknown>;
}
// Refuse release if someone moved the tag after validation started.
assert.equal((await request(`/commits/${encodeURIComponent(tag)}`)).sha,commit,'Remote tag moved since validation');
const release=await request('/releases','POST',{tag_name:tag,target_commitish:commit,name:tag,draft:true,prerelease:false,generate_release_notes:true});
assert.equal(typeof release.id,'number');assert.equal(typeof release.upload_url,'string');
const uploadBase=(release.upload_url as string).split('{')[0]!;
for(const name of (await readdir(directory)).sort()) {
  assert.match(name,/^[A-Za-z0-9.-]+$/);
  const bytes=await readFile(`${directory}/${name}`);
  const response=await fetch(`${uploadBase}?name=${encodeURIComponent(name)}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/octet-stream'},body:bytes});
  assert.ok(response.ok,`Release asset upload ${name} failed with ${response.status}; draft remains for inspection`);
}
await request(`/releases/${release.id}`,'PATCH',{draft:false});
console.log(`Published ${tag} with checked package tarballs and checksums.`);
