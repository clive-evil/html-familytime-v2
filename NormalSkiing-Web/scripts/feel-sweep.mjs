// Tuning sweep: how does jump outcome depend on extension timing & speed?
// Usage: node scripts/feel-sweep.mjs [lip=small|big|ravine] [speed]
import { makeLab } from '../src/world/lab.js';
import { run, jumpScript } from '../src/sim/harness.js';

const which = process.argv[2] || 'small';
const LIPS = { small: { z: 430, start: 400 }, big: { z: 560, start: 530 }, ledge: { z: 751, start: 722 }, ravine: { z: 1050, start: 1020 }, camber: { z: 1170, start: 1140 } };
const lipDef = LIPS[which];
const speeds = process.argv[3] ? [Number(process.argv[3])] : [14, 20, 26];
const w = makeLab();

function trial(speed, extendAt, extra = {}) {
  let toZ = null, landZ = null, jump = null, landing = null;
  let tdZ = null;
  const r = run({
    world: w, x: 0, z: lipDef.start, speed, maxT: 8,
    script: jumpScript({ zLip: lipDef.z, extendAt, ...extra }),
    stopWhen: (sk) => sk.lastJump && sk.lastJump.landing && sk.time > 0.5,
  });
  const sk = r.sk;
  for (const e of r.events) {
    if (e.type === 'jump' && !jump) jump = e.report;
  }
  const td = r.events.find((e) => e.type === 'touchdown');
  const toE = r.events.find((e) => e.type === 'jump');
  if (toE) toE.z = toE.report.z;
  const j = jump;
  return {
    timing: j ? j.timing : '-', pop: j ? j.popVel : 0, offs: j ? j.offsetMs : 0,
    air: j && j.landing ? j.landing.airTime : (sk.crashed ? 'X' : '-'),
    dist: td && toE ? td.z - toE.z : 0,
    land: (j && j.landing ? j.landing.quality : '-') + (sk.crashed ? ' CRASH:' + sk.crashed.cause : '') + (j && j.landing ? ` pitchErr${j.landing.pitchErrDeg} vn${j.landing.impactVel} bal${j.landing.maxBalance}` : ''),
    g: j && j.landing ? j.landing.impactG : 0,
  };
}

for (const speed of speeds) {
  console.log(`\n=== ${which} lip @ ${speed} m/s ===`);
  console.log('extendAt(m before lip) | timing  | pop m/s | offs ms | air s | landing');
  const rows = [['none', { extendTo: -0.75, crouchTo: -0.75, extendAt: -50 }], ['nocrouch', { crouchTo: 0, extendTo: 0 }]];
  const ext = process.env.QUICK ? [8, 6, 4, 2, 0] : [12, 8, 6, 4, 3, 2, 1.5, 1, 0.5, 0, -0.5, -1, -2];
  for (const e of ext) rows.push([e, {}]);
  for (const [e, extra] of rows) {
    const res = trial(speed, typeof e === 'number' ? e : (extra.extendAt ?? 2), extra);
    console.log(`${String(e).padStart(8)} | ${String(res.timing).padEnd(7)} | ${String(res.pop).padStart(5)} | ${String(res.offs).padStart(6)} | ${String(res.air).padStart(5)} | ${res.dist.toFixed(1).padStart(5)}m | ${res.land} G${res.g}`);
  }
}
