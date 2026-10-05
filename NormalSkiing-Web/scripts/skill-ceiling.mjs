// Skill-ceiling experiment: the same jump attempted by simulated players with
// different timing precision / flick speed / landing prep. If the mechanic
// has depth, precise players should land longer AND cleaner jumps.
// Usage: node scripts/skill-ceiling.mjs
import { makeLab } from '../src/world/lab.js';
import { run } from '../src/sim/harness.js';
import { mulberry32 } from '../src/sim/math.js';

const lab = makeLab();
const JUMPS = [
  { name: 'small lip', zLip: 430, start: 400, speed: 19 },
  { name: 'big lip', zLip: 560, start: 530, speed: 22 },
  { name: 'ravine', zLip: 1050, start: 1020, speed: 20 },
];
// "player" profiles: timing error (s, std dev), flick duration (s), prep error (s)
// Each player aims for the best (lead, flick) for that feature - what a
// player learns by repetition - with execution noise that shrinks with skill.
const PLAYERS = [
  { name: 'first go (no technique)', noTechnique: true },
  { name: 'novice', timingSd: 0.2, flickSd: 0.6, prepSd: 0.4, crouch: -0.5 },
  { name: 'improving', timingSd: 0.09, flickSd: 0.35, prepSd: 0.2, crouch: -0.65 },
  { name: 'skilled', timingSd: 0.035, flickSd: 0.15, prepSd: 0.08, crouch: -0.75 },
];

function gauss(r) {
  return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
}

function attempt(j, p, r, aim) {
  const lead = p.noTechnique ? -1 : aim.lead + gauss(r) * p.timingSd;
  const flick = p.noTechnique ? 1 : Math.max(0.05, aim.flick * Math.exp(gauss(r) * p.flickSd));
  let tFlick = null;
  let tAir = null;
  let first = null;
  const prepLead = p.noTechnique ? 99 : 0.3 + gauss(r) * (p.prepSd || 0);
  const res = run({
    world: lab, x: 0, z: j.start, speed: j.speed, maxT: 7,
    script: (t, sk, i) => {
      const d = j.zLip - sk.p.z;
      const tToLip = d / Math.max(sk.speed, 1);
      if (p.noTechnique) { i.py = 0; return; }
      if (tFlick === null && sk.grounded && tToLip < lead) tFlick = t;
      if (tFlick === null) i.py = tToLip < lead + 0.6 ? Math.max(p.crouch, i.py - 4 / 240) : 0;
      else if (tAir === null) {
        i.py = Math.min(1, i.py + (1.8 / flick) / 240);
        if (!sk.grounded && t - tFlick > 0.03) tAir = t;
      } else if (!sk.grounded) {
        // estimate time to impact
        const clear = sk.p.y - lab.height(sk.p.x + sk.v.x * 0.3, sk.p.z + sk.v.z * 0.3);
        const tImp = clear / Math.max(0.5, -sk.v.y + 0.1);
        i.py = tImp < prepLead ? -0.4 : 0.15;
      } else i.py *= 0.98;
    },
    stopWhen: (sk) => sk.p.z > j.zLip + 70 && sk.grounded && sk.groundTime > 1,
  });
  // judge the biggest flight of the attempt (an early hop off the ramp
  // followed by a weak lip launch counts as the weak launch)
  let best = null;
  for (const e of res.events) if (e.type === 'jump' && e.report.landing && (!best || e.report.landing.airTime > best.landing.airTime)) best = e.report;
  for (const e of res.events) if (e.type === 'jump' && !first) first = e.report;
  const L = best && best.landing;
  return {
    air: L ? L.airTime : 0,
    crash: !!res.sk.crashed,
    clean: L && (L.quality === 'perfect' || L.quality === 'good') && !res.sk.crashed,
    perfectTO: best && best.timing === 'perfect',
    pop: best ? best.popVel : 0,
  };
}

// find the best achievable technique for each jump (noise-free search)
function findAim(j) {
  let best = null;
  const perfect = { timingSd: 0, flickSd: 0, prepSd: 0, crouch: -0.75 };
  for (const lead of [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4]) {
    for (const flick of [0.08, 0.15, 0.25, 0.4]) {
      const a = attempt(j, perfect, () => 0.5, { lead, flick });
      const score = a.crash ? 0 : a.clean ? a.air : a.air * 0.3;
      if (!best || score > best.score) best = { lead, flick, score, air: a.air };
    }
  }
  return best;
}

const N = 40;
console.log(`skill ceiling: ${N} attempts per player per jump\n`);
for (const j of JUMPS) {
  const aim = findAim(j);
  console.log(`== ${j.name} @ ${j.speed} m/s  (best technique: flick ${aim.lead}s before the lip, ${aim.flick}s flick -> ${aim.air}s air) ==`);
  for (const p of PLAYERS) {
    const r = mulberry32(42);
    let air = 0; let crash = 0; let clean = 0; let perf = 0; let pop = 0;
    for (let k = 0; k < N; k++) {
      const a = attempt(j, p, r, aim);
      air += a.air; crash += a.crash; clean += a.clean; perf += a.perfectTO; pop += a.pop;
    }
    console.log(`${p.name.padEnd(24)} avg air ${(air / N).toFixed(2)}s  pop ${(pop / N).toFixed(2)} m/s  perfect takeoffs ${Math.round(perf / N * 100)}%  clean landings ${Math.round(clean / N * 100)}%  crashes ${Math.round(crash / N * 100)}%`);
  }
}
