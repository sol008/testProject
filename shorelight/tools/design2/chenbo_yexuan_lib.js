/* 彼岸燈 Shorelight — character design v2 — shared drawing helpers for 陳伯 (chenbo) & 夜玄 (yexuan) turnaround sheets.
 * Canvas-2D procedural toon/cel drawing: flat base + hard shadow crescent + highlight + rim light + ink line.
 * Coordinates used by the figure files: x = 0 body centre, y = 0 ground, y negative = up, 1 unit = 1 px at zoom 1.
 */
(function (G) {
  'use strict';
  const L = {};
  L.K = 1;            // line-width scale (= 1 / zoom) so ink stays ~2px at any zoom
  L.RIM = '#ffe6b8';  // rim-light colour (per character)
  L.SIL = false;      // silhouette mode: skip glows / effects
  L.SHDIR = [1, 0.35];

  // ---------- colour ----------
  L.hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  L.toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  L.mix = (a, b, t) => { const A = L.hex(a), B = L.hex(b); return L.toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
  L.dk = (c, t = 0.34) => L.mix(c, '#2a2038', t);           // cool shadow
  L.lt = (c, t = 0.2) => L.mix(c, '#fff3da', t);            // warm light
  L.ink = (c) => L.mix(c, '#160e1a', 0.72);                 // line colour = dark hue of the fill
  L.rgba = (c, a) => { const [r, g, b] = L.hex(c); return `rgba(${r},${g},${b},${a})`; };

  // ---------- paths ----------
  L.P = (d) => (typeof d === 'string' ? new Path2D(d) : d);
  L.xf = (p, dx, dy, sx = 1, sy = 1) => { const q = new Path2D(); q.addPath(L.P(p), new DOMMatrix([sx, 0, 0, sy, dx, dy])); return q; };
  L.minus = (p, dx, dy) => { const q = new Path2D(); q.rect(-1e4, -1e4, 2e4, 2e4); q.addPath(p, new DOMMatrix([1, 0, 0, 1, dx, dy])); return q; };
  // mirror an SVG path string horizontally (x -> -x). Works for absolute M/L/C/Q/Z/A-free paths.
  L.mirrorD = (d) => d.replace(/(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)/g, (m, x, y) => `${-parseFloat(x)},${y}`);

  // Cel-shaded part: base, highlight crescent (light top-left), shadow crescent (bottom-right), extra shade/light
  // shapes, detail callback (clipped), rim light (right edge), ink outline.
  L.part = (ctx, d, col, o = {}) => {
    const p = L.P(d);
    ctx.save();
    ctx.fillStyle = col; ctx.fill(p);
    ctx.save(); ctx.clip(p);
    if (o.under) o.under(ctx, p);
    if (o.ao) { const b = o.ao; const g = ctx.createLinearGradient(0, b[0], 0, b[1]); g.addColorStop(0, L.rgba(L.dk(col, 0.5), 0)); g.addColorStop(1, L.rgba(L.dk(col, 0.5), b[2] ?? 0.35)); ctx.fillStyle = g; ctx.fill(p); }
    const sh = o.sh ?? 6, hi = o.hi ?? sh * 0.4;
    const dx = o.dx ?? L.SHDIR[0], dy = o.dy ?? L.SHDIR[1];
    if (hi > 0) { ctx.fillStyle = o.hiCol || L.lt(col, 0.16); ctx.fill(L.minus(p, hi * dx, hi * 1.2), 'evenodd'); }
    if (sh > 0) { ctx.fillStyle = o.shCol || L.dk(col, 0.3); ctx.fill(L.minus(p, -sh * dx, -sh * dy), 'evenodd'); }
    if (o.shades) { ctx.fillStyle = o.shCol || L.dk(col, 0.3); for (const s of o.shades) ctx.fill(L.P(s)); }
    if (o.deep) { ctx.fillStyle = L.dk(col, 0.5); for (const s of o.deep) ctx.fill(L.P(s)); }
    if (o.lights) { ctx.fillStyle = o.hiCol || L.lt(col, 0.16); for (const s of o.lights) ctx.fill(L.P(s)); }
    if (o.detail) o.detail(ctx, p);
    const rim = o.rim ?? 1.8;
    if (rim > 0 && !L.SIL) { ctx.fillStyle = o.rimCol || L.RIM; ctx.globalAlpha = o.rimA ?? 0.8; ctx.fill(L.minus(p, -rim * L.SHDIR[0], 0), 'evenodd'); ctx.globalAlpha = 1; }
    ctx.restore();
    if (o.lw !== 0) { ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = o.ink || L.ink(col); ctx.lineWidth = (o.lw ?? 2) * L.K; ctx.stroke(p); }
    ctx.restore();
    return p;
  };
  L.fill = (ctx, d, col, a = 1) => { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fill(L.P(d)); ctx.restore(); };
  L.line = (ctx, d, col, w = 1.6, o = {}) => {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w * (o.geo ? 1 : L.K); ctx.lineCap = o.cap || 'round'; ctx.lineJoin = 'round';
    if (o.dash) ctx.setLineDash(o.dash.map((v) => v * (o.geo ? 1 : L.K)));
    if (o.a != null) ctx.globalAlpha = o.a;
    ctx.stroke(L.P(d)); ctx.restore();
  };
  L.clip = (ctx, d, fn) => { ctx.save(); ctx.clip(L.P(d)); fn(); ctx.restore(); };

  // ---------- splines / strokes ----------
  L.spl = (pts, n = 8) => {
    if (pts.length < 3) {
      const out = []; const [a, b] = pts; for (let i = 0; i <= n; i++) { const t = i / n; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } return out;
    }
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
      for (let j = 0; j < n; j++) {
        const t = j / n, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  };
  const prof = (mode, t) => {
    if (mode === 'both') return Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.7);
    if (mode === 'end') return 1 - 0.9 * t;
    if (mode === 'start') return 0.1 + 0.9 * t;
    if (mode === 'mid') return 0.35 + 0.65 * Math.sin(Math.PI * t);
    return 1;
  };
  L.taperPath = (pts, w, mode = 'both', n = 8) => {
    const s = L.spl(pts, n), N = s.length, lf = [], rt = [];
    for (let i = 0; i < N; i++) {
      const a = s[Math.max(0, i - 1)], b = s[Math.min(N - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const ww = (w * prof(mode, i / (N - 1))) / 2;
      lf.push([s[i][0] - ty * ww, s[i][1] + tx * ww]); rt.push([s[i][0] + ty * ww, s[i][1] - tx * ww]);
    }
    const p = new Path2D(); p.moveTo(lf[0][0], lf[0][1]);
    for (const q of lf) p.lineTo(q[0], q[1]);
    for (let i = N - 1; i >= 0; i--) p.lineTo(rt[i][0], rt[i][1]);
    p.closePath(); return p;
  };
  // tapered ink stroke (folds, wrinkles, strands); width is softened at high zoom
  L.taper = (ctx, pts, w, col, mode = 'both', a = 1) => {
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fill(L.taperPath(pts, w * Math.pow(L.K, 0.55), mode)); ctx.restore();
  };
  // variable-width tube (limbs, sleeves, shafts, strips) -> Path2D
  L.tube = (pts, ws, cap = 'round') => {
    const n = 6, s = L.spl(pts, n), N = s.length, lf = [], rt = [];
    for (let i = 0; i < N; i++) {
      const a = s[Math.max(0, i - 1)], b = s[Math.min(N - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const f = (i / (N - 1)) * (ws.length - 1), k = Math.min(ws.length - 2, Math.floor(f)), u = f - k;
      const ww = (ws[k] + (ws[k + 1] - ws[k]) * u) / 2;
      lf.push([s[i][0] - ty * ww, s[i][1] + tx * ww, tx, ty]); rt.push([s[i][0] + ty * ww, s[i][1] - tx * ww, tx, ty]);
    }
    const p = new Path2D(); p.moveTo(lf[0][0], lf[0][1]);
    for (const q of lf) p.lineTo(q[0], q[1]);
    const e = s[N - 1], wE = ws[ws.length - 1] / 2, tE = lf[N - 1];
    if (cap === 'round') p.quadraticCurveTo(e[0] + tE[2] * wE * 1.3, e[1] + tE[3] * wE * 1.3, rt[N - 1][0], rt[N - 1][1]); else p.lineTo(rt[N - 1][0], rt[N - 1][1]);
    for (let i = N - 1; i >= 0; i--) p.lineTo(rt[i][0], rt[i][1]);
    const b0 = s[0], w0 = ws[0] / 2, t0 = lf[0];
    if (cap === 'round') p.quadraticCurveTo(b0[0] - t0[2] * w0 * 1.3, b0[1] - t0[3] * w0 * 1.3, lf[0][0], lf[0][1]);
    p.closePath(); return p;
  };
  L.ellipse = (cx, cy, rx, ry, rot = 0) => { const p = new Path2D(); p.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); return p; };
  L.circle = (cx, cy, r) => L.ellipse(cx, cy, r, r);

  // ---------- glow / fx ----------
  L.glow = (ctx, x, y, r, col, a = 0.6) => {
    if (L.SIL) return;
    ctx.save(); const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, L.rgba(col, a)); g.addColorStop(0.4, L.rgba(col, a * 0.35)); g.addColorStop(1, L.rgba(col, 0));
    ctx.fillStyle = g; ctx.globalCompositeOperation = 'lighter'; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); ctx.restore();
  };
  L.wisp = (ctx, x, y, r, col) => { // a soul-light orb with a short tail
    if (L.SIL) return;
    L.glow(ctx, x, y, r * 4.5, col, 0.55);
    ctx.save(); ctx.fillStyle = L.lt(col, 0.7); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.5; ctx.fillStyle = col; ctx.fill(L.taperPath([[x, y], [x - r * 0.6, y + r * 2.4], [x + r * 0.4, y + r * 4.2]], r * 1.6, 'end')); ctx.restore();
  };
  // knot button 盤扣 (front view, horizontal)
  L.knot = (ctx, x, y, s, col, open = false) => {
    L.part(ctx, L.tube([[x - s * 1.6, y], [x - s * 0.4, y - s * 0.15]], [s * 0.55, s * 0.55]), col, { sh: 0.6, rim: 0, lw: 1.1 });
    L.part(ctx, L.tube([[x + s * 0.4, y - s * 0.15], [x + s * 1.6, y]], [s * 0.55, s * 0.55]), col, { sh: 0.6, rim: 0, lw: 1.1 });
    if (!open) L.part(ctx, L.circle(x, y - s * 0.1, s * 0.48), L.lt(col, 0.2), { sh: 0.5, rim: 0, lw: 1.1 });
  };

  // ---------- hands ----------
  // local: wrist at (0,0), fingers toward +y, thumb toward +x (mirror for the other hand). s = hand length.
  L.hand = (ctx, x, y, ang, s, skin, o = {}) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(o.mirror ? -s : s, s);
    const K0 = L.K; L.K = K0 / s;
    const so = { sh: 0.05, hi: 0.02, rim: o.rim ?? 0.02, lw: o.lw ?? 1.6, dx: o.mirror ? -1 : 1 };
    const pose = o.pose || 'relax', thin = o.thin ? 0.86 : 1, bony = o.bony;
    const F = (pts, ws) => L.part(ctx, L.tube(pts, ws.map((w) => w * thin)), skin, so);
    if (pose === 'relax') { // hanging hand: back of hand 3/4, fingers loosely curled, thumb in front (toon-friendly)
      L.part(ctx, 'M-0.15,0 C-0.2,0.16 -0.22,0.34 -0.21,0.5 C-0.22,0.6 -0.2,0.68 -0.15,0.71 C-0.13,0.77 -0.09,0.8 -0.05,0.8 C-0.03,0.86 0.02,0.89 0.06,0.87 C0.1,0.86 0.12,0.82 0.13,0.78 C0.17,0.74 0.18,0.66 0.17,0.56 C0.18,0.4 0.18,0.18 0.15,0 Z', skin, { ...so, detail: (c) => {
        const dc = L.dk(skin, 0.32);
        L.line(c, 'M-0.15,0.55 C-0.15,0.62 -0.14,0.68 -0.12,0.71', dc, 1.1); L.line(c, 'M-0.06,0.56 C-0.06,0.66 -0.05,0.74 -0.04,0.79', dc, 1.1);
        L.line(c, 'M0.04,0.56 C0.05,0.68 0.06,0.78 0.07,0.86', dc, 1.1);
        L.line(c, 'M-0.2,0.5 C-0.1,0.53 0.05,0.52 0.16,0.5', dc, 0.9, { a: 0.55 });
        if (bony) L.line(c, 'M-0.07,0.12 L-0.09,0.44 M0.04,0.12 L0.05,0.44', dc, 0.9, { a: 0.6 });
      } });
      F([[0.13, 0.16], [0.2, 0.31], [0.21, 0.44], [0.17, 0.52]], [0.12, 0.1, 0.085, 0.065]); // thumb
    } else if (pose === 'grip') { // fist around a vertical pole (pole drawn before), knuckles to viewer
      L.part(ctx, `M-0.2,0 C-0.26,0.15 -0.26,0.42 -0.2,0.55 C-0.05,0.62 0.12,0.6 0.2,0.5 C0.24,0.35 0.22,0.12 0.16,0 Z`, skin, so);
      for (let i = 0; i < 4; i++) { const yy = 0.16 + i * 0.11; F([[-0.22, yy], [0.0, yy + 0.02], [0.13, yy + 0.01]], [0.12, 0.12, 0.1]); }
      F([[0.16, 0.08], [0.06, 0.12], [-0.08, 0.16]], [0.14, 0.12, 0.1]); // thumb over top
    } else if (pose === 'hook') { // fingers hooked, holding a cord / handle at (0.05,0.8)
      F([[-0.14, 0.42], [-0.17, 0.62], [-0.08, 0.72]], [0.11, 0.095, 0.08]);
      F([[-0.05, 0.45], [-0.07, 0.7], [0.02, 0.8]], [0.12, 0.1, 0.085]);
      F([[0.05, 0.46], [0.04, 0.72], [0.12, 0.82]], [0.125, 0.105, 0.085]);
      F([[0.14, 0.44], [0.17, 0.66], [0.2, 0.76]], [0.12, 0.1, 0.085]);
      L.part(ctx, `M-0.15,0 C-0.2,0.15 -0.21,0.32 -0.18,0.47 C-0.08,0.52 0.08,0.52 0.19,0.46 C0.2,0.32 0.19,0.15 0.15,0 Z`, skin, so);
      F([[0.12, 0.1], [0.24, 0.3], [0.26, 0.48], [0.2, 0.6]], [0.15, 0.13, 0.1, 0.08]);
    } else if (pose === 'rest') { // palm resting on top of an object, fingers draped forward-down
      L.part(ctx, `M-0.18,0 C-0.24,0.15 -0.26,0.3 -0.22,0.42 C-0.08,0.5 0.1,0.5 0.22,0.42 C0.24,0.28 0.22,0.12 0.17,0 Z`, skin, so);
      F([[-0.18, 0.38], [-0.2, 0.56], [-0.16, 0.66]], [0.11, 0.09, 0.075]);
      F([[-0.08, 0.42], [-0.09, 0.66], [-0.06, 0.8]], [0.12, 0.1, 0.08]);
      F([[0.03, 0.43], [0.03, 0.7], [0.05, 0.84]], [0.125, 0.1, 0.08]);
      F([[0.13, 0.41], [0.15, 0.64], [0.16, 0.76]], [0.12, 0.1, 0.08]);
      F([[0.17, 0.08], [0.27, 0.24], [0.3, 0.36]], [0.15, 0.12, 0.09]);
    }
    L.K = K0; ctx.restore();
  };

  // ---------- annotation (sheet furniture) ----------
  L.FONT_ZH = '"WenQuanYi Zen Hei", "Noto Sans CJK TC", sans-serif';
  L.FONT_EN = '"DejaVu Serif", "Liberation Serif", serif';
  // callout: anchor [x,y] -> label at [lx,ly] (canvas px), side 'L' | 'R'
  L.callout = (ctx, ax, ay, lx, ly, zh, en, o = {}) => {
    const col = o.col || '#3a3036', side = o.side || (lx < ax ? 'L' : 'R');
    ctx.save();
    ctx.strokeStyle = L.rgba(col, 0.8); ctx.lineWidth = 1.1; ctx.beginPath();
    const ex = side === 'L' ? lx + 6 : lx - 6;
    ctx.moveTo(ax, ay); ctx.lineTo(ex + (side === 'L' ? 18 : -18), ly); ctx.lineTo(ex, ly); ctx.stroke();
    ctx.fillStyle = o.dot || '#c0392b'; ctx.beginPath(); ctx.arc(ax, ay, 3.2, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.textAlign = side === 'L' ? 'right' : 'left';
    ctx.fillStyle = o.tcol || '#2a2226'; ctx.font = `bold 15px ${L.FONT_ZH}`; ctx.fillText(zh, lx, ly - 2);
    ctx.fillStyle = o.ecol || '#6a5c60'; ctx.font = `italic 11.5px ${L.FONT_EN}`;
    const lines = Array.isArray(en) ? en : [en];
    lines.forEach((t, i) => ctx.fillText(t, lx, ly + 13 + i * 13));
    ctx.restore();
  };
  // head-unit guide lines across a turnaround panel
  L.guides = (ctx, w, toY, marks, col = '#000') => {
    ctx.save(); ctx.font = `10px ${L.FONT_EN}`; ctx.fillStyle = L.rgba(col, 0.45);
    for (const [y, lab] of marks) {
      ctx.strokeStyle = L.rgba(col, 0.13); ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, toY(y)); ctx.lineTo(w, toY(y)); ctx.stroke();
      if (lab) ctx.fillText(lab, 6, toY(y) - 3);
    }
    ctx.restore();
  };
  // draw any figure function into a solid silhouette
  L.silhouette = (ctx, w, h, drawFn, col = '#141016') => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    L.SIL = true; drawFn(x); L.SIL = false;
    x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, w, h);
    ctx.drawImage(c, 0, 0);
  };
  // set up a canvas with devicePixelRatio
  L.canvas = (el, w, h) => {
    const r = window.devicePixelRatio || 1; el.width = Math.round(w * r); el.height = Math.round(h * r);
    el.style.width = w + 'px'; el.style.height = h + 'px'; const c = el.getContext('2d'); c.scale(r, r); return c;
  };
  // place a figure: ground at (gx, gy) in canvas px, zoom z
  L.at = (ctx, gx, gy, z, fn) => { ctx.save(); ctx.translate(gx, gy); ctx.scale(z, z); const K0 = L.K; L.K = 1 / z; fn(ctx); L.K = K0; ctx.restore(); };

  // draw a figure with a uniform toon outer contour (like an inverted-hull outline in 3D)
  L.figure = (ctx, W, H, gx, gy, z, fn, o = {}) => {
    const r = window.devicePixelRatio || 1;
    const c = document.createElement('canvas'); c.width = W * r; c.height = H * r; const x = c.getContext('2d'); x.scale(r, r);
    L.at(x, gx, gy, z, fn);
    const ow = o.ow ?? 2.2;
    if (ow > 0) {
      const s = document.createElement('canvas'); s.width = c.width; s.height = c.height; const sx = s.getContext('2d');
      sx.drawImage(c, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = o.ocol || '#1e1519'; sx.fillRect(0, 0, s.width, s.height);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      const t = ctx.getTransform ? null : null;
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; ctx.drawImage(s, Math.cos(a) * ow * r + (o.ox || 0) * r, Math.sin(a) * ow * r + (o.oy || 0) * r); }
      ctx.restore();
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(c, (o.ox || 0) * r, (o.oy || 0) * r); ctx.restore();
  };

  G.L = L;
})(window);
