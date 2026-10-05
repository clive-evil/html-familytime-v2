import { BALANCE } from '../../data/balance.js';
import { BUILDINGS } from '../../data/buildings.js';
import { localToWorld } from '../entities/Building.js';
import { rand } from '../rng.js';

// ---- hunger --------------------------------------------------------------

export function hungerRate() {
  return BALANCE.grandma.mealsPerDay / BALANCE.dayLength;
}

export function updateHunger(sim, dt) {
  const s = sim.state;
  if (s.phase !== 'day') return;
  const r = hungerRate() * dt;
  for (const g of s.grandmas) {
    if (g.state === 'emerge') continue;
    g.hunger = Math.min(1.2, g.hunger + r);
  }
}

// ---- tables & queues -----------------------------------------------------

export function eatingTables(state) {
  return state.buildings.filter((b) => b.built && BUILDINGS[b.type].eatSlots);
}

export function joinQueue(sim, g) {
  const tables = eatingTables(sim.state);
  if (!tables.length) return null;
  let best = null, bestCost = Infinity;
  for (const b of tables) {
    const slots = BUILDINGS[b.type].eatSlots;
    const wait = (b.queue.length / slots) * BALANCE.grandma.eatTime;
    const walk = Math.hypot(b.x - g.x, b.z - g.z) / BALANCE.grandma.walk;
    const cost = wait + walk;
    if (cost < bestCost) { bestCost = cost; best = b; }
  }
  best.queue.push(g.id);
  g.table = best.id;
  return best;
}

export function leaveQueue(sim, g) {
  if (!g.table) return;
  const b = sim.getBuilding(g.table);
  if (b) {
    const i = b.queue.indexOf(g.id);
    if (i >= 0) b.queue.splice(i, 1);
  }
  g.table = 0;
}

// World position for queue index `idx` at table `b`.
export function queueSpot(b, idx) {
  const def = BUILDINGS[b.type];
  if (idx < def.eatSlots) {
    const sp = def.eatSpots[idx];
    return localToWorld(b, sp[0], sp[1]);
  }
  const k = idx - def.eatSlots;
  const row = Math.floor(k / 5);
  const col = (k % 5) - 2;
  const [, d] = def.size;
  return localToWorld(b, col * 0.85 + (row % 2) * 0.3, d / 2 + 2.2 + row * 0.85);
}

// ---- beds (night) ----------------------------------------------------------

// Assigns every Grandma a bed spot if capacity allows. Returns the number
// left without a bed. Unbedded Grandmas get a patch of lawn near the cottage.
export function assignBeds(sim) {
  const s = sim.state;
  const spots = [];
  for (const b of s.buildings) {
    const def = BUILDINGS[b.type];
    if (!b.built || !def.beds) continue;
    for (let i = 0; i < def.beds; i++) {
      const sp = def.bedSpots[0];
      const [x, z] = localToWorld(b, sp[0], sp[1]);
      spots.push({ b: b.id, x, z, inside: !!def.sleepInside });
    }
  }
  // Older Grandmas (lower ids) claim beds first; it's only fair.
  let homeless = 0;
  for (let i = 0; i < s.grandmas.length; i++) {
    const g = s.grandmas[i];
    const sp = spots[i];
    if (sp) {
      g.bed = sp.b;
      g.bedX = sp.x; g.bedZ = sp.z; g.bedInside = sp.inside;
    } else {
      g.bed = 0;
      const a = rand(s) * Math.PI * 2;
      const r = 6 + rand(s) * 7;
      g.bedX = Math.cos(a) * r; g.bedZ = 3 + Math.sin(a) * r * 0.7; g.bedInside = false;
      homeless++;
    }
  }
  return homeless;
}
