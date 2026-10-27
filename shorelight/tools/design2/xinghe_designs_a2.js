// 彼岸燈 — design pass v2 — 沈星河 options 02–05 (+ more helpers)
'use strict';
(function (global) {
  const XL = global.XL, XD = global.XD;

  // 綁腿 leg wraps: tapered tube with spiral wrap bands
  XD.legWrap = (ctx, pts, ws, col, o = {}) => {
    const p = XL.ribbon(pts, ws, {});
    XL.paint(ctx, p, col, {
      sh: [5, 1], lw: 1.4, after: (c) => {
        const y0 = pts[0][1], y1 = pts[pts.length - 1][1], x0 = pts[0][0], x1 = pts[pts.length - 1][0];
        const n = o.n || 7;
        for (let i = 0; i <= n; i++) {
          const t = i / n, y = y0 + (y1 - y0) * t, x = x0 + (x1 - x0) * t, w = (ws[0] + (ws[ws.length - 1] - ws[0]) * t) / 2 + 2;
          XL.line(c, [[x - w, y + 4], [x, y + 1], [x + w, y - 4]], XL.shadow(col, 0.32), 1.1);
        }
      },
    });
    if (o.tie) XL.paint(ctx, XL.ribbon([[pts[0][0] - ws[0] / 2, pts[0][1] + 3], [pts[0][0] + ws[0] / 2, pts[0][1] + 1]], 3), o.tie, { lw: 0.9 });
    return p;
  };
  // queue braid along a path: alternating lobes + tail tassel
  XD.braid = (ctx, pts, w, col, o = {}) => {
    const lobes = [];
    const seg = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.round(d / (w * 0.9)));
      for (let k = 0; k < n; k++) seg.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, Math.atan2(b[1] - a[1], b[0] - a[0])]);
    }
    seg.forEach(([x, y, an], i) => {
      const t = i / seg.length, ww = w * (1 - t * 0.45);
      lobes.push(XL.ell(x, y, ww * 0.62, ww * 0.42, an + (i % 2 ? 0.7 : -0.7)));
    });
    XL.paintMass(ctx, lobes, col, { lw: 1.3, sh: [1.6, 1.2], hl: [1, 1], hlCol: XL.rgba('#8f93ad', 0.45) });
    if (o.tassel) {
      const e = pts[pts.length - 1];
      XL.paint(ctx, XL.ribbon([[e[0] - 3, e[1]], [e[0] + 3, e[1] + 1]], 4), o.tassel, { lw: 0.9 });
      XL.paint(ctx, XL.lock(e[0], e[1] + 2, e[0] + 1, e[1] + (o.tasselL || 22), w * 0.9, 1, { mid: 1, tipW: 2.2 }), o.tassel, { lw: 1 });
    }
  };

  // ================================================================== 02 挑燈上崎
  (function () {
    const B = XL.body({ heads: 7, sh: 0.95, stance: 0.42 });
    const hu = B.hu;
    const C = { skin: '#cf9468', jacket: '#8e4f32', pipe: '#3b2a22', trou: '#3d4558', wrap: '#e4dccb', cloth: '#efe8d8', towel: '#eef0ea', sash: '#2c3446', pole: '#b98c4c', paper: '#d24a2e', paper2: '#e9d5a8' };
    const F = {
      skin: C.skin, temple: 0.34, cheek: 0.355, jaw: 0.27, jawY: 0.82, chin: 0.085, chinY: 1.02, earS: 1.0, earY: 0.5, shW: 5,
      hairCol: '#1b1719',
      eye: { x: 0.17, y: 0.6, w: 0.086, h: 0.05, iris: '#5a3418', ir: 0.05, tilt: -0.004, up: 0.7, lo: 0.35, lashW: 2.3, peak: 0.0, crease: false },
      brow: { x0: 0.07, y0: 0.455, x1: 0.28, y1: 0.425, th: 0.026, arch: 0.03 },
      nose: { type: 'bridge', y: 0.75, w: 0.05 },
      mouth: { type: 'laugh', y: 0.865, w: 0.115 },
      blushA: 0.2,
      skinExtras: (c) => {
        c.fillStyle = XL.rgba('#8a4a2a', 0.5);
        [[-0.08, 0.66], [-0.12, 0.69], [-0.05, 0.69], [0.08, 0.66], [0.12, 0.69], [0.05, 0.69], [-0.15, 0.665], [0.15, 0.665]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 0.008, 0, 7); c.fill(); });
      },
    };
    const backHair = null;
    const frontHair = (c) => {
      // 頭巾: white cotton wrapped round the shaved head, knot + two ends at the right temple
      const wrap = XL.curve([[-0.42, 0.33], [-0.43, 0.12], [-0.3, -0.06], [0, -0.1], [0.3, -0.06], [0.43, 0.12], [0.42, 0.33], [0.2, 0.27], [0, 0.29], [-0.2, 0.27]]);
      c.save(); c.clip(XL.faceShape(F)); c.fillStyle = XL.rgba(XL.skinShadow(C.skin), 1); c.fill(XL.curve([[-0.5, 0.3], [0, 0.27], [0.5, 0.3], [0.5, 0.37], [0, 0.34], [-0.5, 0.37]])); c.restore();
      XL.paint(c, wrap, C.cloth, {
        sh: [5, 2], lw: 1.6, after: (cc) => {
          XD.folds(cc, [[[-0.38, 0.22], [-0.1, 0.12], [0.25, 0.16]], [[-0.3, 0.05], [0, 0.0], [0.3, 0.06]], [[-0.36, 0.28], [0, 0.22], [0.34, 0.25]]], XL.shadow(C.cloth, 0.22), 1.3);
          XL.line(cc, [[-0.4, 0.31], [0, 0.26], [0.4, 0.31]], XL.rgba('#5a7894', 0.7), 1.4); // blue edge stripe
        },
      });
      // knot & ears of the cloth
      XL.paint(c, XL.lock(0.3, 0.1, 0.56, -0.12, 0.13, -0.04), C.cloth, { lw: 1.3, sh: [2, 1] });
      XL.paint(c, XL.lock(0.32, 0.12, 0.6, 0.06, 0.12, 0.04), C.cloth, { lw: 1.3, sh: [2, 1] });
      XL.paint(c, XL.ell(0.32, 0.12, 0.07, 0.06), XL.shadow(C.cloth, 0.06), { lw: 1.3 });
    };
    function draw(ctx) {
      // shoulder pole 扁擔 behind the neck + lanterns
      const py = -347;
      const pole = XL.ribbon([[-150, py + 2], [0, py - 1], [150, py + 2]], 7, { round: true });
      XL.paint(ctx, pole, C.pole, { sh: [0, 2.5], lw: 1.5, after: (c) => { [-120, -84, 84, 120].forEach((x) => XL.line(c, [[x, py - 4], [x, py + 4]], XL.shadow(C.pole, 0.35), 1.1)); } });
      const lan = [[-140, 26, 14, C.paper, '陳'], [-104, 50, 16, C.paper2, ''], [104, 44, 16, C.paper, '燈'], [140, 22, 13, C.paper2, '']];
      lan.forEach(([x, h, r, col, ch]) => XD.lantern(ctx, x, py + 3, r, { paper: col, hang: h, char: ch, charCol: col === C.paper ? '#1e1416' : '#a3311f', tassel: '#c8432b', tall: 1.08 }));
      // trousers + leg wraps + feet
      [[-1, -122], [1, -100]].forEach(([sd, cuffY]) => {
        const leg = XL.ribbon([[sd * 19, -214], [sd * 25, -160], [sd * 27, cuffY]], [42, 44, 44]);
        XL.paint(ctx, leg, C.trou, { sh: [8, 2], lw: 1.6, after: (c) => XD.folds(c, [[[sd * 12, -190], [sd * 18, -150], [sd * 16, cuffY + 10]], [[sd * 38, -170], [sd * 40, cuffY + 16]]], XL.light(C.trou, 0.15), 1.3) });
        XL.paint(ctx, XL.curve([[sd * 27 - 23, cuffY - 7, 'c'], [sd * 27 + 23, cuffY - 7, 'c'], [sd * 27 + 22, cuffY + 6, 'c'], [sd * 27 - 22, cuffY + 6, 'c']]), XL.light(C.trou, 0.07), { lw: 1.4 });
        XD.legWrap(ctx, [[sd * 27, cuffY + 5], [sd * 27.5, (cuffY - 24) / 2], [sd * 26, -26]], [19, 17, 13], C.wrap, { n: Math.round((-cuffY - 26) / 12) });
        XL.foot(ctx, sd * 27, -22, B.footS, C.skin, 'straw', sd);
      });
      // upper sleeves (behind the body)
      [-1, 1].forEach((sd) => XD.sleeve(ctx, [[sd * 44, -330], [sd * 66, -316], [sd * 84, -304]], [20, 26, 24], C.jacket, { round: true, paint: { sh: [5, 4] } }));
      XD.neck(ctx, 0, B.chin, B.shY, B.neckW * 2, C.skin, hu);
      // 大襟短衫 (side-fastened short jacket)
      const jk = XL.curve(XL.sym([[0, -348], [12, -350], [32, -343], [48, -334], [55, -322, 'c'], [53, -296], [52, -254], [58, -206], [60, -194, 'c'], [30, -191], [0, -190]]));
      XL.paint(ctx, jk, C.jacket, {
        sh: [12, 5], lw: 1.8,
        shadows: [XL.curve([[-53, -296], [-38, -286], [-40, -256], [-52, -250]])],
        after: (c) => {
          // big front flap crosses to the wearer's right (screen left) armpit
          const flap = [[2, -349], [-6, -340], [-24, -330], [-42, -314], [-50, -298], [-52, -250], [-56, -195]];
          c.save(); c.fillStyle = XL.rgba(XL.shadow(C.jacket, 0.4), 0.55); c.fill(XL.ribbon(flap.map(([x, y]) => [x + 2.5, y + 2]), 3)); c.restore();
          XL.line(c, flap, C.pipe, 2.6);
          XD.folds(c, [[[30, -300], [24, -270], [28, -240]], [[-26, -270], [-20, -240]], [[42, -224], [46, -200]], [[-36, -220], [-42, -200]]], XL.shadow(C.jacket, 0.28), 1.6);
          // mended patch
          XL.paint(c, XL.poly([[18, -268], [34, -270], [35, -252], [19, -250]]), XL.shadow(C.jacket, 0.12), { lw: 0.9, sh: false, after: (cc) => XL.dash(cc, [[19, -268], [34, -269], [35, -251], [19, -250], [19, -268]], XL.light(C.jacket, 0.4), 0.7, [1.5, 1.5]) });
        },
      });
      [[-3, -344], [-26, -329], [-44, -311], [-51, -283], [-52, -258]].forEach(([x, y]) => XL.knot(ctx, x, y, 2.2, C.pipe, 4.5));
      XL.paint(ctx, XL.curve([[-13, -356, 'c'], [0, -357], [13, -356, 'c'], [14, -347, 'c'], [-14, -347, 'c']]), C.jacket, { lw: 1.4, after: (c) => XL.line(c, [[-13, -356], [13, -356]], C.pipe, 2) });
      // sweat towel round the neck
      XL.paint(ctx, XL.ribbon([[-16, -352], [-12, -330], [-15, -300]], [12, 11, 10]), C.towel, { lw: 1.4, sh: [3, 1] });
      XL.paint(ctx, XL.ribbon([[16, -352], [14, -334], [17, -312]], [12, 11, 10]), C.towel, { lw: 1.4, sh: [3, 1] });
      XL.line(ctx, [[-21, -306], [-10, -305]], '#5a7894', 1.3); XL.line(ctx, [[11, -317], [22, -318]], '#5a7894', 1.3);
      // sash + pouch
      XL.paint(ctx, XL.curve([[-56, -258, 'c'], [0, -255], [56, -258, 'c'], [57, -244, 'c'], [0, -241], [-57, -244, 'c']]), C.sash, { lw: 1.5, sh: [6, 2] });
      XL.paint(ctx, XL.lock(40, -250, 46, -212, 9, 3), C.sash, { lw: 1.2 });
      XL.paint(ctx, XL.lock(46, -250, 56, -218, 8, -2), C.sash, { lw: 1.2 });
      XL.paint(ctx, XL.curve([[-40, -246], [-26, -246], [-24, -226], [-33, -220], [-42, -226]]), '#7a5a38', { lw: 1.2, sh: [2, 1] });
      // sword 螢火 in the sash at the left hip
      XL.paint(ctx, XL.ribbon([[54, -262], [68, -200], [78, -150]], [6.5, 6.5, 5.5], { round: true }), '#2e2626', { lw: 1.2, sh: [2, 0] });
      XD.swordHilt(ctx, 52, -268, Math.PI * 0.94, 30, { grip: '#3a2a2a', guard: '#a8834a', tassel: '#c8432b' });
      // forearms up to the pole, hands draped over it
      [-1, 1].forEach((sd) => {
        XL.paint(ctx, XL.ribbon([[sd * 72, -312], [sd * 92, -300]], 14), XL.light(C.jacket, 0.08), { lw: 1.3 }); // rolled cuff
        XD.limb(ctx, [[sd * 88, -300], [sd * 88, -322], [sd * 82, -344]], [16, 14, 11.5], C.skin);
        XL.line(ctx, [[sd * 84, -320], [sd * 86, -332]], XL.rgba(XL.skinShadow(C.skin), 1), 0.9);
        XL.hand(ctx, sd * 81, -352, sd * 0.12, B.handL * 0.9, C.skin, 'gripH', sd < 0);
        if (sd > 0) XL.paint(ctx, XL.ribbon([[sd * 75, -343], [sd * 89, -341]], 2.4), '#c8432b', { lw: 0.8 });
      });
      XD.head(ctx, 0, B.top, hu, F, backHair, frontHair, { tilt: 0.04 });
    }
    function back(ctx) {
      ctx.fillStyle = '#000';
      ctx.fill(XL.ribbon([[0, -372], [2, -320], [0, -250]], [9, 7, 5], { round: true }));
    }
    global.XINGHE_DESIGNS.push({
      id: '02', zh: '挑燈上崎', en: 'Stair-Runner with the Lantern Pole', tag: '歷史寫實', tagEn: 'HISTORICAL',
      heads: 7, hairNote: '頭巾包辮（歷史）', accent: '#d24a2e', accentInk: '#8a3a1e', figX: 0,
      bg: { top: '#f1ebe0', bottom: '#e1d5c0', motif: (ctx, w, h) => XD.motifs.stairs(ctx, w, h, '#6a4a32') },
      palette: [['#8e4f32', '薯榔褐', 'dioscorea russet'], ['#efe8d8', '頭巾白', 'head cloth'], ['#3d4558', '藍灰褲', 'slate'], ['#e4dccb', '綁腿', 'leg wrap'], ['#d24a2e', '燈紅', 'lantern red'], ['#b98c4c', '竹', 'bamboo'], ['#cf9468', '曬膚', 'sun-tan skin']],
      callouts: [
        { x: 24, y: -416, zh: '頭巾', en: 'head cloth over shaved crown', side: 'R', ly: 30 },
        { x: -140, y: -300, zh: '扁擔挑燈', en: 'shoulder pole of lanterns', side: 'L', ly: 230 },
        { x: -30, y: -326, zh: '大襟短衫・滾邊', en: 'side-fastened jacket, piping', side: 'L', ly: 290 },
        { x: 15, y: -322, zh: '汗巾', en: 'sweat towel', side: 'R', ly: 236 },
        { x: 26, y: -60, zh: '綁腿', en: 'leg wraps', side: 'R', ly: 340 },
        { x: -36, y: -122, zh: '大褲捲管', en: 'rolled wide trousers', side: 'L', ly: 352 },
      ],
      idea: '把「跑腿送燈」變成角色本身：一根扁擔橫在肩後、兩頭吊著燈籠，雙手搭著扁擔爬豎崎路。瘦長、曬黑、雀斑、大笑——閒不下來的嘴，偷懶時也是掛在扁擔上。',
      culture: '清代臺灣勞動男子：頭巾包住薙髮與辮子、薯榔染褐色大襟短衫（右衽，深色滾邊與盤扣）、汗巾、大褲捲管、綁腿、草鞋；扁擔是九份山城運貨的日常。劍插在腰帶上。',
      model3d: '扁擔與燈籠為獨立道具（可擺盪物理）；頭巾為單一包覆網格；綁腿紋路以貼圖表現。',
      silNote: '關鍵剪影：橫向扁擔＋四盞吊燈，最寬的一款',
      faceNote: '長臉・雀斑・瞇眼大笑・曬黑',
      costume: ['白棉頭巾包頭（薙髮與辮子收在裡面，背面辮尾垂出）', '薯榔染褐色大襟短衫，右衽、深褐滾邊、五顆盤扣、手肘處補丁', '汗巾掛頸', '深藍腰帶＋小錢袋，螢火劍插在左腰', '藍灰大褲兩腳捲不一樣高，白綁腿，草鞋', '竹扁擔吊四盞燈籠（陳記）'],
      systems: '頭像：頭巾結＋雀斑笑臉。地圖精靈：橫向扁擔讓他在階梯地圖上最易辨認，燈籠可做擺動。戰鬥精靈：放下扁擔拔劍為開場動作；扁擔也可當普攻道具的彩蛋。',
      draw, back,
    });
  })();

  // ================================================================== 03 水燈仔
  (function () {
    const B = XL.body({ heads: 6.4, sh: 0.9, stance: 0.38 });
    const hu = B.hu;
    const C = { skin: '#edc09c', straw: '#b49a5e', straw2: '#8f7646', shirt: '#6f8fa6', trou: '#4b5a70', hair: '#2a2124', lantern: '#d2412c', roof: '#2f2a3a', glow: '#ffb24a', cord: '#6e5532' };
    const F = {
      skin: C.skin, temple: 0.36, cheek: 0.375, jaw: 0.295, jawY: 0.78, chin: 0.12, chinY: 0.985, earS: 0.95, earY: 0.53, shW: 4.5,
      hairCol: C.hair,
      eye: { x: 0.17, y: 0.6, w: 0.094, h: 0.074, iris: '#b0702a', ir: 0.07, tilt: -0.006, up: 1.05, lo: 0.75, lashW: 2.4, peak: 0.1, look: -0.05, glowIris: '#ffd27a' },
      brow: { x0: 0.07, y0: 0.45, x1: 0.27, y1: 0.47, th: 0.025, arch: 0.012 },
      nose: { type: 'button', y: 0.755, w: 0.04 },
      mouth: { type: 'smile', y: 0.865, w: 0.055 },
      blushA: 0.32,
          };
    const lockSet = (arr) => arr.map(([x0, y0, x1, y1, w, b]) => XL.lock(x0, y0, x1, y1, w, b, { mid: 0.9 }));
    const backHair = (c) => {
      const locks = lockSet([[-0.34, 0.3, -0.47, 0.9, 0.22, -0.05], [-0.22, 0.4, -0.33, 0.98, 0.2, 0.04], [0.34, 0.3, 0.48, 0.88, 0.22, 0.05], [0.22, 0.4, 0.34, 0.99, 0.2, -0.04]]);
      locks.push(XL.curve([[-0.45, 0.6], [-0.48, 0.12], [-0.32, -0.12], [0, -0.17], [0.32, -0.12], [0.48, 0.12], [0.45, 0.6], [0, 0.5]]));
      XL.paintMass(c, locks, C.hair, { lw: 1.6, sh: [4, 1], hl: false });
    };
    const frontHair = (c) => {
      const locks = lockSet([
        [-0.3, 0.0, -0.37, 0.46, 0.22, -0.05], [-0.16, -0.04, -0.2, 0.5, 0.2, 0.03], [-0.03, -0.06, 0.0, 0.4, 0.17, -0.02],
        [0.08, -0.05, 0.13, 0.52, 0.2, 0.04], [0.22, -0.02, 0.3, 0.44, 0.19, -0.03], [0.34, 0.04, 0.42, 0.58, 0.17, 0.05],
        [-0.4, 0.14, -0.47, 0.72, 0.15, -0.06], [0.41, 0.16, 0.5, 0.74, 0.14, 0.06], [-0.06, -0.08, -0.1, 0.3, 0.14, 0.04],
        // silhouette breakers: clumps flicking out at the sides and two cowlicks on top
        [-0.3, 0.2, -0.56, 0.44, 0.12, 0.04], [0.32, 0.22, 0.58, 0.4, 0.12, -0.04], [-0.06, -0.1, -0.2, -0.26, 0.12, 0.04], [0.06, -0.1, 0.22, -0.23, 0.1, -0.03],
        [-0.36, -0.02, -0.52, 0.1, 0.12, 0.03], [0.36, 0.0, 0.53, 0.08, 0.12, -0.03],
      ]);
      locks.push(XL.curve([[-0.42, 0.24], [-0.4, -0.02], [-0.22, -0.15], [0.05, -0.18], [0.3, -0.11], [0.43, 0.06], [0.43, 0.26], [0, 0.1]]));
      // cast shadow of the fringe on the forehead
      c.save(); c.clip(XL.faceShape(F)); c.fillStyle = XL.skinShadow(C.skin);
      c.fill(XL.curve([[-0.45, 0.2], [-0.36, 0.52], [-0.26, 0.4], [-0.2, 0.56], [-0.1, 0.38], [0.0, 0.46], [0.12, 0.38], [0.14, 0.58], [0.24, 0.42], [0.31, 0.5], [0.45, 0.4], [0.45, 0.2]])); c.restore();
      XL.paintMass(c, locks, C.hair, {
        lw: 1.7, sh: [3, 2], hl: false, after: (cc) => {
          XD.shine(cc, 0.03, -0.36, 0.36, XL.rgba('#8a86a6', 0.5), {});
          [[-0.18, 0.12, -0.2, 0.42], [0.12, 0.1, 0.14, 0.44], [0.3, 0.14, 0.36, 0.42]].forEach(([a, b, d, e]) => XL.taper(cc, [[a, b], [(a + d) / 2 + 0.01, (b + e) / 2], [d, e]], 1.2, XL.rgba('#0e0b0d', 0.7)));
        },
      });
      // wet drip
      XL.paint(c, XL.curve([[0.43, 0.8], [0.45, 0.85], [0.43, 0.87], [0.41, 0.85]]), '#cfe7f3', { lw: 0.8, sh: false });
    };
    function draw(ctx, opt = {}) {
      // trousers / calves / bare feet
      [-1, 1].forEach((sd) => {
        const leg = XL.ribbon([[sd * 19, -206], [sd * 24, -160], [sd * 25, -122]], [40, 42, 42]);
        XL.paint(ctx, leg, C.trou, { sh: [8, 2], lw: 1.6 });
        XL.paint(ctx, XL.curve([[sd * 25 - 22, -130, 'c'], [sd * 25 + 22, -130, 'c'], [sd * 25 + 21, -117, 'c'], [sd * 25 - 21, -117, 'c']]), XL.light(C.trou, 0.1), { lw: 1.4 });
        XD.limb(ctx, [[sd * 25, -120], [sd * 26.5, -78], [sd * 25, -24]], [18, 17, 11.5], C.skin);
        XL.foot(ctx, sd * 25, -22, B.footS, C.skin, 'bare', sd);
      });
      XD.neck(ctx, 0, B.chin, B.shY, B.neckW * 2, C.skin, hu);
      // inner shirt (faded blue 大襟) visible in the cape opening
      XL.paint(ctx, XL.curve([[-32, -336], [32, -336], [36, -230], [30, -190, 'c'], [-30, -190, 'c'], [-36, -230]]), C.shirt, { sh: [8, 3], lw: 1.6, after: (c) => { XL.line(c, [[0, -340], [-10, -326], [-26, -312]], XL.ink(C.shirt), 1.8); XD.folds(c, [[[-14, -280], [-10, -240]], [[16, -270], [12, -220]]], XL.shadow(C.shirt, 0.3), 1.4); } });
      XL.paint(ctx, XL.curve([[-12, -352, 'c'], [12, -352, 'c'], [13, -343, 'c'], [-13, -343, 'c']]), C.shirt, { lw: 1.3 });
      // 簑衣 straw rain cape: one bell over the shoulders, four overlapping rows of straw fringe, open at the front
      const halfW = (y) => (y < -330 ? 14 + (y + 346) / 16 * 36 : y < -312 ? 50 + (y + 330) / 18 * 16 : 66 + (y + 312) / 144 * 28);
      const gapX = (y) => 3 + (y + 346) / 178 * 30;
      const row = (yT, yB, dark, seed) => {
        [1, -1].forEach((sd) => {
          const P = [[sd * gapX(yT), yT, 'c']];
          for (let y = yT; y <= yB - 6; y += 8) P.push([sd * halfW(y), y]);
          P.push([sd * (halfW(yB) + 2), yB, 'c']);
          const n = 12, x0 = halfW(yB), x1 = gapX(yB);
          for (let i = 1; i < n; i++) { const t = i / n, x = x0 + (x1 - x0) * t; P.push([sd * x, yB + (i % 2 ? 5 + ((i * seed) % 5) : -6), 'c']); }
          P.push([sd * x1, yB - 3, 'c']);
          const p = XL.poly(P);
          XL.paint(ctx, p, dark ? C.straw2 : C.straw, {
            sh: [9, 3], lw: 1.5, line: '#4a3a1e', after: (c) => {
              for (let i = 0; i < 22; i++) { const t = (i + 0.5) / 22, xt = gapX(yT) + (halfW(yT) - gapX(yT)) * t, xb = x1 + (x0 - x1) * t; XL.line(c, [[sd * xt, yT], [sd * xb, yB + 4]], XL.rgba(i % 3 ? '#6e5a30' : '#e3cf96', i % 3 ? 0.4 : 0.55), i % 3 ? 0.6 : 0.8); }
              c.fillStyle = XL.rgba('#3a2c14', 0.25); c.fill(XL.poly([[sd * gapX(yT), yT], [sd * halfW(yT), yT], [sd * halfW(yT + 7), yT + 7], [sd * gapX(yT + 7), yT + 7]]));
            },
          });
        });
      };
      // forearms come out of the cape front to hold the water lantern
      [-1, 1].forEach((sd) => {
        XD.sleeve(ctx, [[sd * 30, -290], [sd * 29, -266]], [20, 19], C.shirt, { paint: { sh: [4, 2] } });
        XD.limb(ctx, [[sd * 29, -268], [sd * 28, -254]], [14, 12.5], C.skin);
      });
      row(-226, -166, true, 3); row(-272, -214, false, 2); row(-314, -258, true, 4); row(-346, -298, false, 1);
      // neck tie of the cape
      XL.paint(ctx, XL.ribbon([[-17, -344], [0, -340], [17, -344]], 4), C.cord, { lw: 1 });
      XL.paint(ctx, XL.lock(0, -340, -4, -318, 4, -2), C.cord, { lw: 0.9 });
      XL.paint(ctx, XL.lock(0, -340, 5, -322, 4, 2), C.cord, { lw: 0.9 });
      // sword hilt peeking from under the cape
      XD.swordHilt(ctx, 74, -222, -Math.PI * 0.8, 28, { grip: '#3a2a2a', guard: '#a8834a', tassel: '#c8432b' });
      // the water lantern 水燈 (house-shaped) held in both hands
      const lx = 0, ly = -246;
      XL.glow(ctx, lx, ly - 12, 70, C.glow, 0.5);
      XL.paint(ctx, XL.poly([[lx - 30, ly + 6], [lx + 30, ly + 6], [lx + 27, ly + 14], [lx - 27, ly + 14]]), '#8a6038', { lw: 1.3 }); // raft board
      XL.paint(ctx, XL.poly([[lx - 20, ly - 24], [lx + 20, ly - 24], [lx + 20, ly + 6], [lx - 20, ly + 6]]), C.lantern, {
        sh: [4, 0], lw: 1.4, after: (c) => {
          const g = c.createRadialGradient(lx, ly - 8, 1, lx, ly - 8, 22); g.addColorStop(0, 'rgba(255,240,170,0.95)'); g.addColorStop(1, 'rgba(255,170,80,0)'); c.fillStyle = g; c.fillRect(lx - 22, ly - 26, 44, 34);
          XL.line(c, [[lx - 7, ly - 24], [lx - 7, ly + 6]], XL.rgba('#5a1e14', 0.7), 1.2); XL.line(c, [[lx + 7, ly - 24], [lx + 7, ly + 6]], XL.rgba('#5a1e14', 0.7), 1.2);
          c.save(); c.fillStyle = '#3a1410'; c.font = 'bold 8px "WenQuanYi Zen Hei"'; c.textAlign = 'center'; c.fillText('中', lx, ly - 10); c.fillText('元', lx, ly + 0); c.restore();
        },
      });
      XL.paint(ctx, XL.curve([[lx - 30, ly - 22, 'c'], [lx - 18, ly - 28], [lx - 10, ly - 38], [lx, ly - 44, 'c'], [lx + 10, ly - 38], [lx + 18, ly - 28], [lx + 30, ly - 22, 'c'], [lx, ly - 25]]), C.roof, { lw: 1.4, sh: [3, 1] });
      XL.paint(ctx, XL.ell(lx, ly - 46, 3, 3), '#e2b23a', { lw: 0.8 });
      // hands at the sides of the lantern
      XL.hand(ctx, -27, -254, -0.5, B.handL * 0.82, C.skin, 'fist', true);
      XL.hand(ctx, 27, -254, 0.5, B.handL * 0.82, C.skin, 'fist', false);
      XL.paint(ctx, XL.ribbon([[22, -261], [34, -257]], 2.6), '#c8432b', { lw: 0.8 });
      XD.head(ctx, 0, B.top, hu, F, backHair, frontHair, { tilt: 0.06 });
      // lantern light on the face from below
      if (!opt.back) XL.glow(ctx, 0, B.chin + 4, 40, '#ffa94a', 0.22);
    }
    function back(ctx) {
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(0, -336, 76, 74, 0, 0, Math.PI * 2); ctx.fill(); // 斗笠 hanging on the back
    }
    global.XINGHE_DESIGNS.push({
      id: '03', zh: '水燈仔', en: 'The Water-Lantern Foundling', tag: '民俗寫實', tagEn: 'FOLK-HISTORICAL',
      heads: 6.4, hairNote: '散髮（武俠式改編）', accent: '#ffa94a', accentInk: '#9a5a1e', rimCol: 'rgba(255,200,130,0.9)',
      bg: { top: '#e9eef0', bottom: '#d8d6cb', motif: (ctx, w, h) => XD.motifs.waves(ctx, w, h, '#4a6a80') },
      palette: [['#b49a5e', '簑草', 'coir straw'], ['#8f7646', '舊簑', 'aged straw'], ['#6f8fa6', '褪藍', 'faded blue'], ['#4b5a70', '海褲', 'sea slate'], ['#d2412c', '水燈紅', 'lantern red'], ['#ffb24a', '燈火', 'flame'], ['#edc09c', '膚', 'skin']],
      callouts: [
        { x: -30, y: -400, zh: '濕亂短髮', en: 'wet shaggy hair (fantasy)', side: 'L', ly: 40 },
        { x: -60, y: -270, zh: '簑衣', en: 'three-tier straw rain cape', side: 'L', ly: 200 },
        { x: 0, y: -262, zh: '水燈（慶讚中元）', en: 'house-shaped water lantern', side: 'R', ly: 120 },
        { x: 74, y: -226, zh: '螢火劍柄', en: 'sword under the cape', side: 'R', ly: 230 },
        { x: 25, y: -40, zh: '赤腳', en: 'barefoot on the sand', side: 'R', ly: 380 },
        { x: -25, y: -126, zh: '捲管大褲', en: 'rolled wide trousers', side: 'L', ly: 330 },
      ],
      idea: '把「他是從水燈裡撿來的」穿在身上：八斗子海邊的少年，披著漁家簑衣、捧著一盞亮著的水燈頭，燈火由下往上照亮臉。最柔和的一版——溫順的大眼、安靜的笑，像隨時會被海浪帶走。',
      culture: '依據北臺灣漁村的簑衣（棕櫚／稻草分層編製）、斗笠（背在身後）、捲管大褲赤腳；水燈為雞籠中元祭「放水燈」的屋形水燈頭，寫「慶讚中元」。不留辮的散髮為武俠式改編。',
      model3d: '簑衣做三層錐形殼＋草絲貼圖（不做單根草）；水燈為自發光道具，可作劇情演出時的臉部補光。',
      silNote: '關鍵剪影：三層三角簑衣，背面斗笠圓盤',
      faceNote: '鵝蛋臉・下垂大眼・琥珀瞳・溫和微笑',
      costume: ['濕亂及頸短髮，瀏海遮眉（不留辮，武俠改編）', '三層簑衣（棕草），胸前繩結', '褪色藍大襟內衫', '海藍灰大褲捲到膝下，赤腳', '捧屋形水燈頭（紅紙壁、黑瓦頂、木筏底座、內燃燭）', '斗笠背在身後；螢火劍斜插腰間，劍柄從簑衣下露出；右腕紅繩'],
      systems: '頭像：燈火打底光的臉是最強的劇情頭像（序章／水燈頭回流場景）。地圖精靈：三角簑衣＋手中光源，夜晚地圖自帶光暈。戰鬥精靈：甩開簑衣拔劍；火系技能從水燈燭火延伸。',
      draw, back,
    });
  })();
})(window);
