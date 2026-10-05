// Capture presentation screenshots at physics-timed moments.
//   node tools/capture.mjs <outDir> <levels comma> [--w=1280 --h=800]   (needs dev server or BS_URL)
import { chromium } from 'playwright';
import fs from 'node:fs';
const [outDir, lv] = process.argv.slice(2);
const flags = Object.fromEntries(process.argv.slice(4).map((a) => a.replace(/^--/, '').split('=')));
const W = +(flags.w || 1280), H = +(flags.h || 800);
const base = process.env.BS_URL || 'http://127.0.0.1:5317/';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--bowlingsmash-qa-browser'] });
try {
  for (const id of lv.split(',').map(Number)) {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.goto(`${base}?level=${id}&memsave&unlimitedlives`);
    await page.waitForFunction(() => window.__game?.sim);
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__game.ui.closeModal());
    const tag = String(id).padStart(2, '0');
    await page.screenshot({ path: `${outDir}/level${tag}-1-start.png` });
    await page.evaluate(async (strike) => { await window.__game.autoSolve(); if (strike) window.__game.autoQueue = [{ angle: 1, power: 0.7, spin: 0 }]; }, !!flags.strike);
    await page.waitForFunction(() => window.__game.sim.firstImpactStep > 0 && window.__game.sim.stepCount - window.__game.sim.firstImpactStep > 12, null, { timeout: 120000 });
    await page.screenshot({ path: `${outDir}/level${tag}-2-impact.png` });
    await page.waitForFunction(() => window.__game.sim.stepCount - window.__game.sim.firstImpactStep > 70, null, { timeout: 120000 });
    await page.screenshot({ path: `${outDir}/level${tag}-3-chaos.png` });
    await page.waitForFunction(() => window.__game.sim.state === 'won' && document.querySelector('#modal #next'), null, { timeout: 300000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${outDir}/level${tag}-4-result.png` });
    console.log('captured', id);
    await page.close();
  }
} finally { await browser.close(); }
