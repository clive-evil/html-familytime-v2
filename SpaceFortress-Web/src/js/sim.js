// Game rules. Pure state + functions, no DOM. Node-testable.
(function () {
  const SF = globalThis.SF;
  const { clamp, rand } = SF;
  const SAVE_VERSION = 1;

  // ------------------------------------------------------------------ creation
  SF.newGame = function (opts) {
    opts = opts || {};
    const F = SF.FORT_BASE;
    const g = {
      v: SAVE_VERSION,
      seed: opts.seed == null ? (Date.now() & 0x7fffffff) : opts.seed,
      rng: 0,
      cycle: 1,
      sysIndex: 0,
      sysStartCycle: 1,
      res: { metals: 120, fissile: 10, crystals: 12, exotic: 0 },
      troops: F.troops,
      fort: { hull: F.hull, shield: F.shield, power: F.power },
      weapons: {
        railgun: { shots: 0, offline: 0 },
        laser: { shots: 0, offline: 0, heat: 0, overheated: 0 },
        missile: { shots: 0, offline: 0 },
        bombard: { shots: 0, offline: 0 },
      },
      pk: { cooldown: 0, fired: 0 },
      upgrades: {},
      systems: [],
      invasions: [],
      log: [],
      stats: { shots: 0, manualShots: 0, perfectShots: 0, troopsLost: 0, civilians: 0, captured: 0, destroyed: 0, nukes: 0, planetKills: 0, damageTaken: 0 },
      tutorial: { active: !!opts.tutorial, step: 0, done: !opts.tutorial },
      flags: {},
      over: null,
    };
    g.rng = g.seed | 0;
    SF.enterSystem(g, 0);
    g.fort.power = SF.powerMax(g);
    return g;
  };

  function instFromDef(def, idx, n, pid) {
    const A = SF.INST[def.type];
    const hp = def.hp || A.hp;
    // Spread installations over the visible disk (golden-angle spiral).
    const ang = idx * 2.399963 + (pid.length * 0.7);
    const rr = 0.25 + 0.5 * Math.sqrt((idx + 0.5) / Math.max(n, 1));
    return {
      id: pid + ':' + idx,
      type: def.type,
      name: def.name || A.name,
      hp, maxHp: hp,
      yields: def.yields || null,
      garrison: def.garrison || 0,
      militia: def.militia || 0,
      recruits: def.recruits || 0,
      fortDmg: def.fortDmg != null ? def.fortDmg : A.fortDmg || 0,
      level: def.type === 'mine' ? 1 : 0,
      disabled: 0,
      pos: A.orbital ? [Math.cos(ang) * 1.25, Math.sin(ang) * 0.5 - 0.9] : [Math.cos(ang) * rr, Math.sin(ang) * rr],
    };
  }

  SF.enterSystem = function (g, idx) {
    const def = SF.CAMPAIGN[idx];
    g.sysIndex = idx;
    g.sysStartCycle = g.cycle;
    if (!g.systems[idx]) {
      g.systems[idx] = {
        id: def.id,
        planets: def.planets.map((p) => ({
          id: p.id, name: p.name, type: p.type, owner: p.owner, parent: p.parent || null,
          orbit: p.orbit, angle: p.angle, size: p.size,
          pop: p.pop, popMax: p.pop, scanned: p.owner === 'neutral' ? false : false,
          insts: p.insts.map((d, i) => instFromDef(d, i, p.insts.length, p.id)),
          garrisonMod: 1, contamination: 0, spoils: p.spoils || null, desc: p.desc,
          scorch: 0,
        })),
        fleets: [],
        secured: false,
        fleetIdx: 0,
      };
    }
    g.invasions = g.invasions.filter((iv) => iv.sys === idx);
    SF.log(g, 'Fortress arrives in ' + def.name + '. ' + def.brief, 'sys');
  };

  SF.log = function (g, t, k) {
    g.log.push({ c: g.cycle, t, k: k || 'info' });
    if (g.log.length > 120) g.log.splice(0, g.log.length - 120);
  };

  // ------------------------------------------------------------------ lookups
  SF.sysDef = (g) => SF.CAMPAIGN[g.sysIndex];
  SF.curSys = (g) => g.systems[g.sysIndex];
  SF.planet = function (g, pid) {
    for (const s of g.systems) if (s) for (const p of s.planets) if (p.id === pid) return p;
    return null;
  };
  SF.inst = function (p, iid) { return p ? p.insts.find((i) => i.id === iid) || null : null; };
  SF.fleet = function (g, fid) { return SF.curSys(g).fleets.find((f) => f.id === fid) || null; };
  SF.has = (g, u) => !!g.upgrades[u];
  SF.alive = (i) => i.hp > 0;
  SF.activeInst = (i) => i.hp > 0 && !i.disabled;
  SF.planetSys = function (g, pid) {
    for (let s = 0; s < g.systems.length; s++) if (g.systems[s] && g.systems[s].planets.some((p) => p.id === pid)) return s;
    return -1;
  };

  // ------------------------------------------------------------------ fortress stats
  SF.powerMax = (g) => SF.FORT_BASE.power + (SF.has(g, 'fort_reactor') ? 40 : 0) + (SF.has(g, 'fort_modules') ? 30 : 0);
  SF.hullMax = (g) => SF.FORT_BASE.hull + (SF.has(g, 'fort_modules') ? 40 : 0) + (SF.has(g, 'def_armour') ? 60 : 0);
  SF.shieldMax = (g) => SF.FORT_BASE.shield + (SF.has(g, 'fort_modules') ? 20 : 0);
  SF.shieldRegen = (g) => SF.FORT_BASE.shieldRegen + (SF.has(g, 'def_pd') ? 8 : 0);
  SF.troopCap = (g) => SF.FORT_BASE.troopCap + (SF.has(g, 'troop_bay') ? 30000 : 0);
  SF.troopRegen = (g) => SF.FORT_BASE.troopRegen + (SF.has(g, 'troop_bay') ? 1000 : 0);
  SF.weaponPower = function (g, wid) {
    let p = SF.WEAPONS[wid].power;
    if (wid === 'railgun' && SF.has(g, 'rail_caps')) p -= 10;
    return p;
  };
  SF.perCycle = function (g, wid) {
    if (wid === 'railgun') return SF.has(g, 'rail_twin') ? 2 : 1;
    if (wid === 'missile') return SF.has(g, 'mis_smart') ? 2 : 1;
    return SF.WEAPONS[wid].perCycle;
  };
  SF.laserHeatPerShot = (g) => (SF.has(g, 'laser_cool') ? 30 : 40);
  SF.laserCooling = (g) => (SF.has(g, 'laser_cool') ? 60 : 35);

  // ------------------------------------------------------------------ resources
  SF.canAfford = function (g, cost) {
    if (!cost) return true;
    for (const r of SF.RES) if ((cost[r] || 0) > g.res[r] + 1e-9) return false;
    if ((cost.power || 0) > g.fort.power + 1e-9) return false;
    return true;
  };
  SF.pay = function (g, cost) {
    if (!SF.canAfford(g, cost)) return false;
    for (const r of SF.RES) if (cost[r]) g.res[r] = Math.max(0, g.res[r] - cost[r]);
    if (cost.power) g.fort.power = Math.max(0, g.fort.power - cost.power);
    return true;
  };
  SF.gain = function (g, gain, mult) {
    mult = mult == null ? 1 : mult;
    for (const r of SF.RES) if (gain && gain[r]) g.res[r] += gain[r] * mult;
  };

  // ------------------------------------------------------------------ planet analysis
  SF.powerEff = function (p) {
    const ps = p.insts.filter((i) => i.type === 'power');
    if (!ps.length) return 1;
    return ps.some(SF.activeInst) ? 1 : 0.5;
  };
  SF.shieldUp = (p) => p.insts.some((i) => i.type === 'shield' && SF.activeInst(i));
  SF.interceptChance = function (g, p) {
    let miss = 1;
    const eff = SF.powerEff(p);
    for (const i of p.insts) if (i.type === 'interceptor' && SF.activeInst(i)) miss *= 1 - SF.INST.interceptor.intercept * (i.hp / i.maxHp) * eff;
    let c = 1 - miss;
    if (SF.has(g, 'mis_smart')) c *= 0.5;
    return c;
  };
  SF.enemyGround = function (p) {
    if (p.owner !== 'enemy') return 0;
    let g = 0;
    for (const i of p.insts) {
      const f = i.hp / i.maxHp;
      if (i.type === 'barracks' || i.type === 'bunker' || i.type === 'hq') g += i.garrison * f;
      if (i.type === 'city') g += i.militia * f;
    }
    return g * p.garrisonMod;
  };
  SF.enemyGroundMax = function (p) {
    let g = 0;
    for (const i of p.insts) g += (i.garrison || 0) + (i.militia || 0);
    return g;
  };
  SF.defenceMult = function (p) {
    let d = 1;
    const eff = SF.powerEff(p);
    if (SF.shieldUp(p)) d += 0.45 * eff;
    for (const i of p.insts) {
      if (!SF.activeInst(i)) continue;
      const f = i.hp / i.maxHp;
      if (i.type === 'cannon') d += SF.INST.cannon.invDef * f * eff;
      if (i.type === 'station') d += SF.INST.station.invDef * f;
      if (i.type === 'hq') d += SF.INST.hq.invDef * f;
    }
    return d;
  };
  // Planetary defence 0..1 rating for display.
  SF.defenceRating = function (p) {
    let cur = 0, max = 0;
    for (const i of p.insts) {
      const A = SF.INST[i.type];
      if (!A.mil || ['barracks', 'bunker'].includes(i.type)) continue;
      max += 1;
      cur += SF.activeInst(i) ? i.hp / i.maxHp : 0;
    }
    return max ? cur / max : 0;
  };

  SF.planetYield = function (p, full) {
    // full=true: max potential (Mine I, intact, uncontaminated)
    const y = { metals: 0, fissile: 0, crystals: 0, exotic: 0, troops: 0 };
    if (p.owner === 'destroyed') return y;
    for (const i of p.insts) {
      if (!SF.INST[i.type].econ || !i.yields) { if (i.type === 'city') y.troops += full ? i.recruits : i.recruits * (i.hp / i.maxHp); continue; }
      const f = full ? 1 : i.hp / i.maxHp;
      let m = f;
      if (i.type === 'mine') m *= full ? 1 : SF.MINE_MULT[i.level] * (1 - 0.6 * p.contamination);
      for (const r of SF.RES) if (i.yields[r]) y[r] += i.yields[r] * m;
      if (i.type === 'city') y.troops += full ? i.recruits : i.recruits * f;
    }
    return y;
  };
  SF.valueOf = (y) => y.metals + 2 * y.fissile + 2 * y.crystals + 6 * y.exotic + (y.troops || 0) / 400;
  SF.intactPct = function (p) {
    const full = SF.valueOf(SF.planetYield(p, true));
    if (full <= 0) return p.owner === 'destroyed' ? 0 : 1;
    const cur = SF.valueOf(SF.planetYield(p, false)) ;
    // Mine upgrades can push above 100%; clamp for readability.
    return clamp(cur / full, 0, 1);
  };
  SF.damageLevel = function (p) {
    if (p.owner === 'destroyed') return 1;
    let s = 0;
    for (const i of p.insts) s += 1 - i.hp / i.maxHp;
    return p.insts.length ? s / p.insts.length : 0;
  };
  SF.resourceRating = function (p, r) {
    const v = SF.planetYield(p, true)[r];
    if (v >= 12) return { label: 'Excellent', n: 4, v };
    if (v >= 6) return { label: 'High', n: 3, v };
    if (v >= 3) return { label: 'Moderate', n: 2, v };
    if (v > 0) return { label: 'Low', n: 1, v };
    return { label: 'None', n: 0, v };
  };

  // ------------------------------------------------------------------ invasion maths
  SF.invasionForecast = function (g, pid, troops) {
    const p = SF.planet(g, pid);
    const E = SF.enemyGround(p) * SF.defenceMult(p);
    const pods = SF.has(g, 'troop_pods');
    const atk = troops * (pods ? 1.15 : 1);
    const lossMult = pods ? 0.7 : 1;
    if (troops <= 0) return { chance: 0, expLoss: 0, lossWin: 0, lossLose: 0, cycles: 0, enemy: E };
    let chance;
    if (E < 50) chance = 0.99;
    else {
      const r = atk / E;
      const k = Math.pow(r, 2.4);
      chance = clamp(k / (1 + k), 0.02, 0.99);
    }
    const r = E < 50 ? 50 : atk / E;
    const lossWin = Math.min(troops * 0.9, (E * 0.5) / Math.sqrt(Math.max(r, 0.2))) * lossMult;
    const lossLose = troops * 0.65 * lossMult;
    const expLoss = chance * lossWin + (1 - chance) * lossLose;
    let cycles = r >= 2.2 ? 1 : r >= 1.3 ? 2 : 3;
    if (pods) cycles = Math.max(1, cycles - 1);
    return { chance, expLoss, lossWin, lossLose, cycles, enemy: E };
  };
  // Smallest commitment (in 1k steps) reaching the target chance, capped at available troops.
  SF.suggestTroops = function (g, pid, target) {
    target = target || 0.85;
    const avail = g.troops;
    for (let t = 1000; t <= avail; t += 1000) if (SF.invasionForecast(g, pid, t).chance >= target) return t;
    return Math.floor(avail / 1000) * 1000;
  };

  // ------------------------------------------------------------------ action checks
  SF.troopsOnSurface = (g, pid) => g.invasions.some((iv) => iv.pid === pid);

  SF.weaponState = function (g, wid) {
    const W = SF.WEAPONS[wid];
    const ws = g.weapons[wid];
    if (W.req && !SF.has(g, W.req)) return { ok: false, reason: 'NOT INSTALLED', locked: true };
    if (ws.offline > 0) return { ok: false, reason: 'DAMAGED: OFFLINE ' + ws.offline + ' CYCLE' + (ws.offline > 1 ? 'S' : '') };
    if (wid === 'laser' && ws.overheated > 0) return { ok: false, reason: 'OVERHEATED' };
    if (ws.shots >= SF.perCycle(g, wid)) return { ok: false, reason: wid === 'railgun' ? 'RECHARGING' : 'RELOADING' };
    if (g.fort.power < SF.weaponPower(g, wid)) return { ok: false, reason: 'INSUFFICIENT POWER' };
    return { ok: true };
  };
})();
