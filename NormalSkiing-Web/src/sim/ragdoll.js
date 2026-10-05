// Verlet ragdoll for crashes: particles + distance constraints, colliding
// with the height field and tree trunks. Keeps the skier's momentum so a
// crash at speed tumbles a long way down the hill. Skis can twist, catch and
// detach on big impacts.

export const RD = {
  head: 0, chest: 1, pelvis: 2, lKnee: 3, rKnee: 4, lFoot: 5, rFoot: 6, lHand: 7, rHand: 8,
  lTip: 9, lTail: 10, rTip: 11, rTail: 12,
};

const RADIUS = [0.14, 0.18, 0.16, 0.09, 0.09, 0.08, 0.08, 0.06, 0.06, 0.03, 0.03, 0.03, 0.03];

export class Ragdoll {
  constructor() {
    this.n = 13;
    this.x = new Float32Array(this.n * 3);
    this.px = new Float32Array(this.n * 3);
    this.cons = [];
    this.skiAttached = [true, true];
    this.time = 0;
    this.restTime = 0;
    this.maxImpact = 0;
    this.events = [];
  }

  // joints: array of {x,y,z} in RD order; vel: {x,y,z}; spin adds tumble
  init(joints, vel, spin = { x: 0, y: 0, z: 0 }, dt = 1 / 240) {
    const c = joints[RD.pelvis];
    for (let i = 0; i < this.n; i++) {
      const j = joints[i];
      // velocity = linear + spin x r
      const rx = j.x - c.x;
      const ry = j.y - c.y;
      const rz = j.z - c.z;
      const vx = vel.x + spin.y * rz - spin.z * ry;
      const vy = vel.y + spin.z * rx - spin.x * rz;
      const vz = vel.z + spin.x * ry - spin.y * rx;
      this.x[i * 3] = j.x;
      this.x[i * 3 + 1] = j.y;
      this.x[i * 3 + 2] = j.z;
      this.px[i * 3] = j.x - vx * dt;
      this.px[i * 3 + 1] = j.y - vy * dt;
      this.px[i * 3 + 2] = j.z - vz * dt;
    }
    this.cons = [];
    const L = (a, b, stiff = 1, tag) => {
      const d = Math.hypot(
        joints[a].x - joints[b].x, joints[a].y - joints[b].y, joints[a].z - joints[b].z,
      );
      this.cons.push({ a, b, d, stiff, tag, min: 0 });
    };
    L(RD.head, RD.chest);
    L(RD.chest, RD.pelvis);
    L(RD.head, RD.pelvis, 0.6);
    L(RD.pelvis, RD.lKnee);
    L(RD.pelvis, RD.rKnee);
    L(RD.lKnee, RD.lFoot);
    L(RD.rKnee, RD.rFoot);
    L(RD.chest, RD.lHand, 0.5);
    L(RD.chest, RD.rHand, 0.5);
    L(RD.lKnee, RD.rKnee, 0.15);
    L(RD.chest, RD.lKnee, 0.12);
    L(RD.chest, RD.rKnee, 0.12);
    // skis
    for (const [foot, tip, tail, side] of [[RD.lFoot, RD.lTip, RD.lTail, 0], [RD.rFoot, RD.rTip, RD.rTail, 1]]) {
      L(tip, tail, 1, 'ski' + side);
      L(foot, tip, 1, 'ski' + side);
      L(foot, tail, 1, 'ski' + side);
    }
    this.skiAttached = [true, true];
    this.time = 0;
    this.restTime = 0;
    this.maxImpact = 0;
  }

  get(i) {
    return { x: this.x[i * 3], y: this.x[i * 3 + 1], z: this.x[i * 3 + 2] };
  }

  center() {
    return this.get(RD.pelvis);
  }

  velocity() {
    const i = RD.pelvis * 3;
    return {
      x: (this.x[i] - this.px[i]) * 240,
      y: (this.x[i + 1] - this.px[i + 1]) * 240,
      z: (this.x[i + 2] - this.px[i + 2]) * 240,
    };
  }

  detachSki(side) {
    if (!this.skiAttached[side]) return;
    this.skiAttached[side] = false;
    this.cons = this.cons.filter((c) => !(c.tag === 'ski' + side && (c.a !== RD.lTip && c.a !== RD.rTip)));
    // keep tip-tail so the ski stays a ski
    this.events.push({ type: 'skiOff', side });
  }

  step(world, dt) {
    this.time += dt;
    const g = -9.81;
    const x = this.x;
    const px = this.px;
    let moving = 0;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      const vx = (x[k] - px[k]) * 0.999;
      const vy = (x[k + 1] - px[k + 1]) * 0.999;
      const vz = (x[k + 2] - px[k + 2]) * 0.999;
      px[k] = x[k];
      px[k + 1] = x[k + 1];
      px[k + 2] = x[k + 2];
      x[k] += vx;
      x[k + 1] += vy + g * dt * dt;
      x[k + 2] += vz;
      moving += vx * vx + vy * vy + vz * vz;
    }
    for (let it = 0; it < 6; it++) {
      for (const c of this.cons) {
        const a = c.a * 3;
        const b = c.b * 3;
        const dx = x[b] - x[a];
        const dy = x[b + 1] - x[a + 1];
        const dz = x[b + 2] - x[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = ((d - c.d) / d) * 0.5 * c.stiff;
        x[a] += dx * diff;
        x[a + 1] += dy * diff;
        x[a + 2] += dz * diff;
        x[b] -= dx * diff;
        x[b + 1] -= dy * diff;
        x[b + 2] -= dz * diff;
      }
      this._collide(world, it === 5);
    }
    const speed = Math.sqrt(moving / this.n) / dt;
    if (speed < 0.9) this.restTime += dt;
    else this.restTime = 0;
    this.speed = speed;
  }

  _collide(world, last) {
    const x = this.x;
    const px = this.px;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      const r = RADIUS[i];
      const h = world.height(x[k], x[k + 2]);
      if (x[k + 1] < h + r) {
        const n = world.normal(x[k], x[k + 2], 0.4);
        const pen = h + r - x[k + 1];
        // velocity before correction
        const vx = x[k] - px[k];
        const vy = x[k + 1] - px[k + 1];
        const vz = x[k + 2] - px[k + 2];
        const vn = vx * n.x + vy * n.y + vz * n.z;
        x[k + 1] += pen;
        if (last) {
          const impact = -vn * 240;
          if (impact > this.maxImpact) this.maxImpact = impact;
          if (impact > 9 && i >= RD.lTip && this.skiAttached[i < RD.rTip ? 0 : 1] && this.time > 0.05) {
            this.detachSki(i < RD.rTip ? 0 : 1);
          }
          if (impact > 4) this.events.push({ type: 'thump', impact, i });
          // friction: snow is slippery, bodies are not
          const surf = world.surface(x[k], x[k + 2], h);
          const isSki = i >= RD.lTip;
          const fr = isSki ? 0.02 : (surf.water ? 0.4 : 0.12 + (surf.mu || 0));
          const tvx = vx - n.x * vn;
          const tvy = vy - n.y * vn;
          const tvz = vz - n.z * vn;
          const bounce = vn < 0 ? -vn * 0.25 : 0;
          px[k] = x[k] - tvx * (1 - fr) - n.x * bounce;
          px[k + 1] = x[k + 1] - tvy * (1 - fr) - n.y * bounce;
          px[k + 2] = x[k + 2] - tvz * (1 - fr) - n.z * bounce;
        }
      }
      // trees
      const trees = world.treesNear(x[k + 2]);
      for (const t of trees) {
        if (t.dead) continue;
        const R = t.r + r;
        const dx = x[k] - t.x;
        const dz = x[k + 2] - t.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < R * R && x[k + 1] < (t.baseY ?? -1e9) + t.h) {
          const d = Math.sqrt(d2) || 1e-4;
          x[k] = t.x + (dx / d) * R;
          x[k + 2] = t.z + (dz / d) * R;
        }
      }
    }
  }
}
