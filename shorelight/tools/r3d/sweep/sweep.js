// 3D field-view sweep: load every map (or the ones given) with the 3D renderer on, record build time, draw calls,
// triangles, console errors/warnings, G.warnOnce keys, billboard fallbacks and placement outliers; save one JPEG of
// the 3D layer (the 2D UI canvas is hidden for the shot) per map.
//   node tools/r3d/sweep/sweep.js --out=DIR [--resume] [--frames=24] [--list] [map ...]
// One browser, one page, navigated map to map; viewport 960×540; ?r3lite. Results: DIR/<map>.json + DIR/<map>.jpg.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../../..');
const QS = 'debug&r3lite&party=xinghe,baizhi,hongying,yungui&lv=30&flags=mochi_joined,yuyuan_joined';

(async () => {
  const args = process.argv.slice(2);
  const opt = { out: path.resolve('sweep3d'), resume: false, frames: 24, list: false, quality: null };
  const want = [];
  for (const a of args) {
    if (a.startsWith('--out=')) opt.out = path.resolve(a.slice(6));
    else if (a === '--resume') opt.resume = true;
    else if (a === '--list') opt.list = true;
    else if (a.startsWith('--frames=')) opt.frames = +a.slice(9);
    else if (a.startsWith('--quality=')) opt.quality = a.slice(10);
    else want.push(a);
  }
  fs.mkdirSync(opt.out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  await ctx.addInitScript((quality) => {
    try { localStorage.setItem('shorelight_settings', JSON.stringify(Object.assign({ render3d: true }, quality ? { quality } : {}))); } catch (e) {}
    // wrap G.Map3D as soon as it exists: constructor time + per-frame wall time
    const iv = setInterval(() => {
      if (!window.G || !G.Map3D || G.Map3D.__wrapped) return;
      clearInterval(iv);
      const Orig = G.Map3D;
      class Timed extends Orig {
        constructor(ms) {
          const t0 = performance.now();
          super(ms);
          this.__buildMs = performance.now() - t0;
          this.__frames = 0; this.__frameMs = 0;
          window.__sweepView = this;
        }
        frame(c) {
          const t0 = performance.now();
          super.frame(c);
          const d = performance.now() - t0;
          if (this.__frames === 0) this.__firstFrameMs = d; else this.__frameMs += d;
          this.__frames++;
        }
      }
      Timed.__wrapped = true;
      G.Map3D = Timed;
    }, 1);
  }, opt.quality);
  const p = await ctx.newPage();
  let log = [];
  p.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') log.push(t + ': ' + m.text().slice(0, 600));
  });
  p.on('pageerror', (e) => log.push('pageerror: ' + (e.stack || e.message).slice(0, 800)));
  p.on('requestfailed', (r) => log.push('requestfailed: ' + r.url().replace(/^.*shorelight\//, '')));

  const base = 'file://' + path.join(ROOT, 'index.html');
  // enumerate maps
  await p.goto(base + '?debug&r3lite', { waitUntil: 'load' });
  await p.waitForFunction(() => window.G && G.Maps && Object.keys(G.Maps.defs).length > 0);
  const all = await p.evaluate(() => Object.keys(G.Maps.defs));
  if (opt.list) { console.log(all.join('\n')); await b.close(); return; }
  const maps = want.length ? want : all;
  console.log(`${maps.length} maps → ${opt.out}`);

  for (const id of maps) {
    const jf = path.join(opt.out, id + '.json');
    if (opt.resume && fs.existsSync(jf)) continue;
    log = [];
    const t0 = Date.now();
    let res = { id };
    try {
      await p.goto(base + '?' + QS + '&map=' + id, { waitUntil: 'load', timeout: 120000 });
      await p.waitForFunction(() => window.__sweepView || (window.G && G.lastError), null, { timeout: 180000, polling: 200 });
      // let it render a number of frames (Env3D lerps, lazy builds, etc.)
      await p.waitForFunction((n) => {
        const v = window.__sweepView;
        return !v || (v.__frames >= n) || (G.mapScene && G.mapScene.view3d !== v);
      }, opt.frames, { timeout: 240000, polling: 250 }).catch(() => log.push('sweep: timeout waiting for frames'));
      res = await p.evaluate(collect);
      res.id = id;
    } catch (e) {
      res.fatal = String(e.message || e).slice(0, 400);
    }
    // screenshot of the 3D layer only
    try {
      await p.evaluate(() => { if (window.G && G.canvas) G.canvas.style.visibility = 'hidden'; });
      await p.screenshot({ path: path.join(opt.out, id + '.jpg'), type: 'jpeg', quality: 72, timeout: 120000 });
      await p.evaluate(() => { if (window.G && G.canvas) G.canvas.style.visibility = ''; });
    } catch (e) { res.shotErr = String(e.message).slice(0, 200); }
    res.log = [...new Set(log)];
    res.wallS = +((Date.now() - t0) / 1000).toFixed(1);
    fs.writeFileSync(jf, JSON.stringify(res, null, 1));
    const fb = res.fallbacks ? res.fallbacks.length : '?';
    console.log(`${id.padEnd(28)} ${String(res.wallS).padStart(5)}s build ${res.buildMs}ms calls ${res.calls} tris ${res.tris} fb ${fb} log ${res.log.length} warn ${(res.warned || []).length}${res.fatal ? ' FATAL ' + res.fatal : ''}`);
  }
  await b.close();

  // runs in the page
  function collect() {
    const v = window.__sweepView;
    const out = { lastError: G.lastError ? String(G.lastError.stack || G.lastError).slice(0, 600) : null, warned: [...(G._warned || [])] };
    out.top = G.Scenes && G.Scenes.top() ? (G.Scenes.top().constructor.name + (G.Scenes.top() === G.mapScene ? '' : ' (not map)')) : null;
    out.scriptBusy = !!(G.Script && G.Script.busy && G.Script.busy());
    if (!v) { out.noView = true; return out; }
    const info = G.R3.renderer.info;
    Object.assign(out, {
      buildMs: Math.round(v.__buildMs), firstFrameMs: Math.round(v.__firstFrameMs || 0), frames: v.__frames,
      avgFrameMs: v.__frames > 1 ? Math.round(v.__frameMs / (v.__frames - 1)) : null,
      calls: info.render.calls, tris: info.render.triangles, programs: info.programs ? info.programs.length : 0,
      geos: info.memory.geometries, texs: info.memory.textures,
      w: v.ms.w, h: v.ms.h, dark: +v.dark.toFixed(2), outdoor: v.outdoor, interior: v.interior, cave: v.cave,
      cam: v.camCfg, sky3d: v.def.sky3d || null, nObjects: v.nodes.size, nActors: v.actors.size,
    });
    // fallbacks: objects drawn as 2D billboards, actors as sprite / monster billboards
    const fb = [];
    const typeCount = {};
    const T = THREE;
    const box = new T.Box3(), sz = new T.Vector3();
    const odd = [];
    for (const [o, node] of v.nodes) {
      typeCount[o.t] = (typeCount[o.t] || 0) + 1;
      const k = node.children[0];
      if (k && k.userData.fallback) fb.push({ kind: 'object', id: o.t, hasModel: G.Models.has(o.t), at: [o.x, o.y] });
      else if (!k || !k.children.length && !k.isMesh) fb.push({ kind: 'object-empty', id: o.t, at: [o.x, o.y] });
      // placement outliers (skip invisible / flat)
      if (!node.visible) continue;
      try {
        box.setFromObject(node, false);
        if (box.isEmpty()) continue;
        box.getSize(sz);
        const d = G.Objects.get(o.t) || {};
        const fw = o.w || d.w || 1, fh = o.h || d.h || 1;
        const r = [];
        if (box.min.y > 0.35 && !/lantern|sky_|bird|cloud|hanging|banner|sign|kite|vine|moon|star|spirit|orb|ghost|fly|float/.test(o.t)) r.push('floating min.y=' + box.min.y.toFixed(2));
        if (box.max.y < 0.02 && !G.Models.isFlat(o.t)) r.push('sunk max.y=' + box.max.y.toFixed(2));
        if (Math.max(sz.x, sz.z) > Math.max(fw, fh) * 3 + 3) r.push('wide ' + sz.x.toFixed(1) + 'x' + sz.z.toFixed(1) + ' fp ' + fw + 'x' + fh);
        if (sz.y > 14) r.push('tall ' + sz.y.toFixed(1));
        if (Math.max(sz.x, sz.y, sz.z) < 0.12) r.push('tiny ' + Math.max(sz.x, sz.y, sz.z).toFixed(2));
        if (!isFinite(sz.x + sz.y + sz.z)) r.push('NaN bounds');
        if (r.length) odd.push(o.t + '@' + o.x + ',' + o.y + ': ' + r.join(', '));
      } catch (e) { odd.push(o.t + ' bbox error ' + e.message); }
    }
    for (const [a, rec] of v.actors) {
      if (rec.ch.isFallback) {
        const id = rec.id;
        fb.push({ kind: rec.enemy ? 'monster' : 'char', id, char3d: !!(G.Char3D && G.Char3D.has && G.Char3D.has(id)), mon3d: !!(G.Mon3D && G.Mon3D.has && G.Mon3D.has(id)) });
      }
    }
    // NaN bounding spheres anywhere in the scene
    let nan = 0, black = [];
    v.scene.traverse((n) => {
      if (n.geometry && n.geometry.boundingSphere && !isFinite(n.geometry.boundingSphere.radius)) nan++;
      if (n.isMesh && n.visible && n.material && !Array.isArray(n.material)) {
        const m = n.material;
        // suspicious: lit material, black colour, no map, no emissive
        if (m.color && m.color.getHex() === 0 && !m.map && !(m.emissive && m.emissive.getHex()) && !m.isShaderMaterial && m.type !== 'MeshBasicMaterial') black.push(m.type + ':' + (n.name || n.parent && n.parent.userData.modelId || '?'));
      }
    });
    out.nanBounds = nan;
    out.blackMats = [...new Set(black)].slice(0, 12);
    out.fallbacks = fb;
    out.types = typeCount;
    out.odd = odd.slice(0, 40);
    out.nOdd = odd.length;
    const P = v.ms.player;
    out.player = [Math.round(P.px / G.TILE), Math.round(P.py / G.TILE)];
    return out;
  }
})();
