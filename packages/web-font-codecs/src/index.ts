import { detectFormat, FontCodecError, validateFont } from 'web-font-codecs-core';
import type { CodecInitOptions, CodecLifecycle, CodecResult, FontFormat } from 'web-font-codecs-core';
import type { Woff1EncodeOptions } from 'woff1-codec';
import type { Woff2EncodeOptions } from 'woff2-codec';
export { detectFormat, FontCodecError } from 'web-font-codecs-core';
export type { FontFormat, CodecInitOptions, CodecLimits, CodecResult, CodecErrorCode, WasmSource } from 'web-font-codecs-core';
export type { Woff1EncodeOptions } from 'woff1-codec';
export type { Woff2EncodeOptions } from 'woff2-codec';
export interface ConverterOptions {
  /** Codecs to initialize concurrently. Defaults to both. */
  codecs?: readonly ('woff1' | 'woff2')[];
  woff1?: CodecInitOptions;
  woff2?: CodecInitOptions;
}
export type ConversionOptions =
  | { to: 'sfnt' }
  | { to: 'woff1'; encode?: Woff1EncodeOptions }
  | { to: 'woff2'; encode?: Woff2EncodeOptions };
export interface ConversionResult extends CodecResult {
  from: FontFormat;
  to: FontFormat;
  /** Actual recommended extension, including OTF for CFF-flavored SFNT. */
  extension: 'ttf' | 'otf' | 'woff' | 'woff2';
  /** Cross-container conversions discard source container metadata/private blocks. */
  discardedAuxiliaryData: boolean;
}
export interface FontConverter extends CodecLifecycle {
  /** Convert synchronously after enabled codecs have initialized. Same-format copies preserve the container. */
  convert(input: Uint8Array, options: ConversionOptions): ConversionResult;
}
export async function createFontConverter(options: ConverterOptions = {}): Promise<FontConverter> {
  const enabled = options.codecs === undefined ? ['woff1', 'woff2'] : options.codecs;
  if (!Array.isArray(enabled) || enabled.some(codec => codec !== 'woff1' && codec !== 'woff2')) {
    throw new FontCodecError('INVALID_OPTION', 'codecs must be an array containing woff1 or woff2');
  }
  const [first, second] = await Promise.allSettled([
    enabled.includes('woff1') ? import('woff1-codec').then(codec => codec.createWoff1Codec(options.woff1)) : undefined,
    enabled.includes('woff2') ? import('woff2-codec').then(codec => codec.createWoff2Codec(options.woff2)) : undefined,
  ]);
  if (first.status === 'rejected' || second.status === 'rejected') {
    if (first.status === 'fulfilled') first.value?.[Symbol.dispose]();
    if (second.status === 'fulfilled') second.value?.[Symbol.dispose]();
    if (first.status === 'rejected') throw first.reason;
    if (second.status === 'rejected') throw second.reason;
  }
  const one = first.value, two = second.value;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    one?.[Symbol.dispose]();
    two?.[Symbol.dispose]();
  };
  return {
    dispose,
    [Symbol.dispose]: dispose,
    convert(input, conversion) {
      if (disposed) throw new FontCodecError('DISPOSED', 'Converter has been disposed');
      if (!conversion || !['sfnt','woff1','woff2'].includes(conversion.to)) throw new FontCodecError('INVALID_OPTION', 'Choose sfnt, woff1, or woff2');
      const from = detectFormat(input), to = conversion.to;
      const limit = from === 'woff1' ? options.woff1?.maxInputBytes : options.woff2?.maxInputBytes;
      validateFont(input, from, limit ?? 512 * 1024 * 1024);
      let result: CodecResult;
      let discardedAuxiliaryData = false;
      if (from === to && !('encode' in conversion && conversion.encode !== undefined)) result = { data: input.slice(), warnings: [] };
      else {
        if ((from === 'woff1' || to === 'woff1') && !one) throw new FontCodecError('UNSUPPORTED_FORMAT', 'WOFF1 codec is not enabled');
        if ((from === 'woff2' || to === 'woff2') && !two) throw new FontCodecError('UNSUPPORTED_FORMAT', 'WOFF2 codec is not enabled');
        let sfnt: CodecResult;
        if (from === 'woff1') sfnt = one!.decode(input);
        else if (from === 'woff2') sfnt = two!.decode(input);
        else sfnt = { data: input.slice(), warnings: [] };
        if (from !== 'sfnt') {
          const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
          discardedAuxiliaryData = view.getUint32(from === 'woff1' ? 24 : 28) !== 0 || view.getUint32(from === 'woff1' ? 36 : 40) !== 0;
        }
        if (to === 'woff1') result = one!.encode(sfnt.data, conversion.encode);
        else if (to === 'woff2') result = two!.encode(sfnt.data, conversion.encode);
        else result = sfnt;
        result.warnings = [...new Set([...sfnt.warnings, ...result.warnings])];
      }
      const outputLimit = (to === 'woff1' ? options.woff1?.maxOutputBytes : to === 'woff2' ? options.woff2?.maxOutputBytes : from === 'woff1' ? options.woff1?.maxOutputBytes : options.woff2?.maxOutputBytes) ?? 512 * 1024 * 1024;
      if (result.data.length > outputLimit) throw new FontCodecError('LIMIT_EXCEEDED', 'Converted output exceeds configured limit');
      const extension = to === 'woff1' ? 'woff' : to === 'woff2' ? 'woff2' : new DataView(result.data.buffer, result.data.byteOffset).getUint32(0) === 0x4f54544f ? 'otf' : 'ttf';
      return { ...result, from, to, extension, discardedAuxiliaryData };
    },
  };
}
