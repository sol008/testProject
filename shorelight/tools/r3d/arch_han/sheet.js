// Render each model on its own (auto-framed) and tile the shots into one image.
//   node tools/r3d/arch_han/sheet.js "temple,teahouse" out.png ["yaw=25&pitch=30"] [cols=2]
// Each id may carry its own params after a colon: "house_minnan:v=1&door=2". Console errors are reported.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [ids = '', out = 'sheet.png', qs = 'yaw=25&pitch=30', cols = '2'] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  // per-shot instance params (w, h, door, text, lit, still, blue …): "id:o.w=6&o.door=-1"
  await p.addInitScript(() => {
    let g;
    Object.defineProperty(window, 'G', { configurable: true, get: () => g, set(v) {
      g = v; let M;
      Object.defineProperty(v, 'Models', { configurable: true, get: () => M, set(m) {
        M = m; const create = m.create;
        m.create = function (id, o) {
          const q = new URLSearchParams(location.search), extra = {};
          for (const [k, val] of q) if (k.startsWith('o.')) extra[k.slice(2)] = val === 'false' ? false : val === 'true' ? true : isNaN(+val) ? val : +val;
          return create.call(this, id, Object.assign({}, o, extra));
        };
      } });
    } });
  });
  const shots = [];
  for (const spec of ids.split(',')) {
    const [id, extra = ''] = spec.split(':');
    await p.goto('file://' + path.resolve(__dirname, '../viewer.html') + `?${extra}&kind=models&ids=${id}&w=960&h=600&${qs}`, { waitUntil: 'commit' });
    await p.waitForFunction(() => window.__ready, null, { timeout: 600000 });
    const st = await p.evaluate(() => window.__stats);
    shots.push({ id: spec, img: (await p.screenshot()).toString('base64'), st });
  }
  const n = +cols;
  await p.setViewportSize({ width: 960 * n, height: 600 * Math.ceil(shots.length / n) });
  await p.setContent(`<body style="margin:0;display:grid;grid-template-columns:repeat(${n},960px);background:#222">${shots.map((s) => `<div style="position:relative"><img src="data:image/png;base64,${s.img}" style="display:block"><div style="position:absolute;right:6px;top:4px;color:#fff;font:14px sans-serif;background:#0008;padding:2px 6px">${s.id} · ${s.st.calls} calls · ${s.st.tris} tris</div></div>`).join('')}</body>`);
  await p.screenshot({ path: out });
  if (errs.length) console.log(errs.slice(0, 20).join('\n'));
  await b.close();
})();
