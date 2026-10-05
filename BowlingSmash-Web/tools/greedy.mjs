// Greedy multi-shot solver: finds a shot sequence that wins a level, choosing
// each shot by (targets remaining, then robustness = neighbours' results).
//   node tools/greedy.mjs <levelId> [--spins=-1,0,1] [--angles=-30:30:2] [--powers=0.35,0.65,0.95] [--booster=heavy] [--max=N]
import { runShots } from '../src/sim/Sim.js';
import { getLevel } from '../src/levels/levels.js';

const args = Object.fromEntries(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')));
const level = getLevel(+process.argv[2]);
const rng = (s) => { const [a, b, c] = s.split(':').map(Number); const o = []; for (let x = a; x <= b + 1e-9; x += c) o.push(+x.toFixed(3)); return o; };
const angles = rng(args.angles || '-30:30:2');
const powers = (args.powers || '0.35,0.65,0.95').split(',').map(Number);
const spins = (args.spins || (level.hook ? '-1,-0.5,0,0.5,1' : '0')).split(',').map(Number);
const maxShots = +(args.max || level.balls);
const firstBooster = args.booster || null;
const seq = args.prefix ? JSON.parse(args.prefix) : [];

while (seq.length < maxShots) {
  const results = new Map();
  let best = null;
  for (const spin of spins) for (const power of powers) for (const angle of angles) {
    const shot = { angle, power, spin };
    if (seq.length === 0 && firstBooster) shot.booster = firstBooster;
    const r = await runShots(level, [...seq, shot]);
    results.set(`${spin}|${power}|${angle}`, r.remaining);
  }
  const step = angles[1] - angles[0];
  for (const spin of spins) for (const power of powers) for (const angle of angles) {
    const me = results.get(`${spin}|${power}|${angle}`);
    const nb = [results.get(`${spin}|${power}|${+(angle - step).toFixed(3)}`), results.get(`${spin}|${power}|${+(angle + step).toFixed(3)}`)]
      .map((v) => (v === undefined ? me + 3 : v));
    const score = me * 10 + nb[0] + nb[1];
    if (!best || score < best.score) best = { score, shot: { angle, power, spin }, me, nb };
  }
  if (seq.length === 0 && firstBooster) best.shot.booster = firstBooster;
  seq.push(best.shot);
  console.log(`shot ${seq.length}:`, JSON.stringify(best.shot), 'remaining', best.me, 'neighbours', best.nb.join(','));
  if (best.me === 0) break;
}
const final = await runShots(level, seq);
console.log(`L${level.id} ${final.won ? 'SOLVED' : 'NOT SOLVED'} in ${final.shotsTaken}/${level.balls}:`, JSON.stringify(seq));
