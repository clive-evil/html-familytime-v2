// Quick visual check: node tests/shoot.js <outdir>
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = process.argv[2] || '.';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 450, height: 800 }, deviceScaleFactor: 1 });
  const errs = []; p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto('file://' + path.resolve(__dirname, '../dist/ChaosWorldMikeMinigames.html'));
  await p.waitForTimeout(500); await p.screenshot({ path: out + '/0menu.png' });
  await p.evaluate(() => CW.Main.play(1)); await p.waitForTimeout(400); await p.screenshot({ path: out + '/1intro.png' });
  await p.evaluate(() => CW.M1.startFight()); await p.waitForTimeout(2600); await p.screenshot({ path: out + '/1active.png' });
  await p.evaluate(() => { const m = CW.M1; m.ropers.forEach((r) => { r.tpos = r.zoneC; m.throwRope(r); }); });
  await p.waitForTimeout(900); await p.evaluate(() => { CW.M1.ropers[0].pull = 70; CW.M1.ropers[1].pull = 40; }); await p.waitForTimeout(80); await p.screenshot({ path: out + '/1pull.png' });
  await p.evaluate(() => { CW.M1.ropers.forEach((r) => (r.pull = 100)); }); await p.waitForTimeout(2200); await p.screenshot({ path: out + '/1stun.png' });
  await p.evaluate(() => CW.Main.play(2)); await p.waitForTimeout(300); await p.screenshot({ path: out + '/2intro.png' });
  await p.evaluate(() => CW.M2.startRun()); await p.waitForTimeout(3500); await p.screenshot({ path: out + '/2play.png' });
  await p.evaluate(() => { CW.M2.hunter.dist = 20; }); await p.waitForTimeout(1500); await p.screenshot({ path: out + '/2visible.png' });
  console.log('errors:', JSON.stringify(errs), 'gameErrors:', JSON.stringify(await p.evaluate(() => CW.Game.errors)));
  await b.close();
})();
