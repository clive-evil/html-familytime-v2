// All live-tunable values. The debug panel (?debug=1) exposes sliders for the
// entries listed in TUNE_RANGES. Units are SI (m, s, kg, rad) unless noted.

export const TUNE = {
  // --- body ---
  mass: 80,
  gravity: 9.81,
  legMin: 0.45, // hip-to-ski distance, fully crouched (m)
  legMax: 1.05, // fully extended
  legNeutralFrac: 0.62, // leg fraction at posture y = 0
  airLegFloor: 0.55, // in the air the feet hang at least this extended (landing gear)

  // --- legs (spring/damper actuator between hip and skis) ---
  legK: 3600, // N/m base stiffness
  legKLockBoost: 1.9, // extra stiffness as the target nears full extension (locked knees)
  legCExtend: 140, // damping while extending (low = snappy pop)
  legCCompress: 950, // damping while compressing (absorption)
  pushMaxG: 2.6, // max EXTRA push from a flick (x body weight)
  pushWindow: 0.16, // s: how long a flick drives the legs
  flickFullRate: 5, // m/s of leg-target change that counts as a full-speed flick
  legActTau: 0.12, // s: how long a posture change keeps driving the legs
  absorbMaxG: 5.5, // max leg force while being compressed (eccentric strength, x weight)
  readinessBoost: 1.8, // absorbMax multiplier at full landing readiness
  legVmax: 4.0, // m/s: legs cannot push on snow receding faster than this
  kickBoostMax: 1.7, // pushing into rising snow (kicker transition) can add this much more force

  // --- posture input ---
  mouseSensY: 1 / 260, // posture units per pixel
  mouseSensX: 1 / 300,
  recenterX: 1.1, // lateral posture drift back to centre (1/s)
  recenterY: 0.0, // vertical posture recenter (0 = absolute, Foddy style)
  postureSmooth: 40, // 1/s low-pass on raw posture (removes frame jitter only)

  // --- snow / skis ---
  sidecutRadius: 13, // m, carve radius at 90deg edge (R = sidecut / sin(edge))
  maxEdge: 0.95, // rad of edge from A/D
  weightEdge: 0.35, // rad of extra edge from lateral weight
  edgeRate: 4.5, // rad/s edge change
  pivotRate: 2.2, // rad/s skidded pivot at walking speed
  gripTau: 0.035, // s, how quickly grip wants to kill lateral slip
  alignRate: 1.2, // heading drift toward travel direction (1/s) when not steering
  brakeMu: 0.32, // extra friction with S (snowplough)
  brakePivot: 1.0,
  dragStand: 0.0045, // aero k (1/m): a = k v^2
  dragTuck: 0.0019,
  tuckSteer: 0.45, // steering left in full tuck
  crouchDragMu: 0.03,
  poleAccel: 1.8, // W at low speed = skate/pole (m/s^2)
  poleSpeed: 6, // extra friction when sitting deep in the crouch

  // --- balance (0 = centred, 1 = fall) ---
  balStiff: 34, // passive boot/skill restoring stiffness
  balTopple: 50, // destabilising gravity term (b*|b|)
  balDamp: 7,
  balCtrlFore: 16, // authority of mouse Y movement over fore/aft balance
  balCtrlLat: 16, // authority of mouse X over lateral balance
  balHold: 0.35, // sustained part of the posture -> balance control
  balAdaptTau: 0.25, // s, only posture CHANGES shift your weight (high-pass)
  deepCrouchBack: 4, // constant backward push while fully crouched
  doomed: 0.85,

  // --- air ---
  airPitchK: 2.0, // rad/s^2 per unit posture (relative to airPitchNeutral)
  airPitchNeutral: -0.3, // posture that holds pitch in the air (slight knee bend)
  airPitchD: 1.6,
  airRollK: 2.4,
  airRollD: 2.0,
  airYawK: 2.0,
  airYawD: 2.2,
  weathervane: 2.0, // skis align to flight path (1/s^2)
  takeoffBalToPitch: 2.2,
  lipRotation: 0.35, // fraction of the terrain's rotation rate the lip gives you
  lipEarly: 0.16, // s: popped off the ramp this long before the lip = early
  perfectEarly: 0.16, // s: left the snow this long after the push window ended = early
  perfectLate: -0.06, // s: flick finished more than this after = late
  pushDur: 0.22, // s: typical full push (reporting only) // leaning back at takeoff -> tips-up rotation

  // --- landing ---
  landPitchKick: 8, // balance velocity per rad of pitch mismatch
  landRollKick: 7,
  edgeCatchKick: 0.45, // per m/s of sideways slip at touchdown
  rigidKick: 0.9, // per m/s of normal impact when landing with locked legs
  bottomKick: 1.0, // per m/s of bottom-out
  crashBottomOut: 5.0, // m/s of bottom-out impact that always crashes
  crashPitch: 0.95, // rad of landing pitch mismatch that always crashes
  crashYaw: 1.05, // rad of sideways landing (at speed) that crashes
  wallCrashSpeed: 6.5, // m/s into a wall/tree that crashes

  // --- camera ---
  camDist: 6.8,
  camHeight: 2.6,
  fovBase: 62,
  fovSpeed: 16,
};

// Ranges for debug sliders: [min, max, step]
export const TUNE_RANGES = {
  legK: [1500, 8000, 50],
  legCCompress: [200, 2000, 10],
  legCExtend: [20, 600, 5],
  pushMaxG: [1.5, 5, 0.05],
  absorbMaxG: [2, 9, 0.1],
  mouseSensY: [1 / 600, 1 / 120, 0.0001],
  sidecutRadius: [6, 30, 0.5],
  maxEdge: [0.3, 1.3, 0.01],
  pivotRate: [0.5, 5, 0.05],
  gripTau: [0.01, 0.15, 0.005],
  dragStand: [0.001, 0.01, 0.0001],
  dragTuck: [0.0005, 0.006, 0.0001],
  balStiff: [10, 80, 1],
  balTopple: [10, 120, 1],
  balCtrlFore: [0, 60, 1],
  balCtrlLat: [0, 60, 1],
  airPitchK: [0, 8, 0.1],
  airRollK: [0, 8, 0.1],
  weathervane: [0, 5, 0.1],
  landPitchKick: [0, 6, 0.1],
  crashBottomOut: [1, 10, 0.1],
  crashPitch: [0.4, 1.6, 0.01],
};

export function makeTune(overrides = {}) {
  return { ...TUNE, ...overrides };
}
