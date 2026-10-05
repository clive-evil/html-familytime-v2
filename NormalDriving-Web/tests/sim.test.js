import test from 'node:test';
import assert from 'node:assert/strict';
import { rig, ctl, startEngine, DT } from './helpers.js';
import { H_MAP } from '../src/sim/driver.js';

// a clear 16% stretch in the uphill lane (just after the roadworks)
const HILL = (r) => { r.place(79.9, 96, 0); };

test('engine starts with clutch down in neutral and settles at idle', () => {
  const r = rig();
  startEngine(r);
  assert.equal(r.car.running, true);
  assert.ok(r.car.rpm > 750 && r.car.rpm < 950, `idle rpm ${r.car.rpm}`);
  assert.equal(r.count('catch'), 1);
});

test('engine does not start instantly: needs cranking time', () => {
  const r = rig();
  r.raw(0.2, ctl({ ignition: true }));
  assert.equal(r.car.running, false);
});

test('dumping the clutch at idle in first stalls the engine (and car does not reset)', () => {
  const r = rig();
  const c = startEngine(r);
  r.car.setGear(1);
  c.clutch = 0;
  const z0 = r.car.z;
  r.raw(1.5, c);
  assert.equal(r.car.running, false);
  assert.equal(r.count('stall'), 1);
  assert.ok(Math.abs(r.car.z - z0) < 2, 'car stays roughly where it was');
  assert.equal(r.car.gear, 1, 'still in gear after a stall');
});

test('stalled engine stays stalled until the player restarts it', () => {
  const r = rig();
  const c = startEngine(r);
  r.car.setGear(1); c.clutch = 0;
  r.raw(4, c);
  assert.equal(r.car.running, false);
  assert.equal(r.count('catch'), 1, 'no automatic restart');
  // restart in gear with the clutch floored
  c.clutch = 1; c.ignition = true;
  r.raw(1.2, c); c.ignition = false; r.raw(0.5, c);
  assert.equal(r.car.running, true);
});

test('cranking in gear with the clutch up lurches the car instead of starting cleanly', () => {
  const r = rig();
  r.car.setGear(1);
  const z0 = r.car.z;
  r.raw(0.8, ctl({ ignition: true, clutch: 0 }));
  assert.ok(r.car.z - z0 > 0.05, 'starter motor shoves the car forward');
});

test('a smooth clutch release with a little throttle moves off without stalling', () => {
  const r = rig();
  const c = startEngine(r);
  r.car.setGear(1);
  // release over ~3 s, slow through the bite
  r.raw(4, c, (t, c) => {
    c.throttle = 0.18;
    c.clutch = t < 0.5 ? 1 - t * 0.6 : Math.max(0, 0.7 - (t - 0.5) * 0.25);
  });
  assert.equal(r.car.running, true);
  assert.equal(r.count('stall'), 0);
  assert.ok(r.car.fwdSpeed > 1.5, `speed ${r.car.fwdSpeed}`);
});

test('bite point matters: same throttle, fast release stalls, slow release does not', () => {
  const fast = rig();
  let c = startEngine(fast); fast.car.setGear(1);
  fast.raw(2, c, (t, c) => { c.throttle = 0.12; c.clutch = Math.max(0, 1 - t * 5); });
  const slow = rig();
  c = startEngine(slow); slow.car.setGear(1);
  slow.raw(8, c, (t, c) => { c.throttle = 0.12; c.clutch = t < 0.4 ? 1 - t : Math.max(0, 0.66 - (t - 0.4) * 0.06); });
  assert.equal(fast.car.running, false, 'fast release stalls');
  assert.equal(slow.car.running, true, 'slow release survives');
});

test('too much throttle while slipping heats the clutch', () => {
  const r = rig();
  const c = startEngine(r);
  r.car.setGear(1);
  c.handbrake = 1; c.brake = 1; c.throttle = 0.8; c.clutch = 0.56;
  r.raw(25, c);
  assert.ok(r.car.clutchTemp > 200, `temp ${r.car.clutchTemp}`);
  assert.ok(r.count('clutchHot') >= 1);
});

test('on the hill in neutral with no brakes the car rolls backwards', () => {
  const r = rig();
  HILL(r);
  r.raw(2, ctl({ clutch: 1 }));
  assert.ok(r.car.fwdSpeed < -1, `v ${r.car.fwdSpeed}`);
});

test('handbrake holds the car on the hill', () => {
  const r = rig();
  HILL(r);
  r.raw(3, ctl({ handbrake: 1 }));
  assert.ok(Math.abs(r.car.fwdSpeed) < 0.01);
});

test('foot brake holds the car on the hill', () => {
  const r = rig();
  HILL(r);
  r.raw(3, ctl({ brake: 0.6 }));
  assert.ok(Math.abs(r.car.fwdSpeed) < 0.01);
});

test('a handbrake hill start works (and pulling away without one rolls back first)', () => {
  const r = rig();
  HILL(r);
  const c = startEngine(r, { handbrake: 1 });
  r.car.setGear(1);
  const z0 = r.car.z;
  // revs up, find the bite, drop the handbrake, ease the clutch out
  r.raw(5, c, (t, c) => {
    c.throttle = 0.5;
    c.clutch = Math.max(0, 0.7 - 0.25 * Math.min(1, t / 2) - (t > 4 ? 0.45 : 0));
    if (t > 1.3) c.handbrake = 0;
  });
  assert.equal(r.car.running, true, 'did not stall');
  assert.ok(r.car.z > z0 + 5, `moved uphill ${r.car.z - z0}`);
  assert.equal(r.count('stall'), 0);
  // same thing without throttle: stall, then the car rolls back
  const b = rig();
  HILL(b);
  const c2 = startEngine(b, { handbrake: 1 });
  b.car.setGear(1);
  b.raw(4, c2, (t, c) => { c.clutch = Math.max(0, 0.7 - t * 0.3); if (t > 1) c.handbrake = 0; });
  assert.equal(b.car.running, false, 'no throttle on a 1-in-6 stalls');
  c2.clutch = 1; b.raw(1.5, c2);
  assert.ok(b.car.fwdSpeed < -0.5, 'and then rolls back with the clutch down');
});

test('braking stops the car from 30 mph in a sane distance', () => {
  const r = rig();
  r.place(-60, -1.9, Math.PI / 2);
  r.car.vx = 13.4; // 30 mph east
  const x0 = r.car.x;
  r.raw(4, ctl({ brake: 1, clutch: 1 }));
  assert.ok(r.car.speed < 0.05);
  const d = r.car.x - x0;
  assert.ok(d > 8 && d < 25, `stopping distance ${d}`);
});

test('reverse gear drives the car backwards', () => {
  const r = rig();
  const c = startEngine(r);
  r.car.setGear(-1);
  r.raw(4, c, (t, c) => { c.throttle = 0.2; c.clutch = Math.max(0, 0.75 - t * 0.2); });
  assert.ok(r.car.fwdSpeed < -0.8, `v ${r.car.fwdSpeed}`);
  assert.equal(r.car.running, true);
});

test('all five gears pull, neutral does not', () => {
  const r = rig();
  r.place(-85, -1.9, Math.PI / 2);
  const c = startEngine(r);
  r.car.setGear(1);
  r.raw(3, c, (t, c) => { c.throttle = 0.35; c.clutch = Math.max(0, 0.68 - t * 0.25); });
  for (const g of [2, 3, 4, 5]) {
    // up-shift: clutch in, select, clutch out
    c.throttle = 0; c.clutch = 1; r.raw(0.3, c);
    assert.ok(r.car.canEngage(g, 1), `can engage ${g}`);
    r.car.setGear(g);
    const v0 = r.car.fwdSpeed;
    r.raw(2.2, c, (t, c) => { c.clutch = Math.max(0, 1 - t * 1.2); c.throttle = t > 0.3 ? 0.9 : 0.2; });
    assert.equal(r.car.gear, g);
    assert.ok(r.car.fwdSpeed > v0 - 0.3, `gear ${g} pulls (v ${v0.toFixed(1)} → ${r.car.fwdSpeed.toFixed(1)})`);
    assert.equal(r.car.running, true, `running in ${g}`);
  }
  assert.ok(r.car.fwdSpeed > 10, `reached ${r.car.fwdSpeed}`);
  // neutral: flat out, no drive
  const n = rig();
  const c2 = startEngine(n);
  c2.clutch = 0; c2.throttle = 1;
  n.raw(3, c2);
  assert.ok(Math.abs(n.car.fwdSpeed) < 0.05);
  assert.ok(n.car.rpm > 5000, 'engine revs freely in neutral');
});

test('selecting a gear with the clutch up grinds and stays in neutral (button gearbox)', () => {
  const r = rig('B');
  startEngine(r);
  r.drive(0.2);
  r.drive(DT, (t, I) => { I.gearDirect = 1; });
  assert.equal(r.car.gear, 0);
  assert.equal(r.count('grind'), 1);
  // with the clutch floored it goes in
  r.drive(1.0, (t, I) => { I.clutch.digital = true; });
  r.drive(DT, (t, I) => { I.clutch.digital = true; I.gearDirect = 1; });
  assert.equal(r.car.gear, 1);
});

test('H-pattern: lever positions map to gears deterministically, neutral plane selects nothing', () => {
  const r = rig('C');
  startEngine(r);
  const res = {};
  for (const [col, dir, expect] of [[-1, 1, 1], [-1, -1, 2], [0, 1, 3], [0, -1, 4], [1, 1, 5], [1, -1, -1]]) {
    // clutch down, push the stick to that corner, then back to neutral
    for (let rep = 0; rep < 3; rep++) {
      // across the neutral plane first, then into the gate
      r.drive(0.3, (t, I) => { I.clutch.digital = true; I.lever.stick = [col * 0.8, 0]; });
      r.drive(0.4, (t, I) => { I.clutch.digital = true; I.lever.stick = [col * 0.8, -dir * 0.8]; });
      res[`${col},${dir},${rep}`] = r.car.gear;
      assert.equal(r.car.gear, expect, `col ${col} dir ${dir}`);
      assert.equal(H_MAP[col][dir > 0 ? 'up' : 'down'], expect);
      r.drive(0.6, (t, I) => { I.clutch.digital = true; I.lever.stick = [0, 0.5 * dir]; });
      r.drive(0.6, (t, I) => { I.clutch.digital = true; I.lever.stick = null; });
      assert.equal(r.car.gear, 0, 'back to neutral');
    }
  }
  // sideways only in the neutral plane: never engages a gear
  r.drive(1, (t, I) => { I.clutch.digital = true; I.lever.stick = [Math.sin(t * 6), 0.0]; });
  assert.equal(r.car.gear, 0);
});

test('H-pattern: a sloppy diagonal lands in the neighbouring gate predictably', () => {
  const r = rig('C');
  startEngine(r);
  // aiming for 1 with a lazy diagonal flick from neutral → 3 (every time)
  for (let i = 0; i < 3; i++) {
    r.drive(0.8, (t, I) => { I.clutch.digital = true; I.lever.stick = [-0.85, -0.85]; });
    assert.equal(r.car.gear, 3);
    r.drive(0.6, (t, I) => { I.clutch.digital = true; I.lever.stick = [0, 0.3]; });
    r.drive(0.4, (t, I) => { I.clutch.digital = true; I.lever.stick = null; });
  }
});

test('H-pattern: no clutch → grind, lever blocked, gear not engaged', () => {
  const r = rig('C');
  startEngine(r);
  r.drive(0.3, (t, I) => { I.lever.stick = [-0.8, 0]; });
  r.drive(0.8, (t, I) => { I.lever.stick = [-0.8, -0.8]; });
  assert.equal(r.car.gear, 0);
  assert.ok(r.count('grind') >= 1);
  assert.ok(r.count('grind') <= 2, 'one grind per attempt, not per frame');
});

test('physical steering takes real time to reach lock and stays put when released', () => {
  const r = rig('B');
  const max = r.settings.steeringTurns * 180;
  r.drive(0.5, (t, I) => { I.steer.axis = 1; });
  assert.ok(r.driver.steerDeg > 100 && r.driver.steerDeg < max * 0.5, `after 0.5s ${r.driver.steerDeg}`);
  r.drive(1.5, (t, I) => { I.steer.axis = 1; });
  assert.ok(Math.abs(r.driver.steerDeg - max) < 1, 'reached lock');
  r.drive(2.0, (t, I) => { I.steer.axis = 0; });
  assert.ok(Math.abs(r.driver.steerDeg - max) < 1, 'no snap back at a standstill');
});

test('gesture steering: rotating the stick winds the wheel; letting go leaves it', () => {
  const r = rig('C');
  r.drive(2.0, (t, I) => { const a = t * Math.PI * 1.5; I.steer.stick = [Math.sin(a), -Math.cos(a)]; });
  assert.ok(r.driver.steerDeg > 400, `wound ${r.driver.steerDeg}`);
  const d = r.driver.steerDeg;
  r.drive(1.0, (t, I) => { I.steer.stick = null; });
  assert.ok(Math.abs(r.driver.steerDeg - d) < 1);
});

test('analogue steering still has finite wheel speed', () => {
  const r = rig('A');
  r.drive(0.1, (t, I) => { I.steer.axis = 1; });
  assert.ok(r.driver.steerDeg < r.settings.steeringTurns * 180 * 0.7);
});

test('the car cannot leave the map or go NaN under abuse', () => {
  const r = rig('A');
  const c = startEngine(r);
  r.car.setGear(1);
  let maxSpeed = 0;
  for (let k = 0; k < 40; k++) {
    r.raw(1.5, c, (t, c) => {
      c.clutch = 0; c.throttle = 1; c.steerDeg = Math.sin(k * 1.3) * 540;
      if (r.car.rpm > 5500 && r.car.gear < 3) { r.car.setGear(r.car.gear + 1); }
      if (!r.car.running) { c.clutch = 1; c.ignition = true; } else c.ignition = false;
    });
    maxSpeed = Math.max(maxSpeed, r.car.speed);
    const b = r.world.bounds;
    assert.ok(Number.isFinite(r.car.x) && r.car.x > b.x0 && r.car.x < b.x1 && r.car.z > b.z0 && r.car.z < b.z1);
  }
  assert.ok(r.count('collision') > 0, 'hit something, presumably');
});

test('presets change the relevant systems', async () => {
  const { applyPreset, DEFAULT_SETTINGS } = await import('../src/sim/params.js');
  const a = applyPreset(DEFAULT_SETTINGS, 'A'), b = applyPreset(DEFAULT_SETTINGS, 'B');
  const c = applyPreset(DEFAULT_SETTINGS, 'C'), d = applyPreset(DEFAULT_SETTINGS, 'D');
  assert.equal(a.steeringMode, 'analogue'); assert.equal(a.gearbox, 'button'); assert.equal(a.assists.autoClutch, false);
  assert.equal(b.steeringMode, 'physical'); assert.equal(b.gearbox, 'button');
  assert.equal(c.gearbox, 'hpattern'); assert.notEqual(c.steeringMode, 'analogue');
  assert.equal(d.assists.autoClutch, true); assert.ok(d.steeringSpeed > b.steeringSpeed);
});

test('auto clutch (preset D) pulls away and does not stall', () => {
  const r = rig('D');
  startEngine(r);
  r.drive(0.3, (t, I) => { I.handbrake.pressed = t === 0; });
  r.drive(0.2, (t, I) => { I.gearDirect = 1; });
  assert.equal(r.car.gear, 1);
  r.drive(5, (t, I) => { I.throttle.analog = 0.35; });
  assert.equal(r.car.running, true);
  assert.ok(r.car.fwdSpeed > 3, `v ${r.car.fwdSpeed}`);
});

test('mounting a kerb is an event, costs speed, and does not reset anything', () => {
  const r = rig();
  // Mill Road, angled towards the north kerb (z = +3.8) at walking pace
  r.place(-30, 1.0, Math.PI / 2 - 0.5);
  r.car.vx = Math.sin(r.car.psi) * 2.2; r.car.vz = Math.cos(r.car.psi) * 2.2;
  r.raw(2.0, ctl({ clutch: 1 }));
  assert.ok(r.events.some((e) => e.type === 'kerb' && e.up), 'kerb event');
  assert.ok(r.car.speed < 2.1, 'lost some speed');
  // a stationary car pushing at the kerb needs more than idle creep
  const r2 = rig();
  r2.place(-30, 2.6, 0); // facing +z, front wheels ~0.3 m short of the kerb
  const c = startEngine(r2);
  r2.car.setGear(1);
  r2.raw(3, c, (t, c) => { c.clutch = Math.max(0, 0.62 - t * 0.12); c.throttle = 0.0; });
  const climbedIdle = r2.car.kerbState[0] || r2.car.kerbState[1];
  assert.ok(!climbedIdle || !r2.car.running, 'idle creep alone does not hop the kerb cleanly');
});

test('reversing into a parked car: THUNK, the car stops, nothing resets', () => {
  const r = rig();
  const p = r.world.spaceCarA;
  r.place(p.x - 4.4, p.z, -Math.PI / 2); // facing west, parked car right behind us
  const c = startEngine(r);
  r.car.setGear(-1);
  r.raw(3, c, (t, c) => { c.throttle = 0.3; c.clutch = Math.max(0, 0.7 - t * 0.4); });
  const hits = r.events.filter((e) => e.type === 'collision');
  assert.ok(hits.length >= 1, 'collision event');
  assert.ok(r.car.x < p.x - 1.95 - 1.7, 'did not pass through the other car');
  assert.ok(Number.isFinite(r.car.x) && r.count('safetyReset') === 0, 'no reset');
});
