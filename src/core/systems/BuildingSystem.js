import { BUILDINGS } from '../../data/buildings.js';
import { createBuilding, localToWorld } from '../entities/Building.js';
import { checkPlacement } from '../world/Placement.js';
import { isUnlocked } from './PopulationSystem.js';
import { spend } from './ResourceSystem.js';

export function placeBuilding(sim, type, cx, cz, rot = 0, { free = false, instant = false } = {}) {
  const s = sim.state;
  if (!free && !isUnlocked(s, type)) return { ok: false, reason: 'Locked' };
  const chk = checkPlacement(s, type, cx, cz, rot, { ignoreCost: free });
  if (!chk.ok) return chk;
  if (!free) spend(s, BUILDINGS[type].cost);
  const b = createBuilding(s, type, cx, cz, rot, instant);
  s.buildings.push(b);
  sim.indexDirty = true;
  sim.navDirty = true;
  sim.emit('placed', { id: b.id, type });
  if (instant) completeBuilding(sim, b);
  return { ok: true, id: b.id };
}

// Adds construction work; returns true when the building completes.
export function addBuildWork(sim, b, amount, by) {
  if (b.built) return false;
  const def = BUILDINGS[b.type];
  b.progress = Math.min(1, b.progress + amount / (def.work || 1));
  if (b.progress >= 1) {
    completeBuilding(sim, b, by);
    return true;
  }
  return false;
}

function completeBuilding(sim, b, by) {
  b.built = true;
  b.progress = 1;
  sim.navDirty = true;
  sim.indexDirty = true;
  if (sim.state.stats) sim.state.stats.built = (sim.state.stats.built || 0) + 1;
  sim.emit('built', { id: b.id, type: b.type, by });
  // Anyone standing inside a newly solid building gets nudged out by movement.
}

export function spotWorld(b, spot) {
  return localToWorld(b, spot[0], spot[1]);
}

export function depositPoint(b) {
  const def = BUILDINGS[b.type];
  return localToWorld(b, def.depositSpot[0], def.depositSpot[1]);
}

// Nearest built deposit point (cottage or stockpile) to x,z.
export function nearestDeposit(state, x, z) {
  let best = null, bd = Infinity;
  for (const b of state.buildings) {
    if (!b.built || !BUILDINGS[b.type].deposit) continue;
    const [px, pz] = depositPoint(b);
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

export function bedCapacity(state) {
  let n = 0;
  for (const b of state.buildings) if (b.built) n += BUILDINGS[b.type].beds || 0;
  return n;
}

export function eggCapacity(state) {
  let n = 0;
  for (const b of state.buildings) if (b.built) n += BUILDINGS[b.type].eggCap || 0;
  return n;
}

export function countBuildings(state, type, builtOnly = false) {
  let n = 0;
  for (const b of state.buildings) if (b.type === type && (!builtOnly || b.built)) n++;
  return n;
}
