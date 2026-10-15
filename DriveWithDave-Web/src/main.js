// DRIVE WITH DAVE — built on the Normal Driving simulation.
// In DAVE mode the player issues commands; Dave operates the car's controls.
// DIRECT mode (lab) is the original Normal Driving control scheme, kept for regression.
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
import { DaveFigure } from './render/daveFigure.js';
import { Lab } from './ui/lab.js';
import { DaveLab } from './ui/daveLab.js';
import { Dave } from './dave/brain.js';
import { buildNav } from './dave/nav.js';
import { CMD, LABEL, parsePhrase } from './dave/commands.js';
import { PROFILES, TRAITS, DEFAULT_TUNING } from './dave/profiles.js';
import { applyDaveSettings } from './dave/settings.js';
import { Voice, voiceSupported } from './dave/voice.js';
import { saveRun, loadRuns, clearRuns, buildRun } from './dave/telemetry.js';
import { majorFailure, verdict } from './dave/outcome.js';
import { resetLines } from './dave/lines.js';

const STORE = 'drive-with-dave-settings-v1';
const DAVE_STORE = 'drive-with-dave-cfg-v1';
const SUB = 1 / 240;
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ settings
function loadSettings() {
  let s = applyPreset({ ...DEFAULT_SETTINGS, assists: { ...DEFAULT_SETTINGS.assists } }, DEFAULT_SETTINGS.preset);
  try { const raw = localStorage.getItem(STORE); if (raw) { const o = JSON.parse(raw); s = { ...s, ...o, assists: { ...s.assists, ...(o.assists || {}) } }; } } catch { /* */ }
  return s;
}
function loadDaveCfg() {
  let c = { profile: 'learner', traits: { ...PROFILES.learner.traits }, tuning: { ...DEFAULT_TUNING }, controlMode: 'dave', hints: true, voiceOut: 'mumble', commandMode: 'buttons' };
  try { const raw = localStorage.getItem(DAVE_STORE); if (raw) { const o = JSON.parse(raw); c = { ...c, ...o, traits: { ...c.traits, ...(o.traits || {}) }, tuning: { ...c.tuning, ...(o.tuning || {}) } }; } } catch { /* */ }
  if (!PROFILES[c.profile]) c.profile = 'learner';
  return c;
}
let settings = loadSettings();
let cfg = loadDaveCfg();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(settings)); localStorage.setItem(DAVE_STORE, JSON.stringify(cfg)); } catch { /* */ } };
const daveMode = () => cfg.controlMode === 'dave';
const carSettings = () => (daveMode() ? applyDaveSettings(settings, cfg.traits) : settings);

// ------------------------------------------------------------------ renderer + scene
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const SKY = 0xc4ccd2;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 70, 340);
scene.add(new THREE.HemisphereLight(0xdfe5ea, 0x56534a, 1.25));
const sun = new THREE.DirectionalLight(0xfff3e2, 0.95);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 160 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
if ('intensity' in sun.shadow) sun.shadow.intensity = 0.55;
scene.add(sun, sun.target);

const view = new View(renderer, scene);
view.mode = settings.camera;
const figure = new DaveFigure(view, PROFILES[cfg.profile].cap);
const ped = makePedestrian();
scene.add(ped);

// ------------------------------------------------------------------ simulation objects
let world, town;
function buildWorld() {
  if (town) {
    scene.remove(town.root);
    town.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); });
  }
  world = new World({ hillSteepness: settings.hillSteepness });
  town = buildTown(world, renderer);
  scene.add(town.root);
}
buildWorld();
const car = new CarSim(world, carSettings());
const driver = new Driver(carSettings());
const traffic = new Traffic(world);
const route = new Route(world);
const game = { world, car, driver, traffic, route, settings: carSettings() };
const dave = new Dave(game, { profile: cfg.profile, traits: cfg.traits, tuning: cfg.tuning });
route.daveMode = daveMode(); route.hints = cfg.hints;

const audio = new Audio();
const input = new Input(canvas, () => settings);

function applyMode() {
  const dm = daveMode();
  view.setSeat(dm ? 'passenger' : 'driver');
  figure.group.visible = dm;
  input.noLock = dm; input.daveMode = dm;
  if (dm && document.pointerLockElement) document.exitPointerLock();
  $('daveHud').hidden = !dm;
  $('gate').style.visibility = dm ? 'hidden' : '';
  route.daveMode = dm; route.hints = cfg.hints;
  const cs = carSettings();
  car.setSettings(cs); driver.setSettings(cs); game.settings = cs;
}

// ------------------------------------------------------------------ settings changes
function setSettings(s) {
  const hillChanged = s.hillSteepness !== settings.hillSteepness;
  settings = s;
  view.mode = s.camera;
  if (hillChanged) {
    const pose = { x: car.x, z: car.z, psi: car.psi };
    buildWorld();
    for (const o of [car, traffic, route, game]) o.world = world;
    dave.nav = buildNav(world);
    traffic.reset();
    car.reset(pose, true);
  }
  applyMode();
  save();
}
function setDaveCfg(c, key) {
  const modeChanged = c.controlMode !== cfg.controlMode;
  cfg = c;
  if (key === 'traits') dave.setTraits(cfg.traits);
  if (key === 'tuning') dave.tuning = { ...cfg.tuning };
  applyMode();
  save();
  if (modeChanged) startRun();
  daveLab.refresh();
}
function chooseDave(key) {
  cfg = { ...cfg, profile: key, traits: { ...PROFILES[key].traits } };
  dave.setProfile(key, cfg.traits);
  figure.setColour(PROFILES[key].cap);
  applyMode(); save();
  renderCards(); daveLab.refresh();
}

let runs = 0, restartsThisSession = 0, ended = null, runSaved = false;
function stopCarAt(pose, engineRunning) {
  car.reset(pose, false);
  driver.reset();
  if (engineRunning) { car.running = true; car.ignitionOn = true; car.omegaE = 850 / 9.549; car.sinceCatch = 5; }
}
function startRun(step = IDS.START, pose = world.poses.start, running = false) {
  if (started && !ended && route.stats.time > 5) restartsThisSession++;
  runs++;
  stopCarAt(pose, running);
  traffic.reset();
  route.reset(step);
  resetLines();
  dave.reset({ seed: runs });
  dave.setProfile(cfg.profile, cfg.traits);
  dave.tuning = { ...cfg.tuning };
  if (step !== IDS.START) {
    // teleports (lab): put Dave on the right road, engine running, waiting for GO
    dave.mode = 'drive';
    const m = dave.nav.match(pose.x, pose.z, pose.psi);
    if (m) dave.path = dave.nav.fromHere(m.e, m.pr.s);
    route.stats.started = true;
  }
  ended = null; runSaved = false;
  hideArrived();
  introT = 0; $('intro').style.opacity = daveMode() ? '1' : '0';
  applyMode();
}

const actions = {
  preset(k) { setSettings(applyPreset(settings, k)); lab.refresh(); },
  resetCar() { const p = car.lastSafe; const engine = car.running; car.reset({ x: p.x, z: p.z, psi: p.psi }, true); if (!engine) car.running = false; driver.handbrakeTarget = 1; driver.handbrake = 1; },
  resetHill() { startRun(IDS.FOLLOW, world.poses.hillBottom, true); },
  resetRoute() { startRun(); },
  teleportParking() { startRun(IDS.PARALLEL, { x: 60, z: 250.5, psi: -Math.PI / 2 }, true); },
};
const lab = new Lab($('lab'), { getSettings: () => settings, setSettings, actions });
lab.refresh();
const daveLab = new DaveLab($('lab'), {
  get: () => cfg, set: setDaveCfg, preset: (k) => chooseDave(k), dave: () => dave,
});
daveLab.refresh();

// ------------------------------------------------------------------ Dave talking
let subT = -10, heardT = -10, introT = 0;
const VOICE_PITCH = { learner: 1.0, nervous: 1.15, cocky: 0.9, oldhand: 0.82 };
dave.onSay = (s) => {
  $('subtitleText').textContent = s.text;
  $('subtitle').classList.add('show');
  subT = performance.now();
  subDur = 1500 + s.text.length * 55;
  if (cfg.voiceOut === 'mumble') audio.mumble(s.text, VOICE_PITCH[dave.personality] || 1);
  else if (cfg.voiceOut === 'tts' && window.speechSynthesis) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(s.text.replace(/[“”]/g, ''));
      u.lang = 'en-GB'; u.pitch = VOICE_PITCH[dave.personality] || 1; u.rate = dave.personality === 'nervous' ? 1.15 : 1.0;
      speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }
};
let subDur = 2500;

// ------------------------------------------------------------------ issuing commands
const URG_CLASS = (u) => (u >= 0.65 ? 'u2' : u >= 0.3 ? 'u1' : '');
function issue(cmd, meta = {}) {
  if (!daveMode() || !started || ended || !titleHidden()) return;
  const heard = dave.command(cmd, meta);
  $('heardCmd').textContent = heard.cmd ? LABEL[heard.cmd] + (heard.same > 1 ? ' ×' + heard.same : '') : '?';
  $('heardCmd').className = URG_CLASS(heard.urgency || 0);
  $('heardTranscript').textContent = meta.transcript ? `“${meta.transcript}”` : '';
  $('heard').classList.add('show');
  heardT = performance.now();
  $('intro').style.opacity = '0';
  const b = document.querySelector(`#pad button[data-cmd="${cmd}"]`);
  if (b) { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 140); }
}
for (const b of document.querySelectorAll('#pad .row:not(.ctx) button')) {
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); audio.start(); issue(b.dataset.cmd, { source: 'button' }); });
}
const ctxRow = $('ctxRow');
let ctxKey = '';
function updateContextButtons() {
  const list = [CMD.WAIT, CMD.CAREFUL, CMD.REVERSE];
  if (route.step === IDS.PARALLEL || route.step === IDS.NAN || route.step === IDS.SHUTDOWN) list.unshift(CMD.PARK);
  if (dave.mode === 'deadEnd' || route.flags.wrong || ((route.step === IDS.TURN_LEFT || route.step === IDS.TOP_TURN) && dave.tel.wrongTurns)) list.unshift(CMD.TURN_AROUND);
  if (car.speed > 3) list.push(CMD.PULL_OVER);
  else list.push(CMD.GO_FOR_IT);
  const key = list.join(',');
  if (key === ctxKey) return;
  ctxKey = key;
  ctxRow.innerHTML = '';
  const keys = { PARK: 'P', TURN_AROUND: 'T', WAIT: 'Z', CAREFUL: 'C', REVERSE: 'R', PULL_OVER: 'O', GO_FOR_IT: 'F' };
  for (const c of list.slice(0, 5)) {
    const b = document.createElement('button'); b.dataset.cmd = c; b.innerHTML = `${LABEL[c]}<kbd>${keys[c] || ''}</kbd>`;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); issue(c, { source: 'button' }); });
    ctxRow.appendChild(b);
  }
}

const KEYMAP = {
  KeyA: CMD.LEFT, ArrowLeft: CMD.LEFT, KeyD: CMD.RIGHT, ArrowRight: CMD.RIGHT, KeyX: CMD.STRAIGHT, ArrowUp: CMD.STRAIGHT,
  KeyE: CMD.FASTER, KeyQ: CMD.STOP, ArrowDown: CMD.STOP, Space: CMD.BRAKE, KeyR: CMD.REVERSE, KeyP: CMD.PARK, KeyT: CMD.TURN_AROUND,
  KeyZ: CMD.WAIT, KeyC: CMD.CAREFUL, KeyF: CMD.GO_FOR_IT, KeyO: CMD.PULL_OVER,
};
function keyCommand(code) {
  if (code === 'KeyW') return dave.hold || car.speed < 0.5 || dave.mode === 'deadEnd' ? CMD.GO : CMD.FASTER;
  if (code === 'KeyS') return car.speed < 1.8 ? CMD.STOP : CMD.SLOWER;
  return KEYMAP[code] || null;
}

// ------------------------------------------------------------------ voice
const voice = new Voice({
  onCommands: null, // set below
  onStatus: (st) => {
    const mic = $('mic');
    mic.hidden = cfg.commandMode !== 'voice';
    mic.classList.toggle('on', st === 'listening');
    $('micText').textContent = st === 'listening' ? 'LISTENING' : st === 'unsupported' ? 'VOICE NOT AVAILABLE IN THIS BROWSER' : st === 'denied' ? 'MIC BLOCKED' : st === 'off' ? 'MIC OFF (M)' : 'VOICE: ' + st.toUpperCase();
  },
});
// let issue() accept null (misheard)
const _issue = issue;
function issueAny(cmd, meta) { if (cmd === null) { if (!daveMode() || !started) return; const h = dave.command(null, meta); $('heardCmd').textContent = '?'; $('heardTranscript').textContent = meta.transcript ? `“${meta.transcript}”` : ''; $('heard').classList.add('show'); heardT = performance.now(); void h; return; } _issue(cmd, meta); }
voice.onCommands = (r) => {
  const { transcript, confidence, commands, lowConfidence } = r;
  if (lowConfidence && (!commands.length || (confidence > 0 && confidence < cfg.tuning.voiceThreshold))) { issueAny(null, { source: 'voice', transcript, lowConfidence: true }); return; }
  commands.forEach((c, i) => setTimeout(() => issueAny(c, { source: 'voice', transcript, confidence }), i * 90));
};
function setCommandMode(m) {
  cfg = { ...cfg, commandMode: m }; save();
  for (const b of document.querySelectorAll('#modeSeg button')) b.classList.toggle('on', b.dataset.mode === m);
  $('voiceNote').textContent = m === 'voice' ? (voiceSupported() ? 'Uses your browser’s speech recognition. Say “left”, “slow down”, “Dave, stop”… M toggles the mic.' : 'VOICE NOT AVAILABLE IN THIS BROWSER — buttons still work.') : 'Buttons and keys. Voice is optional.';
  $('mic').hidden = m !== 'voice';
  $('micText').textContent = voiceSupported() ? 'MIC OFF (M)' : 'VOICE NOT AVAILABLE IN THIS BROWSER';
  if (m !== 'voice') voice.stop();
}

// ------------------------------------------------------------------ title / menu
const titleEl = $('title');
const titleHidden = () => titleEl.style.display === 'none';
let started = false;
function renderCards() {
  const el = $('daveCards'); el.innerHTML = '';
  for (const [k, p] of Object.entries(PROFILES)) {
    const d = document.createElement('div');
    d.className = 'daveCard' + (cfg.profile === k ? ' on' : '');
    const tr = cfg.profile === k ? cfg.traits : p.traits;
    d.innerHTML = `<h4>${p.name}</h4><p>${p.blurb}</p><div class="st">${TRAITS.map(([t, l]) => `<span>${l}</span><b>${tr[t]}</b>`).join('')}</div>`;
    d.onclick = () => chooseDave(k);
    el.appendChild(d);
  }
}
renderCards();
for (const b of document.querySelectorAll('#modeSeg button')) b.onclick = () => setCommandMode(b.dataset.mode);
setCommandMode(cfg.commandMode);
function begin() {
  titleEl.style.display = 'none';
  document.body.classList.remove('menu');
  audio.start();
  if (!started) { started = true; startRun(); } else if (ended) startRun();
  if (cfg.commandMode === 'voice') voice.start();
  if (!daveMode()) { try { canvas.requestPointerLock(); } catch { /* */ } }
}
function showMenu() { titleEl.style.display = 'flex'; document.body.classList.add('menu'); $('startBtn').textContent = started && !ended ? 'RESTART DRIVE' : 'START DRIVE'; $('resumeHint')?.remove(); }
$('startBtn').onclick = () => { if (started && !ended && titleEl.style.display !== 'none') { startRun(); } begin(); };
$('settingsBtn').onclick = () => lab.toggle(true);
$('resultsBtn').onclick = () => showResults();

// ------------------------------------------------------------------ test results page
function showResults() {
  const runsAll = loadRuns();
  const byProf = {};
  for (const r of runsAll) (byProf[r.profile] = byProf[r.profile] || []).push(r);
  const avg = (a, k) => (a.length ? (a.reduce((s, r) => s + (+r[k] || 0), 0) / a.length).toFixed(1) : '—');
  const sum = Object.entries(byProf).map(([p, a]) => `<b>${p}</b>: ${a.length} runs, arrived ${a.filter((r) => r.outcome === 'arrived').length}, avg ${avg(a, 'duration')} s, ${avg(a, 'commandsPerMin')} cmds/min, stalls ${avg(a, 'stalls')}, avg stress ${avg(a, 'avgStress')}`).join('<br>') || 'No runs recorded yet.';
  const cols = ['when', 'profile', 'inputMode', 'outcome', 'duration', 'commands', 'commandsPerMin', 'repeated', 'shouty', 'avgUrgency', 'avgStress', 'maxStress', 'wrongTurns', 'junctionsOk', 'stalls', 'kerbs', 'collisions', 'nearMisses', 'parkingAttempts', 'parkingQuality', 'refused', 'voice', 'buttons', 'keys', 'reactionAvg', 'restarts'];
  $('resultsBody').innerHTML = `<div class="sum">${sum}</div><table><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>${runsAll.slice().reverse().map((r) => `<tr>${cols.map((c) => `<td>${c === 'when' ? r.when.slice(5, 16).replace('T', ' ') : r[c] ?? ''}</td>`).join('')}</tr>`).join('')}</table>`;
  $('results').hidden = false;
}
$('resultsClose').onclick = () => { $('results').hidden = true; };
$('resultsClear').onclick = () => { if (confirm('Clear all recorded runs?')) { clearRuns(); showResults(); } };
$('resultsCopy').onclick = () => { try { navigator.clipboard.writeText(JSON.stringify(loadRuns(), null, 1)); } catch { /* */ } };

// ------------------------------------------------------------------ end of run
const arrivedEl = $('arrived'), statsEl = $('stats');
function hideArrived() { arrivedEl.style.display = 'none'; }
function endRun(outcome) {
  if (ended) return;
  ended = outcome;
  const T = dave.tel, s = route.stats;
  const m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
  const avgStress = T.stressN ? T.stressSum / T.stressN : 0;
  if (daveMode()) {
    $('resultTitle').textContent = outcome === 'arrived' ? 'YOU ARRIVED.' : outcome === 'crash' ? 'THAT’S THE END OF THAT.' : 'DAVE’S HAD ENOUGH.';
    $('verdict').textContent = 'DAVE’S VERDICT: ' + verdict({ dave, route, outcome });
    const rows = [
      ['Arrived', outcome === 'arrived' ? 'Yes' : 'No'], ['Time', `${m}:${String(sec).padStart(2, '0')}`],
      ['Wrong turns', T.wrongTurns], ['Stalls', s.stalls], ['Near misses', T.nearMisses], ['Collisions', s.collisions], ['Kerbs hit', s.kerbHits],
      ['Dave stress (avg / max)', `${Math.round(avgStress * 100)}% / ${Math.round(T.maxStress * 100)}%`], ['Shouty commands', T.shouty],
      ['Parking', s.parkingSkipped ? 'skipped' : (T.parkingQuality || '—')], ['Commands given', T.commands],
    ];
    statsEl.innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
    if (!runSaved) {
      runSaved = true;
      saveRun(buildRun({ dave, route, profileName: cfg.profile, inputMode: cfg.commandMode, outcome, restarts: restartsThisSession }));
    }
  } else {
    $('resultTitle').textContent = 'YOU ARRIVED.'; $('verdict').textContent = '';
    statsEl.innerHTML = route.summary().map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
  }
  arrivedEl.style.display = 'flex';
}

// ------------------------------------------------------------------ keys
let tabHeld = false;
window.addEventListener('keyup', (e) => { if (e.code === 'Tab') tabHeld = false; });
input.onUiKey = (code, e) => {
  if (code === 'Tab') { tabHeld = true; e.preventDefault(); }
  if (code === 'Escape' && started && titleHidden()) { showMenu(); return; }
  if (!titleHidden()) { if (code === 'Enter') begin(); return; }
  if (ended && code === 'Enter') { startRun(); return; }
  if (!daveMode()) return;
  if (code === 'KeyV') { setSettings({ ...settings, camera: settings.camera === 'first' ? 'third' : 'first' }); lab.refresh(); return; }
  if (code === 'KeyM' && cfg.commandMode === 'voice') { if (voice.enabled) voice.stop(); else voice.start(); return; }
  if (e.repeat) return;
  const c = keyCommand(code);
  if (c) issue(c, { source: 'key' });
};

// ------------------------------------------------------------------ gamepad commands (Dave mode)
const PAD_MAP = { 14: CMD.LEFT, 15: CMD.RIGHT, 12: CMD.STRAIGHT, 13: CMD.TURN_AROUND, 0: CMD.GO, 1: CMD.STOP, 2: CMD.SLOWER, 3: CMD.FASTER, 4: CMD.WAIT, 5: CMD.BRAKE, 6: CMD.REVERSE, 7: CMD.PARK, 11: CMD.CAREFUL };
let padPrev = [];
function pollPadCommands() {
  const p = input.pad();
  if (!p) return;
  const now = p.buttons.map((b) => b.pressed || b.value > 0.5);
  for (const [i, c] of Object.entries(PAD_MAP)) {
    if (now[i] && !padPrev[i]) {
      if (!titleHidden()) { if (+i === 0) begin(); continue; }
      if (ended && +i === 0) { startRun(); continue; }
      issue(c, { source: 'pad' });
    }
  }
  padPrev = now;
}

// ------------------------------------------------------------------ HUD
const promptEl = $('prompt'), hintEl = $('hint'), msgEl = $('message'), readEl = $('readout');
const gateCv = $('gate'), gateCtx = gateCv.getContext('2d');
function keyName(codes) { return codes[0].replace('Key', '').replace('Digit', '').replace('Left', '').replace('Right', '').replace('Arrow', ''); }
function directHint(step) {
  const K = LAYOUTS[settings.keyboardLayout] || LAYOUTS.A;
  if (step === IDS.START) return `DIRECT MODE (debug): clutch ${keyName(K.clutch)}, hold ${keyName(K.ignition)}.`;
  return '';
}
function drawGate() {
  const show = settings.showGate && !daveMode();
  gateCv.style.display = show ? 'block' : 'none';
  if (!show) return;
  const c = gateCtx, W = 96;
  c.clearRect(0, 0, W, W);
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 3; c.lineCap = 'round';
  const X = (x) => W / 2 + x * 28, Y = (y) => W / 2 - y * 30;
  c.beginPath(); c.moveTo(X(-1), Y(0)); c.lineTo(X(1), Y(0));
  for (const x of [-1, 0, 1]) { c.moveTo(X(x), Y(-1)); c.lineTo(X(x), Y(1)); }
  c.stroke();
  const lv = driver.lever;
  c.fillStyle = car.gear !== 0 ? '#d9c38a' : '#f1efe8';
  c.beginPath(); c.arc(X(lv.x), Y(lv.y), 5.5, 0, Math.PI * 2); c.fill();
}
function updateHud(dt) {
  promptEl.textContent = route.step === IDS.ARRIVED ? '' : route.prompt;
  hintEl.textContent = daveMode() ? '' : directHint(route.step);
  const m = route.msg;
  if (m) {
    msgEl.querySelector('.t').textContent = m.text; msgEl.querySelector('.s').textContent = m.sub || '';
    msgEl.style.opacity = m.t > 2.2 ? String(Math.max(0, (2.6 - m.t) / 0.4)) : '1';
  } else msgEl.style.opacity = '0';
  const showRead = settings.showReadout || view.mode === 'third';
  readEl.style.display = showRead ? 'block' : 'none';
  if (showRead) readEl.innerHTML = `${(Math.abs(car.fwdSpeed) * 2.237).toFixed(0)} mph &nbsp; ${gearName(car.gear)} &nbsp; ${car.rpm.toFixed(0)} rpm<br>clutch ${Math.round(driver.clutchOut * 100)}% &nbsp; thr ${Math.round(driver.throttle * 100)}% &nbsp; brk ${Math.round(driver.brake * 100)}%`;
  drawGate();
  if (daveMode()) {
    const now = performance.now();
    $('daveName').textContent = PROFILES[cfg.profile].name;
    const st = $('stressBar'); st.style.width = `${Math.round(dave.stress * 100)}%`;
    st.style.background = dave.stress > 0.7 ? '#d0583c' : dave.stress > 0.4 ? '#d39a4a' : '#9fb38f';
    if (now - heardT > 2200) $('heard').classList.remove('show');
    if (now - subT > subDur) $('subtitle').classList.remove('show');
    introT += dt;
    if (introT > 14) $('intro').style.opacity = '0';
    if ((updateHud.k = (updateHud.k || 0) + 1) % 10 === 0) updateContextButtons();
  }
}

// ------------------------------------------------------------------ main loop
let last = performance.now(), acc = 0, fps = 60, lookYaw = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  if (window.__ND_FIXED_DT) dt = window.__ND_FIXED_DT;
  const { I, ui } = input.poll(dt);
  if (ui.debug) { lab.toggle(); daveLab.refresh(); }
  if (daveMode()) {
    pollPadCommands();
    ui.glance = tabHeld ? -1 : 0;
    if (ui.camera) { setSettings({ ...settings, camera: settings.camera === 'first' ? 'third' : 'first' }); lab.refresh(); }
  } else if (ui.camera) { setSettings({ ...settings, camera: settings.camera === 'first' ? 'third' : 'first' }); lab.refresh(); }
  const paused = !started || !titleHidden() || !$('results').hidden;
  if (paused) {
    view.sync(car, driver, settings, dt);
    view.updateCamera(dt, car, { lookDX: 0, lookDY: 0 }, settings, input);
    figure.update(dt, { steerDeg: driver.steerDeg, gear: car.gear, talking: false, reversing: false, mode: dave.mode, stress: dave.stress });
    if (!window.__ND_NORENDER) renderer.render(scene, view.camera);
    return;
  }

  // who is driving?
  const intents = daveMode() && !ended ? dave.update(dt) : I;
  if (daveMode() && ended) { intents.throttle = { analog: 0 }; intents.brake = { analog: 0.4 }; }
  const controls = driver.update(dt, intents, car);
  car.dynamics = traffic.colliders();
  acc += dt;
  let n = 0;
  while (acc >= SUB && n < 40) { car.step(SUB, controls); acc -= SUB; n++; }
  if (n >= 40) acc = 0;
  car.grinding = driver.grindHeld;

  const ctx = { car, driver, traffic, lookYaw, settings, stepId: route.step, ids: IDS, legitWait: false, daveMode: daveMode() };
  route.update(dt, ctx);
  ctx.stepId = route.step;
  traffic.update(dt, car, ctx);
  for (const e of traffic.events) if (e.type === 'horn') audio.horn(e.len);
  for (const e of car.events) audio.play(e.type, e.mag);
  if (daveMode() && !ended) {
    dave.observe(car.events, traffic.events);
    const fail = majorFailure(dave, route, car.events);
    if (fail) endRun(fail);
  }
  car.events.length = 0;
  if (route.step === IDS.ARRIVED && !ended) endRun('arrived');

  // render sync
  view.sync(car, driver, settings, dt);
  lookYaw = view.updateCamera(dt, car, ui, settings, input);
  const talking = performance.now() - subT < Math.min(subDur, 400 + ($('subtitleText').textContent.length * 55));
  figure.update(dt, { steerDeg: driver.steerDeg, gear: car.gear, talking, reversing: car.gear === -1 && car.fwdSpeed < 0.1, mode: dave.mode, stress: dave.stress, lookTurn: dave.flags.atJunction ? Math.sin(performance.now() / 700) * 0.9 : 0 });
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
    clutchAbuse: Math.min(1, Math.abs(car.clutchTorque * car.clutchSlip) / 30000), horn: !daveMode() && I.horn, inside: view.mode === 'first',
  });
  if (!window.__ND_NORENDER) { view.renderMirrors(scene, car); renderer.render(scene, view.camera); }
  updateHud(dt);
  lab.update(car, driver, { lookYaw, fps, device: input.padConnected ? `pad (${input.lastDevice})` : 'keyboard/mouse' });
  if (lab.open) daveLab.update(dave);
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
applyMode();
document.body.classList.add('menu');
$('loading').style.display = 'none';
$('menu').style.visibility = 'visible';
requestAnimationFrame(frame);

window.ND = {
  get car() { return car; }, get driver() { return driver; }, get route() { return route; }, get traffic() { return traffic; },
  get world() { return world; }, get settings() { return settings; }, get dave() { return dave; }, get cfg() { return cfg; },
  setSettings, setDaveCfg, chooseDave, actions, IDS, begin, lab, renderer, view, startRun, issue, endRun, get ended() { return ended; },
  parsePhrase, CMD,
};
