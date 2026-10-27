// Screenshot the 3D asset viewer.  node tools/r3d/shot.js "<query string>" out.png
// e.g. node tools/r3d/shot.js "kind=models&ids=house_jiufen,teahouse&yaw=25" /tmp/x.png
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [qs = '', out = 'viewer.png'] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto('file://' + path.resolve(__dirname, 'viewer.html') + '?' + qs, { waitUntil: 'commit', timeout: 120000 });
  await p.waitForFunction(() => window.__ready, null, { timeout: 600000 });
  console.log(JSON.stringify(await p.evaluate(() => window.__stats)));
  await p.screenshot({ path: out });
  if (errs.length) console.log(errs.slice(0, 20).join('\n'));
  await b.close();
})();
