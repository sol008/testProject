// Architecture team B — Indigenous, coastal, maritime & festival structures for 《彼岸燈》 Shorelight.
// Contract: docs/CONTRACTS_3D.md. Every model is procedural: code-built geometry + canvas-painted textures
// (colour + derived normal maps), vertex-colour AO, merged by material; animated parts are named children.
// Cultural notes (docs/STORY_BIBLE.md guide, binding) are given per model; see docs/r3d_reports/arch_coast.md.
'use strict';
(() => {
  if (!window.G || !G.Models) return;
  const PI = Math.PI, TAU = PI * 2;
  const { sin, cos, abs, min, max, floor, sqrt, pow, atan2, hypot, round } = Math;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const TILE = 64; // 2D px per tile (G.TILE) — 2D defs are authored in these units

  // deterministic RNG
  function RNG(seed) {
    let s = (seed >>> 0) || 1;
    const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    r.range = (a, b) => a + (b - a) * r();
    r.pick = (arr) => arr[floor(r() * arr.length) % arr.length];
    r.sgn = () => (r() < 0.5 ? -1 : 1);
    return r;
  }
  const hashStr = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
  const hash2 = (x, y, s = 0) => { let h = Math.imul((x | 0) + 374761393, 668265263) ^ Math.imul((y | 0) + 1442695041, 2246822519) ^ Math.imul(s + 3266489917, 3266489917); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  // ================================================================================================
  // colour helpers (canvas painting)
  // ================================================================================================
  function hexRGB(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const rgbHex = (r, g, b) => '#' + [r, g, b].map((v) => clamp(round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  function shade(h, k) { const [r, g, b] = hexRGB(h); return k >= 0 ? rgbHex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k) : rgbHex(r * (1 + k), g * (1 + k), b * (1 + k)); }
  function mix(a, b, t) { const A = hexRGB(a), B = hexRGB(b); return rgbHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }
  function rgba(h, a) { const [r, g, b] = hexRGB(h); return `rgba(${r},${g},${b},${a})`; }
  function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, max(0.01, rx), max(0.01, ry), rot, 0, TAU); }
  function poly(g, pts) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); }
  // call fn at (x,y) and at its wrapped copies so painted features tile seamlessly
  function wrap(w, h, x, y, r, fn) {
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      const X = x + ox, Y = y + oy;
      if (X + r < 0 || X - r > w || Y + r < 0 || Y - r > h) continue;
      fn(X, Y);
    }
  }
  function noiseFill(g, w, h, rnd, n, col, a0, a1, s0 = 1, s1 = 3) {
    for (let i = 0; i < n; i++) { g.fillStyle = rgba(col, a0 + (a1 - a0) * rnd()); const s = s0 + (s1 - s0) * rnd(); g.fillRect(rnd() * w, rnd() * h, s, s); }
  }

  // ================================================================================================
  // textures: colour + normal (from a painted height field), cached; UV unit = 1 m unless noted
  // ================================================================================================
  const TEX = new Map();
  function heightToNormal(hc, strength) {
    const w = hc.width, h = hc.height;
    const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
    const out = G.U.makeCanvas(w, h, 1), og = out.getContext('2d');
    const img = og.createImageData(w, h), d = img.data;
    const H = (x, y) => src[((((y + h) % h) * w) + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const nx = -dx, ny = dy, nz = 1, l = 1 / sqrt(nx * nx + ny * ny + nz * nz);
      const i = (y * w + x) * 4;
      d[i] = (nx * l * 0.5 + 0.5) * 255; d[i + 1] = (ny * l * 0.5 + 0.5) * 255; d[i + 2] = (nz * l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    og.putImageData(img, 0, 0);
    return out;
  }
  // paint(g, hg, w, h, rnd): g = colour context, hg = height context (grey 128 = 0; null when no normal map wanted)
  function texSet(key, w, h, paint, opt = {}) {
    if (TEX.has(key)) return TEX.get(key);
    const cc = G.U.makeCanvas(w, h, 1), g = cc.getContext('2d');
    let hc = null, hg = null;
    if (opt.normal !== false) { hc = G.U.makeCanvas(w, h, 1); hg = hc.getContext('2d'); hg.fillStyle = '#808080'; hg.fillRect(0, 0, w, h); }
    paint(g, hg, w, h, RNG(hashStr(key)));
    const map = G.R3M.canvasTex(cc, { wrap: opt.wrap !== false }); map.shared = true;
    const r = { map };
    if (hc) { r.normalMap = G.R3M.canvasTex(heightToNormal(hc, opt.strength || 3), { wrap: opt.wrap !== false, srgb: false }); r.normalMap.shared = true; }
    TEX.set(key, r);
    return r;
  }

  // ---- straw thatch (strands run along v; 1 tile = 1 m) -----------------------------------------
  const tStraw = () => texSet('straw', 256, 256, (g, hg, w, h, r) => {
    g.fillStyle = '#9c8656'; g.fillRect(0, 0, w, h);
    hg.fillStyle = '#606060'; hg.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const x = r() * w, y = r() * h, len = 18 + r() * 34, ang = (r() - 0.5) * 0.16, k = r();
      const col = k < 0.35 ? shade('#b8a06a', r() * 0.25) : k < 0.7 ? shade('#8a7448', (r() - 0.5) * 0.2) : k < 0.9 ? '#6e5e3c' : '#c9b47e';
      const ex = sin(ang) * len, ey = cos(ang) * len;
      wrap(w, h, x, y, len, (X, Y) => {
        g.strokeStyle = rgba(col, 0.85); g.lineWidth = 0.8 + r() * 1.1;
        g.beginPath(); g.moveTo(X, Y); g.lineTo(X + ex, Y + ey); g.stroke();
        const hv = floor(100 + r() * 120);
        hg.strokeStyle = `rgb(${hv},${hv},${hv})`; hg.lineWidth = 1.2;
        hg.beginPath(); hg.moveTo(X, Y); hg.lineTo(X + ex, Y + ey); hg.stroke();
      });
    }
    // greyed weathering blotches
    for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h, rr = 10 + r() * 30; wrap(w, h, x, y, rr, (X, Y) => { g.fillStyle = rgba(r() < 0.5 ? '#6a6658' : '#5a5038', 0.12); ell(g, X, Y, rr, rr * 1.8); g.fill(); }); }
  }, { strength: 2.4 });
  // ragged eave fringe (alpha straws hanging down; v=1 top → v=0 tips)
  const tFringe = () => texSet('fringe', 256, 64, (g, hg, w, h, r) => {
    for (let i = 0; i < 520; i++) {
      const x = r() * w, len = h * (0.55 + r() * 0.45), ang = (r() - 0.5) * 0.25;
      const col = r() < 0.5 ? '#8a7448' : r() < 0.7 ? '#6a5a38' : '#b09868';
      wrap(w, 0, x, 0, 6, (X) => { g.strokeStyle = col; g.lineWidth = 1 + r() * 1.4; g.beginPath(); g.moveTo(X, -2); g.lineTo(X + sin(ang) * len, len); g.stroke(); });
    }
  }, { normal: false });
  // ---- generic wood grain (grain along v; neutral mid-brown, tinted by vertex colour) -----------
  const tWood = () => texSet('wood', 256, 256, (g, hg, w, h, r) => {
    g.fillStyle = '#8a6a4a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = r() * w, wd = 0.6 + r() * 2.4, a = 0.06 + r() * 0.16, dark = r() < 0.6;
      g.strokeStyle = dark ? `rgba(40,24,12,${a})` : `rgba(255,230,190,${a * 0.7})`; g.lineWidth = wd;
      g.beginPath(); for (let y = -4; y <= h + 4; y += 8) { const xx = x + sin(y * 0.03 + x) * 2.2; if (y < 0) g.moveTo(xx, y); else g.lineTo(xx, y); } g.stroke();
      if (dark) { hg.strokeStyle = `rgba(0,0,0,${a * 1.6})`; hg.lineWidth = wd; hg.beginPath(); for (let y = -4; y <= h + 4; y += 8) { const xx = x + sin(y * 0.03 + x) * 2.2; if (y < 0) hg.moveTo(xx, y); else hg.lineTo(xx, y); } hg.stroke(); }
    }
    for (let i = 0; i < 5; i++) { // knots
      const x = r() * w, y = r() * h;
      wrap(w, h, x, y, 12, (X, Y) => { g.fillStyle = 'rgba(50,30,14,0.45)'; ell(g, X, Y, 3 + r() * 3, 6 + r() * 5); g.fill(); g.strokeStyle = 'rgba(50,30,14,0.3)'; ell(g, X, Y, 7, 12); g.stroke(); hg.fillStyle = 'rgba(0,0,0,0.5)'; ell(hg, X, Y, 4, 7); hg.fill(); });
    }
    noiseFill(g, w, h, r, 900, '#20140a', 0.03, 0.1, 1, 2);
  }, { strength: 2 });
  // ---- bamboo pole (nodes as rings along v; 1 tile = 1 m) -------------------------------------
  const tBambooPole = () => texSet('bamboo_pole', 64, 256, (g, hg, w, h, r) => {
    g.fillStyle = '#b8a463'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 2) { g.fillStyle = rgba(r() < 0.5 ? '#8a7a40' : '#d8c890', 0.25); g.fillRect(x, 0, 1, h); }
    for (const y of [40, 118, 200]) {
      g.fillStyle = '#7a6a34'; g.fillRect(0, y, w, 3); g.fillStyle = 'rgba(255,250,220,0.5)'; g.fillRect(0, y + 3, w, 1.5);
      g.fillStyle = 'rgba(80,70,30,0.25)'; g.fillRect(0, y - 6, w, 6);
      hg.fillStyle = '#c0c0c0'; hg.fillRect(0, y - 1, w, 5);
    }
    noiseFill(g, w, h, r, 120, '#4a4020', 0.05, 0.2, 1, 3);
  }, { strength: 2 });
  // ---- split-bamboo wall (vertical culms; 1 tile = 1 m) ----------------------------------------
  const tBambooWall = () => texSet('bamboo_wall', 256, 256, (g, hg, w, h, r) => {
    const cw = 16;
    for (let x = 0; x < w; x += cw) {
      const c = r.pick(['#b99a5c', '#a8884c', '#c4a868', '#9a7c44']);
      const gr = g.createLinearGradient(x, 0, x + cw, 0); gr.addColorStop(0, shade(c, -0.3)); gr.addColorStop(0.35, shade(c, 0.15)); gr.addColorStop(1, shade(c, -0.35));
      g.fillStyle = gr; g.fillRect(x, 0, cw, h);
      const hgr = hg.createLinearGradient(x, 0, x + cw, 0); hgr.addColorStop(0, '#303030'); hgr.addColorStop(0.4, '#c8c8c8'); hgr.addColorStop(1, '#303030');
      hg.fillStyle = hgr; hg.fillRect(x, 0, cw, h);
      const off = r() * 120;
      for (let y = off % 120; y < h; y += 120) { g.fillStyle = 'rgba(70,50,20,0.55)'; g.fillRect(x + 1, y, cw - 2, 2.5); hg.fillStyle = '#e0e0e0'; hg.fillRect(x + 1, y, cw - 2, 3); }
    }
    noiseFill(g, w, h, r, 500, '#3a2810', 0.04, 0.12, 1, 2);
  }, { strength: 2.5 });
  // ---- bamboo / rattan mat weave (canopies, screens) -------------------------------------------
  const tMat = () => texSet('mat', 128, 128, (g, hg, w, h, r) => {
    g.fillStyle = '#a88a52'; g.fillRect(0, 0, w, h);
    const s = 8;
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
      const over = ((x / s + y / s) % 2) === 0;
      const c = shade('#b89a5e', (r() - 0.5) * 0.18);
      const gr = over ? g.createLinearGradient(x, 0, x + s, 0) : g.createLinearGradient(0, y, 0, y + s);
      gr.addColorStop(0, shade(c, -0.3)); gr.addColorStop(0.5, shade(c, 0.12)); gr.addColorStop(1, shade(c, -0.3));
      g.fillStyle = gr; g.fillRect(x, y, s, s);
      hg.fillStyle = over ? '#b0b0b0' : '#707070'; hg.fillRect(x + 1, y + 1, s - 2, s - 2);
    }
  }, { strength: 2 });
  // ---- slate wall: stacked thin slabs in courses (Bunun) ---------------------------------------
  const tSlateWall = () => texSet('slate_wall', 512, 512, (g, hg, w, h, r) => {
    g.fillStyle = '#2a2c2e'; g.fillRect(0, 0, w, h); hg.fillStyle = '#202020'; hg.fillRect(0, 0, w, h);
    let y = 0;
    while (y < h) {
      const ch = 10 + r() * 16;
      let x = -r() * 40;
      while (x < w) {
        const sw = 40 + r() * 90, sk = (r() - 0.5) * 3;
        let c = shade('#6d747a', (r() - 0.5) * 0.35);
        if (r() < 0.2) c = mix(c, '#7a6a58', 0.45);
        if (r() < 0.12) c = mix(c, '#4a5258', 0.5);
        const pts = [x + 1, y + 1 + sk, x + sw - 2, y + 1, x + sw - 1, y + ch - 2, x + 2, y + ch - 1 - sk];
        const gr = g.createLinearGradient(0, y, 0, y + ch); gr.addColorStop(0, shade(c, 0.18)); gr.addColorStop(1, shade(c, -0.2));
        g.fillStyle = gr; poly(g, pts); g.fill();
        if (x + sw > w) { g.save(); g.translate(-w, 0); poly(g, pts); g.fill(); g.restore(); }
        const hv = 150 + floor(r() * 80);
        hg.fillStyle = `rgb(${hv},${hv},${hv})`; poly(hg, pts); hg.fill();
        if (x + sw > w) { hg.save(); hg.translate(-w, 0); poly(hg, pts); hg.fill(); hg.restore(); }
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 2, y + 1, sw - 4, 1);
        if (r() < 0.18) { g.fillStyle = rgba(r.pick(['#9aa04a', '#c8c070', '#7a9a5a']), 0.35); ell(g, x + r() * sw, y + ch / 2, 6 + r() * 10, 3 + r() * 3); g.fill(); }
        x += sw;
      }
      y += ch;
    }
    noiseFill(g, w, h, r, 1500, '#0a0a0a', 0.05, 0.15, 1, 2);
  }, { strength: 4 });
  // ---- slate slab surface (roof slabs) ----------------------------------------------------------
  const tSlate = () => texSet('slate', 256, 256, (g, hg, w, h, r) => {
    g.fillStyle = '#6a7076'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const y = r() * h; g.strokeStyle = rgba(r() < 0.5 ? '#4a5056' : '#8a9096', 0.35); g.lineWidth = 1 + r() * 3; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 10, w * 0.6, y + (r() - 0.5) * 10, w, y); g.stroke(); hg.strokeStyle = r() < 0.5 ? '#606060' : '#a0a0a0'; hg.lineWidth = 2; hg.beginPath(); hg.moveTo(0, y); hg.lineTo(w, y); hg.stroke(); }
    for (let i = 0; i < 12; i++) { const x = r() * w, y = r() * h, rr = 3 + r() * 10; wrap(w, h, x, y, rr, (X, Y) => { g.fillStyle = rgba(r.pick(['#9aa04a', '#c8c070', '#b8b8a0', '#7a9a5a']), 0.08 + r() * 0.1); ell(g, X, Y, rr, rr * 0.7, r()); g.fill(); }); }
    noiseFill(g, w, h, r, 800, '#1a1c1e', 0.05, 0.14, 1, 2);
    noiseFill(g, w, h, r, 300, '#e8ece8', 0.05, 0.12, 1, 2);
  }, { strength: 2 });
  // ---- river cobbles in mortar-less dry walls (Tao pit walls) -----------------------------------
  const tCobble = () => texSet('cobble', 512, 512, (g, hg, w, h, r) => {
    g.fillStyle = '#3e3c38'; g.fillRect(0, 0, w, h); hg.fillStyle = '#101010'; hg.fillRect(0, 0, w, h);
    for (let y = 8; y < h + 20; y += 22 + r() * 6) for (let x = r() * 20; x < w + 20; x += 26 + r() * 14) {
      const rx = 12 + r() * 8, ry = 9 + r() * 5, X0 = x + (r() - 0.5) * 6, Y0 = y + (r() - 0.5) * 5, rot = (r() - 0.5) * 0.4;
      const c = shade(r.pick(['#8a8d8e', '#9a9690', '#767a7e', '#a8a49c', '#6e7276', '#8e8a80']), (r() - 0.5) * 0.15);
      wrap(w, h, X0, Y0, rx + 2, (X, Y) => {
        const gr = g.createRadialGradient(X - rx * 0.3, Y - ry * 0.4, 1, X, Y, rx * 1.1); gr.addColorStop(0, shade(c, 0.25)); gr.addColorStop(0.7, c); gr.addColorStop(1, shade(c, -0.35));
        g.fillStyle = gr; ell(g, X, Y, rx, ry, rot); g.fill();
        const hgr = hg.createRadialGradient(X, Y, 1, X, Y, rx); hgr.addColorStop(0, '#ffffff'); hgr.addColorStop(0.8, '#a0a0a0'); hgr.addColorStop(1, '#404040');
        hg.fillStyle = hgr; ell(hg, X, Y, rx, ry, rot); hg.fill();
      });
    }
    noiseFill(g, w, h, r, 1200, '#f0f0e8', 0.03, 0.1, 1, 2);
  }, { strength: 5 });
  // ---- whitewashed stone / plaster (lighthouse) --------------------------------------------------
  const tPlaster = () => texSet('plaster', 512, 512, (g, hg, w, h, r) => {
    g.fillStyle = '#efece4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const x = r() * w, y = r() * h, rr = 20 + r() * 70; wrap(w, h, x, y, rr, (X, Y) => { g.fillStyle = rgba(r() < 0.5 ? '#d8d2c4' : '#fbfaf4', 0.18); ell(g, X, Y, rr, rr * 0.6, r()); g.fill(); }); }
    // stone course joints showing through the whitewash (0.5 m courses, staggered blocks)
    for (let y = 0; y < h; y += 128) {
      g.fillStyle = 'rgba(120,112,98,0.28)'; g.fillRect(0, y, w, 2.5); hg.fillStyle = '#404040'; hg.fillRect(0, y, w, 3);
      const off = (y / 128) % 2 ? 0 : 96;
      for (let x = off; x < w + 192; x += 192) { g.fillRect(x % w, y, 2, 128); hg.fillRect(x % w, y, 2.5, 128); }
    }
    // rain streaks & salt stains
    for (let i = 0; i < 60; i++) { const x = r() * w, y = r() * h, l = 40 + r() * 160; const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(110,100,84,0.16)'); gr.addColorStop(1, 'rgba(110,100,84,0)'); g.fillStyle = gr; g.fillRect(x, y, 1.5 + r() * 4, l); }
    noiseFill(g, w, h, r, 2000, '#7a7468', 0.04, 0.12, 1, 2.5);
    for (let i = 0; i < 400; i++) { hg.fillStyle = rgba(r() < 0.5 ? '#000000' : '#ffffff', 0.12); hg.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4); }
  }, { strength: 1.6 });
  // ---- rough grey stone blocks (bases, plinths) -------------------------------------------------
  const tStone = () => texSet('stone', 512, 512, (g, hg, w, h, r) => {
    g.fillStyle = '#5a5850'; g.fillRect(0, 0, w, h); hg.fillStyle = '#202020'; hg.fillRect(0, 0, w, h);
    let y = 0, row = 0;
    while (y < h) {
      const bh = h / 6; let x = row % 2 ? -60 : 0;
      while (x < w) {
        const bw = 90 + r() * 70, c = shade(r.pick(['#a29c8e', '#8e897d', '#b2ad9f', '#9a9484']), (r() - 0.5) * 0.12);
        const gr = g.createLinearGradient(x, y, x + bw * 0.3, y + bh); gr.addColorStop(0, shade(c, 0.12)); gr.addColorStop(1, shade(c, -0.12));
        g.fillStyle = gr; g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        if (x + bw > w) { g.fillRect(x + 2 - w, y + 2, bw - 4, bh - 4); }
        const hv = 170 + floor(r() * 60); hg.fillStyle = `rgb(${hv},${hv},${hv})`; hg.fillRect(x + 3, y + 3, bw - 6, bh - 6); if (x + bw > w) hg.fillRect(x + 3 - w, y + 3, bw - 6, bh - 6);
        for (let k = 0; k < 30; k++) { g.fillStyle = rgba(r() < 0.5 ? '#3a3830' : '#d8d2c4', 0.12); g.fillRect(x + r() * bw, y + r() * bh, 2 + r() * 5, 1 + r() * 3); }
        x += bw;
      }
      y += bh; row++;
    }
    for (let i = 0; i < 20; i++) { const x = r() * w; const gr = g.createLinearGradient(0, h * 0.6, 0, h); gr.addColorStop(0, 'rgba(60,80,40,0)'); gr.addColorStop(1, 'rgba(60,80,40,0.25)'); g.fillStyle = gr; g.fillRect(x, h * 0.6, 10 + r() * 30, h * 0.4); }
  }, { strength: 3 });
  // ---- rope (twist along v) ----------------------------------------------------------------------
  const tRope = () => texSet('rope', 32, 64, (g, hg, w, h) => {
    g.fillStyle = '#b8a070'; g.fillRect(0, 0, w, h);
    for (let y = -h; y < h * 2; y += 8) { g.strokeStyle = 'rgba(70,50,20,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 16); g.stroke(); hg.strokeStyle = '#202020'; hg.lineWidth = 2.5; hg.beginPath(); hg.moveTo(0, y); hg.lineTo(w, y + 16); hg.stroke(); }
  }, { strength: 3 });
  // ---- painted / lacquered wood (neutral warm white; tinted per part) -----------------------------
  const tPaint = () => texSet('paintwood', 256, 256, (g, hg, w, h, r) => {
    g.fillStyle = '#f2ece0'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) { const x = r() * w; g.fillStyle = rgba(r() < 0.5 ? '#c8bea8' : '#ffffff', 0.08 + r() * 0.1); g.fillRect(x, 0, 1 + r() * 2, h); }
    for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(80,60,40,0.12)'; g.fillRect(r() * w, r() * h, 1 + r() * 6, 1 + r() * 2); }
    for (let i = 0; i < 200; i++) { hg.fillStyle = rgba('#000000', 0.06); hg.fillRect(r() * w, 0, 1, h); }
  }, { strength: 1 });

  // ================================================================================================
  // materials (cached; vertex colours carry AO and per-part tints)
  // ================================================================================================
  const MATS = new Map();
  function mat(key, make) {
    if (!MATS.has(key)) { const m = make(); m.name = 'ac_' + key; MATS.set(key, m); }
    return MATS.get(key);
  }
  const envM = (key, p) => mat(key, () => G.R3M.env(Object.assign({ vertexColors: true, roughness: 0.85, metalness: 0 }, p)));
  const M = {
    straw: () => { const t = tStraw(); return envM('straw', { map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95 }); },
    fringe: () => mat('fringe', () => G.R3M.env({ map: tFringe().map, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 1 })),
    wood: () => { const t = tWood(); return envM('wood', { map: t.map, normalMap: t.normalMap, roughness: 0.82 }); },
    paint: () => { const t = tPaint(); return envM('paint', { map: t.map, normalMap: t.normalMap, roughness: 0.45 }); },
    bamboo: () => { const t = tBambooPole(); return envM('bamboo', { map: t.map, normalMap: t.normalMap, roughness: 0.55 }); },
    bwall: () => { const t = tBambooWall(); return envM('bwall', { map: t.map, normalMap: t.normalMap, roughness: 0.75 }); },
    mat: () => { const t = tMat(); return envM('mat', { map: t.map, normalMap: t.normalMap, roughness: 0.9 }); },
    slateWall: () => { const t = tSlateWall(); return envM('slatewall', { map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.9 }); },
    slate: () => { const t = tSlate(); return envM('slate', { map: t.map, normalMap: t.normalMap, roughness: 0.78 }); },
    cobble: () => { const t = tCobble(); return envM('cobble', { map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1.5, 1.5), roughness: 0.92 }); },
    plaster: () => { const t = tPlaster(); return envM('plaster', { map: t.map, normalMap: t.normalMap, roughness: 0.88 }); },
    stone: () => { const t = tStone(); return envM('stone', { map: t.map, normalMap: t.normalMap, roughness: 0.92 }); },
    rope: () => { const t = tRope(); return envM('rope', { map: t.map, normalMap: t.normalMap, roughness: 1 }); },
    plain: () => envM('plain', { roughness: 0.8 }),
    gloss: () => envM('gloss', { roughness: 0.32 }),
    metal: () => envM('metal', { roughness: 0.38, metalness: 0.85 }),
    cloth: () => envM('cloth', { roughness: 0.95, side: THREE.DoubleSide }),
    glass: () => mat('glass', () => G.R3M.env({ color: 0xdfeef0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false, envMapIntensity: 1.5, side: THREE.DoubleSide })),
  };
  // additive light volume / halo material (unlit, no fog interaction issues)
  function addMat(key, color, map, opacity = 1) {
    return mat('add_' + key, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color), map: map || null, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
  }
  // emissive parts: glowM() returns a marker; Builder folds every glow part of a model into ONE shared unlit
// vertex-colour material with HDR colours (>1 → bloom), so lit windows, fires & lenses cost one draw call.
  const glowM = (color, intensity = 2.5) => mat('glow' + color + intensity, () => { const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 1 }); m.userData.glow = { color, k: intensity }; return m; });
  const glowShared = () => mat('glowv', () => new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));

  // ================================================================================================
  // geometry helpers — everything is baked into model space (y = 0 ground, origin = footprint centre)
  // ================================================================================================
  const _m4 = () => new THREE.Matrix4();
  function place(geo, p) {
    if (!p) return geo;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0, p.order || 'XYZ'));
    const s = p.s != null ? p.s : 1;
    geo.applyMatrix4(_m4().compose(new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0), q, new THREE.Vector3(p.sx != null ? p.sx : s, p.sy != null ? p.sy : s, p.sz != null ? p.sz : s)));
    return geo;
  }
  function scaleUV(geo, su, sv, ou = 0, ov = 0) {
    const uv = geo.attributes.uv; if (!uv) return geo;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
    return geo;
  }
  // box with bottom at y; UVs in metres per face; grain:'long' runs v along the longest face edge
  function gBox(w, h, d, p, opt = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    const ou = opt.ou != null ? opt.ou : 0, ov = opt.ov != null ? opt.ov : 0;
    for (let f = 0; f < 6; f++) {
      const [du, dv] = dims[f], swap = opt.grain === 'long' && du > dv;
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k, u = uv.getX(i), v = uv.getY(i);
        if (swap) uv.setXY(i, v * dv + ou, u * du + ov); else uv.setXY(i, u * du + ou, v * dv + ov);
      }
    }
    g.translate(0, h / 2, 0);
    return place(g, p);
  }
  function gCyl(rt, rb, h, seg, p, opt = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg || 10, opt.hs || 1, !!opt.open);
    scaleUV(g, TAU * (rt + rb) / 2 * (opt.us || 1), h * (opt.vs || 1), opt.ou || 0, opt.ov || 0);
    g.translate(0, h / 2, 0);
    return place(g, p);
  }
  // cylinder between two points (posts, poles, beams, spars, rigging)
  const _up = new THREE.Vector3(0, 1, 0);
  function gRod(a, b, r0, r1, seg = 6, opt = {}) {
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), len = d.length();
    const g = new THREE.CylinderGeometry(r1 != null ? r1 : r0, r0, len, seg, 1, !!opt.open);
    scaleUV(g, TAU * r0 * (opt.us || 1), len * (opt.vs || 1), opt.ou || 0, opt.ov || 0);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(_up, d.normalize());
    g.applyMatrix4(_m4().compose(A, q, new THREE.Vector3(1, 1, 1)));
    return g;
  }
  function gSphere(r, p, ws = 10, hs = 8) { const g = new THREE.SphereGeometry(r, ws, hs); scaleUV(g, TAU * r, PI * r); return place(g, p); }
  function gTube(pts, r, segs, rseg = 6, closed = false) {
    const c = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), closed, 'centripetal');
    const g = new THREE.TubeGeometry(c, segs, r, rseg, closed);
    scaleUV(g, c.getLength(), TAU * r);
    // tube uv: u along length → swap so v runs along the tube (grain/twist along v)
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, u); }
    return g;
  }
  function gLathe(prof, seg, p, opt = {}) {
    const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), seg, opt.phi || 0, opt.len || TAU);
    // uv: u around (circumference at mean radius), v by profile arc length
    let L = 0; const acc = [0]; for (let i = 1; i < prof.length; i++) { L += hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]); acc.push(L); }
    const rm = prof.reduce((s, q) => s + q[0], 0) / prof.length;
    const uv = g.attributes.uv, n = prof.length;
    for (let i = 0; i < uv.count; i++) { const j = i % n; uv.setXY(i, uv.getX(i) * TAU * rm * (opt.us || 1), acc[j] * (opt.vs || 1)); }
    return place(g, p);
  }
  // parametric grid surface f(u,v) -> [x,y,z]; uvf(u,v) -> [U,V] (metres); returns non-indexed geometry
  function gGrid(nu, nv, f, uvf, opt = {}) {
    const pos = [], uvs = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, p = f(u, v); pos.push(p[0], p[1], p[2]);
      const t = uvf ? uvf(u, v) : [u, v]; uvs.push(t[0], t[1]);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      if (opt.flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  // irregular rock (displaced icosphere), bottom roughly at y=0 before placement
  function gRock(r, rnd, p, opt = {}) {
    const g = new THREE.IcosahedronGeometry(r, opt.detail != null ? opt.detail : 1);
    const pos = g.attributes.position, seed = rnd() * 100, sq = opt.squash != null ? opt.squash : 0.7;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = 1 + 0.22 * sin(v.x * 4.1 + seed) * cos(v.z * 3.7 + seed * 1.3) + 0.12 * sin(v.y * 6.3 + seed * 0.7);
      v.multiplyScalar(n); v.y *= sq; if (opt.flatBottom && v.y < -r * 0.25) v.y = -r * 0.25 + (v.y + r * 0.25) * 0.2;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    triUV(g, 1);
    return place(g, p);
  }
  // triplanar UVs from the dominant normal axis (metres × s)
  function triUV(geo, s = 1, ou = 0, ov = 0) {
    if (geo.index) geo = geo.toNonIndexed();
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const ax = abs(nor.getX(i)), ay = abs(nor.getY(i)), az = abs(nor.getZ(i));
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let u, v;
      if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
      uv[i * 2] = u * s + ou; uv[i * 2 + 1] = v * s + ov;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  }
  // flat quad strip along a polyline (ribbons, fringes); pts at the top edge, hangs `h` along `down`
  function gStrip(pts, h, opt = {}) {
    const pos = [], uvs = [];
    let L = 0; const acc = [0];
    for (let i = 1; i < pts.length; i++) { L += hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2], pts[i][1] - pts[i - 1][1]); acc.push(L); }
    const out = opt.out || 0; // outward kick at the bottom (perpendicular in xz)
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const quad = (p) => p;
      const nA = opt.nrm ? opt.nrm(i) : [0, 0], nB = opt.nrm ? opt.nrm(i + 1) : [0, 0];
      const a2 = [a[0] + nA[0] * out, a[1] - h, a[2] + nA[1] * out], b2 = [b[0] + nB[0] * out, b[1] - h, b[2] + nB[1] * out];
      pos.push(...quad(a), ...a2, ...b, ...b, ...a2, ...b2);
      const ua = acc[i] * (opt.us || 1), ub = acc[i + 1] * (opt.us || 1);
      uvs.push(ua, 1, ua, 0, ub, 1, ub, 1, ua, 0, ub, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  }

  // ------------------------------------------------------------------------------------------------
  // Builder: collects geometry per material, bakes vertex colour (tint × AO), merges → ≤ #materials draws
  // ------------------------------------------------------------------------------------------------
  const _c = new THREE.Color();
  class Builder {
    constructor() { this.parts = new Map(); this.root = new THREE.Group(); }
    // opt: { tint:hex|[r,g,b], ao:false|{h,min}, aofn(x,y,z,nx,ny,nz)->k, cast:false, jitter:0..1 (per-piece brightness noise), rnd }
    add(material, geo, opt = {}) {
      if (!geo) return null;
      if (material.userData.glow) { const gl = material.userData.glow; material = glowShared(); opt = Object.assign({}, opt, { tint: gl.color, emit: gl.k * 0.6, ao: false, cast: false }); }
      let g = geo.index ? geo.toNonIndexed() : geo;
      if (!g.attributes.normal) g.computeVertexNormals();
      for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(a)) g.deleteAttribute(a);
      const n = g.attributes.position.count;
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      const col = g.attributes.color, pos = g.attributes.position, nor = g.attributes.normal;
      let tr = 1, tg = 1, tb = 1;
      if (opt.tint != null) { if (Array.isArray(opt.tint)) [tr, tg, tb] = opt.tint; else { _c.set(opt.tint); tr = _c.r; tg = _c.g; tb = _c.b; } }
      if (opt.jitter && opt.rnd) { const k = 1 + (opt.rnd() - 0.5) * opt.jitter; tr *= k; tg *= k; tb *= k; }
      if (opt.emit) { tr *= opt.emit; tg *= opt.emit; tb *= opt.emit; }
      const ao = opt.ao === false ? null : Object.assign({ h: 0.9, min: 0.5, y0: 0 }, opt.ao || {});
      for (let i = 0; i < n; i++) {
        let k = 1;
        const y = pos.getY(i);
        if (ao) k *= ao.min + (1 - ao.min) * sstep(ao.y0, ao.y0 + ao.h, y);
        if (opt.aofn) k *= opt.aofn(pos.getX(i), y, pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i));
        col.setXYZ(i, col.getX(i) * tr * k, col.getY(i) * tg * k, col.getZ(i) * tb * k);
      }
      const key = material.uuid + (opt.cast === false ? '-' : '+');
      if (!this.parts.has(key)) this.parts.set(key, { material, cast: opt.cast !== false, geos: [] });
      this.parts.get(key).geos.push(g);
      return g;
    }
    // a separate (animated / special) mesh; geometry gets the same colour baking
    mesh(name, material, geo, opt = {}) {
      const b = new Builder(); b.add(material, geo, opt);
      const merged = b.parts.values().next().value;
      const m = new THREE.Mesh(merged.geos.length > 1 ? THREE.BufferGeometryUtils.mergeGeometries(merged.geos) : merged.geos[0], material);
      m.name = name; m.castShadow = opt.cast !== false; m.receiveShadow = true;
      m.userData.noMerge = true;
      return m;
    }
    build(extra = []) {
      const out = new THREE.Group();
      for (const { material, cast, geos } of this.parts.values()) {
        const g = geos.length > 1 ? THREE.BufferGeometryUtils.mergeGeometries(geos, false) : geos[0];
        if (!g) continue;
        g.computeBoundingSphere(); g.computeBoundingBox();
        const m = new THREE.Mesh(g, material);
        m.castShadow = cast; m.receiveShadow = true;
        out.add(m);
      }
      for (const e of extra) if (e) out.add(e);
      return out;
    }
  }

  // ------------------------------------------------------------------------------------------------
  // per-instance animated geometry (cloth, nets): clone the shared geometry the first time it moves
  // ------------------------------------------------------------------------------------------------
  function ownGeo(mesh) {
    if (!mesh.userData.ownGeo) {
      mesh.geometry = mesh.geometry.clone();
      mesh.geometry.userData.base = Float32Array.from(mesh.geometry.attributes.position.array);
      mesh.userData.ownGeo = true;
    }
    return mesh.geometry;
  }
  // cloth flutter: each vertex moves along `axis` by amp × weight(u) × wave; weight from uv.x (0 = attached edge)
  function flutter(mesh, t, o) {
    if (!mesh) return;
    const g = ownGeo(mesh), base = g.userData.base, pos = g.attributes.position, uv = g.attributes.uv;
    const amp = o.amp || 0.1, f = o.freq || 3, k = o.k || 4, ph = o.phase || 0, ax = o.axis || [0, 0, 1];
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      const wgt = o.weight ? o.weight(u, v) : pow(u, 1.2);
      const w = sin(t * f - u * k + ph + v * (o.kv || 0.8)) + 0.35 * sin(t * f * 1.9 - u * k * 1.7 + ph * 1.3 + v * 2.1);
      const d = amp * wgt * w + (o.bias || 0) * wgt;
      pos.setXYZ(i, base[i * 3] + ax[0] * d, base[i * 3 + 1] + ax[1] * d + (o.droop ? -o.droop * wgt * (1 + 0.3 * sin(t * f * 0.7 + ph)) : 0), base[i * 3 + 2] + ax[2] * d);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
  }
  const viewDark = () => (G.R3 && G.R3.view && G.R3.view.dark != null ? G.R3.view.dark : 0);
  const seedOf = (o) => hash2(o.x | 0, o.y | 0, 7) * 100;

  // shared glow card texture for lamp halos / beams
  const beamTex = () => G.R3M.tex('ac:beam', 64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, h, 0, 0); // v=0 (bottom of canvas) is the source end
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const sg = g.createLinearGradient(0, 0, w, 0); sg.addColorStop(0, 'rgba(0,0,0,0.6)'); sg.addColorStop(0.5, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = sg; g.fillRect(0, 0, w, h);
  });
  function haloCard(color, size, opacity = 0.8) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.R3M.glowTex(), color: new THREE.Color(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    m.scale.set(size, size, 1);
    m.userData.noMerge = true; m.castShadow = false;
    return m;
  }

  const def = (id, d) => G.Models.define(id, d);
  const objDef = (t) => (G.Objects && G.Objects.get(t)) || null;

  // ################################################################################################
  //  TATALA — Tao (達悟) plank boat. White hull with red & black: sawtooth bands along gunwale and
  //  keel, concentric "eye of the boat" rosettes (mata no tatala) near both ends on both sides, a
  //  restrained human-figure (mangamaog) band amidships, tall upswept stem posts with feather tufts.
  //  Footprint 2×1 (x along the boat). o.water → afloat with bob/roll; otherwise beached on log rollers.
  // ################################################################################################
  const TAT = { a: 1.32, b: 0.36 };
  TAT.wf = (u) => pow(max(0, 1 - pow(abs(u), 2.3)), 0.62);
  TAT.sh = (u) => 0.47 + 0.6 * pow(abs(u), 5) + 0.06 * u * u;
  TAT.kl = (u) => 0.06 + 0.3 * pow(abs(u), 3.2);
  TAT.pt = (u, s, inset = 0) => { // u ∈ [-1,1] length, s ∈ [-1,1] girth (−1 = port gunwale, 0 keel, +1 starboard)
    const phi = s * PI / 2, wf = TAT.wf(u), kl = TAT.kl(u) + inset * 0.9, sh = TAT.sh(u) - inset * 0.15;
    const z = (TAT.b - inset) * wf * sin(phi);
    const y = kl + (sh - kl) * (1 - cos(phi)) * (0.92 + 0.08 * abs(sin(phi)));
    const rake = Math.sign(u) * 0.22 * pow(abs(u), 4) * (y - kl);
    return [TAT.a * u + rake, y, z];
  };
  function tatalaHullTex() {
    return G.R3M.tex('ac:tatala_hull', 1024, 512, (g, W, H) => {
      // one side painted into a 1024×256 strip: x = length (bow at right), y = 0 gunwale → 256 keel
      const side = G.U.makeCanvas(1024, 256, 1), s = side.getContext('2d');
      const red = '#b8281f', blk = '#1a1716', wht = '#f1ebdc';
      s.fillStyle = wht; s.fillRect(0, 0, 1024, 256);
      const rnd = RNG(77);
      for (let i = 0; i < 400; i++) { s.fillStyle = rgba('#c8bca4', 0.12); s.fillRect(rnd() * 1024, rnd() * 256, 2 + rnd() * 30, 1); }
      // plank seams (strakes) with dowel pegs — the boat is built of many fitted planks (拼板)
      for (const y of [44, 92, 138, 184, 226]) {
        s.strokeStyle = 'rgba(80,60,40,0.45)'; s.lineWidth = 1.4; s.beginPath(); s.moveTo(0, y); s.lineTo(1024, y); s.stroke();
        for (let x = 30 + rnd() * 40; x < 1000; x += 70 + rnd() * 40) { s.fillStyle = 'rgba(90,64,40,0.5)'; ell(s, x, y + 2, 2, 2); s.fill(); }
      }
      for (let k = 0; k < 9; k++) { const x = 90 + k * 105 + rnd() * 30; s.strokeStyle = 'rgba(80,60,40,0.35)'; s.lineWidth = 1; s.beginPath(); s.moveTo(x, 44 + (k % 4) * 46); s.lineTo(x + 6, 44 + (k % 4) * 46 + 46); s.stroke(); }
      // gunwale band: black with red/black sawtooth below
      s.fillStyle = blk; s.fillRect(0, 0, 1024, 14);
      for (let x = 0; x < 1024; x += 16) {
        s.fillStyle = red; poly(s, [x, 14, x + 8, 34, x + 16, 14]); s.fill();
        s.fillStyle = blk; poly(s, [x + 8, 34, x + 16, 14, x + 24, 34]); s.fill();
      }
      s.fillStyle = red; s.fillRect(0, 34, 1024, 4);
      // keel band: red with white ticks and a black wave line
      s.fillStyle = red; s.fillRect(0, 214, 1024, 42);
      s.fillStyle = blk; s.fillRect(0, 210, 1024, 5);
      for (let x = 0; x < 1024; x += 12) { s.fillStyle = wht; poly(s, [x, 256, x + 6, 236, x + 12, 256]); s.fill(); }
      s.strokeStyle = blk; s.lineWidth = 3; s.beginPath(); for (let x = 0; x <= 1024; x += 8) { const y = 196 + ((x / 8) % 2 ? -5 : 5); if (!x) s.moveTo(x, y); else s.lineTo(x, y); } s.stroke();
      // the boat's eyes (mata no tatala): near both ends — rays, rings, pupil. Compensate for the
      // hull UV stretch (v spans more metres near the raised ends) by squashing vertically.
      const eye = (cx, cy, R) => {
        s.save(); s.translate(cx, cy); s.scale(1, 0.62);
        s.fillStyle = blk; ell(s, 0, 0, R * 1.08, R * 1.08); s.fill();
        s.fillStyle = red;
        for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; poly(s, [cos(a - 0.17) * R * 0.66, sin(a - 0.17) * R * 0.66, cos(a) * R, sin(a) * R, cos(a + 0.17) * R * 0.66, sin(a + 0.17) * R * 0.66]); s.fill(); }
        s.fillStyle = wht; ell(s, 0, 0, R * 0.6, R * 0.6); s.fill();
        s.strokeStyle = red; s.lineWidth = R * 0.12; ell(s, 0, 0, R * 0.42, R * 0.42); s.stroke();
        s.strokeStyle = blk; s.lineWidth = R * 0.06; ell(s, 0, 0, R * 0.56, R * 0.56); s.stroke();
        s.fillStyle = blk; ell(s, 0, 0, R * 0.2, R * 0.2); s.fill();
        s.restore();
      };
      eye(150, 112, 64); eye(874, 112, 64);
      // human-figure band amidships (simple stylised figures, as painted on the hull)
      for (let i = 0; i < 6; i++) {
        const x = 330 + i * 72, y = 116;
        s.strokeStyle = blk; s.lineWidth = 5; s.lineCap = 'round';
        s.beginPath(); s.arc(x, y - 34, 8, 0, TAU); s.stroke();
        s.beginPath(); s.moveTo(x, y - 26); s.lineTo(x, y + 6);
        s.moveTo(x - 22, y - 34); s.lineTo(x - 22, y - 20); s.lineTo(x, y - 14); s.lineTo(x + 22, y - 20); s.lineTo(x + 22, y - 34);
        s.moveTo(x - 18, y + 30); s.lineTo(x - 18, y + 16); s.lineTo(x, y + 6); s.lineTo(x + 18, y + 16); s.lineTo(x + 18, y + 30);
        s.stroke();
        s.fillStyle = red; poly(s, [x - 6, y - 4, x, y - 10, x + 6, y - 4, x, y + 2]); s.fill();
      }
      // concentric red/black lines tying the motifs
      s.strokeStyle = red; s.lineWidth = 4; s.beginPath(); s.moveTo(230, 64); s.lineTo(794, 64); s.moveTo(230, 170); s.lineTo(794, 170); s.stroke();
      s.strokeStyle = blk; s.lineWidth = 2; s.beginPath(); s.moveTo(230, 72); s.lineTo(794, 72); s.moveTo(230, 162); s.lineTo(794, 162); s.stroke();
      // grime toward the keel
      const gr = s.createLinearGradient(0, 150, 0, 256); gr.addColorStop(0, 'rgba(60,50,40,0)'); gr.addColorStop(1, 'rgba(60,50,40,0.18)'); s.fillStyle = gr; s.fillRect(0, 150, 1024, 106);
      // canvas row 0 is v=1: top half = starboard side (gunwale at v=1), bottom half = port side flipped
      g.drawImage(side, 0, 0, 1024, 256);
      g.save(); g.translate(0, 512); g.scale(1, -1); g.drawImage(side, 0, 0, 1024, 256); g.restore();
    });
  }
  function buildTatala(o) {
    const B = new Builder(), rnd = RNG(911);
    const hullM = mat('tatala_hull', () => G.R3M.env({ map: tatalaHullTex(), vertexColors: true, roughness: 0.55 }));
    const NU = 64, NV = 20;
    // outer hull: u along length, v around girth (0 port gunwale → 1 starboard gunwale)
    const outer = gGrid(NU, NV, (u, v) => TAT.pt(u * 2 - 1, v * 2 - 1), (u, v) => [u, v], { flip: true });
    B.add(hullM, outer, { ao: false, aofn: (x, y) => 0.8 + 0.2 * sstep(0.05, 0.4, y) });
    // inner hull (bare wood, darker), reversed winding
    const inner = gGrid(NU, NV, (u, v) => TAT.pt((u * 2 - 1) * 0.985, v * 2 - 1, 0.03), (u, v) => [u * 2.6, v * 1.2]);
    B.add(M.wood(), inner, { tint: '#8a6040', ao: false, aofn: (x, y) => 0.45 + 0.55 * sstep(0.1, 0.55, y) });
    // gunwale caps (black-red rim connecting outer & inner edges)
    for (const s of [-1, 1]) {
      const rim = gGrid(NU, 1, (u, v) => { const U = u * 2 - 1, a = TAT.pt(U, s), b = TAT.pt(U * 0.985, s, 0.03); return [lerp(a[0], b[0], v), lerp(a[1], b[1], v) + 0.012, lerp(a[2], b[2], v)]; }, (u, v) => [u * 2.6, v * 0.05], { flip: s > 0 });
      B.add(M.paint(), rim, { tint: '#2a1a16', ao: false });
    }
    // stem posts: tall tapered fins continuing each end, with feather-tuft sockets
    for (const sg of [-1, 1]) {
      const top = TAT.pt(sg, 1), base = TAT.pt(sg * 0.97, 1);
      B.add(M.paint(), gRod([base[0], base[1] - 0.06, 0], [top[0] + sg * 0.05, top[1] + 0.16, 0], 0.03, 0.014, 6), { tint: '#1a1716', ao: false });
      B.add(M.paint(), gSphere(0.028, { x: top[0] + sg * 0.05, y: top[1] + 0.16, z: 0 }, 8, 6), { tint: '#f0e8d8', ao: false });
    }
    // thwarts (seats), ribs and a pair of oars resting inside
    for (const u of [-0.42, 0, 0.42]) {
      const p = TAT.pt(u, 1, 0.03), y = p[1] - 0.12;
      B.add(M.wood(), gBox(0.12, 0.03, p[2] * 2 * 0.98, { x: TAT.a * u, y }), { tint: '#9a7050', ao: false });
    }
    for (let k = -5; k <= 5; k++) {
      const u = k / 6.2, pts = [];
      for (let j = 0; j <= 8; j++) { const p = TAT.pt(u, -1 + j / 4, 0.045); pts.push([p[0], p[1], p[2]]); }
      B.add(M.wood(), gTube(pts, 0.012, 12, 4), { tint: '#6a4a30', ao: false });
    }
    for (const z of [-0.08, 0.08]) {
      B.add(M.wood(), gRod([-0.95, 0.42, z], [0.85, 0.48, z * 0.6], 0.016, 0.016, 5), { tint: '#a07a54', ao: false });
      B.add(M.wood(), gBox(0.34, 0.012, 0.08, { x: 0.95, y: 0.47, z: z * 0.6, rz: -0.03 }), { tint: '#a07a54', ao: false });
    }
    const extra = [];
    // feather tufts on both stem tips (animated)
    const tuftGeo = [];
    for (const sg of [-1, 1]) {
      const top = TAT.pt(sg, 1), tx = top[0] + sg * 0.05, ty = top[1] + 0.16;
      for (let k = 0; k < 7; k++) {
        const a = (k / 6 - 0.5) * 1.6, len = 0.16 + rnd() * 0.06;
        const fg = new THREE.PlaneGeometry(0.035, len, 1, 3); fg.translate(0, len / 2, 0);
        place(fg, { x: tx, y: ty, z: 0, rz: -sg * 0.25 + a * 0.45, ry: (rnd() - 0.5) * 1.2 });
        tuftGeo.push(fg);
      }
    }
    const tuftMat = mat('feather', () => G.R3M.env({ color: 0xf2eee6, roughness: 1, side: THREE.DoubleSide, vertexColors: true }));
    const tuft = new Builder().mesh('tuft', tuftMat, THREE.BufferGeometryUtils.mergeGeometries(tuftGeo), { ao: false });
    extra.push(tuft);
    if (!o.water) {
      // beached on two log rollers with small stones
      for (const x of [-0.6, 0.55]) B.add(M.wood(), gRod([x, 0.07, -0.42], [x + 0.04, 0.07, 0.42], 0.07, 0.07, 8), { tint: '#7a5a3c', ao: { h: 0.12, min: 0.6 } });
      for (let i = 0; i < 6; i++) B.add(M.stone(), gRock(0.07 + rnd() * 0.05, rnd, { x: (rnd() - 0.5) * 2.2, y: 0.02, z: (rnd() < 0.5 ? -1 : 1) * (0.36 + rnd() * 0.15) }), { tint: '#8a8a84', ao: { h: 0.1, min: 0.6 } });
    }
    const hull = B.build();
    const g = new THREE.Group();
    const bob = new THREE.Group(); bob.name = 'bob';
    bob.add(hull); for (const e of extra) bob.add(e);
    if (o.water) bob.position.y = -0.24; else bob.position.y = 0.075;
    g.add(bob);
    return g;
  }
  def('tatala', {
    key: (o) => (o.water ? 'w' : 'b'),
    build(o) { return buildTatala(o); },
    update(node, o, t) {
      const b = node.getObjectByName('bob'), s = seedOf(o);
      if (b && o.water) { b.position.y = -0.24 + sin(t * 1.6 + s) * 0.025; b.rotation.x = sin(t * 1.2 + s) * 0.035; b.rotation.z = sin(t * 0.9 + s * 1.7) * 0.02; }
      const tf = node.getObjectByName('tuft');
      if (tf) tf.rotation.y = sin(t * 2.3 + s) * 0.04;
    },
  });

  // ################################################################################################
  //  LIGHTHOUSE — whitewashed masonry tower (鵝鑾鼻-style), stone plinth, arched door (south),
  //  corbelled gallery with railing, glazed lantern room, copper cupola with ventilator ball & vane.
  //  Rotating double beam + lamp light when lit; o.beam === false keeps the lamp but no sweeping beam.
  // ################################################################################################
  const LH = { r0: 1.02, r1: 0.74, y0: 0.42, y1: 7.0 };
  function buildLighthouse(o) {
    const B = new Builder(), rnd = RNG(4401);
    const lit = o.lit !== false;
    // plinth: two stepped stone drums + steps toward the door (+z)
    B.add(M.stone(), gCyl(1.46, 1.5, 0.26, 28, {}, { us: 0.5, vs: 0.5 }), { tint: '#c8c2b4', ao: { h: 0.3, min: 0.6 } });
    B.add(M.stone(), gCyl(1.26, 1.3, 0.16, 28, { y: 0.26 }, { us: 0.5, vs: 0.5 }), { tint: '#d8d2c4' });
    for (let i = 0; i < 2; i++) B.add(M.stone(), gBox(0.9, 0.13, 0.24, { y: i * 0.13, z: 1.5 + 0.2 - i * 0.2 }), { tint: '#bdb7a8' });
    // tower: lathe with a gentle concave flare at the foot and a cornice under the gallery
    const prof = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24, y = lerp(LH.y0, LH.y1, t); prof.push([lerp(LH.r0, LH.r1, pow(t, 0.9)) + 0.1 * pow(1 - t, 6), y]); }
    B.add(M.plaster(), gLathe(prof, 36, {}, { us: 0.5, vs: 0.5 }), { ao: { h: 1.2, min: 0.72, y0: 0.4 }, aofn: (x, y) => 1 - 0.1 * sstep(6.4, 7, y) });
    // cornice rings + corbels
    B.add(M.plaster(), gLathe([[LH.r1 + 0.02, LH.y1 - 0.25], [LH.r1 + 0.1, LH.y1 - 0.18], [LH.r1 + 0.1, LH.y1 - 0.08], [LH.r1 + 0.24, LH.y1]], 36), { tint: '#e8e4da' });
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU;
      B.add(M.plaster(), gBox(0.1, 0.32, 0.22, { x: sin(a) * (LH.r1 + 0.12), y: LH.y1 - 0.32, z: cos(a) * (LH.r1 + 0.12), ry: a }), { tint: '#ddd8cc' });
    }
    // gallery deck (dark iron) + railing
    const ironT = '#2e3236';
    B.add(M.metal(), gCyl(1.05, 1.05, 0.09, 36, { y: LH.y1 }), { tint: ironT, ao: false });
    const GR = 1.0, gy = LH.y1 + 0.09;
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; B.add(M.metal(), gRod([sin(a) * GR, gy, cos(a) * GR], [sin(a) * GR, gy + 0.62, cos(a) * GR], 0.014, 0.014, 4), { tint: ironT, ao: false }); }
    for (const hy of [0.3, 0.62]) B.add(M.metal(), place(new THREE.TorusGeometry(GR, hy > 0.5 ? 0.024 : 0.014, 5, 48), { y: gy + hy, rx: PI / 2 }), { tint: ironT, ao: false });
    // lantern room: low iron wall, glazing with astragals, roof cone + cupola + ventilator ball
    const LR = 0.58, ly0 = gy, ly1 = gy + 0.32, ly2 = ly1 + 1.0;
    B.add(M.metal(), gCyl(LR, LR, 0.32, 12, { y: ly0 }), { tint: '#3a4a52', ao: false });
    for (let i = 0; i < 12; i++) { const a = (i + 0.5) / 12 * TAU; B.add(M.metal(), gRod([sin(a) * LR * 0.97, ly1, cos(a) * LR * 0.97], [sin(a) * LR * 0.97, ly2, cos(a) * LR * 0.97], 0.018, 0.018, 4), { tint: '#2a2e30', ao: false }); }
    for (const y of [ly1, ly1 + 0.5, ly2]) B.add(M.metal(), place(new THREE.TorusGeometry(LR, 0.02, 4, 24), { y, rx: PI / 2 }), { tint: '#2a2e30', ao: false });
    const copper = '#5f8f80';
    B.add(M.paint(), gLathe([[LR + 0.12, ly2], [LR + 0.1, ly2 + 0.06], [0.42, ly2 + 0.3], [0.2, ly2 + 0.52], [0.06, ly2 + 0.64], [0.0, ly2 + 0.66]], 24), { tint: copper, ao: false, aofn: (x, y) => 0.85 + 0.15 * sstep(ly2, ly2 + 0.6, y) });
    B.add(M.paint(), gSphere(0.1, { y: ly2 + 0.74 }, 12, 8), { tint: copper, ao: false });
    B.add(M.metal(), gRod([0, ly2 + 0.8, 0], [0, ly2 + 1.35, 0], 0.012, 0.008, 4), { tint: '#222', ao: false });
    B.add(M.metal(), gBox(0.32, 0.08, 0.008, { x: 0.12, y: ly2 + 1.12 }), { tint: '#222', ao: false });
    B.add(M.metal(), gBox(0.008, 0.008, 0.26, { y: ly2 + 1.0 }), { tint: '#222', ao: false });
    B.add(M.metal(), gBox(0.26, 0.008, 0.008, { y: ly2 + 1.0 }), { tint: '#222', ao: false });
    // glazing (transparent, own draw)
    const glass = new Builder().mesh('glass', M.glass(), gCyl(LR * 0.96, LR * 0.96, 1.0, 12, { y: ly1 }, { open: true }), { ao: false, cast: false });
    // lamp & lens core (always present; glows when lit)
    const lensMat = lit ? glowM('#fff1c4', 3.2) : mat('lens_off', () => G.R3M.env({ color: 0xb8c8c0, roughness: 0.15, metalness: 0.3 }));
    B.add(lensMat, gLathe([[0.0, -0.32], [0.2, -0.26], [0.27, 0], [0.2, 0.26], [0, 0.32]], 16, { y: ly1 + 0.5 }), { ao: false, cast: false });
    B.add(M.metal(), gCyl(0.08, 0.12, 0.26, 10, { y: ly1 - 0.06 }), { tint: '#b08a3a', ao: false });
    // arched door (south) and windows: frames + recessed dark panels
    const doorZ = LH.r0 * 0.98 + 0.02;
    const arch = new THREE.Shape(); arch.moveTo(-0.38, 0); arch.lineTo(-0.38, 1.25); arch.absarc(0, 1.25, 0.38, PI, 0, true); arch.lineTo(0.38, 0); arch.lineTo(-0.38, 0);
    const frame = new THREE.ExtrudeGeometry(arch, { depth: 0.16, bevelEnabled: false, curveSegments: 12 });
    B.add(M.paint(), place(scaleUV(frame, 1, 1), { y: LH.y0, z: doorZ - 0.1 }), { tint: '#3a4a52' });
    const doorS = new THREE.Shape(); doorS.moveTo(-0.3, 0); doorS.lineTo(-0.3, 1.25); doorS.absarc(0, 1.25, 0.3, PI, 0, true); doorS.lineTo(0.3, 0); doorS.lineTo(-0.3, 0);
    const door = new THREE.ExtrudeGeometry(doorS, { depth: 0.04, bevelEnabled: false, curveSegments: 12 });
    B.add(M.wood(), place(scaleUV(door, 1, 1), { y: LH.y0, z: doorZ + 0.07 }), { tint: '#5a3e2a' });
    for (let i = 0; i < 3; i++) B.add(M.metal(), gBox(0.56, 0.035, 0.012, { y: LH.y0 + 0.3 + i * 0.45, z: doorZ + 0.115 }), { tint: '#222', ao: false });
    // fanlight
    const fan = new THREE.CircleGeometry(0.26, 12, 0, PI); place(fan, { y: LH.y0 + 1.27, z: doorZ + 0.12 });
    B.add(lit ? glowM('#ffc070', 1.4) : M.paint(), fan, { tint: lit ? undefined : '#2a2e36', ao: false });
    // windows staggered around the tower
    const wins = [[2.2, 0.0], [3.9, PI * 0.75], [5.5, -PI * 0.6], [3.0, PI * 1.25]];
    for (const [wy, a] of wins) {
      const r = lerp(LH.r0, LH.r1, (wy - LH.y0) / (LH.y1 - LH.y0)) + 0.01;
      const x = sin(a) * r, z = cos(a) * r;
      B.add(M.paint(), gBox(0.32, 0.6, 0.1, { x, y: wy - 0.05, z, ry: a }), { tint: '#3a4a52' });
      B.add(lit ? glowM('#ffcf80', 1.2) : M.paint(), gBox(0.2, 0.44, 0.04, { x: sin(a) * (r + 0.04), y: wy + 0.02, z: cos(a) * (r + 0.04), ry: a }), { tint: lit ? undefined : '#2a2e36', ao: false });
      B.add(M.stone(), gBox(0.4, 0.06, 0.16, { x: sin(a) * (r + 0.02), y: wy - 0.1, z: cos(a) * (r + 0.02), ry: a }), { tint: '#d8d2c4' });
    }
    // weathering: grass tufts & a few boulders around the plinth
    for (let i = 0; i < 9; i++) { const a = rnd() * TAU, rr = 1.5 + rnd() * 0.15; B.add(M.stone(), gRock(0.12 + rnd() * 0.12, rnd, { x: sin(a) * rr, y: 0.05, z: cos(a) * rr }), { tint: '#c8c2b4', ao: { h: 0.25, min: 0.7 } }); }
    const extra = [glass];
    if (lit) {
      // rotating beam: two opposed additive cones from the lens, plus a halo card
      const beam = new THREE.Group(); beam.name = 'beam'; beam.position.y = ly1 + 0.5; beam.userData.noBounds = true;
      if (o.beam !== false) {
        const bm = addMat('lhbeam', '#fff2c8', beamTex(), 0.5);
        for (const s of [-1, 1]) {
          const cg = new THREE.CylinderGeometry(1.6, 0.18, 13, 20, 1, true);
          cg.translate(0, 6.5, 0); cg.rotateZ(-s * PI / 2); cg.rotateX(s * 0.02);
          const cm = new THREE.Mesh(cg, bm); cm.castShadow = false; cm.receiveShadow = false; cm.renderOrder = 5; cm.userData.noMerge = true; cm.name = 'beamcone';
          beam.add(cm);
        }
      }
      const halo = haloCard('#fff0c0', 2.2, 0.85); halo.name = 'halo'; beam.add(halo);
      extra.push(beam);
    }
    return B.build(extra);
  }
  def('lighthouse', {
    key: (o) => (o.lit === false ? 'off' : o.beam === false ? 'nobeam' : 'on'),
    build(o) { return buildLighthouse(o); },
    update(node, o, t) {
      const b = node.getObjectByName('beam');
      if (!b) return;
      b.rotation.y = t * 0.9;
      const dk = viewDark();
      b.traverse((n) => { if (n.name === 'beamcone') n.material.opacity = 0.04 + 0.5 * dk; });
      const h = b.getObjectByName('halo'); if (h) h.material.opacity = 0.5 + 0.4 * dk + 0.05 * sin(t * 3);
    },
    lights: (o) => (o.lit === false ? [] : [{ x: 0, y: 8.0, z: 0, color: '#fff0c0', intensity: 2.2, distance: 16, flicker: 0.03 }, { x: 0, y: 1.6, z: 1.6, color: '#ffb862', intensity: 0.8, distance: 3.5, flicker: 0.1 }]),
  });

  // ================================================================================================
  //  THATCH — layered course roofs. A "hood" roof is a stack of rounded-rectangle contours from the
  //  ridge line (v=0) to the eave (v=1); each thatch course bulges at its lower lip (sawtooth offset
  //  along the normal), with an underside shell, a thick eave band, and a ragged straw fringe.
  // ================================================================================================
  // contour point on a rounded rectangle (half sizes hx,hz, corner radius r) at segment-parameter t∈[0,1)
  // segment layout is fixed by `lay` (computed at the eave) so corners stay aligned on every level
  function rrLayout(hx, hz, r) {
    const sx = max(0, hx - r) * 2, sz = max(0, hz - r) * 2, arc = PI / 2 * r;
    const segs = [sz / 2, arc, sx, arc, sz, arc, sx, arc, sz / 2]; // start at +x mid, CCW seen from above (toward −z first)
    const tot = segs.reduce((a, b) => a + b, 0) || 1;
    const cum = [0]; for (const s of segs) cum.push(cum[cum.length - 1] + s / tot);
    return { cum, tot };
  }
  function rrPoint(lay, hx, hz, r, t) {
    r = min(r, hx, hz);
    const c = lay.cum; let k = 0; while (k < 8 && t > c[k + 1]) k++;
    const f = c[k + 1] > c[k] ? (t - c[k]) / (c[k + 1] - c[k]) : 0;
    const ax = hx - r, az = hz - r;
    switch (k) {
      case 0: return [hx, -az * f];
      case 1: { const a = f * PI / 2; return [ax + r * cos(a), -az - r * sin(a)]; }
      case 2: return [ax - 2 * ax * f, -hz];
      case 3: { const a = PI / 2 + f * PI / 2; return [-ax + r * cos(a), -az - r * sin(a)]; }
      case 4: return [-hx, -az + 2 * az * f];
      case 5: { const a = PI + f * PI / 2; return [-ax + r * cos(a), az - r * sin(a)]; }
      case 6: return [-ax + 2 * ax * f, hz];
      case 7: { const a = 1.5 * PI + f * PI / 2; return [ax + r * cos(a), az - r * sin(a)]; }
      default: return [hx, az - az * f];
    }
  }
  // spec: { RX, EX, EZ, rc, yR, yE, s(v), p(v), courses, lip, thick, nu, nv, x0, z0, tint, under, fringe:h, flare }
  function thatchHood(B, sp) {
    const nu = sp.nu || 72, nv = sp.nv || (sp.courses || 8) * 4;
    const sF = sp.s || ((v) => sin(v * PI / 2)), pF = sp.p || ((v) => 1 - cos(v * PI / 2));
    const lay = rrLayout(sp.EX, sp.EZ, sp.rc);
    const P = lay.tot, x0 = sp.x0 || 0, z0 = sp.z0 || 0, rnd = RNG(hashStr(JSON.stringify([sp.EX, sp.EZ, sp.yR])));
    const base = (u, v) => {
      const s = sF(v), hx = sp.RX + (sp.EX - sp.RX) * s, hz = max(0.0005, sp.EZ * s), r = min(sp.rc * s + 0.0004, hx, hz);
      const [x, z] = rrPoint(lay, hx, hz, r, u % 1);
      return [x + x0, sp.yR - (sp.yR - sp.yE) * pF(v), z + z0];
    };
    // slope arc length per v (for UV V in metres and course spacing)
    const NS = 64, acc = [0]; let L = 0;
    for (let i = 1; i <= NS; i++) { const a = base(0.0625, (i - 1) / NS), b = base(0.0625, i / NS); L += hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); acc.push(L); }
    const arcAt = (v) => { const f = v * NS, i = min(NS - 1, floor(f)); return lerp(acc[i], acc[i + 1], f - i); };
    const courses = sp.courses || 8, lip = sp.lip != null ? sp.lip : 0.07, thick = sp.thick || 0.22;
    const grid = gGrid(nu, nv, base, (u, v) => [u * P, (L - arcAt(v))]);
    // displace along normal: course sawtooth (lip at each course's lower edge) + lumpy noise
    const pos = grid.attributes.position, nor = grid.attributes.normal, uvA = grid.attributes.uv;
    const course = (V) => { const c = (L - V) / L * courses; return pow(c - floor(c), 1.8); };
    for (let i = 0; i < pos.count; i++) {
      const U = uvA.getX(i), V = uvA.getY(i), v = 1 - V / L;
      const edge = sstep(0, 0.06, v);
      const ua = U / P * TAU, kq = max(1, round(P * 0.5)); // periodic around the contour (no seam)
      const d = (lip * course(V) + 0.025 * sin(ua * kq + V * 1.7) * sin(ua * max(1, round(kq * 0.4)) - V * 2.3)) * edge + (sp.flare || 0) * pow(v, 4);
      pos.setXYZ(i, pos.getX(i) + nor.getX(i) * d, pos.getY(i) + nor.getY(i) * d, pos.getZ(i) + nor.getZ(i) * d);
    }
    grid.computeVertexNormals();
    { // weld normals across the u=0/u=1 seam
      const nn = grid.attributes.normal;
      for (let j = 0; j <= nv; j++) { const a = j * (nu + 1), b = a + nu; const x = nn.getX(a) + nn.getX(b), y = nn.getY(a) + nn.getY(b), z = nn.getZ(a) + nn.getZ(b), l = hypot(x, y, z) || 1; nn.setXYZ(a, x / l, y / l, z / l); nn.setXYZ(b, x / l, y / l, z / l); }
    }
    // shade under each course lip + darker toward the ridge seam
    const tint = sp.tint || '#ffffff';
    B.add(M.straw(), grid, { tint, ao: false, aofn: (x, y, z) => {
      // recover V from y is unreliable; use course phase from height fraction along the profile
      return 1;
    } });
    // per-vertex course AO baked separately (we know V per vertex in the grid → paint colours now)
    {
      const g = B.parts.get(M.straw().uuid + '+').geos.slice(-1)[0];
      const col = g.attributes.color, uv = g.attributes.uv;
      for (let i = 0; i < col.count; i++) {
        const V = uv.getY(i), c = course(V), v = 1 - V / L;
        const k = (0.62 + 0.38 * c) * (0.85 + 0.15 * sstep(0.0, 0.4, v)) * (1 + (hash2(floor(uv.getX(i) * 3), floor(V * 2), 5) - 0.5) * 0.12);
        const wth = (sp.weather || 0) * (1 - sstep(0.1, 0.7, v)); // sun-greyed upper courses
        const r0 = col.getX(i) * k, g0 = col.getY(i) * k, b0 = col.getZ(i) * k, gr = (r0 + g0 + b0) / 3 * 0.95;
        col.setXYZ(i, lerp(r0, gr, wth), lerp(g0, gr, wth), lerp(b0, gr * 1.02, wth));
      }
    }
    // underside shell
    if (sp.under !== false) {
      const und = gGrid(nu, max(6, nv >> 2), (u, v) => { const p = base(u, v); const s = sF(v); return [p[0] - (p[0] - x0) * 0.0 , p[1] - thick * (0.6 + 0.4 * s), p[2]]; }, (u, v) => [u * P, v * L], { flip: true });
      B.add(M.straw(), und, { tint: sp.underTint || '#5a4a32', ao: false });
      // eave band (outer eave contour → under contour)
      const band = gGrid(nu, 1, (u, v) => { const a = base(u, 1); return [a[0], a[1] - thick * v, a[2]]; }, (u, v) => [u * P, v * thick], { flip: true });
      // push the band outward by the lip so it meets the displaced outer surface
      const bp = band.attributes.position;
      for (let i = 0; i < bp.count; i++) { const x = bp.getX(i) - x0, z = bp.getZ(i) - z0, l = hypot(x, z) || 1; bp.setXYZ(i, bp.getX(i) + x / l * 0.02, bp.getY(i), bp.getZ(i) + z / l * 0.02); }
      band.computeVertexNormals();
      const bandTint = shade(tint === '#ffffff' ? '#d8c8a0' : tint, -0.25);
      B.add(M.straw(), band, { tint: bandTint, ao: false });
      const band2 = band.clone(); { const ix = band2.index.array; for (let i = 0; i < ix.length; i += 3) { const t0 = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t0; } band2.computeVertexNormals(); }
      B.add(M.straw(), band2, { tint: bandTint, ao: false });
    }
    // fringe: hanging straw tips around the eave
    if (sp.fringe !== 0) {
      const fh = sp.fringe || 0.16, pts = [];
      for (let i = 0; i <= nu * 2; i++) { const a = base(i / (nu * 2), 1); pts.push([a[0], a[1] + 0.04, a[2]]); }
      const nrm = (i) => { const p = pts[i]; const x = p[0] - x0, z = p[2] - z0, l = hypot(x, z) || 1; return [x / l, z / l]; };
      const fg = gStrip(pts, fh + thick * 0.4, { out: 0.03, nrm, us: 1.2 });
      B.add(M.fringe(), fg, { tint: '#ffffff', ao: false, cast: true });
    }
    return { base, L, P };
  }

  // gable thatch: ridge along x; two slopes; eaves at ±EZ; overhang beyond the gables to ±EX
  function thatchGable(B, sp) {
    const { EX, EZ, yR, yE } = sp, courses = sp.courses || 7, lip = sp.lip != null ? sp.lip : 0.06, thick = sp.thick || 0.18;
    const z0 = sp.z0 || 0, sag = sp.sag || 0.04, tint = sp.tint || '#ffffff';
    const slopeL = hypot(EZ, yR - yE);
    for (const sd of [-1, 1]) {
      const base = (u, v) => { const x = lerp(-EX, EX, u) + (sp.x0 || 0); const z = sd * EZ * v; return [x, yR - (yR - yE) * v - sag * sin(PI * v) + sd * 0, z + z0]; };
      const grid = gGrid(48, courses * 4, base, (u, v) => [u * EX * 2, (1 - v) * slopeL], { flip: sd < 0 });
      const pos = grid.attributes.position, nor = grid.attributes.normal, uvA = grid.attributes.uv;
      const course = (V) => { const c = (slopeL - V) / slopeL * courses; return pow(c - floor(c), 1.8); };
      for (let i = 0; i < pos.count; i++) {
        const U = uvA.getX(i), V = uvA.getY(i), v = 1 - V / slopeL;
        const d = (lip * course(V) + 0.02 * sin(U * 2.7 + V * 1.9) * sin(U * 1.1 - V * 2.9)) * sstep(0, 0.08, v);
        pos.setXYZ(i, pos.getX(i) + nor.getX(i) * d, pos.getY(i) + nor.getY(i) * d, pos.getZ(i) + nor.getZ(i) * d);
      }
      grid.computeVertexNormals();
      const g = B.add(M.straw(), grid, { tint, ao: false });
      const col = g.attributes.color, uv = g.attributes.uv;
      for (let i = 0; i < col.count; i++) { const V = uv.getY(i), k = (0.62 + 0.38 * course(V)) * (1 + (hash2(floor(uv.getX(i) * 3), floor(V * 2), 9) - 0.5) * 0.12); col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k); }
      // underside
      const und = gGrid(8, 4, (u, v) => { const p = base(u, v); return [p[0], p[1] - thick, p[2]]; }, (u, v) => [u * EX * 2, v * slopeL], { flip: sd > 0 });
      B.add(M.straw(), und, { tint: sp.underTint || '#5a4a32', ao: false });
      // eave band + fringe
      const band = gGrid(24, 1, (u, v) => { const p = base(u, 1); return [p[0], p[1] - thick * v + 0.02, p[2] + sd * 0.03]; }, (u, v) => [u * EX * 2, v * thick], { flip: sd > 0 });
      B.add(M.straw(), band, { tint: '#8a7650', ao: false });
      const pts = []; for (let i = 0; i <= 40; i++) { const p = base(i / 40, 1); pts.push([p[0], p[1] + 0.03, p[2] + sd * 0.01]); }
      B.add(M.fringe(), gStrip(pts, (sp.fringe || 0.14) + thick * 0.5, { out: 0.03, nrm: () => [0, sd], us: 1.2 }), { ao: false });
      // rake (gable-edge) bands
      for (const ex of [-1, 1]) {
        const rk = gGrid(1, 12, (u, v) => { const p = base(ex > 0 ? 1 : 0, v); return [p[0] + ex * 0.02, p[1] - thick * u + 0.03, p[2]]; }, (u, v) => [u * thick, v * slopeL], { flip: (ex > 0) !== (sd > 0) });
        B.add(M.straw(), rk, { tint: '#7a6644', ao: false });
      }
    }
    return { slopeL };
  }
  // ridge roll with lashings
  function ridgeRoll(B, x0, x1, y, z, r, opt = {}) {
    B.add(M.straw(), gRod([x0, y, z], [x1, y, z], r, r, 10, { us: 1, vs: 1 }), { tint: opt.tint || '#c8b07a', ao: false });
    for (const e of [x0, x1]) B.add(M.straw(), gSphere(r, { x: e, y, z, sx: 0.6 }, 10, 6), { tint: opt.tint || '#c8b07a', ao: false });
    for (let x = x0 + 0.15; x < x1 - 0.1; x += opt.step || 0.32) B.add(M.wood(), place(new THREE.TorusGeometry(r + 0.006, 0.012, 4, 12), { x, y, z, ry: PI / 2 }), { tint: '#6a5430', ao: false });
  }

  // ################################################################################################
  //  KUBA — Tsou (鄒族) men's house. Raised plank floor on many posts, open sides, a great rounded
  //  thatched hood that sweeps low, ridge roll with lashings and the sacred fiteu (金草, Dendrobium)
  //  growing on the ridge, central hearth with an ever-burning fire, log ladder at the door column.
  //  (Kept respectful: no war trophies/head baskets are depicted; the hearth and fiteu are as on the 2D art.)
  // ################################################################################################
  function doorOf2(o, w, def) { const d = o.door != null ? o.door : def; return clamp((d === false ? 0 : d) | 0, 0, w - 1); }
  function buildKuba(o) {
    const B = new Builder(), rnd = RNG(3301);
    const W = 4, H = 3, fy = 0.85, door = doorOf2(o, W, 1);
    const hx = W / 2, hz = H / 2;
    // posts under the floor (grid) + front & back roof posts
    const postT = '#9a7050';
    for (let ix = 0; ix <= 4; ix++) for (let iz = 0; iz <= 3; iz++) {
      const x = -hx + 0.22 + ix * (W - 0.44) / 4, z = -hz + 0.22 + iz * (H - 0.44) / 3;
      B.add(M.wood(), gCyl(0.075, 0.09, fy, 7, { x: x + (rnd() - 0.5) * 0.04, z }), { tint: postT, jitter: 0.2, rnd });
      B.add(M.stone(), gRock(0.13, rnd, { x, y: 0.0, z, sy: 0.6 }), { tint: '#9a968a' });
    }
    // sill beams & joists
    for (const z of [-hz + 0.22, hz - 0.22, 0]) B.add(M.wood(), gBox(W - 0.2, 0.14, 0.14, { y: fy - 0.16, z }, { grain: 'long' }), { tint: '#5e4028' });
    for (let ix = 0; ix <= 6; ix++) B.add(M.wood(), gBox(0.08, 0.08, H - 0.2, { x: -hx + 0.2 + ix * (W - 0.4) / 6, y: fy - 0.08 }, { grain: 'long' }), { tint: '#5e4028' });
    // plank floor (individual boards)
    for (let i = 0; i < 16; i++) {
      const z = -hz + 0.12 + i * (H - 0.24) / 16 + (H - 0.24) / 32;
      B.add(M.wood(), gBox(W - 0.1 + (rnd() - 0.5) * 0.06, 0.05, (H - 0.24) / 16 - 0.008, { y: fy, z }, { grain: 'long', ou: rnd() * 4 }), { tint: '#c49a70', jitter: 0.18, rnd, ao: { h: 1.05, min: 0.55 } });
    }
    // roof posts rising from the floor to the eave plate + low benches inside
    const eave = 2.25;
    for (const x of [-hx + 0.25, -hx / 3, hx / 3, hx - 0.25]) for (const z of [-hz + 0.25, hz - 0.25]) {
      B.add(M.wood(), gCyl(0.07, 0.08, eave - fy + 0.1, 7, { x, y: fy }), { tint: '#5a3c26', jitter: 0.2, rnd });
    }
    for (const z of [-hz + 0.25, hz - 0.25]) B.add(M.wood(), gRod([-hx + 0.1, eave, z], [hx - 0.1, eave, z], 0.07, 0.07, 7), { tint: '#4e3420' });
    for (const x of [-hx + 0.25, hx - 0.25]) B.add(M.wood(), gRod([x, eave, -hz + 0.2], [x, eave, hz - 0.2], 0.06, 0.06, 7), { tint: '#4e3420' });
    // central king posts to the ridge
    for (const x of [-0.9, 0.9]) B.add(M.wood(), gCyl(0.07, 0.07, 3.2 - fy, 7, { x, y: fy }), { tint: '#4e3420' });
    B.add(M.wood(), gRod([-1.4, 3.15, 0], [1.4, 3.15, 0], 0.08, 0.08, 7), { tint: '#4e3420' });
    // benches along the sides
    for (const z of [-hz + 0.45, hz - 0.45]) {
      if (z > 0) { // front bench split around the doorway
        const dx = -hx + door + 0.5;
        for (const [a, b] of [[-hx + 0.4, dx - 0.45], [dx + 0.45, hx - 0.4]]) if (b - a > 0.3) B.add(M.wood(), gBox(b - a, 0.06, 0.32, { x: (a + b) / 2, y: fy + 0.32, z }, { grain: 'long' }), { tint: '#6a4a2e' });
      } else B.add(M.wood(), gBox(W - 0.8, 0.06, 0.32, { y: fy + 0.32, z }, { grain: 'long' }), { tint: '#6a4a2e' });
    }
    // hearth: stone ring, ash bed, logs, fire (glow)
    const hy = fy + 0.05;
    B.add(M.paint(), gCyl(0.42, 0.44, 0.04, 16, { y: hy }), { tint: '#3a3028', ao: false });
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; B.add(M.stone(), gRock(0.09, rnd, { x: cos(a) * 0.44, y: hy + 0.03, z: sin(a) * 0.44 }), { tint: '#8a8070', ao: false, aofn: (x, y) => 0.6 + 0.4 * sstep(hy, hy + 0.1, y) }); }
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; B.add(M.wood(), gRod([cos(a) * 0.36, hy + 0.05, sin(a) * 0.36], [cos(a) * 0.04, hy + 0.14, sin(a) * 0.04], 0.04, 0.035, 6), { tint: '#2a1a10', ao: false }); }
    const fireM = glowM('#ff8a30', 3.0);
    B.add(fireM, gCyl(0.0, 0.16, 0.34, 7, { y: hy + 0.08 }), { ao: false, cast: false });
    B.add(glowM('#ffd27a', 4), gCyl(0.0, 0.08, 0.22, 6, { y: hy + 0.08, ry: 0.5 }), { ao: false, cast: false });
    // log ladder (notched) up to the floor at the door column
    const lx = -hx + door + 0.5, lz = hz + 0.45;
    B.add(M.wood(), gRod([lx, 0, lz + 0.25], [lx, fy + 0.05, hz - 0.05], 0.12, 0.1, 8), { tint: '#7a5a3a' });
    for (let k = 1; k <= 4; k++) { const t = k / 5; B.add(M.wood(), gBox(0.26, 0.04, 0.12, { x: lx, y: lerp(0, fy, t) + 0.08, z: lerp(lz + 0.25, hz - 0.05, t) + 0.02 }), { tint: '#5a3c24' }); }
    // ---- the hood: low sweeping thatch, rounded ends
    thatchHood(B, { RX: 1.45, EX: hx + 0.5, EZ: hz + 0.5, rc: hz + 0.2, yR: 3.45, yE: 2.1, courses: 8, lip: 0.08, thick: 0.28, fringe: 0.2, nu: 80,
      s: (v) => pow(sin(v * PI / 2), 0.8), p: (v) => pow(v, 1.5), tint: '#e6dcc4', weather: 0.35 });
    ridgeRoll(B, -1.5, 1.5, 3.46, 0, 0.11, { step: 0.36 });
    // fiteu (金草) tufts on the ridge — slim green leaves with yellow flower sprays
    for (const x of [-0.85, 0.05, 0.9]) {
      for (let k = 0; k < 7; k++) {
        const a = k / 7 * TAU + rnd(), lean = 0.35 + rnd() * 0.3, len = 0.28 + rnd() * 0.12;
        const lg = new THREE.ConeGeometry(0.014, len, 3); lg.translate(0, len / 2, 0);
        B.add(M.paint(), place(lg, { x, y: 3.58, z: 0, rx: lean * cos(a), rz: lean * sin(a), ry: a }), { tint: '#4f7a2e', ao: false });
      }
      for (let k = 0; k < 6; k++) B.add(glowM('#f2d24a', 0.25), gSphere(0.03, { x: x + (rnd() - 0.5) * 0.24, y: 3.8 + rnd() * 0.08, z: (rnd() - 0.5) * 0.24 }, 6, 4), { ao: false });
    }
    // rafters visible under the eaves
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * TAU, ex = cos(a) * (hx + 0.35), ez = sin(a) * (hz + 0.35);
      B.add(M.wood(), gRod([ex, 2.0, ez], [clamp(ex * 0.45, -1.4, 1.4), 3.15, ez * 0.08], 0.03, 0.03, 5), { tint: '#8a7448', ao: false });
    }
    return B.build();
  }
  def('kuba', {
    key: (o) => String(doorOf2(o, 4, 1)),
    build(o) { return buildKuba(o); },
    lights: () => [{ x: 0, y: 1.5, z: 0, color: '#ff9440', intensity: 1.3, distance: 6, flicker: 0.5 }],
  });

  // ================================================================================================
  //  shared small parts: paper lanterns, rack textures
  // ================================================================================================
  const tPaper = () => texSet('paper', 128, 128, (g, hg, w, h, r) => {
    g.fillStyle = '#f4ece0'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(120,80,40,0.35)'; g.fillRect(x, 0, 1.5, h); hg.fillStyle = '#c0c0c0'; hg.fillRect(x, 0, 2, h); }
    for (let i = 0; i < 300; i++) { g.fillStyle = rgba('#d8c8b0', 0.2); g.fillRect(r() * w, r() * h, 1 + r() * 3, 1); }
  }, { strength: 1.5 });
  function lanternMat(col, lit, k = 1.6) {
    const t = tPaper();
    return mat('lantern' + col + (lit ? 'L' + k : ''), () => G.R3M.env({ color: new THREE.Color(col), map: t.map, roughness: 0.7, emissive: lit ? new THREE.Color(col) : new THREE.Color(0), emissiveMap: lit ? t.map : null, emissiveIntensity: lit ? k : 0, cutout: false }));
  }
  // hanging lantern group: pivot at the hook, body below. Name given so update() can sway it.
  function lantern(name, col, r, opt = {}) {
    const g = new THREE.Group(); g.name = name;
    const cord = opt.cord != null ? opt.cord : 0.12, lit = opt.lit !== false;
    const body = gLathe([[0.001, -r * 1.25], [r * 0.55, -r * 1.15], [r * 0.95, -r * 0.6], [r, 0], [r * 0.95, r * 0.6], [r * 0.55, r * 1.15], [0.001, r * 1.25]], 14, { y: -cord - r * 1.3 }, { us: 1 / (TAU * r * 0.8), vs: 1 / (r * 2.6) });
    const bm = new THREE.Mesh(body, lanternMat(col, lit, opt.k || 1.6)); bm.castShadow = false;
    g.add(bm);
    const capM = M.paint();
    const caps = new Builder();
    caps.add(capM, gCyl(r * 0.5, r * 0.5, r * 0.18, 10, { y: -cord - r * 0.15 }), { tint: '#2a1a10', ao: false });
    caps.add(capM, gCyl(r * 0.5, r * 0.5, r * 0.18, 10, { y: -cord - r * 2.6 }), { tint: '#2a1a10', ao: false });
    caps.add(capM, gRod([0, 0, 0], [0, -cord - r * 0.1, 0], 0.006, 0.006, 3), { tint: '#2a1a10', ao: false });
    if (opt.tassel) caps.add(lanternMat('#d23a2a', false), gCyl(0.004, r * 0.25, r * 0.9, 6, { y: -cord - r * 3.5 }), { ao: false });
    const cm = caps.build(); cm.children.forEach((c) => { c.castShadow = false; });
    g.add(cm);
    if (opt.text) {
      const tx = G.R3M.tex('ac:ltext:' + opt.text, 64, 128, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#3a1008'; c.font = 'bold 40px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; [...opt.text].slice(0, 3).forEach((ch, i, a) => c.fillText(ch, w / 2, h / 2 + (i - (a.length - 1) / 2) * 42)); });
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.9, r * 1.8), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      pm.position.set(0, -cord - r * 1.3, r * 1.01); pm.renderOrder = 3;
      const pm2 = pm.clone(); pm2.position.z = -r * 1.01; pm2.rotation.y = PI;
      g.add(pm, pm2);
    }
    g.userData.noMerge = true;
    return g;
  }
  const swayAll = (node, names, t, s, amp = 0.08, f = 1.7) => { names.forEach((n, i) => { const l = node.getObjectByName(n); if (l) { l.rotation.z = sin(t * f + s + i * 1.3) * amp; l.rotation.x = sin(t * f * 0.77 + s * 1.7 + i) * amp * 0.6; } }); };

  // ################################################################################################
  //  TAO_HOUSE — Tao (達悟) vahey, the semi-subterranean main house: a cobble-walled pit, house front of
  //  planks with small low doorways, a low thatched roof whose ridge barely rises above ground level,
  //  held down by horizontal rods against typhoons; stone steps down at the door column, a backrest
  //  stone in the courtyard. Some houses (by position) also have a tagakal, the raised cool pavilion.
  //  The ground in Map3D is flat at y=0, so the pit is expressed as a raised cobble embankment.
  // ################################################################################################
  function buildTaoHouse(o, withPav) {
    const B = new Builder(), rnd = RNG(5151 + (withPav ? 7 : 0));
    const hx = 2, hz = 1.5, door = doorOf2(o, 4, 1), rimY = 0.8;
    const dX = -hx + door + 0.5;
    // pit floor: flat pebble paving
    B.add(M.cobble(), place(new THREE.PlaneGeometry(3.3, 2.5).rotateX(-PI / 2), { y: 0.015, z: 0.05 }), { tint: '#b8b4aa', ao: false, aofn: (x, y, z) => 0.6 + 0.4 * sstep(-hz + 0.5, -hz + 1.6, z) * sstep(hx - 0.2, hx - 1.0, abs(x)) });
    // retaining walls: back + sides (inner face cobble, top rim stones, outer earth slope with cobbles)
    const wallSeg = (x0, z0, x1, z1, h, outDir) => {
      const L = hypot(x1 - x0, z1 - z0), a = atan2(z1 - z0, x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      B.add(M.cobble(), gBox(L, h, 0.42, { x: cx + outDir[0] * 0.21, z: cz + outDir[1] * 0.21, ry: -a }, { ou: rnd() * 3 }), { tint: '#c8c6c0', ao: { h: h, min: 0.45 } });
      // sloped outer embankment
      const sl = gBox(L + 0.3, h * 0.92, 0.6, { x: cx + outDir[0] * 0.62, z: cz + outDir[1] * 0.62, ry: -a }, { ou: rnd() * 3 });
      const sp = sl.attributes.position; // taper top outward edge down (berm)
      for (let i = 0; i < sp.count; i++) { if (sp.getY(i) > 0.1) { const lx = sp.getX(i) - cx - outDir[0] * 0.62, lz = sp.getZ(i) - cz - outDir[1] * 0.62; if (lx * outDir[0] + lz * outDir[1] > 0.1) sp.setY(i, h * 0.2); } }
      sl.computeVertexNormals();
      B.add(M.cobble(), triUV(sl, 1), { tint: '#a8a49a', ao: { h: h, min: 0.55 } });
      // rim cobbles along the top
      const n = floor(L / 0.26);
      for (let i = 0; i <= n; i++) { const t = i / max(1, n); B.add(M.stone(), gRock(0.13 + rnd() * 0.05, rnd, { x: lerp(x0, x1, t) + outDir[0] * (0.2 + rnd() * 0.12), y: h - 0.02, z: lerp(z0, z1, t) + outDir[1] * (0.2 + rnd() * 0.12) }), { tint: '#c4c2bb', jitter: 0.25, rnd, ao: false, aofn: (x, y) => 0.75 + 0.25 * sstep(h - 0.1, h + 0.1, y) }); }
    };
    wallSeg(-hx + 0.42, -hz + 0.42, hx - 0.42, -hz + 0.42, rimY, [0, -1]);
    wallSeg(-hx + 0.42, -hz + 0.42, -hx + 0.42, hz - 0.3, rimY, [-1, 0]);
    wallSeg(hx - 0.42, -hz + 0.42, hx - 0.42, hz - 0.3, rimY, [1, 0]);
    // front rim (low) with a gap and steps at the door column
    const fz = hz - 0.2, fh = 0.38;
    for (const [a, b] of [[-hx + 0.1, dX - 0.38], [dX + 0.38, hx - 0.1]]) if (b - a > 0.2) {
      B.add(M.cobble(), gBox(b - a, fh, 0.36, { x: (a + b) / 2, z: fz }, { ou: rnd() * 3 }), { tint: '#c0beb6', ao: { h: fh, min: 0.5 } });
      for (let x = a + 0.12; x < b; x += 0.24) B.add(M.stone(), gRock(0.12, rnd, { x, y: fh - 0.03, z: fz + (rnd() - 0.5) * 0.1 }), { tint: '#cac8c0', jitter: 0.25, rnd, ao: false });
    }
    for (let i = 0; i < 3; i++) B.add(M.stone(), gBox(0.7, 0.13, 0.26, { x: dX, y: 0, z: fz + 0.36 - i * 0.24, sy: (i + 1) }), { tint: '#bcb8ae', ao: { h: 0.4, min: 0.6 } });
    // corner fills of the rim
    for (const sx of [-1, 1]) B.add(M.cobble(), gBox(0.42, fh + 0.1, 0.6, { x: sx * (hx - 0.21), z: hz - 0.3 }), { tint: '#b8b6ae' });
    // ---- vahey front: plank wall with three small low doorways, sill & lintel
    const wz = -0.32, wx = 1.32, wh = 0.98;
    for (let i = 0; i < 12; i++) {
      const x0 = -wx + i * (2 * wx / 12), x1 = x0 + 2 * wx / 12;
      const dc = [-0.88, 0, 0.88].some((d) => abs((x0 + x1) / 2 - d) < 0.2);
      if (dc) { B.add(M.wood(), gBox(x1 - x0 - 0.01, 0.2, 0.06, { x: (x0 + x1) / 2, y: wh - 0.2, z: wz }), { tint: '#6a4a32' }); B.add(M.wood(), gBox(x1 - x0 - 0.01, 0.12, 0.06, { x: (x0 + x1) / 2, y: 0, z: wz }), { tint: '#6a4a32' }); continue; }
      B.add(M.wood(), gBox(x1 - x0 - 0.008, wh, 0.07, { x: (x0 + x1) / 2, z: wz }, { grain: 'long', ou: rnd() * 3 }), { tint: '#8a6040', jitter: 0.2, rnd });
    }
    for (const d of [-0.88, 0, 0.88]) {
      B.add(M.wood(), gBox(0.38, wh - 0.3, 0.02, { x: d, y: 0.12, z: wz - 0.05 }), { tint: '#0c0806', ao: false });
      for (const s of [-1, 1]) B.add(M.wood(), gBox(0.06, wh, 0.1, { x: d + s * 0.22, z: wz + 0.01 }), { tint: '#5a3e28' });
    }
    B.add(M.wood(), gBox(2 * wx + 0.2, 0.08, 0.12, { y: wh - 0.04, z: wz }, { grain: 'long' }), { tint: '#4e3420' });
    // inner side walls of the house (hidden mostly by roof) and the back mass
    B.add(M.wood(), gBox(2 * wx, wh, 0.9, { z: wz - 0.5 }), { tint: '#4a3424', ao: false });
    // ---- low thatched roof: ridge barely above the rim
    thatchHood(B, { RX: 0.95, EX: 1.78, EZ: 0.98, rc: 0.55, yR: 1.62, yE: 0.86, z0: -0.72, courses: 6, lip: 0.06, thick: 0.18, fringe: 0.1, nu: 64,
      s: (v) => pow(v, 0.75), p: (v) => pow(v, 1.25), tint: '#ede4cc', weather: 0.45 });
    ridgeRoll(B, -1.0, 1.0, 1.66, -0.72, 0.08, { step: 0.4, tint: '#a08a5a' });
    // typhoon binding rods across the thatch (bamboo poles following the roof curve) + stone weights
    for (const f of [0.35, 0.68]) {
      const pts = []; for (let i = 0; i <= 10; i++) { const x = lerp(-1.42, 1.42, i / 10); const zz = -0.72 + 0.98 * pow(f, 0.75) * 1.02; const y = 1.62 - (1.62 - 0.86) * pow(f, 1.25) + 0.07 - 0.25 * pow(abs(x) / 1.42, 6); pts.push([x, y, zz]); }
      B.add(M.wood(), gTube(pts, 0.025, 20, 5), { tint: '#7a6a44', ao: false });
    }
    // backrest stone + pebbles in the courtyard
    B.add(M.stone(), gBox(0.18, 0.7, 0.14, { x: 1.25, z: 0.55, rz: 0.06 }), { tint: '#9a9e9e' });
    for (let i = 0; i < 6; i++) B.add(M.stone(), gRock(0.05 + rnd() * 0.04, rnd, { x: (rnd() - 0.5) * 2.6, y: 0.02, z: 0.2 + rnd() * 0.8 }), { tint: '#b0aca4', ao: false });
    // optional tagakal (raised cool pavilion) at the front-right corner
    if (withPav) {
      const px = 1.45, pz = 0.95, py = 1.25;
      for (const [x, z] of [[-0.42, -0.36], [0.42, -0.36], [-0.42, 0.36], [0.42, 0.36]]) B.add(M.wood(), gCyl(0.05, 0.06, py + 0.95, 6, { x: px + x, z: pz + z }), { tint: '#6a4a30' });
      for (let i = 0; i < 8; i++) B.add(M.wood(), gBox(1.0, 0.05, 0.1, { x: px, y: py, z: pz - 0.38 + i * 0.108 }, { grain: 'long' }), { tint: '#9a7452', jitter: 0.2, rnd });
      B.add(M.wood(), gBox(1.0, 0.1, 0.1, { x: px, y: py - 0.12, z: pz - 0.36 }), { tint: '#5a3e28' });
      B.add(M.wood(), gBox(1.0, 0.1, 0.1, { x: px, y: py - 0.12, z: pz + 0.36 }), { tint: '#5a3e28' });
      thatchGable(B, { EX: 0.6, EZ: 0.52, yR: py + 1.2, yE: py + 0.8, z0: pz, courses: 3, lip: 0.04, thick: 0.1, fringe: 0.08, tint: '#efe6ce', x0: px });
    }
    return B.build();
  }
  const taoPav = (o) => (o.pavilion != null ? !!o.pavilion : hash2(o.x | 0, o.y | 0, 31) < 0.5);
  def('tao_house', {
    key: (o) => doorOf2(o, 4, 1) + (taoPav(o) ? 'p' : ''),
    build(o) { return buildTaoHouse(o, taoPav(o)); },
  });

  // ################################################################################################
  //  C10_AMIS_HOUSE — Amis (阿美族) thatched long house: raised plank floor, split-bamboo walls with
  //  rattan binding bands, a deep-eaved gabled thatch roof over a front porch with posts, barred windows.
  //  o.big (age-grade house) adds a carved & painted front board. Footprint w×3 (o.w), door o.door.
  // ################################################################################################
  function buildAmis(o) {
    const B = new Builder(), w = o.w || 5, rnd = RNG(6060 + w);
    const door = o.door == null ? 2 : clamp(o.door | 0, 0, w - 1), big = !!o.big;
    const hx = w / 2, hz = 1.5, fy = 0.38, wallZ0 = -1.25, wallZ1 = 0.55, wTop = 2.05;
    // floor platform on short posts + stone footings
    for (let i = 0; i <= w * 2; i++) for (const z of [-1.3, -0.4, 0.5, 1.3]) {
      const x = -hx + 0.15 + i * (2 * hx - 0.3) / (w * 2);
      B.add(M.wood(), gCyl(0.06, 0.07, fy, 6, { x, z }), { tint: '#6a4a30' });
    }
    for (let i = 0; i < 22; i++) {
      const z = -1.42 + i * (2.84 / 22) + 0.064;
      B.add(M.wood(), gRod([-hx + 0.08, fy + 0.035, z], [hx - 0.08, fy + 0.035, z], 0.06, 0.06, 6), { tint: '#b8a06a', jitter: 0.25, rnd, ao: { h: 0.6, min: 0.55 } });
    }
    // walls: split-bamboo panels framed by posts; rattan binding bands
    const wallH = wTop - fy;
    const panel = (x0, x1, z, rot) => {
      const g = gBox(x1 - x0, wallH, 0.06, { x: (x0 + x1) / 2, y: fy, z, ry: rot || 0 });
      B.add(M.bwall(), g, { tint: '#ffffff', ao: { h: 1.4, min: 0.5, y0: fy } });
    };
    const dx0 = -hx + door + 0.2, dx1 = -hx + door + 0.8;
    // front wall with door gap and window openings (window = darker recessed panel + bamboo bars)
    panel(-hx + 0.25, dx0, wallZ1); panel(dx1, hx - 0.25, wallZ1);
    B.add(M.bwall(), gBox(dx1 - dx0, 0.3, 0.06, { x: (dx0 + dx1) / 2, y: wTop - 0.3, z: wallZ1 }), { tint: '#e8e0cc' });
    B.add(M.wood(), gBox(dx1 - dx0, wallH - 0.3, 0.02, { x: (dx0 + dx1) / 2, y: fy, z: wallZ1 - 0.25 }), { tint: '#1a120c', ao: false });
    for (let i = 0; i < w; i++) {
      if (i === door || i === 0 || i === w - 1) continue;
      const wx = -hx + i + 0.5;
      B.add(M.wood(), gBox(0.48, 0.34, 0.02, { x: wx, y: fy + 0.82, z: wallZ1 + 0.035 }), { tint: '#1e140c', ao: false });
      for (let k = 0; k < 5; k++) B.add(M.wood(), gRod([wx - 0.2 + k * 0.1, fy + 0.8, wallZ1 + 0.06], [wx - 0.2 + k * 0.1, fy + 1.18, wallZ1 + 0.06], 0.014, 0.014, 4), { tint: '#9a7c44', ao: false });
      B.add(M.wood(), gBox(0.58, 0.05, 0.08, { x: wx, y: fy + 0.78, z: wallZ1 + 0.05 }), { tint: '#5a3e24' });
    }
    panel(-hx + 0.25, hx - 0.25, wallZ0);
    for (const sx of [-1, 1]) B.add(M.bwall(), gBox(wallZ1 - wallZ0, wallH, 0.06, { x: sx * (hx - 0.25), y: fy, z: (wallZ0 + wallZ1) / 2, ry: PI / 2 }), { tint: '#ffffff', ao: { h: 1.4, min: 0.5, y0: fy } });
    // rattan bands
    for (const by of [fy + 0.25, wTop - 0.3]) {
      for (const z of [wallZ0 - 0.04, wallZ1 + 0.04]) B.add(M.wood(), gRod([-hx + 0.22, by, z], [hx - 0.22, by, z], 0.022, 0.022, 4, { us: 2 }), { tint: '#6a4a26', ao: false });
      for (const sx of [-1, 1]) B.add(M.wood(), gRod([sx * (hx - 0.21), by, wallZ0], [sx * (hx - 0.21), by, wallZ1], 0.022, 0.022, 4), { tint: '#6a4a26', ao: false });
    }
    // corner & porch posts, eave plates
    for (const x of [-hx + 0.25, hx - 0.25]) for (const z of [wallZ0, wallZ1]) B.add(M.wood(), gCyl(0.08, 0.09, wTop - fy + 0.15, 7, { x, y: fy, z }), { tint: '#6a4a2a' });
    for (let i = 0; i <= w; i++) { const x = clamp(-hx + i, -hx + 0.15, hx - 0.15); B.add(M.wood(), gCyl(0.07, 0.085, wTop + 0.05, 7, { x, z: hz - 0.12 }), { tint: '#7a5634', jitter: 0.2, rnd }); }
    B.add(M.wood(), gRod([-hx, wTop + 0.05, hz - 0.12], [hx, wTop + 0.05, hz - 0.12], 0.08, 0.08, 7), { tint: '#5a3e22' });
    B.add(M.wood(), gRod([-hx, wTop + 0.05, -1.35], [hx, wTop + 0.05, -1.35], 0.08, 0.08, 7), { tint: '#5a3e22' });
    // interior glow at the doorway + a hearth hint
    B.add(glowM('#ff9a50', 0.35), gBox(0.3, 0.12, 0.02, { x: (dx0 + dx1) / 2, y: fy + 0.02, z: wallZ1 - 0.22 }), { ao: false, cast: false });
    // ---- gabled thatch with deep eaves over the porch
    const yR = big ? 3.95 : 3.6;
    thatchGable(B, { EX: hx + 0.35, EZ: hz + 0.38, yR, yE: wTop + 0.1, courses: big ? 8 : 7, lip: 0.07, thick: 0.2, fringe: 0.16, sag: 0.06, tint: '#efe4c6' });
    ridgeRoll(B, -hx - 0.3, hx + 0.3, yR + 0.02, 0, 0.075, { step: 0.6, tint: '#b09468' });
    // gable triangles (bamboo infill) at both ends
    for (const sx of [-1, 1]) {
      const tri = new THREE.BufferGeometry();
      const yb = wTop + 0.05, x = sx * (hx - 0.2);
      tri.setAttribute('position', new THREE.Float32BufferAttribute([x, yb, -hz + 0.1, x, yb, hz - 0.1, x, yR - 0.15, 0], 3));
      tri.setAttribute('uv', new THREE.Float32BufferAttribute([-1.4, 0, 1.4, 0, 0, yR - yb], 2));
      if (sx < 0) tri.setIndex([0, 1, 2]); else tri.setIndex([0, 2, 1]);
      tri.computeVertexNormals();
      B.add(M.bwall(), tri, { tint: '#d8c8a0', ao: false });
    }
    if (big) { // age-grade house: carved & painted front board under the eave
      const bt = G.R3M.tex('ac:amisboard', 512, 128, (g, W, H) => {
        g.fillStyle = '#3a2614'; g.fillRect(0, 0, W, H);
        for (let k = 0; k < 14; k++) { const x = 20 + k * 34; g.fillStyle = k % 2 ? '#f0e6d0' : '#c8402a'; poly(g, [x, H - 22, x + 17, 22, x + 34, H - 22]); g.fill(); }
        g.fillStyle = '#e8b040'; g.fillRect(0, 8, W, 6); g.fillRect(0, H - 14, W, 6);
      });
      const bm = mat('amisboard', () => G.R3M.env({ map: bt, roughness: 0.7, vertexColors: true }));
      B.add(bm, place(new THREE.PlaneGeometry(2.2, 0.55), { y: wTop + 0.62, z: hz + 0.08 }), { ao: false });
      B.add(M.wood(), gBox(2.3, 0.06, 0.08, { y: wTop + 0.32, z: hz + 0.07 }), { tint: '#3a2614' });
    }
    return B.build();
  }
  def('c10_amis_house', {
    key: (o) => (o.w || 5) + ':' + (o.door == null ? 2 : o.door) + (o.big ? 'b' : ''),
    build(o) { return buildAmis(o); },
    lights: (o) => { const w = o.w || 5, d = o.door == null ? 2 : o.door; return [{ x: -w / 2 + d + 0.5, y: 0.9, z: 0.4, color: '#ffae5a', intensity: 1, distance: 4.5, flicker: 0.3 }]; },
  });

  // ################################################################################################
  //  BUNUN_HOUSE — Bunun (布農族) slate house: dry-stacked slate walls with big corner stones, timber
  //  door frame and heavy lintel, small windows, a roof of overlapping slate slabs with ridge capstones.
  // ################################################################################################
  function buildBunun(o) {
    const B = new Builder(), rnd = RNG(7171), door = doorOf2(o, 4, 1);
    const hx = 2, hz = 1.5, wt = 0.34, wH = 1.75, dX = -hx + door + 0.5;
    const wallUV = (g) => g;
    // walls (front split around the door, windows as recessed openings)
    const wall = (x, z, w, d, ry = 0) => B.add(M.slateWall(), gBox(w, wH, d, { x, z, ry }, { ou: rnd() * 4, ov: rnd() * 4 }), { tint: '#e8eaec', ao: { h: 0.9, min: 0.55 } });
    wall(0, -hz + wt / 2, 2 * hx, wt);
    for (const sx of [-1, 1]) wall(sx * (hx - wt / 2), 0, wt, 2 * hz - 2 * wt + 0.01);
    const fz = hz - wt / 2;
    if (dX - 0.42 > -hx) wall((-hx + dX - 0.42) / 2, fz, dX - 0.42 + hx, wt);
    if (hx > dX + 0.42) wall((dX + 0.42 + hx) / 2, fz, hx - dX - 0.42, wt);
    B.add(M.slateWall(), gBox(0.84, wH - 1.45, wt, { x: dX, y: 1.45, z: fz }), { tint: '#e8eaec' });
    // big corner stones (protruding)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let k = 0; k < 6; k++) {
      const y = k * 0.29, long = k % 2 === 0;
      B.add(M.slate(), gBox(long ? 0.62 : 0.38, 0.26, long ? 0.38 : 0.62, { x: sx * (hx - (long ? 0.28 : 0.17)), y, z: sz * (hz - (long ? 0.17 : 0.28)), ry: (rnd() - 0.5) * 0.06 }), { tint: '#9aa0a6', jitter: 0.25, rnd, ao: { h: 0.9, min: 0.6 } });
    }
    // jutting slabs for relief along the courses
    for (let i = 0; i < 46; i++) {
      const side = floor(rnd() * 4), y = 0.1 + rnd() * (wH - 0.3), t = rnd();
      let x, z, ry = 0;
      if (side === 0) { x = lerp(-hx + 0.6, hx - 0.6, t); z = -hz - 0.01; } else if (side === 1) { x = lerp(-hx + 0.6, hx - 0.6, t); z = hz + 0.01; if (abs(x - dX) < 0.6) continue; } else { x = (side === 2 ? -1 : 1) * (hx + 0.01); z = lerp(-hz + 0.6, hz - 0.6, t); ry = PI / 2; }
      B.add(M.slate(), gBox(0.25 + rnd() * 0.3, 0.035 + rnd() * 0.03, 0.08, { x, y, z, ry }), { tint: '#8a9096', jitter: 0.3, rnd, ao: false });
    }
    // door: posts, heavy lintel, dark opening with plank door ajar, sill stone
    for (const s of [-1, 1]) B.add(M.wood(), gBox(0.12, 1.45, wt + 0.06, { x: dX + s * 0.36, z: fz }), { tint: '#7a5a3c' });
    B.add(M.wood(), gBox(1.1, 0.2, wt + 0.12, { x: dX, y: 1.43, z: fz }, { grain: 'long' }), { tint: '#6a4a2c' });
    B.add(M.paint(), gBox(0.6, 1.42, 0.02, { x: dX, z: fz - 0.12 }), { tint: '#120c08', ao: false });
    B.add(M.wood(), gBox(0.3, 1.38, 0.05, { x: dX - 0.36, z: fz + 0.1, ry: -1.1 }), { tint: '#6a4a30' });
    B.add(M.slate(), gBox(0.9, 0.08, 0.5, { x: dX, z: fz + 0.18 }), { tint: '#8a9096' });
    B.add(glowM('#ff8a3a', 0.25), gBox(0.4, 0.1, 0.02, { x: dX, y: 0.02, z: fz - 0.1 }), { ao: false, cast: false });
    // small windows with wooden frames
    for (const wx of [-hx + 0.55, hx - 0.55]) {
      if (abs(wx - dX) < 0.7) continue;
      B.add(M.wood(), gBox(0.44, 0.36, 0.06, { x: wx, y: 0.85, z: hz + 0.005 }), { tint: '#4a3220' });
      B.add(M.paint(), gBox(0.3, 0.24, 0.02, { x: wx, y: 0.91, z: hz + 0.035 }), { tint: '#120c08', ao: false });
    }
    // eave beam, roof deck
    const yE = wH + 0.06, yR = 2.95, EZ = hz + 0.3, EX = hx + 0.25;
    for (const z of [-hz + 0.1, hz - 0.1]) B.add(M.wood(), gBox(2 * hx + 0.3, 0.14, 0.18, { y: wH - 0.04, z }, { grain: 'long' }), { tint: '#5a3e26' });
    const slope = atan2(yR - yE, EZ), SL = hypot(EZ, yR - yE);
    for (const sd of [-1, 1]) {
      B.add(M.wood(), gBox(2 * EX, 0.05, SL, { y: (yE + yR) / 2 - 0.08, z: sd * EZ / 2, rx: sd * slope }), { tint: '#2a2622', ao: false });
      // overlapping slate slabs, eave → ridge
      const rows = 8;
      for (let r = 0; r < rows; r++) {
        const tt = (r + 0.5) / rows, d = SL * (1 - tt);
        const cy = yR - (yR - yE) * (1 - tt) + 0.02 + r * 0.004, cz = sd * EZ * (1 - tt);
        let x = -EX - rnd() * 0.3;
        while (x < EX) {
          const sw = 0.32 + rnd() * 0.3, xc = clamp(x + sw / 2, -EX + sw / 2 - 0.05, EX - sw / 2 + 0.05);
          const len = SL / rows + 0.18;
          B.add(M.slate(), gBox(sw - 0.02, 0.04 + rnd() * 0.02, len, { x: xc, y: cy - 0.02, z: cz, rx: sd * slope + (rnd() - 0.5) * 0.05, ry: (rnd() - 0.5) * 0.06, rz: (rnd() - 0.5) * 0.04, order: 'YXZ' }, { ou: rnd() * 5, ov: rnd() * 5 }),
            { tint: rnd() < 0.15 ? '#b4aea6' : '#c2c8ce', jitter: 0.3, rnd, ao: false, aofn: (x2, y2) => 0.7 + 0.3 * sstep(yE - 0.1, yR, y2) });
          x += sw - 0.03;
        }
        void d;
      }
    }
    // ridge capstones
    for (let x = -EX + 0.15; x < EX; x += 0.45) B.add(M.slate(), gBox(0.44, 0.07, 0.42, { x: x + 0.2, y: yR + 0.02 }), { tint: '#9aa0a6', jitter: 0.3, rnd, ao: false });
    // gable triangles (stacked slate)
    for (const sx of [-1, 1]) {
      const tri = new THREE.BufferGeometry(), x = sx * (hx - 0.01);
      tri.setAttribute('position', new THREE.Float32BufferAttribute([x, wH, -hz, x, wH, hz, x, yR - 0.02, 0], 3));
      tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, wH, 3, wH, 1.5, yR], 2));
      tri.setIndex(sx < 0 ? [0, 1, 2] : [0, 2, 1]); tri.computeVertexNormals();
      B.add(M.slateWall(), tri, { tint: '#d8dade', ao: false });
    }
    void wallUV;
    return B.build();
  }
  def('bunun_house', {
    key: (o) => String(doorOf2(o, 4, 1)),
    build(o) { return buildBunun(o); },
    lights: (o) => [{ x: -2 + doorOf2(o, 4, 1) + 0.5, y: 0.6, z: 1.1, color: '#ff8a3a', intensity: 0.9, distance: 3, flicker: 0.45 }],
  });

  // ################################################################################################
  //  MILLET_RACK — millet (小米) drying frame: forked posts, two cross poles hung with bound sheaves of
  //  golden / orange / red millet. Sheaves sway in update().
  // ################################################################################################
  const tMillet = () => texSet('millet', 128, 128, (g, hg, w, h, r) => {
    g.fillStyle = '#c89a38'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { const x = r() * w, y = r() * h; wrap(w, h, x, y, 3, (X, Y) => { g.fillStyle = rgba(r() < 0.5 ? '#f0d070' : '#9a6a1c', 0.7); ell(g, X, Y, 1.6, 1.3); g.fill(); hg.fillStyle = '#e0e0e0'; ell(hg, X, Y, 1.4, 1.2); hg.fill(); }); }
  }, { strength: 3 });
  function sheaf(B, x, y, z, len, tone, rnd) {
    const mm = mat('millet', () => { const t = tMillet(); return G.R3M.env({ map: t.map, normalMap: t.normalMap, roughness: 0.85, vertexColors: true }); });
    for (let k = 0; k < 5; k++) {
      const ox = (k - 2) * 0.026 + (rnd() - 0.5) * 0.01, oz = (rnd() - 0.5) * 0.04, l = len * (0.8 + rnd() * 0.3);
      B.add(M.straw(), gRod([x + ox * 0.3, y, z + oz * 0.3], [x + ox, y - 0.1, z + oz], 0.006, 0.006, 3), { tint: '#8a7a3a', ao: false });
      const head = place(new THREE.IcosahedronGeometry(0.03, 0), { x: x + ox, y: y - 0.1 - l / 2, z: z + oz, sy: l / 0.06 }); scaleUV(head, 1, 1);
      B.add(mm, head, { tint: shade(tone, (rnd() - 0.5) * 0.25), ao: false, aofn: (x2, y2) => 0.75 + 0.25 * sstep(y - 0.1 - l, y - 0.1, y2) });
    }
    B.add(M.wood(), gCyl(0.03, 0.03, 0.03, 8, { x, y: y - 0.06, z }), { tint: '#c23a2a', ao: false });
  }
  function buildMilletRack() {
    const B = new Builder(), rnd = RNG(1234);
    for (const x of [-0.82, 0.82]) {
      B.add(M.wood(), gCyl(0.05, 0.065, 1.95, 7, { x }), { tint: '#8a6444' });
      B.add(M.wood(), gRod([x, 1.9, 0], [x - 0.08, 2.08, 0], 0.035, 0.025, 5), { tint: '#8a6444' });
      B.add(M.wood(), gRod([x, 1.9, 0], [x + 0.08, 2.08, 0], 0.035, 0.025, 5), { tint: '#8a6444' });
      B.add(M.stone(), gRock(0.12, rnd, { x, y: 0.02 }), { tint: '#9a968a' });
    }
    const out = [];
    [1.92, 1.22].forEach((by, row) => {
      B.add(M.wood(), gRod([-0.98, by, 0], [0.98, by, 0], 0.035, 0.035, 7), { tint: '#9a7650' });
      for (const x of [-0.82, 0.82]) B.add(M.wood(), place(new THREE.TorusGeometry(0.06, 0.012, 4, 10), { x, y: by }), { tint: '#7a6040', ao: false });
      const S = new Builder();
      for (let i = 0; i < 6; i++) sheaf(S, -0.66 + i * 0.264, 0, 0, 0.36 + rnd() * 0.08, rnd.pick(row ? ['#d8a838', '#e0b84a', '#c88a2a', '#d0a040'] : ['#d8a838', '#e0b84a', '#c88a2a', '#b85a2a']), rnd);
      const sg = S.build(); sg.name = 'sheaves' + row; sg.position.y = by - 0.03; sg.userData.noMerge = true;
      out.push(sg);
    });
    return B.build(out);
  }
  def('millet_rack', {
    build() { return buildMilletRack(); },
    update(node, o, t) { const s = seedOf(o); for (let r = 0; r < 2; r++) { const g = node.getObjectByName('sheaves' + r); if (g) g.rotation.x = sin(t * 1.4 + s + r * 1.1) * 0.06; } },
  });

  // ################################################################################################
  //  C10_FISH_RACK — Tao flying-fish (飛魚) drying rack: bamboo frame with split fish in two rows.
  // ################################################################################################
  const tFish = () => G.R3M.tex('ac:fish', 128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    // butterflied flying fish, head at top: silver-blue flesh, dark back edges, long pectoral fins
    const body = () => { g.beginPath(); g.moveTo(64, 8); g.quadraticCurveTo(108, 40, 92, 170); g.lineTo(112, 248); g.lineTo(64, 214); g.lineTo(16, 248); g.lineTo(36, 170); g.quadraticCurveTo(20, 40, 64, 8); g.closePath(); };
    g.fillStyle = 'rgba(160,190,215,0.85)';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(64 + s * 22, 60); g.lineTo(64 + s * 62, 150); g.lineTo(64 + s * 60, 168); g.lineTo(64 + s * 22, 110); g.closePath(); g.fill(); }
    const gr = g.createLinearGradient(16, 0, 112, 0); gr.addColorStop(0, '#3e5770'); gr.addColorStop(0.18, '#6f8fae'); gr.addColorStop(0.5, '#dfe8ee'); gr.addColorStop(0.82, '#6f8fae'); gr.addColorStop(1, '#3e5770');
    body(); g.fillStyle = gr; g.fill(); g.strokeStyle = '#2e4258'; g.lineWidth = 3; g.stroke();
    g.fillStyle = 'rgba(190,110,80,0.55)'; g.fillRect(58, 30, 12, 130);
    for (let y = 40; y < 160; y += 10) { g.strokeStyle = 'rgba(120,140,160,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(40, y); g.quadraticCurveTo(64, y + 6, 88, y); g.stroke(); }
    g.fillStyle = '#1a1a1a'; ell(g, 52, 26, 4, 4); g.fill(); ell(g, 76, 26, 4, 4); g.fill();
  });
  function fishGeo(x, y, z, len) {
    const g = new THREE.PlaneGeometry(len * 0.5, len, 2, 4);
    g.translate(0, -len / 2, 0);
    // slight cupping
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, abs(p.getX(i)) * 0.25);
    g.computeVertexNormals();
    return place(g, { x, y, z });
  }
  function buildFishRack() {
    const B = new Builder(), rnd = RNG(808);
    for (const x of [-0.9, 0.9]) { B.add(M.bamboo(), gCyl(0.035, 0.04, 2.0, 7, { x }), { tint: '#c8b070' }); B.add(M.stone(), gRock(0.1, rnd, { x, y: 0.02 }), { tint: '#8a8478' }); }
    for (const x of [-0.9, 0.9]) for (const s of [-1, 1]) B.add(M.bamboo(), gRod([x, 1.4, 0], [x + s * 0.12, 0, s * 0.35], 0.025, 0.025, 5), { tint: '#b8a060' });
    const fm = mat('fish', () => G.R3M.env({ map: tFish(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.15, vertexColors: true }));
    const out = [];
    [1.85, 1.15].forEach((by, row) => {
      B.add(M.bamboo(), gRod([-1.0, by, 0], [1.0, by, 0], 0.03, 0.03, 6), { tint: '#c0a868' });
      const S = new Builder();
      for (let i = 0; i < 7; i++) {
        const x = -0.72 + i * 0.24 + (row ? 0.08 : 0); if (x > 0.82) continue;
        S.add(M.wood(), gRod([x, 0, 0], [x, -0.05, 0], 0.004, 0.004, 3), { tint: '#6a5a3a', ao: false });
        S.add(fm, fishGeo(x, -0.05, (rnd() - 0.5) * 0.02, 0.42 + rnd() * 0.06), { ao: false, aofn: (x2, y2, z2) => 0.85 + 0.15 * (1 + y2) });
      }
      const sg = S.build(); sg.name = 'fish' + row; sg.position.y = by; sg.userData.noMerge = true;
      out.push(sg);
    });
    return B.build(out);
  }
  def('c10_fish_rack', {
    build() { return buildFishRack(); },
    update(node, o, t) { const s = seedOf(o); for (let r = 0; r < 2; r++) { const g = node.getObjectByName('fish' + r); if (g) g.rotation.x = sin(t * 2.1 + s + r * 0.9) * 0.08; } },
  });

  // ################################################################################################
  //  DRYING_RACK — v0 米粉 rice-noodle cakes on a tilted bamboo screen (新竹); v1 柿餅 persimmons on
  //  round bamboo trays in a tiered stand.
  // ################################################################################################
  const tNoodle = () => texSet('noodle', 128, 128, (g, hg, w, h, r) => {
    g.fillStyle = '#f4f0e4'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { g.strokeStyle = rgba(r() < 0.5 ? '#d8d0bc' : '#ffffff', 0.8); g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 4) g.lineTo(x, y + sin(x * 0.4 + y) * 1.2); g.stroke(); hg.strokeStyle = r() < 0.5 ? '#ffffff' : '#808080'; hg.lineWidth = 1.5; hg.beginPath(); hg.moveTo(0, y); for (let x = 0; x <= w; x += 4) hg.lineTo(x, y + sin(x * 0.4 + y) * 1.2); hg.stroke(); }
  }, { strength: 2 });
  function buildDryingRack(v) {
    const B = new Builder(), rnd = RNG(4545 + v);
    if (v === 0) {
      // tilted screen facing south (the sun), on four bamboo legs
      const tilt = 0.55, sw = 1.9, sh = 1.2, cy = 1.05;
      for (const x of [-0.85, 0.85]) {
        B.add(M.bamboo(), gRod([x, 0, -0.45], [x, cy + sh / 2 * sin(tilt) + 0.05, -0.45 + 0.08], 0.03, 0.03, 6), { tint: '#c8b070' });
        B.add(M.bamboo(), gRod([x, 0, 0.45], [x, cy - sh / 2 * sin(tilt), 0.42], 0.03, 0.03, 6), { tint: '#c8b070' });
      }
      const scr = gBox(sw, 0.025, sh, { y: cy, rx: tilt }, {}); triUV(scr, 1.5);
      B.add(M.mat(), scr, { tint: '#d8c088', ao: false });
      for (const s of [-1, 1]) B.add(M.bamboo(), gRod([-1.0, cy + s * sh / 2 * sin(tilt), -s * sh / 2 * cos(tilt)], [1.0, cy + s * sh / 2 * sin(tilt), -s * sh / 2 * cos(tilt)], 0.03, 0.03, 6), { tint: '#b8a060' });
      const nm = mat('noodle', () => { const t = tNoodle(); return G.R3M.env({ map: t.map, normalMap: t.normalMap, roughness: 0.6, vertexColors: true }); });
      for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
        const lx = -0.78 + c * 0.312, lz = -0.38 + r * 0.38;
        const cake = gBox(0.27, 0.035, 0.3, { x: lx, y: 0.015, z: lz }, { ou: rnd(), ov: rnd() });
        place(cake, { y: cy, rx: tilt }); // tilt with the screen (cake built at screen-local coordinates)
        B.add(nm, cake, { tint: '#ffffff', jitter: 0.08, rnd, ao: false });
      }
    } else {
      // tiered stand with round sieve trays of persimmons
      for (const x of [-0.85, 0.85]) for (const z of [-0.35, 0.35]) B.add(M.bamboo(), gCyl(0.028, 0.03, 1.55, 6, { x, z }), { tint: '#c8b070' });
      const pm = mat('persimmon', () => G.R3M.env({ color: 0xffffff, roughness: 0.4, vertexColors: true }));
      [0.45, 0.95, 1.45].forEach((ty, k) => {
        for (const z of [-0.35, 0.35]) B.add(M.bamboo(), gRod([-0.95, ty - 0.04, z], [0.95, ty - 0.04, z], 0.022, 0.022, 5), { tint: '#b8a060' });
        for (const tx of [-0.45, 0.45]) {
          B.add(M.mat(), gCyl(0.42, 0.4, 0.05, 12, { x: tx, y: ty - 0.02 }), { tint: '#c6a868', ao: false });
          B.add(M.bamboo(), place(new THREE.TorusGeometry(0.42, 0.018, 3, 14), { x: tx, y: ty + 0.03, rx: PI / 2 }), { tint: '#8a6a34', ao: false });
          for (const [rad, n] of [[0, 1], [0.16, 5], [0.3, 9]]) for (let i = 0; i < n; i++) {
            const a = i / n * TAU + rad * 3 + k;
            B.add(pm, place(new THREE.IcosahedronGeometry(0.056, 0), { x: tx + cos(a) * rad, y: ty + 0.06, z: sin(a) * rad, sy: 0.7 }), { tint: mix('#e2761f', '#c45a14', rnd()), ao: false });
                      }
        }
      });
    }
    return B.build();
  }
  def('drying_rack', { variants: 2, build(o) { return buildDryingRack(o.v | 0); } });

  // ################################################################################################
  //  FISHING_NET — net hung between two poles: knotted mesh (alpha), float line with glass & cork
  //  floats, lead line with sinkers, a pile of net at the foot. The net sways (per-instance geometry).
  // ################################################################################################
  const tNet = () => G.R3M.tex('ac:net', 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#6a5a40'; g.lineWidth = 2.2;
    for (let k = -w; k < w * 2; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke(); g.beginPath(); g.moveTo(k + h, 0); g.lineTo(k, h); g.stroke(); }
    g.fillStyle = '#4a3e2a'; for (let y = 0; y < h; y += 8) for (let x = ((y / 8) % 2) * 8; x < w; x += 16) { ell(g, x, y, 2, 2); g.fill(); }
  });
  function buildNet() {
    const B = new Builder(), rnd = RNG(6262);
    for (const x of [-0.95, 0.95]) { B.add(M.wood(), gCyl(0.045, 0.06, 1.95, 7, { x }), { tint: '#8a7050' }); B.add(M.stone(), gRock(0.12, rnd, { x, y: 0.02 }), { tint: '#8a867c' }); }
    // top rope
    const top = []; for (let i = 0; i <= 12; i++) { const t = i / 12, x = lerp(-0.95, 0.95, t); top.push([x, 1.82 - 0.12 * sin(PI * t), 0.02]); }
    B.add(M.wood(), gTube(top, 0.012, 24, 4), { tint: '#b09868', ao: false });
    // floats: alternating green glass and cork
    const glassF = mat('glassfloat', () => G.R3M.env({ color: 0x4aa894, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85, envMapIntensity: 1.4 }));
    for (let i = 1; i < 12; i++) { const p = top[i]; if (i % 2) B.add(glassF, gSphere(0.065, { x: p[0], y: p[1] - 0.05, z: 0.05 }, 10, 8), { ao: false }); else B.add(M.wood(), gCyl(0.045, 0.045, 0.07, 8, { x: p[0], y: p[1] - 0.07, z: 0.04 }), { tint: '#c8a878', ao: false }); }
    // net pile at the foot
    const pile = gSphere(0.32, { x: -0.1, y: 0.0, z: 0.25, sx: 1.4, sy: 0.38 }, 14, 8);
    B.add(mat('netpile', () => G.R3M.env({ map: tNet(), color: 0x8a7a5a, roughness: 1, vertexColors: true })), scaleUV(pile, 3, 3), { tint: '#ffffff', ao: { h: 0.12, min: 0.6 } });
    // the hanging net: grid between the poles, sagging bottom (lead line)
    const nm = mat('net', () => G.R3M.env({ map: tNet(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1, vertexColors: true }));
    const netGeo = gGrid(18, 12, (u, v) => { const x = lerp(-0.92, 0.92, u), yt = 1.8 - 0.12 * sin(PI * u), yb = 0.55 + 0.22 * cos(u * TAU * 1.5) - 0.12 * sin(PI * u); return [x, lerp(yb, yt, v), 0.02 + 0.06 * sin(PI * u) * (1 - v)]; }, (u, v) => [u * 3.6, v * 2.6]);
    // uv.x used by flutter as weight: remap so attached top (v=1) → 0
    const net = new Builder().mesh('net', nm, netGeo, { ao: false, cast: true });
    const lead = []; for (let i = 0; i <= 12; i++) { const u = i / 12; lead.push([lerp(-0.92, 0.92, u), 0.55 + 0.22 * cos(u * TAU * 1.5) - 0.12 * sin(PI * u), 0.02 + 0.06 * sin(PI * u)]); }
    const leadM = new Builder(); leadM.add(M.wood(), gTube(lead, 0.01, 24, 4), { tint: '#4a3a28', ao: false });
    for (let i = 1; i < 12; i += 2) leadM.add(M.metal(), gBox(0.04, 0.03, 0.03, { x: lead[i][0], y: lead[i][1] - 0.02, z: lead[i][2] }), { tint: '#4a4a50', ao: false });
    const lm = leadM.build(); lm.name = 'lead'; lm.userData.noMerge = true;
    return B.build([net, lm]);
  }
  def('fishing_net', {
    build() { return buildNet(); },
    update(node, o, t) {
      const s = seedOf(o), net = node.getObjectByName('net');
      if (net) flutter(net, t, { amp: 0.06, freq: 1.6, k: 2.5, phase: s, axis: [0, 0, 1], weight: (u, v) => pow(1 - clamp(v / 2.6, 0, 1), 1.3) * sin(PI * clamp(u / 3.6, 0, 1)) });
      const ld = node.getObjectByName('lead'); if (ld) ld.position.z = sin(t * 1.6 + s - 1.2) * 0.05;
    },
  });

  // ################################################################################################
  //  LOOM — backstrap (horizontal) loom as used by Truku / Atayal / Saisiyat weavers, resting between
  //  sessions: the hollow warp box (braced by the weaver's feet), warp threads to the cloth beam with
  //  its backstrap, shed rod, heddle rod, beater sword, and the half-woven red cloth with diamond motifs.
  // ################################################################################################
  const tWeave = () => texSet('weave', 256, 256, (g, hg, w, h, r) => {
    g.fillStyle = '#a8241e'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = rgba(y % 4 ? '#7a1410' : '#c83a2a', 0.35); g.fillRect(0, y, w, 1); hg.fillStyle = y % 4 ? '#606060' : '#b0b0b0'; hg.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 2) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x, 0, 1, h); }
    // rows of nested diamonds (white & black) with bands
    for (let row = 0; row < 2; row++) {
      const cy = 64 + row * 128;
      for (let x = 0; x < w; x += 64) {
        const cx = x + 32;
        for (const [sz, col] of [[28, '#1a1414'], [20, '#f0e8d8'], [12, '#1a1414'], [5, '#f0e8d8']]) { g.fillStyle = col; poly(g, [cx, cy - sz, cx + sz, cy, cx, cy + sz, cx - sz, cy]); g.fill(); }
      }
      g.fillStyle = '#f0e8d8'; g.fillRect(0, cy - 44, w, 4); g.fillRect(0, cy + 40, w, 4);
      g.fillStyle = '#1a1414'; g.fillRect(0, cy - 50, w, 3); g.fillRect(0, cy + 47, w, 3);
    }
  }, { strength: 1.2 });
  function buildLoom() {
    const B = new Builder(), rnd = RNG(2828);
    const zBox = -0.42, zCloth = 0.36, wy = 0.32;
    // warp box (hollow log box with an opening), sitting on the ground, braced by two stones
    B.add(M.wood(), gBox(0.78, 0.26, 0.24, { z: zBox }, { grain: 'long' }), { tint: '#7a5232' });
    B.add(M.paint(), gBox(0.6, 0.08, 0.2, { y: 0.2, z: zBox }), { tint: '#1a120c', ao: false });
    for (const x of [-0.42, 0.42]) B.add(M.paint(), gRock(0.07, rnd, { x, y: 0.02, z: zBox + 0.12 }), { tint: '#8a867c' });
    // warp threads (as a thin sheet of lines) from the box top to the cloth beam
    const warpT = G.R3M.tex('ac:warp', 128, 16, (g, w, h) => { g.clearRect(0, 0, w, h); for (let x = 1; x < w; x += 3) { g.fillStyle = x % 6 < 3 ? '#efe6d4' : '#c8b898'; g.fillRect(x, 0, 1.6, h); } }, { wrap: true });
    const warpM = mat('warp', () => G.R3M.env({ map: warpT, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1, vertexColors: true }));
    const warp = new THREE.PlaneGeometry(0.56, 0.58); warp.rotateX(-PI / 2 + atan2(0.26 - wy, 0.58)); place(warp, { y: (0.26 + wy) / 2 + 0.01, z: (zBox + 0.1 + zCloth - 0.2) / 2 });
    B.add(warpM, warp, { ao: false });
    // woven cloth near the cloth beam
    const cloth = new THREE.PlaneGeometry(0.56, 0.42, 1, 1); cloth.rotateX(-PI / 2 + 0.08); place(cloth, { y: wy + 0.02, z: zCloth - 0.02 });
    const wm = mat('weave', () => { const t = tWeave(); return G.R3M.env({ map: t.map, normalMap: t.normalMap, roughness: 0.95, side: THREE.DoubleSide, vertexColors: true }); });
    B.add(wm, scaleUV(cloth, 1, 0.75), { ao: false });
    // cloth beam + backstrap (leather band) curving down to the ground where the weaver sits
    B.add(M.wood(), gRod([-0.36, wy, zCloth + 0.2], [0.36, wy, zCloth + 0.2], 0.025, 0.025, 6), { tint: '#8a6040' });
    B.add(M.wood(), gRod([-0.36, wy + 0.03, zCloth + 0.18], [0.36, wy + 0.03, zCloth + 0.18], 0.018, 0.018, 6), { tint: '#7a5232' });
    for (const x of [-0.37, 0.37]) B.add(M.wood(), gTube([[x, wy, zCloth + 0.2], [x * 1.05, 0.2, zCloth + 0.38], [x * 0.9, 0.06, zCloth + 0.46]], 0.012, 10, 4), { tint: '#6a4a2a', ao: false });
    const strap = gGrid(10, 1, (u, v) => { const x = lerp(-0.33, 0.33, u); return [x, 0.04 + 0.03 * cos(PI * (u - 0.5)), zCloth + 0.46 + v * 0.07 + 0.1 * sin(PI * u)]; }, (u, v) => [u * 0.7, v * 0.07]);
    B.add(M.wood(), strap, { tint: '#5a3a22', ao: false });
    // shed rod (thick bamboo), heddle rod with string loops, beater sword
    B.add(M.wood(), gRod([-0.36, 0.29, -0.05], [0.36, 0.29, -0.05], 0.03, 0.03, 8), { tint: '#c8b070' });
    B.add(M.wood(), gRod([-0.36, 0.33, 0.1], [0.36, 0.33, 0.1], 0.012, 0.012, 5), { tint: '#8a6a44' });
    for (let x = -0.26; x <= 0.27; x += 0.045) B.add(M.wood(), gTube([[x, 0.33, 0.1], [x, 0.315, 0.095], [x + 0.01, 0.3, 0.1]], 0.003, 4, 3), { tint: '#efe6d4', ao: false });
    B.add(M.wood(), gBox(0.7, 0.012, 0.07, { y: 0.31, z: 0.2, rx: 0.2 }, { grain: 'long' }), { tint: '#a07a54' });
    // a coiled ball of red yarn + small basket
    B.add(wm, gSphere(0.06, { x: 0.36, y: 0.05, z: 0.12 }, 10, 8), { ao: false });
    B.add(M.wood(), gCyl(0.13, 0.1, 0.12, 12, { x: -0.38, z: 0.12 }), { tint: '#b89a5e' });
    return B.build();
  }
  def('loom', { build() { return buildLoom(); } });

  // ################################################################################################
  //  TOTEM — carved wooden marker post (kept non-sacred: no ancestor pillar of a specific people).
  //  Motifs drawn from the 2D art and the in-game text (ch11: a Lanyu charm "carved with the boat-eye
  //  motif"): a concentric eye rosette at the top, red/white/black geometric bands, zigzag relief and a
  //  simple stylised figure; stone ring at the foot.
  // ################################################################################################
  const tTotem = () => G.R3M.tex('ac:totem', 256, 512, (g, w, h) => {
    // u around the post (0..1 = full circle), v up the post; one "front" face at u≈0.5
    g.fillStyle = '#6a4630'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { const x = (i * 37) % w; g.fillStyle = rgba(i % 3 ? '#3a2416' : '#8a6448', 0.18); g.fillRect(x, 0, 1 + (i % 3), h); }
    const band = (y, hh) => { g.fillStyle = '#2a1a10'; g.fillRect(0, y, w, hh); for (let x = 0; x < w; x += 16) { g.fillStyle = (x / 16) % 2 ? '#a8322a' : '#e8e0cc'; poly(g, [x + 8, y + 2, x + 15, y + hh / 2, x + 8, y + hh - 2, x + 1, y + hh / 2]); g.fill(); } };
    band(60, 26); band(250, 26); band(440, 26);
    g.strokeStyle = '#d8ccb0'; g.lineWidth = 5; g.beginPath(); for (let x = 0; x <= w; x += 12) g.lineTo(x, 330 + ((x / 12) % 2) * 26); g.stroke();
    g.strokeStyle = '#2a1a10'; g.lineWidth = 3; g.beginPath(); for (let x = 0; x <= w; x += 12) g.lineTo(x, 340 + ((x / 12) % 2) * 26); g.stroke();
    // eye rosette (front, top)
    const ex = w / 2, ey = 150;
    g.fillStyle = '#1a1414'; ell(g, ex, ey, 46, 46); g.fill();
    g.fillStyle = '#a8322a'; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; poly(g, [ex + cos(a - 0.2) * 30, ey + sin(a - 0.2) * 30, ex + cos(a) * 44, ey + sin(a) * 44, ex + cos(a + 0.2) * 30, ey + sin(a + 0.2) * 30]); g.fill(); }
    g.fillStyle = '#e8e0cc'; ell(g, ex, ey, 28, 28); g.fill(); g.strokeStyle = '#a8322a'; g.lineWidth = 5; ell(g, ex, ey, 19, 19); g.stroke();
    g.fillStyle = '#1a1414'; ell(g, ex, ey, 8, 8); g.fill();
    // simple figure (front, low)
    const fx = w / 2, fy = 395;
    g.strokeStyle = '#e8e0cc'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.arc(fx, fy - 30, 9, 0, TAU); g.moveTo(fx, fy - 21); g.lineTo(fx, fy + 10);
    g.moveTo(fx - 22, fy - 34); g.lineTo(fx - 22, fy - 18); g.lineTo(fx, fy - 12); g.lineTo(fx + 22, fy - 18); g.lineTo(fx + 22, fy - 34);
    g.moveTo(fx - 18, fy + 34); g.lineTo(fx - 18, fy + 20); g.lineTo(fx, fy + 10); g.lineTo(fx + 18, fy + 20); g.lineTo(fx + 18, fy + 34); g.stroke();
  });
  function buildTotem() {
    const B = new Builder(), rnd = RNG(1717);
    const tm = mat('totem', () => G.R3M.env({ map: tTotem(), roughness: 0.8, vertexColors: true }));
    // octagonal-ish carved post, slight entasis; texture wraps once around (front at +z)
    const post = new THREE.CylinderGeometry(0.17, 0.2, 2.4, 10, 6);
    { const p = post.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = 1 + 0.04 * sin((y + 1.2) * 2.6); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } post.computeVertexNormals(); }
    post.translate(0, 1.2, 0); post.rotateY(PI); // three's cylinder puts u=0 at +z; turn u=0.5 (motif centre) to +z
    B.add(tm, post, { ao: { h: 0.6, min: 0.6 } });
    // carved ridges (relief rings) at the bands
    for (const y of [0.33, 1.15, 2.0]) B.add(M.wood(), gCyl(0.215, 0.215, 0.05, 10, { y }), { tint: '#4a3020' });
    // capital: a small peaked cap with feather-like slats
    B.add(M.wood(), gCyl(0.02, 0.26, 0.26, 10, { y: 2.4 }), { tint: '#6a4630' });
    B.add(M.paint(), gSphere(0.045, { y: 2.68 }, 8, 6), { tint: '#e8e0cc', ao: false });
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; B.add(M.paint(), gBox(0.04, 0.02, 0.12, { x: sin(a) * 0.24, y: 2.38, z: cos(a) * 0.24, ry: a }), { tint: i % 2 ? '#a8322a' : '#e8e0cc', ao: false }); }
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.3; B.add(M.stone(), gRock(0.1 + rnd() * 0.04, rnd, { x: sin(a) * 0.32, y: 0.03, z: cos(a) * 0.32 }), { tint: '#9a968a' }); }
    return B.build();
  }
  def('totem', { build() { return buildTotem(); } });

  // ################################################################################################
  //  C10_DENGGAO — 燈篙, the Ghost-Month lantern pole (頭城): a tall bamboo pole with leafy crown, a
  //  cross bar carrying two lanterns (guiding the wandering spirits), stone footing. o.blue → ghost-blue
  //  lanterns; o.name → an extra name lantern hung lower (阿義). Lanterns sway; light at the top.
  // ################################################################################################
  function buildDenggao(o) {
    const B = new Builder(), rnd = RNG(5050);
    const H = 5.2;
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; B.add(M.stone(), gRock(0.12 + rnd() * 0.04, rnd, { x: sin(a) * 0.17, y: 0.04, z: cos(a) * 0.17 }), { tint: '#8a8478' }); }
    B.add(M.bamboo(), gCyl(0.035, 0.06, H, 8, {}, { vs: 1 }), { tint: '#c8b070', ao: { h: 0.4, min: 0.7 } });
    B.add(M.bamboo(), gRod([-0.45, H - 0.38, 0], [0.45, H - 0.38, 0], 0.025, 0.025, 6), { tint: '#b8a060', ao: false });
    B.add(M.wood(), gRod([-0.45, H - 0.38, 0], [0, H - 0.05, 0], 0.005, 0.005, 3), { tint: '#4a3a24', ao: false });
    B.add(M.wood(), gRod([0.45, H - 0.38, 0], [0, H - 0.05, 0], 0.005, 0.005, 3), { tint: '#4a3a24', ao: false });
    // leafy crown (bamboo leaves left on the tip, by custom)
    const leafM = mat('leaf', () => G.R3M.env({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide, vertexColors: true }));
    const crown = new Builder();
    for (let i = 0; i < 18; i++) {
      const a = rnd() * TAU, len = 0.22 + rnd() * 0.12, lg = new THREE.PlaneGeometry(0.05, len, 1, 2); lg.translate(0, len / 2, 0);
      crown.add(leafM, place(lg, { y: rnd() * 0.25, rx: 0.6 + rnd() * 0.6, ry: a, order: 'YXZ' }), { tint: mix('#4f7a2e', '#7a9a3a', rnd()), ao: false });
    }
    const cr = crown.build(); cr.name = 'crown'; cr.position.y = H - 0.05; cr.userData.noMerge = true;
    const blue = !!o.blue, extras = [cr];
    [[-0.38, '#f0e8d8'], [0.38, '#d8402a']].forEach(([x, c], i) => {
      const l = lantern('lan' + i, blue ? '#7ab0ff' : c, 0.11, { cord: 0.1, k: blue ? 2.2 : 1.6, tassel: true });
      l.position.set(x, H - 0.38, 0); extras.push(l);
    });
    if (o.name) { const l = lantern('lan2', '#e05a2a', 0.14, { cord: 0.4, text: String(o.name), k: 1.4 }); l.position.set(0.06, H - 1.2, 0); extras.push(l); }
    return B.build(extras);
  }
  def('c10_denggao', {
    key: (o) => (o.blue ? 'b' : '') + '|' + (o.name || ''),
    build(o) { return buildDenggao(o); },
    update(node, o, t) { const s = seedOf(o); swayAll(node, ['lan0', 'lan1', 'lan2'], t, s, 0.12, 1.7); const c = node.getObjectByName('crown'); if (c) c.rotation.z = sin(t * 1.3 + s) * 0.06; },
    lights: (o) => [{ x: 0, y: 4.6, z: 0, color: o.blue ? '#8ab8ff' : '#ffcf7a', intensity: 1.4, distance: 7, flicker: 0.25 }],
  });

  // ################################################################################################
  //  C10_MONSTER_SHOW — a creature shown on the map as a prop (cutscenes). Uses the monster team's
  //  G.Mon3D creature when it exists, else the 2D-art monster billboard; created lazily per instance.
  // ################################################################################################
  def('c10_monster_show', {
    key: (o) => (o.art || '') + ':' + (o.variant || 0) + ':' + (o.scale || '') + (o.flip ? 'f' : '') + ':' + o.x + ',' + o.y,
    build(o) {
      const g = new THREE.Group();
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: G.R3M.blobTex(), transparent: true, depthWrite: false }));
      sh.rotation.x = -PI / 2; sh.position.y = 0.015; sh.scale.set(1.1, 0.7, 1); sh.castShadow = false; sh.userData.noMerge = true;
      g.add(sh);
      g.userData.show = { art: o.art, variant: o.variant || 0, scale: o.scale, flip: !!o.flip };
      return g;
    },
    update(node, o, t, dt) {
      let rec = node.userData.inst;
      if (!rec) {
        const sp = node.userData.show || {}, art = sp.art || o.art || (G.Monsters ? Object.keys(G.Monsters.defs)[0] : null);
        if (!art) return;
        const md = G.Monsters && G.Monsters.get(art);
        const sc = sp.scale || (md ? clamp(110 / md.h, 0.25, 0.7) : 0.5);
        let inst = null;
        try {
          if (G.Mon3D && G.Mon3D.has && G.Mon3D.has(art)) { inst = G.Mon3D.create(art, { context: 'map', variant: sp.variant }); inst.root.scale.setScalar(sc); }
          else inst = G.Models.monsterBillboard(art, { height: (md ? md.h : 160) * sc / TILE, variant: sp.variant });
        } catch (e) { G.warnOnce && G.warnOnce('c10_monster_show ' + art, e); }
        if (!inst) { node.userData.inst = { dead: true }; return; }
        if (inst.setFacing) inst.setFacing(sp.flip ? PI / 2 : -PI / 2 + 0.6);
        node.add(inst.root);
        rec = node.userData.inst = { inst };
      }
      if (rec.dead) return;
      const yaw = G.R3 && G.R3.view ? G.R3.view.yaw || 0 : 0;
      if (rec.inst.update) rec.inst.update(dt || 1 / 60, yaw, G.R3 && G.R3.view ? G.R3.view.camera : null);
      rec.inst.root.position.y = sin(t * 3 + (o.x || 0)) * 0.03;
    },
  });

  // ################################################################################################
  //  LIGHTHOUSE_LAMP — the great Fresnel lens (interior, 2×2): iron platform, brass pedestal, beehive of
  //  glass prism rings around a bulls-eye belt, brass frames, top cap with ventilator. The lens turns
  //  and throws two sweeping beams; strong warm light.
  // ################################################################################################
  function buildLamp() {
    const B = new Builder(), rnd = RNG(9393);
    const brass = '#c8a040', iron = '#3a3e44';
    B.add(M.metal(), gCyl(0.95, 0.98, 0.16, 28), { tint: iron, ao: { h: 0.2, min: 0.6 } });
    B.add(M.metal(), gCyl(0.92, 0.92, 0.03, 28, { y: 0.16 }), { tint: '#5a5e64', ao: false });
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; B.add(M.metal(), gSphere(0.02, { x: sin(a) * 0.86, y: 0.19, z: cos(a) * 0.86 }, 6, 4), { tint: '#2a2c30', ao: false }); }
    B.add(M.metal(), gLathe([[0.3, 0.19], [0.26, 0.3], [0.2, 0.34], [0.2, 0.9], [0.26, 0.96], [0.36, 1.0]], 18), { tint: brass, ao: false });
    for (const y of [0.45, 0.72]) B.add(M.metal(), place(new THREE.TorusGeometry(0.21, 0.02, 6, 20), { y, rx: PI / 2 }), { tint: '#e0bc5a', ao: false });
    // the rotating lens assembly
    const L = new Builder(), y0 = 1.0, Rl = 0.62, Hl = 1.5;
    const prism = mat('prism', () => G.R3M.env({ color: 0xe8f4f0, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.55, envMapIntensity: 2, emissive: 0xfff0c8, emissiveIntensity: 0.25, side: THREE.DoubleSide, vertexColors: true, cutout: false }));
    for (let k = 0; k < 13; k++) {
      const t = k / 12, y = y0 + 0.05 + t * Hl;
      if (t > 0.38 && t < 0.62) continue;
      const r = Rl * sqrt(1 - pow((t - 0.5) * 1.75, 2)) + 0.02;
      L.add(prism, gLathe([[r * 0.9, y - 0.04], [r, y], [r * 0.92, y + 0.05]], 28), { ao: false, cast: false });
    }
    // bulls-eye belt: 8 panels (lenses) with concentric rings
    const bullT = G.R3M.tex('ac:bull', 128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, '#fff4d0'); gr.addColorStop(1, '#c8b890'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let k = 1; k < 8; k++) { g.strokeStyle = rgba(k % 2 ? '#a08040' : '#ffffff', 0.6); g.lineWidth = 2; ell(g, 64, 64, k * 8, k * 8); g.stroke(); } });
    const bullM = mat('bull', () => new THREE.MeshStandardMaterial({ map: bullT, emissive: 0xfff0c8, emissiveMap: bullT, emissiveIntensity: 1.6, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, pg = new THREE.PlaneGeometry(0.44, 0.36); place(pg, { x: sin(a) * Rl * 0.98, y: y0 + 0.05 + Hl / 2, z: cos(a) * Rl * 0.98, ry: a }); L.add(bullM, pg, { ao: false, cast: false }); }
    // brass frame: vertical struts + belt rings
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) / 8 * TAU, pts = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8, r = Rl * sqrt(max(0.02, 1 - pow((t - 0.5) * 1.75, 2))) + 0.03; pts.push([sin(a) * r, y0 + 0.02 + t * (Hl + 0.06), cos(a) * r]); }
      L.add(M.metal(), gTube(pts, 0.016, 16, 4), { tint: brass, ao: false });
    }
    for (const t of [0.38, 0.62]) { const r = Rl * sqrt(1 - pow((t - 0.5) * 1.75, 2)) + 0.03; L.add(M.metal(), place(new THREE.TorusGeometry(r, 0.022, 5, 32), { y: y0 + 0.05 + t * Hl, rx: PI / 2 }), { tint: '#e0bc5a', ao: false }); }
    // lamp core (burner glow)
    L.add(glowM('#fff1c4', 4), gSphere(0.12, { y: y0 + 0.05 + Hl / 2 }, 12, 10), { ao: false, cast: false });
    const lens = L.build(); lens.name = 'lens';
    // static top cap with vent ball (does not rotate)
    B.add(M.metal(), gLathe([[0.52, y0 + Hl + 0.06], [0.46, y0 + Hl + 0.16], [0.2, y0 + Hl + 0.36], [0.08, y0 + Hl + 0.42]], 20), { tint: brass, ao: false });
    B.add(M.metal(), gCyl(0.06, 0.06, 0.1, 10, { y: y0 + Hl + 0.4 }), { tint: brass, ao: false });
    B.add(M.metal(), gSphere(0.09, { y: y0 + Hl + 0.58 }, 12, 8), { tint: '#d8b050', ao: false });
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; B.add(M.metal(), gRod([sin(a) * 0.5, y0 + Hl + 0.08, cos(a) * 0.5], [sin(a) * 0.32, 0.19, cos(a) * 0.32], 0.018, 0.018, 5), { tint: brass, ao: false }); }
    // beams (child of lens so they rotate with it)
    const bm = addMat('lampbeam', '#fff2c8', beamTex(), 0.35);
    for (const s of [-1, 1]) {
      const cg = new THREE.CylinderGeometry(1.4, 0.3, 9, 20, 1, true); cg.translate(0, 4.5, 0); cg.rotateZ(-s * PI / 2);
      const cm = new THREE.Mesh(cg, bm); cm.position.y = y0 + 0.05 + Hl / 2; cm.castShadow = false; cm.renderOrder = 5; cm.name = 'beamcone'; cm.userData.noBounds = true;
      lens.add(cm);
    }
    const halo = haloCard('#fff0c0', 2.4, 0.8); halo.position.y = y0 + 0.05 + Hl / 2; halo.name = 'halo'; halo.userData.noBounds = true;
    void rnd;
    return B.build([lens, halo]);
  }
  def('lighthouse_lamp', {
    build() { return buildLamp(); },
    update(node, o, t) {
      const l = node.getObjectByName('lens'); if (l) l.rotation.y = t * 0.9 + seedOf(o);
      const h = node.getObjectByName('halo'); if (h) h.material.opacity = 0.7 + 0.1 * sin(t * 3);
    },
    lights: () => [{ x: 0, y: 1.8, z: 0, color: '#fff0c0', intensity: 2.4, distance: 9, flicker: 0.04 }],
  });

  // ================================================================================================
  //  HULLS — parametric hull surface: u ∈ [-1,1] stern→bow along x, s ∈ [-1,1] girth (port → keel → stbd)
  //  spec: { a (half length), b (half beam), wf(u), sh(u) sheer, kl(u) keel, full (bilge fullness) }
  // ================================================================================================
  function hullFn(sp) {
    return (u, s, inset = 0) => {
      const phi = s * PI / 2, wf = sp.wf(u), kl = sp.kl(u) + inset * 0.8, sh = sp.sh(u);
      const z = max(0, sp.b * wf - inset) * sin(phi);
      const y = kl + (sh - kl) * pow(1 - cos(phi), sp.full || 0.8);
      return [sp.a * u + (sp.rake ? sp.rake(u, y) : 0), y, z];
    };
  }
  // outer (painted, uv 0..1 × 0..1), inner (wood), gunwale cap, transom caps at both ends
  function buildHull(B, sp, outerMat, opt = {}) {
    const P = hullFn(sp), NU = opt.nu || 56, NV = opt.nv || 18, ui = sp.uin || 0.985;
    B.add(outerMat, gGrid(NU, NV, (u, v) => P(u * 2 - 1, v * 2 - 1), (u, v) => [u, v], { flip: true }), { ao: false, tint: opt.outerTint, aofn: opt.aofn });
    if (opt.inner !== false) B.add(M.wood(), gGrid(NU, NV, (u, v) => P((u * 2 - 1) * ui, v * 2 - 1, opt.thick || 0.04), (u, v) => [u * sp.a * 2, v * 2]), { tint: opt.innerTint || '#7a5a3c', ao: false, aofn: (x, y) => 0.5 + 0.5 * sstep(sp.kl(0) + 0.1, sp.sh(0), y) });
    for (const s of [-1, 1]) {
      const rim = gGrid(NU, 1, (u, v) => { const U = u * 2 - 1, a = P(U, s), b = P(U * ui, s, opt.thick || 0.04); return [lerp(a[0], b[0], v), lerp(a[1], b[1], v) + 0.01, lerp(a[2], b[2], v)]; }, (u, v) => [u * sp.a * 2, v * 0.1], { flip: s > 0 });
      B.add(opt.rimMat || M.paint(), rim, { tint: opt.rimTint || '#2a1a16', ao: false });
    }
    // transoms: fan from the section contour at each end (only meaningful when wf(±1) > 0)
    for (const e of [-1, 1]) {
      if (sp.wf(e) < 0.02) continue;
      const pts = []; for (let i = 0; i <= 16; i++) pts.push(P(e, -1 + i / 8));
      const pos = [], uvs = []; const c = P(e, 0); const top = [(pts[0][0] + pts[16][0]) / 2, pts[0][1], 0];
      for (let i = 0; i < 16; i++) {
        const a = pts[i], b = pts[i + 1];
        if (e > 0) pos.push(...top, ...a, ...b); else pos.push(...top, ...b, ...a);
        for (const q of e > 0 ? [top, a, b] : [top, b, a]) uvs.push(q[2] / (sp.b * 2) + 0.5, (q[1] - c[1]) / max(0.01, top[1] - c[1]));
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.computeVertexNormals();
      B.add(opt.transomMat ? opt.transomMat(e) : M.paint(), g, { tint: opt.transomTint || '#5a3a24', ao: false });
    }
    return P;
  }

  // glazed / grey roof tiles (barrel tiles; rows along u, courses along v) ------------------------
  const tTile = () => texSet('tile', 256, 256, (g, hg, w, h, r) => {
    const cw = 32;
    for (let x = 0; x < w; x += cw) {
      const gr = g.createLinearGradient(x, 0, x + cw, 0); gr.addColorStop(0, '#5a5a5a'); gr.addColorStop(0.3, '#e0e0e0'); gr.addColorStop(0.6, '#b0b0b0'); gr.addColorStop(1, '#4a4a4a');
      g.fillStyle = gr; g.fillRect(x, 0, cw, h);
      const hgr = hg.createLinearGradient(x, 0, x + cw, 0); hgr.addColorStop(0, '#202020'); hgr.addColorStop(0.5, '#ffffff'); hgr.addColorStop(1, '#202020'); hg.fillStyle = hgr; hg.fillRect(x, 0, cw, h);
      for (let y = 0; y < h; y += 64) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, y, cw, 4); hg.fillStyle = 'rgba(0,0,0,0.5)'; hg.fillRect(x, y, cw, 4); }
    }
    noiseFill(g, w, h, r, 300, '#000000', 0.05, 0.12, 1, 3);
  }, { strength: 3 });
  // small temple-style roof: curved slopes with upturned eave corners, ridge with swallowtail ends
  function curvedRoof(B, sp) {
    const { x0 = 0, z0 = 0, EX, EZ, yE, yR, lift = 0.18 } = sp, tm = mat('tile', () => { const t = tTile(); return G.R3M.env({ map: t.map, normalMap: t.normalMap, roughness: 0.35, vertexColors: true }); });
    for (const sd of [-1, 1]) {
      const base = (u, v) => { const x = lerp(-EX, EX, u), ex = abs(x) / EX; const y = yR - (yR - yE) * (1 - pow(1 - v, 1.6)) + lift * pow(ex, 6) * pow(v, 2); return [x + x0, y, z0 + sd * EZ * v * (1 + 0.06 * pow(ex, 6))]; };
      B.add(tm, gGrid(24, 8, base, (u, v) => [u * EX * 2 * 2, v * EZ * 2], { flip: sd < 0 }), { tint: sp.tint || '#3a8a6a', ao: false });
      B.add(tm, gGrid(24, 1, (u, v) => { const p = base(u, 1); return [p[0], p[1] - 0.06 * v, p[2]]; }, (u, v) => [u * 4, v * 0.1], { flip: sd > 0 }), { tint: shade(sp.tint || '#3a8a6a', -0.4), ao: false });
      B.add(M.paint(), gGrid(12, 1, (u, v) => { const p = base(u, lerp(0.15, 1, v)); return [p[0], p[1] - 0.06, p[2]]; }, null, { flip: sd > 0 }), { tint: '#7a1e18', ao: false });
    }
    // ridge with upswept swallowtails
    const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12 * 2 - 1; pts.push([x0 + t * (EX + 0.05), yR + 0.06 + 0.14 * pow(abs(t), 5), z0]); }
    B.add(M.paint(), gTube(pts, 0.05, 24, 6), { tint: sp.ridge || '#b23a2a', ao: false });
    for (const e of [-1, 1]) B.add(M.paint(), gRod([x0 + e * (EX + 0.02), yR + 0.18, z0], [x0 + e * (EX + 0.22), yR + 0.4, z0], 0.03, 0.01, 5), { tint: sp.ridge || '#b23a2a', ao: false });
  }

  // ################################################################################################
  //  WANG_BOAT — 王船 (東港 / 西港 royal-lord boat): an ornate junk built for the 千歲爺. Painted hull bands
  //  (red, gold, teal with waves & clouds, gold, deep red, black bottom), 龍目 dragon eyes at the bow,
  //  painted transoms, the stern 王府 cabin with a green-tiled curved roof and red lanterns, three
  //  battened junk sails with sheet fans, mast-top streamers, five-colour 令旗 along the gunwales, the
  //  代天巡狩 banner, rudder, wooden anchor. o.water → afloat (bob/pitch); else on a wooden cradle.
  // ################################################################################################
  const WBH = { a: 3.15, b: 1.12, full: 0.75 };
  WBH.wf = (u) => (u >= 0 ? lerp(1, 0.42, pow(u, 2.2)) : lerp(1, 0.72, pow(-u, 3)));
  WBH.sh = (u) => 1.5 + 0.3 * u * u + (u < 0 ? 0.55 * pow(-u, 3) : 0.22 * pow(u, 4));
  WBH.kl = (u) => 0.02 + (u < 0 ? 0.55 * pow(-u, 2.6) : 0.62 * pow(u, 2.4));
  WBH.rake = (u, y) => (u > 0 ? 0.32 * pow(u, 3) * (y - WBH.kl(u)) : -0.12 * pow(-u, 3) * (y - WBH.kl(u)));
  function wangHullTex() {
    return G.R3M.tex('ac:wang_hull', 1024, 512, (g) => {
      const side = G.U.makeCanvas(1024, 256, 1), s = side.getContext('2d'), rnd = RNG(312);
      // bands, gunwale (y=0) → keel (y=256): x = length, stern at left, bow at right
      const bands = [[0, 46, '#b42c24'], [46, 52, '#e2b04a'], [52, 104, '#2c7a68'], [104, 110, '#e2b04a'], [110, 150, '#8a2a20'], [150, 256, '#1e1a1a']];
      for (const [a, b, c] of bands) { s.fillStyle = c; s.fillRect(0, a, 1024, b - a); }
      // gold scrolls on red
      for (let x = 14; x < 1024; x += 30) { s.strokeStyle = '#f0c75a'; s.lineWidth = 3; s.beginPath(); s.arc(x, 23, 9, 0.3, TAU - 0.6); s.stroke(); s.beginPath(); s.arc(x + 15, 23, 5, PI + 0.3, PI + TAU - 0.6); s.stroke(); }
      // waves & clouds on teal
      for (let x = 20; x < 1024; x += 44) {
        s.strokeStyle = '#e8f0e0'; s.lineWidth = 3; s.beginPath(); s.arc(x, 92, 12, PI, TAU); s.arc(x + 20, 92, 7, PI, TAU * 0.98); s.stroke();
        s.strokeStyle = '#e2b04a'; s.lineWidth = 2.4; s.beginPath(); s.arc(x + 28, 70, 6, 0, TAU); s.arc(x + 36, 66, 4, 0, TAU); s.stroke();
      }
      // deep red band: gold key-fret
      s.strokeStyle = '#e2b04a'; s.lineWidth = 2.5; s.beginPath();
      for (let x = 0; x < 1024; x += 20) { s.moveTo(x, 140); s.lineTo(x, 120); s.lineTo(x + 14, 120); s.lineTo(x + 14, 134); s.lineTo(x + 6, 134); s.lineTo(x + 6, 128); }
      s.stroke();
      // planks & wear on the black bottom
      for (let y = 160; y < 256; y += 18) { s.fillStyle = 'rgba(255,255,255,0.05)'; s.fillRect(0, y, 1024, 1.5); }
      for (let i = 0; i < 400; i++) { s.fillStyle = rgba('#000000', 0.08); s.fillRect(rnd() * 1024, rnd() * 150, 2 + rnd() * 20, 1); }
      // 龍目 dragon eye near the bow (squashed to undo the UV stretch)
      const eye = (cx, cy) => {
        s.save(); s.translate(cx, cy); s.scale(1, 0.72);
        s.fillStyle = '#b42c24'; ell(s, 0, 0, 46, 34); s.fill();
        s.fillStyle = '#f6f0e0'; ell(s, 0, 0, 38, 26); s.fill();
        s.fillStyle = '#121010'; ell(s, 6, 0, 17, 17); s.fill();
        s.fillStyle = '#ffffff'; ell(s, 1, -6, 5, 5); s.fill();
        s.strokeStyle = '#121010'; s.lineWidth = 7; s.beginPath(); s.moveTo(-44, -30); s.quadraticCurveTo(0, -54, 48, -28); s.stroke();
        s.strokeStyle = '#e2b04a'; s.lineWidth = 3; ell(s, 0, 0, 46, 34); s.stroke();
        s.restore();
      };
      eye(900, 78);
      g.drawImage(side, 0, 0, 1024, 256);
      g.save(); g.translate(0, 512); g.scale(1, -1); g.drawImage(side, 0, 0, 1024, 256); g.restore();
    });
  }
  const tSail = () => texSet('sail', 256, 512, (g, hg, w, h, r) => {
    g.fillStyle = '#efe4c8'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(150,120,80,0.25)'; g.fillRect(x, 0, 1.5, h); }
    for (let i = 0; i < 40; i++) { g.fillStyle = rgba(r() < 0.5 ? '#d8c8a0' : '#f8f0dc', 0.3); g.fillRect(r() * w, r() * h, 10 + r() * 40, 6 + r() * 30); }
    for (let i = 0; i < 6; i++) { const gr = g.createLinearGradient(0, 0, 0, h); g.fillStyle = 'rgba(140,110,70,0.08)'; g.fillRect(r() * w, 0, 20, h); void gr; }
    // battens (n=8) as painted dark bars with highlight
    for (let k = 1; k < 8; k++) {
      const y = h - k * h / 8;
      g.fillStyle = 'rgba(60,40,20,0.18)'; g.fillRect(0, y - 14, w, 12);
      g.fillStyle = '#5a3a20'; g.fillRect(0, y - 3, w, 7); g.fillStyle = '#9a7048'; g.fillRect(0, y - 3, w, 2);
      hg.fillStyle = '#ffffff'; hg.fillRect(0, y - 4, w, 9);
    }
    g.strokeStyle = '#a8302a'; g.lineWidth = 10; g.strokeRect(2, 2, w - 4, h - 4);
  }, { strength: 3 });
  function junkSail(xm, yBot, yTop, wAft, wFore, zOff) {
    // flat panel in the xy plane with per-panel billow; uv.x = 0 at the luff (fore) → 1 leech (aft)
    return gGrid(8, 16, (u, v) => {
      const x = xm + wFore - u * (wFore + wAft) - (wAft * 0.12) * v; // leech rakes aft toward the top
      const y = lerp(yBot - 0.06 * u, yTop + 0.1 * (1 - u), v);
      const panel = v * 8 - floor(v * 8);
      const z = zOff + 0.06 * sin(PI * u) + 0.05 * sin(PI * panel) * sin(PI * u);
      return [x, y, z];
    }, (u, v) => [u, v]);
  }
  // triangular streamer / rectangular flag in the xy plane, attached at the hoist (uv.x = 0)
  function flagGeo(x, y, z, len, wid, dir, tri, segs = 8) {
    return gGrid(segs, 2, (u, v) => { const ww = tri ? wid * (1 - u * 0.92) : wid; return [x + dir * len * u, y - v * ww + (tri ? (wid - ww) * 0.5 : 0), z]; }, (u, v) => [u, v]);
  }
  function buildWangBoat(o) {
    const B = new Builder(), rnd = RNG(2024), water = !!o.water;
    const hullM = mat('wang_hull', () => G.R3M.env({ map: wangHullTex(), vertexColors: true, roughness: 0.45 }));
    const transomT = G.R3M.tex('ac:wang_transom', 256, 256, (g, w, h) => {
      g.fillStyle = '#8a2a20'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#e2b04a'; g.lineWidth = 8; g.strokeRect(20, 30, w - 40, h - 60);
      g.fillStyle = '#2c7a68'; g.fillRect(36, 46, w - 72, h - 92);
      // painted auspicious cloud & sun medallion
      g.fillStyle = '#f0c23a'; ell(g, w / 2, h / 2, 44, 44); g.fill(); g.fillStyle = '#d2352a'; ell(g, w / 2, h / 2, 30, 30); g.fill();
      g.strokeStyle = '#f6f0e0'; g.lineWidth = 5; for (const s of [-1, 1]) { g.beginPath(); g.arc(w / 2 + s * 70, h / 2 + 20, 16, PI, TAU); g.arc(w / 2 + s * 90, h / 2 + 20, 10, PI, TAU); g.stroke(); }
    });
    const transomM = mat('wang_transom', () => G.R3M.env({ map: transomT, vertexColors: true, roughness: 0.5 }));
    const hb = new Builder(); // hull & deck (everything that bobs)
    const P = buildHull(hb, WBH, hullM, { nu: 64, nv: 20, thick: 0.07, innerTint: '#9a2a20', rimMat: M.paint(), rimTint: '#e2b04a', transomMat: () => transomM, transomTint: '#ffffff' });
    // deck planking
    const deckY = (u) => WBH.sh(u) - 0.32;
    hb.add(M.wood(), gGrid(40, 6, (u, v) => { const U = lerp(-0.96, 0.96, u), w = WBH.b * WBH.wf(U) - 0.1; return [WBH.a * U, deckY(U), lerp(-w, w, v)]; }, (u, v) => [v * 2.2, u * 6.2]), { tint: '#c89a62', ao: false });
    // gunwale rail (gold) + bulwark stanchions
    for (const s of [-1, 1]) {
      const pts = []; for (let i = 0; i <= 24; i++) { const p = P(lerp(-0.99, 0.99, i / 24), s); pts.push([p[0], p[1] + 0.03, p[2]]); }
      hb.add(M.paint(), gTube(pts, 0.035, 48, 6), { tint: '#e2b04a', ao: false });
    }
    // stern 王府 cabin
    const cx0 = -2.75, cx1 = -1.55, cw = 0.78, cy = deckY(-0.7) + 0.02, ch = 1.0;
    const latT = G.R3M.tex('ac:lattice', 128, 128, (g, w, h) => { g.fillStyle = '#2a120c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c9a24a'; g.lineWidth = 3; for (let k = 8; k < w; k += 16) { g.beginPath(); g.moveTo(k, 4); g.lineTo(k, h - 4); g.stroke(); g.beginPath(); g.moveTo(4, k); g.lineTo(w - 4, k); g.stroke(); } g.strokeRect(3, 3, w - 6, h - 6); });
    const latM = mat('lattice', () => G.R3M.env({ map: latT, vertexColors: true, roughness: 0.6 }));
    hb.add(M.paint(), gBox(cx1 - cx0, ch, cw * 2, { x: (cx0 + cx1) / 2, y: cy }), { tint: '#7a1e18', ao: { h: 0.6, min: 0.6, y0: cy } });
    for (let i = 0; i < 3; i++) { const x = cx0 + 0.2 + i * 0.4; hb.add(latM, place(new THREE.PlaneGeometry(0.3, 0.7), { x, y: cy + 0.45, z: cw + 0.005 }), { ao: false }); hb.add(latM, place(new THREE.PlaneGeometry(0.3, 0.7), { x, y: cy + 0.45, z: -cw - 0.005, ry: PI }), { ao: false }); }
    hb.add(latM, place(new THREE.PlaneGeometry(0.6, 0.7), { x: cx1 + 0.005, y: cy + 0.45, ry: PI / 2 }), { ao: false });
    for (const x of [cx0, cx0 + 0.4, cx0 + 0.8, cx1]) for (const z of [-cw, cw]) hb.add(M.paint(), gCyl(0.045, 0.045, ch + 0.05, 8, { x, y: cy, z }), { tint: '#c8302a', ao: false });
    curvedRoof(hb, { x0: (cx0 + cx1) / 2, EX: (cx1 - cx0) / 2 + 0.25, EZ: cw + 0.3, yE: cy + ch, yR: cy + ch + 0.42, lift: 0.16, tint: '#3a8a6a' });
    hb.add(M.paint(), gLathe([[0.001, 0], [0.07, 0.04], [0.06, 0.1], [0.03, 0.13], [0.09, 0.2], [0.07, 0.28], [0.001, 0.31]], 10, { x: (cx0 + cx1) / 2, y: cy + ch + 0.5 }), { tint: '#e8be52', ao: false });
    // masts with gold caps
    const masts = [[0.36, 4.7, 0.09], [1.94, 3.5, 0.075], [-1.19, 3.0, 0.065]];
    for (const [x, h, r] of masts) {
      const y0 = deckY(x / WBH.a);
      hb.add(M.wood(), gCyl(r * 0.7, r, h + 0.3, 8, { x, y: y0 - 0.3 }), { tint: '#9a7048', ao: false });
      hb.add(M.paint(), gCyl(r * 0.85, r * 0.85, 0.08, 8, { x, y: y0 + h - 0.02 }), { tint: '#c9a24a', ao: false });
      hb.add(M.paint(), gSphere(r * 0.9, { x, y: y0 + h + 0.12 }, 8, 6), { tint: '#e2b04a', ao: false });
    }
    // sails (one animated mesh), sheet fans & halyards
    const sm = mat('sail', () => { const t = tSail(); return G.R3M.env({ map: t.map, normalMap: t.normalMap, side: THREE.DoubleSide, roughness: 0.9, vertexColors: true }); });
    const sails = [[0.36, 1.1, 4.47, 1.44, 0.42], [1.94, 1.03, 3.25, 1.0, 0.31], [-1.19, 1.16, 2.78, 0.81, 0.25]];
    const sg = [];
    sails.forEach(([xm, b, t, wa, wfo]) => {
      const y0 = deckY(xm / WBH.a);
      sg.push(junkSail(xm, y0 + b, y0 + t, wa, wfo, 0.12));
      // sheet lines: from each batten's leech end down to a block on the aft deck
      const bx = xm - wa - wa * 0.12 * 0.5, by = deckY(clamp(bx / WBH.a, -1, 1)) + 0.2;
      for (let k = 1; k < 8; k += 2) { const v = k / 8, lx = xm + wfo - (wfo + wa) - wa * 0.12 * v, ly = lerp(y0 + b, y0 + t, v); hb.add(M.wood(), gRod([lx, ly, 0.13], [bx, by, 0.05], 0.006, 0.006, 3), { tint: '#5a4a30', ao: false }); }
      hb.add(M.wood(), gRod([xm, y0 + t + 0.15, 0.02], [xm + wfo, y0 + t, 0.14], 0.006, 0.006, 3), { tint: '#5a4a30', ao: false });
    });
    // stays
    hb.add(M.wood(), gRod([0.36, deckY(0.11) + 4.7, 0], [3.25, WBH.sh(1) + 0.1, 0], 0.008, 0.008, 3), { tint: '#4a3a24', ao: false });
    hb.add(M.wood(), gRod([0.36, deckY(0.11) + 4.7, 0], [-2.0, deckY(-0.63) + 0.1, 0], 0.008, 0.008, 3), { tint: '#4a3a24', ao: false });
    for (const s of [-1, 1]) hb.add(M.wood(), gRod([0.36, deckY(0.11) + 3.8, 0], [0.36, WBH.sh(0.11), s * WBH.b * 0.98], 0.007, 0.007, 3), { tint: '#4a3a24', ao: false });
    const sailMesh = new Builder().mesh('sails', sm, THREE.BufferGeometryUtils.mergeGeometries(sg.map((x) => x.toNonIndexed())), { ao: false });
    // flags: mast-top streamers + 令旗 (five colours) along both gunwales — one animated mesh
    const FIVE = ['#2f8a5a', '#d2352a', '#f0c23a', '#f2efe6', '#2a2a2a'];
    const flagB = new Builder(), fm = mat('flagcloth', () => G.R3M.env({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide, vertexColors: true }));
    masts.forEach(([x, h], i) => { const y0 = deckY(x / WBH.a); flagB.add(fm, flagGeo(x, y0 + h + 0.05, 0, 0.75 - i * 0.12, 0.13, -1, true, 10), { tint: ['#d2352a', '#f0c23a', '#2f8a5a'][i], ao: false }); });
    for (let i = 0; i < 8; i++) for (const s of [-1, 1]) {
      const u = lerp(-0.35, 0.72, i / 7), p = P(u, s);
      hb.add(M.wood(), gRod([p[0], p[1], p[2] * 0.97], [p[0], p[1] + 0.42, p[2] * 0.97], 0.012, 0.012, 4), { tint: '#4a3018', ao: false });
      flagB.add(fm, flagGeo(p[0], p[1] + 0.42, p[2] * 0.97, 0.22, 0.16, -1, true, 4), { tint: FIVE[(i + (s > 0 ? 2 : 0)) % 5], ao: false });
    }
    const flagMesh = flagB.mesh('flags', fm, THREE.BufferGeometryUtils.mergeGeometries(flagB.parts.values().next().value.geos), { ao: false, cast: true });
    // 代天巡狩 banner on its pole near the stern
    const bx = -2.55, by = deckY(-0.81);
    hb.add(M.wood(), gCyl(0.03, 0.04, 3.9, 6, { x: bx, y: by, z: 0.45 }), { tint: '#5a3a20', ao: false });
    hb.add(M.paint(), gSphere(0.06, { x: bx, y: by + 3.95, z: 0.45 }, 8, 6), { tint: '#e2b04a', ao: false });
    hb.add(M.wood(), gRod([bx, by + 3.75, 0.45], [bx + 0.55, by + 3.75, 0.45], 0.015, 0.015, 4), { tint: '#5a3a20', ao: false });
    const banT = G.R3M.tex('ac:dtxs', 128, 512, (g, w, h) => {
      g.fillStyle = '#c8302a'; g.fillRect(0, 0, w, h);
      const gr = g.createLinearGradient(16, 0, w - 16, 0); gr.addColorStop(0, '#f8dc6a'); gr.addColorStop(1, '#e0b43a'); g.fillStyle = gr; g.fillRect(16, 18, w - 32, h - 36);
      g.fillStyle = '#2a1208'; g.font = 'bold 80px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      [...'代天巡狩'].forEach((c, i) => g.fillText(c, w / 2, 70 + i * 116));
    });
    const banM = mat('dtxs', () => G.R3M.env({ map: banT, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true }));
    const ban = gGrid(4, 10, (u, v) => [bx + 0.04 + u * 0.48, by + 3.72 - v * 1.85, 0.45], (u, v) => [u, 1 - v]);
    const banMesh = new Builder().mesh('banner', banM, ban, { ao: false });
    // red lanterns at the cabin front, rudder & tiller, anchor at the bow
    const extras = [sailMesh, flagMesh, banMesh];
    [[cx1 + 0.08, -cw - 0.05], [cx1 + 0.08, cw + 0.05]].forEach(([x, z], i) => { const l = lantern('wlan' + i, '#d8352a', 0.12, { cord: 0.06, tassel: true }); l.position.set(x, cy + ch - 0.02, z); extras.push(l); });
    const rp = P(-1, 0);
    hb.add(M.wood(), gBox(0.08, 1.3, 0.5, { x: rp[0] - 0.22, y: rp[1] - 0.4, rz: 0.1 }), { tint: '#4a2c1c', ao: false });
    hb.add(M.wood(), gRod([rp[0] - 0.2, rp[1] + 0.85, 0], [rp[0] + 0.55, WBH.sh(-0.95) - 0.2, 0], 0.03, 0.025, 5), { tint: '#7a5232', ao: false });
    const bp = P(1, 1);
    hb.add(M.wood(), gRod([bp[0] - 0.1, bp[1] - 0.2, 0.28], [bp[0] + 0.05, bp[1] - 1.0, 0.36], 0.035, 0.035, 5), { tint: '#7a1e18', ao: false });
    hb.add(M.wood(), gRod([bp[0] - 0.15, bp[1] - 1.05, 0.36], [bp[0] + 0.25, bp[1] - 0.85, 0.36], 0.03, 0.02, 5), { tint: '#7a1e18', ao: false });
    hb.add(M.wood(), gCyl(0.08, 0.08, 0.5, 8, { x: bp[0] - 0.4, y: deckY(0.9) + 0.15, rx: PI / 2, z: 0.25 }), { tint: '#6a4a30', ao: false });
    // the whole hull assembly bobs
    if (!water) { // beach cradle (built in hull space, which is lifted 0.42 above the ground)
      for (const u of [-0.64, -0.11, 0.41, 0.72]) {
        const x = WBH.a * u, k = WBH.kl(u) + 0.42;
        hb.add(M.wood(), gBox(0.3, k, 1.3, { x, y: -0.42 }), { tint: '#8a6a50', ao: { h: 0.4, min: 0.6, y0: -0.42 } });
        for (const s of [-1, 1]) hb.add(M.wood(), gRod([x, -0.42, s * 0.85], [x, k - 0.42, s * 0.35], 0.05, 0.05, 5), { tint: '#9a7a5a', ao: false });
      }
    }
    const hull = hb.build(extras); hull.name = 'bob';
    hull.position.y = water ? -0.58 : 0.42;
    return B.build([hull]);
  }
  def('wang_boat', {
    key: (o) => (o.water ? 'w' : 'c'),
    build(o) { return buildWangBoat(o); },
    update(node, o, t) {
      const s = seedOf(o), hull = node.getObjectByName('bob');
      if (hull && o.water) { hull.position.y = -0.58 + sin(t * 1.3 + s) * 0.04; hull.rotation.z = sin(t * 0.8 + s) * 0.015; hull.rotation.x = sin(t * 1.05 + s * 1.3) * 0.02; }
      flutter(node.getObjectByName('sails'), t, { amp: 0.035, freq: 1.4, k: 2, phase: s, axis: [0, 0, 1], bias: 0.02 });
      flutter(node.getObjectByName('flags'), t, { amp: 0.06, freq: 6, k: 6, phase: s, axis: [0, 0, 1] });
      flutter(node.getObjectByName('banner'), t, { amp: 0.06, freq: 2.2, k: 3, phase: s, axis: [0, 0, 1], weight: (u, v) => 0.3 + (1 - v) * 0.9 });
      swayAll(node, ['wlan0', 'wlan1'], t, s, 0.1, 1.5);
    },
    lights: (o) => { const y = (o.water ? -0.58 : 0.42) + WBH.sh(-0.7) - 0.32 + 0.9; return [{ x: -1.47, y, z: -0.85, color: '#ff9a50', intensity: 1, distance: 4, flicker: 0.35 }, { x: -1.47, y, z: 0.85, color: '#ff9a50', intensity: 1, distance: 4, flicker: 0.35 }]; },
  });

  // ################################################################################################
  //  BOAT_SMALL — 舢舨 sampan: plank hull, bamboo-mat canopy (篷), stern scull oar. Always afloat.
  //  BOAT_FERRY — 渡船: larger hull with bow eye, mat cabin, stern scull, bow lantern pole (o.color).
  // ################################################################################################
  function buildSampan() {
    const B = new Builder(), rnd = RNG(1414);
    const sp = { a: 1.15, b: 0.42, full: 0.55, wf: (u) => (u > 0 ? lerp(1, 0.18, pow(u, 1.8)) : lerp(1, 0.6, pow(-u, 2.5))), sh: (u) => 0.42 + 0.22 * pow(abs(u), 3) + (u > 0 ? 0.12 * pow(u, 4) : 0), kl: (u) => 0.02 + 0.2 * pow(abs(u), 3) };
    const hm = mat('sampan', () => G.R3M.env({ map: tWood().map, normalMap: tWood().normalMap, vertexColors: true, roughness: 0.75 }));
    const hb = new Builder();
    const P = buildHull(hb, sp, hm, { nu: 36, nv: 12, thick: 0.035, outerTint: '#8a6040', innerTint: '#6a4a30', rimTint: '#4a3020', transomTint: '#7a5434' });
    for (const u of [-0.55, 0.0, 0.55]) { const p = P(u, 1, 0.035); hb.add(M.wood(), gBox(0.1, 0.03, p[2] * 2, { x: sp.a * u, y: p[1] - 0.1 }), { tint: '#9a7050', ao: false }); }
    // half-barrel mat canopy amidships
    const cv = gGrid(10, 8, (u, v) => { const a = lerp(-PI / 2, PI / 2, v); return [lerp(-0.4, 0.3, u), 0.4 + 0.38 * cos(a), 0.4 * sin(a)]; }, (u, v) => [u * 1.4, v * 2.4]);
    hb.add(M.mat(), cv, { tint: '#c4a870', ao: false });
    const cv2 = gGrid(10, 8, (u, v) => { const a = lerp(-PI / 2, PI / 2, v); return [lerp(-0.4, 0.3, u), 0.4 + 0.36 * cos(a), 0.38 * sin(a)]; }, (u, v) => [u * 1.4, v * 2.4], { flip: true });
    hb.add(M.mat(), cv2, { tint: '#6a5838', ao: false });
    for (const x of [-0.4, 0.3]) hb.add(M.bamboo(), place(new THREE.TorusGeometry(0.4, 0.018, 4, 16, PI), { x, y: 0.4, ry: PI / 2, rz: 0 }), { tint: '#7a6040', ao: false });
    // scull oar at the stern resting in its pin
    const st = P(-1, 0); hb.add(M.wood(), gRod([st[0] + 0.4, 0.62, 0.05], [st[0] - 0.75, 0.05, 0.12], 0.022, 0.02, 5), { tint: '#7a5634', ao: false });
    hb.add(M.wood(), gBox(0.3, 0.02, 0.09, { x: st[0] - 0.8, y: 0.0, z: 0.12, rz: 0.55 }), { tint: '#7a5634', ao: false });
    // coil of rope & a basket
    hb.add(M.wood(), place(new THREE.TorusGeometry(0.08, 0.025, 5, 12), { x: 0.6, y: 0.24, rx: PI / 2 }), { tint: '#b8a070', ao: false });
    hb.add(M.mat(), gCyl(0.1, 0.08, 0.14, 10, { x: -0.65, y: 0.16 }), { tint: '#a88a52', ao: false });
    void rnd;
    const hull = hb.build(); hull.name = 'bob'; hull.position.y = -0.2;
    return B.build([hull]);
  }
  def('boat_small', {
    build() { return buildSampan(); },
    update(node, o, t) { const s = seedOf(o), h = node.getObjectByName('bob'); if (h) { h.position.y = -0.2 + sin(t * 1.4 + s) * 0.03; h.rotation.x = sin(t * 1.1 + s) * 0.04; h.rotation.z = sin(t * 0.9 + s * 1.3) * 0.025; } },
  });
  function buildFerry(o) {
    const sp = { a: 1.85, b: 0.72, full: 0.6, wf: (u) => (u > 0 ? lerp(1, 0.25, pow(u, 1.8)) : lerp(1, 0.68, pow(-u, 2.5))), sh: (u) => 0.62 + 0.25 * pow(abs(u), 3) + (u > 0 ? 0.25 * pow(u, 4) : 0.1 * pow(-u, 3)), kl: (u) => 0.02 + 0.28 * pow(abs(u), 3) };
    const tex = G.R3M.tex('ac:ferry', 512, 256, (g, w, h) => {
      const side = G.U.makeCanvas(512, 128, 1), s = side.getContext('2d');
      s.fillStyle = '#4a3220'; s.fillRect(0, 0, 512, 128);
      for (let y = 0; y < 128; y += 18) { s.fillStyle = 'rgba(0,0,0,0.3)'; s.fillRect(0, y, 512, 2); s.fillStyle = 'rgba(255,220,180,0.06)'; s.fillRect(0, y + 2, 512, 2); }
      s.fillStyle = '#7a2a1c'; s.fillRect(0, 0, 512, 12); s.fillStyle = '#d8b050'; s.fillRect(0, 12, 512, 3);
      s.fillStyle = '#1a1414'; s.fillRect(0, 96, 512, 32);
      s.save(); s.translate(452, 40); s.scale(1, 0.75); s.fillStyle = '#c4281f'; ell(s, 0, 0, 22, 17); s.fill(); s.fillStyle = '#f2ede0'; ell(s, 0, 0, 17, 12); s.fill(); s.fillStyle = '#1a0c08'; ell(s, 3, 0, 8, 8); s.fill(); s.fillStyle = '#fff'; ell(s, 1, -3, 2.4, 2.4); s.fill(); s.restore();
      g.drawImage(side, 0, 0, 512, 128); g.save(); g.translate(0, 256); g.scale(1, -1); g.drawImage(side, 0, 0, 512, 128); g.restore();
    });
    const hm = mat('ferry', () => G.R3M.env({ map: tex, vertexColors: true, roughness: 0.65 }));
    const B = new Builder(), hb = new Builder();
    const P = buildHull(hb, sp, hm, { nu: 44, nv: 14, thick: 0.045, innerTint: '#5a3e28', rimTint: '#3a2416', transomTint: '#4a3220' });
    const dy = (u) => sp.sh(u) - 0.2;
    hb.add(M.wood(), gGrid(20, 4, (u, v) => { const U = lerp(-0.92, 0.92, u), w = sp.b * sp.wf(U) - 0.06; return [sp.a * U, dy(U), lerp(-w, w, v)]; }, (u, v) => [v * 1.4, u * 3.6]), { tint: '#9a7452', ao: false });
    // cabin: mat barrel roof on posts, open ends; benches inside
    const cyb = dy(0);
    for (const x of [-0.55, 0.55]) for (const z of [-0.5, 0.5]) hb.add(M.wood(), gCyl(0.03, 0.03, 0.6, 6, { x, y: cyb, z }), { tint: '#3a2416', ao: false });
    hb.add(M.mat(), gGrid(12, 10, (u, v) => { const a = lerp(-PI / 2, PI / 2, v); return [lerp(-0.65, 0.65, u), cyb + 0.55 + 0.42 * cos(a) * 0.9, 0.58 * sin(a)]; }, (u, v) => [u * 2.6, v * 3]), { tint: '#b09868', ao: false });
    hb.add(M.mat(), gGrid(12, 10, (u, v) => { const a = lerp(-PI / 2, PI / 2, v); return [lerp(-0.65, 0.65, u), cyb + 0.55 + 0.4 * cos(a) * 0.9, 0.56 * sin(a)]; }, (u, v) => [u * 2.6, v * 3], { flip: true }), { tint: '#4a3a24', ao: false });
    for (const z of [-0.35, 0.35]) hb.add(M.wood(), gBox(1.0, 0.04, 0.2, { y: cyb + 0.25, z }), { tint: '#7a5634', ao: false });
    hb.add(glowM('#ffb060', 0.5), gBox(0.02, 0.2, 0.3, { x: -0.5, y: cyb + 0.3 }), { ao: false, cast: false });
    // stern scull, bow lantern pole (curved) with lantern
    const st = P(-1, 0); hb.add(M.wood(), gRod([st[0] + 0.5, dy(-0.8) + 0.35, 0.08], [st[0] - 0.9, -0.05, 0.2], 0.028, 0.025, 5), { tint: '#5a3c22', ao: false });
    hb.add(M.wood(), gBox(0.36, 0.025, 0.11, { x: st[0] - 0.95, y: -0.1, z: 0.2, rz: 0.45 }), { tint: '#5a3c22', ao: false });
    const bp = P(0.9, 1);
    const pole = [[bp[0] - 0.05, dy(0.9), 0], [bp[0] + 0.05, dy(0.9) + 0.7, 0], [bp[0] - 0.02, dy(0.9) + 1.35, 0], [bp[0] - 0.22, dy(0.9) + 1.65, 0]];
    hb.add(M.wood(), gTube(pole, 0.03, 16, 5), { tint: '#3a2416', ao: false });
    const col = o.color || '#ffcf6a';
    const lan = lantern('flan', col === '#ffcf6a' ? '#e8a33a' : col, 0.12, { cord: 0.1, tassel: true, k: 1.8 });
    lan.position.set(bp[0] - 0.22, dy(0.9) + 1.62, 0);
    const hull = hb.build([lan]); hull.name = 'bob'; hull.position.y = -0.24;
    return B.build([hull]);
  }
  const ferryTop = () => 0.62 + 0.25 * pow(0.9, 3) + 0.25 * pow(0.9, 4) - 0.2 + 1.62 - 0.24 - 0.25;
  def('boat_ferry', {
    key: (o) => o.color || '',
    build(o) { return buildFerry(o); },
    update(node, o, t) { const s = seedOf(o), h = node.getObjectByName('bob'); if (h) { h.position.y = -0.24 + sin(t * 1.4 + s) * 0.03; h.rotation.x = sin(t * 1.0 + s) * 0.03; h.rotation.z = sin(t * 0.8 + s * 1.3) * 0.02; } swayAll(node, ['flan'], t, s, 0.12, 1.3); },
    lights: (o) => [{ x: 1.85 * 0.9 * 0.93 - 0.22, y: ferryTop(), z: 0, color: o.color || '#ffcf6a', intensity: 1.2, distance: 5, flicker: 0.3 }],
  });

  // ################################################################################################
  //  DOCK_POST — wooden piling(s) with rope wraps and green weed at the waterline. v0 single, v1 pair
  //  joined by a slack rope (variant picked from position like the 2D def unless o.v is set).
  // ################################################################################################
  const dockV = (o) => (o.v != null ? ((o.v | 0) % 2 + 2) % 2 : floor((G.U && G.U.hash ? G.U.hash(o.x | 0, o.y | 0, 61) : hash2(o.x | 0, o.y | 0, 61)) * 2) % 2);
  function buildDock(v) {
    const B = new Builder(), rnd = RNG(6161 + v);
    const pile = (x, z, r, top) => {
      B.add(M.wood(), gCyl(r * 0.92, r, top + 0.6, 9, { x, y: -0.6, z }, { ou: rnd() }), { tint: '#9a8062', ao: false, aofn: (x2, y2) => (y2 < 0.15 ? lerp(0.45, 1, sstep(-0.6, 0.15, y2)) : 1) });
      B.add(M.wood(), gCyl(r * 0.92, r * 0.92, 0.012, 9, { x, y: top, z }), { tint: '#c8a888', ao: false });
      B.add(M.paint(), gCyl(r * 1.02, r * 1.04, 0.25, 9, { x, y: -0.12, z }, { open: true }), { tint: '#3a5a32', ao: false });
      for (let k = 0; k < 4; k++) B.add(M.wood(), place(new THREE.TorusGeometry(r + 0.012, 0.016, 4, 14), { x, y: top - 0.28 - k * 0.045, z, rx: PI / 2 }), { tint: '#d8c8a0', ao: false });
      for (let i = 0; i < 5; i++) { const a = rnd() * TAU; B.add(M.paint(), gSphere(0.018, { x: x + cos(a) * r, y: -0.05 + rnd() * 0.15, z: z + sin(a) * r }, 5, 4), { tint: '#e8e4d8', ao: false }); }
    };
    if (v === 0) pile(0, 0, 0.13, 1.05);
    else {
      pile(-0.16, -0.08, 0.11, 1.0); pile(0.17, 0.1, 0.095, 0.82);
      B.add(M.wood(), gTube([[-0.16, 0.8, -0.08], [0, 0.6, 0.02], [0.17, 0.68, 0.1]], 0.014, 10, 4), { tint: '#d8c8a0', ao: false });
    }
    return B.build();
  }
  // G.Models.create() replaces o.v with 0 for defs without `variants`, so the position-hashed variant
  // is resolved in key() (called with the original instance just before build) and carried over.
  let dockPick = 0;
  def('dock_post', { key: (o) => String(dockPick = dockV(o)), build() { return buildDock(dockPick); } });

  // ################################################################################################
  //  GUZHAO — 孤棚 of 頭城搶孤 (Ghost-Month climbing festival): twelve greased poles (孤柱) carry a plank
  //  platform with an overhanging rim (倒爬), skirted in red with gold; on it thirteen 孤棧 — conical
  //  bamboo frames hung with rings of offerings — each crowned by a 順風旗; red lanterns on the rim.
  // ################################################################################################
  const tOffer = () => texSet('offer', 256, 256, (g, hg, w, h, r) => {
    const pal = ['#e8d8b0', '#d2352a', '#f0c23a', '#f2efe6', '#8a5a30', '#e07a2a', '#3a8a5a', '#f2a0a8', '#c8a060'];
    const rows = 16, rh = h / rows;
    for (let k = 0; k < rows; k++) {
      let x = -r() * 10;
      while (x < w) {
        const bw = 10 + r() * 12, c = shade(r.pick(pal), (r() - 0.5) * 0.15);
        const gr = g.createLinearGradient(0, k * rh, 0, (k + 1) * rh); gr.addColorStop(0, shade(c, 0.2)); gr.addColorStop(0.7, c); gr.addColorStop(1, shade(c, -0.45));
        g.fillStyle = gr; g.fillRect(x + 0.5, k * rh + 1, bw - 1, rh - 2);
        hg.fillStyle = '#e0e0e0'; hg.fillRect(x + 1, k * rh + 2, bw - 2, rh - 4);
        if (r() < 0.3) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 2, k * rh + 2, 2, rh * 0.4); }
        x += bw;
      }
      g.fillStyle = 'rgba(30,15,5,0.5)'; g.fillRect(0, (k + 1) * rh - 1.5, w, 1.5); hg.fillStyle = '#000'; hg.fillRect(0, (k + 1) * rh - 2, w, 2);
    }
  }, { strength: 3 });
  const tGrease = () => texSet('grease', 64, 256, (g, hg, w, h, r) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#5a4030'); gr.addColorStop(0.3, '#2e1e14'); gr.addColorStop(1, '#0e0805'); g.fillStyle = '#2a1a10'; g.fillRect(0, 0, w, h); void gr;
    for (let i = 0; i < 50; i++) { const x = r() * w, y = r() * h, l = 10 + r() * 50; g.fillStyle = rgba(r() < 0.5 ? '#1a0e06' : '#6a5038', 0.5); g.fillRect(x, y, 2 + r() * 3, l); hg.fillStyle = '#ffffff'; hg.fillRect(x, y, 3, l); }
  }, { strength: 2 });
  function buildGuzhao() {
    const B = new Builder(), rnd = RNG(1313);
    const PH = 3.6, deckT = 0.22, poleXs = [-1.75, -0.6, 0.6, 1.75], poleZs = [-1.1, 0.06, 1.2];
    const gm = mat('grease', () => { const t = tGrease(); return G.R3M.env({ map: t.map, normalMap: t.normalMap, roughness: 0.22, metalness: 0.05, vertexColors: true }); });
    for (const x of poleXs) for (const z of poleZs) {
      B.add(gm, gCyl(0.12, 0.15, PH, 12, { x, z }, { us: 0.5, vs: 0.3 }), { ao: { h: 0.5, min: 0.6 } });
      B.add(M.paint(), gCyl(0.24, 0.27, 0.12, 10, { x, z }), { tint: '#8a857a' });
    }
    // cross bracing under the platform
    for (const z of poleZs) B.add(M.wood(), gBox(3.8, 0.16, 0.12, { y: PH - 0.4, z }, { grain: 'long' }), { tint: '#6e5034' });
    for (const x of poleXs) B.add(M.wood(), gBox(0.12, 0.16, 2.6, { x, y: PH - 0.22 }, { grain: 'long' }), { tint: '#6e5034' });
    // platform with overhanging rim (倒爬)
    const DX = 2.3, DZ0 = -1.55, DZ1 = 1.65;
    for (let i = 0; i < 18; i++) { const z = lerp(DZ0, DZ1, (i + 0.5) / 18); B.add(M.wood(), gBox(DX * 2, 0.06, (DZ1 - DZ0) / 18 - 0.01, { y: PH, z }, { grain: 'long', ou: rnd() * 3 }), { tint: '#a07a50', jitter: 0.2, rnd, ao: false }); }
    B.add(M.wood(), gBox(DX * 2 - 0.2, deckT - 0.06, DZ1 - DZ0 - 0.2, { y: PH - deckT + 0.06, z: (DZ0 + DZ1) / 2 }), { tint: '#4a3220', ao: false });
    // red skirt with gold sawtooth all round
    const skT = G.R3M.tex('ac:skirt', 256, 64, (g, w, h) => { g.fillStyle = '#c8302a'; g.fillRect(0, 0, w, h); g.fillStyle = '#4a3220'; g.fillRect(0, 0, w, 10); for (let x = 0; x < w; x += 32) { g.fillStyle = '#e2b04a'; poly(g, [x, h - 20, x + 32, h - 20, x + 16, h]); g.fill(); } g.fillStyle = '#e2b04a'; g.fillRect(0, h - 24, w, 5); }, { wrap: true });
    const skM = mat('skirt', () => G.R3M.env({ map: skT, vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
    const ring = [[-DX, DZ0], [DX, DZ0], [DX, DZ1], [-DX, DZ1], [-DX, DZ0]].map(([x, z]) => [x * 1.005, PH + 0.06, z + (z > 0 ? 0.005 : -0.005)]);
    const pts = []; for (let i = 0; i < 4; i++) for (let k = 0; k < 8; k++) { const a = ring[i], b = ring[i + 1]; pts.push([lerp(a[0], b[0], k / 8), a[1], lerp(a[2], b[2], k / 8)]); } pts.push(ring[4]);
    B.add(skM, gStrip(pts, 0.42, { us: 1.6 }), { ao: false });
    // 13 孤棧: cones of offering rings with bamboo ribs + 順風旗 flags
    const om = mat('offer', () => { const t = tOffer(); return G.R3M.env({ map: t.map, normalMap: t.normalMap, roughness: 0.75, vertexColors: true }); });
    const rows = [{ z: -1.2, xs: [0.1, 0.3, 0.5, 0.7, 0.9], h: 2.35 }, { z: -0.2, xs: [0.2, 0.4, 0.6, 0.8], h: 2.6 }, { z: 0.95, xs: [0.12, 0.37, 0.63, 0.88], h: 2.2 }];
    const flagB = new Builder(), fm = mat('flagcloth', () => G.R3M.env({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide, vertexColors: true }));
    rows.forEach((row, ri) => row.xs.forEach((fx, i) => {
      const x = lerp(-2, 2, fx), z = row.z + (rnd() - 0.5) * 0.08, big = ri === 1 && (i === 1 || i === 2);
      const h = row.h + (big ? 0.45 : 0) + rnd() * 0.15, br = 0.33, y0 = PH + 0.06;
      B.add(M.paint(), gCyl(br + 0.03, br + 0.05, 0.18, 14, { x, y: y0, z }), { tint: '#b8281e', ao: false });
      const prof = []; for (let k = 0; k <= 10; k++) { const t = k / 10; prof.push([lerp(br, 0.04, pow(t, 0.85)), 0.16 + t * (h - 0.3)]); }
      B.add(om, gLathe(prof, 14, { x, y: y0, z }, { us: 1 / (TAU * br * 0.6), vs: 0.9 / (h - 0.3) * 1.6 }), { ao: false, aofn: (x2, y2) => 0.75 + 0.25 * sstep(y0, y0 + 1, y2) });
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + ri; B.add(M.wood(), gRod([x + cos(a) * (br + 0.02), y0 + 0.16, z + sin(a) * (br + 0.02)], [x + cos(a) * 0.05, y0 + h - 0.1, z + sin(a) * 0.05], 0.01, 0.008, 3), { tint: '#d8c080', ao: false }); }
      B.add(M.wood(), gRod([x, y0 + h - 0.2, z], [x, y0 + h + 0.4, z], 0.018, 0.012, 4), { tint: '#c4aa6a', ao: false });
      B.add(M.paint(), gSphere(0.03, { x, y: y0 + h + 0.42, z }, 6, 4), { tint: '#e2b04a', ao: false });
      const fc = big ? '#d2352a' : rnd.pick(['#d2352a', '#f0c23a', '#2f8a5a', '#d2352a', '#f2efe6']);
      flagB.add(fm, flagGeo(x + 0.01, y0 + h + 0.38, z, big ? 0.36 : 0.28, 0.2, 1, true, 6), { tint: fc, ao: false });
    }));
    const flags = flagB.mesh('flags', fm, THREE.BufferGeometryUtils.mergeGeometries(flagB.parts.values().next().value.geos), { ao: false });
    // red lanterns hanging from the platform rim (front & back)
    for (let i = 0; i < 6; i++) for (const z of [DZ1 + 0.02, DZ0 - 0.02]) {
      const x = lerp(-DX, DX, (i + 0.5) / 6), y = PH - 0.45;
      B.add(M.wood(), gRod([x, PH - 0.36, z], [x, y, z], 0.005, 0.005, 3), { tint: '#2a1a10', ao: false });
      B.add(lanternMat('#d8352a', true, 1.4), gSphere(0.12, { x, y: y - 0.14, z, sy: 1.25 }, 10, 8), { ao: false, cast: false });
      B.add(M.paint(), gCyl(0.06, 0.06, 0.04, 8, { x, y: y - 0.32, z }), { tint: '#2a1a10', ao: false });
    }
    return B.build([flags]);
  }
  def('guzhao', {
    build() { return buildGuzhao(); },
    update(node, o, t) { flutter(node.getObjectByName('flags'), t, { amp: 0.05, freq: 5, k: 5, phase: seedOf(o), axis: [0, 0, 1] }); },
    lights: () => [-1.5, 0, 1.5].map((x) => ({ x, y: 3.0, z: 1.7, color: '#ff9040', intensity: 1, distance: 5, flicker: 0.4 })),
  });

  // ################################################################################################
  //  STONE_WEIR — 澎湖石滬: curved dry-stone fish-trap walls of basalt and coral stone (咾咕石) in the
  //  shallows. Uses the 2D def's exact path (v0 arc, v1 雙心 double heart) so the stones sit on the
  //  solid cells; wet waterline darkening and a pulsing foam line.
  // ################################################################################################
  function weirPath2D(W, H, v) { // identical to js/gfx/objects2.js weirPath (px)
    const pts = [];
    if ((v | 0) === 1) {
      const heart = (cx, cy, s) => { for (let i = 0; i <= 80; i++) { const a = i / 80 * TAU; pts.push([cx + 16 * pow(sin(a), 3) * s, cy - (13 * cos(a) - 5 * cos(2 * a) - 2 * cos(3 * a) - cos(4 * a)) * s]); } pts.push(null); };
      const s = min(W / 36, H / 58);
      heart(W / 2, H * 0.36, s * 0.9); heart(W / 2, H * 0.68, s * 1.05);
    } else {
      const cx = W / 2, cy = H - 8, rx = W / 2 - 14, ry = H - 22;
      for (let i = 0; i <= 90; i++) { const a = PI + i / 90 * PI; pts.push([cx + cos(a) * rx, cy + sin(a) * ry]); }
      pts.push(null);
    }
    const out = []; let prev = null, acc = 0;
    for (const p of pts) {
      if (!p) { prev = null; continue; }
      if (!prev) { out.push(p); prev = p; acc = 0; continue; }
      acc += hypot(p[0] - prev[0], p[1] - prev[1]);
      if (acc >= 5) { out.push(p); acc = 0; }
      prev = p;
    }
    return out;
  }
  const tCoral = () => texSet('coral', 256, 256, (g, hg, w, h, r) => {
    g.fillStyle = '#b8b0a0'; g.fillRect(0, 0, w, h); hg.fillStyle = '#b0b0b0'; hg.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { const x = r() * w, y = r() * h, rr = 1 + r() * 4; wrap(w, h, x, y, rr, (X, Y) => { g.fillStyle = rgba('#5a5448', 0.6); ell(g, X, Y, rr, rr * 0.8); g.fill(); hg.fillStyle = '#202020'; ell(hg, X, Y, rr, rr * 0.8); hg.fill(); }); }
    noiseFill(g, w, h, r, 900, '#e8e0cc', 0.1, 0.3, 1, 3);
  }, { strength: 4 });
  function buildWeir(o) {
    const w = o.w || 5, h = o.h || 3, v = o.v | 0, B = new Builder(), rnd = RNG(4242 + w * 13 + h * 7 + v);
    const pts = weirPath2D(w * TILE, h * TILE, v).map(([x, y]) => [x / TILE - w / 2, y / TILE - h / 2]);
    const cm = mat('coral', () => { const t = tCoral(); return G.R3M.env({ map: t.map, normalMap: t.normalMap, roughness: 0.95, vertexColors: true }); });
    const wet = (x, y) => (y < 0.0 ? 0.55 : 0.55 + 0.45 * sstep(0.0, 0.12, y));
    for (let i = 0; i < pts.length; i += 2) {
      const [x, z] = pts[i];
      for (let k = 0; k < 3; k++) {
        const basalt = rnd() < 0.62, r = 0.11 + rnd() * 0.07, y = k === 2 ? 0.1 + rnd() * 0.05 : -0.22 + k * 0.17;
        B.add(basalt ? M.stone() : cm, gRock(r, rnd, { x: x + (rnd() - 0.5) * 0.14, y, z: z + (rnd() - 0.5) * 0.12, ry: rnd() * TAU }, { squash: 0.75 }), { tint: basalt ? mix('#4a4642', '#5e5850', rnd()) : '#ffffff', ao: false, aofn: wet, jitter: 0.2, rnd });
      }
    }
    // foam line (additive strip both sides at the waterline), opacity pulsed in update()
    const foamT = G.R3M.tex('ac:foam', 256, 32, (g, W, H) => { g.clearRect(0, 0, W, H); for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + (i % 5) * 0.12})`; ell(g, (i * 37) % W, H / 2 + sin(i) * 6, 4 + (i % 7), 2 + (i % 3)); g.fill(); } }, { wrap: true });
    const fm = mat('foam', () => new THREE.MeshBasicMaterial({ map: foamT, transparent: true, opacity: 0.6, depthWrite: false, color: 0xeaf8ff, side: THREE.DoubleSide }));
    const segs = []; let run = [];
    for (let i = 0; i < pts.length; i++) { if (i && hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) > 0.4) { segs.push(run); run = []; } run.push(pts[i]); }
    segs.push(run);
    const fg = [];
    for (const sg of segs) if (sg.length > 2) for (const off of [-0.2, 0.2]) {
      const pos = [], uvs = []; let L = 0;
      for (let i = 0; i < sg.length - 1; i++) {
        const [x0, z0] = sg[i], [x1, z1] = sg[i + 1], dx = x1 - x0, dz = z1 - z0, l = hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
        const a0 = [x0 + nx * off, -0.05, z0 + nz * off], a1 = [x0 + nx * (off * 1.8), -0.05, z0 + nz * (off * 1.8)], b0 = [x1 + nx * off, -0.05, z1 + nz * off], b1 = [x1 + nx * (off * 1.8), -0.05, z1 + nz * (off * 1.8)];
        pos.push(...a0, ...a1, ...b0, ...b0, ...a1, ...b1); uvs.push(L, 0, L, 1, L + l, 0, L + l, 0, L, 1, L + l, 1); L += l;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.computeVertexNormals(); fg.push(g);
    }
    const extras = [];
    if (fg.length) { const foam = new THREE.Mesh(THREE.BufferGeometryUtils.mergeGeometries(fg), fm); foam.name = 'foam'; foam.castShadow = false; foam.receiveShadow = false; foam.renderOrder = 3; extras.push(foam); }
    return B.build(extras);
  }
  def('stone_weir', {
    variants: 2, // o.v: 0 arc, 1 雙心 double heart
    key: (o) => (o.w || 5) + 'x' + (o.h || 3),
    build(o) { return buildWeir(o); },
    update(node, o, t) { const f = node.getObjectByName('foam'); if (f) { f.material.opacity = 0.4 + 0.25 * sin(t * 1.7); if (f.material.map) f.material.map.offset.x = (t * 0.03) % 1; } },
  });

  // ################################################################################################
  //  RAINBOW_ARCH — the spirit rainbow bridge (彩虹橋 of Truku belief, seen only from afar in-story):
  //  a translucent, glowing ribbon arch of seven bands with light pulses walking across, drifting
  //  sparkles, misty feet. Non-solid, unlit/additive, never casts shadows. Footprint w×h (o.w/o.h).
  // ################################################################################################
  const RBC = ['#ff5a5a', '#ff9a40', '#ffe060', '#6ee07a', '#5ab0ff', '#6a6aff', '#c070ff'];
  let rainbowU = null;
  function rainbowMat() {
    if (!rainbowU) rainbowU = { uTime: { value: 0 }, uAlpha: { value: 1 } };
    return mat('rainbow', () => new THREE.ShaderMaterial({
      uniforms: rainbowU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, vertexColors: true,
      vertexShader: 'varying vec2 vUv; varying vec3 vCol; void main(){ vUv = uv; vCol = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime, uAlpha; varying vec2 vUv; varying vec3 vCol;
        void main(){
          float along = vUv.x, across = vUv.y;
          float edge = smoothstep(0.0, 0.18, across) * smoothstep(1.0, 0.82, across);
          float ends = smoothstep(0.0, 0.12, along) * smoothstep(1.0, 0.88, along);
          float p = 0.0; for (int k = 0; k < 3; k++) { float c = fract(uTime * 0.09 + float(k) / 3.0); p += exp(-pow((along - c) * 14.0, 2.0)); }
          float shimmer = 0.85 + 0.15 * sin(along * 60.0 - uTime * 2.0 + across * 6.0);
          vec3 col = vCol * (0.55 + 0.9 * p) * shimmer + vec3(0.25) * p;
          gl_FragColor = vec4(col * edge * ends * uAlpha, 1.0);
        }`,
    }));
  }
  function buildRainbow(o) {
    const w = o.w || 6, rx = w / 2 - 0.125, ry = min(w * 0.46 * TILE, 300) / TILE, NB = RBC.length, width = 0.62;
    const rm = rainbowMat();
    const N = 72, pos = [], col = [], uvs = [];
    const P = (t, rad) => { const a = PI - t * PI; return [cos(a) * (rx - rad), sin(a) * (ry - rad)]; };
    // main ribbon: bands radial (like a real rainbow), seen from the side; plus a walkable top face
    for (let b = 0; b < NB; b++) {
      const c = new THREE.Color(RBC[b]), r0 = b * width / NB, r1 = (b + 1) * width / NB;
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N, a = P(t0, r0), bq = P(t1, r0), cq = P(t0, r1), d = P(t1, r1);
        for (const z of [0]) {
          pos.push(a[0], a[1], z, cq[0], cq[1], z, bq[0], bq[1], z, bq[0], bq[1], z, cq[0], cq[1], z, d[0], d[1], z);
          const u0 = r0 / width, u1 = r1 / width;
          uvs.push(t0, u0, t0, u1, t1, u0, t1, u0, t0, u1, t1, u1);
          for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
        }
      }
    }
    // top "road" face: across z with the same seven colours as stripes
    const RW = 0.8;
    for (let b = 0; b < NB; b++) {
      const c = new THREE.Color(RBC[b]), z0 = -RW / 2 + b * RW / NB, z1 = z0 + RW / NB;
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N, a = P(t0, 0), bq = P(t1, 0);
        pos.push(a[0], a[1], z0, a[0], a[1], z1, bq[0], bq[1], z0, bq[0], bq[1], z0, a[0], a[1], z1, bq[0], bq[1], z1);
        const v0 = b / NB, v1 = (b + 1) / NB; uvs.push(t0, v0, t0, v1, t1, v0, t1, v0, t0, v1, t1, v1);
        for (let k = 0; k < 6; k++) col.push(c.r * 0.6, c.g * 0.6, c.b * 0.6);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeBoundingSphere();
    const ribbon = new THREE.Mesh(g, rm); ribbon.castShadow = false; ribbon.receiveShadow = false; ribbon.renderOrder = 6; ribbon.name = 'ribbon';
    const out = new THREE.Group(); out.add(ribbon);
    // halo: wide faint outer glow arc
    const hp = [], hc = [], hu = [];
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N, a = P(t0, -0.35), bq = P(t1, -0.35), cq = P(t0, width + 0.35), d = P(t1, width + 0.35);
      hp.push(a[0], a[1], 0.01, cq[0], cq[1], 0.01, bq[0], bq[1], 0.01, bq[0], bq[1], 0.01, cq[0], cq[1], 0.01, d[0], d[1], 0.01);
      hu.push(t0, 0, t0, 1, t1, 0, t1, 0, t0, 1, t1, 1); for (let k = 0; k < 6; k++) hc.push(0.16, 0.18, 0.24);
    }
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3)); hg.setAttribute('color', new THREE.Float32BufferAttribute(hc, 3)); hg.setAttribute('uv', new THREE.Float32BufferAttribute(hu, 2));
    const halo = new THREE.Mesh(hg, rm); halo.castShadow = false; halo.renderOrder = 5; out.add(halo);
    // sparkles (points) + misty feet
    const NS = 40, sp = new Float32Array(NS * 3), rnd = RNG(77 + w);
    for (let i = 0; i < NS; i++) { const t = rnd(), [x, y] = P(t, rnd() * width * 1.4 - 0.2); sp[i * 3] = x; sp[i * 3 + 1] = y; sp[i * 3 + 2] = (rnd() - 0.5) * 0.8; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const pts = new THREE.Points(sg, new THREE.PointsMaterial({ map: G.R3M.glowTex(), size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff, fog: false }));
    pts.name = 'sparkles'; out.add(pts);
    for (const [s, c] of [[-1, '#c8dcff'], [1, '#e0c8ff']]) { const m = haloCard(c, 2.4, 0.5); m.position.set(s * (rx - width / 2), 0.5, 0); m.name = 'mist' + (s > 0 ? 1 : 0); out.add(m); }
    out.traverse((n) => { n.castShadow = false; n.userData.noMerge = true; });
    out.userData.noBounds = false;
    return out;
  }
  def('rainbow_arch', {
    key: (o) => (o.w || 6) + 'x' + (o.h || 2),
    build(o) { return buildRainbow(o); },
    update(node, o, t) {
      if (rainbowU) { rainbowU.uTime.value = t; rainbowU.uAlpha.value = 0.75 + 0.2 * sin(t * 1.1 + (o.x || 0)); }
      const p = node.getObjectByName('sparkles');
      if (p) { p.material.opacity = 0.6 + 0.4 * sin(t * 2.3); p.position.y = (t * 0.25) % 0.5 - 0.25; }
      for (const k of [0, 1]) { const m = node.getObjectByName('mist' + k); if (m) m.material.opacity = 0.35 + 0.15 * sin(t * 0.9 + k * 2); }
    },
    lights: (o) => { const w = o.w || 6; return [{ x: -w / 2 + 0.5, y: 0.6, z: 0, color: '#b8d0ff', intensity: 0.8, distance: 4, flicker: 0.2 }, { x: w / 2 - 0.5, y: 0.6, z: 0, color: '#e0b8ff', intensity: 0.8, distance: 4, flicker: 0.2 }]; },
  });

  // exported for tests / other teams' reference
  G.ArchCoast = { RNG, Builder, texSet, M, gBox, gCyl, gRod, gTube, gLathe, gGrid, gRock, flutter };
})();
