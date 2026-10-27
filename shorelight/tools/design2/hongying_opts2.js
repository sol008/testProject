/* 洛紅纓 — options 04–07 */
(function () {
  'use strict';
  const { V, sp, tube, P, ell, cel, within, occl, stroke, line, fold, stitch, glow, union } = LQ;
  const { mix, rgba, lighten, darken } = LQ.col;
  const S = LQ.S; const HY = LQ.HONGYING;
  const { crest, knotRow, piping, catCharm, R, symR, fringe, braid, sashEnds, atY } = LQ.HY_util;

  /* =====================================================================================
   * 04 縞素 — The Mourning Vow
   * ===================================================================================== */
  HY.push({
    id: 'opt04', cn: '縞素誓', en: 'The Mourning Vow', fantasy: 2, tag: 'historical-leaning · grief as armour', accent: '#c41e2a',
    bg: ['#e4e2dc', '#b9b6ae', '#ffffff'], rim: '#dfe8ff', ink: '#1c1a1e',
    body: { heads: 7.2, sex: 'f', sw: 0.114, ww: 0.07, stance: 0.55 },
    palette: [['#e4dccb', '生麻', 'unbleached hemp'], ['#b9a27a', '麻繩', 'hemp rope'], ['#f4f1ea', '孝巾白', 'mourning white'], ['#3a3438', '鐵灰', 'iron grey'], ['#c41e2a', '槍纓紅', 'tassel red (only colour)'], ['#f0dccd', '膚', 'pale skin']],
    callouts: [
      { at: 'band', cn: '孝巾', en: 'mourning headcloth, long tails', side: 1, ly: 110 },
      { at: 'hair', cn: '斷髮', en: 'hair cut with her own blade', side: -1, ly: 150 },
      { at: 'jacket', cn: '不緝邊麻衫', en: 'raw-edged hemp jacket', side: 1 },
      { at: 'rope', cn: '麻絰腰繩', en: 'hemp-rope mourning belt', side: -1 },
      { at: 'shoe', cn: '白布鞋', en: 'white-covered shoes', side: 1 },
    ],
    idea: '三年孝期未滿，她不肯脫下麻衣：全身只剩槍纓一點紅。最冷、最安靜、最危險的一版——驕傲被悲傷磨成刀刃。',
    ideaEn: 'Her three years of mourning are not over and she will not take the hemp off: the spear tassel is the only colour left on her. The quietest, coldest, most dangerous take — pride ground down into an edge.',
    culture: 'Based on Han 披麻戴孝 mourning dress — unbleached hemp with deliberately unhemmed edges, the 麻絰 rope belt, white 孝巾 headcloth and white-covered shoes; wearing it into battle as a vow is the fantasy departure.',
    draw(F, o) {
      const h = F.h, X = F.X;
      const C = { hemp: '#e4dccb', rope: '#b9a27a', white: '#f4f1ea', grey: '#3a3438', red: '#c41e2a', skin: '#f0dccd', hair: '#1e1b22', trou: '#d7d0c2' };
      const tip = [X(-2.1), X(6.15)], butt = [X(1.65), X(-1.05)]; const pole = V.norm(V.sub(tip, butt));
      const gAt = atY(tip, butt, X(3.6));
      const armL = F.ik(-1, LQ.gripW(F, gAt, pole, F.shoulderJ(-1)), 'out');
      const armR = F.ik(1, [X(0.92), X(3.65)], 'out');
      // ---- headcloth tails (behind), back hair
      const t1 = tube(R(F, [[0.36, 0.3], [0.8, 0.45], [1.25, 0.95], [1.4, 1.6], [1.75, 2.1]]), (t) => X(0.07 - t * 0.015), { seg: 10 });
      const t2 = tube(R(F, [[0.34, 0.34], [0.7, 0.6], [0.95, 1.2], [0.95, 1.85]]), (t) => X(0.065 - t * 0.015), { seg: 10 });
      cel(t2, { fill: LQ.shadeOf(C.white), k: 2, lw: 1.1 }); cel(t1, { fill: C.white, k: X(0.05), lw: 1.1 });
      // spear trails behind her
      LQ.spear(F, { butt, tip, shaft: '#9a8a74', bladeL: 0.85, bladeW: 0.14, tassel: { col: C.red, len: 0.95, w: 0.22, sway: -0.12 }, metal2: '#5a5658' });
      const backHair = sp(R(F, [[-0.48, 0.5], [-0.46, 0.15], [0, -0.05], [0.46, 0.15], [0.5, 0.5], [0.48, 0.92], [0.3, 1.0], [-0.3, 1.0], [-0.5, 0.9]]), true);
      LQ.hairMass(F, [backHair], { col: C.hair, k: X(0.1), rim: false });
      // ---- legs
      [[-1, X(0.5)], [1, X(0.5)]].forEach(([sx, fx]) => {
        const L = LQ.legShape(F, { sx, top: F.waistY, kneeW: X(0.3), ankleW: X(0.22), ankleY: F.ankle - X(0.04), footX: fx, flare: X(0.0) });
        LQ.drawLeg(F, L, { sx, col: C.trou, bunch: true });
        LQ.shoe(F, { sx, x: sx * fx, kind: 'cloth', col: C.white, toeOut: 0.08 });
        if (sx > 0) F.mark('shoe', sx * fx + X(0.12), F.H - X(0.15));
      });
      // ---- knee-length raw-edged hemp jacket
      const hemY = 4.75;
      const jagged = (pts) => { const out = []; for (let i = 0; i < pts.length - 1; i++) { out.push(pts[i]); const m = V.lerp(pts[i], pts[i + 1], 0.5); out.push([m[0], m[1] + (i % 2 ? 0.05 : -0.02)]); } out.push(pts[pts.length - 1]); return out; };
      const back = symR(F, [[0, 1.12], [0.25, 1.1], [0.62, 1.25], [0.8, 1.5], [0.72, 2.2], [0.68, 2.7], [0.92, 3.6], [1.06, hemY, 1], [0.5, hemY + 0.06], [0, hemY + 0.08]]);
      cel(back, { fill: LQ.deepOf(C.hemp), k: X(0.1) });
      LQ.neck(F, { skin: C.skin, w: F.nw, bottom: 1.3 });
      const half = [[0, 1.12], [0.25, 1.1], [0.62, 1.25], [0.8, 1.5], [0.72, 2.2], [0.66, 2.7], [0.86, 3.6], [0.96, hemY - 0.05, 1]];
      const hem = jagged([[0.96, hemY - 0.05], [0.7, hemY + 0.02], [0.4, hemY + 0.05], [0, hemY + 0.06], [-0.4, hemY + 0.05], [-0.7, hemY + 0.02], [-0.96, hemY - 0.05]]).map((q) => [q[0], q[1], 1]);
      const jk = sp(R(F, half.concat(hem.slice(1, -1)).concat(LQ.mirrorPts(half).reverse())), true);
      cel(jk, { fill: C.hemp, k: X(0.2), grad: [X(1.2), X(hemY)], tex: LQ.pattern('weave', '#8a7a5a', X(0.18), 0.22), after: () => {
        fold(R(F, [[0.25, 3.1], [0.35, 3.9], [0.32, 4.7]]), X(0.06), LQ.deepOf(C.hemp), 0.5); fold(R(F, [[-0.3, 3.1], [-0.45, 3.9], [-0.42, 4.7]]), X(0.06), LQ.deepOf(C.hemp), 0.5); fold(R(F, [[0.62, 3.2], [0.72, 4.0], [0.78, 4.7]]), X(0.05), LQ.deepOf(C.hemp), 0.45);
        // frayed threads at the raw hem
        for (let i = 0; i < 22; i++) { const x = -0.92 + i * 0.087; line(R(F, [[x, hemY + 0.03 - Math.abs(x) * 0.08], [x + 0.01, hemY + 0.1 - Math.abs(x) * 0.08]]), rgba('#9a8a6a', 0.8), 0.7); }
      } });
      F.mark('jacket', X(0.55), X(4.1));
      // the opening: plain (no piping) with cloth ties instead of knot buttons
      const dj = R(F, [[0.02, 1.17], [-0.26, 1.3], [-0.5, 1.58], [-0.64, 2.0], [-0.66, 2.7], [-0.8, 3.6], [-0.9, hemY - 0.05]]);
      stroke(sp(dj, false), LQ.lineOf(C.hemp), 1.6); stroke(sp(dj.map((q) => [q[0] + X(0.05), q[1] + X(0.01)]), false), rgba('#8a7a5a', 0.6), 0.8, [2, 2]);
      [[-0.48, 1.56], [-0.66, 2.3]].forEach(([x, y]) => { line(R(F, [[x, y], [x - 0.12, y + 0.22]]), '#a8977a', 1.3); line(R(F, [[x, y], [x - 0.02, y + 0.25]]), '#a8977a', 1.3); });
      const col = sp(R(F, [[-0.24, 1.02], [0.24, 1.02], [0.28, 1.17], [0, 1.2], [-0.28, 1.17]]), true); cel(col, { fill: C.hemp, k: X(0.04) });
      // ---- hemp-rope belt with knot and hanging ends
      const rope = tube(R(F, [[-0.72, 2.78], [0, 2.86], [0.72, 2.78]]), X(0.06), { seg: 6 });
      cel(rope, { fill: C.rope, k: X(0.04), after: () => { for (let i = 0; i < 18; i++) { const x = -0.7 + i * 0.08; line(R(F, [[x, 2.74 + Math.abs(x) * -0.02 + 0.06], [x + 0.05, 2.86 - Math.abs(x) * 0.1 + 0.04]]), '#7a6644', 0.8); } } });
      const re1 = tube(R(F, [[-0.35, 2.85], [-0.42, 3.3], [-0.36, 3.8]]), X(0.045), { seg: 5, end: 'round' }), re2 = tube(R(F, [[-0.3, 2.86], [-0.24, 3.25], [-0.28, 3.6]]), X(0.04), { seg: 5, end: 'round' });
      [re2, re1].forEach((q) => cel(q, { fill: C.rope, k: X(0.03), lw: 1.1 }));
      cel(ell(X(-0.32), X(2.86), X(0.1), X(0.08)), { fill: C.rope, k: X(0.05), lw: 1.1 });
      F.mark('rope', X(-0.4), X(3.4));
      // ---- arms
      [[-1, armL], [1, armR]].forEach(([sx, arm]) => {
        const sl = LQ.sleeve(F, { sx, arm, wS: X(0.18), wE: X(0.16), wC: X(0.15), cuffT: 0.9 });
        LQ.drawSleeve(F, sl, { sx, col: C.hemp, nf: 2 });
        for (let i = 0; i < 6; i++) { const q = V.lerp(sl.cO, sl.cI, i / 5); line([q, V.add(q, V.mul(sl.dF, X(0.06)))], rgba('#9a8a6a', 0.9), 0.7); }
      });
      LQ.hand(F, { kind: 'grip', sx: -1, at: gAt, pole, toward: F.shoulderJ(-1), skin: C.skin });
      LQ.hand(F, { kind: 'fist', sx: 1, at: armR.W, dir: V.norm(V.sub(armR.W, armR.E)), skin: C.skin });
      { const d = V.norm(V.sub(armR.W, armR.E)); const q = V.add(armR.W, V.mul(d, -X(0.05))); cel(ell(q[0], q[1], X(0.1), X(0.03), Math.atan2(d[1], d[0]) + Math.PI / 2), { fill: C.red, k: 1, lw: 0.9 }); }
      // ---- head
      const fc = {
        skin: C.skin, fw: 0.37, cheekY: 0.6, jaw: 0.66, jawY: 0.84, chinW: 0.07, chinY: 0.99, chinSharp: true, browCol: '#1e1a1e', shadeK: 0.06,
        eye: { x: 0.18, y: 0.605, w: 0.2, h: 0.075, tilt: 0.12, peak: 0.3, iris: '#3e302e', irisR: 0.34, lash: 0.032, flick: 0.12, flickUp: 0.2, lid: 0.35, low: 0.45, lowLen: 0.6, bag: true, lashCol: '#1a1418', lidShadow: '#5a4a5a' },
        brow: { off: 0.11, angle: -0.01, w: 0.022, innerDrop: 0.032, arch: 0.0, len: 1.08 },
        nose: { style: 'line', y: 0.77 }, mouth: { expr: 'frown', w: 0.1, y: 0.875, lipA: 0.25 },
        extra: () => { line(R(F, [[-0.3, 0.68], [-0.2, 0.76]]), '#c08a84', 1.1); line(R(F, [[-0.27, 0.69], [-0.25, 0.74]]), '#c08a84', 0.7); },
      };
      if (!F.back) LQ.face(F, fc, null); else cel(LQ.facePath(F, fc), '#000');
      // chopped jaw-length hair, uneven
      const cap = sp(R(F, [[-0.46, 0.55], [-0.49, 0.25], [-0.33, 0.0], [0, -0.07], [0.33, 0.0], [0.49, 0.25], [0.46, 0.55], [0.37, 0.4], [0.2, 0.22], [0, 0.18], [-0.2, 0.22], [-0.37, 0.4]]), true);
      const fr = fringe(F, [[0.1, 0.04, 0.32, -0.08, 0.5, -0.05], [-0.1, 0.06, 0.3, -0.26, 0.56, -0.05], [0.26, 0.08, 0.24, 0.18, 0.5, 0.02], [0.08, 0.1, 0.08, 0.02, 0.66, -0.02],
        [-0.42, 0.3, 0.22, -0.52, 0.98, -0.04], [-0.3, 0.45, 0.14, -0.36, 1.02, 0.02], [0.42, 0.3, 0.22, 0.54, 0.92, 0.05], [0.32, 0.45, 0.13, 0.38, 0.98, -0.02], [-0.47, 0.5, 0.14, -0.6, 0.86, -0.05], [0.47, 0.48, 0.14, 0.62, 0.8, 0.05]]);
      LQ.hairMass(F, [cap, ...fr], { col: C.hair, rim: false, ring: [0, X(0.5), X(0.41), Math.PI * 1.2, Math.PI * 1.8], ringN: 3, ringW: 0.025, k: X(0.09), sd: [X(-0.07), X(-0.08)] });
      F.mark('hair', X(-0.55), X(0.9));
      // headcloth band
      const band = tube(R(F, [[-0.48, 0.34], [-0.2, 0.24], [0, 0.22], [0.2, 0.24], [0.48, 0.34]]), X(0.055), { seg: 8 });
      cel(band, { fill: C.white, k: X(0.04), after: () => fold(R(F, [[-0.3, 0.27], [0, 0.24], [0.3, 0.27]]), X(0.02), LQ.shadeOf(C.white), 0.6) });
      cel(ell(X(0.42), X(0.34), X(0.08), X(0.07)), { fill: C.white, k: X(0.04), lw: 1.1 });
      F.mark('band', X(0.6), X(0.42));
    },
  });

  /* =====================================================================================
   * 05 刀馬旦 — Opera Warrior-Maiden (bold fantasy)
   * ===================================================================================== */
  HY.push({
    id: 'opt05', cn: '刀馬旦', en: 'The Opera Warrior-Maiden', fantasy: 5, tag: 'bold fantasy · stage armour persona', accent: '#d8a830',
    bg: ['#2c1c22', '#4a2a2c', '#a8484a'], bustBg: ['#3a2228', '#7a3a3a'], rim: '#ffd27a', ink: '#1a0e12',
    body: { heads: 7.5, sex: 'f', sw: 0.112, ww: 0.068, stance: 0.5 },
    palette: [['#c0182c', '大紅', 'stage crimson'], ['#e0b040', '金片', 'gold sequin'], ['#1f6fa0', '點翠藍', 'kingfisher blue'], ['#3a9a7a', '翠綠', 'jade green'], ['#f6f0e6', '粉白', 'powder white'], ['#c8a070', '雉翎', 'pheasant plume']],
    callouts: [
      { at: 'plume', cn: '雉雞翎', en: 'twin pheasant-tail plumes', side: -1, ly: 96 },
      { at: 'flags', cn: '靠旗', en: 'back flags of the stage general', side: 1, ly: 120 },
      { at: 'collar', cn: '雲肩', en: 'four-lobed cloud collar', side: 1 },
      { at: 'panel', cn: '靠肚', en: 'embroidered belly panel', side: -1 },
      { at: 'skirt', cn: '甲裙流蘇', en: 'armour skirt with tassels', side: 1 },
    ],
    idea: '她說：「洛家的女兒，就要像戲台上的穆桂英。」把歌仔戲刀馬旦的「靠」改成能打的戰甲——雉翎與靠旗讓剪影在全場最搶眼。',
    ideaEn: '"A daughter of the Luo should take the field like Mu Guiying on the stage." Taiwanese-opera martial heroine armour rebuilt to really fight in — plumes and back flags make the loudest silhouette in the cast.',
    culture: 'Inspired by 歌仔戲 / 京劇 刀馬旦 costume — the 女靠 stage armour with 靠旗 flags, 雲肩 cloud collar, 靠肚 belly panel and 雉雞翎 plumes on a 七星額子 crown; real stage armour is decorative, so its fighting construction is pure fantasy.',
    backdrop(c, x, y, w, hh) { for (let i = 0; i < 9; i++) { c.fillStyle = `rgba(255,200,120,${0.05 + (i % 2) * 0.03})`; c.beginPath(); c.moveTo(x + w / 2, y - 40); c.lineTo(x + i * (w / 8) - 20, y + hh); c.lineTo(x + i * (w / 8) + 10, y + hh); c.fill(); } },
    draw(F, o) {
      const h = F.h, X = F.X;
      const C = { red: '#c0182c', gold: '#e0b040', blue: '#1f6fa0', jade: '#3a9a7a', white: '#f6f0e6', plume: '#c8a070', black: '#1c1418', skin: '#f8e2d6', hair: '#1a1418' };
      const tip = [X(-1.55), X(-2.0)], butt = [X(-1.12), X(6.95)]; const pole = V.norm(V.sub(butt, tip));
      const gAt = atY(tip, butt, X(1.95));
      const armL = F.ik(-1, LQ.gripW(F, gAt, pole, F.shoulderJ(-1)), 'down');
      const armR = F.ik(1, [X(1.45), X(3.0)], 'down');
      // ---- back flags 靠旗 (behind everything)
      const flag = (base, top, sx) => {
        const d = V.norm(V.sub(top, base)); const n = V.perp(d); const L = V.len(V.sub(top, base));
        const pole = tube([base, top], X(0.02), { seg: 2 }); cel(pole, { fill: '#7a5a3a', k: 1, lw: 0.9 });
        const a = V.add(base, V.mul(d, L * 0.38)), b = V.add(base, V.mul(d, L * 0.97)); const c2 = V.add(V.add(a, V.mul(d, L * 0.05)), V.mul(n, -sx * X(0.75)));
        const fp = sp([[a[0], a[1], 1], [b[0], b[1], 1], V.lerp(b, c2, 0.5), [c2[0], c2[1], 1]], true);
        cel(fp, { fill: C.red, k: X(0.12), tex: LQ.pattern('cloud', '#f0c050', X(0.36), 0.4) });
        LQ.border([b, V.lerp(b, c2, 0.5), c2], X(0.07), C.gold, '#8a1a1a', 'dot', { step: X(0.08) });
        cel(ell(top[0], top[1], X(0.06), X(0.07)), { fill: C.gold, k: 2, lw: 0.9 });
      };
      flag([X(-0.2), X(1.6)], [X(-1.55), X(-0.95)], -1); flag([X(0.2), X(1.6)], [X(1.55), X(-0.95)], 1);
      flag([X(-0.1), X(1.6)], [X(-0.75), X(-1.6)], -1); flag([X(0.1), X(1.6)], [X(0.75), X(-1.6)], 1);
      F.mark('flags', X(1.3), X(-0.55));
      // ---- plumes 雉雞翎 (long, arcing, barred)
      const plume = (sx) => {
        const pts = R(F, [[sx * 0.18, 0.02], [sx * 0.45, -0.9], [sx * 1.05, -1.75], [sx * 1.85, -1.7], [sx * 2.15, -1.05], [sx * 2.05, -0.55]]);
        const p = tube(pts, (t) => X(0.05 * (1 - t * 0.6) + 0.01), { seg: 12, end: 'point' });
        cel(p, { fill: C.plume, k: X(0.03), lw: 1.1, after: (c) => { c.strokeStyle = '#5a3a1a'; c.lineWidth = X(0.035); const cc = p.c; for (let i = 3; i < cc.length - 2; i += 4) { const d = V.norm(V.sub(cc[i + 1], cc[i - 1])); const n = V.perp(d); c.beginPath(); c.moveTo(cc[i][0] + n[0] * X(0.08), cc[i][1] + n[1] * X(0.08)); c.lineTo(cc[i][0] - n[0] * X(0.08), cc[i][1] - n[1] * X(0.08)); c.stroke(); } } });
      };
      plume(-1); plume(1); F.mark('plume', X(-1.0), X(-1.62));
      // spear behind the raised hand
      LQ.spear(F, { butt, tip, shaft: '#d0a050', bladeL: 0.9, bladeW: 0.16, blade: 'wide', tassel: { col: '#e02238', len: 1.1, w: 0.26, sway: -0.08 }, collar: C.gold, metal2: '#b08a40', wrap: [[0.5, 0.58, C.red], [0.68, 0.72, C.gold]] });
      // back hair (long, behind)
      const bh = LQ.hairTail(R(F, [[0, 0.3], [0.05, 1.0], [0.0, 1.8], [-0.1, 2.6]]), (t) => X(0.42 - t * 0.2), { n: 3, spread: 0.4 });
      LQ.hairMass(F, bh, { col: C.hair, k: X(0.12), rim: false });
      // ---- legs: stage trousers + flat embroidered boots
      [[-1, X(0.5)], [1, X(0.42)]].forEach(([sx, fx]) => {
        const L = LQ.legShape(F, { sx, top: F.waistY, kneeW: X(0.27), ankleW: X(0.22), ankleY: F.knee + X(0.4), footX: fx });
        LQ.drawLeg(F, L, { sx, col: C.white });
        LQ.boot(F, { sx, x: sx * fx, y: F.ankle, topY: F.knee + X(0.3), col: C.red, sole: '#f2ece0', trim: C.gold, shaftW: X(0.18), soleT: X(0.07), toe: 'up' });
      });
      // ---- armour skirt panels (靠腿) with tassel fringe
      const panel = (x0, x1, x2, x3, y0, y1, colr) => { const p = sp(R(F, [[x0, y0, 1], [x1, y0, 1], [x2, y1, 1], [(x2 + x3) / 2, y1 + 0.12], [x3, y1, 1]]), true); cel(p, { fill: colr, k: X(0.12), tex: LQ.pattern('wave', '#f0c050', X(0.32), 0.35) }); LQ.border(R(F, [[x2, y1 - 0.02], [(x2 + x3) / 2, y1 + 0.1], [x3, y1 - 0.02]]), X(0.08), C.gold, '#8a1a1a', 'dot', { step: X(0.09) }); for (let i = 0; i <= 6; i++) { const t = i / 6; const q = V.lerp(R(F, [[x3, y1 + 0.02]])[0], R(F, [[x2, y1 + 0.02]])[0], t); const dy = X(0.1 * Math.sin(Math.PI * t)); const tt = tube([[q[0], q[1] + dy], [q[0], q[1] + dy + X(0.22)]], X(0.025), { seg: 2, end: 'round' }); cel(tt, { fill: '#e02238', k: 1, lw: 0.7, rim: false }); } return p; };
      panel(-0.62, -0.05, -0.18, -0.95, 2.95, 4.65, C.blue); panel(0.62, 0.05, 0.95, 0.18, 2.95, 4.65, C.blue);
      panel(-0.32, 0.32, 0.42, -0.42, 2.95, 4.95, C.red);
      F.mark('skirt', X(0.75), X(4.3));
      // ---- torso: fitted armour top
      LQ.neck(F, { skin: C.skin, w: F.nw, bottom: 1.3 });
      const top = symR(F, [[0, 1.12], [0.26, 1.1], [0.62, 1.25], [0.78, 1.5], [0.7, 2.1], [0.6, 2.55], [0.64, 3.0, 1], [0, 3.05]]);
      cel(top, { fill: C.red, k: X(0.18), grad: [X(1.2), X(3)], tex: LQ.pattern('diamond', '#f0c050', X(0.22), 0.3) });
      // belly panel 靠肚
      const bp = sp(R(F, [[-0.48, 2.35], [0.48, 2.35], [0.56, 3.0], [0.3, 3.55], [0, 3.65], [-0.3, 3.55], [-0.56, 3.0]]), true);
      cel(bp, { fill: C.gold, k: X(0.15), hi: true, hiA: 0.4, after: (c) => { c.fillStyle = rgba('#8a1a1a', 0.7); for (let i = 0; i < 3; i++) { stroke(sp(R(F, [[-0.3 + i * 0.05, 2.6 + i * 0.25], [0, 2.5 + i * 0.25], [0.3 - i * 0.05, 2.6 + i * 0.25]]), false), '#8a1a1a', 1.2); } } });
      cel(ell(0, X(2.95), X(0.15), X(0.15)), { fill: C.jade, k: X(0.08), hi: true, hiCol: '#efffee', lw: 1.2 });
      LQ.border(R(F, [[-0.5, 2.36], [0, 2.32], [0.5, 2.36]]), X(0.09), C.blue, C.gold, 'cloud', { step: X(0.12) });
      F.mark('panel', X(-0.4), X(3.1));
      // ---- arms
      [[-1, armL], [1, armR]].forEach(([sx, arm]) => {
        const sl = LQ.sleeve(F, { sx, arm, wS: X(0.17), wE: X(0.14), wC: X(0.13), cuffT: 0.92 });
        LQ.drawSleeve(F, sl, { sx, col: C.red, nf: 1, tex: LQ.pattern('diamond', '#f0c050', X(0.22), 0.3) });
        const a = V.lerp(arm.E, arm.W, 0.4), b = V.lerp(arm.E, arm.W, 0.92);
        const br = tube([a, b], [X(0.15), X(0.13)], { seg: 2 }); cel(br, { fill: C.gold, k: X(0.08), hi: true, hiA: 0.5, after: () => line([V.lerp(a, b, 0.1), V.lerp(a, b, 0.9)], '#8a6a20', 0.8) });
      });
      // cloud collar 雲肩 over the shoulders
      const cloud = [];
      for (let i = 0; i < 4; i++) { const ang = Math.PI * (0.15 + i * 0.233); const cx = Math.cos(ang) * 0.75, cy = 1.25 + Math.sin(ang) * 0.42; cloud.push([cx - 0.18, cy - 0.04], [cx, cy + 0.2], [cx + 0.18, cy - 0.04]); }
      const cc = sp(R(F, [[-0.3, 1.08], [0.3, 1.08]].concat(cloud.reverse())), true);
      cel(cc, { fill: C.blue, k: X(0.12), tex: LQ.pattern('cloud', '#f0c050', X(0.3), 0.45), after: () => stroke(sp(R(F, [[-0.66, 1.42], [-0.3, 1.68], [0, 1.72], [0.3, 1.68], [0.66, 1.42]]), false), C.gold, 1.4) });
      F.mark('collar', X(0.6), X(1.55));
      LQ.hand(F, { kind: 'grip', sx: -1, at: gAt, pole, toward: F.shoulderJ(-1), skin: C.skin });
      LQ.hand(F, { kind: 'open', sx: 1, at: armR.W, dir: V.norm(V.sub(armR.W, armR.E)), skin: C.skin });
      // ---- head: opera make-up
      const fc = {
        skin: C.skin, fw: 0.37, cheekY: 0.62, jaw: 0.68, jawY: 0.85, chinW: 0.075, chinY: 0.99, browCol: '#1a1014', shadeK: 0.04,
        eye: { x: 0.185, y: 0.6, w: 0.22, h: 0.085, tilt: 0.24, peak: 0.25, iris: '#4a2418', irisR: 0.36, lash: 0.04, flick: 0.3, flickUp: 0.7, lashes: 2, low: 0.5, lowLen: 0.6, lashCol: '#140a0c' },
        brow: { off: 0.15, angle: 0.11, w: 0.026, arch: 0.0, len: 1.25, innerDrop: 0.02 },
        nose: { style: 'line', y: 0.775 }, mouth: { expr: 'set', w: 0.075, y: 0.875, lip: '#d0102a', lipA: 1, upper: true },
        under: () => { // 胭脂 rouge around the eyes fading down the cheeks
          const c = S.ctx; [-1, 1].forEach((sx) => { const g = c.createRadialGradient(sx * X(0.2), X(0.62), X(0.02), sx * X(0.2), X(0.66), X(0.2)); g.addColorStop(0, 'rgba(225,60,90,0.75)'); g.addColorStop(0.6, 'rgba(240,110,130,0.35)'); g.addColorStop(1, 'rgba(240,120,140,0)'); c.fillStyle = g; c.fill(ell(sx * X(0.2), X(0.66), X(0.2), X(0.22))); });
        },
      };
      if (!F.back) LQ.face(F, fc, null); else cel(LQ.facePath(F, fc), '#000');
      // hair: sleek opera "片子" side curls framing the face
      const cap = sp(R(F, [[-0.42, 0.55], [-0.45, 0.25], [-0.3, 0.02], [0, -0.04], [0.3, 0.02], [0.45, 0.25], [0.42, 0.55], [0.3, 0.42], [0.12, 0.34], [0, 0.32], [-0.12, 0.34], [-0.3, 0.42]]), true);
      const curls = [];
      [-1, 1].forEach((sx) => { for (let i = 0; i < 3; i++) curls.push(LQ.lock([sx * X(0.18 + i * 0.1), X(0.3 + i * 0.03)], X(0.12), [sx * X(0.24 + i * 0.1), X(0.48 + i * 0.07)], sx * X(0.05))); curls.push(LQ.lock([sx * X(0.4), X(0.42)], X(0.1), [sx * X(0.38), X(1.15)], sx * X(-0.04))); });
      LQ.hairMass(F, [cap, ...curls], { col: C.hair, rim: false, k: X(0.08), sd: [X(-0.06), X(-0.06)] });
      // 七星額子 crown with pompoms and pearl fringe
      const crown = sp(R(F, [[-0.48, 0.32], [-0.4, 0.02], [-0.2, -0.16], [0, -0.22], [0.2, -0.16], [0.4, 0.02], [0.48, 0.32], [0.3, 0.26], [0, 0.22], [-0.3, 0.26]]), true);
      cel(crown, { fill: C.gold, k: X(0.12), hi: true, hiA: 0.45, tex: LQ.pattern('cloud', '#8a5a10', X(0.25), 0.4) });
      LQ.border(R(F, [[-0.46, 0.3], [-0.2, 0.22], [0, 0.2], [0.2, 0.22], [0.46, 0.3]]), X(0.07), C.blue, '#ffffff', 'dot', { step: X(0.08) });
      for (let i = 0; i < 7; i++) { const a = Math.PI * (1.12 + i * 0.127); const q = [Math.cos(a) * X(0.5), X(0.2) + Math.sin(a) * X(0.42)]; line([[q[0] * 0.8, q[1] + X(0.08)], q], '#c8a040', 1); cel(ell(q[0], q[1], X(0.07), X(0.07)), { fill: i % 2 ? '#e02238' : '#ff4a5a', k: X(0.04), hi: true, hiA: 0.6, lw: 1 }); }
      cel(ell(0, X(0.0), X(0.09), X(0.08)), { fill: C.jade, k: X(0.04), hi: true, hiCol: '#efffee', lw: 1.1 });
      for (let i = -3; i <= 3; i++) cel(ell(X(i * 0.1), X(0.36 + Math.abs(i) * 0.01), X(0.02), X(0.025)), { fill: '#fffaf0', k: 1, lw: 0.6, rim: false });
    },
  });

  /* =====================================================================================
   * 06 中元燈夜 — Ghost-Month Lantern Hunter
   * ===================================================================================== */
  HY.push({
    id: 'opt06', cn: '中元燈夜', en: 'Ghost-Month Lantern Hunter', fantasy: 4, tag: 'fantasy · hooded night hunter', accent: '#f0a03a',
    bg: ['#1c2134', '#2c2a3c', '#f0b860'], bustBg: ['#1c2134', '#4a3a40'], rim: '#ffbf6a', ink: '#0e0c14',
    body: { heads: 7.0, sex: 'f', sw: 0.115, ww: 0.07, stance: 0.55 },
    palette: [['#232a44', '夜藍', 'night indigo'], ['#15121a', '墨黑', 'ink black'], ['#9a1e2a', '暗紅裡', 'blood-red lining'], ['#f0d9a0', '燈紙', 'lantern paper'], ['#e8c040', '符黃', 'talisman yellow'], ['#e05a20', '靈視眼', 'spirit-sight eyes']],
    callouts: [
      { at: 'hood', cn: '風帽斗篷', en: 'hooded Qing cloak', side: -1, ly: 120 },
      { at: 'lantern', cn: '引魂燈', en: 'paper soul-lantern on the spear', side: 1, ly: 96 },
      { at: 'fu', cn: '鎮煞符', en: 'talisman strips', side: 1 },
      { at: 'hair', cn: '散髮', en: 'loose hair spilling from the hood', side: -1 },
      { at: 'boot', cn: '纏符快靴', en: 'charm-bound boots', side: 1 },
    ],
    idea: '每到七月她就出門獵鬼：斗篷兜帽、槍尖挑著一盞引魂燈，在中元夜裡找那個戴鬼面的人。暗色剪影＋一點燈火，是最有「仙劍」夜戰味的一版。',
    ideaEn: 'Every seventh month she goes hunting ghosts — hooded cloak, a soul-lantern hung from the spear-head, searching the Ghost-Month night for the masked man. A dark silhouette with one point of lantern light: the most "night-battle xianxia" take.',
    culture: 'The cloak follows the Qing women\'s hooded 斗篷 (風帽) worn in winter; the paper lantern and yellow 符 talismans draw on 中元普渡 and Taoist exorcism practice. Glowing spirit-sight eyes and talisman-bound gear are fantasy.',
    backdrop(c, x, y, w, hh) { c.fillStyle = 'rgba(240,184,96,0.06)'; for (let i = 0; i < 14; i++) { const px = x + ((i * 53) % w), py = y + 40 + ((i * 97) % (hh - 120)); c.beginPath(); c.arc(px, py, 2 + (i % 3), 0, 7); c.fill(); } },
    draw(F, o) {
      const h = F.h, X = F.X;
      const C = { ind: '#232a44', black: '#15121a', lin: '#9a1e2a', paper: '#f0d9a0', fu: '#e8c040', skin: '#efd2c0', hair: '#1a1620', eye: '#e05a20' };
      const tip = [X(-2.0), X(-1.6)], butt = [X(0.55), X(5.9)]; const pole = V.norm(V.sub(butt, tip));
      const gAt = atY(tip, butt, X(2.45));
      const armL = F.ik(-1, LQ.gripW(F, gAt, pole, F.shoulderJ(-1)), 'down');
      const armR = F.ik(1, [X(1.42), X(3.5)], 'out');
      if (!S.sil) glow(X(-1.55), X(-0.1), X(1.6), '#ffb050', 0.35);
      // ---- cloak back (behind body)
      const cloakBack = sp(R(F, [[-0.55, 0.9], [0.55, 0.9], [1.2, 1.7], [1.55, 3.4], [1.75, 4.9, 1], [0.8, 5.05], [0, 5.1], [-0.8, 5.05], [-1.65, 4.85, 1], [-1.45, 3.4], [-1.15, 1.7]]), true);
      cel(cloakBack, { fill: LQ.col.darken(C.lin, 0.25), k: X(0.1), sh: 0 });
      // loose hair spilling from the hood (behind cloak front)
      const hairL = LQ.hairTail(R(F, [[0.3, 0.7], [0.55, 1.4], [0.65, 2.2], [0.85, 3.1]]), (t) => X(0.22 - t * 0.1), { n: 3, spread: 0.6 });
      // ---- legs
      [[-1, X(0.55)], [1, X(0.6)]].forEach(([sx, fx]) => {
        const bt = F.knee + X(0.2);
        const L = LQ.legShape(F, { sx, top: F.waistY, kneeW: X(0.28), ankleW: X(0.24), ankleY: bt + X(0.15), footX: fx });
        LQ.drawLeg(F, L, { sx, col: C.black, bunch: true });
        const b = LQ.boot(F, { sx, x: sx * fx, y: F.ankle, topY: bt, col: '#2a2430', sole: '#3a3238', shaftW: X(0.19), soleT: X(0.04) });
        // talisman strips wound on the boot
        const ft = tube([[sx * fx - X(0.2), bt + X(0.35)], [sx * fx + X(0.2), bt + X(0.25)]], X(0.05), { seg: 2 }); cel(ft, { fill: C.fu, k: 2, lw: 0.9, after: () => line([[sx * fx - X(0.05), bt + X(0.3)], [sx * fx + X(0.05), bt + X(0.28)]], '#a02020', 0.8) });
        if (sx > 0) { const st = tube([[sx * fx + X(0.12), bt + X(0.3)], [sx * fx + X(0.2), bt + X(0.75)]], X(0.04), { seg: 2 }); cel(st, { fill: C.fu, k: 1, lw: 0.8 }); F.mark('boot', sx * fx + X(0.18), bt + X(0.6)); }
      });
      // ---- jacket
      LQ.neck(F, { skin: C.skin, w: F.nw, bottom: 1.3 });
      const jk = symR(F, [[0, 1.12], [0.25, 1.1], [0.62, 1.25], [0.8, 1.5], [0.72, 2.2], [0.64, 2.7], [0.8, 3.4], [0.84, 3.9, 1], [0, 3.95]]);
      cel(jk, { fill: C.ind, k: X(0.18), grad: [X(1.2), X(3.9)] });
      piping(R(F, [[0.02, 1.16], [-0.3, 1.3], [-0.55, 1.6], [-0.68, 2.1], [-0.68, 2.7], [-0.78, 3.4], [-0.82, 3.9]]), X(0.05), C.lin);
      const belt = sp(R(F, [[-0.7, 2.66], [0, 2.71], [0.7, 2.66], [0.72, 2.94], [0, 2.99], [-0.72, 2.94]]), true); cel(belt, { fill: C.black, k: X(0.06) });
      // talismans tucked in the belt
      [[0.2, 2.75, 0.1], [0.38, 2.74, -0.15]].forEach(([x, y, r]) => { const p = sp(R(F, [[x - 0.08, y], [x + 0.08, y], [x + 0.08 + r, y + 0.62], [x - 0.08 + r, y + 0.62]]), true); cel(p, { fill: C.fu, k: X(0.04), lw: 1, after: () => { line(R(F, [[x + r * 0.3, y + 0.12], [x + r * 0.5, y + 0.3], [x + r * 0.4 - 0.03, y + 0.4], [x + r * 0.6 + 0.03, y + 0.5]]), '#b02020', 1.1); } }); });
      F.mark('fu', X(0.42), X(3.2));
      // ---- cloak front panels (open at the front) + hair spilling over
      const cl = (sx) => sp(R(F, sx < 0 ? [[-0.3, 1.0], [-0.62, 1.15], [-1.12, 1.7], [-1.42, 3.2], [-1.62, 4.8, 1], [-1.05, 4.92], [-0.72, 4.85, 1], [-0.62, 3.6], [-0.5, 2.4], [-0.32, 1.5]] : [[0.3, 1.0], [0.62, 1.15], [1.12, 1.7], [1.42, 3.2], [1.7, 4.75, 1], [1.2, 4.9], [0.85, 4.8, 1], [0.95, 3.6], [0.62, 2.4], [0.34, 1.5]]), true);
      const clL = cl(-1), clR = cl(1);
      [clL, clR].forEach((q, i) => {
        cel(q, { fill: C.ind, k: X(0.25), sd: [X(-0.25), X(-0.05)], grad: [X(1), X(4.9)], gradB: 0.2, after: () => {
          const sx = i ? 1 : -1; fold(R(F, [[sx * 0.8, 1.6], [sx * 1.0, 3.0], [sx * 1.2, 4.8]]), X(0.08), LQ.deepOf(C.ind), 0.6); fold(R(F, [[sx * 0.55, 2.0], [sx * 0.7, 3.4], [sx * 0.8, 4.8]]), X(0.06), LQ.deepOf(C.ind), 0.5);
        } });
      });
      // red lining visible at the open edges
      piping(R(F, [[-0.32, 1.5], [-0.5, 2.4], [-0.62, 3.6], [-0.72, 4.85]]), X(0.08), C.lin); piping(R(F, [[0.34, 1.5], [0.62, 2.4], [0.95, 3.6], [0.85, 4.8]]), X(0.08), C.lin);
      LQ.hairMass(F, hairL, { col: C.hair, k: X(0.1), rim: false });
      F.mark('hair', X(0.75), X(2.8));
      // ---- spear with lantern
      const sp1 = LQ.spear(F, { butt, tip, shaft: '#6a5a4a', bladeL: 0.8, bladeW: 0.14, tassel: { col: '#d02a30', len: 0.85, w: 0.18, sway: 0.05 }, metal2: '#5a524a' });
      const la = V.add(sp1.sockA, V.mul(pole, X(0.2)));
      line([la, V.add(la, [X(0.05), X(0.45)])], '#3a2a20', 1.1);
      const lc = V.add(la, [X(0.05), X(0.85)]);
      if (!S.sil) glow(lc[0], lc[1], X(0.9), '#ffc060', 0.6);
      const lan = sp([[lc[0] - X(0.22), lc[1] - X(0.36)], [lc[0] + X(0.22), lc[1] - X(0.36)], [lc[0] + X(0.3), lc[1]], [lc[0] + X(0.22), lc[1] + X(0.36)], [lc[0] - X(0.22), lc[1] + X(0.36)], [lc[0] - X(0.3), lc[1]]], true);
      cel(lan, { fill: '#ffe2a0', shade: '#f0a050', k: X(0.12), rim: false, after: (c) => { const g = c.createRadialGradient(lc[0], lc[1], 1, lc[0], lc[1], X(0.35)); g.addColorStop(0, 'rgba(255,255,230,0.9)'); g.addColorStop(1, 'rgba(255,200,120,0)'); c.fillStyle = g; c.fillRect(lc[0] - X(0.4), lc[1] - X(0.4), X(0.8), X(0.8)); for (let i = -2; i <= 2; i++) line([[lc[0] + X(i * 0.11), lc[1] - X(0.35)], [lc[0] + X(i * 0.14), lc[1]], [lc[0] + X(i * 0.11), lc[1] + X(0.35)]], rgba('#b06a30', 0.6), 0.7); c.fillStyle = '#c0302a'; c.font = `${X(0.22)}px "WenQuanYi Zen Hei"`; c.textAlign = 'center'; c.fillText('洛', lc[0], lc[1] + X(0.08)); } });
      [lc[1] - X(0.38), lc[1] + X(0.38)].forEach((yy) => cel(tube([[lc[0] - X(0.2), yy], [lc[0] + X(0.2), yy]], X(0.035), { seg: 2 }), { fill: C.black, k: 1, lw: 0.9 }));
      const tt = tube([[lc[0], lc[1] + X(0.42)], [lc[0] + X(0.02), lc[1] + X(0.8)]], X(0.04), { seg: 2, end: 'point' }); cel(tt, { fill: '#d02a30', k: 1, lw: 0.8 });
      F.mark('lantern', lc[0] + X(0.25), lc[1] - X(0.3));
      // ---- arms (cloak sleeves = jacket sleeves)
      [[-1, armL], [1, armR]].forEach(([sx, arm]) => { const sl = LQ.sleeve(F, { sx, arm, wS: X(0.17), wE: X(0.15), wC: X(0.13), cuffT: 0.92 }); LQ.drawSleeve(F, sl, { sx, col: C.ind, cuffBand: { w: X(0.07), col: C.lin } }); });
      LQ.hand(F, { kind: 'grip', sx: -1, at: gAt, pole, toward: F.shoulderJ(-1), skin: C.skin });
      // right hand holds the cloak edge open
      LQ.hand(F, { kind: 'fist', sx: 1, at: armR.W, dir: V.norm(V.sub(armR.W, armR.E)), skin: C.skin });
      // ---- head with glowing spirit-sight eyes
      const fc = {
        skin: C.skin, fw: 0.375, cheekY: 0.62, jaw: 0.68, jawY: 0.85, chinW: 0.08, chinY: 0.99, browCol: '#1a1418', shadeK: 0.07,
        eye: { x: 0.18, y: 0.61, w: 0.2, h: 0.08, tilt: 0.12, peak: 0.32, iris: C.eye, irisR: 0.38, lash: 0.034, flick: 0.14, flickUp: 0.3, lid: 0.25, low: 0.5, lowLen: 0.5, glint: '#ffe080', slit: true, lashCol: '#14101a' },
        brow: { off: 0.12, angle: 0.03, w: 0.024, innerDrop: 0.025, len: 1.1 },
        nose: { style: 'anime', y: 0.77 }, mouth: { expr: 'set', w: 0.1, y: 0.875, lipA: 0.4 },
      };
      if (!F.back) LQ.face(F, fc, null); else cel(LQ.facePath(F, fc), '#000');
      if (!S.sil && !F.back) [-1, 1].forEach((sx) => glow(sx * X(0.18), X(0.62), X(0.18), '#ff9a40', 0.35));
      const cap = sp(R(F, [[-0.43, 0.6], [-0.46, 0.25], [-0.3, 0.0], [0, -0.05], [0.3, 0.0], [0.46, 0.25], [0.43, 0.6], [0.36, 0.38], [0.2, 0.2], [0, 0.16], [-0.2, 0.2], [-0.36, 0.38]]), true);
      const fr = fringe(F, [[-0.05, 0.06, 0.34, 0.05, 0.56, 0.03], [0.18, 0.06, 0.3, 0.28, 0.5, 0.04], [-0.25, 0.1, 0.28, -0.3, 0.6, -0.03], [0.38, 0.16, 0.18, 0.42, 0.72, 0.04], [-0.38, 0.2, 0.16, -0.44, 0.95, -0.04]]);
      LQ.hairMass(F, [cap, ...fr], { col: C.hair, rim: false, k: X(0.09), sd: [X(-0.07), X(-0.08)] });
      // hood
      const hood = sp(R(F, [[-0.62, 1.15], [-0.66, 0.5], [-0.52, -0.05], [-0.15, -0.36], [0.12, -0.42, 1], [0.45, -0.12], [0.64, 0.4], [0.66, 1.15], [0.5, 1.05], [0.5, 0.45], [0.3, 0.06], [0, -0.04], [-0.3, 0.06], [-0.5, 0.45], [-0.52, 1.05]]), true);
      occl(LQ.facePath(F, fc), hood, 0, X(0.1), mix(C.skin, '#5a4a6a', 0.45), 0.8);
      cel(hood, { fill: C.ind, k: X(0.16), sd: [X(-0.14), X(-0.04)], after: () => { fold(R(F, [[-0.4, 0.0], [-0.55, 0.5], [-0.58, 1.0]]), X(0.05), LQ.deepOf(C.ind), 0.6); } });
      piping(R(F, [[-0.52, 1.05], [-0.5, 0.45], [-0.3, 0.06], [0, -0.04], [0.3, 0.06], [0.5, 0.45], [0.5, 1.05]]), X(0.07), C.lin);
      F.mark('hood', X(-0.6), X(0.3));
    },
  });

  /* =====================================================================================
   * 07 綿甲・金 — Studded Armour of Metal
   * ===================================================================================== */
  HY.push({
    id: 'opt07', cn: '綿甲・金', en: 'Studded Armour of Metal', fantasy: 3, tag: 'grounded fantasy · Qing brigandine', accent: '#a9b4c2',
    bg: ['#e2e4e6', '#aeb4bb', '#ffffff'], rim: '#e8f2ff',
    body: { heads: 7.0, sex: 'f', sw: 0.125, ww: 0.078, hw: 0.106, stance: 0.95 },
    palette: [['#a32430', '甲面朱', 'armour-face crimson'], ['#8d97a3', '鋼', 'steel'], ['#3e444e', '鐵', 'dark iron'], ['#d2a548', '銅釘', 'brass studs'], ['#efeae0', '白襯', 'white lining'], ['#ecc6a8', '膚', 'skin']],
    callouts: [
      { at: 'crown', cn: '束髮冠', en: 'steel hair-crown, top-knot', side: -1, ly: 100 },
      { at: 'mirror', cn: '護心鏡', en: 'round steel heart-mirror', side: 1, ly: 150 },
      { at: 'pauldron', cn: '護肩', en: 'layered shoulder guards', side: -1 },
      { at: 'skirt', cn: '綿甲甲裙', en: 'studded padded-armour skirt', side: 1 },
      { at: 'greave', cn: '鐵護脛', en: 'steel greaves', side: -1 },
    ],
    idea: '屬「金」的戰姬：清代綿甲的銅釘、護心鏡與護肩——以盾形與方塊堆疊出最「重」的剪影，擺出洛家槍起手式，像一面移動的城牆。',
    ideaEn: 'The Metal-element war-maiden: brass-studded Qing padded armour, heart-mirror and shoulder guards — stacked shield and block shapes give the heaviest silhouette, braced in the Luo-spear opening guard like a walking rampart.',
    culture: 'Based on the Qing 綿甲 (cloth-faced padded armour studded with brass rivets) with 護心鏡 and 護肩 as worn by Qing banner troops; fitting it to a 19-year-old woman, the steel crown and the slimmer cut are the fantasy departure.',
    draw(F, o) {
      const h = F.h, X = F.X;
      const C = { red: '#a32430', steel: '#8d97a3', iron: '#3e444e', brass: '#d2a548', white: '#efeae0', skin: '#ecc6a8', hair: '#221c22' };
      const tip = [X(1.85), X(-1.25)], butt = [X(-1.45), X(5.55)]; const pole = V.norm(V.sub(butt, tip));
      const g1 = atY(butt, tip, X(3.55)), g2 = atY(butt, tip, X(2.45));
      const armL = F.ik(-1, LQ.gripW(F, g1, pole, F.shoulderJ(-1)), 'out');
      const armR = F.ik(1, LQ.gripW(F, g2, pole, F.shoulderJ(1)), 'down');
      // ribbon tail of the top-knot (behind)
      const rb = tube(R(F, [[0.05, -0.2], [-0.45, -0.1], [-0.85, 0.35], [-0.95, 1.0], [-1.25, 1.5]]), (t) => X(0.06 + 0.02 * Math.sin(t * 8)), { seg: 10 }); cel(rb, { fill: C.red, k: X(0.04), deep: true, lw: 1.1 });
      const backHair = sp(R(F, [[-0.44, 0.5], [-0.42, 0.15], [0, -0.04], [0.42, 0.15], [0.44, 0.5], [0.3, 0.92], [-0.3, 0.92]]), true); LQ.hairMass(F, [backHair], { col: C.hair, rim: false });
      // ---- legs: wide guard stance, greaves
      [[-1, X(1.0)], [1, X(0.95)]].forEach(([sx, fx]) => {
        const L = LQ.legShape(F, { sx, top: F.waistY, kneeW: X(0.32), ankleW: X(0.27), ankleY: F.knee + X(0.45), footX: fx, kneeOut: X(0.1), thigh: 0.06 });
        LQ.drawLeg(F, L, { sx, col: C.white });
        const kx = L.knee[0];
        const b = LQ.boot(F, { sx, x: sx * fx, y: F.ankle, topY: F.knee + X(0.3), col: '#2a262a', sole: '#4a4040', shaftW: X(0.2), soleT: X(0.05), toeOut: X(0.14) });
        const gv = sp([[sx * fx - X(0.22), F.knee + X(0.18)], [sx * fx + X(0.22), F.knee + X(0.18)], [sx * fx + X(0.2), F.ankle - X(0.18)], [sx * fx, F.ankle - X(0.08)], [sx * fx - X(0.2), F.ankle - X(0.18)]], true);
        cel(gv, { fill: C.steel, shade: '#5e6672', k: X(0.12), sd: [X(-0.12), 0], hi: true, hiCol: '#ffffff', hiA: 0.5, after: () => { line([[sx * fx, F.knee + X(0.22)], [sx * fx, F.ankle - X(0.12)]], '#5e6672', 1); } });
        const kp = ell(sx * fx * 0.85 + sx * X(0.02), F.knee + X(0.08), X(0.2), X(0.15)); cel(kp, { fill: C.steel, shade: '#5e6672', k: X(0.08), hi: true, hiCol: '#fff', hiA: 0.5 });
        if (sx < 0) F.mark('greave', sx * fx - X(0.15), F.knee + X(0.8));
      });
      // ---- armour skirt (front panels + side panels), studded
      const studs = (path, x0, x1, y0, y1, nx, ny) => within(path, () => { for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) LQ.stud(X(x0 + (x1 - x0) * (i + 0.5) / nx + (j % 2) * 0.03), X(y0 + (y1 - y0) * (j + 0.5) / ny), X(0.03), C.brass); });
      const skirtL = sp(R(F, [[-0.04, 2.95], [-0.82, 2.95], [-1.15, 4.6, 1], [-0.62, 4.72], [-0.06, 4.62, 1]]), true);
      const skirtR = sp(R(F, [[0.04, 2.95], [0.82, 2.95], [1.15, 4.6, 1], [0.62, 4.72], [0.06, 4.62, 1]]), true);
      [skirtL, skirtR].forEach((q, i) => { cel(q, { fill: C.red, k: X(0.2), grad: [X(3), X(4.7)], tex: LQ.pattern('weave', '#ffffff', X(0.25), 0.06) }); studs(q, i ? 0.05 : -1.15, i ? 1.15 : -0.05, 3.0, 4.6, 7, 6); });
      LQ.border(R(F, [[-1.15, 4.58], [-0.6, 4.7], [-0.05, 4.6]]), X(0.12), C.iron, C.brass, 'dot', { step: X(0.12) }); LQ.border(R(F, [[0.05, 4.6], [0.6, 4.7], [1.15, 4.58]]), X(0.12), C.iron, C.brass, 'dot', { step: X(0.12) });
      // front apron panel
      const ap = sp(R(F, [[-0.28, 2.95], [0.28, 2.95], [0.3, 4.2, 1], [0, 4.35], [-0.3, 4.2, 1]]), true);
      cel(ap, { fill: C.iron, k: X(0.1), hi: true, hiA: 0.3, after: () => { crest(0, X(3.55), X(0.18), C.brass, '#5a1418'); } });
      F.mark('skirt', X(0.9), X(4.1));
      // ---- armour coat
      LQ.neck(F, { skin: C.skin, w: F.nw * 1.05, bottom: 1.3 });
      const coat = symR(F, [[0, 1.12], [0.28, 1.1], [0.66, 1.25], [0.86, 1.5], [0.8, 2.2], [0.72, 2.75], [0.84, 3.05, 1], [0, 3.1]]);
      cel(coat, { fill: C.red, k: X(0.2), grad: [X(1.2), X(3.1)] });
      studs(coat, -0.84, 0.84, 1.3, 3.0, 10, 7);
      piping(R(F, [[0.02, 1.16], [-0.3, 1.3], [-0.55, 1.6], [-0.7, 2.1], [-0.74, 2.75], [-0.82, 3.05]]), X(0.08), C.iron);
      // heart mirror
      const hm = ell(0, X(2.05), X(0.32), X(0.32)); cel(hm, { fill: C.steel, shade: '#5e6672', k: X(0.18), hi: true, hiCol: '#ffffff', hiA: 0.6, lw: 1.5, after: (c) => { stroke(ell(0, X(2.05), X(0.24), X(0.24)), '#5e6672', 1); c.fillStyle = 'rgba(255,255,255,0.55)'; c.fill(ell(X(-0.1), X(1.94), X(0.08), X(0.05), -0.6)); } });
      [[-0.3, 1.82], [0.3, 1.82], [-0.3, 2.28], [0.3, 2.28]].forEach(([x, y]) => LQ.stud(X(x), X(y), X(0.045), C.brass));
      line(R(F, [[-0.3, 1.82], [-0.6, 1.4]]), C.iron, 2); line(R(F, [[0.3, 1.82], [0.6, 1.4]]), C.iron, 2);
      F.mark('mirror', X(0.3), X(2.0));
      // belt
      const belt = sp(R(F, [[-0.78, 2.78], [0, 2.84], [0.78, 2.78], [0.8, 3.02], [0, 3.08], [-0.8, 3.02]]), true); cel(belt, { fill: C.iron, k: X(0.06), hi: true, hiA: 0.3 });
      for (let i = -3; i <= 3; i++) LQ.stud(X(i * 0.22), X(2.93), X(0.04), C.steel);
      // ---- spear (in front, both hands)
      LQ.spear(F, { butt, tip, shaft: '#a07850', bladeL: 0.95, bladeW: 0.17, blade: 'long', tassel: { col: '#c8202c', len: 0.95, w: 0.22, sway: 0.1 }, collar: C.brass, metal2: '#6a6e74' });
      // ---- arms with pauldrons and vambraces
      [[-1, armL], [1, armR]].forEach(([sx, arm]) => {
        const sl = LQ.sleeve(F, { sx, arm, wS: X(0.18), wE: X(0.15), wC: X(0.13), cuffT: 0.95 });
        LQ.drawSleeve(F, sl, { sx, col: C.red });
        const a = V.lerp(arm.E, arm.W, 0.25), b = V.lerp(arm.E, arm.W, 0.95);
        const vb = tube([a, b], [X(0.16), X(0.14)], { seg: 2 }); cel(vb, { fill: C.steel, shade: '#5e6672', k: X(0.1), hi: true, hiCol: '#fff', hiA: 0.5, after: () => { for (let i = 1; i < 4; i++) { const q = V.lerp(a, b, i / 4); const n = V.perp(V.norm(V.sub(b, a))); line([V.add(q, V.mul(n, -X(0.15))), V.add(q, V.mul(n, X(0.15)))], '#5e6672', 0.9); } } });
        // pauldron: three overlapping lames
        const sh = [sx * (F.sw - X(0.05)), F.shY + X(0.1)];
        for (let k = 2; k >= 0; k--) {
          const y0 = sh[1] - X(0.08) + k * X(0.2); const p = sp([[sx * X(0.35), y0 - X(0.02)], [sh[0] + sx * X(0.22 + k * 0.03), y0 + X(0.05)], [sh[0] + sx * X(0.25 + k * 0.03), y0 + X(0.3)], [sh[0] - sx * X(0.15), y0 + X(0.36)], [sx * X(0.45), y0 + X(0.22)]], true);
          cel(p, { fill: k === 0 ? C.steel : C.red, shade: k === 0 ? '#5e6672' : undefined, k: X(0.1), hi: true, hiA: 0.4 });
          if (k > 0) within(p, () => { for (let i = 0; i < 4; i++) LQ.stud(sh[0] + sx * X(-0.08 + i * 0.09), y0 + X(0.25), X(0.025), C.brass); });
        }
        if (sx < 0) F.mark('pauldron', sh[0] - X(0.25), sh[1] + X(0.2));
      });
      LQ.hand(F, { kind: 'grip', sx: -1, at: g1, pole, toward: F.shoulderJ(-1), skin: C.skin });
      LQ.hand(F, { kind: 'grip', sx: 1, at: g2, pole, toward: F.shoulderJ(1), skin: C.skin });
      // ---- head
      const fc = {
        skin: C.skin, fw: 0.395, cheekY: 0.6, jaw: 0.8, jawY: 0.84, chinW: 0.13, chinY: 0.98, browCol: '#201418', shadeK: 0.06,
        eye: { x: 0.19, y: 0.61, w: 0.19, h: 0.078, tilt: 0.1, peak: 0.3, iris: '#6c7a88', irisR: 0.36, lash: 0.034, flick: 0.1, flickUp: 0.2, lid: 0.15, low: 0.5, lowLen: 0.5, lashCol: '#1c1418' },
        brow: { off: 0.11, angle: 0.02, w: 0.034, innerDrop: 0.03, len: 1.05, blunt: true },
        nose: { style: 'bridge', y: 0.77, size: 0.9 }, mouth: { expr: 'set', w: 0.12, y: 0.87, lipA: 0.35 },
        extra: () => { line(R(F, [[0.06, 0.95], [0.1, 0.99]]), '#b07a6a', 1.0); },
      };
      if (!F.back) LQ.face(F, fc, null); else cel(LQ.facePath(F, fc), '#000');
      const cap = sp(R(F, [[-0.42, 0.52], [-0.45, 0.22], [-0.3, -0.02], [0, -0.08], [0.3, -0.02], [0.45, 0.22], [0.42, 0.52], [0.36, 0.34], [0.22, 0.2], [0, 0.17], [-0.22, 0.2], [-0.36, 0.34]]), true);
      const fr = fringe(F, [[-0.12, 0.08, 0.3, -0.25, 0.42, -0.03], [0.14, 0.08, 0.28, 0.24, 0.42, 0.03], [-0.34, 0.2, 0.16, -0.4, 0.82, -0.03], [0.34, 0.2, 0.16, 0.4, 0.82, 0.03]]);
      LQ.hairMass(F, [cap, ...fr], { col: C.hair, rim: false, ring: [0, X(0.48), X(0.4), Math.PI * 1.2, Math.PI * 1.8], ringN: 3, ringW: 0.025, k: X(0.09), sd: [X(-0.07), X(-0.08)], dark: [R(F, [[-0.35, 0.4], [-0.2, 0.1], [0, -0.02]]), R(F, [[0.35, 0.4], [0.2, 0.1], [0, -0.02]])] });
      // top-knot + steel crown
      const knot = ell(0, X(-0.2), X(0.2), X(0.17)); LQ.hairMass(F, [knot], { col: C.hair, rim: false });
      const crown = sp(R(F, [[-0.2, -0.08], [-0.22, -0.3], [-0.1, -0.42], [0, -0.48, 1], [0.1, -0.42], [0.22, -0.3], [0.2, -0.08]]), true);
      cel(crown, { fill: C.steel, shade: '#5e6672', k: X(0.08), hi: true, hiCol: '#fff', hiA: 0.6, after: () => line(R(F, [[0, -0.45], [0, -0.1]]), '#5e6672', 1) });
      const hp = tube(R(F, [[-0.38, -0.2], [0.38, -0.22]]), X(0.022), { seg: 2, start: 'round', end: 'round' }); cel(hp, { fill: C.brass, k: 1, hi: true, lw: 0.9 });
      F.mark('crown', X(-0.2), X(-0.3));
    },
  });
})();
