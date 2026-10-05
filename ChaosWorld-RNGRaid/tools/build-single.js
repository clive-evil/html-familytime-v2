// node tools/build-single.js → dist/ChaosWorld-RNGRaid.html (one self-contained file: CSS, fonts, JS inlined)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="([^"]+)"\s*\/>/g, (_, f) => `<style>/* ${f} */\n${read(f)}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, f) => `<script>/* ${f} */\n${read(f).replace(/<\/script/gi, '<\\/script')}\n</script>`);
if (/(src|href)="(?!data:)[^"#]+\.(js|css)"/.test(html)) throw new Error('unresolved external reference');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'ChaosWorld-RNGRaid.html');
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(root, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
