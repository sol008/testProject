// 白芷 v2 — 04 白家燈籠 Paper-Lantern Girl (whimsical fantasy)
(function () {
  'use strict';
  const B = window.BZ;
  const { P, part, stroke, line, fillP, glow, ribbon, curve, poly, mix, rgba, ink, lighten, shadowOf, hand, foot, tassel, jadeTag, motes, drawFace, LW, inHead, neck, lock, flute, redString, stageGrad, bokeh, hairShine } = B;
  const R = B.rig(5.5);
  const C = {
    paper: '#fbf0d8', red: '#d23b35', lacquer: '#2c2228', hair: '#f0a476', hairSh: '#c66f58', hairHi: '#ffe0c0', gold: '#e8b84a',
    skin: '#f9e3d3', legging: '#f3ece4', glowC: '#ffc870', jade: '#8fd0b0', shoe: '#2c2228',
  };
  const F = {
    skin: C.skin, W: 0.42, jawX: 0.3, jawY: 0.77, chinW: 0.1, cheek: 0.8, chinY: 0.98,
    eye: { y: 0.62, x: 0.19, w: 0.2, h: 0.18, shape: 'round', tilt: -0.005, iris: '#d89a2a', irisR: 0.072, irisH: 1.15, pupil: 0.38, lid: 'double', glow: '#ffd070', lashes: 2, lineC: '#3a1e1a', lineW: 2.6, refl: '#fff0b0' },
    brow: { y: 0.45, x0: 0.08, len: 0.14, th: 0.016, arch: 0.02, tilt: -0.012, col: '#b0604a' },
    nose: { type: 'button', y: 0.775, w: 0.03 },
    mouth: { type: 'o', y: 0.875, w: 0.06, open: 0.04 },
    blush: 1, blushLines: true, freckles: true, ear: { show: false },
  };
  const TILT = -0.08;
  function bunsBack() {
    inHead(R, 0, () => {
      // short back hair mass
      const bk = P((p) => {
        p.moveTo(-0.48, 0.62);
        p.bezierCurveTo(-0.58, 0.12, -0.3, -0.08, 0, -0.08);
        p.bezierCurveTo(0.3, -0.08, 0.58, 0.12, 0.48, 0.62);
        p.bezierCurveTo(0.46, 0.85, 0.36, 0.98, 0.26, 1.02);
        p.lineTo(-0.26, 1.02);
        p.bezierCurveTo(-0.36, 0.98, -0.46, 0.85, -0.48, 0.62);
        p.closePath();
      });
      part(bk, C.hairSh, { sh: false, lw: 1.6, rimW: 0.015, line: ink(C.hairSh, 0.55) });
    }, TILT);
  }
  function buns() {
    inHead(R, 0, () => {
      for (const s of [-1, 1]) {
        // 雙丫髻 twin buns shaped like little lanterns: ribbed sphere + black caps + tassel
        const cx = s * 0.4, cy = 0.02;
        const bun = P((p) => p.ellipse(cx, cy, 0.19, 0.17, 0, 0, 7));
        part(bun, C.hair, { sh: shadowOf(C.hair, 1.2), shift: [0.03, 0.03], rimW: 0.014, lw: 1.5, line: ink(C.hairSh, 0.55), inner: () => {
          for (const k of [-0.6, 0, 0.6]) line(P((p) => p.ellipse(cx, cy, 0.19 * Math.abs(Math.cos(k * 1.2)) + 0.001, 0.17, 0, -Math.PI / 2, Math.PI / 2, k < 0)), rgba(C.hairSh, 0.7), 1);
          stroke([[cx - 0.1, cy - 0.1], [cx - 0.02, cy - 0.14], [cx + 0.08, cy - 0.12]], 3, rgba(C.hairHi, 0.8));
        } });
        part(P((p) => p.roundRect(cx - 0.07, cy - 0.21, 0.14, 0.05, 0.015)), C.lacquer, { lw: 1.1, rim: false, sh: false });
        part(P((p) => p.roundRect(cx - 0.07, cy + 0.16, 0.14, 0.05, 0.015)), C.lacquer, { lw: 1.1, rim: false, sh: false });
      }
    }, TILT);
  }
  function bunTassels() {
    // long red tassels hanging from the buns down to the chest
    const pos = [[-30, -398], [31, -402]];
    pos.forEach(([x, y], i) => {
      line(curve([[x, y], [x + (i ? 4 : -5), y + 30], [x + (i ? 6 : -8), y + 52]]), C.red, 1.6);
      tassel(x + (i ? 6 : -8), y + 52, 22, C.red, { w: 4.5, cap: C.gold, sway: i ? 2 : -2 });
    });
  }
  function hairFront() {
    inHead(R, 0, () => {
      const cap = P((p) => {
        p.moveTo(-0.47, 0.6);
        p.bezierCurveTo(-0.55, 0.14, -0.3, -0.06, 0, -0.06);
        p.bezierCurveTo(0.3, -0.06, 0.55, 0.14, 0.47, 0.6);
        p.lineTo(0.4, 0.4);
        p.lineTo(-0.4, 0.4);
        p.closePath();
      });
      part(cap, C.hair, { sh: shadowOf(C.hair, 1.2), shift: [0.04, 0.04], rimW: 0.015, lw: 1.6, line: ink(C.hairSh, 0.55) });
      hairShine(cap, 0, 0.38, 0.45, 0.36, C.hairHi, 0.75, 8);
      // round puffy fringe made of 5 soft scallops
      const fr = P((p) => {
        p.moveTo(-0.42, 0.24);
        p.bezierCurveTo(-0.2, 0.06, 0.2, 0.06, 0.42, 0.24);
        p.quadraticCurveTo(0.44, 0.4, 0.4, 0.5);
        const xs = [0.4, 0.24, 0.08, -0.08, -0.24, -0.4];
        for (let i = 0; i < 5; i++) p.quadraticCurveTo((xs[i] + xs[i + 1]) / 2, 0.52 - (i === 2 ? 0.02 : 0), xs[i + 1], 0.43 + (i % 2 ? 0.02 : 0));
        p.quadraticCurveTo(-0.44, 0.4, -0.42, 0.24);
        p.closePath();
      });
      part(fr, C.hair, { sh: shadowOf(C.hair, 1.2), shift: [0.03, 0.03], rimW: 0.012, lw: 1.5, line: ink(C.hairSh, 0.55), inner: () => {
        for (const x of [-0.24, -0.08, 0.08, 0.24]) stroke([[x * 0.7, 0.16], [x, 0.3], [x, 0.44]], 1, rgba(C.hairSh, 0.8));
        stroke([[-0.3, 0.2], [-0.12, 0.14], [0.06, 0.15]], 3.5, rgba(C.hairHi, 0.8));
      } });
      // cheek tufts
      for (const s of [-1, 1]) lock([[s * 0.4, 0.4], [s * 0.45, 0.6], [s * 0.4, 0.8], [s * 0.42, 0.9]], [0.05, 0.055, 0.03, 0.004], C.hair, { n: 1, line: ink(C.hairSh, 0.55), sh: shadowOf(C.hair, 1.2) });
    }, TILT);
  }
  function legs() {
    for (const s of [-1, 1]) {
      const lg = ribbon([[s * 15, -150], [s * 16, -90], [s * 15, -40], [s * 16, -14]], [10, 8.5, 6.5, 6]);
      part(lg, C.legging, { lw: 1.5, rimW: 1, sh: '#cfc4d4' });
      for (const y of [-52, -36]) line(curve([[s * 9, y], [s * 16, y + 2], [s * 23, y]]), C.red, 1.7);
    }
    foot(-17, 0, 30, 'cloth', { shoe: C.shoe, sole: '#efe6d6' }, -1, { rot: 0.16 });
    foot(17, 0, 30, 'cloth', { shoe: C.shoe, sole: '#efe6d6' }, 1, { rot: 0.16 });
  }
  function skirt() {
    // round lantern skirt: bamboo ribs + black lacquer caps + the surname 白 painted in red
    const top = -252, bot = -124, cy = (top + bot) / 2, rx = 66, ry = (bot - top) / 2;
    const sk = P((p) => {
      p.moveTo(-30, top);
      p.bezierCurveTo(-rx * 1.0, top + 6, -rx * 1.08, bot - 18, -36, bot);
      p.lineTo(36, bot);
      p.bezierCurveTo(rx * 1.08, bot - 18, rx * 1.0, top + 6, 30, top);
      p.closePath();
    });
    part(sk, C.paper, {
      lw: 2.1, rimW: 1.8, sh: mix(C.paper, '#d29a70', 0.45), shift: [7, 3],
      inner: (c) => {
        const g = c.createRadialGradient(-8, cy, 6, 0, cy, 76);
        g.addColorStop(0, rgba(C.glowC, 0.85));
        g.addColorStop(1, rgba(C.glowC, 0));
        c.fillStyle = g;
        c.fillRect(-80, top, 160, bot - top);
        // horizontal bamboo ribs (follow the round form)
        for (let i = 1; i < 9; i++) {
          const y = top + (i * (bot - top)) / 9;
          const k = Math.sin((i / 9) * Math.PI);
          line(curve([[-rx * (0.5 + 0.55 * k), y - 1], [0, y + 3 + k * 2], [rx * (0.5 + 0.55 * k), y - 1]]), rgba('#a8784a', 0.75), 1.1);
        }
        // vertical seams
        for (const s of [-1, 1]) line(curve([[s * 22, top], [s * 40, cy], [s * 24, bot]]), rgba('#a8784a', 0.45), 1);
        // surname 白 in red brush
        c.save();
        c.fillStyle = C.red;
        c.font = '600 40px "WenQuanYi Zen Hei"';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('白', -2, cy + 2);
        c.restore();
      },
    });
    // lacquer caps
    part(P((p) => p.roundRect(-34, top - 4, 68, 10, 3)), C.lacquer, { lw: 1.5, rimW: 1 });
    part(P((p) => p.roundRect(-40, bot - 4, 80, 10, 3)), C.lacquer, { lw: 1.5, rimW: 1 });
    line(poly([[-32, top + 1], [32, top + 1]], false), C.gold, 1.2);
    line(poly([[-38, bot + 1], [38, bot + 1]], false), C.gold, 1.2);
    // centre tassel
    tassel(0, bot + 6, 24, C.red, { w: 5, cap: C.gold });
  }
  function top() {
    const bd = P((p) => {
      p.moveTo(-11, -338);
      p.bezierCurveTo(-20, -336, -27, -330, -29, -322);
      p.bezierCurveTo(-30, -300, -30, -275, -30, -252);
      p.lineTo(30, -252);
      p.bezierCurveTo(30, -275, 30, -300, 29, -322);
      p.bezierCurveTo(27, -330, 20, -336, 11, -338);
      p.closePath();
    });
    part(bd, C.red, { lw: 1.8, rimW: 1.4, inner: () => {
      // white piping & frog buttons down the centre front (對襟 opening)
      line(poly([[0, -340], [0, -252]], false), C.paper, 2.2);
      for (const y of [-326, -304, -282, -262]) B.knot(0, y, 3.4, C.gold);
      stroke([[-18, -300], [-20, -270], [-22, -256]], 2.2, rgba(shadowOf(C.red, 1.3), 0.8));
      stroke([[19, -300], [21, -270], [22, -256]], 2.6, rgba(shadowOf(C.red, 1.4), 0.9));
    } });
    part(P((p) => {
      p.moveTo(-12, -350);
      p.quadraticCurveTo(0, -346, 12, -350);
      p.lineTo(13, -339);
      p.quadraticCurveTo(0, -334, -13, -339);
      p.closePath();
    }), C.paper, { lw: 1.3, rimW: 0.8 });
  }
  function sleeves() {
    // round puffed lantern sleeves
    for (const s of [-1, 1]) {
      const sl = P((p) => p.ellipse(s * 38, -314, 17, 20, s * 0.15, 0, 7));
      part(sl, C.paper, { lw: 1.8, rimW: 1.4, sh: mix(C.paper, '#d29a70', 0.45), inner: () => {
        for (const k of [-10, 0, 10]) line(curve([[s * 24, -314 + k], [s * 38, -312 + k + 2], [s * 53, -314 + k]]), rgba('#a8784a', 0.7), 1);
        glow(s * 36, -316, 14, C.glowC, 0.4);
      } });
      part(P((p) => p.roundRect(s * 38 - 13, -297, 26, 6, 2)), C.lacquer, { lw: 1.2, rim: false });
    }
  }
  function arms() {
    // viewer-left: hangs, holding the flute vertically; viewer-right: raised in a cheerful wave
    const armL = ribbon([[-44, -295], [-50, -262], [-52, -236]], [6, 5.4, 4.6]);
    part(armL, C.skin, { lw: 1.5, rimW: 1 });
    redString(-52, -238, 4.8, 0.05);
    const armR = ribbon([[46, -300], [62, -326], [64, -360]], [6, 5.2, 4.5]);
    part(armR, C.skin, { lw: 1.5, rimW: 1 });
    hand(64, -360, Math.PI - 0.1, 31, 'open', C.skin, -1);
  }
  function fluteHand() {
    flute([-50, -282], [-56, -168], 2.6, { col: C.jade, holes: 6 });
    hand(-52, -237, 0.08, 30, 'grip', C.skin, -1);
    line(curve([[-56, -170], [-58, -160], [-56, -150]]), C.red, 1.4);
    jadeTag(-56, -142, 9, { cord: false });
  }
  B.DESIGNS.push({
    n: 4,
    zh: '白家燈籠',
    en: 'The Bai-House Lantern',
    tier: 'WHIMSICAL · 紙燈',
    ratio: 5.5,
    shape: 'round · bouncy',
    accent: '#d23b35',
    idea: '「白芷」這名字是寫在燈籠上的姓——她把自己穿成一盞會走路的家門燈籠：圓裙、雙丫髻小燈、對什麼都「哇」的一聲。',
    culture: '台灣家戶與廟口的紙燈籠：竹篾骨、上下黑漆蓋、紅字寫姓氏、紅流蘇；少女雙丫髻、對襟短襖與盤扣、綁腿布鞋。奇幻：燈籠化成的圓裙會從裡面發光。',
    model: '圓裙是一個球形殼＋上下環（可做擠壓伸縮動畫）；竹骨與「白」字為貼圖；雙髻小燈與流蘇用骨骼擺動；裙內暖光為 emissive。',
    palette: [[C.paper, '燈紙白', 'lantern paper'], [C.red, '燈籠紅', 'lantern red'], [C.lacquer, '黑漆', 'lacquer'], [C.hair, '杏桃髮', 'apricot hair'], [C.gold, '金', 'gold'], [C.skin, '膚', 'skin'], [C.jade, '玉', 'jade']],
    callouts: [
      { zh: '雙丫髻・小燈籠', en: 'twin buns as little lanterns', at: [-30, -420] },
      { zh: '對襟短襖・盤扣', en: 'centre-opening jacket, frog buttons', at: [0, -304] },
      { zh: '燈籠圓裙「白」', en: 'lantern skirt with her surname', at: [36, -190] },
      { zh: '玉笛・紅線玉牌', en: 'jade flute, red string, jade tag', at: [-56, -200] },
      { zh: '綁腿・布鞋', en: 'leg ties, cloth shoes', at: [16, -44] },
    ],
    bg: ['#f2d9b8', '#d08a6a'],
    bust: { y: -372, z: 1.65 },
    rim: '#fff4d0',
    shTint: '#7a3a5a',
    shAmt: 0.28,
    stage(c, x, y, w, h) {
      stageGrad(c, x, y, w, h, ['#3a2238', '#7a3c4a', '#c87a5a']);
      // strings of hanging lanterns
      for (let k = 0; k < 2; k++) {
        c.strokeStyle = 'rgba(30,10,20,0.5)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x, y + 30 + k * 60);
        c.quadraticCurveTo(x + w / 2, y + 70 + k * 60, x + w, y + 30 + k * 60);
        c.stroke();
        for (let i = 1; i < 6; i++) {
          const lx = x + (w * i) / 6, ly = y + 30 + k * 60 + Math.sin((i / 6) * Math.PI) * 38;
          c.fillStyle = 'rgba(255,120,80,0.55)';
          c.beginPath();
          c.ellipse(lx, ly + 10, 8, 10, 0, 0, 7);
          c.fill();
        }
      }
      bokeh(c, x, y, w, h * 0.6, 14, ['#ffb070', '#ffd890'], 41, 9, 0.45);
    },
    draw() {
      bunsBack();
      legs();
      skirt();
      top();
      neck(R, C.skin, { bot: -336, w: 0.1 });
      inHead(R, 0, () => drawFace(F), TILT);
      hairFront();
      buns();
      bunTassels();
      arms();
      sleeves();
      fluteHand();
      motes([[80, -380, 1.1], [70, -400, 0.8], [-80, -300, 0.9]], '#ffe0a0');
    },
    back(c, G2, col) {
      c.fillStyle = col;
      c.beginPath();
      c.ellipse(0, -386, 30, 30, 0, 0, 7);
      c.fill();
      c.fillRect(-36, -258, 72, 8);
      c.fillRect(-40, -128, 80, 8);
    },
  });
})();
