// node tools/r3d/monsters_b/shot.js "<query>" out.png — screenshot the team-B harness (view.html); prints stats + console errors
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [qs = '', out = 'mb.png'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 400)); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').slice(0, 400)));
  await p.goto('file://' + path.resolve(__dirname, 'view.html') + '?' + qs, { waitUntil: 'commit', timeout: 120000 });
  try { await p.waitForFunction(() => window.__ready, null, { timeout: 600000 }); } catch (e) { errs.push('TIMEOUT'); }
  console.log(JSON.stringify(await p.evaluate(() => window.__stats)));
  await p.screenshot({ path: out });
  if (errs.length) console.log(errs.slice(0, 20).join('\n'));
  await b.close();
})();
