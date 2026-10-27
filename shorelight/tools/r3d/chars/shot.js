// Character test shots: node tools/r3d/chars/shot.js "<viewer query>" out.png [w h]
// Same as tools/r3d/shot.js but also prints console warnings (G.warnOnce) and page errors.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [qs = '', out = 'chars.png', w = '1280', h = '720'] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  const logs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 400)); });
  p.on('pageerror', (e) => logs.push('PAGEERR ' + (e.stack || e.message).slice(0, 800)));
  await p.goto('file://' + path.resolve(__dirname, process.env.VIEW || 'view.html') + '?w=' + w + '&h=' + h + '&' + qs, { waitUntil: 'commit', timeout: 120000 });
  try { await p.waitForFunction(() => window.__ready, null, { timeout: 600000 }); } catch (e) { logs.push('TIMEOUT'); }
  console.log(JSON.stringify(await p.evaluate(() => window.__stats)));
  await p.screenshot({ path: out });
  if (logs.length) console.log(logs.slice(0, 30).join('\n'));
  await b.close();
})();
