import { BALANCE } from '../../data/balance.js';
import { BUILDINGS } from '../../data/buildings.js';

// Lightweight navigation: no path graph. Agents steer straight at targets,
// get pushed out of solid obstacles, and slide round them with a tangent bias.
// The yard is mostly open, so this is enough and costs almost nothing.

const CELL = 4;

export class ObstacleGrid {
  constructor() {
    this.half = BALANCE.worldHalf + 8;
    this.n = Math.ceil((this.half * 2) / CELL);
    this.cells = new Array(this.n * this.n);
    this.rects = [];
    this.circles = [];
    this.version = -1;
  }

  rebuild(state) {
    this.rects.length = 0;
    this.circles.length = 0;
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = null;
    for (const b of state.buildings) {
      const def = BUILDINGS[b.type];
      if (!def.solid || !b.built) continue;
      const inset = 0.15;
      this.rects.push({ x0: b.x - b.w / 2 + inset, x1: b.x + b.w / 2 - inset, z0: b.z - b.d / 2 + inset, z1: b.z + b.d / 2 - inset });
    }
    for (const n of state.nodes) {
      this.circles.push({ x: n.x, z: n.z, r: BALANCE.nodes[n.type].radius * n.s });
    }
    this.rects.forEach((r, i) => this._insert(r.x0, r.z0, r.x1, r.z1, i));
    this.circles.forEach((c, i) => this._insert(c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r, -1 - i));
  }

  _cellIndex(x, z) {
    const ix = Math.floor((x + this.half) / CELL);
    const iz = Math.floor((z + this.half) / CELL);
    if (ix < 0 || iz < 0 || ix >= this.n || iz >= this.n) return -1;
    return iz * this.n + ix;
  }

  _insert(x0, z0, x1, z1, ref) {
    const pad = 1.2; // covers the largest agent radius
    const clamp = (v) => Math.max(0, Math.min(this.n - 1, v));
    const ix0 = clamp(Math.floor((x0 - pad + this.half) / CELL)), ix1 = clamp(Math.floor((x1 + pad + this.half) / CELL));
    const iz0 = clamp(Math.floor((z0 - pad + this.half) / CELL)), iz1 = clamp(Math.floor((z1 + pad + this.half) / CELL));
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const i = iz * this.n + ix;
        if (!this.cells[i]) this.cells[i] = [];
        this.cells[i].push(ref);
      }
    }
  }

  // Push a circle (x,z,r) out of obstacles. Writes result into `out`.
  // out.hit is true if any push happened; out.nx/nz is the last push normal.
  collide(x, z, r, out) {
    out.x = x; out.z = z; out.hit = false; out.nx = 0; out.nz = 0;
    const i = this._cellIndex(x, z);
    const list = i >= 0 ? this.cells[i] : null;
    if (list) {
      for (let k = 0; k < list.length; k++) {
        const ref = list[k];
        if (ref >= 0) {
          const rc = this.rects[ref];
          const px = Math.max(rc.x0, Math.min(out.x, rc.x1));
          const pz = Math.max(rc.z0, Math.min(out.z, rc.z1));
          let dx = out.x - px, dz = out.z - pz;
          const d2 = dx * dx + dz * dz;
          if (d2 < r * r) {
            if (d2 < 1e-6) {
              // centre inside rect: push out along the shallowest axis
              const l = out.x - rc.x0, rr = rc.x1 - out.x, t = out.z - rc.z0, bt = rc.z1 - out.z;
              const m = Math.min(l, rr, t, bt);
              if (m === l) { out.x = rc.x0 - r; out.nx = -1; out.nz = 0; }
              else if (m === rr) { out.x = rc.x1 + r; out.nx = 1; out.nz = 0; }
              else if (m === t) { out.z = rc.z0 - r; out.nx = 0; out.nz = -1; }
              else { out.z = rc.z1 + r; out.nx = 0; out.nz = 1; }
            } else {
              const d = Math.sqrt(d2);
              dx /= d; dz /= d;
              out.x = px + dx * r; out.z = pz + dz * r;
              out.nx = dx; out.nz = dz;
            }
            out.hit = true;
          }
        } else {
          const c = this.circles[-1 - ref];
          let dx = out.x - c.x, dz = out.z - c.z;
          const rr = c.r + r;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 0.001;
            dx /= d; dz /= d;
            out.x = c.x + dx * rr; out.z = c.z + dz * rr;
            out.nx = dx; out.nz = dz;
            out.hit = true;
          }
        }
      }
    }
    const H = BALANCE.worldHalf + 3;
    if (out.x < -H) out.x = -H; else if (out.x > H) out.x = H;
    if (out.z < -H) out.z = -H; else if (out.z > H) out.z = H;
    return out;
  }

  // Is a straight line blocked? Cheap sampled check (used for placement & bots).
  pointBlocked(x, z, r) {
    const o = { x: 0, z: 0, hit: false, nx: 0, nz: 0 };
    this.collide(x, z, r, o);
    return o.hit;
  }
}

// Uniform spatial hash for crowd separation. Rebuilt every tick: O(n).
export class CrowdHash {
  constructor(cell = 1.2) {
    this.cell = cell;
    this.map = new Map();
    this.pool = [];
  }
  clear() {
    for (const arr of this.map.values()) { arr.length = 0; this.pool.push(arr); }
    this.map.clear();
  }
  key(ix, iz) { return (ix + 512) * 1024 + (iz + 512); }
  insert(idx, x, z) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let arr = this.map.get(k);
    if (!arr) { arr = this.pool.pop() || []; this.map.set(k, arr); }
    arr.push(idx);
  }
  // Calls fn(index) for every item in the 3x3 neighbourhood.
  near(x, z, fn) {
    const ix = Math.floor(x / this.cell), iz = Math.floor(z / this.cell);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const arr = this.map.get(this.key(ix + dx, iz + dz));
        if (arr) for (let i = 0; i < arr.length; i++) fn(arr[i]);
      }
    }
  }
}
