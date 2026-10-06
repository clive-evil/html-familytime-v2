'use strict';
// ============================================================================
// UI — operations console (DOM), input, camera, context orders
// ============================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const UI = {
  sel: null, hoverRoom: null, hoverCrew: null, hoverDoor: null, speed: 1, prevSpeed: 1, autoPauseOn: true, uiT: 0,
  init() {
    this.buildTop(); this.buildRoster(); this.buildPower(); this.bindInput();
    $('btnHelp').onclick = () => this.toggleHelp();
    $('helpClose').onclick = () => this.toggleHelp(false);
    for (const b of document.querySelectorAll('[data-speed]')) b.onclick = () => this.setSpeed(+b.dataset.speed);
    $('btnMute').onclick = () => { const m = AUDIO.toggleMute(); $('btnMute').textContent = m ? 'SOUND OFF' : 'SOUND ON'; };
    $('chkAuto').onchange = (e) => { this.autoPauseOn = e.target.checked; };
    $('log').addEventListener('click', (e) => { const el = e.target.closest('[data-room]'); if (el) this.focusRoom(el.dataset.room, true); });
    $('alerts').addEventListener('click', (e) => { const el = e.target.closest('[data-room]'); if (el) this.focusRoom(el.dataset.room, true); });
  },
  // ---------------------------------------------------------------- top bar
  buildTop() {
    const res = [['pow', 'POWER'], ['bat', 'BATTERY'], ['o2', 'O2 RESERVE'], ['food', 'FOOD'], ['water', 'WATER'], ['med', 'MEDICAL'], ['parts', 'PARTS'], ['hull', 'HULL'], ['mor', 'MORALE'], ['col', 'COLONISTS']];
    $('gauges').innerHTML = res.map(([k, l]) => `<div class="g" id="g_${k}"><div class="gl">${l}</div><div class="gv" id="gv_${k}">—</div><div class="gb"><i id="gb_${k}"></i></div></div>`).join('');
  },
  updateTop() {
    const c = fmtClock(G.t);
    $('clock').textContent = `DAY ${c.day} ${c.str}${nightFactor() ? ' NIGHT' : ''}`;
    $('phase').textContent = `${fmtT(G.t)} / ${fmtT(ARC_LENGTH).slice(2)}`;
    const set = (k, v, frac, lvl, title) => {
      $('gv_' + k).textContent = v; const b = $('gb_' + k); b.style.width = clamp(frac, 0, 1) * 100 + '%';
      $('g_' + k).className = 'g ' + (lvl || ''); if (title) $('g_' + k).title = title;
    };
    const pw = G.supply - G.demand;
    set('pow', `${Math.round(G.supply)}/${G.demand}`, G.demand ? G.supply / G.demand : 1, pw < 0 ? (G.battery < 20 ? 'crit' : 'warn') : '', 'Reactor output / demand (MW)');
    set('bat', `${Math.round(G.battery)}%${pw < 0 ? ' ▼' : pw > 2 && G.battery < 100 ? ' ▲' : ''}`, G.battery / 100, G.battery < 15 ? 'crit' : G.battery < 35 ? 'warn' : '');
    set('o2', `${Math.round(G.res.o2)}%`, G.res.o2 / 100, G.res.o2 < 20 ? 'crit' : G.res.o2 < 45 ? 'warn' : '', 'Stored oxygen. Vents draw from it to keep rooms pressurised.');
    const fr = G.foodRate * 720; // per ship-day (720 s)
    set('food', `${Math.round(G.res.food)}% ${fr < -0.5 ? '▼' : fr > 0.5 ? '▲' : ''}`, G.res.food / 100, G.res.food < 20 ? 'crit' : G.res.food < 40 ? 'warn' : '', `Net ${fr.toFixed(1)}% per ship-day`);
    set('water', `${Math.round(G.res.water)}%`, G.res.water / 100, G.res.water < 20 ? 'crit' : G.res.water < 40 ? 'warn' : '');
    set('med', `${Math.floor(G.res.med)}`, G.res.med / 30, G.res.med < 5 ? 'crit' : G.res.med < 10 ? 'warn' : '');
    set('parts', `${Math.floor(G.res.parts)}`, G.res.parts / 50, G.res.parts < 5 ? 'crit' : G.res.parts < 12 ? 'warn' : '');
    set('hull', `${Math.round(G.res.hull)}%`, G.res.hull / 100, G.res.hull < 50 ? 'crit' : G.res.hull < 80 ? 'warn' : '');
    const alive = G.crew.filter((c) => c.alive && !c.missing);
    const mor = alive.length ? alive.reduce((a, c) => a + c.morale, 0) / alive.length : 0;
    set('mor', `${Math.round(mor)}`, mor / 100, mor < 30 ? 'crit' : mor < 50 ? 'warn' : '');
    set('col', `${G.colonists}`, G.colonists / 2400, G.colonistsLost > 0 ? 'crit' : G.cryoHeat > 20 ? 'warn' : '', '2,400 colonists in cryo stasis in this section.');
    for (const b of document.querySelectorAll('[data-speed]')) b.classList.toggle('on', +b.dataset.speed === this.speed);
    $('pauseBanner').style.display = this.speed === 0 ? 'block' : 'none';
  },
  setSpeed(s) { if (G.over) return; this.speed = s; if (s > 0) this.prevSpeed = s; $('pauseReason').textContent = ''; AUDIO.ui(); },
  autoPause(reason) {
    if (!this.autoPauseOn || G.ffwd) return;
    if (this.speed !== 0) this.prevSpeed = this.speed;
    this.speed = 0; $('pauseReason').textContent = reason;
  },
  // ------------------------------------------------------------------ alerts
  updateAlerts() {
    // priority-sorted, similar items grouped so several simultaneous incidents stay readable
    const a = []; const grp = {};
    const group = (key, lvl, label, r) => { (grp[key] = grp[key] || { lvl, label, rooms: [] }).rooms.push(r); };
    for (const r of G.rooms) {
      if (r.venting) a.push([0, 'crit', `VENTING ${r.short}`, r.id]);
      if (G.t - r.lastCreatureSeen < 30) a.push([0, 'crit', `ORGANISM ${r.short}`, r.id]);
      if (r.fire > 0.02) a.push([1, 'crit', `FIRE ${r.short}`, r.id]);
      if (r.breach > 0) a.push([1, 'crit', `BREACH ${r.short}`, r.id]);
      else if (r.p < 70) group('dep', 'crit', 'DEPRESSURISED', r);
      else if (effO2(r) < 16) group('o2', 'warn', 'LOW O2', r);
      if (r.elecFault) group('elec', 'warn', 'ELEC FAULT', r);
      if (!r.observed && G.sensors && (r.motion > 0.4 || r.ghost > G.t) && !G.crew.some((c) => c.alive && !c.missing && c.room === r.id)) a.push([1, 'crit', `MOTION ${r.short}`, r.id]);
    }
    for (const c of G.crew.filter((c) => c.alive && c.down)) a.push([1, 'crit', `${c.last.toUpperCase()} DOWN`, c.room]);
    if (G.reactor.needsRestart) a.push([1, 'crit', 'REACTOR SCRAM — RESTART', 'reactor']);
    else if (G.reactor.instability > 0.4) a.push([2, 'warn', 'REACTOR UNSTABLE', 'reactor']);
    const leaking = G.rooms.find((r) => (r.breach > 0 || r.venting) && !r.sealed);
    if (leaking && G.groups.LIFE.powered) a.push([2, G.res.o2 < 40 ? 'crit' : 'warn', `O2 RESERVE DRAINING → ${leaking.short}`, leaking.id]);
    if (G.cryoHeat > 20) a.push([1, 'crit', 'CRYO PODS WARMING', 'cryo']);
    if (G.roomById.reactor.leak) a.push([3, 'warn', 'COOLANT LEAK', 'reactor']);
    if (G.supply < G.demand - 0.5) a.push([2, G.battery < 20 ? 'crit' : 'warn', `POWER DEFICIT ${Math.round(G.demand - G.supply)}MW`, null]);
    const tripped = GROUPS.filter((g) => G.groups[g.id].tripped);
    if (tripped.length) a.push([2, 'warn', `TRIPPED: ${tripped.map((g) => g.id).join(' ')}`, null]);
    for (const g of Object.values(grp)) a.push([g.lvl === 'crit' ? 2 : 3, g.lvl, `${g.label} ${g.rooms.length > 2 ? '×' + g.rooms.length : g.rooms.map((r) => r.short).join(', ')}`, g.rooms[0].id]);
    if (!G.sensors) a.push([3, 'warn', 'SENSORS OFFLINE', null]);
    const off = G.rooms.filter((r) => !r.observed).length;
    if (off) a.push([4, 'dim', `NO FEED ×${off}`, null]);
    a.sort((x, y) => x[0] - y[0]);
    const shown = a.slice(0, 10);
    const html = shown.map(([, l, t, r]) => `<span class="al ${l}" ${r ? `data-room="${r}"` : ''}>${esc(t)}</span>`).join('') + (a.length > 10 ? `<span class="al dim">+${a.length - 10}</span>` : '');
    if (html !== this._alertHtml) { $('alerts').innerHTML = html; this._alertHtml = html; }
  },
  // ------------------------------------------------------------------ roster
  buildRoster() {
    $('roster').innerHTML = G.crew.map((c) => `<div class="cr" id="cr_${c.id}" data-id="${c.id}">
      <div class="cg">${PROF[c.prof].glyph}</div>
      <div class="cn"><b>${esc(c.name)}</b><span class="ct" id="ct_${c.id}"></span></div>
      <div class="cbars"><i class="hp" id="chp_${c.id}"></i><i class="ox" id="cox_${c.id}"></i><i class="st" id="cst_${c.id}"></i></div>
      <div class="cl" id="cl_${c.id}"></div></div>`).join('');
    $('roster').addEventListener('click', (e) => { const el = e.target.closest('.cr'); if (!el) return; const id = +el.dataset.id; this.select({ type: 'crew', id }); });
    $('roster').addEventListener('dblclick', (e) => { const el = e.target.closest('.cr'); if (!el) return; this.focusCrew(G.crew[+el.dataset.id]); });
  },
  crewLocation(c) {
    if (!c.alive) return c.missing && !c.bodyFound ? 'NO SIGNAL' : 'DECEASED';
    if (c.missing) return 'NO SIGNAL';
    if (c.eva) return 'EVA — OUTSIDE';
    const r = crewRoom(c);
    if (r.observed) return r.short;
    if (G.sensors) return `${r.short} (NO VISUAL)`;
    return `UNKNOWN`;
  },
  crewStatus(c) {
    if (!c.alive) return c.missing && !c.bodyFound ? 'MISSING' : 'DEAD';
    if (c.missing) return 'MISSING';
    if (c.down) return 'INCAPACITATED';
    if (c.panicT > 0) return 'PANICKING';
    if (c.trapped && c.task && c.task.type !== 'duty') return 'TRAPPED — NO ROUTE';
    if (c.quarantined) return 'QUARANTINED';
    if (c.refused && G.t - c.refused.t < 20) return 'REFUSED ORDER';
    if (!c.task) return 'IDLE';
    let n = TASK_NAME[c.task.type] || c.task.type.toUpperCase();
    if (c.task.type === 'duty') n = `ON DUTY`;
    if (c.task.type === 'wander') n = 'ON DUTY';
    if (c.task.type === 'move' && c.task.quarantine) n = 'TO QUARANTINE';
    if (['treat', 'escort', 'observe', 'scan', 'bloodtest', 'quarantine'].includes(c.task.type) && c.task.target !== undefined) n += ' ' + G.crew[c.task.target].last.toUpperCase();
    else if (c.task.room && c.task.type !== 'duty' && c.task.type !== 'sleep') n += ' · ' + G.roomById[c.task.room].short;
    if (c.cranking) n = 'CRANKING DOOR';
    if (c.statusLine && c.task.type === 'restart') n += ` (${c.statusLine})`;
    return n;
  },
  updateRoster() {
    const sens = G.sensors;
    let alive = 0;
    for (const c of G.crew) {
      if (c.alive && !c.missing) alive++;
      const row = $('cr_' + c.id);
      const known = sens || crewRoom(c)?.observed;
      $('ct_' + c.id).textContent = this.crewStatus(c);
      $('cl_' + c.id).textContent = this.crewLocation(c);
      $('chp_' + c.id).style.width = (known && c.alive ? c.hp : c.alive ? 50 : 0) + '%';
      $('cox_' + c.id).style.width = (known && c.alive ? Math.min(c.o2, 100) : 0) + '%';
      $('cst_' + c.id).style.width = (known && c.alive ? c.stress : 0) + '%';
      let cls = 'cr';
      if (!c.alive) cls += ' dead'; else if (c.missing) cls += ' miss'; else if (c.down || c.hp < 30 || c.o2 < 40) cls += ' crit'; else if (c.panicT > 0 || c.stress > 75 || (c.refused && G.t - c.refused.t < 20)) cls += ' warn';
      if (!known && c.alive) cls += ' unk';
      if (this.sel && this.sel.type === 'crew' && this.sel.id === c.id) cls += ' sel';
      if (row.className !== cls) row.className = cls;
    }
    $('crewCount').textContent = `${alive}/${G.crew.length}`;
  },
  // ------------------------------------------------------------------ power
  buildPower() {
    $('groups').innerHTML = GROUPS.map((g) => `<div class="pg" id="pg_${g.id}" title="${esc(g.desc)}"><button class="tog" data-g="${g.id}" ${g.essential ? 'disabled' : ''}></button><span class="pn">${g.name}</span><span class="pd">${g.demand} MW</span></div>`).join('');
    $('groups').addEventListener('click', (e) => { const b = e.target.closest('button[data-g]'); if (!b) return; const g = G.groups[b.dataset.g]; setGroup(g.id, !g.on); this.updatePower(); });
  },
  updatePower() {
    const R0 = G.reactor;
    $('rOut').textContent = `${Math.round(G.supply)} MW`;
    $('rDem').textContent = `${G.demand} MW`;
    $('rBar').style.width = clamp(G.supply / 140, 0, 1) * 100 + '%';
    $('rDemMark').style.left = clamp(G.demand / 140, 0, 1) * 100 + '%';
    $('rCool').textContent = `${Math.round(R0.coolant)}%${G.roomById.reactor.leak ? ' LEAK' : ''}`;
    $('rInst').textContent = R0.needsRestart ? (R0.scramT > 0 ? `SCRAM ${Math.ceil(R0.scramT)}s` : `RESTART ${Math.round(R0.restartProg * 100)}%`) : `${Math.round(R0.instability * 100)}%`;
    $('rInst').className = R0.needsRestart || R0.instability > 0.6 ? 'crit' : R0.instability > 0.3 ? 'warn' : '';
    $('rOp').textContent = R0.manned ? 'MANNED' : 'UNMANNED (−14%)';
    $('rOp').className = R0.manned ? '' : 'warn';
    $('rBat').textContent = `${Math.round(G.battery)}%`;
    for (const g of GROUPS) {
      const s = G.groups[g.id]; const el = $('pg_' + g.id);
      const cls = 'pg' + (s.on ? (s.powered ? ' on' : ' dead') : ' off') + (s.tripped ? ' trip' : '');
      if (el.className !== cls) el.className = cls;
      el.querySelector('button').textContent = g.essential ? 'ESS' : s.tripped ? 'TRIP' : s.on ? 'ON' : 'OFF';
    }
  },
  // ------------------------------------------------------------------ log
  onLog(e) {
    const el = document.createElement('div');
    el.className = 'le ' + e.sev; if (e.room) el.dataset.room = e.room;
    el.innerHTML = e.sev === 'phase' ? `<span class="ph">${esc(e.text)}</span>` : `<span class="lt">${e.clock}</span>${esc(e.text)}`;
    const log = $('log'); log.appendChild(el);
    while (log.children.length > 120) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
    if (e.sev === 'crit') { el.classList.add('flash'); }
  },
  // ------------------------------------------------------------------ selection panel
  select(sel) {
    this.sel = sel; AUDIO.ui(); this.renderCtx(true);
  },
  renderCtx(force) {
    const box = $('ctx');
    if (!this.sel) { if (force || box.dataset.k !== 'none') { box.dataset.k = 'none'; box.innerHTML = `<div class="ph2">NO SELECTION</div><p class="dim">Click a crew member or room. Right-click a room with crew selected to give orders. Click a door to operate it.</p>`; } return; }
    if (this.sel.type === 'crew') this.crewPanel(G.crew[this.sel.id], force);
    else if (this.sel.type === 'room') this.roomPanel(G.roomById[this.sel.id], force);
  },
  bar(label, v, max, cls = '', txt) { const f = clamp(v / max, 0, 1); return `<div class="br ${cls}"><span>${label}</span><i><b style="width:${f * 100}%"></b></i><em>${txt ?? Math.round(v)}</em></div>`; },
  crewPanel(c, force) {
    const box = $('ctx'); const key = 'crew' + c.id;
    const known = (G.sensors || crewRoom(c)?.observed) && c.alive && !c.missing;
    if (force || box.dataset.k !== key) {
      box.dataset.k = key;
      const rels = c.rel.map((r) => { const o = G.crew[r.id]; return `<li data-rel="${o.id}">${REL_WORD[r.type]}: <b>${esc(o.name)}</b> <span id="rel_${o.id}"></span></li>`; }).join('');
      box.innerHTML = `
        <div class="who"><canvas id="portrait" width="84" height="104"></canvas>
          <div><div class="nm">${esc(fullName(c))}</div><div class="pf">${c.prof.toUpperCase()} · WATCH ${'ABC'[c.watch]}</div>
          <div class="tr">${c.traits.map((t) => `<span title="${esc(TRAIT_INFO[t])}">${t}</span>`).join('')}</div>
          <div class="st" id="cStat"></div></div></div>
        <p class="bio">${esc(c.bio)}</p>
        <div id="cVitals"></div>
        <div class="sk">${SKILLS.map((k) => `<div><span>${SKILL_NAME[k]}</span><i class="pips">${[1, 2, 3, 4, 5].map((n) => `<b class="${n <= c.skills[k] ? 'f' : ''}"></b>`).join('')}</i></div>`).join('')}</div>
        <ul class="rel">${rels}</ul>
        <div id="cTests" class="dim"></div>
        <div class="ph2">ORDERS</div>
        <div class="btns" id="cOrders"></div>
        <div class="ph2">MEDICAL / SECURITY ON ${esc(c.first.toUpperCase())}</div>
        <div class="btns" id="cInq"></div>
        <p class="dim small">Right-click a room for location orders (repair, extinguish, seal, investigate…). Right-click a door to work it by hand.</p>`;
      drawPortrait($('portrait'), c);
      const orders = [
        ['DUTY', () => { c.task = null; c.quarantined = c.quarantined; AUDIO.ack(); }],
        ['REST', () => orderCrew(c, { type: 'rest', room: 'quarters' })],
        ['HOLD', () => orderCrew(c, { type: 'hold', room: c.room })],
        ['OPERATE REACTOR', () => orderCrew(c, { type: G.reactor.needsRestart ? 'restart' : 'reactor', room: 'reactor' })],
        ['MAN SECURITY', () => orderCrew(c, { type: 'security', room: 'security' })],
        ['DRAW WEAPON', () => orderCrew(c, { type: 'arm', room: 'security' })],
      ];
      const inq = [
        ['TREAT', () => assignMedic(c)],
        ['MEDICAL SCAN', () => orderMedicalTest(c, 'scan')],
        ['BLOOD TEST', () => orderMedicalTest(c, 'bloodtest')],
        ['QUESTION', () => questionCrew(c)],
        ['OBSERVE', () => assignObserver(c)],
        [c.quarantined ? 'RELEASE' : 'QUARANTINE', () => { orderQuarantine(c); this.renderCtx(true); }],
      ];
      const mk = (id, list) => { const el = $(id); el.innerHTML = ''; for (const [l, fn] of list) { const b = document.createElement('button'); b.textContent = l; b.onclick = () => { if (!c.alive || c.missing) return; fn(); this.renderCtx(true); }; el.appendChild(b); } };
      mk('cOrders', orders); mk('cInq', inq);
      if (c.refused && G.t - c.refused.t < 30) {
        const b = document.createElement('button'); b.className = 'warnb'; b.textContent = 'INSIST (direct order)';
        b.onclick = () => { orderCrew(c, c.refused.task, { insist: true }); this.renderCtx(true); }; $('cOrders').appendChild(b);
      }
    }
    // live parts
    $('cStat').innerHTML = `<span class="${c.alive ? '' : 'crit'}">${esc(this.crewStatus(c))}</span><br><span class="dim">${esc(this.crewLocation(c))}</span>`;
    if (!c.alive || c.missing) {
      $('cVitals').innerHTML = c.alive ? '<p class="crit">NO BIOMONITOR SIGNAL.</p>' : `<p class="crit">${c.missing && !c.bodyFound ? 'Status unknown. Last seen ' + esc(G.roomById[c.lastSeenRoom || c.room].short) + '.' : 'Deceased — ' + esc(c.deathCause) + '.'}</p>`;
    } else if (!known) {
      $('cVitals').innerHTML = '<p class="warn">BIOMONITOR OFFLINE — SENSORS unpowered and no camera on this crew member.</p>';
    } else {
      const tcls = c.bodyTemp > 38 ? 'crit' : c.bodyTemp > 37.5 ? 'warn' : '';
      $('cVitals').innerHTML = this.bar('HEALTH', c.hp, 100, c.hp < 30 ? 'crit' : c.hp < 60 ? 'warn' : '') + this.bar('BLOOD O2', c.o2, 100, c.o2 < 40 ? 'crit' : '') +
        (c.suitMax ? this.bar('REBREATHER', c.suit, c.suitMax, '', Math.round(c.suit) + 's') : '') +
        this.bar('STRESS', c.stress, 100, c.stress > 75 ? 'crit' : c.stress > 50 ? 'warn' : '') + this.bar('MORALE', c.morale, 100, c.morale < 30 ? 'crit' : '') +
        this.bar('FATIGUE', c.fatigue, 100, c.fatigue > 80 ? 'warn' : '') +
        `<div class="br ${tcls}"><span>CORE TEMP</span><i></i><em>${c.bodyTemp.toFixed(1)}°C</em></div>` +
        (c.grief > 0 ? '<p class="warn small">Grieving.</p>' : '') + (c.armed ? '<p class="small dim">Armed — rifle.</p>' : '');
    }
    for (const r of c.rel) { const o = G.crew[r.id]; const el = $('rel_' + o.id); if (el) el.textContent = !o.alive ? (o.missing && !o.bodyFound ? '— MISSING' : '— DEAD') : o.missing ? '— MISSING' : ''; }
    const tests = [];
    if (c.lastScan) tests.push(`Scan ${fmtClock(c.lastScan.t).str}: ${c.lastScan.temp}°C${c.lastScan.anomaly ? ', ANOMALOUS tissue' : ', clear'}`);
    if (c.lastTest) tests.push(`Blood ${fmtClock(c.lastTest.t).str}: ${c.lastTest.result}`);
    $('cTests').innerHTML = tests.length ? tests.map((t) => `<div class="${t.includes('POSITIVE') || t.includes('ANOMALOUS') ? 'crit' : ''}">${esc(t)}</div>`).join('') : '';
  },
  roomPanel(r, force) {
    const box = $('ctx'); const key = 'room' + r.id;
    if (force || box.dataset.k !== key) {
      box.dataset.k = key;
      box.innerHTML = `<div class="nm">${esc(r.name)}</div><div class="pf">${DECK_NAME[r.deck]} · ${r.dept} · BUS: ${G.groups[r.group].name}</div>
        <div id="rStat"></div><div class="ph2">DISPATCH (best available crew)</div><div class="btns" id="rDispatch"></div>
        <div class="ph2">COMPARTMENT CONTROL</div><div class="btns" id="rCtl"></div><div class="ph2">DOORS</div><div id="rDoors"></div>`;
      const disp = [['REPAIR', 'repair'], ['EXTINGUISH', 'extinguish'], ['SEAL BREACH', 'seal'], ['RESTORE POWER', 'power'], ['INVESTIGATE', 'investigate'], ['DECONTAMINATE', 'decon']];
      const el = $('rDispatch');
      for (const [l, k] of disp) { const b = document.createElement('button'); b.textContent = l; b.dataset.k = k; b.onclick = () => dispatchBest(r, k); el.appendChild(b); }
      const ctl = $('rCtl');
      const add = (l, fn, cls) => { const b = document.createElement('button'); b.textContent = l; if (cls) b.className = cls; b.onclick = () => { fn(); this.renderCtx(true); }; ctl.appendChild(b); };
      add('LOCKDOWN', () => lockdownRoom(r));
      add(r.sealed ? 'RELEASE SEAL' : 'EMERGENCY SEAL', () => (r.sealed ? unsealRoom(r) : sealRoom(r)), 'warnb');
      if (r.venting) add('CLOSE DUMP VALVE', () => stopVent(r), 'critb');
      else add(this.ventArm === r.id ? 'CONFIRM VENT — KILLS UNSUITED CREW' : 'VENT ATMOSPHERE', () => {
        if (this.ventArm === r.id) { this.ventArm = null; startVent(r); } else { this.ventArm = r.id; setTimeout(() => { if (this.ventArm === r.id) { this.ventArm = null; this.renderCtx(true); } }, 4000); }
      }, 'critb');
    }
    const known = r.observed;
    const crew = G.crew.filter((c) => c.alive && !c.missing && !c.eva && c.room === r.id);
    const lines = [];
    lines.push(this.bar('PRESSURE', r.p, 101, r.p < 50 ? 'crit' : r.p < 85 ? 'warn' : '', `${Math.round(r.p)} kPa`));
    lines.push(this.bar('OXYGEN', effO2(r), 21, effO2(r) < 14 ? 'crit' : effO2(r) < 17 ? 'warn' : '', `${effO2(r).toFixed(1)}%`));
    lines.push(this.bar('TEMP', r.temp + 60, 120, r.temp < 0 || r.temp > 45 ? 'warn' : '', `${Math.round(r.temp)}°C`));
    lines.push(this.bar('INTEGRITY', r.integ, 100, r.integ < 30 ? 'crit' : r.integ < 60 ? 'warn' : ''));
    if (r.fire > 0) lines.push(this.bar('FIRE', r.fire * 100, 100, 'crit'));
    if (r.breach > 0) lines.push(`<p class="crit">HULL BREACH — patch needs 2 parts.</p>`);
    lines.push(`<p class="${r.powered ? '' : 'warn'}">POWER: ${r.powered ? 'ON' : r.elecFault ? 'LOCAL FAULT' : 'BUS OFFLINE'} · CAMERA: ${r.observed ? 'LIVE' : r.cameraOK ? 'NO FEED' : 'DAMAGED'}${r.sealed ? ' · <span class="crit">SEALED</span>' : ''}</p>`);
    if (!known) lines.push(`<p class="warn">NO VISUAL. ${G.sensors ? `Life signs: ${r.lifeSigns + (r.ghost > G.t ? 1 : 0)}.${r.motion > 0.3 || r.ghost > G.t ? ' MOVEMENT.' : ''}` : 'Sensors offline.'}</p>`);
    if (r.contamKnown) lines.push(`<p class="bio">SURFACE ANOMALY: unknown residue around vent (${r.contam > 0.6 ? 'heavy' : r.contam > 0.3 ? 'spreading' : 'trace'}).</p>`);
    if (r.id === 'reactor') lines.push(`<p>Reactor: ${Math.round(G.supply)} MW · coolant ${Math.round(G.reactor.coolant)}%${r.leak ? ' (LEAK)' : ''}</p>`);
    if (r.id === 'cryo') lines.push(`<p>Pods: ${G.colonists} sleeping · bay heat ${Math.round(G.cryoHeat)}%</p>`);
    if (r.id === 'quarantine' && G.research.samples) lines.push(`<p class="bio">Organism analysis ${Math.round(G.research.prog)}% (${G.research.samples} sample${G.research.samples > 1 ? 's' : ''})</p>`);
    if (known || G.sensors) lines.push(`<p class="dim">Crew: ${crew.length ? crew.map((c) => esc(c.name)).join(', ') : 'none'}</p>`);
    $('rStat').innerHTML = lines.join('');
    for (const b of $('rDispatch').children) {
      const k = b.dataset.k; let on = true;
      if (k === 'extinguish') on = r.fire > 0; if (k === 'seal') on = r.breach > 0; if (k === 'power') on = r.elecFault; if (k === 'decon') on = r.contamKnown;
      if (k === 'repair') on = r.integ < 100 || r.leak || !r.cameraOK || roomDoors(r).some((d) => d.jammed);
      b.disabled = !on;
    }
    const dh = roomDoors(r).map((d) => `<div class="dr"><span>${esc(doorLabel(d))}</span><em class="${d.mode === 'sealed' ? 'crit' : d.mode === 'locked' ? 'warn' : ''}">${effectiveMode(d).toUpperCase()}${d.jammed ? ' · JAM' : ''}${doorPowered(d) ? '' : ' · NO PWR'}</em>
      <span class="db">${['open', 'closed', 'locked', 'sealed'].map((m) => `<button data-door="${d.id}" data-m="${m}" ${d.outer && m !== 'closed' && m !== 'open' ? 'disabled' : ''}>${{ open: 'OPEN', closed: 'SHUT', locked: 'LOCK', sealed: 'SEAL' }[m]}</button>`).join('')}</span></div>`).join('');
    if ($('rDoors').dataset.h !== dh) { $('rDoors').innerHTML = dh; $('rDoors').dataset.h = dh; for (const b of $('rDoors').querySelectorAll('button')) b.onclick = () => { remoteDoor(G.doorById[b.dataset.door], b.dataset.m); this.renderCtx(); }; }
  },
  // ------------------------------------------------------------------ decision
  decision(d) {
    this.autoPause(d.title);
    if (G.ffwd) { if (G.autoDecide) G.autoDecide(d); else G.pendingDecision = d; return; }
    $('decTitle').textContent = d.title; $('decBody').textContent = d.body;
    const el = $('decBtns'); el.innerHTML = '';
    for (const o of d.options) { const b = document.createElement('button'); b.textContent = o.label; b.onclick = () => { $('decision').style.display = 'none'; o.fn(); this.setSpeed(this.prevSpeed || 1); }; el.appendChild(b); }
    $('decision').style.display = 'flex';
    AUDIO.radio();
  },
  toggleHelp(v) { const h = $('help'); const show = v ?? h.style.display !== 'flex'; h.style.display = show ? 'flex' : 'none'; },
  // ------------------------------------------------------------------ camera
  focusRoom(id, select) { const r = G.roomById[id]; if (!r) return; R.cam.tx = r.cx; R.cam.ty = r.cy; R.cam.tz = Math.max(R.cam.tz, 1.1); if (select) this.select({ type: 'room', id }); },
  focusCrew(c) { R.cam.tx = c.x; R.cam.ty = c.y - 40; R.cam.tz = Math.max(R.cam.tz, 1.4); },
  fitShip() { const availW = R.W - 620, availH = R.H - 260; R.cam.tz = clamp(Math.min(availW / 2000, availH / 600), 0.35, 1.2); R.cam.tx = 900 + (310 - 290) / R.cam.tz; R.cam.ty = 270; },
  // ------------------------------------------------------------------ input
  pick(sx, sy) {
    const [wx, wy] = s2w(sx, sy);
    const z = R.cam.z; const tol = Math.max(8, 10 / z);
    let best = null, bd = 1e9;
    for (const c of G.crew) {
      if (c.eva || (c.missing)) continue;
      const r = crewRoom(c); if (!r) continue;
      if (!r.observed && !G.sensors && !(this.sel && this.sel.id === c.id)) continue;
      const cy = c.sleeping && c.atWork ? ART.rooms.quarters.bunks[c.id % ART.rooms.quarters.bunks.length].y : c.y;
      const dx = Math.abs(wx - c.x), dy = wy - cy;
      if (dx < tol && dy < 6 && dy > -46) { const d = dx + Math.abs(dy + 15) * 0.3 + (c.alive ? 0 : 20); if (d < bd) { bd = d; best = { type: 'crew', id: c.id }; } }
    }
    if (best) return best;
    for (const d of G.doors) {
      if (d.hatch) { if (Math.abs(wx - d.x) < 18 && Math.abs(wy - d.y) < 12) return { type: 'door', id: d.id }; }
      else { const ry = G.roomById[d.a].fy; if (Math.abs(wx - d.x) < 10 && wy > ry - 60 && wy < ry + 2) return { type: 'door', id: d.id }; }
    }
    const r = roomAt(wx, wy); if (r) return { type: 'room', id: r.id };
    return null;
  },
  bindInput() {
    const cv = R.cv;
    let down = null;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('mousedown', (e) => { this.closeMenu(); down = { x: e.clientX, y: e.clientY, b: e.button, cx: R.cam.tx, cy: R.cam.ty, moved: false }; });
    window.addEventListener('mousemove', (e) => {
      if (down) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) down.moved = true;
        if (down.moved && (down.b === 0 || down.b === 1)) { R.cam.tx = down.cx - dx / R.cam.z; R.cam.ty = down.cy - dy / R.cam.z; R.cam.x = R.cam.tx; R.cam.y = R.cam.ty; }
      }
      if (e.target === cv) {
        const p = this.pick(e.clientX, e.clientY);
        this.hoverRoom = p && p.type === 'room' ? p.id : p && p.type === 'crew' ? G.crew[p.id].room : null;
        this.hoverCrew = p && p.type === 'crew' ? p.id : null; this.hoverDoor = p && p.type === 'door' ? p.id : null;
        cv.style.cursor = p && (p.type === 'crew' || p.type === 'door') ? 'pointer' : 'default';
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (!down) return; const d = down; down = null;
      if (d.moved || e.target !== cv) return;
      const p = this.pick(e.clientX, e.clientY);
      if (d.b === 0) {
        if (!p) { this.select(null); return; }
        if (p.type === 'door') { this.doorMenu(G.doorById[p.id], e.clientX, e.clientY); return; }
        this.select(p);
      } else if (d.b === 2) this.contextMenu(p, e.clientX, e.clientY);
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [wx, wy] = s2w(e.clientX, e.clientY);
      const nz = clamp(R.cam.tz * Math.pow(1.0015, -e.deltaY), 0.32, 3);
      R.cam.tz = nz;
      // keep point under cursor
      R.cam.tx = wx - (e.clientX - R.W / 2) / nz; R.cam.ty = wy - (e.clientY - R.H / 2) / nz;
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); this.setSpeed(this.speed === 0 ? this.prevSpeed || 1 : 0); }
      else if (k === '1') this.setSpeed(1); else if (k === '2') this.setSpeed(2); else if (k === '3') this.setSpeed(4);
      else if (k === 'escape') { this.closeMenu(); this.select(null); this.toggleHelp(false); }
      else if (k === 'h' || k === '?') this.toggleHelp();
      else if (k === 'm') { const m = AUDIO.toggleMute(); $('btnMute').textContent = m ? 'SOUND OFF' : 'SOUND ON'; }
      else if (k === 'f') { if (this.sel && this.sel.type === 'crew') this.focusCrew(G.crew[this.sel.id]); else if (this.sel) this.focusRoom(this.sel.id); else this.fitShip(); }
      else if (k === 'home' || k === '0') this.fitShip();
      else if (k === 'tab') { e.preventDefault(); const alive = G.crew.filter((c) => c.alive && !c.missing); if (!alive.length) return; const cur = this.sel && this.sel.type === 'crew' ? alive.findIndex((c) => c.id === this.sel.id) : -1; const n = alive[(cur + (e.shiftKey ? -1 : 1) + alive.length) % alive.length]; this.select({ type: 'crew', id: n.id }); this.focusCrew(n); }
      this.keys = this.keys || {}; this.keys[k] = true;
    });
    window.addEventListener('keyup', (e) => { if (this.keys) this.keys[e.key.toLowerCase()] = false; });
  },
  panKeys(dt) {
    const k = this.keys || {}; const s = 700 * dt / R.cam.z;
    if (k.w || k.arrowup) R.cam.ty -= s; if (k.s || k.arrowdown) R.cam.ty += s; if (k.a || k.arrowleft) R.cam.tx -= s; if (k.d || k.arrowright) R.cam.tx += s;
    if (k.q) R.cam.tz = clamp(R.cam.tz * (1 - dt * 1.5), 0.32, 3); if (k.e) R.cam.tz = clamp(R.cam.tz * (1 + dt * 1.5), 0.32, 3);
  },
  // ------------------------------------------------------------------ menus
  closeMenu() { $('menu').style.display = 'none'; },
  showMenu(title, items, x, y) {
    const m = $('menu');
    m.innerHTML = `<div class="mt">${esc(title)}</div>` + items.map((it, i) => it.sep ? '<hr>' : `<button data-i="${i}" ${it.disabled ? 'disabled' : ''} class="${it.cls || ''}">${esc(it.label)}${it.note ? `<small>${esc(it.note)}</small>` : ''}</button>`).join('');
    m.style.display = 'block';
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.min(x, R.W - w - 8) + 'px'; m.style.top = Math.min(y, R.H - h - 8) + 'px';
    m.querySelectorAll('button').forEach((b) => (b.onclick = () => { const it = items[+b.dataset.i]; this.closeMenu(); it.fn(); this.renderCtx(true); }));
  },
  doorMenu(d, x, y) {
    const c = this.sel && this.sel.type === 'crew' ? G.crew[this.sel.id] : null;
    const items = ['open', 'closed', 'locked', 'sealed'].map((m) => ({ label: `${{ open: 'OPEN', closed: 'CLOSE', locked: 'LOCK', sealed: 'EMERGENCY SEAL' }[m]}`, fn: () => remoteDoor(d, m), disabled: d.outer && (m === 'locked' || m === 'sealed'), note: m === 'locked' && !G.groups.SEC.powered ? 'security unpowered' : '' }));
    if (c && c.alive) { items.push({ sep: true }); for (const m of ['open', 'closed', 'sealed']) items.push({ label: `${c.first}: ${m === 'open' ? 'CRANK OPEN' : m === 'closed' ? 'HAUL SHUT' : 'SEAL BY HAND'}`, fn: () => orderCrew(c, { type: 'door', door: d.id, mode: m, room: nearSide(c, d) }) }); }
    this.showMenu(`${doorLabel(d)} — ${effectiveMode(d).toUpperCase()}${doorPowered(d) ? '' : ' (NO POWER)'}`, items, x, y);
  },
  contextMenu(p, x, y) {
    const c = this.sel && this.sel.type === 'crew' ? G.crew[this.sel.id] : null;
    if (!p) return;
    if (p.type === 'door') { this.doorMenu(G.doorById[p.id], x, y); return; }
    if (!c || !c.alive || c.missing) { if (p.type === 'room') this.select(p); return; }
    if (p.type === 'crew') {
      const t = G.crew[p.id]; if (t === c) return;
      const items = [];
      if (t.alive) {
        if (['Medic', 'Scientist'].includes(c.prof) || c.skills.med >= 2) items.push({ label: `TREAT ${t.first}`, fn: () => orderCrew(c, { type: 'treat', target: t.id }) });
        items.push({ label: `ESCORT TO QUARANTINE`, fn: () => { orderCrew(c, { type: 'quarantine', target: t.id }); t.task = { type: 'move', room: 'quarantine', quarantine: true }; repath(t); } });
        items.push({ label: `OBSERVE ${t.first}`, fn: () => orderCrew(c, { type: 'observe', target: t.id }) });
      }
      if (!items.length) return;
      this.showMenu(`${c.name} → ${t.name}`, items, x, y); return;
    }
    const r = G.roomById[p.id];
    const items = [{ label: 'MOVE HERE', fn: () => orderCrew(c, { type: 'move', room: r.id, spot: s2w(x, y)[0] }) }];
    if (r.fire > 0) items.push({ label: 'EXTINGUISH FIRE', fn: () => orderCrew(c, { type: 'extinguish', room: r.id }), cls: 'hot' });
    if (r.breach > 0) items.push({ label: 'SEAL BREACH', fn: () => orderCrew(c, { type: 'seal', room: r.id }), cls: 'hot', note: c.suitMax ? `rebreather ${Math.round(c.suit)}s` : 'no rebreather!' });
    if (r.elecFault) items.push({ label: 'RESTORE POWER', fn: () => orderCrew(c, { type: 'power', room: r.id }) });
    if (r.integ < 100 || r.leak || !r.cameraOK || roomDoors(r).some((d) => d.jammed)) items.push({ label: 'REPAIR', fn: () => orderCrew(c, { type: 'repair', room: r.id }), note: `${Math.round(r.integ)}%` });
    items.push({ label: 'INVESTIGATE', fn: () => orderCrew(c, { type: 'investigate', room: r.id }) });
    if (r.contamKnown) items.push({ label: 'DECONTAMINATE', fn: () => orderCrew(c, { type: 'decon', room: r.id }) });
    if (r.id === 'reactor') items.push({ label: G.reactor.needsRestart ? 'RESTART REACTOR' : 'OPERATE REACTOR', fn: () => orderCrew(c, { type: G.reactor.needsRestart ? 'restart' : 'reactor', room: 'reactor' }) });
    if (r.id === 'security') { items.push({ label: 'MAN SECURITY', fn: () => orderCrew(c, { type: 'security', room: 'security' }) }); if (!c.armed) items.push({ label: 'DRAW WEAPON', fn: () => orderCrew(c, { type: 'arm', room: 'security' }) }); }
    if (r.id === 'quarters') items.push({ label: 'REST', fn: () => orderCrew(c, { type: 'rest', room: 'quarters' }) });
    for (const t of G.crew) if (t.alive && t !== c && t.room === r.id && (t.down || t.hp < 70)) items.push({ label: `TREAT ${t.first}`, fn: () => orderCrew(c, { type: 'treat', target: t.id }), note: `${Math.round(t.hp)}hp` });
    this.showMenu(`${c.name} → ${r.short}`, items, x, y);
  },
};

function nearSide(c, d) { // which side of the door the crew should work from
  if (d.outer) return 'airlock';
  const pa = findPath(c.room, c.x, d.a), pb = findPath(c.room, c.x, d.b);
  if (!pb) return d.a; if (!pa) return d.b;
  return pa.length <= pb.length ? d.a : d.b;
}
function remoteDoor(d, m) {
  if (m === 'sealed') { setDoorMode(d, 'sealed', {}); for (const id of [d.a, d.b]) { const r = G.roomById[id]; if (r && roomDoors(r).filter((x) => !x.outer).every((x) => x.mode === 'sealed')) r.sealed = true; } }
  else setDoorMode(d, m, {});
}
function assignMedic(p) {
  const meds = G.crew.filter((c) => crewAvailable(c) && c !== p && c.prof === 'Medic' && c.panicT <= 0);
  if (!meds.length) { logEvent('warn', 'No medic available.'); return; }
  meds.sort((a, b) => b.skills.med - a.skills.med);
  orderCrew(meds[0], { type: 'treat', target: p.id }, { auto: true });
  logEvent('info', `${meds[0].name} assigned to treat ${p.name}.`);
}
function assignObserver(p) {
  const sec = G.crew.filter((c) => crewAvailable(c) && c !== p && c.panicT <= 0 && !c.quarantined).sort((a, b) => (b.prof === 'Security') - (a.prof === 'Security') || (b.traits.includes('Paranoid') - a.traits.includes('Paranoid')));
  if (!sec.length) return;
  orderCrew(sec[0], { type: 'observe', target: p.id }, { auto: true });
  logEvent('info', `${sec[0].name} will keep an eye on ${p.name}. Discreetly.`);
}
function dispatchBest(r, kind) {
  const skill = { repair: 'eng', seal: 'eng', power: 'eng', extinguish: 'ath', investigate: 'cmb', decon: 'sci' }[kind];
  const cands = G.crew.filter((c) => crewAvailable(c) && !c.quarantined && c.panicT <= 0 && !(c.task && c.task.ordered && c.task.type !== 'move'));
  if (!cands.length) { logEvent('warn', 'No crew available to dispatch.'); return; }
  const score = (c) => c.skills[skill] * 10 - Math.abs(c.x - r.cx) / 80 - Math.abs(G.roomById[c.room].deck - r.deck) * 3 - c.stress / 15 + (kind === 'seal' && c.suitMax ? 15 : 0) + (kind === 'investigate' && c.armed ? 10 : 0) - (c.sleeping ? 4 : 0);
  cands.sort((a, b) => score(b) - score(a));
  for (const c of cands.slice(0, 3)) { if (orderCrew(c, { type: kind, room: r.id })) { logEvent('info', `${c.name} dispatched: ${TASK_NAME[kind]} — ${r.short}.`, r.id); return; } }
}

// procedural portrait --------------------------------------------------------
function drawPortrait(cv, c) {
  const x = cv.getContext('2d'); const w = cv.width, h = cv.height;
  const rng = mulberry32(c.id * 97 + 11);
  x.fillStyle = '#121414'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#1b1e1f'; for (let i = 0; i < h; i += 3) x.fillRect(0, i, w, 1);
  const skin = SKIN[c.look.skin], hairC = HAIR[c.look.hairC];
  const torso = c.prof === 'Medic' ? '#a9a598' : c.prof === 'Scientist' ? '#b3ae9f' : PROF[c.prof].col;
  // shoulders
  x.fillStyle = torso; x.beginPath(); x.moveTo(6, h); x.quadraticCurveTo(10, 74, 42, 72); x.quadraticCurveTo(74, 74, 78, h); x.fill();
  x.fillStyle = shade(torso, -0.3); x.fillRect(36, 70, 12, 8);
  if (c.prof === 'Security') { x.fillStyle = '#1e2429'; x.fillRect(8, 84, 68, 20); }
  if (c.prof === 'Medic') { x.fillStyle = PAL.green; x.fillRect(10, 90, 64, 4); }
  // neck + head
  x.fillStyle = shade(skin, -0.2); x.fillRect(35, 58, 14, 16);
  x.fillStyle = skin; x.beginPath(); x.ellipse(42, 44, 15 + rng() * 2, 19, 0, 0, 6.3); x.fill();
  // side light shading
  x.fillStyle = 'rgba(0,0,0,0.32)'; x.beginPath(); x.ellipse(48, 46, 10, 18, 0, -1.4, 1.4); x.fill();
  // hair
  x.fillStyle = hairC;
  const hs = c.look.hair;
  if (hs === 0) { x.beginPath(); x.ellipse(42, 32, 15, 8, 0, Math.PI, 0); x.fill(); }
  else if (hs === 1) { x.beginPath(); x.ellipse(42, 31, 16, 11, 0, Math.PI, 0); x.fill(); x.fillRect(27, 30, 4, 10); }
  else if (hs === 2) { x.beginPath(); x.ellipse(42, 32, 17, 13, 0, Math.PI, 0); x.fill(); x.fillRect(25, 30, 5, 24); x.fillRect(54, 30, 5, 24); }
  else if (hs === 3) { x.beginPath(); x.ellipse(42, 31, 16, 12, 0, Math.PI, 0); x.fill(); x.beginPath(); x.arc(42, 18, 6, 0, 6.3); x.fill(); }
  else { x.beginPath(); x.ellipse(42, 31, 20, 16, 0, Math.PI * 0.95, Math.PI * 2.05); x.fill(); }
  // face
  x.fillStyle = '#1a1512'; x.fillRect(34, 43, 5, 1.8); x.fillRect(46, 43, 5, 1.8);
  x.fillStyle = shade(hairC, 0.1); x.fillRect(33, 39, 7, 1.5); x.fillRect(45, 39, 7, 1.5);
  x.fillStyle = shade(skin, -0.35); x.fillRect(41, 46, 2, 7); x.fillRect(37, 56, 10, 1.5);
  if (rng() < 0.3) { x.fillStyle = shade(skin, -0.25); x.fillRect(48 + rng() * 4, 47, 1, 6); } // scar
  // headgear
  if (c.prof === 'Officer') { x.fillStyle = '#20262d'; x.fillRect(24, 24, 36, 8); x.fillRect(22, 31, 40, 3); }
  if (c.prof === 'Engineer') { x.fillStyle = PAL.yellow; x.beginPath(); x.ellipse(42, 30, 18, 12, 0, Math.PI, 0); x.fill(); x.fillRect(22, 29, 40, 3); }
  // id strip
  x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(0, h - 12, w, 12);
  x.fillStyle = '#8e897c'; x.font = '8px "DejaVu Sans Mono", monospace'; x.fillText(`ID ${String(6000 + c.id * 37).padStart(5, '0')}`, 4, h - 3);
  if (!c.alive) { x.fillStyle = 'rgba(10,10,10,0.6)'; x.fillRect(0, 0, w, h); x.strokeStyle = '#a8281f'; x.lineWidth = 2; x.beginPath(); x.moveTo(6, 6); x.lineTo(w - 6, h - 18); x.stroke(); }
  // desaturate slightly
  x.globalCompositeOperation = 'color'; x.fillStyle = 'rgba(90,90,85,0.35)'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'source-over';
}
