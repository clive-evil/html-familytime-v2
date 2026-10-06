// node tools/balance-sim.js [runs] — boss-race win rates, length, knockouts, and how often the race leader changes.
const CW = require('./load-core')();
const runs = +process.argv[2] || 200;
function sim(label, pot, force) {
  let wins = 0, time = 0, ko = 0, leads = 0, items = 0, humanWins = 0, spread = 0;
  for (let i = 0; i < runs; i++) {
    const L = new CW.Lobby({ seed: 1000 + i, debug: { forceRarity: force || null, forceRarityBots: !!force } });
    L.skipToBattle();
    const b = new CW.Battle({ party: L.partySpec(), seed: 5000 + i, mods: CW.raidMods(pot), biome: CW.BIOMES[i % 3], autoHuman: true, boons: [CW.pickBoonOptions(new CW.RNG(i))[0]] });
    let t = 0;
    while (b.state !== 'won' && b.state !== 'lost' && t < 400) { b.update(1 / 30); t += 1 / 30; for (const e of b.drain()) { if (e.type === 'newLeader') leads++; if (e.type === 'itemUsed') items++; } }
    const r = b.result;
    if (r.won) wins++;
    time += r.time; ko += b.units.reduce((a, u) => a + u.tally.timesKO, 0);
    if (r.standings[0].isHuman) humanWins++;
    spread += r.standings[0].dmg / Math.max(1, r.standings[7].dmg);
  }
  const f = (x) => (x / runs).toFixed(1);
  console.log(`${label.padEnd(14)} x${(pot / 100).toFixed(2)}  win ${String(Math.round(100 * wins / runs)).padStart(3)}%  ${f(time)}s  KOs ${f(ko)}  lead changes ${f(leads)}  items used ${f(items)}  you 1st ${Math.round(100 * humanWins / runs)}%  1st/8th dmg ${(spread / runs).toFixed(2)}x`);
}
for (const pot of [100, 150, 200]) sim('random', pot);
for (const pot of [100, 200]) sim('all common', pot, 'common');
for (const pot of [100, 200]) sim('all legendary', pot, 'legendary');
