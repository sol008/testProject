// Render 白芷 design pass v2 to PNGs.
//   node tools/design2/baizhi_render.js            -> sheet + 10 single cards
//   node tools/design2/baizhi_render.js 3 7        -> only cards 3 and 7 (+ no sheet)
//   node tools/design2/baizhi_render.js zoom 3     -> 2x close-up of card 3 to scratch (BZ_OUT dir)
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'design', 'v2');
const PAGE = 'file://' + path.join(__dirname, 'baizhi.html');
const CARD_H = 880;

(async () => {
  const args = process.argv.slice(2);
  fs.mkdirSync(path.join(OUT, 'baizhi'), { recursive: true });
  const browser = await chromium.launch();
  const errs = [];
  async function shot(url, file, vw, vh, dpr = 1) {
    const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 60000 });
    const err = await page.evaluate(() => document.body.dataset.error);
    if (err) errs.push(err);
    await page.locator('#cv').screenshot({ path: file });
    await page.close();
    console.log('wrote', path.relative(ROOT, file));
  }
  if (args[0] === 'fig') {
    // node baizhi_render.js fig N scale y0 y1
    const dir = process.env.BZ_OUT || OUT;
    const [n, sc, y0, y1] = [args[1], args[2] || '2', args[3] || '-470', args[4] || '10'];
    await shot(`${PAGE}?fig=${n}&s=${sc}&y0=${y0}&y1=${y1}`, path.join(dir, `fig${n}.png`), Math.ceil(420 * sc), Math.ceil((y1 - y0) * sc), 1);
  } else if (args[0] === 'zoom') {
    const dir = process.env.BZ_OUT || OUT;
    for (const n of args.slice(1)) await shot(`${PAGE}?opt=${n}&s=1`, path.join(dir, `zoom${n}.png`), 480, 880, 2);
  } else {
    const only = args.map(Number).filter(Boolean);
    const s = 900 / CARD_H;
    for (let n = 1; n <= 10; n++) {
      if (only.length && !only.includes(n)) continue;
      await shot(`${PAGE}?opt=${n}&s=${s}`, path.join(OUT, 'baizhi', `opt${String(n).padStart(2, '0')}.png`), Math.ceil(480 * s), 900);
    }
    if (!only.length) await shot(PAGE, path.join(OUT, 'baizhi_sheet.png'), 2496, 2108);
  }
  await browser.close();
  if (errs.length) { console.error('ERRORS:\n' + errs.join('\n')); process.exitCode = 1; }
})();
