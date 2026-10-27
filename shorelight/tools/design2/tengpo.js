// 彼岸燈 Shorelight — 藤婆 Teng Po, final design (v2 turnaround)
// Figure coordinates: ground y = 0, centre x = 0, up is negative. Body height 600 = 5.5 heads (stooped).
(function (G) {
  'use strict';
  const K = G.K;
  const H = 600, U = H / 5.5;

  // ------------------------------------------------------------------ palette & materials
  const C = {
    straw: '#a88d52', moss: '#5d7a38', indigo: '#3f5673', piping: '#95552f', trousers: '#2b2724',
    hair: '#ede7dc', skin: '#d8a47c', vine: '#6a4c30', violet: '#b07cff', jade: '#6fb08c', brass: '#c79a45', ember: '#ff8a3c',
    basket: '#b38a4f',
  };
  const MT = {
    st: K.mat(C.straw, { sh: '#7a6234', sh2: '#5a4724', hl: '#d6bd7c', rim: '#f4e4a8', line: '#3f3017' }),
    mo: K.mat(C.moss, { sh: '#3d5726', sh2: '#2a3f1b', hl: '#90ad57', rim: '#d8f0a0', line: '#1f2d12' }),
    ja: K.mat(C.indigo, { sh: '#2b3d55', sh2: '#1f2d40', hl: '#6b84a3', rim: '#bcd2f0', line: '#141d2a' }),
    pi: K.mat(C.piping, { sh: '#6a3a1f', hl: '#c27a4a', line: '#3a1e0e' }),
    tr: K.mat(C.trousers, { sh: '#171513', sh2: '#0e0d0c', hl: '#4e4842', rim: '#a8a090', line: '#080706' }),
    ha: K.mat(C.hair, { sh: '#b9b1a8', sh2: '#968d86', hl: '#ffffff', rim: '#ffffff', line: '#6e655e' }),
    sk: K.mat(C.skin, { sh: '#b47a58', sh2: '#94593f', hl: '#f0c9a2', rim: '#ffe2bc', line: '#5a2e1c' }),
    vi: K.mat(C.vine, { sh: '#47321e', sh2: '#322213', hl: '#93714a', rim: '#d9c08a', line: '#22170b' }),
    br: K.mat(C.brass, { sh: '#86601f', hl: '#f6d993', line: '#47300c' }),
    jd: K.mat(C.jade, { sh: '#3f7a5c', hl: '#c8f0d8', line: '#1f4434' }),
    bk: K.mat(C.basket, { sh: '#7d5c2f', sh2: '#5c4220', hl: '#dcb87a', rim: '#f6e2b0', line: '#3a2810' }),
    lf: K.mat('#5f8a3e', { sh: '#3d6127', hl: '#9cc46a', line: '#203512' }),
    band: K.mat('#1d1a1c', { sh: '#0c0a0b', hl: '#4a4448', line: '#000000' }),
    gd: K.mat('#c9984a', { sh: '#8f6428', hl: '#f1cf8a', line: '#4a320f' }),
  };
  const RIM = '#f4e4a8';

  // ------------------------------------------------------------------ textures
  function strawTex(ctx, x0, x1, y0, y1, o) {
    o = o || {};
    const r = K.rng(o.seed || 9);
    for (let x = x0; x < x1; x += 3.2) {
      const fan = o.fan ? (x - (o.cx || 0)) / o.fan : 0;
      const yy0 = y0 + r() * 10, yy1 = y1 + r() * 16;
      const dark = r() < 0.5;
      K.line(ctx, [[x, yy0], [x + fan * (yy1 - yy0) * 0.5 + (r() - 0.5) * 3, (yy0 + yy1) / 2], [x + fan * (yy1 - yy0) + (r() - 0.5) * 5, yy1]], dark ? 1.3 : 1, dark ? '#6f5a2f' : '#d2b876', { alpha: dark ? 0.55 : 0.5 });
    }
  }
  function fringe(pts, n, depth, seed) {
    // straw fringe: many small clumps
    const s = K.sample(pts, false, 1, 24);
    const cum = [0];
    for (let i = 1; i < s.length; i++) cum.push(cum[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]));
    const L = cum[cum.length - 1];
    const at = (d) => { let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return [K.lerp(s[i - 1][0], s[i][0], t), K.lerp(s[i - 1][1], s[i][1], t)]; };
    const r = K.rng(seed || 3), out = [];
    for (let i = 0; i <= n; i++) {
      const a = at((L * i) / n); out.push([a[0], a[1] - 2, 1]);
      if (i < n) {
        const b = at((L * (i + 0.5)) / n), dd = depth * (0.7 + r() * 0.6);
        out.push([b[0] + (r() - 0.5) * 6, b[1] + dd, 1]);
      }
    }
    return out;
  }
  function mossClump(ctx, x, y, w, h, seed, o) {
    o = o || {};
    const r = K.rng(seed);
    const paths = [];
    const n = 5 + Math.floor(w / 14);
    for (let i = 0; i < n; i++) {
      const cx = x - w / 2 + (w * (i + 0.5)) / n + (r() - 0.5) * 6;
      const cy = y + (r() - 0.3) * h * 0.4;
      paths.push(K.ell(cx, cy, w / n * 0.9 + r() * 4, h * (0.45 + r() * 0.35)));
    }
    const all = K.union(ctx, paths, {
      fill: MT.mo.base, line: MT.mo.line, lw: 1.6,
      fx: [{ dx: -5, dy: -4, c: MT.mo.sh }, { dx: 3, dy: 4, c: MT.mo.hl, a: 0.7 }, { dx: -2, dy: 0, c: MT.mo.rim, a: 0.6 }],
    });
    K.clipDo(ctx, all, (c) => {
      for (let i = 0; i < w / 3; i++) {
        c.fillStyle = r() < 0.5 ? 'rgba(30,45,18,0.5)' : 'rgba(170,200,110,0.45)';
        c.beginPath(); c.arc(x - w / 2 + r() * w, y - h * 0.4 + r() * h, 0.9 + r() * 1.3, 0, Math.PI * 2); c.fill();
      }
    });
    if (o.fern) fern(ctx, x + o.fern[0], y + o.fern[1], o.fern[2], o.fern[3], seed + 3);
    if (o.shroom) shroom(ctx, x + o.shroom[0], y + o.shroom[1], o.shroom[2]);
  }
  function fern(ctx, x, y, len, ang, seed) {
    const r = K.rng(seed || 4);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const spine = [[0, 0], [len * 0.08, -len * 0.5], [len * 0.25, -len * 0.9], [len * 0.35, -len]];
    const sp = K.sample(spine, false, 1, 8);
    for (let i = 2; i < sp.length - 1; i++) {
      const t = i / sp.length, L = (1 - t) * len * 0.28 + 3;
      for (const sd of [-1, 1]) {
        const p = sp[i];
        const leaf = K.S([[p[0], p[1]], [p[0] + sd * L * 0.5, p[1] - L * 0.35], [p[0] + sd * L, p[1] - L * 0.15 - r() * 2], [p[0] + sd * L * 0.5, p[1] + 1]], true);
        K.part(ctx, leaf, { fill: MT.lf.base, line: MT.lf.line, lw: 1, fx: [{ dx: -2, dy: -1, c: MT.lf.sh }, { dx: 1, dy: 1, c: MT.lf.hl, a: 0.5 }] });
      }
    }
    K.line(ctx, spine, 1.4, MT.lf.line);
    ctx.restore();
  }
  function shroom(ctx, x, y, s) {
    const stem = K.S([[x - s * 0.18, y], [x - s * 0.14, y - s * 0.7], [x + s * 0.14, y - s * 0.7], [x + s * 0.18, y]], true);
    K.part(ctx, stem, { fill: '#efe2c8', line: '#6a5636', lw: 1.1, fx: [{ dx: -2, dy: 0, c: '#c8b48e' }] });
    const cap = K.S([[x - s * 0.55, y - s * 0.62, 1], [x - s * 0.4, y - s * 1.0], [x, y - s * 1.12], [x + s * 0.4, y - s * 1.0], [x + s * 0.55, y - s * 0.62, 1]], true);
    K.part(ctx, cap, { fill: '#d98a46', line: '#5a2e12', lw: 1.2, fx: [{ dx: -3, dy: -1, c: '#a85d2a' }, { dx: 2, dy: 2, c: '#f6c48a', a: 0.7 }] });
    ctx.fillStyle = '#fff3dc';
    for (const d of [[-0.2, -0.88], [0.15, -0.95], [0.32, -0.78]]) { ctx.beginPath(); ctx.arc(x + d[0] * s, y + d[1] * s, s * 0.07, 0, Math.PI * 2); ctx.fill(); }
  }
  function weave(ctx, x0, x1, y0, y1, o) {
    o = o || {};
    const step = o.step || 11;
    for (let y = y0; y < y1; y += step) {
      for (let x = x0, i = 0; x < x1; x += step * 1.4, i++) {
        const off = ((y - y0) / step) % 2 ? step * 0.7 : 0;
        const p = K.S([[x + off, y + 1], [x + off + step * 1.25, y + 1], [x + off + step * 1.3, y + step - 1], [x + off + 0.05, y + step - 1]], true, 0.5);
        K.part(ctx, p, { fill: MT.bk.base, line: MT.bk.line, lw: 0.9, fx: [{ dx: -3, dy: -2, c: MT.bk.sh, a: 0.7 }, { dx: 2, dy: 2, c: MT.bk.hl, a: 0.5 }] });
      }
    }
  }
  function smoke(ctx, pts, w, o) {
    o = o || {};
    ctx.save();
    K.taper(ctx, pts, w * 2, '#e8e2f4', { alpha: 0.3, w0: 0.3, w1: 0.8, blur: 3, noScale: true });
    K.taper(ctx, pts, w * 1.15, '#a99cc8', { alpha: 0.55, w0: 0.3, w1: 0.7, noScale: true });
    K.taper(ctx, pts.map((q) => [q[0] - w * 0.15, q[1] - w * 0.12]), w * 0.85, '#f7f4fc', { alpha: 0.9, w0: 0.3, w1: 0.6, noScale: true });
    ctx.restore();
  }
  function violetBloom(ctx, x, y, r, seed) {
    K.glow(ctx, x, y, r * 3.2, C.violet, 0.55);
    const rr = K.rng(seed || 5);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rr() * 0.4, px = x + Math.cos(a) * r * 0.7, py = y + Math.sin(a) * r * 0.7;
      K.part(ctx, K.ell(px, py, r * 0.62, r * 0.4, a), { fill: '#c49aff', line: '#4a2a80', lw: 1, fx: [{ dx: -2, dy: -1, c: '#8a5ad8' }, { dx: 1, dy: 1, c: '#f0e2ff', a: 0.8 }] });
    }
    K.part(ctx, K.circle(x, y, r * 0.3), { fill: '#fff6c8', line: '#7a5a20', lw: 0.8 });
  }
  function leaf(ctx, x, y, s, ang) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const p = K.S([[0, 0, 1], [s * 0.45, -s * 0.25], [s * 0.42, -s * 0.75], [0, -s * 1.05, 1], [-s * 0.42, -s * 0.75], [-s * 0.45, -s * 0.25]], true);
    K.part(ctx, p, { fill: MT.lf.base, line: MT.lf.line, lw: 1.2, fx: [{ dx: -s * 0.18, dy: 0, c: MT.lf.sh }, { dx: s * 0.1, dy: s * 0.1, c: MT.lf.hl, a: 0.6 }] });
    K.line(ctx, [[0, -1], [0, -s * 0.9]], 1, MT.lf.line, { alpha: 0.7 });
    ctx.restore();
  }

  // moss mantle: lumpy band along a top edge (pts left->right), thickness th; clipped to `clip`
  function mossMantle(ctx, clip, pts, th, seed) {
    const r = K.rng(seed || 7);
    const s = K.sample(pts, false, 1, 10);
    const lower = [];
    for (let i = s.length - 1; i >= 0; i--) {
      const q = s[i], t = i / (s.length - 1);
      const bump = th * (0.55 + 0.45 * Math.sin(t * Math.PI)) * (0.75 + r() * 0.5);
      lower.push([q[0] + (r() - 0.5) * 4, q[1] + bump]);
    }
    const top = s.map((q) => [q[0], q[1] - 6]);
    const mp = K.S(top.concat(lower), true, 0.9);
    K.clipDo(ctx, clip, (c) => {
      K.cast(c, clip, mp, 2, 7, '#3a2a10', 0.55);
      K.part(c, mp, {
        fill: MT.mo.base, line: MT.mo.line, lw: 1.6,
        fx: [{ dx: -8, dy: -5, c: MT.mo.sh }, { dx: 4, dy: 5, c: MT.mo.hl, a: 0.65 }],
        inner: (cc) => {
          for (let i = 0; i < s.length * 3; i++) {
            const q = s[Math.floor(r() * s.length)];
            cc.fillStyle = r() < 0.5 ? 'rgba(30,45,18,0.55)' : 'rgba(178,206,118,0.55)';
            cc.beginPath(); cc.arc(q[0] + (r() - 0.5) * 10, q[1] + r() * th, 1 + r() * 2.2, 0, Math.PI * 2); cc.fill();
          }
          // lumps
          for (let i = 1; i < lower.length - 1; i += 2) {
            const q = lower[i];
            K.part(cc, K.ell(q[0], q[1] - th * 0.35, th * 0.38, th * 0.26), { fill: 'rgba(0,0,0,0)', line: false, fx: [{ dx: 3, dy: 3, c: MT.mo.hl, a: 0.45 }, { dx: -3, dy: -2, c: MT.mo.sh, a: 0.5 }] });
          }
        },
      });
    });
    return lower;
  }
  // hanging old-man's-beard lichen (松蘿) strands
  function lichen(ctx, x, y, len, seed, n) {
    const r = K.rng(seed || 3);
    n = n || 5;
    for (let i = 0; i < n; i++) {
      const x0 = x + (r() - 0.5) * 12, L = len * (0.55 + r() * 0.6), sw = (r() - 0.5) * 8;
      const pts = [[x0, y], [x0 + sw * 0.4, y + L * 0.35], [x0 - sw * 0.3, y + L * 0.7], [x0 + sw * 0.2, y + L]];
      K.taper(ctx, pts, 4.6, '#55654a', { w0: 1, w1: 0.2, noScale: true });
      K.taper(ctx, pts, 3, i % 2 ? '#b9c7a0' : '#a7b88c', { w0: 1, w1: 0.2, noScale: true });
    }
  }

  // ------------------------------------------------------------------ props
  function gourd(ctx, x, y, s) {
    const body = K.S([[x, y], [x + s * 0.22, y + s * 0.12], [x + s * 0.2, y + s * 0.38], [x + s * 0.12, y + s * 0.46], [x + s * 0.36, y + s * 0.66], [x + s * 0.34, y + s * 0.96], [x, y + s * 1.08], [x - s * 0.34, y + s * 0.96], [x - s * 0.36, y + s * 0.66], [x - s * 0.12, y + s * 0.46], [x - s * 0.2, y + s * 0.38], [x - s * 0.22, y + s * 0.12]], true);
    K.toon(ctx, body, MT.gd, { s: s * 0.14, lw: 1.6 });
    K.taper(ctx, [[x - s * 0.16, y + s * 0.43], [x + s * 0.16, y + s * 0.43]], s * 0.08, '#b8292a', { w0: 1, w1: 1, noScale: true });
    K.part(ctx, K.rrect(x - s * 0.06, y - s * 0.1, s * 0.12, s * 0.12, 2), { fill: MT.vi.base, line: MT.vi.line, lw: 1 });
  }
  function pipe(ctx, a, b, o) {
    // long dry-tobacco pipe 旱煙管: jade mouthpiece at a, brass bowl at b
    o = o || {};
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    const p = (t) => [a[0] + dx * t, a[1] + dy * t];
    const mp = p(0.13);
    K.taper(ctx, [mp, b], 7.5, '#22170e', { w0: 1, w1: 1, noScale: true });
    K.taper(ctx, [mp, b], 5, '#5a3e26', { w0: 1, w1: 1, noScale: true });
    K.line(ctx, [[mp[0] - uy * 1.2, mp[1] + ux * 1.2 - 1], [b[0] - uy * 1.2, b[1] + ux * 1.2 - 1]], 1, '#9a7650', { alpha: 0.8 });
    // jade mouthpiece
    K.taper(ctx, [a, mp], 8.5, MT.jd.line, { w0: 0.7, w1: 1, noScale: true });
    K.taper(ctx, [a, mp], 6, C.jade, { w0: 0.7, w1: 1, noScale: true });
    K.line(ctx, [[a[0] + 2, a[1] - 1.5], [mp[0], mp[1] - 1.5]], 1.2, '#d2f5e0', { alpha: 0.8 });
    // brass ferrules
    for (const t of [0.13, 0.6]) { const q = p(t); K.part(ctx, K.ell(q[0], q[1], 4.2, 5, Math.atan2(dy, dx)), { fill: C.brass, line: MT.br.line, lw: 1 }); }
    // bowl
    const bw = o.bowl || 9;
    const cup = K.S([[b[0] - bw * 0.55, b[1] - bw * 1.1, 1], [b[0] + bw * 0.55, b[1] - bw * 1.1, 1], [b[0] + bw * 0.5, b[1] - bw * 0.2], [b[0], b[1] + bw * 0.3], [b[0] - bw * 0.5, b[1] - bw * 0.2]], true);
    K.toon(ctx, cup, MT.br, { s: 3, lw: 1.4 });
    K.part(ctx, K.ell(b[0], b[1] - bw * 1.1, bw * 0.55, bw * 0.2), { fill: '#3a1a0a', line: MT.br.line, lw: 1 });
    if (o.ember !== false) {
      K.glow(ctx, b[0], b[1] - bw * 1.1, bw * 2.4, C.ember, 0.7);
      K.part(ctx, K.ell(b[0], b[1] - bw * 1.12, bw * 0.38, bw * 0.13), { fill: '#ffb060', line: false });
    }
  }
  function staff(ctx, x, yTop, o) {
    // twisted dream-vine staff with a spiral head, leaves, glowing blooms and a gourd
    o = o || {};
    const sq = o.sq || 1; // horizontal squash for the side view loop
    const top = yTop;
    // shaft: two twisting strands
    const shaft = K.P((p) => p.roundRect(x - 8, top + 40, 16, -top - 40, 7));
    K.toon(ctx, shaft, MT.vi, {
      s: 4, lw: 1.8,
      inner: (c) => {
        for (let y = top + 50; y < -10; y += 26) {
          K.taper(c, [[x - 9, y], [x, y + 9], [x + 9, y + 18]], 3, MT.vi.sh2, { alpha: 0.85 });
          K.line(c, [[x - 9, y - 3.5], [x, y + 5.5], [x + 9, y + 14.5]], 1.2, MT.vi.hl, { alpha: 0.7 });
        }
        for (const ky of [top + 200, top + 420]) K.part(c, K.ell(x + 3, ky, 5, 7), { fill: MT.vi.sh, line: MT.vi.line, lw: 1 });
      },
    });
    // spiral head
    const sp = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = Math.PI * 0.5 - t * Math.PI * 3.2, r = 34 * (1 - t * 0.72);
      sp.push([x + Math.cos(a) * r * sq + 2 * sq, top + 6 - 30 + Math.sin(a) * r * -1 + 30 * (1 - t) * 0.0]);
    }
    const path = [[x, top + 60]].concat(sp);
    K.taper(ctx, path, 18, MT.vi.line, { w0: 1, w1: 0.35, a: 0.05, b: 0.6, noScale: true });
    K.taper(ctx, path, 14, MT.vi.base, { w0: 1, w1: 0.3, a: 0.05, b: 0.6, noScale: true });
    K.taper(ctx, path.map((q) => [q[0] - 1.5, q[1] - 1.5]), 3, MT.vi.hl, { w0: 1, w1: 0.2, a: 0.05, b: 0.6, alpha: 0.7, noScale: true });
    // tendril
    K.taper(ctx, [[x - 30 * sq, top - 10], [x - 46 * sq, top - 30], [x - 40 * sq, top - 52], [x - 30 * sq, top - 48]], 3, MT.vi.line, { w0: 1, w1: 0.2, noScale: true });
    // leaves
    leaf(ctx, x + 42 * sq, top - 4, 26, 1.1);
    leaf(ctx, x - 44 * sq, top + 10, 24, -1.3);
    leaf(ctx, x + 8 * sq, top - 74, 22, 0.3);
    leaf(ctx, x - 20 * sq, top - 70, 18, -0.6);
    leaf(ctx, x + 16 * sq, top + 52, 20, 2.2);
    // gourd on a red cord
    if (o.gourd !== false) {
      K.line(ctx, [[x + 30 * sq, top + 18], [x + 32 * sq, top + 46]], 1.6, '#b8292a');
      gourd(ctx, x + 32 * sq, top + 48, 38);
    }
    // blooms
    violetBloom(ctx, x - 32 * sq, top - 34, 10, 3);
    violetBloom(ctx, x + 26 * sq, top - 54, 9, 7);
    violetBloom(ctx, x - 14 * sq, top + 34, 7.5, 9);
    violetBloom(ctx, x + 40 * sq, top + 22, 6.5, 11);
  }

  // ------------------------------------------------------------------ head (front / 3-4)
  // expr: wry | cackle | stern | trance ; o.pipe: pipe in mouth
  function headFront(ctx, o) {
    o = o || {};
    const u = U, th = o.turn || 0, R = 0.4, ct = Math.cos(th), st = Math.sin(th);
    const X0 = o.x || 0, Y0 = o.y == null ? -H : o.y;
    const m = (lx, ly, d) => {
      d = d || 0;
      const z = Math.sqrt(Math.max(0, R * R - lx * lx)) + d;
      return [X0 + (lx * ct + z * st - R * st * 0.85) * u, Y0 + ly * u];
    };
    const M = (pts, d) => pts.map((q) => { const r = m(q[0], q[1], q[3] != null ? q[3] : d || 0); if (q[2]) r.push(1); return r; });
    const E = o.expr || 'wry';
    const sk = MT.sk, ha = MT.ha;

    // --- bun (behind/above the crown), hairpin and dream-vine sprig
    const bc = m(0.0, -0.1, -0.3);
    const bun = K.ell(bc[0], bc[1], 0.2 * u, 0.155 * u);
    K.toon(ctx, bun, ha, {
      s: 7, lw: 2,
      inner: (c) => {
        for (let i = 0; i < 4; i++) { const rr = (0.16 - i * 0.035) * u; c.strokeStyle = K.rgba(ha.sh2, 0.75); c.lineWidth = 1.2; c.beginPath(); c.arc(bc[0] + 0.01 * u * i, bc[1] + 0.01 * u * i, rr, Math.PI * 0.9, Math.PI * 2.2); c.stroke(); }
      },
    });
    // wooden hairpin across the bun
    K.taper(ctx, [[bc[0] - 0.3 * u, bc[1] + 0.06 * u], [bc[0] + 0.32 * u, bc[1] - 0.1 * u]], 6, MT.vi.line, { w0: 0.6, w1: 1, noScale: true });
    K.taper(ctx, [[bc[0] - 0.3 * u, bc[1] + 0.06 * u], [bc[0] + 0.32 * u, bc[1] - 0.1 * u]], 4, '#8a6238', { w0: 0.6, w1: 1, noScale: true });
    K.part(ctx, K.circle(bc[0] + 0.33 * u, bc[1] - 0.1 * u, 4), { fill: C.jade, line: MT.jd.line, lw: 1 });
    // sprig of dream-vine (viewer's right of the bun)
    const sg = m(0.16, -0.06, -0.3);
    K.taper(ctx, [[sg[0], sg[1]], [sg[0] + 12, sg[1] - 14], [sg[0] + 24, sg[1] - 18], [sg[0] + 30, sg[1] - 30]], 2.6, MT.vi.base, { w0: 1, w1: 0.3, noScale: true });
    leaf(ctx, sg[0] + 18, sg[1] - 14, 13, 1.2);
    violetBloom(ctx, sg[0] + 28, sg[1] - 30, 5.5, 2);
    violetBloom(ctx, sg[0] + 10, sg[1] - 22, 4.5, 4);

    // --- ears with long lobes + jade earrings (behind face)
    for (const s of [-1, 1]) {
      const ear = K.S(M([[s * 0.385, 0.46], [s * 0.45, 0.43], [s * 0.49, 0.5], [s * 0.485, 0.62], [s * 0.465, 0.74], [s * 0.455, 0.84], [s * 0.42, 0.87], [s * 0.4, 0.8], [s * 0.39, 0.68]], -0.12), true);
      K.toon(ctx, ear, sk, { s: 4, lw: 1.8 });
      K.line(ctx, M([[s * 0.445, 0.49], [s * 0.465, 0.58], [s * 0.445, 0.68], [s * 0.42, 0.7]], -0.12), 1.6, sk.sh2);
      const er = m(s * 0.437, 0.86, -0.12);
      K.line(ctx, [[er[0], er[1]], [er[0], er[1] + 6]], 1.2, C.brass);
      const drop = K.S([[er[0], er[1] + 5], [er[0] + 4.5, er[1] + 11], [er[0] + 3.5, er[1] + 17], [er[0], er[1] + 19, 1], [er[0] - 3.5, er[1] + 17], [er[0] - 4.5, er[1] + 11]], true);
      K.part(ctx, drop, { fill: C.jade, line: MT.jd.line, lw: 1.1, fx: [{ dx: -2, dy: -1, c: MT.jd.sh }, { dx: 1.5, dy: 1.5, c: MT.jd.hl, a: 0.8 }] });
    }

    // --- face: broad, apple-cheeked, soft jowls, small chin
    const half = [[0, 0], [0.2, 0.015], [0.33, 0.08], [0.39, 0.22], [0.405, 0.38], [0.41, 0.5], [0.4, 0.61], [0.375, 0.7], [0.35, 0.79], [0.31, 0.86], [0.24, 0.92], [0.14, 0.965], [0.06, 0.985], [0, 0.99]];
    const faceP = K.S(M(K.sym(half).map((q) => [q[0], q[1], q[2], q[1] > 0.8 ? 0.03 : 0])), true);
    K.toon(ctx, faceP, sk, { s: 9, sd: [-9, -3], deepA: 0.3, hl: false, rim: sk.rim, lw: 2 });
    K.clipDo(ctx, faceP, (c) => {
      // apple cheeks (warm)
      for (const s of [-1, 1]) {
        const ch = m(s * 0.22, 0.66, 0.02);
        const g = c.createRadialGradient(ch[0], ch[1], 1, ch[0], ch[1], 0.13 * u);
        g.addColorStop(0, 'rgba(214,110,90,0.38)'); g.addColorStop(1, 'rgba(214,110,90,0)');
        c.fillStyle = g; c.fillRect(ch[0] - 0.15 * u, ch[1] - 0.15 * u, 0.3 * u, 0.3 * u);
        // jowl contour
        K.taper(c, M([[s * 0.36, 0.72], [s * 0.33, 0.8], [s * 0.27, 0.86]]), 0.012 * u, sk.sh2, { alpha: 0.65 });
      }
      // age spots
      for (const d of [[-0.28, 0.42, 0.012], [-0.25, 0.46, 0.008], [0.3, 0.74, 0.01]]) { const q = m(d[0], d[1]); c.fillStyle = 'rgba(140,80,50,0.35)'; c.beginPath(); c.arc(q[0], q[1], d[2] * u, 0, Math.PI * 2); c.fill(); }
      // forehead lines (above brows, below the band)
      for (const yy of [0.36, 0.395]) K.taper(c, M([[-0.18, yy + 0.008], [-0.06, yy - 0.004], [0.06, yy - 0.002], [0.18, yy + 0.01]]), 0.01 * u, sk.sh2, { alpha: 0.55 });
      // neck/chin crease
      K.taper(c, M([[-0.1, 0.955], [0, 0.968], [0.1, 0.955]]), 0.01 * u, sk.sh2, { alpha: 0.6 });
    });

    // --- eyes: hooded, crinkled; one squints (wry)
    const EY = 0.545;
    for (const s of [-1, 1]) drawEye(ctx, s, E, EY, m, M, u);
    // --- brows: bushy white, the viewer-right one cocked
    for (const s of [-1, 1]) {
      const raise = (E === 'wry' && s > 0) ? -0.03 : (E === 'stern' ? 0.012 : 0);
      const tilt = E === 'stern' ? 0.03 : 0;
      const pts = [[s * 0.08, EY - 0.075 + raise + tilt], [s * 0.16, EY - 0.1 + raise], [s * 0.25, EY - 0.088 + raise - tilt * 0.3], [s * 0.3, EY - 0.06 + raise]];
      K.taper(ctx, M(pts, -0.01), 0.05 * u, ha.sh2, { w0: 0.7, w1: 0.3 });
      K.taper(ctx, M(pts.map((q) => [q[0], q[1] - 0.006]), -0.01), 0.038 * u, ha.base, { w0: 0.7, w1: 0.3 });
      for (let i = 0; i < 4; i++) K.line(ctx, M([[s * (0.1 + i * 0.05), EY - 0.08 + raise], [s * (0.13 + i * 0.05), EY - 0.1 + raise - 0.008], [s * (0.17 + i * 0.05), EY - 0.104 + raise - 0.004]], -0.01), 1, ha.sh2, { alpha: 0.8 });
      if (s > 0) K.line(ctx, M([[0.31, EY - 0.065 + raise], [0.345, EY - 0.05 + raise]], -0.01), 1.2, ha.sh2);
    }

    // --- nose: broad, rounded tip
    K.taper(ctx, M([[0.05, 0.56], [0.065, 0.64], [0.07, 0.7]], 0.04), 0.03 * u, sk.sh, { w0: 0.2, w1: 0.6, alpha: 0.75 });
    const nt = m(0, 0.72, 0.09);
    K.part(ctx, K.ell(nt[0], nt[1], 0.055 * u, 0.045 * u), { fill: 'rgba(0,0,0,0)', line: false, fx: [{ dx: -0.012 * u, dy: -0.01 * u, c: sk.sh, a: 0.45 }] });
    K.taper(ctx, M([[-0.095, 0.71], [-0.09, 0.74], [-0.055, 0.757]], 0.06), 0.016 * u, sk.line, { w0: 0.5 });
    K.taper(ctx, M([[0.095, 0.708], [0.092, 0.738], [0.058, 0.755]], 0.06), 0.017 * u, sk.line, { w0: 0.5 });
    K.taper(ctx, M([[-0.035, 0.758], [0, 0.768], [0.038, 0.756]], 0.09), 0.012 * u, sk.line, {});
    K.part(ctx, K.ell(...m(-0.02, 0.71, 0.1), 0.02 * u, 0.014 * u), { fill: 'rgba(255,240,220,0.65)', line: false });
    // nasolabial folds (deep)
    for (const s of [-1, 1]) K.taper(ctx, M([[s * 0.1, 0.72], [s * 0.155, 0.79], [s * 0.17, 0.86], [s * 0.16, 0.9]], 0.02), 0.016 * u, sk.sh2, { alpha: 0.75, w0: 0.6, w1: 0.2 });

    // --- mouth
    const MY = 0.835;
    if (E === 'cackle') {
      const mp = K.S(M([[-0.13, MY - 0.01, 1], [0, MY - 0.02], [0.13, MY - 0.015, 1], [0.1, MY + 0.06], [0, MY + 0.085], [-0.1, MY + 0.06]], 0.03), true, 0.8);
      K.part(ctx, mp, { fill: '#4a1a18', line: '#2a0c0a', lw: 1.6 });
      K.clipDo(ctx, mp, (c) => {
        K.part(c, K.ell(...m(0, MY + 0.08, 0.03), 0.08 * u, 0.035 * u), { fill: '#b8565a', line: false });
        // a few remaining teeth
        for (const tx of [-0.07, 0.03]) K.part(c, K.rrect(...m(tx, MY - 0.022, 0.03), 0.032 * u, 0.03 * u, 2), { fill: '#efe6d2', line: '#8a7a68', lw: 0.8 });
      });
    } else if (E === 'trance') {
      K.part(ctx, K.ell(...m(0, MY + 0.01, 0.03), 0.04 * u, 0.018 * u), { fill: '#4a1a18', line: '#2a0c0a', lw: 1.4 });
    } else {
      const up = E === 'stern' ? 0 : 0.022;
      const pts = [[-0.11, MY + 0.004], [-0.04, MY + 0.008], [0.04, MY + 0.002], [0.115, MY - up]];
      K.taper(ctx, M(pts, 0.03), 0.017 * u, '#5a2420', { w0: 0.4, w1: 0.5 });
      K.taper(ctx, M([[-0.06, MY + 0.04], [0, MY + 0.048], [0.06, MY + 0.038]], 0.03), 0.012 * u, sk.sh2, { alpha: 0.7 });
      if (up) K.taper(ctx, M([[0.12, MY - 0.035], [0.135, MY - up], [0.125, MY + 0.012]], 0.03), 0.01 * u, sk.sh2, { alpha: 0.8 });
    }
    // smoker's lip lines + marionette lines
    for (const lx of [-0.06, -0.025, 0.02, 0.055]) K.line(ctx, M([[lx, MY - 0.035], [lx + 0.004, MY - 0.012]], 0.03), 0.9, sk.sh2, { alpha: 0.7 });
    for (const s of [-1, 1]) K.taper(ctx, M([[s * 0.12, MY + 0.02], [s * 0.13, MY + 0.07], [s * 0.115, MY + 0.11]], 0.02), 0.011 * u, sk.sh2, { alpha: 0.6 });
    // mole (character mark)
    K.part(ctx, K.circle(...m(0.2, 0.79, 0.02), 0.014 * u), { fill: '#6a3a26', line: false });

    // --- hair: white, scraped back under the band, flyaway wisps
    const hairP = K.S(M([[-0.42, 0.42, 1], [-0.43, 0.25], [-0.36, 0.08], [-0.2, -0.01], [0, -0.03], [0.2, -0.01], [0.36, 0.08], [0.43, 0.25], [0.42, 0.42, 1], [0.38, 0.4], [0.375, 0.3], [0.3, 0.24], [0, 0.22], [-0.3, 0.24], [-0.375, 0.3], [-0.38, 0.4]], -0.04), true);
    K.cast(ctx, faceP, hairP, 0, 5, sk.sh, 0.5);
    K.toon(ctx, hairP, ha, {
      s: 8, lw: 2,
      inner: (c) => {
        for (let i = -5; i <= 5; i++) K.line(c, M([[i * 0.075, 0.24], [i * 0.06, 0.12], [i * 0.03, -0.02]], -0.04), 1.1, ha.sh2, { alpha: 0.75 });
        K.taper(c, M([[-0.28, 0.1], [-0.12, 0.04], [0.06, 0.03]], -0.04), 0.04 * u, '#ffffff', { alpha: 0.9 });
      },
    });
    for (const s of [-1, 1]) {
      K.line(ctx, M([[s * 0.4, 0.3], [s * 0.47, 0.24], [s * 0.5, 0.15]], -0.1), 1.3, ha.sh2, { alpha: 0.9 });
      K.line(ctx, M([[s * 0.38, 0.38], [s * 0.45, 0.36], [s * 0.49, 0.3]], -0.1), 1.1, ha.sh2, { alpha: 0.8 });
    }
    // --- black 抹額 brow band with a jade disc
    const bandP = K.S(M([[-0.425, 0.21], [-0.2, 0.19], [0, 0.185], [0.2, 0.19], [0.425, 0.21], [0.425, 0.3], [0.2, 0.285], [0, 0.282], [-0.2, 0.285], [-0.425, 0.3]], 0.0), true);
    K.cast(ctx, faceP, bandP, 0, 4, sk.sh, 0.45);
    K.toon(ctx, bandP, MT.band, { s: 5, lw: 1.8, inner: (c) => { K.line(c, M([[-0.4, 0.215], [0, 0.192], [0.4, 0.215]]), 1, '#55505a', { alpha: 0.8 }); } });
    const jd = m(0, 0.236, 0.03);
    K.part(ctx, K.circle(jd[0], jd[1], 0.058 * u), { fill: C.jade, line: MT.jd.line, lw: 1.4, fx: [{ dx: -3, dy: -2, c: MT.jd.sh }, { dx: 2, dy: 2, c: MT.jd.hl, a: 0.8 }] });
    K.part(ctx, K.circle(jd[0], jd[1], 0.02 * u), { fill: '#1d1a1c', line: MT.jd.line, lw: 1 });

    // --- pipe in mouth (bust)
    if (o.pipe) {
      const a = m(0.1, MY - 0.004, 0.05);
      pipe(ctx, a, [a[0] + 0.95 * u, a[1] + 0.62 * u], { bowl: 9 });
      smoke(ctx, [[a[0] + 0.95 * u, a[1] + 0.5 * u], [a[0] + 1.05 * u, a[1] + 0.25 * u], [a[0] + 0.92 * u, a[1] + 0.02 * u], [a[0] + 1.04 * u, a[1] - 0.22 * u], [a[0] + 0.94 * u, a[1] - 0.36 * u], [a[0] + 0.86 * u, a[1] - 0.3 * u]], 9);
    }
    return { faceP, m, M };
  }

  function drawEye(ctx, s, E, EY, m, M, u) {
    const sk = MT.sk;
    const cx = s * 0.165, w = 0.15;
    const d = -0.02;
    const open = E === 'stern' ? (s > 0 ? 0.06 : 0.022) : E === 'wry' ? (s > 0 ? 0.048 : 0.02) : 0;
    // hood (heavy upper lid fold) — always
    K.taper(ctx, M([[cx - s * w * 0.48, EY - 0.025], [cx - s * w * 0.1, EY - 0.05 - open * 0.25], [cx + s * w * 0.3, EY - 0.045 - open * 0.25], [cx + s * w * 0.6, EY - 0.008]], d), 0.016 * u, sk.sh2, { alpha: 0.85, w0: 0.3, w1: 0.6 });
    if (open > 0) {
      const inner = [cx - s * w * 0.48, EY + 0.002, 1], outer = [cx + s * w * 0.5, EY + 0.008, 1];
      const shape = K.S(M([inner, [cx - s * w * 0.15, EY - open * 0.55], [cx + s * w * 0.22, EY - open * 0.5], outer, [cx + s * w * 0.15, EY + open * 0.32], [cx - s * w * 0.2, EY + open * 0.3]], d), true);
      K.part(ctx, shape, { fill: '#efe7d8', line: false, fx: [{ dx: 0, dy: open * 0.5 * u, c: '#c5b2a2' }] });
      K.clipDo(ctx, shape, (c) => {
        const ic = m(cx + s * 0.004 + 0.008, EY - 0.002, d);
        const r = 0.032 * u;
        const g = c.createLinearGradient(ic[0], ic[1] - r, ic[0], ic[1] + r);
        g.addColorStop(0, '#2c2a10'); g.addColorStop(0.5, '#7a7a24'); g.addColorStop(1, '#d8c860');
        c.fillStyle = g; c.beginPath(); c.arc(ic[0], ic[1], r, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#100c06'; c.beginPath(); c.arc(ic[0], ic[1], r * 0.42, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(ic[0] - r * 0.35, ic[1] - r * 0.3, r * 0.3, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(70,40,30,0.35)'; c.fillRect(ic[0] - r * 2, ic[1] - r * 2.2, r * 4, r * 1.4);
      });
      K.taper(ctx, M([inner, [cx - s * w * 0.15, EY - open * 0.55], [cx + s * w * 0.22, EY - open * 0.5], outer], d), 0.02 * u, '#2a1810', { w0: 0.3, w1: 0.5 });
      K.taper(ctx, M([outer, [cx + s * w * 0.15, EY + open * 0.32], [cx - s * w * 0.2, EY + open * 0.3]], d), 0.008 * u, '#6a3a2a', { w0: 0.6, w1: 0.1 });
    } else {
      // closed, smiling crescent (cackle / trance / squint)
      const curve = E === 'trance' ? [[cx - s * w * 0.45, EY], [cx, EY + 0.018], [cx + s * w * 0.48, EY + 0.002]] : [[cx - s * w * 0.48, EY + 0.012], [cx, EY - 0.014], [cx + s * w * 0.5, EY + 0.008]];
      K.taper(ctx, M(curve, d), 0.02 * u, '#2a1810', { w0: 0.3, w1: 0.4 });
    }
    // under-eye bags + crow's feet
    K.taper(ctx, M([[cx - s * w * 0.4, EY + 0.04], [cx, EY + 0.055], [cx + s * w * 0.45, EY + 0.038]], d), 0.011 * u, sk.sh2, { alpha: 0.6 });
    K.taper(ctx, M([[cx - s * w * 0.3, EY + 0.07], [cx + s * w * 0.1, EY + 0.08], [cx + s * w * 0.4, EY + 0.07]], d), 0.009 * u, sk.sh2, { alpha: 0.4 });
    for (let i = 0; i < 3; i++) K.taper(ctx, M([[cx + s * w * 0.6, EY - 0.012 + i * 0.02], [cx + s * w * 0.95, EY - 0.03 + i * 0.03]], d), 0.009 * u, sk.sh2, { alpha: 0.7, w0: 0.8, w1: 0.1 });
    if (E === 'trance') {
      // faint violet glow on the lids during the rite
      const q = m(cx, EY, d);
      K.glow(ctx, q[0], q[1], 0.09 * u, C.violet, 0.5);
    }
  }

  // ------------------------------------------------------------------ head (profile, facing left)
  function headSide(ctx, o) {
    o = o || {};
    const u = U, X0 = o.x || 0, Y0 = o.y == null ? -H : o.y, tl = o.tilt || 0;
    const ctl = Math.cos(tl), stl = Math.sin(tl);
    const m = (lx, ly) => { const x = lx * u, y = (ly - 0.9) * u; return [X0 + x * ctl - y * stl, Y0 + 0.9 * u + x * stl + y * ctl]; };
    const M = (pts) => pts.map((q) => { const r = m(q[0], q[1]); if (q[2]) r.push(1); return r; });
    const sk = MT.sk, ha = MT.ha;
    // bun at the back-top
    const bc = m(0.3, 0.02);
    K.toon(ctx, K.ell(bc[0], bc[1], 0.2 * u, 0.17 * u), ha, { s: 7, sd: [7, -3], lw: 2 });
    K.taper(ctx, [[bc[0] - 0.3 * u, bc[1] - 0.08 * u], [bc[0] + 0.3 * u, bc[1] + 0.1 * u]], 5, '#8a6238', { w0: 0.6, w1: 1, noScale: true });
    violetBloom(ctx, bc[0] + 0.12 * u, bc[1] - 0.2 * u, 5, 2);
    leaf(ctx, bc[0] + 0.02 * u, bc[1] - 0.16 * u, 12, -0.4);
    const outline = [[0, 0], [-0.2, 0.04], [-0.33, 0.16], [-0.38, 0.3], [-0.39, 0.44], [-0.37, 0.5], [-0.4, 0.56], [-0.445, 0.64], [-0.48, 0.7], [-0.475, 0.735], [-0.43, 0.755, 1], [-0.405, 0.785], [-0.4, 0.81, 1], [-0.395, 0.835], [-0.385, 0.86], [-0.375, 0.9], [-0.35, 0.95], [-0.28, 0.99], [-0.16, 1.02], [-0.04, 1.0], [0.06, 0.88], [0.22, 0.86], [0.38, 0.72], [0.46, 0.5], [0.45, 0.3], [0.36, 0.12], [0.2, 0.02]];
    const headP = K.S(M(outline), true, 0.9);
    K.toon(ctx, headP, sk, { s: 9, sd: [9, -4], hl: false, rim: sk.rim, rimW: -2.2, lw: 2 });
    K.clipDo(ctx, headP, (c) => {
      const ch = m(-0.24, 0.66);
      const g = c.createRadialGradient(ch[0], ch[1], 1, ch[0], ch[1], 0.12 * u);
      g.addColorStop(0, 'rgba(214,110,90,0.38)'); g.addColorStop(1, 'rgba(214,110,90,0)');
      c.fillStyle = g; c.fillRect(ch[0] - 0.15 * u, ch[1] - 0.15 * u, 0.3 * u, 0.3 * u);
      K.taper(c, M([[-0.36, 0.73], [-0.3, 0.8], [-0.3, 0.88]]), 0.014 * u, sk.sh2, { alpha: 0.7 });
      K.taper(c, M([[-0.25, 0.95], [-0.1, 0.92], [0.04, 0.88]]), 0.04 * u, sk.sh, { alpha: 0.6 });
      for (let i = 0; i < 3; i++) K.taper(c, M([[-0.24, 0.5 + i * 0.025], [-0.17, 0.48 + i * 0.035]]), 0.009 * u, sk.sh2, { alpha: 0.7 });
      for (const yy of [0.36, 0.395]) K.taper(c, M([[-0.37, yy], [-0.28, yy - 0.01]]), 0.009 * u, sk.sh2, { alpha: 0.6 });
    });
    // hair (back of head) + band
    const hairP = K.S(M([[-0.36, 0.2], [-0.25, 0.03], [0, -0.03], [0.22, 0.02], [0.4, 0.14], [0.47, 0.32], [0.46, 0.52], [0.4, 0.66], [0.3, 0.7], [0.22, 0.6], [0.14, 0.42], [0.0, 0.3], [-0.2, 0.26]]), true);
    K.toon(ctx, hairP, ha, { s: 7, sd: [7, -3], lw: 2, inner: (c) => { for (let i = 0; i < 6; i++) K.line(c, M([[-0.3 + i * 0.03, 0.22 + i * 0.01], [0.0 + i * 0.05, 0.05 + i * 0.03], [0.3 + i * 0.02, 0.1 + i * 0.06]]), 1.1, ha.sh2, { alpha: 0.7 }); } });
    const bandP = K.S(M([[-0.39, 0.2], [0, 0.17], [0.44, 0.24], [0.45, 0.33], [0, 0.27], [-0.4, 0.29]]), true);
    K.toon(ctx, bandP, MT.band, { s: 4, sd: [4, -2], lw: 1.8 });
    // band tails at the back
    K.taper(ctx, M([[0.44, 0.28], [0.52, 0.36], [0.55, 0.48]]), 0.05 * u, '#1d1a1c', { w0: 1, w1: 0.6 });
    const jd = m(-0.385, 0.245);
    K.part(ctx, K.ell(jd[0], jd[1], 0.02 * u, 0.055 * u), { fill: C.jade, line: MT.jd.line, lw: 1.2 });
    // ear + earring
    const ear = K.S(M([[0.06, 0.46], [0.13, 0.43], [0.18, 0.5], [0.18, 0.62], [0.16, 0.74], [0.15, 0.84], [0.11, 0.87], [0.09, 0.78], [0.08, 0.64]]), true);
    K.toon(ctx, ear, sk, { s: 5, sd: [5, -3], lw: 1.8 });
    K.line(ctx, M([[0.1, 0.5], [0.15, 0.53], [0.155, 0.63], [0.13, 0.69]]), 1.5, sk.sh2);
    const er = m(0.125, 0.86);
    K.part(ctx, K.S([[er[0], er[1] + 4], [er[0] + 4.5, er[1] + 10], [er[0] + 3.5, er[1] + 16], [er[0], er[1] + 18, 1], [er[0] - 3.5, er[1] + 16], [er[0] - 4.5, er[1] + 10]], true), { fill: C.jade, line: MT.jd.line, lw: 1.1 });
    // eye (hooded, squinting)
    K.taper(ctx, M([[-0.34, 0.545], [-0.3, 0.535], [-0.25, 0.545]]), 0.02 * u, '#2a1810', { w0: 0.5, w1: 0.3 });
    K.taper(ctx, M([[-0.35, 0.52], [-0.3, 0.505], [-0.24, 0.53]]), 0.014 * u, sk.sh2, { alpha: 0.85 });
    K.part(ctx, K.ell(...m(-0.315, 0.548), 0.008 * u, 0.012 * u), { fill: '#6a6a20', line: false });
    // brow
    K.taper(ctx, M([[-0.38, 0.45], [-0.32, 0.43], [-0.22, 0.445]]), 0.045 * u, ha.sh2, { w0: 0.8, w1: 0.3 });
    K.taper(ctx, M([[-0.38, 0.444], [-0.32, 0.424], [-0.22, 0.44]]), 0.032 * u, ha.base, { w0: 0.8, w1: 0.3 });
    // nostril, nasolabial, mouth
    K.taper(ctx, M([[-0.44, 0.715], [-0.41, 0.73], [-0.405, 0.745]]), 0.016 * u, sk.line, {});
    K.taper(ctx, M([[-0.39, 0.73], [-0.33, 0.8], [-0.32, 0.88]]), 0.013 * u, sk.sh2, { alpha: 0.75 });
    K.taper(ctx, M([[-0.4, 0.812], [-0.36, 0.814], [-0.33, 0.8]]), 0.014 * u, '#5a2420', { w0: 0.5, w1: 0.4 });
    if (o.pipe) {
      const a = m(-0.4, 0.81);
      pipe(ctx, a, [a[0] - 0.55 * u, a[1] + 0.55 * u], { bowl: 9 });
    }
    return { headP, m, M };
  }

  // ------------------------------------------------------------------ hands (old, knuckly)
  function gripV(ctx, x, y, flip) {
    // fist around a vertical shaft at (x,y)
    const f = flip ? -1 : 1, sk = MT.sk;
    const palm = K.S([[x - f * 13, y - 20], [x + f * 9, y - 24], [x + f * 15, y - 8], [x + f * 14, y + 14], [x + f * 2, y + 20], [x - f * 12, y + 14], [x - f * 15, y - 4]], true);
    K.toon(ctx, palm, sk, { s: 5, lw: 1.8 });
    for (let i = 0; i < 4; i++) {
      const yy = y - 11 + i * 8;
      const fp = K.S([[x - f * 15, yy - 4], [x + f * 3, yy - 4.5], [x + f * 11, yy - 2], [x + f * 12, yy + 3], [x + f * 3, yy + 4], [x - f * 15, yy + 3.5]], true, 0.8);
      K.toon(ctx, fp, sk, { s: 2.5, lw: 1.4, hl: false });
      K.part(ctx, K.circle(x + f * 9, yy, 1.6), { fill: sk.sh, line: false });
    }
    const th = K.S([[x - f * 14, y - 18], [x - f * 4, y - 26], [x + f * 7, y - 24], [x + f * 9, y - 19], [x - f * 2, y - 16]], true);
    K.toon(ctx, th, sk, { s: 3, lw: 1.5 });
  }
  function gripPipe(ctx, x, y, ang) {
    // hand holding a near-horizontal stem; fingers wrap from below, thumb on top
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const sk = MT.sk;
    const back = K.S([[-16, -10], [6, -14], [16, -6], [16, 12], [2, 18], [-14, 14], [-20, 2]], true);
    K.toon(ctx, back, sk, { s: 5, lw: 1.8 });
    for (let i = 0; i < 4; i++) {
      const xx = -12 + i * 7.5;
      const fp = K.S([[xx - 3.5, 0], [xx + 3.5, 0], [xx + 4, 12], [xx + 1, 16], [xx - 2.5, 15], [xx - 4, 10]], true);
      K.toon(ctx, fp, sk, { s: 2.5, lw: 1.3, hl: false });
    }
    const th = K.S([[-14, -8], [0, -14], [14, -10], [16, -5], [2, -5]], true);
    K.toon(ctx, th, sk, { s: 2.5, lw: 1.4 });
    ctx.restore();
  }

  // ------------------------------------------------------------------ cape (簑衣) panel
  function capePanel(ctx, outline, tiers, o) {
    o = o || {};
    const path = K.S(outline, true, 0.45);
    const box = o.box;
    K.part(ctx, path, {
      fill: MT.st.base, line: false,
      under: (c) => strawTex(c, box[0], box[2], box[1], box[3], { seed: o.seed || 3, fan: o.fan, cx: o.cx }),
    });
    K.clipDo(ctx, path, (c) => {
      tiers.forEach((t) => {
        const hem = fringe(t.pts, t.n, t.depth, t.seed || 5);
        const first = hem[0], last = hem[hem.length - 1];
        const sg = Math.sign(last[0] - first[0]) || 1;
        const poly = hem.concat([[last[0] + sg * 260, last[1], 1], [last[0] + sg * 260, -1500, 1], [first[0] - sg * 260, -1500, 1], [first[0] - sg * 260, first[1], 1]]);
        const tp = K.poly(poly);
        K.cast(c, path, tp, 2, 9, '#3a2a10', 0.75);
        K.part(c, tp, {
          fill: t.fill || MT.st.base, line: false,
          under: (cc) => {
            strawTex(cc, box[0], box[2], box[1] - 40, t.yb + 10, { seed: (t.seed || 5) + 4, fan: o.fan, cx: o.cx });
            // light band above the fringe (tier bulge)
            K.taper(cc, t.pts.map((q) => [q[0], q[1] - 18]), 16, '#e8d28e', { alpha: 0.3, w0: 0.1, w1: 0.1, blur: 4, noScale: true });
          },
        });
        K.line(c, hem, 1.5, '#4a3818', { k: 0, alpha: 0.9 });
      });
    });
    const d = o.sd || [-14, -5];
    K.part(ctx, path, {
      fill: 'rgba(0,0,0,0)', line: MT.st.line, lw: 2.2,
      fx: [
        { dx: d[0], dy: d[1], c: MT.st.sh, a: 0.75 },
        { dx: d[0] * 0.45, dy: d[1] * 0.45 - 4, c: MT.st.sh2, a: 0.35 },
        { dx: -2.4, dy: 0, c: RIM, a: 0.85 },
      ],
    });
    return path;
  }

  // ------------------------------------------------------------------ shared body bits
  function sandalFront(ctx, x, s) {
    const sk = MT.sk;
    const sole = K.S([[x - 22, -10], [x + 22, -10], [x + 24, -4], [x + 21, 0, 1], [x - 21, 0, 1], [x - 24, -4]], true, 0.7);
    K.toon(ctx, sole, MT.st, { s: 3, lw: 1.6, inner: (c) => { for (let i = -20; i < 22; i += 4) K.line(c, [[x + i, -10], [x + i + 2, 0]], 1, '#6f5a2f', { alpha: 0.7 }); } });
    // foot with knobbly toes
    const foot = K.S([[x - 13, -40], [x + 13, -40], [x + 18, -24], [x + 20, -12], [x - 20, -12], [x - 18, -24]], true);
    K.toon(ctx, foot, sk, { s: 6, lw: 1.8 });
    for (let i = 0; i < 5; i++) {
      const tx = x - 16 + i * 8 + s * 1, tw = i === (s > 0 ? 0 : 4) ? 5.5 : 4;
      K.toon(ctx, K.ell(tx, -13, tw, 4.2), sk, { s: 2, lw: 1.3, hl: false });
    }
    // straw straps
    K.taper(ctx, [[x - 18, -14], [x - 4, -26], [x + 12, -36]], 5, MT.st.line, { w0: 1, w1: 1, noScale: true });
    K.taper(ctx, [[x - 18, -14], [x - 4, -26], [x + 12, -36]], 3.4, '#cdb26e', { w0: 1, w1: 1, noScale: true });
    K.taper(ctx, [[x + 18, -14], [x + 4, -26], [x - 12, -36]], 5, MT.st.line, { w0: 1, w1: 1, noScale: true });
    K.taper(ctx, [[x + 18, -14], [x + 4, -26], [x - 12, -36]], 3.4, '#cdb26e', { w0: 1, w1: 1, noScale: true });
  }
  function trouserFront(ctx, s) {
    const tp = K.S([[s * 70, -240], [s * 66, -150], [s * 60, -70], [s * 58, -40], [s * 40, -34], [s * 20, -40], [s * 16, -80], [s * 8, -170], [s * 4, -240]], true);
    K.toon(ctx, tp, MT.tr, { s: s > 0 ? 12 : 8, lw: 2, inner: (c) => { K.taper(c, [[s * 40, -180], [s * 38, -110], [s * 34, -50]], 3, '#0a0908', { alpha: 0.7 }); K.taper(c, [[s * 22, -60], [s * 40, -44], [s * 56, -52]], 2.4, '#0a0908', { alpha: 0.7 }); } });
  }
  function basketTop(ctx, cx, rimY, rx, ry, o) {
    // contents + rim: herbs, ferns, lingzhi, coiled vine
    o = o || {};
    // back inner wall
    K.part(ctx, K.ell(cx, rimY, rx, ry), { fill: '#5c4220', line: MT.bk.line, lw: 1.8 });
    if (o.contents !== false) {
      fern(ctx, cx - rx * 0.55, rimY + 2, 74, -0.45, 3);
      fern(ctx, cx - rx * 0.25, rimY + 2, 60, -0.15, 6);
      fern(ctx, cx + rx * 0.6, rimY + 2, 64, 0.5, 8);
      // herb bundle tied with red string
      for (let i = 0; i < 7; i++) K.taper(ctx, [[cx + rx * 0.18 + i * 3, rimY + 4], [cx + rx * 0.22 + i * 4, rimY - 38 - (i % 3) * 6]], 3, i % 2 ? '#7a8a44' : '#94a258', { w0: 1, w1: 0.3, noScale: true });
      K.part(ctx, K.rrect(cx + rx * 0.17, rimY - 14, 26, 6, 2), { fill: '#b8292a', line: '#4a0c0c', lw: 1 });
      // lingzhi bracket
      const lz = K.S([[cx - rx * 0.95, rimY - 6], [cx - rx * 1.2, rimY - 18], [cx - rx * 1.32, rimY - 8], [cx - rx * 1.2, rimY + 4], [cx - rx * 0.95, rimY + 4]], true);
      K.part(ctx, lz, { fill: '#8a3a22', line: '#3a120a', lw: 1.4, fx: [{ dx: 0, dy: -3, c: '#c06a3a' }, { dx: -3, dy: 2, c: '#5a2010', a: 0.7 }] });
      K.line(ctx, [[cx - rx * 1.25, rimY - 10], [cx - rx * 1.05, rimY - 4]], 1, '#e8b080', { alpha: 0.8 });
    }
    // rim
    const rim = K.P((p) => { p.ellipse(cx, rimY, rx + 5, ry + 4, 0, 0, Math.PI); p.ellipse(cx, rimY + 2, rx - 2, ry - 2, 0, Math.PI, 0, true); p.closePath(); });
    K.toon(ctx, rim, MT.vi, { s: 4, lw: 1.6 });
  }

  // ------------------------------------------------------------------ FRONT VIEW
  function drawFront(ctx, o) {
    o = o || {};
    const SX = 132; // staff x
    // basket behind her (top visible above the shoulders)
    const basket = K.S([[-92, -548], [92, -548], [84, -420], [-84, -420]], true, 0.5);
    K.toon(ctx, basket, MT.bk, { s: 10, lw: 2, inner: (c) => weave(c, -100, 100, -560, -420) });
    basketTop(ctx, 0, -548, 92, 15);
    // legs below the cape
    for (const s of [-1, 1]) { trouserFront(ctx, s); sandalFront(ctx, s * 40, s); }
    // jacket body visible in the opening
    const jk = K.S([[-26, -492], [26, -492], [70, -440], [82, -300], [86, -226, 1], [0, -220], [-86, -226, 1], [-82, -300], [-70, -440]], true);
    K.toon(ctx, jk, MT.ja, {
      s: 12, lw: 2,
      inner: (c) => {
        // 大襟 with wide contrasting piping, knot buttons
        const flap = [[4, -494], [-10, -470], [-34, -452], [-70, -440]];
        K.taper(c, flap, 12, C.piping, { w0: 1, w1: 1, noScale: true });
        K.taper(c, flap.map((q) => [q[0], q[1] + 4]), 2, MT.pi.sh, { w0: 1, w1: 1, noScale: true, alpha: 0.7 });
        K.taper(c, [[-86, -228], [0, -222], [86, -228]], 11, C.piping, { w0: 1, w1: 1, noScale: true });
        K.taper(c, [[-30, -420], [-36, -330], [-40, -240]], 3, MT.ja.sh2, { alpha: 0.7 });
        K.taper(c, [[34, -400], [40, -320], [44, -240]], 3, MT.ja.sh2, { alpha: 0.6 });
      },
    });
    K.knot(ctx, -18, -466, 4.4, '#d9c08a', -0.6);
    K.knot(ctx, -48, -448, 4.4, '#d9c08a', -0.3);
    // waist cord, tobacco pouch, small gourd
    K.taper(ctx, [[-62, -352], [0, -346], [62, -352]], 4, '#5a3a1e', { w0: 1, w1: 1, noScale: true });
    K.line(ctx, [[20, -348], [24, -330]], 1.6, '#5a3a1e');
    const pouch = K.S([[12, -332], [36, -332], [40, -300], [32, -284], [16, -284], [8, -300]], true);
    K.toon(ctx, pouch, K.mat('#7a4e2c', { sh: '#4f301a', hl: '#a9774c', line: '#2a170a' }), { s: 6, lw: 1.8, inner: (c) => K.line(c, [[12, -322], [36, -322]], 1.4, '#2a170a', { dash: [3, 3] }) });
    K.part(ctx, K.circle(24, -336, 5), { fill: C.jade, line: MT.jd.line, lw: 1.2 });
    K.line(ctx, [[-26, -348], [-28, -334]], 1.6, '#b8292a');
    gourd(ctx, -28, -334, 44);
    // sleeves (pipe arm viewer-left, staff arm viewer-right)
    const slL = K.S([[-74, -470], [-40, -440], [-22, -414], [-30, -396], [-56, -410], [-84, -440]], true);
    K.toon(ctx, slL, MT.ja, { s: 8, lw: 2 });
    K.taper(ctx, [[-22, -414], [-32, -396]], 9, '#d6cdb6', { w0: 1, w1: 1, noScale: true });
    const slR = K.S([[70, -462], [104, -420], [124, -394], [112, -380], [88, -400], [62, -436]], true);
    K.toon(ctx, slR, MT.ja, { s: 8, lw: 2 });
    K.taper(ctx, [[124, -394], [110, -380]], 9, '#d6cdb6', { w0: 1, w1: 1, noScale: true });
    // cape panels
    for (const s of [-1, 1]) {
      const outer = [[s * 22, -496], [s * 52, -510], [s * 86, -506], [s * 116, -484], [s * 138, -440], [s * 156, -360], [s * 172, -270], [s * 184, -196]];
      const innerEdge = s < 0
        ? [[-80, -190], [-66, -270], [-50, -360], [-46, -400], [-58, -414], [-40, -446], [-24, -490]]
        : [[86, -190], [92, -270], [98, -340], [110, -372], [128, -398], [84, -432], [48, -466], [24, -490]];
      const hemPts = [[s * 184, -196], [s * 140, -186], [s * 110, -182], [innerEdge[0][0], -190]];
      const hem = fringe(hemPts, 9, 18, s < 0 ? 31 : 37);
      const outline = outer.concat(hem.slice(1)).concat(innerEdge.slice(1));
      capePanel(ctx, outline, [
        { pts: [[s * 10, -436], [s * 70, -430], [s * 130, -416], [s * 175, -398]], n: 9, depth: 16, yb: -420, seed: s < 0 ? 41 : 43 },
        { pts: [[s * 20, -334], [s * 80, -326], [s * 140, -312], [s * 195, -296]], n: 10, depth: 16, yb: -318, seed: s < 0 ? 45 : 47 },
      ], { box: s < 0 ? [-200, -520, -10, -170] : [10, -520, 200, -170], fan: s * 420, cx: 0, seed: s < 0 ? 5 : 7, sd: [-14, -5] });
    }
    // moss on the shoulders / top tier
    mossClump(ctx, -92, -488, 70, 22, 11, { fern: [-10, -6, 34, -0.5], shroom: [22, 4, 11] });
    mossClump(ctx, 96, -486, 62, 20, 13, { shroom: [-18, 4, 9] });
    mossClump(ctx, -150, -404, 34, 14, 17, {});
    mossClump(ctx, 146, -330, 30, 12, 19, { fern: [6, -2, 24, 0.4] });
    // basket straps over the cape
    for (const s of [-1, 1]) {
      K.taper(ctx, [[s * 56, -506], [s * 78, -474], [s * 92, -436]], 9, MT.st.line, { w0: 1, w1: 1, noScale: true });
      K.taper(ctx, [[s * 56, -506], [s * 78, -474], [s * 92, -436]], 6.5, '#c4a663', { w0: 1, w1: 1, noScale: true });
      for (let i = 0; i < 5; i++) { const t = i / 5; K.line(ctx, [[s * (56 + 34 * t) - 3, -506 + 66 * t], [s * (56 + 34 * t) + 3, -500 + 66 * t]], 1, MT.st.line, { alpha: 0.8 }); }
    }
    // straw-rope tie at the throat
    K.taper(ctx, [[-26, -494], [0, -488], [26, -494]], 7, MT.st.line, { w0: 1, w1: 1, noScale: true });
    K.taper(ctx, [[-26, -494], [0, -488], [26, -494]], 4.5, '#cdb26e', { w0: 1, w1: 1, noScale: true });
    K.part(ctx, K.circle(0, -487, 6), { fill: '#cdb26e', line: MT.st.line, lw: 1.4 });
    // neck (short, under the stooped head)
    const neck = K.S([[-20, -510], [20, -510], [24, -490], [-24, -490]], true);
    K.toon(ctx, neck, MT.sk, { s: 6, lw: 1.6 });
    K.clipDo(ctx, neck, (c) => { c.fillStyle = MT.sk.sh2; c.globalAlpha = 0.6; c.fillRect(-30, -512, 60, 14); });
    // head (stooped: sits low on the shoulders)
    headFront(ctx, { turn: o.turn || 0, expr: o.expr || 'wry', pipe: o.pipeMouth, y: -H });
    // hands, pipe, staff
    if (!o.pipeMouth) {
      pipe(ctx, [-104, -446], [58, -372], { bowl: 10 });
      gripPipe(ctx, -26, -408, 0.42);
      if (!o.noFx) smoke(ctx, [[58, -386], [74, -420], [62, -460], [84, -500], [70, -540], [92, -580], [116, -590], [124, -570], [108, -560]], 9);
    } else {
      gripPipe(ctx, -26, -408, 0.42);
    }
    if (!o.noStaff) {
      staff(ctx, SX, -716);
      gripV(ctx, SX, -374, false);
    }
  }

  // ------------------------------------------------------------------ SIDE VIEW (facing left, stooped)
  function drawSide(ctx, o) {
    o = o || {};
    const SX = -112;
    // staff (far hand), in front of her
    staff(ctx, SX, -716, { sq: 0.45 });
    // basket on the back (tilted with the hunch)
    ctx.save(); ctx.translate(98, -440); ctx.rotate(0.16);
    const bk = K.S([[-44, -120], [44, -120], [38, 6], [-36, 6]], true, 0.5);
    K.toon(ctx, bk, MT.bk, { s: 9, sd: [9, -4], lw: 2, inner: (c) => weave(c, -60, 60, -130, 10) });
    basketTop(ctx, 0, -120, 44, 10, { contents: true });
    ctx.restore();
    // legs: slightly bent knees
    const tr = K.S([[-40, -240], [-46, -150], [-44, -70], [-40, -40], [8, -36], [16, -70], [30, -150], [44, -240]], true);
    K.toon(ctx, tr, MT.tr, { s: 10, sd: [10, -4], lw: 2, inner: (c) => { K.taper(c, [[-10, -200], [-20, -130], [-22, -60]], 3, '#0a0908', { alpha: 0.7 }); } });
    // sandal + foot (profile)
    const sole = K.S([[-62, -9], [-50, -11], [22, -10], [24, 0, 1], [-60, 0, 1], [-66, -4]], true, 0.6);
    K.toon(ctx, sole, MT.st, { s: 3, lw: 1.6 });
    const foot = K.S([[-36, -42], [12, -42], [20, -26], [20, -10], [-64, -10], [-62, -18], [-46, -24]], true, 0.8);
    K.toon(ctx, foot, MT.sk, { s: 6, sd: [6, -3], lw: 1.8 });
    K.taper(ctx, [[-50, -14], [-30, -28], [-10, -40]], 5, MT.st.line, { w0: 1, w1: 1, noScale: true });
    K.taper(ctx, [[-50, -14], [-30, -28], [-10, -40]], 3.4, '#cdb26e', { w0: 1, w1: 1, noScale: true });
    K.taper(ctx, [[-14, -40], [4, -30], [18, -30]], 4.6, '#cdb26e', { w0: 1, w1: 1, noScale: true });
    // jacket hem peeking under the cape front
    const jk = K.S([[-58, -300], [-30, -300], [-30, -224], [-66, -226]], true);
    K.toon(ctx, jk, MT.ja, { s: 6, lw: 1.8, inner: (c) => K.taper(c, [[-70, -228], [-28, -224]], 10, C.piping, { w0: 1, w1: 1, noScale: true }) });
    // cape (side): hunched back curve, longer at the back
    const hemPts = [[-70, -196], [0, -186], [80, -184], [150, -190]];
    const hem = fringe(hemPts, 16, 18, 51);
    const outline = [[-30, -500], [-52, -470], [-62, -400], [-66, -300]].concat(hem).concat([[156, -260], [140, -340], [118, -420], [94, -486], [56, -520], [12, -520]]);
    capePanel(ctx, outline, [
      { pts: [[-80, -432], [0, -440], [70, -446], [140, -428]], n: 13, depth: 16, yb: -430, seed: 53 },
      { pts: [[-80, -330], [10, -326], [90, -320], [170, -306]], n: 14, depth: 16, yb: -320, seed: 57 },
    ], { box: [-80, -540, 170, -170], fan: 0, seed: 55, sd: [12, -5] });
    mossClump(ctx, 26, -514, 80, 22, 23, { fern: [24, -8, 36, 0.5], shroom: [-24, 6, 11] });
    mossClump(ctx, 120, -360, 30, 12, 27, {});
    // strap over shoulder
    K.taper(ctx, [[48, -520], [20, -490], [6, -440]], 9, MT.st.line, { w0: 1, w1: 1, noScale: true });
    K.taper(ctx, [[48, -520], [20, -490], [6, -440]], 6.5, '#c4a663', { w0: 1, w1: 1, noScale: true });
    // pipe arm (near side): sleeve from under cape, hand at chest, pipe pointing forward
    const sl = K.S([[-30, -460], [-66, -430], [-76, -404], [-60, -394], [-34, -414], [-14, -440]], true);
    K.toon(ctx, sl, MT.ja, { s: 7, sd: [7, -3], lw: 2 });
    K.taper(ctx, [[-76, -404], [-62, -394]], 9, '#d6cdb6', { w0: 1, w1: 1, noScale: true });
    pipe(ctx, [-150, -420], [-30, -384], { bowl: 10 });
    gripPipe(ctx, -86, -402, 0.28);
    smoke(ctx, [[-30, -398], [-42, -440], [-26, -480], [-46, -530], [-30, -580], [-6, -592], [2, -572]], 8);
    // neck + head (pushed forward)
    const neck = K.S([[-6, -520], [36, -526], [30, -486], [-26, -488]], true);
    K.toon(ctx, neck, MT.sk, { s: 6, sd: [6, -3], lw: 1.6 });
    K.taper(ctx, [[-30, -494], [0, -488], [30, -494]], 7, '#cdb26e', { w0: 1, w1: 1, noScale: true });
    headSide(ctx, { x: -16, y: -H + 6, tilt: -0.1 });
    // far hand on staff
    gripV(ctx, SX, -374, true);
  }

  // ------------------------------------------------------------------ BACK VIEW
  function drawBack(ctx, o) {
    o = o || {};
    const SX = -132;
    staff(ctx, SX, -716, { gourd: true });
    for (const s of [-1, 1]) {
      trouserFront(ctx, s);
      const x = s * 40;
      const sole = K.S([[x - 22, -10], [x + 22, -10], [x + 22, 0, 1], [x - 22, 0, 1]], true, 0.6);
      K.toon(ctx, sole, MT.st, { s: 3, lw: 1.6 });
      const heel = K.S([[x - 14, -40], [x + 14, -40], [x + 17, -10], [x - 17, -10]], true);
      K.toon(ctx, heel, MT.sk, { s: 5, lw: 1.8 });
      K.taper(ctx, [[x - 16, -18], [x, -28], [x + 16, -18]], 4.6, '#cdb26e', { w0: 1, w1: 1, noScale: true });
    }
    // smoke rising past the shoulder (pipe on the far side)
    smoke(ctx, [[120, -420], [134, -470], [118, -520], [138, -566], [122, -600], [104, -596]], 8);
    // head (back): bun, hair, band knot, earrings
    const sk = MT.sk, ha = MT.ha;
    for (const s of [-1, 1]) {
      const ear = K.S([[s * 40, -548], [s * 50, -552], [s * 54, -538], [s * 52, -518], [s * 50, -502], [s * 44, -500], [s * 41, -515]], true);
      K.toon(ctx, ear, sk, { s: 4, lw: 1.8 });
      K.part(ctx, K.S([[s * 47, -499], [s * 47 + 4.5, -493], [s * 47 + 3.5, -487], [s * 47, -485, 1], [s * 47 - 3.5, -487], [s * 47 - 4.5, -493]], true), { fill: C.jade, line: MT.jd.line, lw: 1.1 });
    }
    const hb = K.S(K.sym([[0, -604], [24, -600], [40, -582], [46, -556], [44, -526], [34, -506], [18, -496], [0, -494]]), true);
    K.toon(ctx, hb, ha, { s: 8, lw: 2, inner: (c) => { for (let i = -4; i <= 4; i++) K.line(c, [[i * 10, -500], [i * 8, -540], [i * 2, -600]], 1.1, ha.sh2, { alpha: 0.7 }); } });
    K.toon(ctx, K.ell(0, -612, 30, 19), ha, { s: 7, lw: 2, inner: (c) => { for (let i = 0; i < 5; i++) K.line(c, [[-26 + i * 4, -606], [-6 + i * 5, -628], [22, -616 + i * 3]], 1, ha.sh2, { alpha: 0.7 }); } });
    K.taper(ctx, [[38, -624], [-40, -604]], 4, '#8a6238', { w0: 0.6, w1: 1, noScale: true });
    violetBloom(ctx, -26, -628, 5, 2);
    const band = K.S([[-46, -570], [0, -566], [46, -570], [46, -556], [0, -552], [-46, -556]], true);
    K.toon(ctx, band, MT.band, { s: 4, lw: 1.6 });
    K.part(ctx, K.ell(0, -560, 7, 6), { fill: '#1d1a1c', line: '#000', lw: 1.2 });
    K.taper(ctx, [[-2, -556], [-8, -532], [-6, -510]], 7, '#1d1a1c', { w0: 1, w1: 0.6 });
    K.taper(ctx, [[2, -556], [10, -534], [12, -514]], 7, '#1d1a1c', { w0: 1, w1: 0.6 });
    // cape (back)
    const outer = [[-60, -500], [-96, -496], [-122, -476], [-142, -430], [-160, -350], [-176, -266], [-188, -200]];
    const outerR = [[188, -200], [176, -266], [160, -350], [142, -430], [122, -476], [96, -496], [60, -500]];
    const hemPts = [[-188, -200], [-100, -184], [0, -180], [100, -184], [188, -200]];
    const hem = fringe(hemPts, 20, 18, 61);
    const outline = outer.concat(hem.slice(1)).concat(outerR.slice(1)).concat([[30, -506], [0, -500], [-30, -506]]);
    capePanel(ctx, outline, [
      { pts: [[-200, -400], [-100, -424], [0, -430], [100, -424], [200, -400]], n: 16, depth: 16, yb: -420, seed: 63 },
      { pts: [[-210, -300], [-100, -322], [0, -328], [100, -322], [210, -300]], n: 18, depth: 16, yb: -318, seed: 67 },
    ], { box: [-205, -520, 205, -170], fan: 420, cx: 0, seed: 69 });
    mossClump(ctx, -110, -470, 56, 18, 71, { fern: [-6, -4, 30, -0.6] });
    mossClump(ctx, 122, -440, 40, 14, 73, { shroom: [6, 2, 9] });
    // basket on the back
    const basket = K.S([[-90, -548], [90, -548], [76, -356], [-76, -356]], true, 0.5);
    K.cast(ctx, K.P((p) => p.rect(-300, -600, 600, 500)), basket, 6, 10, '#3a2a10', 0.35);
    K.toon(ctx, basket, MT.bk, {
      s: 10, lw: 2,
      inner: (c) => {
        weave(c, -100, 100, -552, -350);
        // wooden ribs
        for (const x of [-60, 0, 60]) K.taper(c, [[x * 1.05, -548], [x * 0.85, -356]], 6, MT.vi.base, { w0: 1, w1: 1, noScale: true });
      },
    });
    K.taper(ctx, [[-80, -362], [0, -358], [80, -362]], 8, MT.vi.base, { w0: 1, w1: 1, noScale: true });
    basketTop(ctx, 0, -548, 90, 15, { contents: true });
    // head peeks over the rim: redraw the top of the head + bun above the basket contents
    K.clipDo(ctx, K.P((p) => p.rect(-60, -700, 120, 146)), (c) => {
      K.toon(c, hb, ha, { s: 8, lw: 2 });
      K.toon(c, K.ell(0, -612, 30, 19), ha, { s: 7, lw: 2, inner: (cc) => { for (let i = 0; i < 5; i++) K.line(cc, [[-26 + i * 4, -606], [-6 + i * 5, -628], [22, -616 + i * 3]], 1, ha.sh2, { alpha: 0.7 }); } });
      K.taper(c, [[38, -624], [-40, -604]], 4, '#8a6238', { w0: 0.6, w1: 1, noScale: true });
      K.toon(c, band, MT.band, { s: 4, lw: 1.6 });
      K.part(c, K.ell(0, -560, 7, 6), { fill: '#1d1a1c', line: '#000', lw: 1.2 });
    });
    violetBloom(ctx, -26, -628, 5, 2);
    // straps visible at the shoulders
    for (const s of [-1, 1]) {
      K.taper(ctx, [[s * 70, -540], [s * 64, -508], [s * 56, -496]], 9, MT.st.line, { w0: 1, w1: 1, noScale: true });
      K.taper(ctx, [[s * 70, -540], [s * 64, -508], [s * 56, -496]], 6.5, '#c4a663', { w0: 1, w1: 1, noScale: true });
    }
    gripV(ctx, SX, -374, true);
  }

  // ------------------------------------------------------------------ prop drawings
  function propPipe(c) { pipe(c, [-80, 6], [70, -8], { bowl: 11 }); smoke(c, [[70, -20], [80, -40], [70, -56]], 6); }
  function propStaffHead(c) { staff(c, 0, -40, {}); }

  // ------------------------------------------------------------------ sheet spec
  const theme = {
    bg: '#14171a', paper0: '#eef0e6', paper1: '#d6dccb', guide: '#4a5a4a', ink: '#24302a',
    gold: '#d9b45c', mark: '#6b44b8', markLine: '#24302a', title: '#eef0e4', sub: '#aab3a2',
    bust0: '#3d4c3e', bust1: '#151b17', expr: '#26302a', silBg: '#e6e8dc', silText: '#3a4a30', propBg: '#eef0e6',
  };
  const GROUND = 1112;
  const SPEC = {
    W: 2400, H: 1660, theme, figScale: 1.08,
    title: '藤婆', titleEn: 'TENG PO  —  hermit of the cloud forest',
    role: '玉山雲霧林的隱居藥婆 · 夢藤「入夢禮」守禮人 · 年紀不詳（自稱活過三個朝代）',
    concept: '「一座會走路的長苔小山」—— 駝背的老藥婆披著長滿青苔的簑衣、背著藥簍、拄著自己會開花的夢藤杖，嘴裡叼著旱煙管。圓、軟、低的外形讓人安心，紫色夢藤花是她身上唯一「不屬於人間」的顏色。',
    conceptEn: 'A walking, moss-grown hillock: a stooped herb-granny in a moss-covered straw rain cape, herb basket on her back, leaning on a dream-vine staff that blooms by itself, long pipe in hand. Round, soft, low shapes read as safe and wise; the violet dream-vine is the one colour that is not of this world.',
    badge: 'FINAL DESIGN · v2 · 3D TOON TURNAROUND · 5.5 HEADS (STOOPED)',
    stage: [30, 168, 1630, 1012],
    heads: { u: U, n: 6, ground: GROUND, label: '頭身 HEADS', extra: [{ y: GROUND - 760 * 1.08, label: 'staff top ≈ 7 H' }] },
    views: [
      {
        label: '正面', labelEn: 'FRONT', at: [500, GROUND], box: [-215, -800, 225, 30], draw: (c) => drawFront(c), shadowR: 200,
        marks: [
          { n: 1, x: -150, y: -300, dx: -110, dy: 0 },
          { n: 2, x: -30, y: -578, dx: -170, dy: -30 },
          { n: 3, x: -10, y: -640, dx: -160, dy: -50 },
          { n: 4, x: -40, y: -445, dx: -160, dy: 22 },
          { n: 5, x: -90, y: -440, dx: -120, dy: 70 },
          { n: 9, x: -26, y: -320, dx: -180, dy: 60 },
          { n: 8, x: -40, y: -20, dx: -150, dy: 0 },
          { n: 6, x: 150, y: -720, dx: 60, dy: 0 },
          { n: 7, x: 70, y: -560, dx: 150, dy: -60 },
        ],
      },
      {
        label: '側面', labelEn: 'SIDE (right profile)', at: [1000, GROUND], box: [-200, -800, 200, 30], draw: (c) => drawSide(c), shadowR: 180,
        marks: [
          { n: 7, x: 120, y: -560, dx: 90, dy: -20 },
          { n: 1, x: 140, y: -280, dx: 90, dy: 0 },
        ],
      },
      {
        label: '背面', labelEn: 'BACK', at: [1430, GROUND], box: [-215, -800, 215, 30], draw: (c) => drawBack(c), shadowR: 200,
        marks: [
          { n: 7, x: 70, y: -450, dx: 170, dy: 0 },
          { n: 2, x: 30, y: -560, dx: 150, dy: -60 },
        ],
      },
    ],
    panel: [1690, 168, 680],
    bottom: [44, 1214, 1616],
    bust: {
      label: '胸像 · 似笑非笑', labelEn: 'BUST — default expression: wry, pipe in mouth', h: 460,
      draw: (c) => drawFront(c, { turn: 0.3, expr: 'wry', pipeMouth: true, noStaff: true }), box: [-170, -690, 230, -360], scale: 1.6, offX: 20, offY: -40,
    },
    exprH: 172,
    exprs: [
      { label: '大笑 cackling', draw: (c) => drawFront(c, { turn: 0.18, expr: 'cackle', noStaff: true, noFx: true }), box: [-82, -660, 82, -480], scale: 1.33, offX: 0, offY: -14 },
      { label: '瞪眼 stern', draw: (c) => drawFront(c, { turn: -0.15, expr: 'stern', noStaff: true, noFx: true }), box: [-82, -660, 82, -480], scale: 1.33, offX: 0, offY: -14 },
      { label: '入夢 rite trance', draw: (c) => drawFront(c, { turn: 0.0, expr: 'trance', noStaff: true, noFx: true }), box: [-82, -660, 82, -480], scale: 1.33, offX: 0, offY: -14 },
    ],
    props: {
      y: 1490, h: 146,
      items: [
        { label: '夢藤杖頭 staff head', draw: (c) => staff(c, 0, -40, {}), box: [-70, -120, 70, 40], scale: 0.7 },
        { label: '旱煙管 long pipe', draw: propPipe, box: [-90, -66, 90, 24], scale: 1.0 },
        { label: '藥簍 herb basket', draw: (c) => { const b = K.S([[-60, -40], [60, -40], [52, 60], [-52, 60]], true, 0.5); K.toon(c, b, MT.bk, { s: 8, lw: 2, inner: (cc) => weave(cc, -70, 70, -46, 64) }); basketTop(c, 0, -40, 60, 10); }, box: [-90, -120, 90, 66], scale: 0.62 },
        { label: '苔・蕨・菇 moss kit', draw: (c) => mossClump(c, 0, 0, 90, 26, 5, { fern: [-20, -6, 40, -0.4], shroom: [26, 6, 14] }), box: [-60, -50, 60, 24], scale: 1.0 },
        { label: '抹額・玉璧 brow band', draw: (c) => { K.toon(c, K.S([[-60, -10], [0, -16], [60, -10], [60, 10], [0, 4], [-60, 10]], true), MT.band, { s: 4 }); K.part(c, K.circle(0, -4, 14), { fill: C.jade, line: MT.jd.line, lw: 1.4, fx: [{ dx: -3, dy: -2, c: MT.jd.sh }] }); K.part(c, K.circle(0, -4, 5), { fill: '#1d1a1c', line: MT.jd.line, lw: 1 }); }, box: [-66, -24, 66, 18], scale: 1.4 },
        { label: '菸袋・葫蘆 pouch & gourd', draw: (c) => { gourd(c, -26, -30, 52); const p = K.S([[14, -30], [42, -30], [46, 6], [36, 22], [20, 22], [10, 6]], true); K.toon(c, p, K.mat('#7a4e2c', { sh: '#4f301a', hl: '#a9774c', line: '#2a170a' }), { s: 6 }); K.part(c, K.circle(28, -34, 6), { fill: C.jade, line: MT.jd.line, lw: 1.2 }); }, box: [-60, -46, 60, 30], scale: 1.0 },
      ],
    },
    palette: [
      { c: C.straw, zh: '舊簑黃', en: 'Old straw', role: 'PRIMARY' },
      { c: C.moss, zh: '苔綠', en: 'Moss', role: 'SECONDARY' },
      { c: C.indigo, zh: '褪靛', en: 'Faded indigo', role: 'SECONDARY' },
      { c: C.hair, zh: '霜白', en: 'Frost hair', role: 'LIGHT' },
      { c: C.skin, zh: '日曬膚', en: 'Sun-browned', role: 'SKIN' },
      { c: C.violet, zh: '夢藤紫', en: 'Dream-vine', role: 'ACCENT' },
      { c: C.ember, zh: '煙火橘', en: 'Pipe ember', role: 'FX' },
    ],
    callouts: [
      { zh: '苔生簑衣（三層草簑，前開）', en: 'Straw rain cape in 3 tiers, open front, grown over with moss, ferns and tiny mushrooms' },
      { zh: '黑抹額・玉璧', en: 'Black brow band with a jade disc (old Han women\'s 抹額)' },
      { zh: '霜白髮髻・木簪・夢藤花', en: 'White bun, wooden hairpin, a sprig of glowing dream-vine' },
      { zh: '大裪衫・寬滾邊・盤扣', en: 'Faded indigo side-fastened jacket, wide rust piping, knot buttons' },
      { zh: '旱煙管（玉嘴銅鍋）', en: 'Long dry-tobacco pipe: jade mouthpiece, brass bowl, ember' },
      { zh: '夢藤杖', en: 'Twisted dream-vine staff; spiral head with leaves, violet blooms, gourd' },
      { zh: '藥簍', en: 'Bamboo herb basket: ferns, herb bundle, lingzhi bracket' },
      { zh: '寬褲・草鞋', en: 'Black wide trousers, straw sandals, knobbly bare toes' },
      { zh: '菸袋・小葫蘆', en: 'Tobacco pouch with jade toggle; small medicine gourd' },
    ],
    cols: [
      {
        h: '設計理念', hEn: 'DESIGN RATIONALE · SHAPE & VALUE',
        body: [
          { t: '剪影＝一座長苔小山：圓頂鐘形的簑衣、駝背、藥簍與藤杖螺旋頭構成「低、寬、圓」的三角形，和墨鴉的尖銳倒三角正好相反——圓代表溫和、可信、古老。' },
          { t: 'Silhouette = a mossy hillock: bell-shaped cape, hunched back, basket and the spiral staff head form a low, wide, round mass — the opposite of Mo Ya\'s sharp inverted triangle. Round = warm, trustworthy, ancient.', en: true },
          { t: '明度：中暖（簑、苔）大面積／暗（靛衫、褲）／亮（白髮、臉）；唯一重點色是夢藤紫，煙鍋橘只作光點。' },
          { t: 'Values: large mid-warm straw & moss / dark indigo & trousers / light hair & face. One accent: dream-vine violet; ember orange is a tiny light only.', en: true },
        ],
      },
      {
        h: '文化依據', hEn: 'CULTURAL BASIS · NO INDIGENOUS DRESS',
        body: [
          { t: '依據：清代臺灣漢人老婦的大裪衫（寬滾邊、盤扣）、黑抹額、寬褲與草鞋；農家的草簑衣；採藥人的藥簍、旱煙管；道家長壽意象（大耳垂、葫蘆、靈芝）。' },
          { t: 'Based on Qing-era Han Taiwanese elderly women\'s dress (大裪衫 with wide piping, 抹額 brow band, wide trousers, straw sandals), the farmer\'s straw 簑衣, the herb-gatherer\'s basket and long pipe, Taoist longevity cues (long earlobes, gourd, lingzhi).', en: true },
          { t: '刻意避免任何原住民族的服飾、紋樣、珠飾與頭飾；夢藤、苔衣與發光花皆為虛構，只屬於她一人。' },
          { t: 'Deliberately no Indigenous garments, patterns, beadwork or headwear. The dream-vine, moss growth and glowing blooms are fictional and belong to her alone.', en: true },
        ],
      },
      {
        h: '3D 建模／著色', hEn: '3D MODELLING & TOON-SHADER NOTES',
        body: [
          { t: '主體量塊：簑衣 = 三層殼狀網格＋邊緣草穗卡片；青苔用幾塊圓潤的凸起網格＋貼圖；藥簍為簡單錐台、編織紋畫在貼圖；藤杖頭為掃掠曲線＋葉片卡。' },
          { t: 'Cape = 3 shell meshes + fringe cards; moss = a few rounded bump meshes with painted texture; basket = tapered cylinder with painted weave; staff head = swept spline + leaf cards. Strands, piping, wrinkles are texture.', en: true },
          { t: '著色：二階 toon＋暖黃邊光；夢藤花與煙鍋為自發光；煙用帶 alpha 的扭曲面片。' },
          { t: 'Shader: 2-step toon ramp + warm rim; blooms & ember emissive with bloom; smoke = alpha-blended ribbon. Bones: spine ×4 (hunch), cape tiers, staff gourd, earrings, smoke.', en: true },
        ],
      },
    ],
    silRef: 830,
    footer: '《彼岸燈》Shorelight · character design pass v2 · 藤婆 Teng Po · procedural canvas render (tools/design2/tengpo.js)',
  };
  G.TENGPO = { SPEC, drawFront, drawSide, drawBack, headFront, U, H };
})(window);
