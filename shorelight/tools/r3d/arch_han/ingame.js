// In-game check: load a map in the real game (?debug&r3lite), screenshot it and report console errors plus which
// object types render as real models vs 2D fallbacks.
//   node tools/r3d/arch_han/ingame.js jiufen out.png ["x=20&y=30"] [yawSteps=0] [full=1 → no r3lite]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [map = 'jiufen', out = 'ingame.png', extra = '', yawSteps = '0', full = ''] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /arch_han|model |mupd/.test(m.text()))) errs.push(m.type() + ': ' + m.text().slice(0, 400)); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  const missing = new Set();
  p.on('requestfailed', (r) => missing.add(r.url().replace(/^.*shorelight\//, '')));
  await p.goto('file://' + path.resolve(__dirname, '../../../index.html') + `?debug${full ? '' : '&r3lite'}&map=${map}&${extra}`, { waitUntil: 'commit', timeout: 120000 });
  await p.waitForFunction(() => { if (!window.G || !G.Scenes) return false; const s = G.Scenes && G.Scenes.top && G.Scenes.top(); return s && s.view3d && s.view3d.nodes; }, null, { timeout: 300000 }).catch(() => errs.push('no 3D map view'));
  await p.waitForTimeout(2500);
  for (let i = 0; i < +yawSteps; i++) { await p.keyboard.press('KeyE'); await p.waitForTimeout(1200); }
  const info = await p.evaluate(() => {
    const s = G.Scenes.top(), v = s.view3d; if (!v) return 'no view';
    const real = {}, fb = {};
    for (const [o, node] of v.nodes) { const n = node.children[0]; const k = o.t; if (n && n.userData.fallback) fb[k] = (fb[k] || 0) + 1; else real[k] = (real[k] || 0) + 1; }
    const r = G.R3.renderer.info.render;
    return `models: ${JSON.stringify(real)}\nfallbacks: ${JSON.stringify(fb)}\ncalls ${r.calls} tris ${r.triangles}`;
  });
  console.log(info);
  await p.screenshot({ path: out });
  if (missing.size) console.log('missing files (not loaded): ' + [...missing].join(', '));
  const real = errs.filter((e) => !/ERR_FILE_NOT_FOUND/.test(e));
  if (real.length) console.log(real.slice(0, 30).join('\n'));
  await b.close();
})();
