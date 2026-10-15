// Dave's traits (0–100). Persistent, readable, not RNG: each trait feeds a
// specific mechanism in DaveBrain (see the "TRAIT →" comments there).

export const TRAITS = [
  ['skill', 'Driving'], ['reaction', 'Reaction'], ['confidence', 'Confidence'], ['panic', 'Panic'],
  ['attention', 'Attention'], ['obedience', 'Obedience'], ['memory', 'Memory'],
];

export const PROFILES = {
  learner: {
    name: 'LEARNER DAVE', blurb: 'Six lessons in. Means well. Listens. Mostly.',
    traits: { skill: 36, reaction: 52, confidence: 50, panic: 60, attention: 52, obedience: 82, memory: 55 },
    voice: { pitch: 1.0 }, cap: 0x2f4a6b,
  },
  nervous: {
    name: 'NERVOUS DAVE', blurb: 'Passed eventually. Would rather not be doing this.',
    traits: { skill: 55, reaction: 50, confidence: 18, panic: 86, attention: 80, obedience: 88, memory: 62 },
    voice: { pitch: 1.18 }, cap: 0x6b5a45,
  },
  cocky: {
    name: 'COCKY DAVE', blurb: 'Has driven loads. Knows a shortcut. Doesn’t need telling.',
    traits: { skill: 70, reaction: 74, confidence: 92, panic: 25, attention: 48, obedience: 32, memory: 45 },
    voice: { pitch: 0.92 }, cap: 0x7a2323,
  },
  oldhand: {
    name: 'OLD HAND DAVE', blurb: 'Forty years, no claims. The control group.',
    traits: { skill: 90, reaction: 62, confidence: 66, panic: 15, attention: 88, obedience: 72, memory: 80 },
    voice: { pitch: 0.85 }, cap: 0x3d4a3a,
  },
};

export const DEFAULT_TUNING = {
  urgencyMultiplier: 1.0,  // how much repetition/shouting raises urgency
  stressBuild: 1.0,        // stress gain from events
  stressRecovery: 1.0,     // stress recovery rate
  voiceThreshold: 0.45,    // speech confidence below this → "What?"
  aggression: 1.0,         // global speed/gap multiplier on top of confidence
  safetyOverride: 1.0,     // strength of Dave's self-preservation (0 = none)
};

export function traitsOf(profileKey, overrides) {
  return { ...PROFILES[profileKey]?.traits, ...(overrides || {}) };
}
