// 白芷 design pass v2 — shared figure helpers (hair locks, neck, flute, stage helpers)
(function () {
  'use strict';
  const B = window.BZ;
  const { G, P, part, stroke, line, fillP, glow, clipped, ribbon, curve, blob, poly, mix, rgba, ink, lighten, shadowOf, hand, foot, knot, tassel, jadeTag, motes, rng, drawFace, LW, lp } = B;
  const D = (B.DESIGNS = B.DESIGNS || []);

  // ---------------------------------------------------------------- shared helpers
  // run fn inside head-local space (crown (0,0), chin (0,1)); tilt in radians around the neck
  function inHead(R, hx, fn, tilt = 0) {
    const c = G.ctx;
    c.save();
    c.translate(hx, R.chin + R.hu * 0.15);
    c.rotate(tilt);
    c.translate(0, -R.hu * 1.15);
    c.scale(R.hu, R.hu);
    fn(c);
    c.restore();
  }
  B.inHead = inHead;
  // neck + upper chest skin; nw = half neck width (head units), sh = neckline y
  function neck(R, skin, o = {}) {
    const hu = R.hu;
    const nw = (o.w || 0.12) * hu;
    const top = R.chin - hu * 0.2, bot = o.bot || R.Y(1.42);
    const sw = o.sw || nw * 2.4;
    const p = P((p) => {
      p.moveTo(-nw, top);
      p.bezierCurveTo(-nw * 1.02, top + hu * 0.25, -nw * 1.1, bot - hu * 0.14, -sw, bot);
      p.lineTo(sw, bot);
      p.bezierCurveTo(nw * 1.1, bot - hu * 0.14, nw * 1.02, top + hu * 0.25, nw, top);
      p.closePath();
    });
    part(p, skin, {
      sh: false,
      lw: 1.5,
      inner: (c) => {
        // chin cast shadow + right side
        c.fillStyle = shadowOf(skin);
        c.beginPath();
        c.moveTo(-nw * 1.3, top);
        c.quadraticCurveTo(0, R.chin + hu * 0.2, nw * 1.3, top);
        c.lineTo(nw * 1.3, bot);
        c.lineTo(nw * 0.55, bot);
        c.quadraticCurveTo(nw * 0.6, R.chin + hu * 0.18, nw * 1.3, R.chin + hu * 0.1);
        c.closePath();
        c.fill();
        c.beginPath();
        c.ellipse(0, R.chin + hu * 0.02, nw * 1.6, hu * 0.14, 0, 0, Math.PI);
        c.fill();
      },
    });
    if (o.clav) {
      stroke([[-nw * 2.2, bot - hu * 0.02], [-nw * 1.0, bot - hu * 0.07], [-nw * 0.4, bot - hu * 0.03]], 1.1, rgba(shadowOf(skin, 1.5), 0.9));
      stroke([[nw * 0.4, bot - hu * 0.03], [nw * 1.0, bot - hu * 0.07], [nw * 2.2, bot - hu * 0.02]], 1.1, rgba(shadowOf(skin, 1.5), 0.9));
    }
  }
  B.neck = neck;
  // generic hair "lock" — tapered ribbon with shading + strand lines
  function lock(pts, w, col, o = {}) {
    const p = ribbon(pts, w, { seg: 10 });
    part(p, col, {
      sh: o.sh || shadowOf(col, 1.3),
      shift: o.shift,
      rim: o.rim,
      rimW: o.rimW || 0.012,
      lw: o.lw || 1.4,
      line: o.line,
      inner: (c) => {
        if (o.strands !== false) {
          const n = o.n || 2;
          for (let i = 0; i < n; i++) {
            const k = (i + 1) / (n + 1) - 0.5;
            const sp = pts.map((q, j) => {
              const t = j / (pts.length - 1);
              const ww = B.wAt(w, t);
              return [q[0] + k * ww * 1.4, q[1]];
            });
            stroke(sp.slice(0, -1), 0.9, rgba(ink(col, 0.35), 0.55), { prof: [0, 1, 0] });
          }
        }
        if (o.inner) o.inner(c);
      },
    });
    return p;
  }
  B.lock = lock;
  // anime "angel ring" highlight band on a hair mass (clipped)
  function hairShine(path, cx, cy, rx, ry, col, a = 0.55, teeth = 9) {
    clipped(path, (c) => {
      c.fillStyle = rgba(col, a);
      c.beginPath();
      for (let i = 0; i <= teeth * 2; i++) {
        const t = i / (teeth * 2);
        const ang = Math.PI * (1.12 + t * 0.76);
        const r1 = i % 2 ? 1.0 : 1.08;
        c.lineTo(cx + Math.cos(ang) * rx * r1, cy + Math.sin(ang) * ry * r1);
      }
      for (let i = teeth * 2; i >= 0; i--) {
        const t = i / (teeth * 2);
        const ang = Math.PI * (1.12 + t * 0.76);
        const r2 = i % 2 ? 0.86 : 0.93;
        c.lineTo(cx + Math.cos(ang) * rx * r2, cy + Math.sin(ang) * ry * r2);
      }
      c.closePath();
      c.fill();
    });
  }
  B.hairShine = hairShine;
  // red string bracelet around a wrist at (x,y) of half-width w
  function redString(x, y, w, ang = 0) {
    const c = G.ctx;
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    line(P((p) => p.ellipse(0, 0, w, w * 0.32, 0, 0.1, Math.PI - 0.1)), '#b52a35', 2.2);
    line(P((p) => p.ellipse(0, 0, w, w * 0.32, 0, 0.1, Math.PI - 0.1)), '#e8606a', 0.8);
    c.restore();
  }
  B.redString = redString;
  // jade flute 玉笛 from A to B (endpoints), radius r
  function flute(A, Bp, r, o = {}) {
    const jade = o.col || '#9fd3bd';
    const p = ribbon([A, Bp], r, { seg: 2 });
    part(p, jade, {
      sh: mix(jade, '#2d6a5a', 0.45),
      shift: [0, r * 0.7],
      rim: '#f0fff8',
      rimW: r * 0.25,
      lw: 1.3,
      inner: (c) => {
        // highlight streak + nodes + holes
        const dx = Bp[0] - A[0], dy = Bp[1] - A[1];
        const L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
        stroke([[A[0] + ux * r * 2 - nx * r * 0.45, A[1] + uy * r * 2 - ny * r * 0.45], [Bp[0] - ux * r * 2 - nx * r * 0.45, Bp[1] - uy * r * 2 - ny * r * 0.45]], r * 0.55, 'rgba(255,255,255,0.7)', { prof: [0, 1, 1, 0] });
        for (const t of o.bands || [0.06, 0.94]) {
          const x = A[0] + dx * t, y = A[1] + dy * t;
          line(poly([[x - nx * r, y - ny * r], [x + nx * r, y + ny * r]], false), o.band || '#c9a24a', r * 0.6);
        }
        if (!G.sil)
          for (let i = 0; i < (o.holes || 6); i++) {
            const t = 0.3 + i * 0.075;
            fillP(P((p) => p.ellipse(A[0] + dx * t - nx * r * 0.15, A[1] + dy * t - ny * r * 0.15, r * 0.32, r * 0.24, Math.atan2(dy, dx), 0, 7)), ink(jade, 0.6));
          }
        fillP(P((p) => p.ellipse(A[0] + dx * 0.18, A[1] + dy * 0.18, r * 0.4, r * 0.3, Math.atan2(dy, dx), 0, 7)), ink(jade, 0.6));
      },
    });
  }
  B.flute = flute;
  function stageGrad(c, x, y, w, h, stops) {
    const g = c.createLinearGradient(0, y, 0, y + h);
    stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
  }
  B.stageGrad = stageGrad;
  function bokeh(c, x, y, w, h, n, cols, seed, rmax = 10, a = 0.35) {
    const r = rng(seed);
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const bx = x + r() * w, by = y + r() * h, br = 2 + r() * rmax;
      const col = cols[i % cols.length];
      const g = c.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, rgba(col, a));
      g.addColorStop(0.7, rgba(col, a * 0.5));
      g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g;
      c.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    c.restore();
  }
  B.bokeh = bokeh;


  // wide Chinese sleeve along shoulder S → elbow E → wrist W.
  // o: {col, w1 (upper half-width), w2 (cuff half-width), drop (hang below forearm), cuff (band colour), cuffW, lining, inner}
  function wideSleeve(S, E, W, o) {
    const col = o.col;
    const w1 = o.w1 || 12, w2 = o.w2 || 16, drop = o.drop || 0;
    // forearm direction
    const dx = W[0] - E[0], dy = W[1] - E[1];
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L; // normal
    const dn = ny >= 0 ? 1 : -1; // pick the normal pointing downward
    const hx = nx * dn, hy = ny * dn;
    const shape = P((p) => {
      // top edge: shoulder → elbow outer → wrist top
      const up = [S[0] - hx * w1 * 0.4, S[1] - hy * w1 * 0.4];
      p.moveTo(up[0], up[1]);
      p.quadraticCurveTo(E[0] - hx * w1 * 0.9 + (E[0] - S[0]) * 0.15, E[1] - hy * w1 * 0.9, W[0] - hx * w2 * 0.7, W[1] - hy * w2 * 0.7);
      // cuff opening
      p.lineTo(W[0] + hx * (w2 + drop), W[1] + hy * (w2 + drop));
      // hanging drape back toward the elbow / armpit
      p.bezierCurveTo(W[0] + hx * (w2 + drop * 1.1) - dx * 0.4, W[1] + hy * (w2 + drop * 1.1) - dy * 0.4 + drop * 0.25,
        E[0] + hx * (w1 + drop * 0.6), E[1] + hy * (w1 + drop * 0.6) + drop * 0.2,
        (o.pit || S)[0] + hx * w1 * 0.3, (o.pit || S)[1] + hy * w1 * 0.3 + w1 * 1.6);
      p.closePath();
    });
    part(shape, col, {
      lw: 1.9, rimW: 1.5, shift: o.shift || [4, 3],
      inner: (c) => {
        // drape folds radiating from the elbow
        for (let i = 0; i < 3; i++) {
          const t = 0.3 + i * 0.25;
          const a = [E[0] + dx * t * 0.3, E[1] + dy * t * 0.3 + w1 * 0.4];
          const b2 = [W[0] - dx * (0.6 - t * 0.5) + hx * (w2 + drop) * 0.9, W[1] - dy * (0.6 - t * 0.5) + hy * (w2 + drop) * 0.9];
          stroke([a, B.lp(a, b2, 0.5), b2], 2.2, rgba(shadowOf(col, 1.5), 0.7));
        }
        if (o.inner) o.inner(c);
      },
    });
    // cuff band
    if (o.cuff) {
      const cw = o.cuffW || 7;
      const ux = dx / L, uy = dy / L;
      const band = P((p) => {
        p.moveTo(W[0] - hx * w2 * 0.75, W[1] - hy * w2 * 0.75);
        p.lineTo(W[0] + hx * (w2 + drop), W[1] + hy * (w2 + drop));
        p.lineTo(W[0] + hx * (w2 + drop) - ux * cw, W[1] + hy * (w2 + drop) - uy * cw);
        p.lineTo(W[0] - hx * w2 * 0.75 - ux * cw, W[1] - hy * w2 * 0.75 - uy * cw);
        p.closePath();
      });
      part(band, o.cuff, { lw: 1.4, rimW: 1 });
      if (o.cuff2) line(poly([[W[0] - hx * w2 * 0.75 - ux * cw * 0.5, W[1] - hy * w2 * 0.75 - uy * cw * 0.5], [W[0] + hx * (w2 + drop) - ux * cw * 0.5, W[1] + hy * (w2 + drop) - uy * cw * 0.5]], false), o.cuff2, 1.4);
    }
    // dark opening
    if (o.lining !== false) {
      const ux = dx / L, uy = dy / L;
      fillP(P((p) => p.ellipse(W[0] + hx * (w2 + drop) * 0.25 + ux, W[1] + hy * (w2 + drop) * 0.25 + uy, (w2 + drop) * 0.55, 2.6, Math.atan2(hy, hx), 0, 7)), o.lining || '#1a1726');
    }
    return shape;
  }
  B.wideSleeve = wideSleeve;

})();
