#!/usr/bin/env node
// Map images for the strategy guide: renders WHOLE maps (not just the camera view) in the 2D renderer, numbers the
// chests like the guide's chest tables, and saves small JPGs to docs/guide/img/map_<id>.jpg (≤ 120 KB each).
//
//   bash <withbrowser.sh> node tools/guide/shoot_maps.js            # every img/map_<id>.jpg referenced by the guide
//   bash <withbrowser.sh> node tools/guide/shoot_maps.js jiufen mine_1 --force
//
// Which maps: the ids passed on the command line, else every `img/map_<id>.jpg` referenced in docs/guide/**/*.md,
// plus the lines of tools/guide/maps.txt. Existing images are kept unless --force.
// Per-map options (maps.txt line or command line `id:opt,opt`):
//   flags=a+b   set these story flags before the map loads (e.g. to show a later time of day)
//   vision      turn on 靈視 so spirit-only paths / chests / NPCs are drawn
//   light       keep the map's own lighting (default: lighting off so night maps stay readable)
//   x=N y=N     where the (hidden) player stands — some maps place NPCs relative to the start
// One headless Chromium at a time: run it through the shared browser queue script.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const GUIDE = path.join(ROOT, 'docs', 'guide');
const OUT = path.join(GUIDE, 'img');
const BASE = 'file://' + path.join(ROOT, 'index.html');
const MAX_BYTES = 120 * 1024;
const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');

function wanted() {
  const list = new Map();
  const add = (spec) => {
    const [id, opts] = spec.split(':');
    const o = {};
    for (const p of (opts || '').split(/[\s,]+/).filter(Boolean)) { const [k, v] = p.split('='); o[k] = v == null ? true : v; }
    if (id) list.set(id, Object.assign(list.get(id) || {}, o));
  };
  const ids = argv.filter((a) => !a.startsWith('--'));
  if (ids.length) { ids.forEach(add); return list; }
  const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.md') && e.name !== 'guide_zh.md' ? [path.join(d, e.name)] : [])) : [];
  for (const f of walk(GUIDE)) for (const m of fs.readFileSync(f, 'utf8').matchAll(/img\/map_([a-z0-9_]+)\.jpg/g)) add(m[1]);
  const txt = path.join(__dirname, 'maps.txt');
  if (fs.existsSync(txt)) for (const l of fs.readFileSync(txt, 'utf8').split('\n')) { const t = l.replace(/#.*/, '').trim(); if (t) add(t.replace(/\s+/, ':').replace(/\s+/g, ',')); }
  return list;
}

async function shoot(page, id, o) {
  const q = new URLSearchParams({ map: id, lv: '30' });
  if (o.flags) q.set('flags', String(o.flags).replace(/\+/g, ','));
  if (o.x) q.set('x', o.x);
  if (o.y) q.set('y', o.y);
  await page.goto(BASE + '?debug&' + q.toString().replace(/%2C/g, ','));
  await page.waitForFunction((m) => window.G && G.mapScene && G.mapScene.def && G.mapScene.def.id === m, id, { timeout: 60000 });
  await page.waitForTimeout(1500);
  return page.evaluate(async ({ o, maxBytes }) => {
    const ms = G.mapScene, T = G.TILE;
    if (o.vision) { G.state.vars.vision = 999; ms.computeSolid(); }
    const W = ms.w * T, H = ms.h * T;
    const save = { W: G.W, H: G.H, hud: ms.drawHud, sh: ms.drawScreenHooks, light: ms.lightCfg, vig: ms.def.vignette, vis: G.FX.vision, pw: ms.particles.drawWorld, ps: ms.particles.drawScreen, pv: ms.player.visible, hf: ms.hideFollowers, shake: G.Render.shakeOffset };
    const render = (scale) => {
      const c = document.createElement('canvas');
      c.width = Math.round(W * scale); c.height = Math.round(H * scale);
      const ctx = c.getContext('2d');
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      G.W = W; G.H = H;
      ms.cam.x = 0; ms.cam.y = 0;
      ms.drawHud = () => {}; ms.drawScreenHooks = () => {};
      if (!o.light) ms.lightCfg = null;
      ms.def.vignette = false;
      G.FX.vision = () => {};
      ms.particles.drawWorld = () => {}; ms.particles.drawScreen = () => {};
      ms.player.visible = false; ms.hideFollowers = true;
      G.Render.shakeOffset = () => [0, 0];
      try { ms.draw(ctx); } finally {
        G.W = save.W; G.H = save.H; ms.drawHud = save.hud; ms.drawScreenHooks = save.sh; ms.lightCfg = save.light; ms.def.vignette = save.vig;
        G.FX.vision = save.vis; ms.particles.drawWorld = save.pw; ms.particles.drawScreen = save.ps; ms.player.visible = save.pv; ms.hideFollowers = save.hf; G.Render.shakeOffset = save.shake;
      }
      // chest numbers (same order as the guide's chest table)
      let chests = ms.def.chests;
      if (typeof chests === 'function') chests = chests(G.state);
      const R = Math.max(9, 26 * scale + 6);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      (chests || []).forEach((ch, i) => {
        const x = (ch.x + 0.5) * T * scale, y = (ch.y + 0.5) * T * scale;
        ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.fillStyle = ch.spirit ? '#7a4ad8' : '#c8402a'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(R * 1.15)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), x, y + 1);
      });
      return c;
    };
    let scale = Math.min(0.32, 1100 / Math.max(W, H));
    if (Math.max(W, H) * scale < 520) scale = Math.min(1, 520 / Math.max(W, H));
    for (let tries = 0; tries < 8; tries++) {
      const c = render(scale);
      for (const qy of [0.78, 0.7, 0.62, 0.55]) {
        const url = c.toDataURL('image/jpeg', qy);
        if ((url.length - 23) * 0.75 <= maxBytes) return { url, w: c.width, h: c.height, q: qy, name: ms.def.name };
      }
      scale *= 0.85;
    }
    const c = render(scale);
    return { url: c.toDataURL('image/jpeg', 0.5), w: c.width, h: c.height, q: 0.5, name: ms.def.name };
  }, { o, maxBytes: MAX_BYTES });
}

(async () => {
  const list = wanted();
  fs.mkdirSync(OUT, { recursive: true });
  const todo = [...list].filter(([id]) => FORCE || !fs.existsSync(path.join(OUT, `map_${id}.jpg`)));
  if (!todo.length) { console.log('all map images present (' + list.size + '); use --force to re-shoot'); return; }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-TW', deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('shorelight_settings', JSON.stringify({ render3d: false, lang: 'zh', music: 0, sfx: 0 })); } catch (e) { /* ignore */ } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  let ok = 0;
  for (const [id, o] of todo) {
    try {
      const r = await shoot(page, id, o);
      const buf = Buffer.from(r.url.split(',')[1], 'base64');
      fs.writeFileSync(path.join(OUT, `map_${id}.jpg`), buf);
      console.log(`  ✓ map_${id}.jpg  ${r.name}  ${r.w}×${r.h}  q${r.q}  ${(buf.length / 1024).toFixed(0)} KB`);
      ok++;
    } catch (e) { console.log(`  ✗ ${id}: ${e.message.split('\n')[0]}`); }
  }
  await browser.close();
  if (errs.length) console.log('page errors:\n  ' + [...new Set(errs)].slice(0, 8).join('\n  '));
  console.log(`${ok}/${todo.length} map images written to docs/guide/img/`);
})();
