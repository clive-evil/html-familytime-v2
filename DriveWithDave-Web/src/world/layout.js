// The test route. Pure data + analytic height / road-distance functions so it
// can be shared by the physics (node tests) and the renderer.
//
// Coordinates: x/z ground plane, y up. Heading psi: forward = (sin psi, cos psi).
// Facing +z, LEFT is +x. UK: keep left.

import {
  clamp, smoothstep, resample, offsetPolyline, cumulative, projectOnPolyline, rng,
} from '../sim/math.js';

export const KERB_H = 0.12;
const KERB_W = 0.18;
const SMOOTH_K = 2.2; // kerb corner radius at junctions
export const BASE_GRADE = 0.16; // 1 in 6-ish at slider 1.0

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function sdSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  let t = ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz);
  t = clamp(t, 0, 1);
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

function sdBox(px, pz, b) {
  const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
  const lx = (px - b.cx) * c - (pz - b.cz) * s;
  const lz = (px - b.cx) * s + (pz - b.cz) * c;
  const qx = Math.abs(lx) - b.hx, qz = Math.abs(lz) - b.hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}

// ---------------------------------------------------------------- road centrelines
function millHillCentre() {
  const pts = [[-90, 0], [-40, 0], [0, 0], [30, 0], [60, 0]];
  for (let i = 1; i <= 12; i++) {
    const t = (i / 12) * Math.PI / 2;
    pts.push([60 + 18 * Math.sin(t), 18 - 18 * Math.cos(t)]);
  }
  for (let z = 30; z <= 95; z += 13) pts.push([78, z]);
  for (let i = 1; i <= 10; i++) {
    const z = 95 + i * 4;
    pts.push([78 - 8 * smoothstep(95, 135, z), z]);
  }
  for (let z = 145; z <= 250; z += 15) pts.push([70, z]);
  if (pts[pts.length - 1][1] !== 250) pts.push([70, 250]);
  return resample(pts, 1.0).pts;
}

export const ROAD = {
  millHW: 3.8,
  accessHW: 3.4,
  topHW: 4.0,
  topZ: 250,
  hillXTop: 70,
  hillXBottom: 78,
};

export class World {
  constructor(opts = {}) {
    this.hillSteepness = opts.hillSteepness ?? 1.0;
    this.build();
  }

  // ------------------------------------------------------------ hill profile
  grade(z) {
    const G = BASE_GRADE * this.hillSteepness;
    if (z < 35) return 0;
    if (z < 52) return G * smoothstep(35, 52, z);
    if (z < 210) return G;
    if (z < 238) return G * (1 - 0.5 * smoothstep(210, 238, z));
    if (z < 249) return G * 0.5 * (1 - smoothstep(238, 249, z));
    return 0;
  }

  buildProfile() {
    const z0 = -200, z1 = 400, step = 0.25;
    const n = Math.round((z1 - z0) / step) + 1;
    const tbl = new Float32Array(n);
    let h = 0;
    for (let i = 0; i < n; i++) {
      const z = z0 + i * step;
      if (i > 0) h += 0.5 * (this.grade(z - step) + this.grade(z)) * step;
      tbl[i] = h;
    }
    this._prof = { z0, step, tbl, n };
  }

  base(z) {
    const p = this._prof;
    const f = clamp((z - p.z0) / p.step, 0, p.n - 1.001);
    const i = Math.floor(f), u = f - i;
    return p.tbl[i] * (1 - u) + p.tbl[i + 1] * u;
  }

  // Signed distance to the drivable road union (negative = on road)
  sd(x, z) {
    const cell = this._sdGrid && this._sdGrid.get(Math.floor(x / 10) * 100003 + Math.floor(z / 10));
    if (this._sdGrid && !cell) return 99;
    let d = Infinity;
    for (const r of cell || this.roadPolys) {
      if (x < r.minx || x > r.maxx || z < r.minz || z > r.maxz) {
        // quick reject using bbox distance
        const bx = Math.max(r.minx - x, 0, x - r.maxx), bz = Math.max(r.minz - z, 0, z - r.maxz);
        const bd = Math.hypot(bx, bz) - r.hw;
        if (bd > d + SMOOTH_K) continue;
      }
      let best = Infinity;
      const p = r.pts;
      for (let i = 1; i < p.length; i++) {
        const sx = p[i][0] - x, sz = p[i][1] - z;
        // cheap cull per segment
        if (sx * sx + sz * sz > (best + r.seg) * (best + r.seg) && best < 50) continue;
        const dd = sdSegment(x, z, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]);
        if (dd < best) best = dd;
      }
      d = d === Infinity ? best - r.hw : smin(d, best - r.hw, SMOOTH_K);
    }
    for (const b of this.roadBoxes) {
      if (cell && b.far(x, z)) continue;
      const bd = sdBox(x, z, b);
      d = smin(d, bd, b.k ?? SMOOTH_K);
    }
    return d === Infinity ? 99 : d;
  }

  kerb(x, z) {
    const s = this.sd(x, z);
    if (s <= 0) return 0;
    if (s >= KERB_W) return KERB_H;
    return KERB_H * smoothstep(0, KERB_W, s);
  }

  height(x, z) { return this.base(z) + this.kerb(x, z); }

  // gradient of height; returns [dh/dx, dh/dz, kerbFactor 0..1]
  // gradient of height; returns [dh/dx, dh/dz, kerbFactor 0..1, kerbHeight]
  gradient(x, z) {
    const s = this.sd(x, z);
    const gz0 = this.grade(z);
    if (s <= -0.05) return [0, gz0, 0, 0];
    if (s >= KERB_W + 0.05) return [0, gz0, 1, KERB_H];
    const e = 0.03;
    const kx = (this.kerb(x + e, z) - this.kerb(x - e, z)) / (2 * e);
    const kz = (this.kerb(x, z + e) - this.kerb(x, z - e)) / (2 * e);
    const kh = s <= 0 ? 0 : KERB_H * smoothstep(0, KERB_W, s);
    return [kx, gz0 + kz, clamp(s / KERB_W, 0, 1), kh];
  }

  // statics within ~6m of a point, via a uniform grid
  buildGrid() {
    const C = 8;
    this._grid = new Map();
    const key = (i, j) => i * 100003 + j;
    for (const o of this.statics) {
      let x0, x1, z0, z1;
      if (o.kind === 'circle') { x0 = o.x - o.r; x1 = o.x + o.r; z0 = o.z - o.r; z1 = o.z + o.r; }
      else { const r = Math.hypot(o.hx, o.hz); x0 = o.cx - r; x1 = o.cx + r; z0 = o.cz - r; z1 = o.cz + r; }
      for (let i = Math.floor((x0 - 3) / C); i <= Math.floor((x1 + 3) / C); i++)
        for (let j = Math.floor((z0 - 3) / C); j <= Math.floor((z1 + 3) / C); j++) {
          const k = key(i, j);
          if (!this._grid.has(k)) this._grid.set(k, []);
          this._grid.get(k).push(o);
        }
    }
    this._gridC = C; this._gridKey = key;
  }

  staticsNear(x, z) {
    return this._grid.get(this._gridKey(Math.floor(x / this._gridC), Math.floor(z / this._gridC))) || [];
  }

  // ------------------------------------------------------------------ build
  build() {
    this.buildProfile();
    const R = rng(1977);
    const millHill = millHillCentre();
    this.millHill = millHill;
    this.millHillCum = cumulative(millHill);
    const access = [[0, -52], [0, -20], [0, 0]];
    const top = [[-45, ROAD.topZ], [0, ROAD.topZ], [70, ROAD.topZ], [145, ROAD.topZ]];
    this.access = access; this.top = top;

    const poly = (pts, hw, name) => {
      let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity, seg = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x, z] = pts[i];
        minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z);
        if (i) seg = Math.max(seg, Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]));
      }
      return { pts, hw, name, minx, maxx, minz, maxz, seg };
    };
    const coarse = (pts) => pts.filter((p, i) => i % 3 === 0 || i === pts.length - 1);
    this.roadPolys = [
      poly(coarse(millHill), ROAD.millHW, 'mill'),
      poly(access, ROAD.accessHW, 'access'),
      poly(top, ROAD.topHW, 'top'),
    ];
    this.carPark = { cx: 0, cz: -82, hx: 28, hz: 30, rot: 0 };
    this.nanDrive = { cx: 10, cz: 259.5, hx: 1.6, hz: 5.6, rot: 0, k: 0.8 };
    this.roadBoxes = [this.carPark, this.nanDrive];
    for (const b of this.roadBoxes) {
      const rr = Math.hypot(b.hx, b.hz) + 12;
      b.far = (x, z) => Math.abs(x - b.cx) > rr || Math.abs(z - b.cz) > rr;
    }
    // SDF acceleration grid: per 10m cell, the road polylines near it.
    // Cells farther than 12m from every road get no entry (sd = 99, i.e. "far off road").
    this._sdGrid = null;
    {
      const grid = new Map();
      for (let i = -12; i <= 18; i++) for (let j = -14; j <= 30; j++) {
        const cx = i * 10 + 5, cz = j * 10 + 5;
        const near = this.roadPolys.filter((r) => {
          let best = Infinity;
          for (let k = 1; k < r.pts.length; k++) best = Math.min(best, sdSegment(cx, cz, r.pts[k - 1][0], r.pts[k - 1][1], r.pts[k][0], r.pts[k][1]));
          return best - r.hw < 7.1 + 12;
        }).map((r) => {
          // keep only segments that can matter for this cell
          const pts = r.pts;
          let lo = Infinity, hi = -1;
          for (let k = 1; k < pts.length; k++) {
            const dd = sdSegment(cx, cz, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]);
            if (dd - r.hw < 7.1 + 14) { lo = Math.min(lo, k - 1); hi = Math.max(hi, k); }
          }
          return { ...r, pts: pts.slice(lo, hi + 1), minx: -1e9, maxx: 1e9, minz: -1e9, maxz: 1e9 };
        });
        const boxNear = this.roadBoxes.some((b) => sdBox(cx, cz, b) < 7.1 + 12);
        if (near.length || boxNear) grid.set(i * 100003 + j, near);
      }
      this._sdGrid = grid;
    }

    // ------------------------------------------------------------ colliders
    const statics = [];
    this.statics = statics;
    this.walls = [];
    const PAVE = 2.4;
    const addWall = (ax, az, bx, bz, kind = 'wall') => {
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.05) return;
      const rot = Math.atan2(bx - ax, bz - az); // box local z along segment
      const w = { kind: 'box', cx, cz, hx: kind === 'hedge' ? 0.45 : 0.15, hz: len / 2 + 0.02, rot, tag: kind };
      statics.push(w);
      this.walls.push(w);
    };
    // walls along an offset polyline, including only points satisfying keep()
    const wallAlong = (pts, off, keep, seed) => {
      const op = offsetPolyline(pts, off);
      const r = rng(seed);
      let run = [];
      let kind = r() < 0.5 ? 'wall' : 'hedge';
      const flush = () => {
        for (let i = 1; i < run.length; i++) addWall(run[i - 1][0], run[i - 1][1], run[i][0], run[i][1], kind);
        run = [];
      };
      let count = 0;
      for (let i = 0; i < op.length; i++) {
        const p = op[i];
        if (keep(p[0], p[1])) {
          run.push(p);
          count++;
          if (run.length >= 4) { const last = run[run.length - 1]; flush(); run = [last]; if (count % 16 === 0) kind = r() < 0.55 ? 'wall' : 'hedge'; }
        } else flush();
      }
      flush();
    };
    const mOff = ROAD.millHW + PAVE;
    // left (south of Mill / east of hill / outer bend)
    wallAlong(millHill, mOff, (x, z) => !(Math.abs(x) < ROAD.accessHW + PAVE && z < 0) && z < ROAD.topZ - ROAD.topHW - PAVE + 0.01, 11);
    // right (north of Mill / west of hill / inner bend)
    wallAlong(millHill, -mOff, (x, z) => z < ROAD.topZ - ROAD.topHW - PAVE + 0.01, 12);
    // access road
    const aOff = ROAD.accessHW + PAVE;
    addWall(aOff, -49.6, aOff, -mOff, 'wall');
    addWall(-aOff, -49.6, -aOff, -mOff, 'hedge');
    // car park perimeter
    const cp = this.carPark, cpx = cp.hx + PAVE, cpz0 = cp.cz - cp.hz - PAVE, cpz1 = cp.cz + cp.hz + PAVE;
    addWall(-cpx, cpz0, cpx, cpz0, 'wall');
    addWall(-cpx, cpz0, -cpx, cpz1, 'hedge');
    addWall(cpx, cpz0, cpx, cpz1, 'hedge');
    addWall(-cpx, cpz1, -aOff, cpz1, 'wall');
    addWall(aOff, cpz1, cpx, cpz1, 'wall');
    // Mill road west end
    addWall(-90.4, -mOff, -90.4, mOff, 'wall');
    // top road
    const tS = ROAD.topZ - ROAD.topHW - PAVE, tN = ROAD.topZ + ROAD.topHW + PAVE;
    const hx = ROAD.hillXTop;
    for (let x = -45; x < hx - mOff - 0.01; x += 6) addWall(x, tS, Math.min(x + 6, hx - mOff), tS, 'wall');
    for (let x = hx + mOff; x < 145; x += 6) addWall(x, tS, Math.min(x + 6, 145), tS, 'hedge');
    const nd = this.nanDrive;
    for (let x = -45; x < nd.cx - nd.hx - 0.01; x += 6) addWall(x, tN, Math.min(x + 6, nd.cx - nd.hx), tN, x < -20 ? 'hedge' : 'wall');
    for (let x = nd.cx + nd.hx; x < 145; x += 6) addWall(x, tN, Math.min(x + 6, 145), tN, x > 90 ? 'hedge' : 'wall');
    addWall(-45.4, tS, -45.4, tN, 'wall');
    addWall(145.4, tS, 145.4, tN, 'wall');
    // Nan's driveway sides + garage door
    const dz1 = nd.cz + nd.hz;
    addWall(nd.cx - nd.hx - 0.15, tN, nd.cx - nd.hx - 0.15, dz1, 'wall');
    addWall(nd.cx + nd.hx + 0.15, tN, nd.cx + nd.hx + 0.15, dz1, 'wall');
    statics.push({ kind: 'box', cx: nd.cx, cz: dz1 + 0.2, hx: nd.hx + 0.3, hz: 0.2, rot: 0, tag: 'garage' });

    // ------------------------------------------------------------ parked cars
    const COLS = [0x7d8a8f, 0x8c2f2b, 0x2e4a6b, 0xc9c3b4, 0x3d5c45, 0x5a5550, 0xb59a52, 0x1f2a33, 0x9aa3a6, 0x6b3f5e];
    this.parked = [];
    const park = (x, z, rot, tag = 'parked', color) => {
      const c = { x, z, rot, color: color ?? COLS[Math.floor(R() * COLS.length)], tag };
      this.parked.push(c);
      statics.push({ kind: 'box', cx: x, cz: z, hx: 0.84, hz: 1.95, rot, tag: 'car' });
      return c;
    };
    const kerbOff = (hw) => hw - 0.15 - 0.84;
    // car park bays (facing +-x)
    for (const z of [-60, -66, -78, -96, -102]) park(-24, z, Math.PI / 2);
    for (const z of [-63, -84, -90, -105]) park(24, z, -Math.PI / 2);
    // Mill road
    const mk = kerbOff(ROAD.millHW);
    for (const x of [-60, -42, -20, 22]) park(x, mk, Math.PI / 2); // north side (opposite)
    park(36, -mk, Math.PI / 2); // our side, forces a small swerve
    // hill: give-way narrowing on our (east) side
    this.giveWayCars = [];
    for (const z of [156, 162.6, 169.2, 175.8, 182.4]) this.giveWayCars.push(park(ROAD.hillXTop + mk, z, 0));
    // top road: parallel parking space on the north side
    const tk = ROAD.topZ + kerbOff(ROAD.topHW);
    const spaceGap = 6.8;
    const aX = 47.0;
    const bX = aX - 1.95 - spaceGap - 1.95;
    this.spaceCarA = park(aX, tk, -Math.PI / 2, 'spaceA', 0xc9c3b4);
    this.spaceCarB = park(bX, tk, -Math.PI / 2, 'spaceB', 0x2e4a6b);
    for (const x of [57.0, 26.5, -12, -19.5, -33]) park(x, tk, -Math.PI / 2);
    const ts = ROAD.topZ - kerbOff(ROAD.topHW);
    for (const x of [21, -1, -27]) park(x, ts, Math.PI / 2);
    this.parkSpace = {
      cx: (aX - 1.95 + bX + 1.95) / 2,
      cz: ROAD.topZ + ROAD.topHW - 0.9,
      len: spaceGap,
      kerbZ: ROAD.topZ + ROAD.topHW,
      x0: bX + 1.95, x1: aX - 1.95,
    };

    // ------------------------------------------------------------ lamp posts
    this.lamps = [];
    const lamp = (x, z) => { this.lamps.push({ x, z }); statics.push({ kind: 'circle', x, z, r: 0.13, tag: 'lamp' }); };
    {
      const left = offsetPolyline(millHill, ROAD.millHW + 0.55);
      const right = offsetPolyline(millHill, -(ROAD.millHW + 0.55));
      for (let i = 10; i < millHill.length - 8; i += 27) {
        const p = (i / 27) % 2 < 1 ? left[i] : right[i];
        if (Math.abs(p[0]) < 7 && p[1] < 6) continue;
        if (p[1] > 240) continue;
        lamp(p[0], p[1]);
      }
      for (let x = -38; x < 140; x += 30) { if (Math.abs(x - 70) > 8 && Math.abs(x - 10) > 4 && Math.abs(x - this.parkSpace.cx) > 5) lamp(x, ROAD.topZ + ROAD.topHW + 0.55); }
      lamp(5.8 + 0.0 - 2.4 + 0.55, -30);
    }

    // ------------------------------------------------------------ roadworks + lights
    const hb = ROAD.hillXBottom;
    this.lights = {
      stopZ: 61,
      laneX0: hb, laneX1: hb + ROAD.millHW,
      pole: { x: hb + ROAD.millHW + 0.7, z: 60.4 },
      pole2: { x: hb - ROAD.millHW - 0.7, z: 92.5 },
    };
    statics.push({ kind: 'circle', x: this.lights.pole.x, z: this.lights.pole.z, r: 0.12, tag: 'pole' });
    statics.push({ kind: 'circle', x: this.lights.pole2.x, z: this.lights.pole2.z, r: 0.12, tag: 'pole' });
    this.roadworks = { cx: hb + 1.95 + 0.25, cz: 81, hx: 1.65, hz: 9 };
    statics.push({ kind: 'box', ...this.roadworks, rot: 0, tag: 'barrier' });
    this.cones = [];
    for (let z = 71.5; z <= 91.5; z += 2.5) this.cones.push({ x: hb + 0.35, z });
    for (const c of this.cones) statics.push({ kind: 'circle', x: c.x, z: c.z, r: 0.18, tag: 'cone' });
    // training cones in the car park (off to the side)
    for (let i = 0; i < 5; i++) {
      const c = { x: -12 + (i % 2) * 1.5, z: -100 + i * 5 };
      this.cones.push(c);
      statics.push({ kind: 'circle', x: c.x, z: c.z, r: 0.18, tag: 'cone' });
    }

    this.giveWay = { stopZ: 150, laneX0: ROAD.hillXTop, laneX1: ROAD.hillXTop + ROAD.millHW, sign: { x: ROAD.hillXTop + ROAD.millHW + 0.7, z: 149.4 } };
    statics.push({ kind: 'circle', x: this.giveWay.sign.x, z: this.giveWay.sign.z, r: 0.08, tag: 'sign' });
    this.topJunction = { stopZ: ROAD.topZ - ROAD.topHW - 0.35, laneX0: ROAD.hillXTop, laneX1: ROAD.hillXTop + ROAD.millHW };
    this.junction1 = { stopZ: -ROAD.millHW - 0.35, laneX0: 0, laneX1: ROAD.accessHW };
    this.yardLine = { z: -72, x0: -6, x1: 6 };

    // ------------------------------------------------------------ houses
    this.houses = [];
    this.buildHouses(R);

    // ------------------------------------------------------------ AI lanes
    const laneOff = (x, z) => {
      // swerves for obstructions in the forward lane
      if (z > 69 && z < 93 && x > 74) return -1.9 - 0.15; // roadworks: oncoming lane
      if (z > 151 && z < 187 && x > 66) return -0.35; // parked cars at give-way
      return 1.9;
    };
    {
      const base = resample(millHill.filter((p) => p[1] < ROAD.topZ - ROAD.topHW - 1), 1).pts;
      const raw = base.map((p, i) => {
        const a = base[Math.max(0, i - 1)], b = base[Math.min(base.length - 1, i + 1)];
        let tx = b[0] - a[0], tz = b[1] - a[1];
        const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        let o = laneOff(p[0], p[1]);
        if (p[0] > 32 && p[0] < 41 && p[1] < 3) o = 0.2; // parked car on Mill road
        return [p[0] + tz * o, p[1] - tx * o, o];
      });
      // smooth offsets
      const sm = raw.map((p, i) => {
        let sx = 0, sz = 0, n = 0;
        for (let k = -6; k <= 6; k++) { const q = raw[clamp(i + k, 0, raw.length - 1)]; sx += q[0]; sz += q[1]; n++; }
        return [sx / n, sz / n];
      });
      // turn left at the top onto Top Road heading +x
      const end = sm[sm.length - 1];
      const lane = sm.filter((p) => p[0] > -60);
      const tz = ROAD.topZ - 1.9;
      for (let i = 1; i <= 8; i++) {
        const t = (i / 8) * Math.PI / 2;
        lane.push([end[0] + 6 - 6 * Math.cos(t), end[1] + (tz - end[1]) * Math.sin(t)]);
      }
      for (let x = end[0] + 8; x <= 150; x += 4) lane.push([x, tz]);
      this.followLane = resample(lane, 1).pts;
      this.followLaneCum = cumulative(this.followLane);
    }
    {
      // oncoming (downhill) lane, from the top down to Mill road heading -x
      const rev = millHill.slice().reverse().filter((p) => p[1] < ROAD.topZ - ROAD.topHW - 2);
      const lane = offsetPolyline(rev, 1.9 + 0.2);
      this.oncomingLane = resample(lane.filter((p) => p[0] > -80), 1).pts;
      this.oncomingLaneCum = cumulative(this.oncomingLane);
    }
    {
      // top road westbound (for the car that queues behind you while parking)
      const pts = [];
      for (let x = 150; x >= -40; x -= 2) pts.push([x, ROAD.topZ + 1.0]);
      this.topWestLane = pts;
      this.topWestLaneCum = cumulative(pts);
    }

    // ------------------------------------------------------------ poses
    this.poses = {
      start: { x: 0, z: -100, psi: 0 },
      hillBottom: { x: ROAD.hillXBottom + 1.9, z: 32, psi: 0 },
      parking: { x: 60, z: ROAD.topZ + 1.4, psi: -Math.PI / 2 },
    };
    this.bounds = { x0: -95, x1: 150, z0: -118, z1: 270 };
    this.buildGrid();
    this.pedestrian = { x: this.parkSpace.cx - 0.5, z: ROAD.topZ + ROAD.topHW + 1.2 };
  }

  buildHouses(R) {
    const houses = this.houses;
    const tryHouse = (x, z, rot, w, d, opts = {}) => {
      // footprint must stay clear of roads/pavements
      const c = Math.cos(rot), s = Math.sin(rot);
      for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, -d / 2], [0, d / 2]]) {
        const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
        if (this.sd(px, pz) < 5.5) return false;
        if (this.sdBoxDist(px, pz, this.nanDrive) < 1.5 && !opts.nan) return false;
      }
      for (const h of houses) if (Math.hypot(h.x - x, h.z - z) < (h.w + w) / 2 + 0.2) return false;
      houses.push({ x, z, rot, w, d, ...opts, seed: Math.floor(R() * 1e6) });
      return true;
    };
    const along = (pts, side) => {
      const off = offsetPolyline(pts, side * (ROAD.millHW + 2.4 + 4.0 + 4.5));
      const cum = cumulative(off);
      let s = 3;
      while (s < cum[cum.length - 1] - 3) {
        let i = 1;
        while (i < cum.length - 1 && cum[i] < s) i++;
        const a = off[i - 1], b = off[i];
        const tx = b[0] - a[0], tz = b[1] - a[1];
        const heading = Math.atan2(tx, tz);
        // house front faces the road: road is on the -side side
        const rot = heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        const w = 6 + Math.floor(R() * 3);
        tryHouse(a[0], a[1], rot, w, 8.5);
        s += w + 0.3 + (R() < 0.15 ? 3 : 0);
      }
    };
    along(this.millHill, 1);
    along(this.millHill, -1);
    along(this.access, 1);
    along(this.access, -1);
    // top road: north side faces south (rot so front faces -z)
    const tN = ROAD.topZ + ROAD.topHW + 2.4 + 4.0 + 4.5;
    const tS = ROAD.topZ - ROAD.topHW - 2.4 - 4.0 - 4.5;
    // Nan's house first (with garage beside the driveway)
    const nd = this.nanDrive;
    this.nanHouse = { x: nd.cx + nd.hx + 4.8, z: tN + 1.0, rot: Math.PI, w: 7.5, d: 8.5, nan: true };
    houses.push({ ...this.nanHouse, seed: 4242 });
    for (let x = -42; x < 142; x += 7.2) tryHouse(x, tN, Math.PI, 6.5 + Math.floor(R() * 2), 8.5);
    for (let x = -42; x < 142; x += 7.2) tryHouse(x, tS, 0, 6.5 + Math.floor(R() * 2), 8.5);
    // a row of shops/garages near the car park
    for (let x = -26; x <= 26; x += 8) tryHouse(x, -122, 0, 7, 8);
  }

  sdBoxDist(x, z, b) { return sdBox(x, z, b); }

  // Progress along the follower lane (used for AI + traffic pressure)
  laneProgress(x, z) {
    return projectOnPolyline(this.followLane, this.followLaneCum, x, z);
  }
}
