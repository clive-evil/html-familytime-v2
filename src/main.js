import './ui/styles.css';
import { Game } from './game/Game.js';

// URL flags (all optional):
//   ?debug=1     dev panel + perf readout
//   ?stress=200  skip to a colony of N Grandmas (50/100/200/300...)
//   ?seed=123    fixed world seed
//   ?test=1      automation mode: no pointer lock, no menus, starts immediately
//   ?autoplay=1  the AutoPlayer bot plays the game
//   ?nosave=1    don't read/write localStorage
//   ?speed=4     simulation speed multiplier
const q = new URLSearchParams(location.search);
const num = (k) => (q.has(k) ? Number(q.get(k)) : null);
const params = {
  debug: q.has('debug'),
  stress: num('stress'),
  seed: num('seed'),
  test: q.has('test'),
  autoplay: q.has('autoplay'),
  nosave: q.has('nosave') || q.has('stress'),
  speed: num('speed') || 1,
};

new Game(document.getElementById('game'), document.getElementById('ui'), params);
