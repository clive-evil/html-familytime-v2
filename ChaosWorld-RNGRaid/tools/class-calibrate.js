// node tools/class-calibrate.js [iterations] — prints class damage share in the boss race and suggested CLASSES[].atk.
// Targets: dps classes = 1.0 of mean damage, tank/healer = TARGET_SUPPORT (they bring shields/heals instead).
const CW = require('./load-core')();
const TARGET_SUPPORT = 0.95;
const iters = +process.argv[2] || 3;
function measure(n = 120) {
  const share = {};
  for (let i = 0; i < n; i++) {
    const L = new CW.Lobby({ seed: 7000 + i }); L.skipToBattle();
    const b = new CW.Battle({ party: L.partySpec(), seed: i, mods: CW.raidMods(130), biome: CW.BIOMES[i % 3], autoHuman: true });
    b.runToEnd();
    const mean = b.units.reduce((a, u) => a + u.dmg, 0) / b.units.length;
    for (const u of b.units) { const s = share[u.classId] || (share[u.classId] = { sum: 0, n: 0, rank: 0 }); s.sum += u.dmg / mean; s.n++; s.rank += u.rank; }
  }
  return share;
}
for (let it = 0; it < iters; it++) {
  const share = measure();
  const line = [];
  for (const [id, s] of Object.entries(share)) {
    const c = CW.CLASSES[id];
    const avg = s.sum / s.n;
    const target = c.role === 'dps' ? 1 : TARGET_SUPPORT;
    c.atk = Math.round(c.atk * Math.pow(target / avg, 0.85) * 10) / 10;
    line.push(`${id}:${avg.toFixed(2)}@r${(s.rank / s.n).toFixed(1)}→atk ${c.atk}`);
  }
  console.log(`iter ${it}: ` + line.join('  '));
}
console.log(JSON.stringify(Object.fromEntries(CW.CLASS_IDS.map((id) => [id, CW.CLASSES[id].atk]))));
