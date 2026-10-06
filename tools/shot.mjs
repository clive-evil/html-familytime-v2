// Usage: node tools/shot.mjs <name> [query] [jsBeforeShot]
import { mkdirSync } from 'node:fs'; mkdirSync(process.env.SHOT_DIR || 'shots', { recursive: true });
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const [name = 'shot', query = 'autostart=1&seed=7', pre = ''] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('AudioContext')) errs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
await page.goto('file://' + process.cwd() + '/dist/ColonyShipHorror.html?' + query);
await page.waitForTimeout(1200);
if (pre) { const r = await page.evaluate(pre); if (r !== undefined) console.log('eval:', typeof r === 'string' ? r : JSON.stringify(r, null, 1)); }
await page.waitForTimeout(800);
await page.screenshot({ path: `${process.env.SHOT_DIR || 'shots'}/${name}.png` });
console.log(errs.slice(0, 20).join('\n') || 'no errors');
await browser.close();
