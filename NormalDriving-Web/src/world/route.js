// Objectives, dry commentary and the (understated) stats.

import { CAR } from '../sim/params.js';
import { corners } from '../sim/collision.js';
import { gearName } from '../sim/driver.js';

export const IDS = {
  START: 0, FIRST: 1, MOVE: 2, YARD_LINE: 3, JUNCTION: 4, TURN_LEFT: 5, FOLLOW: 6,
  LIGHTS: 7, UPHILL: 8, GIVE_WAY: 9, TOP_JUNCTION: 10, TOP_TURN: 11, PARALLEL: 12, NAN: 13, SHUTDOWN: 14, ARRIVED: 15,
};

const PROMPTS = {
  [IDS.START]: 'START THE CAR.',
  [IDS.FIRST]: 'PUT IT IN FIRST.',
  [IDS.MOVE]: 'MOVE OFF.',
  [IDS.YARD_LINE]: 'STOP AT THE LINE.',
  [IDS.JUNCTION]: 'STOP AT THE JUNCTION.',
  [IDS.TURN_LEFT]: 'TURN LEFT.',
  [IDS.FOLLOW]: 'FOLLOW THE ROAD.',
  [IDS.LIGHTS]: 'WAIT AT THE LIGHTS.',
  [IDS.UPHILL]: 'UP THE HILL.',
  [IDS.GIVE_WAY]: 'GIVE WAY TO ONCOMING TRAFFIC.',
  [IDS.TOP_JUNCTION]: 'STOP AT THE JUNCTION.',
  [IDS.TOP_TURN]: 'TURN RIGHT.',
  [IDS.PARALLEL]: 'PARALLEL PARK.',
  [IDS.NAN]: "PARK OUTSIDE NAN'S HOUSE.",
  [IDS.SHUTDOWN]: 'HANDBRAKE ON. ENGINE OFF.',
  [IDS.ARRIVED]: 'YOU ARRIVED.',
};

const ORD = ['', 'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH'];
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export function newStats() {
  return { time: 0, stalls: 0, rollbacks: 0, grinds: 0, kerbHits: 0, collisions: 0, overheats: 0, parkingAttempts: 0, started: false };
}

export class Route {
  constructor(world) {
    this.world = world;
    this.reset();
  }

  reset(step = IDS.START) {
    this.step = step;
    this.stats = newStats();
    this.timer = 0;           // generic per-step timer
    this.stopT = 0;
    this.msg = null;          // { text, sub, t, pri }
    this.flags = {};
    this.backDist = 0; this.rolling = false;
    this.lastKerbT = -10; this.time = 0;
    this.lookL = 0; this.lookR = 0;
    this.wrongGearT = -10;
    this.parkReverse = false; this.parkReverseDist = 0;
    this.successT = 0;
    this.handbrakeT = 0; this.neutralT = 0;
    this.history = [];
  }

  get prompt() { return PROMPTS[this.step]; }

  say(text, sub = '', pri = 1) {
    const m = this.msg;
    if (m && m.pri > pri && m.t < 1.0) return;
    this.msg = { text, sub, t: 0, pri };
    this.history.push(text);
  }

  advance(to) {
    this.step = to ?? this.step + 1;
    this.timer = 0; this.stopT = 0; this.flags = {};
    this.lookL = 0; this.lookR = 0;
  }

  front(car) {
    return [car.x + Math.sin(car.psi) * CAR.halfLen, car.z + Math.cos(car.psi) * CAR.halfLen];
  }

  // ctx: { car, driver, traffic, lookYaw, settings }
  update(dt, ctx) {
    const { car, driver, traffic } = ctx;
    const w = this.world;
    const st = this.stats;
    this.time += dt;
    if (this.msg) { this.msg.t += dt; if (this.msg.t > 2.6) this.msg = null; }
    if (st.started && this.step < IDS.ARRIVED) st.time += dt;
    this.timer += dt;
    const stopped = car.speed < 0.12;
    this.stopT = stopped ? this.stopT + dt : 0;
    const [fx, fz] = this.front(car);
    const look = ctx.lookYaw || 0; // + = looking left
    this.lookL = Math.max(this.lookL, look); this.lookR = Math.max(this.lookR, -look);

    // --------------------------------------------------------- reactive comments
    for (const e of car.events) {
      switch (e.type) {
        case 'catch': st.started = true; break;
        case 'stall': st.stalls++; this.say('STALLED.', '', 3); break;
        case 'grind': st.grinds++; this.say("THAT WASN'T A GEAR.", '', 2); break;
        case 'kerb':
          if (e.up && this.time - this.lastKerbT > 1.2) { st.kerbHits++; this.lastKerbT = this.time; this.say('THAT WAS THE KERB.', '', 2); }
          break;
        case 'collision': st.collisions++; this.say('THUNK.', "That's not ideal.", 3); break;
        case 'clutchHot': st.overheats++; this.say('CLUTCH HOT.', 'You can smell it.', 2); break;
        default: break;
      }
    }
    // rolling backwards when you didn't mean to
    const slope = Math.abs(w.grade(car.z));
    if (car.gear !== -1 && car.fwdSpeed < -0.2 && (slope > 0.03 || this.rolling)) {
      this.backDist += -car.fwdSpeed * dt;
      if (this.backDist > 0.4 && !this.rolling) { this.rolling = true; st.rollbacks++; this.say('STOP ROLLING BACKWARDS.', '', 3); }
      else if (this.rolling && this.backDist > 6 && !this.flags.rollMore) { this.flags.rollMore = true; this.say('STILL ROLLING BACKWARDS.', '', 3); }
    } else if (car.fwdSpeed > 0.3 || (stopped && this.stopT > 1.0)) { this.backDist = 0; this.rolling = false; this.flags.rollMore = false; }
    // trying to pull away in the wrong gear
    if (car.running && car.gear >= 2 && car.speed < 1.2 && car.clutchCapFrac > 0.3 && car.rpm < 1250 && this.time - this.wrongGearT > 6) {
      this.wrongGearT = this.time; this.say(`YOU'RE IN ${ORD[car.gear]}.`, '', 2);
    }
    if (car.running && car.gear === -1 && driver.throttle > 0.2 && car.fwdSpeed < -0.5 && this.step !== IDS.PARALLEL && this.step !== IDS.YARD_LINE && this.time - this.wrongGearT > 6) {
      this.wrongGearT = this.time; this.say("YOU'RE IN REVERSE.", '', 2);
    }
    // driving against the handbrake
    if (car.running && driver.handbrake > 0.5 && driver.throttle > 0.3 && car.gear !== 0 && car.clutchCapFrac > 0.4) this.handbrakeT += dt; else this.handbrakeT = 0;
    if (this.handbrakeT > 1.4 && !this.flags.hb) { this.flags.hb = true; this.say('HANDBRAKE.', '', 2); }
    // revving in neutral
    if (car.running && (car.gear === 0 || car.clutchCapFrac < 0.05) && driver.throttle > 0.5 && car.rpm > 3200 && car.speed < 0.3) this.neutralT += dt; else this.neutralT = 0;
    if (this.neutralT > 1.5 && !this.flags.neu) { this.flags.neu = true; this.say(car.gear === 0 ? "YOU'RE IN NEUTRAL." : 'CLUTCH.', '', 1); }
    // cranking in gear
    if (car.cranking && car.gear !== 0 && car.clutchCapFrac > 0.3 && !this.flags.crankGear) { this.flags.crankGear = true; this.say("IT'S IN GEAR.", '', 2); }

    // --------------------------------------------------------- objectives
    traffic.lightsState = traffic.lights;
    let legitWait = false;
    switch (this.step) {
      case IDS.START:
        if (car.running) this.advance();
        break;
      case IDS.FIRST:
        if (car.gear === 1) this.advance();
        break;
      case IDS.MOVE:
        if (car.z > w.poses.start.z + 4 || Math.hypot(car.x - w.poses.start.x, car.z - w.poses.start.z) > 6) this.advance();
        break;
      case IDS.YARD_LINE: {
        const L = w.yardLine;
        const inX = fx > L.x0 - 1 && fx < L.x1 + 1;
        if (inX && fz > L.z - 3.5 && fz < L.z + 0.35 && this.stopT > 0.6) { this.say('FINE.', '', 0); this.advance(); }
        else if (inX && stopped && this.stopT > 0.8 && fz >= L.z + 0.35 && fz < L.z + 12 && !this.flags.back) { this.flags.back = true; this.say('BACK A BIT.', 'Reverse is there for a reason.', 1); }
        else if (fz > L.z + 25) { this.say('THAT WAS THE LINE.', '', 1); this.advance(); }
        if (fz < L.z + 0.35) this.flags.back = false;
        break;
      }
      case IDS.JUNCTION:
      case IDS.TOP_JUNCTION: {
        const J = this.step === IDS.JUNCTION ? w.junction1 : w.topJunction;
        const inLane = fx > J.laneX0 - 1.2 && fx < J.laneX1 + 1.2;
        if (inLane && fz > J.stopZ - 3.6 && fz < J.stopZ + 0.4) {
          if (this.stopT > 0.5 && !this.flags.stoppedAt) { this.flags.stoppedAt = true; this.lookL = Math.max(0, look); this.lookR = Math.max(0, -look); }
          if (this.flags.stoppedAt) legitWait = true;
        }
        if (fz > J.stopZ + 1.2) {
          if (!this.flags.stoppedAt) this.say('THAT WAS A JUNCTION.', 'You were meant to stop.', 2);
          else if (ctx.settings.lookRequirement && (this.lookR < 0.75 || this.lookL < 0.6)) this.say("YOU DIDN'T LOOK.", this.lookR < 0.75 ? 'Traffic comes from the right.' : 'Or left.', 2);
          this.advance();
        }
        break;
      }
      case IDS.TURN_LEFT:
        if (car.x > 10 && Math.abs(car.z) < 7 && angDiff(car.psi, Math.PI / 2) < 0.6) this.advance();
        else if (car.x < -10 && Math.abs(car.z) < 7 && !this.flags.wrong) { this.flags.wrong = true; this.say('OTHER LEFT.', '', 2); }
        break;
      case IDS.FOLLOW:
        if (car.z > 52) this.advance();
        break;
      case IDS.LIGHTS: {
        const Lt = w.lights;
        const inLane = fx > Lt.laneX0 - 2 && fx < Lt.laneX1 + 1;
        if (traffic.lights === 'red') {
          if (inLane && fz > Lt.stopZ - 7 && fz < Lt.stopZ + 0.5 && this.stopT > 0.2) {
            legitWait = true;
            this.flags.waitT = (this.flags.waitT || 0) + dt;
            if (this.flags.waitT > 3.2) { traffic.lights = 'green'; this.say('GREEN.', '', 0); }
          }
          if (fz > Lt.stopZ + 1.0) { traffic.lights = 'green'; this.say('THAT WAS RED.', '', 2); }
        }
        if (fz > Lt.stopZ + 2) this.advance();
        break;
      }
      case IDS.UPHILL:
        if (car.z > 118) { traffic.triggerOncoming(); this.advance(); }
        break;
      case IDS.GIVE_WAY: {
        const Gw = w.giveWay;
        const passed = traffic.oncomingPassed(Gw.stopZ - 6);
        if (!passed && fz > Gw.stopZ - 6 && fz < Gw.stopZ + 0.5 && stopped) legitWait = true;
        if (!passed && fz > Gw.stopZ + 1 && !this.flags.rude) { this.flags.rude = true; this.say('YOU WERE MEANT TO GIVE WAY.', '', 2); }
        if ((passed && fz > Gw.stopZ - 15) || fz > Gw.stopZ + 40) this.advance();
        break;
      }
      case IDS.TOP_TURN:
        if (car.x < 62 && car.z > 245 && angDiff(car.psi, -Math.PI / 2) < 0.6) this.advance();
        else if (car.x > 78 && car.z > 245 && !this.flags.wrong) { this.flags.wrong = true; this.say('OTHER RIGHT.', '', 2); }
        break;
      case IDS.PARALLEL: {
        const P = w.parkSpace;
        // attempts: each separate reverse into the space area
        const near = Math.abs(car.x - P.cx) < 13 && car.z > 246;
        if (near && car.gear === -1 && car.fwdSpeed < -0.2) {
          this.parkReverseDist += -car.fwdSpeed * dt;
          if (!this.parkReverse && this.parkReverseDist > 0.6) { this.parkReverse = true; st.parkingAttempts++; }
        } else if (car.gear !== -1 && car.fwdSpeed > 0.4) { this.parkReverse = false; this.parkReverseDist = 0; }
        // dry feedback when you've given up somewhere nearly right
        if (this.stopT > 2.0 && !this.flags.parkFb) {
          const why = this.parkingFault(car);
          if (why) { this.flags.parkFb = true; this.say(why, '', 1); }
        }
        if (!stopped) this.flags.parkFb = false;
        if (this.parkedInSpace(car) && this.stopT > 1.0) {
          this.say("THAT'LL DO.", '', 1);
          if (!st.parkingAttempts) st.parkingAttempts = 1;
          this.advance();
        }
        if (this.flags.queue) legitWait = false;
        break;
      }
      case IDS.NAN:
        if (this.inDriveway(car) && stopped) this.advance();
        break;
      case IDS.SHUTDOWN:
        if (!this.inDriveway(car)) { this.advance(IDS.NAN); break; }
        if (!car.running && !car.ignitionOn && driver.handbrake > 0.9 && stopped) this.advance();
        break;
      default: break;
    }
    ctx.legitWait = legitWait;
  }

  carCorners(car) { return corners(car.x, car.z, CAR.halfWidth, CAR.halfLen, car.psi); }

  parkedInSpace(car) {
    const P = this.world.parkSpace;
    const cs = this.carCorners(car);
    const along = Math.min(angDiff(car.psi, -Math.PI / 2), angDiff(car.psi, Math.PI / 2));
    if (along > 0.21) return false;
    let maxZ = -Infinity;
    for (const [x, z] of cs) {
      if (x < P.x0 - 0.05 || x > P.x1 + 0.05) return false;
      if (z > P.kerbZ + 0.25 || z < P.kerbZ - 2.6) return false;
      maxZ = Math.max(maxZ, z);
    }
    return maxZ > P.kerbZ - 0.55;
  }

  parkingFault(car) {
    const P = this.world.parkSpace;
    if (Math.abs(car.x - (P.x0 + P.x1) / 2) > 4.5 || car.z < P.kerbZ - 4) return null;
    const along = Math.min(angDiff(car.psi, -Math.PI / 2), angDiff(car.psi, Math.PI / 2));
    const cs = this.carCorners(car);
    const maxZ = Math.max(...cs.map((c) => c[1]));
    const minX = Math.min(...cs.map((c) => c[0])), maxX = Math.max(...cs.map((c) => c[0]));
    if (maxZ > P.kerbZ + 0.25) return "THAT'S ON THE KERB.";
    if (along > 0.21) return 'NOT STRAIGHT.';
    if (maxZ < P.kerbZ - 0.55) return 'TOO FAR FROM THE KERB.';
    if (minX < P.x0 - 0.05 || maxX > P.x1 + 0.05) return 'NOT IN THE SPACE.';
    return null;
  }

  inDriveway(car) {
    const d = this.world.nanDrive;
    for (const [x, z] of this.carCorners(car)) {
      if (x < d.cx - d.hx - 0.1 || x > d.cx + d.hx + 0.1) return false;
      if (z < this.world.parkSpace.kerbZ + 0.6 || z > d.cz + d.hz + 0.1) return false;
    }
    return true;
  }

  summary() {
    const s = this.stats;
    const m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
    return [
      ['Time', `${m}:${String(sec).padStart(2, '0')}`],
      ['Stalls', s.stalls], ['Rollbacks', s.rollbacks], ['Gear grinds', s.grinds],
      ['Kerb hits', s.kerbHits], ['Collisions', s.collisions], ['Clutch overheats', s.overheats],
      ['Parking attempts', s.parkingAttempts],
    ];
  }
}

export { gearName };
