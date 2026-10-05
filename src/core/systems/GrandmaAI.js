import { BALANCE } from '../../data/balance.js';
import { BUILDINGS } from '../../data/buildings.js';
import { rand, pick } from '../rng.js';
import { localToWorld } from '../entities/Building.js';
import { addBuildWork, depositPoint, nearestDeposit, spotWorld } from './BuildingSystem.js';
import { deposit } from './ResourceSystem.js';
import { joinQueue, leaveQueue, queueSpot } from './NeedsSystem.js';
import { insertEgg, incubatorFree, storeEgg } from './EggSystem.js';

const G = BALANCE.grandma;
const INTERRUPTIBLE = new Set(['idle', 'toWork', 'work', 'toSite', 'build', 'toFetch']);

// Lightweight per-Grandma state machine. Every Grandma ticks every frame, but
// the work done per tick is tiny (timers + arrival checks). Expensive decisions
// (finding targets) only happen on state transitions or on a staggered
// ~0.8 s "think" cadence.
export class GrandmaAI {
  constructor(sim) {
    this.sim = sim;
  }

  update(dt) {
    const s = this.sim.state;
    const night = s.phase === 'night';
    const gs = s.grandmas;
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i];
      g.spawnT += dt;
      if (night && g.state !== 'emerge') { this.nightTick(g, dt); continue; }
      if (s.time >= g.thinkAt) {
        g.thinkAt = s.time + 0.8 + (g.id % 7) * 0.04;
        this.periodic(g);
      }
      this.tick(g, dt);
    }
  }

  // ---- helpers -----------------------------------------------------------

  go(g, x, z, r = 0.35) {
    g.tx = x; g.tz = z; g.arriveR = r; g.moving = true; g.stuckT = 0; g.bestD = Infinity;
    g.anim = 'walk';
  }

  set(g, state, timer = 0, anim = null) {
    g.state = state;
    g.timer = timer;
    if (anim) g.anim = anim;
  }

  face(g, x, z) {
    g.rot = Math.atan2(x - g.x, z - g.z);
  }

  hungry(g) {
    return g.hunger >= G.hungerSeek && this.sim.state.time >= g.eatRetryAt;
  }

  periodic(g) {
    if (INTERRUPTIBLE.has(g.state) && !g.carryN && this.hungry(g)) this.goEat(g);
  }

  // ---- decisions -----------------------------------------------------------

  decide(g) {
    const s = this.sim.state;
    if (g.carryN > 0 && (g.carryType === 'food' || g.carryType === 'wood' || g.carryType === 'stone')) return this.toDeposit(g);
    if (g.carryType === 'egg') return this.toIncubator(g);
    if (this.hungry(g) && this.sim.hasTables()) return this.goEat(g);
    if (g.job && g.job !== 'foreman' && rand(s) < G.quirkChance) return this.startQuirk(g);
    switch (g.job) {
      case 'farmer': case 'lumber': case 'miner': case 'foreman':
        return this.toWork(g);
      case 'builder':
        return this.builderDecide(g);
      default:
        if (rand(s) < G.quirkChance * 0.6) return this.startQuirk(g);
        return this.wander(g);
    }
  }

  onAssigned(g) {
    if (g.state === 'idle' || g.state === 'quirk' || g.state === 'emerge') {
      if (g.state !== 'emerge') this.decide(g);
    }
  }

  onUnassigned(g) {
    if (g.state === 'toWork' || g.state === 'work' || g.state === 'toSite' || g.state === 'build' || g.state === 'toFetch') {
      if (g.carryType === 'material') { g.carryType = ''; g.carryN = 0; }
      g.site = 0;
      this.decide(g);
    }
  }

  wander(g) {
    const s = this.sim.state;
    let hx = -1, hz = 0, r = 7;
    if (!g.adult) { hx = 2; hz = 1; r = 5; }
    if (g.wp) { const b = this.sim.getBuilding(g.wp); if (b) { hx = b.x; hz = b.z + 2; r = 3; } }
    const a = rand(s) * Math.PI * 2;
    const d = 1.5 + rand(s) * r;
    this.go(g, hx + Math.cos(a) * d, hz + Math.sin(a) * d, 0.6);
    this.set(g, 'idle', 1.5 + rand(s) * 4);
  }

  goEat(g) {
    leaveQueue(this.sim, g);
    const b = joinQueue(this.sim, g);
    if (!b) return this.wander(g);
    this.set(g, 'toEat');
    this.retargetQueue(g, b, true);
  }

  retargetQueue(g, b, force) {
    const idx = b.queue.indexOf(g.id);
    if (idx < 0) return -1;
    if (force || idx !== g.qIdx) {
      g.qIdx = idx;
      const [x, z] = queueSpot(b, idx);
      this.go(g, x, z, idx < BUILDINGS[b.type].eatSlots ? 0.3 : 0.5);
    }
    return idx;
  }

  toWork(g) {
    const b = this.sim.getBuilding(g.wp);
    if (!b) { g.job = ''; g.wp = 0; return this.wander(g); }
    const spots = BUILDINGS[b.type].workSpots;
    const [x, z] = spotWorld(b, spots[g.slot % spots.length]);
    this.go(g, x, z, 0.3);
    this.set(g, 'toWork');
  }

  toDeposit(g) {
    const b = nearestDeposit(this.sim.state, g.x, g.z);
    if (!b) return this.wander(g);
    const [x, z] = depositPoint(b);
    // Spread drop-offs over the pile so they don't all fight for one point.
    const s = this.sim.state;
    this.go(g, x + (rand(s) - 0.5) * 1.6, z + (rand(s) - 0.5) * 1.6, 1.0);
    this.set(g, 'toDeposit');
  }

  startQuirk(g) {
    const s = this.sim.state;
    const q = pick(s, ['tea', 'nap', 'wrong', 'fuss', 'queue', 'tea', 'wrong']);
    g.quirk = q;
    this.sim.emit('quirk', { id: g.id, quirk: q });
    switch (q) {
      case 'tea': this.set(g, 'quirk', 4 + rand(s) * 2, 'tea'); g.moving = false; break;
      case 'nap': this.set(g, 'quirk', 5 + rand(s) * 3, 'nap'); g.moving = false; break;
      case 'wrong': {
        // Sets off confidently in completely the wrong direction.
        const a = rand(s) * Math.PI * 2;
        this.go(g, g.x + Math.cos(a) * 5, g.z + Math.sin(a) * 5, 0.8);
        this.set(g, 'quirk', 4);
        break;
      }
      case 'fuss': {
        const other = this.sim.nearestGrandma(g.x, g.z, g.id, 10);
        if (!other) { this.set(g, 'quirk', 3, 'tea'); g.moving = false; g.quirk = 'tea'; break; }
        g.fussId = other.id;
        this.go(g, other.x + 0.8, other.z + 0.3, 0.9);
        this.set(g, 'quirk', 5);
        break;
      }
      case 'queue': {
        const tables = this.sim.state.buildings.filter((b) => b.built && BUILDINGS[b.type].eatSlots);
        if (!tables.length) { this.set(g, 'quirk', 3, 'tea'); g.quirk = 'tea'; g.moving = false; break; }
        const b = pick(s, tables);
        const [x, z] = queueSpot(b, BUILDINGS[b.type].eatSlots + b.queue.length + 2 + Math.floor(rand(s) * 4));
        this.go(g, x, z, 0.6);
        this.set(g, 'quirk', 9);
        break;
      }
    }
  }

  // ---- builders / haulers ----------------------------------------------------

  builderDecide(g) {
    const s = this.sim.state;
    // 1. Construction sites (spread builders across sites).
    let site = null, best = Infinity;
    for (const b of s.buildings) {
      if (b.built) continue;
      let crew = 0;
      for (const o of s.grandmas) if (o.site === b.id && o !== g) crew++;
      const d = Math.hypot(b.x - g.x, b.z - g.z) + crew * 12;
      if (d < best) { best = d; site = b; }
    }
    if (site) {
      g.site = site.id;
      if (g.carryType !== 'material') {
        const dep = nearestDeposit(s, g.x, g.z);
        if (dep) {
          const [x, z] = depositPoint(dep);
          this.go(g, x, z, 1.2);
          this.set(g, 'toFetch');
          return;
        }
      }
      return this.toSite(g, site);
    }
    // 2. Haul eggs to auto incubators that are switched on.
    const job = this.findEggJob(g);
    if (job) {
      g.eggTarget = job.inc.id;
      g.eggN = job.n;
      const [x, z] = [job.store.x, job.store.z + job.store.d / 2 + 0.6];
      this.go(g, x, z, 1.0);
      this.set(g, 'toEggs');
      g.eggStore = job.store.id;
      return;
    }
    // 3. Nothing to do: loiter by the hut.
    this.wander(g);
  }

  toSite(g, site) {
    const s = this.sim.state;
    const a = rand(s) * Math.PI * 2;
    const r = Math.max(site.w, site.d) / 2 + 0.5;
    this.go(g, site.x + Math.cos(a) * r, site.z + Math.sin(a) * r, 0.8);
    this.set(g, 'toSite');
  }

  findEggJob(g) {
    const s = this.sim.state;
    // Eggs already promised to other haulers.
    let promised = 0;
    const reserved = new Map();
    for (const o of s.grandmas) {
      if (o.state === 'toEggs' || (o.state === 'toIncubator' && o.carryType === 'egg')) {
        if (o.state === 'toEggs') promised += o.eggN;
        reserved.set(o.eggTarget, (reserved.get(o.eggTarget) || 0) + o.eggN);
      }
    }
    let incB = null, free = 0;
    for (const b of s.buildings) {
      if (!b.inc || !b.inc.slots || !b.built || !b.autoOn) continue;
      const f = incubatorFree(b) - (reserved.get(b.id) || 0);
      if (f > free) { free = f; incB = b; }
    }
    if (!incB) return null;
    // Nearest store with eggs.
    let store = null, sd = Infinity, avail = 0;
    const counts = new Map();
    for (const e of s.eggs) if (e.loc === 'store') counts.set(e.container, (counts.get(e.container) || 0) + 1);
    let total = 0;
    for (const v of counts.values()) total += v;
    total -= promised;
    if (total <= 0) return null;
    for (const [id, c] of counts) {
      const b = this.sim.getBuilding(id);
      if (!b) continue;
      const d = Math.hypot(b.x - g.x, b.z - g.z);
      if (d < sd) { sd = d; store = b; avail = c; }
    }
    if (!store) return null;
    const n = Math.max(1, Math.min(BALANCE.eggs.haulerCarry, free, total, avail));
    return { inc: incB, store, n };
  }

  toIncubator(g) {
    const b = this.sim.getBuilding(g.eggTarget);
    if (!b || !b.built) return this.dropEggs(g);
    const [x, z] = localToWorld(b, 0, BUILDINGS[b.type].size[1] / 2 + 0.7);
    this.go(g, x, z, 0.9);
    this.set(g, 'toIncubator');
  }

  dropEggs(g) {
    const s = this.sim.state;
    for (const e of s.eggs) {
      if (e.loc === 'grandma' && e.container === g.id) {
        if (!storeEgg(this.sim, e)) { e.loc = 'ground'; e.container = 0; e.x = g.x + (rand(s) - 0.5); e.z = g.z + (rand(s) - 0.5); }
      }
    }
    g.carryType = ''; g.carryN = 0; g.eggTarget = 0; g.eggN = 0;
    this.decide(g);
  }

  // ---- per-tick state update ---------------------------------------------------

  tick(g, dt) {
    const sim = this.sim;
    const s = sim.state;
    switch (g.state) {
      case 'emerge':
        g.timer -= dt;
        if (g.timer <= 0) {
          // Waddle a few steps out into the world.
          const fx = Math.sin(g.rot), fz = Math.cos(g.rot);
          this.go(g, g.x + fx * 2.5 + (rand(s) - 0.5), g.z + fz * 2.5, 0.6);
          this.set(g, 'idle', 2);
        }
        break;

      case 'idle':
        if (!g.moving) {
          if (g.anim === 'walk') g.anim = 'idle';
          g.timer -= dt;
          if (g.timer <= 0) this.decide(g);
        }
        break;

      case 'toEat': {
        const b = sim.getBuilding(g.table);
        if (!b) { g.table = 0; this.decide(g); break; }
        const idx = this.retargetQueue(g, b, false);
        if (idx < 0) { this.decide(g); break; }
        if (!g.moving) {
          const slots = BUILDINGS[b.type].eatSlots;
          if (idx < slots) {
            this.face(g, b.x, b.z);
            if (s.resources.food >= G.mealSize) {
              s.resources.food -= G.mealSize;
              s.stats.today.eaten += G.mealSize;
              this.set(g, 'eat', G.eatTime, 'eat');
              sim.emit('eat', { id: g.id });
            } else {
              g.starving = true;
              g.hungryToday = true;
              s.stats.today.missedMeals++;
              this.set(g, 'hungryWait', G.hungryWait, 'sad');
              sim.emit('noFood', { id: g.id });
            }
          } else {
            g.anim = 'queue';
          }
        }
        break;
      }

      case 'eat':
        g.timer -= dt;
        if (g.timer <= 0) {
          g.hunger = Math.max(-0.5, g.hunger - 1);
          g.starving = false;
          leaveQueue(sim, g);
          this.decide(g);
        }
        break;

      case 'hungryWait':
        g.timer -= dt;
        if (g.timer <= 0) {
          leaveQueue(sim, g);
          g.eatRetryAt = s.time + G.eatRetry;
          this.decide(g);
        }
        break;

      case 'toWork':
        if (!g.moving) {
          const b = sim.getBuilding(g.wp);
          if (!b) { this.decide(g); break; }
          this.face(g, b.x, b.z);
          if (g.job === 'foreman') { this.set(g, 'work', 1e9, 'foreman'); break; }
          const J = BALANCE.jobs[g.job];
          this.set(g, 'work', J.workTime / sim.workMult(g), 'work');
        }
        break;

      case 'work':
        if (g.job === 'foreman') break;
        g.timer -= dt;
        if (g.timer <= 0) {
          const J = BALANCE.jobs[g.job];
          g.carryType = J.resource;
          g.carryN = J.yield;
          g.bigItem = rand(s) < 0.06;
          if (g.bigItem) g.carryN += 1; // a comically large turnip/log/rock
          sim.emit('produced', { id: g.id, res: J.resource });
          this.toDeposit(g);
        }
        break;

      case 'toDeposit':
        if (!g.moving) {
          if (g.carryN > 0 && g.carryType) deposit(sim, g.carryType, g.carryN, 'grandma');
          g.carryType = ''; g.carryN = 0; g.bigItem = false;
          this.decide(g);
        }
        break;

      case 'toFetch':
        if (!g.moving) {
          g.carryType = 'material'; g.carryN = 1;
          const site = sim.getBuilding(g.site);
          if (!site || site.built) { this.builderDecide(g); break; }
          this.toSite(g, site);
        }
        break;

      case 'toSite':
        if (!g.moving) {
          const site = sim.getBuilding(g.site);
          if (!site || site.built) { g.site = 0; g.carryType = ''; g.carryN = 0; this.decide(g); break; }
          this.face(g, site.x, site.z);
          this.set(g, 'build', 0, 'build');
          g.carryType = ''; g.carryN = 0;
        }
        break;

      case 'build': {
        const site = sim.getBuilding(g.site);
        if (!site || site.built) { g.site = 0; this.decide(g); break; }
        addBuildWork(sim, site, BALANCE.jobs.builder.buildRate * sim.workMult(g) * dt, 'grandma');
        break;
      }

      case 'toEggs':
        if (!g.moving) {
          let n = 0;
          for (const e of s.eggs) {
            if (n >= g.eggN) break;
            if (e.loc === 'store' && e.container === g.eggStore) { e.loc = 'grandma'; e.container = g.id; n++; }
          }
          if (!n) { g.eggTarget = 0; g.eggN = 0; this.decide(g); break; }
          g.carryType = 'egg'; g.carryN = n; g.eggN = n;
          this.toIncubator(g);
        }
        break;

      case 'toIncubator':
        if (!g.moving) {
          const b = sim.getBuilding(g.eggTarget);
          if (b) {
            for (const e of s.eggs) {
              if (e.loc === 'grandma' && e.container === g.id) insertEgg(sim, b, e);
            }
          }
          this.dropEggs(g); // leftovers go back to storage
        }
        break;

      case 'quirk':
        if (g.moving) break;
        if (g.quirk === 'wrong' && g.anim === 'walk') { g.anim = 'confused'; g.timer = Math.min(g.timer, 1.2); }
        else if (g.quirk === 'fuss' && g.anim === 'walk') { g.anim = 'fuss'; const o = sim.getGrandma(g.fussId); if (o) this.face(g, o.x, o.z); }
        else if (g.quirk === 'queue' && g.anim === 'walk') g.anim = 'queue';
        g.timer -= dt;
        if (g.timer <= 0) { g.quirk = ''; this.decide(g); }
        break;

      default:
        this.decide(g);
    }
  }

  // ---- night ---------------------------------------------------------------

  startNight() {
    const sim = this.sim;
    const s = sim.state;
    for (const g of s.grandmas) {
      leaveQueue(sim, g);
      if (g.carryN > 0 && (g.carryType === 'food' || g.carryType === 'wood' || g.carryType === 'stone')) {
        deposit(sim, g.carryType, g.carryN, 'grandma');
      }
      if (g.carryType === 'egg') {
        for (const e of s.eggs) if (e.loc === 'grandma' && e.container === g.id) {
          if (!storeEgg(sim, e)) { e.loc = 'ground'; e.container = 0; e.x = g.x; e.z = g.z; }
        }
      }
      g.carryType = ''; g.carryN = 0; g.bigItem = false; g.site = 0; g.eggTarget = 0; g.eggN = 0; g.quirk = '';
      if (g.state === 'emerge') continue;
      this.go(g, g.bedX, g.bedZ, g.bedInside ? 0.8 : 0.6);
      this.set(g, 'toBed');
    }
  }

  nightTick(g, dt) {
    if (g.state === 'toBed' && !g.moving) {
      if (g.bedInside) g.inside = true;
      this.set(g, 'sleep', 0, g.bed ? 'sleep' : 'sleepOut');
      this.face(g, g.x, g.z + 1);
    }
  }

  dawn() {
    const s = this.sim.state;
    for (const g of s.grandmas) {
      // Everyone wakes up wherever they were supposed to sleep.
      if (g.state === 'toBed' || g.state === 'sleep') {
        g.x = g.bedX + (rand(s) - 0.5) * 1.2;
        g.z = g.bedZ + (rand(s) - 0.5) * 1.2;
      }
      g.inside = false;
      g.moving = false;
      g.state = 'idle';
      g.anim = 'idle';
      g.timer = rand(s) * 2; // staggered start to the day
      g.eatRetryAt = 0;
    }
  }
}
