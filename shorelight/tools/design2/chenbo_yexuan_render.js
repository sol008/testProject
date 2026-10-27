// Render the 陳伯 / 夜玄 final turnaround sheets to PNG.
// usage: node tools/design2/chenbo_yexuan_render.js [chenbo|yexuan|all] [outDir]
const path = require('path');
const fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }

(async () => {
  const which = process.argv[2] || 'all';
  const out = process.argv[3] || path.join(__dirname, '../../docs/design/v2');
  fs.mkdirSync(out, { recursive: true });
  const names = which === 'all' ? ['chenbo', 'yexuan'] : [which];
  const browser = await pw.chromium.launch();
  for (const n of names) {
    const page = await browser.newPage({ viewport: { width: 2820, height: 1200 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.log(`[${n}] PAGE ERROR`, e.message));
    await page.goto('file://' + path.join(__dirname, n + '.html'));
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60000 });
    await page.waitForTimeout(200);
    const el = await page.$('#sheet');
    const file = path.join(out, n + '_sheet.png');
    await el.screenshot({ path: file });
    console.log('wrote', file);
    await page.close();
  }
  await browser.close();
})();
