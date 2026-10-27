// 彼岸燈 — design pass v2 — 沈星河 drawing kit (Canvas 2D, procedural, no images)
// Shared helpers only: colour maths, smooth Bezier outlines, cel shading with rim light, ribbons,
// hands / feet / face builders. Every option in xinghe_designs.js composes its own figure from these.
'use strict';
(function (global) {
  const XL = {};
  global.XL = XL;

  // ------------------------------------------------------------------ colour
  function h2r(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function r2h(r, g, b) {
    return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  function r2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hsl2r(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  function hueToward(h, target, amt) {
    let d = ((target - h + 540) % 360) - 180;
    return h + d * amt;
  }
  XL.mix = (a, b, t) => { const A = h2r(a), B = h2r(b); return r2h(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
  XL.rgba = (hex, a) => { const c = h2r(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  XL.hsl = (hex) => r2hsl(...h2r(hex));
  // cel shadow: darker, a touch more saturated, hue pulled toward violet-blue (warm colours toward red)
  XL.shadow = (hex, amt = 0.26, hueTo) => {
    let [h, s, l] = r2hsl(...h2r(hex));
    const warm = h < 60 || h > 330;
    const tgt = hueTo !== undefined ? hueTo : (warm ? 350 : 245);
    h = hueToward(h, tgt, s < 0.08 ? 0 : 0.18 * amt / 0.26);
    l = l * (1 - amt);
    s = Math.min(1, s * 1.06 + 0.05 * amt);
    return r2h(...hsl2r(h, s, l));
  };
  XL.light = (hex, amt = 0.15) => {
    let [h, s, l] = r2hsl(...h2r(hex));
    l = l + (1 - l) * amt; h = hueToward(h, 55, 0.08 * amt / 0.15);
    return r2h(...hsl2r(h, s, l));
  };
  XL.ink = (hex, k = 0.42) => {
    let [h, s, l] = r2hsl(...h2r(hex));
    h = hueToward(h, 300, s < 0.08 ? 0 : 0.12);
    return r2h(...hsl2r(h, Math.min(0.7, s * 0.6 + 0.1), Math.min(0.3, l * k)));
  };

  // ------------------------------------------------------------- transforms
  XL.zoom = 1;       // figure-px -> css-px factor of the current render (bust view > 1)
  XL.dpr = 1;        // canvas device pixel ratio
  XL.lineZoom = 1;   // how much line art grows when zoomed (bust view uses zoom^0.55)
  XL.lineK = 1;      // extra line weight factor
  function scaleOf(ctx) { const m = ctx.getTransform(); return Math.hypot(m.a, m.b); }
  // line width given in "figure px" (as drawn at 1x full-body), kept constant whatever local scale we are in
  XL.lw = (ctx, px) => px * XL.lineK * XL.dpr * XL.lineZoom / scaleOf(ctx);
  // vector in figure px, screen direction -> local coords (keeps the key light fixed when mirrored / rotated)
  XL.vec = (ctx, dx, dy) => {
    const inv = ctx.getTransform().inverse(); const k = XL.zoom * XL.dpr;
    return [(inv.a * dx + inv.c * dy) * k, (inv.b * dx + inv.d * dy) * k];
  };

  // ---------------------------------------------------------------- paths
  function area(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
  // Smooth Catmull-Rom outline through points. Point = [x,y] or [x,y,'c'] (sharp corner).
  XL.addCurve = (p, pts, closed = true, t = 1, move = true) => {
    const n = pts.length;
    if (closed && area(pts) < 0) pts = pts.slice().reverse();
    const get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    if (move) p.moveTo(pts[0][0], pts[0][1]); else p.lineTo(pts[0][0], pts[0][1]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      const k1 = p1[2] === 'c' ? 0 : t / 6, k2 = p2[2] === 'c' ? 0 : t / 6;
      p.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * k1, p1[1] + (p2[1] - p0[1]) * k1,
        p2[0] - (p3[0] - p1[0]) * k2, p2[1] - (p3[1] - p1[1]) * k2, p2[0], p2[1]);
    }
    if (closed) p.closePath();
    return p;
  };
  XL.curve = (pts, closed = true, t = 1) => XL.addCurve(new Path2D(), pts, closed, t);
  XL.poly = (pts) => { const p = new Path2D(); const P = area(pts) < 0 ? pts.slice().reverse() : pts; p.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) p.lineTo(P[i][0], P[i][1]); p.closePath(); return p; };
  XL.ell = (x, y, rx, ry, rot = 0) => { const p = new Path2D(); p.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2); return p; };
  XL.union = (...ps) => { const u = new Path2D(); ps.flat().forEach((q) => q && u.addPath(q)); return u; };
  XL.mirrorPts = (pts) => pts.map((p) => [-p[0], p[1], p[2]]);
  // symmetric outline: give the right half from top-centre to bottom-centre
  XL.sym = (half) => { const m = XL.mirrorPts(half.slice(1, -1)).reverse(); return half.concat(m); };

  // Tapered ribbon along a polyline (sleeves, legs, scarves, straps). ws = full widths per point.
  XL.ribbon = (pts, ws, o = {}) => {
    const n = pts.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / d, ny = (b[0] - a[0]) / d;
      const w = (Array.isArray(ws) ? ws[i] : ws) / 2;
      const sk = o.skew ? o.skew[i] || 0 : 0;
      L.push([pts[i][0] + nx * (w + sk), pts[i][1] + ny * (w + sk)]);
      R.push([pts[i][0] - nx * (w - sk), pts[i][1] - ny * (w - sk)]);
    }
    const end = pts[n - 1], st = pts[0];
    const out = [];
    L.forEach((p, i) => out.push(i === 0 || i === n - 1 ? [p[0], p[1], o.round ? undefined : 'c'] : p));
    if (o.roundEnd || o.round) {
      const a = pts[n - 2], d = Math.hypot(end[0] - a[0], end[1] - a[1]) || 1, w = (Array.isArray(ws) ? ws[n - 1] : ws) / 2;
      out[out.length - 1] = [L[n - 1][0], L[n - 1][1]];
      out.push([end[0] + (end[0] - a[0]) / d * w * 0.9, end[1] + (end[1] - a[1]) / d * w * 0.9]);
      R.reverse();
      R.forEach((p, i) => out.push(i === R.length - 1 ? [p[0], p[1], o.round ? undefined : 'c'] : p));
    } else {
      R.reverse();
      R.forEach((p, i) => out.push(i === 0 || i === R.length - 1 ? [p[0], p[1], 'c'] : p));
    }
    if (o.round) {
      const a = pts[1], d = Math.hypot(st[0] - a[0], st[1] - a[1]) || 1, w = (Array.isArray(ws) ? ws[0] : ws) / 2;
      out.push([st[0] + (st[0] - a[0]) / d * w * 0.9, st[1] + (st[1] - a[1]) / d * w * 0.9]);
    }
    return XL.curve(out, true);
  };
  // Leaf/lock shape from root to tip with bend (hair locks, flames, tassels, straw)
  XL.lock = (x0, y0, x1, y1, w, bend = 0, o = {}) => {
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    const mx = x0 + dx * 0.45 + nx * bend, my = y0 + dy * 0.45 + ny * bend;
    const m2x = x0 + dx * 0.78 + nx * bend * 0.75, m2y = y0 + dy * 0.78 + ny * bend * 0.75;
    const w0 = w / 2, w1 = (o.mid || 0.8) * w / 2, w2 = w * 0.32 / 2 * (o.tipW || 1);
    const pts = [
      [x0 + nx * w0, y0 + ny * w0, 'c'], [mx + nx * w1, my + ny * w1], [m2x + nx * w2, m2y + ny * w2],
      [x1, y1, 'c'],
      [m2x - nx * w2, m2y - ny * w2], [mx - nx * w1, my - ny * w1], [x0 - nx * w0, y0 - ny * w0, 'c'],
    ];
    return XL.curve(pts, true);
  };

  // -------------------------------------------------------------- painting
  function fillOutside(ctx, path, dx, dy) {
    const q = new Path2D(); q.rect(-1e4, -1e4, 2e4, 2e4);
    q.addPath(path, new DOMMatrix([1, 0, 0, 1, dx, dy]));
    ctx.fill(q, 'evenodd');
  }
  XL.fillOutside = fillOutside;
  // same, for unions of overlapping sub-paths (evenodd would stripe them): uses a scratch layer
  function scratch(ctx) {
    const c = ctx.canvas;
    if (!XL._s || XL._s.width < c.width || XL._s.height < c.height) { XL._s = document.createElement('canvas'); XL._s.width = c.width; XL._s.height = c.height; }
    const s = XL._s.getContext('2d'); s.setTransform(1, 0, 0, 1, 0, 0); s.globalCompositeOperation = 'source-over'; s.clearRect(0, 0, c.width, c.height); s.setTransform(ctx.getTransform()); return s;
  }
  function fillOutsideMulti(ctx, path, dx, dy) {
    const s = scratch(ctx); s.fillStyle = ctx.fillStyle; s.fill(path);
    s.globalCompositeOperation = 'destination-out'; s.translate(dx, dy); s.fill(path); s.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(XL._s, 0, 0); ctx.restore();
  }
  // cel paint: base fill (+soft vertical gradient), form shadow on the side away from the key light (key = upper-left),
  // extra shadow shapes, top-left bounce highlight, rim light on the right edge, then line art in a dark hue of the fill.
  XL.paint = (ctx, path, base, o = {}) => {
    const fillOutside = o.multi ? fillOutsideMulti : XL.fillOutside;
    ctx.save();
    if (o.grad !== false) {
      const g = o.gradY || [-1e3, 1e3];
      if (o.gradY) { const lg = ctx.createLinearGradient(0, g[0], 0, g[1]); lg.addColorStop(0, XL.light(base, 0.06)); lg.addColorStop(1, XL.shadow(base, 0.1)); ctx.fillStyle = lg; } else ctx.fillStyle = base;
    } else ctx.fillStyle = base;
    if (o.lineUnder) { ctx.strokeStyle = o.line || XL.ink(base); ctx.lineWidth = XL.lw(ctx, (o.lw || 1.7) * 2); ctx.lineJoin = 'round'; ctx.stroke(path); }
    ctx.fill(path);
    ctx.clip(path);
    if (o.tex) o.tex(ctx);
    const shc = o.shCol || XL.shadow(base, o.shAmt || 0.24);
    const sh = o.sh === undefined ? [3.2, 2] : o.sh;
    if (sh) { ctx.fillStyle = shc; const v = XL.vec(ctx, sh[0], sh[1]); fillOutside(ctx, path, -v[0], -v[1]); }
    ctx.fillStyle = shc;
    (o.shadows || []).forEach((s) => s && ctx.fill(s));
    if (o.deep) { ctx.fillStyle = o.deepCol || XL.shadow(base, 0.42); o.deep.forEach((s) => s && ctx.fill(s)); }
    if (o.hl !== false) {
      const h = o.hl || [1.6, 1.4]; ctx.fillStyle = o.hlCol || XL.rgba(XL.light(base, 0.5), 0.35);
      const v = XL.vec(ctx, h[0], h[1]); fillOutside(ctx, path, v[0], v[1]);
    }
    if (o.lights) { ctx.fillStyle = o.lightCol || XL.light(base, 0.18); o.lights.forEach((s) => s && ctx.fill(s)); }
    if (o.rim) { ctx.fillStyle = o.rim; const v = XL.vec(ctx, o.rimW || 1.4, 0); fillOutside(ctx, path, -v[0], -v[1]); }
    if (o.after) o.after(ctx);
    ctx.restore();
    if (o.line !== false) {
      ctx.save(); ctx.strokeStyle = o.line || XL.ink(base); ctx.lineWidth = XL.lw(ctx, o.lw || 1.7); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(path); ctx.restore();
    }
  };
  // several overlapping pieces painted as one mass (outline only on the outside)
  XL.paintMass = (ctx, paths, base, o = {}) => {
    const u = XL.union(paths);
    ctx.save(); ctx.strokeStyle = o.line || XL.ink(base); ctx.lineWidth = XL.lw(ctx, (o.lw || 1.8) * 2); ctx.lineJoin = 'round';
    paths.forEach((p) => ctx.stroke(p)); ctx.restore();
    XL.paint(ctx, u, base, Object.assign({}, o, { line: false, multi: true }));
  };
  // tapered stroke (fold line / strand): crescent between two arcs
  XL.taper = (ctx, pts, w, col, o = {}) => {
    const n = pts.length; if (n < 2) return;
    const ws = pts.map((_, i) => { const t = i / (n - 1); return Math.max(0.01, w * Math.sin(Math.PI * (o.start ? 0.5 + t * 0.5 : t)) ); });
    const sm = [];
    // densify with catmull-rom
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      for (let k = 0; k < 6; k++) {
        const t = k / 6, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        sm.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    sm.push(pts[n - 1]);
    const m = sm.length;
    const wl = sm.map((_, i) => { const t = i / (m - 1); const s = o.start ? Math.sin(Math.PI * (0.5 + t * 0.5)) : o.end ? Math.sin(Math.PI * t * 0.5) : Math.sin(Math.PI * t); return Math.max(0.02, w * Math.pow(s, 0.7)); });
    const sc = XL.lw(ctx, 1);
    const p = XL.ribbon(sm, wl.map((v) => v * sc), {});
    ctx.save(); ctx.fillStyle = col; ctx.fill(p); ctx.restore();
  };
  XL.line = (ctx, pts, col, w = 1.2, closed = false) => {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = XL.lw(ctx, w); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke(XL.curve(pts, closed)); ctx.restore();
  };
  XL.dash = (ctx, pts, col, w = 0.8, d = [2, 2]) => {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = XL.lw(ctx, w); const s = XL.lw(ctx, 1); ctx.setLineDash(d.map((v) => v * s)); ctx.stroke(XL.curve(pts, false)); ctx.restore();
  };
  // additive glow; when a figure FX layer is active (XL.fx) the glow goes there so it never feeds the silhouette passes
  XL.glow = (ctx, x, y, r, col, a = 0.6) => {
    const t = XL.fx || ctx;
    t.save(); if (XL.fx) t.setTransform(ctx.getTransform());
    const g = t.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, XL.rgba(col, a)); g.addColorStop(0.45, XL.rgba(col, a * 0.35)); g.addColorStop(1, XL.rgba(col, 0));
    t.fillStyle = g; t.globalCompositeOperation = 'lighter'; t.fillRect(x - r, y - r, r * 2, r * 2); t.restore();
  };
  XL.withT = (ctx, x, y, rot, sx, sy, fn) => { ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); if (sx !== undefined) ctx.scale(sx, sy === undefined ? sx : sy); fn(ctx); ctx.restore(); };
  // knot button (盤扣): a little knot + loop bar
  XL.knot = (ctx, x, y, s, col, bar = 0, barCol) => {
    if (bar) { ctx.save(); ctx.strokeStyle = barCol || col; ctx.lineWidth = s * 0.55; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - bar, y); ctx.lineTo(x + bar, y); ctx.stroke(); ctx.restore(); }
    XL.paint(ctx, XL.ell(x, y, s, s), col, { sh: [0.6, 0.6], lw: 0.8, hl: [0.5, 0.5] });
  };
  // ---------------------------------------------------------------- skin
  XL.skinShadow = (skin) => XL.shadow(skin, 0.2, 5);

  // ------------------------------------------------------------------ hands
  // Local space: wrist at (0,0), hand points to +y, L = hand length. Drawn for the screen-right hand; mirror for the left.
  // poses: relax | fist | gripV (vertical pole through fist) | gripH (horizontal pole, fingers over) | open (palm up, fingers curled) | hip
  XL.hand = (ctx, x, y, ang, L, skin, pose = 'relax', mirror = false, o = {}) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); if (mirror) ctx.scale(-1, 1);
    const ink = o.line || XL.ink(skin, 0.5), sk = skin, shc = XL.skinShadow(skin);
    const po = { line: ink, lw: 1.3, shCol: shc, sh: [1.6, 1.2], rim: o.rim };
    const fl = (pts, w = 0.9) => XL.line(ctx, pts, XL.rgba(ink, 0.8), w);
    const s = L;
    if (pose === 'relax') {
      // back of the hand / pinky edge outward (+x), thumb toward the body (-x), fingers loosely curled inward
      const palm = XL.curve([[-0.16 * s, -0.04 * s], [-0.2 * s, 0.26 * s], [-0.17 * s, 0.56 * s], [-0.1 * s, 0.8 * s], [0.0, 0.95 * s], [0.1 * s, 1.0 * s], [0.18 * s, 0.9 * s], [0.22 * s, 0.62 * s], [0.23 * s, 0.32 * s], [0.18 * s, -0.02 * s]]);
      XL.paint(ctx, palm, sk, po);
      fl([[0.03 * s, 0.6 * s], [0.06 * s, 0.78 * s], [0.07 * s, 0.94 * s]], 0.75);
      fl([[0.12 * s, 0.58 * s], [0.15 * s, 0.76 * s], [0.15 * s, 0.9 * s]], 0.7);
      fl([[-0.12 * s, 0.56 * s], [0.04 * s, 0.53 * s], [0.2 * s, 0.56 * s]], 0.6);
      const th = XL.curve([[-0.08 * s, 0.14 * s], [-0.2 * s, 0.3 * s], [-0.25 * s, 0.48 * s], [-0.22 * s, 0.64 * s], [-0.15 * s, 0.63 * s], [-0.12 * s, 0.46 * s], [-0.02 * s, 0.32 * s]]);
      XL.paint(ctx, th, XL.light(sk, 0.05), po);
      fl([[-0.22 * s, 0.56 * s], [-0.17 * s, 0.6 * s]], 0.6);
    } else if (pose === 'fist' || pose === 'hip' || pose === 'gripV') {
      const f = XL.curve([[-0.22 * s, -0.02 * s], [-0.27 * s, 0.25 * s], [-0.25 * s, 0.55 * s], [-0.12 * s, 0.68 * s], [0.08 * s, 0.68 * s], [0.24 * s, 0.6 * s], [0.27 * s, 0.32 * s], [0.2 * s, 0.02 * s]]);
      XL.paint(ctx, f, sk, po);
      // finger segments
      [-0.17, -0.06, 0.05, 0.15].forEach((fx, i) => fl([[fx * s + 0.06 * s, 0.36 * s], [fx * s + 0.05 * s, 0.5 * s], [fx * s + 0.04 * s, 0.64 * s]], 0.7));
      fl([[-0.24 * s, 0.36 * s], [0.0, 0.33 * s], [0.25 * s, 0.36 * s]], 0.8);
      const th = XL.curve([[0.24 * s, 0.1 * s], [0.31 * s, 0.24 * s], [0.25 * s, 0.38 * s], [0.06 * s, 0.42 * s], [0.0, 0.36 * s], [0.12 * s, 0.28 * s]]);
      XL.paint(ctx, th, XL.light(sk, 0.06), po);
    } else if (pose === 'gripH') {
      // hand on top of a horizontal pole; fingers wrap toward the viewer
      const f = XL.curve([[-0.2 * s, -0.04 * s], [-0.28 * s, 0.22 * s], [-0.3 * s, 0.5 * s], [-0.18 * s, 0.66 * s], [0.12 * s, 0.68 * s], [0.28 * s, 0.56 * s], [0.26 * s, 0.24 * s], [0.18 * s, -0.02 * s]]);
      XL.paint(ctx, f, sk, po);
      [-0.15, -0.03, 0.09].forEach((fx) => fl([[fx * s, 0.3 * s], [fx * s + 0.01 * s, 0.48 * s], [fx * s, 0.66 * s]], 0.75));
      fl([[-0.27 * s, 0.32 * s], [0.0, 0.28 * s], [0.26 * s, 0.32 * s]], 0.7);
    } else if (pose === 'open') {
      // palm up / toward viewer, fingers relaxed and slightly spread
      const palm = XL.curve([[-0.2 * s, 0], [-0.26 * s, 0.22 * s], [-0.24 * s, 0.46 * s], [0.0, 0.52 * s], [0.24 * s, 0.46 * s], [0.25 * s, 0.2 * s], [0.18 * s, 0]]);
      const fingers = [];
      [[-0.2, 0.86, -0.08], [-0.07, 0.98, -0.02], [0.07, 0.96, 0.03], [0.19, 0.82, 0.08]].forEach(([fx, len, b]) => {
        fingers.push(XL.lock(fx * s, 0.4 * s, (fx + b) * s, len * s, 0.13 * s, b * s * 0.3, { mid: 0.95, tipW: 2.4 }));
      });
      const th = XL.lock(-0.2 * s, 0.14 * s, -0.42 * s, 0.46 * s, 0.15 * s, -0.03 * s, { mid: 0.9, tipW: 2.2 });
      XL.paintMass(ctx, [palm, th, ...fingers], sk, { line: ink, lw: 1.3, shCol: shc, sh: [1.4, 1.2], rim: o.rim });
      fl([[-0.18 * s, 0.24 * s], [0.0, 0.34 * s], [0.12 * s, 0.4 * s]], 0.7);
      [[-0.135, 0.44], [-0.005, 0.47], [0.13, 0.45]].forEach(([fx, fy]) => fl([[fx * s, fy * s], [fx * s, (fy + 0.12) * s]], 0.6));
    }
    ctx.restore();
  };

  // ------------------------------------------------------------------ feet
  // front view foot. x,y = ankle centre (bottom of leg); s = foot scale (≈ head height * 0.42). out = 1 (right) / -1 (left)
  // kind: bare | straw (草鞋) | clog (柴屐) | cloth (布鞋) | boot
  XL.foot = (ctx, x, y, s, skin, kind, out = 1, o = {}) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(out, 1);
    const sk = skin; const ink = XL.ink(skin, 0.5);
    const footPath = XL.curve([[-0.36 * s, -0.12 * s], [-0.44 * s, 0.3 * s], [-0.48 * s, 0.62 * s], [-0.36 * s, 0.78 * s], [0.1 * s, 0.82 * s], [0.62 * s, 0.76 * s], [0.74 * s, 0.6 * s], [0.6 * s, 0.38 * s], [0.38 * s, 0.14 * s], [0.34 * s, -0.12 * s]]);
    const toes = () => {
      const tl = [[-0.38, 0.6, 0.2], [-0.12, 0.66, 0.16], [0.1, 0.66, 0.14], [0.3, 0.64, 0.13], [0.48, 0.6, 0.12]];
      tl.forEach(([tx, ty, tr], i) => {
        const tp = XL.ell(tx * s + (i ? 0.04 * s : 0), ty * s + 0.08 * s, tr * s * (i ? 0.9 : 1.15), tr * s * 0.8);
        XL.paint(ctx, tp, sk, { line: ink, lw: 1, sh: [0.8, 0.8], shCol: XL.skinShadow(sk) });
      });
    };
    if (kind === 'boot') {
      const boot = XL.curve([[-0.4 * s, -1.6 * s], [-0.44 * s, -0.4 * s], [-0.5 * s, 0.4 * s], [-0.46 * s, 0.76 * s], [0.12 * s, 0.86 * s], [0.66 * s, 0.8 * s], [0.74 * s, 0.6 * s], [0.5 * s, 0.3 * s], [0.4 * s, -0.4 * s], [0.42 * s, -1.6 * s]]);
      XL.paint(ctx, boot, o.col || '#2b2622', { rim: o.rim, shadows: [], lw: 1.6 });
      XL.paint(ctx, XL.curve([[-0.5 * s, 0.68 * s], [0.1 * s, 0.8 * s], [0.74 * s, 0.68 * s], [0.74 * s, 0.84 * s, 'c'], [0.1 * s, 0.94 * s], [-0.48 * s, 0.84 * s, 'c']]), '#1a1614', { lw: 1.2, hl: false });
      XL.line(ctx, [[-0.42 * s, -1.25 * s], [0.0, -1.18 * s], [0.42 * s, -1.25 * s]], XL.light(o.col || '#2b2622', 0.2), 1);
      ctx.restore(); return;
    }
    if (kind === 'cloth') {
      // white sock + black cloth shoe
      const sock = XL.curve([[-0.36 * s, -0.5 * s], [-0.42 * s, 0.2 * s], [0.38 * s, 0.2 * s], [0.34 * s, -0.5 * s]]);
      XL.paint(ctx, sock, '#ece7dc', { lw: 1.2 });
      const shoe = XL.curve([[-0.42 * s, 0.1 * s], [-0.5 * s, 0.5 * s], [-0.44 * s, 0.78 * s], [0.12 * s, 0.86 * s], [0.66 * s, 0.8 * s], [0.74 * s, 0.6 * s], [0.48 * s, 0.24 * s], [0.38 * s, 0.08 * s]]);
      XL.paint(ctx, shoe, o.col || '#26252b', { lw: 1.4 });
      XL.line(ctx, [[-0.46 * s, 0.74 * s], [0.12 * s, 0.82 * s], [0.7 * s, 0.74 * s]], '#d8d2c4', 1.1);
      ctx.restore(); return;
    }
    if (kind === 'straw' || kind === 'clog') {
      // sole under the foot
      if (kind === 'straw') {
        const sole = XL.curve([[-0.5 * s, 0.5 * s], [-0.56 * s, 0.82 * s], [0.12 * s, 0.92 * s], [0.78 * s, 0.86 * s], [0.78 * s, 0.6 * s], [0.2 * s, 0.66 * s]]);
        XL.paint(ctx, sole, o.straw || '#c9ad6e', { lw: 1.2, line: '#5e4a26' });
        ctx.save(); ctx.clip(sole);
        for (let i = -6; i < 10; i++) XL.line(ctx, [[i * 0.14 * s - 0.1 * s, 0.6 * s], [i * 0.14 * s + 0.02 * s, 0.95 * s]], XL.rgba('#6f5629', 0.6), 0.6);
        ctx.restore();
      } else {
        const base = XL.curve([[-0.52 * s, 0.62 * s, 'c'], [0.8 * s, 0.62 * s, 'c'], [0.8 * s, 0.9 * s, 'c'], [-0.52 * s, 0.9 * s, 'c']]);
        XL.paint(ctx, base, o.wood || '#9a6a3c', { lw: 1.3 });
        const teeth = XL.union(XL.poly([[-0.42 * s, 0.9 * s], [-0.12 * s, 0.9 * s], [-0.14 * s, 1.18 * s], [-0.4 * s, 1.18 * s]]), XL.poly([[0.38 * s, 0.9 * s], [0.7 * s, 0.9 * s], [0.68 * s, 1.18 * s], [0.4 * s, 1.18 * s]]));
        XL.paint(ctx, teeth, XL.shadow(o.wood || '#9a6a3c', 0.2), { lw: 1.2 });
      }
    }
    XL.paint(ctx, footPath, sk, { line: ink, lw: 1.3, shCol: XL.skinShadow(sk), rim: o.rim });
    toes();
    // ankle bone hint
    XL.line(ctx, [[-0.3 * s, 0.05 * s], [-0.36 * s, 0.14 * s]], XL.rgba(ink, 0.6), 0.8);
    if (kind === 'straw') {
      const cord = o.cord || '#b8995a';
      XL.paint(ctx, XL.ribbon([[-0.42 * s, 0.42 * s], [0.1 * s, 0.34 * s], [0.66 * s, 0.5 * s]], 0.13 * s), cord, { lw: 1, line: '#5e4a26' });
      XL.paint(ctx, XL.ribbon([[-0.38 * s, 0.0], [0.0, 0.08 * s], [0.38 * s, 0.0]], 0.1 * s), cord, { lw: 1, line: '#5e4a26' });
      XL.paint(ctx, XL.ribbon([[0.0, 0.08 * s], [0.08 * s, 0.4 * s]], 0.09 * s), cord, { lw: 0.9, line: '#5e4a26' });
    }
    if (kind === 'clog') {
      XL.paint(ctx, XL.ribbon([[-0.46 * s, 0.6 * s], [-0.1 * s, 0.3 * s], [0.2 * s, 0.32 * s], [0.62 * s, 0.6 * s]], 0.14 * s), o.strap || '#2b2b33', { lw: 1 });
    }
    ctx.restore();
  };

  // ------------------------------------------------------------------ face
  // Unit space: head top = 0, chin = 1 (one head height), x centred. ctx must already be scaled by head height.
  // F = { jaw, cheek, temple, chin, chinY, jawY, earY, earS, skin, eye:{...}, brow:{...}, nose:{...}, mouth:{...}, extras }
  XL.faceShape = (F) => {
    const t = F.temple || 0.36, c = F.cheek || 0.37, j = F.jaw || 0.3, jy = F.jawY || 0.8, ch = F.chin || 0.1, cy = F.chinY || 1.0;
    return XL.curve([[0, -0.02], [t * 0.72, 0.04], [t, 0.24], [c, 0.5], [c * 0.97, 0.62], [j, jy], [ch + 0.02, cy - 0.04], [0, cy],
      [-ch - 0.02, cy - 0.04], [-j, jy], [-c * 0.97, 0.62], [-c, 0.5], [-t, 0.24], [-t * 0.72, 0.04]]);
  };
  XL.face = (ctx, F) => {
    const skin = F.skin, ink = F.line || XL.ink(skin, 0.45), shc = XL.skinShadow(skin);
    const fs = XL.faceShape(F);
    // ears (behind face edge)
    const ey = F.earY || 0.52, es = F.earS || 1, ex = (F.cheek || 0.37) - 0.02;
    [1, -1].forEach((sd) => {
      const ear = XL.curve([[sd * ex, ey], [sd * (ex + 0.07 * es), ey - 0.03], [sd * (ex + 0.1 * es), ey + 0.06 * es], [sd * (ex + 0.06 * es), ey + 0.17 * es], [sd * (ex - 0.01), ey + 0.21 * es]]);
      XL.paint(ctx, ear, skin, { line: ink, lw: 1.3, shCol: shc, sh: [1.2, 1] });
      XL.line(ctx, [[sd * (ex + 0.03 * es), ey + 0.03], [sd * (ex + 0.065 * es), ey + 0.08 * es], [sd * (ex + 0.03 * es), ey + 0.15 * es]], XL.rgba(shc, 1), 0.9);
    });
    XL.paint(ctx, fs, skin, {
      line: ink, lw: 1.6, shCol: shc, sh: [F.shW || 5, 1.6], rim: F.rim, rimW: 1.2,
      after: (c) => {
        // blush & cheek warmth
        [1, -1].forEach((sd) => { const g = c.createRadialGradient(sd * 0.2, 0.7, 0, sd * 0.2, 0.7, 0.13); g.addColorStop(0, XL.rgba(F.blush || '#e8836f', F.blushA === undefined ? 0.28 : F.blushA)); g.addColorStop(1, XL.rgba(F.blush || '#e8836f', 0)); c.fillStyle = g; c.fillRect(-0.5, 0.5, 1, 0.4); });
        if (F.hairShadow) { c.fillStyle = XL.rgba(shc, 0.95); c.fill(F.hairShadow); }
        if (F.skinExtras) F.skinExtras(c, shc);
      },
    });
    // nose
    const N = F.nose || {}; const ny = N.y || 0.73, nw = N.w || 0.045;
    if (N.type === 'bridge') XL.taper(ctx, [[0.03, 0.52], [0.045, 0.62], [0.05, ny - 0.02]], 1.2, XL.rgba(shc, 1));
    ctx.save(); ctx.fillStyle = shc; ctx.fill(XL.curve([[0.012, ny - 0.11], [nw + 0.012, ny - 0.01], [nw * 0.5, ny + 0.022], [0.0, ny + 0.012]])); ctx.restore();
    XL.line(ctx, [[-nw * 0.75, ny + 0.0], [-nw * 0.25, ny + 0.022], [nw * 0.2, ny + 0.022]], ink, 1.1);
    if (N.type === 'broad' || N.type === 'bridge') XL.line(ctx, [[nw * 0.55, ny + 0.012], [nw, ny - 0.008]], ink, 0.9);
    // mouth
    XL.mouth(ctx, F.mouth || {}, skin, ink, shc);
    // eyes & brows
    [1, -1].forEach((sd) => XL.eye(ctx, sd, F.eye, skin, ink, F.eyeR && sd === 1 ? Object.assign({}, F.eye, F.eyeR) : (F.eyeL && sd === -1 ? Object.assign({}, F.eye, F.eyeL) : F.eye)));
    [1, -1].forEach((sd) => XL.brow(ctx, sd, Object.assign({}, F.brow, sd === 1 ? F.browR : F.browL), F.browCol || F.hairCol || '#2a2020'));
    if (F.faceExtras) F.faceExtras(ctx, ink, shc);
  };
  XL.eye = (ctx, sd, E0, skin, ink, Eside) => {
    const E = Eside || E0;
    const cx = sd * (E.x || 0.165), cy = E.y || 0.58, w = E.w || 0.085, h = E.h || 0.06, tilt = (E.tilt || 0) * 1, up = E.up || 1, lo = E.lo || 0.7;
    const inner = [cx - sd * w, cy + 0.006 + (E.innerDrop || 0)], outer = [cx + sd * w, cy - tilt];
    const lashCol = E.lash || '#231a1e';
    if (E.closed) {
      // happy closed eye (smile arc) or wink
      const arc = E.closed === 'flat' ? [inner, [cx, cy - h * 0.15], outer] : [inner, [cx, cy - h * 0.9], outer];
      XL.taper(ctx, arc, E.lashW || 2.2, lashCol);
      return;
    }
    const lidTop = [cx + sd * (E.peak || 0.1) * w, cy - h * up];
    const lowerMid = [cx + sd * 0.05 * w, cy + h * lo];
    const upper = [inner, [cx - sd * w * 0.45, cy - h * up * 0.82], lidTop, [cx + sd * w * 0.62, cy - h * up * 0.72 - tilt * 0.5], outer];
    const scl = XL.curve([inner, [cx - sd * w * 0.45, cy - h * up * 0.82], lidTop, [cx + sd * w * 0.62, cy - h * up * 0.72 - tilt * 0.5], outer, [cx + sd * w * 0.55, cy + h * lo * 0.8 - tilt * 0.3], lowerMid, [cx - sd * w * 0.6, cy + h * lo * 0.7]]);
    ctx.save();
    ctx.fillStyle = E.white || '#fbf7f2'; ctx.fill(scl); ctx.clip(scl);
    // iris
    const ir = E.ir || h * 1.0, ix = cx + sd * (E.look || 0) * w, iy = cy + (E.irisDy || 0.004);
    const g = ctx.createLinearGradient(0, iy - ir, 0, iy + ir);
    g.addColorStop(0, XL.shadow(E.iris, 0.55)); g.addColorStop(0.55, E.iris); g.addColorStop(1, XL.light(E.iris, 0.35));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(ix, iy, ir * (E.irW || 0.86), ir, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = XL.shadow(E.iris, 0.6); ctx.lineWidth = XL.lw(ctx, 0.9); ctx.stroke();
    ctx.fillStyle = E.pupil || '#1a1013'; ctx.beginPath(); ctx.ellipse(ix, iy + ir * 0.05, ir * (E.pup || 0.4) * (E.irW || 0.86), ir * (E.pup || 0.4) * 1.05, 0, 0, Math.PI * 2); ctx.fill();
    if (E.glowIris) { ctx.fillStyle = XL.rgba(E.glowIris, 0.7); ctx.beginPath(); ctx.ellipse(ix, iy + ir * 0.35, ir * 0.55, ir * 0.35, 0, 0, Math.PI * 2); ctx.fill(); }
    // lid shadow on the eyeball
    ctx.fillStyle = XL.rgba(XL.shadow(skin, 0.4), 0.45); ctx.fill(XL.curve([[cx - w * 1.2, cy - h * 2], [cx + w * 1.2, cy - h * 2], [cx + w * 1.2, cy - h * up * 0.45], [cx, cy - h * up * 0.15], [cx - w * 1.2, cy - h * up * 0.45]]));
    // highlights
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(ix - ir * 0.32, iy - ir * 0.36, ir * 0.24, ir * 0.2, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.ellipse(ix + ir * 0.34, iy + ir * 0.42, ir * 0.1, ir * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // half-lid (lazy / sleepy)
    if (E.lid) {
      const lidY = cy - h * up + h * (up + lo) * E.lid;
      const lp = XL.curve([[inner[0] - sd * 0.01, cy - h * 2], [outer[0] + sd * 0.012, cy - h * 2], [outer[0] + sd * 0.006, outer[1]], [cx + sd * w * 0.3, lidY + h * 0.05], [cx - sd * w * 0.5, lidY + h * 0.1], [inner[0], inner[1]]]);
      ctx.save(); ctx.clip(scl); XL.paint(ctx, lp, skin, { line: false, sh: false, hl: false }); ctx.restore();
      XL.taper(ctx, [inner, [cx - sd * w * 0.4, lidY + h * 0.1], [cx + sd * w * 0.35, lidY + h * 0.02], outer], E.lashW || 2.4, lashCol, {});
    }
    // upper lash line (thick, tapered, heavier toward outer corner) + flick
    const lw = E.lashW || 2.6;
    if (!E.lid) XL.taper(ctx, upper.map((p, i) => [p[0], p[1] - 0.002]), lw, lashCol, { end: true });
    XL.taper(ctx, [[outer[0] - sd * w * 0.25, outer[1] - h * 0.32], outer, [outer[0] + sd * w * (E.flick || 0.18), outer[1] + h * 0.1]], lw * 0.9, lashCol);
    // lower lid
    XL.taper(ctx, [[cx + sd * w * 0.95, outer[1] + h * 0.25], [cx + sd * w * 0.35, cy + h * lo * 0.95], [cx - sd * w * 0.2, cy + h * lo * 0.85]], E.lowW || 1.1, XL.rgba(lashCol, 0.75));
    // crease
    if (E.crease !== false) XL.taper(ctx, [[cx - sd * w * 0.55, cy - h * up * 1.25], [cx + sd * w * 0.1, cy - h * up * 1.6 - (E.creaseUp || 0)], [cx + sd * w * 0.85, cy - h * up * 1.2 - tilt * 0.5]], 0.9, XL.rgba(XL.ink(skin, 0.6), 0.55));
  };
  XL.brow = (ctx, sd, B, col) => {
    const x0 = sd * (B.x0 || 0.06), y0 = B.y0 || 0.46, x1 = sd * (B.x1 || 0.27), y1 = B.y1 || 0.45, arch = B.arch || 0.02, th = B.th || 0.03;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - arch;
    const pts = [[x0, y0 + th * 0.5, 'c'], [x0 + sd * 0.01, y0 - th * 0.6], [mx, my - th * 0.55], [x1, y1, 'c'], [mx + sd * 0.01, my + th * 0.45], [x0 + sd * 0.02, y0 + th * 0.6]];
    XL.paint(ctx, XL.curve(pts), col, { line: false, sh: false, hl: false });
    if (B.hair) XL.line(ctx, [[x0 + sd * 0.012, y0 + th * 0.3], [x0 + sd * 0.018, y0 - th * 0.8]], col, 0.8);
  };
  XL.mouth = (ctx, M, skin, ink, shc) => {
    const y = M.y || 0.85, w = M.w || 0.075, type = M.type || 'smile', dx = M.dx || 0;
    const lip = M.lip || XL.mix(skin, '#c0504a', 0.3);
    ctx.save(); ctx.translate(dx, 0);
    if (type === 'grin' || type === 'laugh' || type === 'open') {
      const op = type === 'laugh' ? 0.075 : type === 'open' ? 0.045 : 0.05;
      const asym = M.asym || 0;
      const m = XL.curve([[-w, y - 0.01 - asym, 'c'], [-w * 0.4, y + op * 0.15], [w * 0.4, y + op * 0.15], [w, y - 0.012 + asym, 'c'], [w * 0.55, y + op * 0.9], [0, y + op * 1.15], [-w * 0.55, y + op * 0.9]]);
      XL.paint(ctx, m, '#6e2a2e', { line: ink, lw: 1.3, sh: false, hl: false });
      ctx.save(); ctx.clip(m);
      if (M.teeth !== false) { ctx.fillStyle = '#fbf6ee'; ctx.fill(XL.curve([[-w, y - 0.03], [w, y - 0.03], [w * 0.8, y + op * 0.35], [0, y + op * 0.42], [-w * 0.8, y + op * 0.35]])); }
      ctx.fillStyle = '#d8706a'; ctx.beginPath(); ctx.ellipse(0, y + op * 1.12, w * 0.55, op * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      XL.paint(ctx, m, '#000', { line: ink, lw: 1.3, sh: false, hl: false, grad: false, after: () => {} , lineUnder: false, tex: null, shadows: [], });
    } else if (type === 'smirk') {
      XL.taper(ctx, [[-w * 0.8, y + 0.008], [0, y + 0.012], [w * 0.75, y - 0.004], [w * 1.05, y - 0.03]], 1.9, ink);
      XL.line(ctx, [[w * 0.95, y - 0.035], [w * 1.08, y - 0.02]], ink, 0.9);
      XL.line(ctx, [[-w * 0.3, y + 0.04], [w * 0.3, y + 0.04]], XL.rgba(shc, 0.9), 1.1);
    } else if (type === 'cat') {
      XL.taper(ctx, [[-w, y - 0.012], [-w * 0.5, y + 0.016], [0, y - 0.002]], 1.7, ink);
      XL.taper(ctx, [[0, y - 0.002], [w * 0.5, y + 0.016], [w, y - 0.012]], 1.7, ink);
    } else if (type === 'neutral' || type === 'set') {
      XL.taper(ctx, [[-w, y + 0.002], [-w * 0.3, y - 0.004], [w * 0.4, y - 0.002], [w, y + (type === 'set' ? 0.006 : 0.0)]], 1.7, ink);
      XL.line(ctx, [[-w * 0.35, y + 0.035], [w * 0.35, y + 0.035]], XL.rgba(shc, 0.9), 1.1);
    } else if (type === 'ooh') {
      const m = XL.ell(0, y + 0.01, w * 0.45, 0.03);
      XL.paint(ctx, m, '#6e2a2e', { line: ink, lw: 1.2, sh: false, hl: false });
    } else {
      // soft closed smile
      XL.taper(ctx, [[-w, y - 0.016], [-w * 0.45, y + 0.012], [w * 0.45, y + 0.012], [w, y - 0.016]], 1.8, ink);
      XL.line(ctx, [[-w * 0.3, y + 0.045], [w * 0.3, y + 0.045]], XL.rgba(shc, 0.9), 1.1);
    }
    ctx.restore();
  };

  // ---------------------------------------------------------------- body
  // Proportions from total height H and head count. y = 0 at ground, up is negative.
  XL.body = (o) => {
    const H = o.H || 420, heads = o.heads || 7, hu = H / heads;
    const B = { H, hu, heads };
    B.top = -H; B.chin = -H + hu; B.neck = -H + hu * 1.2;
    B.shY = -H + hu * (o.shDrop || 1.42); B.shX = hu * (o.sh || 0.98);
    B.chestY = -H + hu * 2.05; B.waistY = -H + hu * 2.85; B.waistX = hu * (o.waist || 0.6);
    B.hipY = -H + hu * 3.3; B.hipX = hu * (o.hip || 0.7);
    B.crotch = -H * 0.485;
    B.kneeY = -H * 0.27; B.ankleY = -H * 0.045;
    B.legX = hu * (o.stance || 0.42);
    B.footS = hu * 0.42 * (o.footK || 1);
    B.handL = hu * 0.74;
    B.neckW = hu * (o.neckW || 0.17);
    return B;
  };
})(typeof window !== 'undefined' ? window : globalThis);
