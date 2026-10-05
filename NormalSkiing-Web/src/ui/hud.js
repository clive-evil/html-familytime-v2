// Minimal HUD: speed, vertical metres remaining, tiny posture/balance gauge,
// region toasts and short callouts.

export class Hud {
  constructor() {
    this.spd = document.getElementById('spd');
    this.vert = document.getElementById('vert');
    this.toastEl = document.getElementById('toast');
    this.calloutEl = document.getElementById('callout');
    this.hintEl = document.getElementById('hint');
    this.whiteout = document.getElementById('whiteout');
    this.gauge = document.getElementById('posture');
    this.g = this.gauge.getContext('2d');
    this.toastT = 0;
    this.calloutT = 0;
  }

  toast(title, sub = '', time = 3.5) {
    this.toastEl.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    this.toastEl.style.opacity = 1;
    this.toastT = time;
  }

  callout(text, color = '#fff', time = 1.1) {
    this.calloutEl.textContent = text;
    this.calloutEl.style.color = color;
    this.calloutEl.style.opacity = 1;
    this.calloutT = time;
  }

  hint(text) {
    if (this.hintEl.textContent !== text) this.hintEl.textContent = text;
  }

  update(dt, st) {
    this.spd.textContent = Math.round(st.speed * 3.6);
    this.vert.textContent = Math.max(0, Math.round(st.vertical)).toLocaleString();
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastEl.style.opacity = 0;
    }
    if (this.calloutT > 0) {
      this.calloutT -= dt;
      if (this.calloutT <= 0) this.calloutEl.style.opacity = 0;
    }
    this.whiteout.style.opacity = st.whiteout || 0;
    this.drawGauge(st);
  }

  drawGauge(st) {
    const g = this.g;
    const W = 84;
    g.clearRect(0, 0, W, W);
    const c = W / 2;
    const R = 34;
    // balance ring colour
    const b = st.balance;
    const col = b < 0.3 ? '#7cf07c' : b < 0.55 ? '#ffe066' : b < 0.85 ? '#ff9a3c' : '#ff4a3a';
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(16,32,46,0.55)';
    g.beginPath();
    g.arc(c, c, R, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = col;
    g.beginPath();
    g.arc(c, c, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, b));
    g.stroke();
    // crosshair
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(c - R + 6, c);
    g.lineTo(c + R - 6, c);
    g.moveTo(c, c - R + 6);
    g.lineTo(c, c + R - 6);
    g.stroke();
    // balance vector (where the body is tipping)
    g.strokeStyle = col;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(c, c);
    g.lineTo(c + st.balL * R * 0.8, c - st.balF * R * 0.8);
    g.stroke();
    // posture dot (mouse)
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(c + st.px * (R - 8), c - st.py * (R - 8), 4.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#10202e';
    g.lineWidth = 1.5;
    g.stroke();
  }
}
