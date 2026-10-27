// node tools/r3d/props_street/shot.js "<query>" out.png   (same as ../shot.js but loads the props_street harness)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [qs = '', out = 'p.png'] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
  p.on('pageerror', (e) => { errs.push('PAGEERR ' + e.message); console.log('PAGEERR', e.message); });
  await p.goto('file://' + path.resolve(__dirname, 'view.html') + '?' + qs.replace(/#/g, '%23'), { waitUntil: 'commit', timeout: 120000 });
  await p.waitForFunction(() => window.__ready, null, { timeout: 100000 });
  console.log(JSON.stringify(await p.evaluate(() => window.__stats)));
  await p.screenshot({ path: out });
  if (errs.length) console.log(errs.slice(0, 20).join('\n'));
  await b.close();
})();
