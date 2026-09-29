// Initialize the worker's disposal symbol before any codec is constructed.
if (Symbol.dispose === undefined) {
  Object.defineProperty(Symbol, 'dispose', { value: Symbol.for('Symbol.dispose') });
}
