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
        c.fillStyle = mix(skin, '#c97a6c', 0.3);
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

  // =====================================================================================
  // 白芷 identity head (client reference, binding): long straight jet-black hair, off-centre part,
  // viewer-left side falls as a face-framing curtain, viewer-right side tucked behind the ear with a long
  // drop earring; soft oval face, dark-brown softly upturned almond eyes, dreamy upward-sideways gaze,
  // closed half-smile, beauty mark on her right cheek (viewer's left) beside the nose.
  // =====================================================================================
  function H2D(R, hx, tilt, x, y) {
    const X = x * R.hu, Y = (y - 1.15) * R.hu;
    const c = Math.cos(tilt), s = Math.sin(tilt);
    return [hx + X * c - Y * s, R.chin + 0.15 * R.hu + X * s + Y * c];
  }
  B.H2D = H2D;
  function bzHead(R, o = {}) {
    const hu = R.hu, hx = o.hx || 0, tilt = o.tilt != null ? o.tilt : -0.05;
    const hair = o.hair || '#17151c', sheen = o.sheen || '#5d6f98', deep = mix(hair, '#000000', 0.45);
    const fo = o.face || {};
    const F = {
      skin: o.skin || '#f6e2d4', W: 0.385, jawX: 0.262, jawY: 0.79, chinW: 0.06, cheek: 0.22, chinY: 0.99,
      blush: 0.35, skinSh: '#ecc3b2', mole: [-0.108, 0.712], ear: { show: true, y0: 0.5, y1: 0.69 },
    };
    Object.assign(F, fo, {
      eye: Object.assign({ y: 0.6, x: 0.175, w: 0.18, h: 0.116, shape: 'almond', tilt: 0.034, peak: 0.42, iris: '#4b2c20', irisR: 0.054, irisH: 1.12, pupil: 0.42, pupilC: '#140a08', lid: 'double', halfLid: 0.17, lookX: 0.022, irisDy: -0.004, lashes: 3, lineC: '#1b1014', lineW: 2.7, refl: '#a8785a' }, fo.eye || {}),
      brow: Object.assign({ y: 0.462, x0: 0.062, len: 0.168, th: 0.017, arch: 0.016, tilt: -0.004, col: '#1c181e' }, fo.brow || {}),
      nose: Object.assign({ type: 'bridge', y: 0.765 }, fo.nose || {}),
      mouth: Object.assign({ type: 'lips', y: 0.868, w: 0.064, up: 0.012, lip: o.lip || '#d98892' }, fo.mouth || {}),
    });
    const ends = o.ends; // {col, a} fantasy treatment toward the hair ends
    const len = o.len != null ? o.len : R.Y(3.1); // back hair end (design y)
    const frontLen = o.frontLen != null ? o.frontLen : R.Y(2.35);
    const P2 = (x, y) => H2D(R, hx, tilt, x, y);
    const endGrad = (c, y0, y1) => {
      if (!ends || G.sil) return;
      const g = c.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, rgba(ends.col, 0));
      g.addColorStop(1, rgba(ends.col, ends.a != null ? ends.a : 0.9));
      c.fillStyle = g;
      c.fillRect(-500, y0, 1000, y1 - y0 + 40);
    };
    function back() {
      const w0 = 0.5 * hu, w1 = (o.backW || 0.64) * hu, w2 = (o.backW2 || 0.56) * hu;
      const yS = R.chin + 0.45 * hu;
      const bp = P((p) => {
        const a = P2(-0.47, 0.6), b = P2(0.47, 0.6);
        p.moveTo(a[0], a[1]);
        let q1 = P2(-0.62, 0.02), q2 = P2(-0.3, -0.13), q3 = P2(0.02, -0.13);
        p.bezierCurveTo(q1[0], q1[1], q2[0], q2[1], q3[0], q3[1]);
        q1 = P2(0.34, -0.13); q2 = P2(0.62, 0.02);
        p.bezierCurveTo(q1[0], q1[1], q2[0], q2[1], b[0], b[1]);
        p.bezierCurveTo(hx + w0 * 1.1, R.chin, hx + w1, yS - 0.2 * hu, hx + w1, yS + 0.3 * hu);
        p.bezierCurveTo(hx + w1, (yS + len) / 2, hx + w2 * 1.05, len - 0.5 * hu, hx + w2, len - 0.15 * hu);
        // soft wavy ends
        const n = 6;
        for (let i = 0; i < n; i++) {
          const xa = hx + w2 - (2 * w2 * (i + 0.5)) / n, xb = hx + w2 - (2 * w2 * (i + 1)) / n;
          p.quadraticCurveTo(xa, len + (i % 2 ? -0.06 : 0.1) * hu, xb, len - (i % 2 ? 0.0 : 0.04) * hu);
        }
        p.bezierCurveTo(hx - w2 * 1.05, len - 0.5 * hu, hx - w1, (yS + len) / 2, hx - w1, yS + 0.3 * hu);
        p.bezierCurveTo(hx - w1, yS - 0.2 * hu, hx - w0 * 1.1, R.chin, a[0], a[1]);
        p.closePath();
      });
      part(bp, deep, {
        sh: false, lw: 1.7, rimW: 1.5, rim: o.rim || sheen, rimA: 0.6, line: '#0b0a0f',
        inner: (c) => {
          for (const k of [-0.8, -0.5, 0.5, 0.8]) stroke([[hx + k * w1 * 0.9, R.chin], [hx + k * w1, (R.chin + len) / 2], [hx + k * w2 * 1.02, len - 4]], 1.1, rgba(sheen, 0.35));
          endGrad(c, len - (o.endsSpan || 0.9) * hu, len);
          if (o.backInner) o.backInner(c);
        },
      });
      return bp;
    }
    function face() {
      inHead(R, hx, () => drawFace(F), tilt);
    }
    function front() {
      inHead(R, hx, () => {
        // skull cap with off-centre parting (viewer-right of centre), hairline sweeping back over the tucked ear
        const cap = P((p) => {
          p.moveTo(-0.46, 0.62);
          p.bezierCurveTo(-0.56, 0.14, -0.31, -0.08, 0.02, -0.08);
          p.bezierCurveTo(0.34, -0.08, 0.56, 0.16, 0.455, 0.5);
          p.bezierCurveTo(0.43, 0.42, 0.36, 0.3, 0.26, 0.24);
          p.bezierCurveTo(0.2, 0.2, 0.14, 0.19, 0.09, 0.2);
          p.lineTo(-0.3, 0.3);
          p.closePath();
        });
        part(cap, hair, {
          sh: mix(hair, '#000', 0.4), shift: [0.05, 0.04], rimW: 0.016, rim: sheen, rimA: 0.6, lw: 1.7, line: '#0b0a0f',
          inner: () => {
            for (let i = 1; i <= 4; i++) stroke([[0.09, 0.19], [0.09 + i * 0.07, 0.02], [0.12 + i * 0.09, 0.2], [0.14 + i * 0.075, 0.42]], 1, rgba(sheen, 0.4));
          },
        });
        stroke([[-0.36, 0.3], [-0.3, 0.08], [-0.1, -0.03], [0.06, -0.03]], 5.5, rgba(sheen, 0.6));
        stroke([[0.16, 0.0], [0.3, 0.04], [0.4, 0.16]], 4, rgba(sheen, 0.55));
        // short side on the tucked side: swept back over the ear
        const rs = P((p) => {
          p.moveTo(0.09, 0.06);
          p.bezierCurveTo(0.26, 0.08, 0.4, 0.2, 0.45, 0.42);
          p.lineTo(0.47, 0.52);
          p.bezierCurveTo(0.42, 0.44, 0.36, 0.38, 0.32, 0.4);
          p.bezierCurveTo(0.28, 0.33, 0.2, 0.28, 0.12, 0.27);
          p.lineTo(0.09, 0.2);
          p.closePath();
        });
        part(rs, hair, { sh: mix(hair, '#000', 0.4), shift: [0.03, 0.03], rimW: 0.012, rim: sheen, rimA: 0.6, lw: 1.5, line: '#0b0a0f', inner: () => {
          stroke([[0.12, 0.1], [0.3, 0.18], [0.43, 0.4]], 1, rgba(sheen, 0.5));
          stroke([[0.12, 0.14], [0.26, 0.2], [0.38, 0.33]], 2.6, rgba(sheen, 0.55));
        } });
      }, tilt);
      // the long face-framing curtain on the viewer-left: from the parting, across the brow, down past the chest
      const sp = [P2(0.07, 0.1), P2(-0.18, 0.16), P2(-0.38, 0.32), P2(-0.45, 0.58), P2(-0.45, 0.86), P2(-0.47, 1.12),
        [hx - 0.58 * hu, R.chin + 0.42 * hu], [hx - 0.6 * hu, (R.chin + frontLen) / 2 + 0.25 * hu], [hx - 0.55 * hu, frontLen]];
      const wv = [0.1, 0.13, 0.12, 0.085, 0.078, 0.08, 0.1, 0.095, 0.02].map((v) => v * hu);
      const cur = ribbon(sp, wv, { seg: 10 });
      part(cur, hair, {
        sh: mix(hair, '#000', 0.4), shift: [2, 1.5], rimW: 1.1, rim: sheen, rimA: 0.6, lw: 1.6, line: '#0b0a0f',
        inner: (c) => {
          const sl = sp.map((q, i) => [q[0] + (i < 3 ? 0 : 0.02 * hu), q[1] + (i < 3 ? 0.02 * hu : 0)]);
          stroke(sl, 1, rgba(sheen, 0.45));
          stroke(sp.slice(0, 5).map((q) => [q[0] - 0.035 * hu, q[1] - 0.01 * hu]), 1, rgba('#000', 0.5));
          // sheen highlight band on the curve of the brow sweep
          stroke([P2(0.02, 0.1), P2(-0.16, 0.13), P2(-0.32, 0.24), P2(-0.41, 0.4)], 3.2 * Math.max(1, hu / 70), rgba(sheen, 0.75));
          stroke([[hx - 0.62 * hu, R.chin + 0.55 * hu], [hx - 0.64 * hu, (R.chin + frontLen) / 2 + 0.2 * hu], [hx - 0.58 * hu, frontLen - 0.4 * hu]], 2.4 * Math.max(1, hu / 70), rgba(sheen, 0.5));
          endGrad(c, frontLen - (o.endsSpan || 0.9) * hu * 0.8, frontLen);
        },
      });
      // a second thinner wisp on the face edge (soft natural wave)
      const wisp = ribbon([P2(-0.33, 0.36), P2(-0.39, 0.62), P2(-0.36, 0.86), P2(-0.39, 1.02)], [0.03, 0.035, 0.028, 0.004].map((v) => v * hu));
      part(wisp, hair, { sh: false, rim: false, lw: 1.2, line: '#0b0a0f' });
      // long drop earring under the tucked ear: gold hook, dark bead, jade drop
      const lobe = P2(0.43, 0.69);
      const L = (o.earLen || 0.42) * hu;
      line(curve([[lobe[0], lobe[1]], [lobe[0] + 0.6, lobe[1] + L * 0.45]]), '#c9a24a', 1.2);
      part(P((p) => p.arc(lobe[0] + 0.6, lobe[1] + L * 0.5, 0.045 * hu, 0, 7)), o.earBead || '#1f2a2c', { lw: 1, rimW: 0.6, sh: false, hi: P((p) => p.arc(lobe[0] + 0.6 - 0.015 * hu, lobe[1] + L * 0.5 - 0.015 * hu, 0.012 * hu, 0, 7)), hiC: 'rgba(255,255,255,0.8)' });
      line(curve([[lobe[0] + 0.6, lobe[1] + L * 0.55], [lobe[0] + 0.7, lobe[1] + L * 0.72]]), '#c9a24a', 1.1);
      const dr = P((p) => {
        const x = lobe[0] + 0.7, y = lobe[1] + L * 0.72;
        p.moveTo(x, y);
        p.bezierCurveTo(x + 0.06 * hu, y + 0.08 * hu, x + 0.05 * hu, y + 0.2 * hu, x, y + 0.24 * hu);
        p.bezierCurveTo(x - 0.05 * hu, y + 0.2 * hu, x - 0.06 * hu, y + 0.08 * hu, x, y);
        p.closePath();
      });
      part(dr, o.earDrop || '#7cc4a2', { lw: 1.1, rimW: 0.7, sh: mix(o.earDrop || '#7cc4a2', '#1f4d44', 0.4), shift: [1, 1], hi: P((p) => p.ellipse(lobe[0] + 0.7 - 0.015 * hu, lobe[1] + L * 0.72 + 0.09 * hu, 0.01 * hu, 0.04 * hu, 0, 0, 7)), hiC: 'rgba(255,255,255,0.7)' });
      if (o.ornament) o.ornament(P2, hu);
    }
    return { back, face, front, F, P2 };
  }
  B.bzHead = bzHead;

  // back-view hair mass for the silhouette card (long hair down to `len`)
  function bzBack(c, R, len, col, o = {}) {
    const hu = R.hu;
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(o.hx || 0, R.crown + 0.48 * hu, 0.5 * hu, 0.56 * hu, 0, 0, 7);
    c.fill();
    c.beginPath();
    c.moveTo(-0.5 * hu, R.crown + 0.6 * hu);
    c.bezierCurveTo(-0.66 * hu, R.chin + 0.5 * hu, -0.6 * hu, len - 20, -0.54 * hu, len);
    c.lineTo(0.54 * hu, len);
    c.bezierCurveTo(0.6 * hu, len - 20, 0.66 * hu, R.chin + 0.5 * hu, 0.5 * hu, R.crown + 0.6 * hu);
    c.fill();
  }
  B.bzBack = bzBack;

})();
