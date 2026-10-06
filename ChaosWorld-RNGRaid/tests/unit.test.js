// Logic tests (Node built-in runner): node --test tests/unit.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const CW = require('../tools/load-core')();

const SLOTS = ['hero', 'weapon', 'gear'];
const STEP = 1 / 30;
function run(L, until, maxSec = 300) {
  let t = 0;
  while (!until(L) && t < maxSec) { L.update(STEP); t += STEP; }
  return t;
}
// Lobby parked in the chaos phase with everything pulled. Bots are frozen so action tests are isolated.
function chaosLobby(opts = {}, { freezeBots = true } = {}) {
  const L = new CW.Lobby({ seed: 1234, ...opts });
  L.skipPhase(); // intro/rolling → chaos with everything pulled
  if (freezeBots) for (const p of L.players) if (!p.isHuman) { p.protectDecided = true; p.nextThinkAt = Infinity; }
  run(L, () => SLOTS.every((s) => L.isRevealed(L.human, s)), 5);
  return L;
}
// V2: the lobby waits on LOADOUTS LOCKED until the human presses Continue.
function runToDone(L, maxSec = 300) {
  return run(L, () => { if (L.phase === 'locked') L.continueToRaid(); return L.phase === 'done'; }, maxSec);
}
const weaponNames = (cls, r) => CW.WEAPONS[cls][r].map((w) => w.name);
const gearNames = (r) => CW.GEAR[r].map((g) => g.name);

test('01 all three RNG pulls complete for every player', () => {
  const L = new CW.Lobby({ seed: 11 });
  run(L, () => L.phase === 'chaos');
  assert.equal(L.phase, 'chaos');
  for (const p of L.players) {
    assert.equal(p.pullsDone, 3, p.name);
    for (const s of SLOTS) { assert.ok(p.loadout[s], `${p.name} ${s}`); assert.ok(L.isRevealed(p, s)); }
  }
  // pulls happen over time, not all at once
  const spins = L.log.filter((e) => e.type === 'spin' && e.cause === 'pull');
  assert.equal(spins.length, 24);
  assert.ok(Math.max(...spins.map((e) => e.t)) - Math.min(...spins.map((e) => e.t)) > 5, 'bot rolls are staggered');
});

test('02 weapon pool always respects the hero class', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const L = new CW.Lobby({ seed });
    L.skipToBattle();
    for (const p of L.players) {
      const { hero, weapon } = p.loadout;
      assert.equal(weapon.classId, hero.classId);
      assert.ok(weaponNames(hero.classId, weapon.rarity).includes(weapon.name), `${weapon.name} not in ${hero.classId}/${weapon.rarity}`);
    }
  }
});

test('03 gear is generated from the gear table', () => {
  const L = new CW.Lobby({ seed: 5 });
  L.skipToBattle();
  for (const p of L.players) {
    assert.equal(p.loadout.gear.slot, 'gear');
    assert.ok(gearNames(p.loadout.gear.rarity).includes(p.loadout.gear.name));
  }
});

test('04 rarity odds config is valid and the roller honours it', () => {
  const total = CW.RARITIES.reduce((a, r) => a + r.weight, 0);
  assert.ok(Math.abs(total - 100) < 1e-9, 'weights sum to 100');
  CW.RARITIES.forEach((r, i) => { assert.equal(r.tier, i); assert.ok(r.weight > 0); assert.ok(r.pips === i + 1); });
  for (let i = 1; i < CW.RARITIES.length; i++) assert.ok(CW.RARITIES[i].weight < CW.RARITIES[i - 1].weight, 'rarer = less likely');
  for (const r of CW.RARITY_ORDER) { assert.ok(CW.WEAPONS.scrub[r].length); assert.ok(CW.GEAR[r].length); }
  for (const c of CW.CLASS_IDS) for (const r of CW.RARITY_ORDER) { assert.ok(CW.WEAPONS[c][r].length, `${c}/${r}`); assert.ok(CW.CLASSES[c].variants[r]); }
  const L = new CW.Lobby({ seed: 99 });
  const n = 40000, counts = {};
  for (let i = 0; i < n; i++) { const r = L.rollRarity(L.players[1]); counts[r] = (counts[r] || 0) + 1; }
  for (const r of CW.RARITIES) {
    const got = (counts[r.id] || 0) / n * 100;
    assert.ok(Math.abs(got - r.weight) < Math.max(0.8, r.weight * 0.12), `${r.id}: ${got.toFixed(2)}% vs ${r.weight}%`);
  }
});

test('05 reroll replaces exactly one slot and charges coins', () => {
  const L = chaosLobby();
  const h = L.human;
  const before = { ...h.loadout };
  const coins = h.wallet.coins;
  const r = L.reroll(h, 'gear');
  assert.ok(r.ok);
  assert.equal(h.wallet.coins, coins - CW.REROLL.baseCost);
  assert.notEqual(h.loadout.gear.uid, before.gear.uid);
  assert.equal(h.loadout.hero.uid, before.hero.uid);
  assert.equal(h.loadout.weapon.uid, before.weapon.uid);
  assert.equal(L.rerollCost(h), CW.REROLL.baseCost + CW.REROLL.costStep, 'next reroll costs more');
});

test('06 reroll is not guaranteed to improve (can get worse)', () => {
  let worse = 0, better = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const L = chaosLobby({ seed });
    const h = L.human;
    h.loadout.weapon.rarity = 'epic';
    const r = L.reroll(h, 'weapon');
    if (r.delta < 0) worse++;
    if (r.delta > 0) better++;
  }
  assert.ok(worse > 100, `worse=${worse}`);
  assert.ok(better > 0, `better=${better}`);
});

test('07 shuffle replaces the entire loadout and costs a Chaos Token', () => {
  const L = chaosLobby();
  const h = L.human;
  h.wallet.chaos = 1;
  const before = { ...h.loadout };
  const r = L.shuffle(h);
  assert.ok(r.ok);
  assert.equal(h.wallet.chaos, 0);
  for (const s of SLOTS) assert.notEqual(h.loadout[s].uid, before[s].uid, s);
  assert.equal(h.loadout.weapon.classId, h.loadout.hero.classId);
  assert.equal(L.shuffle(h).ok, false, 'no token → refused');
});

test('08 steal consumes its cost (token first, then coins)', () => {
  const L = chaosLobby();
  const h = L.human, t = L.players[1];
  h.wallet.jack = 1; const coins = h.wallet.coins;
  assert.ok(L.steal(h, t, 'gear').ok);
  assert.equal(h.wallet.jack, 0);
  assert.equal(h.wallet.coins, coins, 'token used, coins untouched');
  const L2 = chaosLobby({ seed: 77 });
  L2.human.wallet.jack = 0; L2.human.wallet.coins = 1000;
  assert.ok(L2.steal(L2.human, L2.players[2], 'gear').ok);
  assert.equal(L2.human.wallet.coins, 1000 - CW.STEAL_COST.coinAlt);
  L2.human.wallet.coins = 10;
  const c = L2.stealCheck(L2.human, L2.players[3], 'gear');
  assert.equal(c.ok, false);
});

test('09 successful steal swaps the items (forced swap, not deletion)', () => {
  const L = chaosLobby({ debug: { forceSteal: 'success' } });
  const h = L.human, t = L.players[1];
  const theirs = t.loadout.gear, mine = h.loadout.gear;
  const r = L.steal(h, t, 'gear');
  assert.ok(r.pending);
  assert.equal(h.loadout.gear, mine, 'nothing moves until the suspense resolves');
  run(L, () => !L.pending.length, 5);
  assert.equal(h.loadout.gear.uid, theirs.uid);
  assert.equal(t.loadout.gear.uid, mine.uid);
  assert.equal(h.stats.steals, 1);
  // weapons get reforged for the receiving class, keeping rarity
  const L2 = chaosLobby({ seed: 4321, debug: { forceSteal: 'success' } });
  const a = L2.human, b = L2.players.find((p) => p.loadout.hero.classId !== a.loadout.hero.classId);
  const bw = b.loadout.weapon, aw = a.loadout.weapon;
  L2.steal(a, b, 'weapon'); run(L2, () => !L2.pending.length, 5);
  assert.equal(a.loadout.weapon.rarity, bw.rarity);
  assert.equal(a.loadout.weapon.classId, a.loadout.hero.classId);
  assert.equal(b.loadout.weapon.rarity, aw.rarity);
  assert.equal(b.loadout.weapon.classId, b.loadout.hero.classId);
});

test('10 failed steal transfers nothing (but still costs)', () => {
  const L = chaosLobby({ debug: { forceSteal: 'fail' } });
  const h = L.human, t = L.players[1];
  h.wallet.jack = 2;
  const theirs = t.loadout.gear, mine = h.loadout.gear;
  L.steal(h, t, 'gear');
  run(L, () => !L.pending.length, 5);
  assert.equal(h.loadout.gear.uid, mine.uid);
  assert.equal(t.loadout.gear.uid, theirs.uid);
  assert.equal(h.wallet.jack, 1);
  assert.equal(h.stats.stealFails, 1);
  assert.ok(L.log.some((e) => e.type === 'stealResult' && !e.success));
});

test('11 steal success rate depends heavily on rarity', () => {
  const rate = (rarity) => {
    let win = 0; const n = 400;
    for (let i = 0; i < n; i++) {
      const L = chaosLobby({ seed: 10000 + i });
      const t = L.players[1];
      t.loadout.gear.rarity = rarity;
      L.human.wallet.jack = 1;
      const r = L.steal(L.human, t, 'gear');
      if (r.success) win++;
    }
    return win / n;
  };
  const c = rate('common'), e = rate('epic'), l = rate('legendary');
  assert.ok(c > e && e > l, `common ${c} epic ${e} legendary ${l}`);
  assert.ok(Math.abs(c - CW.STEAL_ODDS.common) < 0.08);
  assert.ok(Math.abs(l - CW.STEAL_ODDS.legendary) < 0.06);
});

test('12 grief downgrades exactly one tier', () => {
  for (const [from, to] of [['rare', 'common'], ['epic', 'rare'], ['legendary', 'epic'], ['mythic', 'legendary']]) {
    const L = chaosLobby({ mode: 'grief' });
    const h = L.human, t = L.players[1];
    h.wallet.grief = 1; h.wallet.coins = 1000;
    t.loadout.weapon.rarity = from;
    const coins = h.wallet.coins;
    const r = L.grief(h, t, 'weapon');
    assert.ok(r.ok, r.reason);
    run(L, () => !L.pending.length, 5);
    assert.equal(t.loadout.weapon.rarity, to);
    assert.equal(t.loadout.weapon.cracks, 1);
    const cost = CW.GRIEF_COSTS[from];
    if (cost.token) assert.equal(h.wallet.grief, 0); else assert.equal(h.wallet.coins, coins - cost.coins);
  }
  // hero grief changes the variant name but keeps the class (weapon stays legal)
  const L = chaosLobby({ mode: 'grief' });
  const t = L.players[2]; t.loadout.hero.rarity = 'legendary'; t.loadout.hero.name = CW.CLASSES[t.loadout.hero.classId].variants.legendary;
  L.grief(L.human, t, 'hero'); run(L, () => !L.pending.length, 5);
  assert.equal(t.loadout.hero.name, CW.CLASSES[t.loadout.hero.classId].variants.epic);
});

test('13 grief cannot take Common below Common', () => {
  const L = chaosLobby({ mode: 'grief' });
  const t = L.players[1];
  t.loadout.gear.rarity = 'common';
  const c = L.griefCheck(L.human, t, 'gear');
  assert.equal(c.ok, false);
  assert.equal(c.reason, 'ALREADY COMMON');
  const coins = L.human.wallet.coins;
  L.grief(L.human, t, 'gear'); run(L, () => !L.pending.length, 3);
  assert.equal(t.loadout.gear.rarity, 'common');
  assert.equal(L.human.wallet.coins, coins);
});

test('14 grief immunity + per-player limit prevent spam', () => {
  const L = chaosLobby({ mode: 'grief' });
  const h = L.human, t = L.players[1];
  h.wallet.coins = 5000;
  t.loadout.weapon.rarity = 'legendary'; t.loadout.gear.rarity = 'epic';
  assert.ok(L.grief(h, t, 'weapon').ok);
  const again = L.griefCheck(h, t, 'gear');
  assert.equal(again.ok, false); assert.equal(again.reason, 'SHIELDED', 'shield goes up immediately');
  run(L, () => !L.pending.length, 3);
  assert.equal(L.griefCheck(h, t, 'gear').reason, 'SHIELDED');
  run(L, () => t.shieldUntil <= L.time, CW.GRIEF_RULES.immunitySec + 1);
  assert.ok(L.griefCheck(h, t, 'gear').ok, 'allowed again after immunity');
  // per-lobby cap
  h.griefsUsed = CW.GRIEF_RULES.maxPerPlayer;
  assert.equal(L.griefCheck(h, L.players[3], 'gear').reason === 'NO CURSES LEFT' || L.players[3].loadout.gear.rarity === 'common', true);
  L.players[3].loadout.gear.rarity = 'epic';
  assert.equal(L.griefCheck(h, L.players[3], 'gear').reason, 'NO CURSES LEFT');
});

test('15 raid boost increases the reward multiplier', () => {
  const L = chaosLobby();
  const from = L.potX100;
  assert.ok(L.boost(L.human).ok);
  assert.equal(L.potX100, from + CW.RAID_POT.step);
  const rng = () => new CW.RNG(1);
  const a = CW.computeRewards({ won: true, potX100: 100, modeId: 'rng', rng: rng() });
  const b = CW.computeRewards({ won: true, potX100: L.potX100, modeId: 'rng', rng: rng() });
  assert.ok(b.coins > a.coins);
});

test('16 raid boost increases combat difficulty', () => {
  const m1 = CW.raidMods(100), m2 = CW.raidMods(150), m3 = CW.raidMods(200);
  assert.ok(m2.difficulty > m1.difficulty && m3.difficulty > m2.difficulty);
  assert.ok(m2.enemyHp > 0 && m2.enemyDmg > 0);
  assert.ok(m3.bossEnraged && !m2.bossEnraged);
  const L = new CW.Lobby({ seed: 3 }); L.skipToBattle();
  const hpAt = (pot) => { const b = new CW.Battle({ party: L.partySpec(), seed: 1, mods: CW.raidMods(pot), biome: CW.BIOMES[0] }); b.update(2); return b.boss.maxHp; };
  assert.ok(hpAt(150) > hpAt(100));
});

test('17 raid pot cap is respected', () => {
  const L = chaosLobby();
  L.human.wallet.coins = 100000;
  for (let i = 0; i < 30; i++) L.boost(L.human);
  assert.equal(L.potX100, CW.RAID_POT.cap);
  assert.equal(L.boostCheck(L.human).reason, 'POT MAXED');
  L.addPot(50, null, 'test');
  assert.equal(L.potX100, CW.RAID_POT.cap);
});

test('18 bots perform lobby actions on their own', () => {
  for (const mode of ['rng', 'grief']) {
    const L = new CW.Lobby({ seed: 21, mode });
    runToDone(L);
    assert.ok(L.stats.botActions >= 5, `${mode} botActions ${L.stats.botActions}`);
    const types = new Set(L.log.filter((e) => e.pid !== 'p0' && e.aid !== 'p0').map((e) => e.type));
    assert.ok(types.has('boost') || types.has('reroll'), mode);
    assert.ok(L.log.some((e) => e.type === 'chat'), 'bots talk');
    if (mode === 'grief') assert.ok(L.log.some((e) => e.type === 'grief'), 'bots grief in grief mode');
  }
});

test('19 lobby countdown hands over to the dungeon (launchNow)', () => {
  const L = new CW.Lobby({ seed: 8 });
  runToDone(L);
  assert.equal(L.phase, 'done');
  const phases = L.log.filter((e) => e.type === 'phase').map((e) => e.phase);
  assert.deepEqual(phases, ['rolling', 'chaos', 'locked', 'vote', 'launch'], 'V2: locked review + boon vote before launch');
  assert.ok(L.log.some((e) => e.type === 'launchNow'));
  const b = new CW.Battle({ party: L.partySpec(), seed: 1, mods: CW.raidMods(L.potX100), biome: L.biome });
  assert.equal(b.units.length, 8, 'all 8 lobby players enter the dungeon');
  assert.deepEqual(L.boons.length, 1, 'the vote winner rides into the battle');
});

test('20 loadout changes battle stats', () => {
  const L = new CW.Lobby({ seed: 1 });
  const hero = L.makeHero('mage', 'common');
  const base = { hero, weapon: L.makeWeapon('mage', 'common'), gear: L.makeGear('common') };
  const s0 = CW.deriveStats(base);
  const sW = CW.deriveStats({ ...base, weapon: { ...L.makeWeapon('mage', 'legendary') } });
  const sG = CW.deriveStats({ ...base, gear: L.makeGear('legendary') });
  const sH = CW.deriveStats({ ...base, hero: L.makeHero('mage', 'legendary') });
  assert.ok(sW.atk > s0.atk * 1.4, 'legendary weapon hits much harder than common');
  assert.ok(sW.crit > s0.crit);
  assert.ok(sW.fx && sW.fxChance > 0 && !s0.fx, 'legendary weapon brings a special effect');
  assert.ok(sG.hp > s0.hp && sG.def > s0.def);
  assert.ok(sH.hp > s0.hp && sH.atk > s0.atk);
  const tank = CW.deriveStats({ ...base, hero: L.makeHero('knight', 'common'), weapon: L.makeWeapon('knight', 'common') });
  assert.ok(tank.hp > s0.hp * 2 && tank.role === 'tank', 'class decides role + base HP');
  const legendStaff = CW.itemStatLines({ slot: 'weapon', rarity: 'legendary', fx: 'voidEcho', name: 'Void Staff' });
  assert.deepEqual(legendStaff, ['+35% DMG · +12% CRIT', '15% VOID ECHO']);
  // battle units carry these numbers
  L.skipToBattle();
  const b = new CW.Battle({ party: L.partySpec(), seed: 1 });
  assert.equal(b.human.maxHp, CW.deriveStats(L.human.loadout).hp);
});

test('21 dungeon can be won', () => {
  const L = new CW.Lobby({ seed: 2, debug: { forceRarity: 'legendary', forceRarityBots: true } });
  L.skipToBattle();
  const b = new CW.Battle({ party: L.partySpec(), seed: 3, mods: CW.raidMods(100), biome: CW.BIOMES[0], autoHuman: true });
  const r = b.runToEnd();
  assert.equal(r.won, true);
  assert.equal(b.boss.hp, 0, 'the boss is dead');
});

test('22 dungeon can be lost', () => {
  let lost = 0;
  for (let i = 0; i < 4; i++) {
    const L = new CW.Lobby({ seed: 50 + i, debug: { forceRarity: 'common', forceRarityBots: true } });
    L.skipToBattle();
    const b = new CW.Battle({ party: L.partySpec(), seed: 9 + i, mods: CW.raidMods(200), biome: CW.BIOMES[i % 3], autoHuman: true });
    if (!b.runToEnd().won) lost++;
  }
  assert.ok(lost >= 3, `all-common party at x2.0 should usually wipe (lost ${lost}/4)`);
  const L = new CW.Lobby({ seed: 1 }); L.skipToBattle();
  const b = new CW.Battle({ party: L.partySpec(), seed: 1 }); b.update(2); b.forceLose();
  assert.equal(b.result.won, false);
});

test('23 reward multiplier is applied (and loss pays consolation)', () => {
  const rng = () => new CW.RNG(5);
  const base = CW.ECONOMY.winBase;
  // V2: rewards are placement-based; 1st = 100% + winner bonus
  assert.equal(CW.placementReward({ won: true, place: 1, potX100: 100, modeId: 'rng', rng: rng() }).coins, base + CW.ECONOMY.mvpBonus);
  assert.equal(CW.placementReward({ won: true, place: 2, potX100: 150, modeId: 'rng', rng: rng() }).coins, Math.round(base * CW.PLACEMENT_REWARDS[1] * 1.5));
  const r2 = CW.placementReward({ won: true, place: 3, potX100: 200, modeId: 'rng', rng: rng() });
  assert.equal(r2.coins, Math.round(base * CW.PLACEMENT_REWARDS[2] * 2));
  assert.ok(r2.lines.some((l) => l.pot && l.value === Math.round(base * CW.PLACEMENT_REWARDS[2])), 'breakdown shows where the extra came from');
  const loss = CW.placementReward({ won: false, place: 1, potX100: 180, modeId: 'rng', rng: rng() });
  assert.equal(loss.coins, CW.ECONOMY.lossConsolation);
  assert.equal(loss.greedy, true, '"we got greedy" flag on juiced loss');
});

test('24 token rewards can occur', () => {
  const got = { chaos: 0, jack: 0, grief: 0 };
  for (let i = 0; i < 300; i++) {
    const r = CW.computeRewards({ won: true, potX100: 150, modeId: 'grief', rng: new CW.RNG(i + 1) });
    for (const k in got) got[k] += r.tokens[k];
  }
  assert.ok(got.chaos > 0 && got.jack > 0 && got.grief > 0, JSON.stringify(got));
  const rng = CW.computeRewards({ won: true, potX100: 200, modeId: 'rng', rng: new CW.RNG(3) });
  assert.equal(rng.tokens.grief, 0, 'grief tokens only drop in grief mode');
});

test('25 save persists across reloads', () => {
  const store = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = String(v); }, removeItem(k) { delete this.d[k]; } };
  CW.Save.storage = store;
  CW.Save.load();
  const L = new CW.Lobby({ seed: 3, wallet: CW.Save.data.wallet });
  L.skipToBattle();
  L.human.stats.steals = 2; L.human.stats.griefsDone = 1;
  const rewards = CW.computeRewards({ won: true, potX100: 140, modeId: 'grief', rng: new CW.RNG(1) });
  const coins0 = CW.Save.data.wallet.coins;
  CW.Save.recordRaid({ modeId: 'grief', won: true, potX100: 140, rewards, lobbyHuman: L.human });
  const reloaded = CW.Save.load();
  assert.equal(reloaded.stats.raidsPlayed, 1);
  assert.equal(reloaded.stats.wins, 1);
  assert.equal(reloaded.stats.steals, 2);
  assert.equal(reloaded.stats.playersGriefed, 1);
  assert.equal(reloaded.stats.highestPotCleared, 140);
  assert.equal(reloaded.wallet.coins, coins0 + rewards.coins);
  CW.Save.reset();
  assert.equal(CW.Save.load().stats.raidsPlayed, 0, 'RESET SAVE works');
  CW.Save.storage = null;
});

test('26 both game modes work end to end (logic)', () => {
  for (const mode of ['rng', 'grief']) {
    const L = new CW.Lobby({ seed: 31, mode });
    runToDone(L);
    assert.equal(L.phase, 'done');
    const b = new CW.Battle({ party: L.partySpec(), seed: 2, mods: CW.raidMods(L.potX100), biome: L.biome, autoHuman: true });
    assert.ok(b.runToEnd());
  }
  const A = chaosLobby({ mode: 'rng' });
  assert.equal(A.griefCheck(A.human, A.players[1], 'gear').reason, 'GRIEF RAID ONLY');
  const B = chaosLobby({ mode: 'grief' });
  B.players[1].loadout.gear.rarity = 'legendary';
  const c = B.stealCheck(B.human, B.players[1], 'gear');
  assert.equal(c.locked, true, 'legendary is bolted down in grief raid');
  B.players[1].loadout.gear.rarity = 'rare';
  const pot = B.potX100;
  B.human.wallet.jack = 1; B.steal(B.human, B.players[1], 'gear');
  assert.equal(B.potX100, pot + CW.MODES.grief.chaosTaxOnSteal, 'chaos feeds the pot in grief mode');
});

test('27 debug force rarity works', () => {
  const L = new CW.Lobby({ seed: 4, debug: { forceRarity: 'mythic' } });
  L.skipPhase();
  for (const s of SLOTS) assert.equal(L.human.loadout[s].rarity, 'mythic');
  assert.ok(L.players.slice(1).some((p) => p.loadout.weapon.rarity !== 'mythic'), 'bots unaffected unless asked');
  L.debug.forceRarity = 'common';
  L.human.wallet.coins = 1000;
  L.reroll(L.human, 'gear');
  assert.equal(L.human.loadout.gear.rarity, 'common', 'applies to rerolls too');
});

test('28 fast mode dramatically shortens the lobby', () => {
  const slow = new CW.Lobby({ seed: 6 }), fast = new CW.Lobby({ seed: 6, fast: true });
  const ts = runToDone(slow), tf = runToDone(fast);
  assert.ok(tf < ts * 0.3, `fast ${tf.toFixed(1)}s vs normal ${ts.toFixed(1)}s`);
});

// ---- extra regression checks
test('R1 same seed → same lobby (deterministic debug hooks)', () => {
  const a = new CW.Lobby({ seed: 77 }), b = new CW.Lobby({ seed: 77 });
  runToDone(a); runToDone(b);
  assert.deepEqual(a.players.map((p) => SLOTS.map((s) => p.loadout[s].name + p.loadout[s].rarity)), b.players.map((p) => SLOTS.map((s) => p.loadout[s].name + p.loadout[s].rarity)));
  assert.equal(a.potX100, b.potX100);
});
test('R2 heroes cannot be stolen; you cannot target yourself', () => {
  const L = chaosLobby();
  assert.equal(L.stealCheck(L.human, L.players[1], 'hero').ok, false);
  assert.equal(L.stealCheck(L.human, L.human, 'gear').ok, false);
});
test('R3 steal guard blocks immediate re-steal from the same victim', () => {
  const L = chaosLobby({ debug: { forceSteal: 'fail' } });
  L.human.wallet.jack = 3;
  L.steal(L.human, L.players[1], 'gear');
  assert.equal(L.stealCheck(L.human, L.players[1], 'weapon').reason, 'ON GUARD');
});
test('R4 hero reroll reforges the weapon to stay class-legal', () => {
  for (let seed = 1; seed < 40; seed++) {
    const L = chaosLobby({ seed });
    const w = L.human.loadout.weapon;
    L.reroll(L.human, 'hero');
    assert.equal(L.human.loadout.weapon.classId, L.human.loadout.hero.classId);
    assert.equal(L.human.loadout.weapon.rarity, w.rarity);
  }
});
test('R5 chaos phase actions are refused outside the chaos phase', () => {
  const L = new CW.Lobby({ seed: 1 });
  assert.equal(L.rerollCheck(L.human, 'gear').ok, false);
  assert.equal(L.stealCheck(L.human, L.players[1], 'gear').ok, false);
});
test('R6 every battle skill + weapon fx resolves without errors', () => {
  for (const cls of CW.CLASS_IDS) {
    const L = new CW.Lobby({ seed: 1 });
    L.skipToBattle();
    L.human.loadout.hero = L.makeHero(cls, 'legendary');
    L.human.loadout.weapon = L.makeWeapon(cls, 'mythic');
    const b = new CW.Battle({ party: L.partySpec(), seed: 4, autoHuman: true });
    assert.ok(b.runToEnd(), cls);
    assert.ok(b.human.dmg + b.human.heal > 0, cls + ' contributed');
  }
});
test('R7 debug skips still announce every player (cards must not stay hidden)', () => {
  for (const fn of ['skipPhase', 'skipToBattle']) {
    const L = new CW.Lobby({ seed: 3 });
    L[fn]();
    const joined = new Set(L.log.filter((e) => e.type === 'join').map((e) => e.pid));
    for (const p of L.players.filter((x) => !x.isHuman)) assert.ok(joined.has(p.id), `${fn}: ${p.name} never joined`);
  }
});
