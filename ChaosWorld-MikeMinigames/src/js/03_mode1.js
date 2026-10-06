/* ==========================================================================
   MODE 1 — ROPE THE MONSTER
   FSM: intro → active ⇄ (pull → fall → stun → wake | pull → burn) → win/lose
   ========================================================================== */
const M1_TUNE = {
  bossHp: 18000,
  heroHp: 120,
  stunDur: 4.5,
  slipTime: 7.0,          // a single rope gets shaken off after this long
  zoneW: 0.24, perfW: 0.07, sweepSpeed: 1.55, // rope timing bar
  missCool: 0.9,
  pullGain: 9, pullDecay: 18, readyWin: 0.6,   // independent pull meters (0..100)
  atkMin: 3.0, atkMax: 4.4, aoeEvery: 3,       // boss attack cadence (seconds) / every Nth attack is AOE
  singleTele: 1.15, aoeTele: 1.8, singleDmg: 20, aoeDmg: 14,
  chipMult: 0.3, stunMult: 4, comboStep: 0.03,
  koTime: 10,
};
const M1_AI = {
  ai_ace: { label: 'AI · ACE', hit: 0.88, react: [0.3, 0.7], tps: 9.5, fumble: 0.0 },
  ai_ok: { label: 'AI · OKAY', hit: 0.68, react: [0.5, 1.4], tps: 7.5, fumble: 0.3 },
  ai_bad: { label: 'AI · SLOPPY', hit: 0.45, react: [0.8, 2.0], tps: 6.6, fumble: 0.3 },
};
const BX = 300, BY = 425, BS = 0.78;
const bw = (lx, ly) => [BX + lx * BS, BY + ly * BS];

const M1 = {
  name: 'm1',
  enter() {
    $('#menu').classList.add('hidden'); $('#m1ui').classList.remove('hidden');
    this.buildUI();
    this.reset(false);
  },
  exit() { $('#m1ui').classList.add('hidden'); $('#m1ui').innerHTML = ''; $('#results').classList.add('hidden'); },
  reset(skipIntro) {
    const set = S().m1;
    this.t = 0; this.time = 0; this.stateT = 0;
    this.bossMax = Math.round(M1_TUNE.bossHp * set.bossHp); this.bossHp = this.bossMax; this.bossLag = this.bossMax;
    this.enraged = false; this.atkCount = 0; this.atk = null; this.atkTimer = 2.4;
    this.ult = 0; this.combo = 0; this.comboBest = 0;
    this.takedowns = 0; this.ropesBurned = 0; this.shakeOffs = 0; this.totalDmg = 0;
    this.slip = 0; this.burnT = 0; this.burnMax = 1; this.lagShout = 0;
    this.projs = []; this.debris = []; this.cds = [0, 0];
    this.pose = this.basePose(); this.poseT = this.basePose();
    const H = M1_TUNE.heroHp;
    const mk = (id, name, role, kind, x, y, extra) => Object.assign({ id, name, role, kind, hx: x, hy: y, x, y, hp: H, max: H, ko: false, koT: 0, flash: 0, anim: null, animT: 0, stagger: 0, stats: { ropeHits: 0, ropeMiss: 0, pullTaps: 0, dmg: 0, taken: 0, perfect: 0 } }, extra || {});
    const rp = (side) => ({ side, rope: 'none', flyT: 0, flyHit: false, cool: 0, tpos: Math.random(), tdir: 1, zoneC: rand(0.3, 0.7), pull: 0, ready: 0, ai: null, fumble: 0, aiTap: 0, aiDelay: 0, perfectT: 0, missPt: null });
    this.heroes = [
      mk('scrub', 'SCRUB', 'ROPER 1', 'roper', 48, 468, rp('L')),
      mk('archer', 'ARCHER', 'ROPER 2', 'roper', 122, 520, rp('R')),
      mk('knight', 'KNIGHT', 'ATTACKER 1', 'atk', 198, 556, { atkT: 0.5, rate: 0.7, base: 10 }),
      mk('hexa', 'HEXA', 'ATTACKER 2', 'atk', 272, 584, { atkT: 0.9, rate: 1.0, base: 14 }),
    ];
    this.ropers = [this.heroes[0], this.heroes[1]];
    this.atkers = [this.heroes[2], this.heroes[3]];
    FX.reset(); Callout.clear();
    $('#results').classList.add('hidden');
    this.ui.uiCache = {};
    this.refreshPartnerUI();
    if (skipIntro) { this.setState('active'); Callout.show('FIGHT!', 'huge', 0.9); Audio.play('roar'); }
    else this.setState('intro');
  },
  isHuman(i) { return i === 0 || S().m1.partner === 'human'; },
  setState(s) {
    this.prev = this.state; this.state = s; this.stateT = 0;
    const ui = this.ui;
    ui.intro.classList.toggle('hidden', s !== 'intro');
    if (s === 'active') { /* nothing */ }
    if (s === 'pull') {
      this.burnMax = S().m1.burn * rand(0.88, 1.12) * (this.enraged ? 0.85 : 1); this.burnT = this.burnMax;
      this.atk = null; this.clearTargets();
      for (const r of this.ropers) { r.pull = 0; r.ready = 0; r.aiDelay = rand(0.25, 0.8) * (r.ai ? 1 : 0); }
      Callout.show('BOTH ROPES SET!<small>PULL! PULL! PULL!</small>', 'mag slab', 1.3);
      Audio.play('ropeLock'); Audio.play('charge'); FX.shake(6);
    }
    if (s === 'fall') {
      this.takedowns++;
      FX.slowmo(0.55, 0.3); Audio.play('success');
      Callout.show('TAKEDOWN!', 'huge teal', 1.1);
      this.addUlt(30);
      for (const r of this.ropers) r.pull = 0;
    }
    if (s === 'stun') {
      this.combo = 0;
      for (const h of this.heroes) if (h.ko) { h.ko = false; h.hp = Math.round(h.max * 0.4); FX.text(h.x, h.y - 90, 'BACK UP!', { color: '#4fe03a', size: 20 }); Audio.play('revive'); }
      for (const h of this.heroes) if (!h.ko) h.hp = Math.min(h.max, h.hp + 15);
      Callout.show('STUNNED!<small>SMASH IT! ×4 DAMAGE</small>', 'slab', 1.2);
      Audio.play('dizzy');
    }
    if (s === 'wake') { Callout.show('WAKE UP!', 'red huge', 1.0); Audio.play('roar'); FX.shake(8); this.comboBest = Math.max(this.comboBest, this.combo); }
    if (s === 'burn') {
      this.ropesBurned++;
      Callout.show('WHOOSH!<small>ROPES BURNED!</small>', 'red slab', 1.3);
      Audio.play('burn'); Audio.play('fail'); FX.shake(10); FX.doFlash(0.35, '#ff6a13');
      this.burnRopes(10, 1.2);
    }
    if (s === 'win') { Audio.play('win'); Callout.show('MONSTER<br>DOWN!', 'huge', 2.2); FX.slowmo(1.2, 0.35); FX.shake(18); }
    if (s === 'lose') { Audio.play('fail'); Callout.show('TEAM<br>ROASTED', 'red huge', 2.2); }
  },
  basePose() { return { lift: 0, rot: 0, jaw: 0.15, legLx: 0, legLy: 0, legRx: 0, legRy: 0, squash: 1, eyes: 'angry', tongue: 0, heat: 0, headX: 0, headY: 0, headRot: 0, flash: 0, shadowS: 1 }; },

  /* ---------------- INPUT ---------------- */
  onKey(k, e) {
    if (this.state === 'intro') { if (k === ' ' || k === 'Enter') this.startFight(); return; }
    if (k === 'a') { if (!e.repeat) this.roperAction(0); this.pressFx(0); }
    if (k === 'l') { if (!e.repeat && this.isHuman(1)) { this.roperAction(1); this.pressFx(1); } }
    if (k === '1') this.ability(0);
    if (k === '2') this.ability(1);
    if (k === '3' || k === ' ') this.ability(2);
    if (k === 'r') this.reset(true);
    if (k === 'Escape') Main.toMenu();
  },
  pressFx(i) { const b = this.ui.rb[i]; if (b) { b.classList.remove('shk'); void b.offsetWidth; b.classList.add('shk'); } },
  startFight() { if (this.state !== 'intro') return; this.setState('active'); Callout.show('FIGHT!', 'huge', 0.9); Audio.play('roar'); FX.shake(8); },
  canThrow(r) { return this.state === 'active' && r.rope === 'none' && r.cool <= 0 && !r.ko && r.stagger <= 0; },
  roperAction(i) {
    const r = this.ropers[i];
    if (this.state === 'pull' && r.rope === 'locked' && !r.ko) return this.pullTap(r);
    if (this.canThrow(r)) return this.throwRope(r);
  },
  throwRope(r) {
    const half = M1_TUNE.zoneW / 2, d = Math.abs(r.tpos - r.zoneC);
    const hit = d <= half, perfect = d <= M1_TUNE.perfW / 2;
    r.rope = 'flying'; r.flyT = 0; r.flyHit = hit; r.perfect = perfect;
    r.anim = 'throw'; r.animT = 0.35;
    const [ax, ay] = this.ankleWorld(r.side);
    r.missPt = hit ? null : [lerp(r.x + 14, ax, rand(0.55, 0.8)) + rand(-30, 30), ay + rand(20, 60)];
    Audio.play('ropeThrow');
  },
  ropeLanded(r) {
    if (r.flyHit && this.state === 'active') {
      r.rope = 'locked'; r.stats.ropeHits++;
      const [ax, ay] = this.ankleWorld(r.side);
      FX.burst(ax, ay, 14, { color: ['#ffd21f', '#fff', '#d9a35a'], spMax: 220 });
      FX.ring(ax, ay, { r1: 60, color: '#ffd21f' });
      FX.text(ax, ay - 40, r.perfect ? 'PERFECT LOCK!' : 'ROPE LOCKED!', { color: r.perfect ? '#ffd21f' : '#fff', size: r.perfect ? 26 : 22 });
      if (r.perfect) r.stats.perfect++;
      this.addUlt(r.perfect ? 15 : 10);
      Audio.play('ropeLock'); FX.shake(3); FX.stop(0.04);
      const other = this.ropers[r === this.ropers[0] ? 1 : 0];
      if (other.rope === 'locked') { this.slip = 0; this.setState('pull'); }
      else { this.slip = M1_TUNE.slipTime; FX.text(other.x + 10, other.y - 100, 'YOUR TURN!', { color: '#ff2e88', size: 20 }); }
    } else {
      r.rope = 'none'; r.stats.ropeMiss++; r.cool = M1_TUNE.missCool;
      r.zoneC = rand(0.25, 0.75);
      const p = r.missPt || [r.x + 80, r.y - 40];
      this.debris.push({ x1: r.x + 14, y1: r.y - 48, x2: p[0], y2: p[1], t: 0, life: 0.6, burn: false });
      FX.text(p[0], p[1] - 20, pick(['WHIFF!', 'MISSED!', 'NOPE!', 'AIR BALL!']), { color: '#aaa', size: 22 });
      Audio.play('ropeMiss');
    }
  },
  pullTap(r) {
    if (r.ready > 0 && r.pull >= 100) { r.pull = 100; }
    r.pull = Math.min(100, r.pull + M1_TUNE.pullGain / S().m1.pullDiff);
    r.stats.pullTaps++;
    Audio.play(r.side === 'L' ? 'pullL' : 'pullR');
    if (Math.random() < 0.3) Audio.play('strain');
    const [ax, ay] = this.ankleWorld(r.side);
    FX.burst(lerp(r.x, ax, 0.5), lerp(r.y - 48, ay, 0.5), 2, { color: '#d9a35a', spMax: 90, sMax: 4, lifeMax: 0.3 });
  },
  ability(i) {
    if (this.state === 'intro' || this.state === 'win' || this.state === 'lose') return;
    const btn = this.ui.ab[i];
    if (i < 2) {
      const a = this.atkers[i];
      if (this.cds[i] > 0 || a.ko) return;
      this.cds[i] = i === 0 ? 4.0 : 7.0;
      a.anim = 'attack'; a.animT = 0.4;
      if (i === 0) {
        Audio.play('slash');
        const [tx, ty] = this.hitPoint();
        this.projs.push({ kind: 'wave', x: a.x + 20, y: a.y - 50, tx, ty, t: 0, dur: 0.22, onHit: () => this.dealDamage(a, 70, tx, ty, true) });
      } else {
        Audio.play('meteor');
        const [tx, ty] = this.hitPoint();
        this.projs.push({ kind: 'meteor', x: tx + 160, y: -40, tx, ty, t: 0, dur: 0.5, onHit: () => { this.dealDamage(a, 120, tx, ty, true); FX.fire(tx, ty, 30, { spMax: 260, grav: -100 }); FX.shake(8); Audio.play('bomb'); } });
      }
    } else {
      if (this.ult < 100) { FX.text(225, 560, 'BURST NOT CHARGED', { color: '#aaa', size: 16 }); return; }
      this.ult = 0;
      Audio.play('burst'); FX.doFlash(0.5, '#ff2e88'); FX.shake(12);
      Callout.show('CHAOS<br>BURST!', 'mag huge', 1.0);
      for (const h of this.heroes) if (!h.ko) { h.anim = h.kind === 'atk' ? 'attack' : 'cheer'; h.animT = 0.6; }
      const [tx, ty] = this.hitPoint();
      this.projs.push({ kind: 'burst', x: 160, y: 520, tx, ty, t: 0, dur: 0.35, onHit: () => {
        this.dealDamage(this.atkers[0], 130, tx, ty, true); this.dealDamage(this.atkers[1], 130, tx + 20, ty - 20, true);
        FX.burst(tx, ty, 50, { color: ['#ff2e88', '#ffd21f', '#fff', '#7a2cff'], spMax: 420, sMax: 9 }); FX.ring(tx, ty, { r1: 200, color: '#ff2e88', w: 14, life: 0.5 }); FX.stop(0.1);
      } });
    }
    if (btn) { btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit'); }
  },
  addUlt(n) { this.ult = Math.min(100, this.ult + n); },
  hitPoint() {
    if (this.state === 'stun' || this.state === 'fall') { const [hx, hy] = this.headWorld(); return [hx + rand(-20, 20), hy + rand(-10, 20)]; }
    return bw(-10 + rand(-30, 30), -130 + rand(-20, 20));
  },
  dealDamage(src, base, x, y, big) {
    if (this.state === 'win' || this.state === 'lose') return;
    const stunned = this.state === 'stun' || this.state === 'fall';
    let mult = stunned ? M1_TUNE.stunMult * (1 + this.combo * M1_TUNE.comboStep) : M1_TUNE.chipMult;
    const dmg = Math.max(1, Math.round(base * mult * rand(0.9, 1.1)));
    this.bossHp = Math.max(0, this.bossHp - dmg); this.totalDmg += dmg; src.stats.dmg += dmg;
    this.addUlt(dmg / 60);
    this.pose.flash = 0.6;
    if (stunned) {
      this.combo++;
      if (this.ui.combo) { this.ui.combo.classList.remove('bump'); void this.ui.combo.offsetWidth; this.ui.combo.classList.add('bump'); }
      FX.text(x, y - 10, fmt(dmg), { color: big ? '#ffd21f' : '#fff', size: big ? 40 : 28, life: 1.0, vx: rand(-60, 60), vy: -140 });
      FX.burst(x, y, big ? 22 : 9, { color: ['#fff', '#ffd21f', '#ff6a13'], spMax: big ? 360 : 240 });
      if (big) { FX.stop(0.06); FX.shake(6); Audio.play('bigHit'); } else Audio.play('hit');
    } else {
      FX.text(x, y - 10, String(dmg), { color: '#9a9aa8', size: big ? 22 : 16, life: 0.6 });
      if (big) FX.text(x, y - 36, 'ARMORED!', { color: '#c8ccd6', size: 16, life: 0.7 });
      FX.burst(x, y, 4, { color: ['#c8ccd6', '#fff'], spMax: 140, sMax: 4 });
      Audio.play('hit');
    }
    if (!this.enraged && this.bossHp < this.bossMax * 0.35 && this.bossHp > 0) {
      this.enraged = true; Callout.show('ENRAGED!<small>FASTER ATTACKS · SHORTER BURN</small>', 'red', 1.4); Audio.play('roar');
    }
    if (this.bossHp <= 0) this.setState('win');
  },

  /* ---------------- UPDATE ---------------- */
  update(dt) {
    this.t += dt; this.stateT += dt;
    if (this.state !== 'intro' && this.state !== 'win' && this.state !== 'lose') this.time += dt;
    this.updateHeroes(dt);
    this.updateProjs(dt);
    const st = this.state;
    if (st === 'active') this.updateActive(dt);
    else if (st === 'pull') this.updatePull(dt);
    else if (st === 'burn') { if (this.stateT > 1.3) { this.setState('active'); this.atkTimer = 1.6; } }
    else if (st === 'fall') this.updateFall(dt);
    else if (st === 'stun') { if (this.stateT >= M1_TUNE.stunDur) this.setState('wake'); }
    else if (st === 'wake') this.updateWake(dt);
    else if (st === 'win' || st === 'lose') { if (this.stateT > 2.4 && !this.resultsShown) { this.resultsShown = true; this.showResults(); } }
    if (st !== 'win' && st !== 'lose') this.resultsShown = false;
    this.updatePose(dt);
    for (let i = 0; i < 2; i++) this.cds[i] = Math.max(0, this.cds[i] - dt);
    this.bossLag = this.bossLag > this.bossHp ? Math.max(this.bossHp, this.bossLag - this.bossMax * 0.25 * dt) : this.bossHp;
    for (let i = this.debris.length - 1; i >= 0; i--) { const d = this.debris[i]; d.t += dt; if (d.t > d.life) this.debris.splice(i, 1); }
    if (st !== 'win' && st !== 'lose' && st !== 'intro' && this.heroes.every((h) => h.ko)) this.setState('lose');
  },
  updateHeroes(dt) {
    for (const h of this.heroes) {
      h.flash = Math.max(0, h.flash - dt * 3);
      if (h.animT > 0) { h.animT -= dt; if (h.animT <= 0) h.anim = null; }
      h.stagger = Math.max(0, h.stagger - dt);
      if (h.ko) {
        h.koT -= dt;
        if (h.koT <= 0 && this.state !== 'win' && this.state !== 'lose') { h.ko = false; h.hp = Math.round(h.max * 0.4); FX.text(h.x, h.y - 90, 'BACK UP!', { color: '#4fe03a', size: 20 }); Audio.play('revive'); }
      }
      // movement toward target spot (attackers charge in during stun)
      let tx = h.hx, ty = h.hy;
      if (h.kind === 'atk' && (this.state === 'stun' || (this.state === 'fall' && this.stateT > 0.5)) && !h.ko) {
        const [hx, hy] = this.headWorld();
        tx = h === this.atkers[0] ? hx - 46 : hx + 30; ty = h === this.atkers[0] ? hy + 70 : hy + 96;
      }
      const sp = 900 * dt, dx = tx - h.x, dy = ty - h.y, d = Math.hypot(dx, dy);
      h.moving = d > 4;
      if (d > 1) { const k = Math.min(1, sp / d); h.x += dx * k; h.y += dy * k; }
    }
    // ropers
    for (let i = 0; i < 2; i++) {
      const r = this.ropers[i];
      r.cool = Math.max(0, r.cool - dt);
      if (this.state === 'active' && r.rope === 'none') {
        r.tpos += r.tdir * M1_TUNE.sweepSpeed * dt;
        if (r.tpos > 1) { r.tpos = 2 - r.tpos; r.tdir = -1; } else if (r.tpos < 0) { r.tpos = -r.tpos; r.tdir = 1; }
      }
      if (r.rope === 'flying') { r.flyT += dt; if (r.flyT >= 0.32) this.ropeLanded(r); }
      if (!this.isHuman(i)) this.updateAI(r, dt);
    }
    // attackers auto-attack
    for (const a of this.atkers) {
      if (a.ko || this.state === 'intro' || this.state === 'win' || this.state === 'lose' || this.state === 'burn') continue;
      if (a.moving) continue;
      const stun = this.state === 'stun';
      a.atkT -= dt * (stun ? 1.25 : 1);
      if (a.atkT <= 0) {
        a.atkT = a.rate * rand(0.9, 1.1);
        a.anim = 'attack'; a.animT = 0.3;
        const [tx, ty] = this.hitPoint();
        if (a.id === 'knight') {
          if (stun) { this.dealDamage(a, a.base, tx, ty, false); Audio.play('slash'); FX.burst(tx, ty, 6, { color: '#fff', type: 'spark', spMax: 300 }); }
          else this.projs.push({ kind: 'slash', x: a.x + 20, y: a.y - 50, tx, ty, t: 0, dur: 0.25, onHit: () => this.dealDamage(a, a.base, tx, ty, false) });
        } else {
          this.projs.push({ kind: 'bolt', x: a.x + 20, y: a.y - 80, tx, ty, t: 0, dur: stun ? 0.15 : 0.3, onHit: () => this.dealDamage(a, a.base, tx, ty, false) });
        }
      }
    }
  },
  updateAI(r, dt) {
    const q = M1_AI[S().m1.partner] || M1_AI.ai_ok;
    if (r.ko) return;
    if (this.canThrow(r)) {
      if (!r.ai) r.ai = { wait: rand(q.react[0], q.react[1]), succeed: Math.random() < q.hit };
      r.ai.wait -= dt;
      if (r.ai.wait <= 0) {
        const inZone = Math.abs(r.tpos - r.zoneC) <= M1_TUNE.zoneW / 2 - 0.02;
        if (r.ai.succeed ? inZone : !inZone) { r.ai = null; this.throwRope(r); }
        else if (r.ai.wait < -2.5) { r.ai = null; this.throwRope(r); }
      }
    } else if (this.state !== 'active' || r.rope !== 'none') r.ai = null;
    if (this.state === 'pull' && r.rope === 'locked') {
      if (r.aiDelay > 0) { r.aiDelay -= dt; return; }
      if (r.fumble > 0) { r.fumble -= dt; return; }
      if (Math.random() < q.fumble * dt) { r.fumble = rand(0.3, 0.6); FX.text(r.x, r.y - 100, pick(['OOPS!', 'MY HANDS!', 'SLIPPY!', 'UHH...']), { color: '#7ac8ff', size: 18 }); return; }
      r.aiTap -= dt;
      if (r.aiTap <= 0) { r.aiTap = 1 / (q.tps * rand(0.8, 1.2)); this.pullTap(r); }
    }
  },
  updateActive(dt) {
    // single-rope slip pressure
    const locked = this.ropers.filter((r) => r.rope === 'locked');
    if (locked.length === 1) {
      this.slip -= dt;
      if (this.slip <= 0) {
        const r = locked[0]; r.rope = 'none'; r.cool = 0.6; this.shakeOffs++;
        const [ax, ay] = this.ankleWorld(r.side);
        this.debris.push({ x1: r.x + 14, y1: r.y - 48, x2: ax, y2: ay, t: 0, life: 0.7, burn: false });
        FX.text(ax, ay - 40, 'SHOOK IT OFF!', { color: '#ff6a13', size: 24 }); Audio.play('ropeSnap'); FX.shake(5);
      }
    }
    // boss attack scheduler
    const freq = S().m1.atkFreq * (this.enraged ? 1.3 : 1);
    if (!this.atk) {
      this.atkTimer -= dt * freq;
      if (this.atkTimer <= 0) this.startAttack();
    } else {
      const a = this.atk; a.t += dt;
      if (a.t >= a.dur) this.resolveAttack();
    }
  },
  startAttack() {
    this.atkCount++;
    const alive = this.heroes.filter((h) => !h.ko);
    if (!alive.length) return;
    if (this.atkCount % M1_TUNE.aoeEvery === 0) {
      this.atk = { type: 'aoe', t: 0, dur: M1_TUNE.aoeTele };
      FX.text(160, 420, 'INCOMING!', { color: '#ff4a3a', size: 26, life: 1.2, vy: -20 });
      Audio.play('warn'); Audio.play('roar');
    } else {
      // prefer ropers that are throwing, so the boss creates roping tension
      const tgt = Math.random() < 0.55 ? pick(alive) : pick(alive.filter((h) => h.kind === 'roper').concat(alive));
      this.atk = { type: 'single', t: 0, dur: M1_TUNE.singleTele, target: tgt };
      Audio.play('warn');
    }
  },
  resolveAttack() {
    const a = this.atk; this.atk = null;
    this.atkTimer = rand(M1_TUNE.atkMin, M1_TUNE.atkMax);
    if (a.type === 'single') {
      const h = a.target; if (h.ko) return;
      const [mx, my] = this.mouthWorld();
      this.projs.push({ kind: 'fireball', x: mx, y: my, tx: h.x + 4, ty: h.y - 40, t: 0, dur: 0.22, onHit: () => {
        this.hurtHero(h, M1_TUNE.singleDmg); FX.fire(h.x, h.y - 40, 26, { spMax: 220, grav: -60 }); FX.ring(h.x, h.y - 30, { r1: 70, color: '#ff6a13' }); FX.shake(6); Audio.play('fire');
      } });
      Audio.play('fire');
    } else {
      this.poseT.lift = 12; FX.shake(14); FX.stop(0.08); Audio.play('stomp');
      for (const h of this.heroes) if (!h.ko) this.hurtHero(h, M1_TUNE.aoeDmg);
      FX.ring(170, 535, { r1: 260, color: '#ff6a13', w: 16, life: 0.5 });
      FX.dust(170, 540, 26, 220);
      const [lx, ly] = this.ankleWorld('L'); FX.dust(lx, ly, 10); const [rx, ry] = this.ankleWorld('R'); FX.dust(rx, ry, 10);
    }
  },
  hurtHero(h, dmg) {
    if (h.ko) return;
    h.hp = Math.max(0, h.hp - dmg); h.stats.taken += dmg; h.flash = 1; h.hurtFx = 0.3;
    FX.text(h.x, h.y - 96, '-' + dmg, { color: '#ff4a3a', size: 24 });
    Audio.play('hurt');
    if (h.hp <= 0) {
      h.ko = true; h.koT = M1_TUNE.koTime;
      FX.text(h.x, h.y - 110, 'KO!', { color: '#ff4a3a', size: 30 });
      if (h.kind === 'roper' && h.rope !== 'none') {
        if (this.state === 'pull') { this.setState('burn'); return; }
        const [ax, ay] = this.ankleWorld(h.side); this.debris.push({ x1: h.x + 14, y1: h.y - 48, x2: ax, y2: ay, t: 0, life: 0.7, burn: false }); h.rope = 'none';
      }
    }
  },
  updatePull(dt) {
    const [a, b] = this.ropers, d = S().m1.pullDiff;
    for (const r of this.ropers) {
      if (r.ko) { r.pull = Math.max(0, r.pull - 60 * dt); r.ready = 0; continue; }
      r.pull = Math.max(0, r.pull - M1_TUNE.pullDecay * d * dt);
      if (r.pull >= 99.5) r.ready = M1_TUNE.readyWin; else r.ready = Math.max(0, r.ready - dt);
    }
    // burn timer — accelerates if one side is ready and the other lags
    const lag = (a.ready > 0) !== (b.ready > 0) && Math.min(a.pull, b.pull) < 70;
    this.burnT -= dt * (lag ? 1.2 : 1);
    if (lag) {
      this.lagShout -= dt;
      if (this.lagShout <= 0) {
        this.lagShout = 1.1;
        const slow = a.ready > 0 ? b : a;
        FX.text(slow.x + 20, slow.y - 110, pick(['PULL YOUR SIDE!', 'COME ON!!', 'PUUULL!', 'HELLO?!']), { color: '#ff2e88', size: 22, life: 1.0 });
        FX.shake(3); Audio.play('strain');
      }
    }
    // fire charge VFX
    const heat = 1 - this.burnT / this.burnMax;
    if (Math.random() < heat * 0.8) { const [mx, my] = this.mouthWorld(); FX.fire(mx, my, 1 + Math.round(heat * 3), { spMax: 80 + heat * 100 }); }
    if (heat > 0.6 && Math.random() < 0.4) for (const r of this.ropers) { const [ax, ay] = this.ankleWorld(r.side); FX.fire(ax + rand(-10, 10), ay, 1, { spMax: 40, sMax: 8 }); }
    if (Math.floor(this.burnT * 4) !== Math.floor((this.burnT + dt) * 4) && this.burnT < 1.6) Audio.play('tick');
    if (a.ready > 0 && b.ready > 0) { this.setState('fall'); return; }
    if (this.burnT <= 0) this.setState('burn');
  },
  burnRopes(dmg, stag) {
    for (const r of this.ropers) {
      if (r.rope === 'none') continue;
      const [ax, ay] = this.ankleWorld(r.side);
      this.debris.push({ x1: r.x + 14, y1: r.y - 48, x2: ax, y2: ay, t: 0, life: 0.9, burn: true });
      for (let k = 0; k <= 8; k++) FX.fire(lerp(ax, r.x + 14, k / 8), lerp(ay, r.y - 48, k / 8), 3, { spMax: 90 });
      r.rope = 'none'; r.pull = 0; r.ready = 0;
      if (dmg) this.hurtHero(r, dmg);
      r.stagger = stag; r.anim = 'stagger'; r.animT = stag;
      r.zoneC = rand(0.25, 0.75);
    }
    const [mx, my] = this.mouthWorld();
    for (let k = 0; k < 4; k++) FX.fire(mx, my, 10, { angle: Math.PI * 0.8, spread: 0.8, spMin: 200, spMax: 420, grav: -40, sMax: 16, lifeMax: 0.6 });
    Audio.play('ropeSnap');
  },
  updateFall(dt) {
    if (this.stateT >= 0.45 && !this.crashed) {
      this.crashed = true;
      FX.shake(22); FX.stop(0.14); FX.doFlash(0.4); Audio.play('crash');
      const [hx, hy] = this.headWorld();
      FX.dust(hx, hy + 30, 40, 260); FX.dust(BX + 20, BY, 30, 300);
      FX.burst(hx, hy + 20, 26, { color: ['#7b5a48', '#3a1a14', '#ff6a13'], type: 'chunk', spMax: 380, up: 200, grav: 900, sMax: 10 });
      Callout.show('CRASH!', 'white huge', 0.8);
    }
    if (this.stateT >= 1.15) { this.crashed = false; this.setState('stun'); }
  },
  updateWake(dt) {
    if (this.stateT >= 0.45 && this.ropers.some((r) => r.rope !== 'none')) {
      FX.text(BX - 40, BY - 160, 'FIRE BREATH!', { color: '#ff6a13', size: 24 });
      Audio.play('fire'); FX.shake(8);
      this.burnRopes(6, 0.6);
    }
    if (this.stateT >= 1.3) { this.setState('active'); this.atkTimer = 2.0; }
  },

  /* ---------------- POSE / GEOMETRY ---------------- */
  updatePose(dt) {
    const P = this.pose, T = this.basePose(), t = this.t, st = this.state;
    T.lift = Math.sin(t * 2) * 3;
    if (st === 'active' || st === 'intro') {
      const rl = this.ropers[0].rope === 'locked', rr = this.ropers[1].rope === 'locked';
      if (!rl) T.legLx = Math.sin(t * 1.3) * 7; if (!rr) T.legRx = Math.sin(t * 1.3 + 2) * 7;
      if (rl || rr) { T.legLx += rl ? Math.sin(t * 30) * 1.5 : 0; T.legRx += rr ? Math.sin(t * 30) * 1.5 : 0; }
      if (this.atk) {
        const k = clamp(this.atk.t / this.atk.dur, 0, 1);
        if (this.atk.type === 'single') { T.jaw = 0.3 + k * 0.7; T.heat = k; T.headRot = -0.12 * k; T.headX = -10 * k; }
        else { T.lift = -46 * Ease.inOut(k); T.rot = 0.05 * k; T.jaw = 0.8; T.heat = 0.3; }
      }
    }
    if (st === 'pull') {
      const [a, b] = this.ropers, heat = 1 - this.burnT / this.burnMax;
      T.legLx = -a.pull * 0.38; T.legLy = a.pull * 0.12; T.legRx = -b.pull * 0.3; T.legRy = b.pull * 0.2;
      T.jaw = 0.4 + heat * 0.6; T.heat = heat; T.rot = Math.sin(t * 25) * 0.015 * (1 + heat); T.lift = -6 + Math.sin(t * 22) * 2;
      T.eyes = heat > 0.6 ? 'glow' : 'angry';
    }
    if (st === 'burn') { T.jaw = 1; T.heat = Math.max(0, 1 - this.stateT); T.lift = -10; }
    if (st === 'fall') {
      const k = Ease.outBounce(clamp(this.stateT / 0.55, 0, 1));
      T.lift = 70 * k; T.rot = -0.13 * k; T.headY = 62 * k; T.headRot = 0.25 * k; T.squash = 1 - 0.18 * k;
      T.legLx = -60 * k; T.legRx = 55 * k; T.legLy = 6 * k; T.jaw = 0.6; T.eyes = k > 0.6 ? 'dizzy' : 'angry'; T.tongue = k;
      Object.assign(P, T); P.flash = Math.max(0, (P.flash || 0) - dt * 3); return;
    }
    if (st === 'stun') {
      T.lift = 70 + Math.sin(t * 3) * 2; T.rot = -0.13; T.headY = 62; T.headRot = 0.25 + Math.sin(t * 4) * 0.05; T.squash = 0.82;
      T.legLx = -60; T.legRx = 55; T.legLy = 6; T.jaw = 0.55; T.eyes = 'dizzy'; T.tongue = 1 + Math.sin(t * 6) * 0.2; T.shadowS = 1.1;
    }
    if (st === 'wake') { const k = clamp(this.stateT / 0.5, 0, 1); T.lift = 70 * (1 - k) - 20 * Math.sin(k * Math.PI); T.headY = 62 * (1 - k); T.jaw = 1; T.heat = this.stateT > 0.3 ? 1 : 0.5; T.eyes = 'glow'; }
    if (st === 'win') { const k = clamp(this.stateT / 0.8, 0, 1); T.lift = 90 * Ease.outBounce(k); T.rot = -0.2 * k; T.headY = 70 * k; T.squash = 1 - 0.3 * k; T.eyes = 'dizzy'; T.tongue = 1.3; T.legLx = -70 * k; T.legRx = 70 * k; T.jaw = 0.7; }
    const r = Math.min(1, dt * 14);
    for (const key in T) { if (typeof T[key] === 'number') P[key] = lerp(P[key] == null ? T[key] : P[key], T[key], key === 'flash' ? 0 : r); else P[key] = T[key]; }
    P.flash = Math.max(0, (P.flash || 0) - dt * 3);
    P.ropedL = this.ropers[0].rope === 'locked'; P.ropedR = this.ropers[1].rope === 'locked';
  },
  ankleWorld(side) { const [x, y] = bossAnkle(side, this.pose); return bw(x, y); },
  headWorld() { const P = this.pose; return bw(-70 + (P.headX || 0), -150 + P.lift + (P.headY || 0)); },
  mouthWorld() { const [x, y] = this.headWorld(); return [x - 4, y + 26]; },
  clearTargets() { },

  /* ---------------- PROJECTILES ---------------- */
  updateProjs(dt) {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i]; p.t += dt;
      if (p.t >= p.dur) { this.projs.splice(i, 1); if (p.onHit) p.onHit(); }
    }
  },
  drawProj(ctx, p) {
    const k = clamp(p.t / p.dur, 0, 1);
    const x = lerp(p.x, p.tx, k), y = lerp(p.y, p.ty, k) - (p.kind === 'bolt' || p.kind === 'fireball' ? Math.sin(k * Math.PI) * 30 : 0);
    if (p.kind === 'fireball') { ctx.fillStyle = 'rgba(255,106,19,0.5)'; ctx.beginPath(); ctx.arc(x, y, 22, 0, 7); ctx.fill(); circ(ctx, x, y, 13, '#ffd21f', 3); FX.fire(x, y, 1, { spMax: 40 }); }
    else if (p.kind === 'bolt') { ctx.fillStyle = 'rgba(255,46,136,0.5)'; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill(); circ(ctx, x, y, 6, '#ffb0e0', 2.5); }
    else if (p.kind === 'slash' || p.kind === 'wave') {
      const s = p.kind === 'wave' ? 1.8 : 1; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(p.ty - p.y, p.tx - p.x)); ctx.scale(s, s);
      ctx.beginPath(); ctx.arc(0, 0, 18, -1.2, 1.2); ctx.arc(-6, 0, 14, 1.2, -1.2, true); ctx.closePath(); blob(ctx, p.kind === 'wave' ? '#7ac8ff' : '#fff', 3); ctx.restore();
    }
    else if (p.kind === 'meteor') { const mx = lerp(p.x, p.tx, k), my = lerp(p.y, p.ty, Ease.inCubic(k)); ctx.fillStyle = 'rgba(255,106,19,0.4)'; ctx.beginPath(); ctx.arc(mx, my, 34, 0, 7); ctx.fill(); circ(ctx, mx, my, 22, '#7a2cff', 4); circ(ctx, mx - 5, my - 5, 8, '#ff7ad0', 2); FX.fire(mx, my, 2, { color: ['#ff2e88', '#7a2cff', '#ffd21f'] }); }
    else if (p.kind === 'burst') { ctx.strokeStyle = '#ff2e88'; ctx.lineWidth = 26 * (1 - k) + 6; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x, y); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 8 * (1 - k) + 2; ctx.stroke(); }
  },

  /* ---------------- RENDER ---------------- */
  render(ctx) {
    const t = this.t;
    ctx.drawImage(arenaBackground(), 0, 0, W, H);
    // embers
    if (Math.random() < 0.3) FX.burst(rand(0, W), H - 200, 1, { color: ['#ff6a13', '#ffd21f'], type: 'fire', grav: -60, spMin: 10, spMax: 40, lifeMin: 1.5, lifeMax: 3, sMin: 2, sMax: 4 });
    // AOE telegraph zone
    if (this.atk && this.atk.type === 'aoe') {
      const k = this.atk.t / this.atk.dur;
      ctx.save(); ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 20);
      ctx.fillStyle = '#ff1a1a'; ctx.beginPath(); ctx.ellipse(170, 530, 200, 90, -0.35, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ff3a2a'; ctx.lineWidth = 4; ctx.setLineDash([12, 8]); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 0.6; ctx.fillStyle = '#ffd21f'; ctx.beginPath(); ctx.ellipse(170, 530, 200 * k, 90 * k, -0.35, 0, 7); ctx.fill();
      ctx.restore();
    }
    // single target marker
    if (this.atk && this.atk.type === 'single') {
      const h = this.atk.target, k = this.atk.t / this.atk.dur;
      ctx.save(); ctx.strokeStyle = '#ff2a2a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(h.x, h.y, 34, 13, 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.ellipse(h.x, h.y, 34 * k, 13 * k, 0, 0, 7); ctx.fill(); ctx.restore();
      outlinedText(ctx, '!', h.x, h.y - 120 + Math.sin(t * 20) * 3, 40, '#ff3a2a');
    }
    // boss
    tinted(ctx, this.pose.flash, '#fff', 90, 120, 360, 340, (c) => { c.save(); c.translate(BX, BY); c.scale(BS, BS); drawBoss(c, this.pose, t); c.restore(); });
    // dizzy stars
    if (this.state === 'stun' || (this.state === 'fall' && this.stateT > 0.5) || this.state === 'win') {
      const [hx, hy] = this.headWorld();
      for (let i = 0; i < 5; i++) { const a = t * 4 + (i / 5) * Math.PI * 2; drawStar(ctx, hx + Math.cos(a) * 50, hy - 54 + Math.sin(a) * 14, 9, a, i % 2 ? '#ffd21f' : '#fff'); }
    }
    // slip warning on single locked leg
    if (this.state === 'active' && this.slip > 0 && this.ropers.some((r) => r.rope === 'locked')) {
      const r = this.ropers.find((x) => x.rope === 'locked'); const [ax, ay] = this.ankleWorld(r.side);
      outlinedText(ctx, 'ROPE LOCKED', ax, ay + 32, 15, '#ffd21f');
      outlinedText(ctx, 'SLIPPING ' + this.slip.toFixed(1), ax, ay + 50, 14, this.slip < 2.5 ? '#ff4a3a' : '#fff');
    }
    // debris ropes
    for (const d of this.debris) {
      const k = d.t / d.life; ctx.globalAlpha = 1 - k;
      const mx = lerp(d.x1, d.x2, 0.5), my = lerp(d.y1, d.y2, 0.5) + 60 * k + 20;
      ctx.lineCap = 'round';
      ctx.strokeStyle = OL; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.quadraticCurveTo(mx, my, lerp(d.x1, d.x2, 0.45), lerp(d.y1, d.y2, 0.45) + 80 * k); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(d.x2, d.y2 + 30 * k); ctx.quadraticCurveTo(mx + 10, my + 10, lerp(d.x1, d.x2, 0.55), lerp(d.y1, d.y2, 0.55) + 90 * k); ctx.stroke();
      ctx.strokeStyle = d.burn ? '#ff6a13' : '#d9a35a'; ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.quadraticCurveTo(mx, my, lerp(d.x1, d.x2, 0.45), lerp(d.y1, d.y2, 0.45) + 80 * k); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // ropes
    for (const r of this.ropers) this.drawRope(ctx, r, t);
    // heroes sorted by y
    const hs = this.heroes.slice().sort((a, b) => a.y - b.y);
    for (const h of hs) this.drawHeroM1(ctx, h, t);
    for (const p of this.projs) this.drawProj(ctx, p);
    FX.drawParts(ctx);
    FX.drawFloats(ctx);
  },
  drawRope(ctx, r, t) {
    const hx = r.x + 14, hy = r.y - 48;
    if (r.rope === 'flying') {
      const k = clamp(r.flyT / 0.32, 0, 1);
      const [tx, ty] = r.flyHit ? this.ankleWorld(r.side) : r.missPt;
      const x = lerp(hx, tx, k), y = lerp(hy, ty, k) - Math.sin(k * Math.PI) * 70;
      ropeLine(ctx, hx, hy, x, y, 24, 0, 0, t);
      ctx.strokeStyle = OL; ctx.lineWidth = 8; ctx.beginPath(); ctx.ellipse(x, y, 20, 9, t * 10, 0, 7); ctx.stroke(); ctx.strokeStyle = '#d9a35a'; ctx.lineWidth = 4.5; ctx.stroke();
      return;
    }
    if (r.rope !== 'locked') return;
    const [ax, ay] = this.ankleWorld(r.side);
    let vib = 0, sag = 18, burn = 0;
    if (this.state === 'pull') { vib = 1.5 + r.pull * 0.05 + (r.ready > 0 ? 3 : 0); sag = 2; burn = 1 - this.burnT / this.burnMax; }
    else if (this.state === 'stun' || this.state === 'fall') sag = 30;
    else if (this.state === 'active') { sag = 10; vib = 0.6; }
    ropeLine(ctx, hx, hy, ax, ay - 2, sag, vib, burn, t);
  },
  drawHeroM1(ctx, h, t) {
    let pose = 'idle', p = 0, strain = 0, rope = false;
    if (h.ko) pose = 'ko';
    else if (h.anim === 'stagger' || h.stagger > 0) pose = 'stagger';
    else if (h.anim === 'throw') pose = 'throw';
    else if (h.anim === 'cheer') pose = 'cheer';
    else if (h.anim === 'attack') { pose = 'attack'; p = 1 - h.animT / 0.4; }
    else if (h.moving) pose = 'run';
    else if (h.kind === 'roper') { rope = true; if (h.rope === 'locked') { pose = 'brace'; strain = this.state === 'pull' ? h.pull / 100 : 0.1; } }
    tinted(ctx, h.flash, '#fff', h.x - 70, h.y - 140, 140, 160, (c) => drawHero(c, h.id, h.x, h.y, 0.95, { pose, p, t: t + h.hx, strain, rope }));
    if (this.state === 'pull' && h.kind === 'roper' && h.rope === 'locked') {
      if (h.ready > 0) outlinedText(ctx, 'MAX!', h.x, h.y - 112, 20, '#4fe03a');
    }
    if (h.ko) outlinedText(ctx, 'KO ' + Math.ceil(h.koT), h.x, h.y - 40, 15, '#ff4a3a');
  },

  /* ---------------- UI ---------------- */
  buildUI() {
    const root = $('#m1ui');
    const card = (h, i) => `<div class="hcard ${i < 2 ? 'r' : 'a'}" data-i="${i}"><div class="hcard-in"></div><img src="${heroPortrait(h)}" alt=""><div class="rl">${i < 2 ? 'ROPER ' + (i + 1) : 'ATTACKER ' + (i - 1)}</div><div class="hn">${HERO_DEF[h].name}</div><div class="bar"><i class="lag"></i><i class="main"></i></div><div class="stt"></div></div>`;
    root.innerHTML = `
      <div class="m1-boss"><img src="${bossPortrait(88)}" alt=""><div class="nm">MAGMAROTH</div><div class="st"></div><div class="bar"><i class="lag"></i><i class="main"></i><div class="hpn"></div></div></div>
      <button class="lab-btn" id="m1back" style="right:54px">MENU</button>
      <div class="team">${['scrub', 'archer', 'knight', 'hexa'].map(card).join('')}</div>
      <div class="m1-stats"></div>
      <div class="m1-burn hidden"><div class="lb">ROPE BURN IN</div><div class="tm">3.0</div></div>
      <div class="m1-pull hidden"><div class="prow"><span>ROPER 1</span><div class="bar"><i></i><b></b></div></div><div class="prow"><span>ROPER 2</span><div class="bar"><i></i><b></b></div></div></div>
      <div class="m1-stun hidden"><div class="lb">4.5</div><div class="tm">STUNNED · WEAK POINT ×4</div></div>
      <div class="m1-combo hidden"><div class="n">0</div><div class="l">HIT COMBO</div></div>
      <div class="m1-ctrl">
        <div class="roper L"><div class="lbl">SCRUB · <em>ROPER 1</em></div><div class="tbar"><div class="zone"></div><div class="perf"></div><div class="mark"></div></div>
          <button class="rbtn"><div class="face"></div><div class="fill"></div><div class="thr"></div><div class="txt">ROPE!</div><div class="sub"></div></button><span class="key" style="left:4px;top:56px">A</span></div>
        <div class="abil"><div class="alb">ATTACKERS</div>
          <button class="ab" data-a="0" style="left:2px;top:18px;--ac:#2d6bd8"><div class="face"></div><canvas class="ic" width="72" height="72"></canvas><div class="nm">SLAM</div><div class="cdn"></div><span class="key" style="left:2px;top:2px">1</span></button>
          <button class="ab" data-a="1" style="right:2px;top:18px;--ac:#7a2cff"><div class="face"></div><canvas class="ic" width="72" height="72"></canvas><div class="nm">METEOR</div><div class="cdn"></div><span class="key" style="left:2px;top:2px">2</span></button>
          <button class="ab wide" data-a="2" style="left:1px;top:96px;--ac:#5a1a3a"><div class="face"></div><div class="nm">CHAOS BURST</div><div class="meter"><i></i></div><span class="key" style="left:4px;top:2px">3 · SPC</span></button>
        </div>
        <div class="roper R"><div class="lbl">ARCHER · <em>ROPER 2</em></div><div class="tbar"><div class="zone"></div><div class="perf"></div><div class="mark"></div></div>
          <button class="rbtn"><div class="face"></div><div class="fill"></div><div class="thr"></div><div class="txt">ROPE!</div><div class="sub"></div></button><span class="key" style="right:4px;top:56px">L</span></div>
        <div class="m1-hints">ROPE: tap in the GREEN · PULL: mash · A / L ropers · 1 2 3 attackers · R restart</div>
      </div>
      <div class="intro">
        <div class="ttl">ROPE THE<br>MONSTER</div>
        <div class="steps panel"><div class="panel-in">
          <div class="step"><b>1</b><span>Both <em>ROPERS</em> tap when the marker is in the <em>GREEN</em> to lasso a front leg.</span></div>
          <div class="step"><b>2</b><span>Both legs roped → <em>PULL!</em> Mash. BOTH sides must max out together before the <em>ROPE BURN</em>.</span></div>
          <div class="step"><b>3</b><span>He crashes → <em>STUNNED</em>. Attackers hit ×4. Fire <em>SLAM · METEOR · BURST</em> now!</span></div>
        </div></div>
        <div class="lab-row" style="width:100%"><label>ROPER 2 PARTNER</label><div class="seg" id="m1partner"></div></div>
        <button class="btn btn-play" id="m1go">FIGHT!</button>
        <div class="lab-note">SOLO = you control both ropers (left & right thumbs, or A + L keys)</div>
      </div>`;
    const ui = this.ui = { root, uiCache: {} };
    ui.intro = $('.intro', root);
    ui.bossBar = $('.m1-boss .bar .main', root); ui.bossLag = $('.m1-boss .bar .lag', root); ui.bossHpn = $('.m1-boss .hpn', root); ui.bossSt = $('.m1-boss .st', root);
    ui.cards = $$('.hcard', root).map((c) => ({ c, bar: $('.bar .main', c), lag: $('.bar .lag', c), st: $('.stt', c) }));
    ui.burn = $('.m1-burn', root); ui.burnTm = $('.m1-burn .tm', root);
    ui.pull = $('.m1-pull', root); ui.pullBars = $$('.m1-pull .bar i', root);
    ui.stun = $('.m1-stun', root); ui.stunLb = $('.m1-stun .lb', root);
    ui.combo = $('.m1-combo', root); ui.comboN = $('.m1-combo .n', root);
    ui.stats = $('.m1-stats', root);
    ui.roper = $$('.roper', root).map((el) => ({ el, tbar: $('.tbar', el), zone: $('.zone', el), perf: $('.perf', el), mark: $('.mark', el), btn: $('.rbtn', el), fill: $('.fill', el), txt: $('.txt', el), sub: $('.sub', el), lbl: $('.lbl em', el) }));
    ui.rb = ui.roper.map((r) => r.btn);
    ui.ab = $$('.ab', root);
    ui.abCd = ui.ab.map((b) => $('.cdn', b));
    ui.ultMeter = $('.ab.wide .meter i', root);
    const ic0 = $('.ab[data-a="0"] .ic', root).getContext('2d'); ic0.translate(36, 70); drawHero(ic0, 'knight', 0, 0, 0.62, { pose: 'attack', p: 0.5 });
    const ic1 = $('.ab[data-a="1"] .ic', root).getContext('2d'); ic1.translate(36, 36); circ(ic1, 0, 0, 20, '#7a2cff', 4); circ(ic1, -6, -6, 7, '#ff7ad0', 2);
    ui.roper.forEach((r, i) => press(r.btn, () => this.roperAction(i)));
    ui.ab.forEach((b, i) => press(b, () => this.ability(i)));
    press($('#m1go', root), () => this.startFight());
    press($('#m1back', root), () => Main.toMenu());
    this.refreshPartnerUI();
  },
  refreshPartnerUI() {
    const seg = $('#m1partner'); if (!seg) return;
    const opts = [['human', 'SOLO'], ['ai_ace', 'AI ACE'], ['ai_ok', 'AI OK'], ['ai_bad', 'AI SLOPPY']];
    seg.innerHTML = opts.map(([v, l]) => `<button data-v="${v}" class="${S().m1.partner === v ? 'on' : ''}">${l}</button>`).join('');
    $$('button', seg).forEach((b) => press(b, () => { S().m1.partner = b.dataset.v; Save.save(); this.refreshPartnerUI(); }));
    if (this.ui && this.ui.roper) {
      const human = S().m1.partner === 'human';
      this.ui.roper[1].lbl.textContent = human ? 'ROPER 2' : (M1_AI[S().m1.partner] || M1_AI.ai_ok).label;
      this.ui.roper[1].btn.classList.toggle('ai', !human);
    }
  },
  uiTick() {
    if (!this.ui || !this.heroes) return;
    const ui = this.ui, st = this.state;
    ui.bossBar.style.width = (this.bossHp / this.bossMax * 100) + '%';
    ui.bossLag.style.width = (this.bossLag / this.bossMax * 100) + '%';
    ui.bossHpn.textContent = fmt(this.bossHp) + ' / ' + fmt(this.bossMax);
    const stLabel = { intro: 'READY', active: this.enraged ? 'ENRAGED' : 'DANGEROUS', pull: 'STRUGGLING', burn: 'FIRE!', fall: 'FALLING', stun: 'DIZZY', wake: 'WAKING', win: 'DEFEATED', lose: 'VICTORIOUS' }[st];
    ui.bossSt.textContent = stLabel + ' · ' + fmtTime(this.time);
    // hero cards
    this.heroes.forEach((h, i) => {
      const c = ui.cards[i];
      c.bar.style.width = (h.hp / h.max * 100) + '%'; c.lag.style.width = (h.hp / h.max * 100) + '%';
      c.bar.style.background = h.hp / h.max < 0.3 ? '#ff3a2a' : '';
      c.c.classList.toggle('ko', h.ko);
      c.c.classList.toggle('tgt', !!(this.atk && (this.atk.type === 'aoe' || this.atk.target === h)));
      if (h.hurtFx > 0) { h.hurtFx = 0; c.c.classList.remove('hurt'); void c.c.offsetWidth; c.c.classList.add('hurt'); }
      c.st.textContent = this.heroState(h);
    });
    // roper controls
    this.ropers.forEach((r, i) => {
      const R = ui.roper[i];
      const showBar = st === 'active' && r.rope === 'none';
      R.tbar.classList.toggle('off', !showBar || r.cool > 0 || r.stagger > 0);
      R.tbar.classList.toggle('locked', r.rope === 'locked');
      R.zone.style.left = ((r.zoneC - M1_TUNE.zoneW / 2) * 100) + '%'; R.zone.style.width = (M1_TUNE.zoneW * 100) + '%';
      R.perf.style.left = ((r.zoneC - M1_TUNE.perfW / 2) * 100) + '%'; R.perf.style.width = (M1_TUNE.perfW * 100) + '%';
      R.mark.style.left = (r.tpos * 100) + '%';
      let txt = 'ROPE!', sub = '', cls = '';
      if (r.ko) { txt = 'KO'; sub = 'BACK IN ' + Math.ceil(r.koT); cls = 'wait'; }
      else if (st === 'pull' && r.rope === 'locked') { txt = 'PULL!'; sub = r.ready > 0 ? 'MAXED! KEEP IT!' : Math.round(r.pull) + '%'; cls = 'pull'; }
      else if (r.rope === 'locked') { txt = 'LOCKED'; sub = st === 'active' ? 'WAIT FOR PARTNER' : 'HOLD ON'; cls = 'locked'; }
      else if (r.rope === 'flying') { txt = 'YEET!'; cls = 'wait'; }
      else if (r.stagger > 0) { txt = 'OUCH!'; sub = 'STAGGERED'; cls = 'wait'; }
      else if (r.cool > 0) { txt = 'MISSED'; sub = 'RE-COILING'; cls = 'wait'; }
      else if (st !== 'active') { txt = '...'; sub = st === 'stun' ? 'ATTACKERS GO!' : ''; cls = 'wait'; }
      else sub = 'TAP IN GREEN';
      R.txt.textContent = txt; R.sub.textContent = sub;
      R.btn.classList.toggle('pull', cls === 'pull'); R.btn.classList.toggle('locked', cls === 'locked'); R.btn.classList.toggle('wait', cls === 'wait');
      R.fill.style.height = st === 'pull' && r.rope === 'locked' ? (r.pull * 0.98) + '%' : '0';
      R.fill.classList.toggle('ready', r.ready > 0);
    });
    // pull + burn panels
    const pulling = st === 'pull';
    ui.burn.classList.toggle('hidden', !pulling); ui.pull.classList.toggle('hidden', !pulling);
    if (pulling) {
      ui.burnTm.textContent = Math.max(0, this.burnT).toFixed(1);
      ui.burn.classList.toggle('hot', this.burnT < 1.2);
      this.ropers.forEach((r, i) => { ui.pullBars[i].style.width = r.pull + '%'; ui.pullBars[i].classList.toggle('rdy', r.ready > 0); });
    }
    const stunned = st === 'stun';
    ui.stun.classList.toggle('hidden', !stunned);
    if (stunned) ui.stunLb.textContent = Math.max(0, M1_TUNE.stunDur - this.stateT).toFixed(1) + 's';
    ui.combo.classList.toggle('hidden', !(stunned && this.combo > 1));
    ui.comboN.textContent = this.combo;
    // abilities
    for (let i = 0; i < 2; i++) {
      const cd = this.cds[i], b = ui.ab[i];
      b.classList.toggle('cool', cd > 0 || this.atkers[i].ko);
      b.classList.toggle('boost', cd <= 0 && (st === 'stun' || st === 'fall'));
      ui.abCd[i].textContent = cd > 0 ? cd.toFixed(1) : '';
      b.style.background = cd > 0 ? `conic-gradient(#000 ${(1 - cd / (i ? 7 : 4)) * 360}deg, #444 0)` : '#000';
    }
    ui.ultMeter.style.width = this.ult + '%';
    ui.ab[2].classList.toggle('ready', this.ult >= 100);
    const ropeHits = this.ropers.reduce((s, r) => s + r.stats.ropeHits, 0), miss = this.ropers.reduce((s, r) => s + r.stats.ropeMiss, 0);
    ui.stats.classList.toggle('hidden', st === 'pull' || st === 'stun');
    ui.stats.innerHTML = `TAKEDOWNS ${this.takedowns} · BURNED ${this.ropesBurned}<br>ROPES ${ropeHits} HIT / ${miss} MISS`;
  },
  heroState(h) {
    if (h.ko) return 'KO · ' + Math.ceil(h.koT) + 's';
    const st = this.state;
    if (h.kind === 'roper') {
      if (h.stagger > 0) return 'STAGGERED';
      if (st === 'pull' && h.rope === 'locked') return h.ready > 0 ? 'MAX PULL!' : 'PULLING ' + Math.round(h.pull) + '%';
      if (h.rope === 'locked') return 'ROPE LOCKED';
      if (h.rope === 'flying') return 'THROWING';
      if (h.cool > 0) return 'MISSED!';
      if (st === 'active') return 'AIMING';
      return 'WAITING';
    }
    if (st === 'stun' || st === 'fall') return 'SMASHING!';
    if (this.atk && this.atk.target === h) return 'TARGETED!';
    return 'CHIPPING';
  },
  showResults() {
    const win = this.state === 'win';
    const H = this.heroes;
    const ropeMvp = this.ropers.slice().sort((a, b) => (b.stats.ropeHits * 2 - b.stats.ropeMiss) - (a.stats.ropeHits * 2 - a.stats.ropeMiss))[0];
    const pullMvp = this.ropers.slice().sort((a, b) => b.stats.pullTaps - a.stats.pullTaps)[0];
    const goblin = this.atkers.slice().sort((a, b) => b.stats.dmg - a.stats.dmg)[0];
    const fire = H.slice().sort((a, b) => b.stats.taken - a.stats.taken)[0];
    const award = (h) => [h === ropeMvp && h.stats.ropeHits > 0 ? 'ROPE MVP' : '', h === pullMvp && h !== ropeMvp && h.stats.pullTaps > 0 ? 'PULL MACHINE' : '', h === goblin && h.stats.dmg > 0 ? 'DAMAGE GOBLIN' : '', h === fire && h.stats.taken > 0 ? 'MOST ON FIRE' : ''].filter(Boolean).map((a) => `<span class="award">${a}</span>`).join('');
    const line = (h) => h.kind === 'roper'
      ? `ROPES <em>${h.stats.ropeHits}</em> hit / ${h.stats.ropeMiss} miss (${h.stats.perfect} perfect) · PULL <em>${h.stats.pullTaps}</em> taps · TOOK ${h.stats.taken}`
      : `DAMAGE <em>${fmt(h.stats.dmg)}</em> · TOOK ${h.stats.taken}`;
    if (win) { const b = Save.data.best.m1; if (!b || this.time < b) { Save.data.best.m1 = this.time; Save.save(); } }
    const r = $('#results');
    r.innerHTML = `<div class="res-title ${win ? '' : 'lose'}">${win ? 'MONSTER<br>DOWN!' : 'TEAM<br>ROASTED'}</div>
      <div class="panel"><div class="panel-in">
        <div class="res-grid">
          <div><span>CLEAR TIME</span><b>${win ? fmtTime(this.time) : '—'}</b></div>
          <div><span>TIME SURVIVED</span><b>${fmtTime(this.time)}</b></div>
          <div><span>TAKEDOWNS</span><b>${this.takedowns}</b></div>
          <div><span>ROPES BURNED</span><b>${this.ropesBurned}</b></div>
          <div><span>TOTAL DAMAGE</span><b>${fmt(this.totalDmg)}</b></div>
          <div><span>BEST COMBO</span><b>${Math.max(this.comboBest, this.combo)}</b></div>
          <div><span>BOSS HP LEFT</span><b>${Math.round(this.bossHp / this.bossMax * 100)}%</b></div>
          <div><span>SHAKE-OFFS</span><b>${this.shakeOffs}</b></div>
        </div>
        <div class="res-heroes">${H.map((h) => `<div class="res-hero"><img src="${heroPortrait(h.id)}" alt=""><div class="rh">${h.name} <small style="display:inline;color:#7ac8ff">${h.role}</small>${award(h)}<small>${line(h)}</small></div></div>`).join('')}</div>
      </div></div>
      <div class="lab-actions"><button class="btn btn-play" id="resRetry">RETRY</button><button class="btn btn-small btn-dark" id="resMenu">MENU</button></div>`;
    r.classList.remove('hidden');
    press($('#resRetry'), () => this.reset(true));
    press($('#resMenu'), () => Main.toMenu());
  },
};

function ropeLine(ctx, x1, y1, x2, y2, sag, vib, burn, t) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + sag;
  const ang = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(ang), ny = Math.cos(ang);
  const v = vib ? Math.sin(t * 55) * vib : 0;
  const cx = mx + nx * v, cy = my + ny * v;
  ctx.lineCap = 'round';
  if (burn > 0.05) { ctx.strokeStyle = 'rgba(255,106,19,' + (burn * 0.6) + ')'; ctx.lineWidth = 10 + burn * 12; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke(); }
  ctx.strokeStyle = OL; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke();
  ctx.strokeStyle = burn > 0.75 ? '#ff8a3a' : '#d9a35a'; ctx.lineWidth = 4.5; ctx.stroke();
  ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 4.5; ctx.setLineDash([3, 6]); ctx.lineDashOffset = -t * 20; ctx.stroke(); ctx.setLineDash([]);
}
