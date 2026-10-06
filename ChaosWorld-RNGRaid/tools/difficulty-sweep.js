// node tools/difficulty-sweep.js <hpScale> <atkScale> — quick win-rate sweep for the boss race.
const CW = require('./load-core')();
const runs = +process.argv[4] || 60;
const [hp, atk] = process.argv.slice(2).map(Number);
CW.BATTLE.enemyHpScale = hp; CW.BATTLE.enemyAtkScale = atk;
function rate(pot, force) {
  let w = 0, t = 0, ko = 0;
  for (let i = 0; i < runs; i++) {
    const L = new CW.Lobby({ seed: 1000 + i, debug: { forceRarity: force || null, forceRarityBots: !!force } }); L.skipToBattle();
    const b = new CW.Battle({ party: L.partySpec(), seed: 5000 + i, mods: CW.raidMods(pot), biome: CW.BIOMES[i % 3], autoHuman: true, boons: [CW.pickBoonOptions(new CW.RNG(i))[0]] });
    const r = b.runToEnd(); if (r.won) w++; t += r.time; ko += b.units.reduce((a, u) => a + u.tally.timesKO, 0);
  }
  return `${Math.round(100 * w / runs)}%/${Math.round(t / runs)}s/${(ko / runs).toFixed(1)}ko`;
}
console.log(hp, atk, 'x1', rate(100), 'x1.5', rate(150), 'x2', rate(200), 'com x1', rate(100, 'common'), 'com x2', rate(200, 'common'), 'leg x2', rate(200, 'legendary'));
