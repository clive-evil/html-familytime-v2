import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignWorker, unassignWorker } from '../../src/core/systems/JobSystem.js';
import { spawnGrandma } from '../../src/core/systems/PopulationSystem.js';
import { interact } from '../../src/core/systems/PlayerSystem.js';
import { newSim, stepFor, putBuilding, standAt, DT } from './helpers.js';

function farmGame(seed = 1) {
  const sim = newSim(seed);
  sim.debug('skipTutorial');
  sim.debug('unlock');
  const farm = putBuilding(sim, 'farm', -10, 5, { instant: true });
  return { sim, farm };
}

test('assignWorker puts an idle adult on a built farm', () => {
  const { sim, farm } = farmGame();
  const g = sim.state.grandmas[0];
  const r = assignWorker(sim, farm);
  assert.equal(r.ok, true);
  assert.equal(r.id, g.id);
  assert.equal(g.job, 'farmer');
  assert.equal(g.wp, farm.id);
  assert.deepEqual(farm.workers, [g.id]);
  assert.equal(sim.status().workers, 1);
  assert.equal(sim.status().idleAdults, 0);
  // Nobody left to assign.
  assert.equal(assignWorker(sim, farm).ok, false);
  // Unassign frees her.
  assert.equal(unassignWorker(sim, farm).ok, true);
  assert.equal(g.job, '');
  assert.deepEqual(farm.workers, []);
});

test('unbuilt workplaces and full workplaces refuse workers', () => {
  const sim = newSim(1);
  sim.debug('skipTutorial');
  sim.debug('unlock');
  const site = putBuilding(sim, 'farm', -10, 5, { instant: false });
  assert.equal(assignWorker(sim, site).ok, false);
  const farm = putBuilding(sim, 'farm', 10, 8, { instant: true });
  sim.debug('spawn', 3);
  assert.equal(assignWorker(sim, farm).ok, true);
  assert.equal(assignWorker(sim, farm).ok, true);
  const r = assignWorker(sim, farm);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'Full');
});

test('hatchlings cannot be assigned to jobs', () => {
  const { sim, farm } = farmGame();
  assignWorker(sim, farm); // the only adult
  const baby = spawnGrandma(sim, 2, 2);
  assert.equal(baby.adult, false);
  const r = assignWorker(sim, farm);
  assert.equal(r.ok, false);
  assert.match(r.reason, /hatchling/i);
  assert.equal(baby.job, '');
});

test('assignWorker with an explicit hatchling refuses her', () => {
  const { sim, farm } = farmGame();
  const baby = spawnGrandma(sim, 2, 2);
  const r = assignWorker(sim, farm, baby);
  assert.equal(r.ok, false);
  assert.equal(baby.job, '');
});

test('the assign interaction works through the player', () => {
  const { sim, farm } = farmGame();
  standAt(sim, farm, 0.8);
  const it = sim.getInteraction();
  assert.equal(it.kind, 'assign');
  assert.equal(interact(sim, it, true, true, DT), true);
  assert.equal(sim.state.grandmas[0].job, 'farmer');
  assert.equal(sim.secondary(), true, 'secondary removes a worker');
  assert.equal(sim.state.grandmas[0].job, '');
});

test('a farmer produces and deposits food over ~60s', () => {
  const { sim, farm } = farmGame(2);
  const s = sim.state;
  s.resources.food = 20;
  const g = s.grandmas[0];
  g.hunger = 0;
  assignWorker(sim, farm);
  const ev = stepFor(sim, 60);
  const produced = s.stats.today.food;
  assert.ok(produced >= 6, `deposited ${produced} food`);
  // Net of whatever she ate, the stockpile grew.
  assert.ok(s.resources.food + s.stats.today.eaten > 20, 'food increased net of eating');
  assert.ok(s.resources.food > 20 - s.stats.today.eaten);
  assert.ok(s.stats.prod.food > 0, 'production rate is tracked');
  assert.ok(ev.length > 0);
  assert.equal(g.job, 'farmer');
});
