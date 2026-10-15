// Node harness: the full Dave loop (Dave → Driver → CarSim → route/traffic) at 60 Hz.
import { World } from '../src/world/layout.js';
import { CarSim } from '../src/sim/car.js';
import { Driver } from '../src/sim/driver.js';
import { DEFAULT_SETTINGS, applyPreset } from '../src/sim/params.js';
import { Traffic } from '../src/world/traffic.js';
import { Route, IDS } from '../src/world/route.js';
import { Dave } from '../src/dave/brain.js';
import { PROFILES } from '../src/dave/profiles.js';
import { applyDaveSettings } from '../src/dave/settings.js';

export const FRAME = 1 / 60;
export { IDS };

export function makeDaveGame(profile = 'learner', opts = {}) {
  let base = applyPreset({ ...DEFAULT_SETTINGS, assists: { ...DEFAULT_SETTINGS.assists } }, 'B');
  base = { ...base, ...(opts.settings || {}) };
  const traits = { ...PROFILES[profile].traits, ...(opts.traits || {}) };
  const settings = applyDaveSettings(base, traits);
  const world = new World({ hillSteepness: settings.hillSteepness });
  const car = new CarSim(world, settings);
  const driver = new Driver(settings);
  const traffic = new Traffic(world);
  const route = new Route(world);
  route.daveMode = true;
  const g = { settings, world, car, driver, traffic, route, t: 0, log: [], said: [] };
  g.dave = new Dave(g, { profile, traits: opts.traits, tuning: opts.tuning });
  g.dave.onSay = (s) => g.said.push({ t: g.t, ...s });
  if (opts.seed !== undefined) g.dave.reset({ seed: opts.seed });
  g.frame = () => {
    const I = g.dave.update(FRAME);
    const c = driver.update(FRAME, I, car);
    car.dynamics = traffic.colliders();
    for (let i = 0; i < 4; i++) car.step(FRAME / 4, c);
    car.grinding = driver.grindHeld;
    const ctx = { car, driver, traffic, lookYaw: 0, settings, stepId: route.step, ids: IDS, legitWait: false, daveMode: true };
    route.update(FRAME, ctx);
    ctx.stepId = route.step;
    traffic.update(FRAME, car, ctx);
    g.dave.observe(car.events, traffic.events);
    for (const e of car.events) g.log.push({ t: g.t, ...e });
    car.events.length = 0;
    g.t += FRAME;
  };
  g.run = (sec, fn) => { const n = Math.round(sec / FRAME); for (let i = 0; i < n; i++) { if (fn && fn(g) === true) return true; g.frame(); } return false; };
  g.until = (cond, sec, fn) => { const n = Math.round(sec / FRAME); for (let i = 0; i < n; i++) { if (cond(g)) return true; if (fn) fn(g); g.frame(); } return cond(g); };
  g.cmd = (c, meta) => g.dave.command(c, meta);
  g.count = (type) => g.log.filter((e) => e.type === type).length;
  g.state = () => `t=${g.t.toFixed(1)} step=${route.step} mode=${g.dave.mode} hold=${g.dave.hold ? g.dave.holdReason : '-'} pos=(${car.x.toFixed(1)},${car.z.toFixed(1)}) psi=${(car.psi * 57.3).toFixed(0)} v=${car.fwdSpeed.toFixed(2)} gear=${car.gear} rpm=${car.rpm.toFixed(0)} run=${car.running} clutch=${(driver.clutchOut ?? 0).toFixed(2)} hb=${driver.handbrake.toFixed(1)} stress=${g.dave.stress.toFixed(2)} vt=${(g.dave.debug.vt ?? 0).toFixed(1)} free=${(g.dave.free ?? 0).toFixed(1)}`;
  return g;
}

// Scripted navigator: says the right thing at sensible moments (what a decent passenger would do)
export function scriptedNavigator(g) {
  const { car, route, dave } = g;
  let saidGo = false, saidLeft = false, saidRight = false, saidPark = false, saidNan = false;
  return () => {
    if (!saidGo && dave.mode === 'drive' && car.running && g.t > 2.5) { saidGo = true; g.cmd('GO'); }
    if (!saidLeft && car.z > -40 && car.x < 5) { saidLeft = true; g.cmd('LEFT'); }
    if (route.step === IDS.LIGHTS && dave.hold === false && car.speed < 0.1 && g.traffic.lights === 'green' && dave.queue.length === 0 && !g._lg) { g._lg = true; g.cmd('GO'); }
    if (!saidRight && car.z > 205) { saidRight = true; g.cmd('RIGHT'); }
    if (!saidPark && route.step === IDS.PARALLEL && car.x < 48 && car.x > 40) { saidPark = true; g.cmd('PARK'); }
    // a bad attempt: ask him to have another go (up to twice)
    if (saidPark && route.step === IDS.PARALLEL && dave.park?.phase === 'done' && car.speed < 0.05 && (g._retries || 0) < 2 && g.t - (g._retryT || 0) > 3) { g._retries = (g._retries || 0) + 1; g._retryT = g.t; g.cmd('PARK'); }
    if (saidPark && route.step === IDS.PARALLEL && dave.park?.phase === 'done' && (g._retries || 0) >= 2 && g.t - g._retryT > 5 && !saidNan) { saidNan = true; g.cmd('LEFT'); g.cmd('GO'); }
    if (saidPark && !saidNan && route.step === IDS.NAN && dave.mode === 'park' && dave.park?.phase === 'done') { saidNan = true; g.cmd('LEFT'); g.cmd('GO'); }
  };
}

// put Dave somewhere on the network with the engine running, waiting for GO
export function placeDave(g, x, z, psi, { hold = true, handbrake = true, snap = true } = {}) {
  if (snap) {
    // put the car on Dave's lane at that spot
    const mm = g.dave.nav.match(x, z, psi);
    if (mm) { x = mm.pr.px; z = mm.pr.pz; psi = Math.atan2(mm.pr.tx, mm.pr.tz); }
  }
  g.car.reset({ x, z, psi });
  g.car.running = true; g.car.ignitionOn = true; g.car.omegaE = 89; g.car.sinceCatch = 5;
  g.driver.reset();
  if (!handbrake) { g.driver.handbrake = 0; g.driver.handbrakeTarget = 0; }
  const d = g.dave;
  d.mode = 'drive';
  const m = d.nav.match(x, z, psi);
  d.path = d.nav.fromHere(m.e, m.pr.s);
  d.hold = hold; d.holdReason = hold ? 'stop' : null;
  return d;
}
