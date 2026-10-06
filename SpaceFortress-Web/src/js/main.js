// Boot, render loop, global input, save orchestration.
(function () {
  const SF = globalThis.SF;
  const UI = SF.ui;
  const $ = (id) => document.getElementById(id);
  const MAIN = (SF.main = {});
  let dragging = null, moved = false, last = 0;

  MAIN.boot = function () {
    SF.render.init($('map'));
    SF.manual.init($('console'));
    SF.pkMode.init($('console'));
    SF.pkMode.bind();
    UI.bindTooltips();
    bindInput();
    requestAnimationFrame(loop);
    const hasSave = MAIN.hasSave();
    UI.openTitle(hasSave);
  };

  MAIN.hasSave = function () { try { return !!localStorage.getItem(SF.SAVE_KEY); } catch (e) { return false; } };
  MAIN.autosave = function () { if (!SF.game) return; try { localStorage.setItem(SF.SAVE_KEY, SF.serialize(SF.game)); } catch (e) { /* storage may be blocked */ } };
  MAIN.clearSave = function () { try { localStorage.removeItem(SF.SAVE_KEY); } catch (e) {} SF.game = null; };
  MAIN.continueGame = function () {
    try { SF.game = SF.deserialize(localStorage.getItem(SF.SAVE_KEY)); }
    catch (e) { UI.toast('Save was incompatible; starting fresh.', 'loss'); MAIN.newGame(false); return; }
    startInto();
  };
  MAIN.newGame = function (tutorial) {
    const params = new URLSearchParams(location.search);
    SF.game = SF.newGame({ tutorial, seed: params.get('seed') ? +params.get('seed') : undefined });
    if (params.get('sys')) { const n = Math.min(SF.CAMPAIGN.length - 1, Math.max(0, +params.get('sys') - 1)); while (SF.game.sysIndex < n) { for (const p of SF.curSys(SF.game).planets) if (p.owner === 'enemy') p.owner = 'player'; SF.curSys(SF.game).fleets = []; SF.jump(SF.game); } SF.game.tutorial.active = false; SF.game.tutorial.done = true; }
    startInto();
  };
  function startInto() {
    const G = SF.game;
    UI.selected = null; UI.selectedInst = null; UI.selectedFleet = null; UI.mode = null;
    UI.weapon = 'railgun';
    SF.render.focusOn(G, null); SF.render.snap();
    SF.deck.invalidate();
    // Training starts at the tactical table (its first objective is to pick a world there);
    // a normal campaign opens on the Command Deck.
    SF.stations.current = (G.tutorial.active && !G.tutorial.done) ? 'tactical' : 'deck';
    SF.stations.trans = null; SF.stations.beforeStation = 'deck';
    UI.refresh();
    MAIN.autosave();
    // Auto-select the first enemy world to orient the player — but not during training,
    // where selecting the world is the player's first objective.
    if (!(G.tutorial.active && !G.tutorial.done)) {
      const first = SF.enemyWorlds(G)[0];
      const sysAt = G.sysIndex;
      if (first) setTimeout(() => {
        // Only orient the player if they haven't already picked a target themselves.
        if (SF.game === G && G.sysIndex === sysAt && !UI.selected && !UI.selectedFleet && !UI.modal) select({ kind: 'planet', id: first.id });
      }, 400);
    }
  }

  MAIN.jump = function () {
    const G = SF.game;
    const r = SF.jump(G);
    if (!r.ok) { UI.toast(r.reason, 'loss'); return; }
    UI.busy = true;
    SF.audio.warp();
    SF.fx.flash('#8fd0ff', 0.7); SF.fx.shake(10, 1);
    SF.render.cam.z *= 0.2;
    UI.selected = null; UI.selectedInst = null; UI.selectedFleet = null;
    SF.render.focusOn(G, null);
    UI.toast('<b>JUMP COMPLETE</b> · ' + SF.sysDef(G).name, 'gain', 4000);
    UI.refresh(); MAIN.autosave();
    setTimeout(() => { UI.busy = false; const f = SF.enemyWorlds(G)[0]; if (f) select({ kind: 'planet', id: f.id }); UI.refresh(); }, 600);
  };

  MAIN.endCycle = function () {
    const G = SF.game;
    if (UI.busy || G.over) return;
    if (G.tutorial.active && !G.tutorial.done) {
      const st = SF.TUTORIAL[G.tutorial.step];
      // Block end-cycle during tutorial unless the current step wants it.
      if (st && st.id !== 'capture' && !['deploy'].includes(st.id)) { UI.toast('Finish the current objective first.', 'loss'); SF.audio.deny(); return; }
    }
    SF.audio.clunk(true);
    for (const k in UI.chanceDelta) UI.chanceDelta[k] = null;
    const rep = SF.endCycle(G);
    MAIN.autosave();
    // enemy fire visuals
    playCycleFx(rep);
    if (G.over) { UI.refresh(); setTimeout(() => MAIN.gameOver(), 1400); return; }
    UI.refresh();
    if (rep && (rep.fortDmg > 0 || rep.invasions.length || rep.raids.length || rep.offline.length || rep.events.length)) setTimeout(() => UI.openReport(rep), 650);
    else UI.afterAction();
  };
  function playCycleFx(rep) {
    const R = SF.render;
    let delay = 0;
    for (const a of rep.attacks.slice(0, 5)) {
      delay += 0.15;
      const G = SF.game;
      let from;
      const fl = SF.curSys(G).fleets.find((f) => f.name === a.src);
      const p = SF.curSys(G).planets.find((pp) => pp.name === a.src);
      if (fl) from = () => { const s = R.fleetScreen[fl.id]; return s ? [s.x, s.y] : [R.W / 2, 100]; };
      else if (p) from = () => R.planetPos(G, p.id);
      else from = () => [R.W / 2, 100];
      SF.fx.incoming(from, () => R.fortPts.center || [R.W * 0.12, R.H * 0.9], G.fort.shield > 0, delay);
    }
    if (rep.fortDmg > 8) setTimeout(() => SF.fx.shake(8, 0.5), 400);
  }

  MAIN.gameOver = function () { if (UI.modal === 'end') return; SF.manual.forceClose && SF.manual.isOpen && SF.manual.forceClose(); UI.openEnd(); SF.audio[SF.game.over === 'win' ? 'capture' : 'explosion'](SF.game.over === 'win' ? undefined : 3); };

  // ------------------------------------------------------------------ selection
  function select(hit) {
    const G = SF.game;
    if (!hit) { return; }
    if (hit.kind === 'planet') {
      UI.selected = hit.id; UI.selectedFleet = null;
      if (UI.selectedInst && !SF.inst(SF.planet(G, hit.id), UI.selectedInst)) UI.selectedInst = null;
      else UI.selectedInst = null;
      SF.render.focusOn(G, hit.id);
      SF.audio.ui();
    } else if (hit.kind === 'inst') {
      const p = SF.planet(G, hit.pid);
      if (UI.selected !== hit.pid) { UI.selected = hit.pid; SF.render.focusOn(G, hit.pid); }
      UI.selectedFleet = null;
      const i = SF.inst(p, hit.iid);
      if (p.owner === 'enemy' && p.scanned && i.hp > 0) { UI.selectedInst = hit.iid; SF.audio.ui(); }
    } else if (hit.kind === 'fleet') {
      UI.selectedFleet = hit.id; UI.selected = null; UI.selectedInst = null; SF.audio.ui();
    }
    UI.afterAction();
  }
  MAIN.select = select;

  // ------------------------------------------------------------------ input
  function bindInput() {
    const map = $('map');
    addEventListener('resize', () => { SF.render.resize(); });
    const onDeck = () => SF.game && SF.stations.activeCanvas() === 'deck' && !SF.stations.trans;
    map.addEventListener('pointerdown', (e) => { if (onDeck()) return; dragging = { x: e.clientX, y: e.clientY, cx: SF.render.cam.x, cy: SF.render.cam.y }; moved = false; });
    addEventListener('pointermove', (e) => {
      const r = map.getBoundingClientRect();
      if (onDeck()) {
        SF.deck.hover = SF.deck.hit(e.clientX - r.left, e.clientY - r.top, SF.render.W, SF.render.H);
        map.style.cursor = SF.deck.hover ? 'pointer' : 'default';
        return;
      }
      if (dragging) {
        const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
        if (moved) { SF.render.cam.x = dragging.cx - dx / SF.render.cam.z; SF.render.cam.y = dragging.cy - dy / SF.render.cam.z; SF.render.camT.x = SF.render.cam.x; SF.render.camT.y = SF.render.cam.y; SF.render.camT.pid = null; }
      }
      SF.render.hover = SF.render.pick(SF.game, e.clientX - r.left, e.clientY - r.top);
      map.style.cursor = SF.render.hover ? 'pointer' : dragging && moved ? 'grabbing' : 'grab';
    });
    addEventListener('pointerup', (e) => {
      if (onDeck()) {
        if (e.target === map && !UI.busy) { const r = map.getBoundingClientRect(); const h = SF.deck.hit(e.clientX - r.left, e.clientY - r.top, SF.render.W, SF.render.H); if (h && h.action) { SF.audio.ui(); h.action(); } }
        return;
      }
      if (dragging && !moved && SF.game && !UI.busy) {
        const r = map.getBoundingClientRect();
        const hit = SF.render.pick(SF.game, e.clientX - r.left, e.clientY - r.top);
        if (hit) select(hit);
        else if (e.target === map) { UI.selectedInst = null; UI.afterAction(); }
      }
      dragging = null;
    });
    map.addEventListener('wheel', (e) => {
      if (onDeck()) return;
      e.preventDefault();
      if (!SF.game) return;
      const r = map.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const wx = (mx - (SF.render.view.x0 + SF.render.view.x1) / 2) / SF.render.cam.z + SF.render.cam.x;
      const wy = (my - (SF.render.view.y0 + SF.render.view.y1) / 2) / SF.render.cam.z + SF.render.cam.y;
      const f = e.deltaY > 0 ? 0.88 : 1.14;
      const nz = Math.max(SF.render.systemZoom(SF.game) * 0.5, Math.min(14, SF.render.cam.z * f));
      SF.render.camT.z = nz; SF.render.camT.pid = null;
      SF.render.camT.x = wx - (mx - (SF.render.view.x0 + SF.render.view.x1) / 2) / nz;
      SF.render.camT.y = wy - (my - (SF.render.view.y0 + SF.render.view.y1) / 2) / nz;
    }, { passive: false });

    $('btn-end').onclick = () => MAIN.endCycle();
    $('btn-fortress').onclick = () => { if (!SF.game) return; UI.openFortress(); UI.afterAction(); };
    $('btn-menu').onclick = () => UI.openMenu();

    addEventListener('keydown', (e) => {
      if (SF.manual.isOpen || SF.pkMode.active) return;
      if (UI.modal) { if (e.key === 'Escape') { if (UI.modal === 'title' || UI.modal === 'end') return; UI.closeModal(); } return; }
      if (!SF.game) return;
      const k = e.key.toLowerCase();
      // Station hotkeys always available.
      if (k === 'c') { SF.stations.go('deck'); return; }
      if (k === 't') { SF.stations.go('tactical'); return; }
      if (k === 'r') { SF.stations.go('railgun'); return; }
      if (k === 'k') { SF.stations.go('pk'); return; }
      if (k === 'u') { SF.stations.go('engineering'); return; }
      // The rest act on the tactical table; nudge there first if on the deck.
      if (SF.stations.activeCanvas() === 'deck') { if (k === 'enter') MAIN.endCycle(); return; }
      if (k >= '1' && k <= '4') UI.selectWeapon(SF.WEAPON_ORDER[+k - 1]);
      else if (k === 'f') { if (UI.weapon === 'railgun') SF.stations.go('railgun'); else UI.fireAuto(); }
      else if (k === 'm') SF.stations.go('railgun');
      else if (k === 'enter') MAIN.endCycle();
      else if (k === 'escape') { UI.selectedInst = null; UI.selected = null; UI.selectedFleet = null; SF.render.focusOn(SF.game, null); UI.afterAction(); }
      else if (k === 'tab') { e.preventDefault(); cycleTarget(); }
    });
  }
  function cycleTarget() {
    const G = SF.game;
    const enemies = SF.enemyWorlds(G);
    if (!enemies.length) return;
    const idx = enemies.findIndex((p) => p.id === UI.selected);
    const next = enemies[(idx + 1) % enemies.length];
    select({ kind: 'planet', id: next.id });
  }

  // ------------------------------------------------------------------ loop
  let errCount = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    try {
      if (SF.render.fortState.recoil > 0) SF.render.fortState.recoil = Math.max(0, SF.render.fortState.recoil - dt * 3);
      if (!SF.manual.isOpen && !SF.pkMode.active) {
        SF.fx.update(dt);
        SF.stations.update(dt);
        if (SF.game && SF.stations.activeCanvas() === 'deck') SF.deck.frame(dt, SF.render.W, SF.render.H);
        else SF.render.frame(dt, SF.game, UI);
        drawWipe();
        SF.tutorialUI.frame();
      }
    } catch (e) {
      // One bad frame must never freeze the game; log sparingly and keep rendering.
      if (errCount++ < 5) console.error('frame error:', e && e.message);
    }
    requestAnimationFrame(loop);
  }
  // Station transition wipe: heavy blast-door style shutters closing/opening over the frame.
  function drawWipe() {
    const w = SF.stations.wipe();
    if (w <= 0.001) return;
    const c = SF.render.ctx();
    const W = SF.render.W, H = SF.render.H;
    c.setTransform(SF.render.dpr, 0, 0, SF.render.dpr, 0, 0);
    const kind = SF.stations.transKind();
    c.save();
    if (kind === 'descend' || kind === 'ascend') {
      // top + bottom shutters meeting in the middle
      const h = (H / 2) * w;
      shutter(c, 0, 0, W, h, true); shutter(c, 0, H - h, W, h, false);
    } else {
      // left + right blast doors
      const ww = (W / 2) * w;
      shutter(c, 0, 0, ww, H, true); shutter(c, W - ww, 0, ww, H, false);
    }
    c.restore();
  }
  function shutter(c, x, y, w, h, lead) {
    if (w <= 0 || h <= 0) return;
    const g = c.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#12161a'); g.addColorStop(0.5, '#1c2228'); g.addColorStop(1, '#0a0d10');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 2;
    const horiz = h > w;
    if (horiz) for (let yy = y; yy < y + h; yy += 46) { c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy); c.stroke(); }
    else for (let xx = x; xx < x + w; xx += 46) { c.beginPath(); c.moveTo(xx, y); c.lineTo(xx, y + h); c.stroke(); }
    // hazard edge on the leading rim
    try {
      if (horiz) SF.iron.hazard(c, x, lead ? y + h - 12 : y, w, 12, 1);
      else SF.iron.hazard(c, lead ? x + w - 12 : x, y, 12, h, 1);
    } catch (e) {}
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', MAIN.boot);
  else MAIN.boot();
})();
