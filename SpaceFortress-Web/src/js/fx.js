// Screen-space effects. Targets are anchor functions so effects track a moving camera.
(function () {
  const SF = globalThis.SF;
  const FX = (SF.fx = { parts: [], effects: [], shakeT: 0, shakeA: 0, flashA: 0, flashC: '#fff', time: 0 });
  const rnd = (a, b) => a + Math.random() * (b - a);
  const P = (x) => { const v = (typeof x === 'function' ? x() : x); return v && isFinite(v[0]) && isFinite(v[1]) ? v : [SF.render.W / 2, SF.render.H / 2]; };

  FX.shake = function (a, dur) { FX.shakeA = Math.max(FX.shakeA, a); FX.shakeT = Math.max(FX.shakeT, dur || 0.4); };
  FX.flash = function (c, a) { FX.flashC = c || '#fff'; FX.flashA = Math.max(FX.flashA, a || 0.6); };
  FX.offset = function () {
    if (FX.shakeT <= 0) return [0, 0];
    const k = FX.shakeA * Math.min(1, FX.shakeT * 3);
    return [rnd(-k, k), rnd(-k, k)];
  };
  const R0 = (v, d) => (isFinite(v) && v >= 0 ? v : (d || 0));
  FX.part = function (o) { FX.parts.push(Object.assign({ vx: 0, vy: 0, life: 1, max: 1, size: 2, color: '#fff', drag: 0.98, grav: 0, type: 'spark' }, o)); };

  FX.explosion = function (at, size, color) {
    const [x, y] = P(at); size = size || 1;
    FX.effects.push({ t: 0, dur: 0.9 + size * 0.3, draw(c, e) {
      const k = e.t / e.dur;
      c.save(); c.globalCompositeOperation = 'lighter';
      const r = 10 + size * 70 * Math.pow(k, 0.5);
      const g = c.createRadialGradient(x, y, 0, x, y, R0(r, 1));
      g.addColorStop(0, `rgba(255,255,230,${(1 - k) * 0.95})`); g.addColorStop(0.35, `rgba(255,${color === 'emp' ? 200 : 150},${color === 'emp' ? 255 : 50},${(1 - k) * 0.7})`); g.addColorStop(1, 'rgba(255,60,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = color === 'emp' ? `rgba(140,220,255,${1 - k})` : `rgba(255,220,180,${(1 - k) * 0.8})`;
      c.lineWidth = 3 * (1 - k) + 1;
      c.beginPath(); c.ellipse(x, y, Math.max(0.01, size * 140 * k), Math.max(0.01, size * 70 * k), 0, 0, Math.PI * 2); c.stroke();
      c.restore();
    } });
    for (let i = 0; i < 26 * size; i++) { const a = rnd(0, 6.283), s = rnd(60, 380) * Math.sqrt(size); FX.part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7 - 40, life: rnd(0.4, 1.1), max: 1.1, size: rnd(1, 3), color: color === 'emp' ? '#9fe8ff' : '#ffc070', drag: 0.94, grav: 120 }); }
    for (let i = 0; i < 10 * size; i++) FX.part({ x: x + rnd(-10, 10) * size, y: y + rnd(-10, 10) * size, vx: rnd(-20, 20), vy: rnd(-40, -10), life: rnd(1.5, 3), max: 3, size: rnd(8, 18) * size, color: 'smoke', type: 'smoke', drag: 0.985 });
    FX.shake(4 + size * 6, 0.35 + size * 0.15);
  };

  FX.nuke = function (at) {
    const [x, y] = P(at);
    FX.flash('#fff8e0', 0.9);
    FX.shake(22, 1.2);
    FX.effects.push({ t: 0, dur: 3.2, draw(c, e) {
      const k = e.t / e.dur;
      c.save(); c.globalCompositeOperation = 'lighter';
      const r = 30 + 260 * Math.pow(k, 0.4);
      const g = c.createRadialGradient(x, y, 0, x, y, R0(r, 1));
      g.addColorStop(0, `rgba(255,255,240,${1 - k})`); g.addColorStop(0.3, `rgba(255,190,90,${(1 - k) * 0.8})`); g.addColorStop(1, 'rgba(255,60,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = `rgba(255,240,220,${(1 - k) * 0.9})`; c.lineWidth = 4;
      c.beginPath(); c.ellipse(x, y, Math.max(0.01, 420 * k), Math.max(0.01, 210 * k), 0, 0, Math.PI * 2); c.stroke();
      c.restore();
    } });
    for (let i = 0; i < 60; i++) FX.part({ x: x + rnd(-30, 30), y: y + rnd(-30, 30), vx: rnd(-50, 50), vy: rnd(-90, -10), life: rnd(2.5, 5), max: 5, size: rnd(14, 34), color: 'smoke', type: 'smoke', drag: 0.99 });
  };

  // Projectile helpers. onHit fires once at arrival.
  FX.rail = function (from, to, onHit, color) {
    const T = 0.16;
    FX.effects.push({ t: 0, dur: 0.55, hit: false, draw(c, e) {
      const [x0, y0] = P(from), [x1, y1] = P(to);
      const k = Math.min(1, e.t / T);
      const hx = x0 + (x1 - x0) * k, hy = y0 + (y1 - y0) * k;
      c.save(); c.globalCompositeOperation = 'lighter';
      const fade = e.t < T ? 1 : 1 - (e.t - T) / (e.dur - T);
      c.strokeStyle = `rgba(160,230,255,${0.9 * fade})`; c.lineWidth = 6 * fade + 1; c.shadowColor = color || '#9fe8ff'; c.shadowBlur = 25;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(hx, hy); c.stroke();
      c.strokeStyle = `rgba(255,255,255,${fade})`; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(hx, hy); c.stroke();
      c.restore();
      if (k >= 1 && !e.hit) { e.hit = true; onHit && onHit(); }
    } });
    const [mx, my] = P(from);
    FX.muzzle(mx, my, 1.4);
  };
  FX.muzzle = function (x, y, s) {
    FX.effects.push({ t: 0, dur: 0.35, draw(c, e) {
      const k = e.t / e.dur;
      c.save(); c.globalCompositeOperation = 'lighter';
      const r = 80 * s * (0.4 + k);
      const g = c.createRadialGradient(x, y, 0, x, y, R0(r, 1));
      g.addColorStop(0, `rgba(255,255,255,${1 - k})`); g.addColorStop(0.4, `rgba(140,220,255,${(1 - k) * 0.6})`); g.addColorStop(1, 'rgba(0,100,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.restore();
    } });
    for (let i = 0; i < 18; i++) FX.part({ x, y, vx: rnd(-140, 260), vy: rnd(-160, 120), life: rnd(0.2, 0.6), max: 0.6, size: rnd(1, 2.5), color: '#bfefff', drag: 0.9 });
  };
  FX.beam = function (from, to, dur, onHit) {
    FX.effects.push({ t: 0, dur, hit: false, draw(c, e) {
      const [x0, y0] = P(from), [x1, y1] = P(to);
      const ramp = Math.min(1, e.t / 0.12) * Math.min(1, (e.dur - e.t) / 0.25);
      const fl = 0.8 + 0.2 * Math.sin(e.t * 80);
      c.save(); c.globalCompositeOperation = 'lighter';
      c.lineCap = 'round';
      c.strokeStyle = `rgba(255,90,40,${0.35 * ramp})`; c.lineWidth = 26 * ramp * fl; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = `rgba(255,170,90,${0.8 * ramp})`; c.lineWidth = 9 * ramp * fl; c.stroke();
      c.strokeStyle = `rgba(255,255,230,${ramp})`; c.lineWidth = 3 * ramp; c.stroke();
      const g = c.createRadialGradient(x1, y1, 0, x1, y1, R0(60 * ramp, 1));
      g.addColorStop(0, `rgba(255,240,200,${ramp})`); g.addColorStop(1, 'rgba(255,80,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x1, y1, 60 * ramp, 0, Math.PI * 2); c.fill();
      c.restore();
      if (Math.random() < 0.7) FX.part({ x: x1, y: y1, vx: rnd(-200, 200), vy: rnd(-220, 40), life: rnd(0.3, 0.8), max: 0.8, size: rnd(1, 3), color: '#ffb070', drag: 0.93, grav: 200 });
      if (e.t > 0.25 && !e.hit) { e.hit = true; onHit && onHit(); }
    } });
  };
  FX.missiles = function (from, to, n, interceptAt, onHit) {
    let landed = 0;
    for (let i = 0; i < n; i++) {
      const delay = i * 0.14;
      const bend = rnd(-1, 1);
      FX.effects.push({ t: -delay, dur: 1.5, hit: false, draw(c, e) {
        if (e.t < 0) return;
        const [x0, y0] = P(from), [x1, y1] = P(to);
        let k = Math.min(1, e.t / 1.2);
        const stopAt = interceptAt ? 0.7 + i * 0.03 : 1;
        if (k >= stopAt && !e.hit) {
          e.hit = true;
          const ex = bez(x0, y0, x1, y1, bend, stopAt);
          if (interceptAt) { FX.explosion(ex, 0.35); } else if (++landed === 1) onHit && onHit();
        }
        if (e.hit) return;
        const [hx, hy] = bez(x0, y0, x1, y1, bend, k);
        const [px, py] = bez(x0, y0, x1, y1, bend, Math.max(0, k - 0.02));
        FX.part({ x: hx, y: hy, vx: rnd(-8, 8), vy: rnd(-8, 8), life: 0.9, max: 0.9, size: 5, color: 'smoke', type: 'smoke', drag: 0.97 });
        c.save(); c.globalCompositeOperation = 'lighter';
        c.strokeStyle = '#ffd890'; c.lineWidth = 3; c.beginPath(); c.moveTo(px, py); c.lineTo(hx, hy); c.stroke();
        c.fillStyle = '#fff4c0'; c.beginPath(); c.arc(hx, hy, 3.5, 0, Math.PI * 2); c.fill();
        c.restore();
      } });
    }
    if (interceptAt) setTimeout(() => onHit && onHit(), 1300);
  };
  function bez(x0, y0, x1, y1, bend, k) {
    const mx = (x0 + x1) / 2 + bend * 160, my = Math.min(y0, y1) - 220 - Math.abs(bend) * 60;
    const a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, cc = k * k;
    return [a * x0 + b * mx + cc * x1, a * y0 + b * my + cc * y1];
  }
  FX.barrage = function (from, to, spread, onHit) {
    for (let i = 0; i < 9; i++) {
      const ox = rnd(-spread, spread), oy = rnd(-spread * 0.6, spread * 0.6);
      FX.effects.push({ t: -i * 0.08, dur: 0.6, hit: false, draw(c, e) {
        if (e.t < 0) return;
        const [x0, y0] = P(from), [x1, y1] = P(to);
        const k = Math.min(1, e.t / 0.3);
        const tx = x1 + ox, ty = y1 + oy;
        c.save(); c.globalCompositeOperation = 'lighter';
        c.strokeStyle = `rgba(255,190,120,${1 - k * 0.5})`; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(x0 + (tx - x0) * Math.max(0, k - 0.15), y0 + (ty - y0) * Math.max(0, k - 0.15)); c.lineTo(x0 + (tx - x0) * k, y0 + (ty - y0) * k); c.stroke();
        c.restore();
        if (k >= 1 && !e.hit) { e.hit = true; FX.explosion([tx, ty], 0.4); if (i === 4) onHit && onHit(); }
      } });
    }
  };
  // Enemy fire toward the fortress.
  FX.incoming = function (from, to, shieldUp, delay) {
    FX.effects.push({ t: -(delay || 0), dur: 0.9, hit: false, draw(c, e) {
      if (e.t < 0) return;
      const [x0, y0] = P(from), [x1, y1] = P(to);
      const k = Math.min(1, e.t / 0.6);
      const hx = x0 + (x1 - x0) * k, hy = y0 + (y1 - y0) * k;
      c.save(); c.globalCompositeOperation = 'lighter';
      c.strokeStyle = 'rgba(255,80,60,0.9)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x0 + (x1 - x0) * Math.max(0, k - 0.12), y0 + (y1 - y0) * Math.max(0, k - 0.12)); c.lineTo(hx, hy); c.stroke();
      c.restore();
      if (k >= 1 && !e.hit) {
        e.hit = true;
        if (shieldUp) { FX.shieldRipple([x1, y1]); SF.audio.shieldHit(); }
        else { FX.explosion([x1, y1], 0.5); SF.audio.impactFortress(); }
      }
    } });
  };
  FX.shieldRipple = function (at) {
    const [x, y] = P(at);
    FX.effects.push({ t: 0, dur: 0.6, draw(c, e) {
      const k = e.t / e.dur;
      c.save(); c.globalCompositeOperation = 'lighter';
      c.strokeStyle = `rgba(110,200,255,${1 - k})`; c.lineWidth = 3;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x, y, 20 + k * 90 + i * 12, -1.2, 1.2); c.stroke(); }
      c.restore();
    } });
  };

  FX.update = function (dt) {
    FX.time += dt;
    if (FX.shakeT > 0) { FX.shakeT -= dt; if (FX.shakeT <= 0) FX.shakeA = 0; }
    FX.flashA = Math.max(0, FX.flashA - dt * 1.6);
    for (const e of FX.effects) e.t += dt;
    FX.effects = FX.effects.filter((e) => e.t < e.dur);
    for (const p of FX.parts) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav * dt;
    }
    FX.parts = FX.parts.filter((p) => p.life > 0);
    if (FX.parts.length > 1400) FX.parts.splice(0, FX.parts.length - 1400);
  };
  FX.draw = function (c, W, H) {
    for (const p of FX.parts) if (p.type === 'smoke') {
      const k = p.life / p.max;
      c.fillStyle = `rgba(40,36,34,${0.35 * k})`;
      c.beginPath(); c.arc(p.x, p.y, p.size * (1.6 - k), 0, Math.PI * 2); c.fill();
    }
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const p of FX.parts) if (p.type !== 'smoke') {
      c.globalAlpha = Math.max(0, p.life / p.max);
      c.fillStyle = p.color;
      c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    c.restore();
    for (const e of FX.effects) e.draw(c, e);
    if (FX.flashA > 0.01) { c.save(); c.globalAlpha = FX.flashA; c.fillStyle = FX.flashC; c.fillRect(0, 0, W, H); c.restore(); }
  };
})();
