'use strict';
// ============================================================================
// CORE — constants, RNG, helpers, ship layout definition
// ============================================================================

const G = {};            // global game state root
window.__game = G;       // debug hook for testing

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let RNG = mulberry32(Date.now() & 0xffffffff);
const rnd = (a = 1, b) => (b === undefined ? RNG() * a : a + RNG() * (b - a));
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[Math.floor(RNG() * arr.length)];
const chance = (p) => RNG() < p;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, target, rate) => (v < target ? Math.min(target, v + rate) : Math.max(target, v - rate));
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(RNG() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function weighted(items) { // [{w, v}]
  let tot = 0; for (const it of items) tot += Math.max(0, it.w);
  if (tot <= 0) return null;
  let r = RNG() * tot;
  for (const it of items) { r -= Math.max(0, it.w); if (r <= 0) return it.v; }
  return items[items.length - 1].v;
}

// ---------------------------------------------------------------------------
// Palette (see docs/VISUAL_LANGUAGE.md)
// ---------------------------------------------------------------------------
const PAL = {
  void: '#050607', charcoal: '#0d0e0f', char2: '#16181a', grey: '#3a3b39', grey2: '#555651',
  steel: '#4a5761', steelD: '#2c343a', steelL: '#6c7a83', off: '#c9c3b2', offD: '#8e897c',
  green: '#5f6f55', greenD: '#3a4636', yellow: '#b8962e', yellowD: '#6e5a1e', red: '#a8281f', redB: '#d0392c',
  amber: '#d08a2a', lamp: '#d9cfb4', rust: '#5e3a24', grime: '#1b1a16', flesh: '#6b5a45', bio: '#7d7a4a',
};

// ---------------------------------------------------------------------------
// Ship geometry. World units ~ pixels at zoom 1.
// ---------------------------------------------------------------------------
const ROOM_H = 150, SLAB = 34;
const DECK_TOP = [0, ROOM_H + SLAB, 2 * (ROOM_H + SLAB)];
const DECK_NAME = ['DECK A', 'DECK B', 'DECK C'];
const floorY = (d) => DECK_TOP[d] + ROOM_H;
const SHIP_W = 1800;

// power groups -------------------------------------------------------------
const GROUPS = [
  { id: 'ESS', name: 'ESSENTIAL BUS', demand: 12, essential: true, desc: 'Bridge, reactor control, workshop, airlock, door controllers' },
  { id: 'LIFE', name: 'LIFE SUPPORT', demand: 24, desc: 'O2 electrolysis, scrubbers, air handlers, heating' },
  { id: 'CRYO', name: 'CRYO STASIS', demand: 26, desc: '2,400 sleeping colonists. Pods warm without power.' },
  { id: 'MED', name: 'MEDICAL', demand: 12, desc: 'Med bay, quarantine lab, diagnostics' },
  { id: 'HYD', name: 'HYDROPONICS', demand: 12, desc: 'Food growth, water reclamation loop' },
  { id: 'HAB', name: 'HABITATION', demand: 10, desc: 'Quarters, mess, recreation. Morale.' },
  { id: 'SEC', name: 'SECURITY', demand: 10, desc: 'Cameras, door locks, armoury' },
  { id: 'SENS', name: 'SENSORS', demand: 8, desc: 'Motion trackers, biomonitors, debris radar' },
];
const SHED_ORDER = ['SENS', 'HAB', 'HYD', 'SEC', 'MED', 'LIFE', 'CRYO']; // automatic breaker shedding order

// rooms ----------------------------------------------------------------------
// kind drives the art + system behaviour
const ROOM_DEFS = [
  { id: 'airlock', name: 'AIRLOCK / EVA PREP', short: 'AIRLOCK', deck: 0, x0: 0, x1: 240, group: 'ESS', dept: 'ACCESS' },
  { id: 'security', name: 'SECURITY / ARMOURY', short: 'SECURITY', deck: 0, x0: 240, x1: 580, group: 'SEC', dept: 'SECURITY' },
  { id: 'medbay', name: 'MED BAY', short: 'MED BAY', deck: 0, x0: 580, x1: 920, group: 'MED', dept: 'MEDICAL' },
  { id: 'quarantine', name: 'QUARANTINE LAB', short: 'QUARANTINE', deck: 0, x0: 920, x1: 1180, group: 'MED', dept: 'MEDICAL' },
  { id: 'bridge', name: 'BRIDGE / OPERATIONS', short: 'BRIDGE', deck: 0, x0: 1180, x1: 1800, group: 'ESS', dept: 'COMMAND' },
  { id: 'workshop', name: 'ENGINEERING WORKSHOP', short: 'WORKSHOP', deck: 1, x0: 0, x1: 420, group: 'ESS', dept: 'ENGINEERING' },
  { id: 'quarters', name: 'CREW QUARTERS', short: 'QUARTERS', deck: 1, x0: 420, x1: 820, group: 'HAB', dept: 'HABITATION' },
  { id: 'mess', name: 'MESS / RECREATION', short: 'MESS', deck: 1, x0: 820, x1: 1260, group: 'HAB', dept: 'HABITATION' },
  { id: 'hydro', name: 'HYDROPONICS', short: 'HYDRO', deck: 1, x0: 1260, x1: 1800, group: 'HYD', dept: 'LIFE SUPPORT' },
  { id: 'reactor', name: 'REACTOR', short: 'REACTOR', deck: 2, x0: 0, x1: 600, group: 'ESS', dept: 'ENGINEERING' },
  { id: 'o2', name: 'OXYGEN PROCESSING', short: 'O2 PROC', deck: 2, x0: 600, x1: 1000, group: 'LIFE', dept: 'LIFE SUPPORT' },
  { id: 'cryo', name: 'CRYOGENIC BAY 6-C', short: 'CRYO BAY', deck: 2, x0: 1000, x1: 1800, group: 'CRYO', dept: 'COLONY' },
];

// doors: horizontal (in walls) and hatches (in deck slabs) ------------------
// a/b room ids; x position; hatch: true for vertical (a above b)
const DOOR_DEFS = [
  { id: 'd_air_sec', a: 'airlock', b: 'security', x: 240 },
  { id: 'd_sec_med', a: 'security', b: 'medbay', x: 580 },
  { id: 'd_med_qua', a: 'medbay', b: 'quarantine', x: 920 },
  { id: 'd_qua_bri', a: 'quarantine', b: 'bridge', x: 1180 },
  { id: 'd_wor_qtr', a: 'workshop', b: 'quarters', x: 420 },
  { id: 'd_qtr_mes', a: 'quarters', b: 'mess', x: 820 },
  { id: 'd_mes_hyd', a: 'mess', b: 'hydro', x: 1260 },
  { id: 'd_rea_o2', a: 'reactor', b: 'o2', x: 600 },
  { id: 'd_o2_cry', a: 'o2', b: 'cryo', x: 1000 },
  { id: 'h_air_wor', a: 'airlock', b: 'workshop', x: 150, hatch: true },
  { id: 'h_med_qtr', a: 'medbay', b: 'quarters', x: 700, hatch: true },
  { id: 'h_bri_hyd', a: 'bridge', b: 'hydro', x: 1450, hatch: true },
  { id: 'h_wor_rea', a: 'workshop', b: 'reactor', x: 330, hatch: true },
  { id: 'h_mes_o2', a: 'mess', b: 'o2', x: 900, hatch: true },
  { id: 'h_hyd_cry', a: 'hydro', b: 'cryo', x: 1550, hatch: true },
  { id: 'd_outer', a: 'airlock', b: 'SPACE', x: 0, outer: true },
];

// vent network follows structural adjacency (ducts run through slabs + walls)
// vent position per room = its ceiling vent x
const VENT_X = { airlock: 90, security: 430, medbay: 820, quarantine: 1040, bridge: 1290, workshop: 250, quarters: 560, mess: 1090, hydro: 1680, reactor: 470, o2: 700, cryo: 1180 };

// time ------------------------------------------------------------------------
const GAME_MIN_PER_SEC = 2;           // 1 real second at 1× = 2 ship minutes
const ARC_LENGTH = 28 * 60;           // seconds of sim time for the full test arc
const PHASES = [
  { id: 1, name: 'ROUTINE', t: 0 },
  { id: 2, name: 'FAILURE', t: 150 },
  { id: 3, name: 'UNKNOWN', t: 420 },
  { id: 4, name: 'HORROR', t: 780 },
  { id: 5, name: 'CASCADE', t: 1140 },
];

function fmtClock(simT) {
  const totalMin = 6 * 60 + Math.floor(simT * GAME_MIN_PER_SEC); // start 06:00
  const day = 214 + Math.floor(totalMin / 1440);
  const m = totalMin % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return { day, hh, mm, hour: m / 60, str: `${hh}:${mm}` };
}
function fmtT(simT) {
  const m = Math.floor(simT / 60), s = Math.floor(simT % 60);
  return `T+${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
