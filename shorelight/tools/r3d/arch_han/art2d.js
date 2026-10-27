// Dump the 2D G.Objects art of the given ids into one PNG sheet (reference for the 3D models).
//   node tools/r3d/arch_han/art2d.js temple,teahouse out.png [v=0] [scale=1]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [ids = 'temple', out = 'art2d.png', v = '0', sc = '1'] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto('file://' + path.resolve(__dirname, '../viewer.html') + '?kind=models&ids=well', { waitUntil: 'commit' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 600000 });
  const info = await p.evaluate(({ ids, v, sc }) => {
    document.body.innerHTML = '';
    document.body.style.background = '#556';
    document.body.style.overflow = 'visible';
    const T = G.TILE, res = [];
    let html = '';
    const box = document.createElement('div');
    box.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:6px;font:12px sans-serif;color:#fff';
    document.body.appendChild(box);
    for (const id of ids.split(',')) {
      const d = G.Objects.get(id);
      if (!d) { res.push(id + ': MISSING'); continue; }
      const o = { t: id, x: 0, y: 0, v: +v, w: d.w, h: d.h };
      const padX = 120, padTop = 380, padBot = 30;
      const W = d.w * T + padX * 2, H = d.h * T + padTop + padBot;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      // footprint grid + solid cells
      for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) {
        const s = d.solidAt ? d.solidAt(o, dx, dy) : d.solid;
        g.fillStyle = s ? 'rgba(255,60,60,0.25)' : 'rgba(60,255,60,0.25)';
        g.fillRect(padX + dx * T, padTop + dy * T, T - 1, T - 1);
      }
      try { d.draw(g, padX, padTop, o, 0); } catch (e) { res.push(id + ' draw err ' + e.message); }
      g.strokeStyle = 'rgba(255,255,0,0.8)'; g.strokeRect(padX, padTop, d.w * T, d.h * T);
      const solid = [];
      for (let dy = 0; dy < d.h; dy++) { let r = ''; for (let dx = 0; dx < d.w; dx++) r += (d.solidAt ? d.solidAt(o, dx, dy) : d.solid) ? '#' : '.'; solid.push(r); }
      const lights = d.lights ? d.lights(o) : [];
      res.push(`${id} ${d.w}x${d.h} solid=[${solid.join('/')}] lights=${JSON.stringify(lights)}`);
      const wrap = document.createElement('div');
      wrap.innerHTML = '<div>' + id + '</div>';
      c.style.width = (W * sc) + 'px';
      wrap.appendChild(c); box.appendChild(wrap);
    }
    return res;
  }, { ids, v, sc: +sc });
  console.log(info.join('\n'));
  await p.setViewportSize({ width: 1600, height: 1000 });
  await p.screenshot({ path: out, fullPage: true });
  if (errs.length) console.log(errs.join('\n'));
  await b.close();
})();
