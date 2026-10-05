// Shared helpers for the headless simulation tests. Not a test file itself
// (node --test only picks up *.test.js here).
import { Simulation } from '../../src/core/Simulation.js';
import { BALANCE } from '../../src/data/balance.js';
import { findPlacement } from '../../src/core/world/Placement.js';
import { placeBuilding } from '../../src/core/systems/BuildingSystem.js';

export const DT = 0.05;

export function newSim(seed = 1) {
  return Simulation.newGame(seed);
}

// Step for `seconds` of sim time, returning every event emitted.
export function stepFor(sim, seconds, dt = DT) {
  const events = [];
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    sim.step(dt);
    for (const e of sim.drainEvents()) events.push(e);
  }
  return events;
}

// Step until pred(sim, eventsSoFar) is true or maxSeconds elapse.
export function stepUntil(sim, pred, maxSeconds, dt = DT) {
  const events = [];
  const n = Math.round(maxSeconds / dt);
  for (let i = 0; i < n; i++) {
    sim.step(dt);
    for (const e of sim.drainEvents()) events.push(e);
    if (pred(sim, events)) return { ok: true, t: (i + 1) * dt, events };
  }
  return { ok: false, t: maxSeconds, events };
}

export function teleport(sim, x, z) {
  const p = sim.state.player;
  p.x = x; p.z = z; p.vx = 0; p.vz = 0;
  sim.setInput(0, 0);
}

export function building(sim, type) {
  return sim.state.buildings.find((b) => b.type === type);
}

// Stand just outside a building's footprint on its +z side.
export function standAt(sim, b, gap = 0.9) {
  teleport(sim, b.x, b.z + b.d / 2 + gap);
}

// Nearest resource node of a type to (x,z).
export function nearestNode(sim, type, x = 0, z = 0) {
  let best = null, bd = Infinity;
  for (const n of sim.state.nodes) {
    if (n.type !== type) continue;
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

// Put the player right next to a node, on the side facing the origin.
export function standNextToNode(sim, n) {
  const r = BALANCE.nodes[n.type].radius * n.s;
  const d = Math.hypot(n.x, n.z) || 1;
  const off = r + 0.7;
  teleport(sim, n.x - (n.x / d) * off, n.z - (n.z / d) * off);
}

// Place a building for free (optionally already built) somewhere valid near (x,z).
export function putBuilding(sim, type, x, z, { instant = true, rot = 0 } = {}) {
  const p = findPlacement(sim.state, type, x, z, rot, 30, { ignoreCost: true });
  if (!p) throw new Error(`no room for ${type} near ${x},${z}`);
  const r = placeBuilding(sim, type, p.cx, p.cz, rot, { free: true, instant });
  if (!r.ok) throw new Error(`placeBuilding ${type} failed: ${r.reason}`);
  return sim.getBuilding(r.id);
}

export function finite(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
