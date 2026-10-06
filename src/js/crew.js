'use strict';
// ============================================================================
// CREW — roster, needs, pathing, tasks, autonomy, relationships, death
// ============================================================================

const PROF = {
  Engineer: { glyph: 'ENG', col: '#a88a3a' },
  Medic: { glyph: 'MED', col: '#b9b4a4' },
  Security: { glyph: 'SEC', col: '#46525c' },
  Scientist: { glyph: 'SCI', col: '#c4bfae' },
  Technician: { glyph: 'TEC', col: '#5c6b4f' },
  Officer: { glyph: 'OFC', col: '#2f3a48' },
};
const SKILLS = ['eng', 'med', 'cmb', 'sci', 'ath', 'cmp'];
const SKILL_NAME = { eng: 'Engineering', med: 'Medical', cmb: 'Combat', sci: 'Science', ath: 'Athletics', cmp: 'Composure' };
const TRAIT_INFO = {
  Brave: 'Less stress from danger. Rarely refuses orders.',
  Cowardly: 'Panics sooner. Refuses dangerous orders.',
  Paranoid: 'Stressed by unknowns. Reports odd behaviour sooner.',
  Calm: 'Stress builds slowly.',
  Claustrophobic: 'Darkness, sealed rooms and vacuum hit hard.',
  Empathetic: 'Calms people nearby. Grieves deeply.',
  'Hot-Tempered': 'Starts arguments when stressed.',
  Resourceful: 'Repairs use fewer parts.',
  Insomniac: 'Sleeps badly. Fatigue recovers slowly.',
  'Natural Leader': 'Crew in the same room recover stress.',
};

const ROSTER = [
  { first: 'Avery', last: 'Holt', prof: 'Engineer', sk: [5, 1, 1, 2, 3, 3], traits: ['Resourceful', 'Insomniac'], duty: 'reactor', watch: 0, look: { skin: 2, hair: 1, hairC: 0 },
    bio: 'Chief of the reactor watch. Third generation shipborn. Talks to the coolant pumps when she thinks nobody is listening.' },
  { first: 'Marcus', last: 'Holt', prof: 'Security', sk: [1, 1, 4, 1, 4, 2], traits: ['Brave', 'Hot-Tempered'], duty: 'security', watch: 1, look: { skin: 2, hair: 0, hairC: 0 },
    bio: "Avery's younger brother. Signed on to security so he could keep an eye on her. She keeps an eye on him." },
  { first: 'Ines', last: 'Harper', prof: 'Engineer', sk: [4, 1, 1, 2, 2, 4], traits: ['Calm'], duty: 'workshop', watch: 2, look: { skin: 0, hair: 2, hairC: 2 },
    bio: 'Machinist. Patches anything with anything. Married to Tomas Brandt for eleven years, eight of them in this section.' },
  { first: 'Ruth', last: 'Okonkwo', prof: 'Medic', sk: [1, 5, 1, 3, 1, 4], traits: ['Empathetic', 'Natural Leader'], duty: 'medbay', watch: 0, look: { skin: 4, hair: 3, hairC: 0 }, title: 'Dr.',
    bio: 'Section physician. Has delivered four babies and buried nine crew. Keeps a paper logbook nobody else is allowed to read.' },
  { first: 'Sol', last: 'Petrovic', prof: 'Medic', sk: [1, 3, 2, 3, 2, 2], traits: ['Paranoid'], duty: 'medbay', watch: 2, look: { skin: 1, hair: 0, hairC: 1 },
    bio: 'Junior medic. Former orbital EMT. Thinks Marcus Holt is a liability and says so.' },
  { first: 'Dana', last: 'Reyes', prof: 'Security', sk: [1, 2, 4, 1, 3, 4], traits: ['Calm', 'Brave'], duty: 'security', watch: 0, look: { skin: 3, hair: 2, hairC: 0 },
    bio: 'Twenty years in station security. Unflappable. Teaches Kit Navarro card games on the night watch.' },
  { first: 'Wren', last: 'Adeyemi', prof: 'Scientist', sk: [1, 2, 1, 5, 2, 2], traits: ['Claustrophobic'], duty: 'quarantine', watch: 1, look: { skin: 4, hair: 4, hairC: 0 },
    bio: 'Exobiologist. Here to catalogue what the colony will find, not what finds the colony. Best friends with Priya Sand.' },
  { first: 'Tomas', last: 'Brandt', prof: 'Technician', sk: [3, 1, 2, 2, 3, 2], traits: ['Hot-Tempered'], duty: 'o2', watch: 0, look: { skin: 1, hair: 1, hairC: 3 },
    bio: 'Life-support tech. Grows tomatoes he is not supposed to grow. Married to Ines Harper.' },
  { first: 'Kit', last: 'Navarro', prof: 'Technician', sk: [3, 1, 1, 2, 3, 1], traits: ['Cowardly', 'Empathetic'], duty: 'hydro', watch: 2, look: { skin: 2, hair: 2, hairC: 1 },
    bio: 'Youngest aboard at 22. Woke from cryo early for training. Asks a lot of questions. Losing at cards to Dana Reyes.' },
  { first: 'Lena', last: 'Marsh', prof: 'Officer', sk: [2, 1, 2, 2, 2, 5], traits: ['Natural Leader', 'Calm'], duty: 'bridge', watch: 0, look: { skin: 0, hair: 3, hairC: 1 }, title: 'Cdr.',
    bio: 'Section 6 watch commander. Answers to a captain who has been asleep for nineteen years.' },
  { first: 'Jonah', last: 'Fell', prof: 'Officer', sk: [2, 1, 1, 3, 1, 2], traits: ['Insomniac', 'Cowardly'], duty: 'bridge', watch: 1, look: { skin: 1, hair: 4, hairC: 2 },
    bio: 'Navigator. Plots debris corridors. Has not slept properly since the last micrometeor season.' },
  { first: 'Priya', last: 'Sand', prof: 'Scientist', sk: [2, 2, 1, 4, 2, 3], traits: ['Resourceful', 'Paranoid'], duty: 'hydro', watch: 2, look: { skin: 3, hair: 1, hairC: 0 },
    bio: 'Xenochemist and part-time botanist. Keeps the hydroponics alive. Best friends with Wren Adeyemi.' },
];
const RELATIONS = [
  ['Avery Holt', 'Marcus Holt', 'sibling'],
  ['Ines Harper', 'Tomas Brandt', 'spouse'],
  ['Wren Adeyemi', 'Priya Sand', 'friend'],
  ['Dana Reyes', 'Kit Navarro', 'friend'],
  ['Marcus Holt', 'Sol Petrovic', 'rival'],
  ['Lena Marsh', 'Ruth Okonkwo', 'friend'],
];
const REL_WORD = { sibling: 'Sibling', spouse: 'Spouse', friend: 'Friend', rival: 'Rival' };

const TASK_NAME = {
  move: 'MOVE', repair: 'REPAIR', extinguish: 'EXTINGUISH', seal: 'SEAL BREACH', power: 'RESTORE POWER', investigate: 'INVESTIGATE',
  reactor: 'OPERATE REACTOR', security: 'MAN SECURITY', treat: 'TREAT', rest: 'REST', arm: 'DRAW WEAPON', decon: 'DECONTAMINATE',
  scan: 'MEDICAL SCAN', bloodtest: 'BLOOD TEST', quarantine: 'QUARANTINE', escort: 'ESCORT', observe: 'OBSERVE', door: 'OPERATE DOOR',
  eva: 'EVA SALVAGE', restart: 'RESTART REACTOR', flee: 'FLEEING', panic: 'PANIC', duty: 'ON DUTY', sleep: 'SLEEPING', eat: 'EATING', medical: 'SEEKING MEDIC',
  fight: 'ENGAGING', hold: 'HOLD POSITION', wander: 'MISSING SHIFT',
};

function initCrew() {
  G.crew = [];
  ROSTER.forEach((d, i) => {
    const c = {
      id: i, first: d.first, last: d.last, name: `${d.first} ${d.last}`, title: d.title || '', prof: d.prof, traits: d.traits, bio: d.bio,
      skills: {}, duty: d.duty, watch: d.watch, look: d.look, rel: [],
      hp: 100, o2: 100, stress: rint(5, 20), morale: rint(62, 80), fatigue: rint(5, 35), suit: ['Engineer', 'Technician', 'Security'].includes(d.prof) ? 45 : 0, suitMax: 45,
      alive: true, missing: false, down: false, eva: false, armed: d.prof === 'Security', ammo: 1,
      x: 0, y: 0, room: d.duty, task: null, path: [], moving: false, atWork: false, face: 1, phase: rnd(10), climb: null,
      bodyTemp: 36.8 + rnd(-0.2, 0.3), infection: null, quarantined: false, grief: 0, panicT: 0, refused: null, statusLine: '',
      lastPos: [], notes: [], timeAlone: 0, deathCause: '', seenBy: [], memory: [], deadAt: 0, hitFlash: 0, reportedOdd: 0,
    };
    SKILLS.forEach((k, j) => (c.skills[k] = d.sk[j]));
    const r = G.roomById[d.duty];
    c.x = rnd(r.x0 + 50, r.x1 - 50); c.y = r.fy; c.workX = c.x;
    G.crew.push(c);
  });
  const byName = (n) => G.crew.find((c) => c.name === n);
  for (const [a, b, t] of RELATIONS) { const ca = byName(a), cb = byName(b); ca.rel.push({ id: cb.id, type: t }); cb.rel.push({ id: ca.id, type: t }); }
}

const crewRoom = (c) => G.roomById[c.room];
const hasTrait = (c, t) => c.traits.includes(t);
const fullName = (c) => (c.title ? c.title + ' ' : '') + c.name;
function crewAvailable(c) { return c.alive && !c.missing && !c.down && !c.eva && !(c.infection && c.infection.stage >= 3); }

// ---------------------------------------------------------------------------
// danger knowledge (what the player/crew believe about a room)
// ---------------------------------------------------------------------------
function roomDanger(r) {
  let d = 0;
  if (r.fire > 0.15) d += 2;
  if (r.p < 50 || effO2(r) < 12) d += 3;
  if (r.venting) d += 10;
  if (G.t - r.lastCreatureSeen < 60) d += 4;
  if (!r.powered) d += 0.6;
  if (!r.observed && r.motion > 0.5 && r.lifeSigns > G.crew.filter((c) => c.alive && c.room === r.id).length) d += 2;
  return d;
}
function roomHazardNow(r) { // immediate physical hazard for autonomy
  return r.fire > 0.3 || r.p < 45 || effO2(r) < 12 || r.venting;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
function orderCrew(c, task, opts = {}) {
  if (!c.alive || c.missing) return false;
  if (c.down) { logEvent('warn', `${c.name} is incapacitated and cannot act.`); return false; }
  if (c.eva) { logEvent('warn', `${c.name} is outside on EVA.`); return false; }
  if (c.quarantined && !['rest', 'hold', 'scan', 'bloodtest'].includes(task.type) && !opts.force) {
    logEvent('warn', `${c.name} is in quarantine. Release them first.`); return false;
  }
  if (c.panicT > 0 && !opts.force) { logEvent('warn', `${c.name} is panicking and not responding to orders.`); AUDIO.radio(); return false; }
  // refusal for dangerous rooms
  const room = task.room ? G.roomById[task.room] : null;
  if (room && !opts.insist && !opts.auto) {
    const danger = roomDanger(room);
    if (danger >= 2) {
      let p = (c.stress - 35) / 120 + (100 - c.morale) / 300 + (hasTrait(c, 'Cowardly') ? 0.28 : 0) - (hasTrait(c, 'Brave') ? 0.3 : 0) + (danger >= 4 ? 0.12 : 0) + (c.grief > 0 ? 0.1 : 0);
      if (hasTrait(c, 'Claustrophobic') && (!room.powered || room.sealed)) p += 0.25;
      if (G.t < 140) p = 0; // never during routine
      if (chance(clamp(p, 0, 0.75))) {
        const lines = room.p < 50 ? ['There is no air in there.', 'Not without a suit. Not a chance.']
          : G.t - room.lastCreatureSeen < 60 ? ['You saw what was in there. You go.', "I'm not going in there. Not after that."]
          : !room.powered ? ['Not in the dark. Get the lights back first.', "I can't see a thing in there. No."]
          : ["Give me a minute. I can't.", "Send someone else. Please."];
        c.refused = { task, t: G.t, line: pick(lines) };
        logEvent('warn', `${c.name} REFUSES: "${c.refused.line}"`, c.room, { story: true });
        AUDIO.radio();
        return false;
      }
    }
  }
  if (opts.insist) { c.stress = Math.min(100, c.stress + 14); c.morale = Math.max(0, c.morale - 10); logEvent('info', `${c.name} complies under direct order. (stress ↑, morale ↓)`); }
  c.refused = null;
  if (c.task && c.task.type === 'observe') c.observeTarget = null;
  c.task = Object.assign({ prog: 0, started: G.t, ordered: !opts.auto }, task);
  c.atWork = false;
  repath(c);
  if (!c.path) {
    if (!opts.auto) logEvent('warn', `${c.name}: no route to ${G.roomById[taskRoom(c)]?.short || 'target'} — sealed or locked doors in the way.`);
    c.trapped = true;
  }
  if (!opts.auto && !opts.silent) AUDIO.ack();
  return true;
}

function taskRoom(c) {
  const t = c.task;
  if (!t) return c.room;
  if (t.target !== undefined && ['treat', 'escort', 'observe'].includes(t.type)) { const tc = G.crew[t.target]; return tc && tc.alive ? tc.room : c.room; }
  if (t.type === 'scan' || t.type === 'bloodtest') return t.room;
  return t.room || c.room;
}

function repath(c) {
  const dest = taskRoom(c);
  c.path = findPath(c.room, c.x, dest, 'crew', (rid) => c.task && c.task.room !== rid && roomHazardNow(G.roomById[rid]));
  c.trapped = !c.path;
  c.pathDest = dest;
}

// work spot inside room for a task
function workSpot(c) {
  const t = c.task, r = G.roomById[c.room];
  if (!t) return c.workX;
  switch (t.type) {
    case 'extinguish': return r.fireXs.length ? clamp(r.fireXs[0] + (c.x < r.fireXs[0] ? -32 : 32), r.x0 + 12, r.x1 - 12) : r.cx;
    case 'seal': return r.breachX;
    case 'reactor': case 'restart': return 300;
    case 'security': return 470;
    case 'rest': case 'sleep': return 450 + (c.id % 6) * 58;
    case 'arm': return 300;
    case 'door': { const d = G.doorById[t.door]; return d.x + (d.x > r.cx ? -14 : 14); }
    case 'treat': case 'escort': case 'observe': { const tc = G.crew[t.target]; return tc && tc.room === c.room ? tc.x + (c.id % 2 ? 16 : -16) : r.cx; }
    case 'scan': case 'bloodtest': return t.room === 'quarantine' ? 1050 : 760;
    case 'eva': return 60;
    case 'investigate': return t.spot ?? (t.spot = rnd(r.x0 + 40, r.x1 - 40));
    default: return t.spot ?? (t.spot = clamp(r.cx + rnd(-r.w * 0.3, r.w * 0.3), r.x0 + 30, r.x1 - 30));
  }
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------
function speedOf(c) {
  let s = 46 + c.skills.ath * 4;
  const r = crewRoom(c);
  if (G.alertLevel >= 2 || (c.task && ['extinguish', 'seal', 'treat', 'flee', 'panic', 'fight'].includes(c.task.type)) || c.fleeing) s *= 1.65;
  if (c.hp < 40) s *= 0.6;
  if (c.o2 < 40) s *= 0.7;
  if (r && !r.powered) s *= 0.8;
  if (c.infection && c.infection.stage >= 2) s *= 1.1;
  return s;
}

function stepMovement(c, dt) {
  c.moving = false;
  if (c.climb) { // ladder climbing
    const cl = c.climb; cl.t += dt * (speedOf(c) / 55);
    const k = Math.min(1, cl.t / cl.dur);
    c.y = lerp(cl.y0, cl.y1, k); c.moving = true;
    if (k >= 0.5 && c.room !== cl.to) { c.room = cl.to; }
    if (k >= 1) { c.climb = null; c.y = G.roomById[c.room].fy; finishPortal(c, cl.door); }
    return true;
  }
  if (c.path && c.path.length) {
    const step = c.path[0];
    const d = step.door;
    if (step.from !== c.room) { repath(c); return false; }
    const tx = d.x;
    const dx = tx - c.x;
    if (Math.abs(dx) > 3) { moveToward(c, tx, dt); return true; }
    // at portal: deal with door
    const m = effectiveMode(d);
    if (m === 'sealed' || (m === 'locked') || (d.jammed && d.anim < 0.5)) { repath(c); c.waitT = (c.waitT || 0) + dt; return false; }
    if (d.anim < 0.85) {
      if (doorPowered(d)) d.hold = Math.max(d.hold, 0.9);
      else { d.crank = 1; d.anim = Math.min(1, d.anim + dt * 0.3); c.cranking = true; d.hold = Math.max(d.hold, 0.6); }
      c.waitT = (c.waitT || 0) + dt;
      return false;
    }
    c.cranking = false; c.waitT = 0;
    d.hold = Math.max(d.hold, 0.7);
    if (d.hatch) {
      const ra = G.roomById[step.from], rb = G.roomById[step.to];
      c.climb = { door: d, y0: c.y, y1: rb.fy, to: step.to, t: 0, dur: Math.abs(rb.fy - c.y) / 60 };
    } else {
      // walk through
      const rb = G.roomById[step.to];
      c.room = step.to; c.x = tx + (rb.cx > tx ? 4 : -4);
      finishPortal(c, d);
    }
    return true;
  }
  return false;
}
function finishPortal(c, d) { c.path.shift(); if (!c.path.length) c.path = []; }
function moveToward(c, tx, dt) {
  const dx = tx - c.x; const s = speedOf(c) * dt;
  c.face = dx > 0 ? 1 : -1;
  c.x += Math.abs(dx) < s ? dx : Math.sign(dx) * s; c.moving = true;
  c.phase += dt * speedOf(c) * 0.16;
}

// ---------------------------------------------------------------------------
// Per-tick crew update
// ---------------------------------------------------------------------------
function updateCrew(dt) {
  const clock = fmtClock(G.t);
  for (const c of G.crew) {
    if (!c.alive) continue;
    if (c.hitFlash > 0) c.hitFlash -= dt;
    if (c.missing) { continue; }
    if (c.eva) { updateEVA(c, dt); continue; }
    const r = crewRoom(c);
    updateVitals(c, r, dt);
    if (!c.alive) continue;
    if (c.down) { c.moving = false; c.atWork = false; continue; }
    if (c.infection) updateInfectedBehaviour(c, dt, clock);
    if (c.panicT > 0) { c.panicT -= dt; if (c.panicT <= 0 && c.panicRelief) { c.panicRelief = false; c.stress = Math.min(c.stress, 58); if (c.task && c.task.type === 'panic') c.task = null; } }
    // autonomy: flee immediate hazards unless doing hazard-work
    const hazardWork = c.task && ['extinguish', 'seal', 'door', 'fight', 'reactor', 'restart'].includes(c.task.type) && c.task.room === c.room;
    if (roomHazardNow(r) && !hazardWork && !(c.task && c.task.type === 'flee')) {
      const safe = nearestSafeRoom(c);
      if (safe && safe !== c.room) {
        const prevTask = c.task && c.task.type !== 'duty' ? c.task : null;
        c.task = { type: 'flee', room: safe, prog: 0, started: G.t, resume: prevTask };
        repath(c); c.atWork = false;
      }
    }
    // small fire in the room: grab an extinguisher rather than run (unless cowardly)
    if (r.fire > 0 && r.fire < 0.35 && !hazardWork && c.panicT <= 0 && !hasTrait(c, 'Cowardly') && !(c.task && ['extinguish', 'flee', 'treat'].includes(c.task.type)) && !c.quarantined) {
      if (!G.crew.some((o) => o !== c && o.alive && o.task && o.task.type === 'extinguish' && o.task.room === r.id)) {
        c.task = { type: 'extinguish', room: r.id, prog: 0, resume: c.task && c.task.ordered ? c.task : null, auto: true }; c.path = [];
        logEvent('info', `${c.name} grabbed an extinguisher — ${r.short}.`, r.id);
      }
    }
    // creature in room → fight or flee
    const mon = G.creatures.find((m) => m.alive && m.room === c.room && m.state !== 'vent');
    if (mon) {
      if (c.armed && c.hp > 30 && c.panicT <= 0) { if (!c.task || c.task.type !== 'fight') { c.task = { type: 'fight', room: c.room, prog: 0, resume: c.task }; c.path = []; } }
      else if (!c.task || !['flee', 'panic'].includes(c.task.type)) {
        const safe = nearestSafeRoom(c, true);
        if (safe) { c.task = { type: 'flee', room: safe, prog: 0, started: G.t }; repath(c); }
      }
    }
    // no task → schedule
    if (!c.task) scheduleTask(c, clock);
    // movement
    const moved = stepMovement(c, dt);
    if (!moved && !c.climb && (!c.path || !c.path.length)) {
      if (c.room !== taskRoom(c)) { if (!c.repathT || G.t - c.repathT > 1.5) { c.repathT = G.t; repath(c); } }
      else {
        const wx = workSpot(c);
        if (Math.abs(wx - c.x) > 4) { moveToward(c, clamp(wx, r.x0 + 12, r.x1 - 12), dt); c.atWork = false; }
        else { c.atWork = true; doTask(c, dt); }
      }
    } else c.atWork = false;
    if (c.task && c.task.type === 'observe') observeTick(c, dt);
    // track solitude
    const others = G.crew.filter((o) => o !== c && o.alive && !o.missing && o.room === c.room).length;
    c.timeAlone = others === 0 ? c.timeAlone + dt : 0;
    c.alone = others === 0;
  }
  updateDoorsCrew(dt);
}

function nearestSafeRoom(c, fromMonster) {
  let best = null, bc = 1e9;
  for (const r of G.rooms) {
    if (r.id === c.room) continue;
    if (roomHazardNow(r)) continue;
    if (G.creatures.some((m) => m.alive && m.room === r.id && m.state !== 'vent')) continue;
    const p = findPath(c.room, c.x, r.id);
    if (!p) continue;
    let cost = 0, x = c.x; for (const s of p) { cost += Math.abs(x - s.door.x); x = s.door.x; }
    if (cost < bc) { bc = cost; best = r.id; }
  }
  return best;
}

function scheduleTask(c, clock) {
  // grieving/panicking/infected special handled elsewhere
  if (c.quarantined) { c.task = { type: 'hold', room: 'quarantine', auto: true }; repath(c); return; }
  const h = clock.hour;
  const sleepStart = [22, 6, 14][c.watch];
  const rel = (h - sleepStart + 24) % 24;
  const sleepy = rel < 7 || c.fatigue > 92;
  if (c.hp < 55 && G.crew.some((m) => m.alive && m.prof === 'Medic' && m !== c && !m.down) && G.roomById.medbay && !roomHazardNow(G.roomById.medbay)) {
    c.task = { type: 'medical', room: 'medbay', auto: true }; repath(c); return;
  }
  if (sleepy && G.alertLevel < 2 && !G.roomById.quarters.sealed) { c.task = { type: 'sleep', room: 'quarters', auto: true }; repath(c); return; }
  if (rel >= 7 && rel < 7.7) { c.task = { type: 'eat', room: 'mess', auto: true }; repath(c); return; }
  c.task = { type: 'duty', room: c.duty, auto: true };
  // medics auto-treat injured
  if (c.prof === 'Medic') {
    const pt = G.crew.find((o) => o.alive && !o.missing && !o.eva && o !== c && (o.down || o.hp < 50) && !G.crew.some((m) => m.task && m.task.type === 'treat' && m.task.target === o.id));
    if (pt && !roomHazardNow(crewRoom(pt))) c.task = { type: 'treat', target: pt.id, auto: true };
  }
  repath(c);
}

// ---------------------------------------------------------------------------
// Task execution
// ---------------------------------------------------------------------------
function workRate(c, skill) {
  let m = 1 + (c.skills[skill] - 1) * 0.35;
  if (c.stress > 60) m *= 0.8;
  if (c.morale < 30) m *= 0.85;
  if (c.grief > 0) m *= 0.75;
  if (c.hp < 50) m *= 0.75;
  if (!crewRoom(c).powered) m *= 0.75;
  return m;
}
function completeTask(c, msg) {
  if (msg) logEvent('info', msg, c.room);
  const resume = c.task && c.task.resume;
  c.task = resume && resume.type !== 'flee' ? resume : null;
  if (c.task) repath(c);
}
function useParts(c, n) {
  const cost = hasTrait(c, 'Resourceful') ? n * 0.6 : n;
  if (G.res.parts < cost) return false;
  G.res.parts -= cost; return true;
}

function doTask(c, dt) {
  const t = c.task; const r = crewRoom(c);
  if (!t) return;
  c.workAnim = (c.workAnim || 0) + dt;
  switch (t.type) {
    case 'move': case 'hold': break;
    case 'duty': {
      c.fatigue = Math.min(100, c.fatigue + dt * 0.04);
      // station upkeep: trained crew slowly look after their own post without orders
      if (c.room !== c.duty || !['Engineer', 'Technician'].includes(c.prof) || r.fire > 0) break;
      if (r.id === 'reactor' && G.reactor.needsRestart && G.reactor.scramT <= 0) {
        if (!t.restartLogged) { t.restartLogged = true; logEvent('info', `${c.name} is restarting the reactor on their own initiative (slowly).`, 'reactor'); }
        G.reactor.restartProg += dt * 0.035 * workRate(c, 'eng');
        if (G.reactor.restartProg >= 1) { G.reactor.needsRestart = false; G.reactor.restartProg = 0; logEvent('story', `${c.name} brought the reactor back online.`, 'reactor'); AUDIO.powerUp(); }
      } else if ((r.integ < 100 || r.leak) && G.res.parts > 0) {
        const amt = dt * 0.8 * workRate(c, 'eng');
        t.partAcc = (t.partAcc || 0) + amt; if (t.partAcc > 14) { t.partAcc -= 14; if (!useParts(c, 1)) break; }
        r.integ = Math.min(100, r.integ + amt);
        if (r.leak && r.integ > 75 && chance(dt * 0.02)) { r.leak = false; logEvent('info', `${c.name} found and clamped the leak in ${r.short}.`, r.id); }
        c.sparkT = (c.sparkT || 0) + dt; if (c.sparkT > 1.4) { c.sparkT = 0; FX.sparks(c.x + c.face * 10, c.y - 18, 2); }
      }
      break;
    }
    case 'sleep':
      c.sleeping = true;
      c.fatigue = Math.max(0, c.fatigue - dt * (hasTrait(c, 'Insomniac') ? 0.5 : 1.1) * (r.powered ? 1 : 0.7));
      c.stress = Math.max(0, c.stress - dt * 0.5 * (r.powered ? 1 : 0.4));
      { const h = fmtClock(G.t).hour, s = [22, 6, 14][c.watch]; if ((h - s + 24) % 24 >= 7 && c.fatigue < 40) { c.sleeping = false; completeTask(c); } }
      break;
    case 'eat': t.prog += dt; c.morale = Math.min(100, c.morale + dt * (r.powered ? 0.25 : 0.05)); c.stress = Math.max(0, c.stress - dt * 0.3); if (t.prog > 14) completeTask(c); break;
    case 'rest': c.stress = Math.max(0, c.stress - dt * 0.9); c.fatigue = Math.max(0, c.fatigue - dt * 0.6); if (c.stress < 10 && c.fatigue < 15) completeTask(c, `${c.name} feels steadier.`); break;
    case 'medical': if (c.hp >= 90) completeTask(c); break;
    case 'repair': {
      if (r.integ >= 100 && !r.leak && !(r.id === 'reactor' && G.reactor.instability > 0.3)) { completeTask(c, `${c.name} finished repairs in ${r.short}.`); r.cameraJammed = false; break; }
      if (G.res.parts <= 0) { if (!t.noParts) { t.noParts = true; logEvent('warn', `${c.name}: no spare parts left to repair ${r.short}.`); } break; }
      const amt = dt * 2.6 * workRate(c, 'eng');
      t.partAcc = (t.partAcc || 0) + amt;
      if (t.partAcc > 14) { t.partAcc -= 14; if (!useParts(c, 1)) break; }
      r.integ = Math.min(100, r.integ + amt);
      if (r.leak && r.integ > 60) { r.leak = false; logEvent('info', `${c.name} isolated the coolant leak.`, r.id); }
      if (r.id === 'reactor') G.reactor.instability = Math.max(0, G.reactor.instability - dt * 0.03);
      if (!r.cameraOK && r.integ > 50 && !r.cameraJammed) { r.cameraOK = true; logEvent('info', `${c.name} replaced the camera in ${r.short}.`, r.id); }
      for (const d of roomDoors(r)) if (d.jammed && r.integ > 40 && chance(dt * 0.2)) { d.jammed = false; logEvent('info', `${c.name} freed jammed door ${doorLabel(d)}.`, r.id); }
      c.sparkT = (c.sparkT || 0) + dt; if (c.sparkT > 0.7) { c.sparkT = 0; FX.sparks(c.x + c.face * 10, c.y - 18, 3); AUDIO.tool(c); }
      break;
    }
    case 'power': {
      if (!r.elecFault) { completeTask(c, `${r.short}: power restored.`); break; }
      t.prog += dt * 0.09 * workRate(c, 'eng');
      c.sparkT = (c.sparkT || 0) + dt; if (c.sparkT > 0.5) { c.sparkT = 0; FX.sparks(c.x + c.face * 10, r.y0 + 30, 4); }
      if (t.prog >= 1) { if (useParts(c, 1)) { r.elecFault = false; AUDIO.relay(true); completeTask(c, `${c.name} restored power to ${r.short}.`); } else { logEvent('warn', 'No spare parts for wiring.'); completeTask(c); } }
      break;
    }
    case 'extinguish': {
      if (r.fire <= 0) { completeTask(c, `${c.name} put out the fire in ${r.short}.`); break; }
      r.fire = Math.max(0, r.fire - dt * 0.06 * workRate(c, 'ath'));
      if (r.fire < 0.3 && r.fireXs.length > 1 && chance(dt)) r.fireXs.shift();
      if (r.fireXs.length) c.face = r.fireXs[0] > c.x ? 1 : -1;
      FX.foam(c.x + c.face * 12, c.y - 16, c.face);
      break;
    }
    case 'seal': {
      if (r.breach <= 0) { completeTask(c); break; }
      t.prog += dt * 0.045 * workRate(c, 'eng');
      c.sparkT = (c.sparkT || 0) + dt; if (c.sparkT > 0.25) { c.sparkT = 0; FX.sparks(r.breachX, r.breachY + 10, 5, true); AUDIO.weld(); }
      if (t.prog >= 1) {
        if (useParts(c, 2)) { r.breach = 0; G.res.hull = Math.min(100, G.res.hull + 4); logEvent('info', `${c.name} welded a patch over the breach in ${r.short}.`, r.id, { story: true }); completeTask(c); }
        else { if (!t.noParts) logEvent('warn', 'Not enough spare parts to patch the breach (2 needed).'); t.noParts = true; t.prog = 0.8; }
      }
      break;
    }
    case 'investigate': {
      t.prog += dt;
      if (t.prog > 2 && !t.moved) { t.moved = true; t.spot = rnd(r.x0 + 40, r.x1 - 40); }
      if (t.prog > 9) { investigateRoom(c, r); completeTask(c); }
      break;
    }
    case 'decon': {
      if (r.contam <= 0.02) { r.contam = 0; r.contamKnown = false; completeTask(c, `${c.name} burned out the growth in ${r.short}.`); break; }
      r.contam = Math.max(0, r.contam - dt * 0.03 * workRate(c, 'sci'));
      FX.foam(c.x + c.face * 12, c.y - 10, c.face, true);
      if (r.contam > 0.5 && chance(dt * 0.004)) exposeInfection(c, 'decon');
      break;
    }
    case 'reactor': {
      G.reactor.instability = Math.max(0, G.reactor.instability - dt * 0.01 * workRate(c, 'eng'));
      break;
    }
    case 'restart': {
      const R = G.reactor;
      if (!R.needsRestart) { c.task = { type: 'reactor', room: 'reactor' }; break; }
      if (R.scramT > 0) { c.statusLine = `waiting for rods (${Math.ceil(R.scramT)}s)`; break; }
      R.restartProg += dt * 0.08 * workRate(c, 'eng');
      if (R.restartProg >= 1) { R.needsRestart = false; R.restartProg = 0; logEvent('story', `${c.name} brought the reactor back online.`, 'reactor'); AUDIO.powerUp(); c.task = { type: 'reactor', room: 'reactor' }; }
      break;
    }
    case 'security': break;
    case 'arm': {
      t.prog += dt; if (t.prog > 2.5) { c.armed = true; completeTask(c, `${c.name} drew a rifle from the armoury.`); }
      break;
    }
    case 'door': {
      const d = G.doorById[t.door];
      t.prog += dt * (doorPowered(d) ? 2 : 0.35);
      if (t.prog >= 1) {
        d.jammed = false; setDoorMode(d, t.mode, { manual: true, force: true });
        if (t.mode === 'sealed') { /* single door seal */ }
        completeTask(c, `${c.name} ${t.mode === 'open' ? 'cranked open' : t.mode === 'sealed' ? 'manually sealed' : 'hauled shut'} ${doorLabel(d)}.`);
      }
      break;
    }
    case 'treat': {
      const p = G.crew[t.target];
      if (!p || !p.alive) { completeTask(c); break; }
      if (p.room !== c.room) { repath(c); break; }
      if (Math.abs(p.x - c.x) > 26) { moveToward(c, p.x, dt); break; }
      if (G.res.med <= 0) { if (!t.noMed) { t.noMed = true; logEvent('warn', 'MEDICAL SUPPLIES EXHAUSTED.'); } break; }
      const inBay = c.room === 'medbay' && crewRoom(c).powered;
      const amt = dt * (2.2 + c.skills.med * 1.1) * (inBay ? 1.6 : 1) * (G.groups.MED.powered ? 1 : 0.6);
      p.hp = Math.min(100, p.hp + amt);
      t.medAcc = (t.medAcc || 0) + amt; if (t.medAcc > 22) { t.medAcc = 0; G.res.med -= 1; }
      if (p.down && p.hp > 30) { p.down = false; logEvent('info', `${c.name} got ${p.name} back on their feet.`, c.room); }
      p.stress = Math.max(0, p.stress - dt * (hasTrait(c, 'Empathetic') ? 0.8 : 0.3));
      if (p.hp >= 95) completeTask(c, `${c.name} finished treating ${p.name}.`);
      break;
    }
    case 'scan': case 'bloodtest': runMedicalTest(c, dt); break;
    case 'escort': case 'quarantine': escortTick(c, dt); break;
    case 'observe': break;
    case 'fight': break;
    case 'flee': if (!roomHazardNow(r)) { const res = t.resume; c.task = null; if (res && res.ordered) { c.task = res; repath(c); } } break;
    case 'panic': break;
    case 'eva': startEVA(c); break;
    case 'wander': t.prog += dt; if (t.prog > 22) { c.task = null; } break;
  }
}

function investigateRoom(c, r) {
  r.investigatedT = G.t;
  const finds = [];
  if (r.contam > 0.08 && !r.contamKnown) { r.contamKnown = true; finds.push(r.contam > 0.5 ? 'a thick, fibrous growth spreading out of the ceiling vent' : 'a thin, greasy residue around the vent grille. Smells of iron'); G.research.samples++; }
  if (r.blood.length && !r.bloodKnown) { r.bloodKnown = true; finds.push('blood on the deck plates. Not much. Dragged towards the vent'); }
  const hidden = G.crew.filter((o) => o.missing && o.bodyRoom === r.id && !o.bodyFound);
  for (const o of hidden) { o.bodyFound = true; finds.push(`the remains of ${o.name}`); onBodyFound(o, c); }
  if (G.creatures.some((m) => m.alive && m.state === 'vent' && m.ventRoom === r.id)) finds.push('scraping in the duct above. It stops when the torch points at it');
  if (!r.cameraOK) finds.push(r.cameraJammed ? 'the camera housing has been torn open from inside the duct' : 'the camera is dead — burnt connector');
  const msg = finds.length ? `${c.name} reports from ${r.short}: ${finds.join('; ')}.` : `${c.name}: "${r.short} is clear. Nothing here."`;
  logEvent(finds.length ? 'story' : 'info', msg, r.id, { story: finds.length > 0 });
  if (finds.length) { c.stress = Math.min(100, c.stress + 8 * finds.length); AUDIO.radio(); }
}

// ---------------------------------------------------------------------------
// Vitals, stress, morale
// ---------------------------------------------------------------------------
function updateVitals(c, r, dt) {
  const e = effO2(r);
  // breathing
  if (e < 15 || r.p < 35) {
    if (c.suit > 0) c.suit = Math.max(0, c.suit - dt);
    else c.o2 = Math.max(0, c.o2 - dt * (r.p < 15 ? 9 : (15 - e) * 0.55 + 1));
  } else {
    c.o2 = Math.min(100, c.o2 + dt * 12);
    if (c.suit < c.suitMax && c.suitMax > 0 && (r.id === 'airlock' || r.id === 'workshop')) c.suit = Math.min(c.suitMax, c.suit + dt * 3);
  }
  if (c.o2 <= 0) hurt(c, dt * 7, r.p < 15 ? 'decompression' : 'asphyxiation');
  else if (c.o2 < 30) hurt(c, dt * 0.6, 'hypoxia');
  if (r.p < 15) hurt(c, dt * 1.5, 'decompression');
  if (r.temp < -20) hurt(c, dt * 0.8, 'exposure');
  if (r.temp > 70) hurt(c, dt * (r.temp - 70) * 0.04, 'heat');
  if (r.fire > 0.1) for (const fx of r.fireXs) if (Math.abs(fx - c.x) < 26) hurt(c, dt * r.fire * 3.5, 'burns');
  if (c.down) { hurt(c, dt * 0.25, c.lastHurt || 'injuries'); }
  if (!c.alive) return;
  // fatigue
  if (!c.sleeping) c.fatigue = Math.min(100, c.fatigue + dt * (hasTrait(c, 'Insomniac') ? 0.07 : 0.05));
  if (c.task?.type !== 'sleep') c.sleeping = false;
  // body temperature (fever etc.)
  let tt = 36.8;
  if (c.infection) tt += [0.15, 0.9, 1.7, 2.5][c.infection.stage] || 0;
  if (c.fever > 0) { tt += 1.2; c.fever -= dt; }
  if (r.temp < 5) tt -= 0.6;
  c.bodyTemp = approach(c.bodyTemp, tt + Math.sin(G.t * 0.07 + c.id) * 0.1, dt * 0.05);
  // stress
  let s = 0; const k = stressK(c);
  if (r.fire > 0.1) s += 1.8;
  if (e < 16 || r.p < 60) s += 2.5;
  if (!r.powered) s += hasTrait(c, 'Claustrophobic') ? 0.9 : 0.2;
  if (r.sealed && hasTrait(c, 'Claustrophobic')) s += 1.2;
  if (G.alertLevel === 2) s += 0.06;
  if (c.hp < 50) s += 0.4;
  if (G.creatures.some((m) => m.alive && m.room === c.room && m.state !== 'vent')) s += 9;
  if (c.alone && !r.powered && G.phase >= 3) s += 0.35 * (hasTrait(c, 'Paranoid') ? 1.6 : 1);
  if (r.ductMotion > 0.2) s += 0.5 * (hasTrait(c, 'Paranoid') ? 1.5 : 1);
  let relief = 0.12;
  const mates = G.crew.filter((o) => o !== c && o.alive && !o.missing && o.room === c.room);
  if (mates.some((o) => hasTrait(o, 'Natural Leader'))) relief += 0.35;
  if (mates.some((o) => hasTrait(o, 'Empathetic'))) relief += 0.2;
  if (r.id === 'mess' && r.powered) relief += 0.25;
  c.stress = clamp(c.stress + (s * k - (s > 0.5 ? relief * 0.3 : relief)) * dt, 0, 100);
  if (c.grief > 0) { c.grief -= dt; c.stress = Math.min(100, c.stress + dt * 0.15); }
  // morale drift toward ship conditions
  let mt = 70;
  if (!G.groups.HAB.powered) mt -= 15;
  if (G.res.food < 25) mt -= 15;
  if (G.res.water < 25) mt -= 10;
  mt -= G.deaths * 7;
  mt -= c.stress * 0.25;
  if (G.colonistsLost > 0) mt -= Math.min(20, G.colonistsLost / 20);
  if (c.grief > 0) mt -= 25;
  c.morale = approach(c.morale, clamp(mt, 0, 100), dt * 0.08);
  // panic
  if (c.stress > 88 && c.panicT <= 0 && G.t > (c.panicCool || 0) && chance(dt * (hasTrait(c, 'Cowardly') ? 0.12 : 0.04) * (hasTrait(c, 'Brave') ? 0.3 : 1))) startPanic(c);
  if (c.stress > 72 && hasTrait(c, 'Hot-Tempered') && chance(dt * 0.006)) argument(c);
}
function stressK(c) {
  let k = 1;
  if (hasTrait(c, 'Calm')) k *= 0.6; if (hasTrait(c, 'Brave')) k *= 0.75; if (hasTrait(c, 'Cowardly')) k *= 1.4;
  k *= 1.25 - c.skills.cmp * 0.1;
  return k;
}
function startPanic(c) {
  c.panicT = 22; c.panicCool = G.t + 140; c.panicRelief = true;
  const dest = pick(['quarters', 'mess', 'bridge', 'medbay'].filter((id) => !roomHazardNow(G.roomById[id]))) || 'quarters';
  c.task = { type: 'panic', room: dest, prog: 0 }; repath(c);
  logEvent('warn', `${c.name} is PANICKING — abandoned post, running for ${G.roomById[dest].short}.`, c.room, { story: true });
  AUDIO.scream(0.25, c);
  for (const o of G.crew) if (o !== c && o.alive && o.room === c.room) o.stress = Math.min(100, o.stress + 6);
}
function argument(c) {
  const o = G.crew.find((x) => x !== c && x.alive && !x.missing && x.room === c.room);
  if (!o) return;
  const fight = c.stress > 85 || o.rel.some((r) => r.id === c.id && r.type === 'rival');
  logEvent('warn', fight ? `FIGHT in ${crewRoom(c).short}: ${c.name} swung at ${o.name}.` : `${c.name} and ${o.name} are shouting at each other in ${crewRoom(c).short}.`, c.room, { story: fight });
  o.stress = Math.min(100, o.stress + 10); o.morale -= 6; c.morale -= 4;
  if (fight) { hurt(o, 8, 'assault'); hurt(c, 4, 'assault'); }
}

function hurt(c, amt, cause) {
  if (!c.alive) return;
  c.hp -= amt; c.lastHurt = cause;
  if (amt > 3) c.hitFlash = 0.3;
  if (c.hp < 15 && !c.down && c.hp > 0) {
    c.down = true; c.task = null; c.path = []; c.climb = null;
    logEvent('crit', `${c.name} is DOWN in ${crewRoom(c).short} (${cause}). Needs a medic.`, c.room, { story: true });
    AUDIO.scream(0.2, c);
  }
  if (c.hp <= 0) killCrew(c, cause);
}

function killCrew(c, cause, opts = {}) {
  if (!c.alive) return;
  c.alive = false; c.hp = 0; c.down = false; c.deadAt = G.t; c.deathCause = cause; c.task = null; c.path = []; c.climb = null; c.moving = false;
  G.deaths++; G.lastDeathT = G.t;
  const r = crewRoom(c);
  const seen = r && (r.observed || G.crew.some((o) => o.alive && o.room === c.room));
  if (opts.silent) { /* handled by caller */ }
  else if (seen) logEvent('crit', `${fullName(c)} (${c.prof}) is DEAD. Cause: ${cause}. ${r.short}.`, c.room, { story: true });
  else if (G.sensors) logEvent('crit', `BIOMONITOR FLATLINE — ${fullName(c)}. Last signal: ${r.short}. No visual.`, c.room, { story: true });
  else { logEvent('warn', `${c.name} has stopped responding on comms.`, null, { story: true }); c.unconfirmed = true; }
  AUDIO.death(seen);
  if (r) r.blood.push({ x: c.x, y: c.y, s: rnd(0.8, 1.4), wall: false });
  griefWave(c, seen || G.sensors);
  if (G.director) G.director.flag('death');
}
function griefWave(c, known) {
  if (!known) return;
  for (const o of G.crew) {
    if (!o.alive || o === c) continue;
    const rel = o.rel.find((r) => r.id === c.id);
    let hit = 8, mor = 6;
    if (o.room === c.room) hit += 25;
    if (rel) {
      if (rel.type === 'sibling' || rel.type === 'spouse') { hit += 55; mor += 40; o.grief = 240; logEvent('story', `${o.name} has learned that ${c.first} is gone. ${rel.type === 'sibling' ? 'Their sibling.' : 'Their spouse.'}`, o.room, { story: true }); if (hasTrait(o, 'Hot-Tempered') || chance(0.4)) o.vengeful = true; }
      else if (rel.type === 'friend') { hit += 30; mor += 18; o.grief = 120; }
      else if (rel.type === 'rival') { hit += 10; mor += 3; }
    }
    if (hasTrait(o, 'Empathetic')) hit *= 1.3;
    o.stress = Math.min(100, o.stress + hit * stressK(o));
    o.morale = Math.max(0, o.morale - mor);
  }
}
function onBodyFound(body, finder) {
  logEvent('crit', `${finder.name} found what is left of ${body.name}.`, body.bodyRoom, { story: true });
  if (body.unconfirmed) { body.unconfirmed = false; griefWave(body, true); }
  finder.stress = Math.min(100, finder.stress + 30);
}

function updateDoorsCrew(dt) {
  for (const d of G.doors) {
    const m = effectiveMode(d);
    let target = m === 'open' ? 1 : 0;
    if (d.hold > 0) { d.hold -= dt; if (m === 'closed') target = 1; }
    if (d.jammed) continue;
    if (m === 'sealed' || m === 'locked') target = 0;
    const powered = doorPowered(d);
    if (d.crank > 0) { d.crank -= dt; continue; }
    const rate = powered ? 2.2 : 0;
    const prev = d.anim;
    d.anim = approach(d.anim, target, rate * dt);
    if (d.outer) d.anim = approach(prev, m === 'open' ? 1 : 0, (powered ? 0.6 : 0) * dt);
    if (prev > 0.2 && d.anim <= 0 && G.started && m !== 'open' && G.t - d.lastSlam > 0.5) { d.lastSlam = G.t; AUDIO.doorClose(d); }
  }
}

// ---------------------------------------------------------------------------
// Medical tests / quarantine / escort / observe
// ---------------------------------------------------------------------------
function orderMedicalTest(subject, kind) {
  const roomId = kind === 'bloodtest' ? 'quarantine' : 'medbay';
  if (!G.groups.MED.powered || !G.roomById[roomId].powered) { logEvent('warn', `${kind === 'bloodtest' ? 'Blood analyser' : 'Body scanner'} unpowered. Restore MEDICAL power.`); return; }
  if (kind === 'bloodtest' && G.res.med < 2) { logEvent('warn', 'Blood test needs 2 medical supplies.'); return; }
  const medics = G.crew.filter((c) => crewAvailable(c) && c !== subject && (c.prof === 'Medic' || c.prof === 'Scientist') && c.panicT <= 0);
  if (!medics.length) { logEvent('warn', 'No medic or scientist available to run the test.'); return; }
  medics.sort((a, b) => (b.skills.med + b.skills.sci) - (a.skills.med + a.skills.sci) + (a.task && a.task.ordered ? 3 : 0) - (b.task && b.task.ordered ? 3 : 0));
  const m = medics[0];
  orderCrew(m, { type: kind, room: roomId, target: subject.id }, { auto: true });
  if (subject.task?.type !== kind) orderCrew(subject, { type: 'move', room: roomId }, { auto: true, force: true });
  logEvent('info', `${m.name} will run a ${kind === 'bloodtest' ? 'BLOOD TEST' : 'MEDICAL SCAN'} on ${subject.name} in ${G.roomById[roomId].short}.`);
}
function runMedicalTest(c, dt) {
  const t = c.task, s = G.crew[t.target];
  if (!s || !s.alive || s.missing) { completeTask(c); return; }
  if (s.room !== t.room) { c.statusLine = `waiting for ${s.first}`; t.wait = (t.wait || 0) + dt; if (t.wait > 60) { logEvent('warn', `${s.name} never arrived for the test.`, null, { story: true }); completeTask(c); } return; }
  if (!crewRoom(c).powered) { c.statusLine = 'equipment unpowered'; return; }
  t.prog += dt / (t.type === 'bloodtest' ? 22 : 9) * workRate(c, 'med');
  if (t.prog < 1) return;
  const stage = s.infection ? s.infection.stage : -1;
  const research = G.research.prog;
  let text;
  if (t.type === 'scan') {
    const temp = s.bodyTemp.toFixed(1);
    let anomaly = false;
    if (stage >= 2) anomaly = chance(0.85); else if (stage === 1) anomaly = chance(0.3 + research / 300); else if (stage === 0) anomaly = chance(0.05);
    else anomaly = chance(0.04);
    text = `SCAN ${s.name}: core temp ${temp}°C. ${anomaly ? 'Tissue density ANOMALOUS in thoracic cavity. Recommend blood test.' : 'No structural anomalies.'}`;
    s.lastScan = { t: G.t, anomaly, temp };
  } else {
    G.res.med -= 2;
    let p;
    if (stage >= 2) p = 0.97; else if (stage === 1) p = 0.65 + research / 300; else if (stage === 0) p = 0.25 + research / 250; else p = 0;
    const falsePos = stage < 0 && chance(research > 50 ? 0.01 : 0.06);
    const pos = (stage >= 0 && chance(p)) || falsePos;
    const inconclusive = !pos && stage >= 0 && chance(0.35);
    text = `BLOOD TEST ${s.name}: ${pos ? 'POSITIVE — foreign cellular structure present. Not human.' : inconclusive ? 'INCONCLUSIVE — sample degraded. Retest advised.' : 'NEGATIVE.'}`;
    s.lastTest = { t: G.t, result: pos ? 'POSITIVE' : inconclusive ? 'INCONCLUSIVE' : 'NEGATIVE' };
    if (pos) { G.research.samples++; if (s.infection) { s.infection.known = true; } }
    if (pos && s.infection && s.infection.stage >= 1 && !s.quarantined && chance(0.6)) {
      // the thing in them knows it has been found
      s.infection.alarmed = true;
    }
  }
  logEvent(text.includes('POSITIVE') || text.includes('ANOMALOUS') ? 'crit' : 'info', text, c.room, { story: text.includes('POSITIVE') });
  AUDIO.blip(text.includes('POSITIVE') ? 180 : 660, 0.15);
  completeTask(c);
  if (s.task && s.task.type === 'move') s.task = null;
}

function orderQuarantine(subject) {
  const q = G.roomById.quarantine;
  if (subject.quarantined) { // release
    subject.quarantined = false; subject.task = null;
    logEvent('info', `${subject.name} released from quarantine.`); return;
  }
  const sec = G.crew.filter((c) => crewAvailable(c) && c !== subject && c.prof === 'Security' && c.panicT <= 0);
  const esc = sec.sort((a, b) => Math.abs(a.x - subject.x) - Math.abs(b.x - subject.x))[0];
  subject.quarantineOrder = true;
  if (esc) {
    orderCrew(esc, { type: 'quarantine', target: subject.id }, { auto: true });
    logEvent('info', `${esc.name} is escorting ${subject.name} to QUARANTINE.`);
  } else logEvent('info', `${subject.name} ordered to report to QUARANTINE (no escort available).`);
  // subject compliance
  const resist = subject.infection && subject.infection.stage >= 2 && !esc;
  if (resist) { logEvent('warn', `${subject.name} acknowledges... and does not move.`, subject.room, { story: true }); subject.ignoring = 40; return; }
  subject.stress = Math.min(100, subject.stress + 15); subject.morale -= 10;
  subject.task = { type: 'move', room: 'quarantine', quarantine: true, prog: 0 }; repath(subject);
}
function escortTick(c, dt) {
  const t = c.task, s = G.crew[t.target];
  if (!s || !s.alive) { completeTask(c); return; }
  if (t.type === 'quarantine' && s.room === 'quarantine' && s.quarantined) { completeTask(c, `${c.name}: "${s.first} is secured in quarantine."`); return; }
}
function checkQuarantineArrival(c) {
  if (c.task && c.task.quarantine && c.room === 'quarantine' && !c.quarantined) {
    c.quarantined = true; c.quarantineOrder = false; c.task = { type: 'hold', room: 'quarantine' };
    // move escort out, then lock
    for (const o of G.crew) if (o !== c && o.room === 'quarantine' && o.task && o.task.type === 'quarantine') { o.task = { type: 'move', room: 'medbay', auto: true }; repath(o); }
    setTimeout(() => {}, 0);
    G.pendingQuarantineLock = G.t + 3;
    logEvent('story', `${c.name} is in QUARANTINE. Doors will lock.`, 'quarantine', { story: true });
  }
}
function observeTick(c, dt) {
  const s = G.crew[c.task.target];
  if (!s || !s.alive || s.missing) { completeTask(c); return; }
  c.task.prog += dt;
  if (s.room === c.room) {
    c.task.seen = (c.task.seen || 0) + dt;
    if (s.infection && s.infection.stage >= 1 && c.task.seen > 25 && !c.task.reported) {
      c.task.reported = true;
      const lines = [`${s.first} ate three ration packs in ten minutes and asked for more.`, `${s.first} stood facing the wall for a long time. Didn't blink.`, `${s.first} keeps touching the back of their neck. Sweating, but says they're cold.`, `${s.first} went quiet when I came in. Like they'd been talking to someone.`];
      logEvent('story', `${c.name} (observing): "${pick(lines)}"`, c.room, { story: true });
      AUDIO.radio();
    } else if (!s.infection && c.task.seen > 50 && !c.task.reported) {
      c.task.reported = true;
      logEvent('info', `${c.name} (observing): "${s.first} seems normal. Tired. Scared, like the rest of us."`, c.room);
    }
  }
  if (c.task.prog > 120) completeTask(c, `${c.name} stopped observing ${s.name}.`);
}

function questionCrew(c) {
  const st = c.infection ? c.infection.stage : -1;
  const honestScared = [`"I'm fine. Just haven't been sleeping."`, `"Is this about the noises? Everyone's hearing them."`, `"You want to test me? Test me. I've got nothing to hide."`, `"I keep thinking about ${G.deaths ? 'the ones we lost' : 'home'}."`];
  const stressed = [`"Why are you asking me? Ask ${pick(G.crew.filter((o) => o.alive && o !== c)).first}."`, `"Leave me alone. I'm doing my job."`, `"I don't know. I don't know anything. Stop asking."`];
  const infected1 = [`"I'm fine. I feel... better than fine, actually."`, `"Hungry. That's all. I've been hungry."`, `"I was in ${G.roomById[c.infection?.lastWander || c.duty].short}. Working. Ask anyone."`];
  const infected2 = [`"Of course. Of course I'm fine. We're all fine."`, `"Why would I need a test? I'm warm. I'm finally warm."`, `"I was where I was supposed to be."`];
  let line;
  if (st >= 2) line = pick(infected2);
  else if (st >= 1) line = c.stress > 60 ? pick(stressed) : pick(infected1);
  else line = c.stress > 55 || hasTrait(c, 'Paranoid') ? pick(stressed) : pick(honestScared);
  const tell = st >= 1 ? pick(['', '', 'Hands steady. Too steady.', 'Pupils slow to react.', 'Smells faintly of iron.']) : pick(['', '', 'Shaking slightly.', 'Avoids eye contact.']);
  logEvent('story', `QUESTIONED ${c.name}: ${line}${tell ? ' — ' + tell : ''}`, c.room, { story: false });
  c.stress = Math.min(100, c.stress + 4);
  AUDIO.radio();
}
