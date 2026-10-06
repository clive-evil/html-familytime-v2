// node tools/build-single.js → dist/ChaosWorld-RNGRaid.html (one self-contained file: CSS, fonts, JS and any
// real art referenced from js/art-manifest.js are inlined, so it runs from file:// with no network).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const MIME = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
// Swap 'assets/…' art paths for data URIs (only files that exist; nulls stay procedural).
function inlineAssets(src) {
  return src.replace(/(['"])(assets\/[^'"]+\.(png|webp|jpe?g|gif|svg))\1/gi, (m, q, rel) => {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) { console.warn('missing art (left as path):', rel); return m; }
    const uri = `data:${MIME[path.extname(file).toLowerCase()]};base64,${fs.readFileSync(file).toString('base64')}`;
    return q + uri + q;
  });
}
let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="([^"]+)"\s*\/>/g, (_, f) => `<style>/* ${f} */\n${read(f)}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, f) => {
  let js = read(f);
  if (f.endsWith('art-manifest.js')) js = inlineAssets(js);
  return `<script>/* ${f} */\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`;
});
if (/(src|href)="(?!data:)[^"#]+\.(js|css)"/.test(html)) throw new Error('unresolved external reference');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'ChaosWorld-RNGRaid.html');
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(root, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
