import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../../src/core/Simulation.js';
import { BALANCE } from '../../src/data/balance.js';
import { newSim, building, stepFor } from './helpers.js';

test('new game: day 1, one adult Grandma, starting buildings and nodes', () => {
  const sim = newSim(123);
  const s = sim.state;
  assert.equal(s.day, 1);
  assert.equal(s.phase, 'day');
  assert.equal(s.clockRunning, false, 'day 1 is untimed');
  assert.equal(s.grandmas.length, 1);
  assert.equal(s.grandmas[0].adult, true);
  for (const t of ['cottage', 'kitchen', 'basket', 'granulator']) {
    const b = building(sim, t);
    assert.ok(b, `${t} exists`);
    assert.equal(b.built, true, `${t} is built`);
  }
  assert.equal(building(sim, 'granulator').inc.stage, 'empty');
  for (const t of ['bush', 'tree', 'rock']) {
    assert.ok(s.nodes.filter((n) => n.type === t).length > 0, `${t} nodes exist`);
  }
  for (const n of s.nodes) {
    assert.ok(Math.abs(n.x) <= BALANCE.worldHalf && Math.abs(n.z) <= BALANCE.worldHalf);
    assert.equal(n.charges, BALANCE.nodes[n.type].charges);
  }
  assert.deepEqual(s.resources, BALANCE.start);
  assert.equal(s.eggs.length, 0);
  assert.equal(s.tutorial.step, 0);
});

test('new game state is plain JSON-serialisable (lossless round trip)', () => {
  const sim = newSim(5);
  const json = sim.toJSON();
  assert.equal(typeof json, 'string');
  assert.deepEqual(JSON.parse(json), sim.state);
  // After some play the state must still be lossless (no functions / NaN / Infinity).
  stepFor(sim, 5);
  assert.deepEqual(JSON.parse(sim.toJSON()), sim.state);
});

test('newGame produces fresh, independent state each time', () => {
  const a = Simulation.newGame(77);
  a.debug('food', 99);
  a.debug('wood', 20);
  a.state.grandmas[0].hunger = 1.1;
  a.debug('egg', 3);
  a.debug('day');
  stepFor(a, 2);

  const b = Simulation.newGame(77);
  assert.equal(b.state.day, 1);
  assert.deepEqual(b.state.resources, { food: 0, wood: 0, stone: 0 });
  assert.equal(b.state.eggs.length, 0);
  assert.equal(b.state.grandmas.length, 1);
  assert.equal(b.state.grandmas[0].hunger, 0.75);
  assert.deepEqual(BALANCE.start, { food: 0, wood: 0, stone: 0 }, 'balance defaults not mutated');
  assert.notEqual(a.state, b.state);
  assert.notEqual(a.state.resources, b.state.resources);
  assert.deepEqual(b.drainEvents(), []);

  // Same seed -> identical fresh world; different seed -> different layout.
  assert.equal(Simulation.newGame(77).toJSON(), b.toJSON());
  assert.notDeepEqual(Simulation.newGame(78).state.nodes, b.state.nodes);
});
