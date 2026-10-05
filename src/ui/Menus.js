import { pickLine } from './Speech.js';

const CONTROLS = `
<div class="controls">
  <div><span class="key">WASD</span>move</div>
  <div><span class="key">Mouse</span>look</div>
  <div><span class="key">Shift</span>sprint</div>
  <div><span class="key">Wheel</span>zoom</div>
  <div><span class="key">E</span>/<span class="key">LMB</span>interact</div>
  <div><span class="key">Q</span>remove / put down</div>
  <div><span class="key">B</span>build menu</div>
  <div><span class="key">R</span>rotate building</div>
  <div><span class="key">Esc</span>pause</div>
  <div><span class="key">F3</span>performance</div>
</div>`;

export class Menus {
  constructor(root, handlers) {
    this.root = root;
    this.h = handlers;
    this.el = document.createElement('div');
    this.el.className = 'overlay dim hidden';
    root.appendChild(this.el);
    this.mode = '';
  }

  get open() { return this.mode !== ''; }

  close() {
    this.mode = '';
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
  }

  _show(mode, html, dim = true) {
    this.mode = mode;
    this.el.className = 'overlay' + (dim ? ' dim' : '');
    this.el.innerHTML = html;
    this.el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.click && this.h.click();
      this.h[b.dataset.a] && this.h[b.dataset.a]();
    }));
  }

  title(hasSave) {
    this._show('title', `<div class="menu card">
      <h1>TOO MANY<br>GRANDMAS</h1>
      <div class="tag">“They keep hatching.”</div>
      ${hasSave ? '<button class="btn" data-a="continue">Continue</button>' : ''}
      <button class="btn" data-a="newGame">${hasSave ? 'New Game' : 'Begin'}</button>
      ${CONTROLS}
    </div>`);
  }

  pause() {
    this._show('pause', `<div class="menu card">
      <h2>Paused</h2>
      <button class="btn" data-a="resume">Resume</button>
      <button class="btn subtle" data-a="save">Save now</button>
      <button class="btn subtle" data-a="toggleMute">Sound: on/off</button>
      <button class="btn subtle" data-a="confirmReset">New game (wipes save)</button>
      ${CONTROLS}
    </div>`);
  }

  confirmReset() {
    this._show('confirm', `<div class="menu card">
      <h2>Start over?</h2>
      <p>The Grandmas will not remember you. Your save will be deleted.</p>
      <button class="btn" data-a="reset">Yes, new game</button>
      <button class="btn subtle" data-a="pauseMenu">No</button>
    </div>`);
  }

  summary(s) {
    const line = (label, val, cls = '') => `<div class="line ${cls}"><span>${label}</span><b>${val}</b></div>`;
    const lines = [
      line('Grandmas', s.pop),
      line('Eggs laid overnight', s.eggsLaid, s.eggsLaid ? 'good' : ''),
      s.eggsLost ? line('Eggs rolled away (storage full)', s.eggsLost, 'bad') : '',
      s.grown ? line('Hatchlings grown up', s.grown, 'good') : '',
      line('Food brought in', s.foodIn ?? 0),
      line('Food eaten', s.eaten),
      s.missedMeals ? line('Missed meals', s.missedMeals, 'bad') : '',
      s.sleptOutside ? line('Slept on the lawn', s.sleptOutside, 'bad') : line('Everyone had a bed', 'yes', 'good'),
      line('Eggs waiting', s.eggsWaiting),
    ].join('');
    const quote = s.sleptOutside ? pickLine('noBed') : s.missedMeals ? pickLine('hungry') : pickLine('morning');
    this._show('summary', `<div class="summary card">
      <h2>Morning of Day ${s.day + 1}</h2>
      ${lines}
      <div class="quote">“${quote}”</div>
      <button class="btn" data-a="dismissSummary">Get up</button>
    </div>`);
  }
}
