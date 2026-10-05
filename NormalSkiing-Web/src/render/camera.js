// Chase camera: frames speed, slope, the terrain ahead and (in the air) the
// likely landing zone. Smoothed with critically-damped springs; shake only
// from trauma (hard landings, rough snow, avalanche).

import * as THREE from 'three';
import { clamp, lerp, valueNoise } from '../sim/math.js';

export class ChaseCam {
  constructor(camera, tune) {
    this.cam = camera;
    this.T = tune;
    this.pos = new THREE.Vector3(0, 10, -10);
    this.look = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, 1);
    this.trauma = 0;
    this.landing = null;
    this.fov = tune.fovBase;
    this.t = 0;
    this.snapNext = true;
  }

  addTrauma(a) {
    this.trauma = Math.min(1, this.trauma + a);
  }

  snap() {
    this.snapNext = true;
  }

  // target: {x,y,z}, vel {x,y,z}, heading, grounded, world, landingPoint|null
  update(dt, s) {
    const T = this.T;
    this.t += dt;
    const v = s.vel;
    const hs = Math.hypot(v.x, v.z);
    const speed = Math.hypot(v.x, v.y, v.z);
    // direction: travel direction when moving, else ski heading
    const want = hs > 3
      ? new THREE.Vector3(v.x / hs, 0, v.z / hs)
      : new THREE.Vector3(Math.sin(s.heading), 0, Math.cos(s.heading));
    // never look back uphill too hard: bias toward downhill (+z)
    want.z += 0.25;
    want.normalize();
    const k = 1 - Math.exp(-dt * (s.ragdoll ? 1.2 : 2.4));
    this.dir.lerp(want, this.snapNext ? 1 : k).normalize();

    const sp = clamp((speed - 8) / 30, 0, 1);
    let dist = T.camDist + sp * 3.2;
    let height = T.camHeight + sp * 0.8;
    const target = new THREE.Vector3(s.x, s.y, s.z);
    // look ahead down the slope
    let lookAhead = 5 + speed * 0.35;
    const ahead = target.clone().addScaledVector(this.dir, lookAhead);
    const gAhead = s.world.height(ahead.x, ahead.z);
    ahead.y = lerp(target.y - 0.5, gAhead + 1, 0.55);
    let lookT = ahead;

    if (!s.grounded && s.landing && !s.ragdoll) {
      // frame skier and predicted landing
      const lp = new THREE.Vector3(s.landing.x, s.landing.y, s.landing.z);
      const drop = clamp((target.y - lp.y) / 25, 0, 1);
      const w = clamp(s.landing.t / 1.2, 0, 0.6);
      lookT = ahead.clone().lerp(lp, w);
      dist += drop * 5 + w * 2;
      height += drop * 5;
    }
    if (s.ragdoll) {
      dist = 8;
      height = 4;
      lookT = target.clone();
    }

    const desired = target.clone().addScaledVector(this.dir, -dist);
    desired.y = target.y + height;
    // keep above terrain
    const gh = s.world.height(desired.x, desired.z);
    if (desired.y < gh + 1.8) desired.y = gh + 1.8;

    const kp = this.snapNext ? 1 : 1 - Math.exp(-dt * 6);
    this.pos.lerp(desired, kp);
    // follow tightly along the travel axis so speed reads as speed
    const along = target.clone().addScaledVector(this.dir, -dist);
    const kAlong = this.snapNext ? 1 : 1 - Math.exp(-dt * 14);
    this.pos.x = lerp(this.pos.x, along.x, kAlong * 0.6);
    this.pos.z = lerp(this.pos.z, along.z, kAlong * 0.6);
    const gh2 = s.world.height(this.pos.x, this.pos.z);
    if (this.pos.y < gh2 + 1.5) this.pos.y = gh2 + 1.5;
    const kl = this.snapNext ? 1 : 1 - Math.exp(-dt * 8);
    this.look.lerp(lookT, kl);
    this.snapNext = false;

    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma * 0.35;
    const ox = valueNoise(this.t * 25, 1.3) * sh;
    const oy = valueNoise(this.t * 25, 7.7) * sh;
    this.cam.position.set(this.pos.x + ox, this.pos.y + oy, this.pos.z);
    this.cam.lookAt(this.look);

    const fovT = T.fovBase + sp * T.fovSpeed + (s.boostFov || 0);
    this.fov = lerp(this.fov, fovT, 1 - Math.exp(-dt * 3));
    if (Math.abs(this.cam.fov - this.fov) > 0.01) {
      this.cam.fov = this.fov;
      this.cam.updateProjectionMatrix();
    }
  }
}
