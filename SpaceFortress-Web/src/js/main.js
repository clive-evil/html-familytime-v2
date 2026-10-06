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
    UI.refresh();
    MAIN.autosave();
    // auto-select the first enemy world to orient the player
    const first = SF.enemyWorlds(G)[0];
    if (first) setTimeout(() => select({ kind: 'planet', id: first.id }), 400);
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
    map.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY, cx: SF.render.cam.x, cy: SF.render.cam.y }; moved = false; });
    addEventListener('pointermove', (e) => {
      if (dragging) {
        const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
        if (moved) { SF.render.cam.x = dragging.cx - dx / SF.render.cam.z; SF.render.cam.y = dragging.cy - dy / SF.render.cam.z; SF.render.camT.x = SF.render.cam.x; SF.render.camT.y = SF.render.cam.y; SF.render.camT.pid = null; }
      }
      const r = map.getBoundingClientRect();
      SF.render.hover = SF.render.pick(SF.game, e.clientX - r.left, e.clientY - r.top);
      map.style.cursor = SF.render.hover ? 'pointer' : dragging && moved ? 'grabbing' : 'grab';
    });
    addEventListener('pointerup', (e) => {
      if (dragging && !moved && SF.game && !UI.busy) {
        const r = map.getBoundingClientRect();
        const hit = SF.render.pick(SF.game, e.clientX - r.left, e.clientY - r.top);
        if (hit) select(hit);
        else if (e.target === map) { UI.selectedInst = null; UI.afterAction(); }
      }
      dragging = null;
    });
    map.addEventListener('wheel', (e) => {
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
      if (k >= '1' && k <= '4') UI.selectWeapon(SF.WEAPON_ORDER[+k - 1]);
      else if (k === 'f') { if (UI.weapon === 'railgun') UI.openManual(); else UI.fireAuto(); }
      else if (k === 'm') UI.openManual();
      else if (k === 'enter') MAIN.endCycle();
      else if (k === 'u') { UI.openFortress(); UI.afterAction(); }
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
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    if (SF.render.fortState.recoil > 0) SF.render.fortState.recoil = Math.max(0, SF.render.fortState.recoil - dt * 3);
    if (!SF.manual.isOpen && !SF.pkMode.active) {
      SF.fx.update(dt);
      SF.render.frame(dt, SF.game, UI);
      SF.tutorialUI.frame();
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', MAIN.boot);
  else MAIN.boot();
})();
