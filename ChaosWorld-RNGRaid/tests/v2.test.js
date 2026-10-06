// V2 logic tests (node --test tests/v2.test.js): simultaneous reels, Protect, locked review, boon votes,
// boss race ranking, battle items, placement rewards. Numbers in test names map to the V2 brief's QA list.
const test = require('node:test');
const assert = require('node:assert/strict');
const CW = require('../tools/load-core')();

const SLOTS = ['hero', 'weapon', 'gear'];
const STEP = 1 / 30;
const run = (L, until, maxSec = 300) => { let t = 0; while (!until(L) && t < maxSec) { L.update(STEP); t += STEP; } return t; };
const runToLocked = (L) => run(L, () => L.phase === 'locked');
function chaosLobby(opts = {}) {
  const L = new CW.Lobby({ seed: 77, ...opts });
  L.skipPhase();
  for (const p of L.players) if (!p.isHuman) { p.protectDecided = true; p.nextThinkAt = Infinity; }
  run(L, () => SLOTS.every((s) => L.isRevealed(L.human, s)), 5);
  return L;
}
function battle(opts = {}) {
  const L = new CW.Lobby({ seed: opts.seed || 3, debug: opts.lobbyDebug });
  L.skipToBattle();
  const b = new CW.Battle({ party: L.partySpec(), seed: opts.seed || 3, mods: CW.raidMods(opts.pot || 100), biome: CW.BIOMES[0], autoHuman: !!opts.auto, boons: opts.boons || [], debug: opts.debug || {} });
  if (opts.fight !== false) { while (b.state === 'intro') b.update(0.1); }
  return { L, b };
}
const quiet = (b) => { for (const u of b.units) { u.item = null; u.reel = null; u.itemCd = 1e9; u.holdUntil = 1e9; } b.boss.atkTimer = 1e9; };

// ------------------------------------------------------------------ lobby reels
test('V01 all 8 HERO reels start together', () => {
  const L = new CW.Lobby({ seed: 5 });
  run(L, () => L.phase === 'rolling');
  L.humanPull();
  const spins = L.log.filter((e) => e.type === 'spin' && e.slot === 'hero');
  assert.equal(spins.length, 8);
  assert.equal(new Set(spins.map((e) => e.t)).size, 1, 'same start time');
  assert.ok(spins.every((e) => e.delay === 0));
});
test('V02 hero reels land at staggered times (and Legendary+ lands last)', () => {
  const L = new CW.Lobby({ seed: 5, debug: { forceRarity: 'legendary' } });
  run(L, () => L.phase === 'rolling');
  L.humanPull();
  const lands = L.players.map((p) => p.revealAt.hero);
  assert.equal(new Set(lands.map((x) => x.toFixed(3))).size, 8, 'every reel lands at its own moment');
  assert.ok(Math.max(...lands) - Math.min(...lands) > 1.2, 'spread over more than a second');
  assert.equal(Math.max(...lands), L.human.revealAt.hero, 'the Legendary is held back to the end');
  run(L, () => L.players.every((p) => L.isRevealed(p, 'hero')), 10);
  const reveals = L.log.filter((e) => e.type === 'reveal' && e.slot === 'hero').map((e) => e.t);
  assert.equal(reveals.length, 8);
});
test('V02b "still spinning" moment is announced for the dramatic tail', () => {
  let found = false;
  for (let seed = 1; seed < 30 && !found; seed++) {
    const L = new CW.Lobby({ seed });
    run(L, () => L.phase === 'chaos');
    found = L.log.some((e) => e.type === 'lastSpinning');
  }
  assert.ok(found);
});
for (const [n, slot, round] of [['V03', 'weapon', 1], ['V04', 'gear', 2]]) {
  test(`${n} all ${slot.toUpperCase()} reels start together`, () => {
    const L = new CW.Lobby({ seed: 9 });
    run(L, () => L.round === round && L.roundState === 'waiting');
    assert.ok(L.canPull(L.human));
    L.humanPull();
    const spins = L.log.filter((e) => e.type === 'spin' && e.slot === slot);
    assert.equal(spins.length, 8);
    assert.equal(new Set(spins.map((e) => e.t)).size, 1);
    assert.ok(L.players.every((p) => p.loadout.weapon.classId === p.loadout.hero.classId));
  });
}
test('V04b idle human: rounds still auto-start (lobby never stalls)', () => {
  const L = new CW.Lobby({ seed: 2 });
  run(L, () => L.phase === 'chaos', 120);
  assert.equal(L.phase, 'chaos');
  assert.equal(L.log.filter((e) => e.type === 'autoPull').length, 3);
});

// ------------------------------------------------------------------ locked review
test('V05 final loadout review waits for the human to press Continue', () => {
  const L = new CW.Lobby({ seed: 4 });
  runToLocked(L);
  assert.equal(L.phase, 'locked');
  run(L, () => false, 90); // 90 more seconds of nothing
  assert.equal(L.phase, 'locked', 'never auto-advances');
  assert.ok(L.players.filter((p) => !p.isHuman).every((p) => p.ready), 'bots show READY');
  assert.ok(L.continueToRaid());
  assert.equal(L.phase, 'vote');
});

// ------------------------------------------------------------------ PROTECT
test('V06 Protect is offered only for Legendary/Mythic', () => {
  const L = chaosLobby();
  const h = L.human;
  h.loadout.weapon.rarity = 'epic';
  assert.equal(L.protectCheck(h, 'weapon').ok, false);
  for (const r of ['legendary', 'mythic']) { h.loadout.weapon.rarity = r; assert.ok(L.protectCheck(h, 'weapon').ok, r); }
});
test('V07 Protect consumes ALL coins', () => {
  const L = chaosLobby();
  const h = L.human;
  h.loadout.gear.rarity = 'mythic'; h.wallet.coins = 1234;
  const r = L.protect(h, 'gear');
  assert.ok(r.ok); assert.equal(r.spent, 1234); assert.equal(h.wallet.coins, 0);
  assert.equal(h.loadout.gear.protected, true);
});
test('V08 Protect locks you out of every paid lobby action', () => {
  const L = chaosLobby({ mode: 'grief' });
  const h = L.human, t = L.players[2];
  h.loadout.weapon.rarity = 'legendary';
  L.protect(h, 'weapon');
  h.wallet.coins = 5000; h.wallet.jack = 3; h.wallet.chaos = 3; // even if money appears, you're locked in
  t.loadout.gear.rarity = 'epic';
  for (const c of [L.rerollCheck(h, 'gear'), L.shuffleCheck(h), L.stealCheck(h, t, 'gear'), L.griefCheck(h, t, 'gear'), L.boostCheck(h), L.protectCheck(h, 'weapon')]) {
    assert.equal(c.ok, false); assert.match(c.reason, /LOCKED IN/);
  }
});
test('V09 Protect cuts the steal chance by PROTECTION_STEAL_MULTIPLIER', () => {
  const L = chaosLobby();
  const v = L.players[3];
  v.loadout.weapon.rarity = 'legendary'; v.wallet.coins = 500;
  const before = L.stealCheck(L.human, v, 'weapon').chance;
  L.protect(v, 'weapon');
  const after = L.stealCheck(L.human, v, 'weapon');
  assert.equal(before, CW.STEAL_ODDS.legendary);
  assert.ok(Math.abs(after.chance - CW.STEAL_ODDS.legendary * CW.PROTECTION_STEAL_MULTIPLIER) < 1e-9, `${after.chance}`);
  assert.equal(after.warded, true);
});
test('V10 a protected item can STILL be stolen (ward broken)', () => {
  // forced
  const L = chaosLobby({ debug: { forceSteal: 'success' } });
  const v = L.players[3]; v.loadout.weapon.rarity = 'legendary'; v.wallet.coins = 500; L.protect(v, 'weapon');
  const prize = v.loadout.weapon;
  L.human.wallet.jack = 1; L.steal(L.human, v, 'weapon');
  run(L, () => !L.pending.length, 5);
  const res = L.log.find((e) => e.type === 'stealResult');
  assert.equal(res.success, true); assert.equal(res.wardBroken, true);
  assert.equal(L.human.loadout.weapon.rarity, 'legendary');
  assert.equal(prize.protected, false, 'the ward is gone once broken');
  // and naturally (no forcing) it happens at roughly the reduced rate
  let wins = 0; const n = 500;
  for (let i = 0; i < n; i++) {
    const M = chaosLobby({ seed: 900 + i });
    const t = M.players[3]; t.loadout.gear.rarity = 'common'; t.wallet.coins = 100; t.loadout.gear.protected = true;
    M.human.wallet.jack = 1;
    if (M.steal(M.human, t, 'gear').success) wins++;
  }
  assert.ok(wins > 0, 'never absolute');
  assert.ok(wins / n < CW.STEAL_ODDS.common * 0.5, `protected rate ${wins / n}`);
});
test('V10b Grief Raid: a curse only breaks a ward sometimes (cost spent either way)', () => {
  let broke = 0, held = 0;
  for (let i = 0; i < 120; i++) {
    const L = chaosLobby({ seed: 300 + i, mode: 'grief' });
    const v = L.players[2]; v.loadout.weapon.rarity = 'legendary'; v.wallet.coins = 50; L.protect(v, 'weapon');
    L.human.wallet.coins = 1000;
    assert.ok(L.grief(L.human, v, 'weapon').ok);
    assert.equal(L.human.wallet.coins, 800);
    run(L, () => !L.pending.length, 3);
    if (v.loadout.weapon.rarity === 'epic') broke++; else held++;
  }
  assert.ok(broke > 0 && held > broke, `broke ${broke} held ${held}`);
});
test('V10c bots protect according to personality (Coward ≫ High Roller)', () => {
  const rate = (pers) => {
    let n = 0, yes = 0;
    for (let i = 0; i < 300; i++) {
      const L = new CW.Lobby({ seed: 4000 + i });
      L.skipPhase();
      const b = L.players.find((p) => p.personality === pers);
      b.loadout.weapon.rarity = 'legendary';
      L._botThink(b);
      n++; if (b.locked) yes++;
    }
    return yes / n;
  };
  const coward = rate('coward'), roller = rate('highroller');
  assert.ok(coward > 0.6 && roller < 0.25, `coward ${coward} highroller ${roller}`);
});

// ------------------------------------------------------------------ boon votes
test('V14 the first boon vote starts before the battle (after Continue)', () => {
  const L = new CW.Lobby({ seed: 6 });
  runToLocked(L);
  L.continueToRaid();
  const vs = L.log.find((e) => e.type === 'voteStart');
  assert.ok(vs && vs.options.length === 3);
  assert.ok(L.vote.remaining() > 9 && L.vote.remaining() <= 10, 'human gets ~10s');
  run(L, () => L.phase === 'done');
  assert.ok(L.log.findIndex((e) => e.type === 'voteEnd') < L.log.findIndex((e) => e.type === 'launchNow'));
});
test('V15 bots vote during the timer', () => {
  const L = new CW.Lobby({ seed: 6 });
  runToLocked(L); L.continueToRaid();
  run(L, () => L.vote.time > 9);
  const bots = new Set(L.log.filter((e) => e.type === 'voteCast').map((e) => e.voter));
  assert.equal(bots.size, 7);
  assert.ok(!bots.has(L.human.id));
});
test('V15b human vote counts; ties break deterministically; debug can force the result', () => {
  const rng = new CW.RNG(1);
  const voters = [{ id: 'a', isHuman: true }, { id: 'b', isHuman: false, personality: 'hype' }];
  const v = new CW.BoonVote({ rng, voters, options: ['bloodlust', 'ironSkin', 'fortune'] });
  v.botAt.b = 999; // b never gets round to it before close → votes at close
  v.vote('a', 'ironSkin');
  v.closeNow();
  assert.ok(['ironSkin', 'bloodlust', 'fortune'].includes(v.winner));
  // tie: 1-1 → same seed gives same winner
  const tie = (seed) => { const x = new CW.BoonVote({ rng: new CW.RNG(seed), voters: [{ id: 'a', isHuman: true }, { id: 'c', isHuman: true }], options: ['bloodlust', 'ironSkin', 'fortune'] }); x.vote('a', 'bloodlust'); x.vote('c', 'fortune'); x.closeNow(); return x; };
  const t1 = tie(42), t2 = tie(42);
  assert.deepEqual(t1.tied, ['bloodlust', 'fortune']); assert.equal(t1.winner, t2.winner);
  const f = new CW.BoonVote({ rng, voters, options: ['bloodlust', 'ironSkin', 'fortune'], forceResult: 'fortune' });
  f.vote('a', 'ironSkin'); f.closeNow();
  assert.equal(f.winner, 'fortune');
});
test('V16 the winning boon applies to EVERYBODY', () => {
  const { b } = battle({ boons: ['bloodlust', 'ironSkin'] });
  const { b: plain } = battle({});
  b.units.forEach((u, i) => assert.ok(Math.abs(b.aspdOf(u) - plain.aspdOf(plain.units[i]) * 1.15) < 1e-9, u.name));
  // iron skin: same hit, less damage
  quiet(b); quiet(plain);
  const u = b.units[0], v = plain.units[0];
  b.rng = new CW.RNG(1); plain.rng = new CW.RNG(1); u.dodge = v.dodge = 0;
  const hu = u.hp, hv = v.hp; b.hitRaider(u, 1, 'test'); plain.hitRaider(v, 1, 'test');
  assert.ok(hu - u.hp < hv - v.hp);
});
test('V17 the mid-boss vote triggers exactly once at ~50% HP', () => {
  const { b } = battle({ auto: true });
  b.setBossHpPct(0.51); b.update(0.05);
  assert.equal(b.state, 'fight');
  b.setBossHpPct(0.49); b.update(0.05);
  assert.equal(b.state, 'vote');
  b.vote.closeNow(); b.update(0.05);
  assert.equal(b.state, 'fight');
  b.setBossHpPct(0.3); for (let i = 0; i < 30; i++) b.update(0.05);
  assert.equal(b.startMidVote(), false);
  assert.notEqual(b.state, 'vote');
});
test('V18 the second boon applies on top of the first (and offers a different set)', () => {
  const first = ['criticalMass', 'bloodlust', 'fortune'];
  const L = new CW.Lobby({ seed: 3 }); L.skipToBattle();
  const b = new CW.Battle({ party: L.partySpec(), seed: 3, boons: ['bloodlust'], firstVoteOptions: first, debug: { forceVote: 'criticalMass' } });
  while (b.state === 'intro') b.update(0.1);
  b.setBossHpPct(0.45); b.update(0.05);
  assert.equal(b.state, 'vote');
  assert.notDeepEqual(b.vote.options.slice().sort(), first.slice().sort());
  assert.ok(!b.vote.options.includes('bloodlust'), 'already-won boon not offered again');
  b.vote.options = ['criticalMass', ...b.vote.options.filter((x) => x !== 'criticalMass').slice(0, 2)];
  b.vote.closeNow(); b.update(0.01);
  assert.deepEqual(b.boons, ['bloodlust', 'criticalMass']);
  assert.equal(b.boon('crit'), 10);
  assert.ok(b.boon('aspd') > 0);
});
test('V37 the vote pause does not corrupt battle state', () => {
  const { b } = battle({ auto: true });
  for (let i = 0; i < 90; i++) b.update(1 / 30);
  const u = b.units[2];
  b.useItem(u, null); // no-op if none
  b.giveItem(u, 'haste'); b.useItem(u);
  b.setBossHpPct(0.48);
  b.update(0.01);
  assert.equal(b.state, 'vote');
  const snap = JSON.stringify({ t: b.time, boss: b.boss.hp, hp: b.units.map((x) => x.hp), eff: b.units.map((x) => x.effects.map((e) => e.until)), cd: b.units.map((x) => x.skills.map((s) => s.cdLeft)), tg: b.telegraphs.length });
  for (let i = 0; i < 120; i++) b.update(1 / 30); // 4s of voting
  assert.equal(JSON.stringify({ t: b.time, boss: b.boss.hp, hp: b.units.map((x) => x.hp), eff: b.units.map((x) => x.effects.map((e) => e.until)), cd: b.units.map((x) => x.skills.map((s) => s.cdLeft)), tg: b.telegraphs.length }), snap, 'frozen during the vote');
  b.vote.closeNow();
  for (let i = 0; i < 60; i++) b.update(1 / 30);
  assert.equal(b.state, 'fight');
  assert.ok(b.boss.hp < b.boss.maxHp * 0.48, 'fight resumes');
});

// ------------------------------------------------------------------ race ranking
test('V11/V31 live positions rank by boss damage', () => {
  const { b } = battle({});
  b.units.forEach((u, i) => { u.dmg = (i + 1) * 1000; });
  b._rank();
  assert.deepEqual(b.standings().map((u) => u.dmg), [8000, 7000, 6000, 5000, 4000, 3000, 2000, 1000]);
  assert.equal(b.standings()[0].rank, 1);
});
test('V12 rankings update live during the battle', () => {
  const { b } = battle({ auto: true });
  let changes = 0;
  for (let i = 0; i < 30 * 30; i++) { b.update(1 / 30); for (const e of b.drain()) if (e.type === 'rankChange') changes++; if (b.state !== 'fight' && b.state !== 'vote') break; }
  assert.ok(changes > 5, `rank changes ${changes}`);
  assert.deepEqual(b.units.map((u) => u.rank).sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
});
test('V13 an overtake swaps places and announces it', () => {
  const { b } = battle({});
  b.units.forEach((u, i) => { u.dmg = 1000 - i * 10; }); b._rank(); b.drain();
  const second = b.standings()[1], first = b.standings()[0];
  second.dmg = first.dmg + 50; b._rank();
  assert.equal(second.rank, 1); assert.equal(first.rank, 2);
  const ev = b.drain();
  assert.ok(ev.some((e) => e.type === 'rankChange' && e.uid === second.id && e.from === 2 && e.to === 1));
  assert.ok(ev.some((e) => e.type === 'newLeader' && e.uid === second.id));
});
test('V32 healing does not dominate the leaderboard', () => {
  const { b } = battle({});
  const [healer, dps] = b.units;
  b.units.forEach((u) => { u.dmg = 0; u.heal = 0; });
  healer.heal = 20000; healer.dmg = 1000; dps.dmg = 3500;
  b._rank();
  assert.ok(dps.rank < healer.rank);
});
test('R-debug setHumanRank puts YOU in the requested place', () => {
  const { b } = battle({ auto: true });
  for (let i = 0; i < 300; i++) b.update(1 / 30);
  for (const n of [1, 4, 8]) { b.setHumanRank(n); assert.equal(b.human.rank, n); }
});

// ------------------------------------------------------------------ battle items
test('V19 an item reel resolves into a READY item', () => {
  const { b } = battle({});
  quiet(b);
  const h = b.human;
  assert.ok(b.startItemReel(h, 'bomb'));
  assert.equal(h.item, null);
  for (let i = 0; i < 60; i++) b.update(1 / 30);
  assert.equal(h.item, 'bomb');
  assert.ok(b.drain().some((e) => e.type === 'itemReady' && e.uid === h.id));
});
test('V20 a player holds at most ONE ready item (next reel waits)', () => {
  const { b } = battle({});
  quiet(b);
  const h = b.human;
  b.giveItem(h, 'haste'); h.itemCd = -5;
  for (let i = 0; i < 90; i++) b.update(1 / 30);
  assert.equal(h.item, 'haste'); assert.equal(h.reel, null);
  assert.equal(b.startItemReel(h), false);
  b.useItem(h); h.itemCd = 0;
  b.update(1 / 30);
  assert.ok(h.reel, 'reel starts once the slot is free');
});
test('V21 HASTE / POWER SURGE buff the user', () => {
  const { b } = battle({});
  quiet(b);
  const h = b.human, a0 = b.aspdOf(h), d0 = b.dmgMultOf(h);
  b.giveItem(h, 'haste'); b.useItem(h);
  assert.ok(Math.abs(b.aspdOf(h) - a0 * 1.4) / a0 < 0.02);
  b.giveItem(h, 'surge'); b.useItem(h);
  assert.ok(Math.abs(b.dmgMultOf(h) - (d0 + 0.35)) < 1e-9);
  for (let i = 0; i < 7 * 30; i++) b.update(1 / 30);
  assert.ok(Math.abs(b.aspdOf(h) - a0) < 1e-9, 'expires');
});
test('V22 CHAOS SHIELD blocks rival griefs and boss hits', () => {
  const { b } = battle({});
  quiet(b);
  const [a, t] = b.units;
  b.giveItem(t, 'shield'); b.useItem(t);
  for (const id of ['bomb', 'hex', 'ghost']) {
    b.giveItem(a, id); const r = b.useItem(a, t);
    assert.ok(r.ok);
    assert.equal(b.isStunned(t), false, id); assert.equal(b.has(t, 'hex'), false, id); assert.equal(t.swap, null, id);
  }
  b.giveItem(a, 'lightning'); b.useItem(a);
  assert.equal(b.isStunned(t), false);
  const hp = t.hp; assert.equal(b.hitRaider(t, 5, 'test'), 0); assert.equal(t.hp, hp);
  assert.ok(b.drain().filter((e) => e.type === 'blocked' && e.tid === t.id).length >= 4);
});
test('V23 BOMB hits the target plus 2 nearby rivals (never the thrower)', () => {
  const { b } = battle({});
  quiet(b);
  const caster = b.units[0], target = b.units[4];
  b.giveItem(caster, 'bomb');
  const r = b.useItem(caster, target);
  assert.equal(r.hit.length, 3);
  assert.ok(r.hit.includes(target.id) && !r.hit.includes(caster.id));
  const near = b.units.filter((u) => u !== caster && u !== target).sort((x, y) => Math.hypot(x.hx - target.hx, x.hy - target.hy) - Math.hypot(y.hx - target.hx, y.hy - target.hy)).slice(0, 2);
  for (const n of near) assert.ok(b.isStunned(n), n.name);
  assert.equal(b.isStunned(caster), false);
});
test('V24/V25 GHOST swaps weapons temporarily and restores both', () => {
  const { L, b } = battle({});
  quiet(b);
  const a = b.units[6], t = b.units[1];
  t.base.weapon.rarity; // lobby object
  const aW = a.base.weapon, tW = t.base.weapon;
  const aAtk = a.atk, tAtk = t.atk;
  b.giveItem(a, 'ghost');
  const r = b.useItem(a, t);
  assert.ok(r.ok);
  assert.equal(a.cur.weapon, tW); assert.equal(t.cur.weapon, aW);
  assert.equal(a.weaponKind, tW.kind, 'visual follows the swap');
  if (aW.rarity !== tW.rarity) assert.notEqual(a.atk, aAtk);
  b.giveItem(b.units[3], 'ghost'); assert.equal(b.useItem(b.units[3], a).reason, 'ALREADY SWAPPED', 'no double-swaps');
  b.units[3].item = null;
  for (let i = 0; i < (CW.GHOST_DURATION + 0.5) * 30; i++) b.update(1 / 30);
  assert.equal(a.cur.weapon, aW); assert.equal(t.cur.weapon, tW);
  assert.equal(a.swap, null); assert.equal(t.swap, null);
  assert.ok(Math.abs(a.atk - aAtk) < 1e-9 && Math.abs(t.atk - tAtk) < 1e-9, 'stats restored');
  const lobbyA = L.get(a.pid), lobbyT = L.get(t.pid);
  assert.equal(lobbyA.loadout.weapon, aW); assert.equal(lobbyT.loadout.weapon, tW);
  assert.ok(b.drain().some((e) => e.type === 'swapEnd' && e.kind === 'ghost'));
});
test('V24b SWAP CURSE trades your weakest piece for their better one', () => {
  const { b } = battle({});
  quiet(b);
  const a = b.units[0], t = b.units[1];
  a.cur.weapon = a.base.weapon = { ...a.base.weapon, rarity: 'epic' }; a.cur.gear = a.base.gear = { ...a.base.gear, rarity: 'common' };
  t.cur.gear = t.base.gear = { ...t.base.gear, rarity: 'legendary' };
  b._recalc(a); b._recalc(t);
  b.giveItem(a, 'swapCurse');
  const r = b.useItem(a, t);
  assert.equal(r.slot, 'gear');
  assert.equal(a.cur.gear.rarity, 'legendary');
  for (let i = 0; i < 9 * 30; i++) b.update(1 / 30);
  assert.equal(a.cur.gear.rarity, 'common');
});
test('V26 LIGHTNING stuns every rival but never the caster', () => {
  const { b } = battle({});
  quiet(b);
  const c = b.units[7];
  b.giveItem(c, 'lightning');
  const r = b.useItem(c);
  assert.equal(r.hit.length, 7);
  assert.equal(b.isStunned(c), false);
  for (const u of b.units) if (u !== c) assert.ok(b.isStunned(u));
  const stun = b.units[0].effects.find((e) => e.type === 'stun');
  assert.ok(Math.abs(stun.until - b.time - CW.LIGHTNING_DURATION) < 1e-6, 'duration from config');
});
test('V27 CROWN BREAKER auto-targets 1st place after a warning', () => {
  const { b } = battle({});
  quiet(b);
  b.units.forEach((u, i) => { u.dmg = 1000 - i * 50; }); b._rank();
  const leader = b.standings()[0], caster = b.standings()[4];
  b.giveItem(caster, 'crownBreaker');
  const r = b.useItem(caster);
  assert.equal(r.tid, leader.id);
  assert.ok(b.has(leader, 'crownWarn'), 'warning first');
  assert.equal(b.isStunned(leader), false);
  for (let i = 0; i < (CW.BATTLE_ITEMS.crownBreaker.warn + 0.1) * 30; i++) b.update(1 / 30);
  assert.ok(b.isStunned(leader)); assert.ok(b.has(leader, 'cursed'));
  // a leader who shields in the warning window is safe
  const { b: b2 } = battle({});
  quiet(b2);
  b2.units.forEach((u, i) => { u.dmg = 1000 - i * 50; }); b2._rank();
  const L2 = b2.standings()[0];
  b2.giveItem(b2.standings()[3], 'crownBreaker'); b2.useItem(b2.standings()[3]);
  b2.giveItem(L2, 'shield'); b2.useItem(L2);
  for (let i = 0; i < 2 * 30; i++) b2.update(1 / 30);
  assert.equal(b2.has(L2, 'cursed'), false);
});
test('V27b PURGE / MIMIC / CHAOS TONIC / HEX behave', () => {
  const { b } = battle({});
  quiet(b);
  const [a, x] = b.units;
  b.addEffect(a, 'stun', 3);
  b.giveItem(a, 'purge'); assert.equal(b.useItem(a).purged, 'stun'); assert.equal(b.isStunned(a), false);
  b.units.forEach((u, i) => { u.dmg = 1000 - i * 50; }); b._rank();
  const leader = b.standings()[0], copier = b.standings()[5];
  b.addEffect(leader, 'haste', 5, { aspd: 0.4 });
  b.giveItem(copier, 'mimic'); assert.deepEqual(b.useItem(copier).copied, ['haste']);
  assert.ok(b.has(copier, 'haste'));
  b.giveItem(x, 'tonic'); assert.ok(['haste', 'crit', 'shield', 'heal', 'surge'].includes(b.useItem(x).tonic));
  const t = b.units[3], a0 = b.aspdOf(t);
  b.giveItem(a, 'hex'); b.useItem(a, t);
  assert.ok(b.aspdOf(t) < a0 && b.dmgMultOf(t) < 1);
});
test('V28/V29 item odds depend on race position (comeback weighting)', () => {
  const { b } = battle({});
  const first = b.itemWeights(1), last = b.itemWeights(8);
  assert.equal(first.lightning, 0); assert.ok(last.lightning > 0);
  assert.ok(first.shield > last.shield);
  const strong = ['bomb', 'ghost', 'lightning', 'crownBreaker', 'swapCurse'];
  const share = (w) => strong.reduce((a, k) => a + w[k], 0) / Object.values(w).reduce((a, x) => a + x, 0);
  const shares = [1, 2, 5, 8].map((r) => share(b.itemWeights(r)));
  for (let i = 1; i < shares.length; i++) assert.ok(shares[i] > shares[i - 1], `bucket ${i}: ${shares}`);
  // strength 0 → identical odds everywhere
  assert.deepEqual(b.itemWeights(1, 0), b.itemWeights(8, 0));
  // and it's weighting, not a guarantee: last place still sometimes rolls a plain buff
  b.units.forEach((u) => (u.rank = 8));
  const rolls = new Set(); for (let i = 0; i < 400; i++) rolls.add(b.rollItem(b.units[0]));
  assert.ok(rolls.has('haste') && rolls.has('lightning'));
  // back-markers also reel faster
  assert.ok(CW.ITEM_RATE_BY_RANK[7] > CW.ITEM_RATE_BY_RANK[0]);
});
test('V30 bots use battle items on their own (and talk occasionally)', () => {
  const { b } = battle({ seed: 11 });
  const used = new Set(); let chat = 0;
  for (let i = 0; i < 60 * 30 && b.state !== 'won' && b.state !== 'lost'; i++) { b.update(1 / 30); for (const e of b.drain()) { if (e.type === 'itemUsed' && !e.human) used.add(e.item); if (e.type === 'chat') chat++; } }
  assert.ok(used.size >= 4, [...used].join());
  assert.ok(chat > 0);
});
test('V36 every battle item cleans up its temporary status', () => {
  const { b } = battle({});
  quiet(b);
  const base = b.units.map((u) => ({ atk: u.atk, aspd: b.aspdOf(u), w: u.cur.weapon, g: u.cur.gear }));
  const a = b.units[5];
  for (const id of Object.keys(CW.BATTLE_ITEMS)) {
    b.giveItem(a, id);
    const def = CW.BATTLE_ITEMS[id];
    if (a.swap) for (let i = 0; i < 10 * 30 && a.swap; i++) b.update(1 / 30); // one swap at a time
    const t = def.kind === 'target' ? b.units.find((u) => u !== a && !u.swap && !u.down) : null;
    const r = b.useItem(a, t);
    assert.ok(r.ok, `${id}: ${r.reason}`);
  }
  for (let i = 0; i < 20 * 30; i++) b.update(1 / 30);
  b.units.forEach((u, i) => {
    const ITEM_EFFECTS = ['haste', 'surge', 'shieldItem', 'stun', 'hex', 'cursed', 'crownWarn', 'crit'];
    assert.equal(u.effects.filter((e) => ITEM_EFFECTS.includes(e.type)).length, 0, `${u.name} item effects`);
    assert.equal(u.swap, null);
    assert.equal(u.cur.weapon, base[i].w); assert.equal(u.cur.gear, base[i].g);
    assert.ok(Math.abs(u.atk - base[i].atk) < 1e-9);
  });
  // ending the battle mid-swap also restores everything
  b.giveItem(a, 'ghost'); b.useItem(a, b.units[0]);
  b.forceWin();
  assert.ok(b.units.every((u) => !u.swap && u.cur.weapon === u.base.weapon && u.effects.length === 0));
});

// ------------------------------------------------------------------ boss
test('R-boss telegraphed attacks + enrage', () => {
  const { b } = battle({ auto: true });
  const seen = new Set();
  for (let i = 0; i < 40; i++) b._bossAttack();
  for (const e of b.drain()) if (e.type === 'telegraph') { seen.add(e.tg.type); assert.ok(e.tg.at > e.t, 'warning before impact'); }
  // and they resolve: raiders in the zones take damage
  const hp0 = b.units.reduce((a, u) => a + u.hp, 0);
  for (let i = 0; i < 3 * 30; i++) b.update(1 / 30);
  assert.ok(b.units.reduce((a, u) => a + u.hp, 0) < hp0);
  for (const k of ['slam', 'beam', 'roar', 'meteors']) assert.ok(seen.has(k), k);
  const { b: e } = battle({ auto: true });
  e.setBossHpPct(0.2); e.update(0.05);
  assert.ok(e.boss.enraged);
});

// ------------------------------------------------------------------ rewards / podium
test('V33/V34/V35 podium order + placement rewards (× raid pot)', () => {
  const { b } = battle({ auto: true, seed: 8 });
  b.runToEnd();
  const st = b.result.standings;
  for (let i = 1; i < st.length; i++) assert.ok(st[i - 1].dmg + 0.1 * st[i - 1].heal >= st[i].dmg + 0.1 * st[i].heal);
  const top3 = b.standings().slice(0, 3).map((u) => u.id);
  assert.deepEqual(st.slice(0, 3).map((s) => s.uid), top3);
  const rw = CW.raceRewards({ won: true, standings: st, potX100: 150, modeId: 'rng', seed: 1 });
  for (let i = 1; i < rw.length; i++) assert.ok(rw[i - 1].reward.coins >= rw[i].reward.coins, 'better place → more coins');
  rw.forEach((r, i) => {
    const expect = Math.round(CW.ECONOMY.winBase * CW.PLACEMENT_REWARDS[i] * 1.5) + (i === 0 ? CW.ECONOMY.mvpBonus : 0);
    assert.equal(r.reward.coins, expect, `place ${i + 1}`);
  });
  assert.ok(rw[0].reward.tokens.jack >= 1, 'winner gets a Jack Token');
  const flat = CW.raceRewards({ won: true, standings: st, potX100: 100, modeId: 'rng', seed: 1 });
  assert.ok(rw[3].reward.coins > flat[3].reward.coins, 'raid multiplier applies to placement rewards');
});
test('R-race awards highlight notable actions', () => {
  const { b } = battle({});
  b.units[2].tally.rivalsHit = 5; b.units[4].tally.ghostSwaps = 2; b.units[1].tally.biggestHit = 999;
  const aw = CW.raceAwards(b.units);
  assert.deepEqual(aw.map((a) => a.title), ['MOST CHAOTIC', 'THIEF', 'BIGGEST HIT']);
});
test('R-full flow: lobby → vote → race → standings, both modes, deterministic', () => {
  for (const mode of ['rng', 'grief']) {
    const go = () => {
      const L = new CW.Lobby({ seed: 31, mode });
      run(L, () => { if (L.phase === 'locked') L.continueToRaid(); return L.phase === 'done'; });
      const b = new CW.Battle({ party: L.partySpec(), seed: 2, mods: CW.raidMods(L.potX100), biome: L.biome, autoHuman: true, boons: L.boons, firstVoteOptions: L.voteOptions });
      b.runToEnd();
      return { boons: b.boons, st: b.result.standings.map((s) => s.name + s.dmg) };
    };
    const a = go(), c = go();
    assert.deepEqual(a, c, mode + ' deterministic');
    assert.equal(a.boons.length, 2, 'pre-raid + mid-fight boon');
  }
});
