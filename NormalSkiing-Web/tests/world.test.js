// World integrity + the whole mountain can be skied by the autopilot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMountain, REGIONS } from '../src/world/mountain.js';
import { makeLab } from '../src/world/lab.js';
import { Session } from '../src/game/session.js';
import { runBot, makeBot } from '../src/sim/bot.js';
import { makeTune } from '../src/config.js';

test('mountain heights are finite and the run descends overall', () => {
  const w = makeMountain();
  let prev = Infinity;
  for (let z = 0; z <= w.length; z += 100) {
    const c = w.corridorCenter(z);
    for (let dx = -100; dx <= 100; dx += 25) assert.ok(Number.isFinite(w.height(c + dx, z)));
    const h = w.baseHeight(z);
    assert.ok(h < prev + 1, `base descends at z=${z}`);
    prev = h;
  }
  assert.ok(w.startElevation - w.endElevation > 2500, 'big vertical');
});

test('mountain has all eight regions and checkpoints in order', () => {
  const w = makeMountain();
  const names = REGIONS.map((r) => r.name);
  for (const n of ['Summit', 'Treeline', 'Cliff Road', 'Abandoned Village', 'Broken Bridge', 'Ice Field', 'Avalanche Bowl', 'Final Descent']) assert.ok(names.includes(n), n);
  for (let i = 1; i < w.checkpoints.length; i++) assert.ok(w.checkpoints[i].z > w.checkpoints[i - 1].z);
  const kinds = w.events.map((e) => e.kind);
  for (const k of ['bridge', 'avalanche', 'ice', 'cornice', 'fallingTree', 'plough', 'rockfall', 'cablecar']) assert.ok(kinds.includes(k), k);
});

test('lab: autopilot reaches the end', () => {
  const s = new Session(makeLab(), makeTune());
  const res = runBot(s, { maxTime: 600 });
  assert.ok(res.finished, `lab finished (maxZ ${res.maxZ})`);
});

test('mountain: autopilot completes the full descent', { timeout: 120000 }, () => {
  const w = makeMountain();
  const s = new Session(w, makeTune());
  const bot = makeBot({ route: (wd, z) => wd.botRoute(z), speedFor: (z, wd) => wd.botSpeed(z) });
  const res = runBot(s, { maxTime: 2400, bot });
  console.log(`    bot: ${res.runTime}s, crashes ${res.crashes}, stuck-nudges ${res.stuck.length}, maxZ ${res.maxZ}`);
  assert.ok(res.finished, `finished (maxZ ${res.maxZ})`);
});

test('bridge collapses when approached and can be reset', () => {
  const w = makeMountain();
  const s = new Session(w, makeTune());
  s.respawnAt(4, true);
  const br = w.bridge;
  assert.equal(br.state, 'intact');
  s.skier.p.z = br.trigger + 1;
  s.skier.p.x = br.x;
  for (let i = 0; i < 480; i++) w.update(1 / 240, s.skier, s);
  assert.equal(br.state, 'collapsing');
  assert.ok(br.planks.some((p) => p.dead), 'planks fell');
  assert.ok(br.planks.filter((p) => p.strip === 2).every((p) => !p.dead), 'a narrow strip remains');
  w.resetEvents(0);
  assert.equal(br.state, 'intact');
});

test('ice breaks under a slow heavy skier but not a fast one', () => {
  const w = makeMountain();
  const ice = w.iceEvent;
  const cell = ice.cells[Math.floor(ice.cells.length / 2)];
  const fake = (speed) => ({ grounded: true, crashed: null, load: 1, speed, p: { x: cell.x + 3, y: 0, z: cell.z + 3 } });
  ice.reset();
  for (let i = 0; i < 240 * 1.5; i++) ice.update(1 / 240, fake(25), w, null);
  assert.equal(cell.broken, false, 'fast skier skims');
  ice.reset();
  for (let i = 0; i < 240 * 4; i++) ice.update(1 / 240, fake(2), w, null);
  assert.equal(cell.broken, true, 'slow skier breaks through');
});

test('avalanche triggers and moves downhill', () => {
  const w = makeMountain();
  const s = new Session(w, makeTune());
  s.respawnAt(6, true);
  const av = w.avalanche;
  s.skier.p.z = av.trigger + 5;
  for (let i = 0; i < 240 * 8; i++) w.update(1 / 240, s.skier, s);
  assert.notEqual(av.state, 'waiting');
  assert.ok(av.front > av.crackZ + 50, `front moved to ${av.front.toFixed(0)}`);
});
