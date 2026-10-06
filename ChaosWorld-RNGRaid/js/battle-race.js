/* V2 battle: ONE enormous boss, all 8 raiders hit it at once, and it's a DAMAGE RACE.
 * Co-op (everyone needs the boss dead, shared boons) vs competitive (race position, battle items that grief rivals).
 * Pure logic, deterministic per seed. UI reads state + drains `events`.
 */
(function (root) {
  'use strict';
  const CW = (root.CW = root.CW || {});
  const NEG = new Set(['stun', 'hex', 'cursed', 'roar', 'crownWarn']);
  const POS_COPYABLE = new Set(['haste', 'surge', 'crit', 'shieldItem']);
  const ORD = ['', '1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH'];
  CW.ordinal = (n) => ORD[n] || n + 'TH';

  // Isometric staging: raiders on a diagonal from lower-left towards the boss at upper-right.
  CW.RACE_LAYOUT = {
    boss: { x: 368, y: 418, hitX: 352, hitY: 285 },
    lineFrom: { x: 58, y: 768 }, lineTo: { x: 336, y: 540 }, stagger: 38,
    humanSlot: 5, // the human stands near the front of the swarm
  };

  class RaceBattle {
    constructor(opts) {
      this.rng = new CW.RNG((opts.seed >>> 0) || 7);
      this.mods = opts.mods || CW.raidMods(100);
      this.biome = opts.biome || CW.BIOMES[0];
      this.autoHuman = !!opts.autoHuman;
      this.debug = opts.debug || {};
      this.boons = (opts.boons || []).slice();
      this.firstVoteOptions = opts.firstVoteOptions || null;
      this.time = 0;
      this.state = 'intro';
      this.stateEnd = 1.6;
      this.events = [];
      this.projectiles = [];
      this.summons = [];
      this.telegraphs = [];
      this._timers = [];
      this._uid = 1;
      this.result = null;
      this.midVoteDone = false;
      this.vote = null;
      this._rankT = 0;
      this._leaderCd = 0;
      this._chatGate = 0;
      this._buildParty(opts.party);
      this._buildBoss();
      this._rank(true);
    }

    // ------------------------------------------------------------ setup
    _buildParty(spec) {
      const L = CW.RACE_LAYOUT;
      const order = spec.filter((p) => !p.isHuman);
      const human = spec.find((p) => p.isHuman);
      if (human) order.splice(Math.min(L.humanSlot, order.length), 0, human);
      const dx = L.lineTo.x - L.lineFrom.x, dy = L.lineTo.y - L.lineFrom.y, len = Math.hypot(dx, dy);
      const px = -dy / len, py = dx / len;
      this.units = order.map((p, i) => {
        const t = order.length > 1 ? i / (order.length - 1) : 0;
        const off = (i % 2 ? 1 : -1) * L.stagger;
        const base = { hero: p.loadout.hero, weapon: p.loadout.weapon, gear: p.loadout.gear };
        const u = {
          id: 'u' + this._uid++, idx: i, pid: p.id, name: p.name, isHuman: !!p.isHuman, personality: p.personality || null, look: p.look,
          classId: base.hero.classId, accent: (p.look && p.look.body) || '#8b5cf6',
          base, cur: { ...base }, effects: [], shield: 0, down: false, koUntil: 0,
          atkCd: 0.3 + this.rng.next() * 0.8, botCastDelay: 0,
          item: null, reel: null, itemCd: this.rng.range(...CW.ITEM_FIRST), itemHeldAt: 0, holdUntil: 0, swap: null,
          secondWindUsed: false, revived: false, lastHitBy: null, chatCd: 0,
          dmg: 0, heal: 0, score: 0, rank: i + 1, prevRank: i + 1,
          hx: L.lineFrom.x + dx * t + px * off, hy: L.lineFrom.y + dy * t + py * off,
          anim: { lunge: 0, hit: 0, cast: 0 },
          tally: { itemsUsed: 0, rivalsHit: 0, ghostSwaps: 0, swapCurses: 0, lightnings: 0, crowns: 0, biggestHit: 0, timesKO: 0, timesStunned: 0, blocked: 0 },
        };
        u.x = u.hx; u.y = u.hy;
        this._recalc(u, true);
        u.skills = CW.CLASSES[u.classId].skills.map((id) => ({ id, def: CW.SKILLS[id], cdLeft: CW.SKILLS[id].cd * (0.3 + 0.3 * this.rng.next()) }));
        return u;
      });
    }
    _buildBoss() {
      const key = this.biome.boss;
      const def = CW.BOSSES[key];
      const L = CW.RACE_LAYOUT.boss;
      this.boss = {
        key, def, name: def.name,
        maxHp: Math.round(def.hp * CW.BATTLE.enemyHpScale * (1 + this.mods.enemyHp) * (this.mods.bossEnraged ? 1 + CW.BATTLE.chaosRaidEnrage.hp : 1)),
        atk: def.atk * CW.BATTLE.enemyAtkScale * (1 + this.mods.enemyDmg) * (this.mods.bossEnraged ? 1 + CW.BATTLE.chaosRaidEnrage.atk : 1),
        x: L.x, y: L.y, hitX: L.hitX, hitY: L.hitY,
        atkTimer: 2.6, enraged: false, chaosRaid: !!this.mods.bossEnraged, flinch: 0, pose: 'idle', poseUntil: 0, dots: [],
      };
      this.boss.hp = this.boss.maxHp;
    }

    // ------------------------------------------------------------ helpers
    emit(e) { e.t = this.time; this.events.push(e); return e; }
    drain() { const e = this.events; this.events = []; return e; }
    get(id) { return this.units.find((u) => u.id === id || u.pid === id); }
    get human() { return this.units.find((u) => u.isHuman); }
    raiders(includeDown = false) { return this.units.filter((u) => includeDown || !u.down); }
    rivalsOf(u, includeDown = false) { return this.units.filter((o) => o !== u && (includeDown || !o.down)); }
    standings() { return this.units.slice().sort((a, b) => a.rank - b.rank); }
    boon(key) { let v = 0; for (const b of this.boons) { const d = CW.BOON_OPTIONS[b]; if (d && d[key]) v += typeof d[key] === 'number' ? d[key] : 1; } return v; }
    hasBoon(id) { return this.boons.includes(id); }
    has(u, type) { return u.effects.some((e) => e.type === type && e.until > this.time); }
    effVal(u, key) { let v = 0; for (const e of u.effects) if (e.until > this.time && e[key]) v += e[key]; return v; }
    isStunned(u) { return this.has(u, 'stun'); }
    isInvuln(u) { return this.has(u, 'shieldItem'); }
    _later(sec, fn) { this._timers.push({ at: this.time + sec, fn }); }
    addEffect(u, type, dur, vals = {}, src = null) {
      const e = { type, until: this.time + dur, dur, src, ...vals };
      // same-type refresh instead of stacking
      const ex = u.effects.find((x) => x.type === type && x.until > this.time);
      if (ex) { ex.until = Math.max(ex.until, e.until); Object.assign(ex, vals); return ex; }
      u.effects.push(e);
      if (type === 'stun') { u.tally.timesStunned++; u.atkCd = Math.max(u.atkCd, 0.4); }
      return e;
    }
    _recalc(u, init) {
      const ratio = init ? 1 : u.hp / u.maxHp;
      const s = CW.deriveStats(u.cur);
      Object.assign(u, { maxHp: s.hp, atk: s.atk, baseAspd: s.aspd, crit: s.crit, def: s.def, dodge: s.dodge, resist: s.resist, thorns: s.thorns, lifesteal: s.lifesteal, revive: s.revive, fx: s.fx, fxChance: s.fxChance, skillPower: s.skillPower, range: s.range, role: s.role, dmgType: s.dmgType, power: s.power });
      u.weaponKind = u.cur.weapon.kind; u.weaponRarity = u.cur.weapon.rarity; u.heroRarity = u.cur.hero.rarity;
      u.gearKind = u.cur.gear.kind; u.gearRarity = u.cur.gear.rarity;
      u.hp = init ? u.maxHp : Math.max(1, Math.round(u.maxHp * ratio));
    }
    aspdOf(u) { return Math.max(0.2, u.baseAspd * (1 + this.effVal(u, 'aspd') + this.boon('aspd'))); }
    dmgMultOf(u) {
      let m = 1 + this.effVal(u, 'dmg');
      if (this.hasBoon('executioner') && this.boss.hp < this.boss.maxHp * 0.25) m += CW.BOON_OPTIONS.executioner.execute;
      return Math.max(0.1, m);
    }

    // ------------------------------------------------------------ damage to the boss
    _variance() {
      if (this.hasBoon('chaosBlessing')) return this.rng.range(...CW.BOON_OPTIONS.chaosBlessing.variance);
      return this.rng.range(0.9, 1.1);
    }
    hitBoss(u, power, opt = {}) {
      const B = this.boss;
      if (B.hp <= 0 || this.state !== 'fight') return 0;
      let dmg = u.atk * power * this._variance() * this.dmgMultOf(u);
      const critChance = (u.crit + this.boon('crit') + this.effVal(u, 'crit') + (opt.critBonus || 0)) / 100;
      const crit = opt.forceCrit || this.rng.chance(critChance);
      if (crit) dmg *= CW.BATTLE.critMult;
      dmg = Math.max(1, Math.round(dmg));
      this._creditBoss(u, dmg, crit, opt.fx || null);
      const ls = u.lifesteal + this.boon('lifesteal') + (opt.lifesteal || 0);
      if (ls > 0) this._heal(u, u, dmg * ls, true);
      if (!opt.noFx && u.fx && this.rng.chance(u.fxChance)) this._weaponFx(u, dmg);
      return dmg;
    }
    _creditBoss(u, dmg, crit, fx) {
      const B = this.boss;
      if (B.hp <= 0) return;
      const real = Math.min(B.hp, dmg);
      B.hp -= real;
      u.dmg += real;
      if (real > u.tally.biggestHit) u.tally.biggestHit = real;
      this.emit({ type: 'bossHit', sid: u.id, amount: dmg, crit, fx });
      if (crit && dmg > B.maxHp * 0.012) { B.flinch = 0.3; this.emit({ type: 'bossFlinch', sid: u.id, amount: dmg }); }
    }
    _weaponFx(u, dmg) {
      const fx = u.fx;
      this.emit({ type: 'wfx', fx, sid: u.id });
      switch (fx) {
        case 'burn': this.boss.dots.push({ src: u.id, dps: u.atk * 0.35, until: this.time + 3, fx, tick: 0 }); break;
        case 'bleed': this.boss.dots.push({ src: u.id, dps: u.atk * 0.3, until: this.time + 4, fx, tick: 0 }); break;
        case 'poison': this.boss.dots.push({ src: u.id, dps: u.atk * 0.22, until: this.time + 4, fx, tick: 0 }); break;
        case 'stun': this.boss.atkTimer += 0.35; break;
        case 'chain': this.hitBoss(u, 0.6, { noFx: true, fx: 'chain' }); break;
        case 'holy': { const low = this.raiders().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; if (low) this._heal(u, low, dmg * 0.6); break; }
        case 'voidEcho': this._later(0.4, () => this.hitBoss(u, 0.85, { noFx: true, fx: 'voidEcho' })); break;
        case 'cataclysm': this.hitBoss(u, 1.5, { noFx: true, fx: 'cataclysm' }); this.emit({ type: 'shake', power: 6 }); break;
      }
    }
    _heal(src, tgt, amt, quiet) {
      if (!tgt || tgt.down) return 0;
      const real = Math.min(tgt.maxHp - tgt.hp, Math.round(amt));
      if (real <= 0) return 0;
      tgt.hp += real;
      src.heal += real;
      if (!quiet || real > 25) this.emit({ type: 'heal', tid: tgt.id, sid: src.id, amount: real });
      return real;
    }

    // ------------------------------------------------------------ damage to raiders (boss attacks)
    hitRaider(u, power, why) {
      if (u.down) return 0;
      if (this.isInvuln(u)) { this.emit({ type: 'blocked', tid: u.id, by: 'boss', why }); u.tally.blocked++; return 0; }
      if (this.rng.chance(u.dodge + this.effVal(u, 'dodge') / 100)) { this.emit({ type: 'dodge', tid: u.id }); return 0; }
      let dmg = this.boss.atk * power * this.rng.range(0.9, 1.1) * (this.boss.enraged ? 1 + CW.BATTLE.enrage.atk : 1);
      dmg *= (1 - u.def) * (1 - u.resist) * (1 - this.boon('def'));
      dmg = Math.round(dmg);
      let absorbed = 0;
      if (u.shield > 0) { absorbed = Math.min(u.shield, dmg); u.shield -= absorbed; }
      u.hp -= dmg - absorbed;
      u.anim.hit = 0.25;
      this.emit({ type: 'raiderHit', tid: u.id, amount: dmg, why });
      if (u.thorns) this._creditBoss(u, Math.round(dmg * u.thorns), false, 'thorns');
      if (u.hp <= 0) this._knockOut(u);
      return dmg;
    }
    _knockOut(u) {
      if (this.hasBoon('secondWind') && !u.secondWindUsed) {
        u.secondWindUsed = true; u.hp = Math.round(u.maxHp * CW.BOON_OPTIONS.secondWind.secondWind);
        this.emit({ type: 'secondWind', tid: u.id }); return;
      }
      if (u.revive && !u.revived) { u.revived = true; u.hp = Math.round(u.maxHp * u.revive); this.emit({ type: 'revive', tid: u.id, by: 'gear' }); return; }
      u.down = true; u.hp = 0; u.koUntil = this.time + CW.BATTLE.koSec; u.tally.timesKO++;
      u.effects = u.effects.filter((e) => e.type === 'crownWarn'); // KO clears most statuses
      this.emit({ type: 'ko', tid: u.id });
    }

    // ------------------------------------------------------------ boss attacks (telegraphed)
    _bossAttack() {
      const B = this.boss;
      const atks = CW.BOSS_ATTACKS;
      const key = this.rng.weighted(Object.keys(atks), (k) => atks[k].weight);
      const def = atks[key];
      const alive = this.raiders();
      if (!alive.length) return;
      const taunter = alive.find((u) => this.has(u, 'taunt'));
      const warn = def.warn * (B.enraged ? 0.8 : 1);
      const tg = { id: this._uid++, type: key, name: def.name, def, start: this.time, at: this.time + warn, zones: [], targets: [] };
      if (key === 'slam') { const c = taunter && this.rng.chance(0.6) ? taunter : this.rng.pick(alive); tg.zones.push({ x: c.hx, y: c.hy, r: def.radius }); }
      if (key === 'meteors') for (let i = 0; i < def.count; i++) { const c = this.rng.pick(alive); tg.zones.push({ x: c.hx + this.rng.range(-40, 40), y: c.hy + this.rng.range(-25, 25), r: def.radius }); }
      if (key === 'beam') { const pool = this.rng.shuffle(alive); if (taunter) { pool.splice(pool.indexOf(taunter), 1); pool.unshift(taunter); } tg.targets = pool.slice(0, def.targets).map((u) => u.id); }
      this.telegraphs.push(tg);
      B.pose = key === 'roar' ? 'roar' : key === 'beam' ? 'beam' : 'windup'; B.poseUntil = tg.at + 0.4;
      this.emit({ type: 'telegraph', tg });
      const every = this.rng.range(...CW.BOSS_ATTACK_EVERY) * (B.enraged ? 1 / (1 + CW.BATTLE.enrage.aspd) : 1) * (B.chaosRaid ? CW.BATTLE.chaosRaidEnrage.every : 1);
      B.atkTimer = warn + every;
    }
    inZone(u, z) { const dx = u.hx - z.x, dy = (u.hy - z.y) * 1.6; return dx * dx + dy * dy <= z.r * z.r; }
    _resolveTelegraph(tg) {
      const def = tg.def;
      const hit = [];
      if (tg.type === 'slam' || tg.type === 'meteors') {
        for (const u of this.raiders()) {
          const n = tg.zones.filter((z) => this.inZone(u, z)).length;
          if (!n) continue;
          for (let i = 0; i < n; i++) this.hitRaider(u, def.power, tg.type);
          if (def.stun && !this.isInvuln(u) && !u.down) this.addEffect(u, 'stun', def.stun, {}, 'boss');
          hit.push(u.id);
        }
        this.boss.pose = 'slam'; this.boss.poseUntil = this.time + 0.45;
        this.emit({ type: 'shake', power: tg.type === 'slam' ? 10 : 6 });
      } else if (tg.type === 'beam') {
        for (const id of tg.targets) { const u = this.get(id); if (u && !u.down) { this.hitRaider(u, def.power, 'beam'); hit.push(u.id); } }
      } else if (tg.type === 'roar') {
        for (const u of this.raiders()) { if (this.isInvuln(u)) continue; this.hitRaider(u, def.power, 'roar'); if (!u.down) this.addEffect(u, 'roar', def.dur, { aspd: def.aspd }, 'boss'); hit.push(u.id); }
        this.emit({ type: 'shake', power: 5 });
      }
      this.emit({ type: 'bossAttack', tg, hit });
    }

    // ------------------------------------------------------------ raider actions
    _attack(u) {
      const B = this.boss;
      if (u.role === 'healer') {
        const low = this.raiders().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (low && low.hp / low.maxHp < 0.6) {
          this.projectiles.push({ id: this._uid++, kind: 'heal', x: u.x, y: u.y - 40, tx: low.x, ty: low.y - 40, speed: 560, payload: () => this._heal(u, low, u.atk * 1.6 * u.skillPower) });
          u.anim.cast = 0.25;
          return;
        }
      }
      if (u.range === 'ranged') {
        const kind = u.dmgType === 'spell' ? u.fx || 'bolt' : 'arrow';
        this.projectiles.push({ id: this._uid++, kind, rarity: u.weaponRarity, x: u.x + 10, y: u.y - 48, tx: B.hitX + this.rng.range(-40, 40), ty: B.hitY + this.rng.range(-40, 40), speed: 640, payload: () => this.hitBoss(u, 1) });
        u.anim.cast = 0.25;
      } else {
        u.anim.lunge = 0.3;
        this.hitBoss(u, 1);
      }
    }
    canCast(u, idx) {
      const s = u.skills[idx];
      return !!(s && !u.down && s.cdLeft <= 0 && this.state === 'fight' && !this.isStunned(u));
    }
    castSkill(uid, idx) {
      const u = typeof uid === 'string' ? this.get(uid) : uid;
      if (!this.canCast(u, idx)) return false;
      const s = u.skills[idx], d = s.def, P = u.skillPower;
      s.cdLeft = d.cd;
      u.anim.cast = 0.45;
      this.emit({ type: 'cast', sid: u.id, skill: s.id, name: d.name, human: u.isHuman });
      const party = this.raiders();
      switch (d.type) {
        case 'multi': case 'random':
          for (let i = 0; i < (d.hits || 1); i++) this.hitBoss(u, d.power * P, { fx: 'skill', lifesteal: d.lifesteal || 0 });
          u.anim.lunge = 0.3; break;
        case 'single': case 'splash': case 'aoe':
          this.hitBoss(u, (d.power + (d.splash || 0)) * P, { fx: 'skill', forceCrit: d.forceCrit, critBonus: d.critBonus || 0 });
          if (d.burn) this.boss.dots.push({ src: u.id, dps: u.atk * 0.4, until: this.time + 3, fx: 'burn', tick: 0 });
          if (d.drainHeal) for (const a of party) this._heal(u, a, (u.atk * d.power * d.drainHeal) / 2);
          if (d.healParty) for (const a of party) this._heal(u, a, a.maxHp * d.healParty);
          if (d.shieldParty) for (const a of party) a.shield += a.maxHp * d.shieldParty;
          if (d.type === 'aoe') this.emit({ type: 'shake', power: 4 });
          break;
        case 'buffParty': for (const a of party) this.addEffect(a, 'dodge', d.dur, { dodge: d.dodge }); break;
        case 'buffSelf': this.addEffect(u, 'frenzy', d.dur, { aspd: d.aspd }); break;
        case 'taunt': this.addEffect(u, 'taunt', d.dur); u.shield += u.maxHp * d.shield * P; break;
        case 'shieldParty': for (const a of party) a.shield += a.maxHp * d.shield * P; break;
        case 'summon':
          for (let i = 0; i < d.count; i++) this.summons.push({ id: this._uid++, owner: u.id, x: u.x + (i ? 30 : -30), y: u.y - 20, until: this.time + 10, atkCd: 0.5 + i * 0.3, atk: 14 * P });
          break;
        case 'heal': { const low = party.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; if (low) this._heal(u, low, low.maxHp * d.power * P); break; }
        case 'healParty': {
          for (const a of party) this._heal(u, a, a.maxHp * d.power * P);
          if (d.revive) { const dead = this.units.find((x) => x.down); if (dead) this._respawn(dead, 0.35, u.id); }
          break;
        }
      }
      return true;
    }
    _botCast(u) {
      for (let i = 0; i < u.skills.length; i++) {
        if (!this.canCast(u, i)) continue;
        const d = u.skills[i].def;
        if (d.type === 'heal' || d.type === 'healParty') {
          const need = this.raiders().filter((a) => a.hp / a.maxHp < 0.65).length;
          if (!need && !(d.revive && this.units.some((x) => x.down))) continue;
        }
        if (u.botCastDelay > 0) return;
        u.botCastDelay = 0.3 + this.rng.next() * 0.9;
        this.castSkill(u, i);
        return;
      }
    }
    _respawn(u, pct, by) {
      u.down = false; u.hp = Math.round(u.maxHp * pct); u.koUntil = 0; u.atkCd = 0.5;
      this.emit({ type: 'respawn', tid: u.id, by: by || null });
    }

    // ------------------------------------------------------------ RACE POSITIONS
    raceScore(u) { return u.dmg + CW.BATTLE.healScoreWeight * u.heal; }
    _rank(init) {
      const sorted = this.units.slice().sort((a, b) => this.raceScore(b) - this.raceScore(a) || a.idx - b.idx);
      const oldLeader = this.units.find((u) => u.rank === 1);
      sorted.forEach((u, i) => { u.prevRank = u.rank; u.rank = i + 1; u.score = this.raceScore(u); });
      if (init) return;
      for (const u of this.units) if (u.rank !== u.prevRank) this.emit({ type: 'rankChange', uid: u.id, from: u.prevRank, to: u.rank, human: u.isHuman });
      const leader = sorted[0];
      if (leader !== oldLeader && leader.score > 0 && this.time >= this._leaderCd) {
        this._leaderCd = this.time + CW.RACE.leaderAnnounceCd;
        this.emit({ type: 'newLeader', uid: leader.id, prev: oldLeader && oldLeader.id });
        if (!leader.isHuman && this.rng.chance(0.3)) this._say(leader, 'leader');
      }
    }

    // ------------------------------------------------------------ BATTLE ITEMS
    itemWeights(rank, strength = this.debug.comebackStrength ?? CW.COMEBACK_STRENGTH) {
      const b = CW.rankBucket(rank);
      const out = {};
      for (const [id, row] of Object.entries(CW.POSITION_ITEM_WEIGHTS)) {
        const mean = row.reduce((a, x) => a + x, 0) / row.length;
        out[id] = Math.max(0, mean + (row[b] - mean) * strength);
      }
      return out;
    }
    rollItem(u) {
      const forced = this.debug.forceItem;
      if (forced && (u.isHuman || this.debug.forceItemBots) && CW.BATTLE_ITEMS[forced]) return forced;
      const w = this.itemWeights(u.rank);
      return this.rng.weighted(Object.keys(w), (k) => w[k]);
    }
    itemInterval() { return (this.debug.itemInterval || CW.ITEM_INTERVAL); }
    _tickItems(dt) {
      for (const u of this.units) {
        if (u.reel) {
          if (this.time >= u.reel.until) {
            u.item = u.reel.result; u.reel = null; u.itemHeldAt = this.time;
            u.itemCd = this.itemInterval();
            this.emit({ type: 'itemReady', uid: u.id, item: u.item, human: u.isHuman });
            if (!u.isHuman || this.autoHuman) this._planBotItem(u);
          }
          continue;
        }
        if (u.item) continue; // one READY item at a time — the next reel waits
        u.itemCd -= dt * (CW.ITEM_RATE_BY_RANK[u.rank - 1] || 1) * (1 + this.boon('itemRate'));
        if (u.itemCd <= 0) this.startItemReel(u);
      }
    }
    startItemReel(u, forceId) {
      if (u.item || u.reel) return false;
      const result = forceId || this.rollItem(u);
      const dur = CW.ITEM_REEL_SEC * (1 - 0.4 * this.boon('itemRate'));
      u.reel = { start: this.time, until: this.time + dur, result };
      this.emit({ type: 'itemReel', uid: u.id, dur, human: u.isHuman });
      return true;
    }
    giveItem(u, id) { u.reel = null; u.item = id; u.itemHeldAt = this.time; this.emit({ type: 'itemReady', uid: u.id, item: id, human: u.isHuman }); if (!u.isHuman || this.autoHuman) this._planBotItem(u); }
    // ranked rival list for targeting UIs
    targetList(u) { return this.standings().filter((o) => o !== u).map((o) => ({ uid: o.id, rank: o.rank, name: o.name, weapon: o.cur.weapon, down: o.down, shielded: this.isInvuln(o), swapped: !!o.swap, ok: this.targetCheck(u, o).ok, reason: this.targetCheck(u, o).reason })); }
    targetCheck(u, t) {
      const def = CW.BATTLE_ITEMS[u.item];
      if (!def || def.kind !== 'target') return { ok: false, reason: 'NO TARGET NEEDED' };
      if (!t || t === u) return { ok: false, reason: 'PICK A RIVAL' };
      if (t.down) return { ok: false, reason: 'KNOCKED OUT' };
      if ((u.item === 'ghost' || u.item === 'swapCurse') && (t.swap || u.swap)) return { ok: false, reason: 'ALREADY SWAPPED' };
      return { ok: true };
    }
    useItem(uid, targetId) {
      const u = typeof uid === 'string' ? this.get(uid) : uid;
      if (!u || !u.item) return { ok: false, reason: 'NO ITEM' };
      if (this.state !== 'fight') return { ok: false, reason: 'NOT NOW' };
      if (u.down) return { ok: false, reason: 'KNOCKED OUT' };
      const id = u.item, def = CW.BATTLE_ITEMS[id];
      let t = null;
      if (def.kind === 'target') {
        t = typeof targetId === 'string' ? this.get(targetId) : targetId;
        const chk = this.targetCheck(u, t);
        if (!chk.ok) return chk;
      }
      u.item = null; u.tally.itemsUsed++;
      const res = this._applyItem(u, id, def, t) || {};
      this.emit({ type: 'itemUsed', uid: u.id, item: id, tid: t && t.id, human: u.isHuman, ...res });
      return { ok: true, item: id, ...res };
    }
    _blockedBy(t, u, id) {
      if (!this.isInvuln(t)) return false;
      t.tally.blocked++;
      this.emit({ type: 'blocked', tid: t.id, sid: u.id, by: id });
      return true;
    }
    _applyItem(u, id, def, t) {
      switch (id) {
        case 'haste': this.addEffect(u, 'haste', def.dur, { aspd: def.aspd }); return {};
        case 'surge': this.addEffect(u, 'surge', def.dur, { dmg: def.dmg }); return {};
        case 'shield': this.addEffect(u, 'shieldItem', def.dur); return {};
        case 'bomb': {
          const near = this.rivalsOf(u).filter((o) => o !== t).sort((a, b) => Math.hypot(a.hx - t.hx, a.hy - t.hy) - Math.hypot(b.hx - t.hx, b.hy - t.hy)).slice(0, def.splash);
          const hit = [];
          for (const o of [t, ...near]) {
            if (this._blockedBy(o, u, id)) continue;
            this.addEffect(o, 'stun', def.stun, {}, u.id); o.atkCd = Math.max(o.atkCd, 1); o.lastHitBy = u.id;
            hit.push(o.id);
          }
          u.tally.rivalsHit += hit.length;
          this.emit({ type: 'shake', power: 7 });
          return { hit, splash: near.map((o) => o.id) };
        }
        case 'hex':
          if (this._blockedBy(t, u, id)) return { hit: [] };
          this.addEffect(t, 'hex', def.dur, { aspd: def.aspd, dmg: def.dmg }, u.id); t.lastHitBy = u.id; u.tally.rivalsHit++;
          return { hit: [t.id] };
        case 'ghost': case 'swapCurse': {
          if (this._blockedBy(t, u, id)) return { hit: [] };
          const slot = id === 'ghost' ? 'weapon' : this.weakestSlot(u, t);
          const dur = id === 'ghost' ? (this.debug.ghostDuration || CW.GHOST_DURATION) : CW.SWAP_CURSE_DURATION;
          this._startSwap(u, t, slot, dur, id);
          if (id === 'ghost') u.tally.ghostSwaps++; else u.tally.swapCurses++;
          u.tally.rivalsHit++; t.lastHitBy = u.id;
          return { hit: [t.id], slot, dur, got: u.cur[slot], gave: t.cur[slot] };
        }
        case 'lightning': {
          const dur = this.debug.lightningDuration || CW.LIGHTNING_DURATION;
          const hit = [];
          for (const o of this.rivalsOf(u)) { if (this._blockedBy(o, u, id)) continue; this.addEffect(o, 'stun', dur, {}, u.id); o.lastHitBy = u.id; hit.push(o.id); }
          u.tally.rivalsHit += hit.length; u.tally.lightnings++;
          this.emit({ type: 'shake', power: 12 });
          return { hit, dur };
        }
        case 'crownBreaker': {
          const target = this.standings().find((o) => o !== u && !o.down) || null;
          if (!target) return { hit: [] };
          this.addEffect(target, 'crownWarn', def.warn, {}, u.id);
          u.tally.crowns++;
          this.emit({ type: 'crownLocked', sid: u.id, tid: target.id, warn: def.warn });
          this._later(def.warn, () => {
            if (this.state === 'won' || this.state === 'lost') return;
            const warnStill = target.effects.find((e) => e.type === 'crownWarn' && e.src === u.id);
            if (!warnStill) { this.emit({ type: 'crownFizzle', sid: u.id, tid: target.id, why: 'purged' }); return; }
            target.effects = target.effects.filter((e) => e !== warnStill);
            if (target.down) { this.emit({ type: 'crownFizzle', sid: u.id, tid: target.id, why: 'down' }); return; }
            if (this._blockedBy(target, u, 'crownBreaker')) return;
            this.addEffect(target, 'stun', def.stun, {}, u.id);
            this.addEffect(target, 'cursed', def.dur, { dmg: def.dmg }, u.id);
            target.lastHitBy = u.id; u.tally.rivalsHit++;
            this.emit({ type: 'crownHit', sid: u.id, tid: target.id });
            if (!target.isHuman) this._say(target, 'crownHit');
          });
          return { hit: [target.id], tid: target.id };
        }
        case 'tonic': {
          const roll = this.rng.pick(['haste', 'crit', 'shield', 'heal', 'surge']);
          if (roll === 'haste') this.addEffect(u, 'haste', 4, { aspd: 0.35 });
          if (roll === 'crit') this.addEffect(u, 'crit', 5, { crit: 25 });
          if (roll === 'shield') this.addEffect(u, 'shieldItem', 2.5);
          if (roll === 'heal') this._heal(u, u, u.maxHp * 0.4);
          if (roll === 'surge') this.addEffect(u, 'surge', 4, { dmg: 0.3 });
          return { tonic: roll };
        }
        case 'mimic': {
          const leader = this.standings().find((o) => o !== u);
          const copy = leader ? leader.effects.filter((e) => POS_COPYABLE.has(e.type) && e.until > this.time) : [];
          if (!copy.length) { this.addEffect(u, 'surge', 3, { dmg: 0.2 }); return { copied: [], fizzle: true, from: leader && leader.id }; }
          for (const e of copy) { const { type, until, src, dur, ...vals } = e; this.addEffect(u, type, until - this.time, vals); }
          return { copied: copy.map((e) => e.type), from: leader.id };
        }
        case 'purge': return { purged: this.purgeOne(u) };
      }
      return {};
    }
    purgeOne(u) {
      const order = ['stun', 'crownWarn', 'hex', 'cursed', 'roar'];
      for (const type of order) {
        const e = u.effects.find((x) => x.type === type && x.until > this.time);
        if (e) { u.effects = u.effects.filter((x) => x !== e); return type; }
      }
      if (u.swap && !u.swap.initiator) { this._endSwap(u, 'purged'); return 'swap'; }
      return null;
    }
    weakestSlot(u, t) {
      const gain = (s) => CW.tierOf(t.cur[s].rarity) - CW.tierOf(u.cur[s].rarity);
      const slots = ['weapon', 'gear'];
      const best = slots.slice().sort((a, b) => gain(b) - gain(a) || CW.tierOf(u.cur[a].rarity) - CW.tierOf(u.cur[b].rarity))[0];
      return best;
    }
    _startSwap(a, b, slot, dur, kind) {
      a.swap = { slot, partner: b.id, until: this.time + dur, kind, initiator: true };
      b.swap = { slot, partner: a.id, until: this.time + dur, kind, initiator: false };
      a.cur[slot] = b.base[slot];
      b.cur[slot] = a.base[slot];
      this._recalc(a); this._recalc(b);
      this.emit({ type: 'swapStart', kind, slot, a: a.id, b: b.id, aGot: a.cur[slot], bGot: b.cur[slot], dur });
      if (!b.isHuman && kind === 'ghost') this._say(b, 'ghosted');
      if (!a.isHuman && kind === 'ghost' && this.rng.chance(0.5)) this._later(0.6, () => this._say(a, 'itemGhost'));
    }
    _endSwap(u, why = 'timeout') {
      if (!u.swap) return;
      const p = this.get(u.swap.partner);
      const kind = u.swap.kind, slot = u.swap.slot;
      for (const x of [u, p]) { if (!x) continue; x.cur[slot] = x.base[slot]; x.swap = null; this._recalc(x); }
      this.emit({ type: 'swapEnd', kind, slot, a: u.id, b: p && p.id, why });
    }

    // Bot item brains: when to fire + who to hit.
    _planBotItem(u) {
      const per = CW.BOT_PERSONALITIES[u.personality] || {};
      let hold = per.itemHold || [1.5, 4];
      const def = CW.BATTLE_ITEMS[u.item];
      if (u.rank === 1 && def.kind === 'self') hold = [0.3, 1.2];       // leaders go defensive fast
      if (u.rank >= 7 && def.kind !== 'self') hold = [0.2, 1.5];        // back-markers swing at leaders now
      u.holdUntil = this.time + this.rng.range(...hold);
    }
    _threatened(u) {
      return this.has(u, 'crownWarn') || this.telegraphs.some((tg) => tg.targets.includes(u.id) || tg.zones.some((z) => this.inZone(u, z))) || u.effects.some((e) => NEG.has(e.type) && e.until > this.time);
    }
    _botTarget(u) {
      const per = CW.BOT_PERSONALITIES[u.personality] || {};
      const rivals = this.standings().filter((o) => o !== u && !o.down && this.targetCheck(u, o).ok);
      if (!rivals.length) return null;
      const notShielded = rivals.filter((o) => !this.isInvuln(o));
      const pool = notShielded.length ? notShielded : rivals;
      if (per.itemTarget === 'revenge' && u.lastHitBy) { const r = pool.find((o) => o.id === u.lastHitBy); if (r) return r; }
      if (per.itemTarget === 'cluster' && u.item === 'bomb') {
        return pool.slice().sort((a, b) => this._neighbours(b) - this._neighbours(a) || a.rank - b.rank)[0];
      }
      if (u.item === 'ghost' || u.item === 'swapCurse') {
        // take the best weapon/gear in the room (rats go straight for 1st)
        if (per.itemTarget === 'leader') return pool[0];
        const slot = u.item === 'ghost' ? 'weapon' : null;
        return pool.slice().sort((a, b) => CW.tierOf(b.cur[slot || this.weakestSlot(u, b)].rarity) - CW.tierOf(a.cur[slot || this.weakestSlot(u, a)].rarity) || a.rank - b.rank)[0];
      }
      if (per.itemTarget === 'leader' || u.rank >= 5) return pool[0];
      const ahead = pool.filter((o) => o.rank < u.rank);
      return ahead.length ? ahead[ahead.length - 1] : pool[0];
    }
    _neighbours(t) { return this.units.filter((o) => o !== t && !o.down && Math.hypot(o.hx - t.hx, o.hy - t.hy) < 110).length; }
    _botItems() {
      for (const u of this.units) {
        if (!u.item || u.down || (u.isHuman && !this.autoHuman)) continue;
        const per = CW.BOT_PERSONALITIES[u.personality] || {};
        const id = u.item;
        const held = this.time - u.itemHeldAt;
        let fire = this.time >= u.holdUntil;
        if (id === 'shield') fire = per.holdShield ? this._threatened(u) || held > 15 : fire || this._threatened(u);
        if (id === 'purge') fire = u.effects.some((e) => NEG.has(e.type) && e.until > this.time) || (u.swap && !u.swap.initiator) || held > 20;
        if (id === 'mimic') { const ld = this.standings().find((o) => o !== u); fire = (ld && ld.effects.some((e) => POS_COPYABLE.has(e.type) && e.until > this.time)) || held > 12; }
        if (!fire) continue;
        let target = null;
        if (CW.BATTLE_ITEMS[id].kind === 'target') { target = this._botTarget(u); if (!target) { u.holdUntil = this.time + 1; continue; } }
        const r = this.useItem(u, target);
        if (r.ok) {
          if (id === 'bomb' && this.rng.chance(0.35)) this._say(u, 'itemBomb');
          if (id === 'lightning') for (const o of this.rng.shuffle(this.rivalsOf(u)).slice(0, 1)) this._later(0.5, () => this._say(o, 'lightning'));
        }
      }
    }
    _say(u, key) {
      if (!u || u.isHuman || this.time < this._chatGate || this.time < u.chatCd) return;
      const text = this.rng.pick(CW.LINES[key] || ['!']);
      this._chatGate = this.time + 2.5; u.chatCd = this.time + 7;
      this.emit({ type: 'chat', uid: u.id, text });
    }

    // ------------------------------------------------------------ MID-FIGHT BOON VOTE
    startMidVote() {
      if (this.midVoteDone || this.vote) return false;
      this.midVoteDone = true;
      const voters = this.units.map((u) => ({ id: u.id, isHuman: u.isHuman, personality: u.personality }));
      const options = CW.pickBoonOptions(this.rng, { avoid: this.boons, notSameAs: this.firstVoteOptions });
      this.vote = new CW.BoonVote({ rng: this.rng, voters, options, k: this.debug.voteK || 1, label: 'MID-FIGHT', forceResult: this.debug.forceVote || null });
      this.preVoteState = this.state;
      this.state = 'vote';
      this.emit({ type: 'voteStart', options, dur: this.vote.duration, mid: true });
      return true;
    }
    humanVote(boonId) { return !!(this.vote && this.state === 'vote' && this.vote.vote(this.human.id, boonId)); }

    // ------------------------------------------------------------ main loop
    update(dt) {
      if (this.state === 'won' || this.state === 'lost') return;
      if (this.state === 'vote') {
        // the fight is PAUSED: battle time, cooldowns and effect timers all stand still
        this.vote.update(dt);
        for (const e of this.vote.drain()) this.emit({ ...e, mid: true });
        if (this.vote.state === 'done') {
          this.boons.push(this.vote.winner);
          this.state = 'fight';
          this.emit({ type: 'boonApplied', boon: this.vote.winner, boons: this.boons.slice() });
          this.vote = null;
        }
        return;
      }
      this.time += dt;
      const due = this._timers.filter((t) => t.at <= this.time);
      if (due.length) { this._timers = this._timers.filter((t) => t.at > this.time); for (const t of due) t.fn(); }
      if (this.state === 'intro') {
        if (this.time >= this.stateEnd) { this.state = 'fight'; this.emit({ type: 'fightStart', boons: this.boons.slice() }); }
        return;
      }
      if (this.time > CW.BATTLE.maxTime) return this._end(false, 'timeout');
      const B = this.boss;

      // raiders
      for (const u of this.units) {
        u.effects = u.effects.filter((e) => e.until > this.time);
        if (u.swap && this.time >= u.swap.until && u.swap.initiator) this._endSwap(u);
        if (u.down) { if (this.time >= u.koUntil) this._respawn(u, CW.BATTLE.respawnPct); continue; }
        for (const s of u.skills) s.cdLeft = Math.max(0, s.cdLeft - dt);
        if (u.botCastDelay > 0) u.botCastDelay -= dt;
        for (const k of ['lunge', 'hit', 'cast']) if (u.anim[k] > 0) u.anim[k] -= dt;
        if (this.isStunned(u)) continue;
        u.atkCd -= dt * this.aspdOf(u);
        if (u.atkCd <= 0) { u.atkCd += 1; this._attack(u); }
        if (!u.isHuman || this.autoHuman) this._botCast(u);
      }
      // summons
      for (const s of this.summons) {
        s.atkCd -= dt;
        if (s.atkCd <= 0) { s.atkCd = 1; const o = this.get(s.owner); if (o && B.hp > 0) this._creditBoss(o, Math.max(1, Math.round(s.atk * this._variance() * this.dmgMultOf(o))), false, 'skull'); }
      }
      this.summons = this.summons.filter((s) => s.until > this.time);
      // boss dots
      for (const d of B.dots) { d.tick += dt; if (d.tick >= 0.5) { d.tick -= 0.5; const src = this.get(d.src); if (src) this._creditBoss(src, Math.round(d.dps * 0.5), false, d.fx); } }
      B.dots = B.dots.filter((d) => d.until > this.time);
      // projectiles
      for (const p of this.projectiles) {
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
        if (d <= step) { p.dead = true; p.payload(); } else { p.x += (dx / d) * step; p.y += (dy / d) * step; }
      }
      this.projectiles = this.projectiles.filter((p) => !p.dead);
      // boss
      if (B.flinch > 0) B.flinch -= dt;
      if (this.time > B.poseUntil) B.pose = 'idle';
      for (const tg of this.telegraphs.filter((x) => x.at <= this.time)) this._resolveTelegraph(tg);
      this.telegraphs = this.telegraphs.filter((x) => x.at > this.time);
      B.atkTimer -= dt;
      if (B.atkTimer <= 0) this._bossAttack();
      if (!B.enraged && B.hp > 0 && B.hp <= B.maxHp * CW.BATTLE.enrageAtPct) { B.enraged = true; this.emit({ type: 'enrage' }); }
      // items + race
      this._tickItems(dt);
      this._botItems();
      this._rankT -= dt;
      if (this._rankT <= 0) { this._rankT = CW.RACE.rankEvery; this._rank(); }
      // move toward home (lunge is visual only)
      for (const u of this.units) { u.x += (u.hx - u.x) * Math.min(1, dt * 5); u.y += (u.hy - u.y) * Math.min(1, dt * 5); }
      // outcomes
      if (B.hp <= 0) return this._end(true);
      if (this.units.every((u) => u.down)) return this._end(false, 'wipe');
      if (!this.midVoteDone && B.hp <= B.maxHp * CW.BOON_VOTE.midFightAtPct) this.startMidVote();
    }

    cleanup() {
      for (const u of this.units) if (u.swap) this._endSwap(u, 'battleEnd');
      for (const u of this.units) { u.effects = []; u.shield = 0; }
      this.telegraphs = []; this.projectiles = []; this._timers = [];
    }
    _end(won, why) {
      this._rank();
      this.cleanup();
      this.state = won ? 'won' : 'lost';
      this.result = { won, why: why || null, time: this.time, standings: this.standings().map((u) => ({ uid: u.id, pid: u.pid, name: u.name, rank: u.rank, dmg: Math.round(u.dmg), heal: Math.round(u.heal), isHuman: u.isHuman })) };
      this.emit({ type: won ? 'victory' : 'defeat', why });
    }

    // ------------------------------------------------------------ debug hooks
    forceWin() { this.boss.hp = 0; this._end(true, 'debug'); } // nobody is credited: the podium shows real damage
    forceLose() { for (const u of this.units) { u.down = true; u.hp = 0; } this._end(false, 'debug'); }
    setBossHpPct(pct) { this.boss.hp = Math.max(1, Math.round(this.boss.maxHp * pct)); }
    setHumanRank(n) {
      const h = this.human;
      const others = this.units.filter((u) => u !== h).sort((a, b) => this.raceScore(b) - this.raceScore(a));
      n = Math.max(1, Math.min(this.units.length, n));
      const above = others[n - 2], below = others[n - 1];
      const hi = above ? this.raceScore(above) : this.raceScore(others[0]) + 500;
      const lo = below ? this.raceScore(below) : 0;
      const target = n === 1 ? hi + 250 : (hi + lo) / 2;
      h.dmg = Math.max(0, target - CW.BATTLE.healScoreWeight * h.heal);
      this._rank();
    }
    runToEnd(step = 1 / 30, maxSec = 400) {
      let t = 0;
      while (this.state !== 'won' && this.state !== 'lost' && t < maxSec) { this.update(step); t += step; this.events.length = 0; }
      return this.result;
    }
  }
  CW.RaceBattle = RaceBattle;
  CW.Battle = RaceBattle; // the raid IS the race now

  // ------------------------------------------------------------ PLACEMENT REWARDS
  // pct of base by finishing place, then × raid pot; 1st also gets the winner bonus + a Jack Token.
  CW.placementReward = function ({ won, place, potX100, modeId, rng }) {
    const E = CW.ECONOMY;
    const mult = potX100 / 100;
    const tokens = { chaos: 0, jack: 0, grief: 0 };
    const lines = [];
    if (!won) {
      lines.push({ label: 'CONSOLATION', value: E.lossConsolation });
      if (rng && rng.chance(E.lossTokenDrop)) tokens.chaos++;
      return { won, place, coins: E.lossConsolation, tokens, lines, mult, greedy: potX100 >= 150 };
    }
    const pct = CW.PLACEMENT_REWARDS[place - 1] ?? CW.PLACEMENT_REWARDS[CW.PLACEMENT_REWARDS.length - 1];
    const base = Math.round(E.winBase * pct);
    const total = Math.round(E.winBase * pct * mult);
    lines.push({ label: `${CW.ordinal(place)} PLACE (${Math.round(pct * 100)}%)`, value: base });
    if (total - base > 0) lines.push({ label: `RAID POT ${CW.potLabel(potX100)}`, value: total - base, pot: true });
    let coins = total;
    if (place === 1) { lines.push({ label: 'WINNER BONUS', value: E.mvpBonus }); coins += E.mvpBonus; tokens.jack++; }
    if (rng) for (const k of ['chaos', 'jack', 'grief']) {
      if (k === 'grief' && modeId !== 'grief') continue;
      if (rng.chance(Math.min(0.9, E.tokenDrops[k] * mult * (place <= 3 ? 1.25 : 1)))) tokens[k]++;
    }
    return { won, place, coins, tokens, lines, mult, greedy: false };
  };
  // Back-compat wrapper used by older callers/tests: unranked = 1st-place share without the winner bonus.
  CW.computeRewards = function ({ won, potX100, modeId, rng, place }) {
    return CW.placementReward({ won, place: place || 1, potX100, modeId, rng });
  };
  CW.raceRewards = function ({ won, standings, potX100, modeId, seed }) {
    return standings.map((s) => ({ ...s, reward: CW.placementReward({ won, place: s.rank, potX100, modeId, rng: new CW.RNG((seed + s.rank * 131) >>> 0) }) }));
  };
  // Light-touch post-race awards.
  CW.raceAwards = function (units) {
    const out = [];
    const best = (f) => units.slice().sort((a, b) => f(b) - f(a))[0];
    const chaos = best((u) => u.tally.rivalsHit);
    if (chaos && chaos.tally.rivalsHit >= 2) out.push({ title: 'MOST CHAOTIC', uid: chaos.id, name: chaos.name, text: `${chaos.tally.rivalsHit} rivals hit by items` });
    const thief = best((u) => u.tally.ghostSwaps + u.tally.swapCurses);
    if (thief && thief.tally.ghostSwaps + thief.tally.swapCurses >= 1) out.push({ title: 'THIEF', uid: thief.id, name: thief.name, text: `${thief.tally.ghostSwaps + thief.tally.swapCurses} weapon/gear swaps` });
    const big = best((u) => u.tally.biggestHit);
    if (big && big.tally.biggestHit > 0) out.push({ title: 'BIGGEST HIT', uid: big.id, name: big.name, text: `${Math.round(big.tally.biggestHit).toLocaleString('en-GB')} in one blow` });
    return out.slice(0, 3);
  };
})(typeof window !== 'undefined' ? window : globalThis);
