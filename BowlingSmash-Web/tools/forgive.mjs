// Forgiveness check: broad first-shot sweep then naive bot cleanup.
import { Sim } from '../src/sim/Sim.js';
import { getLevel } from '../src/levels/levels.js';
import { playWithBot } from '../src/sim/bot.js';
const id = +process.argv[2];
const level = getLevel(id);
let wins = 0, n = 0, strikes = 0; const fails = [];
for (let a = -12; a <= 12; a += 2) for (const p of [0.2, 0.45, 0.7, 0.95]) {
  const r = await playWithBot(Sim, level, [{ angle: a, power: p }]);
  n++; if (r.won) wins++; else fails.push([a, p, r.remaining]); if (r.won && r.shots === 1) strikes++;
}
console.log(`L${id} forgiving: ${wins}/${n} won (${strikes} strikes)`, fails.length ? 'fails ' + JSON.stringify(fails) : '');
