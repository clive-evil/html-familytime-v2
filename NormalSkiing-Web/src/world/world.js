// World: an analytic height field (base profile + corridor + features) plus
// solid props (roofs, decks, logs, vehicles) and tree trunks. Everything the
// skier touches comes from height(x, z), so ANY shape can become a jump.
//
// Coordinate system: +y up, +z downhill (forward), x lateral.

import { clamp, smoothstep, fbm, lerp } from '../sim/math.js';

export const SURF = {
  snow: { name: 'snow', mu: 0.035, grip: 1.0, steer: 1.0, rough: 0.0 },
  packed: { name: 'packed', mu: 0.03, grip: 1.05, steer: 1.0, rough: 0.0 },
  ice: { name: 'ice', mu: 0.012, grip: 0.2, steer: 0.45, rough: 0.15, chatter: true },
  powder: { name: 'powder', mu: 0.05, grip: 0.75, steer: 0.8, rough: 0.05, powder: true },
  road: { name: 'road', mu: 0.045, grip: 0.85, steer: 0.95, rough: 0.05 },
  rock: { name: 'rock', mu: 0.28, grip: 0.55, steer: 0.6, rough: 0.6 },
  wood: { name: 'wood', mu: 0.06, grip: 0.7, steer: 0.85, rough: 0.1 },
  roof: { name: 'roof', mu: 0.04, grip: 0.8, steer: 0.9, rough: 0.0 },
  metal: { name: 'metal', mu: 0.05, grip: 0.4, steer: 0.6, rough: 0.1 },
  debris: { name: 'debris', mu: 0.07, grip: 0.7, steer: 0.75, rough: 0.5, powder: true },
  water: { name: 'water', mu: 0.6, grip: 0.1, steer: 0.1, rough: 0.0, water: true },
};

const BIN = 32;

export class World {
  /**
   * def = {
   *   name, length, startX, startZ,
   *   profile: [[z, slopeDeg], ...]   // slope angle by z (interpolated)
   *   corridor: { center(z), halfWidth(z), wallHeight }
   *   noiseAmp, noiseScale
   *   features: [{ zMin, zMax, apply(x, z, h, world) -> h }]
   *   surfaces: [{ zMin, zMax, test(x, z, h) -> SURF|null }]
   *   props: [{ zMin, zMax, xMin, xMax, top(x, z) -> number|-Infinity, surf, solid }]
   *   trees: [{ x, z, r, h }]
   *   checkpoints, regions, failZones, events
   * }
   */
  constructor(def) {
    this.def = def;
    this.name = def.name;
    this.length = def.length;
    this.events = [];
    this.time = 0;
    this._buildProfile();
    this.featureBins = new Map();
    this.propBins = new Map();
    this.surfaceBins = new Map();
    this.treeBins = new Map();
    for (const f of def.features || []) this._bin(this.featureBins, f.zMin, f.zMax, f);
    for (const s of def.surfaces || []) this._bin(this.surfaceBins, s.zMin, s.zMax, s);
    for (const p of def.props || []) this.addProp(p);
    for (const t of def.trees || []) this._bin(this.treeBins, t.z - t.r - 1, t.z + t.r + 1, t);
    this.trees = def.trees || [];
    for (const t of this.trees) if (t.baseY === undefined) t.baseY = this.terrain(t.x, t.z);
    this.props = def.props || [];
    this.checkpoints = def.checkpoints || [];
    this.regions = def.regions || [];
    this.failZones = def.failZones || [];
    this.decor = def.decor || [];
  }

  _bin(map, zMin, zMax, item) {
    const a = Math.floor(zMin / BIN);
    const b = Math.floor(zMax / BIN);
    for (let i = a; i <= b; i++) {
      let arr = map.get(i);
      if (!arr) map.set(i, (arr = []));
      arr.push(item);
    }
  }

  addProp(p) {
    this._bin(this.propBins, p.zMin, p.zMax, p);
    if (this.props && !this.props.includes(p)) this.props.push(p);
  }

  addFeature(f) {
    this.def.features.push(f);
    this._bin(this.featureBins, f.zMin, f.zMax, f);
  }

  addTree(t) {
    if (t.baseY === undefined) t.baseY = this.terrain(t.x, t.z);
    this.trees.push(t);
    this._bin(this.treeBins, t.z - t.r - 1, t.z + t.r + 1, t);
  }

  addSurface(sf) {
    this._bin(this.surfaceBins, sf.zMin, sf.zMax, sf);
  }

  addEvent(ev) {
    this.events.push(ev);
  }

  _buildProfile() {
    // Integrate slope angles into a base elevation table at 1 m resolution.
    const prof = this.def.profile;
    const n = Math.ceil(this.def.length + 400);
    this.base = new Float32Array(n + 1);
    this.baseZ0 = -200; // allow a bit of terrain above the start
    let y = this.def.startElevation || 2400;
    const slopeAt = (z) => {
      if (z <= prof[0][0]) return prof[0][1];
      for (let i = 1; i < prof.length; i++) {
        if (z <= prof[i][0]) {
          const t = smoothstep(prof[i - 1][0], prof[i][0], z);
          return lerp(prof[i - 1][1], prof[i][1], t);
        }
      }
      return prof[prof.length - 1][1];
    };
    this.slopeAt = slopeAt;
    // integrate from baseZ0 with start elevation pinned at z=0
    const vals = [];
    let yy = 0;
    for (let i = 0; i <= n; i++) {
      const z = this.baseZ0 + i;
      vals.push(yy);
      yy -= Math.tan((slopeAt(z) * Math.PI) / 180);
    }
    const off = y - vals[-this.baseZ0];
    for (let i = 0; i <= n; i++) this.base[i] = vals[i] + off;
    this.startElevation = y;
    this.endElevation = this.baseHeight(this.def.length);
  }

  baseHeight(z) {
    const f = z - this.baseZ0;
    if (f <= 0) return this.base[0] + (-f) * 0.05;
    const i = Math.floor(f);
    if (i >= this.base.length - 1) return this.base[this.base.length - 1];
    const t = f - i;
    return this.base[i] * (1 - t) + this.base[i + 1] * t;
  }

  corridorCenter(z) {
    return this.def.corridor.center(z);
  }
  halfWidth(z) {
    return this.def.corridor.halfWidth(z);
  }

  // Terrain without props.
  terrain(x, z) {
    const c = this.def.corridor;
    const cx = c.center(z);
    const hw = c.halfWidth(z);
    const dx = Math.abs(x - cx) / hw;
    let h = this.baseHeight(z);
    // dish: gentle funnel toward the middle; then a bounding ridge, beyond
    // which the ground falls away into side valleys (so you can see out)
    h += (c.dish || 3) * Math.min(dx, 1.6) * Math.min(dx, 1.6);
    const H = c.ridge ?? 32;
    const D = c.outerDrop ?? 160;
    if (dx > 0.85) h += H * smoothstep(0.85, 1.32, dx);
    if (dx > 1.4) h -= (H + D) * smoothstep(1.4, 2.7, dx);
    // distant terrain climbs again toward the surrounding range
    if (dx > 3.2) h += smoothstep(3.2, 7, dx) * 520 + fbm(x * 0.003, z * 0.003, 3) * 90 * smoothstep(3.2, 5, dx);
    // natural rolls
    const na = this.def.noiseAmp ?? 1.2;
    if (na > 0) {
      const s = this.def.noiseScale ?? 0.025;
      h += fbm(x * s, z * s, 3) * na * (1 + smoothstep(0.8, 1.6, dx) * 6);
    }
    const bin = this.featureBins.get(Math.floor(z / BIN));
    if (bin) {
      for (let i = 0; i < bin.length; i++) {
        const f = bin[i];
        if (z < f.zMin || z > f.zMax) continue;
        if (f.xMin !== undefined && (x < f.xMin || x > f.xMax)) continue;
        h = f.apply(x, z, h, this);
      }
    }
    return h;
  }

  // Highest solid surface at (x,z): terrain or a prop top.
  height(x, z) {
    let h = this.terrain(x, z);
    const bin = this.propBins.get(Math.floor(z / BIN));
    if (bin) {
      for (let i = 0; i < bin.length; i++) {
        const p = bin[i];
        if (p.dead) continue;
        if (z < p.zMin || z > p.zMax || x < p.xMin || x > p.xMax) continue;
        const t = p.top(x, z, this);
        if (t > h) h = t;
      }
    }
    return h;
  }

  // Returns the prop whose top defines the surface (or null).
  propAt(x, z) {
    let h = this.terrain(x, z);
    let best = null;
    const bin = this.propBins.get(Math.floor(z / BIN));
    if (bin) {
      for (const p of bin) {
        if (p.dead) continue;
        if (z < p.zMin || z > p.zMax || x < p.xMin || x > p.xMax) continue;
        const t = p.top(x, z, this);
        if (t > h) {
          h = t;
          best = p;
        }
      }
    }
    return best;
  }

  normal(x, z, e = 0.3) {
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    const nx = -hx / (2 * e);
    const nz = -hz / (2 * e);
    const l = Math.sqrt(nx * nx + 1 + nz * nz);
    return { x: nx / l, y: 1 / l, z: nz / l };
  }

  surface(x, z, h) {
    const prop = this.propAt(x, z);
    if (prop) return prop.surf || SURF.wood;
    const bin = this.surfaceBins.get(Math.floor(z / BIN));
    if (bin) {
      for (const s of bin) {
        if (z < s.zMin || z > s.zMax) continue;
        const r = s.test(x, z, h, this);
        if (r) return r;
      }
    }
    // steep exposed terrain is rock
    const n = this.normal(x, z, 0.8);
    if (n.y < 0.62) return SURF.rock;
    return this.def.defaultSurface || SURF.snow;
  }

  // Surface zone only (no props, no slope rock) - cheap, used for colouring.
  surfaceZone(x, z, h) {
    const bin = this.surfaceBins.get(Math.floor(z / BIN));
    if (bin) {
      for (const s of bin) {
        if (z < s.zMin || z > s.zMax) continue;
        const r = s.test(x, z, h, this);
        if (r) return r;
      }
    }
    return null;
  }

  sample(x, z) {
    const h = this.height(x, z);
    const n = this.normal(x, z);
    return { h, n, surf: this.surface(x, z, h) };
  }

  treesNear(z) {
    return this.treeBins.get(Math.floor(z / BIN)) || [];
  }

  regionAt(z) {
    let r = this.regions[0];
    for (const reg of this.regions) if (z >= reg.z) r = reg;
    return r;
  }

  update(dt, skier, game) {
    this.time += dt;
    for (const ev of this.events) ev.update && ev.update(dt, skier, this, game);
  }

  resetEvents(fromZ = -Infinity) {
    for (const ev of this.events) {
      if (ev.z === undefined || ev.z >= fromZ - 50) ev.reset && ev.reset(this);
    }
  }
}

// ---------- feature helpers ----------

// Lateral mask: 1 inside [x0,x1], fading to 0 over `soft` metres.
export function xMask(x, x0, x1, soft = 4) {
  return smoothstep(x0 - soft, x0, x) * (1 - smoothstep(x1, x1 + soft, x));
}

// Cross-slope lip / natural kicker. Ramp rises over `ramp` m up to the lip at
// z0 (concave curve), then the ground drops away over `drop` m by `depth`
// below the base and blends back over `recover` m. Height is relative to the
// unmodified terrain so it works on any slope.
export function lipProfile(u, { ramp, height, drop, depth, recover, kick = 2 }) {
  if (u < -ramp) return 0;
  if (u <= 0) {
    const t = (u + ramp) / ramp;
    return height * Math.pow(t, kick);
  }
  if (u <= drop) {
    const t = u / drop;
    // convex roll-off then steep face
    const s = t * t * (3 - 2 * t);
    return lerp(height, -depth, s);
  }
  if (u <= drop + recover) {
    const t = (u - drop) / recover;
    return -depth * (1 - t * t * (3 - 2 * t));
  }
  return 0;
}

export function lip(z0, x0, x1, opts, soft = 5) {
  const zMin = z0 - opts.ramp - 1;
  const zMax = z0 + opts.drop + opts.recover + 1;
  return {
    kind: 'lip',
    z0,
    zMin,
    zMax,
    xMin: x0 - soft,
    xMax: x1 + soft,
    apply(x, z, h) {
      const m = xMask(x, x0, x1, soft);
      if (m <= 0) return h;
      return h + lipProfile(z - z0, opts) * m;
    },
  };
}

// Natural kicker + landing hill. Ramp rises (concave) to the lip at z0, then a
// sharp edge, a convex knuckle that steepens to `landAngle` (deg, relative to
// the base slope) for `landLen` m, a concave transition over `recover` m, and a
// gentler `runout` that gives back the height so terrain stays continuous.
export function kicker(z0, x0, x1, o, soft = 6) {
  const res = 0.25;
  const sk = (o.height * (o.kick ?? 3)) / o.ramp;
  const tl = Math.tan(((o.landAngle ?? 12) * Math.PI) / 180);
  const kn = o.knuckle ?? 3;
  const ll = o.landLen ?? 20;
  const rc = o.recover ?? 15;
  const ro = o.runout ?? 60;
  const post = kn + ll + rc;
  const n = Math.ceil(post / res) + 1;
  const tab = new Float32Array(n + 1);
  let y = o.height;
  let prevS = 0;
  for (let i = 0; i <= n; i++) {
    const u = i * res;
    let sl;
    if (u < kn) sl = -tl * smoothstep(0, kn, u) - (o.edgeDrop ?? 0) * (1 - smoothstep(0, 0.6, u));
    else if (u < kn + ll) sl = -tl;
    else sl = -tl * (1 - smoothstep(kn + ll, post, u));
    if (i > 0) y += ((sl + prevS) / 2) * res;
    prevS = sl;
    tab[i] = y;
  }
  const end = tab[n];
  const ro2 = Math.max(ro, Math.abs(end) / 0.15);
  const prof = (u) => {
    if (u < -o.ramp) return 0;
    if (u <= 0) return o.height * Math.pow((u + o.ramp) / o.ramp, o.kick ?? 3);
    if (u <= post) {
      const f = u / res;
      const i = Math.floor(f);
      const t = f - i;
      return tab[i] * (1 - t) + tab[Math.min(i + 1, n)] * t;
    }
    return end * (1 - smoothstep(post, post + ro2, u));
  };
  return {
    kind: 'kicker',
    z0,
    lipAngle: sk,
    zMin: z0 - o.ramp - 1,
    zMax: z0 + post + ro2 + 1,
    xMin: x0 - soft,
    xMax: x1 + soft,
    profile: prof,
    apply(x, z, h) {
      const m = o.mask ? o.mask(x, z) : xMask(x, x0, x1, soft);
      if (m <= 0) return h;
      return h + prof(z - z0) * m;
    },
  };
}

// Generic along-slope reshaping. segs = [[length, slopeStart, slopeEnd], ...]
// with slopes RELATIVE to the base (+ = flatter/uphill, - = steeper). A runout
// gives back any height offset so terrain stays continuous. `steps` adds
// near-vertical drops: [[u, drop, width]].
export function reprofile(z0, x0, x1, segs, o = {}) {
  const res = 0.25;
  let total = 0;
  for (const sgm of segs) total += sgm[0];
  const n = Math.ceil(total / res) + 1;
  const tab = new Float32Array(n + 1);
  let y = 0;
  let prev = segs[0][1];
  for (let i = 0; i <= n; i++) {
    const u = i * res;
    let acc = 0;
    let sl = 0;
    for (const [L, a, b] of segs) {
      if (u <= acc + L) {
        const t = (u - acc) / L;
        sl = a + (b - a) * (t * t * (3 - 2 * t));
        break;
      }
      acc += L;
      sl = b;
    }
    if (i > 0) y += ((sl + prev) / 2) * res;
    prev = sl;
    tab[i] = y;
  }
  const steps = o.steps || [];
  const stepAt = (u) => {
    let d = 0;
    for (const [su, drop, w] of steps) d -= drop * smoothstep(su, su + w, u);
    return d;
  };
  const stepTotal = stepAt(total + 1);
  const end = tab[n] + stepTotal;
  // give the height back gently enough that the run-out never goes uphill
  const ro = Math.max(o.runout ?? 60, Math.abs(end) / 0.15);
  const prof = (u) => {
    if (u <= 0) return 0;
    if (u <= total) {
      const f = u / res;
      const i = Math.floor(f);
      const t = f - i;
      return tab[i] * (1 - t) + tab[Math.min(i + 1, n)] * t + stepAt(u);
    }
    return end * (1 - smoothstep(total, total + ro, u));
  };
  // lateral blend wide enough that the reshaped strip never forms a wall
  let maxAbs = 0;
  for (let u = 0; u < total + ro; u += 1) maxAbs = Math.max(maxAbs, Math.abs(prof(u)));
  const soft = o.soft ?? Math.max(6, maxAbs * 2.5);
  return {
    kind: 'reprofile',
    z0,
    maxOffset: maxAbs,
    zMin: z0 - 1,
    zMax: z0 + total + ro + 1,
    xMin: x0 - soft,
    xMax: x1 + soft,
    profile: prof,
    apply(x, z, h) {
      const m = o.mask ? o.mask(x, z, soft) : xMask(x, x0, x1, soft);
      if (m <= 0) return h;
      return h + prof(z - z0) * m;
    },
  };
}

// Round bump.
export function bump(cx, cz, rx, rz, height) {
  return {
    kind: 'bump',
    zMin: cz - rz,
    zMax: cz + rz,
    xMin: cx - rx,
    xMax: cx + rx,
    apply(x, z, h) {
      const dx = (x - cx) / rx;
      const dz = (z - cz) / rz;
      const d = dx * dx + dz * dz;
      if (d >= 1) return h;
      const t = 1 - d;
      return h + height * t * t;
    },
  };
}

// Channel across the slope (gorge, stream, ravine). widthFn(x) and depthFn(x)
// allow it to narrow. Walls steepness controlled by `wall` (0..1 of half width).
export function channel(z0, x0, x1, widthFn, depthFn, opts = {}) {
  const maxW = opts.maxWidth || 60;
  const wall = opts.wall ?? 0.25;
  return {
    kind: 'channel',
    z0,
    zMin: z0 - maxW,
    zMax: z0 + maxW + (opts.recover || 0),
    xMin: x0 - 20,
    xMax: x1 + 20,
    apply(x, z, h) {
      const m = xMask(x, x0, x1, 12);
      if (m <= 0) return h;
      const w = widthFn(x) / 2;
      const d = depthFn(x);
      const u = Math.abs(z - z0);
      let cut = 0;
      if (u < w) {
        const edge = smoothstep(w, w * (1 - wall), u);
        cut = d * edge;
      }
      return h - cut * m;
    },
  };
}

// Flatten an area to a fixed height (blend radius `soft`).
export function flatten(x0, x1, z0, z1, heightFn, soft = 6) {
  return {
    kind: 'flatten',
    zMin: z0 - soft,
    zMax: z1 + soft,
    xMin: x0 - soft,
    xMax: x1 + soft,
    apply(x, z, h, world) {
      const m = xMask(x, x0, x1, soft) * xMask(z, z0, z1, soft);
      if (m <= 0) return h;
      return lerp(h, heightFn(x, z, world), m);
    },
  };
}

// Solid prop helpers ---------------------------------------------------------

export function boxProp(cx, cz, w, d, baseY, height, opts = {}) {
  const rot = opts.rot || 0;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const r = Math.sqrt(w * w + d * d) / 2;
  const p = {
    kind: 'box',
    cx,
    cz,
    w,
    d,
    rot,
    baseY,
    height,
    xMin: cx - r,
    xMax: cx + r,
    zMin: cz - r,
    zMax: cz + r,
    surf: opts.surf || SURF.metal,
    color: opts.color,
    visual: opts.visual || 'box',
    top(x, z) {
      const lx = (x - this.cx) * c - (z - this.cz) * s;
      const lz = (x - this.cx) * s + (z - this.cz) * c;
      if (Math.abs(lx) > this.w / 2 || Math.abs(lz) > this.d / 2) return -Infinity;
      if (opts.roundTop) {
        const t = 1 - Math.pow((2 * lx) / this.w, 2) * 0.35;
        return this.baseY + this.height * t;
      }
      return this.baseY + this.height;
    },
  };
  Object.assign(p, opts.extra || {});
  return p;
}

// Gable-roof building. Ridge runs along x (across the slope) so skiers go
// up one roof face, over the ridge and off the eave. baseY is the ground
// level on the downhill side.
export function buildingProp(cx, cz, w, d, baseY, wallH, roofH, opts = {}) {
  const ridgeAlongX = opts.ridgeAlongX !== false;
  return {
    kind: 'building',
    cx,
    cz,
    w,
    d,
    baseY,
    wallH,
    roofH,
    ridgeAlongX,
    color: opts.color || 0x8a4b2a,
    roofColor: opts.roofColor || 0xf4f7fb,
    xMin: cx - w / 2 - 0.6,
    xMax: cx + w / 2 + 0.6,
    zMin: cz - d / 2 - 0.6,
    zMax: cz + d / 2 + 0.6,
    surf: SURF.roof,
    top(x, z) {
      const lx = x - this.cx;
      const lz = z - this.cz;
      const ow = this.w / 2 + 0.6; // eaves overhang
      const od = this.d / 2 + 0.6;
      if (Math.abs(lx) > ow || Math.abs(lz) > od) return -Infinity;
      const across = this.ridgeAlongX ? Math.abs(lz) / od : Math.abs(lx) / ow;
      return this.baseY + this.wallH + this.roofH * (1 - across);
    },
  };
}

// Lying cylinder (log, pipe, fallen tree). a/b are end points {x,y,z} of the axis.
export function logProp(a, b, radius, opts = {}) {
  const p = {
    kind: 'log',
    a,
    b,
    radius,
    surf: opts.surf || SURF.wood,
    xMin: Math.min(a.x, b.x) - radius - 0.5,
    xMax: Math.max(a.x, b.x) + radius + 0.5,
    zMin: Math.min(a.z, b.z) - radius - 0.5,
    zMax: Math.max(a.z, b.z) + radius + 0.5,
    top(x, z) {
      const ax = this.b.x - this.a.x;
      const az = this.b.z - this.a.z;
      const L2 = ax * ax + az * az;
      let t = ((x - this.a.x) * ax + (z - this.a.z) * az) / L2;
      if (t < 0 || t > 1) return -Infinity;
      const px = this.a.x + ax * t;
      const pz = this.a.z + az * t;
      const d = Math.hypot(x - px, z - pz);
      if (d > this.radius) return -Infinity;
      const y = this.a.y + (this.b.y - this.a.y) * t;
      return y + Math.sqrt(this.radius * this.radius - d * d);
    },
  };
  Object.assign(p, opts.extra || {});
  return p;
}

export function treeAt(world, x, z, r = 0.35, h = 12) {
  return { x, z, r, h };
}

export function clampToCorridor(world, x, z, frac = 0.75) {
  const cx = world.corridorCenter(z);
  const hw = world.halfWidth(z) * frac;
  return clamp(x, cx - hw, cx + hw);
}
