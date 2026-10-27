/* 洛紅纓 Luo Hongying — 10 design options (v2). Uses LQ engine (hongying_qingfeng_common.js). */
(function () {
  'use strict';
  const { V, sp, tube, P, ell, cel, band, within, occl, fillIn, stroke, line, fold, stitch, glow, union, shifted, lock, col } = Object.assign({}, LQ, { lock: LQ.lock });
  const { mix, rgba, lighten, darken } = LQ.col;
  const S = LQ.S;
  const R = (F, pts) => pts.map((p) => [p[0] * F.h, p[1] * F.h, p[2]]);
  const symR = (F, half) => sp(LQ.sym(R(F, half)), true);
  const HY = (LQ.HONGYING = []);

  /* ---------------- shared sub-assemblies for the Luo family ---------------- */
  // clan crest 洛家槍徽: a spear-head inside a ring
  function crest(cx, cy, r, colA, colB) {
    if (S.sil) return; const ring = ell(cx, cy, r, r); cel(ring, { fill: colA, k: r * 0.4, hi: true, lw: 1 });
    const inner = ell(cx, cy, r * 0.72, r * 0.72); cel(inner, { fill: colB, k: r * 0.3, line: false, rim: false });
    const sp1 = sp([[cx, cy - r * 0.62, 1], [cx + r * 0.22, cy - r * 0.1], [cx + r * 0.08, cy + r * 0.25], [cx, cy + r * 0.62, 1], [cx - r * 0.08, cy + r * 0.25], [cx - r * 0.22, cy - r * 0.1]], true);
    cel(sp1, { fill: colA, k: 1, line: false, rim: false });
  }
  // 1-row horizontal row of knot buttons
  function knotRow(pts, s, colr) { pts.forEach((p) => LQ.knot(p[0], p[1], s, colr, p[2] || 0)); }
  // edge piping along a path (thick band + thin highlight)
  function piping(pts, w, colr, closed = false) { if (S.sil) return; const p = sp(pts, closed); stroke(p, LQ.lineOf(colr), w + 1.4); stroke(p, colr, w); stroke(p, rgba(lighten(colr, 0.35), 0.55), w * 0.25); }
  // cute leopard-cat (石虎) charm — her secret soft spot
  function catCharm(x, y, s, colr) {
    if (S.sil) { cel(ell(x, y, s, s * 0.9), '#000'); return; }
    line([[x, y - s * 2.2], [x, y - s * 0.9]], '#8a2a2a', 0.9);
    const head = sp([[x - s, y - s * 0.2], [x - s * 0.95, y - s * 1.05, 1], [x - s * 0.45, y - s * 0.65], [x + s * 0.45, y - s * 0.65], [x + s * 0.95, y - s * 1.05, 1], [x + s, y - s * 0.2], [x + s * 0.7, y + s * 0.7], [x - s * 0.7, y + s * 0.7]], true);
    cel(head, { fill: colr || '#d9a066', k: s * 0.4, lw: 0.9 });
    const c = S.ctx; c.fillStyle = '#2a1a14'; c.fill(ell(x - s * 0.38, y, s * 0.13, s * 0.16)); c.fill(ell(x + s * 0.38, y, s * 0.13, s * 0.16));
    c.fillStyle = '#fff'; c.fill(ell(x - s * 0.08, y + s * 0.28, s * 0.3, s * 0.18)); c.fill(ell(x + s * 0.08, y + s * 0.28, s * 0.3, s * 0.18));
    line([[x - s * 0.15, y - s * 0.5], [x - s * 0.1, y - s * 0.25]], '#5a3a20', 0.7); line([[x + s * 0.15, y - s * 0.5], [x + s * 0.1, y - s * 0.25]], '#5a3a20', 0.7);
  }
  // fringe from lock specs [rootX, rootY, width, tipX, tipY, bend] (head units)
  function fringe(F, specs) { const X = F.X; return specs.map((q) => lock([X(q[0]), X(q[1])], X(q[2]), [X(q[3]), X(q[4])], X(q[5]))); }
  LQ.HY_util = { crest, knotRow, piping, catCharm, R, symR, fringe };

  /* =====================================================================================
   * 01 洛家槍・承 — The Heir of the Spear (closest to the bible, re-grounded in Qing martial dress)
   * ===================================================================================== */
  HY.push({
    id: 'opt01', cn: '洛家槍・承', en: 'Heir of the Luo Spear', fantasy: 2, tag: 'faithful-historical · canon refit', accent: '#c8323a',
    bg: ['#efe2d4', '#d9c3b0', '#ffffff'], rim: '#ffd9a8',
    body: { heads: 7.3, sex: 'f', stance: 0.62, sw: 0.116 },
    palette: [['#b0242c', '洛家朱紅', 'clan crimson'], ['#2a1d20', '烏皮', 'black leather'], ['#e9e0d0', '月白', 'moon-white'], ['#c99a48', '黃銅', 'brass'], ['#f3d3bd', '膚', 'skin'], ['#21181f', '烏髮', 'hair']],
    callouts: [
      { at: 'ribbon', cn: '高馬尾・紅緞帶', en: 'crown ponytail, red silk ribbon', side: 1, ly: 98 },
      { at: 'vest', cn: '巴圖魯坎肩', en: '"hero" vest, 一字襟 button row', side: 1 },
      { at: 'bracer', cn: '皮護腕', en: 'laced leather bracers', side: -1 },
      { at: 'robe', cn: '箭袖短袍', en: 'arrow-sleeve robe, side slits', side: 1 },
      { at: 'boot', cn: '薄底快靴', en: 'soft-soled riding boots', side: -1 },
    ],
    idea: '最「洛家」的一版：清代武家箭袖袍＋巴圖魯坎肩，紅黑白三色一眼可辨；馬尾高到像槍纓，倔強寫在剪影上。',
    ideaEn: 'The clan look, made real: a Qing martial-family arrow-sleeve robe under a black "baturu" vest — crimson, black and white read at any size, and the crown-high ponytail echoes the spear tassel.',
    culture: 'Based on Qing 箭袖袍 (narrow "arrow" sleeves, side slits) and the 巴圖魯坎肩 one-line-button vest worn by martial men; the women\'s-cut waist, red ribbon and fitted trousers are a wuxia stylisation for spear work.',
    draw(F, o) {
      const h = F.h, X = F.X, c = S.ctx;
      const C = { red: '#b0242c', red2: '#7c1820', leather: '#2a1d20', white: '#e9e0d0', brass: '#c99a48', skin: '#f3d3bd', hair: '#2b2130', boot: '#241a1e', shaft: '#c79a5f' };
      const grip = [X(-1.4), X(3.55)];
      const armL = F.ik(-1, [grip[0] + X(0.27), grip[1] + X(0.02)], 'out');
      const armR = F.ik(1, [X(0.9), X(2.92)], 'out');
      // ---- ponytail & ribbon tails (behind)
      const tie = [X(0.05), X(-0.03)];
      const tails = LQ.hairTail(R(F, [[0.05, -0.03], [0.4, -0.45], [0.95, -0.38], [1.28, 0.25], [1.25, 1.3], [1.4, 2.3], [1.75, 3.1]]), (t) => X(0.12 + 0.17 * Math.sin(Math.min(1, t * 1.7) * Math.PI * 0.55) * (1 - t * 0.55)), { n: 4, spread: 0.9 });
      const rib1 = tube(R(F, [[0.05, -0.03], [0.55, -0.05], [0.88, 0.45], [0.72, 1.05], [0.95, 1.7]]), (t) => X(0.065 + 0.02 * Math.sin(t * 9)), { seg: 10 });
      cel(rib1, { fill: C.red, k: X(0.05), deep: true, lw: 1.2 });
      LQ.hairMass(F, tails, { col: C.hair, k: X(0.16), sd: [X(-0.14), X(-0.02)], strands: [R(F, [[0.45, -0.36], [1.0, -0.25], [1.2, 0.4], [1.2, 1.3]]), R(F, [[1.22, 0.7], [1.32, 1.7], [1.45, 2.4]])] });
      F.mark('ribbon', X(0.5), X(-0.3));
      // back hair (nape)
      const bh = sp(R(F, [[-0.44, 0.45], [-0.42, 0.1], [0, -0.06], [0.42, 0.1], [0.44, 0.45], [0.3, 0.95], [-0.3, 0.95]]), true);
      cel(bh, { fill: LQ.shadeOf(C.hair, '#a99ab8'), k: 1, sh: 0, line: false, rim: false });
      // ---- legs & boots
      const bootTop = F.knee + X(0.32);
      [-1, 1].forEach((sx) => {
        const fx = sx < 0 ? X(0.82) : X(0.36); // weight on her left leg, right leg planted wide beside the spear
        const L = LQ.legShape(F, { sx, top: F.waistY, kneeW: X(0.29), ankleW: X(0.26), ankleY: bootTop + X(0.18), footX: fx, flare: X(0.02), kneeY: F.knee - (sx > 0 ? X(0.05) : 0) });
        LQ.drawLeg(F, L, { sx, col: C.white, bunch: true });
        const b = LQ.boot(F, { sx, x: sx * fx, y: F.ankle, topY: bootTop, col: C.boot, sole: '#4a3a34', trim: C.red, shaftW: X(0.19), soleT: X(0.04), toeOut: X(sx < 0 ? 0.16 : 0.08) });
        if (sx < 0) F.mark('boot', sx * fx - X(0.1), bootTop + X(0.55));
      });
      // ---- robe back panel (visible in the slits), neck, robe front
      const hemY = F.crotch / h + 0.62;
      const robeBack = symR(F, [[0, 1.12], [0.26, 1.12], [0.66, 1.27], [0.84, 1.52], [0.76, 2.2], [0.64, 2.68], [0.9, 3.3], [1.1, hemY + 0.0, 1], [0.5, hemY + 0.08], [0, hemY + 0.1]]);
      cel(robeBack, { fill: C.red2, k: X(0.1), line: LQ.lineOf(C.red2) });
      const neck = LQ.neck(F, { skin: C.skin, w: F.nw, bottom: 1.3 });
      const robe = symR(F, [[0, 1.12], [0.26, 1.12], [0.66, 1.27], [0.84, 1.52], [0.76, 2.2], [0.62, 2.68], [0.84, 3.25], [0.98, hemY - 0.04, 1], [0.5, hemY + 0.04], [0, hemY + 0.06]]);
      cel(robe, { fill: C.red, k: X(0.22), sd: [X(-0.2), X(-0.05)], grad: [X(1.2), X(hemY)], tex: LQ.pattern('coin', '#f0b060', X(0.42), 0.12), after: () => {
        fold(R(F, [[0.15, 3.0], [0.3, 3.6], [0.35, hemY - 0.05]]), X(0.06), LQ.deepOf(C.red), 0.6);
        fold(R(F, [[-0.2, 3.05], [-0.38, 3.6], [-0.42, hemY - 0.05]]), X(0.05), LQ.deepOf(C.red), 0.5);
        fold(R(F, [[0.62, 3.1], [0.7, 3.7], [0.68, hemY]]), X(0.05), LQ.deepOf(C.red), 0.5);
      } });
      F.mark('robe', X(0.55), X(hemY - 0.35));
      // side-fastened 大襟 piping + hem piping
      piping(R(F, [[0.02, 1.16], [-0.3, 1.3], [-0.62, 1.62], [-0.79, 2.1], [-0.7, 2.62], [-0.82, 3.3], [-0.89, hemY - 0.03]]), X(0.06), '#1d1416');
      piping(R(F, [[-0.9, hemY - 0.02], [-0.5, hemY + 0.03], [0, hemY + 0.05], [0.5, hemY + 0.03], [0.9, hemY - 0.02]]), X(0.07), '#1d1416');
      knotRow(R(F, [[-0.84, 3.0], [-0.86, 3.5]]), X(0.05), C.brass);
      // inner white stand-collar & robe neckline
      const col1 = sp(R(F, [[-0.2, 1.0, 1], [-0.02, 1.03, 1], [-0.02, 1.2, 1], [-0.25, 1.17, 1]]), true), col2 = sp(R(F, [[0.2, 1.0, 1], [0.02, 1.03, 1], [0.02, 1.2, 1], [0.25, 1.17, 1]]), true);
      cel(col1, { fill: C.white, k: X(0.05) }); cel(col2, { fill: C.white, k: X(0.05) });
      piping(R(F, [[-0.3, 1.15], [0, 1.24], [0.3, 1.15]]), X(0.06), '#1d1416');
      // ---- vest 巴圖魯坎肩
      const vest = symR(F, [[0, 1.24], [0.3, 1.18], [0.64, 1.3], [0.68, 1.56], [0.6, 1.95], [0.63, 2.18], [0.56, 2.55], [0.58, 2.72], [0.64, 2.98, 1], [0, 3.02]]);
      occl(robe, vest, X(0.06), X(0.08), LQ.deepOf(C.red), 0.6);
      cel(vest, { fill: C.leather, k: X(0.2), hi: true, hiA: 0.35, hiCol: '#6a5458', after: () => {
        stitch(R(F, [[-0.66, 1.62], [0, 1.66], [0.66, 1.62]]), '#8a6a50', 0.8);
        stitch(R(F, [[-0.62, 2.92], [0, 2.96], [0.62, 2.92]]), '#8a6a50', 0.8);
        fold(R(F, [[-0.2, 2.35], [-0.15, 2.6], [-0.22, 2.85]]), X(0.04), '#140c0e', 0.6);
        // chest form: soft under-bust shadow and a highlight on the upper planes
        fold(R(F, [[-0.5, 2.2], [-0.3, 2.27], [-0.1, 2.22]]), X(0.035), '#120a0c', 0.5); fold(R(F, [[0.1, 2.22], [0.3, 2.27], [0.5, 2.2]]), X(0.035), '#120a0c', 0.5);
      } });
      piping(R(F, [[-0.64, 1.3], [-0.68, 1.56], [-0.6, 1.95]]), X(0.04), C.red);
      piping(R(F, [[0.64, 1.3], [0.68, 1.56], [0.6, 1.95]]), X(0.04), C.red);
      piping(R(F, [[-0.67, 1.58], [0, 1.6], [0.67, 1.58]]), X(0.05), C.red);
      for (let i = 0; i < 7; i++) LQ.stud(X(-0.51 + i * 0.17), X(1.6), X(0.045), C.brass);
      F.mark('vest', X(0.45), X(1.95));
      // ---- belt
      const belt = sp(R(F, [[-0.68, 2.66], [0, 2.71], [0.68, 2.66], [0.72, 2.94], [0, 2.99], [-0.72, 2.94]]), true);
      occl(robe, belt, 0, X(0.08), LQ.deepOf(C.red), 0.6);
      cel(belt, { fill: '#1e1517', k: X(0.08), hi: true, hiA: 0.3 });
      stitch(R(F, [[-0.72, 2.71], [0, 2.76], [0.72, 2.71]]), '#7a5a48', 0.7); stitch(R(F, [[-0.72, 2.9], [0, 2.95], [0.72, 2.9]]), '#7a5a48', 0.7);
      crest(0, X(2.84), X(0.15), C.brass, '#5a1418');
      // pouch with leopard-cat charm (the secret soft spot)
      const pouch = sp(R(F, [[0.42, 2.95], [0.64, 2.95], [0.7, 3.25], [0.55, 3.42], [0.38, 3.28]]), true);
      cel(pouch, { fill: '#d8b46a', k: X(0.08), after: () => { for (let i = 0; i < 3; i++) stitch(R(F, [[0.42, 3.05 + i * 0.1], [0.68, 3.05 + i * 0.1]]), '#8a5a2a', 0.6); } });
      catCharm(X(0.56), X(3.6), X(0.09), '#d9a066');
      // ---- spear (planted) — behind the gripping hand
      LQ.spear(F, { butt: [grip[0], F.H - 2], tip: [grip[0], X(-2.05)], shaft: C.shaft, bladeL: 0.85, bladeW: 0.15, tassel: { col: '#d01f2b', len: 1.05, w: 0.22, sway: -0.1 }, collar: C.brass, wrap: [[0.42, 0.56, '#3a2226']] });
      // ---- arms
      [[-1, armL], [1, armR]].forEach(([sx, arm]) => {
        const sl = LQ.sleeve(F, { sx, arm, wS: X(0.17), wE: X(0.14), wC: X(0.125), cuffT: 0.95 });
        LQ.drawSleeve(F, sl, { sx, col: C.red, cuffBand: { w: X(0.08), col: '#1d1416' } });
        // bracer
        const a = V.lerp(arm.E, arm.W, 0.36), b = V.lerp(arm.E, arm.W, 0.9);
        const br = tube([a, b], [X(0.15), X(0.13)], { seg: 2 });
        cel(br, { fill: C.leather, k: X(0.12), hi: true, hiCol: '#7a6468', hiA: 0.4, after: () => {
          const d = V.norm(V.sub(b, a)), n = V.perp(d);
          for (let i = 1; i < 6; i++) { const p = V.lerp(a, b, i / 6); line([V.add(p, V.mul(n, -X(0.08))), V.add(V.add(p, V.mul(d, X(0.05))), V.mul(n, X(0.08)))], '#a07a5a', 0.9); }
        } });
        [0.04, 0.96].forEach((t) => { const p = V.lerp(a, b, t); const d = V.norm(V.sub(b, a)), n = V.perp(d); const e = tube([V.add(p, V.mul(n, -X(0.155))), V.add(p, V.mul(n, X(0.155)))], X(0.022), { seg: 2 }); cel(e, { fill: C.red, k: 1, lw: 0.9 }); });
        if (sx < 0) F.mark('bracer', V.lerp(a, b, 0.5)[0], V.lerp(a, b, 0.5)[1]);
      });
      LQ.hand(F, { kind: 'grip', sx: -1, at: grip, pole: [0, 1], skin: C.skin, scale: 1.12 });
      LQ.hand(F, { kind: 'hip', sx: 1, at: armR.W, dir: V.norm(V.sub(armR.W, armR.E)), skin: C.skin });
      // ---- head
      const fc = {
        skin: C.skin, fw: 0.385, cheekY: 0.63, jaw: 0.7, jawY: 0.85, chinW: 0.085, chinY: 0.99, chinSharp: true, browCol: '#241619',
        eye: { x: 0.185, y: 0.6, w: 0.215, h: 0.095, tilt: 0.17, peak: 0.25, iris: '#b4581c', irisR: 0.37, lash: 0.036, flick: 0.2, flickUp: 0.45, lashes: 2, low: 0.5, lowLen: 0.45 },
        brow: { off: 0.12, angle: 0.07, w: 0.028, innerDrop: 0.018, arch: 0.01, len: 1.1 },
        nose: { style: 'anime', y: 0.77 }, mouth: { expr: 'smirk', side: -1, w: 0.11, y: 0.87, lipA: 0.35 }, blushA: 0.16,
      };
      if (!F.back) LQ.face(F, fc, null); else cel(LQ.facePath(F, fc), '#000');
      // ---- front hair: side-parted fringe swept toward her right, long side locks
      const cap = sp(R(F, [[-0.41, 0.52], [-0.44, 0.24], [-0.3, 0.0], [0, -0.05], [0.3, 0.0], [0.44, 0.24], [0.41, 0.52], [0.36, 0.36], [0.2, 0.18], [0, 0.14], [-0.2, 0.18], [-0.36, 0.36]]), true);
      const locks = fringe(F, [[0.16, 0.02, 0.38, -0.1, 0.53, -0.09], [-0.06, 0.04, 0.34, -0.3, 0.5, -0.07], [-0.26, 0.11, 0.24, -0.41, 0.6, -0.04], [0.28, 0.06, 0.28, 0.12, 0.47, 0.04], [0.39, 0.15, 0.18, 0.36, 0.55, 0.05],
        [-0.36, 0.26, 0.14, -0.42, 1.12, -0.1], [0.38, 0.28, 0.12, 0.41, 1.0, 0.09]]);
      occl(LQ.facePath(F, fc), union(...locks.slice(0, 5)), X(0.015), X(0.05), mix(C.skin, LQ.shadeOf(C.skin, S.skinTint), 0.85), 1);
      LQ.hairMass(F, [cap, ...locks], { col: C.hair, rim: false, ring: [0, X(0.5), X(0.4), Math.PI * 1.2, Math.PI * 1.8], ringN: 3, ringW: 0.028, k: X(0.1), sd: [X(-0.07), X(-0.09)] });
      // ribbon knot & bow at the crown
      const bow1 = sp(R(F, [[0.05, -0.03], [0.32, -0.22], [0.42, -0.08], [0.28, 0.02]]), true), bow2 = sp(R(F, [[0.05, -0.03], [-0.2, -0.24], [-0.3, -0.1], [-0.14, 0.0]]), true);
      cel(bow1, { fill: C.red, k: X(0.05), lw: 1.2 }); cel(bow2, { fill: C.red, k: X(0.05), lw: 1.2 });
      cel(ell(tie[0], tie[1], X(0.07), X(0.06)), { fill: '#8e1a22', k: 2, lw: 1.1 });
    },
  });

  /* ---------------- more shared helpers ---------------- */
  // point on segment A→B at a given y
  const atY = (A, B, y) => V.lerp(A, B, (y - A[1]) / (B[1] - A[1]));
  // braid: overlapping tilted ovals along a curve
  function braid(F, pts, w, colr, o = {}) {
    const c = LQ.crSample(pts, 12); const n = o.n || 9; const L = [0]; for (let i = 1; i < c.length; i++) L.push(L[i - 1] + V.len(V.sub(c[i], c[i - 1])));
    const tot = L[L.length - 1]; const at = (t) => { const d = t * tot; let i = 1; while (i < c.length - 1 && L[i] < d) i++; const f = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1); return { p: V.lerp(c[i - 1], c[i], f), d: V.norm(V.sub(c[i], c[i - 1])) }; };
    const segs = []; const seg = tot / n;
    for (let i = 0; i < n; i++) { const { p, d } = at((i + 0.5) / n); const ww = w * (1 - (i / n) * (o.taper ?? 0.35)); const ang = Math.atan2(d[1], d[0]); segs.push(ell(p[0], p[1], seg * 0.62, ww, ang + (i % 2 ? 0.5 : -0.5))); }
    LQ.hairMass(F, segs, { col: colr, k: w * 0.5, sd: [-w * 0.4, -w * 0.2], rim: false });
    const end = at(1).p; return { end, path: union(...segs) };
  }
  // tied cloth sash with hanging ends
  function sashEnds(F, x, y, sx, colr, len = 1.0) {
    const h = F.h; const e1 = tube([[x, y], [x + sx * 0.12 * h, y + len * 0.45 * h], [x + sx * 0.08 * h, y + len * h]], [0.07 * h, 0.08 * h, 0.06 * h], { seg: 6 });
    const e2 = tube([[x - sx * 0.04 * h, y], [x - sx * 0.02 * h, y + len * 0.4 * h], [x - sx * 0.1 * h, y + len * 0.82 * h]], [0.06 * h, 0.07 * h, 0.055 * h], { seg: 6 });
    cel(e2, { fill: LQ.shadeOf(colr), k: 2, lw: 1.1 }); cel(e1, { fill: colr, k: 0.06 * h, lw: 1.1 });
    cel(ell(x, y, 0.09 * h, 0.07 * h), { fill: colr, k: 0.05 * h, lw: 1.1 });
  }
  LQ.HY_util.braid = braid; LQ.HY_util.sashEnds = sashEnds; LQ.HY_util.atY = atY;

  /* =====================================================================================
   * 02 鹿港千金 — Daughter of the Lukang Trading House
   * ===================================================================================== */
  HY.push({
    id: 'opt02', cn: '鹿港千金', en: 'Daughter of the Lukang Trading House', fantasy: 1, tag: 'historical · merchant silk, road-worn', accent: '#c0466a',
    bg: ['#ebe1d8', '#cdbcb4', '#fff6ec'], rim: '#ffe4cc',
    body: { heads: 7.0, sex: 'f', sw: 0.112, ww: 0.07, stance: 0.42 },
    palette: [['#8e2c48', '胭脂紫紅', 'rouge plum silk'], ['#1f1a1e', '玄緞', 'black satin trim'], ['#2e6a68', '石青', 'stone-teal lining'], ['#d6ae58', '金線', 'gold thread'], ['#efe6d6', '象牙白', 'ivory'], ['#f6dcca', '膚', 'skin']],
    callouts: [
      { at: 'band', cn: '抹額', en: 'velvet forehead band, jade bead', side: -1, ly: 130 },
      { at: 'pins', cn: '步搖金簪', en: 'swinging gold hairpins', side: 1, ly: 150 },
      { at: 'jacket', cn: '鑲滾大襟襖', en: 'side-fastened jacket, triple trim', side: 1 },
      { at: 'sleeve', cn: '寬袖反袖口', en: 'wide sleeves, contrast cuffs', side: 1 },
      { at: 'cuff', cn: '繡花褲腳', en: 'embroidered trouser hems', side: -1 },
    ],
    idea: '「一府二鹿三艋舺」的大小姐：最好的絲綢、最講究的鑲滾，可是衣襬沾了三年的路塵——驕傲還在，靠山沒了。',
    ideaEn: 'The pampered heir of a great Lukang trading house: the finest silk and fussiest triple trims, but three years of road dust on the hem — the pride survives, the family behind it does not.',
    culture: 'Draws on late-Qing Han women\'s 大襟襖 with wide 鑲滾 (multi-band) trims, embroidered trouser hems and the 抹額 forehead band seen in Lukang/Tainan wedding and festival portraits; unbound feet and the spear are the fantasy departure.',
    draw(F, o) {
      const h = F.h, X = F.X;
      const C = { plum: '#8e2c48', trim: '#1f1a1e', teal: '#2e6a68', gold: '#d6ae58', ivory: '#efe6d6', skin: '#f6dcca', hair: '#211a24' };
      const tip = [X(-1.6), X(-1.55)], butt = [X(0.62), X(5.75)]; const pole = V.norm(V.sub(butt, tip));
      const gAt = atY(tip, butt, X(2.5));
      const armL = F.ik(-1, LQ.gripW(F, gAt, pole, F.shoulderJ(-1)), 'down');
      const armR = F.ik(1, [X(0.98), X(3.7)], 'out');
      // ---- back hair: low bun with pins
      const bun = ell(0, X(0.74), X(0.36), X(0.25));
      const backHair = sp(R(F, [[-0.45, 0.5], [-0.44, 0.15], [0, -0.04], [0.44, 0.15], [0.45, 0.5], [0.34, 0.92], [-0.34, 0.92]]), true);
      LQ.hairMass(F, [backHair, bun], { col: C.hair, k: X(0.1), rim: false });
      const pinA = [X(-0.92), X(0.62)], pinB = [X(0.95), X(0.52)];
      const pin = tube([pinA, pinB], X(0.022), { seg: 2, start: 'round', end: 'round' }); cel(pin, { fill: C.gold, k: 2, hi: true, lw: 1 });
      [pinA, pinB].forEach((q, i) => { for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; cel(ell(q[0] + Math.cos(a) * X(0.06), q[1] + Math.sin(a) * X(0.06), X(0.05), X(0.035), a), { fill: i ? '#e86a8a' : C.gold, k: 2, lw: 0.8, rim: false }); } cel(ell(q[0], q[1], X(0.035), X(0.035)), { fill: '#f6e2a0', k: 1, lw: 0.8 }); });
      for (let k = 0; k < 3; k++) { const x0 = pinB[0] - X(0.05) + k * X(0.06); line([[x0, pinB[1] + X(0.05)], [x0 + X(0.03), pinB[1] + X(0.32 + k * 0.05)]], C.gold, 1); cel(ell(x0 + X(0.03), pinB[1] + X(0.36 + k * 0.05), X(0.025), X(0.03)), { fill: k === 1 ? '#5fae8a' : '#f2eee6', k: 1, lw: 0.7 }); }
      F.mark('pins', pinB[0], pinB[1]);
      // ---- legs: wide trousers ending above the ankle, embroidered hems, embroidered shoes
      const hemT = F.ankle - X(0.22);
      [[-1, X(0.4)], [1, X(0.46)]].forEach(([sx, fx]) => {
        const L = LQ.legShape(F, { sx, top: F.waistY, kneeW: X(0.36), ankleW: X(0.34), ankleY: hemT, footX: fx, flare: X(0.05), thigh: 0.06 });
        LQ.shoe(F, { sx, x: sx * fx, kind: 'embroidered', col: C.teal, emb: C.gold, ankle: true, sock: '#f3eee4', toeUp: 0.03 });
        LQ.drawLeg(F, L, { sx, col: C.ivory, bunch: false });
        const bx = sx * fx; LQ.border([[bx - sx * X(0.4), hemT - X(0.08)], [bx, hemT - X(0.04)], [bx + sx * X(0.42), hemT - X(0.08)]], X(0.16), C.trim, C.gold, 'flower', { step: X(0.17) });
        if (sx < 0) F.mark('cuff', bx - X(0.2), hemT - X(0.06));
      });
      // ---- jacket
      const hemY = 4.05;
      const back = symR(F, [[0, 1.12], [0.24, 1.1], [0.6, 1.25], [0.8, 1.5], [0.72, 2.1], [0.66, 2.6], [0.9, 3.4], [1.04, 3.98, 1], [0.5, 4.08], [0, 4.1]]);
      cel(back, { fill: LQ.deepOf(C.plum), k: X(0.1) });
      LQ.neck(F, { skin: C.skin, w: F.nw, bottom: 1.3 });
      const jk = symR(F, [[0, 1.12], [0.24, 1.1], [0.6, 1.25], [0.8, 1.5], [0.72, 2.1], [0.64, 2.6], [0.84, 3.35], [0.94, 3.92], [0.86, hemY], [0.5, hemY + 0.05], [0, hemY + 0.06]]);
      cel(jk, { fill: C.plum, k: X(0.2), grad: [X(1.2), X(hemY)], tex: LQ.pattern('flower', '#f0a0b8', X(0.5), 0.1), after: () => {
        fold(R(F, [[0.2, 2.75], [0.32, 3.3], [0.3, 3.95]]), X(0.05), LQ.deepOf(C.plum), 0.5); fold(R(F, [[0.55, 2.8], [0.68, 3.4], [0.72, 3.95]]), X(0.05), LQ.deepOf(C.plum), 0.5);
        fold(R(F, [[-0.3, 2.65], [-0.5, 2.62], [-0.62, 2.7]]), X(0.04), LQ.deepOf(C.plum), 0.5);
        // road dust at the hem (painted texture)
        const c = S.ctx; const g = c.createLinearGradient(0, X(3.5), 0, X(hemY)); g.addColorStop(0, 'rgba(176,150,120,0)'); g.addColorStop(1, 'rgba(176,150,120,0.45)'); c.fillStyle = g; c.fillRect(-X(2), X(3.5), X(4), X(1));
      } });
      F.mark('jacket', X(0.5), X(3.2));
      // triple trim along the side-fastened opening, the hem and the slits
      const dj = R(F, [[0.02, 1.17], [-0.24, 1.3], [-0.46, 1.55], [-0.6, 1.95], [-0.64, 2.6], [-0.78, 3.3], [-0.88, 3.9]]);
      LQ.border(dj, X(0.15), C.trim, C.gold, 'hui', { step: X(0.17) });
      piping(dj.map((q) => [q[0] + X(0.09), q[1] + X(0.02)]), X(0.025), C.teal);
      LQ.border(R(F, [[-0.9, 3.86], [-0.84, 4.02], [-0.5, 4.08], [0, 4.1], [0.5, 4.08], [0.84, 4.02], [0.92, 3.86]]), X(0.15), C.trim, C.gold, 'hui', { step: X(0.17) });
      knotRow(R(F, [[-0.08, 1.2, -0.4], [-0.44, 1.52, -0.8], [-0.62, 1.95, -1.4], [-0.66, 2.45, -1.5], [-0.72, 2.95, -1.4], [-0.8, 3.4, -1.4]]), X(0.05), C.gold);
      // low stand collar
      const col = sp(R(F, [[-0.24, 1.0], [0.24, 1.0], [0.28, 1.17], [0, 1.2], [-0.28, 1.17]]), true);
      cel(col, { fill: C.plum, k: X(0.05) }); piping(R(F, [[-0.24, 1.01], [0, 1.0], [0.24, 1.01]]), X(0.04), C.trim);
      // ---- spear across the body, resting on her right shoulder
      LQ.spear(F, { butt, tip, shaft: '#b88a54', bladeL: 0.8, bladeW: 0.14, tassel: { col: '#d4243a', len: 0.95, w: 0.2, sway: -0.15 }, collar: C.gold, wrap: [[0.55, 0.62, C.plum]] });
      // ---- arms: wide sleeves with contrast cuffs
      [[-1, armL], [1, armR]].forEach(([sx, arm]) => {
        const sl = LQ.sleeve(F, { sx, arm, wS: X(0.2), wE: X(0.25), wC: X(0.33), cuffT: 0.78, hang: X(0.32), cuffBulge: 0.02 });
        LQ.drawSleeve(F, sl, { sx, col: C.plum, nf: 2 });
        const cb = LQ.border([V.lerp(sl.cO, sl.cI, -0.02), V.lerp(sl.cO, sl.cI, 1.02)].map((q) => V.add(q, V.mul(sl.dF, -X(0.06)))), X(0.14), C.teal, C.gold, 'flower', { step: X(0.16) });
        if (sx > 0) F.mark('sleeve', sl.cI[0], sl.cI[1] - X(0.1));
        LQ.forearm(F, V.lerp(arm.E, arm.W, 0.7), arm.W, C.skin, 0.1, 0.085);
      });
      LQ.hand(F, { kind: 'grip', sx: -1, at: gAt, pole, toward: F.shoulderJ(-1), skin: C.skin });
      LQ.hand(F, { kind: 'relaxed', sx: 1, at: armR.W, dir: V.norm(V.sub(armR.W, armR.E)), skin: C.skin });
      const bang = (W, E) => { const d = V.norm(V.sub(W, E)); const p = ell(...V.add(W, V.mul(d, -X(0.06))), X(0.12), X(0.045), Math.atan2(d[1], d[0]) + Math.PI / 2); cel(p, { fill: '#6fbf9a', k: X(0.04), hi: true, hiCol: '#e8fff4', hiA: 0.7, lw: 1 }); };
      bang(armR.W, armR.E);
      // ---- head
      const fc = {
        skin: C.skin, fw: 0.37, cheekY: 0.64, jaw: 0.74, jawY: 0.86, chinW: 0.1, chinY: 0.99, browCol: '#2a1c1e',
        eye: { x: 0.18, y: 0.61, w: 0.2, h: 0.08, tilt: 0.07, peak: 0.4, iris: '#5c2e22', irisR: 0.37, lash: 0.036, flick: 0.16, flickUp: 0.22, lid: 0.3, lashes: 3, low: 0.5, lowLen: 0.55, lashCol: '#2a1418' },
        brow: { off: 0.135, angle: 0.035, w: 0.018, arch: 0.03, len: 1.15 },
        nose: { style: 'line', y: 0.775 }, mouth: { expr: 'soft', w: 0.1, y: 0.875, lip: '#c23a52', lipA: 0.95, upper: true }, blushA: 0.22,
        earring: (sx, p) => { line([p, [p[0], p[1] + X(0.08)]], C.gold, 0.9); cel(ell(p[0], p[1] + X(0.11), X(0.03), X(0.035)), { fill: '#f6f1e8', k: 1, hi: true, lw: 0.8 }); },
        extra: (F2) => { S.ctx.fillStyle = '#4a2a2a'; S.ctx.fill(ell(X(0.27), X(0.72), X(0.011), X(0.011))); },
      };
      if (!F.back) LQ.face(F, fc, null); else cel(LQ.facePath(F, fc), '#000');
      // sleek centre-parted hair swept over the ears
      const cap = sp(R(F, [[-0.43, 0.66], [-0.47, 0.3], [-0.33, 0.02], [0, -0.05], [0.33, 0.02], [0.47, 0.3], [0.43, 0.66], [0.37, 0.52], [0.27, 0.3], [0.02, 0.2], [-0.27, 0.3], [-0.37, 0.52]]), true);
      const sw = fringe(F, [[0.03, 0.06, 0.34, 0.44, 0.66, 0.08], [-0.03, 0.06, 0.34, -0.44, 0.66, -0.08], [0.33, 0.32, 0.06, 0.34, 0.96, 0.04], [-0.31, 0.33, 0.05, -0.36, 0.86, -0.05]]);
      LQ.hairMass(F, [cap, ...sw], { col: C.hair, rim: false, ring: [0, X(0.52), X(0.4), Math.PI * 1.2, Math.PI * 1.8], ringN: 4, ringW: 0.026, k: X(0.09), sd: [X(-0.07), X(-0.08)],
        dark: [R(F, [[0, 0.02], [0.01, 0.2]]), R(F, [[0.05, 0.1], [0.3, 0.3], [0.4, 0.5]]), R(F, [[-0.05, 0.1], [-0.3, 0.3], [-0.4, 0.5]])] });
      // 抹額 forehead band
      const band = tube(R(F, [[-0.44, 0.33], [-0.2, 0.25], [0, 0.235], [0.2, 0.25], [0.44, 0.33]]), X(0.045), { seg: 8 });
      cel(band, { fill: '#241a22', k: X(0.03), hi: true, hiA: 0.3, after: () => { stroke(sp(R(F, [[-0.44, 0.3], [0, 0.205], [0.44, 0.3]]), false), C.gold, 0.9); stroke(sp(R(F, [[-0.44, 0.37], [0, 0.27], [0.44, 0.37]]), false), C.gold, 0.9); } });
      cel(ell(0, X(0.235), X(0.055), X(0.045)), { fill: '#5fae8a', k: X(0.03), hi: true, hiCol: '#efffee', hiA: 0.8, lw: 1 });
      cel(ell(0, X(0.31), X(0.018), X(0.022)), { fill: '#f3efe6', k: 1, lw: 0.7 });
      F.mark('band', X(-0.35), X(0.3));
    },
  });

  /* =====================================================================================
   * 03 鏢局行腳 — The Road Escort
   * ===================================================================================== */
  HY.push({
    id: 'opt03', cn: '鏢局行腳', en: 'Escort on the Coast Road', fantasy: 1, tag: 'historical · working traveller', accent: '#c56a3a',
    bg: ['#e8e2d2', '#c9bea4', '#fff9e8'], rim: '#fff0c8',
    body: { heads: 7.0, sex: 'f', sw: 0.12, ww: 0.078, hw: 0.104, stance: 0.62 },
    palette: [['#b55a3c', '褪茜紅', 'faded madder'], ['#34405e', '藍布', 'indigo cotton'], ['#e6d8bd', '胚布', 'undyed cotton'], ['#d6b46e', '竹篾', 'split bamboo'], ['#6b4630', '牛皮', 'tan leather'], ['#e2b48e', '曬膚', 'sun-tanned skin']],
    callouts: [
      { at: 'hat', cn: '斗笠', en: 'bamboo rain hat', side: -1, ly: 112 },
      { at: 'bundle', cn: '包袱', en: 'travel bundle tied to the spear', side: 1, ly: 150 },
      { at: 'jacket', cn: '對襟短衫', en: 'centre-buttoned jacket, rolled sleeves', side: -1 },
      { at: 'wrap', cn: '綁腿', en: 'cotton leg wraps', side: 1 },
      { at: 'sandal', cn: '草鞋', en: 'straw sandals', side: -1 },
    ],
    idea: '離家三年、跟著鏢車走遍西部海線的她：斗笠、綁腿、草鞋，槍桿上掛著全部家當——最接地氣的一版，笑起來露出小虎牙。',
    ideaEn: 'Three years riding with escort caravans down the west-coast road: rain hat, leg wraps, straw sandals, her whole life tied to the spear — the most down-to-earth take, with a crooked fang-tooth grin.',
    culture: 'Built from 19th-c. Taiwanese labouring dress — 斗笠 bamboo hat, 對襟 cotton jacket, wide 大褲 with 綁腿 wraps and 草鞋 — plus the 鏢局 escort-agency tradition of wuxia; the women\'s braid and the spear-as-carrying-pole are stylised.',
    draw(F, o) {
      const h = F.h, X = F.X;
      const C = { mad: '#b55a3c', ind: '#34405e', cot: '#e6d8bd', straw: '#d6b46e', lea: '#6b4630', skin: '#e2b48e', hair: '#2c201c' };
      const butt = [X(-1.12), X(3.75)], tip = [X(2.05), X(-0.5)]; const pole = V.norm(V.sub(butt, tip));
      const gR = atY(butt, tip, X(3.35)), gL = atY(butt, tip, X(1.98));
      const armL = F.ik(-1, LQ.gripW(F, gR, pole, F.shoulderJ(-1)), 'out');
      const armR = F.ik(1, LQ.gripW(F, gL, pole, F.shoulderJ(1)), 'down');
      // back hair
      const backHair = sp(R(F, [[-0.45, 0.5], [-0.44, 0.15], [0, -0.04], [0.44, 0.15], [0.45, 0.5], [0.32, 0.95], [-0.32, 0.95]]), true);
      LQ.hairMass(F, [backHair], { col: C.hair, k: X(0.1), rim: false });
      // ---- bundle hanging behind the shoulder (tied to the shaft)
      const kn = atY(butt, tip, X(0.55));
      const bun = sp(R(F, [[kn[0] / h - 0.05, 0.55], [kn[0] / h + 0.35, 0.75], [kn[0] / h + 0.5, 1.2], [kn[0] / h + 0.3, 1.62], [kn[0] / h - 0.25, 1.65], [kn[0] / h - 0.42, 1.25], [kn[0] / h - 0.3, 0.78]]), true);
      cel(bun, { fill: C.ind, k: X(0.18), tex: LQ.pattern('diamond', '#dfe6f0', X(0.3), 0.35), after: () => { fold([[kn[0], kn[1] + X(0.2)], [kn[0] + X(0.05), kn[1] + X(0.6)], [kn[0] - X(0.05), kn[1] + X(1.0)]], X(0.06), '#1e2640', 0.6); } });
      const ear1 = sp([[kn[0] - X(0.05), kn[1] + X(0.05)], [kn[0] - X(0.28), kn[1] - X(0.2)], [kn[0] - X(0.12), kn[1] - X(0.22)], [kn[0] + X(0.05), kn[1] - X(0.02)]], true); cel(ear1, { fill: C.ind, k: X(0.05), tex: LQ.pattern('diamond', '#dfe6f0', X(0.3), 0.35) });
      F.mark('bundle', kn[0] + X(0.4), kn[1] + X(0.6));
      // ---- legs: wide indigo trousers bound with leg wraps, straw sandals
      const wrapTop = F.knee + X(0.05);
      [[-1, X(0.72)], [1, X(0.6)]].forEach(([sx, fx]) => {
        const L = LQ.legShape(F, { sx, top: F.waistY, kneeW: X(0.38), ankleW: X(0.3), ankleY: wrapTop + X(0.35), footX: fx, flare: X(0.08), thigh: 0.08 });
        LQ.drawLeg(F, L, { sx, col: C.ind, bunch: false });
        LQ.shoe(F, { sx, x: sx * fx, kind: 'straw', skin: C.skin, toeOut: 0.1 });
        LQ.legWrap(F, { x: sx * fx, top: wrapTop, bottom: F.ankle - X(0.05), col: C.cot, w0: X(0.24), w1: X(0.17), w2: X(0.13), n: 6, tie: '#8a4a30' });
        if (sx > 0) F.mark('wrap', sx * fx + X(0.12), wrapTop + X(0.5)); else F.mark('sandal', sx * fx - X(0.16), F.H - X(0.06));
      });
      // ---- undershirt + jacket
      LQ.neck(F, { skin: C.skin, w: F.nw * 1.05, bottom: 1.35 });
      const und = symR(F, [[0, 1.15], [0.3, 1.13], [0.5, 1.3], [0.5, 2.0], [0, 2.0]]); cel(und, { fill: C.cot, k: X(0.06) });
      const hemY = 3.85;
      const jk = (side) => sp(R(F, side > 0 ? [[0.04, 1.4], [0.22, 1.12], [0.66, 1.26], [0.86, 1.52], [0.78, 2.2], [0.74, 2.7], [0.88, 3.3], [0.94, hemY, 1], [0.03, hemY + 0.04, 1]] : [[-0.04, 1.4], [-0.22, 1.12], [-0.66, 1.26], [-0.86, 1.52], [-0.78, 2.2], [-0.74, 2.7], [-0.88, 3.3], [-0.94, hemY, 1], [0.03, hemY + 0.04, 1], [0.03, 1.6]]), true);
      const jkR = jk(1), jkL = jk(-1);
      [jkR, jkL].forEach((q) => cel(q, { fill: C.mad, k: X(0.2), grad: [X(1.2), X(hemY)], tex: LQ.pattern('weave', '#f0d0b0', X(0.25), 0.12), after: () => {
        fold(R(F, [[0.3, 2.9], [0.45, 3.4], [0.5, 3.8]]), X(0.05), LQ.deepOf(C.mad), 0.5); fold(R(F, [[-0.35, 2.95], [-0.5, 3.4], [-0.52, 3.8]]), X(0.05), LQ.deepOf(C.mad), 0.5);
        // sun-faded patches & a mended tear
        S.ctx.fillStyle = rgba('#e8b090', 0.25); S.ctx.fill(ell(X(-0.4), X(1.9), X(0.3), X(0.4))); stitch(R(F, [[0.45, 3.15], [0.62, 3.1], [0.7, 3.25]]), '#f0e0c0', 0.8);
      } }));
      piping(R(F, [[0.03, 1.32], [0.03, hemY + 0.03]]), X(0.03), '#7a3420');
      knotRow(R(F, [[0.03, 1.5], [0.03, 1.9], [0.03, 2.3], [0.03, 2.7], [0.03, 3.1]]), X(0.05), '#e8d8b0');
      F.mark('jacket', X(-0.5), X(2.4));
      // cloth sash belt with knotted ends and a leather pouch
      const belt = sp(R(F, [[-0.8, 2.72], [0, 2.78], [0.8, 2.72], [0.82, 3.0], [0, 3.06], [-0.82, 3.0]]), true);
      cel(belt, { fill: C.ind, k: X(0.08), after: () => { for (let i = 0; i < 4; i++) fold(R(F, [[-0.7 + i * 0.4, 2.8], [-0.6 + i * 0.4, 2.9], [-0.68 + i * 0.4, 3.0]]), X(0.025), '#1c2236', 0.6); } });
      sashEnds(F, X(0.55), X(2.95), 1, C.ind, 0.85);
      const pouch = sp(R(F, [[-0.62, 3.0], [-0.3, 3.0], [-0.28, 3.4], [-0.45, 3.5], [-0.64, 3.38]]), true); cel(pouch, { fill: C.lea, k: X(0.08), hi: true, hiA: 0.3, after: () => stitch(R(F, [[-0.6, 3.1], [-0.3, 3.1]]), '#d8b080', 0.7) });
      // gourd
      const gd = union(ell(X(-0.72), X(3.55), X(0.13), X(0.14)), ell(X(-0.72), X(3.33), X(0.09), X(0.1))); cel(gd, { fill: '#c08a40', k: X(0.08), hi: true, hiA: 0.5 });
      // ---- spear over her left shoulder
      LQ.spear(F, { butt, tip, shaft: '#b98c58', bladeL: 0.75, bladeW: 0.14, tassel: { col: '#c8282e', len: 0.85, w: 0.18, sway: 0.1 }, wrap: [[0.06, 0.16, C.lea]] });
      // cord tying the bundle
      const cd = tube([V.add(kn, [-X(0.05), -X(0.04)]), V.add(kn, [X(0.06), X(0.12)])], X(0.025), { seg: 2 }); cel(cd, { fill: '#8a6a40', k: 1, lw: 0.9 });
      // ---- arms: sleeves rolled above the elbow, bare forearms
      [[-1, armL], [1, armR]].forEach(([sx, arm]) => {
        LQ.forearm(F, V.lerp(arm.S, arm.E, 0.85), arm.W, C.skin, 0.12, 0.09);
        const sl = LQ.sleeve(F, { sx, arm, wS: X(0.19), wE: X(0.17), wC: X(0.16), cuffT: -0.05 });
        LQ.drawSleeve(F, sl, { sx, col: C.mad, nf: 1, folds: false });
        const roll = tube([V.add(sl.cO, V.mul(sl.dF, -X(0.03))), V.add(sl.cI, V.mul(sl.dF, -X(0.03)))], X(0.06), { seg: 3, start: 'round', end: 'round' });
        cel(roll, { fill: LQ.col.lighten(C.mad, 0.1), k: X(0.05), lw: 1.1, after: () => fold([V.lerp(sl.cO, sl.cI, 0.2), V.lerp(sl.cO, sl.cI, 0.5), V.lerp(sl.cO, sl.cI, 0.8)], X(0.025), LQ.deepOf(C.mad), 0.6) });
        // wrist wrap
        const wr = tube([V.lerp(arm.E, arm.W, 0.72), V.lerp(arm.E, arm.W, 0.95)], X(0.1), { seg: 2 }); cel(wr, { fill: C.cot, k: X(0.06), lw: 1, after: () => { for (let i = 1; i < 4; i++) { const q = V.lerp(V.lerp(arm.E, arm.W, 0.72), V.lerp(arm.E, arm.W, 0.95), i / 4); const n = V.perp(V.norm(V.sub(arm.W, arm.E))); line([V.add(q, V.mul(n, -X(0.1))), V.add(q, V.mul(n, X(0.1)))], '#a89878', 0.7); } } });
      });
      LQ.hand(F, { kind: 'grip', sx: -1, at: gR, pole, toward: F.shoulderJ(-1), skin: C.skin });
      LQ.hand(F, { kind: 'grip', sx: 1, at: gL, pole, toward: F.shoulderJ(1), skin: C.skin });
      // ---- head
      const fc = {
        skin: C.skin, fw: 0.39, cheekY: 0.62, jaw: 0.76, jawY: 0.85, chinW: 0.11, chinY: 0.98, browCol: '#2e1e18', shadeK: 0.06,
        eye: { x: 0.185, y: 0.615, w: 0.19, h: 0.1, tilt: 0.04, peak: 0.42, iris: '#8a6424', irisR: 0.4, lash: 0.03, flick: 0.08, flickUp: 0.15, low: 0.62, lowLen: 0.5, lashCol: '#2e1a14' },
        brow: { off: 0.12, angle: 0.0, w: 0.032, arch: 0.02, len: 1.1, blunt: true },
        nose: { style: 'anime', y: 0.77 }, mouth: { expr: 'grin', w: 0.15, y: 0.865, fang: 1 }, blushA: 0.3, blushCol: '#e8705a',
        extra: () => { const c = S.ctx; c.fillStyle = rgba('#a0603a', 0.55); [[-0.1, 0.72], [-0.06, 0.74], [0.08, 0.73], [0.12, 0.71], [-0.15, 0.7], [0.16, 0.74], [0.04, 0.75]].forEach(([x, y]) => c.fill(ell(X(x), X(y), X(0.008), X(0.008)))); },
      };
      if (!F.back) LQ.face(F, fc, null); else cel(LQ.facePath(F, fc), '#000');
      const cap = sp(R(F, [[-0.43, 0.56], [-0.47, 0.25], [-0.32, 0.0], [0, -0.06], [0.32, 0.0], [0.47, 0.25], [0.43, 0.56], [0.36, 0.38], [0.2, 0.2], [0, 0.16], [-0.2, 0.2], [-0.36, 0.38]]), true);
      const fr = fringe(F, [[-0.02, 0.05, 0.3, -0.12, 0.44, -0.03], [0.16, 0.06, 0.28, 0.12, 0.46, 0.03], [-0.22, 0.1, 0.24, -0.3, 0.5, -0.03], [0.33, 0.14, 0.2, 0.36, 0.55, 0.04], [-0.38, 0.22, 0.13, -0.42, 0.78, -0.03], [0.4, 0.26, 0.12, 0.44, 0.72, 0.03]]);
      LQ.hairMass(F, [cap, ...fr], { col: C.hair, rim: false, k: X(0.09), sd: [X(-0.07), X(-0.08)] });
      // braid over her right shoulder
      const br = braid(F, R(F, [[-0.36, 0.7], [-0.52, 1.1], [-0.56, 1.7], [-0.48, 2.35]]), X(0.12), C.hair, { n: 8 });
      cel(tube([V.add(br.end, [-X(0.08), -X(0.04)]), V.add(br.end, [X(0.08), X(0.0)])], X(0.035), { seg: 2 }), { fill: '#c8282e', k: 1, lw: 1 });
      const tuft = LQ.lock(V.add(br.end, [0, X(0.02)]), X(0.1), V.add(br.end, [X(0.02), X(0.3)]), X(0.02)); LQ.hairMass(F, [tuft], { col: C.hair, rim: false });
      // ---- 斗笠 bamboo hat (front view: shallow cone + brim underside)
      const brimY = X(0.18);
      const under = P('M', X(-1.28), brimY + X(0.06), 'Q', 0, brimY + X(0.42), X(1.28), brimY + X(0.06), 'Q', 0, brimY + X(0.24), X(-1.28), brimY + X(0.06), 'Z');
      cel(under, { fill: '#8a6a3a', k: X(0.06), sh: 0, rim: false, lw: 1.3 });
      const cone = P('M', X(-1.32), brimY + X(0.06), 'Q', X(-0.5), X(-0.28), 0, X(-0.62), 'Q', X(0.5), X(-0.28), X(1.32), brimY + X(0.06), 'Q', 0, brimY + X(0.26), X(-1.32), brimY + X(0.06), 'Z');
      occl(LQ.facePath(F, fc), cone, 0, X(0.12), mix(C.skin, LQ.shadeOf(C.skin, S.skinTint), 0.9), 1);
      cel(cone, { fill: C.straw, k: X(0.25), sd: [X(-0.3), X(-0.05)], hi: true, hiA: 0.4, tex: LQ.pattern('straw', '#8a6a30', X(0.4), 0.18), after: () => {
        for (let i = -8; i <= 8; i++) line([[0, X(-0.6)], [X(i * 0.16), brimY + X(0.12) + Math.abs(i) * X(-0.008)]], rgba('#7a5a2a', 0.45), 0.7);
        stroke(P('M', X(-1.1), brimY + X(0.0), 'Q', 0, brimY + X(0.18), X(1.1), brimY + X(0.0)), rgba('#7a5a2a', 0.7), 1);
        stroke(P('M', X(-0.55), X(-0.25), 'Q', 0, X(-0.16), X(0.55), X(-0.25)), rgba('#7a5a2a', 0.6), 1);
      } });
      cel(ell(0, X(-0.6), X(0.07), X(0.05)), { fill: '#a07a40', k: 2, lw: 1 });
      // chin cord
      line(R(F, [[-0.4, 0.6], [-0.3, 0.95], [0, 1.08], [0.3, 0.95], [0.4, 0.6]]), '#5a3a20', 1.2);
      F.mark('hat', X(-0.95), brimY + X(0.08));
    },
  });
})();
