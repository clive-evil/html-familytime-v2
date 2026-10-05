/* Front menu + results screen + stats/settings modals. */
(function (root) {
  'use strict';
  const CW = root.CW;
  const UI = CW.UI;
  const { $, esc } = UI;
  const Screens = {};
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
      looks.forEach((lk, i) => {
        const x = 40 + i * 66, y = 136 - (i % 2) * 10;
        const em = ems[(i + Math.floor(t / 2.5)) % ems.length];
        CW.Art.drawOverlord(ctx, x, y, 0.72, lk, { t: t + i, face: i < 4 ? 1 : -1, emote: em, emoteT: (t % 2.5) / 2.5, hat: hats[i], heroRarity: CW.RARITY_ORDER[i % 5], weaponKind: Object.values(CW.WEAPONS)[i].epic[0].kind, weaponRarity: CW.RARITY_ORDER[(i + 2) % 5] });
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
  Screens.results = function (app, r) {
    const el = $('#scr-results');
    el.className = 'screen' + (r.won ? '' : ' lost');
    const total = r.rewards.coins;
    const tokens = Object.entries(r.rewards.tokens).filter(([, v]) => v > 0);
    const rows = r.board.slice().sort((a, b) => b.dmg + b.heal - (a.dmg + a.heal));
    const max = Math.max(1, ...rows.map((x) => x.dmg + x.heal));
    el.innerHTML = `<div class="res-wrap">
      <div class="res-head">
        <div class="big">${r.won ? 'RAID CLEARED' : 'WIPED'}</div>
        <div class="sub">${r.biome} · RAID POT ${CW.potLabel(r.potX100)} · ${r.modeName}</div>
        ${r.rewards.greedy ? `<div class="greedy">YOU LOST THE JUICED RAID. WE GOT GREEDY.</div>` : ''}
        ${r.won && r.potX100 >= 200 ? `<div class="greedy">CHAOS RAID SURVIVED. LEGENDS.</div>` : ''}
      </div>
      <div class="res-pay">
        ${r.rewards.lines.map((l, i) => `<div class="line ${l.pot ? 'potline' : ''}" style="animation-delay:${0.2 + i * 0.25}s"><span>${l.label}${l.pot ? ' <small>(lobby boosts)</small>' : ''}</span><b>+${l.value}</b></div>`).join('')}
        <div class="total"><span>TOTAL</span><b class="tot">0</b></div>
        <div class="tokens">${tokens.length ? tokens.map(([k, v]) => `<span class="chip cur-${k}"><i></i>+${v} ${k.toUpperCase()} TOKEN</span>`).join('') : '<span style="color:#7d6b88">NO TOKEN DROPS THIS TIME</span>'}</div>
      </div>
      <div class="res-board"><h4>WHO CARRIED</h4>
        ${rows.map((x) => `<div class="res-row ${x.isHuman ? 'me' : ''}">
            <div class="ava"><img src="${CW.Art.heroIcon(x.classId, x.heroRarity, 40)}"></div>
            <div>${esc(x.name)} ${x.mvp ? '<span class="mvp">MVP</span>' : ''}<div class="pips">${CW.SLOTS.map((s) => `<span class="r-${x.rar[s]} pips"><b></b></span>`).join('')}</div></div>
            <div class="bar"><i style="width:${(x.dmg / max) * 100}%"></i><i class="h" style="width:${(x.heal / max) * 100}%"></i></div>
            <div class="num">${fmtK(x.dmg + x.heal)}</div></div>`).join('')}
      </div></div>
      <div class="res-btns"><button class="btn" data-r="again">PLAY AGAIN</button><button class="btn dark" data-r="menu">MENU</button></div>`;
    // count-up
    const tot = el.querySelector('.tot');
    const t0 = performance.now(), dur = app.fast ? 200 : 1200;
    const tick = () => { const k = Math.min(1, (performance.now() - t0) / dur); tot.textContent = Math.round(total * k); if (k < 1) requestAnimationFrame(tick); else CW.Sfx.play('coin'); };
    setTimeout(tick, app.fast ? 50 : 600);
    el.onclick = (e) => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      CW.Sfx.play('click');
      if (b.dataset.r === 'again') app.startLobby(r.modeId);
      else app.showMenu();
    };
  };

  CW.Screens = Screens;
})(window);
