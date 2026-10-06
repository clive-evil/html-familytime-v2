/* Chaos World hero archetypes — procedural PLACEHOLDER art (swap via js/art-manifest.js).
 * One shared body system so every class reads as "same artist": big head, chunky torso, stubby legs,
 * 3.4px ink outline, flat fill + one shade + one highlight. Player accent colour on tabards/capes/plumes.
 * Feet at (0,0), ~104 units tall at scale 1, facing RIGHT (towards the boss).
 */
(function (root) {
  'use strict';
  const CW = (root.CW = root.CW || {});
  const INK = '#140b17';
  const shade = (c, f) => CW.Art.shade(c, f);
  const MAT = () => CW.Art.MAT;

  // ------------------------------------------------------------ tiny drawing kit
  function fs(c, fill, lw = 3.2) { c.fillStyle = fill; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke(); }
  function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2); }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
  function poly(c, pts) { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); }
  function hi(c, x, y, w, h) { c.fillStyle = 'rgba(255,255,255,0.45)'; ell(c, x, y, w, h, -0.5); c.fill(); }
  function line(c, pts, w, col) { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.lineWidth = w + 3; c.strokeStyle = INK; c.stroke(); c.lineWidth = w; c.strokeStyle = col; c.stroke(); }

  // Face: eyes + mouth. cx/cy = face centre. Looks right (pupils forward).
  function face(c, cx, cy, f, st) {
    const stun = st === 'stun', hurt = st === 'hurt';
    const eye = f.eyes || 'round';
    for (const dx of [-7, 7]) {
      const ex = cx + dx + 2, ey = cy;
      if (stun) { c.lineWidth = 2.6; c.strokeStyle = INK; c.beginPath(); c.moveTo(ex - 3.5, ey - 3.5); c.lineTo(ex + 3.5, ey + 3.5); c.moveTo(ex + 3.5, ey - 3.5); c.lineTo(ex - 3.5, ey + 3.5); c.stroke(); continue; }
      if (eye === 'closed' || hurt) { c.beginPath(); c.moveTo(ex - 4, ey); c.quadraticCurveTo(ex, ey + (hurt ? 3 : -4), ex + 4, ey); c.lineWidth = 2.6; c.strokeStyle = INK; c.stroke(); continue; }
      if (eye === 'glow') { ell(c, ex, ey, 4, 3.2); c.fillStyle = f.glow || '#7dff7a'; c.shadowColor = f.glow || '#7dff7a'; c.shadowBlur = 8; c.fill(); c.shadowBlur = 0; continue; }
      if (eye === 'slit') { rr(c, ex - 4.5, ey - 1.6, 9, 3.2, 1.5); c.fillStyle = '#fff'; c.fill(); c.fillStyle = INK; c.fillRect(ex, ey - 1.5, 2.4, 3); continue; }
      ell(c, ex, ey, 5, 5.6); fs(c, '#fff', 2.2);
      c.fillStyle = INK; ell(c, ex + 1.6, ey + 0.6, 2.4, 2.9); c.fill();
      c.fillStyle = '#fff'; ell(c, ex + 0.8, ey - 0.6, 0.8, 0.8); c.fill();
    }
    if (f.brow && !stun) { c.lineWidth = 2.8; c.strokeStyle = INK; c.beginPath(); for (const dx of [-7, 7]) { const ex = cx + dx + 2; if (f.brow === 'angry') { c.moveTo(ex - 5, cy - 9 + (dx < 0 ? -2 : 2)); c.lineTo(ex + 5, cy - 9 + (dx < 0 ? 2 : -2)); } else { c.moveTo(ex - 5, cy - 9); c.lineTo(ex + 4, cy - 10); } } c.stroke(); }
    const my = cy + 11, mx = cx + 3;
    c.lineWidth = 2.6; c.strokeStyle = INK;
    const mouth = stun ? 'wobble' : hurt ? 'open' : f.mouth;
    switch (mouth) {
      case 'grin': c.beginPath(); c.moveTo(mx - 8, my - 2); c.quadraticCurveTo(mx, my + 7, mx + 8, my - 2); c.closePath(); fs(c, '#fff', 2.2); break;
      case 'gap': c.beginPath(); c.moveTo(mx - 8, my - 2); c.quadraticCurveTo(mx, my + 7, mx + 8, my - 2); c.closePath(); fs(c, '#fff', 2.2); c.fillStyle = INK; c.fillRect(mx - 1, my - 1, 3, 4); break;
      case 'flat': c.beginPath(); c.moveTo(mx - 6, my); c.lineTo(mx + 6, my - 1); c.stroke(); break;
      case 'smile': c.beginPath(); c.moveTo(mx - 6, my - 1); c.quadraticCurveTo(mx, my + 4, mx + 6, my - 1); c.stroke(); break;
      case 'open': ell(c, mx, my + 1, 5.5, 5); fs(c, '#5a0f1f', 2.2); break;
      case 'wobble': c.beginPath(); c.moveTo(mx - 6, my); for (let i = -6; i <= 6; i += 3) c.lineTo(mx + i, my + (i % 6 === 0 ? 1.5 : -1.5)); c.stroke(); break;
      case 'shout': ell(c, mx + 1, my + 1, 6.5, 6); fs(c, '#5a0f1f', 2.2); c.fillStyle = '#fff'; c.fillRect(mx - 4, my - 4, 9, 2.5); break;
    }
  }

  // ------------------------------------------------------------ class definitions
  // skin, body, legs, boots + optional hooks: back(c,o) torso(c,o) head(c,o) front(c,o). weaponHold: 'up'|'out'
  const D = {};
  D.scrub = {
    scale: 0.94, skin: '#f2c39b', body: '#9b7653', legs: '#7a5a3c', boots: '#f2c39b', sleeve: '#9b7653',
    torso(c, o) {
      poly(c, [[-17, -56], [17, -56], [21, -14], [-21, -14]]); fs(c, this.body);
      // patches + rope belt (accent patch = player colour)
      rr(c, -12, -46, 9, 9, 2); fs(c, o.accent, 2); c.strokeStyle = INK; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-11, -44); c.lineTo(-5, -38); c.stroke();
      rr(c, 6, -34, 8, 7, 2); fs(c, shade(this.body, 0.25), 2);
      line(c, [[-20, -24], [20, -26]], 3, '#d9b77a');
    },
    head(c, o) {
      // messy hair tufts + sprout, big nose, bandage
      ell(c, 0, -74, 21, 19); fs(c, this.skin, 3.4);
      c.fillStyle = '#6b4224'; poly(c, [[-20, -78], [-14, -96], [-6, -86], [0, -99], [6, -86], [14, -95], [19, -80], [12, -88], [0, -90], [-12, -88]]); fs(c, '#6b4224', 3);
      line(c, [[1, -98], [3, -106]], 2, '#4aa84a'); ell(c, 6, -107, 4, 2.4, -0.5); fs(c, '#7bc142', 1.6);
      face(c, 0, -73, { eyes: 'round', mouth: 'gap', brow: 'up' }, o.state);
      ell(c, 9, -70, 4.5, 4); fs(c, shade(this.skin, -0.12), 2.2);
      c.save(); c.translate(-12, -66); c.rotate(-0.5); rr(c, -6, -2.5, 12, 5, 2); fs(c, '#f6e7c8', 1.8); c.restore();
    },
  };
  D.knight = {
    scale: 1.08, skin: '#f0c7a0', legs: '#7b8794', boots: '#4a5560', sleeve: '#9aa5b1',
    metal(o) { return o.rarity && o.rarity !== 'common' ? MAT()[o.rarity].metal : '#b8c2cc'; },
    torso(c, o) {
      const m = this.metal(o);
      poly(c, [[-19, -58], [19, -58], [22, -14], [-22, -14]]); fs(c, m);
      // tabard in player colour with white chevron
      poly(c, [[-11, -56], [11, -56], [12, -10], [0, -4], [-12, -10]]); fs(c, o.accent, 2.6);
      c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.moveTo(-9, -40); c.lineTo(0, -32); c.lineTo(9, -40); c.stroke();
      // pauldrons
      for (const sx of [-1, 1]) { ell(c, sx * 19, -54, 10, 8); fs(c, m, 3); }
      line(c, [[-21, -18], [21, -18]], 3, shade(m, -0.4));
    },
    head(c, o) {
      const m = this.metal(o);
      // great helm with visor slit + breathing holes + plume
      c.beginPath(); c.moveTo(-19, -58); c.lineTo(-20, -84); c.quadraticCurveTo(0, -100, 20, -84); c.lineTo(19, -58); c.closePath(); fs(c, m, 3.4);
      rr(c, -6, -80, 26, 5, 2); c.fillStyle = INK; c.fill();
      c.fillStyle = INK; for (const [hx, hy] of [[10, -68], [15, -68], [10, -63], [15, -63]]) { ell(c, hx, hy, 1.2, 1.2); c.fill(); }
      line(c, [[0, -94], [0, -60]], 2.5, shade(m, -0.35));
      hi(c, -10, -86, 3, 6);
      c.beginPath(); c.moveTo(-2, -95); c.quadraticCurveTo(-26, -112, -32, -86); c.quadraticCurveTo(-20, -96, -6, -90); c.closePath(); fs(c, o.accent, 3);
      if (o.state === 'stun') face(c, 4, -78, { eyes: 'round' }, 'stun');
    },
    front(c, o) {
      // kite shield on the front arm side (accent + emblem)
      c.save(); c.translate(15, -36);
      c.beginPath(); c.moveTo(0, -20); c.quadraticCurveTo(16, -18, 16, -8); c.quadraticCurveTo(14, 10, 0, 22); c.quadraticCurveTo(-14, 10, -16, -8); c.quadraticCurveTo(-16, -18, 0, -20); fs(c, this.metal(o), 3);
      c.beginPath(); c.moveTo(0, -14); c.quadraticCurveTo(10, -13, 10, -6); c.quadraticCurveTo(9, 6, 0, 15); c.quadraticCurveTo(-9, 6, -10, -6); c.quadraticCurveTo(-10, -13, 0, -14); c.fillStyle = o.accent; c.fill();
      c.fillStyle = '#fff'; poly(c, [[0, -9], [3, -2], [0, 8], [-3, -2]]); c.fill();
      c.restore();
    },
    weaponHand: 'back',
  };
  D.archer = {
    scale: 1.0, skin: '#e9b98f', body: '#7a5634', legs: '#5a4026', boots: '#3d2b19', sleeve: '#2e7d4f',
    back(c, o) {
      // quiver with fletchings + short cape
      c.save(); c.translate(-14, -52); c.rotate(-0.35);
      rr(c, -6, -10, 12, 34, 3); fs(c, '#6b4224', 3);
      for (const [dx, col] of [[-3, '#fff'], [1, o.accent], [4, '#fff']]) { line(c, [[dx, -10], [dx, -22]], 1.6, '#d9c4a0'); poly(c, [[dx - 2.5, -20], [dx, -27], [dx + 2.5, -20]]); fs(c, col, 1.6); }
      c.restore();
      c.beginPath(); c.moveTo(-16, -60); c.quadraticCurveTo(-30, -32, -24, -16); c.lineTo(-8, -20); c.closePath(); fs(c, '#2e7d4f');
    },
    torso(c, o) {
      poly(c, [[-16, -56], [16, -56], [19, -14], [-19, -14]]); fs(c, this.body);
      line(c, [[-14, -54], [16, -20]], 3, '#3d2b19'); // bandolier
      line(c, [[-19, -22], [19, -24]], 3, '#3d2b19');
    },
    head(c, o) {
      ell(c, 0, -74, 19, 18); fs(c, this.skin, 3.4);
      // hood
      c.beginPath(); c.moveTo(-22, -60); c.quadraticCurveTo(-28, -100, 4, -98); c.quadraticCurveTo(26, -92, 22, -70); c.quadraticCurveTo(14, -88, -2, -88); c.quadraticCurveTo(-16, -86, -14, -60); c.closePath(); fs(c, '#2e7d4f', 3.2);
      c.beginPath(); c.moveTo(-6, -97); c.quadraticCurveTo(-18, -104, -24, -94); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
      face(c, 2, -75, { eyes: 'round', mouth: 'none', brow: 'angry' }, o.state);
      // scarf over the mouth in player colour
      c.beginPath(); c.moveTo(-14, -66); c.quadraticCurveTo(4, -58, 20, -66); c.lineTo(20, -58); c.quadraticCurveTo(4, -50, -14, -58); c.closePath(); fs(c, o.accent, 2.6);
    },
  };
  D.mage = {
    scale: 1.0, skin: '#f0c7a0', body: '#5b35b8', legs: '#3d2480', boots: '#2b1a55', sleeve: '#5b35b8',
    torso(c, o) {
      poly(c, [[-15, -56], [15, -56], [24, -6], [-24, -6]]); fs(c, this.body);
      line(c, [[0, -54], [0, -8]], 3, o.accent);
      c.fillStyle = '#ffe14d'; for (const [sx, sy] of [[-12, -22], [12, -30], [-6, -40]]) { c.beginPath(); c.arc(sx, sy, 2.2, 0, 7); c.fill(); }
      line(c, [[-17, -30], [17, -31]], 3, '#d9b77a');
    },
    head(c, o) {
      ell(c, 0, -72, 18, 17); fs(c, this.skin, 3.4);
      face(c, 0, -74, { eyes: 'round', mouth: 'none', brow: 'up' }, o.state);
      // long white beard
      c.beginPath(); c.moveTo(-14, -66); c.quadraticCurveTo(-10, -40, 4, -34); c.quadraticCurveTo(16, -42, 18, -66); c.quadraticCurveTo(4, -58, -14, -66); fs(c, '#f4f1ea', 3);
      ell(c, 9, -71, 4.5, 4); fs(c, shade(this.skin, -0.12), 2.2);
      // floppy pointy hat in player colour with stars
      c.beginPath(); c.moveTo(-26, -82); c.quadraticCurveTo(0, -76, 26, -82); c.quadraticCurveTo(0, -92, -26, -82); fs(c, shade(o.accent, -0.2), 3);
      c.beginPath(); c.moveTo(-16, -84); c.quadraticCurveTo(-6, -112, 10, -124); c.quadraticCurveTo(26, -116, 28, -104); c.quadraticCurveTo(20, -108, 16, -84); fs(c, o.accent, 3.2);
      c.fillStyle = '#ffe14d'; for (const [sx, sy] of [[-4, -96], [8, -106]]) { c.beginPath(); c.arc(sx, sy, 2.4, 0, 7); c.fill(); }
    },
  };
  D.berserker = {
    scale: 1.06, skin: '#e8a07a', legs: '#6b4224', boots: '#3d2b19', sleeve: '#e8a07a',
    torso(c, o) {
      // shirtless barrel chest + fur pelt + war paint (accent)
      c.beginPath(); c.moveTo(-20, -58); c.quadraticCurveTo(-26, -30, -20, -14); c.lineTo(20, -14); c.quadraticCurveTo(26, -30, 20, -58); c.closePath(); fs(c, this.skin);
      c.strokeStyle = shade(this.skin, -0.3); c.lineWidth = 2; c.beginPath(); c.moveTo(-2, -48); c.lineTo(-2, -30); c.moveTo(-12, -42); c.quadraticCurveTo(-6, -38, -2, -42); c.moveTo(8, -42); c.quadraticCurveTo(4, -38, -2, -42); c.stroke();
      line(c, [[-14, -34], [-6, -24]], 3, o.accent); line(c, [[6, -34], [14, -24]], 3, o.accent);
      c.beginPath(); c.moveTo(-24, -60); c.quadraticCurveTo(-4, -70, 18, -60); c.lineTo(10, -50); c.lineTo(4, -56); c.lineTo(-4, -50); c.lineTo(-12, -56); c.lineTo(-22, -48); c.closePath(); fs(c, '#8a5a2b', 3);
      line(c, [[-21, -18], [21, -18]], 4, '#3d2b19');
    },
    head(c, o) {
      ell(c, 0, -74, 19, 18); fs(c, this.skin, 3.4);
      face(c, 0, -76, { eyes: 'round', mouth: 'shout', brow: 'angry' }, o.state);
      // braided orange beard
      c.beginPath(); c.moveTo(-15, -66); c.quadraticCurveTo(-8, -50, 4, -48); c.quadraticCurveTo(16, -52, 18, -66); c.quadraticCurveTo(6, -58, -15, -66); fs(c, '#e8742a', 3);
      line(c, [[2, -50], [2, -40]], 4, '#e8742a');
      // horned helm
      c.beginPath(); c.moveTo(-19, -78); c.quadraticCurveTo(0, -102, 19, -78); c.closePath(); fs(c, '#8d8d8d', 3.2);
      for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 16, -88); c.quadraticCurveTo(sx * 34, -90, sx * 30, -112); c.quadraticCurveTo(sx * 26, -96, sx * 12, -94); c.closePath(); fs(c, '#f3e6c8', 3); }
      line(c, [[-18, -80], [18, -80]], 3, '#5e5e5e');
    },
  };
  D.rogue = {
    scale: 0.98, skin: '#d9a77f', body: '#2c3442', legs: '#1f252f', boots: '#14181f', sleeve: '#2c3442',
    back(c, o) { c.beginPath(); c.moveTo(-10, -62); c.quadraticCurveTo(-34, -60 + Math.sin((o.t || 0) * 6) * 3, -42, -48); c.lineTo(-36, -44); c.quadraticCurveTo(-26, -52, -8, -54); c.closePath(); fs(c, o.accent, 2.6); },
    torso(c, o) {
      poly(c, [[-15, -56], [15, -56], [17, -14], [-17, -14]]); fs(c, this.body);
      line(c, [[-15, -50], [15, -24]], 2.5, '#5a4026'); line(c, [[15, -50], [-15, -24]], 2.5, '#5a4026');
      line(c, [[-17, -20], [17, -20]], 3, '#5a4026');
    },
    head(c, o) {
      ell(c, 0, -74, 18, 17); fs(c, this.skin, 3.4);
      c.beginPath(); c.moveTo(-21, -62); c.quadraticCurveTo(-26, -100, 2, -98); c.quadraticCurveTo(26, -94, 21, -66); c.quadraticCurveTo(12, -86, -2, -86); c.quadraticCurveTo(-14, -84, -13, -62); c.closePath(); fs(c, '#1c2333', 3.2);
      rr(c, -14, -68, 34, 13, 4); fs(c, '#1c2333', 2.6); // face mask
      face(c, 1, -77, { eyes: 'slit', mouth: 'none' }, o.state);
    },
    weaponHand: 'both',
  };
  D.cleric = {
    scale: 1.0, skin: '#f6cfa9', body: '#f4ead1', legs: '#d9c79f', boots: '#8a6a3c', sleeve: '#f4ead1',
    torso(c, o) {
      poly(c, [[-15, -56], [15, -56], [23, -6], [-23, -6]]); fs(c, this.body);
      // stole in player colour, gold trim
      poly(c, [[-9, -56], [-3, -56], [-5, -8], [-11, -8]]); fs(c, o.accent, 2.2); poly(c, [[3, -56], [9, -56], [11, -8], [5, -8]]); fs(c, o.accent, 2.2);
      line(c, [[-23, -8], [23, -8]], 3, '#f1c40f');
      c.fillStyle = '#f1c40f'; poly(c, [[-2, -46], [2, -46], [2, -36], [6, -36], [6, -32], [2, -32], [2, -22], [-2, -22], [-2, -32], [-6, -32], [-6, -36], [-2, -36]]); c.fill(); c.lineWidth = 1.4; c.strokeStyle = INK; c.stroke();
    },
    head(c, o) {
      ell(c, 0, -73, 19, 18); fs(c, this.skin, 3.4); hi(c, -8, -84, 5, 3);
      face(c, 0, -74, { eyes: 'closed', mouth: 'smile' }, o.state);
      c.fillStyle = 'rgba(255,120,120,0.45)'; ell(c, -10, -66, 4, 2.5); c.fill(); ell(c, 14, -66, 4, 2.5); c.fill();
      ell(c, 0, -100, 15, 4.5); c.lineWidth = 6; c.strokeStyle = INK; c.stroke(); c.lineWidth = 3; c.strokeStyle = '#ffe66d'; c.stroke();
    },
  };
  D.necro = {
    scale: 1.02, skin: '#cfd8c8', body: '#25202e', legs: '#1a1620', boots: '#0f0c13', sleeve: '#25202e',
    torso(c, o) {
      c.beginPath(); c.moveTo(-15, -56); c.lineTo(15, -56); c.lineTo(24, -2); c.lineTo(16, -8); c.lineTo(10, -1); c.lineTo(2, -7); c.lineTo(-6, 0); c.lineTo(-13, -7); c.lineTo(-24, -2); c.closePath(); fs(c, this.body);
      line(c, [[-16, -28], [16, -30]], 3, o.accent);
      c.fillStyle = '#efe6cf'; for (const yy of [-48, -42, -36]) { rr(c, -8, yy, 16, 3, 1); c.fill(); }
    },
    head(c, o) {
      c.beginPath(); c.moveTo(-22, -56); c.quadraticCurveTo(-28, -104, 2, -102); c.quadraticCurveTo(28, -100, 22, -58); c.closePath(); fs(c, '#1f2a2e', 3.4);
      ell(c, 3, -75, 15, 16); fs(c, '#efe6cf', 3); // skull mask
      face(c, 1, -78, { eyes: 'glow', glow: '#7dff7a', mouth: 'none' }, o.state);
      c.strokeStyle = INK; c.lineWidth = 2; for (let i = -6; i <= 10; i += 4) { c.beginPath(); c.moveTo(i, -65); c.lineTo(i, -60); c.stroke(); }
      // little orbiting skull
      const a = (o.t || 0) * 2.2; const sx = -30 + Math.cos(a) * 6, sy = -96 + Math.sin(a) * 5;
      ell(c, sx, sy, 7, 6.5); fs(c, '#efe6cf', 2.4); c.fillStyle = '#7dff7a'; ell(c, sx - 2.5, sy, 1.5, 1.5); c.fill(); ell(c, sx + 2.5, sy, 1.5, 1.5); c.fill();
    },
  };
  D.paladin = {
    scale: 1.06, skin: '#f0c7a0', legs: '#c9a24a', boots: '#7a5a20', sleeve: '#e9d8a6',
    metal(o) { return o.rarity && ['legendary', 'mythic'].includes(o.rarity) ? MAT()[o.rarity].metal : '#e9d8a6'; },
    back(c, o) { c.beginPath(); c.moveTo(-16, -60); c.quadraticCurveTo(-32, -30, -26, -6); c.lineTo(-6, -10); c.closePath(); fs(c, o.accent); },
    torso(c, o) {
      const m = this.metal(o);
      poly(c, [[-18, -58], [18, -58], [21, -14], [-21, -14]]); fs(c, m);
      c.fillStyle = '#ffd166'; ell(c, 0, -38, 8, 8); c.fill(); c.lineWidth = 2.4; c.strokeStyle = INK; c.stroke();
      c.fillStyle = '#fff'; poly(c, [[0, -44], [2, -38], [0, -32], [-2, -38]]); c.fill();
      for (const sx of [-1, 1]) { ell(c, sx * 18, -54, 9, 7); fs(c, m, 3); }
      line(c, [[-20, -18], [20, -18]], 3, '#7a5a20');
    },
    head(c, o) {
      ell(c, 0, -73, 19, 18); fs(c, this.skin, 3.4);
      face(c, 0, -73, { eyes: 'round', mouth: 'flat', brow: 'angry' }, o.state);
      // open-faced winged helm
      c.beginPath(); c.moveTo(-21, -72); c.quadraticCurveTo(-20, -98, 0, -98); c.quadraticCurveTo(20, -98, 21, -72); c.lineTo(14, -80); c.quadraticCurveTo(0, -88, -14, -80); c.closePath(); fs(c, this.metal(o), 3.2);
      for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 18, -88); c.quadraticCurveTo(sx * 36, -100, sx * 34, -112); c.quadraticCurveTo(sx * 28, -100, sx * 22, -104); c.quadraticCurveTo(sx * 24, -96, sx * 16, -94); c.closePath(); fs(c, '#fff', 2.6); }
      hi(c, -8, -92, 3, 5);
    },
  };

  // ------------------------------------------------------------ draw
  const Chars = { defs: D, CLASS_IDS: Object.keys(D) };
  Chars.draw = function (c, classId, x, y, s, o = {}) {
    const d = D[classId] || D.scrub;
    const t = o.t || 0;
    const st = o.state || 'idle';
    const accent = o.accent || '#8b5cf6';
    const P = { ...o, accent, t, state: st };
    c.save();
    c.translate(x + (o.lunge || 0) * 14 * (o.face || 1), y - (o.lunge || 0) * 10);
    c.lineJoin = 'round'; c.lineCap = 'round';
    const sc = s * d.scale;
    // shadow + rarity aura
    c.fillStyle = 'rgba(0,0,0,0.35)'; ell(c, 0, 0, 24 * sc, 6.5 * sc); c.fill();
    if (st === 'down') { c.globalAlpha *= 0.5; c.translate(18 * sc, -6 * sc); c.rotate(1.35); }
    c.scale(sc * (o.face || 1), sc);
    if (o.rarity === 'legendary' || o.rarity === 'mythic') {
      const g = c.createRadialGradient(0, -50, 6, 0, -50, 64);
      g.addColorStop(0, o.rarity === 'mythic' ? 'rgba(255,47,160,0.45)' : 'rgba(255,191,26,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(-70, -120, 140, 130);
    }
    let bob = st === 'down' ? 0 : Math.sin(t * 3.2 + (o.seed || 0)) * 1.6;
    let jump = 0, tilt = 0;
    if (st === 'cheer' || o.emote === 'cheer') jump = Math.abs(Math.sin(t * 9)) * 12;
    if (st === 'stun') tilt = Math.sin(t * 7) * 0.12;
    if (o.emote === 'panic') tilt = Math.sin(t * 40) * 0.05;
    c.translate(0, bob - jump);
    c.rotate(tilt);
    // walk
    const step = o.walk ? Math.sin(t * 10) * 3 : 0;
    if (d.back) d.back.call(d, c, P);
    // legs
    rr(c, -15, -18 + step * 0.3, 12, 18, 4); fs(c, d.legs, 3); rr(c, 3, -18 - step * 0.3, 12, 18, 4); fs(c, d.legs, 3);
    ell(c, -9, -2, 9, 4.5); fs(c, d.boots, 2.6); ell(c, 10, -2, 9, 4.5); fs(c, d.boots, 2.6);
    // back arm
    const armBack = st === 'cheer' || o.emote === 'cheer' ? -2.6 : st === 'cast' ? -0.4 : 0.35;
    c.save(); c.translate(-16, -50); c.rotate(armBack); rr(c, -5, -2, 10, 22, 5); fs(c, d.sleeve, 3); ell(c, 0, 21, 5.5, 5.5); fs(c, d.skin, 2.6); c.restore();
    if (d.weaponHand === 'both' && o.weaponKind) { c.save(); c.translate(-16, -50); c.rotate(armBack); c.translate(0, 22); c.rotate(-0.4); c.scale(0.4, 0.4); CW.Art.drawItem(c, o.weaponKind, o.weaponRarity || 'common'); c.restore(); }
    // torso + head
    if (d.torso) d.torso.call(d, c, P);
    c.save(); if (st === 'attack') c.translate(3, 1); d.head.call(d, c, P); c.restore();
    // front arm + weapon
    let a = 0.55;
    if (st === 'attack') a = -1.9 + (o.attackT || 0) * 2.6;
    if (st === 'cast') a = -2.4;
    if (st === 'cheer' || o.emote === 'cheer' || o.emote === 'taunt') a = -2.7 + (o.emote === 'taunt' ? Math.sin(t * 14) * 0.3 : 0);
    if (st === 'stun' || st === 'down') a = 0.9;
    c.save(); c.translate(16, -50); c.rotate(a);
    if (o.weaponKind && d.weaponHand !== 'back') { c.save(); c.translate(1, 24); c.rotate(0.55); c.scale(0.55, 0.55); CW.Art.drawItem(c, o.weaponKind, o.weaponRarity || 'common'); c.restore(); }
    rr(c, -5, -2, 10, 22, 5); fs(c, d.sleeve, 3); ell(c, 0, 21, 5.5, 5.5); fs(c, d.skin, 2.6);
    c.restore();
    if (d.weaponHand === 'back' && o.weaponKind) { c.save(); c.translate(-14, -40); c.rotate(-0.9 + (st === 'attack' ? (o.attackT || 0) * 1.6 : 0)); c.scale(0.55, 0.55); CW.Art.drawItem(c, o.weaponKind, o.weaponRarity || 'common'); c.restore(); }
    if (d.front) d.front.call(d, c, P);
    if (st === 'hurt') { c.fillStyle = 'rgba(255,40,40,0.35)'; ell(c, 0, -52, 26, 52); c.fill(); }
    c.restore();
    if (st === 'stun') { c.save(); c.translate(x, y - 112 * s * d.scale); for (let i = 0; i < 3; i++) { const ang = t * 6 + (i * Math.PI * 2) / 3; c.fillStyle = '#ffe14d'; c.font = `${Math.round(15 * s)}px sans-serif`; c.textAlign = 'center'; c.fillText('★', Math.cos(ang) * 20 * s, Math.sin(ang) * 6 * s); } c.restore(); }
    if (o.emote && st !== 'down' && CW.Art.emoteGlyph) CW.Art.emoteGlyph(c, x, y - (116 * d.scale + jump) * s, s, o.emote, t);
  };

  // Portrait icon (head + shoulders) for item slots, cards, podium.
  const iconCache = new Map();
  Chars.icon = function (classId, rarity, size = 72, accent = '#8b5cf6') {
    const key = classId + '|' + rarity + '|' + size + '|' + accent;
    if (iconCache.has(key)) return iconCache.get(key);
    if (typeof document === 'undefined') return '';
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const c = cv.getContext('2d');
    const d = D[classId] || D.scrub;
    const s = size / 64 / d.scale;
    Chars.draw(c, classId, size * 0.47, size * 0.5 + 76 * s * d.scale, s, { rarity, accent, weaponKind: null, t: 0 });
    const url = cv.toDataURL();
    iconCache.set(key, url);
    return url;
  };
  CW.Chars = Chars;
})(typeof window !== 'undefined' ? window : globalThis);
