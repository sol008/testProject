// dev helper: node tools/design2/xinghe_shot.js <query> <out.png> [clipX,clipY,w,h] [dpr]
'use strict';
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const [q, out, clip, dpr] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 2480, height: 1000 }, deviceScaleFactor: parseFloat(dpr || '1') });
  p.on('pageerror', (e) => console.error('page error:', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await p.goto('file://' + path.join(__dirname, 'xinghe.html') + '?' + q);
  await p.waitForFunction(() => document.body.dataset.ready, null, { timeout: 60000 });
  const o = { path: out };
  if (clip) { const [x, y, w, h] = clip.split(',').map(Number); o.clip = { x, y, width: w, height: h }; } else o.fullPage = true;
  await p.screenshot(o);
  await b.close();
})();
