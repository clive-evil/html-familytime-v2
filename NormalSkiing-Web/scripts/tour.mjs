// Screenshot tour: teleports to each checkpoint/region, lets the skier run a
// little with a gentle autopilot and captures the view. Output: test-output/tour-*.png
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const PORT = 5198;
const mode = process.argv[2] || 'mountain';
const only = process.argv[3] ? process.argv[3].split(',').map(Number) : null;
mkdirSync('test-output', { recursive: true });
const server = spawn('node_modules/.bin/vite', ['--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((res) => server.stdout.on('data', (d) => d.toString().includes('Local') && res()));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/?mode=${mode}`);
await page.waitForFunction(() => window.__game && window.__game.terrainView, null, { timeout: 90000 });
const n = await page.evaluate(() => window.__game.world.checkpoints.length);
for (let i = 0; i < n; i++) {
  if (only && !only.includes(i)) continue;
  await page.evaluate((i) => { const g = window.__game; g.respawnAt(i, true); g.input.override = { steer: 0, tuck: 0, brake: 0, px: 0, py: 0 }; }, i);
  // let terrain chunks build
  for (let k = 0; k < 12; k++) await page.evaluate(() => window.__game.terrainView.update(window.__game.skier.p.x, window.__game.skier.p.z, 0, 1, 6));
  await page.waitForTimeout(3500);
  const st = await page.evaluate(() => ({ z: window.__game.skier.p.z, name: window.__game.world.checkpoints[window.__game.session.cpIndex].name, fps: window.__game.fps }));
  await page.screenshot({ path: `test-output/tour-${mode}-${i}.png` });
  console.log(i, st);
}
console.log('errors', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
server.kill();
process.exit(0);
