// Screenshot the arch_coast test viewer.  node tools/r3d/arch_coast/shot.js "<query>" out.png
// e.g. node tools/r3d/arch_coast/shot.js 'ids=tatala&o={"water":true}&water=1&yaw=25' /tmp/x.png
// Prints per-item stats (tris, draw calls, bbox, NaN bounds) and any console errors.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [qs = '', out = 'arch_coast.png'] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 400)); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto('file://' + path.resolve(__dirname, 'view.html') + '?' + qs, { waitUntil: 'commit', timeout: 120000 });
  await p.waitForFunction(() => window.__ready, null, { timeout: 600000 });
  const st = await p.evaluate(() => window.__stats);
  console.log(`total: ${st.calls} calls, ${st.tris} tris`);
  for (const it of st.items || []) console.log(`  ${it.id}: ${it.tris} tris, ${it.calls} meshes, bbox ${JSON.stringify(it.bbox)}${it.nan ? ' NaN!' : ''}${it.missing ? ' MISSING' : ''}`);
  for (const e of st.errors || []) console.log('ERR ' + e.slice(0, 600));
  await p.screenshot({ path: out });
  if (errs.length) console.log(errs.slice(0, 20).join('\n'));
  await b.close();
})();
