#!/usr/bin/env node
/*
 * Build: inlines src/style.css + src/js/*.js + assets/* into ONE standalone HTML.
 *   node build.js            -> dist/ChaosWorldMikeMinigames.html
 * No npm dependencies. Any image in ./assets whose basename matches an art slot
 * (see ASSET SLOTS in README.md) is base64-embedded and replaces the procedural art.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist', 'ChaosWorldMikeMinigames.html');
const SLOTS = [
  'scrub', 'archer', 'knight', 'hexa', 'boss', 'hunter',
  'slime', 'goblin', 'skeleton', 'imp', 'brute',
  'portrait_scrub', 'portrait_archer', 'portrait_knight', 'portrait_hexa', 'portrait_boss', 'portrait_hunter',
  'bg_mode1', 'bg_mode2',
  'item_spike', 'item_oil', 'item_banana', 'item_smoke', 'item_firemine', 'item_chain', 'item_boulder',
  'item_ice', 'item_spring', 'item_barrel', 'item_portal', 'item_megabomb', 'item_double', 'item_stun',
];
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(SRC, 'style.css'), 'utf8');
const jsFiles = fs.readdirSync(path.join(SRC, 'js')).filter((f) => f.endsWith('.js')).sort();
let js = jsFiles.map((f) => `/* ---- ${f} ---- */\n` + fs.readFileSync(path.join(SRC, 'js', f), 'utf8')).join('\n');

const assets = {};
const adir = path.join(ROOT, 'assets');
if (fs.existsSync(adir)) {
  for (const f of fs.readdirSync(adir)) {
    const ext = path.extname(f).toLowerCase(), base = path.basename(f, path.extname(f)).toLowerCase();
    if (!MIME[ext]) continue;
    if (!SLOTS.includes(base)) { console.warn('  (skipped asset with unknown slot name: ' + f + ')'); continue; }
    assets[base] = 'data:' + MIME[ext] + ';base64,' + fs.readFileSync(path.join(adir, f)).toString('base64');
  }
}
js = js.replace('/*__ASSETS__*/{}', JSON.stringify(assets));

if (/<\/script/i.test(js)) throw new Error('JS contains </script — would break inlining');
const stamp = new Date().toISOString().slice(0, 10);
let out = html.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js).replace('__BUILD__', stamp);

// Standalone guard: no external URLs / fetch / imports may sneak into the build.
const banned = [/\bfetch\s*\(/, /XMLHttpRequest/, /\bimport\s*\(/, /src\s*=\s*["']https?:/i, /href\s*=\s*["']https?:/i, /url\(\s*["']?https?:/i, /@import/];
for (const re of banned) if (re.test(out)) throw new Error('Standalone check failed: found ' + re);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`Built ${path.relative(ROOT, OUT)} — ${kb} KB — ${jsFiles.length} JS modules — ${Object.keys(assets).length} embedded asset override(s)${Object.keys(assets).length ? ': ' + Object.keys(assets).join(', ') : ''}`);
