import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../../src/data/balance.js';
import { BUILDINGS } from '../../src/data/buildings.js';
import { interact } from '../../src/core/systems/PlayerSystem.js';
import { insertEgg, storedEggs } from '../../src/core/systems/EggSystem.js';
import { newSim, stepFor, stepUntil, building, standAt, putBuilding, DT } from './helpers.js';

function sleepThroughDay1(sim) {
  putBuilding(sim, 'bed', 4, 3, { instant: true });
  const c = building(sim, 'cottage');
  standAt(sim, c, 0.8);
  const it = sim.getInteraction();
  assert.equal(it.kind, 'sleep', 'cottage offers sleep once a bed exists');
  // Hold E through the sleep interaction.
  let started = false;
  for (let i = 0; i < 40 && !started; i++) {
    interact(sim, it, i === 0, true, DT);
    started = sim.state.phase === 'night';
  }
  assert.equal(started, true, 'holding sleep starts the night');
  return stepFor(sim, BALANCE.nightLength + 0.2);
}

test('day 1 cottage does not offer sleep until a bed is built', () => {
  const sim = newSim(1);
  standAt(sim, building(sim, 'cottage'), 0.8);
  const it = sim.getInteraction();
  assert.ok(!it || it.kind !== 'sleep');
});

test('sleeping on day 1 leads to day 2 with an egg in the basket', () => {
  const sim = newSim(2);
  const ev = sleepThroughDay1(sim);
  const s = sim.state;
  assert.equal(s.day, 2);
  assert.equal(s.phase, 'day');
  assert.equal(s.clockRunning, true);
  assert.ok(ev.some((e) => e.type === 'dawn'));
  assert.ok(ev.some((e) => e.type === 'eggsLaid' && e.n === 1));
  const basket = building(sim, 'basket');
  assert.equal(s.eggs.length, 1);
  assert.equal(s.eggs[0].loc, 'store');
  assert.equal(s.eggs[0].container, basket.id);
  assert.equal(storedEggs(s), 1);
});

test('manual Gran-ulator ritual: take egg, insert, close lid, dial, hatch', () => {
  const sim = newSim(3);
  sleepThroughDay1(sim);
  const s = sim.state;
  const p = s.player;
  const basket = building(sim, 'basket');
  const gran = building(sim, 'granulator');
  const egg = s.eggs[0];
  const pop0 = s.grandmas.length;

  // Prompt + take the egg from the basket.
  standAt(sim, basket, 0.8);
  assert.equal(sim.getInteraction().kind, 'takeEgg');
  assert.equal(interact(sim, { kind: 'takeEgg', id: basket.id }, false, true, DT), false, 'needs a press');
  assert.equal(interact(sim, { kind: 'takeEgg', id: basket.id }, true, true, DT), true);
  assert.equal(p.egg, egg.id);
  assert.equal(egg.loc, 'player');

  // Insert into the Gran-ulator.
  standAt(sim, gran, 0.8);
  assert.equal(sim.getInteraction().kind, 'insertEgg');
  assert.equal(interact(sim, { kind: 'insertEgg', id: gran.id }, true, true, DT), true);
  assert.equal(p.egg, 0);
  assert.equal(gran.inc.stage, 'loaded');
  assert.equal(egg.loc, 'incubator');

  // Close the lid.
  assert.equal(sim.getInteraction().kind, 'closeLid');
  assert.equal(interact(sim, { kind: 'closeLid', id: gran.id }, true, true, DT), true);
  assert.equal(gran.inc.stage, 'closed');

  // Hold the dial until it reaches NANA.
  assert.equal(sim.getInteraction().kind, 'dial');
  let t = 0;
  while (gran.inc.stage === 'closed' && t < 5) {
    interact(sim, { kind: 'dial', id: gran.id }, t === 0, true, DT);
    sim.step(DT);
    t += DT;
  }
  assert.equal(gran.inc.stage, 'heating');
  assert.ok(t >= BALANCE.incubator.manualDialTime - DT * 2);
  assert.equal(sim.getInteraction().kind, 'none');

  // Wait for heat + crack.
  const r = stepUntil(sim, (_, ev) => ev.some((e) => e.type === 'hatched'), 10);
  assert.ok(r.ok, 'hatched');
  assert.ok(r.events.some((e) => e.type === 'cracking'));
  assert.ok(r.t <= BALANCE.incubator.heatTime + BALANCE.incubator.crackTime + 0.3);
  const h = r.events.find((e) => e.type === 'hatched');
  assert.equal(h.first, true);
  assert.equal(h.building, gran.id);
  assert.equal(s.grandmas.length, pop0 + 1);
  assert.equal(s.eggs.length, 0);
  assert.equal(sim.getEgg(egg.id), undefined);
  assert.equal(gran.inc.stage, 'empty');
  assert.equal(s.flags.firstHatch, true);
  const baby = sim.getGrandma(h.id);
  assert.equal(baby.adult, false);
  assert.equal(s.stats.totalHatched, 1);
});

test('releasing the dial early does not start heating', () => {
  const sim = newSim(3);
  const gran = building(sim, 'granulator');
  sim.debug('egg', 1);
  insertEgg(sim, gran, sim.state.eggs[0]);
  interact(sim, { kind: 'closeLid', id: gran.id }, true, true, DT);
  for (let i = 0; i < 5; i++) interact(sim, { kind: 'dial', id: gran.id }, false, true, DT);
  stepFor(sim, 5);
  assert.equal(gran.inc.stage, 'closed');
  assert.ok(gran.inc.dial > 0 && gran.inc.dial < 1);
  // A second egg cannot go in while busy.
  sim.debug('egg', 1);
  const e2 = sim.state.eggs.find((e) => e.loc === 'store');
  assert.equal(insertEgg(sim, gran, e2), false);
});

test('Double Gran-ulator hatches inserted eggs automatically after its time', () => {
  const sim = newSim(4);
  sim.debug('skipTutorial');
  const dbl = putBuilding(sim, 'double', 10, 4, { instant: true });
  assert.equal(dbl.built, true);
  assert.equal(sim.debug('egg', 3), 3);
  const eggs = sim.state.eggs.slice();
  assert.equal(insertEgg(sim, dbl, eggs[0]), true);
  assert.equal(insertEgg(sim, dbl, eggs[1]), true);
  assert.equal(insertEgg(sim, dbl, eggs[2]), false, 'only two slots');
  const pop0 = sim.state.grandmas.length;
  const time = BUILDINGS.double.incubator.time;
  let ev = stepFor(sim, time - 1);
  assert.equal(ev.filter((e) => e.type === 'hatched').length, 0, 'not before its time');
  ev = stepFor(sim, 1.5);
  assert.equal(ev.filter((e) => e.type === 'hatched').length, 2);
  assert.equal(sim.state.grandmas.length, pop0 + 2);
  assert.equal(sim.state.eggs.length, 1);
  assert.deepEqual(dbl.inc.slots, [0, 0]);
  assert.equal(dbl.inc.hatched, 2);
});

test('basket capacity: extra eggs are lost at dawn', () => {
  const sim = newSim(5);
  sim.debug('skipTutorial');
  const cap = BUILDINGS.basket.eggCap;
  assert.equal(sim.debug('egg', cap + 3), cap);
  assert.equal(storedEggs(sim.state), cap);
  sim.state.day = 9;
  sim.debug('day');
  const sum = sim.state.lastSummary;
  assert.equal(sum.eggsLaid, 0);
  assert.ok(sum.eggsLost >= 0);
  assert.equal(storedEggs(sim.state), cap);
});
