/* Boss race presentation: isometric arena (boss upper-right, raiders on a diagonal from lower-left),
 * live race positions, Mario-Kart-ish item reel + targeting, telegraphed boss attacks, mid-fight vote. */
(function (root) {
  'use strict';
  const CW = root.CW;
  const UI = CW.UI;
  const { $, esc } = UI;
  const ORD = (n) => CW.ordinal(n);
  const fmt = (n) => Math.round(n).toLocaleString('en-GB');
  const RANK_COL = ['', '#ffbf1a', '#d9dde3', '#e0954a'];

  const BattleUI = { battle: null, floats: [], parts: [], fx: [], shake: 0, bubbles: {}, arrows: {} };

  BattleUI.mount = function (battle, opts) {
    const B = (this.battle = battle);
    this.opts = opts;
    Object.assign(this, { floats: [], parts: [], fx: [], shake: 0, bubbles: {}, arrows: {}, ended: false, _top3: '', _youSig: '', _itemSig: '', targeting: false, votePanel: null });
    this.root = $('#scr-battle');
    const h = B.human;
    const mods = B.mods;
    const lo = opts.humanLoadout;
    const modChips = mods.tiers.map((m) => `<span>${esc(m.short || m.label)}</span>`).join('');
    this.root.innerHTML = `
      <canvas width="1080" height="1920"></canvas>
      <div class="bt-boss"><div class="bn">${esc(B.boss.name)}</div><div class="bb"><i></i><b class="mid"></b><b class="enr"></b></div><div class="bpct"></div></div>
      <div class="bt-race"><div class="rt">RACE</div><div class="rows"></div></div>
      <div class="bt-pot"><div class="mult">${CW.potLabel(mods.pot)}</div><div class="bt-mods">${modChips}</div><div class="bt-boons"></div></div>
      <div class="banner-layer bt-banners"></div>
      <div class="bt-bottom">
        <div class="bt-you">
          <div class="yrank"><span class="pos">—</span><small>YOU</small></div>
          <div class="ydmg"><b>0</b><small>BOSS DMG</small></div>
          <div class="hp"><i></i><span></span></div>
          <div class="mini">${CW.SLOTS.map((s) => UI.slotEl(lo[s])).join('')}</div>
          <div class="fx-row"></div>
        </div>
        <button class="item-btn" data-b="item"><div class="ib-reel"><img alt=""></div><div class="ib-name">ITEM</div><div class="ib-hint"></div><div class="ib-ring"></div></button>
        <div class="bt-skills">${h.skills.map((s, i) => `<button class="skill s${i + 1}" data-b="skill" data-i="${i}"><span class="key">${i ? 'E' : 'Q'}</span><img src="${CW.Art.icon(s.def.icon, i ? 'legendary' : 'epic', 56)}"><span class="sn">${s.def.name}</span><div class="cd"></div></button>`).join('')}
          <button class="btn dark auto" data-b="auto">AUTO: OFF</button></div>
      </div>
      <div class="bt-intro"><div class="t1">THE RACE IS ON — MOST BOSS DAMAGE WINS</div><div class="t2">${esc(B.boss.name)}</div><div class="t3">${B.boons.map((b) => UI.boonChip(b)).join('')}${modChips}</div></div>`;
    this.canvas = $('canvas', this.root);
    this.ctx = this.canvas.getContext('2d');
    this.bannerHost = $('.bt-banners', this.root);
    $('.bt-boss .mid', this.root).style.left = CW.BOON_VOTE.midFightAtPct * 100 + '%';
    $('.bt-boss .enr', this.root).style.left = CW.BATTLE.enrageAtPct * 100 + '%';
    this.renderBoons();
    this.root.onclick = (e) => {
      CW.Sfx.unlock();
      const b = e.target.closest('[data-b]');
      if (!b) return;
      if (b.dataset.b === 'auto') { B.autoHuman = !B.autoHuman; b.textContent = 'AUTO: ' + (B.autoHuman ? 'ON' : 'OFF'); b.classList.toggle('gold', B.autoHuman); }
      if (b.dataset.b === 'skill') this.cast(+b.dataset.i, b);
      if (b.dataset.b === 'item') this.tapItem(b);
      if (b.dataset.b === 'target') this.fireAt(b.dataset.uid);
      if (b.dataset.b === 'untarget') this.closeTargets();
    };
    if (opts.auto) { B.autoHuman = true; const ab = $('[data-b="auto"]', this.root); ab.textContent = 'AUTO: ON'; ab.classList.add('gold'); }
    setTimeout(() => { const i = $('.bt-intro', this.root); if (i) { i.classList.add('out'); setTimeout(() => i.remove(), 400); } }, CW.App.fast ? 500 : 1800);
  };

  BattleUI.renderBoons = function () {
    const el = $('.bt-boons', this.root);
    if (el) el.innerHTML = this.battle.boons.map((b) => UI.boonChip(b)).join('');
  };

  // ------------------------------------------------------------ input
  BattleUI.cast = function (i, btn) {
    const B = this.battle;
    if (!B.castSkill(B.human, i)) { if (btn) UI.restartAnim(btn, 'shake'); CW.Sfx.play('deny'); }
  };
  BattleUI.tapItem = function (btn) {
    const B = this.battle, h = B.human;
    if (!h.item) { UI.restartAnim(btn, 'shake'); return; }
    const def = CW.BATTLE_ITEMS[h.item];
    if (def.kind === 'target') return this.openTargets();
    const r = B.useItem(h);
    if (!r.ok) { UI.toast(r.reason); CW.Sfx.play('deny'); }
  };
  BattleUI.openTargets = function () {
    const B = this.battle, h = B.human;
    const def = CW.BATTLE_ITEMS[h.item];
    const list = B.targetList(h);
    this.targeting = true;
    const el = UI.el(`<div class="target-sheet"><div class="ts-head"><img src="${CW.Art.icon(def.icon, 'legendary', 48)}"><div><b>${def.name}</b><small>${def.desc} — PICK A RIVAL</small></div></div>
      <div class="ts-list">${list.map((t) => `<button class="ts-row ${t.ok ? '' : 'off'} ${t.shielded ? 'shield' : ''}" data-b="target" data-uid="${t.uid}">
        <span class="ts-rank r${t.rank}">${ORD(t.rank)}</span>
        <img class="ts-ava" src="${CW.ArtPack.heroIcon(B.get(t.uid).classId, B.get(t.uid).heroRarity, 48, B.get(t.uid).accent)}">
        <span class="ts-name">${esc(t.name)}<small class="rtag r-${t.weapon.rarity}">${CW.RARITY[t.weapon.rarity].name} ${esc(t.weapon.name).toUpperCase()}</small></span>
        <span class="ts-dmg">${t.ok ? (t.shielded ? 'SHIELDED' : fmt(B.get(t.uid).dmg)) : esc(t.reason)}</span></button>`).join('')}</div>
      <button class="btn dark" data-b="untarget">CANCEL</button></div>`);
    this.root.appendChild(el);
    CW.Sfx.play('click');
  };
  BattleUI.closeTargets = function () { this.targeting = false; for (const e of this.root.querySelectorAll('.target-sheet')) e.remove(); };
  BattleUI.fireAt = function (uid) {
    const B = this.battle;
    const r = B.useItem(B.human, uid);
    if (!r.ok) { UI.toast(r.reason); CW.Sfx.play('deny'); return; }
    this.closeTargets();
  };
  BattleUI.key = function (e) {
    const k = e.key.toLowerCase();
    const B = this.battle;
    if (B.state === 'vote' && ['1', '2', '3'].includes(k)) { B.humanVote(B.vote.options[+k - 1]); return; }
    if (this.targeting) {
      if (k === 'escape') this.closeTargets();
      const n = +k; if (n >= 1 && n <= 7) { const t = B.targetList(B.human)[n - 1]; if (t) this.fireAt(t.uid); }
      return;
    }
    if (k === 'q' || k === '1') this.cast(0, $('.skill.s1', this.root));
    if (k === 'e' || k === '2') this.cast(1, $('.skill.s2', this.root));
    if (k === ' ' || k === 'f') { e.preventDefault(); this.tapItem($('.item-btn', this.root)); }
    if (k === 'a') $('[data-b="auto"]', this.root).click();
  };

  // ------------------------------------------------------------ events → spectacle
  BattleUI.handle = function (ev) {
    const B = this.battle;
    const u = ev.uid ? B.get(ev.uid) : ev.sid ? B.get(ev.sid) : null;
    switch (ev.type) {
      case 'fightStart': CW.Sfx.play('chaosRaid'); break;
      case 'bossHit': {
        const mine = u && u.isHuman;
        if (mine || ev.crit || Math.random() < 0.12) this.float(B.boss.hitX + (Math.random() - 0.5) * 120, B.boss.hitY + (Math.random() - 0.5) * 80, (ev.crit ? 'CRIT ' : '') + fmt(ev.amount), mine ? (ev.crit ? '#c6ff2e' : '#ffffff') : ev.crit ? '#ffe14d' : 'rgba(255,255,255,0.75)', mine ? (ev.crit ? 24 : 17) : ev.crit ? 16 : 12);
        if (mine) CW.Sfx.play(ev.crit ? 'crit' : 'hit', { gap: 0.05 });
        else if (Math.random() < 0.15) CW.Sfx.play('hit', { gap: 0.08 });
        break;
      }
      case 'bossFlinch': this.shake = Math.max(this.shake, 4); break;
      case 'raiderHit': { const t = B.get(ev.tid); this.float(t.x, t.y - 80, '-' + fmt(ev.amount), '#ff6b6b', t.isHuman ? 18 : 12); break; }
      case 'blocked': { const t = B.get(ev.tid); this.float(t.x, t.y - 96, 'BLOCKED', '#ffe14d', t.isHuman ? 18 : 13); if (t.isHuman) CW.Sfx.play('stealWin'); break; }
      case 'dodge': { const t = B.get(ev.tid); this.float(t.x, t.y - 90, 'DODGE', '#9fd0ff', 12); break; }
      case 'heal': { const t = B.get(ev.tid); if (t.isHuman || Math.random() < 0.3) this.float(t.x, t.y - 74, '+' + ev.amount, '#7dff7a', 12); break; }
      case 'cast': if (u) { this.float(u.x, u.y - 118, ev.name, u.isHuman ? '#c6ff2e' : '#d6b8ff', u.isHuman ? 18 : 11); if (u.isHuman) CW.Sfx.play('skill'); } break;
      case 'shake': this.shake = Math.max(this.shake, ev.power); break;
      case 'telegraph': {
        const tg = ev.tg;
        this.bossCallout(tg.name, tg.type === 'roar' ? '#ff9f1a' : '#ff3b3b');
        if (tg.targets.includes(B.human.id) || tg.zones.some((z) => B.inZone(B.human, z))) { CW.Sfx.play('deny'); this.float(B.human.x, B.human.y - 130, 'INCOMING!', '#ff3b3b', 18); }
        break;
      }
      case 'bossAttack': {
        const tg = ev.tg;
        if (tg.type === 'slam' || tg.type === 'meteors') { CW.Sfx.play('slam'); for (const z of tg.zones) this.parts.push({ kind: 'ring', x: z.x, y: z.y, r: z.r * 0.3, max: 0.5, life: 0.5, col: tg.type === 'slam' ? '#ff3b3b' : '#ff9f1a', grow: z.r * 2 }); }
        if (tg.type === 'beam') { for (const id of tg.targets) { const t = B.get(id); this.fx.push({ kind: 'beam', x1: B.boss.x - 40, y1: B.boss.y - 290, x2: t.x, y2: t.y - 40, life: 0.35, max: 0.35 }); } CW.Sfx.play('crit'); }
        if (tg.type === 'roar') { CW.Sfx.play('chaosRaid'); this.fx.push({ kind: 'roar', life: 0.8, max: 0.8 }); }
        break;
      }
      case 'ko': { const t = B.get(ev.tid); this.float(t.x, t.y - 90, t.isHuman ? 'YOU\'RE DOWN!' : 'DOWN!', '#ff3b3b', t.isHuman ? 22 : 14); if (t.isHuman) { CW.Sfx.play('death'); UI.flash('rgba(255,0,0,0.25)', this.root); } break; }
      case 'respawn': { const t = B.get(ev.tid); this.float(t.x, t.y - 90, 'BACK UP', '#c6ff2e', t.isHuman ? 18 : 12); break; }
      case 'secondWind': { const t = B.get(ev.tid); this.float(t.x, t.y - 96, 'SECOND WIND!', '#7dff7a', 16); break; }
      case 'revive': { const t = B.get(ev.tid); this.float(t.x, t.y - 96, 'REVIVED (GEAR)', '#ffe14d', 14); break; }
      case 'enrage': UI.slam(this.root, 'ENRAGED!<small>BOSS BELOW 25% · HITS HARDER, FASTER</small>', 'red', 1700); CW.Sfx.play('chaosRaid'); this.shake = 10; break;
      case 'rankChange':
        this.arrows[ev.uid] = { up: ev.to < ev.from, until: performance.now() + 1500 };
        if (ev.human) {
          if (ev.to > ev.from) { this.float(B.human.x, B.human.y - 140, `OVERTAKEN! ▼ ${ORD(ev.to)}`, '#ff5a7a', 20); CW.Sfx.play('deny'); }
          else { this.float(B.human.x, B.human.y - 140, `▲ ${ORD(ev.to)}`, '#c6ff2e', 22); CW.Sfx.play('coin'); }
          UI.restartAnim($('.bt-you .yrank', this.root), 'bump');
        }
        break;
      case 'newLeader': {
        const l = B.get(ev.uid);
        UI.banner(this.bannerHost, { top: 'NEW LEADER', main: l.isHuman ? 'YOU TAKE 1ST!' : esc(l.name), color: '#ffbf1a', ms: 1100, key: 'leader', priority: l.isHuman });
        if (l.isHuman) CW.Sfx.play('legendary');
        break;
      }
      case 'itemReel': if (ev.human) CW.Sfx.play('stealTry'); break;
      case 'itemReady': if (ev.human) { CW.Sfx.play(['lightning', 'crownBreaker', 'ghost'].includes(ev.item) ? 'legendary' : 'rare'); UI.restartAnim($('.item-btn', this.root), 'rv-epic'); } break;
      case 'itemUsed': this.onItem(ev); break;
      case 'swapStart': {
        const a = B.get(ev.a), b = B.get(ev.b);
        this.fx.push({ kind: 'swap', a, b, iconA: CW.ArtPack.itemIcon(ev.bGot.kind, ev.bGot.rarity, 56), iconB: CW.ArtPack.itemIcon(ev.aGot.kind, ev.aGot.rarity, 56), life: 0.8, max: 0.8 });
        const got = ev.aGot;
        if (a.isHuman || b.isHuman || CW.tierOf(got.rarity) >= 3) UI.banner(this.bannerHost, { top: ev.kind === 'ghost' ? `GHOST SWAP · ${esc(a.name)} ⇄ ${esc(b.name)}` : `SWAP CURSE · ${esc(a.name)} ⇄ ${esc(b.name)}`, main: `${CW.RARITY[got.rarity].name} ${esc(got.name)}`.toUpperCase(), sub: `${Math.round(ev.dur)}s`, color: '#c9f1ff', ms: 1400, priority: a.isHuman || b.isHuman });
        CW.Sfx.play('stealWin');
        break;
      }
      case 'swapEnd': { const a = B.get(ev.a), b = ev.b && B.get(ev.b); for (const x of [a, b]) if (x) this.float(x.x, x.y - 110, 'RESTORED', '#c9f1ff', x.isHuman ? 16 : 11); break; }
      case 'crownLocked': {
        const t = B.get(ev.tid), s = B.get(ev.sid);
        UI.banner(this.bannerHost, { top: `CROWN BREAKER · FROM ${esc(s.name)}`, main: `LOCKED ON ${t.isHuman ? 'YOU' : esc(t.name)}`, sub: t.isHuman ? 'SHIELD OR PURGE NOW!' : '1ST PLACE IS IN TROUBLE', color: '#ff2fa0', ms: 1500, priority: true });
        if (t.isHuman) { CW.Sfx.play('chaosRaid'); UI.flash('rgba(255,47,160,0.25)', this.root); }
        break;
      }
      case 'crownHit': { const t = B.get(ev.tid); this.fx.push({ kind: 'skull', x: t.x, y: t.y, life: 0.6, max: 0.6 }); this.float(t.x, t.y - 130, 'CROWN BROKEN!', '#ff2fa0', 22); this.shake = 9; CW.Sfx.play('grief'); break; }
      case 'crownFizzle': { const t = B.get(ev.tid); this.float(t.x, t.y - 130, ev.why === 'purged' ? 'PURGED!' : 'MISSED', '#ffe14d', 16); break; }
      case 'chat': if (u) this.bubbles[u.id] = { text: ev.text, until: performance.now() + 2600 }; break;
      case 'voteStart':
        this.closeTargets();
        this.votePanel = UI.VotePanel({ host: this.root, title: 'MID-FIGHT BOON VOTE', sub: 'BOSS AT 50% — THE FIGHT IS PAUSED', options: ev.options, lookOf: (id) => B.get(id).look, onVote: (bo) => B.humanVote(bo) });
        this.votePanel.el.classList.add('mid');
        CW.Sfx.play('countdown', { final: true });
        break;
      case 'voteTie': UI.banner(this.bannerHost, { top: 'TIED VOTE', main: 'TIE-BREAK SPIN', color: '#ffbf1a', ms: 900 }); break;
      case 'voteEnd': CW.Sfx.play('legendary'); break;
      case 'boonApplied': {
        const d = CW.BOON_OPTIONS[ev.boon];
        const vp = this.votePanel; this.votePanel = null;
        if (vp) { vp.update(B.vote || { state: 'done', winner: ev.boon, votes: {}, counts: () => ({}), remaining: () => 0, duration: 1, k: 1, tied: null }, B.human.id); setTimeout(() => vp.close(), CW.App.fast ? 200 : 900); }
        UI.banner(this.bannerHost, { top: 'BOON WON', main: d.name, sub: 'ALL RAIDERS: ' + d.desc, color: d.color, ms: 1600, priority: true });
        this.renderBoons();
        break;
      }
      case 'victory': case 'defeat': this.onEnd(ev.type === 'victory', ev.why); break;
    }
  };

  BattleUI.onItem = function (ev) {
    const B = this.battle;
    const u = B.get(ev.uid), def = CW.BATTLE_ITEMS[ev.item];
    const t = ev.tid && B.get(ev.tid);
    if (u.isHuman || def.kind !== 'self') this.float(u.x, u.y - 130, def.name + '!', def.color, u.isHuman ? 20 : 13);
    switch (ev.item) {
      case 'lightning':
        UI.flash('rgba(255,255,220,0.8)', this.root);
        UI.slam(this.root, `LIGHTNING!<small>${u.isHuman ? 'YOU STUN' : esc(u.name) + ' STUNS'} EVERY RIVAL · ${(B.debug.lightningDuration || CW.LIGHTNING_DURATION)}s</small>`, 'gold', 1500);
        for (const id of ev.hit || []) { const x = B.get(id); this.fx.push({ kind: 'bolt', x: x.x, y: x.y, life: 0.5, max: 0.5 }); }
        this.shake = 12; CW.Sfx.play('mythic');
        break;
      case 'bomb':
        if (t) { this.fx.push({ kind: 'bomb', x1: u.x, y1: u.y - 50, x2: t.x, y2: t.y - 30, life: 0.45, max: 0.45 }); setTimeout(() => this.parts.push({ kind: 'ring', x: t.x, y: t.y, r: 10, max: 0.5, life: 0.5, col: '#ff7a1a', grow: 160 }), 300); }
        CW.Sfx.play('slam');
        if ((ev.hit || []).includes(B.human.id) && !u.isHuman) UI.banner(this.bannerHost, { top: `${esc(u.name)} BOMBED`, main: 'YOU!', color: '#ff3b3b', ms: 900, priority: true });
        break;
      case 'hex': if (t) this.fx.push({ kind: 'beam', x1: u.x, y1: u.y - 50, x2: t.x, y2: t.y - 50, life: 0.4, max: 0.4, col: '#b44dff' }); CW.Sfx.play('curse'); break;
      case 'shield': CW.Sfx.play('epic'); break;
      case 'haste': case 'surge': case 'tonic': case 'mimic': case 'purge': if (u.isHuman) CW.Sfx.play('rare'); break;
    }
  };

  BattleUI.bossCallout = function (text, col) {
    this.fx.push({ kind: 'callout', text, col, life: 1.1, max: 1.1 });
  };

  BattleUI.onEnd = function (won, why) {
    if (this.ended) return;
    this.ended = true;
    this.closeTargets();
    CW.Sfx.play(won ? 'victory' : 'defeat');
    const e = UI.el(`<div class="bt-end"><div class="stamp ${won ? 'win' : 'lose'}">${won ? 'BOSS DOWN' : why === 'timeout' ? 'BERSERK!' : 'WIPED'}</div></div>`);
    this.root.appendChild(e);
    setTimeout(() => this.opts.onEnd && this.opts.onEnd(this.battle.result), CW.App.fast ? 700 : 2200);
  };

  BattleUI.float = function (x, y, text, col, size = 16) {
    if (this.floats.length > 50) this.floats.shift();
    this.floats.push({ x, y, text, col, size, life: 1.0, max: 1.0, vy: -46 - Math.random() * 16 });
  };

  // ------------------------------------------------------------ HUD
  BattleUI.frame = function (dt) {
    const B = this.battle;
    if (!B) return;
    for (const ev of B.drain()) { this.handle(ev); if (this.battle !== B) return; }
    this.draw(dt);
    const h = B.human;
    // boss bar
    const pct = Math.max(0, B.boss.hp / B.boss.maxHp);
    $('.bt-boss .bb i', this.root).style.width = (pct * 100).toFixed(2) + '%';
    $('.bt-boss', this.root).classList.toggle('enraged', B.boss.enraged);
    const pc = $('.bt-boss .bpct', this.root); const pt = Math.ceil(pct * 100) + '%'; if (pc.textContent !== pt) pc.textContent = pt;
    // race top 3 (+ you if outside)
    const st = B.standings();
    const rows = st.slice(0, 3);
    if (h.rank > 3) rows.push(h);
    const sig = rows.map((u) => u.id + ':' + u.rank + ':' + Math.round(u.dmg / 50)).join('|');
    if (sig !== this._top3) {
      this._top3 = sig;
      $('.bt-race .rows', this.root).innerHTML = rows.map((u) => `<div class="rr ${u.isHuman ? 'me' : ''} ${u.rank > 3 ? 'gap' : ''}" style="--rc:${RANK_COL[u.rank] || '#8e7f96'}"><span class="p">${u.rank}</span><span class="n">${u.isHuman ? 'YOU' : esc(u.name)}</span><span class="d">${fmt(u.dmg)}</span></div>`).join('');
    }
    // you panel
    const ysig = h.rank + '|' + Math.round(h.dmg) + '|' + Math.round(h.hp) + '|' + h.down;
    if (ysig !== this._youSig) {
      this._youSig = ysig;
      const pos = $('.bt-you .pos', this.root); pos.textContent = ORD(h.rank); pos.style.color = RANK_COL[h.rank] || '#fff';
      $('.bt-you .ydmg b', this.root).textContent = fmt(h.dmg);
      $('.bt-you .hp i', this.root).style.width = Math.max(0, (h.hp / h.maxHp) * 100) + '%';
      $('.bt-you .hp span', this.root).textContent = h.down ? `DOWN — BACK IN ${Math.ceil(h.koUntil - B.time)}s` : `${Math.ceil(h.hp)} / ${h.maxHp}`;
    }
    const fxs = h.effects.filter((e) => e.until > B.time).map((e) => `<span class="fx-${e.type}">${{ haste: 'HASTE', surge: 'SURGE', shieldItem: 'SHIELD', stun: 'STUNNED', hex: 'HEXED', cursed: 'CURSED', roar: 'SLOWED', crownWarn: 'TARGETED!', crit: 'CRIT+', frenzy: 'FRENZY', taunt: 'TAUNT', dodge: 'DODGE+' }[e.type] || e.type.toUpperCase()} ${Math.ceil(e.until - B.time)}</span>`).join('') + (h.swap ? `<span class="${h.swap.initiator ? 'fx-haste' : 'fx-swap'}">${h.swap.initiator ? 'BORROWED' : h.swap.kind === 'ghost' ? 'GHOSTED' : 'SWAPPED'} ${Math.ceil(h.swap.until - B.time)}</span>` : '');
    const fr = $('.bt-you .fx-row', this.root); if (fr.innerHTML !== fxs) fr.innerHTML = fxs;
    // swap shows on mini loadout
    const mini = $('.bt-you .mini', this.root);
    const msig = h.cur.weapon.uid + '|' + h.cur.gear.uid;
    if (mini.dataset.sig !== msig) { mini.dataset.sig = msig; mini.innerHTML = CW.SLOTS.map((s) => UI.slotEl(h.cur[s], h.cur[s] !== h.base[s] ? 'swapped' : '')).join(''); }
    // skills
    h.skills.forEach((s, i) => {
      const b = $(`.skill.s${i + 1}`, this.root);
      const cd = b.querySelector('.cd');
      const blocked = h.down || B.isStunned(h);
      if (s.cdLeft > 0 || blocked) { cd.style.display = 'grid'; cd.style.transform = `scaleY(${blocked ? 1 : s.cdLeft / s.def.cd})`; cd.textContent = blocked ? '✖' : Math.ceil(s.cdLeft); b.classList.remove('ready'); }
      else { cd.style.display = 'none'; b.classList.toggle('ready', B.state === 'fight'); }
    });
    this.renderItem();
    if (this.votePanel && B.vote) this.votePanel.update(B.vote, h.id);
  };

  BattleUI.renderItem = function () {
    const B = this.battle, h = B.human;
    const btn = $('.item-btn', this.root);
    const img = btn.querySelector('img');
    let state = 'empty';
    if (h.reel) state = 'reel'; else if (h.item) state = 'ready';
    btn.dataset.state = state;
    if (state === 'reel') {
      const ids = Object.keys(CW.BATTLE_ITEMS);
      const k = Math.floor(performance.now() / 70) % ids.length;
      img.src = CW.Art.icon(CW.BATTLE_ITEMS[ids[k]].icon, 'epic', 72);
      if (this._itemSig !== 'reel') { this._itemSig = 'reel'; btn.querySelector('.ib-name').textContent = 'ITEM REEL'; btn.querySelector('.ib-hint').textContent = '…'; }
      if (Math.floor(performance.now() / 70) !== this._tick) { this._tick = Math.floor(performance.now() / 70); CW.Sfx.play('tick', { gap: 0.06 }); }
    } else if (state === 'ready') {
      const def = CW.BATTLE_ITEMS[h.item];
      const sig = 'ready:' + h.item;
      if (this._itemSig !== sig) {
        this._itemSig = sig;
        img.src = CW.Art.icon(def.icon, 'legendary', 72);
        btn.querySelector('.ib-name').textContent = def.name;
        btn.querySelector('.ib-hint').textContent = def.kind === 'target' ? 'TAP · PICK RIVAL' : def.kind === 'auto' ? 'TAP · AUTO-TARGET' : 'TAP TO USE';
        btn.style.setProperty('--ic', def.color);
      }
    } else {
      const left = Math.max(0, h.itemCd / ((CW.ITEM_RATE_BY_RANK[h.rank - 1] || 1) * (1 + B.boon('itemRate'))));
      const sig = 'empty:' + Math.ceil(left);
      if (this._itemSig !== sig) { this._itemSig = sig; img.src = CW.Art.icon('mimic', 'common', 72); btn.querySelector('.ib-name').textContent = 'NEXT ITEM'; btn.querySelector('.ib-hint').textContent = Math.ceil(left) + 's'; }
    }
  };

  // ------------------------------------------------------------ canvas
  BattleUI.draw = function (dt) {
    const B = this.battle, ctx = this.ctx;
    const t = performance.now() / 1000;
    const bio = B.biome;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    this.shake = Math.max(0, this.shake - dt * 30);
    ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    // backdrop: dark wall + isometric floor diamond grid receding to the upper-right
    ctx.fillStyle = bio.sky; ctx.fillRect(-20, -20, 580, 1000);
    const wall = ctx.createLinearGradient(0, 0, 0, 300); wall.addColorStop(0, CW.Art.shade(bio.sky, -0.4)); wall.addColorStop(1, bio.sky);
    ctx.fillStyle = wall; ctx.fillRect(-20, -20, 580, 300);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    for (let y = 30; y < 280; y += 34) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(540, y); ctx.stroke(); for (let x = ((y / 34) % 2) * 45; x < 540; x += 90) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 34); ctx.stroke(); } }
    const glow = ctx.createRadialGradient(370, 230, 20, 370, 230, 300); glow.addColorStop(0, bio.glow + '66'); glow.addColorStop(1, bio.glow + '00');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, 540, 600);
    // floor
    ctx.fillStyle = bio.floor; ctx.beginPath(); ctx.moveTo(-40, 280); ctx.lineTo(580, 250); ctx.lineTo(580, 1000); ctx.lineTo(-40, 1000); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 2;
    for (let i = -12; i < 20; i++) { ctx.beginPath(); ctx.moveTo(i * 60, 270); ctx.lineTo(i * 60 + 520, 1000); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i * 60 + 300, 270); ctx.lineTo(i * 60 - 300, 1000); ctx.stroke(); }
    ctx.strokeStyle = '#140b17'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-40, 280); ctx.lineTo(580, 250); ctx.stroke();
    if (B.boss.chaosRaid || B.boss.enraged) { ctx.fillStyle = `rgba(255,30,60,${0.07 + Math.sin(t * 3) * 0.04})`; ctx.fillRect(0, 0, 540, 960); }
    // telegraph zones on the floor
    for (const tg of B.telegraphs) {
      const k = Math.min(1, (B.time - tg.start) / (tg.at - tg.start));
      for (const z of tg.zones) {
        ctx.fillStyle = `rgba(255,${tg.type === 'slam' ? 40 : 140},40,${0.18 + k * 0.25})`;
        ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r / 1.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,60,40,0.55)'; ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r * k, (z.r / 1.6) * k, 0, 0, Math.PI * 2); ctx.fill();
        if (tg.type === 'meteors') { const my = z.y - 300 * (1 - k); ctx.fillStyle = '#ff9f1a'; ctx.strokeStyle = '#140b17'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(z.x + 60 * (1 - k), my, 10, 0, 7); ctx.fill(); ctx.stroke(); }
      }
      for (const id of tg.targets) {
        const u = B.get(id); if (!u) continue;
        ctx.strokeStyle = `rgba(255,40,60,${0.4 + k * 0.5})`; ctx.lineWidth = 2 + k * 4; ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.moveTo(B.boss.x - 70, B.boss.y - 290); ctx.lineTo(u.x, u.y - 40); ctx.stroke(); ctx.setLineDash([]);
        this.crosshair(u.x, u.y - 40, 18, '#ff3b3b');
      }
    }
    // depth-sorted scene: boss + raiders
    const items = B.units.map((u) => ({ y: u.y, u })).concat([{ y: B.boss.y - 60, boss: true }]);
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.boss) { CW.ArtPack.drawBoss(ctx, B.boss, t, { scale: 0.96 }); continue; }
      this.drawRaider(it.u, t);
    }
    // summons
    for (const s of B.summons) { ctx.save(); ctx.translate(s.x, s.y); ctx.scale(0.5, 0.5); CW.Art.drawSkeleton ? CW.Art.drawSkeleton(ctx, { x: 0, y: 0, hx: s.id, anim: { lunge: 0 } }, t) : 0; ctx.restore(); }
    // projectiles
    for (const p of B.projectiles) {
      ctx.save(); ctx.translate(p.x, p.y);
      if (p.kind === 'arrow') { ctx.rotate(Math.atan2(p.ty - p.y, p.tx - p.x)); ctx.strokeStyle = '#140b17'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(10, 0); ctx.stroke(); ctx.strokeStyle = CW.Art.MAT[p.rarity || 'common'].metal; ctx.lineWidth = 2.5; ctx.stroke(); }
      else { const col = p.kind === 'heal' ? '#7dff7a' : CW.WEAPON_FX[p.kind] ? CW.WEAPON_FX[p.kind].color : CW.RARITY[p.rarity || 'common'].color; ctx.fillStyle = col; ctx.strokeStyle = '#140b17'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill(); ctx.stroke(); }
      ctx.restore();
    }
    this.drawFx(dt, t);
    // floats
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      f.life -= dt; f.y += f.vy * dt; f.vy *= 0.94;
      const k = Math.max(0, f.life / f.max), pop = f.life > 0.85 ? 1 + (f.life - 0.85) * 3 : 1;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `${Math.round(f.size * pop)}px "CW Display", Impact`;
      ctx.lineWidth = f.size > 16 ? 5 : 4; ctx.strokeStyle = '#140b17';
      ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.col; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    this.floats = this.floats.filter((f) => f.life > 0);
    if (B.state === 'vote') { ctx.fillStyle = 'rgba(10,4,14,0.45)'; ctx.fillRect(0, 0, 540, 960); }
  };

  BattleUI.crosshair = function (x, y, r, col) {
    const c = this.ctx;
    c.strokeStyle = col; c.lineWidth = 3;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(x - r - 6, y); c.lineTo(x - r + 6, y); c.moveTo(x + r - 6, y); c.lineTo(x + r + 6, y); c.moveTo(x, y - r - 6); c.lineTo(x, y - r + 6); c.moveTo(x, y + r - 6); c.lineTo(x, y + r + 6); c.stroke();
  };

  BattleUI.drawRaider = function (u, t) {
    const B = this.battle, ctx = this.ctx;
    const scale = u.isHuman ? 0.74 : 0.62;
    const stunned = B.isStunned(u);
    if (u.isHuman) { ctx.strokeStyle = '#c6ff2e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(u.x, u.y, 32, 10, 0, 0, Math.PI * 2); ctx.stroke(); }
    if (B.has(u, 'crownWarn')) this.crosshair(u.x, u.y - 50, 26 + Math.sin(t * 12) * 4, '#ff2fa0');
    const state = u.down ? 'down' : stunned ? 'stun' : u.anim.lunge > 0 ? 'attack' : u.anim.cast > 0 ? 'cast' : u.anim.hit > 0 ? 'hurt' : 'idle';
    if (B.has(u, 'haste')) { ctx.strokeStyle = 'rgba(127,219,255,0.7)'; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(u.x - 30 - i * 6, u.y - 30 - i * 14); ctx.lineTo(u.x - 52 - i * 6, u.y - 30 - i * 14); ctx.stroke(); } }
    if (B.has(u, 'hex') || B.has(u, 'cursed')) { ctx.fillStyle = 'rgba(180,77,255,0.25)'; ctx.beginPath(); ctx.ellipse(u.x, u.y - 40, 30, 48, 0, 0, 7); ctx.fill(); }
    CW.ArtPack.drawCharacter(ctx, u.classId, u.x, u.y, scale, { t: t + u.idx, state, attackT: 1 - Math.max(0, u.anim.lunge) / 0.3, lunge: Math.max(0, u.anim.lunge) * 2, accent: u.accent, rarity: u.heroRarity, weaponKind: u.weaponKind, weaponRarity: u.weaponRarity, seed: u.idx });
    if (B.isInvuln(u)) { ctx.strokeStyle = `rgba(255,225,77,${0.7 + Math.sin(t * 10) * 0.3})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(u.x, u.y - 42, 34, 50, 0, 0, 7); ctx.stroke(); ctx.fillStyle = 'rgba(255,225,77,0.12)'; ctx.fill(); }
    if (u.shield > 1 && !u.down) { ctx.strokeStyle = 'rgba(127,219,255,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(u.x, u.y - 42, 30, 46, 0, 0, 7); ctx.stroke(); }
    if (u.swap) { ctx.save(); ctx.globalAlpha = 0.85; ctx.translate(u.x + 24, u.y - 100); ctx.scale(0.35, 0.35); CW.Art.drawItem(ctx, u.swap.kind === 'ghost' ? 'ghost' : 'swap', 'epic'); ctx.restore(); }
    // rank pill + hp bar + name
    const top = u.y - 112 * scale - 14;
    const col = RANK_COL[u.rank] || '#4a3a52';
    const label = ORD(u.rank);
    ctx.font = `${u.isHuman ? 14 : 12}px "CW Display", Impact`; ctx.textAlign = 'center';
    const w = ctx.measureText(label).width + 12;
    ctx.fillStyle = col; ctx.strokeStyle = '#140b17'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(u.x - w / 2, top - 13, w, 18, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = u.rank <= 3 ? '#140b17' : '#fff'; ctx.fillText(label, u.x, top + 1);
    const ar = this.arrows[u.id];
    if (ar && performance.now() < ar.until) { ctx.fillStyle = ar.up ? '#c6ff2e' : '#ff5a7a'; ctx.font = '14px "CW Display"'; ctx.strokeText(ar.up ? '▲' : '▼', u.x + w / 2 + 8, top + 1); ctx.fillText(ar.up ? '▲' : '▼', u.x + w / 2 + 8, top + 1); }
    if (!u.down) { ctx.fillStyle = '#140b17'; ctx.fillRect(u.x - 24, u.y + 6, 48, 7); ctx.fillStyle = u.isHuman ? '#c6ff2e' : '#4ddf6a'; ctx.fillRect(u.x - 23, u.y + 7, 46 * Math.max(0, u.hp / u.maxHp), 5); }
    ctx.font = '11px "CW Bang", Impact'; ctx.lineWidth = 3; ctx.strokeStyle = '#140b17';
    const nm = u.isHuman ? 'YOU' : u.name.slice(0, 11);
    ctx.strokeText(nm, u.x, u.y + 26); ctx.fillStyle = u.isHuman ? '#c6ff2e' : '#e6d6ef'; ctx.fillText(nm, u.x, u.y + 26);
    const bub = this.bubbles[u.id];
    if (bub && performance.now() < bub.until) {
      ctx.font = '12px "CW Bang", Impact'; const bw = Math.min(170, ctx.measureText(bub.text).width + 14); const by = top - 30;
      ctx.fillStyle = '#f1e4c6'; ctx.strokeStyle = '#140b17'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.roundRect(u.x - bw / 2, by - 12, bw, 20, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#140b17'; ctx.fillText(bub.text, u.x, by + 3, bw - 8);
    }
  };

  BattleUI.drawFx = function (dt, t) {
    const B = this.battle, ctx = this.ctx;
    for (const p of this.parts) {
      p.life -= dt; const k = Math.max(0, p.life / p.max);
      ctx.globalAlpha = k;
      if (p.kind === 'ring') { const r = p.r + (1 - k) * (p.grow || 120); ctx.strokeStyle = p.col; ctx.lineWidth = 7 * k + 1; ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r / 1.6, 0, 0, 7); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const f of this.fx) {
      f.life -= dt; const k = Math.max(0, f.life / f.max);
      ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.5);
      if (f.kind === 'beam') { ctx.strokeStyle = f.col || '#ff2f6a'; ctx.lineWidth = 10 * k + 2; ctx.shadowColor = f.col || '#ff2f6a'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); }
      if (f.kind === 'bolt') { ctx.strokeStyle = '#fff07a'; ctx.lineWidth = 5; ctx.shadowColor = '#fff07a'; ctx.shadowBlur = 16; ctx.beginPath(); let x = f.x + (Math.random() - 0.5) * 30, y = -10; ctx.moveTo(x, y); while (y < f.y - 40) { y += 40; x = f.x + (Math.random() - 0.5) * 40; ctx.lineTo(x, y); } ctx.lineTo(f.x, f.y - 40); ctx.stroke(); }
      if (f.kind === 'bomb') { const p = 1 - k; const x = f.x1 + (f.x2 - f.x1) * p, y = f.y1 + (f.y2 - f.y1) * p - Math.sin(p * Math.PI) * 120; ctx.translate(x, y); ctx.rotate(p * 8); ctx.scale(0.5, 0.5); CW.Art.drawItem(ctx, 'bomb', 'common'); }
      if (f.kind === 'skull') { const y = f.y - 200 * k; ctx.translate(f.x, y - 40); ctx.scale(0.7, 0.7); CW.Art.drawItem(ctx, 'crown', 'mythic'); }
      if (f.kind === 'roar') { ctx.strokeStyle = 'rgba(255,159,26,0.6)'; ctx.lineWidth = 6; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(B.boss.x - 40, B.boss.y - 260, 60 + (1 - k) * 300 + i * 40, (60 + (1 - k) * 300 + i * 40) * 0.6, 0, 0, 7); ctx.stroke(); } }
      if (f.kind === 'swap') {
        const p = 1 - k;
        for (const [from, to, icon] of [[f.a, f.b, f.iconB], [f.b, f.a, f.iconA]]) {
          const x = from.x + (to.x - from.x) * p, y = from.y - 60 + (to.y - from.y) * p - Math.sin(p * Math.PI) * 90;
          if (!f[icon]) { const im = new Image(); im.src = icon; f[icon] = im; }
          if (f[icon].complete) ctx.drawImage(f[icon], x - 20, y - 20, 40, 40);
        }
      }
      if (f.kind === 'callout') {
        ctx.font = '26px "CW Display", Impact'; ctx.textAlign = 'center'; ctx.lineWidth = 6; ctx.strokeStyle = '#140b17';
        const y = 470 - (1 - k) * 10;
        ctx.strokeText(f.text, 360, y); ctx.fillStyle = f.col; ctx.fillText(f.text, 360, y);
      }
      ctx.restore();
    }
    this.fx = this.fx.filter((f) => f.life > 0);
  };

  BattleUI.unmount = function () { this.closeTargets && this.root && this.closeTargets(); this.battle = null; if (this.root) this.root.onclick = null; };
  CW.BattleUI = BattleUI;
})(window);
