import { detectFormat } from 'web-font-codecs';
import type { ConversionResult, FontFormat } from 'web-font-codecs';
export const MAX_INPUT_BYTES = 512 * 1024 * 1024;
export const FORMAT_LABELS: Record<FontFormat, string> = { sfnt: 'TTF / OTF', woff1: 'WOFF', woff2: 'WOFF2' };
export const MIME_TYPES: Record<ConversionResult['extension'], string> = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };
export interface SelectedFont { file: File; format: FontFormat; sfntExtension: 'ttf' | 'otf' }
export async function inspectFile(file: File): Promise<SelectedFont> {
  if (file.size > MAX_INPUT_BYTES) throw new Error('Choose a font no larger than 512 MiB.');
  const header = new Uint8Array(await file.slice(0, 48).arrayBuffer());
  const format = detectFormat(header);
  if (header.length < (format === 'sfnt' ? 12 : format === 'woff1' ? 44 : 48)) throw new Error('This file has an incomplete font header. Choose a complete font file.');
  const flavor = new DataView(header.buffer).getUint32(format === 'sfnt' ? 0 : 4);
  if (flavor === 0x74746366) throw new Error('Font collections are not supported. Choose an individual TTF or OTF font.');
  return { file, format, sfntExtension: flavor === 0x4f54544f ? 'otf' : 'ttf' };
}
export function outputName(name: string, extension: ConversionResult['extension']): string {
  return (name.replace(/\.[^.]+$/, '') || 'font') + '.' + extension;
}
