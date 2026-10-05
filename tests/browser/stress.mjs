#!/usr/bin/env node
// Population stress test in the real build. For each population it loads
// ?stress=N, lets the colony run, samples FPS / frame breakdown / JS heap and
// checks AI stability (no NaN, nobody escaped the world, no runaway memory).
//
// NOTE: in this container Chromium renders WebGL with SwiftShader (CPU), so
// FPS here is a pessimistic floor; sim/crowd milliseconds are the meaningful
// CPU-side numbers. Run on a real GPU for representative FPS.
//
//   npm run build && npm run test:stress [-- 50,100,200,300 seconds]

import { serveDist, launch, collectErrors } from './lib.mjs';

const pops = (process.argv[2] || '50,100,200,300').split(',').map(Number);
const SECONDS = Number(process.argv[3] || 20);
const server = await serveDist(4181);
const browser = await launch();
const rows = [];
let failed = false;

for (const n of pops) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = collectErrors(page);
  await page.goto(`${server.url}?test=1&stress=${n}&seed=5&debug=1${process.env.EXTRA || ""}`);
  await page.waitForFunction(() => window.__TMG && window.__TMG.mode === 'play', null, { timeout: 20000 });
  // Zoom out so the whole crowd is on screen (worst case for rendering).
  await page.evaluate(() => { const c = window.__TMG.cam; c.dist = 34; c.pitch = 0.75; });
  await page.waitForTimeout(3000); // warm-up
  const samples = [];
  for (let t = 0; t < SECONDS; t += 2) {
    await page.waitForTimeout(2000);
    samples.push(await page.evaluate(() => {
      const T = window.__TMG, p = T.perf;
      if (window.gc) window.gc();
      return {
        fps: p.fps, frame: p.frameMs, sim: p.simMs, crowd: p.crowdMs || 0, render: p.renderMs,
        heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0,
        n: T.sim.state.grandmas.length,
        calls: T.r.renderer.info.render.calls,
      };
    }));
  }
  const health = await page.evaluate(() => {
    const s = window.__TMG.sim.state, H = 42 + 4;
    const bad = s.grandmas.filter((g) => !Number.isFinite(g.x) || !Number.isFinite(g.z) || Math.abs(g.x) > H || Math.abs(g.z) > H).length;
    const states = {};
    for (const g of s.grandmas) states[g.state] = (states[g.state] || 0) + 1;
    return { bad, states, day: s.day };
  });
  const avg = (k) => samples.reduce((a, s) => a + s[k], 0) / samples.length;
  const heap0 = samples[0].heap, heap1 = samples[samples.length - 1].heap;
  const row = {
    target: n, grandmas: samples.at(-1).n, fps: avg('fps').toFixed(1), minFps: Math.min(...samples.map((s) => s.fps).filter((f) => f > 0)).toFixed(1),
    frameMs: avg('frame').toFixed(1), simMs: avg('sim').toFixed(2), crowdMs: avg('crowd').toFixed(2), renderMs: avg('render').toFixed(1),
    drawCalls: samples.at(-1).calls, heapStartMB: heap0.toFixed(1), heapEndMB: heap1.toFixed(1), badAgents: health.bad, errors: errors.length,
  };
  rows.push(row);
  console.log(JSON.stringify(row), JSON.stringify(health.states));
  if (health.bad || errors.length || row.grandmas < n || heap1 - heap0 > 60) failed = true;
  if (errors.length) console.log('  errors:', errors.slice(0, 3).join(' | '));
  await page.close();
}

console.table(rows);
await browser.close();
server.close();
console.log(failed ? 'STRESS TEST FAILED' : 'STRESS TEST PASSED');
process.exit(failed ? 1 : 0);
