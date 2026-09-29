import { detectFormat, FontCodecError, validateFont } from 'web-font-codecs';
import type { CodecInitOptions, CodecLifecycle, CodecResult, FontFormat } from 'web-font-codecs';
import type { Woff1Codec, Woff1EncodeOptions } from 'woff1-codec';
import type { Woff2Codec, Woff2EncodeOptions } from 'woff2-codec';
export { detectFormat, FontCodecError } from 'web-font-codecs';
export type { FontFormat, CodecInitOptions, CodecLimits, CodecResult, CodecErrorCode, WasmSource } from 'web-font-codecs';
export type { Woff1EncodeOptions } from 'woff1-codec';
export type { Woff2EncodeOptions } from 'woff2-codec';
export interface ConverterOptions {
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
  /** Lazily load only the codecs required for this conversion. Same-format copies preserve the container. */
  convert(input: Uint8Array, options: ConversionOptions): Promise<ConversionResult>;
}
export function createFontConverter(options: ConverterOptions = {}): FontConverter {
  let one: Promise<Woff1Codec> | undefined, two: Promise<Woff2Codec> | undefined, disposed = false;
  let initializedOne: Woff1Codec | undefined, initializedTwo: Woff2Codec | undefined;
  const own = <T extends CodecLifecycle>(codec: T): T => {
    if (disposed) { codec[Symbol.dispose](); throw new FontCodecError('DISPOSED', 'Converter has been disposed'); }
    return codec;
  };
  const getOne = () => one ??= import('woff1-codec').then(m => m.createWoff1Codec(options.woff1)).then(codec => initializedOne = own(codec)).catch(error => { one = undefined; throw error; });
  const getTwo = () => two ??= import('woff2-codec').then(m => m.createWoff2Codec(options.woff2)).then(codec => initializedTwo = own(codec)).catch(error => { two = undefined; throw error; });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    initializedOne?.[Symbol.dispose]();
    initializedTwo?.[Symbol.dispose]();
  };
  return {
    dispose,
    [Symbol.dispose]: dispose,
    async convert(input, conversion) {
      if (disposed) throw new FontCodecError('DISPOSED', 'Converter has been disposed');
      if (!conversion || !['sfnt','woff1','woff2'].includes(conversion.to)) throw new FontCodecError('INVALID_OPTION', 'Choose sfnt, woff1, or woff2');
      const from = detectFormat(input), to = conversion.to;
      const limit = from === 'woff1' ? options.woff1?.maxInputBytes : options.woff2?.maxInputBytes;
      validateFont(input, from, limit ?? 512 * 1024 * 1024);
      let result: CodecResult;
      let discardedAuxiliaryData = false;
      if (from === to && !('encode' in conversion && conversion.encode !== undefined)) result = { data: input.slice(), warnings: [] };
      else {
        let sfnt: CodecResult;
        if (from === 'woff1') sfnt = (await getOne()).decode(input);
        else if (from === 'woff2') sfnt = (await getTwo()).decode(input);
        else sfnt = { data: input.slice(), warnings: [] };
        if (disposed) throw new FontCodecError('DISPOSED', 'Converter has been disposed');
        if (from !== 'sfnt') {
          const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
          discardedAuxiliaryData = view.getUint32(from === 'woff1' ? 24 : 28) !== 0 || view.getUint32(from === 'woff1' ? 36 : 40) !== 0;
        }
        if (to === 'woff1') result = (await getOne()).encode(sfnt.data, conversion.encode);
        else if (to === 'woff2') result = (await getTwo()).encode(sfnt.data, conversion.encode);
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
