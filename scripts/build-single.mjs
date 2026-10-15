#!/usr/bin/env node
// Packs the production build into ONE self-contained HTML file that runs from
// a double-click (file://), with no server and no install.
//   npm run build:single  ->  dist-single/too-many-grandmas.html
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = 'dist';
let html = await readFile(join(DIST, 'index.html'), 'utf8');

// Inline the stylesheet(s).
for (const m of [...html.matchAll(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+)"[^>]*>/g)]) {
  const css = await readFile(join(DIST, m[1]), 'utf8');
  html = html.replace(m[0], () => `<style>\n${css}\n</style>`);
}
// Inline the module script(s). Inline module scripts are allowed on file://.
for (const m of [...html.matchAll(/<script type="module"[^>]*src="\.?\/?([^"]+)"[^>]*><\/script>/g)]) {
  const js = (await readFile(join(DIST, m[1]), 'utf8')).replace(/<\/script/gi, '<\\/script');
  html = html.replace(m[0], () => '');
  html = html.replace('</body>', () => `<script type="module">\n${js}\n</script>\n</body>`);
}
if (/src="\.?\/?assets\//.test(html) || /href="\.?\/?assets\//.test(html)) throw new Error('un-inlined asset reference left in HTML');

await mkdir('dist-single', { recursive: true });
const out = join('dist-single', 'too-many-grandmas.html');
await writeFile(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} kB)`);
