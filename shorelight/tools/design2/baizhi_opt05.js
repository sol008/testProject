// 白芷 v2 — 05 引魂舟娘 Soul-Ferry Girl (trade-based historical + soul-guide fantasy)
(function () {
  'use strict';
  const B = window.BZ;
  const { P, part, stroke, line, fillP, glow, clipped, ribbon, curve, poly, mix, rgba, ink, lighten, shadowOf, hand, foot, tassel, jadeTag, motes, LW, inHead, neck, redString, stageGrad, bokeh, rng } = B;
  const R = B.rig(6.8);
  const C = {
    straw: '#b99b5e', strawD: '#7a6036', hat: '#d2b57a', shirt: '#2f4a6a', trouser: '#283247', wrap: '#ece6da',
    skin: '#f4dfd0', lantern: '#f4f1e8', flame: '#8fd8ff', red: '#b8303a', bamboo: '#a8a05a', jade: '#8fd0b0',
  };
  const HD = B.bzHead(R, { tilt: 0.06, skin: C.skin, len: -238, frontLen: -270, face: { eye: { lookX: 0.03, irisDy: -0.016, halfLid: 0.1 } } });
  const POLE = 62;
  function pole() {
    // 燈篙: bamboo pole taller than her, hook at top, paper soul-lantern hanging
    const p = ribbon([[POLE - 2, 0], [POLE, -250], [POLE + 2, -486]], [3, 2.8, 2.4]);
    part(p, C.bamboo, { lw: 1.4, rimW: 1, inner: () => { for (let y = -60; y > -480; y -= 62) line(poly([[POLE - 4, y], [POLE + 4, y]], false), ink(C.bamboo, 0.4), 1.3); } });
    // crossbar hook
    line(curve([[POLE + 2, -478], [POLE + 18, -484], [POLE + 30, -476]]), ink(C.bamboo, 0.3), 2.6);
    line(curve([[POLE + 30, -476], [POLE + 30, -462]]), C.red, 1.3);
  }
  function lantern() {
    const x = POLE + 30, y = -440;
    glow(x, y, 50, C.flame, 0.55);
    const body = P((p) => {
      p.moveTo(x - 10, y - 18);
      p.bezierCurveTo(x - 16, y - 8, x - 16, y + 8, x - 10, y + 18);
      p.lineTo(x + 10, y + 18);
      p.bezierCurveTo(x + 16, y + 8, x + 16, y - 8, x + 10, y - 18);
      p.closePath();
    });
    part(body, C.lantern, { lw: 1.5, rimW: 1, sh: '#bcd2e0', inner: (c) => {
      const g = c.createRadialGradient(x, y + 2, 1, x, y, 16);
      g.addColorStop(0, rgba(C.flame, 0.9));
      g.addColorStop(1, rgba(C.flame, 0));
      c.fillStyle = g;
      c.fillRect(x - 16, y - 18, 32, 36);
      for (const k of [-10, -3, 4, 11]) line(curve([[x - 14, y + k], [x, y + k + 2], [x + 14, y + k]]), rgba('#7a9ab0', 0.6), 0.9);
      c.fillStyle = '#20324a';
      c.font = '11px "WenQuanYi Zen Hei"';
      c.textAlign = 'center';
      c.fillText('引', x, y + 4);
    } });
    part(P((p) => p.roundRect(x - 11, y - 22, 22, 5, 1.5)), '#2a2228', { lw: 1, rim: false });
    part(P((p) => p.roundRect(x - 11, y + 17, 22, 5, 1.5)), '#2a2228', { lw: 1, rim: false });
    tassel(x, y + 22, 14, C.red, { w: 3 });
  }
  function legs() {
    for (const s of [-1, 1]) {
      // rolled wide trousers to mid-calf
      const tr = P((p) => {
        p.moveTo(s * 3, -190);
        p.lineTo(s * 34, -190);
        p.bezierCurveTo(s * 37, -150, s * 36, -100, s * 33, -74);
        p.lineTo(s * 8, -74);
        p.bezierCurveTo(s * 6, -110, s * 4, -150, s * 3, -190);
        p.closePath();
      });
      part(tr, C.trouser, { lw: 1.7, rimW: 1.3, inner: () => {
        stroke([[s * 18, -170], [s * 20, -120], [s * 17, -80]], 2.4, rgba('#000', 0.3));
      } });
      // rolled cuff
      part(P((p) => p.roundRect(s > 0 ? 7 : -34, -82, 27, 10, 3)), mix(C.trouser, '#ffffff', 0.15), { lw: 1.3, rimW: 0.8 });
      // 綁腿 leg wraps (spiral bands)
      const lg = P((p) => {
        p.moveTo(s * 10, -72);
        p.lineTo(s * 30, -72);
        p.lineTo(s * 26, -14);
        p.lineTo(s * 12, -14);
        p.closePath();
      });
      part(lg, C.wrap, { lw: 1.4, rimW: 0.9, sh: '#c9c0b4', inner: () => {
        for (let y = -66; y < -16; y += 8) line(poly([[s * 10, y + 4], [s * 31, y - 2]], false), rgba('#9a9080', 0.8), 1);
      } });
    }
    foot(-19, 0, 30, 'straw', { skin: C.skin, straw: '#c9a86a', cord: '#8a6a3a' }, -1);
    foot(19, 0, 30, 'straw', { skin: C.skin, straw: '#c9a86a', cord: '#8a6a3a' }, 1);
  }
  function shirt() {
    const sp = P((p) => {
      p.moveTo(-12, -348);
      p.lineTo(12, -348);
      p.lineTo(34, -300);
      p.lineTo(38, -186);
      p.lineTo(-38, -186);
      p.lineTo(-34, -300);
      p.closePath();
    });
    part(sp, C.shirt, { lw: 1.7, rimW: 1.2, inner: () => {
      line(poly([[0, -348], [0, -186]], false), mix(C.shirt, '#ffffff', 0.3), 1.6);
      for (const y of [-330, -300, -270, -240]) B.knot(0, y, 3, '#d8d0c0');
      part(P((p) => p.roundRect(-38, -226, 76, 9, 2)), '#5a4a3a', { lw: 1, rim: false });
    } });
  }
  function cape() {
    // 簑衣 straw rain cape: three tiers of palm-fibre fringe, open at the front
    const r = rng(5);
    const tier = (y0, y1, wTop, wBot, col, inset) => {
      for (const s of [-1, 1]) {
        const tp = P((p) => {
          p.moveTo(s * (inset + 2), y0);
          p.lineTo(s * wTop, y0);
          p.lineTo(s * wBot, y1 - 6);
          // ragged fringe bottom
          const n = 9;
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            const x = s * (wBot - t * (wBot - inset - 6 - (y1 - y0) * 0.1));
            p.lineTo(x, y1 + (i % 2 ? -5 : 3) + r() * 3);
          }
          p.lineTo(s * (inset + 6 + (y1 - y0) * 0.08), y1 - 8);
          p.closePath();
        });
        part(tp, col, { lw: 1.6, rimW: 1.3, sh: shadowOf(col, 1.3), shift: [s > 0 ? 5 : 3, 3], inner: () => {
          for (let i = 0; i < 16; i++) {
            const t = i / 15;
            const x0 = s * (inset + 4 + t * (wTop - inset - 4)), x1 = s * (inset + 8 + t * (wBot - inset - 8));
            stroke([[x0, y0 + 2], [lp2(x0, x1, 0.5) + r() * 2, (y0 + y1) / 2], [x1, y1 - 2]], 1.1, rgba(i % 3 ? C.strawD : lighten(col, 0.3), 0.7));
          }
        } });
      }
    };
    const lp2 = (a, b, t) => a + (b - a) * t;
    tier(-262, -148, 58, 70, mix(C.straw, '#000', 0.08), 22);
    tier(-310, -218, 54, 64, C.straw, 16);
    tier(-348, -270, 40, 58, lighten(C.straw, 0.08), 11);
    // tie cord at the collar
    line(curve([[-10, -344], [0, -338], [10, -344]]), C.red, 2);
  }
  function armR() {
    // right forearm emerges from the cape to grip the pole
    const fa = ribbon([[38, -262], [50, -262], [POLE - 2, -260]], [6.5, 6, 5.5]);
    part(fa, C.shirt, { lw: 1.6, rimW: 1 });
    hand(POLE - 6, -262, -1.62, 28, 'grip', C.skin, -1);
    redString(POLE - 8, -262, 4.4, -1.6);
  }
  function hat() {
    // 斗笠 conical bamboo hat, cord tied under the chin
    const cy = -404, apex = -446, rx = 70;
    const hu = R.hu;
    const c0 = B.H2D(R, 0, 0.06, -0.36, 0.95), c1 = B.H2D(R, 0, 0.06, 0.36, 0.95), ch = B.H2D(R, 0, 0.06, 0.0, 1.06);
    line(curve([[-rx * 0.45, cy + 4], c0, ch]), C.red, 1.4);
    line(curve([[rx * 0.45, cy + 4], c1, ch]), C.red, 1.4);
    void hu;
    const under = P((p) => p.ellipse(0, cy, rx, 9, -0.05, 0, Math.PI));
    part(under, mix(C.hat, '#4a3a20', 0.5), { lw: 1.4, rim: false, sh: false });
    const cone = P((p) => {
      p.moveTo(-rx, cy + 3);
      p.quadraticCurveTo(-rx * 0.5, cy - 14, -4, apex);
      p.lineTo(4, apex);
      p.quadraticCurveTo(rx * 0.5, cy - 18, rx, cy - 4);
      p.quadraticCurveTo(0, cy + 6, -rx, cy + 3);
      p.closePath();
    });
    part(cone, C.hat, { lw: 1.8, rimW: 1.4, shift: [6, 2], inner: () => {
      for (let i = -9; i <= 9; i++) stroke([[i * 0.6, apex + 2], [i * 7.6, cy + 2 - i * 0.4]], 1, rgba('#8a6a3a', 0.65));
      for (const k of [0.35, 0.65]) line(curve([[-rx * k, cy - 14 * (1 - k) + 2], [0, cy - 26 * (1 - k)], [rx * k, cy - 18 * (1 - k) - 1]]), rgba('#7a5a2a', 0.6), 1);
    } });
    part(P((p) => p.ellipse(0, apex + 2, 5, 3, 0, 0, 7)), '#7a5a2a', { lw: 1, rim: false });
    // brim cast shadow over the forehead
    if (!B.G.sil) clipped(P((p) => p.rect(-60, cy + 4, 120, 22)), (c) => {
      const g = c.createLinearGradient(0, cy + 4, 0, cy + 22);
      g.addColorStop(0, 'rgba(40,30,60,0.35)');
      g.addColorStop(1, 'rgba(40,30,60,0)');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(0, cy + 4, 34, 18, 0, 0, Math.PI);
      c.fill();
    });
  }
  B.DESIGNS.push({
    n: 5,
    zh: '引魂舟娘',
    en: 'Soul-Ferry Girl',
    tier: 'TRADE · 引魂人',
    ratio: 6.8,
    shape: 'triangle · steady',
    accent: '#2f4a6a',
    idea: '陳伯的引魂人行頭穿在她身上：斗笠、簑衣、燈篙上一盞引魂燈——她仰頭聽著燈裡的聲音，像在等某艘看不見的船。',
    culture: '基隆八斗子漁家與渡船人的雨具：竹編斗笠、棕簑衣、對襟短衫、捲褲綁腿、草鞋；中元普渡豎「燈篙」引孤魂的習俗。奇幻：燈篙上是只照亡魂的冷藍引魂燈。',
    model: '斗笠為單一圓錐；簑衣做三層裙片網格＋草纖維 alpha 貼圖（不做髮絲級幾何）；燈篙為道具並帶燈籠擺動骨；燈光為點光源＋emissive。',
    palette: [[C.straw, '棕簑', 'straw cape'], [C.hat, '竹笠', 'bamboo hat'], [C.shirt, '靛衫', 'indigo shirt'], [C.wrap, '綁腿白', 'leg wraps'], [C.flame, '引魂藍', 'soul-light'], [C.skin, '膚', 'skin'], [C.red, '紅繩', 'red cord']],
    callouts: [
      { zh: '斗笠＋紅繩', en: 'bamboo hat tied with red cord', at: [-44, -414] },
      { zh: '引魂燈・燈篙', en: 'soul-lantern on a 燈篙 pole', at: [92, -440] },
      { zh: '三層簑衣', en: 'three-tier straw rain cape', at: [-56, -190] },
      { zh: '捲褲・綁腿', en: 'rolled trousers, leg wraps', at: [-22, -48] },
      { zh: '草鞋', en: 'straw sandals', at: [22, -6] },
    ],
    bg: ['#9fb0bc', '#4a5a6a'],
    fs: 0.92,
    fx: -14,
    bust: { y: -392, z: 1.75 },
    rim: '#e6f4ff',
    shTint: '#2a3a5a',
    stage(c, x, y, w, h) {
      stageGrad(c, x, y, w, h, ['#1e2a3a', '#3e5266', '#7a8a92']);
      // rain & sea mist
      c.strokeStyle = 'rgba(220,235,255,0.25)';
      c.lineWidth = 1;
      const r = rng(9);
      for (let i = 0; i < 60; i++) {
        const rx = x + r() * w, ry = y + r() * h;
        c.beginPath();
        c.moveTo(rx, ry);
        c.lineTo(rx - 3, ry + 12);
        c.stroke();
      }
      c.fillStyle = 'rgba(20,28,44,0.6)';
      c.fillRect(x, y + h * 0.78, w, h * 0.22);
      bokeh(c, x, y + h * 0.72, w, h * 0.12, 10, ['#8fd8ff', '#ffffff'], 17, 6, 0.5);
    },
    draw() {
      pole();
      HD.back();
      legs();
      shirt();
      neck(R, C.skin, { bot: -346, w: 0.11 });
      HD.face();
      HD.front();
      cape();
      armR();
      hat();
      lantern();
      motes([[100, -410, 1.1], [80, -400, 0.8], [110, -380, 0.9], [70, -470, 0.7]], C.flame);
    },
    back(c, G2, col) {
      B.bzBack(c, R, -238, col);
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(-50, -330);
      c.lineTo(50, -330);
      c.lineTo(66, -150);
      c.lineTo(-66, -150);
      c.fill();
    },
  });
})();
