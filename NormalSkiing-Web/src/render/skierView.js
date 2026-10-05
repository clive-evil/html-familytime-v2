// Procedural skier: limbs are posed from the simulation state (leg length,
// balance, lean, tuck, air pitch/roll) and, after a crash, from ragdoll
// particles. Same meshes for both so the transition is seamless.

import * as THREE from 'three';
import { RD } from '../sim/ragdoll.js';
import { clamp } from '../sim/math.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

function mat(color) {
  // a little self-illumination keeps the skier readable in shadow
  const c = new THREE.Color(color);
  return new THREE.MeshLambertMaterial({ color, emissive: c.clone().multiplyScalar(0.28) });
}

export class SkierView {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    const jacket = mat(0xff5a1f);
    const pants = mat(0x1e4fd8);
    const skin = mat(0xf2c7a0);
    const helmet = mat(0xffd21f);
    const ski = mat(0xd81e3a);
    const boot = mat(0x222222);
    const pole = mat(0x333333);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 8);
    const mk = (r, m) => {
      const mesh = new THREE.Mesh(cyl, m);
      mesh.userData.r = r;
      mesh.castShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    this.parts = {
      lThigh: mk(0.085, pants), rThigh: mk(0.085, pants),
      lShin: mk(0.07, pants), rShin: mk(0.07, pants),
      torso: mk(0.17, jacket),
      lArm: mk(0.055, jacket), rArm: mk(0.055, jacket),
      lPole: mk(0.012, pole), rPole: mk(0.012, pole),
    };
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 10), helmet);
    this.head.castShadow = true;
    this.group.add(this.head);
    this.face = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), skin);
    this.group.add(this.face);
    this.goggles = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.06), mat(0x18323f));
    this.group.add(this.goggles);
    this.hips = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), pants);
    this.hips.castShadow = true;
    this.group.add(this.hips);
    const skiGeo = new THREE.BoxGeometry(0.085, 0.025, 1.7);
    skiGeo.translate(0, 0, 0.05);
    this.skis = [new THREE.Mesh(skiGeo, ski), new THREE.Mesh(skiGeo, ski)];
    this.boots = [];
    for (const s of this.skis) {
      s.castShadow = true;
      this.group.add(s);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.28), boot);
      b.position.set(0, 0.09, 0);
      s.add(b);
      this.boots.push(b);
    }
    this.joints = {};
  }

  setSegment(mesh, a, b) {
    const d = tmpA.subVectors(b, a);
    const len = d.length();
    mesh.position.copy(a).addScaledVector(d, 0.5);
    if (len > 1e-5) tmpQ.setFromUnitVectors(UP, d.multiplyScalar(1 / len));
    mesh.quaternion.copy(tmpQ);
    mesh.scale.set(mesh.userData.r, len, mesh.userData.r);
  }

  // Pose from simulation. `sk` is the Skier, `t` render time.
  pose(sk, pos, t) {
    const T = sk.T;
    const heading = sk.heading;
    const fwdH = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    let up;
    let fwd;
    if (sk.grounded) {
      up = new THREE.Vector3(sk.n.x, sk.n.y, sk.n.z);
      fwd = fwdH.clone().addScaledVector(up, -fwdH.dot(up)).normalize();
      // inclination into the turn
      const lean = sk.lean + sk.balL * 0.35;
      up.applyAxisAngle(fwd, lean);
    } else {
      // air: pitch (tips up = +) & roll (right = +) from sim
      const right = new THREE.Vector3().crossVectors(fwdH, UP).normalize();
      fwd = fwdH.clone().multiplyScalar(Math.cos(sk.pitch)).add(new THREE.Vector3(0, Math.sin(sk.pitch), 0)).normalize();
      up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      up.applyAxisAngle(fwd, sk.roll);
    }
    const left = new THREE.Vector3().crossVectors(up, fwd).normalize();
    up = new THREE.Vector3().crossVectors(fwd, left).normalize();

    const L = sk.L;
    const feet = new THREE.Vector3(pos.x, pos.y, pos.z).addScaledVector(up, -L);
    const W = (lx, ly, lz) => feet.clone().addScaledVector(left, lx).addScaledVector(up, ly).addScaledVector(fwd, lz);

    const crouch = clamp(1 - (L - T.legMin) / (T.legMax - T.legMin), 0, 1);
    const tuck = sk.tuck;
    const bF = clamp(sk.balF, -1.2, 1.2);
    const bL = clamp(sk.balL, -1.2, 1.2);
    const wob = clamp((sk.balance - 0.25) / 0.6, 0, 1);

    // skis
    const stance = 0.14 + Math.abs(bL) * 0.05;
    const skiSplay = sk.brake * 0.35;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const s = this.skis[i];
      const p = W(side * stance, 0.02, 0);
      s.position.copy(p);
      const m = new THREE.Matrix4().makeBasis(left, up, fwd);
      s.quaternion.setFromRotationMatrix(m);
      if (skiSplay > 0) s.rotateY(side * skiSplay * 0.6);
      // flex for air: tips droop slightly
    }
    // hips: forward/back with balance, back when crouched
    const hipZ = -0.12 * crouch + bF * 0.28 - tuck * 0.05;
    const hipX = -bL * 0.18;
    const hip = W(hipX, Math.max(0.42, L - 0.02), hipZ);
    const ankleL = W(stance, 0.14, 0);
    const ankleR = W(-stance, 0.14, 0);
    const hipL = hip.clone().addScaledVector(left, 0.1);
    const hipR = hip.clone().addScaledVector(left, -0.1);
    const kneeL = this.ik(hipL, ankleL, fwd, 0.47, 0.47);
    const kneeR = this.ik(hipR, ankleR, fwd, 0.47, 0.47);
    this.setSegment(this.parts.lThigh, hipL, kneeL);
    this.setSegment(this.parts.rThigh, hipR, kneeR);
    this.setSegment(this.parts.lShin, kneeL, ankleL);
    this.setSegment(this.parts.rShin, kneeR, ankleR);
    this.hips.position.copy(hip);

    // torso pitch: crouch & tuck lean forward, balance tilts
    const torsoPitch = 0.25 + crouch * 0.55 + tuck * 0.55;
    const torsoRoll = bL * 0.5;
    const tdir = up.clone().applyAxisAngle(left, torsoPitch + Math.max(0, bF) * 0.3 - Math.max(0, -bF) * 0.6);
    tdir.applyAxisAngle(fwd, torsoRoll);
    const chest = hip.clone().addScaledVector(tdir, 0.55);
    this.setSegment(this.parts.torso, hip, chest);
    const headP = chest.clone().addScaledVector(tdir, 0.2).addScaledVector(fwd, 0.04);
    this.head.position.copy(headP);
    this.face.position.copy(headP).addScaledVector(fwd, 0.07).addScaledVector(up, -0.03);
    this.goggles.position.copy(headP).addScaledVector(fwd, 0.12);
    this.goggles.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up, fwd));

    // arms: forward ready, tucked, or flailing when wobbling
    const shL = chest.clone().addScaledVector(left, 0.2).addScaledVector(tdir, -0.05);
    const shR = chest.clone().addScaledVector(left, -0.2).addScaledVector(tdir, -0.05);
    const flail = (ph) => Math.sin(t * 13 + ph) * wob;
    let hL;
    let hR;
    if (tuck > 0.5 && wob < 0.3) {
      hL = W(0.12, Math.max(0.5, L * 0.9), 0.45);
      hR = W(-0.12, Math.max(0.5, L * 0.9), 0.45);
    } else {
      const air = sk.grounded ? 0 : 0.2;
      hL = shL.clone().addScaledVector(fwd, 0.38 - wob * 0.2).addScaledVector(up, -0.32 + wob * 0.55 + flail(0) * 0.35 + air)
        .addScaledVector(left, 0.12 + wob * 0.45 + air);
      hR = shR.clone().addScaledVector(fwd, 0.38 - wob * 0.2).addScaledVector(up, -0.32 + wob * 0.55 + flail(2) * 0.35 + air)
        .addScaledVector(left, -0.12 - wob * 0.45 - air);
    }
    this.setSegment(this.parts.lArm, shL, hL);
    this.setSegment(this.parts.rArm, shR, hR);
    const poleTipL = hL.clone().addScaledVector(up, -1.05).addScaledVector(fwd, -0.45 + (tuck > 0.5 ? -0.5 : 0));
    const poleTipR = hR.clone().addScaledVector(up, -1.05).addScaledVector(fwd, -0.45 + (tuck > 0.5 ? -0.5 : 0));
    this.setSegment(this.parts.lPole, hL, poleTipL);
    this.setSegment(this.parts.rPole, hR, poleTipR);

    // joints for ragdoll handoff
    const tipL = W(stance, 0.03, 0.9);
    const tailL = W(stance, 0.03, -0.8);
    const tipR = W(-stance, 0.03, 0.9);
    const tailR = W(-stance, 0.03, -0.8);
    this.joints = [headP, chest, hip, kneeL, kneeR, ankleL, ankleR, hL, hR, tipL, tailL, tipR, tailR]
      .map((v) => ({ x: v.x, y: v.y, z: v.z }));
    this.feet = feet;
    this.fwd = fwd;
    this.up = up;
  }

  ik(hip, ankle, fwd, a, b) {
    const d = tmpB.subVectors(ankle, hip);
    const len = Math.min(d.length(), a + b - 1e-3);
    const dir = d.clone().normalize();
    // law of cosines
    const cosA = clamp((a * a + len * len - b * b) / (2 * a * len), -1, 1);
    const along = a * cosA;
    const perp = Math.sqrt(Math.max(0, a * a - along * along));
    const bend = fwd.clone().addScaledVector(dir, -fwd.dot(dir)).normalize();
    return hip.clone().addScaledVector(dir, along).addScaledVector(bend, perp);
  }

  poseRagdoll(rd) {
    const P = (i) => new THREE.Vector3(rd.x[i * 3], rd.x[i * 3 + 1], rd.x[i * 3 + 2]);
    const head = P(RD.head);
    const chest = P(RD.chest);
    const pelvis = P(RD.pelvis);
    const kL = P(RD.lKnee);
    const kR = P(RD.rKnee);
    const fL = P(RD.lFoot);
    const fR = P(RD.rFoot);
    const hL = P(RD.lHand);
    const hR = P(RD.rHand);
    this.setSegment(this.parts.torso, pelvis, chest);
    this.hips.position.copy(pelvis);
    this.head.position.copy(head);
    const fdir = head.clone().sub(chest).normalize();
    this.face.position.copy(head).addScaledVector(fdir, 0.02);
    this.goggles.position.copy(head);
    const side = new THREE.Vector3().subVectors(kL, kR).normalize();
    this.setSegment(this.parts.lThigh, pelvis.clone().addScaledVector(side, 0.08), kL);
    this.setSegment(this.parts.rThigh, pelvis.clone().addScaledVector(side, -0.08), kR);
    this.setSegment(this.parts.lShin, kL, fL);
    this.setSegment(this.parts.rShin, kR, fR);
    this.setSegment(this.parts.lArm, chest.clone().addScaledVector(side, 0.18), hL);
    this.setSegment(this.parts.rArm, chest.clone().addScaledVector(side, -0.18), hR);
    this.setSegment(this.parts.lPole, hL, hL.clone().addScaledVector(fdir, -1.0));
    this.setSegment(this.parts.rPole, hR, hR.clone().addScaledVector(fdir, -1.0));
    const skiPairs = [[RD.lTip, RD.lTail], [RD.rTip, RD.rTail]];
    for (let i = 0; i < 2; i++) {
      const tip = P(skiPairs[i][0]);
      const tail = P(skiPairs[i][1]);
      const f = tip.clone().sub(tail).normalize();
      const s = this.skis[i];
      s.position.copy(tip).add(tail).multiplyScalar(0.5).addScaledVector(f, -0.05);
      let l = new THREE.Vector3().crossVectors(UP, f);
      if (l.lengthSq() < 1e-4) l.set(1, 0, 0);
      l.normalize();
      const u = new THREE.Vector3().crossVectors(f, l).normalize();
      s.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(l, u, f));
      this.boots[i].visible = rd.skiAttached[i];
    }
  }

  showBoots() {
    for (const b of this.boots) b.visible = true;
  }
}
