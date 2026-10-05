import * as THREE from 'three';
import { World } from './world/layout.js';
import { CarSim } from './sim/car.js';
import { Driver, gearName } from './sim/driver.js';
import { DEFAULT_SETTINGS, applyPreset } from './sim/params.js';
import { Traffic } from './world/traffic.js';
import { Route, IDS } from './world/route.js';
import { Input, LAYOUTS } from './input/input.js';
import { Audio } from './audio/audio.js';
import { buildTown, setLights } from './render/scene.js';
import { View, makePedestrian } from './render/view.js';
import { Lab } from './ui/lab.js';

const STORE = 'normal-driving-settings-v1';
const SUB = 1 / 240;

// ------------------------------------------------------------------ settings
function loadSettings() {
  let s = applyPreset({ ...DEFAULT_SETTINGS, assists: { ...DEFAULT_SETTINGS.assists } }, DEFAULT_SETTINGS.preset);
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) { const o = JSON.parse(raw); s = { ...s, ...o, assists: { ...s.assists, ...(o.assists || {}) } }; }
  } catch { /* private mode etc. */ }
  return s;
}
let settings = loadSettings();
const saveSettings = () => { try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch { /* ignore */ } };

// ------------------------------------------------------------------ renderer + scene
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const SKY = 0xc4ccd2;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 70, 380);
const hemi = new THREE.HemisphereLight(0xdfe5ea, 0x56534a, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3e2, 0.95);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
if ('intensity' in sun.shadow) sun.shadow.intensity = 0.55;
scene.add(sun, sun.target);

const view = new View(renderer, scene);
view.mode = settings.camera;
const ped = makePedestrian();
scene.add(ped);

// ------------------------------------------------------------------ simulation objects
let world, town, car, driver, traffic, route;
function buildWorld() {
  if (town) scene.remove(town.root);
  world = new World({ hillSteepness: settings.hillSteepness });
  town = buildTown(world, renderer);
  scene.add(town.root);
}
buildWorld();
car = new CarSim(world, settings);
driver = new Driver(settings);
traffic = new Traffic(world);
route = new Route(world);

const audio = new Audio();
const input = new Input(canvas, () => settings);

// ------------------------------------------------------------------ settings changes
function setSettings(s, key) {
  const hillChanged = s.hillSteepness !== settings.hillSteepness;
  settings = s;
  car.setSettings(s); driver.setSettings(s);
  view.mode = s.camera;
  if (hillChanged) {
    const pose = { x: car.x, z: car.z, psi: car.psi };
    buildWorld();
    car.world = world; traffic.world = world; route.world = world;
    traffic.reset();
    car.reset(pose, true);
  }
  saveSettings();
  void key;
}

function stopCarAt(pose, engineRunning) {
  car.reset(pose, false);
  driver.reset();
  if (engineRunning) { car.running = true; car.ignitionOn = true; car.omegaE = 850 / 9.549; car.sinceCatch = 5; }
}

const actions = {
  preset(k) { setSettings(applyPreset(settings, k), 'preset'); lab.refresh(); flash(`PRESET ${k}.`, '', 0); },
  resetCar() {
    const p = car.lastSafe;
    const engine = car.running;
    car.reset({ x: p.x, z: p.z, psi: p.psi }, true);
    if (!engine) car.running = false;
    driver.handbrakeTarget = 1; driver.handbrake = 1;
  },
  resetHill() {
    stopCarAt(world.poses.hillBottom, true);
    traffic.reset(); route.reset(IDS.FOLLOW); route.stats.started = true;
    hideArrived();
  },
  resetRoute() {
    stopCarAt(world.poses.start, false);
    traffic.reset(); route.reset(IDS.START);
    hideArrived();
  },
  teleportParking() {
    stopCarAt(world.poses.parking, true);
    traffic.reset(); route.reset(IDS.PARALLEL); route.stats.started = true;
    hideArrived();
  },
};
const lab = new Lab(document.getElementById('lab'), { getSettings: () => settings, setSettings, actions });
lab.refresh();

// ------------------------------------------------------------------ HUD
const $ = (id) => document.getElementById(id);
const promptEl = $('prompt'), hintEl = $('hint'), msgEl = $('message'), readEl = $('readout');
const gateCv = $('gate'), gateCtx = gateCv.getContext('2d');
const arrivedEl = $('arrived'), statsEl = $('stats');
let flashMsg = null;
function flash(text, sub = '', pri = 0) { route.say(text, sub, pri); }
function hideArrived() { arrivedEl.style.display = 'none'; }

function keyName(codes) { return codes[0].replace('Key', '').replace('Digit', '').replace('Left', '').replace('Right', '').replace('Arrow', ''); }
function hintFor(step) {
  const K = LAYOUTS[settings.keyboardLayout] || LAYOUTS.A;
  const pad = input.lastDevice === 'gamepad';
  const h = settings.gearbox === 'hpattern';
  switch (step) {
    case IDS.START: return pad ? 'Clutch down (LT), neutral, hold A.' : `Clutch down (${keyName(K.clutch)}), neutral, hold ${keyName(K.ignition)}.`;
    case IDS.FIRST: return h ? (pad ? 'Clutch down. R3 for the gearstick, then left and up.' : 'Clutch down. Arrows: left, then up. (or right-drag the mouse)') : (pad ? 'Clutch down, then Y.' : `Clutch down, then 1 (or ${keyName(K.gearUp)}).`);
    case IDS.MOVE: return pad ? 'Handbrake off (RB). A little throttle. Find the bite.' : `Handbrake off (${keyName(K.handbrake)}). A little throttle (${keyName(K.throttle)}). Find the bite.`;
    default: return '';
  }
}

function drawGate() {
  const show = settings.showGate;
  gateCv.style.display = show ? 'block' : 'none';
  if (!show) return;
  const c = gateCtx, W = 96;
  c.clearRect(0, 0, W, W);
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 3; c.lineCap = 'round';
  const X = (x) => W / 2 + x * 28, Y = (y) => W / 2 - y * 30;
  c.beginPath();
  c.moveTo(X(-1), Y(0)); c.lineTo(X(1), Y(0));
  for (const x of [-1, 0, 1]) { c.moveTo(X(x), Y(-1)); c.lineTo(X(x), Y(1)); }
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.5)'; c.font = '10px Arial'; c.textAlign = 'center';
  for (const [x, y, t] of [[-1, 1, '1'], [-1, -1, '2'], [0, 1, '3'], [0, -1, '4'], [1, 1, '5'], [1, -1, 'R']]) c.fillText(t, X(x) + (x < 0 ? -9 : 9), Y(y) + (y > 0 ? 3 : 4));
  const lv = driver.lever;
  c.fillStyle = car.gear !== 0 ? '#d9c38a' : lv.blocked ? '#e0533d' : '#f1efe8';
  c.beginPath(); c.arc(X(lv.x), Y(lv.y), 5.5, 0, Math.PI * 2); c.fill();
}

function updateHud(dt) {
  promptEl.textContent = route.step === IDS.ARRIVED ? '' : route.prompt;
  hintEl.textContent = hintFor(route.step);
  const m = route.msg;
  if (m) {
    msgEl.querySelector('.t').textContent = m.text;
    msgEl.querySelector('.s').textContent = m.sub || '';
    msgEl.style.opacity = m.t > 2.2 ? String(Math.max(0, (2.6 - m.t) / 0.4)) : '1';
  } else msgEl.style.opacity = '0';
  const showRead = settings.showReadout || view.mode === 'third';
  readEl.style.display = showRead ? 'block' : 'none';
  if (showRead) {
    readEl.innerHTML = `${(Math.abs(car.fwdSpeed) * 2.237).toFixed(0).padStart(2, ' ')} mph &nbsp; ${gearName(car.gear)} &nbsp; ${car.rpm.toFixed(0)} rpm<br>clutch ${Math.round(driver.clutchOut * 100)}% &nbsp; thr ${Math.round(driver.throttle * 100)}% &nbsp; brk ${Math.round(driver.brake * 100)}%${driver.handbrake > 0.5 ? ' &nbsp; HANDBRAKE' : ''}`;
  }
  drawGate();
  if (route.step === IDS.ARRIVED && arrivedEl.style.display !== 'flex') {
    statsEl.innerHTML = route.summary().map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
    arrivedEl.style.display = 'flex';
  }
  void dt;
}

// ------------------------------------------------------------------ title screen
const titleEl = $('title');
{
  const K = LAYOUTS[settings.keyboardLayout] || LAYOUTS.A;
  $('titleKeys').innerHTML = [
    `${keyName(K.throttle)} &nbsp; accelerator`, `${keyName(K.brake)} &nbsp; brake`, `${keyName(K.left)}/${keyName(K.right)} &nbsp; steering wheel`,
    `${keyName(K.clutch)} &nbsp; clutch (hold)`, `${keyName(K.handbrake)} &nbsp; handbrake`, `${keyName(K.ignition)} &nbsp; ignition (hold)`,
    `1–5 R N, ${keyName(K.gearDown)}/${keyName(K.gearUp)} &nbsp; gears`, 'Arrows / RMB &nbsp; H-pattern lever', 'Mouse &nbsp; look', 'C &nbsp; camera', 'F1 &nbsp; lab', 'Controller &nbsp; see README',
  ].join('<br>');
}
let started = false;
function begin() {
  if (started) return;
  started = true;
  titleEl.style.display = 'none';
  audio.start();
  try { canvas.requestPointerLock(); } catch { /* ignore */ }
}
titleEl.addEventListener('click', begin);

input.onUiKey = (code) => {
  if (!started && (code === 'Enter' || code === 'Space')) begin();
  if (route.step === IDS.ARRIVED && code === 'Enter') actions.resetRoute();
};

// ------------------------------------------------------------------ main loop
let last = performance.now();
let acc = 0;
let fps = 60;
let lookYaw = 0;
let padPrevA = false;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  if (window.__ND_FIXED_DT) dt = window.__ND_FIXED_DT;

  const { I, ui } = input.poll(dt);
  if (ui.debug) lab.toggle();
  if (ui.camera) { setSettings({ ...settings, camera: settings.camera === 'first' ? 'third' : 'first' }, 'camera'); lab.refresh(); }
  if (input.padConnected && !started && I.ignition) begin();
  if (route.step === IDS.ARRIVED && I.ignition && !padPrevA && input.lastDevice === 'gamepad') actions.resetRoute();
  padPrevA = I.ignition;
  if (!started && !window.__ND_AUTOSTART) { renderer.render(scene, view.camera); return; }

  // driver controls → car physics (fixed step)
  const controls = driver.update(dt, I, car);
  car.dynamics = traffic.colliders();
  acc += dt;
  let n = 0;
  while (acc >= SUB && n < 40) { car.step(SUB, controls); acc -= SUB; n++; }
  if (n >= 40) acc = 0;
  car.grinding = driver.grindHeld;

  // objectives & traffic
  const ctx = { car, driver, traffic, lookYaw, settings, stepId: route.step, ids: IDS, legitWait: false };
  route.update(dt, ctx);
  ctx.stepId = route.step;
  traffic.update(dt, car, ctx);
  for (const e of traffic.events) if (e.type === 'horn') audio.horn(e.len);
  for (const e of car.events) audio.play(e.type, e.mag);
  car.events.length = 0;

  // render sync
  view.sync(car, driver, settings, dt);
  lookYaw = view.updateCamera(dt, car, ui, settings, input);
  view.syncAI(traffic.cars, world);
  setLights(town.lights, traffic.lights);
  const p = traffic.ped;
  ped.visible = p.visible;
  ped.position.set(p.x, world.height(p.x, p.z), p.z);
  ped.rotation.y = p.heading;
  sun.position.set(car.x - 30, car.y + 60, car.z - 20);
  sun.target.position.set(car.x, car.y, car.z);

  audio.update(dt, {
    rpm: car.rpm, running: car.running, cranking: car.cranking, throttle: driver.throttle, throttleEff: car.running ? Math.min(1, car.throttleEff || 0) : 0,
    load: car.engineLoad, speed: car.speed, squeal: car.tyreSqueal, grinding: driver.grindHeld, scrape: car.scrape,
    clutchAbuse: Math.min(1, Math.abs(car.clutchTorque * car.clutchSlip) / 30000), horn: I.horn, inside: view.mode === 'first',
  });

  if (!window.__ND_NORENDER) {
    view.renderMirrors(scene, car);
    renderer.render(scene, view.camera);
  }
  updateHud(dt);
  lab.update(car, driver, { lookYaw, fps, device: input.padConnected ? `pad (${input.lastDevice})` : 'keyboard/mouse' });
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  view.camera.aspect = w / h;
  view.camera.fov = w / h < 1.3 ? 80 : 70;
  view.camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

$('loading').style.display = 'none';
$('go').style.visibility = 'visible';
requestAnimationFrame(frame);

// test / tinkering hook
window.ND = {
  get car() { return car; }, get driver() { return driver; }, get route() { return route; }, get traffic() { return traffic; },
  get world() { return world; }, get settings() { return settings; }, setSettings, actions, IDS, begin, lab, renderer, view,
};
void flashMsg;
