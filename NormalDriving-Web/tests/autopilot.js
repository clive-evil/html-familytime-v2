// A deliberately mechanical "driving instructor" bot used only by tests.
// It drives through the same intents → Driver → CarSim pipeline a player uses
// (manual clutch, button gears, physical steering), proving the route and
// every objective can be completed.

import { World } from '../src/world/layout.js';
import { CarSim } from '../src/sim/car.js';
import { Driver, emptyIntents } from '../src/sim/driver.js';
import { DEFAULT_SETTINGS, applyPreset, CAR } from '../src/sim/params.js';
import { Traffic } from '../src/world/traffic.js';
import { Route, IDS } from '../src/world/route.js';
import { clamp, offsetPolyline, resample, cumulative, projectOnPolyline, pointAt, wrapAngle, RPM_PER_RADS } from '../src/sim/math.js';

export const DT = 1 / 240;

export function makeGame(preset = 'A', over = {}) {
  let settings = applyPreset({ ...DEFAULT_SETTINGS, assists: { ...DEFAULT_SETTINGS.assists } }, preset);
  settings = { ...settings, ...over };
  const world = new World({ hillSteepness: settings.hillSteepness });
  const car = new CarSim(world, settings);
  const driver = new Driver(settings);
  const traffic = new Traffic(world);
  const route = new Route(world);
  const g = { settings, world, car, driver, traffic, route, t: 0, log: [] };
  // one 60 Hz "frame" = driver update + 4 physics substeps + route/traffic
  g.frame = (I) => {
    const dt = 1 / 60;
    const c = driver.update(dt, I, car);
    car.dynamics = traffic.colliders();
    for (let i = 0; i < 4; i++) car.step(DT, c);
    car.grinding = driver.grindHeld;
    const ctx = { car, driver, traffic, lookYaw: g.lookYaw || 0, settings, stepId: route.step, ids: IDS, legitWait: false };
    route.update(dt, ctx);
    ctx.stepId = route.step;
    traffic.update(dt, car, ctx);
    for (const e of car.events) g.log.push({ t: g.t, ...e });
    car.events.length = 0;
    g.t += dt;
  };
  return g;
}

// ------------------------------------------------------------------ paths
export function routePath(world) {
  const lane = offsetPolyline(world.millHill, 1.9);
  const pts = [];
  // yard → junction
  for (let z = -100; z <= -6; z += 2) pts.push([1.2 * Math.min(1, (z + 100) / 40), z]);
  // left turn onto Mill Road (radius ~8)
  for (let i = 1; i <= 10; i++) { const a = (i / 10) * Math.PI / 2; pts.push([1.2 + 8 - 8 * Math.cos(a), -6 + 4.1 * Math.sin(a)]); }
  // Mill Road → hill lane, with swerves for the parked car and roadworks / give-way
  for (const p of lane) {
    if (p[0] < 10 && p[1] < 5) continue;
    let [x, z] = p;
    if (x > 29 && x < 43 && z < 1) z = -1.9 + 1.6 * Math.sin(Math.PI * clamp((x - 29) / 14, 0, 1));
    if (z > 61 && z < 98 && x > 74) x = 79.9 - 3.95 * Math.sin(Math.PI * clamp((z - 61) / 37, 0, 1)) ** 0.5;
    if (z > 148 && z < 190) x = 71.9 - 2.2 * Math.sin(Math.PI * clamp((z - 148) / 42, 0, 1)) ** 0.5;
    if (z > 238) break;
    pts.push([x, z]);
  }
  return resample(pts, 1).pts;
}

export function topPath(world) {
  // from the top stop line: right turn into the westbound lane, past the space
  const pts = [];
  for (let z = 236; z <= 244; z += 1) pts.push([71.9, z]);
  for (let i = 1; i <= 14; i++) { const a = (i / 14) * Math.PI / 2; pts.push([71.9 - 7 + 7 * Math.cos(a), 244 + 6.9 * Math.sin(a)]); }
  for (let x = 63; x >= world.parkSpace.x0 - 4; x -= 1) pts.push([x, 250.9]);
  return resample(pts, 1).pts;
}

export function nanPath(world, fromX) {
  const nd = world.nanDrive;
  const pts = [];
  // swing out towards the crown of the road first, then a wide arc in
  const R = 6.3, z0 = 249.6;
  for (let x = fromX; x >= nd.cx + R; x -= 1) pts.push([x, 251.2 + (z0 - 251.2) * Math.min(1, (fromX - x) / 8)]);
  for (let i = 1; i <= 14; i++) { const a = (i / 14) * Math.PI / 2; pts.push([nd.cx + R - R * Math.sin(a), z0 + R - R * Math.cos(a)]); }
  for (let z = z0 + R + 1; z <= 263; z += 1) pts.push([nd.cx, z]);
  return resample(pts, 0.5).pts;
}

// ------------------------------------------------------------------ the bot
export class Bot {
  constructor(g) {
    this.g = g;
    this.I = emptyIntents();
    this.clutch = 1; this.state = 'idle';
    this.launchT = 0;
  }
  intents() { return this.I; }

  // steering towards a path with pure pursuit; returns cross-track
  steerTo(path, cum, reverse = false, ld = 3.2) {
    const car = this.g.car;
    const f = [Math.sin(car.psi), Math.cos(car.psi)];
    const rx = car.x - f[0] * CAR.b, rz = car.z - f[1] * CAR.b;
    const pr = projectOnPolyline(path, cum, rx, rz);
    const Ld = ld + Math.abs(car.fwdSpeed) * 0.45;
    const tp = pointAt(path, cum, pr.s + Ld);
    const ang = Math.atan2(tp.x - rx, tp.z - rz);
    const alpha = wrapAngle(ang - car.psi);
    const L = CAR.a + CAR.b;
    let delta = Math.atan2(2 * L * Math.sin(alpha), Ld); // + = left
    if (reverse) delta = -delta;
    const maxDeg = this.g.settings.steeringTurns * 180;
    const steerDeg = clamp((-delta / (CAR.maxRoadAngle * Math.PI / 180)) * maxDeg, -maxDeg, maxDeg);
    this.setWheel(steerDeg);
    return pr;
  }

  setWheel(deg) {
    const maxDeg = this.g.settings.steeringTurns * 180;
    // analogue mode: axis sets the target directly
    this.I.steer.axis = clamp(deg / maxDeg, -1, 1);
  }

  gear(g) { if (this.g.car.gear !== g) this.I.gearDirect = g; }

  // speed control with a manual clutch. target in m/s (negative = reverse)
  drive(vt, hillHold = false) {
    const g = this.g, car = g.car, I = this.I;
    const v = car.fwdSpeed;
    const rpm = car.rpm;
    const want = vt < 0 ? -1 : 1;
    const speed = Math.abs(v);
    const target = Math.abs(vt);
    I.throttle.analog = 0; I.brake.analog = 0; I.handbrake.pressed = false;
    if (!car.running) {
      // restart drill: clutch down, neutral, crank
      this.clutch = 1; this.gear(0);
      I.ignition = this.clutch > 0.95 && car.gear === 0 && !this.cranked;
      if (car.cranking) this.cranked = false;
      I.clutch.analog = 1;
      this.state = 'stopped';
      return;
    }
    I.ignition = false;
    if (target < 0.05) {
      // stop
      if (speed > 0.05) I.brake.analog = clamp(0.25 + speed * 0.12, 0, 0.9);
      else I.brake.analog = 0.35;
      if (speed < 2.5) this.clutch = 1;
      if (speed < 0.05 && hillHold && g.driver.handbrakeTarget < 0.5) I.handbrake.pressed = true;
      I.clutch.analog = this.clutch;
      this.state = 'stopped';
      return;
    }
    // choose gear
    let gr;
    if (want < 0) gr = -1;
    else gr = car.gear >= 1 ? car.gear : 1;
    if (want > 0 && car.gear >= 1) {
      const ratioRpm = (n) => (Math.abs(v) / CAR.wheelR) * CAR.ratios[n] * CAR.finalDrive * RPM_PER_RADS;
      if (ratioRpm(car.gear) > 2900 && car.gear < 3 && target > ratioRpm(car.gear) * 0) gr = car.gear + 1;
      if (car.gear > 1 && ratioRpm(car.gear) < 1300) gr = car.gear - 1;
    }
    if (gr !== car.gear) {
      // shift: clutch down first
      this.clutch = 1; I.clutch.analog = 1; I.throttle.analog = 0;
      if (g.driver.clutchOut > 0.95) this.gear(gr);
      this.state = 'shift';
      return;
    }
    const slip = Math.abs(car.clutchSlip);
    const err = target - speed;
    if (this.state !== 'drive') {
      // launching / re-engaging: hold revs, ease the clutch through the bite
      const revTarget = gr === -1 ? 1500 : (this.g.world.grade(car.z) > 0.05 ? 2400 : 1700);
      I.throttle.analog = clamp(0.25 + (revTarget - rpm) * 0.0012, 0, 1);
      const bite = g.settings.bitePoint;
      if (this.clutch > bite + 0.12) this.clutch -= 0.012;
      else if (rpm > revTarget - 300) this.clutch -= 0.0016;
      else if (rpm < revTarget - 700) this.clutch += 0.004;
      this.clutch = clamp(this.clutch, 0, 1);
      // drop the handbrake once the clutch is clearly pulling
      if (g.driver.handbrakeTarget > 0.5 && Math.abs(car.clutchTorque) > 45) I.handbrake.pressed = true;
      if (g.driver.handbrakeTarget > 0.5 && !hillHold && this.clutch < bite + 0.1) I.handbrake.pressed = true;
      if (slip < 6 && speed > 0.8) { this.clutch = 0; this.state = 'drive'; }
      if (speed > target + 0.6) { I.throttle.analog = 0; }
    } else {
      this.clutch = 0;
      I.throttle.analog = clamp(0.15 + err * 0.25, 0, 0.85);
      if (err < -0.8) { I.throttle.analog = 0; I.brake.analog = clamp(-err * 0.15, 0, 0.6); }
      if (rpm < 1050 && speed < target) { this.state = 'launch'; this.clutch = g.settings.bitePoint; }
    }
    I.clutch.analog = this.clutch;
  }
}
