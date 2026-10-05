// DOM overlay UI. Pure presentation + callbacks; game rules live in Game.
import './ui.css';
import { ICON, boosterIcon } from './icons.js';
import { BOOSTER_INFO, ECONOMY, DAILY, CHESTS, LIVES } from '../systems/config.js';
import { THEMES } from '../render/themes.js';

const $ = (sel, root = document) => root.querySelector(sel);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const fmtTime = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class UI {
  constructor(root, audio) {
    this.root = root;
    this.audio = audio;
    root.insertAdjacentHTML('beforeend', `
      <div id="hud">
        <div class="hud-top">
          <button class="icon-btn" id="btnMap" aria-label="Journey map">${ICON.map}</button>
          <div class="lvl-badge" id="lvlBadge"></div>
          <div class="spacer"></div>
          <div class="pill hidden" id="hearts">${ICON.heart}<b>5</b><small></small></div>
          <div class="pill hidden" id="coins">${ICON.coin}<b>0</b></div>
          <button class="icon-btn" id="btnRestart" aria-label="Restart level">${ICON.restart}</button>
          <button class="icon-btn" id="btnSound" aria-label="Sound">${ICON.sound}</button>
        </div>
        <div class="hud-mid">
          <div class="targets" id="targets">${ICON.pin}<b>10</b><small>TARGETS</small></div>
          <div class="balls" id="balls"><span class="lbl">BALLS</span></div>
        </div>
      </div>
      <div id="intro"></div>
      <div id="hint" class="hidden"><div class="bubble"></div><div class="sub"></div></div>
      <div id="hand" class="hidden">${ICON.hand}</div>
      <div id="spin" class="hidden"><div class="lbl">SPIN</div><div class="track"><div class="ends"><span>⟲</span><span>⟳</span></div><div class="knob"></div></div></div>
      <div id="boosters" class="hidden"></div>
      <div id="banner"></div>
      <div id="toast"></div>
    `);
    this.el = {
      hud: $('#hud'), lvl: $('#lvlBadge'), hearts: $('#hearts'), coins: $('#coins'), targets: $('#targets'), balls: $('#balls'),
      hint: $('#hint'), hand: $('#hand'), spin: $('#spin'), boosters: $('#boosters'), banner: $('#banner'), toast: $('#toast'), intro: $('#intro'),
      btnMap: $('#btnMap'), btnRestart: $('#btnRestart'), btnSound: $('#btnSound'),
    };
    this.cb = {};
    this.el.btnMap.onclick = () => { this.audio.ui(); this.cb.map?.(); };
    this.el.btnRestart.onclick = () => { this.audio.ui(); this.cb.restart?.(); };
    this.el.btnSound.onclick = () => { this.cb.sound?.(); };
    this._spinSetup();
    this.spin = 0;
    this.modalOpen = false;
  }

  on(name, fn) { this.cb[name] = fn; }

  // ---------------------------------------------------------------- HUD
  setLevel(level) {
    const tag = level.diff === 'hard' ? '<span class="tag hard">HARD</span>' : level.diff === 'superhard' ? '<span class="tag superhard">SUPER HARD</span>' : '';
    this.el.lvl.innerHTML = `LEVEL ${level.id} ${tag}`;
  }

  setTargets(n, pop) {
    const b = this.el.targets.querySelector('b');
    if (b.textContent !== String(n)) {
      b.textContent = n;
      if (pop) { this.el.targets.classList.remove('pop'); void this.el.targets.offsetWidth; this.el.targets.classList.add('pop'); }
    }
  }

  setBalls(left, total, unlimited) {
    const el = this.el.balls;
    const want = `${left}/${total}/${unlimited}`;
    if (el.dataset.k === want) return;
    el.dataset.k = want;
    if (unlimited) { el.innerHTML = `<span class="lbl">BALLS ∞</span>`; return; }
    const n = Math.max(total, left);
    let s = '<span class="lbl">BALLS</span>';
    for (let i = 0; i < n; i++) s += `<i class="${i < left ? '' : 'used'}"></i>`;
    el.innerHTML = s;
  }

  setCoins(n, show, bump) {
    this.el.coins.classList.toggle('hidden', !show);
    this.el.coins.querySelector('b').textContent = n;
    if (bump) { this.el.coins.classList.remove('bump'); void this.el.coins.offsetWidth; this.el.coins.classList.add('bump'); }
  }

  setHearts(lives, msToNext, show, unlimited) {
    this.el.hearts.classList.toggle('hidden', !show);
    this.el.hearts.querySelector('b').textContent = unlimited ? '∞' : lives;
    this.el.hearts.querySelector('small').textContent = !unlimited && lives < LIVES.max && msToNext > 0 ? fmtTime(msToNext) : lives >= LIVES.max && !unlimited ? 'FULL' : '';
  }

  setSound(on) { this.el.btnSound.innerHTML = on ? ICON.sound : ICON.mute; }
  coinTarget() { const r = this.el.coins.getBoundingClientRect(); return { x: r.left + 18, y: r.top + 16 }; }

  // -------------------------------------------------------------- hints
  hint(text, sub = '') {
    if (!text) { this.el.hint.classList.add('hidden'); return; }
    this.el.hint.classList.remove('hidden');
    this.el.hint.querySelector('.bubble').textContent = text;
    this.el.hint.querySelector('.sub').textContent = sub;
  }

  /** Animated hand dragging from screen point a to b (loops until hidden). */
  hand(a, b) {
    const el = this.el.hand;
    if (!a) { el.classList.add('hidden'); el.getAnimations?.().forEach((x) => x.cancel()); return; }
    el.classList.remove('hidden');
    el.getAnimations?.().forEach((x) => x.cancel());
    el.animate([
      { left: `${a.x - 14}px`, top: `${a.y - 4}px`, opacity: 0, transform: 'scale(1.1)' },
      { left: `${a.x - 14}px`, top: `${a.y - 4}px`, opacity: 1, transform: 'scale(1)', offset: 0.15 },
      { left: `${b.x - 14}px`, top: `${b.y - 4}px`, opacity: 1, transform: 'scale(0.95)', offset: 0.75 },
      { left: `${b.x - 14}px`, top: `${b.y - 4}px`, opacity: 0, transform: 'scale(1)' },
    ], { duration: 1700, iterations: Infinity, easing: 'ease-in-out' });
  }

  intro(level) {
    const theme = THEMES[level.env];
    const tag = level.diff === 'hard' ? '<div class="tag hard">HARD LEVEL</div>' : level.diff === 'superhard' ? '<div class="tag superhard">SUPER HARD</div>' : '';
    this.el.intro.innerHTML = `${tag}<div class="t">${level.name}</div><div class="s">${level.teach || ''}</div>`;
    this.el.intro.dataset.env = theme?.name || '';
  }

  banner(kind, small = '') {
    const txt = { strike: 'STRIKE!', spare: 'SPARE!', clear: 'CLEAR!', out: 'OUT OF BALLS' }[kind] || kind;
    this.el.banner.innerHTML = `<div class="big ${kind}">${txt}</div>${small ? `<div class="small">${small}</div>` : ''}`;
  }
  clearBanner() { this.el.banner.innerHTML = ''; }

  toast(text) {
    const d = document.createElement('div');
    d.textContent = text;
    this.el.toast.innerHTML = '';
    this.el.toast.appendChild(d);
  }

  floater(text, x, y, color) {
    const d = h(`<div class="floater" style="left:${x}px;top:${y}px;${color ? `color:${color}` : ''}">${text}</div>`);
    this.root.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  }

  /** Coins fly from (x,y) to the coin counter. */
  async flyCoins(from, n, onEach) {
    this.el.coins.classList.remove('hidden');
    const to = this.coinTarget();
    const count = Math.min(14, Math.max(4, Math.round(n / 8)));
    const per = n / count;
    let given = 0;
    for (let i = 0; i < count; i++) {
      const c = h(`<div class="flycoin">${ICON.coin}</div>`);
      c.style.left = `${from.x - 13}px`; c.style.top = `${from.y - 13}px`;
      this.root.appendChild(c);
      const dx = (Math.random() - 0.5) * 120, dy = (Math.random() - 0.5) * 80;
      const anim = c.animate([
        { transform: 'translate(0,0) scale(0.6)' },
        { transform: `translate(${dx}px,${dy}px) scale(1.15)`, offset: 0.3 },
        { transform: `translate(${to.x - from.x}px,${to.y - from.y}px) scale(0.8)` },
      ], { duration: 650, delay: i * 45, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' });
      anim.onfinish = () => {
        c.remove();
        const amt = i === count - 1 ? n - given : Math.round(per);
        given += amt;
        onEach?.(amt, i);
      };
    }
    await wait(650 + count * 45);
  }

  // --------------------------------------------------------------- spin
  _spinSetup() {
    const track = this.el.spin.querySelector('.track');
    const knob = this.el.spin.querySelector('.knob');
    const set = (v) => {
      v = Math.max(-1, Math.min(1, v));
      if (Math.abs(v) < 0.12) v = 0;
      this.spin = Math.round(v * 20) / 20;
      knob.style.left = `${50 + this.spin * 44}%`;
      this.cb.spin?.(this.spin);
    };
    this.setSpin = set;
    let drag = false;
    const fromEvent = (e) => { const r = track.getBoundingClientRect(); return ((e.clientX - r.left) / r.width - 0.5) / 0.44; };
    track.addEventListener('pointerdown', (e) => { drag = true; track.setPointerCapture(e.pointerId); set(fromEvent(e)); e.stopPropagation(); });
    track.addEventListener('pointermove', (e) => { if (drag) set(fromEvent(e)); });
    track.addEventListener('pointerup', () => { drag = false; this.audio.ui(); });
    set(0);
  }
  showSpin(on, glow) { this.el.spin.classList.toggle('hidden', !on); this.el.spin.classList.toggle('glow', !!glow); }

  // ------------------------------------------------------------ boosters
  setBoosters(list, counts, active, glow) {
    const el = this.el.boosters;
    el.classList.toggle('hidden', list.length === 0);
    el.innerHTML = '';
    for (const k of list) {
      const n = counts[k] || 0;
      const b = h(`<button class="boost ${active === k ? 'active' : ''} ${glow === k ? 'glow' : ''}" data-k="${k}" aria-label="${BOOSTER_INFO[k].name}">${boosterIcon(k)}<span class="n ${n ? '' : 'buy'}">${n || '+'}</span></button>`);
      b.onclick = (e) => { e.stopPropagation(); this.audio.ui(); this.cb.booster?.(k); };
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.appendChild(b);
    }
  }

  // --------------------------------------------------------------- modal
  modal(html, { onClose } = {}) {
    this.closeModal();
    const m = h(`<div id="modal"><div class="panel">${html}</div></div>`);
    m.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.appendChild(m);
    this.modalOpen = true;
    this._onClose = onClose;
    return m;
  }
  closeModal() {
    const m = $('#modal');
    if (m) m.remove();
    this.modalOpen = false;
  }
  btn(m, sel, fn) {
    const b = m.querySelector(sel);
    if (b) b.onclick = (e) => { e.stopPropagation(); this.audio.ui(); fn(e); };
  }

  winPanel({ level, result, targetsTotal, next }) {
    const g = result.grade;
    const title = { strike: 'STRIKE!', spare: 'SPARE!', clear: 'LEVEL COMPLETE' }[g];
    const lines = result.lines.map((l, i) => `<div class="line" style="animation-delay:${0.15 + i * 0.12}s"><span>${l.label}</span><span class="c">+${l.coins} ${ICON.coin}</span></div>`).join('');
    const m = this.modal(`
      <div class="sub">LEVEL ${level.id} · ${level.name}</div>
      <h1 class="${g}">${title}</h1>
      <div class="stars"><span id="cnt">0</span> / ${targetsTotal} DOWN</div>
      <div class="lines">${lines || '<div class="line"><span>REPLAY</span><span class="c">+0</span></div>'}</div>
      <button class="btn big" id="next">${next}</button>
      <button class="btn grey" id="replay">REPLAY</button>
    `);
    // fast target count-up
    const cnt = m.querySelector('#cnt');
    let k = 0;
    const iv = setInterval(() => { k = Math.min(targetsTotal, k + Math.max(1, Math.ceil(targetsTotal / 12))); cnt.textContent = k; if (k >= targetsTotal) clearInterval(iv); }, 40);
    return m;
  }

  failPanel({ level, remaining, canAfford, cost, heartsNote }) {
    return this.modal(`
      <div class="sub">LEVEL ${level.id}</div>
      <h1>OUT OF BALLS</h1>
      <p style="font-size:22px;font-family:var(--font-display);color:var(--pink)">${remaining} TARGET${remaining === 1 ? '' : 'S'} LEFT</p>
      <button class="btn gold big" id="ad"><span>+5 BALLS</span><small>▶ WATCH AD (SIMULATED)</small></button>
      <button class="btn blue" id="coinbuy" ${canAfford ? '' : 'disabled'}><span>+5 BALLS · ${cost}</span> <span class="ico">${ICON.coin}</span></button>
      <button class="btn grey" id="retry">RETRY${heartsNote ? ` <small>${heartsNote}</small>` : ''}</button>
      <div class="sim-note">Prototype: no real ads or payments. +5 Balls represents a rewarded ad / coin spend.</div>
    `);
  }

  outOfHeartsPanel({ msToNext, cost, canAfford }) {
    return this.modal(`
      <h1>OUT OF HEARTS</h1>
      <p>Next heart in <b id="hrt">${fmtTime(msToNext)}</b></p>
      <div style="width:70px;margin:8px auto">${ICON.heart}</div>
      <button class="btn gold" id="ad"><span>+1 HEART</span><small>▶ WATCH AD (SIMULATED)</small></button>
      <button class="btn blue" id="refill" ${canAfford ? '' : 'disabled'}>REFILL ALL · ${cost} <span class="ico">${ICON.coin}</span></button>
      <button class="btn grey" id="close">WAIT</button>
      <div class="sim-note">Simulated monetisation hook. Use ?debug=1 → Unlimited Lives for testing.</div>
    `);
  }

  boosterIntroPanel(kind) {
    const info = BOOSTER_INFO[kind];
    return this.modal(`
      <div class="sub">NEW BOOSTER UNLOCKED</div>
      <h1>${info.name}</h1>
      <div style="width:110px;margin:6px auto">${boosterIcon(kind)}</div>
      <p>${info.desc}</p>
      <button class="btn big gold" id="ok">TRY IT FREE!</button>
    `);
  }

  buyBoosterPanel(kind, cost, canAfford) {
    const info = BOOSTER_INFO[kind];
    return this.modal(`
      <button class="close-x" id="close">✕</button>
      <h2>${info.name}</h2>
      <div style="width:90px;margin:4px auto">${boosterIcon(kind)}</div>
      <p>${info.desc}</p>
      <button class="btn blue" id="buy" ${canAfford ? '' : 'disabled'}>BUY 1 · ${cost} <span class="ico">${ICON.coin}</span></button>
      <button class="btn gold" id="ad"><span>GET 1 FREE</span><small>▶ WATCH AD (SIMULATED)</small></button>
      <div class="sim-note">Simulated monetisation hook - no real ads or payments.</div>
    `);
  }

  async chestPanel(levelId, contents) {
    const items = [];
    if (contents.coins) items.push(`<div class="item" style="animation-delay:.05s">${ICON.coin}+${contents.coins}</div>`);
    Object.entries(contents.boosters || {}).forEach(([k, n], i) => items.push(`<div class="item" style="animation-delay:${0.15 + i * 0.1}s">${boosterIcon(k)}×${n}</div>`));
    const m = this.modal(`
      <div class="sub">MILESTONE · LEVEL ${levelId}</div>
      <h1>CHEST!</h1>
      <div class="chest shake" id="chest"><div class="glow"></div><div class="lid"><div class="band"></div></div><div class="base"><div class="band"></div></div><div class="lock"></div></div>
      <div class="loot hidden" id="loot">${items.join('')}</div>
      <button class="btn big gold" id="open">OPEN</button>
    `);
    return new Promise((resolve) => {
      const open = async () => {
        const ch = m.querySelector('#chest');
        if (ch.classList.contains('open')) { resolve(); return; }
        this.audio.chest();
        ch.classList.remove('shake'); ch.classList.add('open');
        m.querySelector('#loot').classList.remove('hidden');
        const b = m.querySelector('#open');
        b.textContent = 'COLLECT';
        b.classList.remove('gold');
      };
      m.querySelector('#chest').onclick = open;
      m.querySelector('#open').onclick = (e) => { e.stopPropagation(); const ch = m.querySelector('#chest'); if (ch.classList.contains('open')) { this.audio.ui(); resolve(); } else open(); };
    });
  }

  dailyPanel(index, claimedToday) {
    const cells = DAILY.map((r, i) => {
      const icon = r.boosters && !r.coins ? boosterIcon(Object.keys(r.boosters)[0]) : r.big ? ICON.chest : ICON.coin;
      const label = r.coins ? `${r.coins}${r.boosters ? '+' : ''}` : `${Object.values(r.boosters)[0]}×`;
      const st = i < index || (claimedToday && i === index - 1) ? 'done' : i === index && !claimedToday ? 'today' : '';
      return `<div class="day ${st} ${r.big ? 'big' : ''}">DAY ${i + 1}${icon}<b>${label}</b></div>`;
    }).join('');
    return this.modal(`
      <div class="sub">COME BACK EVERY DAY</div>
      <h1>DAILY REWARD</h1>
      <div class="days">${cells}</div>
      <button class="btn big gold" id="claim">${claimedToday ? 'SEE YOU TOMORROW' : 'CLAIM'}</button>
    `);
  }

  completePanel(stats) {
    const row = (k, v) => `<div class="line"><span>${k}</span><span class="c">${v}</span></div>`;
    return this.modal(`
      <div class="sub">BOWLING SMASH · VALIDATION BUILD</div>
      <h1 class="strike" style="font-size:44px">PROTOTYPE COMPLETE</h1>
      <div class="lines">
        ${row('LEVELS COMPLETED', stats.levels)}
        ${row('STRIKES', stats.strikes)}
        ${row('SPARES', stats.spares)}
        ${row('RETRIES', stats.retries)}
        ${row('BALLS USED', stats.ballsUsed)}
        ${row('FAILED ATTEMPTS', stats.fails)}
        ${row('BOOSTERS USED', stats.boostersUsed)}
        ${row('TOTAL PLAYTIME', stats.time)}
      </div>
      <button class="btn big" id="again">PLAY AGAIN</button>
      <button class="btn grey" id="toMap">JOURNEY MAP</button>
    `);
  }

  async simulatedAd(placement) {
    const d = h(`<div id="simad"><div class="box"><div class="t">SIMULATED AD</div><div class="s">No real ad in this prototype · placement: ${placement}</div><div class="bar"><i></i></div></div></div>`);
    this.root.appendChild(d);
    await wait(1150);
    d.remove();
  }

  // ---------------------------------------------------------------- map
  showMap({ levels, save, onPlay, onClose, onDaily, dailyReady }) {
    this.hideMap();
    const nodeGap = 112;
    const H = levels.length * nodeGap + 220;
    const pts = levels.map((l, i) => ({ x: 50 + Math.sin(i * 1.05) * 28, y: H - 140 - i * nodeGap }));
    const m = h(`<div id="map">
      <div class="maphead">
        <button class="icon-btn" id="mapClose" aria-label="Back">${ICON.play}</button>
        <h2>JOURNEY</h2>
        ${dailyReady ? `<button class="icon-btn" id="mapDaily" aria-label="Daily reward">${ICON.gift}</button>` : ''}
        <div class="pill">${ICON.coin}<b>${save.coins}</b></div>
      </div>
      <div class="scroll"><div class="path" style="height:${H}px">
        <svg class="trail" viewBox="0 0 100 ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px"><polyline points="${pts.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.6" stroke-dasharray="2 2.4" vector-effect="non-scaling-stroke" style="stroke-width:7px"/></svg>
      </div></div>
      <div class="mapfoot"><button class="btn big" id="mapPlay">PLAY LEVEL ${Math.min(save.currentLevel, levels.length)}</button></div>
    </div>`);
    const path = m.querySelector('.path');
    let lastEnv = null;
    levels.forEach((l, i) => {
      const p = pts[i];
      const unlocked = l.id <= save.currentLevel;
      const done = save.completed[l.id];
      const cls = [l.diff === 'hard' ? 'hard' : '', l.diff === 'superhard' ? 'superhard' : '', unlocked ? '' : 'locked', l.id === save.currentLevel ? 'current' : ''].join(' ');
      const badge = l.diff === 'hard' ? '<span class="badge">HARD</span>' : l.diff === 'superhard' ? '<span class="badge">SUPER HARD</span>' : '';
      const res = done ? `<span class="res ${done.best}">${done.best.toUpperCase()}</span>` : '';
      const n = h(`<button class="node ${cls}" style="left:${p.x}%;top:${p.y}px">${unlocked ? l.id : ICON.lock}${badge}${res}</button>`);
      if (!unlocked) n.querySelector('svg').style.cssText = 'width:26px;height:26px';
      n.onclick = () => { if (unlocked) { this.audio.ui(); onPlay(l.id); } else this.toast('Locked - beat the levels before it!'); };
      path.appendChild(n);
      if (CHESTS[l.id]) {
        const side = p.x > 50 ? -22 : 22;
        const c = h(`<div class="mapchest ${save.chests[l.id] ? 'claimed' : ''}" style="left:${p.x + side}%;top:${p.y - 10}px">${ICON.chest}</div>`);
        path.appendChild(c);
      }
      if (l.env !== lastEnv) {
        lastEnv = l.env;
        path.appendChild(h(`<div class="env-label" style="top:${p.y + 46}px">${THEMES[l.env].name.toUpperCase()}</div>`));
      }
    });
    this.root.appendChild(m);
    m.addEventListener('pointerdown', (e) => e.stopPropagation());
    m.querySelector('#mapClose').onclick = () => { this.audio.ui(); onClose(); };
    m.querySelector('#mapPlay').onclick = () => { this.audio.ui(); onPlay(Math.min(save.currentLevel, levels.length)); };
    const md = m.querySelector('#mapDaily');
    if (md) md.onclick = () => { this.audio.ui(); onDaily(); };
    // scroll current into view
    const cur = pts[Math.min(save.currentLevel, levels.length) - 1];
    requestAnimationFrame(() => { const sc = m.querySelector('.scroll'); sc.scrollTop = Math.max(0, cur.y - sc.clientHeight / 2); });
    this.mapEl = m;
  }
  hideMap() { if (this.mapEl) { this.mapEl.remove(); this.mapEl = null; } }
}

export { fmtTime, ECONOMY };
