// Browser smoke test: loads the built single-file game in headless Chromium and
// drives it through real keyboard events and a simulated gamepad.
// Usage: npm run build && npm run smoke
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = 'file://' + path.resolve(here, '../dist/index.html');
const candidates = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failures++; };

const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function open({ render = false, pad = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.addInitScript(({ render, pad }) => {
    try { localStorage.clear(); } catch { /* */ }
    if (!render) window.__ND_NORENDER = true;
    if (pad) {
      // a fake standard-mapping controller we can poke from the test
      const mk = () => ({ id: 'Fake Xbox Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
        axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
      window.__pad = mk();
      navigator.getGamepads = () => [window.__pad, null, null, null];
      window.__btn = (i, v) => { window.__pad.buttons[i] = { pressed: v > 0.5, touched: v > 0, value: v }; };
    }
  }, { render, pad });
  await page.goto(file);
  await page.waitForFunction(() => window.ND && document.getElementById('go').style.visibility === 'visible', null, { timeout: 60000 });
  return { page, errors };
}
const state = (page) => page.evaluate(() => ({
  step: ND.route.step, running: ND.car.running, rpm: ND.car.rpm, gear: ND.car.gear, v: ND.car.fwdSpeed, z: ND.car.z,
  steer: ND.driver.steerDeg, hb: ND.driver.handbrake, clutch: ND.driver.clutchOut, stalls: ND.route.stats.stalls,
}));

// ------------------------------------------------------------------ 1. renders, no errors
{
  const { page, errors } = await open({ render: true });
  await page.waitForTimeout(1500);
  await page.mouse.click(640, 360);
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => ({ calls: ND.renderer.info.render.calls, tris: ND.renderer.info.render.triangles }));
  check('page renders the town with no console errors', errors.length === 0 && info.calls > 5, `${info.calls} draw calls, ${info.tris} tris; errors: ${errors.join(' | ')}`);
  await page.keyboard.press('F1');
  await page.waitForFunction(() => document.getElementById('lab').classList.contains('open'), null, { timeout: 8000 }).catch(() => {});
  const labOpen = await page.evaluate(() => document.getElementById('lab').classList.contains('open'));
  check('F1 opens the lab panel', labOpen);
  await page.close();
}

// ------------------------------------------------------------------ 2. keyboard: start, stall, restart, move off
{
  const { page, errors } = await open();
  await page.evaluate(() => ND.begin());
  await page.keyboard.down('Space'); await page.waitForTimeout(500);
  await page.keyboard.down('KeyI'); await page.waitForTimeout(1300); await page.keyboard.up('KeyI');
  await page.waitForTimeout(400);
  let s = await state(page);
  check('keyboard: engine starts (clutch down + hold I)', s.running && s.rpm > 700, `rpm ${s.rpm.toFixed(0)}`);
  await page.keyboard.press('Digit1'); await page.waitForTimeout(200);
  s = await state(page);
  check('keyboard: first gear selected with the clutch down', s.gear === 1);
  // dump the clutch with no throttle (handbrake still on): stall
  await page.keyboard.up('Space'); await page.waitForTimeout(1500);
  s = await state(page);
  check('keyboard: dumping the clutch stalls it', !s.running && s.stalls === 1, `stalls ${s.stalls}`);
  check('keyboard: no automatic restart', !s.running);
  await page.keyboard.down('Space'); await page.waitForTimeout(600);
  await page.keyboard.down('KeyI'); await page.waitForTimeout(1300); await page.keyboard.up('KeyI');
  await page.waitForTimeout(300);
  s = await state(page);
  check('keyboard: restarts in gear with the clutch floored', s.running && s.gear === 1);
  await page.keyboard.press('ShiftLeft'); await page.waitForTimeout(300);
  s = await state(page);
  check('keyboard: handbrake toggles off', s.hb < 0.1);
  // a cautious keyboard driver: plenty of revs, clutch let up in small taps
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 40; i++) {
    await page.keyboard.up('Space'); await page.waitForTimeout(70);
    await page.keyboard.down('Space'); await page.waitForTimeout(30);
  }
  await page.keyboard.up('Space');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  s = await state(page);
  check('keyboard: revs + clutch let up in taps moves off without stalling', s.running && s.v > 0.8 && s.step >= 3, `v ${s.v.toFixed(2)} z ${s.z.toFixed(1)} step ${s.step} running ${s.running} gear ${s.gear} stalls ${s.stalls} rpm ${s.rpm.toFixed(0)} hb ${s.hb}`);
  // physical steering: hold D
  const before = s.steer;
  await page.keyboard.down('KeyD'); await page.waitForTimeout(400); await page.keyboard.up('KeyD');
  const mid = (await state(page)).steer;
  await page.waitForTimeout(300);
  check('keyboard: physical wheel turns gradually and stays turned', mid - before > 60 && mid - before < 540, `${before.toFixed(0)} → ${mid.toFixed(0)}°`);
  check('keyboard run: no console errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ------------------------------------------------------------------ 3. presets + debug actions
{
  const { page, errors } = await open();
  await page.evaluate(() => ND.begin());
  await page.keyboard.press('F1');
  await page.waitForTimeout(200);
  const btns = await page.$$('#lab .btns button');
  await btns[2].click(); // preset C
  let st = await page.evaluate(() => ({ g: ND.settings.gearbox, m: ND.settings.steeringMode }));
  check('preset C switches to H-pattern + gesture steering', st.g === 'hpattern' && st.m === 'gesture');
  await btns[3].click(); // preset D
  st = await page.evaluate(() => ({ ac: ND.settings.assists.autoClutch, sp: ND.settings.steeringSpeed }));
  check('preset D enables auto clutch and faster steering', st.ac && st.sp > 500);
  await btns[0].click();
  await page.click('text=TELEPORT TO PARKING TEST');
  let s = await state(page);
  check('TELEPORT TO PARKING TEST', s.step === 12 && s.running, `step ${s.step}`);
  await page.click('text=RESET TO BOTTOM OF HILL');
  s = await state(page);
  check('RESET TO BOTTOM OF HILL', s.step === 6 && Math.abs(s.z - 32) < 1);
  await page.click('text=RESET ROUTE');
  s = await state(page);
  check('RESET ROUTE', s.step === 0 && !s.running && s.z < -99);
  await page.click('text=RESET CAR');
  check('debug actions: no console errors', errors.length === 0, errors.join(' | '));
  // H-pattern from the keyboard arrows
  await btns[2].click();
  await page.keyboard.press('F1');
  await page.evaluate(() => { ND.car.running = true; ND.car.ignitionOn = true; ND.car.omegaE = 89; });
  await page.keyboard.down('Space'); await page.waitForTimeout(600);
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(350); await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(450); await page.keyboard.up('ArrowUp');
  s = await state(page);
  check('H-pattern: left then up = first', s.gear === 1, `gear ${s.gear}`);
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(250); await page.keyboard.up('ArrowDown');
  await page.waitForTimeout(400);
  s = await state(page);
  check('H-pattern: pull back = neutral', s.gear === 0, `gear ${s.gear}`);
  await page.keyboard.up('Space');
  await page.waitForTimeout(300);
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(450); await page.keyboard.up('ArrowUp');
  s = await state(page);
  const grinds = await page.evaluate(() => ND.route.stats.grinds);
  check('H-pattern: no clutch → grind, stays in neutral', s.gear === 0 && grinds >= 1, `gear ${s.gear} grinds ${grinds}`);
  await page.close();
}

// ------------------------------------------------------------------ 4. simulated controller
{
  const { page, errors } = await open({ pad: true });
  await page.evaluate(() => ND.begin());
  await page.waitForTimeout(300);
  await page.evaluate(() => { __btn(6, 1); }); // LT clutch floored
  await page.waitForTimeout(200);
  await page.evaluate(() => { __btn(0, 1); }); // hold A to crank
  await page.waitForTimeout(1300);
  await page.evaluate(() => { __btn(0, 0); });
  await page.waitForTimeout(300);
  let s = await state(page);
  check('controller: LT + hold A starts the engine', s.running, `rpm ${s.rpm.toFixed(0)}`);
  await page.evaluate(() => { __btn(3, 1); }); await page.waitForTimeout(150); await page.evaluate(() => { __btn(3, 0); });
  await page.waitForTimeout(100);
  s = await state(page);
  check('controller: Y shifts up into first', s.gear === 1, `gear ${s.gear}`);
  await page.evaluate(() => { __btn(5, 1); }); await page.waitForTimeout(150); await page.evaluate(() => { __btn(5, 0); });
  await page.waitForTimeout(200);
  s = await state(page);
  check('controller: RB releases the handbrake', s.hb < 0.1);
  // analogue clutch release with RT
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    await page.evaluate((t) => { __btn(7, 0.22); __btn(6, Math.max(0, 0.72 - t * 0.5)); }, t);
    await page.waitForTimeout(70);
  }
  await page.evaluate(() => { __btn(6, 0); __btn(7, 0.25); });
  await page.waitForTimeout(800);
  s = await state(page);
  check('controller: LT/RT analogue clutch control pulls away', s.running && s.v > 1, `v ${s.v.toFixed(2)} clutch ${s.clutch.toFixed(2)}`);
  await page.evaluate(() => { window.__pad.axes[0] = 1; });
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__pad.axes[0] = 0; });
  const steer = (await state(page)).steer;
  check('controller: left stick winds the steering wheel', steer > 100, `${steer.toFixed(0)}°`);
  check('controller run: no console errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall smoke checks passed');
process.exit(failures ? 1 : 0);
