// The jump mechanic: timing and pop must matter, landings must respond to posture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLab } from '../src/world/lab.js';
import { run, jumpScript } from '../src/sim/harness.js';

const lab = makeLab();
const LIP = 430;

function jump(extendAt, extra = {}, speed = 20) {
  let first = null;
  const r = run({
    world: lab, x: 0, z: 400, speed, maxT: 6,
    script: jumpScript({ zLip: LIP, extendAt, ...extra }),
    stopWhen: (sk) => sk.lastJump && sk.lastJump.landing && sk.time > 0.5,
  });
  for (const e of r.events) if (e.type === 'jump' && !first) first = e.report;
  const td = r.events.find((e) => e.type === 'touchdown');
  const to = r.events.find((e) => e.type === 'jump');
  return { rep: first, air: first && first.landing ? first.landing.airTime : 0, dist: td && to ? td.z - to.report.z : 0, crashed: r.sk.crashed };
}

test('well-timed pop flies clearly further than no pop', () => {
  const none = jump(0, { crouchTo: 0, extendTo: 0 });
  const good = jump(4);
  assert.ok(good.air > none.air * 1.3, `good ${good.air}s vs none ${none.air}s`);
  assert.ok(good.rep.popVel > 1.5, `pop ${good.rep.popVel}`);
});

test('extending after leaving the lip (late) gives almost nothing', () => {
  const late = jump(-5);
  const good = jump(4);
  assert.ok(late.air < good.air * 0.8, `late ${late.air}s vs good ${good.air}s`);
  assert.ok(late.rep.timing === 'late' || late.rep.timing === 'none', `classified ${late.rep.timing}`);
});

test('pop strength is graded by timing (not binary)', () => {
  const pops = [8, 6, 4, 3, 2, 1, 0].map((e) => jump(e).rep.popVel);
  const max = Math.max(...pops);
  const min = Math.min(...pops);
  const distinct = new Set(pops.map((p) => p.toFixed(1))).size;
  assert.ok(max - min > 1, `range of pops ${min}..${max}`);
  assert.ok(distinct >= 4, `at least four distinct outcomes, got ${distinct}`);
});

test('landing with locked legs is worse than landing ready', () => {
  const ready = jump(4, { prep: -0.4 });
  const rigid = jump(4, { rigid: true });
  const rb = ready.rep.landing;
  const gb = rigid.rep.landing;
  assert.ok(rb, 'ready landing reported');
  const score = (L) => (L ? L.maxBalance + (L.quality === 'perfect' ? 0 : L.quality === 'good' ? 0.2 : 0.5) : 2);
  assert.ok(score(gb) > score(rb) || rigid.crashed, `rigid ${JSON.stringify(gb)} vs ready ${JSON.stringify(rb)}`);
});

test('ravine: too slow falls in, fast + pop clears', () => {
  const ravine = (speed, extendAt) => {
    const r = run({
      world: lab, x: 0, z: 1020, speed, maxT: 5,
      script: jumpScript({ zLip: 1050, extendAt }),
      stopWhen: (sk) => sk.p.z > 1080 && sk.grounded,
    });
    return { z: r.sk.p.z, crashed: r.sk.crashed };
  };
  const slow = ravine(14, 4);
  const fast = ravine(22, 4);
  assert.ok(slow.crashed || slow.z < 1075, 'slow attempt does not make it');
  assert.ok(!fast.crashed && fast.z > 1075, `fast attempt clears (z ${fast.z.toFixed(1)})`);
});
