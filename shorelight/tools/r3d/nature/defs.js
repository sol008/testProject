// Print footprint/solid info of nature object types from the 2D registry (runs the art files in a page).
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.resolve(__dirname, '../viewer.html') + '?ids=none', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  const r = await p.evaluate((ids) => ids.map((id) => {
    const d = G.Objects.get(id); if (!d) return id + ': MISSING';
    let sol = '';
    if (d.solidAt) { const a = []; for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) a.push(d.solidAt({ t: id, x: 0, y: 0 }, x, y) ? 1 : 0); sol = ' solidAt=' + a.join(''); }
    return `${id}: w${d.w} h${d.h} solid=${d.solid}${sol} flat=${!!d.flat} anim=${!!d.anim}`;
  }), process.argv[2].split(','));
  console.log(r.join('\n'));
  await b.close();
})();
