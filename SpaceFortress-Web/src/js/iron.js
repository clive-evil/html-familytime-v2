// Industrial canvas material toolkit. Reusable "physical machine" primitives shared by
// the Command Deck, the Railgun station and the Planet Killer chamber.
// Everything is drawn in device-independent units; callers set up their own transform/scale.
(function () {
  const SF = globalThis.SF;
  const IRON = (SF.iron = {});
  const R = (seed) => { let s = seed | 0 || 1; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); };

  // Deterministic scratch/grime pattern baked once per size.
  const grimeCache = new Map();
  function grime(w, h, seed) {
    const key = w + 'x' + h + ':' + seed;
    let cv = grimeCache.get(key);
    if (cv) return cv;
    if (grimeCache.size > 40) grimeCache.delete(grimeCache.keys().next().value);
    cv = document.createElement('canvas'); cv.width = Math.max(2, w | 0); cv.height = Math.max(2, h | 0);
    const c = cv.getContext('2d');
    const rnd = R(seed);
    // streaks
    for (let i = 0; i < w * h / 900; i++) {
      const x = rnd() * w, y = rnd() * h, len = 4 + rnd() * 26, dark = rnd() < 0.5;
      c.strokeStyle = dark ? `rgba(0,0,0,${0.04 + rnd() * 0.1})` : `rgba(255,255,255,${0.02 + rnd() * 0.05})`;
      c.lineWidth = rnd() < 0.8 ? 1 : 2;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rnd() - 0.5) * len, y + (rnd() - 0.5) * len * 0.4); c.stroke();
    }
    // grime blotches near edges
    for (let i = 0; i < w * h / 6000; i++) {
      const edge = rnd(); const x = edge < 0.5 ? rnd() * w : rnd() < 0.5 ? rnd() * 20 : w - rnd() * 20; const y = rnd() * h;
      const g = c.createRadialGradient(x, y, 0, x, y, 8 + rnd() * 30);
      g.addColorStop(0, `rgba(0,0,0,${0.05 + rnd() * 0.12})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x - 40, y - 40, 80, 80);
    }
    grimeCache.set(key, cv);
    return cv;
  }

  // Bolt / rivet head.
  IRON.bolt = function (c, x, y, r, hex) {
    r = r || 5;
    const g = c.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#8a929a'); g.addColorStop(0.6, '#4a525a'); g.addColorStop(1, '#20262c');
    c.fillStyle = g;
    c.beginPath();
    if (hex) { for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + 0.5; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); }
    else c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1; c.stroke();
    // slot / cross
    c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = Math.max(1, r * 0.22);
    c.beginPath(); c.moveTo(x - r * 0.5, y); c.lineTo(x + r * 0.5, y); c.stroke();
    // highlight
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, r * 0.22, 0, Math.PI * 2); c.fill();
  };

  // A heavy steel plate with bevelled edge, baked grime and corner bolts.
  // opts: { tint:[r,g,b], bolts:true, inset:bool, seed, bevel, radius }
  IRON.plate = function (c, x, y, w, h, opts) {
    opts = opts || {};
    const t = opts.tint || [58, 64, 70];
    const bev = opts.bevel == null ? 6 : opts.bevel;
    const lo = `rgb(${t[0] * 0.45 | 0},${t[1] * 0.45 | 0},${t[2] * 0.45 | 0})`;
    const mid = `rgb(${t[0]},${t[1]},${t[2]})`;
    const hi = `rgb(${Math.min(255, t[0] * 1.5) | 0},${Math.min(255, t[1] * 1.5) | 0},${Math.min(255, t[2] * 1.5) | 0})`;
    // outer dark frame
    c.fillStyle = '#0a0d10'; c.fillRect(x - 2, y - 2, w + 4, h + 4);
    // bevel highlight (top/left) and shadow (bottom/right)
    c.fillStyle = opts.inset ? lo : hi; c.fillRect(x, y, w, h);
    c.fillStyle = opts.inset ? hi : lo; c.beginPath(); c.moveTo(x + w, y); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.lineTo(x + bev, y + h - bev); c.lineTo(x + w - bev, y + h - bev); c.lineTo(x + w - bev, y + bev); c.closePath(); c.fill();
    // face
    const g = c.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, opts.inset ? lo : mid); g.addColorStop(0.5, mid); g.addColorStop(1, opts.inset ? mid : lo);
    c.fillStyle = g; c.fillRect(x + bev, y + bev, w - bev * 2, h - bev * 2);
    // grime overlay
    try { const gr = grime(w - bev * 2, h - bev * 2, (opts.seed || 1) + (w | 0)); c.globalAlpha = 0.9; c.drawImage(gr, x + bev, y + bev); c.globalAlpha = 1; } catch (e) {}
    if (opts.bolts !== false) {
      const m = Math.min(14, bev + 7);
      for (const [bx, by] of [[x + m, y + m], [x + w - m, y + m], [x + m, y + h - m], [x + w - m, y + h - m]]) IRON.bolt(c, bx, by, opts.boltR || 5, true);
    }
  };

  // Recessed dark housing (for screens, meters set into a panel).
  IRON.recess = function (c, x, y, w, h, col) {
    c.fillStyle = '#05080a'; c.fillRect(x - 3, y - 3, w + 6, h + 6);
    const g = c.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#000'); g.addColorStop(0.5, col || '#0b1014'); g.addColorStop(1, '#02060a');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, 1); // top inner highlight
  };

  // Diagonal hazard stripes inside a rect (clipped).
  IRON.hazard = function (c, x, y, w, h, a, col) {
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.fillStyle = '#16140c'; c.fillRect(x, y, w, h);
    const step = 26; col = col || '#d8a010';
    for (let i = -h; i < w + h; i += step * 2) {
      c.fillStyle = col; c.globalAlpha = a == null ? 1 : a;
      c.beginPath(); c.moveTo(x + i, y); c.lineTo(x + i + step, y); c.lineTo(x + i + step - h, y + h); c.lineTo(x + i - h, y + h); c.fill();
    }
    c.globalAlpha = 1; c.restore();
  };

  // Physical indicator lamp with bezel + glow. state: 0 off, 1 on. col css.
  IRON.lamp = function (c, x, y, r, on, col, label, labelCol) {
    // metal bezel
    const bg = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r * 1.5);
    bg.addColorStop(0, '#5a636b'); bg.addColorStop(1, '#1a1f24');
    c.fillStyle = bg; c.beginPath(); c.arc(x, y, r * 1.45, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#0a0d10'; c.lineWidth = 2; c.stroke();
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; IRON.bolt(c, x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3, r * 0.22); }
    // dome
    if (on) { c.save(); c.shadowColor = col; c.shadowBlur = r * 2.2; }
    const lg = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    if (on) { lg.addColorStop(0, '#fff'); lg.addColorStop(0.35, col); lg.addColorStop(1, shade(col, 0.5)); }
    else { lg.addColorStop(0, shade(col, 0.4)); lg.addColorStop(1, shade(col, 0.15)); }
    c.fillStyle = lg; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    if (on) c.restore();
    // glass highlight
    c.fillStyle = 'rgba(255,255,255,0.4)'; c.beginPath(); c.ellipse(x - r * 0.3, y - r * 0.4, r * 0.3, r * 0.18, -0.6, 0, Math.PI * 2); c.fill();
    if (label) { c.fillStyle = labelCol || '#aeb8c0'; c.font = `600 ${Math.round(r * 0.9)}px Bahnschrift, "Arial Narrow", sans-serif`; c.textAlign = 'center'; c.fillText(label, x, y + r * 2.6); }
  };

  // Analogue gauge: a dial face with coloured zones + needle at value v (0..1).
  // zones: [[from,to,col],...]. opts: { label, big }
  IRON.gauge = function (c, x, y, r, v, zones, opts) {
    opts = opts || {};
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25; // 270deg sweep, opening at bottom
    // housing
    const hg = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r * 1.35);
    hg.addColorStop(0, '#6a737b'); hg.addColorStop(1, '#161b20');
    c.fillStyle = hg; c.beginPath(); c.arc(x, y, r * 1.3, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#0a0d10'; c.lineWidth = 3; c.stroke();
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; IRON.bolt(c, x + Math.cos(a) * r * 1.22, y + Math.sin(a) * r * 1.22, r * 0.12); }
    // face
    c.fillStyle = '#0c1013'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    // zones
    c.lineWidth = r * 0.14;
    for (const [f, t, col] of (zones || [[0, 1, '#2a7a4a']])) { c.strokeStyle = col; c.beginPath(); c.arc(x, y, r * 0.82, a0 + (a1 - a0) * f, a0 + (a1 - a0) * t); c.stroke(); }
    // ticks
    for (let k = 0; k <= 10; k++) { const a = a0 + (a1 - a0) * k / 10; c.strokeStyle = '#8a929a'; c.lineWidth = k % 5 ? 1 : 2.5; c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62); c.lineTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72); c.stroke(); }
    // needle
    const na = a0 + (a1 - a0) * SF.clamp(v, 0, 1);
    c.save(); c.translate(x, y); c.rotate(na);
    c.fillStyle = '#e8edf2'; c.beginPath(); c.moveTo(-r * 0.12, 0); c.lineTo(r * 0.7, -r * 0.035); c.lineTo(r * 0.78, 0); c.lineTo(r * 0.7, r * 0.035); c.closePath(); c.fill();
    c.fillStyle = '#ff5a3a'; c.fillRect(r * 0.5, -r * 0.03, r * 0.28, r * 0.06);
    c.restore();
    c.fillStyle = '#3a424a'; c.beginPath(); c.arc(x, y, r * 0.11, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#6a737b'; c.beginPath(); c.arc(x - r * 0.03, y - r * 0.03, r * 0.05, 0, Math.PI * 2); c.fill();
    // glass glare
    c.fillStyle = 'rgba(255,255,255,0.05)'; c.beginPath(); c.arc(x, y, r, Math.PI * 1.1, Math.PI * 1.7); c.arc(x, y, r * 0.4, Math.PI * 1.7, Math.PI * 1.1, true); c.fill();
    if (opts.label) { c.fillStyle = '#9aa4ac'; c.font = `600 ${Math.round(r * 0.28)}px Bahnschrift, sans-serif`; c.textAlign = 'center'; c.fillText(opts.label, x, y + r * 0.45); }
  };

  // Segmented bar meter embedded in a recess. v 0..1. col for lit segs. n segments.
  IRON.segMeter = function (c, x, y, w, h, v, n, col, vertical) {
    IRON.recess(c, x, y, w, h);
    n = n || Math.round((vertical ? h : w) / 14);
    const gap = 3;
    const lit = Math.round(SF.clamp(v, 0, 1) * n);
    for (let i = 0; i < n; i++) {
      const on = i < lit;
      let sx, sy, sw, sh;
      if (vertical) { sw = w - 6; sh = (h - 6) / n - gap; sx = x + 3; sy = y + h - 3 - (i + 1) * ((h - 6) / n) + gap / 2; }
      else { sw = (w - 6) / n - gap; sh = h - 6; sx = x + 3 + i * ((w - 6) / n) + gap / 2; sy = y + 3; }
      let cc = col;
      if (col === 'thermo') cc = i / n < 0.6 ? '#4bd27a' : i / n < 0.85 ? '#ffc23a' : '#ff3b30';
      if (on) { c.save(); c.shadowColor = cc; c.shadowBlur = 8; c.fillStyle = cc; c.fillRect(sx, sy, sw, sh); c.restore(); c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(sx, sy, sw, Math.max(1, sh * 0.25)); }
      else { c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(sx, sy, sw, sh); }
    }
  };

  // A length of insulated pipe between two points, with a highlight and optional flow.
  IRON.pipe = function (c, x0, y0, x1, y1, w, col, flow, t) {
    col = col || '#4a4038';
    c.lineCap = 'round';
    c.strokeStyle = '#0a0d10'; c.lineWidth = w + 4; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = w * 0.3; c.beginPath(); c.moveTo(x0, y0 - w * 0.25); c.lineTo(x1, y1 - w * 0.25); c.stroke();
    if (flow) { c.strokeStyle = flow; c.lineWidth = w * 0.4; c.setLineDash([w * 0.8, w * 1.2]); c.lineDashOffset = -(t || 0) * 60; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.setLineDash([]); }
    // bands
    const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    for (let d = 20; d < len; d += 46) { const bx = x0 + ux * d, by = y0 + uy * d; c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = w + 3; c.beginPath(); c.moveTo(bx - uy * w * 0.6, by + ux * w * 0.6); c.lineTo(bx + uy * w * 0.6, by - ux * w * 0.6); c.stroke(); }
  };

  // Bundle of cables along a bezier.
  IRON.cables = function (c, pts, cols, t) {
    cols = cols || ['#5a3a2a', '#2a3a4a', '#3a3a3a', '#4a4030'];
    for (let i = 0; i < cols.length; i++) {
      const off = (i - cols.length / 2) * 4;
      c.strokeStyle = cols[i]; c.lineWidth = 3.5; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1] + off);
      for (let k = 1; k < pts.length - 1; k++) c.quadraticCurveTo(pts[k][0], pts[k][1] + off + Math.sin((t || 0) + i) * 1.5, (pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2 + off);
      c.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1] + off);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1; c.stroke();
    }
  };

  // Stencil / engraved label on a bolted plate.
  IRON.plate_label = function (c, x, y, w, h, text, opts) {
    opts = opts || {};
    IRON.plate(c, x, y, w, h, { tint: opts.tint || [42, 46, 50], bevel: 3, bolts: opts.bolts !== false, boltR: 3.5, seed: (text.length * 7) });
    IRON.stencil(c, text, x + w / 2, y + h / 2 + (opts.size || 15) * 0.35, opts.size || 15, opts.col || '#cdd5dc', 'center');
  };
  // Stencil-style engraved text (double-drawn for carved depth).
  IRON.stencil = function (c, text, x, y, size, col, align) {
    c.font = `800 ${size}px "Bahnschrift", "DIN Alternate", "Roboto Condensed", "Arial Narrow", sans-serif`;
    c.textAlign = align || 'left';
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillText(text, x, y + Math.max(1, size * 0.06));
    c.fillStyle = col || '#cdd5dc'; c.fillText(text, x, y);
  };
  // 7-seg style readout string on a recessed display.
  IRON.readout = function (c, x, y, w, h, text, col) {
    IRON.recess(c, x, y, w, h, '#0a0f0b');
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.font = `${h * 0.62}px "Consolas", "Menlo", monospace`; c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(120,255,160,0.08)'; c.fillText('88888888'.slice(0, text.length + 2), x + w - 8, y + h / 2);
    c.save(); c.shadowColor = col || '#7dffb0'; c.shadowBlur = 8; c.fillStyle = col || '#7dffb0'; c.fillText(text, x + w - 8, y + h / 2); c.restore();
    c.textBaseline = 'alphabetic'; c.restore();
  };

  // Chunky toggle switch. on bool. vertical.
  IRON.toggle = function (c, x, y, w, h, on, col) {
    IRON.recess(c, x, y, w, h);
    const tg = c.createLinearGradient(x, y, x, y + h);
    tg.addColorStop(0, '#6a737b'); tg.addColorStop(1, '#2a3036');
    const kh = h * 0.42;
    const ky = on ? y + 3 : y + h - kh - 3;
    c.fillStyle = tg; c.fillRect(x + 3, ky, w - 6, kh);
    c.strokeStyle = '#0a0d10'; c.strokeRect(x + 3, ky, w - 6, kh);
    c.fillStyle = on ? (col || '#6dff9c') : '#20262c'; c.fillRect(x + 3, ky + (on ? 0 : kh - 4), w - 6, 4);
    c.fillStyle = 'rgba(255,255,255,0.2)'; c.fillRect(x + 4, ky + 2, w - 8, 3);
  };

  const shadeCache = {};
  function shade(col, f) {
    const k = col + f; if (shadeCache[k]) return shadeCache[k];
    let r, g, b;
    if (col[0] === '#') { const n = parseInt(col.slice(1), 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
    else { const m = col.match(/\d+/g); r = +m[0]; g = +m[1]; b = +m[2]; }
    const out = `rgb(${r * f | 0},${g * f | 0},${b * f | 0})`;
    shadeCache[k] = out; return out;
  }
  IRON.shade = shade;

  // Rugged military screen frame: a recessed CRT/LCD with scanlines, curved glare, bezel bolts.
  IRON.screen = function (c, x, y, w, h, drawInside, t) {
    IRON.plate(c, x - 10, y - 10, w + 20, h + 20, { tint: [34, 38, 42], bevel: 5, seed: (w | 0) + 3 });
    IRON.recess(c, x, y, w, h, '#020604');
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    if (drawInside) drawInside(c);
    // scanlines
    c.fillStyle = 'rgba(0,0,0,0.12)'; for (let yy = y; yy < y + h; yy += 3) c.fillRect(x, yy, w, 1.2);
    // rolling bright line
    const roll = y + ((t || 0) * 60 % (h + 40)) - 20;
    c.fillStyle = 'rgba(120,200,255,0.03)'; c.fillRect(x, roll, w, 24);
    // curved glare
    const gl = c.createLinearGradient(x, y, x + w * 0.6, y + h * 0.6);
    gl.addColorStop(0, 'rgba(255,255,255,0.07)'); gl.addColorStop(0.4, 'rgba(255,255,255,0)');
    c.fillStyle = gl; c.fillRect(x, y, w, h);
    c.restore();
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 2; c.strokeRect(x, y, w, h);
  };

  // Warning placard with hazard border + text (asymmetric mount optional).
  IRON.placard = function (c, x, y, w, h, lines, opts) {
    opts = opts || {};
    c.save();
    if (opts.rot) { c.translate(x + w / 2, y + h / 2); c.rotate(opts.rot); c.translate(-(x + w / 2), -(y + h / 2)); }
    IRON.hazard(c, x, y, w, h, 1, opts.col || '#d8a010');
    const m = 6;
    c.fillStyle = opts.bg || '#14120a'; c.fillRect(x + m, y + m, w - m * 2, h - m * 2);
    IRON.bolt(c, x + 9, y + 9, 4); IRON.bolt(c, x + w - 9, y + 9, 4); IRON.bolt(c, x + 9, y + h - 9, 4); IRON.bolt(c, x + w - 9, y + h - 9, 4);
    const lh = (h - m * 2) / lines.length;
    lines.forEach((l, i) => IRON.stencil(c, l, x + w / 2, y + m + lh * (i + 0.72), Math.min(lh * 0.6, opts.size || 16), i === 0 ? (opts.title || '#ffcf4a') : '#e8dca0', 'center'));
    c.restore();
  };
})();
