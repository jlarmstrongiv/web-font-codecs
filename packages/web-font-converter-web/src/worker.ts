import './lib/dispose.ts';
import { createFontConverter, FontCodecError } from 'web-font-codecs';
import type { CodecErrorCode, ConversionOptions, ConversionResult } from 'web-font-codecs';
export interface Request { bytes: ArrayBuffer; options: ConversionOptions }
export type Reply = { ok: true; result: ConversionResult } | { ok: false; error: string; code?: CodecErrorCode };
const pending: Request[] = [];
let handle: ((request: Request) => void) | undefined;
const reportError = (error: unknown) => {
  const reply: Reply = { ok: false, error: error instanceof Error ? error.message : String(error) };
  if (error instanceof FontCodecError) reply.code = error.code;
  self.postMessage(reply);
};
self.onmessage = (event: MessageEvent<Request>) => {
  if (handle) handle(event.data);
  else pending.push(event.data);
};
// Keep the converter for the worker lifetime; worker termination releases it.
void createFontConverter().then(converter => {
  handle = request => {
    try {
      const result = converter.convert(new Uint8Array(request.bytes), request.options);
      self.postMessage({ ok: true, result } satisfies Reply, { transfer: [result.data.buffer] });
    } catch (error) { reportError(error); }
  };
}, error => {
  handle = () => reportError(error);
}).then(() => {
  for (const request of pending) handle!(request);
  pending.length = 0;
});
