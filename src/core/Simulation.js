import { BALANCE } from '../data/balance.js';
import { BUILDINGS, BUILD_ORDER } from '../data/buildings.js';
import { createGameState, SAVE_VERSION } from './GameState.js';
import { ObstacleGrid, CrowdHash } from './world/Navigation.js';
import { findPlacement } from './world/Placement.js';
import { GrandmaAI } from './systems/GrandmaAI.js';
import { updateMovement } from './systems/MovementSystem.js';
import { updateDay, startNight, dawn, canSleep } from './systems/DaySystem.js';
import { updateResources } from './systems/ResourceSystem.js';
import { updateHunger } from './systems/NeedsSystem.js';
import { updateIncubators, newEgg } from './systems/EggSystem.js';
import { updateForeman, assignWorker } from './systems/JobSystem.js';
import { placeBuilding } from './systems/BuildingSystem.js';
import { spawnGrandma, updateUnlocks } from './systems/PopulationSystem.js';
import { updatePlayer, getInteraction, interact, secondary } from './systems/PlayerSystem.js';
import { updateObjectives, currentObjective, getStatus } from './systems/ObjectiveSystem.js';

// Simulation = GameState + systems + a command API + an outgoing event queue.
// It never touches the DOM or three.js. The browser game, the headless tests
// and the balance bot all drive it through the same methods.
export class Simulation {
  constructor(state) {
    this.state = state;
    this.events = [];
    this.nav = new ObstacleGrid();
    this.crowd = new CrowdHash(1.0);
    this.navDirty = true;
    this.indexDirty = true;
    this.prodAcc = { food: 0, wood: 0, stone: 0 };
    this.ai = new GrandmaAI(this);
    this.maps = { g: new Map(), b: new Map(), e: new Map(), n: new Map() };
    this.perf = { simMs: 0 };
    this.foremanT = 0;
  }

  static newGame(seed = (Math.random() * 2 ** 31) | 0) {
    return new Simulation(createGameState(seed));
  }

  static fromJSON(json) {
    const state = typeof json === 'string' ? JSON.parse(json) : json;
    if (!state || state.version !== SAVE_VERSION) throw new Error('Incompatible save');
    return new Simulation(state);
  }

  toJSON() {
    return JSON.stringify(this.state);
  }

  // ---- events --------------------------------------------------------------

  emit(type, data = {}) {
    this.events.push({ ...data, type });
    if (this.events.length > 2000) this.events.splice(0, 1000); // headless safety valve
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---- lookups ---------------------------------------------------------------

  reindex() {
    const { g, b, e, n } = this.maps;
    g.clear(); b.clear(); e.clear(); n.clear();
    for (const x of this.state.grandmas) g.set(x.id, x);
    for (const x of this.state.buildings) b.set(x.id, x);
    for (const x of this.state.eggs) e.set(x.id, x);
    for (const x of this.state.nodes) n.set(x.id, x);
    this.indexDirty = false;
  }
  getGrandma(id) { if (this.indexDirty) this.reindex(); return this.maps.g.get(id); }
  getBuilding(id) { if (this.indexDirty) this.reindex(); return this.maps.b.get(id); }
  getEgg(id) { if (this.indexDirty) this.reindex(); return this.maps.e.get(id); }
  getNode(id) { if (this.indexDirty) this.reindex(); return this.maps.n.get(id); }

  nearestGrandma(x, z, excludeId, maxD) {
    let best = null, bd = maxD * maxD;
    for (const g of this.state.grandmas) {
      if (g.id === excludeId || g.inside) continue;
      const d = (g.x - x) ** 2 + (g.z - z) ** 2;
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }

  hasTables() {
    return this.state.buildings.some((b) => b.built && BUILDINGS[b.type].eatSlots);
  }

  workMult(g) {
    let m = 1;
    if (g.starving) m *= BALANCE.grandma.starvingWorkMult;
    if (g.stiff) m *= BALANCE.grandma.stiffWorkMult;
    return m;
  }

  // ---- main tick -----------------------------------------------------------

  step(dt) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    dt = Math.min(dt, 0.1);
    const s = this.state;
    if (this.indexDirty) this.reindex();
    if (this.navDirty) { this.nav.rebuild(s); this.navDirty = false; }
    s.time += dt;
    updatePlayer(this, dt);
    updateDay(this, dt);
    updateResources(this, dt);
    updateHunger(this, dt);
    updateIncubators(this, dt);
    updateForeman(this, dt);
    this.ai.update(dt);
    if (this.navDirty) { this.nav.rebuild(s); this.navDirty = false; }
    updateMovement(this, dt);
    updateObjectives(this);
    if (t0) this.perf.simMs = performance.now() - t0;
  }

  // ---- commands (the only way presentation mutates the sim) -----------------

  setInput(mx, mz, sprint = false) {
    const p = this.state.player;
    p.mx = mx; p.mz = mz; p.sprint = sprint;
  }

  getInteraction() { return getInteraction(this); }

  // press: first frame of the button; hold: button is down this frame.
  interact(press, hold, dt = 0) {
    const it = getInteraction(this);
    if (!hold) this.state.player.sleepHold = 0;
    return interact(this, it, press, hold, dt);
  }

  secondary() { return secondary(this, getInteraction(this)); }

  place(type, cx, cz, rot = 0) { return placeBuilding(this, type, cx, cz, rot); }

  sleep() { return canSleep(this.state) && startNight(this, 'sleep'); }

  objective() { return currentObjective(this); }
  status() { return getStatus(this); }

  // ---- debug / test hooks ------------------------------------------------------

  debug(cmd, arg) {
    const s = this.state;
    switch (cmd) {
      case 'food': case 'wood': case 'stone':
        s.resources[cmd] += arg ?? 50; return true;
      case 'egg': {
        let n = arg ?? 1, made = 0;
        while (n-- > 0) if (newEgg(this)) made++;
        return made;
      }
      case 'hatch': {
        // Instantly hatch every stored egg next to the cottage.
        let n = 0;
        for (const e of [...s.eggs]) {
          if (e.loc !== 'store') continue;
          s.eggs.splice(s.eggs.indexOf(e), 1);
          const g = spawnGrandma(this, 4 + Math.random() * 3, -1 + Math.random() * 3);
          g.state = 'emerge'; g.timer = BALANCE.grandma.emergeTime; g.anim = 'emerge'; g.spawnT = 0;
          n++;
        }
        this.indexDirty = true;
        s.flags.firstHatch = true;
        return n;
      }
      case 'spawn': {
        const n = arg ?? 1;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 8;
          const g = spawnGrandma(this, Math.cos(a) * r, 2 + Math.sin(a) * r);
          g.adult = true;
        }
        return n;
      }
      case 'day':
        if (s.phase === 'day') startNight(this, 'debug');
        dawn(this);
        return true;
      case 'unlock':
        s.flags.unlockAll = true; return true;
      case 'skipTutorial':
        s.tutorial.done = true; s.tutorial.step = 99; s.flags.firstHatch = true; s.flags.deliveredFood = true;
        if (s.day === 1) { s.day = 2; s.clockRunning = true; }
        return true;
      case 'stress':
        return this.setupStress(arg ?? 100);
    }
    return false;
  }

  // Builds a plausible mid-game colony with `n` Grandmas, enough beds,
  // workplaces and food, with roughly 60% employed. Used by ?stress=N.
  setupStress(n) {
    const s = this.state;
    this.debug('skipTutorial');
    s.flags.unlockAll = true;
    const put = (type, x, z, rot = 0) => {
      const p = findPlacement(s, type, x, z, rot, 30, { ignoreCost: true });
      if (!p) return null;
      const r = placeBuilding(this, type, p.cx, p.cz, rot, { free: true, instant: true });
      return r.ok ? this.getBuilding(r.id) : null;
    };
    const total = n;
    const farms = Math.ceil(total * 0.22 / 5);
    const lumbers = Math.ceil(total * 0.1 / 3);
    const quarries = Math.ceil(total * 0.08 / 3);
    const huts = Math.ceil(total * 0.05 / 3);
    const barns = Math.ceil(total / 16);
    for (let i = 0; i < farms; i++) put('bigfarm', -16 - (i % 3) * 7, 8 + Math.floor(i / 3) * 7);
    for (let i = 0; i < lumbers; i++) put('lumber', 14 + (i % 3) * 5, -8 - Math.floor(i / 3) * 4);
    for (let i = 0; i < quarries; i++) put('quarry', 12 + (i % 3) * 5, 6 + Math.floor(i / 3) * 5);
    for (let i = 0; i < huts; i++) put('builder', -14 + i * 4, -12);
    for (let i = 0; i < barns; i++) put('barn', -10 + (i % 4) * 8, 18 + Math.floor(i / 4) * 7);
    for (let i = 0; i < Math.ceil(total / 25); i++) put('table', -2 + i * 5, 6);
    put('stockpile', 6, 4); put('stockpile', -12, 4);
    put('deluxe', 10, -2); put('crate', -4, 3); put('bell', 2, 10);
    s.resources.food += total * 12;
    s.resources.wood += 300; s.resources.stone += 300;
    const need = total - s.grandmas.length;
    for (let i = 0; i < need; i++) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 12;
      const g = spawnGrandma(this, Math.cos(a) * r, 4 + Math.sin(a) * r * 0.7);
      g.adult = true;
      g.hunger = Math.random() * 0.5;
    }
    this.reindex();
    // Staff workplaces (~60% employed).
    for (const b of s.buildings) {
      const job = BUILDINGS[b.type].job;
      if (!job || !b.built || b.type === 'bell') continue;
      for (let i = 0; i < job.slots; i++) if (!assignWorker(this, b).ok) break;
    }
    const bell = s.buildings.find((b) => b.type === 'bell');
    if (bell) assignWorker(this, bell);
    for (let i = 0; i < 6; i++) this.debug('egg');
    updateUnlocks(this);
    return s.grandmas.length;
  }

  unlockedTypes() {
    return BUILD_ORDER;
  }
}
