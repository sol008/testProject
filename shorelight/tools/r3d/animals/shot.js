// Screenshot the animals viewer, several shots per browser launch.
//   node tools/r3d/animals/shot.js "<query>" out.png ["<query2>" out2.png ...]
// Prints the viewer stats and any console errors per shot.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const args = process.argv.slice(2);
  const b = await chromium.launch();
  for (let i = 0; i + 1 < args.length; i += 2) {
    const qs = args[i], out = args[i + 1];
    const w = (/[?&]w=(\d+)/.exec('&' + qs) || [])[1] || 1280, h = (/[?&]h=(\d+)/.exec('&' + qs) || [])[1] || 720;
    const p = await b.newPage({ viewport: { width: +w, height: +h } });
    const errs = [];
    p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 400)); });
    p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message + '\n' + (e.stack || '').slice(0, 600)));
    await p.goto('file://' + path.resolve(__dirname, 'view.html') + '?' + qs, { waitUntil: 'commit', timeout: 120000 });
    try {
      await p.waitForFunction(() => window.__ready, null, { timeout: 600000, polling: 200 });
      console.log(out, JSON.stringify(await p.evaluate(() => window.__stats)));
    } catch (e) { console.log(out, 'TIMEOUT/ERR', e.message.slice(0, 200)); }
    await p.screenshot({ path: out });
    if (errs.length) console.log(errs.slice(0, 20).join('\n'));
    await p.close();
  }
  await b.close();
})();
