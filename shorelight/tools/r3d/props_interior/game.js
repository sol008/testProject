// In-game check of the interior props: opens index.html?debug&map=<id>… in headless Chromium, waits, screenshots,
// prints console errors.   node tools/r3d/props_interior/game.js "map=jiufen_teahouse&r3lite" out.png [waitSeconds] [js-to-eval]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [qs = 'map=jiufen_teahouse&r3lite', out = 'game.png', wait = '12', js] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', (m) => { if (/ERR_FILE_NOT_FOUND/.test(m.text())) return; if (m.type() === 'error' || (m.type() === 'warning' && !/PCFSoft|GPU stall/.test(m.text()))) errs.push(m.type() + ': ' + m.text().slice(0, 400)); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto('file://' + path.resolve(__dirname, '../../../index.html') + '?debug&' + qs, { waitUntil: 'load', timeout: 120000 });
  await p.waitForTimeout(+wait * 1000);
  if (js) console.log(JSON.stringify(await p.evaluate(js)));
  await p.screenshot({ path: out });
  console.log(errs.length ? errs.slice(0, 30).join('\n') : 'no console errors');
  await b.close();
})();
