// Browser smoke test for DRIVE WITH DAVE: loads the built single file (file://)
// in headless Chromium and plays it through real clicks and key presses.
// Usage: npm run build && npm run smoke
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = 'file://' + path.resolve(here, '../dist/index.html');
const executablePath = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean).find((p) => existsSync(p));
let failures = 0, passes = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (ok) passes++; else failures++; };
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
      window.__pad = { id: 'Fake (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
      navigator.getGamepads = () => [window.__pad, null, null, null];
      window.__btn = (i, v) => { window.__pad.buttons[i] = { pressed: v > 0.5, touched: v > 0, value: v }; };
    }
  }, { render, pad });
  await page.goto(file);
  await page.waitForFunction(() => window.ND && document.getElementById('menu').style.visibility === 'visible', null, { timeout: 60000 });
  return { page, errors };
}
const S = (page) => page.evaluate(() => ({
  step: ND.route.step, mode: ND.dave.mode, hold: ND.dave.hold, x: ND.car.x, z: ND.car.z, v: ND.car.speed, stress: ND.dave.stress,
  running: ND.car.running, heard: document.getElementById('heardCmd').textContent, said: ND.dave.lastLine?.text || '', ended: ND.ended,
  profile: ND.cfg.profile, commands: ND.dave.tel.commands,
}));
const until = async (page, fn, ms, arg) => { try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch { return false; } };

// ---------------------------------------------------------------- 1. title, renders, choose Dave
{
  const { page, errors } = await open({ render: true });
  const cards = await page.$$('.daveCard');
  check('title screen shows the Dave profiles', cards.length === 4, `${cards.length} cards`);
  await cards[2].click();
  check('choosing a Dave sets the profile', (await page.evaluate(() => ND.cfg.profile)) === 'cocky');
  await page.click('#startBtn');
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => ({ calls: ND.renderer.info.render.calls, tris: ND.renderer.info.render.triangles, seat: ND.view.seat }));
  check('starts in the passenger seat and renders', info.seat === 'passenger' && info.calls > 5, `${info.calls} draw calls, ${info.tris} triangles`);
  const padVisible = await page.isVisible('#pad button[data-cmd="LEFT"]');
  check('command buttons visible in the car', padVisible);
  check('rendered run: no console errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ---------------------------------------------------------------- 2. buttons + keys drive Dave
{
  const { page, errors } = await open();
  await page.click('#startBtn');
  const ready = await until(page, () => ND.dave.mode === 'drive' && ND.car.running, 8000);
  check('Dave starts the engine himself', ready);
  await page.waitForTimeout(800);
  let s = await S(page);
  check('…and waits to be told', s.v < 0.1 && s.hold);
  await page.click('#pad button[data-cmd="GO"]');
  await page.waitForTimeout(300);
  s = await S(page);
  check('pressing GO shows DAVE HEARD: GO', s.heard === 'GO', s.heard);
  const moved = await until(page, () => ND.car.speed > 2, 8000);
  check('Dave moves the car after GO (through the drivetrain)', moved);
  await page.keyboard.press('KeyA');
  await page.waitForTimeout(200);
  s = await S(page);
  check('keyboard A → LEFT (a command, not steering)', s.heard === 'LEFT', s.heard);
  const turned = await until(page, () => ND.car.x > 12 && Math.abs(ND.car.z) < 6, 45000);
  s = await S(page);
  check('Dave stops at the junction and turns left', turned, `x ${s.x.toFixed(1)} z ${s.z.toFixed(1)} step ${s.step}`);
  check('route objectives advance', s.step >= 5, `step ${s.step}`);
  await page.keyboard.press('KeyQ');
  const stopped = await until(page, () => ND.car.speed < 0.1, 12000);
  check('Q → STOP: Dave brings it to a stop', stopped);
  const st0 = (await S(page)).stress;
  for (let i = 0; i < 4; i++) { await page.keyboard.press('KeyW'); await page.waitForTimeout(150); }
  s = await S(page);
  check('shouting GO repeatedly raises Dave’s stress', s.stress > st0 + 0.2, `${st0.toFixed(2)} → ${s.stress.toFixed(2)}`);
  check('repeated command shown as ×n', /×/.test(s.heard), s.heard);
  const bar = await page.evaluate(() => document.getElementById('stressBar').style.width);
  check('stress indicator updates', parseInt(bar, 10) > 10, bar);
  check('Dave answers in subtitles', (await page.evaluate(() => document.getElementById('subtitleText').textContent.length)) > 0);
  check('keys/buttons run: no console errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ---------------------------------------------------------------- 3. presets, teleport, finish, results, restart, direct
{
  const { page, errors } = await open();
  await page.click('#startBtn');
  await until(page, () => ND.dave.mode === 'drive', 8000);
  await page.keyboard.press('F1');
  await until(page, () => document.getElementById('lab').classList.contains('open'), 5000);
  check('F1 opens the lab', true);
  await page.click('#daveLab .btns button:nth-child(2)'); // NERVOUS
  let p = await page.evaluate(() => ({ prof: ND.cfg.profile, dave: ND.dave.profileKey, conf: ND.dave.traits.confidence }));
  check('lab preset NERVOUS applies to Dave', p.prof === 'nervous' && p.dave === 'nervous' && p.conf < 30, JSON.stringify(p));
  await page.click('#daveLab .btns button:nth-child(4)'); // COMPETENT
  p = await page.evaluate(() => ND.dave.profileKey);
  check('lab preset COMPETENT applies', p === 'oldhand');
  await page.click('text=TELEPORT TO PARKING TEST');
  await page.keyboard.press('F1');
  let s = await S(page);
  check('teleport to the parking test', s.step === 12, `step ${s.step}`);
  await page.keyboard.press('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.press('KeyP');
  const parked = await until(page, () => ND.dave.park && ND.dave.park.phase === 'done', 70000);
  s = await S(page);
  check('PARK: Dave parallel parks by himself', parked, `${s.mode} step ${s.step} x ${s.x.toFixed(1)}`);
  await page.keyboard.press('KeyA');
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyW');
  const arrived = await until(page, () => !!ND.ended, 90000);
  s = await S(page);
  check('LEFT + GO: Dave pulls out, takes Nan’s drive, parks up → result screen', arrived && s.ended === 'arrived', `ended ${s.ended} step ${s.step} mode ${s.mode}`);
  const res = await page.evaluate(() => ({ shown: getComputedStyle(document.getElementById('arrived')).display, verdict: document.getElementById('verdict').textContent, rows: document.querySelectorAll('#stats tr').length }));
  check('result screen with Dave’s verdict and stats', res.shown === 'flex' && /VERDICT/.test(res.verdict) && res.rows >= 10, JSON.stringify(res));
  const runs = await page.evaluate(() => JSON.parse(localStorage.getItem('drive-with-dave-telemetry-v1') || '[]').length);
  check('run saved to local telemetry', runs === 1);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  s = await S(page);
  check('Enter restarts the drive', s.step === 0 && !s.ended);
  await page.keyboard.press('Escape');
  await page.click('#resultsBtn');
  const rows = await page.evaluate(() => document.querySelectorAll('#results table tr').length);
  check('TEST RESULTS page lists runs', rows >= 2, `${rows} rows`);
  await page.click('#resultsClose');
  // DIRECT mode: the original driving controls still work
  await page.evaluate(() => ND.setDaveCfg({ ...ND.cfg, controlMode: 'direct' }, 'controlMode'));
  await page.click('#startBtn');
  await page.waitForTimeout(400);
  await page.keyboard.down('Space'); await page.waitForTimeout(500);
  await page.keyboard.down('KeyI'); await page.waitForTimeout(1300); await page.keyboard.up('KeyI');
  await page.waitForTimeout(400);
  s = await S(page);
  check('DIRECT debug mode: player starts the engine with clutch + I', s.running && (await page.evaluate(() => ND.view.seat)) === 'driver');
  await page.keyboard.up('Space');
  check('presets/finish/direct: no console errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ---------------------------------------------------------------- 4. controller commands + voice fallback
{
  const { page, errors } = await open({ pad: true });
  await until(page, () => (window.__padPolls || 0) > 30, 15000); // let the frame loop get going
  await page.evaluate(() => { __btn(0, 1); });
  await page.waitForTimeout(200);
  await page.evaluate(() => { __btn(0, 0); });
  const began = await until(page, () => document.getElementById('title').style.display === 'none', 3000);
  check('controller A starts the drive', began);
  await until(page, () => ND.dave.mode === 'drive', 8000);
  await page.evaluate(() => { __btn(0, 1); }); await page.waitForTimeout(150); await page.evaluate(() => { __btn(0, 0); });
  await page.waitForTimeout(200);
  let s = await S(page);
  check('controller A → GO', s.heard === 'GO', s.heard);
  await page.evaluate(() => { __btn(14, 1); }); await page.waitForTimeout(150); await page.evaluate(() => { __btn(14, 0); });
  await page.waitForTimeout(200);
  s = await S(page);
  check('controller D-pad left → LEFT', s.heard === 'LEFT', s.heard);
  // voice: simulate what the recogniser delivers (the parser + "What?" path)
  const v = await page.evaluate(() => {
    const out = [];
    const before = ND.dave.tel.commands;
    ND.issue(ND.CMD.SLOWER, { source: 'voice', transcript: 'dave slow down' });
    out.push(document.getElementById('heardTranscript').textContent);
    ND.dave.command(null, { source: 'voice', transcript: 'blah', lowConfidence: true });
    out.push(ND.dave.lastLine?.key);
    out.push(ND.dave.tel.commands - before);
    out.push(ND.parsePhrase('take a left').commands[0]);
    return out;
  });
  check('voice: transcript shown with the heard command', /slow down/.test(v[0]), v[0]);
  check('voice: low confidence → Dave says "What?" instead of guessing', v[1] === 'what', String(v[1]));
  check('voice phrase mapping in the page', v[3] === 'LEFT');
  check('controller run: no console errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
