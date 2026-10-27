// Render 洛紅纓 / 洛青鋒 design-pass-v2 PNGs.
//   node tools/design2/hongying_qingfeng_render.js [hongying|qingfeng|all] [optN]
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'design', 'v2');
const which = process.argv[2] || 'all';
const onlyOpt = process.argv[3];

(async () => {
  fs.mkdirSync(path.join(OUT, 'hongying'), { recursive: true });
  const browser = await chromium.launch();
  const errs = [];
  const page = await browser.newPage({ viewport: { width: 2400, height: 1200 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  if (which === 'hongying' || which === 'all') {
    const url = 'file://' + path.join(__dirname, 'hongying.html');
    if (!onlyOpt) {
      await page.goto(url); await page.waitForFunction(() => document.body.dataset.ready);
      await (await page.$('#sheet')).screenshot({ path: path.join(OUT, 'hongying_sheet.png') });
      console.log('wrote hongying_sheet.png');
    }
    const n = await page.evaluate(() => (window.LQ ? LQ.HONGYING.length : 10));
    const sp = await browser.newPage({ viewport: { width: 600, height: 1200 }, deviceScaleFactor: 1 });
    sp.on('pageerror', (e) => errs.push(e.message));
    for (let i = 1; i <= n; i++) {
      if (onlyOpt && +onlyOpt !== i) continue;
      await sp.goto(url + '?opt=' + i + '&scale=1.05'); await sp.waitForFunction(() => document.body.dataset.ready);
      const f = path.join(OUT, 'hongying', 'opt' + String(i).padStart(2, '0') + '.png');
      await (await sp.$('canvas:not(#hdr)')).screenshot({ path: f });
      console.log('wrote', path.relative(ROOT, f));
    }
  }
  if (which === 'qingfeng' || which === 'all') {
    const url = 'file://' + path.join(__dirname, 'qingfeng.html');
    const qp = await browser.newPage({ viewport: { width: 2400, height: 1500 }, deviceScaleFactor: 1 });
    qp.on('pageerror', (e) => errs.push(e.message));
    qp.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
    await qp.goto(url); await qp.waitForFunction(() => document.body.dataset.ready);
    await (await qp.$('canvas')).screenshot({ path: path.join(OUT, 'qingfeng_sheet.png') });
    console.log('wrote qingfeng_sheet.png');
  }
  await browser.close();
  if (errs.length) { console.error('PAGE ERRORS:\n' + errs.join('\n')); process.exitCode = 1; }
})();
