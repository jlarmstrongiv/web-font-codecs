import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const polyfill = await readFile(new URL('../packages/web-font-converter-web/src/lib/dispose.ts', import.meta.url), 'utf8');

test('demo preserves the native disposal symbol and its descriptor', () => {
  const before = Object.getOwnPropertyDescriptor(Symbol, 'dispose');
  runInNewContext(polyfill, { Symbol });
  assert.deepEqual(Object.getOwnPropertyDescriptor(Symbol, 'dispose'), before);
});

test('demo installs the shared disposal symbol before constructing disposable objects', () => {
  const legacySymbol = { for: Symbol.for };
  const context = { Symbol: legacySymbol };
  runInNewContext(polyfill, context);
  const descriptor = Object.getOwnPropertyDescriptor(legacySymbol, 'dispose');
  assert.deepEqual(descriptor, {
    value: Symbol.for('Symbol.dispose'), writable: false, enumerable: false, configurable: false,
  });
  const disposable = runInNewContext('({ [Symbol.dispose]() { return "disposed"; } })', context);
  assert.equal(Object.hasOwn(disposable, 'undefined'), false);
  assert.equal(disposable[Symbol.for('Symbol.dispose')](), 'disposed');
  runInNewContext(polyfill, context);
  assert.deepEqual(Object.getOwnPropertyDescriptor(legacySymbol, 'dispose'), descriptor);
});
