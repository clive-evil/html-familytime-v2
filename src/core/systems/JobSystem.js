import { BALANCE } from '../../data/balance.js';
import { BUILDINGS } from '../../data/buildings.js';
import { foodDemandPerDay } from './ResourceSystem.js';

export function jobSlots(b) {
  const j = BUILDINGS[b.type].job;
  return j ? j.slots : 0;
}

export function isWorkplace(b) {
  return !!BUILDINGS[b.type].job;
}

export function idleAdults(state) {
  return state.grandmas.filter((g) => g.adult && !g.job && g.state !== 'emerge');
}

// Assign the nearest idle adult Grandma to workplace b.
export function assignWorker(sim, b, g = null) {
  if (!b.built || !isWorkplace(b)) return { ok: false, reason: 'Not a workplace' };
  if (b.workers.length >= jobSlots(b)) return { ok: false, reason: 'Full' };
  if (!g) {
    let bd = Infinity;
    for (const c of sim.state.grandmas) {
      if (!c.adult || c.job || c.state === 'emerge') continue;
      const d = (c.x - b.x) ** 2 + (c.z - b.z) ** 2;
      if (d < bd) { bd = d; g = c; }
    }
  }
  if (!g) {
    const anyHatchling = sim.state.grandmas.some((c) => !c.adult);
    return { ok: false, reason: anyHatchling ? 'No idle adults (hatchlings work after a night\'s sleep)' : 'No idle Grandmas' };
  }
  if (!g.adult || g.job || g.state === 'emerge') return { ok: false, reason: 'That Grandma is not available' };
  const role = BUILDINGS[b.type].job.role;
  // Pick the first free work spot index.
  const used = new Set(b.workers.map((id) => sim.getGrandma(id)?.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  b.workers.push(g.id);
  g.job = role;
  g.wp = b.id;
  g.slot = slot;
  sim.ai.onAssigned(g);
  sim.emit('assigned', { id: g.id, building: b.id, role });
  return { ok: true, id: g.id };
}

export function unassignWorker(sim, b, g = null) {
  if (!b.workers.length) return { ok: false, reason: 'Nobody works here' };
  if (!g) g = sim.getGrandma(b.workers[b.workers.length - 1]);
  if (!g) { b.workers.pop(); return { ok: false, reason: 'Missing' }; }
  clearJob(sim, g);
  sim.emit('unassigned', { id: g.id, building: b.id });
  return { ok: true, id: g.id };
}

export function clearJob(sim, g) {
  const b = g.wp ? sim.getBuilding(g.wp) : null;
  if (b) {
    const i = b.workers.indexOf(g.id);
    if (i >= 0) b.workers.splice(i, 1);
  }
  g.job = '';
  g.wp = 0;
  g.slot = -1;
  sim.ai.onUnassigned(g);
}

export function workerCount(state, role = null) {
  let n = 0;
  for (const g of state.grandmas) if (g.job && (!role || g.job === role)) n++;
  return n;
}

// Foreman: one Grandma at the bell periodically staffs the emptiest workplace.
// Priority: food when production is behind demand, builders when there are
// sites, otherwise fill the lowest staffed ratio.
export function updateForeman(sim, dt) {
  const s = sim.state;
  if (s.phase !== 'day') return;
  sim.foremanT = (sim.foremanT || 0) + dt;
  if (sim.foremanT < BALANCE.jobs.foreman.interval) return;
  sim.foremanT = 0;
  const bells = s.buildings.filter((b) => b.type === 'bell' && b.built && b.workers.length);
  if (!bells.length) return;
  // Only count foremen actually standing at the bell.
  const active = bells.filter((b) => {
    const f = sim.getGrandma(b.workers[0]);
    return f && f.state === 'work';
  });
  if (!active.length) return;
  const idle = idleAdults(s);
  if (!idle.length) return;
  const wps = s.buildings.filter((b) => b.built && isWorkplace(b) && b.type !== 'bell' && b.workers.length < jobSlots(b));
  if (!wps.length) return;
  const foodBehind = s.stats.prod.food * BALANCE.dayLength < foodDemandPerDay(s) * 1.1 || s.resources.food < s.grandmas.length * 2;
  const sites = s.buildings.some((b) => !b.built);
  const score = (b) => {
    const role = BUILDINGS[b.type].job.role;
    let sc = b.workers.length / jobSlots(b);
    if (role === 'farmer' && foodBehind) sc -= 1;
    if (role === 'builder' && sites) sc -= 0.5;
    return sc;
  };
  // Each active foreman assigns up to 2 per ring.
  let n = Math.min(idle.length, active.length * 2);
  while (n-- > 0) {
    const open = wps.filter((b) => b.workers.length < jobSlots(b));
    if (!open.length) break;
    open.sort((a, b) => score(a) - score(b));
    const r = assignWorker(sim, open[0]);
    if (!r.ok) break;
    sim.emit('foremanRing', { id: active[0].id, grandma: r.id });
  }
}
