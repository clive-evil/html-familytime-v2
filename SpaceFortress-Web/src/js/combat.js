// Weapon resolution: previews (used heavily by the UI) and actual firing.
(function () {
  const SF = globalThis.SF;
  const { clamp, rand } = SF;

  SF.ammoUnlocked = function (g, wid, aid) {
    const A = SF.WEAPONS[wid].ammo[aid];
    return !A.req || SF.has(g, A.req);
  };
  SF.shotCost = function (g, wid, aid) {
    const c = Object.assign({}, SF.WEAPONS[wid].ammo[aid].cost);
    c.power = SF.weaponPower(g, wid);
    return c;
  };

  // Resolve a target reference: { kind:'inst', p, i } or { kind:'fleet', f }.
  SF.resolveTarget = function (g, pid, iid) {
    if (pid && pid.startsWith('fleet:')) {
      const f = SF.fleet(g, pid.slice(6));
      return f ? { kind: 'fleet', f } : null;
    }
    const p = SF.planet(g, pid);
    if (!p) return null;
    const i = SF.inst(p, iid);
    return i ? { kind: 'inst', p, i } : null;
  };

  SF.canFire = function (g, wid, aid, pid, iid) {
    const ws = SF.weaponState(g, wid);
    if (!ws.ok) return ws;
    if (!SF.ammoUnlocked(g, wid, aid)) return { ok: false, reason: 'AMMO LOCKED' };
    const t = SF.resolveTarget(g, pid, iid);
    if (!t) return { ok: false, reason: 'NO TARGET' };
    if (t.kind === 'inst') {
      if (SF.planetSys(g, t.p.id) !== g.sysIndex) return { ok: false, reason: 'OUT OF RANGE' };
      if (t.p.owner !== 'enemy') return { ok: false, reason: 'NOT HOSTILE' };
      if (!t.p.scanned) return { ok: false, reason: 'SCAN REQUIRED' };
      if (t.i.hp <= 0) return { ok: false, reason: 'DESTROYED' };
      const A = SF.WEAPONS[wid].ammo[aid];
      if (SF.INST[t.i.type].orbital && (A.mult.orbital || 0) <= 0) return { ok: false, reason: 'CANNOT REACH ORBIT' };
      if (SF.troopsOnSurface(g, t.p.id) && (wid === 'bombard' || aid === 'nuke')) return { ok: false, reason: 'OUR TROOPS ARE ON THE SURFACE' };
    } else {
      if (!(SF.WEAPONS[wid].ammo[aid].mult.ship > 0)) return { ok: false, reason: 'CANNOT ENGAGE SHIPS' };
    }
    if (!SF.canAfford(g, SF.shotCost(g, wid, aid))) return { ok: false, reason: 'INSUFFICIENT RESOURCES' };
    return { ok: true };
  };

  // Damage before randomness. q = manual quality (0..1) or null for auto.
  function baseDamage(g, wid, aid, t, q) {
    const W = SF.WEAPONS[wid];
    const A = W.ammo[aid];
    const armor = t.kind === 'fleet' ? 'ship' : SF.INST[t.i.type].armor;
    let d = A.dmg * (A.mult[armor] || 0);
    if (t.kind === 'inst' && A.vsType && A.vsType[t.i.type]) d *= A.vsType[t.i.type];
    if (wid === 'railgun' && SF.has(g, 'rail_caps')) d *= 1.25;
    if (wid === 'laser' && SF.has(g, 'laser_lance')) d *= 1.5;
    let shielded = false;
    if (t.kind === 'inst' && t.i.type !== 'shield' && !SF.INST[t.i.type].orbital && SF.shieldUp(t.p)) {
      shielded = true;
      const sm = A.shieldMult != null ? A.shieldMult : W.shieldMult;
      const eff = SF.powerEff(t.p);
      d *= 1 - (1 - sm) * eff;
    }
    if (q != null) d *= 0.85 + 0.65 * q;
    return { d, shielded, armor };
  }

  SF.attackPreview = function (g, wid, aid, pid, iid, q) {
    const t = SF.resolveTarget(g, pid, iid);
    if (!t) return null;
    const W = SF.WEAPONS[wid];
    const A = W.ammo[aid];
    const b = baseDamage(g, wid, aid, t, q);
    const hp = t.kind === 'fleet' ? t.f.hp : t.i.hp;
    const hit = q != null ? 1 : W.accuracy;
    const intercept = W.interceptable && t.kind === 'inst' ? SF.interceptChance(g, t.p) : 0;
    const land = hit * (1 - intercept);
    const crit = q != null && q >= 0.9;
    const dmg = b.d * (crit ? 1.25 : 1);
    // Kill chance assumes ±10% damage spread on auto shots.
    let killIfHit;
    if (q != null) killIfHit = dmg >= hp ? 1 : 0;
    else killIfHit = clamp((dmg * 1.1 - hp) / (dmg * 0.2 + 1e-6), 0, 1);
    const collat = (A.collat || 0) * (q != null ? 1 - 0.8 * q : 1);
    let rating = 'POOR';
    const frac = hp > 0 ? dmg / hp : 0;
    if (frac >= 1) rating = 'DECISIVE'; else if (frac >= 0.6) rating = 'STRONG'; else if (frac >= 0.3) rating = 'MODERATE';
    return {
      dmg, hp, frac, hit, intercept, land, killChance: land * killIfHit, shielded: b.shielded, armor: b.armor,
      collat, collatTargets: A.collatTargets || 1, nuke: aid === 'nuke', emp: !!A.disable, popLoss: A.popLoss || 0,
      rating, cost: SF.shotCost(g, wid, aid),
    };
  };

  function damageInst(g, p, i, d, res) {
    if (i.hp <= 0 || d <= 0) return;
    const before = i.hp;
    i.hp = Math.max(0, i.hp - d);
    const lost = before - i.hp;
    if (i.type === 'city' && p.pop > 0) {
      const popLoss = p.pop * (lost / i.maxHp) * 0.6;
      p.pop = Math.max(0, p.pop - popLoss);
      g.stats.civilians += popLoss;
      res.popLoss += popLoss;
    }
    if (i.hp <= 0) {
      i.hp = 0;
      i.disabled = 0;
      res.killed.push(i.id);
      SF.log(g, i.name + ' on ' + p.name + ' DESTROYED. ' + SF.INST[i.type].kill, i.type === 'mine' || i.type === 'city' ? 'loss' : 'kill');
    }
  }

  // Fire a weapon. opts.manual = quality 0..1 (manual control). Returns a result for FX + UI.
  SF.fire = function (g, wid, aid, pid, iid, opts) {
    opts = opts || {};
    const chk = SF.canFire(g, wid, aid, pid, iid);
    if (!chk.ok) return { ok: false, reason: chk.reason };
    const W = SF.WEAPONS[wid];
    const A = W.ammo[aid];
    const q = opts.manual != null ? clamp(opts.manual, 0, 1) : null;
    const t = SF.resolveTarget(g, pid, iid);
    SF.pay(g, SF.shotCost(g, wid, aid));
    const ws = g.weapons[wid];
    ws.shots++;
    g.stats.shots++;
    if (q != null) { g.stats.manualShots++; if (q >= 0.9) g.stats.perfectShots++; }
    if (wid === 'laser') {
      ws.heat += SF.laserHeatPerShot(g);
      if (ws.heat >= 100) { ws.overheated = 1; SF.log(g, 'ORBITAL LASER OVERHEATED. Emitter locked for a cycle.', 'warn'); }
    }
    const res = { ok: true, wid, aid, pid, iid, hit: false, intercepted: false, crit: false, dmg: 0, killed: [], collateral: [], popLoss: 0, q, nuke: aid === 'nuke', emp: !!A.disable };
    const hitRoll = q != null ? (q >= 0.15 || opts.guarantee ? 1 : 0) : rand(g) < W.accuracy || opts.guarantee ? 1 : 0;
    if (W.interceptable && t.kind === 'inst' && rand(g) < SF.interceptChance(g, t.p) && !opts.guarantee) {
      res.intercepted = true;
      SF.log(g, W.name + ' salvo intercepted over ' + t.p.name + '.', 'warn');
      return res;
    }
    if (!hitRoll) {
      SF.log(g, W.name + ' missed its mark.', 'warn');
      res.missed = true;
      if (t.kind === 'inst' && wid === 'bombard') {
        const others = t.p.insts.filter((x) => x.hp > 0 && x !== t.i && !SF.INST[x.type].orbital);
        if (others.length) { const o = others[Math.floor(rand(g) * others.length)]; damageInst(g, t.p, o, 35, res); res.collateral.push({ iid: o.id, dmg: 35 }); }
      }
      return res;
    }
    res.hit = true;
    const b = baseDamage(g, wid, aid, t, q);
    let d = b.d;
    if (q != null && q >= 0.9) { d *= 1.25; res.crit = true; }
    if (q == null) d *= 0.9 + rand(g) * 0.2;
    res.dmg = d;

    if (t.kind === 'fleet') {
      t.f.hp = Math.max(0, t.f.hp - d);
      if (t.f.hp <= 0) {
        res.killed.push('fleet:' + t.f.id);
        SF.curSys(g).fleets = SF.curSys(g).fleets.filter((f) => f !== t.f);
        SF.gain(g, { metals: 25 });
        SF.log(g, t.f.name + ' destroyed. Salvage recovered (+25 MET).', 'kill');
      }
      return res;
    }

    const p = t.p;
    damageInst(g, p, t.i, d, res);
    if (A.disable && t.i.hp > 0 && ['shield', 'cannon', 'silo', 'interceptor', 'station', 'power', 'hq'].includes(t.i.type)) {
      t.i.disabled = A.disable;
      res.disabled = true;
      SF.log(g, t.i.name + ' on ' + p.name + ' disabled by EMP for ' + A.disable + ' cycles.', 'kill');
    }
    if (wid === 'laser' && SF.has(g, 'laser_lance')) {
      const near = p.insts.filter((x) => x.hp > 0 && x !== t.i && !SF.INST[x.type].orbital)
        .sort((a, c) => Math.hypot(a.pos[0] - t.i.pos[0], a.pos[1] - t.i.pos[1]) - Math.hypot(c.pos[0] - t.i.pos[0], c.pos[1] - t.i.pos[1]))[0];
      if (near) { const sd = d * 0.6; damageInst(g, p, near, sd, res); res.collateral.push({ iid: near.id, dmg: sd, sweep: true }); }
    }
    if (A.blast) {
      for (const o of p.insts) {
        if (o === t.i || o.hp <= 0) continue;
        const A2 = SF.INST[o.type];
        let bd = A.blast * (A.mult[A2.armor] || 0);
        if (o.type !== 'shield' && !A2.orbital && SF.shieldUp(p)) bd *= 0.5;
        damageInst(g, p, o, bd, res);
        res.collateral.push({ iid: o.id, dmg: bd });
      }
      p.contamination = clamp(p.contamination + A.contam, 0, 1);
      g.stats.nukes++;
      SF.log(g, 'NUCLEAR DETONATION on ' + p.name + '. Surface contaminated.', 'loss');
    } else if (A.collat > 0) {
      const c = A.collat * (q != null ? 1 - 0.8 * q : 1);
      const others = p.insts.filter((x) => x.hp > 0 && x !== t.i && !SF.INST[x.type].orbital);
      const n = Math.min(others.length, A.collatTargets || 1);
      for (let k = 0; k < n; k++) {
        const idx = Math.floor(rand(g) * others.length);
        const o = others.splice(idx, 1)[0];
        const cd = d * c;
        if (cd < 1) continue;
        damageInst(g, p, o, cd, res);
        res.collateral.push({ iid: o.id, dmg: cd });
      }
    }
    if (A.popLoss && p.pop > 0) {
      const pl = p.pop * A.popLoss * (q != null ? 1 - 0.5 * q : 1);
      p.pop -= pl; g.stats.civilians += pl; res.popLoss += pl;
    }
    if (A.garrisonHit) p.garrisonMod = clamp(p.garrisonMod * (1 - A.garrisonHit), 0, 1);
    p.scorch = clamp(p.scorch + (A.blast ? 0.5 : wid === 'bombard' ? 0.12 : 0.04), 0, 1);
    return res;
  };
})();
