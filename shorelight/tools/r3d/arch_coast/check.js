// Architecture team B model check: builds every arch_coast model (with the instance states the maps use),
// runs update() for a few seconds, and checks errors, NaN bounds, triangle budgets and draw calls.
//   node tools/r3d/arch_coast/check.js            → table + exit code 1 on any failure
const { chromium } = require('playwright');
const path = require('path');

// [id, instance fields, budget class]
const CASES = [
  ['lighthouse', {}, 'house'], ['lighthouse', { beam: false }, 'house'], ['lighthouse', { lit: false }, 'house'],
  ['lighthouse_lamp', {}, 'prop+'],
  ['kuba', {}, 'house'], ['kuba', { door: false }, 'house'],
  ['bunun_house', {}, 'house'], ['bunun_house', { door: 2 }, 'house'],
  ['tao_house', { pavilion: false }, 'house'], ['tao_house', { pavilion: true }, 'house'],
  ['tatala', {}, 'boat'], ['tatala', { water: true }, 'boat'],
  ['c10_amis_house', { door: 2 }, 'house'], ['c10_amis_house', { w: 6, door: 3, big: true }, 'house'],
  ['c10_fish_rack', {}, 'prop'], ['c10_denggao', {}, 'prop'], ['c10_denggao', { blue: true, name: '阿義' }, 'prop'],
  ['c10_monster_show', { art: 'water_ghost' }, 'prop'],
  ['totem', {}, 'prop'], ['millet_rack', {}, 'prop'], ['drying_rack', { v: 0 }, 'prop'], ['drying_rack', { v: 1 }, 'prop'],
  ['fishing_net', {}, 'prop'], ['loom', {}, 'prop'],
  ['wang_boat', {}, 'house'], ['wang_boat', { water: true }, 'house'],
  ['guzhao', {}, 'house'], ['stone_weir', { w: 6, h: 4 }, 'house'], ['stone_weir', { w: 6, h: 4, v: 1 }, 'house'], ['stone_weir', { w: 8, h: 5 }, 'house'],
  ['boat_small', {}, 'boat'], ['boat_ferry', {}, 'boat'], ['boat_ferry', { color: '#5a9aff' }, 'boat'],
  ['dock_post', { v: 0 }, 'prop'], ['dock_post', { v: 1 }, 'prop'],
  ['rainbow_arch', { w: 6, h: 2 }, 'prop+'], ['rainbow_arch', { w: 8, h: 3 }, 'prop+'],
];
const BUDGET = { prop: 3000, 'prop+': 6000, boat: 8000, house: 40000 };
const STATIC_DRAWS = 6;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto('file://' + path.resolve(__dirname, 'view.html') + '?ids=&w=640&h=360', { waitUntil: 'commit', timeout: 120000 });
  await p.waitForFunction(() => window.__ready, null, { timeout: 600000 });
  const res = await p.evaluate((cases) => cases.map(([id, extra]) => {
    const out = { id, extra: JSON.stringify(extra) };
    try {
      if (!G.Models.has(id)) { out.err = 'no model'; return out; }
      const d = G.Objects.get(id) || { w: 1, h: 1 };
      const o = Object.assign({ t: id, x: 5, y: 9, w: d.w, h: d.h }, extra);
      const node = G.Models.create(id, o);
      if (!node) { out.err = 'build returned null'; return out; }
      for (let i = 1; i <= 90; i++) G.Models.defs[id].update && G.Models.defs[id].update(node, o, i / 30, 1 / 30);
      let tris = 0, stat = 0, anim = 0, nan = false; const names = [];
      node.updateMatrixWorld(true);
      node.traverse((n) => {
        if (!(n.isMesh || n.isPoints || n.isSprite)) return;
        let named = false; for (let q = n; q && q !== node; q = q.parent) if (q.name && q.name !== 'bob') named = true; // 'bob' moves the whole model: its merged children are static draws
        if (named) anim++; else stat++;
        if (n.name) names.push(n.name);
        if (n.geometry && n.geometry.attributes.position) {
          const g = n.geometry; tris += n.isMesh ? (g.index ? g.index.count : g.attributes.position.count) / 3 : 0;
          g.computeBoundingSphere(); if (!g.boundingSphere || !isFinite(g.boundingSphere.radius)) nan = true;
          const a = g.attributes.position.array; for (let i = 0; i < a.length; i += 97) if (!isFinite(a[i])) nan = true;
        }
      });
      const lights = G.Models.defs[id].lights ? G.Models.defs[id].lights(o) : [];
      Object.assign(out, { tris: Math.round(tris), stat, anim, nan, lights: lights.length, names: [...new Set(names)].join(',') });
      // footprint coverage: every solid cell should have geometry above it (sample the merged bbox per cell)
      const box = new THREE.Box3().setFromObject(node);
      out.bbox = [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].map((v) => +v.toFixed(2));
      const w = o.w || d.w, h = o.h || d.h; let miss = 0;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const solid = d.solidAt ? d.solidAt(o, dx, dy) : d.solid !== false;
        if (!solid) continue;
        const cx = -w / 2 + dx + 0.5, cz = -h / 2 + dy + 0.5;
        if (cx < box.min.x || cx > box.max.x || cz < box.min.z || cz > box.max.z) miss++;
      }
      out.miss = miss;
    } catch (e) { out.err = e.stack.split('\n').slice(0, 3).join(' | '); }
    return out;
  }), CASES);
  let fail = 0;
  for (let i = 0; i < res.length; i++) {
    const r = res[i], cls = CASES[i][2];
    const probs = [];
    if (r.err) probs.push('ERR ' + r.err);
    if (r.nan) probs.push('NaN');
    if (r.tris > BUDGET[cls]) probs.push(`tris>${BUDGET[cls]}`);
    if (r.stat > STATIC_DRAWS) probs.push(`static draws ${r.stat}>${STATIC_DRAWS}`);
    if (r.miss) probs.push(`${r.miss} solid cells outside bounds`);
    if (probs.length) fail++;
    console.log(`${probs.length ? 'FAIL' : 'ok  '} ${r.id.padEnd(17)} ${r.extra.padEnd(32)} tris ${String(r.tris).padStart(6)}  static ${r.stat} anim ${r.anim}  lights ${r.lights}  ${probs.join('; ')}`);
  }
  if (errs.length) { fail++; console.log('console errors:\n' + errs.join('\n')); }
  await b.close();
  console.log(fail ? `${fail} problem(s)` : 'all models pass');
  process.exit(fail ? 1 : 0);
})();
