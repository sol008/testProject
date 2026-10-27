// 彼岸燈 — nature objects (trees, plants, rocks, water features, psychedelic flora).
// Registers into G.Objects (see docs/CONTRACTS.md "Objects").
//
// Conventions
//  * draw(ctx, px, py, o, t): (px,py) = logical px of the footprint's top-left cell. Trees only occupy
//    their trunk base; canopies are drawn far above the footprint so characters can walk behind them.
//  * Every static part is painted ONCE into an offscreen sprite (`spr()`, cached per type+variant+G.S).
//    A sprite carries an anchor (ax, ay); `blit()` places the anchor at a given logical point.
//  * Wind: foliage sprites are drawn in a few horizontal bands shifted sideways by height (`blitSway()`),
//    1:1 drawImage snapped to device pixels only (skew transforms, source-rect blits, fractional
//    positions and scaling are all ~10x slower on CPU-rasterised canvases). A tree = ~4 drawImage calls.
//  * Variation: o.v (variant number, 0..2) if given, else G.U.hash(o.x, o.y) picks one of 3 variants.
//  * Psychedelic colour cycling uses pre-rendered hue frames (`hueFrames()`) cross-faded per frame.
'use strict';
(() => {
  const U = G.U;
  const TAU = Math.PI * 2, PI = Math.PI;
  const { sin, cos, abs, min, max, floor, sqrt, hypot, atan2 } = Math;
  const rgba = U.rgba, shade = U.shade, mix = U.mix;
  const T = G.TILE || 64;

  // ============================================================================================
  // core helpers
  // ============================================================================================
  const CACHE = {};
  // spr(key, w, h, ax, ay, fn): w*h logical sprite; fn(ctx, canvas) draws with origin at the anchor.
  function spr(key, w, h, ax, ay, fn) {
    const k = key + '@' + G.S;
    let c = CACHE[k];
    if (c) return c;
    c = U.makeCanvas(w, h);
    c.ax = ax; c.ay = ay;
    const x = c.getContext('2d');
    x.translate(ax, ay);
    x.lineJoin = 'round'; x.lineCap = 'round';
    fn(x, c);
    CACHE[k] = c;
    return c;
  }
  // All blits snap to the device-pixel grid and draw 1:1: on CPU-rasterised canvases a fractional
  // position or a non-integer scale makes drawImage ~10x slower (bilinear resampling path).
  const snap = (v) => Math.round(v * G.S) / G.S;
  function blit(ctx, s, x, y, a) {
    if (a != null && a < 1) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * a; ctx.drawImage(s, snap(x - s.ax), snap(y - s.ay), s.lw, s.lh); ctx.globalAlpha = ga; return; }
    ctx.drawImage(s, snap(x - s.ax), snap(y - s.ay), s.lw, s.lh);
  }
  function blitS(ctx, s, x, y) { ctx.drawImage(s, snap(x - s.ax), snap(y - s.ay), s.lw, s.lh); }
  // wind sway WITHOUT skew transforms or source-rect blits (both are very slow on CPU canvases): the
  // sprite is pre-sliced once into nb horizontal band canvases; each band shifts sideways in proportion
  // to its height above the anchor (off = px displacement at the sprite's top edge). Bands overlap 1px.
  function bandsOf(s, nb) {
    const k = '_bands' + nb;
    if (s[k]) return s[k];
    const S = s.width / s.lw, out = [];
    for (let i = 0; i < nb; i++) {
      const y0 = floor(i * s.lh / nb), y1 = min(s.lh, Math.ceil((i + 1) * s.lh / nb) + 1);
      const c = U.makeCanvas(s.lw, y1 - y0, S);
      const x = c.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.drawImage(s, 0, -y0 * S);
      c.y0 = y0;
      c.mid = (y0 + y1) / 2;
      out.push(c);
    }
    return (s[k] = out);
  }
  function blitSway(ctx, s, x, y, off, nb = 3) {
    const X = x - s.ax, Y = snap(y - s.ay);
    if (abs(off) < 0.5 / G.S) return ctx.drawImage(s, snap(X), Y, s.lw, s.lh);
    const bs = bandsOf(s, nb), top = s.ay;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i], h = top - b.mid;
      const dx = h > 0 ? off * min(1, h / top) : 0;
      ctx.drawImage(b, snap(X + dx), Y + b.y0, b.lw, b.lh);
    }
  }
  // hanging things (vines): bands shift more the further BELOW the anchor (top) they are
  function blitHang(ctx, s, x, y, off, nb = 3) {
    const bs = bandsOf(s, nb), span = max(1, s.lh - s.ay);
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i], d = (b.mid - s.ay) / span;
      ctx.drawImage(b, snap(x - s.ax + off * max(0, d)), snap(y - s.ay) + b.y0, b.lw, b.lh);
    }
  }
  function R(seed) {
    const r = U.seeded(((seed + 7) * 2654435761) >>> 0);
    r(); r(); r();
    return r;
  }
  const hseed = (o, s) => U.hash(o.x | 0, o.y | 0, s);
  function vary(o, n, s = 11) {
    if (o.v != null) return (((o.v | 0) % n) + n) % n;
    return floor(hseed(o, s) * n) % n;
  }
  function windK(t, o, amp) {
    const ph = (o.x || 0) * 0.45 + (o.y || 0) * 0.23 + hseed(o, 3) * 1.6;
    const g = sin(t * 0.85 - ph) * 0.55 + sin(t * 1.9 - ph * 1.31) * 0.22 + sin(t * 0.29 - ph * 0.17) * 0.35;
    return (g + 0.3) * amp;
  }

  // ---- paths --------------------------------------------------------------------------------
  // scalloped (cloud / foliage) ellipse
  function scallopP(cx, cy, rx, ry, n, amp, r, spiky) {
    const a0 = r() * TAU;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (i + (r() - 0.5) * 0.45) * TAU / n;
      const k = 1 - amp * 0.55 + (r() - 0.5) * amp * 0.4;
      pts.push([cx + cos(a) * rx * k, cy + sin(a) * ry * k, a]);
    }
    const p = new Path2D();
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      let am = (a[2] + b[2]) / 2;
      if (i === n - 1) am += PI;
      const k2 = 1 + amp * (0.35 + r() * 0.55);
      const qx = cx + cos(am) * rx * k2, qy = cy + sin(am) * ry * k2;
      if (spiky) { p.lineTo(qx, qy); p.lineTo(b[0], b[1]); }
      else p.quadraticCurveTo(qx, qy, b[0], b[1]);
    }
    p.closePath();
    return p;
  }
  // tapered limb from (x0,y0) w0 to (x1,y1) w1, bowed sideways by `bend`
  function taperP(x0, y0, x1, y1, w0, w1, bend = 0) {
    const dx = x1 - x0, dy = y1 - y0, L = hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const mx = (x0 + x1) / 2 + nx * bend, my = (y0 + y1) / 2 + ny * bend;
    const wm = (w0 + w1) / 2;
    const p = new Path2D();
    p.moveTo(x0 + nx * w0 / 2, y0 + ny * w0 / 2);
    p.quadraticCurveTo(mx + nx * wm / 2, my + ny * wm / 2, x1 + nx * w1 / 2, y1 + ny * w1 / 2);
    p.quadraticCurveTo(x1 + dx / L * w1 * 0.6, y1 + dy / L * w1 * 0.6, x1 - nx * w1 / 2, y1 - ny * w1 / 2);
    p.quadraticCurveTo(mx - nx * wm / 2, my - ny * wm / 2, x0 - nx * w0 / 2, y0 - ny * w0 / 2);
    p.closePath();
    return p;
  }
  function ell(x, cx, cy, rx, ry, rot = 0) { x.beginPath(); x.ellipse(cx, cy, max(0.1, rx), max(0.1, ry), rot, 0, TAU); }

  // ---- light & shadow -----------------------------------------------------------------------
  function gshadow(x, cx, cy, rx, ry, a = 0.35, col = '10,24,16') {
    x.save();
    x.translate(cx, cy); x.scale(1, ry / rx);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(${col},${a})`);
    g.addColorStop(0.55, `rgba(${col},${a * 0.6})`);
    g.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g;
    x.beginPath(); x.arc(0, 0, rx, 0, TAU); x.fill();
    x.restore();
  }
  // paint a gradient only over existing pixels
  function atop(x, grad, x0, y0, w, h) {
    x.save(); x.globalCompositeOperation = 'source-atop'; x.fillStyle = grad; x.fillRect(x0, y0, w, h); x.restore();
  }
  function vgrad(x, y0, y1, stops) {
    const g = x.createLinearGradient(0, y0, 0, y1);
    stops.forEach((s) => g.addColorStop(s[0], s[1]));
    return g;
  }
  // rim light: edge band facing direction (-dx,-dy), drawn inset by (ix,iy), only over existing pixels
  function rim(c, dx, dy, col, a, ix = 0, iy = 0) {
    const s = G.S;
    const tc = document.createElement('canvas');
    tc.width = c.width; tc.height = c.height;
    const tx = tc.getContext('2d');
    tx.drawImage(c, 0, 0);
    tx.globalCompositeOperation = 'destination-out';
    tx.drawImage(c, dx * s, dy * s);
    tx.globalCompositeOperation = 'source-in';
    tx.fillStyle = col; tx.fillRect(0, 0, tc.width, tc.height);
    const x = c.getContext('2d');
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-atop'; x.globalAlpha = a;
    x.drawImage(tc, ix * s, iy * s);
    x.restore();
  }

  // ---- palettes -----------------------------------------------------------------------------
  function palMix(P, col, t) { const o = {}; for (const k in P) o[k] = P[k][0] === '#' ? mix(P[k], col, t) : P[k]; return o; }
  const LEAF = {
    broad: { line: '#14301f', dark: '#21482c', mid: '#356b37', light: '#5b9a45', hi: '#a6d26a', rim: '#d9f5c4' },
    camphor: { line: '#1b3418', dark: '#2c5527', mid: '#4a8634', light: '#78b443', hi: '#c6e57d', rim: '#effbc9' },
    banyan: { line: '#0f2a1d', dark: '#1a4029', mid: '#2c6037', light: '#4d8c43', hi: '#8fc263', rim: '#cdeec0' },
    pine: { line: '#0e261f', dark: '#173a2f', mid: '#255443', light: '#3f7b5b', hi: '#7fb487', rim: '#c8ecd6' },
    cypress: { line: '#0d2420', dark: '#173a32', mid: '#26584a', light: '#3d7c63', hi: '#7cb38c', rim: '#c4e8d6' },
    juniper: { line: '#11262a', dark: '#1d3d3e', mid: '#2e5a55', light: '#4b7f73', hi: '#86b2a0', rim: '#e4f6f7' },
    maple: { line: '#4a0f12', dark: '#7c1a1a', mid: '#b5322a', light: '#df5e30', hi: '#ffb15a', rim: '#ffe2b0' },
    maple2: { line: '#4f2a0c', dark: '#8a4a12', mid: '#c27a1c', light: '#e6aa30', hi: '#ffe07a', rim: '#fff3c8' },
    maple3: { line: '#2a2a12', dark: '#4c5420', mid: '#8a7a26', light: '#c9802e', hi: '#f2b25a', rim: '#fff0c2' },
    sakura: { line: '#5a1638', dark: '#93285a', mid: '#c94a7f', light: '#ec7fa8', hi: '#ffc8dc', rim: '#fff0f6' },
    bush: { line: '#132e1c', dark: '#1f4a2a', mid: '#336c36', light: '#559845', hi: '#9fcc68', rim: '#d6f2c4' },
  };
  const BARK = {
    brown: { line: '#24160f', dark: '#3d281d', mid: '#5e4130', light: '#86634a', hi: '#b8946f' },
    grey: { line: '#221f1c', dark: '#3e3a35', mid: '#5f5a52', light: '#8a8376', hi: '#b9b2a2' },
    red: { line: '#2e140d', dark: '#53261a', mid: '#7f3f2a', light: '#ad6444', hi: '#d99a72' },
    cherry: { line: '#25110f', dark: '#3f1d19', mid: '#5c2c25', light: '#83473b', hi: '#b77a68' },
    dead: { line: '#1f1d1f', dark: '#46424a', mid: '#6c6870', light: '#9a96a0', hi: '#cbc8d0' },
    juniper: { line: '#231a16', dark: '#4a3a33', mid: '#7a6558', light: '#a99383', hi: '#d8cabd' },
  };

  // ---- bark ---------------------------------------------------------------------------------
  function barkFill(x, path, bb, B, r, o = {}) {
    const g = x.createLinearGradient(bb[0], 0, bb[2], 0);
    g.addColorStop(0, B.light); g.addColorStop(0.3, B.mid); g.addColorStop(0.75, B.dark); g.addColorStop(1, B.line);
    x.fillStyle = g; x.fill(path);
    x.save(); x.clip(path);
    const w = bb[2] - bb[0], h = bb[3] - bb[1];
    const n = floor(w * h * (o.dens || 0.03));
    for (let i = 0; i < n; i++) {
      const sx = bb[0] + r() * w, sy = bb[1] + r() * h, L = 4 + r() * (o.len || 14);
      const lit = (sx - bb[0]) / w < 0.4;
      x.strokeStyle = lit && r() < 0.5 ? rgba(B.hi, 0.35) : rgba(B.line, 0.35 + r() * 0.25);
      x.lineWidth = 0.8 + r() * 0.9;
      x.beginPath();
      if (o.horiz) { x.moveTo(sx, sy); x.lineTo(sx + L * 0.6, sy + (r() - 0.5)); }
      else { x.moveTo(sx, sy); x.quadraticCurveTo(sx + (r() - 0.5) * 3, sy + L / 2, sx + (r() - 0.5) * 2, sy + L); }
      x.stroke();
    }
    x.restore();
    x.strokeStyle = B.line; x.lineWidth = o.lw || 1.8; x.stroke(path);
  }
  // simple limb set (collect, then outline + fill + highlight in 3 passes for clean joins)
  function limbs(x, segs, B) {
    x.fillStyle = B.line;
    x.strokeStyle = B.line;
    for (const s of segs) { x.lineWidth = 2.6; x.stroke(s.p); }
    for (const s of segs) {
      const g = x.createLinearGradient(min(s.x0, s.x1) - s.w0, 0, max(s.x0, s.x1) + s.w0, 0);
      g.addColorStop(0, B.light); g.addColorStop(0.45, B.mid); g.addColorStop(1, B.dark);
      x.fillStyle = g; x.fill(s.p);
    }
    for (const s of segs) {
      if (s.w0 < 3) continue;
      x.strokeStyle = rgba(B.hi, 0.45); x.lineWidth = max(0.8, s.w0 * 0.18);
      x.beginPath(); x.moveTo(s.x0 - s.w0 * 0.25, s.y0); x.lineTo(s.x1 - s.w1 * 0.25, s.y1); x.stroke();
    }
  }
  function branchSegs(r, segs, x0, y0, ang, len, w, depth, o = {}) {
    const x1 = x0 + cos(ang) * len, y1 = y0 + sin(ang) * len;
    const w1 = max(o.minW || 0.8, w * (o.taper || 0.62));
    segs.push({ p: taperP(x0, y0, x1, y1, w, w1, (r() - 0.5) * len * 0.25), x0, y0, x1, y1, w0: w, w1 });
    if (o.tips) o.tips.push([x1, y1, depth]);
    if (depth <= 0) return;
    const n = r() < (o.tri || 0.25) ? 3 : 2;
    const spread = o.spread || 0.55;
    for (let i = 0; i < n; i++) {
      let a = ang + (n === 2 ? (i ? 1 : -1) * spread * (0.6 + r() * 0.6) : (i - 1) * spread * 1.1) + (r() - 0.5) * 0.3;
      if (o.up) a = a * (1 - o.up) + (-PI / 2) * o.up;
      branchSegs(r, segs, x1, y1, a, len * (o.lenK || 0.72) * (0.8 + r() * 0.35), w1, depth - 1, o);
    }
  }

  // ---- foliage ------------------------------------------------------------------------------
  // one painterly leaf cluster: shadow cast onto what's behind, dark body, mid & lit masses, leaf dabs.
  // c.lum (-1..1) = how much this cluster faces the light (top-left of the canopy is brightest).
  function cluster(x, c, P, r, o = {}) {
    const rr = c.r, sq = c.sq || o.sq || 0.9, L = c.lum == null ? 0.3 : c.lum;
    const n = o.n || 11, amp = o.amp == null ? 0.3 : o.amp, sp = o.spiky;
    const body = c.path;
    // cast shadow onto earlier (farther) clusters only
    x.save(); x.globalCompositeOperation = 'source-atop';
    x.translate(o.shx == null ? 3 : o.shx, o.shy == null ? 6 : o.shy);
    x.fillStyle = rgba(P.line, 0.45); x.fill(body); x.restore();
    x.fillStyle = L < -0.55 ? mix(P.dark, P.line, 0.25) : P.dark; x.fill(body);
    x.save(); x.clip(body);
    const m = U.clamp(0.74 + L * 0.16, 0.5, 0.95);
    x.fillStyle = P.mid; x.fill(scallopP(c.x - rr * (1 - m) * 0.9, c.y - rr * (1 - m) * 1.2 * sq, rr * m, rr * m * 0.92 * sq, n, amp, r, sp));
    const l = U.clamp(0.4 + L * 0.2, 0.12, 0.66);
    if (L > -0.75) { x.fillStyle = P.light; x.fill(scallopP(c.x - rr * 0.3, c.y - rr * 0.42 * sq, rr * l, rr * l * 0.85 * sq, max(6, n - 3), amp, r, sp)); }
    x.restore();
    // leaf dabs
    const style = o.leaf || 'leaf';
    const nd = floor(rr * rr * sq * 0.085 * (o.dens || 1));
    for (let i = 0; i < nd; i++) {
      const a = r() * TAU, d = sqrt(r()) * 0.98;
      const lx = cos(a) * d, ly = sin(a) * d;
      const px = c.x + lx * rr, py = c.y + ly * rr * sq;
      const lum = -(lx * 0.5 + ly * 0.85) + (r() - 0.5) * 0.9 + L * 0.45;
      let col;
      if (lum > 0.8) col = r() < 0.55 ? P.hi : P.light;
      else if (lum > 0.15) col = P.light;
      else if (lum > -0.45) col = P.mid;
      else col = r() < 0.5 ? P.dark : mix(P.dark, P.line, 0.4);
      x.fillStyle = col;
      if (style === 'needle') {
        x.strokeStyle = col; x.lineWidth = 1.3;
        const ang = a + (r() - 0.5) * 0.8, Ln = 3 + r() * 4;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + cos(ang) * Ln, py + sin(ang) * Ln * 0.7 - 1); x.stroke();
      } else if (style === 'petal') {
        ell(x, px, py, 1.6 + r() * 1.4, 1.3 + r() * 1.1, r() * PI); x.fill();
      } else if (style === 'scale') {
        ell(x, px, py, 3.5 + r() * 2.5, 1.4 + r() * 0.8, (r() - 0.5) * 0.6); x.fill();
      } else {
        const Ll = (o.leafL || 3.6) * (0.75 + r() * 0.5);
        ell(x, px, py, Ll, Ll * 0.48, a + (r() - 0.5) * 1.2); x.fill();
      }
    }
    // leaves breaking the silhouette (outlined) on clusters that sit on the canopy's outer edge,
    // pointing outward; right-facing ones catch the cool sky rim light
    const out = hypot(c.nx || 0, c.ny || 0);
    if (o.edge !== false && style !== 'petal' && out > 0.45) {
      const oa = atan2(c.ny, c.nx);
      const ne = floor(rr * 0.55 * (o.edgeK || 1));
      for (let i = 0; i < ne; i++) {
        const a = oa + (r() - 0.5) * 2.6;
        if (sin(a) > 0.55) continue;   // not on the underside
        const ex = c.x + cos(a) * rr * (0.97 + r() * 0.08), ey = c.y + sin(a) * rr * sq * (0.97 + r() * 0.08);
        const lum = -(cos(a) * 0.5 + sin(a) * 0.85) + L * 0.5;
        let col = lum > 0.6 ? P.light : lum > -0.2 ? P.mid : P.dark;
        if (cos(a) > 0.35 && c.nx > 0.3) col = mix(col, P.rim, 0.4);
        x.fillStyle = col; x.strokeStyle = P.line; x.lineWidth = 1.1;
        if (style === 'needle' || style === 'scale') {
          x.strokeStyle = col; x.lineWidth = 1.4;
          x.beginPath(); x.moveTo(ex - cos(a) * 3, ey - sin(a) * 3); x.lineTo(ex + cos(a) * 4, ey + sin(a) * 3); x.stroke();
        } else {
          const Ll = (o.leafL || 3.6) * (0.9 + r() * 0.5);
          ell(x, ex, ey, Ll, Ll * 0.5, a + (r() - 0.5) * 0.8); x.stroke(); x.fill();
        }
      }
    }
    // rim crescents: sky-light on outer right edges, warm sun on upper-left edges
    const crescent = (dx, dy, col, al) => {
      x.save(); x.clip(body);
      const p = new Path2D();
      p.rect(c.x - rr * 2, c.y - rr * 2, rr * 4, rr * 4);
      p.addPath(body, new DOMMatrix().translateSelf(dx, dy));
      x.fillStyle = rgba(col, al); x.fill(p, 'evenodd');
      x.restore();
    };
    if (c.nx > 0.3 && o.rim !== false) crescent(-2.5, -0.5, P.rim, 0.4 * min(1, (c.nx - 0.3) * 2.5));
    if (L > 0.2) crescent(2.5, 3, P.hi, 0.45 * min(1, (L - 0.2) * 2));
  }
  // build a set of clusters by rows: rows = [[yFrac(-1..1), count, rFrac], ...]
  function rowsClusters(r, cx, cy, RX, RY, rows, o = {}) {
    const out = [];
    for (const [fy, cnt, rf] of rows) {
      const y = cy + fy * RY;
      const hc = RX * sqrt(max(0.05, 1 - fy * fy)) * (o.spread || 0.78);
      for (let j = 0; j < cnt; j++) {
        const u = cnt === 1 ? 0.5 : j / (cnt - 1);
        const x = cx - hc + u * hc * 2 + (r() - 0.5) * RX * 0.16;
        out.push({ x, y: y + (r() - 0.5) * RY * 0.14, r: RX * rf * (0.85 + r() * 0.3), sq: o.sq });
      }
    }
    return out;
  }
  // full canopy into ctx; `mid` callback runs part-way (branches between back and front clusters)
  function paintCanopy(x, cl, P, r, o = {}) {
    cl.sort((a, b) => a.y - b.y);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const c of cl) { x0 = min(x0, c.x - c.r); x1 = max(x1, c.x + c.r); y0 = min(y0, c.y - c.r); y1 = max(y1, c.y + c.r); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
    for (const c of cl) {
      c.path = scallopP(c.x, c.y, c.r, c.r * (c.sq || o.sq || 0.9), o.n || 11, o.amp == null ? 0.3 : o.amp, r, o.spiky);
      const nx = (c.x - cx) / hw, ny = (c.y - cy) / hh;
      c.lum = U.clamp(-(nx * 0.55 + ny * 0.85) + (r() - 0.5) * 0.3, -1, 1);
      c.nx = nx; c.ny = ny;
    }
    x.strokeStyle = P.line; x.lineWidth = o.outline || 3.2;
    for (const c of cl) x.stroke(c.path);
    // deep-shade core so gaps between clusters read as foliage depth, not holes
    if (o.core !== false) {
      x.fillStyle = mix(P.dark, P.line, 0.45);
      for (const c of cl) { ell(x, c.x, c.y, c.r * 0.82, c.r * 0.74 * (c.sq || o.sq || 0.9)); x.fill(); }
    }
    const half = floor(cl.length * (o.midAt || 0.45));
    cl.forEach((c, i) => {
      if (i === half && o.mid) o.mid(x);
      cluster(x, c, P, r, o);
    });
  }
  // standard post-processing for a canopy sprite: vertical AO, sun sheen, rim lights
  function canopyPost(x, c, P, top, bottom) {
    atop(x, vgrad(x, top, bottom, [[0, rgba(P.hi, 0.18)], [0.4, rgba(P.hi, 0)], [0.6, rgba(P.line, 0)], [1, rgba(P.line, 0.5)]]), -c.ax, -c.ay, c.lw, c.lh);
  }

  // ============================================================================================
  // registration helper
  // ============================================================================================
  function def(type, d) { G.Objects.define(type, d); }

  // ============================================================================================
  // BROADLEAF TREES (1x1): camphor, maple, sakura
  // ============================================================================================
  // base sprite = soft ground shadow + roots + trunk + main forks; canopy sprite = foliage (sways)
  function broadTree(id, cfg) {
    const base = (v) => spr(id + '_b' + v, 200, cfg.trunkH + 70, 100, cfg.trunkH + 30, (x) => {
      const r = R(cfg.seed + v * 31);
      gshadow(x, 10, 2, cfg.RX * 0.85, 20, 0.32);
      gshadow(x, 2, 0, 22, 8, 0.45);
      const B = cfg.B;
      const lean = (r() - 0.5) * 10;
      const segs = [];
      // roots
      for (let i = 0; i < 4; i++) {
        const s = i < 2 ? -1 : 1, ang = s * (0.25 + r() * 0.5);
        const ex = s * (12 + r() * 10), ey = 3 + r() * 4;
        segs.push({ p: taperP(s * 2, -14, ex, ey, cfg.w0 * 0.55, 2, s * 3), x0: s * 2, y0: -14, x1: ex, y1: ey, w0: cfg.w0 * 0.55, w1: 2 });
      }
      limbs(x, segs, B);
      const tp = taperP(0, 2, lean, -cfg.trunkH, cfg.w0, cfg.w1, (r() - 0.5) * 8);
      barkFill(x, tp, [-cfg.w0 / 2, -cfg.trunkH, cfg.w0 / 2, 2], B, r, cfg.barkO || {});
      // main forks up into the canopy
      const f = [];
      const nf = cfg.forks || 3;
      for (let i = 0; i < nf; i++) {
        const a = -PI / 2 + (i - (nf - 1) / 2) * (cfg.forkSpread || 0.7) + (r() - 0.5) * 0.2;
        branchSegs(r, f, lean, -cfg.trunkH + 4, a, cfg.forkLen || 34, cfg.w1 * 0.8, 1, { spread: 0.5, taper: 0.6 });
      }
      limbs(x, f, B);
      // contact AO at the base
      atop(x, vgrad(x, -18, 2, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(10,20,10,0.45)']]), -60, -18, 120, 22);
      if (cfg.baseExtra) cfg.baseExtra(x, r, v);
    });
    const can = (v) => spr(id + '_c' + v, cfg.RX * 2 + 60, cfg.RY * 2 + 70, cfg.RX + 30, -cfg.CY + cfg.RY + 40, (x, c) => {
      const r = R(cfg.seed * 3 + v * 17);
      const P = cfg.pal(v);
      const cl = rowsClusters(r, 0, cfg.CY, cfg.RX, cfg.RY, cfg.rows, { sq: cfg.sq, spread: cfg.spread });
      paintCanopy(x, cl, P, r, Object.assign({
        mid: (xx) => {
          // inner limbs visible through gaps
          const f = [];
          for (let i = 0; i < 4; i++) branchSegs(r, f, (r() - 0.5) * 20, cfg.CY + cfg.RY * 0.6, -PI / 2 + (i - 1.5) * 0.6, cfg.RY * 0.55, 5, 1, { spread: 0.6 });
          xx.globalAlpha = 0.95; limbs(xx, f, cfg.B); xx.globalAlpha = 1;
        },
      }, cfg.leafO || {}));
      canopyPost(x, c, P, cfg.CY - cfg.RY - 10, cfg.CY + cfg.RY + 14, 0, cfg.RX);
      if (cfg.canExtra) cfg.canExtra(x, r, v, P);
    });
    return { base, can };
  }
  function defBroad(id, cfg) {
    const t = broadTree(id, cfg);
    def(id, {
      w: 1, h: 1, solid: true, anim: true,
      draw(ctx, px, py, o, tm) {
        const v = vary(o, 3);
        const bx = px + 32, by = py + 54;
        blitS(ctx, t.base(v), bx, by);
        blitSway(ctx, t.can(v), bx, by, windK(tm, o, cfg.sway || 2.6));
        if (cfg.live) cfg.live(ctx, bx, by, o, tm, v);
      },
    });
  }

  defBroad('tree_camphor', {
    seed: 101, trunkH: 62, w0: 22, w1: 14, RX: 86, RY: 64, CY: -136, forks: 3, forkLen: 36,
    B: BARK.grey, barkO: { dens: 0.05, len: 10 },
    rows: [[-0.7, 2, 0.4], [-0.28, 3, 0.4], [0.12, 4, 0.36], [0.52, 3, 0.36]],
    pal: (v) => [LEAF.camphor, palMix(LEAF.camphor, '#2d6a4a', 0.25), palMix(LEAF.camphor, '#a8b830', 0.18)][v],
    leafO: { leafL: 3.4, dens: 1.1 },
  });
  defBroad('tree_maple', {
    seed: 202, trunkH: 54, w0: 16, w1: 10, RX: 70, RY: 58, CY: -120, forks: 3, forkLen: 30,
    B: BARK.grey, rows: [[-0.7, 2, 0.42], [-0.25, 3, 0.4], [0.2, 3, 0.4], [0.55, 2, 0.38]],
    pal: (v) => [LEAF.maple, LEAF.maple2, LEAF.maple3][v],
    leafO: { leafL: 3.0, dens: 1.2, n: 11, amp: 0.36 },
  });
  defBroad('tree_sakura', {
    seed: 303, trunkH: 50, w0: 15, w1: 9, RX: 72, RY: 52, CY: -112, forks: 4, forkSpread: 0.55, forkLen: 34,
    B: BARK.cherry, barkO: { horiz: true, dens: 0.05, len: 8 },
    rows: [[-0.65, 3, 0.33], [-0.15, 4, 0.33], [0.35, 4, 0.31], [0.7, 2, 0.27]], spread: 0.85,
    pal: (v) => [LEAF.sakura, palMix(LEAF.sakura, '#ff9ab5', 0.25), palMix(LEAF.sakura, '#b03070', 0.15)][v],
    leafO: { leaf: 'petal', dens: 1.6, n: 11, amp: 0.34, shy: 4 },
    canExtra(x, r, v, P) {
      // a few fresh green leaves peeking out
      for (let i = 0; i < 26; i++) {
        const a = r() * TAU, d = sqrt(r());
        x.fillStyle = r() < 0.5 ? '#7fae4a' : '#5c8f3a';
        ell(x, cos(a) * 66 * d, -112 + sin(a) * 48 * d, 2.6, 1.3, a); x.fill();
      }
    },
    live(ctx, bx, by, o, t, v, s) {
      // falling petals
      const ph = hseed(o, 9) * 10;
      ctx.fillStyle = '#ffd0e0';
      for (let i = 0; i < 4; i++) {
        const u = ((t * 0.16 + ph + i * 0.27) % 1);
        const x0 = bx + (U.hash(i, o.x | 0, 4) - 0.5) * 110;
        const y0 = by - 120 + U.hash(i, o.y | 0, 5) * 40;
        const x1 = x0 + u * 36 + sin(u * 12 + i) * 7;
        const y1 = y0 + u * 120;
        ctx.globalAlpha = min(1, u * 6, (1 - u) * 4) * 0.9;
        ctx.beginPath(); ctx.ellipse(x1, y1, 2.4, 1.4, u * 9 + i, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  });

  // ============================================================================================
  // tree_pine — tiered needle pads on a straight trunk
  // ============================================================================================
  {
    const id = 'tree_pine';
    const base = (v) => spr(id + '_b' + v, 140, 210, 70, 190, (x) => {
      const r = R(400 + v);
      gshadow(x, 10, 2, 56, 17, 0.32);
      gshadow(x, 2, 0, 18, 7, 0.45);
      const tp = taperP(0, 3, 0, -170, 15, 6, (r() - 0.5) * 4);
      barkFill(x, tp, [-8, -170, 8, 3], BARK.red, r, { dens: 0.08, len: 6, horiz: true });
      const f = [];
      for (let i = 0; i < 6; i++) {
        const y = -60 - i * 20, s = i % 2 ? 1 : -1;
        branchSegs(r, f, 0, y, -PI / 2 + s * (1.0 + r() * 0.3), 24 - i * 2, 4, 0, {});
      }
      limbs(x, f, BARK.red);
    });
    const can = (v) => spr(id + '_c' + v, 200, 236, 100, 228, (x, c) => {
      const r = R(410 + v * 7);
      const P = [LEAF.pine, palMix(LEAF.pine, '#4b7a3a', 0.2), palMix(LEAF.pine, '#1e4a5a', 0.2)][v];
      const cl = [];
      const tiers = 6;
      for (let i = 0; i < tiers; i++) {
        const f = i / (tiers - 1);
        const y = -58 - i * 27 - f * f * 10;
        const W = 66 * (1 - f * 0.78) + 6;
        const cnt = i < 2 ? 3 : i < 4 ? 2 : 1;
        for (let j = 0; j < cnt; j++) {
          const u = cnt === 1 ? 0 : (j / (cnt - 1) - 0.5) * 2;
          cl.push({ x: u * W * 0.62 + (r() - 0.5) * 6, y: y + abs(u) * 6 + (r() - 0.5) * 5, r: (W * (cnt === 1 ? 0.75 : 0.55)) * (0.9 + r() * 0.2), sq: 0.55 });
        }
      }
      cl.push({ x: 0, y: -210, r: 11, sq: 1.1 });
      paintCanopy(x, cl, P, r, { leaf: 'needle', n: 14, amp: 0.4, spiky: true, dens: 2.0, outline: 3.5, shy: 6 });
      canopyPost(x, c, P, -222, -40, 0, 70);
      // pine cones
      for (let i = 0; i < 4; i++) {
        const cx = (r() - 0.5) * 70, cy = -70 - r() * 80;
        x.fillStyle = '#6a3f22'; ell(x, cx, cy, 2.6, 3.6); x.fill();
        x.fillStyle = '#9a6a3a'; ell(x, cx - 0.8, cy - 1, 1.2, 1.6); x.fill();
      }
    });
    def(id, {
      w: 1, h: 1, solid: true, anim: true,
      draw(ctx, px, py, o, t) {
        const v = vary(o, 3), bx = px + 32, by = py + 54;
        blitS(ctx, base(v), bx, by);
        blitSway(ctx, can(v), bx, by, windK(t, o, 2.4));
      },
    });
  }

  // ============================================================================================
  // tree_dead — bare gnarled grey tree
  // ============================================================================================
  {
    const id = 'tree_dead';
    const sp = (v) => spr(id + v, 190, 210, 95, 195, (x, c) => {
      const r = R(500 + v * 13);
      gshadow(x, 8, 2, 46, 13, 0.32);
      gshadow(x, 2, 0, 16, 6, 0.45);
      const segs = [];
      for (let i = 0; i < 4; i++) {
        const s = i < 2 ? -1 : 1;
        segs.push({ p: taperP(s * 2, -12, s * (11 + r() * 9), 3 + r() * 3, 9, 2, s * 3), x0: 0, y0: -12, x1: s * 14, y1: 3, w0: 9, w1: 2 });
      }
      const tips = [];
      branchSegs(r, segs, 0, 2, -PI / 2 + (r() - 0.5) * 0.2, 62, 17, 4, { spread: 0.55, lenK: 0.68, taper: 0.6, tri: 0.3, tips, up: 0.08 });
      limbs(x, segs, BARK.dead);
      // knots & cracks on trunk
      x.strokeStyle = rgba(BARK.dead.line, 0.6); x.lineWidth = 1;
      for (let i = 0; i < 6; i++) { const yy = -10 - r() * 45; x.beginPath(); x.moveTo(-4 + r() * 3, yy); x.quadraticCurveTo(0, yy - 6, 2 + r() * 3, yy - 12); x.stroke(); }
      x.fillStyle = BARK.dead.line; ell(x, 1, -38, 2.8, 4); x.fill();
      // hanging moss strands
      x.strokeStyle = rgba('#8a9a7a', 0.6); x.lineWidth = 1;
      for (const tp of tips) if (tp[2] === 1 && r() < 0.35) { x.beginPath(); x.moveTo(tp[0], tp[1]); x.quadraticCurveTo(tp[0] + 2, tp[1] + 8, tp[0] - 1, tp[1] + 14 + r() * 10); x.stroke(); }
      rim(c, -3, 0, '#b8c4e0', 0.35, -1, 0);
    });
    def(id, {
      w: 1, h: 1, solid: true, anim: false,
      draw(ctx, px, py, o) { blitS(ctx, sp(vary(o, 3)), px + 32, py + 54); },
    });
  }

  // ============================================================================================
  // tree_cypress — giant 紅檜 (2x2): massive buttressed red trunk, layered crown, silver snag
  // ============================================================================================
  {
    const id = 'tree_cypress';
    const base = (v) => spr(id + '_b' + v, 300, 300, 150, 270, (x) => {
      const r = R(600 + v);
      const B = BARK.red;
      gshadow(x, 14, -6, 132, 34, 0.35);
      gshadow(x, 0, -6, 60, 16, 0.4);
      // buttress roots
      const segs = [];
      for (let i = 0; i < 7; i++) {
        const s = (i / 6 - 0.5) * 2;
        const ex = s * (56 + r() * 10), ey = -6 + abs(s) * -6 + r() * 6 + (abs(s) < 0.4 ? 8 : 0);
        segs.push({ p: taperP(s * 14, -54, ex, ey, 30, 6, s * 6), x0: s * 14, y0: -54, x1: ex, y1: ey, w0: 30, w1: 6 });
      }
      limbs(x, segs, B);
      // the trunk: a broad tapered column with fluted outline
      const tp = new Path2D();
      tp.moveTo(-44, -6);
      tp.bezierCurveTo(-30, -40, -30, -110, -24, -250);
      tp.lineTo(22, -250);
      tp.bezierCurveTo(28, -120, 30, -40, 46, -6);
      tp.quadraticCurveTo(0, 4, -44, -6);
      tp.closePath();
      barkFill(x, tp, [-44, -250, 46, 0], B, r, { dens: 0.09, len: 30, lw: 2.2 });
      // deep vertical fluting
      x.save(); x.clip(tp);
      for (let i = 0; i < 9; i++) {
        const xx = -36 + i * 9 + (r() - 0.5) * 4;
        x.strokeStyle = rgba(B.line, 0.45); x.lineWidth = 2.2;
        x.beginPath(); x.moveTo(xx, 0); x.bezierCurveTo(xx * 0.8, -60, xx * 0.6 + (r() - 0.5) * 6, -150, xx * 0.55, -250); x.stroke();
        x.strokeStyle = rgba(B.hi, 0.18); x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(xx + 2.5, 0); x.bezierCurveTo(xx * 0.8 + 2.5, -60, xx * 0.6 + 2.5, -150, xx * 0.55 + 2, -250); x.stroke();
      }
      // moss & ferns on the lower trunk
      for (let i = 0; i < 40; i++) {
        const xx = -40 + r() * 80, yy = -4 - r() * 50 * r();
        x.fillStyle = r() < 0.5 ? '#4f7a33' : '#6b9a3e';
        ell(x, xx, yy, 2 + r() * 3, 1.4 + r() * 2); x.fill();
      }
      x.restore();
      atop(x, vgrad(x, -250, -170, [[0, 'rgba(8,20,16,0.6)'], [1, 'rgba(8,20,16,0)']]), -150, -270, 300, 120);
      atop(x, vgrad(x, -30, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(10,20,10,0.4)']]), -150, -30, 300, 34);
      // ferns at the foot
      for (let i = 0; i < 5; i++) fernTuft(x, r, -60 + i * 30 + (r() - 0.5) * 10, -2 + r() * 6, 0.7 + r() * 0.3);
    });
    const can = (v) => spr(id + '_c' + v, 340, 300, 170, 450, (x, c) => {
      const r = R(620 + v * 5);
      const P = [LEAF.cypress, palMix(LEAF.cypress, '#3c6a3a', 0.2), palMix(LEAF.cypress, '#2a4f5e', 0.18)][v];
      // limbs reaching out
      const f = [];
      for (let i = 0; i < 7; i++) {
        const s = i % 2 ? 1 : -1, y = -232 - i * 22;
        branchSegs(r, f, s * 6, y, -PI / 2 + s * (1.0 + r() * 0.3), 74 - i * 7, 13 - i * 1.2, 1, { spread: 0.35, taper: 0.55 });
      }
      // silver dead snag at the crown (old 紅檜 often lose their top)
      const snag = [];
      branchSegs(r, snag, -4, -380, -PI / 2 - 0.15, 60, 9, 2, { spread: 0.6, lenK: 0.55 });
      limbs(x, snag, BARK.dead);
      limbs(x, f, BARK.red);
      // irregular flat-topped clumps sitting on the big limbs, with gaps showing the limbs
      const cl = [];
      const pads = [[-96, -244, 46], [94, -258, 48], [-58, -226, 40], [56, -232, 40], [-60, -296, 50], [62, -310, 50], [-4, -266, 44], [-30, -350, 44], [34, -356, 42], [-2, -318, 40], [6, -394, 30]];
      for (const [px, py, rr] of pads) cl.push({ x: px + (r() - 0.5) * 10, y: py + (r() - 0.5) * 8, r: rr * (0.9 + r() * 0.2), sq: 0.6 });
      paintCanopy(x, cl, P, r, { leaf: 'scale', n: 11, amp: 0.36, dens: 1.3, shy: 7 });
      canopyPost(x, c, P, -420, -200, 0, 140);
    });
    def(id, {
      w: 2, h: 2, solid: true, anim: true,
      draw(ctx, px, py, o, t) {
        const v = vary(o, 3), bx = px + 64, by = py + 118;
        blit(ctx, base(v), bx, by);
        blitSway(ctx, can(v), bx, by, windK(t, o, 3), 4);
      },
    });
  }
  // small fern tuft used around trunks (painted into caches)
  function fernTuft(x, r, cx, cy, s = 1) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = -PI / 2 + (i / (n - 1) - 0.5) * 2.6;
      const L = (16 + r() * 8) * s;
      const ex = cx + cos(a) * L, ey = cy + sin(a) * L * 0.7;
      const mx = cx + cos(a) * L * 0.5, my = cy + sin(a) * L * 0.5 - 6 * s;
      x.strokeStyle = '#2e5a2a'; x.lineWidth = 1.4;
      x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(mx, my, ex, ey); x.stroke();
      for (let k = 1; k < 8; k++) {
        const u = k / 8;
        const qx = (1 - u) * (1 - u) * cx + 2 * u * (1 - u) * mx + u * u * ex;
        const qy = (1 - u) * (1 - u) * cy + 2 * u * (1 - u) * my + u * u * ey;
        const lw = (1 - u) * 4.5 * s + 1;
        x.fillStyle = u < 0.5 ? '#5f9a43' : '#4c8338';
        ell(x, qx - lw * 0.7, qy - 1, lw, 1.3, a - 0.9); x.fill();
        ell(x, qx + lw * 0.7, qy - 1, lw, 1.3, a + 0.9); x.fill();
      }
    }
  }

  // ============================================================================================
  // tree_banyan — 榕樹 (3x3): fused trunks, aerial roots, vast dome canopy
  // footprint 192x192; solid: centre cell + bottom row. The top row lies under the canopy (walk behind).
  // ============================================================================================
  {
    const id = 'tree_banyan';
    const B = BARK.grey;
    const base = (v) => spr(id + '_b' + v, 340, 230, 170, 24, (x) => {
      // anchor = footprint top-centre (96, 0)
      const r = R(700 + v);
      gshadow(x, 16, 140, 170, 56, 0.34);
      gshadow(x, 4, 158, 80, 26, 0.4);
      // aerial prop roots that reached the ground: bundles of twisted strands, thick at the foot
      const props = [[-80, 172, 10, -70], [84, 176, 11, 74], [-118, 150, 6, -104], [120, 152, 6, 104]];
      const PB = { line: '#2a2520', dark: '#5a5248', mid: '#7e7466', light: '#a89c88', hi: '#d2c6b0' };
      for (const [bx0, by0, w, tx] of props) {
        const ns = 1 + floor(r() * 2);
        for (let k = 0; k < ns; k++) {
          const ww = w * (1 - k * 0.25), ox = (k - (ns - 1) / 2) * w * 0.7;
          const pp = taperP(bx0 + ox, by0 + 2, tx + ox * 1.8 + (r() - 0.5) * 10, 0 + r() * 16, ww * 1.6, ww * 0.5, (r() - 0.5) * 26);
          barkFill(x, pp, [bx0 + ox - ww, 0, bx0 + ox + ww, by0], PB, r, { dens: 0.05, len: 16, lw: 1.5 });
        }
        gshadow(x, bx0 + 3, by0 + 2, w * 2.2, 4, 0.35);
      }
      // root flare of the main trunk
      const rs = [];
      for (let i = 0; i < 8; i++) {
        const sx = (i / 7 - 0.5) * 2;
        rs.push({ p: taperP(sx * 22, 146, sx * 64 + (r() - 0.5) * 10, 176 + r() * 6, 20, 4, sx * 5), x0: sx * 22, y0: 146, x1: sx * 64, y1: 178, w0: 20, w1: 4 });
      }
      limbs(x, rs, B);
      // main fused trunk mass: several twisting stems, back to front
      const stems = [[-30, -18, 26, 1], [32, 22, 26, -1], [-12, -26, 30, -1], [14, 10, 30, 1], [0, 2, 26, 1]];
      for (const [bx0, tx, w, s2] of stems) {
        const p = taperP(bx0, 174, tx + (r() - 0.5) * 8, 14, w + 6, w * 0.7, s2 * 12);
        barkFill(x, p, [bx0 - w * 0.6, 14, bx0 + w * 0.6, 176], B, r, { dens: 0.04, len: 26, lw: 2 });
      }
      // knots / burls
      for (let i = 0; i < 4; i++) {
        const kx = (r() - 0.5) * 50, ky = 60 + r() * 90;
        x.fillStyle = rgba(B.line, 0.5); ell(x, kx, ky, 4 + r() * 3, 3 + r() * 2); x.fill();
        x.strokeStyle = rgba(B.hi, 0.35); x.lineWidth = 1; x.beginPath(); x.arc(kx - 1, ky - 1, 4, PI, PI * 1.6); x.stroke();
      }
      atop(x, vgrad(x, 6, 70, [[0, 'rgba(8,20,14,0.6)'], [1, 'rgba(8,20,14,0)']]), -170, -24, 340, 100);
      atop(x, vgrad(x, 150, 188, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(10,20,10,0.4)']]), -170, 150, 340, 40);
      // hanging aerial-root curtains (thin, not reaching the ground), in bundles
      for (let i = 0; i < 16; i++) {
        const hx0 = (r() - 0.5) * 300, hy0 = -10 + abs(hx0) * 0.12 + r() * 10;
        const Lb = (40 + r() * 90) * (1 - abs(hx0) / 260);
        for (let k = 0; k < 4; k++) {
          const hx = hx0 + (r() - 0.5) * 10, L = Lb * (0.6 + r() * 0.5);
          x.strokeStyle = k % 2 ? '#7d7062' : '#5a5046'; x.lineWidth = 0.8 + r() * 1.2;
          x.beginPath(); x.moveTo(hx, hy0); x.bezierCurveTo(hx + (r() - 0.5) * 6, hy0 + L * 0.4, hx + (r() - 0.5) * 8, hy0 + L * 0.7, hx + (r() - 0.5) * 4, hy0 + L); x.stroke();
        }
      }
      for (let i = 0; i < 6; i++) fernTuft(x, r, -90 + i * 36 + (r() - 0.5) * 10, 182 + r() * 4, 0.6);
    });
    // canopy sprite anchored at the trunk base (footprint y=150) so the skew-sway grows with height
    const OY = -150;
    const can = (v) => spr(id + '_c' + v, 380, 270, 190, 340, (x, c) => {
      const r = R(720 + v * 9);
      const P = [LEAF.banyan, palMix(LEAF.banyan, '#3f7a2a', 0.18), palMix(LEAF.banyan, '#1c5050', 0.15)][v];
      const cl = rowsClusters(r, 0, OY - 64, 160, 90, [[-0.76, 3, 0.25], [-0.4, 4, 0.27], [-0.02, 5, 0.26], [0.36, 5, 0.25], [0.7, 4, 0.22]], { sq: 0.8, spread: 0.84 });
      paintCanopy(x, cl, P, r, {
        leaf: 'leaf', leafL: 2.8, dens: 1.25, n: 10, amp: 0.3,
        mid: (xx) => {
          const f = [];
          for (let i = 0; i < 7; i++) branchSegs(r, f, (i - 3) * 14, OY + 20, -PI / 2 + (i - 3) * 0.32, 60, 10, 1, { spread: 0.45 });
          limbs(xx, f, B);
        },
      });
      canopyPost(x, c, P, OY - 160, OY + 34, 0, 160);
    });
    def(id, {
      w: 3, h: 3, anim: true,
      solidAt: (o, dx, dy) => dy === 2 || (dy === 1 && dx === 1),
      solid: true,
      draw(ctx, px, py, o, t) {
        const v = vary(o, 3), bx = px + 96, by = py;
        blit(ctx, base(v), bx, by);
        blitSway(ctx, can(v), bx, by + 150, windK(t, o, 2.2), 3);
      },
    });
  }

  // ============================================================================================
  // tree_cedar_snow — 玉山圓柏: wind-bent juniper with snow on its flattened layers
  // ============================================================================================
  {
    const id = 'tree_cedar_snow';
    const sp = (v) => spr(id + v, 230, 220, 90, 196, (x, c) => {
      const r = R(800 + v * 3);
      const P = [LEAF.juniper, palMix(LEAF.juniper, '#3d5a3a', 0.2), palMix(LEAF.juniper, '#24485c', 0.2)][v];
      gshadow(x, 26, 2, 70, 16, 0.3, '30,40,60');
      // snow drift at the base
      x.fillStyle = '#e8f0f8';
      x.beginPath(); x.ellipse(6, 2, 34, 9, 0, 0, TAU); x.fill();
      x.fillStyle = '#c4d2e4'; x.beginPath(); x.ellipse(12, 4, 26, 5, 0, 0, PI); x.fill();
      // twisted leaning trunk (bent by the prevailing wind toward +x)
      const segs = [];
      const pts = [[0, 0], [-6, -34], [8, -64], [36, -92], [62, -112]];
      for (let i = 0; i < pts.length - 1; i++) {
        const w0 = 18 - i * 3.5, w1 = 18 - (i + 1) * 3.5;
        segs.push({ p: taperP(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w0, w1, (i % 2 ? 1 : -1) * 4), x0: pts[i][0], y0: pts[i][1], x1: pts[i + 1][0], y1: pts[i + 1][1], w0, w1 });
      }
      // dead silver limbs
      const dead = [];
      branchSegs(r, dead, -4, -40, -PI / 2 - 0.9, 34, 5, 1, { spread: 0.5 });
      branchSegs(r, dead, 6, -70, -PI / 2 - 0.4, 30, 4, 1, { spread: 0.5 });
      limbs(x, dead, BARK.dead);
      limbs(x, segs, BARK.juniper);
      // spiral bark grain
      x.strokeStyle = rgba(BARK.juniper.line, 0.5); x.lineWidth = 1;
      for (let i = 0; i < 9; i++) { const yy = -8 - i * 9; x.beginPath(); x.moveTo(-8 + i * 2.6, yy); x.quadraticCurveTo(i * 3, yy - 8, 8 + i * 3.4, yy - 14); x.stroke(); }
      // flattened foliage shelves streaming downwind (+x)
      const cl = [];
      const shelves = [[-10, -60, 34], [30, -78, 40], [70, -98, 44], [-18, -98, 26], [16, -116, 38], [60, -132, 40], [100, -116, 30], [34, -150, 30], [86, -150, 26]];
      for (const [sx, sy, rr] of shelves) cl.push({ x: sx + (r() - 0.5) * 6, y: sy + (r() - 0.5) * 6, r: rr * (0.9 + r() * 0.2), sq: 0.45 });
      paintCanopy(x, cl, P, r, { leaf: 'needle', n: 16, amp: 0.22, dens: 2.2, shy: 5, edgeK: 1.6 });
      // snow caps on each shelf top
      cl.forEach((cc) => {
        const rr = cc.r;
        x.save();
        x.clip(cc.path);
        const sg = x.createLinearGradient(0, cc.y - rr * 0.5, 0, cc.y - rr * 0.1);
        sg.addColorStop(0, '#ffffff'); sg.addColorStop(1, '#c8d8ee');
        x.fillStyle = sg;
        x.fill(scallopP(cc.x - rr * 0.15, cc.y - rr * 0.46, rr * 0.7, rr * 0.2, 7, 0.3, r));
        x.fillStyle = 'rgba(150,175,215,0.55)';
        x.fill(scallopP(cc.x + rr * 0.15, cc.y - rr * 0.3, rr * 0.4, rr * 0.06, 6, 0.3, r));
        // loose snow clumps on the needles
        for (let k = 0; k < 6; k++) { x.fillStyle = k % 2 ? '#ffffff' : '#dce8f6'; ell(x, cc.x + (r() - 0.5) * rr * 1.4, cc.y - rr * (0.1 + r() * 0.3), 2 + r() * 2, 1.2 + r()); x.fill(); }
        x.restore();
      });
      rim(c, -3, 0, '#d8ecff', 0.4, -1, 0);
    });
    def(id, {
      w: 1, h: 1, solid: true, anim: true,
      draw(ctx, px, py, o, t) { blitSway(ctx, sp(vary(o, 3)), px + 30, py + 54, windK(t, o, 1.4) + 0.6); },
    });
  }

  // ============================================================================================
  // shared plant helpers
  // ============================================================================================
  function qpt(x0, y0, qx, qy, x1, y1, u) {
    const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    return [a * x0 + b * qx + c * x1, a * y0 + b * qy + c * y1, 2 * (1 - u) * (qx - x0) + 2 * u * (x1 - qx), 2 * (1 - u) * (qy - y0) + 2 * u * (y1 - qy)];
  }
  // lens-shaped leaf from (x0,y0) to (x1,y1), half-width w, bowed by `bend`
  function leafP(x0, y0, x1, y1, w, bend = 0) {
    const dx = x1 - x0, dy = y1 - y0, L = hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const mx = (x0 + x1) / 2 + nx * bend, my = (y0 + y1) / 2 + ny * bend;
    const p = new Path2D();
    p.moveTo(x0, y0);
    p.quadraticCurveTo(mx + nx * w * 1.3, my + ny * w * 1.3, x1, y1);
    p.quadraticCurveTo(mx - nx * w * 1.3, my - ny * w * 1.3, x0, y0);
    p.closePath();
    return p;
  }
  // pinnate frond (palms, tree ferns): leaflets on both sides of a quadratic rachis, drooping
  function frond(x, x0, y0, qx, qy, x1, y1, o) {
    const n = o.n || 18, L = o.len || 18, W = o.w || 2.2, droop = o.droop == null ? 0.6 : o.droop, ang = o.ang || 0.95;
    const C = o.cols;   // { line, dark, mid, light, hi, rachis }
    const lv = [];
    for (let k = 1; k <= n; k++) {
      const u = k / (n + 1);
      const [px, py, tx, ty] = qpt(x0, y0, qx, qy, x1, y1, u);
      const tl = hypot(tx, ty) || 1, dx = tx / tl, dy = ty / tl;
      const len = L * (o.shape ? o.shape(u) : 0.25 + 0.75 * sin(PI * (0.1 + 0.85 * u)));
      for (const sd of [-1, 1]) {
        const th = sd * ang;
        let ex = dx * cos(th) - dy * sin(th), ey = dx * sin(th) + dy * cos(th) + droop;
        const el = hypot(ex, ey) || 1; ex /= el; ey /= el;
        lv.push({ px, py, ex: px + ex * len, ey: py + ey * len, up: ey < -0.15, u, sd });
      }
    }
    // upper-surface (lit) leaflets last
    lv.sort((a, b) => (a.up - b.up) || (a.u - b.u));
    for (const l of lv) {
      const p = leafP(l.px, l.py, l.ex, l.ey, W * (1 - l.u * 0.35), l.sd * W * 0.6);
      x.strokeStyle = C.line; x.lineWidth = 1; x.stroke(p);
      x.fillStyle = l.up ? (l.u < 0.55 ? C.light : C.mid) : (l.u < 0.5 ? C.mid : C.dark);
      x.fill(p);
      if (l.up && l.u < 0.5) { x.strokeStyle = rgba(C.hi, 0.5); x.lineWidth = 0.7; x.beginPath(); x.moveTo(l.px, l.py); x.lineTo((l.px + l.ex) / 2, (l.py + l.ey) / 2 - 0.5); x.stroke(); }
    }
    x.strokeStyle = C.rachis || C.dark; x.lineWidth = o.rw || 1.8;
    x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo(qx, qy, x1, y1); x.stroke();
  }
  // a curved grass blade (filled, tapered)
  function blade(x, bx, by, qx, qy, tx, ty, w, col, line) {
    const p = new Path2D();
    p.moveTo(bx - w / 2, by);
    p.quadraticCurveTo(qx - w * 0.35, qy, tx, ty);
    p.quadraticCurveTo(qx + w * 0.35, qy, bx + w / 2, by);
    p.closePath();
    if (line) { x.strokeStyle = line; x.lineWidth = 1; x.stroke(p); }
    x.fillStyle = col; x.fill(p);
  }
  const GR = { line: '#1f3a1a', dark: '#2f5a26', mid: '#4a8233', light: '#74ad45', hi: '#b6dc78' };
  function grassTuft(x, r, cx, cy, n, h, spread, cols = GR, o = {}) {
    const bl = [];
    for (let i = 0; i < n; i++) {
      const u = (r() - 0.5) * 2;
      const bh = h * (0.55 + r() * 0.5);
      const lean = u * spread + (r() - 0.5) * 8;
      bl.push({ bx: cx + u * (o.base || 6), bh, lean, d: r() });
    }
    bl.sort((a, b) => a.d - b.d);
    for (const b of bl) {
      const col = b.d < 0.3 ? cols.dark : b.d < 0.65 ? cols.mid : b.d < 0.9 ? cols.light : cols.hi;
      const arch = o.arch || 0;
      blade(x, b.bx, cy, b.bx + b.lean * 0.3, cy - b.bh * (0.7 + arch * 0.5), b.bx + b.lean * (1 + arch), cy - b.bh * (1 - arch * 0.55), o.w || 2.6, col, o.line ? cols.line : null);
    }
  }

  // ============================================================================================
  // PALMS & TROPICAL: tree_betel, coconut_palm, tree_banana, tree_fern, pandanus, bamboo
  // ============================================================================================
  const PALM = { line: '#1a3316', dark: '#2e5a22', mid: '#4b8a2f', light: '#79b443', hi: '#c4e27e', rachis: '#6f8a3a' };
  function ringedTrunk(x, pts, w0, w1, B, ringGap, r) {
    // pts: bezier [x0,y0, c1x,c1y, c2x,c2y, x1,y1]
    const [x0, y0, c1x, c1y, c2x, c2y, x1, y1] = pts;
    const N = 24, L = [], Rr = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), d = u ** 3;
      const px = a * x0 + b * c1x + c * c2x + d * x1, py = a * y0 + b * c1y + c * c2y + d * y1;
      const w = (w0 + (w1 - w0) * u) / 2 * (i === 0 ? 1.25 : 1);
      L.push([px - w, py]); Rr.push([px + w, py]);
    }
    const p = new Path2D();
    p.moveTo(L[0][0], L[0][1]);
    for (const q of L) p.lineTo(q[0], q[1]);
    for (let i = Rr.length - 1; i >= 0; i--) p.lineTo(Rr[i][0], Rr[i][1]);
    p.closePath();
    const g = x.createLinearGradient(min(x0, x1) - w0, 0, max(x0, x1) + w0, 0);
    g.addColorStop(0, B.light); g.addColorStop(0.4, B.mid); g.addColorStop(1, B.dark);
    x.fillStyle = g; x.fill(p);
    // growth rings
    x.save(); x.clip(p);
    const len = abs(y1 - y0);
    for (let yy = 0; yy < len; yy += ringGap * (0.8 + r() * 0.4)) {
      const u = yy / len, i = min(N, floor(u * N));
      const cx = (L[i][0] + Rr[i][0]) / 2, ww = (Rr[i][0] - L[i][0]) / 2, cy = L[i][1];
      x.strokeStyle = rgba(B.line, 0.45); x.lineWidth = 1.1;
      x.beginPath(); x.ellipse(cx, cy, ww, ww * 0.28, 0, 0, PI); x.stroke();
      x.strokeStyle = rgba(B.hi, 0.35); x.lineWidth = 0.8;
      x.beginPath(); x.ellipse(cx, cy - 1.5, ww, ww * 0.28, 0, 0.2, PI * 0.6); x.stroke();
    }
    x.restore();
    x.strokeStyle = B.line; x.lineWidth = 1.4; x.stroke(p);
    return [x1, y1];
  }
  function crown(x, cx, cy, fr, n, Lf, r, o = {}) {
    const fronds = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.4;
      const dx = cos(a), dy = sin(a) * 0.55;
      const L = Lf * (0.85 + r() * 0.3);
      const lift = o.lift == null ? 0.45 : o.lift;
      const tip = [cx + dx * L, cy + dy * L + L * (o.drop == null ? 0.3 : o.drop) + (dy > 0 ? L * 0.15 : 0)];
      const q = [cx + dx * L * 0.5, cy + dy * L * 0.5 - L * lift];
      fronds.push({ tip, q, dy });
    }
    fronds.sort((a, b) => a.dy - b.dy);
    for (const f of fronds) frond(x, cx, cy, f.q[0], f.q[1], f.tip[0], f.tip[1], Object.assign({ cols: fr }, o.frond || {}));
  }

  // ---- tree_betel 檳榔 -------------------------------------------------------------------
  {
    const id = 'tree_betel';
    const B = { line: '#2c3326', dark: '#5e6656', mid: '#8b917c', light: '#b5b8a2', hi: '#e2e2cc' };
    const sp = (v) => spr(id + v, 170, 290, 85, 270, (x) => {
      const r = R(900 + v * 5);
      const H = 196 + v * 10, lean = (v - 1) * 8;
      gshadow(x, 18, 2, 44, 10, 0.3);
      gshadow(x, 1, 0, 9, 4, 0.5);
      const top = ringedTrunk(x, [0, 0, lean * 0.2, -H * 0.35, lean * 0.7, -H * 0.7, lean, -H], 9, 6.5, B, 7, r);
      // smooth green crownshaft
      const cs = taperP(top[0], top[1] + 2, top[0] + 1, top[1] - 26, 9, 7, 0.5);
      const g = x.createLinearGradient(top[0] - 5, 0, top[0] + 5, 0);
      g.addColorStop(0, '#9ccf5a'); g.addColorStop(0.5, '#5f9a34'); g.addColorStop(1, '#2f5a20');
      x.fillStyle = g; x.fill(cs); x.strokeStyle = '#1e3a16'; x.lineWidth = 1.2; x.stroke(cs);
      // nut cluster (檳榔子)
      for (let i = 0; i < 12; i++) {
        const nx = top[0] + 6 + (r() - 0.3) * 12, ny = top[1] - 2 + r() * 12;
        x.fillStyle = '#2b4a1a'; ell(x, nx, ny, 3.2, 3.8); x.fill();
        x.fillStyle = r() < 0.3 ? '#e09a2a' : '#6aa23a'; ell(x, nx - 0.4, ny - 0.4, 2.4, 3); x.fill();
        x.fillStyle = 'rgba(255,255,220,0.5)'; ell(x, nx - 1, ny - 1.4, 0.8, 1); x.fill();
      }
      crown(x, top[0] + 1, top[1] - 26, PALM, 10, 58, r, { lift: 0.5, drop: 0.25, frond: { n: 20, len: 19, w: 2.5, ang: 1.0, droop: 0.8 } });
    });
    def(id, {
      w: 1, h: 1, solid: true, anim: true,
      draw(ctx, px, py, o, t) { blitSway(ctx, sp(vary(o, 3)), px + 32, py + 54, windK(t, o, 4.5), 4); },
    });
  }

  // ---- coconut_palm ----------------------------------------------------------------------
  {
    const id = 'coconut_palm';
    const B = { line: '#2e2418', dark: '#5a4a36', mid: '#86735a', light: '#ad9a7c', hi: '#dccaa8' };
    const sp = (v) => spr(id + v, 270, 300, 110, 280, (x) => {
      const r = R(950 + v * 3);
      const s = v === 1 ? -1 : 1, H = 200 + v * 8;
      gshadow(x, 30 * s + 10, 2, 70, 16, 0.28);
      gshadow(x, 2, 0, 12, 5, 0.5);
      const top = ringedTrunk(x, [0, 0, 4 * s, -H * 0.4, 30 * s, -H * 0.75, 44 * s, -H], 16, 10, B, 6, r);
      // coconuts
      for (let i = 0; i < 6; i++) {
        const cx = top[0] + (r() - 0.5) * 18, cy = top[1] + 4 + r() * 8;
        x.fillStyle = '#2a3a14'; ell(x, cx, cy, 6, 6.4); x.fill();
        const g = x.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, 6);
        g.addColorStop(0, i % 3 === 0 ? '#c8a050' : '#9cc050'); g.addColorStop(1, i % 3 === 0 ? '#6a4a1a' : '#4a7020');
        x.fillStyle = g; ell(x, cx, cy, 5.2, 5.6); x.fill();
      }
      const C = { line: '#1d3416', dark: '#3a6524', mid: '#5f9634', light: '#8cc04c', hi: '#d2ec8a', rachis: '#8a9a40' };
      crown(x, top[0], top[1], C, 13, 92, r, { lift: 0.5, drop: 0.32, frond: { n: 30, len: 25, w: 2.7, ang: 1.05, droop: 0.75, rw: 2.4 } });
    });
    def(id, {
      w: 1, h: 1, solid: true, anim: true,
      draw(ctx, px, py, o, t) { blitSway(ctx, sp(vary(o, 3)), px + 32, py + 54, windK(t, o, 5), 4); },
    });
  }

  // ---- tree_banana -----------------------------------------------------------------------
  {
    const id = 'tree_banana';
    const LB = { line: '#1d3a12', dark: '#3d7222', mid: '#5f9c2e', light: '#8cc63e', hi: '#d6ef8e', rib: '#d8e49a' };
    function bananaLeaf(x, x0, y0, qx, qy, x1, y1, w, r, dry) {
      const C = dry ? { line: '#3a2a12', dark: '#6a4a20', mid: '#93703a', light: '#b8955a', hi: '#dcc08a', rib: '#c8b080' } : LB;
      const N = 14, Ls = [], Rs = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const [px, py, tx, ty] = qpt(x0, y0, qx, qy, x1, y1, u);
        const tl = hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
        const ww = w * sin(PI * min(1, u * 1.05)) ** 0.6 * (u < 0.08 ? u / 0.08 : 1);
        Ls.push([px + nx * ww, py + ny * ww, px, py, nx, ny]); Rs.push([px - nx * ww * 0.85, py - ny * ww * 0.85]);
      }
      const half = (pts, lit) => {
        const p = new Path2D();
        p.moveTo(x0, y0);
        for (const q of pts) p.lineTo(q[0], q[1]);
        for (let i = N; i >= 0; i--) p.lineTo(Ls[i][2], Ls[i][3]);
        p.closePath();
        const g = x.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, lit ? C.light : C.mid); g.addColorStop(1, lit ? C.mid : C.dark);
        x.fillStyle = g; x.fill(p);
        x.strokeStyle = C.line; x.lineWidth = 1.2; x.stroke(p);
        return p;
      };
      const pa = half(Ls, true), pb = half(Rs, false);
      // lateral veins + wind tears
      x.save(); x.clip(pa);
      for (let i = 1; i < N; i++) {
        const q = Ls[i];
        x.strokeStyle = rgba(C.hi, 0.35); x.lineWidth = 0.7;
        x.beginPath(); x.moveTo(q[2], q[3]); x.lineTo(q[0] + (x1 - x0) * 0.03, q[1] + (y1 - y0) * 0.03); x.stroke();
        if (r() < 0.35) { x.strokeStyle = rgba(C.line, 0.8); x.lineWidth = 1.3; x.beginPath(); x.moveTo(q[0], q[1]); x.lineTo(q[0] * 0.55 + q[2] * 0.45, q[1] * 0.55 + q[3] * 0.45); x.stroke(); }
      }
      x.restore();
      x.save(); x.clip(pb);
      for (let i = 2; i < N; i += 2) if (r() < 0.4) { const q = Rs[i]; x.strokeStyle = rgba(C.line, 0.7); x.lineWidth = 1.2; x.beginPath(); x.moveTo(q[0], q[1]); x.lineTo(q[0] * 0.5 + Ls[i][2] * 0.5, q[1] * 0.5 + Ls[i][3] * 0.5); x.stroke(); }
      x.restore();
      x.strokeStyle = C.rib; x.lineWidth = 1.6; x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo(qx, qy, x1, y1); x.stroke();
    }
    const sp = (v) => spr(id + v, 200, 190, 100, 172, (x) => {
      const r = R(1000 + v * 7);
      gshadow(x, 10, 2, 56, 14, 0.3);
      // suckers + pseudostem
      const stem = (sx, h, w) => {
        const p = taperP(sx, 2, sx + 2, -h, w, w * 0.75, 1);
        const g = x.createLinearGradient(sx - w / 2, 0, sx + w / 2, 0);
        g.addColorStop(0, '#a6b85a'); g.addColorStop(0.45, '#6f8a36'); g.addColorStop(1, '#3d4f1f');
        x.fillStyle = g; x.fill(p);
        x.save(); x.clip(p);
        for (let i = 0; i < 10; i++) { x.strokeStyle = rgba(r() < 0.5 ? '#5a3a20' : '#2a3a14', 0.45); x.lineWidth = 1 + r(); const yy = -r() * h; x.beginPath(); x.moveTo(sx - w / 2 + r() * w, yy); x.lineTo(sx - w / 2 + r() * w, yy - 6 - r() * 14); x.stroke(); }
        x.restore();
        x.strokeStyle = '#26330f'; x.lineWidth = 1.3; x.stroke(p);
      };
      stem(-14, 26, 9);
      stem(0, 76, 16);
      // leaves: back ones first
      const top = [2, -76];
      const leaves = [];
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = -PI / 2 + (i / (n - 1) - 0.5) * 3.4 + (r() - 0.5) * 0.25;
        const L = 70 + r() * 22;
        const tip = [top[0] + cos(a) * L, top[1] + sin(a) * L * 0.55 + L * 0.42];
        const q = [top[0] + cos(a) * L * 0.45, top[1] + sin(a) * L * 0.45 - 28];
        leaves.push({ tip, q, d: sin(a), dry: i === 0 && v !== 1 });
      }
      leaves.sort((a, b) => a.d - b.d);
      // dry hanging leaf
      if (v !== 1) bananaLeaf(x, top[0] - 3, top[1] + 8, top[0] - 22, top[1] + 4, top[0] - 26, top[1] + 52, 8, r, true);
      for (const l of leaves) bananaLeaf(x, top[0], top[1], l.q[0], l.q[1], l.tip[0], l.tip[1], 13, r, false);
      // small young leaf scroll
      bananaLeaf(x, top[0], top[1], top[0] + 2, top[1] - 26, top[0] + 6, top[1] - 40, 5, r, false);
      if (v === 1 || v === 2) {
        // banana bunch with purple heart
        const bx = top[0] + 14, by = top[1] + 12;
        x.strokeStyle = '#5a6a2a'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(top[0] + 4, top[1] + 2); x.quadraticCurveTo(bx + 4, by - 8, bx + 2, by + 26); x.stroke();
        for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) {
          const hx = bx - 6 + j * 4, hy = by + k * 6;
          x.fillStyle = '#3d5a1a'; ell(x, hx, hy, 2.6, 5.4, -0.5); x.fill();
          x.fillStyle = v === 2 ? '#e2c440' : '#8ab83a'; ell(x, hx - 0.5, hy - 0.5, 1.8, 4.6, -0.5); x.fill();
        }
        const g = x.createLinearGradient(bx, by + 24, bx + 6, by + 40);
        g.addColorStop(0, '#9a2a5a'); g.addColorStop(1, '#4a0f2a');
        x.fillStyle = g; ell(x, bx + 3, by + 34, 5, 9, 0.1); x.fill();
        x.strokeStyle = '#2a0818'; x.lineWidth = 1; x.stroke();
      }
    });
    def(id, {
      w: 1, h: 1, solid: true, anim: true,
      draw(ctx, px, py, o, t) { blitSway(ctx, sp(vary(o, 3)), px + 32, py + 56, windK(t, o, 3.5), 4); },
    });
  }

  // ---- tree_fern 筆筒樹 ------------------------------------------------------------------
  {
    const id = 'tree_fern';
    const C = { line: '#173416', dark: '#2f6a26', mid: '#4f9a34', light: '#82c84a', hi: '#d0f08a', rachis: '#8a7a50' };
    const sp = (v) => spr(id + v, 230, 220, 115, 200, (x) => {
      const r = R(1100 + v * 11);
      const H = 104 + v * 12;
      gshadow(x, 12, 2, 70, 16, 0.3);
      gshadow(x, 1, 0, 11, 4, 0.5);
      // trunk with oval leaf-scar pattern (the 'pen holder' look)
      const tp = taperP(0, 2, (v - 1) * 4, -H, 14, 11, (r() - 0.5) * 4);
      const g = x.createLinearGradient(-7, 0, 7, 0);
      g.addColorStop(0, '#6a5a48'); g.addColorStop(0.45, '#3e3228'); g.addColorStop(1, '#1e1814');
      x.fillStyle = g; x.fill(tp);
      x.save(); x.clip(tp);
      for (let yy = -4; yy > -H; yy -= 7) for (let k = -1; k <= 1; k++) {
        const ox = k * 5 + ((yy / 7) % 2 ? 2.5 : 0);
        x.fillStyle = rgba('#a89a80', 0.55 - abs(k) * 0.12); ell(x, ox, yy, 1.8, 2.6); x.fill();
        x.fillStyle = 'rgba(20,14,10,0.6)'; ell(x, ox + 0.3, yy + 0.3, 0.9, 1.4); x.fill();
      }
      x.restore();
      x.strokeStyle = '#140f0c'; x.lineWidth = 1.3; x.stroke(tp);
      // old dead frond skirt
      const top = [(v - 1) * 4, -H];
      for (let i = 0; i < 5; i++) {
        const a = PI / 2 + (i - 2) * 0.35;
        x.strokeStyle = '#6e5a3a'; x.lineWidth = 1.6;
        x.beginPath(); x.moveTo(top[0], top[1] + 4); x.quadraticCurveTo(top[0] + cos(a) * 18, top[1] + 4, top[0] + cos(a) * 14, top[1] + 28 + r() * 8); x.stroke();
      }
      crown(x, top[0], top[1], C, 12, 76, r, { lift: 0.55, drop: 0.35, frond: { n: 20, len: 15, w: 1.6, ang: 1.3, droop: 0.35, rw: 1.6, shape: (u) => 0.3 + 0.7 * sin(PI * (0.15 + 0.8 * u)) } });
      // fiddleheads (crosiers) unfurling at the top
      for (let i = 0; i < 3; i++) {
        const fx = top[0] + (i - 1) * 7, fy = top[1] - 6;
        const hx = fx + (i - 1) * 6, hy = fy - 16 - r() * 6;
        x.strokeStyle = '#7a6a3a'; x.lineWidth = 2.2;
        x.beginPath(); x.moveTo(fx, fy); x.quadraticCurveTo(fx + (i - 1) * 2, fy - 10, hx, hy); x.stroke();
        x.fillStyle = '#a89262'; ell(x, hx + 1.5, hy, 3.4, 3); x.fill();
        x.strokeStyle = '#5a4a2a'; x.lineWidth = 0.9; x.beginPath(); x.arc(hx + 1.5, hy, 1.6, 0, PI * 1.5); x.stroke();
      }
    });
    def(id, {
      w: 1, h: 1, solid: true, anim: true,
      draw(ctx, px, py, o, t) { blitSway(ctx, sp(vary(o, 3)), px + 32, py + 54, windK(t, o, 3.2), 4); },
    });
  }

  // ---- pandanus 林投 ----------------------------------------------------------------------
  {
    const id = 'pandanus';
    const C = { line: '#1c3318', dark: '#355c26', mid: '#4f7f30', light: '#7aa646', hi: '#c8d880' };
    const B = { line: '#2a2018', dark: '#54442f', mid: '#7a6648', light: '#a38c66', hi: '#cdb88e' };
    function rosette(x, cx, cy, r, n, L) {
      const lv = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + r() * 0.3;
        lv.push({ a, d: sin(a), L: L * (0.75 + r() * 0.4) });
      }
      lv.sort((a, b) => a.d - b.d);
      for (const l of lv) {
        const dx = cos(l.a), dy = sin(l.a) * 0.5;
        const tip = [cx + dx * l.L, cy + dy * l.L + l.L * 0.35];
        const q = [cx + dx * l.L * 0.5, cy + dy * l.L * 0.5 - l.L * 0.35];
        const p = new Path2D();
        const w = 4.6;
        p.moveTo(cx - w * dy, cy - w * 0.6);
        p.quadraticCurveTo(q[0] - w, q[1] - w * 0.5, tip[0], tip[1]);
        p.quadraticCurveTo(q[0] + w, q[1] + w * 0.6, cx + w * dy, cy + w * 0.6);
        p.closePath();
        x.strokeStyle = C.line; x.lineWidth = 1.1; x.stroke(p);
        x.fillStyle = l.d < 0 ? C.mid : (r() < 0.5 ? C.light : C.mid); x.fill(p);
        // pale serrated margin + keel
        x.strokeStyle = rgba(C.hi, 0.6); x.lineWidth = 0.7;
        x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(q[0], q[1], tip[0], tip[1]); x.stroke();
      }
    }
    const sp = (v) => spr(id + v, 190, 170, 95, 152, (x) => {
      const r = R(1200 + v * 9);
      gshadow(x, 10, 2, 56, 14, 0.3);
      // stilt roots
      const segs = [];
      for (let i = 0; i < 6; i++) {
        const bx = (i / 5 - 0.5) * 34, ty = -18 - r() * 8;
        segs.push({ p: taperP(bx, 2, bx * 0.3, ty, 4, 3, (r() - 0.5) * 6), x0: bx, y0: 2, x1: bx * 0.3, y1: ty, w0: 4, w1: 3 });
      }
      limbs(x, segs, B);
      // branching stems ending in rosettes
      const tips = [[-34, -66], [30, -78], [-4, -96], [44, -50]].slice(0, 3 + (v === 2 ? 1 : 0));
      const st = [];
      for (const [tx, ty] of tips) st.push({ p: taperP(0, -20, tx, ty, 8, 5, (r() - 0.5) * 16), x0: 0, y0: -20, x1: tx, y1: ty, w0: 8, w1: 5 });
      limbs(x, st, B);
      tips.sort((a, b) => a[1] - b[1]);
      for (const [tx, ty] of tips) rosette(x, tx, ty, r, 17, 46);
      if (v !== 1) {
        // the pineapple-like fruit
        const [fx, fy] = tips[tips.length - 1];
        const cx = fx + 8, cy = fy + 16;
        const g = x.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, 13);
        g.addColorStop(0, '#ffc860'); g.addColorStop(0.6, '#e8782a'); g.addColorStop(1, '#8a3a12');
        x.fillStyle = '#4a1e0a'; ell(x, cx, cy, 11.5, 13); x.fill();
        x.fillStyle = g; ell(x, cx, cy, 10.5, 12); x.fill();
        x.strokeStyle = 'rgba(90,30,10,0.6)'; x.lineWidth = 0.9;
        for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(cx - 10, cy + i * 4.5); x.quadraticCurveTo(cx, cy + i * 4.5 - 3, cx + 10, cy + i * 4.5); x.stroke(); }
        for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(cx + i * 4.2, cy - 11); x.quadraticCurveTo(cx + i * 4.2 + 2, cy, cx + i * 4.2, cy + 11); x.stroke(); }
      }
    });
    def(id, {
      w: 1, h: 1, solid: true, anim: true,
      draw(ctx, px, py, o, t) { blitSway(ctx, sp(vary(o, 3)), px + 32, py + 54, windK(t, o, 2.4), 3); },
    });
  }

  // ---- bamboo (dense clump) ---------------------------------------------------------------
  {
    const id = 'bamboo';
    const sp = (v) => spr(id + v, 250, 300, 125, 280, (x) => {
      const r = R(1300 + v * 13);
      gshadow(x, 14, 2, 60, 15, 0.34);
      gshadow(x, 2, 0, 28, 8, 0.42);
      const culms = [];
      const n = 15;
      for (let i = 0; i < n; i++) {
        const bx = (r() - 0.5) * 36, d = r();
        culms.push({ bx, d, h: 180 + r() * 80 - d * 30, lean: (bx * 2.4 + (r() - 0.5) * 34), w: 5 + r() * 2.5, yellow: r() < (v === 2 ? 0.5 : 0.12) });
      }
      culms.sort((a, b) => a.d - b.d);
      // twig + drooping spray of narrow leaves
      const leafSpray = (sx, sy, dir, k) => {
        const tx = sx + dir * (6 + r() * 10), ty = sy - 3 - r() * 6;
        x.strokeStyle = '#3a5a22'; x.lineWidth = 1; x.beginPath(); x.moveTo(sx, sy); x.lineTo(tx, ty); x.stroke();
        const nL = 9 + floor(r() * 5);
        for (let j = 0; j < nL; j++) {
          const a = (dir > 0 ? 0 : PI) + dir * (-0.5 + r() * 1.7);   // mostly outward and drooping
          const L = 16 + r() * 11;
          const ex = tx + cos(a) * L, ey = ty + abs(sin(a)) * L * 0.55 + L * 0.25;
          const p = leafP(tx, ty, ex, ey, 2.4, dir * 2.5);
          x.strokeStyle = '#1d3a14'; x.lineWidth = 0.9; x.stroke(p);
          const lit = ey < ty + 8 && r() < 0.7;
          x.fillStyle = k < 0.35 ? (lit ? '#4f8a30' : '#33602a') : lit ? (r() < 0.5 ? '#8cc44a' : '#a8d65e') : '#5f9a38';
          x.fill(p);
        }
      };
      for (const c of culms) {
        const sh = 0.55 + c.d * 0.45;
        const base = c.yellow ? '#b8b84a' : '#5f9a3a';
        const pts = [];
        const p = new Path2D();
        const top = [c.bx + c.lean, -c.h];
        const q = [c.bx + c.lean * 0.15, -c.h * 0.55];
        // body
        const Lp = [], Rp = [];
        for (let i = 0; i <= 16; i++) {
          const u = i / 16, [px, py] = qpt(c.bx, 2, q[0], q[1], top[0], top[1], u);
          const w = c.w * (1 - u * 0.45) / 2;
          Lp.push([px - w, py]); Rp.push([px + w, py]); pts.push([px, py, w]);
        }
        p.moveTo(Lp[0][0], Lp[0][1]); for (const a of Lp) p.lineTo(a[0], a[1]); for (let i = 16; i >= 0; i--) p.lineTo(Rp[i][0], Rp[i][1]); p.closePath();
        const g = x.createLinearGradient(c.bx - c.w, 0, c.bx + c.w, 0);
        g.addColorStop(0, mix(shade(base, 0.35), '#000000', 1 - sh)); g.addColorStop(0.5, mix(base, '#000000', 1 - sh)); g.addColorStop(1, mix(shade(base, -0.4), '#000000', 1 - sh));
        x.strokeStyle = '#1c2e12'; x.lineWidth = 1.6; x.stroke(p);
        x.fillStyle = g; x.fill(p);
        // nodes
        const gap = 22 + r() * 6;
        for (let yy = 14; yy < c.h - 6; yy += gap) {
          const i = min(16, floor(yy / c.h * 16)), pp = pts[i];
          x.strokeStyle = rgba('#1c2e12', 0.8); x.lineWidth = 1.4;
          x.beginPath(); x.moveTo(pp[0] - pp[2], pp[1]); x.lineTo(pp[0] + pp[2], pp[1]); x.stroke();
          x.strokeStyle = rgba('#e6f0b0', 0.5 * sh); x.lineWidth = 0.9;
          x.beginPath(); x.moveTo(pp[0] - pp[2], pp[1] - 1.6); x.lineTo(pp[0] + pp[2] * 0.4, pp[1] - 1.6); x.stroke();
          if (yy > c.h * 0.4 && r() < 0.85) leafSpray(pp[0], pp[1], (pp[0] > 0 ? 1 : -1) * (r() < 0.75 ? 1 : -1), c.d);
        }
        x.strokeStyle = rgba('#f0f8c8', 0.35 * sh); x.lineWidth = 1;
        x.beginPath(); for (let i = 0; i < 14; i++) { const pp = pts[i]; i ? x.lineTo(pp[0] - pp[2] * 0.45, pp[1]) : x.moveTo(pp[0] - pp[2] * 0.45, pp[1]); } x.stroke();
        leafSpray(top[0], top[1] + 4, c.lean > 0 ? 1 : -1, c.d);
        leafSpray(top[0], top[1] + 10, c.lean > 0 ? -1 : 1, c.d);
      }
      // fallen sheaths at the base
      for (let i = 0; i < 6; i++) { x.fillStyle = r() < 0.5 ? '#b49a5a' : '#8a7040'; ell(x, (r() - 0.5) * 40, -1 + r() * 4, 5, 1.6, (r() - 0.5) * 0.6); x.fill(); }
    });
    def(id, {
      w: 1, h: 1, solid: true, anim: true,
      draw(ctx, px, py, o, t) { blitSway(ctx, sp(vary(o, 3)), px + 32, py + 56, windK(t, o, 5), 5); },
    });
  }

  // ============================================================================================
  // SHRUBS, GRASSES & CROPS
  // ============================================================================================
  {
    const id = 'bush';
    const sp = (v) => spr(id + v, 120, 100, 60, 86, (x, c) => {
      const r = R(1400 + v * 3);
      gshadow(x, 6, 0, 40, 11, 0.38);
      const P = [LEAF.bush, palMix(LEAF.bush, '#2a5a4a', 0.2), palMix(LEAF.bush, '#6a8a2a', 0.15)][v];
      const cl = rowsClusters(r, 0, -28, 40, 26, [[-0.6, 2, 0.46], [0.05, 3, 0.44], [0.6, 3, 0.4]], { sq: 0.85, spread: 0.8 });
      paintCanopy(x, cl, P, r, { leafL: 2.8, dens: 1.3, n: 10, outline: 3 });
      canopyPost(x, c, P, -60, 4);
      if (v !== 0) {
        // flowers: 杜鵑 azalea (pink) or 月橘 orange jasmine (white)
        for (let i = 0; i < (v === 1 ? 22 : 30); i++) {
          const a = r() * TAU, d = sqrt(r());
          const fx = cos(a) * 36 * d, fy = -30 + sin(a) * 22 * d - 4;
          if (v === 1) {
            x.fillStyle = '#7a1a40'; ell(x, fx, fy, 3.4, 3); x.fill();
            x.fillStyle = r() < 0.5 ? '#ff6aa0' : '#ff8ab8'; ell(x, fx - 0.4, fy - 0.4, 2.7, 2.3); x.fill();
            x.fillStyle = '#fff0f4'; ell(x, fx - 0.8, fy - 0.8, 0.8, 0.7); x.fill();
          } else {
            x.fillStyle = '#ffffff'; for (let k = 0; k < 5; k++) { const aa = k * TAU / 5; ell(x, fx + cos(aa) * 1.5, fy + sin(aa) * 1.2, 1.2, 1); x.fill(); }
            x.fillStyle = '#f0d060'; ell(x, fx, fy, 0.8, 0.8); x.fill();
          }
        }
      }
    });
    def(id, { w: 1, h: 1, solid: true, anim: true, draw(ctx, px, py, o, t) { blitSway(ctx, sp(vary(o, 3)), px + 32, py + 56, windK(t, o, 1.2), 2); } });
  }
  {
    const id = 'flowers';
    const sp = (v) => spr(id + v, 80, 90, 40, 74, (x) => {
      const r = R(1500 + v * 17);
      grassTuft(x, r, 0, -16, 12, 14, 10, GR, { base: 18 });
      grassTuft(x, r, -14, 4, 14, 18, 10, GR, { base: 10 });
      grassTuft(x, r, 14, 8, 14, 16, 10, GR, { base: 10 });
      const flower = (fx, fy, kind) => {
        // stem
        x.strokeStyle = '#3d6e26'; x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(fx + (r() - 0.5) * 4, fy + 14); x.quadraticCurveTo(fx - 2, fy + 7, fx, fy); x.stroke();
        if (kind === 'bidens') {   // 咸豐草: white rays, yellow disc
          x.fillStyle = '#d8d8d0'; for (let k = 0; k < 5; k++) { const a = k * TAU / 5 + 0.3; ell(x, fx + cos(a) * 2.6, fy + sin(a) * 2, 2, 1.3, a); x.fill(); }
          x.fillStyle = '#ffffff'; for (let k = 0; k < 5; k++) { const a = k * TAU / 5 + 0.3; ell(x, fx + cos(a) * 2.4 - 0.3, fy + sin(a) * 1.8 - 0.3, 1.7, 1.1, a); x.fill(); }
          x.fillStyle = '#e8b830'; ell(x, fx, fy, 1.5, 1.3); x.fill();
        } else if (kind === 'melastoma') {   // 野牡丹: purple
          x.fillStyle = '#5a2a6a'; for (let k = 0; k < 5; k++) { const a = k * TAU / 5; ell(x, fx + cos(a) * 3, fy + sin(a) * 2.4, 2.8, 2, a); x.fill(); }
          x.fillStyle = '#b070d0'; for (let k = 0; k < 5; k++) { const a = k * TAU / 5; ell(x, fx + cos(a) * 2.8 - 0.4, fy + sin(a) * 2.2 - 0.4, 2.2, 1.6, a); x.fill(); }
          x.fillStyle = '#ffe070'; ell(x, fx, fy, 1, 1); x.fill();
        } else if (kind === 'lily') {   // 台灣百合 trumpet
          x.save(); x.translate(fx, fy); x.rotate(0.5 + (r() - 0.5) * 0.4);
          const p = new Path2D(); p.moveTo(0, 0); p.lineTo(9, -3.5); p.quadraticCurveTo(11, 0, 9, 3.5); p.closePath();
          x.strokeStyle = '#8a7a6a'; x.lineWidth = 1; x.stroke(p);
          const g = x.createLinearGradient(0, 0, 10, 0); g.addColorStop(0, '#d8c8b8'); g.addColorStop(0.3, '#fffaf0'); g.addColorStop(1, '#ffffff');
          x.fillStyle = g; x.fill(p);
          x.strokeStyle = 'rgba(160,80,90,0.5)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(1, 0); x.lineTo(8, 0); x.stroke();
          x.restore();
        } else {   // marigold-ish yellow/orange
          x.fillStyle = '#a0461a'; ell(x, fx, fy, 3.3, 2.7); x.fill();
          x.fillStyle = r() < 0.5 ? '#ffb030' : '#ffd040'; ell(x, fx - 0.4, fy - 0.4, 2.8, 2.2); x.fill();
          x.fillStyle = '#fff2a0'; ell(x, fx - 1, fy - 1, 1, 0.8); x.fill();
        }
      };
      const kinds = [['bidens', 'bidens', 'melastoma'], ['lily'], ['gold', 'gold', 'bidens']][v];
      const nF = v === 1 ? 6 : 20;
      const fl = [];
      for (let i = 0; i < nF; i++) fl.push([(r() - 0.5) * 54, -2 - r() * (v === 1 ? 26 : 22), kinds[i % kinds.length]]);
      fl.sort((a, b) => a[1] - b[1]);
      if (v === 1) for (const f of fl) { x.strokeStyle = '#3d6e26'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(f[0] * 0.5, 6); x.quadraticCurveTo(f[0] * 0.6, -10, f[0], f[1] - 6); x.stroke(); }
      for (const f of fl) flower(f[0], f[1] - (v === 1 ? 6 : 0), f[2]);
    });
    def(id, { w: 1, h: 1, solid: false, anim: true, draw(ctx, px, py, o, t) { blitSway(ctx, sp(vary(o, 3)), px + 32, py + 50, windK(t, o, 1.4), 2); } });
  }
  {
    const id = 'tallgrass';
    const sp = (v) => spr(id + v, 90, 80, 45, 70, (x) => {
      const r = R(1600 + v * 5);
      gshadow(x, 3, 0, 26, 7, 0.3);
      const cols = [GR, palMix(GR, '#7a8a2a', 0.25), palMix(GR, '#2a6a4a', 0.2)][v];
      grassTuft(x, r, -8, 2, 22, 46, 18, cols, { base: 10, line: true });
      grassTuft(x, r, 10, 4, 18, 40, 16, cols, { base: 10, line: true });
      grassTuft(x, r, 0, 6, 16, 30, 14, cols, { base: 14 });
    });
    def(id, { w: 1, h: 1, solid: false, anim: true, draw(ctx, px, py, o, t) { blitSway(ctx, sp(vary(o, 3)), px + 32, py + 56, windK(t, o, 3), 3); } });
  }
  {
    const id = 'reeds';
    const sp = (v) => spr(id + v, 110, 140, 55, 128, (x) => {
      const r = R(1700 + v * 7);
      gshadow(x, 4, 0, 30, 7, 0.28);
      const st = [];
      for (let i = 0; i < 13; i++) st.push({ bx: (r() - 0.5) * 36, h: 70 + r() * 40, lean: (r() - 0.4) * 22, d: r() });
      st.sort((a, b) => a.d - b.d);
      for (const s of st) {
        const top = [s.bx + s.lean, -s.h];
        const col = s.d < 0.4 ? '#6a7a3a' : '#9aa65a';
        x.strokeStyle = '#3a4220'; x.lineWidth = 2.6; x.beginPath(); x.moveTo(s.bx, 2); x.quadraticCurveTo(s.bx + s.lean * 0.2, -s.h * 0.5, top[0], top[1]); x.stroke();
        x.strokeStyle = col; x.lineWidth = 1.4; x.beginPath(); x.moveTo(s.bx, 2); x.quadraticCurveTo(s.bx + s.lean * 0.2, -s.h * 0.5, top[0], top[1]); x.stroke();
        // strap leaves
        for (let k = 0; k < 2; k++) {
          const u = 0.25 + r() * 0.4, [lx, ly] = qpt(s.bx, 2, s.bx + s.lean * 0.2, -s.h * 0.5, top[0], top[1], u);
          const dir = r() < 0.5 ? -1 : 1;
          blade(x, lx, ly, lx + dir * 12, ly - 14, lx + dir * 24, ly - 2 + r() * 8, 2.6, s.d < 0.5 ? '#5a7a32' : '#86a44a', '#2e3e1a');
        }
        // feathery plume
        const pc = v === 1 ? ['#c8b8a0', '#e8dcc8'] : v === 2 ? ['#9a7a8a', '#c8a8b0'] : ['#b89a6a', '#e0c898'];
        for (let k = 0; k < 16; k++) {
          const u = k / 16, px = top[0] + s.lean * 0.12 * u + (r() - 0.5) * 3, py = top[1] - 2 + u * 22;
          x.strokeStyle = k % 2 ? pc[0] : pc[1]; x.lineWidth = 1.1;
          x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + 4 + r() * 3, py + 2, px + 6 + r() * 4, py + 6 + r() * 4); x.stroke();
        }
      }
    });
    def(id, { w: 1, h: 1, solid: false, anim: true, draw(ctx, px, py, o, t) { blitSway(ctx, sp(vary(o, 3)), px + 32, py + 58, windK(t, o, 4), 3); } });
  }
  {
    const id = 'silvergrass';   // 芒草
    const sp = (v) => spr(id + v, 150, 140, 75, 126, (x) => {
      const r = R(1800 + v * 9);
      gshadow(x, 4, 0, 36, 8, 0.3);
      const cols = { line: '#2a3a1e', dark: '#4a6232', mid: '#6e8a44', light: '#9ab062', hi: '#d0dc98' };
      // arching fountain of blades
      const bl = [];
      for (let i = 0; i < 46; i++) { const a = (r() - 0.5) * 2; bl.push({ a, L: 40 + r() * 34, d: r() }); }
      bl.sort((a, b) => a.d - b.d);
      for (const b of bl) {
        const tx = b.a * b.L * 1.05, ty = -b.L * (0.75 - abs(b.a) * 0.45);
        const col = b.d < 0.3 ? cols.dark : b.d < 0.7 ? cols.mid : b.d < 0.92 ? cols.light : cols.hi;
        blade(x, b.a * 6, 2, b.a * b.L * 0.4, -b.L * 0.95, tx, ty, 2.4, col, b.d > 0.5 ? cols.line : null);
      }
      // flowering stalks with silky silver-pink plumes
      const pc = [['#efe6da', '#d6c4bc', '#c8aeb0'], ['#f6f0e4', '#e2d8c8', '#c8bca8'], ['#e8d0c8', '#d4a8a8', '#b88a90']][v];
      for (let i = 0; i < 8; i++) {
        const bx = (r() - 0.5) * 20, h = 90 + r() * 26, lean = (r() - 0.45) * 40;
        const top = [bx + lean, -h];
        x.strokeStyle = '#8a8a5a'; x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(bx, 0); x.quadraticCurveTo(bx + lean * 0.2, -h * 0.6, top[0], top[1]); x.stroke();
        for (let k = 0; k < 22; k++) {
          const u = k / 22;
          const sx = top[0] + lean * 0.05 * u + (r() - 0.5) * 2, sy = top[1] + u * 26;
          const dir = (k % 2 ? 1 : -1) * 0.6 + (lean > 0 ? 0.6 : -0.6);
          x.strokeStyle = pc[floor(r() * 3)]; x.lineWidth = 1.1;
          x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + dir * 5, sy + 1, sx + dir * 7 + (r() - 0.5) * 3, sy + 7 + r() * 5); x.stroke();
        }
      }
    });
    def(id, { w: 1, h: 1, solid: false, anim: true, draw(ctx, px, py, o, t) { blitSway(ctx, sp(vary(o, 3)), px + 32, py + 58, windK(t, o, 5), 3); } });
  }
  {
    const id = 'rice_stalks';
    const sp = (v) => spr(id + v, 76, 76, 38, 64, (x) => {
      const r = R(1900 + v * 3);
      const C = [palMix(GR, '#8ad04a', 0.3), GR, { line: '#5a4a14', dark: '#8a7a2a', mid: '#b8a03a', light: '#dcc458', hi: '#f6e48a' }][v];
      const hills = [];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) hills.push([(i - 1) * 20 + (j % 2) * 3, -44 + j * 20]);
      for (const [hx, hy] of hills) {
        gshadow(x, hx + 2, hy + 1, 8, 3, 0.3);
        const n = 12;
        for (let k = 0; k < n; k++) {
          const a = (k / (n - 1) - 0.5) * 1.6 + (r() - 0.5) * 0.3;
          const L = (v === 0 ? 18 : 28) * (0.7 + r() * 0.4);
          const col = k % 3 === 0 ? C.dark : k % 3 === 1 ? C.mid : C.light;
          blade(x, hx + a * 2, hy, hx + a * L * 0.3, hy - L * 0.8, hx + sin(a) * L * 0.7, hy - cos(a) * L * 0.85, 1.8, col, null);
        }
        if (v === 2) {
          // ripe drooping panicles
          for (let k = 0; k < 4; k++) {
            const sx = hx + (k - 1.5) * 3, top = hy - 26 - r() * 4, dir = k < 2 ? -1 : 1;
            x.strokeStyle = '#a08a2a'; x.lineWidth = 1; x.beginPath(); x.moveTo(sx, hy - 8); x.quadraticCurveTo(sx, top - 4, sx + dir * 8, top + 4); x.stroke();
            for (let g = 0; g < 6; g++) { const u = g / 6; const [gx, gy] = qpt(sx, top - 2, sx + dir * 4, top - 5, sx + dir * 9, top + 6, u); x.fillStyle = g % 2 ? '#e8c850' : '#f6dc70'; ell(x, gx, gy, 1.4, 2, dir * 0.6); x.fill(); }
          }
        }
      }
    });
    def(id, { w: 1, h: 1, solid: false, anim: true, draw(ctx, px, py, o, t) { blitSway(ctx, sp(vary(o, 3)), px + 32, py + 60, windK(t, o, 1.6), 2); } });
  }
  {
    const id = 'millet';   // 小米 (Bunun / Tsou fields)
    const sp = (v) => spr(id + v, 100, 120, 50, 106, (x) => {
      const r = R(2000 + v * 7);
      gshadow(x, 4, 0, 28, 7, 0.3);
      const pan = [['#8a6a12', '#d6a828', '#f2d060'], ['#7a3a10', '#c8642a', '#f09a48'], ['#4a1a14', '#8a3a2a', '#c06a48']][v];
      const st = [];
      for (let i = 0; i < 7; i++) st.push({ bx: (r() - 0.5) * 26, h: 70 + r() * 22, lean: (r() - 0.5) * 18, d: r(), dir: r() < 0.5 ? -1 : 1 });
      st.sort((a, b) => a.d - b.d);
      for (const s of st) {
        const top = [s.bx + s.lean, -s.h];
        x.strokeStyle = '#3a4a1e'; x.lineWidth = 2.6; x.beginPath(); x.moveTo(s.bx, 2); x.quadraticCurveTo(s.bx, -s.h * 0.6, top[0], top[1]); x.stroke();
        x.strokeStyle = s.d < 0.5 ? '#6a8a3a' : '#8aa850'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(s.bx, 2); x.quadraticCurveTo(s.bx, -s.h * 0.6, top[0], top[1]); x.stroke();
        for (let k = 0; k < 3; k++) {
          const u = 0.2 + k * 0.22, [lx, ly] = qpt(s.bx, 2, s.bx, -s.h * 0.6, top[0], top[1], u);
          const dir = k % 2 ? 1 : -1;
          blade(x, lx, ly, lx + dir * 14, ly - 12, lx + dir * 24, ly + 2, 3.4, s.d < 0.5 ? '#557a30' : '#7ea044', '#2a3a16');
        }
        // heavy drooping panicle
        const ex = top[0] + s.dir * 11, ey = top[1] + 17;
        const qx = top[0] + s.dir * 6, qy = top[1] - 8;
        x.strokeStyle = pan[0]; x.lineWidth = 6.4; x.beginPath(); x.moveTo(top[0], top[1]); x.quadraticCurveTo(qx, qy, ex, ey); x.stroke();
        x.strokeStyle = pan[1]; x.lineWidth = 4.6; x.beginPath(); x.moveTo(top[0], top[1]); x.quadraticCurveTo(qx, qy, ex, ey); x.stroke();
        for (let g = 0; g < 14; g++) {
          const [gx, gy] = qpt(top[0], top[1], qx, qy, ex, ey, g / 14 + 0.03);
          x.fillStyle = g % 3 ? pan[2] : pan[1]; ell(x, gx - s.dir * 1 + (r() - 0.5) * 2, gy - 0.8 + (r() - 0.5) * 2, 1.3, 1.1); x.fill();
        }
      }
    });
    def(id, { w: 1, h: 1, solid: false, anim: true, draw(ctx, px, py, o, t) { blitSway(ctx, sp(vary(o, 3)), px + 32, py + 58, windK(t, o, 3), 3); } });
  }
  {
    const id = 'lily';   // 彼岸花 red spider lily: bare stems, recurved petals, long stamens
    const sp = (v) => spr(id + v, 90, 80, 45, 66, (x) => {
      const r = R(2100 + v * 5);
      gshadow(x, 2, 0, 24, 6, 0.25);
      const n = 5 + v;
      const fl = [];
      for (let i = 0; i < n; i++) fl.push({ bx: (r() - 0.5) * 34, h: 26 + r() * 22, lean: (r() - 0.5) * 10 });
      fl.sort((a, b) => b.h - a.h);
      for (const f of fl) {
        const fx = f.bx + f.lean, fy = -f.h;
        x.strokeStyle = '#2a4a1a'; x.lineWidth = 2.2; x.beginPath(); x.moveTo(f.bx, 2); x.quadraticCurveTo(f.bx, fy * 0.5, fx, fy); x.stroke();
        x.strokeStyle = '#5a8a32'; x.lineWidth = 1.1; x.beginPath(); x.moveTo(f.bx, 2); x.quadraticCurveTo(f.bx, fy * 0.5, fx, fy); x.stroke();
        // umbel of 6 florets, each with recurved wavy petals and long stamens
        for (let k = 0; k < 6; k++) {
          const a = k / 6 * TAU + r() * 0.4;
          const dx = cos(a), dy = sin(a) * 0.55;
          const cx = fx + dx * 4, cy = fy + dy * 4 - 2;
          for (let p = 0; p < 3; p++) {
            const pa = a + (p - 1) * 0.5;
            const ex = cx + cos(pa) * 8, ey = cy + sin(pa) * 4.4 - 2;
            const pp = leafP(cx, cy, ex, ey, 1.4, 1.5);
            x.fillStyle = '#6a0a14'; x.strokeStyle = '#5a0810'; x.lineWidth = 0.8; x.stroke(pp);
            x.fillStyle = dy < 0 ? '#c8162a' : '#ee2a3a'; x.fill(pp);
          }
          // stamens arching up and out
          x.strokeStyle = '#ff4a50'; x.lineWidth = 0.7;
          for (let s2 = 0; s2 < 2; s2++) {
            const sx = cx + dx * 13 + (r() - 0.5) * 3, sy = cy + dy * 8 - 10 - r() * 4;
            x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(cx + dx * 8, cy - 9, sx, sy); x.stroke();
            x.fillStyle = '#ffd060'; ell(x, sx, sy, 0.8, 0.8); x.fill();
          }
        }
        x.fillStyle = 'rgba(255,200,200,0.6)'; ell(x, fx - 1, fy - 3, 1.6, 1); x.fill();
      }
    });
    def(id, { w: 1, h: 1, solid: false, anim: true, draw(ctx, px, py, o, t) { blitSway(ctx, sp(vary(o, 3)), px + 32, py + 54, windK(t, o, 1.6), 2); } });
  }
  {
    const id = 'lotus';   // on water; solid
    const pad = (x, r, cx, cy, rr) => {
      const a0 = r() * TAU;
      x.fillStyle = 'rgba(10,30,40,0.35)'; ell(x, cx + 2, cy + 2, rr, rr * 0.55); x.fill();
      x.beginPath(); x.moveTo(cx, cy); x.ellipse(cx, cy, rr, rr * 0.55, 0, a0 + 0.22, a0 + TAU - 0.22); x.closePath();
      const g = x.createRadialGradient(cx - rr * 0.3, cy - rr * 0.2, 1, cx, cy, rr);
      g.addColorStop(0, '#9ccc5a'); g.addColorStop(0.7, '#5f9a3a'); g.addColorStop(1, '#3f7a2e');
      x.fillStyle = g; x.fill(); x.strokeStyle = '#2a5222'; x.lineWidth = 1.2; x.stroke();
      x.strokeStyle = 'rgba(220,240,170,0.45)'; x.lineWidth = 0.7;
      for (let k = 0; k < 9; k++) { const a = a0 + 0.4 + k * (TAU - 0.8) / 8; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + cos(a) * rr * 0.9, cy + sin(a) * rr * 0.5); x.stroke(); }
      x.strokeStyle = 'rgba(240,255,220,0.5)'; x.lineWidth = 1; x.beginPath(); x.ellipse(cx, cy, rr - 1, rr * 0.55 - 1, 0, PI * 1.05, PI * 1.6); x.stroke();
    };
    const bloom = (x, r, cx, cy, s) => {
      x.fillStyle = 'rgba(10,30,40,0.3)'; ell(x, cx + 3, cy + 3, 10 * s, 4 * s); x.fill();
      const layer = (n, L, W, lift, cIn, cOut, off) => {
        for (let k = 0; k < n; k++) {
          const a = off + k / n * TAU;
          const ex = cx + cos(a) * L * s, ey = cy + sin(a) * L * 0.5 * s - lift * s;
          const p = leafP(cx, cy - 2 * s, ex, ey, W * s, 0);
          const g = x.createLinearGradient(cx, cy, ex, ey); g.addColorStop(0, cIn); g.addColorStop(1, cOut);
          x.strokeStyle = '#a0305a'; x.lineWidth = 0.8; x.stroke(p);
          x.fillStyle = g; x.fill(p);
        }
      };
      layer(8, 11, 3.6, 4, '#ffe0ea', '#f070a0', 0.2);
      layer(6, 8, 3.2, 8, '#fff2f6', '#ff8ab4', 0.5);
      layer(5, 5, 2.6, 10, '#ffffff', '#ffb0cc', 0.9);
      x.fillStyle = '#f0d040'; ell(x, cx, cy - 9 * s, 2.6 * s, 1.6 * s); x.fill();
    };
    const sp = (v) => spr(id + v, 84, 76, 42, 60, (x) => {
      const r = R(2200 + v * 3);
      const pads = [[-16, -14, 15], [14, -24, 12], [10, -4, 13], [-20, -36, 9], [22, -42, 8]];
      pads.sort((a, b) => a[1] - b[1]);
      for (const [cx, cy, rr] of pads) pad(x, r, cx, cy, rr);
      bloom(x, r, -4 + v * 4, -20, 1);
      if (v !== 2) {
        // bud on a stem
        x.strokeStyle = '#4a7a2a'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(18, -16); x.quadraticCurveTo(22, -30, 20, -40); x.stroke();
        const p = leafP(20, -38, 20, -52, 4.6, 0);
        const g = x.createLinearGradient(20, -38, 20, -52); g.addColorStop(0, '#f8a0c0'); g.addColorStop(1, '#e0306a');
        x.strokeStyle = '#90204a'; x.lineWidth = 1; x.stroke(p); x.fillStyle = g; x.fill(p);
      } else bloom(x, r, 16, -36, 0.7);
    });
    def(id, {
      w: 1, h: 1, solid: true, anim: true,
      draw(ctx, px, py, o, t) { blit(ctx, sp(vary(o, 3)), px + 32, py + 60 + sin(t * 1.3 + hseed(o, 2) * 6) * 0.8); },
    });
  }
  {
    const id = 'seaweed';   // washed-up kelp on the shore
    const sp = (v) => spr(id + v, 80, 56, 40, 44, (x) => {
      const r = R(2300 + v * 5);
      x.fillStyle = 'rgba(80,60,30,0.25)'; ell(x, 0, 0, 30, 9); x.fill();   // wet sand
      const cols = [['#2e3410', '#5a6a22', '#7f8f30'], ['#1e3a22', '#2f6a3a', '#4f9a52'], ['#3a2410', '#6e4a1e', '#94702e']][v];
      for (let i = 0; i < 11; i++) {
        const x0 = (r() - 0.5) * 44, y0 = (r() - 0.5) * 12, L = 20 + r() * 22, dir = r() < 0.5 ? -1 : 1;
        const amp = 2 + r() * 3, fq = 0.25 + r() * 0.2, ph = r() * TAU, tilt = (r() - 0.5) * 0.5;
        const pts = [];
        for (let k = 0; k <= 12; k++) { const u = k / 12 * L; pts.push([x0 + dir * u, y0 + u * tilt + sin(u * fq + ph) * amp]); }
        const path = () => { x.beginPath(); pts.forEach((q, k) => (k ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]))); };
        const w = 3 + r() * 2.5;
        path(); x.strokeStyle = cols[0]; x.lineWidth = w + 1.6; x.stroke();
        path(); x.strokeStyle = cols[1 + (i % 2)]; x.lineWidth = w; x.stroke();
        x.strokeStyle = 'rgba(255,255,220,0.4)'; x.lineWidth = 0.8;
        x.beginPath(); pts.slice(2, 9).forEach((q, k) => (k ? x.lineTo(q[0], q[1] - w * 0.3) : x.moveTo(q[0], q[1] - w * 0.3))); x.stroke();
      }
      // bladder floats + shells
      for (let i = 0; i < 6; i++) { const bx = (r() - 0.5) * 40, by = (r() - 0.5) * 10; x.fillStyle = cols[2]; ell(x, bx, by, 2.2, 1.8); x.fill(); x.fillStyle = 'rgba(255,255,220,0.6)'; ell(x, bx - 0.6, by - 0.6, 0.7, 0.6); x.fill(); }
      for (let i = 0; i < 3; i++) { const bx = (r() - 0.5) * 50, by = 4 + (r() - 0.5) * 8; x.fillStyle = '#f0e0d0'; ell(x, bx, by, 2.6, 2); x.fill(); x.strokeStyle = '#b09080'; x.lineWidth = 0.6; x.stroke(); }
    });
    def(id, { w: 1, h: 1, solid: false, anim: false, draw(ctx, px, py, o) { blit(ctx, sp(vary(o, 3)), px + 32, py + 38); } });
  }

  // ============================================================================================
  // ROCKS
  // ============================================================================================
  function boulder(x, r, cx, cy, w, h, P, o = {}) {
    const n = 9, pts = [];
    for (let i = 0; i < n; i++) {
      const a = PI + i / (n - 1) * PI;   // upper half arc, left→right
      const k = 0.82 + r() * 0.3;
      pts.push([cx + cos(a) * w * k, cy - h * 0.35 + sin(a) * h * 0.75 * k]);
    }
    const p = new Path2D();
    p.moveTo(cx - w * 0.95, cy);
    for (const q of pts) p.lineTo(q[0], q[1]);
    p.lineTo(cx + w * 0.95, cy);
    p.quadraticCurveTo(cx, cy + h * 0.16, cx - w * 0.95, cy);
    p.closePath();
    // smooth the facets a bit by stroking with round joins in the base colour
    x.lineJoin = 'round';
    x.strokeStyle = P.line; x.lineWidth = 5; x.stroke(p);
    const g = x.createLinearGradient(cx - w, cy - h, cx + w * 0.8, cy + h * 0.2);
    g.addColorStop(0, P.light); g.addColorStop(0.45, P.mid); g.addColorStop(1, P.dark);
    x.fillStyle = g; x.fill(p);
    x.strokeStyle = P.mid; x.lineWidth = 2.4; x.stroke(p);
    x.save(); x.clip(p);
    x.fillStyle = g; x.fill(p);
    // planar facets: lit top plane & shadowed right plane
    x.fillStyle = rgba(P.hi, 0.45);
    x.beginPath(); x.moveTo(pts[1][0], pts[1][1]); for (let i = 2; i < 6; i++) x.lineTo(pts[i][0], pts[i][1]);
    x.lineTo(cx + w * 0.1, cy - h * 0.45); x.lineTo(cx - w * 0.5, cy - h * 0.35); x.closePath(); x.fill();
    x.fillStyle = rgba(P.line, 0.35);
    x.beginPath(); x.moveTo(pts[6][0], pts[6][1]); x.lineTo(pts[8][0], pts[8][1]); x.lineTo(cx + w, cy + 2); x.lineTo(cx + w * 0.25, cy + 4); x.lineTo(cx + w * 0.3, cy - h * 0.4); x.closePath(); x.fill();
    // texture
    if (o.veins) {
      for (let i = 0; i < 5; i++) {
        x.strokeStyle = rgba(o.veins, 0.5 + r() * 0.3); x.lineWidth = 0.6 + r() * 1.2;
        let vx = cx - w + r() * w * 0.6, vy = cy - h * r() * 0.9;
        x.beginPath(); x.moveTo(vx, vy);
        for (let k = 0; k < 5; k++) { vx += w * 0.35; vy += (r() - 0.4) * h * 0.3; x.quadraticCurveTo(vx - w * 0.15, vy - (r() - 0.5) * 10, vx, vy); }
        x.stroke();
      }
    }
    for (let i = 0; i < w * h * 0.06; i++) { x.fillStyle = rgba(r() < 0.5 ? P.line : P.hi, 0.18); ell(x, cx + (r() - 0.5) * w * 2, cy - r() * h * 1.1, 0.8 + r() * 1.4, 0.6 + r()); x.fill(); }
    // cracks
    x.strokeStyle = rgba(P.line, 0.7); x.lineWidth = 1.2;
    for (let i = 0; i < (o.cracks == null ? 2 : o.cracks); i++) {
      let qx = cx + (r() - 0.5) * w, qy = cy - h * (0.4 + r() * 0.5);
      x.beginPath(); x.moveTo(qx, qy);
      for (let k = 0; k < 3; k++) { qx += (r() - 0.3) * 8; qy += 4 + r() * 5; x.lineTo(qx, qy); }
      x.stroke();
    }
    // moss cap
    if (o.moss) {
      const mp = scallopP(cx - w * 0.25, cy - h * 0.92, w * 0.62, h * 0.32, 11, 0.4, r);
      x.fillStyle = '#2f5a24'; x.fill(mp);
      x.fillStyle = '#5a8f36'; x.fill(scallopP(cx - w * 0.32, cy - h * 0.98, w * 0.48, h * 0.22, 9, 0.4, r));
      for (let i = 0; i < 26; i++) { x.fillStyle = r() < 0.5 ? '#8cc04e' : '#6aa03e'; ell(x, cx - w * 0.3 + (r() - 0.5) * w * 0.9, cy - h * 0.95 + (r() - 0.5) * h * 0.35, 1.4, 1); x.fill(); }
    }
    // bottom AO
    x.fillStyle = vgrad(x, cy - h * 0.25, cy + 4, [[0, 'rgba(0,0,0,0)'], [1, rgba(P.line, 0.55)]]);
    x.fillRect(cx - w - 4, cy - h * 0.3, w * 2 + 8, h * 0.5);
    x.restore();
    // rim light
    x.save(); x.clip(p);
    const rp = new Path2D(); rp.rect(cx - w * 2, cy - h * 2, w * 4, h * 4); rp.addPath(p, new DOMMatrix().translateSelf(2.5, 2.5));
    x.fillStyle = rgba(P.hi, 0.5); x.fill(rp, 'evenodd');
    x.restore();
    return p;
  }
  const STONE = { line: '#2a2c30', dark: '#4c5058', mid: '#6e737c', light: '#959aa2', hi: '#c8ccd2' };
  const MARBLE = { line: '#5a5e6a', dark: '#a8adb8', mid: '#cdd1d8', light: '#e8ebef', hi: '#ffffff' };
  {
    const sp = (v) => spr('rock_small' + v, 100, 80, 50, 62, (x) => {
      const r = R(2400 + v * 7);
      gshadow(x, 6, 0, 34, 10, 0.4);
      const P = [STONE, palMix(STONE, '#7a6a52', 0.25), palMix(STONE, '#4a5a6a', 0.2)][v];
      if (v === 1) { boulder(x, r, 14, 0, 14, 16, P, { moss: false, cracks: 1 }); boulder(x, r, -6, -2, 22, 28, P, { moss: true }); }
      else boulder(x, r, 0, 0, 26, v === 2 ? 22 : 32, P, { moss: v === 0 });
      grassTuft(x, r, -22, 2, 7, 12, 6); grassTuft(x, r, 20, 3, 6, 10, 6);
    });
    def('rock_small', { w: 1, h: 1, solid: true, draw(ctx, px, py, o) { blit(ctx, sp(vary(o, 3)), px + 32, py + 54); } });
  }
  {
    const sp = (v) => spr('rock_big' + v, 170, 150, 85, 126, (x) => {
      const r = R(2500 + v * 7);
      gshadow(x, 10, 0, 76, 20, 0.42);
      const P = [STONE, palMix(STONE, '#6a6248', 0.2), palMix(STONE, '#3a4a5a', 0.2)][v];
      boulder(x, r, -14, -2, 50, 78, P, { moss: true, cracks: 3 });
      boulder(x, r, 34, 6, 28, 34, P, { moss: v !== 2, cracks: 1 });
      fernTuft(x, r, -60, 6, 0.8); fernTuft(x, r, 56, 8, 0.6);
      grassTuft(x, r, 4, 10, 10, 12, 8);
    });
    def('rock_big', { w: 2, h: 2, solid: true, draw(ctx, px, py, o) { blit(ctx, sp(vary(o, 3)), px + 64, py + 112); } });
  }
  {
    const sp = (v) => spr('rock_marble' + v, 110, 96, 55, 76, (x) => {
      const r = R(2600 + v * 7);
      gshadow(x, 6, 0, 40, 11, 0.32);
      const P = [MARBLE, palMix(MARBLE, '#d8d0c0', 0.3), palMix(MARBLE, '#b8c8d8', 0.25)][v];
      boulder(x, r, 0, 0, 34, 40 - v * 4, P, { veins: v === 1 ? '#6a6a72' : '#7a8290', cracks: 0 });
      if (v === 2) boulder(x, r, 28, 4, 12, 12, P, { veins: '#7a8290', cracks: 0 });
    });
    def('rock_marble', { w: 1, h: 1, solid: true, draw(ctx, px, py, o) { blit(ctx, sp(vary(o, 3)), px + 32, py + 54); } });
  }
  {
    // basalt columns (澎湖): hexagonal prisms seen from 3/4 above
    const sp = (v) => spr('rock_basalt' + v, 110, 150, 55, 130, (x) => {
      const r = R(2700 + v * 7);
      gshadow(x, 8, 0, 42, 12, 0.42);
      const cols = [];
      const N = 8 + v;
      for (let i = 0; i < N; i++) { const a = i / N * TAU + r() * 0.4, d = i === 0 ? 0 : 14 + r() * 8; cols.push({ cx: cos(a) * d * 1.25, cy: sin(a) * d * 0.55 - 2, rr: 8 + r() * 2.5, h: (i === 0 ? 62 : 16 + r() * 46) }); }
      cols.sort((a, b) => a.cy - b.cy);
      for (const c of cols) {
        const hex = [];
        for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.1; hex.push([c.cx + cos(a) * c.rr, c.cy + sin(a) * c.rr * 0.55]); }
        const ty = -c.h;
        // visible side faces: vertices whose y is on the front half (indices 0..3 roughly) extruded down
        for (let k = 0; k < 6; k++) {
          const a = hex[k], b = hex[(k + 1) % 6];
          if (a[1] + b[1] < 2 * c.cy - 0.1) continue;   // back face
          const nxf = ((a[0] + b[0]) / 2 - c.cx) / c.rr;
          const tone = U.clamp(0.5 - nxf * 0.45, 0, 1);
          x.fillStyle = mix('#2c2f36', '#6c717c', tone);
          x.beginPath(); x.moveTo(a[0], a[1] + ty); x.lineTo(b[0], b[1] + ty); x.lineTo(b[0], b[1]); x.lineTo(a[0], a[1]); x.closePath(); x.fill();
          x.strokeStyle = '#17181c'; x.lineWidth = 1; x.stroke();
          // horizontal joints
          x.strokeStyle = 'rgba(15,15,20,0.5)';
          for (let j = 1; j < c.h / 22; j++) { const yy = -j * 22 + (r() - 0.5) * 6; x.beginPath(); x.moveTo(a[0], a[1] + yy); x.lineTo(b[0], b[1] + yy); x.stroke(); }
        }
        // top face
        x.beginPath(); hex.forEach((q, k) => (k ? x.lineTo(q[0], q[1] + ty) : x.moveTo(q[0], q[1] + ty))); x.closePath();
        const g = x.createLinearGradient(c.cx - c.rr, ty + c.cy - 5, c.cx + c.rr, ty + c.cy + 5);
        g.addColorStop(0, '#9aa0aa'); g.addColorStop(1, '#5d626c');
        x.fillStyle = g; x.fill(); x.strokeStyle = '#17181c'; x.lineWidth = 1.3; x.stroke();
        x.strokeStyle = 'rgba(220,230,240,0.55)'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(hex[3][0], hex[3][1] + ty); x.lineTo(hex[4][0], hex[4][1] + ty); x.lineTo(hex[5][0], hex[5][1] + ty); x.stroke();
        if (r() < 0.4) { x.fillStyle = 'rgba(200,210,140,0.5)'; ell(x, c.cx + (r() - 0.5) * 6, c.cy + ty, 3, 1.4); x.fill(); }   // lichen
      }
    });
    def('rock_basalt', { w: 1, h: 1, solid: true, draw(ctx, px, py, o) { blit(ctx, sp(vary(o, 3)), px + 32, py + 52); } });
  }

  // ============================================================================================
  // WOOD: stump, log (2x1), driftwood (2x1)
  // ============================================================================================
  function rings(x, cx, cy, rx, ry, r, pale) {
    const g = x.createRadialGradient(cx - rx * 0.2, cy - ry * 0.2, 1, cx, cy, rx);
    g.addColorStop(0, pale ? '#e8dcc0' : '#e2b87a'); g.addColorStop(1, pale ? '#b8a888' : '#a87444');
    x.fillStyle = g; ell(x, cx, cy, rx, ry); x.fill();
    x.strokeStyle = pale ? 'rgba(120,100,80,0.5)' : 'rgba(120,70,30,0.55)'; x.lineWidth = 0.8;
    for (let k = 1; k < 6; k++) { ell(x, cx + (r() - 0.5), cy + (r() - 0.5) * 0.5, rx * k / 6.2, ry * k / 6.2); x.stroke(); }
    x.strokeStyle = 'rgba(80,40,20,0.5)'; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + rx * 0.7, cy - ry * 0.4); x.stroke();
  }
  {
    const sp = (v) => spr('stump' + v, 100, 80, 50, 62, (x) => {
      const r = R(2800 + v * 7);
      const B = BARK.brown;
      gshadow(x, 5, 0, 34, 10, 0.4);
      const segs = [];
      for (let i = 0; i < 5; i++) { const s = (i / 4 - 0.5) * 2; segs.push({ p: taperP(s * 10, -10, s * 26 + (r() - 0.5) * 6, 3 + r() * 3, 10, 3, s * 3), x0: s * 10, y0: -10, x1: s * 26, y1: 4, w0: 10, w1: 3 }); }
      limbs(x, segs, B);
      const H = 22 + v * 6, Rw = 20;
      const body = new Path2D();
      body.moveTo(-Rw, -H); body.lineTo(-Rw - 2, -2); body.quadraticCurveTo(0, 6, Rw + 2, -2); body.lineTo(Rw, -H); body.closePath();
      barkFill(x, body, [-Rw, -H, Rw, 0], B, r, { dens: 0.1, len: 10 });
      // jagged break or clean cut
      rings(x, 0, -H, Rw, 8, r, false);
      x.strokeStyle = B.line; x.lineWidth = 1.5; ell(x, 0, -H, Rw, 8); x.stroke();
      x.strokeStyle = rgba(B.hi, 0.6); x.lineWidth = 1.4; x.beginPath(); x.ellipse(0, -H, Rw - 1, 7, 0, PI * 0.1, PI * 0.9); x.stroke();
      // moss + tiny mushrooms
      for (let i = 0; i < 20; i++) { x.fillStyle = r() < 0.5 ? '#4f7a33' : '#76a845'; ell(x, -Rw + r() * 12, -H * r() * 0.8 - 2, 2.2, 1.6); x.fill(); }
      if (v !== 1) for (let i = 0; i < 3; i++) {
        const mx = 10 + i * 5, my = -4 - i * 2;
        x.fillStyle = '#e8dcc8'; x.fillRect(mx - 0.8, my - 5, 1.6, 5);
        x.fillStyle = '#b8542a'; ell(x, mx, my - 5, 3.4, 2); x.fill();
        x.fillStyle = 'rgba(255,230,200,0.7)'; ell(x, mx - 1, my - 5.6, 1, 0.6); x.fill();
      }
    });
    def('stump', { w: 1, h: 1, solid: true, draw(ctx, px, py, o) { blit(ctx, sp(vary(o, 3)), px + 32, py + 52); } });
  }
  function logBody(x, r, x0, x1, cy, rad, B, pale) {
    const body = new Path2D();
    body.moveTo(x0, cy - rad);
    body.bezierCurveTo((x0 + x1) / 2 - 10, cy - rad - 2, (x0 + x1) / 2 + 10, cy - rad + 2, x1, cy - rad);
    body.lineTo(x1, cy + rad * 0.6);
    body.bezierCurveTo((x0 + x1) / 2 + 10, cy + rad * 0.7, (x0 + x1) / 2 - 10, cy + rad * 0.6, x0, cy + rad * 0.6);
    body.closePath();
    x.strokeStyle = B.line; x.lineWidth = 2; x.stroke(body);
    const g = x.createLinearGradient(0, cy - rad, 0, cy + rad * 0.6);
    g.addColorStop(0, B.hi); g.addColorStop(0.25, B.light); g.addColorStop(0.6, B.mid); g.addColorStop(1, B.dark);
    x.fillStyle = g; x.fill(body);
    x.save(); x.clip(body);
    for (let i = 0; i < (x1 - x0) * 0.6; i++) {
      const sx = x0 + r() * (x1 - x0), sy = cy - rad + r() * rad * 1.6;
      x.strokeStyle = rgba(r() < 0.6 ? B.line : B.hi, 0.35); x.lineWidth = 0.8 + r();
      x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + 6 + r() * 14, sy + (r() - 0.5) * 2); x.stroke();
    }
    x.restore();
    return body;
  }
  {
    const sp = (v) => spr('log' + v, 150, 70, 75, 50, (x) => {
      const r = R(2900 + v * 7);
      gshadow(x, 4, 2, 66, 12, 0.4);
      logBody(x, r, -56, 50, -14, 15, BARK.brown, false);
      rings(x, 50, -16, 7, 14.5, r, false);
      x.strokeStyle = BARK.brown.line; x.lineWidth = 1.5; ell(x, 50, -16, 7, 14.5); x.stroke();
      // broken left end
      x.fillStyle = '#3a2418'; x.beginPath(); x.moveTo(-56, -29); x.lineTo(-62, -22); x.lineTo(-57, -16); x.lineTo(-63, -8); x.lineTo(-56, -5); x.closePath(); x.fill();
      // moss on top
      for (let i = 0; i < 50; i++) { x.fillStyle = r() < 0.4 ? '#3f6e2a' : r() < 0.7 ? '#6aa03e' : '#9ccc5a'; ell(x, -50 + r() * 80, -28 + r() * 7, 2.4, 1.6); x.fill(); }
      // bracket fungi
      for (let i = 0; i < (v === 2 ? 5 : 3); i++) {
        const fx = -30 + i * 16 + r() * 6, fy = -10 + r() * 6;
        x.fillStyle = '#5a3a1a'; ell(x, fx, fy + 1, 6, 2.6); x.fill();
        x.fillStyle = v === 1 ? '#e8d8b8' : '#d89a4a'; ell(x, fx, fy, 5.4, 2.2); x.fill();
        x.strokeStyle = 'rgba(255,240,210,0.6)'; x.lineWidth = 0.7; x.beginPath(); x.ellipse(fx, fy, 4, 1.4, 0, PI, TAU); x.stroke();
      }
      fernTuft(x, r, -10, 8, 0.45);
    });
    def('log', { w: 2, h: 1, solid: true, draw(ctx, px, py, o) { blit(ctx, sp(vary(o, 3)), px + 64, py + 50); } });
  }
  {
    const DW = { line: '#4a4844', dark: '#8a857c', mid: '#aaa59a', light: '#cbc6ba', hi: '#eeeae0' };
    const sp = (v) => spr('driftwood' + v, 160, 80, 80, 54, (x) => {
      const r = R(3000 + v * 7);
      x.fillStyle = 'rgba(120,100,60,0.22)'; ell(x, 0, 0, 66, 12); x.fill();
      gshadow(x, 4, 2, 60, 9, 0.35);
      // root crown at the left end
      const segs = [];
      for (let i = 0; i < 6; i++) { const a = PI + (i / 5 - 0.5) * 2.4; segs.push({ p: taperP(-46, -10, -46 + cos(a) * (14 + r() * 10), -10 + sin(a) * (12 + r() * 8), 6, 1.5, (r() - 0.5) * 6), x0: -46, y0: -10, x1: -46 + cos(a) * 20, y1: -10 + sin(a) * 14, w0: 6, w1: 1.5 }); }
      limbs(x, segs, DW);
      logBody(x, r, -48, 52, -8, 10, DW, true);
      // smooth weathered grain swirls + knots
      x.strokeStyle = 'rgba(90,85,80,0.5)'; x.lineWidth = 1;
      for (let i = 0; i < 4; i++) { const kx = -30 + i * 22 + r() * 6; ell(x, kx, -10, 3.4, 2); x.stroke(); }
      // a branch stub
      const st = [{ p: taperP(16, -16, 30 + v * 4, -34, 6, 2.5, 3), x0: 16, y0: -16, x1: 32, y1: -34, w0: 6, w1: 2.5 }];
      limbs(x, st, DW);
      rings(x, 52, -9, 5, 9.5, r, true);
      x.strokeStyle = DW.line; x.lineWidth = 1.2; ell(x, 52, -9, 5, 9.5); x.stroke();
      // sand piled against it
      x.fillStyle = '#d8c294'; x.beginPath(); x.ellipse(-8, 3, 30, 4, 0, PI, TAU); x.fill();
    });
    def('driftwood', { w: 2, h: 1, solid: true, draw(ctx, px, py, o) { blit(ctx, sp(vary(o, 3)), px + 64, py + 48); } });
  }

  // ============================================================================================
  // PSYCHEDELIC (七彩靈蕈 grove, 靈境, 一息界)
  // ============================================================================================
  const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;
  // n pre-rendered hue frames; fn(ctx, hueOffsetDeg, canvas)
  function hueFrames(key, n, w, h, ax, ay, fn) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(spr(key + '#' + i, w, h, ax, ay, (x, c) => fn(x, i * 360 / n, c)));
    return out;
  }
  // cross-fade between neighbouring hue frames at cycle position u (0..1)
  function blitHue(ctx, fr, x, y, u, a = 1) {
    const n = fr.length, f = (((u % 1) + 1) % 1) * n, i = floor(f) % n, k = f - floor(f);
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * a;
    blitS(ctx, fr[i], x, y);
    if (k > 0.02) { ctx.globalAlpha = ga * a * k; blitS(ctx, fr[(i + 1) % n], x, y); }
    ctx.globalAlpha = ga;
  }
  function additive(ctx, fn) { const g = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; fn(); ctx.globalCompositeOperation = g; }

  // mushroom cap (top-down 3/4): dome with gills rim, spots; h0 = hue
  function mushCap(x, cx, cy, rw, rh, h0, r, spots = true) {
    // underside / gills (visible as a band under the dome)
    x.fillStyle = hsl(h0 + 40, 60, 22); ell(x, cx, cy + rh * 0.12, rw, rh * 0.42); x.fill();
    x.strokeStyle = hsl(h0 + 40, 100, 75, 0.8); x.lineWidth = 0.8;
    for (let k = -4; k <= 4; k++) { x.beginPath(); x.moveTo(cx + k * rw * 0.2, cy + rh * 0.38); x.lineTo(cx + k * rw * 0.08, cy + rh * 0.08); x.stroke(); }
    const dome = new Path2D();
    dome.moveTo(cx - rw, cy + rh * 0.1);
    dome.bezierCurveTo(cx - rw, cy - rh * 1.25, cx + rw, cy - rh * 1.25, cx + rw, cy + rh * 0.1);
    dome.quadraticCurveTo(cx, cy + rh * 0.42, cx - rw, cy + rh * 0.1);
    dome.closePath();
    x.strokeStyle = hsl(h0, 70, 18); x.lineWidth = 2; x.stroke(dome);
    const g = x.createRadialGradient(cx - rw * 0.3, cy - rh * 0.6, 1, cx, cy - rh * 0.2, rw * 1.1);
    g.addColorStop(0, hsl(h0 + 20, 100, 82)); g.addColorStop(0.35, hsl(h0, 95, 60)); g.addColorStop(0.8, hsl(h0 - 25, 85, 38)); g.addColorStop(1, hsl(h0 - 40, 80, 26));
    x.fillStyle = g; x.fill(dome);
    x.save(); x.clip(dome);
    if (spots) for (let k = 0; k < 5 + floor(rw * 0.2); k++) {
      const sx = cx + (r() - 0.5) * rw * 1.5, sy = cy - rh * (0.2 + r() * 0.7), sr = 1 + r() * rw * 0.12;
      x.fillStyle = hsl(h0 + 180, 100, 88, 0.9); ell(x, sx, sy, sr, sr * 0.75); x.fill();
    }
    x.fillStyle = 'rgba(255,255,255,0.55)'; ell(x, cx - rw * 0.35, cy - rh * 0.65, rw * 0.28, rh * 0.18, -0.3); x.fill();
    x.restore();
    // glowing rim line
    x.strokeStyle = hsl(h0 + 30, 100, 80, 0.9); x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(cx - rw * 0.95, cy + rh * 0.12); x.quadraticCurveTo(cx, cy + rh * 0.48, cx + rw * 0.95, cy + rh * 0.12); x.stroke();
  }
  function mushStem(x, bx, by, tx, ty, w, r) {
    const p = taperP(bx, by, tx, ty, w * 1.2, w * 0.85, (r() - 0.5) * 4);
    const g = x.createLinearGradient(bx - w, 0, bx + w, 0);
    g.addColorStop(0, '#f6eefc'); g.addColorStop(0.5, '#cfc0e0'); g.addColorStop(1, '#7a6a98');
    x.strokeStyle = '#3a2e52'; x.lineWidth = 1.6; x.stroke(p);
    x.fillStyle = g; x.fill(p);
  }

  {
    const id = 'mushroom_glow';
    const layout = (v) => {
      const r = R(3100 + v * 11), m = [];
      const n = 4 + v;
      for (let i = 0; i < n; i++) {
        const big = i === 0;
        m.push({ x: (r() - 0.5) * 44 + (big ? -4 : 0), y: (r() - 0.5) * 14, h: big ? 42 : 14 + r() * 18, rw: big ? 19 : 8 + r() * 6, hue: i * 47 + r() * 20, lean: (r() - 0.5) * 10 });
      }
      m.sort((a, b) => a.y - b.y);
      return m;
    };
    const base = (v) => spr('mushg_b' + v, 120, 100, 60, 80, (x) => {
      const r = R(3150 + v);
      gshadow(x, 2, 2, 32, 9, 0.45, '10,8,30');
      // mossy mound
      x.fillStyle = '#1e3a30'; x.fill(scallopP(0, 2, 36, 9, 12, 0.35, r));
      for (let i = 0; i < 30; i++) { x.fillStyle = r() < 0.5 ? '#2f5a44' : '#3f7a5a'; ell(x, (r() - 0.5) * 54, 2 + (r() - 0.5) * 10, 1.8, 1.2); x.fill(); }
      for (const mm of layout(v)) mushStem(x, mm.x, mm.y + 2, mm.x + mm.lean, mm.y - mm.h, mm.rw * 0.42, r);
    });
    const caps = (v) => hueFrames('mushg_c' + v, 8, 120, 100, 60, 80, (x, hue) => {
      const r = R(3170 + v);
      for (const mm of layout(v)) mushCap(x, mm.x + mm.lean, mm.y - mm.h, mm.rw, mm.rw * 0.62, mm.hue + hue, r);
    });
    const glows = (v) => hueFrames('mushg_g' + v, 8, 190, 170, 95, 125, (x, hue) => {
      for (const mm of layout(v)) {
        const cx = mm.x + mm.lean, cy = mm.y - mm.h, rr = mm.rw * 3.2;
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, rr);
        g.addColorStop(0, hsl(mm.hue + hue, 100, 65, 0.55)); g.addColorStop(0.4, hsl(mm.hue + hue, 100, 55, 0.2)); g.addColorStop(1, hsl(mm.hue + hue, 100, 50, 0));
        x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rr, 0, TAU); x.fill();
      }
    });
    def(id, {
      w: 1, h: 1, solid: false, anim: true,
      lights: (o) => [{ dx: 32, dy: 36, r: 110, color: ['#6affd8', '#c07bff', '#ff7ad0'][vary(o, 3)], flicker: 0.15 }],
      draw(ctx, px, py, o, t) {
        const v = vary(o, 3), bx = px + 32, by = py + 52, ph = hseed(o, 4);
        const u = t * 0.08 + ph;
        blit(ctx, base(v), bx, by);
        additive(ctx, () => blitHue(ctx, glows(v), bx, by, u, 0.7 + 0.3 * sin(t * 2.2 + ph * 9)));
        blitHue(ctx, caps(v), bx, by, u);
        // drifting spores
        additive(ctx, () => {
          for (let i = 0; i < 4; i++) {
            const k = ((t * 0.25 + i * 0.25 + ph) % 1);
            const sx = bx + (U.hash(i, o.x | 0, 8) - 0.5) * 50 + sin(t * 1.3 + i * 2) * 5, sy = by - 20 - k * 50;
            ctx.fillStyle = hsl((u * 360 + i * 70), 100, 75, (1 - k) * 0.9);
            ctx.beginPath(); ctx.arc(sx, sy, 1.4, 0, TAU); ctx.fill();
          }
        });
      },
    });

    // mushroom_harvest: a pickable 七彩靈蕈 clump among the decor ones (ch2 grove, ch7 雲芝). Same clump art, but
    // while ready it breathes brighter, wears a warm halo and sends up twinkling golden motes; once taken
    // (o.picked: bool, or fn(o) → bool for live state, read via G.Objects.flag) it is a dim moss mound with
    // a few pale buds — clearly picked, clearly growing back. The 「採集」 tag is the event's `hint` (engine).
    const buds = (v) => spr('mushh_b' + v, 120, 80, 60, 60, (x) => {
      const r = R(3190 + v);
      gshadow(x, 2, 2, 30, 8, 0.4, '10,8,30');
      x.fillStyle = '#1a3028'; x.fill(scallopP(0, 2, 34, 8, 12, 0.35, r));
      for (let i = 0; i < 26; i++) { x.fillStyle = r() < 0.5 ? '#26483a' : '#30604a'; ell(x, (r() - 0.5) * 50, 2 + (r() - 0.5) * 9, 1.6, 1.1); x.fill(); }
      // the stubs where the clump was cut, and new buds pushing up
      for (const mm of layout(v).slice(0, 3)) { x.fillStyle = '#bfb2d2'; ell(x, mm.x * 0.8, mm.y + 1, mm.rw * 0.32, mm.rw * 0.16); x.fill(); x.strokeStyle = '#3a2e52'; x.lineWidth = 1; x.stroke(); }
      for (let i = 0; i < 4; i++) {
        const bx = (r() - 0.5) * 40, by = (r() - 0.5) * 8, h = 5 + r() * 6, rw = 3 + r() * 2.5;
        mushStem(x, bx, by + 2, bx, by - h, rw * 0.45, r);
        mushCap(x, bx, by - h, rw, rw * 0.7, 180 + i * 50, r, false);
      }
      // wash the buds out so they read as not-yet-glowing
      x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(30,36,52,0.45)'; x.fillRect(-60, -60, 120, 80);
    });
    const halo = spr('mushh_halo', 160, 120, 80, 70, (x) => {
      const g = x.createRadialGradient(0, -16, 0, 0, -16, 70);
      g.addColorStop(0, 'rgba(255,246,200,0.55)'); g.addColorStop(0.35, 'rgba(255,226,140,0.22)'); g.addColorStop(1, 'rgba(255,210,120,0)');
      x.fillStyle = g; x.beginPath(); x.ellipse(0, -16, 70, 54, 0, 0, TAU); x.fill();
    });
    // 4-point twinkle
    const star = (ctx, x, y, s, a) => {
      ctx.fillStyle = `rgba(255,250,220,${a.toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s); ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s); ctx.fill();
    };
    def('mushroom_harvest', {
      w: 1, h: 1, solid: false, anim: true,
      lights: (o) => (G.Objects.flag(o, 'picked')
        ? [{ dx: 32, dy: 44, r: 50, color: '#5a7a6a', flicker: 0.05 }]
        : [{ dx: 32, dy: 36, r: 130, color: '#fff0b8', flicker: 0.25 }]),
      draw(ctx, px, py, o, t) {
        const v = vary(o, 3), bx = px + 32, by = py + 52, ph = hseed(o, 4);
        if (G.Objects.flag(o, 'picked')) {
          blit(ctx, buds(v), bx, by);
          additive(ctx, () => blit(ctx, halo, bx, by + 8, 0.08 + 0.05 * sin(t * 0.9 + ph * 9)));
          return;
        }
        const u = t * 0.08 + ph, pulse = 0.5 + 0.5 * sin(t * 2.6 + ph * 9);
        additive(ctx, () => blit(ctx, halo, bx, by, 0.45 + 0.4 * pulse));
        blit(ctx, base(v), bx, by);
        additive(ctx, () => blitHue(ctx, glows(v), bx, by, u, 0.85 + 0.15 * pulse));
        blitHue(ctx, caps(v), bx, by, u);
        additive(ctx, () => {
          blitHue(ctx, glows(v), bx, by, u, 0.35 * pulse);
          // rising golden motes, larger and slower than the decor clumps' spores
          for (let i = 0; i < 6; i++) {
            const k = ((t * 0.22 + i / 6 + ph) % 1);
            const sx = bx + (U.hash(i, o.x | 0, 9) - 0.5) * 46 + sin(t * 1.1 + i * 2.3) * 7, sy = by - 18 - k * 70;
            const a = sin(k * PI) * (0.6 + 0.4 * sin(t * 7 + i * 3));
            star(ctx, sx, sy, 2.2 + 1.6 * sin(k * PI), a);
          }
          // glints on the caps
          for (const mm of layout(v).slice(0, 3)) {
            const tw = max(0, sin(t * 2.1 + mm.hue));
            if (tw > 0.2) star(ctx, bx + mm.x + mm.lean + mm.rw * 0.3, by + mm.y - mm.h - mm.rw * 0.5, 2 + 4 * tw, tw * 0.95);
          }
        });
      },
    });
  }
  {
    // giant glowing mushroom (2x2). Stem in the bottom row (solid); the cap shelters the top row.
    const id = 'mushroom_giant';
    const base = (v) => spr('mushG_b' + v, 180, 190, 90, 150, (x) => {
      const r = R(3200 + v * 3);
      // anchor = footprint bottom-centre (64,128)
      gshadow(x, 4, -6, 80, 22, 0.45, '10,8,30');
      // roots / mycelium
      for (let i = 0; i < 14; i++) {
        const a = PI + (i / 13) * PI, L = 30 + r() * 30;
        x.strokeStyle = rgba('#d8c8f0', 0.5); x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(0, -14); x.quadraticCurveTo(cos(a) * L * 0.5, -10 + r() * 6, cos(a) * L, -8 + abs(sin(a)) * 10 + r() * 4); x.stroke();
      }
      // stem with skirt (annulus)
      const sp = new Path2D();
      sp.moveTo(-24, -6); sp.bezierCurveTo(-20, -60, -14, -110, -12, -150); sp.lineTo(12, -150); sp.bezierCurveTo(16, -110, 22, -60, 26, -6);
      sp.quadraticCurveTo(0, 2, -24, -6); sp.closePath();
      const g = x.createLinearGradient(-24, 0, 26, 0);
      g.addColorStop(0, '#fbf4ff'); g.addColorStop(0.4, '#d8c8ec'); g.addColorStop(1, '#6a5a8c');
      x.strokeStyle = '#2a2042'; x.lineWidth = 2; x.stroke(sp); x.fillStyle = g; x.fill(sp);
      x.save(); x.clip(sp);
      for (let i = 0; i < 12; i++) { const sx = -20 + r() * 40; x.strokeStyle = rgba('#8a7ab0', 0.35); x.lineWidth = 1; x.beginPath(); x.moveTo(sx, 0); x.quadraticCurveTo(sx * 0.7, -70, sx * 0.5, -150); x.stroke(); }
      x.restore();
      const sk = new Path2D(); sk.moveTo(-17, -96); sk.quadraticCurveTo(0, -104, 17, -96); sk.quadraticCurveTo(22, -84, 14, -80); sk.quadraticCurveTo(0, -86, -14, -80); sk.quadraticCurveTo(-22, -84, -17, -96); sk.closePath();
      x.fillStyle = '#efe6fa'; x.fill(sk); x.strokeStyle = '#4a3a6a'; x.lineWidth = 1.4; x.stroke(sk);
      // small companions at the foot
      for (const [mx, mh, rw] of [[-38, 14, 8], [34, 10, 6], [44, 18, 7]]) mushStem(x, mx, -2, mx + 1, -2 - mh, rw * 0.4, r);
    });
    const capFr = (v) => hueFrames('mushG_c' + v, 8, 220, 236, 110, 214, (x, hue) => {
      const r = R(3220 + v);
      const h0 = [190, 290, 330][v] + hue;
      mushCap(x, 0, -150, 92, 52, h0, r, true);
      for (const [mx, mh, rw, dh] of [[-38, 14, 8, 60], [34, 10, 6, 120], [44, 18, 7, 200]]) mushCap(x, mx + 1, -2 - mh, rw, rw * 0.62, h0 + dh, r);
    });
    const glowFr = (v) => hueFrames('mushG_g' + v, 8, 300, 260, 150, 260, (x, hue) => {
      const h0 = [190, 290, 330][v] + hue;
      const g = x.createRadialGradient(0, -150, 10, 0, -150, 140);
      g.addColorStop(0, hsl(h0, 100, 65, 0.5)); g.addColorStop(0.45, hsl(h0, 100, 55, 0.18)); g.addColorStop(1, hsl(h0, 100, 50, 0));
      x.fillStyle = g; x.beginPath(); x.arc(0, -150, 140, 0, TAU); x.fill();
    });
    def(id, {
      w: 2, h: 2, anim: true, solid: true,
      solidAt: (o, dx, dy) => dy === 1,
      lights: (o) => [{ dx: 64, dy: -20, r: 220, color: ['#5ff0ff', '#b88aff', '#ff7ad0'][vary(o, 3)], flicker: 0.1 }, { dx: 64, dy: 110, r: 90, color: '#d8c8ff', flicker: 0.05 }],
      draw(ctx, px, py, o, t) {
        const v = vary(o, 3), bx = px + 64, by = py + 124, ph = hseed(o, 4), u = t * 0.05 + ph;
        const bob = sin(t * 0.9 + ph * 6) * 1.2;
        blit(ctx, base(v), bx, by);
        additive(ctx, () => blitHue(ctx, glowFr(v), bx, by + bob, u, 0.65 + 0.35 * sin(t * 1.7 + ph * 5)));
        blitHue(ctx, capFr(v), bx, by + bob * 0.5, u);
        // glowing droplets falling from the cap rim
        additive(ctx, () => {
          for (let i = 0; i < 5; i++) {
            const k = (t * 0.35 + i * 0.2 + ph) % 1;
            const dx = (U.hash(i, 3, o.x | 0) - 0.5) * 150, dy = -128 + k * 90;
            ctx.fillStyle = hsl(u * 360 + [190, 290, 330][v] + i * 30, 100, 75, (1 - k) * 0.85);
            ctx.beginPath(); ctx.ellipse(bx + dx, by + dy, 1.6, 2.6, 0, 0, TAU); ctx.fill();
          }
        });
      },
    });
  }
  {
    const id = 'crystal';
    const HUE = [188, 272, 28];
    const layout = (v) => {
      const r = R(3300 + v * 13), m = [];
      const n = 6;
      for (let i = 0; i < n; i++) {
        const big = i === 2;
        m.push({ x: (i - 2.5) * 8 + (r() - 0.5) * 6, y: (r() - 0.5) * 8, a: -PI / 2 + (i - 2.5) * 0.28 + (r() - 0.5) * 0.2, L: big ? 66 : 26 + r() * 30, w: big ? 15 : 8 + r() * 5 });
      }
      m.sort((a, b) => a.L - b.L + (a.y - b.y) * 0.1);
      return m;
    };
    const sp = (v) => spr(id + v, 120, 130, 60, 110, (x) => {
      const r = R(3350 + v);
      const hu = HUE[v];
      gshadow(x, 4, 2, 36, 10, 0.45, '10,8,30');
      // rocky matrix
      x.fillStyle = '#2a2838'; x.fill(scallopP(0, -2, 30, 9, 9, 0.4, r));
      x.fillStyle = '#3e3a52'; x.fill(scallopP(-4, -5, 22, 5, 8, 0.4, r));
      for (const c of layout(v)) {
        const dx = cos(c.a), dy = sin(c.a), nx = -dy, ny = dx;
        const bx = c.x, by = c.y, tx = bx + dx * c.L, ty = by + dy * c.L;
        const sx = bx + dx * c.L * 0.78, sy = by + dy * c.L * 0.78;   // shoulder
        const w = c.w / 2;
        // three visible faces: left (lit), centre, right (shadow)
        const faces = [
          [[bx - nx * w, by - ny * w], [sx - nx * w, sy - ny * w], [tx, ty], [sx - nx * w * 0.1, sy], [bx - nx * w * 0.1, by]],
          [[bx - nx * w * 0.1, by], [sx - nx * w * 0.1, sy], [tx, ty], [sx + nx * w * 0.45, sy + ny * w * 0.45], [bx + nx * w * 0.45, by + ny * w * 0.45]],
          [[bx + nx * w * 0.45, by + ny * w * 0.45], [sx + nx * w * 0.45, sy + ny * w * 0.45], [tx, ty], [sx + nx * w, sy + ny * w], [bx + nx * w, by + ny * w]],
        ];
        const L = [80, 62, 42];
        faces.forEach((f, k) => {
          x.beginPath(); f.forEach((q, j) => (j ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]))); x.closePath();
          const g = x.createLinearGradient(bx, by, tx, ty);
          g.addColorStop(0, hsl(hu + 20, 70, L[k] - 30, 0.95)); g.addColorStop(0.7, hsl(hu, 90, L[k], 0.92)); g.addColorStop(1, hsl(hu - 10, 100, min(96, L[k] + 15), 0.95));
          x.fillStyle = g; x.fill();
        });
        // outline + edge highlights
        x.strokeStyle = hsl(hu + 20, 60, 18); x.lineWidth = 1.4;
        x.beginPath(); x.moveTo(bx - nx * w, by - ny * w); x.lineTo(sx - nx * w, sy - ny * w); x.lineTo(tx, ty); x.lineTo(sx + nx * w, sy + ny * w); x.lineTo(bx + nx * w, by + ny * w); x.stroke();
        x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(bx - nx * w * 0.1, by); x.lineTo(sx - nx * w * 0.1, sy); x.lineTo(tx, ty); x.stroke();
        // inner glints
        x.fillStyle = 'rgba(255,255,255,0.5)';
        ell(x, bx + dx * c.L * 0.45 - nx * w * 0.5, by + dy * c.L * 0.45 - ny * w * 0.5, 1.2, c.L * 0.12, c.a + PI / 2); x.fill();
      }
    });
    const glowSp = (v) => spr(id + 'g' + v, 160, 160, 80, 120, (x) => {
      const g = x.createRadialGradient(0, -34, 4, 0, -34, 76);
      g.addColorStop(0, hsl(HUE[v], 100, 70, 0.55)); g.addColorStop(0.5, hsl(HUE[v], 100, 60, 0.16)); g.addColorStop(1, hsl(HUE[v], 100, 50, 0));
      x.fillStyle = g; x.beginPath(); x.arc(0, -34, 76, 0, TAU); x.fill();
    });
    def(id, {
      w: 1, h: 1, solid: true, anim: true,
      lights: (o) => [{ dx: 32, dy: 20, r: 120, color: ['#7ff4ff', '#c79cff', '#ffc27a'][vary(o, 3)], flicker: 0.08 }],
      draw(ctx, px, py, o, t) {
        const v = vary(o, 3), bx = px + 32, by = py + 54, ph = hseed(o, 4);
        additive(ctx, () => blit(ctx, glowSp(v), bx, by, 0.55 + 0.35 * sin(t * 1.6 + ph * 7)));
        blit(ctx, sp(v), bx, by);
        // twinkles on the tips
        additive(ctx, () => {
          const m = layout(v);
          for (let i = 0; i < m.length; i++) {
            const k = sin(t * 2.3 + i * 1.7 + ph * 9);
            if (k < 0.6) continue;
            const c = m[i], tx = bx + c.x + cos(c.a) * c.L, ty = by + c.y + sin(c.a) * c.L, s = (k - 0.6) * 14;
            ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(tx - s, ty); ctx.lineTo(tx + s, ty); ctx.moveTo(tx, ty - s); ctx.lineTo(tx, ty + s); ctx.stroke();
          }
        });
      },
    });
  }
  {
    // psychedelic geometry pillar: carved plinth + floating rotating sacred-geometry stack (live)
    const id = 'geometry_pillar';
    const base = (v) => spr(id + v, 100, 120, 50, 100, (x) => {
      const r = R(3400 + v);
      gshadow(x, 4, 2, 34, 10, 0.5, '10,8,30');
      // octagonal stone plinth
      const tiers = [[30, 0, 16], [24, -16, 22], [18, -38, 24]];
      for (const [w, y, h] of tiers) {
        const p = new Path2D();
        p.moveTo(-w, y); p.lineTo(-w, y - h); p.quadraticCurveTo(0, y - h - w * 0.35, w, y - h); p.lineTo(w, y); p.quadraticCurveTo(0, y + w * 0.35, -w, y); p.closePath();
        const g = x.createLinearGradient(-w, 0, w, 0);
        g.addColorStop(0, '#6a6480'); g.addColorStop(0.35, '#4a4560'); g.addColorStop(1, '#242032');
        x.fillStyle = g; x.fill(p); x.strokeStyle = '#141020'; x.lineWidth = 1.4; x.stroke(p);
        x.fillStyle = '#7a7494'; ell(x, 0, y - h, w, w * 0.33); x.fill(); x.strokeStyle = '#141020'; x.stroke();
      }
      // engraved runes
      x.strokeStyle = 'rgba(20,16,32,0.8)'; x.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) { const rx = -14 + i * 9; x.beginPath(); x.moveTo(rx, -22); x.lineTo(rx + 3, -30); x.lineTo(rx + 6, -22); x.moveTo(rx + 3, -26); x.lineTo(rx + 3, -18); x.stroke(); }
    });
    def(id, {
      w: 1, h: 1, solid: true, anim: true,
      lights: (o) => [{ dx: 32, dy: -60, r: 150, color: '#c8a0ff', flicker: 0.1 }],
      draw(ctx, px, py, o, t) {
        const v = vary(o, 3), bx = px + 32, by = py + 54, ph = hseed(o, 4) * 10;
        const hue = (t * 40 + ph * 36) % 360;
        // rune glow on plinth
        blit(ctx, base(v), bx, by);
        ctx.save();
        additive(ctx, () => {
          ctx.strokeStyle = hsl(hue, 100, 70, 0.6 + 0.3 * sin(t * 3)); ctx.lineWidth = 1.2;
          for (let i = 0; i < 4; i++) { const rx = bx - 14 + i * 9; ctx.beginPath(); ctx.moveTo(rx, by - 22); ctx.lineTo(rx + 3, by - 30); ctx.lineTo(rx + 6, by - 22); ctx.moveTo(rx + 3, by - 26); ctx.lineTo(rx + 3, by - 18); ctx.stroke(); }
          // light column
          const g = ctx.createLinearGradient(0, by - 150, 0, by - 60);
          g.addColorStop(0, hsl(hue, 100, 60, 0)); g.addColorStop(1, hsl(hue, 100, 65, 0.35));
          ctx.fillStyle = g; ctx.fillRect(bx - 10, by - 150, 20, 90);
          const gg = ctx.createRadialGradient(bx, by - 110, 2, bx, by - 110, 60);
          gg.addColorStop(0, hsl(hue + 40, 100, 70, 0.45)); gg.addColorStop(1, hsl(hue + 40, 100, 60, 0));
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(bx, by - 110, 60, 0, TAU); ctx.fill();
        });
        // rotating polygon rings (projected), stacked
        const rings = [[3, 26, -72, 1.0], [4, 22, -96, -0.7], [6, 18, -142, 0.5]];
        for (let k = 0; k < rings.length; k++) {
          const [n, R0, yy, sp2] = rings[k];
          const y0 = by + yy + sin(t * 1.4 + k) * 3, rot = t * sp2 + ph;
          ctx.beginPath();
          for (let i = 0; i <= n; i++) { const a = rot + i / n * TAU; const qx = bx + cos(a) * R0, qy = y0 + sin(a) * R0 * 0.35; i ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy); }
          ctx.strokeStyle = 'rgba(20,10,40,0.6)'; ctx.lineWidth = 4; ctx.stroke();
          ctx.strokeStyle = hsl(hue + k * 60, 100, 70); ctx.lineWidth = 2; ctx.stroke();
        }
        // floating octahedron
        const cy = by - 118 + sin(t * 1.2 + ph) * 4, a = t * 0.9 + ph, s = 13;
        const ex = cos(a) * s, ez = sin(a) * s * 0.35;
        const top = [bx, cy - s * 1.5], bot = [bx, cy + s * 1.5];
        const eq = [[bx + ex, cy + ez], [bx - ez * 2.8, cy + ex * 0.35], [bx - ex, cy - ez], [bx + ez * 2.8, cy - ex * 0.35]];
        const faces = [];
        for (let i = 0; i < 4; i++) { const p1 = eq[i], p2 = eq[(i + 1) % 4]; faces.push([top, p1, p2, (p1[1] + p2[1]) / 2, i]); faces.push([bot, p1, p2, (p1[1] + p2[1]) / 2 + 0.01, i + 4]); }
        faces.sort((f1, f2) => f1[3] - f2[3]);
        for (const f of faces) {
          ctx.beginPath(); ctx.moveTo(f[0][0], f[0][1]); ctx.lineTo(f[1][0], f[1][1]); ctx.lineTo(f[2][0], f[2][1]); ctx.closePath();
          ctx.fillStyle = hsl(hue + f[4] * 45, 90, f[4] < 4 ? 62 : 40, 0.92); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.8; ctx.stroke();
        }
        ctx.restore();
      },
    });
  }
  {
    // 一息界 jewel flower: rotating faceted gem petals with shifting hues (live)
    const id = 'jewel_flower';
    const stemSp = (v) => spr(id + v, 70, 70, 35, 56, (x) => {
      const r = R(3500 + v);
      gshadow(x, 0, 0, 22, 6, 0.4, '20,10,40');
      x.strokeStyle = '#2a6a5a'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(-5, -22, 0, -42); x.stroke();
      x.strokeStyle = '#7ae0c0'; x.lineWidth = 1.1; x.beginPath(); x.moveTo(-0.7, 0); x.quadraticCurveTo(-5.7, -22, -0.7, -42); x.stroke();
      for (const s of [-1, 1]) {
        const p = leafP(0, -8, s * 18, -16, 4, s * -2);
        x.fillStyle = s < 0 ? '#3ac0a0' : '#2a8a7a'; x.fill(p); x.strokeStyle = '#184a40'; x.lineWidth = 1; x.stroke(p);
        x.strokeStyle = 'rgba(200,255,240,0.6)'; x.beginPath(); x.moveTo(0, -8); x.lineTo(s * 16, -15.5); x.stroke();
      }
    });
    def(id, {
      w: 1, h: 1, solid: false, anim: true,
      lights: (o) => [{ dx: 32, dy: 14, r: 90, color: '#ffd0ff', flicker: 0.12 }],
      draw(ctx, px, py, o, t) {
        const v = vary(o, 3), bx = px + 32, by = py + 52, ph = hseed(o, 4) * 10;
        blit(ctx, stemSp(v), bx, by);
        const cx = bx, cy = by - 48 + sin(t * 1.5 + ph) * 1.5;
        const hue = (t * 50 + ph * 36 + v * 120) % 360;
        additive(ctx, () => {
          const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 54);
          g.addColorStop(0, hsl(hue, 100, 75, 0.5)); g.addColorStop(1, hsl(hue, 100, 60, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 54, 0, TAU); ctx.fill();
        });
        const layer = (n, L, W, rot, hOff, sq) => {
          for (let i = 0; i < n; i++) {
            const a = rot + i / n * TAU, ca = cos(a), sa = sin(a);
            const tip = [cx + ca * L, cy + sa * L * sq], mid = [cx + ca * L * 0.5, cy + sa * L * 0.5 * sq];
            const l = [mid[0] - sa * W, mid[1] + ca * W * sq], rr = [mid[0] + sa * W, mid[1] - ca * W * sq];
            const hh = hue + hOff + i * (360 / n) * 0.35;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(l[0], l[1]); ctx.lineTo(tip[0], tip[1]); ctx.closePath();
            ctx.fillStyle = hsl(hh, 95, 68, 0.95); ctx.fill();
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(rr[0], rr[1]); ctx.lineTo(tip[0], tip[1]); ctx.closePath();
            ctx.fillStyle = hsl(hh + 20, 90, 42, 0.95); ctx.fill();
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(l[0], l[1]); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(rr[0], rr[1]); ctx.closePath();
            ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.8; ctx.stroke();
          }
        };
        layer(8, 28, 8.5, t * 0.35 + ph, 0, 0.62);
        layer(6, 17, 6.3, -t * 0.6 + ph, 120, 0.62);
        // pearl core
        const g2 = ctx.createRadialGradient(cx - 1.5, cy - 2, 0.5, cx, cy, 5);
        g2.addColorStop(0, '#ffffff'); g2.addColorStop(1, hsl(hue + 200, 90, 70));
        ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(cx, cy - 1, 6, 0, TAU); ctx.fill();
        // orbiting sparkles
        additive(ctx, () => {
          for (let i = 0; i < 3; i++) {
            const a = t * 1.3 + i * TAU / 3 + ph;
            ctx.fillStyle = hsl(hue + i * 90, 100, 80, 0.9);
            ctx.beginPath(); ctx.arc(cx + cos(a) * 36, cy + sin(a) * 12 - 4, 1.8, 0, TAU); ctx.fill();
          }
        });
      },
    });
  }
  {
    // hanging vine curtain (over:true, non-solid). o.w = width in tiles. Hangs from y = py-28 to py+60.
    const id = 'vine_curtain';
    const sp = (v, w) => spr(id + v + 'w' + w, w * 64 + 16, 108, 8, 8, (x) => {
      const r = R(3600 + v * 7 + w);
      const W = w * 64;
      // mossy bough / ledge the vines hang from
      const bough = taperP(-6, 4, W + 6, 2, 10, 8, -3);
      x.fillStyle = '#3a2e22'; x.fill(bough); x.strokeStyle = '#1a140e'; x.lineWidth = 1.4; x.stroke(bough);
      for (let i = 0; i < W * 0.6; i++) { x.fillStyle = r() < 0.5 ? '#3f6e2a' : '#6aa03e'; ell(x, r() * W, -1 + r() * 6, 3, 2); x.fill(); }
      const n = floor(W / 9);
      for (let i = 0; i < n; i++) {
        const sx = (i + 0.5) * W / n + (r() - 0.5) * 4, L = 56 + r() * 40, d = r();
        const ex = sx + (r() - 0.5) * 8;
        x.strokeStyle = d < 0.5 ? '#2a4a1e' : '#3e6a2a'; x.lineWidth = 1.3;
        x.beginPath(); x.moveTo(sx, 4); x.bezierCurveTo(sx + (r() - 0.5) * 8, 4 + L * 0.4, ex + (r() - 0.5) * 8, 4 + L * 0.7, ex, 4 + L); x.stroke();
        for (let k = 0; k < L / 8; k++) {
          if (r() < 0.25) continue;
          const u = k * 8 / L, s = k % 2 ? 1 : -1, lx = sx + (ex - sx) * u + sin(u * 6 + i) * 2 + s * 2, ly = 6 + u * L;
          // heart-shaped leaf
          const ls = 0.8 + r() * 0.6;
          x.save(); x.translate(lx, ly); x.rotate(-s * (1.0 + r() * 0.5)); x.scale(ls, ls);
          const p = new Path2D(); p.moveTo(0, 0); p.bezierCurveTo(-5, 1, -5, 7, 0, 10); p.bezierCurveTo(5, 7, 5, 1, 0, 0); p.closePath();
          x.strokeStyle = '#1a3414'; x.lineWidth = 0.8; x.stroke(p);
          x.fillStyle = d < 0.4 ? '#3c6e2a' : (s < 0 ? '#7cbc4c' : '#58983a'); x.fill(p);
          if (d >= 0.4) { x.strokeStyle = 'rgba(220,255,180,0.45)'; x.lineWidth = 0.6; x.beginPath(); x.moveTo(0, 1); x.lineTo(0, 8); x.stroke(); }
          x.restore();
        }
        if (v > 0 && r() < 0.5) {
          // bioluminescent bulbs (靈境 jungle)
          const by = 4 + L * (0.6 + r() * 0.4), bx = sx + (ex - sx) * 0.8;
          x.fillStyle = v === 1 ? '#7affe0' : '#ff9af0'; ell(x, bx, by, 2.4, 3); x.fill();
          x.fillStyle = '#ffffff'; ell(x, bx - 0.6, by - 0.8, 0.8, 1); x.fill();
        }
      }
    });
    def(id, {
      w: 1, h: 1, solid: false, over: true, anim: true,
      lights: (o) => (vary(o, 3) ? [{ dx: (o.w || 1) * 32, dy: 40, r: 70 + (o.w || 1) * 20, color: vary(o, 3) === 1 ? '#7affe0' : '#ff9af0', flicker: 0.1 }] : []),
      draw(ctx, px, py, o, t) {
        const w = o.w || 1;
        blitHang(ctx, sp(vary(o, 3), w), px, py - 28, windK(t, o, 3.5), 4);
      },
    });
  }

  // ============================================================================================
  // cliff_waterfall (2x3, animated): rock face with a falling sheet of water into a plunge pool
  // ============================================================================================
  {
    const id = 'cliff_waterfall';
    const WX0 = 40, WX1 = 90, TOP = -40, POOLY = 160;   // footprint-local px
    const rock = (v) => spr(id + 'r' + v, 160, 260, 16, 60, (x) => {
      // anchor = footprint top-left
      const r = R(3700 + v * 5);
      const P = [STONE, palMix(STONE, '#6a5a44', 0.2), palMix(STONE, '#3a4a40', 0.25)][v];
      // cliff body: one big rock mass with a cool shadowed base and lit upper-left
      const body = new Path2D();
      body.moveTo(-14, POOLY - 14);
      body.bezierCurveTo(-20, 100, -16, 20, -6, TOP + 4);
      body.quadraticCurveTo(64, TOP - 14, 134, TOP + 2);
      body.bezierCurveTo(146, 30, 144, 110, 142, POOLY - 12);
      body.quadraticCurveTo(64, POOLY + 8, -14, POOLY - 14);
      body.closePath();
      x.strokeStyle = P.line; x.lineWidth = 4; x.stroke(body);
      const bg = x.createLinearGradient(0, TOP, 30, POOLY);
      bg.addColorStop(0, P.mid); bg.addColorStop(0.6, P.dark); bg.addColorStop(1, mix(P.dark, P.line, 0.5));
      x.fillStyle = bg; x.fill(body);
      x.save(); x.clip(body);
      // irregular rock masses stacked in uneven strata (natural, not masonry)
      const masses = [];
      for (let row = 0; row < 5; row++) {
        let xx = -20 + r() * 14;
        while (xx < 150) {
          const bw = 30 + r() * 30, bh = 30 + r() * 16;
          masses.push([xx + bw / 2, TOP + 26 + row * 38 + (r() - 0.5) * 12, bw / 2, bh / 2]);
          xx += bw * (0.75 + r() * 0.2);
        }
      }
      masses.sort((m1, m2) => m1[1] - m2[1]);
      for (const [mx, my, mw, mh] of masses) {
        const t0 = U.clamp((my - TOP) / (POOLY - TOP), 0, 1);
        const PP = palMix(P, '#1a2430', t0 * 0.45);
        boulder(x, r, mx, my + mh * 0.6, mw, mh * 1.3, PP, { cracks: 1, moss: r() < 0.3 });
      }
      x.restore();
      // grassy top lip with drooping moss
      x.fillStyle = '#244a1e'; x.fill(scallopP(64, TOP - 6, 82, 16, 16, 0.25, r));
      x.fillStyle = '#4f8a32'; x.fill(scallopP(62, TOP - 9, 76, 12, 14, 0.25, r));
      x.fillStyle = '#7cb64a'; x.fill(scallopP(54, TOP - 12, 56, 7, 12, 0.3, r));
      for (let i = 0; i < 22; i++) {
        const hx = -8 + r() * 146, L = 6 + r() * 22;
        x.strokeStyle = r() < 0.5 ? '#3f7a2a' : '#5f9a3a'; x.lineWidth = 1.4 + r();
        x.beginPath(); x.moveTo(hx, TOP + 2); x.quadraticCurveTo(hx + (r() - 0.5) * 4, TOP + L * 0.6, hx + (r() - 0.5) * 3, TOP + L); x.stroke();
      }
      // wet dark streak behind the falls
      const wg = x.createLinearGradient(WX0 - 10, 0, WX1 + 10, 0);
      wg.addColorStop(0, 'rgba(10,20,30,0)'); wg.addColorStop(0.2, 'rgba(10,20,30,0.5)'); wg.addColorStop(0.8, 'rgba(10,20,30,0.5)'); wg.addColorStop(1, 'rgba(10,20,30,0)');
      x.fillStyle = wg; x.fillRect(WX0 - 10, TOP, WX1 - WX0 + 20, POOLY - TOP - 16);
      // ferns hanging on the cliff
      fernTuft(x, r, 8, 30, 0.7); fernTuft(x, r, 118, 70, 0.7); fernTuft(x, r, 14, 120, 0.6);
      // the pool basin (bottom row)
      x.fillStyle = P.dark; ell(x, 64, POOLY + 4, 68, 26); x.fill();
      const g = x.createRadialGradient(64, POOLY, 4, 64, POOLY + 4, 62);
      g.addColorStop(0, '#5ac0d0'); g.addColorStop(0.6, '#2f7f96'); g.addColorStop(1, '#1d4a62');
      x.fillStyle = g; ell(x, 64, POOLY + 4, 62, 22); x.fill();
      x.strokeStyle = rgba(P.hi, 0.6); x.lineWidth = 1.5; x.beginPath(); x.ellipse(64, POOLY + 4, 62, 22, 0, 0.1, PI - 0.1); x.stroke();
      // rocks around the pool rim
      for (let i = 0; i < 9; i++) {
        const a = PI * 0.05 + i / 8 * PI * 0.9;
        boulder(x, r, 64 + cos(a) * 64, POOLY + 4 + sin(a) * 23, 9 + r() * 6, 9 + r() * 6, P, { cracks: 0, moss: r() < 0.5 });
      }
    });
    const water = () => spr(id + 'w', WX1 - WX0, 64, 0, 0, (x) => {
      // vertically tileable streak texture
      const r = R(3790);
      const W = WX1 - WX0;
      const g = x.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(150,210,230,0.85)'); g.addColorStop(0.3, 'rgba(220,245,255,0.92)'); g.addColorStop(0.7, 'rgba(170,225,240,0.9)'); g.addColorStop(1, 'rgba(110,180,210,0.85)');
      x.fillStyle = g; x.fillRect(0, 0, W, 64);
      for (let i = 0; i < 26; i++) {
        const sx = r() * W, L = 10 + r() * 30, sy = r() * 64;
        x.strokeStyle = r() < 0.6 ? 'rgba(255,255,255,0.8)' : 'rgba(70,140,180,0.6)'; x.lineWidth = 0.8 + r() * 1.6;
        for (const oy of [-64, 0, 64]) { x.beginPath(); x.moveTo(sx, sy + oy); x.lineTo(sx + (r() - 0.5), sy + L + oy); x.stroke(); }
      }
    });
    const mist = () => spr(id + 'm', 180, 90, 90, 45, (x) => {
      const g = x.createRadialGradient(0, 0, 4, 0, 0, 80);
      g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.save(); x.scale(1, 0.5); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 80, 0, TAU); x.fill(); x.restore();
    });
    def(id, {
      w: 2, h: 3, solid: true, anim: true,
      draw(ctx, px, py, o, t) {
        const v = vary(o, 3);
        blit(ctx, rock(v), px, py);
        // falling water: scrolled tileable texture clipped to the column
        const wtex = water();
        const x0 = px + WX0, y0 = py + TOP, h = POOLY - TOP - 4;
        ctx.save();
        ctx.beginPath(); ctx.rect(x0, y0, WX1 - WX0, h); ctx.clip();
        const off = (t * 150) % 64;
        for (let yy = -64 + off; yy < h; yy += 64) ctx.drawImage(wtex, x0, y0 + yy, wtex.lw, 64);
        ctx.restore();
        // lip highlight
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(x0 + (WX1 - WX0) / 2, y0 + 1, (WX1 - WX0) / 2 + 2, 3, 0, 0, TAU); ctx.fill();
        // foam + ripples at the base
        const fx = px + (WX0 + WX1) / 2, fy = py + POOLY - 2;
        ctx.strokeStyle = 'rgba(230,250,255,0.6)'; ctx.lineWidth = 1.2;
        for (let i = 0; i < 3; i++) {
          const k = (t * 0.6 + i / 3) % 1;
          ctx.globalAlpha = 1 - k;
          ctx.beginPath(); ctx.ellipse(fx, fy + 4, 18 + k * 36, 5 + k * 12, 0, 0, TAU); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * TAU + t * 2, rr = 3 + 2.5 * sin(t * 7 + i * 1.7);
          ctx.beginPath(); ctx.arc(fx + cos(a) * 18, fy + sin(a) * 4 - 2, max(1, rr), 0, TAU); ctx.fill();
        }
        blit(ctx, mist(), fx, fy - 4, 0.45 + 0.2 * sin(t * 1.3));
      },
    });
  }

  // ============================================================================================
  // sea_of_clouds (雲海): over:true drifting cloud bank, footprint o.w x o.h (default 4x2)
  // ============================================================================================
  {
    const id = 'sea_of_clouds';
    const puff = (v) => spr(id + v, 250, 150, 125, 105, (x) => {
      const r = R(3800 + v * 9);
      const blobs = [];
      for (let i = 0; i < 11; i++) {
        const u = (i / 10 - 0.5) * 2;
        blobs.push([u * 92 + (r() - 0.5) * 12, -abs(1 - u * u) * 26 - r() * 10 + 6, 22 + (1 - abs(u)) * 22 + r() * 8]);
      }
      // lavender underside, then crisp-edged white puffs lit from the upper left
      for (const [bx, by, br] of blobs) {
        const g = x.createRadialGradient(bx, by + 6, br * 0.5, bx, by + 6, br);
        g.addColorStop(0, 'rgba(168,172,214,0.95)'); g.addColorStop(0.85, 'rgba(176,180,220,0.9)'); g.addColorStop(1, 'rgba(176,180,220,0)');
        x.fillStyle = g; x.beginPath(); x.arc(bx, by + 6, br, 0, TAU); x.fill();
      }
      for (const [bx, by, br] of blobs) {
        const g = x.createRadialGradient(bx - br * 0.35, by - br * 0.45, 1, bx - br * 0.1, by - br * 0.1, br * 0.92);
        g.addColorStop(0, 'rgba(255,253,248,1)'); g.addColorStop(0.6, 'rgba(244,244,252,0.97)'); g.addColorStop(0.88, 'rgba(222,224,242,0.9)'); g.addColorStop(1, 'rgba(222,224,242,0)');
        x.fillStyle = g; x.beginPath(); x.arc(bx - br * 0.08, by - br * 0.1, br * 0.92, 0, TAU); x.fill();
      }
      // flat-ish soft base so the bank reads as a sea of cloud, not a balloon
      const fb = x.createLinearGradient(0, 8, 0, 34);
      fb.addColorStop(0, 'rgba(190,194,228,0.85)'); fb.addColorStop(1, 'rgba(190,194,228,0)');
      x.fillStyle = fb; x.beginPath(); x.ellipse(0, 18, 112, 16, 0, 0, TAU); x.fill();
      // warm dawn sheen on top
      atop(x, vgrad(x, -80, 10, [[0, 'rgba(255,220,190,0.35)'], [1, 'rgba(255,220,190,0)']]), -125, -105, 250, 150);
    });
    def(id, {
      w: 4, h: 2, solid: false, over: true, anim: true,
      draw(ctx, px, py, o, t) {
        const W = (o.w || 4) * 64, H = (o.h || 2) * 64, ph = hseed(o, 4);
        const n = max(2, floor(W / 90));
        const span = W + 160;
        for (let i = 0; i < n; i++) {
          const sp = 6 + U.hash(i, 1, o.x | 0) * 8;
          const s0 = U.hash(i, 2, o.y | 0) * span;
          const xx = ((s0 + t * sp) % span) - 80;
          const yy = py + H * (0.35 + 0.5 * U.hash(i, 3, 7)) + sin(t * 0.3 + i) * 3;
          const edge = min(1, (xx + 80) / 80, (span - 80 - xx) / 80);
          const a = U.clamp(edge, 0, 1) * (0.75 + 0.2 * sin(t * 0.4 + i * 2 + ph * 6));
          blit(ctx, puff(i % 3), px + xx, yy, a);
        }
      },
    });
  }
})();
