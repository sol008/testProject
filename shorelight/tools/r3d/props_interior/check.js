// Interior props sanity check: builds every props_interior model (all variants given below) in the asset viewer
// page and reports triangles, draw calls (meshes), materials, NaN bounds and console errors; dumps the atlas.
//   node tools/r3d/props_interior/check.js [atlas.png]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto('file://' + path.resolve(__dirname, '../viewer.html') + '?kind=models&ids=table&w=640&h=360', { waitUntil: 'commit' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 600000 });
  const res = await p.evaluate(() => {
    const defs = G.Objects.defs;
    const ids = Object.keys(G.Models.defs).filter((id) => G.Models.defs[id] && defs[id]);
    const rows = [];
    for (const id of ids) {
      const d = G.Objects.get(id);
      const vs = { chair: [0, 1, 2, 3, 4, 8], mural: [0, 1, 2, 3, 4], plant_pot: [0, 1, 2], bookshelf: [0, 1], jar_row: [0, 1], shelf_lanterns: [0, 1], mill_stone: [0, 1] }[id] || [0];
      for (const v of vs) {
        const o = { t: id, x: 3, y: 4, v, w: d.w, h: d.h };
        const m = G.Models.create(id, o);
        if (!m) { rows.push({ id, v, err: 'null' }); continue; }
        let tris = 0, meshes = 0, fx = 0, nan = false; const mats = new Set();
        m.updateMatrixWorld(true);
        m.traverse((n) => {
          if (!n.isMesh) return;
          const g = n.geometry; const c = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
          if (n.material.isShaderMaterial) { fx++; return; }
          tris += c; meshes++; mats.add(n.material.uuid);
          g.computeBoundingSphere(); if (!g.boundingSphere || isNaN(g.boundingSphere.radius)) nan = true;
        });
        const bb = new THREE.Box3().setFromObject(m);
        rows.push({ id, v, tris: Math.round(tris), calls: meshes, fx, mats: mats.size, nan, size: [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].map((x) => +x.toFixed(2)), fp: [d.w, d.h], solid: d.solid });
      }
    }
    const A = G.PropsInterior.getAtlas();
    return { rows, used: A.used, atlas: A.canvas.toDataURL('image/png') };
  });
  for (const r of res.rows) console.log(JSON.stringify(Object.assign({}, r)));
  console.log('atlas rows used', res.used, '/ 2048');
  if (out) fs.writeFileSync(out, Buffer.from(res.atlas.split(',')[1], 'base64'));
  if (errs.length) console.log(errs.slice(0, 30).join('\n'));
  await b.close();
})();
