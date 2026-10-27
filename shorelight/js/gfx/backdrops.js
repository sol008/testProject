// 彼岸燈 — battle backdrops (G.Backdrops)
//
//   G.Backdrops.draw(ctx, id, t)   fill the 1280x720 logical screen with backdrop `id`; t = seconds
//   G.Backdrops.has(id) -> bool     G.Backdrops.ids() -> array     G.Backdrops.preload(id)  (bake ahead)
//
// Every scene = bake(c, rnd) + live(ctx, t).
//   bake: paints the static painterly layers ONCE into an offscreen 1280x720 canvas (G.U.makeCanvas),
//         cached per id (re-baked only if G.S changes).
//   live: draws only light animated overlays each frame (glow sprites, particles, mist strips,
//         swaying lanterns, beams...). All sprites/strips are cached, so a frame is a handful of drawImage.
// Ground plane convention: enemies stand around y≈420–560 on the left, party y≈430–600 on the right, so
// the band y≈400–620 is kept calm (low-contrast texture only).
'use strict';
(() => {
  const U = G.U;
  const W = 1280, H = 720, TAU = Math.PI * 2;
  const rgba = U.rgba;
  const clamp = U.clamp;
  const mod = (a, n) => ((a % n) + n) % n;
  const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  // =====================================================================================
  // Painting toolkit (bake time)
  // =====================================================================================
  function lg(c, x0, y0, x1, y1, stops) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    for (const s of stops) g.addColorStop(s[0], s[1]);
    return g;
  }
  function rg(c, x, y, r, stops, r0 = 0, fx = x, fy = y) {
    const g = c.createRadialGradient(fx, fy, r0, x, y, r);
    for (const s of stops) g.addColorStop(s[0], s[1]);
    return g;
  }
  function vfill(c, y0, y1, stops, x0 = 0, x1 = W) {
    c.fillStyle = lg(c, 0, y0, 0, y1, stops);
    c.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  function glow(c, x, y, r, col, a = 1, add = true) {
    c.save();
    if (add) c.globalCompositeOperation = 'lighter';
    c.fillStyle = rg(c, x, y, r, [[0, rgba(col, a)], [0.25, rgba(col, a * 0.45)], [0.6, rgba(col, a * 0.12)], [1, rgba(col, 0)]]);
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.restore();
  }
  function ellipse(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); }
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, TAU); }

  // single shared scratch layer for "shape then paint inside it (source-atop)" passes
  let _tmp = null;
  function tmp() {
    if (!_tmp || _tmp.s !== G.S) { _tmp = U.makeCanvas(W, H); _tmp.s = G.S; }
    const x = _tmp.getContext('2d');
    x.setTransform(G.S, 0, 0, G.S, 0, 0);
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    x.clearRect(0, 0, W, H);
    return x;
  }
  function layer(c, shape, paint, alpha = 1) {
    const x = tmp();
    shape(x);
    if (paint) { x.globalCompositeOperation = 'source-atop'; paint(x); x.globalCompositeOperation = 'source-over'; }
    c.save(); c.globalAlpha = alpha; c.drawImage(_tmp, 0, 0, W, H); c.restore();
  }

  function fbm(x, seed, oct = 5, ridged = false, gain = 0.5) {
    let n = 0, a = 1, f = 1, s = 0;
    for (let i = 0; i < oct; i++) {
      let v = U.vnoise(x * f, i * 7.31 + seed * 0.37, seed);
      if (ridged) v = 1 - Math.abs(v * 2 - 1);
      n += v * a; s += a; a *= gain; f *= 2.03;
    }
    return n / s;
  }
  // ridge profile: array [x0,y0,x1,y1,...]
  function profile(o) {
    const p = [];
    const step = o.step || 4;
    for (let x = (o.x0 ?? -10); x <= (o.x1 ?? W + 10); x += step) {
      let y = o.y - fbm(x * (o.freq || 0.004), o.seed || 1, o.oct || 5, o.ridged, o.gain || 0.5) * o.amp;
      if (o.shape) y += o.shape(x);
      p.push(x, y);
    }
    return p;
  }
  function pathProfile(c, p, bottom = H) {
    c.beginPath(); c.moveTo(p[0], bottom);
    for (let i = 0; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
    c.lineTo(p[p.length - 2], bottom); c.closePath();
  }
  function minY(p) { let m = 1e9; for (let i = 1; i < p.length; i += 2) m = Math.min(m, p[i]); return m; }
  // Painterly mountain range: gradient body, slope light/shadow facets, texture, foot haze, rim light.
  function mountain(c, o) {
    const p = o.p || profile(o);
    const top = minY(p), bot = o.bottom || H;
    layer(c, (x) => {
      pathProfile(x, p, bot);
      x.fillStyle = lg(x, 0, top, 0, o.gy1 || bot, [[0, o.col], [1, o.col2 || o.col]]);
      x.fill();
      if (o.trees) treeFringe(x, p, o.trees, x.fillStyle);
    }, (x) => {
      if (o.shade) facets(x, p, bot, o);
      if (o.tex) {
        const r = U.seeded(o.seed * 31 + 7);
        for (let i = 0; i < o.tex; i++) {
          const tx = r() * W, ty = top + r() * (bot - top);
          x.fillStyle = rgba(r() < 0.5 ? (o.light || '#ffffff') : (o.dark || '#000000'), 0.03 + r() * 0.05);
          ellipse(x, tx, ty, 8 + r() * 40, 2 + r() * 6, (r() - 0.5) * 0.4); x.fill();
        }
      }
      if (o.haze) {
        const hy = o.hazeY ?? (top + (bot - top) * 0.25);
        x.fillStyle = lg(x, 0, hy, 0, o.hazeY1 ?? bot, [[0, rgba(o.haze, 0)], [1, rgba(o.haze, o.hazeA ?? 0.8)]]);
        x.fillRect(0, hy, W, bot - hy);
      }
      if (o.paint) o.paint(x, p);
    }, o.alpha ?? 1);
    if (o.rim) {
      c.save(); c.strokeStyle = rgba(o.rim, o.rimA ?? 0.35); c.lineWidth = o.rimW || 1.5; c.lineJoin = 'round';
      c.beginPath();
      for (let i = 0; i < p.length; i += 2) {
        const dy = i + 3 < p.length ? (p[i + 3] - p[i + 1]) : 0;
        if (i === 0 || dy > 1.2) c.moveTo(p[i], p[i + 1] + 0.8); else c.lineTo(p[i], p[i + 1] + 0.8);
      }
      c.stroke(); c.restore();
    }
    return p;
  }
  // painterly light/shadow facets: shadowed right flanks below each peak, lit left flanks, spur lines
  function facets(x, p, bot, o) {
    const n = p.length / 2, win = o.facetWin || 6;
    const Y = (i) => p[i * 2 + 1], X = (i) => p[i * 2];
    const peaks = [];
    for (let i = 1; i < n - 1; i++) {
      let ok = true;
      for (let k = Math.max(0, i - win); k <= Math.min(n - 1, i + win); k++) if (k !== i && Y(k) < Y(i)) { ok = false; break; }
      if (ok) peaks.push(i);
    }
    const lightC = o.light || '#ffffff', darkC = o.dark || '#000000', sh = o.shade;
    const r = U.seeded((o.seed || 1) * 17 + 3);
    for (const pi of peaks) {
      // descend right to valley
      let v = pi; while (v < n - 1 && Y(v + 1) >= Y(v) - 0.5) v++;
      let u = pi; while (u > 0 && Y(u - 1) >= Y(u) - 0.5) u--;
      const px = X(pi), py = Y(pi), depth = Math.min(bot - py, (bot - py) * 0.9);
      const lean = 0.18 + r() * 0.25;
      // shadow (right flank)
      x.fillStyle = lg(x, 0, py, 0, py + depth, [[0, rgba(darkC, 0.5 * sh)], [0.6, rgba(darkC, 0.25 * sh)], [1, rgba(darkC, 0)]]);
      x.beginPath(); x.moveTo(px, py);
      for (let k = pi; k <= v; k++) x.lineTo(X(k), Y(k) + 0.5);
      x.lineTo(X(v) + depth * 0.1, py + depth); x.lineTo(px + depth * lean, py + depth); x.closePath(); x.fill();
      // lit (left flank)
      x.fillStyle = lg(x, 0, py, 0, py + depth * 0.7, [[0, rgba(lightC, 0.4 * sh)], [1, rgba(lightC, 0)]]);
      x.beginPath(); x.moveTo(px, py);
      for (let k = pi; k >= u; k--) x.lineTo(X(k), Y(k) + 0.5);
      x.lineTo(X(u) + depth * 0.2, py + depth * 0.7); x.lineTo(px + depth * lean * 0.7, py + depth * 0.7); x.closePath(); x.fill();
      // spur / gully lines
      x.lineWidth = 1.2;
      for (let k = 0; k < 3; k++) {
        const sx = U.lerp(px, X(v), 0.2 + k * 0.25), sy = yAt(p, sx) + 2, L = depth * (0.25 + r() * 0.35);
        x.strokeStyle = lg(x, 0, sy, 0, sy + L, [[0, rgba(darkC, 0.35 * sh)], [1, rgba(darkC, 0)]]);
        x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + L * 0.1, sy + L * 0.5, sx + L * (0.15 + r() * 0.2), sy + L); x.stroke();
      }
    }
  }
  function yAt(p, x) {
    const i = clamp(Math.round((x - p[0]) / (p[2] - p[0])), 0, p.length / 2 - 1);
    return p[i * 2 + 1];
  }
  // little tree silhouettes along a ridge (drawn in the shape pass, same fill)
  function treeFringe(c, p, o, fill) {
    const r = U.seeded(o.seed || 9);
    c.fillStyle = fill;
    for (let x = p[0]; x < p[p.length - 2]; x += o.gap * (0.5 + r())) {
      if (o.density && r() > o.density) continue;
      const y = yAt(p, x) + 2, s = o.size * (0.6 + r() * 0.7);
      if (o.kind === 'pine') {
        c.beginPath(); c.moveTo(x, y - s * 2.2); c.lineTo(x + s * 0.6, y); c.lineTo(x - s * 0.6, y); c.closePath(); c.fill();
      } else if (o.kind === 'palm') {
        c.fillRect(x - 0.6, y - s * 2.6, 1.2, s * 2.6);
        for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.7; ellipse(c, x + Math.cos(a) * s * 0.55, y - s * 2.6 + Math.sin(a) * s * 0.35 + s * 0.15, s * 0.6, s * 0.14, a); c.fill(); }
      } else {
        circle(c, x, y - s * 0.7, s); c.fill();
        circle(c, x + s * 0.7, y - s * 0.3, s * 0.75); c.fill();
      }
    }
  }

  function stars(c, n, rnd, y1, o = {}) {
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, y = Math.pow(rnd(), o.pow || 1.3) * y1;
      const r = Math.pow(rnd(), 4) * (o.big || 1.6) + 0.35;
      const a = (0.25 + rnd() * 0.75) * (o.a ?? 1) * (1 - y / y1 * 0.6);
      const col = o.cols ? o.cols[Math.floor(rnd() * o.cols.length)] : '#ffffff';
      c.fillStyle = rgba(col, a);
      if (r < 0.9) c.fillRect(x, y, r * 1.4, r * 1.4);
      else { circle(c, x, y, r); c.fill(); if (r > 1.3) glow(c, x, y, r * 6, col, a * 0.35); }
    }
  }
  function milkyWay(c, rnd, x0, y0, x1, y1, w, col = '#c8d4ff', a = 0.12) {
    const n = 60;
    for (let i = 0; i < n; i++) {
      const t = i / n, x = U.lerp(x0, x1, t) + (rnd() - 0.5) * w * 0.6, y = U.lerp(y0, y1, t) + (rnd() - 0.5) * w * 0.6;
      glow(c, x, y, w * (0.3 + rnd() * 0.5), i % 3 ? col : '#ffd9c8', a * (0.4 + rnd() * 0.6));
    }
    for (let i = 0; i < 700; i++) {
      const t = rnd(), sp = (rnd() + rnd() + rnd() - 1.5) * w * 0.55;
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
      const x = U.lerp(x0, x1, t) - dy / L * sp, y = U.lerp(y0, y1, t) + dx / L * sp;
      c.fillStyle = rgba('#ffffff', 0.15 + rnd() * 0.55);
      c.fillRect(x, y, 0.8 + rnd(), 0.8 + rnd());
    }
    // dark dust lane
    for (let i = 0; i < 26; i++) {
      const t = i / 26, x = U.lerp(x0, x1, t) + (rnd() - 0.5) * w * 0.25, y = U.lerp(y0, y1, t) + (rnd() - 0.5) * w * 0.15;
      c.fillStyle = rgba('#05060c', 0.05 + rnd() * 0.06);
      ellipse(c, x, y, w * 0.25 * (0.5 + rnd()), w * 0.06, Math.atan2(y1 - y0, x1 - x0)); c.fill();
    }
  }
  function moon(c, x, y, r, o = {}) {
    const col = o.col || '#f3f0dc';
    glow(c, x, y, r * (o.halo || 7), o.haloCol || '#9fb6e0', o.haloA ?? 0.35);
    glow(c, x, y, r * 2.2, col, 0.35);
    c.fillStyle = rg(c, x, y, r, [[0, U.shade(col, 0.4)], [0.8, col], [1, U.shade(col, -0.1)]], 0, x - r * 0.3, y - r * 0.3);
    circle(c, x, y, r); c.fill();
    const rr = U.seeded(77);
    c.save(); circle(c, x, y, r); c.clip();
    for (let i = 0; i < 9; i++) {
      c.fillStyle = rgba(U.shade(col, -0.35), 0.08 + rr() * 0.1);
      ellipse(c, x + (rr() - 0.5) * r * 1.4, y + (rr() - 0.5) * r * 1.4, r * (0.1 + rr() * 0.25), r * (0.08 + rr() * 0.2)); c.fill();
    }
    if (o.phase) { c.fillStyle = rgba(o.sky || '#0a0f20', 0.92); circle(c, x + r * o.phase, y - r * 0.15, r * 1.02); c.fill(); }
    c.restore();
  }
  function sun(c, x, y, r, col = '#fff1c4', halo = '#ffb36b', ha = 0.5) {
    glow(c, x, y, r * 12, halo, ha * 0.6);
    glow(c, x, y, r * 4, col, ha);
    c.fillStyle = rg(c, x, y, r, [[0, '#ffffff'], [0.7, col], [1, rgba(col, 0.8)]]);
    circle(c, x, y, r); c.fill();
  }
  // soft painterly cloud: union of puffs, shaded top->bottom with rim light
  function cloud(c, x, y, w, h, o = {}) {
    const r = U.seeded(o.seed || (x * 7 + y * 13) | 0);
    const puffs = [];
    const n = o.n || Math.max(6, Math.round(w / (h * 0.45)));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, px = x - w / 2 + t * w + (r() - 0.5) * w / n;
      const bulge = Math.sin(t * Math.PI);
      const pr = h * (0.28 + bulge * 0.42) * (0.75 + r() * 0.5);
      puffs.push([px, y - pr * 0.55 - bulge * h * 0.2 + (r() - 0.5) * h * 0.15, pr]);
    }
    layer(c, (k) => {
      k.fillStyle = '#fff';
      for (const p of puffs) { circle(k, p[0], p[1], p[2]); k.fill(); }
      ellipse(k, x, y, w / 2, h * 0.18); k.fill();
      if (o.flat !== false) { k.globalCompositeOperation = 'destination-out'; k.fillRect(x - w, y + h * 0.12, w * 2, h * 2); k.globalCompositeOperation = 'source-over'; }
    }, (k) => {
      k.fillStyle = lg(k, 0, y - h, 0, y + h * 0.15, [[0, o.top || '#ffffff'], [0.55, o.mid || o.top || '#f1f3f8'], [1, o.bot || '#b9c2d6']]);
      k.fillRect(x - w, y - h * 1.5, w * 2, h * 2);
      for (const p of puffs) {
        k.fillStyle = rg(k, p[0] - p[2] * 0.35, p[1] - p[2] * 0.4, p[2] * 1.1, [[0, rgba(o.hi || '#ffffff', o.hiA ?? 0.45)], [1, rgba(o.hi || '#ffffff', 0)]]);
        k.fillRect(p[0] - p[2] * 1.5, p[1] - p[2] * 1.5, p[2] * 3, p[2] * 3);
      }
      if (o.rim) {
        k.globalCompositeOperation = 'source-atop';
        k.fillStyle = lg(k, x - w / 2, 0, x + w / 2, 0, [[0, rgba(o.rim, 0)], [o.rimSide === 'left' ? 0 : 1, rgba(o.rim, o.rimA ?? 0.5)], [o.rimSide === 'left' ? 0.4 : 0.6, rgba(o.rim, 0)]]);
        k.fillRect(x - w, y - h * 1.5, w * 2, h * 2);
      }
    }, o.a ?? 1);
  }
  function cloudBand(c, rnd, y, h, n, o) {
    for (let i = 0; i < n; i++) cloud(c, rnd() * (W + 200) - 100, y + (rnd() - 0.5) * h, 140 + rnd() * 260, 30 + rnd() * h * 0.6, Object.assign({ seed: (rnd() * 1e6) | 0 }, o));
  }

  // water body with perspective streaks and an optional light path
  function water(c, y0, y1, o) {
    vfill(c, y0, y1, o.stops);
    const r = U.seeded(o.seed || 5);
    for (let i = 0; i < (o.streaks ?? 220); i++) {
      const d = Math.pow(r(), 1.8);
      const y = y0 + d * (y1 - y0);
      const len = 20 + d * 160 * r();
      c.fillStyle = rgba(r() < (o.darkRatio ?? 0.45) ? (o.dark || '#000000') : (o.light || '#ffffff'), (0.03 + r() * 0.07) * (o.streakA ?? 1));
      c.fillRect(r() * W - len / 2, y, len, 0.6 + d * 2.2);
    }
    if (o.path) {
      const pp = o.path;
      for (let i = 0; i < (pp.n || 120); i++) {
        const d = Math.pow(r(), 1.3), y = y0 + d * (y1 - y0);
        const spread = (pp.w0 || 20) + d * (pp.w1 || 220);
        const x = pp.x + (r() + r() - 1) * spread;
        const len = 8 + d * 60 * r();
        c.fillStyle = rgba(pp.col, (pp.a || 0.6) * (0.3 + r() * 0.7) * (1 - Math.abs(x - pp.x) / (spread * 1.2)));
        c.fillRect(x - len / 2, y, len, 0.8 + d * 2.5);
      }
    }
    if (o.horizonGlow) { c.fillStyle = lg(c, 0, y0, 0, y0 + 30, [[0, rgba(o.horizonGlow, 0.35)], [1, rgba(o.horizonGlow, 0)]]); c.fillRect(0, y0, W, 30); }
  }

  // ground with perspective: base gradient, soft texture blots, optional central light pool
  function groundBase(c, y0, o) {
    c.save();
    if (o.shape) { o.shape(c); c.clip(); }
    vfill(c, y0, H, o.stops);
    const r = U.seeded(o.seed || 3);
    for (let i = 0; i < (o.blots ?? 160); i++) {
      const d = r(), y = y0 + d * d * (H - y0);
      const s = 10 + d * 70;
      softBlob(c, r() * W, y, s * (1.5 + r() * 2.5), s * (0.25 + d * 0.25), r() < 0.5 ? (o.dark || '#000000') : (o.light || '#ffffff'), (0.03 + r() * 0.06) * (o.blotA ?? 1));
    }
    if (o.speckle) speckle(c, r, y0, H, o.speckle, o.speckCols || [o.dark || '#000000', o.light || '#ffffff'], o.speckA ?? 0.25);
    if (o.pool) { c.fillStyle = rg(c, o.pool.x, o.pool.y, o.pool.r, [[0, rgba(o.pool.col, o.pool.a)], [1, rgba(o.pool.col, 0)]]); c.save(); c.translate(o.pool.x, o.pool.y); c.scale(1, o.pool.sy || 0.35); c.translate(-o.pool.x, -o.pool.y); c.fillRect(o.pool.x - o.pool.r, o.pool.y - o.pool.r, o.pool.r * 2, o.pool.r * 2); c.restore(); }
    c.restore();
  }
  function softBlob(c, x, y, rx, ry, col, a) {
    c.save(); c.translate(x, y); c.scale(rx / ry, 1);
    c.fillStyle = rg(c, 0, 0, ry, [[0, rgba(col, a)], [0.6, rgba(col, a * 0.5)], [1, rgba(col, 0)]]);
    c.fillRect(-ry, -ry, ry * 2, ry * 2); c.restore();
  }
  // small pebbles / grit with perspective scaling
  function speckle(c, r, y0, y1, n, cols, a) {
    for (let i = 0; i < n; i++) {
      const d = r(), y = y0 + d * d * (y1 - y0), s = 0.6 + d * 3.2 * (0.4 + r());
      c.fillStyle = rgba(cols[Math.floor(r() * cols.length)], a * (0.3 + r() * 0.7));
      ellipse(c, r() * W, y, s * 1.4, s * 0.6); c.fill();
    }
  }
  // perspective paving stones: rows grow toward the viewer, stones vary in tone
  function pavers(c, y0, y1, rows, o) {
    const r = U.seeded(o.seed || 12);
    for (let i = 0; i < rows; i++) {
      const fa = Math.pow(i / rows, o.pow || 1.7), fb = Math.pow((i + 1) / rows, o.pow || 1.7);
      const ya = y0 + fa * (y1 - y0), yb = y0 + fb * (y1 - y0), sw = (o.w0 || 30) + fb * (o.w1 || 150);
      let x = -r() * sw;
      while (x < W) {
        const w = sw * (0.7 + r() * 0.6);
        const tone = r();
        c.fillStyle = rgba(tone < 0.5 ? o.dark : o.light, (o.var ?? 0.08) * (0.3 + r()));
        c.fillRect(x + 1, ya + 1, w - 2, yb - ya - 1);
        c.fillStyle = rgba(o.light, (o.hi ?? 0.12) * (0.4 + fb)); c.fillRect(x + 2, ya + 1, w - 4, 1);
        c.fillStyle = rgba(o.gap, o.gapA ?? 0.5); c.fillRect(x, ya, 1 + fb * 1.5, yb - ya);
        x += w;
      }
      c.fillStyle = rgba(o.gap, o.gapA ?? 0.5); c.fillRect(0, yb - 0.5, W, 0.8 + fb * 1.5);
    }
  }
  // perspective lines converging to a vanishing point (for planks / pavers / rails)
  function perspLines(c, y0, y1, vx, vy, xs, col, a, lw = 1) {
    c.save(); c.strokeStyle = rgba(col, a); c.lineWidth = lw;
    for (const xb of xs) {
      const t0 = (y0 - vy) / (y1 - vy);
      c.beginPath(); c.moveTo(vx + (xb - vx) * t0, y0); c.lineTo(xb, y1); c.stroke();
    }
    c.restore();
  }
  // horizontal course lines whose spacing grows toward the viewer
  function courses(c, y0, y1, n, col, a, pow = 1.8, lw = 1) {
    c.save(); c.fillStyle = rgba(col, a);
    for (let i = 1; i <= n; i++) { const y = y0 + Math.pow(i / n, pow) * (y1 - y0); c.fillRect(0, y, W, lw * (0.5 + i / n)); }
    c.restore();
  }
  function grass(c, rnd, y0, y1, n, cols, o = {}) {
    c.save(); c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const d = rnd(), y = y0 + d * (y1 - y0), x = rnd() * W;
      const h = (o.h || 14) * (0.4 + d * 1.2) * (0.6 + rnd() * 0.8);
      c.strokeStyle = cols[Math.floor(rnd() * cols.length)];
      c.globalAlpha = (o.a ?? 0.8) * (0.5 + d * 0.5);
      c.lineWidth = 0.8 + d * 1.4;
      const lean = (o.lean ?? 0) * h + (rnd() - 0.5) * h * 0.5;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h); c.stroke();
    }
    c.restore();
  }
  function vignette(c, a = 0.55, col = '#000000', inner = 0.45) {
    c.fillStyle = rg(c, W / 2, H * 0.48, W * 0.78, [[inner, rgba(col, 0)], [1, rgba(col, a)]]);
    c.fillRect(0, 0, W, H);
  }
  function grain(c, rnd, n = 5000, a = 0.035) {
    for (let i = 0; i < n; i++) {
      c.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${a * rnd()})` : `rgba(0,0,0,${a * 1.4 * rnd()})`;
      c.fillRect(rnd() * W, rnd() * H, 1.2, 1.2);
    }
  }
  function grade(c, col, a, op = 'soft-light', stops) {
    c.save(); c.globalCompositeOperation = op;
    c.fillStyle = stops ? lg(c, 0, 0, 0, H, stops) : rgba(col, a);
    c.fillRect(0, 0, W, H); c.restore();
  }
  // light shafts (bake)
  function rays(c, x, y, ang, spread, len, n, col, a, rnd) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const aa = ang + (rnd() - 0.5) * spread, w = 10 + rnd() * 50;
      const ex = x + Math.cos(aa) * len, ey = y + Math.sin(aa) * len;
      const nx = -Math.sin(aa), ny = Math.cos(aa);
      c.fillStyle = lg(c, x, y, ex, ey, [[0, rgba(col, a * (0.4 + rnd() * 0.6))], [1, rgba(col, 0)]]);
      c.beginPath(); c.moveTo(x + nx * w * 0.2, y + ny * w * 0.2); c.lineTo(ex + nx * w, ey + ny * w); c.lineTo(ex - nx * w, ey - ny * w); c.lineTo(x - nx * w * 0.2, y - ny * w * 0.2); c.closePath(); c.fill();
    }
    c.restore();
  }

  // ---- trees & plants -------------------------------------------------------------
  function pine(c, x, y, h, col, o = {}) {
    const w = h * (o.wr || 0.36), tiers = o.tiers || 6;
    const fill = o.light ? lg(c, x - w, 0, x + w, 0, [[0, o.light], [0.45, col], [1, o.dark || U.shade(col, -0.4)]]) : col;
    c.fillStyle = o.trunk || U.shade(col, -0.2);
    c.fillRect(x - h * 0.018, y - h * 0.3, h * 0.036, h * 0.3);
    c.fillStyle = fill;
    for (let i = 0; i < tiers; i++) {
      const f = i / tiers, ty = y - h * 0.12 - f * h * 0.82, tw = w * (1 - f * 0.85), th = h * 0.82 / tiers * 1.9;
      c.beginPath(); c.moveTo(x, ty - th);
      c.quadraticCurveTo(x - tw * 0.35, ty - th * 0.35, x - tw, ty + th * 0.08);
      for (let k = 0; k <= 4; k++) c.lineTo(x - tw + tw * 2 * k / 4, ty + (k % 2 ? -th * 0.08 : th * 0.06));
      c.quadraticCurveTo(x + tw * 0.35, ty - th * 0.35, x, ty - th);
      c.fill();
    }
  }
  // broadleaf tree with clustered, individually shaded canopy blobs
  function broadTree(c, x, y, h, cols, rnd, o = {}) {
    const [hi, mid, dk] = cols;
    const trunkCol = o.trunk || '#3a2a22';
    const cw = h * (o.wr || 0.45), cy = y - h * (o.cy || 0.62);
    c.fillStyle = lg(c, x - h * 0.05, 0, x + h * 0.05, 0, [[0, U.shade(trunkCol, 0.2)], [1, U.shade(trunkCol, -0.35)]]);
    c.beginPath(); c.moveTo(x - h * 0.06, y); c.quadraticCurveTo(x - h * 0.025, y - h * 0.3, x - h * 0.02, cy); c.lineTo(x + h * 0.02, cy); c.quadraticCurveTo(x + h * 0.03, y - h * 0.3, x + h * 0.07, y); c.closePath(); c.fill();
    c.strokeStyle = trunkCol; c.lineWidth = h * 0.015; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const by = cy + h * 0.15 * rnd(); c.beginPath(); c.moveTo(x, by); c.quadraticCurveTo(x + (rnd() - 0.5) * cw * 0.6, by - h * 0.15, x + (rnd() - 0.5) * cw * 1.2, by - h * 0.22); c.stroke(); }
    const n = o.n || 14;
    const blobs = [];
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd());
      blobs.push([x + Math.cos(a) * d * cw * 0.85, cy + Math.sin(a) * d * h * 0.28 - h * 0.05, h * (0.1 + rnd() * 0.1) * (1.2 - d * 0.4)]);
    }
    blobs.sort((a, b) => a[1] - b[1]);
    for (const b of blobs) {
      const shadeT = clamp((b[1] - (cy - h * 0.3)) / (h * 0.55), 0, 1);
      c.fillStyle = rg(c, b[0], b[1], b[2], [[0, U.mix(hi, mid, shadeT * 0.8)], [0.6, U.mix(mid, dk, shadeT * 0.6)], [1, dk]], 0, b[0] - b[2] * 0.4, b[1] - b[2] * 0.45);
      circle(c, b[0], b[1], b[2]); c.fill();
    }
  }
  function bamboo(c, x, y, h, col, rnd, lean = 0) {
    const w = 3 + h * 0.012;
    c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'butt';
    const tx = x + lean * h;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + lean * h * 0.3, y - h * 0.6, tx, y - h); c.stroke();
    c.strokeStyle = U.shade(col, -0.35); c.lineWidth = 1.2;
    for (let k = 1; k < 9; k++) { const f = k / 9, px = U.lerp(x, tx, f * f * 0.8 + f * 0.2), py = y - h * f; c.beginPath(); c.moveTo(px - w * 0.7, py); c.lineTo(px + w * 0.7, py); c.stroke(); }
    c.fillStyle = col;
    for (let k = 0; k < 14; k++) {
      const f = 0.45 + rnd() * 0.55, px = U.lerp(x, tx, f), py = y - h * f, a = (rnd() < 0.5 ? -1 : 1) * (0.3 + rnd() * 0.9) + Math.PI / 2 * 0;
      ellipse(c, px + Math.cos(a) * 12, py + Math.sin(a) * 4 + 6, 14, 2.6, a * 0.5 + 0.4 * Math.sign(a)); c.fill();
    }
  }
  function treeFern(c, x, y, h, col, rnd) { // 筆筒樹
    c.strokeStyle = U.shade(col, -0.3); c.lineWidth = h * 0.04; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + h * 0.04, y - h * 0.5, x, y - h * 0.85); c.stroke();
    const cx = x, cy = y - h * 0.85;
    for (let i = 0; i < 11; i++) {
      const a = -Math.PI / 2 + (i / 10 - 0.5) * 3.4, L = h * (0.38 + rnd() * 0.12);
      const ex = cx + Math.cos(a) * L, ey = cy + Math.sin(a) * L * 0.55 + L * 0.35 * Math.abs(Math.cos(a));
      c.strokeStyle = col; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(cx, cy); c.quadraticCurveTo((cx + ex) / 2, cy - L * 0.2, ex, ey); c.stroke();
      c.fillStyle = col;
      for (let k = 2; k < 12; k++) {
        const f = k / 12, px = U.lerp(cx, ex, f), py = U.lerp(cy, ey, f) - Math.sin(f * Math.PI) * L * 0.2 * (1 - f * 0.3);
        const ll = L * 0.13 * (1 - f * 0.6);
        ellipse(c, px, py, ll, 1.6, a + 1.4); c.fill(); ellipse(c, px, py, ll, 1.6, a - 1.4); c.fill();
      }
    }
  }
  function palm(c, x, y, h, col, rnd, lean = 0) { // betel / coconut style
    const tx = x + lean * h, ty = y - h;
    c.strokeStyle = U.shade(col, -0.15); c.lineWidth = Math.max(2, h * 0.025); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + lean * h * 0.2, y - h * 0.5, tx, ty); c.stroke();
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i / 8 - 0.5) * 4.2 + (rnd() - 0.5) * 0.3, L = h * (0.25 + rnd() * 0.1);
      const ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.5 + L * 0.45;
      c.strokeStyle = col; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty - L * 0.25, ex, ey); c.stroke();
      c.fillStyle = col;
      for (let k = 2; k < 10; k++) {
        const f = k / 10, qx = U.lerp(tx, ex, f), qy = U.lerp(ty, ey, f) - Math.sin(f * Math.PI) * L * 0.28;
        ellipse(c, qx, qy + 3, L * 0.09, 1.2, a + 1.9); c.fill(); ellipse(c, qx, qy + 3, L * 0.09, 1.2, a + 1.2); c.fill();
      }
    }
  }
  function pandanus(c, x, y, h, col, rnd) { // 林投: prop roots, forked trunk, dense drooping strap-leaf crowns
    const dk = U.shade(col, -0.35), lt = U.shade(col, 0.18);
    c.strokeStyle = dk; c.lineCap = 'round';
    for (let i = 0; i < 6; i++) { c.lineWidth = 2 + rnd() * 2.5; const rx = x + (i - 2.5) * h * 0.07; c.beginPath(); c.moveTo(rx, y); c.quadraticCurveTo(rx * 0.6 + x * 0.4, y - h * 0.16, x, y - h * 0.26); c.stroke(); }
    const crowns = [];
    c.lineWidth = h * 0.04;
    const nC = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < nC; i++) {
      const a = -Math.PI / 2 + (i - (nC - 1) / 2) * 0.6 + (rnd() - 0.5) * 0.3, L = h * (0.35 + rnd() * 0.3);
      const ex = x + Math.cos(a) * L, ey = y - h * 0.26 + Math.sin(a) * L;
      c.strokeStyle = dk; c.beginPath(); c.moveTo(x, y - h * 0.26); c.quadraticCurveTo(x + Math.cos(a) * L * 0.3, y - h * 0.26 + Math.sin(a) * L * 0.75, ex, ey); c.stroke();
      crowns.push([ex, ey, 0.8 + rnd() * 0.4]);
    }
    for (const [cx, cy, sc] of crowns) {
      for (let k = 0; k < 26; k++) {
        const a = -Math.PI / 2 + (k / 25 - 0.5) * 5.0 + (rnd() - 0.5) * 0.2, L = h * (0.2 + rnd() * 0.14) * sc;
        const droop = Math.abs(Math.cos(a)) * L * 0.6;
        const ex = cx + Math.cos(a) * L, ey = cy + Math.sin(a) * L * 0.7 + droop;
        const mx = cx + Math.cos(a) * L * 0.6, my = cy + Math.sin(a) * L * 0.6 - L * 0.12;
        const w = Math.max(1.5, h * 0.012);
        const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
        c.fillStyle = k % 4 === 0 ? lt : (k % 3 ? col : dk);
        c.beginPath(); c.moveTo(cx + nx, cy + ny); c.quadraticCurveTo(mx + nx, my + ny, ex, ey); c.quadraticCurveTo(mx - nx, my - ny, cx - nx, cy - ny); c.closePath(); c.fill();
      }
    }
  }
  function rock(c, x, y, w, h, cols, rnd) {
    const [hi, mid, dk] = cols;
    const n = 9, pts = [];
    for (let i = 0; i < n; i++) { const a = Math.PI + i / (n - 1) * Math.PI; pts.push([x + Math.cos(a) * w * (0.8 + rnd() * 0.25), y + Math.sin(a) * h * (0.75 + rnd() * 0.3)]); }
    c.fillStyle = lg(c, x - w, y - h, x + w * 0.6, y, [[0, hi], [0.45, mid], [1, dk]]);
    c.beginPath(); c.moveTo(x - w, y); for (const p of pts) c.lineTo(p[0], p[1]); c.lineTo(x + w, y); c.closePath(); c.fill();
    c.fillStyle = rgba(dk, 0.5); ellipse(c, x, y, w * 1.05, h * 0.12); c.fill();
  }

  // ---- architecture ----------------------------------------------------------------
  // 閩南 swallowtail-ridged roof (燕尾脊). (x = centre, y = eave line, w = eave width, h = roof height)
  function swallowRoof(c, x, y, w, h, o = {}) {
    const tile = o.tile || '#7a2f24', ridge = o.ridge || '#9b3a2c', dk = U.shade(tile, -0.45);
    // roof body with a gentle concave sag
    c.fillStyle = lg(c, 0, y - h, 0, y, [[0, U.shade(tile, 0.12)], [1, dk]]);
    c.beginPath(); c.moveTo(x - w / 2, y); c.quadraticCurveTo(x - w * 0.42, y - h * 0.55, x - w * 0.36, y - h); c.lineTo(x + w * 0.36, y - h); c.quadraticCurveTo(x + w * 0.42, y - h * 0.55, x + w / 2, y); c.closePath(); c.fill();
    // tile rows
    c.strokeStyle = rgba(dk, 0.6); c.lineWidth = 1;
    for (let i = -14; i <= 14; i++) { const f = i / 14; c.beginPath(); c.moveTo(x + f * w * 0.36, y - h); c.lineTo(x + f * w * 0.5, y); c.stroke(); }
    // eave board
    c.fillStyle = o.eave || '#2b1d18'; c.fillRect(x - w / 2 - 4, y - 2, w + 8, 5);
    // ridge with upswept swallowtails
    const rw = w * 0.36, rh = Math.max(4, h * 0.13);
    c.fillStyle = ridge;
    c.beginPath();
    c.moveTo(x - rw, y - h); c.lineTo(x + rw, y - h);
    c.quadraticCurveTo(x + rw + h * 0.35, y - h - rh * 0.4, x + rw + h * 0.62, y - h - rh * 3.2);
    c.quadraticCurveTo(x + rw + h * 0.3, y - h - rh * 1.4, x + rw - h * 0.05, y - h - rh);
    c.lineTo(x - rw + h * 0.05, y - h - rh);
    c.quadraticCurveTo(x - rw - h * 0.3, y - h - rh * 1.4, x - rw - h * 0.62, y - h - rh * 3.2);
    c.quadraticCurveTo(x - rw - h * 0.35, y - h - rh * 0.4, x - rw, y - h);
    c.closePath(); c.fill();
    c.fillStyle = rgba('#ffffff', 0.18); c.fillRect(x - rw, y - h - rh, rw * 2, 1.5);
    if (o.orn) { // ridge ornament (pearl + dragons simplified)
      c.fillStyle = o.orn; circle(c, x, y - h - rh - 6, 5); c.fill();
      c.strokeStyle = o.orn; c.lineWidth = 3; c.lineCap = 'round';
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x + s * 10, y - h - rh - 2); c.bezierCurveTo(x + s * 30, y - h - rh - 18, x + s * 50, y - h - rh + 4, x + s * 70, y - h - rh - 12); c.stroke(); }
    }
  }
  function lanternShape(c, x, y, r, col, lit = 1, o = {}) {
    const rh = r * (o.tall || 1.25);
    const hi = U.mix(col, '#ffe9a0', 0.55 * lit), dk = U.shade(col, -0.55);
    c.fillStyle = rg(c, x, y, r * 1.2, [[0, lit > 0.3 ? U.mix(hi, '#fff6d0', 0.4) : U.shade(col, 0.15)], [0.55, U.mix(col, hi, 0.4 * lit)], [1, dk]], 0, x - r * 0.25, y - rh * 0.2);
    ellipse(c, x, y, r, rh); c.fill();
    c.strokeStyle = rgba(dk, 0.55); c.lineWidth = Math.max(0.6, r * 0.06);
    for (let k = -2; k <= 2; k++) { c.beginPath(); c.ellipse(x, y, Math.abs(k) * r * 0.32 + 0.01, rh, 0, -Math.PI / 2, Math.PI / 2, k < 0); c.stroke(); }
    c.fillStyle = o.cap || '#2a1a12';
    c.fillRect(x - r * 0.55, y - rh - r * 0.18, r * 1.1, r * 0.28);
    c.fillRect(x - r * 0.5, y + rh - r * 0.1, r * 1.0, r * 0.26);
    if (o.tassel !== false) { c.strokeStyle = o.tasselCol || '#e8b04a'; c.lineWidth = Math.max(0.8, r * 0.12); c.beginPath(); c.moveTo(x, y + rh + r * 0.15); c.lineTo(x, y + rh + r * 0.9); c.stroke(); }
    if (o.char && r > 8) { c.fillStyle = rgba('#1a0a06', 0.65); c.font = G.font(Math.round(r * 0.95), true); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(o.char, x, y + r * 0.05); }
  }
  // wooden 九份-style building facade with black tar-paper roof(s)
  function jiufenHouse(c, x, yb, w, h, o) {
    const night = o.night, rnd = o.rnd;
    const wood = o.wood || (night ? '#3b2a26' : '#7a5a44');
    const floors = o.floors || 1, fh = h / floors;
    for (let f = 0; f < floors; f++) {
      const y1 = yb - f * fh, y0 = y1 - fh;
      const inset = f * w * 0.03;
      c.fillStyle = lg(c, x + inset, 0, x + w - inset, 0, [[0, U.shade(wood, night ? 0.05 : 0.18)], [1, U.shade(wood, -0.3)]]);
      c.fillRect(x + inset, y0 + 6, w - inset * 2, fh - 6);
      c.strokeStyle = rgba('#000000', 0.18); c.lineWidth = 1;
      for (let px = x + inset + 7; px < x + w - inset; px += 7) { c.beginPath(); c.moveTo(px, y0 + 8); c.lineTo(px, y1); c.stroke(); }
      // windows
      const nw = Math.max(1, Math.floor((w - inset * 2) / 46));
      for (let k = 0; k < nw; k++) {
        const wx = x + inset + (k + 0.5) * (w - inset * 2) / nw - 13, wy = y0 + fh * 0.3, ww = 26, wh = fh * 0.42;
        if (night) {
          const lit = rnd() < 0.8;
          c.fillStyle = lit ? lg(c, 0, wy, 0, wy + wh, [[0, '#ffd27a'], [1, '#e08a3a']]) : '#1a1414';
          c.fillRect(wx, wy, ww, wh);
          if (lit) glow(c, wx + ww / 2, wy + wh / 2, 40, '#ff9d4a', 0.18);
        } else {
          c.fillStyle = '#2c2226'; c.fillRect(wx, wy, ww, wh);
          c.fillStyle = rgba('#bcd6ee', 0.25); c.fillRect(wx + 2, wy + 2, ww - 4, wh * 0.4);
        }
        c.strokeStyle = night ? '#2a1a14' : '#4a3326'; c.lineWidth = 1.5;
        c.strokeRect(wx, wy, ww, wh);
        c.beginPath(); c.moveTo(wx + ww / 2, wy); c.lineTo(wx + ww / 2, wy + wh); c.moveTo(wx, wy + wh / 2); c.lineTo(wx + ww, wy + wh / 2); c.stroke();
      }
      // tar-paper roof / eave
      const ry = y0 + 8, over = 14;
      c.fillStyle = lg(c, 0, ry - fh * 0.32, 0, ry, [[0, night ? '#2a2a33' : '#4a4a52'], [1, night ? '#0c0c10' : '#1d1d22']]);
      c.beginPath(); c.moveTo(x + inset - over, ry); c.lineTo(x + inset + 10, ry - fh * 0.3); c.lineTo(x + w - inset - 10, ry - fh * 0.3); c.lineTo(x + w - inset + over, ry); c.closePath(); c.fill();
      c.strokeStyle = rgba(night ? '#6a6a80' : '#9a9aa6', 0.35); c.lineWidth = 1;
      for (let k = 1; k < 4; k++) { const yy = ry - fh * 0.3 * k / 4; c.beginPath(); c.moveTo(x + inset - over + (over + 10) * (1 - k / 4), yy); c.lineTo(x + w - inset + over - (over + 10) * (1 - k / 4), yy); c.stroke(); }
      c.fillStyle = '#0a0a0c'; c.fillRect(x + inset - over, ry - 1, w - inset * 2 + over * 2, 3);
    }
  }

  // =====================================================================================
  // Live toolkit (per frame; all sprites cached)
  // =====================================================================================
  const sprCache = {};
  function glowSpr(col, hard) {
    const key = col + (hard ? 'h' : '');
    if (sprCache[key]) return sprCache[key];
    const c = U.makeCanvas(64, 64, 1), x = c.getContext('2d');
    x.fillStyle = rg(x, 32, 32, 32, hard
      ? [[0, rgba('#ffffff', 1)], [0.12, rgba(col, 1)], [0.3, rgba(col, 0.45)], [0.6, rgba(col, 0.12)], [1, rgba(col, 0)]]
      : [[0, rgba(col, 1)], [0.2, rgba(col, 0.55)], [0.5, rgba(col, 0.18)], [1, rgba(col, 0)]]);
    x.fillRect(0, 0, 64, 64);
    return (sprCache[key] = c);
  }
  function lglow(ctx, x, y, r, col, a, hard) {
    if (a <= 0.003) return;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(glowSpr(col, hard), x - r, y - r, r * 2, r * 2);
  }
  const flick = (t, s, sp = 1) => 0.82 + 0.1 * Math.sin(t * 9.3 * sp + s * 3.1) + 0.08 * Math.sin(t * 23.7 * sp + s * 7.7);
  // drifting / rising particle field. o: {n, seed, x,y,w,h, vx,vy, r, col, a, tw, wob, hard, add}
  function motes(ctx, t, o) {
    ctx.save(); if (o.add !== false) ctx.globalCompositeOperation = 'lighter';
    const spr = glowSpr(o.col, o.hard !== false);
    for (let i = 0; i < o.n; i++) {
      const h1 = U.hash(i, 1, o.seed), h2 = U.hash(i, 2, o.seed), h3 = U.hash(i, 3, o.seed);
      const sp = 0.55 + h3 * 0.9;
      const px = o.x + mod(h1 * o.w + (o.vx || 0) * t * sp + Math.sin(t * (0.4 + h3) + i * 1.7) * (o.wob || 0), o.w);
      const py = o.y + mod(h2 * o.h + (o.vy || 0) * t * sp + Math.cos(t * (0.3 + h2) + i) * (o.wobY || 0), o.h);
      const fy = Math.min(1, (py - o.y) / (o.h * 0.15), (o.y + o.h - py) / (o.h * 0.15));
      const r = o.r * (0.45 + h3 * 0.9);
      const tw = o.tw ? 0.55 + 0.45 * Math.sin(t * o.tw * (0.6 + h2) + i * 2.3) : 1;
      lglow(ctx, px, py, r, o.cols ? o.cols[i % o.cols.length] : o.col, o.a * tw * clamp(fy, 0, 1));
    }
    ctx.restore();
  }
  // seamless horizontal mist strip, cached per key
  function mistStrip(key, col, h, density = 40, seed = 1) {
    const k = 'mist:' + key;
    if (sprCache[k] && sprCache[k].s === G.S) return sprCache[k];
    const c = U.makeCanvas(W, h), x = c.getContext('2d');
    const r = U.seeded(seed);
    for (let i = 0; i < density; i++) {
      const bx = r() * W, by = h * (0.4 + r() * 0.2), rw = 80 + r() * 220, rh = h * (0.14 + r() * 0.24);
      for (const ox of [-W, 0, W]) {
        x.save(); x.translate(bx + ox, by); x.scale(rw / rh, 1);
        x.fillStyle = rg(x, 0, 0, rh, [[0, rgba(col, 0.32)], [0.5, rgba(col, 0.14)], [1, rgba(col, 0)]]);
        x.fillRect(-rh, -rh, rh * 2, rh * 2); x.restore();
      }
    }
    c.s = G.S;
    return (sprCache[k] = c);
  }
  const snap = (v) => Math.round(v * G.S) / G.S; // whole device pixels keep big blits on the fast path
  function mist(ctx, t, key, col, y, h, a, speed, density, seed) {
    const m = mistStrip(key, col, h, density, seed);
    const off = snap(mod(t * speed, W));
    ctx.save(); ctx.globalAlpha = a;
    ctx.drawImage(m, -off, y, W, h); ctx.drawImage(m, W - off, y, W, h);
    ctx.restore();
  }
  function leaves(ctx, t, o) {
    ctx.save();
    for (let i = 0; i < o.n; i++) {
      const h1 = U.hash(i, 11, o.seed), h2 = U.hash(i, 12, o.seed), h3 = U.hash(i, 13, o.seed);
      const sp = 0.6 + h3 * 0.8;
      const x = mod(h1 * (W + 200) + (o.vx || 0) * t * sp + Math.sin(t * (0.8 + h2) + i) * (o.sway ?? 30), W + 200) - 100;
      const y = mod(h2 * (H + 100) + o.vy * t * sp, H + 100) - 50;
      if (o.ymax && y > o.ymax) continue;
      const s = o.size * (0.6 + h3 * 0.8);
      const rot = t * (1 + h1 * 2) * (h2 < 0.5 ? -1 : 1) + i;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.sin(t * 2 * sp + i)));
      ctx.globalAlpha = o.a ?? 0.85;
      ctx.fillStyle = o.cols[i % o.cols.length];
      if (o.shape === 'petal') { ellipse(ctx, 0, 0, s, s * 0.6); ctx.fill(); }
      else if (o.shape === 'bit') { ctx.fillRect(-s * 0.6, -s * 0.4, s * 1.2, s * 0.8); }
      else { ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.55, s, 0); ctx.quadraticCurveTo(0, s * 0.55, -s, 0); ctx.fill(); }
      ctx.restore();
    }
    ctx.restore();
  }
  function spriteCached(key, w, h, fn, scale) {
    if (sprCache[key] && sprCache[key].s === G.S) return sprCache[key];
    const c = U.makeCanvas(w, h, scale || G.S); c.s = G.S;
    fn(c.getContext('2d'));
    return (sprCache[key] = c);
  }
  function lanternSpr(col, r, o = {}) {
    const key = 'lan:' + col + r + (o.char || '') + (o.lit ?? 1);
    const w = r * 3, h = r * 4.6;
    return spriteCached(key, w, h, (x) => {
      x.strokeStyle = '#1a120e'; x.lineWidth = 1; x.beginPath(); x.moveTo(w / 2, 0); x.lineTo(w / 2, r * 0.6); x.stroke();
      lanternShape(x, w / 2, r * 0.6 + r * 1.45, r, col, o.lit ?? 1, o);
    });
  }
  // hanging lantern drawn live with sway; anchor (x,y) = hook point
  function hangLantern(ctx, t, x, y, col, r, seed, o = {}) {
    const s = lanternSpr(col, r, o);
    const ang = Math.sin(t * (1.1 + U.hash(seed, 1, 3) * 0.6) + seed) * (o.sway ?? 0.06);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.drawImage(s, -s.lw / 2, 0, s.lw, s.lh);
    ctx.restore();
    if (o.glow !== false) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const cy = y + r * 2.05, cx = x - Math.sin(ang) * r * 2.05;
      lglow(ctx, cx, cy, o.glowR || r * 5, o.glowCol || '#ff8a3a', (o.glowA ?? 0.4) * flick(t, seed));
      ctx.restore();
    }
  }
  function skyLanternSpr(r) {
    return spriteCached('sky:' + r, r * 2.4, r * 3.2, (x) => {
      const w = r * 2.4, cx = w / 2;
      x.fillStyle = lg(x, 0, r * 0.2, 0, r * 3, [[0, '#f8c46a'], [0.6, '#ffb24a'], [1, '#fff3c0']]);
      x.beginPath(); x.moveTo(cx - r * 0.85, r * 0.25); x.lineTo(cx + r * 0.85, r * 0.25); x.lineTo(cx + r * 0.65, r * 2.8); x.lineTo(cx - r * 0.65, r * 2.8); x.closePath(); x.fill();
      x.fillStyle = rgba('#fff7d8', 0.5); x.fillRect(cx - r * 0.75, r * 1.9, r * 1.5, r * 0.9);
      x.strokeStyle = rgba('#a85a1c', 0.5); x.lineWidth = Math.max(0.5, r * 0.06);
      x.beginPath(); x.moveTo(cx, r * 0.25); x.lineTo(cx, r * 2.8); x.stroke();
      if (r > 7) { x.fillStyle = rgba('#7a2a10', 0.55); x.fillRect(cx - r * 0.45, r * 0.7, r * 0.12, r * 1.0); x.fillRect(cx + r * 0.25, r * 0.9, r * 0.12, r * 0.8); x.fillRect(cx - r * 0.6, r * 1.0, r * 0.3, r * 0.1); }
    });
  }
  function waveGlints(ctx, t, o) { // shimmering sparkles on water
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < o.n; i++) {
      const h1 = U.hash(i, 21, o.seed), h2 = U.hash(i, 22, o.seed), h3 = U.hash(i, 23, o.seed);
      const d = Math.pow(h2, o.pow || 1.6);
      const y = o.y0 + d * (o.y1 - o.y0);
      let x = o.cx != null ? o.cx + (h1 - 0.5) * (o.w0 + d * o.w1) : h1 * W;
      x += Math.sin(t * 0.7 + i) * 6 * d;
      const a = Math.max(0, Math.sin(t * (1.2 + h3 * 2.5) + i * 3.7)) * o.a;
      if (a < 0.02) continue;
      const len = (o.len || 10) * (0.4 + d * 1.6);
      ctx.globalAlpha = a; ctx.fillStyle = o.col;
      ctx.fillRect(x - len / 2, y, len, 1 + d * 1.5);
    }
    ctx.restore();
  }
  // fast horizontal wind streaks, batched into two stroke passes
  function windStreaks(ctx, t, seed, n, sp, y0, h, a) {
    ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
    for (let g = 0; g < 2; g++) {
      ctx.globalAlpha = a * (g ? 1 : 0.6); ctx.lineWidth = g ? 1.8 : 1.1; ctx.beginPath();
      for (let i = g; i < n; i += 2) {
        const h1 = U.hash(i, 1, seed), h2 = U.hash(i, 2, seed);
        const x = mod(h1 * 2000 + t * (sp + h2 * sp * 0.6), 2000) - 400, y = y0 + h2 * h, L = 80 + h1 * 150;
        ctx.moveTo(x, y); ctx.quadraticCurveTo(x + L * 0.5, y - 6 * Math.sin(t + i), x + L, y + 2);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  function hueCol(h, s = 85, l = 60) { return U.rgb2hex(...hsl2rgb(mod(h, 360) / 360, s / 100, l / 100)); }
  function hsl2rgb(h, s, l) {
    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = mod(t, 1); if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  const qHue = (h) => hueCol(Math.round(mod(h, 360) / 15) * 15, 90, 62); // quantised → bounded sprite cache

  // =====================================================================================
  // Scene registry
  // =====================================================================================
  const scenes = {};
  const baked = {};
  // opts.shift(t) -> [dx, dy]: whole-pixel offset of the static base (cheap heave); opts.edge fills the uncovered strip.
  // opts.xf(ctx, t): arbitrary transform of the base (overscanned; costly on software canvases, avoid for big moves)
  function def(id, bake, live, opts) { scenes[id] = Object.assign({ bake, live }, opts || {}); }
  // extra full-screen cached layers (front foliage, palette variants...)
  function fullLayer(key, fn, scale) { return spriteCached('full:' + key, W, H, fn, scale); }
  function base(id) {
    const b = baked[id];
    if (b && b.s === G.S) return b.c;
    const c = U.makeCanvas(W, H);
    const x = c.getContext('2d');
    x.save();
    scenes[id].bake(x, U.seeded(hashStr(id)));
    x.restore();
    baked[id] = { c, s: G.S };
    return c;
  }

  // =====================================================================================
  // SCENES
  // =====================================================================================

  // ---------- 序 夢境・燈橋: lantern bridge over the black sea ----------
  const DREAM_POSTS = [60, 260, 470, 810, 1020, 1220];
  def('dream', (c, rnd) => {
    vfill(c, 0, 340, [[0, '#03040a'], [0.5, '#0a1028'], [0.85, '#17254a'], [1, '#2a4468']]);
    stars(c, 260, rnd, 320, { a: 0.9 });
    milkyWay(c, rnd, 80, 40, 1200, 260, 120, '#8ea6ff', 0.06);
    moon(c, 960, 120, 46, { col: '#e6f0ff', haloCol: '#6f90d8', haloA: 0.4 });
    cloud(c, 900, 150, 360, 40, { top: '#3a4f7e', bot: '#121b36', hi: '#9fb8ff', hiA: 0.25, a: 0.75, seed: 3 });
    cloud(c, 260, 200, 420, 34, { top: '#24345c', bot: '#0d1430', hi: '#6f8ad0', hiA: 0.2, a: 0.6, seed: 8 });
    // the far Shorelight on the horizon
    glow(c, 640, 334, 120, '#ffd89a', 0.22); glow(c, 640, 334, 18, '#fff3d8', 0.9);
    // black sea
    water(c, 336, H, { stops: [[0, '#16233c'], [0.06, '#0a1222'], [1, '#020308']], light: '#8fb0e6', streakA: 0.9, seed: 4,
      path: { x: 960, col: '#cfe0ff', a: 0.35, w0: 10, w1: 120, n: 90 } });
    water(c, 336, 400, { stops: [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']], light: '#ffd89a', streaks: 0, path: { x: 640, col: '#ffcf8a', a: 0.45, w0: 3, w1: 20, n: 40 } });
    // receding bridge toward the light
    const vx = 640, vy = 336;
    c.fillStyle = lg(c, 0, vy, 0, 400, [[0, '#2a2018'], [1, '#4a3424']]);
    c.beginPath(); c.moveTo(vx - 2, vy); c.lineTo(vx + 2, vy); c.lineTo(vx + 60, 402); c.lineTo(vx - 60, 402); c.closePath(); c.fill();
    for (let i = 1; i < 9; i++) {
      const f = Math.pow(i / 9, 2), y = vy + f * 66, hw = 2 + f * 58;
      c.fillStyle = rgba('#120c08', 0.6); c.fillRect(vx - hw, y, hw * 2, 0.6 + f);
      for (const s of [-1, 1]) {
        const px = vx + s * hw, ph = 3 + f * 40;
        c.fillStyle = '#1a120c'; c.fillRect(px - 0.5 - f, y - ph, 1 + f * 2, ph);
        lanternShape(c, px, y - ph - 1 - f * 6, 1 + f * 6, '#e0603a', 1, { tassel: f > 0.3 });
        glow(c, px, y - ph - f * 6, 8 + f * 50, '#ffae5a', 0.35);
        glow(c, px, 400 + (400 - y) * 0.2, 4 + f * 20, '#ffae5a', 0.18);
      }
    }
    // main deck: wide plank platform
    const y0 = 400, y1 = 662;
    c.fillStyle = lg(c, 0, y0, 0, y1, [[0, '#2a2028'], [0.5, '#30242a'], [1, '#1a1418']]);
    c.fillRect(0, y0, W, y1 - y0);
    const r2 = U.seeded(41);
    for (let i = 0; i < 14; i++) {
      const fa = Math.pow(i / 14, 1.5), fb = Math.pow((i + 1) / 14, 1.5);
      const ya = y0 + fa * (y1 - y0), yb = y0 + fb * (y1 - y0);
      c.fillStyle = rgba(r2() < 0.5 ? '#000000' : '#a08a9a', 0.03 + r2() * 0.05); c.fillRect(0, ya, W, yb - ya);
      c.fillStyle = rgba('#0c0705', 0.75); c.fillRect(0, yb - 1, W, 1 + fb * 1.5);
      c.fillStyle = rgba('#b8a0b0', 0.1); c.fillRect(0, ya + 0.5, W, 1);
      // board seams staggered
      for (let x = r2() * 260; x < W; x += 180 + r2() * 220) { c.fillStyle = rgba('#0c0705', 0.6); c.fillRect(x, ya, 1.5, yb - ya); }
    }
    for (let i = 0; i < 260; i++) { const y = y0 + r2() * (y1 - y0); c.fillStyle = rgba('#000000', 0.08); c.fillRect(r2() * W, y, 20 + r2() * 90, 0.8); }
    // far railing + lantern posts
    c.fillStyle = '#1c130e'; c.fillRect(0, y0 - 26, W, 5); c.fillRect(0, y0 - 2, W, 6);
    for (let x = 20; x < W; x += 54) { c.fillStyle = '#1c130e'; c.fillRect(x, y0 - 24, 4, 24); }
    for (const x of DREAM_POSTS) {
      c.fillStyle = lg(c, x - 6, 0, x + 6, 0, [[0, '#4a3628'], [1, '#160e0a']]); c.fillRect(x - 6, y0 - 92, 12, 96);
      c.fillStyle = '#120a06'; c.fillRect(x - 16, y0 - 96, 32, 7);
      c.save(); c.globalCompositeOperation = 'lighter';
      c.fillStyle = rg(c, x, y0 + 40, 160, [[0, rgba('#ff9a4a', 0.3)], [1, rgba('#ff9a4a', 0)]]);
      c.translate(x, y0 + 40); c.scale(1.6, 0.5); c.translate(-x, -(y0 + 40)); c.fillRect(x - 160, y0 - 120, 320, 320);
      c.restore();
    }
    // near beam + under-sea
    vfill(c, y1, H, [[0, '#06080e'], [1, '#010204']]);
    c.fillStyle = lg(c, 0, y1 - 6, 0, y1 + 16, [[0, '#5a4230'], [1, '#1a110b']]); c.fillRect(0, y1 - 6, W, 22);
    for (let x = 100; x < W; x += 360) { c.fillStyle = '#0e0905'; c.fillRect(x, y1 + 16, 22, H - y1); }
    // soft overall dream haze
    vfill(c, 300, 420, [[0, rgba('#6a88c8', 0)], [0.5, rgba('#6a88c8', 0.08)], [1, rgba('#6a88c8', 0)]]);
    vignette(c, 0.7, '#000000', 0.35);
    grain(c, rnd, 5000, 0.03);
  }, (ctx, t) => {
    // drifting soul-lanterns on the sea, far band
    ctx.save();
    for (let i = 0; i < 14; i++) {
      const h1 = U.hash(i, 1, 9), h2 = U.hash(i, 2, 9);
      const d = h2, y = 342 + d * 50, s = 0.35 + d * 0.9;
      const x = mod(h1 * 1400 - t * (4 + d * 8), 1400) - 60;
      const b = Math.sin(t * 1.3 + i) * 1.2;
      const col = i % 4 === 0 ? '#9fd0ff' : '#ffb560';
      ctx.globalCompositeOperation = 'lighter';
      lglow(ctx, x, y + b - 3 * s, 26 * s, col, 0.5 * flick(t, i, 0.4));
      lglow(ctx, x, y + 10 * s, 18 * s, col, 0.18);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#2a1a10'; ctx.fillRect(x - 6 * s, y + b, 12 * s, 3 * s);
      ctx.fillStyle = col === '#ffb560' ? '#ffd28a' : '#cfe8ff'; ctx.fillRect(x - 4 * s, y + b - 7 * s, 8 * s, 7 * s);
    }
    ctx.restore();
    // post lanterns (swaying) + their glow
    for (let i = 0; i < DREAM_POSTS.length; i++) hangLantern(ctx, t, DREAM_POSTS[i], 400 - 88, '#d8452e', 11, i + 3, { glowR: 70, glowA: 0.55, char: '渡' });
    mist(ctx, t, 'dream1', '#7d97c8', 300, 130, 0.5, 8, 40, 2);
    mist(ctx, t, 'dream2', '#5a6fa0', 600, 140, 0.45, -12, 40, 3);
    motes(ctx, t, { n: 26, seed: 4, x: 0, y: 120, w: W, h: 560, vx: 3, vy: -14, r: 7, col: '#ffcf8a', a: 0.5, tw: 2, wob: 18 });
    motes(ctx, t, { n: 14, seed: 5, x: 0, y: 200, w: W, h: 500, vx: -2, vy: -9, r: 8, col: '#8fc8ff', a: 0.45, tw: 1.5, wob: 22 });
  });

  // ---------- 九份 (night / day) ----------
  function jiufen(c, rnd, night) {
    // sky
    if (night) {
      vfill(c, 0, 330, [[0, '#070a1e'], [0.5, '#151a3e'], [0.85, '#3a2e5a'], [1, '#5a3c5e']]);
      stars(c, 160, rnd, 260, { a: 0.8 });
      moon(c, 1060, 90, 22, { col: '#fff4d8', phase: 0.55, sky: '#0d1230', haloCol: '#8a90d0', haloA: 0.3 });
    } else {
      vfill(c, 0, 330, [[0, '#4f8fd0'], [0.55, '#8fc0e6'], [1, '#dfeef4']]);
      sun(c, 800, 70, 26, '#fffbe8', '#ffe2a0', 0.45);
      cloud(c, 300, 120, 380, 70, { top: '#ffffff', bot: '#c6d6ea', seed: 1, rim: '#fff4dc', rimSide: 'right' });
      cloud(c, 820, 170, 300, 50, { top: '#ffffff', bot: '#cddcee', seed: 2 });
      cloud(c, 1150, 230, 220, 36, { top: '#f6fbff', bot: '#c9d8ea', seed: 5, a: 0.9 });
    }
    // 基隆山 dome + coastline hills + sea
    const seaY = 300;
    water(c, seaY, 420, night
      ? { stops: [[0, '#2a2a4e'], [1, '#0d1028']], light: '#b0a0ff', seed: 2, streaks: 120, path: { x: 1060, col: '#fff0c0', a: 0.4, w0: 8, w1: 60, n: 60 } }
      : { stops: [[0, '#9cc8e4'], [0.3, '#4f95c6'], [1, '#2f6e9e']], light: '#ffffff', seed: 2, streaks: 160, path: { x: 800, col: '#ffffff', a: 0.6, w0: 10, w1: 120, n: 90 } });
    mountain(c, { y: seaY + 4, amp: 150, freq: 0.006, seed: 3, oct: 3,
      shape: (x) => -Math.max(0, 1 - Math.pow((x - 720) / 170, 2)) * 120 + Math.max(0, (x - 900) / 600) * 60 + Math.max(0, (420 - x) / 400) * 40,
      col: night ? '#2a2a4a' : '#5f86a6', col2: night ? '#1c1c36' : '#7aa0b8', bottom: seaY + 6, shade: 0.6, light: night ? '#8a8ad0' : '#d8ecff', dark: night ? '#05050f' : '#2a4a66', haze: night ? '#3a3260' : '#cfe2ee', hazeA: 0.6, rim: night ? '#c0b0ff' : '#ffffff', rimA: 0.25 });
    // nearer green hills down to the sea (the 九份 slope)
    mountain(c, { y: 330, amp: 90, freq: 0.005, seed: 8, oct: 4, shape: (x) => Math.abs(x - 640) * -0.06 + 40,
      col: night ? '#1d2234' : '#4f7a52', col2: night ? '#141826' : '#3a5c40', shade: 0.6, light: night ? '#5a6a9a' : '#c6e6a0', dark: '#0a120c', trees: { kind: 'round', size: 7, gap: 10, seed: 5 }, tex: 120 });
    // distant village lights
    for (let i = 0; i < 70; i++) {
      const x = 340 + rnd() * 620, y = 300 + rnd() * 70;
      if (night) { c.fillStyle = rgba(rnd() < 0.8 ? '#ffc070' : '#ff7050', 0.8); c.fillRect(x, y, 2, 2); glow(c, x, y, 7, '#ff9d4a', 0.25); }
      else { c.fillStyle = rgba(rnd() < 0.5 ? '#3a3a40' : '#8a5a44', 0.5); c.fillRect(x, y, 5 + rnd() * 6, 3 + rnd() * 3); }
    }
    // stair street receding uphill in the centre-back (豎崎路)
    // left: big multi-storey teahouse; right: stacked houses
    jiufenHouse(c, -20, 410, 330, 360, { night, rnd, floors: 4, wood: night ? '#4a2c24' : '#7a4a36' });
    jiufenHouse(c, 290, 400, 120, 120, { night, rnd, floors: 1 });
    jiufenHouse(c, 1030, 410, 270, 300, { night, rnd, floors: 3 });
    jiufenHouse(c, 900, 402, 150, 140, { night, rnd, floors: 1, wood: night ? '#3a2a2a' : '#6a5040' });
    // stair steps in the middle distance
    for (let i = 0; i < 8; i++) {
      const y = 404 - i * 8, w = 220 - i * 12;
      c.fillStyle = night ? '#3a3440' : '#9a948c'; c.fillRect(640 - w / 2 + 40, y - 8, w, 8);
      c.fillStyle = night ? '#1a1620' : '#6a645e'; c.fillRect(640 - w / 2 + 40, y - 1, w, 1.5);
    }
    // ground: wet stone pavers
    groundBase(c, 404, { stops: night ? [[0, '#2a2530'], [0.4, '#352c36'], [1, '#18141c']] : [[0, '#aaa298'], [0.5, '#988e83'], [1, '#6d645b']], seed: 6, blotA: 0.8,
      pool: night ? { x: 640, y: 500, r: 520, col: '#ff8a3a', a: 0.12, sy: 0.3 } : { x: 760, y: 470, r: 520, col: '#fff2cc', a: 0.18, sy: 0.3 } });
    pavers(c, 404, H, 13, night ? { gap: '#0c0a10', light: '#9a8aa0', dark: '#000000', var: 0.12, hi: 0.08, seed: 6 } : { gap: '#4a423a', light: '#fff6e8', dark: '#3a3028', var: 0.12, hi: 0.2, seed: 6 });
    if (night) { // lantern reflections smeared on the wet stone
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const x of [60, 150, 240, 1080, 1160, 1250, 420, 560, 700, 840]) softBlob(c, x, 470, 14, 70, '#ff7a3a', 0.18);
      c.restore();
    }
    // low stone wall at the back edge of the landing
    for (const [x0, x1] of [[0, 520], [770, W]]) {
      c.fillStyle = night ? '#2c2832' : '#b2aaa0'; c.fillRect(x0, 392, x1 - x0, 8);
      c.fillStyle = night ? '#16131a' : '#7a726a'; c.fillRect(x0, 400, x1 - x0, 8);
    }
    // lantern string anchor beams
    c.strokeStyle = '#120c0a'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(300, 70); c.quadraticCurveTo(660, 170, 1040, 110); c.stroke();
    if (night) { vignette(c, 0.6, '#05030a', 0.4); grade(c, '#3a1a50', 0.25, 'soft-light'); }
    else { vignette(c, 0.3, '#2a1a10', 0.5); grade(c, '#ffd9a0', 0.15, 'soft-light'); }
    grain(c, rnd, 4000, 0.03);
  }
  const JF_STRING = [];
  for (let i = 0; i < 11; i++) { const f = (i + 0.5) / 11; const x = U.lerp(300, 1040, f); JF_STRING.push([x, (1 - f) * (1 - f) * 70 + 2 * (1 - f) * f * 170 + f * f * 110]); }
  const JF_EAVES = [[30, 116], [110, 116], [190, 116], [270, 116], [60, 206], [160, 206], [250, 206], [40, 296], [150, 296], [260, 296], [1070, 200], [1150, 200], [1240, 200], [1080, 300], [1190, 300], [320, 290], [380, 290], [930, 270], [1010, 270]];
  function jiufenLive(ctx, t, night) {
    const col = '#d8382a';
    for (let i = 0; i < JF_EAVES.length; i++) hangLantern(ctx, t, JF_EAVES[i][0], JF_EAVES[i][1], col, 9, i, { glowR: 46, glowA: night ? 0.5 : 0.0, glow: night, lit: night ? 1 : 0.15 });
    for (let i = 0; i < JF_STRING.length; i++) hangLantern(ctx, t, JF_STRING[i][0], JF_STRING[i][1], col, 11, i + 50, { glowR: 60, glowA: night ? 0.45 : 0, glow: night, sway: 0.1, lit: night ? 1 : 0.15 });
    if (night) {
      mist(ctx, t, 'jfn', '#8a6aa0', 330, 120, 0.35, 6, 30, 7);
      motes(ctx, t, { n: 18, seed: 31, x: 0, y: 150, w: W, h: 450, vx: 4, vy: -10, r: 5, col: '#ffb060', a: 0.55, tw: 3, wob: 20 });
      // fishing-boat lights twinkle on the sea
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) lglow(ctx, 420 + U.hash(i, 3, 3) * 560, 304 + U.hash(i, 4, 3) * 18, 8, '#ffe0a0', 0.6 * (0.6 + 0.4 * Math.sin(t * 2 + i * 2)), true);
      ctx.restore();
    } else {
      waveGlints(ctx, t, { n: 50, seed: 3, y0: 302, y1: 340, cx: 800, w0: 30, w1: 160, col: '#ffffff', a: 0.8, len: 8 });
      leaves(ctx, t, { n: 6, seed: 2, vx: 30, vy: 22, size: 4, cols: ['#e8d070', '#f0a0b0', '#ffffff'], shape: 'petal', sway: 40, a: 0.9 });
      // swallows gliding
      ctx.save(); ctx.strokeStyle = '#2a2a36'; ctx.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        const x = mod(t * (50 + i * 12) + i * 400, W + 200) - 100, y = 150 + i * 40 + Math.sin(t * 1.4 + i) * 20, f = Math.sin(t * 8 + i) * 4;
        ctx.beginPath(); ctx.moveTo(x - 9, y - f); ctx.quadraticCurveTo(x - 4, y - 2, x, y); ctx.quadraticCurveTo(x + 4, y - 2, x + 9, y - f); ctx.stroke();
      }
      ctx.restore();
    }
  }
  def('jiufen_night', (c, rnd) => jiufen(c, rnd, true), (ctx, t) => jiufenLive(ctx, t, true));
  def('jiufen_day', (c, rnd) => jiufen(c, rnd, false), (ctx, t) => jiufenLive(ctx, t, false));

  // ---------- 八斗子 night shore with floating water-lanterns ----------
  def('shore', (c, rnd) => {
    vfill(c, 0, 300, [[0, '#050b1a'], [0.5, '#0e2140'], [0.9, '#1f3f66'], [1, '#2c5478']]);
    stars(c, 180, rnd, 260, { a: 0.85 });
    moon(c, 330, 110, 40, { col: '#fff8e6', haloCol: '#9ab8e8', haloA: 0.45 });
    cloud(c, 420, 180, 520, 36, { top: '#2e4870', bot: '#0f1d36', hi: '#b8d0ff', hiA: 0.35, a: 0.8, seed: 3, rim: '#d8e6ff', rimSide: 'left' });
    cloud(c, 1000, 120, 380, 30, { top: '#20365a', bot: '#0c172c', hi: '#8aa6e0', hiA: 0.2, a: 0.6, seed: 6 });
    // 基隆嶼 island silhouette
    mountain(c, { y: 300, amp: 0, freq: 0.01, seed: 2, shape: (x) => -Math.max(0, 1 - Math.pow((x - 1010) / 90, 2)) * 46 - Math.max(0, 1 - Math.pow((x - 1070) / 60, 2)) * 16, col: '#16223a', col2: '#101a2e', bottom: 302, x0: 880, x1: 1140, haze: '#2c4466', hazeA: 0.5, rim: '#9ab8e8', rimA: 0.3 });
    // headland right
    mountain(c, { y: 300, amp: 40, freq: 0.01, seed: 5, shape: (x) => -Math.max(0, (x - 1150) * 0.5), col: '#0f1828', col2: '#0a1220', bottom: 330, x0: 1100, rim: '#6a88b8', rimA: 0.25 });
    water(c, 300, 470, { stops: [[0, '#2a4c72'], [0.15, '#14284a'], [1, '#081428']], light: '#9ec0ee', seed: 7, streaks: 260,
      path: { x: 330, col: '#fff2d0', a: 0.75, w0: 6, w1: 160, n: 160 } });
    // sandstone rock shelf (八斗子 flat rocks) with tide pools
    const shelf = (k, y, amp, cols) => {
      const p = profile({ y, amp, freq: 0.006, seed: 30 + k, oct: 4 });
      layer(c, (x) => { pathProfile(x, p); x.fillStyle = lg(x, 0, y - amp, 0, H, cols); x.fill(); }, (x) => {
        const r = U.seeded(40 + k);
        for (let i = 0; i < 90; i++) { // layered sandstone strata
          const sy = y - amp + r() * (H - y + amp), sx = r() * W;
          x.fillStyle = rgba(r() < 0.5 ? '#c9b8a0' : '#000000', 0.04 + r() * 0.05);
          ellipse(x, sx, sy, 40 + r() * 180, 1.5 + r() * 3); x.fill();
        }
        x.fillStyle = lg(x, 0, y - amp, 0, y + 30, [[0, rgba('#bcd4ff', 0.22)], [1, rgba('#bcd4ff', 0)]]); x.fillRect(0, y - amp, W, amp + 30);
      });
      return p;
    };
    shelf(1, 470, 26, [[0, '#4a4c5e'], [0.3, '#3a3a4a'], [1, '#1a1a24']]);
    // tide pools reflecting the moon-sky
    for (const [x, y, rx, ry] of [[220, 470, 120, 10], [760, 492, 160, 12], [1080, 478, 100, 9], [470, 640, 220, 22], [1100, 660, 160, 18]]) {
      c.fillStyle = lg(c, 0, y - ry, 0, y + ry, [[0, '#4a6a98'], [1, '#1a2a48']]); ellipse(c, x, y, rx, ry); c.fill();
      c.fillStyle = rgba('#e6eeff', 0.25); ellipse(c, x - rx * 0.3, y - ry * 0.3, rx * 0.4, ry * 0.25); c.fill();
      c.strokeStyle = rgba('#0c0c14', 0.5); c.lineWidth = 2; ellipse(c, x, y + 1, rx, ry); c.stroke();
    }
    // foreground rocks at the edges
    rock(c, 40, H + 10, 140, 120, ['#3c3e50', '#26283a', '#0e0e18'], rnd);
    rock(c, 1250, H + 20, 170, 140, ['#3a3c4e', '#24263a', '#0e0e18'], rnd);
    glow(c, 330, 520, 380, '#aac4ff', 0.06);
    vignette(c, 0.6, '#02040a', 0.4);
    grain(c, rnd, 4500, 0.03);
  }, (ctx, t) => {
    waveGlints(ctx, t, { n: 90, seed: 5, y0: 302, y1: 466, cx: 330, w0: 20, w1: 300, col: '#fff3d6', a: 0.9, len: 12 });
    // foam lines lapping the rock edge
    ctx.save();
    for (let k = 0; k < 3; k++) {
      const ph = mod(t * 0.25 + k / 3, 1), y = 452 - ph * 30, a = Math.sin(ph * Math.PI) * 0.35;
      ctx.strokeStyle = rgba('#d8e6ff', a); ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 20) { const yy = y + Math.sin(x * 0.02 + t + k) * 3 + U.vnoise(x * 0.01, k, 3) * 8; x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
      ctx.stroke();
    }
    ctx.restore();
    // water lanterns (水燈頭 and small ones) drifting out to sea
    for (let i = 0; i < 9; i++) {
      const h1 = U.hash(i, 1, 21), h2 = U.hash(i, 2, 21);
      const prog = mod(t * 0.012 + h1, 1);
      const y = 452 - prog * 140, d = (y - 300) / 170, s = 0.25 + d * 0.9;
      const x = 120 + h2 * 1040 + Math.sin(t * 0.3 + i) * 10 + (h2 - 0.5) * prog * 200;
      const bob = Math.sin(t * 1.6 + i * 2) * 1.5 * s;
      const big = i % 3 === 0;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      lglow(ctx, x, y - 8 * s, 60 * s, '#ff9a40', 0.5 * flick(t, i, 0.5) * Math.min(1, (1 - prog) * 5));
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#ffb060'; ctx.fillRect(x - 3 * s, y + 3 * s, 6 * s, 28 * s);
      ctx.restore();
      ctx.save(); ctx.translate(x, y + bob); ctx.scale(s, s);
      ctx.fillStyle = '#2a1a12'; ctx.fillRect(-16, -2, 32, 6);
      if (big) { // little house-shaped lantern
        ctx.fillStyle = '#ffe2a0'; ctx.fillRect(-12, -22, 24, 20);
        ctx.fillStyle = '#e04030'; ctx.fillRect(-12, -22, 24, 4); ctx.fillRect(-12, -8, 24, 3);
        ctx.fillStyle = '#7a1a10'; ctx.beginPath(); ctx.moveTo(-16, -22); ctx.lineTo(0, -34); ctx.lineTo(16, -22); ctx.closePath(); ctx.fill();
      } else { ctx.fillStyle = '#ffd890'; ctx.fillRect(-8, -14, 16, 12); ctx.fillStyle = '#d84a30'; ctx.fillRect(-8, -14, 16, 3); }
      ctx.restore();
    }
    mist(ctx, t, 'shore', '#7a9ac8', 270, 100, 0.4, 7, 30, 11);
    motes(ctx, t, { n: 16, seed: 22, x: 0, y: 200, w: W, h: 400, vx: 2, vy: -8, r: 6, col: '#9fd0ff', a: 0.35, tw: 2, wob: 20 });
  });

  // ---------- 舊金礦坑: timbered mine tunnel ----------
  const MINE_LAMPS = [];
  def('mine', (c, rnd) => {
    MINE_LAMPS.length = 0;
    const vx = 640, vy = 300;
    // rock everywhere
    vfill(c, 0, H, [[0, '#1c1410'], [0.5, '#2a1e16'], [1, '#140e0a']]);
    // tunnel opening shape: darkness at the end
    c.fillStyle = rg(c, vx, vy, 260, [[0, '#000000'], [0.4, '#06040a'], [1, rgba('#06040a', 0)]]);
    c.fillRect(0, 0, W, H);
    // rock texture blocks on walls/ceiling
    const r = U.seeded(5);
    for (let i = 0; i < 900; i++) {
      const a = r() * TAU, d = 120 + Math.pow(r(), 0.7) * 800;
      const x = vx + Math.cos(a) * d * 1.3, y = vy + Math.sin(a) * d * 0.75;
      if (y > 420) continue;
      const s = d * 0.06 * (0.5 + r());
      c.fillStyle = rgba(r() < 0.5 ? '#6a5040' : '#000000', 0.08 + r() * 0.12);
      ellipse(c, x, y, s * 1.6, s, a + Math.PI / 2 + (r() - 0.5)); c.fill();
    }
    // gold ore veins
    c.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      let a = r() * TAU, d = 200 + r() * 500;
      let x = vx + Math.cos(a) * d * 1.3, y = vy + Math.sin(a) * d * 0.7;
      if (y > 400) continue;
      c.strokeStyle = rgba('#e8b84a', 0.35); c.lineWidth = 1.5 + r() * 2;
      c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 60; y += (r() - 0.3) * 30; c.lineTo(x, y); }
      c.stroke();
      MINE_LAMPS.push([x, y, 'vein']);
    }
    // timber sets receding
    for (let i = 7; i >= 0; i--) {
      const f = Math.pow(0.68, i), s = f;
      const hw = 620 * s + 30, top = vy - 330 * s - 6, bot = vy + 300 * s + 4;
      const pw = 34 * s + 2;
      const wood = U.mix('#6a4a30', '#140c08', 1 - s * 0.95);
      const dk = U.shade(wood, -0.45);
      // posts
      for (const sx of [-1, 1]) {
        const x = vx + sx * hw;
        c.fillStyle = lg(c, x - pw / 2, 0, x + pw / 2, 0, [[0, U.shade(wood, 0.18)], [1, dk]]);
        c.beginPath(); c.moveTo(x - pw / 2, bot); c.lineTo(x - pw / 2 + sx * -pw * 0.3, top); c.lineTo(x + pw / 2 + sx * -pw * 0.3, top); c.lineTo(x + pw / 2, bot); c.closePath(); c.fill();
      }
      // cap beam
      c.fillStyle = lg(c, 0, top - pw * 0.7, 0, top + pw * 0.5, [[0, U.shade(wood, 0.2)], [1, dk]]);
      c.fillRect(vx - hw - pw, top - pw * 0.6, hw * 2 + pw * 2, pw * 0.9);
      // lagging boards above cap
      c.fillStyle = rgba(dk, 0.8);
      for (let k = -6; k <= 6; k++) c.fillRect(vx + k * hw / 6 - pw * 0.15, top - pw * 1.4, pw * 0.3, pw * 0.8);
      if (i < 6 && i % 2 === 0) MINE_LAMPS.push([vx + hw * 0.55 * (i % 4 ? 1 : -1), top + pw * 0.3, 'lamp', s]);
    }
    // floor: packed earth + rails converging
    const fy = 410;
    c.fillStyle = lg(c, 0, vy, 0, H, [[0, '#120c08'], [0.3, '#2e2218'], [1, '#3a2c20']]);
    c.beginPath(); c.moveTo(vx - 40, vy + 8); c.lineTo(vx + 40, vy + 8); c.lineTo(W + 200, H); c.lineTo(-200, H); c.closePath(); c.fill();
    groundBase(c, fy, { stops: [[0, rgba('#3a2a1e', 0)], [1, rgba('#3a2a1e', 0)]], seed: 4, blots: 120, light: '#9a7a5a', blotA: 1.0, speckle: 1400, speckCols: ['#000000', '#7a6048', '#c8a060'] });
    // sleepers
    for (let i = 0; i < 22; i++) {
      const f = Math.pow(i / 22, 2.2), y = vy + 10 + f * (H - vy - 10), hw = 18 + f * 300;
      c.fillStyle = rgba('#1a110a', 0.85); c.fillRect(vx - hw, y, hw * 2, 2 + f * 12);
      c.fillStyle = rgba('#7a5a3a', 0.25); c.fillRect(vx - hw, y, hw * 2, 1 + f * 2);
    }
    for (const rx of [-0.42, 0.42]) {
      for (const [col, off] of [['#2a2420', 2], ['#9a8a7a', 0]]) {
        c.strokeStyle = col; c.lineWidth = off ? 5 : 2;
        c.beginPath(); c.moveTo(vx + rx * 30, vy + 10 + off); c.lineTo(vx + rx * 1000, H + 40 + off); c.stroke();
      }
    }
    // mine cart on a side-track left
    const cx = 170, cy = 430;
    c.fillStyle = lg(c, cx - 70, 0, cx + 70, 0, [[0, '#5a4a40'], [1, '#2a201c']]);
    c.beginPath(); c.moveTo(cx - 70, cy - 60); c.lineTo(cx + 70, cy - 60); c.lineTo(cx + 58, cy - 10); c.lineTo(cx - 58, cy - 10); c.closePath(); c.fill();
    c.fillStyle = '#d8a840'; for (let k = 0; k < 9; k++) { circle(c, cx - 50 + k * 12, cy - 62 + Math.sin(k) * 4, 8); c.fill(); }
    c.fillStyle = '#7a6a5a'; for (const k of [-40, 40]) { circle(c, cx + k, cy - 6, 12); c.fill(); }
    c.fillStyle = rgba('#000', 0.45); ellipse(c, cx, cy + 6, 90, 10); c.fill();
    // warm light pools under lamps (baked part)
    for (const l of MINE_LAMPS) if (l[1] === undefined || l[2] !== 'lamp') continue; else glow(c, l[0], l[1] + 20, 180 * l[3] + 60, '#ffb060', 0.22);
    glow(c, 640, 560, 420, '#ffb060', 0.08);
    vignette(c, 0.75, '#000000', 0.3);
    grain(c, rnd, 5000, 0.04);
  }, (ctx, t) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < MINE_LAMPS.length; i++) {
      const l = MINE_LAMPS[i];
      if (l[2] === 'lamp') {
        const s = l[3], f = flick(t, i, 0.8);
        lglow(ctx, l[0], l[1] + 18 * s, 90 * s + 20, '#ff9a3a', 0.55 * f);
        lglow(ctx, l[0], l[1] + 18 * s, 14 * s + 4, '#fff0b0', 0.9 * f, true);
      } else {
        const a = Math.max(0, Math.sin(t * 1.7 + i * 2.1)) * 0.55;
        lglow(ctx, l[0], l[1], 8, '#ffe08a', a, true);
      }
    }
    ctx.restore();
    // lamp bodies (drawn live so they sway slightly)
    for (let i = 0; i < MINE_LAMPS.length; i++) {
      const l = MINE_LAMPS[i]; if (l[2] !== 'lamp') continue;
      const s = l[3], sw = Math.sin(t * 1.3 + i) * 2 * s;
      ctx.fillStyle = '#1a120c'; ctx.fillRect(l[0] - 0.5, l[1], 1, 8 * s);
      ctx.fillStyle = '#ffd890'; ctx.fillRect(l[0] - 5 * s + sw, l[1] + 8 * s, 10 * s, 14 * s);
      ctx.fillStyle = '#2a1a10'; ctx.fillRect(l[0] - 6 * s + sw, l[1] + 7 * s, 12 * s, 3 * s); ctx.fillRect(l[0] - 6 * s + sw, l[1] + 21 * s, 12 * s, 3 * s);
    }
    motes(ctx, t, { n: 40, seed: 7, x: 0, y: 60, w: W, h: 520, vx: 3, vy: 4, r: 3, col: '#ffcf90', a: 0.5, tw: 2, wob: 14 });
    // drips
    ctx.save(); ctx.fillStyle = '#9fc4e0';
    for (let i = 0; i < 6; i++) {
      const ph = mod(t * 0.6 + U.hash(i, 1, 4), 1), x = 200 + U.hash(i, 2, 4) * 880, y0 = 60 + U.hash(i, 3, 4) * 80;
      ctx.globalAlpha = 0.6 * (1 - ph); ctx.fillRect(x, y0 + ph * ph * 400, 1.5, 6);
    }
    ctx.restore();
    mist(ctx, t, 'mine', '#6a5a4a', 420, 120, 0.25, 5, 30, 3);
  });

  // ---------- 霧林: misty forest ----------
  def('forest', (c, rnd) => {
    vfill(c, 0, H, [[0, '#cfe0d6'], [0.4, '#9fbcae'], [0.7, '#6a8a7a'], [1, '#2a3a30']]);
    glow(c, 700, 80, 500, '#fff8e0', 0.5);
    const layers = [
      { n: 26, col: '#a6c0b4', y: 430, h: [380, 520], w: [8, 16] },
      { n: 18, col: '#7f9e8e', y: 440, h: [420, 600], w: [14, 26] },
      { n: 12, col: '#567565', y: 450, h: [500, 700], w: [22, 40] },
    ];
    layers.forEach((L, li) => {
      const r = U.seeded(li * 9 + 3);
      for (let i = 0; i < L.n; i++) {
        const x = r() * (W + 100) - 50, h = L.h[0] + r() * (L.h[1] - L.h[0]), w = L.w[0] + r() * (L.w[1] - L.w[0]);
        c.fillStyle = L.col;
        c.beginPath(); c.moveTo(x - w * 0.7, L.y); c.lineTo(x - w * 0.4, L.y - h); c.lineTo(x + w * 0.4, L.y - h); c.lineTo(x + w * 0.7, L.y); c.fill();
        // canopy masses
        for (let k = 0; k < 4; k++) { circle(c, x + (r() - 0.5) * w * 6, L.y - h + r() * 60, w * (1.5 + r() * 1.8)); c.fill(); }
        if (r() < 0.5) treeFern(c, r() * W, L.y + 10, 90 + li * 50, L.col, r);
      }
      // canopy band
      for (let x = -40; x < W + 40; x += 30) { c.fillStyle = L.col; circle(c, x, 20 + r() * 80 - li * 20, 40 + r() * 50); c.fill(); }
      vfill(c, 0, H, [[0, rgba('#d8e8de', 0.25)], [0.6, rgba('#d8e8de', 0.35)], [1, rgba('#d8e8de', 0.1)]]);
    });
    rays(c, 700, -40, Math.PI / 2 + 0.18, 0.7, 760, 10, '#fff6d8', 0.12, rnd);
    // ground
    groundBase(c, 420, { stops: [[0, '#5a7462'], [0.3, '#3e5444'], [1, '#1e2a22']], seed: 2, light: '#b8d0a0', dark: '#0a140e', blots: 160, speckle: 1600, speckCols: ['#0a140e', '#6a5a3a', '#9ab07a'] });
    // path
    c.fillStyle = lg(c, 0, 420, 0, H, [[0, rgba('#a89a7a', 0.3)], [1, rgba('#7a6a50', 0.45)]]);
    c.beginPath(); c.moveTo(600, 420); c.quadraticCurveTo(660, 500, 520, 720); c.lineTo(980, 720); c.quadraticCurveTo(760, 520, 690, 420); c.closePath(); c.fill();
    grass(c, rnd, 425, 720, 500, ['#4a6a48', '#6a8a5a', '#2e4430', '#8aa86a'], { h: 16 });
    // foreground framing trunks + ferns
    const r = U.seeded(77);
    for (const [x, w] of [[30, 70], [150, 34], [1180, 80], [1250, 40]]) {
      c.fillStyle = lg(c, x - w / 2, 0, x + w / 2, 0, [[0, '#4a5a44'], [0.4, '#2a3428'], [1, '#121a12']]);
      c.beginPath(); c.moveTo(x - w * 0.6, H); c.quadraticCurveTo(x - w * 0.4, H * 0.5, x - w * 0.42, -10); c.lineTo(x + w * 0.42, -10); c.quadraticCurveTo(x + w * 0.4, H * 0.5, x + w * 0.7, H); c.closePath(); c.fill();
      // moss
      for (let k = 0; k < 20; k++) { c.fillStyle = rgba('#7a9a5a', 0.25); ellipse(c, x - w * 0.3 + r() * w * 0.3, r() * H, w * 0.15, 6 + r() * 10); c.fill(); }
    }
    for (const x of [90, 240, 1080, 1210]) treeFern(c, x, 720, 220 + r() * 60, '#1e3424', r);
    // overhead canopy frame
    for (let x = -60; x < W + 60; x += 44) { c.fillStyle = rgba('#1a2a1e', 0.9); circle(c, x, -30 + r() * 40, 50 + r() * 40); c.fill(); }
    vignette(c, 0.55, '#0a140e', 0.4);
    grain(c, rnd, 4000, 0.03);
  }, (ctx, t) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const a = 0.05 + 0.04 * Math.sin(t * 0.4 + i * 1.7);
      const x0 = 560 + i * 60 + Math.sin(t * 0.1 + i) * 20;
      ctx.globalAlpha = a; ctx.fillStyle = '#fff8dc';
      ctx.beginPath(); ctx.moveTo(x0, -10); ctx.lineTo(x0 + 40, -10); ctx.lineTo(x0 + 240 + i * 30, 720); ctx.lineTo(x0 + 120 + i * 30, 720); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    mist(ctx, t, 'forest1', '#e6f0e8', 260, 200, 0.55, 10, 40, 4);
    mist(ctx, t, 'forest2', '#d8e8dc', 470, 180, 0.4, -14, 40, 5);
    leaves(ctx, t, { n: 14, seed: 6, vx: 12, vy: 26, size: 5, cols: ['#8aa04a', '#b8a040', '#6a8a3a'], sway: 40 });
    motes(ctx, t, { n: 12, seed: 8, x: 0, y: 300, w: W, h: 300, vx: 4, vy: -3, r: 6, col: '#e0ff9a', a: 0.4, tw: 2.5, wob: 30 });
  });

  // ---------- 七彩靈蕈 grove: bioluminescent psychedelic ----------
  const MUSH = [[180, 400, 120, 200, 190], [330, 420, 70, 120, 290], [1040, 395, 140, 230, 160], [1180, 430, 70, 130, 310], [880, 405, 60, 110, 90], [520, 395, 50, 90, 40], [740, 398, 44, 80, 200]];
  def('mushroom', (c, rnd) => {
    vfill(c, 0, H, [[0, '#06031a'], [0.4, '#160a3a'], [0.7, '#1a0f40'], [1, '#08041a']]);
    // concentric aura rings in the sky
    for (let i = 12; i > 0; i--) { c.strokeStyle = rgba(i % 2 ? '#7a4aff' : '#3affd0', 0.05); c.lineWidth = 10; circle(c, 640, 260, i * 40); c.stroke(); }
    glow(c, 640, 260, 420, '#8a3aff', 0.25);
    stars(c, 120, rnd, 300, { a: 0.6, cols: ['#ffffff', '#c0a0ff', '#a0fff0'] });
    // distant trees silhouettes with glowing vines
    for (let li = 0; li < 3; li++) {
      const r = U.seeded(li + 11), col = ['#2a1a5a', '#1c1044', '#120a2e'][li];
      for (let i = 0; i < 10 + li * 3; i++) {
        const x = r() * W, h = 260 + r() * 300 + li * 60, w = 16 + li * 10 + r() * 14;
        c.fillStyle = col;
        c.beginPath(); c.moveTo(x - w, 420); c.bezierCurveTo(x - w * 0.3, 300, x - w * 0.8, 200, x - w * 0.3, 420 - h); c.lineTo(x + w * 0.3, 420 - h); c.bezierCurveTo(x + w * 0.8, 200, x + w * 0.3, 300, x + w, 420); c.fill();
        for (let k = 0; k < 3; k++) { circle(c, x + (r() - 0.5) * 160, 420 - h + r() * 40, 50 + r() * 50); c.fill(); }
        // hanging glow vines
        for (let k = 0; k < 3; k++) {
          const vx = x + (r() - 0.5) * 120, vy = 420 - h + 40, L = 60 + r() * 160;
          c.strokeStyle = rgba(['#5affd0', '#ff6af0', '#9a8aff'][k], 0.3 + li * 0.1); c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(vx, vy); c.quadraticCurveTo(vx + 10, vy + L / 2, vx - 4, vy + L); c.stroke();
          for (let q = 0; q < 4; q++) glow(c, vx - 2, vy + L * (q + 1) / 4, 6, ['#5affd0', '#ff6af0', '#9a8aff'][k], 0.5);
        }
      }
      vfill(c, 200, 440, [[0, rgba('#5a3aa0', 0)], [1, rgba('#5a3aa0', 0.18)]]);
    }
    // ground: mossy glowing floor
    groundBase(c, 400, { stops: [[0, '#1a1048'], [0.3, '#140c38'], [1, '#07041a']], seed: 9, light: '#5affd0', dark: '#000000', blots: 140, blotA: 0.8 });
    for (let i = 0; i < 260; i++) {
      const d = rnd(), y = 405 + d * d * 310, x = rnd() * W;
      const col = ['#3affc0', '#ff5ae0', '#8a7aff', '#ffd05a'][i % 4];
      c.fillStyle = rgba(col, 0.25 + rnd() * 0.4); circle(c, x, y, 0.8 + d * 2.5); c.fill();
      if (rnd() < 0.15) glow(c, x, y, 10 + d * 20, col, 0.3);
    }
    // giant mushrooms
    for (const [x, y, cw, h, hue] of MUSH) {
      const capCol = hueCol(hue, 85, 55), capHi = hueCol(hue + 30, 90, 78), capDk = hueCol(hue - 20, 70, 22);
      glow(c, x, y - h, cw * 2.4, capCol, 0.35);
      c.fillStyle = lg(c, x - cw * 0.15, 0, x + cw * 0.15, 0, [[0, '#e8e0ff'], [0.5, '#a89ad8'], [1, '#4a3a7a']]);
      c.beginPath(); c.moveTo(x - cw * 0.16, y); c.quadraticCurveTo(x - cw * 0.06, y - h * 0.5, x - cw * 0.1, y - h); c.lineTo(x + cw * 0.1, y - h); c.quadraticCurveTo(x + cw * 0.12, y - h * 0.5, x + cw * 0.2, y); c.closePath(); c.fill();
      // gills glow
      c.fillStyle = rgba(capHi, 0.7); ellipse(c, x, y - h + cw * 0.08, cw * 0.95, cw * 0.18); c.fill();
      c.fillStyle = rg(c, x, y - h, cw * 1.05, [[0, capHi], [0.5, capCol], [1, capDk]], 0, x - cw * 0.3, y - h - cw * 0.45);
      c.beginPath(); c.moveTo(x - cw, y - h + cw * 0.06); c.bezierCurveTo(x - cw, y - h - cw * 0.8, x + cw, y - h - cw * 0.8, x + cw, y - h + cw * 0.06); c.quadraticCurveTo(x, y - h - cw * 0.1, x - cw, y - h + cw * 0.06); c.fill();
      for (let k = 0; k < 8; k++) { const a = Math.PI + 0.3 + rnd() * (Math.PI - 0.6), d = 0.3 + rnd() * 0.55; c.fillStyle = rgba('#ffffff', 0.55); ellipse(c, x + Math.cos(a) * cw * d, y - h - cw * 0.05 + Math.sin(a) * cw * 0.5 * d, cw * 0.07, cw * 0.05); c.fill(); }
      c.fillStyle = rgba('#000', 0.35); ellipse(c, x, y + 2, cw * 0.4, 6); c.fill();
    }
    // foreground small mushroom clusters at edges
    for (const [x, y] of [[40, 690], [120, 660], [1230, 680], [1150, 700], [620, 715]]) {
      for (let k = 0; k < 4; k++) {
        const mx = x + (rnd() - 0.5) * 60, mh = 20 + rnd() * 30, mr = 10 + rnd() * 12, hue = rnd() * 360;
        glow(c, mx, y - mh, mr * 3, hueCol(hue), 0.3);
        c.fillStyle = '#c8c0f0'; c.fillRect(mx - 2, y - mh, 4, mh);
        c.fillStyle = rg(c, mx, y - mh, mr, [[0, hueCol(hue + 30, 90, 80)], [1, hueCol(hue, 80, 40)]], 0, mx - mr * 0.3, y - mh - mr * 0.4);
        c.beginPath(); c.ellipse(mx, y - mh, mr, mr * 0.7, 0, Math.PI, 0); c.fill();
      }
    }
    vignette(c, 0.6, '#020010', 0.4);
    grain(c, rnd, 4000, 0.03);
  }, (ctx, t) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // breathing rings
    for (let k = 0; k < 4; k++) {
      const ph = mod(t * 0.12 + k / 4, 1);
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.18;
      ctx.strokeStyle = qHue(t * 30 + k * 90); ctx.lineWidth = 6;
      circle(ctx, 640, 260, 40 + ph * 520); ctx.stroke();
    }
    for (let i = 0; i < MUSH.length; i++) {
      const [x, y, cw, h, hue] = MUSH[i];
      const p = 0.5 + 0.5 * Math.sin(t * 1.3 + i * 1.9);
      lglow(ctx, x, y - h - cw * 0.15, cw * 1.6, qHue(hue + Math.sin(t * 0.5 + i) * 60), 0.3 + p * 0.35);
      lglow(ctx, x, y, cw * 0.9, qHue(hue + 40), 0.15 + p * 0.15);
    }
    ctx.restore();
    motes(ctx, t, { n: 50, seed: 3, x: 0, y: 80, w: W, h: 600, vx: 0, vy: -16, r: 5, cols: ['#5affd0', '#ff6af0', '#ffe05a', '#8a9aff'], col: '#5affd0', a: 0.7, tw: 2, wob: 26 });
    mist(ctx, t, 'mush', '#7a4ad0', 380, 160, 0.35, 9, 36, 9);
  });

  // ---------- 平溪: sky lanterns at dusk ----------
  def('pingxi', (c, rnd) => {
    vfill(c, 0, 380, [[0, '#141a46'], [0.35, '#3a2c6a'], [0.65, '#a0507a'], [0.85, '#f08a5a'], [1, '#ffc27a']]);
    stars(c, 60, rnd, 150, { a: 0.6 });
    cloud(c, 260, 250, 420, 30, { top: '#f0a080', bot: '#6a3a6a', hi: '#ffd0a0', a: 0.7, seed: 4 });
    cloud(c, 980, 210, 380, 26, { top: '#e09090', bot: '#5a3060', hi: '#ffc0a0', a: 0.6, seed: 9 });
    glow(c, 640, 380, 500, '#ffb070', 0.35);
    // baked distant sky lanterns
    for (let i = 0; i < 40; i++) { const x = rnd() * W, y = 30 + rnd() * 220; glow(c, x, y, 10, '#ffc060', 0.5); c.fillStyle = '#ffe0a0'; c.fillRect(x - 1, y - 1.5, 2, 3); }
    // valley hills
    mountain(c, { y: 330, amp: 120, freq: 0.004, seed: 2, col: '#6a4a7a', col2: '#8a5a7a', bottom: 420, haze: '#e09080', hazeA: 0.6, shade: 0.4, light: '#ffc0a0', dark: '#2a1a3a', rim: '#ffd0a0', rimA: 0.3 });
    mountain(c, { y: 380, amp: 140, freq: 0.0045, seed: 6, shape: (x) => -Math.max(0, (x - 900) * 0.25) - Math.max(0, (300 - x) * 0.3),
      col: '#3a2a4a', col2: '#2a2038', bottom: 440, shade: 0.5, light: '#e0a0a0', dark: '#120a1a', trees: { kind: 'round', size: 8, gap: 12, seed: 3 }, haze: '#a06070', hazeA: 0.4 });
    // 十分 old street houses with warm windows on the right slope
    for (let i = 0; i < 7; i++) {
      const x = 900 + i * 56, y = 400 - i * 8, w = 60, h = 50 + (i % 3) * 14;
      c.fillStyle = '#2a1e28'; c.fillRect(x, y - h, w, h);
      c.fillStyle = '#16101a'; c.beginPath(); c.moveTo(x - 6, y - h); c.lineTo(x + w / 2, y - h - 18); c.lineTo(x + w + 6, y - h); c.fill();
      for (let k = 0; k < 2; k++) { c.fillStyle = '#ffc070'; c.fillRect(x + 10 + k * 26, y - h + 16, 12, 14); glow(c, x + 16 + k * 26, y - h + 22, 22, '#ff9a4a', 0.3); }
    }
    // ground with the 平溪線 track running across
    groundBase(c, 420, { stops: [[0, '#4a3a44'], [0.4, '#3a2e36'], [1, '#1a1418']], seed: 3, light: '#ffb080', blots: 90, speckle: 1800, speckCols: ['#0a0608', '#8a6a6a', '#c8907a'], pool: { x: 640, y: 480, r: 500, col: '#ffa060', a: 0.16, sy: 0.3 } });
    for (let x = -10; x < W; x += 26) { c.fillStyle = '#2a1e1a'; c.fillRect(x, 430, 16, 16); c.fillStyle = rgba('#a07050', 0.3); c.fillRect(x, 430, 16, 2); }
    for (const y of [432, 442]) { c.fillStyle = '#c8a890'; c.fillRect(0, y, W, 2); c.fillStyle = '#3a2a24'; c.fillRect(0, y + 2, W, 2); }
    grass(c, rnd, 450, 720, 300, ['#5a5040', '#7a6a50', '#3a3028'], { h: 12, a: 0.6 });
    // wooden station sign post & lamp
    c.fillStyle = '#2a1a14'; c.fillRect(70, 300, 8, 150); c.fillRect(30, 300, 90, 30);
    c.fillStyle = '#e8dcc0'; c.fillRect(34, 304, 82, 22);
    c.fillStyle = '#2a1a14'; c.font = G.font(17, true); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('十分', 75, 316);
    vignette(c, 0.5, '#1a0a1a', 0.45);
    grain(c, rnd, 4000, 0.03);
  }, (ctx, t) => {
    // rising sky lanterns (perspective: shrink as they rise)
    ctx.save();
    for (let i = 0; i < 22; i++) {
      const h1 = U.hash(i, 1, 33), h2 = U.hash(i, 2, 33), h3 = U.hash(i, 3, 33);
      const prog = mod(t * (0.018 + h3 * 0.014) + h1, 1);
      const y = 470 - prog * 520, s = (1 - prog * 0.8) * (0.5 + h3 * 0.7);
      const x = 80 + h2 * 1120 + Math.sin(t * 0.4 + i) * 20 + prog * 80 * (h2 - 0.3);
      const r = Math.max(3, Math.round(14 * s));
      const spr = skyLanternSpr(r);
      const fade = Math.min(1, prog * 8) * Math.min(1, (1 - prog) * 4);
      ctx.globalCompositeOperation = 'lighter';
      lglow(ctx, x, y + r * 2.2, r * 6, '#ff9a40', 0.45 * fade * flick(t, i, 0.3));
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = fade;
      ctx.drawImage(spr, x - spr.lw / 2, y, spr.lw, spr.lh);
    }
    ctx.restore();
    motes(ctx, t, { n: 16, seed: 34, x: 0, y: 380, w: W, h: 300, vx: 5, vy: -6, r: 5, col: '#ffe08a', a: 0.45, tw: 3, wob: 30 });
  });

  // ---------- shared architecture: temple hall, perspective street ----------
  function templeHall(c, cx, by, w, h, o = {}) {
    const wall = o.wall || '#8a3326', stone = o.stone || '#b8aa98';
    const top = by - h;
    // platform
    c.fillStyle = lg(c, 0, by - 16, 0, by + 4, [[0, U.shade(stone, 0.1)], [1, U.shade(stone, -0.45)]]);
    c.fillRect(cx - w / 2 - 30, by - 16, w + 60, 20);
    c.fillStyle = rgba('#ffffff', 0.15); c.fillRect(cx - w / 2 - 30, by - 16, w + 60, 2);
    // wall
    c.fillStyle = lg(c, cx - w / 2, 0, cx + w / 2, 0, [[0, U.shade(wall, 0.12)], [1, U.shade(wall, -0.3)]]);
    c.fillRect(cx - w / 2, top, w, h - 16);
    c.fillStyle = rgba('#000000', 0.12);
    for (let y = top + 6; y < by - 16; y += 6) c.fillRect(cx - w / 2, y, w, 1);
    const bays = o.bays || 3, bw = w / bays;
    for (let b = 0; b < bays; b++) {
      const bx = cx - w / 2 + b * bw;
      if (b === (bays - 1) / 2) {
        const dx = bx + bw * 0.14, dw = bw * 0.72, dy = top + h * 0.2, dh = by - 16 - dy;
        c.fillStyle = o.door || '#7a1a12'; c.fillRect(dx, dy, dw, dh);
        c.fillStyle = rgba('#000', 0.35); c.fillRect(dx + dw / 2 - 1, dy, 2, dh);
        c.fillStyle = o.studs || '#d8a840';
        for (let r = 0; r < 6; r++) for (let k = 0; k < 4; k++) for (const s of [0, 1]) { circle(c, dx + dw * (s * 0.5 + 0.08 + k * 0.11), dy + dh * (0.12 + r * 0.14), Math.max(1, dw * 0.018)); c.fill(); }
        c.strokeStyle = U.shade(o.door || '#7a1a12', -0.5); c.lineWidth = 3; c.strokeRect(dx, dy, dw, dh);
        if (o.plaque) {
          c.fillStyle = '#1a1410'; c.fillRect(cx - bw * 0.3, top + h * 0.04, bw * 0.6, h * 0.13);
          c.strokeStyle = '#d8a840'; c.lineWidth = 2; c.strokeRect(cx - bw * 0.3, top + h * 0.04, bw * 0.6, h * 0.13);
          c.fillStyle = '#e8c060'; c.font = G.font(Math.round(h * 0.09), true); c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(o.plaque, cx, top + h * 0.105);
        }
      } else {
        const s = Math.min(bw * 0.5, h * 0.42), wx = bx + bw / 2, wy = top + h * 0.48;
        c.fillStyle = o.win || '#2a1410';
        if (o.round && b % 2 === 0) { circle(c, wx, wy, s / 2); c.fill(); }
        else c.fillRect(wx - s / 2, wy - s / 2, s, s);
        c.strokeStyle = o.lattice || '#6a4a2a'; c.lineWidth = 1.5;
        for (let k = 1; k < 5; k++) { c.beginPath(); c.moveTo(wx - s / 2 + s * k / 5, wy - s / 2); c.lineTo(wx - s / 2 + s * k / 5, wy + s / 2); c.moveTo(wx - s / 2, wy - s / 2 + s * k / 5); c.lineTo(wx + s / 2, wy - s / 2 + s * k / 5); c.stroke(); }
        if (o.lit) glow(c, wx, wy, s, o.lit, 0.35);
      }
    }
    // columns
    for (let k = 0; k <= bays; k++) {
      const px = cx - w / 2 + k * bw, pw = Math.max(6, w * 0.028);
      c.fillStyle = lg(c, px - pw / 2, 0, px + pw / 2, 0, [[0, U.shade(o.pillar || '#b02a1e', 0.25)], [0.4, o.pillar || '#b02a1e'], [1, U.shade(o.pillar || '#b02a1e', -0.5)]]);
      c.fillRect(px - pw / 2, top - 4, pw, h - 12);
      c.fillStyle = stone; c.fillRect(px - pw * 0.8, by - 26, pw * 1.6, 10);
    }
    // painted beam band (彩繪)
    const bandY = top - 14;
    c.fillStyle = '#1e3a5a'; c.fillRect(cx - w / 2 - 12, bandY, w + 24, 14);
    for (let x = cx - w / 2 - 8; x < cx + w / 2 + 8; x += 26) { c.fillStyle = '#2e7a6a'; c.fillRect(x, bandY + 2, 12, 10); c.fillStyle = '#d8a840'; c.fillRect(x + 14, bandY + 4, 8, 6); }
    c.fillStyle = '#d8a840'; c.fillRect(cx - w / 2 - 12, bandY, w + 24, 2); c.fillRect(cx - w / 2 - 12, bandY + 12, w + 24, 2);
    if (o.double) {
      const uy = bandY - h * 0.42;
      c.fillStyle = U.shade(wall, -0.2); c.fillRect(cx - w * 0.32, uy, w * 0.64, bandY - uy);
      swallowRoof(c, cx, uy, w * 0.82, h * 0.42, { tile: o.tile, ridge: o.ridge, orn: o.orn });
    }
    swallowRoof(c, cx, bandY, w + 90, h * (o.double ? 0.36 : 0.52), { tile: o.tile, ridge: o.ridge, orn: o.double ? null : o.orn });
    return { eaveY: bandY + 2, x0: cx - w / 2 - 45, x1: cx + w / 2 + 45 };
  }

  // one side of a perspective street of 亭仔腳 arcade shophouses
  function streetSide(c, side, o) {
    const vx = o.vx, vy = o.vy, near = side < 0 ? -80 : W + 80;
    const at = (x, yN) => vy + (yN - vy) * ((x - vx) / (near - vx));
    const r = U.seeded(o.seed || 3 + side);
    const xs = [];
    for (let u = 0; u <= o.n; u++) xs.push(vx + (near - vx) / (1 + u * o.k));
    const signs = [];
    for (let i = o.n - 1; i >= 0; i--) {
      const xb = xs[i], xa = xs[i + 1];
      const topN = o.topN + (r() - 0.5) * 120, botN = o.botN;
      const fp = (x, f) => U.lerp(at(x, botN), at(x, topN), f);
      const body = o.cols[i % o.cols.length];
      const s = Math.abs(xb - vx) / Math.abs(near - vx);
      const light = 1 - Math.abs(side) * 0.0;
      // facade
      c.fillStyle = lg(c, xa, 0, xb, 0, [[0, U.shade(body, -0.35)], [1, U.shade(body, side < 0 ? 0.05 : -0.15)]]);
      c.beginPath(); c.moveTo(xb, fp(xb, 0)); c.lineTo(xa, fp(xa, 0)); c.lineTo(xa, fp(xa, 1)); c.lineTo(xb, fp(xb, 1)); c.closePath(); c.fill();
      // brick courses
      c.strokeStyle = rgba('#000000', 0.08); c.lineWidth = 1;
      for (let f = 0.42; f < 1; f += 0.05) { c.beginPath(); c.moveTo(xb, fp(xb, f)); c.lineTo(xa, fp(xa, f)); c.stroke(); }
      // arcade openings (2 arches)
      for (let k = 0; k < 2; k++) {
        const x1 = U.lerp(xb, xa, 0.08 + k * 0.48), x2 = U.lerp(xb, xa, 0.48 + k * 0.48), xm = (x1 + x2) / 2;
        c.fillStyle = lg(c, 0, fp(xm, 0.36), 0, fp(xm, 0), [[0, '#120a08'], [1, '#2a1810']]);
        c.beginPath(); c.moveTo(x1, fp(x1, 0)); c.lineTo(x1, fp(x1, 0.27)); c.quadraticCurveTo(xm, fp(xm, 0.42), x2, fp(x2, 0.27)); c.lineTo(x2, fp(x2, 0)); c.closePath(); c.fill();
        if (o.night) { c.fillStyle = rgba('#ffb060', 0.5); c.beginPath(); c.moveTo(U.lerp(x1, x2, 0.2), fp(x1, 0.04)); c.lineTo(U.lerp(x1, x2, 0.2), fp(x1, 0.2)); c.lineTo(U.lerp(x1, x2, 0.8), fp(x2, 0.2)); c.lineTo(U.lerp(x1, x2, 0.8), fp(x2, 0.04)); c.closePath(); c.fill(); glow(c, xm, fp(xm, 0.12), 60 * s + 10, '#ff9a40', 0.35); }
      }
      // upper windows
      for (let k = 0; k < 2; k++) {
        const x1 = U.lerp(xb, xa, 0.18 + k * 0.45), x2 = U.lerp(xb, xa, 0.36 + k * 0.45);
        c.fillStyle = o.night && r() < 0.7 ? '#e8a050' : '#1a1210';
        c.beginPath(); c.moveTo(x1, fp(x1, 0.55)); c.lineTo(x2, fp(x2, 0.55)); c.lineTo(x2, fp(x2, 0.78)); c.lineTo(x1, fp(x1, 0.78)); c.closePath(); c.fill();
        c.strokeStyle = '#3a2418'; c.lineWidth = Math.max(1, 2.5 * s); c.stroke();
      }
      // cornice & parapet
      c.fillStyle = U.shade(body, 0.25);
      c.beginPath(); c.moveTo(xb, fp(xb, 1) - 2); c.lineTo(xa, fp(xa, 1) - 1); c.lineTo(xa, fp(xa, 0.95)); c.lineTo(xb, fp(xb, 0.95)); c.closePath(); c.fill();
      c.fillStyle = '#1e1614';
      c.beginPath(); c.moveTo(xb, fp(xb, 0.4)); c.lineTo(xa, fp(xa, 0.4)); c.lineTo(xa, fp(xa, 0.37)); c.lineTo(xb, fp(xb, 0.37)); c.closePath(); c.fill();
      // pillar at boundary
      c.fillStyle = U.shade(body, side < 0 ? 0.15 : -0.1); c.fillRect(xb - 6 * s, fp(xb, 0.37), 12 * s, fp(xb, 0) - fp(xb, 0.37));
      signs.push([xb, fp(xb, 0.86), fp(xb, 0.45), s]);
    }
    // vertical shop signboards (face the viewer)
    for (const [x, y0, y1, s] of signs) {
      if (s < 0.12) continue;
      const w = 26 * s + 4, txt = o.signs[Math.floor(r() * o.signs.length)];
      const sx = x + side * -w * 0.9;
      c.fillStyle = r() < 0.5 ? '#1a1410' : '#7a1a14'; c.fillRect(sx - w / 2, y0, w, y1 - y0);
      c.strokeStyle = '#c8a050'; c.lineWidth = Math.max(1, 2 * s); c.strokeRect(sx - w / 2, y0, w, y1 - y0);
      c.fillStyle = '#e8d090'; c.font = G.font(Math.round(w * 0.62), true); c.textAlign = 'center'; c.textBaseline = 'middle';
      const n = txt.length, step = (y1 - y0) / (n + 0.5);
      for (let k = 0; k < n; k++) c.fillText(txt[k], sx, y0 + step * (k + 0.75));
    }
    return { xs, at };
  }

  // ---------- 山道: high mountain pass (day) ----------
  def('mountain', (c, rnd) => {
    vfill(c, 0, 420, [[0, '#3f78c0'], [0.5, '#8ab8e0'], [1, '#e0eef2']]);
    sun(c, 260, 90, 22, '#fffbe8', '#fff0c0', 0.4);
    cloud(c, 900, 110, 420, 60, { top: '#ffffff', bot: '#c0d0e4', seed: 3, rim: '#fff8e0', rimSide: 'left' });
    cloud(c, 420, 170, 300, 40, { top: '#ffffff', bot: '#ccd8ea', seed: 7, a: 0.9 });
    mountain(c, { y: 300, amp: 200, freq: 0.0035, seed: 4, ridged: true, col: '#a8bcd8', col2: '#c8d8e8', bottom: 420, shade: 0.8, light: '#ffffff', dark: '#5a7090', haze: '#e0eef2', hazeA: 0.7, rim: '#ffffff', rimA: 0.5, tex: 140 });
    mountain(c, { y: 360, amp: 160, freq: 0.004, seed: 9, ridged: true, col: '#5f8aa0', col2: '#88aab8', bottom: 440, shade: 0.7, light: '#e8f4ff', dark: '#2a4a60', haze: '#d0e4ea', hazeA: 0.6, rim: '#ffffff', rimA: 0.3 });
    mountain(c, { y: 400, amp: 110, freq: 0.005, seed: 13, col: '#3f6a52', col2: '#5a8068', bottom: 460, shade: 0.6, light: '#d8f0b0', dark: '#10241a', trees: { kind: 'pine', size: 7, gap: 7, seed: 4 }, haze: '#c8dccc', hazeA: 0.5 });
    // ground: rocky alpine meadow
    const gp = profile({ y: 430, amp: 30, freq: 0.004, seed: 21, oct: 3 });
    layer(c, (x) => { pathProfile(x, gp); x.fillStyle = lg(x, 0, 400, 0, H, [[0, '#7a9a5a'], [0.4, '#5a7a42'], [1, '#2e4424']]); x.fill(); }, (x) => {
      const r = U.seeded(5);
      for (let i = 0; i < 120; i++) softBlob(x, r() * W, 420 + Math.pow(r(), 2) * 300, 40 + r() * 140, 6 + r() * 20, r() < 0.5 ? '#c8d890' : '#1a2a14', 0.08);
      speckle(x, r, 410, H, 1500, ['#2a3a1a', '#a8b880', '#8a8070'], 0.4);
      // trail
      x.fillStyle = lg(x, 0, 430, 0, H, [[0, rgba('#c8b490', 0.5)], [1, rgba('#a08c6a', 0.7)]]);
      x.beginPath(); x.moveTo(700, 428); x.bezierCurveTo(760, 480, 520, 560, 560, 720); x.lineTo(900, 720); x.bezierCurveTo(820, 580, 860, 480, 740, 428); x.closePath(); x.fill();
      speckle(x, r, 440, H, 500, ['#6a5a44', '#e0d0b0'], 0.5);
    });
    // boulders and framing pines
    rock(c, 90, 470, 80, 46, ['#b8b4a8', '#7a7a74', '#3a3a38'], rnd);
    rock(c, 1190, 480, 110, 60, ['#c0bcb0', '#80807a', '#3a3a38'], rnd);
    rock(c, 980, 432, 40, 22, ['#b8b4a8', '#7a7a74', '#3a3a38'], rnd);
    grass(c, rnd, 430, 720, 600, ['#6a8a4a', '#8aaa5a', '#4a6a34', '#b0c070'], { h: 18, lean: 0.3 });
    pine(c, 40, 720, 560, '#1e3a2a', { light: '#4a7a54', dark: '#0a1a12', tiers: 8, trunk: '#3a2a20' });
    pine(c, 1240, 720, 600, '#1e3a2a', { light: '#4a7a54', dark: '#0a1a12', tiers: 8, trunk: '#3a2a20' });
    pine(c, 1140, 520, 220, '#2a4a36', { light: '#5a8a5a', dark: '#12241a', tiers: 6 });
    vignette(c, 0.3, '#1a2a30', 0.5);
    grain(c, rnd, 3000, 0.025);
  }, (ctx, t) => {
    mist(ctx, t, 'mtn1', '#ffffff', 300, 140, 0.55, 9, 30, 12);
    mist(ctx, t, 'mtn2', '#f0f6ff', 380, 110, 0.35, -6, 30, 13);
    // soaring hawk (林鵰)
    ctx.save(); ctx.fillStyle = '#2a2a30';
    for (let i = 0; i < 2; i++) {
      const a = t * (0.25 + i * 0.07) + i * 3, x = 640 + i * 200 + Math.cos(a) * 160, y = 150 + i * 40 + Math.sin(a) * 40, f = Math.sin(t * 2 + i) * 3;
      ctx.beginPath(); ctx.moveTo(x - 16, y - f); ctx.quadraticCurveTo(x - 6, y - 4, x, y); ctx.quadraticCurveTo(x + 6, y - 4, x + 16, y - f); ctx.lineTo(x, y + 2); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    leaves(ctx, t, { n: 8, seed: 3, vx: 60, vy: 30, size: 3, cols: ['#d0d890', '#8aa060'], sway: 30 });
  });

  // ---------- 道觀 temple courtyard (dusk) ----------
  let TEMPLE_EAVE = null;
  def('temple', (c, rnd) => {
    vfill(c, 0, 400, [[0, '#2a2a5a'], [0.45, '#7a4a6a'], [0.8, '#e08a5a'], [1, '#f8c080']]);
    cloud(c, 240, 120, 360, 30, { top: '#e8a090', bot: '#5a3a5a', hi: '#ffd0b0', a: 0.7, seed: 2 });
    cloud(c, 1060, 90, 320, 26, { top: '#d89090', bot: '#4a3050', hi: '#ffc0a0', a: 0.6, seed: 5 });
    mountain(c, { y: 330, amp: 90, freq: 0.004, seed: 3, col: '#4a3a5a', col2: '#7a5060', bottom: 400, haze: '#f0a070', hazeA: 0.5 });
    // trees behind walls
    for (const [x, h] of [[90, 300], [1190, 320], [250, 220], [1030, 230]]) broadTree(c, x, 400, h, ['#4a5a3a', '#2a3a24', '#141c12'], rnd, { trunk: '#2a1a14' });
    // side walls with gates
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? 0 : 1000, x1 = s < 0 ? 280 : W;
      c.fillStyle = lg(c, 0, 300, 0, 400, [[0, '#9a4030'], [1, '#6a2a20']]); c.fillRect(x0, 316, x1 - x0, 84);
      c.fillStyle = '#3a1a14'; c.fillRect(x0, 306, x1 - x0, 12);
      c.fillStyle = '#7a3024'; c.fillRect(x0, 302, x1 - x0, 5);
      c.fillStyle = '#e8d8b8'; for (let x = x0 + 30; x < x1 - 20; x += 70) { c.save(); c.translate(x, 352); c.fillStyle = '#5a2018'; circle(c, 0, 0, 16); c.fill(); c.strokeStyle = '#d8a840'; c.lineWidth = 1.5; c.stroke(); c.restore(); }
    }
    TEMPLE_EAVE = templeHall(c, 640, 404, 560, 190, { double: true, orn: '#d8a840', plaque: '太虛觀', lit: '#ffb060', tile: '#3a4a5a', ridge: '#8a3a2a', wall: '#9a3a2a' });
    // incense burner (天公爐) on a stone base
    const bx = 640, by = 412;
    c.fillStyle = '#6a5a4a'; c.fillRect(bx - 40, by - 12, 80, 12);
    c.fillStyle = lg(c, bx - 34, 0, bx + 34, 0, [[0, '#8a7a5a'], [0.35, '#d8b870'], [1, '#3a2a1a']]);
    c.beginPath(); c.moveTo(bx - 30, by - 12); c.quadraticCurveTo(bx - 40, by - 50, bx - 32, by - 60); c.lineTo(bx + 32, by - 60); c.quadraticCurveTo(bx + 40, by - 50, bx + 30, by - 12); c.closePath(); c.fill();
    c.fillStyle = '#3a2a1a'; c.fillRect(bx - 38, by - 64, 76, 6);
    for (const s of [-1, 1]) { c.strokeStyle = '#b89858'; c.lineWidth = 4; c.beginPath(); c.arc(bx + s * 36, by - 54, 8, 0, TAU); c.stroke(); }
    glow(c, bx, by - 64, 40, '#ff8a3a', 0.4);
    // courtyard
    groundBase(c, 404, { stops: [[0, '#8a7a6a'], [0.5, '#7a6858'], [1, '#4a3a30']], seed: 8, light: '#ffd0a0', dark: '#2a1a14', blots: 60, pool: { x: 640, y: 470, r: 600, col: '#ffb070', a: 0.18, sy: 0.25 } });
    pavers(c, 412, H, 12, { gap: '#3a2a22', light: '#ffe0c0', dark: '#2a1a12', var: 0.1, hi: 0.15, seed: 4, w0: 50, w1: 160 });
    // stone lanterns at far corners
    for (const x of [330, 950]) {
      c.fillStyle = '#7a7268'; c.fillRect(x - 8, 350, 16, 52); c.fillRect(x - 18, 340, 36, 12); c.fillRect(x - 14, 396, 28, 8);
      c.fillStyle = '#ffcf80'; c.fillRect(x - 10, 324, 20, 16); c.fillStyle = '#5a524a'; c.beginPath(); c.moveTo(x - 22, 326); c.lineTo(x, 310); c.lineTo(x + 22, 326); c.fill();
      glow(c, x, 332, 50, '#ffa040', 0.5);
    }
    vignette(c, 0.45, '#1a0a10', 0.45);
    grade(c, '#ffb070', 0.12, 'soft-light');
    grain(c, rnd, 4000, 0.03);
  }, (ctx, t) => {
    // incense smoke
    ctx.save();
    for (let i = 0; i < 16; i++) {
      const ph = mod(t * 0.12 + i / 16, 1);
      const x = 640 + Math.sin(ph * 5 + t * 0.6 + i) * 22 * ph + ph * 40, y = 340 - ph * 300;
      lglow(ctx, x, y, 14 + ph * 50, '#d8d0c8', (1 - ph) * Math.min(1, ph * 6) * 0.22);
    }
    ctx.restore();
    if (TEMPLE_EAVE) for (let i = 0; i < 4; i++) {
      const x = U.lerp(TEMPLE_EAVE.x0 + 40, TEMPLE_EAVE.x1 - 40, i / 3);
      hangLantern(ctx, t, x, TEMPLE_EAVE.eaveY + 4, '#d83a2a', 14, i + 2, { glowR: 90, glowA: 0.45, char: '福' });
    }
    motes(ctx, t, { n: 22, seed: 6, x: 400, y: 120, w: 480, h: 300, vx: 6, vy: -12, r: 4, col: '#ffb060', a: 0.6, tw: 3, wob: 24 });
    mist(ctx, t, 'temple', '#ffd0b0', 330, 90, 0.18, 6, 30, 21);
  });

  // ---------- 艋舺 street at dusk ----------
  const CITY_STR = [];
  def('city', (c, rnd) => {
    CITY_STR.length = 0;
    const vx = 640, vy = 330;
    vfill(c, 0, 360, [[0, '#1a2050'], [0.5, '#5a3a6a'], [0.85, '#d07a60'], [1, '#f0a070']]);
    stars(c, 40, rnd, 120, { a: 0.5 });
    cloud(c, 640, 140, 520, 30, { top: '#c07080', bot: '#3a2a50', hi: '#ffc0a0', a: 0.6, seed: 4 });
    // 龍山寺 roof at the end of the street
    templeHall(c, vx, vy + 22, 210, 64, { double: true, orn: '#e0b050', tile: '#4a3a3a', ridge: '#c05030', wall: '#8a3a2a', lit: '#ffb060' });
    glow(c, vx, vy, 200, '#ffb070', 0.3);
    const L = streetSide(c, -1, { vx, vy, n: 8, k: 0.55, topN: 0, botN: 470, cols: ['#8a3a2c', '#a07a5a', '#7a4a3a', '#9a8a7a'], night: true, seed: 3, signs: ['米舖', '布莊', '青草巷', '藥行', '茶行', '金紙'] });
    const R = streetSide(c, 1, { vx, vy, n: 8, k: 0.55, topN: 10, botN: 470, cols: ['#9a7a5a', '#8a3a2c', '#7a5a4a', '#a04a34'], night: true, seed: 9, signs: ['糕餅', '當舖', '錢莊', '客棧', '雜貨', '藥材'] });
    // street ground
    c.fillStyle = lg(c, 0, vy, 0, H, [[0, '#3a2a2a'], [0.3, '#4a3a38'], [1, '#2a1e1e']]);
    c.beginPath(); c.moveTo(L.xs[8], L.at(L.xs[8], 470)); c.lineTo(R.xs[8], R.at(R.xs[8], 470)); c.lineTo(W + 80, 470); c.lineTo(W + 80, H); c.lineTo(-80, H); c.lineTo(-80, 470); c.closePath(); c.fill();
    c.save(); c.beginPath(); c.moveTo(vx, vy); c.lineTo(W + 600, H); c.lineTo(-600, H); c.closePath(); c.clip();
    pavers(c, vy + 30, H, 16, { gap: '#140c0a', light: '#ffd0a0', dark: '#000000', var: 0.1, hi: 0.1, seed: 9, w0: 10, w1: 120, pow: 2 });
    c.restore();
    c.fillStyle = rg(c, 640, 520, 520, [[0, rgba('#ffb070', 0.2)], [1, rgba('#ffb070', 0)]]); c.fillRect(0, 330, W, 390);
    // lantern strings across the street at several depths
    for (let k = 1; k < 6; k++) {
      const xl = L.xs[k], xr = R.xs[k];
      const yl = U.lerp(L.at(xl, 470), L.at(xl, 0), 0.82), yr = U.lerp(R.at(xr, 470), R.at(xr, 10), 0.82);
      const sag = 40 / k;
      c.strokeStyle = '#140a08'; c.lineWidth = Math.max(0.8, 2.5 / k);
      c.beginPath(); c.moveTo(xl, yl); c.quadraticCurveTo((xl + xr) / 2, (yl + yr) / 2 + sag * 2, xr, yr); c.stroke();
      const n = 5 + k;
      for (let j = 1; j < n; j++) {
        const f = j / n, x = (1 - f) * (1 - f) * xl + 2 * (1 - f) * f * (xl + xr) / 2 + f * f * xr;
        const y = (1 - f) * (1 - f) * yl + 2 * (1 - f) * f * ((yl + yr) / 2 + sag * 2) + f * f * yr;
        const r = 14 / Math.pow(k, 0.9);
        if (k === 1) CITY_STR.push([x, y, r]);
        else { lanternShape(c, x, y + r * 1.6, r, '#d83a2a', 1, { tassel: r > 5 }); glow(c, x, y + r * 1.6, r * 5, '#ff8a3a', 0.35); }
      }
    }
    vignette(c, 0.55, '#0a0408', 0.4);
    grain(c, rnd, 4000, 0.03);
  }, (ctx, t) => {
    for (let i = 0; i < CITY_STR.length; i++) hangLantern(ctx, t, CITY_STR[i][0], CITY_STR[i][1], '#d83a2a', CITY_STR[i][2], i + 7, { glowR: 80, glowA: 0.45, sway: 0.08 });
    // food stall steam
    for (let i = 0; i < 8; i++) {
      const ph = mod(t * 0.2 + i / 8, 1);
      lglow(ctx, 200 + Math.sin(ph * 4 + i) * 14, 430 - ph * 160, 16 + ph * 30, '#e0d8d0', (1 - ph) * Math.min(1, ph * 5) * 0.18);
    }
    motes(ctx, t, { n: 20, seed: 12, x: 0, y: 100, w: W, h: 500, vx: 5, vy: -10, r: 4, col: '#ffb060', a: 0.5, tw: 3, wob: 20 });
    leaves(ctx, t, { n: 5, seed: 13, vx: 25, vy: 18, size: 4, cols: ['#e8d8b0', '#d84030'], shape: 'bit', sway: 40, a: 0.7 });
  });

  // ---------- 洛家古厝: haunted 閩南 mansion ----------
  let MANSION_E = null;
  def('mansion', (c, rnd) => {
    vfill(c, 0, 400, [[0, '#04070c'], [0.5, '#0c1a20'], [1, '#1a2e2a']]);
    stars(c, 90, rnd, 300, { a: 0.5 });
    moon(c, 1000, 110, 50, { col: '#e8f0d8', haloCol: '#5ab09a', haloA: 0.45 });
    cloud(c, 980, 150, 400, 30, { top: '#2a4a44', bot: '#0c1a1a', hi: '#8ad0b0', hiA: 0.3, a: 0.8, seed: 2 });
    // withered tree (left)
    c.strokeStyle = '#0a0e0e'; c.lineCap = 'round';
    const branch = (x, y, a, len, w, d) => {
      if (d === 0 || len < 6) return;
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      c.lineWidth = w; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a + 0.3) * len * 0.5, y + Math.sin(a + 0.3) * len * 0.5, ex, ey); c.stroke();
      branch(ex, ey, a - 0.3 - rnd() * 0.4, len * (0.6 + rnd() * 0.2), w * 0.65, d - 1);
      branch(ex, ey, a + 0.3 + rnd() * 0.4, len * (0.55 + rnd() * 0.2), w * 0.6, d - 1);
    };
    branch(150, 420, -Math.PI / 2 - 0.15, 150, 22, 7);
    // main hall: dulled red brick, swallowtail
    const e = templeHall(c, 640, 410, 520, 170, { wall: '#5a2a24', pillar: '#4a1a16', door: '#3a120e', studs: '#7a6a4a', win: '#060a0a', lattice: '#3a2a20', lit: '#5ad0a0', tile: '#2a2a2e', ridge: '#5a2a24', stone: '#5a5a54' });
    // side wing walls with a moon gate (right)
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? 0 : 940, x1 = s < 0 ? 340 : W;
      c.fillStyle = lg(c, 0, 290, 0, 410, [[0, '#4a2420'], [1, '#2a1412']]); c.fillRect(x0, 300, x1 - x0, 110);
      c.fillStyle = '#1a1a1e'; c.fillRect(x0 - 4, 292, x1 - x0 + 8, 10);
      for (let y = 306; y < 410; y += 7) { c.fillStyle = rgba('#000', 0.15); c.fillRect(x0, y, x1 - x0, 1); }
    }
    c.fillStyle = '#020404'; circle(c, 1110, 360, 46); c.fill();
    c.fillStyle = rg(c, 1110, 370, 46, [[0, rgba('#5ad0a0', 0.3)], [1, rgba('#5ad0a0', 0)]]); circle(c, 1110, 360, 46); c.fill();
    c.fillStyle = '#020404'; c.fillRect(1064, 360, 92, 50);
    c.strokeStyle = '#6a6a60'; c.lineWidth = 4; c.beginPath(); c.arc(1110, 360, 48, Math.PI, 0); c.stroke();
    // cracks + torn paper charms on doors
    c.strokeStyle = rgba('#000000', 0.6); c.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) { let x = 420 + rnd() * 440, y = 260 + rnd() * 100; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 20; y += 8 + rnd() * 10; c.lineTo(x, y); } c.stroke(); }
    for (const x of [612, 660]) { c.fillStyle = '#c8b060'; c.save(); c.translate(x, 330); c.rotate(0.15); c.fillRect(-6, 0, 12, 34); c.fillStyle = '#8a1a10'; c.fillRect(-3, 4, 6, 24); c.restore(); }
    // red brick courtyard (herringbone-ish, dark)
    groundBase(c, 410, { stops: [[0, '#3a2422'], [0.5, '#2e1c1c'], [1, '#140c0c']], seed: 3, light: '#5ad0a0', blots: 60 });
    pavers(c, 412, H, 16, { gap: '#0a0606', light: '#c86a50', dark: '#000000', var: 0.14, hi: 0.06, seed: 21, w0: 20, w1: 60 });
    c.fillStyle = rg(c, 640, 520, 540, [[0, rgba('#5ad0a0', 0.1)], [1, rgba('#5ad0a0', 0)]]); c.fillRect(0, 400, W, 320);
    // dead leaves & broken jar
    for (let i = 0; i < 80; i++) { const d = rnd(); c.fillStyle = rgba(rnd() < 0.5 ? '#5a4030' : '#3a2a1e', 0.7); ellipse(c, rnd() * W, 420 + d * d * 300, 3 + d * 6, 1 + d * 2, rnd()); c.fill(); }
    vignette(c, 0.7, '#000000', 0.35);
    grade(c, '#2a6a5a', 0.25, 'soft-light');
    grain(c, rnd, 5000, 0.04);
    MANSION_E = e;
  }, (ctx, t) => {
    // flickering dead lanterns (one sputters)
    if (MANSION_E) {
      for (let i = 0; i < 3; i++) {
        const x = U.lerp(MANSION_E.x0 + 60, MANSION_E.x1 - 60, i / 2);
        const on = i === 1 ? (Math.sin(t * 7) + Math.sin(t * 13.3) > 0.6 ? 0.1 : 1) : 0.8;
        hangLantern(ctx, t, x, MANSION_E.eaveY + 4, '#8a3a2a', 13, i + 4, { glowR: 70, glowA: 0.35 * on, glowCol: '#5ad0a0', lit: 0.3, sway: 0.12, char: '奠' });
      }
    }
    // ghost fires (鬼火)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const a = t * (0.3 + U.hash(i, 1, 2) * 0.3) + i * 2;
      const x = 200 + U.hash(i, 2, 2) * 880 + Math.sin(a) * 60, y = 280 + U.hash(i, 3, 2) * 200 + Math.sin(a * 2.3) * 20;
      const f = 0.6 + 0.4 * Math.sin(t * 5 + i * 3);
      lglow(ctx, x, y, 40, '#3affc0', 0.25 * f);
      lglow(ctx, x, y, 10, '#c0fff0', 0.7 * f, true);
      for (let k = 1; k < 5; k++) lglow(ctx, x - Math.sin(a) * k * 6, y + k * 5, 8 - k, '#3affc0', 0.25 * f * (1 - k / 5), true);
    }
    ctx.restore();
    mist(ctx, t, 'mans1', '#6ab0a0', 360, 140, 0.35, 8, 36, 31);
    mist(ctx, t, 'mans2', '#4a8a80', 560, 160, 0.4, -11, 36, 32);
    leaves(ctx, t, { n: 7, seed: 17, vx: 20, vy: 24, size: 5, cols: ['#4a3a2a', '#6a4a30'], sway: 50 });
  });

  // ---------- 府城: 赤崁樓-like pavilions under phoenix trees ----------
  def('tainan', (c, rnd) => {
    vfill(c, 0, 400, [[0, '#4a6aa8'], [0.45, '#d89a80'], [0.8, '#f8c890'], [1, '#ffe0a8']]);
    sun(c, 980, 250, 34, '#fff4d0', '#ffb070', 0.5);
    cloud(c, 380, 140, 400, 44, { top: '#ffe8d0', bot: '#c08a8a', hi: '#ffffff', a: 0.85, seed: 3, rim: '#ffd8a0', rimSide: 'right' });
    cloud(c, 900, 90, 300, 30, { top: '#ffe8d8', bot: '#c09098', a: 0.7, seed: 8 });
    // 赤崁樓: two pavilions with double eaves on a high red-brick platform
    const towers = [[470, 190], [820, 210]];
    c.fillStyle = lg(c, 0, 330, 0, 410, [[0, '#a84a34'], [1, '#6a2a1e']]); c.fillRect(300, 340, 700, 70);
    for (let y = 344; y < 410; y += 6) { c.fillStyle = rgba('#000', 0.12); c.fillRect(300, y, 700, 1); }
    for (let x = 340; x < 980; x += 60) { c.fillStyle = '#2a1410'; c.beginPath(); c.moveTo(x, 410); c.lineTo(x, 385); c.arc(x + 15, 385, 15, Math.PI, 0); c.lineTo(x + 30, 410); c.fill(); }
    c.fillStyle = '#d8c8a8'; c.fillRect(296, 334, 708, 8);
    for (const [x, w] of towers) {
      const by = 336;
      c.fillStyle = '#c03a28'; c.fillRect(x - w * 0.4, by - 70, w * 0.8, 70);
      for (let k = 0; k < 5; k++) { c.fillStyle = '#5a1a12'; c.fillRect(x - w * 0.36 + k * w * 0.18, by - 62, w * 0.1, 50); c.fillStyle = '#e0a040'; c.fillRect(x - w * 0.36 + k * w * 0.18, by - 62, w * 0.1, 3); }
      swallowRoof(c, x, by - 70, w * 1.25, 34, { tile: '#4a3a38', ridge: '#c04a30' });
      c.fillStyle = '#b8382a'; c.fillRect(x - w * 0.3, by - 160, w * 0.6, 60);
      for (let k = 0; k < 4; k++) { c.fillStyle = '#4a1610'; c.fillRect(x - w * 0.26 + k * w * 0.14, by - 152, w * 0.08, 40); }
      swallowRoof(c, x, by - 100, w * 1.0, 30, { tile: '#4a3a38', ridge: '#c04a30' });
      swallowRoof(c, x, by - 160, w * 0.85, 50, { tile: '#4a3a38', ridge: '#c04a30', orn: '#e0b050' });
    }
    // phoenix trees (鳳凰木) with flame-red blossoms framing
    const phoenix = (x, y, h, flip) => {
      c.strokeStyle = '#3a2418'; c.lineCap = 'round';
      c.lineWidth = h * 0.06; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + flip * h * 0.1, y - h * 0.4, x + flip * h * 0.2, y - h * 0.6); c.stroke();
      c.lineWidth = h * 0.03;
      for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(x + flip * h * 0.15, y - h * 0.5); c.quadraticCurveTo(x + flip * h * (0.2 + k * 0.12), y - h * (0.75 + rnd() * 0.1), x + flip * h * (0.1 + k * 0.22), y - h * (0.7 + rnd() * 0.15)); c.stroke(); }
      // feathery canopy masses, then thousands of small flame-red blossoms
      const cx0 = x + flip * h * 0.45, cy0 = y - h * 0.78;
      for (let i = 0; i < 26; i++) {
        const a = rnd() * TAU, d = Math.sqrt(rnd());
        const bx = cx0 + Math.cos(a) * d * h * 0.62, by = cy0 + Math.sin(a) * d * h * 0.16, rr = h * (0.06 + rnd() * 0.06);
        c.fillStyle = rg(c, bx, by, rr * 1.6, [[0, rgba('#5a8a3a', 0.9)], [0.6, rgba('#2e5020', 0.7)], [1, rgba('#1a3010', 0)]], 0, bx - rr * 0.4, by - rr * 0.5);
        ellipse(c, bx, by, rr * 1.6, rr * 0.9); c.fill();
      }
      for (let i = 0; i < 900; i++) {
        const a = rnd() * TAU, d = Math.sqrt(rnd());
        const bx = cx0 + Math.cos(a) * d * h * 0.66, by = cy0 + Math.sin(a) * d * h * 0.17 - (1 - d) * h * 0.04;
        const top = clamp((cy0 - by) / (h * 0.17) * 0.5 + 0.5, 0, 1);
        const rr = 1.5 + rnd() * h * 0.009;
        c.fillStyle = rnd() < 0.15 ? rgba('#ffb070', 0.9) : U.mix('#8a1a10', '#ff5a2a', top * 0.7 + rnd() * 0.3);
        ellipse(c, bx, by, rr * 1.3, rr, rnd() * 3); c.fill();
      }
    };
    phoenix(60, 480, 460, 1);
    phoenix(1230, 470, 420, -1);
    // brick courtyard
    groundBase(c, 410, { stops: [[0, '#b0705a'], [0.5, '#9a5a46'], [1, '#5a3024']], seed: 5, light: '#ffd8b0', dark: '#3a1a10', blots: 70, pool: { x: 800, y: 470, r: 560, col: '#ffd090', a: 0.25, sy: 0.3 } });
    pavers(c, 412, H, 13, { gap: '#5a281e', light: '#ffc8a0', dark: '#3a1008', var: 0.1, hi: 0.1, seed: 15, w0: 26, w1: 90, gapA: 0.35 });
    // fallen blossoms
    for (let i = 0; i < 160; i++) { const d = rnd(); c.fillStyle = rgba(rnd() < 0.7 ? '#e8401e' : '#ffa040', 0.75); ellipse(c, rnd() < 0.5 ? rnd() * 350 : 930 + rnd() * 350, 420 + d * d * 300, 2 + d * 4, 1 + d * 2, rnd() * 3); c.fill(); }
    vignette(c, 0.35, '#3a1a10', 0.5);
    grade(c, '#ffb070', 0.18, 'soft-light');
    grain(c, rnd, 3500, 0.03);
  }, (ctx, t) => {
    leaves(ctx, t, { n: 18, seed: 23, vx: 18, vy: 30, size: 5, cols: ['#e8401e', '#ff7040', '#c02a14'], shape: 'petal', sway: 40 });
    motes(ctx, t, { n: 14, seed: 24, x: 0, y: 100, w: W, h: 400, vx: 4, vy: -5, r: 5, col: '#fff0c0', a: 0.35, tw: 2, wob: 30 });
    ctx.save(); ctx.strokeStyle = '#3a2a2a'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) {
      const x = mod(t * (40 + i * 9) + i * 330, W + 200) - 100, y = 120 + i * 30 + Math.sin(t * 1.2 + i) * 14, f = Math.sin(t * 9 + i) * 4;
      ctx.beginPath(); ctx.moveTo(x - 8, y - f); ctx.quadraticCurveTo(x - 3, y - 2, x, y); ctx.quadraticCurveTo(x + 3, y - 2, x + 8, y - f); ctx.stroke();
    }
    ctx.restore();
  });

  // ---------- 長明宮 interior: jars of blue soul-lanterns ----------
  const PAL_JARS = [];
  def('palace', (c, rnd) => {
    PAL_JARS.length = 0;
    const vx = 640, vy = 300;
    vfill(c, 0, H, [[0, '#02040a'], [0.4, '#081428'], [0.6, '#0a1830'], [1, '#03060c']]);
    // back wall with the great eternal lamp altar
    c.fillStyle = lg(c, 0, 120, 0, 380, [[0, '#0a1424'], [1, '#14223a']]); c.fillRect(380, 120, 520, 260);
    glow(c, vx, 250, 300, '#5aa0ff', 0.35);
    // shelves along back wall
    for (let row = 0; row < 4; row++) for (let k = 0; k < 14; k++) {
      const x = 400 + k * 35 + 8, y = 150 + row * 52;
      if (Math.abs(x - vx) < 70) continue;
      PAL_JARS.push([x, y + 30, 0.55]);
    }
    for (let row = 0; row < 4; row++) { c.fillStyle = '#1a1a24'; c.fillRect(390, 150 + row * 52 + 40, 500, 6); }
    // ceiling beams receding
    for (let i = 0; i < 8; i++) {
      const f = 1 / (1 + i * 0.5), y = vy - 300 * f;
      c.fillStyle = U.mix('#1a1420', '#04060c', 1 - f); c.fillRect(vx - 700 * f, y - 16 * f, 1400 * f, 22 * f);
      c.fillStyle = rgba('#d8a840', 0.25 * f); c.fillRect(vx - 700 * f, y + 4 * f, 1400 * f, 2 * f);
    }
    // pillars receding on both sides
    for (let i = 6; i >= 0; i--) {
      const f = 1 / (1 + i * 0.45);
      for (const s of [-1, 1]) {
        const x = vx + s * 560 * f, top = vy - 340 * f, bot = vy + 260 * f, pw = 50 * f;
        c.fillStyle = lg(c, x - pw / 2, 0, x + pw / 2, 0, [[0, U.mix('#3a1a24', '#05070e', 1 - f)], [0.35, U.mix('#5a2030', '#05070e', 1 - f)], [1, U.mix('#14060a', '#020306', 1 - f)]]);
        c.fillRect(x - pw / 2, top, pw, bot - top);
        c.fillStyle = rgba('#7ab8ff', 0.25 * f); c.fillRect(x + s * -pw / 2, top, 2 * f + 0.5, bot - top);
        c.fillStyle = U.mix('#3a3a44', '#05070e', 1 - f); c.fillRect(x - pw * 0.7, bot - 16 * f, pw * 1.4, 16 * f);
        // side shelves between pillars, jars
        if (i < 6) {
          const f2 = 1 / (1 + (i + 1) * 0.45), x2 = vx + s * 560 * f2;
          for (let row = 0; row < 4; row++) {
            const yy = (ff) => vy - 200 * ff + row * 90 * ff;
            c.fillStyle = rgba('#14141c', 0.9);
            c.beginPath(); c.moveTo(x, yy(f) + 30 * f); c.lineTo(x2, yy(f2) + 30 * f2); c.lineTo(x2, yy(f2) + 34 * f2); c.lineTo(x, yy(f) + 36 * f); c.fill();
            for (let k = 0; k < 4; k++) { const u = (k + 0.5) / 4, ff = U.lerp(f, f2, u); PAL_JARS.push([U.lerp(x, x2, u), yy(ff) + 28 * ff, ff]); }
          }
        }
      }
    }
    // jars (baked glass bodies)
    for (const [x, y, s] of PAL_JARS) {
      c.fillStyle = rgba('#8ac8ff', 0.22); ellipse(c, x, y - 12 * s, 10 * s, 13 * s); c.fill();
      c.strokeStyle = rgba('#b8e0ff', 0.35); c.lineWidth = Math.max(0.5, s); ellipse(c, x, y - 12 * s, 10 * s, 13 * s); c.stroke();
      c.fillStyle = '#2a2a3a'; c.fillRect(x - 6 * s, y - 27 * s, 12 * s, 4 * s);
      glow(c, x, y - 12 * s, 16 * s, '#6ab8ff', 0.4);
    }
    // altar + great lamp
    c.fillStyle = lg(c, 0, 330, 0, 400, [[0, '#3a1a20'], [1, '#14080c']]); c.fillRect(vx - 120, 330, 240, 70);
    c.fillStyle = '#d8a840'; c.fillRect(vx - 124, 326, 248, 6);
    c.fillStyle = lg(c, vx - 20, 0, vx + 20, 0, [[0, '#6a5a3a'], [0.4, '#e8c060'], [1, '#3a2a1a']]); c.fillRect(vx - 14, 260, 28, 70);
    c.beginPath(); c.moveTo(vx - 40, 262); c.quadraticCurveTo(vx, 290, vx + 40, 262); c.lineTo(vx + 34, 256); c.lineTo(vx - 34, 256); c.fill();
    // banners
    for (const x of [460, 820]) { c.fillStyle = '#2a0e14'; c.fillRect(x - 18, 60, 36, 180); c.fillStyle = '#d8a840'; c.font = G.font(22, true); c.textAlign = 'center'; c.textBaseline = 'middle'; [...(x < 640 ? '長明不滅' : '萬燈歸一')].forEach((ch, k) => c.fillText(ch, x, 88 + k * 40)); }
    // polished floor with reflections
    c.fillStyle = lg(c, 0, 400, 0, H, [[0, '#0a1222'], [1, '#02040a']]); c.fillRect(0, 400, W, 320);
    pavers(c, 402, H, 9, { gap: '#000000', light: '#6aa0ff', dark: '#000000', var: 0.06, hi: 0.08, seed: 3, w0: 80, w1: 260, pow: 1.5 });
    c.save(); c.globalCompositeOperation = 'lighter';
    softBlob(c, vx, 470, 60, 160, '#5aa0ff', 0.3);
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) { const f = 1 / (1 + i * 0.45); softBlob(c, vx + s * 560 * f, 400 + 260 * f * 0.4 + 40 * f, 20 * f, 80 * f, '#5a2030', 0.25); }
    c.restore();
    vignette(c, 0.75, '#000000', 0.35);
    grain(c, rnd, 5000, 0.035);
  }, (ctx, t) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < PAL_JARS.length; i++) {
      const [x, y, s] = PAL_JARS[i];
      const p = 0.55 + 0.45 * Math.sin(t * (0.8 + U.hash(i, 1, 5)) + i * 1.3);
      lglow(ctx, x, y - 12 * s, 7 * s, '#d8f0ff', 0.8 * p, true);
      if (s > 0.62) lglow(ctx, x, y - 12 * s, 30 * s, '#4a9aff', 0.35 * p);
    }
    const f = flick(t, 1, 0.5);
    lglow(ctx, 640, 240, 140, '#4a9aff', 0.45 * f);
    lglow(ctx, 640, 244, 34, '#e8f6ff', 0.95 * f, true);
    // the flame itself
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#dff2ff';
    ctx.beginPath(); ctx.moveTo(640, 216 - Math.sin(t * 6) * 4); ctx.quadraticCurveTo(652, 240, 640, 256); ctx.quadraticCurveTo(628, 240, 640, 216 - Math.sin(t * 6) * 4); ctx.fill();
    ctx.restore();
    motes(ctx, t, { n: 30, seed: 41, x: 0, y: 80, w: W, h: 560, vx: 0, vy: -10, r: 5, col: '#7ab8ff', a: 0.55, tw: 2, wob: 20 });
    mist(ctx, t, 'pal', '#3a6ab0', 480, 160, 0.3, 6, 36, 41);
  });

  // ---------- 林投林: pandanus forest by the sea (eerie twilight) ----------
  def('linto', (c, rnd) => {
    vfill(c, 0, 330, [[0, '#0a0c1e'], [0.5, '#24284a'], [0.85, '#5a4a6a'], [1, '#8a6a7a']]);
    stars(c, 70, rnd, 200, { a: 0.5 });
    moon(c, 760, 250, 34, { col: '#f0e0d0', haloCol: '#a07aa0', haloA: 0.4 });
    cloud(c, 500, 200, 500, 24, { top: '#4a3a5a', bot: '#1a1a30', a: 0.7, seed: 4 });
    water(c, 330, 420, { stops: [[0, '#5a4a6a'], [0.2, '#2a2a4a'], [1, '#14142a']], light: '#d0b0d0', seed: 3, streaks: 160, path: { x: 760, col: '#ffe8d8', a: 0.6, w0: 6, w1: 90, n: 90 } });
    // sand
    const sp = profile({ y: 430, amp: 20, freq: 0.004, seed: 4, oct: 3 });
    layer(c, (x) => { pathProfile(x, sp); x.fillStyle = lg(x, 0, 410, 0, H, [[0, '#5a5060'], [0.3, '#4a4050'], [1, '#1e1a24']]); x.fill(); }, (x) => {
      const r = U.seeded(8);
      for (let i = 0; i < 100; i++) softBlob(x, r() * W, 420 + Math.pow(r(), 2) * 300, 40 + r() * 140, 5 + r() * 14, r() < 0.5 ? '#a090b0' : '#000000', 0.08);
      speckle(x, r, 420, H, 1200, ['#2a2430', '#8a809a'], 0.4);
      for (let k = 0; k < 6; k++) { x.strokeStyle = rgba('#b0a0c0', 0.12); x.lineWidth = 1; x.beginPath(); for (let px = 0; px <= W; px += 20) { const yy = 450 + k * 40 + k * k * 6 + Math.sin(px * 0.01 + k) * 6; px ? x.lineTo(px, yy) : x.moveTo(px, yy); } x.stroke(); }
    });
    // pandanus groves: back (silhouette) and framing front
    for (let i = 0; i < 9; i++) pandanus(c, rnd() * W, 425 + rnd() * 10, 120 + rnd() * 60, '#1e2230', rnd);
    vfill(c, 300, 440, [[0, rgba('#8a7aa0', 0)], [1, rgba('#8a7aa0', 0.18)]]);
    for (const [x, h] of [[60, 420], [200, 300], [1130, 380], [1250, 460]]) pandanus(c, x, 730, h, '#0e1418', rnd);
    // pandanus fruits on the sand
    for (const [x, y] of [[300, 650], [980, 680], [1080, 640]]) { c.fillStyle = rg(c, x, y, 18, [[0, '#e0a050'], [1, '#6a3a1a']], 0, x - 5, y - 6); ellipse(c, x, y, 18, 14); c.fill(); }
    vignette(c, 0.65, '#04040a', 0.4);
    grade(c, '#6a3a7a', 0.2, 'soft-light');
    grain(c, rnd, 4000, 0.035);
  }, (ctx, t) => {
    waveGlints(ctx, t, { n: 60, seed: 9, y0: 332, y1: 415, cx: 760, w0: 20, w1: 200, col: '#ffe8d8', a: 0.8, len: 10 });
    ctx.save();
    for (let k = 0; k < 3; k++) {
      const ph = mod(t * 0.2 + k / 3, 1), y = 420 - ph * 14, a = Math.sin(ph * Math.PI) * 0.3;
      ctx.strokeStyle = rgba('#e0d0f0', a); ctx.lineWidth = 1.4; ctx.beginPath();
      for (let x = 0; x <= W; x += 24) { const yy = y + Math.sin(x * 0.015 + t * 0.7 + k * 2) * 3; x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
      ctx.stroke();
    }
    ctx.restore();
    motes(ctx, t, { n: 14, seed: 51, x: 0, y: 250, w: W, h: 360, vx: -6, vy: -4, r: 10, col: '#c08aff', a: 0.4, tw: 1.5, wob: 40, wobY: 20 });
    mist(ctx, t, 'linto', '#8a7aa8', 380, 150, 0.4, -8, 36, 51);
  });

  // ---------- 布農 slate-house homestead, high mountains at night ----------
  def('tribe', (c, rnd) => {
    vfill(c, 0, 400, [[0, '#03050e'], [0.6, '#0c1430'], [1, '#1c2440']]);
    milkyWay(c, rnd, 200, 0, 1100, 330, 150, '#a8b8ff', 0.1);
    stars(c, 300, rnd, 330, { a: 0.9 });
    mountain(c, { y: 300, amp: 140, freq: 0.0035, seed: 5, ridged: true, col: '#141c34', col2: '#1c2440', bottom: 400, shade: 0.5, light: '#6a7ab0', dark: '#02040a', rim: '#8a9ad0', rimA: 0.25, haze: '#2a3458', hazeA: 0.5 });
    mountain(c, { y: 360, amp: 100, freq: 0.005, seed: 8, col: '#0a0e1a', col2: '#0e1220', bottom: 420, trees: { kind: 'pine', size: 8, gap: 8, seed: 2 } });
    // slate house: stacked slate walls, slate roof
    const hx = 380, hy = 400, hw = 330, hh = 90;
    c.fillStyle = '#2a2a30'; c.fillRect(hx - hw / 2, hy - hh, hw, hh);
    const r = U.seeded(9);
    for (let y = hy - hh; y < hy; y += 7) for (let x = hx - hw / 2 + (r() * 10); x < hx + hw / 2; x += 22 + r() * 20) {
      c.fillStyle = rgba(r() < 0.5 ? '#5a5a66' : '#1a1a20', 0.6); c.fillRect(x, y, 20 + r() * 16, 5);
    }
    c.fillStyle = '#ffb060'; c.fillRect(hx - 30, hy - 60, 46, 60);
    glow(c, hx - 7, hy - 30, 120, '#ff9a40', 0.35);
    c.fillStyle = '#16161c'; c.beginPath(); c.moveTo(hx - hw / 2 - 30, hy - hh + 4); c.lineTo(hx - hw / 2 + 30, hy - hh - 46); c.lineTo(hx + hw / 2 - 30, hy - hh - 46); c.lineTo(hx + hw / 2 + 30, hy - hh + 4); c.closePath(); c.fill();
    for (let k = 0; k < 6; k++) { c.strokeStyle = rgba('#7a7a90', 0.3); c.lineWidth = 1; c.beginPath(); const yy = hy - hh - 46 + k * 9; c.moveTo(hx - hw / 2 + 30 - k * 10, yy); c.lineTo(hx + hw / 2 - 30 + k * 10, yy); c.stroke(); }
    c.strokeStyle = rgba('#ffd090', 0.25); c.lineWidth = 2; c.beginPath(); c.moveTo(hx - hw / 2 - 30, hy - hh + 4); c.lineTo(hx + hw / 2 + 30, hy - hh + 4); c.stroke();
    // raised millet granary
    const gx = 900, gy = 400;
    c.fillStyle = '#3a2a20'; for (const k of [-36, -12, 12, 36]) c.fillRect(gx + k - 3, gy - 50, 6, 50);
    c.fillStyle = '#4a4a54'; for (const k of [-36, -12, 12, 36]) { ellipse(c, gx + k, gy - 52, 9, 4); c.fill(); }
    c.fillStyle = '#4a3424'; c.fillRect(gx - 50, gy - 110, 100, 56);
    for (let y = gy - 108; y < gy - 54; y += 8) { c.fillStyle = rgba('#000', 0.3); c.fillRect(gx - 50, y, 100, 1.5); }
    c.fillStyle = '#2a2420'; c.beginPath(); c.moveTo(gx - 66, gy - 104); c.lineTo(gx, gy - 150); c.lineTo(gx + 66, gy - 104); c.fill();
    glow(c, gx, gy - 70, 60, '#ff9a40', 0.12);
    // slate-slab plaza ground
    groundBase(c, 400, { stops: [[0, '#2e2e38'], [0.4, '#262630'], [1, '#101016']], seed: 4, light: '#ffb070', blots: 50, pool: { x: 640, y: 450, r: 420, col: '#ff9a40', a: 0.28, sy: 0.35 } });
    pavers(c, 402, H, 10, { gap: '#08080c', light: '#a8a0b0', dark: '#000000', var: 0.07, hi: 0.05, seed: 11, w0: 40, w1: 150, pow: 1.5, gapA: 0.6 });
    // hearth fire ring at back centre
    c.fillStyle = '#3a3a40'; for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; ellipse(c, 640 + Math.cos(a) * 34, 410 + Math.sin(a) * 9, 10, 6); c.fill(); }
    c.fillStyle = '#1a0c06'; ellipse(c, 640, 410, 26, 7); c.fill();
    c.strokeStyle = '#2a1a10'; c.lineWidth = 5; c.beginPath(); c.moveTo(620, 412); c.lineTo(660, 400); c.moveTo(660, 412); c.lineTo(622, 402); c.stroke();
    // firewood stack & millet bundles
    c.fillStyle = '#4a3020'; for (let k = 0; k < 6; k++) { circle(c, 1060 + (k % 3) * 18, 392 - Math.floor(k / 3) * 16, 8); c.fill(); }
    c.fillStyle = '#c8a050'; for (let k = 0; k < 5; k++) { ellipse(c, gx - 40 + k * 20, gy - 60, 6, 10); c.fill(); }
    vignette(c, 0.65, '#000000', 0.38);
    grain(c, rnd, 4500, 0.035);
  }, (ctx, t) => {
    const f = flick(t, 2, 0.7);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    lglow(ctx, 640, 395, 260 * (0.9 + f * 0.1), '#ff7a2a', 0.3 * f);
    lglow(ctx, 640, 398, 60, '#ffc060', 0.7 * f);
    // flames
    for (let k = 0; k < 6; k++) {
      const ph = mod(t * 1.6 + k / 6, 1), x = 640 + Math.sin(k * 2.1 + t * 3) * 10 * (1 - ph), y = 402 - ph * 46;
      lglow(ctx, x, y, 16 * (1 - ph) + 4, k % 2 ? '#ffd070' : '#ff7030', 0.8 * (1 - ph), true);
    }
    ctx.restore();
    motes(ctx, t, { n: 20, seed: 61, x: 560, y: 120, w: 160, h: 270, vx: 4, vy: -40, r: 3, col: '#ffa040', a: 0.8, tw: 6, wob: 20 });
    // star twinkle
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) { const a = Math.max(0, Math.sin(t * (1 + U.hash(i, 2, 6)) + i * 3)); lglow(ctx, U.hash(i, 1, 6) * W, U.hash(i, 3, 6) * 260, 6, '#ffffff', a * 0.7, true); }
    ctx.restore();
    // smoke
    for (let i = 0; i < 8; i++) { const ph = mod(t * 0.1 + i / 8, 1); lglow(ctx, 640 + ph * 60 + Math.sin(ph * 6 + i) * 10, 380 - ph * 260, 14 + ph * 40, '#8a8aa0', (1 - ph) * 0.12); }
  });

  // ---------- 靈境 vision: breathing jungle of living geometry, cloud serpent ----------
  const VIS_PAL = [
    { bg0: '#03101a', bg1: '#0a3a3c', bg2: '#1a6a5a', glow: '#3affc0', acc: '#ffcc33', acc2: '#c040ff', leaf: '#06362e', leafHi: '#2affa8', floor: '#0a2a2a' },
    { bg0: '#0a0620', bg1: '#22104e', bg2: '#5a2a9a', glow: '#c060ff', acc: '#ffb020', acc2: '#ff4ad8', leaf: '#1e0e46', leafHi: '#c890ff', floor: '#1a0a3a' },
  ];
  // geometric patterned leaf (tip at angle a from base x,y)
  function geoLeaf(c, x, y, len, wid, a, P, alpha = 1) {
    c.save(); c.translate(x, y); c.rotate(a); c.globalAlpha = alpha;
    const path = () => { c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(len * 0.25, -wid, len * 0.75, -wid * 0.8, len, 0); c.bezierCurveTo(len * 0.75, wid * 0.8, len * 0.25, wid, 0, 0); c.closePath(); };
    path(); c.fillStyle = lg(c, 0, -wid, len * 0.3, wid, [[0, U.mix(P.leaf, P.leafHi, 0.45)], [0.5, P.leaf], [1, U.shade(P.leaf, -0.5)]]); c.fill();
    c.save(); path(); c.clip();
    // diamond lattice (serpent-skin)
    c.strokeStyle = rgba(P.leafHi, 0.2); c.lineWidth = 1;
    const st = Math.max(8, wid * 0.4);
    // side veins
    for (let k = 0.12; k < 0.95; k += 0.1) { c.beginPath(); c.moveTo(len * k, 0); c.lineTo(len * (k + 0.12), -wid); c.moveTo(len * k, 0); c.lineTo(len * (k + 0.12), wid); c.strokeStyle = rgba(P.leafHi, 0.3); c.stroke(); }
    c.strokeStyle = rgba(P.leafHi, 0.16);
    for (let k = -len; k < len * 2; k += st) { c.beginPath(); c.moveTo(k, -wid); c.lineTo(k + wid * 2, wid); c.moveTo(k, wid); c.lineTo(k + wid * 2, -wid); c.stroke(); }
    for (let k = st * 1.5; k < len * 0.9; k += st * 2.5) { const d = st * 0.22; c.fillStyle = rgba(k % (st * 5) < st * 2.5 ? P.acc : P.acc2, 0.45); c.beginPath(); c.moveTo(k, -d); c.lineTo(k + d * 1.2, 0); c.lineTo(k, d); c.lineTo(k - d * 1.2, 0); c.closePath(); c.fill(); }
    c.restore();
    c.strokeStyle = rgba(P.leafHi, 0.42); c.lineWidth = Math.max(1, wid * 0.035);
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.5, -wid * 0.08, len, 0); c.stroke();
    path(); c.strokeStyle = rgba(P.leafHi, 0.5); c.lineWidth = 1.2; c.stroke();
    c.restore();
  }
  function mandalaSpr(key, R, cols) {
    return spriteCached('mand:' + key, R * 2, R * 2, (x) => {
      x.translate(R, R); x.lineWidth = 1.4;
      for (let ring = 1; ring <= 6; ring++) {
        const r = R * ring / 6.4, n = 6 * ring;
        x.strokeStyle = rgba(cols[ring % cols.length], 0.7);
        circle(x, 0, 0, r); x.stroke();
        for (let k = 0; k < n; k++) { const a = k / n * TAU; circle(x, Math.cos(a) * r, Math.sin(a) * r, r / ring * 0.5); x.stroke(); }
        x.strokeStyle = rgba(cols[(ring + 1) % cols.length], 0.6);
        x.beginPath();
        const m = ring + 4;
        for (let k = 0; k <= m * 2; k++) { const a = k / m * Math.PI * (m % 2 ? 2 : 1) * 2 / 2 * 2 / 2, rr = k % 2 ? r * 0.75 : r; const aa = k / (m * 2) * TAU; x.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
        x.stroke();
        for (let k = 0; k < n; k++) { const a = (k + 0.5) / n * TAU; x.fillStyle = rgba(cols[k % cols.length], 0.9); circle(x, Math.cos(a) * r, Math.sin(a) * r, 1.8); x.fill(); }
      }
    }, 1);
  }
  function visionLayer(c, P, rnd, front) {
    if (!front) {
      vfill(c, 0, H, [[0, P.bg0], [0.35, P.bg1], [0.55, P.bg2], [0.62, P.bg1], [1, P.bg0]]);
      // sunburst slices radiating from the portal
      c.save(); c.translate(640, 250);
      for (let k = 0; k < 36; k++) { c.fillStyle = rgba(k % 2 ? P.glow : P.acc2, 0.05); c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 1200, k / 36 * TAU, (k + 0.5) / 36 * TAU); c.closePath(); c.fill(); }
      c.restore();
      glow(c, 640, 250, 420, P.glow, 0.35);
      // far jungle: patterned trunks, drooping canopy and broad understorey leaves in luminous haze
      const r = U.seeded(7);
      for (let li = 0; li < 3; li++) {
        const alpha = 0.5 + li * 0.25;
        for (let i = 0; i < 5; i++) {
          const x = r() * W, tw = 18 + li * 14 + r() * 10;
          c.save(); c.globalAlpha = alpha;
          c.fillStyle = lg(c, x - tw, 0, x + tw, 0, [[0, U.mix(P.leaf, P.leafHi, 0.25)], [1, U.shade(P.leaf, -0.5)]]);
          c.beginPath(); c.moveTo(x - tw * 1.8, 430); c.quadraticCurveTo(x - tw * 0.6, 380, x - tw * 0.5, -10); c.lineTo(x + tw * 0.5, -10); c.quadraticCurveTo(x + tw * 0.6, 380, x + tw * 1.8, 430); c.closePath(); c.fill();
          c.strokeStyle = rgba(P.leafHi, 0.25); c.lineWidth = 1;
          for (let y = 0; y < 430; y += tw * 0.8) { c.beginPath(); c.moveTo(x - tw * 0.5, y); c.lineTo(x, y + tw * 0.4); c.lineTo(x + tw * 0.5, y); c.stroke(); }
          c.restore();
        }
        for (let i = 0; i < 6; i++) { // canopy hanging from above
          const x = r() * W, n = 3 + Math.floor(r() * 3);
          for (let k = 0; k < n; k++) { const len = 110 + li * 50 + r() * 60; geoLeaf(c, x, -20 + r() * 40, len, len * 0.3, Math.PI / 2 + (k / (n - 1) - 0.5) * 2.0, P, alpha); }
        }
        for (let i = 0; i < 8; i++) { // broad understorey
          const x = r() * W, y = 425 - r() * 20, n = 3 + Math.floor(r() * 3);
          for (let k = 0; k < n; k++) { const len = 70 + li * 40 + r() * 50; geoLeaf(c, x, y, len, len * 0.34, -Math.PI / 2 + (k / (n - 1) - 0.5) * 2.6, P, alpha); }
        }
        vfill(c, 0, 440, [[0, rgba(P.bg2, 0.06)], [0.6, rgba(P.bg2, 0.2 - li * 0.05)], [1, rgba(P.bg2, 0.35 - li * 0.08)]]);
      }
      // patterned floor: perspective diamond tiles (serpent skin)
      c.fillStyle = lg(c, 0, 410, 0, H, [[0, U.mix(P.floor, P.bg2, 0.5)], [1, U.shade(P.floor, -0.5)]]); c.fillRect(0, 410, W, H - 410);
      const vx = 640, vy = 250;
      for (let i = 0; i < 12; i++) {
        const fa = Math.pow(i / 12, 1.8), fb = Math.pow((i + 1) / 12, 1.8);
        const ya = 410 + fa * 310, yb = 410 + fb * 310, ym = (ya + yb) / 2;
        const sc = (ym - vy) / (H - vy);
        const tw = 130 * sc;
        for (let k = -12; k <= 12; k++) {
          const xm = vx + (k + (i % 2) * 0.5) * tw;
          c.fillStyle = lg(c, xm, ya, xm, yb, [[0, rgba(k % 2 ? P.acc2 : P.glow, 0.22)], [1, rgba(P.floor, 0.1)]]);
          c.beginPath(); c.moveTo(xm, ya); c.lineTo(xm + tw / 2, ym); c.lineTo(xm, yb); c.lineTo(xm - tw / 2, ym); c.closePath(); c.fill();
          c.strokeStyle = rgba(P.leafHi, 0.35); c.lineWidth = 1; c.stroke();
          if ((k + i) % 3 === 0) { c.fillStyle = rgba(P.acc, 0.5); circle(c, xm, ym, 1.5 + sc * 2.5); c.fill(); }
        }
      }
      c.fillStyle = lg(c, 0, 400, 0, 470, [[0, rgba(P.bg2, 0.8)], [1, rgba(P.bg2, 0)]]); c.fillRect(0, 400, W, 70);
      grain(c, rnd, 3000, 0.03);
    } else {
      // framing foreground fronds (left, right, top corners)
      const r = U.seeded(17);
      for (const [x, y, base, spread, n, len] of [[-20, 760, -1.0, 1.4, 6, 420], [W + 20, 760, -2.14, 1.4, 6, 420], [-40, -40, 0.7, 1.0, 5, 360], [W + 40, -40, 2.44, 1.0, 5, 360]]) {
        for (let k = 0; k < n; k++) { const L = len * (0.7 + r() * 0.5); geoLeaf(c, x, y, L, L * 0.3, base + (k / (n - 1) - 0.5) * spread, P, 1); }
      }
      // hanging diamond-pattern vines
      for (const vx of [200, 330, 960, 1100]) {
        c.strokeStyle = rgba(P.leaf, 1); c.lineWidth = 6;
        const L = 120 + r() * 140;
        c.beginPath(); c.moveTo(vx, 0); c.quadraticCurveTo(vx + 30, L / 2, vx - 10, L); c.stroke();
        for (let k = 1; k < 8; k++) { const f = k / 8, px = U.lerp(vx, vx - 10, f) + Math.sin(f * Math.PI) * 15, py = L * f; c.fillStyle = rgba(k % 2 ? P.acc : P.acc2, 0.85); c.beginPath(); c.moveTo(px, py - 5); c.lineTo(px + 4, py); c.lineTo(px, py + 5); c.lineTo(px - 4, py); c.fill(); }
      }
      vignette(c, 0.5, P.bg0, 0.45);
    }
  }
  function visFront(i) { return fullLayer('visF' + i, (x) => visionLayer(x, VIS_PAL[i], U.seeded(5), true)); }
  function visBack(i) { return fullLayer('visB' + i, (x) => visionLayer(x, VIS_PAL[i], U.seeded(5), false)); }
  function serpent(ctx, t) {
    const N = 64, pts = [];
    const U0 = t * 0.11;
    for (let i = 0; i < N; i++) {
      const u = U0 - i * 0.022;
      pts.push([640 + 560 * Math.sin(u * 2.1), 190 + 100 * Math.sin(u * 3.3 + 1) + 20 * Math.sin(u * 9 + i * 0.1)]);
    }
    const left = [], right = [];
    for (let i = 0; i < N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const s = i / (N - 1), w = 40 * (s < 0.08 ? 0.75 + s * 3 : Math.pow(1 - s, 0.7)) + 1.5;
      left.push([pts[i][0] - dy * w, pts[i][1] + dx * w]); right.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
      pts[i].push(dx, dy, w);
    }
    const hue = t * 25;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < N; i += 8) lglow(ctx, pts[i][0], pts[i][1], pts[i][4] * 2.2, qHue(hue + i * 4), 0.24);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = lg(ctx, 0, 60, 0, 330, [[0, '#0e3a44'], [0.5, '#06202a'], [1, '#12304a']]);
    ctx.beginPath(); ctx.moveTo(left[0][0], left[0][1]);
    for (const p of left) ctx.lineTo(p[0], p[1]);
    for (let i = N - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = qHue(hue + 120); ctx.lineWidth = 2; ctx.globalAlpha = 0.85; ctx.stroke();
    ctx.globalAlpha = 0.5; ctx.strokeStyle = qHue(hue + 200); ctx.lineWidth = 1.2;
    for (const side of [left, right]) { ctx.beginPath(); for (let i = 0; i < N; i++) { const p = side[i], q = pts[i]; const x = U.lerp(q[0], p[0], 0.6), y = U.lerp(q[1], p[1], 0.6); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
    // diamond scales
    for (let i = 3; i < N - 2; i += 2) {
      const [x, y, dx, dy, w] = pts[i];
      const col = i % 4 === 1 ? qHue(hue + i * 6) : qHue(hue + 180 + i * 6);
      ctx.globalAlpha = 0.95; ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(x + dx * w * 0.7, y + dy * w * 0.7); ctx.lineTo(x - dy * w * 0.55, y + dx * w * 0.55); ctx.lineTo(x - dx * w * 0.7, y - dy * w * 0.7); ctx.lineTo(x + dy * w * 0.55, y - dx * w * 0.55); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; circle(ctx, x, y, w * 0.12); ctx.fill();
    }
    // head
    const [hx, hy, hdx, hdy, hw] = pts[0];
    ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(8,30,40,0.95)';
    ctx.beginPath(); ctx.moveTo(hx + hdx * 34, hy + hdy * 34); ctx.lineTo(hx - hdy * hw * 1.4, hy + hdx * hw * 1.4); ctx.lineTo(hx - hdx * 8, hy - hdy * 8); ctx.lineTo(hx + hdy * hw * 1.4, hy - hdx * hw * 1.4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = qHue(hue + 60); ctx.lineWidth = 2; ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of [-1, 1]) lglow(ctx, hx + hdx * 10 - hdy * s * hw * 0.6, hy + hdy * 10 + hdx * s * hw * 0.6, 9, '#fff2a0', 0.95, true);
    ctx.restore();
  }
  def('vision', (c) => { c.drawImage(visBack(0), 0, 0, W, H); visBack(1); visFront(0); visFront(1); mandalaSpr('v1', 260, ['#ffe08a', '#3affc0', '#ff6af0']); }, (ctx, t) => {
    const sw = Math.sin(t * 0.3), mix = 0.5 + 0.5 * Math.sign(sw) * Math.pow(Math.abs(sw), 0.6); // hues drift: emerald <-> violet
    ctx.save(); ctx.globalAlpha = mix; ctx.drawImage(visBack(1), 0, 0, W, H); ctx.restore();
    // living geometry: counter-rotating mandalas over the portal
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const m1 = mandalaSpr('v1', 260, ['#ffe08a', '#3affc0', '#ff6af0']);
    for (const [k, sc, sp, a] of [[0, 0.86 + Math.sin(t * 0.9) * 0.08, 0.08, 0.4], [1, 0.5 + Math.sin(t * 1.3 + 1) * 0.05, -0.14, 0.5]]) {
      ctx.save(); ctx.translate(640, 250); ctx.rotate(t * sp + k); ctx.scale(sc, sc);
      ctx.globalAlpha = a * (0.7 + 0.3 * Math.sin(t * 0.7 + k));
      ctx.drawImage(m1, -260, -260, 520, 520); ctx.restore();
    }
    lglow(ctx, 640, 250, 120 + Math.sin(t * 0.9) * 20, qHue(t * 30), 0.35);
    ctx.restore();
    serpent(ctx, t);
    // foreground fronds with the same hue drift; the whole grove breathes light
    ctx.save();
    ctx.drawImage(visFront(0), 0, 0, W, H);
    ctx.globalAlpha = mix; ctx.drawImage(visFront(1), 0, 0, W, H);
    ctx.restore();
    motes(ctx, t, { n: 36, seed: 71, x: 0, y: 60, w: W, h: 620, vx: 3, vy: -12, r: 6, cols: ['#3affc0', '#ffcc33', '#ff6af0', '#33e0ff'], col: '#3affc0', a: 0.6, tw: 2, wob: 30 });
  });

  // ---------- 一息界 breath: kaleidoscopic hyperspace of fractal jewel geometry ----------
  const BR_PALS = [
    ['#ff3ad0', '#3ae8ff', '#ffd23a', '#7a3aff', '#3aff9a'],
    ['#ff8a2a', '#2a8aff', '#ff2a6a', '#2affd8', '#e8ff3a'],
    ['#b03aff', '#ffe23a', '#3affd0', '#ff3a7a', '#3a7aff'],
  ];
  const BR_R = 760, BR_TH = Math.PI / 6;
  let brBuf = null;
  function brWedge(pi) {
    const pal = BR_PALS[pi];
    return spriteCached('brw' + pi, BR_R, Math.ceil(BR_R * Math.tan(BR_TH)) + 2, (x) => {
      const r = U.seeded(101 + pi);
      x.save();
      x.beginPath(); x.moveTo(0, 0); x.lineTo(BR_R, 0); x.lineTo(BR_R, BR_R * Math.tan(BR_TH) + 2); x.closePath(); x.clip();
      // banded background along the radius
      const g = x.createRadialGradient(0, 0, 0, 0, 0, BR_R);
      for (let k = 0; k <= 12; k++) g.addColorStop(k / 12, k % 2 ? U.shade(pal[k % pal.length], -0.75) : U.shade(pal[(k + 2) % pal.length], -0.55));
      x.fillStyle = g; x.fillRect(0, 0, BR_R, BR_R);
      // rows of jewels at geometric radii
      let rr = 14, row = 0;
      while (rr < BR_R) {
        const next = rr * 1.32 + 6, band = next - rr, rm = (rr + next) / 2;
        const m = Math.max(1, Math.round(rm * BR_TH / (band * 0.9)));
        const shape = row % 5, col = pal[row % pal.length], col2 = pal[(row + 2) % pal.length];
        // filigree ring
        x.strokeStyle = rgba('#ffe6a0', 0.6); x.lineWidth = 1 + band * 0.02; x.beginPath(); x.arc(0, 0, rr, 0, BR_TH + 0.02); x.stroke();
        for (let j = 0; j <= m; j++) {
          const a = BR_TH * j / m, px = Math.cos(a) * rm, py = Math.sin(a) * rm, s = band * 0.42;
          x.save(); x.translate(px, py); x.rotate(a);
          const jg = x.createRadialGradient(-s * 0.3, -s * 0.3, 0, 0, 0, s * 1.1);
          jg.addColorStop(0, '#ffffff'); jg.addColorStop(0.25, U.shade(col, 0.35)); jg.addColorStop(0.7, col); jg.addColorStop(1, U.shade(col, -0.6));
          x.fillStyle = jg; x.strokeStyle = '#ffe08a'; x.lineWidth = Math.max(0.8, s * 0.07);
          x.beginPath();
          if (shape === 0) { x.moveTo(s, 0); x.lineTo(0, s * 0.6); x.lineTo(-s, 0); x.lineTo(0, -s * 0.6); }
          else if (shape === 1) { x.moveTo(-s, 0); x.quadraticCurveTo(0, -s * 0.9, s, 0); x.quadraticCurveTo(0, s * 0.9, -s, 0); }
          else if (shape === 2) { for (let k = 0; k < 6; k++) { const aa = k / 6 * TAU; x.lineTo(Math.cos(aa) * s * 0.8, Math.sin(aa) * s * 0.8); } }
          else if (shape === 3) { x.moveTo(s, 0); x.lineTo(-s * 0.6, s * 0.7); x.lineTo(-s * 0.6, -s * 0.7); }
          else { x.arc(0, 0, s * 0.6, 0, TAU); }
          x.closePath(); x.fill(); x.stroke();
          if (shape === 1) { x.fillStyle = U.shade(col2, -0.3); circle(x, 0, 0, s * 0.3); x.fill(); x.fillStyle = '#fff'; circle(x, -s * 0.08, -s * 0.08, s * 0.08); x.fill(); }
          else { x.fillStyle = rgba(col2, 0.85); circle(x, 0, 0, s * 0.18); x.fill(); }
          x.restore();
          // tiny satellite gems between
          if (j < m) { const a2 = BR_TH * (j + 0.5) / m; x.fillStyle = rgba(col2, 0.9); circle(x, Math.cos(a2) * rr, Math.sin(a2) * rr, band * 0.08); x.fill(); }
        }
        // radial filigree spokes
        x.strokeStyle = rgba(col2, 0.35); x.lineWidth = 1;
        for (let j = 0; j <= m * 2; j++) { const a = BR_TH * j / (m * 2); x.beginPath(); x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); x.lineTo(Math.cos(a) * next, Math.sin(a) * next); x.stroke(); }
        rr = next; row++;
      }
      x.restore();
    }, 1);
  }
  function brTex(pi) {
    return spriteCached('brt' + pi, BR_R * 2, BR_R * 2, (x) => {
      const w = brWedge(pi);
      x.translate(BR_R, BR_R);
      for (let k = 0; k < 6; k++) {
        x.save(); x.rotate(k * 2 * BR_TH); x.drawImage(w, 0, 0, w.lw, w.lh);
        x.scale(1, -1); x.drawImage(w, 0, 0, w.lw, w.lh); x.restore();
      }
      // soft round edge for zoom layering
      x.globalCompositeOperation = 'destination-in';
      x.fillStyle = rg(x, 0, 0, BR_R, [[0, '#000'], [0.82, '#000'], [1, 'rgba(0,0,0,0)']]);
      x.fillRect(-BR_R, -BR_R, BR_R * 2, BR_R * 2);
    }, 1);
  }
  function brFloor() {
    return fullLayer('brFloor', (c) => {
      // translucent crystal floor that anchors the fighters
      c.fillStyle = lg(c, 0, 410, 0, H, [[0, 'rgba(20,6,40,0)'], [0.25, 'rgba(20,6,40,0.45)'], [1, 'rgba(10,2,20,0.75)']]); c.fillRect(0, 410, W, H - 410);
      const vx = 640, vy = 300;
      c.strokeStyle = 'rgba(255,230,160,0.25)'; c.lineWidth = 1;
      for (let k = -16; k <= 16; k++) { c.beginPath(); c.moveTo(vx + k * 8, 420); c.lineTo(vx + k * 140, H); c.stroke(); }
      for (let i = 1; i < 10; i++) { const y = 420 + Math.pow(i / 10, 1.8) * 300; c.fillStyle = 'rgba(160,220,255,0.18)'; c.fillRect(0, y, W, 1 + i * 0.15); }
      c.fillStyle = lg(c, 0, 405, 0, 435, [[0, 'rgba(255,240,200,0)'], [0.5, 'rgba(255,240,200,0.35)'], [1, 'rgba(255,240,200,0)']]); c.fillRect(0, 405, W, 30);
    });
  }
  def('breath', (c, rnd) => {
    vfill(c, 0, H, [[0, '#0a0218'], [0.5, '#1a0630'], [1, '#05010c']]);
    const tx = brTex(0); brTex(1); brTex(2); brFloor();
    c.save(); c.translate(W / 2, H / 2); c.drawImage(tx, -BR_R * 1.15, -BR_R * 1.15, BR_R * 2.3, BR_R * 2.3); c.restore();
  }, (ctx, t) => {
    // infinite zoom: self-similar layers grow from the centre and dissolve
    const cx = W / 2, cy = H / 2 - 20;
    const layers = 3;
    const items = [];
    for (let k = 0; k < layers; k++) items.push([k, mod(t * 0.055 + k / layers, 1)]);
    items.sort((a, b) => b[1] - a[1]);
    // big (magnified) layers go through a half-res buffer: same look, a quarter of the fill cost
    if (!brBuf) brBuf = U.makeCanvas(W / 2, H / 2, 1);
    const bx = brBuf.getContext('2d');
    bx.setTransform(1, 0, 0, 1, 0, 0); bx.clearRect(0, 0, W / 2, H / 2);
    let pending = false;
    for (const [k, ph] of items) {
      const s = 0.22 * Math.pow(9, ph);
      const a = Math.min(1, ph / 0.18) * (1 - Math.max(0, (ph - 0.72) / 0.28));
      if (a <= 0.01) continue;
      const tx = brTex(k % 3), rot = t * 0.07 * (k % 2 ? 1 : -1) + k * 0.5;
      const big = s > 0.36, g = big ? bx : ctx;
      if (!big && pending) { ctx.drawImage(brBuf, 0, 0, W, H); pending = false; }
      g.save(); if (big) g.setTransform(0.5, 0, 0, 0.5, 0, 0);
      g.translate(cx, cy); if (!big) g.rotate(rot); else if (k % 2) g.scale(-1, 1); g.globalAlpha = a;
      g.drawImage(tx, -BR_R * s, -BR_R * s, BR_R * 2 * s, BR_R * 2 * s);
      g.restore();
      if (big) pending = true;
    }
    if (pending) ctx.drawImage(brBuf, 0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // pulsing core
    const p = 0.5 + 0.5 * Math.sin(t * 1.4);
    lglow(ctx, cx, cy, 150 + p * 40, qHue(t * 40), 0.4 + p * 0.2);
    lglow(ctx, cx, cy, 50 + p * 20, '#ffffff', 0.8, true);
    // rotating golden star-polygons
    ctx.strokeStyle = '#ffe6a0'; ctx.lineWidth = 1.6;
    for (let k = 0; k < 3; k++) {
      const n = [6, 12, 8][k], R = 120 + k * 110 + Math.sin(t * 0.8 + k) * 14, step = [2, 5, 3][k];
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t + k);
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const a = (i * step) / n * TAU + t * 0.1 * (k % 2 ? -1 : 1); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
      ctx.stroke();
    }
    // 萬象童子: playful orbiting jewel-beings
    for (let i = 0; i < 6; i++) {
      const a = t * (0.3 + i * 0.05) + i * TAU / 6, R = 260 + Math.sin(t * 0.7 + i * 2) * 60;
      const x = cx + Math.cos(a) * R * 1.4, y = cy + Math.sin(a) * R * 0.6 + Math.sin(t * 3 + i) * 10;
      const col = qHue(t * 50 + i * 60);
      lglow(ctx, x, y, 34, col, 0.55);
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); for (let q = 0; q <= 5; q++) { const aa = q / 5 * TAU * 2 + t * 2 + i; ctx.lineTo(x + Math.cos(aa) * 10, y + Math.sin(aa) * 10); } ctx.stroke();
      lglow(ctx, x, y, 6, '#ffffff', 1, true);
    }
    ctx.restore();
    motes(ctx, t, { n: 40, seed: 81, x: 0, y: 0, w: W, h: H, vx: 0, vy: -6, r: 5, cols: ['#ffe08a', '#3ae8ff', '#ff3ad0', '#ffffff'], col: '#ffffff', a: 0.7, tw: 4, wob: 20 });
    ctx.drawImage(brFloor(), 0, 0, W, H);
  });

  // ---------- 日月潭: night mist (lake) / dawn (sunmoon) ----------
  function lakeScene(c, rnd, dawn) {
    const wl = 352;
    if (dawn) {
      vfill(c, 0, wl, [[0, '#3a4a8a'], [0.35, '#9a7aa8'], [0.7, '#f0a890'], [1, '#ffd8a0']]);
      sun(c, 760, 300, 30, '#fff4d8', '#ffb880', 0.6);
      cloud(c, 380, 150, 460, 34, { top: '#ffd0c0', bot: '#9a7a9a', hi: '#ffffff', a: 0.8, seed: 3, rim: '#ffe0b0', rimSide: 'right' });
      cloud(c, 1050, 110, 340, 28, { top: '#f8c8c0', bot: '#8a7090', a: 0.7, seed: 6 });
    } else {
      vfill(c, 0, wl, [[0, '#060c1e'], [0.5, '#1a2a48'], [1, '#4a6078']]);
      stars(c, 140, rnd, 240, { a: 0.7 });
      moon(c, 900, 110, 32, { col: '#f4f6ff', haloCol: '#8ab0e0', haloA: 0.45 });
    }
    // mountains rendered once, then mirrored into the still water
    const m = U.makeCanvas(W, H), mx = m.getContext('2d');
    const P = dawn
      ? [['#8a7aa0', '#c8a0a8', '#ffd0b0'], ['#5a5a80', '#9a8098', '#ffc0a0'], ['#2e3a50', '#4a4a60', '#e09a80']]
      : [['#2a3a58', '#3a4a68', '#8aa0c8'], ['#1a2840', '#24324a', '#6a88b8'], ['#0c1424', '#121c2c', '#4a6890']];
    mountain(mx, { y: wl - 50, amp: 150, freq: 0.003, oct: 4, seed: 31, col: P[0][0], col2: P[0][1], bottom: wl + 1, shade: 0, facetWin: 14, light: P[0][2], dark: '#000000', haze: dawn ? '#ffd8c0' : '#6a80a0', hazeA: 0.7, rim: P[0][2], rimA: 0.3 });
    mountain(mx, { y: wl - 4, amp: 80, freq: 0.004, oct: 3, seed: 37, shape: (x) => -Math.exp(-Math.pow((x - 150) / 220, 2)) * 90 - Math.exp(-Math.pow((x - 1150) / 200, 2)) * 100, col: P[1][0], col2: P[1][1], bottom: wl + 1, shade: 0.12, facetWin: 20, tex: 160, light: P[1][2], dark: '#000000', trees: { kind: 'round', size: 6, gap: 9, seed: 7 }, haze: dawn ? '#f0c0b0' : '#4a6080', hazeA: 0.6 });
    // Lalu island: small, distant, left undisturbed
    mx.fillStyle = P[2][0]; ellipse(mx, 610, wl, 34, 7); mx.fill();
    for (let k = 0; k < 6; k++) { circle(mx, 590 + k * 8, wl - 6 - Math.sin(k) * 3, 5 + (k % 3)); mx.fill(); }
    c.drawImage(m, 0, 0, W, H);
    // water: sky gradient + mirrored mountains
    vfill(c, wl, 470, dawn ? [[0, '#f8c8a0'], [0.4, '#b08aa0'], [1, '#4a4a6a']] : [[0, '#3a5070'], [0.4, '#1a2a44'], [1, '#0a1222']]);
    c.save(); c.beginPath(); c.rect(0, wl, W, 120); c.clip();
    c.translate(0, wl * 2); c.scale(1, -1); c.globalAlpha = 0.55; c.drawImage(m, 0, 0, W, H); c.restore();
    water(c, wl, 470, { stops: [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']], light: dawn ? '#fff0d8' : '#c0d8ff', dark: dawn ? '#6a4a6a' : '#000000', seed: 9, streaks: 200, streakA: 0.8,
      path: dawn ? { x: 760, col: '#fff0c8', a: 0.75, w0: 8, w1: 160, n: 140 } : { x: 900, col: '#e8f0ff', a: 0.55, w0: 6, w1: 120, n: 110 } });
    // lakeshore ground
    const gp = profile({ y: 470, amp: 24, freq: 0.005, seed: 41, oct: 3 });
    layer(c, (x) => { pathProfile(x, gp); x.fillStyle = lg(x, 0, 440, 0, H, dawn ? [[0, '#6a7a5a'], [0.3, '#4a5a44'], [1, '#232a20']] : [[0, '#2a3a3a'], [0.3, '#1e2a2c'], [1, '#0a1012']]); x.fill(); }, (x) => {
      const r = U.seeded(4);
      for (let i = 0; i < 90; i++) softBlob(x, r() * W, 460 + Math.pow(r(), 2) * 260, 40 + r() * 140, 6 + r() * 14, r() < 0.5 ? (dawn ? '#e0c890' : '#6a88a0') : '#000000', 0.08);
      speckle(x, r, 450, H, 1200, dawn ? ['#2a3020', '#c0b080', '#8a8a6a'] : ['#000000', '#5a7080'], 0.35);
      x.fillStyle = lg(x, 0, 448, 0, 480, [[0, rgba(dawn ? '#ffe0b0' : '#a0c0e0', 0.25)], [1, rgba('#ffffff', 0)]]); x.fillRect(0, 440, W, 40);
    });
    // reeds at the edges, a small moored boat
    const reedCol = dawn ? ['#3a4a2a', '#5a6a3a', '#7a7a4a'] : ['#0e1a1a', '#1a2a2a', '#2a3a3a'];
    for (const [x0, x1] of [[0, 260], [1000, W]]) {
      const rr = U.seeded(x0 + 3);
      for (let i = 0; i < 140; i++) {
        const x = x0 + rr() * (x1 - x0), y = 470 + rr() * 30, h = 50 + rr() * 110;
        c.strokeStyle = reedCol[i % 3]; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 4, y - h * 0.6, x + 10 + rr() * 10, y - h); c.stroke();
        if (rr() < 0.3) { c.fillStyle = reedCol[2]; ellipse(c, x + 12, y - h, 3, 9, 0.3); c.fill(); }
      }
    }
    c.fillStyle = dawn ? '#3a2a24' : '#0e0e14';
    c.beginPath(); c.moveTo(1040, 452); c.quadraticCurveTo(1100, 468, 1180, 452); c.lineTo(1170, 442); c.quadraticCurveTo(1100, 452, 1050, 442); c.closePath(); c.fill();
    vignette(c, dawn ? 0.35 : 0.6, dawn ? '#3a2030' : '#02040a', 0.45);
    if (dawn) grade(c, '#ffb080', 0.15, 'soft-light');
    grain(c, rnd, 3500, 0.03);
  }
  function lakeLive(ctx, t, dawn) {
    waveGlints(ctx, t, { n: 70, seed: 91, y0: 354, y1: 462, cx: dawn ? 760 : 900, w0: 16, w1: 260, col: dawn ? '#fff0d0' : '#e8f0ff', a: 0.8, len: 12 });
    mist(ctx, t, 'lake1' + dawn, dawn ? '#ffe0d0' : '#a8c0e0', 300, 110, dawn ? 0.6 : 0.55, 7, 40, 92);
    mist(ctx, t, 'lake2' + dawn, dawn ? '#fff0e0' : '#8aa8d0', 400, 120, 0.45, -5, 40, 93);
    if (!dawn) motes(ctx, t, { n: 18, seed: 94, x: 0, y: 380, w: W, h: 280, vx: 3, vy: -3, r: 5, col: '#c8ff9a', a: 0.55, tw: 3, wob: 30, wobY: 10 });
    else {
      ctx.save(); ctx.strokeStyle = '#3a2a3a'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const x = mod(t * (30 + i * 6) + i * 300, W + 200) - 100, y = 180 + i * 26 + Math.sin(t + i) * 10, f = Math.sin(t * 7 + i) * 4;
        ctx.beginPath(); ctx.moveTo(x - 9, y - f); ctx.quadraticCurveTo(x - 3, y - 2, x, y); ctx.quadraticCurveTo(x + 3, y - 2, x + 9, y - f); ctx.stroke();
      }
      ctx.restore();
    }
    // ripple rings
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const ph = mod(t * 0.3 + i / 4, 1), x = 200 + U.hash(i, Math.floor(t * 0.3 + i / 4), 9) * 880, y = 380 + U.hash(i, 1 + Math.floor(t * 0.3 + i / 4), 9) * 70;
      ctx.strokeStyle = rgba(dawn ? '#fff0e0' : '#c0d8ff', (1 - ph) * 0.35); ctx.lineWidth = 1;
      ellipse(ctx, x, y, 4 + ph * 40, 1 + ph * 6); ctx.stroke();
    }
    ctx.restore();
  }
  def('lake', (c, rnd) => lakeScene(c, rnd, false), (ctx, t) => lakeLive(ctx, t, false));
  def('sunmoon', (c, rnd) => lakeScene(c, rnd, true), (ctx, t) => lakeLive(ctx, t, true));

  // ---------- 燈母祠: drowned shrine interior ----------
  const SHRINE_LOTUS = [[300, 470, 0.8], [1000, 480, 0.9], [520, 640, 1.1], [860, 600, 1.0], [160, 600, 1.2], [1180, 650, 1.2], [640, 430, 0.6]];
  def('shrine', (c, rnd) => {
    vfill(c, 0, H, [[0, '#04121a'], [0.45, '#0c2a30'], [1, '#04101a']]);
    // back wall with murals
    c.fillStyle = lg(c, 0, 60, 0, 400, [[0, '#14282a'], [1, '#1e3a38']]); c.fillRect(120, 60, 1040, 350);
    for (let y = 70; y < 400; y += 22) for (let x = 120 + ((y / 22) % 2) * 30; x < 1160; x += 60) { c.strokeStyle = rgba('#000', 0.25); c.lineWidth = 1; c.strokeRect(x, y, 60, 22); }
    const mural = (x, y, w, h, k) => {
      c.fillStyle = rgba('#c8a870', 0.25); c.fillRect(x, y, w, h);
      c.strokeStyle = rgba('#d8b060', 0.6); c.lineWidth = 3; c.strokeRect(x, y, w, h);
      const r = U.seeded(k + 50);
      // faded painting: waves, a boat, lanterns rising
      c.strokeStyle = rgba('#2a6a7a', 0.6); c.lineWidth = 2;
      for (let i = 0; i < 4; i++) { c.beginPath(); for (let px = 0; px <= w; px += 10) { const yy = y + h * 0.75 + i * 6 + Math.sin(px * 0.08 + i + k) * 4; px ? c.lineTo(x + px, yy) : c.moveTo(x + px, yy); } c.stroke(); }
      for (let i = 0; i < 7; i++) { c.fillStyle = rgba('#e8a040', 0.7); circle(c, x + r() * w, y + h * (0.15 + r() * 0.5), 3 + r() * 3); c.fill(); }
      c.fillStyle = rgba('#3a2a1a', 0.7); c.beginPath(); c.moveTo(x + w * 0.3, y + h * 0.68); c.lineTo(x + w * 0.7, y + h * 0.68); c.lineTo(x + w * 0.62, y + h * 0.76); c.lineTo(x + w * 0.38, y + h * 0.76); c.fill();
      c.fillStyle = rgba('#f0e8d0', 0.6); c.fillRect(x + w * 0.48, y + h * 0.5, w * 0.05, h * 0.18);
      // water-stains
      for (let i = 0; i < 6; i++) softBlob(c, x + r() * w, y + r() * h, 30, 14, '#0a1a1a', 0.3);
    };
    mural(170, 110, 260, 170, 1); mural(850, 110, 260, 170, 2);
    // central lotus-lamp altar alcove
    c.fillStyle = lg(c, 0, 80, 0, 400, [[0, '#0a1a1c'], [1, '#2a2a20']]);
    c.beginPath(); c.moveTo(520, 400); c.lineTo(520, 160); c.quadraticCurveTo(640, 60, 760, 160); c.lineTo(760, 400); c.closePath(); c.fill();
    c.strokeStyle = '#c8a050'; c.lineWidth = 4; c.stroke();
    glow(c, 640, 250, 320, '#ffcf7a', 0.45);
    // lotus lamp
    for (let k = 0; k < 9; k++) {
      const a = Math.PI + (k / 8) * Math.PI, px = 640 + Math.cos(a) * 46, py = 300 + Math.sin(a) * 18;
      c.fillStyle = rg(c, px, py - 12, 30, [[0, '#fff0d0'], [0.6, '#f0a0b0'], [1, '#a04a6a']]);
      c.save(); c.translate(px, py); c.rotate(a + Math.PI / 2); ellipse(c, 0, -14, 10, 24); c.fill(); c.restore();
    }
    c.fillStyle = '#6a5a3a'; c.fillRect(620, 304, 40, 96);
    // pillars with lotus capitals
    for (const x of [150, 380, 900, 1130]) {
      c.fillStyle = lg(c, x - 26, 0, x + 26, 0, [[0, '#5a6a64'], [0.35, '#8a9a90'], [1, '#1a2a28']]); c.fillRect(x - 24, 40, 48, 380);
      c.fillStyle = '#9aa898'; c.fillRect(x - 34, 34, 68, 14);
      for (let k = 0; k < 5; k++) { c.fillStyle = rgba('#c8d0b8', 0.5); ellipse(c, x - 24 + k * 12, 52, 6, 10); c.fill(); }
      c.fillStyle = rgba('#2a5a50', 0.5); c.fillRect(x - 24, 300, 48, 120); // waterline algae
    }
    // light shafts from broken ceiling
    rays(c, 640, -60, Math.PI / 2, 0.55, 760, 9, '#bff0ff', 0.12, rnd);
    // shallow water over the stone floor
    c.fillStyle = lg(c, 0, 400, 0, H, [[0, '#1a4a4a'], [0.4, '#103438'], [1, '#061418']]); c.fillRect(0, 400, W, 320);
    pavers(c, 404, H, 10, { gap: '#020a0c', light: '#9ae0d0', dark: '#000000', var: 0.08, hi: 0.06, seed: 5, w0: 60, w1: 200, pow: 1.5 });
    c.save(); c.globalCompositeOperation = 'lighter';
    softBlob(c, 640, 470, 80, 150, '#ffcf7a', 0.25);
    for (const x of [150, 380, 900, 1130]) softBlob(c, x, 470, 30, 70, '#8ab0a0', 0.15);
    c.restore();
    c.fillStyle = rgba('#bff0ff', 0.12); c.fillRect(0, 402, W, 2);
    vignette(c, 0.65, '#010608', 0.4);
    grain(c, rnd, 4000, 0.035);
  }, (ctx, t) => {
    // caustic shimmer on the water and wall
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1.5;
    for (let g = 0; g < 2; g++) {
      ctx.strokeStyle = rgba('#9ff0ff', 0.07 + 0.03 * Math.sin(t * 1.5 + g * 2)); ctx.beginPath();
      for (let k = g; k < 14; k += 2) {
        const y = 420 + k * 22 + Math.sin(t * 0.8 + k) * 4;
        for (let x = 0; x <= W; x += 32) { const yy = y + Math.sin(x * 0.02 + t * 1.2 + k * 0.7) * (3 + k * 0.4) + Math.sin(x * 0.051 - t * 0.9) * 2; x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
      }
      ctx.stroke();
    }
    for (let i = 0; i < 5; i += 2) {
      const a = 0.06 + 0.05 * Math.sin(t * 0.5 + i * 1.3), x0 = 480 + i * 70 + Math.sin(t * 0.15 + i) * 20;
      ctx.globalAlpha = a; ctx.fillStyle = '#c8f6ff';
      ctx.beginPath(); ctx.moveTo(x0, -10); ctx.lineTo(x0 + 30, -10); ctx.lineTo(x0 + 120 + (i - 2) * 60, 720); ctx.lineTo(x0 + 40 + (i - 2) * 60, 720); ctx.closePath(); ctx.fill();
    }
    const f = flick(t, 3, 0.4);
    lglow(ctx, 640, 270, 200, '#ffc070', 0.4 * f);
    lglow(ctx, 640, 278, 22, '#fff8e0', 0.95 * f, true);
    ctx.restore();
    // floating lotus lamps
    for (let i = 0; i < SHRINE_LOTUS.length; i++) {
      const [bx, by, s] = SHRINE_LOTUS[i];
      const x = bx + Math.sin(t * 0.3 + i) * 12, y = by + Math.sin(t * 1.1 + i * 2) * 1.5;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      lglow(ctx, x, y - 6 * s, 60 * s, '#ffb860', 0.35 * flick(t, i, 0.5));
      ctx.restore();
      ctx.fillStyle = '#2a5a3a'; ellipse(ctx, x, y + 2 * s, 20 * s, 5 * s); ctx.fill();
      for (let k = 0; k < 5; k++) { ctx.fillStyle = k % 2 ? '#f8d0d8' : '#e890a8'; ellipse(ctx, x + (k - 2) * 5 * s, y - 4 * s, 4 * s, 8 * s, (k - 2) * 0.35); ctx.fill(); }
      ctx.fillStyle = '#fff2c0'; circle(ctx, x, y - 8 * s, 2.5 * s); ctx.fill();
    }
    motes(ctx, t, { n: 30, seed: 101, x: 0, y: 40, w: W, h: 620, vx: 2, vy: -6, r: 5, col: '#ffe0a0', a: 0.5, tw: 2, wob: 20 });
    mist(ctx, t, 'shrine', '#5aa0a0', 380, 120, 0.3, 5, 36, 102);
  });

  // ---------- 逆潮 chaos: burning city, the black tide rising backwards ----------
  const CHAOS_FIRES = [];
  def('chaos', (c, rnd) => {
    CHAOS_FIRES.length = 0;
    vfill(c, 0, 420, [[0, '#14030a'], [0.3, '#4a0a10'], [0.65, '#b02a10'], [0.88, '#ff7a24'], [1, '#ffb050']]);
    // smoke columns rising from the burning city, underlit by fire
    for (let i = 0; i < 8; i++) {
      const x0 = 60 + rnd() * 700;
      for (let k = 0; k < 14; k++) {
        const u = k / 13, x = x0 + u * 140 + Math.sin(u * 4 + i) * 30, y = 380 - u * 360, r = 40 + u * 90;
        softBlob(c, x, y, r * 1.3, r, u < 0.3 ? '#4a1a10' : '#1e0c0a', 0.35);
        if (u < 0.5) softBlob(c, x, y + r * 0.4, r, r * 0.5, '#ff6a2a', 0.08);
      }
    }
    // the reversed black tide: a colossal wave curling inland over the city
    const wave = (x) => {
      x.beginPath();
      x.moveTo(W + 40, 430); x.lineTo(W + 40, 40);
      x.bezierCurveTo(1100, -10, 860, 10, 760, 90);
      x.bezierCurveTo(690, 140, 640, 210, 690, 240);
      x.bezierCurveTo(730, 262, 770, 220, 760, 190);
      x.bezierCurveTo(800, 250, 820, 330, 760, 430);
      x.closePath();
    };
    layer(c, (x) => { wave(x); x.fillStyle = lg(x, 1100, 0, 700, 400, [[0, '#06121a'], [0.5, '#0a1e28'], [1, '#020608']]); x.fill(); }, (x) => {
      const r = U.seeded(9);
      x.lineCap = 'round';
      for (let i = 0; i < 46; i++) { // flow lines sweeping up and over
        const sx = 800 + r() * 520, sy = 430;
        x.strokeStyle = rgba(r() < 0.5 ? '#5a90b0' : '#1a3a4a', 0.15 + r() * 0.2); x.lineWidth = 1 + r() * 3;
        x.beginPath(); x.moveTo(sx, sy); x.bezierCurveTo(sx - 20, 300, sx + 60 - r() * 120, 120, 760 + r() * 300, 40 + r() * 80); x.stroke();
      }
      for (let i = 0; i < 120; i++) glow(x, 700 + r() * 600, 40 + r() * 390, 4 + r() * 10, r() < 0.8 ? '#5ab8ff' : '#c0f0ff', 0.45);
      x.fillStyle = lg(x, 760, 90, 1000, 200, [[0, rgba('#8ad0ff', 0.25)], [1, rgba('#8ad0ff', 0)]]); x.fillRect(600, 0, 700, 300);
    });
    // foam lip & dripping tendrils
    c.strokeStyle = rgba('#b8e0f0', 0.55); c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(1100, 4); c.bezierCurveTo(950, 0, 830, 30, 760, 92); c.bezierCurveTo(700, 140, 650, 205, 690, 238); c.stroke();
    for (let i = 0; i < 18; i++) { const u = i / 17, x = U.lerp(700, 1000, u), y = 230 - u * 170 + rnd() * 20; c.strokeStyle = rgba('#9ad0e8', 0.35); c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - 10, y + 30, x - 20 - rnd() * 20, y + 50 + rnd() * 40); c.stroke(); }
    // burning city skyline against the fire glow
    glow(c, 360, 400, 520, '#ff6a1a', 0.35);
    const roofs = (y0, col, scale, x0, x1, n, fires) => {
      for (let i = 0; i < n; i++) {
        const x = x0 + (i + rnd() * 0.4) * ((x1 - x0) / n), w = (80 + rnd() * 70) * scale, h = (30 + rnd() * 60) * scale;
        c.fillStyle = col; c.fillRect(x, y0 - h, w, h + 60);
        const ry = y0 - h, rh = 22 * scale;
        c.beginPath(); c.moveTo(x - 12 * scale, ry); c.quadraticCurveTo(x + w * 0.1, ry - rh * 0.6, x + w * 0.15, ry - rh); c.lineTo(x + w * 0.85, ry - rh); c.quadraticCurveTo(x + w * 0.9, ry - rh * 0.6, x + w + 12 * scale, ry); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(x + w * 0.15, ry - rh); c.quadraticCurveTo(x - 4 * scale, ry - rh * 1.2, x - 16 * scale, ry - rh * 2); c.lineTo(x + w * 0.2, ry - rh * 1.2); c.lineTo(x + w * 0.8, ry - rh * 1.2); c.lineTo(x + w + 16 * scale, ry - rh * 2); c.quadraticCurveTo(x + w + 4 * scale, ry - rh * 1.2, x + w * 0.85, ry - rh); c.closePath(); c.fill();
        if (fires && rnd() < 0.7) CHAOS_FIRES.push([x + w * (0.2 + rnd() * 0.6), ry - rh, scale]);
        if (rnd() < 0.5) { c.fillStyle = rgba('#ff9a3a', 0.8); c.fillRect(x + w * 0.3, y0 - h * 0.6, 8 * scale, 10 * scale); c.fillStyle = col; }
      }
    };
    roofs(392, '#2a0c08', 0.55, -20, 820, 12, true);
    roofs(420, '#100404', 0.9, -40, 760, 6, true);
    // cracked, ember-strewn street
    groundBase(c, 418, { stops: [[0, '#3a1810'], [0.4, '#22100a'], [1, '#0a0404']], seed: 7, light: '#ff7a2a', blots: 70, speckle: 1200, speckCols: ['#000000', '#5a2a1a', '#ff6a2a'], speckA: 0.3, pool: { x: 420, y: 470, r: 600, col: '#ff6a2a', a: 0.22, sy: 0.25 } });
    pavers(c, 420, H, 11, { gap: '#050202', light: '#ff9a5a', dark: '#000000', var: 0.08, hi: 0.06, seed: 31, w0: 50, w1: 160 });
    c.strokeStyle = rgba('#ff6a20', 0.5); c.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) { let x = rnd() * W, y = 440 + rnd() * 260; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 50; y += (rnd() - 0.3) * 14; c.lineTo(x, y); } c.stroke(); }
    // black water already creeping up the street from the right
    c.fillStyle = lg(c, 760, 0, W, 0, [[0, rgba('#020608', 0)], [0.4, rgba('#020608', 0.7)], [1, rgba('#020608', 0.9)]]);
    c.beginPath(); c.moveTo(W, 418); c.lineTo(760, 430); c.quadraticCurveTo(900, 470, 1000, 470); c.quadraticCurveTo(1150, 480, W, 520); c.closePath(); c.fill();
    c.fillStyle = rgba('#020608', 0.7); ellipse(c, 260, 640, 220, 26); c.fill();
    c.fillStyle = rgba('#5ab8ff', 0.15); ellipse(c, 230, 634, 120, 6); c.fill();
    // debris: broken lantern frames, scattered tiles
    for (let i = 0; i < 40; i++) { const d = rnd(); c.fillStyle = rgba('#120806', 0.8); c.save(); c.translate(rnd() * W, 440 + d * d * 280); c.rotate(rnd() * 3); c.fillRect(-4 - d * 8, -2, 8 + d * 16, 3 + d * 3); c.restore(); }
    vignette(c, 0.65, '#0a0000', 0.4);
    grain(c, rnd, 5000, 0.04);
  }, (ctx, t) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < CHAOS_FIRES.length; i++) {
      const [x, y, s] = CHAOS_FIRES[i], f = flick(t, i, 1.2);
      lglow(ctx, x, y - 10 * s, 90 * s, '#ff5a1a', 0.45 * f);
      for (let k = 0; k < 3; k++) { const ph = mod(t * 1.5 + k / 3 + i * 0.37, 1); lglow(ctx, x + Math.sin(t * 4 + k + i) * 6 * s, y - ph * 50 * s, (18 - ph * 12) * s, k % 2 ? '#ffd060' : '#ff7a20', 0.8 * (1 - ph), true); }
    }
    // lightning flicker inside the tide
    const flash = Math.max(0, Math.sin(t * 0.9) * Math.sin(t * 13.7) - 0.85) * 6;
    if (flash > 0) lglow(ctx, 1000, 160, 500, '#8ab8ff', flash * 0.4);
    ctx.restore();
    // souls dragged backwards toward the tide (moving up/out)
    motes(ctx, t, { n: 30, seed: 111, x: 0, y: 120, w: W, h: 460, vx: 26, vy: -14, r: 7, col: '#5ab8ff', a: 0.6, tw: 2, wob: 16 });
    motes(ctx, t, { n: 50, seed: 112, x: 0, y: 100, w: W, h: 620, vx: 10, vy: -40, r: 4, col: '#ff8a3a', a: 0.8, tw: 6, wob: 20 });
    mist(ctx, t, 'chaos1', '#3a1410', 300, 160, 0.6, 20, 40, 113);
    mist(ctx, t, 'chaos2', '#1a0806', 480, 140, 0.45, 30, 40, 114);
  });

  // ---------- 黑水溝 sea: on 陳伯's boat amid drifting soul-lights ----------
  function seaDeck() {
    return fullLayer('seaDeck', (c) => {
      const y0 = 432;
      c.fillStyle = lg(c, 0, y0, 0, H, [[0, '#2a1e18'], [0.5, '#221812'], [1, '#0e0806']]);
      c.beginPath(); c.moveTo(-40, y0 + 6); c.quadraticCurveTo(640, y0 - 14, W + 40, y0 + 6); c.lineTo(W + 40, H); c.lineTo(-40, H); c.closePath(); c.fill();
      const r = U.seeded(7);
      for (let k = -14; k <= 14; k++) { c.strokeStyle = rgba('#0a0604', 0.7); c.lineWidth = 1.5; c.beginPath(); c.moveTo(640 + k * 40, y0 - 2); c.lineTo(640 + k * 110, H); c.stroke(); }
      for (let i = 0; i < 300; i++) { c.fillStyle = rgba(r() < 0.5 ? '#000' : '#a08060', 0.06); c.fillRect(r() * W, y0 + r() * (H - y0), 30 + r() * 80, 1); }
      // gunwale (back rail) and ribs
      c.fillStyle = lg(c, 0, y0 - 30, 0, y0 + 8, [[0, '#5a4030'], [1, '#1a100a']]);
      c.beginPath(); c.moveTo(-40, y0 - 22); c.quadraticCurveTo(640, y0 - 44, W + 40, y0 - 22); c.lineTo(W + 40, y0 + 8); c.quadraticCurveTo(640, y0 - 14, -40, y0 + 8); c.closePath(); c.fill();
      c.fillStyle = rgba('#c8a070', 0.25); c.beginPath(); c.moveTo(-40, y0 - 22); c.quadraticCurveTo(640, y0 - 44, W + 40, y0 - 22); c.lineTo(W + 40, y0 - 19); c.quadraticCurveTo(640, y0 - 41, -40, y0 - 19); c.fill();
      // mast and lantern pole
      c.fillStyle = lg(c, 626, 0, 654, 0, [[0, '#6a4a34'], [1, '#1a100a']]); c.fillRect(628, -10, 24, y0 - 20);
      c.fillStyle = '#2a1a10'; c.fillRect(560, 60, 160, 8);
      c.strokeStyle = rgba('#1a120a', 0.9); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(640, 0); c.lineTo(-20, y0 - 30); c.moveTo(640, 0); c.lineTo(W + 20, y0 - 30); c.moveTo(560, 64); c.lineTo(300, y0 - 34); c.moveTo(720, 64); c.lineTo(980, y0 - 34); c.stroke();
      // furled sail
      c.fillStyle = lg(c, 0, 70, 0, 110, [[0, '#8a7a60'], [1, '#4a3a2a']]); c.fillRect(570, 68, 140, 30);
      for (let k = 0; k < 6; k++) { c.fillStyle = rgba('#000', 0.25); c.fillRect(575 + k * 24, 68, 2, 30); }
      // coiled rope, oar (引魂槳) leaning, front gunwale
      c.strokeStyle = '#6a5034'; c.lineWidth = 3; for (let k = 0; k < 4; k++) { ellipse(c, 1180, 690, 44 - k * 8, 13 - k * 2.5); c.stroke(); }
      c.fillStyle = lg(c, 0, H - 26, 0, H, [[0, '#4a3424'], [1, '#120a06']]); c.fillRect(0, H - 22, W, 22);
      c.fillStyle = rg(c, 640, 470, 640, [[0, rgba('#ffa050', 0.22)], [1, rgba('#ffa050', 0)]]); c.fillRect(0, 380, W, 340);
      vignette(c, 0.5, '#000000', 0.5);
    });
  }
  def('sea', (c, rnd) => {
    vfill(c, 0, 330, [[0, '#010308'], [0.5, '#06141c'], [1, '#12303a']]);
    stars(c, 120, rnd, 280, { a: 0.6 });
    // faint aurora of departing souls
    for (let i = 0; i < 6; i++) { c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = lg(c, 0, 60 + i * 20, 0, 260, [[0, rgba('#3affc0', 0)], [0.5, rgba('#3affc0', 0.05)], [1, rgba('#3a8aff', 0)]]); c.beginPath(); c.moveTo(0, 120 + i * 18); for (let x = 0; x <= W; x += 40) c.lineTo(x, 90 + i * 22 + Math.sin(x * 0.006 + i) * 40); c.lineTo(W, 300); c.lineTo(0, 300); c.fill(); c.restore(); }
    // far shore glow on the horizon
    glow(c, 1000, 328, 260, '#ffd090', 0.18); glow(c, 1000, 326, 14, '#fff0d0', 0.7);
    water(c, 330, H, { stops: [[0, '#163a44'], [0.05, '#081a22'], [1, '#010406']], light: '#6ab8c8', streaks: 300, seed: 3, path: { x: 1000, col: '#ffe0a0', a: 0.35, w0: 4, w1: 60, n: 60 } });
    // thousands of soul-lights on the water (baked far field)
    seaDeck();
    for (let i = 0; i < 500; i++) { const d = Math.pow(rnd(), 1.6), y = 332 + d * 120, x = rnd() * W; c.fillStyle = rgba(rnd() < 0.85 ? '#ffd08a' : '#9ad8ff', 0.4 + rnd() * 0.5); c.fillRect(x, y, 1 + d * 2, 1 + d); if (rnd() < 0.1) glow(c, x, y, 6 + d * 10, '#ffb060', 0.3); }
  }, (ctx, t) => {
    // the boat deck (front layer) rocks against the sea
    const deck = seaDeck();
    // drifting soul lanterns near the boat
    ctx.save();
    for (let i = 0; i < 16; i++) {
      const h1 = U.hash(i, 1, 121), h2 = U.hash(i, 2, 121);
      const d = h2, y = 340 + d * 70, s = 0.35 + d * 0.9;
      const x = mod(h1 * 1500 + t * (5 + d * 10), 1500) - 110;
      const b = Math.sin(t * 1.2 + i) * 1.5;
      ctx.globalCompositeOperation = 'lighter';
      lglow(ctx, x, y + b - 4 * s, 36 * s, i % 5 === 0 ? '#9ad8ff' : '#ffb560', 0.5 * flick(t, i, 0.4));
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.9;
      ctx.fillStyle = i % 5 === 0 ? '#d8f0ff' : '#ffe0a0'; ctx.fillRect(x - 4 * s, y + b - 8 * s, 8 * s, 8 * s);
      ctx.fillStyle = '#1a120c'; ctx.fillRect(x - 6 * s, y + b, 12 * s, 2.5 * s);
    }
    ctx.restore();
    waveGlints(ctx, t, { n: 60, seed: 122, y0: 332, y1: 420, col: '#8ad8e8', a: 0.5, len: 14 });
    mist(ctx, t, 'sea1', '#4a7a8a', 300, 120, 0.4, 10, 36, 123);
    const heave = snap(4 + Math.sin(t * 0.9 + 1) * 4);
    ctx.save(); ctx.translate(0, heave);
    ctx.drawImage(deck, 0, 0, W, H);
    hangLantern(ctx, t, 600, 68, '#d84a2a', 15, 1, { glowR: 160, glowA: 0.5, char: '渡', sway: 0.15 });
    hangLantern(ctx, t, 690, 68, '#d84a2a', 12, 2, { glowR: 120, glowA: 0.4, sway: 0.15 });
    ctx.restore();
    motes(ctx, t, { n: 20, seed: 124, x: 0, y: 100, w: W, h: 500, vx: 4, vy: -8, r: 6, col: '#ffcf8a', a: 0.45, tw: 2, wob: 20 });
  }, { shift: (t) => [0, Math.sin(t * 0.9) * 3], edge: '#010308' });

  // ---------- 彼岸花原 farshore: red spider-lily fields under a strange sky ----------
  function spiderLily(c, x, y, s, rnd) {
    c.strokeStyle = '#2a4a1a'; c.lineWidth = Math.max(0.8, s * 0.12);
    c.beginPath(); c.moveTo(x, y + s * 6); c.lineTo(x, y); c.stroke();
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU + rnd() * 0.5;
      const ex = x + Math.cos(a) * s * 1.8, ey = y + Math.sin(a) * s * 0.9 - s * 0.6;
      c.strokeStyle = k % 2 ? '#e0201a' : '#b8140e'; c.lineWidth = Math.max(0.8, s * 0.35);
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * s * 1.4, y - s * 0.9, ex, ey); c.stroke();
      c.strokeStyle = '#ff5a40'; c.lineWidth = Math.max(0.4, s * 0.08);
      const sx = x + Math.cos(a) * s * 2.6, sy = y - s * 2.2 + Math.sin(a) * s * 0.5;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * s * 1.6, y - s * 2.6, sx, sy); c.stroke();
      if (s > 2.5) { c.fillStyle = '#ffd040'; circle(c, sx, sy, s * 0.12); c.fill(); }
    }
  }
  def('farshore', (c, rnd) => {
    vfill(c, 0, 400, [[0, '#0a0620'], [0.35, '#2a1048'], [0.65, '#5a1a50'], [0.9, '#a03a4a'], [1, '#e0705a']]);
    stars(c, 160, rnd, 300, { a: 0.7, cols: ['#ffffff', '#ffd0e0', '#d0e0ff'] });
    // eclipsed sun with a vast pale ring
    c.strokeStyle = rgba('#ffe8d0', 0.18); c.lineWidth = 3; circle(c, 420, 170, 230); c.stroke();
    c.strokeStyle = rgba('#ffe8d0', 0.08); c.lineWidth = 14; circle(c, 420, 170, 260); c.stroke();
    glow(c, 420, 170, 260, '#ff8a6a', 0.35);
    glow(c, 420, 170, 90, '#fff0e0', 0.8);
    c.fillStyle = '#12061a'; circle(c, 420, 170, 58); c.fill();
    c.strokeStyle = rgba('#fff4e0', 0.9); c.lineWidth = 2; circle(c, 420, 170, 59); c.stroke();
    cloud(c, 900, 200, 500, 30, { top: '#8a3a6a', bot: '#2a1038', hi: '#ffb0a0', a: 0.6, seed: 4 });
    // distant hills & the far lighthouse (彼岸燈塔)
    mountain(c, { y: 372, amp: 60, freq: 0.004, seed: 51, col: '#3a1438', col2: '#5a1a40', bottom: 400, haze: '#c05050', hazeA: 0.6 });
    c.fillStyle = '#1a0a1c'; c.beginPath(); c.moveTo(1040, 360); c.lineTo(1050, 250); c.lineTo(1066, 250); c.lineTo(1076, 360); c.closePath(); c.fill();
    c.fillRect(1044, 240, 28, 12); c.beginPath(); c.moveTo(1040, 240); c.lineTo(1058, 222); c.lineTo(1076, 240); c.fill();
    glow(c, 1058, 244, 120, '#ffe0a0', 0.5); glow(c, 1058, 244, 10, '#ffffff', 0.9);
    // field
    c.fillStyle = lg(c, 0, 380, 0, H, [[0, '#4a1020'], [0.3, '#2a0a14'], [1, '#12040a']]); c.fillRect(0, 380, W, 340);
    // far field: dense red haze of tiny flowers
    for (let i = 0; i < 3000; i++) { const d = Math.pow(rnd(), 2.2), y = 382 + d * 80, x = rnd() * W; c.fillStyle = rgba(rnd() < 0.8 ? '#d0201a' : '#ff6040', 0.5 + rnd() * 0.5); c.fillRect(x, y, 1 + d * 2, 1 + d); }
    // near field: spider lilies, sparser in the fighting band, dense at the front and edges
    for (let i = 0; i < 900; i++) {
      const d = rnd(), y = 440 + d * d * 300, x = rnd() * W;
      const inBand = y > 430 && y < 600 && x > 80 && x < 1220;
      if (inBand && rnd() < 0.75) continue;
      spiderLily(c, x, y, 1 + d * d * 6, rnd);
    }
    vfill(c, 360, 470, [[0, rgba('#ff7a6a', 0.0)], [0.4, rgba('#ff7a6a', 0.18)], [1, rgba('#ff7a6a', 0)]]);
    vignette(c, 0.6, '#0a0010', 0.4);
    grain(c, rnd, 4000, 0.035);
  }, (ctx, t) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // aurora ribbons
    for (let k = 0; k < 3; k++) {
      ctx.globalAlpha = 0.06 + 0.03 * Math.sin(t * 0.4 + k);
      ctx.fillStyle = ['#3affc0', '#ff6ad0', '#8a7aff'][k];
      ctx.beginPath(); ctx.moveTo(0, 60 + k * 30);
      for (let x = 0; x <= W; x += 40) ctx.lineTo(x, 60 + k * 30 + Math.sin(x * 0.005 + t * 0.3 + k * 2) * 40);
      for (let x = W; x >= 0; x -= 40) ctx.lineTo(x, 110 + k * 30 + Math.sin(x * 0.006 + t * 0.25 + k) * 50);
      ctx.closePath(); ctx.fill();
    }
    lglow(ctx, 1058, 244, 160 + Math.sin(t * 1.5) * 30, '#ffe0a0', 0.25);
    ctx.restore();
    leaves(ctx, t, { n: 20, seed: 131, vx: 20, vy: 16, size: 4, cols: ['#e0201a', '#ff4a3a', '#a0140e'], shape: 'petal', sway: 50 });
    motes(ctx, t, { n: 30, seed: 132, x: 0, y: 200, w: W, h: 500, vx: 6, vy: -14, r: 6, col: '#ffd0b0', a: 0.5, tw: 2, wob: 20 });
    mist(ctx, t, 'far1', '#c05060', 380, 110, 0.4, 6, 36, 133);
  });

  // ---------- 彼岸燈塔 lighthouse interior ----------
  def('lighthouse', (c, rnd) => {
    // curved stone wall interior
    c.fillStyle = lg(c, 0, 0, W, 0, [[0, '#0c0a10'], [0.25, '#2a2630'], [0.5, '#3a3440'], [0.75, '#2a2630'], [1, '#0c0a10']]); c.fillRect(0, 0, W, H);
    for (let row = 0; row < 30; row++) {
      const y = row * 26;
      for (let k = -20; k <= 20; k++) {
        const u = (k + (row % 2) * 0.5) / 20, x = 640 + Math.sin(u * 1.4) * 760, w = Math.cos(u * 1.4) * 38 + 2;
        c.strokeStyle = rgba('#000', 0.35); c.lineWidth = 1; c.strokeRect(x - w / 2, y, w, 26);
        c.fillStyle = rgba(rnd() < 0.5 ? '#ffffff' : '#000000', 0.03); c.fillRect(x - w / 2, y, w, 26);
      }
    }
    // central light shaft from the lamp room above
    c.fillStyle = rg(c, 640, -60, 500, [[0, rgba('#fff2c8', 0.6)], [0.5, rgba('#ffd890', 0.15)], [1, rgba('#ffd890', 0)]]); c.fillRect(0, 0, W, 500);
    c.fillStyle = '#06050a'; ellipse(c, 640, 40, 210, 40); c.fill();
    c.strokeStyle = '#8a7a5a'; c.lineWidth = 4; ellipse(c, 640, 40, 210, 40); c.stroke();
    // great lens glimpsed through the opening
    for (let k = 0; k < 7; k++) { c.strokeStyle = rgba('#ffe8b0', 0.5 - k * 0.05); c.lineWidth = 3; c.beginPath(); c.ellipse(640, 30, 30 + k * 22, 8 + k * 4, 0, Math.PI, TAU); c.stroke(); }
    glow(c, 640, 30, 160, '#fff0c0', 0.7);
    // spiral stair along the wall
    for (let i = 0; i < 26; i++) {
      const u = i / 25, a = -1.2 + u * 2.4, x = 640 + Math.sin(a) * 600, y = 400 - u * 380 + Math.cos(a * 2) * 10, w = Math.cos(a) * 70 + 10;
      c.fillStyle = lg(c, 0, y - 10, 0, y + 12, [[0, '#6a6070'], [1, '#2a2430']]); c.fillRect(x - w / 2, y - 8, w, 12);
      c.fillStyle = rgba('#ffe0b0', 0.2); c.fillRect(x - w / 2, y - 8, w, 2);
      c.strokeStyle = '#4a3a2a'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y - 8); c.lineTo(x, y - 48); c.stroke();
    }
    c.strokeStyle = '#5a4630'; c.lineWidth = 3; c.beginPath();
    for (let i = 0; i <= 25; i++) { const u = i / 25, a = -1.2 + u * 2.4; c.lineTo(640 + Math.sin(a) * 600, 352 - u * 380 + Math.cos(a * 2) * 10); }
    c.stroke();
    // narrow windows with night sea glimpses
    for (const [x, y] of [[220, 200], [1060, 160], [640, 230]]) {
      c.fillStyle = lg(c, 0, y - 40, 0, y + 40, [[0, '#0a1430'], [1, '#1a3a5a']]);
      c.beginPath(); c.moveTo(x - 14, y + 40); c.lineTo(x - 14, y - 26); c.quadraticCurveTo(x, y - 44, x + 14, y - 26); c.lineTo(x + 14, y + 40); c.closePath(); c.fill();
      c.fillStyle = '#fff'; for (let k = 0; k < 4; k++) c.fillRect(x - 10 + rnd() * 20, y - 30 + rnd() * 30, 1.2, 1.2);
    }
    // floor: circular stone with a compass-rose inlay
    c.fillStyle = lg(c, 0, 410, 0, H, [[0, '#3a3440'], [1, '#141018']]); c.fillRect(0, 410, W, 310);
    c.save(); c.translate(640, 540); c.scale(1, 0.26);
    for (let k = 6; k > 0; k--) { c.strokeStyle = rgba('#c8a870', 0.12 + k * 0.02); c.lineWidth = 3; circle(c, 0, 0, k * 90); c.stroke(); }
    c.fillStyle = rgba('#c8a870', 0.14);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, L = k % 2 ? 260 : 460; c.beginPath(); c.moveTo(Math.cos(a) * L, Math.sin(a) * L); c.lineTo(Math.cos(a + 0.18) * 60, Math.sin(a + 0.18) * 60); c.lineTo(Math.cos(a - 0.18) * 60, Math.sin(a - 0.18) * 60); c.closePath(); c.fill(); }
    c.restore();
    c.fillStyle = rg(c, 640, 520, 520, [[0, rgba('#ffe0a0', 0.18)], [1, rgba('#ffe0a0', 0)]]); c.fillRect(0, 380, W, 340);
    // wall base & barrels of oil
    c.fillStyle = '#1a161e'; c.fillRect(0, 400, W, 14);
    for (const x of [90, 150, 1150]) { c.fillStyle = lg(c, x - 26, 0, x + 26, 0, [[0, '#6a4a30'], [1, '#2a1a10']]); c.fillRect(x - 26, 340, 52, 70); c.fillStyle = '#3a3a40'; c.fillRect(x - 26, 352, 52, 4); c.fillRect(x - 26, 392, 52, 4); }
    vignette(c, 0.65, '#000000', 0.4);
    grain(c, rnd, 4000, 0.035);
  }, (ctx, t) => {
    // rotating beams thrown down the tower
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 2; k++) {
      const a = t * 0.6 + k * Math.PI, sx = Math.sin(a), vis = Math.max(0, Math.cos(a));
      if (vis < 0.02) continue;
      ctx.globalAlpha = 0.18 * vis;
      ctx.fillStyle = lg(ctx, 640, 30, 640 + sx * 600, 720, [[0, '#fff4d0'], [1, 'rgba(255,240,200,0)']]);
      ctx.beginPath(); ctx.moveTo(640, 30); ctx.lineTo(640 + sx * 700 - 160, 720); ctx.lineTo(640 + sx * 700 + 160, 720); ctx.closePath(); ctx.fill();
    }
    const p = 0.8 + 0.2 * Math.sin(t * 2.2);
    lglow(ctx, 640, 30, 220, '#fff0c0', 0.4 * p);
    ctx.restore();
    motes(ctx, t, { n: 40, seed: 141, x: 300, y: 40, w: 680, h: 640, vx: 2, vy: 5, r: 4, col: '#ffe8c0', a: 0.5, tw: 2, wob: 20 });
  });

  // =====================================================================================
  // REGIONAL SCENES
  // =====================================================================================
  // traditional junk (戎克船) silhouette with battened sails
  function junk(c, x, y, s, col, sail, o = {}) {
    c.fillStyle = col;
    c.beginPath(); c.moveTo(x - 60 * s, y - 14 * s); c.quadraticCurveTo(x - 50 * s, y + 4 * s, x - 20 * s, y + 6 * s); c.lineTo(x + 40 * s, y + 6 * s); c.quadraticCurveTo(x + 62 * s, y, x + 70 * s, y - 18 * s); c.lineTo(x + 50 * s, y - 8 * s); c.lineTo(x - 40 * s, y - 8 * s); c.closePath(); c.fill();
    for (const [mx, mh, sw] of [[-8, 90, 46], [30, 64, 34], [-46, 44, 22]]) {
      c.fillStyle = col; c.fillRect(x + mx * s - 1, y - 8 * s - mh * s, 2 * s + 0.5, mh * s);
      c.fillStyle = sail;
      c.beginPath(); c.moveTo(x + mx * s, y - 14 * s - mh * s * 0.95); c.quadraticCurveTo(x + (mx + sw * 0.7) * s, y - 14 * s - mh * s, x + (mx + sw) * s, y - 14 * s - mh * s * 0.85); c.lineTo(x + (mx + sw * 0.9) * s, y - 16 * s); c.lineTo(x + mx * s, y - 16 * s); c.closePath(); c.fill();
      c.strokeStyle = rgba('#000000', 0.3); c.lineWidth = Math.max(0.5, s);
      for (let k = 1; k < 6; k++) { const yy = y - 16 * s - mh * s * 0.85 * k / 6; c.beginPath(); c.moveTo(x + mx * s, yy); c.lineTo(x + (mx + sw * 0.95) * s, yy - 2 * s); c.stroke(); }
    }
  }
  // 紅毛城: square red fortress with crenellated parapet and arched windows
  function redFort(c, x, by, w, h, lightCol) {
    c.fillStyle = lg(c, x - w / 2, 0, x + w / 2, 0, [[0, '#d8684a'], [0.55, '#b44a32'], [1, '#6a2418']]);
    c.fillRect(x - w / 2, by - h, w, h);
    for (let y = by - h + 5; y < by; y += 5) { c.fillStyle = rgba('#3a0a04', 0.15); c.fillRect(x - w / 2, y, w, 1); }
    for (let k = 0; k < 10; k++) { const cx = x - w / 2 + k * w / 9.5; c.fillStyle = '#b44a32'; c.fillRect(cx, by - h - 10, w / 19, 10); }
    c.fillStyle = '#8a3a26'; c.fillRect(x - w / 2 - 3, by - h - 2, w + 6, 4);
    for (let row = 0; row < 2; row++) for (let k = 0; k < 4; k++) {
      const wx = x - w / 2 + (k + 0.5) * w / 4, wy = by - h + h * (0.25 + row * 0.42);
      c.fillStyle = '#2a0e08'; c.beginPath(); c.moveTo(wx - 6, wy + 14); c.lineTo(wx - 6, wy); c.arc(wx, wy, 6, Math.PI, 0); c.lineTo(wx + 6, wy + 14); c.closePath(); c.fill();
      c.strokeStyle = '#e8b890'; c.lineWidth = 1.2; c.stroke();
    }
    if (lightCol) { c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = lg(c, x - w / 2, 0, x, 0, [[0, rgba(lightCol, 0.3)], [1, rgba(lightCol, 0)]]); c.fillRect(x - w / 2, by - h - 10, w / 2, h + 10); c.restore(); }
  }

  // ---------- 淡水 river mouth at sunset: 觀音山 across, 紅毛城 on the hill ----------
  def('tamsui', (c, rnd) => {
    vfill(c, 0, 340, [[0, '#2a3a7a'], [0.35, '#8a5a8a'], [0.65, '#f0906a'], [0.9, '#ffc880'], [1, '#ffe0a0']]);
    sun(c, 640, 300, 30, '#fff6d8', '#ffa860', 0.6);
    cloud(c, 300, 150, 520, 30, { top: '#ffb090', bot: '#8a4a6a', hi: '#ffe0b0', a: 0.75, seed: 4, rim: '#ffd8a0', rimSide: 'right' });
    cloud(c, 960, 110, 420, 26, { top: '#ffa890', bot: '#7a4a6a', hi: '#ffe0b0', a: 0.65, seed: 7, rim: '#ffd8a0', rimSide: 'left' });
    // 觀音山: the reclining-Guanyin skyline across the river
    const gy = (x) => -[[120, 60, 70], [215, 95, 34], [270, 78, 40], [330, 72, 50], [430, 140, 85], [560, 96, 70], [690, 50, 70]].reduce((m, [cx, hh, ww]) => m + hh * Math.exp(-Math.pow((x - cx) / ww, 2)), 0);
    mountain(c, { y: 336, amp: 14, freq: 0.01, seed: 61, oct: 3, shape: gy, x1: 860, col: '#6a4a78', col2: '#9a6a80', bottom: 338, shade: 0.35, light: '#ffc0a0', dark: '#2a1a3a', haze: '#ffb090', hazeA: 0.55, rim: '#ffd0a0', rimA: 0.35, trees: { kind: 'round', size: 4, gap: 7, seed: 9 } });
    // river / sea with the sunset path
    water(c, 336, 440, { stops: [[0, '#ffc890'], [0.15, '#d08080'], [0.6, '#6a4a70'], [1, '#3a2a4a']], light: '#ffe0b0', dark: '#3a2040', seed: 61, streaks: 260,
      path: { x: 640, col: '#fff0c0', a: 0.8, w0: 10, w1: 150, n: 160 } });
    // the hill with 紅毛城 on the right bank
    const hp = profile({ y: 330, amp: 30, freq: 0.006, seed: 62, oct: 3, x0: 860, shape: (x) => -Math.min(1, (x - 860) / 180) * 70 });
    layer(c, (x) => { pathProfile(x, hp, 450); x.fillStyle = lg(x, 0, 240, 0, 450, [[0, '#3a4a30'], [1, '#1e2618']]); x.fill(); treeFringe(x, hp, { kind: 'round', size: 12, gap: 14, seed: 5 }, x.fillStyle); }, (x) => {
      x.fillStyle = lg(x, 860, 0, W, 0, [[0, rgba('#ffb070', 0.35)], [1, rgba('#ffb070', 0)]]); x.fillRect(860, 200, 420, 260);
    });
    redFort(c, 1080, 272, 150, 80, '#ffd080');
    c.fillStyle = '#d8c8b0'; c.fillRect(1006, 270, 148, 6);
    // river bank, junks moored
    junk(c, 300, 408, 0.5, '#2a1a24', '#6a3a3a');
    junk(c, 880, 402, 0.38, '#2a1a24', '#5a3a3a');
    // quay: stone embankment edge, then paved riverside
    c.fillStyle = lg(c, 0, 432, 0, 452, [[0, '#9a8a7a'], [1, '#4a3a34']]); c.fillRect(0, 432, W, 20);
    for (let x = 0; x < W; x += 36) { c.fillStyle = rgba('#2a1a14', 0.5); c.fillRect(x, 432, 1.5, 20); }
    groundBase(c, 450, { stops: [[0, '#7a6458'], [0.5, '#6a5248'], [1, '#3a2a26']], seed: 6, light: '#ffd0a0', blots: 60, pool: { x: 640, y: 500, r: 600, col: '#ffb070', a: 0.2, sy: 0.25 } });
    pavers(c, 452, H, 11, { gap: '#3a2a24', light: '#ffe0c0', dark: '#2a1810', var: 0.08, hi: 0.12, seed: 63, w0: 50, w1: 160 });
    for (const x of [160, 520, 900, 1180]) { c.fillStyle = lg(c, x - 7, 0, x + 7, 0, [[0, '#7a6a5a'], [1, '#2a2018']]); c.fillRect(x - 7, 410, 14, 34); c.fillStyle = '#5a4a3a'; ellipse(c, x, 410, 8, 3); c.fill(); }
    vignette(c, 0.4, '#2a1020', 0.5);
    grade(c, '#ffa060', 0.15, 'soft-light');
    grain(c, rnd, 3500, 0.03);
  }, (ctx, t) => {
    waveGlints(ctx, t, { n: 90, seed: 64, y0: 338, y1: 432, cx: 640, w0: 20, w1: 300, col: '#fff0c8', a: 0.9, len: 12 });
    // a sailing junk crossing the river mouth
    ctx.save();
    const x = mod(t * 10 + 200, W + 300) - 150, y = 372 + Math.sin(t * 1.2) * 1.5;
    junk(ctx, x, y, 0.32, '#24161e', '#4a2a2e');
    ctx.restore();
    // egrets gliding home
    ctx.save(); ctx.strokeStyle = '#fff4e8'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) {
      const bx = mod(-t * (24 + i * 5) + i * 320, W + 200) - 100, by = 140 + i * 30 + Math.sin(t * 0.9 + i) * 12, f = Math.sin(t * 4 + i) * 5;
      ctx.beginPath(); ctx.moveTo(bx - 12, by - f); ctx.quadraticCurveTo(bx - 4, by - 3, bx, by); ctx.quadraticCurveTo(bx + 4, by - 3, bx + 12, by - f); ctx.stroke();
    }
    ctx.restore();
    mist(ctx, t, 'tamsui', '#ffc0a0', 300, 80, 0.3, 6, 30, 65);
  });

  // ---------- 客家庄 伙房 courtyard with 米粉 & 柿餅 drying racks in the 九降風 ----------
  const HAKKA_RACKS = [[70, 300, 200], [300, 318, 150]];
  def('hakka', (c, rnd) => {
    vfill(c, 0, 360, [[0, '#3a7ac8'], [0.6, '#8ac0e8'], [1, '#e0f0f0']]);
    for (let i = 0; i < 7; i++) { // wind-combed streaky clouds
      const x = rnd() * W, y = 40 + rnd() * 160;
      c.save(); c.translate(x, y); c.rotate(-0.05);
      for (let k = 0; k < 5; k++) softBlob(c, k * 60 - 120, (rnd() - 0.5) * 10, 140, 12 + rnd() * 8, '#ffffff', 0.55);
      c.restore();
    }
    // terraced hills
    mountain(c, { y: 300, amp: 90, freq: 0.004, seed: 71, col: '#6a9ab0', col2: '#9ac0c8', bottom: 380, haze: '#e0f0f0', hazeA: 0.6 });
    const tp = mountain(c, { y: 350, amp: 110, freq: 0.0035, seed: 72, oct: 3, col: '#6a9a48', col2: '#88a858', bottom: 420, shade: 0.4, light: '#e8f0a0', dark: '#1a3a10',
      paint: (x, p) => { // terrace contour lines
        for (let k = 0; k < 16; k++) {
          x.strokeStyle = rgba(k % 2 ? '#2a4a18' : '#d8e890', 0.28); x.lineWidth = 1.2; x.beginPath();
          for (let i = 0; i < p.length; i += 8) { const yy = p[i + 1] + k * 7 + Math.sin(p[i] * 0.02 + k) * 2; i ? x.lineTo(p[i], yy) : x.moveTo(p[i], yy); }
          x.stroke();
        }
      } });
    // bamboo groves at the far corners
    for (let i = 0; i < 16; i++) bamboo(c, 1060 + rnd() * 220, 380, 200 + rnd() * 120, rnd() < 0.5 ? '#5a8a3a' : '#7aa04a', rnd, (rnd() - 0.5) * 0.25);
    // 伙房: central hall (正身) + two wings (橫屋) in perspective
    const hx = 640, hy = 372;
    const wingL = [[300, 420], [470, 360]], wingR = [[980, 420], [810, 360]];
    for (const wg of [wingL, wingR]) {
      const [[xn, yn], [xf, yf]] = wg, sgn = xn < 640 ? -1 : 1;
      const hn = 110, hf = 80;
      c.fillStyle = lg(c, Math.min(xn, xf), 0, Math.max(xn, xf), 0, sgn < 0 ? [[0, '#f0e8d8'], [1, '#c8bca8']] : [[0, '#b8ac98'], [1, '#e0d8c8']]);
      c.beginPath(); c.moveTo(xn, yn); c.lineTo(xf, yf); c.lineTo(xf, yf - hf); c.lineTo(xn, yn - hn); c.closePath(); c.fill();
      c.fillStyle = '#9a4a34'; c.beginPath(); c.moveTo(xn, yn); c.lineTo(xf, yf); c.lineTo(xf, yf - 14); c.lineTo(xn, yn - 20); c.closePath(); c.fill();
      for (let k = 0; k < 3; k++) { // doors & windows
        const u = 0.15 + k * 0.3, x0 = U.lerp(xn, xf, u), x1 = U.lerp(xn, xf, u + 0.14);
        const fy0 = (xx) => U.lerp(yn, yf, (xx - xn) / (xf - xn)), fh = (xx) => U.lerp(hn, hf, (xx - xn) / (xf - xn));
        c.fillStyle = k === 1 ? '#5a3424' : '#3a2a24';
        const top = k === 1 ? 0.7 : 0.6, bot = k === 1 ? 0 : 0.3;
        c.beginPath(); c.moveTo(x0, fy0(x0) - fh(x0) * bot); c.lineTo(x1, fy0(x1) - fh(x1) * bot); c.lineTo(x1, fy0(x1) - fh(x1) * top); c.lineTo(x0, fy0(x0) - fh(x0) * top); c.closePath(); c.fill();
      }
      // roof (red tile), ridge
      c.fillStyle = lg(c, 0, yn - hn - 40, 0, yn - hn + 6, [[0, '#b0503a'], [1, '#6a2a1e']]);
      c.beginPath(); c.moveTo(xn + sgn * 16, yn - hn + 8); c.lineTo(xf - sgn * 8, yf - hf + 6); c.lineTo(xf, yf - hf - 30); c.lineTo(xn, yn - hn - 40); c.closePath(); c.fill();
      c.strokeStyle = rgba('#3a1008', 0.35); c.lineWidth = 1;
      for (let k = 1; k < 12; k++) { const u = k / 12; c.beginPath(); c.moveTo(U.lerp(xn, xf, u), U.lerp(yn - hn - 40, yf - hf - 30, u)); c.lineTo(U.lerp(xn + sgn * 16, xf - sgn * 8, u), U.lerp(yn - hn + 8, yf - hf + 6, u)); c.stroke(); }
      c.fillStyle = '#7a3020'; c.beginPath(); c.moveTo(xn, yn - hn - 44); c.lineTo(xf, yf - hf - 33); c.lineTo(xf, yf - hf - 27); c.lineTo(xn, yn - hn - 36); c.fill();
    }
    // central hall
    const cw = 340, ch = 100;
    c.fillStyle = lg(c, hx - cw / 2, 0, hx + cw / 2, 0, [[0, '#f4ecdc'], [1, '#d0c4b0']]); c.fillRect(hx - cw / 2, hy - ch, cw, ch);
    c.fillStyle = '#9a4a34'; c.fillRect(hx - cw / 2, hy - 18, cw, 18);
    c.fillStyle = '#5a3424'; c.fillRect(hx - 30, hy - 74, 60, 74);
    c.fillStyle = '#d8382a'; c.fillRect(hx - 46, hy - 74, 10, 60); c.fillRect(hx + 36, hy - 74, 10, 60); c.fillRect(hx - 34, hy - 88, 68, 12);
    c.fillStyle = '#1a1010'; c.font = G.font(9, true); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('彭城堂', hx, hy - 82);
    for (const s of [-1, 1]) { c.fillStyle = '#3a2a24'; c.fillRect(hx + s * 110 - 18, hy - 70, 36, 34); c.strokeStyle = '#8a6a4a'; c.lineWidth = 1; for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(hx + s * 110 - 18 + k * 9, hy - 70); c.lineTo(hx + s * 110 - 18 + k * 9, hy - 36); c.stroke(); } }
    c.fillStyle = lg(c, 0, hy - ch - 46, 0, hy - ch + 6, [[0, '#b8563e'], [1, '#6a2a1e']]);
    c.beginPath(); c.moveTo(hx - cw / 2 - 24, hy - ch + 6); c.lineTo(hx - cw / 2 + 10, hy - ch - 44); c.lineTo(hx + cw / 2 - 10, hy - ch - 44); c.lineTo(hx + cw / 2 + 24, hy - ch + 6); c.closePath(); c.fill();
    c.strokeStyle = rgba('#3a1008', 0.3); for (let k = -20; k <= 20; k++) { c.beginPath(); c.moveTo(hx + k * (cw / 2 - 10) / 20, hy - ch - 44); c.lineTo(hx + k * (cw / 2 + 24) / 20, hy - ch + 6); c.stroke(); }
    c.fillStyle = '#7a3020'; c.fillRect(hx - cw / 2 + 4, hy - ch - 50, cw - 8, 8);
    // 禾埕 drying yard
    groundBase(c, 380, { stops: [[0, '#c8b490'], [0.4, '#b8a07a'], [1, '#7a6448']], seed: 7, light: '#fff0c8', dark: '#5a4428', blots: 90, speckle: 1600, speckCols: ['#7a6040', '#e8d8b0', '#a08860'], speckA: 0.3 });
    // shadows of the wings
    c.fillStyle = rgba('#3a2a14', 0.18); c.beginPath(); c.moveTo(980, 420); c.lineTo(810, 360); c.lineTo(860, 360); c.lineTo(1060, 430); c.closePath(); c.fill();
    // persimmon (柿餅) trays on racks, right side
    for (const [x, y, n] of [[1010, 420, 3], [1170, 440, 3]]) {
      c.fillStyle = '#6a5034'; c.fillRect(x - 70, y - 70, 4, 70); c.fillRect(x + 66, y - 70, 4, 70);
      for (let k = 0; k < n; k++) {
        const ty = y - 18 - k * 22;
        c.fillStyle = '#c8b080'; ellipse(c, x, ty, 66, 10); c.fill();
        c.strokeStyle = '#8a7048'; c.lineWidth = 1.5; ellipse(c, x, ty, 66, 10); c.stroke();
        for (let q = 0; q < 18; q++) { const a = rnd() * TAU, d = Math.sqrt(rnd()); const px = x + Math.cos(a) * d * 58, py = ty + Math.sin(a) * d * 7 - 2; c.fillStyle = rg(c, px, py, 6, [[0, '#ffb050'], [0.6, '#e87020'], [1, '#a04010']], 0, px - 2, py - 2); ellipse(c, px, py, 6, 4); c.fill(); }
      }
    }
    // 米粉 rack frames (strands drawn live)
    for (const [x, top, w] of HAKKA_RACKS) {
      c.fillStyle = '#7a5a34'; c.fillRect(x - 4, top - 6, 6, 432 - top + 6); c.fillRect(x + w, top - 6, 6, 432 - top + 6);
      c.fillStyle = '#a07a4a'; c.fillRect(x - 8, top - 4, w + 18, 5);
    }
    vignette(c, 0.3, '#3a2a10', 0.5);
    grade(c, '#ffe0a0', 0.12, 'soft-light');
    grain(c, rnd, 3500, 0.03);
  }, (ctx, t) => {
    // rice-noodle strands swaying in the wind
    ctx.save(); ctx.lineCap = 'round';
    for (const [x, top, w] of HAKKA_RACKS) {
      for (let i = 0; i < w / 4; i++) {
        const sx = x + 3 + i * 4, L = 70 + U.hash(i, 1, x) * 30, ph = t * 2.2 + i * 0.15;
        const sway = 10 + Math.sin(ph) * 7 + Math.sin(t * 5.3 + i) * 2;
        ctx.strokeStyle = i % 3 ? 'rgba(250,246,232,0.9)' : 'rgba(225,218,196,0.9)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(sx, top); ctx.quadraticCurveTo(sx + sway * 0.3, top + L * 0.5, sx + sway, top + L); ctx.stroke();
      }
    }
    ctx.restore();
    // wind streaks of the 九降風
    windStreaks(ctx, t, 77, 14, 500, 60, 560, 0.3);
    leaves(ctx, t, { n: 12, seed: 78, vx: 160, vy: 30, size: 5, cols: ['#c8a040', '#e08a30', '#8aa040'], sway: 30 });
  });

  // ---------- 五指山風穴: wind cave with howling streaks ----------
  def('windcave', (c, rnd) => {
    vfill(c, 0, H, [[0, '#0a0e14'], [1, '#05070a']]);
    // opening to the sky at the back with the five-finger peaks
    // sky seen through the cave mouth (rock walls are painted over everything else)
    vfill(c, 0, 420, [[0, '#3a5a8a'], [0.6, '#8aa8c8'], [1, '#c8d8e0']]);
    cloud(c, 560, 150, 300, 40, { top: '#e0e8f0', bot: '#8a9ab0', a: 0.8, seed: 3 });
    const fp = []; // 五指山: five finger-like peaks
    for (let xx = 340; xx <= 940; xx += 3) {
      let y = 384 - fbm(xx * 0.03, 7, 4, true) * 18;
      for (let k = 0; k < 5; k++) { const px = 466 + k * 84, ph = [130, 170, 200, 160, 115][k]; y -= ph * Math.exp(-Math.abs(xx - px) / 20) * (0.88 + fbm(xx * 0.05, k + 3, 3) * 0.25); }
      fp.push(xx, y);
    }
    mountain(c, { p: fp, col: '#4a5a6a', col2: '#6a7a88', bottom: 420, shade: 0.7, light: '#d8e8f0', dark: '#1a2a3a', haze: '#c8d8e0', hazeA: 0.5, facetWin: 4 });
    c.fillStyle = lg(c, 0, 330, 0, 420, [[0, rgba('#c8d8e0', 0)], [1, rgba('#c8d8e0', 0.8)]]); c.fillRect(340, 330, 600, 90);
    // rock walls & ceiling, layered rims
    const rockRim = (pts, col, rim) => { c.fillStyle = col; c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fill(); if (rim) { c.strokeStyle = rgba(rim, 0.35); c.lineWidth = 2; c.stroke(); } };
    const r = U.seeded(81);
    const jag = (x0, y0, x1, y1, n, amp) => { const a = []; for (let i = 0; i <= n; i++) { const u = i / n; a.push(U.lerp(x0, x1, u) + (r() - 0.5) * amp, U.lerp(y0, y1, u) + (r() - 0.5) * amp); } return a; };
    rockRim([-10, -10, ...jag(-10, 600, 420, 430, 6, 30), ...jag(380, 420, 360, 160, 6, 40), ...jag(420, 80, 640, 40, 6, 30), ...jag(860, 40, 920, 200, 6, 40), ...jag(900, 420, W + 10, 600, 6, 30), W + 10, -10], '#1a1e26', '#8aa0c0');
    for (let i = 0; i < 500; i++) { const x = r() * W, y = r() * 440; if (x > 380 && x < 900 && y > 80 && y < 420) continue; c.fillStyle = rgba(r() < 0.5 ? '#4a5a6a' : '#000000', 0.15); ellipse(c, x, y, 6 + r() * 30, 3 + r() * 10, r()); c.fill(); }
    for (let i = 0; i < 9; i++) { const x = 60 + r() * 1160; if (x > 360 && x < 920) continue; c.fillStyle = '#12161c'; c.beginPath(); c.moveTo(x - 12, 0); c.lineTo(x + 12, 0); c.lineTo(x + 2, 60 + r() * 120); c.closePath(); c.fill(); }
    // lichen glints
    for (let i = 0; i < 80; i++) { const x = r() * W, y = r() * 430; if (x > 380 && x < 900 && y > 80) continue; c.fillStyle = rgba('#7ac0a0', 0.25); circle(c, x, y, 1 + r() * 2); c.fill(); }
    // floor of the cave
    groundBase(c, 410, { stops: [[0, '#4a525a'], [0.3, '#30363e'], [1, '#101418']], seed: 82, light: '#a0c0d8', blots: 120, speckle: 1400, speckCols: ['#000000', '#6a7a88', '#a8b8c8'], speckA: 0.35 });
    c.fillStyle = rg(c, 640, 430, 400, [[0, rgba('#c8d8e0', 0.25)], [1, rgba('#c8d8e0', 0)]]); c.fillRect(0, 400, W, 320);
    rock(c, 120, 520, 120, 70, ['#4a525a', '#2a3038', '#0a0c10'], rnd);
    rock(c, 1180, 540, 140, 80, ['#4a525a', '#2a3038', '#0a0c10'], rnd);
    // the cracked eternal lamp on its pillar, back centre
    c.fillStyle = lg(c, 624, 0, 656, 0, [[0, '#6a6a70'], [1, '#2a2a30']]); c.fillRect(626, 330, 28, 86);
    c.fillStyle = '#4a4a52'; c.fillRect(612, 322, 56, 10); c.fillRect(616, 410, 48, 8);
    c.fillStyle = '#9ad0ff'; c.beginPath(); c.moveTo(616, 322); c.lineTo(640, 290); c.lineTo(664, 322); c.closePath(); c.fill();
    c.strokeStyle = '#1a2a3a'; c.lineWidth = 2; c.beginPath(); c.moveTo(640, 292); c.lineTo(634, 304); c.lineTo(646, 312); c.lineTo(638, 322); c.stroke();
    glow(c, 640, 306, 120, '#6ab8ff', 0.5);
    vignette(c, 0.7, '#000000', 0.35);
    grain(c, rnd, 4000, 0.04);
  }, (ctx, t) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const p = flick(t, 4, 0.6);
    lglow(ctx, 640, 306, 180, '#4a9aff', 0.35 * p);
    lglow(ctx, 640, 306, 26, '#e0f4ff', 0.9 * p, true);
    ctx.restore();
    // howling streaks spiralling into the cracked lamp
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const h1 = U.hash(i, 1, 83), h2 = U.hash(i, 2, 83);
      const ph = mod(t * (0.35 + h2 * 0.3) + h1, 1);
      const a0 = h1 * TAU + t * 0.6, R = (1 - ph) * (500 + h2 * 300);
      const x0 = 640 + Math.cos(a0) * R * 1.4, y0 = 306 + Math.sin(a0) * R * 0.5;
      const a1 = a0 + 0.5, R1 = R * 0.85;
      const x1 = 640 + Math.cos(a1) * R1 * 1.4, y1 = 306 + Math.sin(a1) * R1 * 0.5;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.45; ctx.strokeStyle = i % 4 ? '#c8e0f0' : '#6ab8ff'; ctx.lineWidth = 1 + h2 * 2.5;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + (y1 - y0) * 0.3, (y0 + y1) / 2 - (x1 - x0) * 0.15, x1, y1); ctx.stroke();
    }
    ctx.restore();
    motes(ctx, t, { n: 40, seed: 84, x: 0, y: 100, w: W, h: 600, vx: 140, vy: -20, r: 3, col: '#c8d8e8', a: 0.5, tw: 3, wob: 10, add: false, hard: true });
    mist(ctx, t, 'wind1', '#8aa0b8', 380, 140, 0.35, 90, 30, 85);
  });

  // ---------- 阿里山: giant cypress forest above the sea of clouds ----------
  def('alishan', (c, rnd) => {
    vfill(c, 0, 360, [[0, '#4a6aa8'], [0.45, '#c8a0b0'], [0.8, '#ffd0a0'], [1, '#fff0c8']]);
    sun(c, 720, 250, 28, '#fffbe8', '#ffd090', 0.6);
    // distant peaks above the sea of clouds
    mountain(c, { y: 270, amp: 90, freq: 0.004, seed: 91, ridged: true, col: '#6a6a9a', col2: '#9a8aaa', bottom: 330, shade: 0.5, light: '#ffd8c0', dark: '#2a2a50', haze: '#ffe0d0', hazeA: 0.5, rim: '#fff0d8', rimA: 0.4 });
    // sea of clouds
    for (let k = 0; k < 4; k++) for (let i = 0; i < 7; i++) cloud(c, i * 210 - 40 + rnd() * 80, 300 + k * 18, 280 + rnd() * 100, 50 + rnd() * 20, { top: '#ffffff', mid: '#fff4ec', bot: '#c8c0d8', hi: '#fff0d0', hiA: 0.6, seed: k * 10 + i, a: 0.95, rim: '#ffd8a0', rimSide: i * 210 < 720 ? 'right' : 'left', rimA: 0.4 });
    vfill(c, 340, 400, [[0, rgba('#f0e8f0', 0)], [1, rgba('#e8e0ec', 0.8)]]);
    // mid forest ridge
    mountain(c, { y: 400, amp: 50, freq: 0.006, seed: 92, col: '#2a4a3a', col2: '#1e3a2e', bottom: 440, trees: { kind: 'pine', size: 10, gap: 8, seed: 3 } });
    // forest floor
    groundBase(c, 420, { stops: [[0, '#4a5a3a'], [0.3, '#3a4a2e'], [1, '#18200f']], seed: 93, light: '#d0e0a0', dark: '#0a1006', blots: 140, speckle: 1600, speckCols: ['#0a1006', '#6a7a4a', '#a8b870'] });
    c.fillStyle = lg(c, 0, 430, 0, H, [[0, rgba('#a08a6a', 0.35)], [1, rgba('#7a6a50', 0.5)]]);
    c.beginPath(); c.moveTo(560, 425); c.quadraticCurveTo(700, 520, 600, 720); c.lineTo(900, 720); c.quadraticCurveTo(820, 520, 680, 425); c.closePath(); c.fill();
    grass(c, rnd, 430, 720, 400, ['#4a6a38', '#6a8a48', '#2e4420'], { h: 14 });
    for (const x of [380, 960, 1060, 260]) treeFern(c, x, 450 + rnd() * 20, 120 + rnd() * 40, '#2a4a2a', rnd);
    // giant 紅檜 trunks framing the scene (神木 at left)
    const trunk = (x, w, lean) => {
      c.fillStyle = lg(c, x - w, 0, x + w, 0, [[0, '#7a4a34'], [0.3, '#a0624a'], [0.7, '#5a3424'], [1, '#2a160e']]);
      c.beginPath(); c.moveTo(x - w * 1.8, H); c.quadraticCurveTo(x - w * 1.0, H - 120, x - w * 0.9 + lean, H - 300); c.lineTo(x - w * 0.8 + lean * 2, -20); c.lineTo(x + w * 0.8 + lean * 2, -20); c.lineTo(x + w * 0.9 + lean, H - 300); c.quadraticCurveTo(x + w * 1.0, H - 120, x + w * 1.8, H); c.closePath(); c.fill();
      c.strokeStyle = rgba('#2a140a', 0.45); c.lineWidth = 2;
      for (let k = -4; k <= 4; k++) { c.beginPath(); c.moveTo(x + k * w * 0.4, H); c.bezierCurveTo(x + k * w * 0.25 + lean, H - 250, x + k * w * 0.2 + lean * 1.5, 200, x + k * w * 0.18 + lean * 2, -20); c.stroke(); }
      c.strokeStyle = rgba('#ffd0a0', 0.25); c.lineWidth = 3; c.beginPath(); c.moveTo(x - w * 0.85 + lean, H - 300); c.lineTo(x - w * 0.78 + lean * 2, -20); c.stroke();
      for (let k = 0; k < 10; k++) softBlob(c, x + (rnd() - 0.5) * w * 1.2, 260 + rnd() * 440, 10 + rnd() * 14, 20 + rnd() * 40, '#7a9a4a', 0.2);
    };
    trunk(90, 110, 10); trunk(1210, 80, -8); trunk(1040, 34, 4);
    // cypress foliage sprays overhead
    for (let i = 0; i < 22; i++) { const x = rnd() * W, y = rnd() * 70; c.fillStyle = rgba(i % 2 ? '#1e3a2a' : '#2a4a34', 0.95); ellipse(c, x, y, 70 + rnd() * 70, 20 + rnd() * 20, (rnd() - 0.5) * 0.4); c.fill(); }
    vignette(c, 0.4, '#1a1008', 0.5);
    grain(c, rnd, 3500, 0.03);
  }, (ctx, t) => {
    mist(ctx, t, 'ali1', '#ffffff', 270, 120, 0.6, 6, 40, 94);
    mist(ctx, t, 'ali2', '#fff4ea', 320, 110, 0.5, -4, 40, 95);
    mist(ctx, t, 'ali3', '#e8f0e0', 470, 140, 0.25, 8, 30, 96);
    motes(ctx, t, { n: 24, seed: 97, x: 200, y: 100, w: 900, h: 500, vx: 3, vy: -4, r: 5, col: '#fff0c0', a: 0.4, tw: 2, wob: 30 });
    leaves(ctx, t, { n: 6, seed: 98, vx: 10, vy: 20, size: 4, cols: ['#5a7a3a', '#8a7a3a'], sway: 30 });
  });

  // ---------- 玉山 high trail at night ----------
  def('yushan', (c, rnd) => {
    vfill(c, 0, 420, [[0, '#02030a'], [0.5, '#0a1028'], [0.9, '#1e2a4a'], [1, '#2a3858']]);
    milkyWay(c, rnd, 300, 0, 1000, 420, 170, '#b8c8ff', 0.13);
    stars(c, 420, rnd, 380, { a: 1, big: 2 });
    // 玉山 main peak: steep pyramid with scree flanks, moonlit
    const ys = (x) => -230 * Math.exp(-Math.pow((x - 700) / 150, 2)) - 120 * Math.exp(-Math.pow((x - 960) / 140, 2)) - 90 * Math.exp(-Math.pow((x - 380) / 160, 2));
    mountain(c, { y: 420, amp: 50, freq: 0.01, seed: 101, ridged: true, shape: ys, col: '#2a3450', col2: '#141a2c', bottom: 440, shade: 0.9, light: '#c8d8ff', dark: '#000000', rim: '#e0e8ff', rimA: 0.55, tex: 120, facetWin: 5 });
    mountain(c, { y: 430, amp: 80, freq: 0.005, seed: 102, ridged: true, col: '#0e1220', col2: '#0a0e18', bottom: 460, shade: 0.5, light: '#6a7ab0', dark: '#000000', rim: '#8a9ad0', rimA: 0.3 });
    // rocky trail ground
    const gp = profile({ y: 450, amp: 30, freq: 0.005, seed: 103, oct: 3 });
    layer(c, (x) => { pathProfile(x, gp); x.fillStyle = lg(x, 0, 420, 0, H, [[0, '#3a4058'], [0.4, '#2a2e40'], [1, '#0e1018']]); x.fill(); }, (x) => {
      const r = U.seeded(104);
      for (let i = 0; i < 160; i++) { const d = r(), y = 430 + d * d * 300, s = 4 + d * 22; rock(x, r() * W, y, s * 1.4, s * 0.7, ['#5a6080', '#3a3e54', '#14161e'], r); }
      speckle(x, r, 430, H, 1200, ['#000000', '#8a90b0'], 0.35);
      x.fillStyle = lg(x, 0, 430, 0, H, [[0, rgba('#b8c8ff', 0.12)], [1, rgba('#b8c8ff', 0)]]); x.fillRect(0, 420, W, 300);
    });
    // dwarf junipers (玉山圓柏), twisted
    const juniper = (x, y, s) => {
      c.strokeStyle = '#2a2420'; c.lineCap = 'round'; c.lineWidth = 6 * s;
      c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + 30 * s, y - 20 * s, x - 10 * s, y - 50 * s, x + 40 * s, y - 70 * s); c.stroke();
      for (let k = 0; k < 7; k++) { const px = x + (rnd() - 0.2) * 80 * s, py = y - 40 * s - rnd() * 50 * s; c.fillStyle = rg(c, px, py, 26 * s, [[0, '#4a5a68'], [1, '#141c22']], 0, px - 8 * s, py - 10 * s); ellipse(c, px, py, 30 * s, 16 * s, -0.2); c.fill(); }
    };
    juniper(40, 640, 1.6); juniper(1150, 620, 1.4); juniper(260, 470, 0.7); juniper(980, 470, 0.6);
    vignette(c, 0.6, '#000000', 0.4);
    grain(c, rnd, 4000, 0.035);
  }, (ctx, t) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 24; i++) { const a = Math.max(0, Math.sin(t * (0.8 + U.hash(i, 2, 105) * 2) + i * 3)); lglow(ctx, U.hash(i, 1, 105) * W, U.hash(i, 3, 105) * 300, 7, '#ffffff', a * 0.7, true); }
    // occasional shooting star
    const cyc = mod(t, 7), k = Math.floor(t / 7);
    if (cyc < 0.8) {
      const sx = 200 + U.hash(k, 1, 106) * 800, sy = 40 + U.hash(k, 2, 106) * 120, p = cyc / 0.8;
      ctx.globalAlpha = Math.sin(p * Math.PI) * 0.8; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx + p * 260, sy + p * 110); ctx.lineTo(sx + p * 260 - 80, sy + p * 110 - 34); ctx.stroke();
    }
    ctx.restore();
    mist(ctx, t, 'yu1', '#6a7ab0', 400, 90, 0.3, 12, 30, 107);
    motes(ctx, t, { n: 24, seed: 108, x: 0, y: 200, w: W, h: 500, vx: 60, vy: 10, r: 2.5, col: '#e8f0ff', a: 0.5, tw: 3, wob: 10, add: false });
  });

  // ---------- 北港 媽祖遶境 night street: firecracker smoke, temple lights, banners ----------
  const PROC_STR = [];
  def('procession', (c, rnd) => {
    PROC_STR.length = 0;
    const vx = 640, vy = 320;
    vfill(c, 0, 360, [[0, '#0c0a1e'], [0.6, '#2a1430'], [1, '#6a2a2a']]);
    stars(c, 30, rnd, 100, { a: 0.4 });
    // the temple (朝天宮) blazing with light at the end of the street
    glow(c, vx, vy - 20, 360, '#ffb050', 0.45);
    templeHall(c, vx, vy + 30, 240, 80, { double: true, orn: '#ffd060', tile: '#5a3a2a', ridge: '#e05030', wall: '#a03a26', lit: '#ffd080', plaque: '朝天宮' });
    // giant 千里眼 / 順風耳 figures far down the street, flanked by the crowd
    for (const [x, face] of [[560, '#3a8a4a'], [724, '#c03a2a']]) {
      c.fillStyle = '#2a1a1a'; c.beginPath(); c.moveTo(x - 20, vy + 40); c.lineTo(x - 14, vy - 30); c.lineTo(x + 14, vy - 30); c.lineTo(x + 20, vy + 40); c.fill();
      c.fillStyle = face; circle(c, x, vy - 38, 9); c.fill();
      c.fillStyle = '#d8a840'; c.fillRect(x - 10, vy - 50, 20, 5);
    }
    const L = streetSide(c, -1, { vx, vy, n: 8, k: 0.55, topN: 20, botN: 470, cols: ['#7a3a2c', '#8a6a52', '#6a4a3a', '#9a7a6a'], night: true, seed: 5, signs: ['香舖', '餅行', '金紙', '布莊', '油行', '糕仔'] });
    const R = streetSide(c, 1, { vx, vy, n: 8, k: 0.55, topN: 0, botN: 470, cols: ['#8a6a52', '#7a3a2c', '#6a5a4a', '#9a4a34'], night: true, seed: 11, signs: ['麻油', '香燭', '客棧', '米行', '進香', '藥舖'] });
    c.fillStyle = lg(c, 0, vy, 0, H, [[0, '#3a2420'], [0.3, '#4a2e28'], [1, '#24140f']]);
    c.beginPath(); c.moveTo(L.xs[8], L.at(L.xs[8], 470)); c.lineTo(R.xs[8], R.at(R.xs[8], 470)); c.lineTo(W + 80, 470); c.lineTo(W + 80, H); c.lineTo(-80, H); c.lineTo(-80, 470); c.closePath(); c.fill();
    c.save(); c.beginPath(); c.moveTo(vx, vy); c.lineTo(W + 600, H); c.lineTo(-600, H); c.closePath(); c.clip();
    pavers(c, vy + 30, H, 16, { gap: '#140a08', light: '#ffc090', dark: '#000000', var: 0.08, hi: 0.08, seed: 13, w0: 10, w1: 120, pow: 2 });
    c.restore();
    // crowd silhouettes far down the street
    for (let i = 0; i < 70; i++) { const x = 470 + rnd() * 340, y = vy + 30 + rnd() * 26, s = 0.5 + (y - vy) / 60; c.fillStyle = '#140808'; circle(c, x, y - 12 * s, 4 * s); c.fill(); c.fillRect(x - 4 * s, y - 9 * s, 8 * s, 12 * s); }
    // spent firecracker paper all over the street
    for (let i = 0; i < 900; i++) { const d = rnd(), y = vy + 40 + d * d * (H - vy - 40), x = rnd() * W; c.fillStyle = rgba(rnd() < 0.85 ? '#d8281a' : '#ffd060', 0.6 + rnd() * 0.4); c.save(); c.translate(x, y); c.rotate(rnd() * 3); c.fillRect(0, 0, 1.5 + d * 4, 1 + d * 2.5); c.restore(); }
    c.fillStyle = rg(c, 640, 480, 600, [[0, rgba('#ffa050', 0.25)], [1, rgba('#ffa050', 0)]]); c.fillRect(0, 300, W, 420);
    // lantern strings
    for (let k = 1; k < 6; k++) {
      const xl = L.xs[k], xr = R.xs[k];
      const yl = U.lerp(L.at(xl, 470), L.at(xl, 20), 0.85), yr = U.lerp(R.at(xr, 470), R.at(xr, 0), 0.85), sag = 40 / k;
      c.strokeStyle = '#140a08'; c.lineWidth = Math.max(0.8, 2.5 / k);
      c.beginPath(); c.moveTo(xl, yl); c.quadraticCurveTo((xl + xr) / 2, (yl + yr) / 2 + sag * 2, xr, yr); c.stroke();
      const n = 6 + k;
      for (let j = 1; j < n; j++) {
        const f = j / n, x = (1 - f) * (1 - f) * xl + 2 * (1 - f) * f * (xl + xr) / 2 + f * f * xr;
        const y = (1 - f) * (1 - f) * yl + 2 * (1 - f) * f * ((yl + yr) / 2 + sag * 2) + f * f * yr, r = 13 / Math.pow(k, 0.9);
        if (k === 1) PROC_STR.push([x, y, r]);
        else { lanternShape(c, x, y + r * 1.6, r, j % 3 ? '#e03a2a' : '#f0b030', 1, { tassel: r > 5 }); glow(c, x, y + r * 1.6, r * 5, '#ff9a3a', 0.35); }
      }
    }
    vignette(c, 0.5, '#0a0408', 0.42);
    grain(c, rnd, 4000, 0.03);
  }, (ctx, t) => {
    for (let i = 0; i < PROC_STR.length; i++) hangLantern(ctx, t, PROC_STR[i][0], PROC_STR[i][1], i % 3 ? '#e03a2a' : '#f0b030', PROC_STR[i][2], i + 9, { glowR: 80, glowA: 0.45, sway: 0.1, char: i % 2 ? '媽' : '祖' });
    // 進香旗 pilgrim flags bobbing in the crowd
    for (let i = 0; i < 6; i++) {
      const x = [90, 210, 330, 950, 1070, 1190][i], base = 520 + (i % 3) * 30, bob = Math.sin(t * 2 + i * 1.7) * 6;
      const y = base - 330 + bob;
      ctx.fillStyle = '#3a2418'; ctx.fillRect(x - 2, y, 4, 230);
      ctx.save(); ctx.translate(x + 2, y + 4);
      const wv = Math.sin(t * 4 + i) * 6;
      ctx.fillStyle = i % 2 ? '#f0c020' : '#d8281a';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(40, wv, 86, 22 + wv * 0.5); ctx.quadraticCurveTo(40, 40 - wv, 0, 64); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = i % 2 ? '#d8281a' : '#f0c020'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = i % 2 ? '#7a1010' : '#ffe080'; ctx.font = G.font(15, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('進', 22, 18 + wv * 0.3); ctx.fillText('香', 22, 40 + wv * 0.2);
      ctx.restore();
    }
    // firecracker bursts: crackle of sparks + flash, then rolling smoke
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let b = 0; b < 5; b++) {
      const cyc = 2.4 + b * 0.37, ph = mod(t + b * 0.83, cyc) / cyc, k = Math.floor((t + b * 0.83) / cyc);
      const bx = 140 + U.hash(k, b, 141) * 1000, by = 360 + U.hash(k, b + 9, 141) * 120;
      if (ph < 0.35) {
        const q = ph / 0.35;
        lglow(ctx, bx, by, 80 * (1 - q) + 20, '#fff0b0', 0.6 * (1 - q));
        for (let s = 0; s < 16; s++) {
          const a = U.hash(s, k, b) * TAU, sp = 40 + U.hash(s, k + 1, b) * 90;
          lglow(ctx, bx + Math.cos(a) * sp * q, by + Math.sin(a) * sp * q + q * q * 30, 5, s % 3 ? '#ffd060' : '#ff6a2a', 0.9 * (1 - q), true);
        }
      }
    }
    ctx.restore();
    for (let b = 0; b < 5; b++) {
      const cyc = 2.4 + b * 0.37, ph = mod(t + b * 0.83, cyc) / cyc, k = Math.floor((t + b * 0.83) / cyc);
      const bx = 140 + U.hash(k, b, 141) * 1000, by = 360 + U.hash(k, b + 9, 141) * 120;
      ctx.save(); lglow(ctx, bx + ph * 60, by - ph * 80, 40 + ph * 110, '#d8c8c0', 0.32 * Math.sin(Math.min(1, ph * 1.2) * Math.PI)); ctx.restore();
    }
    mist(ctx, t, 'proc1', '#c8b0a8', 330, 160, 0.45, 14, 40, 142);
    mist(ctx, t, 'proc2', '#a89088', 470, 150, 0.35, -9, 40, 143);
    leaves(ctx, t, { n: 24, seed: 144, vx: 20, vy: 50, size: 3, cols: ['#e0281a', '#c81a10', '#ffd060'], shape: 'bit', sway: 30, a: 0.9 });
  });

  // ---------- 打狗 harbour, 旗後 fishing boats ----------
  function sampan(c, x, y, s, col) {
    c.fillStyle = col; c.beginPath(); c.moveTo(x - 50 * s, y - 12 * s); c.quadraticCurveTo(x - 30 * s, y + 6 * s, x, y + 6 * s); c.quadraticCurveTo(x + 36 * s, y + 6 * s, x + 54 * s, y - 14 * s); c.lineTo(x + 40 * s, y - 6 * s); c.lineTo(x - 36 * s, y - 6 * s); c.closePath(); c.fill();
    c.fillStyle = rgba('#ffffff', 0.25); c.fillRect(x - 36 * s, y - 6 * s, 76 * s, 2 * s);
    c.fillStyle = '#c84a2a'; c.fillRect(x - 36 * s, y - 2 * s, 76 * s, 2.5 * s);
    c.fillStyle = '#e8dcc0'; c.beginPath(); c.moveTo(x - 14 * s, y - 6 * s); c.lineTo(x - 10 * s, y - 22 * s); c.lineTo(x + 18 * s, y - 22 * s); c.lineTo(x + 22 * s, y - 6 * s); c.fill();
    c.fillStyle = '#5a4030'; c.fillRect(x - 12 * s, y - 24 * s, 32 * s, 3 * s);
  }
  def('south', (c, rnd) => {
    vfill(c, 0, 330, [[0, '#2a7ad0'], [0.6, '#7ac0ec'], [1, '#d8f0f4']]);
    sun(c, 1000, 80, 26, '#fffef0', '#fff0c0', 0.4);
    cloud(c, 360, 150, 460, 80, { top: '#ffffff', bot: '#b8cce4', seed: 2, rim: '#fffbe8', rimSide: 'right' });
    cloud(c, 820, 210, 320, 50, { top: '#ffffff', bot: '#c0d0e4', seed: 5 });
    // 半屏山 (the half-cut mountain) far left, 旗後山 with its small lighthouse on the right
    mountain(c, { y: 316, amp: 20, freq: 0.01, seed: 151, x1: 520, shape: (x) => (x < 380 ? -Math.min(1, (x + 20) / 160) * 70 : -70 + (x - 380) * 0.5), col: '#6a94a8', col2: '#8ab0bc', bottom: 330, shade: 0.4, light: '#ffffff', dark: '#2a4a5a', haze: '#d8f0f4', hazeA: 0.5 });
    const kp = profile({ y: 320, amp: 30, freq: 0.006, seed: 152, x0: 840, oct: 3, shape: (x) => -Math.exp(-Math.pow((x - 1040) / 160, 2)) * 120 });
    mountain(c, { p: kp, col: '#3a6a3a', col2: '#2a4a2a', bottom: 340, shade: 0.5, light: '#d0f0a0', dark: '#0a2010', trees: { kind: 'round', size: 8, gap: 10, seed: 6 } });
    c.fillStyle = '#f4f0e8'; c.fillRect(1032, 168, 14, 34); c.fillStyle = '#2a2a2a'; c.fillRect(1030, 160, 18, 10); c.beginPath(); c.moveTo(1030, 160); c.lineTo(1039, 152); c.lineTo(1048, 160); c.fill();
    // harbour water
    water(c, 326, 440, { stops: [[0, '#8ac8e0'], [0.2, '#3a8ab8'], [1, '#1a5a80']], light: '#ffffff', dark: '#0a3050', seed: 153, streaks: 260, path: { x: 1000, col: '#ffffff', a: 0.6, w0: 8, w1: 120, n: 90 } });
    // fishing village roofs along the far shore
    for (let i = 0; i < 14; i++) { const x = 560 + i * 26, y = 330; c.fillStyle = i % 3 ? '#a04a34' : '#5a4a44'; c.beginPath(); c.moveTo(x - 14, y); c.lineTo(x, y - 12); c.lineTo(x + 14, y); c.fill(); c.fillStyle = '#e8dcc8'; c.fillRect(x - 11, y, 22, 8); }
    // dock planks (ground)
    c.fillStyle = lg(c, 0, 430, 0, H, [[0, '#a07a54'], [0.4, '#8a6644'], [1, '#4a3424']]); c.fillRect(0, 430, W, 290);
    perspLines(c, 430, H, 640, 120, Array.from({ length: 40 }, (_, k) => -400 + k * 52), '#3a2414', 0.55, 1.5);
    courses(c, 430, H, 5, '#3a2414', 0.35, 1.6, 2);
    c.fillStyle = lg(c, 0, 426, 0, 446, [[0, '#c8a070'], [1, '#5a3a24']]); c.fillRect(0, 428, W, 10);
    for (const x of [80, 400, 880, 1200]) { c.fillStyle = lg(c, x - 9, 0, x + 9, 0, [[0, '#8a6a4a'], [1, '#3a2414']]); c.fillRect(x - 9, 380, 18, 60); c.fillStyle = '#c8a070'; ellipse(c, x, 380, 9, 3); c.fill(); }
    // drying fishing nets & baskets
    c.strokeStyle = rgba('#3a3a2a', 0.5); c.lineWidth = 1;
    for (let k = 0; k < 10; k++) { c.beginPath(); c.moveTo(980 + k * 10, 370); c.quadraticCurveTo(1030 + k * 8, 420, 1080 + k * 10, 372); c.stroke(); }
    for (const [x, y] of [[180, 500], [1120, 520]]) { c.fillStyle = lg(c, x - 24, 0, x + 24, 0, [[0, '#d0b070'], [1, '#7a5a30']]); ellipse(c, x, y, 24, 16); c.fill(); c.strokeStyle = '#5a3a20'; c.lineWidth = 1; for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x + k * 8, y - 14); c.lineTo(x + k * 9, y + 14); c.stroke(); } }
    // coconut palms framing
    palm(c, 60, 470, 360, '#2a5a2a', rnd, 0.12);
    palm(c, 1220, 480, 400, '#2a5a2a', rnd, -0.1);
    c.fillStyle = rgba('#2a1a10', 0.18); ellipse(c, 640, 520, 700, 40); c.fill();
    vignette(c, 0.25, '#1a2a30', 0.5);
    grade(c, '#fff0c0', 0.1, 'soft-light');
    grain(c, rnd, 3000, 0.025);
  }, (ctx, t) => {
    waveGlints(ctx, t, { n: 80, seed: 154, y0: 328, y1: 430, cx: 1000, w0: 30, w1: 300, col: '#ffffff', a: 0.9, len: 12 });
    for (let i = 0; i < 4; i++) {
      const x = [220, 460, 720, 900][i], y = 360 + (i % 2) * 30, s = 0.6 + (y - 340) / 120;
      ctx.save(); ctx.translate(x, y + Math.sin(t * 1.3 + i) * 2); ctx.rotate(Math.sin(t * 1.1 + i * 2) * 0.03);
      sampan(ctx, 0, 0, s, ['#3a5a7a', '#5a3a2a', '#2a6a6a', '#6a4a3a'][i]);
      ctx.restore();
    }
    ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8;
    for (let i = 0; i < 5; i++) {
      const a = t * (0.3 + i * 0.05) + i * 2, x = 640 + Math.cos(a) * (200 + i * 60), y = 170 + i * 20 + Math.sin(a * 1.3) * 30, f = Math.sin(t * 5 + i) * 5;
      ctx.beginPath(); ctx.moveTo(x - 12, y - f); ctx.quadraticCurveTo(x - 4, y - 3, x, y); ctx.quadraticCurveTo(x + 4, y - 3, x + 12, y - f); ctx.stroke();
    }
    ctx.restore();
  });

  // ---------- 王船 deck at sea: sails and banners ----------
  function wangDeck() {
    return fullLayer('wangDeck', (c) => {
      const r = U.seeded(162), y0 = 420;
      // red-and-gold carved bulwark (back rail)
      c.fillStyle = lg(c, 0, y0 - 50, 0, y0 + 10, [[0, '#c8302a'], [1, '#6a1410']]);
      c.beginPath(); c.moveTo(-40, y0 - 30); c.quadraticCurveTo(640, y0 - 60, W + 40, y0 - 30); c.lineTo(W + 40, y0 + 10); c.quadraticCurveTo(640, y0 - 20, -40, y0 + 10); c.closePath(); c.fill();
      c.strokeStyle = '#e8b840'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(-40, y0 - 30); c.quadraticCurveTo(640, y0 - 60, W + 40, y0 - 30); c.stroke();
      for (let k = 0; k < 16; k++) { const x = k * 84 + 20; c.strokeStyle = rgba('#f0c860', 0.7); c.lineWidth = 2; circle(c, x, y0 - 22 - Math.sin(k / 15 * Math.PI) * 14, 8); c.stroke(); }
      // deck planks
      c.fillStyle = lg(c, 0, y0, 0, H, [[0, '#b0844e'], [0.5, '#946a3c'], [1, '#5a3c20']]);
      c.beginPath(); c.moveTo(-40, y0 + 8); c.quadraticCurveTo(640, y0 - 22, W + 40, y0 + 8); c.lineTo(W + 40, H); c.lineTo(-40, H); c.closePath(); c.fill();
      for (let k = -16; k <= 16; k++) { c.strokeStyle = rgba('#3a2410', 0.5); c.lineWidth = 1.4; c.beginPath(); c.moveTo(640 + k * 36, y0 - 6); c.lineTo(640 + k * 110, H); c.stroke(); }
      for (let i = 0; i < 260; i++) { c.fillStyle = rgba(r() < 0.5 ? '#3a2410' : '#e8c08a', 0.07); c.fillRect(r() * W, y0 + r() * (H - y0), 20 + r() * 70, 1); }
      // masts (sails drawn behind are on this layer too)
      const sail = (mx, top, w, h) => {
        c.fillStyle = lg(c, mx - 6, 0, mx + 6, 0, [[0, '#8a5a34'], [1, '#3a2010']]); c.fillRect(mx - 6, top - 30, 12, y0 - top + 10);
        c.fillStyle = lg(c, mx, top, mx + w, top + h, [[0, '#e8743a'], [0.5, '#d0502a'], [1, '#8a2a14']]);
        c.beginPath(); c.moveTo(mx - w * 0.15, top); c.quadraticCurveTo(mx + w * 0.4, top - 20, mx + w * 0.85, top + 6); c.lineTo(mx + w, top + h); c.lineTo(mx - w * 0.1, top + h); c.closePath(); c.fill();
        for (let k = 0; k < 7; k++) { // bellied panels between battens
          const y0 = top + h * k / 7, y1 = top + h * (k + 1) / 7;
          c.fillStyle = lg(c, 0, y0, 0, y1, [[0, rgba('#ffffff', 0.12)], [0.6, rgba('#000000', 0)], [1, rgba('#3a1004', 0.25)]]);
          c.beginPath(); c.moveTo(mx - w * 0.13, y0); c.lineTo(mx + w * (0.86 + k * 0.02), y0 - 6); c.lineTo(mx + w * (0.88 + k * 0.02), y1 - 6); c.lineTo(mx - w * 0.12, y1); c.closePath(); c.fill();
        }
        c.strokeStyle = rgba('#3a1408', 0.6); c.lineWidth = 2.5;
        for (let k = 1; k < 7; k++) { const yy = top + h * k / 7; c.beginPath(); c.moveTo(mx - w * 0.13, yy); c.lineTo(mx + w * (0.86 + k * 0.02), yy - 6); c.stroke(); }
        // painted eight-trigram roundel
        c.strokeStyle = '#f0d070'; c.lineWidth = 3; circle(c, mx + w * 0.42, top + h * 0.45, h * 0.16); c.stroke();
        c.fillStyle = '#f0d070'; c.font = G.font(Math.round(h * 0.15), true); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('王', mx + w * 0.42, top + h * 0.45);
      };
      sail(150, 40, 230, 260); sail(980, 60, 220, 230);
      // stern-castle lantern posts
      for (const x of [40, 1240]) { c.fillStyle = '#6a1a10'; c.fillRect(x - 8, y0 - 160, 16, 160); c.fillStyle = '#e8b840'; c.fillRect(x - 12, y0 - 166, 24, 8); }
      // soft sail shadows across the planks, rope coils, a small offering table at the stern
      softBlob(c, 300, 520, 300, 50, '#2a1408', 0.25); softBlob(c, 1060, 500, 260, 44, '#2a1408', 0.22);
      for (const [x, y] of [[90, 640], [1190, 610]]) { c.strokeStyle = '#6a5034'; c.lineWidth = 3; for (let k = 0; k < 4; k++) { ellipse(c, x, y, 44 - k * 8, 13 - k * 2.5); c.stroke(); } }
      c.fillStyle = '#7a1a10'; c.fillRect(560, 398, 160, 16); c.fillStyle = '#e8b840'; c.fillRect(556, 394, 168, 5);
      for (const [x, col] of [[590, '#f0d070'], [640, '#e05030'], [690, '#f0d070']]) { c.fillStyle = col; ellipse(c, x, 390, 12, 8); c.fill(); }
      c.fillStyle = rg(c, 640, 560, 600, [[0, rgba('#fff0c0', 0.12)], [1, rgba('#fff0c0', 0)]]); c.fillRect(0, 400, W, 320);
      vignette(c, 0.3, '#1a0a04', 0.55);
    });
  }
  def('wangboat', (c, rnd) => {
    vfill(c, 0, 340, [[0, '#2a6ac0'], [0.6, '#8ac0e8'], [1, '#fff0d8']]);
    sun(c, 1100, 120, 24, '#fffef0', '#ffe0a0', 0.45);
    cloud(c, 300, 200, 520, 90, { top: '#ffffff', bot: '#c0cce0', seed: 3, rim: '#fff4dc', rimSide: 'right' });
    cloud(c, 900, 250, 380, 60, { top: '#ffffff', bot: '#c8d4e4', seed: 8 });
    wangDeck();
    water(c, 336, H, { stops: [[0, '#5aa0d0'], [0.1, '#1a6aa0'], [1, '#0a3a60']], light: '#ffffff', dark: '#06243a', seed: 161, streaks: 340, path: { x: 1100, col: '#ffffff', a: 0.55, w0: 10, w1: 160, n: 90 } });
  }, (ctx, t) => {
    const deck = wangDeck();
    waveGlints(ctx, t, { n: 70, seed: 163, y0: 340, y1: 430, cx: 1100, w0: 30, w1: 400, col: '#ffffff', a: 0.9, len: 14 });
    const heave = snap(4 + Math.sin(t * 0.8 + 1) * 4);
    ctx.save(); ctx.translate(0, heave);
    ctx.drawImage(deck, 0, 0, W, H);
    // 令旗 / 代天巡狩 banners fluttering at the mast heads
    const flag = (x, y, col, txt, s) => {
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, 0);
      for (let k = 0; k <= 10; k++) { const u = k / 10; ctx.lineTo(u * 110 * s, Math.sin(t * 5 - u * 4) * 8 * u * s + u * 30 * s); }
      for (let k = 10; k >= 0; k--) { const u = k / 10; ctx.lineTo(u * 110 * s, 80 * s - u * 46 * s + Math.sin(t * 5 - u * 4) * 8 * u * s); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#f0d070'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = '#f0d070'; ctx.font = G.font(Math.round(15 * s), true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      [...txt].forEach((ch, k) => ctx.fillText(ch, (18 + k * 22) * s, (38 + Math.sin(t * 5 - k * 0.8) * 3) * s + k * 0.5));
      ctx.restore();
    };
    flag(150, 10, '#c8281a', '代天巡狩', 1); flag(980, 30, '#e0a020', '合境平安', 0.9);
    flag(40, 254, '#1a5ab0', '令', 0.5); flag(1240, 254, '#1a8a4a', '令', 0.5);
    ctx.restore();
    // sea spray
    motes(ctx, t, { n: 20, seed: 164, x: 0, y: 300, w: W, h: 160, vx: -30, vy: -10, r: 4, col: '#ffffff', a: 0.5, tw: 4, wob: 10, add: false });
    ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8;
    for (let i = 0; i < 3; i++) {
      const a = t * (0.4 + i * 0.07) + i * 2, x = 640 + Math.cos(a) * 300, y = 130 + i * 25 + Math.sin(a * 1.6) * 30, f = Math.sin(t * 6 + i) * 5;
      ctx.beginPath(); ctx.moveTo(x - 12, y - f); ctx.quadraticCurveTo(x - 4, y - 3, x, y); ctx.quadraticCurveTo(x + 4, y - 3, x + 12, y - f); ctx.stroke();
    }
    ctx.restore();
  }, { shift: (t) => [0, Math.sin(t * 0.8) * 3], edge: '#2a6ac0' });

  // ---------- 恆春: windswept grassland and the old city gate ----------
  def('hengchun', (c, rnd) => {
    vfill(c, 0, 380, [[0, '#4a7ab8'], [0.6, '#a8c8dc'], [1, '#e8ecd8']]);
    for (let i = 0; i < 9; i++) { // racing wind-stretched clouds
      const x = rnd() * W, y = 30 + rnd() * 220;
      for (let k = 0; k < 6; k++) softBlob(c, x + k * 50, y + (rnd() - 0.5) * 14 - k * 2, 120, 14 + rnd() * 10, '#ffffff', 0.5);
      softBlob(c, x + 150, y + 14, 200, 8, '#7a8aa8', 0.15);
    }
    mountain(c, { y: 330, amp: 90, freq: 0.004, seed: 171, col: '#5a7a8a', col2: '#8aa0a8', bottom: 390, shade: 0.4, light: '#e8f0e0', dark: '#2a3a4a', haze: '#e8ecd8', hazeA: 0.6 });
    // the old city gate: brick wall with arched tunnel and battlements
    const gx = 470, gy = 400;
    c.fillStyle = lg(c, 0, gy - 130, 0, gy, [[0, '#a8826a'], [1, '#6a4a3a']]);
    c.fillRect(gx - 170, gy - 90, 340, 90);
    c.fillRect(-20, gy - 60, gx - 150, 60); c.fillRect(gx + 170, gy - 60, 260, 60);
    for (let y = gy - 88; y < gy; y += 7) for (let x = -20 + ((y / 7) % 2) * 10; x < gx + 430; x += 20) { if (y < gy - 60 && (x < gx - 170 || x > gx + 170)) continue; c.fillStyle = rgba(rnd() < 0.5 ? '#3a2014' : '#e8c8a8', 0.12); c.fillRect(x, y, 19, 6); }
    for (let x = gx - 170; x < gx + 170; x += 24) { c.fillStyle = '#8a6a54'; c.fillRect(x, gy - 104, 14, 14); }
    for (let x = -20; x < gx - 170; x += 24) { c.fillStyle = '#8a6a54'; c.fillRect(x, gy - 72, 14, 12); }
    for (let x = gx + 176; x < gx + 430; x += 24) { c.fillStyle = '#8a6a54'; c.fillRect(x, gy - 72, 14, 12); }
    c.fillStyle = '#1a1210'; c.beginPath(); c.moveTo(gx - 36, gy); c.lineTo(gx - 36, gy - 46); c.arc(gx, gy - 46, 36, Math.PI, 0); c.lineTo(gx + 36, gy); c.closePath(); c.fill();
    c.strokeStyle = '#c8b090'; c.lineWidth = 3; c.beginPath(); c.arc(gx, gy - 46, 40, Math.PI, 0); c.stroke();
    c.fillStyle = '#e8dcc0'; c.fillRect(gx - 34, gy - 120 + 30, 68, 0);
    c.fillStyle = '#e8dcc0'; c.fillRect(gx - 30, gy - 86, 60, 18); c.fillStyle = '#3a2a20'; c.font = G.font(13, true); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('恆春城', gx, gy - 77);
    c.fillStyle = rgba('#3a5a2a', 0.6); for (let k = 0; k < 14; k++) { ellipse(c, gx - 170 + rnd() * 340, gy - 90 + rnd() * 30, 6 + rnd() * 12, 3 + rnd() * 5); c.fill(); }
    // wind-bent trees (blown landward)
    for (const [x, h] of [[1000, 160], [1110, 200], [180, 130]]) {
      c.strokeStyle = '#3a2a1e'; c.lineWidth = h * 0.06; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, 410); c.quadraticCurveTo(x + h * 0.05, 410 - h * 0.5, x + h * 0.45, 410 - h * 0.8); c.stroke();
      for (let k = 0; k < 9; k++) { const px = x + h * (0.1 + rnd() * 0.6), py = 410 - h * (0.6 + rnd() * 0.3); c.fillStyle = rg(c, px, py, h * 0.16, [[0, '#6a8a44'], [1, '#2a4a1e']], 0, px - 6, py - 8); ellipse(c, px + h * 0.08, py, h * 0.2, h * 0.08, -0.15); c.fill(); }
    }
    // grassland
    c.fillStyle = lg(c, 0, 390, 0, H, [[0, '#a8a860'], [0.3, '#8a9448'], [1, '#4a5a28']]); c.fillRect(0, 395, W, 325);
    for (let i = 0; i < 80; i++) softBlob(c, rnd() * W, 410 + Math.pow(rnd(), 2) * 300, 60 + rnd() * 180, 6 + rnd() * 16, rnd() < 0.5 ? '#e8e0a0' : '#3a4a1a', 0.12);
    grass(c, rnd, 400, 720, 1600, ['#c8c070', '#8a9a4a', '#6a7a3a', '#e0d890'], { h: 22, lean: 0.9 });
    vignette(c, 0.25, '#2a2a10', 0.5);
    grain(c, rnd, 3000, 0.025);
  }, (ctx, t) => {
    // gust waves rolling across the grass
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const spr = glowSpr('#fff4b0');
    for (let i = 0; i < 7; i++) {
      const x = mod(t * 260 + i * 260, W + 600) - 300, y = 430 + U.hash(i, 1, 172) * 260, s = 0.5 + (y - 400) / 300;
      ctx.globalAlpha = 0.14; ctx.drawImage(spr, x - 220 * s, y - 18 * s, 440 * s, 36 * s);
    }
    ctx.restore();
    windStreaks(ctx, t, 173, 16, 600, 40, 640, 0.3);
    leaves(ctx, t, { n: 14, seed: 174, vx: 300, vy: 20, size: 4, cols: ['#c8c070', '#8a9a4a', '#e0d890'], sway: 20 });
  });

  // ---------- 鵝鑾鼻: white lighthouse on the cliff, sweeping beam, night sea ----------
  const CAPE_LAMP = [960, 236 - (236 - 163) * 1.55 + 23];
  def('cape', (c, rnd) => {
    vfill(c, 0, 330, [[0, '#040814'], [0.6, '#0e1a34'], [1, '#22344e']]);
    stars(c, 260, rnd, 300, { a: 0.85 });
    moon(c, 220, 100, 22, { col: '#f0f4ff', phase: -0.5, sky: '#0a1228', haloCol: '#7a9ad0', haloA: 0.3 });
    water(c, 330, 480, { stops: [[0, '#2a3e5a'], [0.1, '#14243e'], [1, '#081428']], light: '#9ab8e0', seed: 181, streaks: 260, path: { x: 220, col: '#e0e8ff', a: 0.45, w0: 6, w1: 120, n: 90 } });
    // cliff headland rising to the right, lighthouse on top
    const cp = []; for (let x = 640; x <= W + 10; x += 4) cp.push(x, 320 - Math.min(1, (x - 640) / 200) * 90 - fbm(x * 0.01, 3, 3) * 14 + Math.max(0, x - 640) * 0.0);
    layer(c, (x) => { x.beginPath(); x.moveTo(600, 480); for (let i = 0; i < cp.length; i += 2) x.lineTo(cp[i], cp[i + 1]); x.lineTo(W + 10, 480); x.closePath(); x.fillStyle = lg(x, 0, 220, 0, 480, [[0, '#1e2a24'], [1, '#0a100e']]); x.fill(); }, (x) => {
      const r = U.seeded(182);
      for (let i = 0; i < 40; i++) { x.strokeStyle = rgba('#5a6a7a', 0.25); x.lineWidth = 1 + r() * 2; const sx = 620 + r() * 300; x.beginPath(); x.moveTo(sx, 300 + r() * 60); x.lineTo(sx + 20 + r() * 30, 480); x.stroke(); }
      x.fillStyle = lg(x, 640, 0, 900, 0, [[0, rgba('#7a90b0', 0.25)], [1, rgba('#7a90b0', 0)]]); x.fillRect(600, 200, 400, 280);
    });
    // white tower (tapering) with black lantern room and gallery
    const tx = CAPE_LAMP[0], tb = 236, tt = 186;
    c.save(); c.translate(tx, tb); c.scale(1.55, 1.55); c.translate(-tx, -tb);
    c.fillStyle = lg(c, tx - 30, 0, tx + 30, 0, [[0, '#f0f4ff'], [0.4, '#c8d0e0'], [1, '#5a6478']]);
    c.beginPath(); c.moveTo(tx - 30, tb); c.lineTo(tx - 20, tt); c.lineTo(tx + 20, tt); c.lineTo(tx + 30, tb); c.closePath(); c.fill();
    c.fillStyle = '#e8ecf4'; c.fillRect(tx - 40, tb - 4, 80, 10);
    c.fillStyle = '#20242c'; c.fillRect(tx - 28, tt - 6, 56, 6);
    c.strokeStyle = '#20242c'; c.lineWidth = 1.5; for (let k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(tx + k * 8, tt - 6); c.lineTo(tx + k * 8, tt - 14); c.stroke(); }
    c.fillRect(tx - 28, tt - 15, 56, 2);
    c.fillStyle = '#fff0b0'; c.fillRect(tx - 14, tt - 34, 28, 22);
    c.strokeStyle = '#20242c'; c.lineWidth = 2; for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(tx + k * 9, tt - 34); c.lineTo(tx + k * 9, tt - 12); c.stroke(); }
    c.fillStyle = '#20242c'; c.beginPath(); c.moveTo(tx - 18, tt - 34); c.quadraticCurveTo(tx, tt - 52, tx + 18, tt - 34); c.closePath(); c.fill(); c.fillRect(tx - 1, tt - 60, 2, 10);
    for (let k = 0; k < 3; k++) { c.fillStyle = '#20242c'; c.fillRect(tx - 3, tb - 40 - k * 16, 6, 8); }
    glow(c, tx, tt - 23, 70, '#fff0b0', 0.5);
    c.restore();
    // keeper's cottage
    c.fillStyle = '#d8dce4'; c.fillRect(1070, 214, 90, 30); c.fillStyle = '#4a3a3a'; c.beginPath(); c.moveTo(1064, 216); c.lineTo(1115, 196); c.lineTo(1166, 216); c.fill();
    c.fillStyle = '#ffd890'; c.fillRect(1090, 222, 10, 12); c.fillRect(1130, 222, 10, 12);
    // grassy clifftop lawn (ground)
    const gp = profile({ y: 470, amp: 50, freq: 0.004, seed: 183, oct: 3, shape: (x) => -Math.max(0, (x - 500) / 780) * 50 });
    layer(c, (x) => { pathProfile(x, gp); x.fillStyle = lg(x, 0, 400, 0, H, [[0, '#2a4a3a'], [0.35, '#1e3a2c'], [1, '#0a1610']]); x.fill(); }, (x) => {
      const r = U.seeded(184);
      for (let i = 0; i < 80; i++) softBlob(x, r() * W, 440 + Math.pow(r(), 2) * 280, 40 + r() * 140, 6 + r() * 14, r() < 0.5 ? '#7aa0a0' : '#000000', 0.1);
      x.fillStyle = lg(x, 0, 420, 0, 470, [[0, rgba('#a8c0e0', 0.25)], [1, rgba('#a8c0e0', 0)]]); x.fillRect(0, 410, W, 60);
    });
    grass(c, rnd, 440, 720, 900, ['#3a5a4a', '#5a7a6a', '#24382c', '#7a9a8a'], { h: 18, lean: 0.4 });
    // white path to the lighthouse
    c.fillStyle = rgba('#c8d0d8', 0.25); c.beginPath(); c.moveTo(780, 430); c.quadraticCurveTo(700, 560, 820, 720); c.lineTo(1000, 720); c.quadraticCurveTo(840, 560, 840, 430); c.closePath(); c.fill();
    vignette(c, 0.55, '#000208', 0.42);
    grain(c, rnd, 3500, 0.03);
  }, (ctx, t) => {
    // the sweeping beam: a rotating cone seen from the side
    const a = t * 0.9;
    const dir = Math.cos(a), toward = Math.sin(a);
    const [lx, ly] = [CAPE_LAMP[0], CAPE_LAMP[1] - 23];
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (Math.abs(dir) > 0.05) {
      const len = 1400 * Math.abs(dir), spread = 40 + (1 - Math.abs(dir)) * 160;
      const ex = lx + Math.sign(dir) * len;
      ctx.globalAlpha = 0.28 * Math.abs(dir) + 0.06;
      ctx.fillStyle = lg(ctx, lx, ly, ex, ly, [[0, 'rgba(255,248,210,0.9)'], [0.4, 'rgba(255,240,200,0.35)'], [1, 'rgba(255,240,200,0)']]);
      ctx.beginPath(); ctx.moveTo(lx, ly - 4); ctx.lineTo(ex, ly - spread - 30); ctx.lineTo(ex, ly + spread - 10); ctx.lineTo(lx, ly + 4); ctx.closePath(); ctx.fill();
    }
    const flare = Math.max(0, toward) ** 6;
    lglow(ctx, lx, ly, 60 + flare * 240, '#fff4c8', 0.45 + flare * 0.5);
    lglow(ctx, lx, ly, 14, '#ffffff', 0.9, true);
    ctx.restore();
    waveGlints(ctx, t, { n: 70, seed: 185, y0: 332, y1: 470, cx: 220, w0: 20, w1: 300, col: '#e8f0ff', a: 0.7, len: 12 });
    // beam glitter on the sea where it sweeps
    if (dir < -0.2) waveGlints(ctx, t, { n: 50, seed: 186, y0: 335, y1: 420, cx: lx + dir * 600, w0: 100, w1: 200, col: '#fff4c8', a: -dir * 0.8, len: 14 });
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) { const aa = Math.max(0, Math.sin(t * (1 + U.hash(i, 2, 187) * 2) + i * 3)); lglow(ctx, U.hash(i, 1, 187) * W, U.hash(i, 3, 187) * 280, 6, '#ffffff', aa * 0.6, true); }
    ctx.restore();
    mist(ctx, t, 'cape', '#5a7a9a', 300, 100, 0.25, 8, 30, 188);
  });

  // ---------- 蘭嶼: volcanic coast, tatala boats on the beach ----------
  function tatala(c, x, y, s, flip) {
    c.save(); c.translate(x, y); c.scale(flip ? -s : s, s);
    // hull: high upswept prow and stern
    const hull = () => { c.beginPath(); c.moveTo(-96, -58); c.quadraticCurveTo(-84, -6, -50, 4); c.lineTo(50, 4); c.quadraticCurveTo(84, -6, 96, -58); c.quadraticCurveTo(70, -26, 40, -22); c.lineTo(-40, -22); c.quadraticCurveTo(-70, -26, -96, -58); c.closePath(); };
    hull(); c.fillStyle = lg(c, 0, -30, 0, 6, [[0, '#f8f4ea'], [1, '#c8c0b0']]); c.fill();
    c.save(); hull(); c.clip();
    // red & black geometric bands and zigzags
    c.fillStyle = '#b8261a'; c.fillRect(-100, -20, 200, 5);
    c.fillStyle = '#1a1414'; c.fillRect(-100, -14, 200, 2.5);
    for (let k = -48; k < 48; k += 9) { c.fillStyle = (k / 9) % 2 ? '#1a1414' : '#b8261a'; c.beginPath(); c.moveTo(k, -8); c.lineTo(k + 4.5, -11); c.lineTo(k + 9, -8); c.lineTo(k + 4.5, -5); c.closePath(); c.fill(); }
    c.fillStyle = '#1a1414'; c.fillRect(-100, -3.5, 200, 1.5);
    c.restore();
    // the carved boat-eye (concentric rings with rays) at both ends
    for (const ex of [-66, 66]) {
      c.strokeStyle = '#1a1414'; c.lineWidth = 1.6;
      for (let r = 3; r <= 10; r += 3.5) { circle(c, ex, -26, r); c.stroke(); }
      c.strokeStyle = '#b8261a'; c.lineWidth = 1.2;
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; c.beginPath(); c.moveTo(ex + Math.cos(a) * 11, -26 + Math.sin(a) * 11); c.lineTo(ex + Math.cos(a) * 14, -26 + Math.sin(a) * 14); c.stroke(); }
      c.fillStyle = '#b8261a'; circle(c, ex, -26, 2); c.fill();
    }
    c.strokeStyle = '#3a2a24'; c.lineWidth = 1.5; hull(); c.stroke();
    // feather-tipped prow ornaments
    for (const sx of [-1, 1]) { c.strokeStyle = '#2a1a14'; c.lineWidth = 2; c.beginPath(); c.moveTo(sx * 96, -58); c.lineTo(sx * 100, -72); c.stroke(); c.fillStyle = '#f0ece0'; ellipse(c, sx * 101, -76, 2.5, 6, sx * 0.3); c.fill(); }
    c.restore();
    c.fillStyle = rgba('#1a1410', 0.35); ellipse(c, x, y + 4 * s, 90 * s, 7 * s); c.fill();
  }
  def('orchid', (c, rnd) => {
    vfill(c, 0, 320, [[0, '#1a6ad8'], [0.6, '#5aa8ec'], [1, '#c8e8f8']]);
    sun(c, 300, 70, 24, '#fffef0', '#fff4c8', 0.4);
    cloud(c, 820, 130, 480, 90, { top: '#ffffff', bot: '#b0c4e0', seed: 4, rim: '#fffbe8', rimSide: 'left' });
    cloud(c, 260, 220, 300, 46, { top: '#ffffff', bot: '#c0d0e8', seed: 9 });
    // deep blue Pacific
    water(c, 316, 430, { stops: [[0, '#2a7ac8'], [0.2, '#0a4aa0'], [1, '#0a3a7a']], light: '#ffffff', dark: '#06204a', seed: 191, streaks: 280, path: { x: 300, col: '#ffffff', a: 0.6, w0: 10, w1: 140, n: 90 } });
    // rugged volcanic headlands and sea stacks, green-capped
    const vrock = (x0, x1, base, amp, seed) => {
      const p = profile({ y: base, amp, freq: 0.012, seed, oct: 5, ridged: true, x0, x1, step: 3, shape: (x) => -Math.sin(clamp((x - x0) / (x1 - x0), 0, 1) * Math.PI) * amp * 0.9 });
      mountain(c, { p, col: '#3a3a40', col2: '#1a1a1e', bottom: base + 30, shade: 1, light: '#c0c8d8', dark: '#000000', facetWin: 3, tex: 60, seed,
        paint: (x) => { for (let i = 0; i < p.length; i += 6) { x.fillStyle = rgba(i % 12 ? '#4a8a3a' : '#6aa04a', 0.85); ellipse(x, p[i], p[i + 1] + 4, 12, 7); x.fill(); } } });
    };
    vrock(-20, 380, 390, 190, 192);
    vrock(880, W + 20, 400, 230, 193);
    vrock(560, 640, 340, 60, 194);
    // pebble beach
    groundBase(c, 410, { stops: [[0, '#9a948a'], [0.3, '#7a746c'], [1, '#3a3632']], seed: 195, light: '#ffffff', dark: '#1a1814', blots: 80, speckle: 3000, speckCols: ['#2a2622', '#c8c0b4', '#6a6058', '#e8e0d4'], speckA: 0.6 });
    c.fillStyle = lg(c, 0, 405, 0, 440, [[0, rgba('#e8f0f4', 0.5)], [1, rgba('#e8f0f4', 0)]]); c.fillRect(0, 404, W, 36);
    // tatala boats drawn up on the beach, at the edges
    tatala(c, 960, 414, 0.6, false);
    tatala(c, 170, 446, 1.25, false);
    tatala(c, 1130, 440, 1.05, true);
    vignette(c, 0.25, '#0a1a2a', 0.5);
    grain(c, rnd, 3000, 0.025);
  }, (ctx, t) => {
    waveGlints(ctx, t, { n: 90, seed: 196, y0: 318, y1: 400, cx: 300, w0: 40, w1: 600, col: '#ffffff', a: 0.9, len: 12 });
    // surf washing up the pebbles
    ctx.save();
    for (let k = 0; k < 3; k++) {
      const ph = mod(t * 0.22 + k / 3, 1), y = 396 + Math.sin(ph * Math.PI) * 26, a = Math.sin(ph * Math.PI) * 0.7;
      ctx.fillStyle = rgba('#ffffff', a * 0.35); ctx.strokeStyle = rgba('#ffffff', a); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 396);
      for (let x = 0; x <= W; x += 20) ctx.lineTo(x, y + Math.sin(x * 0.015 + k * 2 + t * 0.5) * 6 + U.vnoise(x * 0.01, k, 7) * 10);
      ctx.lineTo(W, 396); ctx.closePath(); ctx.fill();
      ctx.beginPath(); for (let x = 0; x <= W; x += 20) { const yy = y + Math.sin(x * 0.015 + k * 2 + t * 0.5) * 6 + U.vnoise(x * 0.01, k, 7) * 10; x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); } ctx.stroke();
    }
    ctx.restore();
    // flying fish skipping over the swell
    ctx.save(); ctx.fillStyle = '#c8e0f0';
    for (let i = 0; i < 3; i++) {
      const cyc = 3 + i, ph = mod(t + i * 1.3, cyc) / cyc;
      if (ph > 0.3) continue;
      const q = ph / 0.3, k = Math.floor((t + i * 1.3) / cyc);
      const x0 = 420 + U.hash(k, i, 197) * 400, x = x0 + q * 160, y = 350 + U.hash(k, i + 3, 197) * 40 - Math.sin(q * Math.PI) * 30;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.cos(q * Math.PI) * -0.3);
      ellipse(ctx, 0, 0, 8, 2.2); ctx.fill();
      ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(-6, -7); ctx.lineTo(4, -1); ctx.fill(); ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(-6, 6); ctx.lineTo(4, 1); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) { const x = mod(t * (36 + i * 8) + i * 400, W + 200) - 100, y = 120 + i * 40 + Math.sin(t + i) * 15, f = Math.sin(t * 5 + i) * 5; ctx.beginPath(); ctx.moveTo(x - 12, y - f); ctx.quadraticCurveTo(x - 4, y - 3, x, y); ctx.quadraticCurveTo(x + 4, y - 3, x + 12, y - f); ctx.stroke(); }
    ctx.restore();
  });

  // ---------- 東海岸: mountains plunging into the sea ----------
  def('eastcoast', (c, rnd) => {
    vfill(c, 0, 330, [[0, '#3a7ac8'], [0.6, '#9ac8e8'], [1, '#fff0d8']]);
    sun(c, 1040, 200, 30, '#fffef0', '#ffd8a0', 0.55);
    cloud(c, 700, 120, 420, 60, { top: '#ffffff', bot: '#c0cce0', seed: 5, rim: '#ffe8c0', rimSide: 'right' });
    water(c, 326, 440, { stops: [[0, '#8ad0e0'], [0.15, '#2a9ab8'], [0.6, '#0a6a90'], [1, '#0a4a70']], light: '#ffffff', dark: '#043050', seed: 201, streaks: 300, path: { x: 1040, col: '#fff8e0', a: 0.7, w0: 10, w1: 200, n: 120 } });
    // the Coastal Range dropping straight into the Pacific, layered headlands
    for (let k = 0; k < 4; k++) {
      const x1 = 420 + k * 170, top = 120 + k * 50, base = 330 + k * 26;
      const p = profile({ y: base, amp: 40, freq: 0.008, seed: 202 + k, oct: 4, x0: -10, x1, step: 4, shape: (x) => -Math.pow(clamp(1 - x / x1, 0, 1), 0.6) * (base - top) });
      const cols = [['#7aa0b0', '#a8c8d0'], ['#4a7a6a', '#6a9a80'], ['#2a5a3a', '#3a6a48'], ['#1a3a24', '#244a2c']][k];
      mountain(c, { p, col: cols[0], col2: cols[1], bottom: base + 30, shade: 0.3, facetWin: 16, light: '#f0ffe0', dark: '#0a2010', haze: '#d8f0f0', hazeA: 0.5 - k * 0.12, trees: k > 1 ? { kind: 'round', size: 6 + k * 2, gap: 9, seed: k } : null, tex: 80 });
      // surf at the cliff foot
      c.fillStyle = rgba('#ffffff', 0.5); for (let x = x1 - 120; x < x1 + 20; x += 6) { ellipse(c, x, base + 26 + Math.sin(x) * 2, 8, 2); c.fill(); }
    }
    // pebble & driftwood beach
    groundBase(c, 430, { stops: [[0, '#a8a090'], [0.3, '#8a8274'], [1, '#3e3a32']], seed: 205, light: '#ffffff', dark: '#1a1814', blots: 80, speckle: 2600, speckCols: ['#2a2622', '#d8d0c4', '#6a6058'], speckA: 0.55 });
    c.fillStyle = lg(c, 0, 426, 0, 456, [[0, rgba('#ffffff', 0.45)], [1, rgba('#ffffff', 0)]]); c.fillRect(0, 426, W, 30);
    for (const [x, y, l, a] of [[160, 620, 220, -0.1], [1060, 660, 260, 0.08], [980, 470, 120, 0.2]]) { c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = lg(c, 0, -10, 0, 10, [[0, '#d8ccb8'], [1, '#6a5a48']]); ellipse(c, 0, 0, l / 2, 9); c.fill(); c.restore(); }
    vignette(c, 0.25, '#0a2030', 0.5);
    grade(c, '#ffe8c0', 0.1, 'soft-light');
    grain(c, rnd, 3000, 0.025);
  }, (ctx, t) => {
    waveGlints(ctx, t, { n: 100, seed: 206, y0: 328, y1: 425, cx: 1040, w0: 40, w1: 500, col: '#ffffff', a: 0.9, len: 12 });
    ctx.save();
    for (let k = 0; k < 3; k++) {
      const ph = mod(t * 0.2 + k / 3, 1), y = 424 + Math.sin(ph * Math.PI) * 18, a = Math.sin(ph * Math.PI) * 0.6;
      ctx.strokeStyle = rgba('#ffffff', a); ctx.lineWidth = 2; ctx.beginPath();
      for (let x = 0; x <= W; x += 20) { const yy = y + Math.sin(x * 0.012 + k * 2) * 5 + U.vnoise(x * 0.01, k, 9) * 8; x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
      ctx.stroke();
    }
    ctx.restore();
    mist(ctx, t, 'east', '#ffffff', 260, 110, 0.3, 6, 30, 207);
    ctx.save(); ctx.strokeStyle = '#2a3a4a'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) { const x = mod(t * (30 + i * 8) + i * 400, W + 200) - 100, y = 150 + i * 30 + Math.sin(t + i) * 15, f = Math.sin(t * 5 + i) * 5; ctx.beginPath(); ctx.moveTo(x - 12, y - f); ctx.quadraticCurveTo(x - 4, y - 3, x, y); ctx.quadraticCurveTo(x + 4, y - 3, x + 12, y - f); ctx.stroke(); }
    ctx.restore();
  });

  // ---------- 太魯閣: marble gorge with a turquoise river ----------
  def('taroko', (c, rnd) => {
    vfill(c, 0, H, [[0, '#cfe4ee'], [0.5, '#9ab8c4'], [1, '#5a7480']]);
    // marble walls: folded strata, grey-white with veins
    const wall = (side) => {
      const p = [];
      for (let y = -10; y <= 440; y += 6) {
        const base = side < 0 ? 380 + (y / 440) * 40 : 900 - (y / 440) * 40;
        p.push(base + side * -(fbm(y * 0.01, side + 5, 4) * 120 - 40) + side * Math.max(0, (180 - y)) * 0.25, y);
      }
      layer(c, (x) => {
        x.beginPath(); x.moveTo(side < 0 ? -10 : W + 10, -10);
        for (let i = 0; i < p.length; i += 2) x.lineTo(p[i], p[i + 1]);
        x.lineTo(side < 0 ? -10 : W + 10, 450); x.closePath();
        x.fillStyle = lg(x, side < 0 ? 0 : W, 0, side < 0 ? 500 : 780, 0, [[0, '#6a6e72'], [0.6, '#a8acae'], [1, '#e0e2e0']]); x.fill();
      }, (x) => {
        const r = U.seeded(211 + side);
        for (let i = 0; i < 70; i++) { // folded strata
          const y0 = r() * 460, amp = 10 + r() * 40, fr = 0.004 + r() * 0.01, ph = r() * 6;
          x.strokeStyle = rgba(r() < 0.6 ? '#4a5054' : '#ffffff', 0.12 + r() * 0.2); x.lineWidth = 1 + r() * 4;
          x.beginPath();
          for (let xx = side < 0 ? 0 : 760; xx <= (side < 0 ? 520 : W); xx += 10) { const yy = y0 + Math.sin(xx * fr + ph) * amp + (xx - 640) * 0.08 * side; xx === (side < 0 ? 0 : 760) ? x.moveTo(xx, yy) : x.lineTo(xx, yy); }
          x.stroke();
        }
        for (let i = 0; i < 26; i++) { x.strokeStyle = rgba('#2a3034', 0.25); x.lineWidth = 1; let xx = side < 0 ? r() * 440 : 840 + r() * 440, yy = 0; x.beginPath(); x.moveTo(xx, yy); for (let k = 0; k < 10; k++) { xx += (r() - 0.5) * 16; yy += 30 + r() * 20; x.lineTo(xx, yy); } x.stroke(); }
        x.fillStyle = lg(x, 0, 0, 0, 460, [[0, rgba('#ffffff', 0)], [0.8, rgba('#3a4a50', 0.2)], [1, rgba('#2a3a40', 0.5)]]); x.fillRect(0, 0, W, 460);
        // clinging green vegetation
        for (let i = 0; i < 40; i++) { const yy = r() * 420, xx = side < 0 ? r() * 420 : 860 + r() * 420; x.fillStyle = rgba(r() < 0.5 ? '#3a6a3a' : '#5a8a4a', 0.75); ellipse(x, xx, yy, 6 + r() * 14, 3 + r() * 6); x.fill(); }
      });
      // rim light along the inner edge
      c.strokeStyle = rgba('#ffffff', 0.5); c.lineWidth = 2; c.beginPath();
      for (let i = 0; i < p.length; i += 2) i ? c.lineTo(p[i], p[i + 1]) : c.moveTo(p[i], p[i + 1]);
      c.stroke();
    };
    // distant gorge walls in haze
    mountain(c, { y: 380, amp: 260, freq: 0.006, seed: 213, ridged: true, col: '#9ab0bc', col2: '#b8ccd4', bottom: 420, shade: 0.4, light: '#ffffff', dark: '#5a7080', haze: '#cfe4ee', hazeA: 0.6 });
    wall(-1); wall(1);
    // suspension bridge high across
    c.strokeStyle = '#3a3a40'; c.lineWidth = 2; c.beginPath(); c.moveTo(420, 130); c.quadraticCurveTo(640, 180, 860, 130); c.stroke();
    c.lineWidth = 1; for (let k = 1; k < 20; k++) { const u = k / 20, x = U.lerp(420, 860, u), y = 130 + Math.sin(u * Math.PI) * 25; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 12); c.stroke(); }
    c.fillStyle = '#5a5050'; c.beginPath(); c.moveTo(420, 140); c.quadraticCurveTo(640, 192, 860, 140); c.lineTo(860, 144); c.quadraticCurveTo(640, 196, 420, 144); c.fill();
    // turquoise river along the back
    c.fillStyle = lg(c, 0, 372, 0, 430, [[0, '#7ad8d0'], [0.5, '#3ab0b0'], [1, '#1a8a90']]);
    c.beginPath(); c.moveTo(0, 410); c.quadraticCurveTo(400, 372, 640, 380); c.quadraticCurveTo(900, 388, W, 404); c.lineTo(W, 440); c.quadraticCurveTo(640, 420, 0, 446); c.closePath(); c.fill();
    for (let i = 0; i < 80; i++) { const x = rnd() * W, y = 388 + rnd() * 44; c.fillStyle = rgba('#e0ffff', 0.3); c.fillRect(x, y, 10 + rnd() * 30, 1); }
    // marble boulder riverbank (ground)
    groundBase(c, 430, { stops: [[0, '#b8bcbc'], [0.3, '#9a9ea0'], [1, '#4a5052']], seed: 214, light: '#ffffff', dark: '#2a3034', blots: 100, speckle: 2200, speckCols: ['#3a4044', '#e8eaea', '#7a8084'], speckA: 0.5 });
    for (const [x, y, w, h] of [[80, 470, 110, 60], [1200, 480, 130, 70], [330, 440, 50, 26], [960, 446, 60, 30], [40, 700, 160, 90], [1250, 720, 180, 100]]) rock(c, x, y, w, h, ['#f0f2f0', '#b0b4b4', '#4a5054'], rnd);
    vignette(c, 0.35, '#1a2a30', 0.5);
    grain(c, rnd, 3500, 0.03);
  }, (ctx, t) => {
    // river flow
    ctx.save(); ctx.strokeStyle = '#e8ffff'; ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const h1 = U.hash(i, 1, 215), h2 = U.hash(i, 2, 215);
      const x = mod(h1 * 1600 + t * (90 + h2 * 60), 1600) - 160, y = 390 + h2 * 42 + (x - 640) * (x < 640 ? -0.02 : 0.02);
      ctx.globalAlpha = 0.35; ctx.lineWidth = 1 + h2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 20 + h1 * 30, y); ctx.stroke();
    }
    ctx.restore();
    // trickling falls down the marble walls
    ctx.save(); ctx.fillStyle = '#ffffff';
    for (const [x, y0, y1] of [[300, 100, 400], [1010, 60, 395]]) for (let k = 0; k < 6; k++) { const ph = mod(t * 1.5 + k / 6, 1); ctx.globalAlpha = 0.4 * (1 - ph); ctx.fillRect(x + Math.sin(k) * 2, y0 + ph * (y1 - y0), 2, 18); }
    ctx.restore();
    mist(ctx, t, 'taro1', '#ffffff', 340, 120, 0.4, 10, 30, 216);
    // swallows (燕子口) darting
    ctx.save(); ctx.strokeStyle = '#1a2024'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      const a = t * (0.9 + i * 0.13) + i * 2, x = 640 + Math.sin(a) * (180 + i * 30), y = 200 + Math.sin(a * 1.7 + i) * 90, f = Math.sin(t * 12 + i) * 4;
      ctx.beginPath(); ctx.moveTo(x - 8, y - f); ctx.quadraticCurveTo(x - 3, y - 2, x, y); ctx.quadraticCurveTo(x + 3, y - 2, x + 8, y - f); ctx.stroke();
    }
    ctx.restore();
  });

  // ---------- 頭城 搶孤 night: towering 孤棚 frame, lanterns, crowds' torches ----------
  const TC_TORCH = [];
  def('toucheng', (c, rnd) => {
    TC_TORCH.length = 0;
    vfill(c, 0, 400, [[0, '#04060e'], [0.6, '#10142a'], [1, '#2a1e30']]);
    stars(c, 160, rnd, 300, { a: 0.7 });
    // 龜山島 on the dark sea horizon
    mountain(c, { y: 360, amp: 0, freq: 0.01, seed: 221, x0: 60, x1: 380, shape: (x) => -Math.exp(-Math.pow((x - 250) / 60, 2)) * 60 - Math.exp(-Math.pow((x - 160) / 70, 2)) * 18, col: '#141a2c', col2: '#0e1220', bottom: 362, rim: '#5a6a9a', rimA: 0.3 });
    vfill(c, 360, 400, [[0, '#121a30'], [1, '#0a0e1a']]);
    // the 孤棚: grid of tall greased poles holding a platform; offering towers (孤棧) with flags above
    const fx = 760, fy = 400, fw = 360, ph = 170;
    glow(c, fx, fy - ph, 340, '#ff9a40', 0.3);
    c.fillStyle = '#3a2418';
    for (let k = 0; k < 7; k++) { const x = fx - fw / 2 + k * fw / 6; c.fillStyle = lg(c, x - 5, 0, x + 5, 0, [[0, '#8a6a4a'], [1, '#2a1a10']]); c.fillRect(x - 5, fy - ph, 10, ph); c.fillStyle = rgba('#ffe0b0', 0.35); c.fillRect(x - 4, fy - ph, 2, ph); }
    c.strokeStyle = '#2a1a10'; c.lineWidth = 4;
    for (let k = 0; k < 3; k++) { const y = fy - ph * (0.35 + k * 0.2); c.beginPath(); c.moveTo(fx - fw / 2, y); c.lineTo(fx + fw / 2, y); c.stroke(); }
    c.fillStyle = lg(c, 0, fy - ph - 14, 0, fy - ph + 6, [[0, '#a07a50'], [1, '#4a3020']]); c.fillRect(fx - fw / 2 - 20, fy - ph - 12, fw + 40, 16);
    for (let k = 0; k < 13; k++) { // 孤棧: tall tapered towers of offerings
      const x = fx - fw / 2 + k * fw / 12, h = 104 + Math.sin(k * 1.7) * 18 + (6 - Math.abs(k - 6)) * 6, by = fy - ph - 12;
      c.fillStyle = lg(c, x - 10, 0, x + 10, 0, [[0, '#c8a060'], [0.5, '#e8c070'], [1, '#6a4a2a']]);
      c.beginPath(); c.moveTo(x - 11, by); c.lineTo(x - 4, by - h); c.lineTo(x + 4, by - h); c.lineTo(x + 11, by); c.closePath(); c.fill();
      for (let q = 0; q < 8; q++) { c.fillStyle = q % 2 ? '#d8402a' : '#f0d070'; c.fillRect(x - 10 + q, by - h * (q + 0.5) / 8, 20 - q * 2, 3); }
      c.fillStyle = '#2a1a10'; c.fillRect(x - 0.8, by - h - 26, 1.6, 26);
      c.fillStyle = k === 6 ? '#ffd040' : (k % 2 ? '#d8281a' : '#2a7ad8'); c.beginPath(); c.moveTo(x + 1, by - h - 26); c.lineTo(x + 16, by - h - 20); c.lineTo(x + 1, by - h - 14); c.fill();
    }
    // 順風旗 at the summit
    c.fillStyle = '#2a1a10'; c.fillRect(fx - 1.5, fy - ph - 200, 3, 60);
    // lantern strings radiating from the platform
    for (let k = 0; k < 4; k++) {
      const ex = [80, 320, 1160, 1260][k], ey = [300, 360, 330, 250][k];
      c.strokeStyle = rgba('#140a08', 0.9); c.lineWidth = 1.5; c.beginPath(); c.moveTo(fx + (k < 2 ? -fw / 2 : fw / 2), fy - ph); c.quadraticCurveTo((fx + ex) / 2, (fy - ph + ey) / 2 + 40, ex, ey); c.stroke();
      for (let j = 1; j < 8; j++) { const u = j / 8, x = U.lerp(fx + (k < 2 ? -fw / 2 : fw / 2), ex, u), y = U.lerp(fy - ph, ey, u) + Math.sin(u * Math.PI) * 30; lanternShape(c, x, y + 10, 6, '#e03a2a', 1, { tassel: false }); glow(c, x, y + 10, 26, '#ff8a3a', 0.4); }
    }
    // crowd at the foot of the frame, torches held high
    for (let i = 0; i < 140; i++) {
      const x = rnd() * W, y = 400 + rnd() * 34, s = 0.6 + (y - 400) / 60;
      c.fillStyle = '#0a0608'; circle(c, x, y - 14 * s, 5 * s); c.fill(); c.fillRect(x - 6 * s, y - 10 * s, 12 * s, 16 * s);
      c.fillStyle = rgba('#ff9a50', 0.35); c.beginPath(); c.arc(x, y - 14 * s, 5 * s, Math.PI * 1.1, Math.PI * 1.7); c.lineTo(x, y - 14 * s); c.fill();
      if (rnd() < 0.18) { c.fillStyle = '#3a2418'; c.fillRect(x + 4 * s, y - 34 * s, 2 * s, 26 * s); TC_TORCH.push([x + 5 * s, y - 36 * s, s]); }
    }
    // trampled field / plaza ground
    groundBase(c, 428, { stops: [[0, '#3a2a24'], [0.3, '#2e221e'], [1, '#100c0a']], seed: 222, light: '#ffb070', blots: 100, speckle: 1600, speckCols: ['#000000', '#6a4a3a', '#c88a5a'], speckA: 0.3, pool: { x: 700, y: 470, r: 600, col: '#ff8a3a', a: 0.22, sy: 0.25 } });
    vignette(c, 0.55, '#000000', 0.4);
    grain(c, rnd, 4000, 0.035);
  }, (ctx, t) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < TC_TORCH.length; i++) {
      const [x, y, s] = TC_TORCH[i], f = flick(t, i, 1.3);
      lglow(ctx, x, y, 40 * s, '#ff7a2a', 0.5 * f);
      lglow(ctx, x, y - 3 * s, 8 * s, '#ffe0a0', 0.9 * f, true);
    }
    lglow(ctx, 760, 220, 300, '#ff9a40', 0.18 * flick(t, 3, 0.3));
    ctx.restore();
    // the 順風旗 streaming in the wind
    ctx.save(); ctx.translate(761, 400 - 170 - 200); ctx.fillStyle = '#ffd040';
    ctx.beginPath(); ctx.moveTo(0, 0);
    for (let k = 0; k <= 8; k++) { const u = k / 8; ctx.lineTo(u * 70, Math.sin(t * 6 - u * 4) * 6 * u + u * 8); }
    for (let k = 8; k >= 0; k--) { const u = k / 8; ctx.lineTo(u * 70, 36 - u * 20 + Math.sin(t * 6 - u * 4) * 6 * u); }
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#d8281a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    motes(ctx, t, { n: 40, seed: 223, x: 0, y: 120, w: W, h: 320, vx: 6, vy: -30, r: 3, col: '#ffa040', a: 0.8, tw: 6, wob: 20 });
    // distant fireworks blooming over the sea
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const cyc = 4.5, ph = mod(t, cyc) / cyc, k = Math.floor(t / cyc);
    if (ph < 0.4) {
      const q = ph / 0.4, bx = 140 + U.hash(k, 1, 224) * 380, by = 90 + U.hash(k, 2, 224) * 100, col = qHue(U.hash(k, 3, 224) * 360);
      for (let s = 0; s < 20; s++) { const a = s / 20 * TAU; lglow(ctx, bx + Math.cos(a) * 60 * q, by + Math.sin(a) * 60 * q + q * q * 20, 5, col, 0.9 * (1 - q), true); }
    }
    ctx.restore();
    mist(ctx, t, 'tc', '#8a6a6a', 340, 120, 0.25, 8, 30, 225);
  });

  // ---------- 澎湖: basalt columns, stone weirs (石滬), windswept ----------
  function hexGround(c, y0, o) { // hexagonal basalt column tops in perspective
    const yh = y0 - 120, C = H - yh;
    const proj = (u, z) => [640 + u * 640 / z, yh + C / z];
    const R = 0.13, hw = R * Math.sqrt(3);
    const r = U.seeded(o.seed || 5);
    for (let row = 60; row >= 0; row--) {
      const z = 1 + row * R * 1.5 * 0.5;
      if (yh + C / z < y0 - 4) continue;
      for (let col = -40; col <= 40; col++) {
        const u = col * hw + (row % 2) * hw / 2;
        const pts = [];
        for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + Math.PI / 6; pts.push(proj(u + Math.cos(a) * R * 0.94, z + Math.sin(a) * R * 0.94 * 0.5)); }
        if (pts[0][0] < -60 || pts[3][0] > W + 60) continue;
        const tone = r();
        c.fillStyle = U.mix(o.dark, o.light, 0.25 + tone * 0.4);
        c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill();
        c.strokeStyle = rgba('#000000', 0.45); c.lineWidth = 0.6 + 1.6 / z; c.stroke();
        c.strokeStyle = rgba(o.light, 0.25); c.lineWidth = 1; c.beginPath(); c.moveTo(pts[2][0], pts[2][1]); c.lineTo(pts[3][0], pts[3][1]); c.lineTo(pts[4][0], pts[4][1]); c.stroke();
      }
    }
  }
  def('penghu', (c, rnd) => {
    vfill(c, 0, 320, [[0, '#2a6ac0'], [0.6, '#8ac0e8'], [1, '#e8f4f4']]);
    for (let i = 0; i < 8; i++) { const x = rnd() * W, y = 40 + rnd() * 200; for (let k = 0; k < 5; k++) softBlob(c, x + k * 60, y + (rnd() - 0.5) * 12, 120, 16 + rnd() * 12, '#ffffff', 0.55); }
    sun(c, 1100, 70, 22, '#fffef0', '#fff4c8', 0.4);
    // turquoise shallows with the double-heart stone weir
    water(c, 316, 440, { stops: [[0, '#5ab0d0'], [0.2, '#2a9ab8'], [0.6, '#4ac0c0'], [1, '#7ad8c8']], light: '#ffffff', dark: '#0a5a7a', seed: 231, streaks: 260 });
    const weir = (cx, cy, rx, ry) => {
      c.strokeStyle = '#4a4a44'; c.lineWidth = 5; c.lineCap = 'round';
      const heart = (ox, oy, s) => { c.beginPath(); c.moveTo(ox, oy + ry * s * 0.9); c.bezierCurveTo(ox - rx * s * 1.4, oy - ry * s * 0.2, ox - rx * s * 0.6, oy - ry * s * 1.4, ox, oy - ry * s * 0.5); c.bezierCurveTo(ox + rx * s * 0.6, oy - ry * s * 1.4, ox + rx * s * 1.4, oy - ry * s * 0.2, ox, oy + ry * s * 0.9); c.stroke(); };
      heart(cx, cy, 1); heart(cx, cy + ry * 0.05, 0.62);
      c.strokeStyle = rgba('#e8e0d0', 0.45); c.lineWidth = 2; heart(cx, cy - 1.5, 1); heart(cx, cy + ry * 0.05 - 1.5, 0.62);
      c.fillStyle = rgba('#6ad8d0', 0.25); c.beginPath(); c.ellipse(cx, cy, rx * 1.2, ry * 1.1, 0, 0, TAU); c.fill();
    };
    weir(560, 372, 120, 26);
    c.strokeStyle = '#4a4a44'; c.lineWidth = 4; c.beginPath(); c.moveTo(860, 360); c.quadraticCurveTo(980, 330, 1100, 362); c.stroke();
    // basalt column cliff on the left, island on the right
    const colCliff = (x0, x1, top, base) => {
      for (let x = x0; x < x1; x += 16) {
        const h = top + (fbm(x * 0.02, 4, 3) - 0.5) * 40 + Math.abs(x - (x0 + x1) / 2) * 0.12;
        c.fillStyle = lg(c, x, 0, x + 16, 0, [[0, '#5a5a60'], [0.3, '#3a3a40'], [1, '#14141a']]); c.fillRect(x, h, 16, base - h);
        c.fillStyle = '#7a7a80'; c.beginPath(); c.moveTo(x, h); c.lineTo(x + 8, h - 4); c.lineTo(x + 16, h); c.lineTo(x + 8, h + 3); c.fill();
        c.fillStyle = rgba('#000', 0.25); for (let y = h + 20 + (x % 30); y < base; y += 34) c.fillRect(x, y, 16, 1.5);
      }
      c.fillStyle = rgba('#5a8a3a', 0.85); for (let x = x0; x < x1; x += 10) { ellipse(c, x + 6, top - 8 + (fbm(x * 0.02, 4, 3) - 0.5) * 40 + Math.abs(x - (x0 + x1) / 2) * 0.12, 12, 5); c.fill(); }
    };
    colCliff(-10, 330, 190, 430);
    mountain(c, { y: 318, amp: 26, freq: 0.01, seed: 232, x0: 980, x1: W + 10, shape: (x) => -Math.min(1, (x - 980) / 100) * 30, col: '#5a6a5a', col2: '#6a7a6a', bottom: 322, haze: '#e8f4f4', hazeA: 0.4 });
    // basalt platform ground: hexagonal column tops
    c.fillStyle = '#2a2a30'; c.fillRect(0, 430, W, 290);
    hexGround(c, 430, { dark: '#1a1a20', light: '#8a8a94', seed: 233 });
    c.fillStyle = lg(c, 0, 428, 0, 470, [[0, rgba('#e8f4f4', 0.4)], [1, rgba('#e8f4f4', 0)]]); c.fillRect(0, 428, W, 42);
    c.fillStyle = rg(c, 760, 520, 600, [[0, rgba('#fff0d0', 0.12)], [1, rgba('#fff0d0', 0)]]); c.fillRect(0, 420, W, 300);
    // windswept grass tufts in the cracks at the edges
    grass(c, rnd, 440, 720, 300, ['#8a9a4a', '#6a7a3a', '#b0b060'], { h: 18, lean: 0.9, a: 0.7 });
    vignette(c, 0.3, '#0a1a24', 0.5);
    grain(c, rnd, 3000, 0.025);
  }, (ctx, t) => {
    waveGlints(ctx, t, { n: 80, seed: 234, y0: 318, y1: 430, col: '#ffffff', a: 0.8, len: 10 });
    ctx.save();
    for (let k = 0; k < 3; k++) {
      const ph = mod(t * 0.25 + k / 3, 1), y = 426 - ph * 10, a = Math.sin(ph * Math.PI) * 0.5;
      ctx.strokeStyle = rgba('#ffffff', a); ctx.lineWidth = 2; ctx.beginPath();
      for (let x = 320; x <= W; x += 20) { const yy = y + Math.sin(x * 0.02 + k * 2 + t) * 3; x === 320 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
      ctx.stroke();
    }
    ctx.restore();
    windStreaks(ctx, t, 235, 14, 550, 30, 640, 0.3);
    ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) { const x = mod(t * (60 + i * 10) + i * 400, W + 200) - 100, y = 120 + i * 40 + Math.sin(t + i) * 15, f = Math.sin(t * 5 + i) * 5; ctx.beginPath(); ctx.moveTo(x - 12, y - f); ctx.quadraticCurveTo(x - 4, y - 3, x, y); ctx.quadraticCurveTo(x + 4, y - 3, x + 12, y - f); ctx.stroke(); }
    ctx.restore();
  });

  // ---------- 玄武嶼: 夜玄's temple on a black basalt isle ----------
  let XW_E = null;
  def('xuanwu', (c, rnd) => {
    vfill(c, 0, 380, [[0, '#020308'], [0.5, '#0a1020'], [1, '#1a2438']]);
    for (let i = 0; i < 10; i++) cloud(c, rnd() * W, 40 + rnd() * 200, 300 + rnd() * 300, 60 + rnd() * 40, { top: '#2a3448', mid: '#141a28', bot: '#06080e', hi: '#6a8ac0', hiA: 0.2, a: 0.85, seed: i + 40, flat: false });
    water(c, 360, 440, { stops: [[0, '#1a2a40'], [0.2, '#0a1420'], [1, '#04080e']], light: '#6a9ad0', seed: 241, streaks: 260 });
    // black basalt isle rising behind, columns
    for (let x = 220; x < 1060; x += 14) {
      const top = 230 + Math.abs(x - 640) * 0.28 + (fbm(x * 0.03, 5, 3) - 0.5) * 30;
      c.fillStyle = lg(c, x, 0, x + 14, 0, [[0, '#2a2e3a'], [0.35, '#14161e'], [1, '#050608']]); c.fillRect(x, top, 14, 440 - top);
      c.fillStyle = rgba('#6a8ac0', 0.25); c.fillRect(x, top, 14, 2);
    }
    XW_E = templeHall(c, 640, 262, 300, 96, { double: true, wall: '#1a1a24', pillar: '#2a1a3a', door: '#0a0a14', studs: '#4a6aa0', win: '#0a1428', lattice: '#2a3a5a', lit: '#4a9aff', tile: '#14161e', ridge: '#2a2a3a', stone: '#3a3e4a', orn: '#4a9aff', plaque: '長明宮' });
    glow(c, 640, 220, 260, '#3a7aff', 0.3);
    // long stair up to the temple
    for (let i = 0; i < 14; i++) { const y = 268 + i * 11, w = 120 + i * 14; c.fillStyle = i % 2 ? '#22242e' : '#2a2c38'; c.fillRect(640 - w / 2, y, w, 11); c.fillStyle = rgba('#8ab0e0', 0.15); c.fillRect(640 - w / 2, y, w, 1.5); }
    // basalt terrace (ground)
    c.fillStyle = '#121218'; c.fillRect(0, 420, W, 300);
    hexGround(c, 420, { dark: '#08080c', light: '#4a4e5e', seed: 242 });
    c.fillStyle = rg(c, 640, 480, 600, [[0, rgba('#3a7aff', 0.16)], [1, rgba('#3a7aff', 0)]]); c.fillRect(0, 400, W, 320);
    // blue lantern posts flanking the stair
    for (const x of [470, 810, 140, 1140]) { c.fillStyle = '#1a1c24'; c.fillRect(x - 4, 340, 8, 90); c.fillRect(x - 12, 336, 24, 6); }
    vignette(c, 0.7, '#000000', 0.38);
    grain(c, rnd, 4500, 0.035);
  }, (ctx, t) => {
    if (XW_E) for (let i = 0; i < 4; i++) hangLantern(ctx, t, U.lerp(XW_E.x0 + 30, XW_E.x1 - 30, i / 3), XW_E.eaveY + 4, '#3a6ad0', 9, i + 30, { glowR: 70, glowA: 0.5, glowCol: '#4a9aff', sway: 0.1 });
    for (const [x, i] of [[470, 0], [810, 1], [140, 2], [1140, 3]]) hangLantern(ctx, t, x, 342, '#2a5ac0', 10, i + 40, { glowR: 90, glowA: 0.55, glowCol: '#4a9aff', sway: 0.12, char: '冥' });
    // souls streaming up the stair into the temple
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const ph = mod(t * 0.08 + U.hash(i, 1, 243), 1), side = U.hash(i, 2, 243) - 0.5;
      const x = 640 + side * (1 - ph) * 1100 + Math.sin(t + i) * 10, y = 600 - ph * 380 - Math.sin(ph * Math.PI) * 60;
      lglow(ctx, x, y, 14, '#6ab8ff', 0.6 * Math.sin(ph * Math.PI), true);
    }
    const flash = Math.max(0, Math.sin(t * 0.7) * Math.sin(t * 11.3) - 0.88) * 8;
    if (flash > 0) { lglow(ctx, 300 + mod(Math.floor(t * 0.7 / Math.PI) * 377, 700), 100, 600, '#a8c8ff', flash * 0.35); }
    ctx.restore();
    waveGlints(ctx, t, { n: 50, seed: 244, y0: 362, y1: 432, col: '#6a9ad0', a: 0.6, len: 12 });
    mist(ctx, t, 'xw1', '#3a5a8a', 330, 130, 0.4, 12, 36, 245);
    mist(ctx, t, 'xw2', '#2a3a5a', 520, 160, 0.35, -16, 36, 246);
  });

  // =====================================================================================
  // public API
  // =====================================================================================
  function fallback(ctx) {
    ctx.fillStyle = lg(ctx, 0, 0, 0, H, [[0, '#121626'], [1, '#05060a']]);
    ctx.fillRect(0, 0, W, H);
  }
  G.Backdrops = {
    has: (id) => !!scenes[id],
    ids: () => Object.keys(scenes),
    preload(id) { if (scenes[id]) base(id); },
    draw(ctx, id, t) {
      const s = scenes[id];
      if (!s) { fallback(ctx); return; }
      ctx.save();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      if (s.shift) {
        const d = s.shift(t || 0), ox = snap(d[0]), oy = snap(d[1]);
        ctx.fillStyle = s.edge || '#000';
        if (oy > 0) ctx.fillRect(0, 0, W, oy + 1); else if (oy < 0) ctx.fillRect(0, H + oy - 1, W, 1 - oy);
        if (ox > 0) ctx.fillRect(0, 0, ox + 1, H); else if (ox < 0) ctx.fillRect(W + ox - 1, 0, 1 - ox, H);
        ctx.drawImage(base(id), ox, oy, W, H);
      } else if (s.xf) {
        ctx.save(); ctx.translate(W / 2, H / 2); s.xf(ctx, t || 0); ctx.translate(-W / 2, -H / 2);
        ctx.drawImage(base(id), -W * 0.02, -H * 0.02, W * 1.04, H * 1.04);
        ctx.restore();
      } else ctx.drawImage(base(id), 0, 0, W, H);
      if (s.live) { try { s.live(ctx, t || 0); } catch (e) { if (G.debug) console.error('backdrop live', id, e); } }
      ctx.restore();
    },
  };
})();
