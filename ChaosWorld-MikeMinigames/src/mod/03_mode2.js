/* ==========================================================================
   MODE 2 — HELL CHASE (on the Battle Lab engine)
   Scrub runs right through a lava arena; enemies come from the right; the
   Hell Hunter (the Battle Lab's hooded demon) closes in from the LEFT.
   FSM: intro → play → (caught | dead | slain) → results
   ========================================================================== */
const M2_TUNE = {
  hp: 400, hunterHp: 7000, closeSpeed: 4.4, speedRamp: 240, slowMult: 0.25,
  visibleAt: 35, leaveAt: 42, maxDist: 260, dropChance: 0.14,
  hunterAtkEvery: 2.4, hunterTele: 0.75, hunterDmg: 16, quickClear: 9, quickBonus: 6, waveTimer: 13,
  strikeDmg: 26, strikeCd: 0.16, throwEvery: 1.0, throwDmg: 12,
  skillCd: [4, 6, 9], ultPerDmg: 1 / 16,
};
const M2_ENEMIES = {
  slime: { key: 'chaosSlime', hp: 70, dmg: 4, rate: 1.3, spd: 120 },
  fire: { key: 'fireSlime', hp: 80, dmg: 5, rate: 1.2, spd: 130 },
  fly: { key: 'flySlime', hp: 90, dmg: 5, rate: 1.4, spd: 170 },
  goblin: { key: 'goblinGrunt', hp: 80, dmg: 5, rate: 1.0, spd: 160 },
  skel: { key: 'skel', hp: 110, dmg: 6, rate: 1.2, spd: 130 },
  cultist: { key: 'cultist', hp: 100, dmg: 5, rate: 2.0, spd: 120, ranged: true },
  elite: { key: 'skelElite', hp: 700, dmg: 12, rate: 1.8, spd: 90, elite: true, scale: 1.25 },
};
const HOME = [470, 1000];
const BEACON = [120, 640]; // world point the off-screen items fly to (left edge)

const M2 = {
  name: 'm2',
  enter() { this.buildUI(); this.reset(false); },
  exit() { E.root.innerHTML = ''; $('#cw-results') && $('#cw-results').remove(); E.S.ui = { header: false, controls: false, diss: false, items: false, turnq: false }; },
  reset(skipIntro) {
    const set = S().m2;
    E.takeover({ backdrop: 'arena', lava: 1, ui: { header: true, controls: true, diss: true, items: false, turnq: false } });
    this.buildUI();
    const B = E.B;
    this.scrub = E.hero('scrub', HOME[0], HOME[1], { hp: M2_TUNE.hp, level: 3 });
    this.scrub.running = true;
    try { E.S.swapPanel(this.scrub); } catch (e) { /* ignore */ }
    this.t = 0; this.time = 0; this.stateT = 0; this.scroll = 0;
    this.gold = 0; this.kills = 0; this.wave = 0; this.waveT = 0; this.waveClock = 0; this.waveGap = 0; this.spawnQ = [];
    this.foes = []; this.projs = []; this.cards = []; this.decals = []; this.tray = [null, null, null];
    this.cds = [0, 0, 0]; this.ult = 0; this.focus = null; this.strikeT = 0; this.throwT = 0.6;
    const hmax = Math.round(M2_TUNE.hunterHp * set.hunterHp);
    this.hunter = { hp: hmax, max: hmax, lag: hmax, dist: set.startDist, prev: set.startDist, rate: 0, slow: 0, stun: 0, burn: 0, burnDps: 0, burnTick: 0, visible: false, enterT: 0, hurl: 0, atk: null, atkT: 2, flash: 0, lunge: 0, stepT: 0, beatT: 0 };
    this.stats = { items: { common: 0, rare: 0, epic: 0 }, hunterDmg: 0, closest: set.startDist, appearances: 0, escapes: 0, dmgTaken: 0, quick: 0, lostToFull: 0 };
    for (let i = 0; i < 14; i++) this.decals.push(this.newDecal(rand(-100, 1180)));
    this.done = false;
    $('#cw-results') && $('#cw-results').remove();
    this.refreshModeUI();
    if (skipIntro) this.startRun(); else this.setState('intro');
  },
  setState(s) {
    this.state = s; this.stateT = 0;
    this.ui.intro.classList.toggle('hidden', s !== 'intro');
    if (s === 'caught') { E.banner('CAUGHT!', 'THE HUNTER GOT YOU', 'red', 2.2); Sfx.play('hereHe'); sfx('explosion'); E.B.cam.shake(1); E.flash('#ff0010'); this.scrub.downed = true; sfx('defeat'); }
    if (s === 'dead') { E.banner('OVERWHELMED', '', 'red', 2.2); this.scrub.downed = true; sfx('defeat'); }
    if (s === 'slain') { E.banner('HUNTER SLAIN!', 'YOU OUTRAN HELL', 'green', 2.4); sfx('victory'); E.B.cam.shake(0.6); E.B.hitStopT = 0.25; }
  },
  startRun() { this.setState('play'); E.banner('RUN!', 'KEEP IT BEHIND YOU', 'ready', 1.2); sfx('roar'); this.nextWave(); },
  get itemMode() { return S().m2.itemMode; },

  /* ---------------- input ---------------- */
  onKey(k, e) {
    if (this.state === 'intro') { if (k === ' ' || k === 'Enter') { this.startRun(); return true; } return false; }
    if (k === '1' || k === '2' || k === '3') { this.skill(+k - 1); return true; }
    if (k === ' ') { this.onUlt(); return true; }
    if (k === 'q' || k === 'w' || k === 'e') { this.fireTray('qwe'.indexOf(k)); return true; }
    if (k === 'a' || k === 's') { const t = this.focus && this.focus.alive ? this.focus : this.nearest(); if (t) this.strike(t); return true; }
    if (k === 'r') { this.reset(true); return true; }
    return false;
  },
  onSkill(i) { this.skill(i); },
  onUlt() {
    if (this.state !== 'play' || this.ult < 100) return;
    this.ult = 0; sfx('diss'); E.flash('#ffd54a'); E.B.cam.shake(0.6);
    E.banner('CHAOS RAMPAGE!', 'FREE RARE CHASE ITEM', 'chaos', 1.1);
    const sc = this.scrub; this.swing(sc, 'spin');
    for (const f of this.alive()) { E.B.fx.burst(f.x, f.cy, 16, { color: '#ffb02a', speed: 700, size: 14, life: 0.5, type: 'glow' }); this.damage(f, 150, { heavy: true, skill: true }); }
    this.rollDrop(sc.x + 40, sc.cy - 140, 'rare');
  },
  ultReady() { return this.state === 'play' && this.ult >= 100; },
  onWorldTap(x, y) {
    if (this.state !== 'play') return false;
    let best = null, bd = 140 * 140;
    for (const f of this.alive()) { const dx = f.x - x, dy = f.cy - y; const d = dx * dx + dy * dy * 0.6; if (d < bd) { bd = d; best = f; } }
    if (best) { this.strike(best); return true; }
    return false;
  },
  alive() { return this.foes.filter((f) => f.alive && f.x < 1060); },
  nearest() { let b = null, bd = 1e9; for (const f of this.alive()) { const d = Math.abs(f.x - this.scrub.x) + Math.abs(f.y - this.scrub.y) * 0.5; if (d < bd) { bd = d; b = f; } } return b; },

  /* ---------------- Scrub attacks (Battle Lab poses + FX) ---------------- */
  swing(f, kind) {
    const L = E.L, D = L.D;
    let a;
    if (kind === 'throw') a = E.act(420).pose(140, 'throwAntic', D.outQuad).pose(240, 'throwRelease', D.outExpo).pose(420, f.idlePose, D.inOutQuad);
    else if (kind === 'stab') a = E.act(330).pose(90, 'stabAntic', D.outQuad).pose(170, 'stabHit', D.outExpo).pose(330, f.idlePose, D.inOutQuad);
    else if (kind === 'spin') a = E.act(600).pose(150, 'spin1', D.outQuad).pose(300, 'spin2').pose(450, 'spin1').pose(600, f.idlePose);
    else a = E.act(420).pose(120, 'slashAntic', D.outQuad).pose(200, 'slashHit', D.outExpo).pose(300, 'slashFollow').pose(420, f.idlePose, D.inOutQuad);
    a.tag = 'skill'; f.play(a);
  },
  strike(t) {
    if (this.strikeT > 0 || this.state !== 'play' || !t.alive) return;
    this.strikeT = M2_TUNE.strikeCd; this.focus = t;
    const sc = this.scrub; sc.facing = t.x >= sc.x ? 1 : -1;
    if (!sc.act || sc.act.tag !== 'skill2') this.swing(sc, 'stab');
    const B = E.B, dir = t.x > sc.x ? 1 : -1;
    B.fx.streak(sc.x + 60 * dir, sc.cy - 10, t.x, t.cy, '#ffe9a0', 22, 0.14);
    B.fx.impactStar(t.x, t.cy, 110, '#fff3c0', 8, 0.16);
    sfx('swish', 0.7);
    this.damage(t, M2_TUNE.strikeDmg, {});
  },
  skill(i) {
    if (this.state !== 'play' || this.cds[i] > 0) return;
    const B = E.B, sc = this.scrub, foes = this.alive();
    this.cds[i] = M2_TUNE.skillCd[i];
    if (i === 0) { // THROW — rock barrage at up to 3 enemies
      this.swing(sc, 'throw'); sfx('throwWhoosh');
      const ts = foes.sort((a, b) => a.x - b.x).slice(0, 3);
      if (!ts.length) FX2.say(sc, 'NOTHING TO HIT', '#aaa');
      ts.forEach((t, k) => this.projs.push({ kind: 'rock', x: sc.x + 40, y: sc.cy - 30, tx: t.x, ty: t.cy, t: -k * 0.08, dur: 0.35, arc: 120, onHit: () => { if (t.alive) { this.damage(t, 40, { skill: true, heavy: true }); sfx('stoneHit'); B.fx.burst(t.x, t.cy, 10, { color: '#c8905a', speed: 500, size: 10 }); } } }));
    } else if (i === 1) { // THRUST — dash-stab the nearest, splash
      const t = this.nearest(); if (!t) { this.cds[i] = 0.5; return; }
      sfx('dash'); sc.ghost && sc.ghost(B.pxScale);
      const a = E.act(560).pose(80, 'stabAntic', E.L.D.outQuad).pose(200, 'stabDash').pose(260, 'stabHit', E.L.D.outExpo).pose(560, sc.idlePose)
        .move(80, 240, () => [t.x - 150, t.y], E.L.D.inCubic).move(320, 560, () => [HOME[0], HOME[1]], E.L.D.inOutQuad)
        .at(240, () => {
          B.fx.streak(sc.x - 60, sc.cy - 10, t.x + 120, t.cy, '#6aff8a', 30, 0.2); B.fx.impactStar(t.x, t.cy, 170, '#bfffd0', 12, 0.2);
          if (t.alive) this.damage(t, 70, { skill: true, heavy: true, stop: 0.08 });
          for (const o of this.alive()) if (o !== t && Math.abs(o.x - t.x) < 220 && Math.abs(o.y - t.y) < 200) this.damage(o, 35, { skill: true });
        });
      a.tag = 'skill2'; sc.play(a);
    } else { // SLASH — huge arc hitting everything close
      this.swing(sc, 'slash'); sfx('bigSwish');
      B.fx.slashArc(sc.x + 120, sc.cy - 10, 330, -2.4, 1.2, '#5ab8ff', 80, 0.34, 0.85, 0.1);
      B.fx.slashArc(sc.x + 130, sc.cy, 260, -2.2, 1.0, '#bfe8ff', 40, 0.3, 0.85, 0.1);
      B.cam.shake(0.25);
      for (const f of foes) if (f.x - sc.x < 520 && Math.abs(f.y - sc.y) < 300) { this.damage(f, 60, { skill: true, heavy: true, knock: 900 }); f.x += 60; }
      if (this.hunter.visible && this.hunter.dist < 15) this.hurtHunter(25);
    }
  },
  damage(f, dmg, o) {
    if (!f.alive) return;
    const crit = !o.skill && Math.random() < 0.1; if (crit) dmg = Math.round(dmg * 1.8);
    f.hp = Math.max(0, f.hp - dmg);
    E.hit(f, dmg, { heavy: o.heavy, crit, knock: o.knock, stop: o.stop || (crit ? 0.08 : 0), fill: o.skill ? '#ffd54a' : undefined });
    if (crit) { E.B.fx.impactStar(f.x, f.cy, 200, '#ffcf5a', 12, 0.25); sfx('crit'); } else sfx(o.heavy ? 'hit' : 'smallHit');
    this.ult = Math.min(100, this.ult + dmg * M2_TUNE.ultPerDmg);
    if (f.hp <= 0) this.kill(f);
  },
  kill(f) {
    E.B.killEnemy(f); this.kills++; this.gold += f.data.m2.elite ? 120 : randi(8, 18); sfx('coin');
    if (f.data.m2.elite) { E.B.cam.shake(0.4); E.B.hitStopT = 0.08; this.rollDrop(f.x, f.cy - 120, 'rare'); }
    else if (Math.random() < M2_TUNE.dropChance * S().m2.dropRate) this.rollDrop(f.x, f.cy - 100, null);
    if (this.focus === f) this.focus = null;
  },

  /* ---------------- waves ---------------- */
  nextWave() {
    if (this.wave > 0 && !this.foes.some((f) => f.alive)) {
      this.scrubHeal(20);
      if (this.waveClock < M2_TUNE.quickClear) { this.stats.quick++; this.pushHunter(M2_TUNE.quickBonus, 'QUICK CLEAR'); E.toast('QUICK CLEAR! <small>+' + M2_TUNE.quickBonus + 'm FROM THE HUNTER</small>', 1.4); }
    }
    this.wave++; this.waveClock = 0; this.waveT = M2_TUNE.waveTimer;
    const n = this.wave, count = Math.min(3 + n, 10);
    const pool = n === 1 ? ['slime', 'slime', 'fire'] : n === 2 ? ['slime', 'fire', 'goblin', 'fly'] : n === 3 ? ['slime', 'goblin', 'skel', 'fly'] : ['slime', 'fire', 'goblin', 'skel', 'skel', 'fly', 'cultist'];
    for (let i = 0; i < count; i++) this.spawnQ.push({ type: pick(pool), delay: i * rand(0.25, 0.45) });
    if (n % 3 === 0) this.spawnQ.push({ type: 'elite', delay: 0.8 });
    if (n > 1) E.banner('WAVE ' + n, n % 3 === 0 ? 'ELITE INCOMING' : '', n % 3 === 0 ? 'boss' : 'ready', 1.0);
    sfx('wave');
  },
  spawn(type) {
    const d = M2_ENEMIES[type], hpM = 1 + this.time / 120;
    const y = rand(860, 1200), x = 1180 + rand(0, 120);
    const f = E.enemy(d.key, x, y, { hp: Math.round(d.hp * hpM), level: d.elite ? 5 : 1 + Math.floor(this.wave / 3), scale: d.scale });
    f.maxHp = f.hp; f.running = true; f.facing = -1; f.data.showHp = true;
    // engagement lanes so the mob spreads out instead of stacking
    const LANES = d.ranged ? [[930, 820], [960, 1180]] : [[650, 880], [690, 1130], [790, 960], [820, 1220], [900, 860], [930, 1060]];
    const used = this.foes.filter((o) => o.alive && o.data.m2).map((o) => o.data.m2.lane);
    let li = LANES.findIndex((_, k) => !used.includes((d.ranged ? 'r' : 'm') + k)); if (li < 0) li = randi(0, LANES.length - 1);
    const lane = LANES[li];
    f.y = f.hy = lane[1] + rand(-30, 30);
    f.data.m2 = { lane: (d.ranged ? 'r' : 'm') + li, slot: rand(0, 60), def: d, elite: !!d.elite, ex: lane[0] + rand(-20, 20), atkT: rand(0.5, 1.2), dmgM: 1 + this.time / 180 };
    this.foes.push(f);
  },
  updateFoes(dt) {
    for (let i = this.spawnQ.length - 1; i >= 0; i--) { const s = this.spawnQ[i]; s.delay -= dt; if (s.delay <= 0) { this.spawn(s.type); this.spawnQ.splice(i, 1); } }
    this.foes = this.foes.filter((f) => f.alive || f.deadT < 1.4);
    for (const f of this.foes) {
      if (!f.alive) { f.x -= 90 * dt; continue; } // corpses scroll past
      const m = f.data.m2;
      if (f.x > m.ex + 4) { if (!f.act) { f.x -= (m.def.spd + 90) * dt; f.running = true; f.hx = f.x; } }
      else {
        f.running = false; f.hx = f.x;
        if (!f.act) {
          m.atkT -= dt;
          if (m.atkT <= 0) { m.atkT = m.def.rate * 1.7 * rand(0.85, 1.15); this.foeAttack(f); }
        }
      }
    }
    this.waveClock += dt; this.waveT -= dt;
    const anyLeft = this.foes.some((f) => f.alive) || this.spawnQ.length;
    if (!anyLeft || this.waveT <= 0) { if (!this.waveGap) this.waveGap = anyLeft ? 0.01 : 0.8; this.waveGap -= dt; if (this.waveGap <= 0) { this.waveGap = 0; this.nextWave(); } }
  },
  foeAttack(f) {
    const sc = this.scrub, m = f.data.m2, dmg = Math.round(m.def.dmg * m.dmgM), D = E.L.D, B = E.B;
    if (m.def.ranged) {
      const a = E.act(700).pose(250, 'cast', D.outQuad).pose(700, f.idlePose).at(250, () => {
        sfx('magic'); this.projs.push({ kind: 'orb', x: f.x - 40, y: f.cy - 40, tx: sc.x, ty: sc.cy, t: 0, dur: 0.5, arc: 40, onHit: () => this.hurtScrub(dmg) });
      }); a.tag = 'enemy'; f.play(a); return;
    }
    f.glow = 1; f.glowColor = '#ff3a5c';
    const a = E.act(1000).pose(220, 'slashAntic', D.outQuad).pose(420, 'slashHit', D.inQuad).pose(640, 'slashHit').pose(1000, f.idlePose)
      .move(220, 420, () => [sc.x + 130 + (m.slot || 0), sc.y + (f.hy - sc.y) * 0.55], D.inCubic).move(640, 1000, () => [m.ex, f.hy], D.inOutQuad)
      .at(220, () => { f.glow = 0; sfx('swish', 0.6); })
      .at(420, () => { B.fx.slashArc(sc.x + 50, sc.cy, 110, -0.8, -3.2, '#ff6a7a', 26, 0.2, 0.8); B.fx.impactStar(sc.x + 20, sc.cy, 100, '#ff8a9a', 8, 0.18); this.hurtScrub(dmg); });
    a.tag = 'enemy'; f.play(a);
  },
  hurtScrub(dmg, o = {}) {
    if (this.state !== 'play') return;
    const sc = this.scrub; sc.hp = Math.max(0, sc.hp - dmg); this.stats.dmgTaken += dmg;
    E.hit(sc, dmg, { heavy: o.heavy, dy: 90 }); if (!o.heavy) sc.flash = 0.45; sfx(o.heavy ? 'hit' : 'smallHit');
    if (sc.hp <= 0) this.setState('dead');
  },
  scrubHeal(n) { const sc = this.scrub; sc.hp = Math.min(sc.maxHp, sc.hp + n); E.B.fx.number(sc.x, sc.cy - 120, '+' + n, { size: 44, fill: '#9aff6a', life: 0.9 }); },
  updateScrub(dt) {
    const sc = this.scrub;
    this.strikeT = Math.max(0, this.strikeT - dt);
    for (let i = 0; i < 3; i++) this.cds[i] = Math.max(0, this.cds[i] - dt);
    if (!sc.act && this.state === 'play') { sc.running = true; sc.facing = 1; if (Math.abs(sc.x - HOME[0]) > 4) { sc.x = lerp(sc.x, HOME[0], Math.min(1, dt * 6)); sc.y = lerp(sc.y, HOME[1], Math.min(1, dt * 6)); } }
    else sc.running = false;
    // auto basic: THROW a rock at the focus / nearest every second
    this.throwT -= dt;
    if (this.throwT <= 0 && this.state === 'play') {
      this.throwT = M2_TUNE.throwEvery;
      const t = this.focus && this.focus.alive ? this.focus : this.nearest();
      if (t && t.x < 1040) {
        if (!sc.act) this.swing(sc, 'throw');
        this.projs.push({ kind: 'rock', x: sc.x + 40, y: sc.cy - 40, tx: t.x, ty: t.cy, t: 0, dur: 0.32, arc: 90, onHit: () => { if (t.alive) { this.damage(t, M2_TUNE.throwDmg, {}); } } });
      }
    }
  },

  /* ---------------- chase items ---------------- */
  rollDrop(x, y, minR) {
    const tb = this.time, pe = Math.min(0.15, 0.05 + tb / 1500), pr = Math.min(0.4, 0.25 + tb / 1000), roll = Math.random();
    let r = roll < pe ? 'epic' : roll < pe + pr ? 'rare' : 'common';
    if (minR === 'rare' && r === 'common') r = Math.random() < 0.3 ? 'epic' : 'rare';
    this.cards.push({ id: pick(ITEM_POOL[r]), r, x, y, t: 0, phase: 'reveal', cyc: pick(Object.keys(ITEMS)), cycT: 0 });
    Sfx.play('reveal');
  },
  updateCards(dt) {
    for (let i = this.cards.length - 1; i >= 0; i--) {
      const c = this.cards[i]; c.t += dt;
      if (c.phase === 'reveal') {
        c.cycT -= dt; if (c.cycT <= 0 && c.t < 0.42) { c.cycT = 0.07; c.cyc = pick(Object.keys(ITEMS)); Sfx.play('tick'); }
        if (c.t >= 0.42 && !c.shown) {
          c.shown = true; this.stats.items[c.r]++;
          const B = E.B;
          if (c.r === 'epic') { Sfx.play('epic'); E.flash('#c86aff'); E.banner('EPIC!', ITEMS[c.id].name, 'chaos', 1.1); B.fx.burst(c.x, c.y, 36, { color: '#e08aff', speed: 900, size: 16, life: 0.6, type: 'glow' }); B.fx.ring(c.x, c.y, 20, 260, '#e08aff', 0.4, 1, 12, true); }
          else if (c.r === 'rare') { Sfx.play('rare'); B.fx.burst(c.x, c.y, 18, { color: '#6ac8ff', speed: 700, size: 12, life: 0.45, type: 'glow' }); }
          else sfx('itemLand');
        }
        if (c.t >= (c.r === 'common' ? 0.8 : 1.0)) {
          if (this.itemMode === 'manual') {
            const slot = this.tray.indexOf(null);
            if (slot < 0) { this.stats.lostToFull++; E.B.fx.number(c.x, c.y, 'TRAY FULL!', { size: 40, fill: '#ff6a6a', life: 0.9 }); Sfx.play('full'); this.cards.splice(i, 1); continue; }
            this.tray[slot] = 'pending'; const r = this.slotWorld(slot);
            Object.assign(c, { phase: 'fly', t: 0, sx: c.x, sy: c.y, tx: r[0], ty: r[1], dur: 0.35, slot });
          } else this.launch(c, c.x, c.y);
        }
      } else if (c.t >= c.dur) {
        this.cards.splice(i, 1);
        if (c.slot != null) { this.tray[c.slot] = { id: c.id, r: c.r }; this.refreshTray(); } else this.applyItem(c.id);
      }
    }
  },
  launch(c, x, y) {
    const H = this.hunter;
    Object.assign(c, { phase: 'fly', t: 0, sx: x, sy: y, slot: null, dur: 0.45 });
    if (H.visible) { c.tx = this.hunterX() + 40; c.ty = 900; } else { c.tx = BEACON[0]; c.ty = BEACON[1]; }
    Sfx.play('whoosh');
  },
  slotWorld(i) { return [380 + i * 160, 1250]; },
  fireTray(i) {
    if (this.state !== 'play' || this.itemMode !== 'manual') return;
    const it = this.tray[i]; if (!it || it === 'pending') return;
    this.tray[i] = null; this.refreshTray();
    const [sx, sy] = this.slotWorld(i), c = { id: it.id, r: it.r, x: sx, y: sy, t: 0, shown: true };
    this.cards.push(c); this.launch(c, this.scrub.x, this.scrub.cy - 80);
    const s = this.ui.slots[i]; s.classList.remove('hit'); void s.offsetWidth; s.classList.add('hit');
  },
  applyItem(id) {
    const it = ITEMS[id], H = this.hunter, B = E.B;
    if (this.state !== 'play') return;
    if (it.double) { this.pop('DOUBLE TRAP!', '#e08aff'); this.applyItem(pick(ITEM_POOL.rare)); E.B.later(0.22, () => this.applyItem(pick(ITEM_POOL.rare))); return; }
    sfx(it.dmg >= 400 ? 'explosion' : 'itemUse'); Sfx.play('trap');
    if (H.visible) {
      const hx = this.hunterX() + 40, hy = 900;
      B.fx.burst(hx, hy, 30, { color: '#ffb02a', speed: 900, size: 16, life: 0.5, type: 'glow' }); B.fx.impactStar(hx, hy, 260, RARITY[it.r].col, 14, 0.3); B.fx.ring(hx, hy, 20, 300, RARITY[it.r].col, 0.4, 1, 12, true);
      B.fx.number(hx, hy - 160, it.name, { size: 46, fill: RARITY[it.r].col, life: 1.0, vy: -60 });
      B.cam.shake(it.r === 'common' ? 0.2 : 0.45);
    } else this.beaconHit();
    if (it.dmg) { this.hurtHunter(it.dmg); this.pop('-' + it.dmg, '#ff6a6a'); }
    if (it.burn) { H.burn = it.burn; H.burnDps = it.burnDps; this.pop('BURNING', '#ff9a3a'); }
    if (it.slow) { H.slow = Math.max(H.slow, it.slow); this.pop('SLOWED ' + it.slow + 's', '#7ad8ff'); Sfx.play('slow'); }
    if (it.stun) { H.stun = Math.max(H.stun, it.stun); this.pop('STUNNED ' + it.stun + 's', '#ffd54a'); Sfx.play('stun'); }
    if (it.kb) this.pushHunter(it.kb);
  },
  pushHunter(m, label) {
    const H = this.hunter, wasVis = H.visible;
    H.dist = Math.min(M2_TUNE.maxDist, H.dist + m);
    this.pop('+' + m + 'm ' + (label || 'KNOCKBACK'), '#9aff6a'); Sfx.play('knock');
    if (wasVis && H.dist >= M2_TUNE.leaveAt) { H.hurl = 0.8; H.visible = false; this.stats.escapes++; E.banner('BREATHING ROOM!', 'YOU HURLED IT BACK', 'green', 1.5); E.B.cam.shake(0.5); sfx('roar'); }
  },
  hurtHunter(dmg) {
    const H = this.hunter; H.hp = Math.max(0, H.hp - dmg); H.flash = 1; this.stats.hunterDmg += dmg;
    if (H.hp <= 0 && this.state === 'play') this.setState('slain');
  },
  beaconHit() { const b = this.ui.beacon; b.classList.remove('hitfx'); void b.offsetWidth; b.classList.add('hitfx'); },
  pop(txt, color) {
    const now = performance.now(); this.popStack = (this.popStack || []).filter((t) => now - t < 700); const n = this.popStack.length; this.popStack.push(now);
    const p = el('div', 'cw-bpop', E.root, txt); p.style.color = color;
    if (this.hunter.visible || this.hunter.hurl > 0) { p.style.left = clamp(this.hunterX() - 40, 40, 520) + (n % 2) * 60 + 'px'; p.style.top = 600 - n * 56 + 'px'; }
    else { p.style.left = 70 + (n % 2) * 80 + 'px'; p.style.top = 520 - n * 56 + 'px'; }
    setTimeout(() => p.remove(), 1150);
  },
  hunterX() { const H = this.hunter; return lerp(-190, 300, clamp(1 - H.dist / M2_TUNE.visibleAt, 0, 1)) + (H.lunge || 0) * 120; },
  closingSpeed() {
    const H = this.hunter; if (H.stun > 0 || H.hurl > 0) return 0;
    let s = M2_TUNE.closeSpeed * S().m2.hunterSpeed * (1 + this.time / M2_TUNE.speedRamp); if (H.slow > 0) s *= M2_TUNE.slowMult; return s;
  },
  updateHunter(dt) {
    const H = this.hunter;
    H.flash = Math.max(0, H.flash - dt * 3); H.slow = Math.max(0, H.slow - dt); H.stun = Math.max(0, H.stun - dt); H.lunge = Math.max(0, H.lunge - dt * 2.5);
    if (H.burn > 0) { H.burn -= dt; H.burnTick -= dt; if (H.burnTick <= 0) { H.burnTick = 0.5; this.hurtHunter(Math.round(H.burnDps * 0.5)); } }
    if (H.hurl > 0) H.hurl = Math.max(0, H.hurl - dt);
    H.dist = Math.max(0, H.dist - this.closingSpeed() * dt);
    this.stats.closest = Math.min(this.stats.closest, H.dist);
    const inst = (H.dist - H.prev) / dt; H.prev = H.dist; H.rate = lerp(H.rate, inst, Math.min(1, dt * 4));
    H.lag = H.lag > H.hp ? Math.max(H.hp, H.lag - H.max * 0.2 * dt) : H.hp;
    if (!H.visible && H.hurl <= 0 && H.dist < M2_TUNE.visibleAt) {
      H.visible = true; H.enterT = 0; H.atkT = 1.6; this.stats.appearances++;
      E.banner("HE'S HERE!", 'KNOCK HIM BACK', 'red', 1.3); Sfx.play('hereHe'); sfx('bossWarn'); E.B.cam.shake(0.7); E.flash('#ff0010');
    } else if (H.visible && H.dist >= M2_TUNE.leaveAt) H.visible = false;
    H.enterT += dt;
    if (!H.visible && H.dist < 90) { H.stepT -= dt; if (H.stepT <= 0) { H.stepT = 0.35 + H.dist / 90; Sfx.play('step'); if (H.dist < 55) E.B.cam.shake(0.08); } }
    if (H.dist < 40) { H.beatT -= dt; if (H.beatT <= 0) { H.beatT = 0.35 + H.dist / 60; Sfx.play('heartbeat'); } }
    if (H.visible && H.stun <= 0) {
      if (!H.atk) { H.atkT -= dt; if (H.atkT <= 0) { H.atk = { t: 0 }; sfx('enemyTelegraph'); } }
      else {
        H.atk.t += dt;
        if (H.atk.t >= M2_TUNE.hunterTele) {
          H.atk = null; H.atkT = M2_TUNE.hunterAtkEvery * rand(0.85, 1.15); H.lunge = 1;
          const sc = this.scrub, B = E.B;
          B.fx.slashArc(sc.x - 40, sc.cy, 220, -2.6, 0.4, '#c070ff', 60, 0.3, 0.9); B.fx.impactStar(sc.x, sc.cy, 200, '#e0a0ff', 12, 0.25);
          this.hurtScrub(Math.round(M2_TUNE.hunterDmg * (1 + this.time / 180)), { heavy: true }); B.cam.shake(0.5); B.hitStopT = 0.07; sfx('roar');
        }
      }
    } else if (H.atk) { H.atk = null; H.atkT = 1.2; }
    if (H.dist <= 0 && this.state === 'play') this.setState('caught');
  },

  /* ---------------- update ---------------- */
  update(dt) {
    this.t += dt; this.stateT += dt;
    const run = this.state === 'play' || this.state === 'intro';
    this.scroll += dt * (run ? 260 : 0);
    for (const d of this.decals) { d.x -= dt * (run ? 260 : 0) * d.k; if (d.x < -120) Object.assign(d, this.newDecal(1180 + rand(0, 200))); }
    for (let i = this.projs.length - 1; i >= 0; i--) { const p = this.projs[i]; p.t += dt; if (p.t >= p.dur) { this.projs.splice(i, 1); if (p.onHit && this.state === 'play') p.onHit(); } }
    if (this.state === 'play') {
      this.time += dt;
      this.updateFoes(dt); this.updateScrub(dt); this.updateCards(dt); this.updateHunter(dt);
      if (Math.random() < dt * 3) E.B.fx.dust(this.scrub.x - 30, this.scrub.y, 2, '#6a3a2a', 30);
    } else if (this.state === 'caught') {
      this.hunter.dist = Math.max(-8, this.hunter.dist - dt * 14); this.hunter.lunge = Math.min(1, this.stateT * 2);
      if (this.stateT > 2.2 && !this.done) { this.done = true; this.showResults(); }
    } else if (this.state === 'dead' || this.state === 'slain') {
      if (this.state === 'slain') { this.hunter.flash = Math.sin(this.stateT * 20) > 0 ? 0.8 : 0; this.hunter.fade = clamp(this.stateT / 2, 0, 1); }
      if (this.stateT > 2.4 && !this.done) { this.done = true; this.showResults(); }
    }
    if (this.state === 'intro') { this.scrub.running = true; }
    this.uiTick();
  },
  newDecal(x) { return { x, y: rand(820, 1280), k: rand(0.95, 1.05), kind: pick(['rock', 'rock', 'bone', 'crack', 'skull']), s: rand(0.7, 1.3) }; },

  /* ---------------- drawing (world space, inside the Battle Lab render) ---------------- */
  drawGround(ctx) {
    for (const d of this.decals) {
      ctx.save(); ctx.translate(d.x, d.y); ctx.scale(d.s, d.s * 0.6);
      if (d.kind === 'rock') { ctx.fillStyle = '#2a1012'; ctx.beginPath(); ctx.ellipse(0, 0, 34, 20, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#5a2a22'; ctx.beginPath(); ctx.ellipse(-4, -6, 26, 14, 0, 0, 7); ctx.fill(); }
      else if (d.kind === 'crack') { ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-50, 0); ctx.lineTo(-10, 8); ctx.lineTo(20, -6); ctx.lineTo(56, 4); ctx.stroke(); }
      else if (d.kind === 'skull') { ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.arc(0, -10, 14, 0, 7); ctx.fill(); ctx.fillStyle = '#140818'; ctx.fillRect(-7, -12, 5, 5); ctx.fillRect(2, -12, 5, 5); }
      else { ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(24, -4); ctx.stroke(); }
      ctx.restore();
    }
    // enemy target ring / hunter attack zone
    const B = E.B;
    if (this.focus && this.focus.alive) B.drawTargetRing(ctx, this.focus, '#ffd54a', true);
    const H = this.hunter;
    if (H && H.visible && H.atk) { const k = H.atk.t / M2_TUNE.hunterTele; ctx.save(); ctx.globalAlpha = 0.25 + 0.3 * Math.sin(E.t * 24); ctx.fillStyle = '#c010ff'; ctx.beginPath(); ctx.ellipse(this.scrub.x, this.scrub.y + 6, 200 * (0.5 + k * 0.5), 60 * (0.5 + k * 0.5), 0, 0, 7); ctx.fill(); ctx.restore(); }
  },
  drawWorld(ctx) {
    for (const p of this.projs) {
      if (p.t < 0) continue; const k = clamp(p.t / p.dur, 0, 1), x = lerp(p.x, p.tx, k), y = lerp(p.y, p.ty, k) - Math.sin(k * Math.PI) * (p.arc || 0);
      if (p.kind === 'rock') { ctx.fillStyle = '#140818'; ctx.beginPath(); ctx.arc(x, y, 17, 0, 7); ctx.fill(); ctx.fillStyle = '#9a7a5a'; ctx.beginPath(); ctx.arc(x - 2, y - 2, 12, 0, 7); ctx.fill(); }
      else if (p.kind === 'orb') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(200,90,255,0.6)'; ctx.beginPath(); ctx.arc(x, y, 30, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill(); ctx.restore(); }
    }
    this.drawHunter(ctx);
  },
  drawHunter(ctx) {
    const H = this.hunter; if (!H) return;
    if (!(H.visible || H.hurl > 0 || this.state === 'caught' || (this.state === 'slain' && H.dist < M2_TUNE.visibleAt))) return;
    let x = this.hunterX(), y = 990, s = 1.3, rot = 0, alpha = 1;
    if (H.hurl > 0) { const k = 1 - H.hurl / 0.8; x -= k * k * 700; rot = -k * 1.6; s *= 1 - k * 0.3; }
    if (H.enterT < 0.4 && H.visible) x -= (1 - H.enterT / 0.4) * 300;
    if (this.state === 'slain') { alpha = 1 - (H.fade || 0); s *= 1 + (H.fade || 0) * 0.2; }
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(rot);
    if (H.atk) { const k = H.atk.t / M2_TUNE.hunterTele; ctx.translate(-30 * k, 0); }
    E.L.gn(ctx, 0, 0, s, E.t, { frame: false, cards: false, grin: H.atk || this.state === 'caught' ? 1 : 0.6 });
    if (H.flash > 0.02 || H.slow > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * (H.flash > 0.02 ? H.flash * 0.5 : 0.25); ctx.fillStyle = H.flash > 0.02 ? '#fff' : '#3ab0ff'; ctx.beginPath(); ctx.ellipse(0, 40 * s, 170 * s, 260 * s, 0, 0, 7); ctx.fill(); }
    ctx.restore();
    if (H.stun > 0) { for (let i = 0; i < 5; i++) { const a = E.t * 5 + i * 1.26; E.B.drawStar(ctx, x + Math.cos(a) * 130, y - 260 + Math.sin(a) * 30, 22, '#ffd54a'); } wText(ctx, 'STUNNED', x, y - 330, 60, '#ffd54a'); }
    else if (H.slow > 0) wText(ctx, 'SLOWED', x + 60, y - 300, 48, '#7ad8ff');
  },
  drawOverhead(ctx) {
    for (const c of this.cards) {
      let x = c.x, y = c.y, s = 1, flip = 1, id = c.id, hidden = false;
      if (c.phase === 'reveal') {
        y = c.y - Math.min(1, c.t / 0.2) * 60;
        if (c.t < 0.42) { flip = Math.cos(c.t * 40); id = c.cyc; s = 0.9; hidden = flip < 0; }
        else { const k = c.t - 0.42; s = k < 0.1 ? 0.85 + k * 5 : Math.max(1, 1.35 - (k - 0.1) * 2); }
      } else { const k = E.L.D.inOutQuad(clamp(c.t / c.dur, 0, 1)); x = lerp(c.sx, c.tx, k); y = lerp(c.sy - 60, c.ty, k) - Math.sin(k * Math.PI) * 120; s = 1 - k * 0.4; }
      if (c.r === 'epic' && c.t >= 0.42 && c.phase === 'reveal') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(200,106,255,0.35)'; ctx.beginPath(); ctx.arc(x, y, 130 + Math.sin(E.t * 20) * 10, 0, 7); ctx.fill(); ctx.restore(); }
      ItemArt.card(ctx, x, y, s, id, c.r, flip, hidden);
      if (c.phase === 'reveal' && c.t >= 0.42) { wText(ctx, ITEMS[c.id].name, x, y + 112, 40, RARITY[c.r].col); wText(ctx, c.r.toUpperCase(), x, y - 108, 30, RARITY[c.r].col); }
    }
  },

  /* ---------------- HUD ---------------- */
  buildUI() {
    const root = E.root;
    root.innerHTML = `
      <div class="cw-vig"></div>
      <div class="cw-beacon b-hunted"><div class="cw-track"><div class="cw-rail"></div><div class="cw-me"></div><div class="cw-hm"></div></div><canvas width="200" height="200"></canvas><div class="bn-name">HELL HUNTER</div>
        <div class="bn-bar"><i class="lag"></i><i class="fill"></i></div><div class="bn-hp"></div><div class="bn-st"></div>
        <div class="bn-dl">◀ DISTANCE</div><div class="bn-dn">120<small>m</small></div><div class="bn-band">HUNTED</div><div class="bn-rate"></div><div class="bn-vis">OFF SCREEN</div></div>
      <div class="cw-tray hidden"><div class="tr-l">FIRE<br>BACK ◀</div>${[0, 1, 2].map((i) => `<button class="cw-slot empty"><canvas width="128" height="128"></canvas><span class="k">${'QWE'[i]}</span><span class="n"></span></button>`).join('')}</div>
      <button class="cw-mini cw-back">MENU</button><button class="cw-mini cw-labbtn">🧪 LAB</button>
      <div class="cw-hint">TAP ENEMIES TO STRIKE · 1 2 3 SKILLS · SPACE CHAOS · Q W E ITEMS · R RESTART</div>
      <div class="cw-intro">
        <div class="cw-ttl" data-t="HELL CHASE">HELL CHASE</div>
        <div class="cw-card"><div class="cw-step"><b>1</b><span><em>TAP ENEMIES</em> to strike. Skills <em>1 2 3</em>. Kill fast.</span></div>
        <div class="cw-step"><b>2</b><span>Kills drop <em>CHASE ITEMS</em> that fly <em>BACK</em> at the Hunter.</span></div>
        <div class="cw-step"><b>3</b><span>Watch <em>DISTANCE</em>. At 0m he has you. Kill him with items to win.</span></div></div>
        <div class="cw-seg-row"><label>CHASE ITEMS</label><div class="cw-seg" id="m2mode"></div></div>
        <button class="big b-gold cw-go"><i>🏃</i><b>RUN!</b></button>
      </div>`;
    const ui = this.ui = { root };
    ui.intro = $('.cw-intro', root); ui.beacon = $('.cw-beacon', root); ui.bnFill = $('.bn-bar .fill', root); ui.bnLag = $('.bn-bar .lag', root);
    ui.bnHp = $('.bn-hp', root); ui.bnSt = $('.bn-st', root); ui.bnDn = $('.bn-dn', root); ui.bnBand = $('.bn-band', root); ui.bnRate = $('.bn-rate', root); ui.bnVis = $('.bn-vis', root);
    ui.trackH = $('.cw-hm', root); ui.vig = $('.cw-vig', root); ui.tray = $('.cw-tray', root); ui.slots = $$('.cw-slot', root);
    const pc = $('.cw-beacon canvas', root).getContext('2d'); pc.translate(100, 150); E.L.gn(pc, 0, 0, 0.42, 0.5, { frame: false, cards: false, grin: 1 });
    ui.slots.forEach((s, i) => press(s, () => this.fireTray(i)));
    press($('.cw-go', root), () => { if (this.state === 'intro') this.startRun(); });
    press($('.cw-back', root), () => Main.toMenu());
    press($('.cw-labbtn', root), () => Main.lab());
    this.refreshModeUI();
  },
  refreshModeUI() {
    const seg = $('#m2mode'); if (!seg || !this.ui) return;
    seg.innerHTML = [['auto', 'AUTO-FIRE'], ['manual', 'MANUAL TRAY']].map(([v, l]) => `<button data-v="${v}" class="${S().m2.itemMode === v ? 'on' : ''}">${l}</button>`).join('');
    $$('button', seg).forEach((b) => press(b, () => { S().m2.itemMode = b.dataset.v; Save.save(); this.refreshModeUI(); }));
    this.ui.tray.classList.toggle('hidden', S().m2.itemMode !== 'manual');
    this.refreshTray();
  },
  refreshTray() {
    if (!this.ui || !this.tray) return;
    this.ui.slots.forEach((s, i) => {
      const it = this.tray[i], has = it && it !== 'pending';
      s.className = 'cw-slot' + (has ? ' r-' + it.r : ' empty');
      const c = $('canvas', s).getContext('2d'); c.clearRect(0, 0, 128, 128);
      if (has) { c.drawImage(ItemArt.icon(it.id), 0, 0); $('.n', s).textContent = ITEMS[it.id].name; }
    });
  },
  /** after the Battle Lab's own updateHud: re-purpose its header + controls for real-time play */
  postHud() {
    const st = E.S, hud = st.hud, sc = this.scrub; if (!sc || !hud) return;
    try {
      hud.dname.textContent = 'HELL CHASE'; hud.waveLabel.textContent = 'Wave ' + Math.max(1, this.wave);
      const alive = this.foes.filter((f) => f.alive), tot = this.foes.reduce((s, f) => s + f.maxHp, 0) || 1;
      hud.waveFill.style.width = clamp(alive.length ? 1 - alive.reduce((s, f) => s + f.hp, 0) / tot : 1, 0, 1) * 100 + '%';
      hud.coins.textContent = fmt(this.gold);
      hud.turnTag.textContent = this.state === 'play' ? 'TAP ENEMIES TO STRIKE!' : 'SCRUB';
      const skills = st.b.skillsOf(sc);
      for (let i = 0; i < 3; i++) {
        const btn = hud.skills[i]; if (!btn || !skills[i]) continue;
        const cd = this.cds[i];
        btn.el.classList.toggle('cooling', cd > 0); btn.el.classList.toggle('ready', cd <= 0 && this.state === 'play');
        btn.el.classList.remove('blocked', 'locked');
        btn.num.textContent = cd > 0 ? Math.ceil(cd) : '';
      }
      st.b.diss = this.ult;
      hud.dissPct.textContent = this.ult >= 100 ? 'READY' : Math.floor(this.ult) + '%';
      hud.controls.classList.remove('enemyphase', 'ai-turn');
    } catch (e) { /* HUD shape mismatch — non-fatal */ }
  },
  uiTick() {
    const ui = this.ui, H = this.hunter; if (!ui || !H) return;
    ui.bnFill.style.width = (H.hp / H.max * 100) + '%'; ui.bnLag.style.width = (H.lag / H.max * 100) + '%';
    ui.bnHp.textContent = fmt(H.hp) + ' / ' + fmt(H.max) + ' HP';
    const d = Math.max(0, H.dist);
    ui.bnDn.innerHTML = Math.ceil(d) + '<small>m</small>';
    const band = d >= 150 ? ['b-safe', 'SAFE-ISH', '#7aff8a'] : d >= 80 ? ['b-hunted', 'HUNTED', '#ffd54a'] : d >= 30 ? ['b-closing', 'CLOSING', '#ff9a3a'] : ['b-danger', 'DANGER', '#ff4a5a'];
    if (ui.lastBand !== band[0]) { ui.beacon.classList.remove('b-safe', 'b-hunted', 'b-closing', 'b-danger'); ui.beacon.classList.add(band[0]); ui.bnBand.textContent = band[1]; ui.bnBand.style.background = band[2]; ui.lastBand = band[0]; }
    ui.bnDn.style.color = band[2];
    ui.beacon.classList.toggle('mini', H.visible);
    ui.bnVis.textContent = H.visible ? "HE'S HERE!" : d < 80 ? 'CLOSING IN' : 'OFF SCREEN';
    const st = [];
    if (H.stun > 0) st.push(`<span style="color:#ffd54a">STUNNED ${H.stun.toFixed(1)}s</span>`);
    if (H.slow > 0) st.push(`<span style="color:#7ad8ff">SLOWED ${H.slow.toFixed(1)}s</span>`);
    if (H.burn > 0) st.push(`<span style="color:#ff9a3a">BURNING ${H.burn.toFixed(1)}s</span>`);
    ui.bnSt.innerHTML = st.length ? st.join(' · ') : 'CHARGING AT YOU';
    const r = H.rate; ui.bnRate.textContent = Math.abs(r) < 0.05 ? '■ HOLDING' : (r < 0 ? '▼ ' : '▲ ') + Math.abs(r).toFixed(1) + ' m/s'; ui.bnRate.style.color = r < 0 ? '#ff8a7a' : '#9aff8a';
    ui.trackH.style.left = (clamp(d / 200, 0, 1) * 100) + '%';
    const dz = clamp(1 - d / 60, 0, 1); ui.vig.style.opacity = dz.toFixed(2);
  },
  showResults() {
    const s = this.stats, win = this.state === 'slain';
    if (win) { const b = Save.data.best.m2; if (!b || this.time < b) { Save.data.best.m2 = this.time; Save.save(); } }
    Main.results(win ? 'HUNTER SLAIN!' : this.state === 'caught' ? 'CAUGHT!' : 'OVERWHELMED', win, [
      ['RUN TIME', fmtTime(this.time)], ['WAVES', this.wave], ['KILLS', this.kills], ['HUNTER HP LEFT', Math.round(this.hunter.hp / this.hunter.max * 100) + '%'],
      ['DAMAGE TO HUNTER', fmt(s.hunterDmg)], ['CLOSEST CALL', Math.max(0, Math.round(s.closest)) + 'm'], ['ITEMS C / R / E', `${s.items.common} / ${s.items.rare} / ${s.items.epic}`],
      ['CAUGHT UP · ESCAPES', s.appearances + ' · ' + s.escapes], ['QUICK CLEARS', s.quick], ['DAMAGE TAKEN', s.dmgTaken], ['ITEM MODE', S().m2.itemMode.toUpperCase()], ['LOST (TRAY FULL)', s.lostToFull],
    ], '', () => this.reset(true));
  },
};
const FX2 = { say(f, txt, col) { try { f.say(txt, col || '#fff', 1.2); } catch (e) { /* ignore */ } } };
