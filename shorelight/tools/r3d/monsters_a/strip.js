// node tools/r3d/monsters_a/strip.js "<query>" out.png   — renders strip.html, prints per-id stats + console errors
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [qs = '', out = 'strip.png'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 400, height: 300 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 600)); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message + '\n' + (e.stack || '').slice(0, 600)));
  await p.goto('file://' + path.resolve(__dirname, 'strip.html') + '?' + qs, { waitUntil: 'commit', timeout: 120000 });
  try { await p.waitForFunction(() => window.__ready, null, { timeout: 900000, polling: 500 }); } catch (e) { console.log('TIMEOUT'); }
  const size = await p.evaluate(() => window.__size);
  if (size) await p.setViewportSize({ width: size[0], height: size[1] });
  console.log(JSON.stringify(await p.evaluate(() => window.__stats)));
  await p.screenshot({ path: out });
  if (errs.length) console.log(errs.slice(0, 30).join('\n'));
  await b.close();
})();
