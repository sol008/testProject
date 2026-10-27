// 白芷 v2 — 08 雲肩渡歌 Cloud-Collar Songstress (festive historical)
(function () {
  'use strict';
  const B = window.BZ;
  const { P, part, stroke, line, fillP, glow, ribbon, curve, poly, mix, rgba, ink, lighten, shadowOf, hand, foot, tassel, jadeTag, motes, LW, neck, redString, stageGrad, bokeh, flute, knot } = B;
  const R = B.rig(7);
  const C = {
    ao: '#1f6a74', border: '#f2e6cc', gold: '#d8ac4c', collar: '#c8455a', skirt: '#f3ece0', panel: '#1f6a74', skin: '#f6e1d3', jade: '#9fd3bd', red: '#c3303a', shoe: '#c8455a',
  };
  const HD = B.bzHead(R, {
    tilt: -0.06, skin: C.skin, len: -236, frontLen: -300,
    face: { mouth: { type: 'sing', w: 0.05, open: 0.045, y: 0.87 }, eye: { lookX: 0.026, irisDy: -0.02, halfLid: 0.2 }, blush: 0.5 },
    ornament: (P2, hu) => {
      // 步搖 hairpin on the half-up: gold stem, flower, dangling pearls
      const a = P2(-0.32, 0.02), b = P2(-0.08, -0.06);
      line(curve([a, b]), C.gold, 2.2);
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        part(P((p) => p.ellipse(a[0] + Math.cos(ang) * 3.2, a[1] + Math.sin(ang) * 3.2, 3, 2, ang, 0, 7)), C.collar, { lw: 0.9, rim: false, sh: false });
      }
      part(P((p) => p.arc(a[0], a[1], 1.8, 0, 7)), C.gold, { lw: 0.8, rim: false, sh: false });
      for (const [dx, L] of [[-3, 14], [0, 20], [3, 12]]) {
        line(curve([[a[0] + dx, a[1] + 2], [a[0] + dx * 1.3, a[1] + L]]), C.gold, 0.9);
        part(P((p) => p.arc(a[0] + dx * 1.3, a[1] + L + 1.6, 1.8, 0, 7)), '#fbf6ec', { lw: 0.8, rim: false, sh: false });
      }
      void hu;
    },
  });
  function skirt() {
    // 馬面裙: flat front panel (馬面) with embroidered wave-and-cloud border, pleated sides
    const sk = P((p) => {
      p.moveTo(-30, -258);
      p.lineTo(30, -258);
      p.bezierCurveTo(40, -180, 54, -90, 60, -14);
      p.lineTo(-60, -14);
      p.bezierCurveTo(-54, -90, -40, -180, -30, -258);
      p.closePath();
    });
    part(sk, C.skirt, { lw: 1.8, rimW: 1.6, sh: '#d6cdc4', shift: [6, 2], inner: (c) => {
      for (const x of [-44, -36, 36, 44]) stroke([[x * 0.62, -250], [x * 0.85, -140], [x, -18]], 1.4, rgba('#b8aca0', 0.9));
      // front panel border
      c.strokeStyle = C.panel;
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(-18, -250);
      c.lineTo(-26, -16);
      c.moveTo(18, -250);
      c.lineTo(26, -16);
      c.stroke();
      // embroidered hem band: waves + lotus
      c.fillStyle = C.panel;
      c.beginPath();
      c.moveTo(-58, -44);
      c.lineTo(58, -44);
      c.lineTo(60, -14);
      c.lineTo(-60, -14);
      c.fill();
      for (let x = -54; x < 54; x += 10) stroke([[x, -20], [x + 4, -28], [x + 8, -22]], 1.3, rgba(C.border, 0.9));
      for (let x = -50; x < 54; x += 10) stroke([[x, -30], [x + 4, -37], [x + 8, -31]], 1.1, rgba(C.gold, 0.9));
      for (const x of [0]) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          fillP(P((p) => p.ellipse(x + Math.cos(a) * 4, -64 + Math.sin(a) * 3.5, 3.4, 2, a, 0, 7)), '#e48a9a');
        }
        fillP(P((p) => p.arc(x, -64, 1.8, 0, 7)), C.gold);
        stroke([[x - 14, -54], [x - 6, -60]], 1.2, '#5a9a7a');
        stroke([[x + 14, -54], [x + 6, -60]], 1.2, '#5a9a7a');
      }
    } });
    const sc = { shoe: C.shoe, emb: '#f6d2dc', emb2: '#f2cf6a', emb3: '#6aa07a', sock: '#f3ede2' };
    B.foot(-15, 0, 26, 'xiuxie', sc, -1);
    B.foot(15, 0, 26, 'xiuxie', sc, 1);
  }
  function ao() {
    // 襖 jacket to the hip, broad cream border with gold line
    const ap = P((p) => {
      p.moveTo(-11, -352);
      p.bezierCurveTo(-24, -350, -34, -344, -38, -334);
      p.bezierCurveTo(-41, -300, -40, -260, -44, -206);
      p.quadraticCurveTo(0, -198, 44, -206);
      p.bezierCurveTo(40, -260, 41, -300, 38, -334);
      p.bezierCurveTo(34, -344, 24, -350, 11, -352);
      p.closePath();
    });
    part(ap, C.ao, { lw: 1.8, rimW: 1.5, inner: (c) => {
      stroke([[-26, -280], [-30, -240], [-34, -210]], 2.4, rgba(shadowOf(C.ao, 1.5), 0.8));
      stroke([[28, -280], [32, -240], [36, -210]], 2.8, rgba(shadowOf(C.ao, 1.5), 0.9));
      c.strokeStyle = C.border;
      c.lineWidth = 12;
      c.beginPath();
      c.moveTo(-46, -204);
      c.quadraticCurveTo(0, -196, 46, -204);
      c.stroke();
      c.strokeStyle = C.gold;
      c.lineWidth = LW(1.2);
      c.beginPath();
      c.moveTo(-44, -212);
      c.quadraticCurveTo(0, -204, 44, -212);
      c.stroke();
    } });
  }
  function yunjian() {
    // 雲肩 four-lobed ruyi cloud collar, tassel fringe hanging from its edge
    const lobe = (cx, cy, rx, ry, rot) => {
      // ruyi lobe: three-bump cloud head
      return P((p) => {
        const pts = [];
        for (let i = 0; i <= 40; i++) {
          const t = (i / 40) * Math.PI * 2;
          const bump = 1 + 0.16 * Math.cos(3 * t);
          pts.push([rx * bump * Math.cos(t), ry * bump * Math.sin(t)]);
        }
        const c0 = Math.cos(rot), s0 = Math.sin(rot);
        pts.forEach(([x, y], i) => {
          const X = cx + x * c0 - y * s0, Y = cy + x * s0 + y * c0;
          if (i) p.lineTo(X, Y);
          else p.moveTo(X, Y);
        });
        p.closePath();
      });
    };
    const L = [[-50, -330, 28, 20, 0.22], [50, -330, 28, 20, -0.22], [0, -308, 26, 31, 0]];
    // fringe of tassels under the collar edge
    if (!B.G.sil) for (const [x, y] of [[-74, -320], [-62, -312], [-46, -310], [-24, -292], [-12, -280], [0, -276], [12, -280], [24, -292], [46, -310], [62, -312], [74, -320]]) {
      line(poly([[x, y], [x, y + 15]], false), C.gold, 1.2);
      part(P((p) => p.ellipse(x, y + 17, 1.6, 2.6, 0, 0, 7)), C.collar, { lw: 0.7, rim: false, sh: false });
    }
    part(P((p) => p.ellipse(0, -346, 34, 15, 0, 0, 7)), C.collar, { lw: 1.6, rimW: 1.2 });
    for (const [x, y, rx, ry, rot] of L) {
      part(lobe(x, y, rx, ry, rot), C.collar, { lw: 1.8, rimW: 1.5, inner: () => {
        line(lobe(x, y, rx - 5, ry - 5, rot), C.gold, 1.4);
        for (let i = 0; i < 3; i++) stroke([[x - 9, y + 6 - i * 4], [x - 4, y + 1 - i * 4], [x + 1, y + 6 - i * 4], [x + 6, y + 1 - i * 4], [x + 10, y + 6 - i * 4]], 1.2, rgba('#9fd8e0', 0.9));
      } });
    }
    // inner neck edge
    part(P((p) => p.ellipse(0, -352, 13, 6, 0, 0, 7)), C.ao, { lw: 1.2, rim: false });
  }
  function arms() {
    // viewer-left: raised to the chest in a singing gesture; viewer-right: lowered, holding the flute
    const slL = P((p) => {
      p.moveTo(-36, -336);
      p.bezierCurveTo(-52, -326, -60, -300, -58, -272);
      p.bezierCurveTo(-56, -258, -46, -252, -36, -262);
      p.lineTo(-18, -286);
      p.lineTo(-24, -302);
      p.bezierCurveTo(-30, -296, -36, -296, -38, -306);
      p.closePath();
    });
    part(slL, C.ao, { lw: 1.8, rimW: 1.4, inner: () => stroke([[-50, -300], [-52, -276], [-44, -262]], 2.2, rgba(shadowOf(C.ao, 1.5), 0.8)) });
    part(P((p) => {
      p.moveTo(-36, -262);
      p.lineTo(-18, -286);
      p.lineTo(-23, -302);
      p.lineTo(-27, -298);
      p.lineTo(-30, -286);
      p.lineTo(-42, -268);
      p.closePath();
    }), C.border, { lw: 1.3, rimW: 0.8 });
    hand(-20, -296, 2.6, 28, 'open', C.skin, -1);
    redString(-21, -292, 4.2, 2.5);
    const slR = P((p) => {
      p.moveTo(36, -336);
      p.bezierCurveTo(50, -326, 56, -290, 58, -250);
      p.bezierCurveTo(60, -226, 58, -210, 54, -200);
      p.lineTo(36, -204);
      p.bezierCurveTo(38, -240, 40, -280, 38, -310);
      p.closePath();
    });
    part(slR, C.ao, { lw: 1.8, rimW: 1.4, inner: () => stroke([[48, -300], [52, -250], [50, -210]], 2.4, rgba(shadowOf(C.ao, 1.5), 0.8)) });
    part(P((p) => p.roundRect(35, -212, 22, 10, 2)), C.border, { lw: 1.3, rimW: 0.8 });
    flute([40, -170], [56, -250], 2.5, { col: C.jade, holes: 5 });
    hand(46, -204, -0.1, 28, 'grip', C.skin, -1);
    line(curve([[41, -172], [40, -160], [42, -150]]), C.red, 1.4);
    jadeTag(42, -142, 8, { cord: false });
  }
  B.DESIGNS.push({
    n: 8,
    zh: '雲肩渡歌',
    en: 'Cloud-Collar Songstress',
    tier: 'FESTIVE · 禮服',
    ratio: 7,
    shape: 'lobed shoulders · bell',
    accent: '#c8455a',
    idea: '中元夜，街坊讓她披上嫁妝箱裡的如意雲肩、穿上馬面裙，在主普壇前領唱〈渡魂謠〉——一身節慶盛裝，眼神卻望向海的那頭。',
    culture: '清代漢人女子節慶／婚禮盛裝：四合如意雲肩（流蘇）、寬袖襖鑲寬邊、馬面裙（前後平幅、兩側打褶）、繡鞋、步搖。奇幻：雲肩刺繡為海水紋，唱歌時流蘇微光。',
    model: '雲肩為硬挺單層網格＋流蘇骨鏈；襖、馬面裙兩層（側褶用法線貼圖）；步搖垂珠物理；刺繡全部為貼圖。',
    palette: [[C.ao, '孔雀綠襖', 'peacock ao'], [C.collar, '海棠紅', 'begonia red'], [C.gold, '金線', 'gold thread'], [C.skirt, '月白裙', 'moon-white'], [C.border, '米鑲邊', 'border'], [C.skin, '膚', 'skin'], [C.jade, '玉笛', 'jade flute']],
    callouts: [
      { zh: '步搖・半紮髮', en: 'dangling hairpin on a half-up', at: [-24, -424] },
      { zh: '四合如意雲肩', en: 'four-lobed ruyi cloud collar', at: [56, -334] },
      { zh: '寬袖襖・寬鑲邊', en: 'wide-sleeved jacket, broad border', at: [-40, -214] },
      { zh: '馬面裙', en: 'pleated horse-face skirt', at: [0, -100] },
      { zh: '玉笛垂玉牌', en: 'flute with red string and jade tag', at: [52, -232] },
    ],
    bg: ['#3a2a3a', '#7a4a4a'],
    bust: { y: -380, z: 1.85 },
    rim: '#ffe6c8',
    shTint: '#3a2a5a',
    stage(c, x, y, w, h) {
      stageGrad(c, x, y, w, h, ['#2a1a2c', '#5a2a34', '#8a5a40']);
      // altar lanterns of the 主普壇
      for (let i = 0; i < 6; i++) {
        const lx = x + 22 + i * 50, ly = y + 40 + (i % 2) * 16;
        const g = c.createRadialGradient(lx, ly, 1, lx, ly, 16);
        g.addColorStop(0, 'rgba(255,190,110,0.55)');
        g.addColorStop(1, 'rgba(255,190,110,0)');
        c.fillStyle = g;
        c.fillRect(lx - 16, ly - 16, 32, 32);
      }
      bokeh(c, x, y, w, h * 0.7, 20, ['#ffc070', '#ff8060'], 81, 7, 0.45);
    },
    draw() {
      HD.back();
      skirt();
      ao();
      neck(R, C.skin, { bot: -350, w: 0.11 });
      HD.face();
      HD.front();
      yunjian();
      arms();
      motes([[-40, -330, 0.9], [-56, -350, 0.8], [-30, -360, 0.7]], '#ffe0b0');
    },
    back(c, G2, col) {
      B.bzBack(c, R, -236, col);
      c.fillStyle = col;
      c.beginPath();
      c.ellipse(0, -330, 70, 22, 0, 0, 7);
      c.fill();
      c.fillRect(-56, -48, 112, 30);
    },
  });
})();
