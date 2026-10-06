// Unforced complete playthroughs with real keyboard/mouse input at default tuning.
// NODE_PATH=$(npm root -g) node tests/fullrun.js
const { chromium } = require('playwright'); const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 430, height: 932 } });
  const errors = [], reqs = []; p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); p.on('pageerror', (e) => errors.push(String(e))); p.on('request', (r) => reqs.push(r.url()));
  await p.goto('file://' + path.resolve(__dirname, '../dist/ChaosWorldMikeMinigames.html')); await p.waitForFunction(() => window.__cwReady);
  await p.evaluate(() => { CW.S().mute = true; CW.S().m1.partner = 'human'; });
  await p.locator('.cw-mode.m1 .md-play').click(); await p.locator('.cw-intro .cw-go').click();
  let T = Date.now(), pulls = 0;
  while (Date.now() - T < 300000) {
    const s = await p.evaluate(() => { const m = CW.M1; return { st: m.state, r: m.ropers.map((r) => ({ can: m.canThrow(r), d: (r.zoneC - r.tpos) * r.tdir })) }; });
    if (s.st === 'win' || s.st === 'lose') break;
    if (s.st === 'active') { for (const i of [0, 1]) if (s.r[i].can && s.r[i].d > 0.0 && s.r[i].d < 0.07) await p.keyboard.press(i ? 'l' : 'a'); }
    else if (s.st === 'pull') { await p.keyboard.press(pulls++ % 2 ? 'l' : 'a'); await sleep(50); }
    else if (s.st === 'stun') { await p.keyboard.press('1'); await p.keyboard.press('2'); await p.keyboard.press('3'); }
    await sleep(10);
  }
  console.log('MODE 1:', JSON.stringify(await p.evaluate(() => ({ state: CW.M1.state, time: Math.round(CW.M1.time), takedowns: CW.M1.takedowns, burned: CW.M1.ropesBurned, dmg: CW.M1.totalDmg }))));
  await p.waitForSelector('#cw-results', { timeout: 10000 }); console.log('  results shown'); await p.locator('#cw-results .cw-rm').click();
  await p.locator('.cw-mode.m2 .md-play').click(); await p.locator('#m2mode button[data-v="auto"]').click(); await p.locator('.cw-intro .cw-go').click();
  T = Date.now(); let n = 0;
  while (Date.now() - T < 360000) {
    const s = await p.evaluate(() => { const m = CW.M2, e = m.nearest(); let c = null; if (e) { const st = CW.E.S, [sx, sy] = st.b.cam.toScreen(e.x, e.cy), r = st.stageEl.getBoundingClientRect(); c = [r.left + sx * st.scale, r.top + (sy + st.xh) * st.scale]; } return { st: m.state, c, ult: m.ult }; });
    if (s.st !== 'play') break;
    if (s.c) await p.mouse.click(s.c[0], s.c[1]);
    if (n++ % 8 === 0) { await p.keyboard.press('1'); await p.keyboard.press('2'); await p.keyboard.press('3'); if (s.ult >= 100) await p.keyboard.press(' '); }
    await sleep(60);
  }
  console.log('MODE 2:', JSON.stringify(await p.evaluate(() => ({ state: CW.M2.state, time: Math.round(CW.M2.time), wave: CW.M2.wave, kills: CW.M2.kills, hunterHp: Math.round(CW.M2.hunter.hp / CW.M2.hunter.max * 100) + '%', closest: Math.round(CW.M2.stats.closest), seen: CW.M2.stats.appearances, escapes: CW.M2.stats.escapes, items: CW.M2.stats.items }))));
  await p.waitForSelector('#cw-results', { timeout: 10000 }); console.log('  results shown');
  console.log('console/page errors:', errors.length, JSON.stringify(errors.slice(0, 3)), '| game errors:', await p.evaluate(() => CW.Game.errors.length), '| external requests:', reqs.filter((u) => !u.startsWith('file:') && !u.startsWith('data:')).length);
  await b.close();
})();
