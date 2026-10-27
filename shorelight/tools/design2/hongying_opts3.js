/* 洛紅纓 — options 08–10 */
(function () {
  'use strict';
  const { V, sp, tube, P, ell, cel, within, occl, stroke, line, fold, stitch, glow, union } = LQ;
  const { mix, rgba, lighten, darken } = LQ.col;
  const S = LQ.S; const HY = LQ.HONGYING;
  const { crest, knotRow, piping, catCharm, R, symR, fringe, braid, sashEnds, atY } = LQ.HY_util;

  /* =====================================================================================
   * 08 討海人 — Harbour Disguise (and the burnt fish)
   * ===================================================================================== */
  HY.push({
    id: 'opt08', cn: '海口躲藏', en: 'Harbour Disguise', fantasy: 1, tag: 'historical · fishing-port everyday wear', accent: '#2f6aa8',
    bg: ['#e2e8ea', '#b8c6cc', '#ffffff'], rim: '#fff4dc',
    body: { heads: 6.8, sex: 'f', sw: 0.118, ww: 0.074, hw: 0.108, stance: 0.55 },
    palette: [['#2c4a72', '藍衫', 'indigo jacket'], ['#e07a8a', '花頭巾', 'floral kerchief'], ['#3a3436', '烏布裙', 'black apron'], ['#f2ece0', '白褲', 'washed white'], ['#b98a56', '柴屐', 'wooden clogs'], ['#efc6a6', '曬膚', 'sun-kissed skin']],
    callouts: [
      { at: 'scarf', cn: '花頭巾', en: 'floral kerchief over a low bun', side: -1, ly: 120 },
      { at: 'fish', cn: '烤焦的魚', en: 'her cooking (a recurring disaster)', side: -1 },
      { at: 'apron', cn: '烏布圍裙', en: 'black cotton apron', side: 1 },
      { at: 'trou', cn: '捲褲管', en: 'rolled wide trousers', side: 1 },
      { at: 'clog', cn: '柴屐', en: 'wooden clogs', side: -1 },
      { at: 'spear', cn: '裹布藏槍', en: 'spear wrapped as a fishing pole', side: 1, ly: 96 },
    ],
    idea: '躲追兵時混進海口漁村的她：花頭巾、藍衫、圍裙、柴屐，長槍裹布假裝成釣竿——手上那條魚，是她「親手烤」的。最生活、最好笑、最暖的一版。',
    ideaEn: 'Hiding in a fishing village from her pursuers: floral kerchief, indigo jacket, apron and wooden clogs, the spear wrapped up as a fishing pole — and the fish in her hand is one she "cooked" herself. The warmest, funniest everyday take.',
    culture: 'Based on Hoklo coastal women\'s everyday dress — indigo 大襟衫, black cotton apron, wide rolled trousers, 柴屐 wooden clogs and a printed 頭巾 kerchief against the sun; the disguised spear and the comic charcoal fish are story inventions.',
    draw(F, o) {
      const h = F.h, X = F.X;
      const C = { ind: '#2c4a72', scarf: '#e07a8a', apron: '#3a3436', white: '#f2ece0', clog: '#b98a56', skin: '#efc6a6', hair: '#2a1e1e', basket: '#c8a060' };
      const butt = [X(1.25), X(6.75)], tip = [X(-1.75), X(-1.6)];
      const armL = F.ik(-1, [X(-1.25), X(1.9)], 'down');
      const armR = F.ik(1, [X(0.88), X(2.9)], 'out');
      // ---- spear leaning behind her, blade wrapped in cloth, basket hanging from it
      const sp1 = LQ.spear(F, { butt, tip, shaft: '#b88c58', bladeL: 0.8, bladeW: 0.14, metal2: '#6a5a4a' });
      const wrap = tube([V.lerp(tip, butt, -0.02), V.lerp(tip, butt, 0.16)], (t) => X(0.17 - 0.05 * Math.abs(t - 0.5)), { seg: 4, end: 'round', start: 'round' });
      cel(wrap, { fill: '#d8ccb0', k: X(0.1), after: () => { for (let i = 1; i < 6; i++) { const q = V.lerp(tip, butt, i * 0.03); line([[q[0] - X(0.17), q[1] - X(0.05)], [q[0] + X(0.17), q[1] + X(0.08)]], '#9a8a6a', 0.9); } } });
      const red = V.lerp(tip, butt, 0.17); cel(tube([red, V.add(red, [X(-0.06), X(0.25)])], X(0.06), { seg: 2, end: 'point' }), { fill: '#c8202c', k: 1, lw: 0.9 });
      F.mark('spear', ...V.lerp(tip, butt, 0.06));
      const hk = V.lerp(tip, butt, 0.24); line([hk, V.add(hk, [X(-0.1), X(0.35)])], '#5a4a30', 1);
      const bc = V.add(hk, [X(-0.12), X(0.62)]);
      const basket = sp([[bc[0] - X(0.24), bc[1] - X(0.28)], [bc[0] + X(0.24), bc[1] - X(0.28)], [bc[0] + X(0.3), bc[1] + X(0.1)], [bc[0] + X(0.18), bc[1] + X(0.3)], [bc[0] - X(0.18), bc[1] + X(0.3)], [bc[0] - X(0.3), bc[1] + X(0.1)]], true);
      cel(basket, { fill: C.basket, k: X(0.12), tex: LQ.pattern('weave', '#6a4a20', X(0.2), 0.45) });
      // back hair bun under kerchief
      // ---- legs: rolled trousers, bare calves, clogs
      [[-1, X(0.55)], [1, X(0.5)]].forEach(([sx, fx]) => {
        const roll = F.knee + X(0.42);
        LQ.shoe(F, { sx, x: sx * fx, kind: 'clog', skin: C.skin, strap: '#c8304a' });
        const calf = tube([[sx * fx * 0.9, roll - X(0.1)], [sx * fx, F.ankle - X(0.1)]], [X(0.17), X(0.11)], { seg: 3 });
        cel(calf, { fill: C.skin, shade: LQ.shadeOf(C.skin, S.skinTint), k: X(0.08), sd: [X(-0.08), 0], rim: false, line: mix(LQ.col.mul(C.skin, '#80463f'), '#2a1414', 0.35), lw: 1.2 });
        const L = LQ.legShape(F, { sx, top: F.waistY, kneeW: X(0.38), ankleW: X(0.33), ankleY: roll, footX: fx * 0.92, flare: X(0.04), thigh: 0.07 });
        LQ.drawLeg(F, L, { sx, col: C.white });
        const rl = tube([[sx * fx * 0.92 - X(0.36), roll - X(0.02)], [sx * fx * 0.92 + X(0.36), roll - X(0.02)]], X(0.07), { seg: 2, start: 'round', end: 'round' }); cel(rl, { fill: C.white, k: X(0.05), lw: 1.2 });
        if (sx > 0) F.mark('trou', sx * fx + X(0.3), roll - X(0.1)); else F.mark('clog', sx * fx - X(0.15), F.H - X(0.08));
      });
      // ---- jacket + apron
      LQ.neck(F, { skin: C.skin, w: F.nw, bottom: 1.3 });
      const hemY = 3.6;
      const jk = symR(F, [[0, 1.12], [0.25, 1.1], [0.64, 1.25], [0.82, 1.5], [0.76, 2.2], [0.7, 2.7], [0.86, 3.2], [0.9, hemY, 1], [0, hemY + 0.04]]);
      cel(jk, { fill: C.ind, k: X(0.2), grad: [X(1.2), X(hemY)], tex: LQ.pattern('dots', '#ffffff', X(0.3), 0.08) });
      piping(R(F, [[0.02, 1.16], [-0.28, 1.3], [-0.52, 1.6], [-0.66, 2.05], [-0.7, 2.7], [-0.82, 3.2], [-0.86, hemY]]), X(0.05), '#d8e2ee');
      knotRow(R(F, [[-0.08, 1.2, -0.4], [-0.5, 1.58, -0.9], [-0.66, 2.05, -1.4]]), X(0.05), '#e8eef4');
      const apron = sp(R(F, [[-0.66, 2.72], [0.66, 2.72], [0.86, 4.3, 1], [0, 4.38], [-0.86, 4.3, 1]]), true);
      cel(apron, { fill: C.apron, k: X(0.18), hi: true, hiA: 0.2, after: () => { fold(R(F, [[-0.3, 2.9], [-0.38, 3.6], [-0.42, 4.3]]), X(0.05), '#1c1a1c', 0.6); fold(R(F, [[0.35, 2.9], [0.45, 3.6], [0.5, 4.3]]), X(0.05), '#1c1a1c', 0.6); stitch(R(F, [[-0.84, 4.24], [0, 4.3], [0.84, 4.24]]), '#8a8088', 0.7);
        const pk = sp(R(F, [[0.1, 3.3], [0.55, 3.3], [0.55, 3.75], [0.1, 3.75]]), true); stroke(pk, '#6a6068', 1); } });
      const ab = tube(R(F, [[-0.72, 2.72], [0, 2.78], [0.72, 2.72]]), X(0.05), { seg: 4 }); cel(ab, { fill: C.scarf, k: X(0.03), lw: 1.1 });
      sashEnds(F, X(-0.62), X(2.78), -1, C.scarf, 0.7);
      F.mark('apron', X(0.6), X(3.9));
      // ---- arms (rolled sleeves) and the burnt fish
      [[-1, armL], [1, armR]].forEach(([sx, arm]) => {
        LQ.forearm(F, V.lerp(arm.E, arm.W, 0.1), arm.W, C.skin, 0.12, 0.09);
        const sl = LQ.sleeve(F, { sx, arm, wS: X(0.19), wE: X(0.17), wC: X(0.17), cuffT: 0.12 });
        LQ.drawSleeve(F, sl, { sx, col: C.ind, folds: false });
        const roll = tube([sl.cO, sl.cI], X(0.065), { seg: 2, start: 'round', end: 'round' }); cel(roll, { fill: lighten(C.ind, 0.12), k: X(0.05), lw: 1.1 });
      });
      LQ.hand(F, { kind: 'hip', sx: 1, at: armR.W, dir: V.norm(V.sub(armR.W, armR.E)), skin: C.skin });
      // fish on a skewer, charred
      const fAt = [X(-1.25), X(1.62)];
      const stick = tube([[fAt[0] + X(0.08), fAt[1] + X(0.4)], [fAt[0] - X(0.12), fAt[1] - X(1.25)]], X(0.022), { seg: 2 }); cel(stick, { fill: '#c8a070', k: 1, lw: 0.9 });
      const fc0 = [fAt[0] - X(0.1), fAt[1] - X(0.75)];
      const fish = sp([[fc0[0], fc0[1] - X(0.4)], [fc0[0] + X(0.17), fc0[1] - X(0.1)], [fc0[0] + X(0.12), fc0[1] + X(0.25)], [fc0[0] + X(0.2), fc0[1] + X(0.42), 1], [fc0[0], fc0[1] + X(0.32)], [fc0[0] - X(0.2), fc0[1] + X(0.42), 1], [fc0[0] - X(0.12), fc0[1] + X(0.25)], [fc0[0] - X(0.17), fc0[1] - X(0.1)]], true);
      cel(fish, { fill: '#3a2a24', k: X(0.1), hi: true, hiCol: '#8a5a3a', hiA: 0.6, after: () => { for (let i = 0; i < 4; i++) line([[fc0[0] - X(0.12), fc0[1] - X(0.15) + i * X(0.1)], [fc0[0] + X(0.12), fc0[1] - X(0.12) + i * X(0.1)]], '#1a100c', 0.9); S.ctx.fillStyle = '#fff'; S.ctx.fill(ell(fc0[0], fc0[1] - X(0.27), X(0.035), X(0.035))); S.ctx.fillStyle = '#000'; S.ctx.fill(ell(fc0[0], fc0[1] - X(0.27), X(0.015), X(0.015))); } });
      if (!S.sil) for (let i = 0; i < 3; i++) line([[fc0[0] - X(0.15) + i * X(0.15), fc0[1] - X(0.5)], [fc0[0] - X(0.05) + i * X(0.15), fc0[1] - X(0.7)], [fc0[0] - X(0.15) + i * X(0.15), fc0[1] - X(0.9)], [fc0[0] - X(0.05) + i * X(0.15), fc0[1] - X(1.05)]], rgba('#6a6a70', 0.7), 1.2);
      F.mark('fish', fc0[0] - X(0.15), fc0[1]);
      LQ.hand(F, { kind: 'grip', sx: -1, at: fAt, pole: [0.1, 1], toward: F.shoulderJ(-1), skin: C.skin, scale: 0.95 });
      // ---- head: cheerful, freckled
      const fc = {
        skin: C.skin, fw: 0.39, cheekY: 0.64, jaw: 0.78, jawY: 0.86, chinW: 0.12, chinY: 0.98, browCol: '#2a1c1a', shadeK: 0.05,
        eye: { x: 0.19, y: 0.62, w: 0.2, h: 0.11, tilt: 0.02, peak: 0.45, iris: '#7a4626', irisR: 0.41, lash: 0.03, flick: 0.08, flickUp: 0.12, low: 0.62, lowLen: 0.5, lashCol: '#2a1a16' },
        brow: { off: 0.13, angle: -0.02, w: 0.024, arch: 0.03, len: 1.05 },
        nose: { style: 'anime', y: 0.775 }, mouth: { expr: 'grin', w: 0.16, y: 0.87 }, blushA: 0.35, blushCol: '#f07a7a',
        extra: () => { const c = S.ctx; c.fillStyle = rgba('#a0603a', 0.5); [[-0.12, 0.73], [-0.07, 0.75], [0.07, 0.75], [0.12, 0.73], [-0.16, 0.71], [0.16, 0.71]].forEach(([x, y]) => c.fill(ell(X(x), X(y), X(0.007), X(0.007)))); },
      };
      if (!F.back) LQ.face(F, fc, null); else cel(LQ.facePath(F, fc), '#000');
      const fr = fringe(F, [[-0.1, 0.12, 0.3, -0.2, 0.46, -0.03], [0.12, 0.12, 0.28, 0.2, 0.45, 0.03], [-0.36, 0.25, 0.14, -0.4, 0.86, -0.03], [0.36, 0.25, 0.13, 0.4, 0.8, 0.03]]);
      LQ.hairMass(F, fr, { col: C.hair, rim: false, k: X(0.08) });
      // kerchief: covers the crown, knotted at the nape, ends flutter to one side
      const kc = sp(R(F, [[-0.52, 0.62], [-0.55, 0.25], [-0.36, -0.04], [0, -0.12], [0.36, -0.04], [0.55, 0.25], [0.52, 0.62], [0.4, 0.4], [0.2, 0.2], [0, 0.17], [-0.2, 0.2], [-0.4, 0.4]]), true);
      cel(kc, { fill: C.scarf, k: X(0.12), sd: [X(-0.1), X(-0.06)], tex: LQ.pattern('flower', '#fff4f0', X(0.3), 0.55), after: () => { fold(R(F, [[-0.3, 0.05], [-0.42, 0.3], [-0.45, 0.55]]), X(0.03), LQ.deepOf(C.scarf), 0.6); fold(R(F, [[0.25, 0.0], [0.4, 0.25], [0.46, 0.5]]), X(0.03), LQ.deepOf(C.scarf), 0.6); } });
      piping(R(F, [[-0.52, 0.62], [-0.4, 0.4], [-0.2, 0.2], [0, 0.17], [0.2, 0.2], [0.4, 0.4], [0.52, 0.62]]), X(0.03), '#c8505e');
      const e1 = tube(R(F, [[0.5, 0.62], [0.82, 0.78], [1.05, 0.7]]), X(0.08), { seg: 6, end: 'point' }), e2 = tube(R(F, [[0.5, 0.64], [0.75, 0.95], [0.92, 1.05]]), X(0.07), { seg: 6, end: 'point' });
      [e2, e1].forEach((q) => cel(q, { fill: C.scarf, k: X(0.05), tex: LQ.pattern('flower', '#fff4f0', X(0.3), 0.55) }));
      cel(ell(X(0.5), X(0.64), X(0.09), X(0.08)), { fill: C.scarf, k: X(0.05) });
      F.mark('scarf', X(-0.5), X(0.3));
    },
  });

  /* =====================================================================================
   * 09 嘴硬心軟 — Tsundere in Twin Buns (stylised 6-head)
   * ===================================================================================== */
  HY.push({
    id: 'opt09', cn: '嘴硬心軟', en: 'All Bark, Soft Heart', fantasy: 3, tag: 'stylised 6-head · tsundere, cute-lover', accent: '#e05a78',
    bg: ['#f6e6e6', '#e2c4c8', '#ffffff'], rim: '#fff0f4',
    body: { heads: 6.0, sex: 'f', sw: 0.125, ww: 0.078, hw: 0.112, stance: 0.6, crotch: 0.35 },
    palette: [['#d02a3a', '石榴紅', 'pomegranate red'], ['#f6ead6', '奶白', 'cream'], ['#f4a6b4', '桃粉', 'peach pink'], ['#2a1c22', '烏', 'ink'], ['#e8b84a', '金', 'gold'], ['#b02a3a', '石榴眼', 'garnet eyes']],
    callouts: [
      { at: 'buns', cn: '雙丫髻・石虎耳夾', en: 'twin buns, leopard-cat ear clips', side: -1, ly: 112 },
      { at: 'plush', cn: '石虎吊飾', en: 'leopard-cat plush (do not mention it)', side: 1, ly: 112 },
      { at: 'jacket', cn: '雲頭短褂', en: 'cropped jacket, cloud-head corners', side: 1 },
      { at: 'trou', cn: '燈籠褲', en: 'gathered "lantern" trousers', side: -1 },
      { at: 'shoe', cn: '雲頭鞋', en: 'cloud-toe shoes', side: 1 },
    ],
    idea: '把「偷偷喜歡可愛東西」穿在身上卻死不承認：雙丫髻上夾著石虎耳朵、槍上掛著石虎吊飾，嘴巴卻在說「才、才不是因為可愛！」6 頭身 Q 感，最適合宣傳與表情包。',
    ideaEn: 'Her secret love of cute things, worn openly while she flatly denies it: leopard-cat ear clips on twin buns and a leopard-cat plush on the spear — "I-it\'s NOT because it\'s cute!" A 6-head stylised take for key art and sticker sets.',
    culture: 'Draws on Qing girls\' 雙丫髻 twin buns, the short 褂 with 如意 cloud-head corners, gathered trousers and 雲頭鞋 cloud-toe shoes; the leopard-cat motifs reference Taiwan\'s 石虎 (and her companion 糰子). Proportions and accessories are stylised.',
    draw(F, o) {
      const h = F.h, X = F.X;
      const C = { red: '#d02a3a', cream: '#f6ead6', pink: '#f4a6b4', ink: '#2a1c22', gold: '#e8b84a', skin: '#fbe2d2', hair: '#3a2028', cat: '#d9a066' };
      const tip = [X(2.0), X(1.05)], butt = [X(-2.05), X(1.38)];
      const armL = F.ik(-1, [X(-1.0), X(1.45)], 'down'), armR = F.ik(1, [X(1.0), X(1.3)], 'down');
      // back bow of the sash (behind)
      [-1, 1].forEach((sx) => { const lp = sp(R(F, [[sx * 0.2, 2.6], [sx * 1.0, 2.25], [sx * 1.15, 2.7], [sx * 0.95, 3.05], [sx * 0.25, 2.85]]), true); cel(lp, { fill: C.pink, k: X(0.12) }); const tl = tube(R(F, [[sx * 0.3, 2.8], [sx * 0.75, 3.4], [sx * 0.8, 4.0]]), X(0.09), { seg: 6 }); cel(tl, { fill: C.pink, k: X(0.06) }); });
      const backHair = sp(R(F, [[-0.46, 0.5], [-0.45, 0.15], [0, -0.04], [0.45, 0.15], [0.46, 0.5], [0.3, 0.95], [-0.3, 0.95]]), true); LQ.hairMass(F, [backHair], { col: C.hair, rim: false });
      // ---- legs
      [[-1, X(0.62)], [1, X(0.52)]].forEach(([sx, fx]) => {
        const L = LQ.legShape(F, { sx, top: F.waistY, kneeW: X(0.36), ankleW: X(0.3), ankleY: F.ankle - X(0.12), footX: fx, flare: X(0.06), thigh: 0.08 });
        LQ.shoe(F, { sx, x: sx * fx, kind: 'cloth', col: C.ink, toeOut: 0.05, footW: 0.16, toeUp: 0.05 });
        const sh = LQ.shoe; // cloud-head toe cap
        cel(sp([[sx * fx - X(0.12) + sx * X(0.06), F.H - X(0.09)], [sx * fx + sx * X(0.06), F.H - X(0.2)], [sx * fx + X(0.12) + sx * X(0.06), F.H - X(0.09)], [sx * fx + sx * X(0.06), F.H - X(0.05)]], true), { fill: C.pink, k: 2, lw: 1 });
        LQ.drawLeg(F, L, { sx, col: C.cream, bunch: true });
        const cf = tube([[sx * fx - X(0.24), F.ankle - X(0.1)], [sx * fx + X(0.24), F.ankle - X(0.1)]], X(0.06), { seg: 2, start: 'round', end: 'round' }); cel(cf, { fill: C.red, k: X(0.04), lw: 1.1 });
        if (sx < 0) F.mark('trou', sx * fx - X(0.25), F.knee); else F.mark('shoe', sx * fx + X(0.12), F.H - X(0.1));
      });
      // ---- inner top + cropped jacket
      LQ.neck(F, { skin: C.skin, w: F.nw, bottom: 1.3 });
      const inner = symR(F, [[0, 1.12], [0.25, 1.1], [0.6, 1.25], [0.72, 1.5], [0.66, 2.2], [0.6, 2.55], [0.66, 2.95, 1], [0, 3.0]]); cel(inner, { fill: C.cream, k: X(0.12) });
      const belt = sp(R(F, [[-0.7, 2.62], [0, 2.67], [0.7, 2.62], [0.72, 2.92], [0, 2.97], [-0.72, 2.92]]), true); cel(belt, { fill: C.pink, k: X(0.06) });
      const jk = (sx) => sp(R(F, sx > 0 ? [[0.08, 1.15], [0.25, 1.1], [0.64, 1.24], [0.8, 1.5], [0.72, 2.0], [0.66, 2.3], [0.62, 2.45, 1], [0.44, 2.52], [0.3, 2.35], [0.14, 2.42, 1], [0.12, 1.7]] : [[-0.08, 1.15], [-0.25, 1.1], [-0.64, 1.24], [-0.8, 1.5], [-0.72, 2.0], [-0.66, 2.3], [-0.62, 2.45, 1], [-0.44, 2.52], [-0.3, 2.35], [-0.14, 2.42, 1], [-0.12, 1.7]]), true);
      [-1, 1].forEach((sx) => { const q = jk(sx); cel(q, { fill: C.red, k: X(0.16), grad: [X(1.1), X(2.5)] }); piping(R(F, [[sx * 0.1, 1.15], [sx * 0.12, 1.7], [sx * 0.14, 2.42], [sx * 0.3, 2.35], [sx * 0.44, 2.52], [sx * 0.62, 2.45]]), X(0.05), C.pink); });
      knotRow(R(F, [[0, 1.4], [0, 1.75], [0, 2.1]]), X(0.055), C.gold);
      F.mark('jacket', X(0.55), X(2.35));
      // collar
      [-1, 1].forEach((sx) => cel(sp(R(F, [[sx * 0.2, 1.0, 1], [sx * 0.02, 1.03, 1], [sx * 0.06, 1.18, 1], [sx * 0.26, 1.15, 1]]), true), { fill: C.cream, k: X(0.04) }));
      // ---- spear across her shoulders (behind the neck)
      LQ.spear(F, { butt, tip, shaft: '#d0a060', bladeL: 0.75, bladeW: 0.15, tassel: { col: C.red, len: 0.75, w: 0.2, sway: 0.0 }, collar: C.gold, wrap: [[0.45, 0.55, C.pink]] });
      // plush charm hanging from the shaft
      const ph = atY(butt, tip, 0) ? V.lerp(butt, tip, 0.15) : null; line([ph, V.add(ph, [0, X(0.4)])], C.red, 1.1);
      const pc = V.add(ph, [0, X(0.62)]);
      const pb = union(ell(pc[0], pc[1], X(0.24), X(0.21)), sp([[pc[0] - X(0.22), pc[1] - X(0.05)], [pc[0] - X(0.2), pc[1] - X(0.3), 1], [pc[0] - X(0.05), pc[1] - X(0.17)]], true), sp([[pc[0] + X(0.22), pc[1] - X(0.05)], [pc[0] + X(0.2), pc[1] - X(0.3), 1], [pc[0] + X(0.05), pc[1] - X(0.17)]], true));
      cel(pb, { fill: C.cat, k: X(0.1), lw: 1.2, after: (c) => { c.fillStyle = '#fff6e8'; c.fill(ell(pc[0], pc[1] + X(0.08), X(0.13), X(0.08))); c.fillStyle = '#2a1a14'; c.fill(ell(pc[0] - X(0.09), pc[1] - X(0.01), X(0.025), X(0.03))); c.fill(ell(pc[0] + X(0.09), pc[1] - X(0.01), X(0.025), X(0.03))); c.fillStyle = '#8a4a30'; for (let i = -1; i <= 1; i++) c.fill(ell(pc[0] + X(i * 0.06), pc[1] - X(0.15), X(0.012), X(0.035))); c.fillStyle = '#f08a90'; c.fill(ell(pc[0], pc[1] + X(0.05), X(0.02), X(0.015))); } });
      F.mark('plush', pc[0] + X(0.2), pc[1] - X(0.1));
      // ---- arms draped over the shaft
      [[-1, armL], [1, armR]].forEach(([sx, arm]) => { const sl = LQ.sleeve(F, { sx, arm, wS: X(0.18), wE: X(0.16), wC: X(0.18), cuffT: 0.85 }); LQ.drawSleeve(F, sl, { sx, col: C.red, cuffBand: { w: X(0.08), col: C.pink } }); });
      LQ.hand(F, { kind: 'relaxed', sx: -1, at: armL.W, dir: [0.15, 1], skin: C.skin, scale: 0.95 });
      LQ.hand(F, { kind: 'relaxed', sx: 1, at: armR.W, dir: [-0.15, 1], skin: C.skin, scale: 0.95 });
      // ---- head: big eyes, pout, blush hatching
      const fc = {
        skin: C.skin, fw: 0.4, cheekY: 0.66, jaw: 0.74, jawY: 0.86, chinW: 0.11, chinY: 0.98, browCol: '#3a1c22', shadeK: 0.04,
        eye: { x: 0.195, y: 0.63, w: 0.24, h: 0.14, tilt: 0.06, peak: 0.42, iris: '#b02a3a', irisR: 0.42, irisV: 1.18, lash: 0.04, flick: 0.12, flickUp: 0.3, lashes: 3, low: 0.6, lowLen: 0.55, lashCol: '#2a1018', lid: 0.12 },
        brow: { off: 0.15, angle: -0.03, w: 0.022, innerDrop: 0.035, arch: 0.0, len: 0.95 },
        nose: { style: 'anime', y: 0.79, size: 0.8 }, mouth: { expr: 'pout', w: 0.09, y: 0.885, fang: -1 }, blushA: 0.55, blushX: 0.25, blushY: 0.74,
      };
      if (!F.back) LQ.face(F, fc, { blush: 0.55, hatch: true }); else cel(LQ.facePath(F, fc), '#000');
      const cap = sp(R(F, [[-0.45, 0.55], [-0.48, 0.25], [-0.32, 0.0], [0, -0.06], [0.32, 0.0], [0.48, 0.25], [0.45, 0.55], [0.38, 0.38], [0.2, 0.2], [0, 0.17], [-0.2, 0.2], [-0.38, 0.38]]), true);
      const fr = fringe(F, [[0.0, 0.06, 0.24, 0.0, 0.5, 0.0], [-0.17, 0.08, 0.26, -0.18, 0.5, -0.02], [0.18, 0.08, 0.26, 0.19, 0.5, 0.02], [-0.33, 0.14, 0.2, -0.37, 0.58, -0.02], [0.33, 0.14, 0.2, 0.37, 0.58, 0.02], [-0.4, 0.3, 0.14, -0.46, 1.08, -0.06], [0.4, 0.3, 0.14, 0.46, 1.08, 0.06]]);
      LQ.hairMass(F, [cap, ...fr], { col: C.hair, rim: false, ring: [0, X(0.48), X(0.4), Math.PI * 1.2, Math.PI * 1.8], ringN: 3, ringW: 0.03, k: X(0.09), sd: [X(-0.07), X(-0.08)] });
      // twin buns with ribbons and leopard-cat ear clips
      [-1, 1].forEach((sx) => {
        const bc = [sx * X(0.4), X(0.02)];
        const tl = tube([[sx * X(0.5), X(0.08)], [sx * X(0.85), X(0.4)], [sx * X(0.8), X(0.95)]], (t) => X(0.06 - t * 0.02), { seg: 6, end: 'point' }); cel(tl, { fill: C.red, k: X(0.04), lw: 1 });
        const b = ell(bc[0], bc[1], X(0.22), X(0.2)); LQ.hairMass(F, [b], { col: C.hair, rim: false, ring: [bc[0], bc[1] + X(0.08), X(0.15), Math.PI * 1.2, Math.PI * 1.8], ringN: 2, ringW: 0.022 });
        const rb = tube([[bc[0] - X(0.2), bc[1] + X(0.13)], [bc[0], bc[1] + X(0.19)], [bc[0] + X(0.2), bc[1] + X(0.13)]], X(0.04), { seg: 4 }); cel(rb, { fill: C.red, k: 2, lw: 1 });
        const ear = sp([[bc[0] - X(0.09), bc[1] - X(0.14)], [bc[0] + sx * X(0.02), bc[1] - X(0.38), 1], [bc[0] + X(0.11), bc[1] - X(0.12)]], true); cel(ear, { fill: C.cat, k: X(0.04), lw: 1, after: (c) => { c.fillStyle = '#f2b0a0'; c.fill(sp([[bc[0] - X(0.04), bc[1] - X(0.15)], [bc[0] + sx * X(0.015), bc[1] - X(0.3)], [bc[0] + X(0.06), bc[1] - X(0.14)]], true)); } });
      });
      F.mark('buns', X(-0.5), X(-0.05));
    },
  });

  /* =====================================================================================
   * 10 洛家家主 — Head of House Luo (epilogue)
   * ===================================================================================== */
  HY.push({
    id: 'opt10', cn: '洛家家主', en: 'Head of House Luo', fantasy: 3, tag: 'epilogue · matured, rebuilt clan', accent: '#b8975a',
    bg: ['#e6e1d8', '#b4aca2', '#fffaf0'], rim: '#ffe8c0',
    body: { heads: 7.6, sex: 'f', sw: 0.118, ww: 0.07, stance: 0.4 },
    palette: [['#1d1a1f', '玄色雲錦', 'black cloud brocade'], ['#a8202c', '洛家朱', 'clan crimson'], ['#e8e6e2', '銀白', 'silver-white'], ['#b8975a', '舊金', 'old gold'], ['#7a8696', '槍頭銀', 'spear silver'], ['#efcfba', '膚', 'skin']],
    callouts: [
      { at: 'pin', cn: '槍形銀簪・高髻', en: 'high chignon, spear-shaped pin', side: -1, ly: 108 },
      { at: 'coat', cn: '對襟長褂', en: 'floor-length open coat, crimson lining', side: 1 },
      { at: 'mask', cn: '兄長的半張鬼面', en: "half of her brother's ghost mask", side: -1 },
      { at: 'crest', cn: '洛家槍徽', en: 'clan crest buckle', side: 1 },
      { at: 'boot', cn: '粉底靴', en: 'white-soled formal boots', side: -1 },
    ],
    idea: '結局後重建鹿港洛家的她：高髻、對襟長褂、腰間掛著哥哥碎裂的半張鬼面。最成熟、最沉穩的一版——驕傲終於長成了擔當。',
    ideaEn: 'After the ending, rebuilding House Luo in Lukang: high chignon, floor-length open coat, and half of her brother\'s shattered ghost mask at her hip. The most mature, composed take — pride finally grown into responsibility.',
    culture: 'Based on late-Qing formal wear for wealthy Taiwanese households — 對襟長褂 over a 大襟 robe, 粉底靴 white-soled boots and a high 髻 with a single pin; a woman as clan head and the spear-shaped hairpin are the story\'s departure.',
    draw(F, o) {
      const h = F.h, X = F.X;
      const C = { black: '#1d1a1f', red: '#a8202c', white: '#e8e6e2', gold: '#b8975a', silver: '#7a8696', skin: '#efcfba', hair: '#18151c' };
      const sx0 = X(1.32); const butt = [sx0, F.H - 2], tip = [sx0, X(-2.0)];
      const gAt = [sx0, X(1.65)];
      const armR = F.ik(1, LQ.gripW(F, gAt, [0, 1], F.shoulderJ(1)), 'down');
      const armL = F.ik(-1, [X(-0.92), X(3.55)], 'out');
      // ---- long hair down the back (half-up)
      const bh = LQ.hairTail(R(F, [[0, 0.4], [-0.05, 1.3], [0.05, 2.4], [0.0, 3.3]]), (t) => X(0.5 - t * 0.25), { n: 4, spread: 0.35 });
      LQ.hairMass(F, bh, { col: C.hair, k: X(0.12), rim: false });
      // ---- coat back (to the floor)
      const cb = sp(R(F, [[-0.66, 1.25], [0.66, 1.25], [0.95, 2.0], [1.2, 4.2], [1.42, 7.3, 1], [0, 7.4], [-1.42, 7.3, 1], [-1.2, 4.2], [-0.95, 2.0]]), true);
      cel(cb, { fill: LQ.col.darken(C.red, 0.2), k: X(0.1), sh: 0 });
      // ---- legs (mostly hidden): robe to the ankle + white-soled boots
      [[-1, X(0.38)], [1, X(0.42)]].forEach(([sx, fx]) => { LQ.boot(F, { sx, x: sx * fx, y: F.ankle, topY: F.ankle - X(0.35), col: C.black, sole: '#f2efe8', shaftW: X(0.17), soleT: X(0.1), toeOut: X(0.06) }); if (sx < 0) F.mark('boot', sx * fx - X(0.12), F.H - X(0.08)); });
      // ---- inner white robe
      LQ.neck(F, { skin: C.skin, w: F.nw, bottom: 1.3 });
      const robe = symR(F, [[0, 1.12], [0.25, 1.1], [0.62, 1.25], [0.78, 1.5], [0.7, 2.2], [0.62, 2.7], [0.76, 3.6], [0.86, 7.05, 1], [0, 7.1]]);
      cel(robe, { fill: C.white, k: X(0.18), grad: [X(1.2), X(7)], after: () => { fold(R(F, [[0.15, 4.0], [0.2, 5.5], [0.18, 7.0]]), X(0.05), LQ.shadeOf(C.white), 0.6); fold(R(F, [[-0.2, 4.2], [-0.25, 5.6], [-0.22, 7.0]]), X(0.05), LQ.shadeOf(C.white), 0.6); } });
      LQ.border(R(F, [[0.02, 1.17], [-0.26, 1.3], [-0.48, 1.58], [-0.6, 2.0], [-0.62, 2.7]]), X(0.1), C.red, C.gold, 'cloud', { step: X(0.13) });
      LQ.border(R(F, [[-0.85, 7.0], [0, 7.06], [0.85, 7.0]]), X(0.12), C.red, C.gold, 'cloud', { step: X(0.13) });
      const col = sp(R(F, [[-0.23, 0.98], [0.23, 0.98], [0.27, 1.17], [0, 1.2], [-0.27, 1.17]]), true); cel(col, { fill: C.white, k: X(0.04) }); piping(R(F, [[-0.23, 0.99], [0, 0.97], [0.23, 0.99]]), X(0.035), C.red);
      // belt with crest; brother's half-mask hanging from it
      const belt = sp(R(F, [[-0.66, 2.66], [0, 2.71], [0.66, 2.66], [0.68, 2.92], [0, 2.97], [-0.68, 2.92]]), true); cel(belt, { fill: C.red, k: X(0.06), tex: LQ.pattern('cloud', '#f0c050', X(0.25), 0.3) });
      crest(0, X(2.82), X(0.16), C.gold, C.black); F.mark('crest', X(0.12), X(2.82));
      line(R(F, [[-0.42, 2.92], [-0.45, 3.25]]), C.gold, 1.1);
      const mk = sp(R(F, [[-0.45, 3.25], [-0.2, 3.3], [-0.12, 3.6], [-0.2, 3.95], [-0.35, 4.1], [-0.42, 3.85], [-0.36, 3.7], [-0.47, 3.55], [-0.44, 3.4]]), true);
      cel(mk, { fill: '#f2efe8', shade: '#c8c4d0', k: X(0.08), hi: true, hiA: 0.5, after: (c) => { c.fillStyle = '#121014'; c.fill(ell(X(-0.25), X(3.5), X(0.07), X(0.045), -0.2)); stroke(sp(R(F, [[-0.18, 3.36], [-0.28, 3.42], [-0.38, 3.4]]), false), '#b8202a', 2.2); stroke(sp(R(F, [[-0.17, 3.62], [-0.23, 3.8], [-0.32, 3.92]]), false), '#b8202a', 1.6); line(R(F, [[-0.45, 3.4], [-0.36, 3.7], [-0.42, 3.85]]), '#6a6670', 1.0); } });
      F.mark('mask', X(-0.38), X(3.7));
      // ---- open long coat (front panels)
      const panel = (sx) => sp(R(F, sx < 0 ? [[-0.24, 1.08], [-0.62, 1.24], [-0.86, 1.52], [-0.82, 2.3], [-0.96, 4.0], [-1.25, 7.2, 1], [-0.62, 7.25, 1], [-0.42, 4.0], [-0.36, 2.0], [-0.22, 1.3]] : [[0.24, 1.08], [0.62, 1.24], [0.86, 1.52], [0.82, 2.3], [0.96, 4.0], [1.25, 7.2, 1], [0.62, 7.25, 1], [0.42, 4.0], [0.36, 2.0], [0.22, 1.3]]), true);
      [-1, 1].forEach((sx) => {
        const q = panel(sx);
        cel(q, { fill: C.black, k: X(0.25), sd: [X(-0.22), X(-0.05)], grad: [X(1.2), X(7.2)], gradA: 0.12, tex: LQ.pattern('cloud', '#6a6070', X(0.5), 0.28), after: () => { fold(R(F, [[sx * 0.6, 2.6], [sx * 0.8, 4.6], [sx * 0.95, 7.1]]), X(0.08), '#0a080c', 0.7); fold(R(F, [[sx * 0.85, 3.5], [sx * 1.0, 5.2], [sx * 1.12, 7.1]]), X(0.06), '#0a080c', 0.6); } });
        LQ.border(R(F, [[sx * 0.22, 1.3], [sx * 0.36, 2.0], [sx * 0.42, 4.0], [sx * 0.62, 7.22]]), X(0.12), C.red, C.gold, 'hui', { step: X(0.14) });
      });
      F.mark('coat', X(1.0), X(5.5));
      // ---- spear planted at her left
      LQ.spear(F, { butt, tip, shaft: '#4a3a3a', bladeL: 0.95, bladeW: 0.15, blade: 'long', tassel: { col: C.red, len: 1.05, w: 0.22, sway: 0.08 }, collar: C.gold, steel: '#d4d8de', metal2: C.silver, wrap: [[0.62, 0.7, C.red]] });
      // ---- arms: wide coat sleeves with crimson turned-back cuffs
      [[-1, armL], [1, armR]].forEach(([sx, arm]) => {
        const sl = LQ.sleeve(F, { sx, arm, wS: X(0.2), wE: X(0.21), wC: X(0.25), cuffT: 0.9, hang: X(0.12) });
        LQ.drawSleeve(F, sl, { sx, col: C.black, tex: LQ.pattern('cloud', '#6a6070', X(0.5), 0.28) });
        LQ.border([sl.cO, sl.cI].map((q) => V.add(q, V.mul(sl.dF, -X(0.07)))), X(0.15), C.red, C.gold, 'hui', { step: X(0.14) });
      });
      LQ.hand(F, { kind: 'grip', sx: 1, at: gAt, pole: [0, 1], toward: F.shoulderJ(1), skin: C.skin });
      LQ.hand(F, { kind: 'relaxed', sx: -1, at: armL.W, dir: V.norm(V.sub(armL.W, armL.E)), skin: C.skin });
      // ---- head: mature, composed
      const fc = {
        skin: C.skin, fw: 0.365, cheekY: 0.6, jaw: 0.68, jawY: 0.86, chinW: 0.08, chinY: 1.0, chinSharp: true, browCol: '#1e1418', shadeK: 0.06,
        eye: { x: 0.18, y: 0.6, w: 0.19, h: 0.07, tilt: 0.13, peak: 0.3, iris: '#8a4a20', irisR: 0.36, lash: 0.034, flick: 0.16, flickUp: 0.3, lid: 0.32, low: 0.45, lowLen: 0.55, lashCol: '#1a1014' },
        brow: { off: 0.11, angle: 0.05, w: 0.02, arch: 0.015, len: 1.15 },
        nose: { style: 'bridge', y: 0.775, size: 0.85 }, mouth: { expr: 'soft', w: 0.1, y: 0.88, lip: '#b8404a', lipA: 0.8, upper: true },
        extra: () => { line(R(F, [[-0.12, 0.45], [-0.17, 0.53]]), '#c89a8a', 1.0); },
      };
      if (!F.back) LQ.face(F, fc, null); else cel(LQ.facePath(F, fc), '#000');
      const cap = sp(R(F, [[-0.42, 0.62], [-0.46, 0.28], [-0.32, 0.0], [0, -0.06], [0.32, 0.0], [0.46, 0.28], [0.42, 0.62], [0.36, 0.48], [0.24, 0.28], [0.06, 0.2], [-0.2, 0.24], [-0.34, 0.44]]), true);
      const fr = fringe(F, [[0.08, 0.06, 0.34, 0.42, 0.62, 0.08], [-0.05, 0.06, 0.32, -0.42, 0.6, -0.06], [-0.36, 0.3, 0.12, -0.4, 1.15, -0.06], [0.37, 0.4, 0.08, 0.4, 0.98, 0.04]]);
      LQ.hairMass(F, [cap, ...fr], { col: C.hair, rim: false, ring: [0, X(0.5), X(0.41), Math.PI * 1.2, Math.PI * 1.8], ringN: 3, ringW: 0.025, k: X(0.09), sd: [X(-0.07), X(-0.08)] });
      // high chignon with spear-shaped pin
      const bun = union(ell(0, X(-0.22), X(0.26), X(0.2)), ell(X(0.02), X(-0.42), X(0.16), X(0.13)));
      LQ.hairMass(F, [bun], { col: C.hair, rim: false, ring: [0, X(-0.2), X(0.2), Math.PI * 1.2, Math.PI * 1.8], ringN: 2, ringW: 0.022 });
      const pin = tube(R(F, [[0.55, -0.55], [-0.5, -0.1]]), X(0.022), { seg: 2 }); cel(pin, { fill: '#d4d8de', k: 1, hi: true, lw: 0.9 });
      const ph = sp(R(F, [[0.55, -0.55], [0.62, -0.5], [0.85, -0.68, 1], [0.6, -0.62]]), true); cel(ph, { fill: '#e8ecf0', shade: '#8a94a0', k: 2, hi: true, lw: 1 });
      const pt = tube(R(F, [[0.52, -0.52], [0.56, -0.3], [0.5, -0.1]]), X(0.03), { seg: 4, end: 'point' }); cel(pt, { fill: C.red, k: 1, lw: 0.8 });
      F.mark('pin', X(-0.2), X(-0.35));
    },
  });
})();
