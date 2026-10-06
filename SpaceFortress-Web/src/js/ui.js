// HUD: top bar, objective, log, planet command panel, weapon dock, firing orchestration.
(function () {
  const SF = globalThis.SF;
  const $ = (id) => document.getElementById(id);
  const UI = (SF.ui = {
    selected: null, selectedInst: null, selectedFleet: null, weapon: 'railgun',
    ammo: { railgun: 'kinetic', laser: 'beam', missile: 'conv', bombard: 'barrage' },
    troops: {}, mode: null, ack: false, busy: false, hold: {}, lastChance: {}, chanceDelta: {}, dirty: true,
  });
  const g = () => SF.game;
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  UI.vhp = (i) => (UI.hold[i.id] != null ? UI.hold[i.id] : i.hp);

  UI.toast = function (text, kind, ms) {
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.innerHTML = text;
    $('toasts').appendChild(t);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => t.remove(), ms || 3200);
  };
  UI.advise = function (flag, text) {
    const G = g();
    if (!G || G.flags['adv_' + flag]) return;
    G.flags['adv_' + flag] = 1;
    UI.toast('<b style="color:#5fd4ff">ADVISOR</b> · ' + text, '', 7000);
  };

  // ------------------------------------------------------------------ top bar
  let lastRes = {};
  function renderTop() {
    const G = g();
    const def = SF.sysDef(G);
    $('sysname').innerHTML = `<b>${esc(def.name)}</b><span>SYSTEM ${G.sysIndex + 1}/${SF.CAMPAIGN.length} · ${esc(def.tag.toUpperCase())}</span>`;
    const inc = SF.incomeOf(G);
    let h = '';
    for (const r of SF.RES) {
      const I = SF.RES_INFO[r];
      h += `<div class="res" id="res-${r}" style="border-color:${I.color}" data-tip="res:${r}"><span class="n">${I.icon} ${I.short}</span><span class="v" style="color:${I.color}">${Math.floor(G.res[r])}</span><span class="d">+${(Math.round(inc[r] * 10) / 10)}/cyc</span></div>`;
    }
    h += `<div class="res" style="border-color:#e8dca0" data-tip="troops"><span class="n">⚑ GROUND FORCES</span><span class="v" style="color:#e8dca0">${SF.fmtK(G.troops)}</span><span class="d">cap ${SF.fmtK(SF.troopCap(G))} · +${SF.fmtK(inc.troops)}</span></div>`;
    $('res-bar').innerHTML = h;
    for (const r of SF.RES) { if (lastRes[r] != null && Math.floor(G.res[r]) > Math.floor(lastRes[r])) $('res-' + r).classList.add('flash'); lastRes[r] = G.res[r]; }
    const hm = SF.hullMax(G), sm = SF.shieldMax(G), pm = SF.powerMax(G);
    const hp = G.fort.hull / hm;
    $('fort-bars').innerHTML =
      `<span class="label">HULL</span><div class="bar" data-tip="hull"><i style="width:${hp * 100}%;background:${hp > 0.5 ? '#c8d2dc' : hp > 0.25 ? '#ffb04d' : '#ff3b30'}"></i></div>` +
      `<span class="label">SHIELD</span><div class="bar" data-tip="shield"><i style="width:${(G.fort.shield / sm) * 100}%;background:#5fb8ff"></i></div>` +
      `<span class="label">POWER</span><div class="bar" data-tip="power"><i style="width:${(G.fort.power / pm) * 100}%;background:#ffd25a"></i></div>`;
    $('cycle-num').textContent = '· C' + G.cycle;
    $('btn-end').disabled = UI.busy || !!G.over;
  }

  // ------------------------------------------------------------------ objective + log
  function renderObjective() {
    const G = g();
    const el = $('objective');
    if (G.tutorial.active && !G.tutorial.done) {
      const st = SF.TUTORIAL[G.tutorial.step];
      let bars = '';
      for (let i = 0; i < SF.TUTORIAL.length; i++) bars += `<i class="${i < G.tutorial.step ? 'on' : ''}"></i>`;
      el.innerHTML = `<div class="label">TRAINING · STEP ${G.tutorial.step + 1}/${SF.TUTORIAL.length}</div><div class="obj-title">${esc(st.title)}</div><div class="obj-text">${esc(st.text)}</div>` +
        (st.id === 'income' ? `<div class="actions"><button class="btn btn-warn" id="tut-ack">UNDERSTOOD</button></div>` : '') +
        `<div class="tut-progress">${bars}</div>`;
      const a = $('tut-ack'); if (a) a.onclick = () => { UI.ack = true; SF.audio.confirm(); UI.afterAction(); };
      return;
    }
    const def = SF.sysDef(G);
    const enemies = SF.enemyWorlds(G);
    const sys = SF.curSys(G);
    if (SF.systemSecured(G)) {
      const last = G.sysIndex >= SF.CAMPAIGN.length - 1;
      el.innerHTML = `<div class="label">NEXT OBJECTIVE</div><div class="obj-title" style="color:#6dff9c">SYSTEM SECURED</div><div class="obj-text">${esc(def.name)} is under fortress control. Its worlds keep paying out wherever you go.</div>` +
        (last ? '' : `<div class="actions"><button class="btn btn-end btn-big" id="btn-jump">JUMP TO ${esc(SF.CAMPAIGN[G.sysIndex + 1].name)} ▸</button></div><div class="hint">Next: ${esc(SF.CAMPAIGN[G.sysIndex + 1].tag)}. Spend resources before you go if you like.</div>`);
      const j = $('btn-jump'); if (j) j.onclick = () => SF.main.jump();
      return;
    }
    const strike = SF.sectorStrike(G);
    const nf = SF.nextFleetIn(G);
    const neutrals = sys.planets.filter((p) => p.owner === 'neutral').length;
    el.innerHTML = `<div class="label">NEXT OBJECTIVE · ${esc(def.tag.toUpperCase())}</div><div class="obj-title">${def.final ? 'TAKE OR ERASE AETERNUM' : 'CONQUER ' + esc(def.name)}</div>` +
      `<div class="obj-text">${esc(def.brief)}</div><div class="obj-meta">` +
      `<span>Hostile worlds remaining: <b style="color:#ff8a7a">${enemies.length}</b>${neutrals ? ` · Unclaimed: <b style="color:#e8dca0">${neutrals}</b>` : ''}</span>` +
      (strike > 0 ? `<span class="threat">⚠ Sector strikes: ~${Math.round(strike)} dmg per cycle, and rising while worlds hold out</span>` : '') +
      (sys.fleets.length ? `<span class="threat">⚠ ${sys.fleets.length} enemy fleet${sys.fleets.length > 1 ? 's' : ''} in system</span>` : nf != null ? `<span>Next enemy fleet expected in ${Math.max(1, nf)} cycle${nf > 1 ? 's' : ''}</span>` : '') +
      (G.invasions.length ? `<span style="color:#6dff9c">⚑ ${G.invasions.length} ground assault${G.invasions.length > 1 ? 's' : ''} under way</span>` : '') +
      `</div>`;
  }
  function renderLog() {
    const G = g();
    $('log').innerHTML = G.log.slice(-14).reverse().map((e) => `<div class="e ${e.k}"><b>C${e.c}</b>${esc(e.t)}</div>`).join('');
  }

  // ------------------------------------------------------------------ planet panel
  function bar(v, col) { return `<div class="bar"><i style="width:${Math.max(0, Math.min(1, v)) * 100}%;background:${col}"></i></div>`; }
  function pips(n, col) { let s = '<span class="pips">'; for (let i = 0; i < 4; i++) s += `<i style="${i < n ? 'background:' + col : ''}"></i>`; return s + '</span>'; }
  function stars(v) { const n = v >= 60 ? 5 : v >= 35 ? 4 : v >= 20 ? 3 : v >= 8 ? 2 : v > 0 ? 1 : 0; return '★★★★★'.slice(0, n) + '<span style="opacity:.25">' + '★★★★★'.slice(n) + '</span>'; }

  function renderPanel() {
    const G = g();
    const el = $('panel');
    const wasHidden = el.classList.contains('hidden');
    if (UI.selectedFleet) { const f = SF.fleet(G, UI.selectedFleet); if (!f) UI.selectedFleet = null; }
    if (!UI.selected && !UI.selectedFleet) { el.classList.add('hidden'); if (!wasHidden) SF.render.layout(); return; }
    el.classList.remove('hidden');
    if (wasHidden) SF.render.layout();
    const scroll = el.scrollTop;
    el.innerHTML = UI.selectedFleet ? fleetPanel(G, SF.fleet(G, UI.selectedFleet)) : planetPanel(G, SF.planet(G, UI.selected));
    el.scrollTop = scroll;
    bindPanel(G);
  }

  function fleetPanel(G, f) {
    const pv = SF.attackPreview(G, 'railgun', UI.ammo.railgun === 'buster' ? 'buster' : 'kinetic', 'fleet:' + f.id, null);
    return `<div class="p-head"><div class="p-name">${esc(f.name.toUpperCase())}</div><div class="p-owner own-enemy">HOSTILE FLEET</div></div>
      <div class="p-desc">Enemy strike group. ${f.eta > 0 ? 'Closing: ETA ' + f.eta + ' cycle(s).' : 'In range. It will shell the fortress or raid your mining worlds every cycle.'}</div>
      <div class="statgrid"><span class="label">Hull</span>${bar(f.hp / f.maxHp, '#ff6a4d')}<span class="num">${Math.round(f.hp)}/${f.maxHp}</span>
      <span class="label">Firepower</span>${bar(f.dmg / 50, '#ffb04d')}<span class="num">${f.dmg}/cyc</span></div>
      <div class="verdict">Warships are the RAILGUN's prey (×1.5 vs ships). A kinetic round does ~${Math.round(pv.dmg)} here. Missiles and the laser also work. Bombardment cannot track ships. Destroying it yields salvage.</div>`;
  }

  function planetPanel(G, p) {
    const own = p.owner;
    const ownTxt = { enemy: 'HOSTILE', neutral: 'UNCLAIMED', player: 'FORTRESS HELD', destroyed: 'ANNIHILATED' }[own];
    let h = `<div class="p-head"><div class="p-name">${esc(p.name)}</div><div class="p-owner own-${own}">${ownTxt}</div></div><div class="p-desc">${esc(p.desc)}</div>`;
    if (own === 'destroyed') return h + `<div class="verdict">Nothing remains but a debris field. ${p.popMax > 0 ? Math.round(p.popMax * 10) / 10 + ' million people lived here.' : ''} This world will never produce anything again.</div>`;
    const inRange = SF.planetSys(G, p.id) === G.sysIndex;
    if (own === 'enemy' && !p.scanned) {
      return h + `<div class="verdict">UNKNOWN SIGNATURE. Defences, garrison and resources are unknown. A deep scan reveals everything.</div><div class="actions"><button class="btn btn-warn btn-big" id="act-scan">◎ DEEP SCAN · 10 POWER</button></div>`;
    }
    const full = SF.planetYield(p, true), cur = SF.planetYield(p, false);
    const value = SF.valueOf(full);
    const G0 = SF.enemyGroundMax(p) || 1, Gc = SF.enemyGround(p);
    const shieldInst = p.insts.filter((i) => i.type === 'shield');
    const shieldTxt = !shieldInst.length ? '<span style="color:#7f98a8">NONE</span>' : SF.shieldUp(p) ? `<span style="color:#7fb8ff">ACTIVE${SF.powerEff(p) < 1 ? ' (50%: NO POWER)' : ''}</span>` : shieldInst.some((i) => i.hp > 0) ? '<span style="color:#8fd8ff">DISABLED</span>' : '<span style="color:#6dff9c">DOWN</span>';
    h += `<div class="statgrid">
      <span class="label">Population</span>${bar(p.popMax ? p.pop / p.popMax : 0, '#e8dca0')}<span class="num">${p.popMax ? (p.pop >= 1 ? p.pop.toFixed(1) + 'M' : Math.round(p.pop * 1000) + 'k') : '-'}</span>
      ${own === 'enemy' ? `<span class="label">Enemy Strength</span>${bar(Gc / G0, '#ff6a4d')}<span class="num">${SF.fmtK(Gc)}</span>
      <span class="label">Planetary Def.</span>${bar(SF.defenceRating(p), '#ff9a5a')}<span class="num">${SF.pct(SF.defenceRating(p))}</span>
      <span class="label">Shield</span><span>${shieldTxt}</span><span></span>` : ''}
      <span class="label">Strategic Value</span><span style="color:#ffd27a;letter-spacing:2px">${stars(value)}</span><span class="num">${Math.round(value)}/cyc</span>
      <span class="label">Intact Value</span>${bar(SF.intactPct(p), SF.intactPct(p) > 0.7 ? '#6dff9c' : SF.intactPct(p) > 0.4 ? '#ffd27a' : '#ff6a4d')}<span class="num">${SF.pct(SF.intactPct(p))}</span>
      <span class="label">Damage</span>${bar(SF.damageLevel(p), '#ff6a4d')}<span class="num">${SF.pct(SF.damageLevel(p))}</span>
      ${p.contamination > 0 ? `<span class="label" style="color:#b8ff6a">Contamination</span>${bar(p.contamination, '#9aff3a')}<span class="num">${SF.pct(p.contamination)}</span>` : ''}
    </div>`;
    // resources
    h += `<div class="sec"><div class="sec-title"><span>RESOURCES</span><span class="label">${own === 'player' ? 'PRODUCING / CYCLE' : 'IF CAPTURED INTACT'}</span></div>`;
    for (const r of SF.RES) {
      const rt = SF.resourceRating(p, r);
      if (!rt.n) continue;
      const I = SF.RES_INFO[r];
      const now = own === 'player' ? cur[r] : full[r];
      h += `<div class="resrow"><span style="color:${I.color}">${I.icon}</span><span>${I.name} <small class="label">${rt.label}</small></span><span>${pips(rt.n, I.color)} <span class="num" style="color:${I.color}">+${Math.round(now * 10) / 10}</span></span></div>`;
    }
    if (full.troops) h += `<div class="resrow"><span style="color:#e8dca0">⚑</span><span>Recruits</span><span class="num" style="color:#e8dca0">+${SF.fmtK(own === 'player' ? cur.troops : full.troops)}</span></div>`;
    if (!value) h += '<div class="hint">No extractable resources.</div>';
    h += '</div>';
    // installations
    h += `<div class="sec"><div class="sec-title"><span>INSTALLATIONS · ${p.insts.filter((i) => i.hp > 0).length}/${p.insts.length}</span><span class="label">${own === 'enemy' ? 'CLICK TO TARGET' : ''}</span></div><div class="insts">`;
    const shielded = SF.shieldUp(p);
    for (const i of p.insts) {
      const A = SF.INST[i.type];
      const vhp = UI.vhp(i);
      const dead = vhp <= 0;
      const col = SF.art.instColor(p, Object.assign({}, i, { hp: vhp }));
      let tags = '';
      if (i.disabled && !dead) tags += '<span class="tag tag-dis">EMP ' + i.disabled + '</span>';
      if (own === 'enemy' && shielded && i.type !== 'shield' && !A.orbital && !dead) tags += '<span class="tag tag-sh">SHIELDED</span>';
      if (i.type === 'mine' && own === 'player' && !dead) tags += `<span class="tag" style="color:#ffd27a;border-color:#8a7030">${SF.MINE_NAME[i.level].toUpperCase()}</span>`;
      const sub = dead ? 'DESTROYED' : (SF.ARMOR_NAME[A.armor] + (i.yields ? ' · ' + SF.RES.filter((r) => i.yields[r]).map((r) => '+' + i.yields[r] + ' ' + SF.RES_INFO[r].short).join(' ') : i.garrison ? ' · ' + SF.fmtK(i.garrison) + ' troops' : i.militia ? ' · ' + SF.fmtK(i.militia) + ' militia' : ''));
      h += `<div class="inst ${UI.selectedInst === i.id ? 'sel' : ''} ${dead ? 'dead' : ''}" data-inst="${i.id}" data-type="${i.type}" data-tip="inst:${i.id}">
        <img class="ic" src="${SF.art.glyphURL(A.icon, col)}" alt=""><div class="nm">${esc(i.name)}${tags}<small>${sub}</small></div>
        <div class="hp">${dead ? '-' : Math.round((vhp / i.maxHp) * 100) + '%'}${bar(vhp / i.maxHp, vhp / i.maxHp > 0.5 ? '#7dffb0' : vhp / i.maxHp > 0.25 ? '#ffd27a' : '#ff6a4d')}</div></div>`;
      if (own === 'player' && !dead && A.econ) {
        const btns = [];
        if (i.type === 'mine' && SF.mineUpgradeCost(i)) btns.push(`<button class="btn" data-mine="${i.id}">UPGRADE → ${SF.MINE_NAME[i.level + 1]} · ${SF.costText(SF.mineUpgradeCost(i))}</button>`);
        if (i.hp < i.maxHp) btns.push(`<button class="btn" data-repair="${i.id}">REPAIR · ${SF.costText(SF.repairCost(i))}</button>`);
        if (btns.length) h += `<div class="actions" style="margin:0 0 .3em 2.6em">${btns.join('')}</div>`;
      }
    }
    h += '</div></div>';
    // ground assault
    if (own === 'enemy' && inRange) h += assaultBox(G, p);
    if (own === 'neutral') h += `<div class="sec"><div class="verdict">Uninhabited and undefended. Claim it to start extraction at once.</div><div class="actions"><button class="btn btn-ok btn-big" id="act-claim">CLAIM WORLD · 20 MET · 10 POWER</button></div></div>`;
    if (own === 'player') h += `<div class="sec"><div class="hint">Captured worlds keep producing even after the fortress moves on. Enemy fleets in this system may raid its mines.</div></div>`;
    // planet killer
    if (own !== 'player' && inRange && SF.has(G, 'fort_pk')) {
      const ok = SF.canPlanetKill(G, p.id);
      h += `<div class="sec"><div class="sec-title" style="color:#e9a6ff"><span>PLANET KILLER</span></div><div class="hint">Destroys ${esc(p.name)} completely. Future value lost: <b style="color:#ff8a7a">${Math.round(value)}/cycle</b>${p.pop > 0.01 ? ', population: <b style="color:#ff8a7a">' + (p.pop >= 1 ? p.pop.toFixed(1) + ' million' : Math.round(p.pop * 1000) + ' thousand') + '</b>' : ''}.</div><div class="actions"><button class="btn btn-alert" id="act-pk" ${ok.ok ? '' : 'disabled'}>${ok.ok ? 'OPEN ANNIHILATION CHAMBER' : esc(ok.reason)}</button></div></div>`;
    }
    return h;
  }

  function assaultBox(G, p) {
    const onSurface = G.invasions.find((iv) => iv.pid === p.id);
    if (onSurface) {
      const f = SF.invasionForecast(G, p.id, onSurface.troops);
      return `<div class="sec"><div class="sec-title"><span>GROUND ASSAULT · IN PROGRESS</span></div><div class="inv-box">
        <div class="inv-big"><div><div class="k">TROOPS DOWN</div><div class="v">${SF.fmtK(onSurface.troops)}</div></div><div><div class="k">VICTORY</div><div class="v" style="color:${f.chance > 0.7 ? '#7dffb0' : f.chance > 0.45 ? '#ffd27a' : '#ff6a4d'}">${SF.pct(f.chance)}</div></div><div><div class="k">RESOLVES</div><div class="v">${onSurface.cycles}c</div></div></div>
        <div class="chance-bar"><i style="width:${f.chance * 100}%"></i></div>
        <div class="hint">Keep hitting defences with precision weapons to support the landing. Heavy bombardment and nukes are locked while our troops are down there.</div></div></div>`;
    }
    const maxT = Math.floor(G.troops / 1000) * 1000;
    if (UI.troops[p.id] == null) UI.troops[p.id] = Math.min(maxT, SF.suggestTroops(G, p.id, 0.85));
    UI.troops[p.id] = Math.min(UI.troops[p.id], maxT);
    const T = UI.troops[p.id];
    const f = SF.invasionForecast(G, p.id, T);
    const delta = UI.chanceDelta[p.id];
    const eff = SF.powerEff(p);
    const fac = [];
    if (SF.shieldUp(p)) fac.push(`Shield <b>+${Math.round(45 * eff)}%</b>`);
    const can = p.insts.filter((i) => i.type === 'cannon' && SF.activeInst(i));
    if (can.length) fac.push(`${can.length} Cannon${can.length > 1 ? 's' : ''} <b>+${Math.round(can.reduce((s, i) => s + 15 * (i.hp / i.maxHp) * eff, 0))}%</b>`);
    const hq = p.insts.filter((i) => i.type === 'hq' && SF.activeInst(i));
    if (hq.length) fac.push(`Command <b>+${Math.round(hq.reduce((s, i) => s + 30 * (i.hp / i.maxHp), 0))}%</b>`);
    const stn = p.insts.filter((i) => i.type === 'station' && SF.activeInst(i));
    if (stn.length) fac.push(`Orbital <b>+${stn.length * 10}%</b>`);
    if (p.garrisonMod > 1.01) fac.push(`Reinforced <b>+${Math.round((p.garrisonMod - 1) * 100)}%</b>`);
    if (p.garrisonMod < 0.99) fac.push(`Garrison shaken <b style="color:#7dffb0">-${Math.round((1 - p.garrisonMod) * 100)}%</b>`);
    const dl = (k) => (delta && Math.abs(delta[k]) > 0.005 ? `<div class="delta" style="color:${(k === 'chance' ? delta[k] > 0 : delta[k] < 0) ? '#7dffb0' : '#ff8a7a'}">${delta[k] > 0 ? '▲' : '▼'} ${k === 'chance' ? Math.round(Math.abs(delta[k]) * 100) + '%' : SF.fmtK(Math.abs(delta[k]))}</div>` : '<div class="delta">&nbsp;</div>');
    return `<div class="sec"><div class="sec-title"><span>GROUND ASSAULT FORECAST</span><span class="label">ENEMY ${SF.fmtK(f.enemy)} EFFECTIVE</span></div><div class="inv-box">
      <div class="label">COMMIT TROOPS: <b class="num" style="color:#e8dca0" id="troop-val">${SF.fmtInt(T)}</b> of ${SF.fmtInt(G.troops)}</div>
      <input type="range" id="troop-slider" min="1000" max="${Math.max(1000, maxT)}" step="1000" value="${T}" ${maxT < 1000 ? 'disabled' : ''}>
      <div class="inv-big"><div><div class="k">VICTORY</div><div class="v" style="color:${f.chance > 0.7 ? '#7dffb0' : f.chance > 0.45 ? '#ffd27a' : '#ff6a4d'}">${SF.pct(f.chance)}</div>${dl('chance')}</div>
        <div><div class="k">EXP. LOSSES</div><div class="v" style="color:#ffb38a">${SF.fmtK(f.expLoss)}</div>${dl('loss')}</div>
        <div><div class="k">CAPTURE</div><div class="v">${f.cycles}c</div><div class="delta">&nbsp;</div></div></div>
      <div class="chance-bar"><i style="width:${f.chance * 100}%"></i></div>
      ${fac.length ? `<div class="factors">Defence bonuses: ${fac.join(' · ')}</div>` : '<div class="factors" style="color:#7dffb0">No defence bonuses left. The garrison stands alone.</div>'}
      <div class="actions"><button class="btn btn-ok btn-big" id="act-deploy" ${T > G.troops || T < 1000 ? 'disabled' : ''}>⚑ DEPLOY TROOPS</button></div>
      <div class="hint">${advice(G, p, f)}</div></div></div>`;
  }

  function advice(G, p, f) {
    if (SF.shieldUp(p)) return 'The shield blunts every surface strike and stiffens the defence. The <b>Shield Generator</b> itself is exposed: hit it with the railgun (or an EMP missile).';
    if (p.insts.some((i) => i.type === 'cannon' && SF.activeInst(i))) return 'Anti-orbital cannons shred dropships and shell the fortress. Silence them first.';
    if (f.chance < 0.6) return 'The garrison is strong. Bombard its barracks to save soldiers, at the cost of collateral damage.';
    if (f.expLoss < 3000) return 'A cheap landing. Capture it intact.';
    return 'Weigh it up: more strikes save soldiers but cost value and time.';
  }

  function bindPanel(G) {
    const el = $('panel');
    el.querySelectorAll('[data-inst]').forEach((r) => (r.onclick = () => {
      const p = SF.planet(G, UI.selected);
      const i = SF.inst(p, r.dataset.inst);
      if (!i || p.owner !== 'enemy' || UI.vhp(i) <= 0) return;
      UI.selectedInst = i.id; SF.audio.ui(); UI.afterAction();
    }));
    el.querySelectorAll('[data-mine]').forEach((b) => (b.onclick = () => { const r = SF.upgradeMine(G, UI.selected, b.dataset.mine); r.ok ? SF.audio.confirm() : (SF.audio.deny(), UI.toast(r.reason, 'loss')); UI.afterAction(); }));
    el.querySelectorAll('[data-repair]').forEach((b) => (b.onclick = () => { const r = SF.repairInst(G, UI.selected, b.dataset.repair); r.ok ? SF.audio.confirm() : (SF.audio.deny(), UI.toast(r.reason, 'loss')); UI.afterAction(); }));
    const scan = $('act-scan');
    if (scan) scan.onclick = () => {
      const r = SF.scan(G, UI.selected);
      if (!r.ok) { SF.audio.deny(); UI.toast(r.reason, 'loss'); return; }
      SF.audio.beep(660); setTimeout(() => SF.audio.beep(990), 120); setTimeout(() => SF.audio.confirm(), 300);
      UI.scanFx = { pid: UI.selected, t: 0 };
      const p = SF.planet(G, UI.selected);
      UI.lastChance[p.id] = null;
      if (SF.shieldUp(p)) UI.advise('shield', 'A planetary shield. While its generator stands, everything else on the surface takes far less damage.');
      UI.afterAction();
    };
    const claim = $('act-claim');
    if (claim) claim.onclick = () => { const r = SF.claim(G, UI.selected); if (r.ok) { SF.audio.capture(); UI.toast(SF.planet(G, UI.selected).name + ' CLAIMED', 'gain'); } else { SF.audio.deny(); UI.toast(r.reason, 'loss'); } UI.afterAction(); };
    const sl = $('troop-slider');
    if (sl) sl.oninput = () => { UI.troops[UI.selected] = +sl.value; UI.chanceDelta[UI.selected] = null; renderPanel(); SF.audio.ratchet(); };
    const dep = $('act-deploy');
    if (dep) dep.onclick = () => {
      const r = SF.deploy(G, UI.selected, UI.troops[UI.selected]);
      if (!r.ok) { SF.audio.deny(); UI.toast(r.reason, 'loss'); return; }
      SF.audio.clunk(true); setTimeout(() => SF.audio.missile(4), 200);
      UI.toast('⚑ ' + SF.fmtInt(UI.troops[UI.selected]) + ' troops dropping on ' + SF.planet(G, UI.selected).name, 'gain');
      UI.afterAction();
    };
    const pk = $('act-pk');
    if (pk) pk.onclick = () => SF.stations.go("pk", { pid: UI.selected });
  }

  // ------------------------------------------------------------------ dock
  function targetRef() {
    if (UI.selectedFleet) return { pid: 'fleet:' + UI.selectedFleet, iid: null };
    if (UI.selected && UI.selectedInst) return { pid: UI.selected, iid: UI.selectedInst };
    return null;
  }
  UI.targetRef = targetRef;

  function renderDock() {
    const G = g();
    const t = targetRef();
    let h = '';
    h += '<div class="wrail">';
    for (const w of SF.WEAPON_ORDER) {
      const W = SF.WEAPONS[w];
      const st = SF.weaponState(G, w);
      const sel = UI.weapon === w;
      const ws = G.weapons[w];
      const locked = st.locked;
      const lampCol = locked ? '#555' : st.ok ? '#6dff9c' : '#ff8a2a';
      const sil = SF.art.moduleSilhouette(w, locked ? '#5a6672' : W.color);
      let status;
      if (locked) status = `<span class="notready">OFFLINE</span>`;
      else status = (st.ok ? '<span class="ready">READY</span>' : `<span class="notready">${esc(st.reason)}</span>`);
      // charge/ammo micro-indicator
      let gauge = '';
      if (locked) gauge = `<div class="wt-sub">${esc(SF.UPGRADES[W.req].name)}</div>`;
      else if (w === 'laser') gauge = `<div class="heat" data-tip="heat"><i style="width:${Math.min(100, ws.heat)}%"></i></div>`;
      else { const rem = SF.perCycle(G, w) - ws.shots; gauge = `<div class="wt-load">${[...Array(SF.perCycle(G, w))].map((_, i) => `<i class="${i < rem ? 'on' : ''}"></i>`).join('')}<span>${SF.weaponPower(G, w)}⚡</span></div>`; }
      // selected weapon expands with ammo + preview + fire
      let detail = '';
      if (sel && !locked) {
        let ammo = '';
        for (const a of Object.keys(W.ammo)) {
          const A = W.ammo[a]; const un = SF.ammoUnlocked(G, w, a);
          ammo += `<span class="chip ${UI.ammo[w] === a ? 'on' : ''} ${un ? '' : 'lock'}" data-w="${w}" data-a="${a}" data-tip="ammo:${w}:${a}">${esc(A.name.split(' ')[0])}${un ? '' : ' 🔒'}</span>`;
        }
        let preview = `<div class="preview" style="color:#7f98a8">${esc(W.blurb)}</div>`;
        if (t) {
          const chk = SF.canFire(G, w, UI.ammo[w], t.pid, t.iid);
          const pv = SF.attackPreview(G, w, UI.ammo[w], t.pid, t.iid, null);
          if (pv && !['CANNOT REACH ORBIT', 'CANNOT ENGAGE SHIPS', 'NOT HOSTILE'].includes(chk.reason)) {
            const notes = [];
            if (pv.shielded) notes.push('<span style="color:#9fb8ff">shielded</span>');
            if (pv.intercept > 0.01) notes.push(`<span style="color:#ff9c74">${SF.pct(pv.intercept)} intercept</span>`);
            if (pv.nuke) notes.push('<span style="color:#b8ff6a">devastates world</span>');
            else if (pv.collat >= 0.3) notes.push('<span style="color:#ff9c74">heavy collateral</span>');
            else if (pv.collat <= 0.12) notes.push('<span style="color:#7dffb0">precise</span>');
            if (pv.emp) notes.push('<span style="color:#9fe8ff">disables 2c</span>');
            preview = `<div class="preview"><span class="rating r-${pv.rating}">${pv.rating}</span> · ${Math.round(Math.min(pv.frac, 9.99) * 100)}% hull · ${SF.pct(pv.killChance)} kill<br>${notes.join(' · ') || '&nbsp;'}</div>`;
          } else preview = `<div class="preview"><span class="r-POOR">${esc(chk.reason || 'NO EFFECT')}</span></div>`;
        }
        const ok = t && SF.canFire(G, w, UI.ammo[w], t.pid, t.iid).ok && !UI.busy;
        const fire = `<div class="fire-row"><button class="btn btn-warn" id="fire-auto" ${ok ? '' : 'disabled'}>AUTO FIRE</button>${w === 'railgun' ? `<button class="btn btn-alert" id="fire-manual" ${ok ? '' : 'disabled'}>MANUAL</button>` : ''}</div>`;
        detail = `<div class="wt-detail"><div class="ammo">${ammo}</div>${preview}${fire}</div>`;
      }
      h += `<div class="wtile ${sel ? 'sel' : ''} ${locked ? 'locked' : ''}" id="w-${w}" data-wsel="${w}" data-tip="${locked ? '' : ''}">` +
        `<span class="wt-lamp" style="--lc:${lampCol}"></span>` +
        `<div class="wt-sil"><img src="${sil}" alt=""></div>` +
        `<div class="wt-head"><span class="wt-name" style="color:${locked ? '#667' : W.color}">${W.name.replace(' ARRAY', '').replace('HEAVY ', '').replace('ORBITAL ', '')}</span><span class="wt-stat">${status}</span></div>` +
        gauge + detail + `</div>`;
    }
    h += '</div>';
    // planet killer module
    const pk = SF.pkState(G);
    if (pk.locked) {
      const chain = ['fort_reactor', 'fort_modules', 'fort_pk'];
      const steps = chain.map((u) => `<i class="${G.upgrades[u] ? 'on' : ''}" title="${esc(SF.UPGRADES[u].name)}"></i>`).join('');
      h += `<div class="wtile pk locked" id="w-pk" data-tip="pk"><span class="wt-lamp" style="--lc:#6a2a55"></span><div class="wt-sil"><img src="${SF.art.moduleSilhouette('pk', '#6a4a70')}" alt=""></div><div class="wt-head"><span class="wt-name">PLANET KILLER</span><span class="wt-stat notready">LOCKED</span></div><div class="wt-build">${steps}</div><div class="wt-sub">Authorization denied</div></div>`;
    } else {
      const canT = UI.selected && SF.canPlanetKill(G, UI.selected).ok;
      h += `<div class="wtile pk ${pk.ok ? 'armed' : ''}" id="w-pk"><span class="wt-lamp" style="--lc:${pk.ok ? '#ff4bd8' : '#8a3a6a'}"></span><div class="wt-sil"><img src="${SF.art.moduleSilhouette('pk', '#e070ff')}" alt=""></div><div class="wt-head"><span class="wt-name">PLANET KILLER</span><span class="wt-stat ${pk.ok ? 'ready' : 'notready'}">${pk.ok ? 'CHAMBER READY' : esc(pk.reason)}</span></div><div class="fire-row"><button class="btn btn-alert" id="fire-pk" ${canT ? '' : 'disabled'}>${canT ? 'OPEN CHAMBER' : UI.selected ? 'INVALID TARGET' : 'SELECT WORLD'}</button></div></div>`;
    }
    $('dock').innerHTML = h;
    $('dock').querySelectorAll('[data-wsel]').forEach((card) => (card.onclick = (e) => {
      if (e.target.closest('button') || e.target.closest('.chip')) return;
      UI.selectWeapon(card.dataset.wsel);
    }));
    $('dock').querySelectorAll('.chip').forEach((ch) => (ch.onclick = () => {
      if (ch.classList.contains('lock')) { SF.audio.deny(); UI.toast('Locked: requires ' + SF.UPGRADES[SF.WEAPONS[ch.dataset.w].ammo[ch.dataset.a].req].name, 'loss'); return; }
      UI.ammo[ch.dataset.w] = ch.dataset.a; UI.weapon = ch.dataset.w; SF.audio.switch(); UI.afterAction();
    }));
    const fa = $('fire-auto'); if (fa) fa.onclick = () => UI.fireAuto();
    const fm = $('fire-manual'); if (fm) fm.onclick = () => UI.openManual();
    const fp = $("fire-pk"); if (fp) fp.onclick = () => SF.stations.go("pk", { pid: UI.selected });
  }
  UI.selectWeapon = function (w) {
    if (SF.WEAPONS[w].req && !SF.has(g(), SF.WEAPONS[w].req)) { SF.audio.deny(); UI.toast(SF.WEAPONS[w].name + ' not installed: ' + SF.UPGRADES[SF.WEAPONS[w].req].name, 'loss'); return; }
    UI.weapon = w; SF.audio.switch(); UI.afterAction();
  };

  // ------------------------------------------------------------------ firing (auto)
  UI.openManual = function () {
    // Travel to the railgun control station (handles target validation + transition).
    SF.stations.go('railgun');
  };

  function snapshotHold(pid) {
    const p = SF.planet(g(), pid);
    if (!p) return;
    for (const i of p.insts) UI.hold[i.id] = i.hp;
  }
  function releaseHold(pid) {
    const p = SF.planet(g(), pid);
    if (p) for (const i of p.insts) delete UI.hold[i.id];
  }
  // Shared by auto-fire and the manual console's impact.
  UI.resolveShot = function (wid, aid, t, opts) {
    const G = g();
    const before = t.iid ? SF.invasionForecast(G, t.pid, UI.troops[t.pid] || SF.suggestTroops(G, t.pid)) : null;
    const isFleet = t.pid.startsWith('fleet:');
    if (!isFleet) snapshotHold(t.pid);
    const res = SF.fire(G, wid, aid, t.pid, t.iid, opts);
    if (!res.ok) { if (!isFleet) releaseHold(t.pid); return res; }
    if (before && !isFleet && SF.planet(G, t.pid).owner === 'enemy') {
      const after = SF.invasionForecast(G, t.pid, UI.troops[t.pid] || SF.suggestTroops(G, t.pid));
      UI.chanceDelta[t.pid] = { chance: after.chance - before.chance, loss: after.expLoss - before.expLoss };
    }
    return res;
  };
  UI.impact = function (res, t) {
    const G = g();
    const isFleet = t.pid.startsWith('fleet:');
    if (!isFleet) releaseHold(t.pid);
    const anchor = isFleet ? [SF.render.fleetScreen[t.pid.slice(6)] ? SF.render.fleetScreen[t.pid.slice(6)].x : SF.render.W / 2, SF.render.fleetScreen[t.pid.slice(6)] ? SF.render.fleetScreen[t.pid.slice(6)].y : SF.render.H / 2] : SF.render.instPos(G, t.pid, t.iid);
    if (res.intercepted) { UI.toast('SALVO INTERCEPTED', 'loss'); }
    else if (res.missed) { FX_explode(anchor, 0.4); UI.toast('MISS: impact off-target', 'loss'); SF.audio.distant(); }
    else if (res.hit) {
      if (res.nuke) { SF.fx.nuke(anchor); SF.audio.explosion(3); }
      else { FX_explode(anchor, res.killed.length ? 1.2 : 0.7, res.emp ? 'emp' : null); SF.audio.explosion(res.killed.length ? 1.4 : 0.8); }
      for (const cl of res.collateral) if (!isFleet && !res.nuke) setTimeout(() => FX_explode(SF.render.instPos(G, t.pid, cl.iid), 0.45), 120 + Math.random() * 300);
      const names = res.killed.map((id) => { if (id.startsWith('fleet:')) return 'FLEET'; const p = SF.planet(G, id.split(':')[0]); return SF.inst(p, id).name.toUpperCase(); });
      let msg = (res.crit ? '<b style="color:#fff">CRITICAL</b> · ' : '') + Math.round(res.dmg) + ' DMG';
      if (names.length) msg += ' · <b>' + esc(names.join(', ')) + ' DESTROYED</b>';
      if (res.disabled) msg += ' · DISABLED';
      if (res.popLoss > 0.005) msg += ` · <span style="color:#ff8a7a">${res.popLoss >= 1 ? res.popLoss.toFixed(1) + 'M' : Math.round(res.popLoss * 1000) + 'k'} civilian dead</span>`;
      UI.toast(msg, names.length ? 'kill' : '', 4200);
      const cd = UI.chanceDelta[t.pid];
      if (cd && cd.chance > 0.01) setTimeout(() => UI.toast(`⚑ Invasion forecast: victory ${cd.chance > 0 ? '+' : ''}${Math.round(cd.chance * 100)}%, losses ${cd.loss < 0 ? '-' : '+'}${SF.fmtK(Math.abs(cd.loss))}`, 'gain'), 700);
      if (res.killed.some((id) => id.endsWith(':') ? false : (SF.planet(G, id.split(':')[0]) && SF.inst(SF.planet(G, id.split(':')[0]), id) || {}).type === 'mine')) UI.advise('minelost', 'A mine was destroyed. Its income is gone for good, even if you capture the world.');
    }
    UI.busy = false;
    if (UI.selectedInst && SF.inst(SF.planet(G, UI.selected), UI.selectedInst) && SF.inst(SF.planet(G, UI.selected), UI.selectedInst).hp <= 0) UI.selectedInst = null;
    UI.afterAction();
  };
  function FX_explode(at, s, c) { SF.fx.explosion(at, s, c); }

  UI.fireAuto = function () {
    const G = g();
    const t = targetRef();
    if (!t || UI.busy) return;
    const w = UI.weapon, a = UI.ammo[w];
    const chk = SF.canFire(G, w, a, t.pid, t.iid);
    if (!chk.ok) { SF.audio.deny(); UI.toast(chk.reason, 'loss'); return; }
    const res = UI.resolveShot(w, a, t, {});
    UI.busy = true;
    const R = SF.render;
    const to = t.iid ? () => R.instPos(G, t.pid, t.iid) : () => { const f = R.fleetScreen[t.pid.slice(6)]; return f ? [f.x, f.y] : [R.W / 2, R.H / 2]; };
    const from = (k) => () => R.fortPts[k] || [R.W * 0.2, R.H * 0.8];
    // Resolve exactly once. A watchdog guarantees UI.busy always clears even if the FX
    // never gets a chance to draw its onHit (e.g. the player walked off to the Command Deck).
    let fired = false;
    const done = () => { if (fired) return; fired = true; clearTimeout(wd); UI.impact(res, t); };
    const wd = setTimeout(done, 2600);
    if (w === 'railgun') {
      SF.audio.loop('rg', 'whine'); let lv = 0;
      const iv = setInterval(() => { lv += 0.1; SF.audio.loopSet('rg', lv, 0.12); R.fortState.railCharge = lv; if (lv >= 1) { clearInterval(iv); SF.audio.loopStop('rg', 0.02); R.fortState.railCharge = 0; R.fortState.recoil = 1; SF.audio.railgun(1); SF.fx.shake(10, 0.4); SF.fx.rail(from('railgun'), to, done); } }, 45);
    } else if (w === 'laser') {
      SF.audio.laser(1.3); SF.fx.beam(from('laser'), to, 1.3, done);
    } else if (w === 'missile') {
      SF.audio.missile(a === 'nuke' ? 1 : 4); R.fortState.missileFired = R.t;
      SF.fx.missiles(from('missile'), to, a === 'nuke' ? 1 : 4, res.intercepted, done);
    } else {
      SF.audio.bombard(); SF.fx.barrage(from('bombard'), to, 40, done);
    }
    UI.afterAction(true);
  };

  // ------------------------------------------------------------------ refresh
  UI.afterAction = function (noTut) {
    const G = g();
    if (!G) return;
    if (!noTut && SF.tutorialAdvance(G, UI)) SF.audio.confirm();
    SF.checkVictory(G);
    UI.refresh();
    SF.main && SF.main.autosave();
    if (G.over) SF.main.gameOver();
  };
  UI.refresh = function () {
    if (!g()) return;
    renderTop(); renderObjective(); renderLog(); renderPanel(); renderDock(); renderDeckHud();
    if (SF.stations) SF.stations.applyDOM();
    SF.tutorialUI && SF.tutorialUI.update();
  };
  // Minimal diegetic overlay shown while on the Command Deck: the standing order + a cue.
  function renderDeckHud() {
    const G = g();
    const el = $('deckhud');
    if (!el) return;
    const def = SF.sysDef(G);
    const enemies = SF.enemyWorlds(G).length;
    const secured = SF.systemSecured(G);
    el.innerHTML = `<div class="deck-obj panel">` +
      `<div class="label">COMMAND DECK · ${esc(def.name)} · SYS ${G.sysIndex + 1}/${SF.CAMPAIGN.length}</div>` +
      `<div class="obj-title">${secured ? '<span style="color:#6dff9c">SYSTEM SECURED</span>' : def.final ? 'TAKE OR ERASE AETERNUM' : 'CONQUER ' + esc(def.name)}</div>` +
      `<div class="obj-text">${esc(def.brief)}</div>` +
      `<div class="obj-meta"><span>Hostile worlds: <b style="color:#ff8a7a">${enemies}</b></span>` +
      (SF.curSys(G).fleets.length ? `<span class="threat">⚠ ${SF.curSys(G).fleets.length} enemy fleet(s) in system</span>` : '') +
      `<span style="color:#ffb066">▸ Approach the TACTICAL TABLE (or press T) to issue orders.</span></div></div>`;
  }
  UI.renderPanel = renderPanel;
})();
