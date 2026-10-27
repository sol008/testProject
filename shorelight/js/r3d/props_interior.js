// 彼岸燈 — interior props in 3D (props team B). Contract: docs/CONTRACTS_3D.md. 2D source of truth for footprints,
// solid cells and variants: js/gfx/interior.js.
//
// How the models are made
//  · One shared painted ATLAS (2048², canvas-painted on first use) holds every generic surface: woods, lacquers, gold,
//    brass, bronze, glazes, cloth, paper, calligraphy … A matching ORM atlas (G = roughness, B = metalness) makes
//    brass shine and lacquer gloss inside the same material, so a whole piece of furniture is ONE draw call.
//    Three shared atlas materials: opaque, cut (alpha-tested, double-sided: lattice, leaves, fringe, threads) and lit
//    (emissive from the atlas × vertex colour: lantern paper, candle wax, embers).
//  · Parts are ordinary meshes tagged with a surface (`S.rose`, `S.lac` …). bake() gives them world-scale UVs inside
//    their atlas region (grain follows the long axis of each part), vertex AO (darker toward the floor and on
//    undersides) and an optional colour tint, then K.merge() merges by material.
//  · Big unique paintings (murals, screen landscape, rug, door curtain) get their own cached canvas textures.
//  · Animated parts stay separate: GPU flames and smoke/steam (camera-facing cards animated in the shader by a shared
//    time uniform, seeded by world position so clones differ), and swaying cloth / lanterns posed in update().
'use strict';
(() => {
  const PI = Math.PI, TAU = PI * 2;
  const FONT = '"Kaiti TC","STKaiti","Noto Serif TC",serif';
  const sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max, abs = Math.abs;
  const T3 = () => window.THREE;

  // ------------------------------------------------------------------ small utils
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgb2hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  function shade(h, a) { const [r, g, b] = hex2rgb(h); return a < 0 ? rgb2hex(r * (1 + a), g * (1 + a), b * (1 + a)) : rgb2hex(r + (255 - r) * a, g + (255 - g) * a, b + (255 - b) * a); }
  function mix(h1, h2, t) { const a = hex2rgb(h1), b = hex2rgb(h2); return rgb2hex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t); }
  function rgba(h, a) { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; }
  const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ------------------------------------------------------------------ canvas painting helpers
  function lgr(g, x0, y0, x1, y1, stops) { const gr = g.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
  function rgr(g, x, y, r, stops) { const gr = g.createRadialGradient(x, y, 0, x, y, r); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
  function speck(g, w, h, n, col, a, r, rmax, x0 = 0, y0 = 0) {
    for (let i = 0; i < n; i++) { g.fillStyle = rgba(col, a * (0.4 + r() * 0.6)); g.beginPath(); g.arc(x0 + r() * w, y0 + r() * h, 0.3 + r() * rmax, 0, TAU); g.fill(); }
  }
  // flowing wood grain along x (the long axis of each part maps onto u)
  function woodPaint(g, w, h, base, r, o = {}) {
    g.fillStyle = lgr(g, 0, 0, 0, h, [[0, shade(base, 0.05)], [0.5, base], [1, shade(base, -0.06)]]); g.fillRect(0, 0, w, h);
    // broad colour bands (heart/sap wood)
    for (let i = 0; i < 6; i++) {
      const y = r() * h, bh = h * (0.08 + r() * 0.2);
      g.fillStyle = rgba(r() < 0.5 ? shade(base, -0.25) : shade(base, 0.18), 0.12 + r() * 0.1);
      g.fillRect(0, y, w, bh);
    }
    const lines = o.lines || Math.round(h / 2.2);
    for (let i = 0; i < lines; i++) {
      const y0 = r() * h, amp = 0.6 + r() * (o.wave || 3), fr = 0.004 + r() * 0.012, ph = r() * 10, dark = r() < 0.7;
      g.strokeStyle = rgba(dark ? shade(base, -0.55) : shade(base, 0.35), dark ? 0.12 + r() * 0.22 : 0.08 + r() * 0.12);
      g.lineWidth = 0.5 + r() * (o.lw || 1.3);
      g.beginPath();
      for (let x = -4; x <= w + 4; x += 6) { const y = y0 + sin(x * fr + ph) * amp + sin(x * fr * 3.1 + ph * 2) * amp * 0.3; x < 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
    }
    // cathedral arches / knots
    const knots = o.knots == null ? 2 : o.knots;
    for (let k = 0; k < knots; k++) {
      const kx = r() * w, ky = r() * h;
      for (let i = 7; i >= 1; i--) {
        g.strokeStyle = rgba(shade(base, -0.5), 0.12 + (7 - i) * 0.02); g.lineWidth = 0.8;
        g.beginPath(); g.ellipse(kx, ky, i * 5.5, i * 1.6, 0, 0, TAU); g.stroke();
      }
      g.fillStyle = rgba(shade(base, -0.6), 0.5); g.beginPath(); g.ellipse(kx, ky, 3, 1.2, 0, 0, TAU); g.fill();
    }
    // pores
    for (let i = 0; i < w * h / 70; i++) { g.fillStyle = rgba(shade(base, -0.6), 0.18 + r() * 0.2); g.fillRect(r() * w, r() * h, 1.5 + r() * 4, 0.7); }
    if (o.sheen) { g.fillStyle = lgr(g, 0, 0, w, h, [[0, 'rgba(255,240,220,0)'], [0.45, 'rgba(255,240,220,0.08)'], [0.55, 'rgba(255,240,220,0)']]); g.fillRect(0, 0, w, h); }
  }
  function lacPaint(g, w, h, base, r) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h, rr = 10 + r() * 50; g.fillStyle = rgr(g, x, y, rr, [[0, rgba(r() < 0.5 ? shade(base, -0.3) : shade(base, 0.12), 0.2)], [1, rgba(base, 0)]]); g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
    for (let i = 0; i < 60; i++) { g.strokeStyle = rgba(shade(base, 0.4), 0.05 + r() * 0.07); g.lineWidth = 0.6; g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 6); g.stroke(); }
  }
  function metalPaint(g, w, h, base, r, patina) {
    g.fillStyle = lgr(g, 0, 0, w, h, [[0, shade(base, 0.2)], [0.5, base], [1, shade(base, -0.2)]]); g.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h / 40; i++) { g.fillStyle = rgba(r() < 0.5 ? shade(base, -0.4) : shade(base, 0.4), 0.06 + r() * 0.08); g.fillRect(r() * w, r() * h, 1 + r() * 6, 0.8); }
    if (patina) speck(g, w, h, w * h / 90, patina, 0.35, r, 4);
  }
  function txt(g, s, x, y, size, col, opts = {}) {
    g.save(); g.font = `${opts.weight || 'bold'} ${size}px ${FONT}`; g.textAlign = opts.align || 'center'; g.textBaseline = 'middle';
    if (opts.stroke) { g.strokeStyle = opts.stroke; g.lineWidth = opts.sw || size * 0.08; g.strokeText(s, x, y); }
    g.fillStyle = col; g.fillText(s, x, y); g.restore();
  }
  // vertical calligraphy column
  function vtxt(g, s, x, y0, y1, size, col, opts) {
    const ch = [...s], step = (y1 - y0) / ch.length;
    ch.forEach((c, i) => txt(g, c, x, y0 + step * (i + 0.5), size, col, opts));
  }

  // ------------------------------------------------------------------ atlas
  // region: { w, h, pw, ph (metres the region covers when projected), rough, metal, paint(g,w,h,r), orm?(g,w,h,r), alpha }
  const REG = {};
  function region(key, w, h, o, paint) { REG[key] = Object.assign({ w, h, pw: 1, ph: 1, rough: 0.8, metal: 0, paint }, o); }
  const AS = 2048, OS = 1024, PAD = 6;
  let atlas = null;
  function getAtlas() {
    if (atlas) return atlas;
    const keys = Object.keys(REG).sort((a, b) => REG[b].h - REG[a].h || REG[b].w - REG[a].w);
    const cv = document.createElement('canvas'); cv.width = cv.height = AS;
    const g = cv.getContext('2d');
    const ocv = document.createElement('canvas'); ocv.width = ocv.height = OS;
    const og = ocv.getContext('2d');
    og.fillStyle = 'rgb(0,204,0)'; og.fillRect(0, 0, OS, OS);
    const rects = {};
    // skyline bottom-left packing
    const sky = [{ x: 0, y: 0, w: AS }];
    let used = 0;
    const place = (W, H) => {
      let best = null;
      for (let i = 0; i < sky.length; i++) {
        const x0 = sky[i].x;
        if (x0 + W > AS) break;
        let y0 = 0, wl = W, j = i;
        while (wl > 0 && j < sky.length) { y0 = Math.max(y0, sky[j].y); wl -= sky[j].w; j++; }
        if (wl > 0 || y0 + H > AS) continue;
        if (!best || y0 < best.y || (y0 === best.y && x0 < best.x)) best = { x: x0, y: y0 };
      }
      if (!best) return null;
      // raise the skyline over [x, x+W)
      const nx = best.x, ny = best.y + H, out = [];
      for (const sg of sky) {
        const a = sg.x, b = sg.x + sg.w;
        if (b <= nx || a >= nx + W) { out.push(sg); continue; }
        if (a < nx) out.push({ x: a, y: sg.y, w: nx - a });
        if (b > nx + W) out.push({ x: nx + W, y: sg.y, w: b - nx - W });
      }
      out.push({ x: nx, y: ny, w: W });
      out.sort((p, q) => p.x - q.x);
      sky.length = 0;
      for (const sg of out) { const l = sky[sky.length - 1]; if (l && l.y === sg.y) l.w += sg.w; else sky.push(sg); }
      used = Math.max(used, ny);
      return best;
    };
    for (const k of keys) {
      const R = REG[k], W = R.w + PAD * 2, H = R.h + PAD * 2;
      const pos = place(W, H);
      if (!pos) { console.error('props_interior atlas overflow at', k); continue; }
      const x = pos.x, y = pos.y;
      const rc = document.createElement('canvas'); rc.width = R.w; rc.height = R.h;
      const rg = rc.getContext('2d'); rg.lineJoin = 'round'; rg.lineCap = 'round';
      try { R.paint(rg, R.w, R.h, rng(k.length * 977 + k.charCodeAt(0) * 31 + k.charCodeAt(k.length - 1))); } catch (e) { G.warnOnce('pi region ' + k, e); }
      const X = x + PAD, Y = y + PAD;
      // edge padding: stretch the border pixels outward so mips don't bleed
      g.drawImage(rc, 0, 0, R.w, 1, X, Y - PAD, R.w, PAD); g.drawImage(rc, 0, R.h - 1, R.w, 1, X, Y + R.h, R.w, PAD);
      g.drawImage(rc, 0, 0, 1, R.h, X - PAD, Y, PAD, R.h); g.drawImage(rc, R.w - 1, 0, 1, R.h, X + R.w, Y, PAD, R.h);
      g.drawImage(rc, X, Y);
      const s = OS / AS;
      og.fillStyle = `rgb(0,${Math.round(R.rough * 255)},${Math.round(R.metal * 255)})`;
      og.fillRect((X - PAD) * s, (Y - PAD) * s, W * s, H * s);
      if (R.orm) { og.save(); og.translate(X * s, Y * s); og.scale(s, s); try { R.orm(og, R.w, R.h, rng(k.length * 977 + k.charCodeAt(0) * 31 + k.charCodeAt(k.length - 1))); } catch (e) { G.warnOnce('pi orm ' + k, e); } og.restore(); }
      rects[k] = { x0: (X + 0.5) / AS, y0: (Y + 0.5) / AS, x1: (X + R.w - 0.5) / AS, y1: (Y + R.h - 0.5) / AS, R };
    }
    const map = G.R3M.canvasTex(cv); map.shared = true;
    const orm = G.R3M.canvasTex(ocv, { srgb: false }); orm.shared = true;
    atlas = { map, orm, rects, used, canvas: cv };
    return atlas;
  }

  // ------------------------------------------------------------------ materials
  const mats = new Map();
  function cacheMat(key, make) { if (!mats.has(key)) mats.set(key, make()); return mats.get(key); }
  // emissive × vertex colour (so tinted lantern paper glows in its own colour) — chained after the cutout patch
  function emissiveByVColor(mat) {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance *= vColor.rgb;\n#endif');
    };
    const pk = mat.customProgramCacheKey;
    mat.customProgramCacheKey = function () { return (pk ? pk.call(this) : '') + '|emvc'; };
    return mat;
  }
  function atlasMat(kind) {
    return cacheMat('atlas|' + kind, () => {
      const A = getAtlas(), THREE = T3();
      const p = { map: A.map, roughnessMap: A.orm, metalnessMap: A.orm, roughness: 1, metalness: 1, vertexColors: true };
      if (kind === 'cut') Object.assign(p, { alphaTest: 0.5, side: THREE.DoubleSide });
      if (kind === 'lit') Object.assign(p, { emissive: new THREE.Color(0xffffff), emissiveMap: A.map, emissiveIntensity: 1.7 });
      const m = G.R3M.env(p);
      if (kind === 'cut') m.shadowSide = THREE.DoubleSide;
      if (kind === 'lit') emissiveByVColor(m);
      return m;
    });
  }
  // one-off painted texture material (murals, screen, rug, curtain). paint(g, w, h, r)
  function paintedMat(key, w, h, paint, p = {}) {
    return cacheMat('paint|' + key, () => {
      const THREE = T3();
      const tx = G.R3M.tex('pi_' + key, w, h, (g, W, H) => { g.lineJoin = 'round'; g.lineCap = 'round'; paint(g, W, H, rng(w * 7 + h + key.length * 131)); });
      const m = G.R3M.env(Object.assign({ map: tx, roughness: 0.85, vertexColors: true }, p.cut ? { alphaTest: 0.45, side: THREE.DoubleSide } : {}, p.params || {}));
      return m;
    });
  }

  // ------------------------------------------------------------------ surfaces
  // a surface = { r: atlas region, k: material kind '', 'cut', 'lit', g: grain axis 'x'|'y'|'z' (default: longest),
  //   fit: true → use the geometry's own 0..1 uv inside the region, cell: [i, cols, rows] sub-rect for fit,
  //   faces: { x|y|z: region } per dominant-normal override, tint: '#hex', ao: multiplier, aoMin }
  const S = {};
  function surf(base, o) { return Object.assign({}, typeof base === 'string' ? S[base] || { r: base } : base, o); }

  // ------------------------------------------------------------------ geometry helpers
  // every helper: (parent, ..., surface, x, y, z, opts) → mesh; y is the BOTTOM of the part (like K.box)
  function mk(par, geo, s, x, y, z, o = {}) {
    const THREE = T3();
    const m = new THREE.Mesh(geo, null);
    m.position.set(x || 0, y || 0, z || 0);
    if (o.rx || o.ry || o.rz) m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'XYZ');
    if (o.s != null) { if (typeof o.s === 'number') m.scale.setScalar(o.s); else m.scale.set(o.s[0], o.s[1], o.s[2]); }
    m.userData.surf = typeof s === 'string' ? (S[s] || { r: s }) : s;
    m.castShadow = o.cast !== false; m.receiveShadow = true;
    if (par) par.add(m);
    return m;
  }
  function box(par, w, h, d, s, x, y, z, o) { const g = new (T3().BoxGeometry)(w, h, d); g.translate(0, h / 2, 0); return mk(par, g, s, x, y, z, o); }
  function rbox(par, w, h, d, r, s, x, y, z, o) { const g = new (T3().RoundedBoxGeometry)(w, h, d, 2, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)); g.translate(0, h / 2, 0); return mk(par, g, s, x, y, z, o); }
  function cyl(par, rt, rb, h, s, x, y, z, o = {}) { const g = new (T3().CylinderGeometry)(rt, rb, h, o.seg || 10, 1, !!o.open); g.translate(0, h / 2, 0); return mk(par, g, s, x, y, z, o); }
  // horizontal/vertical rod centred on (x, y, z) along axis 'x' | 'y' | 'z'
  function rod(par, r, len, s, x, y, z, axis = 'x', o = {}) {
    const g = new (T3().CylinderGeometry)(o.r2 != null ? o.r2 : r, r, len, o.seg || 8, 1, !!o.open);
    if (axis === 'x') g.rotateZ(-PI / 2); else if (axis === 'z') g.rotateX(PI / 2);
    return mk(par, g, s, x, y, z, o);
  }
  function sph(par, r, s, x, y, z, o = {}) { const g = new (T3().SphereGeometry)(r, o.seg || 10, o.hseg || Math.max(4, ((o.seg || 10) * 0.6) | 0)); return mk(par, g, s, x, y, z, o); }
  // lathe from [[radius, y], ...]
  function lathe(par, pts, s, x, y, z, o = {}) { const THREE = T3(); const g = new THREE.LatheGeometry(pts.map(([r, yy]) => new THREE.Vector2(Math.max(0.0005, r), yy)), o.seg || 16); return mk(par, g, s, x, y, z, o); }
  function plane(par, w, h, s, x, y, z, o) { const g = new (T3().PlaneGeometry)(w, h); return mk(par, g, s, x, y, z, o); }
  // extrude a 2D outline (x right, y up, metres) by depth along +z, centred on z
  function extrude(par, pts, depth, s, x, y, z, o = {}) {
    const THREE = T3();
    const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: !!o.bevel, bevelSize: o.bevel || 0, bevelThickness: o.bevel || 0, bevelSegments: 1, curveSegments: o.curve || 6 });
    g.translate(0, 0, -depth / 2);
    return mk(par, g, s, x, y, z, o);
  }
  // tube along points [[x,y,z]...]
  function tube(par, pts, r, s, o = {}) {
    const THREE = T3();
    const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const g = new THREE.TubeGeometry(c, o.seg || 12, r, o.rseg || 6, false);
    return mk(par, g, s, 0, 0, 0, o);
  }
  function grp(par, x = 0, y = 0, z = 0, ry = 0, name) {
    const g = new (T3().Group)(); g.position.set(x, y, z); g.rotation.y = ry; if (name) g.name = name; if (par) par.add(g); return g;
  }
  // sample points of a curve outline helper: cloud-scroll apron bottom edge between x0..x1, depth of the dip
  // carved apron (牙板) outline, w × h, centred on x, bottom edge cut into the 壼門 profile: drops to full depth at
  // the corners (牙頭), arches up by `dip`, with a small hanging cusp in the middle
  function apronShape(w, h, dip, cusp = 0.35) {
    const pts = [[-w / 2, h], [w / 2, h]];
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const t = i / n, xx = w / 2 - t * w, e = abs(t - 0.5) * 2;
      let yy = dip * sstep(0.97, 0.72, e) * (1 - cusp * Math.exp(-((e * 7) ** 2))) + dip * 0.12 * sin(e * PI * 3) * sstep(0.95, 0.75, e);
      pts.push([xx, Math.max(0, Math.min(h * 0.9, yy))]);
    }
    return pts;
  }

  // ------------------------------------------------------------------ bake: atlas UVs + vertex AO + tint
  const _v = [], _n = [];
  function bakeMesh(m, idx) {
    const THREE = T3();
    const s = m.userData.surf;
    if (!s || m.userData.baked) return;
    const A = getAtlas();
    let geo = m.geometry.clone();
    m.geometry = geo;
    m.userData.baked = true;
    m.material = atlasMat(s.k || '');
    if (s.mat) m.material = s.mat;
    const pos = geo.attributes.position, nor = geo.attributes.normal, n = pos.count;
    if (!nor) { geo.computeVertexNormals(); }
    const N = geo.attributes.normal;
    const mw = m.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(mw);
    const P = new Float32Array(n * 3), NN = new Float32Array(n * 3);
    const v = new THREE.Vector3(), nv = new THREE.Vector3();
    const bmin = [1e9, 1e9, 1e9], bmax = [-1e9, -1e9, -1e9];
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mw); nv.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; NN[i * 3] = nv.x; NN[i * 3 + 1] = nv.y; NN[i * 3 + 2] = nv.z;
      for (let a = 0; a < 3; a++) { const c = P[i * 3 + a]; if (c < bmin[a]) bmin[a] = c; if (c > bmax[a]) bmax[a] = c; }
    }
    const size = [bmax[0] - bmin[0], bmax[1] - bmin[1], bmax[2] - bmin[2]];
    const AX = { x: 0, y: 1, z: 2 };
    const gAx = s.g ? AX[s.g] : (size[0] >= size[1] && size[0] >= size[2] ? 0 : size[1] >= size[2] ? 1 : 2);
    const uv0 = geo.attributes.uv;
    const uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    const tint = s.tint ? new THREE.Color(s.tint) : null;
    const rr = rng((idx + 1) * 7919 + (s.seed || 0));
    const offs = {};
    for (let i = 0; i < n; i++) {
      const nx = NN[i * 3], ny = NN[i * 3 + 1], nz = NN[i * 3 + 2];
      const ax = abs(nx) > abs(ny) ? (abs(nx) > abs(nz) ? 0 : 2) : (abs(ny) > abs(nz) ? 1 : 2);
      const fo = (s.faces && s.faces['xyz'[ax] + (([nx, ny, nz][ax] > 0) ? '+' : '-')]) || (s.faces && s.faces['xyz'[ax]]);
      const rk = fo ? (fo.r || fo) : s.r;
      const cell = fo ? fo.cell : s.cell;
      const rc = A.rects[rk] || A.rects.missing;
      let U, V;
      if (s.mat && uv0) {
        // own (non-atlas) texture: keep the geometry uv, optional cell sub-rect
        U = uv0.getX(i); V = 1 - uv0.getY(i);
        if (s.flipU) U = 1 - U;
        if (s.cell) { const [ci, cc, cr] = s.cell; U = ((ci % cc) + U) / cc; V = (((ci / cc) | 0) + V) / cr; }
        uv[i * 2] = U; uv[i * 2 + 1] = 1 - V;
      } else if (s.fit && uv0 && !fo) {
        U = uv0.getX(i); V = 1 - uv0.getY(i);
        if (s.flipU) U = 1 - U;
      } else if (s.stretch) {
        const inPlane = [0, 1, 2].filter((a) => a !== ax);
        const ua = inPlane.includes(gAx) ? gAx : inPlane[0], va = inPlane[0] === ua ? inPlane[1] : inPlane[0];
        U = ua === 1 ? (bmax[1] - P[i * 3 + 1]) / (size[1] || 1) : (P[i * 3 + ua] - bmin[ua]) / (size[ua] || 1);
        V = va === 1 ? (bmax[1] - P[i * 3 + 1]) / (size[1] || 1) : (P[i * 3 + va] - bmin[va]) / (size[va] || 1);
      } else {
        // planar projection: u along the grain axis (or the first in-plane axis for end grain)
        const inPlane = [0, 1, 2].filter((a) => a !== ax);
        let ua, va;
        if (gAx !== ax) { ua = gAx; va = inPlane[0] === gAx ? inPlane[1] : inPlane[0]; } else { ua = inPlane[0]; va = inPlane[1]; }
        const R = rc.R, pw = R.pw, ph = R.ph;
        const ru = size[ua], rv = size[va];
        const su = ru > pw ? pw / ru : 1, sv = rv > ph ? ph / rv : 1;
        const ok = rk + ua + va;
        if (!offs[ok]) offs[ok] = [rr() * Math.max(0, pw - ru * su), rr() * Math.max(0, ph - rv * sv)];
        // y runs top → bottom in texture space so painted things stand upright
        const cu = ua === 1 ? bmax[1] - P[i * 3 + 1] : P[i * 3 + ua] - bmin[ua];
        const cv = va === 1 ? bmax[1] - P[i * 3 + 1] : P[i * 3 + va] - bmin[va];
        U = (cu * su + offs[ok][0]) / pw;
        V = (cv * sv + offs[ok][1]) / ph;
      }
      if (!(s.mat && uv0)) {
      U = Math.min(1, Math.max(0, U)); V = Math.min(1, Math.max(0, V));
      if (cell) { const [ci, cc, cr] = cell; U = ((ci % cc) + U) / cc; V = (((ci / cc) | 0) + V) / cr; }
      uv[i * 2] = rc.x0 + (rc.x1 - rc.x0) * U;
      uv[i * 2 + 1] = 1 - (rc.y0 + (rc.y1 - rc.y0) * V);
      }
      // AO: floor contact, undersides, optional surface multiplier
      const y = P[i * 3 + 1];
      let ao = (s.aoMin != null ? s.aoMin : 0.5) + (1 - (s.aoMin != null ? s.aoMin : 0.5)) * sstep(0, s.aoH || 0.4, y);
      if (ny < -0.5) ao *= 0.72;
      if (s.ao) ao *= s.ao;
      if (s.aoFn) ao *= s.aoFn(P[i * 3], y, P[i * 3 + 2]);
      if (s.k === 'lit') ao = Math.max(ao, 0.92);
      col[i * 3] = ao * (tint ? tint.r : 1); col[i * 3 + 1] = ao * (tint ? tint.g : 1); col[i * 3 + 2] = ao * (tint ? tint.b : 1);
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  function bake(root) {
    root.updateMatrixWorld(true);
    let i = 0;
    root.traverse((m) => { if (m.isMesh && m.userData.surf) bakeMesh(m, i++); });
  }
  // bake everything, merge the static part, re-attach dynamic children (named, animated in update)
  function finish(K, g, dyn = [], o = {}) {
    bake(g);
    for (const d of dyn) {
      d.updateMatrixWorld(true);
      const p = d.parent;
      if (p) { d.matrixWorld.decompose(d.position, d.quaternion, d.scale); p.remove(d); }
    }
    const root = K.merge(g);
    for (const d of dyn) {
      // animated groups: merge their own children (in the group's local frame) so each is one draw call per material
      if (!d.isMesh && d.children.length > 1 && !d.userData.keep) {
        const pos = d.position.clone(), q = d.quaternion.clone(), sc = d.scale.clone();
        d.position.set(0, 0, 0); d.quaternion.identity(); d.scale.set(1, 1, 1);
        const mg = K.merge(d);
        d.clear();
        for (const c of [...mg.children]) d.add(c);
        d.position.copy(pos); d.quaternion.copy(q); d.scale.copy(sc);
      }
      root.add(d);
    }
    if (o.spirit) root.traverse((m) => { if (m.isMesh && m.material && !m.material.isShaderMaterial) m.material = m.material.clone(); });
    return root;
  }

  // ------------------------------------------------------------------ FX: GPU flames & smoke
  const FX = { u: null };
  FX.uniforms = () => FX.u || (FX.u = { uTime: { value: 0 } });
  FX.tick = (t) => { FX.uniforms().uTime.value = t; };
  const FX_COMMON = `
    uniform float uTime;
    float seedOf(float s){ return s + dot(modelMatrix[3].xyz, vec3(0.731, 0.0, 1.379)); }`;
  function flameMat() {
    return cacheMat('fx|flame', () => {
      const THREE = T3();
      return new THREE.ShaderMaterial({
        uniforms: FX.uniforms(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `${FX_COMMON}
          attribute vec2 aCorner; attribute vec4 aP; // size, height, seed, intensity
          varying vec2 vUv; varying float vSeed, vI;
          void main(){
            float sd = seedOf(aP.z);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float fl = 1.0 + 0.13 * sin(uTime * 13.0 + sd * 7.0) + 0.08 * sin(uTime * 23.0 + sd * 3.0);
            float w = aP.x, h = aP.x * aP.y * fl;
            mv.xy += vec2(aCorner.x * w, (aCorner.y * 0.5 + 0.5) * h - w * 0.35);
            gl_Position = projectionMatrix * mv;
            vUv = aCorner; vSeed = sd; vI = aP.w;
          }`,
        fragmentShader: `
          uniform float uTime;
          varying vec2 vUv; varying float vSeed, vI;
          void main(){
            float y = vUv.y * 0.5 + 0.5;
            float sway = (sin(uTime * 6.0 + vSeed * 5.0 + y * 4.0) * 0.1 + sin(uTime * 11.0 + vSeed) * 0.05) * y;
            float x = vUv.x - sway;
            float wy = y < 0.25 ? 0.8 * sqrt(y / 0.25) : 0.8 * pow(max(0.0, 1.0 - (y - 0.25) / 0.75), 1.15);
            float d = abs(x) / max(wy, 0.001);
            float body = (1.0 - smoothstep(0.55, 1.0, d)) * step(0.0, wy - 0.001);
            float core = (1.0 - smoothstep(0.0, 0.6, d)) * (1.0 - smoothstep(0.15, 0.6, y));
            float halo = exp(-dot(vec2(vUv.x, y - 0.3), vec2(vUv.x, y - 0.3)) * 5.0) * 0.18;
            vec3 col = mix(vec3(1.0, 0.32, 0.06), vec3(1.0, 0.72, 0.25), smoothstep(0.0, 0.8, 1.0 - y)) * body;
            col += vec3(1.0, 0.95, 0.75) * core * 1.4;
            col += vec3(1.0, 0.55, 0.2) * halo;
            gl_FragColor = vec4(col * vI, 1.0);
          }`,
      });
    });
  }
  function smokeMat() {
    return cacheMat('fx|smoke', () => {
      const THREE = T3();
      return new THREE.ShaderMaterial({
        uniforms: FX.uniforms(), transparent: true, depthWrite: false,
        vertexShader: `${FX_COMMON}
          attribute vec2 aCorner; attribute vec4 aA; attribute vec4 aB; attribute vec2 aC; // aA: height,size,speed,seed  aB: rgb,opacity  aC: spread, curl
          varying vec2 vUv; varying float vA; varying vec3 vCol; varying float vSd;
          void main(){
            float sd = seedOf(aA.w);
            float life = fract(uTime * aA.z / aA.x + sd);
            vec3 p = position;
            float sp = aC.x * (0.15 + life);
            p.x += sin(life * 5.0 + uTime * 0.7 + sd * 6.3) * sp + sin(life * 11.0 + sd) * aC.y * life;
            p.z += cos(life * 4.0 + uTime * 0.5 + sd * 3.1) * sp;
            p.y += life * aA.x;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            float sz = aA.y * (0.3 + life * 1.5);
            float an = sd * 6.0 + life * 1.5;
            mv.xy += mat2(cos(an), -sin(an), sin(an), cos(an)) * aCorner * sz;
            gl_Position = projectionMatrix * mv;
            vUv = aCorner; vCol = aB.rgb; vSd = sd;
            vA = aB.w * smoothstep(0.0, 0.12, life) * (1.0 - life) * (1.0 - life);
          }`,
        fragmentShader: `
          varying vec2 vUv; varying float vA; varying vec3 vCol; varying float vSd;
          void main(){
            float r = length(vUv);
            float n = 0.7 + 0.3 * sin(vUv.x * 4.0 + vSd * 3.0) * sin(vUv.y * 5.0 - vSd * 2.0);
            float a = pow(max(0.0, 1.0 - r), 1.6) * vA * n;
            if (a < 0.003) discard;
            gl_FragColor = vec4(vCol, a);
          }`,
      });
    });
  }
  function fxMesh(kind, quads) {
    const THREE = T3();
    const n = quads.length;
    const pos = new Float32Array(n * 12), cor = new Float32Array(n * 8), idx = [];
    const a = new Float32Array(n * 16), b = new Float32Array(n * 16), c = new Float32Array(n * 8);
    const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    quads.forEach((q, i) => {
      for (let k = 0; k < 4; k++) {
        const j = i * 4 + k;
        pos.set([q.x, q.y, q.z], j * 3); cor.set(C[k], j * 2);
        a.set(q.a, j * 4); if (q.b) b.set(q.b, j * 4); if (q.c) c.set(q.c, j * 2);
      }
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aCorner', new THREE.BufferAttribute(cor, 2));
    if (kind === 'flame') g.setAttribute('aP', new THREE.BufferAttribute(a, 4));
    else { g.setAttribute('aA', new THREE.BufferAttribute(a, 4)); g.setAttribute('aB', new THREE.BufferAttribute(b, 4)); g.setAttribute('aC', new THREE.BufferAttribute(c, 2)); }
    g.setIndex(idx);
    g.computeBoundingSphere();
    if (g.boundingSphere) g.boundingSphere.radius += 1.5;
    const m = new THREE.Mesh(g, kind === 'flame' ? flameMat() : smokeMat());
    m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false;
    m.renderOrder = kind === 'flame' ? 3 : 2;
    m.name = 'fx_' + kind;
    m.userData.noMerge = true;
    return m;
  }
  // flames: [{x,y,z,s (half width), h (height/width), i (intensity), seed}]
  function flames(list) { return fxMesh('flame', list.map((f, k) => ({ x: f.x, y: f.y, z: f.z, a: [f.s || 0.02, f.h || 3, f.seed != null ? f.seed : k * 0.37, f.i || 1.6] }))); }
  // smoke emitters: [{x,y,z, n, h (rise), size, speed, col '#hex', op, spread, curl}]
  function smoke(list) {
    const q = [];
    for (const e of list) {
      const col = hex2rgb(e.col || '#d8d2c8').map((v) => (v / 255) ** 2.2);
      const n = e.n || 8;
      for (let i = 0; i < n; i++) q.push({ x: e.x, y: e.y, z: e.z, a: [e.h || 0.8, e.size || 0.06, e.speed || 0.25, i / n + (e.seed || 0)], b: [col[0], col[1], col[2], e.op || 0.35], c: [e.spread || 0.04, e.curl || 0.02] });
    }
    return fxMesh('smoke', q);
  }
  const phaseOf = (o) => ((((o.x | 0) * 73856093) ^ ((o.y | 0) * 19349663)) >>> 0) % 1000 / 1000 * TAU;

  // ------------------------------------------------------------------ define wrapper
  // adds spirit-safe material cloning to the cache key, and ticks the FX clock for animated models
  function define(id, d) {
    const key = d.key;
    G.Models.define(id, Object.assign({}, d, {
      key: (o) => (key ? key(o) : '') + (o.spirit ? '~sp' : ''),
      update: (node, o, t, dt) => { FX.tick(t); if (d.update) d.update(node, o, t, dt); },
    }));
  }

  // ================================================================== ATLAS REGIONS
  region('missing', 16, 16, {}, (g) => { g.fillStyle = '#ff00ff'; g.fillRect(0, 0, 16, 16); });
  // ---- woods (pw × ph metres per region; grain along u)
  const WOODS = {
    rose: ['#5a2418', 0.45, { wave: 2.2 }],        // 紅木 / 酸枝 rosewood, oiled
    teak: ['#7a4626', 0.6, {}],                    // 柚木
    walnut: ['#5e3c22', 0.62, {}],
    pine: ['#b48a5a', 0.75, { knots: 3, wave: 4 }], // 杉木, raw
    camphor: ['#94603a', 0.7, { knots: 2 }],        // 樟木 workbench
    oldwood: ['#7a6450', 0.85, { knots: 3, wave: 3 }], // weathered (bucket, loom)
    dark: ['#3a2216', 0.5, { wave: 1.5 }],          // ebonised
  };
  for (const k in WOODS) {
    const [base, rough, o] = WOODS[k];
    region('w_' + k, 512, 160, { pw: 1.6, ph: 0.5, rough }, (g, w, h, r) => woodPaint(g, w, h, base, r, Object.assign({ sheen: rough < 0.6 }, o)));
  }
  // bamboo culm: nodes every ~0.3 m along u
  region('bamboo', 512, 64, { pw: 1.6, ph: 0.2, rough: 0.5 }, (g, w, h, r) => {
    g.fillStyle = lgr(g, 0, 0, 0, h, [[0, '#a8843e'], [0.3, '#d8b86a'], [0.6, '#c9a560'], [1, '#8a6a30']]); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.fillStyle = rgba(r() < 0.5 ? '#7a5a24' : '#f0d898', 0.15); g.fillRect(0, r() * h, w, 0.8); }
    for (let x = 30 + r() * 20; x < w; x += 90 + r() * 15) {
      g.fillStyle = rgba('#5a3e18', 0.75); g.fillRect(x, 0, 3, h);
      g.fillStyle = rgba('#f4e0a8', 0.5); g.fillRect(x + 3, 0, 2, h);
      g.fillStyle = lgr(g, x - 14, 0, x, 0, [[0, 'rgba(90,60,20,0)'], [1, 'rgba(90,60,20,0.25)']]); g.fillRect(x - 14, 0, 14, h);
    }
  });
  // ---- lacquer & metals
  region('lac', 256, 256, { pw: 0.8, ph: 0.8, rough: 0.28 }, (g, w, h, r) => lacPaint(g, w, h, '#a8231b', r));
  region('lac_dark', 256, 128, { pw: 0.8, ph: 0.4, rough: 0.3 }, (g, w, h, r) => lacPaint(g, w, h, '#4a0e0a', r));
  region('lac_black', 256, 128, { pw: 0.8, ph: 0.4, rough: 0.25 }, (g, w, h, r) => lacPaint(g, w, h, '#1c1412', r));
  region('gold', 128, 128, { pw: 0.4, ph: 0.4, rough: 0.32, metal: 0.95 }, (g, w, h, r) => metalPaint(g, w, h, '#d9a84a', r));
  region('brass', 128, 128, { pw: 0.4, ph: 0.4, rough: 0.28, metal: 0.95 }, (g, w, h, r) => metalPaint(g, w, h, '#c99a48', r));
  region('bronze', 256, 256, { pw: 0.8, ph: 0.8, rough: 0.5, metal: 0.85 }, (g, w, h, r) => {
    metalPaint(g, w, h, '#8a6a36', r);
    // cast relief bands of 雷紋 thunder scrolls
    for (const yb of [0.22, 0.6]) {
      g.fillStyle = rgba('#3a2810', 0.35); g.fillRect(0, h * yb, w, h * 0.16);
      g.strokeStyle = rgba('#e0bc72', 0.45); g.lineWidth = 2;
      for (let x = 6; x < w; x += 28) { g.beginPath(); g.moveTo(x, h * (yb + 0.13)); g.lineTo(x, h * (yb + 0.03)); g.lineTo(x + 16, h * (yb + 0.03)); g.lineTo(x + 16, h * (yb + 0.1)); g.lineTo(x + 6, h * (yb + 0.1)); g.lineTo(x + 6, h * (yb + 0.07)); g.stroke(); }
    }
    // verdigris gathers in the recesses of the relief bands and drips below them
    for (const yb of [0.22, 0.6]) { speck(g, w, h * 0.18, 140, '#4f8a76', 0.45, r, 2.2, 0, h * yb); for (let i = 0; i < 14; i++) { const x = r() * w; g.fillStyle = lgr(g, 0, h * (yb + 0.16), 0, h * (yb + 0.3), [[0, 'rgba(79,138,118,0.35)'], [1, 'rgba(79,138,118,0)']]); g.fillRect(x, h * (yb + 0.16), 2 + r() * 3, h * 0.14); } }
    speck(g, w, h, 60, '#4f8a76', 0.3, r, 1.5);
  });
  region('iron', 128, 128, { pw: 0.5, ph: 0.5, rough: 0.55, metal: 0.75 }, (g, w, h, r) => metalPaint(g, w, h, '#3c3a38', r, '#6a4a32'));
  region('steel', 128, 64, { pw: 0.6, ph: 0.15, rough: 0.2, metal: 1 }, (g, w, h) => { g.fillStyle = lgr(g, 0, 0, 0, h, [[0, '#f2f6f8'], [0.45, '#a8b2b8'], [0.55, '#e6ecf0'], [1, '#6a747a']]); g.fillRect(0, 0, w, h); });
  region('mirror', 128, 128, { rough: 0.06, metal: 1 }, (g, w, h) => { g.fillStyle = rgr(g, w * 0.4, h * 0.38, w * 0.7, [[0, '#f4ffff'], [0.5, '#b8dce2'], [1, '#6a8e98']]); g.fillRect(0, 0, w, h); });
  // ---- masonry & ceramics
  region('plaster', 256, 256, { pw: 1, ph: 1, rough: 0.92 }, (g, w, h, r) => {
    g.fillStyle = '#ece4d2'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) { const x = r() * w, y = r() * h, rr = 10 + r() * 40; g.fillStyle = rgr(g, x, y, rr, [[0, rgba(r() < 0.6 ? '#c8bca2' : '#fffaf0', 0.25)], [1, 'rgba(0,0,0,0)']]); g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
    speck(g, w, h, 400, '#8a7a60', 0.25, r, 1);
  });
  region('soot', 128, 128, { pw: 0.5, ph: 0.5, rough: 0.95 }, (g, w, h, r) => { g.fillStyle = '#1a120e'; g.fillRect(0, 0, w, h); speck(g, w, h, 200, '#3a2a20', 0.5, r, 3); });
  region('brick', 256, 256, { pw: 0.96, ph: 0.96, rough: 0.9 }, (g, w, h, r) => {
    g.fillStyle = '#d8cbb4'; g.fillRect(0, 0, w, h);
    const bw = w / 4, bh = h / 16;
    for (let row = 0; row < 16; row++) for (let i = -1; i < 5; i++) {
      const x = i * bw + (row % 2) * bw / 2 + 2, y = row * bh + 2;
      g.fillStyle = mix('#a5452f', r() < 0.5 ? '#7a2c1c' : '#c56a4a', r() * 0.6); g.fillRect(x, y, bw - 4, bh - 4);
      speck(g, bw - 4, bh - 4, 8, '#4a1a10', 0.3, r, 1.2, x, y);
    }
  });
  region('granite', 256, 256, { pw: 0.8, ph: 0.8, rough: 0.8 }, (g, w, h, r) => {
    g.fillStyle = '#9a968d'; g.fillRect(0, 0, w, h);
    speck(g, w, h, 1800, '#3a3834', 0.4, r, 1.4); speck(g, w, h, 900, '#e0ddd4', 0.4, r, 1.2);
  });
  region('terracotta', 256, 128, { pw: 0.8, ph: 0.4, rough: 0.85 }, (g, w, h, r) => { g.fillStyle = '#b4673a'; g.fillRect(0, 0, w, h); speck(g, w, h, 600, '#6a3018', 0.3, r, 1.5); for (let i = 0; i < 20; i++) { g.fillStyle = rgba('#d8905a', 0.15); g.fillRect(0, r() * h, w, 2); } });
  // glazed jars: lathe uv (u around, v top → bottom)
  function glaze(base, hi, drip) {
    return (g, w, h, r) => {
      g.fillStyle = lgr(g, 0, 0, 0, h, [[0, shade(base, 0.12)], [0.5, base], [1, shade(base, -0.3)]]); g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) { const x = r() * w, len = h * (0.2 + r() * 0.5); g.fillStyle = lgr(g, 0, h * 0.1, 0, h * 0.1 + len, [[0, rgba(drip, 0.3)], [1, rgba(drip, 0)]]); g.fillRect(x, h * 0.1, 2 + r() * 5, len); }
      speck(g, w, h, 300, hi, 0.25, r, 1.2);
      g.fillStyle = rgba('#c8a070', 0.9); g.fillRect(0, h * 0.93, w, h * 0.07); // unglazed foot
    };
  }
  region('glaze_brown', 256, 128, { rough: 0.22 }, glaze('#6a3818', '#e0a060', '#2a1206'));
  region('glaze_green', 256, 128, { rough: 0.2 }, glaze('#3a6a4c', '#a8d8b0', '#1a3a26'));
  region('glaze_black', 256, 128, { rough: 0.18 }, glaze('#1e1a18', '#8a8078', '#000000'));
  region('glaze_amber', 256, 128, { rough: 0.22 }, glaze('#9a5a22', '#f0c070', '#4a2008'));
  // blue-and-white porcelain band (青花纏枝蓮)
  region('porcelain', 384, 192, { rough: 0.12 }, (g, w, h, r) => {
    g.fillStyle = '#f6f4ee'; g.fillRect(0, 0, w, h);
    const blue = '#2a4a9a';
    g.strokeStyle = blue; g.lineWidth = 3;
    for (const y of [0.08, 0.14, 0.86, 0.92]) { g.beginPath(); g.moveTo(0, h * y); g.lineTo(w, h * y); g.stroke(); }
    // scroll vine with lotus heads
    g.lineWidth = 2.4; g.beginPath();
    for (let x = 0; x <= w; x += 4) { const y = h * 0.5 + sin(x / w * TAU * 4) * h * 0.18; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    for (let i = 0; i < 8; i++) {
      const x = (i + 0.25) * w / 8, y = h * 0.5 + sin((i + 0.25) / 8 * TAU * 4) * h * 0.18;
      g.fillStyle = rgba(blue, 0.85);
      for (let p = -2; p <= 2; p++) { g.beginPath(); g.ellipse(x + p * 7, y - 6 - (2 - abs(p)) * 4, 5, 13, p * 0.35, 0, TAU); g.fill(); }
      g.fillStyle = rgba(blue, 0.5); for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x + s * 22, y + 10, 10, 4, s * 0.6, 0, TAU); g.fill(); }
    }
    // ruyi collar
    g.fillStyle = rgba(blue, 0.8);
    for (let x = 0; x < w; x += 32) { g.beginPath(); g.arc(x + 16, h * 0.14, 9, 0, PI); g.fill(); }
    speck(g, w, h, 200, '#1a3070', 0.15, r, 1);
  });
  region('porcelain_w', 128, 64, { rough: 0.1 }, (g, w, h) => { g.fillStyle = lgr(g, 0, 0, 0, h, [[0, '#ffffff'], [1, '#e6e2d8']]); g.fillRect(0, 0, w, h); });
  region('yixing', 128, 128, { pw: 0.3, ph: 0.3, rough: 0.55 }, (g, w, h, r) => { g.fillStyle = '#8a4428'; g.fillRect(0, 0, w, h); speck(g, w, h, 300, '#4a2010', 0.3, r, 1); speck(g, w, h, 100, '#c87a50', 0.3, r, 1); });
  // ---- cloth, straw, paper
  region('cloth_red', 256, 256, { pw: 1, ph: 1, rough: 0.9 }, (g, w, h, r) => {
    g.fillStyle = '#b22a20'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = rgba(y % 4 ? '#7a1610' : '#d84030', 0.12); g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 2) { g.fillStyle = rgba('#5a0e08', 0.06); g.fillRect(x, 0, 1, h); }
  });
  region('cloth_indigo', 256, 256, { pw: 0.8, ph: 0.8, rough: 0.95 }, (g, w, h, r) => {
    g.fillStyle = '#25406e'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = rgba('#0e1a34', 0.12); g.fillRect(0, y, w, 1); }
    // 藍染 resist dots & little cranes of white
    g.fillStyle = 'rgba(232,238,246,0.85)';
    for (let y = 12; y < h; y += 26) for (let x = (y / 26 % 2) * 13 + 6; x < w; x += 26) { g.beginPath(); g.arc(x, y, 2.6, 0, TAU); g.fill(); for (let p = 0; p < 4; p++) { g.beginPath(); g.arc(x + cos(p * PI / 2) * 6, y + sin(p * PI / 2) * 6, 1.4, 0, TAU); g.fill(); } }
  });
  // 客家花布: big red/pink peonies on red with green leaves — the iconic Taiwanese quilt cloth
  region('cloth_hakka', 384, 384, { pw: 1, ph: 1, rough: 0.95 }, (g, w, h, r) => {
    g.fillStyle = '#c4201c'; g.fillRect(0, 0, w, h);
    const flower = (x, y, s0, c1, c2) => { const s = s0 * 0.75;
      for (let k = 0; k < 4; k++) for (let p = 0; p < 7; p++) {
        const a = p / 7 * TAU + k * 0.4, rr = s * (1 - k * 0.22);
        g.fillStyle = k % 2 ? c1 : c2; g.beginPath(); g.ellipse(x + cos(a) * rr * 0.45, y + sin(a) * rr * 0.45, rr * 0.5, rr * 0.36, a, 0, TAU); g.fill();
      }
      g.fillStyle = '#f6d24a'; g.beginPath(); g.arc(x, y, s * 0.16, 0, TAU); g.fill();
    };
    for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h, a = r() * TAU; g.fillStyle = r() < 0.5 ? '#1f7a4a' : '#2f9a5a'; g.beginPath(); g.ellipse(x, y, 22, 8, a, 0, TAU); g.fill(); g.strokeStyle = '#0e4a2a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - cos(a) * 20, y - sin(a) * 20); g.lineTo(x + cos(a) * 20, y + sin(a) * 20); g.stroke(); }
    for (let i = 0; i < 9; i++) { const x = (i % 3 + 0.5 + (r() - 0.5) * 0.4) * w / 3, y = ((i / 3 | 0) + 0.5 + (r() - 0.5) * 0.4) * h / 3; flower(x, y, 40 + r() * 16, r() < 0.5 ? '#f27a9a' : '#f4f0e8', r() < 0.5 ? '#e83a5a' : '#f8b6c4'); }
    for (let i = 0; i < 60; i++) { g.fillStyle = r() < 0.5 ? '#f6d24a' : '#f4f0e8'; g.beginPath(); g.arc(r() * w, r() * h, 3, 0, TAU); g.fill(); }
    for (let y = 0; y < h; y += 2) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, y, w, 1); }
  });
  region('cloth_white', 128, 128, { pw: 0.5, ph: 0.5, rough: 0.95 }, (g, w, h, r) => { g.fillStyle = '#f2ecdf'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) { g.fillStyle = 'rgba(120,100,70,0.08)'; g.fillRect(0, y, w, 1); } });
  region('rush', 256, 256, { pw: 1, ph: 1, rough: 0.9 }, (g, w, h, r) => {
    g.fillStyle = '#cdb47a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { g.fillStyle = mix('#a88a50', '#e2cc94', r()); g.fillRect(0, y, w, 2.2); }
    for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(90,60,30,0.35)'; g.fillRect(x, 0, 1.5, h); }
  });
  region('rattan', 128, 128, { pw: 0.4, ph: 0.4, rough: 0.7 }, (g, w, h) => {
    g.fillStyle = '#c8a668'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(110,80,40,0.55)'; g.lineWidth = 1.4;
    for (let k = -h; k < w; k += 8) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke(); g.beginPath(); g.moveTo(k + h, 0); g.lineTo(k, h); g.stroke(); }
    for (let k = 0; k < w; k += 8) { g.fillStyle = 'rgba(80,50,20,0.25)'; g.fillRect(k, 0, 1, h); g.fillRect(0, k, w, 1); }
  });
  region('straw', 256, 64, { pw: 0.8, ph: 0.2, rough: 0.9 }, (g, w, h, r) => { g.fillStyle = '#c8a860'; g.fillRect(0, 0, w, h); for (let i = 0; i < 160; i++) { g.fillStyle = mix('#8a6a30', '#ecd690', r()); g.fillRect(0, r() * h, w, 0.8 + r()); } });
  region('paper', 128, 128, { pw: 0.4, ph: 0.4, rough: 0.9 }, (g, w, h, r) => { g.fillStyle = '#f1e5c6'; g.fillRect(0, 0, w, h); speck(g, w, h, 120, '#b8a478', 0.25, r, 1); for (let i = 0; i < 12; i++) { g.strokeStyle = 'rgba(160,140,100,0.2)'; g.beginPath(); const x = r() * w; g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 20, h); g.stroke(); } });
  region('paper_red', 128, 128, { pw: 0.4, ph: 0.4, rough: 0.8 }, (g, w, h, r) => { g.fillStyle = '#c8281e'; g.fillRect(0, 0, w, h); speck(g, w, h, 90, '#f2c14e', 0.6, r, 1.1); });
  region('paper_gold', 128, 128, { pw: 0.3, ph: 0.3, rough: 0.6, metal: 0.3 }, (g, w, h, r) => { g.fillStyle = '#e8c050'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8302a'; g.fillRect(w * 0.3, h * 0.3, w * 0.4, h * 0.4); speck(g, w, h, 80, '#a07818', 0.4, r, 1); });
  // stacked paper seen from the edge (many fine sheets)
  region('paper_edge', 128, 128, { pw: 0.3, ph: 0.3, rough: 0.9 }, (g, w, h, r) => { g.fillStyle = '#efe4c8'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 1.5) { g.fillStyle = rgba(r() < 0.5 ? '#b8a478' : '#fffaf0', 0.5); g.fillRect(0, y, w, 0.6); } });
  // ---- books
  region('book_cover', 256, 128, { rough: 0.85 }, (g, w, h, r) => {
    // 4 cover colours side by side (cell picks): indigo, ochre, brown, grey-blue, with a white title slip
    ['#2c3f6a', '#a8843e', '#6a3a22', '#4a5a6a'].forEach((c, i) => {
      const x = i * w / 4; g.fillStyle = c; g.fillRect(x, 0, w / 4, h);
      speck(g, w / 4, h, 60, '#000000', 0.12, r, 1, x, 0);
      g.fillStyle = '#efe6cc'; g.fillRect(x + w / 4 * 0.62, h * 0.12, w / 4 * 0.2, h * 0.55);
      g.fillStyle = '#2a2420'; for (let k = 0; k < 4; k++) g.fillRect(x + w / 4 * 0.69, h * (0.17 + k * 0.12), w / 4 * 0.06, h * 0.07);
    });
  });
  region('book_edge', 128, 64, { pw: 0.3, ph: 0.06, rough: 0.9 }, (g, w, h, r) => { g.fillStyle = '#e8dcbc'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 1.2) { g.fillStyle = rgba('#a89870', 0.35 * r()); g.fillRect(0, y, w, 0.6); } g.fillStyle = '#2a3a60'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); });
  // ---- lanterns: white paper with ribs & bands (tinted per instance via vertex colour) on lathe uv
  function lanternPaint(motif) {
    return (g, w, h, r) => {
      g.fillStyle = '#fbf3e0'; g.fillRect(0, 0, w, h);
      g.fillStyle = rgr(g, w / 2, h / 2, w * 0.6, [[0, 'rgba(255,255,255,0.3)'], [1, 'rgba(150,120,90,0.15)']]); g.fillRect(0, 0, w, h);
      // bamboo ribs (horizontal pleats → around the lathe they become rings)
      for (let y = 4; y < h; y += h / 11) { g.fillStyle = 'rgba(110,70,40,0.35)'; g.fillRect(0, y, w, 1.6); }
      if (motif === 'fu') {
        g.fillStyle = 'rgba(120,20,10,0.25)'; g.fillRect(0, h * 0.12, w, h * 0.05); g.fillRect(0, h * 0.83, w, h * 0.05);
        for (let i = 0; i < 2; i++) { const x = w * (0.25 + i * 0.5); g.fillStyle = 'rgba(255,248,230,0.9)'; g.beginPath(); g.ellipse(x, h / 2, w * 0.1, h * 0.26, 0, 0, TAU); g.fill(); txt(g, i ? '燈' : '福', x, h / 2, h * 0.34, '#2a1410'); }
      } else if (motif === 'plum') {
        for (let i = 0; i < 12; i++) { const x = r() * w, y = h * (0.2 + r() * 0.6); g.fillStyle = 'rgba(255,255,255,0.9)'; for (let p = 0; p < 5; p++) { g.beginPath(); g.arc(x + cos(p * 1.256) * 5, y + sin(p * 1.256) * 5, 4, 0, TAU); g.fill(); } g.fillStyle = '#e8b030'; g.beginPath(); g.arc(x, y, 2.4, 0, TAU); g.fill(); }
        g.strokeStyle = 'rgba(60,30,20,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, h * 0.8); g.bezierCurveTo(w * 0.3, h * 0.5, w * 0.6, h * 0.7, w, h * 0.3); g.stroke();
      } else if (motif === 'gold') {
        g.fillStyle = 'rgba(230,180,60,0.9)'; g.fillRect(0, h * 0.18, w, h * 0.07); g.fillRect(0, h * 0.75, w, h * 0.07);
        g.strokeStyle = 'rgba(230,180,60,0.8)'; g.lineWidth = 2;
        for (let x = 10; x < w; x += 40) { g.beginPath(); g.arc(x, h / 2, 10, 0, PI * 1.5); g.stroke(); }
      }
      g.fillStyle = lgr(g, 0, 0, 0, h, [[0, 'rgba(60,30,10,0.35)'], [0.12, 'rgba(60,30,10,0)'], [0.88, 'rgba(60,30,10,0)'], [1, 'rgba(60,30,10,0.35)']]); g.fillRect(0, 0, w, h);
    };
  }
  region('lan_fu', 256, 128, { rough: 0.8 }, lanternPaint('fu'));
  region('lan_plum', 256, 128, { rough: 0.8 }, lanternPaint('plum'));
  region('lan_gold', 256, 128, { rough: 0.8 }, lanternPaint('gold'));
  region('lan_plain', 128, 64, { rough: 0.8 }, lanternPaint('plain'));
  // bamboo skeleton lattice (cut): hexagonal 六角 weave
  region('lattice_bamboo', 256, 256, { alpha: true, rough: 0.6 }, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = '#c9a560'; g.lineWidth = 5;
    for (let k = -h; k < w + h; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h * 0.58, h); g.stroke(); g.beginPath(); g.moveTo(k, 0); g.lineTo(k - h * 0.58, h); g.stroke(); }
    for (let y = 16; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = 'rgba(90,60,20,0.6)'; g.lineWidth = 1.2;
    for (let k = -h; k < w + h; k += 32) { g.beginPath(); g.moveTo(k + 2, 0); g.lineTo(k + 2 + h * 0.58, h); g.stroke(); }
  });
  // carved wooden lattice (cut): 回紋 key-fret cells for bed / screen / cabinets
  // carved wooden lattice (cut): 燈籠錦 "lantern-frame" pattern — an open lantern-shaped pane in each cell, tied to
  // the frame by short bars with little carved knots (bed, screen skirts, chair backs, altar sides)
  region('lattice_fret', 256, 256, { alpha: true, rough: 0.45 }, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cw = 64, ch = 64, bar = (x0, y0, x1, y1, lw) => { g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
    g.lineCap = 'square';
    for (let y = 0; y < h; y += ch) for (let x = 0; x < w; x += cw) {
      g.strokeStyle = '#5a2418';
      g.strokeRect(x + 3, y + 3, cw - 6, ch - 6); g.lineWidth = 6; g.strokeRect(x + 3, y + 3, cw - 6, ch - 6);
      // lantern pane: rectangle with clipped corners
      const ix = x + 16, iy = y + 14, iw = 32, ih = 36, k = 6;
      g.lineWidth = 5; g.beginPath(); g.moveTo(ix + k, iy); g.lineTo(ix + iw - k, iy); g.lineTo(ix + iw, iy + k); g.lineTo(ix + iw, iy + ih - k); g.lineTo(ix + iw - k, iy + ih); g.lineTo(ix + k, iy + ih); g.lineTo(ix, iy + ih - k); g.lineTo(ix, iy + k); g.closePath(); g.stroke();
      bar(x + 32, y + 3, x + 32, iy, 5); bar(x + 32, iy + ih, x + 32, y + ch - 3, 5);
      bar(x + 3, y + 32, ix, y + 32, 5); bar(ix + iw, y + 32, x + cw - 3, y + 32, 5);
      g.fillStyle = '#5a2418'; for (const [kx, ky] of [[x + 32, y + 8], [x + 32, y + ch - 8], [x + 8, y + 32], [x + cw - 8, y + 32]]) { g.beginPath(); g.arc(kx, ky, 4.5, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(255,200,150,0.4)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(ix + k, iy - 1.5); g.lineTo(ix + iw - k, iy - 1.5); g.moveTo(x + 2, y + 1.5); g.lineTo(x + cw - 2, y + 1.5); g.stroke();
    }
  });
  // gilded carving on red: a long frieze (bed lintel, altar apron, drum stand): scrolling clouds, bats, coins
  region('carve_gold', 512, 128, { rough: 0.35, metal: 0.2 }, (g, w, h, r) => {
    lacPaint(g, w, h, '#8a1a12', r);
    g.strokeStyle = '#2a0604'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    const gold = (a) => rgba('#e8c060', a);
    g.strokeStyle = gold(0.95); g.lineWidth = 2.5; g.strokeRect(10, 10, w - 20, h - 20);
    // cloud scrolls (祥雲)
    for (let x = 40; x < w; x += 110) {
      g.lineWidth = 7; g.strokeStyle = '#4a0a06';
      const cl = () => { g.beginPath(); g.arc(x, h / 2, 16, PI * 0.2, PI * 1.9); g.moveTo(x + 30, h / 2 + 4); g.arc(x + 22, h / 2 + 4, 9, 0, PI * 1.7); g.moveTo(x - 30, h / 2 + 8); g.arc(x - 22, h / 2 + 8, 8, PI, PI * 2.6); g.stroke(); };
      cl(); g.lineWidth = 4.5; g.strokeStyle = gold(1); cl();
      g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,240,190,0.7)'; g.beginPath(); g.arc(x - 2, h / 2 - 2, 16, PI * 1.1, PI * 1.6); g.stroke();
    }
    for (let x = 95; x < w; x += 110) { // bats (蝠 = 福) as simple gilt silhouettes
      g.fillStyle = gold(0.95); g.beginPath(); g.moveTo(x, h / 2 - 6);
      g.quadraticCurveTo(x - 14, h / 2 - 16, x - 22, h / 2 - 4); g.quadraticCurveTo(x - 12, h / 2 - 2, x - 6, h / 2 + 8); g.lineTo(x, h / 2 + 3);
      g.lineTo(x + 6, h / 2 + 8); g.quadraticCurveTo(x + 12, h / 2 - 2, x + 22, h / 2 - 4); g.quadraticCurveTo(x + 14, h / 2 - 16, x, h / 2 - 6); g.fill();
      g.strokeStyle = '#6a3a10'; g.lineWidth = 1; g.stroke();
    }
  });
  // carved medallion splat (chair back / cabinet panels): ruyi roundel in relief on wood
  region('splat', 128, 256, { rough: 0.5 }, (g, w, h, r) => {
    woodPaint(g, w, h, '#5e2b1d', r, { wave: 1.5, knots: 0 });
    const cx = w / 2, cy = h * 0.28;
    g.fillStyle = 'rgba(30,10,4,0.55)'; g.beginPath(); g.arc(cx, cy, 34, 0, TAU); g.fill();
    g.fillStyle = 'rgba(150,80,50,0.65)'; g.beginPath(); g.arc(cx - 2, cy - 2, 28, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(30,10,4,0.7)'; g.lineWidth = 3;
    for (let k = 0; k < 4; k++) { const a = k * PI / 2; g.beginPath(); g.arc(cx + cos(a) * 12, cy + sin(a) * 12, 9, a + PI * 0.6, a + PI * 2.2); g.stroke(); }
    g.beginPath(); g.arc(cx, cy, 6, 0, TAU); g.stroke();
    g.fillStyle = lgr(g, 0, 0, w, 0, [[0, 'rgba(0,0,0,0.25)'], [0.3, 'rgba(255,220,180,0.08)'], [1, 'rgba(0,0,0,0.3)']]); g.fillRect(0, 0, w, h);
  });
  // ---- food, ash, fire, liquids, plants
  region('orange', 64, 64, { rough: 0.45 }, (g, w, h, r) => { g.fillStyle = rgr(g, w * 0.4, h * 0.35, w * 0.7, [[0, '#ffd27a'], [0.5, '#f0962a'], [1, '#b85e10']]); g.fillRect(0, 0, w, h); speck(g, w, h, 80, '#a85008', 0.3, r, 0.8); });
  region('peach', 64, 64, { rough: 0.6 }, (g, w, h) => { g.fillStyle = lgr(g, 0, 0, 0, h, [[0, '#f8d8a8'], [0.5, '#f4a0a0'], [1, '#d85a6a']]); g.fillRect(0, 0, w, h); });
  region('ash', 128, 128, { rough: 1 }, (g, w, h, r) => { g.fillStyle = '#a8a29a'; g.fillRect(0, 0, w, h); speck(g, w, h, 400, '#4a4440', 0.4, r, 1.5); speck(g, w, h, 200, '#e8e4dc', 0.5, r, 1.2); });
  region('ember', 64, 64, { rough: 1 }, (g, w, h, r) => { g.fillStyle = '#ff8a2a'; g.fillRect(0, 0, w, h); speck(g, w, h, 60, '#fff0a0', 0.8, r, 3); speck(g, w, h, 40, '#8a2a08', 0.6, r, 3); });
  region('coal', 64, 64, { rough: 0.9 }, (g, w, h, r) => { g.fillStyle = '#2a1a14'; g.fillRect(0, 0, w, h); speck(g, w, h, 50, '#ff6a1a', 0.7, r, 2.5); });
  region('wax_red', 64, 128, { rough: 0.35 }, (g, w, h) => { g.fillStyle = lgr(g, 0, 0, w, 0, [[0, '#ea4a3a'], [0.4, '#c8281e'], [1, '#7a120c']]); g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(240,200,90,0.85)'; g.fillRect(w * 0.42, h * 0.2, w * 0.16, h * 0.55); });
  region('water', 64, 64, { rough: 0.04, metal: 0.1 }, (g, w, h) => { g.fillStyle = rgr(g, w / 2, h / 2, w * 0.7, [[0, '#3a5a5a'], [1, '#1a2a2c']]); g.fillRect(0, 0, w, h); });
  region('brew', 128, 128, { rough: 0.15 }, (g, w, h, r) => { g.fillStyle = rgr(g, w / 2, h / 2, w * 0.7, [[0, '#9ad85a'], [0.6, '#4a8a2a'], [1, '#1a3a10']]); g.fillRect(0, 0, w, h); speck(g, w, h, 40, '#e0ffb0', 0.5, r, 3); });
  region('tea', 64, 64, { rough: 0.05 }, (g, w, h) => { g.fillStyle = '#8a4a14'; g.fillRect(0, 0, w, h); });
  region('rice', 64, 64, { rough: 0.7 }, (g, w, h, r) => { g.fillStyle = '#f4efe2'; g.fillRect(0, 0, w, h); speck(g, w, h, 160, '#c8bfa8', 0.5, r, 1.4); });
  region('soil', 64, 64, { rough: 1 }, (g, w, h, r) => { g.fillStyle = '#3a2a1c'; g.fillRect(0, 0, w, h); speck(g, w, h, 200, '#6a5038', 0.6, r, 1.5); });
  region('herb_g', 128, 128, { rough: 0.95 }, (g, w, h, r) => { g.fillStyle = '#5a6a32'; g.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { g.fillStyle = mix('#3a4a20', '#a8b86a', r()); g.save(); g.translate(r() * w, r() * h); g.rotate(r() * TAU); g.fillRect(-5, -1.5, 10, 3); g.restore(); } });
  region('herb_r', 128, 128, { rough: 0.8 }, (g, w, h, r) => { g.fillStyle = '#8a2a18'; g.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { g.fillStyle = mix('#a02a1a', '#f0703a', r()); g.beginPath(); g.ellipse(r() * w, r() * h, 3.5, 2, r() * 3, 0, TAU); g.fill(); } });
  region('herb_y', 128, 128, { rough: 0.9 }, (g, w, h, r) => { g.fillStyle = '#b89a3a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 120; i++) { const x = r() * w, y = r() * h; g.fillStyle = mix('#e8c040', '#fff0a0', r()); for (let p = 0; p < 8; p++) { g.beginPath(); g.ellipse(x + cos(p * 0.8) * 3, y + sin(p * 0.8) * 3, 2.6, 1.2, p * 0.8, 0, TAU); g.fill(); } } });
  region('leaf', 64, 64, { rough: 0.6 }, (g, w, h) => { g.fillStyle = lgr(g, 0, 0, w, 0, [[0, '#2a6a30'], [0.5, '#4a9a48'], [1, '#2a5a28']]); g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(200,240,160,0.5)'; g.fillRect(w * 0.48, 0, w * 0.04, h); });
  // sword leaves (cut) — a fan of leaf blades for 劍蘭/虎尾蘭-style potted plants
  region('leaves_sword', 256, 256, { alpha: true, rough: 0.6 }, (g, w, h, r) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const bx = w / 2 + (i - 4) * 6, a = (i - 4) * 0.16 + (r() - 0.5) * 0.1, L = h * (0.75 + r() * 0.22);
      const tx = bx + sin(a) * L, ty = h - cos(a) * L;
      g.fillStyle = mix('#1f6a2a', '#5aa04a', r());
      g.beginPath(); g.moveTo(bx - 7, h); g.quadraticCurveTo((bx + tx) / 2 - 9, (h + ty) / 2, tx, ty); g.quadraticCurveTo((bx + tx) / 2 + 9, (h + ty) / 2, bx + 7, h); g.fill();
      g.strokeStyle = 'rgba(220,240,160,0.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(bx, h); g.quadraticCurveTo((bx + tx) / 2, (h + ty) / 2, tx, ty); g.stroke();
    }
  });
  region('orchid', 128, 128, { alpha: true, rough: 0.5 }, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    g.fillStyle = '#f6c4dc';
    for (let p = 0; p < 5; p++) { const a = p / 5 * TAU - PI / 2; g.beginPath(); g.ellipse(cx + cos(a) * 26, cy + sin(a) * 26, 30, 22, a, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(200,60,120,0.6)'; g.beginPath(); g.arc(cx, cy, 16, 0, TAU); g.fill();
    g.fillStyle = '#f8e070'; g.beginPath(); g.arc(cx, cy, 6, 0, TAU); g.fill();
  });
  region('bamboo_leaf', 128, 128, { alpha: true, rough: 0.6 }, (g, w, h, r) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { const a = -PI / 2 + (i - 2.5) * 0.4; g.save(); g.translate(w / 2, h); g.rotate(a + PI / 2); g.fillStyle = mix('#2a7a30', '#6ab050', r()); g.beginPath(); g.ellipse(0, -h * 0.45, 9, h * 0.42, 0, 0, TAU); g.fill(); g.restore(); }
  });
  // red silk tassel / ribbon / cord
  region('tassel', 64, 128, { alpha: true, rough: 0.8 }, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#e8b040'; g.fillRect(w * 0.3, 0, w * 0.4, h * 0.18);
    for (let x = 6; x < w - 4; x += 3) { g.strokeStyle = x % 6 ? '#d0281e' : '#a01810'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(w / 2 + (x - w / 2) * 0.4, h * 0.18); g.lineTo(x, h - 2); g.stroke(); }
  });
  region('rope', 128, 32, { pw: 0.5, ph: 0.05, rough: 0.9 }, (g, w, h) => { g.fillStyle = '#b89a68'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(90,60,30,0.6)'; g.lineWidth = 2; for (let x = -h; x < w; x += 7) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke(); } });
  region('thread', 128, 128, { alpha: true, rough: 0.9 }, (g, w, h) => { g.clearRect(0, 0, w, h); for (let x = 1; x < w; x += 4) { g.fillStyle = x % 8 < 4 ? '#ece4d4' : '#d8cdb4'; g.fillRect(x, 0, 1.6, h); } });
  region('red_band', 64, 64, { rough: 0.7 }, (g, w, h) => { g.fillStyle = '#c0281e'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(240,190,80,0.8)'; g.fillRect(0, h * 0.45, w, h * 0.1); });

  // ---- calligraphy (fit regions). 神主牌 tablets: gold vertical text on red lacquer, gold border
  function tablet(text, sub) {
    return (g, w, h, r) => {
      lacPaint(g, w, h, '#9e1e16', r);
      g.strokeStyle = '#f0cc72'; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12); g.lineWidth = 1; g.strokeRect(11, 11, w - 22, h - 22);
      vtxt(g, text, w / 2, h * 0.08, h * 0.93, Math.min(w * 0.62, h * 0.85 / [...text].length), '#f6d27a', { stroke: '#5a2a08', sw: 2 });
      if (sub) vtxt(g, sub, w * 0.2, h * 0.5, h * 0.85, w * 0.16, '#f6d27a');
    };
  }
  region('tab_main', 64, 256, { rough: 0.3, metal: 0.1 }, tablet('天地君親師位'));
  region('tab_left', 64, 192, { rough: 0.3, metal: 0.1 }, tablet('歷代祖先'));
  region('tab_right', 64, 192, { rough: 0.3, metal: 0.1 }, tablet('福德正神'));
  // 灶君 paper on the chimney (text only — no image of the god)
  region('zaojun', 64, 128, { rough: 0.9 }, (g, w, h, r) => {
    g.fillStyle = '#c8281e'; g.fillRect(0, 0, w, h); speck(g, w, h, 40, '#f2c14e', 0.5, r, 1);
    g.strokeStyle = '#f2c14e'; g.lineWidth = 2; g.strokeRect(4, 4, w - 8, h - 8);
    vtxt(g, '司命灶君', w / 2, 12, h - 12, 22, '#1a0a06');
  });
  // pair of red couplet strips + horizontal 春 lozenges (cell 0: couplet, 1: 福 diamond)
  region('fu_diamond', 128, 128, { rough: 0.85 }, (g, w, h, r) => {
    g.fillStyle = '#c8281e'; g.save(); g.translate(w / 2, h / 2); g.rotate(PI / 4); g.fillRect(-w * 0.34, -h * 0.34, w * 0.68, h * 0.68); g.restore();
    speck(g, w, h, 40, '#f2c14e', 0.5, r, 1);
    txt(g, '酒', w / 2, h / 2, h * 0.42, '#1a0a06');
  });
  region('fu_diamond_bg', 8, 8, {}, (g) => { g.fillStyle = '#c8281e'; g.fillRect(0, 0, 8, 8); });
  // 中藥櫃 drawer fronts: 4 × 4 cells, each a framed drawer face with a paper label of two herb names + brass pull
  const HERBS = ['當歸', '黃耆', '川芎', '白芍', '甘草', '枸杞', '紅棗', '人參', '茯苓', '陳皮', '桂枝', '菊花', '薄荷', '杜仲', '熟地', '麥冬'];
  region('herb_drawers', 384, 288, { rough: 0.55 }, (g, w, h, r) => {
    const cw = w / 4, ch = h / 4;
    woodPaint(g, w, h, '#7a4626', r, { knots: 0 });
    for (let i = 0; i < 16; i++) {
      const x = (i % 4) * cw, y = (i / 4 | 0) * ch;
      g.fillStyle = rgba('#2a1206', 0.6); g.fillRect(x, y, cw, 3); g.fillRect(x, y, 3, ch); g.fillRect(x, y + ch - 3, cw, 3); g.fillRect(x + cw - 3, y, 3, ch);
      g.fillStyle = 'rgba(255,220,180,0.12)'; g.fillRect(x + 4, y + 4, cw - 8, 3);
      // paper label
      g.fillStyle = '#efe2bc'; g.fillRect(x + cw * 0.22, y + ch * 0.12, cw * 0.56, ch * 0.4);
      g.strokeStyle = 'rgba(80,50,20,0.5)'; g.lineWidth = 1; g.strokeRect(x + cw * 0.22, y + ch * 0.12, cw * 0.56, ch * 0.4);
      txt(g, HERBS[i], x + cw / 2, y + ch * 0.32, ch * 0.24, '#1a120c', { weight: 'normal' });
      // brass ring pull
      g.fillStyle = '#c99a48'; g.beginPath(); g.arc(x + cw / 2, y + ch * 0.72, 7, 0, TAU); g.fill();
      g.strokeStyle = '#6a4a18'; g.lineWidth = 2; g.beginPath(); g.arc(x + cw / 2, y + ch * 0.78, 9, 0.2, PI - 0.2); g.stroke();
    }
  });
  // 籤筒 band: red lacquer with gold 籤 roundel (lathe uv)
  region('qiantong', 256, 128, { rough: 0.3 }, (g, w, h, r) => {
    lacPaint(g, w, h, '#a8231b', r);
    g.fillStyle = '#e0b04a'; g.fillRect(0, h * 0.06, w, h * 0.06); g.fillRect(0, h * 0.88, w, h * 0.06);
    for (const x of [w * 0.25, w * 0.75]) { g.fillStyle = '#f0cc72'; g.beginPath(); g.arc(x, h / 2, h * 0.24, 0, TAU); g.fill(); txt(g, '籤', x, h / 2, h * 0.32, '#7a1410'); }
  });
  // fortune-stick tops: bamboo with red-painted tips (u along the stick; tip at u = 1)
  region('stick', 128, 16, { pw: 0.5, ph: 0.02, rough: 0.6 }, (g, w, h) => { g.fillStyle = '#d8b878'; g.fillRect(0, 0, w, h); g.fillStyle = '#c0281e'; g.fillRect(w * 0.82, 0, w * 0.18, h); });
  // ledger pages with brush writing
  region('ledger', 128, 96, { rough: 0.9 }, (g, w, h, r) => {
    g.fillStyle = '#f2e8cc'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(180,60,40,0.5)'; g.lineWidth = 0.8; for (let x = 8; x < w; x += 10) { g.beginPath(); g.moveTo(x, 6); g.lineTo(x, h - 6); g.stroke(); }
    g.fillStyle = '#2a2420';
    for (let x = 10; x < w - 4; x += 10) for (let y = 8; y < h - 10; y += 7 + r() * 4) if (r() < 0.75) g.fillRect(x - 2.5, y, 3 + r() * 2, 3 + r() * 2);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(w / 2 - 2, 0, 4, h);
  });
  // taiji drum head (hide, nail ring, 太極) — fit
  region('drumhead', 256, 256, { rough: 0.7 }, (g, w, h, r) => {
    const cx = w / 2, cy = h / 2;
    g.fillStyle = '#b8a07a'; g.fillRect(0, 0, w, h);
    g.fillStyle = rgr(g, cx, cy, w * 0.5, [[0, '#f0e2c0'], [0.8, '#d8c49a'], [1, '#9a845a']]); g.beginPath(); g.arc(cx, cy, w * 0.5, 0, TAU); g.fill();
    speck(g, w, h, 300, '#8a6a40', 0.15, r, 2);
    const R = w * 0.26;
    g.fillStyle = '#1e1a18'; g.beginPath(); g.arc(cx, cy, R, -PI / 2, PI / 2); g.arc(cx, cy + R / 2, R / 2, PI / 2, -PI / 2, true); g.arc(cx, cy - R / 2, R / 2, PI / 2, -PI / 2); g.fill();
    g.fillStyle = '#f4ecd8'; g.beginPath(); g.arc(cx, cy, R, PI / 2, PI * 1.5); g.arc(cx, cy - R / 2, R / 2, -PI / 2, PI / 2, true); g.arc(cx, cy + R / 2, R / 2, -PI / 2, PI / 2); g.fill();
    g.fillStyle = '#1e1a18'; g.beginPath(); g.arc(cx, cy - R / 2, R * 0.13, 0, TAU); g.fill();
    g.fillStyle = '#f4ecd8'; g.beginPath(); g.arc(cx, cy + R / 2, R * 0.13, 0, TAU); g.fill();
    g.strokeStyle = '#1e1a18'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    for (let k = 0; k < 40; k++) { const a = k / 40 * TAU; g.fillStyle = '#d9a84a'; g.beginPath(); g.arc(cx + cos(a) * w * 0.46, cy + sin(a) * h * 0.46, 3.2, 0, TAU); g.fill(); }
  });
  // abacus / 算盤 top (fit): frame, beam, rods with beads
  region('abacus', 256, 96, { rough: 0.45 }, (g, w, h) => {
    g.fillStyle = '#3b2216'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5c3a24'; g.fillRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#2a170d'; g.fillRect(8, h * 0.32, w - 16, 5);
    for (let i = 0; i < 13; i++) {
      const x = 18 + i * (w - 36) / 12;
      g.fillStyle = '#c8a870'; g.fillRect(x - 1, 8, 2, h - 16);
      const bead = (y) => { g.fillStyle = '#1a0e08'; g.beginPath(); g.ellipse(x, y, 7, 4, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,220,180,0.3)'; g.beginPath(); g.ellipse(x - 2, y - 1.5, 3, 1.4, 0, 0, TAU); g.fill(); };
      bead(14 + (i % 4 === 0 ? 4 : 0)); for (let k = 0; k < 4; k++) bead(h * 0.45 + k * 9 + (i % 3 === 0 ? 6 : 0));
    }
  });
  // painted silk lantern for the counter / display (lathe; red with 福)
  region('loom_cloth', 256, 256, { rough: 0.95 }, (g, w, h) => {
    // Atayal-style woven band: red/black diamond rows on natural ramie
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = 'rgba(120,100,70,0.12)'; g.fillRect(0, y, w, 1); }
    const band = (y0, hh, col) => { g.fillStyle = col; g.fillRect(0, y0, w, hh); };
    band(10, 8, '#b8241c'); band(22, 3, '#1e1a18'); band(h - 26, 3, '#1e1a18'); band(h - 18, 8, '#b8241c');
    for (let x = 0; x < w; x += 42) {
      g.fillStyle = '#b8241c'; g.beginPath(); g.moveTo(x + 21, 40); g.lineTo(x + 40, h / 2); g.lineTo(x + 21, h - 40); g.lineTo(x + 2, h / 2); g.fill();
      g.fillStyle = '#1e1a18'; g.beginPath(); g.moveTo(x + 21, 60); g.lineTo(x + 31, h / 2); g.lineTo(x + 21, h - 60); g.lineTo(x + 11, h / 2); g.fill();
      g.fillStyle = '#efe6d2'; g.beginPath(); g.moveTo(x + 21, h / 2 - 12); g.lineTo(x + 26, h / 2); g.lineTo(x + 21, h / 2 + 12); g.lineTo(x + 16, h / 2); g.fill();
    }
  });


  // counter front panel: red lacquer, gilt frame line, 錢 coin roundel (fit)
  region('coin_panel', 96, 128, { rough: 0.3, metal: 0.1 }, (g, w, h, r) => {
    woodPaint(g, w, h, '#4a2a18', r, { knots: 0 });
    g.fillStyle = '#9e2a20'; g.fillRect(8, 8, w - 16, h - 16);
    g.fillStyle = 'rgba(255,230,200,0.15)'; g.fillRect(8, 8, w - 16, 10);
    g.strokeStyle = '#f0cc72'; g.lineWidth = 2; g.strokeRect(13, 13, w - 26, h - 26);
    g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, 17, 0, TAU); g.stroke();
    g.strokeRect(w / 2 - 6, h / 2 - 6, 12, 12);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, h - 8, w, 8); g.fillRect(w - 8, 0, 8, h);
  });
  // 桌裙 embroidered altar frontal with gold band, dragon-cloud roundel and fringe (cut, fit)
  region('altar_cloth', 384, 192, { alpha: true, rough: 0.85 }, (g, w, h, r) => {
    g.clearRect(0, 0, w, h);
    const fh = h * 0.88;
    g.fillStyle = lgr(g, 0, 0, 0, fh, [[0, '#c62a20'], [1, '#8a1812']]); g.fillRect(0, 0, w, fh);
    for (let x = 0; x < w; x += 2) { g.fillStyle = 'rgba(80,0,0,0.06)'; g.fillRect(x, 0, 1, fh); }
    g.fillStyle = '#d9a441'; g.fillRect(0, 0, w, h * 0.13);
    for (let x = 8; x < w; x += 14) { g.fillStyle = '#b8322a'; g.beginPath(); g.arc(x, h * 0.065, 4, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(246,217,138,0.9)'; g.lineWidth = 2; g.strokeRect(14, h * 0.2, w - 28, fh - h * 0.26);
    const cx = w / 2, cy = h * 0.5;
    g.fillStyle = rgr(g, cx, cy, 34, [[0, '#f8dd90'], [1, '#c48a2c']]); g.beginPath(); g.arc(cx, cy, 32, 0, TAU); g.fill();
    g.strokeStyle = '#a2241a'; g.lineWidth = 3.5; g.beginPath(); g.arc(cx, cy, 19, 0.3, PI * 1.7); g.stroke(); g.beginPath(); g.arc(cx, cy, 8, PI, PI * 2.6); g.stroke();
    for (const sx of [-1, 1]) {
      g.strokeStyle = 'rgba(246,217,138,0.85)'; g.lineWidth = 2.5;
      for (const k of [0, 1]) { const x = cx + sx * (90 + k * 60); g.beginPath(); g.arc(x, cy + k * 6, 14, PI * 0.2, PI * 1.6); g.stroke(); g.beginPath(); g.arc(x + sx * 20, cy + k * 6, 9, PI * 1.2, PI * 2.6); g.stroke(); }
    }
    for (let x = 2; x < w; x += 4) { g.strokeStyle = r() < 0.5 ? '#e2b24e' : '#c8902a'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, fh - 2); g.lineTo(x + (r() - 0.5) * 2, h - 1 - r() * 4); g.stroke(); }
  });
  // red silk valance with gold fringe (cut, fit) — lantern shelf, bed canopy
  region('valance', 256, 64, { alpha: true, rough: 0.8 }, (g, w, h, r) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = lgr(g, 0, 0, 0, h * 0.6, [[0, '#d0302a'], [1, '#8e1c16']]);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h * 0.45);
    const n = 10;
    for (let i = n; i >= 0; i--) { const x = w * i / n; g.quadraticCurveTo(x + w / n / 2, h * 0.7, x, h * 0.45); }
    g.closePath(); g.fill();
    g.fillStyle = '#f0cc72'; g.fillRect(0, h * 0.08, w, 3);
    for (let i = 0; i <= n; i++) { const x = w * i / n; g.strokeStyle = '#e0b04a'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, h * 0.45); g.lineTo(x, h * 0.95); g.stroke(); g.fillStyle = '#f0cc72'; g.beginPath(); g.arc(x, h * 0.5, 3, 0, TAU); g.fill(); }
  });

  // ---- surfaces (shortcuts)
  Object.assign(S, {
    rose: { r: 'w_rose' }, teak: { r: 'w_teak' }, walnut: { r: 'w_walnut' }, pine: { r: 'w_pine' }, camphor: { r: 'w_camphor' },
    oldwood: { r: 'w_oldwood' }, dark: { r: 'w_dark' }, bamboo: { r: 'bamboo' },
    lac: { r: 'lac' }, lacD: { r: 'lac_dark' }, lacB: { r: 'lac_black' }, gold: { r: 'gold' }, brass: { r: 'brass' }, bronze: { r: 'bronze', fit: true },
    iron: { r: 'iron' }, steel: { r: 'steel' }, plaster: { r: 'plaster' }, brick: { r: 'brick' }, granite: { r: 'granite' }, soot: { r: 'soot' },
    clay: { r: 'terracotta' }, paper: { r: 'paper' }, rush: { r: 'rush' }, rattan: { r: 'rattan' }, straw: { r: 'straw' },
    clothR: { r: 'cloth_red' }, clothI: { r: 'cloth_indigo' }, clothH: { r: 'cloth_hakka' }, clothW: { r: 'cloth_white' },
    ash: { r: 'ash' }, ember: { r: 'ember', k: 'lit' }, coal: { r: 'coal', k: 'lit' }, rope: { r: 'rope' },
  });

  G.PropsInterior = { REG, S, getAtlas, FX, define, bake };

  // ================================================================== MODELS
  const surfs = (s) => (typeof s === 'string' ? S[s] || { r: s } : s);
  // a turned/straight leg with a horse-hoof (馬蹄) foot turned toward (ix, iz)
  function hoofLeg(par, x, z, h, t, s, ix, iz) {
    box(par, t, h - 0.05, t, s, x, 0.05, z);
    box(par, t * 1.15, 0.05, t * 1.15, s, x + ix * t * 0.18, 0, z + iz * t * 0.18);
    box(par, t * 1.05, 0.02, t * 1.05, s, x + ix * t * 0.08, 0.05, z + iz * t * 0.08);
  }
  // four aprons around a w × d frame at height y (top of apron), apron height ah
  function aprons(par, w, d, y, ah, dip, s, inset = 0.05, th = 0.022) {
    extrude(par, apronShape(w - inset * 2, ah, dip), th, s, 0, y - ah, d / 2 - inset);
    extrude(par, apronShape(w - inset * 2, ah, dip), th, s, 0, y - ah, -d / 2 + inset);
    extrude(par, apronShape(d - inset * 2, ah, dip), th, s, w / 2 - inset, y - ah, 0, { ry: PI / 2 });
    extrude(par, apronShape(d - inset * 2, ah, dip), th, s, -w / 2 + inset, y - ah, 0, { ry: PI / 2 });
  }
  // a 羅鍋棖 humpback stretcher between (x0,z0) and (x1,z1) at height y, rising by rise
  function humpStretcher(par, x0, z0, x1, z1, y, rise, r, s) {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([x0 + (x1 - x0) * t, y + rise * sstep(0, 0.3, t) * sstep(1, 0.7, t), z0 + (z1 - z0) * t]); }
    return tube(par, pts, r, s, { seg: 10, rseg: 6 });
  }

  // ------------------------------------------------------------------ 八仙桌 table (o.w widens into a long table)
  define('table', {
    key: (o) => String(Math.max(1, o.w | 0 || 1)),
    build(o, K) {
      const w = Math.max(1, o.w | 0 || 1);
      const g = grp();
      const W = w - 0.1, D = w === 1 ? 0.88 : 0.78, H = 0.8;
      const wood = surf('teak'), dk = surf('teak', { tint: '#a08070' });
      rbox(g, W, 0.045, D, 0.012, wood, 0, H - 0.045, 0);                    // top with eased edge
      rbox(g, W - 0.02, 0.028, D - 0.02, 0.01, dk, 0, H - 0.072, 0);         // 冰盤沿 moulding
      box(g, W - 0.08, 0.026, D - 0.08, surf('dark'), 0, H - 0.098, 0);      // 束腰 waist
      aprons(g, W, D, H - 0.098, 0.1, 0.055, wood, 0.045);
      const lx = W / 2 - 0.055, lz = D / 2 - 0.055;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) hoofLeg(g, sx * lx, sz * lz, H - 0.098, 0.062, wood, -sx, -sz);
      // humpback stretchers + struts (矮老) on all four sides
      const sy = H - 0.3;
      for (const sz of [-1, 1]) {
        humpStretcher(g, -lx, sz * lz, lx, sz * lz, sy, 0.07, 0.014, dk);
        for (const f of [-0.28, 0.28]) box(g, 0.022, 0.09, 0.022, dk, f * W, sy + 0.07, sz * lz);
      }
      for (const sx of [-1, 1]) {
        humpStretcher(g, sx * lx, -lz, sx * lx, lz, sy, 0.07, 0.014, dk);
        for (const f of [-0.28, 0.28]) box(g, 0.022, 0.09, 0.022, dk, sx * lx, sy + 0.07, f * D);
      }
      if (w >= 3) for (const sx of [-1, 1]) box(g, 0.05, H - 0.1, 0.05, wood, sx * 0.02 + 0, 0, sx * lz);
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ chairs: 燈掛椅 (default, as the 2D art), 太師椅, 板凳
  // dir from o.dir or o.v % 4 (down = facing +z / camera); style from o.style or floor(o.v / 4) % 3
  const CHAIR_DIRS = ['down', 'up', 'left', 'right'];
  const chairDir = (o) => o.dir || CHAIR_DIRS[(o.v | 0) % 4];
  const chairStyle = (o) => o.style || ['yoke', 'taishi', 'stool'][((o.v | 0) / 4 | 0) % 3];
  const DIR_YAW = { down: 0, up: PI, left: -PI / 2, right: PI / 2 };
  function chairYoke(g) {
    const wood = surf('teak'), dk = surf('teak', { tint: '#9a7a66' });
    const SH = 0.47, sw = 0.48, sd = 0.4, zb = -0.17, zf = 0.17;
    for (const sx of [-1, 1]) {
      // back posts continue up to the crest, raked back
      tube(g, [[sx * 0.205, 0, zb], [sx * 0.205, SH, zb - 0.005], [sx * 0.2, 0.8, zb - 0.03], [sx * 0.195, 1.0, zb - 0.06]], 0.017, wood, { seg: 8 });
      cyl(g, 0.017, 0.018, SH, wood, sx * 0.205, 0, zf);
      // stepped stretchers 步步高
      rod(g, 0.011, sd - 0.03, dk, sx * 0.205, 0.15, 0, 'z');
    }
    rod(g, 0.012, 0.39, dk, 0, 0.08, zf, 'x');   // footrest
        rod(g, 0.011, 0.39, dk, 0, 0.22, zb, 'x');
    // seat frame + rattan
    rbox(g, sw, 0.04, sd, 0.008, wood, 0, SH - 0.04, 0);
    box(g, sw - 0.07, 0.006, sd - 0.07, surf('rattan'), 0, SH - 0.002, 0);
    extrude(g, apronShape(0.4, 0.06, 0.035), 0.016, dk, 0, SH - 0.1, zf - 0.005);
    extrude(g, apronShape(0.32, 0.05, 0.03), 0.016, dk, 0.205, SH - 0.09, 0, { ry: PI / 2 });
    extrude(g, apronShape(0.32, 0.05, 0.03), 0.016, dk, -0.205, SH - 0.09, 0, { ry: PI / 2 });
    // S-curved splat with carved medallion
    const sp = grp(g, 0, SH, zb - 0.02);
    box(sp, 0.13, 0.5, 0.018, surf('splat', { fit: true, faces: { x: 'w_teak', y: 'w_teak' } }), 0, 0, 0, { rx: -0.12 });
    // yoke crest rail with upturned ends (搭腦)
    tube(g, [[-0.29, 1.06, zb - 0.06], [-0.2, 1.015, zb - 0.065], [0, 0.998, zb - 0.07], [0.2, 1.015, zb - 0.065], [0.29, 1.06, zb - 0.06]], 0.019, wood, { seg: 16 });
  }
  function chairTaishi(g) {
    const wood = surf('rose'), dk = surf('rose', { tint: '#b09088' });
    const SH = 0.5, sw = 0.6, sd = 0.48, zb = -0.2, zf = 0.2, x0 = 0.27;
    for (const sx of [-1, 1]) {
      box(g, 0.045, SH, 0.045, wood, sx * x0, 0, zf);
      box(g, 0.045, SH, 0.045, wood, sx * x0, 0, zb);
      box(g, 0.035, 0.035, sd - 0.04, dk, sx * x0, 0.12, 0);       // side stretcher
      // arm: post + rail + scrolled front
      box(g, 0.03, 0.24, 0.03, wood, sx * x0, SH, zf - 0.03);
      rbox(g, 0.045, 0.035, sd + 0.02, 0.012, wood, sx * x0, SH + 0.22, -0.01);
      box(g, 0.02, 0.18, 0.28, surf('splat', { fit: true }), sx * x0, SH + 0.03, -0.04);  // arm panel
    }
    rbox(g, sw + 0.03, 0.05, sd + 0.03, 0.01, wood, 0, SH - 0.05, 0);
    box(g, sw - 0.06, 0.006, sd - 0.06, surf('rose', { tint: '#c09888' }), 0, SH, 0);
    box(g, sw - 0.04, 0.03, 0.04, dk, 0, 0.07, zf);              // footrest
    aprons(g, sw + 0.02, sd + 0.02, SH - 0.05, 0.09, 0.05, wood, 0.02, 0.02);
    // 屏風式 back: three framed panels, centre one taller with a carved medallion + crest scroll
    const bz = zb - 0.01;
    box(g, sw, 0.045, 0.05, wood, 0, SH, bz);
    box(g, 0.2, 0.52, 0.03, surf('splat', { fit: true, faces: { x: 'w_rose', y: 'w_rose' } }), 0, SH + 0.04, bz);
    for (const sx of [-1, 1]) {
      box(g, 0.19, 0.38, 0.028, surf('lattice_fret', { k: 'cut', fit: true, faces: { x: 'w_rose', y: 'w_rose' } }), sx * 0.2, SH + 0.05, bz);
      box(g, 0.03, 0.44, 0.04, wood, sx * 0.105, SH + 0.04, bz);
      box(g, 0.035, 0.42, 0.045, wood, sx * x0, SH, bz);
      box(g, 0.19, 0.03, 0.04, wood, sx * 0.2, SH + 0.42, bz);
    }
    // crest with rolled scroll ends
    rbox(g, 0.28, 0.05, 0.05, 0.015, wood, 0, SH + 0.56, bz);
    for (const sx of [-1, 1]) rod(g, 0.03, 0.05, wood, sx * 0.15, SH + 0.585, bz, 'z', { seg: 10 });
  }
  function bench(g) {
    const wood = surf('pine', { tint: '#c8a888' }), dk = surf('pine', { tint: '#9a7a62' });
    const H = 0.45, L = 0.86, Wd = 0.22;
    rbox(g, L, 0.045, Wd, 0.01, wood, 0, H - 0.045, 0);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        // splayed legs (side and end splay)
        const leg = grp(g, sx * (L / 2 - 0.1), 0, sz * 0.06);
        box(leg, 0.045, H - 0.04, 0.035, wood, 0, 0, 0, { rz: -sx * 0.1, rx: sz * 0.12 });
      }
      box(g, 0.03, 0.03, 0.2, dk, sx * (L / 2 - 0.08), 0.16, 0);
      extrude(g, apronShape(0.16, 0.05, 0.025), 0.02, dk, sx * (L / 2 - 0.1), H - 0.095, 0, { ry: PI / 2 });
    }
    box(g, L - 0.24, 0.03, 0.025, dk, 0, 0.14, 0);
    extrude(g, apronShape(L - 0.3, 0.05, 0.02), 0.018, dk, 0, H - 0.095, 0.075);
    extrude(g, apronShape(L - 0.3, 0.05, 0.02), 0.018, dk, 0, H - 0.095, -0.075);
  }
  define('chair', {
    variants: 12,
    key: (o) => chairDir(o) + chairStyle(o),
    build(o, K) {
      const g = grp(), inner = grp(g, 0, 0, 0, DIR_YAW[chairDir(o)] || 0);
      const st = chairStyle(o);
      if (st === 'taishi') chairTaishi(inner); else if (st === 'stool') bench(inner); else chairYoke(inner);
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ 圓角櫃 cabinet
  define('cabinet', {
    build(o, K) {
      const g = grp();
      const wood = surf('rose'), dk = surf('rose', { tint: '#c0a098' }), W = 0.82, D = 0.5, H = 1.86;
      rbox(g, W + 0.06, 0.05, D + 0.05, 0.02, wood, 0, H - 0.05, 0);      // 櫃帽 cornice
      rbox(g, W + 0.02, 0.025, D + 0.01, 0.008, dk, 0, H - 0.075, 0);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(g, 0.028, 0.032, H - 0.06, wood, sx * (W / 2 - 0.02), 0, sz * (D / 2 - 0.02), { seg: 10 });
      // carcass: sides with framed panels, back, floor
      for (const sx of [-1, 1]) {
        box(g, 0.02, H - 0.36, D - 0.06, dk, sx * (W / 2 - 0.03), 0.24, 0);
        for (const yy of [0.24, 0.98, H - 0.15]) box(g, 0.03, 0.04, D - 0.06, wood, sx * (W / 2 - 0.025), yy, 0);
      }
      box(g, W - 0.06, H - 0.36, 0.02, dk, 0, 0.24, -D / 2 + 0.03);
      // two doors: stiles, rails and recessed panels
      const fz = D / 2 - 0.015;
      for (const sx of [-1, 1]) {
        const cx = sx * (W / 4 - 0.008), dw = W / 2 - 0.05;
        box(g, dw - 0.02, H - 0.42, 0.012, dk, cx, 0.27, fz - 0.01);     // panel (recessed)
        for (const yy of [0.25, 0.96, H - 0.16]) box(g, dw, 0.05, 0.024, wood, cx, yy, fz);
        for (const ex of [-1, 1]) box(g, 0.045, H - 0.4, 0.024, wood, cx + ex * (dw / 2 - 0.022), 0.25, fz);
        // brass hinge plates (outer edge) and 面葉 lock plate halves (inner edge)
        for (const yy of [0.4, H - 0.4]) box(g, 0.05, 0.08, 0.006, surf('brass'), sx * (W / 2 - 0.04), yy, fz + 0.014);
      }
      box(g, 0.035, H - 0.4, 0.03, wood, 0, 0.25, fz + 0.003);          // 閂杆 centre stile
      rod(g, 0.085, 0.008, surf('brass'), 0, 1.0, fz + 0.02, 'z', { seg: 20 });
      rod(g, 0.012, 0.05, surf('brass'), 0, 1.0, fz + 0.03, 'z');
      for (const sx of [-1, 1]) tube(g, [[sx * 0.03, 1.0, fz + 0.025], [sx * 0.035, 0.95, fz + 0.03], [sx * 0.03, 0.9, fz + 0.026]], 0.006, surf('brass'), { seg: 6, rseg: 4 });
      // bottom: apron with cloud carving front & sides
      extrude(g, apronShape(W - 0.06, 0.13, 0.07), 0.02, wood, 0, 0.12, D / 2 - 0.02);
      for (const sx of [-1, 1]) extrude(g, apronShape(D - 0.06, 0.12, 0.06), 0.02, wood, sx * (W / 2 - 0.02), 0.13, 0, { ry: PI / 2 });
      box(g, W - 0.04, 0.03, D - 0.04, dk, 0, 0.22, 0);
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ 書格 bookshelf (o.w compartments wide, o.v arrangement)
  function bookStack(par, x, y, z, n, r, maxW = 0.24) {
    let yy = y;
    for (let i = 0; i < n; i++) {
      const bw = maxW * (0.75 + r() * 0.25), bd = 0.15 + r() * 0.04, t = 0.012 + r() * 0.01;
      box(par, bw, t, bd, { r: 'book_edge', stretch: true, faces: { y: { r: 'book_cover', cell: [(r() * 4) | 0, 4, 1] } }, ao: 0.95 }, x + (r() - 0.5) * 0.015, yy, z, { ry: (r() - 0.5) * 0.08 });
      yy += t;
    }
    return yy;
  }
  function scroll(par, x, y, z, len, r, ry = 0) {
    const s = grp(par, x, y, z, ry);
    rod(s, 0.028, len, surf('paper', { tint: r() < 0.5 ? '#fff4e0' : '#e8d8b8' }), 0, 0.028, 0, 'x', { seg: 10 });
    for (const sx of [-1, 1]) rod(s, 0.012, 0.03, surf('dark'), sx * (len / 2 + 0.015), 0.028, 0, 'x');
    box(s, 0.02, 0.003, 0.03, surf('red_band'), 0, 0.054, 0);
    return s;
  }
  function vase(par, x, y, z, h, s) {
    lathe(par, [[0, 0], [h * 0.22, 0], [h * 0.3, h * 0.25], [h * 0.26, h * 0.55], [h * 0.1, h * 0.78], [h * 0.09, h * 0.92], [h * 0.14, h], [h * 0.12, h * 1.0]], s, x, y, z, { seg: 14 });
  }
  function fillCompartment(par, x0, x1, y, z, hgt, r) {
    let x = x0 + 0.02;
    const end = x1 - 0.02;
    while (x < end - 0.08) {
      const k = r(), room = end - x;
      if (k < 0.5 && room > 0.2) { const bw = Math.min(0.24, room - 0.01); bookStack(par, x + bw / 2, y, z, 3 + ((r() * Math.min(9, hgt / 0.02)) | 0), r, bw); x += bw + 0.02; }
      else if (k < 0.68 && room > 0.3) { const n = 2 + ((r() * 2) | 0); for (let i = 0; i < n; i++) scroll(par, x + 0.15, y + i * 0.05, z - 0.04 + i * 0.03, 0.28, r); x += 0.32; }
      else if (k < 0.82 && room > 0.2) { // 書套 cloth-wrapped case
        const bw = 0.17, bh = 0.06 + r() * 0.04;
        rbox(par, bw, bh, 0.16, 0.006, surf('clothI', { tint: r() < 0.5 ? '#ffffff' : '#c8b0a0' }), x + bw / 2, y, z);
        box(par, 0.012, 0.03, 0.004, surf('paper'), x + bw * 0.25, y + bh * 0.3, z + 0.082);
        x += bw + 0.02;
      } else if (k < 0.92) { vase(par, x + 0.05, y, z, Math.min(hgt * 0.8, 0.2), surf('porcelain', { fit: true })); x += 0.12; }
      else { rbox(par, 0.09, 0.06, 0.09, 0.005, surf('lacB'), x + 0.05, y, z); box(par, 0.02, 0.02, 0.004, surf('brass'), x + 0.05, y + 0.02, z + 0.046); x += 0.12; }
    }
  }
  define('bookshelf', {
    variants: 8,
    key: (o) => Math.max(1, o.w | 0 || 2) + '_' + ((o.v | 0) % 8),
    build(o, K) {
      const w = Math.max(1, o.w | 0 || 2), r = rng(77 + (o.v | 0) * 31 + w);
      const g = grp();
      const wood = surf('walnut'), dk = surf('walnut', { tint: '#b09888' }), W = w - 0.06, D = 0.4, H = 1.86;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 0.05, H, 0.05, wood, sx * (W / 2 - 0.025), 0, sz * (D / 2 - 0.025));
      const shelves = [0.12, 0.66, 1.2, H - 0.04];
      for (const yy of shelves) box(g, W - 0.04, 0.03, D - 0.03, wood, 0, yy, 0);
      rbox(g, W + 0.05, 0.04, D + 0.04, 0.012, wood, 0, H, 0);
      box(g, W - 0.04, H - 0.14, 0.015, dk, 0, 0.12, -D / 2 + 0.02);     // back boards
      for (let c = 1; c < w; c++) box(g, 0.035, H - 0.16, D - 0.04, wood, -W / 2 + c * W / w, 0.12, 0);
      for (const sx of [-1, 1]) for (const yy of [0.4, 0.94, 1.48]) box(g, 0.03, 0.025, D - 0.05, dk, sx * (W / 2 - 0.025), yy, 0);
      extrude(g, apronShape(W - 0.1, 0.1, 0.06), 0.02, wood, 0, 0.02, D / 2 - 0.02);
      // contents per compartment
      for (let row = 0; row < 3; row++) for (let c = 0; c < w; c++) {
        const x0 = -W / 2 + c * W / w + 0.02, x1 = x0 + W / w - 0.04;
        fillCompartment(g, x0, x1, shelves[row] + 0.03, 0.01, shelves[row + 1] - shelves[row] - 0.05, r);
      }
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ shared builders (cloth, lanterns, candles)
  // hanging cloth: top edge at (x, y, z), width w along x, height h, gentle folds of depth amp
  function drape(par, w, h, s, x, y, z, o = {}) {
    const THREE = T3();
    const geo = new THREE.PlaneGeometry(w, h, o.sx || 24, o.sy || 4);
    geo.translate(0, -h / 2, 0);
    const p = geo.attributes.position, amp = o.amp == null ? 0.015 : o.amp, fr = o.folds || 9, ph = o.ph || 0;
    for (let i = 0; i < p.count; i++) {
      const xx = p.getX(i), yy = p.getY(i), k = Math.min(1, -yy / h * 1.4 + (o.flatTop ? 0 : 0.25));
      p.setZ(i, sin(xx / w * TAU * fr * 0.5 + ph) * amp * k + (o.bulge || 0) * sin((xx / w + 0.5) * PI));
    }
    geo.computeVertexNormals();
    return mk(par, geo, s, x, y, z, o);
  }
  // paper lantern, bottom of body at y. shape: round | long | drum | palace | folded. motif region: lan_fu | lan_plum | lan_gold | lan_plain
  function lantern(par, x, y, z, rw, rh, col, o = {}) {
    const shape = o.shape || 'round';
    const lg = grp(par, x, y, z, o.ry || 0, o.name);
    const lit = !!o.lit;
    const s = surf(o.motif || 'lan_fu', { fit: true, k: lit ? 'lit' : '', tint: lit ? mix(col, '#fff2c8', 0.3) : col, ao: 1 });
    const cap = surf('lacB'), capH = rh * 0.12;
    if (shape === 'folded') {
      for (let k = 0; k < 3; k++) cyl(lg, rw * (1 - k * 0.05), rw, 0.022, surf('lan_plain', { fit: true, tint: shade(col, -k * 0.08) }), 0, k * 0.024, 0, { seg: 14 });
      return lg;
    }
    if (shape === 'palace') {
      cyl(lg, rw, rw, rh * 2, s, 0, 0, 0, { seg: 6 });
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + PI / 6; box(lg, 0.012, rh * 2 + 0.01, 0.012, surf('lacD'), cos(a) * rw * 0.96, 0, sin(a) * rw * 0.96); }
      cyl(lg, rw * 0.7, rw * 1.08, capH, cap, 0, rh * 2, 0, { seg: 6 });
      cyl(lg, rw * 1.08, rw * 0.7, capH, cap, 0, -capH, 0, { seg: 6 });
    } else {
      const pts = [], n = 8;
      for (let i = 0; i <= n; i++) {
        const t = i / n, a = t * PI;
        let r = shape === 'drum' ? rw * (0.8 + 0.2 * sin(a)) : rw * sin(a);
        r = Math.max(rw * (shape === 'drum' ? 0.8 : 0.42), r);
        pts.push([r, rh * (1 - cos(a))]);
      }
      lathe(lg, pts, s, 0, 0, 0, { seg: o.seg || 9 });
      cyl(lg, rw * 0.46, rw * 0.5, capH, cap, 0, rh * 2 - capH * 0.3, 0, { seg: 12 });
      cyl(lg, rw * 0.5, rw * 0.46, capH, cap, 0, -capH * 0.7, 0, { seg: 12 });
    }
    if (o.hang) cyl(lg, 0.004, 0.004, o.hang, surf('rope'), 0, rh * 2 + capH * 0.5, 0, { seg: 4 });
    if (o.tassel) for (const a of [0, PI / 2]) plane(lg, rw * 0.5, rh * 0.9, surf('tassel', { k: 'cut', fit: true }), 0, -capH - rh * 0.45, 0, { ry: a, cast: false });
    return lg;
  }
  // red candle on a pewter pricket stick; returns the wick tip position (local to par)
  function candle(par, x, y, z, h = 0.2, r = 0.022) {
    const pew = surf('brass', { tint: '#c8c4bc' });
    lathe(par, [[0, 0], [r * 3.2, 0], [r * 3, 0.012], [r * 1.1, 0.03], [r * 0.8, 0.09], [r * 1.6, 0.1], [r * 2.4, 0.112], [r * 2.2, 0.12], [0, 0.12]], pew, x, y, z, { seg: 12 });
    cyl(par, r, r * 1.05, h, surf('wax_red', { fit: true }), x, y + 0.12, z, { seg: 10 });
    cyl(par, r * 0.8, r * 0.8, 0.004, surf('wax_red'), x, y + 0.12 + h, z, { seg: 8 });
    return [x, y + 0.124 + h, z];
  }

  // ------------------------------------------------------------------ 紅眠床 carved red canopy bed (1 × 2, head to the north)
  define('bed', {
    build(o, K) {
      const g = grp();
      const lac = surf('lac'), dk = surf('lacD'), W = 0.98, L = 1.98, BH = 0.46, TOP = 2.15;
      const hw = W / 2 - 0.035, hl = L / 2 - 0.035;
      // plinth: lacquered box with gilt-carved friezes on the long sides and foot
      box(g, W - 0.04, BH - 0.1, L - 0.04, dk, 0, 0.1, 0);
      for (const sx of [-1, 1]) plane(g, L - 0.16, 0.24, surf('carve_gold', { fit: true }), sx * (W / 2 - 0.015), 0.16, 0, { ry: sx * PI / 2 });
      plane(g, W - 0.16, 0.24, surf('carve_gold', { fit: true }), 0, 0.16, L / 2 - 0.015);
      plane(g, W - 0.16, 0.24, surf('carve_gold', { fit: true }), 0, 0.16, -L / 2 + 0.015, { ry: PI });
      g.children.slice(-4).forEach((m) => { m.position.y += 0.12; });
      rbox(g, W, 0.06, L, 0.015, lac, 0, BH - 0.06, 0);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 0.08, 0.1, 0.08, dk, sx * (W / 2 - 0.04), 0, sz * (L / 2 - 0.04));
      // mattress (草蓆 over a board), quilt (客家花布), pillow
      box(g, W - 0.1, 0.04, L - 0.1, surf('rush'), 0, BH, 0);
      rbox(g, W - 0.16, 0.13, 0.95, 0.05, surf('clothH'), 0, BH + 0.04, 0.42);
      rbox(g, W - 0.14, 0.09, 0.22, 0.04, surf('clothH', { tint: '#e8d8d0' }), 0, BH + 0.1, -0.03, { rx: -0.25 });  // folded-back edge
      rbox(g, 0.5, 0.1, 0.22, 0.045, surf('clothW', { tint: '#f4e8d0' }), 0, BH + 0.04, -hl + 0.22);
      box(g, 0.5, 0.012, 0.05, surf('red_band'), 0, BH + 0.135, -hl + 0.22);
      // corner posts with brass finials
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        box(g, 0.065, TOP - BH, 0.065, lac, sx * hw, BH, sz * hl);
        sph(g, 0.045, surf('brass'), sx * hw, TOP + 0.05, sz * hl, { seg: 10 });
      }
      // head panel: lattice lower, gilt frieze upper; low lattice rails on the sides (rear half) and foot
      box(g, W - 0.1, 0.035, 0.05, lac, 0, BH + 0.62, -hl);
      plane(g, W - 0.1, 0.6, surf('lattice_fret', { k: 'cut', fit: true }), 0, BH + 0.32, -hl, {});
      plane(g, W - 0.1, 0.36, surf('carve_gold', { fit: true }), 0, BH + 0.86, -hl + 0.01);
      plane(g, W - 0.1, 0.36, surf('carve_gold', { fit: true }), 0, BH + 0.86, -hl - 0.01, { ry: PI });
      box(g, W - 0.1, 0.035, 0.05, lac, 0, BH + 1.06, -hl);
      for (const sx of [-1, 1]) {
        plane(g, 0.9, 0.24, surf('lattice_fret', { k: 'cut', fit: true }), sx * hw, BH + 0.14, -0.48, { ry: PI / 2 });
        box(g, 0.04, 0.035, 0.95, lac, sx * hw, BH + 0.26, -0.48);
      }
      plane(g, W - 0.1, 0.2, surf('lattice_fret', { k: 'cut', fit: true }), 0, BH + 0.12, hl, {});
      box(g, W - 0.1, 0.035, 0.045, lac, 0, BH + 0.22, hl);
      // canopy: 床楣 gilt lintels on all four sides, top frame, open lattice roof
      const ly = TOP - 0.3;
      for (const sz of [-1, 1]) {
        plane(g, W - 0.08, 0.26, surf('carve_gold', { fit: true }), 0, ly + 0.13, sz * (hl + 0.012), { ry: sz < 0 ? PI : 0 });
        box(g, W + 0.04, 0.05, 0.08, lac, 0, TOP - 0.04, sz * hl);
        box(g, W - 0.08, 0.03, 0.04, lac, 0, ly - 0.02, sz * hl);
      }
      for (const sx of [-1, 1]) {
        plane(g, L - 0.08, 0.26, surf('carve_gold', { fit: true }), sx * (hw + 0.012), ly + 0.13, 0, { ry: sx * PI / 2 });
        box(g, 0.08, 0.05, L + 0.04, lac, sx * hw, TOP - 0.04, 0);
        box(g, 0.04, 0.03, L - 0.08, lac, sx * hw, ly - 0.02, 0);
      }
      plane(g, W - 0.08, L - 0.08, surf('lattice_fret', { k: 'cut', fit: true }), 0, TOP - 0.02, 0, { rx: -PI / 2 });
      // gauze curtains gathered at the four posts, tied with red cords
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        lathe(g, [[0.02, 0], [0.055, 0.06], [0.07, 0.35], [0.045, 0.62], [0.05, 0.9], [0.075, 1.05], [0.06, 1.18], [0.02, 1.2]], surf('clothW', { tint: '#fff6ea' }), sx * (hw - 0.07), BH + 0.42, sz * (hl - 0.07), { seg: 9 });
        cyl(g, 0.05, 0.05, 0.025, surf('red_band'), sx * (hw - 0.07), BH + 1.02, sz * (hl - 0.07), { seg: 9 });
      }
      for (const sx of [-1, 1]) drape(g, L - 0.24, 0.12, surf('valance', { k: 'cut', fit: true }), sx * (hw + 0.03), ly - 0.03, 0, { ry: sx * PI / 2, amp: 0.006, folds: 14 });
      for (const sz of [-1, 1]) drape(g, W - 0.2, 0.12, surf('valance', { k: 'cut', fit: true }), 0, ly - 0.03, sz * (hl + 0.03), { ry: sz < 0 ? PI : 0, amp: 0.006, folds: 6 });
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ 櫃檯 shop counter: abacus, ledgers, brush & inkstone, coins, a lit display lantern
  define('counter', {
    key: (o) => String(Math.max(1, o.w | 0 || 2)),
    build(o, K) {
      const w = Math.max(1, o.w | 0 || 2), g = grp();
      const wood = surf('walnut', { tint: '#e0b8a0' }), dk = surf('walnut', { tint: '#b09080' }), W = w - 0.06, D = 0.6, H = 0.92;
      box(g, W - 0.06, H - 0.12, D - 0.32, dk, 0, 0.06, 0.1);
      box(g, W - 0.06, 0.46, 0.26, dk, 0, 0.06, -0.17);                       // drawer bank behind
      box(g, W - 0.02, 0.06, D - 0.04, dk, 0, 0, -0.01);                       // plinth
      // front (customer side, +z): lacquered coin panels between stiles
      const n = Math.max(1, Math.round(W / 0.47)), pw = (W - 0.06) / n;
      for (let i = 0; i < n; i++) {
        const cx = -W / 2 + 0.03 + pw * (i + 0.5);
        plane(g, pw - 0.04, H - 0.26, surf('coin_panel', { fit: true }), cx, 0.11 + (H - 0.26) / 2, D / 2 - 0.045);
        box(g, 0.035, H - 0.14, 0.04, wood, -W / 2 + 0.03 + pw * i, 0.06, D / 2 - 0.05);
      }
      box(g, 0.035, H - 0.14, 0.04, wood, W / 2 - 0.03, 0.06, D / 2 - 0.05);
      box(g, W - 0.04, 0.05, 0.045, wood, 0, 0.06, D / 2 - 0.05);
      box(g, W - 0.04, 0.05, 0.045, wood, 0, H - 0.13, D / 2 - 0.05);
      // top: thick board with overhang
      rbox(g, W + 0.02, 0.055, D, 0.015, surf('walnut', { tint: '#f0c8b0' }), 0, H - 0.075, 0);
      // shopkeeper side (north): a bank of drawers with brass pulls and an open cubby row with ledgers & a cash box
      const bz = -D / 2 + 0.0, nd = Math.max(2, Math.round(W / 0.32)), dw = (W - 0.08) / nd;
      for (let i = 0; i < nd; i++) {
        const cx = -W / 2 + 0.04 + dw * (i + 0.5);
        for (const yy of [0.12, 0.32]) {
          box(g, dw - 0.03, 0.17, 0.02, surf('walnut', { tint: '#d8b098' }), cx, yy, bz + 0.0);
          box(g, 0.05, 0.015, 0.015, surf('brass'), cx, yy + 0.09, bz - 0.015);
        }
      }
      box(g, W - 0.06, 0.03, 0.27, wood, 0, 0.52, -0.165);
      for (let i = 0; i < 3; i++) box(g, 0.18, 0.025, 0.22, { r: 'book_edge', stretch: true, faces: { y: { r: 'book_cover', cell: [i, 4, 1] } } }, -W / 2 + 0.3 + i * 0.012, 0.55 + i * 0.026, -0.17);
      rbox(g, 0.22, 0.12, 0.18, 0.01, surf('lacB'), W / 2 - 0.3, 0.55, -0.17);
      box(g, 0.05, 0.03, 0.01, surf('brass'), W / 2 - 0.3, 0.6, -0.26);
      box(g, W - 0.02, 0.025, D - 0.04, dk, 0, H - 0.1, 0);
      const ty = H - 0.02;
      // abacus
      const ab = grp(g, -W / 2 + 0.3, ty, 0.04, 0.12);
      box(ab, 0.36, 0.035, 0.15, surf('abacus', { fit: true, faces: { x: 'w_dark', z: 'w_dark' } }), 0, 0, 0);
      // open ledger + closed ledgers
      const lg = grp(g, -0.02, ty, 0.02, -0.08);
      box(lg, 0.15, 0.012, 0.2, surf('ledger', { fit: true }), -0.075, 0, 0, { rz: 0.04 });
      box(lg, 0.15, 0.012, 0.2, surf('ledger', { fit: true }), 0.075, 0, 0, { rz: -0.04 });
      box(lg, 0.31, 0.006, 0.21, surf('clothI'), 0, -0.004, 0);
      for (let i = 0; i < 3; i++) box(g, 0.16, 0.02, 0.22, { r: 'book_edge', stretch: true, faces: { y: { r: 'book_cover', cell: [i % 2 ? 0 : 2, 4, 1] } } }, 0.12 - W / 2 + 0.06 + 0.3, ty + i * 0.02, -0.16, { ry: 0.1 * i });
      // inkstone + brush
      box(g, 0.08, 0.025, 0.12, surf('lacB', { tint: '#606060' }), 0.27, ty, 0.03);
      rod(g, 0.006, 0.2, surf('bamboo'), 0.28, ty + 0.035, 0.12, 'x', { ry: 0.5 });
      // coins
      for (let i = 0; i < 4; i++) cyl(g, 0.016, 0.016, 0.004, surf('gold'), W / 2 - 0.36 + (i % 2) * 0.03, ty + Math.floor(i / 2) * 0.004, 0.12 + i * 0.008, { seg: 10 });
      // display lantern on a little stand (lit)
      const lx = W / 2 - 0.16;
      cyl(g, 0.06, 0.07, 0.03, surf('lacB'), lx, ty, -0.02, { seg: 10 });
      lantern(g, lx, ty + 0.06, -0.02, 0.1, 0.1, '#d8342a', { motif: 'lan_fu', lit: true, tassel: true });
      return finish(K, g, [], o);
    },
    lights: (o) => { const w = Math.max(1, o.w | 0 || 2); return [{ x: w / 2 - 0.19, y: 1.05, z: -0.02, color: '#ffbe70', intensity: 0.9, distance: 3.2, flicker: 0.1 }]; },
  });

  // ------------------------------------------------------------------ 灶 brick kitchen stove: two woks (lidded / rice + steam), fire mouths, chimney with the 灶君 paper
  define('stove', {
    build(o, K) {
      const THREE = T3();
      const g = grp(), dyn = [];
      const W = 1.94, D = 0.9, H = 0.78, WX = [-0.47, 0.44];
      const brick = surf('brick'), pl = surf('plaster');
      // walls (front wall extruded with two arched fire mouths)
      const mouth = (cx) => { const h = new THREE.Path(); h.moveTo(cx - 0.15, 0.06); h.lineTo(cx + 0.15, 0.06); h.lineTo(cx + 0.15, 0.24); h.absarc(cx, 0.24, 0.15, 0, PI, false); h.lineTo(cx - 0.15, 0.06); return h; };
      const fs = new THREE.Shape([new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(W / 2, H), new THREE.Vector2(-W / 2, H)]);
      fs.holes.push(mouth(WX[0]), mouth(WX[1]));
      const fg = new THREE.ExtrudeGeometry(fs, { depth: 0.1, bevelEnabled: false, curveSegments: 10 });
      fg.translate(0, 0, -0.1);
      mk(g, fg, brick, 0, 0, D / 2);
      box(g, 0.1, H, D - 0.1, brick, -W / 2 + 0.05, 0, -0.05);
      box(g, 0.1, H, D - 0.1, brick, W / 2 - 0.05, 0, -0.05);
      box(g, W - 0.2, H, 0.1, brick, 0, 0, -D / 2 + 0.05);
      box(g, W - 0.2, 0.06, D - 0.2, surf('soot'), 0, 0, 0);
      box(g, W - 0.2, 0.05, 0.6, surf('soot'), 0, H - 0.2, -0.05);        // fire-chamber roof
      for (const cx of WX) {
        box(g, 0.3, 0.22, 0.04, surf('soot'), cx, 0.06, 0.18);              // back of the firebox
        // ember bed + charcoal
        lathe(g, [[0, 0.06], [0.12, 0.0], [0.13, 0], [0, 0]], surf('coal'), cx, 0.06, 0.32, { seg: 10, s: [1, 1, 0.7] });
        sph(g, 0.03, surf('ember'), cx - 0.04, 0.08, 0.34, { seg: 6 });
        sph(g, 0.025, surf('ember'), cx + 0.05, 0.075, 0.3, { seg: 6 });
        for (let k = 0; k < 3; k++) rod(g, 0.018, 0.34, surf('oldwood', { tint: '#6a5040' }), cx + (k - 1) * 0.05, 0.1 + k * 0.012, 0.42, 'z', { rx: 0.08 * (k - 1), seg: 6 });
        // plaster arch surround
        const arch = new THREE.Shape(); arch.moveTo(cx - 0.19, 0.05); arch.lineTo(cx - 0.19, 0.24); arch.absarc(cx, 0.24, 0.19, PI, 0, true); arch.lineTo(cx + 0.19, 0.05); arch.lineTo(cx + 0.15, 0.05); arch.lineTo(cx + 0.15, 0.24); arch.absarc(cx, 0.24, 0.15, 0, PI, false); arch.lineTo(cx - 0.15, 0.05); arch.closePath();
        const ag = new THREE.ExtrudeGeometry(arch, { depth: 0.015, bevelEnabled: false, curveSegments: 10 });
        mk(g, ag, pl, 0, 0, D / 2);
      }
      box(g, W, 0.09, 0.02, pl, 0, H - 0.09, D / 2 + 0.005);                // plaster band under the top
      // top slab with two wok holes, red tile edging
      const ts = new THREE.Shape([new THREE.Vector2(-W / 2 - 0.02, -D / 2 - 0.02), new THREE.Vector2(W / 2 + 0.02, -D / 2 - 0.02), new THREE.Vector2(W / 2 + 0.02, D / 2 + 0.02), new THREE.Vector2(-W / 2 - 0.02, D / 2 + 0.02)]);
      for (const cx of WX) { const h = new THREE.Path(); h.absarc(cx, 0.04, 0.3, 0, TAU, true); ts.holes.push(h); }
      const tg = new THREE.ExtrudeGeometry(ts, { depth: 0.06, bevelEnabled: false, curveSegments: 20 });
      tg.rotateX(PI / 2); tg.translate(0, H + 0.06, 0);
      mk(g, tg, surf('plaster', { tint: '#f4ece0' }), 0, 0, 0);
      for (const sz of [-1, 1]) box(g, W + 0.06, 0.035, 0.05, surf('brick', { tint: '#e0a090' }), 0, H + 0.035, sz * (D / 2 + 0.01));
      for (const sx of [-1, 1]) box(g, 0.05, 0.035, D + 0.08, surf('brick', { tint: '#e0a090' }), sx * (W / 2 + 0.01), H + 0.035, 0);
      // woks: iron bowls set into the holes
      for (const [i, cx] of WX.entries()) {
        lathe(g, [[0.33, H + 0.065], [0.31, H + 0.06], [0.29, H - 0.02], [0.22, H - 0.11], [0.12, H - 0.165], [0, H - 0.18]], surf('iron'), cx, 0, 0.04, { seg: 20 });
        if (i === 0) {
          // wooden lid (鍋蓋) of staves with a handle bar
          lathe(g, [[0.32, 0], [0.31, 0.01], [0.24, 0.06], [0.12, 0.1], [0, 0.11]], surf('pine', { tint: '#d8b080' }), cx, H + 0.06, 0.04, { seg: 20 });
          box(g, 0.18, 0.035, 0.04, surf('pine', { tint: '#a87850' }), cx, H + 0.17, 0.04);
        } else {
          cyl(g, 0.21, 0.24, 0.02, surf('rice'), cx, H - 0.02, 0.04, { seg: 18 });
          box(g, 0.035, 0.008, 0.2, surf('bamboo'), cx + 0.12, H + 0.07, 0.2, { ry: 0.5, rx: -0.3 });   // rice paddle
        }
      }
      // bamboo blow-tube (吹火筒) & ladle
      rod(g, 0.02, 0.5, surf('bamboo'), -0.02, H + 0.085, 0.3, 'x', { ry: 0.5 });
      const lad = grp(g, 0.02, H + 0.06, -0.3, 0.3);
      lathe(lad, [[0, 0], [0.05, 0.005], [0.07, 0.04]], surf('iron'), 0.18, 0, 0, { seg: 10 });
      rod(lad, 0.008, 0.32, surf('w_dark'), 0, 0.04, 0, 'x', { rz: 0.15 });
      // chimney with the 灶君 paper (text only)
      const cx0 = 0.66, cz0 = -0.3;
      box(g, 0.3, 1.5, 0.3, surf('plaster', { tint: '#f0e8d8' }), cx0, H + 0.06, cz0);
      box(g, 0.36, 0.06, 0.36, surf('brick'), cx0, H + 1.56, cz0);
      box(g, 0.3, 0.05, 0.3, surf('soot'), cx0, H + 1.62, cz0);
      plane(g, 0.12, 0.24, surf('zaojun', { fit: true }), cx0, H + 0.62, cz0 + 0.152);
      plane(g, 0.18, 0.04, surf('paper_red'), cx0, H + 0.82, cz0 + 0.152);
      // fx: fire in both mouths, steam from the rice wok, smoke from the chimney
      dyn.push(flames([
        { x: WX[0] - 0.04, y: 0.07, z: 0.33, s: 0.06, h: 2.4 }, { x: WX[0] + 0.05, y: 0.07, z: 0.3, s: 0.05, h: 2.2, seed: 0.6 },
        { x: WX[1] - 0.05, y: 0.07, z: 0.32, s: 0.055, h: 2.5, seed: 1.3 }, { x: WX[1] + 0.04, y: 0.07, z: 0.3, s: 0.05, h: 2.1, seed: 2.1 },
      ]));
      dyn.push(smoke([
        { x: WX[1], y: H + 0.02, z: 0.04, n: 10, h: 0.75, size: 0.12, speed: 0.28, col: '#f4f1ea', op: 0.3, spread: 0.07 },
        { x: cx0, y: H + 1.66, z: cz0, n: 10, h: 1.0, size: 0.14, speed: 0.22, col: '#8a847c', op: 0.28, spread: 0.08 },
      ]));
      for (const d of dyn) g.add(d);
      return finish(K, g, dyn, o);
    },
    lights: () => [{ x: -0.47, y: 0.22, z: 0.55, color: '#ff8a3a', intensity: 1.2, distance: 3.5, flicker: 0.35 }, { x: 0.44, y: 0.22, z: 0.55, color: '#ff8a3a', intensity: 1.2, distance: 3.5, flicker: 0.35 }],
  });

  // ------------------------------------------------------------------ 神明桌 altar: 翹頭案 with 神主牌 tablets (never an image of a deity), candles, incense, fruit, 桌裙
  function tabletStand(par, x, y, z, w, h, region) {
    const t = grp(par, x, y, z);
    box(t, w + 0.05, 0.035, 0.09, surf('lacD'), 0, 0, 0);
    box(t, w + 0.02, 0.02, 0.07, surf('gold'), 0, 0.035, 0);
    box(t, w, h, 0.035, surf('lac', { faces: { 'z+': { r: region }, 'z-': 'lac' }, fit: true }), 0, 0.055, 0);
    // fit maps the region onto the front face only when the face override uses projection; use a plane for crisp text
    plane(t, w * 0.96, h * 0.97, surf(region, { fit: true }), 0, 0.055 + h / 2, 0.0185);
    // gilt cloud-scroll crown
    const hw = w / 2 + 0.03;
    extrude(t, [[-hw, 0], [hw, 0], [hw + 0.01, 0.03], [hw * 0.55, 0.045], [0, 0.075], [-hw * 0.55, 0.045], [-hw - 0.01, 0.03]], 0.045, surf('gold'), 0, 0.055 + h, 0, { curve: 4 });
    for (const sx of [-1, 1]) box(t, 0.02, h * 0.9, 0.04, surf('gold'), sx * (w / 2 + 0.012), 0.055, 0);
    return t;
  }
  function fruitPlate(par, x, y, z) {
    lathe(par, [[0, 0], [0.05, 0], [0.04, 0.012], [0.1, 0.025], [0.11, 0.03]], surf('porcelain_w'), x, y, z, { seg: 14 });
    for (const [ox, oz, oy] of [[-0.04, 0.02, 0.06], [0.04, 0.02, 0.06], [0, -0.035, 0.06], [0, 0, 0.12]]) {
      sph(par, 0.042, surf('orange'), x + ox, y + oy, z + oz, { seg: 10 });
    }
    box(par, 0.012, 0.02, 0.004, surf('leaf'), x + 0.01, y + 0.165, z, { rz: 0.5 });
  }
  function incenseSticks(par, x, y, z, n, len, spread, r, tips) {
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = r() * spread, tilt = (r() - 0.5) * 0.25, ry = r() * TAU;
      const sx = x + cos(a) * d, sz = z + sin(a) * d;
      const st = grp(par, sx, y, sz, ry);
      const l = len * (0.7 + r() * 0.3);
      cyl(st, 0.0025, 0.003, l, surf('red_band', { tint: r() < 0.5 ? '#ffffff' : '#e8a080' }), 0, 0, 0, { seg: 4, rz: tilt });
      const tip = [sx + -sin(tilt) * l * cos(ry), y + cos(tilt) * l, sz + sin(tilt) * l * sin(ry)];
      sph(par, 0.005, surf('ember'), tip[0], tip[1], tip[2], { seg: 4, cast: false });
      if (tips) tips.push(tip);
    }
  }
  define('altar', {
    build(o, K) {
      const g = grp(), dyn = [];
      const lac = surf('lac'), dk = surf('lacD'), W = 1.9, D = 0.62, H = 0.98;
      // legs, stretchers, feet
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        box(g, 0.07, H - 0.08, 0.07, lac, sx * (W / 2 - 0.12), 0.04, sz * (D / 2 - 0.07));
        box(g, 0.09, 0.04, 0.09, surf('gold'), sx * (W / 2 - 0.12), 0, sz * (D / 2 - 0.07));
      }
      for (const sx of [-1, 1]) { box(g, 0.05, 0.05, D - 0.14, dk, sx * (W / 2 - 0.12), 0.18, 0); plane(g, D - 0.16, 0.5, surf('lattice_fret', { k: 'cut', fit: true }), sx * (W / 2 - 0.12), 0.25, 0, { ry: PI / 2 }); }
      box(g, W - 0.3, 0.05, 0.05, dk, 0, 0.18, -D / 2 + 0.07);
      // top with 翹頭 upturned ends and a gilt apron
      box(g, W - 0.04, 0.06, D, lac, 0, H - 0.08, 0);
      box(g, W - 0.2, 0.025, D - 0.06, dk, 0, H - 0.105, 0);
      for (const sx of [-1, 1]) extrude(g, [[0, 0], [0.16, 0], [0.16, 0.06], [0.09, 0.07], [0.03, 0.1], [-0.005, 0.12], [0.0, 0.06]].map(([a, b]) => [sx * (W / 2 - 0.02) - sx * a, H - 0.08 + b]), D, lac, 0, 0, 0);
      plane(g, W - 0.24, 0.12, surf('carve_gold', { fit: true }), 0, H - 0.17, -D / 2 + 0.006, { ry: PI });
      // 桌裙 embroidered frontal (front & a narrower one hanging at the back is hidden by the wall — front only)
      drape(g, W - 0.22, H - 0.12, surf('altar_cloth', { k: 'cut', fit: true, ao: 1 }), 0, H - 0.085, D / 2 + 0.012, { amp: 0.012, folds: 11, sx: 30, sy: 6 });
      // ---- on the top (y = H - 0.02): tablets at the back, candles at the ends, burner, fruit, cups
      const ty = H - 0.02;
      tabletStand(g, 0, ty, -0.16, 0.12, 0.42, 'tab_main');
      tabletStand(g, -0.36, ty, -0.18, 0.09, 0.3, 'tab_left');
      tabletStand(g, 0.36, ty, -0.18, 0.09, 0.3, 'tab_right');
      const tipsC = [candle(g, -0.78, ty, -0.02, 0.24, 0.026), candle(g, 0.78, ty, -0.02, 0.24, 0.026)];
      fruitPlate(g, -0.56, ty, 0.08); fruitPlate(g, 0.56, ty, 0.08);
      // bronze censer with three sticks
      lathe(g, [[0, 0], [0.045, 0], [0.05, 0.02], [0.08, 0.035], [0.095, 0.08], [0.088, 0.11], [0.1, 0.12], [0.085, 0.12], [0.075, 0.105], [0, 0.105]], surf('bronze', { fit: true }), 0, ty, 0.1, { seg: 16 });
      for (const sx of [-1, 1]) box(g, 0.018, 0.04, 0.016, surf('bronze'), sx * 0.09, ty + 0.11, 0.1);
      cyl(g, 0.078, 0.078, 0.004, surf('ash'), 0, ty + 0.1, 0.1, { seg: 14 });
      const tips = [];
      incenseSticks(g, 0, ty + 0.1, 0.1, 3, 0.2, 0.03, rng(11), tips);
      for (const tx of [-0.2, 0.2]) lathe(g, [[0, 0], [0.018, 0], [0.03, 0.04], [0.032, 0.042]], surf('porcelain_w'), tx, ty, 0.18, { seg: 10 });
      dyn.push(flames(tipsC.map((t, i) => ({ x: t[0], y: t[1], z: t[2], s: 0.016, h: 3.2, i: 1.8, seed: i * 0.7 }))));
      dyn.push(smoke(tips.map((t, i) => ({ x: t[0], y: t[1], z: t[2], n: 9, h: 0.85, size: 0.035, speed: 0.12, col: '#d8d4cc', op: 0.32, spread: 0.035, curl: 0.06, seed: i * 0.31 }))));
      for (const d of dyn) g.add(d);
      return finish(K, g, dyn, o);
    },
    lights: () => [{ x: -0.78, y: 1.34, z: 0, color: '#ffb560', intensity: 0.55, distance: 3, flicker: 0.2 }, { x: 0.78, y: 1.34, z: 0, color: '#ffb560', intensity: 0.55, distance: 3, flicker: 0.2 }],
  });

  // ------------------------------------------------------------------ 香爐 big bronze temple censer on a granite pedestal
  define('incense_burner', {
    build(o, K) {
      const g = grp(), dyn = [];
      const st = surf('granite');
      box(g, 0.84, 0.08, 0.84, st, 0, 0, 0);
      box(g, 0.74, 0.28, 0.74, st, 0, 0.08, 0);
      for (const a of [0, PI / 2, PI, -PI / 2]) {
        const p = grp(g, 0, 0, 0, a);
        box(p, 0.5, 0.18, 0.012, surf('granite', { tint: '#b8b4ac' }), 0, 0.13, 0.37);  // sunken panel border
        cyl(p, 0.06, 0.06, 0.012, surf('granite', { tint: '#8a8680' }), 0, 0.22, 0.376, { seg: 14, rx: PI / 2 });
      }
      rbox(g, 0.86, 0.07, 0.86, 0.02, st, 0, 0.36, 0);
      // tripod legs with animal-mask knees
      const by = 0.43;
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * TAU + PI / 2;
        const lx = cos(a) * 0.2, lz = sin(a) * 0.2;
        cyl(g, 0.035, 0.05, 0.16, surf('bronze'), lx, by, lz, { seg: 8 });
        sph(g, 0.045, surf('bronze'), lx * 1.08, by + 0.15, lz * 1.08, { seg: 8 });
      }
      // body + rim
      lathe(g, [[0, 0.1], [0.12, 0.1], [0.24, 0.13], [0.31, 0.2], [0.33, 0.3], [0.31, 0.38], [0.33, 0.42], [0.36, 0.43], [0.35, 0.45], [0.3, 0.44]], surf('bronze', { fit: true }), 0, by, 0, { seg: 22 });
      cyl(g, 0.3, 0.3, 0.01, surf('ash'), 0, by + 0.42, 0, { seg: 20 });
      // upright ears (立耳)
      for (const sx of [-1, 1]) {
        // upright ear: a cast loop (extruded outline with a hole)
        const THREE = T3(), es = new THREE.Shape([[-0.075, 0], [0.075, 0], [0.08, 0.17], [-0.08, 0.17]].map(([a, b]) => new THREE.Vector2(a, b)));
        const eh = new THREE.Path(); eh.moveTo(-0.04, 0.045); eh.lineTo(0.04, 0.045); eh.lineTo(0.045, 0.13); eh.lineTo(-0.045, 0.13); eh.closePath(); es.holes.push(eh);
        const eg = new THREE.ExtrudeGeometry(es, { depth: 0.03, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1 }); eg.translate(0, 0, -0.015);
        mk(g, eg, surf('bronze'), sx * 0.31, by + 0.41, 0, { ry: PI / 2 });
      }
      const tips = [];
      incenseSticks(g, 0, by + 0.43, 0, 15, 0.32, 0.18, rng(8), tips);
      dyn.push(smoke([0, 4, 9].map((i, k) => ({ x: tips[i][0], y: tips[i][1], z: tips[i][2], n: 10, h: 1.3, size: 0.06, speed: 0.14, col: '#d8d2c8', op: 0.3, spread: 0.05, curl: 0.08, seed: k * 0.33 }))));
      for (const d of dyn) g.add(d);
      return finish(K, g, dyn, o);
    },
  });

  // ------------------------------------------------------------------ lantern shop display shelf (o.w wide, o.v arrangement); lit display row on top
  const LCOLS = ['#d8342a', '#ee8a2a', '#f2c14e', '#e8739a', '#3fae8f', '#4d9bd6', '#f3ead2', '#8e5bb5', '#c62f4b', '#f06a3a'];
  const MOTIFS = ['lan_fu', 'lan_plum', 'lan_gold', 'lan_plain'];
  define('shelf_lanterns', {
    variants: 8,
    key: (o) => Math.max(1, o.w | 0 || 2) + '_' + ((o.v | 0) % 8),
    build(o, K) {
      const w = Math.max(1, o.w | 0 || 2), r = rng(21 + (o.v | 0) * 37 + w * 3);
      const g = grp();
      const wood = surf('camphor'), dk = surf('camphor', { tint: '#9a8070' }), W = w - 0.06, D = 0.42, H = 1.62;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 0.05, H, 0.05, wood, sx * (W / 2 - 0.025), 0, sz * (D / 2 - 0.025));
      const shelves = [0.1, 0.6, 1.1, H - 0.04];
      for (const yy of shelves) box(g, W - 0.04, 0.03, D - 0.03, wood, 0, yy, 0);
      rbox(g, W + 0.05, 0.04, D + 0.04, 0.012, wood, 0, H, 0);
      box(g, W - 0.04, H - 0.12, 0.015, dk, 0, 0.1, -D / 2 + 0.02);
      for (const sx of [-1, 1]) for (const yy of [0.35, 0.85, 1.35]) box(g, 0.03, 0.025, D - 0.05, dk, sx * (W / 2 - 0.025), yy, 0);
      drape(g, W, 0.13, surf('valance', { k: 'cut', fit: true }), 0, H + 0.005, D / 2 + 0.03, { amp: 0.004, folds: 12 });
      // shelf rows: hanging/standing lanterns of many shapes, a few folded stacks
      for (let row = 0; row < 3; row++) {
        const y0 = shelves[row] + 0.03, avail = shelves[row + 1] - shelves[row] - 0.06;
        let x = -W / 2 + 0.07;
        while (x < W / 2 - 0.1) {
          const col = LCOLS[(r() * LCOLS.length) | 0];
          if (r() < 0.2 && row === 0) { lantern(g, x + 0.08, y0, 0, 0.08, 0.02, col, { shape: 'folded' }); x += 0.18; continue; }
          const rw = 0.06 + r() * 0.04, rh = Math.min(avail * 0.42, rw * (0.8 + r() * 0.6));
          const shape = ['round', 'round', 'long', 'drum', 'palace'][(r() * 5) | 0];
          lantern(g, x + rw, y0 + 0.02, (r() - 0.5) * 0.06, rw, shape === 'long' ? Math.min(avail * 0.45, rw * 1.5) : rh, col, { shape, motif: MOTIFS[(r() * 4) | 0], lit: r() < 0.22, seg: 8 });
          x += rw * 2 + 0.03;
        }
      }
      // display row on top (lit)
      const n = Math.max(2, Math.round(W / 0.62) + 1);
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + W * (i + 0.5) / n;
        cyl(g, 0.05, 0.06, 0.025, surf('lacB'), x, H + 0.04, 0, { seg: 10 });
        lantern(g, x, H + 0.09, 0, 0.11, 0.1, LCOLS[(r() * 6) | 0], { shape: r() < 0.3 ? 'palace' : 'round', motif: MOTIFS[(r() * 3) | 0], lit: i % 2 === 0 || n === 2, tassel: false });
      }
      return finish(K, g, [], o);
    },
    lights: (o) => { const w = Math.max(1, o.w | 0 || 2), W = w - 0.06, n = Math.max(2, Math.round(W / 0.62) + 1), out = []; for (let i = 0; i < n && out.length < 2; i += 2) out.push({ x: -W / 2 + W * (i + 0.5) / n, y: 1.81, z: 0, color: '#ffc477', intensity: 0.7, distance: 3, flicker: 0.12 }); return out; },
  });

  // ------------------------------------------------------------------ 2D art capture: draw a G.Objects type at high resolution
  // returns { canvas, S, ox, oy } where logical (lx, ly) of the footprint maps to canvas px ((ox + lx) * S, (oy + ly) * S)
  function art2D(type, o, S = 6, padX = 16, up = 16, padB = 16) {
    const d = G.Objects.get(type);
    if (!d || !d.draw) return null;
    const w = (o.w || d.w) * 64, h = (o.h || d.h) * 64;
    const prev = G.S;
    let c = null;
    try {
      G.S = S;
      c = G.U.makeCanvas(w + padX * 2, h + up + padB, S);
      d.draw(c.getContext('2d'), padX, up, Object.assign({ x: 0, y: 0 }, o), 0);
    } catch (e) { G.warnOnce('pi art2D ' + type, e); } finally { G.S = prev; }
    return c && { canvas: c, S, ox: padX, oy: up };
  }
  function blit2D(g, a, lx, ly, lw, lh, w, h) { if (a) g.drawImage(a.canvas, (a.ox + lx) * a.S, (a.oy + ly) * a.S, lw * a.S, lh * a.S, 0, 0, w, h); }

  // ------------------------------------------------------------------ 屏風 four-panel folding screen: ink landscape front, calligraphy back
  const SCREEN_POEM = ['眾裡尋他千百度', '驀然回首', '那人卻在', '燈火闌珊處'];
  function screenPaint(g, w, h, r) {
    const H2 = h / 2;
    // ---- front: misty ink landscape across four panels
    g.fillStyle = lgr(g, 0, 0, 0, H2, [[0, '#f2e6c8'], [1, '#e0cfa6']]); g.fillRect(0, 0, w, H2);
    g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.arc(w * 0.8, H2 * 0.2, 22, 0, TAU); g.fill();
    const mtn = (base, amp, col, a, seed, f) => {
      const rr = rng(seed); g.beginPath(); g.moveTo(0, H2);
      for (let x = 0; x <= w; x += 6) g.lineTo(x, base - Math.abs(sin(x * f + seed)) * amp - rr() * amp * 0.18 - Math.max(0, sin(x * f * 0.37 + seed * 2)) * amp * 0.6);
      g.lineTo(w, H2); g.closePath();
      g.fillStyle = lgr(g, 0, base - amp * 1.6, 0, base + 40, [[0, rgba(col, a)], [1, rgba(col, 0)]]); g.fill();
    };
    mtn(H2 * 0.42, 70, '#5a6e7a', 0.55, 2, 0.011); mtn(H2 * 0.6, 60, '#3c4c56', 0.65, 5, 0.014); mtn(H2 * 0.8, 40, '#2a3238', 0.75, 9, 0.02);
    g.fillStyle = 'rgba(244,234,210,0.6)'; g.fillRect(0, H2 * 0.5, w, 10); g.fillRect(0, H2 * 0.72, w, 8);
    // pine on the left
    g.strokeStyle = '#2a2420'; g.lineWidth = 6; g.beginPath(); g.moveTo(20, H2); g.bezierCurveTo(40, H2 * 0.6, 30, H2 * 0.35, 110, H2 * 0.18); g.stroke();
    for (const [px, py] of [[60, 70], [90, 52], [120, 44], [80, 90], [50, 110]]) { g.fillStyle = rgba('#2e4a38', 0.85); g.beginPath(); g.ellipse(px, py, 22, 8, -0.2, 0, TAU); g.fill(); }
    // boat & ferryman
    g.strokeStyle = '#2a2420'; g.lineWidth = 3; g.beginPath(); g.moveTo(w * 0.52, H2 * 0.86); g.quadraticCurveTo(w * 0.55, H2 * 0.9, w * 0.59, H2 * 0.86); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.56, H2 * 0.86); g.lineTo(w * 0.565, H2 * 0.78); g.stroke();
    // calligraphy + seal on the right panel
    vtxt(g, '山色空濛雨亦奇', w * 0.94, H2 * 0.08, H2 * 0.62, 17, 'rgba(30,24,20,0.85)', { weight: 'normal' });
    vtxt(g, '水光瀲灩晴方好', w * 0.905, H2 * 0.08, H2 * 0.62, 17, 'rgba(30,24,20,0.85)', { weight: 'normal' });
    g.fillStyle = '#b8322a'; g.fillRect(w * 0.885, H2 * 0.66, 16, 16); txt(g, '印', w * 0.885 + 8, H2 * 0.66 + 8, 11, '#f4e0c8');
    speck(g, w, H2, 300, '#a08a60', 0.15, r, 1.5);
    // ---- back: one column of the poem per panel on pale silk
    g.fillStyle = lgr(g, 0, H2, 0, h, [[0, '#efe4c8'], [1, '#e4d4ae']]); g.fillRect(0, H2, w, H2);
    for (let i = 0; i < 4; i++) {
      const cx = w * (3 - i + 0.5) / 4; // right-to-left reading when seen from behind
      vtxt(g, SCREEN_POEM[i], cx, H2 + 30, H2 + 30 + Math.min(H2 - 60, SCREEN_POEM[i].length * 30), 28, '#1e1814');
    }
    g.fillStyle = '#b8322a'; g.fillRect(w * 0.06, h - 60, 18, 18);
    speck(g, w, H2, 200, '#a08a60', 0.12, r, 1.5, 0, H2);
  }
  define('screen', {
    build(o, K) {
      const g = grp();
      const silk = paintedMat('screen', 1024, 512, screenPaint, { params: { roughness: 0.8 } });
      const fr = surf('rose'), N = 4, L = 0.5, A = 0.32, Hh = 1.72;
      const pts = [[0, 0]];
      for (let i = 0; i < N; i++) { const a = (i % 2 ? -1 : 1) * A; pts.push([pts[i][0] + L * cos(a), pts[i][1] + L * sin(a)]); }
      const ox = pts[N][0] / 2, oz = (pts.reduce((s, p) => s + p[1], 0) / pts.length);
      for (let i = 0; i < N; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
        const pg = grp(g, (x0 + x1) / 2 - ox, 0, (z0 + z1) / 2 - oz, -Math.atan2(z1 - z0, x1 - x0));
        // frame: stiles, rails, carved lattice skirt, feet
        for (const sx of [-1, 1]) box(pg, 0.035, Hh, 0.035, fr, sx * (L / 2 - 0.02), 0.04, 0);
        for (const yy of [0.04, 0.36, Hh - 0.03]) box(pg, L - 0.04, 0.035, 0.03, fr, 0, yy, 0);
        box(pg, L - 0.06, 0.03, 0.025, fr, 0, Hh + 0.04, 0);
        plane(pg, L - 0.07, 0.28, surf('lattice_fret', { k: 'cut', fit: true }), 0, 0.22, 0, {});
        plane(pg, L - 0.07, Hh - 0.42, { mat: silk, cell: [i, 4, 2] }, 0, 0.395 + (Hh - 0.42) / 2, 0.004);
        plane(pg, L - 0.07, Hh - 0.42, { mat: silk, cell: [4 + i, 4, 2] }, 0, 0.395 + (Hh - 0.42) / 2, -0.004, { ry: PI });
        for (const sx of [-1, 1]) box(pg, 0.06, 0.04, 0.12, surf('rose', { tint: '#8a7068' }), sx * (L / 2 - 0.03), 0, 0);
        for (const yy of [0.5, Hh - 0.3]) box(pg, 0.02, 0.06, 0.04, surf('brass'), L / 2, yy, 0);
        // finials
        for (const sx of [-1, 1]) sph(pg, 0.025, fr, sx * (L / 2 - 0.02), Hh + 0.07, 0, { seg: 8 });
      }
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ rug (non-solid, o.w × o.h) — the 2D carpet design painted at high resolution
  define('rug', {
    key: (o) => (o.w || 3) + 'x' + (o.h || 2),
    build(o, K) {
      const w = Math.max(1, o.w | 0 || 3), h = Math.max(1, o.h | 0 || 2), g = grp();
      const mat = paintedMat('rug' + w + 'x' + h, Math.min(1024, w * 192), Math.min(1024, h * 192), (c, W, H) => {
        const a = art2D('rug', { w, h }, 6);
        blit2D(c, a, 0, 0, w * 64, h * 64, W, H);
      }, { cut: true, params: { roughness: 0.95 } });
      const geo = new (T3().PlaneGeometry)(w, h, w * 4, h * 4);
      // slight lumps so it reads as cloth, edges kissing the floor
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const e = Math.min(w / 2 - Math.abs(x), h / 2 - Math.abs(y)); p.setZ(i, 0.012 + Math.min(0.006, e * 0.04) + sin(x * 3.1 + y * 2.3) * 0.002); }
      geo.computeVertexNormals();
      mk(g, geo, { mat, aoMin: 1 }, 0, 0, 0, { rx: -PI / 2, cast: false });
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ door_frame: wall-mounted doorway on the wall's south face with a swaying blue 門簾
  function curtainPaint(g, w, h, r) {
    g.clearRect(0, 0, w, h);
    const half = (x0, x1) => {
      g.fillStyle = lgr(g, x0, 0, x1, 0, [[0, '#2c4a86'], [0.3, '#36579a'], [0.6, '#253f74'], [1, '#1f355f']]); g.fillRect(x0, 0, x1 - x0, h);
      for (let y = 0; y < h; y += 3) { g.fillStyle = 'rgba(10,20,40,0.12)'; g.fillRect(x0, y, x1 - x0, 1); }
    };
    half(0, w / 2 - 3); half(w / 2 + 3, w);
    // white crest: circle with a lantern
    const cx = w / 2, cy = h * 0.32, R = w * 0.18;
    g.strokeStyle = '#f2ecdf'; g.lineWidth = R * 0.18; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    g.fillStyle = '#f2ecdf'; g.beginPath(); g.ellipse(cx, cy, R * 0.42, R * 0.55, 0, 0, TAU); g.fill();
    g.fillRect(cx - R * 0.3, cy - R * 0.68, R * 0.6, R * 0.14); g.fillRect(cx - R * 0.3, cy + R * 0.54, R * 0.6, R * 0.14);
    g.clearRect(w / 2 - 3, 0, 6, h);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 10, w, 10);
  }
  region('door_dark', 64, 128, { rough: 1 }, (g, w, h) => { g.fillStyle = lgr(g, 0, 0, 0, h, [[0, '#060403'], [0.7, '#1c120c'], [1, '#4a3420']]); g.fillRect(0, 0, w, h); });
  define('door_frame', {
    build(o, K) {
      const g = grp(), dyn = [];
      const f = surf('rose'), z0 = 0.5;
      plane(g, 0.86, 2.1, surf('door_dark', { fit: true, aoMin: 1 }), 0, 1.05, z0 + 0.004);
      for (const sx of [-1, 1]) {
        box(g, 0.1, 2.28, 0.12, f, sx * 0.48, 0, z0 + 0.04);
        box(g, 0.14, 0.12, 0.14, surf('granite'), sx * 0.48, 0, z0 + 0.05);       // stone post bases
      }
      box(g, 1.12, 0.16, 0.14, f, 0, 2.2, z0 + 0.05);
      rbox(g, 0.36, 0.11, 0.03, 0.01, surf('lac'), 0, 2.225, z0 + 0.13);
      sph(g, 0.022, surf('gold'), 0, 2.28, z0 + 0.145, { seg: 8 });
      box(g, 0.98, 0.06, 0.16, surf('walnut'), 0, 0, z0 + 0.06);                // threshold (門檻)
      rod(g, 0.012, 0.92, surf('bamboo'), 0, 2.08, z0 + 0.1, 'x');
      // curtain: two halves on a rod, sways in update
      const cur = grp(g, 0, 2.08, z0 + 0.1, 0, 'curtain');
      const cm = paintedMat('door_curtain', 256, 384, curtainPaint, { cut: true, params: { roughness: 0.95 } });
      drape(cur, 0.86, 1.28, { mat: cm, ao: 1, aoMin: 1 }, 0, 0, 0, { amp: 0.014, folds: 6, sx: 16, sy: 6 });
      dyn.push(cur);
      return finish(K, g, dyn, o);
    },
    update(node, o, t) {
      const c = node.getObjectByName('curtain');
      if (c) { const ph = phaseOf(o); c.rotation.x = -0.04 - 0.035 * (0.6 + 0.4 * sin(t * 0.7 + ph)) * sin(t * 1.9 + ph); c.rotation.z = 0.01 * sin(t * 1.3 + ph); }
    },
  });

  // ------------------------------------------------------------------ stairs_up (non-solid): treads rise north into a dark stairwell opening on the wall face
  define('stairs_up', {
    build(o, K) {
      const g = grp();
      const n = 7, rise = 1.75 / n, run = 1.0 / n, tread = surf('pine', { tint: '#c09070' }), riser = surf('pine', { tint: '#8a6448' });
      for (let i = 0; i < n; i++) {
        const z = 0.5 - (i + 1) * run, y = i * rise;
        box(g, 0.82, rise, run + 0.02, riser, 0, y, z + run / 2);
        rbox(g, 0.86, 0.035, run + 0.035, 0.008, tread, 0, y + rise - 0.02, z + run / 2 + 0.005);
      }
      for (const sx of [-1, 1]) {
        // stringers + handrail rising with the flight
        const str = new (T3().Shape)(); str.moveTo(0.5, 0); str.lineTo(0.5, 0.25); str.lineTo(-0.5, 1.95); str.lineTo(-0.5, 1.6); str.closePath();
        const sg = new (T3().ExtrudeGeometry)(str, { depth: 0.06, bevelEnabled: false }); sg.rotateY(PI / 2); sg.translate(-0.03, 0, 0);
        mk(g, sg, surf('walnut'), sx * 0.45, 0, 0);
        tube(g, [[sx * 0.47, 0.95, 0.48], [sx * 0.47, 1.6, -0.2], [sx * 0.47, 2.05, -0.49]], 0.022, surf('walnut', { tint: '#d0a080' }), { seg: 6 });
        for (let k = 0; k < 3; k++) { const z = 0.3 - k * 0.32, y = (0.5 - z) * 1.75; box(g, 0.025, 0.95 - 0.15, 0.025, surf('walnut'), sx * 0.47, y + 0.05, z); }
        box(g, 0.08, 0.98, 0.08, surf('walnut'), sx * 0.47, 0, 0.44);     // newel post
        sph(g, 0.045, surf('brass', { tint: '#c08860' }), sx * 0.47, 1.0, 0.44, { seg: 8 });
      }
      // stairwell opening: dark gradient on the wall face above the flight
      plane(g, 0.9, 1.25, surf('door_dark', { fit: true, aoMin: 1, flipU: false }), 0, 1.95, -0.495);
      box(g, 1.0, 0.1, 0.06, surf('walnut'), 0, 2.55, -0.47);
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ stairs_down (non-solid): a real opening in the floor — the pit is drawn before the floor and a
  // depth-only mask at floor level stops the floor from painting over it
  define('stairs_down', {
    build(o, K) {
      const THREE = T3();
      const g = grp();
      const fr = surf('pine', { tint: '#b08868' });
      // floor frame + rail stubs
      for (const sz of [-1, 1]) box(g, 0.96, 0.03, 0.07, fr, 0, 0, sz * 0.455);
      for (const sx of [-1, 1]) {
        box(g, 0.07, 0.03, 0.84, fr, sx * 0.455, 0, 0);
        box(g, 0.05, 0.75, 0.05, surf('walnut'), sx * 0.455, 0, 0.42);
        sph(g, 0.035, surf('brass', { tint: '#c08860' }), sx * 0.455, 0.77, 0.42, { seg: 8 });
        tube(g, [[sx * 0.455, 0.75, 0.42], [sx * 0.455, 0.72, 0.0], [sx * 0.455, 0.5, -0.42]], 0.018, surf('walnut'), { seg: 4 });
        box(g, 0.05, 0.5, 0.05, surf('walnut'), sx * 0.455, 0, -0.42);
      }
      // pit (below y = 0): walls + steps descending north, kept separate with a negative render order
      const pit = grp();
      const iw = 0.84, idp = 0.84, depth = 1.2;
      const deep = (x, y, z) => 0.1 + 0.9 * Math.pow(Math.max(0, 1 + Math.min(y, -0.42 - z + y * 0.3) / depth), 1.5);
      const wall = surf('plaster', { tint: '#9a8670', aoMin: 1, aoFn: deep });
      // side walls run on under the floor to the north; a dark back wall far down
      for (const sx of [-1, 1]) box(pit, 0.04, depth - 0.012, 1.5, wall, sx * (iw / 2 + 0.02), -depth, -0.33);   // tops just under the floor (no z-fight)
      box(pit, iw, 0.14, 0.04, wall, 0, -0.14, idp / 2 + 0.02);
      box(pit, iw, depth - 0.02, 0.04, surf('soot', { aoMin: 1 }), 0, -depth, -1.06);
      box(pit, iw + 0.08, 0.04, 1.5, surf('soot', { aoMin: 1 }), 0, -depth - 0.04, -0.33);
      box(pit, iw, 0.15, 0.06, surf('walnut', { aoMin: 1, aoFn: deep }), 0, -0.16, -idp / 2 - 0.03);   // floor-slab edge over the flight
      const n = 11, run = 0.12, rise = 0.1;
      for (let i = 0; i < n; i++) {
        const top = -0.1 - i * rise, z = idp / 2 - (i + 0.5) * run;
        box(pit, iw - 0.02, depth + top, run + 0.005, surf('pine', { tint: '#c09878', aoMin: 1, aoFn: deep }), 0, -depth, z);
        box(pit, iw - 0.02, 0.025, 0.03, surf('walnut', { aoMin: 1, aoFn: deep }), 0, top - 0.012, z + run / 2 - 0.012);   // nosing
      }
      bake(pit);
      const pm = K.merge(pit);
      pm.traverse((m) => { if (m.isMesh) { m.renderOrder = -3; m.castShadow = false; } });
      const mask = new THREE.Mesh(new THREE.PlaneGeometry(iw + 0.02, idp + 0.02), new THREE.MeshBasicMaterial({ colorWrite: false }));
      mask.rotation.x = -PI / 2; mask.position.y = 0.003; mask.renderOrder = -2; mask.castShadow = false; mask.receiveShadow = false;
      mask.userData.noMerge = true;
      return finish(K, g, [pm, mask], o);
    },
  });

  // ------------------------------------------------------------------ mural (wall-mounted on the wall's south face; o.v 0..4 scenes from the 2D art)
  define('mural', {
    variants: 5,
    key: (o) => String((o.v | 0) % 5),
    build(o, K) {
      const v = (o.v | 0) % 5, g = grp();
      const mat = paintedMat('mural' + v, 640, 256, (c, W, H) => {
        const a = art2D('mural', { v, w: 2, h: 1 }, 7);
        blit2D(c, a, 9.5, 7.5, 128 - 19, 44, W, H);
      }, { params: { roughness: 0.85 } });
      const z0 = 0.5, cy = 1.45, PW = 1.66, PH = 0.68;
      const f = surf('rose');
      box(g, PW + 0.12, PH + 0.12, 0.03, surf('paper', { tint: '#d8c49a' }), 0, cy - (PH + 0.12) / 2, z0 + 0.02);   // mount
      box(g, PW + 0.02, PH + 0.02, 0.012, surf('lac', { tint: '#c06048' }), 0, cy - (PH + 0.02) / 2, z0 + 0.03);
      plane(g, PW - 0.02, PH - 0.02, { mat, aoMin: 1 }, 0, cy, z0 + 0.0375);
      // gilt-edged moulded frame
      for (const sy of [-1, 1]) rbox(g, PW + 0.2, 0.06, 0.05, 0.012, f, 0, cy + sy * (PH / 2 + 0.06) - 0.03, z0 + 0.04);
      for (const sx of [-1, 1]) rbox(g, 0.06, PH + 0.18, 0.05, 0.012, f, sx * (PW / 2 + 0.07), cy - (PH + 0.18) / 2, z0 + 0.04);
      for (const sy of [-1, 1]) box(g, PW + 0.08, 0.008, 0.008, surf('gold'), 0, cy + sy * (PH / 2 + 0.028), z0 + 0.068);
      for (const sx of [-1, 1]) box(g, 0.008, PH + 0.06, 0.008, surf('gold'), sx * (PW / 2 + 0.035), cy - (PH + 0.06) / 2, z0 + 0.068);
      // hanging cord to a nail
      tube(g, [[-0.5, cy + PH / 2 + 0.09, z0 + 0.03], [0, cy + PH / 2 + 0.32, z0 + 0.012], [0.5, cy + PH / 2 + 0.09, z0 + 0.03]], 0.005, surf('red_band'), { seg: 8, rseg: 3 });
      sph(g, 0.014, surf('brass'), 0, cy + PH / 2 + 0.32, z0 + 0.012, { seg: 6 });
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ bed_mat (non-solid 1 × 2): 草蓆 sleeping mat, rolled pillow, folded 藍染 quilt
  define('bed_mat', {
    build(o, K) {
      const g = grp();
      rbox(g, 0.86, 0.018, 1.8, 0.006, surf('rush'), 0, 0, 0.0);
      for (const sz of [-1, 1]) box(g, 0.87, 0.02, 0.03, surf('cloth_indigo', { tint: '#606060' }), 0, 0, sz * 0.89);
      // pillow roll with embroidered ends
      rod(g, 0.07, 0.5, surf('clothW', { tint: '#f6ead4' }), 0, 0.085, -0.72, 'x', { seg: 12 });
      for (const sx of [-1, 1]) rod(g, 0.072, 0.03, surf('red_band'), sx * 0.24, 0.085, -0.72, 'x', { seg: 12 });
      // quilt: lower part, top fold turned back, slightly lumpy
      rbox(g, 0.78, 0.08, 0.95, 0.035, surf('clothI'), 0, 0.012, 0.38);
      rbox(g, 0.76, 0.05, 0.28, 0.025, surf('clothI', { tint: '#d0d8e8' }), 0, 0.085, -0.05, { rx: 0.06 });
      rbox(g, 0.79, 0.02, 0.05, 0.01, surf('clothW'), 0, 0.09, -0.19);
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ 功夫茶 tea set on a low table: Yixing pot, pitcher, cups, caddy, and a little charcoal stove with a steaming kettle
  function teapot(par, x, y, z, s, sf) {
    const p = grp(par, x, y, z, 0.6);
    lathe(p, [[0, 0], [0.045, 0], [0.06, 0.02], [0.065, 0.045], [0.055, 0.07], [0.035, 0.08], [0, 0.08]].map(([a, b]) => [a * s, b * s]), sf, 0, 0, 0, { seg: 14 });
    sph(p, 0.012 * s, sf, 0, 0.088 * s, 0, { seg: 8 });
    tube(p, [[0.055 * s, 0.035 * s, 0], [0.085 * s, 0.06 * s, 0], [0.1 * s, 0.085 * s, 0]], 0.008 * s, sf, { seg: 5, rseg: 5 });
    tube(p, [[-0.055 * s, 0.065 * s, 0], [-0.095 * s, 0.065 * s, 0], [-0.095 * s, 0.025 * s, 0], [-0.058 * s, 0.025 * s, 0]], 0.007 * s, sf, { seg: 8, rseg: 5 });
    return p;
  }
  define('tea_set', {
    build(o, K) {
      const g = grp(), dyn = [];
      const wood = surf('rose'), H = 0.36;
      rbox(g, 0.86, 0.045, 0.62, 0.012, wood, 0, H - 0.045, 0);
      aprons(g, 0.86, 0.62, H - 0.045, 0.06, 0.03, wood, 0.05, 0.018);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) hoofLeg(g, sx * 0.37, sz * 0.25, H - 0.045, 0.045, wood, -sx, -sz);
      // bamboo-slatted tea tray (茶盤)
      const ty = H;
      box(g, 0.48, 0.035, 0.3, surf('w_dark', { tint: '#b09070' }), -0.08, ty, 0.02);
      for (let i = 0; i < 8; i++) box(g, 0.44, 0.008, 0.022, surf('bamboo'), -0.08, ty + 0.035, -0.11 + i * 0.033);
      const sy = ty + 0.043;
      teapot(g, -0.16, sy, -0.02, 1, surf('yixing'));
      lathe(g, [[0, 0], [0.035, 0], [0.04, 0.06], [0.036, 0.08], [0.045, 0.085]], surf('porcelain_w'), 0.0, sy, -0.03, { seg: 12 });     // 公道杯
      for (const [cx, cz] of [[-0.25, 0.09], [-0.15, 0.1], [-0.05, 0.1], [0.05, 0.09]]) {
        lathe(g, [[0, 0], [0.014, 0], [0.022, 0.025], [0.024, 0.03]], surf('porcelain_w'), cx, sy, cz, { seg: 10 });
        cyl(g, 0.019, 0.019, 0.003, surf('tea'), cx, sy + 0.02, cz, { seg: 10 });
      }
      cyl(g, 0.04, 0.04, 0.1, surf('brass', { tint: '#b8b8b0' }), 0.3, ty, -0.18, { seg: 12 });                                        // tin caddy
      cyl(g, 0.042, 0.042, 0.02, surf('brass', { tint: '#a8a8a0' }), 0.3, ty + 0.1, -0.18, { seg: 12 });
      // 風爐 clay charcoal stove + kettle
      lathe(g, [[0, 0], [0.07, 0], [0.08, 0.1], [0.075, 0.13], [0.06, 0.13]], surf('terracotta'), 0.27, ty, 0.08, { seg: 12 });
      box(g, 0.05, 0.035, 0.01, surf('soot'), 0.27, ty + 0.03, 0.15);
      sph(g, 0.012, surf('ember'), 0.27, ty + 0.045, 0.145, { seg: 5 });
      lathe(g, [[0, 0], [0.06, 0.005], [0.075, 0.045], [0.06, 0.085], [0.025, 0.1], [0, 0.1]], surf('iron', { tint: '#a08070' }), 0.27, ty + 0.13, 0.08, { seg: 12 });
      tube(g, [[0.32, ty + 0.17, 0.08], [0.36, ty + 0.2, 0.08], [0.38, ty + 0.23, 0.08]], 0.009, surf('iron'), { seg: 4, rseg: 5 });
      tube(g, [[0.21, ty + 0.21, 0.08], [0.27, ty + 0.3, 0.08], [0.33, ty + 0.21, 0.08]], 0.005, surf('rope'), { seg: 8, rseg: 4 });
      dyn.push(smoke([{ x: 0.385, y: ty + 0.24, z: 0.08, n: 7, h: 0.4, size: 0.03, speed: 0.2, col: '#f4f1ea', op: 0.28, spread: 0.02, curl: 0.03 }]));
      dyn.push(flames([{ x: 0.27, y: ty + 0.03, z: 0.15, s: 0.012, h: 2, i: 1.2 }]));
      for (const d of dyn) g.add(d);
      return finish(K, g, dyn, o);
    },
    lights: () => [{ x: 0.27, y: 0.45, z: 0.25, color: '#ff9a50', intensity: 0.3, distance: 1.4, flicker: 0.3 }],
  });

  // ------------------------------------------------------------------ lantern drying rack (2 × 1): bamboo frame, unfinished & finished lanterns that sway, paper strips
  define('lantern_rack', {
    build(o, K) {
      const g = grp(), dyn = [], bam = surf('bamboo');
      const X = 0.9, bars = [1.88, 1.28];
      for (const sx of [-1, 1]) {
        rod(g, 0.03, 1.95, bam, sx * X, 0.975, 0, 'y', { seg: 8 });
        rod(g, 0.022, 0.7, bam, sx * X, 0.04, 0, 'z', { seg: 6 });
        for (const sz of [-1, 1]) tube(g, [[sx * X, 0.04, sz * 0.3], [sx * X, 0.5, sz * 0.05], [sx * X, 0.6, 0]], 0.012, bam, { seg: 4, rseg: 5 });
      }
      for (const y of bars) { rod(g, 0.024, 1.92, bam, 0, y, 0, 'x', { seg: 8 }); for (const sx of [-1, 1]) box(g, 0.07, 0.03, 0.07, surf('rope'), sx * X, y - 0.015, 0); }
      const specs = [
        [-0.62, 0, 'skel'], [-0.22, 0, 'white'], [0.2, 0, 'red'], [0.6, 0, 'fu'],
        [-0.6, 1, 'red'], [-0.2, 1, 'skel'], [0.22, 1, 'gold'], [0.62, 1, 'white'],
      ];
      specs.forEach(([x, row, kind], i) => {
        const top = bars[row] - 0.025, hl = grp(g, x, top, 0, 0, 'sway' + i);
        const hang = 0.12;
        cyl(hl, 0.003, 0.003, hang, surf('rope'), 0, -hang, 0, { seg: 3 });
        const rw = 0.13, rh = 0.13, by = -hang - rh * 2 - 0.02;
        if (kind === 'skel') {
          const pts = []; for (let k = 0; k <= 8; k++) { const a = k / 8 * PI; pts.push([Math.max(0.05, rw * sin(a)), rh * (1 - cos(a))]); }
          lathe(hl, pts, surf('lattice_bamboo', { k: 'cut', fit: true }), 0, by, 0, { seg: 10 });
          cyl(hl, 0.055, 0.06, 0.02, surf('bamboo'), 0, by + rh * 2 - 0.01, 0, { seg: 8 });
          cyl(hl, 0.06, 0.055, 0.02, surf('bamboo'), 0, by - 0.01, 0, { seg: 8 });
        } else {
          const col = { white: '#f6efe0', red: '#d8342a', fu: '#c62f4b', gold: '#f2c14e' }[kind];
          lantern(hl, 0, by, 0, rw, rh, col, { motif: kind === 'white' ? 'lan_plain' : kind === 'fu' ? 'lan_fu' : 'lan_gold', seg: 10 });
        }
        dyn.push(hl);
      });
      // drying paper strips on the lower bar ends
      for (const [x, c] of [[-0.82, '#d8342a'], [0.8, '#f2c14e']]) plane(g, 0.06, 0.4, surf('paper', { k: 'cut', tint: c }), x, bars[1] - 0.22, 0.03);
      return finish(K, g, dyn, o);
    },
    update(node, o, t) {
      const ph = phaseOf(o);
      for (let i = 0; i < 8; i++) {
        const s = node.getObjectByName('sway' + i);
        if (s) { s.rotation.z = 0.05 * sin(t * 1.3 + i * 1.7 + ph); s.rotation.x = 0.035 * sin(t * 0.9 + i * 2.3 + ph); s.rotation.y = 0.2 * sin(t * 0.4 + i); }
      }
    },
  });

  // ------------------------------------------------------------------ pot: big brown-glazed storage jar (甕) with a wooden lid and a gourd dipper
  define('pot', {
    build(o, K) {
      const g = grp();
      lathe(g, [[0, 0], [0.2, 0], [0.24, 0.03], [0.33, 0.2], [0.36, 0.36], [0.32, 0.52], [0.24, 0.62], [0.22, 0.66], [0.25, 0.68], [0.24, 0.7], [0.2, 0.7], [0.19, 0.6]], surf('glaze_brown', { fit: true }), 0, 0, 0, { seg: 22 });
      cyl(g, 0.26, 0.26, 0.03, surf('pine', { tint: '#c09070' }), 0, 0.7, 0, { seg: 18 });
      box(g, 0.24, 0.03, 0.05, surf('pine', { tint: '#9a7050' }), 0, 0.73, 0);
      // gourd dipper (瓢) resting across the lid
      const d = grp(g, 0.04, 0.76, 0.06, 0.6);
      lathe(d, [[0, 0], [0.05, 0.01], [0.07, 0.05], [0.072, 0.055]], surf('pine', { tint: '#e8c890' }), 0.13, 0.02, 0, { seg: 10, rz: 0.3 });
      rod(d, 0.012, 0.36, surf('bamboo'), -0.08, 0.06, 0, 'x', { rz: -0.25 });
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ lantern-maker's props
  region('staves', 256, 128, { rough: 0.8 }, (g, w, h, r) => {
    g.fillStyle = '#8a6a48'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = rgba(r() < 0.6 ? '#5a3e24' : '#b8946a', 0.15 + r() * 0.2); g.fillRect(r() * w, 0, 0.8 + r() * 1.5, h); }
    for (let x = 0; x < w; x += w / 14) { g.fillStyle = 'rgba(40,24,12,0.55)'; g.fillRect(x, 0, 1.4, h); g.fillStyle = 'rgba(255,230,190,0.18)'; g.fillRect(x + 1.6, 0, 1.2, h); }
    g.fillStyle = lgr(g, 0, 0, 0, h, [[0, 'rgba(0,0,0,0.15)'], [0.2, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.25)']]); g.fillRect(0, 0, w, h);
  });
  region('combed', 256, 64, { rough: 0.85 }, (g, w, h, r) => {
    g.fillStyle = '#9a5a30'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 3) { g.fillStyle = rgba('#4a1e0c', 0.5); g.fillRect(x, 0, 1, h); }
    speck(g, w, h, 100, '#c8804a', 0.3, r, 1);
  });

  // a small low work table, top at y = H
  function lowTable(par, W, D, H, s) {
    rbox(par, W, 0.04, D, 0.01, s, 0, H - 0.04, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(par, 0.045, H - 0.04, 0.045, s, sx * (W / 2 - 0.05), 0, sz * (D / 2 - 0.05));
    for (const sz of [-1, 1]) box(par, W - 0.12, 0.03, 0.025, s, 0, 0.1, sz * (D / 2 - 0.05));
    box(par, 0.025, 0.03, D - 0.12, s, 0, 0.1, 0);
  }
  function knife(par, x, y, z, ry) {
    const k = grp(par, x, y, z, ry);
    extrude(k, [[0, 0], [0.11, 0.006], [0.12, 0.022], [0, 0.025]], 0.004, surf('steel'), 0, 0.002, 0, { rx: -PI / 2 });
    box(k, 0.07, 0.016, 0.018, surf('w_dark'), -0.035, 0, -0.012);
  }
  function stripBundle(par, x, y, z, ry, n = 9, len = 0.5) {
    const b = grp(par, x, y, z, ry);
    for (let i = 0; i < n; i++) box(b, len, 0.006, 0.012, surf('bamboo'), (i % 3) * 0.01, (i / 3 | 0) * 0.007, (i % 3) * 0.013 - 0.013);
    for (const sx of [-0.15, 0.15]) box(b, 0.012, 0.026, 0.05, surf('red_band'), sx, -0.001, 0);
  }
  function pasteBowl(par, x, y, z) {
    lathe(par, [[0.05, 0.05], [0.055, 0.045], [0.045, 0.01], [0.03, 0], [0, 0]], surf('porcelain_w', { tint: '#e8e0d0' }), x, y, z, { seg: 12 });
    cyl(par, 0.047, 0.047, 0.004, surf('rice', { tint: '#f8f4e8' }), x, y + 0.035, z, { seg: 12 });
    rod(par, 0.005, 0.14, surf('bamboo'), x + 0.03, y + 0.06, z, 'x', { rz: -0.5 });
  }
  function skeletonLantern(par, x, y, z, rw, rh, pasted) {
    const pts = []; for (let k = 0; k <= 8; k++) { const a = k / 8 * PI; pts.push([Math.max(0.35 * rw, rw * sin(a)), rh * (1 - cos(a))]); }
    lathe(par, pts, surf('lattice_bamboo', { k: 'cut', fit: true }), x, y, z, { seg: 12 });
    if (pasted) {
      const pp = pts.slice(0, Math.round(pts.length * pasted)).map(([a, b]) => [a + 0.002, b]);
      lathe(par, pp, surf('lan_plain', { fit: true, tint: '#fbf3e4' }), x, y, z, { seg: 12, phiLength: TAU });
    }
    cyl(par, rw * 0.37, rw * 0.37, 0.015, surf('bamboo'), x, y + rh * 2 - 0.008, z, { seg: 10 });
  }

  define('lantern_frame', {
    build(o, K) {
      const g = grp(), H = 0.5;
      lowTable(g, 0.86, 0.6, H, surf('pine', { tint: '#c89870' }));
      // ring stand with a half-pasted skeleton
      lathe(g, [[0.09, 0], [0.1, 0.005], [0.1, 0.03], [0.085, 0.03]], surf('w_dark'), -0.06, H, 0.0, { seg: 14 });
      skeletonLantern(g, -0.06, H + 0.03, 0.0, 0.17, 0.17, 0.45);
      stripBundle(g, 0.2, H, 0.15, 0.3, 9, 0.45);
      knife(g, 0.24, H, -0.12, -0.4);
      pasteBowl(g, 0.3, H, 0.05);
      for (let i = 0; i < 3; i++) box(g, 0.2, 0.003, 0.15, surf('paper', { tint: i === 1 ? '#f0d8c8' : '#ffffff' }), -0.25 + i * 0.01, H + i * 0.003, 0.2 - i * 0.01, { ry: 0.2 * i });
      rod(g, 0.022, 0.22, surf('paper_red'), -0.32, H + 0.022, -0.2, 'x', { ry: 0.3 });
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ lantern-maker's workbench (2 × 1)
  define('workbench', {
    build(o, K) {
      const g = grp(), H = 0.82, wood = surf('camphor'), dk = surf('camphor', { tint: '#9a8070' });
      rbox(g, 1.9, 0.07, 0.74, 0.015, wood, 0, H - 0.07, 0);
      // trestle ends
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) box(g, 0.07, H - 0.07, 0.07, wood, sx * 0.8, 0, sz * 0.28);
        box(g, 0.07, 0.06, 0.66, dk, sx * 0.8, 0.12, 0);
        box(g, 0.06, 0.1, 0.62, wood, sx * 0.8, H - 0.17, 0);
      }
      box(g, 1.56, 0.06, 0.05, dk, 0, 0.14, 0);
      // drawer with brass pull
      box(g, 0.6, 0.12, 0.62, dk, 0, H - 0.19, -0.02);
      box(g, 0.56, 0.1, 0.02, wood, 0, H - 0.18, 0.3);
      box(g, 0.08, 0.02, 0.02, surf('brass'), 0, H - 0.135, 0.315);
      const ty = H;
      // paper sheets, a red lantern being pasted, brush pot, paints, paste, strips, knife, thread
      for (let i = 0; i < 4; i++) box(g, 0.32, 0.003, 0.26, surf('paper', { tint: i === 3 ? '#fff8ec' : '#f4ead4' }), -0.42 + i * 0.008, ty + i * 0.003, 0.05 + i * 0.006, { ry: 0.08 * i - 0.1 });
      box(g, 0.24, 0.004, 0.2, surf('paper_red'), -0.05, ty, 0.12, { ry: 0.25 });
      const lh = grp(g, 0.18, ty, -0.05, 0, null);
      lathe(lh, [[0.06, 0], [0.07, 0.005], [0.07, 0.03], [0.055, 0.03]], surf('w_dark'), 0, 0, 0, { seg: 12 });
      lantern(lh, 0, 0.03, 0, 0.14, 0.13, '#d8342a', { motif: 'lan_fu', seg: 12 });
      // brush pot (筆筒) with brushes
      lathe(g, [[0, 0], [0.055, 0], [0.055, 0.14], [0.05, 0.14], [0.05, 0.01], [0, 0.01]], surf('bamboo'), 0.62, ty, -0.22, { seg: 12 });
      for (let i = 0; i < 5; i++) { const a = i * 1.3; cyl(g, 0.006, 0.006, 0.26, surf('bamboo', { tint: i % 2 ? '#d0a070' : '#ffffff' }), 0.62 + cos(a) * 0.02, ty + 0.01, -0.22 + sin(a) * 0.02, { rz: cos(a) * 0.15, rx: sin(a) * 0.15, seg: 5 }); }
      // paint dishes
      [['#c8281e', 0.4], ['#f2c14e', 0.48], ['#2a4a9a', 0.56], ['#f6f4ee', 0.64]].forEach(([c, x]) => {
        lathe(g, [[0, 0], [0.03, 0], [0.04, 0.015], [0.042, 0.018]], surf('porcelain_w'), x, ty, 0.2, { seg: 10 });
        cyl(g, 0.034, 0.034, 0.003, surf('porcelain_w', { tint: c }), x, ty + 0.01, 0.2, { seg: 10 });
      });
      pasteBowl(g, 0.4, ty, -0.04);
      stripBundle(g, -0.55, ty, -0.24, -0.1, 12, 0.6);
      knife(g, -0.12, ty, -0.22, 0.6);
      cyl(g, 0.025, 0.025, 0.04, surf('red_band'), 0.73, ty, 0.1, { seg: 10 });   // spool of thread
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ paper stock on a low pallet
  define('paper_stack', {
    build(o, K) {
      const g = grp(), p = surf('oldwood', { tint: '#c0a080' });
      box(g, 0.86, 0.05, 0.66, p, 0, 0.06, 0);
      for (const sx of [-0.35, 0, 0.35]) box(g, 0.08, 0.06, 0.66, surf('oldwood', { tint: '#8a7060' }), sx, 0, 0);
      const y0 = 0.11;
      const stack = (x, z, w, d, h, s, ry, twine) => {
        box(g, w, h, d, s, x, y0, z, { ry });
        if (twine) for (const t of [-0.25, 0.25]) box(g, w + 0.01, h + 0.004, 0.012, surf('rope'), x + t * w * Math.sin(ry), y0 - 0.002, z + t * d, { ry });
      };
      stack(0.16, -0.06, 0.4, 0.52, 0.52, { r: 'paper_edge', faces: { y: 'paper' } }, 0.04, true);          // cream sheets, tied
      stack(-0.24, 0.1, 0.32, 0.36, 0.22, { r: 'paper_edge', tint: '#f0a090', faces: { y: 'paper_red' } }, -0.08, true);   // red paper
      stack(-0.24, 0.1, 0.24, 0.26, 0.12, { r: 'paper_edge', tint: '#f8d870', faces: { y: { r: 'paper_gold' } } }, 0.15, false);
      const y1 = y0 + 0.22;
      g.children[g.children.length - 1].position.y = y1;
      for (let i = 0; i < 3; i++) rod(g, 0.035, 0.42, surf('paper', { tint: ['#f6b4c4', '#fff4e0', '#f6b4c4'][i] }), 0.16, y0 + 0.55 + i * 0.065, -0.12 + i * 0.07, 'x', { ry: 0.08, seg: 10 });
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ jar_row (o.w wide, o.v arrangement): 紹興 wine jars with clay caps & 酒 labels, glazed small jars
  function wineJar(par, x, z, s, kind, r) {
    const j = grp(par, x, 0, z, kind === 'wine' ? (r() - 0.5) * 0.7 : r() * TAU);   // keep the 酒 label facing out
    const gl = { wine: 'glaze_brown', amber: 'glaze_amber', green: 'glaze_green', black: 'glaze_black' }[kind];
    if (kind === 'wine' || kind === 'amber') {
      lathe(j, [[0, 0], [0.13, 0], [0.17, 0.05], [0.21, 0.2], [0.2, 0.34], [0.14, 0.44], [0.1, 0.47], [0.1, 0.49]].map(([a, b]) => [a * s, b * s]), surf(gl, { fit: true }), 0, 0, 0, { seg: 16 });
      // mud seal capped with red cloth & cord
      lathe(j, [[0.12, 0], [0.13, 0.03], [0.1, 0.09], [0, 0.11]].map(([a, b]) => [a * s, b * s]), surf('clothR', { tint: '#e8a090' }), 0, 0.47 * s, 0, { seg: 12 });
      cyl(j, 0.125 * s, 0.125 * s, 0.015, surf('rope'), 0, 0.49 * s, 0, { seg: 12 });
      if (kind === 'wine') plane(j, 0.15 * s, 0.15 * s, surf('fu_diamond', { k: 'cut', fit: true }), 0, 0.27 * s, 0.205 * s, { rx: -0.08 });
    } else {
      lathe(j, [[0, 0], [0.07, 0], [0.11, 0.08], [0.12, 0.16], [0.08, 0.26], [0.045, 0.29], [0.05, 0.31], [0.04, 0.32]].map(([a, b]) => [a * s, b * s]), surf(gl, { fit: true }), 0, 0, 0, { seg: 14 });
      lathe(j, [[0.055, 0], [0.05, 0.03], [0, 0.045]].map(([a, b]) => [a * s, b * s]), surf(gl), 0, 0.31 * s, 0, { seg: 10 });
    }
  }
  define('jar_row', {
    variants: 8,
    key: (o) => Math.max(1, o.w | 0 || 2) + '_' + ((o.v | 0) % 8),
    build(o, K) {
      const w = Math.max(1, o.w | 0 || 2), r = rng(300 + (o.v | 0) * 13 + w), g = grp();
      for (let i = 0; i < w; i++) {
        const cx = -w / 2 + i + 0.5;
        wineJar(g, cx - 0.18, -0.06 + (r() - 0.5) * 0.08, 1.2 + r() * 0.18, r() < 0.6 ? 'wine' : 'amber', r);
        wineJar(g, cx + 0.26, 0.14 + (r() - 0.5) * 0.08, 1.1 + r() * 0.35, r() < 0.5 ? 'green' : 'black', r);
      }
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ 堂鼓 temple drum in a red lacquer stand (heads face north/south)
  define('drum', {
    build(o, K) {
      const g = grp(), lac = surf('lac'), cy = 0.98, R = 0.34, Dp = 0.34;
      box(g, 0.9, 0.08, 0.5, surf('lacD'), 0, 0, 0);
      for (const sx of [-1, 1]) {
        box(g, 0.075, 1.7, 0.075, lac, sx * 0.42, 0.08, 0);
        for (const sz of [-1, 1]) tube(g, [[sx * 0.42, 0.08, sz * 0.22], [sx * 0.42, 0.35, sz * 0.03]], 0.02, lac, { seg: 3, rseg: 5 });
        sph(g, 0.04, surf('gold'), sx * 0.42, 1.8, 0, { seg: 8 });
        box(g, 0.16, 0.045, 0.06, lac, sx * (R + 0.04), cy - 0.02, 0);         // drum brackets
      }
      // top beam with upturned ends
      extrude(g, [[-0.6, 0], [0.6, 0], [0.62, 0.1], [0.5, 0.06], [-0.5, 0.06], [-0.62, 0.1]], 0.07, lac, 0, 1.7, 0);
      plane(g, 0.7, 0.1, surf('carve_gold', { fit: true }), 0, 1.6, 0.04);
      plane(g, 0.7, 0.1, surf('carve_gold', { fit: true }), 0, 1.6, -0.04, { ry: PI });
      box(g, 0.84, 0.03, 0.06, lac, 0, 1.54, 0);
      // barrel: bulging red lacquer shell with brass nail rows; taiji heads both sides
      const shell = []; for (let k = 0; k <= 8; k++) { const t = k / 8; shell.push([R * (0.92 + 0.08 * sin(t * PI)), t * Dp]); }
      lathe(g, shell, lac, 0, cy, -Dp / 2, { seg: 22, rx: PI / 2 });
      g.children[g.children.length - 1].position.set(0, cy, -Dp / 2);
      for (const sz of [-1, 1]) {
        cyl(g, R * 0.93, R * 0.93, 0.004, surf('drumhead', { fit: false, faces: { z: { r: 'drumhead' } } }), 0, cy, sz * (Dp / 2 + 0.002), { seg: 24, rx: PI / 2 });
        g.children[g.children.length - 1].position.set(0, cy, sz * (Dp / 2) - 0.002);
        for (let k = 0; k < 18; k++) { const a = k / 18 * TAU; sph(g, 0.012, surf('brass'), cos(a) * R * 0.95, cy + sin(a) * R * 0.95, sz * (Dp / 2 - 0.03), { seg: 4 }); }
      }
      // drumsticks resting on the base
      for (const k of [-1, 1]) rod(g, 0.012, 0.36, surf('w_dark'), k * 0.06, 0.1, 0.12, 'x', { ry: 0.3 * k });
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ bronze temple bell (梵鐘) in a timber frame with a hanging striker log
  define('bell', {
    build(o, K) {
      const g = grp(), dyn = [], wood = surf('rose', { tint: '#e0a090' });
      box(g, 0.94, 0.12, 0.6, surf('granite'), 0, 0, 0);
      for (const sx of [-1, 1]) {
        box(g, 0.1, 2.0, 0.1, wood, sx * 0.4, 0.12, 0);
        for (const sz of [-1, 1]) tube(g, [[sx * 0.4, 0.12, sz * 0.25], [sx * 0.4, 0.55, sz * 0.04]], 0.025, wood, { seg: 3, rseg: 5 });
      }
      extrude(g, [[-0.62, 0], [0.62, 0], [0.66, 0.14], [0.52, 0.09], [-0.52, 0.09], [-0.66, 0.14]], 0.12, wood, 0, 2.06, 0);
      box(g, 0.84, 0.08, 0.08, wood, 0, 1.94, 0);
      // bell body: straight-walled with a rounded crown, raised bands, nipples (乳釘)
      const by = 1.02, bh = 0.78;
      lathe(g, [[0.25, 0.05], [0.27, 0.0], [0.31, 0], [0.3, 0.06], [0.28, 0.25], [0.27, bh - 0.2], [0.25, bh - 0.06], [0.18, bh], [0, bh + 0.02]], surf('bronze', { fit: true }), 0, by, 0, { seg: 24 });
      for (const yy of [0.22, 0.45]) lathe(g, [[0.282, 0], [0.292, 0.005], [0.292, 0.018], [0.282, 0.022]], surf('bronze'), 0, by + yy, 0, { seg: 24 });
      for (let q = 0; q < 4; q++) for (let k = 0; k < 6; k++) {
        const a = q * PI / 2 + PI / 4 + ((k % 3) - 1) * 0.18, yy = by + 0.52 + (k / 3 | 0) * 0.08;
        sph(g, 0.016, surf('bronze'), cos(a) * 0.28, yy, sin(a) * 0.28, { seg: 5 });
      }
      // 蒲牢 hanging loop
      tube(g, [[-0.07, by + bh, 0], [-0.08, by + bh + 0.1, 0], [0, by + bh + 0.16, 0], [0.08, by + bh + 0.1, 0], [0.07, by + bh, 0]], 0.022, surf('bronze'), { seg: 10, rseg: 6 });
      cyl(g, 0.012, 0.012, 0.12, surf('iron'), 0, by + bh + 0.14, 0, { seg: 5 });
      // striker log hung from two ropes, swinging gently (separate)
      for (const sx of [-0.2, 0.2]) box(g, 0.05, 0.05, 0.36, wood, sx, 1.95, 0.2);   // brackets carrying the striker
      const st = grp(g, 0, 1.95, 0.36, 0, 'striker');
      for (const sx of [-0.2, 0.2]) cyl(st, 0.006, 0.006, 0.98, surf('rope'), sx, -0.98, 0, { seg: 4 });
      rod(st, 0.06, 0.62, surf('pine', { tint: '#c09870' }), 0, -1.0, 0, 'x', { seg: 10 });
      dyn.push(st);
      return finish(K, g, dyn, o);
    },
    update(node, o, t) { const s = node.getObjectByName('striker'); if (s) s.rotation.x = 0.03 * sin(t * 1.1 + phaseOf(o)); },
  });

  // ------------------------------------------------------------------ weapon rack (2 × 1): spears with red tassels, a 關刀, a sheathed sword
  function polearm(par, x, z, len, head, r) {
    const p = grp(par, x, 0.06, z, r() * 0.4 - 0.2);
    cyl(p, 0.015, 0.018, len, surf('w_dark', { tint: '#c09070' }), 0, 0, 0, { seg: 6 });
    box(p, 0.035, 0.03, 0.035, surf('brass'), 0, len - 0.02, 0);
    if (head === 'spear') {
      extrude(p, [[0, 0], [0.025, 0.06], [0.012, 0.22], [0, 0.26], [-0.012, 0.22], [-0.025, 0.06]], 0.008, surf('steel'), 0, len + 0.01, 0);
      for (const a of [0, PI / 2]) plane(p, 0.09, 0.14, surf('tassel', { k: 'cut', fit: true }), 0, len - 0.06, 0, { ry: a, cast: false });
    } else {
      // 關刀 crescent blade with a notch and a red tassel
      extrude(p, [[-0.01, 0], [0.04, 0], [0.12, 0.18], [0.13, 0.34], [0.06, 0.46], [0.08, 0.32], [0.03, 0.12], [-0.01, 0.08]], 0.01, surf('steel'), 0, len, 0);
      box(p, 0.06, 0.04, 0.03, surf('gold'), 0, len - 0.02, 0);
      for (const a of [0, PI / 2]) plane(p, 0.1, 0.16, surf('tassel', { k: 'cut', fit: true }), 0, len - 0.1, 0, { ry: a, cast: false });
    }
    return p;
  }
  define('weapon_rack', {
    build(o, K) {
      const g = grp(), lac = surf('lac', { tint: '#e0a0a0' }), dk = surf('lacD');
      box(g, 1.9, 0.08, 0.36, dk, 0, 0, 0);
      for (const sx of [-1, 1]) { box(g, 0.08, 1.72, 0.08, lac, sx * 0.9, 0.08, 0); box(g, 0.1, 0.06, 0.34, dk, sx * 0.9, 0.08, 0); sph(g, 0.045, surf('gold'), sx * 0.9, 1.84, 0, { seg: 8 }); }
      rbox(g, 1.96, 0.07, 0.1, 0.02, lac, 0, 1.76, 0);
      box(g, 1.76, 0.05, 0.12, lac, 0, 1.0, 0);
      plane(g, 1.6, 0.12, surf('carve_gold', { fit: true }), 0, 1.62, 0.05);
      plane(g, 1.6, 0.12, surf('carve_gold', { fit: true }), 0, 1.62, -0.05, { ry: PI });
      const r = rng(5);
      [[-0.66, 'spear', 1.95], [-0.33, 'blade', 1.62], [0, 'spear', 2.0], [0.33, 'spear', 1.9]].forEach(([x, h, l]) => polearm(g, x, 0, l, h, r));
      // sheathed sword leaning in the last slot
      const sw = grp(g, 0.68, 0.08, 0.02, 0);
      box(sw, 0.05, 0.86, 0.03, surf('lacB'), 0, 0, 0, { rz: -0.04 });
      box(sw, 0.13, 0.03, 0.04, surf('brass'), 0.035, 0.86, 0);
      cyl(sw, 0.016, 0.016, 0.2, surf('cloth_red', { tint: '#802020' }), 0.04, 0.89, 0, { seg: 6 });
      plane(sw, 0.06, 0.16, surf('tassel', { k: 'cut', fit: true }), 0.06, 0.9, 0.03, { cast: false });
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ 照魂鏡 brass soul-mirror on a carved stand (faint spirit glow)
  define('mirror_stand', {
    build(o, K) {
      const g = grp(), wood = surf('rose', { tint: '#d09080' });
      extrude(g, [[-0.42, 0], [0.42, 0], [0.44, 0.04], [0.38, 0.1], [-0.38, 0.1], [-0.44, 0.04]], 0.42, wood, 0, 0, 0, { curve: 4 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) sph(g, 0.06, wood, sx * 0.34, 0.03, sz * 0.15, { seg: 8, s: [1, 0.6, 1] });   // cloud feet
      box(g, 0.66, 0.05, 0.28, wood, 0, 0.1, 0);
      for (const sx of [-1, 1]) { box(g, 0.06, 1.6, 0.06, wood, sx * 0.34, 0.15, 0); sph(g, 0.045, surf('gold'), sx * 0.34, 1.8, 0, { seg: 8 }); for (const sz of [-1, 1]) tube(g, [[sx * 0.34, 0.15, sz * 0.13], [sx * 0.34, 0.45, sz * 0.03]], 0.018, wood, { seg: 3, rseg: 5 }); }
      box(g, 0.64, 0.04, 0.06, wood, 0, 0.7, 0);
      // lotus support
      lathe(g, [[0.03, 0], [0.12, 0.05], [0.17, 0.12], [0.12, 0.11], [0.06, 0.06]], surf('gold'), 0, 0.74, 0, { seg: 12 });
      // mirror: brass rim with eight bosses, polished face (faint emissive), crest with a jade bead
      const cy = 1.2, R = 0.3;
      cyl(g, R + 0.04, R + 0.04, 0.05, surf('brass'), 0, cy, 0, { seg: 28, rx: PI / 2 });
      g.children[g.children.length - 1].position.set(0, cy, -0.025);
      cyl(g, R, R, 0.004, surf('mirror', { k: 'lit', tint: '#2e4e58', aoMin: 1 }), 0, cy, 0, { seg: 28, rx: PI / 2 });
      g.children[g.children.length - 1].position.set(0, cy, 0.026);
      cyl(g, R, R, 0.004, surf('brass', { tint: '#a08060' }), 0, cy, 0, { seg: 28, rx: PI / 2 });
      g.children[g.children.length - 1].position.set(0, cy, -0.03);
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; sph(g, 0.03, surf('gold'), cos(a) * (R + 0.02), cy + sin(a) * (R + 0.02), 0.02, { seg: 6 }); }
      extrude(g, [[-0.14, 0], [0.14, 0], [0.1, 0.1], [0, 0.16], [-0.1, 0.1]], 0.04, surf('gold'), 0, cy + R + 0.02, 0, { curve: 4 });
      sph(g, 0.03, surf('glaze_green', { k: 'lit', tint: '#60c8c0' }), 0, cy + R + 0.1, 0.03, { seg: 8 });
      return finish(K, g, [], o);
    },
    lights: () => [{ x: 0, y: 1.2, z: 0.3, color: '#9fe6ff', intensity: 0.6, distance: 3, flicker: 0.12 }],
  });

  // ------------------------------------------------------------------ bronze tripod 鼎 cauldron with a bubbling green brew
  define('cauldron', {
    build(o, K) {
      const g = grp(), dyn = [];
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * TAU + PI / 2, lx = cos(a) * 0.22, lz = sin(a) * 0.22;
        lathe(g, [[0.035, 0], [0.05, 0.02], [0.035, 0.08], [0.04, 0.26]], surf('bronze'), lx, 0, lz, { seg: 8 });
      }
      lathe(g, [[0, 0.2], [0.15, 0.21], [0.27, 0.27], [0.33, 0.38], [0.34, 0.5], [0.36, 0.54], [0.34, 0.56], [0.3, 0.55]], surf('bronze', { fit: true }), 0, 0, 0, { seg: 22 });
      for (const sx of [-1, 1]) extrude(g, [[-0.06, 0], [0.06, 0], [0.06, 0.15], [0.03, 0.15], [0.03, 0.04], [-0.03, 0.04], [-0.03, 0.15], [-0.06, 0.15]], 0.03, surf('bronze'), sx * 0.31, 0.54, 0, { ry: PI / 2 });
      cyl(g, 0.31, 0.31, 0.01, surf('brew', { k: 'lit', tint: '#2a4220', aoMin: 1 }), 0, 0.5, 0, { seg: 22 });
      // bubbles: little domes that swell and pop
      const bub = grp(g, 0, 0.51, 0, 0, 'bubbles');
      for (let k = 0; k < 4; k++) { const a = k * 2.4, d = 0.07 + (k % 3) * 0.07; sph(bub, 0.03, surf('brew', { k: 'lit', tint: '#4a7040', aoMin: 1 }), cos(a) * d, 0, sin(a) * d, { seg: 6, hseg: 3 }); }
      dyn.push(bub);
      bub.userData.keep = true;
      dyn.push(smoke([{ x: -0.06, y: 0.52, z: 0, n: 9, h: 0.9, size: 0.1, speed: 0.22, col: '#e0ecd4', op: 0.25, spread: 0.08 }, { x: 0.1, y: 0.52, z: 0.05, n: 7, h: 0.7, size: 0.08, speed: 0.18, col: '#d0e8c0', op: 0.2, spread: 0.06, seed: 0.5 }]));
      for (const d of dyn) g.add(d);
      return finish(K, g, dyn, o);
    },
    update(node, o, t) {
      const b = node.getObjectByName('bubbles');
      if (b) b.children.forEach((m, k) => { const life = (t * 0.8 + k * 0.37 + phaseOf(o)) % 1; const s = life < 0.9 ? 0.2 + life : 0.01; m.scale.set(s, s * 0.8, s); });
    },
    lights: () => [{ x: 0, y: 0.95, z: 0, color: '#9ad86a', intensity: 0.22, distance: 1.8, flicker: 0.15 }],
  });

  // ------------------------------------------------------------------ herbs_rack: 中藥櫃 labelled drawers below, drying sieves and hanging bundles above
  define('herbs_rack', {
    build(o, K) {
      const g = grp(), wood = surf('teak'), W = 0.86, D = 0.42;
      box(g, W, 0.86, D, wood, 0, 0.06, 0);
      plane(g, W - 0.06, 0.78, surf('herb_drawers', { fit: true }), 0, 0.06 + 0.43, D / 2 + 0.003);
      box(g, W + 0.04, 0.06, D + 0.04, wood, 0, 0, 0);
      rbox(g, W + 0.04, 0.04, D + 0.04, 0.01, wood, 0, 0.92, 0);
      // upper open rack
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.04, 0.98, 0.04, surf('bamboo'), sx * (W / 2 - 0.03), 0.96, sz * (D / 2 - 0.03));
      const shelves = [1.24, 1.56];
      for (const y of shelves) for (const sz of [-1, 1]) rod(g, 0.015, W, surf('bamboo'), 0, y, sz * (D / 2 - 0.03), 'x');
      rbox(g, W + 0.06, 0.04, D + 0.06, 0.012, wood, 0, 1.92, 0);
      const herbs = ['herb_g', 'herb_r', 'herb_y'];
      [0.96, ...shelves].forEach((y, i) => {
        lathe(g, [[0, 0.01], [0.3, 0.01], [0.33, 0.035], [0.34, 0.06], [0.32, 0.06], [0.3, 0.03]], surf('straw', { tint: '#e8d0a0' }), 0, y + 0.015, 0, { seg: 20, s: [1, 1, 0.55] });
        cyl(g, 0.29, 0.3, 0.025, surf(herbs[i]), 0, y + 0.02, 0, { seg: 18, s: [1, 1, 0.55] });
      });
      for (const [x, c] of [[-0.25, '#6a7a3a'], [0, '#8a6a3a'], [0.25, '#5a6a44']]) {
        cyl(g, 0.003, 0.003, 0.08, surf('rope'), x, 1.84, 0.12, { seg: 3 });
        lathe(g, [[0.01, 0], [0.06, 0.04], [0.05, 0.16], [0.025, 0.2]], surf('herb_g', { tint: c === '#8a6a3a' ? '#d0a070' : '#ffffff' }), x, 1.64, 0.12, { seg: 7 });
        cyl(g, 0.028, 0.028, 0.02, surf('red_band'), x, 1.82, 0.12, { seg: 7 });
      }
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ small household props
  define('bucket', {
    build(o, K) {
      const g = grp();
      lathe(g, [[0, 0.02], [0.2, 0.02], [0.2, 0], [0.22, 0], [0.25, 0.42], [0.23, 0.42], [0.2, 0.06], [0, 0.06]], surf('staves', { fit: true }), 0, 0, 0, { seg: 18 });
      for (const y of [0.08, 0.34]) cyl(g, 0.226 + y * 0.075, 0.222 + y * 0.075, 0.03, surf('bamboo', { tint: '#c0a070' }), 0, y, 0, { seg: 18, open: true });
      cyl(g, 0.235, 0.235, 0.004, surf('water', { aoMin: 1 }), 0, 0.33, 0, { seg: 18 });
      for (const sx of [-1, 1]) box(g, 0.04, 0.12, 0.05, surf('staves'), sx * 0.24, 0.36, 0);
      tube(g, [[-0.24, 0.45, 0], [-0.18, 0.62, 0], [0, 0.7, 0], [0.18, 0.62, 0], [0.24, 0.45, 0]], 0.012, surf('rope'), { seg: 12, rseg: 5 });
      return finish(K, g, [], o);
    },
  });
  define('broom', {
    build(o, K) {
      const g = grp();
      // broom leaning against the wall to the north
      const b = grp(g, -0.18, 0, 0.05);
      const top = [0.16, 1.45, -0.5], bot = [0, 0.32, 0];
      const dx = top[0] - bot[0], dy = top[1] - bot[1], dz = top[2] - bot[2], L = Math.hypot(dx, dy, dz);
      const shaft = grp(b, bot[0], bot[1], bot[2]);
      shaft.lookAt(new (T3().Vector3)(dx, dy, dz).add(new (T3().Vector3)(-0.18, 0, 0.05)));
      rod(shaft, 0.016, L, surf('bamboo'), 0, 0, L / 2, 'z');
      // straw head: a flattened fan bound with red cord
      const hd = grp(shaft, 0, 0, 0);
      extrude(hd, [[-0.04, 0], [0.04, 0], [0.16, -0.36], [-0.16, -0.36]], 0.035, surf('straw', { g: 'y' }), 0, 0, 0, { rx: -PI / 2 });
      hd.children[0].rotation.set(PI / 2, 0, 0); hd.children[0].position.z = 0.02;
      for (const zz of [0.02, 0.09]) box(hd, 0.1 + zz * 0.6, 0.045, 0.02, surf('red_band'), 0, -0.022, -zz);
      // 畚箕 bamboo dustpan
      const dp = grp(g, 0.24, 0, 0.1, -0.5);
      box(dp, 0.38, 0.015, 0.34, surf('rattan'), 0, 0, 0);
      box(dp, 0.38, 0.14, 0.015, surf('rattan'), 0, 0, -0.17);
      for (const sx of [-1, 1]) extrude(dp, [[0.17, 0], [-0.17, 0], [-0.17, 0.14], [0.17, 0.02]], 0.015, surf('rattan'), sx * 0.19, 0, 0, { ry: PI / 2 });
      rod(dp, 0.012, 0.4, surf('bamboo'), 0, 0.14, -0.17, 'x');
      return finish(K, g, [], o);
    },
  });
  define('plant_pot', {
    variants: 3,
    key: (o) => String((o.v | 0) % 3),
    build(o, K) {
      const v = (o.v | 0) % 3, g = grp();
      lathe(g, [[0, 0], [0.13, 0], [0.14, 0.02], [0.17, 0.2], [0.2, 0.3], [0.21, 0.32], [0.19, 0.32], [0.17, 0.26]], surf('porcelain', { fit: true }), 0, 0, 0, { seg: 18 });
      cyl(g, 0.18, 0.18, 0.01, surf('soil'), 0, 0.27, 0, { seg: 16 });
      const cut = (rk, w, h, y, n, tilt, o2 = {}) => { for (let i = 0; i < n; i++) plane(g, w, h, surf(rk, { k: 'cut', fit: true, aoMin: 0.8 }), o2.x || 0, y + h / 2, o2.z || 0, { ry: i * PI / n + (o2.ry || 0), rx: tilt, cast: true }); };
      if (v === 0) { cut('leaves_sword', 0.62, 0.6, 0.27, 3, 0); cut('leaves_sword', 0.5, 0.42, 0.27, 2, 0.2, { ry: 0.4 }); }
      else if (v === 1) {
        cut('leaves_sword', 0.5, 0.22, 0.26, 2, 0.5);
        for (const [sx, h] of [[-1, 0.62], [1, 0.55]]) {
          const pts = [[0, 0.27, 0], [sx * 0.02, 0.27 + h * 0.6, 0.02], [sx * 0.1, 0.27 + h, 0.03], [sx * 0.22, 0.27 + h * 0.88, 0.04]];
          tube(g, pts, 0.005, surf('leaf'), { seg: 8, rseg: 4 });
          for (let k = 0; k < 4; k++) { const t = 0.55 + k * 0.15; const x = sx * (0.02 + t * t * 0.2), y = 0.27 + h * (0.6 + 0.4 * sin(t * 2.6)); for (const a of [0, PI / 2]) plane(g, 0.09, 0.09, surf('orchid', { k: 'cut', fit: true }), x, y - 0.045, 0.04, { ry: a + 0.4, rx: -0.3 }); }
        }
      } else {
        for (let i = 0; i < 6; i++) { const a = i * 1.05, d = 0.05; const h = 0.55 + (i % 3) * 0.16; rod(g, 0.014, h, surf('bamboo', { tint: '#70c060' }), cos(a) * d, 0.27 + h / 2, sin(a) * d, 'y'); for (const r2 of [0, 1.2]) plane(g, 0.18, 0.18, surf('bamboo_leaf', { k: 'cut', fit: true }), cos(a) * d, 0.27 + h - 0.04, sin(a) * d, { ry: a + r2 }); }
        cyl(g, 0.075, 0.075, 0.03, surf('red_band'), 0, 0.42, 0, { seg: 10 });
      }
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ temple divination: red altar table with 筊杯 pair / 籤筒
  function redTable(g) {
    const lac = surf('lac');
    rbox(g, 0.74, 0.05, 0.56, 0.012, lac, 0, 0.72, 0);
    aprons(g, 0.74, 0.56, 0.72, 0.08, 0.04, lac, 0.04, 0.02);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) hoofLeg(g, sx * 0.31, sz * 0.22, 0.72, 0.055, lac, sx, sz);
    plane(g, 0.62, 0.07, surf('carve_gold', { fit: true }), 0, 0.68, 0.262);
    // gilt inlay line around the top
    for (const sz of [-1, 1]) box(g, 0.64, 0.004, 0.012, surf('gold'), 0, 0.77, sz * 0.23);
    for (const sx of [-1, 1]) box(g, 0.012, 0.004, 0.47, surf('gold'), sx * 0.32, 0.77, 0);
    return 0.77;
  }
  function jiao(par, x, y, z, ry, flatUp) {
    const THREE = T3();
    const geo = new THREE.SphereGeometry(0.075, 12, 6, 0, TAU, 0, PI / 2);
    geo.scale(1.6, flatUp ? -0.55 : 0.55, 0.75);
    const m = mk(par, geo, surf('lac', { tint: '#f0a090' }), x, y + (flatUp ? 0.041 : 0), z, { ry });
    const cap = new THREE.CircleGeometry(0.075, 12); cap.rotateX(flatUp ? -PI / 2 : PI / 2); cap.scale(1.6, 1, 0.75);
    mk(par, cap, surf('lac', { tint: '#d8b090' }), x, y + (flatUp ? 0.041 : 0.001), z, { ry });
    return m;
  }
  define('divination_blocks', {
    build(o, K) {
      const g = grp(), ty = redTable(g);
      box(g, 0.5, 0.008, 0.3, surf('cloth_red', { tint: '#ffd070' }), 0, ty, 0.02);
      box(g, 0.44, 0.01, 0.24, surf('clothR'), 0, ty + 0.004, 0.02);
      jiao(g, -0.08, ty + 0.012, 0.02, 0.4, false);      // round side up
      jiao(g, 0.1, ty + 0.012, 0.05, -0.3, true);        // flat side up → 聖筊
      box(g, 0.06, 0.006, 0.06, surf('paper_gold'), 0.2, ty + 0.012, -0.08, { ry: 0.3 });
      return finish(K, g, [], o);
    },
  });
  define('fortune_sticks', {
    build(o, K) {
      const g = grp(), ty = redTable(g), r = rng(17);
      lathe(g, [[0, 0], [0.09, 0], [0.095, 0.02], [0.09, 0.26], [0.1, 0.28], [0.085, 0.28], [0.08, 0.03], [0, 0.03]], surf('qiantong', { fit: true }), 0, ty, -0.02, { seg: 18 });
      for (let i = 0; i < 26; i++) {
        const a = r() * TAU, d = r() * 0.05, l = 0.42 + r() * 0.06;
        const s = grp(g, cos(a) * d, ty + 0.03, -0.02 + sin(a) * d, r() * TAU);
        box(s, 0.012, l, 0.004, surf('stick', { g: 'y' }), 0, 0, 0, { rz: (r() - 0.5) * 0.18 + cos(a) * d * 2 });
      }
      for (const [x, z, ry] of [[-0.2, 0.12, 0.3], [0.18, 0.1, -0.2]]) box(g, 0.42, 0.004, 0.012, surf('stick'), x, ty, z, { ry });
      box(g, 0.12, 0.003, 0.08, surf('paper', { tint: '#f8e0a0' }), 0.24, ty, -0.12, { ry: 0.2 });
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ mill_stone: v0 Hakka 擂茶 grinding bowl & pestle (as the 2D art), v1 a 石磨 hand quern
  define('mill_stone', {
    variants: 2,
    key: (o) => String((o.v | 0) % 2),
    build(o, K) {
      const g = grp();
      if ((o.v | 0) % 2 === 0) {
        lathe(g, [[0.16, 0], [0.18, 0.02], [0.17, 0.06], [0.16, 0.08]], surf('straw'), 0, 0, 0, { seg: 16 });
        lathe(g, [[0, 0.06], [0.13, 0.06], [0.24, 0.16], [0.33, 0.38], [0.35, 0.42], [0.34, 0.43]], surf('terracotta'), 0, 0, 0, { seg: 22 });
        lathe(g, [[0.32, 0.42], [0.23, 0.2], [0.12, 0.11], [0, 0.1]], surf('combed', { fit: true }), 0, 0, 0, { seg: 22 });
        cyl(g, 0.11, 0.15, 0.03, surf('herb_g', { tint: '#c8d890' }), 0, 0.12, 0, { seg: 14 });
        // guava-wood pestle leaning out of the bowl
        const p = grp(g, 0.02, 0.14, 0.02);
        cyl(p, 0.025, 0.035, 1.0, surf('pine', { tint: '#d0a878' }), 0, 0, 0, { rz: 0.38, rx: 0.15, seg: 8 });
      } else {
        // 石磨: two granite stones, spout on the lower, feed hole + wooden handle on the upper, on a wooden basin frame
        box(g, 0.8, 0.3, 0.8, surf('w_dark', { tint: '#c09070' }), 0, 0, 0);
        lathe(g, [[0, 0.3], [0.36, 0.3], [0.36, 0.36], [0.33, 0.37], [0.3, 0.36], [0, 0.36]], surf('granite'), 0, 0, 0, { seg: 20 });
        box(g, 0.12, 0.04, 0.12, surf('granite'), 0, 0.31, 0.38);
        cyl(g, 0.28, 0.28, 0.14, surf('granite'), 0, 0.37, 0, { seg: 20 });
        cyl(g, 0.27, 0.27, 0.14, surf('granite'), 0, 0.51, 0, { seg: 20 });
        cyl(g, 0.045, 0.045, 0.005, surf('soot'), 0.08, 0.651, 0, { seg: 8 });
        rod(g, 0.02, 0.3, surf('pine'), 0.38, 0.58, 0, 'x');
        rod(g, 0.022, 0.18, surf('pine'), 0.52, 0.66, 0, 'y');
      }
      return finish(K, g, [], o);
    },
  });

  // ------------------------------------------------------------------ small upright loom with a half-woven Atayal-style band
  define('loom_small', {
    build(o, K) {
      const g = grp(), wood = surf('oldwood', { tint: '#c8a070' });
      box(g, 0.86, 0.07, 0.4, wood, 0, 0, 0);
      for (const sx of [-1, 1]) { box(g, 0.06, 1.55, 0.06, wood, sx * 0.38, 0.07, 0); for (const sz of [-1, 1]) tube(g, [[sx * 0.38, 0.07, sz * 0.18], [sx * 0.38, 0.4, sz * 0.03]], 0.018, wood, { seg: 3, rseg: 5 }); }
      rod(g, 0.035, 0.84, wood, 0, 1.58, 0, 'x', { seg: 10 });     // warp beam
      rod(g, 0.04, 0.84, wood, 0, 0.36, 0.02, 'x', { seg: 10 });   // cloth beam
      // woven cloth (lower), warp threads (upper), heddle bar, beater
      plane(g, 0.66, 0.5, surf('loom_cloth', { fit: true, ao: 1 }), 0, 0.64, 0.035);
      plane(g, 0.66, 0.5, surf('loom_cloth', { fit: true, ao: 1, tint: '#d0c8b8' }), 0, 0.64, 0.033, { ry: PI });
      plane(g, 0.66, 0.66, surf('thread', { k: 'cut', fit: true, aoMin: 1 }), 0, 1.22, 0.02);
      rod(g, 0.012, 0.74, surf('bamboo'), 0, 1.05, 0.03, 'x');
      rod(g, 0.012, 0.74, surf('bamboo'), 0, 1.0, 0.0, 'x');
      box(g, 0.74, 0.05, 0.03, surf('pine'), 0, 0.9, 0.06);
      // shuttle on the base
      extrude(g, [[-0.16, 0], [-0.1, 0.02], [0.1, 0.02], [0.16, 0], [0.1, -0.02], [-0.1, -0.02]], 0.03, surf('pine', { tint: '#e0b080' }), 0.1, 0.085, 0.1, { rx: -PI / 2 });
      cyl(g, 0.03, 0.03, 0.06, surf('red_band'), -0.2, 0.07, 0.1, { seg: 8 });
      return finish(K, g, [], o);
    },
  });
})();
