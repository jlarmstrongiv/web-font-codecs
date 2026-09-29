/// <reference lib="esnext.disposable" preserve="true" />
/** The containers understood by the converter. SFNT covers single TTF and OTF fonts. */
export type FontFormat = 'sfnt' | 'woff1' | 'woff2';
export type CodecErrorCode = 'INVALID_INPUT' | 'UNSUPPORTED_FORMAT' | 'LIMIT_EXCEEDED' | 'INVALID_OPTION' | 'CODEC_FAILURE' | 'WASM_INIT' | 'DISPOSED';
export class FontCodecError extends Error {
  readonly code: CodecErrorCode;
  readonly nativeStatus: number | undefined;
  constructor(code: CodecErrorCode, message: string, options?: { cause?: unknown; nativeStatus?: number }) {
    super(message, options);
    this.name = 'FontCodecError'; this.code = code; this.nativeStatus = options?.nativeStatus;
  }
}
/** Each instance has its own WASM memory. All methods after creation are synchronous. */
export interface CodecLimits {
  /** Maximum input bytes, including container metadata. Default: 512 MiB. */
  maxInputBytes?: number;
  /** Maximum output or extracted metadata/private bytes. Default: 512 MiB. */
  maxOutputBytes?: number;
}
type ResolvedWasmSource = BufferSource | WebAssembly.Module | Response | ReadableStream<Uint8Array> | URL | string;
export type WasmSource = ResolvedWasmSource | PromiseLike<ResolvedWasmSource>;
export interface CodecInitOptions extends CodecLimits {
  /** Supply a URL, response, bytes, module, byte stream, or a promise of one; defaults to the packaged WASM. */
  wasm?: WasmSource;
}
export interface CodecResult {
  /** An owned copy, independent of the WASM heap and future calls. */
  data: Uint8Array<ArrayBuffer>;
  /** Names of repairs made during conversion; empty when no repairs were reported. */
  warnings: string[];
}
export interface CodecLifecycle extends Disposable {
  /** Release the reference to the WASM instance; future calls throw DISPOSED. */
  dispose(): void;
}
export function integerOption(value: number, name: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new FontCodecError('INVALID_OPTION', `${name} must be an integer from ${min} to ${max}`);
  return value;
}
export function detectFormat(data: Uint8Array): FontFormat {
  if (!(data instanceof Uint8Array) || data.byteLength < 4) throw new FontCodecError('INVALID_INPUT', 'Expected font bytes with a four-byte signature');
  const magic = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0);
  if (magic === 0x774f4646) return 'woff1';
  if (magic === 0x774f4632) return 'woff2';
  if (magic === 0x00010000 || magic === 0x4f54544f || magic === 0x74727565) return 'sfnt';
  if (magic === 0x74746366) throw new FontCodecError('UNSUPPORTED_FORMAT', 'Font collections (TTC/OTC) are not supported; extract a single face first');
  throw new FontCodecError('UNSUPPORTED_FORMAT', 'Unrecognized font signature');
}
/** Structural validation protects the historical Mozilla encoder before it reads table records. */
export function validateFont(data: Uint8Array, expected: FontFormat, maximum: number): void {
  if (!(data instanceof Uint8Array)) throw new FontCodecError('INVALID_INPUT', 'Expected Uint8Array font bytes');
  if (data.byteLength > maximum) throw new FontCodecError('LIMIT_EXCEEDED', `Input exceeds ${maximum} bytes`);
  const format = detectFormat(data);
  if (format !== expected) throw new FontCodecError('UNSUPPORTED_FORMAT', `Expected ${expected}, received ${format}`);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const invalid = (message: string): never => { throw new FontCodecError('INVALID_INPUT', message); };
  if (format !== 'sfnt') {
    const header = format === 'woff1' ? 44 : 48;
    if (data.length < header) invalid('Truncated WOFF header');
    if (view.getUint32(8) !== data.length) invalid('WOFF declared length does not match input');
    if (view.getUint16(14) !== 0 || view.getUint16(12) === 0) invalid('Invalid WOFF header');
    const flavor = view.getUint32(4);
    if (flavor === 0x74746366) throw new FontCodecError('UNSUPPORTED_FORMAT', 'WOFF collections are not supported');
    if (![0x10000, 0x4f54544f, 0x74727565].includes(flavor)) invalid('Unsupported WOFF SFNT flavor');
    return;
  }
  if (data.length < 12) invalid('Truncated SFNT header');
  const count = view.getUint16(4), end = 12 + count * 16;
  if (count === 0 || end > data.length) invalid('Invalid SFNT table directory');
  let previous = -1;
  const ranges: [number, number][] = [];
  for (let pos = 12; pos < end; pos += 16) {
    const tag = view.getUint32(pos), offset = view.getUint32(pos + 8), length = view.getUint32(pos + 12);
    if (tag <= previous) invalid('SFNT table directory must be sorted with unique tags');
    previous = tag;
    if (offset < end || offset > data.length || length > data.length - offset) invalid('SFNT table extends outside input');
    if ((tag === 0x68656164 || tag === 0x62686564) && length < 54) invalid('Truncated head table');
    if (length) ranges.push([offset, offset + length]);
  }
  ranges.sort((a,b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++) if (ranges[i]![0] < ranges[i - 1]![1]) invalid('Overlapping SFNT tables');
}

interface NativeExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  malloc: (size: number) => number;
  free: (pointer: number) => void;
  codec_run: (input: number, length: number, operation: number, limit: number, a: number, b: number, metadata: number, metadataLength: number, privateData: number, privateLength: number, engine: number, iterations: number) => number;
  codec_size: () => number;
  codec_status: () => number;
  codec_release: () => void;
  _initialize: () => void;
}
/** Internal C ABI runtime; exported for the independently distributed codec packages. */
export interface CodecRuntime extends CodecLifecycle {
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
  run(input: Uint8Array, operation: number, a?: number, b?: number, metadata?: Uint8Array, privateData?: Uint8Array, engine?: number, iterations?: number): { data: Uint8Array<ArrayBuffer>; warningFlags: number };
}
export async function createRuntime(source: WasmSource, options: CodecLimits = {}): Promise<CodecRuntime> {
  const maxInputBytes = integerOption(options.maxInputBytes ?? 512 * 1024 * 1024, 'maxInputBytes', 1, 512 * 1024 * 1024);
  const maxOutputBytes = integerOption(options.maxOutputBytes ?? 512 * 1024 * 1024, 'maxOutputBytes', 1, 512 * 1024 * 1024);
  let native: NativeExports | undefined;
  try {
    let bytes = await source;
    if (typeof bytes === 'string' || bytes instanceof URL) bytes = await fetch(bytes);
    if (bytes instanceof ReadableStream) bytes = new Response(bytes);
    if (bytes instanceof Response) {
      if (!bytes.ok) throw new Error(`WASM request failed: HTTP ${bytes.status}`);
      bytes = await bytes.arrayBuffer();
    }
    const imports = { wasi_snapshot_preview1: {
      proc_exit: (code: number): never => { throw new Error(`WASM exited (${code})`); },
      fd_write: () => 0, fd_close: () => 0, fd_seek: () => 0,
      environ_sizes_get: () => 0, environ_get: () => 0,
    }, env: { emscripten_notify_memory_growth: () => {} } };
    const module = bytes instanceof WebAssembly.Module ? bytes : await WebAssembly.compile(bytes);
    native = (await WebAssembly.instantiate(module, imports)).exports as NativeExports;
    native._initialize();
  } catch (cause) { throw new FontCodecError('WASM_INIT', 'Could not initialize the font codec', { cause }); }
  const dispose = () => { native = undefined; };
  return {
    maxInputBytes, maxOutputBytes,
    dispose,
    [Symbol.dispose]: dispose,
    run(input, operation, a = 0, b = 0, metadata = new Uint8Array(), privateData = new Uint8Array(), engine = 0, iterations = 15) {
      if (!native) throw new FontCodecError('DISPOSED', 'Codec has been disposed');
      if (input.length + metadata.length + privateData.length > maxInputBytes) throw new FontCodecError('LIMIT_EXCEEDED', 'Combined input and auxiliary data exceed input limit');
      const n = native, allocations: number[] = [];
      try {
        const put = (data: Uint8Array): number => {
          if (!data.length) return 0;
          // Historical checksum code can read alignment padding; ensure zeroed accessible bytes.
          const ptr = n.malloc(data.length + 4);
          if (!ptr) throw new FontCodecError('LIMIT_EXCEEDED', 'WASM memory allocation failed');
          allocations.push(ptr);
          const heap = new Uint8Array(n.memory.buffer);
          heap.set(data, ptr); heap.fill(0, ptr + data.length, ptr + data.length + 4);
          return ptr;
        };
        const pointer = n.codec_run(put(input), input.length, operation, maxOutputBytes, a, b, put(metadata), metadata.length, put(privateData), privateData.length, engine, iterations);
        const status = n.codec_status(), length = n.codec_size();
        if (status & 255) throw new FontCodecError((status & 255) === 128 || (status & 255) === 1 ? 'LIMIT_EXCEEDED' : 'CODEC_FAILURE', `Native codec rejected input (status ${status & 255})`, { nativeStatus: status });
        if (length > maxOutputBytes) throw new FontCodecError('LIMIT_EXCEEDED', 'Output exceeds configured limit');
        return { data: new Uint8Array(n.memory.buffer, pointer, length).slice(), warningFlags: status & ~255 };
      } catch (cause) {
        if (cause instanceof FontCodecError) throw cause;
        // A trap may leave native allocator state unusable; require a fresh instance.
        native = undefined;
        throw new FontCodecError('CODEC_FAILURE', 'WASM codec failed; create a new instance', { cause });
      } finally {
        if (native === n) {
          n.codec_release();
          for (const ptr of allocations) n.free(ptr);
        }
      }
    },
  };
}
