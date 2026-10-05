// SkierSim: the whole skiing model. Pure JS, deterministic, no rendering.
//
// Body model ("spring leg"): the hip/centre of mass is a point mass. The skis
// are connected to it by a leg actuator of length L in [legMin, legMax].
// The mouse sets a TARGET leg length (posture). The leg pushes on the snow
// with F = weight + k(Lt - L) - c*Ldot, limited by leg strength. So:
//   * extending fast = big force = body accelerates away from the snow
//   * if the snow falls away at the lip during that push -> pop
//   * extending early = the pop is spent before the lip (small hop)
//   * extending late = feet already left -> nothing to push against
//   * landing with stiff, locked legs = spring returns energy = bounce
//   * landing on bent, ready legs = high damping = absorption
//   * running out of leg travel = bottom-out impulse = balance hit / crash
// Balance is a separate 2D (fore/aft, lateral) unstable pendulum that impacts
// and skids kick, and that mouse MOVEMENT corrects.

import {
  clamp, lerp, approach, wrapAngle, dot, cross, norm, v3, valueNoise,
} from './math.js';
import { SURF } from '../world/world.js';

const HIST = 512;

export function legFrac(py, nf) {
  return py >= 0 ? nf + (1 - nf) * py : nf * (1 + py);
}

// Landing readiness from posture: knees bent and not bottomed = ready.
export function readiness(py) {
  if (py > -0.05) return clamp(1 - (py + 0.05) / 0.6, 0.15, 1);
  if (py < -0.8) return clamp(1 - (-0.8 - py) / 0.2 * 0.5, 0.5, 1);
  return 1;
}

export class Skier {
  constructor(tune) {
    this.T = tune;
    this.hist = {
      t: new Float32Array(HIST),
      L: new Float32Array(HIST),
      Lt: new Float32Array(HIST),
      Ldot: new Float32Array(HIST),
      F: new Float32Array(HIST),
      g: new Uint8Array(HIST),
      nx: new Float32Array(HIST),
      ny: new Float32Array(HIST),
      nz: new Float32Array(HIST),
      i: 0,
      n: 0,
    };
    this.out = [];
    this.reset(0, 0, 0, 0);
  }

  reset(x, y, z, heading = 0) {
    const T = this.T;
    this.p = v3(x, y, z);
    this.v = v3(0, 0, 0);
    this.heading = heading;
    this.yawRate = 0;
    this.L = T.legMin + (T.legMax - T.legMin) * T.legNeutralFrac;
    this.Lt = this.L;
    this.Ldot = 0;
    this.grounded = true;
    this.pitch = 0;
    this.pitchVel = 0;
    this.roll = 0;
    this.rollVel = 0;
    this.groundPitch = 0;
    this.balF = 0;
    this.balFv = 0;
    this.balL = 0;
    this.balLv = 0;
    this.edge = 0;
    this.lean = 0;
    this.post = { x: 0, y: 0 };
    this.pyAvg = 0;
    this.pxAvg = 0;
    this.tuck = 0;
    this.brake = 0;
    this.time = 0;
    this.airTime = 0;
    this.groundTime = 1;
    this.n = v3(0, 1, 0);
    this.surf = SURF.snow;
    this.F = 0;
    this.load = 1;
    this.skid = 0;
    this.turnRate = 0;
    this.crashed = null;
    this.takeoff = null;
    this.landing = null;
    this.lastJump = null;
    this.impactG = 0;
    this.bottomDV = 0;
    this.maxBal = 0;
    this.hist.n = 0;
    this.out.length = 0;
    this.speed = 0;
    this.slopeDeg = 0;
    this.wobble = 0;
    this.LtSlow = this.L;
    this.popAcc = 0;
    this.prevLt = this.L;
    this.ext = { active: false, start: -9, end: -9, amount: 0, from: this.L };
  }

  // Place skier standing on the ground at x,z.
  place(world, x, z, heading = 0) {
    const s = world.sample(x, z);
    this.reset(x, 0, z, heading);
    this.p.y = s.h + this.L / Math.max(0.3, s.n.y);
    this.n = s.n;
    this.surf = s.surf;
  }

  emit(type, data = {}) {
    this.out.push({ type, t: this.time, x: this.p.x, z: this.p.z, ...data });
  }

  get balance() {
    return Math.max(Math.abs(this.balF), Math.abs(this.balL));
  }

  get balanceState() {
    const b = this.balance;
    if (b < 0.3) return 'stable';
    if (b < 0.55) return 'wobbling';
    if (b < this.T.doomed) return 'off-balance';
    return 'doomed';
  }

  airLeg(py) {
    const T = this.T;
    const f = legFrac(py, T.legNeutralFrac);
    return T.legMin + (T.legMax - T.legMin) * (T.airLegFloor + (1 - T.airLegFloor) * f);
  }

  crash(cause, extra = {}) {
    if (this.crashed) return;
    this.crashed = { cause, t: this.time, speed: this.speed, ...extra };
    if (this.landing && !this.landing.done) this._finishLanding('crash');
    this.emit('crash', { cause });
  }

  step(inp, world, dt) {
    if (this.crashed) return;
    const T = this.T;
    this.time += dt;

    // --- posture ---
    const ks = 1 - Math.exp(-T.postureSmooth * dt);
    this.post.x += (inp.px - this.post.x) * ks;
    this.post.y += (inp.py - this.post.y) * ks;
    const px = this.post.x;
    const py = this.post.y;
    const adapt = clamp(dt / T.balAdaptTau, 0, 1);
    this.pyAvg += (py - this.pyAvg) * adapt;
    this.pxAvg += (px - this.pxAvg) * adapt;
    this.tuck = approach(this.tuck, inp.tuck ? 1 : 0, 4, dt);
    this.brake = approach(this.brake, inp.brake ? 1 : 0, 5, dt);
    const frac = legFrac(py, T.legNeutralFrac);
    this.Lt = T.legMin + (T.legMax - T.legMin) * frac;
    this.frac = frac;
    // detect deliberate extensions (the "flick") for timing analysis
    const ltRate = (this.Lt - this.prevLt) / dt;
    this.prevLt = this.Lt;
    const ex = this.ext;
    if (!ex.active && ltRate > 0.9) {
      ex.active = true;
      ex.start = this.time;
      ex.from = this.Lt - ltRate * dt;
      ex.peakRate = ltRate;
    }
    if (ex.active) {
      ex.peakRate = Math.max(ex.peakRate, ltRate);
      if (ltRate < 0.25) {
        ex.active = false;
        ex.end = this.time;
        ex.amount = this.Lt - ex.from;
      }
    }
    this.LtSlow += (this.Lt - this.LtSlow) * clamp(dt / T.legActTau, 0, 1);
    this.popAcc *= Math.exp(-dt / 0.3);

    const oldX = this.p.x;
    const oldZ = this.p.z;

    if (this.grounded) this._ground(inp, world, dt, px, py, frac);
    else this._air(inp, world, dt, px, py);

    if (!this.crashed) this._collide(world, oldX, oldZ, dt);
    if (!this.crashed) this._analyse(dt);

    this.speed = Math.hypot(this.v.x, this.v.y, this.v.z);
    this._record();
  }

  // ------------------------------------------------------------------ ground
  _ground(inp, world, dt, px, py, frac) {
    const T = this.T;
    const m = T.mass;
    const g = T.gravity;
    const p = this.p;
    const v = this.v;
    const s = world.sample(p.x, p.z);
    let n = s.n;
    // On a lip edge the sampled normal can belong to the face below. If the
    // skis are clearly above that face, measure vertically instead (so the
    // snow simply drops away) rather than "standing" on the cliff face.
    const clear = p.y - s.h;
    let Lg = clear * n.y;
    if (n.y < 0.6 && clear > this.L * 0.9) {
      const back = world.normal(p.x - this.v.x * 0.02, p.z - this.v.z * 0.02, 0.15);
      if (back.y > n.y) n = back;
      Lg = clear * Math.max(n.y, 0.6);
    }
    this.n = n;
    this.surf = s.surf;
    const Lair = this.airLeg(py);

    // hard stop: legs fully compressed (bottom out)
    if (Lg < T.legMin) {
      p.y += (T.legMin - Lg) / Math.max(n.y, 0.2);
      const vn = dot(v, n);
      if (vn < 0) {
        v.x -= n.x * vn;
        v.y -= n.y * vn;
        v.z -= n.z * vn;
        const dvb = -vn;
        this.bottomDV = Math.max(this.bottomDV, dvb);
        if (dvb > 0.6) {
          this.emit('bottom', { dv: dvb });
          this.balFv -= dvb * T.bottomKick;
          // hitting a steep face with no leg travel left: that's a wall
          if (n.y < 0.5 && dvb > T.wallCrashSpeed * 0.8) {
            this.crash('slammed into terrain', { dv: dvb });
            return;
          }
          if (dvb > T.crashBottomOut) {
            this.crash('bottomed out', { dv: dvb });
            return;
          }
        }
      }
      Lg = T.legMin;
    }

    const L = Math.min(Lg, T.legMax);
    const Ldot = dot(v, n);
    // how fast the snow is receding from the hips (lips, roll-overs)
    const LgRate = this.prevLg !== undefined ? (Lg - this.prevLg) / dt : 0;
    this.prevLg = Lg;
    const S = readiness(py);
    const kLeg = T.legK * (1 + T.legKLockBoost * frac * frac * frac * frac);
    const c = Ldot >= 0 ? T.legCExtend : T.legCCompress * (0.45 + 0.85 * S);
    // Holding force: legs spring toward the posture target - carries body
    // weight, absorbs compressions, bounces if stiff.
    const holdMax = T.absorbMaxG * m * g * lerp(1, T.readinessBoost, S);
    const Fhold = clamp(m * g * n.y + kLeg * (this.Lt - L) - c * Ldot, 0, holdMax);
    // Active pop: a flick (fast extension) drives a short push window whose
    // strength scales with flick speed and crouch depth. It only does
    // anything while the skis are on the snow, and (Hill-style) weakens if
    // the snow is falling away faster than the legs can extend.
    const recede = Math.max(0, LgRate);
    const hill = clamp(1 - LgRate / T.legVmax, 0, T.kickBoostMax);
    let Fact = 0;
    const exs = this.ext;
    const since = this.time - exs.start;
    if (since >= 0 && since < T.pushWindow) {
      const amt = exs.active ? this.Lt - exs.from : exs.amount;
      const q = clamp(exs.peakRate / T.flickFullRate, 0.15, 1) * clamp(amt / (0.75 * (T.legMax - T.legMin)), 0.2, 1);
      const env = Math.sin(Math.PI * clamp(since / T.pushWindow, 0, 1));
      Fact = T.pushMaxG * m * g * q * hill * (0.35 + 0.65 * env);
    }
    const F = Math.min(Fhold + Fact, holdMax + T.pushMaxG * m * g);
    // reporting: how much of this push comes from the fresh extension
    const Fpas = clamp(m * g * n.y + kLeg * (this.LtSlow - L) - c * Ldot, 0, holdMax);
    if (F > Fpas) this.popAcc += ((F - Fpas) / m) * dt;
    const Fraw = m * g * n.y + kLeg * (this.Lt - L) - c * Ldot + Fact;
    this._trackPush(Fact / (m * g));
    this.demandG = Math.max(this.demandG || 0, Fraw / (m * g));

    // takeoff: feet can no longer reach (or keep up with) the snow
    if (Lg > T.legMax + 1e-4 || (Lg > Lair && F <= 1e-6) || recede > T.legVmax) {
      this._takeoff(world);
      this._air(inp, world, dt, px, py);
      return;
    }

    this.L = L;
    this.Ldot = Ldot;
    this.F = F;
    this.load = F / (m * g);
    this.impactG = Math.max(this.impactG, Math.min(15, Fraw / (m * g)));

    // --- forces ---
    const ax = 0, ay = -g, az = 0;
    let a = { x: ax + (n.x * F) / m, y: ay + (n.y * F) / m, z: az + (n.z * F) / m };

    const f = { x: Math.sin(this.heading), y: 0, z: Math.cos(this.heading) };
    const fn = dot(f, n);
    const t = norm({ x: f.x - n.x * fn, y: f.y - n.y * fn, z: f.z - n.z * fn });
    const r = cross(t, n); // skier's right
    this.t = t;
    this.r = r;
    const vt = dot(v, t);
    const vr = dot(v, r);
    const speed = Math.hypot(v.x, v.y, v.z);
    const surf = s.surf;

    // along-ski friction (proportional to the load the legs put on the snow)
    let mu = surf.mu + this.brake * T.brakeMu;
    if (surf.powder) mu += 0.24 * Math.exp(-speed / 9);
    if (frac < 0.1) mu += T.crouchDragMu;
    const fr = (mu * F) / m;
    const frA = Math.min(fr, Math.abs(vt) / dt);
    a.x -= t.x * Math.sign(vt) * frA;
    a.y -= t.y * Math.sign(vt) * frA;
    a.z -= t.z * Math.sign(vt) * frA;

    // poling / skating: W at low speed pushes you along (gets you off flats)
    if (inp.tuck && speed < T.poleSpeed && F > 0) {
      const pa = T.poleAccel * (1 - speed / T.poleSpeed);
      a.x += t.x * pa;
      a.y += t.y * pa;
      a.z += t.z * pa;
    }
    // aero drag
    const dk = lerp(T.dragStand, T.dragTuck, this.tuck) * (1 + 0.25 * (1 - frac));
    a.x -= v.x * speed * dk;
    a.y -= v.y * speed * dk;
    a.z -= v.z * speed * dk;

    // edge
    const steer = clamp(inp.steer, -1, 1);
    const edgeT = clamp(
      steer * T.maxEdge * lerp(1, T.tuckSteer, this.tuck) + px * T.weightEdge,
      -1.25, 1.25,
    );
    this.edge = approach(this.edge, edgeT, T.edgeRate, dt);

    // lateral grip: skis resist sliding sideways, up to a load-dependent limit
    const req = -vr / T.gripTau;
    const gripMul = surf.grip * (0.6 + 0.7 * Math.sin(Math.min(Math.abs(this.edge), 1.2)));
    const lim = (gripMul * 1.15 * F) / m;
    let skid = 0;
    if (Math.abs(req) <= lim) {
      a.x += r.x * req;
      a.y += r.y * req;
      a.z += r.z * req;
    } else {
      const fa = Math.sign(req) * lim;
      a.x += r.x * fa;
      a.y += r.y * fa;
      a.z += r.z * fa;
      skid = Math.abs(vr);
    }
    this.skid = skid;

    // heading: carve (speed * edge / sidecut) + pivot (skidded turn, slow)
    const loadF = clamp(F / (m * g), 0, 1.7);
    const auth = surf.steer * clamp(1 + 0.6 * this.balF, 0.3, 1.4) * loadF;
    const carveRate = (Math.abs(vt) * Math.sin(this.edge)) / T.sidecutRadius * auth * Math.sign(vt || 1);
    const pivot = steer * T.pivotRate * surf.steer / (1 + Math.abs(vt) / 5)
      * (1 + this.brake * T.brakePivot) * (F > 0 ? 1 : 0.3);
    this.turnRate = carveRate + pivot;
    this.heading -= this.turnRate * dt;
    // skis drift to follow where you are actually going
    if (Math.abs(steer) < 0.1 && speed > 2 && vt > 0) {
      const hv = Math.atan2(v.x, v.z);
      this.heading += wrapAngle(hv - this.heading) * T.alignRate * dt * clamp(loadF, 0, 1);
    }
    this.heading = wrapAngle(this.heading);

    // lean into turn (visual + roll reference)
    const latA = this.turnRate * Math.abs(vt);
    this.lean = Math.atan2(latA, g) * 0.9; // + = leaning right

    // --- balance ---
    this._balance(dt, px, py, frac, speed, surf, skid, F);
    if (this.crashed) return;

    // integrate
    v.x += a.x * dt;
    v.y += a.y * dt;
    v.z += a.z * dt;
    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;

    // ground pitch along ski (for takeoff rotation)
    const gp = Math.asin(clamp(t.y, -1, 1));
    const gpv = (gp - this.groundPitch) / dt;
    this.pitchVel = lerp(this.pitchVel, clamp(gpv, -6, 6), 1 - Math.exp(-20 * dt));
    this.groundPitch = gp;
    this.pitch = gp;
    this.roll = 0;
    this.rollVel = 0;
    this.yawRate = -this.turnRate;
    this.slopeDeg = Math.acos(clamp(n.y, -1, 1)) * 57.2958;
    this.groundTime += dt;
    this.airTime = 0;
  }

  _balance(dt, px, py, frac, speed, surf, skid, F) {
    const T = this.T;
    // fore/aft: MOVING the mouse forward throws hips forward (holding a
    // posture adapts away after balAdaptTau)
    // fast posture changes throw the hips around; a held posture keeps a
    // smaller, sustained lean (so a correction can be held)
    let uF = clamp((py - this.pyAvg) * 1.2 + py * T.balHold, -1.3, 1.3);
    let uL = clamp((px - this.pxAvg) * 1.2 + px * T.balHold, -1.3, 1.3);
    const authF = Math.abs(this.balF) > T.doomed ? 0.15 : 1;
    const authL = Math.abs(this.balL) > T.doomed ? 0.15 : 1;
    let dF = 0;
    let dL = 0;
    if (frac < 0.12) dF -= T.deepCrouchBack;
    // rough terrain / chatter (deterministic noise)
    const rough = surf.rough + (surf.chatter ? Math.min(skid, 8) * 0.08 : 0);
    if (rough > 0 && speed > 3) {
      const k = rough * Math.min(speed, 35) * 0.9;
      dF += valueNoise(this.p.x * 0.9, this.p.z * 0.9 + 13.1) * k;
      dL += valueNoise(this.p.x * 0.9 + 71.3, this.p.z * 0.9) * k;
    }
    // heavy skid on grippy snow: edges bite and throw you sideways
    if (skid > 7) dL += Math.sign(this.edge || 1) * (skid - 7) * 0.6 * surf.grip;
    // heavy compressions throw you back a little
    const lg = F / (T.mass * T.gravity);
    if (lg > 2.8) dF -= (lg - 2.8) * 2.0;

    const b = this.balF;
    const accF = -T.balStiff * b + T.balTopple * b * Math.abs(b) + T.balCtrlFore * uF * authF
      - T.balDamp * this.balFv + dF;
    const bl = this.balL;
    const accL = -T.balStiff * bl + T.balTopple * bl * Math.abs(bl) + T.balCtrlLat * uL * authL
      - T.balDamp * this.balLv + dL;
    this.balFv += accF * dt;
    this.balLv += accL * dt;
    this.balF += this.balFv * dt;
    this.balL += this.balLv * dt;
    this.maxBal = Math.max(this.maxBal, this.balance);
    this.wobble = this.balance;
    if (this.balF >= 1) this.crash('faceplant');
    else if (this.balF <= -1) this.crash('sat down / fell back');
    else if (Math.abs(this.balL) >= 1) this.crash(this.balL > 0 ? 'fell right' : 'fell left');
  }

  // --------------------------------------------------------------------- air
  _air(inp, world, dt, px, py) {
    const T = this.T;
    const g = T.gravity;
    const p = this.p;
    const v = this.v;
    if (this.grounded) this.grounded = false;
    this.F = 0;
    this.load = 0;
    this.skid = 0;
    this.prevLg = undefined;
    // feet hang at landing-gear length; legs move fast but not instantly
    const La = this.airLeg(py);
    const prevL = this.L;
    this.L = approach(this.L, La, 4.5, dt);
    this.Ldot = (this.L - prevL) / dt;

    const speed = Math.hypot(v.x, v.y, v.z);
    const dk = lerp(T.dragStand, T.dragTuck, this.tuck);
    v.x -= v.x * speed * dk * dt;
    v.y += (-g - v.y * speed * dk) * dt;
    v.z -= v.z * speed * dk * dt;
    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;

    // pitch: forward posture = nose down, back = tips up; skis weathervane
    const hs = Math.hypot(v.x, v.z);
    const velPitch = Math.atan2(v.y, Math.max(hs, 0.1));
    const pAcc = -T.airPitchK * (py - T.airPitchNeutral) - T.airPitchD * this.pitchVel
      + T.weathervane * wrapAngle(velPitch - this.pitch) * Math.min(1, speed / 12);
    this.pitchVel += pAcc * dt;
    this.pitch = wrapAngle(this.pitch + this.pitchVel * dt);
    // roll: weight shift
    const rAcc = T.airRollK * px - T.airRollD * this.rollVel - 0.8 * this.roll;
    this.rollVel += rAcc * dt;
    this.roll = wrapAngle(this.roll + this.rollVel * dt);
    // yaw: A/D twist, slight weathervane
    const steer = clamp(inp.steer, -1, 1);
    this.yawRate += (-T.airYawK * steer - T.airYawD * this.yawRate) * dt;
    this.heading += this.yawRate * dt;
    if (hs > 4) this.heading += wrapAngle(Math.atan2(v.x, v.z) - this.heading) * 0.5 * dt;
    this.heading = wrapAngle(this.heading);
    this.edge = approach(this.edge, 0, 2, dt);
    this.lean = approach(this.lean, 0, 1.5, dt);

    // balance relaxes in the air (you can reset your body)
    this.balF = approach(this.balF, 0, 0.5, dt);
    this.balL = approach(this.balL, 0, 0.5, dt);
    this.balFv *= Math.exp(-4 * dt);
    this.balLv *= Math.exp(-4 * dt);

    this.airTime += dt;
    this.groundTime = 0;

    // touchdown?
    const s = world.sample(p.x, p.z);
    const clear = p.y - s.h;
    if (clear * s.n.y <= this.L && clear <= this.L / Math.max(s.n.y, 0.35)) this._touchdown(world, s, px, py);
  }

  _takeoff(world) {
    if (this.landing && !this.landing.done && this.time - this.landing.t > 0.12) {
      this._finishLanding(this._landingQuality(this.time - this.landing.t < 0.5));
    }
    this.grounded = false;
    this.airTime = 0;
    const T = this.T;
    // takeoff rotation: terrain curvature + fore/aft balance + current spin
    this.pitchVel = clamp(this.pitchVel * T.lipRotation, -1.6, 1.6) - this.balF * T.takeoffBalToPitch;
    this.rollVel = this.balL * 1.2;
    this.yawRate = -this.turnRate;
    // cross-slope tilt of the lip carries into the air
    this.roll = this.r ? -Math.asin(clamp(this.r.y, -1, 1)) : 0;
    // pop = velocity away from the surface we just left (normal ~50ms ago)
    const h = this.hist;
    const back = Math.min(h.n, 12);
    const j = (h.i - back + HIST) % HIST;
    const n0 = back > 0 ? { x: h.nx[j], y: h.ny[j], z: h.nz[j] } : this.n;
    const ext = this._extensionStats();
    const pop = this.popAcc;
    this.takeoff = {
      t: this.time,
      speed: Math.hypot(this.v.x, this.v.y, this.v.z),
      pop,
      p: { ...this.p },
      lipPitch: this.groundPitch,
      fracAtTO: (this.L - T.legMin) / (T.legMax - T.legMin),
      LdotAtTO: this.Ldot,
      ...ext,
      airExtend: 0,
      ltAtTO: this.Lt,
      push: this.push ? { ...this.push, activeAtTO: this.push.active } : null,
      lipAhead: this._lipAhead(world),
      remaining: clamp((this.Lt - this.LtSlow) / Math.max(0.05, this.Lt - this.ext.from), 0, 1),
      reported: false,
    };
    this.emit('takeoff', { pop });
  }

  // Distance to the next convex edge along the direction of travel (or -1).
  _lipAhead(world) {
    const v = this.v;
    const hs = Math.hypot(v.x, v.z);
    if (hs < 3) return -1;
    const dx = v.x / hs;
    const dz = v.z / hs;
    const n = this.n;
    const slope = -(n.x * dx + n.z * dz) / Math.max(n.y, 0.2);
    const h0 = world.height(this.p.x, this.p.z);
    const D = Math.min(hs * 0.45, 14);
    for (let s = 0.5; s <= D; s += 0.5) {
      const h = world.height(this.p.x + dx * s, this.p.z + dz * s);
      const plane = h0 + slope * s;
      if (plane - h > 0.12 + 0.03 * s) return s;
    }
    return -1;
  }

  // Look back through the leg history for the extension that preceded takeoff.
  _extensionStats() {
    const h = this.hist;
    const n = Math.min(h.n, 120); // 0.5 s
    let maxLdot = 0;
    let tPeak = this.time;
    let tEnd = this.time;
    let popWork = 0;
    for (let k = 1; k <= n; k++) {
      const j = (h.i - k + HIST) % HIST;
      if (!h.g[j]) break;
      if (h.Ldot[j] > maxLdot) {
        maxLdot = h.Ldot[j];
        tPeak = h.t[j];
      }
    }
    // extension end = last time Ldot was above 35% of the peak
    if (maxLdot > 0.3) {
      for (let k = 1; k <= n; k++) {
        const j = (h.i - k + HIST) % HIST;
        if (!h.g[j]) break;
        if (h.Ldot[j] > maxLdot * 0.35) {
          tEnd = h.t[j];
          break;
        }
      }
      for (let k = 1; k <= n; k++) {
        const j = (h.i - k + HIST) % HIST;
        if (!h.g[j]) break;
        if (h.t[j] < tPeak - 0.4) break;
        popWork += Math.max(0, h.Ldot[j]) / 240;
      }
    }
    return { maxLdot, tPeak, tEnd, popTravel: popWork };
  }

  _touchdown(world, s, px, py) {
    const T = this.T;
    const n = s.n;
    const v = this.v;
    this.grounded = true;
    const f = { x: Math.sin(this.heading), y: 0, z: Math.cos(this.heading) };
    const fn = dot(f, n);
    const t = norm({ x: f.x - n.x * fn, y: f.y - n.y * fn, z: f.z - n.z * fn });
    const r = cross(t, n);
    const slopePitch = Math.asin(clamp(t.y, -1, 1));
    const dPitch = wrapAngle(this.pitch - slopePitch); // + = tails first
    const surfRoll = -Math.asin(clamp(r.y, -1, 1));
    const rollErr = wrapAngle(this.roll - surfRoll);
    const hs = Math.hypot(v.x, v.z);
    const yawErr = hs > 3 ? wrapAngle(this.heading - Math.atan2(v.x, v.z)) : 0;
    const vn = dot(v, n);
    const vs = dot(v, r);
    const speed = Math.hypot(v.x, v.y, v.z);
    const airTime = this.airTime;

    this.balFv += -dPitch * T.landPitchKick * Math.min(1, speed / 8);
    this.balLv += rollErr * T.landRollKick + vs * T.edgeCatchKick;
    const frac = legFrac(py, T.legNeutralFrac);
    if (frac > 0.82 && vn < -1.5) {
      this.balFv -= -vn * T.rigidKick * (frac - 0.7) / 0.3;
    }
    this.groundPitch = slopePitch;
    this.pitch = slopePitch;
    this.pitchVel = 0;
    this.roll = 0;
    this.rollVel = 0;
    this.impactG = 0;
    this.demandG = 0;
    this.bottomDV = 0;
    this.maxBal = this.balance;
    if (this.push) this.push.active = false;
    this.L = clamp((this.p.y - s.h) * n.y, T.legMin, T.legMax);

    const significant = airTime > 0.25;
    if (!significant && this.landing && !this.landing.done) {
      // a small bounce during the landing: part of the same landing
    } else if (significant) {
      this.landing = {
        t: this.time,
        airTime,
        dPitch,
        rollErr,
        yawErr,
        vn,
        speedIn: speed,
        readiness: readiness(py),
        frac,
        done: false,
        jump: null,
        takeoffT: this.time - airTime,
      };
      if (this.lastJump && Math.abs(this.lastJump.tTakeoff - this.landing.takeoffT) < 0.3) this.landing.jump = this.lastJump;
      this.emit('touchdown', { vn, dPitch, airTime });
    } else if (vn < -2.5) {
      this.emit('thud', { vn });
    }
    if (n.y < 0.5 && -vn > T.wallCrashSpeed * 0.7) {
      this.crash('slammed into a wall of snow');
      return;
    }
    if (Math.abs(dPitch) > T.crashPitch && speed > 4 && -vn > 1.5) {
      this.crash(dPitch > 0 ? 'landed on tails - tumble' : 'tips dug in - faceplant');
      return;
    }
    if (Math.abs(yawErr) > T.crashYaw && Math.abs(yawErr) < Math.PI - T.crashYaw && speed > 9) {
      this.crash('landed sideways - edge caught');
    }
  }

  // ------------------------------------------------------------- collisions
  _collide(world, ox, oz, dt) {
    const T = this.T;
    const p = this.p;
    const v = this.v;
    // walls / sudden steps (roof sides, cars, cliff faces)
    const h2 = world.height(p.x, p.z);
    const feetY = p.y - this.L / (this.grounded ? Math.max(this.n.y, 0.3) : 1);
    if (h2 > feetY + 0.6) {
      const h1 = world.height(ox, oz);
      if (h2 - h1 > 0.45) {
        const mx = p.x - ox;
        const mz = p.z - oz;
        const ml = Math.hypot(mx, mz) || 1;
        const into = (v.x * mx + v.z * mz) / ml;
        p.x = ox;
        p.z = oz;
        v.x -= (mx / ml) * into * 1.2;
        v.z -= (mz / ml) * into * 1.2;
        this.emit('hit', { what: 'wall', speed: into });
        if (into > T.wallCrashSpeed) {
          this.crash('hit a wall', { speed: into });
          return;
        }
        this.balFv -= into * 0.25;
        this.balLv += (Math.sin(p.x * 3.1) > 0 ? 1 : -1) * into * 0.15;
      }
    }
    // trees: swept circle test in xz
    const trees = world.treesNear(p.z);
    for (let i = 0; i < trees.length; i++) {
      const tr = trees[i];
      if (tr.dead) continue;
      const R = tr.r + 0.32;
      const dx = p.x - tr.x;
      const dz = p.z - tr.z;
      if (dx * dx + dz * dz > R * R) {
        // check if we passed through it this step
        const sx = p.x - ox;
        const sz = p.z - oz;
        const sl2 = sx * sx + sz * sz;
        if (sl2 < 1e-6) continue;
        const tt = clamp(((tr.x - ox) * sx + (tr.z - oz) * sz) / sl2, 0, 1);
        const cx = ox + sx * tt - tr.x;
        const cz = oz + sz * tt - tr.z;
        if (cx * cx + cz * cz > R * R) continue;
      }
      if (tr.baseY !== undefined && p.y - this.L > tr.baseY + tr.h * 0.9) continue;
      // hit
      let nx = p.x - tr.x;
      let nz = p.z - tr.z;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl;
      nz /= nl;
      const into = -(v.x * nx + v.z * nz);
      if (into <= 0) continue;
      p.x = tr.x + nx * (R + 0.01);
      p.z = tr.z + nz * (R + 0.01);
      v.x += nx * into * 1.3;
      v.z += nz * into * 1.3;
      this.emit('hit', { what: tr.kind || 'tree', speed: into });
      if (into > T.wallCrashSpeed * 0.8) {
        this.crash(tr.kind === 'pole' ? 'hit a pole' : 'hugged a tree', { speed: into });
        return;
      }
      this.balLv += (nx * Math.cos(this.heading) - nz * Math.sin(this.heading)) * into * 0.45;
      this.balFv -= into * 0.12;
    }
  }

  _trackPush(popG) {
    const pu = this.push || (this.push = { active: false, start: -9, end: -9, peak: 0 });
    if (!pu.active && popG > 0.4) {
      pu.active = true;
      pu.start = this.time;
      pu.peak = popG;
    }
    if (pu.active) {
      pu.peak = Math.max(pu.peak, popG);
      if (popG < pu.peak * 0.2) {
        pu.active = false;
        pu.end = this.time;
      }
    }
  }

  // External shove (rockfall glancing blows, other skiers later, etc.)
  shove(dvx, dvy, dvz, balF = 0, balL = 0) {
    this.v.x += dvx;
    this.v.y += dvy;
    this.v.z += dvz;
    this.balFv += balF;
    this.balLv += balL;
  }

  // -------------------------------------------------------- jump reporting
  _analyse(dt) {
    const to = this.takeoff;
    if (to && !to.reported) {
      if (!this.grounded) {
        to.airExtend = Math.max(to.airExtend, this.Lt - to.ltAtTO);
      }
      const age = this.time - to.t;
      if (age > 0.22 || this.grounded) {
        to.reported = true;
        if (this.grounded && age < 0.25) {
          // just a micro-air
          this.takeoff = null;
        } else {
          this.lastJump = this._classifyTakeoff(to);
          if (this.landing && !this.landing.done && Math.abs(this.landing.takeoffT - to.t) < 0.3) this.landing.jump = this.lastJump;
          this.emit('jump', { report: this.lastJump });
        }
      }
    }
    const ld = this.landing;
    if (ld && !ld.done && this.grounded) {
      const age = this.time - ld.t;
      if (age > 0.7) this._finishLanding(this._landingQuality());
    }
  }

  _classifyTakeoff(to) {
    const T = this.T;
    // Timing: the flick opens a push window of T.pushWindow seconds. Ideal:
    // the skis leave the snow in the second half of that window (the push
    // is complete, and the snow drops away / the push lifts you off).
    const ex = this.ext;
    let timing = 'none';
    let offsetMs = null;
    const amount = ex.active ? this.Lt - ex.from : ex.amount;
    if (ex.start > to.t - 1.0 && ex.start < to.t + 0.25 && amount > 0.12) {
      const into = to.t - ex.start; // how far into the push window we left
      const offset = into - T.pushWindow * 0.75; // + = push finished early
      offsetMs = Math.round(offset * 1000);
      const lipT = to.lipAhead > 0 ? to.lipAhead / Math.max(to.speed, 1) : 0;
      if (into < T.pushWindow * 0.45) timing = 'late';
      else if (into > T.pushWindow + T.perfectEarly) timing = 'early';
      else if (lipT > T.lipEarly) {
        // you popped yourself off the ramp before reaching its lip
        timing = 'early';
        offsetMs = Math.round(lipT * 1000);
      } else timing = 'perfect';
    }
    const pop = Math.max(0, to.pop);
    const popQ = pop < 1.5 ? 'weak' : pop < 3 ? 'good' : 'huge';
    return {
      timing,
      pop: popQ,
      popVel: +pop.toFixed(2),
      offsetMs,
      speed: +to.speed.toFixed(1),
      landing: null,
      x: to.p.x,
      z: to.p.z,
      tTakeoff: to.t,
    };
  }

  _landingQuality(bounced = false) {
    const ld = this.landing;
    const bal = this.maxBal;
    let q = 'perfect';
    if (bal > 0.55 || this.bottomDV > 2.2 || Math.abs(ld.dPitch) > 0.45) q = 'sketchy';
    else if (bal > 0.3 || this.impactG > 6 || Math.abs(ld.dPitch) > 0.22 || this.bottomDV > 0.8 || bounced) q = 'good';
    return q;
  }

  _finishLanding(q) {
    const ld = this.landing;
    if (!ld || ld.done) return;
    ld.done = true;
    const res = {
      quality: q,
      airTime: +ld.airTime.toFixed(2),
      pitchErrDeg: Math.round(ld.dPitch * 57.3),
      rollErrDeg: Math.round(ld.rollErr * 57.3),
      yawErrDeg: Math.round(ld.yawErr * 57.3),
      impactVel: +(-ld.vn).toFixed(2),
      impactG: +this.impactG.toFixed(2),
      bottomOut: +this.bottomDV.toFixed(2),
      maxBalance: +this.maxBal.toFixed(2),
      readiness: +ld.readiness.toFixed(2),
      speedKeep: +(this.speed / Math.max(ld.speedIn, 0.1)).toFixed(2),
    };
    const j = ld.jump || (this.lastJump && Math.abs(this.lastJump.tTakeoff - ld.takeoffT) < 0.3 ? this.lastJump : null);
    if (j && !j.landing) j.landing = res;
    this.lastLanding = res;
    this.emit('landed', { report: res });
  }

  _record() {
    const h = this.hist;
    const i = h.i;
    h.t[i] = this.time;
    h.L[i] = this.L;
    h.Lt[i] = this.Lt;
    h.Ldot[i] = this.Ldot;
    h.F[i] = this.F;
    h.g[i] = this.grounded ? 1 : 0;
    h.nx[i] = this.n.x;
    h.ny[i] = this.n.y;
    h.nz[i] = this.n.z;
    h.i = (i + 1) % HIST;
    h.n = Math.min(h.n + 1, HIST);
  }

  // Snapshot for replays / future networking.
  serialize() {
    return {
      p: { ...this.p }, v: { ...this.v }, heading: this.heading, L: this.L,
      grounded: this.grounded, pitch: this.pitch, roll: this.roll, balF: this.balF,
      balL: this.balL, edge: this.edge, post: { ...this.post }, tuck: this.tuck,
      crashed: !!this.crashed,
    };
  }
}
