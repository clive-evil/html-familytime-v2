'use strict';
// ============================================================================
// SIM — rooms, doors, atmosphere, power, fire, resources, pathfinding
// ============================================================================

function logEvent(sev, text, roomId, opts = {}) {
  const e = { t: G.t, clock: fmtClock(G.t).str, sev, text, room: roomId || null, id: (G.logId = (G.logId || 0) + 1) };
  G.log.push(e); if (G.fullLog) G.fullLog.push(e);
  if (G.log.length > 300) G.log.shift();
  if (opts.story !== false && (sev === 'crit' || sev === 'story' || opts.story)) G.story.push(`${fmtClock(G.t).str} — ${text}`);
  if (typeof UI !== 'undefined' && UI.onLog) UI.onLog(e, opts);
  return e;
}

function initShip() {
  G.rooms = []; G.roomById = {};
  for (const d of ROOM_DEFS) {
    const r = Object.assign({}, d);
    r.y0 = DECK_TOP[d.deck]; r.y1 = r.y0 + ROOM_H; r.fy = r.y1 - 8; r.w = d.x1 - d.x0; r.vol = r.w;
    r.cx = (d.x0 + d.x1) / 2; r.cy = (r.y0 + r.y1) / 2;
    Object.assign(r, {
      p: 101, o2: 21, temp: 20, integ: 100, breach: 0, breachX: r.cx, breachY: r.y0 + 40, fire: 0, fireXs: [],
      elecFault: false, cameraOK: true, cameraT: 0, contam: 0, contamKnown: false, venting: false, sealed: false,
      powered: true, observed: true, lifeSigns: 0, motion: 0, ductMotion: 0, leak: false, blood: [],
      flick: 0, dangerSeen: 0, lastCreatureSeen: -999, interference: 0, vent: VENT_X[d.id], noise: 0,
      sparkT: 0, lightLevel: 1, staffBonus: 0, investigatedT: -999,
    });
    G.rooms.push(r); G.roomById[r.id] = r;
  }
  G.doors = []; G.doorById = {};
  for (const d of DOOR_DEFS) {
    const door = Object.assign({}, d);
    const ra = G.roomById[d.a];
    if (d.hatch) { door.y = ra.y1 + SLAB / 2; door.mode = 'closed'; }
    else { door.y = ra.y1 - 40; door.mode = d.outer ? 'closed' : 'open'; }
    // a few doors start closed to teach the system
    if (['d_med_qua', 'd_qua_bri', 'd_rea_o2'].includes(d.id)) door.mode = 'closed';
    door.anim = door.mode === 'open' ? 1 : 0; door.jammed = false; door.hold = 0; door.crank = 0; door.force = 0; door.lastSlam = -9;
    G.doors.push(door); G.doorById[door.id] = door;
  }
  G.adj = {};
  for (const r of G.rooms) G.adj[r.id] = [];
  for (const d of G.doors) {
    if (d.outer) continue;
    G.adj[d.a].push({ door: d, to: d.b });
    G.adj[d.b].push({ door: d, to: d.a });
  }
  G.groups = {}; for (const g of GROUPS) G.groups[g.id] = { ...g, on: true, tripped: false, powered: true };
  G.reactor = { coolant: 100, instability: 0, scramT: 0, output: 120, needsRestart: false, restartProg: 0 };
  G.battery = 70; // %
  G.res = { o2: 92, food: 78, water: 81, med: 24, parts: 42, hull: 100 };
  G.colonists = 2400; G.colonistsLost = 0; G.cryoHeat = 0;
  G.supply = 0; G.demand = 0; G.blackout = false;
  G.alertLevel = 0;
}

// ---------------------------------------------------------------------------
// door helpers
// ---------------------------------------------------------------------------
function doorOther(door, roomId) { return door.a === roomId ? door.b : door.a; }
function doorPowered(door) {
  if (G.blackout) return false;
  const a = G.roomById[door.a], b = door.b === 'SPACE' ? null : G.roomById[door.b];
  return (a && a.powered) || (b && b.powered);
}
function effectiveMode(door) {
  if (door.mode === 'locked' && !G.groups.SEC.powered) return 'closed';
  return door.mode;
}
function doorAirFactor(door) {
  if (effectiveMode(door) === 'sealed') return 0;
  return clamp(door.anim, 0, 1) + 0.004;
}
// can a crew member path through (planning)?
function doorPassable(door, who) {
  if (door.outer) return false;
  const m = effectiveMode(door);
  if (m === 'sealed') return false;
  if (m === 'locked') return who === 'creature' ? true : false;
  if (door.jammed && door.anim < 0.5) return who === 'creature';
  return true;
}
function setDoorMode(door, mode, opts = {}) {
  if (door.jammed && !opts.force) {
    logEvent('warn', `Door ${doorLabel(door)} is JAMMED — needs repair.`, door.a); return false;
  }
  if (!opts.manual && !doorPowered(door) && !opts.force) {
    logEvent('warn', `NO RESPONSE — ${doorLabel(door)} controller unpowered. Send crew to operate it by hand.`, door.a);
    AUDIO.blip(220, 0.08);
    return false;
  }
  if (mode === 'locked' && !G.groups.SEC.powered) {
    logEvent('warn', 'Cannot lock: SECURITY bus unpowered (mag-locks dead).', door.a); return false;
  }
  const prev = door.mode;
  door.mode = mode;
  if (mode === 'open') { door.hold = 0; if (!opts.manual) door.override = G.t + 30; }
  if ((mode === 'sealed' || mode === 'closed' || mode === 'locked') && prev === 'open') { AUDIO.doorSlam(door, mode === 'sealed'); door.lastSlam = G.t; G.shake = Math.max(G.shake, mode === 'sealed' ? 2.5 : 1); }
  else if (mode === 'open' && prev !== 'open') AUDIO.doorServo(door);
  else if (mode === 'sealed') { AUDIO.doorSlam(door, true); door.lastSlam = G.t; }
  // if a sealed door is unsealed, mark both rooms unsealed
  if (prev === 'sealed' && mode !== 'sealed') {
    for (const rid of [door.a, door.b]) { const r = G.roomById[rid]; if (r && r.sealed) r.sealed = false; }
  }
  return true;
}
function doorLabel(door) {
  if (door.outer) return 'AIRLOCK OUTER HATCH';
  const a = G.roomById[door.a].short, b = G.roomById[door.b].short;
  return door.hatch ? `HATCH ${a}/${b}` : `${a}↔${b}`;
}
function roomDoors(room) { return G.doors.filter((d) => d.a === room.id || d.b === room.id); }
function sealRoom(room, opts = {}) {
  const doors = roomDoors(room).filter((d) => !d.outer);
  const powered = room.powered || doors.some(doorPowered);
  if (!powered && !opts.force) { logEvent('warn', `${room.short}: emergency seal failed — no power to clamps. Seal doors by hand.`, room.id); return false; }
  for (const d of doors) { d.jammed = false; setDoorMode(d, 'sealed', { force: true }); }
  room.sealed = true;
  logEvent('warn', `${room.short} EMERGENCY SEALED. Doors clamped, vents shut.`, room.id);
  G.shake = Math.max(G.shake, 3);
  return true;
}
function unsealRoom(room) {
  if (room.venting) stopVent(room);
  room.sealed = false;
  for (const d of roomDoors(room)) {
    if (d.outer) continue;
    const other = G.roomById[doorOther(d, room.id)];
    if (other && other.sealed) continue;
    if (d.mode === 'sealed') d.mode = 'closed';
  }
  logEvent('info', `${room.short} seal released. Doors closed (unlocked).`, room.id);
}
function lockdownRoom(room) {
  let ok = 0;
  for (const d of roomDoors(room)) { if (d.outer || d.mode === 'sealed') continue; if (setDoorMode(d, G.groups.SEC.powered ? 'locked' : 'closed')) ok++; }
  if (ok) logEvent('info', `${room.short} lockdown: ${ok} door(s) ${G.groups.SEC.powered ? 'locked' : 'closed (locks unpowered)'}.`, room.id);
}
function startVent(room) {
  if (!room.sealed) { if (!sealRoom(room)) return false; }
  room.venting = true;
  logEvent('crit', `VENTING ${room.short} TO SPACE. Anyone inside without a suit will die.`, room.id);
  AUDIO.ventRoar(room);
  G.shake = Math.max(G.shake, 5);
  return true;
}
function stopVent(room) { room.venting = false; logEvent('info', `${room.short} dump valve closed. Repressurising when unsealed.`, room.id); }

// ---------------------------------------------------------------------------
// Pathfinding (Dijkstra over rooms; door positions as waypoints)
// ---------------------------------------------------------------------------
function findPath(fromRoom, fromX, toRoom, who = 'crew', avoid = null) {
  if (fromRoom === toRoom) return [];
  const best = {}; const prev = {}; const open = [{ room: fromRoom, x: fromX, c: 0 }];
  best[fromRoom] = 0;
  while (open.length) {
    open.sort((a, b) => a.c - b.c);
    const cur = open.shift();
    if (cur.room === toRoom) break;
    if (cur.c > best[cur.room]) continue;
    for (const e of G.adj[cur.room]) {
      if (!doorPassable(e.door, who)) continue;
      let c = cur.c + Math.abs(cur.x - e.door.x) + (e.door.hatch ? 80 : 20);
      if (avoid && avoid(e.to)) c += 2500;
      if (best[e.to] === undefined || c < best[e.to]) {
        best[e.to] = c; prev[e.to] = { from: cur.room, door: e.door };
        open.push({ room: e.to, x: e.door.x, c });
      }
    }
  }
  if (best[toRoom] === undefined) return null;
  const path = []; let r = toRoom;
  while (r !== fromRoom) { const p = prev[r]; path.unshift({ door: p.door, from: p.from, to: r }); r = p.from; }
  return path;
}
function roomAt(x, y) {
  for (const r of G.rooms) if (x >= r.x0 && x < r.x1 && y >= r.y0 && y <= r.y1) return r;
  return null;
}

// ---------------------------------------------------------------------------
// Power
// ---------------------------------------------------------------------------
function reactorOutput() {
  const rr = G.roomById.reactor, R = G.reactor;
  if (R.scramT > 0 || R.needsRestart) return 0;
  const manned = G.crew.some((c) => c.alive && c.room === 'reactor' && c.atWork && (c.task?.type === 'reactor' || (c.duty === 'reactor' && c.task?.type === 'duty')));
  R.manned = manned;
  const integ = Math.max(0, rr.integ) / 100;
  let out = 132 * Math.pow(integ, 0.7) * (0.45 + 0.55 * R.coolant / 100) * (manned ? 1 : 0.86);
  if (R.instability > 0.25) out *= 1 - R.instability * 0.35 * (0.5 + 0.5 * Math.sin(G.t * 3.1) * Math.sin(G.t * 1.7));
  if (rr.elecFault) out *= 0.6;
  return Math.max(0, out);
}

function updatePower(dt) {
  const R = G.reactor, rr = G.roomById.reactor;
  // reactor dynamics
  if (rr.leak) R.coolant = Math.max(0, R.coolant - 0.55 * dt);
  else if (R.coolant < 100) R.coolant = Math.min(100, R.coolant + 0.15 * dt);
  let instTarget = 0;
  if (R.coolant < 55) instTarget += (55 - R.coolant) / 45;
  if (rr.integ < 45) instTarget += (45 - rr.integ) / 60;
  if (rr.fire > 0.2) instTarget += 0.4;
  const manned = R.manned;
  if (instTarget > R.instability) R.instability += 0.012 * dt * (manned ? 0.5 : 1);
  else R.instability = Math.max(0, R.instability - 0.02 * dt * (manned ? 2 : 1));
  if (R.instability >= 1 && R.scramT <= 0 && !R.needsRestart) {
    R.scramT = 20; R.instability = 0.55; R.needsRestart = true; R.restartProg = 0;
    logEvent('crit', 'REACTOR SCRAM. Emergency rods dropped. Output 0%. Running on batteries. An operator must restart it at the reactor console.', 'reactor');
    AUDIO.impact(0.8); AUDIO.powerDown(); G.shake = 6;
    if (G.director) G.director.flag('scram');
  }
  if (R.scramT > 0) R.scramT -= dt;

  const supply = reactorOutput();
  R.output = supply;
  let demand = 0;
  for (const g of GROUPS) if (G.groups[g.id].on) demand += g.demand;
  G.supply = supply; G.demand = demand;
  const net = supply - demand;
  // battery: 100% = 1100 unit-seconds
  G.battery = clamp(G.battery + (net * dt / 1100) * 100, 0, 100);
  G.brownout = net < 0 && G.battery < 15;
  if (G.battery <= 0 && net < 0) {
    // trip breakers in shed order
    const g = SHED_ORDER.map((id) => G.groups[id]).find((g) => g.on);
    if (g) {
      g.on = false; g.tripped = true;
      logEvent('crit', `BREAKER TRIP — ${g.name} shed. Reactor ${Math.round(supply)} MW vs demand ${Math.round(demand)} MW.`);
      AUDIO.powerDown(); G.shake = Math.max(G.shake, 1.5);
      G.flashPower = 2;
      if (!G._tripHint) { G._tripHint = true; logEvent('hint', 'A tripped bus stays dark until you re-energise it in POWER DISTRIBUTION — and it will trip again unless generation covers demand. Choose what to keep.'); }
      if (UI.autoPause && G.t - (G._tripPause || -999) > 60) { G._tripPause = G.t; UI.autoPause('BREAKER TRIP'); }
    }
  }
  G.blackout = supply < 6 && G.battery <= 0;
  for (const g of GROUPS) {
    const gs = G.groups[g.id];
    gs.powered = gs.on && !G.blackout;
  }
  if (G.blackout && !G._wasBlackout) { logEvent('crit', 'TOTAL BLACKOUT. Essential bus dead. Emergency strips only.'); AUDIO.powerDown(); }
  G._wasBlackout = G.blackout;

  for (const r of G.rooms) {
    const was = r.powered;
    r.powered = G.groups[r.group].powered && !r.elecFault && r.integ > 4;
    if (was && !r.powered) { r.flick = 1.4; if (G.started) AUDIO.roomPowerDown(r); }
    if (!was && r.powered) r.flick = 0.8;
    if (r.flick > 0) r.flick -= dt;
  }
}

function setGroup(id, on) {
  const g = G.groups[id];
  if (g.essential) return;
  if (on && G.blackout) { logEvent('warn', 'Cannot energise bus: no generation.'); return; }
  g.on = on; g.tripped = false;
  logEvent('info', `${g.name} ${on ? 'ENERGISED' : 'SHUT DOWN'} by operator.`);
  AUDIO.relay(on);
  if (id === 'SEC' && !on) {
    const locked = G.doors.filter((d) => d.mode === 'locked');
    if (locked.length) logEvent('warn', `Mag-locks released on ${locked.length} door(s): ${locked.map(doorLabel).join(', ')}.`);
  }
}

// ---------------------------------------------------------------------------
// Atmosphere
// ---------------------------------------------------------------------------
function effO2(r) { return (r.p / 101) * r.o2; }

function updateAtmosphere(dt) {
  const life = G.groups.LIFE.powered && G.roomById.o2.integ > 8 && G.roomById.o2.powered;
  // door flows
  for (const d of G.doors) {
    if (d.outer) continue;
    const f = doorAirFactor(d);
    if (f <= 0.001) continue;
    const a = G.roomById[d.a], b = G.roomById[d.b];
    const dp = a.p - b.p;
    const rate = Math.min(1, 0.9 * f * dt * (d.hatch ? 0.7 : 1));
    const eq = dp * a.vol * b.vol / (a.vol + b.vol); // moles to equalise
    const q = eq * rate;
    const src = q > 0 ? a : b;
    const na = a.p * a.vol, nb = b.p * b.vol;
    const o2a = a.o2 * na, o2b = b.o2 * nb;
    const qo2 = q * src.o2;
    const nna = na - q, nnb = nb + q;
    a.p = nna / a.vol; b.p = nnb / b.vol;
    if (nna > 1) a.o2 = (o2a - qo2) / nna; if (nnb > 1) b.o2 = (o2b + qo2) / nnb;
    // mixing even at equal pressure
    const mix = Math.min(1, 0.15 * f * dt);
    const mo = (a.o2 - b.o2) * mix * 0.5; a.o2 -= mo; b.o2 += mo;
    const mt = (a.temp - b.temp) * mix * 0.5; a.temp -= mt; b.temp += mt;
    if (Math.abs(dp) > 8 && f > 0.3) { d.flowViz = dp; } else d.flowViz = 0;
    // automatic pressure doors: only work with power, and not when jammed or overridden
    const leakSide = (a.breach > 0 || a.venting) ? a : (b.breach > 0 || b.venting) ? b : null;
    const fireSide = a.fire > 0.45 ? a : b.fire > 0.45 ? b : null;
    if (d.mode === 'open' && fireSide && !d.jammed && doorPowered(d) && G.t > (d.override || 0)) {
      d.mode = 'closed'; d.hold = 0; d.lastSlam = G.t; AUDIO.doorSlam(d, true);
      logEvent('warn', `FIRE DOOR ${doorLabel(d)} auto-closed.`, fireSide.id);
    }
    if (d.mode === 'open' && (Math.abs(dp) > 22 || (leakSide && leakSide.p < 92)) && !d.jammed && doorPowered(d) && G.t > (d.override || 0)) {
      d.mode = 'closed'; d.hold = 0; d.lastSlam = G.t; AUDIO.doorSlam(d, true); G.shake = Math.max(G.shake, 1.5);
      logEvent('warn', `PRESSURE DOOR ${doorLabel(d)} auto-closed.`, leakSide ? leakSide.id : dp > 0 ? d.b : d.a);
    }
    // fire can creep through
    if (f > 0.4) for (const [s, t] of [[a, b], [b, a]]) if (s.fire > 0.6 && t.fire < 0.05 && t.p > 40 && chance(0.03 * s.fire * dt)) igniteRoom(t, 0.12, 'spread');
  }
  // outer airlock door
  const outer = G.doorById.d_outer;
  const al = G.roomById.airlock;
  for (const r of G.rooms) {
    let leak = r.breach * 0.55 * (300 / r.vol);
    if (r.venting) leak += 1.1;
    if (r === al && outer.anim > 0.05) leak += 1.4 * outer.anim;
    if (leak > 0) { const k = Math.min(1, leak * dt); r.p -= r.p * k; }
    if (r.p < 0.2) r.p = 0;
    // life support
    const sealedOff = r.sealed || r.venting;
    if (life && !sealedOff && G.res.o2 > 0) {
      const eff = (G.roomById.o2.integ / 100) * (G.roomById.o2.elecFault ? 0.4 : 1);
      if (r.p < 101) {
        const add = Math.min(101 - r.p, 2.4 * dt * eff);
        r.p += add; G.res.o2 -= add * r.vol / 9000;
      }
      if (r.o2 < 21) {
        const add = Math.min(21 - r.o2, 0.22 * dt * eff);
        r.o2 += add; G.res.o2 -= add * r.vol / 30000;
      }
      r.temp = approach(r.temp, 20, 0.15 * dt);
    } else {
      r.temp = approach(r.temp, 6, 0.03 * dt);
    }
    if (r.p < 60) r.temp = approach(r.temp, -55, (1 - r.p / 101) * 0.8 * dt);
    if (r.fire > 0) { r.o2 = Math.max(0, r.o2 - r.fire * 0.22 * dt); r.temp = approach(r.temp, 35 + r.fire * 75, r.fire * 2.5 * dt); }
    r.temp = clamp(r.temp, -80, 220);
    r.o2 = clamp(r.o2, 0, 23);
  }
  // crew breathing
  for (const c of G.crew) if (c.alive && c.room && !c.eva) { const r = G.roomById[c.room]; r.o2 = Math.max(0, r.o2 - 0.009 * dt * (r.vol < 300 ? 1.4 : 1)); }
  // O2 production
  const o2r = G.roomById.o2;
  if (life) {
    const staffed = G.crew.some((c) => c.alive && c.room === 'o2' && c.atWork && (c.duty === 'o2' || c.task?.type === 'repair'));
    G.res.o2 += 0.11 * dt * (o2r.integ / 100) * (staffed ? 1.25 : 1);
  }
  G.res.o2 = clamp(G.res.o2, 0, 100);
  for (const th of [50, 25, 10]) { if (G.res.o2 < th && (G._o2warn || 101) > th) { G._o2warn = th; logEvent('crit', `O2 RESERVE ${th}%. ${G.rooms.some((r) => r.breach > 0 && !r.sealed) ? 'Vents are pumping air straight out of an open breach — seal it or the room.' : 'Production is not keeping up.'}`); } }
  if (G.res.o2 > 60) G._o2warn = 101;
}

// ---------------------------------------------------------------------------
// Fire / damage
// ---------------------------------------------------------------------------
function igniteRoom(r, amt = 0.15, cause = '') {
  if (r.p < 25 || r.o2 < 9) return;
  const was = r.fire;
  r.fire = Math.max(r.fire, amt);
  if (r.fireXs.length === 0 || chance(0.4)) r.fireXs.push(rnd(r.x0 + 30, r.x1 - 30));
  if (r.fireXs.length > 3) r.fireXs.shift();
  if (was < 0.05) {
    logEvent('crit', `FIRE in ${r.short}${cause === 'spread' ? ' (spread through open door)' : cause === 'electrical' ? ' — junction box arcing' : ''}.`, r.id);
    AUDIO.fireStart(r);
    if (G.director) G.director.flag('fire');
  }
}
function damageRoom(r, amt, cause) {
  r.integ = Math.max(0, r.integ - amt);
  if (amt > 8 && chance(0.35)) r.elecFault = true;
  if (amt > 6 && chance(0.25)) r.cameraOK = false;
}
function breachRoom(r, size, x) {
  r.breach = Math.min(1, r.breach + size);
  r.breachX = x ?? rnd(r.x0 + 40, r.x1 - 40);
  r.breachY = r.y0 + rnd(25, 70);
  r.sealProg = 0;
  G.res.hull = Math.max(0, G.res.hull - size * 14);
}

function updateFire(dt) {
  for (const r of G.rooms) {
    if (r.fire <= 0) { r.fireXs.length = 0; continue; }
    const e = effO2(r);
    if (e < 10 || r.p < 25) r.fire -= 0.22 * dt;
    else r.fire += 0.022 * dt * (e / 21);
    r.fire = clamp(r.fire, 0, 1);
    r.integ = Math.max(0, r.integ - r.fire * 0.45 * dt);
    if (r.fire > 0.5 && r.cameraOK && chance(0.02 * dt)) { r.cameraOK = false; logEvent('warn', `Camera in ${r.short} burned out.`, r.id); }
    if (r.fire > 0.4 && !r.elecFault && chance(0.015 * dt)) { r.elecFault = true; logEvent('warn', `${r.short}: wiring loom burning — local power lost.`, r.id); }
    if (r.fire <= 0) { r.fire = 0; logEvent('info', `Fire in ${r.short} is out.`, r.id); }
  }
}

// ---------------------------------------------------------------------------
// Resources / ship-wide
// ---------------------------------------------------------------------------
function updateResources(dt) {
  const alive = G.crew.filter((c) => c.alive && !c.missing);
  let eat = 0;
  for (const c of alive) eat += c.infection && c.infection.stage >= 1 ? 2.6 : 1;
  const prevFood = G.res.food;
  G.res.food -= eat * 0.0032 * dt;
  const hy = G.roomById.hydro;
  if (hy.powered) {
    const staffed = G.crew.some((c) => c.alive && c.room === 'hydro' && c.atWork && c.duty === 'hydro');
    G.res.food += 0.026 * dt * (hy.integ / 100) * (staffed ? 1.35 : 1) * (hy.p > 60 ? 1 : 0.2) * (hy.temp > 5 ? 1 : 0.3);
  }
  G.foodRate = (G.res.food - prevFood) / dt; // per sec
  G.res.water -= alive.length * 0.0028 * dt;
  if (G.groups.LIFE.powered && G.roomById.o2.powered) G.res.water += 0.022 * dt * (G.roomById.o2.integ / 100) * (hy.powered ? 1 : 0.6);
  // fabrication
  const ws = G.roomById.workshop;
  if (ws.powered && G.crew.some((c) => c.alive && c.room === 'workshop' && c.atWork && c.duty === 'workshop')) {
    G.fab = (G.fab || 0) + dt;
    if (G.fab > 35) { G.fab = 0; G.res.parts += 1; }
  }
  for (const k of ['o2', 'food', 'water', 'hull']) G.res[k] = clamp(G.res[k], 0, 100);
  G.res.med = Math.max(0, G.res.med); G.res.parts = Math.max(0, G.res.parts);

  // cryo bay
  const cr = G.roomById.cryo;
  if (!cr.powered) G.cryoHeat = Math.min(100, G.cryoHeat + dt * 2.2);
  else G.cryoHeat = Math.max(0, G.cryoHeat - dt * 4);
  if (G.cryoHeat > 40 && G.colonists > 0) {
    G._cryoAcc = (G._cryoAcc || 0) + dt * (G.cryoHeat - 40) / 60 * 1.3;
    while (G._cryoAcc >= 1 && G.colonists > 0) {
      G._cryoAcc -= 1; G.colonists--; G.colonistsLost++;
      if (G.colonistsLost % 10 === 0) logEvent('crit', `Cryo pod failure. ${G.colonistsLost} colonists lost in their sleep.`, 'cryo');
    }
  }
  if (G.cryoHeat > 30 && !G._cryoWarn) { G._cryoWarn = true; logEvent('crit', 'CRYO BAY: pod temperatures rising. Colonists will begin to die.', 'cryo'); }
  if (G.cryoHeat < 10) G._cryoWarn = false;
}

// alert level & room observation
function updateObservation(dt) {
  const camNet = G.groups.SEC.powered && !G.blackout;
  const sensors = G.groups.SENS.powered && !G.blackout;
  G.sensors = sensors; G.camNet = camNet;
  const secManned = G.crew.some((c) => c.alive && c.room === 'security' && c.atWork && (c.duty === 'security' || c.task?.type === 'security'));
  G.secManned = secManned;
  const lost = [];
  for (const r of G.rooms) {
    if (!r.cameraOK && secManned && camNet && r.powered && r.integ > 30) {
      r.cameraT += dt;
      if (r.cameraT > 25 && !r.cameraJammed) { r.cameraOK = true; r.cameraT = 0; logEvent('info', `Security rebooted camera feed: ${r.short}.`, r.id); }
    } else if (r.cameraOK) r.cameraT = 0;
    const was = r.observed;
    r.observed = camNet && r.powered && r.cameraOK && r.interference < 0.85;
    if (was && !r.observed && G.started) { r.lostAt = G.t; lost.push(r); }
    // life signs & motion (sensors). creature counts as a life sign.
    let ls = 0, mo = 0;
    for (const c of G.crew) if (c.alive && !c.eva && c.room === r.id) { ls++; if (c.moving) mo++; }
    for (const m of G.creatures) if (m.alive && m.room === r.id && m.state !== 'vent') { ls++; if (m.moving) mo += 2; }
    r.lifeSigns = ls; r.motion = approach(r.motion, mo > 0 ? 1 : 0, dt * (mo > 0 ? 3 : 0.4));
    r.ductMotion = Math.max(0, r.ductMotion - dt * 0.5);
  }
  if (lost.length) {
    AUDIO.staticBurst(0.5);
    if (!camNet && G._camNet) logEvent('crit', `SECURITY BUS DOWN — ALL CAMERA FEEDS LOST. You are blind outside rooms with crew in them.`, null, { story: true });
    else if (lost.length === 1) { const r = lost[0]; logEvent('warn', `CAMERA FEED LOST — ${DECK_NAME[r.deck]} / ${r.short}.`, r.id, { story: !r.cameraJammed ? false : true }); }
    else logEvent('warn', `CAMERA FEEDS LOST — ${lost.map((r) => r.short).join(', ')}.`, lost[0].id);
  }
  if (camNet && G._camNet === false && G.started) logEvent('info', 'Camera network back online.');
  G._camNet = camNet;
  let lvl = 0;
  for (const r of G.rooms) {
    if (r.integ < 50 || r.elecFault || r.contamKnown || effO2(r) < 17) lvl = Math.max(lvl, 1);
    if (r.fire > 0.05 || r.breach > 0 || r.p < 60 || r.venting) lvl = 2;
  }
  if (G.res.o2 < 25 || G.battery < 10 && G.supply < G.demand) lvl = Math.max(lvl, 1);
  if (G.creatures.some((m) => m.alive && m.revealed && G.t - m.lastSeen < 30)) lvl = 2;
  if (G.reactor.needsRestart) lvl = 2;
  if (G.t - (G.lastDeathT || -999) < 20) lvl = 2;
  G.alertLevel = lvl;
}
