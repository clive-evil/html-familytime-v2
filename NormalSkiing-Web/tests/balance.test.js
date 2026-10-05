// Recovery: a bad landing can be saved with corrective posture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { run } from '../src/sim/harness.js';

const plane = new World({
  name: 'plane', length: 2000, startElevation: 1500, profile: [[0, 18], [2000, 18]],
  corridor: { center: () => 0, halfWidth: () => 200 }, noiseAmp: 0, features: [],
});

function kicked(kickF, kickL, correct) {
  let kickedAt = null;
  const r = run({
    world: plane, z: 50, speed: 15, maxT: 4,
    script: (t, sk, i) => {
      if (t > 0.5 && kickedAt === null) {
        kickedAt = t;
        sk.balFv += kickF;
        sk.balLv += kickL;
      }
      if (correct && kickedAt !== null) {
        // move the body against the lean (posture changes are what count)
        i.py = Math.max(-1, Math.min(1, i.py - sk.balF * 0.12 - sk.balFv * 0.03));
        i.px = Math.max(-1, Math.min(1, -sk.balL * 1.6 - sk.balLv * 0.25));
      }
    },
  });
  return r.sk;
}

test('small disturbances recover on their own (forgiving base)', () => {
  const sk = kicked(-1.5, 1.0, false);
  assert.equal(sk.crashed, null);
});

test('a big backward kick crashes without input but can be saved with posture', () => {
  const kick = -7.5;
  const passive = kicked(kick, 0, false);
  const active = kicked(kick, 0, true);
  assert.ok(passive.crashed, 'passive skier falls');
  assert.equal(active.crashed, null, 'active correction saves it');
});

test('a big sideways kick can be saved with weight shift', () => {
  const kick = 7.5;
  const passive = kicked(0, kick, false);
  const active = kicked(0, kick, true);
  assert.ok(passive.crashed, 'passive skier falls sideways');
  assert.equal(active.crashed, null, 'weight shift saves it');
});

test('balance state names track severity', () => {
  const sk = kicked(0, 0, false);
  sk.balF = 0.1; assert.equal(sk.balanceState, 'stable');
  sk.balF = 0.4; assert.equal(sk.balanceState, 'wobbling');
  sk.balF = 0.7; assert.equal(sk.balanceState, 'off-balance');
  sk.balF = 0.9; assert.equal(sk.balanceState, 'doomed');
});
