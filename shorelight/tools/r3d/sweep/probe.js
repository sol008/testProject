// Probe one map in 3D: load it, run snippets in the page, screenshot after each.
//   node tools/r3d/sweep/probe.js <map[:x,y]> <out-prefix> [snippet.js ...]
// Each snippet file is the body of an async function(view, THREE) evaluated in the page; its return value is printed.
// Uses the same URL/settings as sweep.js (r3lite, 960×540, 3D on). One browser, sequential.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const [spec, prefix, ...snips] = process.argv.slice(2);
  const [id, xy] = spec.split(':');
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('shorelight_settings', JSON.stringify({ render3d: true })); } catch (e) {} });
  const p = await ctx.newPage();
  const log = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(m.type() + ': ' + m.text().slice(0, 300)); });
  p.on('pageerror', (e) => log.push('pageerror: ' + e.message));
  const qs = 'debug&r3lite&party=xinghe,baizhi,hongying,yungui&lv=30&flags=mochi_joined,yuyuan_joined&map=' + id + (xy ? '&x=' + xy.split(',')[0] + '&y=' + xy.split(',')[1] : '');
  await p.goto('file://' + path.resolve(__dirname, '../../../index.html') + '?' + qs, { waitUntil: 'load' });
  await p.waitForFunction(() => window.G && G.mapScene && G.mapScene.view3d && G.mapScene.view3d.t > 0.5, null, { timeout: 240000, polling: 250 });
  const shot = async (name) => {
    await p.evaluate(async () => {
      G.canvas.style.visibility = 'hidden';
      const v = G.mapScene.view3d, t0 = v.t;
      const w0 = performance.now();
      while (v.t < t0 + 0.12 && performance.now() - w0 < 20000) await new Promise((r) => setTimeout(r, 50));
    });
    await p.screenshot({ path: prefix + name + '.jpg', type: 'jpeg', quality: 75 });
  };
  await p.evaluate(() => { const ms = G.mapScene; ms.cam.tx = null; ms.cam.ty = null; ms.cam.follow = 'player'; ms.view3d.snapCamera(); });
  await shot('_0');
  let i = 1;
  for (const f of snips) {
    const body = fs.readFileSync(f, 'utf8');
    const r = await p.evaluate(async (src) => { const fn = new Function('view', 'THREE', 'return (async () => {' + src + '\n})()'); try { return await fn(G.mapScene.view3d, THREE); } catch (e) { return 'ERR ' + e.message; } }, body);
    console.log(path.basename(f), '→', typeof r === 'string' ? r : JSON.stringify(r));
    await shot('_' + i++);
  }
  if (log.length) console.log([...new Set(log)].join('\n'));
  await b.close();
})();
