/* ==========================================================================
   MODE 1 — ROPE THE MONSTER (on the Battle Lab engine)
   FSM: intro → active ⇄ (pull → fall → stun → wake | pull → burn) → win/lose
   Boss = a Battle Lab boss rig scaled to giant size; ropes tie to its real feet.
   ========================================================================== */
const M1_TUNE = {
  bossHp: 18000, heroHp: 120, stunDur: 4.5, slipTime: 7.0,
  zoneW: 0.24, perfW: 0.07, sweepSpeed: 1.55, missCool: 0.9,
  pullGain: 9, pullDecay: 18, readyWin: 0.6, lagBurn: 1.2,
  atkMin: 3.0, atkMax: 4.4, aoeEvery: 3, singleTele: 1.15, aoeTele: 1.8, singleDmg: 20, aoeDmg: 14,
  chipMult: 0.3, stunMult: 4, comboStep: 0.03, koTime: 10,
};
const M1_AI = {
  ai_ace: { label: 'AI · ACE', hit: 0.88, react: [0.3, 0.7], tps: 9.5, fumble: 0.0 },
  ai_ok: { label: 'AI · OKAY', hit: 0.68, react: [0.5, 1.4], tps: 7.5, fumble: 0.3 },
  ai_bad: { label: 'AI · SLOPPY', hit: 0.45, react: [0.8, 2.0], tps: 6.6, fumble: 0.3 },
};
const M1_BOSSES = {
  spireWarden: { key: 'spireWarden', name: 'SPIRE WARDEN', scale: 2.2 },
  buffaloSkel: { key: 'buffaloSkel', name: 'BUFFALO SKEL', scale: 1.75 },
  lavaLord: { key: 'lavaLord', name: 'THE LAVA LORD', scale: 2.0 },
  neonLich: { key: 'neonLich', name: 'NEON LICH', scale: 2.1 },
};
const BOSS_POS = [850, 930];

const M1 = {
  name: 'm1',
  enter() { this.reset(false); },
  exit() { E.root.innerHTML = ''; $('#cw-results') && $('#cw-results').remove(); try { E.S.hud.header.classList.remove('boss'); E.S.hud.bossHdr.classList.add('hidden'); } catch (e) { /* ignore */ } },
  reset(skipIntro) {
    const set = S().m1, bd = M1_BOSSES[set.boss] || M1_BOSSES.spireWarden;
    E.takeover({ backdrop: 'ruins', lava: 1, ui: { header: true, controls: false, diss: false, items: false, turnq: false } });
    this.buildUI();
    const H = M1_TUNE.heroHp;
    const mk = (id, role, kind, x, y, extra) => {
      const f = E.hero(id, x, y, { hp: H, level: 3 });
      f._baseIdle = f.idlePose;
      return Object.assign(f, { role, kindR: kind, koT: 0, stagger: 0, animT: 0, st: { ropeHits: 0, ropeMiss: 0, pullTaps: 0, dmg: 0, taken: 0, perfect: 0 } }, extra || {});
    };
    const rp = (side) => ({ side, rope: 'none', flyT: 0, flyHit: false, cool: 0, tpos: Math.random(), tdir: 1, zoneC: rand(0.3, 0.7), pull: 0, ready: 0, ai: null, fumble: 0, aiTap: 0, aiDelay: 0, missPt: null });
    this.heroes = [
      mk('scrub', 'ROPER 1', 'roper', 95, 780, rp('L')),
      mk('ranger', 'ROPER 2', 'roper', 200, 930, rp('R')),
      mk('knight', 'ATTACKER 1', 'atk', 330, 1090, { atkT: 0.6, rate: 0.75, base: 10 }),
      mk('blackMage', 'ATTACKER 2', 'atk', 470, 1240, { atkT: 1.0, rate: 1.0, base: 14 }),
    ];
    this.ropers = this.heroes.slice(0, 2); this.atkers = this.heroes.slice(2);
    this.bossDef = bd;
    this.boss = E.enemy(bd.key, BOSS_POS[0], BOSS_POS[1], { scale: bd.scale, level: 9 });
    this.boss.name = bd.name; this.boss.data.noOverhead = true;
    this.bossIdle = this.boss.idlePose;
    this.t = 0; this.time = 0; this.stateT = 0;
    this.bossMax = Math.round(M1_TUNE.bossHp * set.bossHp); this.bossHp = this.bossMax; this.bossLag = this.bossMax;
    this.boss.maxHp = this.bossMax; this.boss.hp = this.bossMax;
    this.enraged = false; this.atkCount = 0; this.atk = null; this.atkTimer = 2.4;
    this.ult = 0; this.combo = 0; this.comboBest = 0; this.takedowns = 0; this.ropesBurned = 0; this.shakeOffs = 0; this.totalDmg = 0;
    this.slip = 0; this.burnT = 0; this.burnMax = 1; this.lagShout = 0; this.projs = []; this.debris = []; this.cds = [0, 0]; this.crashed = false; this.done = false;
    $('#cw-results') && $('#cw-results').remove();
    this.refreshPartnerUI();
    if (skipIntro) { this.setState('active'); E.banner('FIGHT!', 'ROPE BOTH LEGS', 'ready', 1.0); sfx('roar'); }
    else this.setState('intro');
  },
  isHuman(i) { return i === 0 || S().m1.partner === 'human'; },
  setState(s) {
    this.state = s; this.stateT = 0;
    this.ui.intro.classList.toggle('hidden', s !== 'intro');
    const boss = this.boss;
    if (s === 'pull') {
      this.burnMax = S().m1.burn * rand(0.88, 1.12) * (this.enraged ? 0.85 : 1); this.burnT = this.burnMax;
      this.atk = null; boss.cancelAct();
      for (const r of this.ropers) { r.pull = 0; r.ready = 0; r.aiDelay = rand(0.25, 0.8); }
      E.banner('BOTH ROPES SET!', 'PULL! PULL! PULL!', 'chaos', 1.3); Sfx.play('ropeLock'); Sfx.play('charge'); E.B.cam.shake(0.3);
    }
    if (s === 'fall') {
      this.takedowns++; this.addUlt(30);
      E.S.timeScale = (S().speed || 1) * 0.35; setTimeout(() => { E.S.timeScale = S().speed || 1; }, 550);
      E.banner('TAKEDOWN!', '', 'green', 1.0); sfx('combo');
      boss.downed = true; boss.facing = 1; boss.glow = 0;
      for (const r of this.ropers) r.pull = 0;
    }
    if (s === 'stun') {
      this.combo = 0;
      for (const h of this.heroes) if (h.downed) { h.downed = false; h.hp = Math.round(h.maxHp * 0.4); E.B.fx.number(h.x, h.cy - 120, 'BACK UP!', { size: 44, fill: '#9aff6a' }); sfx('revive'); }
      for (const h of this.heroes) if (!h.downed) h.hp = Math.min(h.maxHp, h.hp + 15);
      E.banner('STUNNED!', 'SMASH IT · ×4 DAMAGE', 'ready', 1.2); Sfx.play('dizzy');
    }
    if (s === 'wake') { boss.downed = false; boss.facing = -1; E.banner('WAKE UP!', '', 'red', 1.0); sfx('roar'); E.B.cam.shake(0.4); this.comboBest = Math.max(this.comboBest, this.combo); }
    if (s === 'burn') {
      this.ropesBurned++;
      E.banner('WHOOSH!', 'ROPES BURNED!', 'red', 1.3); Sfx.play('burn'); sfx('explosion'); E.B.cam.shake(0.5); E.flash('#ff6a13');
      this.burnRopes(10, 1.2);
    }
    if (s === 'win') { sfx('victory'); E.banner('MONSTER DOWN!', 'GG', 'green', 2.2); boss.downed = true; boss.facing = 1; E.B.cam.shake(0.8); E.S.timeScale = (S().speed || 1) * 0.4; setTimeout(() => { E.S.timeScale = S().speed || 1; }, 1200); }
    if (s === 'lose') { sfx('defeat'); E.banner('TEAM ROASTED', '', 'red', 2.2); }
  },

  /* ---------------- input ---------------- */
  onKey(k, e) {
    if (this.state === 'intro') { if (k === ' ' || k === 'Enter') { this.startFight(); return true; } return false; }
    if (k === 'a') { if (!e.repeat) { this.roperAction(0); this.pressFx(0); } return true; }
    if (k === 'l') { if (!e.repeat && this.isHuman(1)) { this.roperAction(1); this.pressFx(1); } return true; }
    if (k === '1') { this.ability(0); return true; }
    if (k === '2') { this.ability(1); return true; }
    if (k === '3' || k === ' ') { this.ability(2); return true; }
    if (k === 'r') { this.reset(true); return true; }
    return false;
  },
  onWorldTap() { return false; },
  pressFx(i) { const b = this.ui.rb[i]; if (b) { b.classList.remove('shk'); void b.offsetWidth; b.classList.add('shk'); } },
  startFight() { if (this.state !== 'intro') return; this.setState('active'); E.banner('FIGHT!', 'ROPE BOTH LEGS', 'ready', 1.0); sfx('roar'); E.B.cam.shake(0.3); },
  canThrow(r) { return this.state === 'active' && r.rope === 'none' && r.cool <= 0 && !r.downed && r.stagger <= 0; },
  roperAction(i) {
    const r = this.ropers[i];
    if (this.state === 'pull' && r.rope === 'locked' && !r.downed) return this.pullTap(r);
    if (this.canThrow(r)) return this.throwRope(r);
  },
  hand(f) { const s = f.depthScale; return [f.x + 34 * s * f.facing, f.y - f.height * 0.52]; },
  ankle(side) {
    const b = this.boss, s = b.depthScale, p = b.pose;
    const lx = side === 'L' ? p.lfx : p.lbx, ly = side === 'L' ? p.lfy : p.lby;
    return [b.x + b.knockX + lx * s * b.facing, b.y + ly * s - 26 * s];
  },
  throwRope(r) {
    const half = M1_TUNE.zoneW / 2, d = Math.abs(r.tpos - r.zoneC), hit = d <= half;
    r.rope = 'flying'; r.flyT = 0; r.flyHit = hit; r.perfect = d <= M1_TUNE.perfW / 2;
    const D = E.L.D, a = E.act(420).pose(120, 'throwAntic', D.outQuad).pose(220, 'throwRelease', D.outExpo).pose(420, r.idlePose, D.inOutQuad); a.tag = 'throw'; r.play(a);
    const [ax, ay] = this.ankle(r.side), [hx, hy] = this.hand(r);
    r.missPt = hit ? null : [lerp(hx, ax, rand(0.55, 0.8)) + rand(-60, 60), ay + rand(40, 120)];
    Sfx.play('ropeThrow'); sfx('throwWhoosh');
  },
  ropeLanded(r) {
    const B = E.B;
    if (r.flyHit && this.state === 'active') {
      r.rope = 'locked'; r.st.ropeHits++;
      const [ax, ay] = this.ankle(r.side);
      B.fx.burst(ax, ay, 16, { color: '#ffd54a', speed: 600, size: 12, life: 0.4 }); B.fx.ring(ax, ay, 20, 140, '#ffd54a', 0.35, 1, 10, true); B.fx.impactStar(ax, ay, 140, '#fff3c0', 10, 0.18);
      B.fx.number(ax, ay - 80, r.perfect ? 'PERFECT LOCK!' : 'ROPE LOCKED!', { size: r.perfect ? 58 : 48, fill: r.perfect ? '#ffd54a' : '#fff6d8', life: 1.0, vy: -80 });
      if (r.perfect) r.st.perfect++;
      this.addUlt(r.perfect ? 15 : 10); Sfx.play('ropeLock'); sfx('clank'); B.cam.shake(0.15); B.hitStopT = 0.04;
      r.idlePose = E.pose('throwAntic', { r: -0.32 });
      const other = this.ropers[r === this.ropers[0] ? 1 : 0];
      if (other.rope === 'locked') { this.slip = 0; this.setState('pull'); }
      else { this.slip = M1_TUNE.slipTime; try { other.say('MY TURN!', '#ff5ad8', 1.2); } catch (e) { /* ignore */ } }
    } else {
      r.rope = 'none'; r.st.ropeMiss++; r.cool = M1_TUNE.missCool; r.zoneC = rand(0.25, 0.75);
      const p = r.missPt || this.hand(r); const [hx, hy] = this.hand(r);
      this.debris.push({ x1: hx, y1: hy, x2: p[0], y2: p[1], t: 0, life: 0.6, burn: false });
      B.fx.number(p[0], p[1] - 40, pick(['WHIFF!', 'MISSED!', 'NOPE!', 'AIR BALL!']), { size: 46, fill: '#c8c0d8', life: 0.8 });
      B.fx.dust(p[0], p[1], 6, '#6a3a2a', 40); Sfx.play('ropeMiss');
    }
  },
  pullTap(r) {
    r.pull = Math.min(100, r.pull + M1_TUNE.pullGain / S().m1.pullDiff); r.st.pullTaps++;
    Sfx.play('pull'); if (Math.random() < 0.3) Sfx.play('strain');
    r.knockV -= 120;
    const [ax, ay] = this.ankle(r.side), [hx, hy] = this.hand(r);
    E.B.fx.burst(lerp(hx, ax, 0.5), lerp(hy, ay, 0.5), 2, { color: '#e8c08a', speed: 220, size: 7, life: 0.25 });
  },
  ability(i) {
    if (['intro', 'win', 'lose'].includes(this.state)) return;
    const B = E.B, D = E.L.D, boss = this.boss;
    if (i < 2) {
      const a = this.atkers[i]; if (this.cds[i] > 0 || a.downed) return;
      this.cds[i] = i === 0 ? 4.0 : 7.0;
      if (i === 0) { // KNIGHT SLAM
        const act = E.act(560).pose(140, 'heavyAntic', D.outQuad).pose(260, 'heavyHit', D.outExpo).pose(560, a.idlePose).at(260, () => {
          const [tx, ty] = this.hitPoint(); sfx('bigSwish');
          B.fx.slashArc(tx - 40, ty, 230, -2.4, 1.1, '#9ac8ff', 70, 0.34, 0.9, 0.1); B.fx.ring(tx, ty + 40, 20, 260, '#9ac8ff', 0.4, 1, 14, true);
          this.dealDamage(a, 70, tx, ty, true);
        }); act.tag = 'skill'; a.play(act);
      } else { // BLACK MAGE METEOR
        const act = E.act(700).pose(200, 'cast', D.outQuad).pose(700, a.idlePose).at(200, () => {
          sfx('cast'); const [tx, ty] = this.hitPoint();
          this.projs.push({ kind: 'meteor', x: tx + 380, y: ty - 900, tx, ty, t: 0, dur: 0.5, onHit: () => { this.dealDamage(a, 120, tx, ty, true); B.fx.burst(tx, ty, 30, { color: '#c070ff', speed: 900, size: 16, life: 0.6, type: 'glow' }); B.fx.ring(tx, ty, 20, 320, '#c070ff', 0.45, 1, 14, true); B.cam.shake(0.4); sfx('explosion'); } });
        }); act.tag = 'skill'; a.play(act);
      }
    } else {
      if (this.ult < 100) { E.toast('CHAOS BURST <small>NOT CHARGED YET</small>', 1.0); return; }
      this.ult = 0; sfx('diss'); E.flash('#ff5ad8'); B.cam.shake(0.6); E.banner('CHAOS BURST!', '', 'chaos', 1.0);
      for (const h of this.heroes) if (!h.downed) { const act = E.act(700).pose(200, 'victory', D.outBack).pose(700, h.idlePose); act.tag = 'skill'; h.play(act); }
      const [tx, ty] = this.hitPoint();
      B.fx.speedLines(tx, ty, 0.5);
      E.B.later(0.28, () => { if (this.state === 'win' || this.state === 'lose') return; this.dealDamage(this.atkers[0], 130, tx, ty, true); this.dealDamage(this.atkers[1], 130, tx + 30, ty - 40, true); B.fx.burst(tx, ty, 50, { color: '#ff5ad8', speed: 1200, size: 18, life: 0.7, type: 'glow' }); B.fx.ring(tx, ty, 30, 420, '#ff5ad8', 0.5, 1, 18, true); B.hitStopT = 0.12; sfx('explosion'); });
    }
    const btn = this.ui.ab[i]; if (btn) { btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit'); }
  },
  addUlt(n) { this.ult = Math.min(100, this.ult + n); },
  headPos() { const b = this.boss; return [b.x - b.height * 0.78, b.y - 50]; },
  hitPoint() {
    const b = this.boss;
    if (this.state === 'stun' || this.state === 'fall') { const [hx, hy] = this.headPos(); return [hx + rand(-50, 50), hy + rand(-40, 30)]; }
    return [b.x + rand(-60, 60), b.cy + rand(-60, 80)];
  },
  dealDamage(src, base, x, y, big) {
    if (this.state === 'win' || this.state === 'lose') return;
    const stunned = this.state === 'stun' || this.state === 'fall', B = E.B, boss = this.boss;
    const mult = stunned ? M1_TUNE.stunMult * (1 + this.combo * M1_TUNE.comboStep) : M1_TUNE.chipMult;
    const dmg = Math.max(1, Math.round(base * mult * rand(0.9, 1.1)));
    this.bossHp = Math.max(0, this.bossHp - dmg); boss.hp = this.bossHp; this.totalDmg += dmg; src.st.dmg += dmg; this.addUlt(dmg / 60);
    boss.flash = Math.max(boss.flash, stunned ? (big ? 1 : 0.5) : (big ? 0.4 : 0.15));
    if (stunned) {
      this.combo++;
      B.fx.number(x, y - 20, '-' + dmg, { size: big ? 92 : 64, fill: big ? '#ffcf3a' : '#fff6d8', crit: big, label: big ? 'WEAK POINT!' : undefined, life: 1.0 });
      B.fx.impactStar(x, y, big ? 220 : 130, '#ffcf5a', 12, 0.22); B.fx.burst(x, y, big ? 22 : 10, { color: '#ffcf5a', speed: 900, size: 12, life: 0.4 });
      if (big) { B.hitStopT = 0.06; B.cam.shake(0.3); sfx('crit'); } else sfx('hit');
      if (this.combo > 1 && this.combo % 5 === 0) { try { E.S.hud.combo(this.combo + ' HITS', 'COMBO'); } catch (e) { /* ignore */ } }
    } else {
      B.fx.number(x, y - 20, '-' + dmg, { size: big ? 50 : 38, fill: '#b8b0c8', label: big ? 'ARMORED!' : undefined, life: 0.6 });
      B.fx.burst(x, y, 4, { color: '#d8dce8', speed: 300, size: 6, life: 0.25 }); sfx('clank');
    }
    if (!this.enraged && this.bossHp < this.bossMax * 0.35 && this.bossHp > 0) { this.enraged = true; E.banner('ENRAGED!', 'FASTER ATTACKS · SHORTER BURN', 'red', 1.4); sfx('roar'); boss.data.tint = '#ff3a2a'; boss.data.tintA = 0.18; }
    if (this.bossHp <= 0) this.setState('win');
  },

  /* ---------------- update ---------------- */
  update(dt) {
    this.t += dt; this.stateT += dt;
    if (!['intro', 'win', 'lose'].includes(this.state)) this.time += dt;
    this.updateHeroes(dt); this.updateProjs(dt);
    const st = this.state;
    if (st === 'active') this.updateActive(dt);
    else if (st === 'pull') this.updatePull(dt);
    else if (st === 'burn') { if (this.stateT > 1.3) { this.setState('active'); this.atkTimer = 1.6; } }
    else if (st === 'fall') this.updateFall();
    else if (st === 'stun') { if (this.stateT >= M1_TUNE.stunDur) this.setState('wake'); }
    else if (st === 'wake') this.updateWake();
    else if ((st === 'win' || st === 'lose') && this.stateT > 2.6 && !this.done) { this.done = true; this.showResults(); }
    this.updateBoss(dt);
    for (let i = 0; i < 2; i++) this.cds[i] = Math.max(0, this.cds[i] - dt);
    this.bossLag = this.bossLag > this.bossHp ? Math.max(this.bossHp, this.bossLag - this.bossMax * 0.25 * dt) : this.bossHp;
    for (let i = this.debris.length - 1; i >= 0; i--) { const d = this.debris[i]; d.t += dt; if (d.t > d.life) this.debris.splice(i, 1); }
    if (!['win', 'lose', 'intro'].includes(st) && this.heroes.every((h) => h.downed)) this.setState('lose');
    this.uiTick();
  },
  updateHeroes(dt) {
    const st = this.state;
    for (const h of this.heroes) {
      h.stagger = Math.max(0, h.stagger - dt);
      if (h.downed) { h.koT -= dt; if (h.koT <= 0 && st !== 'win' && st !== 'lose') { h.downed = false; h.hp = Math.round(h.maxHp * 0.4); E.B.fx.number(h.x, h.cy - 120, 'BACK UP!', { size: 44, fill: '#9aff6a' }); sfx('revive'); } }
      // attackers charge in during the stun window
      let tx = h.hx0 != null ? h.hx0 : (h.hx0 = h.hx), ty = h.hy0 != null ? h.hy0 : (h.hy0 = h.hy);
      if (h.kindR === 'atk' && (st === 'stun' || (st === 'fall' && this.stateT > 0.5)) && !h.downed) { const [hx, hy] = this.headPos(); tx = h === this.atkers[0] ? hx + 40 : hx + 190; ty = h === this.atkers[0] ? hy + 150 : hy + 260; }
      h.hx = tx; h.hy = ty;
      if (!h.act && !h.running) h.facing = 1;
      if (!h.act && Math.hypot(h.x - tx, h.y - ty) > 8) { const d = Math.hypot(h.x - tx, h.y - ty); E.B.walk(h, tx, ty, clamp(d * 1.2, 180, 520)); }
    }
    for (let i = 0; i < 2; i++) {
      const r = this.ropers[i];
      r.cool = Math.max(0, r.cool - dt);
      if (st === 'active' && r.rope === 'none') { r.tpos += r.tdir * M1_TUNE.sweepSpeed * dt; if (r.tpos > 1) { r.tpos = 2 - r.tpos; r.tdir = -1; } else if (r.tpos < 0) { r.tpos = -r.tpos; r.tdir = 1; } }
      if (r.rope === 'flying') { r.flyT += dt; if (r.flyT >= 0.34) this.ropeLanded(r); }
      if (r.rope !== 'locked' && r.idlePose !== r._baseIdle) r.idlePose = r._baseIdle;
      if (r.rope === 'locked' && st === 'pull') r.knockX = -r.pull * 0.25 + Math.sin(this.t * 40) * r.pull * 0.04;
      if (!this.isHuman(i)) this.updateAI(r, dt);
    }
    // attackers: auto attacks (chip outside the stun, x4 inside it)
    const D = E.L.D;
    for (const a of this.atkers) {
      if (a.downed || ['intro', 'win', 'lose', 'burn'].includes(st) || a.running || (a.act && a.act.tag === 'walk')) continue;
      const stun = st === 'stun';
      a.atkT -= dt * (stun ? 1.25 : 1);
      if (a.atkT > 0 || a.act) continue;
      a.atkT = a.rate * rand(0.9, 1.1);
      if (a.data.hero === 'knight') {
        const act = E.act(380).pose(110, 'slashAntic', D.outQuad).pose(190, 'slashHit', D.outExpo).pose(380, a.idlePose).at(190, () => {
          const [tx, ty] = this.hitPoint();
          if (stun) { E.B.fx.slashArc(tx - 30, ty, 150, -2.4, 1.1, '#bfe8ff', 40, 0.25, 0.85, 0.1); this.dealDamage(a, a.base, tx, ty, false); sfx('swish', 0.7); }
          else this.projs.push({ kind: 'wave', x: a.x + 60, y: a.cy - 20, tx, ty, t: 0, dur: 0.28, onHit: () => this.dealDamage(a, a.base, tx, ty, false) });
        }); act.tag = 'skill'; a.play(act);
      } else {
        const act = E.act(420).pose(140, 'castLow', D.outQuad).pose(420, a.idlePose).at(140, () => {
          const [tx, ty] = this.hitPoint(); sfx('magic');
          this.projs.push({ kind: 'bolt', x: a.x + 40, y: a.cy - 60, tx, ty, t: 0, dur: stun ? 0.16 : 0.3, onHit: () => this.dealDamage(a, a.base, tx, ty, false) });
        }); act.tag = 'skill'; a.play(act);
      }
    }
  },
  updateAI(r, dt) {
    const q = M1_AI[S().m1.partner] || M1_AI.ai_ok; if (r.downed) return;
    if (this.canThrow(r)) {
      if (!r.ai) r.ai = { wait: rand(q.react[0], q.react[1]), succeed: Math.random() < q.hit };
      r.ai.wait -= dt;
      if (r.ai.wait <= 0) { const inZ = Math.abs(r.tpos - r.zoneC) <= M1_TUNE.zoneW / 2 - 0.02; if ((r.ai.succeed ? inZ : !inZ) || r.ai.wait < -2.5) { r.ai = null; this.throwRope(r); } }
    } else if (this.state !== 'active' || r.rope !== 'none') r.ai = null;
    if (this.state === 'pull' && r.rope === 'locked') {
      if (r.aiDelay > 0) { r.aiDelay -= dt; return; }
      if (r.fumble > 0) { r.fumble -= dt; return; }
      if (Math.random() < q.fumble * dt) { r.fumble = rand(0.3, 0.6); try { r.say(pick(['OOPS!', 'MY HANDS!', 'SLIPPY!', 'UHH...']), '#9ad8ff', 0.9); } catch (e) { /* ignore */ } return; }
      r.aiTap -= dt; if (r.aiTap <= 0) { r.aiTap = 1 / (q.tps * rand(0.8, 1.2)); this.pullTap(r); }
    }
  },
  updateActive(dt) {
    const locked = this.ropers.filter((r) => r.rope === 'locked');
    if (locked.length === 1) {
      this.slip -= dt;
      if (this.slip <= 0) {
        const r = locked[0]; r.rope = 'none'; r.cool = 0.6; this.shakeOffs++;
        const [ax, ay] = this.ankle(r.side), [hx, hy] = this.hand(r);
        this.debris.push({ x1: hx, y1: hy, x2: ax, y2: ay, t: 0, life: 0.7, burn: false });
        E.B.fx.number(ax, ay - 60, 'SHOOK IT OFF!', { size: 52, fill: '#ff9a3a', life: 1.0 }); Sfx.play('ropeSnap'); E.B.cam.shake(0.25);
        this.boss.knockV += 600;
      }
    }
    const freq = S().m1.atkFreq * (this.enraged ? 1.3 : 1);
    if (!this.atk) { this.atkTimer -= dt * freq; if (this.atkTimer <= 0) this.startAttack(); }
    else { this.atk.t += dt; if (this.atk.t >= this.atk.dur) this.resolveAttack(); }
  },
  startAttack() {
    this.atkCount++;
    const alive = this.heroes.filter((h) => !h.downed); if (!alive.length) return;
    const boss = this.boss, D = E.L.D;
    if (this.atkCount % M1_TUNE.aoeEvery === 0) {
      this.atk = { type: 'aoe', t: 0, dur: M1_TUNE.aoeTele };
      sfx('bossWarn'); E.toast('INCOMING STOMP!', 1.2);
      const a = E.act(M1_TUNE.aoeTele * 1000).pose(M1_TUNE.aoeTele * 900, 'heavyAntic', D.inOutQuad); a.tag = 'tele'; boss.play(a);
    } else {
      const tgt = Math.random() < 0.55 ? pick(alive) : pick(alive.filter((h) => h.kindR === 'roper').concat(alive));
      this.atk = { type: 'single', t: 0, dur: M1_TUNE.singleTele, target: tgt };
      sfx('enemyTelegraph');
      const a = E.act(M1_TUNE.singleTele * 1000).pose(M1_TUNE.singleTele * 800, 'castLow', D.inOutQuad); a.tag = 'tele'; boss.play(a);
      boss.glow = 1; boss.glowColor = '#ff8a2a';
    }
  },
  resolveAttack() {
    const a = this.atk; this.atk = null; this.atkTimer = rand(M1_TUNE.atkMin, M1_TUNE.atkMax);
    const boss = this.boss, B = E.B, D = E.L.D; boss.glow = 0;
    if (a.type === 'single') {
      const h = a.target; if (h.downed) return;
      const act = E.act(500).pose(120, 'cast', D.outExpo).pose(500, boss.idlePose); act.tag = 'atk'; boss.play(act);
      const mx = boss.x - 80, my = boss.y - boss.height * 0.8; sfx('magic');
      this.projs.push({ kind: 'fireball', x: mx, y: my, tx: h.x, ty: h.cy, t: 0, dur: 0.26, onHit: () => { this.hurtHero(h, M1_TUNE.singleDmg); B.fx.burst(h.x, h.cy, 24, { color: '#ff8a2a', speed: 700, size: 14, life: 0.5, type: 'glow' }); B.fx.ring(h.x, h.y, 20, 180, '#ff8a2a', 0.35, 1, 10, true); B.cam.shake(0.25); sfx('explosion'); } });
    } else {
      const act = E.act(600).pose(120, 'heavyHit', D.outExpo).pose(600, boss.idlePose); act.tag = 'atk'; boss.play(act);
      B.cam.shake(0.7); B.hitStopT = 0.08; sfx('explosion'); Sfx.play('crash');
      for (const h of this.heroes) if (!h.downed) this.hurtHero(h, M1_TUNE.aoeDmg);
      B.fx.ring(290, 1010, 40, 620, '#ff8a2a', 0.5, 1, 18, true); B.fx.dust(boss.x - 120, boss.y, 18, '#6a3a2a', 160);
      for (const h of this.heroes) B.fx.dust(h.x, h.y, 6, '#6a3a2a', 50);
    }
  },
  hurtHero(h, dmg) {
    if (h.downed) return;
    h.hp = Math.max(0, h.hp - dmg); h.st.taken += dmg;
    E.hit(h, dmg, { heavy: dmg > 15, dy: 100 }); sfx('hit');
    h.hurtFx = 1;
    if (h.hp <= 0) {
      h.downed = true; h.koT = M1_TUNE.koTime; sfx('down');
      E.B.fx.number(h.x, h.cy - 140, 'KO!', { size: 64, fill: '#ff4a5a', life: 1.0 });
      if (h.kindR === 'roper' && h.rope !== 'none') {
        if (this.state === 'pull') { this.setState('burn'); return; }
        const [ax, ay] = this.ankle(h.side), [hx, hy] = this.hand(h); this.debris.push({ x1: hx, y1: hy, x2: ax, y2: ay, t: 0, life: 0.7, burn: false }); h.rope = 'none';
      }
    }
  },
  updatePull(dt) {
    const [a, b] = this.ropers, d = S().m1.pullDiff, B = E.B, boss = this.boss;
    for (const r of this.ropers) {
      if (r.downed) { r.pull = Math.max(0, r.pull - 60 * dt); r.ready = 0; continue; }
      r.pull = Math.max(0, r.pull - M1_TUNE.pullDecay * d * dt);
      if (r.pull >= 99.5) r.ready = M1_TUNE.readyWin; else r.ready = Math.max(0, r.ready - dt);
    }
    const lag = (a.ready > 0) !== (b.ready > 0) && Math.min(a.pull, b.pull) < 70;
    this.burnT -= dt * (lag ? M1_TUNE.lagBurn : 1);
    if (lag) {
      this.lagShout -= dt;
      if (this.lagShout <= 0) { this.lagShout = 1.1; const slow = a.ready > 0 ? b : a; try { (slow === a ? b : a).say(pick(['PULL YOUR SIDE!', 'COME ON!!', 'PUUULL!', 'HELLO?!']), '#ff5ad8', 1.0); } catch (e) { /* ignore */ } B.cam.shake(0.1); Sfx.play('strain'); }
    }
    const heat = 1 - this.burnT / this.burnMax;
    boss.glow = heat; boss.glowColor = '#ff6a1a';
    boss.knockX = Math.sin(this.t * 30) * (6 + heat * 14);
    if (Math.random() < heat * 0.9) B.fx.burst(boss.x - 70, boss.y - boss.height * 0.78, 2, { color: '#ff8a2a', speed: 220 + heat * 200, size: 14, life: 0.5, type: 'glow', dir: Math.PI * 0.85, spread: 0.8 });
    if (heat > 0.55 && Math.random() < 0.5) for (const r of this.ropers) { const [ax, ay] = this.ankle(r.side); B.fx.burst(ax + rand(-20, 20), ay, 1, { color: '#ff9a3a', speed: 120, size: 12, life: 0.4, type: 'glow', up: 100 }); }
    if (this.burnT < 1.6 && Math.floor(this.burnT * 4) !== Math.floor((this.burnT + dt) * 4)) Sfx.play('tick');
    if (a.ready > 0 && b.ready > 0) { this.setState('fall'); return; }
    if (this.burnT <= 0) this.setState('burn');
  },
  burnRopes(dmg, stag) {
    const B = E.B, boss = this.boss;
    for (const r of this.ropers) {
      if (r.rope === 'none') continue;
      const [ax, ay] = this.ankle(r.side), [hx, hy] = this.hand(r);
      this.debris.push({ x1: hx, y1: hy, x2: ax, y2: ay, t: 0, life: 0.9, burn: true });
      for (let k = 0; k <= 8; k++) B.fx.burst(lerp(ax, hx, k / 8), lerp(ay, hy, k / 8), 3, { color: '#ff8a2a', speed: 260, size: 14, life: 0.5, type: 'glow', up: 120 });
      r.rope = 'none'; r.pull = 0; r.ready = 0; r.knockX = 0;
      if (dmg) this.hurtHero(r, dmg);
      r.stagger = stag; const D = E.L.D, act = E.act(stag * 1000).pose(150, 'hit', D.outExpo).pose(stag * 1000, 'idleSword'); act.tag = 'hurt'; if (!r.downed) r.play(act);
      r.zoneC = rand(0.25, 0.75);
    }
    boss.glow = 0; boss.knockX = 0;
    const act = E.act(700).pose(150, 'cast', E.L.D.outExpo).pose(700, boss.idlePose); act.tag = 'atk'; boss.play(act);
    B.fx.burst(boss.x - 80, boss.y - boss.height * 0.75, 40, { color: '#ff8a2a', speed: 1000, size: 20, life: 0.7, type: 'glow', dir: Math.PI * 0.8, spread: 0.7 });
    Sfx.play('ropeSnap');
  },
  updateFall() {
    if (this.stateT >= 0.45 && !this.crashed) {
      this.crashed = true; const B = E.B, b = this.boss;
      B.cam.shake(1); B.cam.punch(0.08); B.hitStopT = 0.16; E.flash('#ffffff'); Sfx.play('crash'); sfx('explosion');
      const [hx, hy] = this.headPos(); B.fx.dust(hx, b.y, 30, '#6a3a2a', 300); B.fx.dust(b.x - 150, b.y, 20, '#6a3a2a', 260); B.fx.ring(hx, b.y, 40, 460, '#ffd27a', 0.5, 1, 16, true);
      B.fx.burst(hx, b.y - 40, 26, { type: 'bone', color: '#e8dcc0', speed: 600, g: 1600, up: 500, life: 1.2, size: 16, add: false, floor: b.y + 10, drag: 0.98 });
      E.banner('CRASH!', 'HE\'S DOWN!', 'ready', 0.9);
    }
    if (this.stateT >= 1.15) { this.crashed = false; this.setState('stun'); }
  },
  updateWake() {
    if (this.stateT >= 0.45 && this.ropers.some((r) => r.rope !== 'none')) { E.B.fx.number(this.boss.x - 60, this.boss.y - 380, 'FIRE BREATH!', { size: 56, fill: '#ff9a3a', life: 1.0 }); sfx('explosion'); this.burnRopes(6, 0.6); }
    if (this.stateT >= 1.3) { this.setState('active'); this.atkTimer = 2.0; }
  },
  updateBoss(dt) {
    const boss = this.boss, st = this.state;
    if (st === 'pull') {
      const [a, b] = this.ropers;
      boss.idlePose = E.pose('heavyAntic', { lfx: 28 + a.pull * 0.28, lbx: -24 - b.pull * 0.22, r: Math.sin(this.t * 22) * 0.04 });
    } else if (st !== 'stun' && st !== 'fall' && st !== 'win') boss.idlePose = this.bossIdle;
    boss.hp = this.bossHp;
  },
  updateProjs(dt) { for (let i = this.projs.length - 1; i >= 0; i--) { const p = this.projs[i]; p.t += dt; if (p.t >= p.dur) { this.projs.splice(i, 1); if (p.onHit) p.onHit(); } } },

  /* ---------------- drawing (world space) ---------------- */
  drawGround(ctx) {
    const B = E.B;
    if (this.atk && this.atk.type === 'aoe') {
      const k = this.atk.t / this.atk.dur;
      ctx.save(); ctx.globalAlpha = 0.22 + 0.22 * Math.sin(E.t * 20); ctx.fillStyle = '#ff1a1a'; ctx.beginPath(); ctx.ellipse(290, 1010, 360, 310, -0.55, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.85; ctx.strokeStyle = '#ff3a2a'; ctx.lineWidth = 8; ctx.setLineDash([22, 14]); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 0.45; ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.ellipse(290, 1010, 360 * k, 310 * k, -0.55, 0, 7); ctx.fill(); ctx.restore();
    }
    if (this.atk && this.atk.type === 'single') B.drawTargetRing(ctx, this.atk.target, '#ff3a3a', true);
  },
  drawWorld(ctx) {
    const t = E.t;
    // snapped / burnt rope debris
    for (const d of this.debris) {
      const k = d.t / d.life; ctx.save(); ctx.globalAlpha = 1 - k;
      drawRope(ctx, d.x1, d.y1, lerp(d.x1, d.x2, 0.45), lerp(d.y1, d.y2, 0.45) + 160 * k, { sag: 40 + 60 * k, burn: d.burn ? 1 : 0 });
      drawRope(ctx, d.x2, d.y2, lerp(d.x1, d.x2, 0.55), lerp(d.y1, d.y2, 0.55) + 180 * k, { sag: 40 + 60 * k, burn: d.burn ? 1 : 0 });
      ctx.restore();
    }
    for (const r of this.ropers) {
      const [hx, hy] = this.hand(r);
      if (r.rope === 'flying') {
        const k = clamp(r.flyT / 0.34, 0, 1), [tx, ty] = r.flyHit ? this.ankle(r.side) : r.missPt;
        const x = lerp(hx, tx, k), y = lerp(hy, ty, k) - Math.sin(k * Math.PI) * 160;
        drawRope(ctx, hx, hy, x, y, { sag: 50 }); drawLasso(ctx, x, y, 44, t * 10);
      } else if (r.rope === 'locked') {
        const [ax, ay] = this.ankle(r.side);
        let o = { sag: 30, vib: 0.8 };
        if (this.state === 'pull') o = { sag: 4, vib: 2 + r.pull * 0.06 + (r.ready > 0 ? 4 : 0), burn: 1 - this.burnT / this.burnMax };
        else if (this.state === 'stun' || this.state === 'fall') o = { sag: 70 };
        drawRope(ctx, hx, hy, ax, ay, o); drawLasso(ctx, ax, ay, 34 * this.boss.depthScale / 2, 0);
      } else if (this.state === 'active' && !r.downed) {
        drawLasso(ctx, hx + Math.cos(t * 9) * 24, hy - 60 + Math.sin(t * 9) * 8, 30, t * 9);
      }
    }
    for (const p of this.projs) {
      const k = clamp(p.t / p.dur, 0, 1);
      if (p.kind === 'meteor') { const x = lerp(p.x, p.tx, k), y = lerp(p.y, p.ty, E.L.D.inCubic(k)); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(190,90,255,0.45)'; ctx.beginPath(); ctx.arc(x, y, 80, 0, 7); ctx.fill(); ctx.restore(); ctx.fillStyle = '#140818'; ctx.beginPath(); ctx.arc(x, y, 50, 0, 7); ctx.fill(); ctx.fillStyle = '#7a2cff'; ctx.beginPath(); ctx.arc(x - 4, y - 4, 42, 0, 7); ctx.fill(); ctx.fillStyle = '#e08aff'; ctx.beginPath(); ctx.arc(x - 14, y - 14, 14, 0, 7); ctx.fill(); continue; }
      const x = lerp(p.x, p.tx, k), y = lerp(p.y, p.ty, k) - (p.kind === 'fireball' || p.kind === 'bolt' ? Math.sin(k * Math.PI) * 60 : 0);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const col = p.kind === 'fireball' ? 'rgba(255,120,30,0.6)' : p.kind === 'bolt' ? 'rgba(200,100,255,0.6)' : 'rgba(150,210,255,0.6)';
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, p.kind === 'fireball' ? 44 : 26, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, p.kind === 'fireball' ? 18 : 10, 0, 7); ctx.fill(); ctx.restore();
    }
  },
  drawOverhead(ctx) {
    const b = this.boss, t = E.t;
    if (this.state === 'stun' || (this.state === 'fall' && this.stateT > 0.5) || this.state === 'win') {
      const [hx0, hy0] = this.headPos(), hx = hx0, hy = hy0 - 120;
      for (let i = 0; i < 5; i++) { const a = t * 4 + (i / 5) * Math.PI * 2; E.B.drawStar(ctx, hx + Math.cos(a) * 110, hy + Math.sin(a) * 30, 22, i % 2 ? '#ffd54a' : '#fff'); }
    }
    if (this.state === 'active' && this.slip > 0) {
      const r = this.ropers.find((x) => x.rope === 'locked');
      if (r) { const [ax, ay] = this.ankle(r.side); wText(ctx, 'ROPE LOCKED', ax, ay + 60, 36, '#ffd54a'); wText(ctx, 'SLIPPING ' + this.slip.toFixed(1), ax, ay + 100, 34, this.slip < 2.5 ? '#ff4a5a' : '#fff'); }
    }
    if (this.atk && this.atk.type === 'single') { const h = this.atk.target; wText(ctx, '!', h.x, h.y - h.height - 70 + Math.sin(t * 20) * 6, 110, '#ff3a3a'); }
    for (const h of this.heroes) if (h.downed) wText(ctx, 'KO ' + Math.ceil(h.koT), h.x, h.y - 40, 38, '#ff4a5a');
    if (this.state === 'pull') for (const r of this.ropers) if (r.ready > 0) wText(ctx, 'MAX!', r.x, r.y - r.height - 90, 52, '#9aff6a');
  },

  /* ---------------- HUD ---------------- */
  buildUI() {
    const root = E.root;
    const card = (id, i) => `<div class="cw-hc ${i < 2 ? 'r' : 'a'}"><img src="${E.portrait(id === 'scrub' ? 'scrub' : E.L.Dn[id].rig)}" alt=""><div class="hc-rl">${i < 2 ? 'ROPER ' + (i + 1) : 'ATTACKER ' + (i - 1)}</div><div class="hc-nm">${E.L.Dn[id].name}</div><div class="hc-bar"><i></i></div><div class="hc-st"></div></div>`;
    const roper = (i) => `<div class="cw-roper ${i ? 'R' : 'L'}"><div class="rp-lbl">${i ? 'RANGER' : 'SCRUB'} · <em>ROPER ${i + 1}</em></div><div class="rp-bar"><div class="zone"></div><div class="perf"></div><div class="mark"></div></div>
      <button class="rp-btn"><div class="rp-fill"></div><div class="rp-txt">ROPE!</div><div class="rp-sub"></div><span class="rp-key">${i ? 'L' : 'A'}</span></button></div>`;
    const sk = (i, id, nm, key) => `<button class="skill cw-ab" style="--sc:${E.L.B[id].color}88"><div class="skill-ring"></div><img class="skill-icon" src="${E.icon(id)}" alt=""><div class="cw-abn">${nm}</div><div class="cw-cd"></div><span class="cw-key">${key}</span></button>`;
    root.innerHTML = `
      <div class="cw-team">${['scrub', 'ranger', 'knight', 'blackMage'].map(card).join('')}</div>
      <button class="cw-mini cw-back">MENU</button><button class="cw-mini cw-labbtn">🧪 LAB</button>
      <div class="cw-stats"></div>
      <div class="cw-burn hidden"><div class="bl">ROPE BURN IN</div><div class="bt">3.0</div></div>
      <div class="cw-pull hidden"><div class="pr"><span>ROPER 1</span><div class="pb"><i></i><b></b></div></div><div class="pr"><span>ROPER 2</span><div class="pb"><i></i><b></b></div></div></div>
      <div class="cw-stun hidden"><div class="sn">4.5s</div><div class="ss">STUNNED · WEAK POINT ×4</div></div>
      <div class="cw-m1ctrl"><div class="controls-frame"></div>${roper(0)}<div class="cw-abil"><div class="ab-l">ATTACKERS</div>${sk(0, 'whirl', 'SLAM', '1')}${sk(1, 'voidnova', 'METEOR', '2')}
        <button class="cw-burst"><div class="bf"></div><b>CHAOS BURST</b><span>3 · SPACE</span></button></div>${roper(1)}</div>
      <div class="cw-hint">ROPE: TAP IN THE GREEN · PULL: MASH · A / L ROPERS · 1 2 3 ATTACKERS · R RESTART</div>
      <div class="cw-intro">
        <div class="cw-ttl" data-t="ROPE THE MONSTER">ROPE THE MONSTER</div>
        <div class="cw-card"><div class="cw-step"><b>1</b><span>Both <em>ROPERS</em> tap when the marker is in the <em>GREEN</em> to lasso a leg.</span></div>
        <div class="cw-step"><b>2</b><span>Both legs roped → <em>PULL!</em> Mash. BOTH sides must max out together before the <em>ROPE BURN</em>.</span></div>
        <div class="cw-step"><b>3</b><span>He crashes → <em>STUNNED</em>. Attackers hit ×4. Fire <em>SLAM · METEOR · BURST</em>!</span></div></div>
        <div class="cw-seg-row"><label>ROPER 2</label><div class="cw-seg" id="m1partner"></div></div>
        <button class="big b-gold cw-go"><i>🪢</i><b>FIGHT!</b></button>
        <div class="cw-note">SOLO = you work both ropers (left + right thumbs, or A + L)</div>
      </div>`;
    const ui = this.ui = { root };
    ui.intro = $('.cw-intro', root);
    ui.cards = $$('.cw-hc', root).map((c) => ({ c, bar: $('.hc-bar i', c), st: $('.hc-st', c) }));
    ui.burn = $('.cw-burn', root); ui.burnT = $('.cw-burn .bt', root); ui.pull = $('.cw-pull', root); ui.pullBars = $$('.cw-pull .pb i', root);
    ui.stun = $('.cw-stun', root); ui.stunN = $('.cw-stun .sn', root); ui.stats = $('.cw-stats', root);
    ui.roper = $$('.cw-roper', root).map((r) => ({ r, bar: $('.rp-bar', r), zone: $('.zone', r), perf: $('.perf', r), mark: $('.mark', r), btn: $('.rp-btn', r), fill: $('.rp-fill', r), txt: $('.rp-txt', r), sub: $('.rp-sub', r), lbl: $('.rp-lbl em', r) }));
    ui.rb = ui.roper.map((r) => r.btn);
    ui.ab = [...$$('.cw-ab', root), $('.cw-burst', root)]; ui.abCd = $$('.cw-cd', root); ui.burstFill = $('.cw-burst .bf', root);
    ui.roper.forEach((r, i) => press(r.btn, () => this.roperAction(i)));
    ui.ab.forEach((b, i) => press(b, () => this.ability(i)));
    press($('.cw-go', root), () => this.startFight());
    press($('.cw-back', root), () => Main.toMenu());
    press($('.cw-labbtn', root), () => Main.lab());
  },
  refreshPartnerUI() {
    const seg = $('#m1partner'); if (!seg || !this.ui) return;
    seg.innerHTML = [['human', 'SOLO'], ['ai_ace', 'AI ACE'], ['ai_ok', 'AI OK'], ['ai_bad', 'AI SLOPPY']].map(([v, l]) => `<button data-v="${v}" class="${S().m1.partner === v ? 'on' : ''}">${l}</button>`).join('');
    $$('button', seg).forEach((b) => press(b, () => { S().m1.partner = b.dataset.v; Save.save(); this.refreshPartnerUI(); }));
    const human = S().m1.partner === 'human';
    this.ui.roper[1].lbl.textContent = human ? 'ROPER 2' : (M1_AI[S().m1.partner] || M1_AI.ai_ok).label;
    this.ui.roper[1].btn.classList.toggle('ai', !human);
  },
  postHud() {
    const hud = E.S.hud; if (!hud || !this.boss) return;
    try {
      hud.header.classList.add('boss'); hud.bossHdr.classList.remove('hidden');
      const t = $('.boss-title', hud.bossHdr); if (t && t.textContent !== this.bossDef.name) { t.textContent = this.bossDef.name; const f = $('.boss-face', hud.bossHdr); if (f) f.src = E.portrait(this.boss.kind, 'hero'); }
      hud.bossFill.style.width = (this.bossHp / this.bossMax * 100) + '%'; hud.bossLag.style.width = (this.bossLag / this.bossMax * 100) + '%';
      const lbl = { intro: 'READY', active: this.enraged ? 'ENRAGED' : 'DANGEROUS', pull: 'STRUGGLING', burn: 'FIRE!', fall: 'FALLING', stun: 'DIZZY', wake: 'WAKING', win: 'DEFEATED', lose: 'VICTORIOUS' }[this.state];
      hud.bossRound.textContent = lbl + ' · ' + fmtTime(this.time);
    } catch (e) { /* ignore */ }
  },
  uiTick() {
    const ui = this.ui; if (!ui || !this.heroes) return; const st = this.state;
    this.heroes.forEach((h, i) => {
      const c = ui.cards[i]; c.bar.style.width = (h.hp / h.maxHp * 100) + '%'; c.bar.style.background = h.hp / h.maxHp < 0.3 ? '#ff4a5a' : '';
      c.c.classList.toggle('ko', !!h.downed); c.c.classList.toggle('tgt', !!(this.atk && (this.atk.type === 'aoe' || this.atk.target === h)));
      if (h.hurtFx) { h.hurtFx = 0; c.c.classList.remove('hurt'); void c.c.offsetWidth; c.c.classList.add('hurt'); }
      c.st.textContent = this.heroState(h);
    });
    this.ropers.forEach((r, i) => {
      const R = ui.roper[i], showBar = st === 'active' && r.rope === 'none';
      R.bar.classList.toggle('off', !showBar || r.cool > 0 || r.stagger > 0); R.bar.classList.toggle('locked', r.rope === 'locked');
      R.zone.style.left = ((r.zoneC - M1_TUNE.zoneW / 2) * 100) + '%'; R.zone.style.width = (M1_TUNE.zoneW * 100) + '%';
      R.perf.style.left = ((r.zoneC - M1_TUNE.perfW / 2) * 100) + '%'; R.perf.style.width = (M1_TUNE.perfW * 100) + '%'; R.mark.style.left = (r.tpos * 100) + '%';
      let txt = 'ROPE!', sub = 'TAP IN GREEN', cls = '';
      if (r.downed) { txt = 'KO'; sub = 'BACK IN ' + Math.ceil(r.koT); cls = 'wait'; }
      else if (st === 'pull' && r.rope === 'locked') { txt = 'PULL!'; sub = r.ready > 0 ? 'MAXED! KEEP IT!' : Math.round(r.pull) + '%'; cls = 'pull'; }
      else if (r.rope === 'locked') { txt = 'LOCKED'; sub = st === 'active' ? 'WAIT FOR PARTNER' : 'HOLD ON'; cls = 'locked'; }
      else if (r.rope === 'flying') { txt = 'YEET!'; sub = ''; cls = 'wait'; }
      else if (r.stagger > 0) { txt = 'OUCH!'; sub = 'STAGGERED'; cls = 'wait'; }
      else if (r.cool > 0) { txt = 'MISSED'; sub = 'RE-COILING'; cls = 'wait'; }
      else if (st !== 'active') { txt = '...'; sub = st === 'stun' ? 'ATTACKERS GO!' : ''; cls = 'wait'; }
      R.txt.textContent = txt; R.sub.textContent = sub;
      R.btn.classList.toggle('pull', cls === 'pull'); R.btn.classList.toggle('locked', cls === 'locked'); R.btn.classList.toggle('wait', cls === 'wait');
      R.fill.style.height = st === 'pull' && r.rope === 'locked' ? r.pull + '%' : '0'; R.fill.classList.toggle('ready', r.ready > 0);
    });
    const pulling = st === 'pull'; ui.burn.classList.toggle('hidden', !pulling); ui.pull.classList.toggle('hidden', !pulling);
    if (pulling) { ui.burnT.textContent = Math.max(0, this.burnT).toFixed(1); ui.burn.classList.toggle('hot', this.burnT < 1.2); this.ropers.forEach((r, i) => { ui.pullBars[i].style.width = r.pull + '%'; ui.pullBars[i].classList.toggle('rdy', r.ready > 0); }); }
    ui.stun.classList.toggle('hidden', st !== 'stun'); if (st === 'stun') ui.stunN.textContent = Math.max(0, M1_TUNE.stunDur - this.stateT).toFixed(1) + 's';
    for (let i = 0; i < 2; i++) { const cd = this.cds[i], b = ui.ab[i]; b.classList.toggle('cooling', cd > 0 || this.atkers[i].downed); b.classList.toggle('ready', cd <= 0 && (st === 'stun' || st === 'fall')); ui.abCd[i].textContent = cd > 0 ? Math.ceil(cd) : ''; }
    ui.burstFill.style.width = this.ult + '%'; ui.ab[2].classList.toggle('full', this.ult >= 100);
    const hits = this.ropers.reduce((s, r) => s + r.st.ropeHits, 0), miss = this.ropers.reduce((s, r) => s + r.st.ropeMiss, 0);
    ui.stats.classList.toggle('hidden', st === 'pull' || st === 'stun');
    ui.stats.innerHTML = `TAKEDOWNS <b>${this.takedowns}</b> · ROPES BURNED <b>${this.ropesBurned}</b> · ROPES <b>${hits}</b> HIT / <b>${miss}</b> MISS`;
  },
  heroState(h) {
    if (h.downed) return 'KO · ' + Math.ceil(h.koT) + 's';
    const st = this.state;
    if (h.kindR === 'roper') {
      if (h.stagger > 0) return 'STAGGERED';
      if (st === 'pull' && h.rope === 'locked') return h.ready > 0 ? 'MAX PULL!' : 'PULLING ' + Math.round(h.pull) + '%';
      if (h.rope === 'locked') return 'ROPE LOCKED'; if (h.rope === 'flying') return 'THROWING'; if (h.cool > 0) return 'MISSED!';
      return st === 'active' ? 'AIMING' : 'WAITING';
    }
    if (st === 'stun' || st === 'fall') return 'SMASHING!';
    if (this.atk && this.atk.target === h) return 'TARGETED!';
    return 'CHIPPING';
  },
  showResults() {
    const win = this.state === 'win', H = this.heroes;
    const ropeMvp = this.ropers.slice().sort((a, b) => (b.st.ropeHits * 2 - b.st.ropeMiss) - (a.st.ropeHits * 2 - a.st.ropeMiss))[0];
    const pullMvp = this.ropers.slice().sort((a, b) => b.st.pullTaps - a.st.pullTaps)[0];
    const goblin = this.atkers.slice().sort((a, b) => b.st.dmg - a.st.dmg)[0];
    const fire = H.slice().sort((a, b) => b.st.taken - a.st.taken)[0];
    const award = (h) => [h === ropeMvp && h.st.ropeHits > 0 ? 'ROPE MVP' : '', h === pullMvp && h !== ropeMvp && h.st.pullTaps > 0 ? 'PULL MACHINE' : '', h === goblin && h.st.dmg > 0 ? 'DAMAGE GOBLIN' : '', h === fire && h.st.taken > 0 ? 'MOST ON FIRE' : ''].filter(Boolean).map((a) => `<span class="aw">${a}</span>`).join('');
    const line = (h) => h.kindR === 'roper' ? `ROPES <em>${h.st.ropeHits}</em> hit / ${h.st.ropeMiss} miss (${h.st.perfect} perfect) · PULL <em>${h.st.pullTaps}</em> taps · took ${h.st.taken}` : `DAMAGE <em>${fmt(h.st.dmg)}</em> · took ${h.st.taken}`;
    if (win) { const b = Save.data.best.m1; if (!b || this.time < b) { Save.data.best.m1 = this.time; Save.save(); } }
    const heroes = H.map((h) => `<div class="rs-hero"><img src="${E.portrait(h.kind)}" alt=""><div><b>${h.name}</b> <small>${h.role}</small>${award(h)}<p>${line(h)}</p></div></div>`).join('');
    Main.results(win ? 'MONSTER DOWN!' : 'TEAM ROASTED', win, [
      ['CLEAR TIME', win ? fmtTime(this.time) : '—'], ['TIME', fmtTime(this.time)], ['TAKEDOWNS', this.takedowns], ['ROPES BURNED', this.ropesBurned],
      ['TOTAL DAMAGE', fmt(this.totalDmg)], ['BEST COMBO', Math.max(this.comboBest, this.combo)], ['BOSS HP LEFT', Math.round(this.bossHp / this.bossMax * 100) + '%'], ['SHAKE-OFFS', this.shakeOffs],
    ], heroes, () => this.reset(true));
  },
};
