import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../../src/core/Simulation.js';
import { AutoPlayer, runHeadless } from '../../src/core/bot/AutoPlayer.js';
import { assignWorker } from '../../src/core/systems/JobSystem.js';
import { insertEgg } from '../../src/core/systems/EggSystem.js';
import { spawnGrandma } from '../../src/core/systems/PopulationSystem.js';
import { newSim, stepFor, putBuilding, building, finite } from './helpers.js';

function midGame() {
  const sim = newSim(11);
  sim.debug('skipTutorial');
  sim.debug('unlock');
  sim.debug('food', 40);
  sim.debug('wood', 30);
  const farm = putBuilding(sim, 'farm', -10, 5);
  putBuilding(sim, 'bed', 4, 3);
  putBuilding(sim, 'lumber', 14, -6, { instant: false });
  assignWorker(sim, farm);
  sim.debug('egg', 3);
  insertEgg(sim, building(sim, 'granulator'), sim.state.eggs[0]);
  spawnGrandma(sim, 3, 3);
  stepFor(sim, 20);
  return sim;
}

test('toJSON -> fromJSON round trip preserves the game', () => {
  const sim = midGame();
  const s = sim.state;
  const json = sim.toJSON();
  const loaded = Simulation.fromJSON(json);
  const l = loaded.state;
  assert.equal(l.day, s.day);
  assert.equal(l.phase, s.phase);
  assert.deepEqual(l.resources, s.resources);
  assert.equal(l.grandmas.length, s.grandmas.length);
  assert.deepEqual(l.grandmas.map((g) => [g.id, g.job, g.wp, g.adult]), s.grandmas.map((g) => [g.id, g.job, g.wp, g.adult]));
  assert.deepEqual(l.eggs, s.eggs);
  assert.deepEqual(l.buildings, s.buildings);
  assert.deepEqual(l.tutorial, s.tutorial);
  assert.deepEqual(l.flags, s.flags);
  assert.equal(l.maxPop, s.maxPop);
  assert.equal(l.rng, s.rng);
  assert.deepEqual(l, s, 'whole state identical');
  assert.equal(loaded.toJSON(), json);
  // Lookups work on a loaded sim.
  assert.equal(loaded.getGrandma(s.grandmas[0].id).id, s.grandmas[0].id);
  assert.equal(loaded.status().pop, sim.status().pop);
  // fromJSON also takes a parsed object.
  assert.equal(Simulation.fromJSON(JSON.parse(json)).state.day, s.day);
});

test('a loaded game keeps running (through a night) without errors', () => {
  const sim = midGame();
  const loaded = Simulation.fromJSON(sim.toJSON());
  const day = loaded.state.day;
  stepFor(loaded, 10);
  loaded.sleep();
  stepFor(loaded, 10);
  assert.equal(loaded.state.day, day + 1);
  for (const g of loaded.state.grandmas) assert.ok(finite(g.x) && finite(g.z));
  // The egg in the Gran-ulator survived the trip.
  assert.ok(building(loaded, 'granulator').inc.egg > 0);
});

test('save is versioned; incompatible saves are rejected', () => {
  const sim = newSim(1);
  const bad = JSON.parse(sim.toJSON());
  bad.version = 999;
  assert.throws(() => Simulation.fromJSON(bad), /Incompatible/);
  assert.throws(() => Simulation.fromJSON('null'), /Incompatible/);
});

test('loaded sim continues identically to the original', () => {
  const sim = midGame();
  const loaded = Simulation.fromJSON(sim.toJSON());
  stepFor(sim, 15);
  stepFor(loaded, 15);
  assert.equal(loaded.toJSON(), sim.toJSON());
});

test('determinism: same seed + same commands -> identical state', () => {
  const run = () => {
    const sim = Simulation.newGame(4242);
    const bot = new AutoPlayer(sim);
    runHeadless(sim, bot, 90, 0.05); // bot plays day 1 and into day 2
    sim.debug('wood', 10);
    sim.setInput(0.3, -1, true);
    stepFor(sim, 3);
    return sim;
  };
  const a = run();
  const b = run();
  assert.ok(a.state.day >= 2, 'bot made progress');
  assert.equal(a.toJSON(), b.toJSON());
  // A different seed diverges.
  const c = Simulation.newGame(4243);
  runHeadless(c, new AutoPlayer(c), 10, 0.05);
  assert.notEqual(c.toJSON(), a.toJSON());
});
