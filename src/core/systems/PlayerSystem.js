import { BALANCE } from '../../data/balance.js';
import { BUILDINGS, ROLE_NAMES } from '../../data/buildings.js';
import { addBuildWork, depositPoint } from './BuildingSystem.js';
import { deposit } from './ResourceSystem.js';
import { canSleep, startNight } from './DaySystem.js';
import { insertEgg, incubatorFree, manualStep, storeEgg, containerCount } from './EggSystem.js';
import { assignWorker, unassignWorker, jobSlots } from './JobSystem.js';

const P = BALANCE.player;
const tmp = { x: 0, z: 0, hit: false, nx: 0, nz: 0 };

export function carryTotal(p) {
  return p.carry.food + p.carry.wood + p.carry.stone;
}

export function updatePlayer(sim, dt) {
  const s = sim.state;
  const p = s.player;
  p.gatherCd = Math.max(0, p.gatherCd - dt);
  if (p.actionT > 0) { p.actionT -= dt; if (p.actionT <= 0) p.action = ''; }
  if (s.phase !== 'day') { p.vx = p.vz = 0; return; }

  let mx = p.mx, mz = p.mz;
  const l = Math.hypot(mx, mz);
  if (l > 1) { mx /= l; mz /= l; }
  const speed = p.sprint ? P.sprint : P.walk;
  const tvx = mx * speed, tvz = mz * speed;
  const k = Math.min(1, dt * 14); // snappy acceleration
  p.vx += (tvx - p.vx) * k;
  p.vz += (tvz - p.vz) * k;
  sim.nav.collide(p.x + p.vx * dt, p.z + p.vz * dt, P.radius, tmp);
  p.x = tmp.x; p.z = tmp.z;
  if (l > 0.1) {
    const want = Math.atan2(mx, mz);
    let da = want - p.rot;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    p.rot += da * Math.min(1, dt * 14);
  }

  // Auto-deposit carried resources at any stockpile.
  if (carryTotal(p) > 0) {
    for (const b of s.buildings) {
      if (!b.built || !BUILDINGS[b.type].deposit) continue;
      const [x, z] = depositPoint(b);
      if ((x - p.x) ** 2 + (z - p.z) ** 2 < P.depositRadius ** 2) {
        if (p.carry.food > 0) s.flags.deliveredFood = true;
        for (const r of ['food', 'wood', 'stone']) {
          if (p.carry[r] > 0) { deposit(sim, r, p.carry[r], 'player'); p.carry[r] = 0; }
        }
        sim.emit('playerDeposit', {});
        break;
      }
    }
  }
}

// Distance from point to a building's footprint rectangle.
function rectDist(b, x, z) {
  const dx = Math.max(Math.abs(x - b.x) - b.w / 2, 0);
  const dz = Math.max(Math.abs(z - b.z) - b.d / 2, 0);
  return Math.hypot(dx, dz);
}

// Returns the best contextual interaction for the player right now:
// { kind, id, label, hold, secondary } or null. Used for the prompt AND for
// execution, so what the player reads is what happens.
export function getInteraction(sim) {
  const s = sim.state;
  const p = s.player;
  if (s.phase !== 'day') return null;
  const R = P.interactRange;
  let best = null;
  const offer = (prio, dist, it) => {
    if (!best || prio > best.prio || (prio === best.prio && dist < best.dist)) best = { prio, dist, ...it };
  };
  const egg = p.egg ? sim.getEgg(p.egg) : null;

  for (const b of s.buildings) {
    const d = rectDist(b, p.x, p.z);
    if (d > R) continue;
    const def = BUILDINGS[b.type];
    if (!b.built) {
      offer(70, d, { kind: 'build', id: b.id, hold: true, label: `Build ${def.name} (${Math.round(b.progress * 100)}%)` });
      continue;
    }
    if (b.inc) {
      if (egg) {
        if (incubatorFree(b) > 0) offer(100, d, { kind: 'insertEgg', id: b.id, label: `Put egg in the ${def.name}` });
      } else if (b.inc.slots) {
        const n = b.inc.slots.filter(Boolean).length;
        offer(60, d, { kind: 'toggleAuto', id: b.id, label: `Auto-hatch: ${b.autoOn ? 'ON' : 'OFF'} (${n}/${b.inc.slots.length} warming)` });
      } else {
        const st = b.inc.stage;
        if (st === 'loaded') offer(95, d, { kind: 'closeLid', id: b.id, label: 'Close the lid' });
        else if (st === 'closed') offer(95, d, { kind: 'dial', id: b.id, hold: true, label: `Turn the dial: ${dialLabel(b.inc.dial)}` });
        else if (st === 'heating' || st === 'cracking') offer(40, d, { kind: 'none', id: b.id, label: 'The Gran-ulator is working…' });
      }
    }
    if (def.eggCap) {
      if (egg && containerCount(s, b.id) < def.eggCap) offer(80, d, { kind: 'storeEgg', id: b.id, label: `Put the egg back in the ${def.name}` });
      if (!egg && containerCount(s, b.id) > 0) offer(85, d, { kind: 'takeEgg', id: b.id, label: 'Pick up a Grandma Egg' });
    }
    if (def.job) {
      const n = b.workers.length, m = jobSlots(b);
      offer(65, d, {
        kind: 'assign', id: b.id,
        label: `Assign ${ROLE_NAMES[def.job.role]} (${n}/${m})`,
        secondary: n > 0 ? 'Remove one' : '',
      });
    }
    if (b.type === 'cottage' && canSleep(s)) {
      offer(30, d, { kind: 'sleep', id: b.id, hold: true, label: s.day === 1 ? 'Sleep (end Day 1)' : 'Sleep (end the day early)' });
    }
  }

  // Ground eggs
  if (!egg) {
    for (const e of s.eggs) {
      if (e.loc !== 'ground') continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < R) offer(90, d, { kind: 'takeEgg', id: e.id, ground: true, label: 'Pick up the Grandma Egg' });
    }
  }

  // Resource nodes
  if (!best || best.prio < 50) {
    const full = carryTotal(p) >= P.carryCap;
    for (const n of s.nodes) {
      const r = BALANCE.nodes[n.type].radius * n.s;
      const d = Math.hypot(n.x - p.x, n.z - p.z) - r;
      if (d > R * 0.8) continue;
      const res = BALANCE.nodes[n.type].resource;
      const verb = n.type === 'bush' ? 'Pick berries' : n.type === 'tree' ? 'Chop wood' : 'Dig stone';
      if (full) offer(45, d, { kind: 'none', id: n.id, label: 'Hands full — drop it at the cottage or a stockpile' });
      else if (n.charges <= 0) offer(20, d, { kind: 'none', id: n.id, label: `Nothing left (regrowing)` });
      else offer(50, d, { kind: 'gather', id: n.id, hold: true, res, label: `${verb} (${n.charges})` });
    }
  }

  // Pat a Grandma
  if (!best) {
    const g = sim.nearestGrandma(p.x, p.z, -1, 1.8);
    if (g && !g.inside) offer(10, 0, { kind: 'pat', id: g.id, label: 'Pat Grandma' });
  }
  if (egg && (!best || best.prio < 50)) {
    return { kind: 'none', id: 0, label: 'Carrying an egg — take it to an incubator', secondary: 'Put it down' };
  }
  return best;
}

export function dialLabel(v) {
  if (v < 0.34) return 'WARM';
  if (v < 0.67) return 'TOASTY';
  return 'NANA';
}

// Execute the interaction (press = first frame, hold = every frame held).
export function interact(sim, it, press, hold, dt) {
  if (!it) return false;
  const s = sim.state;
  const p = s.player;
  const b = it.id ? sim.getBuilding(it.id) : null;
  const act = (a) => { p.action = a; p.actionT = 0.35; };
  switch (it.kind) {
    case 'gather': {
      if (p.gatherCd > 0) return false;
      const n = sim.getNode(it.id);
      if (!n || n.charges <= 0 || carryTotal(p) >= P.carryCap) return false;
      n.charges--;
      const res = BALANCE.nodes[n.type].resource;
      p.carry[res]++;
      p.gatherCd = P.gatherCooldown;
      act('gather');
      p.rot = Math.atan2(n.x - p.x, n.z - p.z);
      sim.emit('gather', { node: n.id, res, x: n.x, z: n.z });
      return true;
    }
    case 'build':
      if (!b || b.built) return false;
      addBuildWork(sim, b, P.buildRate * dt, 'player');
      act('build');
      p.rot = Math.atan2(b.x - p.x, b.z - p.z);
      if (s.time - (sim.lastHammer || 0) > 0.3) { sim.lastHammer = s.time; sim.emit('hammer', { id: b.id }); }
      return true;
    case 'insertEgg': {
      if (!press) return false;
      const egg = sim.getEgg(p.egg);
      if (egg && insertEgg(sim, b, egg)) { p.egg = 0; return true; }
      return false;
    }
    case 'closeLid':
    case 'dial':
      if (!b) return false;
      if (it.kind === 'dial') { act('dial'); p.rot = Math.atan2(b.x - p.x, b.z - p.z); }
      return manualStep(sim, b, hold, dt, press);
    case 'toggleAuto':
      if (!press) return false;
      b.autoOn = !b.autoOn;
      sim.emit('toggle', { id: b.id, on: b.autoOn });
      return true;
    case 'takeEgg': {
      if (!press || p.egg) return false;
      let egg = null;
      if (it.ground) egg = sim.getEgg(it.id);
      else egg = s.eggs.find((e) => e.loc === 'store' && e.container === it.id);
      if (!egg) return false;
      egg.loc = 'player'; egg.container = 0;
      p.egg = egg.id;
      sim.emit('eggPickup', { id: egg.id });
      return true;
    }
    case 'storeEgg': {
      if (!press) return false;
      const egg = sim.getEgg(p.egg);
      if (egg && storeEgg(sim, egg)) { p.egg = 0; return true; }
      return false;
    }
    case 'assign': {
      if (!press) return false;
      const r = assignWorker(sim, b);
      if (!r.ok) sim.emit('notice', { text: r.reason });
      return r.ok;
    }
    case 'sleep':
      if (!hold) return false;
      p.sleepHold = (p.sleepHold || 0) + dt;
      if (p.sleepHold > 0.6) { p.sleepHold = 0; return startNight(sim, 'sleep'); }
      return true;
    case 'pat':
      if (!press) return false;
      sim.emit('pat', { id: it.id });
      return true;
  }
  return false;
}

export function secondary(sim, it) {
  const s = sim.state;
  const p = s.player;
  if (it && it.kind === 'assign') {
    const r = unassignWorker(sim, sim.getBuilding(it.id));
    if (!r.ok) sim.emit('notice', { text: r.reason });
    return r.ok;
  }
  if (p.egg) {
    const egg = sim.getEgg(p.egg);
    if (egg) {
      egg.loc = 'ground';
      egg.x = p.x + Math.sin(p.rot) * 0.8;
      egg.z = p.z + Math.cos(p.rot) * 0.8;
      p.egg = 0;
      sim.emit('eggDrop', { id: egg.id });
      return true;
    }
  }
  return false;
}
