// Browser smoke/feel test: starts the dev server, opens the game in headless
// Chromium (SwiftShader WebGL), drives inputs through window.__game and saves
// screenshots to ./test-output/.
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

const results = {};
const scenario = process.argv[2] || 'all';

async function open(mode) {
  await page.goto(`http://localhost:${PORT}/?mode=${mode}&debug=1`);
  await page.waitForFunction(() => window.__game && window.__game.terrainView, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
}
const drive = (o) => page.evaluate((o) => { window.__game.input.override = o; }, o);
const state = () => page.evaluate(() => {
  const g = window.__game; const s = g.skier;
  return { z: +s.p.z.toFixed(1), x: +s.p.x.toFixed(1), speed: +s.speed.toFixed(1), state: g.state, crashes: g.crashes, region: g.regionName, grounded: s.grounded, bal: +s.balance.toFixed(2), fps: g.fps };
});

if (scenario === 'all' || scenario === 'lab') {
  await open('lab');
  await page.screenshot({ path: `${out}/lab-start.png` });
  await drive({ steer: 0, tuck: 1, brake: 0, px: 0, py: 0 });
  await page.waitForTimeout(6000);
  results.labAfter6s = await state();
  await page.screenshot({ path: `${out}/lab-running.png` });
  await page.evaluate(() => window.__game.respawnAt(3, true));
  await drive({ steer: 0, tuck: 1, brake: 0, px: 0, py: 0 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${out}/lab-jump.png` });
  results.labJump = await state();
  await page.evaluate(() => window.__game.respawnAt(4, true));
  await drive({ steer: 0.3, tuck: 1, brake: 0, px: 0, py: 0 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${out}/lab-bigjump.png` });
  results.labBig = await state();
}
if (scenario === 'all' || scenario === 'mountain') {
  await open('mountain');
  await page.screenshot({ path: `${out}/mountain-start.png` });
  await drive({ steer: 0, tuck: 1, brake: 0, px: 0, py: 0 });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${out}/mountain-running.png` });
  results.mountain = await state();
}
console.log(JSON.stringify(results, null, 1));
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
server.kill();
process.exit(errors.length ? 1 : 0);
