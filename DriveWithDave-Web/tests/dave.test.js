import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDaveGame, scriptedNavigator, placeDave, IDS } from './daveHarness.js';
import { parseCommand, parsePhrase, CMD } from '../src/dave/commands.js';

// ---------------------------------------------------------------- voice parser
test('voice parser: synonyms map to canonical commands', () => {
  const cases = {
    'turn left': 'LEFT', 'go left': 'LEFT', 'take a left': 'LEFT', 'left': 'LEFT', 'Dave, turn left': 'LEFT', 'hang a left mate': 'LEFT',
    'right': 'RIGHT', 'turn right': 'RIGHT', 'take a right': 'RIGHT',
    'straight': 'STRAIGHT', 'go straight': 'STRAIGHT', 'straight on': 'STRAIGHT', 'carry on': 'STRAIGHT',
    'slow down': 'SLOWER', 'slower': 'SLOWER', 'Dave, slow down': 'SLOWER', 'speed up': 'FASTER', 'faster': 'FASTER',
    'go': 'GO', 'off you go': 'GO', 'stop': 'STOP', 'brake': 'BRAKE', 'reverse': 'REVERSE', 'back up': 'REVERSE',
    'park': 'PARK', 'park here': 'PARK', 'wait': 'WAIT', 'hang on': 'WAIT', 'careful': 'CAREFUL', 'be careful': 'CAREFUL',
    'turn around': 'TURN_AROUND', 'pull over': 'PULL_OVER', 'go for it': 'GO_FOR_IT',
  };
  for (const [phrase, want] of Object.entries(cases)) assert.equal(parseCommand(phrase), want, phrase);
  assert.equal(parseCommand('what a lovely day'), null);
  assert.deepEqual(parsePhrase('left left LEFT!').commands, ['LEFT', 'LEFT', 'LEFT']);
});

// ---------------------------------------------------------------- honesty: Dave only uses the controls
test('Dave never moves the car directly — only through driver intents', () => {
  const src = readFileSync(new URL('../src/dave/brain.js', import.meta.url), 'utf8');
  for (const bad of [/car\.(x|z|psi|vx|vz|yawRate|omegaE|omegaW|gear|running)\s*=[^=]/, /\.setGear\(/, /car\.step\(/]) assert.ok(!bad.test(src), `brain.js must not ${bad}`);
});

// ---------------------------------------------------------------- commands
function startedOnFlat(profile = 'learner', opts) {
  const g = makeDaveGame(profile, opts);
  g.until(() => g.dave.mode === 'drive' && g.car.running, 5);
  return g;
}

test('GO creates proceed intent; Dave pulls away using the real clutch', () => {
  const g = startedOnFlat();
  g.run(1);
  assert.equal(g.car.speed < 0.05, true, 'waits for instructions');
  g.cmd(CMD.GO);
  g.run(5);
  assert.equal(g.dave.hold, false);
  assert.ok(g.car.speed > 2, `moving ${g.car.speed}`);
  assert.ok(g.count('gearIn') >= 1, 'selected a gear');
  assert.ok(g.log.some((e) => e.type === 'handbrakeOff'), 'took the handbrake off');
});

test('STOP overrides movement: a controlled stop, then he stays stopped', () => {
  const g = startedOnFlat('oldhand');
  g.cmd(CMD.GO); g.run(6);
  assert.ok(g.car.speed > 3);
  g.cmd(CMD.STOP);
  g.run(5);
  assert.ok(g.car.speed < 0.05, `stopped ${g.car.speed}`);
  g.run(3);
  assert.ok(g.car.speed < 0.05 && g.dave.hold, 'holds');
});

test('SLOWER reduces and FASTER increases desired speed', () => {
  const g = startedOnFlat('learner');
  g.cmd(CMD.GO); g.run(3);
  const base = g.dave.cruise;
  g.cmd(CMD.SLOWER); g.run(1.5);
  const slow = g.dave.cruise;
  g.cmd(CMD.FASTER); g.run(1.5); g.cmd(CMD.FASTER); g.run(1.5);
  const fast = g.dave.cruise;
  assert.ok(slow < base * 0.85, `slower ${slow} < ${base}`);
  assert.ok(fast > slow * 1.3, `faster ${fast} > ${slow}`);
});

test('LEFT at the first junction takes the left; RIGHT takes the right', () => {
  for (const [cmd, wantX] of [[CMD.LEFT, 1], [CMD.RIGHT, -1]]) {
    const g = startedOnFlat('oldhand');
    g.cmd(CMD.GO);
    g.run(2);
    g.cmd(cmd);
    g.until(() => Math.abs(g.car.x) > 12, 60);
    assert.equal(Math.sign(g.car.x), wantX, `${cmd} → x ${g.car.x}`);
    assert.ok(Math.abs(g.car.z) < 5, 'on Mill Road');
  }
});

// ---------------------------------------------------------------- reaction
test('quick-reacting Dave responds sooner than a slow one', () => {
  const delays = {};
  for (const reaction of [90, 15]) {
    const g = startedOnFlat('learner', { traits: { reaction } });
    g.cmd(CMD.GO);
    let t = 0;
    g.until(() => !g.dave.hold, 5, () => { t += 1 / 60; });
    delays[reaction] = t;
  }
  assert.ok(delays[90] + 0.4 < delays[15], `fast ${delays[90].toFixed(2)}s vs slow ${delays[15].toFixed(2)}s`);
});

// ---------------------------------------------------------------- skill
test('low skill → measurably more steering/lane error, but still on the road', () => {
  const err = {};
  for (const skill of [95, 15]) {
    const g = makeDaveGame('learner', { traits: { skill, confidence: 50 } });
    placeDave(g, -80, -1.9, Math.PI / 2, { hold: false, handbrake: false }); // Mill Road, straight
    let sum = 0, n = 0, max = 0;
    g.run(10, () => { if (g.car.speed > 2) { const e = Math.abs(g.dave.debug.cte || 0); sum += e; n++; max = Math.max(max, e); } });
    err[skill] = { mean: sum / n, max, kerbs: g.count('kerb'), coll: g.count('collision') };
  }
  assert.ok(err[15].mean > err[95].mean * 4, `low skill err ${err[15].mean.toFixed(3)} vs high ${err[95].mean.toFixed(3)}`);
  assert.ok(err[15].max < 2.0, `but not nonsense (max ${err[15].max.toFixed(2)} m)`);
  assert.ok(err[15].coll <= 1, 'mostly keeps it on the road');
});

// ---------------------------------------------------------------- urgency / panic
test('LEFT LEFT LEFT in a short window → higher urgency than one LEFT', () => {
  const a = startedOnFlat('learner');
  const one = a.cmd(CMD.LEFT).urgency;
  const b = startedOnFlat('learner');
  b.cmd(CMD.LEFT); b.run(0.4); b.cmd(CMD.LEFT); b.run(0.4);
  const three = b.cmd(CMD.LEFT).urgency;
  assert.ok(three > one + 0.5, `${three} vs ${one}`);
  // spread out over time it isn't urgent
  const c = startedOnFlat('learner');
  c.cmd(CMD.LEFT); c.run(3); c.cmd(CMD.LEFT); c.run(3);
  assert.ok(c.cmd(CMD.LEFT).urgency < 0.2);
});

test('repeated urgent commands raise stress and the panic effect (and it recovers)', () => {
  const g = startedOnFlat('nervous');
  const s0 = g.dave.stress, p0 = g.dave.panicEff;
  for (let i = 0; i < 5; i++) { g.cmd(CMD.GO); g.run(0.3); }
  assert.ok(g.dave.stress > s0 + 0.3, `stress ${g.dave.stress}`);
  assert.ok(g.dave.panicEff > p0 + 0.3, `panic ${g.dave.panicEff}`);
  const peak = g.dave.stress;
  g.cmd(CMD.STOP); g.run(25);
  assert.ok(g.dave.stress < peak - 0.25, 'calms down again');
});

// ---------------------------------------------------------------- hill start + stalling
function hillStart(profile, shouts) {
  const g = makeDaveGame(profile);
  placeDave(g, 77.6, 100, -0.12);
  g.run(1.5);
  const z0 = g.car.z;
  let minZ = z0;
  if (shouts) for (let i = 0; i < shouts; i++) { g.cmd(CMD.GO); g.run(0.35); } else g.cmd(CMD.GO);
  g.until(() => g.car.z > z0 + 15, 25, () => { minZ = Math.min(minZ, g.car.z); });
  return { g, up: g.car.z > z0 + 15, rollback: z0 - minZ };
}

test('hill start: Dave does it himself with clutch, revs and handbrake', () => {
  for (const p of ['oldhand', 'learner', 'cocky', 'nervous']) {
    const { g, up } = hillStart(p, 0);
    assert.ok(up, `${p} gets up the hill`);
    assert.ok(g.log.some((e) => e.type === 'handbrakeOff'), `${p} released the handbrake`);
    assert.equal(g.count('stall'), 0, `${p} calm hill start doesn't stall`);
  }
});

test('shouting GO at a nervous Dave on a hill → genuine stall / rollback through the drivetrain', () => {
  const calm = hillStart('nervous', 0), shout = hillStart('nervous', 4);
  assert.ok(shout.g.count('stall') >= 1 || shout.rollback > 0.3, `stalls ${shout.g.count('stall')} rollback ${shout.rollback}`);
  assert.ok(shout.rollback > calm.rollback);
  assert.equal(shout.g.car.running || shout.g.count('stall') > 0, true);
});

test('low-skill Dave can genuinely stall (engine stops via the existing stall logic)', () => {
  const { g } = hillStart('learner', 0);
  void g;
  const lo = makeDaveGame('learner', { traits: { skill: 8, panic: 90 } });
  placeDave(lo, 77.6, 100, -0.12);
  lo.run(1.5);
  for (let i = 0; i < 3; i++) { lo.cmd(CMD.GO); lo.run(0.3); }
  lo.run(8);
  assert.ok(lo.count('stall') >= 1, 'stalled');
  assert.ok(lo.said.some((s) => s.key === 'stall'), 'and said so');
  lo.run(10);
  assert.ok(lo.count('catch') >= 1, 'then restarted it himself');
});

// ---------------------------------------------------------------- safety
test('Dave does not drive into an obvious stationary obstacle, even when told FASTER', () => {
  for (const p of ['learner', 'nervous', 'cocky', 'oldhand']) {
    const g = makeDaveGame(p);
    // Mill Road eastbound: the parked car on our side at x=36 is removed from his lane offset;
    // put a car (as a static) right in his path instead
    placeDave(g, -10, -1.9, Math.PI / 2, { hold: false, handbrake: false });
    g.world.statics.push({ kind: 'box', cx: 25, cz: -1.9, hx: 0.84, hz: 1.95, rot: Math.PI / 2, tag: 'car' });
    g.world.buildGrid();
    g.run(2); g.cmd(CMD.FASTER); g.run(1); g.cmd(CMD.FASTER);
    g.run(16);
    assert.equal(g.count('collision'), 0, `${p} collided`);
    assert.ok(g.car.x < 25 - 1.95 - 1.85 + 0.05, `${p} stopped short (x=${g.car.x.toFixed(2)})`);
  }
});

test('obedience: Cocky refuses GO on red; Learner gives in when shouted at', () => {
  const run = (p, shouts) => {
    const g = makeDaveGame(p);
    placeDave(g, 79.9, 40, 0, { hold: false, handbrake: false });
    g.route.reset(IDS.LIGHTS);
    g.until(() => g.car.speed < 0.05 && g.t > 4, 30, () => { g.route.flags.waitT = -100; });
    assert.ok(g.car.z < g.world.lights.stopZ, `${p} stopped for the red`);
    const zStop = g.car.z;
    const keepRed = () => { g.route.flags.waitT = -100; g.traffic.lights = 'red'; };
    for (let i = 0; i < shouts; i++) { g.cmd(CMD.GO); g.run(0.35, keepRed); }
    g.run(2.5, keepRed);
    return { moved: g.car.z - zStop > 1, refused: g.dave.tel.refused, zStop };
  };
  const cocky = run('cocky', 4);
  assert.equal(cocky.moved, false, 'cocky stays put on red');
  assert.ok(cocky.refused >= 1);
  const learner = run('learner', 4);
  assert.equal(learner.moved, true, 'learner goes when shouted at');
});

// ---------------------------------------------------------------- personalities
test('NERVOUS and COCKY produce materially different driving traces', () => {
  const trace = (p) => {
    const g = makeDaveGame(p);
    const nav = scriptedNavigator(g);
    let sum = 0, n = 0, maxV = 0;
    g.until(() => g.route.step >= IDS.LIGHTS, 120, () => { nav(); sum += g.car.speed; n++; maxV = Math.max(maxV, g.car.speed); });
    return { t: g.t, avg: sum / n, maxV, said: g.said.map((s) => s.key) };
  };
  const nervous = trace('nervous'), cocky = trace('cocky');
  assert.ok(cocky.maxV > nervous.maxV * 1.3, `top speed cocky ${cocky.maxV.toFixed(1)} vs nervous ${nervous.maxV.toFixed(1)}`);
  assert.ok(cocky.t < nervous.t * 0.85, `time to the lights cocky ${cocky.t.toFixed(0)}s vs nervous ${nervous.t.toFixed(0)}s`);
  assert.ok(nervous.said.includes('hesitate'), 'nervous hesitates out loud');
});

test('no instruction at a junction: Learner waits and asks; Cocky assumes (wrongly) and blames you', () => {
  const learner = startedOnFlat('learner');
  learner.cmd(CMD.GO);
  learner.run(30);
  assert.ok(Math.abs(learner.car.x) < 3 && learner.car.z < -3, 'learner waits at the line');
  assert.ok(learner.said.some((s) => s.key === 'whichWay'), 'and asks');
  const cocky = startedOnFlat('cocky');
  cocky.cmd(CMD.GO);
  cocky.run(30);
  assert.ok(cocky.car.x < -8, 'cocky went right');
  assert.equal(cocky.dave.tel.wrongTurns, 1);
  assert.ok(cocky.said.some((s) => s.key === 'wrongTurnNoCmd'), '"You didn\'t say!"');
});

test('TURN AROUND: from the wrong way, Dave does a multi-point turn and heads back', () => {
  const g = makeDaveGame('oldhand');
  placeDave(g, -30, 1.4, -Math.PI / 2, { hold: false, handbrake: false });
  g.run(3);
  g.cmd(CMD.TURN_AROUND);
  g.until(() => g.dave.mode === 'drive' && g.car.fwdSpeed > 1 && Math.sin(g.car.psi) > 0.8, 60);
  assert.ok(Math.sin(g.car.psi) > 0.8, `heading east (psi ${(g.car.psi * 57.3).toFixed(0)})`);
  assert.equal(g.dave.path.base || g.dave.path.id, 'millEast');
  assert.equal(g.count('collision'), 0);
});

// ---------------------------------------------------------------- the route
test('the whole route: every Dave completes it with a sensible (scripted) navigator', () => {
  for (const p of ['oldhand', 'cocky', 'learner', 'nervous']) {
    const g = makeDaveGame(p);
    const nav = scriptedNavigator(g);
    const ok = g.until(() => g.route.step === IDS.ARRIVED, 420, nav);
    const s = g.route.stats;
    console.log(`  ${p.padEnd(8)} ${ok ? 'ARRIVED' : 'stuck ' + g.state()} in ${s.time.toFixed(0)}s · stalls ${s.stalls} · collisions ${s.collisions} · kerbs ${s.kerbHits} · parking ${g.dave.tel.parkingQuality} · lines ${g.said.length}`);
    assert.ok(ok, `${p} arrived`);
    if (p === 'oldhand') assert.ok(s.collisions <= 1 && s.stalls === 0, 'the competent one is clean');
  }
});
