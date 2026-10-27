// 白芷 v2 — 10 海月傘 Jellyfish Parasol (bold fantasy on an oil-paper umbrella)
(function () {
  'use strict';
  const B = window.BZ;
  const { P, part, stroke, line, fillP, glow, clipped, ribbon, curve, poly, mix, rgba, ink, lighten, shadowOf, hand, foot, tassel, jadeTag, motes, LW, neck, redString, stageGrad, bokeh, flute, knot, rng } = B;
  const R = B.rig(6.8);
  const C = {
    ao: '#ddd6ee', trim: '#3a3a6a', skirt: '#c9d8ea', bell: '#bfe8f0', rim: '#f5a8c8', rib: '#c9a24a', skin: '#f6e3d8', jade: '#a8e0cc', red: '#c3303a', shoe: '#3a3a6a',
  };
  const HD = B.bzHead(R, {
    tilt: -0.04, skin: C.skin, len: -236, frontLen: -280, ends: { col: '#e8d8ff', a: 0.75 }, endsSpan: 1.0, sheen: '#7a7ab0', earDrop: '#f5a8c8', earBead: '#3a3a6a',
    face: { eye: { lookX: 0.035, irisDy: -0.024, halfLid: 0.14 } },
  });
  const UC = [26, -454], TILT = -0.12, URX = 96, UH = 48;
  const U = (x, y) => [UC[0] + x * Math.cos(TILT) - y * Math.sin(TILT), UC[1] + x * Math.sin(TILT) + y * Math.cos(TILT)];
  function tentacles(front) {
    // ribbon tentacles hanging from the rim (lantern-tassel logic); back ones dimmer
    const r = rng(front ? 3 : 8);
    const xs = front ? [-92, -80, -66, 70, 82, 94] : [-86, -58, -30, 0, 30, 58, 86];
    for (const x of xs) {
      const top = U(x * 0.98, 4);
      const L = 140 + r() * 150 + (Math.abs(x) < 40 ? 80 : 0);
      const sw = (r() - 0.5) * 30;
      const p = ribbon([top, [top[0] + sw * 0.3, top[1] + L * 0.35], [top[0] - sw * 0.4, top[1] + L * 0.7], [top[0] + sw, top[1] + L]], [3.4, 3, 2.2, 0.3]);
      part(p, front ? C.rim : mix(C.rim, C.bell, 0.5), { alpha: front ? 0.8 : 0.5, lw: 1.1, rimW: 0.8, rim: '#ffffff', line: ink(C.rim, 0.4), sh: false });
    }
  }
  function canopy() {
    const dome = P((p) => {
      const n = 10;
      const s0 = U(-URX, 0);
      p.moveTo(s0[0], s0[1]);
      const c1 = U(-URX * 0.95, -UH * 1.05), c2 = U(-URX * 0.5, -UH * 1.3), top = U(0, -UH * 1.3);
      p.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], top[0], top[1]);
      const c3 = U(URX * 0.5, -UH * 1.3), c4 = U(URX * 0.95, -UH * 1.05), e = U(URX, 0);
      p.bezierCurveTo(c3[0], c3[1], c4[0], c4[1], e[0], e[1]);
      // scalloped rim between rib tips
      for (let i = n; i > 0; i--) {
        const xa = -URX + ((i - 0.5) / n) * 2 * URX, xb = -URX + ((i - 1) / n) * 2 * URX;
        const m = U(xa, 9), q = U(xb, 0);
        p.quadraticCurveTo(m[0], m[1], q[0], q[1]);
      }
      p.closePath();
    });
    part(dome, C.bell, { alpha: 0.82, lw: 1.8, rimW: 2, rim: '#ffffff', line: ink(C.bell, 0.55), sh: mix(C.bell, '#6a7ab0', 0.3), shift: [6, 4], inner: (c) => {
      const g = c.createRadialGradient(UC[0] - 20, UC[1] - 40, 4, UC[0], UC[1] - 20, 110);
      g.addColorStop(0, 'rgba(255,255,255,0.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(UC[0] - 130, UC[1] - 90, 260, 120);
      // oil-paper ribs (bamboo) + painted jellyfish radial canals and gonad petals
      for (let i = 0; i <= 10; i++) {
        const x = -URX + (i / 10) * 2 * URX;
        line(curve([U(0, -UH * 1.3), U(x * 0.55, -UH * 1.0), U(x, 0)]), rgba(C.rib, 0.7), 1);
      }
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI - Math.PI * 0.88;
        const q = U(Math.cos(a) * 34, -UH * 0.75 + Math.sin(a) * 14);
        fillP(P((p) => p.ellipse(q[0], q[1], 12, 6, TILT + a * 0.3, 0, 7)), rgba(C.rim, 0.7));
      }
      // rim lights
      for (let i = 0; i < 20; i++) {
        const q = U(-URX + (i / 19) * 2 * URX, 2);
        fillP(P((p) => p.arc(q[0], q[1], 1.6, 0, 7)), '#ffffff');
      }
    } });
    // top finial (umbrella crown) with red tie
    const t = U(0, -UH * 1.3);
    part(P((p) => p.ellipse(t[0], t[1] - 3, 5, 4, 0, 0, 7)), C.rib, { lw: 1.1, rimW: 0.6 });
    line(curve([[t[0], t[1] - 2], [t[0] - 6, t[1] + 8], [t[0] - 3, t[1] + 16]]), C.red, 1.4);
  }
  function shaft() {
    const top = U(0, -UH * 1.3), hand0 = [44, -300];
    part(ribbon([top, [hand0[0], hand0[1] + 24]], 1.8), '#8a6a3a', { lw: 1.2, rimW: 0.6 });
  }
  function skirt() {
    // pleated skirt whose hem fades — she is growing translucent as she remembers
    const sk = P((p) => {
      p.moveTo(-28, -250);
      p.lineTo(28, -250);
      p.bezierCurveTo(38, -170, 50, -80, 54, -14);
      p.lineTo(-54, -14);
      p.bezierCurveTo(-50, -80, -38, -170, -28, -250);
      p.closePath();
    });
    part(sk, C.skirt, { lw: 1.7, rimW: 1.6, rim: '#ffffff', sh: '#a8b8d8', shift: [6, 2], inner: (c) => {
      for (const x of [-40, -26, -12, 2, 16, 30, 44]) stroke([[x * 0.55, -246], [x * 0.8, -140], [x, -18]], 1.3, rgba('#8a9cc0', 0.8));
      line(curve([[-50, -60], [0, -56], [50, -60]]), C.trim, 2.6);
      const g = c.createLinearGradient(0, -110, 0, -14);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(235,245,255,0.85)');
      c.fillStyle = g;
      c.fillRect(-60, -110, 120, 100);
    } });
    for (const s of [-1, 1]) foot(s * 14, 0, 25, 'cloth', { shoe: C.shoe, sole: '#e8e4f0' }, s, { rot: 0.1 });
    motes([[-40, -20, 1], [36, -26, 1.1], [0, -8, 0.8], [-20, -40, 0.7]], '#ffffff');
  }
  function ao() {
    const ap = P((p) => {
      p.moveTo(-11, -350);
      p.bezierCurveTo(-24, -348, -34, -342, -37, -333);
      p.bezierCurveTo(-40, -300, -38, -256, -40, -212);
      p.quadraticCurveTo(0, -204, 40, -212);
      p.bezierCurveTo(38, -256, 40, -300, 37, -333);
      p.bezierCurveTo(34, -342, 24, -348, 11, -350);
      p.closePath();
    });
    part(ap, C.ao, { lw: 1.8, rimW: 1.5, rim: '#ffffff', sh: '#b8acd4', inner: (c) => {
      c.strokeStyle = C.trim;
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(-42, -212);
      c.quadraticCurveTo(0, -204, 42, -212);
      c.stroke();
      line(curve([[3, -350], [-6, -332], [-24, -318], [-37, -312]]), C.trim, 3.4);
      // embroidered little jellyfish
      for (const [x, y] of [[20, -270], [-16, -240]]) {
        fillP(P((p) => p.ellipse(x, y, 5, 3.5, 0, Math.PI, 0)), rgba(C.rim, 0.9));
        for (let k = -1; k <= 1; k++) stroke([[x + k * 2.5, y], [x + k * 3, y + 5], [x + k * 2, y + 9]], 0.9, rgba(C.rim, 0.9));
      }
    } });
    knot(4, -352, 3, C.trim);
    knot(-22, -318, 3.2, C.trim, { angle: 0.4 });
    knot(-37, -296, 3.2, C.trim);
  }
  function arms() {
    // viewer-left hangs with the flute; viewer-right holds the parasol shaft at the chest
    const slL = P((p) => {
      p.moveTo(-34, -338);
      p.bezierCurveTo(-48, -330, -54, -290, -56, -250);
      p.bezierCurveTo(-58, -230, -54, -216, -48, -210);
      p.lineTo(-34, -214);
      p.bezierCurveTo(-36, -250, -38, -290, -36, -316);
      p.closePath();
    });
    part(slL, C.ao, { lw: 1.8, rimW: 1.4, rim: '#ffffff', sh: '#b8acd4' });
    part(P((p) => p.roundRect(-54, -222, 21, 9, 2)), C.trim, { lw: 1.2, rimW: 0.7 });
    flute([-52, -150], [-38, -238], 2.4, { col: C.jade, holes: 5 });
    hand(-45, -214, 0.12, 28, 'grip', C.skin, 1);
    line(curve([[-51, -152], [-53, -142], [-51, -134]]), C.red, 1.4);
    jadeTag(-51, -126, 8, { cord: false });
    redString(-45, -212, 4.4, 0.1);
    const slR = P((p) => {
      p.moveTo(34, -338);
      p.bezierCurveTo(48, -330, 56, -306, 56, -284);
      p.bezierCurveTo(54, -272, 46, -270, 38, -278);
      p.lineTo(30, -292);
      p.bezierCurveTo(36, -300, 38, -310, 36, -322);
      p.closePath();
    });
    part(slR, C.ao, { lw: 1.8, rimW: 1.4, rim: '#ffffff', sh: '#b8acd4' });
    part(P((p) => {
      p.moveTo(38, -278);
      p.lineTo(30, -292);
      p.lineTo(35, -296);
      p.lineTo(44, -282);
      p.closePath();
    }), C.trim, { lw: 1.2, rimW: 0.7 });
    hand(41, -296, -2.4, 27, 'grip', C.skin, -1);
  }
  B.DESIGNS.push({
    n: 10,
    zh: '海月傘',
    en: 'Jellyfish Parasol',
    tier: 'BOLD FANTASY · 漸透',
    ratio: 6.8,
    shape: 'dome · trailing verticals',
    accent: '#c86a9a',
    idea: '每想起一段記憶，她就更透明一些：撐著一把像海月水母的油紙傘，傘緣垂下的光帶如燈籠流蘇，裙襬已經淡得看得見後面的海。',
    culture: '傘取自台灣（美濃客家）竹骨油紙傘——婚嫁時象徵圓滿；衣著為大襟襖＋百褶裙、盤扣、布鞋。奇幻：傘面化作半透明水母鐘、流蘇成觸鬚，裙襬漸透明呼應「記憶越多越透明」。',
    model: '傘為獨立道具：傘面半透明（toon + fresnel）、觸鬚為 6–8 條帶骨飄帶；衣裙簡潔兩件；裙襬透明漸層用 alpha 貼圖／dither，可隨劇情進度調整。',
    palette: [[C.bell, '海月藍', 'jelly bell'], [C.rim, '桃光', 'rim pink'], [C.ao, '藕紫襖', 'lilac ao'], [C.skirt, '霧藍裙', 'mist skirt'], [C.trim, '靛鑲', 'indigo trim'], [C.rib, '竹骨', 'bamboo rib'], [C.skin, '膚', 'skin']],
    callouts: [
      { zh: '海月油紙傘', en: 'oil-paper umbrella as a jellyfish bell', at: [-30, -470] },
      { zh: '流蘇觸鬚', en: 'tassel-tentacle light ribbons', at: [92, -330] },
      { zh: '大襟襖・水母繡', en: 'side-fastened ao, jellyfish embroidery', at: [20, -270] },
      { zh: '漸透明裙襬', en: 'hem fading to transparency', at: [-30, -40] },
      { zh: '玉笛・紅線玉牌', en: 'jade flute, red string, jade tag', at: [-46, -180] },
    ],
    bg: ['#202a4a', '#3a3a64'],
    fs: 0.84,
    fx: -14,
    contourTh: 0.7,
    bust: { y: -386, z: 1.85 },
    rim: '#ffffff',
    shTint: '#3a3a7a',
    keyLight: '#f0e8ff',
    stage(c, x, y, w, h) {
      stageGrad(c, x, y, w, h, ['#141c3a', '#283462', '#4a4a7a']);
      bokeh(c, x, y, w, h, 26, ['#f5a8c8', '#bfe8f0', '#ffffff'], 91, 6, 0.5);
    },
    draw() {
      tentacles(false);
      HD.back();
      skirt();
      ao();
      neck(R, C.skin, { bot: -348, w: 0.11 });
      HD.face();
      HD.front();
      shaft();
      arms();
      canopy();
      tentacles(true);
      glow(UC[0], UC[1] - 30, 90, '#bfe8f0', 0.25);
    },
    back(c, G2, col) {
      B.bzBack(c, R, -236, col);
    },
  });
})();
