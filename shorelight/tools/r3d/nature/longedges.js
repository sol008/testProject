// Debug: report triangles with suspiciously long edges in a model (stray "lines" across the geometry).
// node tools/r3d/nature/longedges.js <model id> [maxEdge=1.2]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [id, mx = '1.2'] = process.argv.slice(2);
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + path.resolve(__dirname, '../viewer.html') + '?ids=none', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  console.log(await p.evaluate(([id, mx]) => {
    const o = G.Models.create(id, { t: id, x: 0, y: 0, v: 0 }); const out = [];
    o.traverse((m) => { if (!m.isMesh) return; const g = m.geometry, P = g.attributes.position, I = g.index ? g.index.array : null; const n = I ? I.length : P.count;
      let bad = 0; const ex = [];
      for (let i = 0; i < n; i += 3) { const v = [0, 1, 2].map((k) => { const j = I ? I[i + k] : i + k; return [P.getX(j), P.getY(j), P.getZ(j)]; });
        for (let k = 0; k < 3; k++) { const a = v[k], c = v[(k + 1) % 3]; const d = Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]); if (d > mx) { bad++; if (ex.length < 4) ex.push(JSON.stringify([a.map((x) => x.toFixed(2)), c.map((x) => x.toFixed(2))])); break; } } }
      out.push(`${m.material.type} tris=${n / 3} long=${bad} ${ex.join(' ')}`); });
    return out.join('\n'); }, [id, +mx]));
  await b.close();
})();
