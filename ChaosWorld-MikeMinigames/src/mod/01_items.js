/* ==========================================================================
   CHASE ITEMS — data + icons painted with the Battle Lab's own painter
   (outline + base + crescent shade + highlight, same as its part sprites).
   ========================================================================== */
const ITEMS = {
  spike: { name: 'SPIKE TRAP', r: 'common', dmg: 150 },
  oil: { name: 'OIL SLICK', r: 'common', dmg: 30, slow: 3 },
  banana: { name: 'BANANA PEEL', r: 'common', dmg: 40, stun: 1.2, kb: 4 },
  smoke: { name: 'SMOKE BOMB', r: 'common', slow: 3, kb: 3 },
  firemine: { name: 'FIRE MINE', r: 'common', burn: 5, burnDps: 40 },
  chain: { name: 'CHAIN SNARE', r: 'rare', dmg: 60, stun: 2.5 },
  boulder: { name: 'BOULDER', r: 'rare', dmg: 260, kb: 14 },
  ice: { name: 'ICE HEX', r: 'rare', dmg: 60, slow: 6 },
  spring: { name: 'SPRING TRAP', r: 'rare', dmg: 100, kb: 22 },
  barrel: { name: 'EXPLOSIVE BARREL', r: 'rare', dmg: 420, kb: 6 },
  portal: { name: 'PORTAL TRAP', r: 'epic', kb: 45 },
  megabomb: { name: 'MEGA BOMB', r: 'epic', dmg: 800, kb: 20, stun: 1.5 },
  double: { name: 'DOUBLE TRAP', r: 'epic', double: true },
  stun: { name: 'HUNTER STUN', r: 'epic', dmg: 200, stun: 4 },
};
const ITEM_POOL = { common: [], rare: [], epic: [] };
for (const k in ITEMS) ITEM_POOL[ITEMS[k].r].push(k);
const RARITY = { common: { col: '#e8e0f0', bg: ['#6a6478', '#3a3448'] }, rare: { col: '#6ac8ff', bg: ['#2a7ad8', '#123a8a'] }, epic: { col: '#e08aff', bg: ['#a43aff', '#4a128a'] } };

const ItemArt = {
  cache: {},
  P(d) { return new Path2D(d); },
  paint(ctx, d, col, o = {}) {
    const L = window.__BL, p = typeof d === 'string' ? new Path2D(d) : d;
    try { L.f(ctx, p, col, Object.assign({ lw: 4, hi: 0.35 }, o)); } catch (e) { ctx.fillStyle = col; ctx.fill(p); ctx.lineWidth = 6; ctx.strokeStyle = '#1a0e1c'; ctx.stroke(p); }
  },
  circ(x, y, r) { const p = new Path2D(); p.arc(x, y, r, 0, Math.PI * 2); return p; },
  ell(x, y, rx, ry, rot = 0) { const p = new Path2D(); p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); return p; },
  icon(id, size = 128) {
    const key = id + size; if (this.cache[key]) return this.cache[key];
    const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
    x.translate(size / 2, size / 2); x.scale(size / 128, size / 128); this.draw(x, id);
    this.cache[key] = c; return c;
  },
  draw(x, id) {
    const pt = this.paint.bind(this), P = this.P, circ = this.circ, ell = this.ell;
    switch (id) {
      case 'spike':
        pt(x, ell(0, 30, 50, 16), '#5a5a6a');
        for (let i = -2; i <= 2; i++) pt(x, `M${i * 19 - 10} 30 L${i * 19} ${-30 + Math.abs(i) * 10} L${i * 19 + 10} 30 Z`, '#d8dce8', { hi: 0.5 });
        break;
      case 'oil':
        pt(x, ell(6, 30, 52, 18), '#1a1422'); x.fillStyle = 'rgba(180,140,255,0.55)'; x.beginPath(); x.ellipse(-10, 24, 18, 5, 0, 0, 7); x.fill();
        pt(x, 'M-14 -44 L14 -44 L18 14 L-18 14 Z', '#3a3a48'); pt(x, 'M-12 -30 L12 -30 L12 -18 L-12 -18 Z', '#ffd54a', { lw: 3 });
        break;
      case 'banana':
        pt(x, 'M-48 -18 Q-20 52 46 4 Q2 26 -32 -26 Z', '#ffe14a', { hi: 0.5 }); pt(x, 'M-52 -26 L-40 -32 L-34 -22 Z', '#5a3a1a', { lw: 3 });
        break;
      case 'smoke':
        pt(x, circ(-22, 12, 26), '#8a8498'); pt(x, circ(18, 4, 30), '#aaa4b8'); pt(x, circ(0, -22, 24), '#cac4d8');
        break;
      case 'firemine':
        pt(x, ell(0, 28, 48, 16), '#3a3448'); pt(x, circ(0, 14, 20), '#ff6a1a');
        for (let i = 0; i < 3; i++) pt(x, `M${-26 + i * 26} 8 Q${-34 + i * 26} -30 ${-14 + i * 26} ${-46 - (i % 2) * 14} Q${-6 + i * 26} -20 ${-2 + i * 26} 8 Z`, i % 2 ? '#ffd54a' : '#ff8a2a', { lw: 3 });
        break;
      case 'chain':
        for (let i = 0; i < 4; i++) { x.save(); x.translate(-36 + i * 24, -24 + i * 16); x.rotate(0.6); const o = new Path2D(); o.ellipse(0, 0, 18, 11, 0, 0, 7); o.ellipse(0, 0, 9, 4, 0, 0, 7); x.fillRule = 'evenodd'; pt(x, o, '#c8ccd8', { hi: 0.5 }); x.restore(); }
        break;
      case 'boulder':
        pt(x, 'M-50 18 L-40 -30 L0 -50 L42 -28 L50 20 L14 46 L-32 42 Z', '#8a8070', { hi: 0.4 });
        x.strokeStyle = 'rgba(20,8,16,0.5)'; x.lineWidth = 4; x.beginPath(); x.moveTo(-14, -20); x.lineTo(6, 0); x.lineTo(-4, 24); x.stroke();
        break;
      case 'ice':
        pt(x, 'M0 -54 L32 -10 L18 46 L-18 46 L-32 -10 Z', '#7ad8ff', { hi: 0.6 }); x.strokeStyle = '#fff'; x.lineWidth = 4; x.beginPath(); x.moveTo(0, -44); x.lineTo(0, 36); x.stroke();
        break;
      case 'spring': {
        pt(x, 'M-40 34 L40 34 L40 48 L-40 48 Z', '#6a6a7a');
        x.lineJoin = 'round'; x.strokeStyle = '#1a0e1c'; x.lineWidth = 14; x.beginPath(); for (let i = 0; i < 6; i++) x.lineTo(i % 2 ? 28 : -28, 30 - i * 13); x.stroke();
        x.strokeStyle = '#ffd54a'; x.lineWidth = 7; x.stroke();
        pt(x, 'M-36 -52 L36 -52 L36 -40 L-36 -40 Z', '#e8322a');
        break; }
      case 'barrel':
        pt(x, 'M-32 -46 L32 -46 L40 0 L32 46 L-32 46 L-40 0 Z', '#d8322a', { hi: 0.3 });
        x.fillStyle = '#1a0e1c'; x.fillRect(-40, -22, 80, 8); x.fillRect(-40, 14, 80, 8);
        x.font = '28px "Luckiest Guy",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 6; x.strokeStyle = '#1a0e1c'; x.strokeText('TNT', 0, 0); x.fillStyle = '#ffd54a'; x.fillText('TNT', 0, 0);
        break;
      case 'portal':
        for (let i = 4; i > 0; i--) pt(x, ell(0, 0, i * 13, i * 15), i % 2 ? '#7a2cff' : '#ff4ad8', { lw: 3, hi: 0.2 });
        break;
      case 'megabomb':
        pt(x, circ(0, 10, 44), '#24202e', { hi: 0.45 }); pt(x, 'M-10 -40 L10 -40 L10 -28 L-10 -28 Z', '#6a6a7a', { lw: 3 });
        x.strokeStyle = '#c8905a'; x.lineWidth = 5; x.beginPath(); x.moveTo(0, -40); x.quadraticCurveTo(14, -58, 28, -52); x.stroke();
        pt(x, circ(30, -54, 10), '#ffd54a', { lw: 3 });
        x.font = '30px "Luckiest Guy",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 6; x.strokeStyle = '#1a0e1c'; x.strokeText('XL', 0, 16); x.fillStyle = '#ff5ad8'; x.fillText('XL', 0, 16);
        break;
      case 'double':
        x.save(); x.translate(-18, 10); x.scale(0.62, 0.62); this.draw(x, 'spike'); x.restore();
        x.save(); x.translate(20, -12); x.scale(0.62, 0.62); this.draw(x, 'barrel'); x.restore();
        x.font = '38px "Luckiest Guy",sans-serif'; x.textAlign = 'center'; x.lineWidth = 8; x.strokeStyle = '#1a0e1c'; x.strokeText('x2', 28, 44); x.fillStyle = '#ffd54a'; x.fillText('x2', 28, 44);
        break;
      case 'stun': {
        let d = ''; for (let i = 0; i < 10; i++) { const r = i % 2 ? 22 : 52, a = (i / 10) * Math.PI * 2 - Math.PI / 2; d += (i ? 'L' : 'M') + (Math.cos(a) * r).toFixed(1) + ' ' + (Math.sin(a) * r).toFixed(1); }
        pt(x, d + 'Z', '#ffd54a', { hi: 0.5 }); pt(x, 'M-8 -26 L14 -26 L2 -4 L18 -4 L-12 30 L-2 6 L-16 6 Z', '#7a2cff', { lw: 3 });
        break; }
    }
  },
  /** Card frame (rarity-coloured) with icon, drawn into world ctx at (x,y). */
  card(ctx, x, y, s, id, r, flip = 1, hidden = false) {
    const R = RARITY[r] || RARITY.common;
    ctx.save(); ctx.translate(x, y); ctx.scale(s * Math.max(0.06, Math.abs(flip)), s);
    const p = new Path2D(); p.roundRect(-62, -78, 124, 156, 18);
    const g = ctx.createLinearGradient(0, -78, 0, 78); g.addColorStop(0, hidden ? '#3a2a48' : R.bg[0]); g.addColorStop(1, hidden ? '#1a1024' : R.bg[1]);
    ctx.lineWidth = 12; ctx.strokeStyle = '#140818'; ctx.stroke(p); ctx.fillStyle = g; ctx.fill(p);
    ctx.lineWidth = 4; ctx.strokeStyle = hidden ? '#8a6ae8' : R.col; ctx.stroke(p);
    if (hidden) wText(ctx, '?', 0, 4, 90, '#ffd54a');
    else ctx.drawImage(this.icon(id), -56, -60, 112, 112);
    ctx.restore();
  },
};
