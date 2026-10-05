// End-to-end browser QA against the PRODUCTION build (dist/).
//  - serves dist/ on a private port (this script's own server, closed at the end)
//  - launches its own uniquely-flagged headless Chromium (closed at the end)
//  - for each level: load, check no page errors, auto-play the stored solution,
//    assert the browser reaches 'won' (same physics as Node), sample FPS
//  - FTUE: fresh ?playtest=1 boots straight into Level 1 with the aim hint
//  - writes screenshots to tests/browser/out/
// Usage: npm run build && node tests/browser/smoke.mjs [--levels=1,5,10] [--shots]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(new URL('../../dist', import.meta.url).pathname);
const outDir = path.resolve(new URL('./out', import.meta.url).pathname);
fs.mkdirSync(outDir, { recursive: true });
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const levels = args.levels ? args.levels.split(',').map(Number) : Array.from({ length: 20 }, (_, i) => i + 1);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(root, u === '/' ? 'index.html' : u);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--bowlingsmash-qa-browser'],
});
const results = [];
let pass = 0, fail = 0;
const check = (name, ok, info = '') => { results.push({ name, ok, info }); ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${info}`); };

try {
  // ---- FTUE: fresh playtest boots into level 1, no menus
  {
    const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '?playtest=1');
    await page.waitForFunction(() => window.__game?.sim, null, { timeout: 30000 });
    await page.waitForTimeout(1200);
    const st = await page.evaluate(() => ({ level: window.__game.level.id, modal: window.__game.ui.modalOpen, map: !!window.__game.ui.mapEl, hint: document.querySelector('#hint .bubble')?.textContent, coinsHidden: document.querySelector('#coins').classList.contains('hidden') }));
    check('FTUE: fresh playtest starts on Level 1', st.level === 1 && !st.modal && !st.map);
    check('FTUE: shows DRAG TO AIM, hides coins', st.hint === 'DRAG TO AIM' && st.coinsHidden, JSON.stringify(st));
    await page.screenshot({ path: path.join(outDir, 'ftue-level1-portrait.png') });
    // real drag gesture: pull back from mid-screen
    await page.mouse.move(210, 600); await page.mouse.down(); await page.mouse.move(214, 760, { steps: 10 });
    const hint2 = await page.evaluate(() => document.querySelector('#hint .bubble')?.textContent);
    check('FTUE: dragging shows RELEASE TO BOWL', hint2 === 'RELEASE TO BOWL');
    await page.screenshot({ path: path.join(outDir, 'ftue-aiming.png') });
    await page.mouse.up();
    await page.waitForFunction(() => ['won', 'aim', 'lost'].includes(window.__game.sim.state) && window.__game.sim.shotsTaken === 1 && window.__game.sim.state !== 'rolling', null, { timeout: 30000 });
    const after = await page.evaluate(() => ({ shots: window.__game.sim.shotsTaken, down: window.__game.sim.targetsDown }));
    check('FTUE: mouse drag bowls the ball and knocks pins', after.shots === 1 && after.down >= 5, JSON.stringify(after));
    check('FTUE: no page errors', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ---- every level: solution plays to a win in the browser
  for (const id of levels) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}?level=${id}&memsave&unlimitedlives${args.shots ? '' : '&qafast'}`);
    await page.waitForFunction(() => window.__game?.sim && window.__game.level, null, { timeout: 30000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => { window.__game.ui.closeModal(); });
    if (args.shots) await page.screenshot({ path: path.join(outDir, `level${String(id).padStart(2, '0')}-start.png`) });
    await page.waitForTimeout(1600); // fps is measured over a 1 s window
    const fpsIdle = await page.evaluate(() => Math.round(window.__game.fps));
    const bodies = await page.evaluate(() => window.__game.sim.bodyCount());
    await page.evaluate(() => { window.__game.ui.closeModal(); window.__game.autoSolve(); });
    let midShot = false;
    const t0 = Date.now();
    let state = 'rolling';
    while (Date.now() - t0 < 120000) {
      await page.waitForTimeout(250);
      await page.evaluate(() => window.__game.ui.closeModal()); // booster intro popups
      state = await page.evaluate(() => window.__game.sim.state);
      if (args.shots && !midShot && Date.now() - t0 > 1800) { midShot = true; await page.screenshot({ path: path.join(outDir, `level${String(id).padStart(2, '0')}-action.png`) }); }
      if (state === 'won' || state === 'lost') break;
    }
    check(`L${id} solution wins in browser`, state === 'won', `state=${state} idleFPS(swiftshader)=${fpsIdle} bodies=${bodies}`);
    check(`L${id} no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    if (args.shots) {
      await page.waitForTimeout(1600);
      await page.screenshot({ path: path.join(outDir, `level${String(id).padStart(2, '0')}-result.png`) });
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ pass, fail, results }, null, 2));
console.log(`\nBROWSER QA: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
