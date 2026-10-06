// Drives the real UI with mouse/keyboard to check menus, orders, decision and end screens.
import { mkdirSync } from 'node:fs'; mkdirSync(process.env.SHOT_DIR || 'shots', { recursive: true });
const { chromium } = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));
const SP = (process.env.SHOT_DIR || 'shots') + '/';
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message + e.stack));
await page.goto('file://' + process.cwd() + '/dist/ColonyShipHorror.html?seed=9');
await page.waitForTimeout(500);
await page.click('#btnStart');
await page.waitForTimeout(300);
// select Tomas via roster, then right-click O2 room
await page.evaluate(() => { G.roomById.o2.integ = 60; }); await page.click('#cr_7');
const pos = await page.evaluate(() => { const r = G.roomById.o2; return w2s(r.cx, r.cy); });
await page.mouse.click(pos[0], pos[1], { button: 'right' });
await page.waitForTimeout(200);
const menu = await page.evaluate(() => document.getElementById('menu').innerText);
console.log('CONTEXT MENU:\n' + menu);
await page.screenshot({ path: SP + 'ui_menu.png' });
await page.click('#menu button:has-text("REPAIR")');
console.log('Tomas task:', await page.evaluate(() => G.crew[7].task && G.crew[7].task.type));
// door click
const dpos = await page.evaluate(() => { const d = G.doorById.d_qtr_mes; return w2s(d.x, G.roomById.quarters.fy - 25); });
await page.mouse.click(dpos[0], dpos[1]);
await page.waitForTimeout(150);
console.log('DOOR MENU:', (await page.evaluate(() => document.getElementById('menu').innerText)).replace(/\n/g, ' | '));
await page.click('#menu button:has-text("EMERGENCY SEAL")');
console.log('door mode:', await page.evaluate(() => G.doorById.d_qtr_mes.mode));
// keyboard: pause, speed
await page.keyboard.press('Space'); console.log('speed after space', await page.evaluate(() => UI.speed));
await page.keyboard.press('3'); console.log('speed after 3', await page.evaluate(() => UI.speed));
// decision
await page.evaluate(() => offerSalvage()); await page.waitForTimeout(200);
await page.screenshot({ path: SP + 'ui_decision.png' });
console.log('decision visible', await page.evaluate(() => getComputedStyle(document.getElementById('decision')).display), 'speed', await page.evaluate(() => UI.speed));
await page.click('#decBtns button:first-child');
console.log('eva', await page.evaluate(() => JSON.stringify(G.eva && G.eva.ids)));
// room panel + vent confirm
await page.mouse.click(pos[0], pos[1]);
await page.waitForTimeout(200);
await page.screenshot({ path: SP + 'ui_room.png' });
// help
await page.keyboard.press('h'); await page.waitForTimeout(100); await page.screenshot({ path: SP + 'ui_help.png' }); await page.keyboard.press('Escape');
// end screen
await page.evaluate(() => { G.fullLog = []; for (const c of G.crew.slice(0, 4)) killCrew(c, 'test'); endGame('survived', 'The next watch is thawed.'); });
await page.waitForTimeout(200);
await page.screenshot({ path: SP + 'ui_end.png' });
console.log(errs.join('\n') || 'no errors');
await browser.close();
