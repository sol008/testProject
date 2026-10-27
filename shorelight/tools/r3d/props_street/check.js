// Budget / sanity check for every street prop (and its variants / states).
// node tools/r3d/props_street/check.js  → table of draw calls, tris, bbox vs footprint, NaN, console errors
const { chromium } = require('playwright');
const path = require('path');
const IDS = ['lantern_string', 'lamp_post', 'stone_lantern', 'red_lantern', 'sky_lantern', 'water_lantern', 'cart', 'barrel', 'crate', 'jar', 'basket', 'stall', 'signboard', 'fence_wood', 'fence_bamboo', 'bench', 'laundry', 'statue_lion', 'wind_lion', 'banner', 'grave', 'coffin', 'bones', 'firepit', 'drum_rack', 'pilgrim_flag', 'chest', 'switch', 'brazier', 'pillar', 'eternal_lamp', 'soul_jar'];
const EXTRA = [{ t: 'red_lantern', hang: true }, { t: 'chest', open: true }, { t: 'switch', on: true }, { t: 'bench', v: 1 }, { t: 'signboard', v: 1, text: '代天巡狩' }, { t: 'fence_wood', w: 1, h: 4 }, { t: 'fence_bamboo', w: 6 }, { t: 'lantern_string', w: 8, v: 1 }, { t: 'laundry', w: 4 }, { t: 'statue_lion', flip: true, v: 1 }];
for (const t of ['barrel', 'crate', 'jar', 'grave', 'bones', 'lantern_string', 'stall', 'sky_lantern']) for (const v of [1, 2, 3]) EXTRA.push({ t, v });
for (const v of [1, 2, 3]) EXTRA.push({ t: 'basket', v });
(async () => {
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  const items = IDS.map((t) => ({ t })).concat(EXTRA).filter((s) => !only || only.includes(s.t));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto('file://' + path.resolve(__dirname, 'view.html') + '?w=640&h=360&labels=0&items=' + encodeURIComponent(JSON.stringify(items)), { waitUntil: 'commit', timeout: 120000 });
  await p.waitForFunction(() => window.__ready, null, { timeout: 300000 });
  const st = await p.evaluate(() => window.__stats);
  const defs = await p.evaluate(() => Object.fromEntries(Object.keys(G.Objects.defs).map((k) => [k, { w: G.Objects.defs[k].w, h: G.Objects.defs[k].h }])));
  let bad = 0;
  st.per.forEach((r, i) => {
    const s = items[i], d = defs[s.t] || { w: 1, h: 1 }, w = s.w || d.w, h = s.h || d.h;
    const flags = [];
    const fall = !r.box || r.meshes === 0;
    if (r.meshes > 6) flags.push('CALLS>6');
    const small = w * h <= 2 && !['lantern_string', 'stall', 'fence_bamboo', 'fence_wood', 'laundry'].includes(s.t);
    if (small && r.tris > 3000) flags.push('TRIS>3k');
    if (r.nan) flags.push('NaN');
    if (fall) flags.push('EMPTY');
    const [x0, , z0, x1, y1, z1] = r.box;
    if (x0 < -w / 2 - 0.6 || x1 > w / 2 + 0.6 || z0 < -h / 2 - 0.6 || z1 > h / 2 + 0.6) flags.push('OVERHANG');
    if (flags.length) bad++;
    console.log(JSON.stringify(s).padEnd(46), String(r.meshes).padStart(2), 'calls', String(r.tris).padStart(6), 'tris  box', JSON.stringify(r.box), flags.join(' '));
  });
  if (errs.length) { console.log('CONSOLE ERRORS:\n' + errs.join('\n')); bad++; }
  console.log(bad ? `\n${bad} issue(s)` : '\nall ok');
  await b.close();
})();
