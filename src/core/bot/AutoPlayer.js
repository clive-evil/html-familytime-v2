import { BALANCE } from '../../data/balance.js';
import { BUILDINGS } from '../../data/buildings.js';
import { findPlacement } from '../world/Placement.js';
import { interact, carryTotal } from '../systems/PlayerSystem.js';
import { isUnlocked } from '../systems/PopulationSystem.js';
import { countBuildings, depositPoint, eggCapacity } from '../systems/BuildingSystem.js';
import { canAfford } from '../systems/ResourceSystem.js';
import { incubatorFree, storedEggs } from '../systems/EggSystem.js';
import { jobSlots, idleAdults } from '../systems/JobSystem.js';
import { canSleep } from '../systems/DaySystem.js';

// A deliberately simple "player" used for headless balance runs, smoke tests
// and the in-browser autopilot. It walks the player avatar around and uses
// the exact same interaction code paths as a human.
//
// Hatch policies:
//   greedy   - hatch every egg as soon as possible
//   balanced - hatch only when food and beds can absorb another Grandma
//   never    - never hatch (control group: proves hatching is worth it)
export class AutoPlayer {
  constructor(sim, { policy = 'balanced', manualOnly = false } = {}) {
    this.sim = sim;
    this.policy = policy;
    this.manualOnly = manualOnly;
    this.task = null;
    this.thinkT = 0;
    this.log = [];
  }

  update(dt) {
    const sim = this.sim;
    const s = sim.state;
    if (s.phase !== 'day') { sim.setInput(0, 0); this.task = null; return; }
    if (!this.task) {
      this.thinkT -= dt;
      if (this.thinkT > 0) return;
      this.thinkT = 0.25;
      this.task = this.choose();
      if (!this.task) return;
      this.task.t = 0;
      this.task.pressed = false;
    }
    this.run(this.task, dt);
  }

  // ---- task execution ---------------------------------------------------------

  run(task, dt) {
    const sim = this.sim;
    const p = sim.state.player;
    task.t += dt;
    if (task.t > (task.timeout || 25) || (task.until && task.until())) {
      this.task = null; sim.setInput(0, 0); return;
    }
    const dx = task.x - p.x, dz = task.z - p.z;
    const d = Math.hypot(dx, dz);
    const reach = task.reach ?? 1.6;
    if (d > reach) {
      // Detour sideways if blocked (stuck detection).
      task.best = Math.min(task.best ?? Infinity, d);
      task.stuck = d > task.best - 0.02 ? (task.stuck || 0) + dt : 0;
      if (task.best > d - 0.02) task.best = d;
      let mx = dx / d, mz = dz / d;
      if (task.stuck > 0.5) { const t = mx; mx = -mz; mz = t; if (task.stuck > 1.6) task.stuck = 0; }
      sim.setInput(mx, mz, d > 6);
      return;
    }
    sim.setInput(0, 0);
    if (!task.kind) { this.task = null; return; }
    const it = { kind: task.kind, id: task.id, ground: task.ground };
    const press = !task.pressed;
    task.pressed = true;
    const ok = interact(sim, it, press, true, dt);
    if (task.once && press) { this.task = null; return; }
    if (!ok && !task.hold) this.task = null;
    if (!ok && task.hold && task.kind === 'gather' && sim.state.player.gatherCd <= 0) this.task = null;
  }

  // ---- decisions ------------------------------------------------------------

  choose() {
    const sim = this.sim;
    const s = sim.state;
    const p = s.player;
    const st = sim.status();
    const manual = s.buildings.find((b) => b.type === 'granulator');

    // Carrying anything heavy? Bank it when full or when it's what we need now.
    if (carryTotal(p) >= BALANCE.player.carryCap || (carryTotal(p) > 0 && this.wantBank)) {
      this.wantBank = false;
      const dep = this.nearestDeposit();
      return { x: dep[0], z: dep[1], reach: 1.5, until: () => carryTotal(p) === 0, timeout: 30 };
    }

    // Day 1: sleep as soon as allowed.
    if (s.day === 1 && canSleep(s)) {
      const c = s.buildings.find((b) => b.type === 'cottage');
      return { x: c.x, z: c.z + c.d / 2 + 0.8, kind: 'sleep', id: c.id, hold: true, timeout: 15 };
    }

    // Holding an egg -> into an incubator.
    if (p.egg) {
      const inc = s.buildings.filter((b) => b.inc && b.built && incubatorFree(b) > 0)
        .sort((a, b) => this.dist(a) - this.dist(b))[0];
      if (inc) return this.atBuilding(inc, 'insertEgg', { once: true });
    }
    // Finish the manual ritual.
    if (manual.inc.stage === 'loaded') return this.atBuilding(manual, 'closeLid', { once: true });
    if (manual.inc.stage === 'closed') return this.atBuilding(manual, 'dial', { hold: true, until: () => manual.inc.stage !== 'closed' });

    const hatch = this.shouldHatch(st);
    // Flip auto incubator switches to match policy.
    for (const b of s.buildings) {
      if (b.inc && b.inc.slots && b.built && b.autoOn !== hatch && !this.manualOnly) {
        return this.atBuilding(b, 'toggleAuto', { once: true });
      }
    }
    if (this.manualOnly) for (const b of s.buildings) if (b.inc && b.inc.slots) b.autoOn = false;

    // Hatch by hand when the manual machine is free.
    if (hatch && storedEggs(s) > 0 && manual.inc.stage === 'empty') {
      const store = s.buildings.find((b) => BUILDINGS[b.type].eggCap && s.eggs.some((e) => e.loc === 'store' && e.container === b.id));
      if (store) return this.atBuilding(store, 'takeEgg', { once: true });
    }
    // Feed auto incubators by hand if no builders are doing it.
    const builders = s.grandmas.filter((g) => g.job === 'builder').length;
    if (hatch && !builders && storedEggs(s) > 0 && !this.manualOnly) {
      const auto = s.buildings.find((b) => b.inc && b.inc.slots && b.built && incubatorFree(b) > 0);
      const store = s.buildings.find((b) => BUILDINGS[b.type].eggCap && s.eggs.some((e) => e.loc === 'store' && e.container === b.id));
      if (auto && store) return this.atBuilding(store, 'takeEgg', { once: true });
    }

    // Build unfinished sites ourselves if no builder is on it.
    const site = s.buildings.find((b) => !b.built && !s.grandmas.some((g) => g.site === b.id));
    if (site) return this.atBuilding(site, 'build', { hold: true, until: () => site.built, timeout: 40 });

    // Staff workplaces.
    if (idleAdults(s).length > 0) {
      const wp = this.neediestWorkplace(st);
      if (wp) return this.atBuilding(wp, 'assign', { once: true });
    }

    // Place the next building if affordable.
    const want = this.nextBuilding(st);
    if (want) {
      if (canAfford(s, BUILDINGS[want].cost)) {
        const at = this.anchor(want);
        const pl = findPlacement(s, want, at[0], at[1], 0, 26);
        if (pl) {
          const r = sim.place(want, pl.cx, pl.cz, pl.rot);
          if (r.ok) { this.log.push(`d${s.day} place ${want}`); return null; }
        }
      }
    }

    // Gather.
    let res = 'food';
    if (s.resources.food > st.pop * 3 + 6) {
      const cost = want ? BUILDINGS[want].cost : { wood: 10 };
      res = (cost.stone || 0) - s.resources.stone > (cost.wood || 0) - s.resources.wood ? 'stone' : 'wood';
    }
    if (!s.flags.deliveredFood) res = 'food';
    else if (s.day === 1) res = 'wood';
    const node = this.nearestNode(res);
    if (!node) return { x: p.x + 3, z: p.z, timeout: 2 };
    this.wantBank = carryTotal(p) >= 6;
    return {
      x: node.x, z: node.z, reach: BALANCE.nodes[node.type].radius * node.s + 1.2,
      kind: 'gather', id: node.id, hold: true, timeout: 12,
      until: () => node.charges <= 0 || carryTotal(p) >= BALANCE.player.carryCap,
    };
  }

  shouldHatch(st) {
    if (this.policy === 'never') return false;
    if (this.policy === 'greedy') return true;
    const s = this.sim.state;
    if (st.pop < 4) return true;
    const incoming = st.incubating;
    const foodOk = s.resources.food >= (st.pop + incoming) * 3 || st.foodRate >= st.foodDemand * 1.05;
    const bedsOk = st.beds + this.bedsUnderConstruction() >= st.pop + incoming + 1;
    return foodOk && bedsOk;
  }

  bedsUnderConstruction() {
    let n = 0;
    for (const b of this.sim.state.buildings) if (!b.built) n += BUILDINGS[b.type].beds || 0;
    return n;
  }

  nextBuilding(st) {
    const s = this.sim.state;
    const u = (t) => isUnlocked(s, t);
    const slots = (role) => s.buildings.filter((b) => BUILDINGS[b.type].job?.role === role).reduce((a, b) => a + jobSlots(b), 0);
    const pop = st.pop + st.incubating;
    if (s.day === 1) return countBuildings(s, 'bed') ? null : 'bed';
    if (u('farm') && slots('farmer') < Math.max(1, Math.ceil(pop * 0.28))) return u('bigfarm') ? 'bigfarm' : 'farm';
    if (st.beds + this.bedsUnderConstruction() < pop + 1) return u('barn') && pop > 14 ? 'barn' : u('house') ? 'house' : 'bed';
    const eat = s.buildings.reduce((a, b) => a + (BUILDINGS[b.type].eatSlots || 0), 0);
    if (u('table') && eat < pop / 9) return 'table';
    const lost2 = s.lastSummary ? s.lastSummary.eggsLost : 0;
    if (u('crate') && lost2 > 0 && countBuildings(s, 'crate') < 2 + Math.floor(pop / 15)) return 'crate';
    if (u('double') && !countBuildings(s, 'double') && pop >= 8) return 'double';
    if (u('lumber') && slots('lumber') < Math.ceil(pop * 0.12) + 1) return 'lumber';
    if (u('quarry') && slots('miner') < Math.ceil(pop * 0.1) + 1) return 'quarry';
    if (u('stockpile') && countBuildings(s, 'stockpile') < 1 + Math.floor(pop / 30)) return 'stockpile';
    if (u('builder') && slots('builder') < Math.max(3, Math.ceil(pop / 12))) return 'builder';
    if (u('double') && !countBuildings(s, 'double')) return 'double';
    const lost = s.lastSummary ? s.lastSummary.eggsLost : 0;
    if (u('crate') && (lost > 0 || storedEggs(s) >= eggCapacity(s) - 1) && countBuildings(s, 'crate') < 2 + Math.floor(pop / 15)) return 'crate';
    if (u('bell') && !countBuildings(s, 'bell')) return 'bell';
    if (u('deluxe') && countBuildings(s, 'deluxe') < Math.ceil(pop / 60)) return 'deluxe';
    return null;
  }

  anchor(type) {
    switch (type) {
      case 'farm': case 'bigfarm': return [-14, 9];
      case 'lumber': return [12, -9];
      case 'quarry': return [12, 8];
      case 'bed': return [-8, -10];
      case 'house': case 'barn': return [-12, -16];
      case 'table': return [-3, 7];
      case 'stockpile': return [3, 8];
      case 'builder': return [-14, -4];
      case 'double': case 'deluxe': return [10, -3];
      case 'crate': return [-2, 1];
      case 'bell': return [3, 2];
    }
    return [0, 8];
  }

  neediestWorkplace(st) {
    const s = this.sim.state;
    let best = null, bs = Infinity;
    for (const b of s.buildings) {
      const job = BUILDINGS[b.type].job;
      if (!job || !b.built || b.workers.length >= job.slots) continue;
      let sc = b.workers.length / job.slots;
      if (job.role === 'farmer' && st.foodRate < st.foodDemand * 1.2) sc -= 1;
      if (job.role === 'foreman') sc -= 2;
      if (sc < bs) { bs = sc; best = b; }
    }
    return best;
  }

  // ---- geometry helpers ---------------------------------------------------------

  dist(b) {
    const p = this.sim.state.player;
    return Math.hypot(b.x - p.x, b.z - p.z);
  }

  atBuilding(b, kind, extra = {}) {
    const p = this.sim.state.player;
    // Approach the nearest edge point of the footprint.
    const hx = b.w / 2 + 0.9, hz = b.d / 2 + 0.9;
    let x = Math.max(b.x - hx, Math.min(p.x, b.x + hx));
    let z = Math.max(b.z - hz, Math.min(p.z, b.z + hz));
    if (Math.abs(x - b.x) < hx - 0.01 && Math.abs(z - b.z) < hz - 0.01) z = b.z + hz; // inside: go to front
    return { x, z, reach: 1.0, kind, id: b.id, timeout: 25, ...extra };
  }

  nearestDeposit() {
    const s = this.sim.state;
    const p = s.player;
    let best = null, bd = Infinity;
    for (const b of s.buildings) {
      const def = BUILDINGS[b.type];
      if (!b.built || !def.deposit) continue;
      const pt = depositPoint(b);
      const d = Math.hypot(pt[0] - p.x, pt[1] - p.z);
      if (d < bd) { bd = d; best = pt; }
    }
    return best;
  }

  nearestNode(res) {
    const s = this.sim.state;
    const p = s.player;
    let best = null, bd = Infinity;
    for (const n of s.nodes) {
      if (BALANCE.nodes[n.type].resource !== res || n.charges <= 0) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
}

export function runHeadless(sim, bot, seconds, dt = 0.05, onDawn = null) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    bot.update(dt);
    sim.step(dt);
    const evs = sim.drainEvents();
    if (onDawn) for (const e of evs) if (e.type === 'dawn') onDawn(e.summary, sim);
  }
}
