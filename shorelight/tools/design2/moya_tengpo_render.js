// Render the 墨鴉 / 藤婆 turnaround sheets to docs/design/v2/<char>_sheet.png
//   node tools/design2/moya_tengpo_render.js [moya|tengpo] [view] [outfile]
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
(async () => {
  const which = process.argv[2] ? [process.argv[2]] : ['moya', 'tengpo'];
  const view = process.argv[3];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  for (const ch of which) {
    await page.goto('file://' + path.join(__dirname, ch + '.html') + (view ? '?view=' + view : ''));
    await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 60000 });
    const data = await page.evaluate(() => document.getElementById('c').toDataURL('image/png'));
    const out = process.argv[4] || path.join(ROOT, 'docs', 'design', 'v2', view ? `_wip_${ch}_${view}.png` : `${ch}_sheet.png`);
    require('fs').writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, out));
  }
  await browser.close();
})();
