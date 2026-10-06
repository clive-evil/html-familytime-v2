// Loads the pure-logic modules into this Node process (same files the browser build inlines).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const here = new URL('../src/js/', import.meta.url);
export const SIM_FILES = ['core', 'data', 'sim', 'combat', 'campaign', 'tutorial', 'bot'];
export function loadSF() {
  delete globalThis.SF;
  for (const f of SIM_FILES) vm.runInThisContext(readFileSync(new URL(f + '.js', here), 'utf8'), { filename: f + '.js' });
  return globalThis.SF;
}
