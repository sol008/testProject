// In-game 3D check: node tools/r3d/nature/game.js <mapId> out.png [extra query] [waitMs]
// [grass=1] also scatters the instanced grass carpet. Opens index.html?debug&r3lite&map=<id> with the 3D renderer on, prints console errors + nature stats.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [map = 'jiufen', out = 'game.png', extra = '', wait = '6000', grass = ''] = process.argv.slice(2);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('shorelight_settings', JSON.stringify({ render3d: true, lang: 'zh' })); } catch (e) {} });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /model|nature|THREE|shader|WebGL/i.test(m.text()))) errs.push(m.type() + ': ' + m.text().slice(0, 400)); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('requestfailed', (rq) => errs.push('REQFAIL ' + rq.url().slice(-80)));
  await p.goto('file://' + path.resolve(__dirname, '../../../index.html') + '?debug&r3lite&map=' + map + extra);
  await p.waitForFunction(() => window.G && G.mapScene && G.mapScene.view3d, null, { timeout: 120000 }).catch(() => errs.push('no view3d'));
  if (grass) await p.evaluate(() => { G.Nature3D.forceGrass = true; const h = G.Nature3D.scatterGrass(G.mapScene.view3d); console.log('grass chunks', h && h.chunks.length); });
  await p.waitForTimeout(+wait);
  const st = await p.evaluate(() => {
    const v = G.mapScene && G.mapScene.view3d; if (!v) return null;
    const types = {}; let fb = 0;
    for (const [o, n] of v.nodes) { types[o.t] = (types[o.t] || 0) + 1; if (n.children[0] && n.children[0].userData.fallback) fb++; }
    const info = G.R3.renderer.info.render;
    return { types, fallbacks: fb, calls: info.calls, tris: info.triangles, lastError: G.lastError ? String(G.lastError) : null };
  }).catch((e) => 'eval failed ' + e.message);
  console.log(JSON.stringify(st));
  await p.screenshot({ path: out });
  if (errs.length) console.log(errs.slice(0, 20).join('\n'));
  await b.close();
})();
