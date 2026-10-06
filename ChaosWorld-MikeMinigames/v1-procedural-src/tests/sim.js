// Balance simulator: drives the real M1/M2 code in-page with human-like bot inputs.
// node tests/sim.js [runs]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const RUNS = +process.argv[2] || 12;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 450, height: 800 } });
  await p.goto('file://' + path.resolve(__dirname, '../dist/ChaosWorldMikeMinigames.html'));
  const res = await p.evaluate(async (RUNS) => {
    const { Main, M1, M2, Game, S } = CW; S().mute = true;
    const out = { m1: [], m2: {} };
    const dt = 1 / 60;
    // ---------- MODE 1 bot: human roper 1 (75% accurate, 7 taps/s), AI partner OK ----------
    for (const prof of [{ acc: 0.75, tps: 7, name: 'avg' }, { acc: 0.55, tps: 5.5, name: 'weak' }]) {
      const runs = [];
      for (let n = 0; n < RUNS; n++) {
        Main.play(1); Game.paused = true; S().m1.partner = 'ai_ok'; M1.reset(true);
        let react = 0.6, tapT = 0, plan = null;
        for (let i = 0; i < 60 * 400; i++) {
          const r = M1.ropers[0];
          if (M1.canThrow(r)) {
            if (!plan) plan = { wait: 0.4 + Math.random() * 0.6, good: Math.random() < prof.acc };
            plan.wait -= dt;
            const inZ = Math.abs(r.tpos - r.zoneC) < 0.1;
            if (plan.wait <= 0 && (plan.good ? inZ : !inZ)) { M1.roperAction(0); plan = null; }
          } else plan = null;
          if (M1.state === 'pull') { if (M1.stateT > 0.35) { tapT -= dt; if (tapT <= 0) { tapT = 1 / (prof.tps * (0.8 + Math.random() * 0.4)); M1.roperAction(0); } } }
          if (M1.state === 'stun') { M1.ability(0); M1.ability(1); if (M1.ult >= 100) M1.ability(2); }
          M1.update(dt);
          if (M1.state === 'win' || M1.state === 'lose') break;
        }
        runs.push({ win: M1.state === 'win', t: Math.round(M1.time), td: M1.takedowns, burned: M1.ropesBurned, hp: Math.round(M1.bossHp / M1.bossMax * 100), kos: M1.heroes.filter(h=>h.ko).length });
      }
      out.m1.push({ prof: prof.name, runs });
    }
    // ---------- MODE 2 bot: strikes nearest at N taps/s, skills on cooldown ----------
    for (const prof of [{ tps: 4, name: 'avg' }, { tps: 2, name: 'weak' }, { tps: 6, name: 'strong' }]) {
      for (const mode of ['auto', 'manual']) {
        const runs = [];
        for (let n = 0; n < RUNS; n++) {
          S().m2.itemMode = mode; Main.play(2); Game.paused = true; M2.reset(true);
          let tapT = 0;
          for (let i = 0; i < 60 * 400; i++) {
            tapT -= dt; if (tapT <= 0) { tapT = 1 / prof.tps; const e = M2.nearestEnemy(); if (e) M2.strike(e); }
            M2.skill(0); M2.skill(1); M2.skill(2); if (M2.ult >= 100) M2.skill(3);
            // manual heuristic: fire when he's under 70m or tray is full
            if (mode === 'manual') for (let s = 0; s < 3; s++) if (M2.tray[s] && M2.tray[s] !== 'pending' && (M2.hunter.dist < 70 || !M2.tray.includes(null))) M2.fireTray(s);
            M2.update(dt);
            if (M2.state !== 'play') break;
          }
          runs.push({ end: M2.state, t: Math.round(M2.time), wave: M2.wave, closest: Math.round(M2.stats.closest), hunterHp: Math.round(M2.hunter.hp / M2.hunter.max * 100), items: M2.stats.items.common + M2.stats.items.rare + M2.stats.items.epic, vis: M2.stats.appearances });
        }
        out.m2[prof.name + '/' + mode] = runs;
      }
    }
    Main.toMenu();
    return out;
  }, RUNS);
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  for (const g of res.m1) {
    const r = g.runs, w = r.filter((x) => x.win);
    console.log(`M1 ${g.prof}: win ${w.length}/${r.length} · median clear ${w.length ? med(w.map((x) => x.t)) : '-'}s · takedowns med ${med(r.map((x) => x.td))} · burns med ${med(r.map((x) => x.burned))} · losses ${r.length - w.length} ${JSON.stringify(r.filter(x=>!x.win).slice(0,3))}`);
  }
  for (const k in res.m2) {
    const r = res.m2[k], ends = {}; r.forEach((x) => (ends[x.end] = (ends[x.end] || 0) + 1));
    console.log(`M2 ${k}: ${JSON.stringify(ends)} · median time ${med(r.map((x) => x.t))}s · closest med ${med(r.map((x) => x.closest))}m · items med ${med(r.map((x) => x.items))} · hunterHP left med ${med(r.map((x) => x.hunterHp))}% · appearances med ${med(r.map((x) => x.vis))}`);
  }
  await b.close();
})();
