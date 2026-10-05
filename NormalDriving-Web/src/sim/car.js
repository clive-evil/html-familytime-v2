// Vehicle simulation: engine ↔ clutch ↔ gearbox ↔ driven front axle ↔ tyres ↔
// 2D rigid body on an analytic height field. Fixed step, deterministic, no
// randomness anywhere. Constraint solver = projected Gauss-Seidel with
// capacity-limited "friction" constraints (clutch, brakes, tyres, engine
// drag), so stiction (holding on a hill, clutch lock-up) is exact and stable.

import { CAR, CLUTCH_DIFFICULTY, torqueCurve } from './params.js';
import { clamp, smoothstep, RPM_PER_RADS, DEG } from './math.js';
import { collide } from './collision.js';

const G_ACC = 9.81;
const ITER = 12;

export function clutchEngagement(pedal, bite, width) {
  // pedal 0 = released (engaged), 1 = floored (disengaged)
  const e = 1 - smoothstep(bite - width / 2, bite + width / 2, pedal);
  return e * e * (1.6 - 0.6 * e); // a little softer at the very start of the bite
}

export class CarSim {
  constructor(world, settings) {
    this.world = world;
    this.settings = settings;
    this.events = [];
    this.dynamics = []; // dynamic obstacles (AI cars), set externally each frame
    this.reset(world.poses.start);
  }

  setSettings(s) { this.settings = s; }

  derived() {
    const s = this.settings;
    const diff = CLUTCH_DIFFICULTY[s.clutchDifficulty] || CLUTCH_DIFFICULTY.normal;
    return {
      bite: s.bitePoint,
      biteWidth: s.biteWidth,
      idleTorqueMax: diff.idleTorqueMax,
      stallRPM: diff.stallRPM + (s.stallSensitivity - 0.5) * 220,
      torqueMul: s.engineTorque,
      handbrake: CAR.handbrakeForce * s.handbrakeStrength,
    };
  }

  reset(pose, keepEngine = false) {
    this.x = pose.x; this.z = pose.z; this.psi = pose.psi;
    this.vx = 0; this.vz = 0; this.yawRate = 0;
    this.y = this.world.height(this.x, this.z);
    if (!keepEngine) {
      this.omegaE = 0; this.running = false; this.ignitionOn = false; this.cranking = false;
      this.gear = 0;
    }
    this.omegaW = 0;
    this.clutchTemp = 20;
    this.crankTime = 0; this.sinceCatch = 10; this.sinceStall = 10;
    this.ax = 0; this.ay = 0; this.axF = 0; this.ayF = 0;
    this.wheelSpinF = 0; this.wheelSpinR = 0;
    this.kerbState = [0, 0, 0, 0];
    this.wheelH = [0, 0, 0, 0];
    this.wheelGrad = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    this.contact = 0; this.scrape = 0; this.lastImpact = 0;
    this.slipF = 0; this.slipLat = 0; this.tyreSqueal = 0;
    this.clutchTorque = 0; this.clutchSlip = 0; this.engineLoad = 0;
    this.bodyPitch = 0; this.bodyRoll = 0; this.pitchVel = 0; this.rollVel = 0; this.bump = 0;
    this.prevFwdV = 0;
    this.clutchHot = false;
    this.ignHeld = false; this.ignLatch = false;
    this.grinding = 0;
    this.limiter = false;
    this.wheelRotF = 0; this.wheelRotR = 0;
    this.contactCooldown = 0;
    this.lastSafe = { x: this.x, z: this.z, psi: this.psi };
    this.updateHeights();
  }

  get rpm() { return this.omegaE * RPM_PER_RADS; }
  get fwdSpeed() { return this.vx * Math.sin(this.psi) + this.vz * Math.cos(this.psi); }
  get speed() { return Math.hypot(this.vx, this.vz); }
  ratio(g = this.gear) { return CAR.ratios[g] * CAR.finalDrive; }

  emit(type, mag = 1, extra) { this.events.push({ type, mag, ...extra }); }

  // Engagement attempt (gearbox/lever logic calls this). Deterministic rule:
  // allowed if the clutch is (almost) fully disengaged, or the engine and
  // gearbox speeds already match. Reverse has no synchro.
  canEngage(g, clutchPedal) {
    if (g === 0) return true;
    const d = this.derived();
    const cap = clutchEngagement(clutchPedal, d.bite, d.biteWidth);
    const v = this.fwdSpeed;
    if (g === -1 && v > 0.5) return false;
    if (g > 0 && v < -1.2) return false;
    if (cap < 0.05) return true;
    const mismatch = Math.abs(this.omegaE - this.ratio(g) * this.omegaW);
    return mismatch < 28;
  }

  setGear(g) {
    if (g === this.gear) return;
    const was = this.gear;
    this.gear = g;
    this.emit(g === 0 ? 'gearOut' : 'gearIn', 1, { gear: g, from: was });
  }

  // c: { throttle, brake, clutch, handbrake, steerDeg, ignition (held bool) }
  step(dt, c) {
    const d = this.derived();
    const s = this.settings;
    const m = CAR.mass, invM = 1 / m, invIz = 1 / CAR.yawInertia;
    const invIe = 1 / CAR.engineInertia, invIw = 1 / CAR.wheelInertia;
    const r = CAR.wheelR, L = CAR.a + CAR.b;

    // ---------------------------------------------------------------- ignition
    if (c.ignition && !this.ignHeld) {
      // fresh press
      if (this.running) {
        this.running = false; this.ignitionOn = false; this.ignLatch = true;
        this.emit('keyOff');
      } else {
        this.ignitionOn = true; this.ignLatch = false;
        this.emit('keyOn');
      }
    }
    if (!c.ignition) this.ignLatch = false;
    this.ignHeld = c.ignition;
    const wantCrank = c.ignition && !this.running && !this.ignLatch;
    if (wantCrank && !this.cranking) { this.cranking = true; this.crankTime = 0; this.emit('crankStart'); }
    if (!wantCrank && this.cranking) { this.cranking = false; this.emit('crankStop'); }
    if (this.cranking) this.crankTime += dt;

    const rpm = this.omegaE * RPM_PER_RADS;
    this.sinceCatch += dt;
    this.sinceStall += dt;
    if (!this.running && this.ignitionOn) {
      // Cranking catches at starter speed. A rolling (bump) start needs real
      // engine speed and can't happen in the same moment as a stall.
      const bumpRpm = Math.max(700, d.stallRPM + 280);
      if ((this.cranking && this.crankTime > 0.45 && rpm > 170) || (!this.cranking && this.sinceStall > 1.0 && rpm > bumpRpm)) {
        this.running = true; this.sinceCatch = 0; this.cranking = false;
        this.emit('catch');
      }
    }
    if (this.running && !this.cranking) {
      const hardStall = rpm < 140;
      if (hardStall || (this.sinceCatch > 0.7 && rpm < d.stallRPM)) {
        this.running = false;
        this.sinceStall = 0;
        this.emit('stall');
      }
    }

    // ---------------------------------------------------------------- engine torque
    let driveT = 0, fricT;
    const thr = clamp(c.throttle, 0, 1);
    if (this.running) {
      const fIdle = 4 + 0.0035 * CAR.idleRPM + 0.0025 * CAR.idleRPM;
      const boost = this.sinceCatch < 0.6 ? 2.6 : 1;
      const gov = clamp(fIdle + (CAR.idleRPM - rpm) * 0.06, 0, d.idleTorqueMax * boost);
      // Throttle plate map: at low rpm a small opening already fills the
      // manifold, so the pedal is progressive rather than linear.
      const expo = 1 + 2.4 * clamp(1 - rpm / 6000, 0, 1);
      const thrFrac = 1 - Math.pow(1 - thr, expo);
      let comb = Math.max(thrFrac * torqueCurve(rpm) * d.torqueMul, gov);
      this.limiter = rpm > CAR.revLimit;
      if (this.limiter) comb = 0;
      driveT = comb;
      fricT = 4 + 0.0035 * Math.abs(rpm) + (1 - thr) * 0.0025 * Math.abs(rpm);
      this.throttleEff = comb / Math.max(1, torqueCurve(rpm));
    } else {
      fricT = 11 + 0.01 * Math.abs(rpm);
      if (rpm < -20) fricT = 45;
      this.throttleEff = 0;
      this.limiter = false;
    }
    if (this.cranking) driveT += clamp(55 * (1 - rpm / 320), 0, 55);
    this.omegaE += driveT * invIe * dt;

    // ---------------------------------------------------------------- body geometry
    const sp = Math.sin(this.psi), cp = Math.cos(this.psi);
    const fx = sp, fz = cp;          // forward
    const lx = cp, lz = -sp;         // left
    const delta = clamp(c.steerDeg / (s.steeringTurns * 180), -1, 1) * CAR.maxRoadAngle * DEG;
    this.roadAngle = delta / DEG;
    // front wheel direction: steering right (positive) turns heading clockwise (towards -left)
    // positive delta = steer right = heading decreases (facing +z, +x is left)
    const sd = Math.sin(this.psi - delta), cd = Math.cos(this.psi - delta);
    const dFx = sd, dFz = cd, nFx = cd, nFz = -sd;

    // ---------------------------------------------------------------- loads
    const slopeFwd = this.groundSlopeFwd ?? 0; // uphill positive (set in updateHeights)
    const cosT = 1 / Math.sqrt(1 + slopeFwd * slopeFwd);
    const sinT = slopeFwd * cosT;
    const longSpecific = this.axF + G_ACC * sinT;
    let Nf = m * G_ACC * cosT * (CAR.b / L) - m * longSpecific * CAR.cgHeight / L;
    Nf = clamp(Nf, 0.15 * m * G_ACC, 0.85 * m * G_ACC);
    const Nr = m * G_ACC * cosT - Nf;
    this.Nf = Nf; this.Nr = Nr;

    // ---------------------------------------------------------------- external forces
    // gravity per wheel from the local height-field gradient (includes kerbs)
    let Fx = 0, Fz = 0, Tq = 0;
    const wp = this.wheelPositions();
    for (let i = 0; i < 4; i++) {
      const [wx, wz] = wp[i];
      const g = this.wheelGrad[i];
      const k = 1 / Math.sqrt(1 + g[0] * g[0] + g[1] * g[1]);
      const share = (i < 2 ? Nf : Nr) / 2;
      const gx = -share * g[0] * k, gz = -share * g[1] * k;
      Fx += gx; Fz += gz;
      const rx = wx - this.x, rz = wz - this.z;
      Tq += rz * gx - rx * gz;
    }
    // aero drag
    const spd = Math.hypot(this.vx, this.vz);
    Fx -= 0.5 * 1.2 * 0.68 * spd * this.vx;
    Fz -= 0.5 * 1.2 * 0.68 * spd * this.vz;
    this.vx += Fx * invM * dt; this.vz += Fz * invM * dt; this.yawRate += Tq * invIz * dt;

    // ---------------------------------------------------------------- constraints
    const Gr = this.ratio();
    const capClutchFrac = Gr !== 0 ? clutchEngagement(c.clutch, d.bite, d.biteWidth) : 0;
    let fade = 1;
    if (this.clutchTemp > CAR.clutchFadeTemp) fade = 1 - clamp((this.clutchTemp - CAR.clutchFadeTemp) / 120, 0, 0.45);
    const capClutch = CAR.clutchMaxTorque * capClutchFrac * fade;
    this.clutchCapFrac = capClutchFrac;

    const brake = clamp(c.brake, 0, 1);
    const rollF = CAR.rollCoeff * Nf, rollR = CAR.rollCoeff * Nr;
    const capBrakeF = (brake * CAR.brakeForceMax * CAR.brakeFrontShare + rollF) * r; // torque on wheel
    const capBrakeR = Math.min(brake * CAR.brakeForceMax * (1 - CAR.brakeFrontShare) + c.handbrake * d.handbrake, CAR.mu * Nr) + rollR;
    const capTyreF = CAR.mu * Nf, capLatR = CAR.mu * Nr;

    const rFx = fx * CAR.a, rFz = fz * CAR.a;
    const rRx = -fx * CAR.b, rRz = -fz * CAR.b;
    const cF_long = rFz * dFx - rFx * dFz;
    const cF_lat = rFz * nFx - rFx * nFz;
    const cR_long = rRz * fx - rRx * fz;
    const cR_lat = rRz * lx - rRx * lz;
    const kEng = invIe;
    const kClutch = invIe + Gr * Gr * invIw;
    const kBrakeF = invIw;
    const kTyreF = r * r * invIw + invM + cF_long * cF_long * invIz;
    const kLatF = invM + cF_lat * cF_lat * invIz;
    const kLongR = invM + cR_long * cR_long * invIz;
    const kLatR = invM + cR_lat * cR_lat * invIz;

    let accEng = 0, accClutch = 0, accBrakeF = 0, accTyreF = 0, accLatF = 0, accLongR = 0, accLatR = 0;
    const capE = fricT * dt, capC = capClutch * dt, capBF = capBrakeF * dt;
    const capTF = capTyreF * dt, capRB = capBrakeR * dt, capLR = capLatR * dt;
    const pvel = (rx, rz, dx, dz) => (this.vx + this.yawRate * rz) * dx + (this.vz - this.yawRate * rx) * dz;
    const applyCar = (P, dx, dz, cc) => { this.vx += P * dx * invM; this.vz += P * dz * invM; this.yawRate += P * cc * invIz; };

    for (let it = 0; it < ITER; it++) {
      // engine internal friction (stiction at 0 rpm)
      {
        const rel = this.omegaE;
        let lam = -rel / kEng;
        const nv = clamp(accEng + lam, -capE, capE); lam = nv - accEng; accEng = nv;
        this.omegaE += lam * invIe;
      }
      // clutch
      if (capC > 0) {
        const rel = this.omegaE - Gr * this.omegaW;
        let lam = -rel / kClutch;
        const nv = clamp(accClutch + lam, -capC, capC); lam = nv - accClutch; accClutch = nv;
        this.omegaE += lam * invIe;
        this.omegaW -= Gr * lam * invIw;
      }
      // front brakes + rolling resistance on the wheel
      {
        let lam = -this.omegaW / kBrakeF;
        const nv = clamp(accBrakeF + lam, -capBF, capBF); lam = nv - accBrakeF; accBrakeF = nv;
        this.omegaW += lam * invIw;
      }
      // front tyre longitudinal
      {
        const rel = this.omegaW * r - pvel(rFx, rFz, dFx, dFz);
        let P = rel / kTyreF;
        const nv = clamp(accTyreF + P, -capTF, capTF); P = nv - accTyreF; accTyreF = nv;
        applyCar(P, dFx, dFz, cF_long);
        this.omegaW -= P * r * invIw;
      }
      // front lateral (friction circle: what's left after longitudinal)
      {
        const capL = Math.sqrt(Math.max(capTF * capTF - accTyreF * accTyreF, 0.09 * capTF * capTF));
        const rel = pvel(rFx, rFz, nFx, nFz);
        let P = -rel / kLatF;
        const nv = clamp(accLatF + P, -capL, capL); P = nv - accLatF; accLatF = nv;
        applyCar(P, nFx, nFz, cF_lat);
      }
      // rear longitudinal (brakes, handbrake, rolling)
      {
        const rel = pvel(rRx, rRz, fx, fz);
        let P = -rel / kLongR;
        const nv = clamp(accLongR + P, -capRB, capRB); P = nv - accLongR; accLongR = nv;
        applyCar(P, fx, fz, cR_long);
      }
      // rear lateral
      {
        const capL = Math.sqrt(Math.max(capLR * capLR - accLongR * accLongR, 0.09 * capLR * capLR));
        const rel = pvel(rRx, rRz, lx, lz);
        let P = -rel / kLatR;
        const nv = clamp(accLatR + P, -capL, capL); P = nv - accLatR; accLatR = nv;
        applyCar(P, lx, lz, cR_lat);
      }
    }

    // ---------------------------------------------------------------- diagnostics
    this.clutchTorque = accClutch / dt;
    this.clutchSlip = this.omegaE - Gr * this.omegaW;
    if (capC > 0) {
      const heat = Math.abs(this.clutchTorque * this.clutchSlip) * dt;
      this.clutchTemp += heat / CAR.clutchHeatCap;
    }
    this.clutchTemp -= (this.clutchTemp - 20) * 0.018 * dt;
    if (!this.clutchHot && this.clutchTemp > CAR.clutchHotTemp) { this.clutchHot = true; this.emit('clutchHot'); }
    if (this.clutchHot && this.clutchTemp < CAR.clutchHotTemp - 40) this.clutchHot = false;
    this.engineLoad = clamp(Math.abs(this.clutchTorque) / Math.max(20, torqueCurve(Math.abs(this.omegaE * RPM_PER_RADS)) * d.torqueMul), 0, 1.5);
    const vF = pvel(rFx, rFz, dFx, dFz);
    this.slipF = this.omegaW * r - vF;
    this.slipLat = Math.max(Math.abs(accLatF) / Math.max(capTF, 1), Math.abs(accLatR) / Math.max(capLR, 1));
    const lockR = Math.abs(accLongR) >= capRB * 0.999 && Math.abs(pvel(rRx, rRz, fx, fz)) > 0.4;
    this.rearLocked = lockR;
    const squeal = Math.max(
      clamp((Math.abs(this.slipF) - 0.6) / 3, 0, 1),
      clamp((this.slipLat - 0.97) * 30, 0, 1) * clamp(spd / 3, 0, 1),
      lockR ? clamp(spd / 4, 0, 1) : 0);
    this.tyreSqueal = squeal;

    // ---------------------------------------------------------------- integrate
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.psi += this.yawRate * dt;
    if (this.psi > Math.PI) this.psi -= 2 * Math.PI; else if (this.psi < -Math.PI) this.psi += 2 * Math.PI;
    this.wheelRotF += this.omegaW * dt;
    this.wheelRotR += (this.fwdSpeed / r) * dt;

    // accelerations for weight transfer / body motion (filtered)
    const fwdV = this.fwdSpeed;
    const latV = this.vx * lx + this.vz * lz;
    const axRaw = (fwdV - this.prevFwdV) / dt;
    this.prevFwdV = fwdV;
    this.axF += (clamp(axRaw, -15, 15) - this.axF) * clamp(dt * 12, 0, 1);
    const ayRaw = fwdV * this.yawRate;
    this.ayF += (clamp(ayRaw, -12, 12) - this.ayF) * clamp(dt * 12, 0, 1);
    void latV;

    this.resolveCollisions(dt);
    this.updateHeights(dt);
    this.updateBody(dt);
    this.safety();
  }

  wheelPositions() {
    const sp = Math.sin(this.psi), cp = Math.cos(this.psi);
    const fx = sp, fz = cp, lx = cp, lz = -sp;
    const t = CAR.halfTrack;
    return [
      [this.x + fx * CAR.a + lx * t, this.z + fz * CAR.a + lz * t],  // FL
      [this.x + fx * CAR.a - lx * t, this.z + fz * CAR.a - lz * t],  // FR
      [this.x - fx * CAR.b + lx * t, this.z - fz * CAR.b + lz * t],  // RL
      [this.x - fx * CAR.b - lx * t, this.z - fz * CAR.b - lz * t],  // RR
    ];
  }

  updateHeights(dt = 0) {
    const wp = this.wheelPositions();
    const w = this.world;
    for (let i = 0; i < 4; i++) {
      const g = w.gradient(wp[i][0], wp[i][1]);
      this.wheelGrad[i] = g;
      this.wheelH[i] = w.base(wp[i][1]) + g[3];
      const k = g[2];
      if (dt > 0) {
        const prev = this.kerbState[i];
        if ((prev < 0.3 && k > 0.7) || (prev > 0.7 && k < 0.3)) {
          const sp = this.speed;
          if (sp > 0.15) {
            this.emit('kerb', clamp(sp / 4, 0.2, 1), { up: k > 0.7, wheel: i });
            this.bump += (k > 0.7 ? 1 : -0.6) * clamp(sp / 3, 0.3, 1);
          }
        }
        if (prev < 0.3 && k > 0.7) this.kerbState[i] = 1; else if (prev > 0.7 && k < 0.3) this.kerbState[i] = 0;
      } else this.kerbState[i] = k > 0.5 ? 1 : 0;
    }
    const hf = (this.wheelH[0] + this.wheelH[1]) / 2, hr = (this.wheelH[2] + this.wheelH[3]) / 2;
    const hl = (this.wheelH[0] + this.wheelH[2]) / 2, hrt = (this.wheelH[1] + this.wheelH[3]) / 2;
    const L = CAR.a + CAR.b;
    this.groundPitch = Math.atan2(hf - hr, L);       // nose up positive
    this.groundRoll = Math.atan2(hl - hrt, 2 * CAR.halfTrack); // left side up positive
    this.groundSlopeFwd = (hf - hr) / L;
    this.y = (hf * CAR.b + hr * CAR.a) / L;
    // slope at the CG (for diagnostics)
    this.slope = this.world.grade(this.z) * Math.cos(this.psi);
  }

  updateBody(dt) {
    // Visual suspension: spring-damper on pitch/roll driven by accelerations.
    const tp = this.axF * 0.011; // nose-up positive: squats accelerating, dives braking
    const tr = this.ayF * 0.016;
    const k = 60, c = 9;
    this.pitchVel += ((tp - this.bodyPitch) * k - this.pitchVel * c) * dt;
    this.bodyPitch += this.pitchVel * dt;
    this.rollVel += ((tr - this.bodyRoll) * k - this.rollVel * c) * dt;
    this.bodyRoll += this.rollVel * dt;
    this.bump *= Math.exp(-dt * 7);
  }

  resolveCollisions(dt) {
    const A = { cx: this.x, cz: this.z, hx: CAR.halfWidth, hz: CAR.halfLen, rot: this.psi };
    const invM = 1 / CAR.mass, invIz = 1 / CAR.yawInertia;
    let touching = 0, scrape = 0;
    const lists = [this.world.staticsNear(this.x, this.z), this.dynamics];
    for (let pass = 0; pass < 2; pass++) {
      for (const list of lists) {
        for (const o of list) {
          const hit = collide(A, o);
          if (!hit) continue;
          touching++;
          // positional correction
          const corr = Math.max(hit.depth - 0.002, 0);
          this.x += hit.nx * corr; this.z += hit.nz * corr;
          A.cx = this.x; A.cz = this.z;
          // velocity impulse at contact point
          const rx = hit.px - this.x, rz = hit.pz - this.z;
          let vpx = this.vx + this.yawRate * rz, vpz = this.vz - this.yawRate * rx;
          if (o.vx !== undefined) { vpx -= o.vx; vpz -= o.vz; }
          const vn = vpx * hit.nx + vpz * hit.nz;
          if (vn < 0) {
            const cn = rz * hit.nx - rx * hit.nz;
            const k = invM + cn * cn * invIz;
            const e = -vn > 1.0 ? 0.18 : 0.0;
            const j = (-(1 + e) * vn) / k;
            this.vx += j * hit.nx * invM; this.vz += j * hit.nz * invM; this.yawRate += j * cn * invIz;
            // friction
            const tx = -hit.nz, tz = hit.nx;
            const vt = vpx * tx + vpz * tz;
            const ct = rz * tx - rx * tz;
            const kt = invM + ct * ct * invIz;
            const jt = clamp(-vt / kt, -0.45 * j, 0.45 * j);
            this.vx += jt * tx * invM; this.vz += jt * tz * invM; this.yawRate += jt * ct * invIz;
            if (pass === 0 && -vn > 0.25 && this.contactCooldown <= 0) {
              this.emit('collision', clamp(-vn / 5, 0.1, 1), { tag: o.tag, speed: -vn });
              this.contactCooldown = 0.35;
              this.bump += clamp(-vn / 3, 0.2, 1.2);
            }
            if (Math.abs(vt) > 0.2) scrape = Math.max(scrape, Math.abs(vt));
          }
        }
      }
    }
    this.contactCooldown = (this.contactCooldown ?? 0) - dt;
    this.contact = touching;
    this.scrape = scrape;
  }

  safety() {
    const b = this.world.bounds;
    const bad = !Number.isFinite(this.x + this.z + this.vx + this.vz + this.yawRate + this.omegaE + this.omegaW);
    const out = this.x < b.x0 || this.x > b.x1 || this.z < b.z0 || this.z > b.z1;
    if (bad || out) {
      const p = this.lastSafe;
      const engine = { omegaE: Number.isFinite(this.omegaE) ? this.omegaE : 0 };
      this.reset(p, true);
      this.omegaE = engine.omegaE;
      this.emit('safetyReset');
      return;
    }
    // clamp absurd values (should never trigger in normal play)
    const sp = this.speed;
    if (sp > 60) { this.vx *= 60 / sp; this.vz *= 60 / sp; }
    this.yawRate = clamp(this.yawRate, -6, 6);
    this.omegaE = clamp(this.omegaE, -200, 760);
    if (this.contact === 0 && sp < 25) { this.lastSafe.x = this.x; this.lastSafe.z = this.z; this.lastSafe.psi = this.psi; }
  }
}
