#!/usr/bin/env node
/*
 * Build: Chaos World Battle Lab (vendored, unmodified engine + art) + Mike Minigames mod layer
 *   node build.js  ->  dist/ChaosWorldMikeMinigames.html
 *
 * ref/BattleLab-index.html is the Battle Lab's own standalone build. We do NOT redraw its art:
 * we inject one line that exposes the engine internals (window.__BL) and append our mod
 * (src/mod.css + src/mod/*.js), which drives the real Battle / Fighter / FX / HUD objects.
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const REF = path.join(ROOT, 'ref', 'BattleLab-index.html');
const OUT = path.join(ROOT, 'dist', 'ChaosWorldMikeMinigames.html');

let html = fs.readFileSync(REF, 'utf8');

// 1) expose engine internals (names are from this exact vendored build)
const EXPORTS = {
  gn: 'demon painter', R: 'Act timeline class', M: 'pose library', D: 'easings', A: 'pose normaliser',
  kn: 'enemy defs', Dn: 'hero defs', B: 'skill defs', Jn: 'skill/item icon', rr: 'portrait', k: 'sfx',
  Kt: 'Fighter class', o: 'linear gradient', s: 'radial gradient', c: 'outline+fill', f: 'painted shape',
  u: 'crescent shade', z: 'svg path', p: 'polyline', i: 'tone', a: 'alpha', J: 'rng',
};
const inj = 'window.__BL={' + Object.keys(EXPORTS).map((n) => `${n}:(()=>{try{return ${n}}catch(e){return undefined}})()`).join(',') + '};';
const KEY = 'Wa()})();</script>';
if (html.split(KEY).length !== 2) throw new Error('Injection point not found — Battle Lab build changed?');
html = html.replace(KEY, inj + KEY);

// 2) mod layer
const css = fs.readFileSync(path.join(ROOT, 'src', 'mod.css'), 'utf8');
const jsFiles = fs.readdirSync(path.join(ROOT, 'src', 'mod')).filter((f) => f.endsWith('.js')).sort();
const js = jsFiles.map((f) => `/* ---- ${f} ---- */\n` + fs.readFileSync(path.join(ROOT, 'src', 'mod', f), 'utf8')).join('\n');
if (/<\/script/i.test(js)) throw new Error('mod JS contains </script');
html = html.replace('</head>', () => `<style id="cw-mod-css">\n${css}\n</style>\n</head>`);
html = html.replace(/<title>[^<]*<\/title>/, '<title>Chaos World — Battle Experiments</title>');
const idx = html.lastIndexOf('</body>');
html = html.slice(0, idx) + `<script id="cw-mod">\n"use strict";\n${js}\n</script>\n` + html.slice(idx);

// 3) standalone guard (svg xmlns strings inside data: URIs are fine)
const scrub = html.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '');
for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /src\s*=\s*["']https?:/i, /href\s*=\s*["']https?:/i, /url\(\s*["']?https?:/i, /@import/]) {
  if (re.test(scrub)) throw new Error('Standalone check failed: ' + re);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`Built ${path.relative(ROOT, OUT)} — ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB (Battle Lab engine + ${jsFiles.length} mod modules)`);
