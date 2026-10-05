// Screenshot helper (unique QA browser, cleaned up by this script only).
//   node tools/shot.mjs <url-query> <out.png> [waitMs] [--solve] [--w=1280 --h=800]
import { chromium } from 'playwright';
const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('=')));
const [query, out, waitMs = '2500'] = args.filter((a) => !a.startsWith('--'));
const base = process.env.BS_URL || 'http://127.0.0.1:5317/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--bowlingsmash-qa-browser', '--autoplay-policy=no-user-gesture-required'],
});
try {
  const page = await browser.newPage({ viewport: { width: +(flags.w || 1280), height: +(flags.h || 800) } });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(base + (query || ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.sim, null, { timeout: 30000 });
  await page.waitForTimeout(+waitMs);
  if (flags.solve !== undefined) {
    await page.evaluate(() => window.__game.autoSolve());
    await page.waitForTimeout(+(flags.after || 2500));
  }
  if (flags.shoot) {
    const [angle, power, spin] = flags.shoot.split(',').map(Number);
    await page.evaluate((a) => window.__game.shoot(a), { angle, power, spin: spin || 0 });
    await page.waitForTimeout(+(flags.after || 4000));
  }
  if (flags.drag) {
    const [x0, y0, x1, y1] = flags.drag.split(',').map(Number);
    await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 8 });
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: out });
  const info = await page.evaluate(() => ({ fps: Math.round(window.__game.fps), state: window.__game.sim.state, remaining: window.__game.sim.targetsRemaining }));
  console.log(JSON.stringify(info), logs.slice(0, 10).join('\n'));
} finally {
  await browser.close();
}
