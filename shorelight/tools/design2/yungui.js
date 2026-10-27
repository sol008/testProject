// 彼岸燈 Shorelight — design pass v2 — 雲歸 Yun Gui: 10 concept-sheet options
// Each option = own body ratio, face structure, hairstyle, costume, props, pose. Uses yungui_qingxu_lib.js (DZ).
'use strict';
(() => {
  const { sp, sym, cel, tp, fold, ribbon } = DZ;
  const YG = (window.YG = {});

  // ------------------------------------------------------------ shared garment helpers
  const H = {};
  YG.H = H;
  // long robe body with V-neck notch; o: hem (half-width u), hemY, waist, hip, knee, vY, wave
  H.robe = (B, o = {}) => {
    const u = B.u, hemY = o.hemY !== undefined ? o.hemY : B.gy - 0.42 * u, shK = o.shK || 1;
    const half = [
      [0, o.vY !== undefined ? o.vY : B.chestY - 0.1 * u, 1],
      [0.21 * u, B.shY - 0.36 * u, 1],
      [0.52 * u * shK, B.shY - 0.2 * u],
      [0.95 * u * shK, B.shY + 0.03 * u],
      [0.9 * u * shK, B.shY + 0.75 * u],
      [(o.waist || 0.7) * u, B.waistY],
      [(o.hip || 0.8) * u, B.hipY],
      [(o.knee || 0.98) * u, B.kneeY],
      [(o.hem || 1.12) * u, hemY, 1],
    ];
    const n = o.wave === undefined ? 4 : o.wave;
    for (let i = 1; i <= n; i++) { const t = i / (n + 0.5); half.push([(o.hem || 1.12) * u * (1 - t), hemY + 0.06 * u * Math.sin(t * Math.PI * 0.5) + (i % 2 ? 0.035 * u : 0)]); }
    half.push([0, hemY + 0.08 * u]);
    return sym(B.cx, half);
  };
  // standard vertical robe folds below a waist line
  H.robeFolds = (ctx, B, c, y0, y1, xs, o = {}) => {
    const u = B.u;
    if (DZ.sil) return;
    const shc = DZ.rgba(DZ.dk(c, 0.3), o.a || 0.8), hic = DZ.rgba(DZ.lt(c, 0.25), 0.55);
    xs.forEach((x, i) => {
      const sway = (i % 2 ? 1 : -1) * 0.04 * u + x * 0.08 * u;
      const st = y0 + ((i * 37) % 5) * 0.12 * u;
      DZ.drape(ctx, B.cx + x * u, st, y1 + 0.06 * u, (o.w || 0.2) * u * (1 + (i % 3) * 0.25), sway, shc);
      if (o.hi !== false && i % 2 === 0) fold(ctx, [[B.cx + (x - 0.1) * u, st + 0.5 * u], [B.cx + (x - 0.11) * u + sway * 0.6, (st + y1) / 2 + 0.3 * u], [B.cx + (x - 0.12) * u + sway, y1 - 0.15 * u]], 0.04 * u, hic);
    });
  };
  // crossed collar 交領右衽 bands: inner band (viewer-left neck → X), outer band (viewer-right neck → X → wearer's right side)
  H.crossCollar = (ctx, B, o) => {
    const u = B.u, cx = B.cx, vY = o.vY;
    const w = (o.w || 0.17) * u;
    const nL = [cx - 0.2 * u, B.shY - 0.37 * u], nR = [cx + 0.2 * u, B.shY - 0.37 * u];
    const inner = [nL, [cx - 0.16 * u, B.shY], [cx - 0.04 * u, vY - 0.25 * u], [cx + 0.02 * u, vY + 0.02 * u]];
    const outer = [nR, [cx + 0.15 * u, B.shY], [cx + 0.02 * u, vY - 0.3 * u], [cx - 0.12 * u, vY + 0.1 * u], [cx - 0.42 * u, (o.endY || B.waistY) - 0.15 * u], [cx - (o.endX || 0.62) * u, o.endY || B.waistY]];
    const band = o.band, guard = o.guard;
    const r1 = ribbon(inner, w, w * 0.9);
    cel(ctx, r1, { c: band, s: 1.5, h: 0, rim: 0, lw: 1.3 });
    if (guard) cel(ctx, ribbon(inner.slice(0, 3), w * 0.55, w * 0.5), { c: guard, s: 1, h: 0, rim: 0, lw: 0.9 });
    const r2 = ribbon(outer, w, w);
    cel(ctx, r2, { c: band, s: 2, h: 1, rim: 1, lw: 1.5 });
    if (guard) cel(ctx, ribbon(outer.slice(0, 3).map((q, i) => (i === 2 ? [q[0] + 0.01 * u, q[1] + 0.05 * u] : q)), w * 0.6, w * 0.55), { c: guard, s: 1, h: 0, rim: 0, lw: 0.9 });
    return { inner, outer };
  };
  // back-of-neck collar arc (drawn before the neck)
  H.backCollar = (ctx, B, c) => {
    const u = B.u, cx = B.cx;
    cel(ctx, sp([[cx - 0.24 * u, B.shY - 0.3 * u], [cx - 0.18 * u, B.shY - 0.5 * u], [cx, B.shY - 0.56 * u], [cx + 0.18 * u, B.shY - 0.5 * u], [cx + 0.24 * u, B.shY - 0.3 * u], [cx, B.shY - 0.25 * u]]), { c: DZ.dk(c, 0.25), s: 0, h: 0, rim: 0, lw: 1.2 });
  };
  H.neck = (ctx, B, skin, o = {}) => {
    const u = B.u, cx = B.cx, w = (o.w || 0.15) * u;
    const p = sp([[cx - w, B.chin - 0.25 * u], [cx + w, B.chin - 0.25 * u], [cx + w * 1.05, B.shY - 0.2 * u], [cx + w * 1.6, B.shY + 0.05 * u], [cx, B.shY + 0.25 * u], [cx - w * 1.6, B.shY + 0.05 * u], [cx - w * 1.05, B.shY - 0.2 * u]]);
    cel(ctx, p, {
      c: skin, s: 0.05 * u, sh: DZ.dk(skin, 0.2), h: 0, rim: 0, lw: 1.4, ln: DZ.mix(DZ.ln(skin), '#5a2a22', 0.4),
      fx: (c) => { c.fillStyle = DZ.rgba(DZ.dk(skin, 0.3), 0.6); c.fill(sp([[cx - w * 1.2, B.chin - 0.1 * u], [cx + w * 1.2, B.chin - 0.1 * u], [cx + w, B.chin + 0.12 * u], [cx, B.chin + 0.18 * u], [cx - w, B.chin + 0.12 * u]])); },
    });
    if (o.adam && !DZ.sil) DZ.line(ctx, [[cx - 0.02 * u, B.chin + 0.22 * u], [cx, B.chin + 0.27 * u], [cx + 0.02 * u, B.chin + 0.22 * u]], 0.9, DZ.rgba(DZ.ln(skin), 0.5));
  };
  // shoes, front view; type: cloud (雲履) | cloth (布鞋) | straw (草鞋) | clog (柴屐) | boot (靴)
  H.shoes = (ctx, B, o = {}) => {
    const u = B.u, gy = B.gy, sp0 = (o.spread || 0.3) * u;
    for (const sx of [-1, 1]) {
      const x = B.cx + sx * sp0 + (o.dx || 0) * u * sx, w = (o.w || 0.17) * u, h = (o.h || 0.3) * u;
      if (o.sock) cel(ctx, sp([[x - w * 0.8, gy - h * 1.6], [x + w * 0.8, gy - h * 1.6], [x + w * 0.85, gy - h * 0.5], [x - w * 0.85, gy - h * 0.5]]), { c: o.sock, s: 1.5, h: 0, rim: 0, lw: 1.2 });
      if (o.type === 'straw' || o.type === 'clog') {
        // bare foot + sandal
        const skin = o.skin;
        cel(ctx, sp([[x - w * 0.75, gy - h * 1.3], [x + w * 0.75, gy - h * 1.3], [x + w * 0.95, gy - h * 0.4], [x + w * 1.05, gy - h * 0.12], [x + w * 0.6, gy - h * 0.02], [x - w * 0.6, gy - h * 0.02], [x - w * 1.0, gy - h * 0.15], [x - w * 0.95, gy - h * 0.4]]), { c: skin, s: 2, sh: DZ.dk(skin, 0.2), h: 0, rim: 0, lw: 1.2, ln: DZ.mix(DZ.ln(skin), '#5a2a22', 0.4) });
        if (!DZ.sil) for (let i = 0; i < 4; i++) DZ.line(ctx, [[x + sx * 0 + (i - 1.5) * w * 0.42, gy - h * 0.3], [x + (i - 1.5) * w * 0.44, gy - h * 0.06]], 0.8, DZ.rgba(DZ.ln(skin), 0.45));
        if (o.type === 'straw') {
          cel(ctx, sp([[x - w * 1.1, gy - h * 0.1], [x + w * 1.1, gy - h * 0.1], [x + w * 1.05, gy + h * 0.06], [x - w * 1.05, gy + h * 0.06]]), { c: o.c || '#c9a86a', s: 1, h: 0, rim: 0, lw: 1.1 });
          DZ.stroke(ctx, sp([[x - w * 0.9, gy - h * 0.1], [x, gy - h * 0.6], [x + w * 0.9, gy - h * 0.1]], false), 2.4, o.c || '#c9a86a');
          DZ.stroke(ctx, sp([[x - w * 0.9, gy - h * 0.1], [x, gy - h * 0.6], [x + w * 0.9, gy - h * 0.1]], false), 0.8, DZ.dk(o.c || '#c9a86a', 0.5));
        } else {
          cel(ctx, DZ.poly([[x - w * 1.05, gy - h * 0.06], [x + w * 1.05, gy - h * 0.06], [x + w * 1.0, gy + h * 0.08], [x - w * 1.0, gy + h * 0.08]]), { c: o.c || '#8a6a44', s: 1, h: 0, rim: 0, lw: 1.1 });
          cel(ctx, DZ.poly([[x - w * 0.8, gy + h * 0.08], [x - w * 0.5, gy + h * 0.08], [x - w * 0.5, gy + h * 0.32], [x - w * 0.8, gy + h * 0.32]]), { c: DZ.dk(o.c || '#8a6a44', 0.3), s: 0, h: 0, rim: 0, lw: 1 });
          cel(ctx, DZ.poly([[x + w * 0.5, gy + h * 0.08], [x + w * 0.8, gy + h * 0.08], [x + w * 0.8, gy + h * 0.32], [x + w * 0.5, gy + h * 0.32]]), { c: DZ.dk(o.c || '#8a6a44', 0.3), s: 0, h: 0, rim: 0, lw: 1 });
          DZ.stroke(ctx, sp([[x - w * 0.85, gy - h * 0.06], [x, gy - h * 0.55], [x + w * 0.85, gy - h * 0.06]], false), 2.6, o.strap || '#3a2a24');
        }
        continue;
      }
      const c = o.c || '#24222a';
      const upper = sp([[x - w * 0.7, gy - h * (o.type === 'boot' ? 2.6 : 1.05)], [x + w * 0.7, gy - h * (o.type === 'boot' ? 2.6 : 1.05)], [x + w * 0.95, gy - h * 0.45], [x + w * 1.05, gy - h * 0.1], [x - w * 1.05, gy - h * 0.1], [x - w * 0.95, gy - h * 0.45]]);
      cel(ctx, upper, { c, s: 2.5, h: 1.2, rim: 1.4, lw: 1.5 });
      cel(ctx, DZ.poly([[x - w * 1.1, gy - h * 0.16], [x + w * 1.1, gy - h * 0.16], [x + w * 1.05, gy + h * 0.02], [x - w * 1.05, gy + h * 0.02]]), { c: o.sole || '#ece6da', s: 1, h: 0, rim: 0, lw: 1.1 });
      if (o.type === 'cloud' && !DZ.sil) { // upturned cloud-scroll toe
        cel(ctx, sp([[x - w * 0.42, gy - h * 0.3], [x - w * 0.3, gy - h * 0.72], [x, gy - h * 0.85], [x + w * 0.3, gy - h * 0.72], [x + w * 0.42, gy - h * 0.3]]), { c: o.toe || DZ.lt(c, 0.15), s: 1, h: 0.8, rim: 0, lw: 1.1 });
        DZ.stroke(ctx, sp([[x - w * 0.18, gy - h * 0.45], [x, gy - h * 0.66], [x + w * 0.18, gy - h * 0.45]], false), 1, DZ.ln(c));
      }
    }
  };
  // hanging wide sleeve (廣袖). side ±1. o: top (shoulder top x), out (outer bottom x u), bot (bottom y), wristY, cuff, lining
  H.sleeveHang = (ctx, B, side, o) => {
    const u = B.u, cx = B.cx, s = side;
    const X = (f) => cx + s * f * u;
    const wy = o.wristY || B.crotchY - 0.05 * u, by = o.bot || wy + 0.7 * u;
    const outer = o.out || 1.45;
    const pts = [
      [X(0.52), B.shY - 0.2 * u],
      [X(0.98), B.shY + 0.0 * u],
      [X(1.12), B.shY + 0.45 * u],
      [X(outer - 0.12), wy - 0.6 * u],
      [X(outer), by - 0.25 * u],
      [X(outer - 0.18), by],
      [X(0.98), by + 0.04 * u],
      [X(o.inBot || 0.82), by - 0.2 * u],
      [X(o.inX || 0.8), wy - 0.2 * u],
      [X(0.76), B.shY + 0.85 * u],
    ];
    const p = sp(pts);
    cel(ctx, p, {
      c: o.c, s: o.s || 0.16 * u, sd: [s, 0.3], h: 2, rim: 1.8, lw: 2,
      fx: (c) => {
        if (DZ.sil) return;
        const fs = DZ.rgba(DZ.dk(o.c, 0.32), 0.7);
        fold(c, [[X(1.0), B.shY + 0.3 * u], [X(1.12), wy - 0.6 * u], [X(1.2), by - 0.1 * u]], 0.1 * u, fs);
        fold(c, [[X(0.88), B.shY + 0.9 * u], [X(0.95), wy - 0.3 * u], [X(0.92), by - 0.15 * u]], 0.08 * u, fs);
        fold(c, [[X(1.1), wy - 0.15 * u], [X(1.25), wy + 0.25 * u], [X(1.32), by - 0.05 * u]], 0.07 * u, fs);
        // cuff opening (front edge) with lining
        const cuff = sp([[X(o.inX || 0.8) , wy - 0.12 * u], [X(1.05), wy + 0.06 * u], [X(outer - 0.05), wy - 0.05 * u], [X(outer + 0.05), wy + 0.12 * u], [X(1.05), wy + 0.3 * u], [X(0.82), wy + 0.12 * u]]);
        c.fillStyle = o.lining || DZ.dk(o.c, 0.5); c.fill(cuff);
        if (o.band) { c.lineWidth = 0.09 * u; c.strokeStyle = o.band; c.stroke(sp([[X(o.inX || 0.8), wy - 0.12 * u], [X(1.05), wy + 0.06 * u], [X(outer - 0.05), wy - 0.05 * u]], false)); }
      },
    });
    return { wrist: [X(0.98), wy + 0.04 * u] };
  };
  // hair lock (tapered, cel shaded)
  H.lock = (ctx, pts, w0, w1, hc, o = {}) => {
    const p = ribbon(pts, w0, w1, o.wm);
    cel(ctx, p, { c: hc.c, sh: hc.sh, s: o.s || 1.6, sd: o.sd || [1, 0.2], h: o.h === undefined ? 0 : o.h, hi: hc.hi, rim: o.rim === undefined ? 1 : o.rim, rimC: hc.rim, lw: o.lw || 1.3, ln: hc.ln });
    return p;
  };
  // hair mass made of several pieces: outer contour only (stroke-under trick), per-piece cel shading
  H.hair = (ctx, paths, hc, o = {}) => {
    if (!DZ.sil) { ctx.save(); ctx.lineWidth = (o.lw || 1.7) * 2 * DZ.k; ctx.strokeStyle = hc.ln; ctx.lineJoin = 'round'; paths.forEach((p) => ctx.stroke(p)); ctx.restore(); }
    paths.forEach((p, i) => cel(ctx, p, { c: (o.cols && o.cols[i]) || hc.c, sh: hc.sh, s: o.s || 2.4, sd: o.sd || [1, 0.35], h: 0, rim: o.rim === undefined ? 1.2 : o.rim, rimC: hc.rim, lw: 0, fx: o.fx ? (c) => o.fx(c, i, p) : null }));
  };
  // strands inside a hair mass
  H.strands = (ctx, list, hc, w = 1.2) => { if (DZ.sil) return; list.forEach((pts, i) => DZ.tp(ctx, pts, w * 0.2, 0.2, DZ.rgba(i % 3 ? hc.sh : hc.hi, i % 3 ? 0.9 : 0.8), w)); };
  // satchel / pouch
  H.pouch = (ctx, x, y, w, h, c, o = {}) => {
    const body = sp([[x - w / 2, y], [x + w / 2, y], [x + w * 0.55, y + h * 0.6], [x + w * 0.4, y + h], [x - w * 0.4, y + h], [x - w * 0.55, y + h * 0.6]]);
    cel(ctx, body, { c, s: w * 0.14, h: 1, rim: 1.2, lw: 1.5 });
    const flap = sp([[x - w * 0.52, y - 1], [x + w * 0.52, y - 1], [x + w * 0.46, y + h * 0.42], [x, y + h * 0.55], [x - w * 0.46, y + h * 0.42]]);
    cel(ctx, flap, { c: o.flap || DZ.dk(c, 0.15), s: w * 0.08, h: 1, rim: 1, lw: 1.4, fx: (cc) => { if (o.mark) o.mark(cc); } });
    if (!DZ.sil) { DZ.stroke(ctx, sp([[x - w * 0.42, y + h * 0.38], [x, y + h * 0.48], [x + w * 0.42, y + h * 0.38]], false), 0.8, DZ.rgba(DZ.lt(c, 0.4), 0.8), [2, 2]); }
    if (o.knot) cel(ctx, DZ.ell(x, y + h * 0.52, w * 0.09, w * 0.09), { c: o.knot, s: 1, h: 0.5, rim: 0, lw: 1 });
  };

  // limb tube along pts (sleeve or bare arm/leg)
  H.limb = (ctx, pts, w0, w1, c, o = {}) => {
    const p = ribbon(pts, w0, w1, o.wm);
    cel(ctx, p, { c, s: o.s === undefined ? 3 : o.s, sd: o.sd || [1, 0.3], sh: o.sh, h: o.h || 0, rim: o.rim === undefined ? 1.2 : o.rim, lw: o.lw || 1.6, ln: o.ln, fx: o.fx });
    return p;
  };
  H.skinLimb = (ctx, pts, w0, w1, skin, o = {}) => H.limb(ctx, pts, w0, w1, skin, Object.assign({ sh: DZ.skinSh(skin), ln: DZ.skinLn(skin), rim: 0, lw: 1.4 }, o));
  // wide trousers 大褲. o: c, hemY, feet [xl,xr], wHem (u), kneeW (u)
  H.trousers = (ctx, B, o) => {
    const u = B.u, cx = B.cx;
    for (const s of [-1, 1]) {
      const fx = o.feet ? o.feet[s < 0 ? 0 : 1] : cx + s * 0.3 * u;
      const kx = (cx + s * 0.38 * u + fx) / 2, hy = o.hemY, wh = (o.wHem || 0.3) * u, kw = (o.kneeW || 0.36) * u;
      const pts = [[cx, B.waistY], [cx + s * 0.68 * u, B.waistY], [cx + s * 0.8 * u, B.hipY + 0.2 * u], [kx + s * kw, B.kneeY], [fx + s * wh, hy, 1], [fx - s * wh * 0.85, hy + 0.03 * u, 1], [kx - s * kw * 0.7, B.kneeY], [cx + s * 0.04 * u, B.crotchY + 0.15 * u]];
      const p = sp(pts);
      cel(ctx, p, {
        c: o.c, s: 0.12 * u, sd: [1, 0.2], h: 1.5, rim: 1.5, lw: 1.8,
        fx: (c) => {
          if (DZ.sil) return;
          const fs = DZ.rgba(DZ.dk(o.c, 0.3), 0.75);
          fold(c, [[cx + s * 0.2 * u, B.crotchY + 0.1 * u], [kx, B.kneeY - 0.4 * u], [kx + s * 0.05 * u, B.kneeY + 0.1 * u]], 0.08 * u, fs);
          fold(c, [[kx - s * 0.2 * u, B.kneeY + 0.05 * u], [kx, B.kneeY + 0.12 * u], [kx + s * 0.25 * u, B.kneeY]], 0.05 * u, fs);
          DZ.drape(c, fx + s * 0.05 * u, B.kneeY + 0.2 * u, hy, 0.18 * u, s * 0.02 * u, fs);
          if (o.rolled) { c.fillStyle = DZ.rgba(DZ.lt(o.c, 0.1), 1); c.fill(DZ.poly([[fx - wh * 1.2, hy - 0.16 * u], [fx + wh * 1.2, hy - 0.18 * u], [fx + wh * 1.2, hy + 0.1 * u], [fx - wh * 1.2, hy + 0.1 * u]])); DZ.line(c, [[fx - wh, hy - 0.16 * u], [fx + wh, hy - 0.18 * u]], 1.2, DZ.ln(o.c)); }
        },
      });
    }
  };
  // leg wrap 綁腿 / bare shin from y0 to y1 at x
  H.legwrap = (ctx, B, x, y0, y1, w0, w1, c, o = {}) => {
    const u = B.u;
    const p = sp([[x - w0 / 2, y0], [x + w0 / 2, y0], [x + w0 * 0.45, (y0 + y1) / 2], [x + w1 / 2, y1], [x - w1 / 2, y1], [x - w0 * 0.5, (y0 + y1) / 2]]);
    cel(ctx, p, {
      c, s: w0 * 0.22, h: 1, rim: 1, lw: 1.5, sh: o.sh, ln: o.ln,
      fx: (cc) => { if (DZ.sil || o.bare) return; for (let y = y0 + 0.1 * u; y < y1 - 0.03 * u; y += 0.13 * u) DZ.line(cc, [[x - w0 / 2, y + 0.07 * u], [x + w0 / 2, y - 0.03 * u]], 1, DZ.rgba(DZ.dk(c, 0.4), 0.8)); },
    });
  };
  // knot button 盤扣
  H.knot = (ctx, x, y, s, c) => {
    if (DZ.sil) return;
    ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = s * 0.35; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - s * 1.6, y); ctx.lineTo(x + s * 1.6, y); ctx.stroke();
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, s * 0.6, 0, 7); ctx.fill();
    ctx.restore();
  };
  // short jacket (對襟 centre-opening or 大襟 side-fastened). o: c, hemY, wHem, trim, type, buttons
  H.jacket = (ctx, B, o) => {
    const u = B.u, cx = B.cx, hy = o.hemY;
    const half = [[0, B.shY - 0.33 * u], [0.2 * u, B.shY - 0.36 * u, 1], [0.52 * u, B.shY - 0.2 * u], [0.95 * u * (o.shK || 1), B.shY + 0.03 * u], [0.9 * u, B.shY + 0.75 * u], [(o.waist || 0.68) * u, B.waistY], [(o.wHem || 0.8) * u, hy, 1], [0.4 * u, hy + 0.02 * u], [0, hy + 0.03 * u]];
    const p = sym(cx, half);
    cel(ctx, p, {
      c: o.c, s: 0.18 * u, sd: [1, 0.15], h: 2, rim: 1.8, lw: 2,
      fx: (c) => {
        if (DZ.sil) return;
        const fs = DZ.rgba(DZ.dk(o.c, 0.28), 0.7);
        fold(c, [[cx + 0.5 * u, B.shY + 0.45 * u], [cx + 0.42 * u, B.chestY + 0.35 * u], [cx + 0.4 * u, B.waistY]], 0.07 * u, fs);
        fold(c, [[cx - 0.55 * u, B.shY + 0.5 * u], [cx - 0.45 * u, B.chestY + 0.35 * u], [cx - 0.42 * u, B.waistY]], 0.07 * u, fs);
        if (o.type === 'da') {
          const edge = [[cx, B.shY - 0.33 * u], [cx - 0.25 * u, B.shY - 0.1 * u], [cx - 0.55 * u, B.shY + 0.3 * u], [cx - 0.62 * u, B.chestY + 0.2 * u], [cx - 0.64 * u, hy]];
          DZ.tp(c, edge, 0.08 * u, 0.08 * u, o.trim || DZ.dk(o.c, 0.5));
          (o.buttons || [[cx - 0.18 * u, B.shY - 0.18 * u], [cx - 0.5 * u, B.shY + 0.25 * u], [cx - 0.62 * u, B.chestY + 0.15 * u], [cx - 0.64 * u, B.waistY - 0.1 * u]]).forEach((q) => H.knot(c, q[0], q[1], 0.06 * u, o.btn || o.trim));
        } else {
          DZ.tp(c, [[cx, B.shY - 0.33 * u], [cx, hy + 0.03 * u]], 0.1 * u, 0.1 * u, o.trim || DZ.dk(o.c, 0.5));
          DZ.line(c, [[cx, B.shY - 0.33 * u], [cx, hy + 0.03 * u]], 1, DZ.ln(o.c));
          const n = o.nb || 5;
          for (let i = 0; i < n; i++) H.knot(c, cx, B.shY - 0.15 * u + i * ((hy - B.shY) - 0.1 * u) / n, 0.06 * u, o.btn || o.trim);
        }
        if (o.fx) o.fx(c);
      },
    });
    // stand collar
    cel(ctx, sp([[cx - 0.22 * u, B.shY - 0.36 * u], [cx - 0.2 * u, B.shY - 0.5 * u], [cx + 0.2 * u, B.shY - 0.5 * u], [cx + 0.22 * u, B.shY - 0.36 * u], [cx, B.shY - 0.3 * u]]), { c: o.trim || DZ.dk(o.c, 0.5), s: 1, h: 0, rim: 0, lw: 1.3 });
    return p;
  };

  // ------------------------------------------------------------ options
  YG.options = [];
  const OPT = (o) => YG.options.push(o);

  // ============================================================ 01 太虛青灰 — canon
  OPT({
    zh: '太虛青灰', en: 'Taixu Blue-grey', tag: '原設定・史實底 Canon / grounded',
    idea: '原設定的「標準答案」：洗到褪色的灰藍道袍、白護領、太極絛，扇子扛在肩上——一個把規矩穿得很隨便的正一道士。',
    shape: '細長直線＋下垂廣袖：瘦高、肩一高一低的「懶」姿態；圓扇頭與葫蘆是唯一的圓形，集中在腰與肩。',
    culture: '正一派日常道袍：交領右衽、白護領、廣袖、白襪雲履；清代「儒降道不降」，道士得以不薙髮、留髮挽髻戴冠。幻想處：太極絛改為寬腰帶加太極牌、木冠刻雷紋。',
    ratio: 7, H: 392, bg: ['#dfe4e6', '#b9c3c9'], accent: '#56708a',
    palette: [['灰藍道袍 Robe', '#7f93a6'], ['深靛 Collar band', '#3d4a63'], ['白護領 Guard collar', '#efeadf'], ['墨黑髮 Hair', '#25242e'], ['葫蘆褐 Gourd', '#c48a3c'], ['膚 Skin', '#efd0b4'], ['朱砂 Cinnabar accent', '#b8352a']],
    bust: { y: -0.3, z: 1.7 },
    frame: { sh: 0.92 },
    draw(ctx, B, o) {
      const u = B.u, cx = B.cx, hb = B.top;
      const robeC = '#7f93a6', band = '#3d4a63', guard = '#efeadf', skin = '#efd0b4';
      const hc = { c: '#25242e', sh: '#121119', hi: '#525a78', ln: '#0c0b10', rim: '#a9bdd8' };
      const tilt = -0.07, vY = B.chestY - 0.08 * u, hemY = B.gy - 0.4 * u, sy = B.waistY - 0.05 * u;
      const headT = () => { ctx.save(); ctx.translate(cx, B.chin); ctx.rotate(tilt); ctx.translate(-cx, -B.chin); };
      // back hair
      headT();
      cel(ctx, sp([[cx - 0.46 * u, hb + 0.35 * u], [cx - 0.52 * u, hb + 0.95 * u], [cx - 0.6 * u, B.shY + 0.4 * u], [cx - 0.5 * u, B.chestY + 0.45 * u, 1], [cx - 0.36 * u, B.chestY + 0.15 * u], [cx - 0.2 * u, B.chestY + 0.55 * u, 1], [cx, B.chestY + 0.3 * u], [cx + 0.25 * u, B.chestY + 0.62 * u, 1], [cx + 0.4 * u, B.chestY + 0.2 * u], [cx + 0.56 * u, B.chestY + 0.5 * u, 1], [cx + 0.64 * u, B.shY + 0.4 * u], [cx + 0.54 * u, hb + 0.95 * u], [cx + 0.47 * u, hb + 0.35 * u], [cx, hb - 0.05 * u]]), { c: DZ.dk(hc.c, 0.15), sh: hc.sh, s: 4, h: 0, rim: 1.5, rimC: hc.rim, lw: 1.6, ln: hc.ln });
      ctx.restore();
      H.backCollar(ctx, B, band);
      H.neck(ctx, B, skin, { adam: true, w: 0.14 });
      cel(ctx, sp([[cx - 0.24 * u, B.shY - 0.32 * u], [cx + 0.24 * u, B.shY - 0.32 * u], [cx + 0.3 * u, vY + 0.2 * u], [cx - 0.3 * u, vY + 0.2 * u]]), { c: '#e9e4d8', s: 2, h: 0, rim: 0, lw: 1.2, fx: (c) => { DZ.line(c, [[cx - 0.13 * u, B.shY - 0.24 * u], [cx + 0.03 * u, vY - 0.02 * u]], 1, '#b8b0a0'); } });
      H.shoes(ctx, B, { type: 'cloud', c: '#26252d', sole: '#ebe5d8', spread: 0.25, sock: '#f1ede4', w: 0.16 });
      // robe
      const robe = H.robe(B, { vY, hemY, hem: 1.04, waist: 0.62, hip: 0.74, knee: 0.9, shK: 0.95 });
      cel(ctx, robe, {
        c: robeC, s: 0.22 * u, sd: [1, 0.1], h: 2.5, rim: 2, lw: 2.1, grad: [0, B.waistY, 0, B.gy, 0.3],
        fx: (c) => {
          H.robeFolds(c, B, robeC, B.waistY + 0.35 * u, hemY, [-0.68, -0.3, 0.12, 0.5], { w: 0.2 });
          const fs = DZ.rgba(DZ.dk(robeC, 0.3), 0.6);
          fold(c, [[cx + 0.5 * u, B.shY + 0.4 * u], [cx + 0.4 * u, B.chestY + 0.3 * u], [cx + 0.25 * u, B.waistY - 0.12 * u]], 0.07 * u, fs);
          fold(c, [[cx - 0.55 * u, B.shY + 0.5 * u], [cx - 0.42 * u, B.chestY + 0.35 * u], [cx - 0.3 * u, B.waistY - 0.12 * u]], 0.07 * u, fs);
          for (const k of [-1, 1]) fold(c, [[cx + k * 0.15 * u, sy - 0.3 * u], [cx + k * 0.3 * u, sy - 0.2 * u], [cx + k * 0.5 * u, sy - 0.15 * u]], 0.05 * u, fs);
          DZ.drape(c, cx - 0.47 * u, B.waistY + 0.1 * u, hemY + 0.05 * u, 0.16 * u, -0.03 * u, DZ.rgba(DZ.dk(robeC, 0.38), 0.55));
          DZ.line(c, [[cx - 0.44 * u, B.waistY + 0.1 * u], [cx - 0.47 * u, B.kneeY], [cx - 0.45 * u, hemY + 0.08 * u]], 1.3, DZ.ln(robeC));
          if (!DZ.sil) { c.save(); c.beginPath(); c.rect(cx - 3 * u, B.kneeY + 0.6 * u, 6 * u, 3 * u); c.clip(); DZ.crescent(c, robe, [0, 0.16 * u], DZ.rgba(band, 0.92)); c.restore(); }
        },
      });
      H.crossCollar(ctx, B, { vY, band, guard, endY: B.waistY, endX: 0.56 });
      // 太極絛 sash + tails
      const sash = sp([[cx - 0.64 * u, sy - 0.11 * u], [cx, sy - 0.14 * u], [cx + 0.66 * u, sy - 0.1 * u], [cx + 0.68 * u, sy + 0.12 * u], [cx, sy + 0.1 * u], [cx - 0.66 * u, sy + 0.13 * u]]);
      cel(ctx, sash, { c: '#2b2a33', s: 2, h: 1, rim: 1.5, lw: 1.6, fx: (c) => { if (!DZ.sil) DZ.line(c, [[cx - 0.64 * u, sy - 0.0 * u], [cx + 0.66 * u, sy + 0.01 * u]], 0.8, '#d9d2c2', [3, 3]); } });
      const sc = { c: '#2b2a33', sh: '#17161c', ln: '#0c0b10', rim: '#8fa2bd' };
      H.lock(ctx, [[cx + 0.1 * u, sy + 0.04 * u], [cx + 0.16 * u, sy + 0.5 * u], [cx + 0.13 * u, sy + 0.95 * u]], 0.15 * u, 0.13 * u, sc);
      H.lock(ctx, [[cx + 0.2 * u, sy + 0.04 * u], [cx + 0.3 * u, sy + 0.45 * u], [cx + 0.3 * u, sy + 0.8 * u]], 0.14 * u, 0.12 * u, sc);
      if (!DZ.sil) { ctx.fillStyle = '#d9d2c2'; ctx.fillRect(cx + 0.07 * u, sy + 0.88 * u, 0.13 * u, 0.035 * u); ctx.fillRect(cx + 0.24 * u, sy + 0.73 * u, 0.12 * u, 0.035 * u); }
      DZ.taiji(ctx, cx + 0.02 * u, sy, 0.15 * u, '#f0ead8', '#1d1b22', 0.4);
      // pouch + gourd
      H.pouch(ctx, cx - 0.54 * u, sy + 0.12 * u, 0.4 * u, 0.48 * u, '#8a6a46', { flap: '#6e5236', knot: '#b8352a', mark: (c) => DZ.fu(c, cx - 0.54 * u, sy + 0.3 * u, 0.09 * u, 0.18 * u, 0, {}) });
      DZ.fu(ctx, cx - 0.46 * u, sy + 0.06 * u, 0.11 * u, 0.34 * u, 0.2);
      DZ.gourd(ctx, cx + 0.58 * u, sy + 0.06 * u, 0.9 * u, '#c48a3c', '#b8352a', -0.08);
      // left (viewer-right) hanging sleeve + hand
      const sl = H.sleeveHang(ctx, B, 1, { c: robeC, out: 1.36, lining: '#e6e0d2', band, wristY: B.crotchY - 0.1 * u, bot: B.crotchY + 0.55 * u });
      DZ.hand(ctx, sl.wrist[0] - 0.06 * u, sl.wrist[1] - 0.04 * u, 0.1, 0.7 * u, 'relax', -1, skin);
      // right (viewer-left) raised arm: sleeve slid to the elbow, bare forearm, fan on shoulder
      const E = [cx - 1.08 * u, B.waistY - 0.42 * u], W = [cx - 0.6 * u, B.shY + 0.55 * u];
      const slR = sp([[cx - 0.5 * u, B.shY - 0.2 * u], [cx - 0.93 * u, B.shY], [cx - 1.15 * u, B.shY + 0.55 * u], [cx - 1.3 * u, B.waistY - 0.3 * u], [cx - 1.45 * u, B.waistY + 0.3 * u], [cx - 1.4 * u, B.hipY + 0.35 * u], [cx - 1.2 * u, B.hipY + 0.42 * u], [cx - 1.0 * u, B.waistY + 0.25 * u], [cx - 0.93 * u, B.waistY - 0.35 * u], [cx - 0.76 * u, B.shY + 0.8 * u]]);
      cel(ctx, slR, {
        c: robeC, s: 0.13 * u, sd: [1, 0.4], h: 2, rim: 1.8, lw: 2,
        fx: (c) => {
          if (DZ.sil) return;
          const fs = DZ.rgba(DZ.dk(robeC, 0.32), 0.7);
          fold(c, [[cx - 0.98 * u, B.shY + 0.3 * u], [cx - 1.12 * u, B.shY + 0.8 * u], [cx - 1.2 * u, B.waistY - 0.3 * u]], 0.08 * u, fs);
          DZ.drape(c, cx - 1.22 * u, B.waistY - 0.1 * u, B.hipY + 0.4 * u, 0.22 * u, -0.05 * u, fs);
          c.fillStyle = DZ.dk(robeC, 0.5); c.fill(sp([[cx - 1.24 * u, B.waistY - 0.5 * u], [cx - 1.04 * u, B.waistY - 0.66 * u], [cx - 0.9 * u, B.waistY - 0.46 * u], [cx - 1.08 * u, B.waistY - 0.26 * u]]));
          c.lineWidth = 0.07 * u; c.strokeStyle = band; c.stroke(sp([[cx - 1.27 * u, B.waistY - 0.47 * u], [cx - 1.04 * u, B.waistY - 0.68 * u], [cx - 0.88 * u, B.waistY - 0.45 * u]], false));
        },
      });
      cel(ctx, ribbon([[E[0], E[1]], [(E[0] + W[0]) / 2 - 0.02 * u, (E[1] + W[1]) / 2 + 0.03 * u], W], 0.25 * u, 0.17 * u), { c: skin, s: 2.2, sh: DZ.skinSh(skin), h: 0, rim: 0, lw: 1.4, ln: DZ.skinLn(skin) });
      DZ.fan(ctx, W[0] + 0.02 * u, W[1] + 0.14 * u, 1.2 * u, -0.42, { closed: true, rib: '#5b3b27' });
      DZ.hand(ctx, W[0], W[1], Math.PI * 0.86, 0.6 * u, 'fist', 1, skin);
      // head
      headT();
      const F = {
        skin, shape: { t: [0.385, 0.4], c: [0.375, 0.585], j: [0.285, 0.825], ch: [0.1, 0.968] },
        eye: { x: 0.168, y: 0.545, w: 0.17, h: 0.064, tilt: 0.1, open: 0.5, iris: '#5a3a26', ir: 0.04, crease: 0.3, creaseH: 1.05, peak: 0.58, lidW: 0.027, gaze: 0.1, bag: 0.6 },
        brow: { y: 0.445, w: 0.19, th: 0.022, tilt: 0.06, arch: 0.01, col: '#1b1820' }, browR: { y: 0.425, tilt: 0.18, arch: 0.022 },
        nose: { type: 'bridge', y: 0.725, w: 0.048 }, mouth: { type: 'smirk', y: 0.848, w: 0.125 },
      };
      DZ.head(ctx, F, cx, hb, u);
      // hair shadow on forehead
      const cap = sp([[cx - 0.47 * u, hb + 0.5 * u], [cx - 0.49 * u, hb + 0.22 * u], [cx - 0.3 * u, hb - 0.03 * u], [cx, hb - 0.08 * u], [cx + 0.3 * u, hb - 0.03 * u], [cx + 0.49 * u, hb + 0.22 * u], [cx + 0.47 * u, hb + 0.5 * u], [cx + 0.36 * u, hb + 0.28 * u], [cx + 0.15 * u, hb + 0.16 * u], [cx, hb + 0.14 * u], [cx - 0.15 * u, hb + 0.16 * u], [cx - 0.36 * u, hb + 0.28 * u]]);
      const bangs = [
        [[[cx - 0.02 * u, hb + 0.1 * u], [cx - 0.19 * u, hb + 0.28 * u], [cx - 0.26 * u, hb + 0.47 * u]], 0.15 * u],
        [[[cx - 0.13 * u, hb + 0.1 * u], [cx - 0.34 * u, hb + 0.33 * u], [cx - 0.39 * u, hb + 0.6 * u]], 0.16 * u],
        [[[cx + 0.02 * u, hb + 0.1 * u], [cx + 0.17 * u, hb + 0.28 * u], [cx + 0.21 * u, hb + 0.43 * u]], 0.14 * u],
        [[[cx + 0.13 * u, hb + 0.1 * u], [cx + 0.34 * u, hb + 0.32 * u], [cx + 0.41 * u, hb + 0.58 * u]], 0.16 * u],
      ];
      DZ.clipDo(ctx, DZ.xf(DZ.face, new DOMMatrix([u, 0, 0, u, cx, hb])), (c) => {
        c.fillStyle = DZ.rgba(DZ.skinSh(skin), 0.75); c.fill(DZ.shift(cap, 0.02 * u, 0.05 * u));
        bangs.forEach(([p, w]) => c.fill(DZ.shift(ribbon(p, w, 0.01 * u, w * 1.05), 0.02 * u, 0.05 * u)));
      });
      // topknot + hair mass (cap, bangs, long side locks) as one contour
      cel(ctx, DZ.ell(cx, hb - 0.08 * u, 0.16 * u, 0.12 * u), { c: hc.c, sh: hc.sh, s: 2, h: 0, rim: 1, lw: 1.4, ln: hc.ln });
      const sideL = ribbon([[cx - 0.3 * u, hb + 0.22 * u], [cx - 0.44 * u, hb + 0.6 * u], [cx - 0.45 * u, B.chin - 0.05 * u], [cx - 0.4 * u, B.chin + 0.25 * u], [cx - 0.42 * u, B.shY + 0.35 * u]], 0.17 * u, 0.01 * u, 0.15 * u);
      const sideR = ribbon([[cx + 0.3 * u, hb + 0.22 * u], [cx + 0.45 * u, hb + 0.62 * u], [cx + 0.47 * u, B.chin + 0.05 * u], [cx + 0.5 * u, B.shY + 0.2 * u], [cx + 0.44 * u, B.chestY - 0.05 * u], [cx + 0.47 * u, B.chestY + 0.3 * u]], 0.17 * u, 0.01 * u, 0.16 * u);
      const pieces = [sideL, sideR, cap].concat(bangs.map(([p, w]) => ribbon(p, w, 0.006 * u, w * 1.05)));
      pieces.push(ribbon([[cx + 0.0 * u, hb + 0.1 * u], [cx + 0.08 * u, hb + 0.3 * u], [cx + 0.03 * u, hb + 0.48 * u]], 0.045 * u, 0.004 * u));
      H.hair(ctx, pieces, hc, {
        fx: (c, i) => {
          if (DZ.sil) return;
          if (i === 2) { c.strokeStyle = DZ.rgba(hc.hi, 0.9); c.lineWidth = 0.035 * u; c.lineCap = 'round'; c.beginPath(); c.ellipse(cx, hb + 0.2 * u, 0.4 * u, 0.2 * u, 0, Math.PI * 1.08, Math.PI * 1.4); c.stroke(); c.beginPath(); c.ellipse(cx, hb + 0.2 * u, 0.4 * u, 0.2 * u, 0, Math.PI * 1.6, Math.PI * 1.9); c.stroke(); }
          if (i < 2) { const k = i ? 1 : -1; H.strands(c, [[[cx + k * 0.42 * u, hb + 0.5 * u], [cx + k * 0.44 * u, B.chin], [cx + k * 0.43 * u, B.shY + 0.1 * u]], [[cx + k * 0.38 * u, hb + 0.4 * u], [cx + k * 0.42 * u, hb + 0.8 * u]]], hc, 0.025 * u); }
        },
      });
      // wooden crown 木冠 + pin 簪
      const crown = sp([[cx - 0.16 * u, hb - 0.02 * u, 1], [cx - 0.19 * u, hb - 0.17 * u], [cx - 0.08 * u, hb - 0.28 * u], [cx, hb - 0.21 * u], [cx + 0.08 * u, hb - 0.28 * u], [cx + 0.19 * u, hb - 0.17 * u], [cx + 0.16 * u, hb - 0.02 * u, 1]]);
      cel(ctx, crown, { c: '#8a5a34', s: 2, h: 1.2, rim: 1, lw: 1.5, fx: (c) => { if (!DZ.sil) DZ.meander(c, cx - 0.15 * u, cx + 0.15 * u, hb - 0.08 * u, 0.075 * u, '#5a381e', 0.8); } });
      cel(ctx, ribbon([[cx - 0.36 * u, hb - 0.1 * u], [cx + 0.38 * u, hb - 0.18 * u]], 0.035 * u, 0.025 * u), { c: '#5e3b22', s: 0, h: 0, rim: 0, lw: 1.2 });
      cel(ctx, DZ.ell(cx - 0.37 * u, hb - 0.1 * u, 0.035 * u, 0.035 * u), { c: '#b8352a', s: 0, h: 0, rim: 0, lw: 1 });
      ctx.restore();
      return [
        { zh: '木冠・簪', en: 'wooden crown & pin', p: [cx + 0.12 * u, hb - 0.2 * u], side: 1 },
        { zh: '白護領', en: 'white guard collar', p: [cx + 0.14 * u, B.shY - 0.12 * u], side: 1 },
        { zh: '太極絛', en: 'taiji sash plaque', p: [cx + 0.02 * u, sy], side: -1 },
        { zh: '酒葫蘆', en: 'rice-wine gourd', p: [cx + 0.62 * u, sy + 0.65 * u], side: 1 },
        { zh: '符袋', en: 'talisman pouch', p: [cx - 0.54 * u, sy + 0.4 * u], side: -1 },
        { zh: '雲履・白襪', en: 'cloud-toe shoes', p: [cx - 0.25 * u, B.gy - 0.1 * u], side: -1 },
      ];
    },
  });

  // ============================================================ 02 紅頭法師 — folk ritualist
  OPT({
    zh: '紅頭法師', en: 'Red-head Ritualist', tag: '民間科儀・寫實 Folk ritual / grounded',
    idea: '把他放回台灣街頭廟埕：紅頭巾、紅法裙、牛角號，甩著法索替人收驚補運——嘴賤手快、跳得最高的那個法師。',
    shape: '寬站姿＋尖片法裙＝向外放射的三角；頭巾尾與法索是兩條 S 動線。整體偏尖、偏動，與 03 的方正相反。',
    culture: '取材閭山「紅頭」法師：紅頭巾、紅法裙、龍角（牛角號）、法索；裡面是庄腳日常的對襟短衫、大褲、綁腿草鞋。幻想處：法裙片繡雷紋八卦、法索柄雕雷擊木蛇頭。',
    ratio: 7.5, H: 402, bg: ['#efe3d8', '#d3bba8'], accent: '#b0322a', dx: -6,
    palette: [['法裙朱紅 Ritual red', '#b8322a'], ['暗紅 Deep red', '#7d2024'], ['短衫米白 Jacket', '#efe8da'], ['大褲黑 Trousers', '#2a272e'], ['金線 Gold trim', '#d8a743'], ['牛角 Horn', '#e8d9b8'], ['膚 Skin (tan)', '#d9a982']],
    bust: { y: -0.15, z: 1.75, x: 0.1 },
    draw(ctx, B, o) {
      const u = B.u, cx = B.cx, hb = B.top;
      const skin = '#d9a982', red = '#b8322a', red2 = '#9c2826', gold = '#d8a743', black = '#2a272e', white = '#efe8da';
      const hc = { c: '#2a2422', sh: '#141011', hi: '#5c4c4a', ln: '#0e0a0a', rim: '#c9d6e6' };
      const sy = B.waistY + 0.02 * u, feet = [cx - 0.46 * u, cx + 0.46 * u];
      // back: short tail at the nape
      H.lock(ctx, [[cx + 0.05 * u, hb + 0.7 * u], [cx + 0.2 * u, B.chin + 0.2 * u], [cx + 0.28 * u, B.shY + 0.25 * u]], 0.2 * u, 0.02 * u, hc);
      H.neck(ctx, B, skin, { w: 0.16, adam: true });
      // legs
      H.trousers(ctx, B, { c: black, hemY: B.kneeY + 0.62 * u, feet, wHem: 0.26, kneeW: 0.34 });
      for (const fx of feet) H.legwrap(ctx, B, fx, B.kneeY + 0.48 * u, B.gy - 0.22 * u, 0.42 * u, 0.3 * u, '#e9e2d2');
      H.shoes(ctx, B, { type: 'straw', skin, spread: 0.46, w: 0.15, h: 0.28 });
      // jacket
      H.jacket(ctx, B, { c: white, hemY: B.hipY, wHem: 0.78, trim: black, nb: 4, btn: black });
      // 法裙 ritual skirt: back fill + 7 pointed panels
      const hy = B.kneeY + 0.32 * u;
      cel(ctx, sp([[cx - 0.66 * u, sy], [cx + 0.66 * u, sy], [cx + 1.0 * u, hy - 0.1 * u], [cx - 1.0 * u, hy - 0.1 * u]]), { c: '#6e1c1f', s: 0, h: 0, rim: 0, lw: 1.5 });
      const order = [0, 6, 1, 5, 2, 4, 3];
      for (const i of order) {
        const k = i - 3, xt = cx + k * 0.2 * u, xb = cx + k * 0.31 * u + (k === 0 ? 0 : 0), wt = (k === 0 ? 0.34 : 0.24) * u, wb = (k === 0 ? 0.48 : 0.36) * u;
        const tipY = hy + (k === 0 ? 0.12 : 0.06 - Math.abs(k) * 0.03) * u;
        const p = sp([[xt - wt / 2, sy, 1], [xt + wt / 2, sy, 1], [xb + wb / 2, tipY - 0.2 * u, 1], [xb, tipY, 1], [xb - wb / 2, tipY - 0.2 * u, 1]]);
        const c = k === 0 ? red : (i % 2 ? red2 : red);
        cel(ctx, p, {
          c, s: 0.07 * u, sd: [1, 0.1], h: 1.2, rim: 1.2, lw: 1.5,
          fx: (cc) => {
            if (DZ.sil) return;
            cc.lineWidth = 0.075 * u; cc.strokeStyle = gold; cc.stroke(p);
            cc.lineWidth = 0.012 * u; cc.strokeStyle = DZ.dk(gold, 0.4); cc.stroke(DZ.xf(p, new DOMMatrix().translate(xb, tipY - 0.3 * u).scale(0.82, 0.9).translate(-xb, -(tipY - 0.3 * u))));
            if (k === 0) { DZ.bagua(cc, xb, hy - 0.5 * u, 0.12 * u, gold, 0.022 * u); DZ.taiji(cc, xb, hy - 0.5 * u, 0.08 * u, '#f3e7c4', '#5a1416'); DZ.meander(cc, xb - 0.18 * u, xb + 0.18 * u, sy + 0.25 * u, 0.09 * u, gold, 0.9); }
            else DZ.cloud(cc, xb - 0.1 * u, tipY - 0.38 * u, 0.09 * u, gold, 1);
          },
        });
        if (!DZ.sil) { ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(xb, tipY + 0.03 * u, 0.035 * u, 0, 7); ctx.fill(); }
      }
      // belt
      cel(ctx, sp([[cx - 0.68 * u, sy - 0.1 * u], [cx + 0.68 * u, sy - 0.1 * u], [cx + 0.7 * u, sy + 0.08 * u], [cx - 0.7 * u, sy + 0.08 * u]]), { c: black, s: 2, h: 1, rim: 1.2, lw: 1.5 });
      H.lock(ctx, [[cx - 0.32 * u, sy], [cx - 0.38 * u, sy + 0.35 * u], [cx - 0.33 * u, sy + 0.62 * u]], 0.12 * u, 0.1 * u, { c: black, sh: '#151318', ln: '#0a090c', rim: '#8fa2bd' });
      // horn cord + 龍角
      DZ.tp(ctx, [[cx - 0.45 * u, B.shY - 0.18 * u], [cx, B.chestY], [cx + 0.55 * u, sy - 0.25 * u]], 0.07 * u, 0.06 * u, '#a32a24');
      const horn = ribbon([[cx + 0.42 * u, sy - 0.12 * u], [cx + 0.62 * u, sy + 0.2 * u], [cx + 0.7 * u, sy + 0.6 * u], [cx + 0.64 * u, sy + 0.95 * u]], 0.07 * u, 0.3 * u);
      cel(ctx, horn, { c: '#e8d9b8', s: 0.07 * u, h: 1.2, rim: 1.5, lw: 1.6, grad: [cx, sy - 0.1 * u, cx, sy + 0.4 * u, 0.0], fx: (c) => { if (DZ.sil) return; c.fillStyle = DZ.rgba('#3a2a22', 0.9); c.fill(DZ.ell(cx + 0.45 * u, sy - 0.08 * u, 0.12 * u, 0.14 * u)); for (let t = 0.3; t < 0.9; t += 0.15) DZ.line(c, [[cx + 0.52 * u + t * 0.2 * u, sy + t * u - 0.05 * u], [cx + 0.75 * u + t * 0.05 * u, sy + t * u - 0.02 * u]], 0.8, DZ.rgba('#a89270', 0.8)); } });
      cel(ctx, DZ.ell(cx + 0.64 * u, sy + 0.95 * u, 0.15 * u, 0.06 * u, 0.15), { c: '#3a2a22', s: 0, h: 0, rim: 0, lw: 1.3 });
      cel(ctx, ribbon([[cx + 0.5 * u, sy + 0.08 * u], [cx + 0.58 * u, sy + 0.05 * u]], 0.17 * u, 0.17 * u), { c: '#c9cdd6', s: 1, h: 0, rim: 0, lw: 1.1 });
      // viewer-left arm: whip-rope 法索
      const SL = [cx - 0.86 * u, B.shY + 0.1 * u], EL = [cx - 1.12 * u, B.waistY - 0.05 * u], WL = [cx - 1.32 * u, B.hipY + 0.2 * u];
      H.limb(ctx, [SL, [cx - 1.0 * u, B.shY + 0.6 * u], EL], 0.42 * u, 0.36 * u, white, { s: 0.08 * u, fx: (c) => fold(c, [[cx - 0.95 * u, B.shY + 0.4 * u], [cx - 1.05 * u, B.waistY - 0.3 * u]], 0.05 * u, DZ.rgba(DZ.dk(white, 0.3), 0.8)) });
      cel(ctx, DZ.ell(EL[0] + 0.01 * u, EL[1] + 0.02 * u, 0.2 * u, 0.09 * u, -0.5), { c: white, s: 2, h: 0, rim: 0, lw: 1.5 });
      H.skinLimb(ctx, [[EL[0] + 0.02 * u, EL[1] + 0.05 * u], WL], 0.26 * u, 0.19 * u, skin);
      // rope
      const rope = [[WL[0] - 0.05 * u, WL[1] + 0.4 * u], [cx - 1.55 * u, B.kneeY - 0.2 * u], [cx - 1.25 * u, B.kneeY + 0.5 * u], [cx - 1.6 * u, B.gy - 0.45 * u], [cx - 2.05 * u, B.gy - 0.15 * u], [cx - 2.25 * u, B.gy - 0.3 * u]];
      cel(ctx, ribbon(rope, 0.1 * u, 0.04 * u), { c: '#c9a46a', s: 1.5, h: 0, rim: 0, lw: 1.3, fx: (c) => { if (DZ.sil) return; DZ.dense(rope, 10).forEach((q, i) => { if (i % 2) return; c.fillStyle = DZ.rgba('#7a5a34', 0.8); c.fillRect(q[0] - 0.03 * u, q[1] - 0.01 * u, 0.06 * u, 0.02 * u); }); } });
      // snake-head handle
      cel(ctx, ribbon([[WL[0] + 0.04 * u, WL[1] - 0.15 * u], [WL[0] - 0.02 * u, WL[1] + 0.3 * u], [WL[0] - 0.05 * u, WL[1] + 0.45 * u]], 0.1 * u, 0.08 * u), { c: '#5e3a22', s: 1, h: 0, rim: 1, lw: 1.3 });
      cel(ctx, sp([[WL[0] + 0.01 * u, WL[1] - 0.12 * u], [WL[0] + 0.08 * u, WL[1] - 0.3 * u], [WL[0] + 0.16 * u, WL[1] - 0.34 * u], [WL[0] + 0.12 * u, WL[1] - 0.2 * u], [WL[0] + 0.08 * u, WL[1] - 0.1 * u]]), { c: '#5e3a22', s: 1, h: 0, rim: 1, lw: 1.3, fx: (c) => { if (!DZ.sil) { c.fillStyle = '#d8a743'; c.beginPath(); c.arc(WL[0] + 0.11 * u, WL[1] - 0.27 * u, 0.018 * u, 0, 7); c.fill(); } } });
      DZ.hand(ctx, WL[0], WL[1], 0.15, 0.62 * u, 'fist', -1, skin);
      // viewer-right arm: sword-fingers mudra at the chest
      const SR = [cx + 0.86 * u, B.shY + 0.1 * u], ER = [cx + 1.1 * u, B.waistY - 0.3 * u], WR = [cx + 0.6 * u, B.shY + 0.42 * u];
      H.limb(ctx, [SR, [cx + 1.02 * u, B.shY + 0.55 * u], ER], 0.42 * u, 0.36 * u, white, { s: 0.08 * u });
      cel(ctx, DZ.ell(ER[0] - 0.02 * u, ER[1], 0.2 * u, 0.09 * u, 0.6), { c: white, s: 2, h: 0, rim: 0, lw: 1.5 });
      H.skinLimb(ctx, [[ER[0] - 0.04 * u, ER[1] - 0.02 * u], [(ER[0] + WR[0]) / 2 + 0.05 * u, (ER[1] + WR[1]) / 2], WR], 0.26 * u, 0.19 * u, skin);
      H.limb(ctx, [[ER[0] + (WR[0] - ER[0]) * 0.62, ER[1] + (WR[1] - ER[1]) * 0.62], [ER[0] + (WR[0] - ER[0]) * 0.92, ER[1] + (WR[1] - ER[1]) * 0.92]], 0.23 * u, 0.2 * u, '#2a272e', { s: 1, lw: 1.3 });
      H.limb(ctx, [[EL[0] + (WL[0] - EL[0]) * 0.55, EL[1] + (WL[1] - EL[1]) * 0.55], [EL[0] + (WL[0] - EL[0]) * 0.9, EL[1] + (WL[1] - EL[1]) * 0.9]], 0.24 * u, 0.21 * u, '#2a272e', { s: 1, lw: 1.3 });
      DZ.hand(ctx, WR[0], WR[1], Math.PI - 0.25, 0.62 * u, 'mudra', -1, skin);
      // head
      const F = {
        skin, blushA: 0.12,
        shape: { t: [0.4, 0.4], c: [0.4, 0.585], j: [0.33, 0.8], ch: [0.14, 0.95] },
        eye: { x: 0.172, y: 0.55, w: 0.16, h: 0.066, tilt: 0.14, open: 0.74, iris: '#6a4220', ir: 0.038, crease: 0.25, peak: 0.55, lidW: 0.025, gaze: -0.06 },
        brow: { type: 'sharp', y: 0.44, w: 0.2, th: 0.032, tilt: 0.16, arch: 0.015, col: '#1e1614' },
        nose: { type: 'strong', y: 0.725, w: 0.055 }, mouth: { type: 'grin', y: 0.845, w: 0.17, oh: 0.05 },
      };
      DZ.head(ctx, F, cx, hb, u);
      // hair: crown tufts above the band + sideburns
      const tufts = [];
      [[-0.3, -0.56, 0.0, 0.16], [-0.12, -0.4, -0.13, 0.17], [0.05, -0.16, -0.19, 0.18], [0.22, 0.1, -0.15, 0.16], [0.36, 0.4, -0.02, 0.12]].forEach(([r0, tx, ty, w]) => tufts.push(ribbon([[cx + r0 * u, hb + 0.22 * u], [cx + (r0 * 0.6 + tx * 0.4) * u, hb + 0.02 * u], [cx + tx * u, hb + ty * u]], w * u, 0.01 * u, w * 1.05 * u)));
      const capY = sp([[cx - 0.47 * u, hb + 0.36 * u], [cx - 0.42 * u, hb + 0.08 * u], [cx, hb - 0.06 * u], [cx + 0.42 * u, hb + 0.08 * u], [cx + 0.47 * u, hb + 0.36 * u]]);
      const sideb = [ribbon([[cx - 0.4 * u, hb + 0.32 * u], [cx - 0.42 * u, hb + 0.52 * u], [cx - 0.38 * u, hb + 0.62 * u]], 0.08 * u, 0.01 * u), ribbon([[cx + 0.4 * u, hb + 0.32 * u], [cx + 0.42 * u, hb + 0.52 * u], [cx + 0.38 * u, hb + 0.64 * u]], 0.08 * u, 0.01 * u)];
      H.hair(ctx, [capY].concat(tufts, sideb), hc);
      // 紅頭巾 band + knot + flying tails
      const tail = (pts, w0, w1) => { const p = ribbon(pts, w0, w1); cel(ctx, p, { c: '#c0352c', sh: '#8a2024', s: 0.05 * u, h: 1, rim: 1.4, lw: 1.6, fx: (c) => { if (!DZ.sil) DZ.tp(c, [pts[0], pts[pts.length - 1]], 0.01 * u, 0.01 * u, DZ.rgba(gold, 0.0)); } }); return p; };
      tail([[cx + 0.46 * u, hb + 0.3 * u], [cx + 0.85 * u, hb + 0.2 * u], [cx + 1.25 * u, hb + 0.4 * u], [cx + 1.6 * u, hb + 0.28 * u]], 0.15 * u, 0.11 * u);
      tail([[cx + 0.46 * u, hb + 0.36 * u], [cx + 0.75 * u, hb + 0.62 * u], [cx + 1.05 * u, hb + 0.72 * u], [cx + 1.22 * u, hb + 1.02 * u]], 0.14 * u, 0.1 * u);
      if (!DZ.sil) { ctx.fillStyle = gold; ctx.fillRect(cx + 1.52 * u, hb + 0.22 * u, 0.06 * u, 0.12 * u); }
      const band = sp([[cx - 0.5 * u, hb + 0.2 * u], [cx, hb + 0.11 * u], [cx + 0.5 * u, hb + 0.2 * u], [cx + 0.51 * u, hb + 0.39 * u], [cx, hb + 0.33 * u], [cx - 0.51 * u, hb + 0.4 * u]]);
      cel(ctx, band, { c: '#c0352c', sh: '#8a2024', s: 0.06 * u, sd: [1, 0.3], h: 1.4, rim: 1.4, lw: 1.8, fx: (c) => { if (DZ.sil) return; for (const x of [-0.32, -0.1, 0.14, 0.34]) fold(c, [[cx + x * u, hb + 0.17 * u], [cx + (x + 0.06) * u, hb + 0.33 * u]], 0.035 * u, DZ.rgba('#7a1a1e', 0.7)); DZ.fu(c, cx, hb + 0.23 * u, 0.1 * u, 0.16 * u, 0, { paper: '#e8c65a' }); } });
      cel(ctx, DZ.ell(cx + 0.5 * u, hb + 0.3 * u, 0.1 * u, 0.12 * u), { c: '#c0352c', sh: '#8a2024', s: 2, h: 1, rim: 1, lw: 1.6 });
      return [
        { zh: '紅頭巾', en: 'red head-cloth', p: [cx - 0.3 * u, hb + 0.2 * u], side: -1 },
        { zh: '龍角', en: 'ox-horn trumpet', p: [cx + 0.68 * u, sy + 0.55 * u], side: 1 },
        { zh: '對襟短衫', en: 'centre-opening jacket', p: [cx + 0.0 * u, B.chestY + 0.15 * u], side: 1 },
        { zh: '法裙', en: 'ritual skirt panels', p: [cx + 0.6 * u, hy - 0.3 * u], side: 1 },
        { zh: '法索', en: 'ritual whip-rope', p: [cx - 1.45 * u, B.kneeY + 0.1 * u], side: -1 },
        { zh: '綁腿・草鞋', en: 'leg wraps, straw sandals', p: [cx + 0.46 * u, B.gy - 0.6 * u], side: 1 },
      ];
    },
  });

  // ============================================================ 03 絳衣高功 — ritual formal
  OPT({
    zh: '絳衣高功', en: 'Crimson-vestment High Priest', tag: '正一科儀・正裝 Ritual formal',
    idea: '雲歸「認真起來」的樣子：披上高功絳衣、戴金冠、手捧笏板主持醮典——方正、對稱、肅穆，幾乎讓人忘了他平常有多懶。',
    shape: '一個大長方形：絳衣平直肩線與方擺構成方塊剪影，中央開口露出黑袍，視線收在胸前的笏與臉；最「靜」的一款。',
    culture: '台灣正一道士行醮典時，高功於道袍外披繡金方形絳衣、戴插簪小金冠、持笏，內著黑長袍、白襪朝靴。幻想處：繡紋改為雷紋與八卦方位，金冠作雷火焰形。',
    ratio: 7.5, H: 402, bg: ['#efe7dd', '#cbb8a8'], accent: '#8e2526',
    palette: [['絳衣緋紅 Vestment', '#9b2a2a'], ['金繡 Gold embroidery', '#d6a84b'], ['黑袍 Under-robe', '#1f1e26'], ['白護領 Guard collar', '#f1ece0'], ['象牙笏 Ivory tablet', '#ece2c8'], ['膚 Skin', '#f0d5bc'], ['墨髮 Hair', '#1d1c24']],
    bust: { y: -0.4, z: 1.65 },
    draw(ctx, B, o) {
      const u = B.u, cx = B.cx, hb = B.top;
      const skin = '#f0d5bc', crim = '#9b2a2a', gold = '#d6a84b', black = '#1f1e26';
      const hc = { c: '#1d1c24', sh: '#0e0d12', hi: '#4a4f66', ln: '#08080b', rim: '#a9bdd8' };
      const vY = B.chestY - 0.2 * u;
      H.backCollar(ctx, B, '#2b2a33');
      H.neck(ctx, B, skin, { w: 0.145 });
      H.shoes(ctx, B, { type: 'cloth', c: '#1b1a20', sole: '#efe9dc', spread: 0.24, h: 0.34, w: 0.16 });
      const robe = H.robe(B, { vY, hemY: B.gy - 0.36 * u, hem: 0.9, waist: 0.7, hip: 0.78, knee: 0.86 });
      cel(ctx, robe, { c: black, s: 0.15 * u, h: 1.5, rim: 1.6, lw: 1.8, fx: (c) => H.robeFolds(c, B, black, B.kneeY, B.gy - 0.36 * u, [-0.45, 0.0, 0.42], { w: 0.18 }) });
      H.crossCollar(ctx, B, { vY, band: '#2b2a33', guard: '#f1ece0', endY: B.waistY, endX: 0.5 });
      // 絳衣 halves
      for (const s of [-1, 1]) {
        const p = sp([[cx + s * 0.25 * u, B.shY - 0.33 * u, 1], [cx + s * 0.8 * u, B.shY - 0.22 * u], [cx + s * 1.38 * u, B.shY - 0.06 * u, 1], [cx + s * 1.44 * u, B.waistY], [cx + s * 1.46 * u, B.kneeY - 0.05 * u], [cx + s * 1.34 * u, B.kneeY + 0.18 * u], [cx + s * 0.9 * u, B.kneeY + 0.26 * u], [cx + s * 0.38 * u, B.kneeY + 0.3 * u, 1], [cx + s * 0.33 * u, B.waistY], [cx + s * 0.3 * u, B.chestY + 0.1 * u], [cx + s * 0.27 * u, B.shY + 0.1 * u]]);
        cel(ctx, p, {
          c: crim, s: 0.2 * u, sd: [1, 0.2], h: 2.2, rim: 2, lw: 2.1, grad: [0, B.shY, 0, B.kneeY, 0.3],
          fx: (c) => {
            if (DZ.sil) return;
            const fs = DZ.rgba(DZ.dk(crim, 0.3), 0.75);
            DZ.drape(c, cx + s * 1.05 * u, B.shY + 0.35 * u, B.kneeY + 0.25 * u, 0.3 * u, s * 0.05 * u, fs);
            DZ.drape(c, cx + s * 0.62 * u, B.chestY + 0.4 * u, B.kneeY + 0.3 * u, 0.2 * u, 0, fs);
            // embroidery (texture paint): bagua roundel, clouds, thunder band
            DZ.bagua(c, cx + s * 0.86 * u, B.chestY + 0.2 * u, 0.2 * u, gold, 0.035 * u, 0.2);
            DZ.taiji(c, cx + s * 0.86 * u, B.chestY + 0.2 * u, 0.12 * u, '#f3e7c4', '#4a1214');
            DZ.cloud(c, cx + s * 0.6 * u - (s > 0 ? 0 : 0.25 * u), B.hipY + 0.2 * u, 0.12 * u, gold, 1.2, s);
            DZ.cloud(c, cx + s * 1.0 * u - (s > 0 ? 0 : 0.25 * u), B.hipY + 0.75 * u, 0.1 * u, gold, 1.1, s);
            DZ.meander(c, cx + (s > 0 ? 0.42 : -1.38) * u, cx + (s > 0 ? 1.38 : -0.42) * u, B.kneeY - 0.05 * u, 0.12 * u, gold, 1);
            c.lineWidth = 0.2 * u; c.strokeStyle = gold; c.stroke(p);
            c.lineWidth = 0.02 * u; c.strokeStyle = DZ.dk(gold, 0.45); c.stroke(DZ.xf(p, new DOMMatrix().translate(cx + s * 0.86 * u, B.waistY).scale(0.87, 0.93).translate(-(cx + s * 0.86 * u), -B.waistY)));
          },
        });
      }
      // inner black cuffs, tablet 笏, hands
      for (const s of [-1, 1]) cel(ctx, sp([[cx + s * 0.32 * u, B.chestY + 0.05 * u], [cx + s * 0.12 * u, B.chestY + 0.28 * u], [cx + s * 0.12 * u, B.chestY + 0.62 * u], [cx + s * 0.34 * u, B.chestY + 0.75 * u]]), { c: black, s: 2, h: 1, rim: 1, lw: 1.6 });
      const tab = sp([[cx - 0.08 * u, B.chestY - 0.75 * u], [cx + 0.08 * u, B.chestY - 0.75 * u, 1], [cx + 0.11 * u, B.chestY + 0.62 * u, 1], [cx - 0.11 * u, B.chestY + 0.62 * u, 1]]);
      cel(ctx, tab, { c: '#ece2c8', s: 0.05 * u, h: 1, rim: 1, lw: 1.5, fx: (c) => { if (!DZ.sil) DZ.line(c, [[cx, B.chestY - 0.65 * u], [cx, B.chestY - 0.1 * u]], 0.8, DZ.rgba('#a8987a', 0.7)); } });
      DZ.hand(ctx, cx - 0.16 * u, B.chestY + 0.38 * u, -Math.PI / 2 + 0.15, 0.58 * u, 'fist', 1, skin);
      DZ.hand(ctx, cx + 0.16 * u, B.chestY + 0.5 * u, Math.PI / 2 - 0.15, 0.58 * u, 'fist', -1, skin);
      // head
      const F = {
        skin, blushA: 0.12,
        shape: { t: [0.39, 0.41], c: [0.39, 0.6], j: [0.315, 0.83], ch: [0.12, 0.96] },
        eye: { x: 0.168, y: 0.55, w: 0.165, h: 0.062, tilt: 0.1, open: 0.8, iris: '#2e1f18', ir: 0.04, crease: 0.35, peak: 0.5, lidW: 0.025 },
        brow: { y: 0.44, w: 0.19, th: 0.032, tilt: 0.12, arch: 0.008, col: '#15141a' },
        nose: { type: 'bridge', y: 0.725, w: 0.05 }, mouth: { type: 'neutral', y: 0.845, w: 0.115 },
      };
      DZ.head(ctx, F, cx, hb, u);
      cel(ctx, DZ.ell(cx, hb - 0.08 * u, 0.15 * u, 0.12 * u), { c: hc.c, sh: hc.sh, s: 2, h: 0, rim: 1, lw: 1.4, ln: hc.ln });
      const cap = sp([[cx - 0.46 * u, hb + 0.5 * u], [cx - 0.47 * u, hb + 0.2 * u], [cx - 0.28 * u, hb - 0.02 * u], [cx, hb - 0.06 * u], [cx + 0.28 * u, hb - 0.02 * u], [cx + 0.47 * u, hb + 0.2 * u], [cx + 0.46 * u, hb + 0.5 * u], [cx + 0.39 * u, hb + 0.34 * u], [cx + 0.22 * u, hb + 0.2 * u], [cx, hb + 0.17 * u], [cx - 0.22 * u, hb + 0.2 * u], [cx - 0.39 * u, hb + 0.34 * u]]);
      const strands = [ribbon([[cx - 0.38 * u, hb + 0.3 * u], [cx - 0.42 * u, hb + 0.62 * u], [cx - 0.4 * u, B.chin + 0.1 * u]], 0.05 * u, 0.005 * u), ribbon([[cx + 0.38 * u, hb + 0.3 * u], [cx + 0.43 * u, hb + 0.62 * u], [cx + 0.41 * u, B.chin + 0.08 * u]], 0.05 * u, 0.005 * u)];
      H.hair(ctx, [cap].concat(strands), hc, { fx: (c, i) => { if (i || DZ.sil) return; H.strands(c, [[[cx - 0.36 * u, hb + 0.32 * u], [cx - 0.25 * u, hb + 0.05 * u], [cx - 0.05 * u, hb - 0.04 * u]], [[cx + 0.36 * u, hb + 0.32 * u], [cx + 0.25 * u, hb + 0.05 * u], [cx + 0.05 * u, hb - 0.04 * u]], [[cx - 0.18 * u, hb + 0.18 * u], [cx - 0.1 * u, hb + 0.02 * u]], [[cx + 0.18 * u, hb + 0.18 * u], [cx + 0.1 * u, hb + 0.02 * u]]], hc, 0.03 * u); c.strokeStyle = DZ.rgba(hc.hi, 0.9); c.lineWidth = 0.03 * u; c.beginPath(); c.ellipse(cx, hb + 0.22 * u, 0.4 * u, 0.2 * u, 0, Math.PI * 1.1, Math.PI * 1.4); c.stroke(); } });
      // 金冠 with flame
      const crown = sp([[cx - 0.17 * u, hb - 0.01 * u, 1], [cx - 0.21 * u, hb - 0.16 * u], [cx - 0.12 * u, hb - 0.2 * u], [cx - 0.06 * u, hb - 0.3 * u], [cx, hb - 0.44 * u, 1], [cx + 0.06 * u, hb - 0.3 * u], [cx + 0.12 * u, hb - 0.2 * u], [cx + 0.21 * u, hb - 0.16 * u], [cx + 0.17 * u, hb - 0.01 * u, 1]]);
      cel(ctx, crown, { c: gold, s: 2, h: 1.2, rim: 1.2, lw: 1.5, fx: (c) => { if (DZ.sil) return; c.fillStyle = '#b23a2e'; c.beginPath(); c.arc(cx, hb - 0.14 * u, 0.04 * u, 0, 7); c.fill(); DZ.line(c, [[cx - 0.15 * u, hb - 0.07 * u], [cx + 0.15 * u, hb - 0.07 * u]], 0.9, DZ.dk(gold, 0.4)); } });
      cel(ctx, ribbon([[cx - 0.36 * u, hb - 0.1 * u], [cx + 0.36 * u, hb - 0.1 * u]], 0.032 * u, 0.032 * u), { c: '#7fb39a', s: 0, h: 0, rim: 0, lw: 1.1 });
      return [
        { zh: '金冠・玉簪', en: 'gold flame crown', p: [cx + 0.05 * u, hb - 0.3 * u], side: 1 },
        { zh: '白護領', en: 'white guard collar', p: [cx - 0.14 * u, B.shY - 0.12 * u], side: -1 },
        { zh: '笏', en: 'ivory court tablet', p: [cx, B.chestY - 0.6 * u], side: -1 },
        { zh: '絳衣', en: 'square ritual vestment', p: [cx + 1.25 * u, B.shY + 0.6 * u], side: 1 },
        { zh: '八卦繡', en: 'bagua (texture paint)', p: [cx + 0.86 * u, B.chestY + 0.2 * u], side: 1 },
        { zh: '朝靴', en: 'white-soled boots', p: [cx - 0.24 * u, B.gy - 0.12 * u], side: -1 },
      ];
    },
  });

  // ============================================================ 04 採藥雲遊 — wandering forager
  OPT({
    zh: '採藥雲遊', en: 'Wandering Herb-forager', tag: '下山便服・寫實 Road wear / grounded',
    idea: '「業餘真菌學家」的田野版：斗笠、藥鋤、竹籃，大襟短衫捲起袖子，腰間掛滿蕈袋與放大鏡——半天找不到師父，倒是先找到三種新菇。',
    shape: '大斗笠圓盤＋斜扛藥鋤的對角線＋吊籃：遠看是「圓盤加一根桿」，地圖上最好認；短衫、綁腿讓下半身變窄。',
    culture: '台灣常民工作裝：大襟短衫、寬腳褲、綁腿、草鞋、斗笠；「藥鋤＋竹籃」是傳統採藥人圖像。放大鏡取自開港後淡水洋行貨。幻想處：籃中的七彩靈蕈會發光。',
    ratio: 7, H: 388, bg: ['#e4e7d8', '#bcc5ab'], accent: '#5f7a3c', dx: -18,
    palette: [['苔綠短衫 Moss jacket', '#7b8456'], ['褐褲 Trousers', '#4d4a44'], ['靛綁腿 Indigo wraps', '#4b5a72'], ['斗笠竹 Bamboo hat', '#c9a86a'], ['靈蕈 Spirit-mushroom glow', '#c86ad8'], ['膚 Skin (sun)', '#e4bf9a'], ['墨髮 Hair', '#26221f']],
    bust: { y: -0.45, z: 1.55, x: 0.1 },
    draw(ctx, B, o) {
      const u = B.u, cx = B.cx, hb = B.top;
      const skin = '#e4bf9a', moss = '#7b8456', trou = '#4d4a44', wrap = '#4b5a72', bam = '#c9a86a';
      const hc = { c: '#26221f', sh: '#120f0e', hi: '#57504a', ln: '#0c0a09', rim: '#d8dcc0' };
      const feet = [cx - 0.36 * u, cx + 0.32 * u];
      // basket hanging from the hoe end (behind)
      const tip = [cx + 1.85 * u, hb + 0.05 * u];
      DZ.line(ctx, [[cx + 1.62 * u, hb + 0.28 * u], [cx + 1.62 * u, B.shY + 0.35 * u]], 1.2, '#5a4126');
      const bask = sp([[cx + 1.32 * u, B.shY + 0.3 * u], [cx + 1.92 * u, B.shY + 0.3 * u], [cx + 1.84 * u, B.chestY + 0.35 * u], [cx + 1.62 * u, B.chestY + 0.45 * u], [cx + 1.4 * u, B.chestY + 0.35 * u]]);
      if (!DZ.sil) { DZ.glow(ctx, cx + 1.62 * u, B.shY + 0.25 * u, 0.7 * u, '#c86ad8', 0.5); [[1.45, '#c86ad8'], [1.6, '#6ad8c8'], [1.76, '#e8d26a']].forEach(([x, col]) => { cel(ctx, sp([[cx + (x - 0.12) * u, B.shY + 0.3 * u], [cx + x * u, B.shY + 0.1 * u], [cx + (x + 0.12) * u, B.shY + 0.3 * u]]), { c: col, s: 1, h: 1, rim: 0, lw: 1.1 }); }); }
      cel(ctx, bask, { c: bam, s: 0.08 * u, h: 1, rim: 1.2, lw: 1.6, fx: (c) => { if (DZ.sil) return; for (let i = 0; i < 6; i++) DZ.line(c, [[cx + (1.32 + i * 0.12) * u, B.shY + 0.3 * u], [cx + (1.4 + i * 0.09) * u, B.chestY + 0.4 * u]], 0.8, DZ.dk(bam, 0.4)); for (let j = 0; j < 4; j++) DZ.line(c, [[cx + 1.32 * u, B.shY + (0.42 + j * 0.13) * u], [cx + 1.92 * u, B.shY + (0.42 + j * 0.13) * u]], 0.8, DZ.dk(bam, 0.3)); } });
      // back: low ponytail stub
      H.lock(ctx, [[cx - 0.1 * u, hb + 0.75 * u], [cx - 0.25 * u, B.chin + 0.2 * u], [cx - 0.3 * u, B.shY + 0.1 * u]], 0.18 * u, 0.02 * u, hc);
      H.neck(ctx, B, skin, { w: 0.15, adam: true });
      // legs
      H.trousers(ctx, B, { c: trou, hemY: B.kneeY + 0.5 * u, feet, wHem: 0.27, kneeW: 0.33, rolled: true });
      for (const fx of feet) H.legwrap(ctx, B, fx, B.kneeY + 0.4 * u, B.gy - 0.22 * u, 0.36 * u, 0.27 * u, wrap);
      H.shoes(ctx, B, { type: 'straw', skin, spread: 0.34, dx: 0, w: 0.15, h: 0.28 });
      // jacket 大襟
      H.jacket(ctx, B, { c: moss, shK: 0.86, hemY: B.hipY + 0.35 * u, wHem: 0.86, trim: '#4f5636', type: 'da', btn: '#c9b98a', fx: (c) => { if (!DZ.sil) { c.fillStyle = DZ.rgba('#a3a37a', 0.35); c.fill(DZ.ell(cx + 0.3 * u, B.chestY, 0.2 * u, 0.3 * u)); } } });
      // belt + pouches + lens
      const sy = B.waistY + 0.05 * u;
      cel(ctx, sp([[cx - 0.7 * u, sy - 0.08 * u], [cx + 0.7 * u, sy - 0.1 * u], [cx + 0.72 * u, sy + 0.08 * u], [cx - 0.72 * u, sy + 0.1 * u]]), { c: '#6a4e34', s: 2, h: 1, rim: 1, lw: 1.5 });
      H.pouch(ctx, cx - 0.5 * u, sy + 0.05 * u, 0.32 * u, 0.4 * u, '#8a7a5a', { flap: '#6e6044' });
      H.pouch(ctx, cx + 0.2 * u, sy + 0.05 * u, 0.28 * u, 0.34 * u, '#a08a62', { flap: '#7a6848', knot: '#c86ad8' });
      if (!DZ.sil) { cel(ctx, sp([[cx + 0.14 * u, sy + 0.06 * u], [cx + 0.2 * u, sy - 0.12 * u], [cx + 0.27 * u, sy + 0.06 * u]]), { c: '#e8d26a', s: 1, h: 0, rim: 0, lw: 1 }); }
      DZ.line(ctx, [[cx + 0.5 * u, sy + 0.05 * u], [cx + 0.55 * u, sy + 0.4 * u]], 1, '#3a2a1a');
      cel(ctx, DZ.ell(cx + 0.56 * u, sy + 0.5 * u, 0.11 * u, 0.11 * u), { c: '#b8975a', s: 1, h: 0, rim: 0, lw: 1.4, fx: (c) => { if (!DZ.sil) { c.fillStyle = 'rgba(210,235,240,0.8)'; c.beginPath(); c.arc(cx + 0.56 * u, sy + 0.5 * u, 0.075 * u, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(cx + 0.53 * u, sy + 0.47 * u, 0.02 * u, 0, 7); c.fill(); } } });
      // viewer-left arm: hanging, holding a mushroom up for inspection
      const SL = [cx - 0.85 * u, B.shY + 0.12 * u], EL = [cx - 1.05 * u, B.waistY - 0.05 * u], WL = [cx - 0.82 * u, B.waistY - 0.55 * u];
      H.limb(ctx, [SL, [cx - 1.0 * u, B.shY + 0.6 * u], EL], 0.42 * u, 0.36 * u, moss, { s: 0.07 * u });
      H.skinLimb(ctx, [[EL[0] + 0.03 * u, EL[1]], WL], 0.24 * u, 0.18 * u, skin);
      H.limb(ctx, [[EL[0] - 0.02 * u, EL[1] + 0.06 * u], [EL[0] + 0.06 * u, EL[1] - 0.12 * u]], 0.36 * u, 0.32 * u, DZ.lt(moss, 0.12), { s: 1.5 });
      // mushroom
      if (!DZ.sil) DZ.glow(ctx, WL[0], WL[1] - 0.45 * u, 0.4 * u, '#c86ad8', 0.55);
      cel(ctx, ribbon([[WL[0] + 0.02 * u, WL[1] - 0.05 * u], [WL[0] + 0.0 * u, WL[1] - 0.38 * u]], 0.06 * u, 0.05 * u), { c: '#efe4d0', s: 1, h: 0, rim: 0, lw: 1.1 });
      cel(ctx, sp([[WL[0] - 0.2 * u, WL[1] - 0.36 * u], [WL[0] - 0.12 * u, WL[1] - 0.52 * u], [WL[0] + 0.02 * u, WL[1] - 0.57 * u], [WL[0] + 0.17 * u, WL[1] - 0.5 * u], [WL[0] + 0.22 * u, WL[1] - 0.36 * u]]), { c: '#c86ad8', s: 2, h: 1.2, rim: 1, lw: 1.3, fx: (c) => { if (DZ.sil) return; c.fillStyle = '#f6e6ff'; [[-0.08, -0.47], [0.06, -0.5], [0.13, -0.41]].forEach(([dx, dy]) => { c.beginPath(); c.arc(WL[0] + dx * u, WL[1] + dy * u, 0.022 * u, 0, 7); c.fill(); }); } });
      DZ.hand(ctx, WL[0], WL[1], Math.PI - 0.1, 0.6 * u, 'fist', 1, skin);
      // hoe 藥鋤 over the viewer-right shoulder
      const WR = [cx + 0.42 * u, B.chestY + 0.15 * u];
      H.limb(ctx, [[cx + 0.85 * u, B.shY + 0.12 * u], [cx + 1.0 * u, B.shY + 0.6 * u], [cx + 0.95 * u, B.waistY - 0.15 * u]], 0.42 * u, 0.36 * u, moss, { s: 0.07 * u });
      H.limb(ctx, [[cx + 0.97 * u, B.waistY - 0.05 * u], [cx + 0.86 * u, B.waistY - 0.25 * u]], 0.36 * u, 0.32 * u, DZ.lt(moss, 0.12), { s: 1.5 });
      H.skinLimb(ctx, [[cx + 0.9 * u, B.waistY - 0.15 * u], [cx + 0.68 * u, B.chestY + 0.35 * u], WR], 0.24 * u, 0.18 * u, skin);
      cel(ctx, ribbon([[WR[0] - 0.25 * u, WR[1] + 0.25 * u], [cx + 0.95 * u, B.shY - 0.15 * u], tip], 0.075 * u, 0.065 * u), { c: '#8a6038', s: 1, h: 0.6, rim: 1, lw: 1.4 });
      cel(ctx, sp([[tip[0] - 0.05 * u, tip[1] - 0.04 * u], [tip[0] + 0.12 * u, tip[1] - 0.12 * u], [tip[0] + 0.32 * u, tip[1] + 0.08 * u, 1], [tip[0] + 0.12 * u, tip[1] + 0.24 * u, 1], [tip[0] + 0.05 * u, tip[1] + 0.06 * u]]), { c: '#6d7480', s: 1.5, h: 1, rim: 1.2, lw: 1.4 });
      DZ.hand(ctx, WR[0], WR[1], -Math.PI * 0.72, 0.6 * u, 'fist', -1, skin);
      // head
      const tilt = 0.06;
      ctx.save(); ctx.translate(cx, B.chin); ctx.rotate(tilt); ctx.translate(-cx, -B.chin);
      const F = {
        skin, stub: 0.22, blushA: 0.14,
        shape: { t: [0.38, 0.41], c: [0.375, 0.6], j: [0.29, 0.85], ch: [0.12, 0.975], chY: 1.01 },
        eye: { x: 0.17, y: 0.56, w: 0.16, h: 0.062, tilt: -0.05, open: 0.42, iris: '#4a3020', ir: 0.039, crease: 0.4, creaseH: 1.1, peak: 0.42, lidW: 0.024, gaze: -0.1, bag: 0.7 },
        brow: { type: 'bushy', y: 0.45, w: 0.19, th: 0.026, tilt: -0.04, arch: 0.01, col: '#221c18' },
        nose: { type: 'bridge', y: 0.74, w: 0.055 }, mouth: { type: 'smirk', y: 0.86, w: 0.13 },
        extra: (c) => { c.fillStyle = '#5a3a2a'; c.beginPath(); c.arc(-0.2, 0.64, 0.012, 0, 7); c.fill(); },
      };
      DZ.head(ctx, F, cx, hb, u);
      const capP = sp([[cx - 0.46 * u, hb + 0.55 * u], [cx - 0.46 * u, hb + 0.18 * u], [cx, hb - 0.04 * u], [cx + 0.46 * u, hb + 0.18 * u], [cx + 0.46 * u, hb + 0.55 * u], [cx + 0.3 * u, hb + 0.3 * u], [cx, hb + 0.24 * u], [cx - 0.3 * u, hb + 0.3 * u]]);
      const bangs = [[[-0.3, 0.2], [-0.36, 0.42], [-0.28, 0.55]], [[-0.12, 0.2], [-0.2, 0.36], [-0.14, 0.48]], [[0.06, 0.2], [0.04, 0.38], [0.12, 0.47]], [[0.22, 0.2], [0.3, 0.38], [0.36, 0.52]], [[0.38, 0.28], [0.44, 0.5], [0.42, 0.66]]].map((pp, i) => ribbon(pp.map((q) => [cx + q[0] * u, hb + q[1] * u]), 0.15 * u, 0.008 * u, 0.15 * u));
      H.hair(ctx, [capP].concat(bangs), hc);
      // 斗笠 bamboo hat + chin cord
      if (!DZ.sil) DZ.line(ctx, [[cx - 0.42 * u, hb + 0.3 * u], [cx - 0.3 * u, B.chin + 0.02 * u], [cx + 0.3 * u, B.chin + 0.02 * u], [cx + 0.42 * u, hb + 0.3 * u]], 1, '#5a4126');
      const under = sp([[cx - 1.18 * u, hb + 0.2 * u], [cx, hb + 0.04 * u], [cx + 1.2 * u, hb + 0.06 * u], [cx, hb + 0.3 * u]]);
      cel(ctx, under, { c: DZ.dk(bam, 0.45), s: 0, h: 0, rim: 0, lw: 1.6 });
      const hat = sp([[cx - 1.2 * u, hb + 0.18 * u, 1], [cx - 0.6 * u, hb - 0.12 * u], [cx + 0.02 * u, hb - 0.5 * u, 1], [cx + 0.62 * u, hb - 0.16 * u], [cx + 1.22 * u, hb + 0.04 * u, 1], [cx, hb + 0.16 * u]]);
      cel(ctx, hat, {
        c: bam, s: 0.18 * u, sd: [1, 0.2], h: 2, rim: 1.6, lw: 1.9,
        fx: (c) => { if (DZ.sil) return; for (let i = -8; i <= 8; i++) DZ.line(c, [[cx + 0.02 * u, hb - 0.5 * u], [cx + i * 0.15 * u, hb + 0.12 * u - Math.abs(i) * 0.005 * u]], 0.7, DZ.rgba(DZ.dk(bam, 0.35), 0.7)); for (let j = 1; j < 4; j++) DZ.line(c, [[cx - 1.2 * u * j / 4, hb + 0.18 * u * j / 4 - 0.5 * u * (1 - j / 4)], [cx + 0.02 * u, hb + 0.14 * u * j / 4 - 0.5 * u * (1 - j / 4) + 0.05 * u * j / 4], [cx + 1.22 * u * j / 4, hb + 0.04 * u * j / 4 - 0.5 * u * (1 - j / 4)]], 0.8, DZ.rgba(DZ.dk(bam, 0.4), 0.6)); c.fillStyle = DZ.rgba('#4b5a72', 0.9); c.fill(sp([[cx - 0.36 * u, hb - 0.27 * u], [cx + 0.38 * u, hb - 0.29 * u], [cx + 0.42 * u, hb - 0.22 * u], [cx - 0.4 * u, hb - 0.2 * u]])); },
      });
      ctx.restore();
      return [
        { zh: '斗笠', en: 'bamboo rain hat', p: [cx - 0.7 * u, hb - 0.05 * u], side: -1 },
        { zh: '大襟短衫', en: 'side-fastened jacket', p: [cx - 0.5 * u, B.shY + 0.3 * u], side: -1 },
        { zh: '藥鋤・竹籃', en: 'herb hoe & basket', p: [cx + 1.62 * u, B.chestY + 0.1 * u], side: 1 },
        { zh: '放大鏡', en: 'brass hand lens', p: [cx + 0.56 * u, sy + 0.5 * u], side: 1 },
        { zh: '蕈袋', en: 'specimen pouches', p: [cx - 0.5 * u, sy + 0.3 * u], side: -1 },
        { zh: '綁腿・草鞋', en: 'leg wraps, sandals', p: [cx + 0.32 * u, B.gy - 0.6 * u], side: 1 },
      ];
    },
  });

  // ============================================================ 05 五雷令 — thunder adept (action)
  OPT({
    zh: '五雷令', en: 'Five-Thunder Adept', tag: '戰鬥形態・奇幻 Battle / fantasy',
    idea: '「木（雷）」屬性的戰鬥型：箭袖勁裝、胸前符筒彈帶，一手高舉五雷符劈下青雷，一手張開畫著雷雲的摺扇——懶人認真時最快。',
    shape: '大對角線：高舉的手臂、甩動的高馬尾與開衩下擺形成「閃電形」Z 字；銳角、雷紋鋸齒，速度感最強。',
    culture: '箭袖（馬蹄袖）勁裝與開衩長袍為清代行旅、習武常見；道教「五雷正法」以雷符、令牌召雷。幻想處：符筒彈帶、青金雷光、雷紋滾邊與發光的金色瞳孔。',
    ratio: 7.5, H: 372, bg: ['#d5e3df', '#93ada7'], accent: '#2f7a6a', dx: 8,
    palette: [['青碧勁裝 Teal robe', '#2f6f63'], ['墨綠 Deep green', '#1d3f3a'], ['雷金 Thunder gold', '#d9b24a'], ['黑褲靴 Black', '#1f2026'], ['雷光 Bolt glow', '#7dffd2'], ['膚 Skin', '#ecc9a8'], ['墨髮 Hair', '#1b1d22']],
    bust: { y: -0.3, z: 1.6, x: -0.25 },
    draw(ctx, B, o) {
      const u = B.u, cx = B.cx, hb = B.top;
      const skin = '#ecc9a8', teal = '#2f6f63', dg = '#1d3f3a', gold = '#d9b24a', blk = '#1f2026', bolt = '#7dffd2';
      const hc = { c: '#1b1d22', sh: '#0b0c10', hi: '#3f6a62', ln: '#060708', rim: '#9fffe0' };
      const feet = [cx - 0.58 * u, cx + 0.55 * u];
      // ponytail whipping behind
      const tails = [
        ribbon([[cx + 0.05 * u, hb - 0.1 * u], [cx + 0.45 * u, hb - 0.3 * u], [cx + 0.95 * u, hb - 0.15 * u], [cx + 1.25 * u, hb + 0.25 * u], [cx + 1.6 * u, hb + 0.45 * u]], 0.2 * u, 0.01 * u, 0.22 * u),
        ribbon([[cx + 0.05 * u, hb - 0.08 * u], [cx + 0.5 * u, hb - 0.18 * u], [cx + 0.85 * u, hb + 0.05 * u], [cx + 1.05 * u, hb + 0.5 * u], [cx + 1.35 * u, hb + 0.78 * u]], 0.18 * u, 0.01 * u, 0.18 * u),
        ribbon([[cx + 0.05 * u, hb - 0.12 * u], [cx + 0.55 * u, hb - 0.38 * u], [cx + 1.1 * u, hb - 0.32 * u], [cx + 1.55 * u, hb - 0.05 * u], [cx + 1.85 * u, hb - 0.02 * u]], 0.16 * u, 0.01 * u, 0.15 * u),
      ];
      H.hair(ctx, tails, hc, { fx: (c, i) => { if (!DZ.sil && i === 0) H.strands(c, [[[cx + 0.3 * u, hb - 0.2 * u], [cx + 0.9 * u, hb - 0.12 * u], [cx + 1.4 * u, hb + 0.35 * u]]], hc, 0.03 * u); } });
      H.neck(ctx, B, skin, { w: 0.15, adam: true });
      // legs + boots
      H.trousers(ctx, B, { c: blk, hemY: B.gy - 0.62 * u, feet, wHem: 0.22, kneeW: 0.3 });
      for (const fx of feet) cel(ctx, sp([[fx - 0.2 * u, B.gy - 0.75 * u], [fx + 0.2 * u, B.gy - 0.75 * u], [fx + 0.19 * u, B.gy - 0.15 * u], [fx + 0.23 * u, B.gy - 0.02 * u], [fx - 0.23 * u, B.gy - 0.02 * u], [fx - 0.19 * u, B.gy - 0.15 * u]]), { c: '#2a2a30', s: 2.5, h: 1, rim: 1.5, lw: 1.7, fx: (c) => { if (!DZ.sil) { c.fillStyle = gold; c.fillRect(fx - 0.2 * u, B.gy - 0.75 * u, 0.4 * u, 0.06 * u); c.fillStyle = '#efe9dc'; c.fillRect(fx - 0.24 * u, B.gy - 0.08 * u, 0.48 * u, 0.06 * u); } } });
      // split robe: front panel + flaring side panels
      const sy = B.waistY;
      const panel = (pts, col) => cel(ctx, sp(pts), { c: col, s: 0.1 * u, sd: [1, 0.2], h: 1.6, rim: 1.6, lw: 1.9, fx: (c) => { if (DZ.sil) return; c.save(); c.clip(sp(pts)); DZ.crescent(c, sp(pts), [0, 0.15 * u], gold); c.restore(); } });
      panel([[cx - 0.62 * u, sy], [cx - 0.75 * u, B.hipY], [cx - 1.25 * u, B.kneeY + 0.15 * u], [cx - 1.55 * u, B.kneeY + 0.55 * u, 1], [cx - 0.95 * u, B.kneeY + 0.75 * u, 1], [cx - 0.55 * u, B.hipY + 0.3 * u]], dg);
      panel([[cx + 0.62 * u, sy], [cx + 0.75 * u, B.hipY], [cx + 1.3 * u, B.kneeY + 0.05 * u], [cx + 1.62 * u, B.kneeY + 0.4 * u, 1], [cx + 1.0 * u, B.kneeY + 0.65 * u, 1], [cx + 0.55 * u, B.hipY + 0.3 * u]], dg);
      // torso
      const vY = B.chestY - 0.1 * u;
      const torso = H.robe(B, { vY, hemY: B.hipY + 0.2 * u, hem: 0.74, waist: 0.6, hip: 0.72, wave: 0 });
      cel(ctx, torso, { c: teal, s: 0.18 * u, h: 2, rim: 1.8, lw: 2, fx: (c) => { fold(c, [[cx - 0.5 * u, B.shY + 0.45 * u], [cx - 0.38 * u, B.chestY + 0.3 * u], [cx - 0.3 * u, sy - 0.1 * u]], 0.07 * u, DZ.rgba(DZ.dk(teal, 0.3), 0.7)); } });
      // front apron panel
      panel([[cx - 0.5 * u, sy], [cx + 0.5 * u, sy], [cx + 0.6 * u, B.kneeY], [cx + 0.66 * u, B.kneeY + 0.85 * u, 1], [cx, B.kneeY + 0.95 * u], [cx - 0.66 * u, B.kneeY + 0.85 * u, 1], [cx - 0.6 * u, B.kneeY]], teal);
      if (!DZ.sil) { ctx.save(); ctx.clip(sp([[cx - 0.5 * u, sy], [cx + 0.5 * u, sy], [cx + 0.66 * u, B.kneeY + 0.85 * u], [cx, B.kneeY + 0.95 * u], [cx - 0.66 * u, B.kneeY + 0.85 * u]])); DZ.meander(ctx, cx - 0.66 * u, cx + 0.66 * u, B.kneeY + 0.68 * u, 0.13 * u, dg, 1.4); H.robeFolds(ctx, B, teal, sy + 0.3 * u, B.kneeY + 0.9 * u, [-0.35, 0.05, 0.4], { w: 0.16 }); ctx.restore(); }
      H.crossCollar(ctx, B, { vY, band: dg, guard: '#efeadf', endY: sy, endX: 0.5 });
      // bandolier of talisman tubes
      const bp = [[cx - 0.55 * u, B.shY - 0.05 * u], [cx - 0.1 * u, B.chestY + 0.05 * u], [cx + 0.55 * u, sy - 0.08 * u]];
      DZ.tp(ctx, bp, 0.13 * u, 0.13 * u, '#5a3a24');
      if (!DZ.sil) DZ.dense(bp, 4).forEach((q, i) => { if (i % 2 || i < 2 || i > 11) return; cel(ctx, DZ.poly([[q[0] - 0.045 * u, q[1] - 0.12 * u], [q[0] + 0.045 * u, q[1] - 0.12 * u], [q[0] + 0.045 * u, q[1] + 0.07 * u], [q[0] - 0.045 * u, q[1] + 0.07 * u]]), { c: '#e8c65a', s: 1, h: 0, rim: 0, lw: 0.9, fx: (c) => { c.fillStyle = '#b3261e'; c.fillRect(q[0] - 0.045 * u, q[1] - 0.12 * u, 0.09 * u, 0.03 * u); } }); });
      // belt + thunder seal
      cel(ctx, sp([[cx - 0.64 * u, sy - 0.12 * u], [cx + 0.64 * u, sy - 0.12 * u], [cx + 0.66 * u, sy + 0.1 * u], [cx - 0.66 * u, sy + 0.1 * u]]), { c: blk, s: 2, h: 1, rim: 1.3, lw: 1.6 });
      cel(ctx, DZ.ell(cx, sy, 0.17 * u, 0.17 * u), { c: '#b08a3a', s: 2, h: 1.2, rim: 1, lw: 1.5, fx: (c) => { if (DZ.sil) return; c.fillStyle = '#3a2a14'; c.font = DZ.font(0.2 * u, 700, 'serif'); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('雷', cx, sy + 0.01 * u); } });
      // viewer-right arm: open thunder fan
      const SR = [cx + 0.86 * u, B.shY + 0.1 * u], ER = [cx + 1.22 * u, B.waistY - 0.15 * u], WR = [cx + 1.55 * u, B.hipY + 0.05 * u];
      H.limb(ctx, [SR, ER, WR], 0.36 * u, 0.24 * u, teal, { s: 0.06 * u });
      cel(ctx, sp([[WR[0] - 0.16 * u, WR[1] - 0.12 * u], [WR[0] + 0.12 * u, WR[1] - 0.2 * u], [WR[0] + 0.2 * u, WR[1] + 0.06 * u], [WR[0] - 0.05 * u, WR[1] + 0.12 * u]]), { c: dg, s: 1, h: 0, rim: 0, lw: 1.4, fx: (c) => { if (!DZ.sil) DZ.meander(c, WR[0] - 0.16 * u, WR[0] + 0.2 * u, WR[1] - 0.04 * u, 0.09 * u, gold, 0.8); } });
      DZ.fan(ctx, WR[0] + 0.12 * u, WR[1] + 0.25 * u, 0.95 * u, 2.2, { leaf: '#efe9d6', rib: '#2a2a30', spread: 2.0, paint: (c, r, ri) => { c.strokeStyle = '#2f6f63'; c.lineWidth = 0.05 * u; c.beginPath(); c.moveTo(-r * 0.5, -r * 0.62); c.lineTo(-r * 0.15, -r * 0.82); c.lineTo(-r * 0.05, -r * 0.6); c.lineTo(r * 0.3, -r * 0.84); c.stroke(); DZ.cloud(c, r * 0.25, -r * 0.6, r * 0.12, '#2f6f63', 1.2); } });
      DZ.hand(ctx, WR[0], WR[1], -0.5, 0.58 * u, 'fist', -1, skin);
      // viewer-left arm raised: talisman crackling
      const SL = [cx - 0.86 * u, B.shY + 0.05 * u], EL = [cx - 1.32 * u, B.shY - 0.5 * u], WL = [cx - 1.15 * u, hb - 0.12 * u];
      H.limb(ctx, [SL, [cx - 1.15 * u, B.shY - 0.3 * u], EL, WL], 0.38 * u, 0.24 * u, teal, { s: 0.06 * u });
      cel(ctx, sp([[WL[0] - 0.18 * u, WL[1] + 0.15 * u], [WL[0] + 0.15 * u, WL[1] + 0.1 * u], [WL[0] + 0.12 * u, WL[1] - 0.06 * u], [WL[0] - 0.14 * u, WL[1] - 0.04 * u]]), { c: dg, s: 1, h: 0, rim: 0, lw: 1.4 });
      if (!DZ.sil) {
        DZ.glow(ctx, WL[0] + 0.05 * u, WL[1] - 0.75 * u, 1.3 * u, bolt, 0.55);
        const zig = (pts, w) => { DZ.tp(ctx, pts, w * 1.8, w * 0.4, DZ.rgba(bolt, 0.45)); DZ.tp(ctx, pts, w, w * 0.2, '#f2fff9'); };
        zig([[WL[0] + 0.05 * u, WL[1] - 0.7 * u], [WL[0] + 0.4 * u, WL[1] - 1.0 * u], [WL[0] + 0.25 * u, WL[1] - 1.25 * u], [WL[0] + 0.7 * u, WL[1] - 1.55 * u]], 0.05 * u);
        zig([[WL[0] - 0.05 * u, WL[1] - 0.6 * u], [WL[0] - 0.45 * u, WL[1] - 0.75 * u], [WL[0] - 0.35 * u, WL[1] - 1.0 * u], [WL[0] - 0.75 * u, WL[1] - 1.2 * u]], 0.04 * u);
        zig([[WL[0] - 0.1 * u, WL[1] - 0.2 * u], [WL[0] - 0.55 * u, WL[1] + 0.05 * u], [WL[0] - 0.5 * u, WL[1] + 0.35 * u], [WL[0] - 0.85 * u, WL[1] + 0.55 * u]], 0.035 * u);
        DZ.fu(ctx, cx + 1.05 * u, B.shY - 0.4 * u, 0.15 * u, 0.42 * u, 0.5, { paper: '#e8c65a' });
        DZ.fu(ctx, cx - 1.65 * u, B.waistY + 0.2 * u, 0.15 * u, 0.42 * u, -0.6);
      }
      DZ.fu(ctx, WL[0] + 0.05 * u, WL[1] - 0.6 * u, 0.2 * u, 0.55 * u, 0.1, { paper: '#f2df8a' });
      DZ.hand(ctx, WL[0], WL[1], Math.PI + 0.1, 0.6 * u, 'pinch', 1, skin);
      // head
      const F = {
        skin, blushA: 0.1,
        shape: { t: [0.38, 0.4], c: [0.38, 0.57], cb: 0.01, j: [0.27, 0.82], ch: [0.085, 0.968] },
        eye: { x: 0.17, y: 0.55, w: 0.165, h: 0.06, tilt: 0.22, open: 0.7, iris: '#c9a12a', ir: 0.04, crease: 0.3, peak: 0.62, lidW: 0.028, gaze: -0.12, pupilR: 0.32 },
        brow: { type: 'sharp', y: 0.435, w: 0.2, th: 0.03, tilt: 0.24, arch: 0.012, col: '#14151a' },
        nose: { type: 'bridge', y: 0.725, w: 0.048 }, mouth: { type: 'smirk', y: 0.848, w: 0.13 },
      };
      DZ.head(ctx, F, cx, hb, u);
      const capP = sp([[cx - 0.47 * u, hb + 0.45 * u], [cx - 0.47 * u, hb + 0.15 * u], [cx - 0.25 * u, hb - 0.05 * u], [cx, hb - 0.08 * u], [cx + 0.25 * u, hb - 0.05 * u], [cx + 0.47 * u, hb + 0.15 * u], [cx + 0.47 * u, hb + 0.45 * u], [cx + 0.36 * u, hb + 0.24 * u], [cx, hb + 0.16 * u], [cx - 0.36 * u, hb + 0.24 * u]]);
      const swept = [ribbon([[cx - 0.06 * u, hb + 0.16 * u], [cx - 0.2 * u, hb + 0.34 * u], [cx - 0.27 * u, hb + 0.56 * u]], 0.07 * u, 0.006 * u), ribbon([[cx + 0.1 * u, hb + 0.16 * u], [cx + 0.22 * u, hb + 0.3 * u], [cx + 0.2 * u, hb + 0.46 * u]], 0.05 * u, 0.005 * u), ribbon([[cx - 0.4 * u, hb + 0.3 * u], [cx - 0.45 * u, hb + 0.55 * u], [cx - 0.42 * u, B.chin - 0.05 * u]], 0.08 * u, 0.01 * u), ribbon([[cx + 0.4 * u, hb + 0.3 * u], [cx + 0.46 * u, hb + 0.55 * u], [cx + 0.44 * u, B.chin - 0.1 * u]], 0.08 * u, 0.01 * u)];
      H.hair(ctx, [capP].concat(swept), hc, { fx: (c, i) => { if (i || DZ.sil) return; H.strands(c, [[[cx - 0.35 * u, hb + 0.25 * u], [cx - 0.2 * u, hb + 0.02 * u], [cx, hb - 0.05 * u]], [[cx + 0.35 * u, hb + 0.25 * u], [cx + 0.2 * u, hb + 0.02 * u], [cx + 0.02 * u, hb - 0.05 * u]], [[cx - 0.15 * u, hb + 0.17 * u], [cx - 0.05 * u, hb]], [[cx + 0.15 * u, hb + 0.17 * u], [cx + 0.07 * u, hb]]], hc, 0.03 * u); } });
      cel(ctx, DZ.ell(cx + 0.03 * u, hb - 0.08 * u, 0.13 * u, 0.1 * u), { c: '#3f8a6e', s: 1.5, h: 1, rim: 0, lw: 1.3 });
      if (!DZ.sil) { DZ.glow(ctx, cx - 0.17 * u, hb + 0.55 * u, 0.12 * u, bolt, 0.5); DZ.glow(ctx, cx + 0.17 * u, hb + 0.55 * u, 0.12 * u, bolt, 0.5); }
      return [
        { zh: '高馬尾・綠繩', en: 'high tail, green cord', p: [cx + 1.1 * u, hb - 0.12 * u], side: 1 },
        { zh: '五雷符', en: 'five-thunder talisman', p: [WL[0] + 0.05 * u, WL[1] - 0.5 * u], side: -1 },
        { zh: '符筒彈帶', en: 'talisman bandolier', p: [cx - 0.1 * u, B.chestY + 0.05 * u], side: -1 },
        { zh: '箭袖', en: 'arrow (hoof) cuff', p: [WR[0] + 0.05 * u, WR[1] - 0.12 * u], side: 1 },
        { zh: '雷紋開衩袍', en: 'split robe, thunder hem', p: [cx - 1.2 * u, B.kneeY + 0.5 * u], side: -1 },
        { zh: '雷扇', en: 'thunder-cloud fan', p: [WR[0] + 0.5 * u, WR[1] + 0.7 * u], side: 1 },
      ];
    },
  });

  // ============================================================ 06 內景遊者 — inner-landscape visionary
  OPT({
    zh: '內景遊者', en: 'Inner-landscape Seer', tag: '奇幻詮釋 Bold fantasy',
    idea: '偷讀「內景」禁書的那一面：苔綠斗篷內襯印著〈內經圖〉，手提一罐發光的七彩靈蕈當燈——半睡半醒、像隨時會看見別人看不見的東西。',
    shape: '大鐘形斗篷＝柔和的圓錐，帽兜在肩後形成厚領；唯一的亮點是低垂在身側的蕈燈，圓潤、安靜、神秘。',
    culture: '清代斗篷（一口鐘）為冬日常見外衣；〈內經圖〉是清代道教內丹「人體山水」圖。幻想處：把內經圖印成斗篷內襯、七彩靈蕈玻璃罐燈、紫灰「靈視」瞳色。',
    ratio: 7, H: 388, bg: ['#e7e2ea', '#b6aec2'], accent: '#6b5a8e', dx: 10,
    palette: [['苔綠斗篷 Moss cloak', '#5e6e4a'], ['內襯靛紫 Lining', '#3d3560'], ['內經圖金 Map gold', '#d8b25a'], ['長衫米白 Under-robe', '#e9e1cc'], ['七彩靈蕈 Mushroom glow', '#b77ae0'], ['膚 Skin', '#f0d6c0'], ['髮 Green-black hair', '#1f2622']],
    bust: { y: -0.25, z: 1.65 },
    draw(ctx, B, o) {
      const u = B.u, cx = B.cx, hb = B.top;
      const skin = '#f0d6c0', moss = '#5e6e4a', lin = '#3d3560', gold = '#d8b25a', cream = '#e9e1cc', glowC = '#b77ae0';
      const hc = { c: '#1f2622', sh: '#0d110f', hi: '#4a6656', ln: '#070908', rim: '#d6c4f0' };
      // back hair mass (shoulder length, loose)
      cel(ctx, sp([[cx - 0.5 * u, hb + 0.3 * u], [cx - 0.6 * u, B.chin], [cx - 0.62 * u, B.shY + 0.2 * u], [cx - 0.3 * u, B.shY + 0.1 * u], [cx + 0.3 * u, B.shY + 0.1 * u], [cx + 0.62 * u, B.shY + 0.2 * u], [cx + 0.6 * u, B.chin], [cx + 0.5 * u, hb + 0.3 * u], [cx, hb - 0.06 * u]]), { c: DZ.dk(hc.c, 0.1), sh: hc.sh, s: 3, h: 0, rim: 1.4, rimC: hc.rim, lw: 1.6, ln: hc.ln });
      H.neck(ctx, B, skin, { w: 0.14 });
      H.shoes(ctx, B, { type: 'cloth', c: '#3a3446', sole: '#e9e2d2', spread: 0.24, w: 0.16 });
      // under-robe (長衫)
      const robe = H.robe(B, { vY: B.chestY - 0.05 * u, hemY: B.gy - 0.38 * u, hem: 0.85, waist: 0.6, hip: 0.7, knee: 0.8 });
      cel(ctx, robe, { c: cream, s: 0.15 * u, h: 2, rim: 1.5, lw: 1.8, fx: (c) => H.robeFolds(c, B, cream, B.waistY, B.gy - 0.38 * u, [-0.3, 0.1, 0.45], { w: 0.15 }) });
      // cloak 斗篷 (two halves, open front)
      const hemY = B.kneeY + 0.55 * u;
      for (const s of [-1, 1]) {
        const p = sp([[cx + s * 0.22 * u, B.shY - 0.3 * u, 1], [cx + s * 0.75 * u, B.shY - 0.15 * u], [cx + s * 1.05 * u, B.shY + 0.3 * u], [cx + s * 1.3 * u, B.hipY], [cx + s * 1.45 * u, hemY - 0.1 * u], [cx + s * 1.2 * u, hemY + 0.05 * u, 1], [cx + s * 0.7 * u, hemY + 0.12 * u], [cx + s * 0.42 * u, hemY + 0.1 * u, 1], [cx + s * 0.3 * u, B.hipY], [cx + s * 0.16 * u, B.chestY]]);
        cel(ctx, p, {
          c: moss, s: 0.22 * u, sd: [1, 0.2], h: 2.2, rim: 2, lw: 2.1, grad: [0, B.shY, 0, hemY, 0.35],
          fx: (c) => {
            if (DZ.sil) return;
            const fs = DZ.rgba(DZ.dk(moss, 0.32), 0.75);
            DZ.drape(c, cx + s * 0.95 * u, B.chestY, hemY + 0.1 * u, 0.32 * u, s * 0.06 * u, fs);
            DZ.drape(c, cx + s * 0.6 * u, B.waistY, hemY + 0.1 * u, 0.22 * u, 0, fs);
            // turned-back lining strip along the front edge with inner-landscape map print
            const edge = sp([[cx + s * 0.16 * u, B.chestY], [cx + s * 0.3 * u, B.hipY], [cx + s * 0.42 * u, hemY + 0.1 * u], [cx + s * 0.7 * u, hemY + 0.12 * u], [cx + s * 0.62 * u, B.hipY], [cx + s * 0.4 * u, B.chestY - 0.2 * u]]);
            c.fillStyle = lin; c.fill(edge);
            c.save(); c.clip(edge);
            for (let k = 0; k < 6; k++) { const yy = B.chestY + k * 0.55 * u; c.strokeStyle = gold; c.lineWidth = 0.02 * u; c.beginPath(); c.moveTo(cx + s * 0.2 * u, yy + 0.2 * u); c.lineTo(cx + s * 0.32 * u, yy); c.lineTo(cx + s * 0.42 * u, yy + 0.15 * u); c.lineTo(cx + s * 0.55 * u, yy - 0.05 * u); c.lineTo(cx + s * 0.7 * u, yy + 0.2 * u); c.stroke(); c.beginPath(); c.arc(cx + s * 0.45 * u, yy + 0.32 * u, 0.06 * u, 0, 7); c.stroke(); }
            c.restore();
            DZ.line(c, [[cx + s * 0.4 * u, B.chestY - 0.2 * u], [cx + s * 0.62 * u, B.hipY], [cx + s * 0.7 * u, hemY + 0.12 * u]], 1.2, DZ.ln(moss));
            // hem band
            c.save(); c.beginPath(); c.rect(cx - 3 * u, B.kneeY, 6 * u, 3 * u); c.clip(); DZ.crescent(c, p, [0, 0.14 * u], DZ.rgba(lin, 0.9)); c.restore();
          },
        });
      }
      // hood bunched behind the neck (collar ruff)
      cel(ctx, sp([[cx - 0.62 * u, B.shY - 0.05 * u], [cx - 0.5 * u, B.shY - 0.42 * u], [cx, B.shY - 0.52 * u], [cx + 0.5 * u, B.shY - 0.42 * u], [cx + 0.62 * u, B.shY - 0.05 * u], [cx + 0.3 * u, B.shY - 0.2 * u], [cx, B.shY - 0.24 * u], [cx - 0.3 * u, B.shY - 0.2 * u]]), { c: DZ.lt(moss, 0.08), s: 0.06 * u, h: 1.5, rim: 1.4, lw: 1.8, fx: (c) => { if (!DZ.sil) { fold(c, [[cx - 0.4 * u, B.shY - 0.35 * u], [cx - 0.2 * u, B.shY - 0.28 * u]], 0.04 * u, DZ.rgba(DZ.dk(moss, 0.3), 0.8)); fold(c, [[cx + 0.4 * u, B.shY - 0.35 * u], [cx + 0.2 * u, B.shY - 0.28 * u]], 0.04 * u, DZ.rgba(DZ.dk(moss, 0.3), 0.8)); } } });
      // toggle clasp
      cel(ctx, DZ.ell(cx, B.shY - 0.18 * u, 0.09 * u, 0.06 * u), { c: gold, s: 1, h: 1, rim: 0, lw: 1.2 });
      // book in viewer-right hand at the chest
      cel(ctx, DZ.poly([[cx + 0.02 * u, B.chestY - 0.1 * u], [cx + 0.5 * u, B.chestY - 0.16 * u], [cx + 0.55 * u, B.chestY + 0.5 * u], [cx + 0.07 * u, B.chestY + 0.56 * u]]), { c: '#4a3a5e', s: 2, h: 1, rim: 1, lw: 1.6, fx: (c) => { if (DZ.sil) return; c.fillStyle = '#efe6cf'; c.fillRect(cx + 0.33 * u, B.chestY - 0.05 * u, 0.1 * u, 0.32 * u); c.fillStyle = '#4a3a5e'; c.font = DZ.font(0.07 * u, 700, 'serif'); c.fillText('內', cx + 0.345 * u, B.chestY + 0.06 * u); c.fillText('景', cx + 0.345 * u, B.chestY + 0.16 * u); DZ.line(c, [[cx + 0.06 * u, B.chestY - 0.05 * u], [cx + 0.1 * u, B.chestY + 0.5 * u]], 0.8, '#d8b25a', [2, 2]); } });
      cel(ctx, ribbon([[cx + 0.3 * u, B.waistY + 0.1 * u], [cx + 0.14 * u, B.chestY + 0.85 * u], [cx + 0.1 * u, B.chestY + 0.62 * u]], 0.3 * u, 0.26 * u), { c: cream, s: 2, h: 0, rim: 0, lw: 1.4 });
      DZ.hand(ctx, cx + 0.1 * u, B.chestY + 0.6 * u, -2.5, 0.56 * u, 'relax', -1, skin);
      // viewer-left: hand out of the cloak front holding the mushroom lantern
      cel(ctx, ribbon([[cx - 0.22 * u, B.waistY - 0.15 * u], [cx - 0.5 * u, B.waistY + 0.1 * u], [cx - 0.8 * u, B.waistY + 0.15 * u]], 0.3 * u, 0.24 * u), { c: cream, s: 2, h: 0, rim: 1, lw: 1.6 });
      const LH = [cx - 0.86 * u, B.waistY + 0.16 * u];
      const lan = [cx - 1.0 * u, B.hipY + 0.55 * u];
      if (!DZ.sil) DZ.glow(ctx, lan[0], lan[1], 1.1 * u, glowC, 0.6);
      DZ.line(ctx, [[LH[0] - 0.05 * u, LH[1] + 0.1 * u], [lan[0] - 0.12 * u, lan[1] - 0.38 * u]], 1.2, '#3a3040');
      DZ.line(ctx, [[LH[0] - 0.05 * u, LH[1] + 0.1 * u], [lan[0] + 0.12 * u, lan[1] - 0.38 * u]], 1.2, '#3a3040');
      const jar = sp([[lan[0] - 0.16 * u, lan[1] - 0.36 * u, 1], [lan[0] + 0.16 * u, lan[1] - 0.36 * u, 1], [lan[0] + 0.24 * u, lan[1] - 0.15 * u], [lan[0] + 0.24 * u, lan[1] + 0.25 * u], [lan[0], lan[1] + 0.33 * u], [lan[0] - 0.24 * u, lan[1] + 0.25 * u], [lan[0] - 0.24 * u, lan[1] - 0.15 * u]]);
      cel(ctx, jar, { c: '#5a4a7a', s: 0, h: 0, rim: 0, lw: 1.6, fx: (c) => { if (DZ.sil) return; const g = c.createRadialGradient(lan[0], lan[1] + 0.05 * u, 0, lan[0], lan[1], 0.35 * u); g.addColorStop(0, '#fff6ff'); g.addColorStop(0.4, '#d7a6f5'); g.addColorStop(1, '#6a4a9a'); c.fillStyle = g; c.fill(jar); [[-0.1, '#ff9ad6'], [0.0, '#9af0e0'], [0.1, '#f6e48a']].forEach(([dx, col]) => { c.fillStyle = col; c.beginPath(); c.ellipse(lan[0] + dx * u, lan[1] + 0.04 * u, 0.07 * u, 0.045 * u, 0, Math.PI, 0); c.fill(); c.fillRect(lan[0] + dx * u - 0.012 * u, lan[1] + 0.04 * u, 0.024 * u, 0.15 * u); }); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(lan[0] - 0.17 * u, lan[1] - 0.25 * u, 0.04 * u, 0.4 * u); } });
      cel(ctx, DZ.poly([[lan[0] - 0.19 * u, lan[1] - 0.44 * u], [lan[0] + 0.19 * u, lan[1] - 0.44 * u], [lan[0] + 0.17 * u, lan[1] - 0.34 * u], [lan[0] - 0.17 * u, lan[1] - 0.34 * u]]), { c: '#7a6040', s: 1, h: 0, rim: 0, lw: 1.3 });
      DZ.hand(ctx, LH[0], LH[1], 0.35, 0.56 * u, 'fist', -1, skin);
      // head (slight dreamy tilt)
      const tilt = 0.09;
      ctx.save(); ctx.translate(cx, B.chin); ctx.rotate(tilt); ctx.translate(-cx, -B.chin);
      const F = {
        skin, blushA: 0.28,
        shape: { t: [0.39, 0.42], c: [0.39, 0.6], j: [0.31, 0.845], ch: [0.13, 0.955] },
        eye: { x: 0.165, y: 0.555, w: 0.165, h: 0.066, tilt: -0.03, open: 0.56, iris: '#7a68a6', ir: 0.042, crease: 0.4, creaseH: 1.2, peak: 0.45, lidW: 0.024, gaze: 0.05, bag: 1 },
        brow: { y: 0.445, w: 0.18, th: 0.018, tilt: -0.06, arch: 0.025, col: '#1f2622' },
        nose: { type: 'soft', y: 0.73, w: 0.046 }, mouth: { type: 'smile', y: 0.85, w: 0.095 },
        paint: (c) => { c.fillStyle = DZ.rgba('#8a6ab0', 0.18); for (const s2 of [-1, 1]) { c.beginPath(); c.ellipse(s2 * 0.17, 0.62, 0.07, 0.025, 0, 0, 7); c.fill(); } },
      };
      DZ.head(ctx, F, cx, hb, u);
      const capP = sp([[cx - 0.48 * u, hb + 0.55 * u], [cx - 0.5 * u, hb + 0.2 * u], [cx - 0.2 * u, hb - 0.06 * u], [cx + 0.25 * u, hb - 0.05 * u], [cx + 0.5 * u, hb + 0.2 * u], [cx + 0.48 * u, hb + 0.55 * u], [cx + 0.2 * u, hb + 0.25 * u], [cx - 0.1 * u, hb + 0.15 * u]]);
      const curtain = ribbon([[cx - 0.12 * u, hb + 0.12 * u], [cx + 0.18 * u, hb + 0.35 * u], [cx + 0.3 * u, hb + 0.62 * u], [cx + 0.26 * u, hb + 0.78 * u]], 0.12 * u, 0.02 * u, 0.24 * u);
      const locks = [[[-0.25, 0.15], [-0.44, 0.45], [-0.48, 0.85], [-0.42, 1.25]], [[0.38, 0.3], [0.5, 0.6], [0.5, 0.95], [0.58, 1.3]], [[-0.38, 0.3], [-0.5, 0.65], [-0.55, 1.05], [-0.5, 1.4]]].map((pp) => ribbon(pp.map((q) => [cx + q[0] * u, hb + q[1] * u]), 0.16 * u, 0.01 * u, 0.17 * u));
      H.hair(ctx, [capP].concat(locks, [curtain]), hc, { fx: (c, i) => { if (DZ.sil) return; if (!i) { c.strokeStyle = DZ.rgba(hc.hi, 0.9); c.lineWidth = 0.035 * u; c.beginPath(); c.ellipse(cx, hb + 0.2 * u, 0.42 * u, 0.2 * u, 0, Math.PI * 1.1, Math.PI * 1.45); c.stroke(); } } });
      // mushroom hairpin
      cel(ctx, DZ.ell(cx - 0.43 * u, hb + 0.18 * u, 0.09 * u, 0.06 * u), { c: '#b77ae0', s: 1, h: 1, rim: 0, lw: 1.2, fx: (c) => { if (!DZ.sil) { c.fillStyle = '#f2e2ff'; c.beginPath(); c.arc(cx - 0.45 * u, hb + 0.16 * u, 0.018 * u, 0, 7); c.fill(); } } });
      ctx.restore();
      return [
        { zh: '斗篷・帽兜', en: 'hooded cape (yikouzhong)', p: [cx + 0.4 * u, B.shY - 0.3 * u], side: 1 },
        { zh: '內經圖內襯', en: 'inner-landscape lining', p: [cx + 0.5 * u, B.kneeY], side: 1 },
        { zh: '禁書', en: 'forbidden neijing text', p: [cx + 0.3 * u, B.chestY + 0.15 * u], side: 1 },
        { zh: '靈蕈罐燈', en: 'spirit-mushroom jar lamp', p: [lan[0] - 0.1 * u, lan[1]], side: -1 },
        { zh: '蕈形髮簪', en: 'mushroom hairpin', p: [cx - 0.45 * u, hb + 0.2 * u], side: -1 },
        { zh: '米白長衫', en: 'cream long gown', p: [cx - 0.15 * u, B.kneeY + 0.6 * u], side: -1 },
      ];
    },
  });

  // ============================================================ 07 火居醉道 — off-duty householder (historical queue)
  OPT({
    zh: '火居醉道', en: 'Off-duty Householder', tag: '日常便服・史實 Off-duty / historical',
    idea: '下了班的火居道士：道袍脫下來綁在腰上，汗衫、大褲、柴屐，扛著一甕米酒、辮子盤在頭上——全觀音山最懶，也最好說話的人。',
    shape: '不對稱的「歪」：肩上酒甕在頭側形成大圓塊，身體重心偏一邊；裸臂、短褲、柴屐讓下半身最輕最窄。',
    culture: '台灣正一多為在家「火居道士」，平日如常人著汗衫大褲、薙髮留辮（勞動時盤辮於頭），趿柴屐；米酒裝陶甕貼紅紙。此款保留史實辮髮。幻想處：腰間綁著灰藍道袍當圍裙、酒甕貼符「防偷喝」。',
    ratio: 7, H: 384, bg: ['#f0e5d0', '#d2b88f'], accent: '#a8692a', dx: -12,
    palette: [['汗衫米白 Undershirt', '#f0ebe0'], ['大褲黑 Trousers', '#2c2a30'], ['灰藍道袍 Tied robe', '#7f93a6'], ['陶甕褐 Jar glaze', '#7a4a2a'], ['紅紙 Red label', '#c4362c'], ['膚 Skin (flushed)', '#ecc6a4'], ['辮髮 Queue', '#26222a']],
    bust: { y: -0.35, z: 1.6, x: 0.2 },
    draw(ctx, B, o) {
      const u = B.u, cx = B.cx, hb = B.top;
      const skin = '#ecc6a4', white = '#f0ebe0', blk = '#2c2a30', robeC = '#7f93a6', jarC = '#7a4a2a';
      const hc = { c: '#26222a', sh: '#121015', hi: '#5a5466', ln: '#09080b', rim: '#f0d9b8' };
      const feet = [cx - 0.34 * u, cx + 0.38 * u];
      const sy = B.waistY + 0.1 * u;
      // tied robe hanging behind the hips
      cel(ctx, sp([[cx - 0.75 * u, sy], [cx + 0.75 * u, sy], [cx + 1.0 * u, B.kneeY - 0.1 * u], [cx + 0.8 * u, B.kneeY + 0.25 * u, 1], [cx + 0.2 * u, B.kneeY + 0.15 * u], [cx - 0.5 * u, B.kneeY + 0.3 * u, 1], [cx - 0.95 * u, B.kneeY]]), { c: DZ.dk(robeC, 0.15), s: 0.1 * u, h: 1, rim: 1.4, lw: 1.8, fx: (c) => { if (!DZ.sil) { DZ.drape(c, cx - 0.6 * u, sy + 0.3 * u, B.kneeY + 0.25 * u, 0.25 * u, -0.05 * u, DZ.rgba(DZ.dk(robeC, 0.4), 0.7)); DZ.drape(c, cx + 0.6 * u, sy + 0.3 * u, B.kneeY + 0.2 * u, 0.25 * u, 0.05 * u, DZ.rgba(DZ.dk(robeC, 0.4), 0.7)); } } });
      H.neck(ctx, B, skin, { w: 0.16, adam: true });
      H.trousers(ctx, B, { c: blk, hemY: B.kneeY + 0.45 * u, feet, wHem: 0.3, kneeW: 0.36, rolled: true });
      for (const fx of feet) H.legwrap(ctx, B, fx, B.kneeY + 0.35 * u, B.gy - 0.25 * u, 0.26 * u, 0.2 * u, skin, { bare: true, sh: DZ.skinSh(skin), ln: DZ.skinLn(skin) });
      H.shoes(ctx, B, { type: 'clog', skin, spread: 0.36, dx: 0, w: 0.15, h: 0.3, c: '#8a6a44', strap: '#3a2a24' });
      // (clogs are drawn at ±spread; place them under the feet)
      // undershirt 汗衫 (short sleeves, side-fastened, collar loose)
      const shirt = sym(cx, [[0, B.shY - 0.2 * u], [0.22 * u, B.shY - 0.34 * u, 1], [0.55 * u, B.shY - 0.18 * u], [0.92 * u, B.shY + 0.05 * u], [0.86 * u, B.shY + 0.75 * u], [0.68 * u, B.waistY], [0.74 * u, B.hipY - 0.1 * u, 1], [0, B.hipY - 0.05 * u]]);
      cel(ctx, shirt, { c: white, s: 0.16 * u, h: 2, rim: 1.6, lw: 1.9, fx: (c) => { if (DZ.sil) return; DZ.tp(c, [[cx, B.shY - 0.2 * u], [cx - 0.22 * u, B.shY + 0.05 * u], [cx - 0.5 * u, B.shY + 0.35 * u], [cx - 0.6 * u, B.chestY + 0.3 * u]], 0.05 * u, 0.05 * u, '#d8d0c0'); fold(c, [[cx + 0.4 * u, B.shY + 0.4 * u], [cx + 0.3 * u, B.chestY + 0.4 * u], [cx + 0.25 * u, B.waistY]], 0.07 * u, DZ.rgba('#b8ae9c', 0.7)); fold(c, [[cx - 0.2 * u, B.chestY + 0.2 * u], [cx - 0.1 * u, B.waistY - 0.1 * u]], 0.06 * u, DZ.rgba('#b8ae9c', 0.6)); c.fillStyle = DZ.rgba('#c9b48a', 0.35); c.fill(DZ.ell(cx + 0.35 * u, B.chestY - 0.05 * u, 0.12 * u, 0.08 * u)); } });
      // tied robe sleeves knotted at the front
      const knot = [cx + 0.05 * u, sy + 0.05 * u];
      cel(ctx, ribbon([[cx - 0.72 * u, sy - 0.05 * u], [cx - 0.35 * u, sy + 0.08 * u], knot], 0.24 * u, 0.2 * u), { c: robeC, s: 2, h: 1, rim: 1.2, lw: 1.6 });
      cel(ctx, ribbon([[cx + 0.72 * u, sy - 0.05 * u], [cx + 0.4 * u, sy + 0.08 * u], knot], 0.24 * u, 0.2 * u), { c: robeC, s: 2, h: 1, rim: 1.2, lw: 1.6 });
      cel(ctx, ribbon([knot, [cx - 0.05 * u, sy + 0.45 * u], [cx - 0.12 * u, sy + 0.85 * u]], 0.2 * u, 0.3 * u), { c: robeC, s: 2.5, h: 1, rim: 1.2, lw: 1.6, fx: (c) => { if (!DZ.sil) { c.fillStyle = '#3d4a63'; c.fill(DZ.ell(cx - 0.12 * u, sy + 0.84 * u, 0.15 * u, 0.06 * u)); } } });
      cel(ctx, ribbon([knot, [cx + 0.2 * u, sy + 0.4 * u], [cx + 0.25 * u, sy + 0.7 * u]], 0.2 * u, 0.28 * u), { c: DZ.dk(robeC, 0.06), s: 2.5, h: 1, rim: 1.2, lw: 1.6, fx: (c) => { if (!DZ.sil) { c.fillStyle = '#3d4a63'; c.fill(DZ.ell(cx + 0.25 * u, sy + 0.7 * u, 0.14 * u, 0.06 * u)); } } });
      cel(ctx, DZ.ell(knot[0], knot[1], 0.13 * u, 0.11 * u), { c: robeC, s: 2, h: 1, rim: 1, lw: 1.6 });
      // fan dangling from the belt
      DZ.fan(ctx, cx - 0.45 * u, sy + 0.05 * u, 0.7 * u, Math.PI - 0.15, { closed: true, rib: '#5b3b27' });
      // viewer-left arm: hanging, bare, holding a little wine cup
      const SL = [cx - 0.82 * u, B.shY + 0.12 * u], EL = [cx - 1.0 * u, B.waistY], WL = [cx - 1.04 * u, B.hipY + 0.25 * u];
      cel(ctx, ribbon([[SL[0] + 0.05 * u, SL[1] - 0.1 * u], [SL[0] - 0.08 * u, SL[1] + 0.35 * u]], 0.42 * u, 0.36 * u), { c: white, s: 2, h: 1, rim: 1, lw: 1.6 });
      H.skinLimb(ctx, [[SL[0] - 0.06 * u, SL[1] + 0.3 * u], EL, WL], 0.28 * u, 0.19 * u, skin);
      cel(ctx, sp([[WL[0] - 0.12 * u, WL[1] + 0.32 * u], [WL[0] + 0.12 * u, WL[1] + 0.32 * u], [WL[0] + 0.08 * u, WL[1] + 0.48 * u], [WL[0] - 0.08 * u, WL[1] + 0.48 * u]]), { c: '#efe6d6', s: 1, h: 0, rim: 0, lw: 1.3, fx: (c) => { if (!DZ.sil) { c.strokeStyle = '#3d5a8a'; c.lineWidth = 0.02 * u; c.beginPath(); c.moveTo(WL[0] - 0.1 * u, WL[1] + 0.38 * u); c.lineTo(WL[0] + 0.1 * u, WL[1] + 0.38 * u); c.stroke(); } } });
      DZ.hand(ctx, WL[0], WL[1], 0.05, 0.62 * u, 'relax', -1, skin);
      // viewer-right arm: jar on the shoulder
      const SR = [cx + 0.82 * u, B.shY + 0.12 * u], ER = [cx + 1.3 * u, B.waistY - 0.35 * u], WR = [cx + 1.22 * u, B.shY - 0.45 * u];
      cel(ctx, ribbon([[SR[0] - 0.05 * u, SR[1] - 0.1 * u], [SR[0] + 0.12 * u, SR[1] + 0.32 * u]], 0.42 * u, 0.36 * u), { c: white, s: 2, h: 1, rim: 1, lw: 1.6 });
      H.skinLimb(ctx, [[SR[0] + 0.1 * u, SR[1] + 0.28 * u], ER, WR], 0.28 * u, 0.2 * u, skin);
      DZ.hand(ctx, WR[0], WR[1], Math.PI * 0.85, 0.6 * u, 'fist', 1, skin);
      const jc = [cx + 0.92 * u, B.shY - 0.42 * u];
      const jar = sp([[jc[0] - 0.18 * u, jc[1] - 0.52 * u, 1], [jc[0] + 0.18 * u, jc[1] - 0.52 * u, 1], [jc[0] + 0.22 * u, jc[1] - 0.4 * u], [jc[0] + 0.5 * u, jc[1] - 0.1 * u], [jc[0] + 0.5 * u, jc[1] + 0.3 * u], [jc[0] + 0.3 * u, jc[1] + 0.5 * u, 1], [jc[0] - 0.3 * u, jc[1] + 0.5 * u, 1], [jc[0] - 0.5 * u, jc[1] + 0.3 * u], [jc[0] - 0.5 * u, jc[1] - 0.1 * u], [jc[0] - 0.22 * u, jc[1] - 0.4 * u]]);
      cel(ctx, jar, {
        c: jarC, s: 0.12 * u, h: 2.5, hi: '#b07a4a', rim: 1.6, lw: 1.9,
        fx: (c) => {
          if (DZ.sil) return;
          c.fillStyle = '#e8dcc0'; c.fill(DZ.poly([[jc[0] - 0.22 * u, jc[1] - 0.6 * u], [jc[0] + 0.22 * u, jc[1] - 0.6 * u], [jc[0] + 0.2 * u, jc[1] - 0.46 * u], [jc[0] - 0.2 * u, jc[1] - 0.46 * u]]));
          c.fillStyle = '#c4362c'; c.fill(DZ.poly([[jc[0] - 0.2 * u, jc[1] - 0.18 * u], [jc[0] + 0.16 * u, jc[1] - 0.2 * u], [jc[0] + 0.18 * u, jc[1] + 0.25 * u], [jc[0] - 0.18 * u, jc[1] + 0.27 * u]]));
          c.fillStyle = '#1e1a1a'; c.font = DZ.font(0.15 * u, 700, 'serif'); c.textAlign = 'center'; c.fillText('米', jc[0] - 0.01 * u, jc[1] - 0.02 * u); c.fillText('酒', jc[0] - 0.01 * u, jc[1] + 0.17 * u);
          DZ.fu(c, jc[0] + 0.33 * u, jc[1] + 0.05 * u, 0.1 * u, 0.3 * u, 0.25);
        },
      });
      cel(ctx, sp([[jc[0] - 0.24 * u, jc[1] - 0.72 * u], [jc[0] + 0.24 * u, jc[1] - 0.72 * u], [jc[0] + 0.24 * u, jc[1] - 0.58 * u], [jc[0] - 0.24 * u, jc[1] - 0.58 * u]]), { c: '#c4362c', s: 1, h: 0, rim: 0, lw: 1.3 });
      // head — queue coiled round the head, shaved forehead
      const tilt = -0.1;
      ctx.save(); ctx.translate(cx, B.chin); ctx.rotate(tilt); ctx.translate(-cx, -B.chin);
      const F = {
        skin, stub: 0.16, blush: '#e0564a', blushA: 0.5,
        shape: { t: [0.4, 0.4], c: [0.395, 0.6], j: [0.32, 0.84], ch: [0.13, 0.962] },
        eye: { x: 0.172, y: 0.565, w: 0.16, h: 0.06, tilt: 0.02, open: 0.34, iris: '#4a3022', ir: 0.04, crease: 0.45, creaseH: 1.3, peak: 0.5, lidW: 0.025, gaze: 0.05, bag: 0.5 },
        brow: { y: 0.43, w: 0.19, th: 0.024, tilt: -0.08, arch: 0.03, col: '#221c20' },
        nose: { type: 'broad', y: 0.735, w: 0.058 }, mouth: { type: 'grin', y: 0.855, w: 0.16, oh: 0.04 },
        paint: (c) => { c.fillStyle = DZ.rgba('#e0564a', 0.25); c.beginPath(); c.ellipse(0.0, 0.7, 0.05, 0.025, 0, 0, 7); c.fill(); },
      };
      DZ.head(ctx, F, cx, hb, u);
      // shaved crown (blue-grey stubble tint over the skull top)
      DZ.clipDo(ctx, DZ.xf(DZ.face, new DOMMatrix([u, 0, 0, u, cx, hb])), (c) => { const g = c.createLinearGradient(0, hb, 0, hb + 0.35 * u); g.addColorStop(0, DZ.rgba('#7d8494', 0.55)); g.addColorStop(1, DZ.rgba('#7d8494', 0)); c.fillStyle = g; c.fillRect(cx - u, hb - 0.1 * u, 2 * u, 0.4 * u); });
      // back hair + coiled queue ring
      const back = sp([[cx - 0.47 * u, hb + 0.5 * u], [cx - 0.44 * u, hb + 0.25 * u], [cx - 0.3 * u, hb + 0.2 * u], [cx + 0.3 * u, hb + 0.2 * u], [cx + 0.44 * u, hb + 0.25 * u], [cx + 0.47 * u, hb + 0.5 * u], [cx + 0.42 * u, hb + 0.62 * u], [cx - 0.42 * u, hb + 0.62 * u]]);
      const ring = ribbon([[cx - 0.5 * u, hb + 0.3 * u], [cx - 0.3 * u, hb + 0.1 * u], [cx, hb + 0.06 * u], [cx + 0.3 * u, hb + 0.1 * u], [cx + 0.5 * u, hb + 0.3 * u]], 0.13 * u, 0.13 * u);
      H.hair(ctx, [ring], hc, {
        fx: (c) => { if (DZ.sil) return; DZ.dense([[cx - 0.5 * u, hb + 0.3 * u], [cx - 0.3 * u, hb + 0.1 * u], [cx, hb + 0.06 * u], [cx + 0.3 * u, hb + 0.1 * u], [cx + 0.5 * u, hb + 0.3 * u]], 4).forEach((q, i) => { if (i % 2) return; c.fillStyle = DZ.rgba(hc.hi, 0.85); c.beginPath(); c.ellipse(q[0], q[1], 0.045 * u, 0.02 * u, 0.6, 0, 7); c.fill(); }); },
      });
      // queue tail tucked & red cord
      H.hair(ctx, [ribbon([[cx + 0.48 * u, hb + 0.3 * u], [cx + 0.56 * u, hb + 0.5 * u], [cx + 0.52 * u, hb + 0.62 * u]], 0.1 * u, 0.02 * u)], hc);
      cel(ctx, DZ.ell(cx + 0.5 * u, hb + 0.36 * u, 0.05 * u, 0.04 * u), { c: '#c4362c', s: 0, h: 0, rim: 0, lw: 1 });
      // wisps
      H.hair(ctx, [ribbon([[cx - 0.4 * u, hb + 0.35 * u], [cx - 0.45 * u, hb + 0.5 * u], [cx - 0.42 * u, hb + 0.62 * u]], 0.04 * u, 0.004 * u)], hc, { lw: 1 });
      ctx.restore();
      return [
        { zh: '盤辮', en: 'queue coiled round head', p: [cx - 0.3 * u, hb + 0.12 * u], side: -1 },
        { zh: '米酒甕', en: 'rice-wine jar (+joke fu)', p: [cx + 0.9 * u, B.shY - 0.6 * u], side: 1 },
        { zh: '汗衫', en: 'side-closing undershirt', p: [cx - 0.35 * u, B.chestY + 0.2 * u], side: -1 },
        { zh: '腰綁道袍', en: 'robe knotted at the waist', p: [cx + 0.05 * u, sy + 0.05 * u], side: 1 },
        { zh: '捲褲管', en: 'rolled wide trousers', p: [cx + 0.38 * u, B.kneeY + 0.35 * u], side: 1 },
        { zh: '柴屐', en: 'wooden clogs', p: [cx - 0.34 * u, B.gy - 0.05 * u], side: -1 },
      ];
    },
  });

  // ============================================================ 08 符紙長巾 — talisman-scarf ink mage
  OPT({
    zh: '朱墨符師', en: 'Vermilion-ink Talisman Master', tag: '奇幻詮釋 Bold fantasy',
    idea: '把「符」穿在身上：一條數十張符紙連成的長巾在身後畫出 S 形，手持比人還高的符筆、筆尖滴著朱砂——字寫得比誰都好，就是懶得寫。',
    shape: '細長黑色直身＋一條黃色 S 曲線（符巾）＋一根斜線（大筆）：黑／黃高對比，剪影靠符巾與筆一眼辨識。',
    culture: '取材道教書符：黃紙、朱砂、符筆，畫符前於額點硃砂；黑色緇衣為道士常服色。幻想處：符紙連成可操控的長巾、兩側剃短的現代「辮」式（明確為奇幻改造）。',
    ratio: 7.5, H: 398, bg: ['#efe9dc', '#cdc1aa'], accent: '#b8352a', dx: 6,
    palette: [['緇衣墨黑 Ink robe', '#1e1d24'], ['符紙黃 Talisman yellow', '#e6c457'], ['朱砂 Vermilion', '#c0352a'], ['內襯朱紅 Lining', '#9a2a24'], ['筆桿竹 Bamboo', '#b48a52'], ['膚 Skin (pale)', '#f2dcc8'], ['髮 Hair', '#16151b']],
    bust: { y: -0.2, z: 1.65 },
    draw(ctx, B, o) {
      const u = B.u, cx = B.cx, hb = B.top;
      const skin = '#f2dcc8', ink = '#1e1d24', yel = '#e6c457', ver = '#c0352a';
      const hc = { c: '#16151b', sh: '#08080b', hi: '#4a4a5c', ln: '#050506', rim: '#f5d68a' };
      // talisman scarf path (behind body part first)
      const scarfBack = [[cx + 0.5 * u, B.shY - 0.1 * u], [cx + 1.0 * u, B.shY + 0.3 * u], [cx + 1.45 * u, B.waistY], [cx + 1.25 * u, B.kneeY - 0.3 * u], [cx + 1.65 * u, B.kneeY + 0.4 * u], [cx + 2.0 * u, B.gy - 0.6 * u]];
      const chain = (pts, n0) => {
        const d = DZ.dense(pts, 8);
        let acc = 0;
        for (let i = 1; i < d.length; i++) {
          acc += Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]);
          if (acc > 0.32 * u) { acc = 0; const a = Math.atan2(d[i][1] - d[i - 1][1], d[i][0] - d[i - 1][0]) - Math.PI / 2; DZ.fu(ctx, d[i][0], d[i][1], 0.22 * u, 0.4 * u, a, { paper: (i + n0) % 3 ? yel : '#f0d77a', ink: ver }); }
        }
      };
      DZ.tp(ctx, scarfBack, 0.04 * u, 0.04 * u, '#7a1f1a');
      chain(scarfBack, 0);
      // braid over the viewer-left shoulder is drawn later; neck
      H.neck(ctx, B, skin, { w: 0.14, adam: true });
      H.shoes(ctx, B, { type: 'cloth', c: '#141318', sole: '#d9d2c2', spread: 0.24, w: 0.16 });
      // slim ink robe with high side slits showing vermilion lining
      const hemY = B.gy - 0.36 * u, vY = B.chestY - 0.12 * u;
      cel(ctx, sp([[cx - 0.66 * u, B.hipY], [cx + 0.66 * u, B.hipY], [cx + 0.83 * u, hemY], [cx - 0.83 * u, hemY]]), { c: '#9a2a24', s: 2, h: 0, rim: 0, lw: 1.6 });
      const robe = H.robe(B, { vY, hemY, hem: 0.82, waist: 0.6, hip: 0.68, knee: 0.74, wave: 2 });
      cel(ctx, robe, {
        c: ink, s: 0.15 * u, h: 1.6, hi: '#3a3a48', rim: 2, lw: 2, rimC: '#f5d68a',
        fx: (c) => {
          if (DZ.sil) return;
          H.robeFolds(c, B, ink, B.waistY + 0.3 * u, hemY, [-0.35, 0.05, 0.4], { w: 0.16, a: 1 });
          // ink & vermilion splashes (texture)
          [[0.3, B.kneeY, 0.06], [0.45, B.kneeY + 0.2 * u, 0.03], [-0.4, B.hipY + 0.3 * u, 0.04]].forEach(([x, y, r]) => { c.fillStyle = DZ.rgba(ver, 0.85); c.beginPath(); c.arc(cx + x * u, y, r * u, 0, 7); c.fill(); });
          for (const s of [-1, 1]) DZ.line(c, [[cx + s * 0.62 * u, B.hipY + 0.2 * u], [cx + s * 0.78 * u, hemY + 0.05 * u]], 1.4, '#9a2a24');
        },
      });
      H.crossCollar(ctx, B, { vY, band: '#2c2a33', guard: ver, endY: B.waistY, endX: 0.5 });
      // sash
      const sy = B.waistY;
      cel(ctx, sp([[cx - 0.62 * u, sy - 0.1 * u], [cx + 0.62 * u, sy - 0.1 * u], [cx + 0.64 * u, sy + 0.1 * u], [cx - 0.64 * u, sy + 0.1 * u]]), { c: ver, s: 2, h: 1, rim: 1.2, lw: 1.6 });
      H.pouch(ctx, cx + 0.42 * u, sy + 0.08 * u, 0.3 * u, 0.34 * u, '#2c2a33', { flap: '#3c3a44', knot: yel });
      // front scarf: over the viewer-left shoulder, down the front, trailing left
      const scarfF = [[cx - 0.4 * u, B.shY - 0.2 * u], [cx - 0.75 * u, B.chestY - 0.1 * u], [cx - 0.55 * u, B.waistY + 0.4 * u], [cx - 0.95 * u, B.kneeY - 0.2 * u], [cx - 1.6 * u, B.kneeY + 0.2 * u], [cx - 1.85 * u, B.gy - 0.4 * u]];
      DZ.tp(ctx, scarfF, 0.04 * u, 0.04 * u, '#7a1f1a');
      chain(scarfF, 1);
      // viewer-right arm: pinch talisman at the chest
      const SR = [cx + 0.85 * u, B.shY + 0.1 * u], ER = [cx + 1.0 * u, B.waistY - 0.1 * u], WR = [cx + 0.5 * u, B.chestY + 0.05 * u];
      H.limb(ctx, [SR, [cx + 1.02 * u, B.shY + 0.6 * u], ER, [cx + 0.75 * u, B.chestY + 0.35 * u], WR], 0.4 * u, 0.3 * u, ink, { s: 0.06 * u, rimC: '#f5d68a' });
      cel(ctx, sp([[WR[0] + 0.18 * u, WR[1] + 0.05 * u], [WR[0] + 0.1 * u, WR[1] - 0.17 * u], [WR[0] - 0.06 * u, WR[1] - 0.12 * u], [WR[0] - 0.02 * u, WR[1] + 0.12 * u]]), { c: ver, s: 1, h: 0, rim: 0, lw: 1.3 });
      DZ.fu(ctx, WR[0] - 0.2 * u, WR[1] - 0.6 * u, 0.2 * u, 0.5 * u, -0.25, { paper: '#f0d77a' });
      DZ.hand(ctx, WR[0], WR[1], Math.PI * 0.82, 0.58 * u, 'pinch', -1, skin);
      // viewer-left arm: giant brush held diagonally
      const SL = [cx - 0.85 * u, B.shY + 0.1 * u], EL = [cx - 1.15 * u, B.waistY - 0.05 * u], WL = [cx - 0.9 * u, B.hipY + 0.1 * u];
      const b0 = [cx - 0.6 * u, B.gy - 0.15 * u], b1 = [cx - 1.68 * u, hb + 0.05 * u];
      cel(ctx, ribbon([b0, b1], 0.1 * u, 0.12 * u), { c: '#b48a52', s: 1, h: 0.8, rim: 1, lw: 1.5, fx: (c) => { if (DZ.sil) return; for (let t = 0.1; t < 0.9; t += 0.18) { const x = b0[0] + (b1[0] - b0[0]) * t, y = b0[1] + (b1[1] - b0[1]) * t; c.fillStyle = DZ.dk('#b48a52', 0.35); c.beginPath(); c.ellipse(x, y, 0.07 * u, 0.02 * u, -0.9, 0, 7); c.fill(); } } });
      const bt = [b1[0] - 0.12 * u, b1[1] - 0.18 * u];
      cel(ctx, sp([[b1[0] + 0.06 * u, b1[1] + 0.06 * u], [b1[0] - 0.14 * u, b1[1] - 0.06 * u], [bt[0] - 0.12 * u, bt[1] - 0.25 * u], [bt[0] - 0.22 * u, bt[1] - 0.42 * u, 1], [bt[0] + 0.02 * u, bt[1] - 0.2 * u], [b1[0] + 0.1 * u, b1[1] - 0.05 * u]]), { c: '#2a2026', s: 2, h: 1, rim: 1, lw: 1.5, fx: (c) => { if (!DZ.sil) { c.fillStyle = ver; c.fill(sp([[bt[0] - 0.05 * u, bt[1] - 0.2 * u], [bt[0] - 0.22 * u, bt[1] - 0.42 * u], [bt[0] - 0.02 * u, bt[1] - 0.25 * u]])); } } });
      if (!DZ.sil) { ctx.fillStyle = ver; ctx.beginPath(); ctx.ellipse(bt[0] - 0.3 * u, bt[1] - 0.3 * u, 0.03 * u, 0.045 * u, 0, 0, 7); ctx.fill(); }
      H.limb(ctx, [SL, EL, WL], 0.4 * u, 0.3 * u, ink, { s: 0.06 * u, rimC: '#f5d68a' });
      cel(ctx, sp([[WL[0] - 0.18 * u, WL[1] - 0.05 * u], [WL[0] + 0.1 * u, WL[1] - 0.18 * u], [WL[0] + 0.2 * u, WL[1] + 0.05 * u], [WL[0] - 0.08 * u, WL[1] + 0.15 * u]]), { c: ver, s: 1, h: 0, rim: 0, lw: 1.3 });
      DZ.hand(ctx, WL[0] + 0.02 * u, WL[1] + 0.04 * u, -0.6, 0.58 * u, 'fist', 1, skin);
      // head: undercut sides, long braid
      const F = {
        skin, blushA: 0.08,
        shape: { t: [0.38, 0.41], c: [0.385, 0.57], cb: 0.012, j: [0.28, 0.83], ch: [0.095, 0.968] },
        eye: { x: 0.17, y: 0.555, w: 0.17, h: 0.05, tilt: 0.16, open: 0.75, iris: '#2a1c18', ir: 0.036, crease: 0, peak: 0.6, lidW: 0.026, gaze: 0.08 },
        brow: { type: 'sharp', y: 0.445, w: 0.18, th: 0.022, tilt: 0.14, arch: 0.006, col: '#16151b' },
        nose: { type: 'bridge', y: 0.73, w: 0.045 }, mouth: { type: 'smirk', y: 0.85, w: 0.11 },
        age: { hollow: 0.6 },
        extra: (c) => { for (const s2 of [-1, 1]) { c.save(); c.scale(s2, 1); c.fillStyle = DZ.rgba(ver, 0.85); c.beginPath(); c.moveTo(0.25, 0.53); c.quadraticCurveTo(0.29, 0.51, 0.31, 0.48); c.quadraticCurveTo(0.28, 0.535, 0.24, 0.56); c.fill(); c.restore(); } c.fillStyle = ver; c.beginPath(); c.ellipse(0, 0.36, 0.014, 0.03, 0, 0, 7); c.fill(); },
      };
      DZ.head(ctx, F, cx, hb, u);
      // shaved side stubble
      DZ.clipDo(ctx, DZ.xf(DZ.face, new DOMMatrix([u, 0, 0, u, cx, hb])), (c) => { c.fillStyle = DZ.rgba('#3a3a48', 0.55); for (const s2 of [-1, 1]) c.fill(sp([[cx + s2 * 0.26 * u, hb + 0.05 * u], [cx + s2 * 0.42 * u, hb + 0.2 * u], [cx + s2 * 0.42 * u, hb + 0.48 * u], [cx + s2 * 0.36 * u, hb + 0.42 * u], [cx + s2 * 0.3 * u, hb + 0.2 * u]])); });
      const top = sp([[cx - 0.32 * u, hb + 0.24 * u], [cx - 0.3 * u, hb + 0.0 * u], [cx, hb - 0.1 * u], [cx + 0.3 * u, hb + 0.0 * u], [cx + 0.32 * u, hb + 0.24 * u], [cx + 0.12 * u, hb + 0.14 * u], [cx - 0.12 * u, hb + 0.16 * u]]);
      const fr = [ribbon([[cx - 0.08 * u, hb + 0.1 * u], [cx - 0.16 * u, hb + 0.3 * u], [cx - 0.12 * u, hb + 0.5 * u]], 0.09 * u, 0.006 * u), ribbon([[cx + 0.04 * u, hb + 0.1 * u], [cx + 0.0 * u, hb + 0.26 * u], [cx + 0.05 * u, hb + 0.4 * u]], 0.06 * u, 0.005 * u)];
      const braidPts = [[cx - 0.2 * u, hb + 0.02 * u], [cx - 0.5 * u, hb + 0.3 * u], [cx - 0.55 * u, B.chin + 0.1 * u], [cx - 0.45 * u, B.chestY - 0.1 * u], [cx - 0.38 * u, B.waistY - 0.1 * u]];
      const braid = ribbon(braidPts, 0.18 * u, 0.1 * u);
      H.hair(ctx, [braid, top].concat(fr), hc, { fx: (c, i) => { if (DZ.sil || i) return; DZ.dense(braidPts, 6).forEach((q, k) => { if (k % 2 || k < 2) return; c.fillStyle = DZ.rgba(hc.hi, 0.8); c.beginPath(); c.ellipse(q[0] + ((k / 2) % 2 ? 0.03 : -0.03) * u, q[1], 0.06 * u, 0.025 * u, (k / 2) % 2 ? 0.6 : -0.6, 0, 7); c.fill(); }); } });
      DZ.fu(ctx, cx - 0.38 * u, B.waistY + 0.18 * u, 0.15 * u, 0.36 * u, 0.1, { paper: yel });
      cel(ctx, DZ.ell(cx - 0.38 * u, B.waistY - 0.05 * u, 0.07 * u, 0.05 * u), { c: ver, s: 0, h: 0, rim: 0, lw: 1 });
      return [
        { zh: '額點硃砂', en: 'cinnabar brow dot', p: [cx, hb + 0.37 * u], side: 1 },
        { zh: '長辮繫符', en: 'braid with fu tag (fantasy)', p: [cx - 0.5 * u, B.chin + 0.2 * u], side: -1 },
        { zh: '符紙長巾', en: 'linked-talisman stole', p: [cx + 1.45 * u, B.waistY], side: 1 },
        { zh: '大符筆', en: 'giant talisman brush', p: [cx - 1.45 * u, B.shY - 0.4 * u], side: -1 },
        { zh: '朱紅內襯', en: 'vermilion lining, slits', p: [cx + 0.8 * u, B.kneeY + 0.5 * u], side: 1 },
        { zh: '黑緇衣', en: 'black Taoist robe', p: [cx - 0.3 * u, B.kneeY], side: -1 },
      ];
    },
  });

  // ============================================================ 09 引魂幡 — soul-banner funeral priest
  OPT({
    zh: '引魂幡', en: 'Soul-banner Priest', tag: '度亡科儀・寫實 Funeral rite / grounded',
    idea: '中元普渡夜的「烏頭」雲歸：黑袍白領、高方巾，手持帶竹葉的引魂幡與一盞普渡白燈——不說笑的時候，他其實很適合送人過岸。',
    shape: '最「直」的一款：高方巾＋垂直竹竿＋窄長幡，整體是三條平行直線；黑白二值，只留燈火一點冷光。',
    culture: '台灣喪葬與普渡由「烏頭」道士主持度亡；引魂幡常以留葉的竹竿懸掛，紙燈書「普渡」。方巾、黑袍白領為道士常服。幻想處：幡上符文會隨魂光流動、燈內是引魂人的藍火。',
    ratio: 7.5, H: 386, bg: ['#e3e5ea', '#aab0bd'], accent: '#3b3f52', dx: 22,
    palette: [['黑道袍 Black robe', '#1c1b22'], ['白領袖 White trims', '#efebe2'], ['幡白 Banner paper', '#f4f1e8'], ['竹青 Bamboo', '#7a9a4a'], ['魂火藍 Soul flame', '#8fd0ff'], ['膚 Skin (pale)', '#eedfd2'], ['紅裡 Red lining', '#8e2a2a']],
    bust: { y: -0.55, z: 1.6 },
    draw(ctx, B, o) {
      const u = B.u, cx = B.cx, hb = B.top;
      const skin = '#eedfd2', blk = '#1c1b22', wht = '#efebe2', bam = '#7a9a4a', soul = '#8fd0ff';
      const hc = { c: '#1a1920', sh: '#0a0a0e', hi: '#4a4c60', ln: '#060608', rim: '#cfe6ff' };
      const px = cx - 1.38 * u, ptop = hb - 0.95 * u;
      // cap ribbons behind
      for (const s of [-1, 1]) H.lock(ctx, [[cx + s * 0.2 * u, hb + 0.1 * u], [cx + s * 0.45 * u, B.chin + 0.2 * u], [cx + s * 0.55 * u, B.chestY + 0.2 * u]], 0.1 * u, 0.09 * u, { c: blk, sh: '#0a0a0e', ln: '#050506', rim: '#cfe6ff' });
      // bamboo pole + leaves + banner
      cel(ctx, ribbon([[px, B.gy - 0.05 * u], [px + 0.02 * u, ptop]], 0.11 * u, 0.07 * u), { c: '#9bb060', s: 1, h: 0.6, rim: 1, lw: 1.5, fx: (c) => { if (DZ.sil) return; for (let y = B.gy - 0.6 * u; y > ptop; y -= 0.9 * u) DZ.line(c, [[px - 0.06 * u, y], [px + 0.06 * u, y - 0.02 * u]], 1.2, DZ.dk(bam, 0.4)); } });
      [[-0.5, -0.35], [-0.3, -0.6], [0.05, -0.75], [0.35, -0.55], [0.55, -0.25], [-0.6, 0.05], [0.5, 0.1]].forEach(([dx, dy], i) => cel(ctx, ribbon([[px + 0.02 * u, ptop + 0.05 * u], [px + dx * 0.55 * u, ptop + dy * 0.5 * u], [px + dx * u, ptop + dy * u]], 0.02 * u, 0.01 * u, 0.13 * u), { c: i % 2 ? bam : DZ.dk(bam, 0.15), s: 1, h: 0, rim: 0, lw: 1.1 }));
      const bx0 = px + 0.06 * u, by0 = ptop + 0.35 * u, by1 = B.waistY + 0.2 * u;
      const ban = sp([[bx0, by0, 1], [bx0 + 0.42 * u, by0, 1], [bx0 + 0.44 * u, by1, 1], [bx0 + 0.22 * u, by1 - 0.22 * u, 1], [bx0 + 0.02 * u, by1, 1]]);
      cel(ctx, ban, { c: '#f4f1e8', s: 0.06 * u, h: 1, rim: 1, lw: 1.6, fx: (c) => { if (DZ.sil) return; c.fillStyle = '#1c1b22'; c.font = DZ.font(0.22 * u, 700, 'serif'); c.textAlign = 'center'; ['引', '魂', '歸', '岸'].forEach((ch, i) => c.fillText(ch, bx0 + 0.22 * u, by0 + (0.42 + i * 0.32) * u)); c.fillStyle = '#b3261e'; c.fillRect(bx0 + 0.12 * u, by0 + 1.5 * u, 0.2 * u, 0.2 * u); DZ.line(c, [[bx0 + 0.05 * u, by0 + 0.12 * u], [bx0 + 0.39 * u, by0 + 0.12 * u]], 1, '#1c1b22'); } });
      for (let i = 0; i < 3; i++) cel(ctx, ribbon([[bx0 + 0.44 * u, by0 + 0.1 * u + i * 0.12 * u], [bx0 + 0.75 * u, by0 + 0.4 * u + i * 0.2 * u], [bx0 + 0.6 * u + i * 0.08 * u, by0 + 1.2 * u + i * 0.25 * u]], 0.06 * u, 0.05 * u), { c: i === 1 ? '#e8e2d2' : '#f4f1e8', s: 1, h: 0, rim: 0, lw: 1.1 });
      // body
      H.backCollar(ctx, B, '#2b2a33');
      H.neck(ctx, B, skin, { w: 0.14 });
      H.shoes(ctx, B, { type: 'cloth', c: '#17161c', sole: '#efebe2', spread: 0.24, w: 0.16, sock: '#f3f0e8' });
      const vY = B.chestY - 0.1 * u, hemY = B.gy - 0.38 * u;
      const robe = H.robe(B, { vY, hemY, hem: 0.98, waist: 0.64, hip: 0.74, knee: 0.86 });
      cel(ctx, robe, { c: blk, s: 0.16 * u, h: 1.5, hi: '#34343f', rim: 2, lw: 2, fx: (c) => { H.robeFolds(c, B, blk, B.waistY + 0.3 * u, hemY, [-0.55, -0.15, 0.25, 0.6], { w: 0.18, a: 1 }); if (!DZ.sil) { c.save(); c.beginPath(); c.rect(cx - 3 * u, B.kneeY + 0.6 * u, 6 * u, 3 * u); c.clip(); DZ.crescent(c, robe, [0, 0.12 * u], wht); c.restore(); } } });
      H.crossCollar(ctx, B, { vY, band: wht, guard: '#ffffff', endY: B.waistY, endX: 0.55 });
      const sy = B.waistY;
      cel(ctx, sp([[cx - 0.64 * u, sy - 0.1 * u], [cx + 0.64 * u, sy - 0.1 * u], [cx + 0.66 * u, sy + 0.1 * u], [cx - 0.66 * u, sy + 0.1 * u]]), { c: wht, s: 2, h: 1, rim: 1, lw: 1.6 });
      H.lock(ctx, [[cx + 0.15 * u, sy + 0.05 * u], [cx + 0.2 * u, sy + 0.6 * u], [cx + 0.16 * u, sy + 1.2 * u]], 0.12 * u, 0.1 * u, { c: wht, sh: '#c9c4b8', ln: '#3a3a44', rim: '#ffffff' });
      // hanging bell 帝鐘
      DZ.line(ctx, [[cx - 0.4 * u, sy + 0.05 * u], [cx - 0.42 * u, sy + 0.35 * u]], 1.2, '#8e2a2a');
      cel(ctx, sp([[cx - 0.42 * u, sy + 0.32 * u], [cx - 0.3 * u, sy + 0.45 * u], [cx - 0.28 * u, sy + 0.62 * u, 1], [cx - 0.56 * u, sy + 0.62 * u, 1], [cx - 0.54 * u, sy + 0.45 * u]]), { c: '#b08a3a', s: 2, h: 1, rim: 1, lw: 1.4 });
      // viewer-right sleeve hanging + lantern
      const sl = H.sleeveHang(ctx, B, 1, { c: blk, out: 1.38, lining: '#8e2a2a', band: wht, wristY: B.crotchY - 0.12 * u, bot: B.crotchY + 0.6 * u });
      const lx = sl.wrist[0] + 0.25 * u, ly = B.crotchY + 0.85 * u;
      if (!DZ.sil) DZ.glow(ctx, lx, ly, 0.9 * u, soul, 0.5);
      cel(ctx, ribbon([[sl.wrist[0] - 0.04 * u, sl.wrist[1] + 0.1 * u], [lx, ly - 0.55 * u]], 0.04 * u, 0.04 * u), { c: '#5a4430', s: 0, h: 0, rim: 0, lw: 1.1 });
      DZ.line(ctx, [[lx, ly - 0.55 * u], [lx, ly - 0.32 * u]], 1, '#3a3040');
      const lan = DZ.ell(lx, ly, 0.27 * u, 0.3 * u);
      cel(ctx, lan, { c: '#f6f2ea', s: 0.05 * u, h: 0, rim: 0, lw: 1.5, fx: (c) => { if (DZ.sil) return; const g = c.createRadialGradient(lx, ly + 0.05 * u, 0, lx, ly, 0.3 * u); g.addColorStop(0, DZ.rgba(soul, 0.9)); g.addColorStop(1, DZ.rgba(soul, 0)); c.fillStyle = g; c.fill(lan); for (let k = -2; k <= 2; k++) { c.strokeStyle = DZ.rgba('#9a9488', 0.6); c.lineWidth = 0.008 * u; c.beginPath(); c.ellipse(lx, ly, Math.abs(k) * 0.07 * u + 0.01, 0.3 * u, 0, 0, 7); c.stroke(); } c.fillStyle = '#1c1b22'; c.font = DZ.font(0.13 * u, 700, 'serif'); c.textAlign = 'center'; c.fillText('普', lx, ly - 0.02 * u); c.fillText('渡', lx, ly + 0.13 * u); } });
      for (const yy of [ly - 0.32 * u, ly + 0.28 * u]) cel(ctx, DZ.ell(lx, yy, 0.13 * u, 0.04 * u), { c: '#2a2630', s: 0, h: 0, rim: 0, lw: 1 });
      DZ.hand(ctx, sl.wrist[0] - 0.06 * u, sl.wrist[1] - 0.04 * u, -0.25, 0.6 * u, 'fist', -1, skin);
      // viewer-left: sleeve over the forearm gripping the pole
      const slL = sp([[cx - 0.52 * u, B.shY - 0.2 * u], [cx - 0.95 * u, B.shY], [cx - 1.15 * u, B.shY + 0.5 * u], [cx - 1.25 * u, B.chestY + 0.15 * u], [cx - 1.5 * u, B.waistY + 0.2 * u], [cx - 1.45 * u, B.hipY + 0.3 * u], [cx - 1.2 * u, B.hipY + 0.35 * u], [cx - 0.98 * u, B.waistY + 0.2 * u], [cx - 0.82 * u, B.chestY + 0.3 * u], [cx - 0.78 * u, B.shY + 0.8 * u]]);
      cel(ctx, slL, { c: blk, s: 0.12 * u, sd: [1, 0.4], h: 1.5, hi: '#34343f', rim: 2, lw: 2, fx: (c) => { if (DZ.sil) return; DZ.drape(c, cx - 1.22 * u, B.chestY + 0.3 * u, B.hipY + 0.35 * u, 0.2 * u, -0.04 * u, DZ.rgba('#000000', 0.5)); c.lineWidth = 0.1 * u; c.strokeStyle = wht; c.stroke(sp([[cx - 1.28 * u, B.chestY + 0.05 * u], [cx - 1.18 * u, B.chestY + 0.3 * u], [cx - 1.3 * u, B.chestY + 0.5 * u]], false)); } });
      DZ.hand(ctx, px + 0.12 * u, B.chestY + 0.15 * u, -Math.PI / 2 - 0.1, 0.58 * u, 'fist', -1, skin);
      // head
      const F = {
        skin, blushA: 0.06,
        shape: { t: [0.38, 0.41], c: [0.37, 0.6], j: [0.28, 0.84], ch: [0.1, 0.97] },
        eye: { x: 0.168, y: 0.56, w: 0.165, h: 0.06, tilt: -0.04, open: 0.58, iris: '#3a3038', ir: 0.039, irisY: 0.25, crease: 0.3, peak: 0.45, lidW: 0.024, bag: 1 },
        brow: { y: 0.45, w: 0.19, th: 0.02, tilt: -0.12, arch: 0.01, col: '#1a1920' },
        nose: { type: 'bridge', y: 0.73, w: 0.046 }, mouth: { type: 'frown', y: 0.86, w: 0.1 },
        age: { hollow: 0.55, naso: 0.25 },
      };
      DZ.head(ctx, F, cx, hb, u);
      const locks = [ribbon([[cx - 0.36 * u, hb + 0.25 * u], [cx - 0.45 * u, hb + 0.7 * u], [cx - 0.44 * u, B.shY + 0.2 * u], [cx - 0.42 * u, B.chestY]], 0.12 * u, 0.02 * u, 0.13 * u), ribbon([[cx + 0.36 * u, hb + 0.25 * u], [cx + 0.45 * u, hb + 0.7 * u], [cx + 0.44 * u, B.shY + 0.2 * u], [cx + 0.42 * u, B.chestY]], 0.12 * u, 0.02 * u, 0.13 * u)];
      const capH = sp([[cx - 0.46 * u, hb + 0.45 * u], [cx - 0.44 * u, hb + 0.22 * u], [cx, hb + 0.12 * u], [cx + 0.44 * u, hb + 0.22 * u], [cx + 0.46 * u, hb + 0.45 * u], [cx + 0.3 * u, hb + 0.26 * u], [cx, hb + 0.22 * u], [cx - 0.3 * u, hb + 0.26 * u]]);
      H.hair(ctx, locks.concat([capH]), hc);
      // tall square cap 方巾
      const capT = sp([[cx - 0.46 * u, hb + 0.24 * u, 1], [cx - 0.4 * u, hb - 0.5 * u, 1], [cx + 0.4 * u, hb - 0.5 * u, 1], [cx + 0.46 * u, hb + 0.24 * u, 1], [cx, hb + 0.18 * u]]);
      cel(ctx, capT, { c: '#1f1e26', s: 0.1 * u, h: 1.5, hi: '#3c3c4a', rim: 1.8, lw: 1.9, fx: (c) => { if (DZ.sil) return; DZ.line(c, [[cx, hb - 0.5 * u], [cx, hb + 0.18 * u]], 1.1, '#3c3c4a'); c.fillStyle = '#2c2b35'; c.fill(DZ.poly([[cx - 0.45 * u, hb + 0.06 * u], [cx + 0.45 * u, hb + 0.06 * u], [cx + 0.46 * u, hb + 0.2 * u], [cx - 0.46 * u, hb + 0.2 * u]])); c.fillStyle = '#efebe2'; c.beginPath(); c.arc(cx, hb + 0.13 * u, 0.05 * u, 0, 7); c.fill(); } });
      return [
        { zh: '方巾', en: 'tall square cap', p: [cx + 0.3 * u, hb - 0.25 * u], side: 1 },
        { zh: '引魂幡', en: 'soul banner, leafy bamboo', p: [bx0 + 0.22 * u, by0 + 0.8 * u], side: -1 },
        { zh: '白護領', en: 'white collar & cuffs', p: [cx + 0.14 * u, B.shY - 0.1 * u], side: 1 },
        { zh: '帝鐘', en: 'ritual hand bell', p: [cx - 0.42 * u, sy + 0.5 * u], side: -1 },
        { zh: '普渡燈', en: 'Pudu paper lantern', p: [lx + 0.2 * u, ly], side: 1 },
        { zh: '黑道袍', en: 'black robe, white hem', p: [cx - 0.5 * u, B.gy - 0.6 * u], side: -1 },
      ];
    },
  });

  // ============================================================ 10 太虛霄遊 — void-walker (bold fantasy)
  OPT({
    zh: '太虛霄遊', en: 'Void-walker of Taixu', tag: '覺醒形態・奇幻 Awakened / bold fantasy',
    idea: '讀懂「內景」之後的雲歸：懸浮半空，身後一輪雷紋八卦，長髮與冠帶無風自飄，衣襬化成雲——適合終章覺醒、宣傳主視覺。',
    shape: '圓（身後八卦環）＋放射（漂浮的髮、袖、冠帶）＋下擺消散成雲：唯一腳不著地、底部最輕的剪影。',
    culture: '取材道教神仙圖像：蓮花冠、冠帶、輕紗外袍、腳踏雲氣；八卦與雷紋為太虛觀符號。幻想處：整體為覺醒形態而非日常服，額上雷印、玉色瞳光、衣襬化雲。',
    ratio: 7.5, H: 372, bg: ['#2d3454', '#121526'], bustBg: '#283050', accent: '#3f9f86',
    palette: [['玉紗外袍 Jade gauze', '#8fd1bd'], ['月白內袍 Moon-white', '#eef2ee'], ['夜藍 Night ink', '#1c2340'], ['雷玉光 Jade glow', '#7dffd2'], ['金八卦 Gold ring', '#e2c36a'], ['膚 Skin (luminous)', '#f3e2d4'], ['髮 Hair + white streak', '#191b26']],
    bust: { y: -0.5, z: 1.55 },
    draw(ctx, B0, o) {
      const u = B0.u;
      const B = DZ.frame(B0.cx, B0.gy - 0.55 * u, B0.H, B0.heads, { sh: 0.95 });
      const cx = B.cx, hb = B.top;
      const prevRim = DZ.rim; DZ.rim = '#9effe0';
      const skin = '#f3e2d4', jade = '#8fd1bd', moon = '#eef2ee', nightC = '#1c2340', glowC = '#7dffd2', gold = '#e2c36a';
      const hc = { c: '#191b26', sh: '#0a0b12', hi: '#3c5a6a', ln: '#05060a', rim: '#9effe0' };
      // halo: bagua ring
      const hcY = B.shY - 0.15 * u;
      if (!DZ.sil) { DZ.glow(ctx, cx, hcY, 2.1 * u, glowC, 0.35); }
      const ring = new Path2D(); ring.arc(cx, hcY, 1.62 * u, 0, Math.PI * 2); ring.arc(cx, hcY, 1.42 * u, 0, Math.PI * 2, true);
      cel(ctx, ring, { c: gold, s: 0, h: 0, rim: 0, lw: 1.5, ln: '#7a5a1a' });
      if (!DZ.sil) { DZ.bagua(ctx, cx, hcY, 1.15 * u, DZ.rgba(gold, 0.95), 0.045 * u, 0.0); ctx.strokeStyle = DZ.rgba(glowC, 0.6); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, hcY, 1.02 * u, 0, 7); ctx.stroke(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 1.62 * u, hcY + Math.sin(a) * 1.62 * u); ctx.lineTo(cx + Math.cos(a) * 1.75 * u, hcY + Math.sin(a) * 1.75 * u); ctx.stroke(); } }
      // floating hair mass behind
      const back = sp([[cx - 0.4 * u, hb + 0.2 * u], [cx - 0.9 * u, hb + 0.3 * u], [cx - 1.45 * u, hb + 0.1 * u, 1], [cx - 1.2 * u, hb + 0.6 * u], [cx - 1.6 * u, B.shY, 1], [cx - 1.05 * u, B.shY + 0.3 * u], [cx - 1.3 * u, B.chestY + 0.3 * u, 1], [cx - 0.6 * u, B.chestY], [cx, B.shY + 0.1 * u], [cx + 0.6 * u, B.chestY], [cx + 1.35 * u, B.chestY + 0.2 * u, 1], [cx + 1.05 * u, B.shY + 0.3 * u], [cx + 1.65 * u, B.shY - 0.1 * u, 1], [cx + 1.15 * u, hb + 0.55 * u], [cx + 1.5 * u, hb + 0.05 * u, 1], [cx + 0.9 * u, hb + 0.25 * u], [cx + 0.4 * u, hb + 0.2 * u], [cx, hb - 0.08 * u]]);
      cel(ctx, back, { c: DZ.dk(hc.c, 0.05), sh: hc.sh, s: 4, h: 0, rim: 2, rimC: hc.rim, lw: 1.8, ln: hc.ln, fx: (c) => { if (DZ.sil) return; H.strands(c, [[[cx - 0.5 * u, hb + 0.3 * u], [cx - 1.0 * u, hb + 0.35 * u], [cx - 1.35 * u, hb + 0.15 * u]], [[cx - 0.6 * u, B.shY - 0.1 * u], [cx - 1.1 * u, B.shY + 0.05 * u], [cx - 1.45 * u, B.shY]], [[cx + 0.5 * u, hb + 0.3 * u], [cx + 1.0 * u, hb + 0.35 * u], [cx + 1.4 * u, hb + 0.1 * u]], [[cx + 0.6 * u, B.shY - 0.1 * u], [cx + 1.1 * u, B.shY + 0.05 * u], [cx + 1.5 * u, B.shY - 0.05 * u]]], hc, 0.04 * u); } });
      // crown ribbons 冠帶 floating up and out
      for (const s of [-1, 1]) cel(ctx, ribbon([[cx + s * 0.1 * u, hb - 0.12 * u], [cx + s * 0.6 * u, hb - 0.55 * u], [cx + s * 1.1 * u, hb - 0.4 * u], [cx + s * 1.5 * u, hb - 0.75 * u]], 0.08 * u, 0.06 * u), { c: jade, s: 1.5, h: 1, rim: 1, lw: 1.4 });
      H.neck(ctx, B, skin, { w: 0.14 });
      // bare feet, toes pointed (floating)
      for (const s of [-1, 1]) cel(ctx, sp([[cx + s * 0.2 * u - 0.09 * u, B.gy - 0.75 * u], [cx + s * 0.2 * u + 0.09 * u, B.gy - 0.75 * u], [cx + s * 0.22 * u + 0.08 * u, B.gy - 0.25 * u], [cx + s * 0.24 * u, B.gy - 0.05 * u], [cx + s * 0.2 * u - 0.07 * u, B.gy - 0.25 * u]]), { c: skin, sh: DZ.skinSh(skin), s: 2, h: 0, rim: 1, lw: 1.3, ln: DZ.skinLn(skin) });
      // inner robe
      const hemY = B.gy - 0.55 * u, vY = B.chestY - 0.05 * u;
      const inner = H.robe(B, { vY, hemY, hem: 0.8, waist: 0.6, hip: 0.68, knee: 0.74 });
      cel(ctx, inner, { c: moon, s: 0.14 * u, h: 2, rim: 2, lw: 1.8, fx: (c) => H.robeFolds(c, B, moon, B.waistY + 0.3 * u, hemY, [-0.3, 0.1, 0.45], { w: 0.14 }) });
      // outer gauze robe: open front, hem dissolving into cloud lobes, sleeves floating
      for (const s of [-1, 1]) {
        const p = sp([[cx + s * 0.22 * u, B.shY - 0.32 * u, 1], [cx + s * 0.9 * u, B.shY], [cx + s * 1.0 * u, B.waistY], [cx + s * 1.25 * u, B.kneeY], [cx + s * 1.5 * u, B.kneeY + 0.55 * u], [cx + s * 1.2 * u, B.kneeY + 0.75 * u], [cx + s * 1.0 * u, B.kneeY + 0.55 * u], [cx + s * 0.8 * u, B.kneeY + 0.9 * u], [cx + s * 0.55 * u, B.kneeY + 0.65 * u], [cx + s * 0.38 * u, B.kneeY + 0.85 * u], [cx + s * 0.3 * u, B.hipY], [cx + s * 0.2 * u, B.chestY]]);
        cel(ctx, p, { c: jade, s: 0.18 * u, h: 2, rim: 2, lw: 1.9, grad: [0, B.waistY, 0, B.gy, 0.4], fx: (c) => { if (DZ.sil) return; DZ.drape(c, cx + s * 0.75 * u, B.waistY, B.kneeY + 0.7 * u, 0.25 * u, s * 0.08 * u, DZ.rgba(DZ.dk(jade, 0.3), 0.7)); DZ.cloud(c, cx + s * 0.9 * u - (s < 0 ? 0.25 * u : 0), B.kneeY + 0.3 * u, 0.14 * u, '#eaffff', 1.4, s); DZ.cloud(c, cx + s * 0.55 * u - (s < 0 ? 0.2 * u : 0), B.hipY + 0.4 * u, 0.1 * u, '#eaffff', 1.2, s); DZ.tp(c, [[cx + s * 0.2 * u, B.chestY], [cx + s * 0.3 * u, B.hipY], [cx + s * 0.4 * u, B.kneeY + 0.8 * u]], 0.08 * u, 0.08 * u, gold); } });
      }
      // sash
      const sy = B.waistY;
      cel(ctx, sp([[cx - 0.6 * u, sy - 0.1 * u], [cx + 0.6 * u, sy - 0.1 * u], [cx + 0.62 * u, sy + 0.1 * u], [cx - 0.62 * u, sy + 0.1 * u]]), { c: nightC, s: 2, h: 1, rim: 1.2, lw: 1.6 });
      DZ.taiji(ctx, cx, sy, 0.13 * u, '#eef2ee', '#1c2340', 0.8);
      H.crossCollar(ctx, B, { vY, band: nightC, guard: '#eef2ee', endY: sy, endX: 0.5 });
      // floating wing sleeves
      for (const s of [-1, 1]) {
        const p = sp([[cx + s * 0.55 * u, B.shY - 0.2 * u], [cx + s * 0.98 * u, B.shY - 0.02 * u], [cx + s * 1.5 * u, B.shY + 0.2 * u], [cx + s * 2.0 * u, B.shY + 0.05 * u, 1], [cx + s * 1.85 * u, B.chestY + 0.3 * u], [cx + s * 2.05 * u, B.waistY + 0.2 * u, 1], [cx + s * 1.5 * u, B.waistY + 0.25 * u], [cx + s * 1.1 * u, B.waistY - 0.1 * u], [cx + s * 0.8 * u, B.shY + 0.8 * u]]);
        cel(ctx, p, { c: jade, s: 0.14 * u, sd: [s, 0.4], h: 2, rim: 2, lw: 1.9, fx: (c) => { if (DZ.sil) return; DZ.tp(c, [[cx + s * 1.5 * u, B.waistY + 0.2 * u], [cx + s * 1.85 * u, B.chestY + 0.3 * u], [cx + s * 2.0 * u, B.shY + 0.08 * u]], 0.08 * u, 0.06 * u, gold); fold(c, [[cx + s * 1.0 * u, B.shY + 0.3 * u], [cx + s * 1.45 * u, B.shY + 0.5 * u], [cx + s * 1.8 * u, B.chestY + 0.2 * u]], 0.07 * u, DZ.rgba(DZ.dk(jade, 0.3), 0.8)); } });
      }
      // viewer-left: open fan before the chest; viewer-right: open palm with a hovering talisman
      DZ.fan(ctx, cx - 0.55 * u, B.chestY + 0.45 * u, 0.85 * u, -0.5, { leaf: '#f4f1e8', rib: '#2a2f48', spread: 2.0, paint: (c, r) => { c.strokeStyle = '#2f6f63'; c.lineWidth = 0.04 * u; c.beginPath(); c.moveTo(-r * 0.4, -r * 0.6); c.lineTo(-r * 0.1, -r * 0.85); c.lineTo(0, -r * 0.62); c.lineTo(r * 0.3, -r * 0.88); c.stroke(); } });
      DZ.hand(ctx, cx - 0.55 * u, B.chestY + 0.45 * u, -Math.PI * 0.75, 0.56 * u, 'fist', -1, skin);
      DZ.hand(ctx, cx + 1.4 * u, B.waistY + 0.15 * u, -0.5, 0.56 * u, 'open', 1, skin);
      if (!DZ.sil) DZ.glow(ctx, cx + 1.65 * u, B.waistY - 0.35 * u, 0.6 * u, glowC, 0.6);
      DZ.fu(ctx, cx + 1.65 * u, B.waistY - 0.4 * u, 0.18 * u, 0.48 * u, 0.25, { paper: '#e6fff6', ink: '#1f8f72' });
      // head
      const F = {
        skin, blushA: 0.12,
        shape: { t: [0.385, 0.405], c: [0.375, 0.59], j: [0.285, 0.835], ch: [0.1, 0.968] },
        eye: { x: 0.168, y: 0.55, w: 0.168, h: 0.06, tilt: 0.12, open: 0.45, iris: '#3fd6a8', ir: 0.042, crease: 0.35, peak: 0.55, lidW: 0.026, pupil: '#0d3a30', pupilR: 0.3 },
        brow: { y: 0.44, w: 0.19, th: 0.022, tilt: 0.06, arch: 0.012, col: '#191b26' },
        nose: { type: 'bridge', y: 0.725, w: 0.047 }, mouth: { type: 'neutral', y: 0.848, w: 0.11 },
        extra: (c) => { if (DZ.sil) return; c.strokeStyle = glowC; c.lineWidth = 0.014; c.beginPath(); c.moveTo(-0.02, 0.29); c.lineTo(0.02, 0.33); c.lineTo(-0.015, 0.36); c.lineTo(0.02, 0.4); c.stroke(); },
      };
      DZ.head(ctx, F, cx, hb, u);
      if (!DZ.sil) { DZ.glow(ctx, cx - 0.17 * u, hb + 0.55 * u, 0.1 * u, glowC, 0.45); DZ.glow(ctx, cx + 0.17 * u, hb + 0.55 * u, 0.1 * u, glowC, 0.45); }
      const capP = sp([[cx - 0.47 * u, hb + 0.45 * u], [cx - 0.47 * u, hb + 0.15 * u], [cx - 0.25 * u, hb - 0.04 * u], [cx, hb - 0.08 * u], [cx + 0.25 * u, hb - 0.04 * u], [cx + 0.47 * u, hb + 0.15 * u], [cx + 0.47 * u, hb + 0.45 * u], [cx + 0.36 * u, hb + 0.24 * u], [cx, hb + 0.17 * u], [cx - 0.36 * u, hb + 0.24 * u]]);
      const front = [ribbon([[cx - 0.08 * u, hb + 0.14 * u], [cx - 0.25 * u, hb + 0.35 * u], [cx - 0.42 * u, hb + 0.62 * u], [cx - 0.6 * u, B.chin + 0.1 * u]], 0.12 * u, 0.01 * u, 0.13 * u), ribbon([[cx + 0.08 * u, hb + 0.14 * u], [cx + 0.25 * u, hb + 0.35 * u], [cx + 0.45 * u, hb + 0.6 * u], [cx + 0.65 * u, B.chin]], 0.12 * u, 0.01 * u, 0.13 * u)];
      H.hair(ctx, [capP].concat(front), hc, { cols: [hc.c, '#d8e4ea', hc.c] });
      // lotus crown 蓮花冠
      cel(ctx, DZ.ell(cx, hb - 0.08 * u, 0.15 * u, 0.11 * u), { c: hc.c, sh: hc.sh, s: 2, h: 0, rim: 1, lw: 1.4, ln: hc.ln });
      [[-0.17, 0.25], [0.17, -0.25], [0, 0]].forEach(([dx, a]) => cel(ctx, DZ.xf(sp([[0, 0], [-0.09 * u, -0.12 * u], [0, -0.3 * u, 1], [0.09 * u, -0.12 * u]]), new DOMMatrix().translate(cx + dx * u, hb - 0.04 * u).rotate(a * 57.3)), { c: '#b8f0dc', s: 1.5, h: 1, rim: 1, lw: 1.3 }));
      DZ.rim = prevRim;
      return [
        { zh: '蓮花冠・冠帶', en: 'lotus crown, ribbons', p: [cx + 0.6 * u, hb - 0.5 * u], side: 1 },
        { zh: '雷紋八卦環', en: 'thunder-bagua halo', p: [cx - 1.5 * u, hcY - 0.6 * u], side: -1 },
        { zh: '額上雷印', en: 'thunder sigil, jade eyes', p: [cx, hb + 0.33 * u], side: -1 },
        { zh: '玉紗外袍', en: 'jade gauze over-robe', p: [cx + 1.75 * u, B.chestY + 0.2 * u], side: 1 },
        { zh: '雲化衣襬', en: 'hem dissolving to cloud', p: [cx - 0.9 * u, B.kneeY + 0.65 * u], side: -1 },
        { zh: '懸浮赤足', en: 'floating, bare feet', p: [cx + 0.24 * u, B.gy - 0.15 * u], side: 1 },
      ];
    },
  });

  // ------------------------------------------------------------ card
  const CW = 460, CH = 900;
  YG.CW = CW; YG.CH = CH;
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function figureFrame(opt, cx, gy, Hh) { return DZ.frame(cx, gy, Hh, opt.ratio, opt.frame || {}); }

  YG.card = (ctx, x0, y0, i) => {
    const opt = YG.options[i];
    ctx.save(); ctx.translate(x0, y0);
    // card
    rr(ctx, 0, 0, CW, CH, 10); ctx.fillStyle = '#f2ede3'; ctx.fill();
    ctx.fillStyle = opt.accent; ctx.fillRect(0, 14, 5, 64);
    // header
    rr(ctx, 14, 14, 40, 40, 6); ctx.fillStyle = opt.accent; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = DZ.font(19, 700); ctx.textAlign = 'center'; ctx.fillText(String(i + 1).padStart(2, '0'), 34, 41);
    ctx.textAlign = 'left'; ctx.fillStyle = '#1e1c22'; ctx.font = DZ.font(23, 700, 'serif'); ctx.fillText(opt.zh, 64, 36);
    const zw = ctx.measureText(opt.zh).width;
    ctx.font = DZ.font(12.5, 600); ctx.fillStyle = '#4c4852'; ctx.fillText(opt.en, 64 + zw + 10, 35);
    ctx.font = DZ.font(10, 600); ctx.fillStyle = opt.accent; ctx.fillText(opt.tag.toUpperCase(), 64, 52);
    ctx.font = DZ.font(11.2, 400); ctx.fillStyle = '#35323a';
    DZ.wrap(ctx, opt.idea, 14, 72, CW - 28, 15);
    // figure panel
    const FY = 104, FH = 470;
    rr(ctx, 10, FY, CW - 20, FH, 8);
    const g = ctx.createLinearGradient(0, FY, 0, FY + FH); g.addColorStop(0, opt.bg[0]); g.addColorStop(1, opt.bg[1]); ctx.fillStyle = g; ctx.fill();
    ctx.save(); rr(ctx, 10, FY, CW - 20, FH, 8); ctx.clip();
    const gy = FY + FH - 26, Hh = opt.H || 400;
    const B = figureFrame(opt, CW / 2 + (opt.dx || 0), gy, Hh);
    // ground shadow
    const sg = ctx.createRadialGradient(B.cx, gy, 0, B.cx, gy, 1.6 * B.u); sg.addColorStop(0, 'rgba(30,30,40,0.35)'); sg.addColorStop(1, 'rgba(30,30,40,0)');
    ctx.save(); ctx.scale(1, 0.22); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(B.cx, gy / 0.22, 1.6 * B.u, 0, 7); ctx.fill(); ctx.restore();
    // head-unit ruler
    ctx.strokeStyle = 'rgba(40,40,50,0.28)'; ctx.fillStyle = 'rgba(40,40,50,0.5)'; ctx.lineWidth = 1; ctx.font = DZ.font(8.5, 500);
    for (let h = 0; h <= opt.ratio + 0.01; h += 1) { const yy = B.top + h * B.u; ctx.beginPath(); ctx.moveTo(18, yy); ctx.lineTo(h % 1 ? 22 : 26, yy); ctx.stroke(); }
    if (opt.ratio % 1) { ctx.beginPath(); ctx.moveTo(18, gy); ctx.lineTo(26, gy); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(18, B.top); ctx.lineTo(18, gy); ctx.stroke();
    ctx.save(); ctx.translate(31, B.top + 2); ctx.fillText(`${opt.ratio} 頭身`, 0, 6); ctx.restore();
    DZ.k = 1;
    const calls = opt.draw(ctx, B, { view: 'front' }) || [];
    ctx.restore();
    // callouts
    drawCallouts(ctx, calls, FY + 20, FY + FH - 20);
    // row 2: bust
    const RY = FY + FH + 10, RH = 214;
    rr(ctx, 10, RY, 206, RH, 8); ctx.fillStyle = opt.bustBg || DZ.mix(opt.bg[0], '#ffffff', 0.25); ctx.fill();
    ctx.save(); rr(ctx, 10, RY, 206, RH, 8); ctx.clip();
    const bz = (opt.bust && opt.bust.z) || 1.8;
    const by = B.top + ((opt.bust && opt.bust.y) || -0.3) * B.u;
    const bx = B.cx + ((opt.bust && opt.bust.x) || 0) * B.u;
    ctx.translate(10 + 103, RY + 6); ctx.scale(bz, bz); ctx.translate(-bx, -by);
    DZ.k = 1.25 / bz;
    opt.draw(ctx, B, { view: 'front', bust: true });
    DZ.k = 1;
    ctx.restore();
    ctx.font = DZ.font(9, 600); ctx.fillStyle = 'rgba(30,28,34,0.65)'; ctx.fillText('胸像 BUST', 18, RY + RH - 9);
    // silhouettes (front / back at map-sprite scale)
    const SX = 224, SW = CW - SX - 10;
    rr(ctx, SX, RY, SW, 108, 8); ctx.fillStyle = '#e4ded2'; ctx.fill();
    const sh = 90, sw = 90;
    const silFn = (view) => (c) => { const Bs = figureFrame(opt, sw / 2 + (opt.dx || 0) * sh / Hh, sh - 2, sh * (Hh / 470) * 0.98); c.save(); c.translate(0, 0); opt.draw(c, Bs, { view, sil: true }); c.restore(); };
    const s1 = DZ.silhouette(sw * 2, sh, (c) => { c.translate(sw / 2, 0); silFn('front')(c); });
    const s2 = DZ.silhouette(sw * 2, sh, (c) => { c.translate(sw / 2, 0); silFn('back')(c); }, '#15131a', true);
    ctx.drawImage(s1, SX + 4 - sw / 2 + 32, RY + 9);
    ctx.drawImage(s2, SX + 4 - sw / 2 + 122, RY + 9);
    ctx.font = DZ.font(8.5, 600); ctx.fillStyle = '#5a5560';
    ctx.fillText('正 FRONT', SX + 10, RY + 103); ctx.fillText('背 BACK', SX + 100, RY + 103);
    ctx.textAlign = 'right'; ctx.fillText('90 px', SX + SW - 8, RY + 16); ctx.textAlign = 'left';
    // palette
    const PY = RY + 116;
    rr(ctx, SX, PY, SW, RH - 116, 8); ctx.fillStyle = '#e9e4d9'; ctx.fill();
    opt.palette.slice(0, 8).forEach(([n, c], k) => {
      const col = k % 2, row = Math.floor(k / 2);
      const px = SX + 8 + col * (SW / 2 - 2), py = PY + 8 + row * 22;
      rr(ctx, px, py, 16, 16, 3); ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#2a272e'; ctx.font = DZ.font(8.6, 600); ctx.fillText(n.length > 16 ? n.slice(0, 16) : n, px + 20, py + 8);
      ctx.fillStyle = '#6a6470'; ctx.font = DZ.font(8, 500); ctx.fillText(c.toUpperCase(), px + 20, py + 17);
    });
    // shape + culture text
    const TY = RY + RH + 18;
    ctx.fillStyle = opt.accent; ctx.font = DZ.font(10, 700); ctx.fillText('形 SHAPE', 14, TY);
    ctx.fillStyle = '#35323a'; ctx.font = DZ.font(10.5, 400);
    let yy = DZ.wrap(ctx, opt.shape, 74, TY, CW - 88, 14);
    ctx.fillStyle = opt.accent; ctx.font = DZ.font(10, 700); ctx.fillText('文化 BASIS', 14, yy + 4);
    ctx.fillStyle = '#35323a'; ctx.font = DZ.font(10.5, 400);
    DZ.wrap(ctx, opt.culture, 74, yy + 4, CW - 88, 14);
    ctx.restore();
  };

  function drawCallouts(ctx, calls, yMin, yMax) {
    for (const side of [-1, 1]) {
      const list = calls.filter((c) => c.side === side).sort((a, b) => a.p[1] - b.p[1]);
      // place labels near target y, pushed apart (min gap 36)
      const ys = list.map((c) => Math.max(yMin, Math.min(yMax, c.p[1])));
      for (let k = 1; k < ys.length; k++) ys[k] = Math.max(ys[k], ys[k - 1] + 36);
      for (let k = ys.length - 1; k >= 0; k--) { if (ys[k] > yMax) ys[k] = yMax; if (k < ys.length - 1 && ys[k] > ys[k + 1] - 36) ys[k] = ys[k + 1] - 36; }
      list.forEach((c, k) => {
        const ly = ys[k];
        const lx = side < 0 ? 18 : CW - 18;
        ctx.font = DZ.font(10.5, 700);
        const w1 = ctx.measureText(c.zh).width; ctx.font = DZ.font(8.6, 500); const w2 = ctx.measureText(c.en).width;
        const bw = Math.max(w1, w2) + 10;
        const bx = side < 0 ? lx : lx - bw;
        ctx.fillStyle = 'rgba(250,247,240,0.86)'; rr(ctx, bx, ly - 13, bw, 27, 4); ctx.fill();
        ctx.strokeStyle = 'rgba(40,36,44,0.75)'; ctx.lineWidth = 1;
        const ax = side < 0 ? bx + bw : bx;
        ctx.beginPath(); ctx.moveTo(ax, ly); ctx.lineTo(ax + side * -0 + (side < 0 ? 8 : -8), ly); ctx.lineTo(c.p[0], c.p[1]); ctx.stroke();
        ctx.fillStyle = '#1e1c22'; ctx.beginPath(); ctx.arc(c.p[0], c.p[1], 2.4, 0, 7); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#1e1c22'; ctx.font = DZ.font(10.5, 700); ctx.fillText(c.zh, bx + 5, ly - 1);
        ctx.fillStyle = '#4e4954'; ctx.font = DZ.font(8.6, 500); ctx.fillText(c.en, bx + 5, ly + 10);
      });
    }
  }

  // ------------------------------------------------------------ sheet
  YG.sheet = (ctx) => {
    const M = 24, G = 16, W = M * 2 + CW * 5 + G * 4, HD = 128;
    ctx.fillStyle = '#25222a'; ctx.fillRect(0, 0, W, ctx.canvas.height);
    ctx.fillStyle = '#f2ede3'; ctx.font = DZ.font(44, 700, 'serif'); ctx.fillText('雲歸', M, 62);
    ctx.font = DZ.font(15, 600); ctx.fillStyle = '#c9b48a'; ctx.fillText('YUN GUI — 24 · 觀音山 太虛觀 道士 · 木／雷 · 符扇', M, 92);
    ctx.font = DZ.font(13, 400); ctx.fillStyle = '#bdb6c4';
    DZ.wrap(ctx, 'Character design pass v2 — 10 proposals, faithful-historical (01) → bold-fantasy (10). Each card: full-body front at stated head ratio · bust · front/back silhouettes at 90 px map scale · palette · callouts · cultural basis. Built for a 3D cel-shaded pipeline: big readable primary forms; fine ornament is texture paint, not geometry. 雲歸 options pair with the 清虛真人 turnaround (same 太虛觀 blue-grey / white guard-collar uniform language).', 300, 50, W - 300 - M, 19);
    for (let i = 0; i < YG.options.length; i++) {
      const col = i % 5, row = Math.floor(i / 5);
      YG.card(ctx, M + col * (CW + G), HD + row * (CH + G), i);
    }
    // silhouette line-up
    const LY = HD + 2 * (CH + G) + 6;
    ctx.fillStyle = '#f2ede3'; ctx.font = DZ.font(14, 700); ctx.fillText('剪影對照 SILHOUETTE LINE-UP — 10 options, solid black, front', M, LY + 18);
    const n = YG.options.length, slot = (W - M * 2) / n;
    for (let i = 0; i < n; i++) {
      const opt = YG.options[i];
      const sh = 150, Hh = opt.H || 400;
      const s = DZ.silhouette(slot, sh + 10, (c) => { const Bs = figureFrame(opt, slot / 2 + (opt.dx || 0) * sh / Hh, sh + 6, sh * (Hh / 470)); opt.draw(c, Bs, { view: 'front', sil: true }); }, '#0c0b0f');
      ctx.fillStyle = '#e9e3d6'; ctx.fillRect(M + i * slot + 4, LY + 30, slot - 8, sh + 30);
      ctx.drawImage(s, M + i * slot, LY + 34);
      ctx.fillStyle = '#25222a'; ctx.font = DZ.font(12, 700); ctx.fillText(String(i + 1).padStart(2, '0'), M + i * slot + 10, LY + 48);
    }
  };
  YG.sheetSize = () => [24 * 2 + CW * 5 + 16 * 4, 128 + 2 * (CH + 16) + 6 + 30 + 150 + 30 + 24];
})();
