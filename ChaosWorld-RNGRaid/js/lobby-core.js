/* Lobby simulation — pure logic, no DOM. The UI reads state + drains `events`.
 * Time-driven: call update(dt). All delays are scaled by `k` (fast mode).
 */
(function (root) {
  'use strict';
  const CW = (root.CW = root.CW || {});
  const SLOTS = ['hero', 'weapon', 'gear'];
  CW.SLOTS = SLOTS;

  const tierOf = (rarity) => CW.RARITY[rarity].tier;
  const rarityAt = (tier) => CW.RARITY_ORDER[Math.max(0, Math.min(CW.RARITY_ORDER.length - 1, tier))];
  CW.tierOf = tierOf;
  CW.rarityAt = rarityAt;

  // Cumulative raid modifiers for a pot value (x100 int).
  CW.raidMods = function (potX100) {
    const out = { pot: potX100, mult: potX100 / 100, enemyHp: 0, enemyDmg: 0, eliteChance: CW.BATTLE.baseEliteChance, bossEnraged: false, tiers: [], label: 'NORMAL' };
    for (const m of CW.RAID_MODIFIERS) {
      if (potX100 < m.at) continue;
      if (m.enemyHp) out.enemyHp += m.enemyHp;
      if (m.enemyDmg) out.enemyDmg += m.enemyDmg;
      if (m.eliteChance) out.eliteChance = Math.max(out.eliteChance, m.eliteChance);
      if (m.bossEnraged) out.bossEnraged = true;
      if (m.at > 100) out.tiers.push(m);
      out.label = m.label;
    }
    // single number for UI/tests: how much harder than baseline
    out.difficulty = (1 + out.enemyHp) * (1 + out.enemyDmg) * (1 + (out.eliteChance - CW.BATTLE.baseEliteChance)) * (out.bossEnraged ? 1.25 : 1);
    return out;
  };
  CW.potLabel = (x100) => 'x' + (x100 / 100).toFixed(x100 % 10 === 0 ? 1 : 2);

  CW.itemLabel = (item) => (item ? `${CW.RARITY[item.rarity].name} ${item.slot === 'hero' ? CW.CLASSES[item.classId].name : item.name}`.toUpperCase() : '—');

  class Lobby {
    constructor(opts = {}) {
      this.mode = CW.MODES[opts.mode || 'rng'];
      this.seed = opts.seed >>> 0 || CW.randomSeed();
      this.rng = new CW.RNG(this.seed);
      this.debug = opts.debug || { forceRarity: null, forceRarityBots: false, forceSteal: null, forceVote: null };
      this.k = opts.fast ? CW.TIMINGS.fastScale : 1;
      this.firstSession = !!opts.firstSession;
      this.time = 0;
      this.phase = 'intro';
      this.phaseStart = 0;
      this.phaseEnd = CW.TIMINGS.intro * this.k;
      this.potX100 = CW.RAID_POT.start;
      this.round = 0;              // 0 hero · 1 weapon · 2 gear
      this.roundState = 'waiting'; // waiting (for YOU to pull) → spinning → pause
      this.roundReadyAt = 0;
      this.boons = [];             // won in the pre-raid vote, handed to the battle
      this.vote = null;
      this.events = [];
      this.log = []; // every event ever, for tests / results
      this.pending = [];
      this._uid = 1;
      this._chatGate = 0;
      this.humanTargetCd = 0;
      this.stats = { legendaryPulls: 0, steals: 0, stealFails: 0, griefs: 0, boosts: 0, botActions: 0 };
      this.biome = opts.biome ? CW.BIOMES.find((b) => b.id === opts.biome) || CW.BIOMES[0] : this.rng.pick(CW.BIOMES);
      this.players = [];
      const hp = opts.human || CW.HUMAN_PROFILE;
      this._addPlayer({ ...hp, isHuman: true, wallet: opts.wallet || { coins: CW.ECONOMY.startCoins, chaos: 1, jack: 2, grief: 1 } });
      const roster = opts.roster || CW.BOT_ROSTER;
      for (const b of roster) {
        const e = CW.ECONOMY;
        this._addPlayer({
          ...b, isHuman: false,
          wallet: {
            coins: Math.round(this.rng.range(e.botCoins[0], e.botCoins[1]) / 10) * 10,
            chaos: this.rng.int(...e.botTokens.chaos), jack: this.rng.int(...e.botTokens.jack), grief: this.rng.int(...e.botTokens.grief),
          },
        });
      }
      this.human = this.players[0];
      this.players.forEach((p, i) => {
        p.joinAt = i === 0 ? 0 : this.rng.range(0.1, CW.TIMINGS.intro * 0.85) * this.k;
      });
    }

    _addPlayer(d) {
      this.players.push({
        id: 'p' + this.players.length, idx: this.players.length, name: d.name, level: d.level, look: d.look,
        isHuman: d.isHuman, personality: d.personality || null, wallet: d.wallet,
        loadout: { hero: null, weapon: null, gear: null },
        revealAt: { hero: Infinity, weapon: Infinity, gear: Infinity },
        pullsDone: 0, nextPullAt: Infinity, idleSince: 0, joined: d.isHuman,
        griefsUsed: 0, rerollsUsed: 0, shieldUntil: 0, guardUntil: 0, nextThinkAt: Infinity,
        lastHitBy: null, chatCd: 0, status: '', statusUntil: 0,
        locked: false, protectedSlot: null, ready: false, protectDecided: false,
        stats: { steals: 0, stealFails: 0, stolenFrom: 0, griefsDone: 0, griefed: 0, boosts: 0, rerolls: 0, shuffles: 0, legendaries: 0, protects: 0, wardsBroken: 0 },
      });
    }

    // ------------------------------------------------------------ helpers
    get(pid) { return this.players.find((p) => p.id === pid); }
    emit(e) { e.t = this.time; this.events.push(e); this.log.push(e); return e; }
    drain() { const e = this.events; this.events = []; return e; }
    isRevealed(p, slot) { return p.loadout[slot] && this.time >= p.revealAt[slot]; }
    allRevealed(p) { return SLOTS.every((s) => this.isRevealed(p, s)); }
    phaseRemaining() { return Math.max(0, this.phaseEnd - this.time); }
    score(p) {
      const l = p.loadout; let s = 0;
      if (l.hero) s += tierOf(l.hero.rarity) * 1.2;
      if (l.weapon) s += tierOf(l.weapon.rarity) * 1.0;
      if (l.gear) s += tierOf(l.gear.rarity) * 0.8;
      return s;
    }
    rerollCost(p) { return CW.REROLL.baseCost + CW.REROLL.costStep * p.rerollsUsed; }
    nextBoostCost() { return CW.RAID_POT.cost; }
    setFast(on) { this.k = on ? CW.TIMINGS.fastScale : 1; }
    status(p, text, sec = 2.5) { p.status = text; p.statusUntil = this.time + sec * this.k; }
    _later(sec, fn) { this.pending.push({ at: this.time + sec, fn }); }

    // ------------------------------------------------------------ item factories
    rollRarity(p) {
      const forced = this.debug.forceRarity;
      if (forced && forced !== 'auto' && (p.isHuman || this.debug.forceRarityBots)) return forced;
      return this.rng.weighted(CW.RARITIES, (r) => r.weight).id;
    }
    pickClass() {
      const counts = {};
      for (const p of this.players) if (p.loadout.hero) counts[p.loadout.hero.classId] = (counts[p.loadout.hero.classId] || 0) + 1;
      return this.rng.weighted(CW.CLASS_IDS, (c) => 1 / (1 + 2 * (counts[c] || 0)));
    }
    makeHero(classId, rarity) {
      return { uid: this._uid++, slot: 'hero', classId, rarity, kind: classId, name: CW.CLASSES[classId].variants[rarity], cracks: 0 };
    }
    makeWeapon(classId, rarity) {
      const def = this.rng.pick(CW.WEAPONS[classId][rarity]);
      return { uid: this._uid++, slot: 'weapon', classId, rarity, name: def.name, kind: def.kind, fx: def.fx || null, cracks: 0 };
    }
    makeGear(rarity) {
      const def = this.rng.pick(CW.GEAR[rarity]);
      return { uid: this._uid++, slot: 'gear', rarity, name: def.name, kind: def.kind, mod: def.mod || null, cracks: 0 };
    }
    // A weapon landing on the wrong class gets reforged into that class's pool at the SAME rarity.
    reforge(weapon, classId) {
      if (!weapon || !classId || weapon.classId === classId) return weapon;
      const w = this.makeWeapon(classId, weapon.rarity);
      w.reforgedFrom = weapon.name; w.cracks = weapon.cracks;
      return w;
    }
    _make(p, slot, rarity) {
      if (slot === 'hero') return this.makeHero(this.pickClass(), rarity);
      if (slot === 'weapon') return this.makeWeapon(p.loadout.hero.classId, rarity);
      return this.makeGear(rarity);
    }
    _reelSec(rarity, fakeout) {
      return (CW.TIMINGS.reelMin + CW.RARITY[rarity].revealMs / 1000 + (fakeout ? 1.4 : 0)) * this.k;
    }
    _place(p, slot, item, delaySec = 0, cause = 'pull', override = null) {
      const fakeout = override ? override.fakeout : item.rarity === 'common' && this.rng.chance(CW.FAKEOUT_CHANCE);
      const dur = override ? override.dur : this._reelSec(item.rarity, fakeout) * (cause === 'pull' ? 1 : 0.75);
      p.loadout[slot] = item;
      p.revealAt[slot] = this.time + delaySec + dur;
      this.emit({ type: 'spin', pid: p.id, slot, item, dur, delay: delaySec, fakeout, cause });
      this._later(delaySec + dur, () => this._onReveal(p, slot, item, cause));
      return item;
    }

    // ------------------------------------------------------------ PULLS (simultaneous rounds)
    // YOU start each round; every player's reel for that slot spins at once and they land one by one.
    canPull(p) {
      return !!(p && p.isHuman && this.phase === 'rolling' && this.roundState === 'waiting' && this.round < 3);
    }
    pull(pid) {
      const p = typeof pid === 'string' ? this.get(pid) : pid;
      if (!this.canPull(p)) return null;
      return this.startRound();
    }
    humanPull() { return this.pull(this.human); }

    // Landing schedule: ordinary results drop in quickly in random order; Legendary+/fake-outs (and some Epics)
    // are held back to the end so the lobby watches the last reels spin.
    startRound() {
      const slot = SLOTS[this.round];
      const R = CW.ROUND_REEL;
      const results = this.players.map((p) => {
        const item = this._make(p, slot, this.rollRarity(p));
        if (slot === 'hero') p.loadout.hero = item; // so later class picks in this round spread out
        const tier = tierOf(item.rarity);
        const fakeout = tier === 0 && this.rng.chance(R.fakeoutChance);
        const drama = tier >= 3 || fakeout || (tier === 2 && this.rng.chance(R.epicDramaChance));
        return { p, item, tier, fakeout, drama, order: this.rng.next() };
      });
      const quick = results.filter((r) => !r.drama).sort((a, b) => a.order - b.order);
      const slow = results.filter((r) => r.drama).sort((a, b) => a.tier - b.tier || a.order - b.order); // biggest lands last
      let t = R.firstLand;
      quick.forEach((r, i) => { if (i) t += this.rng.range(...R.step); r.land = t; });
      if (slow.length) {
        t += this.rng.range(...R.dramaGap);
        slow.forEach((r, i) => { if (i) t += this.rng.range(...R.dramaStep); r.land = t; });
      }
      for (const r of results) {
        r.p.pullsDone = this.round + 1;
        this._place(r.p, slot, r.item, 0, 'pull', { dur: r.land * this.k, fakeout: r.fakeout });
      }
      this.roundState = 'spinning';
      this.roundEndAt = this.time + t * this.k;
      this.emit({ type: 'roundStart', round: this.round, slot, lands: results.map((r) => ({ pid: r.p.id, at: r.land * this.k })) });
      // "still spinning…" moment: when only the dramatic tail is left
      const ordered = results.slice().sort((a, b) => a.land - b.land);
      const last = ordered[ordered.length - 1], prev = ordered[ordered.length - 2];
      if (prev && last.land - prev.land >= R.lastSpinningAfter) {
        const tail = ordered.filter((r) => r.land > prev.land - 0.01 && r !== prev).concat(slow.length > 1 ? [] : []);
        this._later((prev.land + 0.15) * this.k, () => {
          const spinning = this.players.filter((p) => this.time < p.revealAt[slot]);
          if (!spinning.length) return;
          this.emit({ type: 'lastSpinning', slot, pids: spinning.map((p) => p.id) });
          for (const o of this.players) if (!spinning.includes(o)) this.emote(o, 'look', spinning[0].id);
          this._crowdSay(spinning[0], 'lastReel', {}, 1, 0.8);
        });
        void tail;
      }
      return results.find((r) => r.p.isHuman).item;
    }

    _onReveal(p, slot, item, cause) {
      if (p.loadout[slot] !== item) return; // replaced mid-spin
      const r = CW.RARITY[item.rarity];
      this.emit({ type: 'reveal', pid: p.id, slot, item, cause });
      if (r.tier >= 3) {
        p.stats.legendaries++;
        this.stats.legendaryPulls++;
        this.emit({ type: 'bigPull', pid: p.id, slot, item });
        this.status(p, r.tier === 4 ? 'CHAOS!!' : 'LEGENDARY!', 4);
        this.emote(p, 'cheer');
        for (const o of this.players) if (o !== p) this.emote(o, this.rng.chance(0.5) ? 'shock' : 'look', p.id);
        if (!p.isHuman) this.say(p, 'selfLegend', { i: item.name }, true);
        this._crowdSay(p, 'otherLegend', { t: p.name }, 2);
      } else if (r.tier === 0) {
        if (slot === 'gear') this.status(p, 'WELP.', 3);
        else if (p.pullsDone >= 3 && this.score(p) < 1.5) this.status(p, 'WELP.', 3);
        if (!p.isHuman) {
          if (item.name === 'Sandals') this._crowdSay(p, 'sandals', { t: p.name }, 1, 0.9);
          else if (this.rng.chance(0.3)) this.say(p, 'selfCommon');
          if (this.rng.chance(0.35)) this.emote(p, 'sad');
        } else if (this.rng.chance(0.5)) this._crowdSay(p, item.name === 'Sandals' ? 'sandals' : 'otherCommon', { t: p.name }, 1, 0.6);
      } else if (r.tier === 2) {
        this.emote(p, 'cheer');
        this.status(p, 'EPIC', 2.5);
      } else if (p.pullsDone >= 3 && !p.isHuman && this.time >= p.revealAt.gear) {
        this.status(p, 'READY', 30);
      }
      if (!p.isHuman && p.pullsDone >= 3 && slot === 'gear' && r.tier > 0 && r.tier < 3) this.status(p, 'READY', 30);
    }

    // ------------------------------------------------------------ CHAOS ACTIONS
    inFlight(item) { return !!(item && item._busy); }
    static get LOCKED() { return { ok: false, reason: 'LOCKED IN (PROTECTED)', lockedIn: true }; }

    // PROTECT: ward one Legendary/Mythic item. Costs ALL your coins and ends your lobby manipulation.
    protectCheck(p, slot) {
      if (this.phase !== 'chaos') return { ok: false, reason: 'NOT NOW' };
      if (p.locked) return Lobby.LOCKED;
      const item = p.loadout[slot];
      if (!item || !this.isRevealed(p, slot) || this.inFlight(item)) return { ok: false, reason: 'BUSY' };
      if (!CW.PROTECT.eligible.includes(item.rarity)) return { ok: false, reason: 'LEGENDARY+ ONLY' };
      if (p.wallet.coins < CW.PROTECT.minCoins) return { ok: false, reason: 'NO COINS TO SPEND' };
      return { ok: true, cost: p.wallet.coins, item };
    }
    protect(pid, slot) {
      const p = typeof pid === 'string' ? this.get(pid) : pid;
      const chk = this.protectCheck(p, slot);
      if (!chk.ok) { this.emit({ type: 'denied', pid: p.id, action: 'protect', reason: chk.reason }); return chk; }
      p.wallet.coins = 0;
      p.locked = true;
      p.protectedSlot = slot;
      chk.item.protected = true;
      p.stats.protects++;
      this.emit({ type: 'protect', pid: p.id, slot, item: chk.item, spent: chk.cost });
      this.status(p, 'WARDED', 30);
      this.emote(p, 'cheer');
      if (!p.isHuman) this.say(p, 'protect', {}, true);
      this._crowdReact(p, 'look', 0.5);
      return { ok: true, spent: chk.cost };
    }

    rerollCheck(p, slot) {
      if (this.phase !== 'chaos') return { ok: false, reason: 'NOT NOW' };
      if (p.locked) return Lobby.LOCKED;
      const item = p.loadout[slot];
      if (!item || !this.isRevealed(p, slot) || this.inFlight(item)) return { ok: false, reason: 'BUSY' };
      const cost = this.rerollCost(p);
      if (p.wallet.coins < cost) return { ok: false, reason: 'NEED ' + cost + ' COINS', cost };
      return { ok: true, cost };
    }
    reroll(pid, slot) {
      const p = typeof pid === 'string' ? this.get(pid) : pid;
      const chk = this.rerollCheck(p, slot);
      if (!chk.ok) { this.emit({ type: 'denied', pid: p.id, action: 'reroll', reason: chk.reason }); return chk; }
      p.wallet.coins -= chk.cost;
      p.rerollsUsed++; p.stats.rerolls++;
      const old = p.loadout[slot];
      let item;
      if (slot === 'hero') {
        item = this.makeHero(this.pickClass(), this.rollRarity(p));
        // the weapon follows the new class (same rarity, reforged)
        const w = p.loadout.weapon;
        if (w && w.classId !== item.classId) { p.loadout.weapon = this.reforge(w, item.classId); this.emit({ type: 'reforge', pid: p.id, slot: 'weapon', item: p.loadout.weapon, from: w }); }
      } else item = this._make(p, slot, this.rollRarity(p));
      this._place(p, slot, item, 0.35 * this.k, 'reroll');
      const delta = tierOf(item.rarity) - tierOf(old.rarity);
      this.emit({ type: 'reroll', pid: p.id, slot, old, item, delta, cost: chk.cost });
      if (!p.isHuman) this.say(p, 'reroll');
      this._later(0.35 * this.k + this._reelSec(item.rarity) * 0.75 + 0.05, () => {
        if (delta < 0) { this.emote(p, 'sad'); if (!p.isHuman) this.say(p, 'rerollWorse', {}, true); else this._crowdSay(p, 'otherCommon', { t: p.name }, 1, 0.5); }
      });
      return { ok: true, old, item, delta, cost: chk.cost };
    }

    shuffleCheck(p) {
      if (this.phase !== 'chaos') return { ok: false, reason: 'NOT NOW' };
      if (p.locked) return Lobby.LOCKED;
      if (SLOTS.some((s) => !this.isRevealed(p, s) || this.inFlight(p.loadout[s]))) return { ok: false, reason: 'BUSY' };
      if ((p.wallet[CW.SHUFFLE.token] || 0) < CW.SHUFFLE.amount) return { ok: false, reason: 'NEED A CHAOS TOKEN' };
      return { ok: true };
    }
    shuffle(pid) {
      const p = typeof pid === 'string' ? this.get(pid) : pid;
      const chk = this.shuffleCheck(p);
      if (!chk.ok) { this.emit({ type: 'denied', pid: p.id, action: 'shuffle', reason: chk.reason }); return chk; }
      p.wallet[CW.SHUFFLE.token] -= CW.SHUFFLE.amount;
      p.stats.shuffles++;
      const old = { ...p.loadout };
      const hero = this.makeHero(this.pickClass(), this.rollRarity(p));
      p.loadout.hero = hero; // so weapon pool uses new class
      const weapon = this.makeWeapon(hero.classId, this.rollRarity(p));
      const gear = this.makeGear(this.rollRarity(p));
      p.loadout.hero = old.hero; // _place will set each
      this._place(p, 'hero', hero, 0.3 * this.k, 'shuffle');
      this._place(p, 'weapon', weapon, 0.9 * this.k, 'shuffle');
      this._place(p, 'gear', gear, 1.5 * this.k, 'shuffle');
      const delta = this.scoreOf({ hero, weapon, gear }) - this.scoreOf(old);
      this.emit({ type: 'shuffle', pid: p.id, old, items: { hero, weapon, gear }, delta });
      if (!p.isHuman) this.say(p, 'shuffle', {}, true);
      this._crowdReact(p, 'look');
      return { ok: true, old, items: { hero, weapon, gear }, delta };
    }
    scoreOf(l) { return this.score({ loadout: l }); }

    stealCheck(actor, target, slot) {
      if (this.phase !== 'chaos') return { ok: false, reason: 'NOT NOW' };
      if (!target || actor === target) return { ok: false, reason: 'NO TARGET' };
      if (actor.locked) return Lobby.LOCKED;
      if (!CW.STEAL_RULES.stealableSlots.includes(slot)) return { ok: false, reason: "CAN'T STEAL A HERO" };
      const item = target.loadout[slot];
      if (!item || !this.isRevealed(target, slot) || this.inFlight(item) || this.inFlight(actor.loadout[slot]) || !this.isRevealed(actor, slot)) return { ok: false, reason: 'TOO LATE — MID-ACTION' };
      if (this.mode.unstealable.includes(item.rarity)) return { ok: false, reason: 'BOLTED DOWN', locked: true, chance: 0 };
      if (target.guardUntil > this.time) return { ok: false, reason: 'ON GUARD', chance: CW.STEAL_ODDS[item.rarity] };
      const warded = !!item.protected;
      const chance = CW.STEAL_ODDS[item.rarity] * (warded ? CW.PROTECTION_STEAL_MULTIPLIER : 1);
      const c = CW.STEAL_COST;
      let pay = null;
      if ((actor.wallet[c.token] || 0) >= c.amount) pay = c.token;
      else if (actor.wallet.coins >= c.coinAlt) pay = 'coins';
      if (!pay) return { ok: false, reason: 'NEED JACK TOKEN / ' + c.coinAlt + ' COINS', chance };
      return { ok: true, chance, pay, costLabel: pay === 'coins' ? c.coinAlt + ' COINS' : c.amount + ' JACK TOKEN', item, warded, baseChance: CW.STEAL_ODDS[item.rarity] };
    }
    steal(aid, tid, slot) {
      const a = typeof aid === 'string' ? this.get(aid) : aid;
      const t = typeof tid === 'string' ? this.get(tid) : tid;
      const chk = this.stealCheck(a, t, slot);
      if (!chk.ok) { this.emit({ type: 'denied', pid: a.id, action: 'steal', reason: chk.reason }); return chk; }
      if (chk.pay === 'coins') a.wallet.coins -= CW.STEAL_COST.coinAlt; else a.wallet[chk.pay] -= CW.STEAL_COST.amount;
      const item = t.loadout[slot];
      const mine = a.loadout[slot];
      item._busy = mine._busy = true;
      let roll = this.rng.next();
      // debug force keeps the dial honest: the needle lands inside the matching zone
      if (this.debug.forceSteal === 'success') roll = roll * chk.chance * 0.98;
      if (this.debug.forceSteal === 'fail') roll = chk.chance + (1 - chk.chance) * (0.02 + roll * 0.96);
      const success = roll < chk.chance;
      const dur = CW.STEAL_RULES.suspenseSec * this.k;
      t.guardUntil = this.time + dur + CW.STEAL_RULES.guardSec * this.k;
      if (t.isHuman || a.isHuman) this.humanTargetCd = this.time + dur + 4 * this.k;
      this.emit({ type: 'stealStart', aid: a.id, tid: t.id, slot, item, chance: chk.chance, roll, success, dur, pay: chk.pay, warded: chk.warded });
      this.emote(a, 'sneak', t.id);
      this.status(a, 'STEALING…', dur / this.k + 0.3);
      if (this.mode.chaosTaxOnSteal) this.addPot(this.mode.chaosTaxOnSteal, a, 'steal');
      this._later(dur, () => this._resolveSteal(a, t, slot, item, mine, success, chk.chance));
      return { ok: true, pending: true, success, chance: chk.chance, pay: chk.pay };
    }
    _resolveSteal(a, t, slot, item, mine, success, chance) {
      item._busy = mine._busy = false;
      if (success) {
        const wardBroken = !!item.protected;
        if (wardBroken) { item.protected = false; t.stats.wardsBroken++; t.protectedSlot = null; }
        const got = slot === 'weapon' ? this.reforge(item, a.loadout.hero.classId) : item;
        const gave = slot === 'weapon' ? this.reforge(mine, t.loadout.hero.classId) : mine;
        a.loadout[slot] = got; t.loadout[slot] = gave;
        a.revealAt[slot] = t.revealAt[slot] = this.time;
        a.stats.steals++; t.stats.stolenFrom++; this.stats.steals++;
        t.lastHitBy = a.id;
        this.emit({ type: 'stealResult', aid: a.id, tid: t.id, slot, success: true, item: got, original: item, gave, chance, wardBroken });
        if (wardBroken) { this.emote(t, 'panic', a.id); this._crowdReact(t, 'shock', 0.9); if (!t.isHuman) this._later(0.3 * this.k, () => this.say(t, 'wardBroken', {}, true)); }
        this.status(a, 'YOINK', 3); this.status(t, 'ROBBED', 3);
        this.emote(a, 'cheer'); this.emote(t, 'angry', a.id);
        if (!a.isHuman) this.say(a, 'stealWin', { t: t.name }, true);
        if (!t.isHuman) this._later(0.5 * this.k, () => this.say(t, 'stolenFrom', { t: a.name }, true));
        this._crowdReact(a, 'laugh', 0.4);
      } else {
        a.stats.stealFails++; this.stats.stealFails++;
        t.lastHitBy = a.id;
        this.emit({ type: 'stealResult', aid: a.id, tid: t.id, slot, success: false, item, chance });
        this.status(a, 'BUSTED', 3);
        this.emote(a, 'sad'); this.emote(t, 'taunt', a.id);
        if (!t.isHuman) this.say(t, 'stealBlocked', { t: a.name }, true);
        if (!a.isHuman && this.rng.chance(0.5)) this._later(0.8 * this.k, () => this.say(a, 'stealLose', { t: t.name }));
        this._crowdReact(t, 'laugh', 0.5);
      }
    }

    griefCheck(actor, target, slot) {
      if (!this.mode.grief) return { ok: false, reason: 'GRIEF RAID ONLY' };
      if (this.phase !== 'chaos') return { ok: false, reason: 'NOT NOW' };
      if (!target || actor === target) return { ok: false, reason: 'NO TARGET' };
      if (actor.locked) return Lobby.LOCKED;
      const item = target.loadout[slot];
      if (!item || !this.isRevealed(target, slot) || this.inFlight(item)) return { ok: false, reason: 'BUSY' };
      if (tierOf(item.rarity) === 0) return { ok: false, reason: 'ALREADY COMMON' };
      if (target.shieldUntil > this.time) return { ok: false, reason: 'SHIELDED', shield: target.shieldUntil - this.time };
      const max = actor.isHuman ? CW.GRIEF_RULES.maxPerPlayer : Math.min(CW.GRIEF_RULES.botMaxPerPlayer, (CW.BOT_PERSONALITIES[actor.personality] || {}).griefMax ?? 1) + (actor.lastHitBy && (CW.BOT_PERSONALITIES[actor.personality] || {}).revenge ? 1 : 0);
      if (actor.griefsUsed >= max) return { ok: false, reason: 'NO CURSES LEFT' };
      const cost = CW.GRIEF_COSTS[item.rarity];
      if (cost.token) {
        if ((actor.wallet[cost.token] || 0) < cost.amount) return { ok: false, reason: 'NEED GRIEF TOKEN', cost };
      } else if (actor.wallet.coins < cost.coins) return { ok: false, reason: 'NEED ' + cost.coins + ' COINS', cost };
      const to = rarityAt(tierOf(item.rarity) - 1);
      return { ok: true, cost, costLabel: cost.token ? cost.amount + ' GRIEF TOKEN' : cost.coins + ' COINS', from: item.rarity, to, item, left: max - actor.griefsUsed, warded: !!item.protected, passChance: item.protected ? CW.PROTECT.griefPassChance : 1 };
    }
    grief(aid, tid, slot) {
      const a = typeof aid === 'string' ? this.get(aid) : aid;
      const t = typeof tid === 'string' ? this.get(tid) : tid;
      const chk = this.griefCheck(a, t, slot);
      if (!chk.ok) { this.emit({ type: 'denied', pid: a.id, action: 'grief', reason: chk.reason }); return chk; }
      if (chk.cost.token) a.wallet[chk.cost.token] -= chk.cost.amount; else a.wallet.coins -= chk.cost.coins;
      a.griefsUsed++;
      const item = t.loadout[slot];
      item._busy = true;
      // shield goes up immediately so two griefers can't double-tap the same victim
      const dur = CW.GRIEF_RULES.resolveSec * this.k;
      t.shieldUntil = this.time + dur + CW.GRIEF_RULES.immunitySec * this.k;
      if (t.isHuman || a.isHuman) this.humanTargetCd = this.time + dur + 4 * this.k;
      const passes = !chk.warded || this.rng.chance(chk.passChance);
      this.emit({ type: 'griefStart', aid: a.id, tid: t.id, slot, item, dur, warded: chk.warded });
      this.emote(a, 'cast', t.id);
      this._later(dur, () => {
        item._busy = false;
        if (!passes) {
          this.emit({ type: 'griefBlocked', aid: a.id, tid: t.id, slot, item });
          this.status(t, 'WARD HELD', 2.5);
          this.emote(t, 'taunt', a.id);
          return;
        }
        if (item.protected) { item.protected = false; t.protectedSlot = null; t.stats.wardsBroken++; this.emit({ type: 'wardBroken', aid: a.id, tid: t.id, slot, item, by: 'grief' }); }
        const from = item.rarity;
        item.rarity = chk.to;
        item.cracks++;
        if (item.slot === 'hero') item.name = CW.CLASSES[item.classId].variants[item.rarity];
        a.stats.griefsDone++; t.stats.griefed++; this.stats.griefs++;
        t.lastHitBy = a.id;
        this.emit({ type: 'grief', aid: a.id, tid: t.id, slot, item, from, to: item.rarity });
        this.status(t, 'CURSED', 3);
        this.emote(t, 'angry', a.id);
        if (!t.isHuman) this._later(0.4 * this.k, () => this.say(t, 'griefed', { t: a.name, i: item.name }, true));
        if (!a.isHuman && this.rng.chance(0.6)) this._later(1.1 * this.k, () => this.say(a, 'grieferGloat'));
        this._crowdReact(a, 'laugh', 0.4);
        if (this.mode.chaosTaxOnGrief) this.addPot(this.mode.chaosTaxOnGrief, a, 'grief');
      });
      return { ok: true, pending: true, from: chk.from, to: chk.to };
    }

    boostCheck(p) {
      if (this.phase !== 'chaos' && this.phase !== 'rolling') return { ok: false, reason: 'NOT NOW' };
      if (p.locked) return Lobby.LOCKED;
      if (this.potX100 >= CW.RAID_POT.cap) return { ok: false, reason: 'POT MAXED' };
      const cost = this.nextBoostCost();
      if (p.wallet.coins < cost) return { ok: false, reason: 'NEED ' + cost + ' COINS', cost };
      return { ok: true, cost };
    }
    boost(pid) {
      const p = typeof pid === 'string' ? this.get(pid) : pid;
      const chk = this.boostCheck(p);
      if (!chk.ok) { this.emit({ type: 'denied', pid: p.id, action: 'boost', reason: chk.reason }); return chk; }
      p.wallet.coins -= chk.cost;
      p.stats.boosts++; this.stats.boosts++;
      const from = this.potX100;
      this.addPot(CW.RAID_POT.step, p, 'boost');
      this.emit({ type: 'boost', pid: p.id, from, to: this.potX100, cost: chk.cost });
      if (!p.isHuman && this.rng.chance(0.5)) this.say(p, 'boost');
      this.emote(p, 'cheer');
      for (const o of this.players) {
        if (o === p) continue;
        const per = CW.BOT_PERSONALITIES[o.personality];
        if (per && this.potX100 > per.boostCeil) { this.emote(o, 'panic', p.id); if (this.rng.chance(0.4)) this.say(o, 'boostPanic'); }
        else if (this.rng.chance(0.35)) this.emote(o, this.potX100 >= 170 ? 'panic' : 'cheer');
      }
      return { ok: true, from, to: this.potX100, cost: chk.cost };
    }
    addPot(amount, p, reason) {
      const from = this.potX100;
      this.potX100 = Math.min(CW.RAID_POT.cap, this.potX100 + amount);
      if (reason !== 'boost' && this.potX100 !== from) this.emit({ type: 'chaosTax', pid: p && p.id, from, to: this.potX100, reason });
      for (const m of CW.RAID_MODIFIERS) {
        if (m.at > from && m.at <= this.potX100) {
          this.emit({ type: 'potTier', mod: m, pot: this.potX100 });
          if (m.bossEnraged) {
            for (const o of this.players) this.emote(o, this.rng.chance(0.5) ? 'panic' : 'cheer');
            this._crowdSay(null, 'chaosRaid', {}, 2, 1);
          }
        }
      }
    }
    setPot(x100) { const v = Math.max(100, Math.min(CW.RAID_POT.cap, Math.round(x100))); if (v > this.potX100) this.addPot(v - this.potX100, null, 'debug'); else this.potX100 = v; }

    // ------------------------------------------------------------ chat / emotes
    say(p, key, vars = {}, force = false) {
      if (!p || p.isHuman) return;
      if (!force && (this.time < p.chatCd || this.time < this._chatGate)) return;
      const per = CW.BOT_PERSONALITIES[p.personality];
      if (!force && per && !this.rng.chance(per.chatty)) return;
      let text = this.rng.pick(CW.LINES[key]);
      text = text.replace('{t}', vars.t || '').replace('{i}', vars.i || 'stuff');
      p.chatCd = this.time + 2.2 * this.k;
      this._chatGate = this.time + 0.5 * this.k;
      this.emit({ type: 'chat', pid: p.id, text, key });
    }
    _crowdSay(subject, key, vars, n = 1, p = 0.8) {
      const others = this.rng.shuffle(this.players.filter((o) => o !== subject && !o.isHuman));
      let said = 0;
      for (const o of others) {
        if (said >= n) break;
        if (this.rng.chance(p)) { this._later(this.rng.range(0.2, 1.0) * this.k, () => this.say(o, key, vars, true)); said++; }
      }
    }
    _crowdReact(subject, emote, p = 0.5) {
      for (const o of this.players) if (o !== subject && this.rng.chance(p)) this.emote(o, emote, subject && subject.id);
    }
    emote(p, emote, at) { this.emit({ type: 'emote', pid: p.id, emote, at }); }

    // ------------------------------------------------------------ bots
    _botThink(p) {
      const per = CW.BOT_PERSONALITIES[p.personality];
      if (!p.protectDecided) {
        p.protectDecided = true;
        const best = SLOTS.filter((s) => this.protectCheck(p, s).ok).sort((x, y) => tierOf(p.loadout[y].rarity) - tierOf(p.loadout[x].rarity))[0];
        if (best && this.rng.chance((per.protect || {})[p.loadout[best].rarity] || 0)) {
          this.protect(p, best);
          this.stats.botActions++;
          p.nextThinkAt = Infinity;
          return;
        }
      }
      if (p.locked) { p.nextThinkAt = Infinity; return; }
      const agg = this.mode.botAggression;
      const opts = [];
      const hum = this.human;
      const humanOk = (o) => !o.isHuman || this.time >= this.humanTargetCd;
      // boost
      const bc = this.boostCheck(p);
      if (bc.ok && this.potX100 < per.boostCeil && p.stats.boosts < per.boostMax && p.wallet.coins >= bc.cost + 100) opts.push({ w: per.wBoost * this.mode.botBoostBias, fn: () => this.boost(p) });
      // reroll worst
      const worst = SLOTS.slice().sort((x, y) => tierOf(p.loadout[x].rarity) - tierOf(p.loadout[y].rarity))[0];
      const rc = this.rerollCheck(p, worst);
      if (rc.ok && p.wallet.coins >= rc.cost + 50) {
        const wt = tierOf(p.loadout[worst].rarity);
        opts.push({ w: per.wReroll * (wt === 0 ? 1.2 : wt === 1 ? 0.5 : 0.1), fn: () => this.reroll(p, worst) });
      }
      // shuffle when sad
      if (this.shuffleCheck(p).ok && this.score(p) < 2) opts.push({ w: per.wShuffle, fn: () => this.shuffle(p) });
      // steal: best EV (prefer revenge target)
      let best = null;
      for (const o of this.players) {
        if (o === p || !humanOk(o)) continue;
        for (const s of CW.STEAL_RULES.stealableSlots) {
          const c = this.stealCheck(p, o, s);
          if (!c.ok) continue;
          const gain = tierOf(o.loadout[s].rarity) - tierOf(p.loadout[s].rarity);
          if (gain <= 0) continue;
          let ev = c.chance * gain * (1 + 0.3 * gain);
          if (p.lastHitBy === o.id && per.revenge) ev *= 3;
          if (!best || ev > best.ev) best = { ev, o, s };
        }
      }
      if (best) opts.push({ w: per.wSteal * agg * Math.min(1.5, 0.6 + best.ev), fn: () => this.steal(p, best.o, best.s) });
      // grief: knock down the shiniest thing in the room
      if (this.mode.grief) {
        let gb = null;
        for (const o of this.players) {
          if (o === p || !humanOk(o)) continue;
          for (const s of SLOTS) {
            const c = this.griefCheck(p, o, s);
            if (!c.ok) continue;
            let v = tierOf(o.loadout[s].rarity) + this.score(o) * 0.2;
            if (o.isHuman) v *= 1.3;
            if (p.lastHitBy === o.id) v *= per.revenge ? 3 : 1.5;
            if (c.cost.token) v *= 0.8;
            if (!gb || v > gb.v) gb = { v, o, s };
          }
        }
        if (gb && gb.v >= 2) opts.push({ w: per.wGrief * agg, fn: () => this.grief(p, gb.o, gb.s) });
      }
      // revenge grudge: big weight boost if something targets attacker
      if (per.revenge && p.lastHitBy) for (const o of opts) o.w *= 1.1;
      opts.push({ w: 0.8, fn: () => { if (this.rng.chance(0.25)) { this.emote(p, 'taunt', hum.id); this.say(p, 'taunt'); } } });
      const pick = this.rng.weighted(opts, (o) => o.w);
      const before = this.log.length;
      pick.fn();
      if (this.log.slice(before).some((e) => ['boost', 'reroll', 'shuffle', 'stealStart', 'griefStart'].includes(e.type))) this.stats.botActions++;
      p.nextThinkAt = this.time + (this.rng.range(...per.think) * this.k) / agg;
    }

    // ------------------------------------------------------------ main loop
    setPhase(ph, dur) {
      this.phase = ph;
      this.phaseStart = this.time;
      this.phaseEnd = this.time + dur;
      this.emit({ type: 'phase', phase: ph, dur });
      if (ph === 'rolling') {
        this.round = 0; this.roundState = 'waiting'; this.roundReadyAt = this.time;
      }
      if (ph === 'chaos') {
        for (const p of this.players) {
          if (!p.isHuman) { p.nextThinkAt = this.time + this.rng.range(1.2, 3.5) * this.k / this.mode.botAggression; this.status(p, '', 0); }
        }
      }
      if (ph === 'locked') {
        for (const p of this.players) if (!p.isHuman) this._later(this.rng.range(0.4, 2.6) * this.k, () => { p.ready = true; this.status(p, 'READY', 999); this.emit({ type: 'ready', pid: p.id }); if (this.rng.chance(0.25)) this.say(p, 'ready'); });
      }
      if (ph === 'launch') this._crowdSay(null, 'launch', {}, 2, 0.7);
    }

    update(dt) {
      this.time += dt;
      // pending (sorted resolution)
      if (this.pending.length) {
        this.pending.sort((a, b) => a.at - b.at);
        while (this.pending.length && this.pending[0].at <= this.time) this.pending.shift().fn();
      }
      for (const p of this.players) if (p.status && this.time > p.statusUntil) p.status = '';
      switch (this.phase) {
        case 'intro':
          for (const p of this.players) if (!p.joined && this.time >= p.joinAt) { p.joined = true; this.emit({ type: 'join', pid: p.id }); if (this.rng.chance(0.3)) this.say(p, 'join'); }
          if (this.time >= this.phaseEnd) {
            this._joinAll();
            this.setPhase('rolling', CW.TIMINGS.rollPhaseMax * this.k);
          }
          break;
        case 'rolling': {
          const h = this.human;
          if (this.canPull(h) && this.time - this.roundReadyAt > CW.TIMINGS.humanAutoPullSec * this.k) {
            this.emit({ type: 'autoPull', pid: h.id });
            this.pull(h);
          }
          if (this.roundState === 'spinning' && this.time >= this.roundEndAt) {
            this.roundState = 'pause';
            this.roundPauseEnd = this.time + (this.round >= 2 ? CW.TIMINGS.preChaosPause : CW.TIMINGS.roundPause) * this.k;
            this.emit({ type: 'roundEnd', round: this.round });
          }
          if (this.roundState === 'pause' && this.time >= this.roundPauseEnd) {
            this.round++;
            if (this.round < 3) { this.roundState = 'waiting'; this.roundReadyAt = this.time; this.emit({ type: 'roundReady', round: this.round }); }
          }
          const allDone = this.round >= 3 && this.players.every((p) => p.pullsDone >= 3 && this.allRevealed(p));
          if (allDone) {
            this.setPhase('chaos', this.mode.chaosSec * this.k);
          } else if (this.time >= this.phaseEnd) {
            // hard cap: force remaining pulls with short reels
            for (const p of this.players) while (p.pullsDone < 3) { const s = SLOTS[p.pullsDone]; p.loadout[s] = this._make(p, s, this.rollRarity(p)); p.revealAt[s] = this.time; p.pullsDone++; }
            for (const p of this.players) for (const s of SLOTS) p.revealAt[s] = Math.min(p.revealAt[s], this.time);
            this.round = 3; this.roundState = 'pause'; this.roundPauseEnd = this.time;
          }
          break;
        }
        case 'chaos':
          for (const p of this.players) if (!p.isHuman && this.time >= p.nextThinkAt) this._botThink(p);
          if (this.time >= this.phaseEnd && !this.pending.some((x) => x.chaos)) this.setPhase('locked', Infinity);
          break;
        case 'locked':
          break; // LOADOUTS LOCKED: waits for YOU to press CONTINUE TO RAID
        case 'vote':
          this.vote.update(dt);
          for (const e of this.vote.drain()) this.emit({ ...e, type: e.type, pid: e.voter });
          if (this.vote.state === 'done') {
            this.boons = [this.vote.winner];
            this.setPhase('launch', CW.TIMINGS.launchCountdown * this.k);
          }
          break;
        case 'launch':
          if (this.time >= this.phaseEnd && !this.pending.length) { this.phase = 'done'; this.emit({ type: 'launchNow' }); }
          break;
      }
    }

    // ------------------------------------------------------------ LOCKED → VOTE
    continueToRaid() {
      if (this.phase !== 'locked') return false;
      this.human.ready = true;
      const voters = this.players.map((p) => ({ id: p.id, isHuman: p.isHuman, personality: p.personality }));
      this.voteOptions = CW.pickBoonOptions(this.rng);
      this.vote = new CW.BoonVote({ rng: this.rng, voters, options: this.voteOptions, k: this.k, label: 'PRE-RAID', forceResult: this.debug.forceVote || null });
      this.setPhase('vote', this.vote.duration);
      this.emit({ type: 'voteStart', options: this.voteOptions, dur: this.vote.duration });
      return true;
    }
    humanVote(boonId) { return this.phase === 'vote' && this.vote.vote(this.human.id, boonId); }

    // Debug: finish everything instantly and jump to the dungeon.
    _joinAll() { for (const p of this.players) if (!p.joined) { p.joined = true; this.emit({ type: 'join', pid: p.id }); } }
    skipToBattle() {
      this._joinAll();
      for (const p of this.players) {
        while (p.pullsDone < 3) { const s = SLOTS[p.pullsDone]; p.loadout[s] = this._make(p, s, this.rollRarity(p)); p.pullsDone++; }
        for (const s of SLOTS) { p.revealAt[s] = this.time; if (p.loadout[s]) p.loadout[s]._busy = false; }
      }
      this.pending = [];
      this.phase = 'done';
      this.emit({ type: 'launchNow', skipped: true });
    }
    skipPhase() {
      if (this.phase === 'intro' || this.phase === 'rolling') {
        this._joinAll();
        for (const p of this.players) { while (p.pullsDone < 3) { const s = SLOTS[p.pullsDone]; p.loadout[s] = this._make(p, s, this.rollRarity(p)); p.pullsDone++; } for (const s of SLOTS) p.revealAt[s] = Math.min(p.revealAt[s], this.time); }
        this.round = 3; this.roundState = 'pause';
        this.setPhase('chaos', this.mode.chaosSec * this.k);
      } else if (this.phase === 'chaos') this.phaseEnd = this.time;
      else if (this.phase === 'locked') this.continueToRaid();
      else if (this.phase === 'vote') { this.vote.closeNow(); }
      else if (this.phase === 'launch') this.phaseEnd = this.time;
    }

    // Snapshot for the battle
    partySpec() {
      return this.players.map((p) => ({ id: p.id, name: p.name, isHuman: p.isHuman, look: p.look, level: p.level, personality: p.personality, loadout: { hero: p.loadout.hero, weapon: p.loadout.weapon, gear: p.loadout.gear } }));
    }
  }
  CW.Lobby = Lobby;
})(typeof window !== 'undefined' ? window : globalThis);
