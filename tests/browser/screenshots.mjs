#!/usr/bin/env node
// Captures the visual-QA screenshot set into docs/screenshots/.
// Mid/late-game scenes come from real bot-played saves (headless sim),
// loaded into the production build via localStorage.
//
//   npm run build && node tests/browser/screenshots.mjs

import { mkdir } from 'node:fs/promises';
import { serveDist, launch, collectErrors } from './lib.mjs';
import { Simulation } from '../../src/core/Simulation.js';
import { AutoPlayer, runHeadless } from '../../src/core/bot/AutoPlayer.js';

const OUT = 'docs/screenshots';
await mkdir(OUT, { recursive: true });

function botSave(seed, day) {
  const sim = Simulation.newGame(seed);
  const bot = new AutoPlayer(sim, { policy: 'balanced' });
  let guard = 0;
  while (sim.state.day < day && guard++ < 200000) { bot.update(0.05); sim.step(0.05); sim.events.length = 0; }
  // Play a minute into the day so everyone is out and about.
  runHeadless(sim, bot, 50);
  sim.setInput(0, 0);
  return sim.toJSON();
}

const server = await serveDist(4182);
const browser = await launch();
const errors = [];

async function open(query, save) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  errors.push(...[]);
  const errs = collectErrors(page);
  page.errs = errs;
  if (save) await page.addInitScript((s) => { localStorage.setItem('tmg.save.v1', s); }, save);
  await page.goto(server.url + query);
  await page.waitForFunction(() => window.__TMG && window.__TMG.mode === 'play', null, { timeout: 20000 });
  return page;
}
const shoot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82 }); console.log('saved', name); };
const cam = (page, o) => page.evaluate((o) => Object.assign(window.__TMG.cam, o), o);
// Pin the camera at an exact pose (for framing); `null` restores follow-cam.
const fixCam = (page, pos, look) => page.evaluate(([pos, look]) => {
  const c = window.__TMG.cam;
  if (!pos) { delete c.update; return; }
  c.update = function () { this.camera.position.set(...pos); this.camera.lookAt(...look); };
}, [pos, look]);
const press = async (page, key = 'e') => { await page.keyboard.press(key); await page.waitForTimeout(350); };
const tp = (page, x, z, rot) => page.evaluate(([x, z, rot]) => { const p = window.__TMG.sim.state.player; p.x = x; p.z = z; p.vx = p.vz = 0; if (rot !== undefined) p.rot = rot; }, [x, z, rot]);

// 1. Starting cottage
{
  const p = await open('?test=1&seed=11');
  await cam(p, { yaw: 0.25, dist: 15, pitch: 0.55 });
  await p.waitForTimeout(2600);
  await shoot(p, '01-start-cottage');
  // 2-4: egg, incubator, hatch (scripted through the sim API)
  await p.evaluate(() => {
    const s = window.__TMG.sim;
    s.state.flags.deliveredFood = true;
    s.debug('wood', 6);
    let r = { ok: false };
    for (let i = 0; i < 20 && !r.ok; i++) r = s.place('bed', -11 + i, -1, 0);
    const bed = s.getBuilding(r.id);
    bed.progress = 0.99;
    window.__bed = { x: bed.x, z: bed.z };
    s.debug('food', 20);
  });
  const bed = await p.evaluate(() => window.__bed);
  await tp(p, bed.x, bed.z + 1.8);
  await p.keyboard.down('e'); await p.waitForTimeout(800); await p.keyboard.up('e');
  await p.evaluate(() => { window.__TMG.sim.sleep(); });
  await p.waitForFunction(() => window.__TMG.sim.state.day === 2 && window.__TMG.sim.state.phase === 'day', null, { timeout: 30000 });
  await tp(p, 0.2, -0.6, -Math.PI / 2);
  await p.evaluate(() => { const g = window.__TMG.sim.state.grandmas[0]; g.x = -3.6; g.z = -0.4; g.rot = 0.9; g.state = 'quirk'; g.quirk = 'tea'; g.anim = 'idle'; g.timer = 6; g.moving = false; });
  await fixCam(p, [-1.2, 2.3, 2.6], [-2.2, 0.3, -1.6]);
  await p.waitForTimeout(1500);
  await shoot(p, '02-grandma-egg');
  await fixCam(p, null);
  await press(p);
  await p.waitForFunction(() => !!window.__TMG.sim.state.player.egg, null, { timeout: 5000 });
  await tp(p, 5.4, -2.2, Math.PI * 0.85);
  await p.waitForTimeout(350);
  await press(p);
  await press(p);
  await fixCam(p, [8.6, 2.4, -0.2], [5.9, 0.7, -3.4]);
  await p.keyboard.down('e'); await p.waitForTimeout(600);
  await shoot(p, '03-incubator-dial');
  await p.waitForFunction(() => window.__TMG.sim.state.buildings.find((b) => b.type === 'granulator').inc.stage === 'heating', null, { timeout: 8000 });
  await p.keyboard.up('e');
  await p.waitForFunction(() => window.__TMG.sim.state.grandmas.length === 2, null, { timeout: 15000 });
  await fixCam(p, [3.2, 2.0, -0.6], [5.0, 0.6, -3.8]);
  await p.waitForTimeout(700);
  await shoot(p, '04-hatch-moment');
  await fixCam(p, null);
  errors.push(...p.errs);
  await p.close();
}

// 5-7: bot-played saves
const early = botSave(21, 4);
const mid = botSave(21, 7);
const late = botSave(21, 11);
{
  const p = await open('?test=1&continue=1', early);
  await tp(p, 0, 4);
  await cam(p, { yaw: 0.6, dist: 24, pitch: 0.75 });
  await p.waitForTimeout(3000);
  await shoot(p, '05-early-settlement');
  errors.push(...p.errs);
  await p.close();
}
{
  const p = await open('?test=1&continue=1', mid);
  const farm = await p.evaluate(() => { const b = window.__TMG.sim.state.buildings.find((b) => b.type === 'farm' || b.type === 'bigfarm'); return { x: b.x, z: b.z }; });
  await tp(p, farm.x + 4, farm.z + 6);
  await cam(p, { yaw: 0.4, dist: 13, pitch: 0.55 });
  await p.waitForTimeout(3000);
  await shoot(p, '06-grandmas-working');
  // 7. pressure: empty the pantry and pile in extra Grandmas.
  await p.evaluate(() => { const s = window.__TMG.sim; s.state.resources.food = 0; s.debug('spawn', 14); for (const g of s.state.grandmas) g.hunger = Math.max(g.hunger, 0.8); });
  await tp(p, -6, 3);
  await cam(p, { yaw: 0.2, dist: 16, pitch: 0.6 });
  await p.waitForTimeout(9000);
  await shoot(p, '07-food-bed-pressure');
  errors.push(...p.errs);
  await p.close();
}
{
  const p = await open('?test=1&continue=1', late);
  await tp(p, 0, 6);
  await cam(p, { yaw: 0.5, dist: 30, pitch: 0.72 });
  await p.waitForTimeout(3500);
  await shoot(p, '08-large-crowd');
  const n = await p.evaluate(() => window.__TMG.sim.state.grandmas.length);
  console.log('late-game population', n);
  errors.push(...p.errs);
  await p.close();
}
{
  const p = await open('?test=1&stress=300&seed=5&debug=1');
  await cam(p, { yaw: 0.3, dist: 36, pitch: 0.8 });
  await p.waitForTimeout(5000);
  await shoot(p, '09-stress-300');
  errors.push(...p.errs);
  await p.close();
}
{
  // Night + title extras.
  const p = await open('?test=1&continue=1', mid);
  await p.evaluate(() => window.__TMG.sim.sleep());
  await cam(p, { yaw: 0.5, dist: 22, pitch: 0.6 });
  await p.waitForTimeout(3500);
  await shoot(p, '10-night');
  await p.close();
  const t = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await t.goto(server.url + '?nosave=1');
  await t.waitForTimeout(2500);
  await t.screenshot({ path: `${OUT}/00-title.jpg`, type: 'jpeg', quality: 82 });
  await t.close();
}

await browser.close();
server.close();
console.log(errors.length ? 'console errors:\n' + errors.join('\n') : 'no console errors');
