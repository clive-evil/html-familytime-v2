'use strict';
// ============================================================================
// TUTORIAL ("FIRST WATCH") + contextual hints + settings
// Teaches through real actions on the live simulation. While it runs the
// event director is suspended (G.dirT does not advance), so no horror fires.
// ============================================================================

const SETTINGS = { hints: true, autoPause: true, volume: 0.8 };
function loadSettings() {
  try { Object.assign(SETTINGS, JSON.parse(localStorage.getItem('longwatch.settings') || '{}')); } catch (e) { /* storage blocked */ }
}
function saveSettings() { try { localStorage.setItem('longwatch.settings', JSON.stringify(SETTINGS)); } catch (e) { /* ignore */ } }

// ---------------------------------------------------------------------------
// Contextual hints — once each, short, dismissible, never spammy
// ---------------------------------------------------------------------------
const HINTS = {
  fire: 'Fire eats oxygen and wrecks equipment. Send crew to EXTINGUISH, or seal and VENT the room. Powered fire doors close by themselves.',
  breach: 'Seal the bulkheads around a breach first, then send someone with a rebreather (engineer, technician or security) to SEAL BREACH. Open vents keep pumping air out.',
  deficit: 'Power deficit. The battery buys time. Shut down non-essential buses in POWER DISTRIBUTION before the breakers choose for you.',
  trip: 'A tripped bus stays dark until you switch it back ON, and it will trip again unless generation covers demand.',
  camera: 'No camera does not mean empty. If SENSORS are powered you still get life signs and motion. Send someone in to see.',
  refusal: 'Frightened crew can refuse dangerous orders. Select them and press INSIST to force it, at a cost to stress and morale.',
  infection: 'Symptoms are clues, not proof. Fevers have ordinary causes too. SCAN, OBSERVE, QUESTION or QUARANTINE: select the crew member.',
  down: 'A downed crew member bleeds out slowly. Medics treat automatically when free, or select a medic and right-click the casualty.',
  panic: 'Panicking crew ignore orders until it passes. Leaders, calm crew and rest help them recover.',
  scram: 'The reactor has SCRAMed. Send an engineer to RESTART REACTOR (right-click the Reactor). You are on batteries.',
  organism: 'You have seen it. Armed security can drive it off. A sealed room can be VENTED with it inside. It lives in the ducts between rooms.',
  motion: 'Motion in a room nobody should be in. You decide whether to send someone, and who.',
  quarantine: 'Quarantine doors only stay locked while the SECURITY bus is powered.',
};
function hint(id, roomId) {
  G.hintsShown = G.hintsShown || {};
  if (G.hintsShown[id] || G.ffwd || !G.started) return;
  G.hintsShown[id] = true;
  if (!SETTINGS.hints || (G.tut && G.tut.active)) return;
  const text = HINTS[id] || id;
  const box = document.getElementById('hints');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'hintToast';
  el.innerHTML = `<span class="hk">TIP</span><span class="ht">${esc(text)}</span><button class="hx" title="Dismiss">×</button>`;
  el.querySelector('.hx').onclick = (e) => { e.stopPropagation(); el.remove(); };
  if (roomId) { el.style.cursor = 'pointer'; el.onclick = () => UI.focusRoom(roomId, true); }
  box.appendChild(el);
  while (box.children.length > 2) box.removeChild(box.firstChild);
  setTimeout(() => el.remove(), 16000);
}

// ---------------------------------------------------------------------------
// FIRST WATCH tutorial
// ---------------------------------------------------------------------------
const TUT = {
  steps: [],
  init() {
    G.tut = { active: false, i: 0, sub: 0, t: 0, flags: {} };
    this.steps = [
      {
        id: 'look', label: 'Look around',
        text: () => (G.tut.sub < 5 ? [
          ['YOU ARE WATCH OFFICER FOR SECTION 06.', 'Keep the section powered, pressurised and alive.'],
          ['CREW', 'Twelve people are awake on this watch. Their health, oxygen and stress are listed here.'],
          ['SHIP RESOURCES', 'Power, stored oxygen, food, water, spares, hull, morale, and the colonists asleep below.'],
          ['POWER DISTRIBUTION', 'What the reactor makes, and what you choose to spend it on.'],
          ['EVENT LOG', 'Confirms what happened. Click a line to jump to the room.'],
        ][G.tut.sub] : ['LOOK AROUND', 'Mouse wheel zooms. Drag (or WASD) to pan. Try it.']),
        focus: () => [{ world: 'ship' }, { dom: '#left' }, { dom: '#gauges' }, { dom: '#powerPanel' }, { dom: '#logWrap' }, { world: 'ship' }][Math.min(5, G.tut.sub)],
        tick(dt) { if (G.tut.sub < 5) { G.tut.t += dt; if (G.tut.t > 3.6) { G.tut.t = 0; G.tut.sub++; } } },
        done: () => G.tut.sub >= 5 && G.tut.flags.cam,
        pre: () => { G.tut.flags.cam = false; },
      },
      {
        id: 'room', label: 'Inspect a room',
        text: () => (UI.sel && UI.sel.type === 'room' && UI.sel.id === 'o2'
          ? ['ROOM STATUS', 'Pressure and oxygen keep crew alive. Integrity is the machinery. Power and camera decide whether you can see in. Crew present are listed below.']
          : ['INSPECT A ROOM', 'Click OXYGEN PROCESSING to inspect its condition.']),
        focus: () => (UI.sel && UI.sel.type === 'room' && UI.sel.id === 'o2' ? { dom: '#ctx' } : { world: 'o2' }),
        cont: () => UI.sel && UI.sel.type === 'room' && UI.sel.id === 'o2',
        done: () => G.tut.flags.cont,
      },
      {
        id: 'crew', label: 'Select crew',
        text: () => (UI.sel && UI.sel.type === 'crew'
          ? ['CREW FILE', `Profession, current job, health, stress, traits and relationships. Experienced crew are valuable. Death is permanent.`]
          : ['SELECT CREW', 'Every crew member has a profession, skills, traits and relationships. Click INES HARPER in the crew list (or on the ship).']),
        focus: () => (UI.sel && UI.sel.type === 'crew' ? { dom: '#ctx' } : { dom: '#cr_2' }),
        cont: () => UI.sel && UI.sel.type === 'crew',
        done: () => G.tut.flags.cont,
      },
      {
        id: 'order', label: 'Repair a fault',
        pre: () => {
          const r = G.roomById.hydro; r.integ = 78;
          logEvent('warn', 'HYDROPONICS: circulation pump filter requires service.', 'hydro', { cat: 'system' });
        },
        text: () => {
          const ordered = G.crew.some((c) => c.alive && c.task && c.task.type === 'repair' && c.task.room === 'hydro');
          if (ordered) return ['ORDERS ARE PHYSICAL', 'Crew walk there: through doors, up ladders, past hazards. Distance and closed doors cost time. Watch them work.'];
          const sel = UI.sel && UI.sel.type === 'crew' ? G.crew[UI.sel.id] : null;
          if (!sel) return ['GIVE AN ORDER', 'Select an engineer first: INES HARPER is one.'];
          return ['GIVE AN ORDER', `${sel.first} is selected. RIGHT-CLICK the HYDROPONICS room and choose REPAIR.`];
        },
        focus: () => (UI.sel && UI.sel.type === 'crew' ? { world: 'hydro' } : { dom: '#cr_2' }),
        done: () => G.roomById.hydro.integ >= 99 || (G.tut.flags.orderT && G.t - G.tut.flags.orderT > 30),
        tick() { if (!G.tut.flags.orderT && G.crew.some((c) => c.task && c.task.type === 'repair' && c.task.room === 'hydro')) G.tut.flags.orderT = G.t; },
      },
      {
        id: 'power', label: 'Balance power',
        pre: () => { G.tutCap = 98; G.battery = Math.min(G.battery, 55); logEvent('warn', 'REACTOR: output reduced for scheduled turbine inspection. Running short.', 'reactor', { cat: 'system' }); },
        text: () => {
          if (!G.tut.flags.habOff && G.groups.HAB.on) return ['POWER', 'The reactor cannot always power everything. Demand is higher than output and the battery is draining. Switch HABITATION OFF.'];
          G.tut.flags.habOff = true;
          if (!G.groups.HAB.on) return ['CONSEQUENCES', 'Quarters and the mess go dark and demand drops. LIFE SUPPORT, MEDICAL, SECURITY and SENSORS all depend on power too. Inspection done: switch HABITATION back ON.'];
          return ['RESTORED', 'Good.'];
        },
        tick() { if (G.tut.flags.habOff && !G.tut.flags.capOff && !G.groups.HAB.on) { G.tut.flags.capT = (G.tut.flags.capT || 0) + 1; } if (G.tut.flags.habOff) G.tutCap = 0; },
        focus: () => ({ dom: G.tut.flags.habOff && !G.groups.HAB.on ? '#pg_HAB' : '#pg_HAB' }),
        done: () => G.tut.flags.habOff && G.groups.HAB.on,
        post: () => { G.tutCap = 0; },
      },
      {
        id: 'leak', label: 'Seal a leak',
        pre: () => {
          const r = G.roomById.airlock; breachRoom(r, 0.07, 24); r.breachY = r.y0 + 90; r.tutLeak = true;
          G.res.hull = Math.min(100, G.res.hull + 1);
          const d = G.doorById.d_air_sec; d.mode = 'open'; d.anim = 1; d.override = G.t + 9999;
          logEvent('warn', 'AIRLOCK: outer hatch gasket leaking. Pressure dropping.', 'airlock', { cat: 'system' });
        },
        text: () => (G.doorById.d_air_sec.mode === 'open'
          ? ['BULKHEADS', 'Open doors spread pressure loss. Bulkheads contain it. Click the door between AIRLOCK and SECURITY and CLOSE it.']
          : ['CONTAINED', 'Pressure loss is now limited to the airlock. Powered doors close themselves on a big pressure drop, but not when the power is out. A technician will reseat the gasket.']),
        focus: () => ({ door: 'd_air_sec' }),
        tick() {
          const d = G.doorById.d_air_sec;
          if (d.mode !== 'open' && !G.tut.flags.sealedT) G.tut.flags.sealedT = G.t;
          if (G.tut.flags.sealedT && G.t - G.tut.flags.sealedT > 7 && G.roomById.airlock.breach > 0) { G.roomById.airlock.breach = 0; G.roomById.airlock.scars.push({ k: 'patch', x: 24, y: G.roomById.airlock.y0 + 90 }); logEvent('info', 'AIRLOCK gasket reseated. Pressure recovering.', 'airlock'); }
        },
        done: () => G.tut.flags.sealedT && G.roomById.airlock.breach === 0 && G.t - G.tut.flags.sealedT > 9,
        post: () => { G.doorById.d_air_sec.override = 0; G.roomById.airlock.tutLeak = false; },
      },
      {
        id: 'camera', label: 'Restore camera',
        pre: () => { const r = G.roomById.cryo; r.cameraOK = false; r.tutCam = true; },
        text: () => ['INFORMATION', 'Without power and cameras you lose sight of a room. Sensors still count life signs: here, 0. During real emergencies you may have to send crew into rooms you cannot see.'],
        focus: () => ({ world: 'cryo' }),
        cont: () => true,
        done: () => G.tut.flags.cont,
        post: () => { const r = G.roomById.cryo; r.cameraOK = true; r.tutCam = false; logEvent('info', 'CRYO BAY camera feed restored.', 'cryo'); },
      },
    ];
  },
  start() {
    G.tut.active = true; G.tut.i = 0; this.begin();
    document.getElementById('tutList').style.display = 'block';
    this.renderList();
  },
  begin() {
    const s = this.steps[G.tut.i]; G.tut.sub = 0; G.tut.t = 0; G.tut.flags.cont = false; G.tut.flags.orderT = 0;
    if (s.pre) s.pre();
    this.renderList();
  },
  next() {
    const s = this.steps[G.tut.i]; if (s.post) s.post();
    G.tut.i++; AUDIO.ack();
    if (G.tut.i >= this.steps.length) return this.finish();
    this.begin();
  },
  skip() { if (!G.tut.active) return; const s = this.steps[G.tut.i]; if (s && s.post) s.post(); G.tutCap = 0; this.finish(true); },
  finish(skipped) {
    G.tut.active = false; G.tut.finished = true;
    document.getElementById('tutBox').style.display = 'none';
    document.getElementById('tutFrame').style.display = 'none';
    // routine continues from a short way into the watch; tutorial beats are not repeated
    G.dirT = Math.max(G.dirT, skipped ? 30 : 100);
    G.tutDone = !skipped; G.director.flavT = 45; G.director.next = 60;
    for (const b of ['o2filter', 'door', 'powerhint']) G.director.beats[b] = G.t;
    this.renderList(true);
    const ban = document.getElementById('banner');
    ban.innerHTML = `<b>WATCH INITIALISED</b><span>Keep the ship running. Respond to alerts. Pause (SPACE) whenever you need time to think.</span>`;
    ban.classList.add('show'); setTimeout(() => ban.classList.remove('show'), 6500);
    logEvent('story', 'First-watch checks complete. Routine operations.', null, { cat: 'system' });
    setTimeout(() => { document.getElementById('tutList').classList.add('collapsed'); }, 2500);
  },
  update(dt) {
    if (!G.tut || !G.tut.active) return;
    const s = this.steps[G.tut.i];
    if (s.tick) s.tick(dt);
    if (s.done()) this.next();
  },
  renderList(final) {
    const el = document.getElementById('tutItems'); if (!el) return;
    el.innerHTML = this.steps.map((s, i) => `<div class="ti ${i < G.tut.i || final ? 'ok' : i === G.tut.i && G.tut.active ? 'cur' : ''}" data-i="${i}"><i>${i < G.tut.i || final ? '✓' : ''}</i>${s.label}</div>`).join('');
  },
  // called each UI tick: callout text + highlight frame
  present() {
    const box = document.getElementById('tutBox'), fr = document.getElementById('tutFrame');
    if (!G.tut || !G.tut.active) { box.style.display = 'none'; fr.style.display = 'none'; return; }
    const s = this.steps[G.tut.i];
    const [title, body] = s.text();
    const showCont = s.cont && s.cont();
    const html = `<div class="tt">${esc(title)}</div><div class="tb">${esc(body)}</div><div class="tf">${showCont ? '<button id="tutCont">CONTINUE</button>' : ''}<button id="tutSkip" class="lnk">skip tutorial</button><span class="tn">${G.tut.i + 1}/${this.steps.length}</span></div>`;
    if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; const c = document.getElementById('tutCont'); if (c) c.onclick = () => { G.tut.flags.cont = true; }; document.getElementById('tutSkip').onclick = () => this.skip(); }
    box.style.display = 'block';
    // highlight rect
    const f = s.focus(); let rect = null;
    // bring world targets into the visible part of the ship view (once per target)
    const fkey = G.tut.i + ':' + (f.world || f.door || f.dom);
    if (fkey !== this.lastFocus) {
      this.lastFocus = fkey;
      if (f.world && f.world !== 'ship') { const r = G.roomById[f.world]; R.cam.tx = r.cx + 60 / R.cam.tz; R.cam.ty = r.cy + 40 / R.cam.tz; }
      else if (f.door) { const d = G.doorById[f.door]; R.cam.tx = d.x + 150; R.cam.ty = G.roomById[d.a].cy + 60; R.cam.tz = Math.max(R.cam.tz, 0.9); }
    }
    if (f.dom) { const t = document.querySelector(f.dom); if (t) { const b = t.getBoundingClientRect(); rect = { x: b.left, y: b.top, w: b.width, h: b.height }; } }
    else if (f.world) {
      let x0, y0, x1, y1;
      if (f.world === 'ship') { x0 = -10; y0 = -10; x1 = SHIP_W + 10; y1 = DECK_TOP[2] + ROOM_H + 10; } else { const r = G.roomById[f.world]; x0 = r.x0; y0 = r.y0; x1 = r.x1; y1 = r.y1; }
      const [a, b] = w2s(x0, y0), [c, d] = w2s(x1, y1); rect = { x: a, y: b, w: c - a, h: d - b };
    } else if (f.door) { const d = G.doorById[f.door]; const yy = d.hatch ? d.y : G.roomById[d.a].fy - 25; const [a, b] = w2s(d.x, yy); rect = { x: a - 22, y: b - 40, w: 44, h: 80 }; }
    if (rect) {
      fr.style.display = 'block'; fr.style.left = rect.x - 4 + 'px'; fr.style.top = rect.y - 4 + 'px'; fr.style.width = rect.w + 8 + 'px'; fr.style.height = rect.h + 8 + 'px';
      // place the callout beside the target, clamped to the ship view
      const bw = 340, bh = box.offsetHeight || 120; const W = window.innerWidth, H = window.innerHeight;
      let bx, by;
      if (rect.x > W * 0.6) { bx = rect.x - bw - 18; by = rect.y + 10; }
      else if (rect.x + rect.w < W * 0.3) { bx = rect.x + rect.w + 18; by = rect.y + 10; }
      else if (rect.y > H * 0.5) { bx = rect.x + rect.w / 2 - bw / 2; by = rect.y - bh - 18; }
      else { bx = rect.x + rect.w / 2 - bw / 2; by = rect.y + rect.h + 18; }
      if (f.world === 'ship' || rect.h > H * 0.5) { bx = W / 2 - bw / 2; by = 96; }
      box.style.left = clamp(bx, 8, W - bw - 8) + 'px'; box.style.top = clamp(by, 56, H - bh - 8) + 'px';
    } else fr.style.display = 'none';
  },
};

// settings popover
function initSettings() {
  const pop = document.getElementById('settings');
  document.getElementById('btnSettings').onclick = (e) => { e.stopPropagation(); pop.style.display = pop.style.display === 'block' ? 'none' : 'block'; };
  document.addEventListener('click', (e) => { if (!pop.contains(e.target) && e.target.id !== 'btnSettings') pop.style.display = 'none'; });
  const hintsCb = document.getElementById('setHints'), apCb = document.getElementById('chkAuto'), vol = document.getElementById('setVol');
  hintsCb.checked = SETTINGS.hints; apCb.checked = SETTINGS.autoPause; vol.value = SETTINGS.volume;
  UI.autoPauseOn = SETTINGS.autoPause;
  hintsCb.onchange = () => { SETTINGS.hints = hintsCb.checked; saveSettings(); if (!SETTINGS.hints) document.getElementById('hints').innerHTML = ''; };
  apCb.onchange = () => { SETTINGS.autoPause = apCb.checked; UI.autoPauseOn = apCb.checked; saveSettings(); };
  vol.oninput = () => { SETTINGS.volume = +vol.value; AUDIO.setVolume(SETTINGS.volume); saveSettings(); };
  document.getElementById('tutItems').addEventListener('click', (e) => {
    const it = e.target.closest('.ti'); if (!it) return;
    const s = TUT.steps[+it.dataset.i]; const f = s.focus ? s.focus() : null;
    if (f && f.world && f.world !== 'ship') UI.focusRoom(f.world); else if (f && f.door) UI.focusRoom(G.doorById[f.door].a); else if (f && f.world === 'ship') UI.fitShip();
  });
  document.getElementById('tutHead').onclick = () => document.getElementById('tutList').classList.toggle('collapsed');
}
