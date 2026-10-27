// 彼岸燈 Shorelight — 墨鴉 Mo Ya, final design (v2 turnaround)
// Figure coordinates: ground at y = 0, body centre x = 0, up is negative. Body height 760 = 7 heads.
(function (G) {
  'use strict';
  const K = G.K;
  const H = 760, U = H / 7;

  // ------------------------------------------------------------------ palette & materials
  const C = {
    feather: '#1d1c27', sheen: '#55609a', rim: '#a8bdf0',
    jacket: '#5a627c', red: '#c8372b', trousers: '#2b2b35', wrap: '#ddd3bd',
    skin: '#ecc8a4', brass: '#c99a3e', paper: '#efe4c9', glow: '#8cf3ff', tal: '#e9c24a', hair: '#16141b',
  };
  const MT = {
    fe: K.mat(C.feather, { sh: '#0c0b12', sh2: '#060509', hl: '#3d4264', rim: C.rim, line: '#030205' }),
    ja: K.mat(C.jacket, { sh: '#3b4058', sh2: '#2a2e42', hl: '#8088a6', rim: '#cbd8f8', line: '#191c29' }),
    red: K.mat(C.red, { sh: '#8a2120', sh2: '#5e1416', hl: '#ec6a50', rim: '#ffc2a0', line: '#3d0a0d' }),
    tr: K.mat(C.trousers, { sh: '#17171e', sh2: '#0e0e13', hl: '#4a4b5c', rim: '#95a1cc', line: '#07070b' }),
    wr: K.mat(C.wrap, { sh: '#ab9f8a', sh2: '#877b68', hl: '#f8f1e2', line: '#584c3c' }),
    sk: K.mat(C.skin, { sh: '#d39579', sh2: '#b0705c', hl: '#fbe5cc', rim: '#fff0da', line: '#6a3426' }),
    br: K.mat(C.brass, { sh: '#83591f', sh2: '#5a3c12', hl: '#f8df9a', line: '#432d0c' }),
    shoe: K.mat('#22212a', { sh: '#101015', hl: '#4b4c60', rim: '#95a1cc', line: '#050507' }),
    sole: K.mat('#ede6d6', { sh: '#bcb19c', hl: '#ffffff', line: '#544a3a' }),
    bam: K.mat('#3d3529', { sh: '#231e16', hl: '#76674c', rim: '#c4ad82', line: '#110d08' }),
    hair: K.mat(C.hair, { sh: '#08070b', hl: '#3d3b52', rim: '#8898cc', line: '#020203' }),
    paper: K.mat(C.paper, { sh: '#cdb995', hl: '#fffbf2', line: '#6a5634' }),
    tal: K.mat(C.tal, { sh: '#b98f27', hl: '#fde9a6', line: '#6a4e10' }),
    lac: K.mat('#1a1418', { sh: '#0b0809', hl: '#4a3a40', rim: '#d0a060', line: '#000000' }),
  };

  // ------------------------------------------------------------------ feathers
  function feather(ctx, x, y, w, l, ang, o) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const p = K.S([[0, -3], [w * 0.52, l * 0.22], [w * 0.44, l * 0.66], [0, l, 1], [-w * 0.44, l * 0.66], [-w * 0.52, l * 0.22]]);
    ctx.fillStyle = o.base; ctx.fill(p);
    K.crescent(ctx, p, { dx: w * 0.42, dy: l * 0.1, c: o.sheen, a: o.sheenA == null ? 0.22 : o.sheenA });
    ctx.strokeStyle = o.edge; ctx.lineWidth = 1.2 * K.lineScale; ctx.stroke(p);
    K.line(ctx, [[0, 2], [w * 0.05, l * 0.5], [0, l * 0.86]], 0.9, o.rachis, { alpha: 0.45 });
    ctx.restore();
  }
  // rows of overlapping feathers (lower rows first so upper rows overlap them)
  function featherTex(ctx, x0, x1, y0, y1, o) {
    const rnd = K.rng(o.seed || 3), rowH = o.rowH || 30, fw = o.fw || 21, fl = o.fl || rowH * 1.75;
    const rows = [];
    for (let y = y0; y < y1 + rowH; y += rowH) rows.push(y);
    for (let r = rows.length - 1; r >= 0; r--) {
      const off = (r % 2) * fw * 0.5;
      for (let x = x0 - fw + off; x < x1 + fw; x += fw * 0.94) {
        const ang = (o.fan ? (x - (o.cx || 0)) / o.fan : 0) + (rnd() - 0.5) * 0.1 + (o.ang || 0);
        const v = rnd();
        feather(ctx, x + (rnd() - 0.5) * 3, rows[r] + (rnd() - 0.5) * 4, fw * 1.08, fl * (0.88 + rnd() * 0.24), ang, {
          base: v < 0.33 ? '#201f2b' : v < 0.66 ? '#1b1a25' : '#171621', sheen: '#5a64a0', edge: '#0b0a11', rachis: '#454a6c', sheenA: 0.16,
        });
      }
    }
  }
  // jagged feather-tip hem along a polyline; tips point along +y (rotated by `lean`)
  function jag(pts, n, depth, o) {
    o = o || {};
    const s = K.sample(pts, false, 1, 24);
    const cum = [0];
    for (let i = 1; i < s.length; i++) cum.push(cum[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]));
    const L = cum[cum.length - 1];
    const at = (d) => {
      let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
      const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      return [K.lerp(s[i - 1][0], s[i][0], t), K.lerp(s[i - 1][1], s[i][1], t)];
    };
    const rnd = K.rng(o.seed || 11);
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = at((L * i) / n); out.push([a[0], a[1], 1]);
      if (i < n) {
        const b = at((L * (i + 0.5)) / n);
        const dd = depth * (0.85 + rnd() * 0.3) * (o.prof ? o.prof(i / n) : 1);
        const lean = (o.lean || 0) + (o.fan ? (b[0] - (o.cx || 0)) / o.fan : 0);
        out.push([b[0] + Math.sin(lean) * dd, b[1] + Math.cos(lean) * dd, 1]);
      }
    }
    return out;
  }
  // soft anisotropic sheen band running parallel to a tier hem
  function sheen(ctx, pts, dy, w) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    K.taper(ctx, pts.map((q) => [q[0], q[1] - dy]), w * 1.3, '#5866a8', { alpha: 0.28, w0: 0.1, w1: 0.1, a: 0.4, b: 0.4, noScale: true, blur: 5 });
    K.taper(ctx, pts.map((q) => [q[0], q[1] - dy - 3]), w * 0.3, '#9aa8e0', { alpha: 0.22, w0: 0.1, w1: 0.1, a: 0.45, b: 0.45, noScale: true, blur: 1.5 });
    ctx.restore();
  }
  // a feather panel: outline (closed pts), tiers [{pts (boundary polyline), n, depth}], hemPts for the bottom sheen
  function featherPanel(ctx, outline, tiers, o) {
    o = o || {};
    const path = K.S(outline, true, 0.5);
    const box = o.box;
    K.part(ctx, path, {
      fill: MT.fe.base, line: false,
      under: (c) => {
        featherTex(c, box[0], box[2], box[1], box[3], { seed: o.seed || 5, fan: o.fan, cx: o.cx });
        if (o.hemPts) sheen(c, o.hemPts, 26, 18);
      },
    });
    K.clipDo(ctx, path, (c) => {
      tiers.forEach((t, ti) => {
        const hem = jag(t.pts, t.n, t.depth, { seed: t.seed || 4, fan: o.fan ? o.fan * 1.4 : 0, cx: o.cx, lean: t.lean });
        const first = hem[0], last = hem[hem.length - 1];
        const sg = Math.sign(last[0] - first[0]) || 1;
        const poly = hem.concat([[last[0] + sg * 260, last[1], 1], [last[0] + sg * 260, -1500, 1], [first[0] - sg * 260, -1500, 1], [first[0] - sg * 260, first[1], 1]]);
        const tp = K.poly(poly);
        K.cast(c, path, tp, 2, 10, '#040307', 0.9);
        K.part(c, tp, {
          fill: MT.fe.base, line: false,
          under: (cc) => {
            featherTex(cc, box[0], box[2], box[1] - 30, (t.yb || -500) + 20, { seed: (t.seed || 4) + 9, fan: o.fan, cx: o.cx });
            sheen(cc, t.pts, 22, 16);
          },
        });
        K.line(c, hem.map((q) => [q[0] - 1, q[1] - 2.5]), 1.3, '#4d5890', { k: 0, alpha: 0.8 });
        K.line(c, hem, 1.8, '#030205', { k: 0 });
      });
    });
    // panel-level toon shading over everything
    const d = o.sd || [-14, -5];
    K.part(ctx, path, {
      fill: 'rgba(0,0,0,0)', line: MT.fe.line, lw: 2.2,
      fx: [
        { dx: d[0], dy: d[1], c: '#000000', a: 0.5 },
        { dx: -(o.rimW || 2.4), dy: 0, c: C.rim, a: 0.9 },
      ],
    });
    return path;
  }

  // ------------------------------------------------------------------ head (front / 3-4)
  // expr: smug | angry | panic | scheme
  function crestFeathers(ctx, base, dirs) {
    // two long crow tail feathers stuck in the cap knot
    for (const d of dirs) {
      ctx.save(); ctx.translate(base[0], base[1]); ctx.rotate(d.a);
      const L = d.l, W = d.w;
      const p = K.S([[0, 0, 1], [W * 0.55, -L * 0.18], [W * 0.62, -L * 0.6], [W * 0.3, -L * 0.92], [0, -L, 1], [-W * 0.38, -L * 0.88], [-W * 0.5, -L * 0.55], [-W * 0.4, -L * 0.15]], true);
      K.part(ctx, p, {
        fill: '#1c1b26', line: '#030205', lw: 1.8,
        fx: [{ dx: -W * 0.35, dy: 0, c: '#0a0910' }, { dx: W * 0.3, dy: 4, c: '#5a66a6', a: 0.55 }, { dx: -2, dy: 0, c: C.rim, a: 0.85 }],
      });
      K.line(ctx, [[0, -2], [W * 0.05, -L * 0.5], [-W * 0.02, -L * 0.94]], 1.2, '#6a74a8', { alpha: 0.7 });
      for (let i = 1; i < 6; i++) K.line(ctx, [[W * 0.04, -L * (0.12 + i * 0.14)], [W * 0.45, -L * (0.06 + i * 0.14)]], 0.9, '#0a0910', { alpha: 0.8 });
      ctx.restore();
    }
  }
  function headFront(ctx, o) {
    o = o || {};
    const u = U, th = o.turn || 0, R = 0.38, ct = Math.cos(th), st = Math.sin(th);
    const X0 = o.x || 0, Y0 = o.y == null ? -H : o.y;
    const m = (lx, ly, d) => {
      d = d || 0;
      const z = Math.sqrt(Math.max(0, R * R - lx * lx)) + d;
      return [X0 + (lx * ct + z * st - R * st * 0.85) * u, Y0 + ly * u];
    };
    const M = (pts, d) => pts.map((q) => { const r = m(q[0], q[1], q[3] != null ? q[3] : d || 0); if (q[2]) r.push(1); return r; });
    const E = o.expr || 'smug';
    const sk = MT.sk;

    // --- crest feathers (behind the cap)
    crestFeathers(ctx, m(-0.06, -0.02, -0.25), [{ a: -0.72 + th * 0.4, l: 0.78 * u, w: 0.16 * u }, { a: -0.38 + th * 0.4, l: 0.64 * u, w: 0.15 * u }]);
    // --- queue hair at the back of the head (visible below the cap, behind the ears)
    const hb = K.S(M([[0, 0.28], [0.33, 0.3], [0.4, 0.45], [0.42, 0.63], [0.37, 0.8], [0.22, 0.9], [-0.22, 0.9], [-0.37, 0.8], [-0.42, 0.63], [-0.4, 0.45], [-0.33, 0.22]], -0.36), true);
    K.toon(ctx, hb, MT.hair, { s: 5, hl: false });

    // --- skull (back of head = hair below the cap), ears, then the face
    const half = [[0, 0], [0.18, 0.012], [0.305, 0.07], [0.365, 0.2], [0.382, 0.36], [0.378, 0.5], [0.36, 0.585], [0.318, 0.68], [0.268, 0.775], [0.195, 0.868], [0.11, 0.95], [0.045, 0.992], [0, 1.0]];
    const full = K.sym(half).map((q) => [q[0], q[1], q[2], q[1] > 0.82 ? 0.03 : 0]);
    const faceP = K.S(M(full), true);
    const skullP = K.S(M(K.sym([[0, 0], [0.2, 0.012], [0.33, 0.08], [0.39, 0.25], [0.395, 0.45], [0.36, 0.66], [0.25, 0.82], [0, 0.86]]), -0.3), true);
    K.toon(ctx, skullP, MT.hair, { s: 6, hl: false });
    for (const s of [-1, 1]) {
      const ear = K.S(M([[s * 0.355, 0.47], [s * 0.425, 0.43], [s * 0.475, 0.48], [s * 0.47, 0.59], [s * 0.44, 0.69], [s * 0.4, 0.745], [s * 0.36, 0.73]], -0.12), true);
      K.toon(ctx, ear, sk, { s: 4, lw: 1.8 });
      K.line(ctx, M([[s * 0.43, 0.5], [s * 0.445, 0.58], [s * 0.42, 0.66], [s * 0.39, 0.68]], -0.12), 1.6, sk.sh2);
      K.line(ctx, M([[s * 0.395, 0.54], [s * 0.41, 0.61]], -0.12), 1.3, sk.sh2);
    }
    K.toon(ctx, faceP, sk, { s: 9, sd: [-9, -3], deepA: 0.35, hl: false, rim: sk.rim, lw: 2 });
    const head = faceP;
    K.clipDo(ctx, head, (c) => {
      // gaunt cheek hollows under sharp cheekbones
      for (const s of [-1, 1]) {
        K.taper(c, M([[s * 0.35, 0.585], [s * 0.3, 0.665], [s * 0.24, 0.76]]), 0.065 * u, sk.sh, { alpha: s > 0 ? 0.8 : 0.55, w0: 0.3, w1: 0.2 });
        K.taper(c, M([[s * 0.2, 0.56], [s * 0.3, 0.57]]), 0.02 * u, sk.hl, { alpha: s < 0 ? 0.7 : 0.3 });
      }
      if (E === 'angry') K.taper(c, M([[-0.035, 0.42], [-0.02, 0.46]]), 0.012 * u, sk.sh2, {});
      if (E === 'angry') K.taper(c, M([[0.035, 0.42], [0.02, 0.46]]), 0.012 * u, sk.sh2, {});
      if (E === 'panic' || E === 'scheme') for (const yy of [0.32, 0.355]) K.taper(c, M([[-0.13, yy + 0.01], [0, yy - 0.006], [0.13, yy + 0.01]]), 0.01 * u, sk.sh2, { alpha: 0.7 });
    });

    // --- eyes
    const P = {
      smug: { ey: 0.525, sp: 0.158, w: 0.15, h: 0.06, tilt: 0.03, uin: 0.5, uout: 0.6, lo: 0.55, ir: 0.036, iy: 0.01, lid: 0.42, gaze: 0.014 },
      angry: { ey: 0.525, sp: 0.158, w: 0.15, h: 0.066, tilt: 0.034, uin: 0.4, uout: 0.75, lo: 0.6, ir: 0.026, iy: 0.004, lid: 0.22, gaze: 0 },
      panic: { ey: 0.525, sp: 0.16, w: 0.135, h: 0.11, tilt: 0.0, uin: 0.8, uout: 0.85, lo: 0.75, ir: 0.016, iy: 0.0, lid: 0, gaze: 0 },
      scheme: { ey: 0.53, sp: 0.158, w: 0.15, h: 0.03, tilt: 0.02, uin: 0.5, uout: 0.6, lo: 0.4, ir: 0.0, iy: 0, lid: 1, gaze: 0 },
    }[E];
    for (const s of [-1, 1]) drawEye(ctx, s, P, m, M, u, E);

    // --- brows: thin, high, sharply arched (smug lifts one)
    const BR = {
      smug: [[0.08, -0.058], [0.0, -0.112], [-0.11, -0.092]],
      angry: [[0.09, -0.028], [0.0, -0.072], [-0.11, -0.112]],
      panic: [[0.08, -0.13], [0.0, -0.13], [-0.11, -0.082]],
      scheme: [[0.08, -0.085], [0.0, -0.14], [-0.11, -0.12]],
    }[E];
    for (const s of [-1, 1]) {
      const pts = BR.map((b) => [s * (P.sp - b[0]), P.ey + b[1] + (E === 'smug' && s > 0 ? -0.016 : 0)]);
      K.taper(ctx, M(pts, -0.01), 0.032 * u, '#1b1418', { w0: 0.85, w1: 0.12, a: 0.12, b: 0.6 });
    }

    // --- nose: long high bridge, hooked tip (crow-beak echo)
    K.taper(ctx, M([[0.045, 0.53], [0.06, 0.62], [0.062, 0.69], [0.05, 0.735]], 0.04), 0.026 * u, sk.sh, { w0: 0.2, w1: 0.6, alpha: 0.85 });
    K.taper(ctx, M([[-0.028, 0.55], [-0.03, 0.66]], 0.06), 0.013 * u, sk.hl, { alpha: 0.85 });
    K.clipDo(ctx, faceP, (c) => { K.taper(c, M([[-0.06, 0.76], [0, 0.78], [0.075, 0.76]], 0.05), 0.032 * u, sk.sh, { alpha: 0.55 }); });
    K.taper(ctx, M([[-0.072, 0.728], [-0.064, 0.75], [-0.036, 0.759]], 0.07), 0.014 * u, sk.line, { w0: 0.5 });
    K.taper(ctx, M([[0.075, 0.725], [0.068, 0.749], [0.042, 0.759]], 0.07), 0.016 * u, sk.line, { w0: 0.5 });
    K.taper(ctx, M([[-0.024, 0.757], [0.005, 0.774], [0.032, 0.757]], 0.1), 0.013 * u, sk.line, {});
    const tip = m(-0.012, 0.735, 0.1);
    ctx.fillStyle = K.rgba('#ffffff', 0.6); ctx.beginPath(); ctx.ellipse(tip[0], tip[1], 0.02 * u, 0.013 * u, 0, 0, Math.PI * 2); ctx.fill();

    // --- mouth
    drawMouth(ctx, E, m, M, u, faceP);

    // --- pencil moustache curling up, goatee tuft
    const lift = E === 'smug' ? 0.022 : E === 'scheme' ? 0.015 : 0;
    for (const s of [-1, 1]) {
      const ly = s > 0 ? lift : 0;
      const pts = E === 'panic'
        ? [[s * 0.018, 0.807], [s * 0.1, 0.81], [s * 0.16, 0.825], [s * 0.18, 0.85]]
        : E === 'angry'
          ? [[s * 0.018, 0.803], [s * 0.1, 0.802], [s * 0.165, 0.81], [s * 0.2, 0.79]]
          : [[s * 0.018, 0.806], [s * 0.1, 0.803 - ly * 0.5], [s * 0.168, 0.794 - ly], [s * 0.198, 0.76 - ly], [s * 0.185, 0.744 - ly]];
      K.taper(ctx, M(pts, 0.02), 0.024 * u, '#17121a', { w0: 0.45, w1: 0.2, a: 0.2, b: 0.5 });
    }
    const gy = E === 'panic' ? 0.04 : E === 'angry' ? 0.015 : 0;
    const goat = K.S(M([[-0.03, 0.892 + gy], [0.03, 0.892 + gy], [0.015, 0.935 + gy], [0.002, 0.985 + gy, 1], [-0.015, 0.935 + gy]], 0.03), true);
    K.part(ctx, goat, { fill: '#1a1520', line: '#050307', lw: 1.2 });

    // --- 瓜皮帽 six-panel skullcap with red knot (mapped onto the skull)
    const CM = (pts) => pts.map((q) => { const dd = q[0] * th > 0 ? -0.02 : -0.3 + 0.28 * Math.max(0, 1 - Math.abs(q[0]) / 0.42); const r = m(q[0], q[1], dd); if (q[2]) r.push(1); return r; });
    const capP = K.S(CM([[-0.415, 0.3, 1], [-0.41, 0.16], [-0.34, 0.03], [-0.18, -0.04], [0, -0.06], [0.18, -0.04], [0.34, 0.03], [0.41, 0.16], [0.415, 0.3, 1], [0.2, 0.312], [0, 0.316], [-0.2, 0.312]]), true);
    K.cast(ctx, faceP, capP, 0, 4, sk.sh, 0.55);
    K.toon(ctx, capP, MT.hair, {
      s: 10, lw: 2.2, fill: '#1c1a22',
      inner: (c) => {
        for (const sx of [-0.2, 0.2]) K.line(c, CM([[sx * 0.15, -0.055], [sx * 0.8, 0.06], [sx * 1.15, 0.24]]), 1.6, '#000000', { alpha: 0.9 });
        K.line(c, CM([[0, -0.06], [0, 0.24]]), 1.4, '#000000', { alpha: 0.6 });
        K.taper(c, CM([[-0.3, 0.06], [-0.16, -0.01], [0.02, -0.03]]), 0.05 * u, '#6c6a86', { alpha: 0.55 });
        K.part(c, K.S(CM([[-0.43, 0.235], [-0.2, 0.248], [0, 0.25], [0.2, 0.248], [0.43, 0.235], [0.43, 0.34], [0, 0.34], [-0.43, 0.34]]), true), { fill: '#0f0e14', line: false, fx: [{ dx: 0, dy: -3, c: '#3a3950', a: 0.6 }] });
      },
    });
    K.line(ctx, CM([[-0.41, 0.24], [-0.2, 0.25], [0, 0.255], [0.2, 0.25], [0.41, 0.24]]), 1.3, '#000');
    const knot = m(0, -0.07, -0.02);
    K.part(ctx, K.circle(knot[0], knot[1] - 3, 0.05 * u), { fill: C.red, line: MT.red.line, lw: 1.6, fx: [{ dx: -3, dy: -2, c: MT.red.sh }, { dx: 2, dy: 2, c: MT.red.hl, a: 0.8 }] });

    // --- sweat drop (panic)
    if (E === 'panic') {
      const d = m(0.31, 0.34, -0.05);
      const dp = K.S([[d[0], d[1] - 10, 1], [d[0] + 6, d[1] + 4], [d[0], d[1] + 9], [d[0] - 6, d[1] + 4]]);
      K.part(ctx, dp, { fill: '#bfe8ff', line: '#3d6c8c', lw: 1.4, fx: [{ dx: -3, dy: -2, c: '#ffffff', a: 0.7 }] });
    }
    return { faceP, head, m, M };
  }

  function drawEye(ctx, s, P, m, M, u, E) {
    const ey = P.ey, cx = s * P.sp, w = P.w, h = P.h;
    const inner = [cx - s * w * 0.5, ey + 0.004, 1];
    const outer = [cx + s * w * 0.5, ey - P.tilt, 1];
    const lidDrop = P.lid * h * 0.55;
    const up = [[cx - s * w * 0.22, ey - h * P.uin + lidDrop * 0.6], [cx + s * w * 0.16, ey - h * P.uout + lidDrop]];
    const lo = [[cx + s * w * 0.2, ey + h * P.lo - 0.004], [cx - s * w * 0.18, ey + h * P.lo * 0.85]];
    const d = -0.02;
    if (E === 'scheme') {
      // closed, smiling crescent eyes
      K.taper(ctx, M([[cx - s * w * 0.5, ey + 0.012], [cx, ey - 0.02], [cx + s * w * 0.5, ey - 0.006], [cx + s * w * 0.62, ey - 0.03]], d), 0.02 * u, '#140f14', { w0: 0.3, w1: 0.2 });
      K.taper(ctx, M([[cx - s * w * 0.3, ey + 0.035], [cx + s * w * 0.3, ey + 0.03]], d), 0.008 * u, MT.sk.sh2, { alpha: 0.8 });
      return;
    }
    const shape = K.S(M([inner, up[0], up[1], outer, lo[0], lo[1]], d), true);
    K.part(ctx, shape, { fill: '#f4efe7', line: false, fx: [{ dx: 0, dy: h * 0.55 * u, c: '#c8b7b3' }] });
    // iris
    if (P.ir > 0) {
      const ic = m(cx + P.gaze * (s > 0 ? 1 : 1) - s * 0.004, ey + P.iy, d);
      const e1 = m(cx - P.ir, ey, d), e2 = m(cx + P.ir, ey, d);
      const rx = Math.abs(e2[0] - e1[0]) / 2, ry = P.ir * u;
      K.clipDo(ctx, shape, (c) => {
        const g = c.createLinearGradient(ic[0], ic[1] - ry, ic[0], ic[1] + ry);
        g.addColorStop(0, '#2a1208'); g.addColorStop(0.55, '#7a3d12'); g.addColorStop(1, '#d08a2c');
        c.fillStyle = g; c.beginPath(); c.ellipse(ic[0], ic[1], rx, ry, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#1a0a05'; c.lineWidth = 1.2 * K.lineScale; c.stroke();
        c.fillStyle = '#0c0506'; c.beginPath(); c.ellipse(ic[0], ic[1], rx * 0.42, ry * 0.42, 0, 0, Math.PI * 2); c.fill();
        // lid shadow on the eyeball
        c.fillStyle = 'rgba(60,30,40,0.35)'; c.fillRect(ic[0] - rx * 2, ic[1] - ry * 2.2, rx * 4, ry * 1.25);
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(ic[0] - rx * 0.35, ic[1] - ry * 0.3, Math.max(0.8, rx * 0.3), 0, Math.PI * 2); c.fill();
        c.globalAlpha = 0.8; c.beginPath(); c.arc(ic[0] + rx * 0.35, ic[1] + ry * 0.4, Math.max(0.5, rx * 0.13), 0, Math.PI * 2); c.fill();
      });
    }
    // upper lash line with crow-wing flick
    const flick = [outer[0] + s * w * 0.2, outer[1] - 0.028];
    K.taper(ctx, M([inner, up[0], up[1], outer, flick], d), 0.024 * u, '#120c10', { w0: 0.25, w1: 0.05, a: 0.3, b: 0.25 });
    // lower lid
    K.taper(ctx, M([outer, lo[0], lo[1]], d), 0.009 * u, '#4a2a2a', { w0: 0.6, w1: 0.1 });
    // heavy hooded lid crease
    K.taper(ctx, M([[cx - s * w * 0.1, ey - h * 1.25], [cx + s * w * 0.25, ey - h * 1.3 - 0.004], [cx + s * w * 0.55, ey - P.tilt - 0.012]], d), 0.011 * u, MT.sk.sh2, { alpha: 0.85 });
    // tired under-eye shadow
    K.taper(ctx, M([[cx - s * w * 0.35, ey + h * P.lo + 0.022], [cx + s * w * 0.15, ey + h * P.lo + 0.028], [cx + s * w * 0.5, ey + 0.01]], d), 0.03 * u, '#9e6a72', { alpha: 0.32 });
  }

  function drawMouth(ctx, E, m0, M0, u, faceP) {
    const m = (x, y, d) => m0(x, y + 0.01, d), M = (pts, d) => M0(pts.map((q) => [q[0], q[1] + 0.01, q[2], q[3]]), d);
    const d = 0.03, lip = '#7a2f2e';
    let mp, teethTop = null, teethBot = null;
    if (E === 'smug' || E === 'scheme') {
      const L = [-0.13, 0.816, 1], Rr = [0.145, 0.794, 1];
      const upE = [L, [-0.07, 0.826], [0.0, 0.823], [0.08, 0.815], Rr];
      const loE = [[0.085, 0.85], [0.0, 0.866], [-0.07, 0.858]];
      mp = K.S(M(upE.concat(loE), d), true, 0.8);
      teethTop = K.S(M([L, [-0.07, 0.826], [0.0, 0.823], [0.08, 0.815], Rr, [0.08, 0.838], [0, 0.846], [-0.07, 0.846]], d), true, 0.8);
      ctx.save(); K.part(ctx, mp, { fill: '#3e1116', line: false }); ctx.restore();
      K.clipDo(ctx, mp, (c) => {
        K.part(c, teethTop, { fill: '#f3ede0', line: false, fx: [{ dx: 0, dy: 4, c: '#c9bcae' }] });
        for (const tx of [-0.07, -0.03, 0.01, 0.05, 0.09]) K.line(c, M([[tx, 0.822], [tx + 0.003, 0.842]], d), 0.9, '#b3a493');
      });
      K.taper(ctx, M(upE, d), 0.017 * u, '#3a1214', { w0: 0.3, w1: 0.3, a: 0.2, b: 0.2 });
      K.taper(ctx, M([[0.085, 0.85], [0.0, 0.866], [-0.07, 0.858]], d), 0.009 * u, lip, { alpha: 0.9 });
      // dimple / smirk crease at the raised corner and nasolabials
      K.taper(ctx, M([[0.155, 0.775], [0.17, 0.795], [0.162, 0.815]], d), 0.011 * u, MT.sk.sh2, { alpha: 0.8 });
      for (const s of [-1, 1]) K.taper(ctx, M([[s * 0.08, 0.735], [s * 0.125, 0.77], [s * 0.15, 0.805]], 0.03), 0.012 * u, MT.sk.sh2, { alpha: 0.6 });
      K.taper(ctx, M([[-0.05, 0.89], [0.0, 0.896], [0.05, 0.888]], d), 0.016 * u, MT.sk.sh, { alpha: 0.8 });
    } else if (E === 'angry') {
      const up = [[-0.14, 0.835, 1], [-0.07, 0.808], [0, 0.812], [0.07, 0.808], [0.14, 0.835, 1]];
      const lo = [[0.08, 0.888], [0, 0.896], [-0.08, 0.888]];
      mp = K.S(M(up.concat(lo), d), true, 0.8);
      K.part(ctx, mp, { fill: '#3e1116', line: false });
      K.clipDo(ctx, mp, (c) => {
        K.part(c, K.S(M([[-0.16, 0.8], [0.16, 0.8], [0.16, 0.832], [0, 0.838], [-0.16, 0.832]], d), true, 0.5), { fill: '#f3ede0', line: false });
        K.part(c, K.S(M([[-0.16, 0.9], [0.16, 0.9], [0.16, 0.872], [0, 0.868], [-0.16, 0.872]], d), true, 0.5), { fill: '#e8e0d0', line: false });
        for (const tx of [-0.08, -0.04, 0, 0.04, 0.08]) { K.line(c, M([[tx, 0.81], [tx, 0.836]], d), 0.9, '#b3a493'); K.line(c, M([[tx + 0.02, 0.87], [tx + 0.02, 0.895]], d), 0.9, '#b3a493'); }
      });
      K.taper(ctx, M(up, d), 0.018 * u, '#3a1214', { w0: 0.3, w1: 0.3 });
      K.taper(ctx, M(lo, d), 0.012 * u, '#3a1214', { w0: 0.3, w1: 0.3 });
      for (const s of [-1, 1]) K.taper(ctx, M([[s * 0.075, 0.73], [s * 0.13, 0.775], [s * 0.165, 0.84]], 0.03), 0.014 * u, MT.sk.sh2, { alpha: 0.75 });
    } else if (E === 'panic') {
      const up = [[-0.11, 0.84, 1], [-0.06, 0.822], [-0.02, 0.834], [0.02, 0.822], [0.06, 0.834], [0.11, 0.84, 1]];
      const lo = [[0.07, 0.9], [0, 0.918], [-0.07, 0.9]];
      mp = K.S(M(up.concat(lo), d), true, 0.7);
      K.part(ctx, mp, { fill: '#3e1116', line: false });
      K.clipDo(ctx, mp, (c) => {
        K.part(c, K.ell(...m(0, 0.92, d), 0.07 * u, 0.035 * u), { fill: '#c45a5f', line: false });
        K.part(c, K.S(M([[-0.08, 0.81], [0.08, 0.81], [0.08, 0.84], [-0.08, 0.84]], d), true, 0.3), { fill: '#f3ede0', line: false });
      });
      K.taper(ctx, M(up, d), 0.014 * u, '#3a1214', { w0: 0.5, w1: 0.5 });
      K.taper(ctx, M(lo, d), 0.01 * u, '#3a1214', {});
    }
  }

  // ------------------------------------------------------------------ head (profile, facing left)
  function headSide(ctx, o) {
    o = o || {};
    const u = U, X0 = o.x || 0, Y0 = o.y == null ? -H : o.y;
    const m = (lx, ly) => [X0 + lx * u, Y0 + ly * u];
    const M = (pts) => pts.map((q) => { const r = m(q[0], q[1]); if (q[2]) r.push(1); return r; });
    const sk = MT.sk;
    // hair cap (back of skull) – drawn after the skull
    const outline = [[0, 0], [-0.2, 0.03], [-0.32, 0.14], [-0.37, 0.3], [-0.375, 0.42], [-0.345, 0.475], [-0.375, 0.515], [-0.43, 0.6], [-0.485, 0.695], [-0.5, 0.725, 1], [-0.47, 0.738], [-0.405, 0.742, 1], [-0.395, 0.775], [-0.392, 0.8], [-0.375, 0.818, 1], [-0.388, 0.84], [-0.372, 0.865], [-0.352, 0.885], [-0.365, 0.935], [-0.345, 0.985], [-0.29, 1.0], [-0.15, 0.94], [0.0, 0.86], [0.08, 0.78], [0.2, 0.8], [0.34, 0.72], [0.44, 0.52], [0.45, 0.32], [0.37, 0.12], [0.2, 0.02]];
    const headP = K.S(M(outline), true, 0.9);
    K.toon(ctx, headP, sk, { s: 9, sd: [9, -4], rim: sk.rim, rimW: -2.2, lw: 2 });
    K.clipDo(ctx, headP, (c) => {
      // cheek hollow + jaw shadow
      K.taper(c, M([[-0.16, 0.6], [-0.12, 0.68], [-0.1, 0.78]]), 0.06 * u, sk.sh, { alpha: 0.35 });
      K.taper(c, M([[-0.3, 0.97], [-0.15, 0.92], [0.0, 0.85], [0.08, 0.79]]), 0.05 * u, sk.sh, { alpha: 0.7 });
    });
    // queue hair at the back (below the cap)
    const hairB = K.S(M([[0.12, 0.3], [0.44, 0.31], [0.47, 0.45], [0.42, 0.62], [0.34, 0.74], [0.24, 0.7], [0.2, 0.5], [0.14, 0.32]]), true);
    K.toon(ctx, hairB, MT.hair, { s: 5, sd: [6, -3], hl: false });
    // ear
    const ear = K.S(M([[0.08, 0.47], [0.15, 0.44], [0.2, 0.5], [0.205, 0.6], [0.18, 0.69], [0.13, 0.75], [0.085, 0.73], [0.1, 0.62]]), true);
    K.toon(ctx, ear, sk, { s: 5, sd: [5, -3], lw: 1.8 });
    K.line(ctx, M([[0.12, 0.5], [0.17, 0.53], [0.175, 0.62], [0.15, 0.68]]), 1.6, sk.sh2);
    K.line(ctx, M([[0.12, 0.57], [0.135, 0.62]]), 1.4, sk.sh2);
    // eye (profile wedge)
    const eye = K.S(M([[-0.33, 0.495, 1], [-0.285, 0.483], [-0.245, 0.49, 1], [-0.282, 0.512]]), true);
    K.part(ctx, eye, { fill: '#f4efe7', line: false });
    K.clipDo(ctx, eye, (c) => { K.part(c, K.ell(...m(-0.305, 0.5), 0.012 * u, 0.026 * u), { fill: '#6a3410', line: false }); });
    K.taper(ctx, M([[-0.33, 0.494], [-0.29, 0.482], [-0.24, 0.484], [-0.215, 0.468]]), 0.022 * u, '#120c10', { w0: 0.5, w1: 0.1 });
    K.taper(ctx, M([[-0.31, 0.465], [-0.27, 0.455], [-0.235, 0.462]]), 0.01 * u, sk.sh2, {});
    // brow
    K.taper(ctx, M([[-0.36, 0.42], [-0.31, 0.388], [-0.22, 0.395]]), 0.025 * u, '#1b1418', { w0: 0.9, w1: 0.12 });
    // nostril + nose crease
    K.taper(ctx, M([[-0.44, 0.71], [-0.415, 0.72], [-0.41, 0.735]]), 0.014 * u, sk.line, {});
    K.taper(ctx, M([[-0.39, 0.7], [-0.355, 0.75], [-0.32, 0.795]]), 0.012 * u, sk.sh2, { alpha: 0.7 });
    // grin
    K.taper(ctx, M([[-0.385, 0.805], [-0.34, 0.808], [-0.3, 0.792], [-0.285, 0.775]]), 0.016 * u, '#3a1214', { w0: 0.4, w1: 0.2 });
    K.part(ctx, K.S(M([[-0.386, 0.804], [-0.34, 0.807], [-0.33, 0.822], [-0.38, 0.82]]), true), { fill: '#f3ede0', line: false });
    // moustache + goatee
    K.taper(ctx, M([[-0.405, 0.785], [-0.36, 0.782], [-0.31, 0.776], [-0.285, 0.75], [-0.295, 0.735]]), 0.022 * u, '#17121a', { w0: 0.5, w1: 0.2 });
    K.part(ctx, K.S(M([[-0.385, 0.86], [-0.37, 0.87], [-0.39, 0.92], [-0.405, 0.955, 1], [-0.398, 0.9]]), true), { fill: '#1a1520', line: '#050307', lw: 1.2 });
    // crest feathers + cap
    crestFeathers(ctx, m(0.08, -0.03), [{ a: 0.78, l: 0.74 * u, w: 0.15 * u }, { a: 0.45, l: 0.62 * u, w: 0.14 * u }]);
    const capP0 = K.S(M([[-0.36, 0.31, 1], [-0.375, 0.17], [-0.31, 0.04], [-0.13, -0.045], [0.08, -0.06], [0.28, -0.015], [0.43, 0.11], [0.48, 0.27], [0.475, 0.33, 1], [0.1, 0.33]]), true);
    K.cast(ctx, headP, capP0, 0, 4, sk.sh, 0.55);
    const capP = K.S(M([[-0.36, 0.31, 1], [-0.375, 0.17], [-0.31, 0.04], [-0.13, -0.045], [0.08, -0.06], [0.28, -0.015], [0.43, 0.11], [0.48, 0.27], [0.475, 0.33, 1], [0.1, 0.33]]), true);
    K.toon(ctx, capP, MT.hair, {
      s: 9, sd: [9, -4], lw: 2.2, fill: '#1c1a22',
      inner: (c) => {
        K.line(c, M([[0.06, -0.06], [0.12, 0.1], [0.12, 0.28]]), 1.6, '#000');
        K.line(c, M([[0.06, -0.06], [0.3, 0.06], [0.42, 0.24]]), 1.6, '#000');
        K.taper(c, M([[-0.28, 0.08], [-0.12, -0.02], [0.08, -0.04]]), 0.05 * u, '#6c6a86', { alpha: 0.55 });
        K.part(c, K.S(M([[-0.4, 0.245], [0.1, 0.26], [0.5, 0.27], [0.5, 0.36], [-0.4, 0.36]]), true), { fill: '#0f0e14', line: false });
      },
    });
    const kn = m(0.06, -0.075);
    K.part(ctx, K.circle(kn[0], kn[1] - 2, 0.05 * u), { fill: C.red, line: MT.red.line, lw: 1.6, fx: [{ dx: 3, dy: -2, c: MT.red.sh }] });
    return { headP, m, M };
  }

  // ------------------------------------------------------------------ braid (queue)
  function braid(ctx, pts, w0, w1, o) {
    o = o || {};
    const s = K.sample(pts, false, 1, 16);
    const n = s.length;
    const cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]));
    const L = cum[n - 1];
    const at = (d) => { let i = 1; while (i < n - 1 && cum[i] < d) i++; const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); const a = s[i - 1], b = s[i]; return { x: K.lerp(a[0], b[0], t), y: K.lerp(a[1], b[1], t), tx: (b[0] - a[0]) / (cum[i] - cum[i - 1] || 1), ty: (b[1] - a[1]) / (cum[i] - cum[i - 1] || 1) }; };
    const seg = o.seg || 16;
    const count = Math.floor((L - (o.tail || 34)) / seg);
    // underlay
    const body = [];
    for (let i = 0; i <= count; i++) { const p = at(i * seg); const w = K.lerp(w0, w1, i / count) / 2; body.push([p.x - p.ty * w, p.y + p.tx * w]); }
    for (let i = count; i >= 0; i--) { const p = at(i * seg); const w = K.lerp(w0, w1, i / count) / 2; body.push([p.x + p.ty * w, p.y - p.tx * w]); }
    K.part(ctx, K.S(body, true, 0.5), { fill: '#0d0c12', line: '#020203', lw: 1.6 });
    for (let i = 0; i < count; i++) {
      const p = at(i * seg + seg * 0.5), w = K.lerp(w0, w1, i / count);
      const side = i % 2 ? 1 : -1;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.ty, p.tx) - Math.PI / 2);
      const lobe = K.S([[side * w * 0.5, -seg * 0.62, 1], [side * w * 0.05, -seg * 0.1], [-side * w * 0.42, seg * 0.55, 1], [side * w * 0.2, seg * 0.25], [side * w * 0.55, -seg * 0.15]], true);
      K.part(ctx, lobe, { fill: MT.hair.base, line: '#020203', lw: 1.3, fx: [{ dx: side * 3, dy: 3, c: '#3d3b56', a: 0.85 }, { dx: -side * 2, dy: -1, c: '#060509', a: 0.7 }] });
      ctx.restore();
    }
    // red cord wrap and tassel with crow feathers
    const e = at(count * seg + 4), ang = Math.atan2(e.ty, e.tx) - Math.PI / 2;
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(ang);
    for (const f of [[-0.35, 1.0], [0.3, 0.92], [0, 1.15]]) {
      ctx.save(); ctx.rotate(f[0]);
      feather(ctx, 0, 4, 11, 46 * f[1], 0, { base: '#1d1c27', sheen: '#55609a', edge: '#060509', rachis: '#5a6080' });
      ctx.restore();
    }
    for (let i = -3; i <= 3; i++) K.taper(ctx, [[i * 1.6, 6], [i * 2.4, 22], [i * 3, 34]], 2.2, '#b82c25', { w0: 0.8, w1: 0.4 });
    K.part(ctx, K.rrect(-w1 * 0.62, -8, w1 * 1.24, 14, 3), { fill: C.red, line: MT.red.line, lw: 1.4, fx: [{ dx: -3, dy: 0, c: MT.red.sh }] });
    K.line(ctx, [[-w1 * 0.6, -3], [w1 * 0.6, -3]], 1, '#ffb59a', { alpha: 0.7 });
    ctx.restore();
  }

  // ------------------------------------------------------------------ props
  function lantern(ctx, cx, top, w, h, o) {
    o = o || {};
    const cy = top + h * 0.5;
    // inner soul glow
    K.glow(ctx, cx, cy, w * 1.25, C.glow, 0.55);
    const body = K.S([[cx, top + 6], [cx + w * 0.42, top + h * 0.12], [cx + w * 0.5, cy], [cx + w * 0.42, top + h * 0.88], [cx, top + h - 6], [cx - w * 0.42, top + h * 0.88], [cx - w * 0.5, cy], [cx - w * 0.42, top + h * 0.12]], true);
    K.part(ctx, body, {
      fill: '#f4ecd6', line: '#6a5634', lw: 2,
      under: (c) => {
        const g = c.createRadialGradient(cx - w * 0.05, cy + h * 0.05, 2, cx, cy, w * 0.6);
        g.addColorStop(0, 'rgba(210,255,255,0.95)'); g.addColorStop(0.5, 'rgba(150,235,240,0.55)'); g.addColorStop(1, 'rgba(90,150,170,0.0)');
        c.fillStyle = g; c.fillRect(cx - w, top, 2 * w, h);
        // horizontal ribs
        for (let i = 1; i < 9; i++) {
          const y = top + (h * i) / 9, k = Math.sqrt(Math.max(0, 1 - Math.pow((y - cy) / (h * 0.5), 2)));
          K.line(c, [[cx - w * 0.5 * k, y], [cx, y + 2.5], [cx + w * 0.5 * k, y]], 1.1, '#9a8a66', { alpha: 0.55 });
        }
      },
      fx: [{ dx: -9, dy: -2, c: '#9fb8b8', a: 0.45 }, { dx: 6, dy: 4, c: '#ffffff', a: 0.5 }],
    });
    // characters 長 / 明 in vermilion
    ctx.save(); ctx.fillStyle = '#c0281f'; ctx.font = `700 ${Math.round(w * 0.36)}px ${K.FONT_ZH}`; ctx.textAlign = 'center';
    ctx.fillText(o.t1 || '長', cx, cy - h * 0.04);
    ctx.fillText(o.t2 || '明', cx, cy + h * 0.32);
    ctx.restore();
    // swirling soul wisps
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    K.line(ctx, [[cx - w * 0.2, cy + h * 0.25], [cx - w * 0.28, cy], [cx - w * 0.08, cy - h * 0.18], [cx + w * 0.12, cy - h * 0.06]], 2, '#bff8ff', { alpha: 0.6 });
    ctx.restore();
    // caps
    const capT = K.S([[cx - w * 0.3, top + 9, 1], [cx - w * 0.26, top, 1], [cx + w * 0.26, top, 1], [cx + w * 0.3, top + 9, 1]], true);
    const capB = K.S([[cx - w * 0.3, top + h - 9, 1], [cx + w * 0.3, top + h - 9, 1], [cx + w * 0.26, top + h, 1], [cx - w * 0.26, top + h, 1]], true);
    K.toon(ctx, capT, MT.lac, { s: 5, lw: 1.6 });
    K.toon(ctx, capB, MT.lac, { s: 5, lw: 1.6 });
    K.line(ctx, [[cx - w * 0.27, top + 4], [cx + w * 0.27, top + 4]], 1.2, '#c99a3e');
    K.line(ctx, [[cx - w * 0.27, top + h - 4], [cx + w * 0.27, top + h - 4]], 1.2, '#c99a3e');
    // tassel
    if (o.tassel !== false) {
      K.part(ctx, K.circle(cx, top + h + 6, 4.5), { fill: C.red, line: MT.red.line, lw: 1.2 });
      for (let i = -3; i <= 3; i++) K.taper(ctx, [[cx + i * 1.3, top + h + 8], [cx + i * 2.2 + (o.sway || 0) * 0.5, top + h + 26], [cx + i * 2.8 + (o.sway || 0), top + h + 44]], 2.4, i % 2 ? '#a92720' : C.red, { w0: 0.9, w1: 0.5 });
      K.part(ctx, K.rrect(cx - 4, top + h + 10, 8, 7, 2), { fill: '#c99a3e', line: MT.br.line, lw: 1 });
    }
  }
  function talisman(ctx, x, y, w, h, ang, seed) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang || 0);
    const p = K.S([[-w / 2, 0, 1], [w / 2, 0, 1], [w / 2 + 1.5, h * 0.55], [w / 2 - 1, h, 1], [-w / 2 + 1, h, 1], [-w / 2 - 1.5, h * 0.5]], true, 0.5);
    K.part(ctx, p, { fill: C.tal, line: MT.tal.line, lw: 1.4, fx: [{ dx: -4, dy: 0, c: MT.tal.sh, a: 0.8 }, { dx: 3, dy: 2, c: '#fff3c0', a: 0.6 }] });
    // vermilion script: 敕令 + squiggle + seal
    ctx.fillStyle = '#b8251c'; ctx.font = `700 ${Math.round(w * 0.62)}px ${K.FONT_ZH}`; ctx.textAlign = 'center';
    ctx.fillText('敕', 0, w * 0.75);
    const r = K.rng(seed || 2), pts = [];
    for (let i = 0; i < 7; i++) pts.push([(r() - 0.5) * w * 0.55, w * 1.05 + (i * (h - w * 1.5)) / 6]);
    K.line(ctx, pts, 1.6, '#b8251c', { noScale: true });
    ctx.strokeStyle = '#b8251c'; ctx.lineWidth = 1.2; ctx.strokeRect(-w * 0.22, h - w * 0.5, w * 0.44, w * 0.38);
    ctx.restore();
  }
  function crowHead(ctx, x, y, s, flip) {
    // carved crow-head finial; beak points along +x (flip -> -x)
    ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -s : s, s);
    const head = K.S([[-12, 6], [-10, -6], [-2, -11], [8, -9], [13, -4], [30, 2, 1], [13, 4], [10, 9], [0, 12], [-8, 12]], true);
    K.toon(ctx, head, MT.lac, { s: 4, lw: 1.6 });
    K.line(ctx, [[13, -1.5], [28, 2]], 1, '#5a4a52');
    K.part(ctx, K.circle(4, -3, 2.6), { fill: C.red, line: '#2a0505', lw: 0.8 });
    K.part(ctx, K.circle(3.4, -3.6, 0.9), { fill: '#ffd0b0', line: false });
    ctx.restore();
  }
  function bamboo(ctx, x, y0, y1, w) {
    const p = K.P((q) => q.roundRect(x - w / 2, y1, w, y0 - y1, w / 2));
    K.toon(ctx, p, MT.bam, { s: 3.5, lw: 1.8 });
    for (let y = y0 - 70; y > y1 + 30; y -= 118) {
      K.line(ctx, [[x - w / 2, y], [x + w / 2, y]], 2.2, MT.bam.line);
      K.line(ctx, [[x - w / 2 + 1, y - 2.5], [x + w / 2 - 1, y - 2.5]], 1.2, MT.bam.hl, { alpha: 0.8 });
    }
    K.part(ctx, K.P((q) => q.roundRect(x - w / 2 - 1.5, y0 - 16, w + 3, 16, 2)), { fill: C.brass, line: MT.br.line, lw: 1.4, fx: [{ dx: -3, dy: 0, c: MT.br.sh }] });
  }

  function token(ctx, cx, top, k) {
    ctx.save(); ctx.translate(cx, top); ctx.scale(k, k);
    K.line(ctx, [[0, -24], [-2, -10], [0, 0]], 1.6, C.red);
    const tok = K.S([[-15, 0, 1], [15, 0, 1], [17, 40], [0, 53, 1], [-17, 40]], true, 0.4);
    K.toon(ctx, tok, MT.lac, { s: 6, lw: 1.8 });
    ctx.fillStyle = '#d6aa52'; ctx.font = `700 12px ${K.FONT_ZH}`; ctx.textAlign = 'center';
    ctx.fillText('長', 0, 17); ctx.fillText('明', 0, 31);
    K.line(ctx, [[-15, 5], [15, 5]], 1, '#d6aa52');
    K.part(ctx, K.circle(0, 44, 3.4), { fill: C.red, line: MT.red.line, lw: 1 });
    ctx.restore();
  }
  function badge(ctx, x, y, r) {
    K.part(ctx, K.circle(x, y, r), { fill: '#e9e0c8', line: '#4a3a2a', lw: 2, fx: [{ dx: -r * 0.2, dy: -r * 0.08, c: '#bfb197' }] });
    ctx.save(); ctx.strokeStyle = C.red; ctx.lineWidth = r * 0.14; ctx.beginPath(); ctx.arc(x, y, r * 0.82, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#1a1418'; ctx.font = `700 ${Math.round(r)}px ${K.FONT_ZH}`; ctx.textAlign = 'center'; ctx.fillText('明', x, y + r * 0.36); ctx.restore();
  }

  // ------------------------------------------------------------------ hands
  function fistOnPole(ctx, x, y, flip) {
    // gripping a vertical pole at (x,y): back of hand faces outward, fingers wrap the front
    const f = flip ? -1 : 1;
    const sk = MT.sk;
    const palm = K.S([[x - f * 13, y - 22], [x + f * 8, y - 26], [x + f * 15, y - 10], [x + f * 14, y + 14], [x + f * 2, y + 20], [x - f * 12, y + 14], [x - f * 15, y - 4]], true);
    K.toon(ctx, palm, sk, { s: 5, lw: 1.8 });
    for (let i = 0; i < 4; i++) {
      const yy = y - 12 + i * 8;
      const fp = K.S([[x - f * 14, yy - 4], [x + f * 4, yy - 4.5], [x + f * 11, yy - 2], [x + f * 11, yy + 3], [x + f * 4, yy + 4], [x - f * 14, yy + 3.5]], true, 0.8);
      K.toon(ctx, fp, sk, { s: 2.5, lw: 1.4, hl: false });
    }
    const th = K.S([[x - f * 14, y - 20], [x - f * 4, y - 27], [x + f * 7, y - 25], [x + f * 9, y - 20], [x - f * 2, y - 17]], true);
    K.toon(ctx, th, sk, { s: 3, lw: 1.5 });
  }
  function hipHand(ctx, x, y, flip) {
    // hand planted on the hip, knuckles forward; (x,y) = wrist; fingers point toward body centre
    const f = flip ? -1 : 1;
    const sk = MT.sk;
    const back = K.S([[x - f * 9, y - 9], [x + f * 8, y - 10], [x + f * 22, y + 2], [x + f * 26, y + 16], [x + f * 12, y + 22], [x - f * 2, y + 14], [x - f * 10, y + 4]], true);
    K.toon(ctx, back, sk, { s: 5, lw: 1.8 });
    for (let i = 0; i < 4; i++) {
      const bx = x + f * (25 - i * 4.5), by = y + 10 + i * 4;
      const fp = K.S([[bx - f * 2, by - 4], [bx + f * 6, by - 2], [bx + f * 9, by + 7], [bx + f * 5, by + 12], [bx + f * 1, by + 7], [bx - f * 4, by + 3]], true);
      K.toon(ctx, fp, sk, { s: 2.5, lw: 1.3, hl: false });
    }
    K.line(ctx, [[x + f * 10, y], [x + f * 18, y + 6]], 1.1, sk.sh2, { alpha: 0.7 });
  }

  // ------------------------------------------------------------------ shared body bits
  function legWrap(ctx, outer, inner, s) {
    // outer/inner: points from knee to ankle; bands spiral downward toward the inside of the leg
    const pts = outer.concat(inner.slice().reverse());
    const p = K.S(pts, true, 0.8);
    const cx = (outer[0][0] + inner[0][0]) / 2;
    K.toon(ctx, p, MT.wr, {
      s: 8, lw: 1.8,
      inner: (c) => {
        const y0 = Math.min(outer[0][1], inner[0][1]), y1 = Math.max(outer[outer.length - 1][1], inner[inner.length - 1][1]);
        for (let y = y0 + 14; y < y1 + 14; y += 16) {
          const a = [cx - s * 40, y - 9], b = [cx + s * 40, y + 9];
          K.taper(c, [a, b], 4.5, MT.wr.sh, { alpha: 0.85, w0: 1, w1: 1, noScale: true });
          K.line(c, [[a[0], a[1] - 3.2], [b[0], b[1] - 3.2]], 1.6, MT.wr.line, { alpha: 0.75 });
          K.line(c, [[a[0], a[1] - 5.2], [b[0], b[1] - 5.2]], 1.1, MT.wr.hl, { alpha: 0.9 });
        }
      },
    });
  }
  function trouserLeg(ctx, s, side) {
    const pts = side
      ? [[-44, -380], [-50, -300], [-44, -236], [-38, -208], [-8, -199], [24, -210], [30, -222], [42, -282], [50, -380]]
      : [[s * 84, -380], [s * 93, -300], [s * 86, -238], [s * 70, -208], [s * 48, -199], [s * 26, -208], [s * 22, -222], [s * 10, -296], [s * 3, -380]];
    const tp = K.S(pts, true, 0.8);
    K.toon(ctx, tp, MT.tr, {
      s: side ? 12 : (s > 0 ? 14 : 9), lw: 2,
      inner: (c) => {
        if (side) {
          K.taper(c, [[-20, -350], [-28, -280], [-30, -230]], 3, '#0b0b10', { alpha: 0.8 });
          K.taper(c, [[30, -300], [20, -250], [6, -214]], 3, '#0b0b10', { alpha: 0.7 });
        } else {
          K.taper(c, [[s * 20, -360], [s * 40, -290], [s * 58, -232]], 3.2, '#0b0b10', { alpha: 0.8 });
          K.taper(c, [[s * 74, -330], [s * 72, -270], [s * 62, -226]], 2.6, '#0b0b10', { alpha: 0.6 });
          K.taper(c, [[s * 30, -224], [s * 48, -214], [s * 66, -222]], 2.6, '#0b0b10', { alpha: 0.7 });
          K.taper(c, [[s * 50, -300], [s * 56, -260]], 4, MT.tr.hl, { alpha: 0.5 });
        }
      },
    });
  }
  function shoeFront(ctx, x, s) {
    const sole = K.S([[x - 23 + s * 2, -14], [x + 23 + s * 2, -14], [x + 25 + s * 3, -6], [x + 22 + s * 3, 0, 1], [x - 22 + s * 3, 0, 1], [x - 25 + s * 2, -6]], true, 0.7);
    K.toon(ctx, sole, MT.sole, { s: 3, lw: 1.6 });
    for (let i = 0; i < 2; i++) K.line(ctx, [[x - 22 + s * 2, -9 + i * 4], [x + 22 + s * 2, -9 + i * 4]], 0.9, '#b3a893', { alpha: 0.9 });
    const up = K.S([[x - 15, -46], [x + 15, -46], [x + 19 + s * 1, -32], [x + 23 + s * 2, -20], [x + 21 + s * 2, -13], [x - 21 + s * 2, -13], [x - 23 + s * 1, -20], [x - 19, -32]], true);
    K.toon(ctx, up, MT.shoe, { s: 7, lw: 1.8 });
    K.line(ctx, [[x - 14, -42], [x + s * 1, -37], [x + 14, -42]], 1.3, '#55566c', { alpha: 0.9 });
    K.line(ctx, [[x + s * 1, -37], [x + s * 2, -14]], 1.4, '#000000', { alpha: 0.7 });
    K.taper(ctx, [[x - 10 + s * 2, -30], [x - 4 + s * 2, -20]], 3, '#55566c', { alpha: 0.6 });
  }
  function shoeBack(ctx, x) {
    const heel = K.S([[x - 18, -46], [x + 18, -46], [x + 21, -16], [x - 21, -16]], true);
    K.toon(ctx, heel, MT.shoe, { s: 6, lw: 1.8 });
    const sole = K.S([[x - 22, -16], [x + 22, -16], [x + 22, 0, 1], [x - 22, 0, 1]], true, 0.6);
    K.toon(ctx, sole, MT.sole, { s: 3, lw: 1.6 });
    K.line(ctx, [[x, -46], [x, -18]], 1.2, '#000', { alpha: 0.6 });
  }
  function shoeSide(ctx) {
    const sole = K.S([[-64, -13], [-50, -16], [24, -15], [26, 0, 1], [-60, 0, 1], [-68, -5]], true, 0.6);
    K.toon(ctx, sole, MT.sole, { s: 3, lw: 1.6 });
    for (let i = 0; i < 2; i++) K.line(ctx, [[-62, -9 + i * 4], [24, -9 + i * 4]], 0.9, '#b3a893');
    const shoe = K.S([[-30, -48], [16, -48], [24, -32], [24, -14], [-64, -13], [-60, -24], [-40, -36]], true, 0.8);
    K.toon(ctx, shoe, MT.shoe, { s: 7, sd: [7, -3], lw: 1.8 });
    K.line(ctx, [[-60, -22], [-40, -34], [-28, -46]], 1.3, '#55566c', { alpha: 0.9 });
  }
  function ruff(ctx, cx, cy, o) {
    // stand-up feather ruff behind the head (front / back views)
    o = o || {};
    const tips = [], n = 17, rA = o.rA || 112, rB = o.rB || 76;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI * (1.0 + i / n);
      const r = i % 2 ? rB : rA + Math.sin(i * 1.7) * 6;
      tips.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.86, 1]);
    }
    const pts = [[cx - 88, cy + 30, 1]].concat(tips).concat([[cx + 88, cy + 30, 1]]);
    const p = K.S(pts, true, 0.3);
    K.part(ctx, p, {
      fill: MT.fe.base, line: MT.fe.line, lw: 2.2,
      under: (c) => {
        for (let i = 0; i <= 18; i++) {
          const a = Math.PI * (0.98 + (1.04 * i) / 18);
          c.save(); c.translate(cx, cy + 14); c.rotate(a + Math.PI / 2);
          feather(c, 0, 18, 26, 100, Math.PI, { base: i % 2 ? '#1f1e2a' : '#191823', sheen: '#5a64a0', edge: '#0a090f', rachis: '#4a4f6e', sheenA: 0.2 });
          c.restore();
        }
        c.save(); c.globalCompositeOperation = 'screen';
        c.strokeStyle = 'rgba(88,102,168,0.35)'; c.lineWidth = 14; c.beginPath(); c.ellipse(cx, cy, rA * 0.72, rA * 0.6, 0, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
        c.restore();
      },
      fx: [{ dx: -12, dy: -4, c: '#000', a: 0.45 }, { dx: -2.4, dy: 0, c: C.rim, a: 0.85 }],
    });
  }
  function poleAndLantern(ctx, PX, dir, o) {
    // dir: +1 crook bends to +x, -1 to -x; o.side: crook seen foreshortened
    o = o || {};
    bamboo(ctx, PX, 0, -892, 12);
    const crook = o.side
      ? [[PX, -886], [PX - 3, -914], [PX - 22, -932], [PX - 48, -932], [PX - 64, -918], [PX - 70, -900]]
      : [[PX, -886], [PX + dir * 3, -914], [PX + dir * 24, -934], [PX + dir * 54, -934], [PX + dir * 74, -918], [PX + dir * 80, -898]];
    const d = o.side ? -1 : dir;
    K.taper(ctx, crook, 13, MT.bam.line, { w0: 1, w1: 0.8, noScale: true });
    K.taper(ctx, crook, 9.5, MT.bam.base, { w0: 1, w1: 0.8, noScale: true });
    K.line(ctx, crook.map((q) => [q[0] - 1, q[1] - 2.5]), 1.4, MT.bam.hl, { alpha: 0.8 });
    const end = crook[crook.length - 1];
    talisman(ctx, PX + d * 28, -932, 14, 62, d * 0.05, 4);
    talisman(ctx, PX + d * 46, -933, 14, 54, -d * 0.04, 6);
    crowHead(ctx, end[0], end[1] + 2, 0.95, d < 0);
    const lx = end[0] - d * 8;
    K.line(ctx, [[lx, end[1] + 6], [lx, -878]], 1.8, C.red);
    lantern(ctx, lx, -878, 72, 88, { sway: d * 3, t1: o.t1, t2: o.t2 });
  }

  // ------------------------------------------------------------------ FRONT VIEW
  function drawFront(ctx, o) {
    o = o || {};
    const PX = 182;
    ruff(ctx, 0, -642);

    // ---- legs
    for (const s of [-1, 1]) {
      legWrap(ctx, [[s * 62, -214], [s * 65, -150], [s * 58, -90], [s * 54, -44]], [[s * 30, -214], [s * 29, -150], [s * 34, -90], [s * 37, -44]], s);
      shoeFront(ctx, s * 46, s);
      trouserLeg(ctx, s);
    }
    // ---- jacket skirt (below sash) with side slits
    const skirt = K.S([[-76, -476], [76, -476], [88, -410], [96, -356, 1], [64, -349], [0, -346], [-64, -349], [-96, -356, 1], [-88, -410]], true, 0.8);
    K.toon(ctx, skirt, MT.ja, {
      s: 12, lw: 2,
      inner: (c) => {
        K.taper(c, [[-92, -356], [-60, -352], [0, -349], [60, -352], [92, -356]], 7, C.red, { w0: 1, w1: 1, noScale: true });
        K.taper(c, [[-24, -440], [-30, -390], [-32, -354]], 2.6, MT.ja.sh2, { alpha: 0.8 });
        K.taper(c, [[36, -430], [42, -385], [44, -354]], 2.6, MT.ja.sh2, { alpha: 0.7 });
      },
    });
    for (const s of [-1, 1]) { K.line(ctx, [[s * 89, -398], [s * 95, -358]], 2, MT.ja.line); K.taper(ctx, [[s * 86, -400], [s * 93, -360]], 4, C.red, { w0: 1, w1: 1, noScale: true }); }

    // ---- sleeves under the mantle
    const armL = K.S([[-98, -600], [-150, -560], [-198, -492], [-192, -470], [-150, -452], [-112, -448], [-108, -470], [-150, -488], [-120, -560]], true, 0.8);
    K.toon(ctx, armL, MT.ja, { s: 10, lw: 2 });
    K.taper(ctx, [[-114, -449], [-110, -468]], 6, C.red, { w0: 1, w1: 1, noScale: true });
    const armR = K.S([[98, -600], [146, -560], [174, -500], [188, -444], [162, -440], [150, -495], [118, -560]], true, 0.8);
    K.toon(ctx, armR, MT.ja, { s: 10, lw: 2 });
    K.taper(ctx, [[162, -442], [188, -446]], 6, C.red, { w0: 1, w1: 1, noScale: true });

    // ---- jacket torso in the mantle opening
    const torso = K.S([[-18, -636], [18, -636], [70, -600], [78, -520], [76, -474], [-76, -474], [-78, -520], [-70, -600]], true);
    K.toon(ctx, torso, MT.ja, {
      s: 12, lw: 2,
      inner: (c) => {
        const flap = [[6, -636], [-6, -614], [-34, -596], [-72, -582]];
        K.taper(c, flap, 7, C.red, { w0: 1, w1: 1, noScale: true });
        K.line(c, flap.map((q) => [q[0] + 1, q[1] + 5]), 1.4, MT.ja.sh2, { alpha: 0.9 });
        K.part(c, K.circle(2, -540, 26), { fill: '#e9e0c8', line: '#4a3a2a', lw: 1.8, fx: [{ dx: -6, dy: -2, c: '#bfb197' }] });
        c.strokeStyle = C.red; c.lineWidth = 3.6; c.beginPath(); c.arc(2, -540, 21, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#1a1418'; c.font = `700 26px ${K.FONT_ZH}`; c.textAlign = 'center'; c.fillText('明', 2, -531);
        K.taper(c, [[-44, -565], [-48, -510], [-46, -478]], 2.6, MT.ja.sh2, { alpha: 0.6 });
      },
    });
    K.knot(ctx, -16, -609, 4.4, C.brass, -0.5);
    K.knot(ctx, -46, -591, 4.4, C.brass, -0.35);
    const collar = K.S([[-20, -646], [20, -646], [22, -630], [-22, -630]], true);
    K.toon(ctx, collar, MT.ja, { s: 4, lw: 1.6 });
    K.taper(ctx, [[-21, -631], [0, -628], [21, -631]], 3.4, C.red, { w0: 1, w1: 1, noScale: true });

    // ---- sash, talismans, token
    const sash = K.S([[-80, -482], [80, -482], [82, -446], [-82, -446]], true, 0.5);
    K.toon(ctx, sash, MT.red, {
      s: 8, lw: 2,
      inner: (c) => { for (const yy of [-473, -463, -454]) K.line(c, [[-80, yy], [-20, yy + 2], [40, yy - 1], [80, yy + 1]], 1.3, MT.red.sh2, { alpha: 0.6 }); },
    });
    const end1 = K.S([[36, -456], [52, -456], [58, -404], [62, -366, 1], [54, -370], [48, -362, 1], [40, -404]], true, 0.7);
    const end2 = K.S([[48, -456], [60, -456], [76, -410], [84, -378, 1], [76, -380], [70, -372, 1], [62, -412]], true, 0.7);
    K.toon(ctx, end2, MT.red, { s: 6, lw: 1.8 });
    K.toon(ctx, end1, MT.red, { s: 6, lw: 1.8 });
    K.part(ctx, K.ell(50, -463, 14, 11.5), { fill: C.red, line: MT.red.line, lw: 1.8, fx: [{ dx: -5, dy: -2, c: MT.red.sh }, { dx: 3, dy: 3, c: MT.red.hl, a: 0.6 }] });
    talisman(ctx, -58, -504, 16, 54, -0.22, 3);
    talisman(ctx, -43, -510, 16, 56, -0.05, 5);
    talisman(ctx, -28, -502, 16, 52, 0.12, 9);
    K.part(ctx, K.S([[-68, -478], [-20, -478], [-20, -452], [-68, -452]], true, 0.4), { fill: C.red, line: MT.red.line, lw: 1.6, fx: [{ dx: -5, dy: 0, c: MT.red.sh }] });
    K.line(ctx, [[-8, -452], [-10, -432], [-12, -420]], 1.6, C.red);
    const tok = K.S([[-27, -422, 1], [3, -422, 1], [5, -382], [-12, -369, 1], [-29, -382]], true, 0.4);
    K.toon(ctx, tok, MT.lac, { s: 6, lw: 1.8 });
    ctx.save(); ctx.fillStyle = '#d6aa52'; ctx.font = `700 12px ${K.FONT_ZH}`; ctx.textAlign = 'center';
    ctx.fillText('長', -12, -405); ctx.fillText('明', -12, -391); ctx.restore();
    K.line(ctx, [[-27, -417], [3, -417]], 1, '#d6aa52');

    // ---- mantle: two front panels, three concentric tiers each
    for (const s of [-1, 1]) {
      const outer = s < 0
        ? [[-15, -640], [-48, -650], [-90, -640], [-124, -618], [-158, -580], [-180, -530], [-202, -488]]
        : [[15, -640], [48, -650], [90, -640], [124, -618], [156, -580], [170, -530], [176, -468]];
      const hemPts = s < 0 ? [[-202, -488], [-160, -468], [-118, -452], [-80, -440]] : [[176, -468], [142, -456], [110, -448], [80, -440]];
      const innerEdge = s < 0 ? [[-80, -440], [-58, -500], [-36, -566], [-16, -630]] : [[80, -440], [58, -500], [36, -566], [16, -630]];
      const hem = jag(hemPts, 6, 30, { seed: s < 0 ? 21 : 34, lean: s * -0.12 });
      const outline = outer.concat(hem.slice(1)).concat(innerEdge.slice(1, -1));
      const tiers = [
        { pts: [[s * 14, -606], [s * 60, -598], [s * 118, -584], [s * 176, -558]], n: 5, depth: 24, yb: -566, seed: s < 0 ? 7 : 17 },
        { pts: [[s * 50, -546], [s * 104, -538], [s * 156, -522], [s * 214, -500]], n: 5, depth: 26, yb: -506, seed: s < 0 ? 12 : 19 },
      ];
      featherPanel(ctx, outline, tiers, { box: s < 0 ? [-220, -665, -10, -420] : [10, -665, 205, -420], fan: s * 260, cx: 0, seed: s < 0 ? 4 : 8, sd: [-14, -5], hemPts });
    }
    // throat clasp
    K.part(ctx, K.circle(0, -628, 9.5), { fill: C.brass, line: MT.br.line, lw: 1.6, fx: [{ dx: -3, dy: -2, c: MT.br.sh }, { dx: 2, dy: 2, c: MT.br.hl, a: 0.7 }] });
    K.taper(ctx, [[-24, -632], [-10, -628]], 4.4, C.red, { w0: 1, w1: 1, noScale: true });
    K.taper(ctx, [[10, -628], [24, -632]], 4.4, C.red, { w0: 1, w1: 1, noScale: true });

    // ---- neck + head
    const neck = K.S([[-17, -676], [17, -676], [19, -636], [0, -630], [-19, -636]], true);
    K.toon(ctx, neck, MT.sk, { s: 8, lw: 1.8 });
    K.clipDo(ctx, neck, (c) => { c.fillStyle = MT.sk.sh2; c.globalAlpha = 0.55; c.beginPath(); c.ellipse(0, -660, 22, 12, 0, 0, Math.PI * 2); c.fill(); });
    K.line(ctx, [[-2, -650], [2, -642]], 1.4, MT.sk.sh2);
    headFront(ctx, { turn: o.turn || 0, expr: o.expr || 'smug' });

    // ---- hands, pole
    hipHand(ctx, -112, -452, false);
    if (!o.noPole) { poleAndLantern(ctx, PX, 1, {}); fistOnPole(ctx, PX, -426, false); }
  }

  // ------------------------------------------------------------------ BACK VIEW
  function drawBack(ctx, o) {
    o = o || {};
    const PX = -182;
    for (const s of [-1, 1]) {
      legWrap(ctx, [[s * 62, -214], [s * 65, -150], [s * 58, -90], [s * 54, -44]], [[s * 30, -214], [s * 29, -150], [s * 34, -90], [s * 37, -44]], -s);
      shoeBack(ctx, s * 47);
      trouserLeg(ctx, s);
    }
    const skirt = K.S([[-80, -476], [80, -476], [90, -410], [96, -356, 1], [0, -347], [-96, -356, 1], [-90, -410]], true, 0.8);
    K.toon(ctx, skirt, MT.ja, {
      s: 12, lw: 2,
      inner: (c) => {
        K.taper(c, [[-94, -356], [0, -349], [94, -356]], 7, C.red, { w0: 1, w1: 1, noScale: true });
        K.line(c, [[0, -430], [0, -350]], 1.6, MT.ja.sh2, { alpha: 0.8 });
      },
    });
    const armR = K.S([[98, -600], [150, -560], [198, -492], [192, -470], [150, -452], [112, -448], [108, -470], [150, -488], [120, -560]], true, 0.8);
    K.toon(ctx, armR, MT.ja, { s: 10, lw: 2 });
    const armL = K.S([[-98, -600], [-146, -560], [-174, -500], [-188, -444], [-162, -440], [-150, -495], [-118, -560]], true, 0.8);
    K.toon(ctx, armL, MT.ja, { s: 10, lw: 2 });
    K.taper(ctx, [[-162, -442], [-188, -446]], 6, C.red, { w0: 1, w1: 1, noScale: true });
    K.toon(ctx, K.S([[-82, -480], [82, -480], [84, -448], [-84, -448]], true, 0.5), MT.red, { s: 8, lw: 2 });
    poleAndLantern(ctx, PX, -1, { t1: '宮', t2: '燈' });

    // head back: ears, skull, nape hair, crest, cap
    const sk = MT.sk;
    for (const s of [-1, 1]) {
      const ear = K.S([[s * 36, -712], [s * 47, -716], [s * 52, -702], [s * 50, -684], [s * 44, -674], [s * 37, -676]], true);
      K.toon(ctx, ear, sk, { s: 4, lw: 1.8 });
      K.line(ctx, [[s * 40, -708], [s * 47, -700], [s * 45, -684]], 1.3, sk.sh2);
    }
    const skull = K.S(K.sym([[0, -760], [20, -758], [34, -748], [40, -726], [41, -700], [37, -676], [26, -660], [0, -654]]), true);
    K.toon(ctx, skull, sk, { s: 8, lw: 2 });
    const nape = K.S([[0, -730], [30, -728], [40, -712], [36, -680], [22, -660], [0, -654], [-22, -660], [-36, -680], [-40, -712], [-30, -734]], true);
    K.toon(ctx, nape, MT.hair, {
      s: 6, hl: false,
      inner: (c) => { for (let i = -3; i <= 3; i++) K.line(c, [[i * 10, -736], [i * 6, -700], [i * 1.5, -664]], 1.2, '#3d3b52', { alpha: 0.75 }); },
    });
    crestFeathers(ctx, [6, -764], [{ a: 0.72, l: 0.78 * U, w: 0.16 * U }, { a: 0.38, l: 0.64 * U, w: 0.15 * U }]);
    const cap = K.S([[-45, -726, 1], [-44, -742], [-37, -756], [-20, -764], [0, -767], [20, -764], [37, -756], [44, -742], [45, -726, 1], [0, -722]], true);
    K.toon(ctx, cap, MT.hair, {
      s: 9, lw: 2.2, fill: '#1c1a22',
      inner: (c) => {
        for (const sx of [-22, 22]) K.line(c, [[sx * 0.1, -767], [sx * 0.8, -755], [sx * 1.15, -736]], 1.6, '#000');
        K.part(c, K.S([[-46, -736], [0, -732], [46, -736], [46, -714], [-46, -714]], true), { fill: '#0f0e14', line: false });
        K.taper(c, [[-30, -756], [-12, -764], [8, -765]], 5, '#6c6a86', { alpha: 0.5 });
      },
    });
    K.part(ctx, K.circle(0, -771, 5.4), { fill: C.red, line: MT.red.line, lw: 1.6, fx: [{ dx: -3, dy: -2, c: MT.red.sh }] });
    // ruff (back), then mantle
    ruff(ctx, 0, -632, { rA: 104, rB: 72 });
    const outer = [[-60, -644], [-100, -634], [-130, -614], [-160, -580], [-176, -530], [-178, -470]];
    const outerR = [[202, -488], [180, -530], [158, -580], [128, -616], [96, -636], [60, -644]];
    const hemPts = [[-178, -470], [-120, -436], [-50, -404], [0, -394], [50, -404], [120, -436], [202, -488]];
    const hem = jag(hemPts, 13, 30, { seed: 41, prof: (t) => 1 + 1.6 * Math.exp(-Math.pow((t - 0.47) / 0.1, 2)) });
    const outline = outer.concat(hem.slice(1)).concat(outerR.slice(1));
    featherPanel(ctx, outline, [
      { pts: [[-190, -548], [-100, -576], [0, -586], [100, -576], [200, -548]], n: 9, depth: 24, yb: -560, seed: 44 },
      { pts: [[-195, -490], [-100, -516], [0, -524], [100, -516], [215, -490]], n: 10, depth: 26, yb: -498, seed: 47 },
    ], { box: [-205, -665, 220, -390], fan: 300, cx: 0, seed: 49, hemPts });
    // back badge
    K.part(ctx, K.circle(0, -466, 30), { fill: '#e9e0c8', line: '#4a3a2a', lw: 2, fx: [{ dx: -6, dy: -2, c: '#bfb197' }] });
    ctx.save(); ctx.strokeStyle = C.red; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, -466, 25, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#1a1418'; ctx.font = `700 30px ${K.FONT_ZH}`; ctx.textAlign = 'center'; ctx.fillText('明', 0, -455); ctx.restore();
    braid(ctx, [[0, -668], [5, -630], [14, -560], [22, -505], [26, -455], [24, -425]], 22, 13, { seg: 15, tail: 30 });
    fistOnPole(ctx, PX, -426, true);
    const th = K.S([[106, -458], [126, -457], [130, -440], [124, -424], [114, -420], [108, -432], [104, -446]], true);
    K.toon(ctx, th, MT.sk, { s: 5, lw: 1.8 });
    K.line(ctx, [[112, -432], [120, -436], [126, -446]], 1.2, MT.sk.sh2, { alpha: 0.8 });
    K.taper(ctx, [[106, -458], [126, -456]], 6, C.red, { w0: 1, w1: 1, noScale: true });
  }

  // ------------------------------------------------------------------ SIDE VIEW (facing left)
  function drawSide(ctx, o) {
    o = o || {};
    poleAndLantern(ctx, -84, 1, { side: true });
    // ruff flaring backward behind the head
    const ruffPts = [[18, -612, 1], [-8, -642, 1], [6, -668], [14, -712, 1], [32, -686], [44, -742, 1], [56, -700], [78, -748, 1], [84, -704], [112, -730, 1], [108, -684], [136, -698, 1], [122, -656], [146, -652, 1], [122, -628], [134, -602, 1], [98, -600]];
    K.part(ctx, K.S(ruffPts, true, 0.3), {
      fill: MT.fe.base, line: MT.fe.line, lw: 2.2,
      under: (c) => {
        for (let i = 0; i < 10; i++) {
          c.save(); c.translate(44, -606); c.rotate(-1.8 + i * 0.2);
          feather(c, 0, -8, 26, -104, 0, { base: i % 2 ? '#1f1e2a' : '#191823', sheen: '#5a64a0', edge: '#0a090f', rachis: '#4a4f6e', sheenA: 0.2 });
          c.restore();
        }
      },
      fx: [{ dx: 12, dy: -4, c: '#000', a: 0.4 }, { dx: -2.4, dy: 0, c: C.rim, a: 0.85 }],
    });
    // legs
    legWrap(ctx, [[-36, -214], [-35, -150], [-30, -90], [-27, -44]], [[24, -214], [33, -160], [22, -96], [14, -44]], 1);
    shoeSide(ctx);
    trouserLeg(ctx, 1, true);
    // jacket skirt
    const skirt = K.S([[-48, -478], [58, -478], [64, -420], [62, -356, 1], [8, -349], [-54, -354, 1], [-52, -410]], true, 0.8);
    K.toon(ctx, skirt, MT.ja, {
      s: 12, sd: [12, -4], lw: 2,
      inner: (c) => {
        K.taper(c, [[-54, -354], [8, -351], [62, -357]], 7, C.red, { w0: 1, w1: 1, noScale: true });
        K.taper(c, [[12, -404], [14, -356]], 4.5, C.red, { w0: 1, w1: 1, noScale: true });
        K.line(c, [[14, -406], [16, -358]], 1.6, MT.ja.line);
      },
    });
    // sash ends + token at the front
    K.toon(ctx, K.S([[-56, -472], [-46, -470], [-54, -384], [-60, -364, 1], [-66, -386]], true, 0.7), MT.red, { s: 5, lw: 1.8 });
    K.toon(ctx, K.S([[-62, -422, 1], [-54, -422, 1], [-54, -376], [-58, -370, 1], [-62, -376]], true, 0.4), MT.lac, { s: 3, lw: 1.6 });
    // near arm (akimbo): forearm under the mantle down to the hip
    const arm = K.S([[-10, -600], [30, -560], [38, -500], [28, -454], [4, -448], [-6, -472], [6, -520], [-6, -570]], true);
    K.toon(ctx, arm, MT.ja, { s: 10, lw: 2 });
    // neck
    const neck = K.S([[-18, -672], [28, -690], [38, -630], [-22, -626]], true);
    K.toon(ctx, neck, MT.sk, { s: 8, sd: [8, -3], lw: 1.8 });
    K.clipDo(ctx, neck, (c) => { c.fillStyle = MT.sk.sh2; c.globalAlpha = 0.5; c.beginPath(); c.ellipse(4, -666, 26, 12, -0.2, 0, Math.PI * 2); c.fill(); });
    // mantle (side)
    const hemPts = [[-64, -462], [0, -446], [50, -428], [94, -410]];
    const hem = jag(hemPts, 7, 30, { seed: 51, lean: 0.25, prof: (t) => 1 + 1.4 * Math.exp(-Math.pow((t - 0.93) / 0.12, 2)) });
    const outline = [[-24, -638], [-42, -620], [-54, -580], [-60, -520]].concat(hem).concat([[98, -470], [90, -545], [70, -608], [36, -648]]);
    featherPanel(ctx, outline, [
      { pts: [[-80, -590], [-20, -592], [40, -586], [110, -566]], n: 6, depth: 24, yb: -575, seed: 53 },
      { pts: [[-80, -528], [0, -522], [60, -510], [115, -490]], n: 6, depth: 26, yb: -510, seed: 57 },
    ], { box: [-75, -665, 120, -400], fan: 0, seed: 55, sd: [12, -4], hemPts });
    // hand on hip (fingers forward), cuff
    const sk = MT.sk;
    const hand = K.S([[4, -458], [26, -458], [18, -438], [-6, -430], [-24, -433], [-30, -441], [-14, -450]], true);
    K.toon(ctx, hand, sk, { s: 4, lw: 1.8 });
    K.line(ctx, [[-10, -442], [-26, -437]], 1, sk.sh2);
    K.taper(ctx, [[6, -460], [26, -458]], 6, C.red, { w0: 1, w1: 1, noScale: true });
    // collar & clasp
    K.toon(ctx, K.S([[-24, -644], [26, -656], [30, -642], [-22, -630]], true), MT.ja, { s: 4, lw: 1.6 });
    K.part(ctx, K.circle(-24, -632, 7.5), { fill: C.brass, line: MT.br.line, lw: 1.5, fx: [{ dx: -2, dy: -2, c: MT.br.sh }] });
    headSide(ctx, { x: 8, y: -H });
    braid(ctx, [[56, -716], [80, -684], [104, -640], [112, -580], [112, -500], [106, -440], [102, -415]], 20, 12, { seg: 15, tail: 30 });
    // far hand on the pole (palm side, fingers wrapped toward camera)
    fistOnPole(ctx, -84, -426, true);
  }

  // ------------------------------------------------------------------ sheet spec
  const theme = {
    bg: '#15121a', paper0: '#f1ebe0', paper1: '#ddd3c3', guide: '#5a4a5a', ink: '#2a2230',
    gold: '#d7a854', mark: '#b8322a', markLine: '#2a2230', title: '#f3ead8', sub: '#b9ad98',
    bust0: '#3a3550', bust1: '#16131d', expr: '#2a2535', silBg: '#e9e2d5', silText: '#5a3a2a',
  };
  const STAGE = [30, 168, 1630, 1012];
  const GROUND = 1112;
  const SPEC = {
    W: 2400, H: 1660, theme, figScale: 0.97,
    title: '墨鴉', titleEn: 'MO YA  —  envoy of 長明宮',
    role: '長明宮跑腿使者 · 第一章頭目／後期再戰 · 喜劇反派 · 約三十出頭',
    concept: '「鴉披簑、辮垂羽」—— 把清代廟口跑腿的「走路仔」穿上一件鴉羽簑肩：上身鼓、下身細，像一隻站著的烏鴉；臉是自以為聰明的得意笑，手上那盞「長明燈」卻透出被困魂魄的冷藍光。',
    conceptEn: 'A Qing-era temple runner (走路仔) wearing a crow-feather mantle cut like a straw rain cape: puffed-up top, skinny bound legs — a crow standing upright. Smug, theatrical, slightly ridiculous; his temple lantern glows the cold blue of trapped souls.',
    badge: 'FINAL DESIGN · v2 · 3D TOON TURNAROUND · 7 HEADS',
    stage: STAGE,
    heads: { u: U, n: 7, ground: GROUND, label: '頭身 HEADS', extra: [{ y: GROUND - 940 * 0.97, label: 'crook top ≈ 8.7 H' }] },
    views: [
      {
        label: '正面', labelEn: 'FRONT', at: [520, GROUND], box: [-240, -965, 300, 30], draw: (c) => drawFront(c), shadowR: 190,
        marks: [
          { n: 1, x: -150, y: -560, dx: -150, dy: -20 },
          { n: 2, x: -80, y: -704, dx: -150, dy: -10 },
          { n: 3, x: -18, y: -752, dx: -212, dy: -40 },
          { n: 5, x: -26, y: -603, dx: -214, dy: 13 },
          { n: 4, x: 2, y: -540, dx: -262, dy: 34 },
          { n: 6, x: -48, y: -478, dx: -222, dy: 8 },
          { n: 7, x: -12, y: -392, dx: -258, dy: 0 },
          { n: 8, x: -60, y: -150, dx: -190, dy: 0 },
          { n: 9, x: 222, y: -840, dx: -84, dy: -36 },
        ],
      },
      {
        label: '側面', labelEn: 'SIDE (right profile)', at: [1010, GROUND], box: [-190, -965, 160, 30], draw: (c) => drawSide(c), shadowR: 130,
        marks: [
          { n: 2, x: 120, y: -700, dx: 60, dy: -30 },
          { n: 1, x: 92, y: -540, dx: 80, dy: 0 },
          { n: 3, x: 108, y: -470, dx: 70, dy: 30 },
        ],
      },
      {
        label: '背面', labelEn: 'BACK', at: [1412, GROUND], box: [-300, -965, 240, 30], draw: (c) => drawBack(c), shadowR: 190,
        marks: [
          { n: 4, x: 26, y: -466, dx: 196, dy: 50 },
          { n: 3, x: 24, y: -430, dx: 196, dy: 100 },
          { n: 1, x: 120, y: -560, dx: 104, dy: -20 },
        ],
      },
    ],
    panel: [1690, 168, 680],
    bottom: [44, 1214, 1616],
    bust: {
      label: '胸像 · 得意', labelEn: 'BUST — default expression: smug', h: 460,
      draw: (c) => drawFront(c, { turn: 0.32, expr: 'smug', noPole: true }), box: [-160, -850, 200, -575], scale: 1.67, offX: 40, offY: 0,
    },
    exprH: 172,
    props: {
      y: 1490, h: 146,
      items: [
        { label: '長明燈 soul lantern', draw: (c) => { K.line(c, [[0, -60], [0, -46]], 1.8, C.red); lantern(c, 0, -46, 72, 88, {}); }, box: [-60, -64, 60, 92], scale: 0.72 },
        { label: '鴉首鉤 crook finial', draw: (c) => { const ck = [[-60, 30], [-57, 2], [-36, -18], [-6, -18], [14, -2], [20, 18]]; K.taper(c, ck, 13, MT.bam.line, { w0: 1, w1: 0.8, noScale: true }); K.taper(c, ck, 9.5, MT.bam.base, { w0: 1, w1: 0.8, noScale: true }); crowHead(c, 20, 20, 1.6, false); }, box: [-70, -30, 72, 46], scale: 1.05 },
        { label: '敕令符 talismans', draw: (c) => { talisman(c, -16, -46, 22, 92, -0.08, 3); talisman(c, 16, -44, 22, 88, 0.08, 7); }, box: [-44, -50, 44, 50], scale: 0.95 },
        { label: '長明宮令牌 token', draw: (c) => token(c, 0, -26, 1.45), box: [-34, -64, 34, 54], scale: 0.85 },
        { label: '號褂圓補 badge', draw: (c) => badge(c, 0, 0, 34), box: [-40, -40, 40, 40], scale: 1.15 },
        { label: '辮梢 queue tip', draw: (c) => braid(c, [[0, -96], [3, -40], [0, 20]], 20, 13, { seg: 15, tail: 30 }), box: [-40, -100, 40, 76], scale: 0.62 },
      ],
    },
    exprs: [
      { label: '奸笑 scheming', draw: (c) => drawFront(c, { turn: 0.2, expr: 'scheme', noPole: true }), box: [-80, -786, 84, -652], scale: 1.33, offX: 0, offY: 0 },
      { label: '暴怒 furious', draw: (c) => drawFront(c, { turn: -0.12, expr: 'angry', noPole: true }), box: [-80, -786, 84, -652], scale: 1.33, offX: 0, offY: 0 },
      { label: '慌了 panicking', draw: (c) => drawFront(c, { turn: 0.0, expr: 'panic', noPole: true }), box: [-80, -786, 84, -652], scale: 1.33, offX: 0, offY: 0 },
    ],
    palette: [
      { c: C.feather, zh: '鴉羽黑', en: 'Crow black', role: 'PRIMARY' },
      { c: C.sheen, zh: '羽光藍紫', en: 'Feather sheen', role: 'SHEEN' },
      { c: C.jacket, zh: '灰靛', en: 'Ash indigo', role: 'SECONDARY' },
      { c: C.red, zh: '廟朱', en: 'Temple vermilion', role: 'ACCENT' },
      { c: C.wrap, zh: '生麻白', en: 'Raw linen', role: 'LIGHT' },
      { c: C.skin, zh: '膚', en: 'Skin', role: 'SKIN' },
      { c: C.glow, zh: '魂火青', en: 'Soul-light', role: 'FX' },
    ],
    callouts: [
      { zh: '鴉羽簑肩（三層，簑衣剪裁，前開）', en: 'Crow-feather mantle cut like a 簑衣 rain cape: 3 tiers, open front, chunky tip hem' },
      { zh: '立羽領', en: 'Stand-up feather ruff: frames the face, reads from the top-down camera' },
      { zh: '瓜皮帽插鴉羽・薙髮留辮', en: 'Six-panel skullcap, red knot, two crow tail feathers; shaved forehead + queue (historical) tipped with red cord & feathers' },
      { zh: '號褂圓補「明」（前胸／後背）', en: 'Runner\'s round badge 「明」, chest and mantle back' },
      { zh: '大襟衫・朱紅滾邊・銅盤扣', en: 'Ash-indigo side-fastened jacket, vermilion piping, brass knot buttons' },
      { zh: '朱紅腰帶・符紙束', en: 'Vermilion sash, tucked bundle of 敕令 talismans' },
      { zh: '長明宮令牌', en: 'Black-lacquer temple token on a red cord' },
      { zh: '綁腿・千層底布鞋', en: 'Linen leg wraps + layered-sole cloth shoes = skinny "crow legs"' },
      { zh: '鴉首燈杖・長明燈', en: 'Black-bamboo crook with carved crow head; ivory 長明 lantern, soul-blue glow' },
    ],
    cols: [
      {
        h: '設計理念', hEn: 'DESIGN RATIONALE · SHAPE & VALUE',
        body: [
          { t: '剪影＝一隻烏鴉：倒三角的羽簑＋立領撐起上半身，綁腿收細下半身，再加一根高過頭的鉤杖與燈。尖角（羽尖、鉤、鴉喙、八字鬍尾）說明他危險，誇張的比例與得意臉說明他好笑。' },
          { t: 'Silhouette = a crow: inverted-triangle mantle and ruff on top, wrapped skinny legs below, a crook taller than him. Sharp shapes (feather tips, hook, beak finial, moustache curls) say "threat"; the exaggerated proportions and smug face say "joke".', en: true },
          { t: '明度：黑（羽簑、褲）／中（灰靛衫）／亮（綁腿、臉、燈）三段分明；唯一重點色是廟朱，魂火青只作光效。' },
          { t: 'Values: dark mantle & trousers / mid ash-indigo jacket / light wraps, face, lantern. One accent (vermilion); soul-blue is light FX only.', en: true },
        ],
      },
      {
        h: '文化依據', hEn: 'CULTURAL BASIS & FANTASY DEPARTURES',
        body: [
          { t: '依據：清代臺灣漢人男裝——大襟衫、寬腳褲、綁腿、千層底布鞋、薙髮留辮；簑衣的分層剪裁；衙役／勇營「號褂」的圓形補子；廟宇符紙與提燈。' },
          { t: 'Based on Qing-era Han Taiwanese menswear (大襟衫, wide trousers, leg wraps, cloth shoes, the queue), the tiered cut of a straw 簑衣, the round character badge of runners\' 號褂, temple talismans and lanterns.', en: true },
          { t: '奇幻處：簑衣改用鴉羽、立羽領、鴉首杖與困魂的長明燈皆為虛構的「長明宮」制服，不指涉任何真實宮廟或神明。' },
          { t: 'Fantasy: the feather mantle, ruff, crow-head crook and soul-trapping lantern are the uniform of the fictional 長明宮 — no real temple or deity is depicted.', en: true },
        ],
      },
      {
        h: '3D 建模／著色', hEn: '3D MODELLING & TOON-SHADER NOTES',
        body: [
          { t: '主體量塊：羽簑做成三層殼狀網格（各層 1 片＋厚度），下緣羽尖用幾何切出（大而少）；單根羽毛紋理、滾邊、盤扣、符文、號褂字皆畫在貼圖上。' },
          { t: 'Mantle = 3 stacked shell meshes with modelled chunky tip hems; individual feathers, piping, knot buttons, script and badge text are texture paint. Queue = 1 tapered mesh + 3 card feathers; lantern & crook = simple lathe/sweep meshes.', en: true },
          { t: '著色：二階 toon（亮／影）＋冷藍邊光；羽毛用 matcap 或各向異性高光做藍紫羽光；燈籠為自發光材質＋bloom。' },
          { t: 'Shader: 2-step toon ramp + cool rim; feathers get an anisotropic/matcap blue-violet sheen; lantern is emissive with bloom. Bones: queue (4), mantle tiers (3×3), ruff (1), tassels.', en: true },
        ],
      },
    ],
    silRef: 995,
    footer: '《彼岸燈》Shorelight · character design pass v2 · 墨鴉 Mo Ya · procedural canvas render (tools/design2/moya.js)',
  };
  G.MOYA = { SPEC, drawFront, drawSide, drawBack, headFront, U, H };
})(window);
