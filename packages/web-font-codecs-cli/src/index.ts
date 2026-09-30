import { parseArgs } from 'node:util';
import { extname } from 'node:path';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createFontConverter, FontCodecError } from 'web-font-codecs';
import type { ConversionOptions } from 'web-font-codecs';
import { maxInputBytes, readInputStream } from './input.ts';
export const usage = `Usage: web-font-codecs-cli INPUT --output OUTPUT [--to sfnt|woff1|woff2]

Convert a single TTF/OTF/WOFF/WOFF2 locally. Infer the target from OUTPUT:
.woff => woff1, .woff2 => woff2, .ttf/.otf => sfnt (case-insensitive).
Use INPUT - to read stdin (maximum 512 MiB).
Use --to for binary stdout (--output -) or an unrecognized output extension.
An explicit --to must agree with a recognized extension. TTF/OTF outlines are preserved;
.ttf/.otf output must match the font’s actual outline flavor.
  --woff1-compression zlib|zopfli  WOFF1 encoder (default zlib)
  --zopfli-iterations 1..100       Zopfli iterations (default 15)
  --quality 0..11       WOFF2 Brotli quality (default 11)
  --max-output-mib N    Bound decoded/encoded output (default 512; maximum 512)
  --force              Allow replacing an existing output file
  --help               Show help

Container metadata/private data are discarded during conversion; a warning is emitted.
TTC/OTC collections are not supported. No files are uploaded.
`;
export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    'woff1-compression': { type: 'string' }, 'zopfli-iterations': { type: 'string' },
    to: { type: 'string' }, output: { type: 'string', short: 'o' }, quality: { type: 'string' },
    'max-output-mib': { type: 'string' }, force: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) { process.stdout.write(usage); return; }
  const inputPath = positionals[0];
  if (positionals.length !== 1 || !inputPath || !values.output) throw new Error(usage);
  const extension = extname(values.output).toLowerCase();
  const inferred = ({ '.woff': 'woff1', '.woff2': 'woff2', '.ttf': 'sfnt', '.otf': 'sfnt' } as Record<string, ConversionOptions['to']>)[extension];
  const explicit = values.to?.toLowerCase();
  if (explicit !== undefined && !['sfnt','woff1','woff2'].includes(explicit)) throw new Error(usage);
  if (explicit !== undefined && inferred !== undefined && explicit !== inferred) throw new Error(`--to ${explicit} conflicts with output extension ${extension}`);
  const to = explicit ?? inferred;
  if (!to) throw new Error('Specify --to sfnt|woff1|woff2 for stdout or an unrecognized output extension');
  if (values.quality !== undefined && to !== 'woff2') throw new Error('--quality requires WOFF2 output');
  const compression = values['woff1-compression'] ?? 'zlib';
  if ((values['woff1-compression'] !== undefined || values['zopfli-iterations'] !== undefined) && to !== 'woff1') throw new Error('WOFF1 compression options require WOFF1 output');
  if (!['zlib', 'zopfli'].includes(compression)) throw new Error('--woff1-compression must be zlib or zopfli');
  if (values['zopfli-iterations'] !== undefined && compression !== 'zopfli') throw new Error('--zopfli-iterations requires --woff1-compression zopfli');
  const maxOutputBytes = Number(values['max-output-mib'] ?? 512) * 1024 * 1024;
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 512 * 1024 * 1024) throw new Error('--max-output-mib must describe a positive whole byte count up to 512 MiB');
  using converter = await createFontConverter({ woff1: { maxOutputBytes }, woff2: { maxOutputBytes } });
  const options: ConversionOptions = to === 'woff2' ? { to: 'woff2', encode: { quality: Number(values.quality ?? 11) } } : to === 'woff1' ? { to: 'woff1', encode: compression === 'zopfli' ? { compression: 'zopfli', iterations: Number(values['zopfli-iterations'] ?? 15) } : { compression: 'zlib' } } : { to: 'sfnt' };
  let input: Buffer;
  if (inputPath === '-') input = await readInputStream(process.stdin);
  else {
    if ((await stat(inputPath)).size > maxInputBytes) throw new FontCodecError('LIMIT_EXCEEDED', 'Input exceeds 512 MiB');
    input = await readFile(inputPath);
  }
  const result = converter.convert(input, options);
  if ((extension === '.ttf' || extension === '.otf') && extension !== `.${result.extension}`) throw new Error(`Output extension ${extension} does not match this font's .${result.extension} outline flavor; use .${result.extension}. Conversion preserves outlines.`);
  if (values.output === '-') process.stdout.write(result.data);
  else await writeFile(values.output, result.data, { flag: values.force ? 'w' : 'wx' });
  if (result.warnings.length) process.stderr.write(`Codec repaired font data: ${result.warnings.join(', ')}.\n`);
  if (result.discardedAuxiliaryData) process.stderr.write('Container metadata/private data were discarded.\n');
}
export function reportError(error: unknown): void {
  process.stderr.write(`${error instanceof FontCodecError ? `${error.code}: ` : ''}${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
