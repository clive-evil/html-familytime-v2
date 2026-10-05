// Session: all game rules without rendering - skier, ragdoll, crash ->
// respawn flow, checkpoints, fail zones, world events. Runs headless (tests,
// bots) or inside Game (which plugs real audio/camera/hud in).
//
// Multiplayer note: a future networked mode would run one Skier + Ragdoll per
// player against the shared World; the world events already take the skier as
// a parameter and are deterministic.

import { Skier } from '../sim/skier.js';
import { Ragdoll, RD } from '../sim/ragdoll.js';
import { clamp } from '../sim/math.js';

const noop = () => {};
const NOOP_AUDIO = new Proxy({}, { get: () => noop });
const NOOP = { addTrauma: noop, toast: noop, callout: noop, invalidate: noop };

// Approximate joint positions from the sim state (used to start the ragdoll).
export function skeletonJoints(sk) {
  const h = sk.heading;
  const f = { x: Math.sin(h), y: 0, z: Math.cos(h) };
  const l = { x: Math.cos(h), y: 0, z: -Math.sin(h) };
  const u = sk.grounded ? sk.n : { x: 0, y: 1, z: 0 };
  const feet = { x: sk.p.x - u.x * sk.L, y: sk.p.y - u.y * sk.L, z: sk.p.z - u.z * sk.L };
  const P = (lx, ly, lz) => ({
    x: feet.x + l.x * lx + u.x * ly + f.x * lz,
    y: feet.y + l.y * lx + u.y * ly + f.y * lz,
    z: feet.z + l.z * lx + u.z * ly + f.z * lz,
  });
  const L = sk.L;
  return [
    P(0, L + 0.75, 0.15), P(0, L + 0.5, 0.1), P(0, L, -0.05),
    P(0.14, L * 0.55, 0.25), P(-0.14, L * 0.55, 0.25), P(0.14, 0.14, 0), P(-0.14, 0.14, 0),
    P(0.4, L + 0.3, 0.3), P(-0.4, L + 0.3, 0.3),
    P(0.14, 0.03, 0.9), P(0.14, 0.03, -0.8), P(-0.14, 0.03, 0.9), P(-0.14, 0.03, -0.8),
  ];
}

export class Session {
  constructor(world, tune, hooks = {}) {
    this.world = world;
    this.tune = tune;
    this.skier = new Skier(tune);
    this.ragdoll = new Ragdoll();
    this.audio = hooks.audio || NOOP_AUDIO;
    this.cam = hooks.cam || NOOP;
    this.hud = hooks.hud || NOOP;
    this.terrainView = hooks.terrainView || NOOP;
    this.onSkierEvents = hooks.onSkierEvents || null;
    this.onCrash = hooks.onCrash || null;
    this.onRespawn = hooks.onRespawn || null;
    this.onFinish = hooks.onFinish || null;
    this.jointsProvider = hooks.jointsProvider || null;
    this.state = 'skiing';
    this.crashes = 0;
    this.crashLog = [];
    this.runTime = 0;
    this.lastSafe = [];
    this.balPeak = 0;
    this.rumble = 0;
    this.whiteout = 0;
    this.cpIndex = 0;
    this.saves = 0;
    this.finished = false;
    this.stats = { bestAir: 0, perfectLandings: 0, jumps: 0 };
    this.respawnAt(0, true);
  }

  // --------------------------------------------------------------- respawn
  respawnAt(i, resetEvents = true) {
    const cps = this.world.checkpoints;
    const idx = Math.max(0, Math.min(i, cps.length - 1));
    const cp = cps[idx];
    this.cpIndex = idx;
    if (resetEvents) this.world.resetEvents(cp.z);
    this.placeSkier(cp.x ?? this.world.corridorCenter(cp.z), cp.z, cp.heading ?? 0);
    this.regionName = null;
    this.onRespawn && this.onRespawn('checkpoint');
  }

  placeSkier(x, z, heading) {
    this.skier.place(this.world, x, z, heading);
    this.state = this.finished ? 'finished' : 'skiing';
    this.crashT = 0;
    this.failZone = null;
    this.lastSafe = [];
    this.balPeak = 0;
  }

  getUp() {
    const rd = this.ragdoll;
    const c = rd.center();
    const w = this.world;
    let spot = null;
    if (!this.failZone) {
      const h = w.height(c.x, c.z);
      const n = w.normal(c.x, c.z, 1);
      const s = w.surface(c.x, c.z, h);
      const fz = this.checkFail(c.x, h + 0.5, c.z);
      const hw = w.halfWidth(c.z);
      const inside = Math.abs(c.x - w.corridorCenter(c.z)) < hw * 0.95;
      if (n.y > 0.72 && !s.water && !fz && !w.propAt(c.x, c.z) && inside) spot = { x: c.x, z: c.z, n };
    }
    if (!spot) {
      if (this.failZone && this.failZone.respawn !== undefined) {
        this.respawnAt(this.failZone.respawn, true);
        return 'checkpoint';
      }
      const t = this.crashAt ?? this.runTime;
      let best = null;
      const near = this.lastSafe.filter((s) => Math.abs(s.z - c.z) < 150);
      for (const s of near) if (s.t < t - 1.5) best = s;
      if (!best && near.length) best = near[0];
      if (best) spot = { x: best.x, z: best.z, n: w.normal(best.x, best.z, 1) };
      else {
        this.respawnAt(this.cpIndex, false);
        return 'checkpoint';
      }
    }
    const heading = Math.hypot(spot.n.x, spot.n.z) > 0.05 ? Math.atan2(spot.n.x, spot.n.z) : 0;
    const keep = this.lastSafe;
    this.placeSkier(spot.x, spot.z, clamp(heading, -1.2, 1.2));
    this.lastSafe = keep;
    this.onRespawn && this.onRespawn('local');
    return 'local';
  }

  checkFail(x, y, z) {
    for (const f of this.world.failZones) if (f.test(x, y, z, this.world)) return f;
    // out of bounds: over the bounding ridge
    const w = this.world;
    const hw = w.halfWidth(Math.max(0, Math.min(z, w.length)));
    if (Math.abs(x - w.corridorCenter(Math.max(0, Math.min(z, w.length)))) > hw * 1.45) {
      return { name: 'Out of bounds', title: 'OUT OF BOUNDS', kind: 'major', respawn: this.cpIndex };
    }
    return null;
  }

  // ------------------------------------------------------------------ step
  step(dt, input) {
    const sk = this.skier;
    const w = this.world;
    if (this.state === 'skiing') {
      sk.step(input, w, dt);
      this.runTime += dt;
      this.processSkierEvents();
      if (sk.crashed) this.beginCrash();
      else {
        const fz = this.checkFail(sk.p.x, sk.p.y, sk.p.z);
        if (fz) {
          this.failZone = fz;
          sk.crash(fz.name.toLowerCase());
          this.beginCrash();
        }
      }
      if (this.state === 'skiing') this.trackProgress();
    } else if (this.state === 'crashed') {
      this.runTime += dt;
      this.ragdoll.step(w, dt);
      this.crashT += dt;
      for (const e of this.ragdoll.events) {
        if (e.type === 'skiOff') this.audio.skiOff();
        if (e.type === 'thump' && e.impact > 7 && Math.random() < 0.15) this.audio.thump(Math.min(1, e.impact / 20));
      }
      this.ragdoll.events.length = 0;
      const c = this.ragdoll.center();
      if (!this.failZone) {
        const fz = this.checkFail(c.x, c.y, c.z);
        if (fz) {
          this.failZone = fz;
          this.hud.toast(fz.title || fz.name.toUpperCase(), fz.kind === 'catastrophic' ? 'That cost you.' : 'Back up the hill.', 2.5);
        }
      }
      const settled = this.ragdoll.restTime > 0.8 || this.crashT > 7 || (this.failZone && this.crashT > 2.2);
      if (settled && this.crashT > 1.2 && this.autoGetUp !== false) this.getUp();
    }
    w.update(dt, sk, this);
  }

  processSkierEvents() {
    const sk = this.skier;
    for (const e of sk.out) {
      if (e.type === 'jump') this.stats.jumps++;
      if (e.type === 'landed') {
        if (e.report.airTime > this.stats.bestAir) this.stats.bestAir = e.report.airTime;
        if (e.report.quality === 'perfect') this.stats.perfectLandings++;
      }
    }
    this.onSkierEvents && this.onSkierEvents(sk.out);
    sk.out.length = 0;
  }

  beginCrash() {
    const sk = this.skier;
    this.state = 'crashed';
    this.crashT = 0;
    this.crashAt = this.runTime;
    this.crashes++;
    this.crashLog.push({ cause: sk.crashed.cause, x: +sk.p.x.toFixed(1), z: +sk.p.z.toFixed(1), speed: +sk.speed.toFixed(1), region: this.regionName });
    const joints = this.jointsProvider ? this.jointsProvider(sk) : skeletonJoints(sk);
    const f = { x: Math.sin(sk.heading), z: Math.cos(sk.heading) };
    const cause = sk.crashed.cause;
    const sp = Math.min(sk.speed, 30) / 10;
    const lx = f.z;
    const lz = -f.x;
    let spin;
    if (/face|tips|wall|tree|pole|flattened|plough|cable/.test(cause)) spin = { x: lx * 3 * sp, y: 0, z: lz * 3 * sp };
    else if (/back|sat|tails/.test(cause)) spin = { x: -lx * 2.5 * sp, y: 0, z: -lz * 2.5 * sp };
    else spin = { x: f.x * 3 * sp * Math.sign(sk.balL || 1), y: 0.5, z: f.z * 3 * sp * Math.sign(sk.balL || 1) };
    this.ragdoll.init(joints, sk.v, spin);
    if (sk.speed > 16 || /wall|tree/.test(cause)) this.ragdoll.detachSki(sk.speed > 22 ? 0 : 1);
    this.onCrash && this.onCrash(cause);
  }

  trackProgress() {
    const sk = this.skier;
    const w = this.world;
    const cps = w.checkpoints;
    while (this.cpIndex + 1 < cps.length && sk.p.z > cps[this.cpIndex + 1].z + 5 && sk.grounded) this.cpIndex++;
    const reg = w.regionAt(sk.p.z);
    if (reg && reg.name !== this.regionName) {
      const first = this.regionName === null;
      this.regionName = reg.name;
      this.onRegion && this.onRegion(reg, first);
    }
    if (sk.grounded && sk.balance < 0.3 && sk.n.y > 0.75 && !(sk.surf && sk.surf.water)) {
      const last = this.lastSafe[this.lastSafe.length - 1];
      if (!last || this.runTime - last.t > 0.5) {
        this.lastSafe.push({ x: sk.p.x, z: sk.p.z, t: this.runTime });
        if (this.lastSafe.length > 12) this.lastSafe.shift();
      }
    }
    const b = sk.balance;
    this.balPeak = Math.max(this.balPeak, b);
    if (b < 0.2) {
      if (this.balPeak > 0.72) {
        this.saves++;
        this.onSaved && this.onSaved();
      }
      this.balPeak = 0;
    }
    if (!this.finished && w.def.finishZ && sk.p.z > w.def.finishZ) {
      this.finished = true;
      this.state = 'finished';
      this.onFinish && this.onFinish();
    }
  }
}

export { RD };
