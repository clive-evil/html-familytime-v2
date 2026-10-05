/* Dungeon battle — pure logic, deterministic with a seed. UI renders `units`, `projectiles` and drains `events`.
 * The RNG lobby loadout feeds deriveStats(), which is the ONLY place lobby items become combat numbers.
 */
(function (root) {
  'use strict';
  const CW = (root.CW = root.CW || {});

  // ------------------------------------------------------------ LOADOUT → STATS
  CW.deriveStats = function (loadout) {
    const hero = loadout.hero, weapon = loadout.weapon, gear = loadout.gear;
    const cls = CW.CLASSES[hero.classId];
    const hm = CW.HERO_RARITY_STATS[hero.rarity].mult;
    const ws = CW.WEAPON_RARITY_STATS[weapon ? weapon.rarity : 'common'];
    const gs = CW.GEAR_RARITY_STATS[gear ? gear.rarity : 'common'];
    const s = {
      classId: cls.id, role: cls.role, range: cls.range, dmgType: cls.dmgType,
      hp: cls.hp * hm * (1 + gs.hp),
      atk: cls.atk * hm * (1 + ws.dmg),
      aspd: cls.aspd * (1 + ws.aspd),
      crit: cls.crit + ws.crit,
      def: gs.def, dodge: 0, resist: 0, thorns: 0, lifesteal: 0, revive: 0,
      fx: weapon && weapon.fx && ws.fxChance > 0 ? weapon.fx : null,
      fxChance: ws.fxChance,
      skillPower: hm,
      skills: cls.skills.slice(),
    };
    if (gear && gear.mod) {
      const m = CW.GEAR_MODS[gear.mod];
      const v = (m.base * gs.modPower) / 100;
      if (gear.mod === 'haste') s.aspd *= 1 + v; else s[gear.mod] = v;
    }
    s.hp = Math.round(s.hp);
    s.atk = Math.round(s.atk * 10) / 10;
    s.dps = s.atk * s.aspd * (1 + (s.crit / 100) * (CW.BATTLE.critMult - 1));
    s.power = Math.round(s.dps * 4 + s.hp / 10);
    return s;
  };

  // Human-readable stat lines for an item card (keeps UI out of the maths).
  CW.itemStatLines = function (item) {
    if (!item) return [];
    if (item.slot === 'hero') {
      const c = CW.CLASSES[item.classId];
      const m = CW.HERO_RARITY_STATS[item.rarity].mult;
      return [`${c.role.toUpperCase()} · ${c.range.toUpperCase()}`, `HP ${Math.round(c.hp * m)} · ATK ${Math.round(c.atk * m)}`];
    }
    if (item.slot === 'weapon') {
      const w = CW.WEAPON_RARITY_STATS[item.rarity];
      const out = [`${w.dmg >= 0 ? '+' : ''}${Math.round(w.dmg * 100)}% DMG${w.crit ? ` · +${w.crit}% CRIT` : ''}`];
      if (item.fx && w.fxChance > 0) out.push(`${Math.round(w.fxChance * 100)}% ${CW.WEAPON_FX[item.fx].name.toUpperCase()}`);
      else out.push(item.fx ? `${CW.WEAPON_FX[item.fx].name.toUpperCase()} (DEAD AT COMMON)` : 'NO SPECIAL');
      return out;
    }
    const g = CW.GEAR_RARITY_STATS[item.rarity];
    const out = [g.hp ? `+${Math.round(g.hp * 100)}% HP · ${Math.round(g.def * 100)}% DEF` : 'BASICALLY CLOTHES'];
    if (item.mod) { const m = CW.GEAR_MODS[item.mod]; out.push(`${m.name.toUpperCase()} ${Math.round(m.base * g.modPower)}${m.unit}`); }
    return out;
  };

  const PARTY_ROWS = { front: 612, back: 712 };

  class Battle {
    constructor(opts) {
      this.rng = new CW.RNG((opts.seed >>> 0) || 7);
      this.mods = opts.mods || CW.raidMods(100);
      this.biome = opts.biome || CW.BIOMES[0];
      this.autoHuman = !!opts.autoHuman;
      this.time = 0;
      this.state = 'intro';
      this.stateEnd = 1.4;
      this.wave = -1;
      this.units = [];
      this.projectiles = [];
      this.events = [];
      this._uid = 1;
      this.result = null;
      this.stats = {};
      this._buildParty(opts.party);
    }

    emit(e) { e.t = this.time; this.events.push(e); }
    drain() { const e = this.events; this.events = []; return e; }
    party(alive = true) { return this.units.filter((u) => u.side === 'party' && (!alive || u.alive)); }
    enemies(alive = true) { return this.units.filter((u) => u.side === 'enemy' && (!alive || u.alive)); }
    heroes(alive = true) { return this.party(alive).filter((u) => !u.summon); }
    get(id) { return this.units.find((u) => u.id === id); }
    get human() { return this.units.find((u) => u.isHuman); }

    _buildParty(spec) {
      const melee = [], ranged = [];
      for (const p of spec) {
        const st = CW.deriveStats(p.loadout);
        const u = this._unit({
          side: 'party', pid: p.id, name: p.name, isHuman: p.isHuman, look: p.look, classId: st.classId,
          weaponKind: p.loadout.weapon ? p.loadout.weapon.kind : 'stick', weaponRarity: p.loadout.weapon ? p.loadout.weapon.rarity : 'common',
          heroRarity: p.loadout.hero.rarity, gearKind: p.loadout.gear ? p.loadout.gear.kind : null, gearRarity: p.loadout.gear ? p.loadout.gear.rarity : 'common',
          ...st, maxHp: st.hp,
          skills: st.skills.map((id) => ({ id, def: CW.SKILLS[id], cdLeft: CW.SKILLS[id].cd * (0.3 + 0.3 * this.rng.next()) })),
        });
        u.botCastDelay = 0;
        this.stats[u.id] = { name: p.name, pid: p.id, isHuman: p.isHuman, dmg: 0, heal: 0, taken: 0, kills: 0, classId: st.classId, power: st.power };
        (st.range === 'melee' ? melee : ranged).push(u);
      }
      // balance rows
      while (melee.length > 5) ranged.push(melee.pop());
      while (ranged.length > 5) melee.push(ranged.pop());
      const place = (row, y) => row.forEach((u, i) => { u.hx = 270 + (i - (row.length - 1) / 2) * 96 + (y === PARTY_ROWS.back ? 20 : 0); u.hy = y + (i % 2) * 10; u.x = u.hx; u.y = u.hy; });
      place(melee, PARTY_ROWS.front);
      place(ranged, PARTY_ROWS.back);
    }

    _unit(d) {
      const u = Object.assign({
        id: 'u' + this._uid++, alive: true, atkCd: 0.3 + this.rng.next() * 0.8, buffs: [], dots: [], shield: 0,
        stunUntil: 0, tauntUntil: 0, revived: false, anim: { lunge: 0, hit: 0, cast: 0 }, def: 0, dodge: 0, resist: 0, thorns: 0, lifesteal: 0, revive: 0,
        crit: 5, fx: null, fxChance: 0, skillPower: 1, skills: [],
      }, d);
      u.hp = u.maxHp;
      this.units.push(u);
      return u;
    }

    _spawnWave(i) {
      this.wave = i;
      const w = CW.WAVES[i];
      const b = this.biome;
      const list = [];
      if (w.boss) {
        list.push(b.boss);
        for (let k = 0; k < w.adds; k++) list.push(this.rng.pick(b.enemies));
      } else {
        for (let k = 0; k < w.mobs; k++) list.push(this.rng.pick(b.enemies));
        if (w.eliteRoll && this.rng.chance(this.mods.eliteChance)) list[0] = b.elite;
        if (this.mods.eliteChance > CW.BATTLE.baseEliteChance && i === 0 && this.rng.chance(this.mods.eliteChance * 0.5)) list[list.length - 1] = b.elite;
      }
      const n = list.length;
      list.forEach((key, k) => {
        const def = CW.ENEMIES[key];
        const boss = !!def.boss;
        const x = boss ? 270 : 270 + (k - (n - 1) / 2) * (n > 4 ? 92 : 104);
        const y = boss ? 300 : 300 + (k % 2) * 70 - (def.elite ? 20 : 0);
        const enr = boss && this.mods.bossEnraged;
        this._unit({
          side: 'enemy', key, name: def.name, def, boss, elite: !!def.elite, shape: def.shape, color: def.color, size: def.size,
          maxHp: Math.round(def.hp * CW.BATTLE.enemyHpScale * (1 + this.mods.enemyHp)),
          atk: def.atk * CW.BATTLE.enemyAtkScale * (1 + this.mods.enemyDmg) * (enr ? 1 + CW.BATTLE.bossEnrage.atk : 1),
          aspd: def.aspd * (enr ? 1 + CW.BATTLE.bossEnrage.aspd : 1),
          range: 'melee', hx: boss ? 270 : x, hy: y, x: boss ? 270 : x, y: y - 260, crit: 5,
          specialCd: boss ? 6 : def.elite ? 5 : 0, enraged: enr, addsSpawned: false,
        });
      });
      // boss adds placed either side of boss
      if (w.boss) {
        const adds = this.enemies().filter((e) => !e.boss);
        adds.forEach((a, k) => { a.hx = k % 2 ? 450 : 90; a.hy = 380; a.x = a.hx; a.y = a.hy - 260; });
      }
      this.emit({ type: 'wave', wave: i, boss: !!w.boss, total: CW.WAVES.length });
    }

    // ------------------------------------------------------------ combat maths
    _buffVal(u, type) { let v = 0; for (const b of u.buffs) if (b.type === type && b.until > this.time) v += b.val; return v; }

    _pickEnemyTarget(attacker) {
      const ens = this.enemies();
      if (!ens.length) return null;
      if (attacker.range === 'melee') {
        // closest-ish: prefer non-boss adds first? no — melee hits the frontmost
        return ens.slice().sort((a, b) => Math.abs(a.hx - attacker.hx) - Math.abs(b.hx - attacker.hx) + (b.hy - a.hy) * 0.5)[0];
      }
      // ranged focus the lowest hp% target 50% of the time
      if (this.rng.chance(0.5)) return ens.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      return this.rng.pick(ens);
    }
    _pickPartyTarget() {
      const p = this.party();
      if (!p.length) return null;
      const taunter = p.find((u) => u.tauntUntil > this.time);
      if (taunter && this.rng.chance(0.75)) return taunter;
      return this.rng.weighted(p, (u) => (u.role === 'tank' ? 2.6 : u.range === 'melee' ? 1.6 : 1) * (u.summon ? 1.2 : 1));
    }

    _hit(src, tgt, power, opt = {}) {
      if (!tgt || !tgt.alive) return 0;
      let dmg = src.atk * power * this.rng.range(0.9, 1.1);
      if (src.side === 'party') dmg *= 1 + this._buffVal(src, 'dmg');
      let crit = false;
      const critChance = (src.crit + (opt.critBonus || 0)) / 100;
      if (opt.forceCrit || this.rng.chance(critChance)) { crit = true; dmg *= CW.BATTLE.critMult; }
      if (tgt.side === 'party') {
        const dodge = tgt.dodge + this._buffVal(tgt, 'dodge') / 100;
        if (!opt.unavoidable && this.rng.chance(dodge)) { this.emit({ type: 'dmg', tid: tgt.id, sid: src.id, amount: 0, dodge: true }); return 0; }
        dmg *= (1 - tgt.def) * (1 - tgt.resist);
        if (tgt.thorns && src.alive) { const th = dmg * tgt.thorns; this._applyDamage(tgt, src, th, false, 'thorns'); }
      }
      dmg = Math.max(1, Math.round(dmg));
      this._applyDamage(src, tgt, dmg, crit, opt.fx || null);
      if (src.side === 'party') {
        const ls = src.lifesteal + (opt.lifesteal || 0);
        if (ls) this._heal(src, src, dmg * ls, true);
        if (!opt.noFx && src.fx && this.rng.chance(src.fxChance)) this._weaponFx(src, tgt, dmg);
      }
      return dmg;
    }

    _applyDamage(src, tgt, dmg, crit, fx) {
      if (!tgt.alive) return;
      let absorbed = 0;
      if (tgt.shield > 0) { absorbed = Math.min(tgt.shield, dmg); tgt.shield -= absorbed; }
      const real = dmg - absorbed;
      tgt.hp -= real;
      tgt.anim.hit = 0.25;
      const sst = this._statFor(src);
      if (sst) sst.dmg += dmg;
      if (this.stats[tgt.id]) this.stats[tgt.id].taken += real;
      this.emit({ type: 'dmg', tid: tgt.id, sid: src.id, amount: Math.round(dmg), crit, fx, shielded: absorbed > 0 });
      if (tgt.hp <= 0) this._die(tgt, src);
    }

    _die(u, killer) {
      if (u.side === 'party' && u.revive && !u.revived) {
        u.revived = true; u.hp = Math.round(u.maxHp * u.revive);
        this.emit({ type: 'revive', tid: u.id, by: 'gear' });
        return;
      }
      u.alive = false; u.hp = 0;
      if (killer && this.stats[killer.id]) this.stats[killer.id].kills++;
      this.emit({ type: 'death', tid: u.id, side: u.side, boss: !!u.boss });
    }

    _statFor(u) { return this.stats[u.id] || (u.statOwner ? this.stats[u.statOwner] : null); }

    _heal(src, tgt, amt, quiet) {
      if (!tgt || !tgt.alive) return 0;
      const real = Math.min(tgt.maxHp - tgt.hp, Math.round(amt));
      if (real <= 0) return 0;
      tgt.hp += real;
      const sst = this._statFor(src);
      if (sst) sst.heal += real;
      if (!quiet || real > 25) this.emit({ type: 'heal', tid: tgt.id, sid: src.id, amount: real });
      return real;
    }

    _dot(src, tgt, type, dps, dur) {
      if (!tgt.alive) return;
      const ex = tgt.dots.find((d) => d.type === type && d.src === src.id);
      if (ex && type !== 'poison') { ex.until = this.time + dur; ex.dps = Math.max(ex.dps, dps); return; }
      tgt.dots.push({ type, dps, until: this.time + dur, src: src.id, tick: 0 });
    }

    _weaponFx(src, tgt, dmg) {
      const fx = src.fx;
      this.emit({ type: 'wfx', fx, sid: src.id, tid: tgt.id });
      switch (fx) {
        case 'burn': this._dot(src, tgt, 'burn', src.atk * 0.35, 3); break;
        case 'bleed': this._dot(src, tgt, 'bleed', src.atk * 0.3, 4); break;
        case 'poison': this._dot(src, tgt, 'poison', src.atk * 0.22, 4); break;
        case 'stun': tgt.stunUntil = Math.max(tgt.stunUntil, this.time + (tgt.boss ? 0.4 : CW.BATTLE.stunSec)); break;
        case 'chain': {
          const others = this.enemies().filter((e) => e !== tgt).slice(0, 2);
          for (const o of others) this._hit(src, o, 0.6, { noFx: true, fx: 'chain' });
          break;
        }
        case 'holy': {
          const low = this.party().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
          this._heal(src, low, dmg * 0.6);
          break;
        }
        case 'voidEcho':
          this._delayed(0.4, () => { if (tgt.alive) this._hit(src, tgt, 0.85, { noFx: true, fx: 'voidEcho' }); else { const e = this._pickEnemyTarget(src); if (e) this._hit(src, e, 0.85, { noFx: true, fx: 'voidEcho' }); } });
          break;
        case 'cataclysm':
          for (const e of this.enemies()) this._hit(src, e, 0.7, { noFx: true, fx: 'cataclysm' });
          this.emit({ type: 'shake', power: 6 });
          break;
      }
    }

    _delayed(sec, fn) { (this._timers || (this._timers = [])).push({ at: this.time + sec, fn }); }

    _attack(u) {
      const tgt = u.side === 'party' ? this._pickEnemyTarget(u) : this._pickPartyTarget();
      if (!tgt) return;
      if (u.side === 'party' && u.role === 'healer') {
        const low = this.party().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (low && low.hp / low.maxHp < 0.7) {
          this.projectiles.push({ id: this._uid++, from: u.id, to: low.id, x: u.x, y: u.y, kind: 'heal', speed: 520, payload: () => this._heal(u, low, u.atk * 1.6 * u.skillPower) });
          u.anim.cast = 0.25;
          return;
        }
      }
      if (u.range === 'ranged') {
        const kind = u.dmgType === 'spell' ? (u.fx || 'bolt') : 'arrow';
        this.projectiles.push({ id: this._uid++, from: u.id, to: tgt.id, x: u.x, y: u.y, kind, speed: 620, rarity: u.weaponRarity, payload: () => this._hit(u, tgt, 1) });
        u.anim.cast = 0.25;
      } else {
        u.anim.lunge = 0.28;
        u.lungeTo = tgt.id;
        this._hit(u, tgt, 1);
      }
    }

    // ------------------------------------------------------------ skills
    canCast(u, idx) {
      const s = u.skills[idx];
      return !!(s && u.alive && s.cdLeft <= 0 && this.state === 'fight' && this.time >= u.stunUntil && this.enemies().length);
    }
    castSkill(uid, idx) {
      const u = typeof uid === 'string' ? this.get(uid) : uid;
      if (!this.canCast(u, idx)) return false;
      const s = u.skills[idx]; const d = s.def; const P = u.skillPower;
      s.cdLeft = d.cd;
      u.anim.cast = 0.45;
      this.emit({ type: 'cast', sid: u.id, skill: s.id, name: d.name, human: u.isHuman });
      const ens = this.enemies();
      switch (d.type) {
        case 'multi': ens.slice(0, d.hits).forEach((e) => this._hit(u, e, d.power * P, { fx: 'skill' })); u.anim.lunge = 0.3; break;
        case 'aoe':
          for (const e of ens) {
            const dealt = this._hit(u, e, d.power * P, { fx: 'skill' });
            if (d.stun) e.stunUntil = Math.max(e.stunUntil, this.time + (e.boss ? 0.6 : d.stun));
            if (d.burn) this._dot(u, e, 'burn', u.atk * 0.4, 3);
            if (d.drainHeal) for (const a of this.party()) this._heal(u, a, (dealt * d.drainHeal) / Math.max(1, this.party().length));
          }
          this.emit({ type: 'shake', power: 5 });
          break;
        case 'random': for (let i = 0; i < d.hits; i++) { const e = this.rng.pick(this.enemies()); if (e) this._hit(u, e, d.power * P, { fx: 'skill', lifesteal: d.lifesteal || 0 }); } break;
        case 'single': { const e = ens.slice().sort((a, b) => b.hp - a.hp)[0]; this._hit(u, e, d.power * P, { forceCrit: d.forceCrit, critBonus: d.critBonus || 0, fx: 'skill' }); break; }
        case 'splash': { const e = this._pickEnemyTarget(u); this._hit(u, e, d.power * P, { fx: 'skill' }); for (const o of ens) if (o !== e) this._hit(u, o, d.splash * P, { noFx: true, fx: 'burn' }); break; }
        case 'buffParty': for (const a of this.party()) a.buffs.push({ type: 'dodge', val: d.dodge, until: this.time + d.dur }); break;
        case 'buffSelf': u.buffs.push({ type: 'aspd', val: d.aspd, until: this.time + d.dur }); break;
        case 'taunt': u.tauntUntil = this.time + d.dur; u.shield += u.maxHp * d.shield * P; break;
        case 'shieldParty': for (const a of this.party()) a.shield += a.maxHp * d.shield * P; break;
        case 'summon':
          for (let i = 0; i < d.count; i++) {
            const sk = this._unit({ side: 'party', name: 'Skeleton', summon: true, owner: u.id, classId: 'skeleton', role: 'dps', range: 'melee', maxHp: Math.round(160 * P), atk: 14 * P, aspd: 1.0, crit: 5, hx: u.hx + (i ? 40 : -40), hy: PARTY_ROWS.front - 40, lifetime: 12, look: null });
            sk.x = u.x; sk.y = u.y;
            this.stats[sk.id] = null;
            sk.statOwner = u.id;
          }
          break;
        case 'heal': { const low = this.party().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; this._heal(u, low, low.maxHp * d.power * P); break; }
        case 'healParty': {
          for (const a of this.party()) this._heal(u, a, a.maxHp * d.power * P);
          if (d.revive) { const dead = this.heroes(false).find((h) => !h.alive); if (dead) { dead.alive = true; dead.hp = Math.round(dead.maxHp * 0.3); this.emit({ type: 'revive', tid: dead.id, by: u.id }); } }
          break;
        }
      }
      return true;
    }

    _botCast(u) {
      for (let i = 0; i < u.skills.length; i++) {
        if (!this.canCast(u, i)) continue;
        const d = u.skills[i].def;
        if ((d.type === 'heal' || d.type === 'healParty')) {
          const need = this.party().filter((a) => a.hp / a.maxHp < (d.type === 'heal' ? 0.7 : 0.6)).length;
          const dead = d.revive && this.heroes(false).some((h) => !h.alive);
          if (!need && !dead) continue;
        }
        if (d.type === 'taunt' && u.hp / u.maxHp < 0.25) continue;
        if (u.botCastDelay > 0) return;
        u.botCastDelay = 0.3 + this.rng.next() * 0.9;
        this.castSkill(u, i);
        return;
      }
    }

    _enemySpecial(e) {
      if (e.boss) {
        if (this.rng.chance(0.5)) {
          this.emit({ type: 'bossSlam', sid: e.id });
          for (const a of this.party()) this._hit(e, a, 0.55, { fx: 'slam' });
          this.emit({ type: 'shake', power: 9 });
        } else {
          const t = this._pickPartyTarget();
          this.emit({ type: 'bossChomp', sid: e.id, tid: t && t.id });
          this._hit(e, t, 2.3, { fx: 'chomp' });
        }
        e.specialCd = e.enraged ? 5 : 7;
      } else if (e.elite) {
        const ts = this.rng.shuffle(this.party()).slice(0, 2);
        for (const t of ts) this._hit(e, t, 1.3, { fx: 'slam' });
        this.emit({ type: 'shake', power: 4 });
        e.specialCd = 6;
      }
    }

    // ------------------------------------------------------------ loop
    update(dt) {
      if (this.state === 'won' || this.state === 'lost') return;
      this.time += dt;
      if (this._timers) {
        const due = this._timers.filter((t) => t.at <= this.time);
        this._timers = this._timers.filter((t) => t.at > this.time);
        for (const t of due) t.fn();
      }
      if (this.state === 'intro' || this.state === 'waveClear') {
        this._tickMove(dt);
        if (this.time >= this.stateEnd) {
          if (this.wave + 1 >= CW.WAVES.length) return this._end(true);
          this._spawnWave(this.wave + 1);
          this.state = 'fight';
        }
        return;
      }
      if (this.state !== 'fight') return;
      if (this.time > CW.BATTLE.maxTime) return this._end(false, 'timeout');

      for (const u of this.units) {
        if (!u.alive) continue;
        u.buffs = u.buffs.filter((b) => b.until > this.time);
        // dots
        for (const d of u.dots) {
          d.tick += dt;
          if (d.tick >= 0.5) { d.tick -= 0.5; const src = this.get(d.src) || u; this._applyDamage(src, u, Math.round(d.dps * 0.5), false, d.type); }
        }
        u.dots = u.dots.filter((d) => d.until > this.time);
        if (!u.alive) continue;
        if (u.summon) { u.lifetime -= dt; if (u.lifetime <= 0) { u.alive = false; this.emit({ type: 'death', tid: u.id, side: 'party', summon: true }); continue; } }
        for (const s of u.skills) s.cdLeft = Math.max(0, s.cdLeft - dt);
        if (u.botCastDelay > 0) u.botCastDelay -= dt;
        if (this.time < u.stunUntil) continue;
        const aspd = u.aspd * (1 + this._buffVal(u, 'aspd'));
        u.atkCd -= dt * aspd;
        if (u.atkCd <= 0) { u.atkCd += 1; this._attack(u); }
        if (u.side === 'party' && (!u.isHuman || this.autoHuman)) this._botCast(u);
        if (u.side === 'enemy' && u.specialCd) { u.specialCd -= dt; if (u.specialCd <= 0) this._enemySpecial(u); }
        if (u.boss && u.enraged && !u.addsSpawned && u.hp < u.maxHp / 2) {
          u.addsSpawned = true;
          this.emit({ type: 'enrage', sid: u.id });
          for (let i = 0; i < CW.BATTLE.bossEnrage.addsAtHalf; i++) {
            const key = this.rng.pick(this.biome.enemies), def = CW.ENEMIES[key];
            const a = this._unit({ side: 'enemy', key, name: def.name, def, shape: def.shape, color: def.color, size: def.size, maxHp: Math.round(def.hp * CW.BATTLE.enemyHpScale * (1 + this.mods.enemyHp)), atk: def.atk * CW.BATTLE.enemyAtkScale * (1 + this.mods.enemyDmg), aspd: def.aspd, range: 'melee', hx: 110 + i * 160, hy: 430, x: 270, y: 300, crit: 5, specialCd: 0 });
            a.hx = 110 + i * 160;
          }
        }
        if (u.anim.lunge > 0) u.anim.lunge -= dt;
        if (u.anim.hit > 0) u.anim.hit -= dt;
        if (u.anim.cast > 0) u.anim.cast -= dt;
      }
      // projectiles
      for (const p of this.projectiles) {
        const t = this.get(p.to);
        if (!t || !t.alive) { p.dead = true; continue; }
        const dx = t.x - p.x, dy = t.y - 30 - p.y, d = Math.hypot(dx, dy);
        const step = p.speed * dt;
        if (d <= step) { p.dead = true; p.payload(); } else { p.x += (dx / d) * step; p.y += (dy / d) * step; }
      }
      this.projectiles = this.projectiles.filter((p) => !p.dead);
      this._tickMove(dt);

      if (!this.heroes().length) return this._end(false);
      if (!this.enemies().length) {
        this.emit({ type: 'waveClear', wave: this.wave });
        for (const u of this.party(false)) if (u.summon) u.alive = false;
        for (const h of this.heroes()) { this._heal(h, h, h.maxHp * CW.BATTLE.waveHealPct, true); h.dots = []; }
        this.projectiles = [];
        this.state = 'waveClear';
        this.stateEnd = this.time + 1.8;
      }
    }

    _tickMove(dt) {
      for (const u of this.units) {
        if (!u.alive) continue;
        const tx = u.hx, ty = u.hy;
        u.x += (tx - u.x) * Math.min(1, dt * 4);
        u.y += (ty - u.y) * Math.min(1, dt * 4);
      }
    }

    _end(won, why) {
      this.state = won ? 'won' : 'lost';
      this.result = { won, why: why || null, time: this.time, wave: this.wave };
      this.emit({ type: won ? 'victory' : 'defeat', why });
    }

    forceWin() { for (const e of this.enemies()) { e.alive = false; e.hp = 0; } this.wave = CW.WAVES.length - 1; this._end(true, 'debug'); }
    forceLose() { for (const u of this.party()) { u.alive = false; u.hp = 0; } this._end(false, 'debug'); }

    // headless run (tests / balance sim)
    runToEnd(step = 1 / 30, maxSec = 400) {
      let t = 0;
      while (this.state !== 'won' && this.state !== 'lost' && t < maxSec) { this.update(step); t += step; this.events.length = 0; }
      return this.result;
    }
  }
  CW.Battle = Battle;

  // ------------------------------------------------------------ REWARDS
  CW.computeRewards = function ({ won, potX100, modeId, rng, humanStats, mvp }) {
    const E = CW.ECONOMY;
    const mult = potX100 / 100;
    const lines = [];
    const tokens = { chaos: 0, jack: 0, grief: 0 };
    let coins = 0;
    if (won) {
      lines.push({ label: 'RAID CLEARED', value: E.winBase });
      const extra = Math.round(E.winBase * mult) - E.winBase;
      if (extra > 0) lines.push({ label: `RAID POT ${CW.potLabel(potX100)}`, value: extra, pot: true });
      coins = E.winBase + extra;
      if (mvp) { lines.push({ label: 'MVP BONUS', value: E.mvpBonus }); coins += E.mvpBonus; }
      for (const k of ['chaos', 'jack', 'grief']) {
        if (k === 'grief' && modeId !== 'grief') continue;
        if (rng.chance(Math.min(0.9, E.tokenDrops[k] * mult))) tokens[k]++;
      }
    } else {
      lines.push({ label: 'CONSOLATION', value: E.lossConsolation });
      coins = E.lossConsolation;
      if (rng.chance(E.lossTokenDrop)) tokens.chaos++;
    }
    return { won, coins, tokens, lines, mult, greedy: !won && potX100 >= 150 };
  };
})(typeof window !== 'undefined' ? window : globalThis);
