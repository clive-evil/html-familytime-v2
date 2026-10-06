import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('shots', { recursive: true });
const url = 'file://' + process.cwd() + '/dist/SpaceFortress.html';
const errs = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
await page.goto(url + '?seed=5');
await page.waitForFunction(() => window.SF && window.SF.ui);
await page.click('#t-skip');
await page.waitForFunction(() => window.SF.game);
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/02-system.png' });
// scan + fire on a fresh railgun
const log = await page.evaluate(async () => {
  const SF = window.SF, UI = SF.ui, G = SF.game, out = [];
  SF.main.select({ kind: 'planet', id: 'varn' }); SF.scan(G, 'varn'); UI.afterAction();
  const bar = SF.planet(G, 'varn').insts.find((i) => i.type === 'barracks');
  UI.selected = 'varn'; UI.selectedInst = bar.id; UI.weapon = 'bombard';
  UI.fireAuto(); await new Promise(r => setTimeout(r, 1400));
  out.push('bombard fired, barracks hp=' + Math.round(bar.hp));
  return out;
}, {});
await page.screenshot({ path: 'shots/03-fired.png' });
// manual console with railgun fresh
const man = await page.evaluate(async () => {
  const SF = window.SF, UI = SF.ui, G = SF.game;
  const mine = SF.planet(G, 'varn').insts.find((i) => i.type === 'mine');
  UI.selected = 'varn'; UI.selectedInst = mine.id; UI.weapon = 'railgun';
  UI.openManual(); await new Promise(r => setTimeout(r, 400));
  return { open: SF.manual.isOpen, state: SF.manual.debugState() };
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/05-manual.png' });
await page.evaluate(() => SF.manual.forceClose());
// fortress
await page.click('#btn-fortress'); await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/04-fortress.png' });
await page.keyboard.press('Escape');
// jump to final system, unlock PK, open the sequence
const pk = await page.evaluate(async () => {
  const SF = window.SF, UI = SF.ui;
  const G = SF.game;
  // fast-forward: grant resources + pk, move to final system
  while (G.sysIndex < SF.CAMPAIGN.length - 1) { for (const p of SF.curSys(G).planets) if (p.owner === 'enemy') p.owner = 'player'; SF.curSys(G).fleets = []; SF.jump(G); }
  G.res = { metals: 999, fissile: 999, crystals: 999, exotic: 999 };
  for (const u of ['fort_reactor', 'fort_modules', 'fort_pk']) SF.buyUpgrade(G, u);
  G.fort.power = SF.powerMax(G);
  UI.refresh();
  SF.main.select({ kind: 'planet', id: 'aeternum' });
  SF.pkMode.open('aeternum');
  await new Promise(r => setTimeout(r, 500));
  return SF.pkMode.active;
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/06-planetkiller.png' });
await page.evaluate(() => SF.pkMode.forceClose());
console.log(log.join('\n'));
console.log('manual:', JSON.stringify(man));
console.log('pk opened:', pk);
console.log('ERRORS:', errs.length ? '\n' + errs.join('\n') : 'none');
await browser.close();
process.exit(errs.length ? 1 : 0);
