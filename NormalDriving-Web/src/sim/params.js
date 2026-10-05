// Tunables + debug presets. Everything the lab panel can change lives here.

export const CLUTCH_DIFFICULTY = {
  easy:   { biteWidth: 0.34, idleTorqueMax: 44, stallRPM: 320 },
  normal: { biteWidth: 0.20, idleTorqueMax: 30, stallRPM: 400 },
  brutal: { biteWidth: 0.11, idleTorqueMax: 18, stallRPM: 520 },
};

export const DEFAULT_SETTINGS = {
  camera: 'first',            // 'first' | 'third'
  steeringMode: 'physical',   // 'analogue' | 'physical' | 'gesture'
  steeringSpeed: 400,         // deg/s of steering-wheel rotation at full input
  steeringTurns: 3.0,         // lock-to-lock turns
  selfCentring: 'weak',       // 'none' | 'weak' | 'normal'
  clutchDifficulty: 'normal',
  bitePoint: 0.55,            // pedal travel (0 = released, 1 = floored) at centre of bite
  biteWidth: 0.20,
  clutchReturnSpeed: 1.6,     // pedal travel / s when digital clutch input released
  clutchPressSpeed: 2.6,      // pedal travel / s when digital clutch input held
  stallSensitivity: 0.5,      // 0 forgiving .. 1 touchy
  gearbox: 'button',          // 'button' | 'hpattern'
  engineTorque: 1.0,
  hillSteepness: 1.0,
  handbrakeStrength: 1.0,
  handbrakeMode: 'toggle',    // 'toggle' | 'hold'
  traffic: 'off',             // 'off' | 'light'
  lookRequirement: false,
  pedestrian: true,
  keyboardLayout: 'A',
  keyboardClutch: 'ramp',     // 'ramp' | 'wheel'
  pedalRamp: 2.4,             // keyboard throttle/brake ramp speed (/s)
  showGate: true,
  showReadout: false,
  mouseSensitivity: 1.0,
  assists: { autoRestart: false, autoClutch: false, autoGear: false, steeringReturn: false },
  preset: 'B',
};

export const PRESETS = {
  A: { label: 'A — Clutch only', settings: {
    steeringMode: 'analogue', steeringSpeed: 400, gearbox: 'button', clutchDifficulty: 'normal', biteWidth: 0.20,
    selfCentring: 'normal',
    assists: { autoRestart: false, autoClutch: false, autoGear: false, steeringReturn: false } } },
  B: { label: 'B — Clutch + physical steering', settings: {
    steeringMode: 'physical', steeringSpeed: 400, steeringTurns: 3.0, gearbox: 'button', clutchDifficulty: 'normal', biteWidth: 0.20,
    selfCentring: 'weak',
    assists: { autoRestart: false, autoClutch: false, autoGear: false, steeringReturn: false } } },
  C: { label: 'C — Full awkward', settings: {
    steeringMode: 'gesture', steeringSpeed: 400, steeringTurns: 3.2, gearbox: 'hpattern', clutchDifficulty: 'normal', biteWidth: 0.18,
    selfCentring: 'weak',
    assists: { autoRestart: false, autoClutch: false, autoGear: false, steeringReturn: false } } },
  D: { label: 'D — Accessible', settings: {
    steeringMode: 'analogue', steeringSpeed: 700, steeringTurns: 2.6, gearbox: 'button', clutchDifficulty: 'easy', biteWidth: 0.34,
    selfCentring: 'normal',
    assists: { autoRestart: true, autoClutch: true, autoGear: false, steeringReturn: true } } },
};

export function applyPreset(settings, key) {
  const p = PRESETS[key];
  if (!p) return settings;
  const s = { ...settings, ...p.settings, assists: { ...p.settings.assists }, preset: key };
  return s;
}

// Fixed vehicle constants — a tired, fictional 1.1 litre hatchback.
export const CAR = {
  mass: 930,
  yawInertia: 1300,
  a: 1.0,          // CG → front axle
  b: 1.4,          // CG → rear axle
  halfTrack: 0.68,
  cgHeight: 0.55,
  wheelR: 0.28,
  halfLen: 1.85,
  halfWidth: 0.81,
  engineInertia: 0.13,
  wheelInertia: 1.8,   // both front wheels + diff/output shaft
  idleRPM: 850,
  revLimit: 6200,
  ratios: { '-1': -3.55, 0: 0, 1: 3.45, 2: 1.95, 3: 1.36, 4: 1.03, 5: 0.82 },
  finalDrive: 4.1,
  clutchMaxTorque: 165,
  brakeForceMax: 9000,   // N, both axles, full pedal
  brakeFrontShare: 0.7,
  handbrakeForce: 2600,  // N at strength 1.0 (rear only)
  mu: 0.9,
  rollCoeff: 0.014,
  maxRoadAngle: 33,      // deg
  clutchHeatCap: 1800,   // J/°C
  clutchHotTemp: 220,
  clutchFadeTemp: 280,
};

// Torque curve at full throttle (Nm) — weak at the bottom, peaky-ish in the middle.
const CURVE = [[0, 30], [600, 44], [1000, 58], [1500, 68], [2200, 77], [3000, 84], [3600, 86], [4400, 82], [5200, 74], [6000, 62], [6600, 40]];
export function torqueCurve(rpm) {
  if (rpm <= CURVE[0][0]) return CURVE[0][1];
  for (let i = 1; i < CURVE.length; i++) {
    if (rpm <= CURVE[i][0]) {
      const [r0, t0] = CURVE[i - 1], [r1, t1] = CURVE[i];
      return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0);
    }
  }
  return CURVE[CURVE.length - 1][1];
}
