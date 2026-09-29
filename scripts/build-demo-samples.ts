/** Regenerate browser samples using this repository's source-built codecs. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createWoff1Codec } from 'woff1-codec';
import { createWoff2Codec } from 'woff2-codec';
const directory = new URL('../packages/web-font-converter-web/public/samples/', import.meta.url);
await mkdir(directory, { recursive: true });
const ttf = await readFile(new URL('../test/fixtures/OpenSans-Regular.ttf', import.meta.url));
const otf = await readFile(new URL('../test/fixtures/Rochester.otf', import.meta.url));
using one = await createWoff1Codec(), two = await createWoff2Codec();
const fonts = {
  'OpenSans-Regular.ttf': ttf,
  'OpenSans-Regular.woff': one.encode(ttf).data,
  'OpenSans-Regular.woff2': two.encode(ttf, { quality: 11, allowTransforms: true }).data,
  'Rochester.otf': otf,
};
for (const [name, bytes] of Object.entries(fonts)) await writeFile(new URL(name, directory), bytes);
const artifacts = JSON.parse(await readFile(new URL('../native/artifacts.json', import.meta.url), 'utf8')) as { sha256: Record<string,string> };
await writeFile(new URL('provenance.json', directory), JSON.stringify({
  source: 'Unmodified test/fixtures/OpenSans-Regular.ttf and Rochester.otf',
  generated: { 'OpenSans-Regular.woff': 'woff1-codec.encode; default version 1.0', 'OpenSans-Regular.woff2': 'woff2-codec.encode; quality 11, allowTransforms true' },
  regenerate: 'npm run samples:build --workspace web-font-converter-web',
  codecWasmSha256: artifacts.sha256,
  files: Object.fromEntries(Object.entries(fonts).map(([name, bytes]) => [name, { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }])),
}, null, 2) + '\n');
console.log('Generated TTF, OTF, WOFF and WOFF2 demo samples with local codecs.');
