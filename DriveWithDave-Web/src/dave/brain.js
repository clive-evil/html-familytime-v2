// DAVE. A simulated driver who operates the real car through the same Driver
// intents a human player uses (analogue clutch/throttle/brake, steering wheel,
// gear selection, handbrake, ignition). Nothing moves the car except the
// drivetrain simulation.
//
// Layers:  perception (road, hazards, what he has noticed)
//          → intention (player commands, interpreted, remembered, maybe refused)
//          → personality (traits + stress → speeds, margins, gains, delays)
//          → decisions (where to go, whether to stop / wait / turn)
//          → low-level control (pedals, wheel, gears — adapted from the route bot)
//
// Mistakes come from mechanisms, never from "if (random < x) crash":
//   low skill  → steering lag + under-steer + wobble, rushed clutch, low revs
//   panic      → higher steering gain (over-correction), faster clutch, early gear selection (grinds)
//   reaction   → delay before commands/hazards take effect
//   attention  → how far ahead he notices lights, junctions, oncoming cars
//   confidence → cruising speed, gaps, hesitation, braking late
//   obedience  → literal compliance vs refusing dangerous instructions
//   memory     → how long a "left" stays in his head

import { emptyIntents } from '../sim/driver.js';
import { CAR } from '../sim/params.js';
import { clamp, approach, wrapAngle, projectOnPolyline, pointAt, RPM_PER_RADS } from '../sim/math.js';
import { collide } from '../sim/collision.js';
import { CMD } from './commands.js';
import { PROFILES, DEFAULT_TUNING } from './profiles.js';
import { line } from './lines.js';
import { buildNav } from './nav.js';

const TURN_CMDS = new Set([CMD.LEFT, CMD.RIGHT, CMD.STRAIGHT]);

function hashStr(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

export class Dave {
  constructor(game, opts = {}) {
    this.game = game;
    this.tuning = { ...DEFAULT_TUNING, ...(opts.tuning || {}) };
    this.setProfile(opts.profile || 'learner', opts.traits);
    this.nav = buildNav(game.world);
    this.onSay = null;
    this.reset();
  }

  setProfile(key, traits) {
    this.profileKey = key;
    this.personality = key;
    this.traits = { ...PROFILES[key].traits, ...(traits || {}) };
  }
  setTraits(traits) { this.traits = { ...this.traits, ...traits }; }
  tr(k) { return clamp(this.traits[k] / 100, 0, 1); }

  reset(opts = {}) {
    const seed = hashStr(this.profileKey + ':' + (opts.seed ?? 0));
    this.seed = seed;
    this.phases = [0, 1, 2, 3, 4, 5].map((i) => ((seed >>> (i * 5)) % 628) / 100);
    this.t = 0;
    this.mode = 'start';
    this.hold = true; this.holdReason = 'start';
    this.path = this.nav.yard;
    this.intent = null;          // { dir, t, source }
    this.speedFactor = 1;
    this.carefulT = 0; this.goForItT = 0;
    this.stress = 0; this.urgency = 0;
    this.queue = []; this.history = []; this.lastCmdT = -10;
    this.seen = {}; this.flags = {};
    this.ctl = { clutch: 1, state: 'stopped', selT: 0, recT: 0, grindT: 0 };
    this.hand = 0;
    this.lateral = 0; this.lateralTarget = 0; this.nudgeT = 0;
    this.say_t = -10; this.lastLine = null; this.speech = [];
    this.lastCommit = null;
    this.atJunctionT = 0; this.askT = -10;
    this.redOverride = false; this.giveWayDecision = null;
    this.standoffT = 0;
    this.revDist = 0;
    this.park = null; this.turn = null; this.shutdown = null;
    this.recentIncidents = [];
    this.meltdown = null;
    this.parkAttempt = 0;
    this.heard = null;
    this.debug = {};
    this.tel = {
      commands: 0, byCmd: {}, repeated: 0, shouty: 0, voice: 0, button: 0, key: 0, refused: 0, misheard: 0,
      urgencySum: 0, stressSum: 0, stressN: 0, maxStress: 0, reactionTimes: [], wrongTurns: 0, junctionsOk: 0,
      nearMisses: 0, parkingAttempts: 0, parkingQuality: null, firstCmdT: null,
    };
  }

  // ------------------------------------------------------------------ speech
  say(key, { force = false, text = null, pri = 1 } = {}) {
    const txt = text || line(key, this.personality);
    if (!txt) return null;
    if (!force && this.t - this.say_t < 1.8 && pri <= (this.lastPri || 0)) return null;
    this.say_t = this.t; this.lastPri = pri;
    const s = { text: txt, key, t: this.t };
    this.speech.push(s);
    this.lastLine = s;
    if (this.onSay) this.onSay(s);
    return s;
  }

  // ------------------------------------------------------------------ derived personality numbers
  get panicEff() {
    // TRAIT → panic: how much stress and shouting degrade control
    return clamp(this.tr('panic') * (this.stress * 0.95 + this.urgency * 0.7), 0, 1.2);
  }
  reactionDelay(u = 0) {
    // TRAIT → reaction (+ stress slows you down, urgency speeds you up)
    return (0.22 + (1 - this.tr('reaction')) * 1.0 + this.stress * 0.45) * (1 - u * 0.35);
  }
  get noticeDist() { return 10 + this.tr('attention') * 45 - this.stress * 6; } // TRAIT → attention
  get memoryTime() { return 6 + this.tr('memory') * 24; }                     // TRAIT → memory
  get cruise() {
    // TRAIT → confidence
    let v = (5.2 + this.tr('confidence') * 6.8) * this.tuning.aggression * this.speedFactor;
    if (this.carefulT > 0) v *= 0.7;
    if (this.goForItT > 0) v *= 1.3;
    return clamp(v, 1.5, 16);
  }
  noise(i, f) { return Math.sin(this.t * f + this.phases[i]) * 0.6 + Math.sin(this.t * f * 2.37 + this.phases[i + 1]) * 0.4; }

  // ------------------------------------------------------------------ commands
  // Called the moment the passenger speaks / presses. Returns what Dave heard.
  command(cmd, meta = {}) {
    const t = this.t;
    if (meta.lowConfidence) {
      this.tel.misheard++;
      this.heard = { cmd: null, t, transcript: meta.transcript, source: meta.source };
      this.say('what', { force: true, pri: 2 });
      return this.heard;
    }
    this.history = this.history.filter((h) => t - h.t < 4);
    const same = this.history.filter((h) => h.cmd === cmd && t - h.t < 2.5).length + 1;
    const gap = t - this.lastCmdT;
    this.history.push({ cmd, t });
    this.lastCmdT = t;
    let u = (same - 1) * 0.38 + (gap < 0.7 ? 0.12 : 0) + (cmd === CMD.BRAKE ? 0.25 : 0);
    u = clamp(u * this.tuning.urgencyMultiplier, 0, 1);
    this.urgency = Math.max(this.urgency, u);
    this.addStress(u * 0.16 + (same >= 3 ? 0.08 : 0));
    const T = this.tel;
    T.commands++; T.byCmd[cmd] = (T.byCmd[cmd] || 0) + 1; T.urgencySum += u;
    if (same > 1) T.repeated++;
    if (u >= 0.5) T.shouty++;
    T[meta.source || 'button'] = (T[meta.source || 'button'] || 0) + 1;
    if (T.firstCmdT === null) T.firstCmdT = t;
    const delay = this.reactionDelay(u);
    this.queue.push({ cmd, t, due: t + delay, u, same, source: meta.source || 'button' });
    this.heard = { cmd, t, transcript: meta.transcript, source: meta.source, urgency: u, same };
    return this.heard;
  }

  addStress(x) { this.stress = clamp(this.stress + x * this.tuning.stressBuild, 0, 1); }

  danger() {
    const g = this.game, car = g.car, w = g.world;
    const fz = this.frontZ();
    let d = 0, kind = null;
    if (this.onBase('millEast') && g.traffic.lights === 'red' && fz < w.lights.stopZ + 0.5 && w.lights.stopZ - fz < 30) { d = 1; kind = 'red'; }
    if (this.onBase('millEast') && fz > 115 && fz < w.giveWay.stopZ + 1 && g.traffic.oncoming && !g.traffic.oncomingPassed(w.giveWay.stopZ - 6)) { d = Math.max(d, 0.7); kind = kind || 'oncoming'; }
    if (this.free < 6 && car.speed < 4) { d = Math.max(d, 0.9); kind = kind || 'obstacle'; }
    return { d, kind };
  }

  // does Dave do what he's told when he thinks it's dangerous?
  complies(danger, u) {
    // TRAIT → obedience (vs judgement, which is attention)
    return this.tr('obedience') + u * 0.4 - danger * this.tr('attention') * 0.9 > 0.5;
  }

  apply(q) {
    const { cmd, u } = q;
    this.tel.reactionTimes.push(this.t - q.t);
    const ackKey = u > 0.65 ? 'ackShout' : u > 0.3 ? 'ackUrgent' : null;
    const ack = (key) => this.say(ackKey || key, { pri: ackKey ? 2 : 0 });
    const inMode = (m) => this.mode === m;
    switch (cmd) {
      case CMD.LEFT: case CMD.RIGHT: case CMD.STRAIGHT: {
        // a turn command arriving just after he committed the other way
        if (this.lastCommit && this.t - this.lastCommit.t < 4 && this.lastCommit.dir !== cmd && cmd !== CMD.STRAIGHT) {
          this.say('wrongTurnLate', { force: true, pri: 2 });
          this.blameNote = 'late';
          return;
        }
        const valid = this.turnAhead(cmd);
        if (cmd === CMD.STRAIGHT) {
          if (valid === 'noStraight') { this.say('noStraight', { pri: 1 }); return; }
          this.intent = { dir: cmd, t: this.t, source: 'player', u };
          ack('ack');
          return;
        }
        if (!valid) {
          // nothing that way. Obedient-but-not-observant Dave tries anyway.
          if (this.tr('obedience') > 0.7 && this.tr('attention') < 0.6 && !inMode('park')) {
            this.nudgeT = 2.2; this.lateralTarget = (cmd === CMD.LEFT ? 1 : -1) * (1.3 + u * 0.8);
            ack(cmd === CMD.LEFT ? 'ackLeft' : 'ackRight');
          } else this.say(cmd === CMD.LEFT ? 'leftWhere' : 'rightWhere', { pri: 1 });
          return;
        }
        this.intent = { dir: cmd, t: this.t, source: 'player', u, far: valid === 'far' };
        ack(cmd === CMD.LEFT ? 'ackLeft' : 'ackRight');
        return;
      }
      case CMD.STOP:
      case CMD.WAIT:
        if (inMode('turnAround') || inMode('park')) { this.hold = true; this.holdReason = cmd === CMD.STOP ? 'stop' : 'wait'; ack('stopping'); return; }
        if (inMode('reverse')) this.mode = 'drive';
        this.hold = true; this.holdReason = cmd === CMD.STOP ? 'stop' : 'wait';
        this.brakeHard = u > 0.5 ? 0.4 + u * 0.3 : 0;
        ack(cmd === CMD.STOP ? 'stopping' : 'ack');
        return;
      case CMD.BRAKE:
        this.hold = true; this.holdReason = 'brake';
        // TRAIT → panic: emergency braking gets harsher the more wound up he is
        this.brakeHard = clamp(0.6 + this.panicEff * 0.4 + u * 0.15, 0, 1);
        if (inMode('reverse')) this.mode = 'drive';
        this.say(ackKey || 'stopping', { force: true, pri: 2 });
        return;
      case CMD.GO: case CMD.FASTER: case CMD.GO_FOR_IT: {
        if (this.meltdown) { this.addStress(0.03); this.say('x', { pri: 1, text: 'I said give me a minute.' }); return; }
        const dg = this.danger();
        if (cmd === CMD.FASTER && !this.hold) {
          if (dg.d > 0 && !this.complies(dg.d * 0.8, u)) { this.tel.refused++; this.say(dg.kind === 'red' ? 'refuseRed' : 'refuse', { pri: 1 }); return; }
          // TRAIT → obedience: how much of the "faster" he actually does
          this.speedFactor = clamp(this.speedFactor * (1.12 + 0.25 * this.tr('obedience') + u * 0.15), 0.3, 1.9);
          ack('ack');
          return;
        }
        if (cmd === CMD.GO_FOR_IT) { this.goForItT = 12; this.say('goForIt', { pri: 1 }); }
        if (this.mode === 'arrived') return;
        if (this.mode === 'park' && this.park && this.park.phase === 'done') { this.hold = false; this.leaveSpace(); ack('ack'); return; }
        if (dg.d > 0) {
          if (!this.complies(dg.d, u)) { this.tel.refused++; this.say(dg.kind === 'red' ? 'refuseRed' : 'refuse', { pri: 1, force: true }); return; }
          if (dg.kind === 'red') this.redOverride = true;
          if (dg.kind === 'oncoming') this.giveWayDecision = 'go';
          this.complyNote = { t: this.t, kind: dg.kind };
          this.say('complyReluctant', { force: true, pri: 2 });
        } else if (cmd === CMD.GO) ack('ack');
        this.hold = false; this.holdReason = null; this.brakeHard = 0;
        this.goNow = this.t;
        if (this.meltdownWait) this.meltdownWait = false;
        if (this.flags.atJunction && !this.intent) this.say('whichWay', { force: true, pri: 1 });
        if (this.mode === 'deadEnd') { this.say('deadEnd', { force: true }); this.hold = true; }
        return;
      }
      case CMD.SLOWER:
        this.speedFactor = clamp(this.speedFactor * (0.78 - 0.18 * this.tr('obedience') - u * 0.1), 0.25, 1.9);
        ack('ack');
        return;
      case CMD.CAREFUL:
        this.carefulT = 20; this.goForItT = 0;
        this.stress = Math.max(0, this.stress - 0.08); // being asked nicely helps a bit
        this.say('careful', { pri: 1 });
        return;
      case CMD.REVERSE:
        if (inMode('park') || inMode('turnAround') || inMode('arrived') || inMode('start')) return;
        this.mode = 'reverse'; this.revDist = 0; this.hold = false;
        this.say('reverse', { pri: 1 });
        return;
      case CMD.PULL_OVER:
        if (!inMode('drive')) return;
        this.lateralTarget = 1.1; this.nudgeT = 0; this.pullOver = true;
        this.say('pullOver', { pri: 1 });
        return;
      case CMD.TURN_AROUND:
        if (inMode('arrived') || inMode('start') || inMode('driveway')) return;
        this.startTurnAround();
        this.say('turningAround', { force: true, pri: 1 });
        return;
      case CMD.PARK: this.parkCommand(); return;
      default: return;
    }
  }

  // ------------------------------------------------------------------ geometry helpers
  onBase(id) { return (this.path.base || this.path.id) === id; }
  frontZ() { const c = this.game.car; return c.z + Math.cos(c.psi) * CAR.halfLen; }
  frontX() { const c = this.game.car; return c.x + Math.sin(c.psi) * CAR.halfLen; }
  progress() { const c = this.game.car; return projectOnPolyline(this.path.pts, this.path.cum, c.x, c.z); }

  // is there a turn that way ahead? 'near' (< 70 m), 'far', 'noStraight', or null
  turnAhead(cmd) {
    const p = this.path;
    const pr = this.progress();
    const left = p.cum[p.cum.length - 1] - pr.s;
    if (p.end.type === 'junction' && this.mode !== 'turn') {
      const opt = this.nav.turns[p.end.id][cmd];
      if (cmd === CMD.STRAIGHT && !opt) return left < 70 ? 'noStraight' : 'far';
      if (opt) return left < 70 ? 'near' : 'far';
    }
    if (p.features && cmd === CMD.LEFT) {
      const car = this.game.car;
      const dw = p.features.find((f) => f.kind === 'driveway');
      if (dw && car.x > dw.x + 4) return car.x - dw.x < 70 ? 'near' : 'far';
    }
    if (cmd === CMD.STRAIGHT) return 'near';
    return null;
  }

  // ------------------------------------------------------------------ main update
  update(dt) {
    const g = this.game, car = g.car;
    this.t += dt;
    this.tick(dt);
    this.I = emptyIntents();
    // stress recovery + urgency decay
    const calm = car.speed < 0.3 && this.t - this.lastCmdT > 3 ? 1.6 : 1;
    const before = this.stress;
    this.stress = clamp(this.stress - 0.022 * this.tuning.stressRecovery * calm * dt, 0, 1);
    if (before > 0.75 && this.stress <= 0.75) this.flags.stressSaid = false;
    this.urgency = Math.max(0, this.urgency - 0.45 * dt);
    this.carefulT = Math.max(0, this.carefulT - dt);
    this.goForItT = Math.max(0, this.goForItT - dt);
    this.speedFactor += (1 - this.speedFactor) * (dt / (4 + this.tr('memory') * 12));
    if (this.intent && this.t - this.intent.t > this.memoryTime && !this.intent.forgotten) {
      this.intent.forgotten = true; this.intent.expiredAt = this.t;
    }
    this.tel.stressSum += this.stress * dt; this.tel.stressN += dt; this.tel.maxStress = Math.max(this.tel.maxStress, this.stress);
    if (this.stress > 0.8 && !this.flags.stressSaid) { this.flags.stressSaid = true; this.say('stressHigh', { pri: 2 }); }
    // meltdown: maxed out, he stops and won't be hurried until he's calmed down a bit
    if (this.stress >= 0.97 && !this.meltdown && this.mode !== 'arrived' && this.mode !== 'start') {
      this.meltdown = { t: 0 }; this.tel.meltdowns = (this.tel.meltdowns || 0) + 1;
      this.hold = true; this.holdReason = 'meltdown';
      this.say('x', { force: true, pri: 3, text: { nervous: 'Stop. I need a minute.', cocky: 'Right. Everyone shut up.', oldhand: 'I\u2019m pulling up until you calm down.' }[this.personality] || 'Give me a minute. Seriously.' });
    }
    if (this.meltdown) {
      this.meltdown.t += dt;
      this.stress = Math.max(0, this.stress - 0.05 * dt);
      if (this.meltdown.t > 7 && this.stress < 0.65) { this.meltdown = null; this.say('stressDown', { force: true, pri: 2 }); }
    }
    // commands whose reaction time has elapsed
    for (const q of this.queue.filter((q) => q.due <= this.t)) this.apply(q);
    this.queue = this.queue.filter((q) => q.due > this.t);

    this.free = this.freeDistance();
    if (!car.running && this.mode !== 'start' && this.mode !== 'arrived' && !(this.shutdown && this.shutdown.off)) {
      this.recoverStall(dt);
    } else {
      this.ctl.recT = 0; this.flags.stallRolled = false;
      switch (this.mode) {
        case 'start': this.doStart(dt); break;
        case 'drive': case 'deadEnd': this.doDrive(dt); break;
        case 'reverse': this.doReverse(dt); break;
        case 'turnAround': this.doTurnAround(dt); break;
        case 'park': this.doPark(dt); break;
        case 'driveway': this.doDriveway(dt); break;
        case 'arrived': this.holdStill(); break;
        default: this.doDrive(dt);
      }
    }
    this.watchRollback();
    this.debug.mode = this.mode; this.debug.hold = this.hold ? this.holdReason : '';
    return this.I;
  }

  // ------------------------------------------------------------------ perception helpers
  perceive(key, visible) {
    if (!visible) { delete this.seen[key]; return false; }
    if (this.seen[key] === undefined) this.seen[key] = this.t + this.reactionDelay(0);
    return this.t >= this.seen[key];
  }

  rearBlocked() {
    const g = this.game, car = g.car;
    const fx = Math.sin(car.psi), fz = Math.cos(car.psi);
    const box = { cx: car.x - fx * (CAR.halfLen + 0.45), cz: car.z - fz * (CAR.halfLen + 0.45), hx: CAR.halfWidth - 0.05, hz: 0.4, rot: car.psi };
    for (const o of g.world.staticsNear(box.cx, box.cz)) if (collide(box, o)) return true;
    for (const o of car.dynamics) if (collide(box, o)) return true;
    return false;
  }

  // something right in front of the bumper, whatever the path says
  frontBlocked() {
    const g = this.game, car = g.car;
    const fx = Math.sin(car.psi), fz = Math.cos(car.psi);
    const box = { cx: car.x + fx * (CAR.halfLen + 0.55), cz: car.z + fz * (CAR.halfLen + 0.55), hx: CAR.halfWidth, hz: 0.5, rot: car.psi };
    for (const o of g.world.staticsNear(box.cx, box.cz)) if (collide(box, o)) return true;
    for (const o of car.dynamics) if (collide(box, o)) return true;
    return false;
  }

  freeDistance() {
    const g = this.game, car = g.car;
    const fwd = car.fwdSpeed >= -0.2;
    const look = clamp(5 + Math.abs(car.fwdSpeed) * 2.6, 5, 32);
    if (!fwd || this.mode === 'reverse' || this.mode === 'park' || this.mode === 'turnAround') return 99;
    const p = this.path;
    const pr = projectOnPolyline(p.pts, p.cum, car.x, car.z);
    for (let d = 1.0; d <= look; d += 0.8) {
      const pt = pointAt(p.pts, p.cum, pr.s + d);
      const box = { cx: pt.x, cz: pt.z, hx: CAR.halfWidth + 0.05, hz: CAR.halfLen, rot: pt.heading };
      for (const o of g.world.staticsNear(pt.x, pt.z)) if (collide(box, o)) return d;
      for (const o of car.dynamics) if (collide(box, o)) return d;
      if (pr.s + d >= p.cum[p.cum.length - 1]) break;
    }
    return 99;
  }

  // ------------------------------------------------------------------ modes
  doStart() {
    const car = this.game.car, I = this.I;
    I.clutch.analog = 1; I.brake.analog = 0.3;
    if (!car.running) {
      if (car.gear !== 0) this.gearSel(0);
      else I.ignition = this.t > 0.6 && !car.running;
      return;
    }
    this.mode = 'drive';
    this.say('hello', { force: true, pri: 3 });
  }

  doDrive(dt) {
    const g = this.game, car = g.car, w = g.world;
    const p = this.path;
    const pr = this.progress();
    const total = p.cum[p.cum.length - 1];
    const remain = total - pr.s;
    const fz = this.frontZ();
    let vt = this.cruise;
    const limits = [];
    // corners ahead: TRAIT → confidence (how hard he takes bends)
    const aLat = (1.6 + this.tr('confidence') * 2.4) * (this.goForItT > 0 ? 1.2 : 1);
    const decel = 1.3 + this.tr('confidence') * 1.6;
    for (let d = 0; d < 5 + car.speed * 2.6; d += 1.5) {
      const a = pointAt(p.pts, p.cum, pr.s + d), b = pointAt(p.pts, p.cum, pr.s + d + 2);
      const k = Math.abs(wrapAngle(b.heading - a.heading)) / 2;
      if (k > 1e-3) limits.push(Math.sqrt(aLat / k + 2 * decel * d * 0.5));
    }
    this.needDecel = 0;
    const stopAt = (dist, margin = 0) => {
      // also remember how hard he'll actually need to brake for it (feeds the pedal)
      const room = Math.max(0.25, dist - margin);
      this.needDecel = Math.max(this.needDecel, (car.speed * car.speed) / (2 * room));
      return Math.sqrt(2 * decel * Math.max(0, dist - margin));
    };

    // ---------- path end: junction / dead end / driveway
    this.flags.atJunction = false;
    if (p.end.type === 'junction') {
      const lineDist = p.end.stopFrontZ - fz - 0.2 - (1 - this.tr('confidence')) * 0.8;
      if (this.perceive('junction:' + p.end.id, lineDist < this.noticeDist + 8)) {
        const rolling = this.intent && !this.intent.forgotten && this.tr('confidence') > 0.85 && this.free > 20;
        limits.push(rolling ? Math.max(2.2, stopAt(lineDist)) : stopAt(lineDist));
        if (lineDist < 1.4 && (car.speed < 0.15 || rolling)) {
          this.flags.atJunction = true;
          this.atJunction(dt, p.end.id, rolling);
        } else this.atJunctionT = 0;
      }
    } else if (p.end.type === 'deadend') {
      if (remain < this.noticeDist) limits.push(stopAt(remain - 3));
      if (remain < 6 && car.speed < 0.2 && this.mode !== 'deadEnd') { this.mode = 'deadEnd'; this.say('deadEnd', { pri: 1 }); }
    }
    // ---------- Nan's drive / parking gap features on Top Road
    if (p.features && this.intent && this.intent.dir === CMD.LEFT && !this.intent.forgotten) {
      const dw = p.features.find((f) => f.kind === 'driveway');
      if (dw && car.x < dw.approach + 2 && car.x > dw.x + 9) {
        this.commitDriveway();
        return;
      }
    }
    // ---------- traffic lights (roadworks)
    if (this.onBase('millEast') && !this.redOverride) {
      const Lz = w.lights.stopZ;
      const red = g.traffic.lights === 'red' && fz < Lz + 0.6;
      const d = Lz - fz - 0.3 - (1 - this.tr('confidence')) * 1.0;
      if (this.perceive('red', red && d < this.noticeDist)) {
        if (!this.flags.saidRed) { this.flags.saidRed = true; this.say('redLight', { pri: 0 }); }
        limits.push(stopAt(d));
      }
      if (this.flags.saidRed && g.traffic.lights === 'green' && !this.flags.saidGreen) { this.flags.saidGreen = true; this.say('green', { pri: 0 }); this.hesitateUntil = this.t + (1 - this.tr('confidence')) * 1.5; }
    }
    if (this.hesitateUntil && this.t < this.hesitateUntil) limits.push(0);
    // ---------- give way to the oncoming car
    if (this.onBase('millEast') && fz > 110 && fz < w.giveWay.stopZ + 0.5) {
      const onc = g.traffic.oncoming;
      const pending = onc && !g.traffic.oncomingPassed(w.giveWay.stopZ - 6);
      const seen = this.perceive('oncoming', pending && onc.z - fz < this.noticeDist + 40);
      if (seen) {
        if (!this.giveWayDecision) {
          // TRAIT → confidence: what gap he'll take
          const tGap = (onc.z - w.giveWay.stopZ) / Math.max(onc.v, 1);
          const need = (40 / Math.max(this.cruise, 3)) * (1.9 - this.tr('confidence') * 1.4) * (this.carefulT > 0 ? 1.5 : 1);
          this.giveWayDecision = tGap > need ? 'go' : 'wait';
          this.say(this.giveWayDecision === 'go' ? 'giveWayGo' : 'giveWayWait', { pri: 1 });
        }
        if (this.giveWayDecision === 'wait') limits.push(stopAt(w.giveWay.stopZ - fz - 0.4 - (1 - this.tr('confidence'))));
      }
      if (!pending && this.giveWayDecision === 'wait' && !this.flags.gwGo) { this.flags.gwGo = true; this.say('giveWayGo', { pri: 0 }); }
    }
    // ---------- self-preservation: don't drive into things
    const so = this.tuning.safetyOverride;
    if (so > 0) {
      const margin = (0.8 + (1 - this.tr('confidence')) * 2.6) * (this.carefulT > 0 ? 1.4 : 1) * (this.goForItT > 0 ? 0.6 : 1);
      if (this.perceive('obstacle', this.free < 99)) limits.push(stopAt(this.free, margin) / Math.max(so, 0.05));
    }
    // nose against something: stop pushing, then back off a bit and try again
    if (this.frontBlocked() && car.fwdSpeed >= -0.1) {
      limits.push(0);
      this.wedgedT = (this.wedgedT || 0) + dt;
      if (this.wedgedT > 2.5 && !this.hold) {
        this.wedgedT = 0; this.mode = 'reverse'; this.revDist = 0; this.autoReverse = 'unstick';
        this.unstickSteer = -this.hand;
        this.say('x', { text: 'Hang on. Back a bit.', pri: 1 });
      }
    } else this.wedgedT = 0;
    // standoff with the oncoming car: someone has to back up
    const blocked = this.free < 5 && car.speed < 0.2 && car.dynamics.length && !this.hold;
    this.standoffT = blocked ? this.standoffT + dt : 0;
    if (this.standoffT > 6 && !this.flags.standoffSaid) { this.flags.standoffSaid = true; this.say('standoff', { pri: 1 }); }
    if (this.standoffT > 11) { this.standoffT = 0; this.flags.standoffSaid = false; this.say('backingUp', { force: true }); this.mode = 'reverse'; this.revDist = 0; this.autoReverse = true; }
    // ---------- player holds / pull over
    if (this.hold || this.mode === 'deadEnd') vt = 0;
    if (this.pullOver) { limits.push(stopAt(Math.max(0, 10 - (this.pullOverDist || 0)))); this.pullOverDist = (this.pullOverDist || 0) + car.speed * dt; if (car.speed < 0.1 && this.pullOverDist > 6) { this.pullOver = false; this.pullOverDist = 0; this.hold = true; this.holdReason = 'pulled'; } }
    for (const l of limits) vt = Math.min(vt, l);
    if (this.needDecel > 0 && vt < 0.9) vt = 0;
    // lateral offset (nudges, pulling over), returns to lane
    if (this.nudgeT > 0) { this.nudgeT -= dt; if (this.nudgeT <= 0) this.lateralTarget = 0; }
    if (!this.pullOver && this.nudgeT <= 0 && !(this.holdReason === 'pulled')) this.lateralTarget = 0;
    this.lateral = approach(this.lateral, this.lateralTarget, dt * 0.9);
    this.debug.vt = vt; this.debug.free = this.free;
    this.steerPath(dt, false);
    this.driveSpeed(dt, vt, { harsh: this.holdReason === 'brake' || this.brakeHard });
    if (car.speed < 0.1) this.brakeHard = 0;
  }

  atJunction(dt, id, rolling) {
    this.atJunctionT += dt;
    const intent = this.intent && !this.intent.forgotten ? this.intent : null;
    if (this.intent && this.intent.forgotten && !this.flags['forgot' + id]) {
      this.flags['forgot' + id] = true; this.say('forgot', { force: true, pri: 1 });
    }
    // TRAIT → confidence: hesitation at the line
    const hes = rolling ? 0 : (0.4 + (1 - this.tr('confidence')) * 2.6 + (this.carefulT > 0 ? 1 : 0)) * (this.goNow && this.t - this.goNow < 3 ? 0.3 : 1);
    if (this.hold) return;
    if (intent && intent.dir !== CMD.STRAIGHT) {
      if (this.atJunctionT > hes) this.commitTurn(id, intent.dir, intent.source);
      else if (this.atJunctionT > 0.8 && this.tr('confidence') < 0.3 && !this.flags['hes' + id]) { this.flags['hes' + id] = true; this.say('hesitate', { pri: 0 }); }
      return;
    }
    if (intent && intent.dir === CMD.STRAIGHT && !this.flags['ns' + id]) { this.flags['ns' + id] = true; this.say('noStraight', { force: true }); this.intent = null; }
    // no idea where to go: ask, or (cocky, disobedient) just pick one
    if (this.t - this.askT > 7 && this.atJunctionT > 0.5) { this.askT = this.t; this.say('whichWay', { force: true, pri: 2 }); }
    if (this.tr('obedience') < 0.45 && this.tr('confidence') > 0.75 && this.atJunctionT > 3.2) {
      this.say('assume', { force: true, pri: 2 });
      this.commitTurn(id, CMD.RIGHT, 'assumed');
    }
  }

  commitTurn(id, dir, source) {
    const opt = this.nav.turns[id][dir];
    if (!opt) return;
    this.path = this.nav.join(opt.arc, opt.to);
    this.lastCommit = { t: this.t, dir, id, source, intentT: this.intent?.t };
    this.flags.atJunction = false;
    this.atJunctionT = 0;
    this.intent = null;
    const correct = this.nav.correct[id];
    if (dir === correct) this.tel.junctionsOk++;
    else {
      this.tel.wrongTurns++;
      // blame from what actually happened
      setTimeoutish(this, 2.2, () => {
        if (source === 'assumed') this.say('wrongTurnNoCmd', { force: true, pri: 2 });
        else this.say('x', { force: true, pri: 2, text: `You said ${dir.toLowerCase()}!` });
      });
    }
  }

  commitDriveway() {
    this.path = this.nav.drivewayPath(this.game.car.x - 1);
    this.mode = 'driveway';
    this.intent = null;
    this.lastCommit = { t: this.t, dir: CMD.LEFT, id: 'drive' };
  }

  parkCommand() {
    const car = this.game.car, w = this.game.world;
    if (this.mode === 'driveway' || this.mode === 'arrived') { this.shutdownSoon = true; return; }
    const P = w.parkSpace;
    // already at it, or already done it properly: repeating PARK just gets a look
    if (this.mode === 'park' && this.park && this.park.phase !== 'done') { this.say('ackUrgent', { pri: 0 }); return; }
    if (this.mode === 'park' && this.park && this.park.phase === 'done' && this.game.route.parkedInSpace(car)) { this.say('x', { text: 'We\u2019re parked.', pri: 1 }); return; }
    const onTop = (this.onBase('topWest') || this.mode === 'park') && car.z > 246;
    if (onTop && car.x > P.x0 - 3 && car.x < P.x1 + 16) {
      this.parkAttempt++;
      this.tel.parkingAttempts++;
      const sgn = (this.seed >>> this.parkAttempt) & 1 ? 1 : -1;
      const sgn2 = (this.seed >>> (this.parkAttempt + 7)) & 1 ? 1 : -1;
      // TRAIT → skill: judgement of where to stop and how far to swing in
      this.park = {
        // already in (or half in) the gap: pull out and have another go
        phase: car.z > 251.5 ? 'exit' : car.x > P.x0 + 0.5 ? 'align' : 'exit',
        stopX: P.x0 - 1.2 + (1 - this.tr('skill')) * 1.1 * sgn,
        // TRAIT → skill (and panic): how well he judges the swing
        targetZ: P.kerbZ - CAR.halfWidth - 0.32 + (1 - this.tr('skill')) * 0.8 * sgn2 + this.panicEff * 0.3 + (this.parkBias ?? 0),
        t: 0,
      };
      this.mode = 'park';
      this.hold = false;
      this.say('parkStart', { force: true, pri: 1 });
      return;
    }
    const dw = w.nanDrive;
    if (onTop && car.x > dw.cx + 9 && car.x < dw.cx + 30) { this.commitDriveway(); this.say('ack'); return; }
    if (this.mode === 'drive') { this.lateralTarget = 1.1; this.pullOver = true; this.say('pullOver'); return; }
    this.say('noPark');
  }

  holdStill() {
    const I = this.I, car = this.game.car;
    I.brake.analog = 0.3; I.clutch.analog = car.running ? 1 : 0;
  }

  // ------------------------------------------------------------------ reverse (BACK UP)
  doReverse(dt) {
    const car = this.game.car;
    this.revDist += Math.max(0, -car.fwdSpeed) * dt;
    const max = this.autoReverse === 'unstick' ? 2.0 : this.autoReverse ? 9 : 7;
    this.setWheel(this.autoReverse === 'unstick' ? this.unstickSteer : 0, dt);
    if (this.revDist > max || this.hold) {
      this.driveSpeed(dt, 0, {});
      if (car.speed < 0.1) { this.mode = this.returnMode || 'drive'; this.returnMode = null; this.autoReverse = false; this.giveWayDecision = this.giveWayDecision === 'go' ? null : this.giveWayDecision; }
      return;
    }
    this.driveSpeed(dt, -(0.9 + this.tr('confidence') * 0.8) * (this.carefulT > 0 ? 0.7 : 1), {});
  }

  // ------------------------------------------------------------------ three-point turn
  startTurnAround() {
    const car = this.game.car;
    // UK: swing across to the right first. Target: the opposite heading.
    this.turn = { phase: 'seek', psi0: car.psi, target: car.psi + Math.PI, t: 0, n: 0, x0: car.x, z0: car.z };
    this.mode = 'turnAround'; this.hold = false; this.intent = null;
  }
  edgeSd(x, z) { return this.game.world.sd(x, z); }
  doTurnAround(dt) {
    const car = this.game.car, T = this.turn, max = this.maxDeg();
    T.t += dt;
    const fx = Math.sin(car.psi), fz = Math.cos(car.psi);
    const err = wrapAngle(T.target - car.psi);              // + = still need to turn left
    const dir = T.phase === 'prep' || (T.phase === 'fwd' && T.n === 0) ? 1 : -Math.sign(err || 1); // wheel sign going forward
    const frontSd = this.edgeSd(car.x + fx * (CAR.halfLen + 0.5), car.z + fz * (CAR.halfLen + 0.5));
    const rearSd = this.edgeSd(car.x - fx * (CAR.halfLen + 0.5), car.z - fz * (CAR.halfLen + 0.5));
    const frontStop = frontSd > -0.7 || this.frontBlocked();
    const rearStop = rearSd > -0.7 || this.rearBlocked();
    if (this.hold) { this.setWheel(this.hand, dt); this.driveSpeed(dt, 0, {}); return; }
    const ready = (deg) => Math.abs(this.game.driver.steerDeg - deg) < 40;
    const finish = () => {
      const m = this.nav.match(car.x, car.z, car.psi);
      if (m) this.path = this.nav.fromHere(m.e, m.pr.s + 1);
      this.mode = 'drive'; this.turn = null; this.hold = false;
    };
    switch (T.phase) {
      case 'seek': {
        // roll on to a stretch without parked cars before trying it (he's not daft)
        const clear = !this.game.world.staticsNear(car.x, car.z).concat(car.dynamics).some((o) => o.tag === 'car' || o.tag === 'aicar' ? Math.hypot((o.cx ?? o.x) - car.x, (o.cz ?? o.z) - car.z) < 7.5 : false);
        const gone = Math.hypot(car.x - T.x0, car.z - T.z0);
        this.steerPath(dt, false);
        this.driveSpeed(dt, clear || gone > 45 || this.free < 8 ? 0 : 3, {});
        if ((clear || gone > 45 || this.free < 8) && car.speed < 0.1) { T.phase = 'prep'; T.t = 0; T.target = car.psi + Math.PI; }
        break;
      }
      case 'prep': // stop, then full lock before moving
        this.setWheel(max * dir, dt); this.driveSpeed(dt, 0, {});
        if (car.speed < 0.08 && ready(max * dir)) { T.phase = 'fwd'; T.t = 0; T.wheel = max * dir; }
        break;
      case 'fwd': case 'fwd2':
        if (T.phase === 'fwd2' && Math.abs(err) < 0.45) { const m = this.nav.match(car.x, car.z, car.psi); if (m) { finish(); return; } }
        if (T.phase === 'fwd2') T.wheel = max * -Math.sign(err || 1);
        this.setWheel(T.wheel, dt); this.driveSpeed(dt, ready(T.wheel) ? 1.1 : 0, {});
        if ((frontStop && T.t > 0.6) || T.t > 9) { T.phase = 'stopF'; T.t = 0; }
        break;
      case 'stopF':
        this.setWheel(T.wheel, dt); this.driveSpeed(dt, 0, {});
        if (car.speed < 0.08) { T.phase = 'rev'; T.t = 0; T.n++; T.wheel = max * Math.sign(err || 1); if (T.n > 10) finish(); }
        break;
      case 'rev':
        this.setWheel(T.wheel, dt); this.driveSpeed(dt, ready(T.wheel) ? -1.0 : 0, {});
        if ((rearStop && T.t > 0.6) || Math.abs(err) < 0.5 || T.t > 9) { T.phase = 'stopR'; T.t = 0; }
        break;
      case 'stopR':
        this.setWheel(T.wheel, dt); this.driveSpeed(dt, 0, {});
        if (car.speed < 0.08) { T.phase = 'fwd2'; T.t = 0; T.wheel = max * -Math.sign(err || 1); }
        break;
      default: finish();
    }
    void dir;
  }

  // ------------------------------------------------------------------ parallel park (adapted from the route bot)
  doPark(dt) {
    const g = this.game, car = g.car, P = g.world.parkSpace, K = this.park, max = this.maxDeg();
    K.t += dt;
    const yaw = Math.atan2(Math.sin(car.psi + Math.PI / 2), Math.cos(car.psi + Math.PI / 2)); // 0 when heading -x
    const ready = (deg) => Math.abs(g.driver.steerDeg - deg) < 30;
    if (this.hold) { this.driveSpeed(dt, 0, {}); this.setWheel(this.hand, dt); if (car.speed < 0.1 && K.phase !== 'done') { /* waits */ } return; }
    const revV = -(0.7 + this.tr('confidence') * 0.4) * (1 + this.panicEff * 0.4);
    switch (K.phase) {
      case 'exit': // pull back out onto the lane, past the car in front, then line up again
        if (car.z > 251.4 && Math.abs(yaw) < 0.5) this.setWheel(max, dt);
        else this.steerPath(dt, false);
        this.driveSpeed(dt, this.frontBlocked() ? 0 : 1.3, {});
        if (this.frontBlocked() && car.speed < 0.1) { K.phase = 'leaveBack'; K.x0 = car.x; K.t = 0; K.retry = true; }
        if (car.z < 251.2 && Math.abs(yaw) < 0.2 && car.x < P.x0 - 2) { K.phase = 'backup'; }
        break;
      case 'backup':
        this.setWheel(0, dt);
        this.driveSpeed(dt, car.x < K.stopX ? -1.2 : 0, {});
        if (car.x >= K.stopX && car.speed < 0.1) K.phase = 'lock';
        break;
      case 'align': {
        // pull in alongside the car in front, about a door's width off it
        this.lateral = approach(this.lateral, 0.42, dt * 0.8);
        this.steerPath(dt, false);
        const d = car.x - K.stopX;
        this.driveSpeed(dt, d > 0 ? Math.min(2.5, Math.sqrt(2 * 1.0 * d)) : 0, {});
        if (Math.abs(d) < 0.7 && car.speed < 0.08) K.phase = 'lock';
        if (d < -0.7 && car.speed < 0.1) K.phase = 'backup';
        break;
      }
      case 'lock':
        this.lateral = 0;
        this.setWheel(-max, dt); this.driveSpeed(dt, 0, {});
        if (ready(-max)) K.phase = 'in';
        break;
      case 'in': {
        this.setWheel(-max, dt); this.driveSpeed(dt, revV, {});
        // judge when to swing back: where will the rear end up if I straighten now?
        const rearZ = car.z - Math.cos(car.psi) * CAR.b;
        const predicted = rearZ + 3.9 * (1 - Math.cos(yaw));
        if (predicted >= K.targetZ || Math.abs(yaw) > 0.95) K.phase = 'counter';
        if (car.contact || this.rearBlocked()) K.phase = 'counter';
        break;
      }
      case 'counter':
        this.setWheel(max, dt); this.driveSpeed(dt, ready(max) ? revV * 0.9 : 0, {});
        if (Math.abs(yaw) < 0.05) K.phase = 'settle';
        else if (this.rearBlocked() || car.contact) { K.phase = 'straighten'; K.t = 0; }
        break;
      case 'straighten':
        // out of room behind but still at an angle: forward on the other lock
        this.setWheel(max * Math.sign(yaw || -1), dt);
        this.driveSpeed(dt, ready(max * Math.sign(yaw || -1)) ? 0.6 : 0, {});
        if (Math.abs(yaw) < 0.05 || this.frontBlocked() || K.t > 12) K.phase = 'settle';
        break;
      case 'settle': {
        this.setWheel(0, dt);
        const mid = (P.x0 + P.x1) / 2, d = car.x - mid;
        if (!ready(0)) { this.driveSpeed(dt, 0, {}); break; }
        if (Math.abs(d) < 0.4 || K.t > 40) {
          this.driveSpeed(dt, 0, { hillHold: true });
          if (car.speed < 0.05) {
            K.phase = 'done';
            const ok = g.route.parkedInSpace(car);
            const fault = g.route.parkingFault(car);
            this.tel.parkingQuality = ok ? 'in the space' : (fault || 'not in the space').toLowerCase().replace(/\.$/, '');
            this.say(ok ? 'parkDone' : 'parkBad', { force: true, pri: 2 });
            this.hold = true; this.holdReason = 'parked';
          }
        } else this.driveSpeed(dt, d > 0 ? Math.min(0.8, d) : -Math.min(0.8, -d), {});
        break;
      }
      case 'done': this.driveSpeed(dt, 0, { hillHold: true }); break;
      // pulling back out: a little back, full right lock, out into the lane
      case 'leaveBack':
        this.setWheel(0, dt);
        this.driveSpeed(dt, car.x < K.x0 + 0.7 && !this.rearBlocked() ? -0.6 : 0, {});
        if ((car.x >= K.x0 + 0.7 || this.rearBlocked()) && car.speed < 0.08 && K.t > 0.5) { K.phase = 'leaveLock'; K.t = 0; }
        break;
      case 'leaveLock':
        this.setWheel(max, dt); this.driveSpeed(dt, 0, {});
        if (ready(max)) K.phase = 'leaveOut';
        break;
      case 'leaveOut':
        this.setWheel(max, dt); this.driveSpeed(dt, 1.0, {});
        if (yaw < -0.38 || car.z < 251.4) K.phase = 'leaveJoin';
        break;
      case 'leaveJoin': {
        if (K.retry) { K.phase = 'exit'; K.retry = false; break; }
        const m = this.nav.match(car.x - 3, 250.5, -Math.PI / 2);
        if (m) this.path = this.nav.fromHere(m.e, m.pr.s + 3);
        this.mode = 'drive'; this.park = null;
        break;
      }
      default: break;
    }
  }

  // after parking, GO pulls back out onto Top Road
  leaveSpace() { this.park.phase = 'leaveBack'; this.park.t = 0; this.park.x0 = this.game.car.x; this.hold = false; }

  // ------------------------------------------------------------------ Nan's drive
  doDriveway(dt) {
    const car = this.game.car;
    const p = this.path;
    const pr = this.progress();
    const left = p.cum[p.cum.length - 1] - pr.s;
    this.steerPath(dt, false, 1.8);
    if (!this.shutdown) {
      if (this.frontBlocked() && car.speed < 0.2) {
        this.wedgedT = (this.wedgedT || 0) + dt;
        if (this.wedgedT > 2.0) {
          this.wedgedT = 0; this.returnMode = 'driveway'; this.mode = 'reverse'; this.revDist = 0;
          this.autoReverse = 'unstick'; this.unstickSteer = -this.hand;
          this.say('x', { text: 'Hang on. Bit more room.', pri: 1 });
          return;
        }
        this.driveSpeed(dt, 0, {});
        return;
      }
      this.wedgedT = 0;
      let vt = Math.min(1.7 * (0.7 + this.tr('confidence') * 0.6), Math.sqrt(2 * 0.9 * Math.max(0, left - 1.8)));
      if (this.hold) vt = 0;
      if (this.free < 99) vt = Math.min(vt, Math.sqrt(2 * 1.5 * Math.max(0, this.free - 0.5)));
      this.driveSpeed(dt, vt, { hillHold: true });
      if ((left < 2.3 || this.free < 0.8) && car.speed < 0.06) {
        this.shutdown = { t: 0, step: 0 };
        this.say('arrive', { force: true, pri: 2 });
      }
      return;
    }
    // handbrake on, engine off — he does this himself
    const S = this.shutdown; S.t += dt;
    this.I.brake.analog = 0.4; this.I.clutch.analog = car.running ? 1 : 0;
    if (S.step === 0 && S.t > 1.2) { if (this.game.driver.handbrakeTarget < 0.5) this.I.handbrake.pressed = true; S.step = 1; }
    else if (S.step === 1 && S.t > 1.9) { if (car.running) this.I.ignition = true; S.step = 2; S.off = true; }
    else if (S.step === 2 && S.t > 2.6) { S.step = 3; this.mode = 'arrived'; this.say('shutdown', { force: true, pri: 3 }); }
  }

  // ------------------------------------------------------------------ stall recovery
  recoverStall(dt) {
    const car = this.game.car, I = this.I, C = this.ctl;
    if (C.recT === 0) { this.stallT = this.t; }
    C.recT += dt;
    // TRAIT → skill/attention: does he keep the car held while he sorts himself out?
    const holdsBrake = this.tr('skill') * 0.5 + this.tr('attention') * 0.5 - this.panicEff * 0.3 > 0.5;
    const delay = 0.7 + (1 - this.tr('skill')) * 1.3 + this.stress * 1.4;
    const rollingBack = car.fwdSpeed < -0.3 && this.mode !== 'reverse';
    const noticedRoll = this.perceive('stallroll', rollingBack);
    I.brake.analog = holdsBrake || noticedRoll ? clamp(0.45 + this.panicEff * 0.4, 0, 1) : 0;
    if (C.recT < delay) { I.clutch.analog = C.clutch; return; }
    C.clutch = 1; I.clutch.analog = 1;
    if (this.game.driver.clutchOut > 0.95) {
      if (car.gear !== 0) this.gearSel(0);
      else if (!car.cranking && C.recT > delay + 0.4) {
        I.ignition = !this.flags.cranked; this.flags.cranked = true;
      } else if (car.cranking) { I.ignition = true; }
    }
    if (C.recT > delay + 3) { this.flags.cranked = false; C.recT = delay; }
    if (C.recT > delay && !this.flags.saidRestart) { this.flags.saidRestart = true; this.say('restart', { pri: 0 }); }
    C.state = 'stopped';
  }

  watchRollback() {
    const car = this.game.car;
    if (car.fwdSpeed < -0.5 && car.gear !== -1 && this.mode !== 'reverse' && this.mode !== 'turnAround' && this.mode !== 'park') {
      if (!this.flags.rollSaid) { this.flags.rollSaid = true; this.say('rollback', { force: true, pri: 2 }); this.addStress(0.1); }
    } else if (car.fwdSpeed > 0.5) this.flags.rollSaid = false;
  }

  // ------------------------------------------------------------------ low-level: steering
  maxDeg() { return this.game.settings.steeringTurns * 180; }
  setWheel(deg, dt) {
    // hands move towards where he wants the wheel, with a skill-dependent lag
    const tau = 0.07 + (1 - this.tr('skill')) * 0.28 + this.stress * 0.08;
    this.hand += (deg - this.hand) * (1 - Math.exp(-dt / tau));
    const max = this.maxDeg();
    this.I.steer.axis = clamp(this.hand / max, -1, 1);
  }
  steerPath(dt, reverse = false, ldBase) {
    const car = this.game.car, p = this.path;
    const skill = this.tr('skill'), pe = this.panicEff;
    const f = [Math.sin(car.psi), Math.cos(car.psi)];
    const rx = car.x - f[0] * CAR.b, rz = car.z - f[1] * CAR.b;
    const pr = projectOnPolyline(p.pts, p.cum, rx, rz);
    // TRAIT → skill: how far ahead he looks; panic shortens it (twitchy)
    const Ld = ((ldBase ?? (2.0 + skill * 0.7)) + Math.abs(car.fwdSpeed) * 0.38) * (1 - pe * 0.35);
    const tp = pointAt(p.pts, p.cum, pr.s + Ld);
    const off = this.lateral;
    const tx = tp.x + tp.tz * off, tz = tp.z - tp.tx * off;
    const ang = Math.atan2(tx - rx, tz - rz);
    const alpha = wrapAngle(ang - car.psi);
    const L = CAR.a + CAR.b;
    let delta = Math.atan2(2 * L * Math.sin(alpha), Ld);
    if (reverse) delta = -delta;
    const max = this.maxDeg();
    let deg = clamp((-delta / (CAR.maxRoadAngle * Math.PI / 180)) * max, -max, max);
    // TRAIT → skill: under-steers a little; panic → over-corrects
    deg *= (0.84 + 0.16 * skill) * (1 + pe * 0.7);
    // wobble: low skill drifts, panic saws at the wheel (smooth, deterministic)
    deg += ((1 - skill) * 30 * this.noise(0, 0.7) + pe * 34 * this.noise(2, 2.3)) * clamp(car.speed / 3, 0.2, 1);
    this.setWheel(clamp(deg, -max, max), dt);
    this.debug.cte = pr.lateral;
    return pr;
  }

  // ------------------------------------------------------------------ low-level: pedals + gears
  gearSel(gr) {
    // he selects when he *believes* the clutch is down. Panic → too early → real grinds.
    const thr = 0.95 - this.panicEff * 0.32 - (1 - this.tr('skill')) * 0.06;
    if (this.game.driver.clutchOut >= thr && this.t > this.ctl.selT) {
      this.I.gearDirect = gr;
      this.ctl.selT = this.t + 0.35;
    }
  }

  driveSpeed(dt, vt, opts = {}) {
    const g = this.game, car = g.car, I = this.I, C = this.ctl, S = g.settings;
    const skill = this.tr('skill'), conf = this.tr('confidence'), pe = this.panicEff;
    const v = car.fwdSpeed, speed = Math.abs(v), rpm = car.rpm;
    const want = vt < 0 ? -1 : 1;
    const target = Math.abs(vt);
    const uphill = g.world.grade(car.z) * Math.cos(car.psi) * want > 0.05;
    I.throttle.analog = 0; I.brake.analog = 0;
    if (target < 0.05) {
      // stopping: brake, clutch in as it slows. TRAIT → skill: low skill dips the clutch late (stalls)
      const harsh = opts.harsh ? (this.brakeHard || 0.7) : 0;
      if (speed > 0.05) I.brake.analog = Math.max(harsh, clamp(0.18 + speed * (0.1 + (1 - conf) * 0.08) + pe * 0.25, 0, 0.95), clamp(((this.needDecel || 0) / 9.6) * 1.2, 0, 1));
      else I.brake.analog = 0.35;
      const clutchIn = 0.6 + skill * 2.2;
      if (speed < clutchIn || harsh > 0.8 && skill > 0.5) C.clutch = approach(C.clutch, 1, dt * 6);
      // hills: handbrake on once stopped
      const useHB = skill > 0.35 || this.tr('attention') > 0.6;
      if (speed < 0.05 && (uphill || opts.hillHold || Math.abs(g.world.grade(car.z)) > 0.05) && useHB && g.driver.handbrakeTarget < 0.5 && !this.flags.hbPulled) { I.handbrake.pressed = true; this.flags.hbPulled = true; }
      I.clutch.analog = C.clutch;
      C.state = 'stopped';
      return;
    }
    this.flags.hbPulled = false;
    // gear choice
    let gr = want < 0 ? -1 : (car.gear >= 1 ? car.gear : 1);
    if (C.shiftTo !== undefined && C.shiftTo !== null) {
      if (car.gear === C.shiftTo) { C.shiftTo = null; C.state = speed > 1 ? 'reengage' : 'launch'; }
      else if ((want < 0) !== (C.shiftTo < 0)) C.shiftTo = null;
      else gr = C.shiftTo;
    }
    if (want > 0 && car.gear >= 1 && C.state === 'drive') {
      const ratioRpm = (n) => (speed / CAR.wheelR) * CAR.ratios[n] * CAR.finalDrive * RPM_PER_RADS;
      const upAt = 2500 + conf * 1000 + this.goForItT * 40;
      if (ratioRpm(car.gear) > upAt && car.gear < 4) gr = car.gear + 1;
      if (car.gear > 1 && ratioRpm(car.gear) < 1250) gr = car.gear - 1;
      if (target < 2 && car.gear > 2) gr = 2;
    }
    if (gr !== car.gear) {
      C.shiftTo = gr;
      C.clutch = approach(C.clutch, 1, dt * (5 + pe * 4)); I.clutch.analog = C.clutch; I.throttle.analog = 0;
      if (speed > target + 1) I.brake.analog = 0.3;
      // changing direction: stop first. Flustered Dave doesn't quite wait (→ a real grind).
      const reversing = (gr === -1 && v > 0.05) || (gr > 0 && v < -0.05);
      if (reversing) {
        I.brake.analog = Math.max(I.brake.analog, 0.45);
        if (Math.abs(v) > 0.15 + pe * 1.0) { C.state = 'shift'; return; }
      }
      this.gearSel(gr);
      C.state = 'shift';
      return;
    }
    const slip = Math.abs(car.clutchSlip);
    const err = target - speed;
    if ((C.state === 'launch' || C.state === 'drive') && speed > 0.3 && speed < 0.6 + skill * 2.2 && target < speed - 0.3) C.state = 'coast';
    // revs dying as he slows: clutch in. TRAIT → skill: low skill leaves it later
    if (C.state === 'drive' && rpm < 1150 - (1 - skill) * 350 && target < speed - 0.25) C.state = 'coast';
    if (C.state === 'coast') {
      // clutch in, rolling down to a crawl / stop
      C.clutch = approach(C.clutch, 1, dt * 6);
      I.throttle.analog = 0;
      I.brake.analog = Math.max(clamp((speed - target) * 0.2, 0, 0.6), clamp(((this.needDecel || 0) / 9.6) * 1.2, 0, 1));
      if (speed < target - 0.4 && (target > 1.2 || speed < 0.2)) { C.state = 'launch'; }
      I.clutch.analog = C.clutch;
      return;
    }
    if (C.state === 'reengage') {
      // after a gear change on the move. TRAIT → skill: smooth vs dumping it
      const rate = 1.8 + skill * 2.2 + pe * 3;
      C.clutch = approach(C.clutch, 0, rate * dt);
      I.throttle.analog = clamp(0.12 + err * 0.15, 0, 0.5) * (C.clutch < 0.6 ? 1 : 0.3);
      if (err < -1) { I.throttle.analog = 0; I.brake.analog = clamp(-err * 0.12, 0, 0.5); }
      if (C.clutch <= 0.01) C.state = 'drive';
      if (rpm < 900 && C.clutch < S.bitePoint) C.state = 'launch';
      I.clutch.analog = C.clutch;
      return;
    }
    // handbrake still on? he only remembers when it's pulling
    if (C.state !== 'drive') {
      // TRAIT → skill: revs he aims for; panic → too many
      // panic goes both ways: the timid under-rev and dump it, the cocky rev it to the moon
      const revTarget = (want < 0 ? 1200 + skill * 300 : uphill ? 1250 + skill * 1300 : 1000 + skill * 900) + this.goForItT * 50 + pe * 1100 * (conf - 0.45) * 2;
      // TRAIT → skill: how well his right foot holds the revs
      I.throttle.analog = clamp(0.25 * (0.55 + skill * 0.45) + (revTarget - rpm) * 0.0012 * (0.45 + skill * 0.75), 0, 1);
      const bite = S.bitePoint;
      const quickTo = bite + 0.12 - (1 - skill) * 0.09 - pe * 0.12;
      // TRAIT → skill / panic / urgency: how fast the clutch comes up through the bite
      const slowRate = 0.096 * (1 + (1 - skill) * 2.2 + pe * 3 + (this.goForItT > 0 ? 0.8 : 0) + this.urgency * 1.5);
      if (C.clutch > quickTo) C.clutch -= 0.72 * dt;
      else if (rpm > revTarget - 300) C.clutch -= slowRate * dt;
      else if (rpm < revTarget - 700) C.clutch += 0.24 * (0.3 + skill * 0.7) * (1 - clamp(pe, 0, 0.8)) * dt;
      C.clutch = clamp(C.clutch, 0, 1);
      // handbrake: skilled Dave waits until the clutch is holding the car
      if (g.driver.handbrakeTarget > 0.5) {
        const holdT = (12 + 40 * skill) * (1 - clamp(pe, 0, 0.9));
        // flustered: drops the handbrake the moment he's told to go
        if (pe > 0.45 || Math.abs(car.clutchTorque) > holdT || (!uphill && C.clutch < bite + 0.1) || C.clutch < bite - 0.08) I.handbrake.pressed = true;
      }
      // crawling slower than the gear will idle at: keep feathering the clutch
      const idleSpeed = (CAR.idleRPM / RPM_PER_RADS) / Math.abs(CAR.ratios[car.gear] * CAR.finalDrive || 14) * CAR.wheelR;
      const crawl = target < idleSpeed * 1.15;
      if (slip < 6 && speed > 0.8 && !crawl) { C.clutch = 0; C.state = 'drive'; }
      if (crawl && speed > target + 0.2) C.clutch = Math.min(1, C.clutch + (0.5 + skill * 0.6) * dt);
      if (speed > target + 0.6) I.throttle.analog = 0;
      if (speed > target + 1.2) I.brake.analog = clamp((speed - target) * 0.12, 0, 0.5);
      C.state = C.state === 'drive' ? 'drive' : 'launch';
    } else {
      C.clutch = 0;
      I.throttle.analog = clamp(0.15 + err * (0.18 + conf * 0.15) * (1 + pe * 0.6), 0, 0.85 + (this.goForItT > 0 ? 0.15 : 0));
      if (err < -0.8) { I.throttle.analog = 0; I.brake.analog = clamp(-err * (0.16 + pe * 0.1), 0, 0.7); }
      // braking for something specific: brake as hard as it needs (≈9.6 m/s² at full pedal)
      if ((this.needDecel || 0) > 1.2 && err < 0) { I.throttle.analog = 0; I.brake.analog = Math.max(I.brake.analog, clamp((this.needDecel / 9.6) * 1.2, 0, 1)); }
      // TRAIT → skill: dip the clutch before the engine labours when slowing right down (low skill: late)
      if (speed < 0.6 + skill * 2.2 && err < -0.3) { C.state = 'coast'; }
      if (rpm < 1050 && speed < target) { C.state = 'launch'; C.clutch = S.bitePoint; }
      if (g.driver.handbrakeTarget > 0.5 && this.t - (this.hbNoticeT || 0) > 2) { this.hbNoticeT = this.t; I.handbrake.pressed = true; }
    }
    I.clutch.analog = C.clutch;
  }

  // ------------------------------------------------------------------ world events → feelings, lines, blame
  observe(carEvents, trafficEvents) {
    const B = this.tuning.stressBuild;
    void B;
    for (const e of carEvents) {
      switch (e.type) {
        case 'stall':
          if (this.mode === 'start' || (this.shutdown && this.shutdown.off)) break;
          this.addStress(0.15); this.incident('stall'); this.say('stall', { force: true, pri: 3 });
          this.flags.saidRestart = false; this.flags.cranked = false;
          break;
        case 'kerb': if (e.up && this.t - (this.kerbT || -9) > 2.5) { this.kerbT = this.t; this.addStress(0.06); this.incident('kerb'); this.say('kerb', { pri: 1 }); } break;
        case 'collision': this.addStress(0.25); this.incident('collision', e.speed); this.say('crash', { force: true, pri: 3 }); break;
        case 'grind': this.addStress(0.05); this.say('grind', { pri: 1 }); break;
        default: break;
      }
    }
    for (const e of trafficEvents || []) if (e.type === 'horn') { this.addStress(0.08); if (this.t - (this.hornT || -20) > 8) { this.hornT = this.t; this.say('horn', { pri: 1 }); } }
    this.checkNearMiss();
  }

  checkNearMiss() {
    const car = this.game.car;
    if (car.speed < 2 || car.contact || this.t - (this.nearT || -10) < 4) return;
    const box = { cx: car.x, cz: car.z, hx: CAR.halfWidth + 0.3, hz: CAR.halfLen + 0.35, rot: car.psi };
    for (const o of [...this.game.world.staticsNear(car.x, car.z), ...car.dynamics]) {
      if (o.tag === 'cone') continue;
      if (collide(box, o)) {
        this.nearT = this.t; this.tel.nearMisses++; this.addStress(0.12);
        this.say('nearMiss', { pri: 2 });
        return;
      }
    }
  }

  // decide (from recorded facts) whose fault an incident was, and maybe say so
  incident(kind, speed = 0) {
    const t = this.t;
    let cause = 'self';
    if (this.history.some((h) => t - h.t < 3) && this.tel.urgencySum > 0 && this.urgency > 0.25) cause = 'shout';
    if (this.complyNote && t - this.complyNote.t < 6) cause = 'command';
    if (this.lastCommit && t - this.lastCommit.t < 4 && this.lastCommit.intentT && this.lastCommit.t - this.lastCommit.intentT < this.reactionDelay(0) + 1.5) cause = 'late';
    this.recentIncidents.push({ kind, t, cause, speed });
    const key = { shout: 'blameShout', command: 'blameCommand', late: 'blameLate', self: 'blameSelf' }[cause];
    // not every time: only once things have built up a bit
    if (this.recentIncidents.filter((i) => t - i.t < 30).length >= 2 || cause !== 'self') {
      setTimeoutish(this, 1.8, () => this.say(key, { force: true, pri: 2 }));
    }
  }

  tick(dt) { this.timers = (this.timers || []).filter((tm) => { if (this.t >= tm.at) { tm.fn(); return false; } return true; }); void dt; }

  snapshot() {
    return {
      mode: this.mode, hold: this.hold ? this.holdReason : null, intent: this.intent && !this.intent.forgotten ? this.intent.dir : null,
      stress: this.stress, urgency: this.urgency, panic: this.panicEff, free: this.free, vt: this.debug.vt,
    };
  }
}

function setTimeoutish(dave, after, fn) { (dave.timers = dave.timers || []).push({ at: dave.t + after, fn }); }
