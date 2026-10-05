// Headless helpers: run the skier with scripted input. Used by tests, the
// feel-sweep tuning script and the autopilot bot.

import { Skier } from './skier.js';
import { makeTune } from '../config.js';

export const DT = 1 / 240;

export function blankInput() {
  return { steer: 0, tuck: 0, brake: 0, px: 0, py: 0 };
}

/**
 * run({ world, x, z, heading, speed, script(t, sk, inp), maxT, stopWhen(sk) })
 * Returns { sk, log, events } where log is sampled every `logEvery` steps.
 */
export function run(opts) {
  const tune = makeTune(opts.tune || {});
  const sk = new Skier(tune);
  const w = opts.world;
  sk.place(w, opts.x ?? 0, opts.z ?? 0, opts.heading ?? 0);
  if (opts.speed) {
    const n = sk.n;
    // initial velocity along the fall line in the ski direction
    const f = { x: Math.sin(sk.heading), y: 0, z: Math.cos(sk.heading) };
    const fn = f.x * n.x + f.z * n.z;
    let t = { x: f.x - n.x * fn, y: -n.y * fn, z: f.z - n.z * fn };
    const l = Math.hypot(t.x, t.y, t.z);
    sk.v = { x: (t.x / l) * opts.speed, y: (t.y / l) * opts.speed, z: (t.z / l) * opts.speed };
  }
  const inp = blankInput();
  const log = [];
  const events = [];
  const maxT = opts.maxT ?? 10;
  const every = opts.logEvery ?? 12;
  let k = 0;
  while (sk.time < maxT) {
    opts.script && opts.script(sk.time, sk, inp);
    sk.step(inp, w, DT);
    for (const e of sk.out) events.push(e);
    sk.out.length = 0;
    if (k++ % every === 0) {
      log.push({
        t: sk.time, x: sk.p.x, y: sk.p.y, z: sk.p.z, speed: sk.speed, g: sk.grounded,
        L: sk.L, bal: sk.balance, F: sk.load,
      });
    }
    if (sk.crashed) break;
    if (opts.stopWhen && opts.stopWhen(sk)) break;
  }
  return { sk, log, events };
}

// Script builder for a jump at a lip located at zLip:
//  crouch when `crouchAt` m before the lip, extend `extendAt` m before the lip
//  (negative = after), extension takes `extDur` s; prepare (crouch to `prep`)
//  `prepLead` seconds before predicted landing (simple: after `prepAfter` s air).
export function jumpScript({ zLip, crouchAt = 12, crouchTo = -0.75, extendAt = 1.5, extDur = 0.08,
  extendTo = 1, airPy = 0.3, prepAfter = 0.35, prep = -0.4, rigid = false, steer = 0 }) {
  let tExt = null;
  let tAir = null;
  return (t, sk, inp) => {
    inp.steer = steer;
    const d = zLip - sk.p.z;
    if (tExt === null) {
      if (d < extendAt) tExt = t;
      else if (d < crouchAt) inp.py = Math.max(crouchTo, inp.py - 4 / 240);
      else inp.py = 0;
    }
    if (tExt !== null) {
      const k = Math.min(1, (t - tExt) / Math.max(extDur, 1e-3));
      if (tAir === null && !sk.grounded && t - tExt > 0.02) tAir = t;
      if (tAir === null) inp.py = crouchTo + (extendTo - crouchTo) * k;
      else {
        const a = t - tAir;
        if (rigid) inp.py = 1;
        else if (a < prepAfter) inp.py = airPy;
        else inp.py = prep;
      }
      if (sk.grounded && tAir !== null && t - tAir > 0.3) inp.py = Math.min(0, inp.py + 2 / 240);
    }
  };
}
