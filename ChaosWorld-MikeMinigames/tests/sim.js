// Balance simulator: steps the real Battle Lab engine + mode logic at 60Hz with human-like bots.
// NODE_PATH=$(npm root -g) node tests/sim.js [runs]
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const RUNS = +process.argv[2] || 10;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 430, height: 932 } });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto('file://' + path.resolve(__dirname, '../dist/ChaosWorldMikeMinigames.html'));
  await p.waitForFunction(() => window.__cwReady, null, { timeout: 15000 });
  const res = await p.evaluate(async (RUNS) => {
    const { Main, M1, M2, E, S } = CW; S().mute = true; const dt = 1 / 60, out = { m1: [], m2: {} };
    const step = (M) => { E.S.paused = true; E.B.update(dt); M.update(dt); };
    for (const prof of [{ acc: 0.75, tps: 7, name: 'avg' }, { acc: 0.55, tps: 5.5, name: 'weak' }]) {
      const runs = [];
      for (let n = 0; n < RUNS; n++) {
        S().m1.partner = 'ai_ok'; Main.play(1); M1.reset(true);
        let plan = null, tapT = 0;
        for (let i = 0; i < 60 * 400; i++) {
          const r = M1.ropers[0];
          if (M1.canThrow(r)) { if (!plan) plan = { wait: 0.4 + Math.random() * 0.6, good: Math.random() < prof.acc }; plan.wait -= dt; const inZ = Math.abs(r.tpos - r.zoneC) < 0.1; if (plan.wait <= 0 && (plan.good ? inZ : !inZ)) { M1.roperAction(0); plan = null; } } else plan = null;
          if (M1.state === 'pull' && M1.stateT > 0.35) { tapT -= dt; if (tapT <= 0) { tapT = 1 / (prof.tps * (0.8 + Math.random() * 0.4)); M1.roperAction(0); } }
          if (M1.state === 'stun') { M1.ability(0); M1.ability(1); if (M1.ult >= 100) M1.ability(2); }
          step(M1); if (M1.state === 'win' || M1.state === 'lose') break;
        }
        runs.push({ win: M1.state === 'win', t: Math.round(M1.time), td: M1.takedowns, burned: M1.ropesBurned, hp: Math.round(M1.bossHp / M1.bossMax * 100) });
      }
      out.m1.push({ prof: prof.name, runs });
    }
    for (const prof of [{ tps: 4, name: 'avg' }, { tps: 2, name: 'weak' }, { tps: 6, name: 'strong' }]) {
      for (const mode of ['auto', 'manual']) {
        const runs = [];
        for (let n = 0; n < RUNS; n++) {
          S().m2.itemMode = mode; Main.play(2); M2.reset(true); let tapT = 0;
          for (let i = 0; i < 60 * 400; i++) {
            tapT -= dt; if (tapT <= 0) { tapT = 1 / prof.tps; const e = M2.nearest(); if (e) M2.strike(e); }
            M2.skill(0); M2.skill(1); M2.skill(2); if (M2.ult >= 100) M2.onUlt();
            if (mode === 'manual') for (let s = 0; s < 3; s++) if (M2.tray[s] && M2.tray[s] !== 'pending' && (M2.hunter.dist < 70 || !M2.tray.includes(null))) M2.fireTray(s);
            step(M2); if (M2.state !== 'play') break;
          }
          runs.push({ end: M2.state, t: Math.round(M2.time), wave: M2.wave, closest: Math.round(M2.stats.closest), hhp: Math.round(M2.hunter.hp / M2.hunter.max * 100), items: M2.stats.items.common + M2.stats.items.rare + M2.stats.items.epic, vis: M2.stats.appearances, kills: M2.kills });
        }
        out.m2[prof.name + '/' + mode] = runs;
      }
    }
    E.S.paused = false; Main.toMenu(); return out;
  }, RUNS);
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  for (const g of res.m1) { const r = g.runs, w = r.filter((x) => x.win); console.log(`M1 ${g.prof}: win ${w.length}/${r.length} · median clear ${w.length ? med(w.map((x) => x.t)) : '-'}s · takedowns ${med(r.map((x) => x.td))} · burns ${med(r.map((x) => x.burned))}`); }
  for (const k in res.m2) { const r = res.m2[k], ends = {}; r.forEach((x) => (ends[x.end] = (ends[x.end] || 0) + 1)); console.log(`M2 ${k}: ${JSON.stringify(ends)} · time ${med(r.map((x) => x.t))}s · closest ${med(r.map((x) => x.closest))}m · items ${med(r.map((x) => x.items))} · kills ${med(r.map((x) => x.kills))} · hunterHP left ${med(r.map((x) => x.hhp))}% · seen ${med(r.map((x) => x.vis))}`); }
  console.log('errors', errs.length, errs.slice(0, 3)); await b.close();
})();
