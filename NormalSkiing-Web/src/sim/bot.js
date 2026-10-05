// Autopilot used by automated tests: a deliberately mediocre skier that
// follows a route, manages speed, pops at lips it detects and prepares for
// landings. Used to prove the mountain is traversable and to measure length.

import { clamp, wrapAngle } from './math.js';

export function makeBot(opts = {}) {
  const st = { py: 0, px: 0, popping: 0, airPrep: false, stuck: 0 };
  const route = opts.route || ((w, z) => w.corridorCenter(z));
  const speedFor = opts.speedFor || (() => 18);
  const skill = opts.skill ?? 1;
  return function control(session, dt) {
    const sk = session.skier;
    const w = session.world;
    const inp = { steer: 0, tuck: 0, brake: 0, px: 0, py: 0 };
    if (session.state !== 'skiing') return inp;
    const speed = sk.speed;
    // steering toward the route ahead
    // walk along the route (which may run sideways, e.g. road legs) until
    // `look` metres of path are covered
    const look = 8 + speed * 0.7;
    let zz = sk.p.z;
    let px = route(w, zz, sk);
    let acc = Math.hypot(px - sk.p.x, 0);
    let tx = px;
    let tz = zz;
    for (let k = 0; k < 400 && acc < look; k++) {
      zz += 0.5;
      const nx = route(w, zz, sk);
      acc += Math.hypot(nx - px, 0.5);
      px = nx;
      tx = nx;
      tz = zz;
    }
    // dodge trees on the line ahead
    const hs = Math.hypot(sk.v.x, sk.v.z) || 1;
    const dx = sk.v.x / hs;
    const dz = sk.v.z / hs;
    let dodge = 0;
    for (const zz2 of [sk.p.z, sk.p.z + 30]) {
      for (const tr of w.treesNear(zz2)) {
        if (tr.dead) continue;
        const rx = tr.x - sk.p.x;
        const rz = tr.z - sk.p.z;
        const along = rx * dx + rz * dz;
        const lat = rx * dz - rz * dx; // + = tree on the left (x side)
        if (along > 1 && along < 8 + speed * 1.1 && Math.abs(lat) < 2.6) dodge += (lat > 0 ? -1 : 1) * (3 - Math.abs(lat)) * 2.5;
      }
    }
    if (dodge) {
      tx += dz * dodge;
      tz -= dx * dodge;
    }
    const want = Math.atan2(tx - sk.p.x, tz - sk.p.z);
    const err = wrapAngle(want - sk.heading);
    inp.steer = clamp(-err * 2.2, -1, 1); // + steer = right = heading decreases
    // speed management
    const vT = speedFor(sk.p.z, w);
    if (speed > vT + 3) inp.brake = 1;
    else if (speed < vT - 2) inp.tuck = 1;
    if (speed < 3) inp.tuck = 1;
    if (Math.abs(err) > 0.5 && speed > 8) {
      inp.brake = 1;
      inp.tuck = 0;
    }
    // jumps: crouch on approach, pop at the lip
    if (sk.grounded) {
      st.airPrep = false;
      const lip = sk._lipAhead(w);
      const tLip = lip > 0 ? lip / Math.max(speed, 1) : 9;
      if (st.popping > 0) {
        st.popping -= dt;
        st.py = Math.min(1, st.py + dt * 14);
      } else if (tLip < 0.65 && tLip > 0.2) st.py = Math.max(-0.7, st.py - dt * 5);
      else if (tLip <= 0.2 && st.py < -0.3) st.popping = 0.15;
      else st.py += (0 - st.py) * Math.min(1, dt * 4);
      // balance correction: move the body against the lean
      st.py = clamp(st.py - sk.balFv * 0.02 * skill - sk.balF * 0.05 * skill, -1, 1);
      st.px = clamp(-sk.balL * 1.5 * skill - sk.balLv * 0.2 * skill, -1, 1);
    } else {
      // in the air: neutral, then bend the knees before touchdown
      const vy = sk.v.y;
      const clear = sk.p.y - w.height(sk.p.x + sk.v.x * 0.3, sk.p.z + sk.v.z * 0.3);
      const tImpact = clear / Math.max(0.5, -vy + 0.1);
      if (tImpact < 0.35 || st.airPrep) {
        st.airPrep = true;
        st.py += (-0.45 - st.py) * Math.min(1, dt * 10);
      } else {
        // pitch: aim skis down the slope ahead
        const n = w.normal(sk.p.x + sk.v.x * 0.5, sk.p.z + sk.v.z * 0.5, 2);
        const f = { x: Math.sin(sk.heading), z: Math.cos(sk.heading) };
        const slopePitch = -Math.atan2(n.x * f.x + n.z * f.z, n.y);
        const pe = sk.pitch - slopePitch;
        st.py += (clamp(pe * 1.5 * skill - 0.1, -1, 1) - st.py) * Math.min(1, dt * 6);
      }
      st.px = clamp(-sk.roll * 1.2 * skill, -1, 1);
    }
    inp.py = st.py;
    inp.px = st.px;
    return inp;
  };
}

// Run a whole session with the bot. Returns summary stats.
export function runBot(session, { maxTime = 1800, dt = 1 / 240, bot = makeBot(), onTick } = {}) {
  let stuckT = 0;
  const stuck = [];
  let lastZ = session.skier.p.z;
  let maxZ = lastZ;
  let t = 0;
  while (t < maxTime && !session.finished) {
    const inp = bot(session, dt);
    session.step(dt, inp);
    t += dt;
    const sk = session.skier;
    if (session.state === 'skiing') {
      maxZ = Math.max(maxZ, sk.p.z);
      if (sk.speed < 0.6) stuckT += dt;
      else stuckT = 0;
      if (stuckT > 6) {
        stuck.push({ x: +sk.p.x.toFixed(1), z: +sk.p.z.toFixed(1), region: session.regionName });
        // nudge forward (logged as a traversal problem)
        session.placeSkier(session.world.corridorCenter(sk.p.z + 25), sk.p.z + 25, 0);
        stuckT = 0;
      }
    }
    onTick && onTick(session, t);
    lastZ = sk.p.z;
  }
  return {
    finished: session.finished, time: +t.toFixed(1), runTime: +session.runTime.toFixed(1), crashes: session.crashes,
    crashLog: session.crashLog, stuck, maxZ: +maxZ.toFixed(0), stats: session.stats, saves: session.saves,
  };
}
