// Capture field-map renders for the environment team (G.Env3D).
//   node tools/r3d/env/capture.js [--full] [--quality=high] [--out=dir] [--wait=6] map[:x,y][@flag1+flag2][#vars] ...
// Default: ?r3lite (half-res, no post). --full renders the whole post chain (slow under SwiftShader).
// Prints per-map frame stats (draw calls, triangles, avg frame ms) and every console error.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const args = process.argv.slice(2);
  const opt = { full: false, quality: 'high', out: path.resolve(__dirname, 'out'), wait: 6, fx: null, hour: null };
  const maps = [];
  for (const a of args) {
    if (a === '--full') opt.full = true;
    else if (a.startsWith('--quality=')) opt.quality = a.slice(10);
    else if (a.startsWith('--out=')) opt.out = path.resolve(a.slice(6));
    else if (a.startsWith('--wait=')) opt.wait = +a.slice(7);
    else if (a.startsWith('--fx=')) opt.fx = +a.slice(5);
    else maps.push(a);
  }
  if (!maps.length) maps.push('jiufen');
  fs.mkdirSync(opt.out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let bad = 0;
  for (const spec of maps) {
    const m = /^([^:@#]+)(?::(\d+),(\d+))?(?:@([^#]+))?(?:#(.+))?$/.exec(spec);
    const [, id, x, y, flags, vars] = m;
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    p.on('console', (msg) => { if (msg.type() === 'error' || /warn/i.test(msg.type()) && /env3d|Env3D/.test(msg.text())) errs.push(msg.type() + ': ' + msg.text().slice(0, 400)); });
    p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
    let qs = 'debug&map=' + id + (opt.full ? '' : '&r3lite');
    if (x != null) qs += '&x=' + x + '&y=' + y;
    if (flags) qs += '&flags=' + flags.split('+').join(',');
    await p.addInitScript(([q, fx, vars]) => {
      try {
        const s = JSON.parse(localStorage.getItem('shorelight_settings') || '{}');
        localStorage.setItem('shorelight_settings', JSON.stringify(Object.assign(s, { quality: q })));
      } catch (e) {}
      window.__envOpts = { quality: q, fx, vars };
    }, [opt.quality, opt.fx, vars || null]);
    const t0 = Date.now();
    await p.goto('file://' + path.resolve(__dirname, '../../../index.html') + '?' + qs, { waitUntil: 'load', timeout: 180000 });
    try {
      await p.waitForFunction(() => {
        const o = window.__envOpts;
        if (window.G && G.settings && o) { G.settings.quality = o.quality; if (o.fx != null) G.settings.visualFx = o.fx; }
        if (window.G && G.state && o && o.vars && !o._v) { o._v = 1; for (const kv of o.vars.split('+')) { const [k, v] = kv.split('='); G.state.vars[k] = isNaN(+v) ? v : +v; } }
        const s = G.Scenes && G.Scenes.stack ? G.Scenes.stack.find((s) => s.view3d) : null;
        return !!(s && s.view3d && s.view3d.t > 0.2);
      }, null, { timeout: 300000, polling: 500 });
    } catch (e) { errs.push('TIMEOUT waiting for view3d'); }
    // let effects settle, sample frame time
    const stats = await p.evaluate(async (wait) => {
      const s = G.Scenes.stack.find((s) => s.view3d);
      if (!s) return null;
      const v = s.view3d;
      const tv0 = v.t, w0 = performance.now();
      await new Promise((r) => setTimeout(r, wait * 1000));
      const frames = Math.max(1, Math.round((v.t - tv0) * 60));
      const info = G.R3.renderer.info;
      return { dark: v.dark, outdoor: v.outdoor, interior: v.interior, cave: v.cave, calls: info.render.calls, tris: info.render.triangles,
        progs: info.programs ? info.programs.length : 0, simT: +(v.t - tv0).toFixed(2), wallMs: Math.round(performance.now() - w0),
        env: v.env ? Object.keys(v.env.parts || {}).join(',') : '-' };
    }, opt.wait).catch((e) => ({ err: e.message }));
    const file = path.join(opt.out, spec.replace(/[^a-z0-9_]+/gi, '_') + (opt.full ? '_full' : '') + '.png');
    await p.screenshot({ path: file });
    console.log(`${spec}  ${((Date.now() - t0) / 1000).toFixed(0)}s  ${JSON.stringify(stats)}  -> ${path.relative(process.cwd(), file)}`);
    if (errs.length) { bad++; console.log('  ERRORS:\n  ' + [...new Set(errs)].slice(0, 15).join('\n  ')); }
    await p.close();
  }
  await b.close();
  process.exit(bad ? 1 : 0);
})();
