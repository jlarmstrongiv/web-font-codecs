import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execute } from '../scripts/process.ts';
import { detectFormat } from 'web-font-codecs';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { readInputStream } from '../packages/web-font-converter-cli/src/input.ts';
import type { ProcessResult } from '../scripts/process.ts';
const cli = resolve('packages/web-font-converter-cli/src/cli.ts');
const fixture = resolve('test/fixtures/Rochester.otf');
function run(args: string[]) { return execute(process.execPath, ['--conditions=web-font-codecs:source',cli,...args]); }
function pipeInput(args: string[], input: Uint8Array): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--conditions=web-font-codecs:source', cli, ...args], { stdio: 'pipe' });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', reject);
    child.stdin.on('error', (error: NodeJS.ErrnoException) => { if (error.code !== 'EPIPE') reject(error); });
    child.once('close', (status, signal) => resolve({ status, signal, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }));
    child.stdin.end(input);
  });
}
test('CLI reads piped font bytes with inferred file output and explicit binary stdout', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'web-font-cli-stdin-'));
  try {
    const bytes = await readFile(fixture);
    const output = join(directory, 'font.woff2');
    const file = await pipeInput(['-', '-o', output, '--quality', '3'], bytes);
    assert.equal(file.status, 0, file.stderr.toString());
    assert.equal(file.stdout.length, 0);
    assert.equal(detectFormat(await readFile(output)), 'woff2');
    const stdout = await pipeInput(['-', '--to', 'woff2', '-o', '-', '--quality', '3'], bytes);
    assert.equal(stdout.status, 0, stdout.stderr.toString());
    assert.equal(detectFormat(stdout.stdout), 'woff2');
    assert.equal(stdout.stderr.length, 0);
    const missingTarget = await pipeInput(['-', '-o', '-'], bytes);
    assert.equal(missingTarget.status, 1);
    assert.match(missingTarget.stderr.toString(), /Specify --to/);
    assert.equal(missingTarget.stdout.length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('CLI rejects empty and malformed stdin without writing binary output', async () => {
  for (const [bytes, code] of [[Buffer.alloc(0), 'INVALID_INPUT'], [Buffer.from('not a font'), 'UNSUPPORTED_FORMAT']] as const) {
    const result = await pipeInput(['-', '--to', 'woff2', '-o', '-'], bytes);
    assert.equal(result.status, 1);
    assert.equal(result.stdout.length, 0);
    assert.ok(result.stderr.toString().startsWith(`${code}:`), result.stderr.toString());
  }
});
test('stdin reader bounds chunks, stops consuming on overflow and propagates stream errors', async () => {
  assert.deepEqual(await readInputStream(Readable.from([Buffer.from('ab'), Buffer.from('cd')]), 4), Buffer.from('abcd'));
  let consumed = 0;
  let closed = false;
  const stream = Readable.from((async function* () {
    try {
      for (const chunk of ['ab', 'cde', 'unread']) { consumed++; yield Buffer.from(chunk); }
    } finally { closed = true; }
  })(), { highWaterMark: 0 });
  await assert.rejects(readInputStream(stream, 4), { code: 'LIMIT_EXCEEDED' });
  assert.equal(consumed, 2);
  assert.equal(stream.destroyed, true);
  // Readable closes its source iterator as part of destruction.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, true);
  const failure = new Error('stdin read failed');
  const broken = Readable.from((async function* () { yield Buffer.from('ab'); throw failure; })());
  await assert.rejects(readInputStream(broken), error => error === failure);
  assert.equal(broken.destroyed, true);
});
test('CLI help, binary stdout, format choices and errors', async () => {
  assert.match((await run(['--help'])).stdout.toString(), /Usage: web-font-converter-cli INPUT/);
  const result = (await run([fixture,'--to','woff2','--quality','3','-o','-']));
  assert.equal(result.status,0,result.stderr.toString()); assert.equal(detectFormat(result.stdout),'woff2');
  assert.doesNotMatch(result.stderr.toString(), /repaired font data/);
  for (const args of [[],[fixture,'--to','nope','-o','-'],[fixture,'--to','woff1','--quality','3','-o','-'],[fixture,'--to','woff2','--quality','15','-o','-'],[fixture,'--to','woff1','--max-output-mib','0','-o','-']]) assert.equal((await run(args)).status,1);
});
test('CLI prints decoded repairs while retaining binary stdout', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'web-font-cli-warning-'));
  try {
    const bytes = await readFile(fixture);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint32(16, view.getUint32(16) ^ 1);
    const input = join(directory, 'checksum.otf');
    await writeFile(input, bytes);
    const result = await run([input, '--to', 'woff1', '-o', '-']);
    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(detectFormat(result.stdout), 'woff1');
    assert.match(result.stderr.toString(), /Codec repaired font data: checksumMismatch\./);
    assert.doesNotMatch(result.stderr.toString(), /warning mask/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('CLI does not overwrite existing output unless explicitly forced', async () => {
  const dir = await mkdtemp(join(tmpdir(),'web-font-cli-'));
  try {
    const output = join(dir,'font.woff'); await writeFile(output,'keep');
    assert.equal((await run([fixture,'--to','woff1','-o',output])).status,1);
    assert.equal(await readFile(output,'utf8'),'keep');
    const forced = (await run([fixture,'--to','woff1','-o',output,'--force']));
    assert.equal(forced.status,0,forced.stderr.toString()); assert.equal(detectFormat(await readFile(output)),'woff1');
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('CLI rejects oversized files before reading them into memory', async () => {
  const directory = await mkdtemp(join(tmpdir(),'web-font-cli-limit-'));
  try {
    const file=join(directory,'large.ttf');await writeFile(file,'');await truncate(file,512*1024*1024+1);
    const result=(await run([file,'--to','woff1','-o','-']));
    assert.equal(result.status,1);assert.match(result.stderr.toString(),/LIMIT_EXCEEDED/);assert.equal(result.stdout.length,0);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
test('CLI accepts a 512 MiB output bound and rejects larger bounds', async () => {
  const accepted = await run([fixture, '--to', 'woff2', '--quality', '3', '--max-output-mib', '512', '-o', '-']);
  assert.equal(accepted.status, 0, accepted.stderr.toString());
  assert.equal(detectFormat(accepted.stdout), 'woff2');
  const rejected = await run([fixture, '--to', 'woff2', '--max-output-mib', '513', '-o', '-']);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr.toString(), /up to 512 MiB/);
});
test('CLI supports Zopfli and rejects irrelevant iteration/engine options', async () => {
  const result=(await run([fixture,'--to','woff1','--woff1-compression','zopfli','--zopfli-iterations','1','-o','-']));
  assert.equal(result.status,0,result.stderr.toString());assert.equal(detectFormat(result.stdout),'woff1');
  for(const args of [['--woff1-compression','nope'],['--zopfli-iterations','2'],['--woff1-compression','zopfli','--zopfli-iterations','101']]) assert.equal((await run([fixture,'--to','woff1',...args,'-o','-'])).status,1);
  assert.equal((await run([fixture,'--to','woff2','--woff1-compression','zopfli','-o','-'])).status,1);
});

test('CLI infers case-insensitive targets and validates compression against the resolved target', async () => {
  const directory=await mkdtemp(join(tmpdir(),'web-font-cli-infer-'));
  try {
    for(const [input,name,format,options]of [
      [fixture,'font.wOfF','woff1',['--woff1-compression','zopfli','--zopfli-iterations','1']],
      [fixture,'font.WOFF2','woff2',['--quality','3']],
      [fixture,'font.OTF','sfnt',[]],
      [resolve('test/fixtures/OpenSans-Regular.ttf'),'font.tTf','sfnt',[]],
    ] as const){const output=join(directory,name),result=(await run([input,'-o',output,...options]));assert.equal(result.status,0,result.stderr.toString());assert.equal(detectFormat(await readFile(output)),format);}
    const occupied=join(directory,'font.wOfF');
    assert.equal((await run([fixture,'-o',occupied])).status,1,'Inferred output retains overwrite protection');
    assert.equal((await run([fixture,'-o',occupied,'--force'])).status,0);
    assert.equal((await run([fixture,'-o',join(directory,'wrong.woff'),'--quality','3'])).status,1);
    assert.equal((await run([fixture,'-o',join(directory,'wrong.woff2'),'--woff1-compression','zopfli'])).status,1);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('CLI requires a target for stdout/unknown extensions and rejects explicit conflicts before writing', async () => {
  const directory=await mkdtemp(join(tmpdir(),'web-font-cli-target-'));
  try {
    for(const output of ['-',join(directory,'font.bin'),join(directory,'font')]){const result=(await run([fixture,'-o',output]));assert.equal(result.status,1);assert.match(result.stderr.toString(),/Specify --to/);assert.equal(result.stdout.length,0);}
    const custom=join(directory,'font.bin');
    const result=(await run([fixture,'--to','WOFF2','--quality','3','-o',custom]));assert.equal(result.status,0,result.stderr.toString());assert.equal(detectFormat(await readFile(custom)),'woff2');
    for(const [to,extension]of [['woff2','woff'],['woff1','WOFF2'],['sfnt','woff'],['woff1','ttf']]){const output=join(directory,`keep.${extension}`);await writeFile(output,'keep');const rejected=(await run([fixture,'--to',to!,'-o',output,'--force']));assert.equal(rejected.status,1);assert.match(rejected.stderr.toString(),/conflicts/);assert.equal(await readFile(output,'utf8'),'keep');}
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('CLI rejects TTF/OTF outline mismatches before writing, including decoded containers', async () => {
  const directory=await mkdtemp(join(tmpdir(),'web-font-cli-outline-'));
  try {
    const container=join(directory,'cff.woff');assert.equal((await run([fixture,'-o',container])).status,0);
    for(const [input,extension]of [[fixture,'ttf'],[container,'TTF'],[resolve('test/fixtures/OpenSans-Regular.ttf'),'otf']])for(const explicit of [false,true]){
      const output=join(directory,`keep.${extension}`);await writeFile(output,'keep');
      const result=(await run([input!,'-o',output,'--force',...(explicit?['--to','sfnt']:[])]));
      assert.equal(result.status,1,result.stderr.toString());assert.match(result.stderr.toString(),/outline flavor/);assert.equal(await readFile(output,'utf8'),'keep');
    }
  } finally {await rm(directory,{recursive:true,force:true});}
});
