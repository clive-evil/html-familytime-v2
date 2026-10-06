'use strict';
// ============================================================================
// THREAT — organism, contamination, hidden infection, EVA salvage
// ============================================================================

function initThreat() {
  G.creatures = [];
  G.research = { samples: 0, prog: 0, m50: false, m100: false };
  G.eva = null;
}

// vent graph shares structural adjacency, but sealed rooms have their vents shut
function ventOpen(roomId) { const r = G.roomById[roomId]; return r && !r.sealed; }
function ventPath(from, to) {
  if (from === to) return [];
  const prev = { [from]: null }; const q = [from];
  while (q.length) {
    const cur = q.shift(); if (cur === to) break;
    for (const e of G.adj[cur]) if (!(e.to in prev) && ventOpen(e.to)) { prev[e.to] = cur; q.push(e.to); }
  }
  if (!(to in prev)) return null;
  const p = []; let r = to; while (r !== from) { p.unshift(r); r = prev[r]; } return p;
}
function ventLen(a, b) { const ra = G.roomById[a], rb = G.roomById[b]; return Math.abs(ra.vent - rb.vent) + Math.abs(ra.y0 - rb.y0) + 40; }

function spawnCreature(roomId, opts = {}) {
  const r = G.roomById[roomId];
  const m = {
    id: G.creatures.length, alive: true, hp: opts.hp || 240, maxHp: opts.hp || 240, room: roomId, ventRoom: roomId,
    state: opts.inRoom ? 'room' : 'vent', mode: opts.inRoom ? 'lurk' : null, x: opts.x ?? r.vent, y: r.fy, face: 1, phase: 0,
    vpath: [], vfrom: roomId, vto: null, vprog: 0, vlen: 1, timer: rnd(4, 9), attackT: 0, target: null, revealed: false, lastSeen: -999,
    hunger: 30, kills: 0, moving: false, visited: {}, origin: opts.origin || 'nest', emergeT: 0, sabotaged: {}, visible: false, bang: 0, stalk: G.phase < 4,
  };
  if (m.state === 'vent') m.room = null;
  G.creatures.push(m);
  if (G.director) G.director.flag('creature');
  return m;
}

function creatureScoreRoom(m, r) {
  if (r.sealed && r.id !== m.ventRoom) return -99;
  const crew = G.crew.filter((c) => c.alive && !c.missing && !c.eva && c.room === r.id);
  const armed = crew.filter((c) => c.armed && !c.down).length;
  let s = rnd(0, 2);
  if (crew.length === 1 && !armed) s += m.stalk ? 2 : 7;
  if (crew.length === 1 && crew[0].sleeping) s += 3;
  if (crew.length === 0) s += m.stalk ? 3 : 0.5;
  if (crew.length >= 3) s -= 5;
  s -= armed * (m.hp < m.maxHp * 0.6 ? 9 : 4);
  if (!r.powered) s += 3;
  if (!r.observed) s += 2.5;
  if (m.hunger > 60 && (r.id === 'mess' || r.id === 'hydro')) s += 5;
  if (r.fire > 0.1 || r.p < 40 || r.venting) s -= 20;
  if (r.id === 'cryo' && m.hunger > 80) s += 2;
  if (G.t - (m.visited[r.id] || -999) < 100) s -= 7; // restless: keeps moving through the ship
  return s;
}

function updateCreatures(dt) {
  for (const m of G.creatures) {
    if (!m.alive) continue;
    m.hunger = Math.min(100, m.hunger + dt * 0.08);
    m.moving = false;
    m.phase += dt;
    if (m.state === 'vent') ventTick(m, dt);
    else roomTick(m, dt);
    // interference: electronics flicker near it
    for (const r of G.rooms) r.interference = approach(r.interference, 0, dt * 0.5);
    const near = m.state === 'vent' ? m.ventRoom : m.room;
    if (near) { const r = G.roomById[near]; const cap = m.state === 'vent' ? 0.5 : m.stalk ? 1 : 0.62; if (r.interference < cap) r.interference = Math.min(cap, r.interference + dt * (m.state === 'vent' ? 0.25 : 0.9)); }
  }
}

function ventTick(m, dt) {
  if (m.vto) {
    m.vprog += dt * (m.hp < m.maxHp * 0.5 ? 26 : 38) / m.vlen;
    m.moving = true;
    const rf = G.roomById[m.vfrom], rt = G.roomById[m.vto];
    if (G.sensors) { (m.vprog < 0.5 ? rf : rt).ductMotion = 1; }
    if (m.vprog >= 1) { m.ventRoom = m.vto; m.vfrom = m.vto; m.vto = null; const ar = G.roomById[m.ventRoom]; ar.cableSwing = 1; if (chance(0.45)) crewReact(ar.id, ar.vent, 0.4); }
    else return;
  }
  // regenerate in ducts
  m.hp = Math.min(m.maxHp, m.hp + dt * 3);
  m.timer -= dt;
  if (!ventOpen(m.ventRoom)) { // trapped in a sealed vent stub — move out toward any open neighbour
    m.timer = 0;
  }
  if (m.timer > 0) { if (m.vpath.length) { advanceVent(m); } return; }
  // choose next target
  if (!m.vpath.length) {
    let best = null, bs = -1e9;
    for (const r of G.rooms) { const s = creatureScoreRoom(m, r) - ventLen(m.ventRoom, r.id) / 650; if (s > bs) { bs = s; best = r; } }
    const target = best.id;
    if (target === m.ventRoom) {
      if (bs > 3 || m.hunger > 70) emerge(m); else { m.timer = rnd(6, 14); m.visited[target] = G.t; }
      return;
    }
    const p = ventPath(m.ventRoom, target);
    if (p && p.length) { m.vpath = p; m.goal = target; }
    else m.timer = rnd(4, 8);
  }
  advanceVent(m);
}
function advanceVent(m) {
  if (m.vto || !m.vpath.length) return;
  const next = m.vpath.shift();
  if (!ventOpen(next)) { m.vpath = []; m.timer = 2; return; }
  m.vto = next; m.vfrom = m.ventRoom; m.vprog = 0; m.vlen = ventLen(m.vfrom, next);
  if (!m.vpath.length) m.timer = rnd(2, 5); // arrived at goal, linger then decide
  if (chance(0.3)) AUDIO.ductScrape(G.roomById[next]);
}

function emerge(m) {
  const r = G.roomById[m.ventRoom];
  // kill the camera first if it is watching (and we are still being shy)
  if (r.observed && r.cameraOK && (m.stalk || chance(0.6)) && !m.sabotaged[r.id]) {
    m.sabotaged[r.id] = true;
    r.cameraOK = false; r.cameraJammed = true;
    m.timer = rnd(3, 6);
    AUDIO.staticBurst(0.7);
    return;
  }
  m.visited[r.id] = G.t;
  r.ventBent = true; r.cableSwing = 1.4;
  // a shape crosses the doorway of a lit neighbouring room — a glimpse, never a reveal
  const dd = G.adj[r.id].filter((e) => !e.door.hatch && G.roomById[e.to].observed && G.roomById[e.to].powered && e.door.anim > 0.5);
  if (dd.length && chance(0.6)) { const e = pick(dd); G.shadowPass = { room: e.to, x: e.door.x, dir: G.roomById[e.to].cx > e.door.x ? 1 : -1, t: G.t }; }
  m.state = 'room'; m.room = r.id; m.x = r.vent; m.y = r.fy; m.mode = 'lurk'; m.timer = rnd(4, 10); m.emergeT = 0.9;
  m.target = null;
  AUDIO.ventDrop(r); crewReact(r.id, r.vent, 1);
  if (G.director) G.director.flag('emerge');
}

function darkSpot(r) {
  // furthest point from light fixtures
  const lights = (ART.rooms[r.id] && ART.rooms[r.id].lights) || [];
  let best = r.cx, bd = -1;
  for (let x = r.x0 + 25; x < r.x1 - 25; x += 20) { let d = 1e9; for (const l of lights) d = Math.min(d, Math.abs(l.x - x)); if (d > bd) { bd = d; best = x; } }
  return best;
}

function roomTick(m, dt) {
  const r = G.roomById[m.room];
  if (m.emergeT > 0) { m.emergeT -= dt; return; }
  m.lastRoomT = G.t;
  // visibility to player
  const vis = r.observed || G.crew.some((c) => c.alive && !c.down && c.room === r.id && Math.abs(c.x - m.x) < (r.powered ? 220 : 110) && (r.powered || Math.sign(m.x - c.x) === c.face || Math.abs(c.x - m.x) < 40));
  m.visible = vis;
  if (vis) {
    r.lastCreatureSeen = G.t; m.lastSeen = G.t;
    if (!m.revealed) {
      m.revealed = true;
      if (!G.firstSighting) { G.firstSighting = G.t; hint('organism', r.id); logEvent('crit', `UNIDENTIFIED ORGANISM — ${r.short}. Tall. Moving. Not crew.`, r.id, { story: true }); AUDIO.sting(); if (UI.autoPause) UI.autoPause('ORGANISM SIGHTED'); }
      else logEvent('crit', `ORGANISM SIGHTED — ${r.short}.`, r.id, { story: true });
      for (const c of G.crew) if (c.alive && c.room === r.id) c.stress = Math.min(100, c.stress + 25);
    }
  } else if (G.t - m.lastSeen > 25) m.revealed = false;
  // hazards
  if (r.fire > 0.1) { m.hp -= dt * r.fire * 14 * (G.research.m50 ? 1.6 : 1); if (m.mode !== 'leave') { m.mode = 'leave'; } }
  if (r.p < 30) { m.hp -= dt * (G.research.m50 ? 14 : 8); if (r.venting) m.hp -= dt * 10; }
  // incoming fire from armed crew
  const shooters = G.crew.filter((c) => c.alive && !c.down && c.room === r.id && c.armed && c.panicT <= 0 && (c.task?.type === 'fight' || c.task?.type === 'security'));
  for (const c of shooters) {
    c.fireT = (c.fireT || 0) - dt;
    c.face = m.x > c.x ? 1 : -1;
    if (c.fireT <= 0) {
      c.fireT = rnd(0.35, 0.6);
      const hit = chance(0.45 + c.skills.cmb * 0.1 - (r.powered ? 0 : 0.2));
      FX.muzzle(c.x + c.face * 14, c.y - 19, c.face, m, hit);
      AUDIO.shot(c);
      if (hit) m.hp -= rnd(7, 11) + c.skills.cmb * 1.5;
      c.stress = Math.min(100, c.stress + 0.4);
    }
  }
  if (m.hp <= 0) { killCreature(m, r); return; }
  const cornered = r.sealed;
  if (m.hp < m.maxHp * 0.45 && m.mode !== 'leave' && !cornered) { m.mode = 'leave'; logEvent('warn', `The organism is retreating — ${r.short}.`, r.id); AUDIO.creatureCry(r, 0.6); }

  const crewHere = G.crew.filter((c) => c.alive && !c.missing && !c.eva && c.room === r.id);
  m.timer -= dt;
  switch (m.mode) {
    case 'lurk': {
      const dx = darkSpot(r); if (Math.abs(dx - m.x) > 6) walkC(m, dx, dt, 32);
      const lone = crewHere.filter((c) => !c.armed || c.down);
      if (crewHere.length && crewHere.length <= (m.stalk ? 1 : 2) && lone.length) { if (m.timer <= 0) { m.mode = 'hunt'; m.target = pick(lone).id; } }
      else if (crewHere.length > 2 || crewHere.some((c) => c.armed)) { if (cornered) { m.mode = 'hunt'; m.target = pick(crewHere).id; } else if (m.timer <= 0) m.mode = 'leave'; }
      else if (m.timer <= 0) {
        if (m.hunger > 60 && (r.id === 'mess' || r.id === 'hydro')) { m.mode = 'feed'; m.timer = 12; }
        else if (chance(0.5) && !m.sabotaged['x' + r.id]) { m.mode = 'sabotage'; m.timer = 5; }
        else { m.mode = 'leave'; }
      }
      break;
    }
    case 'hunt': {
      const c = G.crew[m.target];
      if (!c || !c.alive || c.room !== r.id || c.missing) { m.mode = 'lurk'; m.timer = rnd(2, 5); break; }
      walkC(m, c.x, dt, 78);
      if (Math.abs(c.x - m.x) < 20 && !c.climb) { m.mode = 'attack'; m.attackT = 0.4; }
      break;
    }
    case 'attack': {
      const c = G.crew[m.target];
      if (!c || !c.alive || c.room !== r.id) { m.mode = 'lurk'; m.timer = 2; break; }
      if (Math.abs(c.x - m.x) > 26) { m.mode = 'hunt'; break; }
      m.face = c.x > m.x ? 1 : -1;
      m.attackT -= dt;
      if (m.attackT <= 0) {
        m.attackT = rnd(1.1, 1.6);
        m.lunge = 0.25;
        const dmg = rnd(20, 30) * (G.phase >= 5 ? 1.2 : 1);
        AUDIO.attack(r); crewReact(r.id, m.x, 1.5, true); if (chance(0.5)) addScar(r, 'scratch', { x: c.x + rnd(-14, 14), y: r.fy - rnd(28, 70) });
        r.blood.push({ x: c.x + rnd(-14, 14), y: c.y - rnd(0, 30), s: rnd(0.5, 1.1), wall: chance(0.5) });
        if (r.blood.length > 14) r.blood.shift();
        G.shake = Math.max(G.shake, r.observed ? 2 : 0.6);
        // non-lethal infection chance on first strike against a healthy lone target
        if (!c.infection && c.hp > 70 && chance(m.stalk ? 0.5 : 0.18)) {
          c.hp -= 12; exposeInfection(c, 'attack');
          logEvent(r.observed ? 'crit' : 'warn', r.observed ? `${c.name} was attacked in ${r.short} and torn free. Bleeding from the neck.` : `${c.name} screams over the comm in ${r.short}. Then: "I'm okay. I'm okay. It's gone."`, r.id, { story: true });
          AUDIO.scream(0.5, c);
          m.mode = 'leave'; break;
        }
        hurt(c, dmg, 'organism attack');
        if (c.alive && !c.down) AUDIO.scream(0.35, c);
        if (!c.alive || c.down) {
          m.kills++; m.hunger = Math.max(0, m.hunger - 50); m.maxHp += 30;
          const unseen = !r.observed && crewHere.length <= 1;
          if (c.down && c.alive && unseen && !cornered) { dragAway(m, c, r); return; }
          if (c.down && c.alive) hurt(c, 50, 'organism attack');
          m.mode = crewHere.filter((o) => o.alive && !o.down).length && !m.stalk ? 'lurk' : 'leave'; m.timer = 1.5;
        }
      }
      break;
    }
    case 'feed': {
      if (r.id === 'mess' || r.id === 'hydro') { G.res.food = Math.max(0, G.res.food - dt * 0.35); m.hunger = Math.max(0, m.hunger - dt * 6); G.foodTheft = (G.foodTheft || 0) + dt * 0.35; }
      if (m.timer <= 0 || crewHere.length) m.mode = crewHere.length ? 'lurk' : 'leave';
      break;
    }
    case 'sabotage': {
      walkC(m, r.cx + Math.sin(m.phase) * 40, dt, 30);
      if (m.timer <= 0) {
        m.sabotaged['x' + r.id] = true;
        damageRoom(r, rnd(8, 18), 'organism');
        if (chance(0.6)) { r.elecFault = true; AUDIO.sparkBurst(r); }
        if (r.id === 'reactor' && chance(0.5)) { r.leak = true; }
        m.mode = 'leave';
      }
      break;
    }
    case 'leave': {
      if (cornered) { m.mode = crewHere.length ? 'hunt' : 'lurk'; if (crewHere.length) m.target = pick(crewHere).id; m.timer = rnd(3, 6); break; }
      walkC(m, r.vent, dt, 70);
      if (Math.abs(m.x - r.vent) < 6) { m.state = 'vent'; m.ventRoom = r.id; m.vfrom = r.id; m.room = null; m.vpath = []; m.timer = rnd(8, 20); m.visible = false; AUDIO.ventDrop(r, true); }
      break;
    }
  }
}
function walkC(m, tx, dt, sp) {
  const dx = tx - m.x; if (Math.abs(dx) < 1) return;
  m.face = dx > 0 ? 1 : -1; const s = sp * dt * (m.hp < m.maxHp * 0.4 ? 0.8 : 1);
  m.x += Math.abs(dx) < s ? dx : Math.sign(dx) * s; m.moving = true;
}
function dragAway(m, c, r) {
  c.missing = true; c.down = false; c.alive = true; c.task = null; c.path = [];
  c.lastSeenRoom = r.id; c.missingAt = G.t;
  r.blood.push({ x: r.vent, y: r.y0 + 22, s: 1.3, wall: true, drag: true });
  // body ends up in a dark room somewhere along the ducts
  const nests = G.rooms.filter((x) => x.id !== r.id && !x.observed);
  c.bodyRoom = (nests.length ? pick(nests) : pick(G.rooms)).id;
  m.state = 'vent'; m.room = null; m.ventRoom = r.id; m.vfrom = r.id; m.vpath = []; m.timer = rnd(20, 40); m.visible = false;
  AUDIO.scream(0.15, c); AUDIO.ventDrop(r, true);
  setTimeout(() => {}, 0);
  G.pendingMissing = G.pendingMissing || [];
  G.pendingMissing.push({ id: c.id, t: G.t + rnd(30, 60) });
  if (G.sensors) logEvent('warn', `BIOMONITOR: ${c.name} — signal moving through DUCT above ${r.short}... signal lost.`, r.id, { story: true });
}
function killCreature(m, r) {
  m.alive = false; m.deadRoom = r.id; m.deadX = m.x;
  logEvent('crit', `THE ORGANISM IS DEAD — ${r.short}. ${r.venting ? 'Blown out with the air.' : r.fire > 0.1 ? 'It burned.' : 'It took everything they had.'}`, r.id, { story: true });
  AUDIO.creatureCry(r, 1); G.shake = 4;
  G.research.samples += 3;
  for (const c of G.crew) if (c.alive) { c.morale = Math.min(100, c.morale + 15); c.stress = Math.max(0, c.stress - 20); }
  G.creaturesKilled = (G.creaturesKilled || 0) + 1; G.lastKillT = G.t;
  if (G.director) G.director.flag('kill');
}

// ---------------------------------------------------------------------------
// Contamination
// ---------------------------------------------------------------------------
function seedContamination(r, src) {
  r.contamSeed = true; r.contam = Math.max(r.contam, 0.01); r.contamSrc = src;
  G.nestRoom = r.id; G.contamSeededAt = G.t;
}
function updateContamination(dt) {
  for (const r of G.rooms) {
    if (r.contamSeed && r.contam > 0) r.contam = Math.min(1.2, r.contam + dt * 0.0021 * (r.temp > 0 ? 1 : 0.3));
    if (r.contam > 0.55 && !r.sealed) for (const e of G.adj[r.id]) { const t = G.roomById[e.to]; if (!t.sealed && t.contam < r.contam - 0.3) t.contam += dt * 0.00035; }
    // exposure
    if (r.contam > 0.45) for (const c of G.crew) if (c.alive && c.room === r.id && !c.infection && c.atWork && chance(dt * 0.0015 * r.contam)) exposeInfection(c, 'contamination');
    // hatch
    if (r.contamSeed && r.contam >= 1 && !r.hatched) {
      r.hatched = true;
      spawnCreature(r.id, { origin: 'nest' }); G.nestSpawns = 1;
      r.contam = 0.8;
      G.hatchT = G.t;
      if (G.sensors) r.ductMotion = 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Hidden infection
// ---------------------------------------------------------------------------
function exposeInfection(c, src) {
  if (c.infection || !c.alive) return;
  c.infection = { stage: 0, t: 0, src, known: false, wanderT: rnd(60, 110), lastWander: null };
  G.infectedEver = (G.infectedEver || 0) + 1;
}
function updateInfection(dt) {
  for (const c of G.crew) {
    if (!c.alive || !c.infection || c.missing) continue;
    const inf = c.infection; inf.t += dt;
    const dur = [140, 170, 150][inf.stage] ?? 999;
    if (inf.stage < 2 && inf.t > dur) { inf.stage++; inf.t = 0; }
    else if (inf.stage === 2) {
      const r = crewRoom(c);
      const ready = inf.t > dur + (inf.alarmed ? -60 : 0);
      if (ready && ((c.alone && !r.observed) || inf.t > dur + 100 || (c.quarantined && inf.t > dur + 20))) transform(c);
    }
  }
  // quarantine auto-lock
  if (G.pendingQuarantineLock && G.t > G.pendingQuarantineLock) {
    G.pendingQuarantineLock = 0;
    const q = G.roomById.quarantine;
    if (!G.crew.some((o) => o.alive && o.room === 'quarantine' && !o.quarantined && o.task && o.task.type !== 'bloodtest')) lockdownRoom(q);
    else G.pendingQuarantineLock = G.t + 2;
  }
  for (const c of G.crew) if (c.alive) checkQuarantineArrival(c);
}
function transform(c) {
  const r = crewRoom(c);
  const seen = r.observed || G.crew.some((o) => o.alive && o !== c && o.room === r.id);
  if (seen) logEvent('crit', `${fullName(c)} convulses in ${r.short}. The body opens. Something unfolds out of it.`, r.id, { story: true });
  else if (G.sensors) logEvent('crit', `BIOMONITOR — ${c.name}: readings not compatible with human physiology. Signal lost. ${r.short}.`, r.id, { story: true });
  else logEvent('warn', `${c.name} is not answering comms.`, null, { story: true });
  c.alive = false; c.transformed = true; c.deathCause = 'consumed from within'; c.deadAt = G.t; G.deaths++; G.lastDeathT = G.t;
  r.blood.push({ x: c.x, y: c.y, s: 1.6, wall: false }); r.blood.push({ x: c.x + 10, y: c.y - 30, s: 1.2, wall: true });
  r.contam = Math.max(r.contam, 0.35); r.contamKnown = r.contamKnown || seen;
  griefWave(c, seen || G.sensors);
  const m = spawnCreature(r.id, { inRoom: true, x: c.x, hp: 200, origin: c.name });
  m.stalk = false; m.mode = 'hunt'; m.timer = 1;
  const victims = G.crew.filter((o) => o.alive && o.room === r.id);
  if (victims.length) m.target = pick(victims).id; else m.mode = 'lurk';
  AUDIO.creatureCry(r, 1); AUDIO.scream(0.6, c);
  G.shake = 5;
  if (seen && UI.autoPause) UI.autoPause('CREW TRANSFORMATION');
}

function updateInfectedBehaviour(c, dt) {
  const inf = c.infection;
  if (inf.stage < 1 || c.quarantined) return;
  if (c.ignoring > 0) { c.ignoring -= dt; }
  inf.wanderT -= dt;
  // missing shifts: drift off to an unwatched room
  if (inf.wanderT <= 0 && (!c.task || c.task.auto)) {
    inf.wanderT = rnd(70, 130) / inf.stage;
    const dark = G.rooms.filter((r) => !r.observed && r.id !== c.room && !roomHazardNow(r));
    const dest = dark.length ? pick(dark) : pick(G.rooms.filter((r) => ['cryo', 'o2', 'workshop', 'hydro'].includes(r.id)));
    c.task = { type: 'wander', room: dest.id, prog: 0, auto: true }; repath(c);
    inf.lastWander = dest.id;
    if (G.crew.some((o) => o.alive && o.room === c.duty && o !== c && o.atWork)) {
      setTimeout(() => {}, 0);
      G.delayedLogs = G.delayedLogs || [];
      G.delayedLogs.push({ t: G.t + 25, fn: () => { if (c.alive && c.task && c.task.type === 'wander') logEvent('warn', `${c.name} did not report for watch at ${G.roomById[c.duty].short}.`, c.duty, { story: true }); } });
    }
  }
  // stage 2 traces
  if (inf.stage >= 2 && c.alone && !crewRoom(c).observed && chance(dt * 0.02)) {
    const r = crewRoom(c); r.blood.push({ x: c.x + rnd(-20, 20), y: c.y, s: rnd(0.3, 0.6), wall: false, odd: true }); r.contam = Math.min(0.5, r.contam + 0.04);
  }
  // stage 2: quietly spreads to a lone companion in the dark
  if (inf.stage >= 2) {
    const r = crewRoom(c);
    const others = G.crew.filter((o) => o !== c && o.alive && !o.missing && o.room === c.room);
    if (others.length === 1 && !r.observed && !others[0].infection && chance(dt * 0.006)) {
      const v = others[0]; exposeInfection(v, 'contact'); v.hp -= 8;
      G.delayedLogs = G.delayedLogs || [];
      G.delayedLogs.push({ t: G.t + 40, fn: () => { if (v.alive) logEvent('info', `${v.name} visited the med bay for a small puncture wound. "Caught it on a bulkhead edge."`, 'medbay'); } });
    }
  }
  // others notice
  if (chance(dt * 0.004 * inf.stage)) {
    const witness = G.crew.find((o) => o !== c && o.alive && !o.infection && o.room === c.room && (hasTrait(o, 'Paranoid') || o.rel.some((r) => r.id === c.id) || hasTrait(o, 'Empathetic')));
    if (witness && G.t - (c.reportedOdd || 0) > 80) {
      c.reportedOdd = G.t; hint('infection', c.room);
      const lines = [`"${c.first}'s not right. Ate like they were starving and still says they're hungry."`, `"Has anyone else noticed ${c.first} doesn't sleep any more?"`, `"I touched ${c.first}'s hand. They're burning up. Said they feel fine."`, `"${c.first} was in the ${G.roomById[inf.lastWander || c.duty].short} with the lights off. Just standing there."`];
      logEvent('story', `${witness.name} reports: ${pick(lines)}`, c.room, { story: true });
      AUDIO.radio();
    }
  }
}

// research in quarantine lab
function updateResearch(dt) {
  const R = G.research; const q = G.roomById.quarantine;
  if (R.samples <= 0 || !q.powered) return;
  const sci = G.crew.filter((c) => c.alive && c.room === 'quarantine' && c.atWork && (c.prof === 'Scientist' || c.prof === 'Medic') && (c.duty === 'quarantine' || c.task?.type === 'duty'));
  if (!sci.length) return;
  const k = sci.reduce((a, c) => a + c.skills.sci, 0);
  R.prog = Math.min(100, R.prog + dt * 0.045 * k * Math.min(2, 0.6 + R.samples * 0.3));
  if (R.prog >= 50 && !R.m50) { R.m50 = true; logEvent('story', 'QUARANTINE LAB ANALYSIS: organism cells rupture below 40 kPa and burn readily. Fire and vacuum are effective. Blood tests now more reliable.', 'quarantine', { story: true }); }
  if (R.prog >= 100 && !R.m100) { R.m100 = true; logEvent('story', 'QUARANTINE LAB: non-human bio-signature isolated. SENSORS will now flag NON-HUMAN life signs in unobserved rooms.', 'quarantine', { story: true }); }
}

// ---------------------------------------------------------------------------
// EVA salvage
// ---------------------------------------------------------------------------
function launchEVA(ids) {
  G.eva = { ids, state: 'gather', t: 0, infectId: chance(0.75) ? pick(ids) : null };
  for (const id of ids) orderCrew(G.crew[id], { type: 'eva', room: 'airlock' }, { auto: true });
  logEvent('info', `EVA team ${ids.map((i) => G.crew[i].name).join(' & ')} heading to the AIRLOCK.`, 'airlock');
}
function startEVA(c) {
  const E = G.eva; if (!E) { completeTask(c); return; }
  if (E.state !== 'gather') return;
  const ready = E.ids.every((i) => { const o = G.crew[i]; return !o.alive || (o.room === 'airlock' && o.atWork); });
  if (!ready) return;
  E.state = 'cycle_out'; E.t = 0;
  for (const d of roomDoors(G.roomById.airlock)) if (!d.outer) { d.mode = 'closed'; }
  logEvent('info', 'AIRLOCK CYCLING. Inner doors closed. Depressurising.', 'airlock');
  AUDIO.airlockCycle();
}
function updateEVAState(dt) {
  const E = G.eva; if (!E) return;
  E.t += dt;
  const outer = G.doorById.d_outer;
  const team = E.ids.map((i) => G.crew[i]).filter((c) => c.alive);
  if (!team.length) { G.eva = null; outer.mode = 'closed'; return; }
  if (E.state === 'cycle_out' && E.t > 4) {
    outer.mode = 'open'; E.state = 'outside'; E.t = 0;
    for (const c of team) { c.eva = true; c.task = { type: 'eva' }; c.evaX = 0; c.evaPhase = rnd(6); }
    logEvent('info', 'EVA team outside. Tethered. Moving to the drifting hull fragment.', 'airlock');
  } else if (E.state === 'outside') {
    if (E.t > 5) outer.mode = 'closed';
    if (E.t > 55) { E.state = 'return'; E.t = 0; outer.mode = 'open'; logEvent('info', 'EVA team returning with salvage.', 'airlock'); }
  } else if (E.state === 'return' && E.t > 8) {
    outer.mode = 'closed'; E.state = 'repress'; E.t = 0;
    for (const c of team) { c.eva = false; c.room = 'airlock'; c.x = rnd(50, 180); c.y = G.roomById.airlock.fy; c.task = null; c.path = []; }
    G.res.parts += 16; G.res.med += 5;
    logEvent('story', 'EVA COMPLETE. Recovered 16 spare parts, 5 medical kits. Hull fragment ID: unregistered. Hull scoring looks... organic.', 'airlock', { story: true });
    if (E.infectId !== null) {
      const v = G.crew[E.infectId]; if (v.alive) { exposeInfection(v, 'eva'); v.evaTear = true; }
      G.delayedLogs = G.delayedLogs || [];
      G.delayedLogs.push({ t: G.t + 12, fn: () => logEvent('info', `Suit check: small tear in ${G.crew[E.infectId].name}'s suit glove. Patched. Probably nothing.`, 'airlock') });
    }
  } else if (E.state === 'repress' && E.t > 3) { G.eva = null; }
}
function updateEVA(c, dt) {
  const E = G.eva; if (!E) { c.eva = false; return; }
  c.evaPhase += dt;
  const target = E.state === 'outside' ? Math.min(1, E.t / 18) : E.state === 'return' ? Math.max(0, 1 - E.t / 8) : 0;
  c.evaX = approach(c.evaX, target, dt * 0.1);
  c.o2 = 100;
  c.stress = Math.min(100, c.stress + dt * (hasTrait(c, 'Claustrophobic') ? 0.2 : 0.06));
}
