// Physics / rules QA for every level (headless Rapier, same code as the game).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim, runShots, KILL_Y } from '../src/sim/Sim.js';
import { LEVELS, getLevel } from '../src/levels/levels.js';
import { CATALOG } from '../src/sim/catalog.js';
import { playWithBot } from '../src/sim/bot.js';

const stepN = (sim, n) => { for (let i = 0; i < n; i++) sim.step(); };

test('exactly 20 unique levels with sane metadata', () => {
  assert.equal(LEVELS.length, 20);
  assert.deepEqual(LEVELS.map((l) => l.id), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(new Set(LEVELS.map((l) => l.name)).size, 20, 'level names unique');
  for (const l of LEVELS) {
    assert.ok(l.balls >= 3 && l.balls <= 5, `L${l.id} ball budget`);
    assert.ok(['easy', 'normal', 'hard', 'superhard'].includes(l.diff));
    assert.ok(l.env, 'has environment');
  }
  assert.ok(new Set(LEVELS.map((l) => l.env)).size >= 4, 'at least four visual environments');
});

test('hard / super-hard markers follow the sawtooth', () => {
  assert.equal(getLevel(10).diff, 'hard');
  assert.equal(getLevel(20).diff, 'superhard');
  for (const l of LEVELS) if (l.id !== 10 && l.id !== 20) assert.ok(!['hard', 'superhard'].includes(l.diff), `L${l.id} not hard`);
  for (const id of [1, 2, 3, 5, 11, 16]) assert.equal(getLevel(id).diff, 'easy', `L${id} is an easy beat`);
});

for (const level of LEVELS) {
  test(`L${level.id} ${level.name}: loads, counts targets, stays stable when idle`, async () => {
    const sim = await Sim.create(level);
    const expected = level.objects.filter((o) => (o.target !== undefined ? o.target : !!CATALOG[o.t]({ ...o }).target)).length;
    assert.equal(sim.targetsTotal, expected, 'required target count matches the spec');
    assert.ok(sim.targetsTotal > 0);
    assert.equal(sim.state, 'aim');
    stepN(sim, 60 * 20); // 20 s of nothing
    assert.equal(sim.targetsDown, 0, 'nothing falls over by itself');
    assert.equal(sim.hasNaN(), false, 'no NaNs');
    for (const e of sim.entities) if (!e.removed && e.dynamic) assert.ok(e.body.translation().y > -0.5, `L${level.id} ${e.type} not sinking`);
    sim.dispose();
  });
}

test('ball launches forward, collides and knocks pins down', async () => {
  const sim = await Sim.create(getLevel(1));
  const z0 = sim.aimBall.body.translation().z;
  sim.launch({ angle: 0, power: 0.7 });
  assert.equal(sim.state, 'rolling');
  stepN(sim, 20);
  const b = sim.balls[0];
  assert.ok(b.body.translation().z < z0 - 2, 'ball travels toward the pins');
  stepN(sim, 200);
  assert.ok(sim.targetsDown >= 7, `pins fall (${sim.targetsDown})`);
  assert.ok(sim.firstImpactStep > 0, 'collision registered');
  sim.dispose();
});

test('shot count decreases and fail triggers when balls run out', async () => {
  const sim = await Sim.create(getLevel(6));
  const start = sim.ballsLeft;
  let shots = 0;
  for (let i = 0; i < 60 * 60 && sim.state !== 'lost'; i++) {
    if (sim.state === 'aim') { sim.launch({ angle: 0, power: 0.4 }); shots++; assert.equal(sim.ballsLeft, start - shots); }
    sim.step();
  }
  assert.equal(sim.state, 'lost', 'blocked straight shots run out of balls');
  assert.equal(sim.ballsLeft, 0);
  assert.ok(sim.targetsRemaining > 0);
  assert.equal(sim.canShoot(), false);
  sim.addBalls(5); // continue (+5 balls)
  assert.equal(sim.state, 'aim');
  assert.equal(sim.ballsLeft, 5);
  sim.dispose();
});

test('targets register once only and win triggers', async () => {
  const r = await runShots(getLevel(1), [{ angle: 0, power: 1 }, { angle: 2, power: 0.8 }, { angle: -2, power: 0.8 }], { afterWin: 200 });
  assert.equal(r.duplicateDown, false);
  assert.equal(r.won, true);
  assert.equal(r.remaining, 0);
});

test('restart restores the exact initial state; simulation is deterministic', async () => {
  const lvl = getLevel(20);
  const a = await Sim.create(lvl);
  const h0 = a.stateHash();
  a.launch({ angle: 1, power: 0.8 });
  stepN(a, 300);
  const hA = a.stateHash();
  a.dispose();
  const b = await Sim.create(lvl);
  assert.equal(b.stateHash(), h0, 'fresh build == initial state');
  b.launch({ angle: 1, power: 0.8 });
  stepN(b, 300);
  assert.equal(b.stateHash(), hA, 'same shot -> identical physics');
  b.dispose();
});

test('boosters change physics', async () => {
  const lvl = getLevel(16);
  const mk = async (booster) => { const s = await Sim.create(lvl); s.launch({ angle: 0, power: 0.6, booster }); return s; };
  const n = await mk(null), h = await mk('heavy'), t = await mk('triple'), bo = await mk('bomb');
  assert.equal(n.balls.length, 1);
  assert.ok(h.balls[0].mass > n.balls[0].mass * 2, 'heavy ball is heavier');
  assert.ok(h.balls[0].radius > n.balls[0].radius, 'heavy ball is bigger');
  assert.equal(t.balls.length, 3, 'triple ball releases three');
  assert.equal(t.ballsUsed, 1, 'triple costs one shot');
  let exploded = false;
  for (let i = 0; i < 240; i++) { bo.step(); if (bo.events.some((e) => e.t === 'bomb')) exploded = true; }
  assert.ok(exploded, 'bomb ball explodes on first big hit');
  for (let i = 0; i < 240; i++) n.step();
  for (let i = 0; i < 240; i++) h.step();
  assert.ok(h.targetsDown >= n.targetsDown, 'heavy flattens at least as much');
  for (const s of [n, h, t, bo]) s.dispose();
});

test('hook spin curves the ball', async () => {
  const flat = { id: 99, balls: 3, start: [0, 0, 0], floor: { w: 30, d: 40, cz: -15 }, objects: [] };
  const xAt = async (spin) => {
    const s = await Sim.create(flat);
    s.launch({ angle: 0, power: 0.6, spin });
    while (s.balls[0].body.translation().z > -10) s.step();
    const x = s.balls[0].body.translation().x;
    s.dispose();
    return x;
  };
  const l = await xAt(-1), c = await xAt(0), r = await xAt(1);
  assert.ok(Math.abs(c) < 0.05, 'no spin goes straight');
  assert.ok(r > 1.5 && l < -1.5, `spin curves both ways (${l.toFixed(2)}, ${r.toFixed(2)})`);
});

test('glass panels shatter when the ball smashes through', async () => {
  const sim = await Sim.create(getLevel(8));
  sim.launch({ angle: 0, power: 0.8 });
  let shattered = 0;
  for (let i = 0; i < 300; i++) { sim.step(); shattered += sim.events.filter((e) => e.t === 'shatter').length; }
  assert.ok(shattered >= 1);
  assert.ok(sim.targetsDown > 0, 'pins behind the glass go down');
  sim.dispose();
});

test('no bodies fall forever / nothing explodes numerically during big chain reactions', async () => {
  for (const id of [11, 16, 20]) {
    const sim = await Sim.create(getLevel(id), { unlimitedBalls: true });
    sim.launch({ angle: 0, power: 1, booster: 'bomb' });
    stepN(sim, 60 * 15);
    assert.equal(sim.hasNaN(), false);
    for (const e of sim.entities) {
      if (e.removed || !e.dynamic) continue;
      const p = e.body.translation(), v = e.body.linvel();
      assert.ok(p.y > KILL_Y, 'retired below kill plane');
      assert.ok(Math.hypot(v.x, v.y, v.z) < 60, 'no exploding velocities');
    }
    sim.dispose();
  }
});

test('levels 1-5 are forgiving: broad first shots + naive cleanup still win', async () => {
  for (let id = 1; id <= 5; id++) {
    let wins = 0, n = 0;
    for (let a = -10; a <= 10; a += 4) for (const p of [0.25, 0.6, 0.95]) {
      const r = await playWithBot(Sim, getLevel(id), [{ angle: a, power: p }]);
      n++; if (r.won) wins++;
    }
    assert.ok(wins / n >= 0.85, `L${id} forgiving: ${wins}/${n}`);
  }
});
