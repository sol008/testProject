// 白芷 v2 — 01 九份借衫 Borrowed Best of Jiufen (faithful historical)
(function () {
  'use strict';
  const B = window.BZ;
  const { P, part, stroke, line, fillP, clipped, ribbon, curve, mix, rgba, ink, lighten, shadowOf, hand, foot, knot, tassel, jadeTag, motes, drawFace, LW, inHead, neck, lock, redString, stageGrad, bokeh } = B;
  const R = B.rig(6.5);
  const C = {
    jacket: '#a9cacb', pipe: '#272b42', pipe2: '#efe2bf', trouser: '#30344c', skin: '#f6e1d1',
    hair: '#17151c', hairHi: '#5d6f98', red: '#c32f3b', jade: '#86c4a2', shoe: '#b8334a', bag: '#7d5a8c',
  };
  const HD = B.bzHead(R, { len: -228, frontLen: -258, tilt: -0.05, ends: { col: '#bff7ee', a: 0.55 }, skin: C.skin });
  function legs() {
    for (const s of [-1, 1]) {
      const leg = P((p) => {
        p.moveTo(s * 2, -170);
        p.lineTo(s * 38, -170);
        p.bezierCurveTo(s * 41, -120, s * 41, -60, s * 39, -16);
        p.lineTo(s * 7, -16);
        p.bezierCurveTo(s * 5, -60, s * 3, -120, s * 2, -170);
        p.closePath();
      });
      part(leg, C.trouser, {
        sh: shadowOf(C.trouser, 1.2), shift: [s > 0 ? 6 : 3, 2], rimW: 1.5, lw: 1.8,
        inner: () => {
          stroke([[s * 19, -150], [s * 21, -95], [s * 17, -35]], 2.6, rgba('#000', 0.3));
          stroke([[s * 30, -130], [s * 28, -70], [s * 32, -26]], 2, rgba('#000', 0.28));
          stroke([[s * 11, -70], [s * 14, -40], [s * 12, -18]], 1.8, rgba(lighten(C.trouser, 0.35), 0.5));
          stroke([[s * 26, -48], [s * 33, -40], [s * 37, -44]], 1.4, rgba(lighten(C.trouser, 0.35), 0.4));
          stroke([[s * 12, -36], [s * 22, -30], [s * 30, -34]], 1.4, rgba('#000', 0.3));
        },
      });
      part(P((p) => {
        p.moveTo(s * 7, -27);
        p.lineTo(s * 39.6, -27);
        p.lineTo(s * 39, -15);
        p.lineTo(s * 7, -15);
        p.closePath();
      }), C.jacket, { lw: 1.2, rimW: 1 });
      line(curve([[s * 7, -24], [s * 39.5, -24]]), C.pipe, 1.1);
    }
    const sc = { shoe: C.shoe, emb: '#f6d2dc', emb2: '#f2cf6a', emb3: '#6aa07a', sock: '#f3ede2' };
    foot(-23, 0, 33, 'xiuxie', sc, -1);
    foot(23, 0, 33, 'xiuxie', sc, 1);
  }
  function torso() {
    const tp = P((p) => {
      p.moveTo(-11, -347);
      p.bezierCurveTo(-22, -345, -34, -340, -40, -331);
      p.bezierCurveTo(-45, -300, -44, -255, -46, -215);
      p.bezierCurveTo(-49, -195, -55, -160, -57, -136);
      p.quadraticCurveTo(-57, -128, -50, -128);
      p.quadraticCurveTo(0, -122, 50, -128);
      p.quadraticCurveTo(57, -128, 57, -136);
      p.bezierCurveTo(55, -160, 49, -195, 46, -215);
      p.bezierCurveTo(44, -255, 45, -300, 40, -331);
      p.bezierCurveTo(34, -340, 22, -345, 11, -347);
      p.closePath();
    });
    part(tp, C.jacket, {
      lw: 1.9, rimW: 1.7, shift: [5, 3],
      inner: (c) => {
        c.fillStyle = shadowOf(C.jacket);
        c.beginPath();
        c.ellipse(-14, -292, 13, 4.5, 0.1, 0, Math.PI);
        c.ellipse(15, -292, 13, 4.5, -0.1, 0, Math.PI);
        c.fill();
        stroke([[-26, -270], [-31, -220], [-41, -135]], 3, rgba(shadowOf(C.jacket, 1.4), 0.7));
        stroke([[28, -268], [33, -215], [45, -135]], 3.4, rgba(shadowOf(C.jacket, 1.4), 0.8));
        stroke([[7, -250], [10, -205], [7, -132]], 2.2, rgba(shadowOf(C.jacket, 1.2), 0.55));
        stroke([[-10, -230], [-14, -190], [-19, -130]], 1.6, rgba(lighten(C.jacket, 0.5), 0.6));
        c.globalAlpha = 0.06;
        c.strokeStyle = '#ffffff';
        c.lineWidth = 0.5;
        for (let y = -350; y < -120; y += 3) {
          c.beginPath();
          c.moveTo(-70, y);
          c.lineTo(70, y + 1);
          c.stroke();
        }
        c.globalAlpha = 1;
        c.save();
        c.strokeStyle = C.pipe;
        c.lineWidth = 20;
        c.beginPath();
        c.moveTo(-59, -128);
        c.quadraticCurveTo(0, -121, 59, -128);
        c.stroke();
        c.lineWidth = 14;
        c.beginPath();
        c.moveTo(-57, -128);
        c.lineTo(-51, -172);
        c.moveTo(57, -128);
        c.lineTo(51, -172);
        c.stroke();
        c.strokeStyle = C.pipe2;
        c.lineWidth = LW(1.1);
        c.beginPath();
        c.moveTo(-44.5, -172);
        c.lineTo(-49, -137.5);
        c.quadraticCurveTo(0, -132, 49, -137.5);
        c.lineTo(44.5, -172);
        c.stroke();
        c.restore();
      },
    });
    for (const s of [-1, 1]) line(curve([[s * 57, -132], [s * 54, -152], [s * 52, -172]]), C.pipe, 2.4);
    const lapBand = P((p) => {
      p.moveTo(4, -348);
      p.bezierCurveTo(-4, -330, -22, -318, -41, -311);
      p.lineTo(-42, -300);
      p.bezierCurveTo(-22, -307, -2, -320, -6, -347);
      p.closePath();
    });
    part(lapBand, C.pipe, { lw: 1.2, rimW: 0.8, shift: [1.5, 1.5] });
    line(curve([[-3, -344], [-10, -326], [-24, -314], [-41, -306]]), C.pipe2, 0.9);
    const col = P((p) => {
      p.moveTo(-13.5, -360);
      p.quadraticCurveTo(0, -355, 13.5, -360);
      p.lineTo(14.5, -347);
      p.quadraticCurveTo(0, -341, -14.5, -347);
      p.closePath();
    });
    part(col, C.pipe, { lw: 1.3, rimW: 0.8, shift: [1.5, 1] });
    line(curve([[-13.5, -349], [0, -343.5], [13.5, -349]]), C.pipe2, 0.9);
    knot(5, -350, 3.6, '#1c2034');
    knot(-20, -317, 3.8, '#1c2034', { angle: 0.45 });
    knot(-43, -290, 3.8, '#1c2034', { angle: 0.05 });
    knot(-44, -262, 3.8, '#1c2034');
    knot(-45, -234, 3.8, '#1c2034');
  }
  function bagBehind() {
    const tube = ribbon([[-56, -392], [-42, -350], [-32, -318]], [4.6, 5, 5], { capStart: 'round' });
    part(tube, C.bag, { lw: 1.4, rimW: 1, inner: () => line(curve([[-55, -385], [-51.5, -382]]), '#e2c46a', 2.4) });
    tassel(-57, -394, 10, C.red, { w: 2.4, sway: -2 });
  }
  function arms() {
    for (const s of [-1, 1]) {
      const sl = P((p) => {
        p.moveTo(s * 33, -338);
        p.bezierCurveTo(s * 49, -330, s * 57, -300, s * 59, -268);
        p.bezierCurveTo(s * 61, -246, s * 57, -230, s * 50, -224);
        p.lineTo(s * 30, -232);
        p.bezierCurveTo(s * 32, -246, s * 36, -256, s * 40, -264);
        p.bezierCurveTo(s * 40, -288, s * 38, -308, s * 34, -320);
        p.closePath();
      });
      part(sl, C.jacket, {
        lw: 1.9, rimW: 1.5, shift: [s > 0 ? 5 : 2.5, 3],
        inner: () => {
          stroke([[s * 46, -312], [s * 52, -282], [s * 51, -258]], 2.4, rgba(shadowOf(C.jacket, 1.4), 0.75));
          stroke([[s * 42, -264], [s * 49, -250], [s * 46, -232]], 2.2, rgba(shadowOf(C.jacket, 1.5), 0.8));
          stroke([[s * 43, -330], [s * 47, -310]], 1.6, rgba(lighten(C.jacket, 0.5), 0.6));
        },
      });
      const cuff = P((p) => {
        p.moveTo(s * 52, -226);
        p.lineTo(s * 29, -234);
        p.lineTo(s * 31, -246);
        p.lineTo(s * 56, -238);
        p.closePath();
      });
      part(cuff, C.pipe, { lw: 1.3, rimW: 0.9 });
      line(curve([[s * 54, -235], [s * 30.5, -243]]), C.pipe2, 0.9);
      fillP(P((p) => p.ellipse(s * 32, -234, 3.4, 7, s * 0.25, 0, 7)), '#1a1b2a');
    }
  }
  function bowl() {
    const rimY = -228;
    // hands behind the bowl: palms under, thumbs hooked over the rim
    for (const s of [-1, 1]) {
      const pal = P((p) => {
        p.moveTo(s * 29, -238);
        p.bezierCurveTo(s * 35, -230, s * 34, -214, s * 25, -206);
        p.bezierCurveTo(s * 19, -202, s * 12, -204, s * 10, -208);
        p.lineTo(s * 20, -226);
        p.closePath();
      });
      part(pal, C.skin, { lw: 1.4, rimW: 0.9, shift: [2, 1.5] });
    }
    const b = P((p) => {
      p.moveTo(-27, rimY);
      p.bezierCurveTo(-26, rimY + 17, -13, rimY + 24, 0, rimY + 24);
      p.bezierCurveTo(13, rimY + 24, 26, rimY + 17, 27, rimY);
      p.closePath();
    });
    part(b, '#f6f3ee', {
      lw: 1.6, rimW: 1, shift: [3.5, 2],
      inner: () => {
        line(curve([[-26, rimY + 5], [0, rimY + 8.5], [26, rimY + 5]]), '#3f62a8', 2.2);
        line(curve([[-25.5, rimY + 8], [0, rimY + 11.5], [25.5, rimY + 8]]), '#3f62a8', 0.8);
        for (let i = -3; i <= 3; i++) fillP(P((p) => p.ellipse(i * 6.8, rimY + 15, 1.9, 1.3, 0, 0, 7)), '#3f62a8');
      },
    });
    for (const s of [-1, 1])
      for (let i = 0; i < 3; i++) {
        const fx = s * (21 - i * 5.5), fy = rimY + 16 + i * 2.6;
        part(ribbon([[fx + s * 3, fy - 3], [fx, fy + 1], [fx - s * 3.5, fy + 2]], [2.3, 2.4, 2.1], { capEnd: 'round' }), C.skin, { lw: 1.1, rimW: 0.6, shift: [1, 1] });
      }
    part(P((p) => p.roundRect(-10, rimY + 23, 20, 4, 1.5)), '#e8e2d8', { sh: false, rim: false, lw: 1.1 });
    fillP(P((p) => p.ellipse(0, rimY, 27, 5, 0, 0, 7)), '#c9a46b');
    const balls = [[-16, -2, '#b9a3cf'], [-7, -4, '#f1c56e'], [3, -3, '#efe4cf'], [12, -4, '#b9a3cf'], [19, -1, '#f1c56e'], [-1, 1, '#b9a3cf'], [9, 0.5, '#efe4cf'], [-11, 1, '#f1c56e']];
    for (const [x, y, col] of balls) part(P((p) => p.roundRect(x - 4, rimY + y - 2.5, 8, 5, 2.2)), col, { lw: 0.9, rimW: 0.6, shift: [1, 0.8] });
    line(P((p) => p.ellipse(0, rimY, 27, 5, 0, 0, 7)), ink('#f6f3ee', 0.55), 1.5);
    part(ribbon([[7, rimY - 1], [18, rimY - 11], [25, rimY - 18]], [2.6, 1.3, 1.3]), '#f6f3ee', { lw: 1.1, rim: false });
    for (const s of [-1, 1]) part(ribbon([[s * 31, rimY - 7], [s * 28, rimY - 2.5], [s * 23, rimY + 0.5]], [3.1, 2.9, 2.5], { capEnd: 'round' }), C.skin, { lw: 1.2, rimW: 0.7, shift: [1, 1] });
    for (const [x, d] of [[-9, 0], [4, 1]]) stroke([[x, rimY - 7], [x - 3, rimY - 14 - d * 2], [x + 2, rimY - 22], [x - 1, rimY - 31]], 1.8, 'rgba(255,255,255,0.8)', { prof: [0, 1, 0] });
    redString(-30.5, -234, 4.6, 1.15);
  }
  B.DESIGNS.push({
    n: 1,
    zh: '九份借衫',
    en: 'Borrowed Best of Jiufen',
    tier: 'HISTORICAL · 寫實',
    ratio: 6.5,
    shape: 'round · soft',
    accent: '#2b6f73',
    idea: '阿柑姨把女兒的大裪衫借給她：一個能混進九份街坊的女孩，只有長髮髮梢與指尖那一點海玻璃色的微光洩漏她不是人。',
    culture: '閩南（Hoklo）女子日常大裪衫：右衽大襟、黑色寬滾邊鑲米色細線、盤扣、寬袖；配寬腳大褲與繡鞋，玉牌以紅繩繫於襟扣。奇幻處只在髮梢與指尖化成光點。',
    model: '衣褲為簡潔大形，滾邊／盤扣以貼圖＋少量凸起表現；長髮為 3 片大髮束（後髮、左側臉框髮、耳後）；髮梢消散與指尖微光為 shader。',
    palette: [[C.jacket, '月白水藍', 'jacket'], [C.pipe, '黑滾邊', 'piping'], [C.hair, '烏黑髮', 'jet-black hair'], [C.skin, '膚', 'skin'], [C.red, '紅線', 'red string'], [C.jade, '玉牌', 'jade'], [C.shoe, '繡鞋紅', 'shoes']],
    callouts: [
      { zh: '大裪衫・右衽大襟', en: 'Hoklo side-fastened jacket', at: [-36, -308] },
      { zh: '寬滾邊＋盤扣', en: 'broad black piping, frog buttons', at: [-44, -262] },
      { zh: '紅繩玉牌繫襟扣', en: 'jade tag on red string at the lapel', at: [-20, -282] },
      { zh: '九份芋圓', en: 'first bowl of taro balls', at: [0, -212] },
      { zh: '寬腳大褲・繡鞋', en: 'wide trousers, embroidered shoes', at: [-26, -70] },
    ],
    bg: ['#d8e2e2', '#8fa7b0'],
    bust: { y: -378, z: 2.0 },
    rim: '#fff3d6',
    shTint: '#3d4c7a',
    stage(c, x, y, w, h) {
      stageGrad(c, x, y, w, h, ['#34425c', '#73869d', '#cbbfb0']);
      c.fillStyle = 'rgba(36,42,62,0.5)';
      c.beginPath();
      c.moveTo(x, y + h * 0.58);
      for (let i = 0; i <= 12; i++) c.lineTo(x + (w * i) / 12, y + h * 0.52 - Math.sin(i * 0.9) * 10 - i * 5);
      c.lineTo(x + w, y + h);
      c.lineTo(x, y + h);
      c.fill();
      c.fillStyle = 'rgba(28,32,50,0.35)';
      for (let i = 0; i < 9; i++) {
        c.fillRect(x + 6 + i * 32, y + h * 0.42 - (i % 3) * 16 - i * 4, 24, 34 + (i % 2) * 12);
        c.beginPath();
        c.moveTo(x + 2 + i * 32, y + h * 0.42 - (i % 3) * 16 - i * 4);
        c.lineTo(x + 18 + i * 32, y + h * 0.42 - (i % 3) * 16 - i * 4 - 9);
        c.lineTo(x + 34 + i * 32, y + h * 0.42 - (i % 3) * 16 - i * 4);
        c.fill();
      }
      bokeh(c, x, y + h * 0.2, w, h * 0.4, 20, ['#ffb060', '#ff7050', '#ffd080'], 11, 7, 0.55);
    },
    draw() {
      bagBehind();
      HD.back();
      legs();
      torso();
      neck(R, C.skin, { bot: -345, w: 0.115 });
      HD.face();
      HD.front();
      // jade tag hung from the lapel knot button on a red string
      jadeTag(-20, -296, 10, { cordLen: 1.9 });
      arms();
      bowl();
      motes([[-40, -246, 1.1], [-34, -236, 0.8], [-46, -252, 0.7]], '#bff7ee');
    },
    back(c, G2, col) {
      B.bzBack(c, R, -228, col);
      c.fillStyle = col;
      c.fillRect(-60, -136, 120, 12);
      c.beginPath();
      c.moveTo(54, -394);
      c.lineTo(60, -388);
      c.lineTo(-30, -262);
      c.lineTo(-36, -268);
      c.fill();
    },
  });
})();
