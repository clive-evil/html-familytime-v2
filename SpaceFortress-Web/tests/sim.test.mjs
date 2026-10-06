import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSF } from './load.mjs';
const SF = loadSF();

const fresh = (o) => SF.newGame(Object.assign({ seed: 42 }, o));
const instOf = (p, type, n = 0) => p.insts.filter((i) => i.type === type)[n];
function goToSystem(g, idx) { while (g.sysIndex < idx) { for (const p of SF.curSys(g).planets) if (p.owner === 'enemy') p.owner = 'player'; SF.curSys(g).fleets = []; SF.jump(g); } }

test('new game starts in system 1 with sane stats', () => {
  const g = fresh();
  assert.equal(g.sysIndex, 0);
  assert.equal(SF.curSys(g).planets.length, 4);
  assert.equal(g.fort.power, SF.powerMax(g));
  assert.ok(g.troops > 0);
});

test('weapon costs (resources + power) are deducted', () => {
  const g = fresh();
  const varn = SF.planet(g, 'varn');
  SF.scan(g, 'varn');
  const m0 = g.res.metals, p0 = g.fort.power;
  const r = SF.fire(g, 'railgun', 'kinetic', 'varn', instOf(varn, 'cannon').id);
  assert.ok(r.ok);
  assert.equal(g.res.metals, m0 - 6);
  assert.equal(g.fort.power, p0 - 30);
});

test('cannot fire without scan, power, or resources; resources never go negative', () => {
  const g = fresh();
  const varn = SF.planet(g, 'varn');
  const cid = instOf(varn, 'cannon').id;
  assert.equal(SF.fire(g, 'railgun', 'kinetic', 'varn', cid).reason, 'SCAN REQUIRED');
  SF.scan(g, 'varn');
  g.res.metals = 3;
  assert.equal(SF.fire(g, 'railgun', 'kinetic', 'varn', cid).reason, 'INSUFFICIENT RESOURCES');
  assert.equal(g.res.metals, 3);
  g.res.metals = 100; g.fort.power = 5;
  assert.equal(SF.fire(g, 'railgun', 'kinetic', 'varn', cid).reason, 'INSUFFICIENT POWER');
  assert.equal(SF.pay(g, { metals: 1000 }), false);
  assert.ok(SF.RES.every((r) => g.res[r] >= 0));
});

test('railgun is limited to one shot per cycle until Twin Rail', () => {
  const g = fresh();
  SF.scan(g, 'varn');
  const varn = SF.planet(g, 'varn');
  SF.fire(g, 'railgun', 'kinetic', 'varn', instOf(varn, 'barracks').id);
  assert.equal(SF.weaponState(g, 'railgun').reason, 'RECHARGING');
  SF.endCycle(g);
  assert.ok(SF.weaponState(g, 'railgun').ok);
});

test('laser locked until unlocked; heat accumulates and overheats', () => {
  const g = fresh();
  assert.equal(SF.weaponState(g, 'laser').locked, true);
  g.res = { metals: 999, fissile: 999, crystals: 999, exotic: 999 };
  assert.ok(SF.buyUpgrade(g, 'laser_unlock').ok);
  g.fort.power = 999;
  SF.scan(g, 'corvin');
  const c = SF.planet(g, 'corvin');
  for (let k = 0; k < 3; k++) { const t = c.insts.find((i) => i.hp > 0); assert.ok(SF.fire(g, 'laser', 'beam', 'corvin', t.id, { guarantee: true }).ok); }
  assert.equal(g.weapons.laser.overheated, 1);
  assert.equal(SF.weaponState(g, 'laser').reason, 'OVERHEATED');
});

test('captured planets generate income; destroyed mines do not', () => {
  const g = fresh();
  const varn = SF.planet(g, 'varn');
  const base = SF.incomeOf(g).metals;
  SF.capturePlanet(g, varn);
  assert.equal(SF.incomeOf(g).metals, base + 8);
  instOf(varn, 'mine').hp = 0;
  assert.equal(SF.incomeOf(g).metals, base);
  // income actually lands at end of cycle
  const m0 = g.res.metals;
  SF.endCycle(g);
  assert.ok(g.res.metals >= m0 + base - 1e-9);
});

test('damaged mines produce proportionally; mine upgrades raise output', () => {
  const g = fresh();
  const varn = SF.planet(g, 'varn');
  SF.capturePlanet(g, varn);
  const mine = instOf(varn, 'mine');
  mine.hp = 50;
  assert.equal(SF.planetYield(varn).metals, 4);
  mine.hp = 100;
  g.res.metals = 500;
  assert.ok(SF.upgradeMine(g, 'varn', mine.id).ok);
  assert.equal(SF.planetYield(varn).metals, 8 * 1.6);
});

test('neutral worlds can be claimed without combat', () => {
  const g = fresh();
  const r = SF.claim(g, 'ossa');
  assert.ok(r.ok);
  assert.equal(SF.planet(g, 'ossa').owner, 'player');
  assert.ok(SF.incomeOf(g).crystals >= 3);
});

test('invasion forecast improves as defences are destroyed', () => {
  const g = fresh();
  goToSystem(g, 1);
  const m = SF.planet(g, 'meridian');
  const T = 25000;
  const f0 = SF.invasionForecast(g, 'meridian', T);
  instOf(m, 'cannon').hp = 0;
  const f1 = SF.invasionForecast(g, 'meridian', T);
  instOf(m, 'barracks').hp = 0;
  const f2 = SF.invasionForecast(g, 'meridian', T);
  instOf(m, 'shield').hp = 0;
  const f3 = SF.invasionForecast(g, 'meridian', T);
  assert.ok(f1.chance > f0.chance && f2.chance > f1.chance && f3.chance > f2.chance, [f0, f1, f2, f3].map((f) => f.chance).join(' '));
  assert.ok(f1.expLoss < f0.expLoss && f2.expLoss < f1.expLoss && f3.expLoss < f2.expLoss);
});

test('shield protects other installations but not the generator itself', () => {
  const g = fresh();
  goToSystem(g, 1);
  const m = SF.planet(g, 'meridian');
  m.scanned = true;
  const city = instOf(m, 'barracks'), shield = instOf(m, 'shield');
  const a = SF.attackPreview(g, 'bombard', 'barrage', 'meridian', city.id);
  assert.ok(a.shielded);
  const b = SF.attackPreview(g, 'railgun', 'kinetic', 'meridian', shield.id);
  assert.equal(b.shielded, false);
  shield.hp = 0;
  const c = SF.attackPreview(g, 'bombard', 'barrage', 'meridian', city.id);
  assert.ok(c.dmg > a.dmg * 2);
});

test('manual quality raises damage and lowers collateral', () => {
  const g = fresh();
  SF.scan(g, 'varn');
  const id = instOf(SF.planet(g, 'varn'), 'barracks').id;
  const auto = SF.attackPreview(g, 'railgun', 'kinetic', 'varn', id, null);
  const perfect = SF.attackPreview(g, 'railgun', 'kinetic', 'varn', id, 1);
  assert.ok(perfect.dmg > auto.dmg * 1.5);
  assert.ok(perfect.collat < auto.collat);
  assert.equal(perfect.hit, 1);
});

test('nukes devastate value and contaminate', () => {
  const g = fresh();
  goToSystem(g, 1);
  g.res = { metals: 999, fissile: 999, crystals: 999, exotic: 0 };
  SF.buyUpgrade(g, 'mis_smart'); SF.buyUpgrade(g, 'mis_nuke');
  const m = SF.planet(g, 'meridian'); m.scanned = true;
  instOf(m, 'interceptor').hp = 0;
  const before = SF.intactPct(m);
  const r = SF.fire(g, 'missile', 'nuke', 'meridian', instOf(m, 'barracks').id, { guarantee: true });
  assert.ok(r.ok && r.hit);
  assert.ok(m.contamination > 0.3);
  assert.ok(SF.intactPct(m) < before * 0.6, 'value ' + SF.intactPct(m));
  assert.ok(m.pop < 6.5 * 0.6);
});

test('Planet Killer locked until upgrade path is complete; firing erases all value permanently', () => {
  const g = fresh();
  goToSystem(g, 2);
  assert.equal(SF.pkState(g).locked, true);
  g.res = { metals: 2000, fissile: 2000, crystals: 2000, exotic: 2000 };
  assert.equal(SF.buyUpgrade(g, 'fort_pk').ok, false, 'requires chain');
  SF.buyUpgrade(g, 'fort_reactor'); SF.buyUpgrade(g, 'fort_modules');
  assert.ok(SF.buyUpgrade(g, 'fort_pk').ok);
  g.fort.power = SF.powerMax(g);
  const ex = g.res.exotic;
  const r = SF.firePlanetKiller(g, 'sable');
  assert.ok(r.ok);
  const s = SF.planet(g, 'sable');
  assert.equal(s.owner, 'destroyed');
  assert.equal(SF.valueOf(SF.planetYield(s)), 0);
  assert.equal(SF.intactPct(s), 0);
  assert.equal(s.pop, 0);
  assert.equal(SF.enemyGround(s), 0);
  assert.equal(g.res.exotic, ex - 40);
  assert.equal(SF.claim(g, 'sable').ok, false);
  assert.equal(SF.deploy(g, 'sable', 5000).ok, false);
  assert.equal(SF.pkState(g).ok, false, 'cooldown');
});

test('upgrades respect prerequisites and unlock content', () => {
  const g = fresh();
  g.res = { metals: 999, fissile: 999, crystals: 999, exotic: 999 };
  assert.equal(SF.upgradeState(g, 'rail_heavy'), 'locked');
  assert.equal(SF.ammoUnlocked(g, 'railgun', 'buster'), false);
  SF.buyUpgrade(g, 'rail_caps');
  assert.equal(SF.upgradeState(g, 'rail_heavy'), 'available');
  SF.buyUpgrade(g, 'rail_heavy');
  assert.ok(SF.ammoUnlocked(g, 'railgun', 'buster'));
  const p0 = SF.powerMax(g);
  SF.buyUpgrade(g, 'fort_reactor');
  assert.equal(SF.powerMax(g), p0 + 40);
  assert.equal(SF.buyUpgrade(g, 'fort_reactor').ok, false);
});

test('deploying troops removes them; capture returns survivors', () => {
  const g = fresh();
  SF.scan(g, 'varn');
  const t0 = g.troops;
  const r = SF.deploy(g, 'varn', 20000);
  assert.ok(r.ok);
  assert.equal(g.troops, t0 - 20000);
  for (let k = 0; k < 4 && SF.planet(g, 'varn').owner === 'enemy'; k++) SF.endCycle(g);
  assert.ok(g.troops > t0 - 20000);
  assert.ok(['player', 'enemy'].includes(SF.planet(g, 'varn').owner));
});

test('enemy fire damages the fortress; hull 0 loses the game', () => {
  const g = fresh();
  goToSystem(g, 3);
  g.fort.shield = 0; g.fort.hull = 5;
  SF.endCycle(g);
  assert.equal(g.over, 'lose');
});

test('tutorial can be completed through its predicates', () => {
  const g = fresh({ tutorial: true });
  const ui = { selected: null, selectedInst: null, weapon: null, mode: null, ack: false };
  const varn = SF.planet(g, 'varn');
  ui.selected = 'varn'; SF.tutorialAdvance(g, ui);
  SF.scan(g, 'varn'); SF.tutorialAdvance(g, ui);
  const cannon = instOf(varn, 'cannon');
  ui.selectedInst = cannon.id; ui.weapon = 'railgun'; ui.mode = 'manual'; SF.tutorialAdvance(g, ui);
  assert.equal(SF.TUTORIAL[g.tutorial.step].id, 'destroy');
  const r = SF.fire(g, 'railgun', 'kinetic', 'varn', cannon.id, { manual: 0.5 });
  assert.ok(r.hit && cannon.hp <= 0, 'manual shot kills tutorial cannon');
  SF.tutorialAdvance(g, ui);
  SF.deploy(g, 'varn', SF.suggestTroops(g, 'varn')); SF.tutorialAdvance(g, ui);
  for (let k = 0; k < 4 && varn.owner !== 'player'; k++) SF.endCycle(g);
  SF.tutorialAdvance(g, ui);
  assert.equal(SF.TUTORIAL[g.tutorial.step].id, 'income');
  ui.ack = true; SF.tutorialAdvance(g, ui);
  SF.buyUpgrade(g, 'rail_caps'); SF.tutorialAdvance(g, ui);
  assert.equal(g.tutorial.done, true);
});

test('campaign can be completed by the autoplayer (several strategies)', () => {
  for (const strat of ['precision', 'nuke', 'pk']) {
    const g = SF.botPlay(fresh({ seed: 7 }), strat, 200);
    assert.equal(g.over, 'win', strat + ' ended ' + g.over + ' at system ' + (g.sysIndex + 1));
    assert.equal(g.sysIndex, SF.CAMPAIGN.length - 1);
  }
});

test('save/load round-trip preserves progression mid-campaign', () => {
  const g = fresh({ seed: 9 });
  for (let k = 0; k < 12 && !g.over; k++) SF.botTurn(g, 'precision');
  const s = SF.serialize(g);
  const h = SF.deserialize(s);
  assert.deepEqual(h, g);
  // Both continue identically (deterministic RNG lives in the save).
  SF.botPlay(g, 'precision', 200); SF.botPlay(h, 'precision', 200);
  assert.equal(h.over, g.over);
  assert.equal(h.cycle, g.cycle);
  assert.throws(() => SF.deserialize('{"v":0}'));
});

test('fleets can be engaged by railgun and pay salvage', () => {
  const g = fresh();
  goToSystem(g, 1);
  SF.curSys(g).fleets.push({ id: 'x', name: 'Test Group', hp: 100, maxHp: 100, eta: 1, dmg: 10, angle: 0 });
  const m0 = g.res.metals;
  const r = SF.fire(g, 'railgun', 'kinetic', 'fleet:x', null, { manual: 1 });
  assert.ok(r.ok && r.killed.includes('fleet:x'));
  assert.equal(g.res.metals, m0 - 6 + 25);
  assert.equal(SF.fire(g, 'bombard', 'barrage', 'fleet:x', null).ok, false);
});
