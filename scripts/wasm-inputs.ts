import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
/** Stable fingerprint of vendored source, adapters, compiler pin and build instructions. */
export async function wasmInputsHash(): Promise<string> {
  const hash = createHash('sha256');
  async function visit(directory: string): Promise<void> {
    for (const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
      const file=join(directory,entry.name);
      const relativeFile = file.replaceAll('\\', '/');
      // Git checkout metadata and unused upstream/generated dependencies are not build inputs.
      if (entry.name === '.git' || relativeFile === 'vendor/woff2/brotli' || relativeFile === 'vendor/brotli/research/dictionary.bin') continue;
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) { hash.update(file.replaceAll('\\','/'));hash.update('\0');hash.update((await readFile(file)));hash.update('\0'); }
    }
  }
  await visit('vendor');
  for (const file of ['native/compression.c','native/woff1.c','native/woff2.cc','native/build-woff1.ts','scripts/process.ts','scripts/build-wasm.ts','scripts/wasm-inputs.ts','mise.toml']) { hash.update(file);hash.update('\0');hash.update((await readFile(file)));hash.update('\0'); }
  return hash.digest('hex');
}
