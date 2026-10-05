import '@fontsource/lilita-one/400.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import { Game } from './game/Game.js';

const params = new URLSearchParams(location.search);
const root = document.getElementById('app');
const canvas = document.getElementById('c');
const game = new Game({ root, canvas, params });
game.init().then(() => {
  const l = document.getElementById('loading');
  if (l) { l.style.opacity = '0'; setTimeout(() => l.remove(), 350); }
}).catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.innerHTML = `Couldn't start<small>${String(e.message || e)}</small>`;
});
