import './lib/dispose.ts';
import { createFontConverter, FontCodecError } from 'web-font-converter';
import type { CodecErrorCode, ConversionOptions, ConversionResult } from 'web-font-converter';
export interface Request { bytes: ArrayBuffer; options: ConversionOptions }
export type Reply = { ok: true; result: ConversionResult } | { ok: false; error: string; code?: CodecErrorCode };
const converter = createFontConverter();
self.onmessage = async (event: MessageEvent<Request>) => {
  try {
    const result = await converter.convert(new Uint8Array(event.data.bytes), event.data.options);
    self.postMessage({ ok: true, result } satisfies Reply, { transfer: [result.data.buffer] });
  } catch (error) {
    const reply: Reply = { ok: false, error: error instanceof Error ? error.message : String(error) };
    if (error instanceof FontCodecError) reply.code = error.code;
    self.postMessage(reply);
  }
};
