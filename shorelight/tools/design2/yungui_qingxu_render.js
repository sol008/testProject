// 彼岸燈 — design pass v2 render script for 雲歸 & 清虛真人
//   node tools/design2/yungui_qingxu_render.js [yungui|qingxu|all] [--opt N] [--scale S] [--out file]
// Writes docs/design/v2/yungui_sheet.png, docs/design/v2/yungui/opt01..10.png, docs/design/v2/qingxu_sheet.png
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'design', 'v2');
const args = process.argv.slice(2);
const which = args.find((a) => !a.startsWith('--') && !/^\d/.test(a)) || 'all';
const arg = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };

async function grab(page, url, file) {
  await page.goto(url);
  await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 60000 });
  const data = await page.evaluate(() => document.getElementById('cv').toDataURL('image/png'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote', path.relative(ROOT, file));
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => { errs.push(e.message); console.error('page error:', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  const base = (f) => 'file://' + path.join(__dirname, f);
  const opt = arg('opt'), scale = arg('scale') || '1', out = arg('out');
  if (which === 'yungui' || which === 'all') {
    if (opt) await grab(page, base('yungui.html') + `?opt=${opt}&scale=${scale}`, out || path.join(OUT, 'yungui', `opt${String(opt).padStart(2, '0')}.png`));
    else {
      await grab(page, base('yungui.html') + `?scale=${scale}`, out || path.join(OUT, 'yungui_sheet.png'));
      if (!out) for (let i = 1; i <= 10; i++) await grab(page, base('yungui.html') + `?opt=${i}&scale=1`, path.join(OUT, 'yungui', `opt${String(i).padStart(2, '0')}.png`));
    }
  }
  if (which === 'qingxu' || which === 'all') {
    await grab(page, base('qingxu.html') + `?scale=${scale}` + (arg('part') ? `&part=${arg('part')}` : ''), out || path.join(OUT, 'qingxu_sheet.png'));
  }
  await browser.close();
  if (errs.length) process.exitCode = 1;
})();
