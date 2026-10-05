// Dynamic mountain events. Pure simulation (no rendering): each event has
// update(dt, skier, world, game) and reset(world). Views live in
// render/eventViews.js and read the state exposed here.

import { boxProp, logProp, SURF } from './world.js';
import { clamp, smoothstep, mulberry32 } from '../sim/math.js';

// ---------------------------------------------------------------- bridge
// A plank deck over the gorge. When the skier approaches, the middle of the
// deck gives way, leaving a narrow strip on one side. Options: thread the
// strip, jump the hole, or use the snow ramp elsewhere.
export class BridgeCollapse {
  constructor(world, { x, z0, z1, width, y0, y1, arch = 1.2, seg = 4 }) {
    this.kind = 'bridge';
    this.z = z0;
    this.trigger = z0 - 28;
    this.planks = [];
    const n = Math.round((z1 - z0) / seg);
    const strips = [[-width / 2, -width / 2 + 2.6], [-width / 2 + 2.6, width / 2 - 1.8], [width / 2 - 1.8, width / 2]];
    for (let i = 0; i < n; i++) {
      const za = z0 + i * seg;
      const t = (i + 0.5) / n;
      const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * arch;
      for (let s = 0; s < 3; s++) {
        const [a, b] = strips[s];
        const p = boxProp(x + (a + b) / 2, za + seg / 2, b - a - 0.05, seg - 0.04, y - 0.5, 0.5, {
          surf: SURF.wood, color: 0x6b4a2c, visual: 'plank',
        });
        p.seg = i;
        p.strip = s;
        p.home = { y: p.baseY };
        // middle section, left + centre strips collapse; right strip holds
        p.collapses = i >= Math.floor(n * 0.35) && i < Math.floor(n * 0.35) + 4 && s < 2;
        p.delay = 0.15 * (i - Math.floor(n * 0.35)) + s * 0.08 + 0.35;
        world.addProp(p);
        this.planks.push(p);
      }
    }
    // rails (visual only)
    this.x = x;
    this.z0 = z0;
    this.z1 = z1;
    this.width = width;
    this.y0 = y0;
    this.y1 = y1;
    this.reset(world);
  }

  reset() {
    this.state = 'intact';
    this.t = 0;
    for (const p of this.planks) {
      p.dead = false;
      p.falling = false;
      p.baseY = p.home.y;
      p.vy = 0;
      p.rotX = 0;
      p.rotZ = 0;
    }
  }

  update(dt, sk, world, game) {
    if (this.state === 'intact' && sk.p.z > this.trigger && Math.abs(sk.p.x - this.x) < 60) {
      this.state = 'collapsing';
      this.t = 0;
      game && game.audio.crack(true);
      game && game.cam.addTrauma(0.35);
    }
    if (this.state === 'collapsing') {
      this.t += dt;
      for (const p of this.planks) {
        if (!p.collapses) continue;
        if (!p.falling && this.t > p.delay) {
          p.falling = true;
          p.dead = true;
          if (game && Math.random() < 0.3) game.audio.wood(0.8);
        }
        if (p.falling) {
          p.vy -= 9.81 * dt;
          p.baseY += p.vy * dt;
          p.rotX += dt * (p.seg % 2 ? 1.3 : -1.1);
          p.rotZ += dt * (p.strip ? 0.9 : -0.7);
        }
      }
    }
  }
}

// ------------------------------------------------------------- avalanche
export class Avalanche {
  constructor(world, { trigger, crackZ, stopZ, speed = 26, safe = [] }) {
    this.kind = 'avalanche';
    this.z = trigger;
    this.trigger = trigger;
    this.crackZ = crackZ;
    this.stopZ = stopZ;
    this.vmax = speed;
    this.safe = safe; // [{test(x,z,y,world)}]
    this.reset();
  }

  reset() {
    this.state = 'waiting';
    this.front = this.crackZ;
    this.v = 0;
    this.t = 0;
    this.caught = false;
  }

  inSafe(x, y, z, world) {
    return this.safe.some((s) => s.test(x, y, z, world));
  }

  update(dt, sk, world, game) {
    if (this.state === 'waiting') {
      if (sk.p.z > this.trigger && !sk.crashed) {
        this.state = 'cracking';
        this.t = 0;
        game && game.audio.crack(true);
        game && game.hud.toast('', '', 0.1);
      }
      if (game) game.rumble = 0;
      return;
    }
    this.t += dt;
    if (this.state === 'cracking') {
      if (game) game.rumble = 0.25;
      if (this.t > 1.4) {
        this.state = 'running';
        game && game.cam.addTrauma(0.5);
      }
      return;
    }
    if (this.state === 'running') {
      const target = this.front > this.stopZ - 150 ? Math.max(0, this.vmax * (this.stopZ - this.front) / 150) : this.vmax;
      const acc = this.front > this.stopZ - 150 ? 10 : 4.5;
      this.v += clamp(target - this.v, -acc * dt, acc * dt);
      this.front += this.v * dt;
      if (this.front >= this.stopZ - 1 || (this.v < 0.5 && this.front > this.stopZ - 150)) this.state = 'stopped';
      // engulf the skier?
      const p = game && game.state === 'crashed' ? game.ragdoll.center() : sk.p;
      const behind = this.front - p.z;
      if (behind > 0 && behind < 40 && game && !this.inSafe(p.x, p.y, p.z, world)) {
        if (game.state === 'skiing') {
          sk.crash('caught by the avalanche');
          game.failZone = { name: 'Avalanche', title: 'BURIED', respawn: this.respawn, kind: 'major' };
          game.beginCrash();
        }
        // carry the ragdoll
        if (game.state === 'crashed' && behind < 30) {
          const rd = game.ragdoll;
          for (let i = 0; i < rd.n; i++) {
            rd.px[i * 3 + 2] -= (this.v * 0.9 / 240) * 0.08;
            rd.px[i * 3 + 1] -= 0.004;
          }
        }
      }
      if (game) {
        const d = Math.abs(this.front - p.z);
        game.rumble = clamp(1.2 - d / 220, 0.15, 1.2);
        game.whiteout = clamp(1 - (p.z - this.front) / 35, 0, 0.85) * (this.front < p.z + 25 ? 1 : 0.3);
        this.distance = p.z - this.front;
      }
    } else if (this.state === 'stopped' && game) {
      game.rumble = Math.max(0, game.rumble - dt * 0.4);
      game.whiteout = Math.max(0, game.whiteout - dt * 0.5);
    }
  }
}

// -------------------------------------------------------------- ice field
// Fragile ice cells: slow, heavy skiing cracks and breaks them; fast skiing
// skims across.
export class IceField {
  constructor(world, { cells, size, waterY }) {
    this.kind = 'ice';
    this.cells = cells.map(([x, z]) => ({ x, z, stress: 0, broken: false }));
    this.size = size;
    this.z = Math.min(...cells.map((c) => c[1]));
    this.waterY = waterY;
    this.map = new Map();
    for (const c of this.cells) this.map.set(this.key(c.x, c.z), c);
    this.changed = 0;
  }

  key(x, z) {
    return Math.floor(x / this.size) + ',' + Math.floor(z / this.size);
  }

  cellAt(x, z) {
    return this.map.get(this.key(x, z));
  }

  reset() {
    for (const c of this.cells) {
      c.stress = 0;
      c.broken = false;
    }
    this.changed++;
  }

  update(dt, sk, world, game) {
    if (!sk.grounded || sk.crashed) return;
    const c = this.cellAt(sk.p.x, sk.p.z);
    if (!c || c.broken) return;
    const rate = (sk.load * 1.0) / (0.4 + sk.speed / 5);
    const before = c.stress;
    c.stress += rate * dt * 0.9;
    if (Math.floor(before * 4) !== Math.floor(c.stress * 4) && c.stress < 1) {
      game && game.audio.crack(false);
      this.changed++;
    }
    // stress spreads to neighbours a little (crack propagation)
    if (c.stress > 0.5) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nb = this.cellAt(c.x + dx * this.size, c.z + dz * this.size);
        if (nb && !nb.broken) nb.stress = Math.min(0.95, nb.stress + dt * 0.08);
      }
    }
    if (c.stress >= 1) {
      c.broken = true;
      this.changed++;
      game && game.audio.crack(true);
      game && game.cam.addTrauma(0.4);
    }
  }
}

// ----------------------------------------------------------------- cornice
// A lip on a ridge edge that looks like normal snow. Weight near the edge for
// too long and it breaks away, dropping you into the bowl below.
export class Cornice {
  constructor(world, { x0, x1, z0, z1, height }) {
    this.kind = 'cornice';
    this.x0 = x0;
    this.x1 = x1;
    this.z0 = z0;
    this.z1 = z1;
    this.z = z0;
    this.height = height;
    const self = this;
    this.feature = {
      zMin: z0 - 4, zMax: z1 + 4, xMin: x0 - 4, xMax: x1 + 4,
      apply(x, z, h) {
        if (self.amount <= 0) return h;
        const m = smoothstep(x0 - 3, x0, x) * (1 - smoothstep(x1, x1 + 1.5, x)) * smoothstep(z0 - 4, z0, z) * (1 - smoothstep(z1, z1 + 4, z));
        return h + m * self.height * self.amount;
      },
    };
    world.def.features.push(this.feature);
    world._bin(world.featureBins, this.feature.zMin, this.feature.zMax, this.feature);
    this.reset();
  }

  reset() {
    this.amount = 1;
    this.load = 0;
    this.state = 'intact';
    this.dirty = true;
  }

  update(dt, sk, world, game) {
    const on = sk.grounded && sk.p.x > this.x0 && sk.p.x < this.x1 && sk.p.z > this.z0 && sk.p.z < this.z1;
    if (this.state === 'intact') {
      if (on) this.load += dt * (sk.load + 0.3);
      else this.load = Math.max(0, this.load - dt * 0.5);
      if (this.load > 0.45) {
        this.state = 'breaking';
        game && game.audio.crack(true);
        game && game.cam.addTrauma(0.4);
      }
    } else if (this.state === 'breaking') {
      this.amount = Math.max(0, this.amount - dt * 2.2);
      this.dirty = true;
      if (this.amount <= 0) this.state = 'gone';
    }
    if (this.dirty && game) {
      game.terrainView.invalidate((this.x0 + this.x1) / 2, (this.z0 + this.z1) / 2, 40);
      this.dirty = false;
    }
  }
}

// ------------------------------------------------------------ falling tree
// A big tree topples across the lane when you approach. Early = it falls
// behind you. On time = it lands propped on a rock and becomes a ramp.
// Late = you meet it on the way down.
export class FallingTree {
  constructor(world, { x, z, dirX, dirZ, length, trigger, restAngle = 0.16 }) {
    this.kind = 'fallingTree';
    this.x = x;
    this.z = z;
    this.trigger = trigger;
    this.dir = { x: dirX, z: dirZ };
    const l = Math.hypot(dirX, dirZ);
    this.dir.x /= l;
    this.dir.z /= l;
    this.length = length;
    this.restAngle = restAngle; // rests propped up this many rad above flat
    this.baseY = world.terrain(x, z);
    this.prop = logProp({ x, y: this.baseY + 0.4, z }, { x: x + this.dir.x * length, y: this.baseY, z: z + this.dir.z * length }, 0.45, { surf: SURF.wood });
    this.prop.noView = true;
    world.addProp(this.prop);
    this.trunk = { x, z, r: 0.5, h: length, kind: 'tree', baseY: this.baseY };
    world.trees.push(this.trunk);
    world._bin(world.treeBins, z - 2, z + 2, this.trunk);
    this.reset(world);
  }

  reset(world) {
    this.state = 'standing';
    this.angle = Math.PI / 2; // from horizontal
    this.av = 0;
    this.prop.dead = true;
    this.trunk.dead = false;
  }

  update(dt, sk, world, game) {
    if (this.state === 'standing' && sk.p.z > this.trigger) {
      this.state = 'falling';
      this.trunk.dead = true;
      game && game.audio.wood(1);
      game && game.audio.crack(false);
    }
    if (this.state === 'falling') {
      this.av += Math.cos(this.angle) * 4.5 * dt + 0.25 * dt;
      this.angle -= this.av * dt;
      // hits the skier while coming down
      const tipX = this.x + this.dir.x * Math.cos(this.angle) * this.length;
      const tipZ = this.z + this.dir.z * Math.cos(this.angle) * this.length;
      if (game && game.state === 'skiing' && this.angle < 0.9) {
        // distance from skier to the trunk line (in plan), and trunk height there
        const ax = tipX - this.x;
        const az = tipZ - this.z;
        const L2 = ax * ax + az * az;
        const t = clamp(((sk.p.x - this.x) * ax + (sk.p.z - this.z) * az) / L2, 0, 1);
        const d = Math.hypot(sk.p.x - (this.x + ax * t), sk.p.z - (this.z + az * t));
        const yTrunk = this.baseY + Math.sin(this.angle) * this.length * t;
        if (d < 0.9 && sk.p.y + 0.6 > yTrunk && sk.p.y - sk.L - 0.3 < yTrunk) {
          sk.crash('flattened by a falling tree');
        }
      }
      if (this.angle <= this.restAngle) {
        this.angle = this.restAngle;
        this.state = 'down';
        this.prop.dead = false;
        // rests on its rock: trunk inclined, butt end high
        const len = this.length;
        this.prop.a = { x: this.x + this.dir.x * 0.5, y: this.baseY + 0.35, z: this.z + this.dir.z * 0.5 };
        this.prop.b = {
          x: this.x + this.dir.x * len * Math.cos(this.angle),
          y: this.baseY + Math.sin(this.angle) * len * 0.5,
          z: this.z + this.dir.z * len * Math.cos(this.angle),
        };
        this.prop.xMin = Math.min(this.prop.a.x, this.prop.b.x) - 1;
        this.prop.xMax = Math.max(this.prop.a.x, this.prop.b.x) + 1;
        this.prop.zMin = Math.min(this.prop.a.z, this.prop.b.z) - 1;
        this.prop.zMax = Math.max(this.prop.a.z, this.prop.b.z) + 1;
        game && game.audio.thump(1);
        game && game.cam.addTrauma(0.35);
      }
    }
  }
}

// ----------------------------------------------------- moving vehicle (plough)
export class MovingBox {
  constructor(world, { kind = 'plough', path, w, d, h, speed, color, crashText }) {
    this.kind = kind;
    this.path = path; // [{x,z}, {x,z}] ping-pong
    this.speed = speed;
    this.len = Math.hypot(path[1].x - path[0].x, path[1].z - path[0].z);
    this.z = Math.min(path[0].z, path[1].z);
    const y = world.terrain(path[0].x, path[0].z);
    this.box = boxProp(path[0].x, path[0].z, w, d, y, h, { surf: SURF.metal, color: color || 0xf2a516 });
    this.box.noView = true;
    // bin over the whole path
    this.box.zMin = Math.min(path[0].z, path[1].z) - 6;
    this.box.zMax = Math.max(path[0].z, path[1].z) + 6;
    this.box.xMin = Math.min(path[0].x, path[1].x) - 6;
    this.box.xMax = Math.max(path[0].x, path[1].x) + 6;
    const box = this.box;
    const c0 = box.top;
    box.top = function (x, z, wld) {
      // recompute local box test using current position
      const lx = (x - this.cx) * Math.cos(this.rot) - (z - this.cz) * Math.sin(this.rot);
      const lz = (x - this.cx) * Math.sin(this.rot) + (z - this.cz) * Math.cos(this.rot);
      if (Math.abs(lx) > this.w / 2 || Math.abs(lz) > this.d / 2) return -Infinity;
      return this.baseY + this.height;
    };
    void c0;
    world.addProp(box);
    this.crashText = crashText || 'ran into the snowplough';
    this.world = world;
    this.reset();
  }

  reset() {
    this.s = 0;
    this.dirSign = 1;
    this.place();
  }

  place() {
    const t = this.s / this.len;
    const p0 = this.path[0];
    const p1 = this.path[1];
    const x = p0.x + (p1.x - p0.x) * t;
    const z = p0.z + (p1.z - p0.z) * t;
    this.box.cx = x;
    this.box.cz = z;
    this.box.rot = Math.atan2(p1.z - p0.z, p1.x - p0.x) + Math.PI / 2;
    this.box.baseY = this.world.terrain(x, z);
  }

  update(dt, sk, world, game) {
    this.s += this.speed * dt * this.dirSign;
    if (this.s > this.len) {
      this.s = this.len;
      this.dirSign = -1;
    }
    if (this.s < 0) {
      this.s = 0;
      this.dirSign = 1;
    }
    this.place();
    // it can drive into you
    if (game && game.state === 'skiing') {
      const top = this.box.top(sk.p.x, sk.p.z, world);
      if (top > -Infinity && sk.p.y - sk.L < top - 0.5) {
        sk.crash(this.crashText);
      }
    }
  }
}

// ---------------------------------------------------------------- rockfall
export class Rockfall {
  constructor(world, { x0, x1, zStart, zEnd, period = 3.2, seed = 3 }) {
    this.kind = 'rockfall';
    this.x0 = x0;
    this.x1 = x1;
    this.zStart = zStart;
    this.zEnd = zEnd;
    this.z = zStart;
    this.period = period;
    this.rnd = mulberry32(seed);
    this.rocks = [];
    for (let i = 0; i < 6; i++) this.rocks.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0.6 + (i % 3) * 0.3, spin: 0 });
    this.reset();
  }

  reset() {
    this.t = 0;
    this.next = 0;
    for (const r of this.rocks) r.active = false;
  }

  update(dt, sk, world, game) {
    // only bother when the skier is near
    if (Math.abs(sk.p.z - (this.zStart + this.zEnd) / 2) > 400) return;
    this.t += dt;
    if (this.t > this.next) {
      this.next = this.t + this.period * (0.7 + this.rnd() * 0.6);
      const r = this.rocks.find((q) => !q.active);
      if (r) {
        r.active = true;
        r.x = this.x0 + (this.x1 - this.x0) * this.rnd();
        r.z = this.zStart;
        r.y = world.height(r.x, r.z) + r.r + 1;
        r.vx = (this.rnd() - 0.5) * 3;
        r.vy = 0;
        r.vz = 6;
      }
    }
    for (const r of this.rocks) {
      if (!r.active) continue;
      r.vy -= 9.81 * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.z += r.vz * dt;
      r.spin += r.vz * dt / r.r;
      const h = world.height(r.x, r.z);
      if (r.y - r.r < h) {
        const n = world.normal(r.x, r.z, 1);
        r.y = h + r.r;
        const vn = r.vx * n.x + r.vy * n.y + r.vz * n.z;
        if (vn < 0) {
          r.vx -= 1.5 * vn * n.x;
          r.vy -= 1.5 * vn * n.y;
          r.vz -= 1.5 * vn * n.z;
        }
        r.vx *= 0.995;
        r.vz *= 0.995;
      }
      if (r.z > this.zEnd || r.y < h - 5) r.active = false;
      if (game && game.state === 'skiing') {
        const d = Math.hypot(sk.p.x - r.x, sk.p.y - 0.4 - r.y, sk.p.z - r.z);
        if (d < r.r + 0.5) {
          const rel = Math.hypot(r.vx - sk.v.x, r.vz - sk.v.z);
          if (rel > 7 || r.r > 0.8) sk.crash('rockfall');
          else sk.shove(r.vx * 0.3, 1, r.vz * 0.3, -0.8, 0.9);
          r.active = false;
          game.audio.thump(0.8);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- cable car
export class CableCar {
  constructor(world, { a, b, period, size = 3 }) {
    this.kind = 'cablecar';
    this.a = a;
    this.b = b;
    this.period = period;
    this.size = size;
    this.z = Math.min(a.z, b.z);
    this.reset();
  }

  reset() {
    this.t = 0;
    this.pos = { ...this.a };
  }

  update(dt, sk, world, game) {
    this.t += dt;
    const ph = (this.t / this.period) % 2;
    const k = ph < 1 ? ph : 2 - ph;
    const s = k * k * (3 - 2 * k);
    this.pos = {
      x: this.a.x + (this.b.x - this.a.x) * s,
      y: this.a.y + (this.b.y - this.a.y) * s - Math.sin(s * Math.PI) * 4 - 3,
      z: this.a.z + (this.b.z - this.a.z) * s,
    };
    if (game && game.state === 'skiing') {
      const p = sk.p;
      const h = this.size;
      if (Math.abs(p.x - this.pos.x) < h * 0.8 && Math.abs(p.z - this.pos.z) < h * 0.6 && p.y > this.pos.y - h && p.y < this.pos.y + 1) {
        sk.crash('hit the cable car');
      }
    }
  }
}
