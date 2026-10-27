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
