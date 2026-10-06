/* Front menu + results screen + stats/settings modals. */
(function (root) {
  'use strict';
  const CW = root.CW;
  const UI = CW.UI;
  const { $, esc } = UI;
  const Screens = {};
  const fmt = (n) => Math.round(n).toLocaleString('en-GB');
  const fmtK = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v)));

  // ------------------------------------------------------------ MENU
  Screens.menu = function (app) {
    const s = app.save.data;
    const el = $('#scr-menu');
    const rec = (id) => { const m = s.stats.byMode[id]; return m.played ? `${m.wins}W / ${m.played} RAIDS` : 'NOT PLAYED'; };
    el.innerHTML = `
      <div class="menu-wallet">${UI.wallet(s.wallet)}</div>
      <div class="menu-logo"><div class="cw">CHAOS WORLD</div><div class="big">RNG<span>RAID</span></div><div class="tag">Gamble your loadout. Rob your friends. Juice the dungeon.</div></div>
      <canvas class="menu-crowd" width="1080" height="300"></canvas>
      <div class="mode-cards">
        ${['rng', 'grief'].map((id) => { const m = CW.MODES[id]; return `
        <button class="mode-card ${id}" data-mode="${id}">
          <span class="rec">${rec(id)}</span>
          <h3>${m.name}</h3><div class="tl">${esc(m.tagline)}</div>
          <ul>${m.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
          <span class="go">PLAY ▶</span>
        </button>`; }).join('')}
      </div>
      <div class="menu-foot">
        <button class="btn dark" data-m="stats">STATS</button>
        <button class="btn dark" data-m="settings">SETTINGS</button>
        <button class="btn dark" data-m="help">HOW IT WORKS</button>
      </div>`;
    el.onclick = (e) => {
      CW.Sfx.unlock();
      const mode = e.target.closest('[data-mode]');
      if (mode) { CW.Sfx.play('click'); return app.startLobby(mode.dataset.mode); }
      const m = e.target.closest('[data-m]');
      if (!m) return;
      CW.Sfx.play('click');
      if (m.dataset.m === 'stats') Screens.stats(app);
      if (m.dataset.m === 'settings') Screens.settings(app);
      if (m.dataset.m === 'help') Screens.help();
    };
    // little crowd of overlords on the menu
    const c = el.querySelector('.menu-crowd');
    const ctx = c.getContext('2d');
    const looks = [CW.HUMAN_PROFILE.look, ...CW.BOT_ROSTER.map((b) => b.look)];
    const hats = Object.values(CW.CLASSES).map((k) => k.hat);
    const ems = ['cheer', null, 'laugh', null, 'taunt', null, 'panic', null];
    const draw = () => {
      if (app.screen !== 'menu') return;
      const t = performance.now() / 1000;
      ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, 540, 150);
      // Chaos World archetypes: Scrub, Knight, Archer + friends drawn in the same system
      CW.CLASS_IDS.forEach((id, i) => {
        const x = 34 + i * 59, y = 140 - (i % 2) * 10;
        const em = ems[(i + Math.floor(t / 2.5)) % ems.length];
        CW.ArtPack.drawCharacter(ctx, id, x, y, 0.62, { t: t + i, face: i < 5 ? 1 : -1, emote: em, state: em === 'cheer' ? 'cheer' : 'idle', accent: looks[i % looks.length].body, rarity: CW.RARITY_ORDER[i % 5], weaponKind: CW.WEAPONS[id].epic[0].kind, weaponRarity: CW.RARITY_ORDER[(i + 2) % 5] });
      });
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  };

  Screens.stats = function (app) {
    const s = app.save.data.stats;
    const row = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
    UI.openModal(`<h2>YOUR RECORD</h2>
      <div class="stats-grid">
        ${row('RAIDS', s.raidsPlayed)}${row('WINS', s.wins)}
        ${row('LEGENDARY+ PULLS', s.legendaryPulls)}${row('BEST POT CLEARED', s.highestPotCleared ? CW.potLabel(s.highestPotCleared) : '—')}
        ${row('STEALS', s.steals)}${row('BUSTED', s.stealFails)}
        ${row('PLAYERS GRIEFED', s.playersGriefed)}${row('TIMES GRIEFED', s.timesGriefed)}
        ${row('BOOSTS', s.boosts)}${row('REROLLS', s.rerolls)}
        ${row('RNG RAID', `${s.byMode.rng.wins}/${s.byMode.rng.played}`)}${row('GRIEF RAID', `${s.byMode.grief.wins}/${s.byMode.grief.played}`)}
      </div>
      <div class="row"><button class="btn" data-m="no">OK</button></div>`);
    $('#overlay .modal').onclick = (e) => { if (e.target.closest('[data-m]')) UI.closeModal(); };
  };

  Screens.settings = function (app) {
    const st = app.save.data.settings;
    UI.openModal(`<h2>SETTINGS</h2>
      <div class="toggle-row"><span>SOUND</span><button class="btn ${st.sound ? '' : 'dark'}" data-t="sound">${st.sound ? 'ON' : 'OFF'}</button></div>
      <div class="toggle-row"><span>FAST MODE (QA)</span><button class="btn ${app.fast ? '' : 'dark'}" data-t="fast">${app.fast ? 'ON' : 'OFF'}</button></div>
      <div class="toggle-row"><span>SAVE DATA</span><button class="btn red" data-t="reset">RESET SAVE</button></div>
      <div class="note">DEBUG PANEL: PRESS \` OR TAP "DBG" (BOTTOM LEFT)</div>
      <div class="row"><button class="btn" data-m="no">DONE</button></div>`);
    $('#overlay .modal').onclick = (e) => {
      const t = e.target.closest('[data-t]');
      if (e.target.closest('[data-m]')) return UI.closeModal();
      if (!t) return;
      if (t.dataset.t === 'sound') { st.sound = !st.sound; CW.Sfx.setEnabled(st.sound); app.save.save(); }
      if (t.dataset.t === 'fast') app.setFast(!app.fast);
      if (t.dataset.t === 'reset') { if (t.dataset.armed) { app.resetSave(); UI.toast('SAVE RESET', true); } else { t.dataset.armed = 1; t.textContent = 'TAP AGAIN'; return; } }
      Screens.settings(app);
    };
  };

  Screens.help = function () {
    UI.openModal(`<h2>HOW IT WORKS</h2>
      <div class="sub" style="text-align:left;line-height:1.3">
      1. Everyone pulls a <b>HERO</b>, then a <b>WEAPON</b> for that hero, then <b>GEAR</b>.<br>
      2. <b>CHAOS PHASE</b> (~18s): reroll a slot, shuffle everything, steal from others, or (Grief Raid) curse their stuff down a tier.<br>
      3. Anyone can <b>BOOST</b> the raid pot: more coins for everyone, nastier dungeon.<br>
      4. The timer hits zero and you all walk into the dungeon with whatever you ended up holding.</div>
      <div class="row"><button class="btn" data-m="no">GOT IT</button></div>`);
    $('#overlay .modal').onclick = (e) => { if (e.target.closest('[data-m]')) UI.closeModal(); };
  };

  // ------------------------------------------------------------ RESULTS
  // V2 results: 1/2/3 podium with the actual characters, then 4th–8th, awards and your placement reward.
  Screens.results = function (app, r) {
    const el = $('#scr-results');
    el.className = 'screen' + (r.won ? '' : ' lost');
    const rows = r.rows;
    const me = rows.find((x) => x.isHuman);
    const tok = (t) => Object.entries(t).filter(([, v]) => v > 0).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(' · ');
    const podium = [rows[1], rows[0], rows[2]].filter(Boolean);
    const BLOCK = { 1: { x: 270, w: 156, h: 124 }, 2: { x: 104, w: 150, h: 98 }, 3: { x: 436, w: 150, h: 82 } };
    el.innerHTML = `<div class="res-wrap">
      <div class="res-head">
        <div class="big" style="font-size:52px">${r.won ? 'BOSS DOWN' : r.why === 'timeout' ? 'BERSERK!' : 'WIPED'}</div>
        <div class="sub">${r.biome} · RAID POT ${CW.potLabel(r.potX100)} · ${r.modeName}</div>
        ${r.rewards.greedy ? `<div class="greedy">YOU LOST THE JUICED RAID. WE GOT GREEDY.</div>` : ''}
        ${r.won && r.potX100 >= 200 ? `<div class="greedy">CHAOS RAID SURVIVED.</div>` : ''}
      </div>
      <div class="podium"><canvas width="1040" height="660"></canvas>
        ${podium.map((x) => { const b = BLOCK[x.rank]; return `<div class="pod-lbl" style="left:${(b.x / 540) * 100}%;top:${330 - b.h + 8}px">
          <div class="nm ${x.isHuman ? 'me' : ''}">${x.rank === 1 ? '🥇' : x.rank === 2 ? '🥈' : '🥉'} ${x.isHuman ? 'YOU' : esc(x.name)}</div>
          <div class="dm">${fmt(x.dmg)} DMG</div>
          <div class="rw">+${x.reward.coins} COINS</div>
          <div class="tk">${tok(x.reward.tokens)}</div></div>`; }).join('')}
      </div>
      <div class="res-you"><div><div class="yp" style="color:${me.rank <= 3 ? ['', '#ffbf1a', '#d9dde3', '#e0954a'][me.rank] : '#fff'}">YOU — ${CW.ordinal(me.rank)}</div>
        <div class="yl">${me.reward.lines.map((l) => `${l.label} <b style="color:#ffe7a6">+${l.value}</b>`).join(' · ')}${tok(me.reward.tokens) ? ' · <b style="color:#7dffb0">' + tok(me.reward.tokens) + ' TOKEN</b>' : ''}</div></div>
        <div class="yc"><span class="tot">0</span><small>COINS</small></div></div>
      <div class="res-rest">${rows.slice(3).map((x) => `<div class="rr ${x.isHuman ? 'me' : ''}"><span class="pl">${CW.ordinal(x.rank)}</span><img src="${CW.ArtPack.heroIcon(x.classId, x.heroRarity, 40, x.accent)}"><span>${x.isHuman ? 'YOU' : esc(x.name)}</span><span class="dm">${fmt(x.dmg)}</span><span class="rw">+${x.reward.coins}</span></div>`).join('')}</div>
      ${r.awards.length ? `<div class="res-awards">${r.awards.map((a) => `<div><b>${a.title}</b>${esc(rows.find((x) => x.uid === a.uid).isHuman ? 'YOU' : a.name)} — ${esc(a.text)}</div>`).join('')}</div>` : ''}
    </div>
    <div class="res-btns"><button class="btn" data-r="again">PLAY AGAIN</button><button class="btn dark" data-r="menu">MENU</button></div>`;
    // podium canvas: real characters on stepped blocks
    const cv = el.querySelector('.podium canvas'), ctx = cv.getContext('2d');
    const draw = () => {
      if (app.screen !== 'results' || !cv.isConnected) return;
      const t = performance.now() / 1000;
      ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, 540, 330);
      const g = ctx.createRadialGradient(270, 150, 10, 270, 150, 260); g.addColorStop(0, 'rgba(255,191,26,0.35)'); g.addColorStop(1, 'rgba(255,191,26,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 540, 330);
      for (const x of podium) {
        const b = BLOCK[x.rank], top = 330 - b.h;
        const sc = x.rank === 1 ? 1.15 : 0.98;
        CW.ArtPack.drawCharacter(ctx, x.classId, b.x, top - 2, sc, { t: t + x.rank, state: x.rank === 1 ? 'cheer' : 'idle', emote: x.rank === 1 ? 'cheer' : x.isHuman ? 'taunt' : null, accent: x.accent, rarity: x.heroRarity, weaponKind: x.weaponKind, weaponRarity: x.weaponRarity });
        ctx.fillStyle = ['', '#ffbf1a', '#c9ced6', '#d98a43'][x.rank]; ctx.strokeStyle = '#140b17'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.roundRect(b.x - b.w / 2, top, b.w, b.h + 6, 8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(b.x - b.w / 2 + 4, top + b.h - 18, b.w - 8, 18);
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
    const tot = el.querySelector('.tot');
    const total = r.rewards.coins;
    const t0 = performance.now(), dur = app.fast ? 200 : 1200;
    const tick = () => { const k = Math.min(1, (performance.now() - t0) / dur); tot.textContent = Math.round(total * k); if (k < 1) requestAnimationFrame(tick); else CW.Sfx.play('coin'); };
    setTimeout(tick, app.fast ? 50 : 500);
    el.onclick = (e) => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      CW.Sfx.play('click');
      if (b.dataset.r === 'again') app.startLobby(r.modeId);
      else app.showMenu();
    };
  };

  CW.Screens = Screens;
})(window);
