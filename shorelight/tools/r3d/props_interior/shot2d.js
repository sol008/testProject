// node tools/r3d/props_interior/shot2d.js "ids=a,b&v=0" out.png — screenshot the 2D reference page
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [qs = '', out = 'art2d.png'] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.goto('file://' + path.resolve(__dirname, 'art2d.html') + '?' + qs);
  await p.waitForFunction(() => window.__ready);
  await p.screenshot({ path: out });
  await b.close();
})();
