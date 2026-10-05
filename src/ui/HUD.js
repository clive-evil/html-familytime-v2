import { BUILDINGS, BUILD_ORDER } from '../data/buildings.js';

// Tiny hand-drawn-ish inline icons.
const ICON = {
  food: '<svg viewBox="0 0 20 20"><circle cx="7" cy="12" r="4.5" fill="#c23b5a" stroke="#3b2a20" stroke-width="1.4"/><circle cx="13" cy="12" r="4.5" fill="#c23b5a" stroke="#3b2a20" stroke-width="1.4"/><path d="M10 7 Q11 3 15 3" stroke="#4f7d3a" stroke-width="1.8" fill="none"/></svg>',
  wood: '<svg viewBox="0 0 20 20"><rect x="2" y="7" width="16" height="7" rx="3.5" fill="#a9774a" stroke="#3b2a20" stroke-width="1.4"/><ellipse cx="16" cy="10.5" rx="2" ry="3" fill="#d9b48a" stroke="#3b2a20" stroke-width="1.2"/></svg>',
  stone: '<svg viewBox="0 0 20 20"><path d="M3 14 L5 7 L11 4 L17 8 L17 14 Z" fill="#a8a39a" stroke="#3b2a20" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  gran: '<svg viewBox="0 0 20 20"><circle cx="10" cy="12" r="6.5" fill="#f2c9a8" stroke="#3b2a20" stroke-width="1.4"/><circle cx="10" cy="4.5" r="2.6" fill="#c9c9cf" stroke="#3b2a20" stroke-width="1.2"/><circle cx="7.6" cy="11" r="1.9" fill="none" stroke="#3b2a20" stroke-width="1.1"/><circle cx="12.4" cy="11" r="1.9" fill="none" stroke="#3b2a20" stroke-width="1.1"/></svg>',
  egg: '<svg viewBox="0 0 20 20"><path d="M10 2 C14 2 16.5 9 16.5 12.5 C16.5 16 13.5 18 10 18 C6.5 18 3.5 16 3.5 12.5 C3.5 9 6 2 10 2 Z" fill="#f5ecd8" stroke="#3b2a20" stroke-width="1.4"/><circle cx="8" cy="10" r="1.2" fill="#d7a6c8"/><circle cx="12" cy="13" r="1" fill="#d7a6c8"/></svg>',
  bed: '<svg viewBox="0 0 20 20"><rect x="2" y="9" width="16" height="5" fill="#a9774a" stroke="#3b2a20" stroke-width="1.4"/><rect x="3" y="6" width="5" height="3" rx="1.5" fill="#fff" stroke="#3b2a20" stroke-width="1.2"/><path d="M2 14 V17 M18 14 V17" stroke="#3b2a20" stroke-width="1.6"/></svg>',
  work: '<svg viewBox="0 0 20 20"><path d="M4 16 L12 8" stroke="#7a5233" stroke-width="2.4" stroke-linecap="round"/><path d="M10 4 L16 10 L13 11 L9 7 Z" fill="#a8a39a" stroke="#3b2a20" stroke-width="1.3"/></svg>',
};

const $ = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
};

export class HUD {
  constructor(root) {
    this.root = root;
    this.status = $(`<div id="status" class="card">
      <div class="day"><span data-k="day">Day 1</span><small data-k="phase"></small></div>
      <div class="clock"><div data-k="clock"></div></div>
      <div class="row" data-k="foodRow">${ICON.food}<b data-k="food">0</b><span class="sub" data-k="foodSub"></span></div>
      <div class="row">${ICON.wood}<b data-k="wood">0</b><span class="sub" data-k="woodSub"></span></div>
      <div class="row">${ICON.stone}<b data-k="stone">0</b><span class="sub" data-k="stoneSub"></span></div>
      <hr class="sep">
      <div class="row">${ICON.gran}<b data-k="pop">1</b><span class="sub" data-k="popSub">Grandmas</span></div>
      <div class="row">${ICON.work}<b data-k="workers">0</b><span class="sub" data-k="workSub">working</span></div>
      <div class="row">${ICON.egg}<b data-k="eggs">0</b><span class="sub" data-k="eggSub">eggs</span></div>
      <div class="row" data-k="bedRow">${ICON.bed}<b data-k="beds">1/1</b><span class="sub">beds</span></div>
    </div>`);
    this.k = {};
    this.status.querySelectorAll('[data-k]').forEach((el) => (this.k[el.dataset.k] = el));
    this.warnings = $('<div id="warnings"></div>');
    this.objective = $('<div id="objective" class="card"><div class="label"><span data-o="label">Objective</span><span data-o="step"></span></div><div class="text" data-o="text"></div></div>');
    this.prompt = $('<div id="prompt" class="card hidden"></div>');
    this.toasts = $('<div id="toasts"></div>');
    this.buildbar = $('<div id="buildbar" class="card hidden"></div>');
    this.buildhint = $('<div id="buildhint" class="card hidden"></div>');
    this.speechLayer = $('<div id="speech"></div>');
    this.nightText = $('<div id="nightText" class="hidden"></div>');
    for (const el of [this.speechLayer, this.status, this.warnings, this.objective, this.prompt, this.toasts, this.buildbar, this.buildhint, this.nightText]) root.appendChild(el);
    this.last = {};
    this.lastObjective = '';
    this.lastPrompt = '';
    this.lastWarn = '';
  }

  set(key, val) {
    if (this.last[key] === val) return;
    this.last[key] = val;
    this.k[key].innerHTML = val;
  }

  update(st, obj, hidden) {
    this.status.classList.toggle('hidden', hidden);
    this.objective.classList.toggle('hidden', hidden);
    if (hidden) return;
    this.set('day', `Day ${st.day}`);
    this.set('phase', st.phase === 'night' ? 'night' : !st.clockRunning ? 'no rush' : `${Math.ceil((st.dayLength - st.dayTime) / 10) * 10}s of daylight`);
    this.k.clock.style.width = (st.phase === 'night' ? 100 : st.clockRunning ? (st.dayTime / st.dayLength) * 100 : 0) + '%';
    this.set('food', st.food);
    const net = st.foodRate - st.foodDemand;
    this.set('foodSub', st.pop > 1 || st.foodRate > 0
      ? `<span class="${net >= 0 ? 'pos' : 'neg'}">+${st.foodRate}</span> / <span class="neg">−${st.foodDemand}</span> per day`
      : `eats ${st.foodDemand} a day`);
    this.k.foodRow.classList.toggle('warn', st.food < st.pop * 2);
    this.set('wood', st.wood);
    this.set('woodSub', st.woodRate ? `+${st.woodRate} per day` : '');
    this.set('stone', st.stone);
    this.set('stoneSub', st.stoneRate ? `+${st.stoneRate} per day` : '');
    this.set('pop', st.pop);
    this.set('popSub', `Grandma${st.pop === 1 ? '' : 's'}${st.hatchlings ? ` · ${st.hatchlings} hatchling${st.hatchlings > 1 ? 's' : ''}` : ''}`);
    this.set('workers', st.workers);
    this.set('workSub', `working${st.idleAdults ? ` · ${st.idleAdults} idle` : ''}`);
    this.set('eggs', st.eggsWaiting);
    this.set('eggSub', `egg${st.eggsWaiting === 1 ? '' : 's'} · ${st.eggsStored}/${st.eggCap} stored${st.incubating ? ` · ${st.incubating} warming` : ''}`);
    this.set('beds', `${st.beds}/${st.pop}`);
    this.k.bedRow.classList.toggle('warn', st.beds < st.pop);

    const wkey = st.warnings.map((w) => w.text).join('|');
    if (wkey !== this.lastWarn) {
      this.lastWarn = wkey;
      this.warnings.innerHTML = st.warnings.map((w) => `<div class="warning l${w.level}">${w.text}</div>`).join('');
    }
    if (obj.text !== this.lastObjective) {
      this.lastObjective = obj.text;
      this.objective.querySelector('[data-o=text]').textContent = obj.text;
      this.objective.querySelector('[data-o=label]').textContent = obj.tutorial ? 'Objective' : 'Meanwhile';
      this.objective.querySelector('[data-o=step]').textContent = obj.tutorial ? `${obj.step + 1}/${obj.total}` : '';
      this.objective.classList.remove('flash');
      void this.objective.offsetWidth;
      this.objective.classList.add('flash');
    }
  }

  setPrompt(it, extra = '') {
    let html = '';
    if (it) {
      const key = it.kind === 'none' ? '' : `<span class="key">${it.hold ? 'Hold E' : 'E'}</span>`;
      html = `<span>${key}${it.label}${extra}</span>`;
      if (it.secondary) html += `<span><span class="key">Q</span>${it.secondary}</span>`;
    }
    if (html === this.lastPrompt) return;
    this.lastPrompt = html;
    this.prompt.innerHTML = html;
    this.prompt.classList.toggle('hidden', !html);
  }

  toast(text, ms = 3200) {
    const el = $(`<div class="toast card">${text}</div>`);
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 600);
  }

  renderBuildBar(state, selected, isUnlocked, canAfford) {
    const items = BUILD_ORDER.map((t, i) => {
      const d = BUILDINGS[t];
      const un = isUnlocked(t);
      const cost = Object.entries(d.cost).map(([k, v]) => `${v} ${k}`).join(' · ');
      const cls = ['bitem', t === selected ? 'sel' : '', un ? '' : 'locked', un && !canAfford(t) ? 'poor' : ''].join(' ');
      const key = i < 9 ? i + 1 : i === 9 ? 0 : '';
      return `<div class="${cls}" data-type="${t}"><div class="n">${un ? d.name : '???'}</div><div class="c">${un ? cost : `${d.unlockPop} Grandmas`}</div><div class="k">${key !== '' ? `[${key}]` : ''}</div></div>`;
    }).join('');
    if (items !== this.lastBar) { this.lastBar = items; this.buildbar.innerHTML = items; }
  }

  showBuild(on) {
    this.buildbar.classList.toggle('hidden', !on);
    this.buildhint.classList.toggle('hidden', !on);
  }

  setBuildHint(html) {
    if (html !== this.lastHint) { this.lastHint = html; this.buildhint.innerHTML = html; }
  }
}
