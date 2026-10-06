// Procedural art: planet spheres, installation glyphs, the fortress silhouette.
(function () {
  const SF = globalThis.SF;
  const ART = (SF.art = {});

  // ------------------------------------------------------------ noise
  function hash3(x, y, z, s) {
    let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, z, s) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const L = (a, b, t) => a + (b - a) * t;
    const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, s);
    return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
  }
  function fbm(x, y, z, s, oct) {
    let a = 0.5, f = 1, t = 0, n = 0;
    for (let i = 0; i < (oct || 5); i++) { t += a * vnoise(x * f, y * f, z * f, s + i * 17); n += a; a *= 0.5; f *= 2.03; }
    return t / n;
  }
  ART.fbm = fbm;
  const seedOf = (str) => { let h = 7; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h) % 9973; };

  // ------------------------------------------------------------ palettes
  const lerpC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  function ramp(stops, h) {
    if (h <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) if (h <= stops[i][0]) return lerpC(stops[i - 1][1], stops[i][1], (h - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
    return stops[stops.length - 1][1];
  }
  const PAL = {
    rocky: [[0.3, [60, 52, 48]], [0.5, [112, 98, 86]], [0.65, [150, 136, 118]], [0.8, [190, 180, 165]]],
    moon: [[0.3, [70, 70, 74]], [0.55, [120, 120, 124]], [0.75, [170, 170, 172]]],
    desert: [[0.3, [120, 70, 40]], [0.5, [190, 130, 75]], [0.7, [225, 180, 120]], [0.85, [240, 215, 170]]],
    terran: [[0.42, [14, 40, 90]], [0.5, [30, 80, 140]], [0.52, [190, 180, 130]], [0.6, [60, 120, 55]], [0.72, [40, 90, 40]], [0.82, [120, 110, 90]], [0.9, [240, 240, 245]]],
    arid: [[0.38, [30, 60, 90]], [0.45, [60, 90, 110]], [0.48, [170, 140, 90]], [0.62, [190, 150, 80]], [0.75, [150, 110, 60]], [0.88, [110, 120, 70]]],
    ice: [[0.35, [120, 160, 190]], [0.55, [190, 215, 235]], [0.8, [245, 250, 255]]],
    lava: [[0.3, [25, 15, 12]], [0.55, [50, 32, 26]], [0.75, [80, 55, 45]]],
    exotic: [[0.3, [25, 10, 45]], [0.5, [70, 30, 110]], [0.7, [130, 70, 190]], [0.85, [200, 150, 255]]],
    gas: [[0.2, [120, 70, 40]], [0.4, [200, 150, 100]], [0.6, [230, 200, 160]], [0.8, [170, 110, 70]], [1, [240, 220, 190]]],
    fortress: [[0.3, [35, 38, 44]], [0.6, [70, 75, 82]], [0.85, [110, 112, 118]]],
    capital: [[0.4, [20, 35, 60]], [0.48, [40, 60, 85]], [0.5, [90, 95, 100]], [0.7, [130, 135, 140]], [0.9, [200, 205, 210]]],
  };

  // ------------------------------------------------------------ planet sphere
  const cache = new Map();
  ART.planetSig = function (p) {
    const dead = p.insts.filter((i) => i.hp <= 0).map((i) => i.id.split(':')[1]).join(',');
    return [p.owner, dead, Math.round(p.scorch * 10), Math.round(p.contamination * 10)].join('|');
  };
  // Returns a canvas with a lit sphere (light from direction lx,ly in screen space).
  ART.planetImage = function (p, diam, lx, ly) {
    diam = Math.max(16, Math.min(420, Math.round(diam / 8) * 8));
    const la = Math.round(Math.atan2(ly, lx) / (Math.PI / 12));
    const key = p.id + ':' + diam + ':' + la + ':' + ART.planetSig(p);
    let c = cache.get(key);
    if (c) return c;
    if (cache.size > 80) cache.delete(cache.keys().next().value);
    c = renderPlanet(p, diam, Math.cos(la * Math.PI / 12), Math.sin(la * Math.PI / 12));
    cache.set(key, c);
    return c;
  };
  function renderPlanet(p, D, lx, ly) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = D;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(D, D);
    const d = img.data;
    const s = seedOf(p.id);
    const R = D / 2;
    const type = p.type;
    const pal = PAL[type] || PAL.rocky;
    // light vector (screen x right, y down, z toward viewer)
    let L = [lx * 0.85, ly * 0.85, 0.5]; const ln = Math.hypot(...L); L = L.map((v) => v / ln);
    const craters = p.insts.filter((i) => i.hp <= 0 && !SF.INST[i.type].orbital).map((i) => i.pos);
    const sites = p.insts.filter((i) => !SF.INST[i.type].orbital).map((i) => i.pos);
    const populated = p.pop > 0.05 || type === 'capital';
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
      const nx = (x + 0.5 - R) / R, ny = (y + 0.5 - R) / R;
      const r2 = nx * nx + ny * ny;
      const o = (y * D + x) * 4;
      if (r2 > 1) { d[o + 3] = 0; continue; }
      const nz = Math.sqrt(1 - r2);
      const f = type === 'gas' ? 2.2 : type === 'moon' || type === 'rocky' ? 3.2 : 2.6;
      let h;
      if (type === 'gas') {
        const tw = fbm(nx * 3, ny * 3, nz * 3, s, 4);
        h = 0.5 + 0.5 * Math.sin(ny * 14 + tw * 5);
      } else h = fbm(nx * f + 11, ny * f + 3, nz * f, s, 5);
      let col = ramp(pal, h).slice();
      // craters on airless worlds
      if (type === 'moon' || type === 'rocky' || type === 'asteroid') {
        const cr = vnoise(nx * 9, ny * 9, nz * 9, s + 99);
        if (cr > 0.78) col = lerpC(col, [40, 40, 44], (cr - 0.78) * 3);
      }
      if (type === 'terran' || type === 'capital') {
        const cl = fbm(nx * 4 + 40, ny * 6, nz * 4, s + 5, 4);
        if (Math.abs(ny) > 0.86) col = lerpC(col, [240, 245, 250], 0.85);
        if (cl > 0.55) col = lerpC(col, [245, 248, 252], Math.min(1, (cl - 0.55) * 3) * 0.8);
      }
      if (type === 'fortress') {
        const gx = Math.abs(Math.sin(nx * 30)), gy = Math.abs(Math.sin(ny * 30));
        if (gx < 0.08 || gy < 0.08) col = lerpC(col, [20, 22, 26], 0.6);
      }
      // installation scars: darkened craters with glowing embers
      let ember = 0;
      for (const c of craters) {
        const dd = Math.hypot(nx - c[0], ny - c[1]);
        if (dd < 0.2) { const k = 1 - dd / 0.2; col = lerpC(col, [18, 12, 10], k * 0.9); if (dd < 0.07) ember = Math.max(ember, 1 - dd / 0.07); }
      }
      if (p.scorch > 0) {
        const sc = fbm(nx * 5 + 3, ny * 5, nz * 5, s + 31, 3);
        if (sc < p.scorch * 0.75) col = lerpC(col, [30, 22, 18], 0.55);
      }
      if (p.contamination > 0) {
        const cn = fbm(nx * 4, ny * 4 + 8, nz * 4, s + 71, 3);
        if (cn < p.contamination) col = lerpC(col, [110, 170, 40], 0.45);
      }
      const lam = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      const lit = 0.07 + 0.93 * Math.pow(lam, 0.85);
      let rr = col[0] * lit, gg = col[1] * lit, bb = col[2] * lit;
      // emissive: lava cracks, exotic veins, city lights on the night side
      if (type === 'lava') { const v = fbm(nx * 6, ny * 6, nz * 6, s + 13, 4); if (v > 0.52 && v < 0.58) { const k = 1 - Math.abs(v - 0.55) / 0.03; rr += 255 * k; gg += 110 * k; bb += 20 * k; } }
      if (type === 'exotic') { const v = fbm(nx * 5, ny * 5, nz * 5, s + 19, 4); if (v > 0.5 && v < 0.54) { const k = 1 - Math.abs(v - 0.52) / 0.02; rr += 210 * k; gg += 120 * k; bb += 255 * k; } }
      if (populated && lam < 0.25 && p.owner !== 'destroyed') {
        let near = 0;
        for (const c of sites) near = Math.max(near, 1 - Math.hypot(nx - c[0], ny - c[1]) / 0.35);
        const v = vnoise(nx * 40, ny * 40, nz * 40, s + 3);
        const dens = type === 'capital' ? 0.55 : 0.82 - near * 0.2;
        if (v > dens && h > 0.48) { const k = (0.25 - lam) * 4 * Math.min(1, p.pop / Math.max(p.popMax, 0.01) + 0.2); rr += 255 * k * 0.8; gg += 190 * k * 0.8; bb += 110 * k * 0.6; }
      }
      if (ember > 0) { rr += 255 * ember; gg += 90 * ember; bb += 20 * ember; }
      // limb darkening
      const limb = 0.75 + 0.25 * nz;
      d[o] = Math.min(255, rr * limb); d[o + 1] = Math.min(255, gg * limb); d[o + 2] = Math.min(255, bb * limb);
      d[o + 3] = r2 > 0.985 ? 255 * (1 - (r2 - 0.985) / 0.015) : 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  // Asteroid fields are drawn as clusters of rocks.
  ART.asteroidImage = function (p, diam) {
    diam = Math.max(24, Math.min(360, Math.round(diam / 8) * 8));
    const key = 'ast:' + p.id + ':' + diam + ':' + p.owner;
    let c = cache.get(key);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = diam;
    const ctx = c.getContext('2d');
    const s = seedOf(p.id);
    let rs = s;
    const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * diam * 0.42;
      const x = diam / 2 + Math.cos(a) * r, y = diam / 2 + Math.sin(a) * r * 0.75;
      const sz = diam * (0.03 + rnd() * (i < 3 ? 0.12 : 0.05));
      ctx.beginPath();
      for (let k = 0; k < 8; k++) { const aa = (k / 8) * Math.PI * 2; const rr = sz * (0.7 + rnd() * 0.4); ctx[k ? 'lineTo' : 'moveTo'](x + Math.cos(aa) * rr, y + Math.sin(aa) * rr); }
      ctx.closePath();
      const gr = ctx.createLinearGradient(x - sz, y - sz, x + sz, y + sz);
      gr.addColorStop(0, '#a29a8e'); gr.addColorStop(1, '#2a2622');
      ctx.fillStyle = gr; ctx.fill();
    }
    cache.set(key, c);
    return c;
  };

  // ------------------------------------------------------------ installation glyphs
  // Drawn in a unit box centred on (0,0), radius ~1.
  const GLYPH = {
    shield(c) { c.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 - Math.PI / 2; c.lineTo(Math.cos(a) * 0.85, Math.sin(a) * 0.85); } c.closePath(); c.stroke(); c.beginPath(); c.arc(0, 0.15, 0.4, Math.PI, 0); c.stroke(); },
    cannon(c) { c.beginPath(); c.arc(0, 0.35, 0.45, Math.PI, 0); c.closePath(); c.fill(); c.lineWidth *= 1.8; c.beginPath(); c.moveTo(0, 0.1); c.lineTo(0.65, -0.65); c.stroke(); },
    silo(c) { c.beginPath(); c.moveTo(0, -0.85); c.lineTo(0.3, -0.35); c.lineTo(0.3, 0.55); c.lineTo(0.55, 0.85); c.lineTo(-0.55, 0.85); c.lineTo(-0.3, 0.55); c.lineTo(-0.3, -0.35); c.closePath(); c.fill(); },
    grid(c) { for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(k * 0.45, 0.8); c.lineTo(k * 0.45, -0.2); c.stroke(); c.beginPath(); c.arc(k * 0.45, -0.35, 0.15, 0, Math.PI * 2); c.fill(); } c.beginPath(); c.moveTo(-0.8, 0.8); c.lineTo(0.8, 0.8); c.stroke(); },
    barracks(c) { c.fillRect(-0.8, -0.2, 1.6, 0.9); c.beginPath(); c.moveTo(-0.9, -0.2); c.lineTo(0, -0.8); c.lineTo(0.9, -0.2); c.closePath(); c.fill(); },
    hq(c) { c.beginPath(); c.moveTo(0, -0.85); c.lineTo(0.25, -0.25); c.lineTo(0.85, -0.25); c.lineTo(0.35, 0.15); c.lineTo(0.55, 0.8); c.lineTo(0, 0.4); c.lineTo(-0.55, 0.8); c.lineTo(-0.35, 0.15); c.lineTo(-0.85, -0.25); c.lineTo(-0.25, -0.25); c.closePath(); c.fill(); },
    power(c) { c.beginPath(); c.moveTo(0.15, -0.9); c.lineTo(-0.45, 0.1); c.lineTo(0, 0.1); c.lineTo(-0.15, 0.9); c.lineTo(0.45, -0.15); c.lineTo(0, -0.15); c.closePath(); c.fill(); },
    bunker(c) { c.beginPath(); c.arc(0, 0.5, 0.85, Math.PI, 0); c.closePath(); c.fill(); c.globalCompositeOperation = 'destination-out'; c.fillRect(-0.4, 0.05, 0.8, 0.18); c.globalCompositeOperation = 'source-over'; },
    station(c) { c.beginPath(); c.arc(0, 0, 0.35, 0, Math.PI * 2); c.fill(); c.fillRect(-0.95, -0.12, 0.45, 0.24); c.fillRect(0.5, -0.12, 0.45, 0.24); c.beginPath(); c.moveTo(0, -0.35); c.lineTo(0, -0.85); c.stroke(); },
    mine(c) { c.beginPath(); c.moveTo(-0.8, 0.8); c.lineTo(-0.35, -0.6); c.lineTo(0.35, -0.6); c.lineTo(0.8, 0.8); c.stroke(); c.beginPath(); c.moveTo(-0.55, 0.1); c.lineTo(0.55, 0.1); c.stroke(); c.beginPath(); c.arc(0, -0.75, 0.15, 0, Math.PI * 2); c.fill(); },
    industry(c) { c.beginPath(); c.moveTo(-0.85, 0.8); c.lineTo(-0.85, -0.1); c.lineTo(-0.35, 0.2); c.lineTo(-0.35, -0.1); c.lineTo(0.15, 0.2); c.lineTo(0.15, -0.8); c.lineTo(0.45, -0.8); c.lineTo(0.45, 0.2); c.lineTo(0.85, 0.2); c.lineTo(0.85, 0.8); c.closePath(); c.fill(); },
    city(c) { c.fillRect(-0.85, -0.1, 0.4, 0.9); c.fillRect(-0.35, -0.75, 0.35, 1.55); c.fillRect(0.1, -0.4, 0.35, 1.2); c.fillRect(0.55, 0.1, 0.3, 0.7); },
  };
  ART.drawGlyph = function (c, icon, x, y, r, color) {
    c.save(); c.translate(x, y); c.scale(r, r);
    c.fillStyle = color; c.strokeStyle = color; c.lineWidth = 0.16; c.lineJoin = 'round'; c.lineCap = 'round';
    (GLYPH[icon] || GLYPH.barracks)(c);
    c.restore();
  };
  const glyphUrl = new Map();
  ART.glyphURL = function (icon, color) {
    const k = icon + color;
    if (glyphUrl.has(k)) return glyphUrl.get(k);
    const cv = document.createElement('canvas'); cv.width = cv.height = 48;
    const c = cv.getContext('2d');
    c.strokeStyle = color; c.globalAlpha = 0.5; c.lineWidth = 2;
    c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c.lineTo(24 + Math.cos(a) * 22, 24 + Math.sin(a) * 22); } c.closePath(); c.stroke();
    c.globalAlpha = 1;
    ART.drawGlyph(c, icon, 24, 24, 12, color);
    const u = cv.toDataURL();
    glyphUrl.set(k, u);
    return u;
  };
  // Schematic silhouette of a weapon module, drawn as a blueprint-style line art, for the dock tiles.
  const moduleCache = new Map();
  ART.moduleSilhouette = function (wid, col) {
    const key = wid + (col || '');
    if (moduleCache.has(key)) return moduleCache.get(key);
    const W = 140, H = 72;
    const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
    const c = cv.getContext('2d'); c.scale(2, 2);
    c.strokeStyle = col || '#7fd0ff'; c.fillStyle = col || '#7fd0ff'; c.lineWidth = 1.6; c.lineJoin = 'round'; c.globalAlpha = 0.9;
    c.translate(0, 4);
    const fill = (a) => { c.save(); c.globalAlpha = (a || 0.18); c.fill(); c.restore(); c.stroke(); };
    if (wid === 'railgun') {
      // long spinal barrel with coil rings on a mount
      c.fillStyle = col || '#7fd0ff';
      c.beginPath(); c.rect(10, 30, 26, 22); fill(0.2);
      c.beginPath(); c.rect(34, 34, 92, 12); fill(0.15);
      for (let x = 42; x < 120; x += 12) { c.beginPath(); c.rect(x, 31, 4, 18); fill(0.3); }
      c.beginPath(); c.rect(124, 30, 8, 20); fill(0.25);
    } else if (wid === 'laser') {
      // dome turret + emitter barrel + heat fins
      c.beginPath(); c.arc(44, 46, 26, Math.PI, 0); fill(0.18);
      c.beginPath(); c.rect(60, 38, 66, 14); fill(0.15);
      for (let x = 66; x < 120; x += 10) { c.beginPath(); c.moveTo(x, 34); c.lineTo(x + 4, 28); c.stroke(); }
      c.beginPath(); c.arc(126, 45, 5, 0, Math.PI * 2); fill(0.5);
    } else if (wid === 'missile') {
      // rack of tubes with warheads
      c.beginPath(); c.rect(16, 40, 108, 16); fill(0.15);
      for (let i = 0; i < 6; i++) { const x = 24 + i * 17; c.beginPath(); c.rect(x, 18, 11, 24); fill(0.2); c.beginPath(); c.moveTo(x, 18); c.lineTo(x + 5.5, 8); c.lineTo(x + 11, 18); fill(0.35); }
    } else if (wid === 'bombard') {
      // cluster of stubby mass-driver pods
      for (let i = 0; i < 4; i++) { const x = 22 + i * 26; c.beginPath(); c.rect(x, 26, 20, 30); fill(0.18); c.beginPath(); c.rect(x + 5, 52, 10, 10); fill(0.3); }
    } else { // planet killer: focusing ring + core
      c.beginPath(); c.ellipse(70, 40, 46, 30, 0, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.ellipse(70, 40, 30, 19, 0, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(70, 40, 9, 0, Math.PI * 2); fill(0.6);
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; c.beginPath(); c.moveTo(70 + Math.cos(a) * 46, 40 + Math.sin(a) * 30); c.lineTo(70 + Math.cos(a) * 52, 40 + Math.sin(a) * 34); c.stroke(); }
    }
    const url = cv.toDataURL();
    moduleCache.set(key, url);
    return url;
  };

  ART.instColor = function (p, i) {
    if (i.hp <= 0) return '#5a5a5a';
    if (p.owner === 'player') return '#6dff9c';
    if (p.owner === 'neutral') return '#e8dca0';
    if (i.disabled) return '#7fd0ff';
    if (SF.INST[i.type].econ) return '#ffd27a';
    return '#ff6a4d';
  };

  // ------------------------------------------------------------ fortress
  // Local frame: +x along the spine toward the barrel tip. Returns muzzle points (screen space).
  ART.drawFortress = function (c, ox, oy, sc, ang, g, t, st) {
    st = st || {};
    const has = (u) => g && SF.has(g, u);
    const pts = {};
    const T = (x, y) => [ox + (x * Math.cos(ang) - y * Math.sin(ang)) * sc, oy + (x * Math.sin(ang) + y * Math.cos(ang)) * sc];
    c.save(); c.translate(ox, oy); c.rotate(ang); c.scale(sc, sc);
    const recoil = st.recoil || 0;

    // ---- Planet Killer ring (behind)
    const pkBuilt = has('fort_pk');
    const prog = pkBuilt ? 1 : has('fort_modules') ? 0.7 : has('fort_reactor') ? 0.45 : 0.25;
    c.save(); c.translate(-90, 0);
    c.lineWidth = 16;
    const segs = 28;
    for (let k = 0; k < segs; k++) {
      const a0 = (k / segs) * Math.PI * 2, a1 = ((k + 0.82) / segs) * Math.PI * 2;
      if (k / segs > prog) { c.strokeStyle = 'rgba(120,90,60,0.25)'; c.setLineDash([3, 6]); c.lineWidth = 4; }
      else { c.strokeStyle = pkBuilt ? '#3a2438' : '#2f3238'; c.setLineDash([]); c.lineWidth = 16; }
      c.beginPath(); c.ellipse(0, 0, 120, 300, 0, a0, a1); c.stroke();
    }
    c.setLineDash([]);
    if (pkBuilt) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2) + (st.pkCharge || 0) * 2;
      c.strokeStyle = `rgba(255,80,220,${0.25 + 0.2 * pulse})`; c.lineWidth = 5;
      c.shadowColor = '#ff4bd8'; c.shadowBlur = 20 + pulse * 10;
      c.beginPath(); c.ellipse(0, 0, 108, 286, 0, 0, Math.PI * 2); c.stroke();
      c.shadowBlur = 0;
    } else {
      // construction lights
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 * prog; if (Math.sin(t * 3 + k) > 0.3) { c.fillStyle = '#ffa040'; c.fillRect(Math.cos(a) * 120 - 3, Math.sin(a) * 300 - 3, 6, 6); } }
    }
    c.restore();

    // ---- troop bays (rear underside)
    const bays = has('troop_bay') ? 2 : 1;
    for (let b = 0; b < bays; b++) {
      const bx = -360 + b * 95;
      c.fillStyle = '#1b2026'; c.fillRect(bx, 50, 85, 70);
      c.strokeStyle = '#3a444e'; c.lineWidth = 2; c.strokeRect(bx, 50, 85, 70);
      for (let w = 0; w < 5; w++) { c.fillStyle = Math.sin(t * 0.7 + w + b) > -0.6 ? '#ffcf7a' : '#3a2c18'; c.fillRect(bx + 8 + w * 15, 100, 9, 5); }
    }
    // ---- bombardment drivers (underside)
    for (let k = 0; k < 4; k++) { c.fillStyle = '#20262c'; c.fillRect(-240 + k * 55, 70, 40, 34); c.fillStyle = '#0c0f12'; c.fillRect(-232 + k * 55, 100, 24, 14); }
    pts.bombard = T(-150, 115);

    // ---- main hull
    const hg = c.createLinearGradient(0, -90, 0, 90);
    hg.addColorStop(0, '#59636d'); hg.addColorStop(0.45, '#2c333a'); hg.addColorStop(1, '#14181c');
    c.fillStyle = hg;
    c.beginPath(); c.moveTo(-420, -60); c.lineTo(-300, -88); c.lineTo(80, -78); c.lineTo(190, -40); c.lineTo(210, 0); c.lineTo(190, 42); c.lineTo(80, 80); c.lineTo(-300, 92); c.lineTo(-420, 70); c.closePath(); c.fill();
    c.strokeStyle = '#7a8692'; c.lineWidth = 1.5; c.stroke();
    // armour plate seams
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2;
    for (let x = -380; x < 180; x += 46) { c.beginPath(); c.moveTo(x, -80); c.lineTo(x + 8, 84); c.stroke(); }
    c.strokeStyle = 'rgba(160,175,190,0.18)';
    for (let x = -360; x < 160; x += 92) { c.strokeRect(x, -60, 60, 26); c.strokeRect(x + 20, 22, 50, 30); }
    // pipes
    c.strokeStyle = '#6b5a3a'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(-400, -30); c.bezierCurveTo(-250, -50, -120, -10, 60, -36); c.stroke();
    c.strokeStyle = '#3d5a66'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(-400, 30); c.bezierCurveTo(-260, 50, -100, 10, 90, 40); c.stroke();
    // gantry truss on top
    c.strokeStyle = '#4a545e'; c.lineWidth = 2;
    for (let x = -300; x < 60; x += 30) { c.beginPath(); c.moveTo(x, -88); c.lineTo(x + 15, -104); c.lineTo(x + 30, -88); c.stroke(); }
    c.beginPath(); c.moveTo(-300, -104); c.lineTo(75, -104); c.stroke();

    // ---- missile racks (top)
    const racks = has('mis_smart') ? 6 : 3;
    for (let k = 0; k < racks; k++) {
      const rx = -280 + k * 52;
      c.fillStyle = '#262d33'; c.fillRect(rx, -132, 44, 28);
      for (let m = 0; m < 3; m++) {
        const loaded = !(st.missileFired && t - st.missileFired < 1.5 && m === k % 3);
        c.fillStyle = loaded ? '#c9c2b0' : '#111';
        c.fillRect(rx + 5 + m * 13, -142, 8, 16);
        if (loaded) { c.fillStyle = '#ff5a3a'; c.fillRect(rx + 5 + m * 13, -146, 8, 5); }
      }
    }
    pts.missile = T(-200, -150);

    // ---- reactor
    const rr = has('fort_modules') ? 54 : has('fort_reactor') ? 46 : 38;
    const flick = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 2.3);
    const rg = c.createRadialGradient(-60, 0, 2, -60, 0, rr * 1.8);
    rg.addColorStop(0, `rgba(255,240,200,${flick})`); rg.addColorStop(0.3, `rgba(255,150,60,${0.8 * flick})`); rg.addColorStop(1, 'rgba(255,80,20,0)');
    c.fillStyle = rg; c.beginPath(); c.arc(-60, 0, rr * 1.8, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#8a7a60'; c.lineWidth = 6; c.beginPath(); c.arc(-60, 0, rr, 0, Math.PI * 2); c.stroke();
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + t * 0.2; c.beginPath(); c.moveTo(-60 + Math.cos(a) * rr, Math.sin(a) * rr); c.lineTo(-60 + Math.cos(a) * (rr + 14), Math.sin(a) * (rr + 14)); c.stroke(); }

    // ---- laser turret
    if (has('laser_unlock')) {
      c.save(); c.translate(40, -84);
      c.fillStyle = '#3a3f46'; c.beginPath(); c.arc(0, 0, 34, Math.PI, 0); c.fill();
      c.strokeStyle = '#8a929a'; c.lineWidth = 2; c.stroke();
      c.rotate(-0.35);
      c.fillStyle = '#2a2e33'; c.fillRect(0, -10, 90, 20);
      const heat = (g && g.weapons.laser.heat) / 100 || 0;
      c.fillStyle = `rgb(${120 + heat * 135},${60 + heat * 40},${40})`; c.fillRect(70, -12, 24, 24);
      c.restore();
      pts.laser = T(40 + Math.cos(-0.35) * 94, -84 + Math.sin(-0.35) * 94);
    }

    // ---- railgun barrel(s)
    const barrels = has('rail_twin') ? [-0, -46] : [0];
    const charge = st.railCharge || 0;
    for (const by of barrels) {
      c.save(); c.translate(-recoil * 30, by);
      c.fillStyle = '#1e2328';
      c.fillRect(160, -22, 560, 44);
      c.fillStyle = '#3c454e'; c.fillRect(160, -22, 560, 7); c.fillRect(160, 15, 560, 7);
      // coil rings
      for (let x = 180; x < 710; x += 34) {
        const glow = charge > 0 ? Math.max(0, Math.sin(t * 20 - x * 0.04)) * charge : 0;
        c.fillStyle = glow > 0.05 ? `rgba(120,220,255,${0.4 + glow * 0.6})` : '#4a535c';
        c.fillRect(x, -27, 10, 54);
      }
      // muzzle brake
      c.fillStyle = '#2b3138'; c.fillRect(712, -30, 34, 60);
      c.fillStyle = '#0a0c0e'; c.fillRect(740, -10, 8, 20);
      c.restore();
    }
    pts.railgun = T(760 - recoil * 30, barrels.length > 1 ? -23 : 0);

    // ---- beacons
    for (const [bx, by] of [[-410, -55], [180, -40], [180, 40], [-410, 65], [740, -30]]) {
      if (Math.sin(t * 4 + bx) > 0.6) { c.fillStyle = '#ff3b30'; c.shadowColor = '#ff3b30'; c.shadowBlur = 12; c.fillRect(bx - 3, by - 3, 6, 6); c.shadowBlur = 0; }
    }
    // ---- damage: fires and sparks
    if (g) {
      const dmg = 1 - g.fort.hull / SF.hullMax(g);
      const n = Math.floor(dmg * 7);
      for (let k = 0; k < n; k++) {
        const fx = -380 + ((k * 137) % 540), fy = -60 + ((k * 71) % 120);
        const fl = 0.6 + 0.4 * Math.sin(t * 12 + k * 3);
        c.fillStyle = `rgba(255,${100 + 60 * fl},30,${0.7 * fl})`;
        c.beginPath(); c.arc(fx, fy, 6 + 6 * fl, 0, Math.PI * 2); c.fill();
      }
    }
    c.restore();
    pts.pk = T(-90, 0);
    pts.center = T(-60, 0);
    return pts;
  };
})();
