// 白芷 v2 — 06 海沫 Sea-Foam Spirit (bold fantasy, spirit-realm form)
(function () {
  'use strict';
  const B = window.BZ;
  const { P, part, stroke, line, fillP, glow, clipped, ribbon, curve, poly, mix, rgba, ink, lighten, shadowOf, hand, foot, tassel, jadeTag, motes, LW, inHead, neck, redString, stageGrad, bokeh, rng, flute } = B;
  const R = B.rig(7.5);
  const C = {
    foam: '#f2fbfa', aqua: '#8fd6d0', teal: '#1f6f78', deep: '#123c50', coral: '#e8706a', pearl: '#fdf6ec', skin: '#f6e3d8', jade: '#9fdac4',
  };
  const HD = B.bzHead(R, {
    tilt: -0.07, skin: C.skin, len: -190, frontLen: -196, backW: 0.66, backW2: 0.62, ends: { col: '#e8fffb', a: 0.95 }, endsSpan: 1.6, sheen: '#4f8fa0', earDrop: '#bfeee6', earBead: '#f4efe6',
    face: { eye: { lookX: 0.03, irisDy: -0.018, halfLid: 0.2 } },
    backInner: (c) => {
      // foam bubbles where the hair dissolves
      const r = rng(31);
      for (let i = 0; i < 22; i++) {
        const x = (r() - 0.5) * 60, y = -190 - r() * 40;
        c.strokeStyle = 'rgba(255,255,255,0.8)';
        c.lineWidth = LW(0.9);
        c.beginPath();
        c.arc(x, y, 1 + r() * 2.2, 0, 7);
        c.stroke();
      }
    },
  });
  function driftLocks() {
    // hair ends drifting outward as if under water, breaking into foam
    for (const s of [-1, 1]) {
      const p = ribbon([[s * 36, -346], [s * 62, -340], [s * 92, -322], [s * 112, -330], [s * 122, -350]], [6, 7.5, 6, 4, 0.5]);
      part(p, '#17151c', { lw: 1.4, rimW: 1, rim: '#4f8fa0', grad: [rgba('#e8fffb', 0), rgba('#e8fffb', 0.95), -330, -330] , inner: (c) => {
        const g = c.createLinearGradient(s * 60, 0, s * 122, 0);
        g.addColorStop(0, rgba('#e8fffb', 0));
        g.addColorStop(1, rgba('#e8fffb', 0.95));
        c.fillStyle = g;
        c.fillRect(-140, -380, 280, 80);
      } });
    }
    motes([[-126, -356, 1.4], [-118, -368, 1], [-132, -340, 0.9], [124, -360, 1.3], [134, -346, 0.9], [118, -372, 0.8]], '#e8fffb');
  }
  function wave() {
    // she stands on a breaking wave crest
    const wv = P((p) => {
      p.moveTo(-100, 4);
      p.bezierCurveTo(-90, -10, -60, -22, -30, -16);
      p.bezierCurveTo(-10, -12, 10, -12, 30, -16);
      p.bezierCurveTo(60, -24, 84, -14, 92, -28);
      p.bezierCurveTo(100, -40, 86, -48, 78, -38);
      p.bezierCurveTo(90, -36, 92, -26, 84, -22);
      p.bezierCurveTo(96, -10, 104, 0, 100, 4);
      p.closePath();
    });
    part(wv, C.teal, { lw: 1.7, rimW: 1.4, rim: '#d8fffb', grad: [rgba(C.aqua, 0.8), rgba(C.deep, 0.6), -40, 4], inner: () => {
      for (let x = -80; x < 80; x += 18) stroke([[x, -2], [x + 8, -10], [x + 16, -4]], 1.4, rgba(C.foam, 0.8));
    } });
    // foam crest
    const r = rng(4);
    for (let i = 0; i < 26; i++) {
      const x = -96 + i * 7.6, y = -14 - Math.sin(i * 0.5) * 4 - (i > 20 ? (i - 20) * 4 : 0);
      part(P((p) => p.arc(x, y, 2.5 + r() * 3, 0, 7)), C.foam, { lw: 0.9, rim: false, sh: '#cfeeee', shift: [1, 1] });
    }
  }
  function skirt() {
    const sk = P((p) => {
      p.moveTo(-28, -300);
      p.lineTo(28, -300);
      p.bezierCurveTo(40, -220, 56, -120, 64, -30);
      const n = 8;
      for (let i = 0; i < n; i++) {
        const x0 = 64 - (128 * i) / n, x1 = 64 - (128 * (i + 1)) / n;
        p.bezierCurveTo(x0 - 4, -14, x1 + 10, -10, x1, -28);
      }
      p.bezierCurveTo(-56, -120, -40, -220, -28, -300);
      p.closePath();
    });
    part(sk, C.foam, { lw: 1.7, rimW: 1.5, rim: '#bff4ff', sh: '#c4e6ea', shift: [6, 2], grad: [rgba(C.foam, 0), rgba(C.aqua, 0.75), -160, -20], inner: () => {
      for (const x of [-30, -10, 12, 34]) stroke([[x * 0.5, -290], [x * 0.8, -180], [x * 1.4, -40]], 2, rgba('#a8d8e0', 0.7));
      // 海水紋 wave embroidery along the hem
      for (let row = 0; row < 3; row++) for (let x = -56 + row * 6; x < 56; x += 14) stroke([[x, -60 + row * 9], [x + 5, -67 + row * 9], [x + 10, -61 + row * 9]], 1.3, rgba(C.teal, 0.75));
    } });
  }
  function bodice() {
    const bd = P((p) => {
      p.moveTo(-10, -357);
      p.bezierCurveTo(-22, -354, -32, -348, -34, -340);
      p.bezierCurveTo(-34, -322, -31, -308, -29, -296);
      p.lineTo(29, -296);
      p.bezierCurveTo(31, -308, 34, -322, 34, -340);
      p.bezierCurveTo(32, -348, 22, -354, 10, -357);
      p.closePath();
    });
    part(bd, C.foam, { lw: 1.7, rimW: 1.3, sh: '#c4e6ea', inner: () => {
      line(curve([[10, -357], [-4, -336], [-22, -312]]), C.teal, 3.2);
      line(curve([[-10, -357], [2, -340], [8, -330]]), C.teal, 3.2);
    } });
    // sash under the bust with coral knot
    part(P((p) => p.roundRect(-30, -302, 60, 10, 3)), C.teal, { lw: 1.4, rimW: 1 });
    part(P((p) => p.ellipse(6, -297, 6, 5, 0, 0, 7)), C.coral, { lw: 1.2, rimW: 0.8 });
    for (const [dx, len] of [[-2, 70], [4, 92]]) part(ribbon([[6 + dx, -294], [8 + dx * 2, -260], [4 + dx * 3, -294 + len]], [2.6, 2.4, 1.2]), C.coral, { lw: 1.1, rimW: 0.6 });
    jadeTag(12, -206, 9, { cordLen: 1, col: C.jade });
  }
  function coat() {
    // sheer sea-silk 褙子 open coat, hem breaking into wave curls
    for (const s of [-1, 1]) {
      const cp = P((p) => {
        p.moveTo(s * 10, -357);
        p.bezierCurveTo(s * 24, -354, s * 34, -348, s * 38, -340);
        p.bezierCurveTo(s * 48, -260, s * 64, -150, s * 82, -60);
        p.bezierCurveTo(s * 94, -36, s * 122, -40, s * 118, -68);
        p.bezierCurveTo(s * 114, -88, s * 92, -82, s * 98, -64);
        p.bezierCurveTo(s * 104, -54, s * 100, -40, s * 88, -36);
        p.bezierCurveTo(s * 74, -30, s * 58, -32, s * 46, -40);
        p.bezierCurveTo(s * 34, -120, s * 26, -230, s * 20, -300);
        p.lineTo(s * 12, -340);
        p.closePath();
      });
      part(cp, C.aqua, { alpha: 0.62, lw: 1.6, rimW: 1.6, rim: '#e8fffb', sh: mix(C.aqua, C.deep, 0.35), shift: [s > 0 ? 6 : 3, 2], line: ink(C.aqua, 0.5), inner: () => {
        for (const k of [0.3, 0.6]) stroke([[s * (24 + k * 12), -330], [s * (34 + k * 26), -200], [s * (50 + k * 40), -60]], 2, rgba(C.deep, 0.35));
      } });
      // straight collar band down the front edge
      line(curve([[s * 11, -356], [s * 16, -320], [s * 22, -260], [s * 32, -140], [s * 46, -42]]), C.teal, 3);
    }
  }
  function arms() {
    for (const s of [-1, 1]) {
      // forearm skin (under sheer sleeve)
      part(ribbon([[s * 54, -282], [s * 66, -250], [s * 78, -226]], [5, 4.6, 4]), C.skin, { lw: 1.4, rimW: 1 });
      hand(s * 79, -228, s * -0.5, 30, 'open', C.skin, s > 0 ? -1 : 1);
      // wide sheer sleeve trailing below the arm
      const sl = P((p) => {
        p.moveTo(s * 32, -344);
        p.bezierCurveTo(s * 48, -336, s * 62, -300, s * 70, -268);
        p.lineTo(s * 76, -240);
        p.bezierCurveTo(s * 86, -220, s * 92, -196, s * 86, -176);
        p.bezierCurveTo(s * 76, -168, s * 66, -180, s * 60, -196);
        p.bezierCurveTo(s * 52, -220, s * 44, -250, s * 40, -280);
        p.lineTo(s * 34, -318);
        p.closePath();
      });
      part(sl, C.aqua, { alpha: 0.6, lw: 1.5, rimW: 1.4, rim: '#e8fffb', sh: mix(C.aqua, C.deep, 0.35), line: ink(C.aqua, 0.5), inner: () => {
        stroke([[s * 50, -300], [s * 62, -240], [s * 74, -186]], 2, rgba(C.deep, 0.35));
      } });
      line(curve([[s * 70, -268], [s * 80, -238], [s * 76, -240]]), C.teal, 2.4);
    }
    redString(-77, -229, 4, -0.5);
  }
  B.DESIGNS.push({
    n: 6,
    zh: '海沫',
    en: 'Sea-Foam Spirit',
    tier: 'SPIRIT FORM · 幻想',
    ratio: 7.5,
    shape: 'flowing S-curves',
    accent: '#1f6f78',
    idea: '靈視下的白芷：踏在一道碎浪上，長髮的末梢化成浮沫向兩側漂散，半透明的海紗褙子邊緣捲成浪頭——像剛從黑水溝回來。',
    culture: '以宋明以來的褙子（直領對襟開衫）＋高腰裙為骨，只在「靈境／海中」形態使用（brief 允許神靈界的古風）；裙襬用傳統「海水紋」。奇幻：髮梢化沫、衣襬成浪、赤足踏浪。',
    model: '海紗外衣與袖為半透明雙面網格（toon + fresnel 邊緣光）；髮梢與浪花泡沫為粒子／溶解 shader；腳下浪為獨立特效網格。',
    palette: [[C.foam, '浪沫白', 'foam white'], [C.aqua, '海玻璃', 'sea-glass'], [C.teal, '深海青', 'deep teal'], [C.deep, '黑水藍', 'black-tide'], [C.coral, '珊瑚結', 'coral knot'], [C.skin, '膚', 'skin'], [C.jade, '玉', 'jade']],
    callouts: [
      { zh: '髮梢化沫', en: 'hair ends dissolve into sea-foam', at: [-34, -204] },
      { zh: '海紗褙子', en: 'sheer sea-silk open coat', at: [56, -150] },
      { zh: '珊瑚結＋玉牌', en: 'coral sash knot, jade tag', at: [8, -298] },
      { zh: '海水紋裙襬', en: 'wave-pattern hem', at: [-30, -56] },
      { zh: '赤足踏浪', en: 'barefoot on a breaking wave', at: [-60, -16] },
    ],
    bg: ['#1a4a5a', '#0e2a3a'],
    contourTh: 0.4,
    fs: 0.95,
    bust: { y: -394, z: 1.95 },
    rim: '#d8fffb',
    shTint: '#1a3a6a',
    keyLight: '#e0fff8',
    stage(c, x, y, w, h) {
      stageGrad(c, x, y, w, h, ['#4a9aa8', '#1d5a70', '#0c2638']);
      // light shafts from the surface
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const g = c.createLinearGradient(0, y, 0, y + h * 0.8);
        g.addColorStop(0, 'rgba(200,255,250,0.18)');
        g.addColorStop(1, 'rgba(200,255,250,0)');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(x + 30 + i * 60, y);
        c.lineTo(x + 50 + i * 60, y);
        c.lineTo(x + 10 + i * 70, y + h * 0.8);
        c.lineTo(x - 20 + i * 70, y + h * 0.8);
        c.fill();
      }
      c.restore();
      bokeh(c, x, y, w, h, 24, ['#e8fffb', '#9fe8e0'], 61, 4, 0.6);
    },
    draw() {
      HD.back();
      wave();
      coat();
      skirt();
      bodice();
      neck(R, C.skin, { bot: -352, w: 0.11, clav: true });
      HD.face();
      HD.front();
      arms();
      motes([[-30, -186, 1.4], [-24, -176, 1], [-40, -172, 0.9], [-20, -196, 0.8], [-36, -160, 0.7]], '#e8fffb');
    },
    back(c, G2, col) {
      B.bzBack(c, R, -190, col);
      c.fillStyle = col;
      c.fillRect(-30, -302, 60, 8);
    },
  });
})();
