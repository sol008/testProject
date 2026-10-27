// Budget check for every nature model and variant: triangles + draw calls (meshes) + NaN bounds + console errors.
// node tools/r3d/nature/budget.js   → prints a table; exit code 1 if a budget is exceeded or a build fails.
const { chromium } = require('playwright');
const path = require('path');
const IDS = 'tree_camphor,tree_maple,tree_sakura,tree_pine,tree_dead,tree_cypress,tree_banyan,tree_cedar_snow,tree_betel,coconut_palm,tree_banana,tree_fern,pandanus,bamboo,bush,flowers,tallgrass,reeds,silvergrass,rice_stalks,millet,lily,lotus,seaweed,rock_small,rock_big,rock_marble,rock_basalt,basalt,stump,log,driftwood,mushroom_glow,mushroom_giant,crystal,geometry_pillar,jewel_flower,vine_curtain,cliff_waterfall,sea_of_clouds'.split(',');
// tri budgets (CONTRACTS_3D + brief): trees 12k (banyan/cypress 20k), small plants 1.5k, everything else 3k (big set pieces 20k)
const BIG = new Set(['tree_banyan', 'tree_cypress', 'cliff_waterfall', 'sea_of_clouds']);
const SMALL = new Set(['flowers', 'tallgrass', 'reeds', 'silvergrass', 'rice_stalks', 'millet', 'lily', 'seaweed', 'lotus']);
const budget = (id) => (BIG.has(id) ? 20000 : id.startsWith('tree_') || ['coconut_palm', 'pandanus', 'bamboo'].includes(id) ? 12000 : SMALL.has(id) ? 1500 : id === 'basalt' || id === 'rock_big' || id.startsWith('mushroom') || id === 'geometry_pillar' || id === 'vine_curtain' ? 8000 : 3000);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 200)); }); p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto('file://' + path.resolve(__dirname, '../viewer.html') + '?ids=none', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  const rows = await p.evaluate((ids) => ids.map((id) => {
    const out = { id, v: [] };
    if (!G.Models.has(id)) { out.err = 'no model'; return out; }
    for (let v = 0; v < 3; v++) {
      const d = G.Objects.get(id);
      const o = G.Models.create(id, { t: id, x: 0, y: 0, v, w: d.w, h: d.h });
      if (!o) { out.err = 'build failed v' + v; continue; }
      let tris = 0, calls = 0, nan = false;
      o.traverse((m) => { if (!(m.isMesh || m.isPoints)) return; calls++; const g = m.geometry; if (m.isMesh) tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * (m.isInstancedMesh ? m.count : 1); g.computeBoundingSphere(); if (!isFinite(g.boundingSphere.radius)) nan = true; });
      const box = new THREE.Box3().setFromObject(o);
      out.v.push({ tris: Math.round(tris), calls, nan, size: [box.max.x - box.min.x, box.max.y, box.max.z - box.min.z].map((x) => +x.toFixed(2)) });
    }
    return out;
  }), IDS);
  let bad = 0;
  for (const r of rows) {
    const B = budget(r.id), mx = Math.max(0, ...r.v.map((x) => x.tris)), mc = Math.max(0, ...r.v.map((x) => x.calls));
    const flag = r.err || mx > B || r.v.some((x) => x.nan) ? ' <-- ' + (r.err || (mx > B ? 'over budget' : 'NaN')) : '';
    if (flag) bad++;
    console.log(`${r.id.padEnd(16)} tris ${r.v.map((x) => String(x.tris).padStart(6)).join(' ')}  (≤${B})  draws ${r.v.map((x) => x.calls).join('/')}  size ${JSON.stringify(r.v[0] && r.v[0].size)}${flag}`);
  }
  if (errs.length) { console.log('console:\n' + [...new Set(errs)].slice(0, 20).join('\n')); }
  await b.close();
  process.exit(bad ? 1 : 0);
})();
