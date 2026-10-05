// Re-solve every level with tools/greedy.mjs (N parallel workers) and write
// src/levels/solutions.js from the results.
//   node tools/solve-all.mjs [ids...]   (default: all)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { LEVELS } from '../src/levels/levels.js';

const ids = process.argv.slice(2).map(Number).filter(Boolean);
const todo = ids.length ? ids : LEVELS.map((l) => l.id);
const outFile = new URL('../src/levels/solutions.js', import.meta.url);
const existing = fs.existsSync(outFile) ? (await import(outFile.href + '?t=' + Date.now())).SOLUTIONS : {};
const results = { ...existing };
const N = 4;
const run = (id) => new Promise((res) => {
  const p = spawn(process.execPath, ['tools/greedy.mjs', String(id)], { cwd: new URL('..', import.meta.url).pathname });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', () => {});
  p.on('close', () => {
    const m = out.match(/L\d+ (SOLVED|NOT SOLVED) in \d+\/\d+: (.*)$/m);
    if (m && m[1] === 'SOLVED') results[id] = { ...(results[id] || {}), shots: JSON.parse(m[2]) };
    console.log(`L${id}: ${m ? m[1] : 'ERROR'} ${m ? m[2] : out.slice(-300)}`);
    res();
  });
});
const queue = [...todo];
await Promise.all(Array.from({ length: N }, async () => { while (queue.length) await run(queue.shift()); }));
const body = Object.keys(results).sort((a, b) => a - b).map((k) => `  ${k}: ${JSON.stringify(results[k])},`).join('\n');
fs.writeFileSync(outFile, `// Known valid solutions for every level (found with tools/greedy.mjs via
// tools/solve-all.mjs, verified by tests/solutions.test.js). Shots: angle
// (deg, + = right), power 0..1, spin -1..1, optional booster.
export const SOLUTIONS = {
${body}
};
`);
console.log('wrote', outFile.pathname);
