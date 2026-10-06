// QA smoke suite — real browser (Chromium via Playwright), real keyboard/mouse/touch input.
// Usage: NODE_PATH=$(npm root -g) node tests/smoke.js [screenshotDir]
// A few checks force state via the window.CW debug handle (marked [forced]) to keep runtime sane.
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, '../dist/ChaosWorldMikeMinigames.html');
const SHOTS = process.argv[2];
const results = [];
const ok = (name, pass, note = '') => { results.push({ name, pass, note }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (note ? '  — ' + note : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup(browser, opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 450, height: 800 } }, opts));
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(FILE);
  await page.evaluate(() => { CW.S().mute = true; });
  return { ctx, page, errors, requests };
}
// logical (450x800 frame) -> page coords
async function pt(page, x, y) {
  const b = await page.locator('#frame').boundingBox();
  return [b.x + x / 450 * b.width, b.y + y / 800 * b.height];
}
const st1 = (p) => p.evaluate(() => CW.M1.state);
const waitFor = (p, fn, arg, timeout = 15000) => p.waitForFunction(fn, arg, { timeout, polling: 16 });

async function throwWhenGreen(page, i, key) {
  await waitFor(page, (i) => { const m = CW.M1, r = m.ropers[i]; return m.canThrow(r) && Math.abs(r.tpos - r.zoneC) < 0.04 && (r.zoneC - r.tpos) * r.tdir > 0; }, i, 20000);
  await page.keyboard.press(key);
}

(async () => {
  const browser = await chromium.launch();
  const t0 = Date.now();
  // ================= DESKTOP =================
  const D = await setup(browser);
  const p = D.page;
  ok('Menu renders both mode cards', await p.locator('#card1').isVisible() && await p.locator('#card2').isVisible());
  if (SHOTS) await p.screenshot({ path: SHOTS + '/qa_menu.png' });

  // ---- Mode 1 entry via real click
  await p.click('#play1');
  ok('Menu → Mode 1 (click PLAY)', (await p.evaluate(() => CW.Game.screen.name)) === 'm1' && await p.locator('.intro').first().isVisible());
  // choose SOLO partner via the intro segmented control, then FIGHT
  await p.locator('#m1partner button[data-v="human"]').click();
  await p.click('#m1go');
  ok('Mode 1 FIGHT starts active state', (await st1(p)) === 'active');

  // ---- Full loop with keyboard: rope leg 1, rope leg 2, pull, success, stun, wake, reset
  const seen = [];
  await p.evaluate(() => { const o = CW.M1.setState.bind(CW.M1); window.__m1log = []; CW.M1.setState = (s) => { window.__m1log.push(s); o(s); }; });
  await throwWhenGreen(p, 0, 'a');
  await waitFor(p, () => CW.M1.ropers[0].rope !== 'flying');
  const r1 = await p.evaluate(() => CW.M1.ropers[0].rope);
  ok('Rope leg 1 (key A in green zone)', r1 === 'locked', 'rope=' + r1);
  await throwWhenGreen(p, 1, 'l');
  await waitFor(p, () => CW.M1.state === 'pull' || CW.M1.ropers[1].rope === 'none', null);
  ok('Rope leg 2 (key L) → PULL phase', (await st1(p)) === 'pull');
  if (SHOTS) await p.screenshot({ path: SHOTS + '/qa_pull.png' });
  // mash A and L alternately like a human (~10/s each)
  for (let i = 0; i < 80 && (await st1(p)) === 'pull'; i++) { await p.keyboard.press(i % 2 ? 'l' : 'a'); await sleep(45); }
  await waitFor(p, () => ['fall', 'stun'].includes(CW.M1.state), null, 4000).catch(() => {});
  ok('Pull success → boss falls', (await p.evaluate(() => window.__m1log.includes('fall'))));
  await waitFor(p, () => CW.M1.state === 'stun', null, 4000);
  ok('Boss STUNNED state', true);
  const hpBefore = await p.evaluate(() => CW.M1.bossHp);
  await p.keyboard.press('1'); await p.keyboard.press('2');
  await sleep(1500);
  const dmgStun = await p.evaluate((b) => b - CW.M1.bossHp, hpBefore);
  ok('Attack window deals boosted damage (keys 1/2 + autos)', dmgStun > 400, 'damage in 1.5s of stun = ' + dmgStun);
  if (SHOTS) await p.screenshot({ path: SHOTS + '/qa_stun.png' });
  await waitFor(p, () => CW.M1.state === 'wake', null, 6000);
  ok('Boss WAKES after stun', true);
  await waitFor(p, () => CW.M1.state === 'active', null, 4000);
  ok('Ropes reset after wake', await p.evaluate(() => CW.M1.ropers.every((r) => r.rope === 'none')));

  // ---- Failure: ropes burn if pull too slow
  await throwWhenGreen(p, 0, 'a'); await waitFor(p, () => CW.M1.ropers[0].rope !== 'flying');
  await throwWhenGreen(p, 1, 'l');
  await waitFor(p, () => CW.M1.state === 'pull', null, 5000).catch(() => {});
  const burnedBefore = await p.evaluate(() => CW.M1.ropesBurned);
  if ((await st1(p)) === 'pull') {
    for (let i = 0; i < 6; i++) { await p.keyboard.press('a'); await sleep(80); } // only one side pulls a little
    await waitFor(p, () => CW.M1.state === 'burn', null, 8000).catch(() => {});
  }
  ok('Ropes BURN when pull too slow', (await p.evaluate(() => CW.M1.ropesBurned)) === burnedBefore + 1 && (await p.evaluate(() => CW.M1.ropers.every((r) => r.rope === 'none'))));
  await waitFor(p, () => CW.M1.state === 'active', null, 4000);

  // ---- Boss attacks damage heroes (natural, wait for it)
  await waitFor(p, () => CW.M1.heroes.some((h) => h.stats.taken > 0), null, 15000).catch(() => {});
  ok('Boss attacks damage heroes', await p.evaluate(() => CW.M1.heroes.reduce((s, h) => s + h.stats.taken, 0) > 0), 'taken=' + await p.evaluate(() => CW.M1.heroes.map((h) => h.stats.taken).join('/')));

  // ---- Restart repeatedly (R key) + via LAB
  for (let i = 0; i < 5; i++) { await p.keyboard.press('r'); await sleep(120); }
  ok('Mode 1 restarts repeatedly (R x5)', (await st1(p)) === 'active' && (await p.evaluate(() => CW.M1.bossHp === CW.M1.bossMax && CW.M1.takedowns === 0)));
  await p.click('#labBtn'); await sleep(100);
  ok('LAB panel opens & pauses', await p.locator('#lab').isVisible() && await p.evaluate(() => CW.Game.paused));
  await p.click('#labRestart'); await sleep(100);
  ok('LAB restart works', !(await p.locator('#lab').isVisible()) && (await st1(p)) === 'active');

  // ---- Win, genuinely, with boss HP x0.5 via LAB? -> keep runtime short: [forced] HP low, then real key damage
  await p.evaluate(() => { CW.M1.bossHp = 30; });
  await p.keyboard.press('1');
  await waitFor(p, () => CW.M1.state === 'win', null, 3000).catch(() => {});
  ok('Mode 1 can be WON [forced low HP, real key hit]', (await st1(p)) === 'win');
  await waitFor(p, () => !document.querySelector('#results').classList.contains('hidden'), null, 5000);
  ok('Mode 1 results screen shows', await p.locator('#results .res-title').isVisible());
  if (SHOTS) await p.screenshot({ path: SHOTS + '/qa_m1win.png' });
  await p.click('#resRetry'); await sleep(150);
  ok('RETRY from results restarts instantly', (await st1(p)) === 'active' && !(await p.locator('#results').isVisible()));

  // ---- Lose: [forced] heroes at 1 HP, then let the real boss attack scheduler kill them
  await p.evaluate(() => { CW.M1.heroes.forEach((h) => (h.hp = 1)); CW.M1.atkCount = 2; CW.M1.atkTimer = 0.1; }); // next attack = AOE
  await waitFor(p, () => CW.M1.state === 'lose', null, 6000).catch(() => {});
  ok('Mode 1 can be LOST (AOE wipes team) [forced 1 HP]', (await st1(p)) === 'lose');
  await waitFor(p, () => !document.querySelector('#results').classList.contains('hidden'), null, 5000);
  await p.click('#resMenu'); await sleep(150);
  ok('Results → MENU returns to menu', await p.locator('#menu').isVisible());

  // ---- Mode 1 BACK button
  await p.click('#play1'); await p.click('#m1go'); await sleep(200);
  await p.click('#m1back'); await sleep(150);
  ok('Mode 1 MENU button returns to menu', await p.locator('#menu').isVisible() && (await p.evaluate(() => CW.Game.screen.name)) === 'menu');

  // ================= MODE 2 =================
  await p.click('#play2');
  ok('Menu → Mode 2 (click PLAY)', (await p.evaluate(() => CW.Game.screen.name)) === 'm2');
  await p.locator('#m2mode button[data-v="auto"]').click();
  await p.click('#m2go');
  await waitFor(p, () => CW.M2.enemies.length > 0, null, 5000);
  ok('Mode 2 enemies spawn', true);
  // strike enemies by real mouse clicks on their positions
  const kills0 = await p.evaluate(() => CW.M2.kills);
  for (let i = 0; i < 70; i++) {
    const e = await p.evaluate(() => { const e = CW.M2.nearestEnemy(); return e && e.y > 30 ? [e.x, e.y - 26] : null; });
    if (e) { const [x, y] = await pt(p, e[0], e[1]); await p.mouse.click(x, y); }
    if (i % 15 === 0) { await p.keyboard.press('1'); await p.keyboard.press('2'); await p.keyboard.press('3'); }
    await sleep(60);
  }
  const k = await p.evaluate(() => CW.M2.kills);
  ok('Player attacks kill enemies (mouse taps + keys 1/2/3)', k > kills0 + 3, 'kills=' + k);
  // keep fighting (real clicks) until RNG produces a natural drop
  for (let i = 0; i < 400; i++) {
    if (await p.evaluate(() => { const s = CW.M2.stats.items; return s.common + s.rare + s.epic > 0 || CW.M2.state !== 'play'; })) break;
    await p.evaluate(() => { if (CW.M2.hunter.dist < 60) CW.M2.hunter.dist = 120; }); // [forced] keep the run alive while we sample RNG
    const e = await p.evaluate(() => { const e = CW.M2.nearestEnemy(); return e && e.y > 30 ? [e.x, e.y - 26] : null; });
    if (e) { const [x, y] = await pt(p, e[0], e[1]); await p.mouse.click(x, y); }
    await sleep(40);
  }
  const items = await p.evaluate(() => { const s = CW.M2.stats.items; return s.common + s.rare + s.epic; });
  ok('Chase items drop from kills (natural RNG)', items > 0, 'items=' + items);
  await waitFor(p, () => CW.M2.cards.length === 0, null, 4000).catch(() => {}); // reveal + flight finished
  await sleep(150);
  ok('Items affect the hunter (damage / status / distance)', await p.evaluate(() => CW.M2.stats.hunterDmg > 0 || CW.M2.hunter.slow > 0 || CW.M2.hunter.stun > 0), 'hunterDmg=' + await p.evaluate(() => CW.M2.stats.hunterDmg));
  const d1 = await p.evaluate(() => CW.M2.hunter.dist); await sleep(1000); const d2 = await p.evaluate(() => CW.M2.hunter.dist);
  ok('Hunter distance changes over time', Math.abs(d1 - d2) > 0.5, d1.toFixed(1) + 'm → ' + d2.toFixed(1) + 'm');
  if (SHOTS) await p.screenshot({ path: SHOTS + '/qa_m2play.png' });

  // ---- Statuses [forced application of each item through the real applyItem path]
  const statusRes = await p.evaluate(() => {
    const M = CW.M2, H = M.hunter, out = {};
    H.dist = 120; H.slow = 0; H.stun = 0;
    M.applyItem('ice'); out.slow = H.slow > 0;
    const s0 = M.closingSpeed(); H.slow = 0; const s1 = M.closingSpeed(); out.slowEffect = s0 < s1 * 0.5;
    M.applyItem('chain'); out.stun = H.stun > 0 && M.closingSpeed() === 0; H.stun = 0;
    const hp0 = H.hp; M.applyItem('barrel'); out.damage = H.hp < hp0;
    const dd = H.dist; M.applyItem('boulder'); out.knockback = H.dist > dd;
    M.applyItem('firemine'); out.burn = H.burn > 0;
    return out;
  });
  ok('Hunter status: SLOW (and slows closing speed)', statusRes.slow && statusRes.slowEffect);
  ok('Hunter status: STUN (zero closing)', statusRes.stun);
  ok('Hunter status: DAMAGE', statusRes.damage);
  ok('Hunter status: KNOCKBACK (+distance)', statusRes.knockback);
  ok('Hunter status: BURN (DoT)', statusRes.burn);

  // ---- Visibility transitions [forced distance, natural transition logic]
  await p.evaluate(() => { CW.M2.hunter.dist = 33; CW.M2.hunter.stun = 0; CW.M2.hunter.slow = 0; });
  await waitFor(p, () => CW.M2.hunter.visible, null, 2000).catch(() => {});
  ok('Hunter becomes VISIBLE under 35m', await p.evaluate(() => CW.M2.hunter.visible));
  await sleep(700);
  if (SHOTS) await p.screenshot({ path: SHOTS + '/qa_m2visible.png' });
  await p.evaluate(() => CW.M2.applyItem('portal'));
  await sleep(200);
  ok('Big knockback hurls Hunter OFF SCREEN again', await p.evaluate(() => !CW.M2.hunter.visible && CW.M2.hunter.dist > 42));
  await sleep(900);

  // ---- Manual tray with real Q key
  await p.click('#labBtn'); await p.locator('#lab .seg[data-path="m2.itemMode"] button').nth(1).click(); await p.click('#labClose');
  await p.evaluate(() => { CW.M2.rollDrop(225, 300, 'rare'); });
  await waitFor(p, () => CW.M2.tray.some((t) => t && t !== 'pending'), null, 3000).catch(() => {});
  const trayHas = await p.evaluate(() => CW.M2.tray.findIndex((t) => t && t !== 'pending'));
  ok('MANUAL mode: item lands in tray', trayHas >= 0);
  if (SHOTS) await p.screenshot({ path: SHOTS + '/qa_m2tray.png' });
  await p.evaluate(() => { const o = CW.M2.applyItem.bind(CW.M2); window.__applied = 0; CW.M2.applyItem = (id) => { window.__applied++; o(id); }; });
  const stored = await p.evaluate((i) => CW.M2.tray[i], trayHas);
  await p.keyboard.press('qwe'[trayHas]);
  const emptied = await p.evaluate((i) => CW.M2.tray[i] === null, trayHas);
  await waitFor(p, () => window.__applied > 0, null, 3000).catch(() => {});
  ok('MANUAL mode: Q/W/E fires stored item', emptied && (await p.evaluate(() => window.__applied > 0)), stored.id + ' fired from slot ' + 'QWE'[trayHas]);
  await p.click('#labBtn'); await p.locator('#lab .seg[data-path="m2.itemMode"] button').nth(0).click(); await p.click('#labClose');

  // ---- Restart repeatedly
  for (let i = 0; i < 5; i++) { await p.keyboard.press('r'); await sleep(150); }
  ok('Mode 2 restarts repeatedly (R x5)', await p.evaluate(() => CW.M2.state === 'play' && CW.M2.kills === 0 && CW.M2.hunter.hp === CW.M2.hunter.max));

  // ---- Win [forced low hunter HP; real item path]
  await p.evaluate(() => { CW.M2.hunter.hp = 50; CW.M2.applyItem('spike'); });
  await sleep(100);
  ok('Mode 2 can be WON (Hunter slain) [forced low HP]', (await p.evaluate(() => CW.M2.state)) === 'slain');
  await waitFor(p, () => !document.querySelector('#results').classList.contains('hidden'), null, 5000);
  if (SHOTS) await p.screenshot({ path: SHOTS + '/qa_m2win.png' });
  await p.click('#resRetry'); await sleep(150);
  // ---- Lose: caught [forced 2m distance, natural closing]
  await p.evaluate(() => { CW.M2.hunter.dist = 2; });
  await waitFor(p, () => CW.M2.state === 'caught', null, 4000).catch(() => {});
  ok('Mode 2 can be LOST (caught at 0m)', (await p.evaluate(() => CW.M2.state)) === 'caught');
  await waitFor(p, () => !document.querySelector('#results').classList.contains('hidden'), null, 5000);
  await p.click('#resRetry'); await sleep(150);
  await p.evaluate(() => { CW.M2.hp = 3; });
  await waitFor(p, () => CW.M2.state === 'dead', null, 15000).catch(() => {});
  ok('Mode 2 can be LOST (squad HP 0)', (await p.evaluate(() => CW.M2.state)) === 'dead');
  await p.click('#resMenu').catch(() => {});
  await p.waitForTimeout(200);
  await p.click('#play2'); await p.click('#m2go'); await sleep(200); await p.click('#m2back'); await sleep(150);
  ok('Mode 2 MENU button returns to menu', await p.locator('#menu').isVisible());

  // ---- Menu keyboard + how-to + reset save
  await p.click('#btnHow'); ok('HOW TO PLAY opens', await p.locator('#howto').isVisible()); await p.click('#howClose');
  await p.click('#btnReset'); ok('RESET SAVE works', await p.evaluate(() => CW.S().m1.partner === 'ai_ok'));

  // ---- Resize / layout
  for (const [w, h] of [[1280, 720], [1920, 1080], [360, 640], [820, 1180]]) {
    await p.setViewportSize({ width: w, height: h }); await sleep(120);
    const b = await p.locator('#frame').boundingBox();
    const centred = Math.abs(b.x + b.width / 2 - w / 2) < 2 && Math.abs(b.y + b.height / 2 - h / 2) < 2;
    const fits = b.width <= w + 1 && b.height <= h + 1 && (Math.abs(b.width - w) < 2 || Math.abs(b.height - h) < 2);
    ok(`Resize ${w}x${h}: 9:16 frame centred & fitted`, centred && fits && Math.abs(b.width / b.height - 0.5625) < 0.01, `${Math.round(b.width)}x${Math.round(b.height)}`);
    if (SHOTS && w === 1280) await p.screenshot({ path: SHOTS + '/qa_desktop.png' });
  }
  const ext = D.requests.filter((u) => !u.startsWith('file:') && !u.startsWith('data:'));
  ok('Zero external network requests (desktop run)', ext.length === 0, ext.length ? ext.join(', ') : D.requests.length + ' request(s), all file:/data:');
  ok('No console/page errors (desktop run)', D.errors.length === 0 && (await p.evaluate(() => CW.Game.errors.length)) === 0, D.errors.join(' | '));

  // ================= MOBILE (touch) =================
  const M = await setup(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const q = M.page;
  await q.tap('#play1');
  await q.tap('#m1partner button[data-v="human"]');
  await q.tap('#m1go');
  ok('[touch] Mode 1 entered via taps', (await st1(q)) === 'active');
  let touchAttempts = 0;
  for (const i of [0, 1]) {
    for (let a = 0; a < 6; a++) {
      touchAttempts++;
      const box = await q.locator('.rbtn').nth(i).boundingBox();
      // lead the marker by ~50ms of tap latency (marker speed 1.55/s)
      await waitFor(q, (i) => { const m = CW.M1, r = m.ropers[i], d = (r.zoneC - r.tpos) * r.tdir; return m.state === 'pull' || (m.canThrow(r) && d > 0.02 && d < 0.09); }, i, 20000);
      if ((await st1(q)) === 'pull') break;
      await q.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await waitFor(q, (i) => CW.M1.ropers[i].rope !== 'flying', i);
      if (await q.evaluate((i) => CW.M1.ropers[i].rope === 'locked' || CW.M1.state === 'pull', i)) break;
    }
  }
  ok('[touch] Both ropes thrown with touch buttons → PULL', (await st1(q)) === 'pull', touchAttempts + ' throw attempt(s)');
  const boxes = [await q.locator('.rbtn').nth(0).boundingBox(), await q.locator('.rbtn').nth(1).boundingBox()];
  for (let i = 0; i < 70 && (await st1(q)) === 'pull'; i++) { const b = boxes[i % 2]; await q.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await sleep(40); }
  ok('[touch] PULL buttons register (both sides counted)', await q.evaluate(() => CW.M1.ropers.every((r) => r.stats.pullTaps > 5)), await q.evaluate(() => CW.M1.ropers.map((r) => r.stats.pullTaps).join('/')));
  await waitFor(q, () => CW.M1.state === 'stun', null, 5000).catch(() => {});
  const ab = await q.locator('.ab[data-a="0"]').boundingBox(); await q.touchscreen.tap(ab.x + 30, ab.y + 30);
  ok('[touch] Attacker ability button fires', await q.evaluate(() => CW.M1.cds[0] > 0));
  const minTarget = await q.evaluate(() => { const f = document.querySelector('#frame').getBoundingClientRect().width / 450; return Math.min(...['.rbtn', '.ab'].map((s) => document.querySelector(s).getBoundingClientRect().height)) ; });
  ok('[touch] Primary touch targets ≥ 44 CSS px on a 390px phone', minTarget >= 44, Math.round(minTarget) + 'px');
  await q.tap('#m1back'); await q.tap('#play2'); await q.tap('#m2go');
  await waitFor(q, () => CW.M2.enemies.some((e) => e.y > 60), null, 6000);
  const kq0 = await q.evaluate(() => CW.M2.stats.dmgTaken + CW.M2.kills);
  let tapsHit = 0;
  for (let i = 0; i < 40; i++) {
    const e = await q.evaluate(() => { const e = CW.M2.nearestEnemy(); return e && e.y > 30 ? [e.x, e.y - 26] : null; });
    if (e) { const [x, y] = await pt(q, e[0], e[1]); await q.touchscreen.tap(x, y); tapsHit++; }
    await sleep(60);
  }
  ok('[touch] Tap-to-strike enemies in Mode 2', await q.evaluate(() => CW.M2.kills > 0), 'kills=' + await q.evaluate(() => CW.M2.kills));
  const sk = await q.locator('.m2-ctrl .ab').nth(0).boundingBox(); await q.touchscreen.tap(sk.x + 30, sk.y + 30);
  ok('[touch] Mode 2 skill button fires', await q.evaluate(() => CW.M2.cds[0] > 0));
  if (SHOTS) await q.screenshot({ path: SHOTS + '/qa_mobile.png' });
  const extM = M.requests.filter((u) => !u.startsWith('file:') && !u.startsWith('data:'));
  ok('Zero external network requests (mobile run)', extM.length === 0);
  ok('No console/page errors (mobile run)', M.errors.length === 0 && (await q.evaluate(() => CW.Game.errors.length)) === 0, M.errors.join(' | '));

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
