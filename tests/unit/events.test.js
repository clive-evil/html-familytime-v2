import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSim, stepFor, putBuilding, nearestNode, standNextToNode, DT } from './helpers.js';
import { interact } from '../../src/core/systems/PlayerSystem.js';
import { deposit } from '../../src/core/systems/ResourceSystem.js';

// Regression: emit() used to let a payload's own `type` field overwrite the event name.
test('event names survive payloads with a `type` field', () => {
  const sim = newSim(2);
  deposit(sim, 'food', 3, 'player');
  const bush = nearestNode(sim, 'bush', -15, 3);
  standNextToNode(sim, bush);
  interact(sim, { kind: 'gather', id: bush.id }, true, true, DT);
  putBuilding(sim, 'bed', 4, 2, { instant: true });
  const types = sim.drainEvents().map((e) => e.type);
  for (const t of ['deposit', 'gather', 'placed', 'built']) assert.ok(types.includes(t), `missing '${t}' event (got ${types.join(',')})`);
});

test('events without a type collision are delivered by name', () => {
  const sim = newSim(2);
  putBuilding(sim, 'bed', 4, 2, { instant: true });
  assert.ok(sim.sleep());
  const ev = stepFor(sim, 8);
  assert.ok(ev.some((e) => e.type === 'night'));
  assert.ok(ev.some((e) => e.type === 'dawn' && e.summary && e.summary.day === 1));
  assert.deepEqual(sim.drainEvents(), []);
});
