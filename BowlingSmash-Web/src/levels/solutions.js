// Known valid solutions for every level (found with tools/greedy.mjs via
// tools/solve-all.mjs, verified by tests/solutions.test.js). Shots: angle
// (deg, + = right), power 0..1, spin -1..1, optional booster.
export const SOLUTIONS = {
  1: {"shots":[{"angle":-4,"power":0.35,"spin":0}]},
  2: {"shots":[{"angle":4,"power":0.35,"spin":0}]},
  3: {"shots":[{"angle":-2,"power":0.95,"spin":0}]},
  4: {"shots":[{"angle":-2,"power":0.35,"spin":0}]},
  5: {"shots":[{"angle":0,"power":0.65,"spin":0}]},
  6: {"shots":[{"angle":24,"power":0.95,"spin":-0.5}]},
  7: {"shots":[{"angle":26,"power":0.65,"spin":1}]},
  8: {"shots":[{"angle":-20,"power":0.95,"spin":1},{"angle":-28,"power":0.35,"spin":-1}]},
  9: {"shots":[{"angle":24,"power":0.95,"spin":-1},{"angle":16,"power":0.65,"spin":-0.5}]},
  10: {"shots":[{"angle":24,"power":0.95,"spin":0.5},{"angle":20,"power":0.95,"spin":-0.5}]},
  11: {"shots":[{"angle":2,"power":0.95,"spin":0},{"angle":26,"power":0.95,"spin":0},{"angle":-12,"power":0.65,"spin":0}]},
  12: {"shots":[{"angle":10,"power":0.95,"spin":-1},{"angle":-10,"power":0.95,"spin":1},{"angle":10,"power":0.65,"spin":-0.5}]},
  13: {"shots":[{"angle":18,"power":0.95,"spin":-1},{"angle":-28,"power":0.35,"spin":-1}]},
  14: {"shots":[{"angle":20,"power":0.65,"spin":0},{"angle":20,"power":0.95,"spin":0},{"angle":28,"power":0.95,"spin":-1}]},
  15: {"shots":[{"angle":6,"power":0.65,"spin":-0.5},{"angle":22,"power":0.95,"spin":0.5},{"angle":0,"power":0.35,"spin":0},{"angle":-30,"power":0.65,"spin":1}]},
  16: {"shots":[{"angle":-2,"power":0.65,"spin":0},{"angle":22,"power":0.95,"spin":0}]},
  17: {"shots":[{"angle":0,"power":0.95,"spin":1},{"angle":4,"power":0.95,"spin":-1},{"angle":-4,"power":0.95,"spin":1}]},
  18: {"shots":[{"angle":-14,"power":0.65,"spin":1},{"angle":-6,"power":0.35,"spin":0.5}]},
  19: {"shots":[{"angle":-28,"power":0.95,"spin":0},{"angle":28,"power":0.35,"spin":0}]},
};
