// Search for one-ball STRIKE solutions on a level (fine grid).
//   node tools/strike.mjs <levelId> [--angles=-12:12:0.5] [--powers=0.3,0.5,...] [--spins=-1,-0.5,0,0.5,1]
import { runShots } from '../src/sim/Sim.js';
import { getLevel } from '../src/levels/levels.js';
const args = Object.fromEntries(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')));
const level = getLevel(+process.argv[2]);
const rng = (s) => { const [a, b, c] = s.split(':').map(Number); const o = []; for (let x = a; x <= b + 1e-9; x += c) o.push(+x.toFixed(3)); return o; };
const angles = rng(args.angles || '-12:12:0.5');
const powers = (args.powers || '0.2,0.35,0.5,0.65,0.8,0.95').split(',').map(Number);
const spins = (args.spins || '-1,-0.5,0,0.5,1').split(',').map(Number);
let best = null; const wins = [];
for (const spin of spins) for (const power of powers) for (const angle of angles) {
  const r = await runShots(level, [{ angle, power, spin }]);
  if (r.won) { wins.push({ angle, power, spin }); console.log('STRIKE', JSON.stringify({ angle, power, spin })); }
  if (!best || r.remaining < best.r) best = { r: r.remaining, shot: { angle, power, spin } };
}
console.log(`strikes ${wins.length}; best ${JSON.stringify(best)}`);
