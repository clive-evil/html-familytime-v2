// Browser test: starts the dev server, opens the game in headless Chromium
// (SwiftShader WebGL), drives REAL mouse/keyboard input (absolute-mouse mode,
// since pointer lock is unavailable headless), checks the posture -> body
// path, a jump, a crash -> ragdoll -> get-up cycle, the debug panel, and the
// mountain's dynamic events. Screenshots go to ./test-output/.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const PORT = 5199;
const out = 'test-output';
mkdirSync(out, { recursive: true });
const server = spawn('node_modules/.bin/vite', ['--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((res) => server.stdout.on('data', (d) => d.toString().includes('Local') && res()));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); };
const G = (fn, arg) => page.evaluate(fn, arg);

// ---- lab, real input path
await page.goto(`http://localhost:${PORT}/?mode=lab&debug=1&mouse=abs`);
await page.waitForFunction(() => window.__game && window.__game.terrainView, null, { timeout: 90000 });
await page.waitForTimeout(800);
check('game boots into the lab', await G(() => window.__game.mode === 'lab' && window.__game.state === 'skiing'));
check('debug panel visible', await G(() => document.getElementById('debug').style.display === 'block' && document.getElementById('dbg-live').textContent.includes('slope angle')));

// mouse down (toward the bottom of the screen) = crouch
await page.mouse.move(640, 360);
await page.mouse.move(640, 640, { steps: 4 });
await page.waitForTimeout(600);
const crouch = await G(() => ({ py: window.__game.input.py, Lt: window.__game.skier.Lt, L: window.__game.skier.L }));
check('mouse back -> crouch (posture y < 0, legs shorten)', crouch.py < -0.5 && crouch.Lt < 0.7, JSON.stringify(crouch));
await page.mouse.move(640, 80, { steps: 2 });
await page.waitForTimeout(400);
const ext = await G(() => ({ py: window.__game.input.py, Lt: window.__game.skier.Lt }));
check('mouse forward -> extend', ext.py > 0.5 && ext.Lt > 0.9, JSON.stringify(ext));
await page.mouse.move(900, 360, { steps: 2 });
await page.waitForTimeout(200);
check('mouse right -> weight right', await G(() => window.__game.input.px > 0.3));
await page.mouse.move(640, 360);

// keyboard: D steers right (heading decreases)
await G(() => window.__game.respawnAt(0, true));
await page.keyboard.down('KeyW');
// headless SwiftShader runs slower than real time: wait on sim progress, not wall time
await page.waitForFunction(() => window.__game.skier.speed > 4, null, { timeout: 60000 }).catch(() => {});
await page.keyboard.down('KeyD');
await page.waitForFunction(() => window.__game.skier.heading < -0.2, null, { timeout: 30000 }).catch(() => {});
await page.keyboard.up('KeyD');
await page.keyboard.up('KeyW');
const steer = await G(() => ({ heading: window.__game.skier.heading, speed: window.__game.skier.speed }));
check('W + D: moving and turning right', steer.speed > 2 && steer.heading < -0.05, JSON.stringify(steer));
await page.screenshot({ path: `${out}/bt-lab-carve.png` });

// a jump on the small lip: a per-physics-step controller (game.autopilot) does
// crouch -> flick -> prepare, so slow headless frame rates can't skew timing
await G(() => {
  const g = window.__game;
  g.respawnAt(3, true);
  g.skier.v = { x: 0, y: -6, z: 19 };
  let flick = false;
  g.autopilot = (session) => {
    const sk = session.skier;
    const d = 430 - sk.p.z;
    const o = { steer: 0, tuck: 0, brake: 0, px: 0, py: g.__py || 0 };
    if (sk.grounded && d > 0 && d < 14 && !flick) o.py = Math.max(-0.75, o.py - 0.01);
    if (sk.grounded && d > 0 && d < 4.5) flick = true;
    if (flick && sk.grounded && d > -2) o.py = Math.min(1, o.py + 0.1);
    if (!sk.grounded) o.py = sk.airTime > 1.0 ? -0.4 : 0.1;
    g.__py = o.py;
    return o;
  };
});
await page.waitForFunction(() => !window.__game.skier.grounded && window.__game.skier.airTime > 0.5, null, { timeout: 90000 }).catch(() => {});
await page.screenshot({ path: `${out}/bt-lab-jump.png` });
await page.waitForFunction(() => window.__game.skier.p.z > 480 || window.__game.state !== 'skiing', null, { timeout: 90000 }).catch(() => {});
const jumpTxt = await G(() => document.getElementById('dbg-jump').textContent);
check('jump is reported in the debug panel (TAKEOFF/POP/LANDING)', /TAKEOFF/.test(jumpTxt) && /POP/.test(jumpTxt), jumpTxt.replace(/\s+/g, ' ').slice(0, 160));
await G(() => { window.__game.autopilot = null; });

// crash -> ragdoll -> get up
await G(() => { const g = window.__game; g.respawnAt(0, true); g.skier.crash('test crash'); g.session.beginCrash(); });
await page.waitForTimeout(300);
check('crash switches to ragdoll', await G(() => window.__game.state === 'crashed'));
await page.screenshot({ path: `${out}/bt-lab-ragdoll.png` });
await page.waitForFunction(() => window.__game.crashT > 0.5 || window.__game.state === 'skiing', null, { timeout: 30000 }).catch(() => {});
await page.keyboard.press('Space');
await page.waitForFunction(() => window.__game.state === 'skiing', null, { timeout: 20000 }).catch(() => {});
check('Space gets you back up', await G(() => window.__game.state === 'skiing'));
await page.keyboard.press('Digit9');
await page.waitForFunction(() => Math.abs(window.__game.skier.p.z - 1010) < 5, null, { timeout: 20000 }).catch(() => {});
check('number keys jump to lab stations', await G(() => Math.abs(window.__game.skier.p.z - 1010) < 5));

// ---- mountain: events
await page.goto(`http://localhost:${PORT}/?mode=mountain`);
await page.waitForFunction(() => window.__game && window.__game.terrainView, null, { timeout: 90000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/bt-mountain-summit.png` });
check('mountain loads with 8 checkpoints', await G(() => window.__game.world.checkpoints.length === 8));
await G(() => { const g = window.__game; g.respawnAt(4, true); g.skier.p.z = g.world.bridge.trigger + 2; g.skier.p.x = g.world.bridge.x; });
await page.waitForTimeout(2500);
check('bridge collapses on approach', await G(() => window.__game.world.bridge.state === 'collapsing' || window.__game.state === 'crashed'));
await page.screenshot({ path: `${out}/bt-mountain-bridge.png` });
await G(() => {
  const g = window.__game;
  g.respawnAt(6, true);
  const av = g.world.avalanche;
  g.skier.place(g.world, g.world.corridorCenter(av.trigger + 3), av.trigger + 3, 0);
  g.input.override = { steer: 0, tuck: 0, brake: 1, px: 0, py: 0 };
});
await page.waitForFunction(() => window.__game.world.avalanche.state === 'running', null, { timeout: 90000 }).catch(() => {});
await page.waitForFunction(() => window.__game.world.avalanche.front > window.__game.skier.p.z - 60 || window.__game.state === 'crashed', null, { timeout: 90000 }).catch(() => {});
check('avalanche triggers in the bowl', await G(() => ['running', 'cracking', 'stopped'].includes(window.__game.world.avalanche.state)));
await page.screenshot({ path: `${out}/bt-mountain-avalanche.png` });
const fps = await G(() => window.__game.fps);
console.log(`(headless SwiftShader fps estimate: ${fps.toFixed(1)})`);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
server.kill();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
process.exit(failed ? 1 : 0);
