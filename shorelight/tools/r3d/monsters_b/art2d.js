// node tools/r3d/monsters_b/art2d.js "ids=a,b&scale=1" out.png  — screenshot the 2D reference sheet
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [qs = '', out = 'art2d.png'] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  p.on('console', (m) => { if (m.type() === 'error') console.log(m.text()); });
  await p.goto('file://' + path.resolve(__dirname, 'art2d.html') + '?' + qs);
  await p.waitForFunction(() => window.__ready);
  await p.screenshot({ path: out, fullPage: true });
  await b.close();
})();
