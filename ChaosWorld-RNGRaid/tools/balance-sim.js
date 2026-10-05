// node tools/balance-sim.js [runs] — win rates by raid pot & loadout quality.
const CW = require('./load-core')();
const runs = +process.argv[2] || 200;
function lobbyParty(seed, force) {
  const L = new CW.Lobby({ seed, debug: { forceRarity: force || null, forceRarityBots: !!force } });
  L.skipToBattle();
  return L.partySpec();
}
function sim(label, pot, force) {
  let wins = 0, time = 0, wave = 0;
  for (let i = 0; i < runs; i++) {
    const party = lobbyParty(1000 + i, force);
    const b = new CW.Battle({ party, seed: 5000 + i, mods: CW.raidMods(pot), biome: CW.BIOMES[i % 3], autoHuman: true });
    const r = b.runToEnd();
    if (r.won) wins++;
    time += r.time; wave += r.wave;
  }
  console.log(`${label.padEnd(16)} pot x${(pot / 100).toFixed(2)}  win ${(100 * wins / runs).toFixed(0).padStart(3)}%  avgTime ${(time / runs).toFixed(0)}s  avgWaveReached ${(wave / runs + 1).toFixed(2)}`);
}
for (const pot of [100, 150, 200]) sim('random', pot);
for (const pot of [100, 200]) sim('all common', pot, 'common');
for (const pot of [100, 200]) sim('all legendary', pot, 'legendary');
