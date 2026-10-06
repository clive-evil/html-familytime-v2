const { chromium } = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));
const n = process.argv[2] || '30';
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('file://' + process.cwd() + `/dist/ColonyShipHorror.html?autostart=1&seed=5&crew=${n}`);
await page.waitForTimeout(800);
const r = await page.evaluate(async () => {
  UI.autoPauseOn = false; UI.speed = 4; G.fastForward(900);
  const t0 = performance.now(); let s = 0; for (let i = 0; i < 400; i++) simStep(0.05); s = (performance.now() - t0) / 400;
  const t1 = performance.now(); for (let i = 0; i < 60; i++) render(0.016); const rr = (performance.now() - t1) / 60;
  return { simMsPerStep: s.toFixed(3), renderMsPerFrame: rr.toFixed(2), crew: G.crew.length };
});
console.log(r, errs.join('\n') || 'no errors');
await browser.close();
