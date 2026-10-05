import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../../src/data/balance.js';
import { newSim, finite } from './helpers.js';

const DT = 0.05;
const BOUND = BALANCE.worldHalf + 4;

function checkSane(sim) {
  for (const g of sim.state.grandmas) {
    assert.ok(finite(g.x) && finite(g.z), `Grandma ${g.id} has a NaN position`);
    assert.ok(Math.abs(g.x) <= BOUND && Math.abs(g.z) <= BOUND, `Grandma ${g.id} out of bounds at ${g.x},${g.z}`);
    assert.ok(finite(g.hunger));
  }
  for (const k of ['food', 'wood', 'stone']) assert.ok(finite(sim.state.resources[k]));
}

function run(sim, ticks) {
  const t0 = performance.now();
  for (let i = 0; i < ticks; i++) {
    sim.step(DT);
    sim.drainEvents();
  }
  return (performance.now() - t0) / ticks;
}

for (const n of [100, 300]) {
  test(`stress: ${n} Grandmas for 30s of sim time`, () => {
    const sim = newSim(1);
    const got = sim.setupStress(n);
    assert.ok(got >= n, `setupStress(${n}) made ${got}`);
    assert.ok(sim.status().workers > n * 0.3, 'a good share employed');
    run(sim, 60); // warm up the JIT
    const ms = run(sim, Math.round(30 / DT));
    checkSane(sim);
    assert.ok(ms < 8, `avg ${ms.toFixed(2)} ms/tick`);
    assert.ok(sim.state.grandmas.length >= n);
  });
}

test('stress: heap does not grow between batches (300 Grandmas)', () => {
  const sim = newSim(2);
  sim.setupStress(300);
  const gc = typeof global.gc === 'function' ? global.gc : null;
  run(sim, 600);
  if (gc) gc();
  const h1 = process.memoryUsage().heapUsed;
  run(sim, 600);
  if (gc) gc();
  const h2 = process.memoryUsage().heapUsed;
  checkSane(sim);
  const growMB = (h2 - h1) / 1024 / 1024;
  assert.ok(growMB < 50, `heap grew ${growMB.toFixed(1)} MB`);
  assert.ok(sim.events.length <= 2000, 'event queue is bounded');
});
