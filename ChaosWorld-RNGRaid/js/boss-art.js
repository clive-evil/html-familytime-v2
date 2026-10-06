/* Giant boss — procedural PLACEHOLDER art (swap via js/art-manifest.js → bosses).
 * Same ink/flat-fill system as the heroes, scaled up to dominate the scene. Faces LEFT (towards the raiders).
 * boss: { x, y (feet), def: {skin, dark, horn, eye, style}, pose: idle|windup|slam|roar|beam, flinch, enraged, hp, maxHp }
 */
(function (root) {
  'use strict';
  const CW = (root.CW = root.CW || {});
  const INK = '#140b17';
  function fs(c, fill, lw = 5) { c.fillStyle = fill; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke(); }
  function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2); }
  function poly(c, pts) { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); }

  function arm(c, sx, sy, ang, len, d, fistR) {
    c.save(); c.translate(sx, sy); c.rotate(ang);
    c.beginPath(); c.moveTo(-22, 0); c.quadraticCurveTo(-30, len * 0.5, -18, len); c.lineTo(18, len); c.quadraticCurveTo(30, len * 0.5, 22, 0); c.closePath(); fs(c, d.skin);
    ell(c, 0, len + fistR * 0.6, fistR, fistR * 0.9); fs(c, d.dark);
    c.strokeStyle = INK; c.lineWidth = 3; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * fistR * 0.4, len + fistR * 0.2); c.lineTo(i * fistR * 0.4, len + fistR * 0.7); c.stroke(); }
    c.restore();
  }

  const BossArt = {};
  BossArt.draw = function (c, B, t, o = {}) {
    const d = B.def;
    const s = o.scale || 1;
    const pose = B.pose || 'idle';
    const breathe = Math.sin(t * 1.6) * 4;
    const shake = B.flinch > 0 ? Math.sin(t * 90) * 6 : 0;
    c.save();
    c.translate(B.x + shake, B.y);
    c.scale(s, s);
    c.lineJoin = 'round'; c.lineCap = 'round';
    // ground shadow + enrage aura
    c.fillStyle = 'rgba(0,0,0,0.45)'; ell(c, 0, 0, 150, 34); c.fill();
    if (B.enraged || B.chaosRaid) {
      const g = c.createRadialGradient(0, -160, 30, 0, -160, 230);
      g.addColorStop(0, `rgba(255,${B.enraged ? 30 : 47},${B.enraged ? 50 : 160},${0.35 + Math.sin(t * 6) * 0.1})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(-260, -420, 520, 440);
    }
    const lift = pose === 'windup' ? -14 : pose === 'slam' ? 10 : 0;
    c.translate(0, breathe * 0.3 + lift);
    // legs
    for (const sx of [-60, 55]) { c.beginPath(); c.moveTo(sx - 34, -60); c.lineTo(sx - 38, -6); c.quadraticCurveTo(sx, 8, sx + 38, -6); c.lineTo(sx + 32, -60); c.closePath(); fs(c, d.dark); }
    // back arm (far side)
    // [far arm, near arm] rotation; + swings the fist towards the raiders (left), − away
    const armA = { idle: [-0.25, 0.25], windup: [-2.3, 2.45], slam: [0.25, 0.75], roar: [-1.2, 1.25], beam: [-0.35, 0.55] }[pose] || [-0.25, 0.25];
    arm(c, 92, -230, armA[0] + Math.sin(t * 1.6) * 0.05, 130, d, 36);
    // body
    c.beginPath(); c.moveTo(-120, -70); c.quadraticCurveTo(-160, -220, -60, -290); c.quadraticCurveTo(40, -330, 110, -270); c.quadraticCurveTo(170, -190, 125, -70); c.quadraticCurveTo(0, -30, -120, -70); fs(c, d.skin, 6);
    // belly
    c.beginPath(); c.moveTo(-90, -90); c.quadraticCurveTo(-110, -200, -20, -220); c.quadraticCurveTo(70, -210, 80, -100); c.quadraticCurveTo(0, -60, -90, -90); c.fillStyle = 'rgba(255,255,255,0.18)'; c.fill();
    c.strokeStyle = d.dark; c.lineWidth = 4;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-70 + i * 6, -110 - i * 28); c.quadraticCurveTo(-10, -100 - i * 30, 50 - i * 4, -114 - i * 28); c.stroke(); }
    // style details
    if (d.style === 'tusks') { c.fillStyle = d.dark; for (const [wx, wy, r] of [[-110, -150, 10], [70, -250, 8], [100, -140, 12], [-40, -270, 7]]) { ell(c, wx, wy, r, r * 0.8); c.fill(); } }
    if (d.style === 'antlers') { c.strokeStyle = INK; c.lineWidth = 4; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-100 + i * 10, -150 - i * 14); c.quadraticCurveTo(-60, -156 - i * 14, -30 + i * 6, -146 - i * 14); c.stroke(); } }
    if (d.style === 'flames') { c.strokeStyle = '#ffd36b'; c.lineWidth = 4; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(-90 + i * 34, -100 - (i % 2) * 40); c.lineTo(-74 + i * 34, -130 - (i % 3) * 30); c.lineTo(-60 + i * 34, -110); c.stroke(); } }
    // head (sunk into shoulders, facing left)
    const hx = -40, hy = -290;
    const roar = pose === 'roar';
    if (d.style === 'antlers') {
      c.strokeStyle = INK; c.lineWidth = 12; c.lineCap = 'round';
      for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(hx + sx * 30, hy - 40); c.quadraticCurveTo(hx + sx * 80, hy - 90, hx + sx * 70, hy - 150); c.moveTo(hx + sx * 60, hy - 90); c.lineTo(hx + sx * 110, hy - 110); c.moveTo(hx + sx * 72, hy - 125); c.lineTo(hx + sx * 40, hy - 150); c.stroke(); }
      c.strokeStyle = d.horn; c.lineWidth = 7;
      for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(hx + sx * 30, hy - 40); c.quadraticCurveTo(hx + sx * 80, hy - 90, hx + sx * 70, hy - 150); c.moveTo(hx + sx * 60, hy - 90); c.lineTo(hx + sx * 110, hy - 110); c.moveTo(hx + sx * 72, hy - 125); c.lineTo(hx + sx * 40, hy - 150); c.stroke(); }
    } else if (d.style === 'flames') {
      for (let i = 0; i < 7; i++) { const fx = hx - 60 + i * 20, fl = Math.sin(t * 12 + i) * 8; c.beginPath(); c.moveTo(fx - 14, hy - 30); c.quadraticCurveTo(fx - 8 + fl, hy - 90 - (i % 3) * 18, fx + 4, hy - 110 - (i % 2) * 24 + fl); c.quadraticCurveTo(fx + 12, hy - 70, fx + 14, hy - 30); c.closePath(); fs(c, i % 2 ? '#ff9f1a' : '#ffd36b', 4); }
    } else {
      for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(hx + sx * 34, hy - 40); c.quadraticCurveTo(hx + sx * 90, hy - 70, hx + sx * 74, hy - 130); c.quadraticCurveTo(hx + sx * 64, hy - 80, hx + sx * 20, hy - 66); c.closePath(); fs(c, d.horn, 5); }
    }
    ell(c, hx, hy, 70, 60); fs(c, d.skin, 6);
    // brow ridge + eyes
    c.beginPath(); c.moveTo(hx - 64, hy - 20); c.quadraticCurveTo(hx, hy - 54, hx + 60, hy - 18); c.lineTo(hx + 50, hy - 6); c.quadraticCurveTo(hx, hy - 34, hx - 56, hy - 6); c.closePath(); fs(c, d.dark, 5);
    const glow = pose === 'beam' ? 1 : B.enraged ? 0.8 : 0.5;
    for (const ex of [hx - 30, hx + 22]) {
      ell(c, ex, hy - 4, 15, 12); fs(c, '#fff', 4);
      c.save(); c.shadowColor = d.eye; c.shadowBlur = 18 * glow;
      c.fillStyle = B.enraged ? '#ff3b3b' : d.eye; ell(c, ex - 5, hy - 2, 7 + glow * 3, 7 + glow * 3); c.fill(); c.restore();
      c.fillStyle = INK; ell(c, ex - 6, hy - 2, 3, 4); c.fill();
    }
    // mouth
    if (roar) {
      ell(c, hx - 6, hy + 34, 44, 30); fs(c, '#5a0f1f', 5);
      c.fillStyle = '#fff'; for (let i = -3; i <= 3; i++) { poly(c, [[hx - 6 + i * 12 - 5, hy + 8], [hx - 6 + i * 12, hy + 22], [hx - 6 + i * 12 + 5, hy + 8]]); c.fill(); }
      ell(c, hx - 6, hy + 46, 22, 9); c.fillStyle = '#ff6b81'; c.fill();
    } else {
      c.beginPath(); c.moveTo(hx - 50, hy + 26); c.quadraticCurveTo(hx - 4, hy + 48, hx + 44, hy + 24); c.quadraticCurveTo(hx - 4, hy + 34, hx - 50, hy + 26); fs(c, '#5a0f1f', 4);
      c.fillStyle = '#fff'; for (const tx of [hx - 36, hx - 18, hx + 6, hx + 26]) { poly(c, [[tx - 5, hy + 30], [tx, hy + 40], [tx + 5, hy + 30]]); c.fill(); }
    }
    if (d.style === 'tusks') for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(hx + sx * 36 - 4, hy + 28); c.quadraticCurveTo(hx + sx * 50, hy + 2, hx + sx * 44, hy - 18); c.quadraticCurveTo(hx + sx * 40, hy + 8, hx + sx * 26, hy + 30); c.closePath(); fs(c, d.horn, 4); }
    // crown
    c.save(); c.translate(hx, hy - 62); c.scale(1.1, 1.1); CW.Art.drawItem(c, 'crown', B.enraged || B.chaosRaid ? 'mythic' : 'legendary'); c.restore();
    // front arm (near side, towards raiders)
    arm(c, -110, -220, armA[1] + Math.sin(t * 1.6 + 1) * 0.05, 140, d, 40);
    // beam charge
    if (pose === 'beam') { c.save(); c.globalAlpha = 0.5 + Math.sin(t * 30) * 0.3; c.strokeStyle = d.eye; c.lineWidth = 3; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + t * 4; c.beginPath(); c.moveTo(hx - 30 + Math.cos(a) * 40, hy + Math.sin(a) * 40); c.lineTo(hx - 30 + Math.cos(a) * 16, hy + Math.sin(a) * 16); c.stroke(); } c.restore(); }
    if (B.flinch > 0) { c.globalCompositeOperation = 'source-over'; c.fillStyle = 'rgba(255,255,255,0.35)'; ell(c, 0, -180, 150, 150); c.fill(); }
    if (B.enraged) { c.fillStyle = 'rgba(255,255,255,0.6)'; for (let i = 0; i < 3; i++) { const sy = ((t * 60 + i * 30) % 80); ell(c, hx + 50 + i * 10, hy - 50 - sy, 10 - sy / 10, 8 - sy / 12); c.fill(); } }
    c.restore();
  };
  CW.BossArt = BossArt;
})(typeof window !== 'undefined' ? window : globalThis);
