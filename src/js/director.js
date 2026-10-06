'use strict';
// ============================================================================
// DIRECTOR — systemic event selection. Phase biases probabilities; ship state
// decides what is plausible. Beats are state-conditioned anchors, not cutscenes.
// ============================================================================

function outerRooms() { // rooms with hull exposure
  return G.rooms.filter((r) => r.deck === 0 || r.deck === 2 || r.x0 === 0 || r.x1 === SHIP_W);
}
function activeCrises() {
  let n = 0; for (const r of G.rooms) { if (r.fire > 0.05) n++; if (r.breach > 0) n++; }
  if (G.reactor.needsRestart) n++; if (G.creatures.some((m) => m.alive && m.state === 'room')) n++;
  return n;
}

const EVENTS = {
  meteor: {
    phase: 2, w: () => 0.6 + (G.phase >= 5 ? 0.3 : 0),
    run(opts = {}) {
      const target = opts.room ? G.roomById[opts.room] : pick(outerRooms());
      const warn = G.sensors ? 6 : 0.8;
      const bridgeManned = G.crew.some((c) => c.alive && c.room === 'bridge' && c.atWork && c.prof === 'Officer');
      if (G.sensors) logEvent('warn', `DEBRIS RADAR: impact track converging on ${DECK_NAME[target.deck]} — ${target.short}. ${Math.round(warn)}s.${bridgeManned ? ' Bridge plotting evasive burn.' : ''}`, target.id);
      AUDIO.blip(1200, 0.2);
      const sx = target.cx + (target.deck === 0 ? -300 : 300), sy = target.deck === 0 ? -600 : target.deck === 2 ? 1100 : (target.x0 === 0 ? -400 : 2400);
      G.meteor = { t: 0, dur: warn, sx, sy, tx: target.cx, ty: target.cy, room: target.id, seed: opts.seed, size: opts.size, evade: bridgeManned };
    },
  },
  electrical_fire: {
    phase: 2, w: () => 0.6 + (G.brownout ? 0.8 : 0) + G.rooms.filter((r) => r.elecFault).length * 0.2 + (G.roomById.reactor.integ < 60 ? 0.3 : 0),
    run() {
      const cands = G.rooms.filter((r) => r.p > 60 && r.fire === 0);
      const r = weighted(cands.map((x) => ({ w: 1 + (x.elecFault ? 3 : 0) + (100 - x.integ) / 30, v: x })));
      if (!r) return;
      FX.sparks(r.cx, r.y0 + 20, 12); AUDIO.sparkBurst(r);
      r.elecFault = true; igniteRoom(r, 0.12, 'electrical');
    },
  },
  coolant_leak: {
    phase: 2, w: () => (G.roomById.reactor.leak ? 0 : 0.7 + (G.roomById.reactor.integ < 70 ? 0.6 : 0)),
    run() { const r = G.roomById.reactor; r.leak = true; damageRoom(r, 8); logEvent('crit', 'COOLANT LEAK — REACTOR primary loop. Coolant pressure falling. Reactor will destabilise.', 'reactor'); AUDIO.noise(2, { vol: 0.15, freq: 3000, q: 0.5, x: 400, y: 450 }); },
  },
  o2_failure: {
    phase: 1, w: () => (G.roomById.o2.integ > 60 ? 0.7 : 0.2),
    run() { const r = G.roomById.o2; damageRoom(r, rnd(22, 35)); if (chance(0.3)) r.elecFault = true; logEvent('crit', `O2 PROCESSING fault: electrolysis stack ${rint(1, 4)} shorted. Output down to ${Math.round(r.integ)}%.`, 'o2'); },
  },
  reactor_instability: {
    phase: 2, w: () => (G.reactor.needsRestart ? 0 : 0.6 + (G.roomById.reactor.integ < 60 ? 0.6 : 0)),
    run() { G.reactor.instability = Math.min(0.92, G.reactor.instability + 0.35); damageRoom(G.roomById.reactor, 10); logEvent('crit', 'REACTOR INSTABILITY — neutron flux oscillating. Assign an operator or risk a SCRAM.', 'reactor'); AUDIO.groan(0.7); },
  },
  medical: {
    phase: 1, w: () => 0.7,
    run() {
      const c = pick(G.crew.filter((x) => crewAvailable(x) && x.hp > 70)); if (!c) return;
      const kind = pick(['burn', 'fall', 'fever', 'fever', 'crush']);
      if (kind === 'fever') { c.fever = 220; c.hp -= 10; logEvent('warn', `${c.name} reporting fever and chills. Probably the recycled air. Probably.`, c.room); }
      else if (kind === 'fall') { hurt(c, rint(25, 40), 'fall from ladder'); logEvent('warn', `${c.name} fell from a ladder in ${crewRoom(c).short}.`, c.room); }
      else if (kind === 'burn') { hurt(c, rint(20, 32), 'steam burn'); logEvent('warn', `${c.name} scalded by a steam line in ${crewRoom(c).short}.`, c.room); }
      else { hurt(c, rint(35, 55), 'crushed hand'); logEvent('warn', `${c.name} caught a hand in a hatch mechanism. Bad.`, c.room); }
    },
  },
  crew_panic: {
    phase: 3, w: () => { const s = G.crew.filter((c) => c.alive && c.stress > 65 && c.panicT <= 0).length; return s ? 0.5 + s * 0.4 : 0; },
    run() { const c = G.crew.filter((x) => crewAvailable(x) && x.stress > 60).sort((a, b) => b.stress - a.stress)[0]; if (c) startPanic(c); },
  },
  door_malfunction: {
    phase: 1, w: () => 0.6,
    run() { const d = pick(G.doors.filter((x) => !x.outer && !x.jammed && x.mode !== 'sealed')); d.jammed = true; logEvent('warn', `DOOR FAULT: ${doorLabel(d)} jammed ${d.anim > 0.5 ? 'OPEN' : 'SHUT'}. Repair an adjacent room to free it.`, d.a); AUDIO.noise(0.3, { vol: 0.1, freq: 900, q: 4, x: d.x, y: d.y }); },
  },
  camera_failure: {
    phase: 2, w: () => 0.5 + (G.phase >= 3 ? 0.6 : 0),
    run() { const r = pick(G.rooms.filter((x) => x.cameraOK)); if (!r) return; r.cameraOK = false; },
  },
  unknown_noise: {
    phase: 3, w: () => 0.9,
    run() {
      const m = G.creatures.find((x) => x.alive);
      const r = m ? G.roomById[m.state === 'vent' ? m.ventRoom : m.room] : G.nestRoom ? G.roomById[G.nestRoom] : pick(G.rooms);
      const who = G.crew.find((c) => crewAvailable(c) && c.room === r.id) || G.crew.find((c) => crewAvailable(c) && G.adj[r.id].some((e) => e.to === c.room));
      AUDIO.knock(r.vent); setTimeout(() => AUDIO.ductScrape(r), 600);
      if (who) logEvent('story', `${who.name}: "Did anyone else hear that? Something in the duct above ${r.short}."`, r.id, { story: true });
      else logEvent('warn', `Acoustic sensor: unidentified knocking in ducts near ${r.short}.`, r.id);
      r.ductMotion = 1;
    },
  },
  infection_clue: {
    phase: 3, w: () => (G.crew.some((c) => c.alive && c.infection && c.infection.stage >= 1) || (G.foodTheft || 0) > 2 ? 1.1 : 0),
    run() {
      const inf = G.crew.filter((c) => c.alive && c.infection && c.infection.stage >= 1);
      const r = rint(0, 2);
      if (r === 0 || !inf.length) {
        const excess = Math.round(20 + inf.length * 25 + (G.foodTheft || 0) * 4);
        logEvent('story', `QUARTERMASTER LOG: ration draw exceeds crew allocation by ${excess}%. Nobody admits to it.`, 'mess', { story: true });
      } else if (r === 1 && G.sensors) {
        const c = pick(inf); logEvent('warn', `BIOMONITOR: ${c.name} core temperature ${c.bodyTemp.toFixed(1)}°C. Heart rate unusually low for that temperature.`, c.room);
      } else {
        const c = pick(inf); const room = G.rooms.find((x) => x.id === (c.infection.lastWander || c.room));
        room.blood.push({ x: rnd(room.x0 + 30, room.x1 - 30), y: room.fy, s: 0.5, odd: true });
        logEvent('story', `Dark, viscous stain found on the deck in ${room.short}. Not oil. Not quite blood.`, room.id, { story: true });
      }
    },
  },
  intrusion: {
    phase: 4, w: () => (G.creatures.some((m) => m.alive) ? 0.4 : 1.2),
    run() {
      const m = G.creatures.find((x) => x.alive);
      if (m) { m.stalk = false; m.hunger = Math.max(m.hunger, 75); m.timer = 0; return; }
      const nest = G.nestRoom ? G.roomById[G.nestRoom] : G.roomById.cryo;
      if (!nest.hatched) { nest.contam = 1; return; }
      // a second brood only late, only if the nest was never burned out, and never right after a kill
      if (G.phase >= 5 && nest.contam > 0.5 && (G.nestSpawns || 0) < 2 && G.t - (G.lastKillT || -999) > 240) { G.nestSpawns = (G.nestSpawns || 1) + 1; spawnCreature(nest.id, {}); }
    },
  },
  hydro_blight: {
    phase: 2, w: () => 0.4,
    run() { const r = G.roomById.hydro; damageRoom(r, 18); G.res.food = Math.max(0, G.res.food - 5); logEvent('warn', `HYDROPONICS: root rot in tray ${rint(2, 9)}. Crop loss. ${G.contamSeededAt ? 'Roots are coated in something grey.' : ''}`, 'hydro'); },
  },
  water_leak: {
    phase: 1, w: () => 0.4,
    run() { G.res.water = Math.max(0, G.res.water - 7); const r = pick([G.roomById.o2, G.roomById.mess, G.roomById.hydro]); damageRoom(r, 10); logEvent('warn', `Reclamation line ruptured in ${r.short}. Lost potable water.`, r.id); },
  },
  argument: {
    phase: 2, w: () => (G.crew.some((c) => c.alive && c.stress > 55 && hasTrait(c, 'Hot-Tempered')) ? 0.6 : 0.1),
    run() { const c = G.crew.filter((x) => crewAvailable(x)).sort((a, b) => b.stress - a.stress)[0]; if (c) argument(c); },
  },
  power_surge: {
    phase: 2, w: () => 0.5 + (G.reactor.instability > 0.3 ? 0.8 : 0),
    run() { const r = pick(G.rooms.filter((x) => x.powered)); if (!r) return; r.elecFault = true; G.battery = Math.max(0, G.battery - 12); FX.sparks(r.cx, r.y0 + 20, 14); AUDIO.sparkBurst(r); logEvent('warn', `POWER SURGE — ${r.short} breaker blown. Local power lost.`, r.id); if (chance(0.25)) igniteRoom(r, 0.1); },
  },
  glimpse: {
    phase: 3, w: () => (G.creatures.some((m) => m.alive && m.state === 'vent' && G.roomById[m.ventRoom].observed) ? 1 : 0),
    run() {
      const m = G.creatures.find((x) => x.alive && x.state === 'vent' && G.roomById[x.ventRoom].observed); if (!m) return;
      const r = G.roomById[m.ventRoom];
      G.glimpse = { room: r.id, t: G.t, x: darkSpot(r) }; r.interference = 1; AUDIO.staticBurst(0.6);
      logEvent('warn', `CAMERA ${r.short}: feed interference. Frame 0441 shows a tall shape near the ${pick(['vent', 'far wall', 'bulkhead'])}. Next frame: nothing.`, r.id, { story: true });
    },
  },
  salvage_offer: { phase: 99, w: () => 0, run() { offerSalvage(); } },
};

function evaTeam() {
  const avail = G.crew.filter((c) => crewAvailable(c) && !c.quarantined && c.panicT <= 0 && c.duty !== 'reactor' && c.prof !== 'Officer');
  const team = avail.filter((c) => ['Engineer', 'Technician'].includes(c.prof)).sort((a, b) => b.skills.ath - a.skills.ath).slice(0, 1);
  const rest = avail.filter((c) => !team.includes(c)).sort((a, b) => (b.prof === 'Scientist') - (a.prof === 'Scientist') || b.skills.ath - a.skills.ath);
  if (rest.length) team.push(rest[0]);
  return team;
}
function offerSalvage() {
  const team = evaTeam();
  UI.decision({
    title: 'DEBRIS FIELD — SALVAGE OPPORTUNITY',
    body: 'Long-range optics have a drifting hull fragment 400 m off the port quarter. No transponder. Spectrometry says steel, polymer and a lot of frozen water. Two crew could reach it on tethers and strip it for parts and medical stores.\n\nSpare parts: ' + Math.round(G.res.parts) + '. Medical: ' + Math.round(G.res.med) + '.',
    options: [
      { label: team.length >= 2 ? `SEND ${team[0].first.toUpperCase()} & ${team[1].first.toUpperCase()} ON EVA` : 'SEND EVA TEAM', fn: () => {
        if (team.length < 2 || !team.every(crewAvailable)) { logEvent('warn', 'Not enough crew available for EVA.'); return; }
        launchEVA(team.map((c) => c.id));
      } },
      { label: 'IGNORE IT', fn: () => { logEvent('info', 'Salvage declined. The fragment tumbles out of sensor range.'); G.declinedSalvage = true; } },
    ],
  });
}

function makeDirector() {
  const D = {
    next: 30, beats: {}, flags: {},
    flag(k) { this.flags[k] = (this.flags[k] || 0) + 1; if (k === 'emerge' || k === 'creature') this.flags.lastCreatureT = G.t; },
    beat(id, cond, fn) { if (!this.beats[id] && cond()) { this.beats[id] = G.t; fn(); } },
    update(dt) {
      const t = G.t;
      // phase
      let ph = 1; for (const p of PHASES) if (t >= p.t) ph = p.id;
      if (G.firstSighting && ph < 4) ph = 4;
      if (ph !== G.phase) { G.phase = ph; if (G.fullLog) G.fullLog.push({ t: G.t, sev: 'phase', text: `— ${PHASES[ph - 1].name} —` }); }
      // meteor impact resolution
      if (G.meteor) { G.meteor.t += dt; if (G.meteor.t >= G.meteor.dur) { resolveMeteor(G.meteor); G.meteor = null; } }
      // delayed logs
      if (G.delayedLogs) { for (const d of G.delayedLogs) if (!d.done && t >= d.t) { d.done = true; d.fn(); } G.delayedLogs = G.delayedLogs.filter((d) => !d.done); }
      if (G.pendingMissing) for (const p of G.pendingMissing) if (!p.done && t >= p.t) { p.done = true; const c = G.crew[p.id]; if (c.alive) { c.alive = false; c.deadAt = t; c.deathCause = 'taken'; c.unconfirmed = true; G.deaths++; if (!G.sensors) logEvent('warn', `${c.name} has not checked in since ${fmtClock(c.missingAt || p.t).str}. Last known: ${G.roomById[c.lastSeenRoom || c.room].short}.`, null, { story: true }); } }

      // ---- beats (tutorial calm → first fright) ----
      this.beat('o2filter', () => t > 18, () => { const r = G.roomById.o2; r.integ = 68; logEvent('warn', 'O2 PROCESSING: electrolysis stack 2 efficiency falling. Filter fouling.', 'o2'); logEvent('hint', 'Select a crew member (left list or click them), then RIGHT-CLICK a room for orders. Engineers and technicians repair fastest.'); });
      this.beat('cut', () => t > 58, () => { const c = G.crew.find((x) => x.first === 'Kit') || pick(G.crew); hurt(c, 34, 'laceration'); logEvent('warn', `${c.name} gashed a hand on a hydroponics tray bracket. Bleeding.`, c.room); logEvent('hint', 'Medics treat the injured automatically when idle. Select a crew member to see vitals, skills and relationships.'); });
      this.beat('door', () => t > 96, () => { const d = G.doorById.d_mes_hyd; d.jammed = true; d.anim = 1; logEvent('warn', `DOOR FAULT: ${doorLabel(d)} jammed OPEN.`, 'mess'); logEvent('hint', 'Click a door to open / close / lock / seal it remotely. Doors need power. Jammed doors free up when an adjacent room is repaired.'); });
      this.beat('powerhint', () => t > 125, () => logEvent('hint', 'POWER panel (right): reactor output vs demand. If generation falls short, batteries drain, then breakers trip. You choose what goes dark. Keep an operator in the REACTOR.'));
      this.beat('coolant', () => t > 168, () => EVENTS.coolant_leak.run());
      this.beat('meteor1', () => t > 240, () => EVENTS.meteor.run({ room: chance(0.6) ? 'workshop' : 'reactor', seed: true, size: 0.38 }));
      this.beat('salvage', () => t > 440 && (activeCrises() < 2 || t > 560), () => offerSalvage());
      this.beat('fright', () => t > 525 && G.nestRoom && !G.firstSighting, () => firstFright());
      this.beat('food', () => t > 640, () => EVENTS.infection_clue.run());
      this.beat('ensureInfection', () => t > 700 && !G.infectedEver, () => {
        // whoever spent time near the nest picks it up
        const nest = G.nestRoom || 'workshop';
        const c = G.crew.filter((x) => x.alive && !x.missing).sort((a, b) => (a.duty === nest ? -1 : 0) - (b.duty === nest ? -1 : 0))[0];
        exposeInfection(c, 'contamination');
        G.delayedLogs = G.delayedLogs || []; G.delayedLogs.push({ t: G.t + 30, fn: () => logEvent('info', `${c.name} logged a rash on the forearm after maintenance near the ${G.roomById[nest].short} vents. Applied cream.`, 'medbay') });
      });
      this.beat('hatch', () => t > 800 && !G.creatures.some((m) => m.alive) && G.nestRoom && !G.roomById[G.nestRoom].hatched, () => { G.roomById[G.nestRoom].contam = 1; });
      this.beat('cascade', () => t > 1150, () => {
        logEvent('crit', 'Hull stress sensors spiking across SECTION 6. Something is wrong with the frame.', null, { story: true });
        G.reactor.instability = Math.min(0.9, G.reactor.instability + 0.5); EVENTS.meteor.run({ size: 0.3 });
        for (const m of G.creatures) if (m.alive) { m.stalk = false; m.hunger = 90; }
      });
      if (G.firstFright && G.firstFright.step === 1 && t > G.firstFright.t + 8) {
        G.firstFright.step = 2; const r = G.roomById[G.firstFright.room];
        r.ghost = t + 14;
        if (G.sensors) logEvent('crit', `UNIDENTIFIED MOTION — ${DECK_NAME[r.deck]} / ${r.short}. Life signs: ${r.lifeSigns + 1}.`, r.id, { story: true });
        else logEvent('warn', `Something knocked twice inside ${r.short}. Then nothing.`, r.id, { story: true });
        AUDIO.knock(r.vent);
        if (UI.autoPause) UI.autoPause('UNIDENTIFIED MOTION');
      }

      // ---- random systemic events ----
      this.next -= dt;
      if (this.next <= 0 && t > 140) {
        const base = [0, 62, 50, 42, 34, 24][G.phase];
        this.next = rnd(base * 0.75, base * 1.25);
        const crises = activeCrises();
        if (crises >= [9, 2, 2, 2, 3, 4][G.phase]) { this.next *= 0.5; return; }
        const items = Object.entries(EVENTS).filter(([, e]) => G.phase >= e.phase).map(([k, e]) => ({ w: e.w() * (k === this.last ? 0.3 : 1), v: k }));
        const k = weighted(items);
        if (k) { this.last = k; EVENTS[k].run(); }
      }
    },
  };
  return D;
}

function firstFright() {
  const nest = G.roomById[G.nestRoom];
  const neigh = G.adj[nest.id].map((e) => G.roomById[e.to]).filter((r) => r.observed);
  const r = neigh.length ? pick(neigh) : nest;
  G.firstFright = { room: r.id, t: G.t, step: 1 };
  r.cameraOK = false; r.cameraJammed = true;
  r.ductMotion = 1;
  AUDIO.staticBurst(0.8);
}

function resolveMeteor(m) {
  const r = G.roomById[m.room];
  let size = m.size || rnd(0.15, 0.4);
  if (m.evade) size *= 0.55;
  if (!G.sensors) size *= 1.25;
  G.shake = 9 * size + 3;
  AUDIO.impact(Math.min(1.2, 0.6 + size));
  breachRoom(r, size, m.room === 'workshop' ? 60 : undefined);
  damageRoom(r, 10 + size * 40);
  FX.sparks(r.breachX, r.breachY, 20);
  for (const c of G.crew) if (c.alive && c.room === r.id && !c.eva) { const d = Math.abs(c.x - r.breachX); if (d < 140) hurt(c, (1 - d / 140) * 45 * size * 2 + 6, 'impact shrapnel'); }
  if (chance(0.3 + size)) igniteRoom(r, 0.1);
  if (chance(0.5)) r.cameraOK = false;
  if (G.eva) for (const id of G.eva.ids) if (G.crew[id].eva && chance(0.3)) { hurt(G.crew[id], 25, 'debris strike during EVA'); logEvent('crit', `${G.crew[id].name} hit by debris on EVA.`, 'airlock'); }
  logEvent('crit', `IMPACT — ${DECK_NAME[r.deck]} / ${r.short}. Hull breached. Pressure falling.`, r.id, { story: true });
  if (!G._breachHint) { G._breachHint = true; logEvent('hint', 'Air is escaping through every OPEN door connected to the breach. Close or seal doors around it, then send someone with a rebreather (engineer / technician / security) to SEAL BREACH.'); }
  if (UI.autoPause && size > 0.25) UI.autoPause('HULL BREACH');
  if (m.seed && !G.nestRoom) {
    seedContamination(r, 'meteor');
    G.delayedLogs = G.delayedLogs || []; G.delayedLogs.push({ t: G.t + 50, fn: () => logEvent('info', `Debris analysis (${r.short}): impactor fragment carbonaceous. Unusually warm on recovery. Logged for science.`, r.id) });
  }
}
