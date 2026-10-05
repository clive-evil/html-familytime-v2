// Scripted, polite AI traffic. Kinematic cars that follow fixed lanes, never
// push into the player, and only beep when you've genuinely been sat there.

import { clamp, approach, pointAt, projectOnPolyline } from '../sim/math.js';
import { obbObb } from '../sim/collision.js';
import { CAR } from '../sim/params.js';

let NEXT_ID = 1;

export class AICar {
  constructor(lane, cum, s, opts = {}) {
    this.id = NEXT_ID++;
    this.lane = lane; this.cum = cum;
    this.s = s; this.v = opts.v ?? 0;
    this.cruise = opts.cruise ?? 8;
    this.color = opts.color ?? 0x8a8f92;
    this.role = opts.role ?? 'follower';
    this.done = false;
    this.hornCount = 0; this.blocked = 0; this.nextHorn = opts.firstHorn ?? 6;
    this.hold = false; // forced stop (e.g. queueing)
    this.place();
  }
  place() {
    const p = pointAt(this.lane, this.cum, this.s);
    this.x = p.x; this.z = p.z; this.psi = p.heading;
    this.vx = Math.sin(this.psi) * this.v; this.vz = Math.cos(this.psi) * this.v;
    this.collider = { kind: 'box', cx: this.x, cz: this.z, hx: 0.84, hz: 1.95, rot: this.psi, tag: 'aicar', vx: this.vx, vz: this.vz };
  }
  // Is the player's car within our path ahead?
  obstructed(car) {
    const look = 1.2 + this.v * 1.1;
    const fx = Math.sin(this.psi), fz = Math.cos(this.psi);
    const box = { cx: this.x + fx * (1.95 + look / 2), cz: this.z + fz * (1.95 + look / 2), hx: 1.0, hz: look / 2 + 0.2, rot: this.psi };
    const pc = { cx: car.x, cz: car.z, hx: CAR.halfWidth, hz: CAR.halfLen, rot: car.psi };
    return !!obbObb(box, pc);
  }
  update(dt, car, targetSpeed) {
    let vt = Math.min(targetSpeed, this.cruise);
    if (this.hold || this.obstructed(car)) vt = 0;
    const accel = vt > this.v ? 2.2 : 5.5;
    this.v = approach(this.v, Math.max(0, vt), accel * dt);
    this.s += this.v * dt;
    if (this.s >= this.cum[this.cum.length - 1] - 0.5) this.done = true;
    this.place();
  }
}

export class Traffic {
  constructor(world) {
    this.world = world;
    this.reset();
  }
  reset() {
    this.cars = [];
    this.lights = 'red';
    this.oncoming = null;
    this.oncomingTriggered = false;
    this.follower = null; this.followerSpawned = false;
    this.queue = null; this.queueSpawned = false;
    this.events = [];
    this.ped = { ...this.world.pedestrian, walking: false, heading: Math.PI, visible: true };
  }
  colliders() { return this.cars.map((c) => c.collider); }

  triggerOncoming() {
    if (this.oncomingTriggered) return;
    this.oncomingTriggered = true;
    const w = this.world;
    const s = projectOnPolyline(w.oncomingLane, w.oncomingLaneCum, 70 - 2, 236).s;
    this.oncoming = new AICar(w.oncomingLane, w.oncomingLaneCum, s, { v: 6.5, cruise: 6.5, color: 0x3b4f63, role: 'oncoming' });
    this.cars.push(this.oncoming);
  }

  // progress of the oncoming car: its z coordinate
  oncomingPassed(z) { return !this.oncoming || this.oncoming.done || this.oncoming.z < z; }

  update(dt, car, ctx) {
    const w = this.world;
    const light = ctx.settings.traffic === 'light';
    this.events.length = 0;
    // ---------- follower up the hill
    if (light && ctx.stepId >= ctx.ids.FOLLOW && ctx.stepId < ctx.ids.TOP_TURN && !this.followerSpawned) {
      const pr = w.laneProgress(car.x, car.z);
      if (pr.dist < 8 && pr.s > 40) {
        this.follower = new AICar(w.followLane, w.followLaneCum, Math.max(0, pr.s - 28), { v: 6, cruise: 9, color: 0xb9b3a4 });
        this.cars.push(this.follower);
        this.followerSpawned = true;
      }
    }
    if (!light && this.follower) { this.cars = this.cars.filter((c) => c !== this.follower); this.follower = null; }
    if (this.follower) {
      const f = this.follower;
      const pr = w.laneProgress(car.x, car.z);
      const freeAfter = w.followLaneCum[w.followLane.findIndex((p) => p[1] > 236)] || 1e9;
      let vt = f.cruise;
      let waiting = false;
      if (f.s < freeAfter && pr.dist < 9 && pr.s > f.s - 2) {
        const gap = pr.s - f.s - 3.9;
        vt = clamp((gap - 6) * 0.7, 0, f.cruise);
        waiting = gap < 12;
      }
      f.update(dt, car, vt);
      this.honkLogic(dt, f, car, ctx, waiting && f.v < 0.2);
    }
    // ---------- queue behind you while you parallel park
    if (light && ctx.stepId === ctx.ids.PARALLEL && !this.queueSpawned && car.x < 64 && car.z > 244) {
      this.queue = new AICar(w.topWestLane, w.topWestLaneCum, 0, { v: 7, cruise: 7, color: 0x6e2a2a, firstHorn: 9 });
      this.cars.push(this.queue);
      this.queueSpawned = true;
    }
    if (this.queue) {
      const q = this.queue;
      // releases when you've finished parking or are clear of its lane
      const clear = ctx.stepId > ctx.ids.PARALLEL;
      let vt = q.cruise;
      let waiting = false;
      if (!clear && car.x < q.x && q.x - car.x < 18 && car.z > 248) {
        // queue a polite distance behind
        const gap = q.x - car.x - 3.9;
        vt = clamp((gap - 5) * 0.7, 0, q.cruise);
        waiting = gap < 10;
      }
      q.update(dt, car, vt);
      this.honkLogic(dt, q, car, ctx, waiting && q.v < 0.2);
    }
    // ---------- oncoming car at the give-way
    if (this.oncoming) this.oncoming.update(dt, car, this.oncoming.cruise);
    for (const c of this.cars) if (c.done) { if (c === this.follower) this.follower = null; if (c === this.queue) this.queue = null; }
    this.cars = this.cars.filter((c) => !c.done);

    // ---------- pedestrian
    const p = this.ped;
    if (ctx.stepId > ctx.ids.PARALLEL && !p.walking) p.walking = true;
    if (p.walking) {
      p.x -= 1.25 * dt; p.heading = -Math.PI / 2; p.t = (p.t || 0) + dt;
      if (p.t > 25) p.visible = false;
    } else {
      p.heading = Math.atan2(car.x - p.x, car.z - p.z);
    }
    p.visible = p.visible && ctx.settings.pedestrian;
  }

  honkLogic(dt, ai, car, ctx, waitingBehind) {
    const legit = ctx.legitWait;
    if (waitingBehind && !legit && car.speed < 0.4) ai.blocked += dt; else if (car.speed > 1.5) { ai.blocked = 0; ai.nextHorn = Math.max(ai.nextHorn, 6); }
    // you rolling back towards it: one immediate short toot
    const dist = Math.hypot(ai.x - car.x, ai.z - car.z);
    if (dist < 6.2 && car.fwdSpeed < -0.4 && !ai.rollToot) { ai.rollToot = true; this.events.push({ type: 'horn', len: 0.25 }); }
    if (car.fwdSpeed > 0.5) ai.rollToot = false;
    if (ai.blocked > ai.nextHorn && ai.hornCount < 3) {
      ai.hornCount++;
      ai.nextHorn = ai.blocked + 9;
      this.events.push({ type: 'horn', len: ai.hornCount === 1 ? 0.35 : 0.9 });
    }
  }
}
