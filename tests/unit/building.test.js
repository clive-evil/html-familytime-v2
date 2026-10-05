import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../../src/data/balance.js';
import { BUILDINGS } from '../../src/data/buildings.js';
import { checkPlacement, findPlacement } from '../../src/core/world/Placement.js';
import { bedCapacity } from '../../src/core/systems/BuildingSystem.js';
import { canSleep } from '../../src/core/systems/DaySystem.js';
import { newSim, building, teleport, DT } from './helpers.js';

test('checkPlacement rejects overlap, out-of-bounds, nodes and unaffordable sites', () => {
  const sim = newSim(1);
  const s = sim.state;
  const c = building(sim, 'cottage');
  // Overlapping the cottage.
  assert.equal(checkPlacement(s, 'bed', c.cx + 1, c.cz + 1, 0, { ignoreCost: true }).ok, false);
  // Out of bounds on every side.
  const H = BALANCE.worldHalf;
  for (const [x, z] of [[H, 0], [-H - 1, 0], [0, H], [0, -H - 1], [H + 10, H + 10]]) {
    const r = checkPlacement(s, 'bed', x, z, 0, { ignoreCost: true });
    assert.equal(r.ok, false, `out of bounds at ${x},${z}`);
    assert.equal(r.reason, 'Too far out');
  }
  // On top of a resource node.
  const n = s.nodes[0];
  assert.equal(checkPlacement(s, 'bed', Math.floor(n.x), Math.floor(n.z), 0, { ignoreCost: true }).ok, false);
  // Unknown building.
  assert.equal(checkPlacement(s, 'castle', 4, 2, 0).ok, false);
  // Valid spot but cannot afford it.
  const spot = findPlacement(s, 'bed', 4, 2, 0, 20, { ignoreCost: true });
  assert.ok(spot);
  const r = checkPlacement(s, 'bed', spot.cx, spot.cz, 0);
  assert.equal(r.ok, false);
  assert.match(r.reason, /Need 6 wood/);
  assert.equal(sim.place('bed', spot.cx, spot.cz).ok, false, 'place() refuses unaffordable');
  assert.equal(s.buildings.length, 4);
  // Solid buildings may not be placed on the player.
  s.flags.unlockAll = true;
  const hp = findPlacement(s, 'house', 10, 6, 0, 20, { ignoreCost: true });
  teleport(sim, hp.cx + 1, hp.cz + 1);
  assert.equal(checkPlacement(s, 'house', hp.cx, hp.cz, 0, { ignoreCost: true }).reason, 'Standing in the way');
});

test('locked buildings cannot be placed', () => {
  const sim = newSim(1);
  sim.debug('wood', 100);
  sim.debug('stone', 100);
  const p = findPlacement(sim.state, 'barn', 10, 8, 0, 20);
  const r = sim.place('barn', p.cx, p.cz);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'Locked');
  assert.equal(sim.place('cottage', p.cx, p.cz).ok, false, 'start-only buildings are never placeable');
});

test('place() deducts cost, creates an unbuilt site; holding build completes it; bed raises capacity', () => {
  const sim = newSim(1);
  const s = sim.state;
  sim.debug('wood', 10);
  const spot = findPlacement(s, 'bed', 4, 3, 0, 20);
  const r = sim.place('bed', spot.cx, spot.cz);
  assert.equal(r.ok, true);
  assert.equal(s.resources.wood, 10 - BUILDINGS.bed.cost.wood);
  const bed = sim.getBuilding(r.id);
  assert.equal(bed.built, false);
  assert.equal(bed.progress, 0);
  assert.equal(bedCapacity(s), 1, 'unbuilt bed adds no capacity');
  // Occupied now.
  assert.equal(checkPlacement(s, 'bed', spot.cx, spot.cz, 0, { ignoreCost: true }).ok, false);

  teleport(sim, bed.x, bed.z + bed.d / 2 + 0.8);
  const it = sim.getInteraction();
  assert.equal(it.kind, 'build');
  assert.equal(it.id, bed.id);
  assert.equal(it.hold, true);
  const need = BUILDINGS.bed.work / BALANCE.player.buildRate;
  let t = 0;
  while (!bed.built && t < need + 2) {
    sim.interact(t === 0, true, DT);
    sim.step(DT);
    t += DT;
  }
  assert.equal(bed.built, true);
  assert.ok(t >= need - DT * 2, `build took ${t.toFixed(2)}s (expected ~${need.toFixed(2)}s)`);
  assert.equal(bed.progress, 1);
  assert.equal(bedCapacity(s), 2);
  assert.equal(canSleep(s), true, 'day 1: can sleep once a bed exists');
});

test('rotation swaps the footprint', () => {
  const sim = newSim(1);
  sim.state.flags.unlockAll = true;
  sim.debug('wood', 100);
  sim.debug('stone', 100);
  const p = findPlacement(sim.state, 'lumber', 12, 6, 1, 20);
  const r = sim.place('lumber', p.cx, p.cz, 1);
  assert.equal(r.ok, true);
  const b = sim.getBuilding(r.id);
  assert.deepEqual([b.w, b.d], [3, 4]);
});
