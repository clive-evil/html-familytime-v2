/* Procedural comic art: Overlord characters, class hats, item icons, enemies.
 * Thick ink outlines + flat fill + one shade + one highlight. No image files.
 */
(function (root) {
  'use strict';
  const CW = (root.CW = root.CW || {});
  const INK = '#140b17';
  const Art = {};

  // ------------------------------------------------------------ colour utils
  function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(c, f) { const [r, g, b] = hex(c); const m = (v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))); return `rgb(${m(r)},${m(g)},${m(b)})`; }
  Art.shade = shade;

  // rarity → material palette for item art
  const MAT = {
    common:    { metal: '#9a9184', metalD: '#5e564c', wood: '#8a5a2b', gem: '#7d7468', cloth: '#a89a7c', glow: null },
    rare:      { metal: '#9fd0ff', metalD: '#3a78b8', wood: '#6b4022', gem: '#38a6ff', cloth: '#3c6fb0', glow: null },
    epic:      { metal: '#d7b4ff', metalD: '#7a35c4', wood: '#4a2a5a', gem: '#c45cff', cloth: '#6f2aa6', glow: '#b44dff' },
    legendary: { metal: '#ffe08a', metalD: '#c98a00', wood: '#5a2d0c', gem: '#ff5a1f', cloth: '#b8121b', glow: '#ffbf1a' },
    mythic:    { metal: '#2b1030', metalD: '#0b0410', wood: '#1c0820', gem: '#ff2fa0', cloth: '#1a0a22', glow: '#ff2fa0' },
  };
  Art.MAT = MAT;

  function fs(ctx, fill, lw = 3.2) { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2); }
  function poly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); }
  function hi(ctx, x, y, w, h) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ell(ctx, x, y, w, h, -0.5); ctx.fill(); }

  // ------------------------------------------------------------ ITEM ICONS (64x64 space)
  const WEAPON = {
    sword(c, m) { c.save(); c.rotate(-Math.PI / 4); poly(c, [[-4, -26], [4, -26], [5, 8], [0, 14], [-5, 8]]); fs(c, m.metal); c.fillStyle = m.metalD; c.fillRect(0, -24, 3, 30); rr(c, -12, 8, 24, 6, 3); fs(c, m.metalD); rr(c, -3, 14, 6, 13, 2); fs(c, m.wood); ell(c, 0, 29, 4.5, 4.5); fs(c, m.gem); c.restore(); },
    greatsword(c, m) { c.save(); c.rotate(-Math.PI / 4); poly(c, [[-7, -28], [0, -34], [7, -28], [7, 6], [-7, 6]]); fs(c, m.metal); c.fillStyle = m.metalD; c.fillRect(1, -28, 4, 32); poly(c, [[-16, 6], [16, 6], [12, 13], [-12, 13]]); fs(c, m.metalD); rr(c, -3.5, 13, 7, 14, 2); fs(c, m.wood); ell(c, 0, 0, 3.5, 3.5); fs(c, m.gem, 2); ell(c, 0, 30, 5, 5); fs(c, m.gem); c.restore(); },
    club(c, m) { c.save(); c.rotate(-Math.PI / 4); poly(c, [[-5, 28], [5, 28], [10, -22], [0, -30], [-10, -22]]); fs(c, m.wood); c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(-3, -10); c.lineTo(2, -4); c.moveTo(3, 6); c.lineTo(-1, 12); c.stroke(); poly(c, [[8, -18], [18, -22], [9, -12]]); fs(c, m.metal, 2); c.restore(); },
    axe(c, m) { c.save(); c.rotate(-Math.PI / 5); rr(c, -3, -24, 6, 52, 3); fs(c, m.wood); c.beginPath(); c.moveTo(2, -22); c.quadraticCurveTo(26, -26, 24, -4); c.quadraticCurveTo(14, -10, 2, -6); c.closePath(); fs(c, m.metal); c.beginPath(); c.moveTo(-2, -20); c.quadraticCurveTo(-16, -18, -14, -8); c.lineTo(-2, -10); c.closePath(); fs(c, m.metalD); c.restore(); },
    cleaver(c, m) { c.save(); c.rotate(-Math.PI / 4); rr(c, -9, -28, 20, 34, 3); fs(c, m.metal); ell(c, 5, -22, 2.5, 2.5); c.fillStyle = INK; c.fill(); c.fillStyle = m.metalD; c.fillRect(-7, 0, 16, 4); rr(c, -3, 6, 6, 20, 2); fs(c, m.wood); c.restore(); },
    hammer(c, m) { c.save(); c.rotate(-Math.PI / 4); rr(c, -3, -10, 6, 40, 3); fs(c, m.wood); rr(c, -16, -28, 32, 20, 4); fs(c, m.metal); c.fillStyle = m.metalD; c.fillRect(-14, -14, 28, 4); ell(c, 0, -18, 4, 4); fs(c, m.gem, 2); c.restore(); },
    bow(c, m) { c.save(); c.rotate(-Math.PI / 4); c.beginPath(); c.moveTo(-4, -28); c.quadraticCurveTo(22, 0, -4, 28); c.lineWidth = 9; c.strokeStyle = INK; c.stroke(); c.lineWidth = 5; c.strokeStyle = m.wood; c.stroke(); c.beginPath(); c.moveTo(-4, -28); c.lineTo(-4, 28); c.lineWidth = 1.5; c.strokeStyle = '#eee'; c.stroke(); rr(c, 4, -4, 6, 8, 2); fs(c, m.metal, 2); if (m.glow) { ell(c, -4, -28, 3.5, 3.5); fs(c, m.gem, 2); ell(c, -4, 28, 3.5, 3.5); fs(c, m.gem, 2); } c.restore(); },
    sling(c, m) { c.save(); c.rotate(-Math.PI / 6); c.beginPath(); c.moveTo(0, 26); c.lineTo(0, 2); c.lineTo(-12, -20); c.moveTo(0, 2); c.lineTo(12, -20); c.lineWidth = 9; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke(); c.lineWidth = 5; c.strokeStyle = m.wood; c.stroke(); c.beginPath(); c.moveTo(-12, -20); c.quadraticCurveTo(0, -6, 12, -20); c.lineWidth = 2; c.strokeStyle = '#c2a37a'; c.stroke(); c.restore(); },
    crossbow(c, m) { c.save(); c.rotate(-Math.PI / 4); rr(c, -4, -18, 8, 46, 3); fs(c, m.wood); c.beginPath(); c.moveTo(-24, -6); c.quadraticCurveTo(0, -24, 24, -6); c.lineWidth = 8; c.strokeStyle = INK; c.stroke(); c.lineWidth = 4; c.strokeStyle = m.metal; c.stroke(); c.beginPath(); c.moveTo(-24, -6); c.lineTo(0, 4); c.lineTo(24, -6); c.lineWidth = 1.5; c.strokeStyle = '#eee'; c.stroke(); poly(c, [[0, -26], [3, -18], [-3, -18]]); fs(c, m.metalD, 2); c.restore(); },
    wand(c, m) { c.save(); c.rotate(-Math.PI / 4); rr(c, -3, -20, 6, 46, 3); fs(c, m.wood); c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-2, 0); c.lineTo(2, 5); c.stroke(); poly(c, [[0, -32], [6, -22], [0, -18], [-6, -22]]); fs(c, m.gem); hi(c, -1, -25, 1.5, 3); c.restore(); },
    stick(c, m) { c.save(); c.rotate(-Math.PI / 4); c.beginPath(); c.moveTo(0, 28); c.lineTo(2, 4); c.lineTo(-3, -10); c.lineTo(1, -28); c.lineWidth = 8; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke(); c.lineWidth = 4.5; c.strokeStyle = m.wood; c.stroke(); c.beginPath(); c.moveTo(-1, -6); c.lineTo(-9, -14); c.lineWidth = 6; c.strokeStyle = INK; c.stroke(); c.lineWidth = 3; c.strokeStyle = m.wood; c.stroke(); ell(c, 2, -18, 4, 2.5, 0.6); fs(c, '#7bc142', 1.5); c.restore(); },
    staff(c, m) { c.save(); c.rotate(-Math.PI / 4); rr(c, -3, -18, 6, 48, 3); fs(c, m.wood); c.beginPath(); c.arc(0, -24, 11, Math.PI * 0.85, Math.PI * 2.15); c.lineWidth = 8; c.strokeStyle = INK; c.stroke(); c.lineWidth = 4; c.strokeStyle = m.metal; c.stroke(); if (m.glow) { c.fillStyle = m.glow; c.globalAlpha = 0.35; ell(c, 0, -24, 14, 14); c.fill(); c.globalAlpha = 1; } ell(c, 0, -24, 7, 7); fs(c, m.gem); hi(c, -2, -26, 2, 3); c.restore(); },
    skullstaff(c, m) { c.save(); c.rotate(-Math.PI / 4); rr(c, -3, -14, 6, 44, 3); fs(c, m.wood); ell(c, 0, -22, 11, 10); fs(c, '#efe6cf'); c.fillStyle = INK; ell(c, -4, -23, 3, 3.5); c.fill(); ell(c, 4, -23, 3, 3.5); c.fill(); c.fillRect(-4, -15, 8, 2); if (m.glow) { c.fillStyle = m.gem; ell(c, -4, -23, 1.5, 1.5); c.fill(); ell(c, 4, -23, 1.5, 1.5); c.fill(); } c.restore(); },
    orb(c, m) { c.save(); rr(c, -12, 14, 24, 10, 4); fs(c, m.metalD); poly(c, [[-8, 14], [8, 14], [5, 8], [-5, 8]]); fs(c, m.metal); if (m.glow) { c.fillStyle = m.glow; c.globalAlpha = 0.35; ell(c, 0, -6, 22, 22); c.fill(); c.globalAlpha = 1; } ell(c, 0, -6, 15, 15); fs(c, m.gem); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-6, -2); c.lineTo(0, -12); c.lineTo(2, -4); c.lineTo(7, -10); c.stroke(); hi(c, -6, -12, 3, 5); c.restore(); },
    tome(c, m) { c.save(); c.rotate(-0.15); rr(c, -18, -20, 36, 40, 4); fs(c, m.cloth); c.fillStyle = '#f1e7cf'; c.fillRect(-15, 14, 32, 4); c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(-15, 14, 32, 4); ell(c, 0, -2, 8, 8); fs(c, m.metal, 2.5); c.fillStyle = m.gem; ell(c, 0, -2, 3.5, 3.5); c.fill(); rr(c, -18, -20, 6, 40, 2); fs(c, m.metalD, 2); c.restore(); },
    dagger(c, m) { const one = (dx, rot) => { c.save(); c.translate(dx, 0); c.rotate(rot); poly(c, [[-4, -22], [0, -30], [4, -22], [3, 4], [-3, 4]]); fs(c, m.metal, 2.6); rr(c, -8, 4, 16, 4, 2); fs(c, m.metalD, 2.4); rr(c, -2.5, 8, 5, 12, 2); fs(c, m.wood, 2.4); c.restore(); }; one(-6, -0.5); one(8, 0.45); },
    sickle(c, m) { c.save(); c.rotate(-0.4); c.beginPath(); c.arc(6, -6, 18, Math.PI * 1.05, Math.PI * 1.85); c.lineWidth = 10; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke(); c.lineWidth = 5; c.strokeStyle = m.metal; c.stroke(); rr(c, -14, -2, 7, 26, 3); fs(c, m.wood); c.restore(); },
    shield(c, m) { c.beginPath(); c.moveTo(0, -28); c.quadraticCurveTo(22, -24, 24, -18); c.quadraticCurveTo(24, 10, 0, 28); c.quadraticCurveTo(-24, 10, -24, -18); c.quadraticCurveTo(-22, -24, 0, -28); fs(c, m.metal); c.beginPath(); c.moveTo(0, -20); c.quadraticCurveTo(14, -18, 16, -14); c.quadraticCurveTo(15, 6, 0, 19); c.quadraticCurveTo(-15, 6, -16, -14); c.quadraticCurveTo(-14, -18, 0, -20); c.fillStyle = m.cloth; c.fill(); ell(c, 0, -2, 6, 6); fs(c, m.gem, 2.4); c.fillStyle = INK; [[-18, -16], [18, -16], [0, 22]].forEach(([x, y]) => { ell(c, x, y, 1.8, 1.8); c.fill(); }); },
    shovel(c, m) { c.save(); c.rotate(-Math.PI / 4); rr(c, -3, -14, 6, 40, 3); fs(c, m.wood); c.beginPath(); c.moveTo(-10, -14); c.lineTo(10, -14); c.quadraticCurveTo(12, -30, 0, -34); c.quadraticCurveTo(-12, -30, -10, -14); fs(c, m.metal); rr(c, -8, 24, 16, 5, 2); fs(c, m.wood, 2.4); c.restore(); },
    lantern(c, m) { c.beginPath(); c.arc(0, -24, 7, Math.PI, 0); c.lineWidth = 5; c.strokeStyle = INK; c.stroke(); c.lineWidth = 2.5; c.strokeStyle = m.metal; c.stroke(); rr(c, -14, -18, 28, 6, 2); fs(c, m.metalD, 2.5); rr(c, -11, -12, 22, 26, 3); fs(c, 'rgba(255,214,102,0.9)'); c.fillStyle = m.gem; ell(c, 0, 1, 5, 8); c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(-4, -12); c.lineTo(-4, 14); c.moveTo(4, -12); c.lineTo(4, 14); c.stroke(); rr(c, -14, 14, 28, 6, 2); fs(c, m.metalD, 2.5); },
    scythe(c, m) { c.save(); c.rotate(-0.25); rr(c, -3, -26, 6, 56, 3); fs(c, m.wood); c.beginPath(); c.moveTo(0, -24); c.quadraticCurveTo(-30, -30, -28, -2); c.quadraticCurveTo(-20, -18, 0, -16); c.closePath(); fs(c, m.metal); c.restore(); },
    candle(c, m) { c.save(); c.rotate(-Math.PI / 6); rr(c, -3, -4, 6, 32, 3); fs(c, m.wood); rr(c, -10, -8, 20, 5, 2); fs(c, m.metalD, 2.4); rr(c, -5, -24, 10, 16, 2); fs(c, '#f4ead1', 2.4); c.beginPath(); c.moveTo(0, -36); c.quadraticCurveTo(7, -28, 0, -24); c.quadraticCurveTo(-7, -28, 0, -36); fs(c, '#ffb22e', 2); c.restore(); },
    mace(c, m) { c.save(); c.rotate(-Math.PI / 4); rr(c, -3, -8, 6, 36, 3); fs(c, m.wood); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; poly(c, [[Math.cos(a) * 9, -20 + Math.sin(a) * 9], [Math.cos(a + 0.25) * 16, -20 + Math.sin(a + 0.25) * 16], [Math.cos(a + 0.5) * 9, -20 + Math.sin(a + 0.5) * 9]]); fs(c, m.metalD, 2); } ell(c, 0, -20, 11, 11); fs(c, m.metal); c.restore(); },
    bell(c, m) { c.beginPath(); c.moveTo(-20, 16); c.quadraticCurveTo(-16, 10, -14, -6); c.quadraticCurveTo(-12, -24, 0, -24); c.quadraticCurveTo(12, -24, 14, -6); c.quadraticCurveTo(16, 10, 20, 16); c.closePath(); fs(c, m.metal); rr(c, -21, 14, 42, 6, 3); fs(c, m.metalD, 2.5); ell(c, 0, 24, 5, 5); fs(c, m.gem, 2.4); rr(c, -4, -30, 8, 7, 2); fs(c, m.metalD, 2.4); hi(c, -7, -10, 2.5, 7); },
    bottle(c, m) { c.save(); c.rotate(0.6); c.beginPath(); c.moveTo(-9, 26); c.lineTo(-9, -2); c.quadraticCurveTo(-9, -10, -4, -12); c.lineTo(-4, -18); c.lineTo(-8, -22); c.lineTo(-2, -24); c.lineTo(1, -20); c.lineTo(5, -26); c.lineTo(4, -12); c.quadraticCurveTo(9, -10, 9, -2); c.lineTo(9, 26); c.closePath(); fs(c, m.glow ? m.gem : '#5c8d3a'); rr(c, -9, 4, 18, 12, 1); fs(c, '#efe0b8', 2); hi(c, -5, -2, 1.5, 5); c.restore(); },
    knuckles(c, m) { rr(c, -22, -8, 44, 16, 7); fs(c, m.metal); for (let i = 0; i < 4; i++) { ell(c, -15 + i * 10, -8, 5, 5); fs(c, m.metalD, 2.4); poly(c, [[-18 + i * 10, -12], [-15 + i * 10, -22], [-12 + i * 10, -12]]); fs(c, m.metal, 2); } rr(c, -18, 6, 36, 10, 5); fs(c, m.metalD, 2.6); },
  };
  const GEARART = {
    tunic(c, m) { poly(c, [[-12, -24], [12, -24], [24, -14], [18, -2], [14, -6], [14, 24], [-14, 24], [-14, -6], [-18, -2], [-24, -14]]); fs(c, m.cloth); c.beginPath(); c.moveTo(-6, -24); c.lineTo(0, -16); c.lineTo(6, -24); c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke(); c.fillStyle = shade(m.cloth, -0.3); c.fillRect(-13, 8, 26, 4); },
    sandals(c, m) { const one = (dx) => { ell(c, dx, 4, 9, 20); fs(c, '#b07a45'); c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(dx - 8, -6); c.lineTo(dx + 8, 2); c.moveTo(dx + 8, -6); c.lineTo(dx - 8, 2); c.stroke(); }; one(-11); one(11); },
    helm(c, m) { c.beginPath(); c.moveTo(-20, 18); c.lineTo(-18, -10); c.quadraticCurveTo(0, -30, 18, -10); c.lineTo(20, 18); c.closePath(); fs(c, m.metal); rr(c, -14, -2, 28, 6, 2); c.fillStyle = INK; c.fill(); c.strokeStyle = m.metalD; c.lineWidth = 3; c.beginPath(); c.moveTo(-20, 12); c.lineTo(20, 12); c.stroke(); rr(c, -6, -26, 12, 6, 2); fs(c, m.metalD, 2.4); },
    plate(c, m) { c.beginPath(); c.moveTo(-14, -24); c.lineTo(14, -24); c.quadraticCurveTo(28, -22, 26, -6); c.lineTo(16, -6); c.lineTo(14, 22); c.quadraticCurveTo(0, 28, -14, 22); c.lineTo(-16, -6); c.lineTo(-26, -6); c.quadraticCurveTo(-28, -22, -14, -24); fs(c, m.metal); c.strokeStyle = m.metalD; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -20); c.lineTo(0, 22); c.moveTo(-12, 4); c.lineTo(12, 4); c.stroke(); ell(c, 0, -8, 5, 5); fs(c, m.gem, 2.2); hi(c, -8, -14, 2.5, 5); if (m.glow) { for (const x of [-22, 22]) { poly(c, [[x - 4, -10], [x, -20], [x + 4, -10]]); fs(c, m.metalD, 2); } } },
    boots(c, m) { const one = (dx) => { c.beginPath(); c.moveTo(dx - 6, -20); c.lineTo(dx + 5, -20); c.lineTo(dx + 6, 10); c.lineTo(dx + 14, 14); c.lineTo(dx + 14, 22); c.lineTo(dx - 7, 22); c.closePath(); fs(c, m.cloth); poly(c, [[dx - 6, -16], [dx - 18, -24], [dx - 12, -12], [dx - 20, -12], [dx - 6, -6]]); fs(c, '#ffffff', 2.4); }; one(-6); one(12); },
    cloak(c, m) { c.beginPath(); c.moveTo(-8, -26); c.lineTo(8, -26); c.quadraticCurveTo(26, 0, 22, 26); c.lineTo(10, 20); c.lineTo(0, 26); c.lineTo(-10, 20); c.lineTo(-22, 26); c.quadraticCurveTo(-26, 0, -8, -26); fs(c, m.cloth); c.beginPath(); c.moveTo(-8, -24); c.quadraticCurveTo(0, 6, 8, -24); c.fillStyle = '#9b111e'; c.fill(); c.stroke(); ell(c, 0, -22, 5, 4); fs(c, m.gem, 2.2); },
    robe(c, m) { poly(c, [[-10, -26], [10, -26], [16, -12], [24, 26], [-24, 26], [-16, -12]]); fs(c, m.cloth); c.fillStyle = m.metal; c.fillRect(-3, -24, 6, 50); c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(-3, -24, 6, 50); for (const [x, y] of [[-12, 4], [12, 14], [-8, 18]]) { c.fillStyle = m.gem; c.beginPath(); c.arc(x, y, 2.5, 0, Math.PI * 2); c.fill(); } },
    crown(c, m) { poly(c, [[-24, 16], [-24, -12], [-12, 0], [0, -22], [12, 0], [24, -12], [24, 16]]); fs(c, m.metal); rr(c, -24, 10, 48, 8, 2); fs(c, m.metalD, 2.6); for (const x of [-12, 0, 12]) { ell(c, x, 6, 3.5, 3.5); fs(c, m.gem, 2); } ell(c, 0, -22, 3, 3); fs(c, m.gem, 2); hi(c, -14, -2, 2, 4); },
  };

  const iconCache = new Map();
  function makeCanvas(w, h) {
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    return null;
  }

  // Draw an item/kind into ctx centered at (0,0) in a 64 box.
  Art.drawItem = function (ctx, kind, rarity, offscreen) {
    const m = MAT[rarity] || MAT.common;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (m.glow) { ctx.save(); ctx.shadowColor = m.glow; ctx.shadowBlur = rarity === 'mythic' ? 16 : 10; }
    (WEAPON[kind] || GEARART[kind] || WEAPON.stick)(ctx, m);
    if (m.glow) ctx.restore();
    if (rarity === 'mythic' && offscreen) { ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(255,47,160,0.18)'; ctx.fillRect(-32, -32, 64, 64); ctx.restore(); }
  };

  Art.icon = function (kind, rarity, size = 72) {
    const key = kind + '|' + rarity + '|' + size;
    if (iconCache.has(key)) return iconCache.get(key);
    const c = makeCanvas(size, size);
    if (!c) return '';
    const ctx = c.getContext('2d');
    ctx.translate(size / 2, size / 2);
    ctx.scale(size / 72, size / 72);
    Art.drawItem(ctx, kind, rarity, true);
    const url = c.toDataURL();
    iconCache.set(key, url);
    return url;
  };

  // ------------------------------------------------------------ OVERLORD
  // (x,y) = feet. s = scale (1 ≈ 70px tall). pose fields all optional.
  Art.drawOverlord = function (ctx, x, y, s, look, pose = {}) {
    look = look || CW.HUMAN_PROFILE.look;
    const t = pose.t || 0;
    const em = pose.emote || null;
    const ep = pose.emoteT || 0; // 0..1 progress
    const face = pose.face || 1;
    let bob = Math.sin(t * 3 + (pose.seed || 0)) * 1.5;
    let jump = 0, shake = 0, squash = 1, armL = 0.3, armR = 0.3, tint = null;
    if (em === 'cheer') { jump = Math.abs(Math.sin(ep * Math.PI * 3)) * 14; armL = armR = -2.2; }
    if (em === 'shock') { jump = Math.max(0, Math.sin(ep * Math.PI)) * 8; armL = armR = -1.4; }
    if (em === 'angry') { shake = Math.sin(t * 50) * 2; tint = 'rgba(255,40,40,0.35)'; armL = armR = -0.6; }
    if (em === 'laugh') { shake = Math.sin(t * 30) * 1.5; squash = 1 + Math.sin(t * 30) * 0.05; armL = 0.9; armR = -0.4; }
    if (em === 'panic') { shake = Math.sin(t * 60) * 2.5; armL = armR = -2.6 + Math.sin(t * 25) * 0.4; }
    if (em === 'sad') { bob -= 3; squash = 0.92; armL = armR = 0.9; tint = 'rgba(60,90,200,0.22)'; }
    if (em === 'taunt') { armR = -2.4 + Math.sin(t * 16) * 0.4; jump = Math.abs(Math.sin(t * 8)) * 3; }
    if (em === 'sneak') { squash = 0.86; armL = armR = -0.2; }
    if (em === 'cast') { armR = -2.5; }
    if (pose.walk) { bob = Math.abs(Math.sin(t * 10)) * -3; }
    if (pose.lunge) jump += pose.lunge * 10;
    if (pose.dead) { ctx.save(); ctx.globalAlpha = 0.35; }

    ctx.save();
    ctx.translate(x + shake, y);
    ctx.scale(s * face, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ell(ctx, 0, 0, 22 - jump * 0.4, 6); ctx.fill();
    ctx.translate(0, -jump + bob * 0.5);
    ctx.scale(1 / squash, squash);
    const body = look.body, belly = look.belly, bodyD = shade(body, -0.35);
    // legs
    const step = pose.walk ? Math.sin(t * 10) * 4 : 0;
    rr(ctx, -13, -12 + step * 0.3, 10, 13, 4); fs(ctx, bodyD, 3);
    rr(ctx, 3, -12 - step * 0.3, 10, 13, 4); fs(ctx, bodyD, 3);
    // back arm
    drawArm(ctx, -19, -30, armL, bodyD, true);
    // gear underlayer (cloak) behind body
    if (pose.gearKind === 'cloak') { ctx.beginPath(); ctx.moveTo(-18, -44); ctx.quadraticCurveTo(-30, -10, -22, -6); ctx.lineTo(22, -6); ctx.quadraticCurveTo(30, -10, 18, -44); fs(ctx, MAT[pose.gearRarity || 'common'].cloth); }
    // body
    ell(ctx, 0, -28, 21, 20); fs(ctx, body, 3.4);
    ell(ctx, 2, -24, 13, 12); ctx.fillStyle = belly; ctx.fill();
    if (pose.gearKind && pose.gearKind !== 'cloak' && pose.gearKind !== 'crown' && pose.gearKind !== 'helm' && pose.gearKind !== 'sandals' && pose.gearKind !== 'boots') drawArmour(ctx, pose.gearKind, pose.gearRarity);
    // head (big)
    ctx.save();
    ctx.translate((pose.look || 0) * 2, 0);
    drawHorns(ctx, look.horns, body, bodyD, pose.hat);
    ell(ctx, 0, -56, 22, 19); fs(ctx, body, 3.4);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ell(ctx, -9, -66, 6, 3.5, -0.4); ctx.fill();
    drawFace(ctx, look, em, t, pose.look || 0, pose.hat);
    drawExtra(ctx, look.extra);
    if (pose.hat) drawHat(ctx, pose.hat, pose.heroRarity);
    else if (pose.gearKind === 'crown') { ctx.save(); ctx.translate(0, -78); ctx.scale(0.45, 0.45); GEARART.crown(ctx, MAT[pose.gearRarity || 'legendary']); ctx.restore(); }
    else if (pose.gearKind === 'helm') { ctx.save(); ctx.translate(0, -70); ctx.scale(0.62, 0.5); GEARART.helm(ctx, MAT[pose.gearRarity || 'common']); ctx.restore(); }
    ctx.restore();
    if (tint) { ctx.fillStyle = tint; ell(ctx, 0, -42, 24, 40); ctx.fill(); }
    // front arm + weapon
    drawArm(ctx, 19, -30, armR, body, false, pose.weaponKind, pose.weaponRarity);
    ctx.restore();
    if (pose.dead) ctx.restore();

    // emote glyphs (not mirrored)
    if (em && !pose.dead) drawEmoteGlyph(ctx, x, y - (78 + jump) * s, s, em, t);
  };

  function drawArm(ctx, ax, ay, ang, col, back, weaponKind, weaponRarity) {
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang * (back ? -1 : 1) * 0.6 + (back ? 0.3 : -0.3));
    if (weaponKind && !back) {
      ctx.save(); ctx.translate(4, 14); ctx.rotate(0.5); ctx.scale(0.5, 0.5);
      Art.drawItem(ctx, weaponKind, weaponRarity || 'common');
      ctx.restore();
    }
    rr(ctx, -5, -2, 10, 18, 5); fs(ctx, col, 3);
    ctx.restore();
  }

  function drawHorns(ctx, type, body, bodyD, hat) {
    if (hat === 'bucket' || hat === 'hood' || hat === 'skullhood') return;
    const horn = '#f3e6c8';
    switch (type) {
      case 'curl':
        for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 12, -70); ctx.quadraticCurveTo(sx * 34, -84, sx * 30, -62); ctx.quadraticCurveTo(sx * 26, -56, sx * 22, -64); ctx.closePath(); fs(ctx, horn, 3); }
        break;
      case 'spike':
        for (const sx of [-1, 1]) { poly(ctx, [[sx * 8, -70], [sx * 20, -96], [sx * 18, -66]]); fs(ctx, horn, 3); }
        break;
      case 'nub':
        for (const sx of [-1, 1]) { ell(ctx, sx * 13, -73, 5, 6); fs(ctx, horn, 3); }
        break;
      case 'ears':
        for (const sx of [-1, 1]) { poly(ctx, [[sx * 14, -66], [sx * 36, -78], [sx * 20, -54]]); fs(ctx, body, 3); poly(ctx, [[sx * 18, -64], [sx * 30, -73], [sx * 21, -58]]); ctx.fillStyle = '#ff9aa8'; ctx.fill(); }
        break;
      case 'antenna':
        for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 7, -72); ctx.quadraticCurveTo(sx * 10, -88, sx * 18, -92); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(); ell(ctx, sx * 18, -93, 4.5, 4.5); fs(ctx, '#ffe66d', 2.5); }
        break;
    }
  }

  function drawFace(ctx, look, em, t, lk, hat) {
    const eyesHidden = hat === 'bucket';
    const blink = Math.sin(t * 1.3 + look.body.length) > 0.985;
    if (!eyesHidden) {
      const ey = -59, ex = 8.5;
      const big = em === 'shock' || em === 'panic' ? 1.3 : 1;
      if (look.eyes === 'cool' && em !== 'shock') {
        rr(ctx, -19, ey - 6, 38, 11, 4); ctx.fillStyle = INK; ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-15, ey - 4, 6, 2); ctx.fillRect(4, ey - 4, 6, 2);
      } else {
        for (const sx of [-1, 1]) {
          const cx = sx * ex;
          if (blink || em === 'laugh') { ctx.beginPath(); ctx.moveTo(cx - 5, ey); ctx.quadraticCurveTo(cx, ey - 5, cx + 5, ey); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(); continue; }
          ell(ctx, cx, ey, 6.5 * big, 7.5 * big); fs(ctx, '#ffffff', 2.6);
          const px = cx + lk * 2.5 + (look.eyes === 'shifty' ? Math.sin(t * 2) * 2 : 0);
          ctx.fillStyle = INK; ell(ctx, px, ey + 1, 3 * (em === 'shock' ? 0.7 : 1), 3.6 * (em === 'shock' ? 0.7 : 1)); ctx.fill();
          ctx.fillStyle = '#fff'; ell(ctx, px - 1, ey - 0.5, 1, 1); ctx.fill();
          if (look.eyes === 'shifty') { ctx.fillStyle = look.body; ctx.fillRect(cx - 7, ey - 9, 14, 6); ctx.beginPath(); ctx.moveTo(cx - 7, ey - 3); ctx.lineTo(cx + 7, ey - 3); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke(); }
        }
        // brows
        ctx.lineWidth = 3.2; ctx.strokeStyle = INK;
        const angry = look.eyes === 'angry' || em === 'angry';
        const worried = look.eyes === 'worried' || em === 'sad' || em === 'panic';
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          if (angry) { ctx.moveTo(sx * 15, ey - 12); ctx.lineTo(sx * 3, ey - 7); }
          else if (worried) { ctx.moveTo(sx * 15, ey - 8); ctx.lineTo(sx * 4, ey - 13); }
          else { ctx.moveTo(sx * 14, ey - 11); ctx.lineTo(sx * 4, ey - 12); }
          ctx.stroke();
        }
      }
    }
    // mouth
    const my = -46;
    ctx.lineWidth = 3; ctx.strokeStyle = INK;
    const mouth = em === 'laugh' || em === 'cheer' || em === 'shock' || em === 'panic' ? 'open' : em === 'sad' ? 'frown' : look.mouth;
    switch (mouth) {
      case 'grin': case 'teeth':
        ctx.beginPath(); ctx.moveTo(-11, my - 2); ctx.quadraticCurveTo(0, my + 9, 11, my - 2); ctx.closePath(); fs(ctx, '#fff', 2.6);
        ctx.beginPath(); for (let i = -6; i <= 6; i += 4) { ctx.moveTo(i, my - 1); ctx.lineTo(i, my + 3); } ctx.lineWidth = 1.6; ctx.stroke();
        break;
      case 'fangs':
        ctx.beginPath(); ctx.moveTo(-10, my - 1); ctx.quadraticCurveTo(0, my + 5, 10, my - 1); ctx.stroke();
        poly(ctx, [[-7, my], [-5, my + 6], [-3, my + 1]]); fs(ctx, '#fff', 1.8); poly(ctx, [[3, my + 1], [5, my + 6], [7, my]]); fs(ctx, '#fff', 1.8);
        break;
      case 'smirk':
        ctx.beginPath(); ctx.moveTo(-8, my); ctx.quadraticCurveTo(2, my + 4, 10, my - 4); ctx.stroke();
        break;
      case 'wobble':
        ctx.beginPath(); ctx.moveTo(-8, my); for (let i = -8; i <= 8; i += 4) ctx.lineTo(i + 2, my + (i % 8 === 0 ? 2 : -2)); ctx.stroke();
        break;
      case 'frown':
        ctx.beginPath(); ctx.moveTo(-8, my + 3); ctx.quadraticCurveTo(0, my - 4, 8, my + 3); ctx.stroke();
        break;
      default: // open
        ell(ctx, 0, my + 1, 8, 7); fs(ctx, '#5a0f1f', 2.6); ell(ctx, 0, my + 4, 4.5, 2.5); ctx.fillStyle = '#ff6b81'; ctx.fill();
    }
  }

  function drawExtra(ctx, extra) {
    switch (extra) {
      case 'gold': ctx.beginPath(); ctx.arc(0, -40, 16, 0.2 * Math.PI, 0.8 * Math.PI); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#ffd23f'; ctx.stroke(); ell(ctx, 0, -24, 4.5, 4.5); fs(ctx, '#ffd23f', 2); break;
      case 'bandage': ctx.save(); ctx.translate(12, -66); ctx.rotate(0.6); rr(ctx, -8, -3, 16, 6, 2); fs(ctx, '#f6d7b0', 2); ctx.restore(); break;
      case 'whiskers': ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.beginPath(); for (const sx of [-1, 1]) for (const dy of [-2, 2]) { ctx.moveTo(sx * 12, -50 + dy); ctx.lineTo(sx * 26, -51 + dy * 2.5); } ctx.stroke(); break;
      case 'curlers': for (const [cx, cy] of [[-12, -74], [0, -77], [12, -74]]) { rr(ctx, cx - 4, cy - 3, 8, 7, 3); fs(ctx, '#7fd1ff', 2); } break;
      case 'nosering': ctx.beginPath(); ctx.arc(0, -50, 3.5, 0.1, Math.PI - 0.1); ctx.lineWidth = 2; ctx.strokeStyle = '#ffd23f'; ctx.stroke(); break;
    }
  }

  // Class hats — read the class from silhouette alone.
  function drawHat(ctx, hat, rarity) {
    const m = MAT[rarity || 'common'];
    switch (hat) {
      case 'hornhelm':
        ctx.beginPath(); ctx.moveTo(-23, -58); ctx.quadraticCurveTo(-22, -82, 0, -82); ctx.quadraticCurveTo(22, -82, 23, -58); ctx.closePath(); fs(ctx, m.metal);
        for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 18, -72); ctx.quadraticCurveTo(sx * 40, -78, sx * 38, -100); ctx.quadraticCurveTo(sx * 30, -84, sx * 14, -80); ctx.closePath(); fs(ctx, '#f3e6c8', 3); }
        rr(ctx, -24, -62, 48, 7, 3); fs(ctx, m.metalD, 2.8); break;
      case 'hood':
        ctx.beginPath(); ctx.moveTo(-26, -44); ctx.quadraticCurveTo(-30, -88, 6, -90); ctx.quadraticCurveTo(26, -84, 26, -44); ctx.quadraticCurveTo(18, -70, 0, -72); ctx.quadraticCurveTo(-18, -70, -26, -44); fs(ctx, '#2e8b57');
        ctx.beginPath(); ctx.moveTo(14, -84); ctx.quadraticCurveTo(36, -104, 30, -78); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(); poly(ctx, [[18, -86], [36, -108], [28, -80]]); fs(ctx, m.gem === '#7d7468' ? '#d64545' : m.gem, 2.4); break;
      case 'wizard':
        ctx.beginPath(); ctx.moveTo(-28, -66); ctx.quadraticCurveTo(0, -60, 28, -66); ctx.quadraticCurveTo(0, -76, -28, -66); fs(ctx, '#4b2a9a');
        ctx.beginPath(); ctx.moveTo(-16, -68); ctx.quadraticCurveTo(-4, -96, 10, -118); ctx.quadraticCurveTo(12, -96, 16, -68); fs(ctx, '#5b35b8');
        ctx.fillStyle = m.gem; for (const [sx, sy] of [[-4, -80], [6, -92]]) { ctx.beginPath(); ctx.arc(sx, sy, 2.6, 0, Math.PI * 2); ctx.fill(); } break;
      case 'mask':
        rr(ctx, -24, -66, 48, 12, 5); fs(ctx, '#1c2333', 3);
        for (const sx of [-1, 1]) { ell(ctx, sx * 9, -60, 4.5, 3); ctx.fillStyle = '#fff'; ctx.fill(); }
        poly(ctx, [[20, -64], [34, -70], [32, -58]]); fs(ctx, '#1c2333', 2.6); break;
      case 'bucket':
        ctx.beginPath(); ctx.moveTo(-25, -40); ctx.lineTo(-22, -84); ctx.lineTo(22, -84); ctx.lineTo(25, -40); ctx.closePath(); fs(ctx, m.metal, 3.4);
        rr(ctx, -16, -64, 32, 5, 2); ctx.fillStyle = INK; ctx.fill(); ctx.fillRect(-2, -64, 4, 16);
        ctx.strokeStyle = m.metalD; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-24, -46); ctx.lineTo(24, -46); ctx.stroke();
        if (rarity !== 'common') { ctx.beginPath(); ctx.moveTo(0, -84); ctx.quadraticCurveTo(10, -104, 24, -100); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = m.gem; ctx.stroke(); } break;
      case 'skullhood':
        ctx.beginPath(); ctx.moveTo(-27, -40); ctx.quadraticCurveTo(-32, -92, 0, -90); ctx.quadraticCurveTo(32, -92, 27, -40); ctx.quadraticCurveTo(18, -72, 0, -72); ctx.quadraticCurveTo(-18, -72, -27, -40); fs(ctx, '#1f2a2e');
        ell(ctx, 0, -82, 8, 6.5); fs(ctx, '#efe6cf', 2.4); ctx.fillStyle = m.gem === '#7d7468' ? INK : m.gem; ell(ctx, -3, -82, 1.8, 2); ctx.fill(); ell(ctx, 3, -82, 1.8, 2); ctx.fill(); break;
      case 'mitre':
        ctx.beginPath(); ctx.moveTo(-17, -68); ctx.quadraticCurveTo(-18, -96, 0, -112); ctx.quadraticCurveTo(18, -96, 17, -68); ctx.closePath(); fs(ctx, '#fbf4e1');
        ctx.fillStyle = '#f1c40f'; ctx.fillRect(-3, -108, 6, 38); ctx.fillRect(-10, -96, 20, 5); ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.strokeRect(-3, -108, 6, 38);
        if (rarity && rarity !== 'common') { ctx.beginPath(); ctx.ellipse(0, -118, 14, 4, 0, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = '#ffe66d'; ctx.stroke(); } break;
      case 'viking':
        ctx.beginPath(); ctx.moveTo(-23, -60); ctx.quadraticCurveTo(-20, -84, 0, -84); ctx.quadraticCurveTo(20, -84, 23, -60); ctx.closePath(); fs(ctx, '#8d8d8d');
        for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 20, -70); ctx.quadraticCurveTo(sx * 38, -72, sx * 32, -96); ctx.quadraticCurveTo(sx * 30, -80, sx * 16, -78); ctx.closePath(); fs(ctx, '#f3e6c8', 3); }
        ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 3; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 4, -62); ctx.lineTo(sx * 14, -56); ctx.stroke(); }
        for (const sx of [-1, 1]) { rr(ctx, sx * 24 - 4, -58, 8, 22, 4); fs(ctx, '#e67e22', 2.4); } break;
    }
  }

  function drawArmour(ctx, kind, rarity) {
    const m = MAT[rarity || 'common'];
    if (kind === 'plate') { ctx.beginPath(); ctx.ellipse(0, -30, 19, 15, 0, Math.PI, 0); ctx.lineTo(16, -18); ctx.quadraticCurveTo(0, -12, -16, -18); ctx.closePath(); fs(ctx, m.metal, 2.8); ell(ctx, 0, -32, 3.5, 3.5); fs(ctx, m.gem, 2); }
    else if (kind === 'robe') { poly(ctx, [[-14, -44], [14, -44], [20, -10], [-20, -10]]); fs(ctx, m.cloth, 2.8); ctx.fillStyle = m.metal; ctx.fillRect(-2, -44, 4, 34); }
    else { poly(ctx, [[-16, -42], [16, -42], [18, -14], [-18, -14]]); fs(ctx, m.cloth, 2.8); }
  }

  function drawEmoteGlyph(ctx, x, y, s, em, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.textAlign = 'center';
    ctx.font = '20px "CW Bang", Impact, sans-serif';
    ctx.lineWidth = 4; ctx.strokeStyle = INK;
    const txt = (str, col, dy = 0) => { ctx.strokeText(str, 0, dy); ctx.fillStyle = col; ctx.fillText(str, 0, dy); };
    switch (em) {
      case 'shock': txt('!', '#ffe14d', -2); break;
      case 'angry': for (const sx of [-1, 1]) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ell(ctx, sx * 14 + Math.sin(t * 9) * 2, -6 - ((t * 30) % 12), 5, 4); ctx.fill(); } txt('#@!', '#ff4040', 0); break;
      case 'laugh': txt('HA', '#fff', Math.sin(t * 20) * 2); break;
      case 'panic': ctx.fillStyle = '#7fd1ff'; for (const sx of [-1, 1]) { ell(ctx, sx * 24, 24 + ((t * 40) % 10), 3, 5); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); } break;
      case 'cheer': txt('★', '#ffd23f', -4); break;
      case 'sad': txt('…', '#9fc5ff', 0); break;
      case 'taunt': txt('EZ', '#c6ff2e', 0); break;
      case 'sneak': txt('?', '#c6ff2e', 0); break;
      case 'cast': ctx.fillStyle = '#d6a8ff'; for (let i = 0; i < 3; i++) { ell(ctx, Math.sin(t * 6 + i * 2) * 14, 10 + Math.cos(t * 6 + i * 2) * 6, 2.5, 2.5); ctx.fill(); } break;
    }
    ctx.restore();
  }

  // Bust portrait (head only) for avatars + hero class icons.
  const bustCache = new Map();
  Art.bust = function (look, hat, rarity, size = 72, bg = null) {
    const key = JSON.stringify(look) + '|' + hat + '|' + rarity + '|' + size + '|' + bg;
    if (bustCache.has(key)) return bustCache.get(key);
    const c = makeCanvas(size, size);
    if (!c) return '';
    const ctx = c.getContext('2d');
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size); }
    const sc = size / (hat ? 118 : 100);
    Art.drawOverlord(ctx, size / 2, size + (hat ? 18 : 22) * sc * 1.6 + 6 * sc, sc * 1.55, look, { hat, heroRarity: rarity, t: 0 });
    const url = c.toDataURL();
    bustCache.set(key, url);
    return url;
  };
  // A class reads as: generic class-coloured overlord in its hat.
  Art.classLook = function (classId) {
    const c = CW.CLASSES[classId];
    return { body: shade(c.tint, 0.25), belly: shade(c.tint, 0.65), horns: 'nub', eyes: 'big', mouth: classId === 'berserker' || classId === 'brute' ? 'fangs' : 'grin', extra: 'none' };
  };
  Art.heroIcon = function (classId, rarity, size = 72) { return Art.bust(Art.classLook(classId), CW.CLASSES[classId].hat, rarity, size); };

  // ------------------------------------------------------------ ENEMIES
  Art.drawEnemy = function (ctx, u, t) {
    const s = (u.size || 1) * 0.95;
    const hit = u.anim && u.anim.hit > 0;
    const stunned = u.stunUntil && u.stunUntil > (u._now || 0);
    ctx.save();
    ctx.translate(u.x + (hit ? Math.sin(t * 80) * 3 : 0), u.y);
    ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ell(ctx, 0, 0, 30, 8); ctx.fill();
    const bob = Math.sin(t * 4 + u.hx) * 2;
    ctx.translate(0, bob);
    const col = u.color, colD = shade(col, -0.35);
    const lunge = u.anim && u.anim.lunge > 0 ? u.anim.lunge * 30 : 0;
    ctx.translate(0, lunge);
    switch (u.shape) {
      case 'blob':
        ctx.beginPath(); ctx.moveTo(-34, 0); ctx.quadraticCurveTo(-40, -50, -6, -58); ctx.quadraticCurveTo(30, -62, 36, -20); ctx.quadraticCurveTo(40, 0, 34, 0); ctx.closePath(); fs(ctx, col, 3.6);
        ctx.fillStyle = colD; for (const [x, y, r] of [[-18, -18, 5], [14, -36, 4], [22, -10, 3]]) { ell(ctx, x, y, r, r); ctx.fill(); }
        break;
      case 'rat':
        ctx.beginPath(); ctx.moveTo(30, -10); ctx.quadraticCurveTo(54, -16, 50, -40); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#e8a0a8'; ctx.stroke();
        ell(ctx, 0, -24, 30, 24); fs(ctx, col, 3.6);
        for (const sx of [-1, 1]) { ell(ctx, sx * 20, -52, 10, 12); fs(ctx, col, 3); ell(ctx, sx * 20, -52, 5, 7); ctx.fillStyle = '#e8a0a8'; ctx.fill(); }
        poly(ctx, [[-10, -14], [0, 2], [10, -14]]); fs(ctx, '#f3e6c8', 2.5);
        break;
      case 'gob':
        ell(ctx, 0, -22, 24, 22); fs(ctx, col, 3.6);
        for (const sx of [-1, 1]) { poly(ctx, [[sx * 18, -42], [sx * 46, -52], [sx * 24, -30]]); fs(ctx, col, 3); }
        ell(ctx, 0, -48, 20, 16); fs(ctx, col, 3.4);
        break;
      case 'skull':
        poly(ctx, [[-16, 0], [-18, -30], [18, -30], [16, 0]]); fs(ctx, '#3a3340', 3);
        ctx.strokeStyle = col; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-12, -24 + i * 8); ctx.lineTo(12, -24 + i * 8); ctx.stroke(); }
        ell(ctx, 0, -48, 22, 20); fs(ctx, col, 3.6);
        rr(ctx, -12, -34, 24, 10, 3); fs(ctx, col, 3);
        break;
    }
    // face
    const fy = u.shape === 'blob' ? -36 : u.shape === 'rat' ? -30 : -50;
    const angry = u.boss && u.enraged;
    for (const sx of [-1, 1]) {
      if (u.shape === 'skull') { ell(ctx, sx * 8, fy, 6, 7); ctx.fillStyle = INK; ctx.fill(); ell(ctx, sx * 8, fy, 2.5, 2.5); ctx.fillStyle = angry ? '#ff2f2f' : '#ffe14d'; ctx.fill(); continue; }
      ell(ctx, sx * 9, fy, 6, 6); fs(ctx, stunned ? '#ffe' : '#ffe14d', 2.6);
      ctx.fillStyle = INK; ell(ctx, sx * 9, fy + 1, 2.4, 3.5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(sx * 16, fy - 10); ctx.lineTo(sx * 3, fy - 5); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    }
    if (u.shape !== 'skull') { ctx.beginPath(); ctx.moveTo(-12, fy + 12); ctx.quadraticCurveTo(0, fy + 20, 12, fy + 12); ctx.closePath(); fs(ctx, '#5a0f1f', 2.6); for (const sx of [-7, 0, 7]) { poly(ctx, [[sx - 2.5, fy + 12], [sx, fy + 17], [sx + 2.5, fy + 12]]); ctx.fillStyle = '#fff'; ctx.fill(); } }
    if (u.boss) { ctx.save(); ctx.translate(0, u.shape === 'rat' ? -66 : -66); ctx.scale(0.55, 0.55); GEARART.crown(ctx, MAT[angry ? 'mythic' : 'legendary']); ctx.restore(); }
    if (u.elite) { ctx.fillStyle = '#ff3b3b'; ctx.strokeStyle = INK; ctx.lineWidth = 2; poly(ctx, [[-6, -78], [0, -90], [6, -78]]); ctx.fill(); ctx.stroke(); }
    if (hit) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ell(ctx, 0, -30, 30, 30); ctx.fill(); }
    ctx.restore();
    if (stunned) { ctx.save(); ctx.translate(u.x, u.y - 70 * s); for (let i = 0; i < 3; i++) { const a = t * 5 + (i * Math.PI * 2) / 3; ctx.fillStyle = '#ffe14d'; ctx.font = '14px sans-serif'; ctx.fillText('★', Math.cos(a) * 18 - 5, Math.sin(a) * 5); } ctx.restore(); }
  };

  Art.drawSkeleton = function (ctx, u, t) {
    ctx.save(); ctx.translate(u.x, u.y); ctx.scale(0.6, 0.6);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ell(ctx, 0, 0, 20, 6); ctx.fill();
    ctx.translate(0, Math.sin(t * 6 + u.hx) * 2 - (u.anim.lunge > 0 ? 8 : 0));
    poly(ctx, [[-10, 0], [-12, -26], [12, -26], [10, 0]]); fs(ctx, '#3a3340', 3);
    ell(ctx, 0, -40, 16, 15); fs(ctx, '#efe6cf', 3.2);
    ctx.fillStyle = '#1abc9c'; ell(ctx, -6, -42, 3, 3); ctx.fill(); ell(ctx, 6, -42, 3, 3); ctx.fill();
    ctx.restore();
  };

  // Noise texture for grungy backgrounds (dataURL, cached)
  let grain = null;
  Art.grain = function () {
    if (grain) return grain;
    const c = makeCanvas(160, 160); if (!c) return '';
    const x = c.getContext('2d'); const img = x.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = Math.random() < 0.5 ? 18 : 0; }
    x.putImageData(img, 0, 0);
    return (grain = c.toDataURL());
  };

  CW.Art = Art;
})(typeof window !== 'undefined' ? window : globalThis);
