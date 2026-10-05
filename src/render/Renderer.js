import * as THREE from 'three';

const SKY = {
  day: new THREE.Color(0xbfdbe3),
  dusk: new THREE.Color(0xeab48c),
  night: new THREE.Color(0x26304a),
  dawn: new THREE.Color(0xf0cfa8),
};

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = SKY.day.clone();
    this.scene.fog = new THREE.Fog(SKY.day.clone(), 60, 140);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    this.hemi = new THREE.HemisphereLight(0xfff3dc, 0x6b7f4a, 1.6);
    this.sun = new THREE.DirectionalLight(0xfff0d6, 1.9);
    this.sun.position.set(30, 50, 20);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(this.hemi, this.sun, this.ambient);
    this._c = new THREE.Color();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  // Simple sky/light grading from the sim clock. Gameplay > pretty lighting.
  setTime(state, dayLength, nightLength) {
    const c = this._c;
    let light = 1;
    if (state.phase === 'night') {
      const k = state.nightTime / nightLength;
      if (k < 0.2) { c.copy(SKY.dusk).lerp(SKY.night, k / 0.2); light = 1 - (k / 0.2) * 0.6; }
      else if (k > 0.8) { c.copy(SKY.night).lerp(SKY.dawn, (k - 0.8) / 0.2); light = 0.4 + ((k - 0.8) / 0.2) * 0.5; }
      else { c.copy(SKY.night); light = 0.4; }
    } else {
      const k = state.clockRunning ? state.dayTime / dayLength : 0.3;
      if (k < 0.08) c.copy(SKY.dawn).lerp(SKY.day, k / 0.08);
      else if (k > 0.82) c.copy(SKY.day).lerp(SKY.dusk, (k - 0.82) / 0.18);
      else c.copy(SKY.day);
      light = k > 0.82 ? 1 - ((k - 0.82) / 0.18) * 0.25 : 1;
    }
    this.scene.background.copy(c);
    this.scene.fog.color.copy(c);
    this.hemi.intensity = 1.6 * light;
    this.sun.intensity = 1.9 * light;
    this.sun.color.setHSL(0.1, 0.6, 0.6 + light * 0.3);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
