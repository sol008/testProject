// 白芷 v2 — 02 藍衫笛歌 Hakka Blue-Shirt Flautist (historical, Hakka)
(function () {
  'use strict';
  const B = window.BZ;
  const { P, part, stroke, line, fillP, ribbon, curve, mix, rgba, ink, lighten, shadowOf, hand, foot, knot, jadeTag, motes, drawFace, inHead, neck, lock, flute, wideSleeve, redString, stageGrad, bokeh, hairShine } = B;
  const R = B.rig(7);
  const C = {
    shirt: '#36598a', cuff: '#a9c9e6', cuff2: '#f1ede2', apron: '#2b2a3a', silver: '#d7dbe2', trouser: '#22212b',
    skin: '#f3dccb', hair: '#b4a3c8', hairSh: '#7d6c98', hairHi: '#efe6fb', red: '#c3303a', jade: '#9fd3bd', shoe: '#1f1e27',
  };
  const F = {
    skin: C.skin, W: 0.385, jawX: 0.255, jawY: 0.8, chinW: 0.06, cheek: 0.1, chinY: 0.99,
    eye: { y: 0.6, x: 0.172, w: 0.175, h: 0.115, shape: 'almond', tilt: 0.025, iris: '#c8973c', irisR: 0.052, irisH: 1.15, lid: 'mono', halfLid: 0.3, look: 0.0, lashes: 2, lineC: '#3b2a3c', lineW: 2.4, irisDy: 0.012 },
    brow: { y: 0.47, x0: 0.07, len: 0.165, th: 0.012, arch: 0.01, tilt: -0.012, col: '#7d6c98' },
    nose: { type: 'bridge', y: 0.765 },
    mouth: { type: 'soft', y: 0.87, w: 0.05 },
    blush: 0.35, ear: { show: false },
  };
  const TILT = 0.06;
  // arm landmarks (design units)
    const FA = [92, -302], FB = [-100, -292]; // flute held level at chest, about to play
  function hairBack() {
    // long straight hair falling behind the shoulders to the waist
    const back = P((p) => {
      p.moveTo(-24, -414);
      p.bezierCurveTo(-42, -398, -46, -350, -44, -320);
      p.bezierCurveTo(-44, -290, -42, -262, -36, -238);
      p.lineTo(-26, -246);
      p.lineTo(-14, -236);
      p.lineTo(14, -236);
      p.lineTo(26, -246);
      p.lineTo(36, -238);
      p.bezierCurveTo(42, -262, 44, -290, 44, -320);
      p.bezierCurveTo(46, -350, 42, -398, 24, -414);
      p.closePath();
    });
    part(back, C.hairSh, { sh: shadowOf(C.hairSh, 1.2), lw: 1.7, rimW: 1.4, inner: () => {
      for (const x of [-34, -26, 26, 34]) stroke([[x * 0.7, -400], [x, -320], [x * 1.02, -250]], 1.1, rgba(ink(C.hairSh, 0.4), 0.6));
    } });
    // loop bun (half-up) peeking above the crown
    inHead(R, 0, () => {
      const loop = P((p) => p.ellipse(0.16, -0.06, 0.2, 0.15, 0.4, 0, 7));
      part(loop, C.hair, { sh: shadowOf(C.hair, 1.3), lw: 1.5, rimW: 0.015 });
      fillP(P((p) => p.ellipse(0.16, -0.06, 0.09, 0.06, 0.4, 0, 7)), C.hairSh);
    }, TILT);
  }
  function hairFront() {
    inHead(R, 0, () => {
      const cap = P((p) => {
        p.moveTo(-0.46, 0.66);
        p.bezierCurveTo(-0.55, 0.2, -0.3, -0.07, 0.02, -0.07);
        p.bezierCurveTo(0.34, -0.07, 0.56, 0.2, 0.46, 0.66);
        p.lineTo(0.38, 0.42);
        p.bezierCurveTo(0.3, 0.3, 0.14, 0.24, 0.08, 0.24);
        p.lineTo(-0.36, 0.34);
        p.lineTo(-0.38, 0.5);
        p.closePath();
      });
      part(cap, C.hair, { sh: shadowOf(C.hair, 1.3), shift: [0.05, 0.04], rimW: 0.015, lw: 1.6, line: ink(C.hairSh, 0.5) });
      hairShine(cap, 0, 0.36, 0.44, 0.36, C.hairHi, 0.7, 7);
      // side-swept fringe from a right-side parting over the left brow
      const sweep = P((p) => {
        p.moveTo(0.14, 0.08);
        p.bezierCurveTo(-0.06, 0.1, -0.28, 0.2, -0.38, 0.36);
        p.bezierCurveTo(-0.41, 0.42, -0.41, 0.48, -0.4, 0.52);
        p.lineTo(-0.33, 0.44);
        p.lineTo(-0.28, 0.48);
        p.bezierCurveTo(-0.24, 0.4, -0.16, 0.37, -0.1, 0.37);
        p.lineTo(-0.06, 0.42);
        p.bezierCurveTo(-0.02, 0.35, 0.06, 0.32, 0.12, 0.32);
        p.lineTo(0.17, 0.37);
        p.bezierCurveTo(0.2, 0.28, 0.22, 0.16, 0.14, 0.08);
        p.closePath();
      });
      part(sweep, C.hair, { sh: shadowOf(C.hair, 1.3), shift: [0.03, 0.03], rimW: 0.012, lw: 1.5, line: ink(C.hairSh, 0.5), inner: () => {
        stroke([[0.08, 0.12], [-0.1, 0.2], [-0.28, 0.38]], 1, rgba(ink(C.hairSh, 0.4), 0.7));
        stroke([[0.14, 0.14], [0.04, 0.22], [-0.06, 0.34]], 1, rgba(ink(C.hairSh, 0.4), 0.7));
        stroke([[0.06, 0.14], [-0.12, 0.2], [-0.24, 0.3]], 3.5, rgba(C.hairHi, 0.8));
      } });
      // long front locks (hime-style) down to the collarbone
      lock([[-0.4, 0.42], [-0.44, 0.7], [-0.42, 1.0], [-0.44, 1.3]], [0.05, 0.055, 0.045, 0.004], C.hair, { n: 2, line: ink(C.hairSh, 0.5), sh: shadowOf(C.hair, 1.3) });
      lock([[0.4, 0.4], [0.44, 0.7], [0.43, 1.0], [0.46, 1.25]], [0.05, 0.055, 0.045, 0.004], C.hair, { n: 2, line: ink(C.hairSh, 0.5), sh: shadowOf(C.hair, 1.3) });
      // jade comb + red string in the half-up
      part(P((p) => p.roundRect(0.22, 0.02, 0.18, 0.07, 0.03)), C.jade, { lw: 1.1, rimW: 0.01, sh: mix(C.jade, '#2d6a5a', 0.4), shift: [0.01, 0.02] });
      line(curve([[0.3, 0.1], [0.36, 0.2], [0.33, 0.32]]), C.red, 1.6);
    }, TILT);
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
    culture: '台灣客家藍衫：靛藍長衫、右衽大襟、寬袖反摺淺色袖口（袖口花邊），配黑色圍身裙與銀鍊、黑褲布鞋。奇幻處：淡紫灰長髮、低垂的金色眼瞳與玉笛。',
    model: '長衫＋圍裙兩層大形；寬袖做成獨立布料（布料模擬或骨骼擺動）；袖口色帶、銀鍊用貼圖＋簡化網格；笛子為獨立道具。',
    palette: [[C.shirt, '藍衫靛', 'indigo shirt'], [C.cuff, '袖口淺藍', 'cuff band'], [C.apron, '圍身裙', 'apron'], [C.hair, '暮紫灰髮', 'dusk-lilac hair'], [C.skin, '膚', 'skin'], [C.jade, '玉笛', 'jade flute'], [C.red, '紅線', 'red string']],
    callouts: [
      { zh: '玉笛・渡魂謠', en: 'jade dizi flute, red-string tag', at: [70, -298] },
      { zh: '寬袖反摺袖口', en: 'wide sleeves, turned-back cuffs', at: [-58, -258] },
      { zh: '圍身裙＋銀鍊', en: 'Hakka apron with silver chain', at: [0, -200] },
      { zh: '藍衫長衫', en: 'long indigo 藍衫 to mid-calf', at: [38, -110] },
      { zh: '半紮髮・玉梳', en: 'half-up loop, jade comb, red string', at: [16, -420] },
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
      hairBack();
      legs();
      shirt();
      apron();
      neck(R, C.skin, { bot: -348, w: 0.11 });
      inHead(R, 0, () => drawFace(F), TILT);
      hairFront();
      arms();
      hands();
      motes([[-100, -330, 1.2], [-80, -350, 0.9], [-112, -312, 0.8], [96, -340, 0.8]], '#d8f6ff');
    },
    back(c, G2, col) {
      c.fillStyle = col;
      // long hair fall + loop bun
      c.beginPath();
      c.moveTo(-26, -416);
      c.bezierCurveTo(-50, -380, -50, -280, -44, -236);
      c.lineTo(44, -236);
      c.bezierCurveTo(50, -280, 50, -380, 26, -416);
      c.fill();
      c.beginPath();
      c.ellipse(-10, -426, 13, 9, 0, 0, 7);
      c.fill();
      // apron ties bow
      c.fillRect(-46, -272, 92, 6);
      c.beginPath();
      c.moveTo(0, -268);
      c.lineTo(-8, -240);
      c.lineTo(8, -240);
      c.fill();
    },
  });
})();
