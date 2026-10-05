// Level tuning / solving tool (headless).
//   node tools/solve.mjs <levelId> [--spins=-1,0,1] [--angles=-20:20:2] [--powers=0.3,0.6,1] [--prefix=JSON]
// Prints a win/remaining grid for one-shot (or prefix+shot) sequences and an idle-stability check.
import { runShots, Sim } from '../src/sim/Sim.js';
import { getLevel } from '../src/levels/levels.js';

const args = Object.fromEntries(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')));
const id = +process.argv[2];
const level = getLevel(id);
const rng = (s) => { const [a, b, c] = s.split(':').map(Number); const o = []; for (let x = a; x <= b + 1e-9; x += c) o.push(+x.toFixed(3)); return o; };
const angles = args.angles ? (args.angles.includes(':') ? rng(args.angles) : args.angles.split(',').map(Number)) : rng('-20:20:2');
const powers = (args.powers || '0.3,0.5,0.7,0.85,1').split(',').map(Number);
const spins = (args.spins || '0').split(',').map(Number);
const prefix = args.prefix ? JSON.parse(args.prefix) : [];
const booster = args.booster || null;

// idle stability
{
  const sim = await Sim.create(level, {});
  for (let i = 0; i < 360; i++) sim.step();
  console.log(`L${id} ${level.name}: targets=${sim.targetsTotal} idleDown=${sim.targetsDown} bodies=${sim.bodyCount()} state=${sim.state}`);
  sim.dispose();
}
const t0 = performance.now();
let n = 0;
const wins = [];
for (const spin of spins) {
  console.log(`-- spin ${spin}   powers: ${powers.join(' ')}`);
  for (const angle of angles) {
    let row = '';
    for (const power of powers) {
      const shot = { angle, power, spin, booster };
      const r = await runShots(level, [...prefix, shot], { noAssist: !!args.noassist });
      n++;
      if (r.won) wins.push(shot);
      row += r.won ? '   X' : String(r.remaining).padStart(4);
    }
    console.log(String(angle).padStart(6), row);
  }
}
console.log(`wins ${wins.length}/${n}  (${((performance.now() - t0) / n).toFixed(0)} ms/run)`);
if (wins.length) console.log('example', JSON.stringify(wins[Math.floor(wins.length / 2)]));
