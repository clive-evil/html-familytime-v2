// QA smoke suite — headless Chromium (Playwright) with real mouse / keyboard / touch input.
// NODE_PATH=$(npm root -g) node tests/smoke.js [screenshotDir]
// Checks marked [forced] set game state via window.CW to keep runtime short.
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, '../dist/ChaosWorldMikeMinigames.html');
const SHOTS = process.argv[2];
const results = [];
const ok = (name, pass, note = '') => { results.push({ name, pass }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (note ? '  — ' + note : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = (p, fn, arg, timeout = 15000) => p.waitForFunction(fn, arg, { timeout, polling: 16 });

async function setup(browser, opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 430, height: 932 } }, opts));
  const page = await ctx.newPage(); const errors = [], requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(FILE); await waitFor(page, () => window.__cwReady);
  await page.evaluate(() => { CW.S().mute = true; });
  return { ctx, page, errors, requests };
}
// world point -> client coords (inverse of stage.toStage + cam.toWorld)
const worldToClient = (p, wx, wy) => p.evaluate(([wx, wy]) => { const st = CW.E.S, [sx, sy] = st.b.cam.toScreen(wx, wy), r = st.stageEl.getBoundingClientRect(); return [r.left + sx * st.scale, r.top + (sy + st.xh) * st.scale]; }, [wx, wy]);
const st1 = (p) => p.evaluate(() => CW.M1.state);
const st2 = (p) => p.evaluate(() => CW.M2.state);
async function throwWhenGreen(p, i, key) {
  for (let a = 0; a < 6; a++) {
    await waitFor(p, (i) => { const m = CW.M1, r = m.ropers[i], d = (r.zoneC - r.tpos) * r.tdir; return m.state === 'pull' || (m.canThrow(r) && d > 0.0 && d < 0.06); }, i, 20000);
    if ((await st1(p)) === 'pull') return;
    await p.keyboard.press(key);
    await waitFor(p, (i) => CW.M1.ropers[i].rope !== 'flying', i);
    if (await p.evaluate((i) => CW.M1.ropers[i].rope === 'locked' || CW.M1.state === 'pull', i)) return;
  }
}

(async () => {
  const browser = await chromium.launch(); const t0 = Date.now();
  const D = await setup(browser); const p = D.page;
  ok('Battle Lab engine booted + mod layer attached', await p.evaluate(() => !!(window.__BL && window.__stage && CW.Game.screen && CW.Game.screen.name === 'menu')));
  ok('Menu shows both mode cards', await p.locator('.cw-mode.m1').isVisible() && await p.locator('.cw-mode.m2').isVisible());
  ok('Battle Lab title/lab UI hidden', !(await p.locator('.lab-root').isVisible()));

  // ===== MODE 1 =====
  await p.locator('.cw-mode.m1 .md-play').click();
  ok('Menu → Mode 1 (click PLAY)', (await p.evaluate(() => CW.Game.screen.name)) === 'm1' && await p.locator('.cw-intro').isVisible());
  ok('Mode 1 uses Battle Lab fighters (giant boss + 4 heroes)', await p.evaluate(() => CW.E.B.heroes.length === 4 && CW.E.B.enemies.includes(CW.M1.boss) && CW.M1.boss.baseScale > 1.5));
  await p.locator('#m1partner button[data-v="human"]').click();
  await p.locator('.cw-intro .cw-go').click();
  ok('FIGHT → active state', (await st1(p)) === 'active');
  await p.evaluate(() => { const o = CW.M1.setState.bind(CW.M1); window.__log = []; CW.M1.setState = (s) => { window.__log.push(s); o(s); }; });
  await throwWhenGreen(p, 0, 'a');
  ok('Rope leg 1 (key A in green)', await p.evaluate(() => CW.M1.ropers[0].rope === 'locked'));
  await throwWhenGreen(p, 1, 'l');
  await waitFor(p, () => CW.M1.state === 'pull', null, 4000).catch(() => {});
  ok('Rope leg 2 (key L) → PULL phase', (await st1(p)) === 'pull');
  if (SHOTS) await p.screenshot({ path: SHOTS + '/qa_pull.png' });
  for (let i = 0; i < 90 && (await st1(p)) === 'pull'; i++) { await p.keyboard.press(i % 2 ? 'l' : 'a'); await sleep(40); }
  await waitFor(p, () => ['fall', 'stun'].includes(CW.M1.state), null, 4000).catch(() => {});
  ok('Pull success → takedown (boss downed)', await p.evaluate(() => window.__log.includes('fall') && CW.M1.boss.downed));
  await waitFor(p, () => CW.M1.state === 'stun', null, 4000).catch(() => {});
  ok('Boss STUNNED', (await st1(p)) === 'stun');
  const hp0 = await p.evaluate(() => CW.M1.bossHp);
  await p.keyboard.press('1'); await p.keyboard.press('2'); await sleep(1600);
  const dmg = await p.evaluate((h) => h - CW.M1.bossHp, hp0);
  ok('Stun window: boosted damage (keys 1/2 + autos)', dmg > 400, 'damage in 1.6s = ' + dmg);
  if (SHOTS) await p.screenshot({ path: SHOTS + '/qa_stun.png' });
  await waitFor(p, () => CW.M1.state === 'wake', null, 6000).catch(() => {});
  ok('Boss WAKES', (await st1(p)) === 'wake');
  await waitFor(p, () => CW.M1.state === 'active', null, 4000).catch(() => {});
  ok('Ropes reset after wake (burnt off)', await p.evaluate(() => CW.M1.ropers.every((r) => r.rope === 'none') && !CW.M1.boss.downed));
  // failure path
  await throwWhenGreen(p, 0, 'a'); await throwWhenGreen(p, 1, 'l');
  await waitFor(p, () => CW.M1.state === 'pull', null, 5000).catch(() => {});
  const burned0 = await p.evaluate(() => CW.M1.ropesBurned);
  if ((await st1(p)) === 'pull') { for (let i = 0; i < 5; i++) { await p.keyboard.press('a'); await sleep(90); } await waitFor(p, () => CW.M1.state === 'burn', null, 8000).catch(() => {}); }
  ok('Ropes BURN if the pull is too slow', (await p.evaluate(() => CW.M1.ropesBurned)) === burned0 + 1);
  await waitFor(p, () => CW.M1.state === 'active', null, 4000).catch(() => {});
  await waitFor(p, () => CW.M1.heroes.some((h) => h.st.taken > 0), null, 15000).catch(() => {});
  ok('Boss attacks damage heroes', await p.evaluate(() => CW.M1.heroes.some((h) => h.st.taken > 0)), await p.evaluate(() => CW.M1.heroes.map((h) => h.st.taken).join('/')));
  for (let i = 0; i < 5; i++) { await p.keyboard.press('r'); await sleep(120); }
  ok('Mode 1 restarts repeatedly (R ×5)', await p.evaluate(() => CW.M1.state === 'active' && CW.M1.bossHp === CW.M1.bossMax && CW.M1.takedowns === 0 && CW.E.B.heroes.length === 4));
  await p.locator('.cw-labbtn').click(); await sleep(100);
  ok('LAB opens & pauses the engine', await p.locator('.cw-lab-ov').isVisible() && await p.evaluate(() => CW.E.S.paused));
  await p.locator('.cw-lab-ov .cw-lr').click(); await sleep(150);
  ok('LAB restart', !(await p.locator('.cw-lab-ov').isVisible()) && (await st1(p)) === 'active' && !(await p.evaluate(() => CW.E.S.paused)));
  await p.evaluate(() => { CW.M1.bossHp = 30; }); await p.keyboard.press('1');
  await waitFor(p, () => CW.M1.state === 'win', null, 4000).catch(() => {});
  ok('Mode 1 WIN [forced low HP, real key hit]', (await st1(p)) === 'win');
  await waitFor(p, () => !!document.querySelector('#cw-results'), null, 8000).catch(() => {});
  ok('Mode 1 results screen', await p.locator('#cw-results .cw-rtitle').isVisible());
  if (SHOTS) await p.screenshot({ path: SHOTS + '/qa_m1win.png' });
  await p.locator('#cw-results .cw-rr').click(); await sleep(200);
  ok('RETRY restarts instantly', (await st1(p)) === 'active' && !(await p.locator('#cw-results').count()));
  await p.evaluate(() => { CW.M1.heroes.forEach((h) => (h.hp = 1)); CW.M1.atkCount = 2; CW.M1.atkTimer = 0.05; });
  await waitFor(p, () => CW.M1.state === 'lose', null, 6000).catch(() => {});
  ok('Mode 1 LOSE (stomp wipes team) [forced 1 HP]', (await st1(p)) === 'lose');
  await waitFor(p, () => !!document.querySelector('#cw-results'), null, 8000).catch(() => {});
  await p.locator('#cw-results .cw-rm').click(); await sleep(200);
  ok('Results → MENU', await p.locator('.cw-mode.m1').isVisible());
  await p.locator('.cw-mode.m1 .md-play').click(); await p.locator('.cw-intro .cw-go').click(); await p.locator('.cw-back').click(); await sleep(150);
  ok('Mode 1 MENU button → menu', (await p.evaluate(() => CW.Game.screen.name)) === 'menu');

  // ===== MODE 2 =====
  await p.locator('.cw-mode.m2 .md-play').click();
  ok('Menu → Mode 2', (await p.evaluate(() => CW.Game.screen.name)) === 'm2');
  ok('Mode 2 reuses Battle Lab HUD (header + controls + skills)', await p.evaluate(() => { const h = CW.E.S.hud; return !h.controls.classList.contains('hidden') && h.skills.length === 3 && h.dname.textContent === 'HELL CHASE'; }));
  await p.locator('#m2mode button[data-v="auto"]').click(); await p.locator('.cw-intro .cw-go').click();
  await waitFor(p, () => CW.M2.foes.some((f) => f.alive && f.x < 1000), null, 8000);
  ok('Enemies spawn and advance', true);
  const k0 = await p.evaluate(() => CW.M2.kills);
  for (let i = 0; i < 400; i++) {
    if (await p.evaluate(() => { const s = CW.M2.stats.items; return s.common + s.rare + s.epic > 0 || CW.M2.state !== 'play'; })) break;
    await p.evaluate(() => { if (CW.M2.hunter.dist < 60) CW.M2.hunter.dist = 120; }); // [forced] keep run alive while sampling RNG
    const e = await p.evaluate(() => { const e = CW.M2.nearest(); return e ? [e.x, e.cy] : null; });
    if (e) { const [x, y] = await worldToClient(p, e[0], e[1]); await p.mouse.click(x, y); }
    if (i % 12 === 0) { await p.keyboard.press('1'); await p.keyboard.press('2'); await p.keyboard.press('3'); }
    await sleep(40);
  }
  ok('Player attacks kill enemies (mouse taps + keys)', (await p.evaluate(() => CW.M2.kills)) > k0 + 2, 'kills=' + await p.evaluate(() => CW.M2.kills));
  ok('Chase items drop (natural RNG)', await p.evaluate(() => { const s = CW.M2.stats.items; return s.common + s.rare + s.epic > 0; }));
  await waitFor(p, () => CW.M2.cards.length === 0, null, 4000).catch(() => {}); await sleep(150);
  ok('Items affect the Hunter', await p.evaluate(() => CW.M2.stats.hunterDmg > 0 || CW.M2.hunter.slow > 0 || CW.M2.hunter.stun > 0 || CW.M2.hunter.burn > 0));
  const d1 = await p.evaluate(() => CW.M2.hunter.dist); await sleep(900); const d2 = await p.evaluate(() => CW.M2.hunter.dist);
  ok('Hunter distance changes over time', Math.abs(d1 - d2) > 0.5, d1.toFixed(1) + 'm → ' + d2.toFixed(1) + 'm');
  if (SHOTS) await p.screenshot({ path: SHOTS + '/qa_m2play.png' });
  const sr = await p.evaluate(() => {
    const M = CW.M2, H = M.hunter, o = {}; H.dist = 120; H.slow = 0; H.stun = 0;
    M.applyItem('ice'); o.slow = H.slow > 0; const s0 = M.closingSpeed(); H.slow = 0; o.slowEffect = s0 < M.closingSpeed() * 0.5;
    M.applyItem('chain'); o.stun = H.stun > 0 && M.closingSpeed() === 0; H.stun = 0;
    const hp0 = H.hp; M.applyItem('barrel'); o.damage = H.hp < hp0;
    const dd = H.dist; M.applyItem('boulder'); o.knock = H.dist > dd; M.applyItem('firemine'); o.burn = H.burn > 0; return o;
  });
  ok('Hunter SLOW (and slower closing)', sr.slow && sr.slowEffect); ok('Hunter STUN (zero closing)', sr.stun); ok('Hunter DAMAGE', sr.damage); ok('Hunter KNOCKBACK', sr.knock); ok('Hunter BURN', sr.burn);
  await p.evaluate(() => { const H = CW.M2.hunter; H.dist = 33; H.stun = 0; H.slow = 0; });
  await waitFor(p, () => CW.M2.hunter.visible, null, 2000).catch(() => {});
  ok('Hunter becomes VISIBLE under 35m', await p.evaluate(() => CW.M2.hunter.visible));
  await sleep(800); if (SHOTS) await p.screenshot({ path: SHOTS + '/qa_m2visible.png' });
  await p.evaluate(() => CW.M2.applyItem('portal')); await sleep(200);
  ok('Big knockback hurls him OFF SCREEN', await p.evaluate(() => !CW.M2.hunter.visible && CW.M2.hunter.dist > 42));
  await p.locator('.cw-labbtn').click(); await p.locator('.cw-lab-ov .cw-seg[data-path="m2.itemMode"] button').nth(1).click(); await p.locator('.cw-lab-ov .cw-lc').click();
  await p.evaluate(() => CW.M2.rollDrop(700, 700, 'rare'));
  await waitFor(p, () => CW.M2.tray.some((t) => t && t !== 'pending'), null, 3000).catch(() => {});
  const slot = await p.evaluate(() => CW.M2.tray.findIndex((t) => t && t !== 'pending'));
  ok('MANUAL: item lands in tray', slot >= 0);
  if (SHOTS) await p.screenshot({ path: SHOTS + '/qa_m2tray.png' });
  await p.evaluate(() => { const o = CW.M2.applyItem.bind(CW.M2); window.__ap = 0; CW.M2.applyItem = (id) => { window.__ap++; o(id); }; });
  await p.keyboard.press('qwe'[slot]); const emptied = await p.evaluate((i) => CW.M2.tray[i] === null, slot);
  await waitFor(p, () => window.__ap > 0, null, 3000).catch(() => {});
  ok('MANUAL: Q/W/E fires stored item', emptied && (await p.evaluate(() => window.__ap > 0)));
  await p.locator('.cw-labbtn').click(); await p.locator('.cw-lab-ov .cw-seg[data-path="m2.itemMode"] button').nth(0).click(); await p.locator('.cw-lab-ov .cw-lc').click();
  for (let i = 0; i < 5; i++) { await p.keyboard.press('r'); await sleep(150); }
  ok('Mode 2 restarts repeatedly (R ×5)', await p.evaluate(() => CW.M2.state === 'play' && CW.M2.kills === 0 && CW.M2.hunter.hp === CW.M2.hunter.max && CW.E.B.heroes.length === 1));
  await p.evaluate(() => { CW.M2.hunter.hp = 50; CW.M2.applyItem('spike'); }); await sleep(100);
  ok('Mode 2 WIN (Hunter slain) [forced low HP]', (await st2(p)) === 'slain');
  await waitFor(p, () => !!document.querySelector('#cw-results'), null, 8000).catch(() => {});
  if (SHOTS) await p.screenshot({ path: SHOTS + '/qa_m2win.png' });
  await p.locator('#cw-results .cw-rr').click(); await sleep(200);
  await p.evaluate(() => { CW.M2.hunter.dist = 2; });
  await waitFor(p, () => CW.M2.state === 'caught', null, 4000).catch(() => {});
  ok('Mode 2 LOSE (caught at 0m)', (await st2(p)) === 'caught');
  await waitFor(p, () => !!document.querySelector('#cw-results'), null, 8000).catch(() => {});
  await p.locator('#cw-results .cw-rr').click(); await sleep(200);
  await p.evaluate(() => { CW.M2.scrub.hp = 2; });
  await waitFor(p, () => CW.M2.state === 'dead', null, 20000).catch(() => {});
  ok('Mode 2 LOSE (Scrub HP 0)', (await st2(p)) === 'dead');
  await waitFor(p, () => !!document.querySelector('#cw-results'), null, 8000).catch(() => {});
  await p.locator('#cw-results .cw-rm').click(); await sleep(200);
  await p.locator('.cw-mode.m2 .md-play').click(); await p.locator('.cw-intro .cw-go').click(); await sleep(200); await p.locator('.cw-back').click(); await sleep(150);
  ok('Mode 2 MENU button → menu', (await p.evaluate(() => CW.Game.screen.name)) === 'menu');
  await p.locator('.cw-how').click(); ok('HOW TO PLAY opens', await p.locator('.cw-how-ov').isVisible()); await p.locator('.cw-how-ov .cw-close').click();
  await p.evaluate(() => { CW.S().m1.partner = 'human'; }); await p.locator('.cw-reset').click();
  ok('RESET SAVE restores defaults', await p.evaluate(() => CW.S().m1.partner === 'ai_ok'));
  await p.evaluate(() => { CW.S().mute = true; });
  for (const [w, h] of [[1280, 720], [1920, 1080], [360, 640], [820, 1180]]) {
    await p.setViewportSize({ width: w, height: h }); await sleep(200);
    const b = await p.locator('.stage').boundingBox();
    const centred = Math.abs(b.x + b.width / 2 - w / 2) < 3 && Math.abs(b.y + b.height / 2 - h / 2) < 3, fits = b.width <= w + 1 && b.height <= h + 1;
    ok(`Resize ${w}x${h}: portrait stage centred & fitted`, centred && fits && b.height > b.width, `${Math.round(b.width)}x${Math.round(b.height)}`);
    if (SHOTS && w === 1280) await p.screenshot({ path: SHOTS + '/qa_desktop.png' });
  }
  const ext = D.requests.filter((u) => !u.startsWith('file:') && !u.startsWith('data:'));
  ok('Zero external network requests (desktop)', ext.length === 0, ext.join(', '));
  ok('No console/page errors (desktop)', D.errors.length === 0 && (await p.evaluate(() => CW.Game.errors.length)) === 0, D.errors.slice(0, 3).join(' | '));

  // ===== MOBILE (touch) =====
  const Mb = await setup(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }); const q = Mb.page;
  await q.locator('.cw-mode.m1 .md-play').tap(); await q.locator('#m1partner button[data-v="human"]').tap(); await q.locator('.cw-intro .cw-go').tap();
  ok('[touch] Mode 1 via taps', (await st1(q)) === 'active');
  let att = 0;
  for (const i of [0, 1]) for (let a = 0; a < 6; a++) {
    att++; const box = await q.locator('.rp-btn').nth(i).boundingBox();
    await waitFor(q, (i) => { const m = CW.M1, r = m.ropers[i], d = (r.zoneC - r.tpos) * r.tdir; return m.state === 'pull' || r.rope === 'locked' || (m.canThrow(r) && d > 0.12 && d < 0.2); }, i, 20000); // lead ~120ms: software-rendered 3x DPR runs ~30fps
    if (await q.evaluate((i) => CW.M1.state === 'pull' || CW.M1.ropers[i].rope === 'locked', i)) break;
    await q.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await waitFor(q, (i) => CW.M1.ropers[i].rope !== 'flying', i);
    if (await q.evaluate((i) => CW.M1.ropers[i].rope === 'locked' || CW.M1.state === 'pull', i)) break;
  }
  ok('[touch] Both ropes thrown with touch → PULL', (await st1(q)) === 'pull', att + ' attempt(s)');
  const bx = [await q.locator('.rp-btn').nth(0).boundingBox(), await q.locator('.rp-btn').nth(1).boundingBox()];
  for (let i = 0; i < 80 && (await st1(q)) === 'pull'; i++) { const b = bx[i % 2]; await q.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await sleep(35); }
  ok('[touch] Both PULL buttons register', await q.evaluate(() => CW.M1.ropers.every((r) => r.st.pullTaps > 5)), await q.evaluate(() => CW.M1.ropers.map((r) => r.st.pullTaps).join('/')));
  await waitFor(q, () => CW.M1.state === 'stun', null, 5000).catch(() => {});
  const ab = await q.locator('.cw-ab').first().boundingBox(); await q.touchscreen.tap(ab.x + ab.width / 2, ab.y + ab.height / 2);
  ok('[touch] Attacker skill fires', await q.evaluate(() => CW.M1.cds[0] > 0));
  const minT = await q.evaluate(() => Math.min(...['.rp-btn', '.cw-ab', '.cw-burst'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return Math.min(r.width, r.height); })));
  ok('[touch] Primary touch targets ≥ 44px on a 390px phone', minT >= 44, Math.round(minT) + 'px');
  if (SHOTS) await q.screenshot({ path: SHOTS + '/qa_mobile_m1.png' });
  await q.locator('.cw-back').tap(); await q.locator('.cw-mode.m2 .md-play').tap(); await q.locator('.cw-intro .cw-go').tap();
  await waitFor(q, () => CW.M2.foes.some((f) => f.alive && f.x < 1000), null, 8000);
  const sk = await q.evaluate(() => CW.M2.stats.hunterDmg + CW.M2.kills);
  for (let i = 0; i < 50; i++) { const e = await q.evaluate(() => { const e = CW.M2.nearest(); return e ? [e.x, e.cy] : null; }); if (e) { const [x, y] = await worldToClient(q, e[0], e[1]); await q.touchscreen.tap(x, y); } await sleep(50); }
  ok('[touch] Tap-to-strike works', await q.evaluate(() => CW.M2.kills > 0), 'kills=' + await q.evaluate(() => CW.M2.kills));
  const skl = await q.locator('.controls .skill').nth(2).boundingBox(); await q.touchscreen.tap(skl.x + skl.width / 2, skl.y + skl.height / 2); await sleep(100);
  ok('[touch] Battle Lab hex skill button (SLASH) fires', await q.evaluate(() => CW.M2.cds[2] > 0));
  if (SHOTS) await q.screenshot({ path: SHOTS + '/qa_mobile_m2.png' });
  const extM = Mb.requests.filter((u) => !u.startsWith('file:') && !u.startsWith('data:'));
  ok('Zero external network requests (mobile)', extM.length === 0);
  ok('No console/page errors (mobile)', Mb.errors.length === 0 && (await q.evaluate(() => CW.Game.errors.length)) === 0, Mb.errors.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
