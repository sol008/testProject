// Print per-mesh stats for Han architecture models: draw calls, triangles, bounds, NaNs, lights, footprint coverage.
//   node tools/r3d/arch_han/inspect.js house_jiufen,temple ["v=1&door=2"]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [ids = '', extra = ''] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto('file://' + path.resolve(__dirname, '../viewer.html') + '?kind=models&ids=well', { waitUntil: 'commit' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 600000 });
  const out = await p.evaluate(({ ids, extra }) => {
    const q = new URLSearchParams(extra), res = [];
    const list = ids ? ids.split(',') : Object.keys(G.Models.defs);
    for (const id of list) {
      const d = G.Objects.get(id) || { w: 1, h: 1 };
      const o = { t: id, x: 3, y: 4, w: d.w, h: d.h };
      for (const [k, v] of q) o[k] = isNaN(+v) ? (v === 'false' ? false : v) : +v;
      const t0 = performance.now();
      const node = G.Models.create(id, o);
      const ms = performance.now() - t0;
      if (!node) { res.push(id + ': NO MODEL'); continue; }
      let tris = 0, calls = 0, nan = false;
      const lines = [];
      node.traverse((n) => {
        if (!n.isMesh) return;
        calls++;
        const g = n.geometry, c = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
        tris += c;
        g.computeBoundingBox();
        const bb = g.boundingBox;
        const arr = g.attributes.position.array; for (let i = 0; i < arr.length; i++) if (!isFinite(arr[i])) { nan = true; break; }
        lines.push(`   ${n.name.padEnd(6)} ${String(c).padStart(6)} tris  x[${bb.min.x.toFixed(2)},${bb.max.x.toFixed(2)}] y[${bb.min.y.toFixed(2)},${bb.max.y.toFixed(2)}] z[${bb.min.z.toFixed(2)},${bb.max.z.toFixed(2)}]`);
      });
      const L = G.Models.defs[id].lights ? G.Models.defs[id].lights(o) : [];
      res.push(`${id} ${o.w}x${o.h}: ${calls} calls, ${tris} tris, build ${ms.toFixed(0)}ms${nan ? ' NaN!' : ''}, lights ${L.length}`);
      res.push(...lines);
    }
    return res;
  }, { ids, extra });
  console.log(out.join('\n'));
  if (errs.length) console.log(errs.slice(0, 20).join('\n'));
  await b.close();
})();
