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
    for (let i = 0; i < 30; i++) { const x = r() * w, y = r() * h, rr = 4 + r() * 16; wrap(w, h, x, y, rr, (X, Y) => { g.fillStyle = rgba(r.pick(['#9aa04a', '#c8c070', '#b8b8a0', '#7a9a5a']), 0.28 + r() * 0.2); ell(g, X, Y, rr, rr * 0.7, r()); g.fill(); }); }
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
    paint: () => { const t = tPaint(); return envM('paint', { map: t.map, normalMap: t.normalMap, roughness: 0.6 }); },
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
  const glowM = (color, intensity = 2.5) => mat('glow' + color + intensity, () => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 1 }));

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
    B.add(M.gloss(), gLathe([[LR + 0.12, ly2], [LR + 0.1, ly2 + 0.06], [0.42, ly2 + 0.3], [0.2, ly2 + 0.52], [0.06, ly2 + 0.64], [0.0, ly2 + 0.66]], 24), { tint: copper, ao: false, aofn: (x, y) => 0.85 + 0.15 * sstep(ly2, ly2 + 0.6, y) });
    B.add(M.gloss(), gSphere(0.1, { y: ly2 + 0.74 }, 12, 8), { tint: copper, ao: false });
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
    B.add(lit ? glowM('#ffc070', 1.4) : M.plain(), fan, { tint: lit ? undefined : '#2a2e36', ao: false });
    // windows staggered around the tower
    const wins = [[2.2, 0.0], [3.9, PI * 0.75], [5.5, -PI * 0.6], [3.0, PI * 1.25]];
    for (const [wy, a] of wins) {
      const r = lerp(LH.r0, LH.r1, (wy - LH.y0) / (LH.y1 - LH.y0)) + 0.01;
      const x = sin(a) * r, z = cos(a) * r;
      B.add(M.paint(), gBox(0.32, 0.6, 0.1, { x, y: wy - 0.05, z, ry: a }), { tint: '#3a4a52' });
      B.add(lit ? glowM('#ffcf80', 1.2) : M.plain(), gBox(0.2, 0.44, 0.04, { x: sin(a) * (r + 0.04), y: wy + 0.02, z: cos(a) * (r + 0.04), ry: a }), { tint: lit ? undefined : '#2a2e36', ao: false });
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
      const d = (lip * course(V) + 0.025 * sin(U * 3.1 + V * 1.7) * sin(U * 1.3 - V * 2.3)) * edge + (sp.flare || 0) * pow(v, 4);
      pos.setXYZ(i, pos.getX(i) + nor.getX(i) * d, pos.getY(i) + nor.getY(i) * d, pos.getZ(i) + nor.getZ(i) * d);
    }
    grid.computeVertexNormals();
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
      B.add(M.straw(), band, { tint: shade(tint === '#ffffff' ? '#d8c8a0' : tint, -0.25), ao: false });
    }
    // fringe: hanging straw tips around the eave
    if (sp.fringe !== 0) {
      const fh = sp.fringe || 0.16, pts = [];
      for (let i = 0; i <= nu * 2; i++) { const a = base(i / (nu * 2), 1); pts.push([a[0], a[1] - thick * 0.5 + 0.02, a[2]]); }
      const nrm = (i) => { const p = pts[i]; const x = p[0] - x0, z = p[2] - z0, l = hypot(x, z) || 1; return [x / l, z / l]; };
      const fg = gStrip(pts, fh, { out: 0.05, nrm, us: 1.2 });
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
      const base = (u, v) => { const x = lerp(-EX, EX, u); const z = sd * EZ * v; return [x, yR - (yR - yE) * v - sag * sin(PI * v) + sd * 0, z + z0]; };
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
      const pts = []; for (let i = 0; i <= 40; i++) { const p = base(i / 40, 1); pts.push([p[0], p[1] - thick * 0.4, p[2] + sd * 0.04]); }
      B.add(M.fringe(), gStrip(pts, sp.fringe || 0.14, { out: 0.04, nrm: () => [0, sd], us: 1.2 }), { ao: false });
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
    for (let x = x0 + 0.15; x < x1 - 0.1; x += opt.step || 0.32) B.add(M.rope(), place(new THREE.TorusGeometry(r + 0.006, 0.012, 4, 12), { x, y, z, ry: PI / 2 }), { tint: '#6a5430', ao: false });
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
    const postT = '#6a4a30';
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
      B.add(M.wood(), gBox(W - 0.1 + (rnd() - 0.5) * 0.06, 0.05, (H - 0.24) / 16 - 0.008, { y: fy, z }, { grain: 'long', ou: rnd() * 4 }), { tint: '#8a6444', jitter: 0.18, rnd, ao: { h: 1.05, min: 0.55 } });
    }
    // roof posts rising from the floor to the eave plate + low benches inside
    const eave = 2.25;
    for (const x of [-hx + 0.25, -hx / 3, hx / 3, hx - 0.25]) for (const z of [-hz + 0.25, hz - 0.25]) {
      B.add(M.wood(), gCyl(0.07, 0.08, eave - fy + 0.1, 7, { x, y: fy }), { tint: '#5a3c26', jitter: 0.2, rnd });
    }
    for (const z of [-hz + 0.25, hz - 0.25]) B.add(M.wood(), gRod([-hx + 0.1, eave, z], [hx - 0.1, eave, z], 0.07, 0.07, 7), { tint: '#4e3420' });
    for (const x of [-hx + 0.25, hx - 0.25]) B.add(M.wood(), gRod([x, eave, -hz + 0.2], [x, eave, hz - 0.2], 0.06, 0.06, 7), { tint: '#4e3420' });
    // central king posts to the ridge
    for (const x of [-0.9, 0.9]) B.add(M.wood(), gCyl(0.07, 0.07, 3.5 - fy, 7, { x, y: fy }), { tint: '#4e3420' });
    B.add(M.wood(), gRod([-1.4, 3.45, 0], [1.4, 3.45, 0], 0.08, 0.08, 7), { tint: '#4e3420' });
    // benches along the sides
    for (const z of [-hz + 0.45, hz - 0.45]) {
      if (z > 0) { // front bench split around the doorway
        const dx = -hx + door + 0.5;
        for (const [a, b] of [[-hx + 0.4, dx - 0.45], [dx + 0.45, hx - 0.4]]) if (b - a > 0.3) B.add(M.wood(), gBox(b - a, 0.06, 0.32, { x: (a + b) / 2, y: fy + 0.32, z }, { grain: 'long' }), { tint: '#6a4a2e' });
      } else B.add(M.wood(), gBox(W - 0.8, 0.06, 0.32, { y: fy + 0.32, z }, { grain: 'long' }), { tint: '#6a4a2e' });
    }
    // hearth: stone ring, ash bed, logs, fire (glow)
    const hy = fy + 0.05;
    B.add(M.plain(), gCyl(0.42, 0.44, 0.04, 16, { y: hy }), { tint: '#3a3028', ao: false });
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
    thatchHood(B, { RX: 1.45, EX: hx + 0.6, EZ: hz + 0.6, rc: hz + 0.2, yR: 3.7, yE: 1.95, courses: 9, lip: 0.08, thick: 0.28, fringe: 0.2, nu: 80,
      s: (v) => pow(sin(v * PI / 2), 0.8), p: (v) => pow(v, 1.5), tint: '#e6dcc4', weather: 0.35 });
    ridgeRoll(B, -1.5, 1.5, 3.74, 0, 0.12, { step: 0.36 });
    // fiteu (金草) tufts on the ridge — slim green leaves with yellow flower sprays
    const leafM = mat('leaf', () => G.R3M.env({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide, vertexColors: true }));
    for (const x of [-0.85, 0.05, 0.9]) {
      for (let k = 0; k < 7; k++) {
        const a = k / 7 * TAU + rnd(), lean = 0.35 + rnd() * 0.3, len = 0.28 + rnd() * 0.12;
        const lg = new THREE.PlaneGeometry(0.035, len, 1, 2); lg.translate(0, len / 2, 0);
        B.add(leafM, place(lg, { x, y: 3.9, z: 0, rx: lean * cos(a), rz: lean * sin(a), ry: a }), { tint: '#4f7a2e', ao: false });
      }
      for (let k = 0; k < 6; k++) B.add(glowM('#f2d24a', 0.25), gSphere(0.03, { x: x + (rnd() - 0.5) * 0.24, y: 4.12 + rnd() * 0.08, z: (rnd() - 0.5) * 0.24 }, 6, 4), { ao: false });
    }
    // rafters visible under the eaves
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * TAU, ex = cos(a) * (hx + 0.35), ez = sin(a) * (hz + 0.35);
      B.add(M.bamboo(), gRod([ex, 2.0, ez], [clamp(ex * 0.45, -1.4, 1.4), 3.45, ez * 0.08], 0.03, 0.03, 5), { tint: '#8a7448', ao: false });
    }
    return B.build();
  }
  def('kuba', {
    key: (o) => String(doorOf2(o, 4, 1)),
    build(o) { return buildKuba(o); },
    lights: () => [{ x: 0, y: 1.5, z: 0, color: '#ff9440', intensity: 1.3, distance: 6, flicker: 0.5 }],
  });

  // exported for tests / other teams' reference
  G.ArchCoast = { RNG, Builder, texSet, M, gBox, gCyl, gRod, gTube, gLathe, gGrid, gRock, flutter };
})();
