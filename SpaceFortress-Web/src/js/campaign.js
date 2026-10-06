// Strategic actions, cycle resolution, enemy pressure, progression, save/load.
(function () {
  const SF = globalThis.SF;
  const { clamp, rand } = SF;

  SF.scan = function (g, pid) {
    const p = SF.planet(g, pid);
    if (!p || p.scanned || p.owner === 'destroyed') return { ok: false, reason: 'NOTHING TO SCAN' };
    if (!SF.pay(g, SF.COSTS.scan)) return { ok: false, reason: 'INSUFFICIENT POWER' };
    p.scanned = true;
    SF.log(g, 'Deep scan of ' + p.name + ' complete: ' + p.insts.length + ' installations identified.', 'info');
    return { ok: true };
  };

  SF.claim = function (g, pid) {
    const p = SF.planet(g, pid);
    if (!p || p.owner !== 'neutral') return { ok: false, reason: 'NOT CLAIMABLE' };
    const c = { power: SF.COSTS.claim.power, metals: SF.COSTS.claim.metals };
    if (!SF.pay(g, c)) return { ok: false, reason: 'INSUFFICIENT RESOURCES' };
    p.owner = 'player'; p.scanned = true;
    g.stats.captured++;
    SF.log(g, p.name + ' claimed. Mining rigs online.', 'gain');
    return { ok: true };
  };

  SF.deploy = function (g, pid, troops) {
    const p = SF.planet(g, pid);
    troops = Math.floor(troops);
    if (!p || p.owner !== 'enemy') return { ok: false, reason: 'NOT HOSTILE' };
    if (SF.planetSys(g, pid) !== g.sysIndex) return { ok: false, reason: 'OUT OF RANGE' };
    if (!p.scanned) return { ok: false, reason: 'SCAN REQUIRED' };
    if (SF.troopsOnSurface(g, pid)) return { ok: false, reason: 'INVASION ALREADY UNDER WAY' };
    if (troops < 1000) return { ok: false, reason: 'COMMIT AT LEAST 1,000' };
    if (troops > g.troops) return { ok: false, reason: 'NOT ENOUGH TROOPS' };
    const f = SF.invasionForecast(g, pid, troops);
    g.troops -= troops;
    g.invasions.push({ pid, sys: g.sysIndex, troops, cycles: f.cycles, startChance: f.chance });
    SF.log(g, SF.fmtInt(troops) + ' troops deploying to ' + p.name + '. Victory chance ' + SF.pct(f.chance) + ', est. ' + f.cycles + ' cycle(s).', 'info');
    return { ok: true, forecast: f };
  };

  SF.capturePlanet = function (g, p) {
    p.owner = 'player';
    p.garrisonMod = 0;
    for (const i of p.insts) { i.disabled = 0; if (SF.INST[i.type].mil) i.hp = Math.min(i.hp, i.maxHp); }
    g.stats.captured++;
    if (p.spoils) {
      // Spoils scale with how intact the world is.
      const k = 0.4 + 0.6 * SF.intactPct(p);
      SF.gain(g, p.spoils, k);
      SF.log(g, p.name + ' CAPTURED. Spoils seized: ' + SF.costText(Object.fromEntries(Object.entries(p.spoils).map(([r, v]) => [r, Math.round(v * k)]))) + '.', 'gain');
    } else SF.log(g, p.name + ' CAPTURED.', 'gain');
  };

  SF.mineUpgradeCost = (i) => (i.level === 1 ? SF.COSTS.mine2 : i.level === 2 ? SF.COSTS.mine3 : null);
  SF.upgradeMine = function (g, pid, iid) {
    const p = SF.planet(g, pid); const i = SF.inst(p, iid);
    if (!p || p.owner !== 'player' || !i || i.type !== 'mine' || i.hp <= 0) return { ok: false, reason: 'INVALID' };
    const c = SF.mineUpgradeCost(i);
    if (!c) return { ok: false, reason: 'MAX LEVEL' };
    if (!SF.pay(g, c)) return { ok: false, reason: 'INSUFFICIENT RESOURCES' };
    i.level++;
    SF.log(g, i.name + ' on ' + p.name + ' upgraded to ' + SF.MINE_NAME[i.level] + '.', 'gain');
    return { ok: true };
  };
  SF.repairCost = (i) => ({ metals: Math.ceil(((i.maxHp - i.hp) / i.maxHp) * 30) });
  SF.repairInst = function (g, pid, iid) {
    const p = SF.planet(g, pid); const i = SF.inst(p, iid);
    if (!p || p.owner !== 'player' || !i || !SF.INST[i.type].econ || i.hp <= 0 || i.hp >= i.maxHp) return { ok: false, reason: 'INVALID' };
    if (!SF.pay(g, SF.repairCost(i))) return { ok: false, reason: 'INSUFFICIENT RESOURCES' };
    i.hp = i.maxHp;
    return { ok: true };
  };

  SF.upgradeState = function (g, uid) {
    const U = SF.UPGRADES[uid];
    if (g.upgrades[uid]) return 'owned';
    if (U.req && !g.upgrades[U.req]) return 'locked';
    return SF.canAfford(g, U.cost) ? 'available' : 'unaffordable';
  };
  SF.buyUpgrade = function (g, uid) {
    const st = SF.upgradeState(g, uid);
    if (st !== 'available') return { ok: false, reason: st.toUpperCase() };
    SF.pay(g, SF.UPGRADES[uid].cost);
    g.upgrades[uid] = g.cycle;
    if (uid === 'fort_modules') { g.fort.shield += 20; g.fort.hull += 40; g.fort.power += 30; }
    if (uid === 'def_armour') g.fort.hull += 60;
    if (uid === 'fort_reactor') g.fort.power += 40;
    SF.log(g, 'FORTRESS UPGRADE: ' + SF.UPGRADES[uid].name + ' installed.', 'gain');
    return { ok: true };
  };

  SF.repairFortress = function (g) {
    const C = SF.COSTS.repair;
    if (g.fort.hull >= SF.hullMax(g)) return { ok: false, reason: 'HULL INTACT' };
    if (!SF.pay(g, { power: C.power, metals: C.metals })) return { ok: false, reason: 'INSUFFICIENT RESOURCES' };
    g.fort.hull = Math.min(SF.hullMax(g), g.fort.hull + C.hull);
    return { ok: true };
  };

  // ------------------------------------------------------------------ planet killer
  SF.pkState = function (g) {
    if (!SF.has(g, 'fort_pk')) return { ok: false, reason: 'INFRASTRUCTURE INCOMPLETE', locked: true };
    if (g.pk.cooldown > 0) return { ok: false, reason: 'RECHARGING: ' + g.pk.cooldown + ' CYCLES' };
    if (!SF.canAfford(g, SF.PK.cost)) return { ok: false, reason: 'INSUFFICIENT EXOTIC MATTER / FISSILE' };
    if (g.fort.power < SF.powerMax(g)) return { ok: false, reason: 'REQUIRES FULL REACTOR OUTPUT' };
    return { ok: true };
  };
  SF.canPlanetKill = function (g, pid) {
    const s = SF.pkState(g);
    if (!s.ok) return s;
    const p = SF.planet(g, pid);
    if (!p || SF.planetSys(g, pid) !== g.sysIndex) return { ok: false, reason: 'NO TARGET' };
    if (p.owner === 'player') return { ok: false, reason: 'FRIENDLY WORLD' };
    if (p.owner === 'destroyed') return { ok: false, reason: 'ALREADY DESTROYED' };
    if (SF.troopsOnSurface(g, pid)) return { ok: false, reason: 'OUR TROOPS ARE ON THE SURFACE' };
    return { ok: true };
  };
  SF.firePlanetKiller = function (g, pid) {
    const c = SF.canPlanetKill(g, pid);
    if (!c.ok) return c;
    const p = SF.planet(g, pid);
    SF.pay(g, SF.PK.cost);
    g.fort.power = 0;
    g.pk.cooldown = SF.PK.cooldown;
    g.pk.fired++;
    g.stats.planetKills++;
    g.stats.civilians += p.pop;
    const lost = SF.valueOf(SF.planetYield(p, true));
    p.pop = 0; p.owner = 'destroyed'; p.garrisonMod = 0;
    for (const i of p.insts) { i.hp = 0; i.disabled = 0; }
    g.stats.destroyed++;
    // Moons of a destroyed world are scoured too, but survive as rubble-claimable? No: they are lost with it.
    SF.log(g, p.name + ' ANNIHILATED. All future value (' + Math.round(lost) + '/cycle) erased.', 'loss');
    return { ok: true, lostValue: lost };
  };

  // ------------------------------------------------------------------ system flow
  SF.enemyWorlds = (g) => SF.curSys(g).planets.filter((p) => p.owner === 'enemy');
  SF.systemSecured = (g) => SF.enemyWorlds(g).length === 0 && SF.curSys(g).fleets.length === 0;
  SF.canJump = (g) => SF.systemSecured(g) && g.sysIndex < SF.CAMPAIGN.length - 1;
  SF.jump = function (g) {
    if (!SF.canJump(g)) return { ok: false, reason: 'SYSTEM NOT SECURED' };
    SF.curSys(g).secured = true;
    g.cycle++;
    SF.enterSystem(g, g.sysIndex + 1);
    g.fort.shield = SF.shieldMax(g);
    g.fort.hull = Math.min(SF.hullMax(g), g.fort.hull + 25);
    g.fort.power = SF.powerMax(g);
    for (const w in g.weapons) { g.weapons[w].shots = 0; g.weapons[w].offline = 0; }
    g.weapons.laser.heat = 0; g.weapons.laser.overheated = 0;
    return { ok: true };
  };

  // Grows every cycle spent in the system: the clock that stops perfect, slow play.
  SF.sectorStrike = function (g) {
    const def = SF.sysDef(g);
    const n = SF.enemyWorlds(g).length;
    if (!n || g.sysIndex === 0) return 0;
    const t = g.cycle - g.sysStartCycle;
    return def.threat * (3 * n + 2.2 * t);
  };

  SF.nextFleetIn = function (g) {
    const sch = SF.sysDef(g).fleets;
    const s = SF.curSys(g);
    if (s.fleetIdx >= sch.length) return null;
    return sch[s.fleetIdx] - (g.cycle - g.sysStartCycle);
  };

  SF.incomeOf = function (g) {
    const inc = { metals: SF.BASE_INCOME.metals, fissile: 0, crystals: 0, exotic: 0, troops: SF.troopRegen(g) };
    for (const s of g.systems) if (s) for (const p of s.planets) if (p.owner === 'player') {
      const y = SF.planetYield(p, false);
      for (const r of SF.RES) inc[r] += y[r];
      inc.troops += y.troops;
    }
    return inc;
  };

  function damageFortress(g, amt, src, report) {
    if (amt <= 0) return;
    const absorbed = Math.min(g.fort.shield, amt);
    g.fort.shield -= absorbed;
    const hull = amt - absorbed;
    g.fort.hull -= hull;
    g.stats.damageTaken += amt;
    report.fortDmg += amt;
    report.hullDmg += hull;
    report.attacks.push({ src, amt });
  }

  // ------------------------------------------------------------------ END CYCLE
  SF.endCycle = function (g) {
    if (g.over) return null;
    const rep = { cycle: g.cycle, fortDmg: 0, hullDmg: 0, attacks: [], invasions: [], income: null, fleetsArrived: [], raids: [], offline: [], events: [] };
    const def = SF.sysDef(g);
    const sys = SF.curSys(g);

    // 1. Invasions resolve.
    for (const iv of g.invasions.slice()) {
      iv.cycles--;
      if (iv.cycles > 0) continue;
      const p = SF.planet(g, iv.pid);
      g.invasions.splice(g.invasions.indexOf(iv), 1);
      if (p.owner !== 'enemy') { g.troops += iv.troops; continue; }
      const f = SF.invasionForecast(g, iv.pid, iv.troops);
      const win = (g.tutorial.active && !g.tutorial.done) || rand(g) < f.chance;
      let loss = win ? f.lossWin * (0.8 + rand(g) * 0.4) : f.lossLose * (0.85 + rand(g) * 0.3);
      loss = Math.min(iv.troops, Math.round(loss / 100) * 100);
      g.troops += iv.troops - loss;
      g.stats.troopsLost += loss;
      if (win) SF.capturePlanet(g, p);
      else { p.garrisonMod = clamp(p.garrisonMod * 0.7, 0, 1); SF.log(g, 'INVASION OF ' + p.name + ' REPULSED. ' + SF.fmtInt(loss) + ' troops lost.', 'loss'); }
      rep.invasions.push({ pid: p.id, win, loss, troops: iv.troops });
    }

    // 2. Enemy defences fire on the fortress.
    const pd = SF.has(g, 'def_pd') ? 0.6 : 1;
    for (const p of sys.planets) {
      if (p.owner !== 'enemy') continue;
      const eff = SF.powerEff(p);
      let dmg = 0;
      for (const i of p.insts) {
        if (!SF.activeInst(i) || !i.fortDmg) continue;
        const f = i.hp / i.maxHp;
        if (i.type === 'cannon') dmg += i.fortDmg * f * eff;
        else if (i.type === 'station') dmg += i.fortDmg * f;
        else if (i.type === 'silo' && (g.cycle - g.sysStartCycle) % 2 === 1) dmg += i.fortDmg * f * pd;
      }
      dmg *= def.threat;
      if (dmg > 0) damageFortress(g, dmg, p.name, rep);
    }

    // 2b. Sector command: escalating long-range strikes while any enemy world holds out.
    const holdouts = SF.enemyWorlds(g).length;
    if (holdouts) {
      const dmg = SF.sectorStrike(g);
      if (dmg > 0) damageFortress(g, dmg * pd, 'Sector Command long-range strike', rep);
    }

    // 3. Fleets: arrive, attack, raid.
    for (const fl of sys.fleets) {
      if (fl.eta > 0) { fl.eta--; if (fl.eta === 0) { rep.fleetsArrived.push(fl.id); SF.log(g, fl.name + ' has reached engagement range!', 'warn'); } continue; }
      const mine = sys.planets.filter((p) => p.owner === 'player' && p.insts.some((i) => i.type === 'mine' && i.hp > 0));
      if (mine.length && rand(g) < 0.35) {
        const p = mine[Math.floor(rand(g) * mine.length)];
        const ms = p.insts.filter((i) => i.type === 'mine' && i.hp > 0);
        const m = ms[Math.floor(rand(g) * ms.length)];
        m.hp = Math.max(0, m.hp - 35);
        rep.raids.push({ pid: p.id, iid: m.id });
        SF.log(g, fl.name + ' raided ' + p.name + ': ' + m.name + (m.hp <= 0 ? ' destroyed.' : ' damaged.'), 'loss');
      } else damageFortress(g, fl.dmg * pd, fl.name, rep);
    }

    // 4. Module damage when the hull takes real hits.
    if (rep.hullDmg >= 8 && !SF.has(g, 'def_armour') && rand(g) < 0.35) {
      const cand = SF.WEAPON_ORDER.filter((w) => !SF.WEAPONS[w].req || SF.has(g, SF.WEAPONS[w].req));
      const w = cand[Math.floor(rand(g) * cand.length)];
      g.weapons[w].offline = 2; // ticks down below, leaving 1 full cycle offline
      rep.offline.push(w);
      SF.log(g, 'HULL BREACH: ' + SF.WEAPONS[w].name + ' knocked offline for a cycle.', 'warn');
    }

    // 5. Enemy repairs and reinforcement.
    for (const p of sys.planets) {
      if (p.owner !== 'enemy') continue;
      const organised = p.insts.some((i) => (i.type === 'industry' || i.type === 'hq') && SF.activeInst(i));
      if (organised) for (const i of p.insts) if (i.hp > 0 && i.hp < i.maxHp && !SF.troopsOnSurface(g, p.id)) i.hp = Math.min(i.maxHp, i.hp + i.maxHp * 0.08);
      p.garrisonMod = clamp(p.garrisonMod + (organised ? 0.06 : 0.03), 0, organised ? 1.35 : 1.15);
      for (const i of p.insts) if (i.disabled > 0) i.disabled--;
    }

    // 6. New fleets.
    const rel = g.cycle - g.sysStartCycle + 1;
    if (sys.fleetIdx < def.fleets.length && rel >= def.fleets[sys.fleetIdx] && SF.enemyWorlds(g).length) {
      sys.fleetIdx++;
      const n = sys.fleetIdx;
      const fl = { id: def.id + '-f' + n, name: 'Strike Group ' + ['Aster', 'Blade', 'Cinder', 'Dirge', 'Ember', 'Fury', 'Gale', 'Hex', 'Iron', 'Jackal'][(n - 1) % 10], hp: Math.round(260 * def.threat), maxHp: Math.round(260 * def.threat), eta: 2, dmg: Math.round(24 * def.threat), angle: rand(g) * Math.PI * 2 };
      sys.fleets.push(fl);
      rep.events.push('fleet');
      SF.log(g, 'ENEMY FLEET DETECTED: ' + fl.name + ' inbound, ETA 2 cycles.', 'warn');
    }

    // 7. Income + recovery.
    const inc = SF.incomeOf(g);
    for (const r of SF.RES) g.res[r] += inc[r];
    g.troops = Math.min(SF.troopCap(g), g.troops + inc.troops);
    rep.income = inc;
    g.fort.shield = Math.min(SF.shieldMax(g), g.fort.shield + SF.shieldRegen(g));
    g.fort.power = SF.powerMax(g);
    for (const w in g.weapons) { const ws = g.weapons[w]; ws.shots = 0; if (ws.offline > 0) ws.offline--; }
    const L = g.weapons.laser;
    if (L.overheated > 0) { L.overheated--; L.heat = 60; } else L.heat = Math.max(0, L.heat - SF.laserCooling(g));
    if (g.pk.cooldown > 0) g.pk.cooldown--;
    for (const r of SF.RES) g.res[r] = Math.max(0, g.res[r]);

    g.cycle++;
    // 8. Win / lose.
    if (g.fort.hull <= 0) {
      g.fort.hull = 0; g.over = 'lose';
      SF.log(g, 'FORTRESS LOST. Reactor containment failed.', 'loss');
    } else if (def.final && SF.enemyWorlds(g).length === 0) {
      g.over = 'win';
      SF.log(g, 'THE PALE THRONE HAS FALLEN.', 'gain');
    }
    return rep;
  };

  // The final system is won as soon as its enemy worlds are gone (even mid-cycle via Planet Killer).
  SF.checkVictory = function (g) {
    if (!g.over && SF.sysDef(g).final && SF.enemyWorlds(g).length === 0) { g.over = 'win'; SF.log(g, 'THE PALE THRONE HAS FALLEN.', 'gain'); }
    return g.over;
  };

  SF.score = function (g) {
    let intact = 0, worlds = 0;
    for (const s of g.systems) if (s) for (const p of s.planets) if (p.owner === 'player') { worlds++; intact += SF.valueOf(SF.planetYield(p, false)); }
    return { worlds, income: Math.round(intact), troopsLost: g.stats.troopsLost, civilians: g.stats.civilians, destroyed: g.stats.destroyed, cycles: g.cycle - 1 };
  };

  // ------------------------------------------------------------------ save / load
  SF.SAVE_KEY = 'spacefortress.save.v1';
  SF.serialize = (g) => JSON.stringify(g);
  SF.deserialize = function (s) {
    const g = JSON.parse(s);
    if (!g || g.v !== 1 || !Array.isArray(g.systems) || !g.res) throw new Error('Incompatible save');
    return g;
  };
})();
