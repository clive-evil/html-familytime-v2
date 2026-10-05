// node tools/lobby-sim.js [runs] — bot behaviour stats per mode (human idle).
const CW = require('./load-core')();
const runs = +process.argv[2] || 200;
for (const mode of ['rng', 'grief']) {
  const agg = { pot: 0, pot2: 0, steals: 0, fails: 0, griefs: 0, boosts: 0, rerolls: 0, shuffles: 0, botActions: 0, humanHits: 0, dur: 0, potHist: {} };
  for (let i = 0; i < runs; i++) {
    const L = new CW.Lobby({ mode, seed: 300 + i });
    let t = 0;
    while (L.phase !== 'done' && t < 200) { L.update(1 / 30); t += 1 / 30; }
    agg.pot += L.potX100; if (L.potX100 >= 200) agg.pot2++;
    const b = Math.floor(L.potX100 / 25) * 25; agg.potHist[b] = (agg.potHist[b] || 0) + 1;
    agg.steals += L.stats.steals; agg.fails += L.stats.stealFails; agg.griefs += L.stats.griefs; agg.boosts += L.stats.boosts; agg.botActions += L.stats.botActions;
    agg.rerolls += L.log.filter((e) => e.type === 'reroll').length; agg.shuffles += L.log.filter((e) => e.type === 'shuffle').length;
    agg.humanHits += L.log.filter((e) => (e.type === 'stealStart' || e.type === 'griefStart') && e.tid === 'p0').length;
    agg.dur += L.time;
  }
  const f = (k) => (agg[k] / runs).toFixed(2);
  console.log(`${mode.padEnd(6)} pot avg x${(agg.pot / runs / 100).toFixed(2)} | x2 ${(100 * agg.pot2 / runs).toFixed(0)}% | boosts ${f('boosts')} steals ${f('steals')}/${f('fails')}fail griefs ${f('griefs')} rerolls ${f('rerolls')} shuffles ${f('shuffles')} | hits on human ${f('humanHits')} | lobby ${f('dur')}s`);
  console.log('        pot hist', JSON.stringify(agg.potHist));
}
