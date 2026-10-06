// Station navigation: the player moves between fixed camera stations inside the fortress.
// 'deck' (Command Deck home) and 'tactical' (the war table) are drawn on the main #map canvas;
// 'railgun' and 'pk' hand off to their full-screen machinery consoles; 'engineering' is the
// Fortress Engineering view. Transitions are short canvas wipes so it feels like moving, not page-swapping.
(function () {
  const SF = globalThis.SF;
  const ST = (SF.stations = {
    current: 'deck',
    trans: null,       // { from, to, t, dur, kind }
    STATIONS: [
      { id: 'deck', name: 'COMMAND DECK', short: 'DECK', key: 'C' },
      { id: 'tactical', name: 'TACTICAL TABLE', short: 'TACTICAL', key: 'T' },
      { id: 'railgun', name: 'RAILGUN CONTROL', short: 'RAILGUN', key: 'R' },
      { id: 'engineering', name: 'ENGINEERING', short: 'ENGINEER', key: 'U' },
      { id: 'pk', name: 'ANNIHILATION CHAMBER', short: 'PLANET KILLER', key: 'K' },
    ],
  });

  ST.is = (id) => ST.current === id && !ST.trans;

  // Enter a station. For railgun/pk/engineering we trigger their existing views but keep
  // 'current' pointed at the station the player physically occupies.
  ST.go = function (id, opts) {
    opts = opts || {};
    const UI = SF.ui, G = SF.game;
    if (!G) return;
    if (id === ST.current && !opts.force) return;
    SF.audio.init();

    if (id === 'railgun') {
      // The railgun console is a full weapon operation; needs a target.
      const t = UI.targetRef ? UI.targetRef() : null;
      if (!t || (t.pid && t.pid.startsWith('fleet')) || !t.iid) {
        // No valid surface target: go to tactical so the player can pick one.
        SF.ui.toast('Select an enemy installation at the tactical table first.', 'loss');
        return ST.go('tactical');
      }
      const chk = SF.canFire(G, 'railgun', UI.ammo.railgun, t.pid, t.iid);
      if (!chk.ok) { SF.audio.deny(); SF.ui.toast(chk.reason, 'loss'); return; }
      UI.weapon = 'railgun'; UI.mode = 'manual';
      SF.tutorialAdvance(G, UI);
      transitionThen('railgun', () => SF.manual.open(t.pid, t.iid, UI.ammo.railgun));
      return;
    }
    if (id === 'pk') {
      const pid = opts.pid || UI.selected;
      const c = SF.canPlanetKill(G, pid);
      if (!c.ok) {
        if (SF.pkState(G).locked) { SF.ui.toast('PLANET KILLER — authorization denied. Infrastructure incomplete.', 'loss'); SF.audio.deny(); return; }
        SF.ui.toast(c.reason, 'loss'); SF.audio.deny(); return;
      }
      transitionThen('pk', () => SF.pkMode.open(pid));
      return;
    }
    if (id === 'engineering') {
      transitionThen('tactical', () => { ST.current = ST.prevFor(); SF.ui.openFortress(); });
      return;
    }
    // deck <-> tactical: canvas stations
    transition(ST.current, id);
  };
  ST.prevFor = function () { return ST.beforeStation || 'deck'; };

  function transition(from, to) {
    ST.beforeStation = from;
    ST.trans = { from, to, t: 0, dur: 0.55, kind: to === 'tactical' ? 'descend' : from === 'tactical' ? 'ascend' : 'slide' };
    SF.audio.servoSlide && SF.audio.servoSlide();
    SF.fx.shake(2, 0.3);
  }
  // Transition to a canvas station, then run a callback (used to open a console mid-wipe).
  function transitionThen(canvasStation, cb) {
    ST.beforeStation = ST.current;
    ST.trans = { from: ST.current, to: canvasStation, t: 0, dur: 0.4, kind: 'door', cb, fired: false };
    SF.audio.servoSlide && SF.audio.servoSlide();
  }

  // Advance transition; returns wipe alpha 0..1 for the renderer to draw over the frame.
  ST.update = function (dt) {
    const tr = ST.trans;
    if (!tr) return;
    tr.t += dt;
    const half = tr.dur / 2;
    if (tr.t >= half && tr.from !== tr.to) { ST.current = tr.to; tr.from = tr.to; ST.applyDOM(); }
    if (tr.cb && !tr.fired && tr.t >= half) { tr.fired = true; tr.cb(); }
    if (tr.t >= tr.dur) ST.trans = null;
  };
  // 0 at ends, 1 at midpoint — how "covered" the screen is.
  ST.wipe = function () {
    const tr = ST.trans; if (!tr) return 0;
    const k = tr.t / tr.dur;
    return 1 - Math.abs(k - 0.5) * 2;
  };
  ST.transKind = () => (ST.trans ? ST.trans.kind : null);

  // Which canvas station is being shown right now (deck or tactical).
  ST.activeCanvas = function () {
    const c = ST.trans ? ST.trans.to : ST.current;
    return c === 'deck' || c === 'tactical' ? c : (ST.beforeStation === 'deck' ? 'deck' : 'tactical');
  };

  // Build the physical station selector (chunky metal tabs) once.
  ST.buildBar = function () {
    const bar = document.getElementById('stationbar');
    if (!bar || bar.childElementCount) return;
    for (const s of ST.STATIONS) {
      const b = document.createElement('button');
      b.className = 'stn'; b.dataset.stn = s.id;
      b.innerHTML = `<span class="stn-lamp"></span><span class="stn-name">${s.short}</span><span class="stn-key">${s.key}</span>`;
      b.onclick = () => ST.go(s.id);
      bar.appendChild(b);
    }
  };

  // Reflect current station in the DOM: highlight tab, show/hide the tactical HUD groups.
  ST.applyDOM = function () {
    ST.buildBar();
    const onDeck = ST.activeCanvas() === 'deck';
    const G = SF.game;
    document.querySelectorAll('#stationbar .stn').forEach((b) => {
      const id = b.dataset.stn;
      b.classList.toggle('active', id === ST.current || (id === 'tactical' && !onDeck) || (id === 'deck' && onDeck));
      let avail = true, armed = false;
      if (id === 'railgun') { const t = SF.ui.targetRef && SF.ui.targetRef(); avail = !!(t && t.iid); armed = avail && G && SF.weaponState(G, 'railgun').ok; }
      if (id === 'pk') { avail = G && !SF.pkState(G).locked; armed = G && SF.pkState(G).ok; }
      b.classList.toggle('avail', avail);
      b.classList.toggle('armed', armed);
    });
    // HUD groups that belong to the tactical table only
    for (const gid of ['objective', 'log', 'panel', 'dock']) {
      const el = document.getElementById(gid);
      if (el) el.classList.toggle('deck-hidden', onDeck);
    }
    const deckHud = document.getElementById('deckhud');
    if (deckHud) deckHud.classList.toggle('hidden', !onDeck);
    const tb = document.getElementById('topbar');
    if (tb) tb.classList.toggle('deckmode', onDeck);
    SF.render && SF.render.layout && SF.render.layout();
  };
})();
