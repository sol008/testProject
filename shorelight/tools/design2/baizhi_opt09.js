// 白芷 v2 — 09 八斗子拾貝 Tide-Pool Beachcomber (everyday historical, comic-curious)
(function () {
  'use strict';
  const B = window.BZ;
  const { P, part, stroke, line, fillP, glow, ribbon, curve, poly, mix, rgba, ink, lighten, shadowOf, hand, foot, tassel, jadeTag, motes, LW, neck, redString, stageGrad, bokeh, flute, knot, rng } = B;
  const R = B.rig(6.6);
  const C = {
    shirt: '#eee4cf', sash: '#33476e', trouser: '#3a3f52', band: '#d4584f', basket: '#b48c4c', crab: '#d8643a', skin: '#f3dccb', jade: '#9fd3bd', red: '#c3303a', rock: '#5a6470',
  };
  const HD = B.bzHead(R, {
    tilt: -0.1, skin: C.skin, len: -232, frontLen: -282,
    face: { eye: { lookX: -0.03, irisDy: -0.02, halfLid: 0.05 }, mouth: { up: 0.02 }, blush: 0.55 },
    ornament: (P2) => {
      // 頭帕: folded floral cloth band round the head, knotted at the side with two tails
      const pts = [P2(-0.47, 0.28), P2(-0.2, 0.06), P2(0.15, 0.04), P2(0.44, 0.22)];
      const band = ribbon(pts, 0.055 * R.hu, { seg: 10 });
      part(band, C.band, { lw: 1.4, rimW: 0.8, inner: () => {
        for (let i = 0; i < 6; i++) {
          const q = B.lp(pts[Math.min(3, Math.floor(i / 2))], pts[Math.min(3, Math.floor(i / 2) + 1)], (i % 2) * 0.5 + 0.25);
          for (let k = 0; k < 4; k++) fillP(P((p) => p.arc(q[0] + Math.cos(k * 1.57) * 1.5, q[1] + Math.sin(k * 1.57) * 1.5, 1.1, 0, 7)), '#fbf1e6');
        }
      } });
      const kn = P2(-0.5, 0.32);
      part(P((p) => p.ellipse(kn[0], kn[1], 4.5, 4, 0.3, 0, 7)), C.band, { lw: 1.2, rimW: 0.6 });
      for (const [dx, dy] of [[-6, 14], [-2, 20]]) part(ribbon([[kn[0], kn[1]], [kn[0] + dx * 0.6, kn[1] + dy * 0.4], [kn[0] + dx, kn[1] + dy]], [3.2, 3, 1.2]), C.band, { lw: 1.1, rimW: 0.6 });
    },
  });
  function legs() {
    for (const s of [-1, 1]) {
      // trousers rolled to just under the knee, bare calves and feet
      const tr = P((p) => {
        p.moveTo(s * 3, -200);
        p.lineTo(s * 36, -200);
        p.bezierCurveTo(s * 39, -160, s * 38, -128, s * 35, -108);
        p.lineTo(s * 8, -108);
        p.bezierCurveTo(s * 6, -140, s * 4, -170, s * 3, -200);
        p.closePath();
      });
      part(tr, C.trouser, { lw: 1.7, rimW: 1.3, inner: () => stroke([[s * 18, -190], [s * 21, -150], [s * 18, -118]], 2.4, rgba('#000', 0.3)) });
      const calf = ribbon([[s * 21, -110], [s * 22, -76], [s * 19, -40], [s * 18, -14]], [10, 9.5, 6.5, 5.5]);
      part(calf, C.skin, { lw: 1.5, rimW: 1.1, sh: B.mix(C.skin, '#c97a6c', 0.3) });
      part(P((p) => p.roundRect(s > 0 ? 6 : -37, -118, 31, 13, 4)), mix(C.trouser, '#ffffff', 0.18), { lw: 1.4, rimW: 0.8, inner: () => line(poly([[s > 0 ? 7 : -36, -112], [s > 0 ? 36 : -7, -112]], false), rgba('#000', 0.3), 1) });
    }
    foot(-19, 0, 30, 'barefoot', { skin: C.skin }, -1);
    foot(18, 0, 30, 'barefoot', { skin: C.skin }, 1);
    redString(19, -26, 6, 0.05);
  }
  function shirt() {
    const sp = P((p) => {
      p.moveTo(-11, -350);
      p.bezierCurveTo(-22, -348, -34, -342, -38, -333);
      p.bezierCurveTo(-41, -300, -40, -250, -42, -196);
      p.quadraticCurveTo(0, -188, 42, -196);
      p.bezierCurveTo(40, -250, 41, -300, 38, -333);
      p.bezierCurveTo(34, -342, 22, -348, 11, -350);
      p.closePath();
    });
    part(sp, C.shirt, { lw: 1.8, rimW: 1.4, sh: '#cfc3b0', inner: () => {
      line(curve([[3, -350], [-6, -332], [-24, -318], [-38, -312]]), ink(C.shirt, 0.4), 1.4);
      stroke([[-24, -290], [-28, -250], [-30, -206]], 2.2, rgba('#b8ab96', 0.9));
      stroke([[26, -290], [30, -250], [32, -206]], 2.6, rgba('#a89a84', 0.9));
      // patched elbow-wear and salt stains
      part(P((p) => p.roundRect(18, -232, 12, 10, 2)), '#d8c8a8', { lw: 0.9, rim: false, sh: false, inner: () => line(P((p) => p.roundRect(19, -231, 10, 8, 1.5)), '#a8987a', 0.7, { dash: [1.5, 1.2] }) });
    } });
    knot(4, -350, 3, '#8a7a5a');
    knot(-24, -318, 3.2, '#8a7a5a', { angle: 0.4 });
    // indigo cloth sash knotted at the side; flute tucked in it
    part(P((p) => p.roundRect(-42, -238, 84, 12, 3)), C.sash, { lw: 1.5, rimW: 1 });
    flute([-30, -224], [22, -262], 2.4, { col: C.jade, holes: 5 });
    part(ribbon([[36, -232], [42, -214], [40, -196]], [4, 3.6, 2.4]), C.sash, { lw: 1.2, rimW: 0.7 });
    part(ribbon([[34, -230], [32, -212], [28, -200]], [3.6, 3.2, 2]), C.sash, { lw: 1.2, rimW: 0.7 });
    line(curve([[-30, -224], [-34, -214], [-32, -206]]), C.red, 1.4);
    jadeTag(-32, -198, 8, { cord: false });
  }
  function basket() {
    // 魚簍 bamboo fish creel on a cord at the hip
    line(curve([[30, -340], [44, -290], [52, -238]]), '#7a5a2a', 1.8);
    const bk = P((p) => {
      p.moveTo(42, -232);
      p.lineTo(60, -232);
      p.bezierCurveTo(78, -222, 80, -190, 70, -170);
      p.quadraticCurveTo(51, -160, 32, -170);
      p.bezierCurveTo(22, -190, 24, -222, 42, -232);
      p.closePath();
    });
    part(bk, C.basket, { lw: 1.7, rimW: 1.2, inner: () => {
      for (let y = -224; y < -166; y += 6) line(curve([[26, y], [51, y + 3], [78, y]]), rgba('#6a4a20', 0.65), 1);
      for (let x = 30; x < 76; x += 7) line(poly([[x, -230], [x + (x - 51) * 0.1, -166]], false), rgba('#8a6a3a', 0.5), 0.9);
    } });
    part(P((p) => p.roundRect(41, -240, 20, 9, 3)), mix(C.basket, '#000', 0.15), { lw: 1.3, rimW: 0.8 });
    // seaweed peeking out
    stroke([[48, -240], [44, -252], [48, -262]], 2.2, '#4a8a5a');
  }
  function arms() {
    // viewer-right arm hangs by the creel, sleeve rolled
    part(ribbon([[38, -330], [46, -290], [50, -258]], [9, 8, 7.5]), C.shirt, { lw: 1.7, rimW: 1.2, sh: '#cfc3b0' });
    part(P((p) => p.roundRect(41, -268, 18, 10, 3)), '#e2d6be', { lw: 1.3, rimW: 0.8 });
    part(ribbon([[50, -260], [53, -238], [54, -222]], [5.4, 4.8, 4.2]), C.skin, { lw: 1.4, rimW: 1, sh: B.mix(C.skin, '#c97a6c', 0.3) });
    hand(54, -224, -0.05, 29, 'relax', C.skin, 1);
    // viewer-left arm raised: holds up a little crab by one leg to look at it
    part(ribbon([[-36, -332], [-58, -318], [-74, -300]], [9, 8.5, 8]), C.shirt, { lw: 1.7, rimW: 1.2, sh: '#cfc3b0' });
    part(P((p) => {
      p.moveTo(-70, -310);
      p.lineTo(-84, -302);
      p.lineTo(-78, -292);
      p.lineTo(-66, -300);
      p.closePath();
    }), '#e2d6be', { lw: 1.3, rimW: 0.8 });
    part(ribbon([[-77, -300], [-82, -326], [-84, -352]], [5.2, 4.6, 4.2]), C.skin, { lw: 1.4, rimW: 1, sh: B.mix(C.skin, '#c97a6c', 0.3) });
    redString(-83.5, -346, 4.4, 3.1);
    hand(-84, -352, Math.PI - 0.08, 28, 'pinch', C.skin, 1);
    crab(-80, -404);
  }
  function crab(x, y) {
    // dangling by one leg, claws up in protest
    line(curve([[x - 4, y + 22], [x - 2, y + 12], [x, y + 6]]), C.crab, 1.6);
    const body = P((p) => p.ellipse(x, y, 11, 8, 0.15, 0, 7));
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) line(curve([[x + s * 8, y + 2 + i * 2], [x + s * (14 + i), y + 6 + i * 3], [x + s * (13 + i * 2), y + 12 + i * 3]]), ink(C.crab, 0.3), 1.6);
      part(P((p) => p.ellipse(x + s * 13, y - 10, 4.5, 3.4, s * 0.6, 0, 7)), C.crab, { lw: 1.1, rimW: 0.6 });
      line(curve([[x + s * 6, y - 4], [x + s * 10, y - 8]]), ink(C.crab, 0.3), 1.6);
    }
    part(body, C.crab, { lw: 1.4, rimW: 0.9, inner: () => {
      fillP(P((p) => p.arc(x - 3, y - 6, 1.6, 0, 7)), '#1a1010');
      fillP(P((p) => p.arc(x + 3, y - 6, 1.6, 0, 7)), '#1a1010');
    } });
    // tiny '?' bubble
    if (!B.G.sil) {
      const c = B.G.ctx;
      c.save();
      c.fillStyle = '#ffffff';
      c.font = '600 12px "DejaVu Sans"';
      c.fillText('?', x + 14, y - 16);
      c.restore();
    }
  }
  B.DESIGNS.push({
    n: 9,
    zh: '八斗子拾貝',
    en: 'Tide-Pool Beachcomber',
    tier: 'EVERYDAY · 漁家',
    ratio: 6.6,
    shape: 'compact · lively diagonals',
    accent: '#d4584f',
    idea: '退潮的八斗子礁岸：她捲起褲管赤腳踩進潮池，把一隻小螃蟹拎到眼前認真打招呼——「你好。你也是從海那邊來的嗎？」',
    culture: '基隆漁家女子：大襟汗衫、捲褲、腰間布帶、花布頭帕、竹編魚簍；赤腳拾貝撿海菜是當時海岸日常。奇幻：腳踝紅線與潮水接觸處泛起微光。',
    model: '最簡潔的一套：短衫＋捲褲＋頭帕三件；魚簍為道具（竹編用貼圖）；小螃蟹做成可互動小道具（戰鬥外待機動作）。',
    palette: [[C.shirt, '汗衫米', 'cotton shirt'], [C.trouser, '烏褲', 'trousers'], [C.sash, '靛帶', 'indigo sash'], [C.band, '花布頭帕', 'headband'], [C.basket, '竹簍', 'creel'], [C.skin, '膚', 'skin'], [C.crab, '蟹紅', 'crab']],
    callouts: [
      { zh: '花布頭帕', en: 'floral cloth headband, side knot', at: [-30, -420] },
      { zh: '小螃蟹（好奇）', en: 'a crab, held up for a polite chat', at: [-80, -398] },
      { zh: '腰帶插玉笛', en: 'flute tucked in the indigo sash', at: [-6, -244] },
      { zh: '竹編魚簍', en: 'bamboo fish creel', at: [64, -196] },
      { zh: '捲褲・赤腳', en: 'rolled trousers, bare feet', at: [-21, -60] },
    ],
    bg: ['#b8c8c4', '#6a7a80'],
    bust: { y: -380, z: 1.8 },
    fx: 12,
    rim: '#fff4dc',
    shTint: '#3a4a6a',
    stage(c, x, y, w, h) {
      stageGrad(c, x, y, w, h, ['#9fc0c8', '#cfd8d0', '#7a8a8a']);
      // horizon & tide pools on the rocks
      c.fillStyle = 'rgba(60,100,120,0.45)';
      c.fillRect(x, y + h * 0.5, w, h * 0.12);
      c.fillStyle = 'rgba(70,78,88,0.7)';
      c.beginPath();
      c.moveTo(x, y + h * 0.82);
      for (let i = 0; i <= 8; i++) c.lineTo(x + (w * i) / 8, y + h * (0.8 + ((i * 37) % 7) / 100));
      c.lineTo(x + w, y + h);
      c.lineTo(x, y + h);
      c.fill();
      c.fillStyle = 'rgba(160,210,220,0.6)';
      c.beginPath();
      c.ellipse(x + w * 0.5, y + h * 0.92, 90, 8, 0, 0, 7);
      c.fill();
    },
    draw() {
      HD.back();
      legs();
      basket();
      shirt();
      neck(R, C.skin, { bot: -346, w: 0.11 });
      HD.face();
      HD.front();
      arms();
      motes([[-4, -24, 1], [30, -20, 0.8], [8, -10, 0.7]], '#bff7ee');
    },
    back(c, G2, col) {
      B.bzBack(c, R, -232, col);
      c.fillStyle = col;
      c.fillRect(-42, -238, 84, 10);
      c.fillRect(-36, -118, 72, 12);
    },
  });
})();
