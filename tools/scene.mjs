// Visual state checks: node tools/scene.mjs <name> "<setup js>" camX camY zoom [advanceSec]
import { mkdirSync } from 'node:fs'; mkdirSync(process.env.SHOT_DIR || 'shots', { recursive: true });
const { chromium } = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));
const [name, setup, cx, cy, z, adv = '3'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('file://' + process.cwd() + '/dist/ColonyShipHorror.html?autostart=1&seed=3');
await page.waitForTimeout(600);
await page.evaluate(({ setup, cx, cy, z, adv }) => { UI.autoPauseOn = false; eval(setup); G.fastForward(+adv, 0.05); R.cam.tx = R.cam.x = +cx; R.cam.ty = R.cam.y = +cy; R.cam.tz = R.cam.z = +z; }, { setup, cx, cy, z, adv });
await page.waitForTimeout(700);
await page.screenshot({ path: `${process.env.SHOT_DIR || 'shots'}/${name}.png` });
console.log(errs.join('\n') || 'ok');
await browser.close();
