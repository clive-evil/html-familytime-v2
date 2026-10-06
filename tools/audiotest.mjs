// Measures the procedural mix (RMS level + spectral centroid) in different ship states.
const { chromium } = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('file://' + process.cwd() + '/dist/ColonyShipHorror.html?autostart=1&seed=5');
await page.waitForTimeout(800);
await page.evaluate(() => { AUDIO.ctx.resume(); UI.autoPauseOn = false; G.director.update = () => {}; const an = AUDIO.ctx.createAnalyser(); an.fftSize = 2048; AUDIO.muffle.connect(an); window.__an = an; R.cam.tx = R.cam.x = 300; R.cam.ty = R.cam.y = 440; R.cam.tz = R.cam.z = 1.3; });
const measure = async (label, setup, wait = 3500) => {
  if (setup) await page.evaluate(setup);
  await page.waitForTimeout(wait);
  const r = await page.evaluate(async () => {
    const an = window.__an, td = new Float32Array(an.fftSize), fd = new Float32Array(an.frequencyBinCount); let rms = 0, n = 0, cen = 0, tot = 0;
    for (let k = 0; k < 20; k++) { an.getFloatTimeDomainData(td); for (const v of td) { rms += v * v; n++; } an.getFloatFrequencyData(fd); fd.forEach((db, i) => { const m = Math.pow(10, db / 20); cen += m * i; tot += m; }); await new Promise((r) => setTimeout(r, 60)); }
    return { rmsDb: (10 * Math.log10(rms / n + 1e-12)).toFixed(1), centroidHz: ((cen / tot) * AUDIO.ctx.sampleRate / 2048).toFixed(0) };
  });
  console.log(label.padEnd(44), 'level', r.rmsDb, 'dBFS   brightness', r.centroidHz, 'Hz');
};
await measure('ROUTINE (reactor room in view)', null, 4000);
await measure('POWER FAILURE (blackout, reactor scram)', () => { G.reactor.needsRestart = true; G.reactor.scramT = 999; G.battery = 0; G.tutCap = 0; }, 5000);
await measure('RESTORED', () => { G.reactor.needsRestart = false; G.reactor.scramT = 0; G.battery = 80; }, 5000);
await measure('BREACH in the room in view', () => { breachRoom(G.roomById.reactor, 0.6, 300); for (const c of G.crew) c.suit = 999; }, 6000);
await measure('PATCHED + repressurised', () => { G.roomById.reactor.breach = 0; G.roomById.reactor.p = 101; }, 4000);
await measure('ORGANISM in the room in view', () => { const m = spawnCreature('reactor', { inRoom: true, x: 320 }); m.mode = 'lurk'; m.timer = 99; }, 8000);
console.log(errs.join('\n') || 'no errors');
await browser.close();
