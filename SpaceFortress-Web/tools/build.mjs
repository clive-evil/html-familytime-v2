// Inlines CSS + all JS modules into a single standalone dist/SpaceFortress.html (runs from file://).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const ORDER = ['core', 'data', 'sim', 'combat', 'campaign', 'tutorial', 'bot', 'audio', 'iron', 'art', 'fx', 'render', 'deck', 'stations', 'ui', 'ui2', 'manual', 'pk', 'main'];
const css = readFileSync('src/style.css', 'utf8');
const js = ORDER.map((n) => `// ===== ${n}.js =====\n` + readFileSync(`src/js/${n}.js`, 'utf8')).join('\n');
const shell = readFileSync('src/shell.html', 'utf8');
const out = shell.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js.replace(/<\/script/gi, '<\\/script'));
mkdirSync('dist', { recursive: true });
writeFileSync('dist/SpaceFortress.html', out);
console.log('built dist/SpaceFortress.html', (out.length / 1024).toFixed(1) + ' KB');
