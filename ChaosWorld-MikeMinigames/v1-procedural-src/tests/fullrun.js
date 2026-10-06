// Unforced complete playthroughs with real keyboard/mouse input, default tuning.
// Mode 1: SOLO control. Mode 2: AUTO items. Reports outcome + console errors.
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, '../dist/ChaosWorldMikeMinigames.html');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 450, height: 800 } });
  const errors = [], reqs = [];
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); p.on('pageerror', (e) => errors.push(String(e)));
  p.on('request', (r) => reqs.push(r.url()));
  await p.goto(FILE); await p.evaluate(() => { CW.S().mute = true; CW.S().m1.partner = 'human'; });
  // ---------- MODE 1 ----------
  await p.click('#play1'); await p.click('#m1go');
  const T = Date.now(); let pulls = 0, throws = 0;
  while (Date.now() - T < 240000) {
    const s = await p.evaluate(() => { const m = CW.M1; return { st: m.state, r: m.ropers.map((r) => ({ can: m.canThrow(r), d: (r.zoneC - r.tpos) * r.tdir })) }; });
    if (s.st === 'win' || s.st === 'lose') break;
    if (s.st === 'active') { for (const i of [0, 1]) if (s.r[i].can && s.r[i].d > 0.0 && s.r[i].d < 0.07) { await p.keyboard.press(i ? 'l' : 'a'); throws++; } }
    else if (s.st === 'pull') { await p.keyboard.press(pulls++ % 2 ? 'l' : 'a'); await sleep(55); }
    else if (s.st === 'stun') { await p.keyboard.press('1'); await p.keyboard.press('2'); await p.keyboard.press('3'); }
    await sleep(10);
  }
  const r1 = await p.evaluate(() => ({ state: CW.M1.state, time: Math.round(CW.M1.time), takedowns: CW.M1.takedowns, burned: CW.M1.ropesBurned, bossHp: CW.M1.bossHp, dmg: CW.M1.totalDmg }));
  console.log('MODE 1 full run:', JSON.stringify(r1), 'throw keypresses', throws);
  await sleep(4500);
  console.log('  results visible:', await p.locator('#results .res-title').isVisible());
  await p.click('#resMenu');
  // ---------- MODE 2 ----------
  await p.click('#play2'); await p.locator('#m2mode button[data-v="auto"]').click(); await p.click('#m2go');
  const T2 = Date.now(); let n = 0;
  while (Date.now() - T2 < 300000) {
    const s = await p.evaluate(() => { const m = CW.M2, e = m.nearestEnemy(); return { st: m.state, e: e && e.y > 30 ? [e.x, e.y - 26] : null, ult: m.ult }; });
    if (s.st !== 'play') break;
    if (s.e) { const bb = await p.locator('#frame').boundingBox(); await p.mouse.click(bb.x + s.e[0] / 450 * bb.width, bb.y + s.e[1] / 800 * bb.height); }
    if (n++ % 10 === 0) { await p.keyboard.press('1'); await p.keyboard.press('2'); await p.keyboard.press('3'); if (s.ult >= 100) await p.keyboard.press(' '); }
    await sleep(70);
  }
  const r2 = await p.evaluate(() => ({ state: CW.M2.state, time: Math.round(CW.M2.time), wave: CW.M2.wave, kills: CW.M2.kills, hunterHpPct: Math.round(CW.M2.hunter.hp / CW.M2.hunter.max * 100), closest: Math.round(CW.M2.stats.closest), appearances: CW.M2.stats.appearances, escapes: CW.M2.stats.escapes, items: CW.M2.stats.items }));
  console.log('MODE 2 full run:', JSON.stringify(r2));
  await sleep(4500);
  console.log('  results visible:', await p.locator('#results .res-title').isVisible());
  const ext = reqs.filter((u) => !u.startsWith('file:') && !u.startsWith('data:'));
  console.log('console/page errors:', errors.length, JSON.stringify(errors), '| game errors:', await p.evaluate(() => CW.Game.errors.length), '| external requests:', ext.length);
  await b.close();
})();
