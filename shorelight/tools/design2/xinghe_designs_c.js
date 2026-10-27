// 彼岸燈 — design pass v2 — 沈星河 options 08–10
'use strict';
(function (global) {
  const XL = global.XL, XD = global.XD;
  const angTo = XD.angTo, lockSet = XD.lockSet;

  // ================================================================== 08 紙燈甲
  (function () {
    const B = XL.body({ heads: 6.8, sh: 1.0, stance: 0.55 });
    const hu = B.hu;
    const C = { skin: '#e8b48a', black: '#24232a', paper: '#efe2c4', bamboo: '#b48a4a', red: '#c33a2a', glow: '#ffd27a', hair: '#1c181c', shoe: '#1f1e24', blade: '#d6dce2' };
    const F = {
      skin: C.skin, temple: 0.365, cheek: 0.385, jaw: 0.335, jawY: 0.82, chin: 0.145, chinY: 1.0, earS: 1.0, earY: 0.52, shW: 5,
      hairCol: C.hair,
      eye: { x: 0.175, y: 0.6, w: 0.092, h: 0.066, iris: '#c06a20', ir: 0.062, tilt: 0.006, up: 1, lo: 0.7, lashW: 2.5, peak: 0.1, glowIris: '#ffcf6a' },
      brow: { x0: 0.06, y0: 0.47, x1: 0.285, y1: 0.43, th: 0.042, arch: 0.01 },
      nose: { type: 'broad', y: 0.75, w: 0.05 },
      mouth: { type: 'grin', y: 0.865, w: 0.09 },
      blushA: 0.18,
      skinExtras: (c) => { c.fillStyle = XL.rgba('#3a3040', 0.45); c.fill(XL.curve([[-0.06, 0.93], [0.03, 0.92], [0.04, 0.95], [-0.04, 0.96]])); },
    };
    const backHair = (c) => {
      const locks = lockSet([[-0.36, 0.3, -0.44, 0.64, 0.2, -0.03], [0.36, 0.3, 0.44, 0.64, 0.2, 0.03]]);
      locks.push(XL.curve([[-0.45, 0.46], [-0.47, 0.06], [-0.32, -0.14], [0, -0.18], [0.32, -0.14], [0.47, 0.06], [0.45, 0.46], [0, 0.36]]));
      XL.paintMass(c, locks, C.hair, { lw: 1.6, sh: [4, 1], hl: false });
    };
    const frontHair = (c) => {
      // topknot wrapped in red lantern paper (a tiny lantern on his head)
      XL.paint(c, XL.curve([[-0.11, -0.12, 'c'], [-0.13, -0.3], [-0.1, -0.46, 'c'], [0.1, -0.46, 'c'], [0.13, -0.3], [0.11, -0.12, 'c']]), C.red, {
        lw: 1.5, sh: [3, 1], after: (cc) => { [-0.17, -0.26, -0.35].forEach((y) => XL.line(cc, [[-0.13, y], [0, y + 0.02], [0.13, y]], XL.rgba('#5a1410', 0.6), 1)); },
      });
      XL.paint(c, XL.curve([[-0.12, -0.5, 'c'], [0.12, -0.5, 'c'], [0.12, -0.44, 'c'], [-0.12, -0.44, 'c']]), C.black, { lw: 1.2 });
      XL.paint(c, XL.lock(0, -0.5, 0.02, -0.66, 0.06, 0.02), C.hair, { lw: 1.1 });
      const locks = lockSet([
        [-0.3, 0.0, -0.4, 0.36, 0.22, -0.04], [-0.16, -0.04, -0.22, 0.4, 0.22, -0.03], [-0.02, -0.06, -0.02, 0.36, 0.22, 0.02],
        [0.12, -0.05, 0.18, 0.4, 0.22, 0.03], [0.26, -0.02, 0.38, 0.36, 0.22, 0.04],
        [-0.36, 0.06, -0.6, 0.1, 0.14, 0.03], [0.36, 0.06, 0.6, 0.08, 0.14, -0.03], [-0.42, 0.16, -0.5, 0.48, 0.12, -0.02], [0.42, 0.16, 0.5, 0.48, 0.12, 0.02],
      ]);
      locks.push(XL.curve([[-0.44, 0.22], [-0.41, -0.04], [-0.22, -0.15], [0.05, -0.16], [0.3, -0.11], [0.44, 0.04], [0.44, 0.24], [0, 0.1]]));
      c.save(); c.clip(XL.faceShape(F)); c.fillStyle = XL.skinShadow(C.skin);
      c.fill(XL.curve([[-0.46, 0.2], [-0.4, 0.42], [-0.22, 0.44], [-0.02, 0.4], [0.18, 0.44], [0.38, 0.4], [0.46, 0.2]])); c.restore();
      XL.paintMass(c, locks, C.hair, { lw: 1.7, sh: [3, 2], hl: false, after: (cc) => XD.shine(cc, 0.03, -0.36, 0.36, XL.rgba('#8a86a6', 0.5), {}) });
    };
    // hexagonal lantern pauldron
    const pauldron = (ctx, x, y, rot) => XL.withT(ctx, x, y, rot, 1, 1, (c) => {
      const hex = XL.poly([[-24, -16], [-13, -28], [13, -28], [24, -16], [24, 16], [13, 28], [-13, 28], [-24, 16]]);
      XL.glow(c, 0, 0, 44, '#ffb24a', 0.35);
      XL.paint(c, hex, C.paper, {
        sh: [7, 2], lw: 1.8, line: '#4a3a22', after: (cc) => {
          const g = cc.createRadialGradient(-3, 0, 2, 0, 0, 30); g.addColorStop(0, 'rgba(255,236,170,0.95)'); g.addColorStop(1, 'rgba(255,190,110,0.1)'); cc.fillStyle = g; cc.fill(hex);
          [[-13, -28, -13, 28], [13, -28, 13, 28], [-24, -16, 24, -16], [-24, 16, 24, 16]].forEach(([a, b, d, e]) => XL.line(cc, [[a, b], [d, e]], C.bamboo, 2.2));
          // paper-cut flame flower
          cc.fillStyle = C.red; [0, 1, 2, 3].forEach((k) => { cc.save(); cc.rotate(k * Math.PI / 2); cc.fill(XL.lock(0, 0, 0, -10, 6, 0)); cc.restore(); });
          cc.beginPath(); cc.arc(0, 0, 2.6, 0, 7); cc.fillStyle = '#ffe9b0'; cc.fill();
        },
      });
      XL.paint(c, XL.curve([[-15, -34, 'c'], [15, -34, 'c'], [15, -27, 'c'], [-15, -27, 'c']]), C.black, { lw: 1.3 });
      XL.paint(c, XL.curve([[-15, 27, 'c'], [15, 27, 'c'], [15, 34, 'c'], [-15, 34, 'c']]), C.black, { lw: 1.3 });
      XL.paint(c, XL.lock(0, 34, 2, 52, 8, 1, { mid: 1, tipW: 2 }), C.red, { lw: 1 });
    });
    function draw(ctx) {
      // legs: black wide trousers with red cross-ties, cloth shoes
      [-1, 1].forEach((sd) => {
        XL.paint(ctx, XL.ribbon([[sd * 20, -214], [sd * 32, -140], [sd * 38, -40]], [44, 42, 26]), C.black, {
          sh: [8, 2], lw: 1.6, after: (c) => {
            XD.folds(c, [[[sd * 16, -190], [sd * 26, -150]], [[sd * 42, -170], [sd * 46, -140]]], XL.light(C.black, 0.18), 1.3);
            for (let i = 0; i < 4; i++) { const y = -120 + i * 22; XL.line(c, [[sd * 38 - 16, y], [sd * 38 + 16, y + 18]], C.red, 2.2); XL.line(c, [[sd * 38 + 16, y], [sd * 38 - 16, y + 18]], C.red, 2.2); }
          },
        });
        XL.foot(ctx, sd * 40, -26, B.footS, C.skin, 'cloth', sd, { col: C.shoe });
      });
      // black under-jacket sleeves (upper arms)
      XD.sleeve(ctx, [[-46, -330], [-66, -296], [-76, -266]], [20, 26, 24], C.black, { round: true, paint: { sh: [6, 2] } });
      XD.sleeve(ctx, [[46, -330], [66, -296], [76, -266]], [20, 26, 24], C.black, { round: true, paint: { sh: [6, 2] } });
      XD.neck(ctx, 0, B.chin, B.shY, B.neckW * 2.2, C.skin, hu);
      XL.paint(ctx, XL.curve(XL.sym([[0, -346], [14, -347], [34, -341], [52, -332], [58, -320, 'c'], [56, -290], [54, -250], [56, -214, 'c'], [0, -210]])), C.black, { sh: [10, 4], lw: 1.8 });
      // paper-lantern vest: cream paper over bamboo ribs, red 窗花 medallion
      const vest = XL.curve(XL.sym([[0, -338], [18, -344], [38, -336], [46, -310], [46, -270], [44, -234, 'c'], [0, -230]]));
      XL.paint(ctx, vest, C.paper, {
        sh: [10, 3], lw: 1.8, line: '#4a3a22', after: (c) => {
          const g = c.createRadialGradient(0, -284, 4, 0, -284, 60); g.addColorStop(0, 'rgba(255,226,150,0.6)'); g.addColorStop(1, 'rgba(255,200,120,0)'); c.fillStyle = g; c.fill(vest);
          for (let y = -326; y < -232; y += 12) XL.line(c, [[-48, y + 4], [0, y], [48, y + 4]], XL.rgba(C.bamboo, 0.9), 1.4);
          XL.paint(c, XL.ell(0, -286, 20, 20), C.red, {
            lw: 1.4, sh: [2, 1], after: (cc) => {
              cc.fillStyle = C.paper; [[-8, -294], [0, -294], [8, -294], [-8, -286], [8, -286], [-8, -278], [0, -278], [8, -278]].forEach(([x, y]) => cc.fillRect(x - 2.6, y - 2.6, 5.2, 5.2));
              cc.fillStyle = '#ffe9b0'; cc.fill(XL.lock(0, -282, 0, -294, 6, 0));
            },
          });
          XL.line(c, [[-46, -310], [-40, -336], [-18, -344]], C.black, 3); XL.line(c, [[46, -310], [40, -336], [18, -344]], C.black, 3);
        },
      });
      XL.paint(ctx, XL.curve([[-14, -356, 'c'], [0, -357], [14, -356, 'c'], [15, -344, 'c'], [-15, -344, 'c']]), C.black, { lw: 1.4, after: (c) => XL.line(c, [[-14, -350], [14, -350]], C.red, 1.2) });
      // belt + scalloped lantern-paper tassets
      const tabs = [[-46, C.red], [-23, C.paper], [0, C.red], [23, C.paper], [46, C.red]];
      tabs.slice().sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).forEach(([x, col]) => {
        const p = XL.curve([[x - 13, -226, 'c'], [x + 13, -226, 'c'], [x + 14, -170], [x, -156], [x - 14, -170]]);
        XL.paint(ctx, p, col, { sh: [5, 2], lw: 1.5, line: '#3a1e14', after: (c) => { XL.line(c, [[x - 12, -190], [x, -182], [x + 12, -190]], XL.rgba(col === C.red ? '#5a1410' : C.bamboo, 0.8), 1.2); } });
      });
      XL.paint(ctx, XL.curve([[-58, -236, 'c'], [0, -232], [58, -236, 'c'], [58, -220, 'c'], [0, -216], [-58, -220, 'c']]), C.black, { lw: 1.5, sh: [5, 2], after: (c) => XL.line(c, [[-56, -228], [0, -224], [56, -228]], C.red, 1.4) });
      [-60, 60].forEach((x) => XL.paint(ctx, XL.lock(x, -224, x + Math.sign(x) * 4, -170, 9, 2, { mid: 1, tipW: 2 }), C.red, { lw: 1.1 }));
      // planted sword 螢火 with a lantern-shaped pommel
      XL.paint(ctx, XL.curve([[-4, -196, 'c'], [4, -196, 'c'], [4, -26], [0, -12, 'c'], [-4, -26]]), C.blade, { lw: 1.4, sh: [2, 0], after: (c) => XL.line(c, [[0, -194], [0, -20]], '#8a98a8', 0.8) });
      XL.paint(ctx, XL.curve([[-20, -198], [-10, -206], [10, -206], [20, -198], [10, -190], [-10, -190]]), C.bamboo, { lw: 1.4 });
      XL.paint(ctx, XL.ribbon([[0, -206], [0, -248]], 8), '#3a2626', { lw: 1.2 });
      // forearms: pleated folding-lantern gauntlets
      [-1, 1].forEach((sd) => {
        const p = XL.ribbon([[sd * 74, -268], [sd * 46, -250], [sd * 18, -236]], [26, 24, 20]);
        XL.paint(ctx, p, C.red, {
          sh: [5, 3], lw: 1.6, line: '#3a1210', after: (c) => {
            for (let i = 0; i <= 6; i++) { const t = i / 6, x = sd * (74 - 56 * t), y = -268 + 32 * t; XL.line(c, [[x - sd * 2, y - 13], [x + sd * 2, y], [x - sd * 2, y + 13]], i % 3 === 0 ? C.black : XL.rgba('#5a1410', 0.7), i % 3 === 0 ? 2.6 : 1.1); }
          },
        });
      });
      XL.hand(ctx, -6, -246, -1.2, B.handL * 0.85, C.skin, 'fist', true);
      XL.hand(ctx, 6, -232, 1.2, B.handL * 0.85, C.skin, 'fist', false);
      // pommel lantern on top
      XL.paint(ctx, XL.ell(0, -258, 7, 8), C.paper, { lw: 1.2, after: (c) => { c.fillStyle = 'rgba(255,214,140,0.8)'; c.fill(XL.ell(0, -258, 5, 6)); } });
      XL.paint(ctx, XL.lock(0, -266, 0, -272, 4, 0), C.black, { lw: 0.8 });
      XL.paint(ctx, XL.ribbon([[-16, -240], [-4, -244]], 2.6), C.red, { lw: 0.8 });
      pauldron(ctx, -66, -318, -0.2);
      pauldron(ctx, 66, -318, 0.2);
      XD.head(ctx, 0, B.top, hu, F, backHair, frontHair, { tilt: 0.0 });
    }
    function back(ctx) {
      ctx.fillStyle = '#000';
      ctx.fill(XL.curve([[-50, -330], [50, -330], [54, -230], [-54, -230]]));
    }
    global.XINGHE_DESIGNS.push({
      id: '08', zh: '紙燈甲', en: 'Lantern-Craft Armour', tag: '大膽奇幻', tagEn: 'BOLD FANTASY',
      heads: 6.8, hairNote: '紙裹燈髻（奇幻改編）', accent: '#ffb24a', accentInk: '#8c3a1e', rimCol: 'rgba(255,200,120,0.9)',
      bg: { top: '#efe8dc', bottom: '#dccdb6', motif: (ctx, w, h) => XD.motifs.lanterns(ctx, w, h, '#8c3a1e') },
      palette: [['#efe2c4', '燈紙', 'lantern paper'], ['#c33a2a', '剪紙紅', 'paper-cut red'], ['#b48a4a', '竹骨', 'bamboo rib'], ['#24232a', '墨黑', 'ink black'], ['#ffd27a', '燭光', 'candle glow'], ['#e8b48a', '膚', 'skin'], ['#1c181c', '髮', 'hair']],
      callouts: [
        { x: 0, y: -446, zh: '燈籠髻', en: 'topknot wrapped as a lantern', side: 'L', ly: 28 },
        { x: -70, y: -318, zh: '六角燈肩甲', en: 'hex-lantern pauldrons', side: 'L', ly: 100 },
        { x: 0, y: -290, zh: '窗花護心', en: 'paper-cut lattice medallion', side: 'R', ly: 110 },
        { x: 56, y: -250, zh: '摺燈護臂', en: 'folding-lantern gauntlets', side: 'R', ly: 200 },
        { x: -23, y: -180, zh: '燈裙垂片', en: 'lantern-paper tassets', side: 'L', ly: 250 },
        { x: 4, y: -110, zh: '駐劍', en: 'sword planted point-down', side: 'R', ly: 320 },
        { x: -40, y: -90, zh: '紅繩綁腿', en: 'red cross-tied leggings', side: 'L', ly: 350 },
      ],
      idea: '燈籠匠的手藝變成鎧甲：竹骨糊紙的六角燈當肩甲、摺燈當護臂、窗花剪紙當護心鏡——裡面點著的是他自己的火。方下巴、大亮眼、咧嘴笑，雙手按劍站得像廟口的門神，但其實全身都是紙做的。',
      culture: '取材臺灣燈籠工藝（竹篾骨架、糊紙、六角宮燈、摺燈）與剪紙窗花；黑色短衫大褲＋紅繩綁腿為底。鎧甲形制刻意不仿任何神像，屬明確的奇幻設計。',
      model3d: '肩甲、護臂為硬殼網格＋半透明發光材質（內部點光源）；竹骨與剪紙用貼圖；燈裙垂片五片骨骼。',
      silNote: '關鍵剪影：方塊燈肩甲＋中央駐劍，對稱厚重',
      faceNote: '方下巴・粗眉・琥珀火瞳・咧嘴笑',
      costume: ['短刺髮，頭頂髻子裹紅燈紙如小燈籠（奇幻改編）', '六角燈籠肩甲（竹骨、糊紙、剪紙火花、紅流蘇），內透燭光', '燈紙背心：竹篾橫骨＋紅色窗花護心', '紅色摺燈護臂（黑環分節）', '黑腰帶＋紅白燈紙垂片、紅流蘇', '黑大褲紅繩交叉綁腿、黑布鞋；螢火劍柄頭做成小燈籠'],
      systems: '頭像：發光肩甲在頭像框兩側形成暖光。地圖精靈：方肩剪影最「重裝」，夜間地圖自帶光源。戰鬥精靈：肩甲燈光隨 HP 變暗（呼應他的火在減弱），火系大招時全身紙甲透亮。',
      draw, back,
    });
  })();

  // ================================================================== 09 借火之子
  (function () {
    const B = XL.body({ heads: 7, sh: 0.95, stance: 0.42 });
    const hu = B.hu;
    const C = { skin: '#ecc1a0', coat: '#1c1d33', lining: '#ff7a2a', ember: '#ff8a2a', gold: '#ffcf5a', inner: '#efe6d4', sash: '#c8322a', trou: '#2a2638', hair: '#24181c', red: '#d2322a' };
    const F = {
      skin: C.skin, temple: 0.345, cheek: 0.355, jaw: 0.27, jawY: 0.8, chin: 0.08, chinY: 1.0, earS: 0.95, earY: 0.53, shW: 5,
      hairCol: C.hair,
      eye: { x: 0.172, y: 0.6, w: 0.09, h: 0.06, iris: '#7a4a2a', ir: 0.056, tilt: 0.012, up: 1, lo: 0.62, lashW: 2.5, peak: 0.15 },
      eyeR: { iris: '#ffae2a', glowIris: '#fff0a0', pupil: '#5a1a08' },
      brow: { x0: 0.065, y0: 0.475, x1: 0.28, y1: 0.455, th: 0.026, arch: 0.02 },
      nose: { type: 'bridge', y: 0.75, w: 0.042 },
      mouth: { type: 'smile', y: 0.86, w: 0.065 },
      blushA: 0.16,
      faceExtras: (c) => {
        // ember crack-lines under the borrowed (gold) eye
        XL.taper(c, [[0.14, 0.68], [0.18, 0.72], [0.17, 0.78]], 1.4, '#ff9a3a');
        XL.taper(c, [[0.22, 0.67], [0.26, 0.71]], 1.2, '#ffb84a');
      },
    };
    const backHair = (c) => {
      const locks = lockSet([[-0.34, 0.3, -0.4, 0.7, 0.2, -0.03], [0.34, 0.3, 0.4, 0.7, 0.2, 0.03]]);
      locks.push(XL.curve([[-0.44, 0.46], [-0.46, 0.06], [-0.3, -0.16], [0, -0.2], [0.3, -0.16], [0.46, 0.06], [0.44, 0.46], [0, 0.36]]));
      XL.paintMass(c, locks, C.hair, { lw: 1.6, sh: [4, 1], hl: false });
    };
    const frontHair = (c) => {
      // flame hair: upswept locks, ember at the tips
      const locks = lockSet([
        [-0.3, 0.1, -0.52, -0.36, 0.24, 0.08], [-0.16, 0.0, -0.26, -0.62, 0.24, 0.06], [0.0, -0.04, 0.02, -0.78, 0.26, -0.04], [0.14, 0.0, 0.3, -0.6, 0.24, -0.06], [0.3, 0.1, 0.56, -0.3, 0.22, -0.08],
        [-0.4, 0.2, -0.62, -0.06, 0.16, 0.04], [0.4, 0.2, 0.62, -0.02, 0.16, -0.04],
        [-0.36, 0.14, -0.44, 0.56, 0.12, -0.03], [0.36, 0.14, 0.44, 0.56, 0.12, 0.03], [-0.12, 0.06, -0.2, 0.36, 0.1, -0.03], [0.1, 0.06, 0.06, 0.34, 0.1, 0.02],
      ], { mid: 0.85, tipW: 0.8 });
      locks.push(XL.curve([[-0.44, 0.26], [-0.4, 0.0], [-0.22, -0.13], [0.05, -0.15], [0.3, -0.1], [0.44, 0.04], [0.44, 0.28], [0, 0.16]]));
      c.save(); c.clip(XL.faceShape(F)); c.fillStyle = XL.skinShadow(C.skin);
      c.fill(XL.curve([[-0.46, 0.2], [-0.38, 0.5], [-0.2, 0.34], [-0.14, 0.44], [0.0, 0.28], [0.08, 0.42], [0.2, 0.3], [0.38, 0.5], [0.46, 0.2]])); c.restore();
      XL.paintMass(c, locks, C.hair, {
        lw: 1.7, sh: [3, 2], hl: false, tex: (cc) => {
          const g = cc.createLinearGradient(0, 0.05, 0, -0.75); g.addColorStop(0, 'rgba(255,120,40,0)'); g.addColorStop(0.45, 'rgba(230,90,40,0.55)'); g.addColorStop(0.8, 'rgba(255,150,50,0.95)'); g.addColorStop(1, 'rgba(255,220,120,1)');
          cc.fillStyle = g; cc.fillRect(-1, -1, 2, 1.1);
        },
        after: (cc) => XD.shine(cc, 0.02, -0.34, 0.34, XL.rgba('#a07a8a', 0.6), {}),
      });
    };
    function draw(ctx) {
      // sword on the back, hilt over the left shoulder
      XD.swordHilt(ctx, 42, -348, Math.PI * 0.16, 36, { grip: '#2a1a1a', guard: C.gold, tassel: C.ember });
      // trousers, bare feet with a red-string anklet
      [-1, 1].forEach((sd) => {
        XL.paint(ctx, XL.ribbon([[sd * 18, -214], [sd * 25, -120], [sd * 26, -42]], [40, 40, 34]), C.trou, { sh: [7, 2], lw: 1.6, after: (c) => XD.folds(c, [[[sd * 14, -170], [sd * 20, -110], [sd * 22, -60]]], XL.light(C.trou, 0.16), 1.3) });
        XL.paint(ctx, XL.curve([[sd * 26 - 18, -48, 'c'], [sd * 26 + 18, -48, 'c'], [sd * 26 + 16, -36, 'c'], [sd * 26 - 16, -36, 'c']]), XL.light(C.trou, 0.1), { lw: 1.3 });
        XD.limb(ctx, [[sd * 26, -40], [sd * 26, -24]], [13, 11.5], C.skin);
        XL.foot(ctx, sd * 26, -22, B.footS, C.skin, 'bare', sd);
      });
      XL.paint(ctx, XL.ribbon([[-34, -30], [-18, -28]], 2.4), C.red, { lw: 0.8 });
      XD.neck(ctx, 0, B.chin, B.shY, B.neckW * 2, C.skin, hu);
      // inner sleeveless tunic, opened at the chest
      XL.paint(ctx, XL.curve([[-14, -350], [-40, -338], [-48, -300], [-46, -220], [46, -220], [48, -300], [40, -338], [14, -350], [6, -300], [-6, -300]]), C.inner, { sh: [8, 3], lw: 1.6, after: (c) => { XD.folds(c, [[[-26, -280], [-22, -236]], [[26, -276], [22, -232]]], XL.shadow(C.inner, 0.2), 1.3); XL.line(c, [[14, -350], [6, -300], [-6, -300], [-14, -350]], C.gold, 1.4); } });
      // the heart-flame sigil on the sternum
      XL.paint(ctx, XL.curve([[0, -340], [5, -330], [6, -318], [0, -308, 'c'], [-6, -318], [-5, -330]]), C.ember, { lw: 1, line: '#a03a10', sh: false, after: (c) => { c.fillStyle = '#ffe9a0'; c.fill(XL.curve([[0, -330], [2.5, -322], [0, -313], [-2.5, -322]])); } });
      XL.glow(ctx, 0, -322, 34, C.ember, 0.6);
      // sash
      XL.paint(ctx, XL.curve([[-48, -236, 'c'], [0, -232], [48, -236, 'c'], [48, -222, 'c'], [0, -219], [-48, -222, 'c']]), C.sash, { lw: 1.5, sh: [5, 2] });
      XL.paint(ctx, XL.lock(-20, -226, -28, -176, 10, -4), C.sash, { lw: 1.2 });
      // sleeveless long coat with flame-cut hem
      [-1, 1].forEach((sd) => {
        const P = [[sd * 12, -352], [sd * 30, -346], [sd * 48, -338], [sd * 58, -326, 'c'], [sd * 58, -290], [sd * 60, -240], [sd * 70, -160], [sd * 84, -78, 'c']];
        const n = 5, x0 = 84, x1 = 30;
        for (let i = 1; i <= n; i++) { const t = (i - 0.5) / n, x = x0 + (x1 - x0) * t; P.push([sd * (x + 4), -78 + 16 + (i % 2) * 6, 'c']); P.push([sd * (x - 4), -80, 'c']); }
        P.push([sd * 30, -84, 'c'], [sd * 28, -180], [sd * 22, -260], [sd * 14, -330]);
        const pnl = XL.poly(P.map((p, i) => p));
        XL.paint(ctx, XL.curve(P), C.coat, {
          sh: [sd > 0 ? 12 : 5, 4], lw: 1.8, line: '#0c0c18', after: (c) => {
            const g = c.createLinearGradient(0, -160, 0, -60); g.addColorStop(0, 'rgba(255,122,42,0)'); g.addColorStop(0.6, 'rgba(255,122,42,0.55)'); g.addColorStop(1, 'rgba(255,214,120,0.95)'); c.fillStyle = g; c.fillRect(-120, -170, 240, 120);
            XL.line(c, [[sd * 14, -330], [sd * 22, -260], [sd * 28, -180], [sd * 30, -90]], C.gold, 1.6);
            XD.folds(c, [[[sd * 46, -230], [sd * 56, -140]], [[sd * 36, -200], [sd * 42, -120]]], XL.light(C.coat, 0.2), 1.6);
          },
        });
      });
      // raised right arm: flame floating above the open palm
      XD.limb(ctx, [[-50, -326], [-80, -300], [-90, -298]], [20, 17, 16], C.skin);
      XD.limb(ctx, [[-88, -296], [-94, -320], [-96, -344]], [16, 14, 12], C.skin);
      [[-92, -306], [-95, -322], [-96, -336]].forEach(([x, y]) => XL.taper(ctx, [[x - 6, y + 2], [x, y - 2], [x + 6, y + 1]], 1.4, '#ff8a2a'));
      XL.hand(ctx, -96, -346, Math.PI, B.handL * 0.85, C.skin, 'open', false);
      // left arm hanging, wound with red string to the elbow
      XD.limb(ctx, [[50, -326], [60, -296], [64, -270]], [20, 17, 16], C.skin);
      XD.limb(ctx, [[64, -272], [67, -246], [68, -222]], [16, 14, 12], C.skin);
      for (let i = 0; i < 9; i++) { const y = -270 + i * 5.4; XL.line(ctx, [[58, y + 3], [68, y], [75, y + 2]], C.red, 1.4); }
      XL.hand(ctx, 68, -222, -0.05, B.handL, C.skin, 'relax', false);
      XD.head(ctx, 0, B.top, hu, F, backHair, frontHair, { tilt: -0.04 });
    }
    function fx(ctx) {
      // palm flame
      const fx0 = -97, fy = -392;
      XL.glow(ctx, fx0, fy, 60, '#ff8a2a', 0.65);
      XL.paint(ctx, XL.curve([[fx0, fy - 34, 'c'], [fx0 + 8, fy - 14], [fx0 + 14, fy + 2], [fx0 + 8, fy + 14], [fx0 - 8, fy + 14], [fx0 - 14, fy + 2], [fx0 - 6, fy - 12]]), '#ff8a2a', { lw: 1.2, line: '#b8400e', sh: false, hl: false });
      XL.paint(ctx, XL.curve([[fx0 + 1, fy - 18, 'c'], [fx0 + 6, fy - 2], [fx0 + 5, fy + 10], [fx0 - 5, fy + 10], [fx0 - 6, fy - 2]]), '#ffd86a', { line: false, sh: false, hl: false });
      XL.paint(ctx, XL.curve([[fx0, fy - 4, 'c'], [fx0 + 3, fy + 4], [fx0, fy + 9], [fx0 - 3, fy + 4]]), '#fff6d0', { line: false, sh: false, hl: false });
      let s = 5; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
      for (let i = 0; i < 22; i++) { const x = (rnd() - 0.5) * 220, y = -60 - rnd() * 360; XL.glow(ctx, x, y, 5, '#ff9a3a', 0.9); ctx.fillStyle = '#ffd08a'; ctx.beginPath(); ctx.arc(x, y, 1.1, 0, 7); ctx.fill(); }
    }
    function back(ctx) {
      ctx.fillStyle = '#000';
      ctx.fill(XL.ribbon([[-40, -360], [0, -290], [40, -230]], 8, { round: true }));
    }
    global.XINGHE_DESIGNS.push({
      id: '09', zh: '借火之子', en: 'Child of the Borrowed Flame', tag: '大膽奇幻', tagEn: 'BOLD FANTASY',
      heads: 7, hairNote: '焰髮（奇幻改編）', accent: '#ff7a2a', accentInk: '#9a3412', rimCol: 'rgba(255,170,90,0.95)',
      bg: { top: '#1f1e30', bottom: '#2c2234', motif: (ctx, w, h) => XD.motifs.waves(ctx, w, h, '#ff9a5a') },
      fx,
      palette: [['#1c1d33', '夜靛', 'night indigo'], ['#ff7a2a', '借火', 'borrowed ember'], ['#ffcf5a', '燈金', 'lamp gold'], ['#efe6d4', '素衣', 'raw silk'], ['#d2322a', '紅繩', 'red string'], ['#ecc1a0', '膚', 'skin'], ['#24181c', '髮根', 'hair root']],
      callouts: [
        { x: 6, y: -448, zh: '焰髮', en: 'flame-swept hair, ember tips', side: 'R', ly: 28 },
        { x: 18, y: -380, zh: '異色瞳', en: 'one eye borrowed gold', side: 'R', ly: 90 },
        { x: 0, y: -322, zh: '心燈印', en: 'heart-flame on the sternum', side: 'R', ly: 160 },
        { x: -97, y: -392, zh: '掌中火', en: 'flame floating in the palm', side: 'L', ly: 60 },
        { x: 66, y: -250, zh: '紅繩纏臂', en: 'red string wound to the elbow', side: 'R', ly: 240 },
        { x: -64, y: -110, zh: '焰擺長褂', en: 'flame-cut sleeveless coat', side: 'L', ly: 300 },
      ],
      idea: '把「秘密」穿在身上：他靠白芷借來的一點燈火活著——胸口的心燈印、一隻被借來的金色眼睛、髮梢與衣襬都在燃燒。紅繩一路纏到手肘，像是怕這把火散掉。最「仙俠」、最適合後期覺醒的一版。',
      culture: '底層仍是大襟素衣、大褲與紅繩（臺灣民俗中紅繩護身、牽緣）；長褂與焰髮、心燈印為明確奇幻設計，呼應中元放水燈「燈即是魂」的意象，不引用任何真實神祇服制。',
      model3d: '焰髮與衣襬用漸層貼圖＋自發光遮罩（非粒子）；心燈印與金瞳為發光貼圖；掌中火與餘燼為粒子。',
      silNote: '關鍵剪影：上衝焰髮＋高舉的掌中火＋焰形下襬',
      faceNote: '尖下巴・一褐一金異色瞳・眼下火紋',
      costume: ['上衝焰髮，髮根深褐、髮梢燃成橘金（奇幻改編）', '夜靛無袖長褂，燈金滾邊，下襬剪成火舌並向下燃亮', '素色無袖大襟內衣，胸口敞開露出心燈印', '紅腰帶；夜色大褲；赤腳紅繩腳環', '左臂紅繩纏到手肘；右掌托火', '螢火劍斜背，劍穗如火'],
      systems: '頭像：異色瞳＋火紋，劇情揭露「借火」秘密後的頭像。地圖精靈：自帶火光，適合靈境／一息界等暗場景。戰鬥精靈：覺醒形態（第 7 章「心火」之後），火系技能與 HP 低落時焰髮變暗的狀態表現。',
      draw, back,
    });
  })();

  // ================================================================== 10 渡燈人
  (function () {
    const B = XL.body({ heads: 7.2, sh: 0.95, stance: 0.42 });
    const hu = B.hu;
    const C = { skin: '#dcaa84', coat: '#1e2a44', pipe: '#e8e4da', trou: '#4a4f5a', wrap: '#e4ddcf', hat: '#b49660', hat2: '#8a7044', sash: '#5d6470', brass: '#c9a24a', oar: '#4a3424', soul: '#9fe0ff', hair: '#18151a', red: '#c8432b' };
    const F = {
      skin: C.skin, temple: 0.34, cheek: 0.35, jaw: 0.29, jawY: 0.81, chin: 0.1, chinY: 1.01, earS: 0.95, earY: 0.53, shW: 6,
      hairCol: C.hair,
      eye: { x: 0.172, y: 0.6, w: 0.088, h: 0.05, iris: '#6a3e22', ir: 0.05, tilt: 0.008, up: 1, lo: 0.6, lashW: 2.4, lid: 0.2, peak: 0.2 },
      brow: { x0: 0.06, y0: 0.48, x1: 0.285, y1: 0.465, th: 0.03, arch: 0.006 },
      nose: { type: 'bridge', y: 0.755, w: 0.046 },
      mouth: { type: 'smile', y: 0.865, w: 0.06, dx: 0.012 },
      blushA: 0.1,
      faceExtras: (c) => {
        c.fillStyle = '#4a2a20'; c.beginPath(); c.arc(0.22, 0.7, 0.01, 0, 7); c.fill();
      },
    };
    const backHair = (c) => {
      const locks = lockSet([[-0.36, 0.3, -0.42, 0.86, 0.18, -0.03], [0.36, 0.3, 0.42, 0.86, 0.18, 0.03]]);
      locks.push(XL.curve([[-0.44, 0.5], [-0.46, 0.06], [-0.3, -0.14], [0, -0.17], [0.3, -0.14], [0.46, 0.06], [0.44, 0.5], [0, 0.4]]));
      XL.paintMass(c, locks, C.hair, { lw: 1.6, sh: [4, 1], hl: false });
    };
    const frontHair = (c) => {
      const locks = lockSet([[-0.34, 0.2, -0.4, 0.82, 0.13, -0.03], [0.34, 0.2, 0.41, 0.86, 0.13, 0.03], [-0.2, 0.14, -0.26, 0.46, 0.16, -0.03], [0.18, 0.14, 0.24, 0.44, 0.15, 0.03], [0.0, 0.14, -0.04, 0.4, 0.14, -0.02]]);
      locks.push(XL.curve([[-0.42, 0.3], [-0.4, 0.06], [0, 0.0], [0.4, 0.06], [0.42, 0.3], [0, 0.2]]));
      XL.paintMass(c, locks, C.hair, { lw: 1.6, sh: [3, 2], hl: false });
      // the conical bamboo hat 斗笠 and its shadow on the face
      c.save(); c.clip(XL.faceShape(F)); c.fillStyle = XL.rgba('#3a2440', 0.38); c.fill(XL.curve([[-0.6, -0.2], [0.6, -0.2], [0.6, 0.5], [0.2, 0.55], [-0.2, 0.55], [-0.6, 0.5]])); c.restore();
      const hat = XL.curve([[0, -0.86, 'c'], [0.5, -0.2], [1.12, 0.16], [1.14, 0.22, 'c'], [0, 0.3], [-1.14, 0.22, 'c'], [-1.12, 0.16], [-0.5, -0.2]]);
      XL.paint(c, hat, C.hat, {
        sh: [8, 4], lw: 1.8, line: '#3e2e16', after: (cc) => {
          for (let i = -8; i <= 8; i++) XL.line(cc, [[0, -0.84], [i * 0.14, 0.26]], XL.rgba(i % 2 ? '#6e5530' : '#e0c890', 0.55), i % 2 ? 0.8 : 0.9);
          [0.0, -0.3].forEach((y) => XL.line(cc, [[-1.1 * (y + 0.86) / 1.06, y + 0.2], [0, y + 0.26], [1.1 * (y + 0.86) / 1.06, y + 0.2]], XL.rgba('#5a4220', 0.7), 1.2));
          cc.fillStyle = XL.rgba('#3a2a14', 0.35); cc.fill(XL.curve([[-1.14, 0.18], [0, 0.24], [1.14, 0.18], [1.14, 0.24], [0, 0.32], [-1.14, 0.24]]));
        },
      });
      // red string round the crown with a small brass bell
      XL.line(c, [[-0.34, -0.24], [0, -0.2], [0.34, -0.24]], C.red, 2);
      XL.paint(c, XL.ell(0.3, -0.17, 0.05, 0.05), C.brass, { lw: 1 });
      // chin strings
      XL.line(c, [[-0.36, 0.62], [-0.3, 0.86], [-0.1, 1.0]], XL.rgba('#5a4a3a', 0.9), 0.9); XL.line(c, [[0.36, 0.62], [0.3, 0.86], [0.1, 1.0]], XL.rgba('#5a4a3a', 0.9), 0.9);
    };
    function draw(ctx) {
      // the soul-oar 引魂槳, blade up, soul lantern on a hook
      const sx = -84;
      XL.paint(ctx, XL.ribbon([[sx + 4, -6], [sx, -200], [sx - 3, -372]], [6, 6.5, 6]), C.oar, { lw: 1.3, sh: [2, 0] });
      XL.paint(ctx, XL.curve([[sx - 3, -364, 'c'], [sx - 13, -390], [sx - 14, -430], [sx - 4, -450, 'c'], [sx + 6, -430], [sx + 6, -390], [sx - 1, -364, 'c']]), C.oar, {
        lw: 1.5, sh: [4, 1], after: (c) => { [-436, -420, -404, -388].forEach((y) => XL.line(c, [[sx - 10, y + 4], [sx - 4, y - 2], [sx + 3, y + 4]], XL.rgba(C.pipe, 0.75), 1.1)); },
      });
      XL.paint(ctx, XL.ribbon([[sx - 2, -350], [sx - 34, -356]], 3.2, { round: true }), C.brass, { lw: 1 });
      XD.lantern(ctx, sx - 32, -355, 14, { paper: '#d8eef4', hang: 6, lit: true, glow: C.soul, char: '', capCol: '#2a3040', tall: 1.2, tassel: C.pipe });
      // trousers, leg wraps, sandals
      [-1, 1].forEach((sd) => {
        XL.paint(ctx, XL.ribbon([[sd * 18, -214], [sd * 24, -150], [sd * 26, -112]], [40, 40, 34]), C.trou, { sh: [7, 2], lw: 1.6 });
        XD.legWrap(ctx, [[sd * 26, -116], [sd * 27, -70], [sd * 26, -26]], [24, 19, 13], C.wrap, { n: 8 });
        XL.foot(ctx, sd * 26, -22, B.footS, C.skin, 'straw', sd);
      });
      // wide sleeves behind the coat
      XD.sleeve(ctx, [[-44, -334], [-62, -300], [-72, -262]], [18, 30, 34], C.coat, { round: true, paint: { sh: [7, 2] } });
      XD.sleeve(ctx, [[44, -334], [70, -342], [88, -350]], [18, 28, 32], C.coat, { round: true, paint: { sh: [5, 5] } });
      XD.neck(ctx, 0, B.chin, B.shY, B.neckW * 2, C.skin, hu);
      // long 大襟 coat with white piping and wave embroidery at the hem
      const coat = XL.curve(XL.sym([[0, -351], [12, -352], [30, -346], [46, -340], [54, -328, 'c'], [52, -298], [48, -254], [52, -200], [60, -150], [68, -106, 'c'], [30, -100], [0, -98]]));
      XL.paint(ctx, coat, C.coat, {
        sh: [12, 4], lw: 1.8, after: (c) => {
          const flap = [[2, -350], [-6, -341], [-22, -332], [-38, -316], [-46, -298], [-48, -254], [-52, -200], [-60, -150], [-68, -106]];
          XL.line(c, flap.map(([x, y]) => [x + 2.5, y]), C.pipe, 2.4);
          XD.folds(c, [[[26, -300], [22, -262]], [[20, -200], [26, -120]], [[-20, -196], [-26, -116]], [[44, -180], [52, -116]]], XL.light(C.coat, 0.14), 1.7);
          // wave band
          c.save(); c.beginPath(); c.rect(-80, -128, 160, 30); c.clip();
          for (let x = -70; x <= 70; x += 14) { XL.line(c, [[x - 7, -104], [x - 4, -116], [x + 3, -118], [x + 6, -112], [x + 2, -109]], XL.rgba(C.pipe, 0.85), 1.2); }
          c.restore();
          XL.line(c, [[-68, -122], [0, -116], [68, -122]], XL.rgba(C.pipe, 0.9), 1.2);
          XL.line(c, [[-68, -104], [0, -99], [68, -104]], C.pipe, 2.2);
        },
      });
      [[-1, -346], [-20, -333], [-36, -318], [-45, -298], [-47, -272]].forEach(([x, y]) => XL.knot(ctx, x + 2.5, y, 2, C.pipe, 4.5, C.pipe));
      XL.paint(ctx, XL.curve([[-13, -359, 'c'], [0, -360], [13, -359, 'c'], [14, -350, 'c'], [-14, -350, 'c']]), C.coat, { lw: 1.4, after: (c) => XL.line(c, [[-13, -358], [13, -358]], C.pipe, 1.6) });
      // sash + 引魂令 token + bell
      XL.paint(ctx, XL.curve([[-50, -258, 'c'], [0, -254], [50, -258, 'c'], [51, -242, 'c'], [0, -239], [-51, -242, 'c']]), C.sash, { lw: 1.5, sh: [5, 2] });
      XL.line(ctx, [[22, -244], [24, -222]], '#2a2a2a', 1);
      XL.paint(ctx, XL.curve([[16, -222, 'c'], [32, -222, 'c'], [32, -196], [24, -190, 'c'], [16, -196]]), C.brass, { lw: 1.3, after: (c) => { c.save(); c.fillStyle = '#5a3a10'; c.font = 'bold 10px "WenQuanYi Zen Hei"'; c.textAlign = 'center'; c.fillText('令', 24, -201); c.restore(); } });
      XL.paint(ctx, XL.ell(36, -230, 4, 4), C.brass, { lw: 1 });
      // right hand on the oar (cuff + fist)
      XL.paint(ctx, XL.ribbon([[-82, -270], [-62, -258]], 9), C.pipe, { lw: 1.2 });
      XL.hand(ctx, sx + 1, -262, -0.05, B.handL * 0.85, C.skin, 'gripV', true);
      // left hand tipping the hat brim
      XL.paint(ctx, XL.ribbon([[94, -360], [82, -342]], 9), C.pipe, { lw: 1.2 });
      XD.limb(ctx, [[86, -352], [74, -372], [62, -390]], [14, 13, 12], C.skin);
      XD.head(ctx, 0, B.top, hu, F, backHair, frontHair, { tilt: 0.03 });
      XL.hand(ctx, 60, -394, angTo([74, -372], [60, -396]), B.handL * 0.85, C.skin, 'fist', false);
      XL.paint(ctx, XL.ribbon([[66, -378], [76, -386]], 2.6), C.red, { lw: 0.8 });
    }
    function back(ctx) {
      ctx.fillStyle = '#000';
      ctx.fill(XL.ribbon([[0, -372], [0, -330]], 8, { round: true }));
    }
    global.XINGHE_DESIGNS.push({
      id: '10', zh: '渡燈人', en: 'The Lantern Ferryman', tag: '民俗奇幻', tagEn: 'FOLK FANTASY',
      heads: 7.2, hairNote: '低束髮（武俠式改編）', accent: '#9fe0ff', accentInk: '#2e4a6e', figX: 18, auraX: -10, rimCol: 'rgba(170,225,255,0.9)',
      bg: { top: '#dfe5ea', bottom: '#c3c9cf', motif: (ctx, w, h) => XD.motifs.waves(ctx, w, h, '#2e4a6e') },
      palette: [['#1e2a44', '深海藍', 'deep navy'], ['#e8e4da', '浪白滾邊', 'foam piping'], ['#b49660', '斗笠竹', 'hat bamboo'], ['#4a3424', '槳木', 'oar wood'], ['#9fe0ff', '魂燈', 'soul light'], ['#c9a24a', '令銅', 'token brass'], ['#dcaa84', '膚', 'skin']],
      callouts: [
        { x: -30, y: -440, zh: '斗笠＋紅繩銅鈴', en: 'bamboo hat, red string, bell', side: 'L', ly: 28 },
        { x: -86, y: -410, zh: '引魂槳', en: 'soul-oar, blade up', side: 'L', ly: 110 },
        { x: -116, y: -320, zh: '魂燈', en: 'soul lantern on a hook', side: 'L', ly: 190 },
        { x: 60, y: -394, zh: '壓帽簷', en: 'tipping the brim', side: 'R', ly: 60 },
        { x: 24, y: -206, zh: '引魂令', en: 'soul-guide token', side: 'R', ly: 230 },
        { x: 40, y: -112, zh: '浪紋長襖', en: 'wave-hem long coat', side: 'R', ly: 300 },
        { x: -26, y: -70, zh: '綁腿・草鞋', en: 'leg wraps, sandals', side: 'L', ly: 360 },
      ],
      idea: '他未來的樣子：繼承陳伯的引魂人之職。斗笠壓低、只露出帶笑的嘴角，手握比人還高的引魂槳、槳頭掛一盞藍白魂燈——明明自己沒有魂燈，卻替別人照路。最冷靜、最「渡」的一版。',
      culture: '取材北臺灣漁民與擺渡人的斗笠、深色大襟長襖、綁腿草鞋；浪紋滾邊與「引魂令」「引魂槳」為本作虛構的引魂人行頭，參考普渡、放水燈的燈與水意象，不仿任何宗教法服。',
      model3d: '斗笠為單一圓錐殼（竹編貼圖）；槳與魂燈為道具骨骼（燈可擺盪）；浪紋與滾邊全部為貼圖。',
      silNote: '關鍵剪影：圓錐斗笠＋高過頭的直槳',
      faceNote: '笠影遮額・細長半垂眼・痣・淡笑',
      costume: ['斗笠（紅繩繞頂、小銅鈴、下巴繫繩），黑髮低束（武俠改編）', '深海藍大襟長襖至膝，浪白滾邊、盤扣，下襬浪紋刺繡', '灰腰帶掛「引魂令」銅牌與鈴', '灰大褲、白綁腿、草鞋', '引魂槳（槳頭朝上，浪紋）掛藍白魂燈', '螢火劍收在長襖下（戰鬥時由槳柄抽出，作為設定提案）；右腕紅繩'],
      systems: '頭像：笠影下的臉最有神秘感，適合結局／後日談。地圖精靈：斗笠＋直槳的長條剪影在海岸、王船場景非常清楚。戰鬥精靈：槳作為長柄普攻、劍為技能，引魂人一脈的演出（第 11 章渡黑水溝）。',
      draw, back,
    });
  })();
})(window);
