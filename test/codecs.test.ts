import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWoff1Codec } from 'woff1-codec';
import { createWoff2Codec } from 'woff2-codec';
import { createWoff1Codec as createBrowserWoff1 } from '../packages/woff1-codec/src/index.ts';
import { createWoff2Codec as createBrowserWoff2 } from '../packages/woff2-codec/src/index.ts';
import { createFontConverter } from 'web-font-converter';
import { createRuntime, detectFormat, FontCodecError } from 'web-font-codecs';
const fonts = await Promise.all(['OpenSans-Regular.ttf','Rochester.otf'].map(async name => ({ name, bytes: new Uint8Array(await readFile(new URL(`fixtures/${name}`, import.meta.url))) })));
const one = await createWoff1Codec(), two = await createWoff2Codec();
after(() => { one[Symbol.dispose](); two[Symbol.dispose](); });
function tables(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result = new Map<string, Uint8Array>();
  for (let i = 0; i < view.getUint16(4); i++) {
    const p = 12 + i * 16, offset = view.getUint32(p + 8), length = view.getUint32(p + 12);
    result.set(new TextDecoder().decode(bytes.subarray(p, p + 4)), bytes.slice(offset, offset + length));
  }
  return result;
}
function errorCode(code: string) { return (error: unknown) => error instanceof FontCodecError && error.code === code; }
for (const { name, bytes } of fonts) {
  test(`${name}: Mozilla roundtrip preserves every table except checksum adjustment`, () => {
    const encoded = one.encode(bytes);
    assert.equal(detectFormat(encoded.data), 'woff1');
    assert.deepEqual(encoded.warnings, []);
    assert.deepEqual(one.decode(encoded.data).warnings, []);
    const decoded = one.decode(encoded.data).data;
    const expected = tables(bytes), actual = tables(decoded);
    assert.deepEqual([...actual.keys()], [...expected.keys()]);
    for (const [tag, value] of expected) {
      const output = actual.get(tag)!;
      if (tag === 'head') { value.fill(0,8,12); output.fill(0,8,12); }
      assert.deepEqual(output, value, tag);
    }
    // The reconstructed whole-file checksum is mandated by OpenType.
    let sum = 0; const v = new DataView(decoded.buffer);
    for (let i = 0; i < decoded.length; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
    assert.equal(sum, 0xb1b0afba);
  });
  for (const allowTransforms of [true, false]) test(`${name}: Google WOFF2 roundtrip (transforms ${allowTransforms})`, () => {
    const encoded = two.encode(bytes, { quality: 4, allowTransforms });
    assert.deepEqual(encoded.warnings, []);
    assert.deepEqual(two.decode(encoded.data).warnings, []);
    assert.equal(detectFormat(encoded.data), 'woff2');
    const decoded = two.decode(encoded.data).data;
    const expected = tables(bytes), actual = tables(decoded);
    assert.deepEqual([...actual.keys()], [...expected.keys()].filter(k => k !== 'DSIG'));
    for (const [tag, value] of expected) {
      // Google normalizes glyph encoding, loca offsets, head flags/checksums, and removes DSIG.
      if (['head','glyf','loca','DSIG'].includes(tag)) continue;
      assert.deepEqual(actual.get(tag), value, tag);
    }
  });
}
test('repair names are decoded automatically and survive converter stages', async () => {
  const damagedSfnt = fonts[1]!.bytes.slice();
  const sfntView = new DataView(damagedSfnt.buffer);
  sfntView.setUint32(16, sfntView.getUint32(16) ^ 1); // First table's directory checksum.
  const encoded = one.encode(damagedSfnt);
  assert.deepEqual(encoded.warnings, ['checksumMismatch']);
  assert.equal(detectFormat(one.decode(encoded.data).data), 'sfnt');

  const damagedWoff = encoded.data.slice();
  const woffView = new DataView(damagedWoff.buffer);
  woffView.setUint32(60, woffView.getUint32(60) ^ 1); // First WOFF table's original checksum.
  assert.deepEqual(one.decode(damagedWoff).warnings, ['checksumMismatch']);

  using converter = createFontConverter();
  assert.deepEqual((await converter.convert(damagedSfnt, { to: 'woff1' })).warnings, ['checksumMismatch']);
  for (const options of [{ to: 'sfnt' }, { to: 'woff2' }, { to: 'woff1', encode: {} }] as const) {
    const result = await converter.convert(damagedWoff, options);
    assert.deepEqual(result.warnings, ['checksumMismatch']);
    assert.equal(detectFormat(result.data), options.to);
  }
  assert.deepEqual((await converter.convert(damagedWoff, { to: 'woff1' })).warnings, [], 'A same-format copy makes no repairs');
});
test('Mozilla auxiliary metadata, private data and version roundtrip', () => {
  const metadata = new TextEncoder().encode('<?xml version="1.0"?><metadata version="1.0"><description><text>Example</text></description></metadata>');
  const privateData = Uint8Array.of(0,255,1,2,3);
  const encoded = one.encode(fonts[0]!.bytes, { majorVersion: 5, minorVersion: 17, metadata, privateData });
  assert.deepEqual(one.readAuxiliaryData(encoded.data), { metadata, privateData, majorVersion: 5, minorVersion: 17 });
  const empty = one.readAuxiliaryData(one.encode(fonts[0]!.bytes).data);
  assert.equal(empty.metadata.length, 0); assert.equal(empty.privateData.length, 0);
});
test('Google metadata encoding is present and font remains decodable', () => {
  const result = two.encode(fonts[0]!.bytes, { metadata: new TextEncoder().encode('<metadata version="1.0"/>') });
  assert.ok(new DataView(result.data.buffer).getUint32(28) > 0);
  assert.equal(detectFormat(two.decode(result.data).data), 'sfnt');
});
test('returned bytes survive later calls, source views honor byteOffset, no input mutation', () => {
  const bytes = fonts[0]!.bytes, padded = new Uint8Array(bytes.length + 13);
  padded.set(bytes, 7);
  const view = padded.subarray(7, 7 + bytes.length), snapshot = padded.slice();
  const first = one.encode(view).data, copy = first.slice();
  one.encode(fonts[1]!.bytes); assert.deepEqual(first, copy); assert.deepEqual(padded, snapshot);
});
test('unified converter supports every pair and records discarded auxiliary blocks', async () => {
  using converter = createFontConverter();
  const input = fonts[0]!.bytes;
  const variants = [input, one.encode(input, { privateData: Uint8Array.of(5) }).data, two.encode(input).data];
  for (const variant of variants) for (const to of ['sfnt','woff1','woff2'] as const) {
    const result = await converter.convert(variant, { to });
    assert.equal(detectFormat(result.data), to);
    assert.deepEqual(result.warnings, []);
    if (variant === variants[1] && to !== 'woff1') assert.equal(result.discardedAuxiliaryData, true);
  }
  assert.equal((await converter.convert(fonts[1]!.bytes, { to: 'sfnt' })).extension, 'otf');
  converter.dispose(); await assert.rejects(converter.convert(input, { to: 'woff2' }), errorCode('DISPOSED'));
});
test('bad signatures, truncated directories, overlapping records and collections are rejected before native code', () => {
  for (const create of [one, two]) {
    for (const length of [0,1,3,4,11,12,30]) assert.throws(() => create.encode(fonts[0]!.bytes.subarray(0,length)), FontCodecError);
    const outside = fonts[0]!.bytes.slice(); new DataView(outside.buffer).setUint32(20, outside.length + 1);
    assert.throws(() => create.encode(outside), errorCode('INVALID_INPUT'));
    const duplicate = fonts[0]!.bytes.slice(); duplicate.set(duplicate.subarray(12,16),28);
    assert.throws(() => create.encode(duplicate), errorCode('INVALID_INPUT'));
    assert.throws(() => create.encode(new TextEncoder().encode('ttcf12345678901234567890')), errorCode('UNSUPPORTED_FORMAT'));
  }
});
test('corrupt WOFF stream and container length fail without poisoning the instance', () => {
  for (const codec of [one,two]) {
    const encoded = codec.encode(fonts[0]!.bytes).data;
    assert.throws(() => codec.decode(encoded.subarray(0, encoded.length - 1)), errorCode('INVALID_INPUT'));
    const corrupted = encoded.slice(); corrupted.fill(0xff, Math.floor(encoded.length / 2));
    assert.throws(() => codec.decode(corrupted), FontCodecError);
    assert.equal(detectFormat(codec.decode(encoded).data), 'sfnt');
  }
});
test('output and metadata expansion limits, invalid options and disposal', async () => {
  using small = await createWoff1Codec({ maxOutputBytes: 256 });
  const compressed = one.encode(fonts[0]!.bytes).data;
  assert.throws(() => small.decode(compressed), errorCode('LIMIT_EXCEEDED'));
  using boundedTwo = await createWoff2Codec({ maxOutputBytes: 256 });
  assert.throws(() => boundedTwo.decode(two.encode(fonts[0]!.bytes).data), errorCode('LIMIT_EXCEEDED'));
  const metadataBomb = one.encode(fonts[1]!.bytes, { metadata: new Uint8Array(40000) }).data;
  using medium = await createWoff1Codec({ maxOutputBytes: 30000 });
  assert.throws(() => medium.readAuxiliaryData(metadataBomb), errorCode('LIMIT_EXCEEDED'));
  assert.throws(() => two.encode(fonts[0]!.bytes, { quality: 12 }), errorCode('INVALID_OPTION'));
  assert.throws(() => one.encode(fonts[0]!.bytes, { majorVersion: -1 }), errorCode('INVALID_OPTION'));
  await assert.rejects(createWoff1Codec({ maxInputBytes: NaN }), errorCode('INVALID_OPTION'));
  small.dispose(); assert.throws(() => small.encode(fonts[0]!.bytes), errorCode('DISPOSED'));
});
test('512 MiB defaults and option ceilings apply to both codecs, with smaller limits still enforced', async () => {
  const maximum = 512 * 1024 * 1024;
  for (const [name, create] of [['woff1', createWoff1Codec], ['woff2', createWoff2Codec]] as const) {
    using runtime = await createRuntime(await readFile(`packages/${name}-codec/wasm/codec.wasm`));
    assert.equal(runtime.maxInputBytes, maximum);
    assert.equal(runtime.maxOutputBytes, maximum);

    using codec = await create({ maxInputBytes: maximum, maxOutputBytes: maximum });
    assert.ok(codec.encode(fonts[1]!.bytes).data.length > 0);

    for (const option of ['maxInputBytes', 'maxOutputBytes']) {
      await assert.rejects(create({ [option]: maximum + 1 }), errorCode('INVALID_OPTION'));
    }
    using bounded = await create({ maxInputBytes: fonts[1]!.bytes.length - 1 });
    assert.throws(() => bounded.encode(fonts[1]!.bytes), errorCode('LIMIT_EXCEEDED'));

  }
});
test('browser APIs initialize from bytes, Module, Response and fetch URL', async () => {
  for (const [name, create] of [['woff1', createBrowserWoff1], ['woff2', createBrowserWoff2]] as const) {
    const bytes = new Uint8Array(await readFile(`packages/${name}-codec/wasm/codec.wasm`));
    for (const wasm of [bytes, await WebAssembly.compile(bytes), new Response(bytes), `data:application/wasm;base64,${Buffer.from(bytes).toString('base64')}`]) {
      using codec = await create({ wasm });
      assert.ok(codec.encode(fonts[1]!.bytes).data.length > 0);
    }
  }
  await assert.rejects(createBrowserWoff1({ wasm: new Response('missing', { status: 404 }) }), errorCode('WASM_INIT'));
  await assert.rejects(createWoff2Codec({ wasm: Uint8Array.of(1,2,3) }), errorCode('WASM_INIT'));
});
function wasmStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset === bytes.length) { controller.close(); return; }
      const end = Math.min(offset + 16381, bytes.length);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
    },
  });
}
test('both entrypoints accept promised WASM sources and chunked byte streams', async () => {
  for (const [name, browserCreate, nodeCreate] of [['woff1', createBrowserWoff1, createWoff1Codec], ['woff2', createBrowserWoff2, createWoff2Codec]] as const) {
    const fileUrl = new URL(`../packages/${name}-codec/wasm/codec.wasm`, import.meta.url);
    const bytes = new Uint8Array(await readFile(fileUrl));
    const module = await WebAssembly.compile(bytes);
    const url = `data:application/wasm;base64,${Buffer.from(bytes).toString('base64')}`;
    for (const create of [browserCreate, nodeCreate]) {
      for (const wasm of [Promise.resolve(bytes), Promise.resolve(module), fetch(url), Promise.resolve(url), Promise.resolve(new URL(url)), wasmStream(bytes), Promise.resolve(wasmStream(bytes))]) {
        using codec = await create({ wasm });
        assert.equal(detectFormat(codec.decode(codec.encode(fonts[1]!.bytes).data).data), 'sfnt');

      }
    }
    using codec = await nodeCreate({ wasm: Promise.resolve(fileUrl) });
    assert.ok(codec.encode(fonts[1]!.bytes).data.length > 0);

  }
});
test('promise and stream failures preserve WASM_INIT and the original cause', async () => {
  for (const create of [createBrowserWoff1, createBrowserWoff2, createWoff1Codec, createWoff2Codec]) {
    const cause = new Error('WASM source failed');
    const check = (error: unknown) => error instanceof FontCodecError && error.code === 'WASM_INIT' && error.cause === cause;
    await assert.rejects(create({ wasm: Promise.reject(cause) }), check);
    for (const promised of [false, true]) {
      const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(cause); } });
      await assert.rejects(create({ wasm: promised ? Promise.resolve(stream) : stream }), check);
    }
  }
});
test('many repeated conversions and independent instances do not share state', async () => {
  using separate = await createWoff1Codec();
  for (let i = 0; i < 40; i++) {
    const codec = i % 2 ? one : separate;
    const result = codec.encode(fonts[i % 2]!.bytes);
    assert.equal(detectFormat(codec.decode(result.data).data), 'sfnt');
  }
  separate[Symbol.dispose](); assert.ok(one.encode(fonts[0]!.bytes).data.length);
});
test('init failures include a stable error code for missing Node assets', async () => {
  for (const create of [createWoff1Codec, createWoff2Codec]) {
    for (const promised of [false, true]) {
      const url = new URL('file:///definitely-missing-font-codec.wasm');
      await assert.rejects(create({ wasm: promised ? Promise.resolve(url) : url }), (error: unknown) =>
        error instanceof FontCodecError && error.code === 'WASM_INIT' &&
        error.cause instanceof Error && 'code' in error.cause && error.cause.code === 'ENOENT');
    }
  }
});
test('header length bombs and wrong formats fail within configured bounds', () => {
  const woff = one.encode(fonts[1]!.bytes).data;
  new DataView(woff.buffer).setUint32(16,0xffffffff);
  assert.throws(() => one.decode(woff),errorCode('LIMIT_EXCEEDED'));
  assert.throws(() => two.decode(one.encode(fonts[1]!.bytes).data),errorCode('UNSUPPORTED_FORMAT'));
});
test('same-format converter copies honor output limits', async () => {
  using converter = createFontConverter({ woff1: { maxOutputBytes: 100 } });
  await assert.rejects(converter.convert(one.encode(fonts[1]!.bytes).data, { to: 'woff1' }), errorCode('LIMIT_EXCEEDED'));

});

for (const {name,bytes} of fonts) test(`${name}: selectable Zopfli retains tables and auxiliary blocks`, () => {
  const metadata = new TextEncoder().encode('<metadata version="1.0"><description><text>Zopfli test</text></description></metadata>');
  const privateData = Uint8Array.of(3,2,1,0);
  const zlib = one.encode(bytes, {compression:'zlib',metadata,privateData});
  const zopfli = one.encode(bytes, {compression:'zopfli',iterations:2,metadata,privateData});
  assert.deepEqual(one.decode(zopfli.data).data,one.decode(zlib.data).data);
  assert.deepEqual(one.readAuxiliaryData(zopfli.data),one.readAuxiliaryData(zlib.data));
  assert.deepEqual(one.encode(bytes).data,one.encode(bytes,{compression:'zlib'}).data);
  assert.deepEqual(one.encode(bytes).data,one.encode(bytes,{compression:'zlib'}).data,'Zopfli choice does not leak into later zlib calls');
});
test('WOFF1 rejects ignored or invalid compression settings', () => {
  for (const options of [{compression:'other'},{compression:'zlib',iterations:2},{iterations:2},{compression:'zopfli',iterations:0},{compression:'zopfli',iterations:101},{compression:'zopfli',iterations:1.2}]) {
    // Deliberately exercise untyped JavaScript callers.
    assert.throws(()=>one.encode(fonts[0]!.bytes,options as never),errorCode('INVALID_OPTION'));
  }
});

test('using disposes both codecs at normal and exceptional scope exit', async () => {
  for (const create of [createWoff1Codec, createWoff2Codec]) {
    for (const exceptional of [false, true]) {
      const codec = await create();
      const failure = new Error('scope failed');
      let output: Uint8Array | undefined;
      try {
        using owned = codec;
        assert.equal(owned[Symbol.dispose], owned.dispose);
        output = owned.encode(fonts[1]!.bytes).data;
        if (exceptional) throw failure;
      } catch (error) { assert.equal(error, failure); }
      assert.ok(output!.length > 0, 'Owned output remains usable after disposal');
      assert.throws(() => codec.encode(fonts[1]!.bytes), errorCode('DISPOSED'));
      codec.dispose();
      codec[Symbol.dispose]();
    }
  }
});

test('using disposes the runtime and converter, including exceptional exit', async () => {
  const runtime = await createRuntime(await readFile('packages/woff1-codec/wasm/codec.wasm'));
  { using owned = runtime; assert.ok(owned.run(fonts[1]!.bytes, 1).data.length); }
  assert.throws(() => runtime.run(fonts[1]!.bytes, 1), errorCode('DISPOSED'));
  runtime.dispose();
  for (const exceptional of [false, true]) {
    const converter = createFontConverter();
    const failure = new Error('scope failed');
    try {
      using owned = converter;
      assert.equal(owned[Symbol.dispose], owned.dispose);
      const woff = await owned.convert(fonts[1]!.bytes, { to: 'woff1' });
      assert.equal((await owned.convert(woff.data, { to: 'woff2' })).extension, 'woff2');
      if (exceptional) throw failure;
    } catch (error) { assert.equal(error, failure); }
    await assert.rejects(converter.convert(fonts[1]!.bytes, { to: 'sfnt' }), errorCode('DISPOSED'));
    converter.dispose();
    converter[Symbol.dispose]();
  }
});

test('scope exit during lazy initialization rejects the pending conversion', async () => {
  const bytes = await readFile('packages/woff1-codec/wasm/codec.wasm');
  let release!: (bytes: Uint8Array<ArrayBuffer>) => void;
  const wasm = new Promise<Uint8Array<ArrayBuffer>>(resolve => { release = resolve; });
  let conversion: ReturnType<ReturnType<typeof createFontConverter>['convert']>;
  {
    using converter = createFontConverter({ woff1: { wasm } });
    conversion = converter.convert(fonts[1]!.bytes, { to: 'woff1' });
  }
  const rejected = assert.rejects(conversion, errorCode('DISPOSED'));
  release(bytes);
  await rejected;
});
