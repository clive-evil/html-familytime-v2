import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../../src/data/balance.js';
import { TUTORIAL } from '../../src/core/systems/ObjectiveSystem.js';
import { depositPoint } from '../../src/core/systems/BuildingSystem.js';
import { interact } from '../../src/core/systems/PlayerSystem.js';
import { newSim, stepFor, teleport, building, nearestNode, standNextToNode, DT } from './helpers.js';

test('setInput + step moves the player', () => {
  const sim = newSim(1);
  const p = sim.state.player;
  teleport(sim, 0, 1.5);
  sim.setInput(1, 0);
  stepFor(sim, 1);
  assert.ok(p.x > 4, `moved right (x=${p.x})`);
  assert.ok(Math.abs(p.z - 1.5) < 0.2);
  const x0 = p.x;
  sim.setInput(0, 0);
  stepFor(sim, 1);
  assert.ok(p.x - x0 < 0.6, 'stops when input released');
  // Sprint is faster than walking.
  teleport(sim, 0, 1.5);
  sim.setInput(0, 1, true);
  stepFor(sim, 0.5);
  const sprintD = p.z - 1.5;
  teleport(sim, 0, 1.5);
  sim.setInput(0, 1, false);
  stepFor(sim, 0.5);
  assert.ok(sprintD > p.z - 1.5, 'sprint covers more ground');
});

test('the cottage blocks player movement', () => {
  const sim = newSim(1);
  const p = sim.state.player;
  const c = building(sim, 'cottage');
  teleport(sim, c.x, c.z + c.d / 2 + 3);
  sim.setInput(0, -1);
  stepFor(sim, 3);
  const face = c.z + c.d / 2; // cottage front wall
  assert.ok(p.z >= face - 0.2, `player stopped at the wall (z=${p.z}, wall=${face})`);
  assert.ok(p.z < face + 1, 'player reached the wall');
});

test('player cannot move at night', () => {
  const sim = newSim(1);
  sim.debug('skipTutorial'); // day 2: sleeping is allowed without building a bed
  assert.ok(sim.sleep());
  const p = sim.state.player;
  const x0 = p.x;
  sim.setInput(1, 0);
  stepFor(sim, 1);
  assert.equal(p.x, x0);
});

test('gathering berries respects cooldown, fills carry, drains the bush', () => {
  const sim = newSim(3);
  const p = sim.state.player;
  const bush = nearestNode(sim, 'bush', -15, 3);
  standNextToNode(sim, bush);
  const it = sim.getInteraction();
  assert.equal(it.kind, 'gather');
  assert.equal(it.res, 'food');
  const node = sim.getNode(it.id);
  const start = node.charges;

  assert.equal(sim.interact(true, true, DT), true);
  assert.equal(p.carry.food, 1);
  assert.equal(sim.interact(false, true, DT), false, 'cooldown blocks immediate second gather');
  assert.equal(p.carry.food, 1);

  // Hold the button on this bush for 3s of sim time (driving the specific node,
  // since the prompt may switch to a neighbouring bush once this one is empty).
  let gathers = 1;
  for (let i = 0; i < 60; i++) {
    sim.step(DT);
    if (interact(sim, { kind: 'gather', id: node.id }, false, true, DT)) gathers++;
  }
  assert.equal(gathers, start);
  assert.equal(p.carry.food, start, 'gathered every charge');
  assert.equal(node.charges, 0);
  const after = sim.getInteraction();
  assert.ok(!after || after.kind !== 'gather' || after.id !== node.id, 'empty bush no longer offers gather');
  assert.equal(interact(sim, { kind: 'gather', id: node.id }, true, true, DT), false, 'empty bush yields nothing');
  // Rate limit: never faster than the cooldown allows.
  assert.ok(start <= Math.ceil(3 / BALANCE.player.gatherCooldown) + 1);

  // Walk to the cottage deposit spot -> auto deposit.
  const [dx, dz] = depositPoint(building(sim, 'cottage'));
  teleport(sim, dx, dz);
  const carried = p.carry.food;
  const ev = stepFor(sim, DT);
  assert.ok(ev.some((e) => e.type === 'playerDeposit'));
  assert.equal(p.carry.food, 0);
  assert.equal(sim.state.resources.food, carried);
  assert.equal(sim.state.flags.deliveredFood, true);
});

test('carry capacity caps gathering', () => {
  const sim = newSim(3);
  const p = sim.state.player;
  p.carry.wood = BALANCE.player.carryCap;
  const tree = nearestNode(sim, 'tree', 16, -16);
  standNextToNode(sim, tree);
  const it = sim.getInteraction();
  assert.notEqual(it.kind, 'gather');
  const charges = tree.charges;
  sim.interact(true, true, DT);
  assert.equal(tree.charges, charges);
});

test('nodes regrow charges over time', () => {
  const sim = newSim(3);
  const bush = nearestNode(sim, 'bush', -15, 3);
  bush.charges = 0;
  stepFor(sim, BALANCE.nodes.bush.regen + 0.2);
  assert.equal(bush.charges, 1);
});

test('tutorial objective advances: berries -> home -> wood', () => {
  const sim = newSim(4);
  const s = sim.state;
  const id = () => TUTORIAL[s.tutorial.step].id;
  assert.equal(id(), 'berries');
  assert.equal(sim.objective().tutorial, true);
  assert.equal(sim.objective().text, TUTORIAL[0].text);

  const bush = nearestNode(sim, 'bush', -15, 3);
  standNextToNode(sim, bush);
  const ev = [];
  for (let i = 0; i < 80 && s.player.carry.food < 4; i++) {
    sim.step(DT);
    ev.push(...sim.drainEvents());
    const it = sim.getInteraction();
    if (it && it.kind === 'gather') sim.interact(false, true, DT);
  }
  assert.ok(s.player.carry.food >= 4);
  sim.step(DT);
  ev.push(...sim.drainEvents());
  assert.equal(id(), 'home');
  assert.ok(ev.some((e) => e.type === 'objective' && e.done === 'berries'));

  const [dx, dz] = depositPoint(building(sim, 'cottage'));
  teleport(sim, dx, dz);
  sim.step(DT);
  assert.equal(id(), 'wood');
  assert.equal(sim.objective().text, TUTORIAL[2].text);

  sim.debug('wood', 6);
  sim.step(DT);
  assert.equal(id(), 'placeBed');
});
