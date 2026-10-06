// Browser QA (Playwright + Chromium): node tests/browser.test.mjs
// Drives the real index.html from file:// at portrait proportions. Saves screenshots to docs/screenshots/.
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.error('Playwright not found. Run `npm install` in ChaosWorld-RNGRaid (or set NODE_PATH to a global install).');
  process.exit(2);
}
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'file://' + path.join(ROOT, 'index.html');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function page(q = '', vp = { width: 540, height: 960 }) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true });
  const p = await ctx.newPage();
  p._errors = [];
  p.on('pageerror', (e) => p._errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p._errors.push(m.text()); });
  await p.goto(`${URL}?sound=0${q}`);
  await p.waitForFunction(() => window.CW && CW.App && CW.App.save);
  return p;
}
async function check(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log(`ok   ${name}`); }
  catch (e) { results.push({ name, ok: false, err: e.message }); console.log(`FAIL ${name}\n     ${e.message.split('\n')[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const until = (p, fn, timeout = 60000, arg) => p.waitForFunction(fn, arg, { timeout, polling: 50 });
const noErrors = (p) => { const e = p._errors.concat([]); return p.evaluate(() => CW.App.lastError || null).then((le) => { if (le) e.push(le); assert(!e.length, 'page errors: ' + e.join(' | ')); }); };

// ------------------------------------------------------------------ tests
await check('B01 menu loads with bundled fonts, no errors', async () => {
  const p = await page('');
  await p.waitForTimeout(300);
  assert(await p.isVisible('.mode-card.rng') && await p.isVisible('.mode-card.grief'), 'both mode cards visible');
  assert(await p.evaluate(() => document.fonts.check('20px "CW Display"')), 'display font loaded');
  await p.screenshot({ path: path.join(SHOTS, '01-menu.png') });
  await noErrors(p); await p.context().close();
});

await check('B02 [#1 #19] RNG RAID: pull ×3 by keyboard → chaos → countdown → dungeon → results', async () => {
  const p = await page('&seed=42&fast=1&auto=1');
  await p.click('.mode-card.rng');
  for (let i = 0; i < 3; i++) { await until(p, () => CW.App.lobby.canPull(CW.App.lobby.human)); await p.keyboard.press('Space'); }
  await until(p, () => CW.App.lobby.phase === 'chaos');
  assert(await p.evaluate(() => CW.App.lobby.players.every((pl) => CW.SLOTS.every((s) => pl.loadout[s]))), 'everyone has 3 slots');
  assert(await p.evaluate(() => CW.App.lobby.log.filter((e) => e.type === 'spin' && e.pid === 'p0' && e.cause === 'pull').length === 3), 'human made 3 pulls');
  await until(p, () => CW.App.lobby.phase === 'locked');
  await p.waitForSelector('[data-act="continue"]', { state: 'visible' }); await p.click('[data-act="continue"]', { force: true }); // V2: the lobby waits on LOADOUTS LOCKED
  await until(p, () => CW.App.lobby.phase === 'launch');
  await until(p, () => !!document.querySelector('.countdown .cd-n'));
  await until(p, () => CW.App.screen === 'battle', 20000);
  await until(p, () => CW.App.screen === 'results', 90000);
  assert(await p.isVisible('.res-head .big'), 'results heading');
  await noErrors(p); await p.context().close();
});

await check('B03 [#27] debug panel FORCE RARITY → your pulls land Legendary (Legendary FX shown)', async () => {
  const p = await page('&seed=3&fast=1');
  await p.keyboard.press('`');
  await p.click('#debug-panel [data-d="rar"][data-v="legendary"]');
  await p.keyboard.press('`');
  await p.click('.mode-card.rng');
  for (let i = 0; i < 3; i++) { await until(p, () => CW.App.lobby.canPull(CW.App.lobby.human)); await p.click('.actionbar .pull', { force: true }); } // button bobs forever → skip Playwright's stability wait
  await until(p, () => CW.SLOTS.every((s) => CW.App.lobby.isRevealed(CW.App.lobby.human, s)));
  await p.waitForTimeout(150);
  const cls = await p.$$eval('.you .slot', (els) => els.map((e) => e.className));
  assert(cls.every((c) => c.includes('r-legendary')), 'slots: ' + cls.join(','));
  assert(await p.evaluate(() => CW.App.lobby.log.some((e) => e.type === 'bigPull' && e.pid === 'p0')), 'bigPull event');
  await p.screenshot({ path: path.join(SHOTS, '03-legendary-loadout.png') });
  await noErrors(p); await p.context().close();
});

await check('B04 [#9] steal through the UI: target → confirm → dial → SUCCESS → item swaps', async () => {
  const p = await page('&seed=11');
  await p.evaluate(() => { CW.App.debugState.forceSteal = 'success'; });
  await p.click('.mode-card.rng');
  await p.evaluate(() => CW.App.lobby.skipPhase());
  await until(p, () => CW.App.lobby.phase === 'chaos' && CW.SLOTS.every((s) => CW.App.lobby.isRevealed(CW.App.lobby.human, s)));
  await p.evaluate(() => { CW.App.lobby.human.wallet.jack = 2; CW.App.lobby.players.forEach((pl) => { pl.nextThinkAt = 1e9; }); }); // freeze bots for a clean UI test
  await p.click('[data-act="steal"]');
  await p.waitForTimeout(350);
  await p.screenshot({ path: path.join(SHOTS, '05-steal-targeting.png') });
  const target = await p.$('.others .slot[data-slot="gear"].tg-ok');
  assert(target, 'a stealable gear slot is highlighted');
  const pid = await target.getAttribute('data-pid');
  const wantUid = await p.evaluate((id) => CW.App.lobby.get(id).loadout.gear.uid, pid);
  await target.click();
  await p.waitForSelector('#overlay .modal');
  assert((await p.textContent('#overlay .modal')).includes('SUCCESS CHANCE'), 'confirm shows chance');
  await p.screenshot({ path: path.join(SHOTS, '06-steal-confirm.png') });
  await p.click('#overlay [data-m="yes"]');
  await p.waitForSelector('#overlay .dial');
  await p.waitForTimeout(900);
  await p.screenshot({ path: path.join(SHOTS, '07-steal-dial.png') });
  await p.waitForSelector('#overlay .stamp.win', { timeout: 6000 });
  await until(p, (u) => CW.App.lobby.human.loadout.gear.uid === u, 6000, wantUid);
  await noErrors(p); await p.context().close();
});

await check('B05 [#12 #26] GRIEF RAID: curse via UI drops target exactly one tier + immunity badge', async () => {
  const p = await page('&seed=12');
  await p.click('.mode-card.grief');
  await p.evaluate(() => CW.App.lobby.skipPhase());
  await until(p, () => CW.App.lobby.phase === 'chaos' && CW.SLOTS.every((s) => CW.App.lobby.isRevealed(CW.App.lobby.human, s)));
  const pid = await p.evaluate(() => { const L = CW.App.lobby; L.players.forEach((pl) => { pl.nextThinkAt = 1e9; }); const t = L.players[2]; t.loadout.weapon.rarity = 'legendary'; t.shieldUntil = 0; return t.id; });
  await p.waitForTimeout(100);
  await p.click(`.slot[data-pid="${pid}"][data-slot="weapon"]`);
  await p.waitForSelector('#overlay .sheet-actions');
  await p.click('#overlay [data-m="grief"]');
  await p.waitForSelector('#overlay .tier-shift');
  await p.screenshot({ path: path.join(SHOTS, '08-grief-confirm.png') });
  await p.click('#overlay [data-m="yes"]');
  await until(p, (id) => CW.App.lobby.get(id).loadout.weapon.rarity === 'epic', 5000, pid);
  await p.waitForTimeout(250);
  await p.screenshot({ path: path.join(SHOTS, '09-grief-result.png') });
  assert(await p.$eval(`.slot[data-pid="${pid}"][data-slot="weapon"]`, (e) => e.className.includes('r-epic') && e.className.includes('crack-1')), 'slot shows epic + cracks');
  assert(await p.$eval(`#card-${pid}`, (e) => e.classList.contains('shielded')), 'immunity shown');
  // legendary steal is bolted down in grief mode → offers curse instead
  await p.evaluate((id) => { CW.App.lobby.get(id).loadout.gear.rarity = 'legendary'; CW.App.lobby.get(id).guardUntil = 0; }, pid);
  await p.click('[data-act="steal"]'); await p.waitForTimeout(300);
  await p.click(`.slot[data-pid="${pid}"][data-slot="gear"]`);
  await p.waitForSelector('#overlay .modal');
  assert((await p.textContent('#overlay .modal')).includes('BOLTED DOWN'), 'bolted down modal');
  await p.screenshot({ path: path.join(SHOTS, '10-bolted-down.png') });
  await noErrors(p); await p.context().close();
});

await check('B06 [#15-17] boost to cap: CHAOS RAID state + battle shows modifiers', async () => {
  const p = await page('&seed=13');
  await p.click('.mode-card.grief');
  await p.evaluate(() => CW.App.lobby.skipPhase());
  await until(p, () => CW.App.lobby.phase === 'chaos');
  await p.evaluate(() => { CW.App.lobby.human.wallet.coins = 5000; });
  for (let i = 0; i < 12; i++) { await p.click('[data-act="boost"]'); await p.waitForTimeout(60); }
  assert(await p.evaluate(() => CW.App.lobby.potX100 === CW.RAID_POT.cap), 'pot capped at x2.0');
  await p.waitForTimeout(500);
  assert(await p.$eval('#scr-lobby', (e) => e.classList.contains('chaos-raid')), 'chaos raid lighting');
  await p.screenshot({ path: path.join(SHOTS, '11-chaos-raid-x2.png') });
  await p.keyboard.press('`'); await p.click('#debug-panel [data-d="skiplobby"]'); await p.keyboard.press('`');
  await until(p, () => CW.App.screen === 'battle');
  await p.waitForTimeout(500);
  const chips = await p.$$eval('.bt-mods span', (e) => e.map((x) => x.textContent));
  assert(chips.length === 4 && chips.some((c) => c.includes('ENRAGED')), 'modifier chips: ' + chips);
  await p.screenshot({ path: path.join(SHOTS, '12-battle-intro-x2.png') });
  await noErrors(p); await p.context().close();
});

await check('B07 [#20] battle: lobby loadout on HUD, skill button casts, live combat', async () => {
  const p = await page('&seed=14');
  await p.click('.mode-card.rng');
  await p.evaluate(() => CW.App.lobby.skipToBattle());
  await until(p, () => CW.App.screen === 'battle');
  const hud = await p.$$eval('.bt-you .mini .slot', (e) => e.length);
  assert(hud === 3, 'HUD shows your 3 lobby items');
  const hp = await p.evaluate(() => CW.App.battle.human.maxHp === CW.deriveStats(CW.App.lobby.human.loadout).hp);
  assert(hp, 'battle HP comes from loadout');
  // a boss stun can land between "ready" and the click (correct behaviour) — retry a few times
  let cast = false;
  for (let i = 0; i < 4 && !cast; i++) {
    await until(p, () => CW.App.battle.state === 'fight' && CW.App.battle.canCast(CW.App.battle.human, 0), 20000);
    await p.click('.skill.s1', { force: true });
    cast = await p.evaluate(() => CW.App.battle.human.skills[0].cdLeft > 0);
  }
  assert(cast, 'skill went on cooldown');
  await p.waitForTimeout(2500);
  await p.screenshot({ path: path.join(SHOTS, '13-battle.png') });
  await noErrors(p); await p.context().close();
});

await check('B08 [#21 #22 #23 #25] debug WIN → results → reload keeps save; LOSE at x1.8 shows greedy loss', async () => {
  const p = await page('&seed=15');
  await p.evaluate(() => CW.Save.reset());
  await p.click('.mode-card.rng');
  await p.evaluate(() => { CW.App.lobby.setPot(150); CW.App.lobby.skipToBattle(); });
  await until(p, () => CW.App.screen === 'battle');
  await p.waitForTimeout(400);
  await p.evaluate(() => CW.App.battle.forceWin());
  await until(p, () => CW.App.screen === 'results', 10000);
  await p.waitForTimeout(1600);
  const txt = await p.textContent('#scr-results');
  assert(txt.includes('BOSS DOWN') && txt.includes('RAID POT x1.5'), 'win screen shows pot line');
  assert(await p.evaluate(() => { const r = CW.App.lastResult; return r.rewards.coins === Math.round(CW.ECONOMY.winBase * CW.PLACEMENT_REWARDS[r.place - 1] * 1.5) + (r.place === 1 ? CW.ECONOMY.mvpBonus : 0); }), 'placement % × 1.5 pot');
  await p.screenshot({ path: path.join(SHOTS, '14-results-win.png') });
  const coins = await p.evaluate(() => CW.Save.data.wallet.coins);
  await p.reload();
  await p.waitForFunction(() => window.CW && CW.App && CW.App.save);
  const after = await p.evaluate(() => ({ c: CW.Save.data.wallet.coins, r: CW.Save.data.stats.raidsPlayed, w: CW.Save.data.stats.wins, best: CW.Save.data.stats.highestPotCleared }));
  assert(after.c === coins && after.r === 1 && after.w === 1 && after.best === 150, 'persisted: ' + JSON.stringify(after));
  assert((await p.textContent('.mode-card.rng .rec')).includes('1W / 1'), 'menu shows record');
  // loss
  await p.click('.mode-card.rng');
  await p.evaluate(() => { CW.App.lobby.setPot(180); CW.App.lobby.skipToBattle(); });
  await until(p, () => CW.App.screen === 'battle');
  await p.waitForTimeout(300);
  await p.evaluate(() => CW.App.battle.forceLose());
  await until(p, () => CW.App.screen === 'results', 10000);
  await p.waitForTimeout(1500);
  const lt = await p.textContent('#scr-results');
  assert(lt.includes('WIPED') && lt.includes('WE GOT GREEDY') && lt.includes('CONSOLATION'), 'greedy loss copy');
  await p.screenshot({ path: path.join(SHOTS, '15-results-greedy-loss.png') });
  // reset save from settings
  await p.click('[data-r="menu"]');
  await p.click('[data-m="settings"]');
  await p.click('#overlay [data-t="reset"]'); await p.click('#overlay [data-t="reset"]');
  assert(await p.evaluate(() => CW.Save.load().stats.raidsPlayed === 0), 'RESET SAVE');
  await noErrors(p); await p.context().close();
});

await check('B09 [#28] fast mode: whole lobby finishes in a few real seconds', async () => {
  const p = await page('&seed=16');
  await p.click('[data-m="settings"]');
  await p.click('#overlay [data-t="fast"]');
  await p.click('#overlay [data-m="no"]');
  const t0 = Date.now();
  await p.click('.mode-card.grief');
  await until(p, () => CW.App.lobby && CW.App.lobby.phase === 'locked', 30000);
  await p.waitForSelector('[data-act="continue"]', { state: 'visible' }); await p.click('[data-act="continue"]', { force: true });
  await until(p, () => CW.App.screen === 'battle', 30000);
  const secs = (Date.now() - t0) / 1000;
  assert(secs < 16, `fast lobby took ${secs}s`);
  await p.evaluate(() => CW.App.setFast(false));
  await noErrors(p); await p.context().close();
});

await check('B10 [#18] bots act visibly in the lobby (feed, banners, statuses)', async () => {
  const p = await page('&seed=17');
  await p.click('.mode-card.grief');
  await p.evaluate(() => CW.App.lobby.skipPhase());
  await until(p, () => CW.App.lobby.stats.botActions >= 4, 25000);
  const feed = await p.$$eval('.feed div', (e) => e.length);
  assert(feed > 0, 'feed has lines');
  await p.screenshot({ path: path.join(SHOTS, '04-chaos-phase.png') });
  await noErrors(p); await p.context().close();
});

// Touch-target audit: every interactive control ≥44 design-px and no overlaps, in each phase, at two portrait sizes.
async function auditTouch(p, label) {
  return p.evaluate((label) => {
    const scale = CW.UI.scale;
    const els = [...document.querySelectorAll('#stage button, #stage .slot[data-pid], #stage .mode-card')]
      .filter((e) => e.id !== 'dbg-btn' && !e.closest('#debug-panel') && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden')
      .filter((e) => !e.closest('.screen') || e.closest('.screen') === document.querySelector(`#scr-${CW.App.screen}`))
      .filter((e) => (document.querySelector('#overlay.open') ? !!e.closest('#overlay') : true)) // an open modal covers everything else
      .filter((e) => { const cover = document.querySelector('.target-sheet') || document.querySelector('.vote-panel:not(.done)'); return !cover || cover.contains(e); });
    const st = document.querySelector('#stage').getBoundingClientRect();
    const boxes = els.map((e) => { const r = e.getBoundingClientRect(); return { e, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width / scale, h: r.height / scale, n: (e.className || e.tagName) + ' ' + (e.textContent || '').trim().slice(0, 18) }; });
    const issues = [];
    for (const b of boxes) {
      if (b.w < 43.5 || b.h < 43.5) issues.push(`${label}: small ${b.n} ${b.w.toFixed(0)}x${b.h.toFixed(0)}`);
      if (b.l < st.left - 1 || b.r > st.right + 1 || b.t < st.top - 1 || b.b > st.bottom + 1) issues.push(`${label}: offstage ${b.n}`);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], c = boxes[j];
      if (a.e.contains(c.e) || c.e.contains(a.e)) continue;
      const ox = Math.min(a.r, c.r) - Math.max(a.l, c.l), oy = Math.min(a.b, c.b) - Math.max(a.t, c.t);
      if (ox > 1 && oy > 1) issues.push(`${label}: overlap "${a.n}" × "${c.n}"`);
    }
    return { n: boxes.length, issues };
  }, label);
}
for (const vp of [{ width: 540, height: 960 }, { width: 390, height: 844 }, { width: 1080, height: 1920 }]) {
  await check(`B11 [#29] touch controls ≥44px & non-overlapping @${vp.width}x${vp.height}`, async () => {
    const p = await page('&seed=18', vp);
    const all = [];
    const push = async (l) => { const r = await auditTouch(p, l); assert(r.n > 0, l + ' found no controls'); all.push(...r.issues); };
    await push('menu');
    await p.click('.mode-card.grief');
    await until(p, () => CW.App.lobby.phase === 'rolling');
    await push('rolling');
    await p.evaluate(() => CW.App.lobby.skipPhase());
    await until(p, () => CW.App.lobby.phase === 'chaos');
    await p.evaluate(() => CW.App.lobby.players.forEach((pl) => { pl.nextThinkAt = 1e9; }));
    await p.waitForTimeout(200);
    await push('chaos');
    await p.click('[data-act="steal"]'); await p.waitForTimeout(300);
    await push('chaos-targeting');
    await p.keyboard.press('Escape');
    await p.evaluate(() => { const L = CW.App.lobby; L.human.loadout.weapon.rarity = 'legendary'; L.human.wallet.coins = 500; });
    await p.click('[data-act="protect"]', { force: true }); await p.waitForTimeout(250);
    if (await p.$('#overlay.open')) { await push('protect-modal'); await p.keyboard.press('Escape'); }
    await p.click('[data-act="shuffle"]'); await p.waitForTimeout(300);
    if (await p.$('#overlay.open')) { await push('shuffle-modal'); await p.keyboard.press('Escape'); }
    await p.evaluate(() => CW.App.lobby.skipPhase()); // chaos → LOADOUTS LOCKED
    await until(p, () => CW.App.lobby.phase === 'locked'); await p.waitForTimeout(200);
    await push('locked');
    await p.waitForSelector('[data-act="continue"]', { state: 'visible' }); await p.click('[data-act="continue"]', { force: true });
    await until(p, () => !!document.querySelector('.vote-panel')); await p.waitForTimeout(200);
    await push('vote');
    if (vp.width === 390) await p.screenshot({ path: path.join(SHOTS, 'v2-phone-390x844-vote.png') });
    await until(p, () => CW.App.screen === 'battle', 30000);
    await p.waitForTimeout(400);
    await push('battle');
    await p.evaluate(() => CW.App.battle.giveItem(CW.App.battle.human, 'hex'));
    await p.click('.item-btn', { force: true }); await p.waitForTimeout(200);
    await push('battle-targeting');
    if (vp.width === 390) await p.screenshot({ path: path.join(SHOTS, 'v2-phone-390x844-target.png') });
    await p.click('[data-b="untarget"]', { force: true });
    await p.evaluate(() => CW.App.battle.setBossHpPct(0.49)); await until(p, () => !!document.querySelector('.vote-panel.mid')); await p.waitForTimeout(200);
    await push('mid-vote');
    await p.evaluate(() => CW.App.battle.vote.closeNow()); await p.waitForTimeout(1500);
    await p.evaluate(() => CW.App.battle.forceWin());
    await until(p, () => CW.App.screen === 'results', 10000);
    await push('results');
    if (vp.width === 390) await p.screenshot({ path: path.join(SHOTS, '16-phone-390x844-results.png') });
    assert(!all.length, all.slice(0, 8).join('\n     '));
    await noErrors(p); await p.context().close();
  });
}

await check('B12 portrait screenshots at 1080x1920 (lobby rolling + chaos)', async () => {
  const p = await page('&seed=42', { width: 1080, height: 1920 });
  await p.click('.mode-card.rng');
  await until(p, () => CW.App.lobby.phase === 'rolling');
  await p.keyboard.press('Space');
  await p.waitForTimeout(5200);
  await p.screenshot({ path: path.join(SHOTS, '02-lobby-rolling-1080x1920.png') });
  await noErrors(p); await p.context().close();
});


// ------------------------------------------------------------------ V2 checks
await check('VB1 [V01-04] all 8 reels of a round spin at once in the UI, then land one by one', async () => {
  const p = await page('&seed=21');
  await p.click('.mode-card.rng');
  await until(p, () => CW.App.lobby.canPull(CW.App.lobby.human));
  await p.keyboard.press('Space');
  await p.waitForTimeout(400);
  const spinning = await p.$$eval('.slot[data-slot="hero"].spinning', (e) => e.length);
  assert(spinning === 8, `spinning hero reels: ${spinning}`);
  await until(p, () => document.querySelectorAll('.slot[data-slot="hero"].spinning').length > 0 && document.querySelectorAll('.slot[data-slot="hero"].spinning').length < 8, 6000);
  await until(p, () => document.querySelectorAll('.slot[data-slot="hero"].spinning').length === 0, 8000);
  await noErrors(p); await p.context().close();
});

await check('VB2 [V05] LOADOUTS LOCKED waits for CONTINUE TO RAID', async () => {
  const p = await page('&seed=22&fast=1');
  await p.click('.mode-card.rng');
  await until(p, () => CW.App.lobby.phase === 'locked', 30000);
  await p.waitForTimeout(3000);
  assert(await p.evaluate(() => CW.App.lobby.phase === 'locked' && CW.App.screen === 'lobby'), 'still waiting');
  assert(await p.isVisible('[data-act="continue"]'), 'continue button');
  await p.waitForSelector('[data-act="continue"]', { state: 'visible' }); await p.click('[data-act="continue"]', { force: true });
  await until(p, () => CW.App.lobby.phase === 'vote');
  await noErrors(p); await p.context().close();
});

await check('VB3 [V14-16] pre-raid boon vote: tap a boon, bots vote, winner shown in battle', async () => {
  const p = await page('&seed=23');
  await p.evaluate(() => { CW.App.debugState.forceVote = null; });
  await p.click('.mode-card.grief');
  await p.evaluate(() => { CW.App.lobby.skipPhase(); CW.App.lobby.skipPhase(); });
  await until(p, () => CW.App.lobby.phase === 'locked');
  await p.waitForSelector('[data-act="continue"]', { state: 'visible' }); await p.click('[data-act="continue"]', { force: true });
  await until(p, () => !!document.querySelector('.vote-panel .boon'));
  const pick = await p.getAttribute('.vote-panel .boon >> nth=2', 'data-boon');
  await p.click('.vote-panel .boon >> nth=2');
  await until(p, () => !!document.querySelector('.vote-panel .boon.mine'));
  await until(p, () => document.querySelectorAll('.vote-chip').length >= 5, 12000);
  await until(p, () => CW.App.screen === 'battle', 30000);
  const boons = await p.evaluate(() => CW.App.battle.boons);
  assert(boons.length === 1, 'one boon in battle');
  assert(await p.evaluate(() => CW.App.lobby.vote.votes[CW.App.lobby.human.id]) === pick, 'my vote recorded');
  assert(await p.$('.bt-boons .boon-chip'), 'boon chip on the HUD');
  await noErrors(p); await p.context().close();
});

await check('VB4 [V06-08] Protect in the UI: ward badge + locked-in action bar', async () => {
  const p = await page('&seed=24');
  await p.click('.mode-card.rng');
  await p.evaluate(() => { const L = CW.App.lobby; L.skipPhase(); L.players.forEach((x) => { if (!x.isHuman) { x.protectDecided = true; x.nextThinkAt = 1e9; } }); L.human.loadout.gear.rarity = 'mythic'; L.human.wallet.coins = 640; });
  await p.waitForTimeout(1200);
  await p.click('[data-act="protect"]', { force: true });
  await p.waitForSelector('#overlay .modal');
  const txt = await p.textContent('#overlay .modal');
  assert(txt.includes('ALL 640 COINS') && txt.includes('5% → 1%'), 'protect modal: ' + txt.slice(0, 120));
  await p.click('#overlay [data-m="yes"]');
  await p.waitForTimeout(400);
  assert(await p.$('.you .slot[data-slot="gear"].warded'), 'ward badge');
  assert((await p.textContent('.actionbar')).includes('LOCKED IN'), 'locked-in bar');
  assert(await p.evaluate(() => CW.App.lobby.human.wallet.coins === 0));
  await noErrors(p); await p.context().close();
});

await check('VB5 [V11-13 V19-21] race HUD + item reel → ready → target sheet in rank order → fire', async () => {
  const p = await page('&seed=25');
  await p.click('.mode-card.rng');
  await p.evaluate(() => CW.App.lobby.skipToBattle());
  await until(p, () => CW.App.screen === 'battle' && CW.App.battle.state === 'fight');
  await p.waitForTimeout(2500);
  assert((await p.$$('.bt-race .rr')).length >= 3, 'top-3 race board');
  assert(/\d(ST|ND|RD|TH)/.test(await p.textContent('.bt-you .pos')), 'YOU — nTH');
  await p.evaluate(() => { CW.App.debugState.forceItem = 'bomb'; const h = CW.App.battle.human; h.item = null; h.reel = null; CW.App.battle.startItemReel(h); });
  await until(p, () => document.querySelector('.item-btn').dataset.state === 'reel', 3000);
  await until(p, () => document.querySelector('.item-btn').dataset.state === 'ready', 4000);
  assert((await p.textContent('.item-btn')).includes('BOMB'));
  await p.click('.item-btn', { force: true });
  await p.waitForSelector('.target-sheet');
  const ranks = await p.$$eval('.ts-row .ts-rank', (e) => e.map((x) => parseInt(x.textContent)));
  assert(ranks.every((r, i) => i === 0 || r > ranks[i - 1]), 'rank order: ' + ranks);
  await p.click('.ts-row:not(.off) >> nth=0', { force: true });
  await until(p, () => !CW.App.battle.human.item);
  assert(!(await p.$('.target-sheet')), 'sheet closed');
  await p.evaluate(() => { CW.App.debugState.forceItem = null; });
  await noErrors(p); await p.context().close();
});

await check('VB6 [V17 V18 V37] mid-boss vote pauses the fight and resumes it', async () => {
  const p = await page('&seed=26');
  await p.click('.mode-card.rng');
  await p.evaluate(() => CW.App.lobby.skipToBattle());
  await until(p, () => CW.App.screen === 'battle' && CW.App.battle.state === 'fight');
  await p.evaluate(() => CW.App.battle.setBossHpPct(0.49));
  await until(p, () => !!document.querySelector('.vote-panel.mid'));
  const t0 = await p.evaluate(() => CW.App.battle.time);
  await p.waitForTimeout(1500);
  assert(await p.evaluate((t) => CW.App.battle.time === t && CW.App.battle.state === 'vote', t0), 'paused');
  await p.click('.vote-panel.mid .boon >> nth=0');
  await p.evaluate(() => CW.App.battle.vote.closeNow());
  await until(p, () => CW.App.battle.state === 'fight' && CW.App.battle.boons.length === 1);
  await p.waitForTimeout(800);
  assert(await p.evaluate((t) => CW.App.battle.time > t, t0), 'resumed');
  await noErrors(p); await p.context().close();
});

await check('VB7 [V33-35] podium shows the real top three + placement rewards', async () => {
  const p = await page('&seed=27');
  await p.click('.mode-card.rng');
  await p.evaluate(() => CW.App.lobby.skipToBattle());
  await until(p, () => CW.App.screen === 'battle' && CW.App.battle.state === 'fight');
  for (let i = 0; i < 6; i++) await p.waitForTimeout(500);
  await p.evaluate(() => CW.App.battle.forceWin());
  await until(p, () => CW.App.screen === 'results', 10000);
  await p.waitForTimeout(800);
  const pod = await p.$$eval('.pod-lbl .nm', (e) => e.map((x) => x.textContent.replace(/[^A-Z0-9_]/g, '')));
  const top = await p.evaluate(() => CW.App.lastResult.rows.slice(0, 3).map((r) => (r.isHuman ? 'YOU' : r.name).replace(/[^A-Z0-9_]/g, '')));
  assert(pod.length === 3 && [top[1], top[0], top[2]].every((n, i) => pod[i].includes(n)), `podium ${pod} vs ${top}`);
  const coins = await p.evaluate(() => CW.App.lastResult.rows.map((r) => r.reward.coins));
  assert(coins.every((c, i) => i === 0 || c <= coins[i - 1]), 'rewards fall with placement');
  assert((await p.$$('.res-rest .rr')).length === 5, '4th–8th list');
  await noErrors(p); await p.context().close();
});

await check('VB8 [V38] single-file build runs from file:// with zero network', async () => {
  const { execSync } = await import('child_process');
  execSync('node tools/build-single.js', { cwd: ROOT });
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 } });
  const p = await ctx.newPage();
  const errs = [], net = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) net.push(r.url()); });
  await p.goto('file://' + path.join(ROOT, 'dist', 'ChaosWorld-RNGRaid.html') + '?sound=0&fast=1&auto=1&seed=5');
  await p.waitForFunction(() => window.CW && CW.App && CW.App.save);
  await p.click('.mode-card.grief');
  await p.waitForFunction(() => CW.App.lobby.phase === 'locked', null, { timeout: 30000 });
  await p.waitForSelector('[data-act="continue"]', { state: 'visible' }); await p.click('[data-act="continue"]', { force: true });
  await p.waitForFunction(() => CW.App.screen === 'results', null, { timeout: 120000 });
  assert(!errs.length && !net.length, `errors ${errs} network ${net}`);
  await ctx.close();
});

// Visual QA capture: the V2 moments at three portrait sizes (inspected by eye; files in docs/screenshots/v2/)
const V2 = path.join(SHOTS, 'v2'); fs.mkdirSync(V2, { recursive: true });
for (const vp of [{ width: 390, height: 844 }, { width: 540, height: 960 }, { width: 1080, height: 1920 }]) {
  await check(`VB9 visual capture @${vp.width}x${vp.height}`, async () => {
    const p = await page('&seed=2024', vp);
    const tag = `${vp.width}x${vp.height}`;
    const shot = (n) => p.screenshot({ path: path.join(V2, `${n}-${tag}.jpg`), type: 'jpeg', quality: 72 });
    await p.click('.mode-card.grief');
    await until(p, () => CW.App.lobby.canPull(CW.App.lobby.human));
    await p.evaluate(() => { CW.App.debugState.forceRarity = 'legendary'; });
    await p.keyboard.press('Space'); await p.waitForTimeout(900); await shot('01-simultaneous-reels');
    await until(p, () => CW.App.lobby.log.some((e) => e.type === 'lastSpinning'), 8000).catch(() => {}); await p.waitForTimeout(200); await shot('02-still-spinning');
    await p.evaluate(() => { CW.App.debugState.forceRarity = null; const L = CW.App.lobby; L.skipPhase(); L.players.forEach((x) => { if (!x.isHuman) { x.protectDecided = true; x.nextThinkAt = 1e9; } }); L.human.wallet.coins = 700; L.players[3].loadout.weapon.rarity = 'mythic'; L.players[3].wallet.coins = 200; L.protect(L.players[3], 'weapon'); });
    await p.waitForTimeout(1600);
    await p.click('[data-act="protect"]', { force: true }); await p.waitForTimeout(300); await shot('03-protect-confirm');
    await p.click('#overlay [data-m="yes"]'); await p.waitForTimeout(1600); await shot('04-protected');
    await p.evaluate(() => CW.App.lobby.skipPhase()); await until(p, () => CW.App.lobby.phase === 'locked'); await p.waitForTimeout(2600); await shot('05-loadouts-locked');
    await p.waitForSelector('[data-act="continue"]', { state: 'visible' }); await p.click('[data-act="continue"]', { force: true }); await p.waitForTimeout(4500); await shot('06-boon-vote');
    await until(p, () => CW.App.screen === 'battle', 30000); await p.waitForTimeout(3500); await shot('07-boss-race');
    await p.evaluate(() => { const h = CW.App.battle.human; h.item = null; h.reel = null; CW.App.battle.startItemReel(h, 'ghost'); }); await p.waitForTimeout(500); await shot('08-item-reel');
    await until(p, () => !!CW.App.battle.human.item); await p.click('.item-btn', { force: true }); await p.waitForTimeout(300); await shot('09-target-select');
    await p.click('.ts-row:not(.off) >> nth=0', { force: true }); await p.waitForTimeout(450); await shot('10-ghost-swap');
    await p.evaluate(() => { const B = CW.App.battle; B.giveItem(B.human, 'lightning'); }); await p.click('.item-btn', { force: true }); await p.waitForTimeout(350); await shot('11-lightning');
    await p.waitForTimeout(2500);
    await p.evaluate(() => { const B = CW.App.battle; B.setHumanRank(1); const c = B.standings()[5]; B.giveItem(c, 'crownBreaker'); B.useItem(c); }); await p.waitForTimeout(500); await shot('12-crown-breaker');
    await p.waitForTimeout(1800);
    await p.evaluate(() => CW.App.battle.setBossHpPct(0.49)); await p.waitForTimeout(4200); await shot('13-mid-boss-vote');
    await p.evaluate(() => CW.App.battle.vote && CW.App.battle.vote.closeNow()); await p.waitForTimeout(2500); await shot('14-race-after-vote');
    await p.evaluate(() => CW.App.battle.forceWin()); await until(p, () => CW.App.screen === 'results', 10000); await p.waitForTimeout(1800); await shot('15-podium');
    await noErrors(p); await p.context().close();
  });
}

await check('VB10 art swap: a sprite registered in the ArtPack replaces the placeholder', async () => {
  const p = await page('');
  const r = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 40; c.height = 80; const x = c.getContext('2d'); x.fillStyle = '#f0f'; x.fillRect(0, 0, 40, 80);
    CW.ArtPack.register('char:knight', { src: c.toDataURL(), anchorX: 0.5, anchorY: 1, height: 100 });
    await new Promise((res) => setTimeout(res, 100));
    const cv = document.createElement('canvas'); cv.width = 200; cv.height = 200; const ctx = cv.getContext('2d');
    const b = CW.ArtPack.drawCharacter(ctx, 'archer', 100, 180, 1, {});
    const a = CW.ArtPack.drawCharacter(ctx, 'knight', 100, 180, 1, {}); // drawn last so its pixels are on top
    const px = ctx.getImageData(100, 120, 1, 1).data;
    return { a, b, magenta: px[0] > 200 && px[1] < 40 && px[2] > 200 };
  });
  assert(r.a === 'sprite' && r.b === 'procedural' && r.magenta, JSON.stringify(r));
  await noErrors(p); await p.context().close();
});

await check('B13 all WebAudio SFX hooks play without errors (procedural, no files)', async () => {
  const p = await page('');
  await p.evaluate(() => { CW.Sfx.setEnabled(true); });
  await p.click('[data-m="help"]'); await p.keyboard.press('Escape'); // user gesture unlocks audio
  const r = await p.evaluate(async () => {
    CW.Sfx.unlock();
    const need = ['tick', 'reveal', 'rare', 'epic', 'legendary', 'mythic', 'stealTry', 'stealWin', 'stealFail', 'grief', 'boost', 'countdown', 'transition', 'chaosRaid'];
    const missing = need.filter((n) => !CW.Sfx.names.includes(n));
    for (const n of CW.Sfx.names) CW.Sfx.play(n, { gap: 0 });
    await new Promise((res) => setTimeout(res, 300));
    return { missing, n: CW.Sfx.names.length };
  });
  assert(!r.missing.length, 'missing hooks: ' + r.missing);
  await noErrors(p); await p.context().close();
});

await browser.close();
const fail = results.filter((r) => !r.ok);
console.log(`\n${results.length - fail.length}/${results.length} browser checks passed`);
fs.writeFileSync(path.join(ROOT, 'tests', 'last-browser-results.json'), JSON.stringify(results, null, 2));
process.exit(fail.length ? 1 : 0);
