// Core skiing physics: movement, steering, braking, determinism.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { run, DT, blankInput } from '../src/sim/harness.js';
import { Skier } from '../src/sim/skier.js';
import { makeTune } from '../src/config.js';

const slope = (deg, extra = {}) => new World({
  name: 'plane', length: 2000, startElevation: 1500, profile: [[0, deg], [2000, deg]],
  corridor: { center: () => 0, halfWidth: () => 200 }, noiseAmp: 0, features: [], ...extra,
});

test('skier accelerates downhill from rest and speed is bounded', () => {
  const r = run({ world: slope(25), z: 50, maxT: 30 });
  const v5 = r.log.find((l) => l.t >= 5).speed;
  const v30 = r.log[r.log.length - 1].speed;
  assert.ok(v5 > 10, `should be moving well after 5 s (${v5})`);
  assert.ok(v30 > v5, 'still accelerating');
  assert.ok(v30 < 45, `standing terminal velocity is bounded (${v30})`);
  assert.equal(r.sk.crashed, null);
});

test('tuck is faster than standing', () => {
  const a = run({ world: slope(28), z: 50, maxT: 25 });
  const b = run({ world: slope(28), z: 50, maxT: 25, script: (t, sk, i) => { i.tuck = 1; } });
  assert.ok(b.sk.speed > a.sk.speed + 4, `tuck ${b.sk.speed.toFixed(1)} vs stand ${a.sk.speed.toFixed(1)}`);
});

test('A/D carve changes heading and keeps most speed', () => {
  const r = run({
    world: slope(20), z: 50, speed: 15, maxT: 0.8,
    script: (t, sk, i) => { i.steer = 1; },
  });
  const straight = run({ world: slope(20), z: 50, speed: 15, maxT: 0.8 });
  assert.ok(r.sk.heading < -0.3, `turned right (heading ${r.sk.heading.toFixed(2)})`);
  assert.ok(r.sk.speed > straight.sk.speed * 0.75, `carving keeps speed (${r.sk.speed.toFixed(1)} vs ${straight.sk.speed.toFixed(1)})`);
  assert.equal(r.sk.crashed, null);
});

test('snowplough (S) stops the skier on a moderate slope', () => {
  const r = run({ world: slope(12), z: 50, speed: 12, maxT: 12, script: (t, sk, i) => { i.brake = 1; } });
  assert.ok(r.sk.speed < 2, `braked to ${r.sk.speed.toFixed(2)}`);
});

test('ice has less grip: same hard turn skids more on ice', () => {
  const ice = slope(20, { surfaces: [{ zMin: 0, zMax: 2000, test: () => ({ name: 'ice', mu: 0.012, grip: 0.2, steer: 0.45, rough: 0, chatter: true }) }] });
  const turn = (t, sk, i) => { i.steer = 1; };
  const a = run({ world: slope(20), z: 50, speed: 18, maxT: 1.2, script: turn });
  const b = run({ world: ice, z: 50, speed: 18, maxT: 1.2, script: turn });
  assert.ok(Math.abs(b.sk.heading) < Math.abs(a.sk.heading), 'less steering authority on ice');
});

test('simulation is deterministic for identical input', () => {
  const w = slope(22);
  const script = (t, sk, i) => { i.steer = Math.sin(t * 2); i.py = Math.sin(t * 5) * 0.8; i.px = Math.cos(t * 3) * 0.5; };
  const a = run({ world: w, z: 50, maxT: 8, script });
  const b = run({ world: w, z: 50, maxT: 8, script });
  assert.deepEqual(a.sk.serialize(), b.sk.serialize());
});

test('holding a deep crouch for a long time makes you sit back', () => {
  const r = run({ world: slope(20), z: 50, speed: 10, maxT: 6, script: (t, sk, i) => { i.py = -1; } });
  assert.ok(r.sk.balF < -0.05 || r.sk.crashed, `balance pushed back (${r.sk.balF.toFixed(2)})`);
});

test('a flick on flat-ish snow is an ollie: big flick hops higher than a slow extension', () => {
  const hop = (dur) => {
    let maxAir = 0;
    run({
      world: slope(8), z: 50, speed: 8, maxT: 3,
      script: (t, sk, i) => {
        if (t < 0.8) i.py = Math.max(-0.8, -t * 2);
        else i.py = Math.min(1, -0.8 + ((t - 0.8) / dur) * 1.8);
        if (!sk.grounded) maxAir = Math.max(maxAir, sk.airTime);
      },
    });
    return maxAir;
  };
  const fast = hop(0.06);
  const slow = hop(0.6);
  assert.ok(fast > 0.25, `fast flick gives a real hop (${fast.toFixed(2)} s)`);
  assert.ok(fast > slow * 1.5, `fast ${fast.toFixed(2)} vs slow ${slow.toFixed(2)}`);
});
