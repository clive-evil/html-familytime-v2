#!/usr/bin/env node
// Headless balance simulation. Runs the AutoPlayer bot against the real
// simulation for several seeds and hatch policies, prints a per-day table and
// (with --check) fails on obvious balance problems.
//
//   npm run sim                 # report
//   npm run sim -- --check      # report + sanity assertions (non-zero exit on failure)
//   npm run sim -- --days 14 --seeds 5

import { Simulation } from '../src/core/Simulation.js';
import { AutoPlayer, runHeadless } from '../src/core/bot/AutoPlayer.js';
import { BALANCE } from '../src/data/balance.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? Number(args[i + 1]) : d; };
const DAYS = opt('days', 12);
const SEEDS = opt('seeds', 4);
const CHECK = args.includes('--check');
const QUIET = args.includes('--quiet');

function runOne(seed, policy) {
  const sim = Simulation.newGame(seed);
  const bot = new AutoPlayer(sim, { policy });
  const days = [];
  const t0 = performance.now();
  // Day 1 is untimed; give the bot up to 6 minutes to finish it.
  let guard = 0;
  while (sim.state.day === 1 && guard++ < 7200) { bot.update(0.05); sim.step(0.05); sim.events.length = 0; }
  const day1Seconds = guard * 0.05;
  const record = (sum, sim) => {
    const st = sim.status();
    days.push({
      day: sum.day, pop: sum.pop, beds: sum.beds, food: Math.floor(sum.food), wood: Math.floor(sum.wood), stone: Math.floor(sum.stone),
      eaten: sum.eaten, produced: sum.food === undefined ? 0 : 0, missed: sum.missedMeals, hatched: sum.hatched,
      laid: sum.eggsLaid, lost: sum.eggsLost, outside: sum.sleptOutside, workers: st.workers, eggs: sum.eggsWaiting,
      foodRate: st.foodRate, demand: st.foodDemand,
      farmers: sim.state.grandmas.filter((g) => g.job === 'farmer').length,
    });
  };
  while (sim.state.day <= DAYS) {
    runHeadless(sim, bot, BALANCE.dayLength + BALANCE.nightLength + 1, 0.05, record);
  }
  return { seed, policy, days, day1Seconds, ms: performance.now() - t0, sim, log: bot.log };
}

function table(r) {
  const head = 'day  pop beds  food  wood stone eaten missed hatch laid lost outside workers eggs food/d demand farmers';
  console.log(`\n== seed ${r.seed} policy=${r.policy}  (day 1 took ${r.day1Seconds.toFixed(0)}s, sim ${r.ms.toFixed(0)}ms)`);
  console.log(head);
  for (const d of r.days) {
    console.log([d.day, d.pop, d.beds, d.food, d.wood, d.stone, d.eaten, d.missed, d.hatched, d.laid, d.lost, d.outside, d.workers, d.eggs, d.foodRate, d.demand, d.farmers]
      .map((v, i) => String(v).padStart(i === 0 ? 3 : [4, 4, 5, 5, 5, 5, 6, 5, 4, 4, 7, 7, 4, 6, 6, 7][i - 1])).join(' '));
  }
}

const failures = [];
const results = { balanced: [], greedy: [], never: [], lazy: [] };
for (let seed = 1; seed <= SEEDS; seed++) {
  for (const policy of ['balanced', 'greedy', 'never', 'lazy']) {
    if (policy !== 'balanced' && seed > 2) continue;
    const r = runOne(seed * 7919, policy);
    results[policy].push(r);
    if (!QUIET) table(r);
  }
}

const at = (r, day) => r.days.find((d) => d.day === day) || r.days[r.days.length - 1];
console.log('\n== summary');
for (const policy of Object.keys(results)) {
  const pops = results[policy].map((r) => at(r, DAYS).pop);
  console.log(`${policy.padEnd(9)} pop@day${DAYS}: ${pops.join(', ')}`);
}

if (CHECK) {
  for (const r of results.balanced) {
    const tag = `seed ${r.seed}`;
    if (r.day1Seconds > 300) failures.push(`${tag}: Day 1 took ${r.day1Seconds}s (bot could not finish tutorial)`);
    const d3 = at(r, 3);
    if (d3.missed > d3.pop * 2) failures.push(`${tag}: starvation on day 3 (${d3.missed} missed meals, pop ${d3.pop})`);
    const d6 = at(r, 6);
    if (d6.pop < 6) failures.push(`${tag}: progression stalled, pop ${d6.pop} on day 6`);
    if (d6.pop > 60) failures.push(`${tag}: runaway too early, pop ${d6.pop} on day 6`);
    const last = at(r, DAYS);
    if (last.pop < 40) failures.push(`${tag}: pop only ${last.pop} by day ${DAYS}`);
    // Starvation that never recovers: missed meals in each of the last 3 days.
    const tail = r.days.slice(-3);
    if (tail.length === 3 && tail.every((d) => d.missed > d.pop)) failures.push(`${tag}: chronic starvation at end`);
    // Unlimited food: one farmer must not out-produce the demand of many Grandmas.
    // Measured: food produced per farmer per day vs one Grandma's appetite.
    const perGrandma = BALANCE.grandma.mealSize * BALANCE.grandma.mealsPerDay;
    for (const d of r.days.filter((d) => d.farmers >= 3)) {
      const feeds = d.foodRate / d.farmers / perGrandma;
      if (feeds > 10) { failures.push(`${tag} day ${d.day}: one farmer feeds ${feeds.toFixed(1)} Grandmas (too generous)`); break; }
    }
  }
  for (const r of results.never) {
    if (at(r, DAYS).pop !== 1) failures.push(`never-hatch seed ${r.seed}: population grew without hatching`);
  }
  // Food pressure must bite when farming is neglected, but stay a soft failure.
  for (const r of results.lazy) {
    const missed = r.days.reduce((a, d) => a + d.missed, 0);
    if (missed === 0) failures.push(`lazy seed ${r.seed}: neglecting farms never caused hunger (no food pressure)`);
    if (at(r, DAYS).pop < 2) failures.push(`lazy seed ${r.seed}: colony collapsed`);
  }
  const bal = Math.min(...results.balanced.map((r) => at(r, DAYS).pop));
  const nev = Math.max(...results.never.map((r) => at(r, DAYS).pop));
  if (bal < nev * 10) failures.push(`hatching barely matters (balanced ${bal} vs never ${nev})`);

  if (failures.length) {
    console.log('\nBALANCE CHECK FAILED');
    for (const f of failures) console.log(' - ' + f);
    process.exit(1);
  }
  console.log('\nBALANCE CHECK PASSED');
}
