import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, Bot, routePath, topPath, nanPath } from './autopilot.js';
import { IDS } from '../src/world/route.js';
import { cumulative, projectOnPolyline } from '../src/sim/math.js';
import { CAR } from '../src/sim/params.js';

function runUntil(g, bot, cond, maxSec, fn) {
  const n = Math.round(maxSec * 60);
  for (let i = 0; i < n; i++) {
    fn();
    g.frame(bot.I);
    bot.I.gearDirect = null; bot.I.handbrake.pressed = false;
    if (cond()) return true;
  }
  return false;
}

export function driveRoute(preset = 'A', over = {}) {
  const g = makeGame(preset, over);
  const bot = new Bot(g);
  const { car, route, world } = g;
  const front = () => car.z + Math.cos(car.psi) * CAR.halfLen;
  const path = routePath(world), cum = cumulative(path);
  const stage = (name, cond, sec, fn) => {
    const ok = runUntil(g, bot, cond, sec, fn);
    if (!ok) throw new Error(`stuck at "${name}" step=${route.step} pos=(${car.x.toFixed(1)},${car.z.toFixed(1)}) psi=${(car.psi * 57.3).toFixed(0)} v=${car.fwdSpeed.toFixed(2)} gear=${car.gear} rpm=${car.rpm.toFixed(0)} running=${car.running} clutch=${g.driver.clutchOut.toFixed(2)} hb=${g.driver.handbrake.toFixed(1)} thr=${g.driver.throttle.toFixed(2)} contact=${car.contact} state=${bot.state}`);
  };
  // start: clutch down, neutral, crank
  stage('start', () => car.running, 5, () => { bot.I.clutch.analog = 1; bot.I.ignition = g.t > 0.3; });
  bot.I.ignition = false;
  stage('first', () => car.gear === 1, 2, () => { bot.I.clutch.analog = 1; bot.gear(1); });
  // speed profile along the path, with stops
  const stopAt = (zFront) => (vmax) => Math.min(vmax, Math.max(0, Math.sqrt(Math.max(0, 2 * 1.2 * (zFront - front())))));
  stage('yard line', () => route.step === IDS.JUNCTION, 40, () => { bot.steerTo(path, cum); bot.drive(stopAt(world.yardLine.z - 0.4)(4)); });
  stage('junction', () => route.flags.stoppedAt, 60, () => { bot.steerTo(path, cum); bot.drive(stopAt(world.junction1.stopZ - 0.25)(5)); });
  g.lookYaw = -1; runUntil(g, bot, () => false, 0.5, () => bot.drive(0)); g.lookYaw = 1; runUntil(g, bot, () => false, 0.5, () => bot.drive(0)); g.lookYaw = 0;
  stage('turn left', () => route.step === IDS.FOLLOW, 40, () => { bot.steerTo(path, cum); bot.drive(3.5); });
  stage('follow', () => route.step === IDS.LIGHTS, 80, () => { const p = bot.steerTo(path, cum); bot.drive(p.s < 200 ? 7 : 5); });
  stage('lights', () => route.step === IDS.UPHILL, 60, () => {
    bot.steerTo(path, cum);
    const red = g.traffic.lights === 'red';
    bot.drive(red ? stopAt(world.lights.stopZ - 0.3)(4) : 4, true);
  });
  stage('uphill', () => route.step === IDS.GIVE_WAY, 60, () => { bot.steerTo(path, cum); bot.drive(5); });
  stage('give way', () => route.step === IDS.TOP_JUNCTION, 90, () => {
    bot.steerTo(path, cum);
    const clear = g.traffic.oncomingPassed(world.giveWay.stopZ - 6);
    bot.drive(clear ? 4 : stopAt(world.giveWay.stopZ - 0.4)(4), true);
  });
  const tp = topPath(world), tcum = cumulative(tp);
  stage('top junction', () => route.flags.stoppedAt, 60, () => {
    const onTop = car.z > 240;
    if (onTop) bot.steerTo(tp, tcum); else bot.steerTo(path, cum);
    bot.drive(stopAt(world.topJunction.stopZ - 0.25)(4), true);
  });
  stage('turn right', () => route.step === IDS.PARALLEL, 40, () => { bot.steerTo(tp, tcum); bot.drive(3); });
  return { g, bot, tp, tcum, stage, front };
}

export function parallelPark(ctx) {
  const { g, bot, tp, tcum, stage } = ctx;
  const { car, route, world } = g;
  const P = world.parkSpace;
  // 1. pull alongside the car in front of the space, stop with our rear a little past its rear
  const stopX = P.x0 + (ctx.stopOff ?? -1.2); // car centre x
  stage('alongside', () => car.speed < 0.05 && Math.abs(car.x - stopX) < 0.6 && g.t > 0, 40, () => {
    bot.steerTo(tp, tcum);
    const d = car.x - stopX;
    bot.drive(d > 0 ? Math.min(3, Math.sqrt(2 * 1.0 * d)) : 0);
  });
  // 2. reverse with full left lock until ~42° in, then full right lock until straight
  const max = g.settings.steeringTurns * 180;
  let phase = 0;
  stage('reverse in', () => phase === 3, 60, () => {
    const yaw = Math.atan2(Math.sin(car.psi + Math.PI / 2), Math.cos(car.psi + Math.PI / 2)); // 0 when heading -x
    if (phase === 0) { bot.setWheel(-max); if (g.driver.steerDeg < -max + 5) phase = 1; bot.drive(0); }
    else if (phase === 1) { bot.setWheel(-max); bot.drive(-0.9); if (Math.abs(yaw) > ctx.turnIn) phase = 2; }
    else if (phase === 2) { bot.setWheel(max); bot.drive(-0.8); if (Math.abs(yaw) < 0.04 || car.x > P.x1 - 0.2) phase = 3; }
  });
  // 3. straighten up and shuffle to the middle of the space
  if (ctx.debug) console.log('after reverse', car.x.toFixed(2), car.z.toFixed(2), (car.psi * 57.3).toFixed(1), 'contacts', g.log.filter((e) => e.type === 'collision').length);
  stage('settle', () => route.step === IDS.NAN, 30, () => {
    bot.setWheel(0);
    const mid = (P.x0 + P.x1) / 2;
    const d = car.x - mid;
    if (Math.abs(g.driver.steerDeg) > 20) { bot.drive(0); return; }
    if (Math.abs(d) < 0.35) bot.drive(0, true);
    else bot.drive(d > 0 ? Math.min(0.8, d) : -Math.min(0.8, -d));
  });
}

export function finishAtNans(ctx) {
  const { g, bot, stage } = ctx;
  const { car, route, world } = g;
  const np = nanPath(world, car.x - 1), ncum = cumulative(np);
  // pull out of the space: a little reverse then forward with right lock
  stage('pull out', () => car.z < 251.9 && Math.abs(Math.sin(car.psi + Math.PI / 2)) < 0.2 && car.x < world.parkSpace.x0 + 1.5, 40, () => {
    const max = g.settings.steeringTurns * 180;
    if (car.z > 252.0) { bot.setWheel(max * 0.9); bot.drive(1.2); } else { bot.setWheel(-max * 0.6); bot.drive(1.2); }
  });
  stage('to nan', () => route.step === IDS.SHUTDOWN, 60, () => {
    const pr = projectOnPolyline(np, ncum, car.x, car.z);
    bot.steerTo(np, ncum, false, 1.8);
    const left = ncum[ncum.length - 1] - pr.s;
    bot.drive(Math.min(2, Math.max(0, Math.sqrt(2 * 0.8 * Math.max(0, left - 2.2)))), true);
  });
  stage('shut down', () => route.step === IDS.ARRIVED, 10, () => {
    bot.I.brake.analog = 0.4;
    bot.I.throttle.analog = 0;
    if (g.driver.handbrakeTarget < 0.5) bot.I.handbrake.pressed = true;
    bot.I.ignition = car.running && !bot.offPressed;
    if (car.running) bot.offPressed = false; else bot.offPressed = true;
  });
}

if (process.env.PARK_SWEEP) {
  for (const stopOff of [-2.0, -1.5, -1.2, -0.8, -0.4, 0]) for (const turnIn of [0.45, 0.55, 0.65, 0.75]) {
    const ctx = driveRoute('A'); ctx.stopOff = stopOff; ctx.turnIn = turnIn; ctx.debug = true;
    try { parallelPark(ctx); console.log('OK', stopOff, turnIn); } catch (e) { console.log('fail', stopOff, turnIn, e.message.slice(0, 80)); }
  }
}

test('the route can be completed with a manual clutch (bot drives preset A)', () => {
  const ctx = driveRoute('A'); ctx.stopOff = -1.2; ctx.turnIn = 0.55;
  parallelPark(ctx);
  finishAtNans(ctx);
  const { g } = ctx;
  assert.equal(g.route.step, IDS.ARRIVED);
  const s = g.route.stats;
  console.log(`  route time ${s.time.toFixed(0)}s · stalls ${s.stalls} · rollbacks ${s.rollbacks} · grinds ${s.grinds} · kerbs ${s.kerbHits} · collisions ${s.collisions} · parking attempts ${s.parkingAttempts}`);
  assert.ok(s.time > 60 && s.time < 600, `route takes ${s.time}s`);
});

test('traffic pressure LIGHT: follower appears, never rams, and the route still completes', () => {
  const ctx = driveRoute('A', { traffic: 'light' });
  const { g } = ctx;
  assert.ok(g.traffic.followerSpawned, 'follower spawned on the hill');
  ctx.stopOff = -1.2; ctx.turnIn = 0.55;
  parallelPark(ctx);
  finishAtNans(ctx);
  assert.equal(g.route.step, IDS.ARRIVED);
  const aiHits = g.log.filter((e) => e.type === 'collision' && e.tag === 'aicar');
  assert.equal(aiHits.length, 0, 'no contact with AI cars when the player drives sensibly');
});
