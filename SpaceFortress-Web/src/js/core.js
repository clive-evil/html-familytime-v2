// Core namespace + small utilities shared by sim (Node-testable) and browser code.
(function () {
  const SF = (globalThis.SF = globalThis.SF || {});
  SF.RES = ['metals', 'fissile', 'crystals', 'exotic'];
  SF.RES_INFO = {
    metals: { name: 'Metals', short: 'MET', color: '#c4ccd4', icon: '▰' },
    fissile: { name: 'Fissile Material', short: 'FIS', color: '#a6ff4d', icon: '☢' },
    crystals: { name: 'Energy Crystals', short: 'CRY', color: '#4fd8ff', icon: '◆' },
    exotic: { name: 'Exotic Matter', short: 'EXO', color: '#c77dff', icon: '✦' },
  };
  // Deterministic RNG whose state lives in the save game (mulberry32).
  SF.rand = function (g) {
    g.rng = (g.rng + 0x6d2b79f5) | 0;
    let t = g.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  SF.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  SF.lerp = (a, b, t) => a + (b - a) * t;
  SF.fmtInt = (n) => Math.round(n).toLocaleString('en-US');
  SF.fmtK = (n) => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(Math.round(n)));
  SF.pct = (v) => Math.round(v * 100) + '%';
  SF.costText = function (cost) {
    if (!cost) return 'free';
    return SF.RES.filter((r) => cost[r]).map((r) => cost[r] + ' ' + SF.RES_INFO[r].short).join(' · ') || 'free';
  };
})();
