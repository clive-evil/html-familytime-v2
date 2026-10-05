import { BUILDINGS, BUILD_ORDER } from '../../data/buildings.js';
import { createGrandma } from '../entities/Grandma.js';

export function spawnGrandma(sim, x, z, opts = {}) {
  const g = createGrandma(sim.state, x, z, opts);
  sim.state.grandmas.push(g);
  sim.indexDirty = true;
  updateUnlocks(sim);
  return g;
}

export function population(state) {
  return state.grandmas.length;
}

export function adults(state) {
  let n = 0;
  for (const g of state.grandmas) if (g.adult) n++;
  return n;
}

// Unlocks are driven by the highest population reached (never re-locks).
export function updateUnlocks(sim) {
  const s = sim.state;
  const pop = s.grandmas.length;
  if (pop <= s.maxPop) return;
  const before = s.maxPop;
  s.maxPop = pop;
  for (const t of BUILD_ORDER) {
    const u = BUILDINGS[t].unlockPop;
    if (u > before && u <= pop) sim.emit('unlock', { type: t, name: BUILDINGS[t].name });
  }
}

export function isUnlocked(state, type) {
  if (state.flags.unlockAll) return true;
  const def = BUILDINGS[type];
  if (def.startOnly) return false;
  if (type === 'bed') return true;
  // The farm is introduced right after the first hatch.
  return state.maxPop >= def.unlockPop;
}

// Hatchlings become adults (and grow) every dawn.
export function ageGrandmas(sim) {
  let grown = 0;
  for (const g of sim.state.grandmas) {
    if (!g.adult) { g.adult = true; grown++; }
  }
  return grown;
}
