// Headless-capable game simulation: Rapier world + level rules.
// Runs identically in the browser (driven by the render loop) and in Node
// (driven by tests / the solver), stepping at a fixed 60 Hz. Given the same
// level and the same shots on the same step indices it is deterministic.

import { RAPIER, initPhysics } from './rapier.js';
import { CATALOG, MATS, BALL_RADIUS, BALL_MASS } from './catalog.js';
import { quatFromEulerDeg, upOf, dot3, makeRng, invRotateVec, rotateVec, clamp, DEG } from './math.js';

export const DT = 1 / 60;
export const GRAVITY = -15;
export const KILL_Y = -6;
export let SMASH = 0.5;
export function setSmash(v) { SMASH = v; }

// Collision layers (membership << 16 | filter)
const G_STATIC = 1, G_BALL = 2, G_DYN = 4, G_DEBRIS = 8;
const groups = (member, filter) => (member << 16) | filter;
const CG_STATIC = groups(G_STATIC, G_BALL | G_DYN | G_DEBRIS);
const CG_BALL = groups(G_BALL, G_STATIC | G_BALL | G_DYN);
const CG_DYN = groups(G_DYN, G_STATIC | G_BALL | G_DYN | G_DEBRIS);
const CG_DEBRIS = groups(G_DEBRIS, G_STATIC | G_DYN);

export const SHOT = {
  minSpeed: 6,
  maxSpeed: 19,
  maxAngle: 70, // degrees either side of straight ahead
  hookCurvature: 1 / 8, // 1/m at full spin (≈1/11 effective once rolling)
  hookStartDist: 0.6, // m of skid before the hook bites
  hookRampDist: 1.8,
  hookEnd: 3.2,
};

export const BOOSTERS = {
  heavy: { radiusMul: 1.4, massMul: 3.2 },
  triple: { spreadDeg: 6, offset: 0.7 },
  bomb: { radius: 3.6, power: 11 },
};

export class Sim {
  static async create(level, opts = {}) {
    await initPhysics();
    return new Sim(level, opts);
  }

  constructor(level, opts = {}) {
    this.level = level;
    this.opts = opts;
    this.world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    this.world.timestep = DT;
    this.world.integrationParameters.numSolverIterations = 6;
    this.queue = new RAPIER.EventQueue(true);
    this.rng = makeRng(level.id * 7919 + 17);
    this.stepCount = 0;
    this.entities = [];
    this.byName = new Map();
    this.byCollider = new Map(); // collider handle -> {ent|ball}
    this.balls = [];
    this.events = [];
    this.debris = [];
    this.ballsLeft = level.balls;
    this.ballsUsed = 0;
    this.shotsTaken = 0;
    this.state = 'aim';
    this.shotSteps = 0;
    this.quietSteps = 0;
    this.lastDownStep = -1;
    this.unlimitedBalls = !!opts.unlimitedBalls;
    this.firstImpactStep = -1;
    this.bonusDown = 0;
    this._buildFloor();
    for (const spec of level.objects) this._spawn(spec);
    for (const j of level.joints || []) this._joint(j);
    this.targets = this.entities.filter((e) => e.target);
    this.targetsTotal = this.targets.length;
    this.targetsDown = 0;
    this._spawnBall();
  }

  get targetsRemaining() { return this.targetsTotal - this.targetsDown; }

  // ---------------------------------------------------------------- building
  _buildFloor() {
    const f = this.level.floor || { w: 8, d: 24, cz: -9 };
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(f.cx || 0, -0.25, f.cz || 0));
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(f.w / 2, 0.25, f.d / 2).setFriction(MATS.floor.friction)
        .setRestitution(MATS.floor.restitution).setCollisionGroups(CG_STATIC), body);
    this.floor = { body, collider: c, floor: true, mat: 'floor' };
    this.byCollider.set(c.handle, this.floor);
    for (const extra of f.extra || []) {
      // additional floor slabs e.g. second area: {cx,cz,w,d,y}
      const b = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(extra.cx, (extra.y || 0) - 0.25, extra.cz));
      const cc = this.world.createCollider(RAPIER.ColliderDesc.cuboid(extra.w / 2, 0.25, extra.d / 2)
        .setFriction(MATS.floor.friction).setRestitution(MATS.floor.restitution).setCollisionGroups(CG_STATIC), b);
      this.byCollider.set(cc.handle, this.floor);
    }
  }

  _spawn(spec) {
    const mk = CATALOG[spec.t];
    if (!mk) throw new Error(`Unknown object type ${spec.t}`);
    const def = mk(spec);
    const rot = spec.rot || [0, spec.ry || 0, 0];
    const q = quatFromEulerDeg(rot[0], rot[1], rot[2]);
    let pos;
    if (spec.c) pos = { x: spec.c[0], y: spec.c[1], z: spec.c[2] };
    else pos = { x: spec.at[0], y: spec.at[1] + def.h / 2, z: spec.at[2] };

    let desc;
    if (def.fixed) desc = RAPIER.RigidBodyDesc.fixed();
    else if (def.kinematic || spec.move || spec.spin) desc = RAPIER.RigidBodyDesc.kinematicPositionBased();
    else desc = RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0.05).setAngularDamping(0.35).setCcdEnabled(def.mass < 1 && false);
    desc.setTranslation(pos.x, pos.y, pos.z).setRotation(q);
    const body = this.world.createRigidBody(desc);
    const mat = MATS[spec.mat || def.mat] || MATS.wood;
    const isDyn = body.isDynamic();
    const target = spec.target !== undefined ? spec.target : !!def.target;
    const ent = {
      id: this.entities.length, name: spec.name, type: spec.t, spec, def, body, colliders: [],
      target, bonus: !!def.bonus && spec.target === undefined, down: false, removed: false,
      mat: spec.mat || def.mat, look: spec.look || def.look, initPos: pos, initQ: q,
      initUp: upOf(q), h: def.h, size: def.size, dynamic: isDyn, color: spec.color,
      move: spec.move, spin: spec.spin, ride: !!spec.ride, kick: def.bumper || 0,
      panel: !!def.panel, breakImpulse: spec.breakImpulse || def.breakImpulse || 0,
      shardCount: def.shardCount || 0, lastSound: -100, lastKick: new Map(),
    };
    const parts = def.parts;
    let totalVol = 0;
    const vols = parts.map((p) => partVolume(p));
    for (const v of vols) totalVol += v;
    parts.forEach((p, i) => {
      let cd = colliderDesc(p);
      if (!cd) return;
      if (p.off) cd.setTranslation(p.off[0], p.off[1], p.off[2]);
      cd.setFriction(def.friction ?? mat.friction).setRestitution(mat.restitution);
      if (isDyn) cd.setMass((spec.mass || def.mass) * (vols[i] / totalVol));
      cd.setCollisionGroups(isDyn ? CG_DYN : CG_STATIC);
      cd.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
      cd.setContactForceEventThreshold(isDyn ? 4 : 6);
      const c = this.world.createCollider(cd, body);
      ent.colliders.push(c);
      this.byCollider.set(c.handle, ent);
    });
    if (spec.sleep && isDyn) body.sleep();
    this.entities.push(ent);
    if (spec.name) this.byName.set(spec.name, ent);
    return ent;
  }

  _joint(j) {
    const a = j.a ? this.byName.get(j.a) : null;
    const b = this.byName.get(j.b);
    let ba = a ? a.body : null;
    if (!ba) {
      ba = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
    }
    const anchorW = { x: j.anchor[0], y: j.anchor[1], z: j.anchor[2] };
    const la = localPoint(ba, anchorW);
    const lb = localPoint(b.body, anchorW);
    const axis = { x: j.axis[0], y: j.axis[1], z: j.axis[2] };
    // axis expressed in each body's local frame
    const axA = invRotateVec(ba.rotation(), axis);
    let data;
    if (j.kind === 'spherical') data = RAPIER.JointData.spherical(la, lb);
    else data = RAPIER.JointData.revolute(la, lb, axA);
    const joint = this.world.createImpulseJoint(data, ba, b.body, true);
    if (j.limits && joint.setLimits) joint.setLimits(j.limits[0] * DEG, j.limits[1] * DEG);
  }

  _spawnBall() {
    const s = this.level.start || [0, 0, 0];
    const r = BALL_RADIUS;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(s[0], (s[1] || 0) + r, s[2]));
    const c = this.world.createCollider(RAPIER.ColliderDesc.ball(r).setCollisionGroups(CG_BALL), body);
    this.aimBall = { body, collider: c, radius: r, placeholder: true };
  }

  _removeAimBall() {
    if (this.aimBall) {
      this.world.removeRigidBody(this.aimBall.body);
      this.aimBall = null;
    }
  }

  // --------------------------------------------------------------- shooting
  canShoot() {
    return this.state === 'aim' && (this.ballsLeft > 0 || this.unlimitedBalls);
  }

  /**
   * Launch a shot. angle: degrees, 0 = straight ahead (-Z), positive = right.
   * power: 0..1, spin: -1..1 (positive curves right), booster: null|'heavy'|'triple'|'bomb'
   */
  launch({ angle = 0, power = 0.7, spin = 0, booster = null } = {}) {
    if (!this.canShoot()) return false;
    angle = clamp(angle, -SHOT.maxAngle, SHOT.maxAngle);
    power = clamp(power, 0, 1);
    spin = clamp(spin, -1, 1);
    this.lastRawShot = { angle, power, spin };
    // Early levels: gentle aim assist pulls near-miss aims onto the sweet spot.
    const as = this.level.assist;
    if (as && !this.opts.noAssist && this.targetsDown === 0) {
      for (const target of [].concat(as.angle)) {
        const d = target - angle;
        if (Math.abs(d) < as.range) { angle += d * (as.strength ?? 0.75); break; }
      }
    }
    const s = this.level.start || [0, 0, 0];
    this._removeAimBall();
    const pm = this.level.power || [0, 1];
    const speed = SHOT.minSpeed + (SHOT.maxSpeed - SHOT.minSpeed) * (pm[0] + (pm[1] - pm[0]) * power);
    const shots = booster === 'triple'
      ? [[-BOOSTERS.triple.spreadDeg, -1], [0, 0], [BOOSTERS.triple.spreadDeg, 1]]
      : [[0, 0]];
    for (const [da, side] of shots) {
      const a = (angle + da) * DEG;
      const dir = { x: Math.sin(a), z: -Math.cos(a) };
      const base = angle * DEG;
      const perp = { x: Math.cos(base), z: Math.sin(base) };
      const heavy = booster === 'heavy';
      const r = BALL_RADIUS * (heavy ? BOOSTERS.heavy.radiusMul : 1);
      const mass = BALL_MASS * (heavy ? BOOSTERS.heavy.massMul : 1);
      const off = side * BOOSTERS.triple.offset;
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(s[0] + perp.x * off, (s[1] || 0) + r + 0.002, s[2] + perp.z * off)
        .setLinearDamping(0.04).setAngularDamping(0.25).setCcdEnabled(true));
      const c = this.world.createCollider(RAPIER.ColliderDesc.ball(r).setMass(mass)
        .setFriction(0.35).setRestitution(0.2).setCollisionGroups(CG_BALL)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(5), body);
      body.setLinvel({ x: dir.x * speed, y: 0, z: dir.z * speed }, true);
      body.setAngvel({ x: (dir.z * speed) / r, y: spin * 6, z: (-dir.x * speed) / r }, true);
      const ball = {
        body, collider: c, radius: r, mass, spin, heavy, bomb: booster === 'bomb', bombUsed: false,
        launchStep: this.stepCount, slowSteps: 0, active: true, id: this.balls.length, booster,
        hit: false, smashed: new Set(),
      };
      this.balls.push(ball);
      this.byCollider.set(c.handle, { ball });
    }
    if (!this.unlimitedBalls || this.ballsLeft > 0) this.ballsLeft = Math.max(0, this.ballsLeft - 1);
    this.ballsUsed++;
    this.shotsTaken++;
    this.state = 'rolling';
    this.shotSteps = 0;
    this.quietSteps = 0;
    this.events.push({ t: 'launch', speed, booster, power });
    return true;
  }

  addBalls(n) {
    this.ballsLeft += n;
    if (this.state === 'lost') {
      this.state = 'aim';
      this._clearBalls();
      this._spawnBall();
    }
  }

  // ------------------------------------------------------------------ step
  step() {
    this.events.length = 0;
    const t = this.stepCount * DT;
    // kinematic movers
    for (const e of this.entities) {
      if (e.removed) continue;
      if (e.move) {
        const m = e.move;
        const k = m.amp * Math.sin((2 * Math.PI * t) / m.period + (m.phase || 0));
        e.body.setNextKinematicTranslation({
          x: e.initPos.x + m.axis[0] * k, y: e.initPos.y + m.axis[1] * k, z: e.initPos.z + m.axis[2] * k,
        });
      }
      if (e.spin) {
        const ang = (e.spin.speed * t + (e.spin.phase || 0));
        const r0 = e.spec.rot || [0, e.spec.ry || 0, 0];
        e.body.setNextKinematicRotation(quatFromEulerDeg(r0[0], r0[1] + ang, r0[2]));
      }
    }
    // hook forces + glass pre-check
    for (const b of this.balls) {
      if (!b.active) continue;
      const v = b.body.linvel();
      const age = (this.stepCount - b.launchStep) * DT;
      if (b.spin !== 0 && age < SHOT.hookEnd && Math.abs(v.y) < 0.8) {
        // constant-curvature hook: path shape is independent of speed, so the
        // aim preview can show it exactly (until something is hit).
        const sp = Math.hypot(v.x, v.z);
        if (sp > 1.2 && !b.hit) {
          b.dist = (b.dist || 0) + sp * DT;
          const ramp = clamp((b.dist - SHOT.hookStartDist) / SHOT.hookRampDist, 0, 1);
          const a = SHOT.hookCurvature * b.spin * ramp * sp * sp;
          const rx = -v.z / sp, rz = v.x / sp;
          b.body.applyImpulse({ x: rx * a * b.mass * DT, y: 0, z: rz * a * b.mass * DT }, true);
        }
      }
      this._glassCheck(b);
    }

    this.world.step(this.queue);
    this.stepCount++;

    this.queue.drainContactForceEvents((ev) => this._onForce(ev));
    this.queue.drainCollisionEvents(() => {});

    this._updateTargets();
    this._updateDebris();
    this._updateBalls();
    this._resolve();
  }

  _glassCheck(b) {
    const p = b.body.translation();
    const v = b.body.linvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed < 3) return;
    for (const e of this.entities) {
      if (!e.panel || e.removed) continue;
      const q = e.body.rotation();
      const tp = e.body.translation();
      // look a little ahead so the ball smashes through rather than bouncing
      const ahead = { x: p.x + v.x * DT * 1.5 - tp.x, y: p.y + v.y * DT * 1.5 - tp.y, z: p.z + v.z * DT * 1.5 - tp.z };
      const l = invRotateVec(q, ahead);
      const hx = e.size[0] / 2, hy = e.size[1] / 2, hz = e.size[2] / 2;
      const cx = clamp(l.x, -hx, hx), cy = clamp(l.y, -hy, hy), cz = clamp(l.z, -hz, hz);
      const d = Math.hypot(l.x - cx, l.y - cy, l.z - cz);
      if (d < b.radius + 0.02) {
        this._shatter(e, v, speed);
        const keep = b.heavy ? 0.93 : 0.82;
        b.body.setLinvel({ x: v.x * keep, y: v.y * keep, z: v.z * keep }, true);
        this.events.push({ t: 'impact', x: p.x, y: p.y, z: p.z, s: 1, mat: 'glass', ball: true });
      }
    }
  }

  _onForce(ev) {
    const h1 = ev.collider1(), h2 = ev.collider2();
    const A = this.byCollider.get(h1), B = this.byCollider.get(h2);
    if (!A || !B) return;
    const force = ev.totalForceMagnitude();
    const impulse = force * DT;
    const ba = bodyOf(A), bb = bodyOf(B);
    if (!ba || !bb) return;
    const va = ba.linvel(), vb = bb.linvel();
    const rel = Math.hypot(va.x - vb.x, va.y - vb.y, va.z - vb.z);
    const pa = ba.translation(), pb = bb.translation();
    const pos = A.floor ? pb : B.floor ? pa : { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, z: (pa.z + pb.z) / 2 };

    // ball-related logic
    for (const [X, Y, bodyY] of [[A, B, bb], [B, A, ba]]) {
      if (X.ball) {
        const ball = X.ball;
        if (!Y.floor && !ball.hit && rel > 1) {
          ball.hit = true;
          if (this.firstImpactStep < 0) this.firstImpactStep = this.stepCount;
        }
        // arcade "smash": the first touch of a ball adds a burst of extra
        // momentum to what it hits so pins scatter into each other.
        if (Y.dynamic && !Y.removed && rel > 2 && !ball.smashed.has(Y)) {
          ball.smashed.add(Y);
          const bp = ball.body.translation(), yp = Y.body.translation();
          let dx = yp.x - bp.x, dz = yp.z - bp.z;
          const dl = Math.hypot(dx, dz) || 1;
          const bv = ball.body.linvel();
          const k = SMASH * Math.min(rel, 16) * Y.body.mass() * (ball.heavy ? 1.3 : 1);
          // mix of contact direction and ball direction
          const bs = Math.hypot(bv.x, bv.z) || 1;
          dx = (dx / dl) * 0.6 + (bv.x / bs) * 0.4; dz = (dz / dl) * 0.6 + (bv.z / bs) * 0.4;
          Y.body.applyImpulse({ x: dx * k, y: k * 0.18, z: dz * k }, true);
        }
        if (ball.bomb && !ball.bombUsed && !Y.floor && rel > 1.5) {
          ball.bombUsed = true;
          this._explode(ball.body.translation());
        }
      }
      // bumpers kick whatever hits them
      if (Y.kick && (X.ball || X.dynamic) && rel > 0.8) {
        const who = X.ball ? X.ball : X;
        const last = Y.lastKick.get(who) ?? -100;
        if (this.stepCount - last > 12) {
          Y.lastKick.set(who, this.stepCount);
          const bp = Y.body.translation(), xp = bodyOf(X).translation();
          let dx = xp.x - bp.x, dz = xp.z - bp.z;
          if (Y.look === 'bumperWall') {
            // wall: push along its local X normal
            const n = rotateVec(Y.body.rotation(), { x: 1, y: 0, z: 0 });
            const s = Math.sign(dx * n.x + dz * n.z) || 1;
            dx = n.x * s; dz = n.z * s;
          }
          const dl = Math.hypot(dx, dz) || 1;
          const m = X.ball ? X.ball.mass : bodyOf(X).mass();
          bodyOf(X).applyImpulse({ x: (dx / dl) * Y.kick * m * 0.5, y: 0, z: (dz / dl) * Y.kick * m * 0.5 }, true);
          this.events.push({ t: 'bumper', x: bp.x, y: bp.y + 0.3, z: bp.z, s: 1 });
        }
      }
      // breakables
      if (Y.breakImpulse && !Y.removed) {
        if (impulse > Y.breakImpulse && rel > 1.2) {
          if (Y.panel) this._shatter(Y, bodyOf(X).linvel(), rel);
          else if (Y.dynamic) this._shatter(Y, bodyY.linvel(), rel);
        }
      }
    }

    // sound / fx impact event
    if (rel > 0.9) {
      const ent = !A.ball && !A.floor ? A : B;
      const mat = A.ball || B.ball ? (ent.mat || 'floor') : ent.mat || 'wood';
      const s = clamp((rel - 0.9) / 9, 0.04, 1) * clamp(impulse / 3, 0.25, 1.5);
      const key = ent.ball ? ent.ball : ent;
      if (this.stepCount - (key.lastSound ?? -100) > 5) {
        key.lastSound = this.stepCount;
        this.events.push({ t: 'impact', x: pos.x, y: pos.y, z: pos.z, s: Math.min(1, s), mat, ball: !!(A.ball || B.ball), floorHit: !!(A.floor || B.floor) });
      }
    }
  }

  _explode(p) {
    const { radius, power } = BOOSTERS.bomb;
    for (const e of this.entities) {
      if (e.removed || !e.dynamic) continue;
      const q = e.body.translation();
      const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > radius) continue;
      const f = (1 - d / radius) * power * e.body.mass();
      const dl = d || 1;
      e.body.applyImpulse({ x: (dx / dl) * f, y: f * 0.55 + (dy / dl) * f * 0.3, z: (dz / dl) * f }, true);
      e.body.applyTorqueImpulse({ x: (this.rng() - 0.5) * f * 0.1, y: (this.rng() - 0.5) * f * 0.1, z: (this.rng() - 0.5) * f * 0.1 }, true);
    }
    for (const e of this.entities) {
      if (e.panel && !e.removed) {
        const q = e.body.translation();
        if (Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < radius) this._shatter(e, { x: 0, y: 2, z: 0 }, 6);
      }
    }
    this.events.push({ t: 'bomb', x: p.x, y: p.y, z: p.z });
  }

  _shatter(e, vel, speed) {
    if (e.removed) return;
    const p = e.body.translation();
    const q = e.body.rotation();
    const ev = e.dynamic ? e.body.linvel() : { x: 0, y: 0, z: 0 };
    this.world.removeRigidBody(e.body);
    e.removed = true;
    e.shattered = true;
    this.events.push({ t: 'shatter', id: e.id, x: p.x, y: p.y, z: p.z, mat: e.mat, look: e.look });
    // shards: deterministic pseudo-random pieces
    const n = Math.min(e.shardCount, 140 - this.debris.length);
    const [w, h, d] = e.size;
    for (let i = 0; i < n; i++) {
      const lx = (this.rng() - 0.5) * w, ly = (this.rng() - 0.5) * h, lz = (this.rng() - 0.5) * d;
      const sz = e.panel ? [0.12 + this.rng() * 0.22, 0.12 + this.rng() * 0.22, Math.max(0.03, d * 0.6)]
        : [0.05 + this.rng() * 0.07, 0.05 + this.rng() * 0.07, 0.02 + this.rng() * 0.03];
      const off = rotateLocal(q, lx, ly, lz);
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p.x + off.x, p.y + off.y, p.z + off.z).setRotation(q)
        .setLinearDamping(0.2).setAngularDamping(0.4));
      const c = this.world.createCollider(RAPIER.ColliderDesc.cuboid(sz[0] / 2, sz[1] / 2, sz[2] / 2)
        .setMass(0.05).setFriction(0.5).setRestitution(0.2).setCollisionGroups(CG_DEBRIS), body);
      const k = e.panel ? 0.45 : 0.3;
      body.setLinvel({
        x: ev.x + vel.x * k + (this.rng() - 0.5) * 3,
        y: ev.y + vel.y * k + this.rng() * 2.5,
        z: ev.z + vel.z * k + (this.rng() - 0.5) * 3,
      }, true);
      body.setAngvel({ x: (this.rng() - 0.5) * 20, y: (this.rng() - 0.5) * 20, z: (this.rng() - 0.5) * 20 }, true);
      this.debris.push({ body, collider: c, size: sz, mat: e.mat, born: this.stepCount, id: `d${this.stepCount}_${i}_${e.id}` });
    }
    // wake anything resting nearby (support may have vanished)
    this._wakeNear(p, Math.max(w, h, d) + 1.5);
    if (e.target && !e.down) this._markDown(e, 'shatter');
  }

  _wakeNear(p, r) {
    for (const o of this.entities) {
      if (o.removed || !o.dynamic) continue;
      const q = o.body.translation();
      if (Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < r) o.body.wakeUp();
    }
  }

  _markDown(e, why) {
    e.down = true;
    e.downStep = this.stepCount;
    this.targetsDown++;
    this.lastDownStep = this.stepCount;
    const p = e.removed ? e.initPos : e.body.translation();
    this.events.push({ t: 'down', id: e.id, x: p.x, y: p.y, z: p.z, why, remaining: this.targetsRemaining });
    if (this.targetsRemaining === 0 && this.state !== 'won') {
      this.state = 'won';
      this.wonStep = this.stepCount;
      this.events.push({ t: 'won', shots: this.shotsTaken });
    }
  }

  _updateTargets() {
    for (const e of this.entities) {
      if (e.removed || !e.dynamic) continue;
      const p = e.body.translation();
      if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) {
        this.nanDetected = true;
        continue;
      }
      if (p.y < KILL_Y) {
        // fell off the world: retire the body
        this.world.removeRigidBody(e.body);
        e.removed = true;
        e.fellOut = true;
        if (e.target && !e.down) this._markDown(e, 'fell');
        else if (e.bonus && !e.bonusTaken) this._bonus(e);
        continue;
      }
      if ((!e.target && !e.bonus) || e.down || e.bonusTaken) continue;
      if (e.body.isSleeping()) continue;
      const up = upOf(e.body.rotation());
      const cosT = dot3(up, e.initUp);
      const tilted = cosT < Math.cos(e.def.tilt * DEG);
      const dropped = e.initPos.y - p.y > e.h * e.def.drop + 0.05;
      if (tilted || dropped) {
        if (e.target) this._markDown(e, tilted ? 'tilt' : 'drop');
        else this._bonus(e);
      }
    }
  }

  _bonus(e) {
    e.bonusTaken = true;
    this.bonusDown++;
    const p = e.removed ? e.initPos : e.body.translation();
    this.events.push({ t: 'bonus', id: e.id, x: p.x, y: p.y, z: p.z });
  }

  _updateDebris() {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      const age = this.stepCount - d.born;
      if (age > 200 || d.body.translation().y < KILL_Y) {
        this.world.removeRigidBody(d.body);
        d.removed = true;
        this.debris.splice(i, 1);
      }
    }
  }

  _updateBalls() {
    for (const b of this.balls) {
      if (!b.active) continue;
      const p = b.body.translation();
      if (p.y < KILL_Y) {
        this.world.removeRigidBody(b.body);
        b.active = false;
        b.removed = true;
        this.events.push({ t: 'ballOut', id: b.id });
        continue;
      }
      const v = b.body.linvel();
      const sp = Math.hypot(v.x, v.y, v.z);
      b.speed = sp;
      if (sp < 0.35) b.slowSteps++; else b.slowSteps = 0;
    }
  }

  _worldQuiet() {
    for (const e of this.entities) {
      if (e.removed || !e.dynamic || e.ride) continue;
      if (e.body.isSleeping()) continue;
      const v = e.body.linvel();
      if (Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) > 0.25) return false;
    }
    return true;
  }

  _resolve() {
    if (this.state !== 'rolling' && this.state !== 'won') return;
    this.shotSteps++;
    if (this.state === 'won') return;
    const ballsDone = this.balls.every((b) => !b.active || b.slowSteps > 25);
    if (ballsDone && this._worldQuiet()) this.quietSteps++;
    else this.quietSteps = 0;
    const sinceDown = this.stepCount - this.lastDownStep;
    const done = (this.quietSteps > 20 && sinceDown > 30) || this.shotSteps > 60 * 13;
    if (!done) return;
    this.events.push({ t: 'shotResolved', remaining: this.targetsRemaining });
    this._clearBalls();
    this._sweep();
    if (this.ballsLeft > 0 || this.unlimitedBalls) {
      this.state = 'aim';
      this._spawnBall();
    } else {
      this.state = 'lost';
      this.events.push({ t: 'lost', remaining: this.targetsRemaining });
    }
  }

  /** Bowling-style sweep: knocked-down targets are cleared between balls. */
  _sweep() {
    const swept = [];
    for (const e of this.entities) {
      if (e.target && e.down && !e.removed) {
        this.world.removeRigidBody(e.body);
        e.removed = true;
        e.swept = true;
        swept.push(e.id);
      }
    }
    for (const e of this.entities) if (!e.removed && e.dynamic) e.body.wakeUp();
    if (swept.length) this.events.push({ t: 'sweep', ids: swept });
  }

  _clearBalls() {
    for (const b of this.balls) {
      if (b.active) {
        this.world.removeRigidBody(b.body);
        b.active = false;
        b.removed = true;
        this.events.push({ t: 'ballClear', id: b.id });
      }
    }
  }

  // ------------------------------------------------------------ utilities
  bodyCount() { return this.world.bodies.len(); }

  /** Cheap hash of the full physical state for determinism tests. */
  stateHash() {
    let h = 0;
    const add = (v) => { h = (h * 31 + Math.round(v * 1e5)) | 0; };
    for (const e of this.entities) {
      if (e.removed) { add(-999); continue; }
      const p = e.body.translation(), q = e.body.rotation();
      add(p.x); add(p.y); add(p.z); add(q.x); add(q.y); add(q.z); add(q.w);
    }
    return h;
  }

  hasNaN() {
    if (this.nanDetected) return true;
    for (const e of this.entities) {
      if (e.removed) continue;
      const p = e.body.translation();
      if (!isFinite(p.x + p.y + p.z)) return true;
    }
    return false;
  }

  dispose() {
    this.world.free();
    this.queue.free();
  }
}

// ------------------------------------------------------------------ helpers
function bodyOf(x) {
  if (x.ball) return x.ball.body;
  return x.body;
}

function rotateLocal(q, x, y, z) {
  const ix = q.w * x + q.y * z - q.z * y;
  const iy = q.w * y + q.z * x - q.x * z;
  const iz = q.w * z + q.x * y - q.y * x;
  const iw = -q.x * x - q.y * y - q.z * z;
  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
}

function localPoint(body, w) {
  const t = body.translation();
  return invRotateVec(body.rotation(), { x: w.x - t.x, y: w.y - t.y, z: w.z - t.z });
}

function colliderDesc(p) {
  switch (p.shape) {
    case 'box': return RAPIER.ColliderDesc.cuboid(p.size[0] / 2, p.size[1] / 2, p.size[2] / 2);
    case 'cyl': return RAPIER.ColliderDesc.cylinder(p.h / 2, p.r);
    case 'cone': return RAPIER.ColliderDesc.cone(p.h / 2, p.r);
    case 'ball': return RAPIER.ColliderDesc.ball(p.r);
    case 'capsule': return RAPIER.ColliderDesc.capsule(p.h / 2, p.r);
    case 'hull': return RAPIER.ColliderDesc.convexHull(new Float32Array(p.points));
    default: return null;
  }
}

function partVolume(p) {
  switch (p.shape) {
    case 'box': return p.size[0] * p.size[1] * p.size[2];
    case 'cyl': return Math.PI * p.r * p.r * p.h;
    case 'cone': return (Math.PI * p.r * p.r * p.h) / 3;
    case 'ball': return (4 / 3) * Math.PI * p.r ** 3;
    case 'capsule': return Math.PI * p.r * p.r * p.h + (4 / 3) * Math.PI * p.r ** 3;
    default: return 1;
  }
}

/** Run a shot sequence headlessly. Returns result summary. */
export async function runShots(level, shots, opts = {}) {
  const sim = await Sim.create(level, opts);
  const maxSteps = opts.maxSteps || 60 * 60;
  let si = 0;
  const downOnce = new Set();
  let duplicateDown = false;
  for (let i = 0; i < maxSteps; i++) {
    if (sim.state === 'aim' && si < shots.length) sim.launch(shots[si++]);
    sim.step();
    for (const ev of sim.events) {
      if (ev.t === 'down') {
        if (downOnce.has(ev.id)) duplicateDown = true;
        downOnce.add(ev.id);
      }
    }
    if (sim.state === 'won' && sim.stepCount - sim.wonStep > (opts.afterWin || 0)) break;
    if (sim.state === 'lost') break;
    if (sim.state === 'aim' && si >= shots.length) break;
  }
  const res = {
    won: sim.state === 'won', state: sim.state, shotsTaken: sim.shotsTaken,
    remaining: sim.targetsRemaining, total: sim.targetsTotal, steps: sim.stepCount,
    hash: sim.stateHash(), nan: sim.hasNaN(), duplicateDown, ballsLeft: sim.ballsLeft,
    bodies: sim.bodyCount(),
  };
  if (opts.keep) res.sim = sim; else sim.dispose();
  return res;
}
