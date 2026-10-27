// 彼岸燈 Shorelight — Character design pass v2 — 白芷 (Bai Zhi)
// Shared drawing library: colour, splines/ribbons, cel-shaded parts, faces, hands, feet, card layout.
// Everything is procedural Canvas 2D. Design space: figure origin at ground centre, y down, crown at y = -H.
(function () {
  'use strict';
  const BZ = (window.BZ = window.BZ || {});
  const G = (BZ.G = { ctx: null, f: 1, base: 1, sil: false, rim: '#fff4dc', shTint: '#4a3f78', shAmt: 0.32, light: [3.2, 2.6] });

  // ---------------------------------------------------------------- colour
  function h2r(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function r2h(r, g, b) {
    return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  function mix(a, b, t) {
    const A = h2r(a), B = h2r(b);
    return r2h(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }
  function rgba(h, a) {
    const [r, g, b] = h2r(h);
    return `rgba(${r},${g},${b},${a})`;
  }
  const ink = (c, t = 0.6) => mix(c, '#1c0f1f', t);
  const shadowOf = (c, k = 1) => mix(mix(c, G.shTint, G.shAmt * k), '#000000', 0.07 * k);
  const lighten = (c, t = 0.3) => mix(c, '#ffffff', t);
  Object.assign(BZ, { h2r, r2h, mix, rgba, ink, shadowOf, lighten });

  // ---------------------------------------------------------------- line width (screen-consistent)
  function LW(px) {
    const m = G.ctx.getTransform();
    const s = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
    return (px * G.f * G.base) / s;
  }
  BZ.LW = LW;

  // ---------------------------------------------------------------- geometry
  const M = (dx, dy) => new DOMMatrix().translate(dx, dy);
  function P(fn) {
    const p = new Path2D();
    fn(p);
    return p;
  }
  function cr(pts, seg = 10) {
    if (pts.length < 2) return pts.slice();
    const out = [];
    const Q = [pts[0], ...pts, pts[pts.length - 1]];
    for (let i = 1; i < Q.length - 2; i++) {
      const p0 = Q[i - 1], p1 = Q[i], p2 = Q[i + 1], p3 = Q[i + 2];
      for (let j = 0; j < seg; j++) {
        const t = j / seg, t2 = t * t, t3 = t2 * t;
        const f = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
        out.push([f(0), f(1)]);
      }
    }
    out.push(pts[pts.length - 1].slice());
    return out;
  }
  function wAt(w, t) {
    if (typeof w === 'number') return w;
    if (typeof w === 'function') return w(t);
    const n = w.length - 1;
    const x = t * n, i = Math.min(n - 1, Math.floor(x)), f = x - i;
    const s = f * f * (3 - 2 * f);
    return w[i] + (w[i + 1] - w[i]) * s;
  }
  function ribbonPts(pts, w, seg) {
    const s = cr(pts, seg || 10);
    const n = s.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = s[Math.max(0, i - 1)], b = s[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      const hw = wAt(w, i / (n - 1));
      L.push([s[i][0] - ty * hw, s[i][1] + tx * hw]);
      R.push([s[i][0] + ty * hw, s[i][1] - tx * hw]);
    }
    return { L, R, s };
  }
  // closed tapered ribbon along a spline; w = number | array | fn(t) (half-width)
  function ribbon(pts, w, o = {}) {
    const { L, R } = ribbonPts(pts, w, o.seg);
    const p = o.path || new Path2D();
    p.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < L.length; i++) p.lineTo(L[i][0], L[i][1]);
    const e = L.length - 1;
    if (o.capEnd === 'round') {
      const mx = (L[e][0] + R[e][0]) / 2, my = (L[e][1] + R[e][1]) / 2;
      const r = Math.hypot(L[e][0] - mx, L[e][1] - my);
      const a0 = Math.atan2(L[e][1] - my, L[e][0] - mx);
      p.arc(mx, my, r, a0, a0 + Math.PI, true);
    }
    for (let i = e; i >= 0; i--) p.lineTo(R[i][0], R[i][1]);
    if (o.capStart === 'round') {
      const mx = (L[0][0] + R[0][0]) / 2, my = (L[0][1] + R[0][1]) / 2;
      const r = Math.hypot(L[0][0] - mx, L[0][1] - my);
      const a0 = Math.atan2(R[0][1] - my, R[0][0] - mx);
      p.arc(mx, my, r, a0, a0 + Math.PI, true);
    }
    p.closePath();
    return p;
  }
  // polyline through smooth spline (open)
  function curve(pts, seg) {
    const s = cr(pts, seg || 10);
    const p = new Path2D();
    p.moveTo(s[0][0], s[0][1]);
    for (let i = 1; i < s.length; i++) p.lineTo(s[i][0], s[i][1]);
    return p;
  }
  // closed smooth blob through points
  function blob(pts) {
    const n = pts.length;
    const ext = [pts[n - 1], ...pts, pts[0], pts[1]];
    const p = new Path2D();
    const s = [];
    for (let i = 1; i < ext.length - 2; i++) {
      const seg = cr([ext[i - 1], ext[i], ext[i + 1], ext[i + 2]], 10);
      // the middle segment of a 4-point chain is points 10..20
      for (let j = 10; j < 20; j++) s.push(seg[j]);
    }
    p.moveTo(s[0][0], s[0][1]);
    for (let i = 1; i < s.length; i++) p.lineTo(s[i][0], s[i][1]);
    p.closePath();
    return p;
  }
  const mirrorPts = (pts) => pts.map(([x, y]) => [-x, y]);
  function poly(pts, close = true) {
    const p = new Path2D();
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    if (close) p.closePath();
    return p;
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const lp = (A, B, t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t)];
  Object.assign(BZ, { M, P, cr, ribbon, ribbonPts, curve, blob, poly, mirrorPts, lerp, lp, wAt });

  // ---------------------------------------------------------------- cel-shaded part
  // part(path, fill, {sh, shift, rim, rimW, line, lw, inner(c), hi, grad:[top,bottom,y0,y1], rule, noLine})
  function part(p, fill, o = {}) {
    const c = G.ctx;
    const rule = o.rule || 'nonzero';
    if (G.sil) {
      if (o.noSil) return;
      c.fillStyle = '#000';
      c.fill(p, rule);
      return;
    }
    c.save();
    if (o.alpha != null) c.globalAlpha *= o.alpha;
    c.fillStyle = fill;
    c.fill(p, rule);
    c.save();
    c.clip(p, rule);
    if (o.grad) {
      const [ct, cb, y0, y1] = o.grad;
      const g = c.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, ct);
      g.addColorStop(1, cb);
      c.fillStyle = g;
      c.fill(p, rule);
    }
    if (o.under) o.under(c);
    if (o.sh !== false) {
      const sh = o.sh || shadowOf(fill);
      const [dx, dy] = o.shift || G.light;
      const q = new Path2D();
      q.rect(-1e4, -1e4, 2e4, 2e4);
      q.addPath(p, M(-dx, -dy));
      c.fillStyle = sh;
      c.fill(q, 'evenodd');
    }
    if (o.inner) o.inner(c);
    if (o.rim !== false && G.rim) {
      const r = o.rimW || 1.4;
      const q = new Path2D();
      q.rect(-1e4, -1e4, 2e4, 2e4);
      q.addPath(p, M(-r, -r * 0.35));
      c.fillStyle = rgba(o.rim || G.rim, o.rimA != null ? o.rimA : 0.75);
      c.fill(q, 'evenodd');
    }
    if (o.hi) {
      c.fillStyle = o.hiC || rgba('#ffffff', 0.35);
      c.fill(o.hi);
    }
    c.restore();
    if (!o.noLine) {
      c.strokeStyle = o.line || ink(fill);
      c.lineWidth = LW(o.lw || 1.7);
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.stroke(p);
    }
    c.restore();
  }
  // tapered stroke (fold / strand / crease) — filled ribbon with zero-width ends
  function stroke(pts, w, col, o = {}) {
    const c = G.ctx;
    if (G.sil) return;
    const wp = o.prof || [0, 1, 0.25];
    const p = ribbon(pts, (t) => wAt(wp, t) * LW(w) * 0.5, { seg: 8 });
    c.save();
    if (o.alpha != null) c.globalAlpha *= o.alpha;
    c.fillStyle = col;
    c.fill(p);
    c.restore();
  }
  function line(path, col, w, o = {}) {
    const c = G.ctx;
    if (G.sil) return;
    c.save();
    if (o.alpha != null) c.globalAlpha *= o.alpha;
    if (o.dash) c.setLineDash(o.dash.map((d) => LW(d)));
    c.strokeStyle = col;
    c.lineWidth = LW(w);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.stroke(path);
    c.restore();
  }
  function fillP(path, col, o = {}) {
    const c = G.ctx;
    if (G.sil && !o.sil) return;
    c.save();
    if (o.alpha != null) c.globalAlpha *= o.alpha;
    if (o.comp) c.globalCompositeOperation = o.comp;
    c.fillStyle = G.sil ? '#000' : col;
    c.fill(path, o.rule || 'nonzero');
    c.restore();
  }
  // soft glow (radial)
  function glow(x, y, r, col, a = 0.6, comp = 'lighter') {
    const c = G.ctx;
    if (G.sil) return;
    c.save();
    c.globalCompositeOperation = comp;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a));
    g.addColorStop(0.45, rgba(col, a * 0.35));
    g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.restore();
  }
  // run fn clipped to path
  function clipped(path, fn, rule) {
    const c = G.ctx;
    if (G.sil) return;
    c.save();
    c.clip(path, rule || 'nonzero');
    fn(c);
    c.restore();
  }
  Object.assign(BZ, { part, stroke, line, fillP, glow, clipped });

  // ---------------------------------------------------------------- small decorative helpers
  // 盤扣 knot button (frog) centred at x,y, horizontal, size s, side: loop direction
  function knot(x, y, s, col, o = {}) {
    if (G.sil) return;
    const c = G.ctx;
    const a = o.angle || 0;
    c.save();
    c.translate(x, y);
    c.rotate(a);
    const L = ink(col, 0.45);
    // two bars
    const bar = ribbon([[-s * 1.1, 0], [-s * 0.2, 0]], s * 0.2, { capStart: 'round' });
    const bar2 = ribbon([[s * 0.2, 0], [s * 1.1, 0]], s * 0.2, { capEnd: 'round' });
    part(bar, col, { sh: false, rim: false, line: L, lw: 1 });
    part(bar2, col, { sh: false, rim: false, line: L, lw: 1 });
    // knot ball
    const ball = P((p) => p.arc(-s * 0.15, 0, s * 0.32, 0, Math.PI * 2));
    part(ball, lighten(col, 0.15), { sh: false, rim: false, line: L, lw: 1 });
    // loop end flower
    if (o.flower) {
      for (let i = 0; i < 3; i++) {
        const ang = -0.9 + i * 0.9;
        const lp2 = P((p) => p.ellipse(s * 1.2 + Math.cos(ang) * s * 0.35, Math.sin(ang) * s * 0.35, s * 0.28, s * 0.16, ang, 0, Math.PI * 2));
        part(lp2, col, { sh: false, rim: false, line: L, lw: 0.9 });
      }
    }
    c.restore();
  }
  // tassel hanging down from (x,y)
  function tassel(x, y, len, col, o = {}) {
    const w = o.w || len * 0.18;
    const cap = P((p) => p.ellipse(x, y + w * 0.5, w * 0.55, w * 0.6, 0, 0, Math.PI * 2));
    const body = P((p) => {
      p.moveTo(x - w * 0.45, y + w * 0.7);
      p.quadraticCurveTo(x - w * 0.9, y + len * 0.7, x - w * 0.8 + (o.sway || 0), y + len);
      p.lineTo(x + w * 0.8 + (o.sway || 0), y + len);
      p.quadraticCurveTo(x + w * 0.9, y + len * 0.7, x + w * 0.45, y + w * 0.7);
      p.closePath();
    });
    part(body, col, { rimW: 1, lw: 1.1 });
    if (!G.sil)
      for (let i = -2; i <= 2; i++)
        stroke([[x + i * w * 0.15, y + len * 0.35], [x + i * w * 0.3 + (o.sway || 0) * 0.8, y + len * 0.97]], 0.9, ink(col, 0.35), { prof: [0.5, 1, 0.3] });
    part(cap, o.cap || mix(col, '#e8c060', 0.6), { sh: false, lw: 1.1 });
  }
  // jade tag 玉牌 carved 白芷
  function jadeTag(x, y, s, o = {}) {
    const jade = o.col || '#86c4a2';
    const str = o.str || '#c8323c';
    if (o.cord !== false) line(curve([[x, y - s * (o.cordLen || 1.2)], [x + s * 0.05, y - s * 0.5], [x, y - s * 0.62]]), str, 1.4);
    const tag = P((p) => {
      p.moveTo(x - s * 0.36, y - s * 0.5);
      p.quadraticCurveTo(x, y - s * 0.78, x + s * 0.36, y - s * 0.5);
      p.lineTo(x + s * 0.36, y + s * 0.5);
      p.quadraticCurveTo(x, y + s * 0.66, x - s * 0.36, y + s * 0.5);
      p.closePath();
    });
    part(tag, jade, { sh: mix(jade, '#1f4d44', 0.4), rim: '#eafff4', rimW: 1, lw: 1.2, hi: P((p) => p.ellipse(x - s * 0.15, y - s * 0.25, s * 0.08, s * 0.25, 0.2, 0, 7)), hiC: 'rgba(255,255,255,0.55)' });
    if (!G.sil && s > 5) {
      const c = G.ctx;
      c.save();
      c.fillStyle = ink(jade, 0.5);
      c.font = `${s * 0.4}px "WenQuanYi Zen Hei"`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('白', x, y - s * 0.12);
      c.fillText('芷', x, y + s * 0.28);
      c.restore();
    }
    if (o.tassel !== false) tassel(x, y + s * 0.55, s * 0.9, str, { w: s * 0.22 });
  }
  // little sparkles / motes
  function motes(list, col, a = 0.9) {
    if (G.sil) return;
    for (const [x, y, r] of list) {
      glow(x, y, r * 4, col, a * 0.5);
      fillP(P((p) => p.arc(x, y, r * 0.6, 0, 7)), '#ffffff', { alpha: a });
    }
  }
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }
  Object.assign(BZ, { knot, tassel, jadeTag, motes, rng });

  // ---------------------------------------------------------------- body rig
  // returns landmark helper for a figure of height H with `ratio` heads
  function rig(ratio, H = 420) {
    const hu = H / ratio;
    const bu = (hu * (ratio - 1)) / 6;
    const Y = (t) => (t <= 1 ? -H + t * hu : -H + hu + (t - 1) * bu);
    return { H, hu, bu, ratio, Y, crown: -H, chin: -H + hu };
  }
  BZ.rig = rig;

  // ---------------------------------------------------------------- FACE
  // Draws face in head-local units: crown (0,0), chin (0,1). Caller sets transform (translate+scale by hu).
  // F: {W, jawX, jawY, chinW, chinY, cheek, skin, skinSh, line, eye{...}, brow{...}, nose{...}, mouth{...}, blush, ear}
  function faceShape(F) {
    const W = F.W, jx = F.jawX, jy = F.jawY, cw = F.chinW, cy = F.chinY || 0.985;
    const ck = F.cheek || 0; // cheek fullness
    return P((p) => {
      p.moveTo(-W, 0.36);
      p.bezierCurveTo(-W - 0.01, 0.52 + ck * 0.1, -W + 0.02 - ck * 0.03, jy - 0.1, -jx, jy);
      p.bezierCurveTo(-jx + 0.07 + ck * 0.03, jy + 0.1, -cw - 0.04, cy, -cw * 0.3, 1.0);
      p.quadraticCurveTo(0, 1.005, cw * 0.3, 1.0);
      p.bezierCurveTo(cw + 0.04, cy, jx - 0.07 - ck * 0.03, jy + 0.1, jx, jy);
      p.bezierCurveTo(W - 0.02 + ck * 0.03, jy - 0.1, W + 0.01, 0.52 + ck * 0.1, W, 0.36);
      p.bezierCurveTo(W, -0.02, -W, -0.02, -W, 0.36);
      p.closePath();
    });
  }
  function ear(F, side) {
    const W = F.W;
    const e = F.ear || {};
    const y0 = e.y0 || 0.47, y1 = e.y1 || 0.68;
    const x = side * (W - 0.015);
    const p = P((p) => {
      p.moveTo(x, y0);
      p.bezierCurveTo(x + side * 0.09, y0 - 0.04, x + side * 0.1, y1 - 0.08, x + side * 0.025, y1);
      p.lineTo(x - side * 0.01, y1 - 0.02);
      p.closePath();
    });
    part(p, F.skin, { sh: F.skinSh, rim: false, line: F.line, lw: 1.2 });
    line(curve([[x + side * 0.02, y0 + 0.04], [x + side * 0.06, y0 + 0.06], [x + side * 0.04, y1 - 0.06]]), mix(F.skinSh, F.line, 0.3), 1);
  }
  function drawFace(F) {
    const c = G.ctx;
    const skin = F.skin, sk = F.skinSh || shadowOf(skin);
    F.skinSh = sk;
    F.line = F.line || ink(skin, 0.55);
    if (F.ear && F.ear.show) {
      ear(F, -1);
      ear(F, 1);
    }
    const fp = faceShape(F);
    if (G.sil) {
      fillP(fp, '#000', { sil: true });
      return;
    }
    part(fp, skin, {
      sh: false,
      rim: false,
      line: F.line,
      lw: 1.6,
      inner: (c) => {
        // jaw/cheek form shadow on viewer-right side
        const q = P((p) => {
          p.moveTo(F.W + 0.1, 0.3);
          p.lineTo(F.W * 0.86, 0.55);
          p.bezierCurveTo(F.W * 0.82, 0.72, F.jawX * 0.7, 0.9, 0.05, 1.02);
          p.lineTo(0.6, 1.2);
          p.closePath();
        });
        c.fillStyle = rgba(sk, 0.85);
        c.fill(q);
        // soft under-chin warmth
        const g = c.createRadialGradient(0, 1.05, 0.02, 0, 1.05, 0.25);
        g.addColorStop(0, rgba(sk, 0.5));
        g.addColorStop(1, rgba(sk, 0));
        c.fillStyle = g;
        c.fillRect(-0.5, 0.75, 1, 0.4);
        // blush
        if (F.blush) {
          for (const s of [-1, 1]) {
            const bx = s * (F.eye.x + 0.02), by = F.eye.y + 0.14;
            const g2 = c.createRadialGradient(bx, by, 0, bx, by, 0.11);
            g2.addColorStop(0, rgba(F.blushC || '#f08a8a', 0.55 * F.blush));
            g2.addColorStop(1, rgba(F.blushC || '#f08a8a', 0));
            c.fillStyle = g2;
            c.beginPath();
            c.ellipse(bx, by, 0.13, 0.07, 0, 0, 7);
            c.fill();
            if (F.blushLines) {
              c.strokeStyle = rgba('#d0606a', 0.6);
              c.lineWidth = LW(0.9);
              for (let i = 0; i < 3; i++) {
                c.beginPath();
                c.moveTo(bx - 0.05 + i * 0.035, by + 0.02);
                c.lineTo(bx - 0.03 + i * 0.035, by - 0.02);
                c.stroke();
              }
            }
          }
        }
        if (F.paint) F.paint(c, F);
      },
    });
    // eyes
    for (const s of [-1, 1]) eye(F, s);
    // brows
    for (const s of [-1, 1]) brow(F, s);
    nose(F);
    mouth(F);
    if (F.mole) fillP(P((p) => p.arc(F.mole[0], F.mole[1], F.moleR || 0.011, 0, 7)), '#3a2224');
    if (F.freckles) {
      const r = rng(7);
      for (const s of [-1, 1])
        for (let i = 0; i < 6; i++) fillP(P((p) => p.arc(s * (0.12 + r() * 0.14), F.eye.y + 0.1 + r() * 0.07, 0.006, 0, 7)), rgba('#b5705a', 0.65));
    }
  }
  function eye(F, s) {
    const E = F.eye;
    const c = G.ctx;
    const ex = s * E.x, ey = E.y;
    const w = E.w, h = E.h;
    const tilt = E.tilt || 0; // + = outer corner up
    const inX = ex - s * w * 0.5, outX = ex + s * w * 0.5;
    const inY = ey + 0.004, outY = ey - tilt;
    const shp = E.shape || 'almond';
    const peak = E.peak != null ? E.peak : shp === 'round' ? 0.5 : shp === 'droop' ? 0.62 : shp === 'cat' ? 0.4 : 0.45; // 0 = inner, 1 = outer
    const pk = lerp(inX, outX, peak);
    const upH = h * (shp === 'round' ? 0.62 : shp === 'narrow' ? 0.42 : 0.55);
    const loH = h * (shp === 'round' ? 0.48 : shp === 'narrow' ? 0.25 : shp === 'cat' ? 0.3 : 0.38);
    const topY = lerp(inY, outY, peak) - upH;
    const botY = lerp(inY, outY, 0.5) + loH;
    if (E.closed) {
      // closed eye: lash curve
      const happy = E.closed === 'happy';
      const pth = curve(happy ? [[inX, inY + 0.005], [ex, ey - h * 0.35], [outX, outY + 0.01]] : [[inX, inY - 0.005], [ex, ey + h * 0.28], [outX + s * 0.01, outY - 0.005]]);
      line(pth, E.lineC || F.line, (E.lineW || 2.6) * 1.0);
      if (!happy) {
        for (let i = 0; i < 3; i++) stroke([[lerp(ex, outX, 0.4 + i * 0.25), lerp(ey + h * 0.2, outY, 0.4 + i * 0.25)], [lerp(ex, outX, 0.45 + i * 0.25) + s * 0.012, lerp(ey + h * 0.2, outY, 0.4 + i * 0.25) + 0.035]], 1.2, E.lineC || F.line);
        if (E.crease !== false) line(curve([[lerp(inX, ex, 0.4), inY - h * 0.25], [ex, ey - h * 0.35], [outX, outY - h * 0.3]]), mix(F.skinSh, F.line, 0.4), 0.9);
      }
      return;
    }
    const upper = (p) => {
      p.moveTo(inX, inY);
      p.bezierCurveTo(lerp(inX, pk, 0.25), topY + upH * 0.2, lerp(pk, inX, 0.45), topY, pk, topY);
      p.bezierCurveTo(lerp(pk, outX, 0.55), topY, outX - s * w * 0.06, outY - upH * 0.25, outX, outY);
    };
    const white = P((p) => {
      upper(p);
      p.bezierCurveTo(outX - s * w * 0.12, outY + loH * 0.7, lerp(outX, inX, 0.35), botY, ex - s * w * 0.05, botY);
      p.bezierCurveTo(lerp(ex, inX, 0.6), botY, inX + s * w * 0.04, inY + loH * 0.5, inX, inY);
      p.closePath();
    });
    // white
    fillP(white, E.white || '#fbf7f2');
    clipped(white, (c) => {
      // iris
      const ir = E.irisR || w * 0.33;
      const irh = ir * (E.irisH || 1.18);
      const ix = ex + s * (E.look || 0) * w + (E.lookX || 0), iy = ey + (E.irisDy || h * 0.06);
      const col = E.iris;
      const g = c.createLinearGradient(0, iy - irh, 0, iy + irh);
      g.addColorStop(0, ink(col, 0.55));
      g.addColorStop(0.45, col);
      g.addColorStop(1, lighten(col, 0.45));
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(ix, iy, ir, irh, 0, 0, 7);
      c.fill();
      // radial fibres
      c.strokeStyle = rgba(ink(col, 0.3), 0.35);
      c.lineWidth = LW(0.6);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        c.beginPath();
        c.moveTo(ix + Math.cos(a) * ir * 0.45, iy + Math.sin(a) * irh * 0.45);
        c.lineTo(ix + Math.cos(a) * ir * 0.9, iy + Math.sin(a) * irh * 0.9);
        c.stroke();
      }
      // pupil
      const pr = ir * (E.pupil || 0.42);
      c.fillStyle = E.pupilC || ink(col, 0.75);
      c.beginPath();
      if (E.slit) c.ellipse(ix, iy, pr * 0.35, irh * 0.62, 0, 0, 7);
      else c.ellipse(ix, iy, pr, pr * 1.15, 0, 0, 7);
      c.fill();
      if (E.pupilRing) {
        c.strokeStyle = E.pupilRing;
        c.lineWidth = LW(1.1);
        c.beginPath();
        c.ellipse(ix, iy, pr * 1.35, pr * 1.5, 0, 0, 7);
        c.stroke();
      }
      // iris rim
      c.strokeStyle = ink(col, 0.65);
      c.lineWidth = LW(1.0);
      c.beginPath();
      c.ellipse(ix, iy, ir, irh, 0, 0, 7);
      c.stroke();
      // lower reflected light
      c.fillStyle = rgba(E.refl || lighten(col, 0.6), 0.65);
      c.beginPath();
      c.ellipse(ix, iy + irh * 0.55, ir * 0.62, irh * 0.28, 0, 0, Math.PI);
      c.fill();
      // upper lid shadow
      const g2 = c.createLinearGradient(0, topY, 0, topY + h * 0.5);
      g2.addColorStop(0, rgba(E.lidSh || '#3a2a4a', 0.55));
      g2.addColorStop(1, rgba(E.lidSh || '#3a2a4a', 0));
      c.fillStyle = g2;
      c.fillRect(ex - w, topY - 0.02, w * 2, h * 0.6);
      // highlights (not mirrored: light from upper-left)
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.ellipse(ix - ir * 0.38, iy - irh * 0.42, ir * 0.3, ir * 0.24, -0.4, 0, 7);
      c.fill();
      c.beginPath();
      c.arc(ix + ir * 0.4, iy + irh * 0.38, ir * 0.11, 0, 7);
      c.fill();
      if (E.glow) {
        c.globalCompositeOperation = 'lighter';
        const g3 = c.createRadialGradient(ix, iy, 0, ix, iy, ir * 1.2);
        g3.addColorStop(0, rgba(E.glow, 0.55));
        g3.addColorStop(1, rgba(E.glow, 0));
        c.fillStyle = g3;
        c.fillRect(ix - ir * 2, iy - ir * 2, ir * 4, ir * 4);
        c.globalCompositeOperation = 'source-over';
      }
    });
    // upper lash line (thick, tapered toward inner corner, flick outward)
    const lc = E.lineC || mix(F.line, '#1a0d18', 0.5);
    const lw = E.lineW || 2.4;
    const s1 = cr([[inX, inY], [lerp(inX, pk, 0.5), topY + upH * 0.12], [pk, topY], [lerp(pk, outX, 0.6), topY + (outY - topY) * 0.25], [outX, outY], [outX + s * w * (E.flick || 0.14), outY - h * (E.flickUp || 0.12)]], 6);
    const lash = ribbon(s1.filter((_, i) => i % 2 === 0).concat([s1[s1.length - 1]]), (t) => LW(lw) * (0.18 + 0.82 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62)) * 0.55, { seg: 3 });
    fillP(lash, lc);
    // lashes
    const nl = E.lashes != null ? E.lashes : 3;
    for (let i = 0; i < nl; i++) {
      const t = 0.62 + i * 0.12;
      const bx = lerp(pk, outX, (t - 0.5) * 2), by = lerp(topY, outY, (t - 0.5) * 2) - 0.004;
      stroke([[bx, by], [bx + s * 0.022, by - 0.022 - i * 0.004]], 1.4, lc, { prof: [1, 0.6, 0] });
    }
    // lower lash line
    if (E.lower !== false) {
      line(curve([[outX - s * w * 0.04, outY + loH * 0.35], [lerp(outX, ex, 0.4), botY - 0.002], [lerp(ex, inX, 0.25), botY]]), rgba(lc, 0.65), 1.0);
    }
    // crease
    const lid = E.lid || 'double';
    if (lid === 'double') line(curve([[lerp(inX, pk, 0.55), topY - h * 0.08], [pk, topY - h * 0.2], [lerp(pk, outX, 0.85), lerp(topY, outY, 0.8) - h * 0.2]]), mix(F.skinSh, F.line, 0.35), 1.0);
    if (lid === 'hooded' || lid === 'mono') {
      fillP(P((p) => p.ellipse(pk, topY - h * 0.08, w * 0.42, h * 0.14, -s * tilt, Math.PI, 0)), rgba(F.skinSh, 0.6));
    }
    if (E.halfLid) {
      // relaxed upper lid covering iris top
      const lidP = P((p) => {
        p.moveTo(inX - s * 0.01, inY - 0.01);
        p.bezierCurveTo(lerp(inX, pk, 0.5), topY - 0.01, pk, topY - 0.02, outX + s * 0.01, outY - 0.01);
        p.bezierCurveTo(lerp(outX, pk, 0.5), topY + h * E.halfLid, lerp(inX, pk, 0.4), topY + h * E.halfLid, inX - s * 0.01, inY - 0.01);
        p.closePath();
      });
      fillP(lidP, F.skin);
      line(curve([[inX, inY - 0.003], [ex, topY + h * E.halfLid * 0.95], [outX, outY]]), lc, lw * 0.8);
    }
  }
  function brow(F, s) {
    const B = F.brow;
    const ix = s * (B.x0 || 0.06), ox = s * (B.x0 + B.len || 0.22);
    const iy = B.y + (B.tilt || 0), oy = B.y - (B.tilt || 0) + 0.01;
    const my = Math.min(iy, oy) - (B.arch || 0.02);
    const pts = [[ix, iy], [lerp(ix, ox, 0.55), my], [ox, oy]];
    const p = ribbon(pts, (t) => (B.th || 0.016) * (1 - t * 0.75), { seg: 8 });
    fillP(p, B.col || F.line);
  }
  function nose(F) {
    const N = F.nose || {};
    const y = N.y || 0.77, w = N.w || 0.03;
    const t = N.type || 'tip';
    const nc = mix(F.skinSh, F.line, 0.45);
    if (t === 'tip' || t === 'bridge') {
      stroke([[0.012, y - 0.005], [0.02, y + 0.008], [0.004, y + 0.016], [-0.012, y + 0.014]], 1.3, nc, { prof: [0.2, 1, 0.3] });
      if (t === 'bridge') stroke([[0.03, F.eye.y + 0.02], [0.026, y - 0.06], [0.02, y - 0.01]], 1.0, rgba(nc, 0.7), { prof: [0, 1, 0.2] });
      fillP(P((p) => p.ellipse(0.022, y - 0.02, 0.012, 0.035, 0, 0, 7)), rgba(F.skinSh, 0.6));
    } else if (t === 'button') {
      fillP(P((p) => p.ellipse(0.006, y + 0.004, w * 0.55, w * 0.3, 0, 0, 7)), rgba(F.skinSh, 0.9));
      fillP(P((p) => p.arc(-0.006, y - 0.006, w * 0.2, 0, 7)), 'rgba(255,255,255,0.7)');
    } else if (t === 'nostrils') {
      stroke([[-w, y + 0.005], [-w * 0.4, y + 0.012]], 1.1, nc);
      stroke([[w * 0.4, y + 0.012], [w, y + 0.005]], 1.1, nc);
      fillP(P((p) => p.ellipse(0.016, y - 0.025, 0.011, 0.04, 0, 0, 7)), rgba(F.skinSh, 0.6));
    }
  }
  function mouth(F) {
    const Mo = F.mouth || {};
    const y = Mo.y || 0.865, w = Mo.w || 0.075;
    const t = Mo.type || 'smile';
    const lc = Mo.lineC || mix(F.line, '#8a3040', 0.35);
    const inside = '#8a3040', tongue = '#e5757a';
    if (t === 'smile') {
      line(curve([[-w, y - 0.012], [-w * 0.4, y + 0.008], [0, y + 0.01], [w * 0.4, y + 0.008], [w, y - 0.012]]), lc, 1.4);
      fillP(P((p) => p.ellipse(0, y + 0.03, w * 0.35, 0.008, 0, 0, 7)), rgba(F.skinSh, 0.8));
    } else if (t === 'soft') {
      line(curve([[-w, y], [-w * 0.3, y + 0.004], [0, y + 0.0], [w * 0.3, y + 0.004], [w, y - 0.002]]), lc, 1.3);
      fillP(P((p) => p.ellipse(0, y + 0.028, w * 0.3, 0.007, 0, 0, 7)), rgba(F.skinSh, 0.8));
    } else if (t === 'open' || t === 'grin' || t === 'o' || t === 'sing') {
      const op = Mo.open || 0.05;
      let mp;
      if (t === 'o') mp = P((p) => p.ellipse(0, y + op * 0.3, w * 0.45, op * 0.6, 0, 0, 7));
      else if (t === 'sing') mp = P((p) => {
        p.moveTo(-w * 0.75, y);
        p.quadraticCurveTo(0, y - 0.012, w * 0.75, y);
        p.bezierCurveTo(w * 0.7, y + op, -w * 0.7, y + op, -w * 0.75, y);
        p.closePath();
      });
      else mp = P((p) => {
        p.moveTo(-w, y - (t === 'grin' ? 0.015 : 0.006));
        p.quadraticCurveTo(0, y + 0.006, w, y - (t === 'grin' ? 0.015 : 0.006));
        p.bezierCurveTo(w * 0.75, y + op, -w * 0.75, y + op, -w, y - (t === 'grin' ? 0.015 : 0.006));
        p.closePath();
      });
      fillP(mp, inside);
      clipped(mp, (c) => {
        c.fillStyle = tongue;
        c.beginPath();
        c.ellipse(0, y + op * 1.0, w * 0.6, op * 0.55, 0, 0, 7);
        c.fill();
        if (t === 'grin' || Mo.teeth) {
          c.fillStyle = '#ffffff';
          c.fillRect(-w, y - 0.03, w * 2, 0.03 + op * 0.18);
        }
      });
      line(mp, lc, 1.2);
      fillP(P((p) => p.ellipse(0, y + op + 0.022, w * 0.3, 0.007, 0, 0, 7)), rgba(F.skinSh, 0.8));
    } else if (t === 'lips') {
      // closed, naturally full lips with a faint asymmetric half-smile (viewer-right corner lifts)
      const lip = Mo.lip || '#d98892';
      const up = Mo.up != null ? Mo.up : 0.012;
      const lower = P((p) => {
        p.moveTo(-w * 0.78, y + 0.002);
        p.bezierCurveTo(-w * 0.5, y + 0.034, w * 0.5, y + 0.034, w * 0.8, y - up * 0.6);
        p.bezierCurveTo(w * 0.4, y + 0.006, -w * 0.4, y + 0.008, -w * 0.78, y + 0.002);
        p.closePath();
      });
      fillP(lower, lip);
      fillP(P((p) => p.ellipse(-w * 0.12, y + 0.016, w * 0.22, 0.005, 0, 0, 7)), 'rgba(255,255,255,0.45)');
      const upper = P((p) => {
        p.moveTo(-w, y);
        p.bezierCurveTo(-w * 0.6, y - 0.008, -w * 0.3, y - 0.02, -w * 0.12, y - 0.017);
        p.quadraticCurveTo(0, y - 0.01, w * 0.12, y - 0.018);
        p.bezierCurveTo(w * 0.3, y - 0.022, w * 0.62, y - 0.01 - up, w, y - up);
        p.bezierCurveTo(w * 0.5, y + 0.004 - up * 0.4, -w * 0.5, y + 0.006, -w, y);
        p.closePath();
      });
      fillP(upper, mix(lip, '#8a3a48', 0.25));
      line(curve([[-w * 1.02, y + 0.001], [-w * 0.4, y + 0.006], [0, y + 0.005], [w * 0.45, y + 0.002 - up * 0.35], [w * 1.04, y - up - 0.004]]), Mo.lineC || '#8a3a48', 1.3);
      // dimple-ish corner tick on the lifted side
      stroke([[w * 1.0, y - up - 0.006], [w * 1.12, y - up - 0.014]], 1, rgba('#8a3a48', 0.6));
      fillP(P((p) => p.ellipse(0, y + 0.05, w * 0.32, 0.008, 0, 0, 7)), rgba(F.skinSh, 0.7));
    } else if (t === 'cat') {
      line(curve([[-w, y - 0.006], [-w * 0.5, y + 0.01], [0, y - 0.002]]), lc, 1.3);
      line(curve([[0, y - 0.002], [w * 0.5, y + 0.01], [w, y - 0.006]]), lc, 1.3);
    }
    if (Mo.lip) fillP(P((p) => p.ellipse(0, y + 0.012, w * 0.45, 0.01, 0, 0, 7)), rgba(Mo.lip, 0.55));
  }
  BZ.drawFace = drawFace;
  BZ.faceShape = faceShape;

  // ---------------------------------------------------------------- HANDS
  // finger: base [x,y], dir angle (rad, 0 = +y down), lens [3], curls [3] (rad), width
  function fingerPts(f) {
    const pts = [f.b.slice()];
    let a = f.a, x = f.b[0], y = f.b[1];
    for (let i = 0; i < 3; i++) {
      a += f.c[i] || 0;
      x += Math.sin(a) * f.l[i];
      y += Math.cos(a) * f.l[i];
      pts.push([x, y]);
    }
    return pts;
  }
  // hand(x, y, angle, size, pose, skin, mirror) — wrist at (x,y), hand points along angle (0 = down)
  function hand(x, y, ang, size, pose, skin, mir = 1, o = {}) {
    const c = G.ctx;
    c.save();
    c.translate(x, y);
    c.rotate(-ang);
    c.scale(size * mir, size);
    const sh = o.sh || shadowOf(skin);
    const ln = o.line || ink(skin, 0.55);
    const W = 0.2; // half palm width
    const def = POSES[pose] || POSES.relax;
    const d = def();
    // palm
    part(blob(d.palm), skin, { sh, line: ln, lw: 1.3, rimW: 0.04, shift: [0.05, 0.04] });
    const fingers = d.fingers;
    for (const f of fingers) {
      const pts = fingerPts(f);
      const p = ribbon(pts, (t) => f.w * (1 - t * 0.28), { capEnd: 'round', seg: 6 });
      part(p, skin, { sh, line: ln, lw: 1.2, rimW: 0.035, shift: [0.04, 0.03] });
      if (!G.sil && size > 30 && f.nail) {
        const e = pts[3], q = pts[2];
        const a = Math.atan2(e[0] - q[0], e[1] - q[1]);
        fillP(P((p) => p.ellipse(e[0] - Math.sin(a) * f.w * 0.5, e[1] - Math.cos(a) * f.w * 0.5, f.w * 0.5, f.w * 0.7, -a, 0, 7)), rgba('#ffffff', 0.35));
      }
    }
    if (d.thumb) {
      const pts = fingerPts(d.thumb);
      part(ribbon(pts, (t) => d.thumb.w * (1 - t * 0.25), { capEnd: 'round', seg: 6 }), skin, { sh, line: ln, lw: 1.2, rimW: 0.035, shift: [0.04, 0.03] });
    }
    if (d.after) d.after(skin, sh, ln);
    c.restore();
  }
  const POSES = {
    // back of hand, hanging, fingers gently curled (mir=1: right side of screen, thumb toward body centre = -x)
    relax: () => ({
      palm: [[-0.17, 0.0], [0.16, 0.0], [0.21, 0.28], [0.17, 0.52], [-0.17, 0.5], [-0.2, 0.22]],
      thumb: { b: [-0.16, 0.18], a: -0.55, l: [0.2, 0.17, 0.13], c: [0, 0.25, 0.2], w: 0.072 },
      fingers: [
        { b: [0.14, 0.47], a: 0.1, l: [0.15, 0.11, 0.08], c: [0.1, 0.35, 0.3], w: 0.052 },
        { b: [0.06, 0.5], a: 0.04, l: [0.19, 0.13, 0.1], c: [0.05, 0.3, 0.3], w: 0.058 },
        { b: [-0.03, 0.51], a: -0.02, l: [0.2, 0.14, 0.1], c: [0.05, 0.25, 0.25], w: 0.06 },
        { b: [-0.12, 0.49], a: -0.08, l: [0.18, 0.12, 0.09], c: [0.0, 0.2, 0.25], w: 0.058 },
      ],
    }),
    // fist gripping a horizontal rod (rod axis across knuckles at y≈0.5)
    grip: () => ({
      palm: [[-0.18, 0.0], [0.17, 0.0], [0.22, 0.32], [0.2, 0.55], [-0.2, 0.55], [-0.22, 0.28]],
      fingers: [
        { b: [0.15, 0.5], a: 0.4, l: [0.1, 0.07, 0.05], c: [-0.5, -0.9, -0.7], w: 0.055 },
        { b: [0.05, 0.53], a: 0.35, l: [0.11, 0.08, 0.05], c: [-0.5, -0.9, -0.7], w: 0.062 },
        { b: [-0.05, 0.54], a: 0.3, l: [0.11, 0.08, 0.05], c: [-0.5, -0.9, -0.7], w: 0.063 },
        { b: [-0.14, 0.52], a: 0.25, l: [0.1, 0.07, 0.05], c: [-0.5, -0.9, -0.7], w: 0.06 },
      ],
      thumb: { b: [-0.19, 0.25], a: -0.2, l: [0.17, 0.14, 0.1], c: [0.3, 0.6, 0.3], w: 0.07 },
    }),
    // open palm facing viewer, fingers slightly spread
    open: () => ({
      palm: [[-0.16, 0.0], [0.15, 0.0], [0.21, 0.24], [0.2, 0.5], [-0.18, 0.52], [-0.21, 0.24]],
      thumb: { b: [-0.18, 0.2], a: -0.75, l: [0.18, 0.16, 0.12], c: [0, 0.15, 0.15], w: 0.07 },
      fingers: [
        { b: [0.15, 0.47], a: 0.32, l: [0.15, 0.11, 0.08], c: [0, 0.05, 0.05], w: 0.05, nail: 0 },
        { b: [0.06, 0.5], a: 0.12, l: [0.2, 0.14, 0.1], c: [0, 0.04, 0.04], w: 0.057 },
        { b: [-0.04, 0.51], a: -0.04, l: [0.21, 0.15, 0.1], c: [0, 0.03, 0.03], w: 0.06 },
        { b: [-0.13, 0.49], a: -0.2, l: [0.19, 0.13, 0.09], c: [0, 0.04, 0.04], w: 0.058 },
      ],
    }),
    // hand seen edge-on cradling something below (fingers curled up/forward)
    cup: () => ({
      palm: [[-0.16, 0.0], [0.17, 0.0], [0.24, 0.26], [0.18, 0.5], [-0.16, 0.48], [-0.21, 0.22]],
      thumb: { b: [-0.16, 0.18], a: -0.9, l: [0.18, 0.15, 0.12], c: [0.1, 0.4, 0.3], w: 0.07 },
      fingers: [
        { b: [0.13, 0.47], a: 0.5, l: [0.15, 0.1, 0.07], c: [-0.6, -0.5, -0.3], w: 0.052 },
        { b: [0.04, 0.49], a: 0.45, l: [0.17, 0.12, 0.08], c: [-0.6, -0.5, -0.3], w: 0.058 },
        { b: [-0.05, 0.49], a: 0.4, l: [0.17, 0.12, 0.08], c: [-0.6, -0.5, -0.3], w: 0.06 },
        { b: [-0.13, 0.46], a: 0.35, l: [0.15, 0.1, 0.07], c: [-0.6, -0.5, -0.3], w: 0.056 },
      ],
    }),
    // flute fingering: back of hand, fingers draped down over a horizontal flute (pads on holes)
    flute: () => ({
      palm: [[-0.18, 0.0], [0.17, 0.0], [0.22, 0.28], [0.19, 0.5], [-0.19, 0.5], [-0.22, 0.26]],
      thumb: { b: [-0.19, 0.2], a: -0.35, l: [0.17, 0.14, 0.1], c: [0.2, 0.3, 0.2], w: 0.068 },
      fingers: [
        { b: [0.14, 0.47], a: 0.15, l: [0.15, 0.12, 0.09], c: [0.1, 0.4, 0.4], w: 0.052 },
        { b: [0.05, 0.5], a: 0.08, l: [0.18, 0.14, 0.1], c: [0.1, 0.4, 0.4], w: 0.058 },
        { b: [-0.05, 0.5], a: 0.0, l: [0.19, 0.14, 0.1], c: [0.1, 0.4, 0.4], w: 0.06 },
        { b: [-0.14, 0.48], a: -0.06, l: [0.17, 0.12, 0.09], c: [0.1, 0.35, 0.4], w: 0.056 },
      ],
    }),
    // pinch: holding a cord / small object between thumb and index, others curled
    pinch: () => ({
      palm: [[-0.17, 0.0], [0.16, 0.0], [0.21, 0.28], [0.18, 0.5], [-0.17, 0.5], [-0.2, 0.22]],
      fingers: [
        { b: [0.14, 0.47], a: 0.3, l: [0.12, 0.09, 0.06], c: [-0.2, -0.8, -0.6], w: 0.052 },
        { b: [0.05, 0.5], a: 0.25, l: [0.13, 0.1, 0.07], c: [-0.2, -0.8, -0.6], w: 0.058 },
        { b: [-0.04, 0.51], a: 0.15, l: [0.15, 0.11, 0.08], c: [-0.1, -0.6, -0.6], w: 0.06 },
        { b: [-0.13, 0.49], a: -0.15, l: [0.19, 0.13, 0.09], c: [0.05, 0.15, 0.15], w: 0.058 },
      ],
      thumb: { b: [-0.18, 0.2], a: -0.25, l: [0.2, 0.16, 0.12], c: [0.1, 0.25, 0.3], w: 0.07 },
    }),
  };
  BZ.hand = hand;

  // ---------------------------------------------------------------- FEET (front view)
  // foot(x, groundY, size, type, colours, mir) — size ≈ shoe length front-projected width scale
  function foot(x, gy, s, type, col, mir = 1, o = {}) {
    const c = G.ctx;
    c.save();
    c.translate(x, gy);
    c.scale(s * mir, s);
    c.rotate(o.rot || 0.12);
    const C = col;
    if (type === 'barefoot') {
      const sk = C.skin, ln = ink(sk, 0.55);
      const f = P((p) => {
        p.moveTo(-0.22, -0.95);
        p.bezierCurveTo(-0.26, -0.6, -0.36, -0.2, -0.33, -0.05);
        p.quadraticCurveTo(-0.3, 0.02, -0.1, 0.02);
        p.lineTo(0.3, 0.02);
        p.quadraticCurveTo(0.42, 0.0, 0.38, -0.12);
        p.bezierCurveTo(0.32, -0.4, 0.26, -0.7, 0.22, -0.95);
        p.closePath();
      });
      part(f, sk, { line: ln, lw: 1.2, shift: [0.05, 0.03], rimW: 0.04 });
      // toes
      const tx = [-0.25, -0.1, 0.04, 0.16, 0.27];
      const tw = [0.085, 0.06, 0.055, 0.05, 0.045];
      tx.forEach((t, i) => {
        const tp = P((p) => p.ellipse(t, -0.05 + i * 0.008, tw[i], 0.07 - i * 0.004, 0, 0, 7));
        part(tp, sk, { line: ln, lw: 0.9, shift: [0.03, 0.02], rim: false });
      });
      c.restore();
      return;
    }
    if (type === 'xiuxie') {
      // 繡鞋 embroidered cloth shoe: soft rounded body, slightly upturned toe, white sole
      const body = P((p) => {
        p.moveTo(-0.26, -0.5);
        p.bezierCurveTo(-0.34, -0.38, -0.38, -0.15, -0.33, 0.0);
        p.lineTo(0.33, 0.0);
        p.bezierCurveTo(0.38, -0.15, 0.34, -0.38, 0.26, -0.5);
        p.quadraticCurveTo(0.08, -0.62, 0.0, -0.66);
        p.quadraticCurveTo(-0.08, -0.62, -0.26, -0.5);
        p.closePath();
      });
      part(body, C.shoe, { lw: 1.3, shift: [0.05, 0.04], rimW: 0.04 });
      // vamp opening (instep)
      if (o.instep !== false) part(P((p) => p.ellipse(0, -0.55, 0.2, 0.07, 0, Math.PI, 0)), C.sock || '#f2ece2', { sh: false, rim: false, lw: 1 });
      // embroidery flower
      if (!G.sil) {
        const fc = C.emb || '#f0c0d0';
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          fillP(P((p) => p.ellipse(Math.cos(a) * 0.06, -0.28 + Math.sin(a) * 0.05, 0.05, 0.03, a, 0, 7)), fc);
        }
        fillP(P((p) => p.arc(0, -0.28, 0.025, 0, 7)), C.emb2 || '#f4d060');
        stroke([[-0.22, -0.2], [-0.12, -0.32], [-0.07, -0.3]], 1, C.emb3 || '#5a9a6a');
        stroke([[0.22, -0.2], [0.12, -0.32], [0.07, -0.3]], 1, C.emb3 || '#5a9a6a');
      }
      part(P((p) => p.roundRect(-0.35, -0.02, 0.7, 0.07, 0.03)), C.sole || '#f4efe6', { sh: false, rim: false, lw: 1.1 });
      c.restore();
      return;
    }
    if (type === 'cloth') {
      const body = P((p) => {
        p.moveTo(-0.27, -0.55);
        p.bezierCurveTo(-0.37, -0.38, -0.39, -0.12, -0.34, 0.0);
        p.lineTo(0.34, 0.0);
        p.bezierCurveTo(0.39, -0.12, 0.37, -0.38, 0.27, -0.55);
        p.quadraticCurveTo(0.0, -0.66, -0.27, -0.55);
        p.closePath();
      });
      part(body, C.shoe, { lw: 1.3, shift: [0.05, 0.04], rimW: 0.04 });
      line(curve([[-0.24, -0.5], [0, -0.42], [0.24, -0.5]]), ink(C.shoe, 0.3), 1);
      part(P((p) => p.roundRect(-0.36, -0.03, 0.72, 0.08, 0.03)), C.sole || '#e9e2d5', { sh: false, rim: false, lw: 1.1 });
      c.restore();
      return;
    }
    if (type === 'straw') {
      // 草鞋: woven sole + toes + cords
      const sk = C.skin, ln = ink(sk, 0.55);
      part(P((p) => p.roundRect(-0.38, -0.06, 0.78, 0.09, 0.04)), C.straw || '#c9a86a', { sh: false, rim: false, lw: 1.1 });
      const f = P((p) => {
        p.moveTo(-0.22, -0.95);
        p.bezierCurveTo(-0.26, -0.6, -0.36, -0.2, -0.33, -0.06);
        p.lineTo(0.38, -0.06);
        p.bezierCurveTo(0.32, -0.4, 0.26, -0.7, 0.22, -0.95);
        p.closePath();
      });
      part(f, sk, { line: ln, lw: 1.2, shift: [0.05, 0.03], rimW: 0.04 });
      [-0.24, -0.1, 0.03, 0.15, 0.26].forEach((t, i) => part(P((p) => p.ellipse(t, -0.1, 0.075 - i * 0.008, 0.06, 0, 0, 7)), sk, { line: ln, lw: 0.9, rim: false, shift: [0.03, 0.02] }));
      const cord = C.cord || '#a7834a';
      line(curve([[-0.33, -0.08], [-0.15, -0.35], [0, -0.45], [0.15, -0.35], [0.36, -0.08]]), cord, 2.2);
      line(curve([[-0.1, -0.1], [-0.05, -0.3], [0, -0.45]]), cord, 1.8);
      c.restore();
      return;
    }
    c.restore();
  }
  BZ.foot = foot;

  // ---------------------------------------------------------------- TEXT
  function tokens(s) {
    const out = [];
    let buf = '';
    for (const ch of s) {
      if (/[　-鿿＀-￯「」『』，。、：；！？（）—…·]/.test(ch)) {
        if (buf) out.push(buf), (buf = '');
        out.push(ch);
      } else if (ch === ' ') {
        buf += ' ';
        out.push(buf);
        buf = '';
      } else buf += ch;
    }
    if (buf) out.push(buf);
    return out;
  }
  function wrap(c, text, x, y, maxW, lh, o = {}) {
    const tk = tokens(text);
    let lineS = '';
    let ly = y;
    let n = 0;
    const flush = () => {
      c.fillText(lineS.trimEnd(), x, ly);
      ly += lh;
      n++;
      lineS = '';
    };
    for (const t of tk) {
      const test = lineS + t;
      if (c.measureText(test.trimEnd()).width > maxW && lineS) {
        // avoid line-start punctuation
        if (/^[，。、：；！？」』）]/.test(t)) {
          lineS += t;
          flush();
          continue;
        }
        flush();
        lineS = t.trimStart();
      } else lineS = test;
      if (o.maxLines && n >= o.maxLines) return ly;
    }
    if (lineS) flush();
    return ly;
  }
  BZ.wrap = wrap;
  const ZH = '"WenQuanYi Zen Hei", sans-serif';
  const EN = '"Inter", "DejaVu Sans", sans-serif';
  const SERIF = '"DejaVu Serif", "Liberation Serif", serif';
  Object.assign(BZ, { ZH, EN, SERIF });

  // ---------------------------------------------------------------- CARD
  const CW = 480, CH = 880;
  BZ.CARD = { W: CW, H: CH };
  const FIG = { x: 0, y: 104, w: 300, h: 476, footY: 560, cx: 156 };
  const BUST = { x: 304, y: 112, w: 164, h: 198 };

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
  }
  // draw design figure with transform; view: {x, y, s, z}
  function drawFigure(c, D, tx, ty, s, z, o = {}) {
    c.save();
    c.translate(tx, ty);
    c.scale(s, s);
    G.ctx = c;
    G.f = Math.sqrt(z);
    G.sil = !!o.sil;
    G.back = !!o.back;
    G.rim = D.rim || '#fff2d8';
    G.shTint = D.shTint || '#4a3f78';
    G.shAmt = D.shAmt != null ? D.shAmt : 0.32;
    G.light = [3.2, 2.6];
    G.z = z;
    D.draw(c, G);
    c.restore();
    G.sil = false;
    G.back = false;
  }
  // figure rendered on its own layer: outer contour line, light fall-off, then composited
  const BOX = { l: 210, r: 210, t: 560, b: 30 };
  function drawFigureLayer(c, D, tx, ty, s, z) {
    const k = G.base * s;
    const W = Math.ceil((BOX.l + BOX.r) * k), H = Math.ceil((BOX.t + BOX.b) * k);
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const oc = off.getContext('2d');
    oc.translate(BOX.l * k, BOX.t * k);
    oc.scale(k, k);
    drawFigure(oc, D, 0, 0, 1, z);
    // light fall-off: darker, cooler toward the feet; warm key from the top
    oc.setTransform(1, 0, 0, 1, 0, 0);
    oc.globalCompositeOperation = 'source-atop';
    const y0 = (BOX.t - 430) * k, y1 = (BOX.t + 5) * k;
    const g = oc.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, rgba(D.keyLight || '#fff6e0', 0.1));
    g.addColorStop(0.45, 'rgba(0,0,0,0)');
    g.addColorStop(1, rgba(D.shTint || '#4a3f78', 0.22));
    oc.fillStyle = g;
    oc.fillRect(0, 0, W, H);
    oc.globalCompositeOperation = 'source-over';
    // outer contour (silhouette line weight)
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const xc = out.getContext('2d');
    const r = 1.15 * G.base * Math.sqrt(z) * (D.contour || 1);
    // threshold alpha so soft glows / translucent effects do not get a contour
    const mask = document.createElement('canvas');
    mask.width = W;
    mask.height = H;
    const mc = mask.getContext('2d');
    mc.drawImage(off, 0, 0);
    const id = mc.getImageData(0, 0, W, H);
    const A = id.data;
    const th = (D.contourTh || 0.55) * 255;
    for (let i = 3; i < A.length; i += 4) A[i] = A[i] > th ? 255 : 0;
    mc.putImageData(id, 0, 0);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      xc.drawImage(mask, Math.cos(a) * r, Math.sin(a) * r);
    }
    xc.globalCompositeOperation = 'source-in';
    xc.fillStyle = D.contourCol || '#1d1424';
    xc.fillRect(0, 0, W, H);
    xc.globalCompositeOperation = 'source-over';
    xc.drawImage(off, 0, 0);
    if (D.post) D.post(c, tx, ty, s, z, 'under');
    c.drawImage(out, tx - BOX.l * s, ty - BOX.t * s, (BOX.l + BOX.r) * s, (BOX.t + BOX.b) * s);
    if (D.post) D.post(c, tx, ty, s, z, 'over');
  }
  BZ.drawFigureLayer = drawFigureLayer;
  function silhouette(c, D, x, y, hgt, o = {}) {
    // render to offscreen at higher res, tint
    const scale = hgt / 420;
    const W = Math.ceil(380 * scale * 2), Hh = Math.ceil(hgt * 1.25 * 2);
    const off = document.createElement('canvas');
    off.width = W;
    off.height = Hh;
    const oc = off.getContext('2d');
    const base = G.base;
    G.base = 1;
    oc.save();
    if (o.mirror) {
      oc.translate(W, 0);
      oc.scale(-1, 1);
    }
    drawFigure(oc, D, W / 2, Hh * 0.93, scale * 2, 1, { sil: true, back: o.mirror });
    oc.restore();
    G.base = base;
    oc.globalCompositeOperation = 'source-in';
    oc.fillStyle = o.col || '#15131c';
    oc.fillRect(0, 0, W, Hh);
    if (o.backDetail && D.back) {
      // overlay back-view detail lines in a lighter tone
      oc.globalCompositeOperation = 'source-atop';
      oc.save();
      oc.translate(W / 2, Hh * 0.93);
      oc.scale(scale * 2, scale * 2);
      G.ctx = oc;
      G.base = 1;
      G.f = 1;
      G.sil = false;
      D.back(oc, G, o.backCol || '#4a4658');
      oc.restore();
      G.base = base;
    }
    c.drawImage(off, x - W / 4, y - Hh * 0.93 / 2, W / 2, Hh / 2);
  }
  BZ.drawFigure = drawFigure;
  BZ.silhouette = silhouette;

  function drawCard(c, D, ox, oy, base) {
    G.base = base;
    c.save();
    c.translate(ox, oy);
    // card paper
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.35)';
    c.shadowBlur = 14;
    c.shadowOffsetY = 4;
    rr(c, 0, 0, CW, CH, 10);
    c.fillStyle = '#f4efe6';
    c.fill();
    c.restore();
    const acc = D.accent || '#b0303a';
    // header
    c.fillStyle = acc;
    rr(c, 16, 16, 46, 46, 6);
    c.fill();
    c.fillStyle = '#fff';
    c.font = `600 26px ${EN}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(D.n).padStart(2, '0'), 39, 40);
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#1f1b24';
    c.font = `30px ${ZH}`;
    c.fillText(D.zh, 74, 42);
    const zw = c.measureText(D.zh).width;
    c.font = `italic 15px ${SERIF}`;
    c.fillStyle = '#5b5560';
    c.fillText(D.en, 74, 61);
    c.font = `10.5px ${EN}`;
    c.textAlign = 'right';
    c.fillStyle = acc;
    c.fillText(D.tier, CW - 18, 30);
    c.fillStyle = '#8a8290';
    c.fillText(`${D.ratio} heads · ${D.shape}`, CW - 18, 45);
    c.textAlign = 'left';
    void zw;
    c.fillStyle = '#39333f';
    c.font = `12.5px ${ZH}`;
    wrap(c, D.idea, 18, 83, CW - 36, 16.5, { maxLines: 2 });
    // figure stage
    c.save();
    rr(c, 12, FIG.y, 288, FIG.h, 8);
    c.clip();
    if (D.stage) D.stage(c, 12, FIG.y, 288, FIG.h);
    else {
      const g = c.createLinearGradient(0, FIG.y, 0, FIG.y + FIG.h);
      g.addColorStop(0, D.bg[0]);
      g.addColorStop(1, D.bg[1]);
      c.fillStyle = g;
      c.fillRect(12, FIG.y, 288, FIG.h);
    }
    // ground shadow
    const gs = c.createRadialGradient(FIG.cx, FIG.footY, 2, FIG.cx, FIG.footY, 70);
    gs.addColorStop(0, 'rgba(10,8,20,0.38)');
    gs.addColorStop(1, 'rgba(10,8,20,0)');
    c.fillStyle = gs;
    c.save();
    c.translate(FIG.cx, FIG.footY);
    c.scale(1, 0.18);
    c.translate(-FIG.cx, -FIG.footY);
    c.fillRect(FIG.cx - 80, FIG.footY - 80, 160, 160);
    c.restore();
    const fs = D.fs || 1;
    drawFigureLayer(c, D, FIG.cx + (D.fx || 0), FIG.footY, fs, 1);
    c.restore();
    // numbered callouts: markers on the figure, legend in right column
    const anchors = D.callouts || [];
    let ly = BUST.y + BUST.h + 16;
    const circ = (x, y, n, r = 7.5) => {
      c.fillStyle = acc;
      c.beginPath();
      c.arc(x, y, r, 0, 7);
      c.fill();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = '#fff';
      c.font = `700 10px ${EN}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(n), x, y + 0.5);
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
    };
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      const ax = FIG.cx + (D.fx || 0) + a.at[0] * fs, ay = FIG.footY + a.at[1] * fs;
      // marker offset with short tick so it does not hide the detail
      const ox2 = ax + (a.off ? a.off[0] : 0), oy2 = ay + (a.off ? a.off[1] : 0);
      if (a.off) {
        c.strokeStyle = 'rgba(255,255,255,0.9)';
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(ax, ay);
        c.lineTo(ox2, oy2);
        c.stroke();
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(ax, ay, 1.8, 0, 7);
        c.fill();
      }
      circ(ox2, oy2, i + 1);
      circ(BUST.x + 9, ly + 1, i + 1, 8);
      c.fillStyle = '#1f1b24';
      c.font = `12.5px ${ZH}`;
      c.fillText(a.zh, BUST.x + 22, ly + 5);
      c.fillStyle = '#6b6370';
      c.font = `10px ${EN}`;
      const ey = wrap(c, a.en, BUST.x + 22, ly + 19, CW - BUST.x - 30, 11.5, { maxLines: 2 });
      ly = ey + 7;
    }
    // bust panel
    c.save();
    rr(c, BUST.x, BUST.y, BUST.w, BUST.h, 8);
    c.clip();
    if (D.bustBg) D.bustBg(c, BUST.x, BUST.y, BUST.w, BUST.h);
    else {
      const g = c.createLinearGradient(0, BUST.y, 0, BUST.y + BUST.h);
      g.addColorStop(0, D.bg[0]);
      g.addColorStop(1, D.bg[1]);
      c.fillStyle = g;
      c.fillRect(BUST.x, BUST.y, BUST.w, BUST.h);
    }
    const bz = D.bust.z;
    const hcx = D.bust.x || 0, hcy = D.bust.y; // design-space point placed at panel centre
    drawFigureLayer(c, D, BUST.x + BUST.w / 2 - hcx * fs * bz, BUST.y + BUST.h * 0.5 - hcy * fs * bz, fs * bz, bz);
    c.restore();
    c.strokeStyle = rgba('#1f1b24', 0.25);
    c.lineWidth = 1;
    rr(c, BUST.x + 0.5, BUST.y + 0.5, BUST.w - 1, BUST.h - 1, 8);
    c.stroke();
    c.fillStyle = 'rgba(244,239,230,0.85)';
    rr(c, BUST.x + 6, BUST.y + 6, 64, 16, 4);
    c.fill();
    c.fillStyle = '#5b5560';
    c.font = `10px ${EN}`;
    c.fillText('BUST · 臉部', BUST.x + 11, BUST.y + 18);
    // palette
    const py = 604;
    c.fillStyle = '#8a8290';
    c.font = `10px ${EN}`;
    c.fillText('PALETTE 色票', 18, py - 4);
    const pal = D.palette;
    const pw = (CW - 36 - (pal.length - 1) * 6) / pal.length;
    pal.forEach((p, i) => {
      const x = 18 + i * (pw + 6);
      rr(c, x, py, pw, 30, 4);
      c.fillStyle = p[0];
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.18)';
      c.stroke();
      c.fillStyle = '#2a2530';
      c.font = `11px ${ZH}`;
      c.fillText(p[1], x, py + 44);
      c.fillStyle = '#7a7280';
      c.font = `9px ${EN}`;
      c.fillText(p[2], x, py + 56);
      c.fillText(p[0].toUpperCase(), x, py + 67);
    });
    // cultural basis + 3D note
    const by = 690;
    c.fillStyle = '#e9e2d6';
    rr(c, 12, by, 340, CH - by - 12, 8);
    c.fill();
    c.fillStyle = acc;
    c.font = `11px ${EN}`;
    c.fillText('CULTURAL BASIS 文化依據', 22, by + 18);
    c.fillStyle = '#2f2a35';
    c.font = `11.5px ${ZH}`;
    let yy = wrap(c, D.culture, 22, by + 36, 320, 15.5, { maxLines: 5 });
    c.fillStyle = '#4e6a7a';
    c.font = `11px ${EN}`;
    c.fillText('3D / TOON', 22, yy + 6);
    c.fillStyle = '#3e4a55';
    c.font = `10.5px ${ZH}`;
    wrap(c, D.model, 22, yy + 21, 320, 14, { maxLines: 3 });
    // silhouettes front + back
    c.fillStyle = '#e9e2d6';
    rr(c, 360, by, 108, CH - by - 12, 8);
    c.fill();
    c.fillStyle = '#8a8290';
    c.font = `9px ${EN}`;
    c.textAlign = 'center';
    c.fillText('SILHOUETTE', 414, by + 15);
    c.fillText('front', 387, CH - 20);
    c.fillText('back', 441, CH - 20);
    c.textAlign = 'left';
    silhouette(c, D, 387, CH - 34, 92 * fs);
    silhouette(c, D, 441, CH - 34, 92 * fs, { mirror: true, backDetail: true });
    c.restore();
  }
  BZ.drawCard = drawCard;
})();
