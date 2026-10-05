// Seeded PRNG (mulberry32). Its whole state is a single uint32 stored on
// GameState, so saves and headless runs are deterministic.

export function rand(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(state, a, b) {
  return a + (b - a) * rand(state);
}

export function randInt(state, n) {
  return Math.floor(rand(state) * n);
}

export function pick(state, arr) {
  return arr[Math.floor(rand(state) * arr.length)];
}

// Stateless hash -> [0,1), for cosmetic per-id variation.
export function hash01(n) {
  let t = (n * 2654435761) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
