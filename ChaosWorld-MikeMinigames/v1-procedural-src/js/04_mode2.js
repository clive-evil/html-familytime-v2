/* ==========================================================================
   MODE 2 — HELL CHASE
   FSM: intro → play → (caught | dead | slain) → results
   Distance to the Hunter is THE resource. Kills drop chase items → items hit
   the Hunter (damage / slow / stun / knockback) → distance goes up.
   ========================================================================== */
const M2_TUNE = {
  partyHp: 400,
  hunterHp: 5500,
  closeSpeed: 3.5,         // m/s at t=0
  speedRamp: 240,          // closing speed × (1 + t/speedRamp)
  slowMult: 0.25, visibleAt: 35, leaveAt: 42, maxDist: 260,
  dropChance: 0.14,
  hunterAtkEvery: 2.4, hunterTele: 0.75, hunterDmg: 16,
  quickClear: 9, quickBonus: 6,
  waveTimer: 13,
};
const ITEMS = {
  spike: { name: 'SPIKE TRAP', r: 'common', dmg: 150 },
  oil: { name: 'OIL SLICK', r: 'common', dmg: 30, slow: 3 },
  banana: { name: 'BANANA PEEL', r: 'common', dmg: 40, stun: 1.2, kb: 4 },
  smoke: { name: 'SMOKE BOMB', r: 'common', slow: 3, kb: 3 },
  firemine: { name: 'FIRE MINE', r: 'common', burn: 5, burnDps: 40 },
  chain: { name: 'CHAIN SNARE', r: 'rare', dmg: 60, stun: 2.5 },
  boulder: { name: 'BOULDER', r: 'rare', dmg: 260, kb: 14 },
  ice: { name: 'ICE HEX', r: 'rare', dmg: 60, slow: 6 },
  spring: { name: 'SPRING TRAP', r: 'rare', dmg: 100, kb: 22 },
  barrel: { name: 'EXPLOSIVE BARREL', r: 'rare', dmg: 420, kb: 6 },
  portal: { name: 'PORTAL TRAP', r: 'epic', kb: 45 },
  megabomb: { name: 'MEGA BOMB', r: 'epic', dmg: 800, kb: 20, stun: 1.5 },
  double: { name: 'DOUBLE TRAP', r: 'epic', double: true },
  stun: { name: 'HUNTER STUN', r: 'epic', dmg: 200, stun: 4 },
};
const ITEM_POOL = { common: [], rare: [], epic: [] };
for (const k in ITEMS) ITEM_POOL[ITEMS[k].r].push(k);
const RARITY_COL = { common: '#d8dde8', rare: '#4aa8ff', epic: '#c86aff' };
const PARTY_X = 225, PARTY_Y = 430;
const BEACON_PT = [70, 650];

const M2 = {
  name: 'm2',
  enter() {
    $('#menu').classList.add('hidden'); $('#m2ui').classList.remove('hidden');
    this.buildUI(); this.reset(false);
  },
  exit() { $('#m2ui').classList.add('hidden'); $('#m2ui').innerHTML = ''; $('#results').classList.add('hidden'); },
  reset(skipIntro) {
    const set = S().m2;
    this.t = 0; this.time = 0; this.stateT = 0; this.scroll = 0;
    this.hp = M2_TUNE.partyHp; this.hpMax = M2_TUNE.partyHp; this.hpLag = this.hp;
    this.gold = 1240; this.kills = 0; this.wave = 0; this.waveT = 0; this.waveClock = 0; this.spawnQ = [];
    this.enemies = []; this.projs = []; this.cards = []; this.tray = [null, null, null];
    this.cds = [0, 0, 0]; this.ult = 0; this.focus = null; this.strikeT = 0;
    this.party = [
      { id: 'knight', x: PARTY_X, y: PARTY_Y - 12, atkT: 0.4, anim: 0, flash: 0 },
      { id: 'archer', x: PARTY_X - 52, y: PARTY_Y + 22, atkT: 0.2, anim: 0, flash: 0 },
      { id: 'scrub', x: PARTY_X + 52, y: PARTY_Y + 22, atkT: 0.8, anim: 0, flash: 0 },
    ];
    const hmax = Math.round(M2_TUNE.hunterHp * set.hunterHp);
    this.hunter = { hp: hmax, max: hmax, lag: hmax, dist: set.startDist, prevDist: set.startDist, rate: 0, slow: 0, stun: 0, burn: 0, burnDps: 0, visible: false, enterT: 0, hurl: 0, atk: null, atkT: 2.0, flash: 0, punch: 0, x: PARTY_X, stepT: 0, beatT: 0 };
    this.stats = { items: { common: 0, rare: 0, epic: 0 }, hunterDmg: 0, closest: set.startDist, appearances: 0, escapes: 0, dmgTaken: 0, wavesCleared: 0, quick: 0, lostToFull: 0 };
    FX.reset(); Callout.clear();
    $('#results').classList.add('hidden');
    this.refreshModeUI();
    if (skipIntro) this.startRun(); else this.setState('intro');
  },
  setState(s) {
    this.state = s; this.stateT = 0;
    this.ui.intro.classList.toggle('hidden', s !== 'intro');
    if (s === 'caught') { Callout.show('CAUGHT!', 'red huge', 2.2); Audio.play('hereHe'); Audio.play('boom'); FX.shake(24); FX.doFlash(0.8, '#ff0010'); }
    if (s === 'dead') { Callout.show('OVERWHELMED', 'red', 2.2); Audio.play('fail'); }
    if (s === 'slain') { Callout.show('HUNTER<br>SLAIN!', 'huge teal', 2.4); Audio.play('win'); FX.slowmo(1.0, 0.35); FX.shake(16); }
  },
  startRun() { this.setState('play'); Callout.show('RUN!', 'huge', 0.9); Audio.play('roar'); this.nextWave(); },
  get itemMode() { return S().m2.itemMode; },

  /* ---------------- INPUT ---------------- */
  onKey(k, e) {
    if (this.state === 'intro') { if (k === ' ' || k === 'Enter') this.startRun(); return; }
    if (k === '1') this.skill(0);
    if (k === '2') this.skill(1);
    if (k === '3') this.skill(2);
    if (k === ' ') this.skill(3);
    if (k === 'q') this.fireTray(0);
    if (k === 'w') this.fireTray(1);
    if (k === 'e') this.fireTray(2);
    if (k === 'a' || k === 's') { const e2 = this.focus && this.focus.hp > 0 ? this.focus : this.nearestEnemy(); if (e2) this.strike(e2); }
    if (k === 'r') this.reset(true);
    if (k === 'Escape') Main.toMenu();
  },
  onTap(x, y) {
    if (this.state !== 'play' || y > 600) return;
    let best = null, bd = 48 * 48;
    for (const e of this.enemies) { if (e.hp <= 0 || e.y < 0) continue; const d = dist2(x, y, e.x, e.y - 26 * e.scale); if (d < bd) { bd = d; best = e; } }
    if (best) this.strike(best);
  },
  strike(e) {
    if (this.strikeT > 0 || this.state !== 'play') return;
    this.strikeT = 0.09; this.focus = e;
    const k = this.party[0]; k.anim = 0.25;
    this.hitEnemy(e, 16, 'strike');
    FX.burst(e.x, e.y - 26, 7, { color: ['#fff', '#ffd21f'], spMax: 260 });
    Audio.play('slash');
  },
  skill(i) {
    if (this.state !== 'play') return;
    const btn = this.ui.ab[i];
    if (i < 3 && this.cds[i] > 0) return;
    if (i === 3 && this.ult < 100) return;
    const alive = this.enemies.filter((e) => e.hp > 0 && e.y > -10);
    if (i === 0) {
      this.cds[0] = 5; this.party[0].anim = 0.4; Audio.play('slash'); Audio.play('bigHit');
      FX.ring(this.party[0].x, this.party[0].y - 30, { r1: 140, color: '#7ac8ff', w: 14 });
      for (const e of alive) if (dist2(e.x, e.y, this.party[0].x, this.party[0].y) < 150 * 150) { this.hitEnemy(e, 60, 'skill'); e.y -= 36; }
      FX.shake(5);
      if (this.hunter.visible && this.hunter.dist < 14) this.hurtHunter(25, this.hunter.x, this.hunterY() - 120);
    } else if (i === 1) {
      this.cds[1] = 8; this.party[1].anim = 0.4; Audio.play('arrow');
      for (const e of alive) { const tx = e.x, ty = e.y - 24; this.projs.push({ kind: 'rain', x: tx + rand(-30, 30), y: -20, tx, ty, t: -rand(0, 0.25), dur: 0.3, onHit: () => { if (e.hp > 0) this.hitEnemy(e, 40, 'skill'); } }); }
      if (!alive.length) FX.text(225, 300, 'NO TARGETS', { color: '#aaa', size: 16 });
    } else if (i === 2) {
      this.cds[2] = 10; this.party[2].anim = 0.4;
      let best = null, bc = -1;
      for (const e of alive) { let c = 0; for (const o of alive) if (dist2(e.x, e.y, o.x, o.y) < 95 * 95) c++; if (c > bc) { bc = c; best = e; } }
      const tx = best ? best.x : 225, ty = best ? best.y - 20 : 250;
      this.projs.push({ kind: 'bomb', x: this.party[2].x, y: this.party[2].y - 50, tx, ty, t: 0, dur: 0.45, onHit: () => {
        Audio.play('bomb'); FX.shake(9); FX.fire(tx, ty, 30, { spMax: 300, grav: -60 }); FX.ring(tx, ty, { r1: 100, color: '#ff6a13', w: 14 });
        for (const e of this.enemies) if (e.hp > 0 && dist2(e.x, e.y - 20, tx, ty) < 100 * 100) this.hitEnemy(e, 100, 'skill');
      } });
    } else {
      this.ult = 0; Audio.play('ult'); FX.doFlash(0.6, '#ffd21f'); FX.shake(14);
      Callout.show('CHAOS<br>RAMPAGE!', 'huge mag', 1.0);
      for (const p of this.party) p.anim = 0.6;
      for (const e of alive) { FX.fire(e.x, e.y - 20, 12, { spMax: 200 }); this.hitEnemy(e, 150, 'skill'); }
      this.rollDrop(PARTY_X, PARTY_Y - 120, 'rare');
    }
    if (btn) { btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit'); }
  },

  /* ---------------- WAVES / ENEMIES ---------------- */
  nextWave() {
    if (this.wave > 0 && this.enemies.length === 0) {
      this.stats.wavesCleared++;
      this.hp = Math.min(this.hpMax, this.hp + 20);
      if (this.waveClock < M2_TUNE.quickClear) { this.stats.quick++; this.pushHunter(M2_TUNE.quickBonus, 'QUICK CLEAR'); FX.text(225, 250, 'QUICK CLEAR! +' + M2_TUNE.quickBonus + 'm', { color: '#4fe03a', size: 24 }); }
    }
    this.wave++; this.waveClock = 0; this.waveT = M2_TUNE.waveTimer;
    const n = this.wave, count = Math.min(3 + n, 11);
    const pool = n === 1 ? ['slime'] : n === 2 ? ['slime', 'goblin'] : n === 3 ? ['slime', 'goblin', 'skeleton'] : ['slime', 'goblin', 'skeleton', 'skeleton', 'imp', 'goblin'];
    for (let i = 0; i < count; i++) this.spawnQ.push({ type: pick(pool), delay: i * rand(0.18, 0.35) });
    if (n % 3 === 0) { this.spawnQ.push({ type: 'brute', delay: 0.6 }); }
    if (n > 1) Callout.show('WAVE ' + n + (n % 3 === 0 ? '<small>ELITE INCOMING</small>' : ''), 'low', 1.0);
  },
  spawn(type) {
    const def = ENEMY_DEF[type], hpM = 1 + this.time / 120;
    const e = { type, def, x: rand(100, 350), y: rand(-60, -20), hp: Math.round(def.hp * hpM), max: Math.round(def.hp * hpM), atkT: rand(0.5, 1.2), flash: 0, lunge: 0, seed: rand(0, 10), scale: def.elite ? 1 : 0.9, dmgM: 1 + this.time / 180 };
    e.ex = clamp(e.x + rand(-40, 40), 110, 340);
    e.ey = def.ranged ? rand(170, 240) : rand(352, 376);
    if (def.elite) { e.ex = clamp(e.ex, 150, 300); e.ey = 340; }
    this.enemies.push(e);
  },
  nearestEnemy() { let b = null, bd = 1e9; for (const e of this.enemies) { if (e.hp <= 0 || e.y < 0) continue; const d = dist2(e.x, e.y, PARTY_X, PARTY_Y); if (d < bd) { bd = d; b = e; } } return b; },
  hitEnemy(e, dmg, src) {
    if (e.hp <= 0) return;
    e.hp -= dmg; e.flash = 0.25;
    this.ult = Math.min(100, this.ult + dmg / 16);
    FX.text(e.x + rand(-10, 10), e.y - 50 * e.scale, String(Math.round(dmg)), { color: src === 'skill' ? '#ffd21f' : '#fff', size: src === 'skill' ? 22 : 17, life: 0.55 });
    if (src !== 'arrow') Audio.play('hit');
    if (e.hp <= 0) this.killEnemy(e);
  },
  killEnemy(e) {
    this.kills++; this.gold += e.def.elite ? 120 : randi(8, 18);
    FX.burst(e.x, e.y - 20, e.def.elite ? 40 : 16, { color: e.type === 'slime' ? ['#58d33a', '#9aff6a'] : e.type === 'skeleton' ? ['#efe8d6', '#fff'] : ['#ff6a13', '#ffd21f', '#e8322a'], spMax: 300, type: e.type === 'skeleton' ? 'chunk' : 'spark', sMax: e.def.elite ? 10 : 7 });
    Audio.play(e.type === 'slime' ? 'splat' : 'hit'); Audio.play('coin');
    if (e.def.elite) { FX.shake(8); FX.stop(0.08); this.rollDrop(e.x, e.y - 60, 'rare'); }
    else if (Math.random() < M2_TUNE.dropChance * S().m2.dropRate) this.rollDrop(e.x, e.y - 50, null);
    if (this.focus === e) this.focus = null;
  },
  updateEnemies(dt) {
    for (let i = this.spawnQ.length - 1; i >= 0; i--) { const s = this.spawnQ[i]; s.delay -= dt; if (s.delay <= 0) { this.spawn(s.type); this.spawnQ.splice(i, 1); } }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.hp <= 0) { this.enemies.splice(i, 1); continue; }
      e.flash = Math.max(0, e.flash - dt); e.lunge = Math.max(0, e.lunge - dt * 4);
      const dx = e.ex - e.x, dy = e.ey - e.y, d = Math.hypot(dx, dy);
      if (d > 3) { const sp = (e.def.spd + 40) * dt; e.x += dx / d * Math.min(sp, d); e.y += dy / d * Math.min(sp, d); e.flip = dx < -2; }
      else {
        e.atkT -= dt;
        if (e.atkT <= 0) {
          e.atkT = e.def.rate * rand(0.85, 1.15);
          const dmg = Math.round(e.def.dmg * e.dmgM);
          if (e.def.ranged) { this.projs.push({ kind: 'efire', x: e.x, y: e.y - 40, tx: PARTY_X + rand(-30, 30), ty: PARTY_Y - 40, t: 0, dur: 0.55, onHit: () => this.hurtParty(dmg) }); }
          else { e.lunge = 1; this.hurtParty(dmg); FX.burst(e.x, e.y + 10, 5, { color: '#ff4a3a', spMax: 160 }); }
        }
      }
    }
    // next wave
    this.waveClock += dt; this.waveT -= dt;
    if ((this.enemies.length === 0 && this.spawnQ.length === 0) || this.waveT <= 0) {
      if (!this.waveGap) this.waveGap = this.enemies.length === 0 ? 0.7 : 0.01;
      this.waveGap -= dt;
      if (this.waveGap <= 0) { this.waveGap = 0; this.nextWave(); }
    }
  },
  hurtParty(dmg) {
    if (this.state !== 'play') return;
    this.hp = Math.max(0, this.hp - dmg); this.stats.dmgTaken += dmg;
    const p = pick(this.party); p.flash = 1;
    FX.text(p.x, p.y - 96, '-' + dmg, { color: '#ff4a3a', size: 20, life: 0.6 });
    Audio.play('hurt');
    if (this.hp <= 0) this.setState('dead');
  },
  updateParty(dt) {
    this.strikeT = Math.max(0, this.strikeT - dt);
    for (const p of this.party) { p.anim = Math.max(0, p.anim - dt); p.flash = Math.max(0, p.flash - dt * 3); }
    const alive = this.enemies.filter((e) => e.hp > 0 && e.y > 20);
    if (!alive.length) return;
    const focus = this.focus && this.focus.hp > 0 ? this.focus : null;
    // knight melee sweep
    const k = this.party[0]; k.atkT -= dt;
    if (k.atkT <= 0) {
      const near = alive.filter((e) => dist2(e.x, e.y, k.x, k.y) < 105 * 105);
      if (near.length) { k.atkT = 0.8; k.anim = 0.25; Audio.play('slash'); for (const e of near) this.hitEnemy(e, 14, 'auto'); FX.burst(k.x + 10, k.y - 50, 5, { color: '#fff', spMax: 200 }); }
      else k.atkT = 0.1;
    }
    // archer arrows
    const a = this.party[1]; a.atkT -= dt;
    if (a.atkT <= 0) {
      a.atkT = 0.75; a.anim = 0.2;
      const tgt = focus || alive.reduce((b, e) => (e.y > b.y ? e : b), alive[0]);
      this.projs.push({ kind: 'arrow', x: a.x, y: a.y - 60, tx: tgt.x, ty: tgt.y - 26, t: 0, dur: 0.18, target: tgt, onHit: () => { if (tgt.hp > 0) this.hitEnemy(tgt, 12, 'arrow'); } });
      Audio.play('arrow');
    }
    // scrub rocks
    const s = this.party[2]; s.atkT -= dt;
    if (s.atkT <= 0) {
      s.atkT = 1.2; s.anim = 0.2;
      const tgt = focus || pick(alive);
      this.projs.push({ kind: 'rock', x: s.x, y: s.y - 60, tx: tgt.x, ty: tgt.y - 24, t: 0, dur: 0.35, onHit: () => { if (tgt.hp > 0) this.hitEnemy(tgt, 10, 'auto'); } });
    }
  },

  /* ---------------- CHASE ITEMS ---------------- */
  rollDrop(x, y, minR) {
    const tb = this.time;
    let r = 'common';
    const pe = Math.min(0.15, 0.05 + tb / 1500), pr = Math.min(0.4, 0.25 + tb / 1000);
    const roll = Math.random();
    if (roll < pe) r = 'epic'; else if (roll < pe + pr) r = 'rare';
    if (minR === 'rare' && r === 'common') r = Math.random() < 0.3 ? 'epic' : 'rare';
    const id = pick(ITEM_POOL[r]);
    this.cards.push({ id, r, x, y, t: 0, phase: 'reveal', cyc: pick(Object.keys(ITEMS)), cycT: 0 });
    Audio.play('reveal');
  },
  updateCards(dt) {
    for (let i = this.cards.length - 1; i >= 0; i--) {
      const c = this.cards[i]; c.t += dt;
      if (c.phase === 'reveal') {
        c.cycT -= dt; if (c.cycT <= 0 && c.t < 0.42) { c.cycT = 0.07; c.cyc = pick(Object.keys(ITEMS)); Audio.play('tick'); }
        if (c.t >= 0.42 && !c.shown) {
          c.shown = true; this.stats.items[c.r]++;
          if (c.r === 'epic') { Audio.play('epic'); FX.doFlash(0.3, '#c86aff'); Callout.show('EPIC!<small>' + ITEMS[c.id].name + '</small>', 'mag low', 1.1); FX.burst(c.x, c.y, 30, { color: ['#c86aff', '#ffd21f', '#fff'], spMax: 300, type: 'star', sMin: 5, sMax: 10 }); }
          else if (c.r === 'rare') { Audio.play('rare'); FX.burst(c.x, c.y, 14, { color: ['#4aa8ff', '#fff'], spMax: 220 }); }
          else Audio.play('reveal');
        }
        if (c.t >= (c.r === 'common' ? 0.75 : 0.95)) {
          if (this.itemMode === 'manual') {
            const slot = this.tray.indexOf(null);
            if (slot < 0) { this.stats.lostToFull++; FX.text(c.x, c.y, 'TRAY FULL!', { color: '#ff4a3a', size: 18 }); Audio.play('full'); this.cards.splice(i, 1); continue; }
            this.tray[slot] = 'pending'; c.slot = slot;
            const [sx, sy] = this.slotPos(slot); c.phase = 'fly'; c.t = 0; c.sx = c.x; c.sy = c.y; c.tx = sx; c.ty = sy; c.dur = 0.35;
          } else this.launch(c, c.x, c.y);
        }
      } else if (c.phase === 'fly') {
        if (c.t >= c.dur) {
          this.cards.splice(i, 1);
          if (c.slot != null) { this.tray[c.slot] = { id: c.id, r: c.r }; this.refreshTray(); }
          else this.applyItem(c.id);
        }
      }
    }
  },
  launch(c, x, y) {
    c.phase = 'fly'; c.t = 0; c.sx = x; c.sy = y; c.slot = null;
    if (this.hunter.visible) { c.tx = this.hunter.x; c.ty = this.hunterY() - 140; } else { c.tx = BEACON_PT[0]; c.ty = BEACON_PT[1]; }
    c.dur = 0.42; Audio.play('whoosh');
  },
  slotPos(i) { return [225 + (i - 1) * 80, 562]; },
  fireTray(i) {
    if (this.state !== 'play' || this.itemMode !== 'manual') return;
    const it = this.tray[i]; if (!it || it === 'pending') return;
    this.tray[i] = null; this.refreshTray();
    const [sx, sy] = this.slotPos(i);
    const c = { id: it.id, r: it.r, x: sx, y: sy, t: 0, shown: true };
    this.cards.push(c); this.launch(c, PARTY_X, PARTY_Y - 60);
    const el = this.ui.slots[i]; el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
  },
  applyItem(id) {
    const it = ITEMS[id], H = this.hunter;
    if (this.state !== 'play') return;
    if (it.double) {
      const a = pick(ITEM_POOL.rare), b = pick(ITEM_POOL.rare);
      this.pop('DOUBLE TRAP!', '#c86aff', 0);
      this.applyItem(a); setTimeout(() => this.applyItem(b), 220);
      return;
    }
    const px = H.visible ? H.x : BEACON_PT[0], py = H.visible ? this.hunterY() - 140 : BEACON_PT[1];
    Audio.play(it.dmg >= 400 ? 'boom' : 'trap');
    if (H.visible) {
      FX.burst(px, py, 24, { color: ['#ffd21f', '#ff6a13', '#fff'], spMax: 340 }); FX.ring(px, py, { r1: 120, color: RARITY_COL[it.r] });
      FX.text(px, py - 30, it.name, { color: RARITY_COL[it.r], size: 22 });
    }
    let delay = 0;
    if (it.dmg) { this.hurtHunter(it.dmg, px, py); this.pop('-' + it.dmg, '#ff4a3a', delay); delay += 120; }
    if (it.burn) { H.burn = it.burn; H.burnDps = it.burnDps; this.pop('BURNING', '#ff6a13', delay); delay += 120; }
    if (it.slow) { H.slow = Math.max(H.slow, it.slow); this.pop('SLOWED ' + it.slow + 's', '#7ad8ff', delay); delay += 120; Audio.play('slow'); }
    if (it.stun) { H.stun = Math.max(H.stun, it.stun); this.pop('STUNNED ' + it.stun + 's', '#ffd21f', delay); delay += 120; Audio.play('stun'); if (H.visible) Callout.show('STUNNED!', 'low', 0.8); }
    if (it.kb) { this.pushHunter(it.kb, null, delay); }
    if (!H.visible) { this.ui.beacon.classList.remove('pulse'); void this.ui.beacon.offsetWidth; this.ui.beacon.classList.add('pulse'); setTimeout(() => this.ui && this.ui.beacon && this.ui.beacon.classList.remove('pulse'), 500); }
    if (it.r !== 'common') FX.shake(it.r === 'epic' ? 10 : 5);
  },
  pushHunter(m, label, delay = 0) {
    const H = this.hunter, wasVis = H.visible;
    H.dist = Math.min(M2_TUNE.maxDist, H.dist + m);
    this.pop('+' + m + 'm' + (label ? ' ' + label : ' KNOCKBACK'), '#4fe03a', delay);
    Audio.play('knock');
    if (wasVis && H.dist >= M2_TUNE.leaveAt) { H.hurl = 0.8; H.visible = false; this.stats.escapes++; Callout.show('YOU BOUGHT SOME<br>BREATHING ROOM', 'teal', 1.6); FX.shake(10); }
  },
  hurtHunter(dmg, x, y) {
    const H = this.hunter;
    H.hp = Math.max(0, H.hp - dmg); H.flash = 1; this.stats.hunterDmg += dmg;
    if (H.hp <= 0 && this.state === 'play') { this.setState('slain'); }
  },
  pop(txt, color, delay) {
    const go = () => {
      if (!this.ui || !this.ui.beacon) return;
      const el = document.createElement('div'); el.className = 'bpop'; el.textContent = txt; el.style.color = color;
      // stack simultaneous pops in a column instead of piling them on one spot
      const now = performance.now(); this.popStack = (this.popStack || []).filter((t) => now - t < 700); const n = this.popStack.length; this.popStack.push(now);
      if (this.hunter.visible || this.hunter.hurl > 0) { el.style.left = (clamp(this.hunter.x - 90, 40, 250) + (n % 2) * 40) + 'px'; el.style.top = (Math.min(520, this.hunterY() - 220) - n * 30) + 'px'; }
      else { el.style.left = (120 + (n % 2) * 70) + 'px'; el.style.top = (562 - n * 30) + 'px'; }
      this.ui.root.appendChild(el); setTimeout(() => el.remove(), 1150);
    };
    if (delay) setTimeout(go, delay); else go();
  },

  /* ---------------- HUNTER ---------------- */
  hunterY() { return 600 + (this.hunter.dist / M2_TUNE.visibleAt) * 230; },
  closingSpeed() {
    const H = this.hunter;
    if (H.stun > 0 || H.hurl > 0) return 0;
    let s = M2_TUNE.closeSpeed * S().m2.hunterSpeed * (1 + this.time / M2_TUNE.speedRamp);
    if (H.slow > 0) s *= M2_TUNE.slowMult;
    return s;
  },
  updateHunter(dt) {
    const H = this.hunter;
    H.flash = Math.max(0, H.flash - dt * 3); H.punch = Math.max(0, H.punch - dt * 3);
    H.slow = Math.max(0, H.slow - dt); H.stun = Math.max(0, H.stun - dt);
    if (H.burn > 0) { H.burn -= dt; H.burnTick = (H.burnTick || 0) - dt; if (H.burnTick <= 0) { H.burnTick = 0.5; this.hurtHunter(Math.round(H.burnDps * 0.5), H.x, this.hunterY() - 140); if (H.visible) FX.fire(H.x, this.hunterY() - 140, 6); } }
    if (H.hurl > 0) H.hurl = Math.max(0, H.hurl - dt);
    H.dist = Math.max(0, H.dist - this.closingSpeed() * dt);
    this.stats.closest = Math.min(this.stats.closest, H.dist);
    // smoothed rate for HUD
    const inst = (H.dist - H.prevDist) / dt; H.prevDist = H.dist; H.rate = lerp(H.rate, inst, Math.min(1, dt * 4));
    H.lag = H.lag > H.hp ? Math.max(H.hp, H.lag - H.max * 0.2 * dt) : H.hp;
    H.x = PARTY_X + Math.sin(this.t * 0.7) * 50;
    // visibility transitions
    if (!H.visible && H.hurl <= 0 && H.dist < M2_TUNE.visibleAt) {
      H.visible = true; H.enterT = 0; H.atkT = 1.6; this.stats.appearances++;
      Callout.show("HE'S HERE!", 'red huge', 1.3); Audio.play('hereHe'); FX.shake(16); FX.doFlash(0.35, '#ff0010');
    } else if (H.visible && H.dist >= M2_TUNE.leaveAt) { H.visible = false; }
    H.enterT += dt;
    // footsteps / heartbeat pressure audio
    if (!H.visible && H.dist < 90) { H.stepT -= dt; if (H.stepT <= 0) { H.stepT = 0.35 + H.dist / 90; Audio.play('step'); if (H.dist < 55) FX.shake(2); } }
    if (H.dist < 40) { H.beatT -= dt; if (H.beatT <= 0) { H.beatT = 0.35 + H.dist / 60; Audio.play('heartbeat'); } }
    // attacks when visible
    if (H.visible && H.stun <= 0) {
      if (!H.atk) { H.atkT -= dt; if (H.atkT <= 0) { H.atk = { t: 0 }; Audio.play('warn'); } }
      else {
        H.atk.t += dt; H.punch = Math.min(1, H.atk.t / M2_TUNE.hunterTele);
        if (H.atk.t >= M2_TUNE.hunterTele) {
          H.atk = null; H.atkT = M2_TUNE.hunterAtkEvery * rand(0.85, 1.15);
          const dmg = Math.round(M2_TUNE.hunterDmg * (1 + this.time / 180));
          this.hurtParty(dmg); FX.shake(12); FX.stop(0.06); Audio.play('stomp');
          FX.ring(PARTY_X, PARTY_Y, { r1: 120, color: '#ff2a2a', w: 12 }); FX.dust(PARTY_X, PARTY_Y + 10, 14);
          Callout.show('SMASH!', 'red low', 0.6);
        }
      }
    } else if (H.atk) { H.atk = null; H.atkT = 1.2; }
    if (H.dist <= 0 && this.state === 'play') this.setState('caught');
  },

  /* ---------------- UPDATE ---------------- */
  update(dt) {
    this.t += dt; this.stateT += dt;
    this.scroll = (this.scroll + dt * (this.state === 'play' ? 90 : 20)) % H;
    for (let i = this.projs.length - 1; i >= 0; i--) { const p = this.projs[i]; p.t += dt; if (p.t >= p.dur) { this.projs.splice(i, 1); if (p.onHit && this.state === 'play') p.onHit(); } }
    if (this.state === 'play') {
      this.time += dt;
      for (let i = 0; i < 3; i++) this.cds[i] = Math.max(0, this.cds[i] - dt);
      this.updateEnemies(dt); this.updateParty(dt); this.updateCards(dt); this.updateHunter(dt);
    } else if (this.state === 'caught') {
      this.hunter.dist = Math.max(-8, this.hunter.dist - dt * 12); this.hunter.punch = Math.min(1, this.stateT * 2);
      if (this.stateT > 2.2 && !this.done) { this.done = true; this.showResults(); }
    } else if (this.state === 'dead' || this.state === 'slain') {
      if (this.state === 'slain') { this.hunter.flash = Math.sin(this.stateT * 20) > 0 ? 0.8 : 0; if (Math.random() < 0.5) FX.fire(this.hunter.visible ? this.hunter.x : 70, this.hunter.visible ? this.hunterY() - 150 : 640, 3); }
      if (this.stateT > 2.4 && !this.done) { this.done = true; this.showResults(); }
    }
    if (this.state === 'play' || this.state === 'intro') this.done = false;
    this.hpLag = this.hpLag > this.hp ? Math.max(this.hp, this.hpLag - this.hpMax * 0.3 * dt) : this.hp;
  },

  /* ---------------- RENDER ---------------- */
  render(ctx) {
    const t = this.t, tile = chaseTile();
    ctx.drawImage(tile, 0, this.scroll - H, W, H); ctx.drawImage(tile, 0, this.scroll, W, H);
    // speed lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const x = 90 + i * 55, y = ((t * 600 + i * 137) % 900) - 100; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 60); ctx.stroke(); }
    // danger glow from behind
    const hu = this.hunter;
    if (hu) {
      const dz = clamp(1 - hu.dist / 90, 0, 1);
      if (dz > 0) { const g = ctx.createLinearGradient(0, H - 380, 0, H); g.addColorStop(0, 'rgba(255,0,20,0)'); g.addColorStop(1, 'rgba(255,0,20,' + (0.15 + dz * 0.45 + Math.sin(t * 8) * 0.06 * dz) + ')'); ctx.fillStyle = g; ctx.fillRect(0, H - 380, W, 380); }
    }
    // enemies (sorted)
    const es = this.enemies.slice().sort((a, b) => a.y - b.y);
    for (const e of es) {
      tinted(ctx, Math.min(1, e.flash * 4), '#fff', e.x - 90, e.y - 190, 180, 210, (c) => drawEnemy(c, e, t));
      if (e.hp < e.max) { const w = e.def.elite ? 70 : 40; ctx.fillStyle = '#000'; ctx.fillRect(e.x - w / 2 - 2, e.y + 6, w + 4, 8); ctx.fillStyle = e.def.elite ? '#c86aff' : '#ff4a3a'; ctx.fillRect(e.x - w / 2, e.y + 8, w * Math.max(0, e.hp / e.max), 4); }
      if (e === this.focus) { ctx.strokeStyle = '#ffd21f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(e.x, e.y, 26 * e.scale + 6, 9, 0, 0, 7); ctx.stroke(); }
      if (e.def.elite) outlinedText(ctx, 'ELITE', e.x, e.y - 170, 14, '#c86aff');
    }
    // hunter telegraph zone
    if (hu && hu.visible && hu.atk) { ctx.save(); ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 24); ctx.fillStyle = '#ff1a1a'; ctx.beginPath(); ctx.ellipse(PARTY_X, PARTY_Y + 8, 110, 42, 0, 0, 7); ctx.fill(); ctx.restore(); }
    // party
    const run = this.state === 'play' || this.state === 'intro';
    for (const p of this.party.slice().sort((a, b) => a.y - b.y)) {
      const tgt = this.nearestEnemy();
      const flip = tgt ? tgt.x < p.x - 20 : false;
      const pose = this.state === 'caught' || this.state === 'dead' ? 'ko' : this.state === 'slain' ? 'cheer' : p.anim > 0 ? 'attack' : run ? 'run' : 'idle';
      tinted(ctx, p.flash, '#fff', p.x - 70, p.y - 140, 140, 160, (c) => drawHero(c, p.id, p.x, p.y, 0.92, { pose, p: 1 - p.anim / 0.25, t: t + p.x, flip }));
    }
    // projectiles
    for (const p of this.projs) this.drawProj(ctx, p);
    // hunter
    if (hu && (hu.visible || hu.hurl > 0 || this.state === 'caught')) {
      let hy = this.hunterY(), rot = 0, sc = 0.92;
      if (hu.hurl > 0) { const k = 1 - hu.hurl / 0.8; hy += Ease.inCubic(k) * 600; rot = k * 2.4; sc *= 1 - k * 0.3; }
      if (hu.enterT < 0.35 && hu.visible) hy += (1 - hu.enterT / 0.35) * 160;
      const hp = { stun: hu.stun > 0, punch: hu.punch, rot };
      const drawH = (c) => drawHunter(c, hu.x, hy, sc, hp, t);
      if (hu.flash > 0.02) tinted(ctx, hu.flash, '#fff', hu.x - 200, hy - 400, 400, 440, drawH);
      else if (hu.slow > 0) tinted(ctx, 0.35, '#50b4ff', hu.x - 200, hy - 400, 400, 440, drawH);
      else drawH(ctx);
      if (hu.stun > 0) for (let i = 0; i < 4; i++) { const a = t * 5 + i * 1.57; drawStar(ctx, hu.x + Math.cos(a) * 50, hy - 300 + Math.sin(a) * 12, 9, a, '#ffd21f'); }
      if (hu.stun > 0 && hu.visible) outlinedText(ctx, 'STUNNED', hu.x, hy - 340, 26, '#ffd21f');
      if (hu.slow > 0 && hu.visible) outlinedText(ctx, 'SLOWED', hu.x + 70, hy - 300, 18, '#7ad8ff');
    }
    // item cards
    for (const c of this.cards) this.drawCard(ctx, c);
    FX.drawParts(ctx); FX.drawFloats(ctx);
  },
  drawCard(ctx, c) {
    let x = c.x, y = c.y, s = 1, flip = 1, id = c.id;
    if (c.phase === 'reveal') {
      const k = c.t;
      y = c.y - Math.min(1, k / 0.2) * 40;
      if (k < 0.42) { flip = Math.cos(k * 40); id = c.cyc; s = 0.85; }
      else { const kk = k - 0.42; s = kk < 0.1 ? 0.8 + kk * 6 : Math.max(1, 1.4 - (kk - 0.1) * 2); }
    } else {
      const k = Ease.inOut(clamp(c.t / c.dur, 0, 1));
      x = lerp(c.sx, c.tx, k); y = lerp(c.sy - 40, c.ty, k) - Math.sin(k * Math.PI) * 60; s = 1 - k * 0.35;
      if (c.slot == null) FX.burst(x, y, 1, { color: RARITY_COL[c.r], spMax: 30, lifeMax: 0.3, grav: 0 });
    }
    ctx.save(); ctx.translate(x, y); ctx.scale(s * Math.max(0.08, Math.abs(flip)), s);
    const col = c.phase === 'reveal' && c.t < 0.42 ? '#3a2a30' : RARITY_COL[c.r];
    if (c.r === 'epic' && c.t >= 0.42) { ctx.fillStyle = 'rgba(200,106,255,0.4)'; ctx.beginPath(); ctx.arc(0, 0, 50 + Math.sin(this.t * 20) * 5, 0, 7); ctx.fill(); }
    poly(ctx, [-34, -38, 36, -34, 34, 38, -36, 34], '#000', 0);
    poly(ctx, [-30, -34, 32, -30, 30, 34, -32, 30], col, 3);
    if (c.phase === 'reveal' && c.t < 0.42 && flip < 0) outlinedText(ctx, '?', 0, 0, 40, '#ffd21f');
    else ctx.drawImage(itemIcon(id), -28, -30, 56, 56);
    ctx.restore();
    if (c.phase === 'reveal' && c.t >= 0.42) {
      outlinedText(ctx, ITEMS[c.id].name, x, y + 52, 17, RARITY_COL[c.r]);
      outlinedText(ctx, c.r.toUpperCase(), x, y - 52, 13, RARITY_COL[c.r]);
    }
  },
  drawProj(ctx, p) {
    const k = clamp(p.t / p.dur, 0, 1); if (p.t < 0) return;
    const x = lerp(p.x, p.tx, k), y = lerp(p.y, p.ty, k);
    if (p.kind === 'arrow' || p.kind === 'rain') { const a = Math.atan2(p.ty - p.y, p.tx - p.x); ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.strokeStyle = OL; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(8, 0); ctx.stroke(); ctx.strokeStyle = '#d9a35a'; ctx.lineWidth = 2.5; ctx.stroke(); poly(ctx, [8, -4, 16, 0, 8, 4], '#d8dde8', 2); ctx.restore(); }
    else if (p.kind === 'rock') circ(ctx, x, y - Math.sin(k * Math.PI) * 40, 6, '#8a8478', 2.5);
    else if (p.kind === 'bomb') { circ(ctx, x, y - Math.sin(k * Math.PI) * 90, 11, '#1f1f28', 3); FX.fire(x, y - Math.sin(k * Math.PI) * 90 - 10, 1, { spMax: 30, sMax: 5 }); }
    else if (p.kind === 'efire') { ctx.fillStyle = 'rgba(255,106,19,0.5)'; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill(); circ(ctx, x, y, 6, '#ffd21f', 2); }
  },

  /* ---------------- UI ---------------- */
  buildUI() {
    const root = $('#m2ui');
    const ab = (i, name, key, col, left, wide) => `<button class="ab${wide ? ' wide' : ''}" data-a="${i}" style="left:${left}px;--ac:${col}${wide ? ';height:72px;width:150px' : ';width:84px'}"><div class="face"></div>${wide ? '' : '<canvas class="ic" width="72" height="72"></canvas>'}<div class="nm">${name}</div><div class="cdn"></div>${wide ? '<div class="meter"><i></i></div>' : ''}<span class="key" style="left:3px;top:2px">${key === 'SPACE' ? 'SPC' : key}</span></button>`;
    root.innerHTML = `
      <div class="vignette"></div>
      <div class="m2-top"><div class="m2-hp"><div class="lb">SQUAD HP</div><div class="bar"><i class="lag"></i><i class="main"></i><div class="hpn"></div></div></div>
        <div class="m2-wave">WAVE 1<small>KILLS 0</small></div><div class="m2-gold"><i></i><span>0</span></div><div class="m2-time">0:00</div></div>
      <button class="lab-btn" id="m2back" style="right:6px;top:40px;width:44px">MENU</button>
      <div class="trackbar"><div class="rail"></div><div class="me"></div><div class="hm"></div></div>
      <div class="tray hidden"><div class="lb">FIRE<br>BACK ↓</div>${[0, 1, 2].map((i) => `<button class="slot empty" data-s="${i}"><div class="face"></div><canvas width="72" height="72"></canvas><div class="n"></div><span class="k">${'QWE'[i]}</span></button>`).join('')}</div>
      <div class="beacon b-hunted"><div class="bg"></div><img src="${hunterPortrait(88)}" alt=""><div class="hn">HELL HUNTER</div><div class="bar hbar"><i class="lag"></i><i class="main"></i></div><div class="hhp"></div><div class="hst"></div><div class="vis">OFF SCREEN</div>
        <div class="dl">DISTANCE ↓ BEHIND</div><div class="dn">120<small>m</small></div><div class="rate"></div><div class="band">HUNTED</div></div>
      <div class="m2-ctrl">
        ${ab(0, 'CLEAVE', '1', '#2d6bd8', 6)}${ab(1, 'VOLLEY', '2', '#1fae8c', 96)}${ab(2, 'BOMB', '3', '#c8641a', 186)}${ab(3, 'RAMPAGE', 'SPACE', '#5a1a3a', 290, true)}
        <div class="m2-hint">TAP ENEMIES = STRIKE (A) · 1 2 3 · SPACE · Q W E items · R restart</div>
      </div>
      <div class="intro">
        <div class="ttl">HELL<br>CHASE</div>
        <div class="steps panel"><div class="panel-in">
          <div class="step"><b>1</b><span><em>TAP ENEMIES</em> to strike. Skills <em>1 2 3</em>. Kill fast.</span></div>
          <div class="step"><b>2</b><span>Kills drop <em>CHASE ITEMS</em> that fire <em>BACKWARD</em> at the Hunter.</span></div>
          <div class="step"><b>3</b><span>Watch <em>DISTANCE</em>. At 0m he catches you. Kill him with items to win.</span></div>
        </div></div>
        <div class="lab-row" style="width:100%"><label>CHASE ITEMS</label><div class="seg" id="m2mode"></div></div>
        <button class="btn btn-play" id="m2go">RUN!</button>
        <div class="lab-note">MANUAL = items wait in a 3-slot tray; you choose when to fire (Q / W / E)</div>
      </div>`;
    const ui = this.ui = { root };
    ui.intro = $('.intro', root);
    ui.hpBar = $('.m2-hp .main', root); ui.hpLag = $('.m2-hp .lag', root); ui.hpn = $('.m2-hp .hpn', root);
    ui.wave = $('.m2-wave', root); ui.gold = $('.m2-gold span', root); ui.time = $('.m2-time', root);
    ui.beacon = $('.beacon', root); ui.hBar = $('.beacon .main', root); ui.hLag = $('.beacon .lag', root); ui.hhp = $('.beacon .hhp', root); ui.hst = $('.beacon .hst', root);
    ui.vis = $('.beacon .vis', root); ui.dn = $('.beacon .dn', root); ui.rate = $('.beacon .rate', root); ui.band = $('.beacon .band', root);
    ui.trackH = $('.trackbar .hm', root);
    ui.tray = $('.tray', root); ui.slots = $$('.slot', root);
    ui.ab = $$('.m2-ctrl .ab', root); ui.abCd = ui.ab.map((b) => $('.cdn', b)); ui.ult = $('.m2-ctrl .ab.wide .meter i', root);
    ui.vig = $('.vignette', root);
    const icons = ['knight', 'archer', 'scrub'];
    ui.ab.slice(0, 3).forEach((b, i) => { const c = $('.ic', b).getContext('2d'); c.translate(36, 70); drawHero(c, icons[i], 0, 0, 0.62, { pose: 'attack', p: 0.5 }); });
    ui.ab.forEach((b, i) => press(b, () => this.skill(i)));
    ui.slots.forEach((s, i) => press(s, () => this.fireTray(i)));
    press($('#m2go', root), () => { if (this.state === 'intro') this.startRun(); });
    press($('#m2back', root), () => Main.toMenu());
  },
  refreshModeUI() {
    const seg = $('#m2mode'); if (!seg) return;
    seg.innerHTML = [['auto', 'AUTO-FIRE'], ['manual', 'MANUAL TRAY']].map(([v, l]) => `<button data-v="${v}" class="${S().m2.itemMode === v ? 'on' : ''}">${l}</button>`).join('');
    $$('button', seg).forEach((b) => press(b, () => { S().m2.itemMode = b.dataset.v; Save.save(); this.refreshModeUI(); }));
    if (this.ui) this.ui.tray.classList.toggle('hidden', S().m2.itemMode !== 'manual');
    this.refreshTray();
  },
  refreshTray() {
    if (!this.ui || !this.tray) return;
    this.ui.slots.forEach((s, i) => {
      const it = this.tray[i], has = it && it !== 'pending';
      s.className = 'slot' + (has ? ' r-' + it.r : ' empty');
      if (has) { const c = $('canvas', s).getContext('2d'); c.clearRect(0, 0, 72, 72); c.drawImage(itemIcon(it.id), 0, 0); $('.n', s).textContent = ITEMS[it.id].name; }
    });
  },
  uiTick() {
    if (!this.ui || !this.hunter) return;
    const ui = this.ui, H = this.hunter;
    ui.hpBar.style.width = (this.hp / this.hpMax * 100) + '%'; ui.hpLag.style.width = (this.hpLag / this.hpMax * 100) + '%';
    ui.hpBar.style.background = this.hp / this.hpMax < 0.3 ? '#ff3a2a' : '';
    ui.hpn.textContent = Math.ceil(this.hp) + ' / ' + this.hpMax;
    ui.wave.innerHTML = 'WAVE ' + this.wave + '<small>KILLS ' + this.kills + '</small>';
    ui.gold.textContent = fmt(this.gold); ui.time.textContent = fmtTime(this.time);
    ui.hBar.style.width = (H.hp / H.max * 100) + '%'; ui.hLag.style.width = (H.lag / H.max * 100) + '%';
    ui.hhp.textContent = fmt(H.hp) + ' / ' + fmt(H.max) + ' HP';
    const d = Math.max(0, H.dist);
    ui.dn.innerHTML = Math.ceil(d) + '<small>m</small>';
    const band = d >= 150 ? ['b-safe', 'SAFE-ISH', '#4fe03a'] : d >= 80 ? ['b-hunted', 'HUNTED', '#ffd21f'] : d >= 30 ? ['b-closing', 'CLOSING', '#ff6a13'] : ['b-danger', 'DANGER', '#ff2a2a'];
    if (ui.lastBand !== band[0]) { ui.beacon.classList.remove('b-safe', 'b-hunted', 'b-closing', 'b-danger'); ui.beacon.classList.add(band[0]); ui.band.textContent = band[1]; ui.band.style.background = band[2]; ui.lastBand = band[0]; }
    ui.dn.style.color = band[2];
    ui.beacon.classList.toggle('mini', H.visible);
    ui.vis.textContent = H.visible ? "HE'S HERE · " + Math.ceil(d) + 'm' : d < 80 ? 'CLOSING IN' : 'OFF SCREEN';
    const st = [];
    if (H.stun > 0) st.push(`<span class="s-stun">STUNNED ${H.stun.toFixed(1)}s</span>`);
    if (H.slow > 0) st.push(`<span class="s-slow">SLOWED ${H.slow.toFixed(1)}s</span>`);
    if (H.burn > 0) st.push(`<span class="s-burn">BURNING ${H.burn.toFixed(1)}s</span>`);
    ui.hst.innerHTML = st.length ? st.join(' · ') : '<span>CHARGING AT YOU</span>';
    const r = H.rate;
    ui.rate.textContent = Math.abs(r) < 0.05 ? '■ HOLDING' : (r < 0 ? '▼ ' : '▲ ') + Math.abs(r).toFixed(1) + ' m/s';
    ui.rate.style.color = r < 0 ? '#ff8a7a' : '#7aff8a';
    ui.trackH.style.top = (clamp(d / 200, 0, 1) * 100) + '%';
    const dz = clamp(1 - d / 60, 0, 1);
    ui.vig.style.boxShadow = 'inset 0 -140px 140px -40px rgba(255,0,20,' + (dz * 0.7).toFixed(2) + ')';
    for (let i = 0; i < 3; i++) {
      const cd = this.cds[i], max = [5, 8, 10][i];
      ui.ab[i].classList.toggle('cool', cd > 0); ui.abCd[i].textContent = cd > 0 ? cd.toFixed(1) : '';
      ui.ab[i].style.background = cd > 0 ? `conic-gradient(#000 ${(1 - cd / max) * 360}deg, #444 0)` : '#000';
    }
    ui.ult.style.width = this.ult + '%'; ui.ab[3].classList.toggle('ready', this.ult >= 100);
  },
  showResults() {
    const s = this.stats, win = this.state === 'slain';
    if (win) { const b = Save.data.best.m2; if (!b || this.time < b) { Save.data.best.m2 = this.time; Save.save(); } }
    const r = $('#results');
    const title = win ? 'HUNTER<br>SLAIN!' : this.state === 'caught' ? 'CAUGHT!' : 'OVERWHELMED';
    r.innerHTML = `<div class="res-title ${win ? '' : 'lose'}">${title}</div>
      <div class="panel"><div class="panel-in">
        <div class="res-grid">
          <div><span>RUN TIME</span><b>${fmtTime(this.time)}</b></div>
          <div><span>WAVES REACHED</span><b>${this.wave}</b></div>
          <div><span>KILLS</span><b>${this.kills}</b></div>
          <div><span>HUNTER HP LEFT</span><b>${Math.round(this.hunter.hp / this.hunter.max * 100)}%</b></div>
          <div><span>DAMAGE TO HUNTER</span><b>${fmt(s.hunterDmg)}</b></div>
          <div><span>CLOSEST CALL</span><b>${Math.max(0, Math.round(s.closest))}m</b></div>
          <div><span>ITEMS C / R / E</span><b>${s.items.common} / ${s.items.rare} / ${s.items.epic}</b></div>
          <div><span>HE CAUGHT UP · ESCAPES</span><b>${s.appearances} · ${s.escapes}</b></div>
          <div><span>QUICK CLEARS</span><b>${s.quick}</b></div>
          <div><span>DAMAGE TAKEN</span><b>${s.dmgTaken}</b></div>
          <div><span>ITEM MODE</span><b>${S().m2.itemMode.toUpperCase()}</b></div>
          <div><span>LOST (TRAY FULL)</span><b>${s.lostToFull}</b></div>
        </div>
      </div></div>
      <div class="lab-actions"><button class="btn btn-play" id="resRetry">RETRY</button><button class="btn btn-small btn-dark" id="resMenu">MENU</button></div>`;
    r.classList.remove('hidden');
    press($('#resRetry'), () => this.reset(true));
    press($('#resMenu'), () => Main.toMenu());
  },
};
