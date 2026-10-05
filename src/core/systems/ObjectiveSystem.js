import { BALANCE } from '../../data/balance.js';
import { BUILDINGS, BUILD_ORDER } from '../../data/buildings.js';
import { bedCapacity, countBuildings, eggCapacity } from './BuildingSystem.js';
import { storedEggs, incubatorFree } from './EggSystem.js';
import { jobSlots } from './JobSystem.js';
import { foodDemandPerDay } from './ResourceSystem.js';

// Tutorial = an ordered list of (objective text, done-check). Each step is
// skipped automatically if the player already did it, so it never blocks.
const manual = (s) => s.buildings.find((b) => b.type === 'granulator');

export const TUTORIAL = [
  { id: 'berries', text: 'Grandma is hungry. Pick berries from the bushes by the hedge.', done: (s) => s.player.carry.food >= 4 || s.flags.deliveredFood },
  { id: 'home', text: 'Bring the berries home. Walk up to the cottage cart.', done: (s) => s.flags.deliveredFood },
  { id: 'wood', text: 'Gather 6 wood from the trees to the north-east.', done: (s) => s.resources.wood >= 6 || countBuildings(s, 'bed') > 0 },
  { id: 'placeBed', text: 'Press B to build a Bed. Place it near the cottage.', done: (s) => countBuildings(s, 'bed') > 0 },
  { id: 'buildBed', text: 'Hold E at the Bed to build it.', done: (s) => countBuildings(s, 'bed', true) > 0 },
  { id: 'sleep', text: 'Hold E at the cottage door to sleep.', done: (s) => s.day >= 2 },
  { id: 'egg', text: 'Something is in the Egg Basket.', done: (s) => s.player.egg || manual(s).inc.stage !== 'empty' || s.flags.firstHatch },
  { id: 'insert', text: 'Carry the egg to the Gran-ulator.', done: (s) => manual(s).inc.stage !== 'empty' || s.flags.firstHatch },
  { id: 'lid', text: 'Close the lid.', done: (s) => ['closed', 'heating', 'cracking'].includes(manual(s).inc.stage) || s.flags.firstHatch },
  { id: 'dial', text: 'Hold E to turn the dial all the way to NANA.', done: (s) => ['heating', 'cracking'].includes(manual(s).inc.stage) || s.flags.firstHatch },
  { id: 'wait', text: 'Stand back.', done: (s) => s.flags.firstHatch },
  { id: 'farm', text: 'Two mouths to feed. Press B and place a Farm Plot.', done: (s) => countBuildings(s, 'farm') > 0 || countBuildings(s, 'bigfarm') > 0 },
  { id: 'farmBuild', text: 'Hold E at the Farm Plot to build it.', done: (s) => countBuildings(s, 'farm', true) > 0 || countBuildings(s, 'bigfarm', true) > 0 },
  { id: 'assign', text: 'Press E at the Farm Plot to put Grandma to work.', done: (s) => s.grandmas.some((g) => g.job === 'farmer') },
];

export function updateObjectives(sim) {
  const s = sim.state;
  const t = s.tutorial;
  if (t.done) return;
  while (t.step < TUTORIAL.length && TUTORIAL[t.step].done(s)) {
    sim.emit('objective', { done: TUTORIAL[t.step].id });
    t.step++;
  }
  if (t.step >= TUTORIAL.length) {
    t.done = true;
    sim.emit('tutorialDone', {});
  }
}

export function currentObjective(sim) {
  const s = sim.state;
  if (!s.tutorial.done) {
    const step = TUTORIAL[s.tutorial.step];
    return { text: step.text, tutorial: true, step: s.tutorial.step, total: TUTORIAL.length };
  }
  return { text: dynamicHint(sim), tutorial: false };
}

function dynamicHint(sim) {
  const s = sim.state;
  const st = getStatus(sim);
  if (st.food < st.pop * 2 && st.foodRate < st.foodDemand) return 'Food is running out. Build farms and assign more Farmers.';
  if (st.beds < st.pop) { const n = st.pop - st.beds; return `${n} Grandma${n > 1 ? 's need beds' : ' needs a bed'}. Build Beds, Granny Flats or a Bunk Barn.`; }
  if (st.eggsStored >= st.eggCap && st.eggCap > 0) return 'The egg basket is full. Hatch some eggs, or build an Egg Crate.';
  if (st.idleAdults >= 2 && st.openSlots > 0) return `${st.idleAdults} Grandmas are standing about. Give them jobs.`;
  if (st.eggsStored > 0 && st.freeIncubators > 0) return 'Eggs are waiting. Hatch them if you can feed them.';
  if (st.foodRate < st.foodDemand) return 'Food production is behind demand. More Farmers.';
  const next = BUILD_ORDER.map((t) => BUILDINGS[t]).find((d) => d.unlockPop > s.maxPop);
  if (next) return `Reach ${next.unlockPop} Grandmas to unlock the ${next.name}.`;
  return 'Keep them fed. Keep them housed. Keep them busy.';
}

// HUD-facing snapshot. Pure read of state.
export function getStatus(sim) {
  const s = sim.state;
  const pop = s.grandmas.length;
  let adults = 0, hatchlings = 0, workers = 0, idleAdults = 0, starving = 0, hungry = 0;
  for (const g of s.grandmas) {
    if (g.adult) adults++; else hatchlings++;
    if (g.job) workers++; else if (g.adult) idleAdults++;
    if (g.starving) starving++;
    if (g.hunger >= BALANCE.grandma.hungerSeek) hungry++;
  }
  let openSlots = 0, freeIncubators = 0, incubating = 0;
  for (const b of s.buildings) {
    if (!b.built) continue;
    if (BUILDINGS[b.type].job && b.type !== 'bell') openSlots += jobSlots(b) - b.workers.length;
    if (b.inc) {
      freeIncubators += incubatorFree(b);
      incubating += b.inc.slots ? b.inc.slots.filter(Boolean).length : (b.inc.stage !== 'empty' ? 1 : 0);
    }
  }
  const beds = bedCapacity(s);
  const eggCap = eggCapacity(s);
  const eggsStored = storedEggs(s);
  const eggsWaiting = s.eggs.filter((e) => e.loc !== 'incubator').length;
  const foodDemand = foodDemandPerDay(s);
  const foodRate = Math.round(s.stats.prod.food * BALANCE.dayLength);
  const warnings = [];
  if (pop > 0 && s.resources.food < BALANCE.grandma.mealSize && hungry > 0) warnings.push({ id: 'nofood', text: 'NO FOOD', level: 2 });
  else if (pop > 1 && s.resources.food < pop * 2) warnings.push({ id: 'foodlow', text: 'FOOD LOW', level: 1 });
  if (starving > 0) warnings.push({ id: 'starving', text: `${starving} HUNGRY GRANDMA${starving > 1 ? 'S' : ''}`, level: 2 });
  if (beds < pop) warnings.push({ id: 'beds', text: `${pop - beds} GRANDMA${pop - beds > 1 ? 'S' : ''} REQUIRE${pop - beds > 1 ? '' : 'S'} BEDS`, level: 1 });
  if (eggCap > 0 && eggsStored >= eggCap) warnings.push({ id: 'eggsfull', text: 'EGG STORAGE FULL', level: 1 });
  if (eggsStored > 0 && freeIncubators > 0 && s.day >= 2) warnings.push({ id: 'eggready', text: 'GRANDMA EGG READY', level: 0 });
  return {
    day: s.day, phase: s.phase, dayTime: s.dayTime, dayLength: BALANCE.dayLength, clockRunning: s.clockRunning,
    pop, adults, hatchlings, workers, idleAdults, starving, hungry,
    food: Math.floor(s.resources.food), wood: Math.floor(s.resources.wood), stone: Math.floor(s.resources.stone),
    foodRate, foodDemand,
    woodRate: Math.round(s.stats.prod.wood * BALANCE.dayLength),
    stoneRate: Math.round(s.stats.prod.stone * BALANCE.dayLength),
    beds, eggCap, eggsStored, eggsWaiting, incubating, freeIncubators, openSlots,
    warnings,
  };
}
