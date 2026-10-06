// Inlines src/style.css and src/js/*.js into one standalone HTML file.
import { readFileSync, writeFileSync } from 'node:fs';
const order = ['core', 'sim', 'crew', 'threat', 'art', 'fx', 'render', 'audio', 'director', 'ui', 'main'];
const css = readFileSync('src/style.css', 'utf8');
const js = order.map((n) => `// ---- ${n}.js ----\n` + readFileSync(`src/js/${n}.js`, 'utf8').replace(/^'use strict';\n/, '')).join('\n');
const shell = readFileSync('src/shell.html', 'utf8');
const out = shell.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => "'use strict';\n" + js.replace(/<\/script/gi, '<\\/script'));
writeFileSync('dist/ColonyShipHorror.html', out);
console.log('built dist/ColonyShipHorror.html', (out.length / 1024).toFixed(1) + ' KB');
