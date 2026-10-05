import { BALANCE } from '../../data/balance.js';
import { BUILDINGS } from '../../data/buildings.js';
import { rand } from '../rng.js';
import { createEgg } from '../entities/Egg.js';
import { localToWorld } from '../entities/Building.js';
import { eggCapacity } from './BuildingSystem.js';
import { spawnGrandma } from './PopulationSystem.js';

// ---- storage -------------------------------------------------------------

export function containerCount(state, buildingId) {
  let n = 0;
  for (const e of state.eggs) if (e.loc === 'store' && e.container === buildingId) n++;
  return n;
}

export function storedEggs(state) {
  let n = 0;
  for (const e of state.eggs) if (e.loc === 'store') n++;
  return n;
}

export function waitingEggs(state) {
  // Every egg not already in an incubator.
  let n = 0;
  for (const e of state.eggs) if (e.loc !== 'incubator') n++;
  return n;
}

export function freeEggSpace(state) {
  return eggCapacity(state) - storedEggs(state);
}

// Put an egg into the first basket/crate with room. Returns false if all full.
export function storeEgg(sim, egg) {
  const s = sim.state;
  for (const b of s.buildings) {
    const cap = BUILDINGS[b.type].eggCap;
    if (!cap || !b.built) continue;
    if (containerCount(s, b.id) < cap) {
      egg.loc = 'store';
      egg.container = b.id;
      egg.slot = -1;
      return true;
    }
  }
  return false;
}

export function newEgg(sim) {
  const e = createEgg(sim.state, 'store', 0);
  if (!storeEgg(sim, e)) return null;
  sim.state.eggs.push(e);
  sim.indexDirty = true;
  sim.state.stats.totalEggs++;
  return e;
}

export function removeEgg(sim, egg) {
  const i = sim.state.eggs.indexOf(egg);
  if (i >= 0) sim.state.eggs.splice(i, 1);
  sim.indexDirty = true;
}

// ---- laying (dawn) --------------------------------------------------------

// Expected eggs = sum over adult Grandmas of layBase, reduced if she went
// hungry or slept outside. Fractional remainder resolves with the RNG.
export function layEggs(sim) {
  const s = sim.state;
  const E = BALANCE.eggs;
  let expected = 0;
  for (const g of s.grandmas) {
    if (!g.adult) continue;
    let c = E.layBase;
    if (g.hungryToday) c *= E.starvingMult;
    if (!g.bed) c *= E.homelessMult;
    expected += c;
  }
  let n = Math.floor(expected + rand(s));
  // Scripted opening: the first two nights always deliver.
  if (s.day === 1) n = 1;
  if (s.day === 2) n = Math.max(n, 2);
  let laid = 0, lost = 0;
  for (let i = 0; i < n; i++) {
    if (newEgg(sim)) laid++;
    else lost++;
  }
  s.stats.today.eggsLaid = laid;
  s.stats.today.eggsLost = lost;
  if (laid > 0) sim.emit('eggsLaid', { n: laid, lost });
  return { laid, lost };
}

// ---- incubators --------------------------------------------------------------

export function hatchPoint(b) {
  const def = BUILDINGS[b.type];
  return localToWorld(b, 0, def.size[1] / 2 + 0.9);
}

export function incubatorFree(b) {
  if (!b.built || !b.inc) return 0;
  if (b.inc.slots) {
    let n = 0;
    for (const e of b.inc.slots) if (!e) n++;
    return n;
  }
  return b.inc.stage === 'empty' ? 1 : 0;
}

// Insert an egg into an incubator. Returns true if accepted.
export function insertEgg(sim, b, egg) {
  if (!b.built || !b.inc) return false;
  const inc = b.inc;
  if (inc.slots) {
    const i = inc.slots.indexOf(0);
    if (i < 0) return false;
    inc.slots[i] = egg.id;
    inc.t[i] = 0;
    egg.loc = 'incubator'; egg.container = b.id; egg.slot = i;
  } else {
    if (inc.stage !== 'empty') return false;
    inc.stage = 'loaded';
    inc.egg = egg.id;
    inc.dial = 0;
    egg.loc = 'incubator'; egg.container = b.id; egg.slot = 0;
  }
  sim.emit('eggInserted', { id: b.id, egg: egg.id });
  return true;
}

// Manual Gran-ulator ritual: loaded -> (close) -> closed -> (turn dial) -> heating -> cracking -> hatch
export function manualStep(sim, b, hold, dt, press) {
  const inc = b.inc;
  const I = BALANCE.incubator;
  if (inc.stage === 'loaded' && press) {
    inc.stage = 'closed';
    sim.emit('lidClosed', { id: b.id });
    return true;
  }
  if (inc.stage === 'closed' && hold) {
    const before = inc.dial;
    inc.dial = Math.min(1, inc.dial + dt / I.manualDialTime);
    for (const mark of [0.34, 0.67]) if (before < mark && inc.dial >= mark) sim.emit('dialClick', { id: b.id, v: mark });
    if (inc.dial >= 1) {
      inc.stage = 'heating';
      inc.t = 0;
      sim.emit('dialClick', { id: b.id, v: 1 });
      sim.emit('heating', { id: b.id });
    }
    return true;
  }
  return false;
}

export function updateIncubators(sim, dt) {
  const s = sim.state;
  const I = BALANCE.incubator;
  for (const b of s.buildings) {
    if (!b.inc || !b.built) continue;
    const inc = b.inc;
    if (inc.slots) {
      const time = BUILDINGS[b.type].incubator.time;
      for (let i = 0; i < inc.slots.length; i++) {
        if (!inc.slots[i]) continue;
        const before = inc.t[i];
        inc.t[i] += dt;
        if (before < time * 0.75 && inc.t[i] >= time * 0.75) sim.emit('wobble', { id: b.id, slot: i });
        if (inc.t[i] >= time) {
          const egg = sim.getEgg(inc.slots[i]);
          inc.slots[i] = 0;
          inc.t[i] = 0;
          hatch(sim, b, egg, i);
        }
      }
    } else if (inc.stage === 'heating') {
      inc.t += dt;
      if (inc.t >= I.heatTime) { inc.stage = 'cracking'; inc.t = 0; sim.emit('cracking', { id: b.id }); }
    } else if (inc.stage === 'cracking') {
      inc.t += dt;
      if (inc.t >= I.crackTime) {
        const egg = sim.getEgg(inc.egg);
        inc.stage = 'empty';
        inc.egg = 0;
        inc.dial = 0;
        inc.t = 0;
        hatch(sim, b, egg, 0);
      }
    }
  }
}

function hatch(sim, b, egg, slot) {
  const s = sim.state;
  if (egg) removeEgg(sim, egg);
  const [hx, hz] = hatchPoint(b);
  const off = b.inc.slots ? (slot - (b.inc.slots.length - 1) / 2) * 0.7 : 0;
  const g = spawnGrandma(sim, hx + off * 0.3, hz, {});
  g.state = 'emerge';
  g.timer = BALANCE.grandma.emergeTime;
  g.anim = 'emerge';
  g.spawnT = 0;
  g.rot = (b.rot * Math.PI) / 2; // face out of the machine (forward = sin/cos of rot)
  g.hunger = 0.1;
  g.hatchedFrom = b.id;
  b.inc.hatched++;
  s.stats.today.hatched++;
  s.stats.totalHatched++;
  const first = !s.flags.firstHatch;
  s.flags.firstHatch = true;
  sim.emit('hatched', { id: g.id, building: b.id, rare: g.rare, first, x: g.x, z: g.z });
  return g;
}
