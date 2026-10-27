/* 洛青鋒 Luo Qingfeng 「鬼面」 — final design, turnaround (front / side / back), masked + unmasked.
 * Uses the LQ engine (hongying_qingfeng_common.js). */
(function () {
  'use strict';
  const { V, sp, tube, P, ell, cel, within, occl, fillIn, stroke, line, fold, stitch, glow, union, band } = LQ;
  const { mix, rgba, lighten, darken, mul } = LQ.col;
  const S = LQ.S;
  const R = (F, pts) => pts.map((p) => [p[0] * F.h, p[1] * F.h, p[2]]);
  const symR = (F, half) => sp(LQ.sym(R(F, half)), true);
  const piping = (pts, w, colr) => { if (S.sil) return; const p = sp(pts, false); stroke(p, LQ.lineOf(colr), w + 1.4); stroke(p, colr, w); stroke(p, rgba(lighten(colr, 0.35), 0.5), w * 0.25); };

  const C = {
    ink: '#18151b', ink2: '#26222a', red: '#a3192a', redL: '#c8283a', ash: '#e6e1d8', ashD: '#b8b0a6', bone: '#f5f2ec', brass: '#b8964e',
    soul: '#7fd3ff', skin: '#ead0bd', hair: '#16131a', trou: '#2e2b33', eye: '#b4581c', hemp: '#ddd4c2',
  };
  const QF = (LQ.QF = { C });
  QF.body = { heads: 7.5, sex: 'm', sw: 0.148, ww: 0.088, hw: 0.094, stance: 0.62, nw: 0.2 };
  QF.palette = [[C.ink, '玄', 'ink-black wool'], [C.red, '洛家朱', 'clan crimson'], [C.ash, '灰白', 'ash-white cape'], [C.bone, '骨白', 'mask lacquer'], [C.brass, '黃銅', 'brass fittings'], [C.soul, '魂火藍', 'soul-flame blue'], [C.skin, '膚', 'skin'], [C.eye, '洛家琥珀', 'Luo amber eyes']];

  /* ------------------------------------------------------------------ face & mask (front) */
  QF.face = {
    skin: C.skin, fw: 0.37, cheekY: 0.6, jaw: 0.78, jawY: 0.86, chinW: 0.11, chinY: 1.0, browCol: '#16121a', shadeK: 0.07,
    eye: { x: 0.18, y: 0.6, w: 0.19, h: 0.068, tilt: 0.12, peak: 0.3, iris: C.eye, irisR: 0.36, lash: 0.03, flick: 0.08, flickUp: 0.12, lid: 0.32, low: 0.45, lowLen: 0.6, bag: true, lashCol: '#14101a', creaseH: 0.04 },
    brow: { off: 0.1, angle: 0.0, w: 0.03, innerDrop: 0.025, len: 1.12, blunt: true },
    nose: { style: 'bridge', y: 0.77, size: 1.0 }, mouth: { expr: 'set', w: 0.12, y: 0.875, lipA: 0.25 },
    extra: (F) => { const X = F.X; // scar through the left brow & lid, from the massacre night
      stroke(sp(R(F, [[-0.22, 0.43], [-0.2, 0.52], [-0.17, 0.6], [-0.15, 0.68]]), false), '#b07a72', 1.6); stroke(sp(R(F, [[-0.22, 0.43], [-0.2, 0.52]]), false), rgba('#fff', 0.5), 0.6);
      S.ctx.fillStyle = rgba('#7a6a88', 0.12); S.ctx.fill(ell(X(-0.24), X(0.83), X(0.1), X(0.07))); S.ctx.fill(ell(X(0.24), X(0.83), X(0.1), X(0.07))); },
  };
  QF.expr = {
    tired: null,
    anguish: { eye: { lid: 0.12, h: 0.075, irisR: 0.3 }, brow: { innerDrop: -0.03, angle: -0.04 }, mouth: { expr: 'shout', w: 0.13, open: 0.06 } },
    smile: { eye: { lid: 0.55, glint: '#9ad8ff' }, brow: { innerDrop: -0.025, angle: -0.03 }, mouth: { expr: 'soft', w: 0.12 } },
  };
  // the 鬼面 mask: bone-white lacquer, red opera-style flame markings (front view)
  QF.mask = function (F, o = {}) {
    const h = F.h, X = F.X; const c = S.ctx;
    const m = sp(R(F, [[-0.4, 0.22], [-0.32, 0.08], [0, 0.04], [0.32, 0.08], [0.4, 0.22], [0.41, 0.45], [0.39, 0.64], [0.3, 0.84], [0.13, 0.98], [0, 1.02, 1], [-0.13, 0.98], [-0.3, 0.84], [-0.39, 0.64], [-0.41, 0.45]]), true);
    if (o.cord !== false) [-1, 1].forEach((sx) => { const cd = tube(R(F, [[sx * 0.39, 0.38], [sx * 0.46, 0.4], [sx * 0.5, 0.36]]), X(0.022), { seg: 3 }); cel(cd, { fill: C.red, k: 1, lw: 0.9 }); });
    cel(m, { fill: C.bone, shade: '#c9c3cf', k: X(0.07), sd: [X(-0.07), X(-0.02)], hi: true, hiCol: '#ffffff', hiA: 0.6, lw: 1.6, line: '#3a2a30', after: () => {
      if (S.sil) return;
      // brow ridge & cheek planes (sculpted form, painted as shade)
      c.fillStyle = rgba('#b8b0c0', 0.35); c.fill(sp(R(F, [[-0.36, 0.5], [-0.22, 0.47], [-0.1, 0.52], [-0.05, 0.78], [-0.12, 0.84], [-0.3, 0.78]]), true));
      // red flame brows sweeping to the temples
      [-1, 1].forEach((sx) => {
        const fl = sp(R(F, [[sx * 0.05, 0.47], [sx * 0.16, 0.36], [sx * 0.3, 0.28], [sx * 0.42, 0.13, 1], [sx * 0.36, 0.3], [sx * 0.44, 0.27, 1], [sx * 0.34, 0.42], [sx * 0.2, 0.45], [sx * 0.1, 0.5]]), true);
        c.fillStyle = C.red; c.fill(fl); stroke(fl, '#5a0a14', 0.9);
        // eye hole: long slanted almond, deep black, red rim
        const eh = sp(R(F, [[sx * 0.07, 0.6], [sx * 0.16, 0.52], [sx * 0.3, 0.5], [sx * 0.34, 0.53, 1], [sx * 0.26, 0.6], [sx * 0.14, 0.63]]), true);
        stroke(eh, C.red, 2.6); c.fillStyle = '#0c0a0e'; c.fill(eh);
        if (o.glow) { c.fillStyle = rgba(o.glow, 0.85); c.fill(ell(sx * X(0.2), X(0.565), X(0.035), X(0.018))); }
        // blood-tear streaks
        for (let i = 0; i < 2; i++) { const x0 = sx * (0.15 + i * 0.08); const t = LQ.taper(R(F, [[x0, 0.63], [x0 + sx * 0.01, 0.75], [x0 - sx * 0.01, 0.88 - i * 0.06]]), X(0.02)); c.fillStyle = C.red; c.fill(t); }
        // cheek swirl (opera face-paint 臉譜 motif)
        stroke(sp(R(F, [[sx * 0.34, 0.66], [sx * 0.3, 0.74], [sx * 0.22, 0.76], [sx * 0.2, 0.7], [sx * 0.26, 0.68]]), false), C.red, 1.5);
      });
      // forehead flame mark
      const fm = sp(R(F, [[0, 0.12, 1], [0.05, 0.26], [0.03, 0.4], [0, 0.46, 1], [-0.03, 0.4], [-0.05, 0.26]]), true); c.fillStyle = C.red; c.fill(fm);
      c.fillStyle = '#1a1014'; c.fill(ell(0, X(0.33), X(0.016), X(0.022)));
      // nose ridge
      stroke(sp(R(F, [[0, 0.5], [0.02, 0.66], [0.0, 0.74]]), false), rgba('#9a909e', 0.8), 1);
      // painted mouth: a grim black line with small red fangs
      stroke(sp(R(F, [[-0.14, 0.86], [-0.05, 0.875], [0.05, 0.875], [0.14, 0.86]]), false), '#1a1014', 1.8);
      [-1, 1].forEach((sx) => { const fg = sp(R(F, [[sx * 0.08, 0.872], [sx * 0.12, 0.866], [sx * 0.1, 0.93, 1]]), true); c.fillStyle = C.red; c.fill(fg); });
      // lacquer crackle (age)
      stroke(sp(R(F, [[0.28, 0.1], [0.25, 0.17], [0.29, 0.22]]), false), rgba('#8a8090', 0.6), 0.7);
    } });
    return m;
  };

  /* ------------------------------------------------------------------ front / back figure */
  QF.draw = function (F, o) {
    const h = F.h, X = F.X; const back = F.view === 'back';
    const masked = !o.unmasked;
    // pose
    const pom = [X(0.4), X(2.42)], stip = [X(1.62), X(5.75)]; const sd = V.norm(V.sub(stip, pom));
    const gAt = V.add(pom, V.mul(sd, X(0.36)));
    const armR = F.ik(1, LQ.gripW(F, gAt, sd, F.shoulderJ(1), 0.25), 'out');
    const armL = F.ik(-1, [X(-1.02), X(3.85)], 'out');
    const lanAt = [X(-1.12), X(4.75)];
    const drawLantern = () => {
      if (!S.sil && !back) glow(lanAt[0], lanAt[1], X(1.2), C.soul, 0.4);
      line([V.add(armL.W, [X(-0.02), X(0.25)]), [lanAt[0], lanAt[1] - X(0.42)]], '#3a2a20', 1.2);
      const lx = lanAt[0], ly = lanAt[1];
      const body = sp([[lx - X(0.2), ly - X(0.33)], [lx + X(0.2), ly - X(0.33)], [lx + X(0.24), ly], [lx + X(0.2), ly + X(0.33)], [lx - X(0.2), ly + X(0.33)], [lx - X(0.24), ly]], true);
      cel(body, { fill: '#e8f6ff', shade: '#9ac8e0', k: X(0.1), rim: false, after: (c) => { if (S.sil) return; const g = c.createRadialGradient(lx, ly + X(0.05), 1, lx, ly, X(0.3)); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.4, rgba(C.soul, 0.8)); g.addColorStop(1, rgba(C.soul, 0)); c.fillStyle = g; c.fillRect(lx - X(0.3), ly - X(0.35), X(0.6), X(0.7)); [-0.1, 0.1].forEach((dx) => line([[lx + X(dx), ly - X(0.32)], [lx + X(dx * 1.3), ly], [lx + X(dx), ly + X(0.32)]], rgba('#3a5a6a', 0.6), 0.9)); const fl = sp([[lx, ly - X(0.12), 1], [lx + X(0.06), ly + X(0.04)], [lx, ly + X(0.1)], [lx - X(0.06), ly + X(0.04)]], true); c.fillStyle = '#ffffff'; c.fill(fl); } });
      [ly - X(0.36), ly + X(0.36)].forEach((yy, i) => cel(sp([[lx - X(0.22), yy - X(0.04)], [lx + X(0.22), yy - X(0.04)], [lx + X(0.17), yy + X(i ? 0.08 : 0.04)], [lx - X(0.17), yy + X(i ? 0.08 : 0.04)]], true), { fill: C.brass, k: X(0.04), hi: true, lw: 1.1 }));
      cel(ell(lx, ly - X(0.45), X(0.05), X(0.04)), { fill: C.brass, k: 1, lw: 1 });
      const tt = tube([[lx, ly + X(0.45)], [lx, ly + X(0.8)]], X(0.03), { seg: 2, end: 'point' }); cel(tt, { fill: C.soul, k: 1, lw: 0.8 });
      F.mark('lantern', lx - X(0.2), ly);
    };
    const drawSword = () => {
      const r = LQ.jian(F, { a: pom, b: stip, sheathed: true, scab: '#1e1a20', fit: C.brass, grip: '#3a1a20', tassel: { col: C.redL, sway: back ? -0.2 : 0.25, bead: '#e8f0e8' }, gripL: 0.6,
        scabDeco: (sA, d, n, L) => { for (let i = 0; i < 4; i++) { const q = V.add(sA, V.mul(d, L * (0.42 + i * 0.12))); stroke(ell(q[0], q[1], X(0.035), X(0.035)), rgba(C.brass, 0.6), 0.8); } } });
      F.mark('sword', ...V.add(pom, V.mul(sd, X(2.2))));
    };
    // ---- back layers (front view): cape back, ponytail
    const capeBackPts = [[0.1, 1.05], [0.75, 1.15], [1.12, 1.45], [1.3, 2.6], [1.42, 4.0], [1.55, 4.9]];
    const ragged = (a, b, n, amp) => { const out = []; for (let i = 0; i <= n; i++) { const t = i / n; const q = V.lerp(a, b, t); out.push([q[0], q[1] + (i % 2 ? amp : -amp * 0.4) * (1 + 0.6 * Math.sin(i * 2.3)), 1]); } return out; };
    const cape = (front) => {
      const hem = ragged([1.55, 4.9], [0.42, 4.05], 9, 0.14);
      const pts = front ? [[0.28, 1.0], [0.75, 1.12], [1.1, 1.42], [1.2, 2.4], [1.3, 3.6], [1.5, 4.8], ...ragged([1.5, 4.8], [0.55, 3.9], 8, 0.13), [0.5, 3.0], [0.32, 2.0], [0.12, 1.45]] : capeBackPts.concat(hem);
      return sp(R(F, pts), true);
    };
    const capeFill = (q, deep) => cel(q, { fill: deep ? C.ashD : C.ash, k: X(0.3), sd: [X(-0.28), X(-0.06)], grad: [X(1), X(4.9)], gradB: 0.12, tex: LQ.pattern('weave', '#8a8078', X(0.18), 0.12), after: (c) => {
      fold(R(F, [[0.75, 1.5], [0.95, 2.8], [1.1, 4.4]]), X(0.08), '#9a9088', 0.5); fold(R(F, [[0.5, 1.7], [0.62, 2.8], [0.75, 3.9]]), X(0.06), '#9a9088', 0.45);
      // ash-burnt edge (painted gradient along the hem)
      const g = c.createLinearGradient(0, X(3.6), 0, X(4.9)); g.addColorStop(0, 'rgba(90,70,60,0)'); g.addColorStop(1, 'rgba(90,70,60,0.55)'); c.fillStyle = g; c.fillRect(X(0), X(3.5), X(2), X(1.5));
    } });
    const ptail = () => {
      const tails = LQ.hairTail(R(F, back ? [[0.0, -0.05], [-0.15, 0.4], [-0.1, 1.3], [-0.05, 2.3], [-0.2, 3.1]] : [[0.0, -0.05], [-0.35, -0.3], [-0.85, -0.1], [-1.05, 0.6], [-1.0, 1.6], [-1.15, 2.6], [-1.4, 3.2]]), (t) => X(0.13 + 0.12 * Math.sin(Math.min(1, t * 1.8) * Math.PI * 0.55) * (1 - t * 0.6)), { n: 4, spread: 0.8, lens: [0.92, 1, 0.88, 0.96] });
      LQ.hairMass(F, tails, { col: C.hair, k: X(0.14), sd: [X(-0.12), X(-0.03)], strands: back ? [R(F, [[-0.05, 0.6], [-0.08, 1.6]])] : [R(F, [[-0.5, -0.2], [-0.95, 0.1], [-1.02, 1.0]])], strandA: 0.35 });
      // ribbon tails: a faded red ribbon (his sister's)
      const rb = tube(R(F, back ? [[0, 0.0], [0.25, 0.35], [0.2, 0.9], [0.35, 1.3]] : [[0, -0.03], [-0.3, 0.05], [-0.62, 0.5], [-0.6, 1.0]]), (t) => X(0.05 + 0.015 * Math.sin(t * 8)), { seg: 8 });
      cel(rb, { fill: '#9a2a32', k: X(0.03), lw: 1.1 });
    };
    if (!back) { capeFill(cape(false), true); ptail(); }
    else { drawLantern(); }
    const backHair = sp(R(F, [[-0.45, 0.5], [-0.44, 0.15], [0, -0.05], [0.44, 0.15], [0.45, 0.5], [0.32, 0.98], [-0.32, 0.98]]), true);
    if (!back) LQ.hairMass(F, [backHair], { col: C.hair, rim: false, k: X(0.1) });
    // ---- legs & boots
    const bootTop = F.knee + X(0.15);
    [[-1, X(0.6)], [1, X(0.6)]].forEach(([sx, fx]) => {
      const L = LQ.legShape(F, { sx, top: F.waistY, kneeW: X(0.31), ankleW: X(0.27), ankleY: bootTop + X(0.18), footX: fx, thigh: 0.05 });
      LQ.drawLeg(F, L, { sx, col: C.trou, bunch: true });
      LQ.boot(F, { sx, x: sx * fx, y: F.ankle, topY: bootTop, col: '#1c191e', sole: '#3a3236', trim: C.red, shaftW: X(0.2), soleT: X(0.045), toeOut: X(0.1) });
      if (sx < 0) F.mark('boot', sx * fx - X(0.12), bootTop + X(0.6));
    });
    // ---- robe (箭袖袍, four slits: front/back/sides)
    const hemY = 5.55; const slitTop = F.crotch / h + 0.05;
    const robeBack = symR(F, [[0, 1.12], [0.3, 1.1], [0.8, 1.24], [1.0, 1.5], [0.9, 2.3], [0.8, 2.8], [1.0, 3.6], [1.18, hemY - 0.02, 1], [0, hemY + 0.06]]);
    cel(robeBack, { fill: darken(C.red, 0.15), k: X(0.12) });
    LQ.neck(F, { skin: C.skin, w: F.nw, bottom: 1.32 });
    const robeHalf = (sx) => sp(R(F, sx > 0 ? [[0.0, 1.12], [0.3, 1.1], [0.8, 1.24], [1.0, 1.5], [0.9, 2.3], [0.8, 2.8], [0.98, 3.6], [1.08, hemY - 0.05, 1], [0.5, hemY + 0.02], [0.06, hemY + 0.04, 1], [0.04, slitTop, 1], [0.0, slitTop - 0.02]] : [[0.0, 1.12], [-0.3, 1.1], [-0.8, 1.24], [-1.0, 1.5], [-0.9, 2.3], [-0.8, 2.8], [-0.98, 3.6], [-1.08, hemY - 0.05, 1], [-0.5, hemY + 0.02], [-0.06, hemY + 0.04, 1], [-0.04, slitTop, 1], [0.0, slitTop - 0.02]]), true);
    [-1, 1].forEach((sx) => {
      const q = robeHalf(sx);
      cel(q, { fill: C.ink2, k: X(0.24), sd: [X(-0.22), X(-0.05)], grad: [X(1.2), X(hemY)], gradA: 0.1, tex: LQ.pattern('cloud', '#5a5260', X(0.55), 0.18), after: () => {
        fold(R(F, [[sx * 0.3, 3.5], [sx * 0.4, 4.5], [sx * 0.42, 5.5]]), X(0.07), '#0c0a0e', 0.6); fold(R(F, [[sx * 0.7, 3.6], [sx * 0.82, 4.6], [sx * 0.9, 5.5]]), X(0.06), '#0c0a0e', 0.5);
        fold(R(F, [[sx * 0.2, 2.95], [sx * 0.45, 3.05], [sx * 0.7, 2.98]]), X(0.04), '#0c0a0e', 0.5);
      } });
      piping(R(F, [[sx * 0.04, slitTop], [sx * 0.06, hemY + 0.03]]), X(0.05), C.red);
      LQ.border(R(F, [[sx * 1.08, hemY - 0.07], [sx * 0.5, hemY + 0.0], [sx * 0.06, hemY + 0.02]]), X(0.1), C.red, '#e8a060', 'hui', { step: X(0.14) });
    });
    F.mark('robe', X(-0.75), X(4.6));
    if (!back) {
      piping(R(F, [[0.02, 1.16], [-0.32, 1.3], [-0.62, 1.62], [-0.8, 2.1], [-0.8, 2.75], [-0.96, 3.5]]), X(0.06), C.red);
      [[-0.1, 1.2], [-0.5, 1.48], [-0.76, 1.95], [-0.82, 2.5]].forEach(([x, y]) => LQ.knot(X(x), X(y), X(0.05), C.brass, -0.6));
    } else {
      stroke(sp(R(F, [[0, 1.2], [0, slitTop]]), false), rgba('#000', 0.6), 1);
    }
    // inner stand collar (black with crimson edge)
    const col = sp(R(F, [[-0.24, 0.96], [0.24, 0.96], [0.29, 1.17], [0, 1.21], [-0.29, 1.17]]), true);
    cel(col, { fill: C.ink, k: X(0.05) }); piping(R(F, [[-0.24, 0.97], [0, 0.95], [0.24, 0.97]]), X(0.035), C.red);
    // ---- belt with 長明宮 lantern buckle, hanging cords, her leopard-cat charm
    const belt = sp(R(F, [[-0.84, 2.7], [0, 2.76], [0.84, 2.7], [0.86, 3.0], [0, 3.06], [-0.86, 3.0]]), true);
    cel(belt, { fill: '#121014', k: X(0.08), hi: true, hiA: 0.3, hiCol: '#5a5060', after: () => { stitch(R(F, [[-0.82, 2.76], [0, 2.81], [0.82, 2.76]]), '#6a5a50', 0.7); stitch(R(F, [[-0.82, 2.95], [0, 3.0], [0.82, 2.95]]), '#6a5a50', 0.7); } });
    if (!back) {
      const bk = sp(R(F, [[-0.13, 2.7], [0.13, 2.7], [0.17, 2.82], [0.13, 3.06], [-0.13, 3.06], [-0.17, 2.82]]), true);
      cel(bk, { fill: C.brass, k: X(0.06), hi: true, hiA: 0.5, after: (c) => { c.fillStyle = '#5a3a1a'; c.fill(ell(0, X(2.88), X(0.05), X(0.08))); c.fillStyle = rgba(C.soul, 0.9); c.fill(ell(0, X(2.9), X(0.025), X(0.04))); } });
      F.mark('buckle', X(0.12), X(2.88));
      line(R(F, [[-0.45, 3.02], [-0.47, 3.45]]), C.red, 1.1);
      const tc = [X(-0.47), X(3.55)]; const s = X(0.08);
      const head = sp([[tc[0] - s, tc[1] - s * 0.2], [tc[0] - s * 0.95, tc[1] - s * 1.05, 1], [tc[0] - s * 0.45, tc[1] - s * 0.65], [tc[0] + s * 0.45, tc[1] - s * 0.65], [tc[0] + s * 0.95, tc[1] - s * 1.05, 1], [tc[0] + s, tc[1] - s * 0.2], [tc[0] + s * 0.7, tc[1] + s * 0.7], [tc[0] - s * 0.7, tc[1] + s * 0.7]], true);
      cel(head, { fill: '#c89058', k: s * 0.4, lw: 0.9, after: (c) => { c.fillStyle = '#2a1a14'; c.fill(ell(tc[0] - s * 0.38, tc[1], s * 0.13, s * 0.16)); c.fill(ell(tc[0] + s * 0.38, tc[1], s * 0.13, s * 0.16)); c.fillStyle = 'rgba(255,255,255,0.8)'; c.fill(ell(tc[0], tc[1] + s * 0.3, s * 0.35, s * 0.18)); } });
      F.mark('charm', tc[0] - X(0.08), tc[1]);
    }
    // ---- sword at the left hip (front: in front of the robe)
    if (!back) drawSword();
    // ---- arms: narrow sleeves, crimson horse-hoof cuffs
    [[-1, armL], [1, armR]].forEach(([sx, arm]) => {
      const sl = LQ.sleeve(F, { sx, arm, wS: X(0.2), wE: X(0.17), wC: X(0.15), cuffT: 0.86, capIn: 0.5 });
      LQ.drawSleeve(F, sl, { sx, col: C.ink2, tex: LQ.pattern('cloud', '#5a5260', X(0.55), 0.18) });
      // 馬蹄袖 horse-hoof cuff, turned back
      const d = sl.dF, n = sl.oF; const a = sl.C; const wc = X(0.17);
      const hoof = sp([V.add(a, V.mul(n, wc)), V.add(V.add(a, V.mul(n, wc * 1.05)), V.mul(d, X(0.2))), V.add(V.add(a, V.mul(n, wc * 0.2)), V.mul(d, X(0.32)), 1), V.add(V.add(a, V.mul(n, -wc * 0.9)), V.mul(d, X(0.2))), V.add(a, V.mul(n, -wc))], true);
      cel(hoof, { fill: C.red, k: X(0.07), hi: true, hiA: 0.35, after: () => { stroke(sp([V.add(V.add(a, V.mul(n, wc * 0.8)), V.mul(d, X(0.04))), V.add(V.add(a, V.mul(n, -wc * 0.75)), V.mul(d, X(0.04)))], false), '#e8a060', 0.8); } });
      // white hemp mourning band on the right upper arm
      if (sx < 0 && !back) { const p0 = V.lerp(arm.S, arm.E, 0.42), p1 = V.lerp(arm.S, arm.E, 0.56); const hb = tube([p0, p1], X(0.215), { seg: 2 }); cel(hb, { fill: C.hemp, k: X(0.08), tex: LQ.pattern('weave', '#8a7a5a', X(0.15), 0.25) }); const tl = tube([V.add(p1, [X(-0.18), 0]), V.add(p1, [X(-0.3), X(0.3)]), V.add(p1, [X(-0.26), X(0.55)])], X(0.04), { seg: 4, end: 'point' }); cel(tl, { fill: C.hemp, k: 1, lw: 0.9 }); F.mark('band', p0[0] - X(0.2), p0[1]); }
    });
    if (!back) {
      LQ.hand(F, { kind: 'grip', sx: 1, at: gAt, pole: V.mul(sd, -1), toward: F.shoulderJ(1), skin: C.skin, scale: 1.05 });
      LQ.hand(F, { kind: 'fist', sx: -1, at: armL.W, dir: V.norm(V.sub(armL.W, armL.E)), skin: C.skin });
      drawLantern();
    }
    // ---- cape front (over the left shoulder) and the tie cord
    if (!back) {
      const cf = cape(true); capeFill(cf, false);
      line(R(F, [[0.3, 1.5], [-0.2, 1.75], [-0.62, 2.15]]), '#3a1a20', 1.6); line(R(F, [[0.3, 1.5], [-0.2, 1.75], [-0.62, 2.15]]), C.red, 0.9);
      const clasp = ell(X(0.32), X(1.48), X(0.09), X(0.11)); cel(clasp, { fill: C.brass, k: X(0.05), hi: true, lw: 1.1, after: (c) => { c.fillStyle = rgba(C.soul, 0.9); c.fill(ell(X(0.32), X(1.5), X(0.03), X(0.045))); } });
      F.mark('cape', X(1.3), X(3.0));
    }
    // ---- head
    if (!back) {
      const fc = QF.face;
      LQ.face(F, fc, o.expr ? QF.expr[o.expr] : null);
      if (masked) { QF.mask(F, { glow: o.eyeGlow }); F.mark('mask', X(0.32), X(0.7)); }
      // front hair: centre-left part, long strands falling over the mask/face
      const cap = sp(R(F, [[-0.42, 0.52], [-0.46, 0.22], [-0.3, -0.03], [0, -0.08], [0.3, -0.03], [0.46, 0.22], [0.42, 0.52], [0.36, 0.34], [0.2, 0.17], [-0.04, 0.12], [-0.22, 0.18], [-0.36, 0.34]]), true);
      const fr = [[-0.06, 0.02, 0.3, 0.12, 0.62, 0.05], [-0.08, 0.03, 0.28, -0.26, 0.58, -0.05], [0.16, 0.05, 0.26, 0.3, 0.5, 0.04], [-0.28, 0.1, 0.22, -0.4, 0.66, -0.04], [0.04, 0.06, 0.08, 0.02, 0.86, -0.03],
        [-0.38, 0.26, 0.14, -0.45, 1.25, -0.08], [0.38, 0.26, 0.13, 0.46, 1.15, 0.07]].map((q) => LQ.lock([X(q[0]), X(q[1])], X(q[2]), [X(q[3]), X(q[4])], X(q[5])));
      occl(LQ.facePath(F, fc), union(...fr.slice(0, 5)), X(0.015), X(0.05), mix(C.skin, LQ.shadeOf(C.skin, S.skinTint), 0.85), 1);
      LQ.hairMass(F, [cap, ...fr], { col: C.hair, rim: false, ring: [0, X(0.5), X(0.41), Math.PI * 1.2, Math.PI * 1.8], ringN: 3, ringW: 0.025, k: X(0.09), sd: [X(-0.07), X(-0.08)] });
      const tie = ell(0, X(-0.04), X(0.08), X(0.06)); cel(tie, { fill: '#2a2228', k: 2, lw: 1 });
    } else {
      // back of the head: smooth cap converging to the crown tie; mask cords knotted
      const head = sp(R(F, [[-0.45, 0.6], [-0.47, 0.25], [-0.3, -0.03], [0, -0.08], [0.3, -0.03], [0.47, 0.25], [0.45, 0.6], [0.35, 0.95], [0, 1.02], [-0.35, 0.95]]), true);
      LQ.hairMass(F, [head], { col: C.hair, rim: true, ring: [0, X(0.55), X(0.4), Math.PI * 1.2, Math.PI * 1.8], ringN: 3, ringW: 0.025, k: X(0.12), dark: [R(F, [[-0.3, 0.9], [-0.2, 0.4], [0, 0.0]]), R(F, [[0.3, 0.9], [0.2, 0.4], [0, 0.0]]), R(F, [[0, 0.95], [0, 0.3]])] });
      [-1, 1].forEach((sx) => { const cd = tube(R(F, [[sx * 0.46, 0.4], [sx * 0.2, 0.5], [0, 0.52]]), X(0.022), { seg: 4 }); cel(cd, { fill: C.red, k: 1, lw: 0.9 }); });
      cel(ell(0, X(0.52), X(0.06), X(0.05)), { fill: C.red, k: 1, lw: 1 });
      [[-0.05, 0.55, -0.1, 1.0], [0.05, 0.55, 0.12, 0.95]].forEach(([x0, y0, x1, y1]) => { const t = tube(R(F, [[x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2 + 0.05], [x1, y1]]), X(0.02), { seg: 3, end: 'point' }); cel(t, { fill: C.red, k: 1, lw: 0.8 }); });
      ptail();
      const tie = ell(0, X(-0.04), X(0.08), X(0.06)); cel(tie, { fill: '#2a2228', k: 2, lw: 1 });
      // back: the sword's scabbard end and the cape drape over everything
      drawSword();
      capeFill(sp(R(F, [[0.1, 1.0], [0.75, 1.12], [1.12, 1.45], [1.3, 2.6], [1.42, 4.0], [1.55, 4.9], ...ragged([1.55, 4.9], [-0.15, 4.4], 11, 0.14), [-0.3, 3.0], [-0.35, 1.9], [-0.15, 1.3]]), true), false);
    }
  };

  /* ------------------------------------------------------------------ side view (facing screen-left; his left side to camera) */
  QF.drawSide = function (F, o) {
    const h = F.h, X = F.X; const masked = !o.unmasked;
    const ragged = (a, b, n, amp) => { const out = []; for (let i = 0; i <= n; i++) { const t = i / n; const q = V.lerp(a, b, t); out.push([q[0], q[1] + (i % 2 ? amp : -amp * 0.4) * (1 + 0.6 * Math.sin(i * 2.3)), 1]); } return out; };
    // far arm (right) holding the lantern a little forward
    const lan = [X(-0.62), X(4.75)];
    if (!S.sil) glow(lan[0], lan[1], X(1.0), C.soul, 0.35);
    const farArm = tube(R(F, [[0.05, 1.5], [0.0, 2.7], [-0.3, 3.75]]), [X(0.16), X(0.14), X(0.12)], { seg: 6 }); cel(farArm, { fill: darken(C.ink2, 0.2), k: X(0.05), sh: 0 });
    // ponytail behind
    const pt = LQ.hairTail(R(F, [[0.2, -0.08], [0.55, -0.25], [0.9, 0.2], [0.8, 1.2], [0.75, 2.2], [0.9, 3.0]]), (t) => X(0.14 + 0.1 * Math.sin(Math.min(1, t * 1.8) * Math.PI * 0.55) * (1 - t * 0.6)), { n: 4, spread: 0.7 });
    LQ.hairMass(F, pt, { col: C.hair, k: X(0.14), sd: [X(-0.1), X(-0.03)], strands: [R(F, [[0.55, -0.2], [0.85, 0.3], [0.78, 1.3]])], strandA: 0.35 });
    // far leg
    const legFar = sp(R(F, [[-0.32, 3.4], [0.22, 3.4], [0.18, 4.6], [0.12, 5.25], [-0.14, 5.25], [-0.2, 4.6]]), true); cel(legFar, { fill: darken(C.trou, 0.25), k: 1, sh: 0 });
    const bootF = sp(R(F, [[-0.14, 5.1], [0.16, 5.1], [0.18, 7.2], [0.22, 7.45], [-0.62, 7.45], [-0.66, 7.32], [-0.18, 7.12]]), true); cel(bootF, { fill: '#121014', k: 1, sh: 0 });
    // lantern (far hand)
    line([[X(-0.3), X(3.9)], [lan[0], lan[1] - X(0.4)]], '#3a2a20', 1.2);
    const lb = sp([[lan[0] - X(0.17), lan[1] - X(0.33)], [lan[0] + X(0.17), lan[1] - X(0.33)], [lan[0] + X(0.22), lan[1]], [lan[0] + X(0.17), lan[1] + X(0.33)], [lan[0] - X(0.17), lan[1] + X(0.33)], [lan[0] - X(0.22), lan[1]]], true);
    cel(lb, { fill: '#e8f6ff', shade: '#9ac8e0', k: X(0.1), rim: false, after: (c) => { if (S.sil) return; const g = c.createRadialGradient(lan[0], lan[1], 1, lan[0], lan[1], X(0.3)); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, rgba(C.soul, 0.8)); g.addColorStop(1, rgba(C.soul, 0)); c.fillStyle = g; c.fillRect(lan[0] - X(0.3), lan[1] - X(0.35), X(0.6), X(0.7)); } });
    [lan[1] - X(0.36), lan[1] + X(0.36)].forEach((yy) => cel(sp([[lan[0] - X(0.2), yy - X(0.04)], [lan[0] + X(0.2), yy - X(0.04)], [lan[0] + X(0.15), yy + X(0.06)], [lan[0] - X(0.15), yy + X(0.06)]], true), { fill: C.brass, k: X(0.04), lw: 1.1 }));
    const fh = ell(X(-0.32), X(3.88), X(0.1), X(0.12)); cel(fh, { fill: darken(C.skin, 0.1), k: 2, lw: 1.1 });
    // cape back drape (behind the body on the near shoulder)
    const capeB = sp(R(F, [[0.0, 1.15], [0.4, 1.2], [0.75, 1.8], [0.95, 3.2], [1.15, 4.7], ...ragged([1.15, 4.7], [0.2, 4.2], 7, 0.13), [0.25, 2.8], [0.1, 1.8]]), true);
    cel(capeB, { fill: C.ashD, k: X(0.18), sd: [X(-0.15), 0], grad: [X(1), X(4.8)], gradB: 0.15 });
    // near leg + boot
    const legN = sp(R(F, [[-0.38, 3.3], [0.28, 3.3], [0.24, 4.4], [0.16, 5.2], [-0.24, 5.25], [-0.3, 4.4]]), true);
    cel(legN, { fill: C.trou, k: X(0.12), sd: [X(-0.1), 0], after: () => { fold(R(F, [[-0.2, 4.7], [0.0, 4.85], [0.15, 4.75]]), X(0.04), LQ.deepOf(C.trou), 0.6); fold(R(F, [[-0.25, 5.0], [-0.05, 5.1], [0.12, 5.02]]), X(0.04), LQ.deepOf(C.trou), 0.6); } });
    const boot = sp(R(F, [[-0.26, 5.12], [0.2, 5.12], [0.18, 6.4], [0.24, 7.25], [0.26, 7.5, 1], [-0.72, 7.5, 1], [-0.76, 7.36], [-0.6, 7.25], [-0.26, 7.1], [-0.22, 6.4]]), true);
    cel(boot, { fill: '#1c191e', k: X(0.1), sd: [X(-0.08), 0], hi: true, hiA: 0.35, after: () => { fold(R(F, [[-0.22, 6.9], [0.0, 6.82], [0.18, 6.95]]), X(0.03), '#000', 0.6); } });
    cel(sp(R(F, [[-0.28, 5.1], [0.22, 5.1], [0.22, 5.22], [-0.28, 5.22]]), true), { fill: C.red, k: 1, lw: 1 });
    cel(sp(R(F, [[0.27, 7.44], [-0.74, 7.44], [-0.78, 7.5], [0.27, 7.5]]), true), { fill: '#3a3236', k: 1, lw: 1 });
    F.mark('boot', X(0.2), X(6.4));
    // robe: back panel (behind slit) + front panel, side slit open from the hip
    const slitTop = 3.55, hemY = 5.55;
    const rBack = sp(R(F, [[0.05, 1.2], [0.38, 1.35], [0.42, 2.0], [0.3, 2.8], [0.45, 3.5], [0.62, 4.5], [0.78, hemY, 1], [0.12, hemY + 0.03, 1], [0.08, slitTop, 1]]), true);
    cel(rBack, { fill: C.ink2, k: X(0.2), sd: [X(-0.18), 0], grad: [X(1.2), X(hemY)], tex: LQ.pattern('cloud', '#5a5260', X(0.55), 0.18) });
    piping(R(F, [[0.08, slitTop], [0.12, hemY + 0.02]]), X(0.05), C.red);
    const rFront = sp(R(F, [[-0.1, 1.15], [-0.32, 1.3], [-0.46, 1.8], [-0.46, 2.4], [-0.36, 2.8], [-0.45, 3.5], [-0.58, 4.5], [-0.72, hemY - 0.03, 1], [-0.02, hemY + 0.03, 1], [0.02, slitTop, 1], [0.1, 2.9], [0.1, 1.5]]), true);
    cel(rFront, { fill: C.ink2, k: X(0.2), sd: [X(-0.15), 0], grad: [X(1.2), X(hemY)], tex: LQ.pattern('cloud', '#5a5260', X(0.55), 0.18), after: () => { fold(R(F, [[-0.3, 3.4], [-0.38, 4.4], [-0.45, 5.5]]), X(0.06), '#0c0a0e', 0.6); } });
    piping(R(F, [[0.02, slitTop], [-0.02, hemY + 0.02]]), X(0.05), C.red);
    LQ.border(R(F, [[-0.72, hemY - 0.05], [-0.02, hemY + 0.02]]), X(0.1), C.red, '#e8a060', 'hui', { step: X(0.14) }); LQ.border(R(F, [[0.12, hemY + 0.0], [0.78, hemY - 0.03]]), X(0.1), C.red, '#e8a060', 'hui', { step: X(0.14) });
    F.mark('slit', X(0.06), X(4.4));
    // belt
    const belt = sp(R(F, [[-0.4, 2.72], [0.32, 2.72], [0.36, 3.02], [-0.42, 3.02]]), true); cel(belt, { fill: '#121014', k: X(0.06), hi: true, hiA: 0.3 });
    cel(sp(R(F, [[-0.46, 2.72], [-0.34, 2.72], [-0.34, 3.02], [-0.46, 3.02]]), true), { fill: C.brass, k: 2, lw: 1 });
    // neck
    const neck = sp(R(F, [[-0.18, 0.78], [0.12, 0.72], [0.18, 1.2], [0.02, 1.35], [-0.22, 1.3], [-0.24, 1.05]]), true); cel(neck, { fill: C.skin, shade: LQ.shadeOf(C.skin, S.skinTint), k: X(0.08), sd: [X(0.06), 0], rim: false, line: LQ.lineOf(C.skin) });
    const colr = sp(R(F, [[-0.26, 0.98], [0.14, 0.94], [0.18, 1.2], [-0.26, 1.24]]), true); cel(colr, { fill: C.ink, k: 2 }); piping(R(F, [[-0.26, 0.99], [0.14, 0.95]]), X(0.035), C.red);
    // sword: hilt forward-up at the left hip, scabbard angled back
    LQ.jian(F, { a: [X(-0.78), X(2.66)], b: [X(1.85), X(4.55)], sheathed: true, scab: '#1e1a20', fit: C.brass, grip: '#3a1a20', tassel: { col: C.redL, sway: 0.15, bead: '#e8f0e8' }, gripL: 0.6 });
    // near arm: upper arm back, hand on the hilt
    const Sx = [X(-0.02), X(1.5)], E = [X(0.2), X(2.62)], W = [X(-0.38), X(2.92)];
    const arm = tube([Sx, E, W], [X(0.21), X(0.17), X(0.15)], { seg: 8, start: 'round' });
    cel(arm, { fill: C.ink2, k: X(0.14), sd: [X(-0.12), X(-0.05)], tex: LQ.pattern('cloud', '#5a5260', X(0.55), 0.18), after: () => { fold([E, V.add(E, [X(-0.12), X(-0.15)]), V.add(E, [X(-0.25), X(-0.1)])], X(0.04), '#0c0a0e', 0.6); } });
    const d = V.norm(V.sub(W, E)), n = V.perp(d); const hoof = sp([V.add(W, V.mul(n, X(0.17))), V.add(V.add(W, V.mul(n, X(0.18))), V.mul(d, X(0.18))), V.add(V.add(W, V.mul(n, X(0.0))), V.mul(d, X(0.3)), 1), V.add(V.add(W, V.mul(n, -X(0.16))), V.mul(d, X(0.18))), V.add(W, V.mul(n, -X(0.17)))], true);
    LQ.hand(F, { kind: 'grip', sx: -1, at: [X(-0.55), X(2.79)], pole: V.norm([X(1.85) + X(0.78), X(4.55) - X(2.66)]), toward: E, skin: C.skin });
    cel(hoof, { fill: C.red, k: X(0.06), hi: true, hiA: 0.35 });
    // cape on the near shoulder (covers the upper arm), ragged
    const capeN = sp(R(F, [[-0.22, 1.1], [0.15, 1.05], [0.42, 1.3], [0.55, 2.1], [0.62, 2.9], ...ragged([0.62, 2.9], [-0.32, 2.4], 6, 0.12), [-0.38, 1.7]]), true);
    cel(capeN, { fill: C.ash, k: X(0.22), sd: [X(-0.2), X(-0.05)], grad: [X(1), X(3)], tex: LQ.pattern('weave', '#8a8078', X(0.18), 0.12), after: (c) => { fold(R(F, [[0.0, 1.4], [0.15, 2.0], [0.25, 2.7]]), X(0.06), '#9a9088', 0.5); const g = c.createLinearGradient(0, X(2.3), 0, X(3.0)); g.addColorStop(0, 'rgba(90,70,60,0)'); g.addColorStop(1, 'rgba(90,70,60,0.5)'); c.fillStyle = g; c.fillRect(X(-0.5), X(2.2), X(1.3), X(0.9)); } });
    cel(ell(X(-0.25), X(1.45), X(0.06), X(0.09)), { fill: C.brass, k: 2, hi: true, lw: 1 });
    F.mark('cape', X(0.6), X(2.6));
    // head (profile)
    QF.profileHead(F, { masked });
  };
  QF.profileHead = function (F, o) {
    const h = F.h, X = F.X;
    // back hair mass
    const hb = sp(R(F, [[0.0, -0.08], [0.32, -0.02], [0.5, 0.3], [0.48, 0.7], [0.3, 1.0], [0.08, 1.02], [0.05, 0.6]]), true);
    LQ.hairMass(F, [hb], { col: C.hair, rim: true, k: X(0.12), sd: [X(-0.1), X(-0.05)] });
    // face profile
    const fp = sp(R(F, [[0.05, 0.05], [-0.25, 0.08], [-0.38, 0.28], [-0.41, 0.46], [-0.37, 0.56], [-0.42, 0.62], [-0.5, 0.76, 1], [-0.42, 0.8], [-0.43, 0.84], [-0.38, 0.87], [-0.41, 0.9], [-0.35, 0.94], [-0.37, 1.0], [-0.22, 1.05], [0.06, 0.92], [0.15, 0.7], [0.1, 0.3]]), true);
    cel(fp, { fill: C.skin, shade: mix(C.skin, LQ.shadeOf(C.skin, S.skinTint), 0.8), k: X(0.06), sd: [X(0.06), 0], line: mix(mul(C.skin, '#80463f'), '#2a1414', 0.35), lw: 1.5, rim: false });
    if (!S.sil) {
      // ear
      const ear = sp(R(F, [[0.02, 0.5], [0.14, 0.47], [0.18, 0.6], [0.12, 0.74], [0.02, 0.72]]), true); cel(ear, { fill: C.skin, shade: LQ.shadeOf(C.skin, S.skinTint), k: X(0.03), rim: false, line: LQ.lineOf(C.skin), lw: 1.2 });
      if (!o.masked) {
        // eye (profile), brow, mouth
        const c = S.ctx; c.fillStyle = '#fbf7f4'; const ey = sp(R(F, [[-0.36, 0.6], [-0.3, 0.57], [-0.27, 0.6], [-0.3, 0.62]]), true); c.fill(ey); c.fillStyle = C.eye; c.fill(ell(X(-0.33), X(0.6), X(0.022), X(0.025)));
        stroke(sp(R(F, [[-0.37, 0.585], [-0.3, 0.565], [-0.26, 0.6]]), false), '#14101a', 2.2);
        const br = LQ.taper(R(F, [[-0.39, 0.5], [-0.32, 0.48], [-0.24, 0.5]]), X(0.025)); c.fillStyle = '#16121a'; c.fill(br);
        line(R(F, [[-0.4, 0.875], [-0.34, 0.88]]), '#6a3a3a', 1.2);
      }
    }
    if (o.masked) {
      const m = sp(R(F, [[-0.08, 0.06], [-0.32, 0.12], [-0.45, 0.32], [-0.48, 0.5], [-0.46, 0.6], [-0.53, 0.76], [-0.47, 0.86], [-0.45, 0.98], [-0.32, 1.06], [-0.12, 1.02], [-0.1, 0.8], [-0.04, 0.5]]), true);
      cel(m, { fill: C.bone, shade: '#c9c3cf', k: X(0.08), sd: [X(0.06), 0], hi: true, hiCol: '#fff', hiA: 0.5, lw: 1.6, line: '#3a2a30', after: (c) => {
        const fl = sp(R(F, [[-0.42, 0.45], [-0.3, 0.33], [-0.16, 0.22], [-0.05, 0.12, 1], [-0.12, 0.3], [-0.02, 0.28, 1], [-0.14, 0.42], [-0.3, 0.47]]), true); c.fillStyle = C.red; c.fill(fl);
        const eh = sp(R(F, [[-0.44, 0.58], [-0.36, 0.53], [-0.27, 0.54], [-0.33, 0.6]]), true); stroke(eh, C.red, 2.2); c.fillStyle = '#0c0a0e'; c.fill(eh);
        c.fillStyle = C.red; c.fill(LQ.taper(R(F, [[-0.38, 0.62], [-0.37, 0.76], [-0.39, 0.88]]), X(0.02)));
        stroke(sp(R(F, [[-0.18, 0.66], [-0.23, 0.74], [-0.3, 0.74], [-0.28, 0.69]]), false), C.red, 1.4);
        stroke(sp(R(F, [[-0.47, 0.875], [-0.38, 0.88]]), false), '#1a1014', 1.6);
      } });
      const cord = tube(R(F, [[-0.08, 0.4], [0.15, 0.45], [0.36, 0.5]]), X(0.022), { seg: 3 }); cel(cord, { fill: C.red, k: 1, lw: 0.9 });
      cel(ell(X(0.38), X(0.5), X(0.05), X(0.045)), { fill: C.red, k: 1, lw: 0.9 });
      F.mark('mask', X(-0.45), X(0.7));
    }
    // front hair over the temple + fringe strands in front of the mask
    const cap = sp(R(F, [[-0.38, 0.32], [-0.3, 0.02], [0.0, -0.1], [0.3, -0.04], [0.42, 0.18], [0.2, 0.3], [0.1, 0.5], [-0.05, 0.3]]), true);
    const fr = [[-0.25, 0.05, 0.22, -0.46, 0.55, -0.04], [-0.15, 0.06, 0.2, -0.36, 0.72, -0.02], [0.0, 0.25, 0.14, -0.08, 1.15, -0.04], [0.08, 0.3, 0.1, 0.12, 1.05, 0.03]].map((q) => LQ.lock([X(q[0]), X(q[1])], X(q[2]), [X(q[3]), X(q[4])], X(q[5])));
    LQ.hairMass(F, [cap, ...fr], { col: C.hair, rim: false, ring: [X(0.02), X(0.45), X(0.42), Math.PI * 1.15, Math.PI * 1.75], ringN: 3, ringW: 0.025, k: X(0.08), sd: [X(-0.06), X(-0.06)] });
    cel(ell(X(0.18), X(-0.06), X(0.08), X(0.06)), { fill: '#2a2228', k: 2, lw: 1 });
  };

  /* ------------------------------------------------------------------ sheet */
  const { txt, wrap, FONT_CN, FONT_EN } = LQ;
  const D = { body: QF.body, rim: '#ffd9b8', ink: '#141018', draw: (F, o) => (o.side ? QF.drawSide(F, o) : QF.draw(F, o)) };
  QF.D = D;
  QF.renderSheet = function (cv) {
    const W = 2400, H = 1560; cv.width = W; cv.height = H; const c = cv.getContext('2d'); LQ.begin(c, {});
    LQ.paper(c, 0, 0, W, H, '#ece6dc', 7);
    // header
    c.fillStyle = '#17131a'; c.fillRect(0, 0, W, 132); c.fillStyle = C.red; c.fillRect(0, 128, W, 4);
    txt(c, '洛青鋒', 40, 82, `62px ${FONT_CN}`, '#f3ece2'); txt(c, '「鬼面」', 248, 82, `40px ${FONT_CN}`, '#c8283a');
    txt(c, 'LUO QINGFENG  ·  "GHOST-FACE"  ·  21  ·  洛家劍 Luo-family sword  ·  story cast — final design', 44, 116, `italic 600 16px ${FONT_EN}`, '#bfb0a6');
    txt(c, '最終設計・轉面圖 Final design · turnaround sheet', W - 40, 50, `22px ${FONT_CN}`, '#f3ece2', 'right');
    txt(c, '紅纓的哥哥。中元夜滅門的倖存者，被夜玄所救，戴上白臉鬼面替長明宮辦事，相信「逆潮」能讓爹娘回來；最後替妹妹擋下一擊而死。', W - 40, 82, `16px ${FONT_CN}`, '#d6c9bd', 'right');
    txt(c, 'Her elder brother: survivor of the massacre, saved by 夜玄, serving the Temple of Eternal Light behind a white opera-ghost mask — redeemed when he dies shielding her.', W - 40, 110, `italic 14px ${FONT_EN}`, '#a8988e', 'right');
    // ---- turnaround panel
    const px = 24, py = 150, pw = 1290, ph = 1000;
    c.save(); c.beginPath(); c.roundRect(px, py, pw, ph, 8); c.clip();
    const g = c.createLinearGradient(0, py, 0, py + ph); g.addColorStop(0, '#e3ddd4'); g.addColorStop(1, '#bdb4aa'); c.fillStyle = g; c.fillRect(px, py, pw, ph);
    // measurement grid (head units) for modellers
    const FH = 790; const f0 = LQ.fig(Object.assign({}, QF.body, { H: FH })); const gy = py + ph - 46; const oy = gy - FH;
    c.strokeStyle = 'rgba(40,30,36,0.12)'; c.lineWidth = 1; c.font = `11px ${FONT_EN}`; c.fillStyle = 'rgba(40,30,36,0.45)';
    for (let i = 0; i <= 7.5; i++) { const y = oy + i * f0.h; c.beginPath(); c.moveTo(px + 50, y); c.lineTo(px + pw - 10, y); c.stroke(); c.fillText(String(i), px + 18, y + 4); }
    c.beginPath(); c.moveTo(px + 50, gy); c.lineTo(px + pw - 10, gy); c.strokeStyle = 'rgba(40,30,36,0.3)'; c.stroke();
    txt(c, '頭身 heads', px + 12, py + 22, `bold 11px ${FONT_CN}`, 'rgba(40,30,36,0.6)');
    const views = [['正面 FRONT', px + 250, {}], ['側面 SIDE (L)', px + 660, { side: true }], ['背面 BACK', px + 1060, { back: true, mirror: true }]];
    const Fs = [];
    views.forEach(([lab, x, o]) => {
      c.fillStyle = 'rgba(20,14,18,0.18)'; c.beginPath(); c.ellipse(x, gy, 130, 14, 0, 0, 7); c.fill();
      const Dd = Object.assign({}, D, { body: Object.assign({}, QF.body, { H: FH }) });
      Fs.push(LQ.drawFigure(Dd, x, oy, 1, o));
      txt(c, lab, x, py + ph - 14, `bold 15px ${FONT_CN}`, '#3a2a30', 'center');
    });
    c.restore();
    c.strokeStyle = 'rgba(40,26,30,0.3)'; c.beginPath(); c.roundRect(px, py, pw, ph, 8); c.stroke();
    // callouts (front + side)
    const big = (list, F, ox, box) => LQ.callouts(c, list, F, ox, oy, 1, box);
    LQ.calloutScale = 1.25;
    big([
      { at: 'mask', cn: '白臉鬼面', en: 'bone-lacquer "white-face" mask, red flame paint', side: -1, ly: 300 },
      { at: 'band', cn: '麻布孝帶', en: 'hemp mourning strip he never removed', side: -1 },
      { at: 'lantern', cn: '長明燈', en: 'temple lantern holding a captured soul', side: -1 },
      { at: 'boot', cn: '薄底快靴', en: 'soft riding boots, crimson binding', side: -1 },
      { at: 'cape', cn: '灰燼半披風', en: 'ash-white half cape, burnt ragged hem', side: 1, ly: 520 },
      { at: 'charm', cn: '妹妹的石虎符', en: "his sister's leopard-cat charm", side: 1 },
      { at: 'sword', cn: '洛家劍', en: 'Luo-family jian, red tassel', side: 1, ly: 820 },
    ], Fs[0], px + 250, { x: px + 52, y: py + 150, w: 400, h: ph });
    big([
      { at: 'slit', cn: '四開衩箭袖袍', en: 'four-slit riding robe, crimson lining', side: 1, ly: 860 },
    ], Fs[1], px + 660, { x: px + 470, y: py + 150, w: 400, h: ph });
    LQ.calloutScale = 1;
    // ---- right column: busts
    const rx = 1334, rw = W - rx - 24;
    const bust = (x, y, w, hh, lab, opts) => {
      c.save(); c.beginPath(); c.roundRect(x, y, w, hh, 8); c.clip();
      const g2 = c.createLinearGradient(0, y, 0, y + hh); g2.addColorStop(0, opts.bg[0]); g2.addColorStop(1, opts.bg[1]); c.fillStyle = g2; c.fillRect(x, y, w, hh);
      if (opts.glow) { const gg = c.createRadialGradient(x + w / 2, y + hh * 0.45, 10, x + w / 2, y + hh * 0.45, w * 0.6); gg.addColorStop(0, rgba(opts.glow, 0.35)); gg.addColorStop(1, rgba(opts.glow, 0)); c.fillStyle = gg; c.fillRect(x, y, w, hh); }
      const z = opts.z; const f = LQ.fig(QF.body); LQ.drawFigure(D, x + w / 2 + (opts.dx || 0), y + 28 - (opts.dy || 0), z, Object.assign({ bust: true }, opts.o));
      c.restore(); c.strokeStyle = 'rgba(40,26,30,0.3)'; c.beginPath(); c.roundRect(x, y, w, hh, 8); c.stroke();
      c.fillStyle = 'rgba(23,19,26,0.78)'; c.beginPath(); c.roundRect(x + 8, y + hh - 30, w - 16, 22, 4); c.fill(); txt(c, lab, x + w / 2, y + hh - 14, `13px ${FONT_CN}`, '#f3ece2', 'center');
    };
    const bz = 3.3;
    bust(rx, 150, 340, 400, '鬼面 MASKED — 長明宮的刀', { z: bz, bg: ['#2a2430', '#4a3a44'], glow: '#7fd3ff', o: { eyeGlow: '#ff5040' } });
    bust(rx + 352, 150, 340, 400, '素顏 UNMASKED — 洛家長子', { z: bz, bg: ['#e8e0d6', '#c8bcb0'], o: { unmasked: true } });
    // mask detail
    const mx = rx + 704, mw = rw - 704;
    c.save(); c.beginPath(); c.roundRect(mx, 150, mw, 400, 8); c.clip(); c.fillStyle = '#2b2228'; c.fillRect(mx, 150, mw, 400);
    { const f = LQ.fig(Object.assign({}, QF.body)); const z = 2.6; c.save(); c.translate(mx + mw / 2, 196); c.scale(z, z); S.Z = z; QF.mask(f, { cord: true }); S.Z = 1; c.restore(); }
    c.restore(); c.strokeStyle = 'rgba(40,26,30,0.3)'; c.beginPath(); c.roundRect(mx, 150, mw, 400, 8); c.stroke();
    txt(c, '面具 MASK DETAIL', mx + 12, 172, `bold 12px ${FONT_CN}`, '#e8dccf');
    const mnotes = ['白底＝戲曲「白臉」：', '奸臣的臉，他自認是叛徒', '紅焰眉・血淚・臉譜卷紋', '取自八家將／歌仔戲臉譜', '（非日本能面：無角、無笑紋）'];
    mnotes.forEach((s, i) => txt(c, s, mx + 12, 440 + i * 19, `12px ${FONT_CN}`, '#d6c8bc'));
    // expressions
    const ey = 566; txt(c, '表情 EXPRESSIONS（素顏）', rx, ey + 14, `bold 13px ${FONT_CN}`, '#3a2a30');
    [['tired', '疲憊 weary'], ['anguish', '痛苦 anguish'], ['smile', '最後的笑 last smile']].forEach(([k, lab], i) => {
      const x = rx + i * 232, y = ey + 24, w = 222, hh = 200;
      c.save(); c.beginPath(); c.roundRect(x, y, w, hh, 8); c.clip(); c.fillStyle = i === 2 ? '#e6e8ee' : '#e4dcd2'; c.fillRect(x, y, w, hh);
      LQ.drawFigure(D, x + w / 2, y + 22, 2.0, { bust: true, unmasked: true, expr: k === 'tired' ? null : k });
      if (k === 'smile') { c.strokeStyle = 'rgba(120,180,230,0.8)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + w / 2 - 34, y + 22 + 0.66 * 2 * 93.33 * 0.5); c.stroke(); }
      c.restore(); c.strokeStyle = 'rgba(40,26,30,0.3)'; c.beginPath(); c.roundRect(x, y, w, hh, 8); c.stroke();
      txt(c, lab, x + w / 2, y + hh - 10, `12px ${FONT_CN}`, '#3a2a30', 'center');
    });
    // palette
    const pyy = 812; txt(c, '配色 PALETTE', rx, pyy, `bold 13px ${FONT_EN}`, '#3a2a30');
    QF.palette.forEach((p, i) => { const x = rx + (i % 4) * 258, y = pyy + 12 + Math.floor(i / 4) * 44; c.fillStyle = p[0]; c.beginPath(); c.roundRect(x, y, 40, 34, 4); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.25)'; c.stroke(); txt(c, p[1], x + 48, y + 15, `bold 13px ${FONT_CN}`, '#2a1a1f'); txt(c, p[2] + '  ' + p[0].toUpperCase(), x + 48, y + 31, `11px ${FONT_EN}`, '#6a585c'); });
    // silhouettes
    const sy = 922, sh = 228; c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.roundRect(rx, sy, rw, sh, 8); c.fill(); c.strokeStyle = 'rgba(40,26,30,0.2)'; c.stroke();
    txt(c, '剪影 SILHOUETTE — 正／側／背 · 地圖尺寸 90 px 檢查', rx + 12, sy + 20, `bold 12px ${FONT_CN}`, '#5a484c');
    const ss = 0.24, sgy = sy + sh - 18;
    [[{}, 0], [{ side: true }, 1], [{ back: true, mirror: true }, 2]].forEach(([o, i]) => LQ.silhouette(D, rx + 90 + i * 150, sgy - 700 * ss, ss, o));
    const ss2 = 0.125; [[{}, 0], [{ side: true }, 1], [{ back: true, mirror: true }, 2]].forEach(([o, i]) => LQ.silhouette(D, rx + 600 + i * 90, sgy - 700 * ss2, ss2, o));
    txt(c, '90 px', rx + 690, sy + 44, `11px ${FONT_EN}`, '#6a585c', 'center');
    // ---- bottom text band
    const ty0 = 1172; c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(24, ty0, W - 48, H - ty0 - 20);
    const col3 = (x, w, head, body, bodyEn) => { txt(c, head, x, ty0 + 30, `bold 15px ${FONT_CN}`, '#2a1a1f'); let y = ty0 + 56; c.font = `14px ${FONT_CN}`; wrap(c, body, w).forEach((s) => { txt(c, s, x, y, `14px ${FONT_CN}`, '#2a1a1f'); y += 21; }); y += 6; c.font = `italic 13px ${FONT_EN}`; wrap(c, bodyEn, w).forEach((s) => { txt(c, s, x, y, `italic 13px ${FONT_EN}`, '#4a3a3e'); y += 18; }); };
    col3(44, 740, '設計概念 CONCEPT', '妹妹的「家紋紅」在他身上被翻成黑與灰燼白：同一件洛家箭袖袍、同一束高馬尾，卻披著燒焦的半披風、戴著白臉鬼面，手提一盞關著魂魄的長明燈。紅只留在劍穗、袖口與面具的血淚——他還是洛家人，只是不敢承認。',
      "His sister's clan crimson inverted into black and ash: the same Luo riding robe and crown ponytail, but a burnt half-cape, the white-face mask and a temple lantern holding a captive soul. Red survives only in the sword tassel, cuffs and the mask's blood tears — still a Luo, unable to admit it.");
    col3(820, 740, '文化依據 CULTURAL BASIS', '服裝取自清代四開衩箭袖袍與馬蹄袖、薄底快靴；面具以台灣廟會八家將／官將首的開臉與歌仔戲臉譜為靈感（白臉＝戲曲中的奸臣），不是日本能面。長明燈呼應普渡與廟宇燈火；麻布孝帶是私人的戴孝。',
      'Costume: Qing four-slit 箭袖 riding robe with 馬蹄袖 horse-hoof cuffs and soft boots. Mask: inspired by Taiwanese temple-troupe face painting (八家將 / 官將首) and 歌仔戲 opera make-up — white face = the stage traitor — deliberately not a Japanese noh mask. The lantern echoes 普渡 temple lights; the hemp strip is private mourning.');
    col3(1596, 760, '3D 建模・卡通渲染 NOTES', '主要形體：高馬尾、半披風、袍襬四開衩、劍與燈——任何角度剪影都能辨識。面具為獨立網格（可拆，劇情揭面）；紅色紋樣、袍上雲紋、披風焦痕全部以貼圖繪製。披風與馬尾、劍穗走物理骨骼。',
      'Primary forms: crown ponytail, half cape, four-slit skirt, sword and lantern — readable from any camera angle. The mask is a separate, detachable mesh (unmasking beat). Red mask paint, robe cloud-brocade and cape scorching are texture paint; cape, ponytail and tassel get physics bones. Toon ramp: 2 bands + rim.');
  };

  // callout scale hook (bigger labels on the turnaround)
  const orig = LQ.callouts;
  LQ.callouts = function (c, list, F, ox, oy, sc, box) { const k = LQ.calloutScale || 1; if (k === 1) return orig(c, list, F, ox, oy, sc, box); c.save(); c.scale(k, k); const L2 = list.map((it) => Object.assign({}, it, { ly: it.ly != null ? it.ly / k : undefined })); const Fk = { anchors: {} }; Object.keys(F.anchors).forEach((n) => { Fk.anchors[n] = F.anchors[n]; }); orig(c, L2, Fk, ox / k, oy / k, sc / k, { x: box.x / k, y: box.y / k, w: box.w / k, h: box.h / k }); c.restore(); };
})();
