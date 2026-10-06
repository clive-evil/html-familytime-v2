// Headless autoplayer used by tests and the balance report. Not loaded for players' decisions.
(function () {
  const SF = globalThis.SF;
  const PRIORITY = ['shield', 'cannon', 'station', 'interceptor', 'power', 'silo', 'barracks', 'hq', 'bunker'];
  const UPG = {
    precision: ['rail_caps', 'troop_bay', 'laser_unlock', 'fort_reactor', 'mis_smart', 'def_pd', 'rail_heavy', 'troop_pods', 'laser_cool', 'fort_modules', 'rail_twin', 'def_armour', 'mis_nuke', 'laser_lance', 'fort_pk'],
    nuke: ['rail_caps', 'mis_smart', 'fort_reactor', 'mis_nuke', 'troop_bay', 'def_pd', 'laser_unlock', 'fort_modules', 'rail_heavy', 'def_armour', 'rail_twin', 'fort_pk'],
    pk: ['rail_caps', 'troop_bay', 'fort_reactor', 'laser_unlock', 'mis_smart', 'def_pd', 'fort_modules', 'rail_heavy', 'fort_pk', 'troop_pods', 'laser_cool', 'rail_twin', 'def_armour'],
  };
  function bestShot(g, p, strat) {
    let best = null;
    const targets = p.insts.filter((i) => i.hp > 0 && (SF.INST[i.type].mil || strat === 'brute'));
    for (const w of SF.WEAPON_ORDER) for (const a of Object.keys(SF.WEAPONS[w].ammo)) {
      if (a === 'nuke' && strat !== 'nuke') continue;
      for (const i of targets) {
        if (!SF.canFire(g, w, a, p.id, i.id).ok) continue;
        const pv = SF.attackPreview(g, w, a, p.id, i.id, strat === 'manual' ? 0.85 : null);
        const pri = PRIORITY.indexOf(i.type);
        let s = pv.land * Math.min(pv.frac, 1.2) * 100 - (pri < 0 ? 30 : pri * 3) - pv.collat * 40;
        if (a === 'nuke') s += 80;
        if (!best || s > best.s) best = { s, w, a, iid: i.id };
      }
    }
    return best;
  }
  SF.botTurn = function (g, strat) {
    strat = strat || 'precision';
    const sys = SF.curSys(g);
    const q = strat === 'manual' ? 0.85 : null;
    if (strat === 'pk') {
      // Fire before spending any power: the chamber needs full reactor output.
      const tgt = SF.enemyWorlds(g).filter((p) => !SF.troopsOnSurface(g, p.id)).sort((a, b) => SF.enemyGround(b) * SF.defenceMult(b) - SF.enemyGround(a) * SF.defenceMult(a))[0];
      if (tgt && SF.canPlanetKill(g, tgt.id).ok) SF.firePlanetKiller(g, tgt.id);
      SF.checkVictory(g);
      if (g.over) return 'win';
    }
    for (const p of sys.planets) { if (!p.scanned && p.owner === 'enemy') SF.scan(g, p.id); if (p.owner === 'neutral') SF.claim(g, p.id); }
    if (g.fort.hull < SF.hullMax(g) * 0.5) SF.repairFortress(g);
    for (const u of UPG[strat] || UPG.precision) if (SF.upgradeState(g, u) === 'available' && (u === 'fort_pk' || g.res.metals - SF.UPGRADES[u].cost.metals > 15)) SF.buyUpgrade(g, u);
    // Fleets first (railgun loves warships).
    for (const fl of sys.fleets.slice()) for (const w of ['railgun', 'missile', 'laser']) {
      const a = Object.keys(SF.WEAPONS[w].ammo)[0];
      if (SF.canFire(g, w, a, 'fleet:' + fl.id).ok) SF.fire(g, w, a, 'fleet:' + fl.id, null, { manual: q });
    }
    const enemies = SF.enemyWorlds(g).filter((p) => !SF.troopsOnSurface(g, p.id));
    for (let guard = 0; guard < 12; guard++) {
      let fired = false;
      for (const p of enemies) {
        if (SF.invasionForecast(g, p.id, g.troops).chance > 0.93) continue;
        const b = bestShot(g, p, strat);
        if (b && b.s > 5) { SF.fire(g, b.w, b.a, p.id, b.iid, { manual: q }); fired = true; break; }
      }
      if (!fired) break;
    }
    for (const p of enemies) {
      const t = SF.suggestTroops(g, p.id, 0.85);
      const f = SF.invasionForecast(g, p.id, t);
      if (f.chance >= 0.8 && t <= g.troops && (f.expLoss < g.troops * 0.5 || g.troops > 60000)) SF.deploy(g, p.id, t);
    }
    for (const s of g.systems) if (s) for (const p of s.planets) if (p.owner === 'player') for (const i of p.insts) if (i.type === 'mine' && i.hp > 0 && g.res.metals > 140) SF.upgradeMine(g, p.id, i.id);
    if (SF.canJump(g)) { SF.jump(g); return 'jump'; }
    SF.endCycle(g);
    return 'end';
  };
  SF.botPlay = function (g, strat, maxCycles) {
    maxCycles = maxCycles || 200;
    while (!g.over && g.cycle < maxCycles) SF.botTurn(g, strat);
    return g;
  };
})();
