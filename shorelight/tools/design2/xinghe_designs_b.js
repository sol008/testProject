// 彼岸燈 — design pass v2 — 沈星河 options 06–10
'use strict';
(function (global) {
  const XL = global.XL, XD = global.XD;
  const angTo = XD.angTo, lockSet = XD.lockSet;

  // two-finger sword gesture (劍指) hand, local: wrist at 0, fingers toward +y
  XD.swordFingers = (ctx, x, y, ang, L, skin, mirror) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); if (mirror) ctx.scale(-1, 1);
    const ink = XL.ink(skin, 0.5), shc = XL.skinShadow(skin), s = L;
    const f1 = XL.lock(-0.06 * s, 0.3 * s, -0.08 * s, 1.0 * s, 0.15 * s, 0, { mid: 1, tipW: 2.6 });
    const f2 = XL.lock(0.07 * s, 0.3 * s, 0.08 * s, 0.94 * s, 0.15 * s, 0, { mid: 1, tipW: 2.6 });
    const fist = XL.curve([[-0.2 * s, -0.02 * s], [-0.25 * s, 0.25 * s], [-0.18 * s, 0.5 * s], [0.18 * s, 0.52 * s], [0.25 * s, 0.25 * s], [0.18 * s, -0.02 * s]]);
    XL.paintMass(ctx, [fist, f1, f2], skin, { line: ink, lw: 1.3, shCol: shc, sh: [1.4, 1] });
    XL.line(ctx, [[0.005 * s, 0.4 * s], [0.0, 0.9 * s]], XL.rgba(ink, 0.8), 0.8);
    const th = XL.curve([[-0.22 * s, 0.1 * s], [-0.3 * s, 0.3 * s], [-0.16 * s, 0.46 * s], [-0.06 * s, 0.4 * s], [-0.12 * s, 0.26 * s]]);
    XL.paint(ctx, th, XL.light(skin, 0.05), { line: ink, lw: 1.2, shCol: shc, sh: [1, 1] });
    ctx.restore();
  };

  // ================================================================== 06 懶骨頭
  (function () {
    const B = XL.body({ heads: 6.5, sh: 0.92, stance: 0.45 });
    const hu = B.hu;
    const C = { skin: '#e4ad84', jacket: '#3e6070', inner: '#f0ece1', sash: '#c49a3a', trou: '#6a5038', hair: '#2a1e1a', grass: '#7aa04a', red: '#c8432b' };
    const F = {
      skin: C.skin, temple: 0.37, cheek: 0.39, jaw: 0.315, jawY: 0.79, chin: 0.13, chinY: 0.99, earS: 1.0, earY: 0.53, shW: 5,
      hairCol: C.hair, browCol: '#2a1e1a',
      eye: { x: 0.175, y: 0.61, w: 0.088, h: 0.06, iris: '#8a5a2a', ir: 0.056, tilt: -0.008, up: 1, lo: 0.65, lashW: 2.3, lid: 0.46, look: 0.18 },
      brow: { x0: 0.065, y0: 0.46, x1: 0.28, y1: 0.47, th: 0.036, arch: 0.018 },
      browL: { y0: 0.45, y1: 0.455 },
      nose: { type: 'button', y: 0.75, w: 0.045 },
      mouth: { type: 'cat', y: 0.86, w: 0.07, dx: -0.01 },
      blushA: 0.22,
      faceExtras: (c) => {
        // grass stem chewed in the mouth corner
        XL.paint(c, XL.lock(0.04, 0.87, 0.5, 0.7, 0.026, -0.03, { mid: 1, tipW: 1.2 }), C.grass, { lw: 1, sh: false });
        XL.paint(c, XL.lock(0.44, 0.73, 0.56, 0.62, 0.05, 0.02), C.grass, { lw: 0.9, sh: false });
      },
    };
    const backHair = (c) => {
      const locks = lockSet([[-0.36, 0.3, -0.48, 0.74, 0.22, -0.05], [0.36, 0.3, 0.5, 0.72, 0.22, 0.05], [0, -0.1, 0.04, -0.3, 0.2, 0]]);
      locks.push(XL.curve([[-0.46, 0.5], [-0.48, 0.06], [-0.32, -0.16], [0, -0.2], [0.32, -0.16], [0.48, 0.06], [0.46, 0.5], [0, 0.42]]));
      XL.paintMass(c, locks, C.hair, { lw: 1.6, sh: [4, 1], hl: false });
      // tiny topknot behind, red string
      XL.paint(c, XL.ell(0.18, -0.2, 0.09, 0.075), C.hair, { lw: 1.4, sh: [2, 1] });
      XL.paint(c, XL.ribbon([[0.1, -0.15], [0.2, -0.13]], 0.03), C.red, { lw: 0.9 });
    };
    const frontHair = (c) => {
      const locks = lockSet([
        [-0.34, 0.0, -0.5, 0.42, 0.22, -0.05], [-0.22, -0.06, -0.32, 0.48, 0.22, -0.04], [-0.08, -0.08, -0.14, 0.44, 0.21, -0.02],
        [0.06, -0.08, 0.06, 0.48, 0.2, 0.03], [0.2, -0.06, 0.3, 0.44, 0.21, 0.05], [0.33, -0.02, 0.5, 0.38, 0.2, 0.05],
        // bed-head spikes
        [-0.3, -0.06, -0.62, -0.08, 0.16, 0.06], [-0.2, -0.12, -0.42, -0.36, 0.16, 0.05], [0.18, -0.12, 0.36, -0.38, 0.16, -0.05], [0.32, -0.04, 0.64, -0.06, 0.16, -0.06],
        [-0.4, 0.12, -0.62, 0.3, 0.13, 0.03], [0.4, 0.12, 0.62, 0.28, 0.13, -0.03],
      ]);
      locks.push(XL.curve([[-0.45, 0.24], [-0.42, -0.04], [-0.24, -0.17], [0.05, -0.2], [0.3, -0.14], [0.45, 0.04], [0.45, 0.26], [0, 0.12]]));
      // the cowlick 呆毛
      locks.push(XL.curve([[-0.02, -0.16], [0.0, -0.36], [0.1, -0.52], [0.22, -0.54, 'c'], [0.1, -0.46], [0.06, -0.32], [0.06, -0.16]]));
      c.save(); c.clip(XL.faceShape(F)); c.fillStyle = XL.skinShadow(C.skin);
      c.fill(XL.curve([[-0.46, 0.2], [-0.42, 0.46], [-0.3, 0.4], [-0.2, 0.5], [-0.1, 0.42], [0.04, 0.5], [0.18, 0.42], [0.3, 0.46], [0.46, 0.4], [0.46, 0.2]])); c.restore();
      XL.paintMass(c, locks, C.hair, { lw: 1.7, sh: [3, 2], hl: false, after: (cc) => XD.shine(cc, 0.03, -0.36, 0.36, XL.rgba('#a8826a', 0.65), {}) });
    };
    function draw(ctx) {
      // sword slung horizontally behind the lower back (through the sash)
      XL.paint(ctx, XL.ribbon([[-70, -226], [0, -232], [96, -240]], [7, 7, 6], { round: true }), '#3a2a26', { lw: 1.3, sh: [0, 2], after: (c) => XL.line(c, [[84, -246], [86, -234]], '#b8893a', 2) });
      XD.swordHilt(ctx, -72, -226, Math.PI / 2 - 0.08, 32, { grip: '#2e2626', guard: '#a8834a', tassel: C.red });
      // legs: weight on the right leg, left foot turned out, sandal half off
      [[-1, -120, 1], [1, -60, 0]].forEach(([sd, cuffY, k]) => {
        const kx = k ? 0 : 8;
        XL.paint(ctx, XL.ribbon([[sd * 20, -214], [sd * 27 + kx * 0.5, -150], [sd * 30 + kx, cuffY]], [44, 46, 48]), C.trou, { sh: [8, 2], lw: 1.6, after: (c) => XD.folds(c, [[[sd * 12, -180], [sd * 20, -140], [sd * 22, cuffY + 12]], [[sd * 40, -160], [sd * 44, cuffY + 18]]], XL.light(C.trou, 0.16), 1.3) });
        XL.paint(ctx, XL.curve([[sd * 30 + kx - 25, cuffY - 8, 'c'], [sd * 30 + kx + 25, cuffY - 8, 'c'], [sd * 30 + kx + 24, cuffY + 6, 'c'], [sd * 30 + kx - 24, cuffY + 6, 'c']]), XL.light(C.trou, 0.1), { lw: 1.4 });
        XD.limb(ctx, [[sd * 30 + kx, cuffY + 2], [sd * 31 + kx, (cuffY - 24) / 2], [sd * 30 + kx, -24]], [18, 16.5, 11.5], C.skin);
        XL.foot(ctx, sd * 30 + kx, -22, B.footS, C.skin, k ? 'straw' : 'bare', sd);
      });
      // the dangling sandal
      XL.withT(ctx, 56, -6, -0.35, 1, 1, (c) => { XL.paint(c, XL.curve([[-12, -3], [14, -5], [16, 4], [-12, 5]]), '#c9ad6e', { lw: 1.2, line: '#5e4a26' }); XL.line(c, [[-6, -3], [2, -12], [10, -4]], '#b8995a', 1.6); });
      // upper arms raised (sleeves slid down toward the shoulders)
      [-1, 1].forEach((sd) => {
        XD.limb(ctx, [[sd * 92, -380], [sd * 70, -402], [sd * 40, -410]], [16, 15, 14], C.skin);
        XD.sleeve(ctx, [[sd * 42, -326], [sd * 68, -346], [sd * 96, -374]], [22, 28, 30], C.jacket, { round: true, paint: { sh: [4, 6], after: (c) => XD.folds(c, [[[sd * 60, -346], [sd * 76, -356]], [[sd * 70, -334], [sd * 86, -352]]], XL.shadow(C.jacket, 0.3), 1.5) } });
        XL.paint(ctx, XL.ribbon([[sd * 84, -386], [sd * 106, -364]], 13), XL.light(C.jacket, 0.1), { lw: 1.3 });
      });
      XD.neck(ctx, 0, B.chin, B.shY, B.neckW * 2, C.skin, hu);
      // undershirt + open jacket riding up with the arms
      XL.paint(ctx, XL.curve([[-28, -334], [-12, -338], [0, -330], [12, -338], [28, -334], [34, -226], [-34, -226]]), C.inner, { sh: [6, 2], lw: 1.5, after: (c) => XD.folds(c, [[[-10, -300], [-6, -250]], [[12, -290], [8, -244]], [[-24, -250], [-14, -232]]], XL.shadow(C.inner, 0.2), 1.3) });
      [-1, 1].forEach((sd) => {
        const pnl = XL.curve([[sd * 12, -346], [sd * 30, -340], [sd * 46, -334], [sd * 58, -324, 'c'], [sd * 56, -290], [sd * 58, -250], [sd * 64, -214, 'c'], [sd * 36, -208], [sd * 24, -212, 'c'], [sd * 26, -260], [sd * 20, -300], [sd * 11, -334]]);
        XL.paint(ctx, pnl, C.jacket, { sh: [sd > 0 ? 11 : 5, 4], lw: 1.8, after: (c) => { XL.line(c, [[sd * 11, -334], [sd * 20, -300], [sd * 26, -260], [sd * 25, -212]], XL.light(C.jacket, 0.25), 2); XD.folds(c, [[[sd * 50, -300], [sd * 40, -280]], [[sd * 44, -250], [sd * 50, -224]]], XL.shadow(C.jacket, 0.3), 1.6); } });
      });
      // a patch and a burnt hole from lantern work
      XL.paint(ctx, XL.poly([[-48, -262], [-34, -264], [-33, -248], [-47, -246]]), '#7a6a52', { lw: 0.9, sh: false });
      // loose ochre sash, long knot ends
      XL.paint(ctx, XL.curve([[-40, -232, 'c'], [0, -228], [40, -232, 'c'], [41, -218, 'c'], [0, -215], [-41, -218, 'c']]), C.sash, { lw: 1.5, sh: [5, 2] });
      XL.paint(ctx, XL.lock(16, -224, 30, -164, 11, 4), C.sash, { lw: 1.2 });
      XL.paint(ctx, XL.lock(22, -224, 44, -176, 10, -5), C.sash, { lw: 1.2 });
      XL.paint(ctx, XL.ell(18, -224, 6.5, 5.5), XL.shadow(C.sash, 0.08), { lw: 1.2 });
      XD.head(ctx, 0, B.top, hu, F, backHair, frontHair, { tilt: 0.09 });
      // fingertips peeking from behind the head + red string on the wrist
      XL.paint(ctx, XL.ribbon([[52, -414], [56, -398]], 2.6), C.red, { lw: 0.8 });
    }
    function back(ctx) {
      ctx.fillStyle = '#000';
      ctx.fill(XL.ell(-18, -432, 8, 7));
    }
    global.XINGHE_DESIGNS.push({
      id: '06', zh: '懶骨頭', en: 'Lazybones on a Day Off', tag: '日常寫實', tagEn: 'CASUAL',
      heads: 6.5, hairNote: '亂髮小髻（武俠式改編）', accent: '#c49a3a', accentInk: '#6e5320',
      bg: { top: '#f1ede0', bottom: '#e2d8c2', motif: (ctx, w, h) => XD.motifs.clouds(ctx, w, h, '#6e5320') },
      palette: [['#3e6070', '褪青', 'faded teal'], ['#f0ece1', '汗衫白', 'undershirt'], ['#c49a3a', '薑黃帶', 'ochre sash'], ['#6a5038', '土褐褲', 'earth brown'], ['#7aa04a', '草莖', 'grass'], ['#e4ad84', '膚', 'skin'], ['#2a1e1a', '髮', 'warm black']],
      callouts: [
        { x: 12, y: -448, zh: '呆毛亂髮', en: 'bed-head + cowlick', side: 'L', ly: 30 },
        { x: 26, y: -362, zh: '叼草', en: 'chewing a grass stem', side: 'R', ly: 30 },
        { x: -100, y: -370, zh: '雙手抱頭', en: 'hands behind the head', side: 'L', ly: 120 },
        { x: -80, y: -228, zh: '劍橫插背後', en: 'sword across the back', side: 'L', ly: 250 },
        { x: 30, y: -180, zh: '鬆腰帶', en: 'loose ochre sash', side: 'R', ly: 260 },
        { x: 56, y: -8, zh: '拖鞋半掉', en: 'sandal half off', side: 'R', ly: 400 },
      ],
      idea: '把「愛偷懶」放到最大：雙手抱頭、叼根草、半睜眼、一隻草鞋快掉了，劍還橫插在背後的腰帶裡懶得背好。圓臉、寬顴、貓嘴笑——一看就知道陳伯又要罵人了。',
      culture: '清代勞動青年的家常穿法：敞開的對襟短衫、白汗衫、薑黃粗布腰帶、土褐大褲一高一低捲著、草鞋。髮型改為散亂短髮紮小髻（武俠式改編，不薙髮）。',
      model3d: '呆毛與髮尖做成大塊髮片；橫插的劍讓背面剪影最好認；表情以半閉眼貼圖切換。',
      silNote: '關鍵剪影：抱頭的 W 形手肘＋腰後橫劍',
      faceNote: '寬圓臉・半睜懶眼・貓嘴・叼草',
      costume: ['亂翹短髮、頭頂呆毛、腦後小髻綁紅繩（武俠改編）', '褪青色對襟短衫敞開，袖子滑到上臂；肘邊補丁', '白汗衫', '薑黃粗布腰帶鬆鬆打結，長帶尾', '土褐大褲一腳捲到膝、一腳到腳踝；草鞋一隻半掉', '螢火劍橫插背後腰帶；左腕紅繩'],
      systems: '頭像：半睜眼＋叼草是招牌「懶」表情（日常對話）。地圖精靈：抱頭手肘＋橫劍在 90 px 也一眼可辨。戰鬥精靈：待機時打哈欠，拔劍時從腰後抽出（帥氣反差）。',
      draw, back,
    });
  })();

  // ================================================================== 07 螢火劍客
  (function () {
    const B = XL.body({ heads: 7.4, sh: 0.98, stance: 0.5 });
    const hu = B.hu;
    const C = { skin: '#e2ae88', coat: '#2a2a31', pipe: '#e0672a', trou: '#1f1f25', boot: '#3a2a22', belt: '#5b3a26', brass: '#c99a3e', scarf: '#d9622a', hair: '#161317', blade: '#d8dde2', fly: '#d8f070', inner: '#6e2420' };
    const F = {
      skin: C.skin, temple: 0.34, cheek: 0.345, jaw: 0.265, jawY: 0.82, chin: 0.075, chinY: 1.02, earS: 0.92, earY: 0.53, shW: 5.5,
      hairCol: C.hair,
      eye: { x: 0.172, y: 0.6, w: 0.094, h: 0.043, iris: '#9a521c', ir: 0.045, tilt: 0.032, up: 0.85, lo: 0.45, lashW: 2.8, flick: 0.28, peak: 0.3, crease: true, creaseUp: 0.006, glowIris: '#ffb24a' },
      brow: { x0: 0.055, y0: 0.505, x1: 0.29, y1: 0.445, th: 0.03, arch: 0.01 },
      nose: { type: 'bridge', y: 0.755, w: 0.044 },
      mouth: { type: 'set', y: 0.865, w: 0.07 },
      blushA: 0.08,
      skinExtras: (c) => { XL.line(c, [[-0.3, 0.7], [-0.2, 0.74]], XL.rgba('#a85a4a', 0.9), 1.2); },
    };
    global.XH07F = F; // exposed for the in-game portrait bake
    const backHair = (c) => {
      // high ponytail streaming right
      const tail = [XL.curve([[0.0, -0.18], [0.3, -0.24], [0.7, -0.1], [1.1, 0.18], [1.5, 0.3], [1.85, 0.62, 'c'], [1.4, 0.5], [1.05, 0.42], [0.62, 0.22], [0.25, 0.04], [0.0, -0.02]]),
        XL.lock(0.6, 0.0, 1.6, 0.86, 0.24, -0.1), XL.lock(0.4, -0.1, 1.3, 0.14, 0.18, -0.08)];
      XL.paintMass(c, tail, C.hair, { lw: 1.6, sh: [3, 4], hl: false, after: (cc) => { XL.taper(cc, [[0.3, -0.14], [0.8, 0.0], [1.3, 0.3]], 2, XL.rgba('#6a6680', 0.8)); XL.taper(cc, [[0.6, 0.12], [1.1, 0.4], [1.5, 0.6]], 1.6, XL.rgba('#6a6680', 0.6)); } });
      const locks = lockSet([[-0.36, 0.3, -0.4, 0.78, 0.18, -0.03], [0.36, 0.3, 0.4, 0.78, 0.18, 0.03]]);
      locks.push(XL.curve([[-0.42, 0.5], [-0.44, 0.06], [-0.3, -0.14], [0, -0.17], [0.3, -0.14], [0.44, 0.06], [0.42, 0.5], [0, 0.4]]));
      XL.paintMass(c, locks, C.hair, { lw: 1.6, sh: [4, 1], hl: false });
    };
    const frontHair = (c) => {
      const locks = lockSet([
        // centre-parted fringe + long side locks framing the face
        [-0.04, -0.12, -0.3, 0.34, 0.18, -0.06], [-0.1, -0.1, -0.38, 0.56, 0.16, -0.06], [0.04, -0.12, 0.28, 0.32, 0.18, 0.06], [0.1, -0.1, 0.36, 0.5, 0.16, 0.06],
        [-0.34, 0.06, -0.42, 0.98, 0.15, -0.04], [0.34, 0.06, 0.42, 1.0, 0.15, 0.04], [-0.02, -0.12, -0.08, 0.44, 0.1, -0.02],
      ]);
      locks.push(XL.curve([[-0.42, 0.16], [-0.38, -0.06], [-0.2, -0.17], [0.02, -0.19], [0.24, -0.16], [0.4, -0.04], [0.42, 0.16], [0, 0.0]]));
      c.save(); c.clip(XL.faceShape(F)); c.fillStyle = XL.skinShadow(C.skin);
      c.fill(XL.curve([[-0.45, 0.1], [-0.38, 0.62], [-0.28, 0.4], [-0.06, 0.48], [0.0, 0.3], [0.06, 0.48], [0.28, 0.38], [0.38, 0.6], [0.45, 0.1]])); c.restore();
      XL.paintMass(c, locks, C.hair, { lw: 1.7, sh: [3, 2], hl: false, after: (cc) => XD.shine(cc, 0.01, -0.34, 0.34, XL.rgba('#6e6a86', 0.55), {}) });
      // hair tie (red cord) at the crown
      XL.paint(c, XL.ribbon([[-0.02, -0.2], [0.12, -0.24]], 0.05), '#c8432b', { lw: 1 });
    };
    function draw(ctx) {
      // scarf tail behind, streaming right
      XL.paint(ctx, XL.curve([[18, -352], [70, -360], [130, -340], [184, -300], [204, -260, 'c'], [176, -282], [124, -306], [64, -330], [20, -336]]), C.scarf, { sh: [6, 6], lw: 1.6, after: (c) => XD.folds(c, [[[60, -344], [130, -320], [180, -284]]], XL.shadow(C.scarf, 0.3), 1.6) });
      // boots + trousers
      [-1, 1].forEach((sd) => {
        XL.paint(ctx, XL.ribbon([[sd * 20, -214], [sd * 30, -160], [sd * 36, -118]], [36, 36, 34]), C.trou, { sh: [6, 2], lw: 1.6, after: (c) => XD.folds(c, [[[sd * 18, -190], [sd * 26, -150], [sd * 30, -124]]], XL.light(C.trou, 0.15), 1.3) });
        XL.paint(ctx, XL.ribbon([[sd * 36, -126], [sd * 38, -80], [sd * 40, -40]], [27, 23, 21]), C.boot, { sh: [6, 1], lw: 1.6, after: (c) => XD.folds(c, [[[sd * 34, -60], [sd * 42, -56]], [[sd * 33, -48], [sd * 43, -44]]], XL.shadow(C.boot, 0.3), 1.2) });
        XL.foot(ctx, sd * 40, -24, B.footS, C.skin, 'boot', sd, { col: C.boot });
        XL.paint(ctx, XL.curve([[sd * 36 - 16, -132, 'c'], [sd * 36 + 16, -132, 'c'], [sd * 36 + 15, -118, 'c'], [sd * 36 - 15, -118, 'c']]), XL.light(C.boot, 0.08), { lw: 1.3, after: (c) => XL.line(c, [[sd * 36 - 12, -125], [sd * 36 + 12, -125]], C.pipe, 1) });
      });
      // sleeves behind the body (narrow 窄袖)
      XD.sleeve(ctx, [[-44, -336], [-62, -296], [-72, -258]], [18, 22, 19], C.coat, { round: true, paint: { sh: [5, 2] } });
      XD.sleeve(ctx, [[44, -336], [64, -300], [74, -280]], [18, 22, 20], C.coat, { round: true, paint: { sh: [5, 2] } });
      XD.neck(ctx, 0, B.chin, B.shY, B.neckW * 2, C.skin, hu);
      // long 大襟 tunic with side slits (front panel + side flaps)
      const flapL = XL.curve([[-50, -236], [-62, -180], [-72, -132, 'c'], [-42, -128, 'c'], [-36, -180], [-34, -232]]);
      const flapR = XL.curve([[50, -236], [64, -180], [76, -134, 'c'], [46, -128, 'c'], [36, -180], [34, -232]]);
      XL.paint(ctx, flapL, XL.shadow(C.coat, 0.1), { sh: [6, 2], lw: 1.6, after: (c) => XL.line(c, [[-72, -132], [-42, -130]], C.pipe, 1.6) });
      XL.paint(ctx, flapR, XL.shadow(C.coat, 0.1), { sh: [6, 2], lw: 1.6, after: (c) => XL.line(c, [[76, -135], [46, -130]], C.pipe, 1.6) });
      const body = XL.curve(XL.sym([[0, -352], [12, -353], [30, -347], [46, -340], [54, -328, 'c'], [50, -298], [46, -254], [40, -224], [36, -170], [34, -126, 'c'], [0, -122]]));
      XL.paint(ctx, body, C.coat, {
        sh: [11, 4], lw: 1.8, after: (c) => {
          const flap = [[2, -351], [-6, -342], [-22, -333], [-38, -318], [-46, -298], [-46, -254]];
          XL.line(c, flap, C.pipe, 2);
          XD.folds(c, [[[24, -300], [20, -268]], [[-16, -200], [-12, -136]], [[16, -196], [20, -134]]], XL.shadow(C.coat, 0.3), 1.7);
          XL.line(c, [[-34, -128], [0, -124], [34, -128]], C.pipe, 1.6);
          // ember embroidery: little flame motifs at the hem
          [-22, 0, 22].forEach((x) => { c.fillStyle = XL.rgba(C.pipe, 0.85); c.fill(XL.lock(x, -130, x + 2, -150, 7, 2)); });
        },
      });
      XL.paint(ctx, XL.curve([[-13, -360, 'c'], [0, -361], [13, -360, 'c'], [14, -351, 'c'], [-14, -351, 'c']]), C.inner, { lw: 1.4 });
      // scarf wrap + front end
      XL.paint(ctx, XL.curve([[-24, -358], [0, -352], [24, -358], [26, -342], [0, -334], [-26, -342]]), C.scarf, { sh: [4, 2], lw: 1.6 });
      XL.paint(ctx, XL.curve([[-14, -344], [-4, -342], [-6, -300], [-12, -268, 'c'], [-20, -282], [-22, -310]]), C.scarf, { sh: [4, 2], lw: 1.5, after: (c) => XL.line(c, [[-14, -280], [-12, -268]], XL.light(C.scarf, 0.3), 1) });
      // wide leather belt + brass buckle + scabbard
      XL.paint(ctx, XL.curve([[-48, -262, 'c'], [0, -258], [48, -262, 'c'], [48, -244, 'c'], [0, -240], [-48, -244, 'c']]), C.belt, { lw: 1.5, sh: [5, 2], after: (c) => XL.dash(c, [[-46, -259], [0, -255.5], [46, -259]], XL.light(C.belt, 0.35), 0.7, [2, 2]) });
      XL.paint(ctx, XL.ell(0, -251, 8, 7), C.brass, { lw: 1.2 });
      XL.paint(ctx, XL.ribbon([[42, -254], [66, -200], [96, -140]], [7, 7, 6], { round: true }), '#2e2222', { lw: 1.3, sh: [2, 0], after: (c) => { XL.line(c, [[46, -246], [52, -234]], C.brass, 2); XL.line(c, [[86, -160], [94, -146]], C.brass, 2); } });
      // right hand: drawn sword held low
      const gd = [-80, -214], tip = [-176, -40];
      XD.limb(ctx, [[-72, -262], [-76, -240], [-78, -224]], [14, 13, 12], C.skin);
      XL.paint(ctx, XL.ribbon([[-82, -262], [-70, -232]], [18, 17]), C.belt, { lw: 1.3, after: (c) => { XL.line(c, [[-82, -254], [-71, -250]], C.brass, 0.9); XL.line(c, [[-80, -243], [-70, -240]], C.brass, 0.9); } });
      XL.paint(ctx, XL.curve([[gd[0] - 3, gd[1] - 2, 'c'], [tip[0] - 1, tip[1] - 2], [tip[0], tip[1], 'c'], [tip[0] + 2, tip[1] - 1], [gd[0] + 3, gd[1] + 2, 'c']]), C.blade, {
        lw: 1.3, sh: [1, 1], after: (c) => { XL.line(c, [gd, tip], '#8a98a8', 0.8); },
      });
      XL.glow(ctx, -128, -128, 60, '#ffb24a', 0.25);
      XD.swordHilt(ctx, gd[0], gd[1], angTo(gd, tip) + Math.PI, 30, { grip: '#2e2222', guard: C.brass, tassel: C.pipe });
      XL.hand(ctx, -79, -230, angTo([-76, -240], [-79, -214]), B.handL * 0.8, C.skin, 'fist', true);
      // left hand: 劍指 sword-fingers raised before the chest
      XL.paint(ctx, XL.ribbon([[70, -284], [56, -306]], [18, 17]), C.belt, { lw: 1.3, after: (c) => XL.line(c, [[68, -290], [58, -296]], C.brass, 0.9) });
      XD.limb(ctx, [[72, -282], [60, -300], [50, -312]], [14, 13, 12], C.skin);
      XD.swordFingers(ctx, 50, -313, angTo([60, -300], [48, -316]), B.handL * 0.85, C.skin, false);
      XL.paint(ctx, XL.ribbon([[52, -296], [62, -306]], 2.6), '#c8432b', { lw: 0.8 });
      XD.head(ctx, 0, B.top, hu, F, backHair, frontHair, { tilt: -0.03 });
    }
    function fx(ctx) {
      let s = 11; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
      for (let i = 0; i < 16; i++) { const t = rnd(), x = -80 + (-176 + 80) * t + (rnd() - 0.5) * 60, y = -214 + (174) * t + (rnd() - 0.5) * 50; XL.glow(ctx, x, y, 7, C.fly, 0.9); ctx.fillStyle = '#f6ffd0'; ctx.beginPath(); ctx.arc(x, y, 1.3, 0, 7); ctx.fill(); }
    }
    function back(ctx) {
      ctx.fillStyle = '#000';
      ctx.fill(XL.curve([[-16, -440], [16, -440], [6, -380], [0, -330], [-6, -380]]));
    }
    global.XINGHE_DESIGNS.push({
      id: '07', zh: '螢火劍客', en: 'The Firefly Swordsman', tag: '武俠', tagEn: 'WUXIA',
      heads: 7.4, hairNote: '高馬尾（武俠式改編）', accent: '#e0672a', accentInk: '#8a3416', figX: 10, auraX: -20,
      bg: { top: '#e7e4dc', bottom: '#cfc8bb', motif: (ctx, w, h) => XD.motifs.fireflies(ctx, w, h, '#c8e060') },
      fx,
      palette: [['#2a2a31', '玄黑', 'charcoal'], ['#e0672a', '螢橙滾邊', 'ember piping'], ['#d9622a', '圍巾', 'scarf'], ['#5b3a26', '皮革', 'leather'], ['#c99a3e', '銅', 'brass'], ['#d8f070', '螢光', 'firefly'], ['#e2ae88', '膚', 'skin']],
      callouts: [
        { x: 30, y: -430, zh: '高馬尾', en: 'high ponytail', side: 'R', ly: 28 },
        { x: 120, y: -330, zh: '長圍巾', en: 'trailing scarf', side: 'R', ly: 96 },
        { x: -76, y: -250, zh: '護腕', en: 'leather bracers', side: 'L', ly: 130 },
        { x: 52, y: -326, zh: '劍指', en: 'sword-finger gesture', side: 'R', ly: 170 },
        { x: -40, y: -170, zh: '大襟長衫・開衩', en: 'slit long tunic', side: 'L', ly: 250 },
        { x: -150, y: -80, zh: '螢火出鞘', en: 'drawn blade, fireflies', side: 'L', ly: 340 },
        { x: 40, y: -60, zh: '長靴', en: 'riding boots', side: 'R', ly: 380 },
      ],
      idea: '「關鍵時刻最勇敢」的那一刻：十八歲的少年長成劍客的樣子。最高、最瘦長、最銳利的一版，螢火出鞘、螢光沿劍身流動，左手掐劍指；細長上挑的眼睛裡有燈火。適合作為中後期換裝或宣傳主視覺。',
      culture: '以清代男子大襟長衫為底（右衽、側開衩），加入武俠行頭：窄袖、護腕、寬皮帶、長靴；高馬尾與長圍巾為明確的武俠式改編，非清代真實髮式。',
      model3d: '長衫前片與兩側開衩做三片裙擺骨骼；馬尾與圍巾為兩條飄帶鏈；螢火蟲為粒子特效。',
      silNote: '關鍵剪影：斜下出鞘劍＋右飄馬尾與圍巾',
      faceNote: '窄長臉・細長上挑眼・劍眉・抿嘴',
      costume: ['高馬尾紅繩束髮、中分瀏海與長鬢髮（武俠改編）', '玄黑大襟長衫至膝，兩側開衩，螢橙滾邊與下襬火紋刺繡', '螢橙長圍巾（一端在胸前、一端隨風）', '寬皮帶＋銅扣，皮護腕', '黑褲紮進長靴', '螢火出鞘（劍身沿刃流光）、劍鞘斜掛左腰'],
      systems: '頭像：銳利眼神＋眼中火光，適合戰鬥中的切入頭像。地圖精靈：馬尾與圍巾的飄動讓角色顯得最「主角」。戰鬥精靈：最直接對應「平衡型劍士」，螢火蟲作為火屬性技能的視覺母題。',
      draw, back,
    });
  })();
})(window);
