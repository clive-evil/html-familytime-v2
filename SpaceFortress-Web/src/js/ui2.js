// Modals (fortress engineering, title, menu, cycle report, end), tooltips, tutorial highlight.
(function () {
  const SF = globalThis.SF;
  const UI = SF.ui;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const ov = () => $('overlay');
  UI.modal = null;
  UI.closeModal = function () { ov().classList.add('hidden'); ov().innerHTML = ''; UI.modal = null; if (UI.fortAnim) cancelAnimationFrame(UI.fortAnim); };
  function show(html, kind) { ov().innerHTML = html; ov().classList.remove('hidden'); UI.modal = kind; }

  // ------------------------------------------------------------------ fortress engineering
  UI.openFortress = function () {
    const G = SF.game;
    SF.audio.clunk();
    let br = '';
    for (const b of SF.BRANCHES) {
      const ups = Object.keys(SF.UPGRADES).filter((u) => SF.UPGRADES[u].branch === b.id);
      br += `<div class="branch"><h3>${b.name}</h3>`;
      ups.forEach((u, i) => {
        const U = SF.UPGRADES[u];
        const st = SF.upgradeState(G, u);
        if (i) br += '<div class="upg-arrow">▼</div>';
        br += `<div class="upg ${st}" data-upg="${u}" id="upg-${u}"><div class="un">${esc(U.name)}</div><div class="ud">${esc(U.desc)}</div><div class="uc">${st === 'owned' ? '' : st === 'locked' ? 'Requires ' + esc(SF.UPGRADES[U.req].name) : costHtml(G, U.cost)}</div></div>`;
      });
      br += '</div>';
    }
    const inc = SF.incomeOf(G);
    show(`<div class="modal panel"><div class="modal-head"><h2>FORTRESS ENGINEERING</h2><button class="btn" id="m-close">CLOSE ✕</button></div>
      <div class="fort-top"><canvas id="fort-cv"></canvas><div class="fort-stats">
        <span class="label">Hull</span><span class="num">${Math.round(G.fort.hull)} / ${SF.hullMax(G)}</span>
        <span class="label">Shield</span><span class="num">${Math.round(G.fort.shield)} / ${SF.shieldMax(G)} (+${SF.shieldRegen(G)}/cyc)</span>
        <span class="label">Reactor</span><span class="num">${SF.powerMax(G)} power / cycle</span>
        <span class="label">Ground Forces</span><span class="num">${SF.fmtInt(G.troops)} / ${SF.fmtInt(SF.troopCap(G))}</span>
        <span class="label">Income</span><span class="num">${SF.RES.map((r) => `<span style="color:${SF.RES_INFO[r].color}">+${Math.round(inc[r])} ${SF.RES_INFO[r].short}</span>`).join(' ')}</span>
        <span class="label">Upgrades</span><span class="num">${Object.keys(G.upgrades).length} / ${Object.keys(SF.UPGRADES).length}</span>
        <span></span><span><button class="btn btn-warn" id="m-repair" ${G.fort.hull >= SF.hullMax(G) ? 'disabled' : ''}>REPAIR HULL +25 · 20 MET · 10⚡</button></span>
      </div></div>
      <div class="branches">${br}</div></div>`, 'fortress');
    $('m-close').onclick = () => { UI.closeModal(); SF.audio.ui(); };
    $('m-repair').onclick = () => { const r = SF.repairFortress(G); r.ok ? SF.audio.clunk(true) : SF.audio.deny(); UI.afterAction(); UI.openFortress(); };
    ov().querySelectorAll('.upg.available').forEach((el) => (el.onclick = () => {
      const r = SF.buyUpgrade(G, el.dataset.upg);
      if (r.ok) {
        SF.audio.breaker(); setTimeout(() => SF.audio.confirm(), 200);
        UI.toast('INSTALLED: ' + SF.UPGRADES[el.dataset.upg].name, 'gain');
        if (el.dataset.upg === 'mis_nuke') UI.advise('nuke', 'Nuclear warheads armed. They end fights fast, but they wreck mines, cities and spoils.');
        if (el.dataset.upg === 'fort_pk') UI.advise('pk', 'The annihilation chamber is complete. Choose its targets carefully: a destroyed world never pays out again.');
      }
      UI.afterAction(); UI.openFortress();
    }));
    const cv = $('fort-cv');
    const draw = () => {
      if (UI.modal !== 'fortress' || !cv.isConnected) return;
      const w = cv.clientWidth, h = cv.clientHeight, d = Math.min(2, devicePixelRatio || 1);
      if (cv.width !== w * d) { cv.width = w * d; cv.height = h * d; }
      const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      c.fillStyle = '#02060a'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(95,212,255,0.08)'; for (let x = 0; x < w; x += 24) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      SF.art.drawFortress(c, w * 0.38, h * 0.55, Math.min(w / 1300, h / 700), -0.12, G, performance.now() / 1000, {});
      UI.fortAnim = requestAnimationFrame(draw);
    };
    draw();
  };
  function costHtml(G, cost) {
    return SF.RES.filter((r) => cost[r]).map((r) => `<span style="color:${G.res[r] >= cost[r] ? SF.RES_INFO[r].color : '#ff6a4d'}">${cost[r]} ${SF.RES_INFO[r].short}</span>`).join(' · ');
  }

  // ------------------------------------------------------------------ title + menu
  UI.openTitle = function (hasSave) {
    show(`<div class="title-wrap"><div class="title-logo">SPACE FORTRESS</div><div class="title-sub">ORBITAL ARSENAL COMMAND</div>
      <div class="title-btns">
        ${hasSave ? '<button class="btn btn-end" id="t-continue">CONTINUE CAMPAIGN</button>' : ''}
        <button class="btn ${hasSave ? 'btn-warn' : 'btn-end'}" id="t-new">NEW CAMPAIGN · WITH TRAINING</button>
        <button class="btn" id="t-skip">NEW CAMPAIGN · SKIP TRAINING</button>
      </div>
      <div class="title-foot">Five systems · Capture worlds or erase them · Mouse to command<br>1–4 weapons · F fire · M manual railgun · Enter end cycle · U fortress · Esc back</div></div>`, 'title');
    const go = (fn) => () => { SF.audio.init(); SF.audio.clunk(true); UI.closeModal(); fn(); };
    if (hasSave) $('t-continue').onclick = go(() => SF.main.continueGame());
    $('t-new').onclick = go(() => SF.main.newGame(true));
    $('t-skip').onclick = go(() => SF.main.newGame(false));
  };
  UI.openMenu = function () {
    show(`<div class="report panel"><h2>COMMAND MENU</h2>
      <div class="title-btns" style="margin-top:1em">
        <button class="btn btn-end" id="mm-resume">RESUME</button>
        <button class="btn" id="mm-mute">${SF.audio.muted ? 'UNMUTE AUDIO' : 'MUTE AUDIO'}</button>
        <button class="btn" id="mm-help">FIELD MANUAL</button>
        <button class="btn btn-warn" id="mm-restart">RESTART CAMPAIGN</button>
      </div><div class="hint" style="text-align:center;margin-top:1em">Progress autosaves every cycle and after every action.</div></div>`, 'menu');
    $('mm-resume').onclick = () => UI.closeModal();
    $('mm-mute').onclick = () => { SF.audio.setMuted(!SF.audio.muted); UI.openMenu(); };
    $('mm-help').onclick = () => UI.openHelp();
    $('mm-restart').onclick = () => { if (confirm('Abandon this campaign and start over?')) { SF.main.clearSave(); UI.closeModal(); UI.openTitle(false); } };
  };
  UI.openHelp = function () {
    show(`<div class="modal panel" style="max-width:56em"><div class="modal-head"><h2>FIELD MANUAL</h2><button class="btn" id="h-close">CLOSE ✕</button></div>
      <div class="hint" style="font-size:1em;line-height:1.6;color:#d8e8f2">
      <b>The loop.</b> Scan worlds, decide what you want from each, strip their defences, then invade, capture, or destroy. Captured mines pay out every cycle, and those payouts fund bigger weapons.<br><br>
      <b>Each cycle</b> your reactor refills. Every weapon shot, scan and repair costs power. When you END CYCLE, enemy guns fire, invasions resolve, fleets move and income arrives.<br><br>
      <b>Weapons.</b> RAILGUN: precise and cheap, deadly to armour and warships. MANUAL control gives more damage, a guaranteed hit, less collateral and a chance of a critical. LASER: power-hungry and heats up, superb vs soft targets and power grids, weak through shields. MISSILES: flexible payloads (EMP disables, nukes devastate); interceptor grids can shoot them down. BOMBARDMENT: blunt, heavy collateral, kills troops.<br><br>
      <b>Shields.</b> The planetary shield protects every OTHER surface installation. Hit the generator first.<br><br>
      <b>Troops.</b> Destroying cannons, command posts, barracks and shields raises victory odds and cuts expected losses. Bombarding saves soldiers but costs value.<br><br>
      <b>Pressure.</b> Sector Command shells you harder every cycle you linger. Fleets arrive on a schedule. Garrisons reinforce. Do not dawdle.<br><br>
      <b>Planet Killer.</b> Built through the FORTRESS CORE branch and fuelled by Exotic Matter, which mostly comes from Sable in system 3. It erases a world for good.</div></div>`, 'help');
    $('h-close').onclick = () => UI.closeModal();
  };

  // ------------------------------------------------------------------ cycle report
  UI.openReport = function (rep) {
    const G = SF.game;
    const rows = [];
    if (rep.fortDmg > 0) rows.push(['Incoming fire', `<span style="color:#ff8a7a">${Math.round(rep.fortDmg)} dmg (${Math.round(rep.hullDmg)} to hull)</span>`]);
    else rows.push(['Incoming fire', '<span style="color:#7dffb0">none</span>']);
    for (const a of rep.attacks.slice(0, 6)) rows.push(['&nbsp;&nbsp;· ' + esc(a.src), Math.round(a.amt)]);
    for (const iv of rep.invasions) { const p = SF.planet(G, iv.pid); rows.push([`Assault on ${esc(p.name)}`, iv.win ? `<span style="color:#7dffb0">CAPTURED · ${SF.fmtInt(iv.loss)} lost</span>` : `<span style="color:#ff8a7a">REPULSED · ${SF.fmtInt(iv.loss)} lost</span>`]); }
    for (const r of rep.raids) rows.push([`Raid on ${esc(SF.planet(G, r.pid).name)}`, '<span style="color:#ff8a7a">mine damaged</span>']);
    for (const w of rep.offline) rows.push(['Module damage', `<span style="color:#ffc77a">${SF.WEAPONS[w].name} offline</span>`]);
    if (rep.events.includes('fleet')) rows.push(['Enemy fleet', '<span style="color:#ffc77a">detected, ETA 2</span>']);
    rows.push(['Income', SF.RES.filter((r) => rep.income[r] > 0.05).map((r) => `<span style="color:${SF.RES_INFO[r].color}">+${Math.round(rep.income[r] * 10) / 10} ${SF.RES_INFO[r].short}</span>`).join(' ') + ` <span style="color:#e8dca0">+${SF.fmtK(rep.income.troops)} troops</span>`]);
    show(`<div class="report panel"><h2>CYCLE ${rep.cycle} REPORT</h2>${rows.map((r) => `<div class="row"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('')}
      <div class="actions" style="margin-top:1em"><button class="btn btn-end btn-big" id="r-ok">CONTINUE · CYCLE ${G.cycle}</button></div></div>`, 'report');
    $('r-ok').onclick = () => { UI.closeModal(); SF.audio.ui(); UI.afterAction(); };
  };

  // ------------------------------------------------------------------ end screens
  UI.openEnd = function () {
    const G = SF.game;
    const s = SF.score(G);
    const win = G.over === 'win';
    const throne = SF.planet(G, 'aeternum');
    let epitaph = '';
    if (win) {
      if (throne && throne.owner === 'destroyed') epitaph = 'Aeternum is a ring of glowing debris. The war is over. Thirty-eight million people were the price, and nobody will ever mine that rock.';
      else epitaph = 'Aeternum surrendered with its city standing. The Reach is yours, intact and productive.';
      if (s.civilians > 30) epitaph += ' The archives will remember the cost.';
    } else epitaph = 'Reactor containment failed. The fortress broke apart over a world it never took.';
    show(`<div class="endscreen panel"><h1 style="color:${win ? '#ffd2a8' : '#ff6a4d'}">${win ? 'VICTORY' : 'FORTRESS LOST'}</h1><p>${epitaph}</p>
      <div class="report" style="width:auto;margin:1em 0">
      <div class="row"><span>Cycles</span><span>${s.cycles}</span></div>
      <div class="row"><span>Worlds held</span><span>${s.worlds}</span></div>
      <div class="row"><span>Empire value per cycle</span><span>${s.income}</span></div>
      <div class="row"><span>Worlds annihilated</span><span>${s.destroyed}</span></div>
      <div class="row"><span>Troops lost</span><span>${SF.fmtInt(s.troopsLost)}</span></div>
      <div class="row"><span>Civilian casualties</span><span>${s.civilians >= 1 ? s.civilians.toFixed(1) + ' million' : Math.round(s.civilians * 1000) + ' thousand'}</span></div>
      <div class="row"><span>Manual railgun shots (perfect)</span><span>${G.stats.manualShots} (${G.stats.perfectShots})</span></div>
      <div class="row"><span>Nuclear strikes</span><span>${G.stats.nukes}</span></div></div>
      <button class="btn btn-end btn-big" id="e-new">NEW CAMPAIGN</button></div>`, 'end');
    $('e-new').onclick = () => { SF.main.clearSave(); UI.closeModal(); UI.openTitle(false); };
  };

  // ------------------------------------------------------------------ tooltips
  const TIPS = {
    hull: () => '<b>FORTRESS HULL</b><br>At zero, the fortress is lost. Repair in Fortress Engineering.',
    shield: () => '<b>FORTRESS SHIELD</b><br>Absorbs incoming fire before the hull. Regenerates each cycle.',
    power: () => '<b>REACTOR POWER</b><br>Refills every cycle. Every shot, scan and repair draws from it.',
    troops: () => '<b>GROUND FORCES</b><br>Abstract troop pool. Committed to invasions; survivors return. Captured cities supply recruits.',
    heat: () => '<b>LASER HEAT</b><br>Each shot adds heat. Hit 100 and the emitter locks for a cycle. Cools between cycles.',
    pk: () => '<b>PLANET KILLER</b><br>Build the FORTRESS CORE branch to complete the chamber. Its fuel, Exotic Matter, comes mainly from Sable (system 3). Capture it intact.',
  };
  function tipFor(key) {
    const G = SF.game;
    if (TIPS[key]) return TIPS[key]();
    const [k, a, b] = key.split(':');
    if (k === 'res') { const I = SF.RES_INFO[a]; const use = { metals: 'Railgun shells, bombardment, construction, upgrades.', fissile: 'Nuclear warheads, reactors, bunker busters.', crystals: 'Laser shots, EMP payloads, high-power modules.', exotic: 'Planet Killer firing and experimental tech. Very rare.' }[a]; return `<b>${I.name.toUpperCase()}</b><br>${use}`; }
    if (k === 'inst' && G) {
      const pid = a; const p = SF.planet(G, pid); const i = SF.inst(p, key.slice(5)); if (!i) return '';
      const A = SF.INST[i.type];
      return `<b>${esc(i.name.toUpperCase())}</b> · ${SF.ARMOR_NAME[A.armor]}<br>${esc(A.role)}<br><span style="color:#ffb38a">If destroyed: ${esc(A.kill)}</span>`;
    }
    if (k === 'ammo') { const A = SF.WEAPONS[a].ammo[b]; return `<b>${esc(A.name.toUpperCase())}</b><br>${esc(A.desc)}<br>Cost: ${SF.costText(A.cost)}`; }
    return '';
  }
  UI.bindTooltips = function () {
    const tip = $('tooltip');
    document.addEventListener('mousemove', (e) => {
      const el = e.target.closest && e.target.closest('[data-tip]');
      let html = el ? tipFor(el.dataset.tip) : '';
      if (!html && SF.render.hover && SF.render.hover.kind === 'inst' && e.target.id === 'map') html = tipFor('inst:' + SF.render.hover.iid);
      if (!html) { tip.classList.add('hidden'); return; }
      tip.innerHTML = html; tip.classList.remove('hidden');
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = Math.min(innerWidth - w - 8, e.clientX + 16) + 'px';
      tip.style.top = Math.min(innerHeight - h - 8, e.clientY + 16) + 'px';
    });
  };

  // ------------------------------------------------------------------ tutorial highlight
  SF.tutorialUI = {
    update() {
      const G = SF.game;
      const ring = $('tut-ring'), arrow = $('tut-arrow');
      UI.tutorialPlanet = null;
      if (!G || !G.tutorial.active || G.tutorial.done || UI.modal === 'title') { ring.classList.add('hidden'); arrow.classList.add('hidden'); return; }
      const st = SF.TUTORIAL[G.tutorial.step];
      this.hl = st.hl;
      if (st.hl && st.hl.startsWith('planet:')) UI.tutorialPlanet = st.hl.slice(7);
    },
    // called every frame so the ring tracks moving targets
    frame() {
      const G = SF.game;
      const ring = $('tut-ring'), arrow = $('tut-arrow');
      if (!G || !G.tutorial.active || G.tutorial.done || !this.hl || (UI.modal && UI.modal !== 'fortress') || UI.mode === 'manual') { ring.classList.add('hidden'); arrow.classList.add('hidden'); return; }
      let r = null;
      if (this.hl.startsWith('planet:')) {
        const s = SF.render.planetScreen[this.hl.slice(7)];
        if (s) { const rr = Math.max(s.r * 1.3, 30); r = { left: s.x - rr, top: s.y - rr, width: rr * 2, height: rr * 2, round: true }; }
      } else if (this.hl.startsWith('inst:')) {
        const el = document.querySelector(`.inst[data-type="${this.hl.slice(5)}"]`);
        if (el) r = el.getBoundingClientRect();
      } else {
        let sel = this.hl;
        if (UI.modal === 'fortress' && sel === '#btn-fortress') sel = '.upg.available';
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) r = el.getBoundingClientRect();
      }
      if (!r) { ring.classList.add('hidden'); arrow.classList.add('hidden'); return; }
      ring.classList.remove('hidden'); arrow.classList.remove('hidden');
      Object.assign(ring.style, { left: r.left - 5 + 'px', top: r.top - 5 + 'px', width: r.width + 10 + 'px', height: r.height + 10 + 'px', borderRadius: r.round ? '50%' : '0' });
      const above = r.top > 70;
      arrow.textContent = above ? '▼' : '▲';
      arrow.style.left = r.left + r.width / 2 - 12 + 'px';
      arrow.style.top = (above ? r.top - 48 : r.top + r.height + 10) + 'px';
    },
  };
})();
