// 白芷 v2 — 03 水燈頭 Lantern-House Spirit (folk-ritual fantasy)
(function () {
  'use strict';
  const B = window.BZ;
  const { P, part, stroke, line, fillP, glow, clipped, ribbon, curve, poly, mix, rgba, ink, lighten, shadowOf, hand, foot, tassel, jadeTag, motes, drawFace, LW, inHead, neck, lock, flute, redString, stageGrad, bokeh, hairShine } = B;
  const R = B.rig(6);
  const C = {
    paper: '#f3e5c4', red: '#c43e2c', gold: '#e2b24c', teal: '#1f5c60', hair: '#17151c', tip: '#ff7a3c',
    skin: '#f7e4d6', glowC: '#ffcf70', flame: '#bff3ff', wood: '#8a5a36', jade: '#8fd0b0',
  };
  const HD = B.bzHead(R, { tilt: 0, skin: C.skin, len: -214, frontLen: -262, ends: { col: C.tip, a: 0.95 }, endsSpan: 0.8, lip: '#d8505a', earDrop: '#d8503a', earBead: '#2a1414',
    face: { paint: (c) => {
      // 花鈿 forehead mark: a tiny lantern flame
      c.fillStyle = '#d23a2a';
      c.beginPath();
      c.moveTo(0, 0.33);
      c.quadraticCurveTo(0.025, 0.37, 0, 0.395);
      c.quadraticCurveTo(-0.025, 0.37, 0, 0.33);
      c.fill();
    } } });
  function roof() {
    // 燕尾脊 miniature roof crown with eave tassels, jade tag hung like a wind-chime
    inHead(R, 0, () => {
      const eave = P((p) => {
        p.moveTo(-0.72, 0.04);
        p.quadraticCurveTo(-0.5, 0.0, -0.34, -0.2);
        p.lineTo(0.34, -0.2);
        p.quadraticCurveTo(0.5, 0.0, 0.72, 0.04);
        p.quadraticCurveTo(0.55, 0.1, 0.4, 0.06);
        p.lineTo(-0.4, 0.06);
        p.quadraticCurveTo(-0.55, 0.1, -0.72, 0.04);
        p.closePath();
      });
      part(eave, C.red, { lw: 1.6, rimW: 0.015, shift: [0.03, 0.04], inner: () => {
        for (let i = -6; i <= 6; i++) stroke([[i * 0.05, -0.19], [i * 0.085, 0.05]], 1, rgba('#7a1e14', 0.7));
      } });
      line(curve([[-0.7, 0.05], [-0.4, 0.07], [0.4, 0.07], [0.7, 0.05]]), C.gold, 2.2);
      const ridge = P((p) => {
        p.moveTo(-0.36, -0.2);
        p.lineTo(0.36, -0.2);
        p.bezierCurveTo(0.5, -0.24, 0.6, -0.3, 0.66, -0.48);
        p.quadraticCurveTo(0.6, -0.36, 0.42, -0.28);
        p.lineTo(-0.42, -0.28);
        p.quadraticCurveTo(-0.6, -0.36, -0.66, -0.48);
        p.bezierCurveTo(-0.6, -0.3, -0.5, -0.24, -0.36, -0.2);
        p.closePath();
      });
      part(ridge, C.gold, { lw: 1.4, rimW: 0.012, shift: [0.02, 0.02] });
      part(P((p) => p.arc(0, -0.34, 0.06, 0, 7)), '#f8f2e0', { lw: 1.2, rimW: 0.01 });
      part(P((p) => p.roundRect(-0.36, 0.04, 0.72, 0.07, 0.01)), C.paper, { lw: 1.1, rim: false, sh: false });
    });
    const hu = R.hu, top = R.crown;
    tassel(0.7 * hu, top + 0.06 * hu, 12, C.red, { w: 2.6 });
    line(curve([[-0.7 * hu, top + 0.06 * hu], [-0.71 * hu, top + 0.3 * hu]]), C.red, 1.3);
    jadeTag(-0.71 * hu, top + 0.42 * hu, 9, { cord: false, tassel: true, col: C.jade });
  }
  function base() {
    // the 水燈頭 float: lacquered wooden raft with lotus-petal rim; ripples
    if (!B.G.sil) {
      for (let i = 0; i < 3; i++) line(P((p) => p.ellipse(0, 4, 80 + i * 14, 7 + i * 3, 0, 0, 7)), rgba('#d9f4ff', 0.5 - i * 0.12), 1.4);
    }
    const raft = P((p) => {
      p.moveTo(-70, -8);
      p.lineTo(70, -8);
      p.lineTo(62, 6);
      p.lineTo(-62, 6);
      p.closePath();
    });
    part(raft, C.wood, { lw: 1.6, rimW: 1, inner: () => { for (let x = -50; x <= 50; x += 20) stroke([[x, -8], [x * 0.9, 6]], 1.2, rgba('#4a2c18', 0.6)); line(poly([[-70, -6], [70, -6]], false), C.gold, 1.6); } });
    for (let i = -3; i <= 3; i++) {
      const lp = P((p) => {
        p.moveTo(i * 20 - 9, -8);
        p.quadraticCurveTo(i * 20, -22, i * 20 + 9, -8);
        p.closePath();
      });
      part(lp, i % 2 ? '#f6c6c8' : '#f9dcd8', { lw: 1.1, rimW: 0.6 });
    }
  }
  function legs() {
    for (const s of [-1, 1]) {
      const lg = ribbon([[s * 14, -96], [s * 15, -50], [s * 17, -14]], [8, 6.5, 5]);
      part(lg, '#f4efe8', { lw: 1.4, rimW: 1, sh: '#c8c0d4' });
      // leg wrap ties in red
      for (const y of [-40, -26]) line(curve([[s * 9.5, y], [s * 17, y + 2], [s * 23, y]]), C.red, 1.6);
    }
    foot(-18, -6, 25, 'barefoot', { skin: C.skin }, -1, { rot: 0.12 });
    foot(18, -6, 25, 'barefoot', { skin: C.skin }, 1, { rot: 0.12 });
  }
  function skirt() {
    // lantern-wall skirt: three paper panels in vermilion frames, lattice windows glow from within
    const sk = P((p) => {
      p.moveTo(-34, -232);
      p.lineTo(34, -232);
      p.lineTo(72, -84);
      p.lineTo(-72, -84);
      p.closePath();
    });
    part(sk, C.paper, {
      lw: 2, rimW: 1.6, sh: mix(C.paper, '#c99a6a', 0.45), shift: [6, 0],
      inner: (c) => {
        // inner glow
        const g = c.createRadialGradient(0, -150, 4, 0, -150, 80);
        g.addColorStop(0, rgba(C.glowC, 0.75));
        g.addColorStop(1, rgba(C.glowC, 0));
        c.fillStyle = g;
        c.fillRect(-80, -240, 160, 160);
        // panel frames
        const fr = (x0, x1, x2, x3) => {
          line(poly([[x0, -232], [x1, -84]], false), C.red, 4);
          line(poly([[x2, -232], [x3, -84]], false), C.red, 4);
        };
        fr(-12, -26, 12, 26);
        line(poly([[-36, -200], [36, -200]], false), C.red, 3);
        line(poly([[-55, -112], [55, -112]], false), C.red, 3);
        // lattice windows (冰裂 / 方勝)
        const win = (cx, cy, w, h) => {
          c.save();
          c.translate(cx, cy);
          c.strokeStyle = rgba('#8a2a1c', 0.9);
          c.lineWidth = LW(1.1);
          c.strokeRect(-w / 2, -h / 2, w, h);
          c.beginPath();
          for (let i = 1; i < 3; i++) {
            c.moveTo(-w / 2 + (w * i) / 3, -h / 2);
            c.lineTo(-w / 2 + (w * i) / 3, h / 2);
            c.moveTo(-w / 2, -h / 2 + (h * i) / 3);
            c.lineTo(w / 2, -h / 2 + (h * i) / 3);
          }
          c.stroke();
          c.restore();
        };
        win(0, -156, 16, 34);
        win(-34, -152, 12, 30);
        win(34, -152, 12, 30);
        // painted waves on the lowest band
        for (let x = -62; x < 62; x += 12) stroke([[x, -92], [x + 4, -99], [x + 8, -94], [x + 12, -92]], 1.4, C.teal);
        // calligraphy 渡 on centre panel top
        c.fillStyle = '#2a1414';
        c.font = '13px "WenQuanYi Zen Hei"';
        c.textAlign = 'center';
        c.fillText('渡', 0, -207);
      },
    });
    line(poly([[-72, -84], [72, -84]], false), C.gold, 2.5);
    // hem fringe of paper strips
    for (let x = -70; x <= 70; x += 7) part(P((p) => p.rect(x - 2.5, -84, 5, 10 + (Math.abs(x) % 3) * 2)), C.red, { lw: 0.8, rim: false, sh: false });
    // roof-tile peplum at the waist
    const pep = P((p) => {
      p.moveTo(-26, -262);
      p.lineTo(26, -262);
      p.quadraticCurveTo(40, -240, 54, -228);
      p.quadraticCurveTo(44, -224, 38, -226);
      p.lineTo(-38, -226);
      p.quadraticCurveTo(-44, -224, -54, -228);
      p.quadraticCurveTo(-40, -240, -26, -262);
      p.closePath();
    });
    part(pep, C.red, { lw: 1.7, rimW: 1.4, inner: () => { for (let i = -5; i <= 5; i++) stroke([[i * 4.5, -261], [i * 8.5, -227]], 1.1, rgba('#7a1e14', 0.7)); } });
    line(curve([[-54, -228], [-38, -225], [38, -225], [54, -228]]), C.gold, 2);
  }
  function bodice() {
    const bd = P((p) => {
      p.moveTo(-11, -344);
      p.bezierCurveTo(-22, -340, -30, -334, -32, -326);
      p.bezierCurveTo(-34, -300, -30, -280, -27, -260);
      p.lineTo(27, -260);
      p.bezierCurveTo(30, -280, 34, -300, 32, -326);
      p.bezierCurveTo(30, -334, 22, -340, 11, -344);
      p.closePath();
    });
    part(bd, C.paper, {
      lw: 1.8, rimW: 1.4, sh: mix(C.paper, '#c99a6a', 0.45),
      inner: () => {
        // lantern ribs
        for (const y of [-318, -300, -282]) line(curve([[-32, y], [0, y + 3], [32, y]]), rgba('#b08a5a', 0.7), 1.1);
        // teal cross-collar edge (右衽)
        line(curve([[6, -344], [-6, -326], [-26, -306]]), C.teal, 4);
        line(curve([[6, -344], [-6, -326], [-26, -306]]), lighten(C.teal, 0.4), 1);
      },
    });
    // teal sash with the flute tucked diagonally
    part(P((p) => p.roundRect(-29, -270, 58, 11, 3)), C.teal, { lw: 1.4, rimW: 1 });
  }
  function eaves() {
    // stiff shoulder eaves, outer tips upturned (swallow-tail)
    for (const s of [-1, 1]) {
      const ev = P((p) => {
        p.moveTo(s * 12, -346);
        p.bezierCurveTo(s * 30, -344, s * 48, -334, s * 58, -322);
        p.quadraticCurveTo(s * 66, -320, s * 70, -334);
        p.quadraticCurveTo(s * 70, -312, s * 60, -306);
        p.bezierCurveTo(s * 48, -306, s * 36, -310, s * 26, -314);
        p.lineTo(s * 10, -336);
        p.closePath();
      });
      part(ev, C.red, { lw: 1.7, rimW: 1.3, inner: () => { for (let i = 0; i < 5; i++) stroke([[s * (16 + i * 9), -342 + i * 2], [s * (22 + i * 9), -310]], 1, rgba('#7a1e14', 0.7)); } });
      line(curve([[s * 26, -313], [s * 44, -307], [s * 60, -306]]), C.gold, 2);
      tassel(s * 62, -306, 11, C.gold, { w: 2.4, cap: C.red });
    }
  }
  function arms() {
    for (const s of [-1, 1]) {
      const sl = P((p) => {
        p.moveTo(s * 28, -320);
        p.bezierCurveTo(s * 40, -316, s * 44, -296, s * 44, -276);
        p.bezierCurveTo(s * 42, -268, s * 36, -268, s * 20, -288);
        p.lineTo(s * 14, -302);
        p.bezierCurveTo(s * 24, -298, s * 30, -294, s * 32, -296);
        p.bezierCurveTo(s * 32, -306, s * 30, -312, s * 26, -318);
        p.closePath();
      });
      part(sl, C.paper, { lw: 1.7, rimW: 1.3, sh: mix(C.paper, '#c99a6a', 0.45), inner: () => {
        line(curve([[s * 40, -296], [s * 34, -288]]), rgba('#b08a5a', 0.7), 1);
      } });
      // red cuff
      part(P((p) => {
        p.moveTo(s * 20, -288);
        p.lineTo(s * 14, -302);
        p.lineTo(s * 19, -305);
        p.lineTo(s * 25, -291);
        p.closePath();
      }), C.red, { lw: 1.2, rim: false });
    }
  }
  function cupped(cx, cy, skin) {
    // two palms cupped together like a lotus bowl, seen from the front
    const cup = P((p) => {
      p.moveTo(cx - 17, cy - 10);
      p.bezierCurveTo(cx - 18, cy + 2, cx - 10, cy + 12, cx, cy + 13);
      p.bezierCurveTo(cx + 10, cy + 12, cx + 18, cy + 2, cx + 17, cy - 10);
      // finger tips scalloped along the top
      p.quadraticCurveTo(cx + 15, cy - 15, cx + 12, cy - 11);
      p.quadraticCurveTo(cx + 9, cy - 15, cx + 6.5, cy - 10);
      p.quadraticCurveTo(cx + 4, cy - 13, cx + 1.5, cy - 9);
      p.lineTo(cx - 1.5, cy - 9);
      p.quadraticCurveTo(cx - 4, cy - 13, cx - 6.5, cy - 10);
      p.quadraticCurveTo(cx - 9, cy - 15, cx - 12, cy - 11);
      p.quadraticCurveTo(cx - 15, cy - 15, cx - 17, cy - 10);
      p.closePath();
    });
    part(cup, skin, { lw: 1.4, rimW: 0.9, shift: [2.5, 2], inner: () => {
      const lc = rgba(ink(skin, 0.4), 0.8);
      for (const s of [-1, 1]) {
        stroke([[cx + s * 12, cy - 10], [cx + s * 11, cy - 2], [cx + s * 7, cy + 6]], 1.1, lc);
        stroke([[cx + s * 6.5, cy - 9], [cx + s * 6, cy - 1], [cx + s * 3, cy + 7]], 1.1, lc);
      }
      stroke([[cx, cy - 8], [cx, cy + 12]], 1.2, lc);
    } });
    // thumbs resting along the outer rims
    for (const s of [-1, 1]) part(ribbon([[cx + s * 19, cy - 2], [cx + s * 19, cy - 10], [cx + s * 15, cy - 15]], [3, 2.8, 2.3], { capEnd: 'round' }), skin, { lw: 1.2, rimW: 0.7, shift: [1, 1] });
  }
  function flameHands() {
    cupped(0, -296, C.skin);
    redString(-15, -300, 4, 0.5);
    // cold lamp flame (blue-white) — the lamp's heart
    glow(0, -318, 54, C.glowC, 0.5);
    glow(0, -314, 26, '#9fe8ff', 0.7);
    const fl = P((p) => {
      p.moveTo(0, -342);
      p.bezierCurveTo(8, -328, 12, -314, 0, -305);
      p.bezierCurveTo(-12, -314, -8, -328, 0, -342);
      p.closePath();
    });
    part(fl, C.flame, { lw: 1.1, line: '#5ab8d8', rim: false, sh: false, inner: (c) => {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.ellipse(0, -314, 4, 7, 0, 0, 7);
      c.fill();
    } });
  }
  B.DESIGNS.push({
    n: 3,
    zh: '水燈頭',
    en: 'Lantern-House Spirit',
    tier: 'FOLK FANTASY · 普渡',
    ratio: 6,
    shape: 'square · architectural',
    accent: '#c43e2c',
    idea: '她就是那座逆流漂回岸邊的水燈頭：頭戴燕尾脊小屋頂，裙是會發光的紙燈牆，掌心捧著一朵冷藍的燈心火。',
    culture: '取自雞籠中元祭「放水燈頭」：紙糊的房屋形水燈、燕尾脊、花窗、紅金配色與木製燈座；衣身仍保留右衽交領與腰帶。奇幻：人即燈屋，燈心為冷藍魂火。',
    model: '屋頂冠、肩簷、裙牆皆為硬殼大形，極易建模；花窗與波浪紋為自發光貼圖；手中火焰與裙內光為 shader；底座水波為特效。',
    palette: [[C.paper, '燈紙', 'lantern paper'], [C.red, '朱紅', 'vermilion'], [C.gold, '描金', 'gilt'], [C.teal, '海青', 'sea teal'], [C.hair, '烏黑髮', 'jet-black hair'], [C.tip, '燈紅髮梢', 'glowing ends'], [C.flame, '冷燈心', 'cold flame']],
    callouts: [
      { zh: '燕尾脊屋頂冠', en: 'swallow-tail roof crown', at: [40, -440] },
      { zh: '玉牌風鈴', en: 'jade tag hung as a wind-chime', at: [-50, -385] },
      { zh: '燈心冷火', en: 'cold lamp-heart flame in cupped hands', at: [0, -326] },
      { zh: '紙燈牆裙・花窗', en: 'paper-wall skirt, glowing lattice', at: [-34, -152] },
      { zh: '水燈頭燈座', en: 'lotus-rim float she stands on', at: [-50, -2] },
    ],
    bg: ['#2b2a44', '#5a4a6a'],
    fs: 0.93,
    bust: { y: -380, z: 1.75 },
    rim: '#ffd9a0',
    shTint: '#5a3060',
    stage(c, x, y, w, h) {
      stageGrad(c, x, y, w, h, ['#1d2140', '#3a3358', '#5a6680']);
      // night sea with drifting water lanterns
      c.fillStyle = 'rgba(20,30,60,0.6)';
      c.fillRect(x, y + h * 0.72, w, h * 0.28);
      bokeh(c, x, y + h * 0.66, w, h * 0.2, 14, ['#ffb060', '#ff8050', '#9fe0ff'], 21, 8, 0.6);
      bokeh(c, x, y, w, h * 0.5, 16, ['#ffd080', '#ffffff'], 3, 3, 0.5);
    },
    draw() {
      HD.back();
      base();
      legs();
      skirt();
      bodice();
      neck(R, C.skin, { bot: -340, w: 0.11 });
      HD.face();
      HD.front();
      roof();
      // flute tucked in the sash diagonally (behind arms)
      flute([-46, -262], [44, -268], 2.3, { col: C.jade, holes: 5 });
      eaves();
      arms();
      flameHands();
      motes([[-40, -360, 1], [44, -350, 0.9], [-60, -200, 1.1], [64, -180, 0.8]], '#ffd890');
    },
    back(c, G2, col) {
      B.bzBack(c, R, -214, col);
      c.fillStyle = col;
      c.fillRect(-72, -96, 144, 6);
      c.fillRect(-4, -232, 8, 148);
    },
  });
})();
