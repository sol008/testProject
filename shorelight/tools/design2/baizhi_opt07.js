// 白芷 v2 — 07 燈心冷焰 Lamp-Wick Flame (bold fantasy, true lamp-spirit form)
(function () {
  'use strict';
  const B = window.BZ;
  const { P, part, stroke, line, fillP, glow, clipped, ribbon, curve, poly, mix, rgba, ink, lighten, shadowOf, hand, motes, LW, neck, redString, stageGrad, bokeh, flute, jadeTag, knot } = B;
  const R = B.rig(7.5);
  const C = {
    robe: '#f6f1e6', gold: '#d6ae52', navy: '#1e2a4a', blue: '#4fb4ff', cyan: '#c4f4ff', core: '#ffd890', skin: '#f6e4da', jade: '#a8e0cc', red: '#c8323c',
  };
  const HD = B.bzHead(R, {
    tilt: 0.03, skin: C.skin, len: -226, frontLen: -270, ends: { col: '#7fd8ff', a: 0.95 }, endsSpan: 1.2, sheen: '#5a8ad0', earDrop: '#ffd890', earBead: '#1e2a4a',
    face: { eye: { lookX: 0.0, irisDy: -0.022, halfLid: 0.12 } },
  });
  function aura() {
    // the lamp's flame as a tall teardrop mandorla behind her (shader / emissive in 3D)
    const layer = (k, col, a) => {
      const p = P((p) => {
        p.moveTo(0, -520 + k * 40);
        p.bezierCurveTo(30 - k * 4, -470 + k * 30, 86 - k * 14, -380 + k * 10, 84 - k * 14, -280);
        p.bezierCurveTo(82 - k * 14, -200, 50 - k * 6, -150, 0, -140 - k * 8);
        p.bezierCurveTo(-50 + k * 6, -150, -82 + k * 14, -200, -84 + k * 14, -280);
        p.bezierCurveTo(-86 + k * 14, -380 + k * 10, -30 + k * 4, -470 + k * 30, 0, -520 + k * 40);
        p.closePath();
      });
      if (B.G.sil) {
        if (k === 0) fillP(p, '#000', { sil: true });
        return;
      }
      fillP(p, col, { alpha: a });
    };
    layer(0, C.blue, 0.75);
    layer(1, '#8ad6ff', 0.8);
    layer(2, C.cyan, 0.85);
    layer(3, C.core, 0.6);
    // flame tongues licking off the edge
    if (!B.G.sil) for (const [x, y, s] of [[-70, -360, -1], [66, -400, 1], [-40, -470, -1], [86, -300, 1]]) {
      const t = P((p) => {
        p.moveTo(x, y + 20);
        p.quadraticCurveTo(x + s * 18, y, x + s * 10, y - 26);
        p.quadraticCurveTo(x + s * 2, y - 4, x - s * 6, y + 14);
        p.closePath();
      });
      fillP(t, '#8ad6ff', { alpha: 0.75 });
    }
    line(P((p) => {
      p.moveTo(0, -520);
      p.bezierCurveTo(30, -470, 86, -380, 84, -280);
      p.bezierCurveTo(82, -200, 50, -150, 0, -140);
      p.bezierCurveTo(-50, -150, -82, -200, -84, -280);
      p.bezierCurveTo(-86, -380, -30, -470, 0, -520);
    }), '#2a6ab0', 1.6);
  }
  function lotus() {
    // 蓮花燈座 lotus lamp-dish she stands in
    const petal = (x, w, h, col, tilt) => {
      const p = P((p) => {
        p.moveTo(x - w, 0);
        p.bezierCurveTo(x - w * 1.1 + tilt * 0.3, -h * 0.5, x - w * 0.3 + tilt, -h * 0.95, x + tilt, -h);
        p.bezierCurveTo(x + w * 0.3 + tilt, -h * 0.95, x + w * 1.1 + tilt * 0.3, -h * 0.5, x + w, 0);
        p.closePath();
      });
      part(p, col, { lw: 1.5, rimW: 1.2, sh: mix(col, '#7a5a2a', 0.35), inner: () => stroke([[x, -2], [x + tilt * 0.6, -h * 0.75]], 1.2, rgba('#8a6a2a', 0.6)) });
    };
    for (const [x, t] of [[-58, -16], [58, 16], [-36, -8], [36, 8]]) petal(x, 16, 50, mix(C.gold, '#ffffff', 0.2), t);
    for (const [x, t] of [[-20, -4], [20, 4], [0, 0]]) petal(x, 16, 58, C.gold, t);
    part(P((p) => p.ellipse(0, 2, 70, 7, 0, 0, 7)), C.navy, { lw: 1.4, rimW: 1 });
  }
  function robe() {
    // column robe: fitted 長襖 with right-overlap, narrow skirt to the lotus
    const rb = P((p) => {
      p.moveTo(-11, -357);
      p.bezierCurveTo(-22, -355, -32, -350, -34, -342);
      p.bezierCurveTo(-34, -310, -26, -280, -24, -256);
      p.bezierCurveTo(-30, -220, -34, -150, -32, -40);
      p.lineTo(32, -40);
      p.bezierCurveTo(34, -150, 30, -220, 24, -256);
      p.bezierCurveTo(26, -280, 34, -310, 34, -342);
      p.bezierCurveTo(32, -350, 22, -355, 11, -357);
      p.closePath();
    });
    part(rb, C.robe, { lw: 1.8, rimW: 1.8, rim: C.cyan, sh: '#cfd6e8', shift: [6, 2], inner: () => {
      stroke([[-12, -240], [-14, -150], [-12, -50]], 2.2, rgba('#b8c4dc', 0.8));
      stroke([[14, -240], [16, -150], [16, -50]], 2.6, rgba('#a8b4d0', 0.9));
      // overlap edge with navy & gold piping
      line(curve([[8, -357], [-6, -330], [-24, -306]]), C.navy, 3.4);
      line(curve([[9, -354], [-5, -329], [-22, -308]]), C.gold, 1);
      // flame-scroll embroidery rising from the hem
      for (const x of [-20, 0, 20]) {
        stroke([[x, -46], [x - 4, -70], [x + 3, -92], [x - 2, -112]], 2, rgba(C.blue, 0.75));
        stroke([[x + 4, -50], [x + 7, -66], [x + 3, -80]], 1.4, rgba(C.gold, 0.9));
      }
    } });
    // gold-trimmed navy belt with a lamp-ring buckle
    part(P((p) => p.roundRect(-25, -264, 50, 10, 3)), C.navy, { lw: 1.4, rimW: 1 });
    part(P((p) => p.arc(0, -259, 6, 0, 7)), C.gold, { lw: 1.2, rimW: 0.8, hi: P((p) => p.arc(0, -259, 3, 0, 7)), hiC: C.navy });
    // standing collar
    part(P((p) => {
      p.moveTo(-12, -372);
      p.quadraticCurveTo(0, -367, 12, -372);
      p.lineTo(13, -357);
      p.quadraticCurveTo(0, -352, -13, -357);
      p.closePath();
    }), C.navy, { lw: 1.3, rimW: 0.8, inner: () => line(curve([[-13, -359], [0, -354], [13, -359]]), C.gold, 1) });
    knot(4, -362, 3, C.gold);
  }
  function arms() {
    for (const s of [-1, 1]) {
      const sl = P((p) => {
        p.moveTo(s * 30, -348);
        p.bezierCurveTo(s * 42, -340, s * 46, -310, s * 44, -284);
        p.bezierCurveTo(s * 42, -270, s * 30, -266, s * 14, -284);
        p.lineTo(s * 8, -300);
        p.bezierCurveTo(s * 22, -294, s * 30, -296, s * 32, -304);
        p.lineTo(s * 30, -330);
        p.closePath();
      });
      part(sl, C.robe, { lw: 1.7, rimW: 1.5, rim: C.cyan, sh: '#cfd6e8' });
      // flared gold cuff
      part(P((p) => {
        p.moveTo(s * 15, -283);
        p.lineTo(s * 8, -298);
        p.lineTo(s * 12, -301);
        p.lineTo(s * 19, -286);
        p.closePath();
      }), C.gold, { lw: 1.2, rimW: 0.8 });
    }
  }
  function wick() {
    // the jade flute held upright like a lamp wick, a cold flame burning at its tip
    flute([0, -238], [0, -332], 2.8, { col: C.jade, holes: 5 });
    hand(-4, -306, 1.5, 27, 'grip', C.skin, 1);
    hand(4, -282, -1.5, 27, 'grip', C.skin, -1);
    redString(-6, -303, 4, 1.4);
    line(curve([[0, -242], [-2, -230], [2, -220]]), C.red, 1.4);
    jadeTag(2, -212, 8, { cord: false });
    glow(0, -346, 26, C.cyan, 0.8);
    const f = P((p) => {
      p.moveTo(0, -362);
      p.bezierCurveTo(5, -352, 7, -342, 0, -334);
      p.bezierCurveTo(-7, -342, -5, -352, 0, -362);
      p.closePath();
    });
    part(f, C.cyan, { lw: 1, line: '#3a8ad0', sh: false, rim: false, inner: (c) => {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.ellipse(0, -341, 2.2, 4, 0, 0, 7);
      c.fill();
    } });
  }
  B.DESIGNS.push({
    n: 7,
    zh: '燈心冷焰',
    en: 'Lamp-Wick Flame',
    tier: 'TRUE FORM · 燈靈',
    ratio: 7.5,
    shape: 'vertical teardrop · stately',
    accent: '#2a6ab0',
    idea: '她想起自己是誰的那一刻：身後燃起淚滴形的冷藍燈焰，雙手把玉笛直立如燈芯，腳下綻開蓮花燈座——彼岸燈本身。',
    culture: '取台灣寺廟的蓮花燈、光明燈與「點燈」意象；衣身為立領右衽長襖、腰帶，保持清代女裝骨架。不描繪任何真實神祇——光焰屬於燈靈本身。',
    model: '人物網格簡潔（長襖＋窄裙柱形）；背後燈焰為 3 層 billboard／體積 shader，邊緣火舌可動；蓮座為硬殼道具；髮梢藍焰為溶解 shader。',
    palette: [[C.robe, '燈白', 'lamp white'], [C.gold, '描金', 'gold'], [C.navy, '夜藍', 'night navy'], [C.blue, '冷焰藍', 'cold flame'], [C.core, '燈芯暖', 'wick core'], [C.skin, '膚', 'skin'], [C.jade, '玉笛', 'jade flute']],
    callouts: [
      { zh: '淚滴燈焰', en: 'teardrop lamp-flame aura (shader)', at: [-62, -440] },
      { zh: '玉笛為燈芯', en: 'flute held upright as the wick', at: [0, -350] },
      { zh: '立領右衽長襖', en: 'standing-collar wrapped robe', at: [-24, -312] },
      { zh: '火紋刺繡', en: 'rising flame-scroll embroidery', at: [20, -96] },
      { zh: '蓮花燈座', en: 'lotus lamp-dish base', at: [-58, -28] },
    ],
    bg: ['#141a34', '#2a2a50'],
    fs: 0.86,
    contourTh: 0.82,
    bust: { y: -396, z: 1.95 },
    rim: '#c4f4ff',
    shTint: '#2a3070',
    keyLight: '#d8f4ff',
    stage(c, x, y, w, h) {
      stageGrad(c, x, y, w, h, ['#0c1028', '#1a1e44', '#2c2a52']);
      bokeh(c, x, y, w, h, 30, ['#7fd8ff', '#ffd890', '#ffffff'], 71, 4, 0.55);
    },
    draw() {
      aura();
      HD.back();
      lotus();
      robe();
      neck(R, C.skin, { bot: -366, w: 0.105 });
      HD.face();
      HD.front();
      arms();
      wick();
      motes([[-50, -500, 1.2], [44, -480, 1], [-90, -420, 0.9], [96, -360, 1.1], [0, -540, 0.8]], '#c4f4ff');
    },
    back(c, G2, col) {
      B.bzBack(c, R, -226, col);
      c.fillStyle = col;
      c.fillRect(-25, -264, 50, 8);
    },
  });
})();
