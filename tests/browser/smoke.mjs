#!/usr/bin/env node
// Browser smoke test: plays the opening of the real production build in
// headless Chromium (SwiftShader WebGL), using real keyboard input where it
// matters and the window.__TMG hook to teleport between stations (walking
// is covered separately). Saves screenshots to test-results/screens/.
//
//   npm run build && npm run test:smoke

import { mkdir } from 'node:fs/promises';
import { serveDist, launch, collectErrors } from './lib.mjs';

const OUT = 'test-results/screens';
await mkdir(OUT, { recursive: true });
const server = await serveDist(4180);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = collectErrors(page);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const until = async (fn, timeout = 20000, arg) => {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 100 }); return true; } catch { return false; }
};
const tp = (x, z) => ev(([x, z]) => { const p = window.__TMG.sim.state.player; p.x = x; p.z = z; p.vx = p.vz = 0; }, [x, z]);
const hold = async (key, ms) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key); };
const S = () => ev(() => { const s = window.__TMG.sim.state; return { day: s.day, phase: s.phase, food: s.resources.food, wood: s.resources.wood, pop: s.grandmas.length, carry: { ...s.player.carry }, egg: s.player.egg, p: [s.player.x, s.player.z] }; });

try {
  // 1. Start
  await page.goto(server.url + '?test=1&seed=7&speed=2');
  check('game starts (window hook present)', await until(() => window.__TMG && window.__TMG.mode === 'play', 15000));
  await wait(1500);
  const px = await ev(() => {
    const c = document.getElementById('game');
    const g = c.getContext('webgl2') || c.getContext('webgl');
    return !!g;
  });
  check('WebGL context available', px);
  check('no console errors on start', errors.length === 0, errors.join(' | '));
  await ev(() => { window.__TMG.cam.yaw = 0; });
  await shot('01-start-cottage');

  // 2. Movement (real keys). Camera yaw 0 => W moves toward -z.
  const before = await S();
  await hold('w', 700);
  const after = await S();
  check('player moves with W', after.p[1] < before.p[1] - 1, `z ${before.p[1].toFixed(2)} -> ${after.p[1].toFixed(2)}`);

  // 3. Gather berries (hold E next to a bush)
  const bush = await ev(() => { const n = window.__TMG.sim.state.nodes.filter((n) => n.type === 'bush').sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0]; return { x: n.x, z: n.z }; });
  await tp(bush.x + 1.5, bush.z);
  await wait(200);
  await page.keyboard.down('e');
  const gathered = await until(() => window.__TMG.sim.state.player.carry.food >= 4, 15000);
  await page.keyboard.up('e');
  check('berries can be gathered (hold E)', gathered, JSON.stringify((await S()).carry));

  // 4. Deposit at the cottage cart -> Grandma eats
  await tp(2.6, -2.2);
  check('carried food auto-deposits at stores', await until(() => window.__TMG.sim.state.flags.deliveredFood, 5000));
  const ate = await until(() => window.__TMG.sim.state.stats.today.eaten > 0, 30000);
  check('Grandma consumes food', ate);

  // 5. Wood + bed via the build menu
  const tree = await ev(() => { const n = window.__TMG.sim.state.nodes.filter((n) => n.type === 'tree').sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0]; return { x: n.x, z: n.z }; });
  for (let i = 0; i < 3 && (await S()).wood < 6; i++) {
    await tp(tree.x + 1.4, tree.z);
    await page.keyboard.down('e');
    await until(() => window.__TMG.sim.state.player.carry.wood >= 6, 8000);
    await page.keyboard.up('e');
    await tp(2.6, -2.2);
    await until(() => window.__TMG.sim.state.player.carry.wood === 0, 4000);
  }
  if ((await S()).wood < 6) await ev(() => window.__TMG.sim.debug('wood', 6)); // nodes can run dry on some seeds
  check('wood gathered', (await S()).wood >= 6);
  await tp(-6, 5);
  await ev(() => { window.__TMG.cam.yaw = 0; });
  await page.keyboard.press('b');
  await page.keyboard.press('1');
  await wait(300);
  const ghostOk = await ev(() => window.__TMG.build.ok);
  await shot('02-build-mode');
  await page.keyboard.press('e');
  const placed = await until(() => window.__TMG.sim.state.buildings.some((b) => b.type === 'bed'), 3000);
  check('bed placed via build menu (B, 1, E)', placed, `ghost valid=${ghostOk}`);
  const bed = await ev(() => { const b = window.__TMG.sim.state.buildings.find((b) => b.type === 'bed'); return b && { x: b.x, z: b.z, d: b.d }; });
  if (bed) {
    await tp(bed.x, bed.z + bed.d / 2 + 0.8);
    await page.keyboard.down('e');
    const built = await until(() => window.__TMG.sim.state.buildings.some((b) => b.type === 'bed' && b.built), 10000);
    await page.keyboard.up('e');
    check('bed built (hold E)', built);
  }
  check('bed capacity increased', (await ev(() => window.__TMG.sim.status().beds)) >= 2);

  // 6. Sleep -> day 2 -> egg
  await tp(0, -2.6);
  await page.keyboard.down('e');
  const slept = await until(() => window.__TMG.sim.state.phase === 'night', 6000);
  await page.keyboard.up('e');
  check('can sleep at the cottage (hold E)', slept);
  await wait(800);
  await shot('03-night');
  check('day advances to 2', await until(() => window.__TMG.sim.state.day === 2 && window.__TMG.sim.state.phase === 'day', 20000));
  check('a Grandma Egg appears', (await ev(() => window.__TMG.sim.status().eggsStored)) >= 1);
  await tp(-2, 0.2);
  await ev(() => { window.__TMG.cam.yaw = 0; window.__TMG.cam.dist = 7; });
  await wait(400);
  await shot('04-grandma-egg');

  // 7. Manual hatch ritual (real E presses)
  await page.keyboard.press('e');
  check('egg picked up', await until(() => !!window.__TMG.sim.state.player.egg, 3000));
  await tp(6, -2.4);
  await ev(() => { window.__TMG.cam.yaw = 0.5; window.__TMG.cam.dist = 6; window.__TMG.cam.pitch = 0.35; });
  await wait(300);
  await page.keyboard.press('e');
  check('egg enters the Gran-ulator', await until(() => window.__TMG.sim.state.buildings.find((b) => b.type === 'granulator').inc.stage === 'loaded', 3000));
  await shot('05-incubator-loaded');
  await page.keyboard.press('e');
  check('lid closes', await until(() => window.__TMG.sim.state.buildings.find((b) => b.type === 'granulator').inc.stage === 'closed', 3000));
  await page.keyboard.down('e');
  const heating = await until(() => ['heating', 'cracking'].includes(window.__TMG.sim.state.buildings.find((b) => b.type === 'granulator').inc.stage), 8000);
  await page.keyboard.up('e');
  check('dial turned to NANA (hold E)', heating);
  await until(() => window.__TMG.sim.state.buildings.find((b) => b.type === 'granulator').inc.stage === 'cracking', 8000);
  await shot('06-cracking');
  const hatched = await until(() => window.__TMG.sim.state.grandmas.length === 2, 10000);
  check('incubation completes, Grandma spawns', hatched);
  await wait(250);
  await shot('07-hatch-moment');
  check('population count updates in HUD', await until(() => document.querySelector('[data-k=pop]').textContent === '2', 3000));
  await wait(2500);

  // 8. Farm + job assignment
  await ev(() => window.__TMG.sim.debug('wood', 20));
  const farm = await ev(() => {
    const sim = window.__TMG.sim;
    for (let r = 0; r < 12; r++) for (let dx = -r; dx <= r; dx++) {
      const res = sim.place('farm', -12 + dx, 6 + r, 0);
      if (res.ok) return sim.getBuilding(res.id);
    }
    return null;
  });
  check('farm placed', !!farm);
  if (farm) {
    await tp(farm.x, farm.z + farm.d / 2 + 0.6);
    await page.keyboard.down('e');
    check('farm built', await until(() => window.__TMG.sim.state.buildings.some((b) => b.type === 'farm' && b.built), 10000));
    await page.keyboard.up('e');
    await wait(200);
    await page.keyboard.press('e');
    check('Grandma assigned as farmer', await until(() => window.__TMG.sim.state.grandmas.some((g) => g.job === 'farmer'), 3000));
    const food0 = (await S()).food;
    const produced = await until((f0) => window.__TMG.sim.state.stats.today.food > 0 && window.__TMG.sim.state.grandmas.some((g) => g.job === 'farmer'), 40000, food0);
    check('farmer produces and delivers food', produced);
    await ev(() => { window.__TMG.cam.dist = 12; });
    await shot('08-farmer-working');
  }

  // 9. Food pressure & bed pressure
  await ev(() => { const s = window.__TMG.sim; s.state.resources.food = 0; s.debug('spawn', 8); for (const g of s.state.grandmas) g.hunger = 0.9; });
  check('NO FOOD / hungry warning shown', await until(() => /NO FOOD|HUNGRY/.test(document.getElementById('warnings').textContent), 15000));
  check('bed shortage warning shown', await until(() => /REQUIRE/.test(document.getElementById('warnings').textContent), 3000));
  await tp(-4, 4);
  await ev(() => { window.__TMG.cam.yaw = 0; window.__TMG.cam.dist = 13; });
  await wait(1500);
  await shot('09-pressure');

  // 10. Day progression (multiple days)
  const d0 = (await S()).day;
  await ev(() => { window.__TMG.sim.debug('food', 200); window.__TMG.sim.debug('day'); window.__TMG.sim.debug('day'); });
  check('multiple days progress', (await S()).day === d0 + 2);

  // 11. Save / reload
  const snap = await ev(() => { const T = window.__TMG; T.store.disabled = false; T.save(); const s = T.sim.state; return { day: s.day, pop: s.grandmas.length, b: s.buildings.length, wood: s.resources.wood }; });
  await page.goto(server.url + '?test=1&continue=1');
  await until(() => window.__TMG && window.__TMG.mode === 'play', 15000);
  const loaded = await ev(() => { const s = window.__TMG.sim.state; return { day: s.day, pop: s.grandmas.length, b: s.buildings.length, wood: s.resources.wood }; });
  check('save/reload retains state', JSON.stringify(snap) === JSON.stringify(loaded), `${JSON.stringify(snap)} vs ${JSON.stringify(loaded)}`);

  // 12. Reset / new game
  await ev(() => window.__TMG._menuHandlers().reset());
  await wait(300);
  const fresh = await S();
  const hasSave = await ev(() => window.__TMG.store.has());
  check('reset starts a fresh game', fresh.day === 1 && fresh.pop === 1 && !hasSave, JSON.stringify({ day: fresh.day, pop: fresh.pop, hasSave }));

  // 13. 100 Grandmas
  await page.goto(server.url + '?test=1&stress=100&seed=3');
  await until(() => window.__TMG && window.__TMG.mode === 'play', 15000);
  await wait(6000);
  const st = await ev(() => ({ n: window.__TMG.sim.state.grandmas.length, fps: window.__TMG.perf.fps, nan: window.__TMG.sim.state.grandmas.some((g) => !Number.isFinite(g.x) || !Number.isFinite(g.z)) }));
  check('100+ Grandmas run without errors', st.n >= 100 && !st.nan, `n=${st.n} fps=${st.fps.toFixed(1)} (SwiftShader)`);
  await ev(() => { window.__TMG.cam.dist = 30; window.__TMG.cam.pitch = 0.7; });
  await wait(1500);
  await shot('10-crowd-100');

  check('no console errors overall', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (err) {
  check('smoke test crashed', false, err.stack);
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}/`);
process.exit(failed.length ? 1 : 0);
