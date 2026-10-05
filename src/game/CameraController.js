import * as THREE from 'three';

// Elevated third-person follow camera. Default pitch is fairly high so the
// crowd reads well; scroll zooms out far enough to take in the whole colony.
export class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; // camera sits south of the player, looking north at the cottage
    this.pitch = 0.62;
    this.dist = 13;
    this.target = new THREE.Vector3();
    this.minDist = 5;
    this.maxDist = 46;
  }

  update(dt, px, pz, input, sensitivity = 0.0026) {
    this.yaw -= input.mouseDX * sensitivity;
    this.pitch = Math.max(0.15, Math.min(1.35, this.pitch + input.mouseDY * sensitivity));
    if (input.wheel) this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist * (1 + input.wheel * 0.12)));
    this.target.lerp(new THREE.Vector3(px, 1.0, pz), Math.min(1, dt * 10));
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const x = this.target.x + Math.sin(this.yaw) * cp * this.dist;
    const z = this.target.z + Math.cos(this.yaw) * cp * this.dist;
    const y = Math.max(0.8, this.target.y + sp * this.dist);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target.x, this.target.y + 0.6, this.target.z);
  }

  // Converts a camera-relative input axis to a world-space XZ vector.
  toWorld(ax, ay) {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw); // forward
    const rx = -fz, rz = fx; // right
    return { x: fx * ay + rx * ax, z: fz * ay + rz * ax };
  }
}
