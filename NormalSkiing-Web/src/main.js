import { Game } from './game/game.js';

const params = new URLSearchParams(location.search);
const debug = params.get('debug') === '1';
const canvas = document.getElementById('game');
const menu = document.getElementById('menu');
let game = null;

function start(mode) {
  menu.style.display = 'none';
  if (!game) {
    game = new Game(canvas, { mode, debug, absoluteMouse: params.get('mouse') === 'abs' });
    window.__game = game;
  } else game.load(mode);
  const wake = () => {
    game.audio.init();
    game.audio.resume();
  };
  if (navigator.userActivation && navigator.userActivation.isActive) wake();
  else {
    const once = () => {
      wake();
      window.removeEventListener('pointerdown', once);
      window.removeEventListener('keydown', once);
    };
    window.addEventListener('pointerdown', once);
    window.addEventListener('keydown', once);
  }
  game.input.lock();
}

for (const b of menu.querySelectorAll('button')) b.addEventListener('click', () => start(b.dataset.mode));
const auto = params.get('mode');
if (auto === 'lab' || auto === 'mountain') start(auto);
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && game) {
    // pointer lock is released by the browser; show the menu on second Esc
    if (!game.input.locked) menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
  }
});
