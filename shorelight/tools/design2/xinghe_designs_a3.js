// 彼岸燈 — design pass v2 — 沈星河 options 04–05
'use strict';
(function (global) {
  const XL = global.XL, XD = global.XD;
  const angTo = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.PI / 2;
  XD.angTo = angTo;
  const lockSet = (arr, o) => arr.map(([x0, y0, x1, y1, w, b]) => XL.lock(x0, y0, x1, y1, w, b, o || { mid: 0.9 }));
  XD.lockSet = lockSet;

  // ================================================================== 04 劍仙迷
  (function () {
    const B = XL.body({ heads: 6.7, sh: 0.98, stance: 0.6 });
    const hu = B.hu;
    const C = { skin: '#e6b089', indigo: '#2f3d6b', inner: '#f1ede2', trou: '#4a443f', wrap: '#ddd5c4', shoe: '#25232a', cape: '#b8322a', capeIn: '#7d1f1d', band: '#d23a2e', hair: '#1f1a1d', sash: '#1c1c22', blade: '#cfd6dc' };
    const F = {
      skin: C.skin, temple: 0.35, cheek: 0.365, jaw: 0.28, jawY: 0.79, chin: 0.075, chinY: 1.0, earS: 1.0, earY: 0.52, shW: 5,
      hairCol: C.hair,
      eye: { x: 0.17, y: 0.6, w: 0.09, h: 0.056, iris: '#7a4220', ir: 0.052, tilt: 0.022, up: 1, lo: 0.58, lashW: 2.7, flick: 0.32, peak: 0.25, look: 0.12 },
      brow: { x0: 0.06, y0: 0.48, x1: 0.28, y1: 0.45, th: 0.034, arch: 0.016 },
      browR: { y0: 0.455, y1: 0.395, arch: 0.04 },
      nose: { type: 'button', y: 0.745, w: 0.042 },
      mouth: { type: 'smirk', y: 0.855, w: 0.085, dx: 0.01 },
      blushA: 0.18,
      faceExtras: (c, ink) => {
        // sticking plaster across the nose (practising sword forms ended badly)
        XL.withT(c, 0.01, 0.665, -0.25, 1, 1, (cc) => {
          XL.paint(cc, XL.curve([[-0.07, -0.018, 'c'], [0.07, -0.018, 'c'], [0.07, 0.018, 'c'], [-0.07, 0.018, 'c']]), '#f3ead6', { lw: 1, sh: [0.8, 0.6], line: '#9a8a70' });
          XL.line(cc, [[-0.02, -0.012], [0.02, 0.012]], '#b8a888', 0.7); XL.line(cc, [[-0.02, 0.012], [0.02, -0.012]], '#b8a888', 0.7);
        });
        XL.line(c, [[-0.25, 0.78], [-0.2, 0.765]], XL.rgba('#c0504a', 0.8), 0.9); XL.line(c, [[-0.245, 0.795], [-0.205, 0.78]], XL.rgba('#c0504a', 0.8), 0.9);
      },
    };
    const backHair = (c) => {
      // headband tails streaming behind the head
      XL.paint(c, XL.curve([[0.3, 0.22], [0.7, 0.1], [1.05, 0.22], [1.45, 0.08], [1.6, 0.16, 'c'], [1.42, 0.2], [1.05, 0.34], [0.7, 0.22], [0.32, 0.32]]), C.band, { lw: 1.4, sh: [3, 2] });
      XL.paint(c, XL.curve([[0.3, 0.26], [0.62, 0.32], [0.95, 0.5], [1.3, 0.48], [1.42, 0.56, 'c'], [1.25, 0.58], [0.92, 0.6], [0.6, 0.4], [0.3, 0.36]]), XL.shadow(C.band, 0.15), { lw: 1.4, sh: [3, 2] });
      const locks = lockSet([[-0.36, 0.3, -0.42, 0.72, 0.2, -0.03], [0.36, 0.3, 0.42, 0.72, 0.2, 0.03]]);
      locks.push(XL.curve([[-0.44, 0.5], [-0.46, 0.08], [-0.3, -0.12], [0, -0.16], [0.3, -0.12], [0.46, 0.08], [0.44, 0.5], [0, 0.4]]));
      XL.paintMass(c, locks, C.hair, { lw: 1.6, sh: [4, 1], hl: false });
    };
    const frontHair = (c) => {
      // topknot bun tied with a red string, spiky loose strands
      XL.paintMass(c, lockSet([[0.02, -0.08, -0.12, -0.42, 0.16, -0.06], [0.04, -0.08, 0.2, -0.38, 0.14, 0.05], [0.0, -0.1, 0.04, -0.47, 0.13, 0.02]]), C.hair, { lw: 1.6, sh: [2, 1], hl: false });
      XL.paint(c, XL.ell(0.02, -0.15, 0.13, 0.1), C.hair, { lw: 1.6, sh: [3, 1] });
      XL.paint(c, XL.ribbon([[-0.08, -0.08], [0.02, -0.06], [0.12, -0.08]], 0.035), '#d23a2e', { lw: 1 });
      const locks = lockSet([
        [-0.32, 0.02, -0.44, 0.48, 0.2, -0.04], [-0.2, -0.04, -0.3, 0.52, 0.2, -0.05], [-0.06, -0.06, -0.12, 0.46, 0.2, -0.03],
        [0.08, -0.06, 0.08, 0.5, 0.2, 0.02], [0.2, -0.04, 0.3, 0.44, 0.19, 0.04], [0.33, 0.0, 0.46, 0.4, 0.18, 0.04],
        [-0.38, 0.08, -0.58, 0.3, 0.12, 0.03], [0.38, 0.06, 0.58, 0.22, 0.12, -0.03], [-0.25, -0.06, -0.42, -0.2, 0.12, 0.03], [0.25, -0.07, 0.4, -0.22, 0.12, -0.03],
        [-0.41, 0.2, -0.45, 0.66, 0.12, -0.03], [0.41, 0.2, 0.45, 0.62, 0.12, 0.03],
      ]);
      locks.push(XL.curve([[-0.43, 0.24], [-0.4, -0.02], [-0.22, -0.13], [0.05, -0.15], [0.3, -0.1], [0.43, 0.06], [0.43, 0.26], [0, 0.12]]));
      c.save(); c.clip(XL.faceShape(F)); c.fillStyle = XL.skinShadow(C.skin);
      c.fill(XL.curve([[-0.45, 0.2], [-0.4, 0.5], [-0.28, 0.42], [-0.12, 0.5], [0.0, 0.4], [0.08, 0.52], [0.3, 0.46], [0.45, 0.42], [0.45, 0.2]])); c.restore();
      XL.paintMass(c, locks, C.hair, {
        lw: 1.7, sh: [3, 2], hl: false, after: (cc) => XD.shine(cc, 0.04, -0.34, 0.36, XL.rgba('#8a86a6', 0.5), {}),
      });
      // headband 抹額 across the forehead, knot at the right temple
      XL.paint(c, XL.curve([[-0.45, 0.25], [0, 0.2], [0.45, 0.25], [0.45, 0.33], [0, 0.29], [-0.45, 0.33]]), C.band, { lw: 1.5, sh: [3, 1.5], after: (cc) => XL.line(cc, [[-0.44, 0.275], [0, 0.23], [0.44, 0.275]], XL.light(C.band, 0.3), 0.8) });
      XL.paint(c, XL.ell(0.44, 0.28, 0.06, 0.055), XL.shadow(C.band, 0.08), { lw: 1.3 });
      // a few strands falling over the band
      XL.paintMass(c, lockSet([[-0.16, 0.14, -0.22, 0.46, 0.09, -0.02], [0.14, 0.14, 0.18, 0.43, 0.08, 0.02]]), C.hair, { lw: 1.4, sh: [1, 1], hl: false });
    };
    function draw(ctx) {
      // cape cut from the shop's old banner, tied at the neck and billowing to the right
      const cape = XL.curve([[-44, -340], [-60, -300], [-70, -230], [-68, -170, 'c'], [-20, -166], [40, -150], [92, -122, 'c'], [116, -150], [148, -132, 'c'], [168, -168], [190, -160, 'c'], [178, -222], [150, -282], [104, -324], [46, -342]]);
      XL.paint(ctx, cape, C.cape, {
        sh: [12, 4], lw: 1.8, after: (c) => {
          XD.folds(c, [[[70, -320], [104, -250], [118, -160]], [[110, -300], [148, -230], [160, -170]], [[-56, -280], [-62, -190]]], XL.shadow(C.cape, 0.3), 2.2);
          c.save(); c.translate(132, -262); c.rotate(-0.42); c.fillStyle = '#1b1012'; c.font = 'bold 19px "WenQuanYi Zen Hei"'; c.textAlign = 'center';
          ['陳', '記', '燈', '籠'].forEach((ch, i) => c.fillText(ch, 0, i * 21)); c.restore();
          // turned-up lining at the hem
          c.fillStyle = C.capeIn; c.fill(XL.curve([[100, -140], [116, -152], [148, -134, 'c'], [130, -126], [112, -128]]));
        },
      });
      // legs: trousers bloused over leg wraps, cloth shoes, wide heroic stance
      [-1, 1].forEach((sd) => {
        XD.legWrap(ctx, [[sd * 33, -132], [sd * 37, -80], [sd * 40, -30]], [23, 19, 14], C.wrap, { n: 8 });
        XL.paint(ctx, XL.ribbon([[sd * 34, -78], [sd * 39, -36]], 2.6), C.band, { lw: 0.8 });
        const leg = XL.ribbon([[sd * 18, -214], [sd * 28, -165], [sd * 34, -126]], [44, 46, 36], {});
        XL.paint(ctx, leg, C.trou, { sh: [8, 2], lw: 1.6, after: (c) => XD.folds(c, [[[sd * 16, -180], [sd * 26, -140], [sd * 30, -128]], [[sd * 40, -170], [sd * 44, -140]]], XL.light(C.trou, 0.15), 1.3) });
        XL.foot(ctx, sd * 40, -24, B.footS, C.skin, 'cloth', sd, { col: C.shoe });
      });
      // upper sleeves behind the body
      XD.sleeve(ctx, [[-44, -332], [-62, -302], [-76, -278]], [20, 27, 26], C.indigo, { round: true, paint: { sh: [6, 2] } });
      XD.sleeve(ctx, [[44, -332], [68, -300], [86, -278]], [20, 27, 26], C.indigo, { round: true, paint: { sh: [6, 2] } });
      XD.neck(ctx, 0, B.chin, B.shY, B.neckW * 2, C.skin, hu);
      // white undershirt 汗衫
      XL.paint(ctx, XL.curve([[-30, -340], [-12, -343], [0, -336], [12, -343], [30, -340], [34, -240], [-34, -240]]), C.inner, { sh: [6, 2], lw: 1.5, after: (c) => XD.folds(c, [[[-8, -310], [-4, -270]], [[10, -300], [8, -262]]], XL.shadow(C.inner, 0.2), 1.3) });
      // open 對襟 jacket: two panels
      [-1, 1].forEach((sd) => {
        const pnl = XL.curve([[sd * 12, -350], [sd * 32, -343], [sd * 50, -334], [sd * 57, -322, 'c'], [sd * 55, -294], [sd * 55, -254], [sd * 60, -206], [sd * 63, -194, 'c'], [sd * 28, -190], [sd * 24, -192, 'c'], [sd * 26, -250], [sd * 20, -300], [sd * 10, -338]]);
        XL.paint(ctx, pnl, C.indigo, { sh: [sd > 0 ? 11 : 5, 4], lw: 1.8, after: (c) => { XL.line(c, [[sd * 11, -338], [sd * 20, -300], [sd * 26, -250], [sd * 25, -193]], XL.light(C.indigo, 0.28), 2.2); XD.folds(c, [[[sd * 40, -300], [sd * 36, -262]], [[sd * 44, -228], [sd * 50, -200]]], XL.shadow(C.indigo, 0.3), 1.6); } });
        [-318, -290].forEach((y, i) => XL.knot(ctx, sd * (22 + i * 2.5), y, 2, '#1f2a4a'));
      });
      // sash with the empty scabbard tucked in
      XL.paint(ctx, XL.ribbon([[30, -250], [64, -196], [100, -150]], [7, 7, 6], { round: true }), '#3a2626', { lw: 1.3, sh: [2, 0], after: (c) => XL.line(c, [[86, -168], [96, -155]], '#b8893a', 2) });
      XL.paint(ctx, XL.curve([[-58, -256, 'c'], [0, -252], [58, -256, 'c'], [59, -238, 'c'], [0, -235], [-59, -238, 'c']]), C.sash, { lw: 1.5, sh: [6, 2] });
      XL.paint(ctx, XL.lock(-30, -244, -38, -204, 10, -3), C.sash, { lw: 1.2 });
      XL.paint(ctx, XL.lock(-24, -244, -22, -210, 9, 3), C.sash, { lw: 1.2 });
      // sword 螢火 resting on the right shoulder
      const g = [-48, -312], dir = [-0.7, -0.72];
      const tip = [g[0] + dir[0] * 158, g[1] + dir[1] * 158];
      XL.paint(ctx, XL.curve([[g[0] - 3.5, g[1] + 2.5, 'c'], [tip[0] - 1, tip[1] + 3, 'c'], [tip[0], tip[1], 'c'], [tip[0] + 3, tip[1] - 1, 'c'], [g[0] + 3, g[1] - 3.5, 'c']]), C.blade, { lw: 1.3, sh: [1.5, 1], after: (c) => XL.line(c, [[g[0], g[1]], [tip[0] + 1, tip[1] + 1]], '#8a98a8', 0.8) });
      XD.swordHilt(ctx, g[0], g[1], angTo(g, tip) + Math.PI, 30, { grip: '#3a2626', guard: '#c79a3a', tassel: '#d23a2e' });
      // right arm: forearm across the chest, fist on the grip
      XD.limb(ctx, [[-76, -276], [-60, -286], [-40, -294]], [16, 15, 13], C.skin);
      XL.paint(ctx, XL.ribbon([[-82, -284], [-70, -270]], 13), XL.light(C.indigo, 0.08), { lw: 1.3 });
      XL.hand(ctx, -39, -297, angTo([-76, -276], [-40, -294]), B.handL * 0.85, C.skin, 'fist', false);
      XL.paint(ctx, XL.ribbon([[-56, -296], [-52, -282]], 2.6), C.band, { lw: 0.8 });
      // left arm: fist on the hip
      XL.paint(ctx, XL.ribbon([[78, -286], [92, -272]], 13), XL.light(C.indigo, 0.08), { lw: 1.3 });
      XD.limb(ctx, [[88, -276], [78, -258], [64, -242]], [16, 15, 13], C.skin);
      XL.hand(ctx, 62, -240, angTo([88, -276], [64, -242]), B.handL * 0.85, C.skin, 'fist', true);
      XD.head(ctx, 0, B.top, hu, F, backHair, frontHair, { tilt: -0.07 });
    }
    function back(ctx) {
      ctx.fillStyle = '#000';
      ctx.fill(XL.curve([[-56, -340], [56, -340], [80, -240], [70, -150], [-70, -150], [-80, -240]]));
    }
    global.XINGHE_DESIGNS.push({
      id: '04', zh: '劍仙迷', en: 'The Storyteller\'s Biggest Fan', tag: '武俠喜劇', tagEn: 'WUXIA · COMIC',
      heads: 6.7, hairNote: '短髻散髮（武俠式改編）', accent: '#d23a2e', accentInk: '#8c2420', figX: -10,
      bg: { top: '#f4ece0', bottom: '#e8d6c2', motif: (ctx, w, h) => XD.motifs.clouds(ctx, w, h, '#8c2420') },
      palette: [['#2f3d6b', '靛藍', 'indigo'], ['#f1ede2', '汗衫白', 'undershirt'], ['#b8322a', '招牌紅', 'banner red'], ['#4a443f', '灰褐褲', 'umber'], ['#ddd5c4', '綁腿', 'leg wrap'], ['#e6b089', '膚', 'skin'], ['#1f1a1d', '髮', 'hair']],
      callouts: [
        { x: -4, y: -446, zh: '短髻＋紅繩', en: 'messy topknot (canon)', side: 'L', ly: 28 },
        { x: -26, y: -395, zh: '抹額', en: 'red headband, long tails', side: 'L', ly: 76 },
        { x: -120, y: -400, zh: '螢火扛肩', en: 'sword on the shoulder', side: 'L', ly: 140 },
        { x: 140, y: -230, zh: '招牌改披風', en: 'cape cut from the shop banner', side: 'R', ly: 330 },
        { x: 30, y: -290, zh: '敞襟短衫＋汗衫', en: 'open jacket, undershirt', side: 'R', ly: 120 },
        { x: -36, y: -70, zh: '綁腿・布鞋', en: 'leg wraps, cloth shoes', side: 'L', ly: 360 },
      ],
      idea: '說書聽太多的「自封劍仙」：把燈籠舖舊招牌剪成披風、紅布條綁成抹額，扛劍叉腰擺英雄架式——鼻樑上卻貼著練劍摔出來的膏藥。說大話怕小事，但這股傻勁就是他關鍵時刻的勇氣。',
      culture: '底子仍是清代閩南青年：靛藍對襟短衫、汗衫、大褲紮綁腿、布鞋；「抹額＋披風」是他模仿說書人口中劍仙、國姓爺的自製戲服（參考歌仔戲武生行頭），屬喜劇性改編。',
      model3d: '披風為布料模擬主體（字樣為貼圖）；抹額飄帶兩條骨骼鏈；劍可換手扛肩／出鞘兩種待機。',
      silNote: '關鍵剪影：側飄披風＋扛劍斜線＋叉腰三角',
      faceNote: '尖下巴・上挑眼・挑眉壞笑・鼻貼',
      costume: ['亂短髮紮小髻（紅繩），原設定髮型的延伸', '紅布抹額，兩條長飄帶', '燈籠舖舊招牌（陳記燈籠）改成的紅披風，頸前打結', '靛藍對襟短衫敞開、白汗衫、黑腰帶插空劍鞘', '灰褐大褲紮進白綁腿（紅綁帶）、黑布鞋', '螢火出鞘扛在右肩；右腕紅繩'],
      systems: '頭像：挑眉壞笑＋鼻貼，喜劇表情差分最多。地圖精靈：披風飄動與扛劍讓主角在人群中最醒目。戰鬥精靈：英雄式開場（甩披風）、受擊時狼狽差分，與「說大話怕小事」的個性連動。',
      draw, back,
    });
  })();

  // ================================================================== 05 雨夜九份
  (function () {
    const B = XL.body({ heads: 7.2, sh: 0.9, stance: 0.38 });
    const hu = B.hu;
    const C = { skin: '#e9bc98', gown: '#566a7c', lining: '#c9d3d9', trou: '#25242a', sash: '#1d1c22', umb: '#c8502c', rib: '#6b4a2a', hair: '#1b181c', paper: '#e9c983', wood: '#9a6a3c', red: '#c8432b' };
    const F = {
      skin: C.skin, temple: 0.34, cheek: 0.35, jaw: 0.27, jawY: 0.8, chin: 0.1, chinY: 1.0, earS: 0.95, earY: 0.52, shW: 5,
      hairCol: C.hair,
      eye: { x: 0.17, y: 0.6, w: 0.094, h: 0.046, iris: '#4a2c1a', ir: 0.046, tilt: 0.014, up: 0.85, lo: 0.5, lashW: 2.6, crease: false, peak: 0.25, flick: 0.12 },
      brow: { x0: 0.06, y0: 0.475, x1: 0.29, y1: 0.462, th: 0.026, arch: 0.008 },
      nose: { type: 'bridge', y: 0.75, w: 0.044 },
      mouth: { type: 'smile', y: 0.86, w: 0.06 },
      blushA: 0.14,
      skinExtras: (c) => {
        const hl = XL.curve([[-0.5, -0.1, 'c'], [0.5, -0.1, 'c'], [0.5, 0.42, 'c'], [0.35, 0.4], [0.3, 0.24], [0.12, 0.2], [0, 0.215], [-0.12, 0.2], [-0.3, 0.24], [-0.35, 0.4], [-0.5, 0.42, 'c']]);
        c.fillStyle = XL.rgba('#76849a', 0.32); c.fill(hl);
      },
    };
    const backHair = (c) => {
      // crown hair gathered into the queue (behind the shaved dome)
      XL.paint(c, XL.curve([[-0.28, 0.1], [-0.22, -0.08], [0, -0.13], [0.22, -0.08], [0.28, 0.1], [0, 0.04]]), C.hair, { lw: 1.6, sh: [3, 1], after: (cc) => XD.shine(cc, -0.05, -0.18, 0.18, XL.rgba('#8a86a6', 0.6), { n: 3, curve: 0.04 }) });
    };
    function draw(ctx, opt = {}) {
      // 油紙傘 oil-paper umbrella seen from beneath, tilted back over the shoulder
      const hub = [44, -376], rx = 108, ry = 64, rot = -0.3;
      const N = 22, rimPts = [];
      for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; const x = Math.cos(a) * rx, y = Math.sin(a) * ry; rimPts.push([hub[0] + x * Math.cos(rot) - y * Math.sin(rot), hub[1] + x * Math.sin(rot) + y * Math.cos(rot)]); }
      const canopy = [];
      rimPts.forEach((p, i) => { const q = rimPts[(i + 1) % N]; canopy.push([p[0], p[1], 'c']); canopy.push([(p[0] + q[0]) / 2 * 0.94 + hub[0] * 0.06, (p[1] + q[1]) / 2 * 0.94 + hub[1] * 0.06]); });
      const cp = XL.curve(canopy);
      XL.paint(ctx, cp, C.umb, {
        sh: [8, 6], lw: 1.8, line: '#4a1a10', after: (c) => {
          const g = c.createRadialGradient(hub[0], hub[1], 4, hub[0], hub[1], 110); g.addColorStop(0, 'rgba(255,214,150,0.55)'); g.addColorStop(0.6, 'rgba(255,170,110,0.15)'); g.addColorStop(1, 'rgba(90,20,10,0.25)'); c.fillStyle = g; c.fill(cp);
          rimPts.forEach((p) => XL.line(c, [hub, p], XL.rgba(C.rib, 0.85), 1.2));
          // rim band + painted plum sprays
          c.save(); c.strokeStyle = XL.rgba('#7a2414', 0.6); c.lineWidth = XL.lw(c, 5); c.stroke(cp); c.restore();
          [[0.55, 0.35], [-0.6, -0.1], [0.1, -0.7]].forEach(([u, v]) => { const x = hub[0] + u * rx * 0.8, y = hub[1] + v * ry * 0.8; [[0, 0], [5, -3], [-4, 4], [8, 4]].forEach(([dx, dy]) => { c.fillStyle = XL.rgba('#f5e6c8', 0.75); c.beginPath(); c.arc(x + dx, y + dy, 2.6, 0, 7); c.fill(); }); XL.line(c, [[x - 12, y + 6], [x, y], [x + 10, y - 6]], XL.rgba('#3a1a10', 0.6), 1); });
        },
      });
      // the coloured thread ring near the hub (穿線)
      [['#2f6a8a', 30], ['#d8b040', 26], ['#3a8a5a', 22]].forEach(([col, r]) => { ctx.save(); ctx.translate(hub[0], hub[1]); ctx.rotate(rot); ctx.strokeStyle = col; ctx.lineWidth = XL.lw(ctx, 2.2); ctx.beginPath(); ctx.ellipse(0, 0, r, r * ry / rx, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); });
      XL.paint(ctx, XL.ell(hub[0], hub[1], 7, 5, rot), '#3a2a20', { lw: 1.2 });
      // sword hanging behind the gown at the left hip
      XL.paint(ctx, XL.ribbon([[44, -244], [62, -170], [74, -116]], [6, 6, 5], { round: true }), '#2e2626', { lw: 1.2, sh: [2, 0] });
      // trousers tied at the ankle + clogs
      [-1, 1].forEach((sd) => {
        XL.paint(ctx, XL.ribbon([[sd * 16, -214], [sd * 21, -120], [sd * 22, -38]], [36, 32, 24]), C.trou, { sh: [6, 1], lw: 1.6, after: (c) => XD.folds(c, [[[sd * 12, -150], [sd * 16, -90], [sd * 18, -50]]], XL.light(C.trou, 0.18), 1.3) });
        XL.paint(ctx, XL.curve([[sd * 22 - 12, -44, 'c'], [sd * 22 + 12, -44, 'c'], [sd * 22 + 11, -34, 'c'], [sd * 22 - 11, -34, 'c']]), '#3a3a44', { lw: 1.2 });
        XL.paint(ctx, XL.ribbon([[sd * 22, -36], [sd * 22, -24]], 13), C.skin, { lw: 1.2 });
        XL.foot(ctx, sd * 22, -26, B.footS * 0.95, C.skin, 'clog', sd, { wood: C.wood });
      });
      // upper sleeves behind the gown
      XD.sleeve(ctx, [[-42, -334], [-56, -306], [-64, -280]], [18, 24, 24], C.gown, { round: true, paint: { sh: [6, 2] } });
      XD.sleeve(ctx, [[42, -334], [58, -306], [66, -284]], [18, 24, 24], C.gown, { round: true, paint: { sh: [6, 2] } });
      XD.neck(ctx, 0, B.chin, B.shY, B.neckW * 2, C.skin, hu);
      // 長衫 long gown, front corner hitched into the sash
      const gown = XL.curve([[0, -351], [12, -352], [30, -346], [46, -338], [53, -326, 'c'], [50, -298], [47, -254], [52, -206], [58, -150], [63, -96, 'c'], [30, -92], [4, -94, 'c'], [-10, -118], [-30, -160], [-50, -206, 'c'], [-52, -216], [-47, -254], [-50, -298], [-53, -326, 'c'], [-46, -338], [-30, -346], [-12, -352]]);
      XL.paint(ctx, gown, C.gown, {
        sh: [11, 4], lw: 1.8,
        after: (c) => {
          const flap = [[2, -350], [-6, -341], [-22, -332], [-40, -316], [-48, -298], [-49, -254]];
          XL.line(c, flap, '#2a3440', 2.4);
          XD.folds(c, [[[34, -300], [30, -264]], [[30, -200], [36, -140], [40, -100]], [[48, -190], [54, -110]], [[14, -190], [18, -120]], [[-20, -200], [-6, -140]]], XL.shadow(C.gown, 0.3), 1.7);
          // turned-up lining along the hitched edge
          c.fillStyle = C.lining; c.fill(XL.ribbon([[2, -98], [-12, -122], [-32, -164], [-50, -208]], [6, 8, 9, 7]));
          XL.line(c, [[59, -150], [62, -98]], XL.ink(C.gown), 1.4); // side slit
        },
      });
      [[-3, -346], [-22, -333], [-40, -317], [-48, -296], [-49, -270]].forEach(([x, y]) => XL.knot(ctx, x, y, 2, '#2a3440', 4.5));
      XL.paint(ctx, XL.curve([[-13, -359, 'c'], [0, -360], [13, -359, 'c'], [14, -350, 'c'], [-14, -350, 'c']]), C.gown, { lw: 1.4 });
      XL.paint(ctx, XL.curve([[-50, -258, 'c'], [0, -254], [50, -258, 'c'], [51, -244, 'c'], [0, -241], [-51, -244, 'c']]), C.sash, { lw: 1.5, sh: [5, 2] });
      // tucked corner bunched at the sash
      XL.paint(ctx, XL.curve([[-56, -258], [-40, -262], [-28, -250], [-34, -236], [-52, -232]]), C.gown, { lw: 1.4, sh: [3, 2], after: (c) => XD.folds(c, [[[-50, -254], [-36, -244]]], XL.shadow(C.gown, 0.3), 1.2) });
      XD.swordHilt(ctx, 44, -250, Math.PI * 0.92, 28, { grip: '#2e2626', guard: '#a8834a', tassel: C.red });
      // the queue over the right shoulder, red silk tassel
      XD.braid(ctx, [[-16, -358], [-30, -340], [-34, -310], [-30, -274], [-28, -250]], 11, C.hair, { tassel: C.red, tasselL: 26 });
      // left hand: umbrella shaft
      XL.paint(ctx, XL.ribbon([hub, [38, -300], [34, -236]], 4), '#7a5432', { lw: 1.2, sh: [1, 0] });
      XL.paint(ctx, XL.ribbon([[34, -246], [33, -226]], 6.5, { round: true }), '#3a2a20', { lw: 1 });
      XL.paint(ctx, XL.ribbon([[70, -290], [56, -278]], 15), C.lining, { lw: 1.2 });
      XD.limb(ctx, [[60, -282], [50, -272], [42, -266]], [14, 13, 12], C.skin);
      XL.hand(ctx, 38, -268, angTo([60, -282], [42, -266]) + 0.4, B.handL * 0.85, C.skin, 'fist', false);
      // right hand: lantern on a short bamboo stick
      XL.paint(ctx, XL.ribbon([[-64, -282], [-62, -268]], 15), C.lining, { lw: 1.2 });
      XD.limb(ctx, [[-64, -272], [-68, -252], [-70, -238]], [14, 13, 12], C.skin);
      XL.paint(ctx, XL.ribbon([[-62, -226], [-122, -252]], 3.2, { round: true }), '#b98c4c', { lw: 1 });
      XD.lantern(ctx, -118, -250, 16, { paper: C.paper, hang: 8, char: '陳', charCol: C.red, lit: true, glow: '#ffb24a', tall: 1.15 });
      XL.hand(ctx, -70, -238, -0.15, B.handL * 0.85, C.skin, 'fist', true);
      XL.paint(ctx, XL.ribbon([[-76, -246], [-62, -244]], 2.6), C.red, { lw: 0.8 });
      XD.head(ctx, 0, B.top, hu, F, backHair, null, { tilt: 0.05 });
    }
    function back(ctx) {
      ctx.fillStyle = '#000';
      ctx.fill(XL.ribbon([[0, -380], [2, -300], [0, -230]], [10, 8, 6], { round: true }));
    }
    global.XINGHE_DESIGNS.push({
      id: '05', zh: '雨夜九份', en: 'Rain over Jiufen', tag: '寫實風格化', tagEn: 'STYLISED HISTORICAL',
      heads: 7.2, hairNote: '薙髮留辮・辮垂胸前（歷史）', accent: '#c8502c', accentInk: '#7a2e1c', figX: -16, auraX: 10,
      bg: { top: '#e3e6e8', bottom: '#cfd0cc', motif: (ctx, w, h) => XD.motifs.rain(ctx, w, h, '#2a3a4a') },
      palette: [['#566a7c', '石青', 'slate blue'], ['#c9d3d9', '月白裡', 'moon-white'], ['#25242a', '烏褲', 'black'], ['#c8502c', '傘朱', 'vermilion'], ['#9a6a3c', '柴屐', 'clog wood'], ['#e9bc98', '膚', 'skin'], ['#1b181c', '髮', 'hair']],
      callouts: [
        { x: 120, y: -390, zh: '油紙傘', en: 'oil-paper umbrella', side: 'R', ly: 26 },
        { x: -30, y: -300, zh: '辮子垂胸', en: 'queue over the shoulder', side: 'L', ly: 70 },
        { x: -118, y: -222, zh: '提燈送貨', en: 'delivering a lit lantern', side: 'L', ly: 180 },
        { x: 20, y: -290, zh: '長衫・大襟', en: 'side-fastened long gown', side: 'R', ly: 210 },
        { x: -30, y: -160, zh: '衫角掖腰', en: 'hem hitched into the sash', side: 'L', ly: 300 },
        { x: 22, y: -14, zh: '柴屐', en: 'wooden clogs for rain', side: 'R', ly: 400 },
      ],
      idea: '九份是雨城。這一版是雨夜送燈的「可靠哥哥」：細長身形、單眼皮、安靜的笑，撐著朱紅油紙傘、提著燈走過石階；長衫一角掖進腰帶好走路。最沉穩、最有清代街景味道的一款。',
      culture: '清代男子日常長衫（大襟右衽、立領、側開衩）、勞動時把衫角掖進腰帶；辮子垂於胸前、尾繫紅絲辮穗；雨天穿柴屐（木屐）；油紙傘為閩粵常見雨具，傘骨內圈穿彩線。',
      model3d: '傘為可開合道具（傘骨 22 根用貼圖＋少量幾何）；辮子骨骼鏈；長衫下襬布料模擬、掖起的衣角為固定形。',
      silNote: '關鍵剪影：傘面大橢圓＋長衫＋垂辮',
      faceNote: '瓜子臉・單眼皮・挺鼻・沉靜微笑',
      costume: ['薙髮留辮，辮子從右肩垂到胸前，紅絲辮穗', '石青色長衫（大襟右衽、立領、側開衩、月白內裡），右前襟掖進腰帶', '黑腰帶、烏褲紮腳口', '柴屐（兩齒木屐）', '朱紅油紙傘（梅花紋、彩線穿骨）', '竹竿提燈（陳記）；螢火劍掛在左腰後'],
      systems: '頭像：單眼皮與垂辮，最成熟的一張臉。地圖精靈：傘可作為雨天地圖的專屬外觀（九份多雨）。戰鬥精靈：收傘→拔劍；傘也可設計成格擋動作。',
      draw, back,
    });
  })();
})(window);
