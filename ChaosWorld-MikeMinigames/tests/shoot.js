// Visual pass: node tests/shoot.js <outdir>
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const out = process.argv[2] || '.'; const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 430, height: 932 } });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + path.resolve(__dirname, '../dist/ChaosWorldMikeMinigames.html'));
  await p.waitForFunction(() => window.__cwReady, null, { timeout: 15000 }); await p.evaluate(() => { CW.S().mute = true; });
  await p.waitForTimeout(1200); await p.screenshot({ path: out + '/0menu.png' });
  await p.evaluate(() => CW.Main.play(1)); await p.waitForTimeout(700); await p.screenshot({ path: out + '/1intro.png' });
  await p.evaluate(() => CW.M1.startFight()); await p.waitForTimeout(2600); await p.screenshot({ path: out + '/1active.png' });
  await p.evaluate(() => { const m = CW.M1; m.ropers.forEach((r) => { r.tpos = r.zoneC; m.throwRope(r); }); });
  await p.waitForTimeout(900); await p.evaluate(() => { CW.M1.ropers[0].pull = 70; CW.M1.ropers[1].pull = 40; }); await p.waitForTimeout(100); await p.screenshot({ path: out + '/1pull.png' });
  await p.evaluate(() => { CW.M1.ropers.forEach((r) => (r.pull = 100)); }); await p.waitForTimeout(2600); await p.screenshot({ path: out + '/1stun.png' });
  await p.evaluate(() => CW.Main.play(2)); await p.waitForTimeout(600); await p.screenshot({ path: out + '/2intro.png' });
  await p.evaluate(() => CW.M2.startRun()); await p.waitForTimeout(4500); await p.screenshot({ path: out + '/2play.png' });
  await p.evaluate(() => { CW.M2.rollDrop(700, 700, 'rare'); }); await p.waitForTimeout(700); await p.screenshot({ path: out + '/2drop.png' });
  await p.evaluate(() => { CW.M2.hunter.dist = 20; }); await p.waitForTimeout(1500); await p.screenshot({ path: out + '/2visible.png' });
  console.log('errors:', JSON.stringify(errs), 'game:', JSON.stringify(await p.evaluate(() => CW.Game.errors)));
  await b.close();
})();
