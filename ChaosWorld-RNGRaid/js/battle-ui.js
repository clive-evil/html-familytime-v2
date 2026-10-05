/* Battle presentation: canvas arena + HUD. Reads CW.Battle state, drains events. */
(function (root) {
  'use strict';
  const CW = root.CW;
  const UI = CW.UI;
  const { $, esc } = UI;

  const BattleUI = { battle: null, floats: [], parts: [], shake: 0 };

  BattleUI.mount = function (battle, opts) {
    const B = (this.battle = battle);
    this.opts = opts;
    this.floats = []; this.parts = []; this.shake = 0; this.ended = false; this._bossShown = false;
    this.root = $('#scr-battle');
    const h = B.human;
    const mods = B.mods;
    const lo = opts.humanLoadout;
    const st = CW.deriveStats(lo);
    const fxTxt = st.fx ? ` · ${Math.round(st.fxChance * 100)}% ${CW.WEAPON_FX[st.fx].name.toUpperCase()}` : '';
    const modChips = mods.tiers.map((m) => `<span>${esc(m.label)}</span>`).join('');
    this.root.innerHTML = `
      <canvas width="1080" height="1920"></canvas>
      <div class="bt-top">
        <div class="bt-wave"><span class="wv">GET READY</span><small>${B.biome.name}</small></div>
        <div class="bt-pot"><div class="mult">RAID POT ${CW.potLabel(mods.pot)}</div><div class="bt-mods">${modChips}</div></div>
      </div>
      <div class="boss-bar"><div class="bn"></div><div class="bb"><i></i></div></div>
      <div class="bt-bottom">
        <div class="bt-you">
          <div class="yn">YOU · ${esc(lo.hero.name).toUpperCase()}</div>
          <div class="hp"><i></i><span></span></div>
          <div class="mini">${CW.SLOTS.map((s) => UI.slotEl(lo[s])).join('')}</div>
          <div class="statline">ATK ${Math.round(st.atk)} · HP ${st.hp} · CRIT ${Math.round(st.crit)}%${fxTxt}</div>
          <button class="btn dark auto" data-b="auto">AUTO: OFF</button>
        </div>
        ${h.skills.map((s, i) => `<button class="skill s${i + 1}" data-b="skill" data-i="${i}"><span class="key">${i ? 'E' : 'Q'}</span><img src="${CW.Art.icon(s.def.icon, i ? 'legendary' : 'epic', 72)}"><span class="sn">${s.def.name}</span><div class="cd"></div></button>`).join('')}
      </div>
      <div class="bt-intro"><div class="t1">THE RAID BEGINS</div><div class="t2">${B.biome.name}</div><div class="t3">${modChips || '<span style="background:#33283a">NORMAL DANGER</span>'}</div></div>`;
    this.canvas = $('canvas', this.root);
    this.ctx = this.canvas.getContext('2d');
    this.root.onclick = (e) => {
      CW.Sfx.unlock();
      const b = e.target.closest('[data-b]');
      if (!b) return;
      if (b.dataset.b === 'auto') { B.autoHuman = !B.autoHuman; b.textContent = 'AUTO: ' + (B.autoHuman ? 'ON' : 'OFF'); b.classList.toggle('gold', B.autoHuman); }
      if (b.dataset.b === 'skill') this.cast(+b.dataset.i, b);
    };
    if (opts.auto) { B.autoHuman = true; const ab = $('[data-b="auto"]', this.root); ab.textContent = 'AUTO: ON'; }
    setTimeout(() => { const i = $('.bt-intro', this.root); if (i) { i.classList.add('out'); setTimeout(() => i.remove(), 400); } }, CW.App.fast ? 500 : 1700);
  };

  BattleUI.cast = function (i, btn) {
    const B = this.battle;
    if (!B.castSkill(B.human, i)) { if (btn) UI.restartAnim(btn, 'shake'); CW.Sfx.play('deny'); }
  };
  BattleUI.key = function (e) {
    const k = e.key.toLowerCase();
    if (k === 'q' || k === '1') this.cast(0, $('.skill.s1', this.root));
    if (k === 'e' || k === '2') this.cast(1, $('.skill.s2', this.root));
    if (k === 'a') $('[data-b="auto"]', this.root).click();
  };

  // ------------------------------------------------------------ events → fx
  BattleUI.handle = function (ev) {
    const B = this.battle;
    switch (ev.type) {
      case 'dmg': {
        const t = B.get(ev.tid); if (!t) break;
        if (ev.dodge) { this.float(t.x, t.y - 70, 'MISS', '#9fd0ff', 16); break; }
        const party = t.side === 'party';
        const col = party ? '#ff6b6b' : ev.crit ? '#ffe14d' : ev.fx === 'voidEcho' ? '#c58bff' : ev.fx === 'cataclysm' ? '#ff2fa0' : ev.fx === 'chain' ? '#7fdbff' : ['burn', 'bleed', 'poison'].includes(ev.fx) ? CW.WEAPON_FX[ev.fx].color : '#ffffff';
        const src = B.get(ev.sid);
        const mine = src && (src.isHuman || src.statOwner === B.human.id);
        const size = ev.crit ? 26 : ['burn', 'bleed', 'poison', 'thorns'].includes(ev.fx) ? 12 : party ? 14 : mine ? 19 : 15;
        this.float(t.x + (Math.random() - 0.5) * 24, t.y - (t.boss ? 120 : 70), (ev.crit ? 'CRIT ' : '') + ev.amount, col, size, mine);
        if (!['burn', 'bleed', 'poison', 'thorns'].includes(ev.fx)) {
          this.spark(t.x, t.y - 34, ev.crit ? '#ffe14d' : '#fff', ev.crit ? 10 : 4);
          CW.Sfx.play(ev.crit ? 'crit' : 'hit', { gap: ev.crit ? 0.05 : 0.04 });
        }
        if (ev.crit && mine) this.shake = Math.max(this.shake, 4);
        break;
      }
      case 'heal': { const t = B.get(ev.tid); if (t) { this.float(t.x, t.y - 66, '+' + ev.amount, '#7dff7a', 14); this.spark(t.x, t.y - 30, '#7dff7a', 5, 'plus'); } CW.Sfx.play('heal', { gap: 0.08 }); break; }
      case 'wfx': {
        const t = B.get(ev.tid); if (!t) break;
        const col = CW.WEAPON_FX[ev.fx].color;
        if (ev.fx === 'chain') for (const e of B.enemies().slice(0, 3)) this.parts.push({ kind: 'bolt', x: t.x, y: t.y - 30, x2: e.x, y2: e.y - 30, life: 0.25, max: 0.25, col });
        else if (ev.fx === 'cataclysm') { this.parts.push({ kind: 'ring', x: 270, y: 330, r: 10, life: 0.6, max: 0.6, col }); UI.flash('rgba(255,47,160,0.3)', this.root); }
        else if (ev.fx === 'voidEcho') this.parts.push({ kind: 'echo', x: t.x, y: t.y - 40, life: 0.45, max: 0.45, col });
        else this.spark(t.x, t.y - 30, col, 8);
        const src = B.get(ev.sid);
        if (src && src.isHuman) this.float(t.x, t.y - 100, CW.WEAPON_FX[ev.fx].name.toUpperCase() + '!', col, 15);
        break;
      }
      case 'cast': {
        const u = B.get(ev.sid);
        this.float(u.x, u.y - 92, ev.name, ev.human ? '#c6ff2e' : '#d6b8ff', ev.human ? 20 : 13);
        this.parts.push({ kind: 'ring', x: u.x, y: u.y - 30, r: 6, life: 0.4, max: 0.4, col: ev.human ? '#c6ff2e' : '#a259ff' });
        if (ev.human) CW.Sfx.play('skill');
        break;
      }
      case 'shake': this.shake = Math.max(this.shake, ev.power); break;
      case 'bossSlam': CW.Sfx.play('slam'); this.parts.push({ kind: 'ring', x: 270, y: 640, r: 20, life: 0.6, max: 0.6, col: '#ff3b3b' }); this.float(270, 520, 'SLAM!', '#ff3b3b', 30); break;
      case 'bossChomp': { const t = B.get(ev.tid); if (t) this.float(t.x, t.y - 100, 'CHOMP!', '#ff3b3b', 24); CW.Sfx.play('slam'); break; }
      case 'enrage': UI.slam(this.root, 'ENRAGED!<small>CHAOS RAID BOSS CALLS FOR BACKUP</small>', 'red', 1800); CW.Sfx.play('chaosRaid'); this.shake = 10; break;
      case 'death': {
        const u = B.get(ev.tid); if (!u) break;
        for (let i = 0; i < 10; i++) this.parts.push({ kind: 'poof', x: u.x + (Math.random() - 0.5) * 30, y: u.y - 20 - Math.random() * 30, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60, life: 0.6, max: 0.6, col: u.side === 'enemy' ? '#c9b8d4' : '#ff6b6b' });
        if (u.side === 'party' && !u.summon) { this.float(u.x, u.y - 80, u.isHuman ? 'YOU DIED' : 'DOWN!', '#ff3b3b', u.isHuman ? 24 : 16); CW.Sfx.play('death'); }
        if (ev.boss) { this.shake = 14; UI.flash('rgba(255,255,255,0.6)', this.root); }
        break;
      }
      case 'revive': { const u = B.get(ev.tid); if (u) { this.float(u.x, u.y - 80, ev.by === 'gear' ? 'REVIVED (GEAR)!' : 'REVIVED!', '#ffe14d', 18); this.parts.push({ kind: 'ring', x: u.x, y: u.y - 30, r: 8, life: 0.6, max: 0.6, col: '#ffe14d' }); } break; }
      case 'wave': {
        const wv = $('.wv', this.root);
        wv.textContent = ev.boss ? 'BOSS WAVE' : `WAVE ${ev.wave + 1}/${ev.total}`;
        if (ev.boss) {
          const boss = B.enemies().find((e) => e.boss);
          $('.boss-bar', this.root).classList.add('on');
          $('.boss-bar', this.root).classList.toggle('enraged', !!boss.enraged);
          $('.boss-bar .bn', this.root).textContent = boss.name + (boss.enraged ? ' · ENRAGED' : '');
          UI.slam(this.root, `${esc(boss.name)}<small>${boss.enraged ? 'CHAOS RAID: ENRAGED' : 'BOSS'}</small>`, boss.enraged ? 'red' : 'gold', 1700);
          CW.Sfx.play('chaosRaid');
        } else if (ev.wave > 0) UI.slam(this.root, `WAVE ${ev.wave + 1}`, '', 1100);
        if (B.enemies().some((e) => e.elite)) setTimeout(() => this.float(270, 220, 'ELITE INCOMING', '#ff3b3b', 22), 300);
        break;
      }
      case 'waveClear': this.float(270, 450, 'CLEAR! +30% HP', '#c6ff2e', 24); CW.Sfx.play('rare'); break;
      case 'victory': case 'defeat': this.onEnd(ev.type === 'victory'); break;
    }
  };

  BattleUI.onEnd = function (won) {
    if (this.ended) return;
    this.ended = true;
    CW.Sfx.play(won ? 'victory' : 'defeat');
    const e = UI.el(`<div class="bt-end"><div class="stamp ${won ? 'win' : 'lose'}">${won ? 'VICTORY' : 'WIPED'}</div></div>`);
    this.root.appendChild(e);
    setTimeout(() => this.opts.onEnd && this.opts.onEnd(this.battle.result), CW.App.fast ? 700 : 2300);
  };

  BattleUI.float = function (x, y, text, col, size = 16, bold = false) {
    if (this.floats.length > 60) this.floats.shift();
    this.floats.push({ x, y, text, col, size, life: 1.0, max: 1.0, vy: -50 - Math.random() * 20, bold });
  };
  BattleUI.spark = function (x, y, col, n = 5, kind = 'spark') {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 120; this.parts.push({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.35 + Math.random() * 0.2, max: 0.5, col }); }
    if (this.parts.length > 260) this.parts.splice(0, this.parts.length - 260);
  };

  // ------------------------------------------------------------ frame
  BattleUI.frame = function (dt) {
    const B = this.battle;
    if (!B) return;
    for (const ev of B.drain()) this.handle(ev);
    this.draw(dt);
    // HUD
    const h = B.human;
    const pct = Math.max(0, h.hp / h.maxHp) * 100;
    $('.bt-you .hp i', this.root).style.width = pct + '%';
    $('.bt-you .hp span', this.root).textContent = h.alive ? `${Math.ceil(h.hp)} / ${h.maxHp}${h.shield > 1 ? ` (+${Math.round(h.shield)})` : ''}` : 'DOWN — CHEER THEM ON';
    h.skills.forEach((s, i) => {
      const b = $(`.skill.s${i + 1}`, this.root);
      const cd = b.querySelector('.cd');
      if (s.cdLeft > 0 || !h.alive) { cd.style.display = 'grid'; cd.style.transform = `scaleY(${h.alive ? s.cdLeft / s.def.cd : 1})`; cd.textContent = h.alive ? Math.ceil(s.cdLeft) : '✖'; b.classList.remove('ready'); }
      else { cd.style.display = 'none'; b.classList.toggle('ready', B.state === 'fight'); }
    });
    const boss = B.enemies(false).find((e) => e.boss);
    if (boss) $('.boss-bar .bb i', this.root).style.width = Math.max(0, boss.hp / boss.maxHp) * 100 + '%';
  };

  BattleUI.draw = function (dt) {
    const B = this.battle, ctx = this.ctx;
    const t = performance.now() / 1000;
    const bio = B.biome;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    this.shake = Math.max(0, this.shake - dt * 30);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    ctx.translate(sx, sy);
    // backdrop
    const g = ctx.createLinearGradient(0, 0, 0, 960);
    g.addColorStop(0, bio.sky); g.addColorStop(0.42, CW.Art.shade(bio.sky, 0.08)); g.addColorStop(0.43, bio.floor); g.addColorStop(1, CW.Art.shade(bio.floor, -0.4));
    ctx.fillStyle = g; ctx.fillRect(-20, -20, 580, 1000);
    // wall bricks
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    for (let y = 100; y < 410; y += 34) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(540, y); ctx.stroke(); for (let x = ((y / 34) % 2) * 45; x < 540; x += 90) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 34); ctx.stroke(); } }
    // glowing runes / arches
    for (const ax of [90, 450]) {
      ctx.fillStyle = '#140b17'; ctx.beginPath(); ctx.moveTo(ax - 50, 410); ctx.lineTo(ax - 50, 220); ctx.quadraticCurveTo(ax, 150, ax + 50, 220); ctx.lineTo(ax + 50, 410); ctx.fill();
      const gg = ctx.createRadialGradient(ax, 300, 5, ax, 300, 80); gg.addColorStop(0, bio.glow + 'aa'); gg.addColorStop(1, bio.glow + '00');
      ctx.fillStyle = gg; ctx.fillRect(ax - 80, 200, 160, 210);
    }
    // torches
    for (const tx of [200, 340]) {
      const fl = Math.sin(t * 15 + tx) * 2;
      const tg = ctx.createRadialGradient(tx, 190, 2, tx, 190, 70); tg.addColorStop(0, 'rgba(255,160,60,0.45)'); tg.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = tg; ctx.fillRect(tx - 70, 120, 140, 140);
      ctx.fillStyle = '#ff9f1a'; ctx.strokeStyle = '#140b17'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(tx - 7, 200); ctx.quadraticCurveTo(tx - 9 + fl, 182, tx + fl, 174); ctx.quadraticCurveTo(tx + 9, 186, tx + 7, 200); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3a2d42'; ctx.fillRect(tx - 4, 200, 8, 24); ctx.strokeRect(tx - 4, 200, 8, 24);
    }
    // floor lines
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2;
    for (let x = -400; x < 940; x += 70) { ctx.beginPath(); ctx.moveTo(270 + (x - 270) * 0.4, 412); ctx.lineTo(x, 960); ctx.stroke(); }
    for (const y of [460, 530, 620, 730, 860]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(540, y); ctx.stroke(); }
    ctx.strokeStyle = '#140b17'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 412); ctx.lineTo(540, 412); ctx.stroke();
    if (B.mods.bossEnraged) { ctx.fillStyle = `rgba(255,30,60,${0.08 + Math.sin(t * 3) * 0.05})`; ctx.fillRect(0, 0, 540, 960); }

    // units sorted by y
    const units = B.units.filter((u) => u.alive || u.side === 'party').slice().sort((a, b) => a.y - b.y);
    for (const u of units) {
      if (u.side === 'enemy') {
        u._now = B.time;
        CW.Art.drawEnemy(ctx, u, t);
        this.bar(u.x, u.y - 66 * u.size - 18, u.boss ? 0 : 54, u.hp / u.maxHp, '#ff4d4d');
        for (const d of u.dots) { ctx.fillStyle = CW.WEAPON_FX[d.type] ? CW.WEAPON_FX[d.type].color : '#fff'; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(u.x + (Math.random() - 0.5) * 30, u.y - 20 - Math.random() * 40, 3, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
      } else if (u.summon) {
        if (u.alive) { CW.Art.drawSkeleton(ctx, u, t); this.bar(u.x, u.y - 40, 30, u.hp / u.maxHp, '#1abc9c'); }
      } else {
        if (u.isHuman) { ctx.strokeStyle = '#c6ff2e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(u.x, u.y, 30, 9, 0, 0, Math.PI * 2); ctx.stroke(); }
        if (u.alive && CW.tierOf(u.heroRarity) >= 3) { const gg = ctx.createRadialGradient(u.x, u.y - 30, 4, u.x, u.y - 30, 50); gg.addColorStop(0, 'rgba(255,191,26,0.4)'); gg.addColorStop(1, 'rgba(255,191,26,0)'); ctx.fillStyle = gg; ctx.fillRect(u.x - 50, u.y - 80, 100, 100); }
        const lunge = u.anim.lunge > 0 ? u.anim.lunge : 0;
        const tgt = u.lungeTo && lunge ? B.get(u.lungeTo) : null;
        const ox = tgt ? (tgt.x - u.x) * lunge * 0.5 : 0, oy = tgt ? (tgt.y - u.y) * lunge * 0.5 : 0;
        CW.Art.drawOverlord(ctx, u.x + ox, u.y + oy, u.isHuman ? 0.72 : 0.62, u.look, {
          t: t + u.hx, face: 1, hat: CW.CLASSES[u.classId].hat, heroRarity: u.heroRarity, weaponKind: u.weaponKind, weaponRarity: u.weaponRarity,
          gearKind: u.gearKind, gearRarity: u.gearRarity, dead: !u.alive, emote: !u.alive ? null : u.anim.cast > 0 ? 'cast' : u.hp / u.maxHp < 0.25 ? 'panic' : null, emoteT: 0.5,
        });
        if (u.alive && u.anim.hit > 0) { ctx.fillStyle = 'rgba(255,60,60,0.35)'; ctx.beginPath(); ctx.ellipse(u.x, u.y - 40, 26, 40, 0, 0, 7); ctx.fill(); }
        if (u.shield > 1 && u.alive) { ctx.strokeStyle = 'rgba(127,219,255,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(u.x, u.y - 36, 32, 44, 0, 0, 7); ctx.stroke(); }
        if (u.tauntUntil > B.time && u.alive) { ctx.fillStyle = '#ff3b3b'; ctx.font = '14px "CW Display"'; ctx.textAlign = 'center'; ctx.fillText('!', u.x + 24, u.y - 70); }
        if (u.alive) this.bar(u.x, u.y + 8, 48, u.hp / u.maxHp, u.isHuman ? '#c6ff2e' : '#4ddf6a');
        ctx.font = '11px "CW Bang", Impact'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#140b17';
        const nm = u.isHuman ? 'YOU' : u.name.slice(0, 11);
        ctx.strokeText(nm, u.x, u.y + 26); ctx.fillStyle = u.isHuman ? '#c6ff2e' : '#e6d6ef'; ctx.fillText(nm, u.x, u.y + 26);
      }
    }
    // projectiles
    for (const p of B.projectiles) {
      ctx.save(); ctx.translate(p.x, p.y);
      if (p.kind === 'arrow') {
        const tt = B.get(p.to); const ang = tt ? Math.atan2(tt.y - 30 - p.y, tt.x - p.x) : -Math.PI / 2;
        ctx.rotate(ang); ctx.strokeStyle = '#140b17'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(10, 0); ctx.stroke();
        ctx.strokeStyle = CW.Art.MAT[p.rarity || 'common'].metal; ctx.lineWidth = 2.5; ctx.stroke();
      } else {
        const col = p.kind === 'heal' ? '#7dff7a' : CW.WEAPON_FX[p.kind] ? CW.WEAPON_FX[p.kind].color : CW.RARITY[p.rarity || 'common'].color;
        ctx.fillStyle = col; ctx.strokeStyle = '#140b17'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, p.kind === 'heal' ? 5 : 7, 0, 7); ctx.fill(); ctx.stroke();
        ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
    // particles
    for (const p of this.parts) {
      p.life -= dt;
      const k = Math.max(0, p.life / p.max);
      if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; }
      ctx.globalAlpha = k;
      if (p.kind === 'ring') { p.r += dt * 300; ctx.strokeStyle = p.col; ctx.lineWidth = 6 * k + 1; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.45, 0, 0, 7); ctx.stroke(); }
      else if (p.kind === 'bolt') { ctx.strokeStyle = p.col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); const mx = (p.x + p.x2) / 2 + (Math.random() - 0.5) * 30, my = (p.y + p.y2) / 2 + (Math.random() - 0.5) * 30; ctx.lineTo(mx, my); ctx.lineTo(p.x2, p.y2); ctx.stroke(); }
      else if (p.kind === 'echo') { ctx.fillStyle = p.col; ctx.strokeStyle = '#140b17'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y - (1 - k) * 20, 14 * (1.4 - k), 0, 7); ctx.fill(); ctx.stroke(); }
      else if (p.kind === 'plus') { ctx.fillStyle = p.col; ctx.font = '14px "CW Display"'; ctx.fillText('+', p.x, p.y); }
      else { ctx.fillStyle = p.col; ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5); }
    }
    ctx.globalAlpha = 1;
    this.parts = this.parts.filter((p) => p.life > 0);
    // floats
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      f.life -= dt; f.y += f.vy * dt; f.vy *= 0.94;
      const k = Math.max(0, f.life / f.max);
      const pop = f.life > 0.85 ? 1 + (f.life - 0.85) * 3 : 1;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `${Math.round(f.size * pop)}px "CW Display", Impact`;
      ctx.lineWidth = f.size > 18 ? 5 : 4; ctx.strokeStyle = '#140b17';
      ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.col; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    this.floats = this.floats.filter((f) => f.life > 0);
  };

  BattleUI.bar = function (x, y, w, pct, col) {
    if (!w) return;
    const ctx = this.ctx;
    ctx.fillStyle = '#140b17'; ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, 9);
    ctx.fillStyle = '#3a0a12'; ctx.fillRect(x - w / 2, y, w, 5);
    ctx.fillStyle = col; ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, pct)), 5);
  };

  BattleUI.unmount = function () { this.battle = null; if (this.root) this.root.onclick = null; };
  CW.BattleUI = BattleUI;
})(window);
