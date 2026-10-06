// Runs the bot across strategies/seeds and prints campaign outcomes.
// Usage: node tools/balance.mjs [strategy ...]
import { loadSF } from '../tests/load.mjs';
const SF = loadSF();
const strats = process.argv.slice(2).length ? process.argv.slice(2) : ['precision', 'manual', 'nuke', 'pk', 'brute'];
const N = 12;
for (const st of strats) {
  let wins = 0, cyc = 0, minHull = 0, inc = 0, lost = 0, civ = 0, repairs = 0, pk = 0;
  for (let seed = 1; seed <= N; seed++) {
    const g = SF.newGame({ seed });
    let mh = 1, rp = 0;
    const origRepair = SF.repairFortress;
    SF.repairFortress = (gg) => { const r = origRepair(gg); if (r.ok) rp++; return r; };
    while (!g.over && g.cycle < 160) { SF.botTurn(g, st); mh = Math.min(mh, g.fort.hull / SF.hullMax(g)); }
    SF.repairFortress = origRepair;
    const s = SF.score(g);
    if (g.over === 'win') wins++;
    cyc += s.cycles; minHull += mh; inc += s.income; lost += s.troopsLost; civ += s.civilians; repairs += rp; pk += g.stats.planetKills;
  }
  const a = (v) => (v / N);
  console.log(`${st.padEnd(10)} wins ${wins}/${N} | cycles ${a(cyc).toFixed(1)} | min hull ${Math.round(a(minHull) * 100)}% | repairs ${a(repairs).toFixed(1)} | end income ${Math.round(a(inc))}/cyc | troops lost ${SF.fmtK(a(lost))} | civilians ${a(civ).toFixed(1)}M | PK ${pk}`);
}
