// 白芷 v2 — 02 藍衫笛歌 Hakka Blue-Shirt Flautist (historical, Hakka)
(function () {
  'use strict';
  const B = window.BZ;
  const { P, part, stroke, line, fillP, ribbon, curve, mix, rgba, ink, lighten, shadowOf, hand, foot, knot, jadeTag, motes, drawFace, inHead, neck, lock, flute, wideSleeve, redString, stageGrad, bokeh, hairShine } = B;
  const R = B.rig(7);
  const C = {
    shirt: '#36598a', cuff: '#a9c9e6', cuff2: '#f1ede2', apron: '#2b2a3a', silver: '#d7dbe2', trouser: '#22212b',
    skin: '#f3dccb', hair: '#17151c', red: '#c3303a', jade: '#9fd3bd', shoe: '#1f1e27',
  };
  const FA = [92, -302], FB = [-100, -292]; // flute held level at chest, about to play
  const HD = B.bzHead(R, { tilt: 0.05, skin: C.skin, ornament: (P2, hu) => {
    // jade comb + red string at the half-up
    const a = P2(0.18, -0.02);
    part(P((p) => p.roundRect(a[0], a[1], 0.2 * hu, 0.07 * hu, 0.03 * hu)), C.jade, { lw: 1.1, rimW: 0.6, sh: mix(C.jade, '#2d6a5a', 0.4), shift: [0.6, 1] });
    const b = P2(0.3, 0.05);
    line(curve([b, [b[0] + 3, b[1] + 8], [b[0] + 1, b[1] + 16]]), C.red, 1.6);
  } });
  B.HD02 = HD; // exposed for the in-game portrait bake (tools/design2/baizhi_portrait.html)
  function loopBun() {
    // 半紮 half-up loop at the back of the crown (the rest of the hair stays down)
    inHead(R, 0, () => {
      const loop = P((p) => p.ellipse(0.14, -0.08, 0.2, 0.14, 0.35, 0, 7));
      part(loop, '#17151c', { sh: '#08070c', shift: [0.03, 0.03], lw: 1.5, rimW: 0.015, rim: '#5d6f98', rimA: 0.6 });
      fillP(P((p) => p.ellipse(0.14, -0.08, 0.09, 0.055, 0.35, 0, 7)), '#08070c');
    }, 0.05);
  }
  function legs() {
    for (const s of [-1, 1]) {
      const leg = P((p) => {
        p.moveTo(s * 4, -80);
        p.lineTo(s * 30, -80);
        p.lineTo(s * 31, -14);
        p.lineTo(s * 8, -14);
        p.closePath();
      });
      part(leg, C.trouser, { lw: 1.7, rimW: 1.2 });
    }
    foot(-19, 0, 31, 'cloth', { shoe: C.shoe, sole: '#e7e0d2' }, -1, { rot: 0.1 });
    foot(19, 0, 31, 'cloth', { shoe: C.shoe, sole: '#e7e0d2' }, 1, { rot: 0.1 });
  }
  function shirt() {
    // long 藍衫 to mid-calf, slight A-line, side slits
    const sp = P((p) => {
      p.moveTo(-11, -350);
      p.bezierCurveTo(-24, -348, -34, -344, -38, -335);
      p.bezierCurveTo(-42, -300, -42, -250, -44, -200);
      p.bezierCurveTo(-46, -150, -50, -100, -51, -62);
      p.quadraticCurveTo(-51, -56, -45, -56);
      p.lineTo(45, -56);
      p.quadraticCurveTo(51, -56, 51, -62);
      p.bezierCurveTo(50, -100, 46, -150, 44, -200);
      p.bezierCurveTo(42, -250, 42, -300, 38, -335);
      p.bezierCurveTo(34, -344, 24, -348, 11, -350);
      p.closePath();
    });
    part(sp, C.shirt, {
      lw: 1.9, rimW: 1.6, shift: [5, 3],
      inner: (c) => {
        stroke([[-30, -230], [-36, -150], [-42, -62]], 3.5, rgba(shadowOf(C.shirt, 1.4), 0.8));
        stroke([[32, -230], [38, -150], [44, -62]], 4, rgba(shadowOf(C.shirt, 1.5), 0.9));
        stroke([[-20, -180], [-24, -120], [-26, -60]], 2, rgba(lighten(C.shirt, 0.3), 0.6));
        // cotton weave
        c.globalAlpha = 0.07;
        c.strokeStyle = '#ffffff';
        c.lineWidth = 0.5;
        for (let y = -350; y < -50; y += 3) {
          c.beginPath();
          c.moveTo(-60, y);
          c.lineTo(60, y + 1);
          c.stroke();
        }
        c.globalAlpha = 1;
        // hem band
        c.fillStyle = mix(C.shirt, '#000', 0.25);
        c.fillRect(-60, -66, 120, 12);
      },
    });
    for (const s of [-1, 1]) line(curve([[s * 51, -58], [s * 49, -90], [s * 48, -110]]), ink(C.shirt, 0.5), 2.2);
    // 大襟 edge with light piping
    const lap = P((p) => {
      p.moveTo(3, -350);
      p.bezierCurveTo(-4, -334, -20, -322, -38, -314);
      p.lineTo(-38, -308);
      p.bezierCurveTo(-20, -316, -2, -330, -3, -350);
      p.closePath();
    });
    part(lap, C.cuff, { lw: 1.1, rimW: 0.6, sh: false });
    // low round collar band
    const col = P((p) => {
      p.moveTo(-12.5, -360);
      p.quadraticCurveTo(0, -355, 12.5, -360);
      p.lineTo(13.5, -350);
      p.quadraticCurveTo(0, -345, -13.5, -350);
      p.closePath();
    });
    part(col, C.shirt, { lw: 1.3, rimW: 0.8 });
    knot(4, -352, 3.3, '#cfd6e2');
    knot(-38, -300, 3.5, '#cfd6e2');
  }
  function apron() {
    // 圍身裙 black apron with silver neck chain
    const ap = P((p) => {
      p.moveTo(-17, -318);
      p.quadraticCurveTo(0, -322, 17, -318);
      p.bezierCurveTo(20, -300, 24, -280, 30, -268);
      p.bezierCurveTo(34, -230, 36, -195, 36, -165);
      p.quadraticCurveTo(0, -157, -36, -165);
      p.bezierCurveTo(-36, -195, -34, -230, -30, -268);
      p.bezierCurveTo(-24, -280, -20, -300, -17, -318);
      p.closePath();
    });
    part(ap, C.apron, {
      lw: 1.7, rimW: 1.2, sh: '#14131a', shift: [4, 2],
      inner: () => {
        stroke([[-14, -250], [-18, -200], [-20, -168]], 2, rgba('#5a5870', 0.6));
        stroke([[16, -250], [20, -200], [22, -168]], 2.4, rgba('#000', 0.5));
        // embroidered hem band: peony & cloud scroll
        line(curve([[-36, -176], [0, -168], [36, -176]]), '#c9a24a', 1.2, { dash: [2, 2] });
        for (const x of [-22, 0, 22]) {
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            fillP(P((p) => p.ellipse(x + Math.cos(a) * 2.6, -184 + (x === 0 ? 2 : 0) + Math.sin(a) * 2.2, 2.2, 1.4, a, 0, 7)), x === 0 ? '#d4566a' : '#e48a9a');
          }
          fillP(P((p) => p.arc(x, -184 + (x === 0 ? 2 : 0), 1.2, 0, 7)), '#f2cf6a');
        }
        // embroidered border at the bib top
        line(curve([[-15, -312], [0, -315.5], [15, -312]]), '#c9a24a', 1.3, { dash: [2, 2] });
      },
    });
    // waist ties
    part(P((p) => p.roundRect(-44, -272, 88, 6, 2)), C.apron, { lw: 1.3, rimW: 0.8 });
    // silver chain round the neck to the bib corners
    for (const s of [-1, 1]) line(curve([[s * 16, -318], [s * 15, -334], [s * 12.5, -350]]), C.silver, 2.2, { dash: [2.2, 1.4] });
    part(P((p) => p.roundRect(-5, -322, 10, 6, 1.5)), C.silver, { lw: 1, rimW: 0.6, sh: '#8f97a6' });
  }
  function arms() {
    for (const s of [-1, 1]) {
      // wide sleeve: upper arm, then a deep bag hanging under the level forearm
      const sl = P((p) => {
        p.moveTo(s * 30, -343);
        p.bezierCurveTo(s * 46, -338, s * 56, -322, s * 62, -300);
        p.bezierCurveTo(s * 68, -282, s * 70, -266, s * 66, -250);
        p.bezierCurveTo(s * 62, -240, s * 50, -238, s * 42, -244);
        p.lineTo(s * 30, -290);
        p.lineTo(s * 30, -304);
        p.bezierCurveTo(s * 38, -306, s * 42, -312, s * 40, -322);
        p.closePath();
      });
      part(sl, C.shirt, {
        lw: 1.9, rimW: 1.6, shift: [s > 0 ? 5 : 3, 3],
        inner: (c) => {
          stroke([[s * 50, -300], [s * 56, -275], [s * 56, -248]], 2.6, rgba(shadowOf(C.shirt, 1.5), 0.8));
          stroke([[s * 42, -290], [s * 46, -270], [s * 48, -246]], 2, rgba(shadowOf(C.shirt, 1.5), 0.7));
          stroke([[s * 44, -334], [s * 54, -316], [s * 58, -298]], 2, rgba(lighten(C.shirt, 0.35), 0.6));
          c.globalAlpha = 0.07;
          c.strokeStyle = '#ffffff';
          c.lineWidth = 0.5;
          for (let y = -345; y < -235; y += 3) {
            c.beginPath();
            c.moveTo(s * 20, y);
            c.lineTo(s * 75, y + 1);
            c.stroke();
          }
          c.globalAlpha = 1;
        },
      });
      // turned-back cuff: light-blue band with a cream stripe along the opening
      const cuff = P((p) => {
        p.moveTo(s * 29, -305);
        p.lineTo(s * 41, -244);
        p.lineTo(s * 50, -242);
        p.lineTo(s * 38, -306);
        p.closePath();
      });
      part(cuff, C.cuff, { lw: 1.4, rimW: 0.9, sh: mix(C.cuff, '#3a5a8c', 0.4), shift: [2, 0] });
      line(curve([[s * 33.5, -305.5], [s * 45.5, -243]]), C.cuff2, 1.6);
      fillP(P((p) => p.ellipse(s * 34.5, -276, 3, 30, -s * 0.19, 0, 7)), '#1b2236');
    }
  }
  function hands() {
    flute(FA, FB, 2.8, { col: C.jade, holes: 6 });
    hand(-31, -300, 1.3, 30, 'grip', C.skin, 1);
    hand(31, -302, -1.3, 30, 'grip', C.skin, -1);
    redString(-31, -298, 4.4, 1.35);
    // red string + jade tag dangling from the flute end
    line(curve([[FB[0] + 6, FB[1]], [FB[0] + 4, FB[1] + 12], [FB[0] + 6, FB[1] + 20]]), C.red, 1.5);
    jadeTag(FB[0] + 6, FB[1] + 28, 9, { cord: false, tassel: true });
  }
  B.DESIGNS.push({
    n: 2,
    zh: '藍衫笛歌',
    en: 'Hakka Blue-Shirt Flautist',
    tier: 'HISTORICAL · 客家',
    ratio: 7,
    shape: 'vertical · banner sleeves',
    accent: '#36598a',
    idea: '在竹塹客家庄的山歌對唱裡，她借來藍衫與圍身裙，舉笛吹起〈渡魂謠〉——高舉的雙臂與垂落的寬袖是她最好認的剪影。',
    culture: '台灣客家藍衫：靛藍長衫、右衽大襟、寬袖反摺淺色袖口（袖口花邊），配黑色圍身裙與銀鍊、黑褲布鞋。奇幻處：吹笛時袖口與笛尾飄出的海霧光點。',
    model: '長衫＋圍裙兩層大形；寬袖做成獨立布料（布料模擬或骨骼擺動）；袖口色帶、銀鍊用貼圖＋簡化網格；笛子為獨立道具。',
    palette: [[C.shirt, '藍衫靛', 'indigo shirt'], [C.cuff, '袖口淺藍', 'cuff band'], [C.apron, '圍身裙', 'apron'], [C.hair, '烏黑髮', 'jet-black hair'], [C.skin, '膚', 'skin'], [C.jade, '玉笛', 'jade flute'], [C.red, '紅線', 'red string']],
    callouts: [
      { zh: '玉笛・渡魂謠', en: 'jade dizi flute, red-string tag', at: [70, -298] },
      { zh: '寬袖反摺袖口', en: 'wide sleeves, turned-back cuffs', at: [-58, -258] },
      { zh: '圍身裙＋銀鍊', en: 'Hakka apron with silver chain', at: [0, -200] },
      { zh: '藍衫長衫', en: 'long indigo 藍衫 to mid-calf', at: [38, -110] },
      { zh: '半紮髮・玉梳', en: 'half-up loop, jade comb, red string', at: [14, -422] },
    ],
    bg: ['#e6e2d8', '#a8b3b0'],
    bust: { y: -372, z: 1.85 },
    rim: '#fff0d8',
    shTint: '#2c3466',
    stage(c, x, y, w, h) {
      stageGrad(c, x, y, w, h, ['#c7d2c4', '#9fb1a8', '#6f8580']);
      // terraced tea hills of the Hakka hills
      for (let k = 0; k < 4; k++) {
        c.fillStyle = rgba('#3e5a52', 0.18 + k * 0.08);
        c.beginPath();
        c.moveTo(x, y + h * (0.35 + k * 0.1));
        for (let i = 0; i <= 10; i++) c.lineTo(x + (w * i) / 10, y + h * (0.33 + k * 0.1) - Math.sin(i * 0.8 + k) * 12);
        c.lineTo(x + w, y + h);
        c.lineTo(x, y + h);
        c.fill();
      }
      bokeh(c, x, y, w, h * 0.5, 10, ['#ffffff', '#e8f4ff'], 5, 5, 0.4);
    },
    draw() {
      loopBun();
      HD.back();
      legs();
      shirt();
      apron();
      neck(R, C.skin, { bot: -348, w: 0.11 });
      HD.face();
      HD.front();
      arms();
      hands();
      motes([[-100, -330, 1.2], [-80, -350, 0.9], [-112, -312, 0.8], [96, -340, 0.8]], '#d8f6ff');
    },
    back(c, G2, col) {
      B.bzBack(c, R, -234, col);
      c.fillStyle = col;
      c.beginPath();
      c.ellipse(8, -428, 13, 9, 0, 0, 7);
      c.fill();
      c.fillRect(-46, -272, 92, 6);
    },
  });
})();
