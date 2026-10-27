// A/B check for G.Batch3D (js/r3d/batch.js): build each map's 3D view with object batching off and on, in the same
// page, under a frozen clock and a seeded Math.random, and compare draw calls, triangles, build time and pixels.
//   node tools/r3d/sweep/batch_ab.js --out=DIR [--full] [--frames=8] map[:x,y] ...
// --full drops ?r3lite (shadows + post-processing on; slower). Per map: DIR/<map>_off.png, _on.png, _diff.png
// (differences ×8 on black) and a JSON line in DIR/ab.jsonl. The main loop is stopped after the first load; frames
// are then driven by hand with a fixed dt, so two builds of the same mode render identically ("off2" checks that).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const opt = { out: path.resolve('batch_ab'), full: false, frames: 8 };
  const maps = [];
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--out=')) opt.out = path.resolve(a.slice(6));
    else if (a === '--full') opt.full = true;
    else if (a.startsWith('--frames=')) opt.frames = +a.slice(9);
    else maps.push(a);
  }
  fs.mkdirSync(opt.out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const spec of maps) {
    const [id, xy] = spec.split(':');
    const tag = xy ? id + '_' + xy.replace(',', '_') : id;
    const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('shorelight_settings', JSON.stringify({ render3d: true })); } catch (e) {} });
    const p = await ctx.newPage();
    const log = [];
    p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(m.type() + ': ' + m.text().slice(0, 300)); });
    p.on('pageerror', (e) => log.push('pageerror: ' + e.message));
    const qs = (opt.full ? '' : 'r3lite&') + 'debug&party=xinghe,baizhi,hongying,yungui&lv=30&flags=mochi_joined,yuyuan_joined&map=' + id +
      (xy ? '&x=' + xy.split(',')[0] + '&y=' + xy.split(',')[1] : '');
    let res = { id: tag, full: opt.full };
    try {
      await p.goto('file://' + path.resolve(__dirname, '../../../index.html') + '?' + qs, { waitUntil: 'load' });
      await p.waitForFunction(() => window.G && G.mapScene && G.mapScene.view3d && G.mapScene.view3d.t > 0.3, null, { timeout: 300000, polling: 250 });
      // stop the main loop (the frame already queued runs once more)
      await p.evaluate(async () => { window.requestAnimationFrame = () => 0; await new Promise((r) => setTimeout(r, 300)); });
      const run = async (mode) => p.evaluate(async ({ mode, frames }) => {
        let s = 12345; // mulberry32
        const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const orig = Math.random;
        Math.random = rnd;
        try {
          const ms = G.mapScene;
          G.Batch3D.enabled = mode !== 'off' && mode !== 'off2';
          if (ms.view3d) ms.view3d.dispose();
          G.time = 100;
          if (G.Wind3D) { G.Wind3D.time = 0; G.Wind3D.driven = -1e9; G.Wind3D.advance(0); }
          const t0 = performance.now();
          const v = ms.view3d = new G.Map3D(ms);
          const buildMs = performance.now() - t0;
          ms.cam.tx = null; ms.cam.ty = null; ms.cam.follow = 'player';
          v.snapCamera();
          G.canvas.style.visibility = 'hidden';
          let url = null, info = null;
          for (let i = 0; i < frames; i++) {
            G.time += 1 / 60;
            v.frame(G.ctx);
            if (i === frames - 1) {
              const ri = G.R3.renderer.info.render;
              info = { calls: ri.calls, tris: ri.triangles };
              url = G.R3.canvas.toDataURL('image/png');
            }
          }
          const bt = v.batch ? Object.assign({}, v.batch.stats) : null;
          let nodes = 0, proxies = 0;
          for (const [, n] of v.nodes) { nodes++; if (n.userData.batched) proxies++; }
          return Object.assign({ mode, buildMs: Math.round(buildMs), url, nodes, proxies, batch: bt }, info);
        } finally { Math.random = orig; }
      }, { mode, frames: opt.frames });
      const off = await run('off');
      const off2 = await run('off2');
      const on = await run('on');
      const cmp = async (a, c) => p.evaluate(async ({ a, c }) => {
        const load = (u) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = u; });
        const [A, C] = await Promise.all([load(a), load(c)]);
        const W = A.width, H = A.height;
        const px = (im) => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, W, H); };
        const da = px(A).data, dc = px(C).data;
        const out = document.createElement('canvas'); out.width = W; out.height = H;
        const og = out.getContext('2d'), od = og.createImageData(W, H);
        let n2 = 0, n8 = 0, n24 = 0, sum = 0, max = 0;
        for (let i = 0; i < da.length; i += 4) {
          const d = Math.max(Math.abs(da[i] - dc[i]), Math.abs(da[i + 1] - dc[i + 1]), Math.abs(da[i + 2] - dc[i + 2]));
          sum += d; if (d > max) max = d; if (d > 2) n2++; if (d > 8) n8++; if (d > 24) n24++;
          for (let k = 0; k < 3; k++) od.data[i + k] = Math.min(255, Math.abs(da[i + k] - dc[i + k]) * 8);
          od.data[i + 3] = 255;
        }
        og.putImageData(od, 0, 0);
        const N = W * H;
        return { px: N, gt2: +(n2 / N * 100).toFixed(3), gt8: +(n8 / N * 100).toFixed(3), gt24: +(n24 / N * 100).toFixed(3), mean: +(sum / N).toFixed(3), max, diff: out.toDataURL('image/png') };
      }, { a, c });
      const det = await cmp(off.url, off2.url);
      const ab = await cmp(off.url, on.url);
      const save = (name, url) => fs.writeFileSync(path.join(opt.out, tag + name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
      save('_off', off.url); save('_on', on.url); save('_diff', ab.diff);
      for (const r of [off, off2, on]) delete r.url;
      delete det.diff; delete ab.diff;
      res = Object.assign(res, { off, off2, on, determinism: det, diff: ab });
    } catch (e) { res.fatal = String(e.message || e).slice(0, 400); }
    res.log = [...new Set(log)];
    fs.appendFileSync(path.join(opt.out, 'ab.jsonl'), JSON.stringify(res) + '\n');
    const f = (r) => (r ? `${r.calls} calls ${r.tris} tris ${r.buildMs}ms` : '?');
    console.log(`${tag.padEnd(22)} off: ${f(res.off)} | on: ${f(res.on)} | batched ${res.on && res.on.batch ? res.on.batch.objects : 0} objs` +
      ` | diff>8: ${res.diff ? res.diff.gt8 + '%' : '?'} max ${res.diff ? res.diff.max : '?'} (off/off2 ${res.determinism ? res.determinism.gt8 + '%' : '?'})` +
      `${res.fatal ? ' FATAL ' + res.fatal : ''}${res.log.length ? ' log ' + res.log.length : ''}`);
    await ctx.close();
  }
  await b.close();
})();
