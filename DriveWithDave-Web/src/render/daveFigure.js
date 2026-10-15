// Dave: a stylised person in the driver's seat. His hands are on the real
// steering wheel (they shuffle round as it turns), he reaches for the gear
// lever when he changes gear, looks over his shoulder to reverse, and turns
// to you when he talks.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export class DaveFigure {
  constructor(view, colour = 0x2f4a6b) {
    this.view = view;
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
    const g = new THREE.Group();
    this.group = g;
    this.jacket = mat(colour);
    const skin = mat(0xd8b196), hair = mat(0x3b2f27), dark = mat(0x1d1d1d), jeans = mat(0x2d3542);
    const SX = -0.37;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.56, 0.25), this.jacket);
    torso.position.set(SX, 0.8, -0.5); torso.rotation.x = 0.16;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.55), jeans);
    legs.position.set(SX, 0.52, -0.15);
    const shins = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.14), jeans);
    shins.position.set(SX, 0.33, 0.14);
    g.add(torso, legs, shins);
    // head on a neck pivot so it can turn
    this.neck = new THREE.Group();
    this.neck.position.set(SX, 1.1, -0.46);
    const neckM = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8), skin);
    neckM.position.y = 0.02;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), skin);
    head.scale.set(1, 1.14, 1.04); head.position.y = 0.15;
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.108, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), hair);
    hairM.position.y = 0.17; hairM.rotation.x = -0.25;
    const eyeG = new THREE.SphereGeometry(0.012, 6, 6);
    const eL = new THREE.Mesh(eyeG, dark), eR = new THREE.Mesh(eyeG, dark);
    eL.position.set(0.036, 0.17, 0.095); eR.position.set(-0.036, 0.17, 0.095);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.035, 0.03), skin);
    nose.position.set(0, 0.14, 0.108);
    this.mouth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.01), mat(0x6b3a33));
    this.mouth.position.set(0, 0.105, 0.1);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.012), hair);
    brow.position.set(0, 0.198, 0.098);
    this.brow = brow;
    this.neck.add(neckM, head, hairM, eL, eR, nose, this.mouth, brow);
    g.add(this.neck);
    // arms: one segment shoulder → hand, plus a hand blob
    const armG = new THREE.CylinderGeometry(0.034, 0.03, 1, 8);
    armG.translate(0, 0.5, 0);
    this.arms = [-1, 1].map((side) => {
      const a = new THREE.Mesh(armG, this.jacket);   // upper arm
      const f = new THREE.Mesh(armG, this.jacket);   // forearm
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.033, 8, 6), skin);
      g.add(a, f, h);
      return { side, arm: a, fore: f, hand: h, shoulder: new THREE.Vector3(SX + side * 0.22, 1.0, -0.43) };
    });
    view.body.add(g);
    this.talkT = 0; this.gearT = 0; this.lastGear = 0; this.lookYaw = 0;
  }

  setColour(c) { this.jacket.color.setHex(c); }

  update(dt, { steerDeg, gear, talking, reversing, mode, stress, lookTurn }) {
    const v = this.view;
    v.columnPivot.updateMatrix();
    const R = 0.175;
    const spin = (steerDeg * Math.PI) / 180;
    // hands shuffle round every ~120° of wheel, like hand-over-hand
    const saw = ((((spin + Math.PI / 3) % (2 * Math.PI / 3)) + 2 * Math.PI / 3) % (2 * Math.PI / 3)) - Math.PI / 3;
    if (gear !== this.lastGear) { this.gearT = 0.55; this.lastGear = gear; }
    this.gearT = Math.max(0, this.gearT - dt);
    for (const A of this.arms) {
      // driver's left hand = +x side (left of the car)
      const base = A.side > 0 ? Math.PI / 6 : (5 * Math.PI) / 6;
      const ang = base + saw;
      let p = new THREE.Vector3(R * Math.cos(ang), R * Math.sin(ang), 0).applyMatrix4(v.columnPivot.matrix);
      if (A.side > 0 && this.gearT > 0) {
        // reach for the gear lever
        v.gearPivot.updateMatrix();
        const knob = new THREE.Vector3(0, 0.27, 0).applyMatrix4(v.gearPivot.matrix);
        p = p.lerp(knob, Math.sin(Math.min(1, this.gearT / 0.55) * Math.PI));
      }
      // elbow: hangs down and out between shoulder and hand
      const elbow = A.shoulder.clone().lerp(p, 0.45);
      elbow.y -= 0.16; elbow.x += A.side * 0.07; elbow.z -= 0.02;
      const seg = (mesh, a, b) => {
        const d = b.clone().sub(a);
        mesh.position.copy(a);
        mesh.scale.set(1, d.length(), 1);
        mesh.quaternion.setFromUnitVectors(UP, d.normalize());
      };
      seg(A.arm, A.shoulder, elbow);
      seg(A.fore, elbow, p);
      A.hand.position.copy(p);
    }
    // head: towards you when talking, over the shoulder reversing, into the turn otherwise
    let target = -spin * 0.08;
    if (lookTurn) target += lookTurn;
    if (reversing) target = 2.0;
    if (talking) target = 0.75;
    if (mode === 'park' && reversing) target = 1.4;
    this.lookYaw += (target - this.lookYaw) * (1 - Math.exp(-dt * 5));
    this.neck.rotation.y = this.lookYaw;
    this.neck.rotation.x = -0.05 + (stress || 0) * 0.08;
    this.talkT = talking ? this.talkT + dt : 0;
    this.mouth.scale.y = talking ? 1 + 3 * Math.abs(Math.sin(this.talkT * 13)) : 1;
    this.brow.position.y = 0.198 + (stress || 0) * 0.012;
  }
}
