/* Shared DOM helpers: stage scaling, slots, banners, modals, fly animations. */
(function (root) {
  'use strict';
  const CW = root.CW;
  const UI = {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  UI.$ = $; UI.$$ = $$;
  UI.el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  UI.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ------------------------------------------------------------ stage scale
  UI.scale = 1;
  UI.fit = function () {
    const st = $('#stage');
    const vw = window.innerWidth, vh = window.innerHeight;
    UI.scale = Math.min(vw / 540, vh / 960);
    st.style.transform = `scale(${UI.scale})`;
  };
  // page coords → stage coords
  UI.toStage = function (x, y) {
    const r = $('#stage').getBoundingClientRect();
    return { x: (x - r.left) / UI.scale, y: (y - r.top) / UI.scale };
  };
  UI.centerOf = function (elm) {
    const r = elm.getBoundingClientRect();
    return UI.toStage(r.left + r.width / 2, r.top + r.height / 2);
  };

  // ------------------------------------------------------------ art
  UI.artFor = function (item, size = 72) {
    if (!item) return '';
    if (item.slot === 'hero') return CW.Art.heroIcon(item.classId, item.rarity, size);
    return CW.Art.icon(item.kind, item.rarity, size);
  };
  UI.pips = (rarity) => `<span class="pips">${'<b></b>'.repeat(CW.RARITY[rarity].pips)}</span>`;
  UI.itemName = (item) => (item.slot === 'hero' ? `${item.name}` : item.name);
  UI.itemTitle = (item) => `<span class="rtag r-${item.rarity}">${CW.RARITY[item.rarity].name}</span> ${UI.esc(item.slot === 'hero' ? CW.CLASSES[item.classId].name : item.name).toUpperCase()}`;
  UI.slotLabel = { hero: 'HERO', weapon: 'WEAPON', gear: 'GEAR' };

  // Static slot element (used in modals, results, battle HUD)
  UI.slotEl = function (item, extra = '') {
    if (!item) return `<div class="slot empty-slot ${extra}"><div class="art"><span class="empty">?</span></div></div>`;
    const cr = item.cracks ? ` crack-${Math.min(3, item.cracks)}` : '';
    return `<div class="slot r-${item.rarity}${cr} ${extra}"><div class="art"><img src="${UI.artFor(item)}" alt=""></div><div class="txt"><span class="rtag">${CW.RARITY[item.rarity].name}</span><span class="nm">${UI.esc(UI.itemName(item))}</span></div></div>`;
  };

  UI.wallet = (w, keys = ['coins', 'chaos', 'jack', 'grief']) => keys.map((k) => `<span class="chip cur-${k === 'coins' ? 'coin' : k}" data-cur="${k}" title="${k}"><i></i><span>${w[k]}</span></span>`).join('');
  UI.updateWallet = function (container, w) {
    if (!container) return;
    for (const c of $$('[data-cur]', container)) {
      const v = String(w[c.dataset.cur]);
      const s = c.querySelector('span');
      if (s.textContent !== v) { s.textContent = v; c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
    }
  };

  // ------------------------------------------------------------ feedback
  UI.toast = function (text, ok = false) {
    const t = UI.el(`<div class="toast${ok ? ' ok' : ''}">${UI.esc(text)}</div>`);
    $('#toast-layer').appendChild(t);
    setTimeout(() => t.remove(), 1800);
  };
  UI.flash = function (color = '#fff', host = $('#stage')) {
    const f = UI.el(`<div class="screen-flash" style="background:${color}"></div>`);
    host.appendChild(f); setTimeout(() => f.remove(), 650);
  };
  UI.quake = function () { const s = $('#stage'); s.classList.remove('quake'); void s.offsetWidth; s.classList.add('quake'); };
  UI.slam = function (host, html, cls = '', ms = 2000) {
    const s = UI.el(`<div class="slam ${cls}">${html}</div>`);
    host.appendChild(s); setTimeout(() => s.remove(), ms);
    return s;
  };
  UI.burst = function (host, rarity, n = 14, spread = 90) {
    const b = UI.el(`<div class="burst r-${rarity}"></div>`);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, d = spread * (0.5 + Math.random() * 0.6);
      const p = document.createElement('i');
      p.style.setProperty('--dx', Math.cos(a) * d + 'px'); p.style.setProperty('--dy', Math.sin(a) * d + 'px');
      p.style.animationDelay = Math.random() * 0.08 + 's';
      b.appendChild(p);
    }
    host.appendChild(b); setTimeout(() => b.remove(), 1000);
  };
  UI.rays = function (host, mythic) {
    const r = UI.el(`<div class="rays${mythic ? ' mythic' : ''}"></div>`);
    host.appendChild(r); setTimeout(() => r.remove(), 2300);
  };
  UI.restartAnim = function (elm, cls) { elm.classList.remove(cls); void elm.offsetWidth; elm.classList.add(cls); };

  // Banner queue (one at a time, short)
  const bannerQ = [];
  let bannerBusy = false;
  UI.banner = function (host, { top = '', main = '', sub = '', color = null, ms = 1500, priority = false, key = null }) {
    const item = { host, top, main, sub, color, ms, key };
    // coalesce: a newer banner of the same kind replaces one still waiting in the queue (e.g. rapid boosts)
    if (key) { const i = bannerQ.findIndex((b) => b.key === key); if (i >= 0) { bannerQ[i] = item; return; } }
    if (priority) bannerQ.unshift(item); else bannerQ.push(item);
    if (bannerQ.length > 4) bannerQ.splice(1, bannerQ.length - 4);
    if (!bannerBusy) nextBanner();
  };
  UI.clearBanners = () => { bannerQ.length = 0; };
  function nextBanner() {
    const b = bannerQ.shift();
    if (!b) { bannerBusy = false; return; }
    bannerBusy = true;
    const k = (CW.App && CW.App.fast) ? 0.45 : 1;
    const e = UI.el(`<div class="banner" ${b.color ? `style="--bc:${b.color}"` : ''}>${b.top ? `<div class="b1">${b.top}</div>` : ''}<div class="b2">${b.main}</div>${b.sub ? `<div class="b3">${b.sub}</div>` : ''}</div>`);
    b.host.appendChild(e);
    setTimeout(() => { e.classList.add('out'); setTimeout(() => { e.remove(); nextBanner(); }, 230); }, b.ms * k);
  }

  // ------------------------------------------------------------ modal
  UI.modalOpen = false;
  UI.openModal = function (html, cls = '') {
    const ov = $('#overlay');
    ov.innerHTML = `<div class="modal ${cls}">${html}</div>`;
    ov.classList.add('open');
    UI.modalOpen = true;
    return ov.firstElementChild;
  };
  UI.closeModal = function () {
    const ov = $('#overlay');
    ov.classList.remove('open'); ov.innerHTML = '';
    UI.modalOpen = false;
    if (UI.onModalClose) { const f = UI.onModalClose; UI.onModalClose = null; f(); }
  };

  // ------------------------------------------------------------ fly animations
  UI.fly = function (fromEl, toEl, item, { ms = 650, chain = false, delay = 0 } = {}) {
    return new Promise((res) => {
      setTimeout(() => {
        const layer = $('#fly-layer');
        const a = UI.centerOf(fromEl), b = UI.centerOf(toEl);
        let ch = null;
        if (chain) {
          ch = UI.el('<div class="chain"></div>');
          ch.style.left = b.x + 'px'; ch.style.top = b.y - 4 + 'px';
          ch.style.width = Math.hypot(a.x - b.x, a.y - b.y) + 'px';
          ch.style.transform = `rotate(${Math.atan2(a.y - b.y, a.x - b.x)}rad)`;
          layer.appendChild(ch);
        }
        const f = UI.el(`<div class="flyer r-${item.rarity}"><img src="${UI.artFor(item)}"></div>`);
        f.style.left = a.x + 'px'; f.style.top = a.y + 'px';
        layer.appendChild(f);
        const anim = f.animate([
          { left: a.x + 'px', top: a.y + 'px', transform: 'scale(1) rotate(0deg)' },
          { left: (a.x + b.x) / 2 + 'px', top: Math.min(a.y, b.y) - 70 + 'px', transform: 'scale(1.5) rotate(200deg)', offset: 0.5 },
          { left: b.x + 'px', top: b.y + 'px', transform: 'scale(1) rotate(360deg)' },
        ], { duration: ms, easing: 'cubic-bezier(.5,0,.4,1)' });
        if (ch) ch.animate([{ width: ch.style.width }, { width: '0px' }], { duration: ms, easing: 'cubic-bezier(.5,0,.4,1)' });
        anim.onfinish = () => { f.remove(); if (ch) ch.remove(); res(); };
      }, delay);
    });
  };
  UI.beam = function (fromEl, toEl) {
    const a = UI.centerOf(fromEl), b = UI.centerOf(toEl);
    const bm = UI.el('<div class="beam"></div>');
    bm.style.left = a.x + 'px'; bm.style.top = a.y - 3 + 'px';
    bm.style.width = Math.hypot(b.x - a.x, b.y - a.y) + 'px';
    bm.style.transform = `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`;
    $('#fly-layer').appendChild(bm);
    setTimeout(() => bm.remove(), 950);
  };
  UI.coins = function (fromEl, toEl, n = 6) {
    const a = UI.centerOf(fromEl), b = UI.centerOf(toEl);
    for (let i = 0; i < n; i++) {
      const c = UI.el('<div class="coin-fly"></div>');
      $('#fly-layer').appendChild(c);
      const mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 120, my = Math.min(a.y, b.y) - 40 - Math.random() * 60;
      c.animate([{ left: a.x + 'px', top: a.y + 'px' }, { left: mx + 'px', top: my + 'px' }, { left: b.x + 'px', top: b.y + 'px' }],
        { duration: 600 + i * 50, delay: i * 40, easing: 'ease-in', fill: 'both' }).onfinish = () => c.remove();
    }
  };

  CW.UI = UI;
})(window);
