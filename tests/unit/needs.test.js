import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../../src/data/balance.js';
import { layEggs } from '../../src/core/systems/EggSystem.js';
import { spawnGrandma } from '../../src/core/systems/PopulationSystem.js';
import { bedCapacity } from '../../src/core/systems/BuildingSystem.js';
import { newSim, stepFor, stepUntil, building, putBuilding } from './helpers.js';

const warnIds = (sim) => sim.status().warnings.map((w) => w.id);

test('a hungry Grandma eats a meal when food is available', () => {
  const sim = newSim(1);
  const s = sim.state;
  const g = s.grandmas[0];
  g.hunger = 1;
  s.resources.food = 10;
  const r = stepUntil(sim, (_, ev) => ev.some((e) => e.type === 'eat'), 30);
  assert.ok(r.ok, 'she went to the table and ate');
  assert.equal(s.resources.food, 10 - BALANCE.grandma.mealSize);
  assert.equal(s.stats.today.eaten, BALANCE.grandma.mealSize);
  stepFor(sim, BALANCE.grandma.eatTime + 0.2);
  assert.ok(g.hunger < BALANCE.grandma.hungerSeek, `hunger dropped (${g.hunger})`);
  assert.equal(g.starving, false);
  assert.equal(s.resources.food, 10 - BALANCE.grandma.mealSize, 'only one meal');
});

test('with no food a hungry Grandma starves and the HUD warns', () => {
  const sim = newSim(1);
  const s = sim.state;
  const g = s.grandmas[0];
  g.hunger = 1;
  s.resources.food = 0;
  const r = stepUntil(sim, (_, ev) => ev.some((e) => e.type === 'noFood'), 30);
  assert.ok(r.ok, 'she found the table empty');
  assert.equal(g.starving, true);
  assert.equal(g.hungryToday, true);
  assert.equal(s.stats.today.missedMeals, 1);
  const w = warnIds(sim);
  assert.ok(w.includes('nofood') || w.includes('starving'), `warnings: ${w}`);
  assert.equal(sim.status().starving, 1);
  assert.equal(sim.workMult(g), BALANCE.grandma.starvingWorkMult);
  // Once food arrives she eats on her retry and recovers.
  s.resources.food = 10;
  const r2 = stepUntil(sim, (_, ev) => ev.some((e) => e.type === 'eat'), BALANCE.grandma.hungryWait + BALANCE.grandma.eatRetry + 15);
  assert.ok(r2.ok, 'ate after food was restocked');
  stepFor(sim, BALANCE.grandma.eatTime + 0.2);
  assert.equal(g.starving, false);
});

test('hunger rises over the day', () => {
  const sim = newSim(1);
  const g = sim.state.grandmas[0];
  g.hunger = 0;
  stepFor(sim, 10);
  const expected = (BALANCE.grandma.mealsPerDay / BALANCE.dayLength) * 10;
  assert.ok(Math.abs(g.hunger - expected) < 1e-6, `${g.hunger} vs ${expected}`);
});

test('too few beds: some sleep outside, get stiff, HUD warns', () => {
  const sim = newSim(2);
  sim.debug('skipTutorial');
  sim.debug('food', 200);
  sim.debug('spawn', 3);
  const s = sim.state;
  assert.equal(s.grandmas.length, 4);
  assert.equal(bedCapacity(s), 1);
  assert.ok(warnIds(sim).includes('beds'));

  sim.sleep();
  const unbedded = s.grandmas.filter((g) => !g.bed);
  assert.equal(unbedded.length, 3);
  assert.equal(s.grandmas[0].bed, building(sim, 'cottage').id, 'oldest Grandma gets the cottage bed');
  const ev = stepFor(sim, BALANCE.nightLength + 0.2);
  const dawn = ev.find((e) => e.type === 'dawn');
  assert.ok(dawn);
  assert.equal(dawn.summary.sleptOutside, 3);
  assert.equal(dawn.summary.beds, 1);
  for (const g of s.grandmas) {
    assert.equal(g.stiff, !g.bed);
    assert.equal(sim.workMult(g), g.bed ? 1 : BALANCE.grandma.stiffWorkMult);
  }
  assert.ok(sim.workMult(unbedded[0]) < 1);
});

test('stiffness clears after a night in a bed', () => {
  const sim = newSim(2);
  sim.debug('skipTutorial');
  sim.debug('spawn', 1);
  sim.debug('day');
  const g = sim.state.grandmas[1];
  assert.equal(g.stiff, true);
  sim.debug('unlock');
  putBuilding(sim, 'bed', 4, 3);
  sim.debug('day');
  assert.equal(g.stiff, false);
});

test('unbedded and starving adults lay fewer eggs on average (layEggs math)', () => {
  const sim = newSim(3);
  const s = sim.state;
  for (let i = 0; i < 5; i++) spawnGrandma(sim, i, 4, { adult: true });
  s.day = 10; // past the scripted opening nights
  const N = s.grandmas.length;
  const E = BALANCE.eggs;
  const avg = (setup, trials = 600) => {
    let total = 0;
    for (let i = 0; i < trials; i++) {
      s.eggs.length = 0;
      sim.indexDirty = true;
      for (const g of s.grandmas) setup(g);
      const { laid, lost } = layEggs(sim);
      total += laid + lost;
    }
    return total / trials;
  };
  const bedded = avg((g) => { g.bed = 1; g.hungryToday = false; });
  const homeless = avg((g) => { g.bed = 0; g.hungryToday = false; });
  const hungry = avg((g) => { g.bed = 1; g.hungryToday = true; });
  assert.ok(Math.abs(bedded - N * E.layBase) < 0.15, `bedded avg ${bedded}`);
  assert.ok(Math.abs(homeless - N * E.layBase * E.homelessMult) < 0.15, `homeless avg ${homeless}`);
  assert.ok(Math.abs(hungry - N * E.layBase * E.starvingMult) < 0.15, `hungry avg ${hungry}`);
  assert.ok(homeless < bedded);
  // Hatchlings never lay.
  for (const g of s.grandmas) g.adult = false;
  assert.equal(avg((g) => { g.bed = 1; }, 50), 0);
});
