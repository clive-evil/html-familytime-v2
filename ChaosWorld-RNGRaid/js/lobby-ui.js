/* Lobby presentation. Reads CW.Lobby state + drains its events. Owns no game rules. */
(function (root) {
  'use strict';
  const CW = root.CW;
  const UI = CW.UI;
  const { $, $$, esc } = UI;
  const SLOTS = CW.SLOTS;
  const poss = (p) => (p.isHuman ? 'YOUR' : p.name + "'s");
  const TOKEN_NAME = { jack: 'JACK TOKEN', chaos: 'CHAOS TOKEN', grief: 'GRIEF TOKEN' };

  const LobbyUI = {
    lobby: null, root: null, disp: {}, target: null, actors: {}, callouts: [], feed: [],
    _abSig: '', _tgSig: '', _tgAt: 0, _cdLast: null, _humanSteal: null, _rt: 0,
  };

  // ------------------------------------------------------------ mount
  LobbyUI.mount = function (lobby, opts = {}) {
    const L = (this.lobby = lobby);
    this.opts = opts;
    this.root = $('#scr-lobby');
    this.disp = {}; this.target = null; this.actors = {}; this.feed = []; this._abSig = ''; this._tgSig = ''; this._cdLast = null; this._humanSteal = null;
    this._tutorial = !!opts.tutorial; this._calloutStep = -1; this._potTier = 100;
    UI.clearBanners();
    const m = L.mode;
    const b = L.biome;
    const ticks = CW.RAID_MODIFIERS.filter((x) => x.at > 100).map((x) => {
      const pct = ((x.at - 100) / (CW.RAID_POT.cap - 100)) * 100;
      return `<div class="pot-tick" data-at="${x.at}" style="left:calc(${pct}% - ${x.at === CW.RAID_POT.cap ? 3 : 1.5}px)"><span>${x.at === CW.RAID_POT.cap ? '☠ x2' : x.short}</span></div>`;
    }).join('');
    this.root.className = 'screen';
    this.root.innerHTML = `
      <div class="lb-top">
        <div>
          <div class="lb-title ${m.grief ? 'grief' : ''}">${m.grief ? 'GRIEF RAID' : 'CHAOS RAID'}</div>
          <div class="lb-sub"><b>${b.name}</b> · <span class="skulls">${'☠'.repeat(b.difficulty)}</span></div>
        </div>
        <div class="lb-timer"><div><div class="num">--</div><div class="lbl">JOINING</div></div></div>
        <div class="lb-wallet">${UI.wallet(L.human.wallet)}</div>
      </div>
      <div class="pot">
        <div class="pot-label"><small>RAID POT</small><span class="mult">x1.0</span></div>
        <div class="pot-meter"><div class="pot-fill"></div>${ticks}<div class="pot-next"></div></div>
        <button class="btn gold" data-act="boost">BOOST<small>+0.1 · ${CW.RAID_POT.cost}c</small></button>
      </div>
      <div class="you" id="card-${L.human.id}" data-pid="${L.human.id}">
        <div class="shield">IMM</div><div class="status"></div>
        <div class="you-head"><div class="ava"><img src="${CW.Art.bust(L.human.look, null, null, 76, '#4b3a57')}"></div>
          <span class="you-name">${esc(L.human.name)}</span><span class="tag-you">YOUR LOADOUT</span><span class="lv">LV ${L.human.level}</span>
          <div class="you-power">LOADOUT POWER<br><b class="pw">—</b></div></div>
        <div class="you-slots">${SLOTS.map((s) => this.slotShell(L.human.id, s)).join('')}</div>
      </div>
      <div class="others">${L.players.filter((p) => !p.isHuman).map((p) => `
        <div class="pcard joining" id="card-${p.id}" data-pid="${p.id}">
          <div class="shield">IMM</div>
          <div class="ava"><img src="${CW.Art.bust(p.look, null, null, 64, '#4b3a57')}"></div>
          <div class="who"><span class="pn">${esc(p.name)}</span><span class="pl">LV ${p.level}</span><span class="persona">${CW.BOT_PERSONALITIES[p.personality].label}</span></div>
          <div class="slots">${SLOTS.map((s) => this.slotShell(p.id, s)).join('')}</div>
          <div class="status"></div>
        </div>`).join('')}</div>
      <div class="crowd"><canvas width="1080" height="408"></canvas><div class="feed"></div></div>
      <div class="actionbar"></div>
      <div class="banner-layer"></div>`;
    this.bannerHost = $('.banner-layer', this.root);
    this.canvas = $('.crowd canvas', this.root);
    this.ctx = this.canvas.getContext('2d');
    for (const p of L.players) {
      this.disp[p.id] = {};
      for (const s of SLOTS) this.disp[p.id][s] = { uid: null, rarity: null, cracks: 0, start: 0, end: 0, spinning: false, next: 0, teased: false, hold: false };
      this.actors[p.id] = this.makeActor(p);
    }
    this.root.onclick = (e) => this.onClick(e);
    this.renderPot(true);
  };

  LobbyUI.slotShell = (pid, s) => `<div class="slot empty-slot" data-pid="${pid}" data-slot="${s}"><span class="slot-lbl">${UI.slotLabel[s]}</span><div class="art"><img alt="" style="visibility:hidden"></div><div class="txt"><span class="rtag"></span><span class="nm"><span class="empty">?</span></span><span class="stat"></span></div><span class="pips"></span></div>`;
  LobbyUI.slotEl = function (pid, slot) { return this.root.querySelector(`.slot[data-pid="${pid}"][data-slot="${slot}"]`); };
  LobbyUI.cardEl = function (pid) { return this.root.querySelector('#card-' + pid); };

  LobbyUI.setSlotFinal = function (el, item) {
    const cr = item.cracks ? ` crack-${Math.min(3, item.cracks)}` : '';
    const keep = ['tg-ok', 'tg-no'].filter((c) => el.classList.contains(c));
    el.className = `slot r-${item.rarity}${cr}${item.protected ? ' warded' : ''} ${keep.join(' ')}`;
    const img = el.querySelector('img');
    img.src = UI.artFor(item, 72); img.style.visibility = 'visible';
    el.querySelector('.rtag').textContent = CW.RARITY[item.rarity].name + (item.reforgedFrom ? ' · REFORGED' : '');
    el.querySelector('.nm').textContent = item.slot === 'hero' ? `${CW.CLASSES[item.classId].name}` : item.name;
    el.querySelector('.stat').textContent = CW.itemStatLines(item)[0] || '';
    el.querySelector('.pips').innerHTML = '<b></b>'.repeat(CW.RARITY[item.rarity].pips);
    el.title = `${CW.itemLabel(item)}${item.slot === 'hero' ? ' — ' + item.name : ''}\n${CW.itemStatLines(item).join('\n')}`;
    // hero slot on your card shows the variant name (Chaos Lord etc.)
    if (item.slot === 'hero') {
      el.querySelector('.nm').textContent = item.name;
      if (el.closest('.you')) el.querySelector('.rtag').textContent = `${CW.RARITY[item.rarity].name} · ${CW.CLASSES[item.classId].name}`;
    }
  };

  // ------------------------------------------------------------ crowd actors
  LobbyUI.makeActor = function (p) {
    const i = p.idx;
    return { pid: p.id, x: 270 + (Math.random() - 0.5) * 20, y: 112, tx: 60 + ((i * 61) % 420), ty: 148 + (i % 3) * 18, face: 1, emote: null, emoteStart: 0, emoteUntil: 0, look: 0, lookAt: null, bubble: null, pause: 1 + Math.random() * 2, seed: i * 1.7, visible: p.isHuman, human: p.isHuman };
  };

  // ------------------------------------------------------------ events
  LobbyUI.handle = function (ev) {
    const L = this.lobby;
    const p = ev.pid ? L.get(ev.pid) : null;
    const human = p && p.isHuman;
    switch (ev.type) {
      case 'join': {
        const c = this.cardEl(ev.pid); if (c) c.classList.remove('joining');
        this.actors[ev.pid].visible = true;
        CW.Sfx.play('pop');
        break;
      }
      case 'phase':
        if (ev.phase === 'rolling') {
          UI.slam(this.root, `ROLL!<small>EVERYONE SPINS AT ONCE · ${L.biome.name}</small>`, '', 1600);
          if (this._tutorial) this.calloutStep(0);
        }
        if (ev.phase === 'locked') {
          this.cancelTarget();
          if (UI.modalOpen && !this._humanSteal) UI.closeModal();
          this.clearCallouts();
          this.root.classList.add('is-locked');
          UI.slam(this.root, 'LOADOUTS LOCKED<small>CHECK THE LOBBY. THEN CONTINUE.</small>', 'gold', 2200);
          CW.Sfx.play('countdown', { final: true });
        }
        if (ev.phase === 'vote') {
          this.root.classList.remove('is-locked');
          this.votePanel = UI.VotePanel({ host: this.root, title: 'RAID BOON VOTE', sub: 'PICK ONE. MOST VOTES WINS. EVERYONE GETS IT.', options: L.voteOptions, lookOf: (id) => L.get(id).look, onVote: (b) => L.humanVote(b) });
        }
        if (ev.phase === 'chaos') {
          this.clearCallouts();
          UI.slam(this.root, `CHAOS PHASE<small>REROLL · SHUFFLE · STEAL${L.mode.grief ? ' · GRIEF' : ''} · BOOST</small>`, 'gold', 2000);
          CW.Sfx.play('chaosRaid');
          UI.quake();
          if (this._tutorial) this.chaosCallouts();
        }
        if (ev.phase === 'launch') {
          if (this.votePanel) { const vp = this.votePanel; setTimeout(() => vp.close(), 300); this.votePanel = null; }
          this.cancelTarget();
          if (UI.modalOpen && !this._humanSteal) UI.closeModal();
          this.clearCallouts();
          this.countdownEl = UI.el(`<div class="countdown"><div><div class="cd-t">ENTERING</div><div class="cd-b">${L.biome.name}</div><div class="cd-n">3</div><div class="cd-t">RAID POT ${CW.potLabel(L.potX100)} · ${esc(CW.raidMods(L.potX100).label)}</div></div></div>`);
          this.root.appendChild(this.countdownEl);
        }
        this._abSig = '';
        break;
      case 'spin': {
        const d = this.disp[ev.pid][ev.slot];
        Object.assign(d, { start: ev.t + ev.delay, end: ev.t + ev.delay + ev.dur, fakeout: ev.fakeout, cause: ev.cause, item: ev.item, teased: false, next: 0, hold: false });
        if (human && ev.cause === 'pull') { this.clearCallouts(); CW.Sfx.play('click'); }
        break;
      }
      case 'reveal': this.onReveal(ev, p); break;
      case 'bigPull':
        if (!human) {
          UI.banner(this.bannerHost, { top: `${esc(p.name)} PULLED`, main: `${CW.RARITY[ev.item.rarity].name} ${esc(ev.item.slot === 'hero' ? ev.item.name : ev.item.name)}`.toUpperCase(), color: CW.RARITY[ev.item.rarity].color, ms: 1700, priority: true });
        } else {
          UI.banner(this.bannerHost, { top: 'YOU PULLED', main: `${CW.RARITY[ev.item.rarity].name} ${esc(ev.item.name)}`.toUpperCase(), sub: 'THE WHOLE LOBBY SAW THAT', color: CW.RARITY[ev.item.rarity].color, ms: 2000, priority: true });
        }
        break;
      case 'autoPull': UI.toast('TOO SLOW — AUTO-SPUN'); break;
      case 'roundStart': {
        CW.Sfx.play('stealTry');
        for (const c of $$('.still-spinning', this.root)) c.classList.remove('still-spinning');
        UI.banner(this.bannerHost, { top: 'ROUND ' + (ev.round + 1) + ' / 3', main: `EVERYONE'S ${['HERO', 'WEAPON', 'GEAR'][ev.round]} IS SPINNING`, color: '#c6ff2e', ms: 1100, priority: true, key: 'round' });
        break;
      }
      case 'lastSpinning':
        for (const pid of ev.pids) { const c = this.cardEl(pid); c.classList.add('still-spinning'); }
        CW.Sfx.play('tease');
        this.feedSys(ev.pids.length > 1 ? `${ev.pids.length} reels still spinning…` : `${L.get(ev.pids[0]).name}'s reel is STILL spinning…`);
        break;
      case 'protect': {
        const el = this.slotEl(ev.pid, ev.slot);
        el.classList.add('warded'); UI.restartAnim(el, 'rv-legendary'); UI.burst(el, 'legendary', 14, 60);
        CW.Sfx.play('legendary');
        UI.banner(this.bannerHost, { top: `${esc(p.name)} WARDED`, main: `${CW.RARITY[ev.item.rarity].name} ${esc(ev.item.name)}`.toUpperCase(), sub: `SPENT ALL ${ev.spent} COINS · LOCKED IN`, color: '#ffe14d', ms: 1600, priority: human });
        this.feedSys(`${p.name} protected ${ev.item.name} (spent ${ev.spent})`);
        break;
      }
      case 'wardBroken': this.onWardBroken(ev.aid, ev.tid, ev.item, 'CURSED'); break;
      case 'griefBlocked': {
        const el = this.slotEl(ev.tid, ev.slot); el.classList.remove('busy'); UI.restartAnim(el, 'rv-rare');
        UI.banner(this.bannerHost, { top: `${esc(L.get(ev.aid).name)}'S CURSE`, main: 'WARD HELD', sub: `${esc(L.get(ev.tid).name)} KEEPS THE ${esc(ev.item.name).toUpperCase()}`, color: '#ffe14d', ms: 1300, priority: L.get(ev.tid).isHuman || L.get(ev.aid).isHuman });
        CW.Sfx.play('stealWin');
        break;
      }
      case 'voteCast': {
        const c = this.cardEl(ev.voter); if (!c) break;
        let chip = c.querySelector('.vote-chip'); if (!chip) { chip = UI.el('<span class="vote-chip"></span>'); c.appendChild(chip); }
        const d = CW.BOON_OPTIONS[ev.boon]; chip.innerHTML = `<img src="${CW.Art.icon(d.icon, 'legendary', 40)}">`; chip.style.setProperty('--bc', d.color); UI.restartAnim(chip, 'bump');
        CW.Sfx.play('pop', { gap: 0.05 });
        if (!L.get(ev.voter).isHuman && Math.random() < 0.15) L.say(L.get(ev.voter), 'vote');
        break;
      }
      case 'voteTie': UI.banner(this.bannerHost, { top: 'TIED VOTE', main: 'TIE-BREAK SPIN', color: '#ffbf1a', ms: 1100, priority: true }); CW.Sfx.play('tease'); break;
      case 'voteEnd': {
        const d = CW.BOON_OPTIONS[ev.boon];
        CW.Sfx.play('legendary');
        UI.banner(this.bannerHost, { top: 'BOON SELECTED', main: d.name, sub: 'ALL RAIDERS: ' + d.desc, color: d.color, ms: 2000, priority: true });
        break;
      }
      case 'reroll': {
        const el = this.slotEl(ev.pid, ev.slot);
        UI.burst(el, ev.old.rarity, 10, 50);
        UI.restartAnim(el, 'cursed-now');
        if (human) CW.Sfx.play('stealTry');
        this.feedSys(`${p.name} rerolled ${CW.itemLabel(ev.old)}`);
        break;
      }
      case 'reforge': if (human) UI.toast(`WEAPON REFORGED → ${ev.item.name.toUpperCase()}`, true); break;
      case 'shuffle':
        this.feedSys(`${p.name} SHUFFLED EVERYTHING`);
        UI.banner(this.bannerHost, { top: esc(p.name), main: 'SHUFFLED EVERYTHING', sub: 'ALL IN', color: '#c45cff', ms: 1300, priority: human });
        for (const s of SLOTS) { const el = this.slotEl(ev.pid, s); UI.burst(el, ev.old[s].rarity, 8, 40); }
        CW.Sfx.play('epic');
        break;
      case 'stealStart': this.onStealStart(ev); break;
      case 'stealResult': this.onStealResult(ev); break;
      case 'griefStart': {
        const a = this.cardEl(ev.aid).querySelector('.ava'), t = this.slotEl(ev.tid, ev.slot);
        UI.beam(a, t);
        t.classList.add('busy');
        CW.Sfx.play('curse');
        if (L.get(ev.tid).isHuman) UI.banner(this.bannerHost, { top: `${esc(L.get(ev.aid).name)} IS CURSING`, main: `YOUR ${esc(ev.item.slot === 'hero' ? 'HERO' : ev.item.name).toUpperCase()}`, color: '#ff5a7a', ms: 1000, priority: true });
        break;
      }
      case 'grief': this.onGrief(ev); break;
      case 'boost': this.onBoost(ev, p); break;
      case 'chaosTax': {
        const m = $('.pot-label .mult', this.root);
        UI.restartAnim(m, 'bump');
        this.feedSys(`CHAOS TAX ${CW.potLabel(ev.from)} → ${CW.potLabel(ev.to)} (${ev.reason})`);
        break;
      }
      case 'potTier': this.onPotTier(ev); break;
      case 'chat': this.say(ev.pid, ev.text); break;
      case 'emote': {
        const a = this.actors[ev.pid];
        if (!a) break;
        if (ev.emote === 'look') { a.lookAt = ev.at; a.lookUntil = performance.now() + 1500; }
        else { a.emote = ev.emote; a.emoteStart = performance.now(); a.emoteUntil = a.emoteStart + 1700; if (ev.at) a.lookAt = ev.at; a.lookUntil = a.emoteUntil; }
        break;
      }
      case 'denied':
        if (human) { UI.toast(ev.reason); CW.Sfx.play('deny'); }
        break;
      case 'launchNow':
        if (this.countdownEl) this.countdownEl.remove();
        if (this.opts.onLaunch) this.opts.onLaunch();
        break;
    }
  };

  LobbyUI.onReveal = function (ev, p) {
    const L = this.lobby;
    const d = this.disp[ev.pid][ev.slot];
    const el = this.slotEl(ev.pid, ev.slot);
    const item = p.loadout[ev.slot];
    if (!item) return;
    d.spinning = false;
    d.uid = item.uid; d.rarity = item.rarity; d.cracks = item.cracks;
    this.setSlotFinal(el, item);
    const r = CW.RARITY[item.rarity];
    UI.restartAnim(el, 'rv-' + item.rarity);
    const human = p.isHuman;
    if (human || r.tier >= 2) CW.Sfx.play(r.sfx);
    else CW.Sfx.play('reveal', { gap: 0.1 });
    if (r.tier >= 1) UI.burst(el, item.rarity, 6 + r.tier * 5, 30 + r.tier * 18);
    if (r.tier >= 3) {
      UI.rays(el, r.tier === 4);
      const card = this.cardEl(ev.pid);
      UI.restartAnim(card, 'flash-gold');
      UI.flash(r.tier === 4 ? 'rgba(255,47,160,0.5)' : 'rgba(255,191,26,0.45)');
      if (r.tier === 4) UI.quake();
    }
    if (human && ev.cause === 'pull') {
      if (r.tier === 0 && ev.slot === 'gear') UI.slam(this.root, 'Welp.', 'red', 1300);
      else if (r.tier === 0 && Math.random() < 0.5) UI.toast(['UNLUCKY.', 'COMMON. COOL.', 'IT HAPPENS.'][Math.floor(Math.random() * 3)]);
      if (this._tutorial && p.pullsDone < 3) this._nextCallout = p.pullsDone;
    }
    if (ev.cause !== 'pull' && human) {
      const old = ev.cause === 'reroll' ? (L.log.slice().reverse().find((e) => e.type === 'reroll' && e.pid === p.id && e.slot === ev.slot) || {}).old : null;
      if (old) {
        const delta = CW.tierOf(item.rarity) - CW.tierOf(old.rarity);
        UI.toast(delta > 0 ? 'UPGRADE!' : delta < 0 ? 'IT GOT WORSE.' : 'SIDEWAYS.', delta > 0);
      }
    }
  };

  LobbyUI.onStealStart = function (ev) {
    const L = this.lobby;
    const a = L.get(ev.aid), t = L.get(ev.tid);
    const tEl = this.slotEl(ev.tid, ev.slot), aEl = this.slotEl(ev.aid, ev.slot);
    tEl.classList.add('busy'); aEl.classList.add('busy');
    this.disp[ev.aid][ev.slot].hold = this.disp[ev.tid][ev.slot].hold = true;
    if (a.isHuman) this.stealDial(ev);
    else {
      CW.Sfx.play('stealTry', { gap: 0.2 });
      if (t.isHuman) UI.banner(this.bannerHost, { top: `${esc(a.name)} IS STEALING`, main: `YOUR ${esc(ev.item.name).toUpperCase()}`, sub: `${Math.round(ev.chance * 100)}% CHANCE…`, color: '#ff3b3b', ms: ev.dur * 1000 * (CW.App.fast ? 2 : 0.9), priority: true });
      else if (CW.tierOf(ev.item.rarity) >= 1) this.feedSys(`${a.name} is trying to steal ${t.name}'s ${ev.item.name} (${Math.round(ev.chance * 100)}%)`);
    }
  };

  LobbyUI.onStealResult = function (ev) {
    const L = this.lobby;
    const a = L.get(ev.aid), t = L.get(ev.tid);
    const tEl = this.slotEl(ev.tid, ev.slot), aEl = this.slotEl(ev.aid, ev.slot);
    tEl.classList.remove('busy'); aEl.classList.remove('busy');
    const release = () => { this.disp[ev.aid][ev.slot].hold = this.disp[ev.tid][ev.slot].hold = false; };
    const finishHuman = () => { if (this._humanSteal && this._humanSteal.ev === ev.t) { this._humanSteal = null; setTimeout(() => UI.closeModal(), CW.App.fast ? 250 : 900); } };
    if (ev.success) {
      const delay = a.isHuman ? (CW.App.fast ? 300 : 1000) : 0;
      setTimeout(() => {
        Promise.all([UI.fly(tEl, aEl, ev.original, { chain: true }), UI.fly(aEl, tEl, ev.gave, { delay: 120 })]).then(() => {
          release();
          UI.restartAnim(aEl, 'rv-' + ev.item.rarity);
          UI.burst(aEl, ev.item.rarity, 14, 60);
        });
      }, delay);
      if (a.isHuman || t.isHuman) CW.Sfx.play('stealWin');
      else CW.Sfx.play('coin');
      if (ev.wardBroken) this.onWardBroken(ev.aid, ev.tid, ev.original, 'STOLE');
      else UI.banner(this.bannerHost, { top: `${esc(a.name)} STOLE`, main: `${esc(t.name)}'S ${esc(ev.original.name)}`.toUpperCase(), sub: `${CW.RARITY[ev.original.rarity].name} · ${Math.round(ev.chance * 100)}% ODDS`, color: a.isHuman ? '#c6ff2e' : t.isHuman ? '#ff3b3b' : CW.RARITY[ev.original.rarity].color, ms: 1500, priority: a.isHuman || t.isHuman });
      if (t.isHuman) { UI.restartAnim(this.cardEl(t.id), 'flash-red'); UI.quake(); }
      this.feedSys(`${a.name} stole ${poss(t)} ${ev.original.name}`);
    } else {
      release();
      if (a.isHuman || t.isHuman) CW.Sfx.play(a.isHuman ? 'stealFail' : 'stealWin');
      UI.restartAnim(this.cardEl(a.id), 'flash-red');
      UI.banner(this.bannerHost, { top: `${esc(a.name)} TRIED TO ROB ${esc(t.name)}`, main: 'BUSTED', color: '#ff3b3b', ms: 1100, priority: a.isHuman || t.isHuman });
      this.feedSys(`${a.name} got BUSTED stealing from ${t.name}`);
    }
    finishHuman();
  };

  LobbyUI.onWardBroken = function (aid, tid, item, verb) {
    const L = this.lobby, a = L.get(aid), t = L.get(tid);
    UI.slam(this.root, `WARD BROKEN!<small>${esc(a.name)} ${verb} ${t.isHuman ? 'YOUR' : esc(t.name) + "'S"} ${CW.RARITY[item.rarity].name} ${esc(item.name).toUpperCase()}</small>`, 'red', 2600);
    UI.flash('rgba(255,191,26,0.55)'); UI.quake(); CW.Sfx.play('mythic');
    const card = this.cardEl(tid); UI.restartAnim(card, 'flash-red');
    this.feedSys(`WARD BROKEN — ${a.name} ${verb.toLowerCase()} ${poss(t)} ${item.name}`);
  };

  LobbyUI.onGrief = function (ev) {
    const L = this.lobby;
    const a = L.get(ev.aid), t = L.get(ev.tid);
    const el = this.slotEl(ev.tid, ev.slot);
    el.classList.remove('busy');
    const d = this.disp[ev.tid][ev.slot];
    d.uid = ev.item.uid; d.rarity = ev.item.rarity; d.cracks = ev.item.cracks;
    this.setSlotFinal(el, ev.item);
    UI.restartAnim(el, 'cursed-now');
    UI.burst(el, ev.from, 16, 60);
    CW.Sfx.play('grief');
    const nm = ev.item.slot === 'hero' ? CW.CLASSES[ev.item.classId].name : ev.item.name;
    UI.banner(this.bannerHost, {
      top: `${esc(a.name)} CURSED`,
      main: `${esc(t.name)}'S ${CW.RARITY[ev.from].name} ${esc(nm)}`.toUpperCase(),
      sub: `<span class="rtag r-${ev.from}">${CW.RARITY[ev.from].name}</span> <span class="dn">▼</span> <span class="rtag r-${ev.to}">${CW.RARITY[ev.to].name}</span>`,
      color: '#ff5a7a', ms: 1800, priority: a.isHuman || t.isHuman,
    });
    if (t.isHuman) { UI.restartAnim(this.cardEl(t.id), 'flash-red'); UI.quake(); UI.flash('rgba(255,40,80,0.35)'); }
    this.feedSys(`${a.name} cursed ${poss(t)} ${nm}: ${CW.RARITY[ev.from].name} → ${CW.RARITY[ev.to].name}`);
  };

  LobbyUI.onBoost = function (ev, p) {
    const card = this.cardEl(ev.pid);
    UI.coins(card.querySelector('.ava'), $('.pot-meter', this.root), 7);
    CW.Sfx.play('boost');
    setTimeout(() => this.renderPot(), 450);
    UI.banner(this.bannerHost, { top: `${esc(p.name)} JUICED THE RAID`, main: `${CW.potLabel(ev.from)} → ${CW.potLabel(ev.to)}`, sub: ev.to >= 170 ? 'MORE DANGER. MORE LOOT.' : '', color: '#ffbf1a', ms: 1200, priority: p.isHuman, key: 'boost' });
    this.feedSys(`${p.name} boosted the pot to ${CW.potLabel(ev.to)}`);
  };

  LobbyUI.onPotTier = function (ev) {
    this.renderPot();
    if (ev.mod.bossEnraged) {
      this.root.classList.add('chaos-raid');
      UI.slam(this.root, 'CHAOS RAID<small>BOSS ENRAGED · DOUBLE LOOT</small>', 'red', 2400);
      CW.Sfx.play('chaosRaid');
      UI.quake();
      UI.flash('rgba(255,30,60,0.5)');
    } else {
      UI.banner(this.bannerHost, { top: `RAID POT ${CW.potLabel(ev.mod.at)}`, main: ev.mod.label, sub: 'DANGER UP', color: '#ff3b3b', ms: 1400, priority: true });
    }
  };

  // ------------------------------------------------------------ steal dial (human attempts)
  LobbyUI.stealDial = function (ev) {
    const L = this.lobby;
    const t = L.get(ev.tid);
    const ch = ev.chance;
    const R = 140, cx = 160, cy = 160;
    const pt = (deg) => [cx + R * Math.cos((deg * Math.PI) / 180), cy - R * Math.sin((deg * Math.PI) / 180)];
    const winEnd = 180 - ch * 180;
    const [x1, y1] = pt(180), [x2, y2] = pt(winEnd);
    const large = 0; // span is ch*180° ≤ 180°
    UI.openModal(`
      <h2>STEALING…</h2>
      <div class="sub">${esc(t.name)}'S ${UI.itemTitle(ev.item)}</div>
      <div class="dial"><svg viewBox="0 0 320 170">
        <path d="M ${pt(180)[0]} ${pt(180)[1]} A ${R} ${R} 0 0 1 ${pt(0)[0]} ${pt(0)[1]}" fill="none" stroke="#140b17" stroke-width="34"/>
        <path d="M ${pt(180)[0]} ${pt(180)[1]} A ${R} ${R} 0 0 1 ${pt(0)[0]} ${pt(0)[1]}" fill="none" stroke="#7a1626" stroke-width="26"/>
        <path d="M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}" fill="none" stroke="#19c26b" stroke-width="26"/>
        <text x="${pt(180 - ch * 90)[0]}" y="${pt(180 - ch * 90)[1] + 5}" text-anchor="middle" font-family="CW Display" font-size="13" fill="#fff" stroke="#140b17" stroke-width="3" paint-order="stroke">${Math.round(ch * 100)}%</text>
        <g class="needle"><polygon points="${cx - 6},${cy} ${cx + 6},${cy} ${cx},${cy - R - 10}" fill="#f1e4c6" stroke="#140b17" stroke-width="3"/></g>
        <circle cx="${cx}" cy="${cy}" r="14" fill="#a259ff" stroke="#140b17" stroke-width="4"/>
      </svg></div>
      <div class="note">SUCCESS ZONE = GREEN. NO TAKE-BACKS.</div>`, 'danger');
    const modal = $('#overlay .modal');
    const needle = modal.querySelector('.needle');
    const final = 180 - ev.roll * 180;
    this._humanSteal = { ev: ev.t };
    CW.Sfx.play('stealTry');
    let lastSide = null;
    const step = () => {
      if (!UI.modalOpen || !needle.isConnected) return;
      const p = Math.min(1, (L.time - ev.t) / ev.dur);
      const wob = (1 - p) * (1 - p);
      let ang = final + wob * 160 * Math.sin(p * Math.PI * 7);
      ang = Math.max(2, Math.min(178, ang));
      needle.setAttribute('transform', `rotate(${90 - ang} ${cx} ${cy})`);
      const side = ang > winEnd;
      if (lastSide !== null && side !== lastSide) CW.Sfx.play('dialTick');
      lastSide = side;
      if (p < 1) requestAnimationFrame(step);
      else {
        const win = ev.success;
        modal.insertAdjacentHTML('beforeend', `<div class="stamp ${win ? 'win' : 'lose'}">${win ? 'SUCCESS' : 'BUSTED'}</div>`);
        if (win) UI.flash('rgba(198,255,46,0.35)'); else UI.quake();
      }
    };
    requestAnimationFrame(step);
  };

  // ------------------------------------------------------------ actions (human)
  LobbyUI.onClick = function (e) {
    CW.Sfx.unlock();
    const act = e.target.closest('[data-act]');
    if (act) return this.doAct(act.dataset.act, act);
    const slot = e.target.closest('.slot[data-pid]');
    if (slot) return this.onSlotTap(slot.dataset.pid, slot.dataset.slot);
  };

  LobbyUI.doAct = function (a, btn) {
    const L = this.lobby, h = L.human;
    switch (a) {
      case 'pull': if (!L.humanPull()) { if (btn) UI.restartAnim(btn, 'shake'); } break;
      case 'boost': {
        const r = L.boost(h);
        if (!r.ok && btn) UI.restartAnim(btn, 'shake');
        if (r.ok && this._tutorial && this._calloutStep >= 0) this.clearCallouts();
        break;
      }
      case 'reroll': case 'steal': case 'grief':
        if (L.phase !== 'chaos') return;
        this.target = this.target === a ? null : a;
        CW.Sfx.play('click');
        this._abSig = ''; this._tgSig = '';
        break;
      case 'shuffle': this.confirmShuffle(); break;
      case 'cancel': this.cancelTarget(); break;
      case 'protect': { const s = SLOTS.find((x) => L.protectCheck(h, x).ok); if (s) this.confirmProtect(s); break; }
      case 'continue': if (L.continueToRaid()) { CW.Sfx.play('transition'); this._abSig = ''; } break;
    }
  };
  LobbyUI.cancelTarget = function () { this.target = null; this._abSig = ''; this._tgSig = ''; };

  LobbyUI.onSlotTap = function (pid, slot) {
    const L = this.lobby;
    if (L.phase !== 'chaos') {
      const p = L.get(pid), it = p.loadout[slot];
      if (it && L.isRevealed(p, slot)) {
        if (L.phase === 'locked') return this.inspect(p, slot);
        UI.toast(`${CW.itemLabel(it)} — ${CW.itemStatLines(it).join(' · ')}`, true);
      }
      return;
    }
    const me = L.human;
    if (pid === me.id) {
      if (this.target === 'steal' || this.target === 'grief') { UI.toast('PICK SOMEONE ELSE'); return; }
      if (this.target === 'reroll') return this.confirmReroll(slot);
      return this.ownSheet(slot);
    }
    const t = L.get(pid);
    if (this.target === 'steal') return this.confirmSteal(t, slot);
    if (this.target === 'grief') return this.confirmGrief(t, slot);
    if (this.target === 'reroll') { UI.toast('PICK ONE OF YOUR SLOTS'); return; }
    this.actionSheet(t, slot);
  };

  LobbyUI.actionSheet = function (t, slot) {
    const L = this.lobby, me = L.human, item = t.loadout[slot];
    if (!item || !L.isRevealed(t, slot)) return;
    const sc = L.stealCheck(me, t, slot);
    const gc = L.mode.grief ? L.griefCheck(me, t, slot) : null;
    const stealTxt = sc.ok ? `${Math.round(sc.chance * 100)}% · ${sc.costLabel}` : sc.reason;
    UI.openModal(`
      <h2>${UI.itemTitle(item)}</h2>
      <div class="sub">${esc(t.name)}'S ${UI.slotLabel[slot]} · ${CW.itemStatLines(item).join(' · ')}</div>
      <div class="big-art r-${item.rarity} slot"><img src="${UI.artFor(item, 96)}"></div>
      <div class="sheet-actions">
        <button class="btn ${sc.ok ? '' : 'off'}" data-m="steal">STEAL <small>${stealTxt}</small></button>
        ${gc ? `<button class="btn red ${gc.ok ? '' : 'off'}" data-m="grief">GRIEF <small>${gc.ok ? `${CW.RARITY[gc.from].name} ▼ ${CW.RARITY[gc.to].name} · ${gc.costLabel}` : gc.reason}</small></button>` : ''}
        <button class="btn dark" data-m="close">BACK</button>
      </div>`);
    $('#overlay .modal').onclick = (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      if (b.dataset.m === 'close') return UI.closeModal();
      UI.closeModal();
      if (b.dataset.m === 'steal') this.confirmSteal(t, slot);
      if (b.dataset.m === 'grief') this.confirmGrief(t, slot);
    };
  };

  // Your own item: reroll, or (Legendary+) PROTECT
  LobbyUI.ownSheet = function (slot) {
    const L = this.lobby, me = L.human, item = me.loadout[slot];
    if (!item || !L.isRevealed(me, slot)) return;
    const rc = L.rerollCheck(me, slot), pc = L.protectCheck(me, slot);
    const eligible = CW.PROTECT.eligible.includes(item.rarity);
    UI.openModal(`
      <h2>${UI.itemTitle(item)}</h2>
      <div class="sub">YOUR ${UI.slotLabel[slot]} · ${CW.itemStatLines(item).join(' · ')}${item.protected ? ' · <b style="color:#ffe14d">WARDED</b>' : ''}</div>
      <div class="big-art r-${item.rarity} slot${item.protected ? ' warded' : ''}"><img src="${UI.artFor(item, 96)}"></div>
      <div class="sheet-actions">
        <button class="btn blue ${rc.ok ? '' : 'off'}" data-m="reroll">REROLL <small>${rc.ok ? rc.cost + ' COINS' : rc.reason}</small></button>
        ${eligible ? `<button class="btn gold ${pc.ok ? '' : 'off'}" data-m="protect">PROTECT <small>${pc.ok ? 'ALL ' + pc.cost + ' COINS' : item.protected ? 'WARDED' : pc.reason}</small></button>` : ''}
        <button class="btn dark" data-m="close">BACK</button>
      </div>`);
    $('#overlay .modal').onclick = (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      if (b.dataset.m === 'close') return UI.closeModal();
      if (b.classList.contains('off')) { UI.restartAnim(b, 'shake'); CW.Sfx.play('deny'); return; }
      UI.closeModal();
      if (b.dataset.m === 'reroll') this.confirmReroll(slot);
      if (b.dataset.m === 'protect') this.confirmProtect(slot);
    };
  };

  LobbyUI.confirmProtect = function (slot) {
    const L = this.lobby, me = L.human, item = me.loadout[slot];
    const chk = L.protectCheck(me, slot);
    if (!chk.ok) { UI.toast(chk.reason); CW.Sfx.play('deny'); return; }
    const base = CW.STEAL_ODDS[item.rarity], warded = base * CW.PROTECTION_STEAL_MULTIPLIER;
    UI.openModal(`
      <h2>PROTECT ${UI.itemTitle(item)}?</h2>
      <div class="sub">SPEND <b style="color:#ffbf1a">ALL ${chk.cost} COINS</b> TO WARD THIS ITEM.</div>
      <div class="big-art slot r-${item.rarity} warded"><img src="${UI.artFor(item, 96)}"></div>
      <div class="kv"><span>STEAL CHANCE</span><b>${Math.round(base * 100)}% → ${Math.round(warded * 100)}%</b></div>
      ${L.mode.grief ? `<div class="kv"><span>CURSES BREAK THE WARD</span><b>${Math.round(CW.PROTECT.griefPassChance * 100)}% OF THE TIME</b></div>` : ''}
      <div class="warn">YOU'RE LOCKING IN: NO MORE REROLL, SHUFFLE, STEAL, GRIEF OR BOOST.</div>
      <div class="note">NOT ABSOLUTE. SOMEONE CAN STILL GET LUCKY.</div>
      <div class="row"><button class="btn dark" data-m="no">KEEP GAMBLING</button><button class="btn gold" data-m="yes">PROTECT</button></div>`);
    this.bindConfirm(() => { L.protect(me, slot); this.cancelTarget(); this.clearCallouts(); });
  };

  // LOADOUTS LOCKED: calm inspection of anyone's item
  LobbyUI.inspect = function (p, slot) {
    const item = p.loadout[slot];
    UI.openModal(`
      <h2>${UI.itemTitle(item)}</h2>
      <div class="sub">${esc(p.name)} · ${UI.slotLabel[slot]}${item.slot === 'hero' ? ' · ' + esc(item.name).toUpperCase() : ''}${item.protected ? ' · <b style="color:#ffe14d">WARDED</b>' : ''}${item.cracks ? ' · CURSED ×' + item.cracks : ''}${item.reforgedFrom ? ' · REFORGED' : ''}</div>
      <div class="big-art r-${item.rarity} slot${item.protected ? ' warded' : ''}"><img src="${UI.artFor(item, 96)}"></div>
      ${CW.itemStatLines(item).map((l) => `<div class="kv"><span>${l}</span></div>`).join('')}
      <div class="row"><button class="btn" data-m="no">OK</button></div>`);
    $('#overlay .modal').onclick = (e) => { if (e.target.closest('[data-m]')) UI.closeModal(); };
  };

  LobbyUI.confirmReroll = function (slot) {
    const L = this.lobby, me = L.human, item = me.loadout[slot];
    const chk = L.rerollCheck(me, slot);
    if (!chk.ok) { UI.toast(chk.reason); CW.Sfx.play('deny'); return; }
    UI.openModal(`
      <h2>REROLL YOUR ${UI.slotLabel[slot]}?</h2>
      <div class="sub">${UI.itemTitle(item)}</div>
      <div class="big-art slot r-${item.rarity}"><img src="${UI.artFor(item, 96)}"></div>
      <div class="kv"><span>COST</span><b>${chk.cost} COINS</b></div>
      ${slot === 'hero' ? '<div class="note">NEW CLASS = YOUR WEAPON GETS REFORGED TO MATCH (SAME RARITY)</div>' : ''}
      <div class="warn">COULD BE BETTER. COULD BE WORSE.</div>
      <div class="row"><button class="btn dark" data-m="no">CANCEL</button><button class="btn" data-m="yes">REROLL</button></div>`);
    this.bindConfirm(() => { L.reroll(me, slot); this.cancelTarget(); });
  };

  LobbyUI.confirmShuffle = function () {
    const L = this.lobby, me = L.human;
    if (L.phase !== 'chaos') return;
    const chk = L.shuffleCheck(me);
    if (!chk.ok) { UI.toast(chk.reason); CW.Sfx.play('deny'); return; }
    UI.openModal(`
      <h2>SHUFFLE EVERYTHING?</h2>
      <div class="sub">CURRENT</div>
      <div class="mini-load">${SLOTS.map((s) => UI.slotEl(me.loadout[s])).join('')}</div>
      <div class="warn">POTENTIALLY LOSE IT ALL.</div>
      <div class="kv"><span>COST</span><b>1 CHAOS TOKEN</b></div>
      <div class="row"><button class="btn dark" data-m="no">CANCEL</button><button class="btn purple" data-m="yes">SHUFFLE</button></div>`, 'danger');
    this.bindConfirm(() => { L.shuffle(me); this.cancelTarget(); });
  };

  LobbyUI.confirmSteal = function (t, slot) {
    const L = this.lobby, me = L.human, item = t.loadout[slot];
    if (!item) return;
    const chk = L.stealCheck(me, t, slot);
    if (!chk.ok) {
      if (chk.locked && L.mode.grief) {
        const g = L.griefCheck(me, t, slot);
        UI.openModal(`
          <h2>BOLTED DOWN</h2>
          <div class="sub">${UI.itemTitle(item)} CAN'T BE STOLEN IN GRIEF RAID.</div>
          <div class="big-art slot r-${item.rarity}"><img src="${UI.artFor(item, 96)}"></div>
          <div class="tier-shift">CAN'T TAKE IT? <span style="color:#ff5a7a">RUIN IT.</span></div>
          <div class="row"><button class="btn dark" data-m="no">FINE</button><button class="btn red ${g.ok ? '' : 'off'}" data-m="yes">CURSE IT<small>${g.ok ? g.costLabel : g.reason}</small></button></div>`, 'grief');
        this.bindConfirm(() => this.confirmGrief(t, slot), true);
        return;
      }
      UI.toast(chk.reason); CW.Sfx.play('deny'); return;
    }
    const mine = me.loadout[slot];
    UI.openModal(`
      <h2>STEAL ${UI.itemTitle(item)}?</h2>
      <div class="sub">FROM ${esc(t.name)}</div>
      <div class="big-art slot r-${item.rarity}"><img src="${UI.artFor(item, 96)}"></div>
      <div class="kv"><span>SUCCESS CHANCE${chk.warded ? ' (WARDED)' : ''}</span><b class="${chk.chance < 0.3 ? 'bad' : ''}">${chk.warded ? `<s style="opacity:.6">${Math.round(chk.baseChance * 100)}%</s> ` : ''}${Math.round(chk.chance * 100)}%</b></div>
      <div class="chance-bar"><i style="width:${chk.chance * 100}%"></i><span>${Math.round(chk.chance * 100)}%</span></div>
      <div class="kv"><span>COST</span><b>${chk.costLabel}</b></div>
      <div class="note">IF IT WORKS, THEY GET YOUR ${esc(CW.itemLabel(mine))}${slot === 'weapon' && item.classId !== me.loadout.hero.classId ? ' · IT GETS REFORGED FOR YOUR CLASS' : ''}. IF NOT, COST IS GONE.</div>
      <div class="row"><button class="btn dark" data-m="no">CANCEL</button><button class="btn" data-m="yes">TRY IT</button></div>`, 'danger');
    this.bindConfirm(() => { this.cancelTarget(); L.steal(me, t, slot); }, true);
  };

  LobbyUI.confirmGrief = function (t, slot) {
    const L = this.lobby, me = L.human, item = t.loadout[slot];
    if (!item) return;
    const chk = L.griefCheck(me, t, slot);
    if (!chk.ok) { UI.toast(chk.reason + (chk.shield ? ` (${Math.ceil(chk.shield / L.k)}s)` : '')); CW.Sfx.play('deny'); return; }
    const nm = item.slot === 'hero' ? CW.CLASSES[item.classId].name : item.name;
    UI.openModal(`
      <h2>CURSE ${esc(t.name)}'S ${esc(nm).toUpperCase()}?</h2>
      <div class="sub">CAN'T TAKE IT? RUIN IT.</div>
      <div class="big-art slot r-${item.rarity}"><img src="${UI.artFor(item, 96)}"></div>
      <div class="tier-shift"><span class="rtag r-${chk.from}">${CW.RARITY[chk.from].name}</span><br><span style="color:#ff5a7a">▼</span><br><span class="rtag r-${chk.to}">${CW.RARITY[chk.to].name}</span></div>
      <div class="kv"><span>COST</span><b>${chk.costLabel}</b></div>
      <div class="kv"><span>CURSES LEFT</span><b>${chk.left} / ${CW.GRIEF_RULES.maxPerPlayer}</b></div>
      <div class="note">THEY GET ${CW.GRIEF_RULES.immunitySec}s IMMUNITY AFTER. EVERYONE SEES IT WAS YOU.</div>
      <div class="row"><button class="btn dark" data-m="no">CANCEL</button><button class="btn red" data-m="yes">CURSE IT</button></div>`, 'grief');
    this.bindConfirm(() => { this.cancelTarget(); L.grief(me, t, slot); });
  };

  LobbyUI.bindConfirm = function (yes, keepOpen) {
    const m = $('#overlay .modal');
    this._confirmYes = () => { UI.closeModal(); yes(); };
    m.onclick = (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      if (b.dataset.m === 'no') { UI.closeModal(); CW.Sfx.play('click'); }
      if (b.dataset.m === 'yes') { if (b.classList.contains('off')) { UI.restartAnim(b, 'shake'); CW.Sfx.play('deny'); return; } this._confirmYes(); }
    };
  };

  LobbyUI.key = function (e) {
    const L = this.lobby;
    if (!L) return;
    const k = e.key.toLowerCase();
    if (UI.modalOpen) {
      if (k === 'escape' && !this._humanSteal) UI.closeModal();
      if ((k === 'enter' || k === ' ') && this._confirmYes && !this._humanSteal) { const y = $('#overlay [data-m="yes"]'); if (y && !y.classList.contains('off')) this._confirmYes(); }
      return;
    }
    if ((k === ' ' || k === 'enter') && L.phase === 'rolling') { e.preventDefault(); this.doAct('pull', $('.actionbar .pull', this.root)); }
    if ((k === ' ' || k === 'enter') && L.phase === 'locked') { e.preventDefault(); this.doAct('continue'); }
    if (L.phase === 'vote' && ['1', '2', '3'].includes(k)) L.humanVote(L.voteOptions[+k - 1]);
    if (k === 'p' && L.phase === 'chaos') { const s = SLOTS.find((x) => L.protectCheck(L.human, x).ok); if (s) this.confirmProtect(s); }
    if (L.phase === 'chaos' || L.phase === 'rolling') if (k === 'b') this.doAct('boost', $('[data-act="boost"]', this.root));
    if (L.phase !== 'chaos') return;
    if (k === '1' || k === '2' || k === '3') this.onSlotTap(L.human.id, SLOTS[+k - 1]);
    if (k === 'r') this.doAct('reroll');
    if (k === 's') this.doAct('steal');
    if (k === 'g' && L.mode.grief) this.doAct('grief');
    if (k === 'x') this.doAct('shuffle');
    if (k === 'escape') this.cancelTarget();
  };

  // ------------------------------------------------------------ tutorial callouts
  LobbyUI.clearCallouts = function () { clearTimeout(this._coT); if (!this.root) return; for (const c of $$(".callout", this.root)) c.remove(); };
  LobbyUI.callout = function (html, style, ms = 0) {
    const c = UI.el(`<div class="callout">${html}</div>`);
    Object.assign(c.style, style);
    this.root.appendChild(c);
    if (ms) setTimeout(() => c.remove(), ms);
    return c;
  };
  LobbyUI.calloutStep = function (n) {
    this.clearCallouts();
    this._calloutStep = n;
    const txt = ["SPIN EVERYONE'S HERO", 'NOW EVERYONE\'S WEAPON', 'LAST ONE — GEAR'][n];
    if (!txt) return;
    this.callout(`<span class="n">${n + 1}</span>${txt}`, { left: '50%', bottom: '92px', transform: 'translateX(-50%)' });
  };
  LobbyUI.chaosCallouts = function () {
    const k = CW.App.fast ? 0.4 : 1;
    const seq = [
      ['Bad roll? Reroll it.<small>Great roll next door? Steal it.</small>', { left: '24px', top: '296px' }],
      ...(this.lobby.mode.grief ? [["Can't take it? Ruin it.<small>Tap their item → GRIEF</small>", { right: '20px', top: '420px' }]] : []),
      ['More danger. More loot.<small>Boost the raid pot ↑</small>', { right: '14px', top: '138px' }],
    ];
    let i = 0;
    const next = () => {
      this.clearCallouts();
      if (i >= seq.length || this.lobby.phase !== 'chaos') return;
      const [h, st] = seq[i++];
      const c = this.callout(h, st);
      if (st.top === '138px') c.style.setProperty('--x', '0');
      this._coT = setTimeout(next, 3200 * k);
    };
    this._coT = setTimeout(next, 1700 * k);
  };

  // ------------------------------------------------------------ chat / feed
  LobbyUI.say = function (pid, text) {
    const p = this.lobby.get(pid);
    const a = this.actors[pid];
    if (a) a.bubble = { text, until: performance.now() + 2600 };
    this.pushFeed(`<b>${esc(p.name)}:</b> ${esc(text)}`);
  };
  LobbyUI.feedSys = function (text) { this.pushFeed(esc(text), 'sys'); };
  LobbyUI.pushFeed = function (html, cls = '') {
    const f = $('.feed', this.root);
    if (!f) return;
    f.insertAdjacentHTML('beforeend', `<div class="${cls}">${html}</div>`);
    while (f.children.length > 4) f.firstElementChild.remove();
    [...f.children].forEach((c, i) => c.classList.toggle('old', i < f.children.length - 2));
  };

  // ------------------------------------------------------------ per-frame
  LobbyUI.frame = function (dt) {
    const L = this.lobby;
    if (!L) return;
    for (const ev of L.drain()) { this.handle(ev); if (this.lobby !== L) return; }
    const now = L.time;
    // reels + slot sync
    for (const p of L.players) {
      for (const s of SLOTS) {
        const d = this.disp[p.id][s];
        const item = p.loadout[s];
        const el = this.slotEl(p.id, s);
        if (d.end && now >= d.start && now < d.end) {
          if (!d.spinning) { d.spinning = true; el.className = 'slot spinning'; el.querySelector('img').style.visibility = 'visible'; }
          if (now >= d.next) {
            const prog = (now - d.start) / (d.end - d.start);
            const reelItem = this.reelPick(p, s);
            const img = el.querySelector('img');
            img.src = reelItem;
            UI.restartAnim(el, 'spinning');
            CW.Sfx.play('tick', { quiet: !p.isHuman, pitch: prog * 400, gap: p.isHuman ? 0 : 0.06 });
            d.next = now + (0.05 + 0.3 * Math.pow(prog, 2.2)) * Math.sqrt(L.k);
            const teaseIt = d.item && (CW.tierOf(d.item.rarity) >= 3 || d.fakeout);
            if (teaseIt && prog > 0.5 && !d.teased) { d.teased = true; el.classList.add('tease'); CW.Sfx.play('tease'); }
            else if (d.teased) el.classList.add('tease');
          }
          continue;
        }
        if (d.spinning && now >= d.end) {
          // reveal event will finalize; failsafe if it was replaced
          if (item && (d.uid !== item.uid)) { d.spinning = false; }
        }
        if (!item || d.hold || d.spinning) continue;
        if (now < p.revealAt[s]) continue;
        if (d.uid !== item.uid || d.rarity !== item.rarity || d.cracks !== item.cracks) {
          d.uid = item.uid; d.rarity = item.rarity; d.cracks = item.cracks;
          this.setSlotFinal(el, item);
        }
        el.classList.toggle('busy', !!item._busy);
      }
      const card = this.cardEl(p.id);
      const st = card.querySelector('.status');
      if (st.textContent !== p.status) { st.textContent = p.status; st.className = 'status s-' + p.status.replace(/[^A-Z]/g, ''); }
      card.classList.toggle('shielded', p.shieldUntil > now);
      card.classList.toggle('guarded', p.guardUntil > now);
      card.classList.toggle('locked-in', !!p.locked);
      if (!SLOTS.some((x) => this.disp[p.id][x].spinning)) card.classList.remove('still-spinning');
      for (const sl of SLOTS) { const it = p.loadout[sl]; const el = this.slotEl(p.id, sl); if (it && !this.disp[p.id][sl].spinning && now >= p.revealAt[sl]) el.classList.toggle('warded', !!it.protected); }
      if (L.phase === 'locked' || L.phase === 'vote') {
        const pl = card.querySelector('.pl'); const txt = `LV ${p.level} · PWR ${CW.deriveStats(p.loadout).power}`;
        if (pl && pl.textContent !== txt) pl.textContent = txt;
      }
    }
    if (this.votePanel && L.vote) this.votePanel.update(L.vote, L.human.id);
    if (this._tutorial && this._nextCallout != null && L.canPull(L.human)) { this.calloutStep(this._nextCallout); this._nextCallout = null; }
    this.renderTop();
    this.renderPot();
    this.renderActionBar();
    this.renderTargets();
    this.drawCrowd(dt);
    if (this.countdownEl) {
      const n = Math.max(1, Math.ceil(L.phaseRemaining() / L.k - 0.5));
      if (n !== this._cdLast) { this._cdLast = n; const e = this.countdownEl.querySelector('.cd-n'); e.textContent = n; UI.restartAnim(e, 'pop'); CW.Sfx.play('countdown', { final: n === 1 }); }
    }
  };

  LobbyUI.reelPick = function (p, s) {
    const rs = CW.RARITY_ORDER;
    const r = rs[Math.floor(Math.random() * 4)];
    if (s === 'hero') return CW.Art.heroIcon(CW.CLASS_IDS[Math.floor(Math.random() * CW.CLASS_IDS.length)], r, 72);
    if (s === 'weapon') { const pool = CW.WEAPONS[(p.loadout.hero && p.loadout.hero.classId) || 'scrub'][r]; return CW.Art.icon(pool[Math.floor(Math.random() * pool.length)].kind, r, 72); }
    const g = CW.GEAR[r]; return CW.Art.icon(g[Math.floor(Math.random() * g.length)].kind, r, 72);
  };

  LobbyUI.renderTop = function () {
    const L = this.lobby;
    const t = $('.lb-timer', this.root);
    const remain = L.phaseRemaining() / L.k;
    let num = '--', lbl = 'JOINING';
    if (L.phase === 'rolling') { num = Math.ceil(remain); lbl = 'ROLLING'; }
    if (L.phase === 'rolling') { num = ['1/3', '2/3', '3/3'][Math.min(2, L.round)]; lbl = L.roundState === 'spinning' ? 'SPINNING' : 'ROUND'; }
    if (L.phase === 'chaos') { num = Math.ceil(remain); lbl = 'CHAOS'; }
    if (L.phase === 'locked') { num = '✓'; lbl = 'LOCKED'; }
    if (L.phase === 'vote') { num = Math.ceil(remain); lbl = 'VOTE'; }
    if (L.phase === 'launch' || L.phase === 'done') { num = 'GO'; lbl = 'ENTERING'; }
    const nEl = t.querySelector('.num'), lEl = t.querySelector('.lbl');
    if (nEl.textContent !== String(num)) nEl.textContent = num;
    if (lEl.textContent !== lbl) lEl.textContent = lbl;
    t.classList.toggle('chaos', L.phase === 'chaos');
    t.classList.toggle('urgent', L.phase === 'chaos' && remain <= 5);
    UI.updateWallet($('.lb-wallet', this.root), L.human.wallet);
    const pw = $('.you .pw', this.root);
    const h = L.human;
    if (CW.SLOTS.every((s) => L.isRevealed(h, s))) { const v = CW.deriveStats(h.loadout).power; if (pw.textContent !== String(v)) pw.textContent = v; }
  };

  LobbyUI.renderPot = function () {
    const L = this.lobby;
    const pot = L.potX100;
    if (this._potShown === pot) return;
    const prev = this._potShown;
    this._potShown = pot;
    const pct = ((pot - 100) / (CW.RAID_POT.cap - 100)) * 100;
    const fill = $('.pot-fill', this.root);
    fill.style.width = Math.max(3, pct) + '%';
    fill.classList.toggle('hot', pot >= 150 && pot < 200);
    fill.classList.toggle('chaos', pot >= 200);
    const m = $('.pot-label .mult', this.root);
    m.textContent = CW.potLabel(pot);
    if (prev !== undefined) UI.restartAnim(m, 'bump');
    for (const tk of $$('.pot-tick', this.root)) tk.classList.toggle('on', pot >= +tk.dataset.at);
    const next = CW.RAID_MODIFIERS.find((x) => x.at > pot);
    $('.pot-next', this.root).textContent = next ? `NEXT ${CW.potLabel(next.at)}: ${next.label}` : 'MAXED: CHAOS RAID';
    this.root.classList.toggle('pot-hot', pot >= 150);
    this.root.classList.toggle('chaos-raid', pot >= 200);
  };

  LobbyUI.renderActionBar = function () {
    const L = this.lobby, h = L.human;
    const ab = $('.actionbar', this.root);
    const canPull = L.canPull(h);
    const rc = L.rerollCost(h);
    const sc = CW.STEAL_COST;
    const stealPay = h.wallet.jack >= 1 ? '1 JACK' : `${sc.coinAlt}c`;
    const left = CW.GRIEF_RULES.maxPerPlayer - h.griefsUsed;
    const canProtect = SLOTS.some((x) => L.protectCheck(h, x).ok);
    const ready = L.players.filter((p) => p.ready).length;
    const sig = [L.phase, canPull, L.round, L.roundState, this.target, rc, stealPay, left, h.wallet.chaos, canProtect, h.locked, ready].join('|');
    // boost button
    const bb = $('[data-act="boost"]', this.root);
    const bok = L.boostCheck(h).ok;
    bb.classList.toggle('off', !bok);
    if (sig === this._abSig) return;
    this._abSig = sig;
    let html = '';
    if (L.phase === 'intro') html = '<div class="waiting">PLAYERS JOINING…</div>';
    else if (L.phase === 'rolling') {
      const what = ['HEROES', 'WEAPONS', 'GEAR'][Math.min(2, L.round)];
      if (canPull) html = `<button class="btn pull ready" data-act="pull">SPIN ${what}!<small>ALL 8 REELS AT ONCE · SPACE</small></button>`;
      else if (L.roundState === 'spinning') html = `<button class="btn pull off" data-act="pull">ROLLING…<small>WATCH THE LOBBY</small></button>`;
      else html = `<div class="waiting">${L.round >= 2 ? 'CHAOS INCOMING…' : 'NEXT ROUND…'}</div>`;
    } else if (L.phase === 'chaos' && h.locked) {
      html = `<div class="waiting" style="color:#ffe14d">WARDED · LOCKED IN — WATCH THE CHAOS</div>`;
    } else if (L.phase === 'locked') {
      html = `<button class="btn gold pull ready" data-act="continue">CONTINUE TO RAID<small>${ready}/7 RAIDERS READY · SPACE</small></button>`;
    } else if (L.phase === 'vote') {
      html = `<div class="waiting">VOTE FOR A RAID BOON ↑</div>`;
    } else if (L.phase === 'chaos') {
      if (this.target) {
        const lbl = { reroll: 'TAP ONE OF YOUR SLOTS', steal: 'TAP AN ITEM TO STEAL', grief: 'TAP AN ITEM TO CURSE' }[this.target];
        html = `<div class="waiting" style="color:#fff">${lbl}</div><button class="btn dark" data-act="cancel" style="flex:0 0 120px">CANCEL<small>ESC</small></button>`;
      } else {
        html = `<button class="btn blue" data-act="reroll">REROLL<small>${rc}c · 1 SLOT</small></button>
          <button class="btn purple ${h.wallet.chaos >= 1 ? '' : 'off'}" data-act="shuffle">SHUFFLE<small>◆ ${h.wallet.chaos} TOKEN</small></button>
          <button class="btn" data-act="steal">STEAL<small>${stealPay}</small></button>
          ${L.mode.grief ? `<button class="btn red ${left > 0 ? '' : 'off'}" data-act="grief">GRIEF<small>${left} LEFT</small></button>` : ''}
          ${canProtect ? `<button class="btn gold" data-act="protect">PROTECT<small>ALL COINS</small></button>` : ''}`;
      }
    } else html = '<div class="waiting">ENTERING THE DUNGEON…</div>';
    ab.innerHTML = html;
  };

  LobbyUI.renderTargets = function () {
    const L = this.lobby;
    const now = performance.now();
    const sig = this.target + '|' + L.phase;
    if (sig === this._tgSig && now - this._tgAt < 250) return;
    this._tgSig = sig; this._tgAt = now;
    this.root.classList.toggle('targeting', !!this.target);
    this.root.classList.toggle('tg-grief', this.target === 'grief');
    for (const b of $$('.tg-badge', this.root)) b.remove();
    for (const el of $$('.slot[data-pid]', this.root)) el.classList.remove('tg-ok', 'tg-no');
    if (!this.target || L.phase !== 'chaos') return;
    const me = L.human;
    for (const p of L.players) {
      for (const s of SLOTS) {
        const el = this.slotEl(p.id, s);
        let ok = false, badge = '', cls = '';
        if (this.target === 'reroll') { if (p === me) { const c = L.rerollCheck(me, s); ok = c.ok; badge = c.ok ? c.cost + 'c' : c.reason; } }
        else if (p !== me) {
          if (this.target === 'steal') {
            const c = L.stealCheck(me, p, s);
            ok = c.ok;
            badge = c.ok ? Math.round(c.chance * 100) + '%' : (s === 'hero' ? '' : c.locked ? 'BOLTED' : c.reason === 'ON GUARD' ? 'GUARD' : c.reason.startsWith('NEED') ? Math.round((c.chance || 0) * 100) + '%' : '');
            if (c.locked && L.mode.grief && L.griefCheck(me, p, s).ok) { badge = 'BOLTED → GRIEF?'; ok = true; cls = 'grief'; }
          } else {
            const c = L.griefCheck(me, p, s);
            ok = c.ok; cls = 'grief';
            badge = c.ok ? (c.cost.token ? '1 TOKEN' : c.cost.coins + 'c') : c.reason === 'SHIELDED' ? 'IMMUNE' : c.reason === 'ALREADY COMMON' ? '' : '';
          }
        }
        el.classList.add(ok ? 'tg-ok' : 'tg-no');
        if (badge) el.insertAdjacentHTML('beforeend', `<span class="tg-badge ${ok ? cls : 'no'}">${badge}</span>`);
      }
    }
  };

  // ------------------------------------------------------------ crowd canvas
  LobbyUI.drawCrowd = function (dt) {
    const L = this.lobby, ctx = this.ctx;
    const t = performance.now() / 1000;
    const W = 540, H = 204;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const chaos = L.potX100 >= 200;
    // back wall + gate
    ctx.fillStyle = '#1a1220'; ctx.fillRect(0, 0, W, 120);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2;
    for (let y = 10; y < 120; y += 22) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); for (let x = (y / 22) % 2 ? 0 : 30; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 22); ctx.stroke(); } }
    // portal
    const glow = chaos ? '255,40,70' : L.mode.grief ? '255,70,120' : '150,80,255';
    const pg = ctx.createRadialGradient(270, 92, 10, 270, 92, 120);
    pg.addColorStop(0, `rgba(${glow},${0.85 + Math.sin(t * 3) * 0.1})`); pg.addColorStop(1, `rgba(${glow},0)`);
    ctx.fillStyle = pg; ctx.fillRect(140, 0, 260, 140);
    ctx.beginPath(); ctx.moveTo(214, 122); ctx.lineTo(214, 60); ctx.quadraticCurveTo(270, 6, 326, 60); ctx.lineTo(326, 122); ctx.closePath();
    ctx.fillStyle = chaos ? '#3a0010' : '#14061f'; ctx.fill();
    ctx.save(); ctx.clip();
    for (let i = 0; i < 6; i++) { ctx.strokeStyle = `rgba(${glow},${0.5 - i * 0.07})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(270, 84, 10 + ((t * 30 + i * 12) % 72), 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    ctx.lineWidth = 10; ctx.strokeStyle = '#140b17'; ctx.beginPath(); ctx.moveTo(214, 124); ctx.lineTo(214, 60); ctx.quadraticCurveTo(270, 6, 326, 60); ctx.lineTo(326, 124); ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = '#5b4a63'; ctx.stroke();
    for (let i = 0; i < 7; i++) { const a = Math.PI + (i / 6) * Math.PI; const r = 62; ctx.fillStyle = '#6d5a76'; ctx.strokeStyle = '#140b17'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.rect(270 + Math.cos(a) * r * 0.95 - 7, 70 + Math.sin(a) * r * 0.88 - 5, 14, 10); ctx.fill(); ctx.stroke(); }
    // skull keystone
    ctx.fillStyle = '#efe6cf'; ctx.beginPath(); ctx.ellipse(270, 18, 9, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = chaos ? '#ff2f2f' : '#140b17'; ctx.beginPath(); ctx.arc(266, 18, 2.4, 0, 7); ctx.arc(274, 18, 2.4, 0, 7); ctx.fill();
    // torches
    for (const tx of [40, 500]) {
      ctx.fillStyle = '#3a2d42'; ctx.strokeStyle = '#140b17'; ctx.lineWidth = 3; ctx.beginPath(); ctx.rect(tx - 4, 52, 8, 30); ctx.fill(); ctx.stroke();
      const fl = Math.sin(t * 17 + tx) * 2;
      const tg = ctx.createRadialGradient(tx, 44, 2, tx, 44, 60); tg.addColorStop(0, chaos ? 'rgba(255,60,60,0.55)' : 'rgba(255,150,50,0.5)'); tg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = tg; ctx.fillRect(tx - 60, -16, 120, 120);
      ctx.beginPath(); ctx.moveTo(tx - 8, 52); ctx.quadraticCurveTo(tx - 10 + fl, 34, tx + fl, 26); ctx.quadraticCurveTo(tx + 10, 38, tx + 8, 52); ctx.closePath();
      ctx.fillStyle = chaos ? '#ff3b3b' : '#ff9f1a'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe66d'; ctx.beginPath(); ctx.ellipse(tx + fl * 0.5, 44, 3, 6, 0, 0, 7); ctx.fill();
    }
    // floor
    const fg = ctx.createLinearGradient(0, 112, 0, H); fg.addColorStop(0, '#3a2d42'); fg.addColorStop(1, '#241b29');
    ctx.fillStyle = fg; ctx.fillRect(0, 118, W, H - 118);
    ctx.strokeStyle = '#140b17'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 120); ctx.lineTo(W, 120); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    for (let x = -200; x < W + 200; x += 54) { ctx.beginPath(); ctx.moveTo(270 + (x - 270) * 0.5, 120); ctx.lineTo(x, H); ctx.stroke(); }
    for (const y of [140, 166, 196]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // actors
    const nowMs = performance.now();
    const list = [];
    for (const p of L.players) {
      const a = this.actors[p.id];
      if (!a.visible) continue;
      a.pause -= dt;
      if (a.pause <= 0) {
        a.tx = Math.max(40, Math.min(500, a.x + (Math.random() - 0.5) * 160));
        a.ty = 140 + Math.random() * 50;
        a.pause = 1.5 + Math.random() * 3.5;
      }
      const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
      const speed = a.y < 125 ? 70 : 38;
      a.walking = d > 2;
      if (a.walking) { const st = Math.min(d, speed * dt); a.x += (dx / d) * st; a.y += (dy / d) * st; a.face = dx < 0 ? -1 : 1; }
      if (a.lookAt && nowMs < (a.lookUntil || 0)) { const o = this.actors[a.lookAt]; if (o && o !== a) { a.face = o.x < a.x ? -1 : 1; } }
      if (a.emote && nowMs > a.emoteUntil) a.emote = null;
      list.push({ a, p });
    }
    list.sort((u, v) => u.a.y - v.a.y);
    for (const { a, p } of list) {
      const l = p.loadout;
      const shown = (s) => l[s] && L.isRevealed(p, s);
      const pose = {
        t: t + a.seed, face: a.face, walk: a.walking && !a.emote, emote: a.emote, emoteT: a.emote ? (nowMs - a.emoteStart) / 1700 : 0, seed: a.seed,
        hat: shown('hero') ? CW.CLASSES[l.hero.classId].hat : null, heroRarity: shown('hero') ? l.hero.rarity : null,
        weaponKind: shown('weapon') ? l.weapon.kind : null, weaponRarity: shown('weapon') ? l.weapon.rarity : null,
        gearKind: shown('gear') ? l.gear.kind : null, gearRarity: shown('gear') ? l.gear.rarity : null,
      };
      const sc = a.human ? 0.78 : 0.62;
      const yScale = sc * (0.85 + ((a.y - 120) / 84) * 0.25);
      if (shown('hero') && CW.tierOf(l.hero.rarity) >= 3) { const g = ctx.createRadialGradient(a.x, a.y - 20, 4, a.x, a.y - 20, 50); g.addColorStop(0, 'rgba(255,191,26,0.45)'); g.addColorStop(1, 'rgba(255,191,26,0)'); ctx.fillStyle = g; ctx.fillRect(a.x - 50, a.y - 70, 100, 100); }
      if (pose.hat) {
        // once the hero is revealed, the player's Overlord becomes their Chaos World archetype (accent = their colour)
        const state = a.emote === 'cheer' ? 'cheer' : a.emote === 'sad' ? 'hurt' : 'idle';
        CW.ArtPack.drawCharacter(ctx, l.hero.classId, a.x, a.y, yScale * 0.86, { t: t + a.seed, face: a.face, walk: pose.walk, emote: a.emote, state, accent: p.look.body, rarity: l.hero.rarity, weaponKind: pose.weaponKind, weaponRarity: pose.weaponRarity, seed: a.seed });
      } else CW.Art.drawOverlord(ctx, a.x, a.y, yScale, p.look, pose);
      if (a.human) {
        ctx.font = '13px "CW Display", Impact'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#140b17';
        const yy = a.y - 96 * yScale - 8 + Math.sin(t * 5) * 2;
        ctx.strokeText('YOU', a.x, yy); ctx.fillStyle = '#c6ff2e'; ctx.fillText('YOU', a.x, yy);
        ctx.beginPath(); ctx.moveTo(a.x - 5, yy + 3); ctx.lineTo(a.x + 5, yy + 3); ctx.lineTo(a.x, yy + 9); ctx.closePath(); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
      }
    }
    // bubbles
    ctx.font = '13px "CW Bang", Impact, sans-serif';
    ctx.textAlign = 'center';
    for (const { a, p } of list) {
      if (!a.bubble || nowMs > a.bubble.until) continue;
      const text = a.bubble.text;
      const w = Math.min(200, ctx.measureText(text).width + 16);
      const sc = a.human ? 0.78 : 0.62;
      let bx = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, a.x)), by = Math.max(14, a.y - 92 * sc - 22);
      ctx.fillStyle = '#f1e4c6'; ctx.strokeStyle = '#140b17'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect(bx - w / 2, by - 12, w, 22, 6); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(a.x - 4, by + 10); ctx.lineTo(a.x, by + 18); ctx.lineTo(a.x + 5, by + 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#140b17'; ctx.fillText(text, bx, by + 4, w - 8);
      ctx.font = '9px "CW Bang", Impact'; ctx.fillStyle = '#7a1a8a'; ctx.fillText(p.name, bx, by - 14 > 6 ? by - 14 : by + 22);
      ctx.font = '13px "CW Bang", Impact, sans-serif';
    }
  };

  LobbyUI.unmount = function () { this.clearCallouts(); this.lobby = null; if (this.root) this.root.onclick = null; };

  CW.LobbyUI = LobbyUI;
})(window);
