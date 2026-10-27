/* 彼岸燈 Shorelight — 夜玄 「玄冥法師」 (Ye Xuan) — final design v2: turnaround, bust, expressions, props.
 * Ground y = 0, body centre x = 0. Scale 3.6 px/cm → 184 cm ≈ 662 px (+ crown), 7.9 heads (head 84).
 */
(function (G) {
  'use strict';
  const L = G.L;
  const C = {
    skin: '#e8d3c3', skinD: '#b99c98', blush: '#d9a39a', lip: '#b07d7c', circle: '#8a7088',
    hair: '#18161c', hairHi: '#3b3947', streak: '#a19eab', iris: '#d4a743',
    robe: '#1c1b22', robeHi: '#34323f', white: '#eeeae0', whiteD: '#c7c1b8', lining: '#e7e2d6',
    gold: '#cda552', goldD: '#8c6b2b', red: '#a9312b', jar: '#dfe7e1', glaze: '#9fbfb3', soul: '#8fdcff',
    paper: '#e9d68e', boot: '#17161b', sole: '#efebe2', bronze: '#b5823d', teal: '#4fd8c8',
  };
  const YX = { C };
  const MX = (d, m) => (m < 0 ? d : L.mirrorD(d));
  const MP = (pts, m) => (m < 0 ? pts : pts.map(([x, y]) => [-x, y]));

  // ============================================================ HEAD — FRONT (eye line = 0; crown -43, chin +43)
  YX.face = 'M0,-44 C19,-44 30,-32 30,-13 C31,-5 32,1 31,5 C29,10 27,14 26,19 C25,25 24,28 21,31 C16,36 11,40 6,42.5 C3,44 -3,44 -6,42.5 C-11,40 -16,36 -21,31 C-24,28 -25,25 -26,19 C-27,14 -29,10 -31,5 C-32,1 -31,-5 -30,-13 C-30,-32 -19,-44 0,-44 Z';
  YX.backHair = (ctx) => { // long hair behind the head falling to the shoulder blades (front view: visible beside neck)
    L.part(ctx, 'M-33,-30 C-40,-6 -42,30 -44,62 C-44,80 -40,96 -36,104 L36,104 C40,96 44,80 44,62 C42,30 40,-6 33,-30 Z', C.hair, { sh: 5, hi: 2, rim: 1.4, ink: '#050407', detail: (c) => {
      for (const m of [-1, 1]) for (let i = 0; i < 4; i++) L.taper(c, MP([[-34 + i * 3, -10], [-38 + i * 2, 40], [-36 + i * 3, 100]], m), 1.4, C.hairHi, 'both', 0.6);
    } });
  };
  YX.headFront = (ctx, ex = 'calm') => {
    const grief = ex === 'grief', cold = ex === 'cold';
    // ears
    for (const m of [-1, 1]) {
      L.part(ctx, MX('M-29,-3 C-35,-7 -37,0 -36,7 C-35,13 -32,17 -28,15 Z', m), C.skin, { sh: 2, hi: 0.7, rim: 1 });
      L.line(ctx, MX('M-30.5,0 C-33.5,-2 -34,3 -33.4,6.5 C-33,10 -31.5,11 -30.5,10', m), C.skinD, 1.1);
    }
    L.part(ctx, YX.face, C.skin, {
      sh: 4, hi: 1.4, rim: 1.4,
      shades: [
        'M31,-13 C26,-10 24,-2 25,5 C26,12 24,20 22,26 C20,32 16,36 13,39 C19,34 24,28 26,21 C27,17 28,12 30,7 C32,2 32,-4 31,-13 Z',
        'M-27,9 C-23,13 -20,19 -19,25 C-22,22 -25,17 -27,9 Z', 'M27,9 C23,13 20,19 19,25 C22,22 25,17 27,9 Z',                // cheek hollows
        'M-24,-6 C-18,-9 -9,-9 -4,-5 C-10,-4 -18,-3 -24,-2 Z', 'M4,-5 C9,-9 18,-9 24,-6 C20,-2 12,-3 4,-3 Z',                     // sockets
        'M2,-4 C4,4 5,10 6,15 C4,14 3,10 2,5 Z',
      ],
      under: (c) => {
        L.fill(c, L.ellipse(-14, 6.5, 7, 2.4), C.circle, 0.2); L.fill(c, L.ellipse(14, 6.5, 7, 2.4), C.circle, 0.2); // sleepless shadows
        L.fill(c, 'M-26,-12 C-18,-14 -8,-13 -3,-9 L-3,-6 C-10,-9 -18,-9 -26,-8 Z', C.skinD, 0.35); L.fill(c, 'M26,-12 C18,-14 8,-13 3,-9 L3,-6 C10,-9 18,-9 26,-8 Z', C.skinD, 0.35);
        L.fill(c, L.ellipse(-20, 10, 6, 4), C.blush, 0.18); L.fill(c, L.ellipse(20, 10, 6, 4), C.blush, 0.15);
        L.fill(c, L.ellipse(-12, -26, 10, 5, -0.2), '#fff', 0.12);
      },
    });
    // eyes — long, half-lidded, downturned at the outer corner
    for (const m of [-1, 1]) {
      const cx = 13.5 * m;
      if (grief) {
        L.taper(ctx, [[cx - 7.5 * m, 0.5], [cx, 2.4], [cx + 8 * m, 2]], 2.2, '#1a1214');
        for (let i = 0; i < 3; i++) L.taper(ctx, [[cx + (2 + i * 2.5) * m, 2.4], [cx + (3 + i * 3) * m, 4.6]], 0.9, '#1a1214');
      } else {
        const op = cold ? 4.8 : 3.4;
        const eye = `M${cx - 7.5 * m},0 C${cx - 3 * m},${-op} ${cx + 4 * m},${-op + 0.2} ${cx + 8 * m},1.6 C${cx + 4 * m},3.4 ${cx - 3 * m},3.4 ${cx - 7.5 * m},0 Z`;
        L.fill(ctx, eye, '#f3ede6');
        L.clip(ctx, eye, () => {
          L.fill(ctx, L.circle(cx - 0.4 * m, 0.9, 3.4), C.iris); L.fill(ctx, L.circle(cx - 0.4 * m, 0.9, 3.4 * 0.5), '#3a2208');
          L.line(ctx, `M${cx - 0.4 * m - 3.4},0.9 A3.4,3.4 0 1 0 ${cx - 0.4 * m + 3.4},0.9 A3.4,3.4 0 1 0 ${cx - 0.4 * m - 3.4},0.9`, '#5e3d10', 1);
          L.fill(ctx, L.circle(cx - 0.4 * m - 1.3, -0.4, 0.9), '#fff', 0.9);
          L.fill(ctx, `M${cx - 9},-6 L${cx + 9},-6 L${cx + 9},0.5 C${cx},-1 ${cx - 4},-1 ${cx - 9},0 Z`, '#000', 0.28);
          if (cold) L.glow(ctx, cx, 1, 6, C.gold, 0.6);
        });
        L.taper(ctx, [[cx - 8 * m, 0.2], [cx - 3 * m, -op - 0.2], [cx + 4 * m, -op + 0.1], [cx + 9.5 * m, 2.4]], 2.1, '#120c10');
        L.taper(ctx, [[cx + 6 * m, 0.4], [cx + 11 * m, 2.6]], 1.6, '#120c10', 'end');                  // outer lash flick (down)
        L.taper(ctx, [[cx - 5 * m, 2.8], [cx + 2 * m, 3.6], [cx + 7 * m, 2.6]], 0.8, C.skinD);
      }
      L.taper(ctx, [[cx - 6 * m, -5], [cx, -6.6], [cx + 7 * m, -4.4]], 0.9, C.skinD, 'both', 0.9);  // fold
      // brows: thin, long, inner end lifted (sorrow)
      const inY = grief ? -15 : cold ? -10 : -13.5;
      L.part(ctx, `M${5 * m},${inY + 1.6} C${10 * m},${inY - 1} ${20 * m},-14 ${29 * m},-10.5 C${24 * m},-11.6 ${12 * m},${inY + 0.8} ${5 * m},${inY + 3} Z`, C.hair, { sh: 0.5, hi: 0, rim: 0, lw: 0.8 });
      if (grief) L.taper(ctx, [[6 * m, -15], [4 * m, -10]], 1, C.skinD);
    }
    // nose — long, straight, narrow
    L.taper(ctx, [[3.5, -4], [4.5, 6], [5.5, 14]], 1.4, C.skinD, 'both', 0.8);
    L.line(ctx, 'M-4,17 C-2,19.5 2,19.5 4,17', C.skinD, 1.4);
    L.fill(ctx, L.ellipse(-2.5, 17.6, 1.6, 0.8), '#6e4a48', 0.7); L.fill(ctx, L.ellipse(2.5, 17.6, 1.6, 0.8), '#6e4a48', 0.7);
    L.fill(ctx, L.ellipse(-1, 13, 1.2, 1.8), '#fff', 0.35);
    L.taper(ctx, [[-6, 16], [-10, 22], [-12, 30]], 0.8, C.skinD, 'both', 0.6); L.taper(ctx, [[6, 16], [10, 22], [12, 30]], 0.9, C.skinD, 'both', 0.6);
    L.taper(ctx, [[-8, -22], [0, -23], [8, -22]], 0.8, C.skinD, 'both', 0.5);
    for (const m of [-1, 1]) L.taper(ctx, [[23 * m, 2], [25 * m, 12], [22 * m, 22]], 1.2, C.skinD, 'both', 0.45);
    // mouth — thin; courteous almost-smile
    if (grief) L.taper(ctx, [[-7, 28], [0, 26.8], [7, 28]], 1.4, '#5c3a3c');
    else if (cold) L.taper(ctx, [[-7, 27.4], [0, 27], [7, 27.4]], 1.4, '#5c3a3c');
    else { L.taper(ctx, [[-7.5, 26.4], [-3, 27.4], [0, 27.2], [3, 27.4], [7.5, 26.2]], 1.4, '#5c3a3c'); }
    L.fill(ctx, 'M-5,28.6 C-2,30.4 2,30.4 5,28.6 C2,29.6 -2,29.6 -5,28.6 Z', C.lip, 0.8);
    // thin mustache + narrow goatee
    for (const m of [-1, 1]) L.taper(ctx, [[1.5 * m, 22.2], [6 * m, 22.6], [11 * m, 25.2]], 1.6, C.hair, 'end');
    L.part(ctx, 'M-3.4,32 C-4,38 -3,46 0,56 C3,46 4,38 3.4,32 C1.2,33.2 -1.2,33.2 -3.4,32 Z', C.hair, { sh: 0.6, hi: 0, rim: 0, lw: 0.8 });
    // hair (front): centre-parted, swept back; silver at the temples
    for (const m of [-1, 1]) {
      L.part(ctx, MX('M0,-46 C-12,-46 -26,-42 -32,-30 C-35,-22 -34,-12 -32,-4 C-31,-10 -30,-17 -27,-22 C-22,-28 -12,-30 -2,-27 L0,-26 Z', m), C.hair, { sh: 2.2, hi: 1, rim: 1, ink: '#050407', detail: (c) => {
        for (let i = 0; i < 6; i++) L.taper(c, MP([[-2 - i * 4, -27 - i * 0.4], [-14 - i * 3, -38 + i * 1.2], [-26 - i * 1.4, -34 + i * 4]], m), 1, C.hairHi, 'both', 0.7);
        L.taper(c, MP([[-28, -30], [-32, -20], [-32, -8]], m), 2.4, C.streak, 'both', 0.9); L.taper(c, MP([[-24, -32], [-29, -22]], m), 1.4, C.streak, 'both', 0.8);
      } });
      L.part(ctx, L.taperPath(MP([[-20, -30], [-29, -12], [-29, 8], [-26, 26], [-28, 38]], m), 2.4, 'mid'), C.hair, { sh: 0.6, hi: 0, rim: 0, lw: 0.8, ink: '#050407' }); // loose strand
    }
    // topknot + 長明冠 crown
    L.part(ctx, L.ellipse(0, -50, 12, 8), C.hair, { sh: 2, hi: 1, rim: 1, ink: '#050407' });
    YX.crown(ctx, 0, -52, 0.72);
  };
  YX.crown = (ctx, x, y, s) => { // lacquered black lantern-crown with gold frame & pin
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); const K0 = L.K; L.K = K0 / s;
    L.part(ctx, 'M-28,-5 L28,-5 C29,-3 29,-1 28,1 L-28,1 C-29,-1 -29,-3 -28,-5 Z', C.gold, { sh: 1, hi: 0.5, rim: 0, lw: 1.2 });           // pin 簪
    L.part(ctx, 'M28,-5 L34,-7 L36,-2 L34,3 L28,1 Z', C.gold, { sh: 0.6, rim: 0, lw: 1 });
    L.part(ctx, 'M-14,2 C-16,-6 -15,-14 -10,-20 L10,-20 C15,-14 16,-6 14,2 Z', C.robe, { sh: 2, hi: 0.8, rim: 1, detail: (c) => {
      L.line(c, 'M-6,-20 L-7,2 M0,-20 L0,2 M6,-20 L7,2', C.gold, 0.9);
    } });
    L.part(ctx, 'M-15,2 L15,2 L13,6 L-13,6 Z', C.gold, { sh: 0.8, rim: 0, lw: 1.1 });
    L.part(ctx, 'M-13,-20 L13,-20 L8,-26 L-8,-26 Z', C.gold, { sh: 0.8, rim: 0, lw: 1.1 });                                         // roof
    L.part(ctx, 'M-3,-26 L3,-26 L2,-31 L-2,-31 Z', C.gold, { sh: 0.5, rim: 0, lw: 1 });
    L.glow(ctx, 0, -35, 12, C.soul, 0.7);
    L.part(ctx, 'M0,-41 C3,-37 3,-33 0,-31 C-3,-33 -3,-37 0,-41 Z', '#dff6ff', { sh: 0.5, rim: 0, lw: 0.9, ink: '#4a8aa8' });       // captive blue flame
    L.K = K0; ctx.restore();
  };

  // ============================================================ HEAD — PROFILE (facing viewer-left; origin = ear centre)
  YX.headSide = (ctx, o = {}) => {
    // tied tail falling behind the neck (gold cuff at the nape)
    L.part(ctx, L.tube([[18, 2], [26, 30], [30, 70], [28, 120], [22, 150]], [16, 15, 13, 10, 6]), C.hair, { sh: 3, hi: 1, rim: 1.2, dx: -1, ink: '#050407', detail: (c) => { for (let i = 0; i < 3; i++) L.taper(c, [[16 + i * 3, 10], [24 + i * 2, 60], [22 + i * 2, 140]], 1.1, C.hairHi, 'both', 0.6); } });
    const face = 'M4,-50 C-14,-50 -28,-44 -34,-32 C-37,-25 -38,-18 -38,-12 C-38,-9 -37,-7 -36,-5 C-38,0 -44,8 -50,16 C-51,18 -50,20 -46,20.5 C-44,21 -42,21.5 -41,23 C-41,25 -40.5,26 -41,27.5 C-40,28.5 -40,29.5 -41,30.5 C-40,32 -39,33 -39,35 C-40,38 -40,42 -37,45 C-33,48 -26,47 -20,43 C-12,38 -4,33 2,28 C12,20 18,8 22,-4 C26,-20 22,-36 14,-44 C10,-48 6,-50 4,-50 Z';
    L.part(ctx, face, C.skin, { sh: 3.5, hi: 1.2, rim: 1.2, dx: -1, shades: ['M-36,-5 C-32,-7 -27,-7 -24,-4 C-28,-2 -32,-2 -36,-5 Z', 'M-37,45 C-30,47 -24,45 -18,41 C-22,46 -30,49 -37,45 Z'],
      under: (c) => { L.fill(c, L.ellipse(-28, 4, 5, 1.8), C.circle, 0.18); L.fill(c, 'M-24,8 C-20,14 -18,20 -19,27 C-22,22 -24,15 -24,8 Z', C.skinD, 0.35); } });
    // hair cap (swept back), ear partly visible
    L.part(ctx, 'M-33,-33 C-28,-47 -10,-55 6,-53 C20,-51 30,-38 30,-22 C30,-10 26,0 20,6 C17,0 13,-5 7,-8 C4,-16 -2,-24 -10,-28 C-18,-31 -26,-31 -33,-33 Z', C.hair, { sh: 2, hi: 1, rim: 1, dx: -1, ink: '#050407', detail: (c) => {
      for (let i = 0; i < 6; i++) L.taper(c, [[-26 + i * 3, -38 - i * 1.4], [-6 + i * 3, -44 + i * 2], [14 + i * 2, -36 + i * 5]], 1, C.hairHi, 'both', 0.7);
      L.taper(c, [[-22, -34], [-6, -32], [6, -20]], 2.4, C.streak, 'both', 0.85);
    } });
    L.part(ctx, 'M-2,-8 C4,-11 10,-7 10,0 C10,7 7,12 2,13 C-1,13 -2,10 -2,6 Z', C.skin, { sh: 1.6, hi: 0.6, rim: 0.8, dx: -1, detail: (c) => L.line(c, 'M0,-5 C5,-6 7,-1 6,4 C5,8 3,9 1,9', C.skinD, 1) });
    L.part(ctx, L.ellipse(6, -54, 11, 7, -0.2), C.hair, { sh: 1.5, rim: 1, dx: -1, ink: '#050407' });
    L.part(ctx, 'M12,0 L24,-2 L27,8 L15,11 Z', C.gold, { sh: 1, rim: 0, lw: 1.1, dx: -1 });
    YX.crownSide(ctx, 6, -55, 0.72);
    // features
    L.part(ctx, 'M-38,-13 C-32,-15 -24,-15 -18,-13 C-24,-12.6 -32,-12 -38,-10.8 Z', C.hair, { sh: 0, rim: 0, lw: 0.8 });
    L.fill(ctx, 'M-35,-1 C-33,-3.6 -29,-3.6 -27,-1.6 C-29,0.4 -33,0.6 -35,-1 Z', '#f3ede6'); L.fill(ctx, L.ellipse(-33, -1.3, 1.3, 1.9), C.iris);
    L.taper(ctx, [[-36, -1.2], [-31, -3.8], [-26, -1]], 1.8, '#120c10'); L.taper(ctx, [[-28, -1.6], [-24, 0.4]], 1.4, '#120c10', 'end');
    L.taper(ctx, [[-33, -6], [-27, -5]], 0.9, C.skinD);
    L.fill(ctx, L.ellipse(-44, 18.6, 2.4, 1, 0.3), '#6e4a48', 0.7); L.taper(ctx, [[-42, 12], [-40, 17], [-43, 20]], 1, C.skinD);
    L.taper(ctx, [[-42, 23.5], [-35, 24.4]], 1.6, C.hair, 'end');
    L.taper(ctx, [[-41, 29], [-36, 29.4]], 1.2, '#5c3a3c');
    L.part(ctx, 'M-39.5,32 C-39,38 -39,45 -42,55 C-36,47 -35,39 -36,33 Z', C.hair, { sh: 0, rim: 0, lw: 0.8 });
    L.part(ctx, L.taperPath([[-12, -28], [-14, -12], [-12, 6], [-14, 22]], 1.8, 'mid'), C.hair, { sh: 0, rim: 0, lw: 0.8, ink: '#050407' });
  };
  YX.crownSide = (ctx, x, y, s) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); const K0 = L.K; L.K = K0 / s;
    L.part(ctx, 'M-34,-5 L22,-5 C23,-3 23,-1 22,1 L-34,1 Z', C.gold, { sh: 1, rim: 0, lw: 1.2 });
    L.part(ctx, 'M-10,2 C-12,-6 -11,-14 -7,-20 L7,-20 C11,-14 12,-6 10,2 Z', C.robe, { sh: 2, rim: 1, dx: -1, detail: (c) => L.line(c, 'M0,-20 L0,2', C.gold, 0.9) });
    L.part(ctx, 'M-11,2 L11,2 L10,6 L-10,6 Z', C.gold, { sh: 0.8, rim: 0, lw: 1.1 });
    L.part(ctx, 'M-10,-20 L10,-20 L6,-26 L-6,-26 Z', C.gold, { sh: 0.8, rim: 0, lw: 1.1 });
    L.glow(ctx, 0, -35, 12, C.soul, 0.7);
    L.part(ctx, 'M0,-41 C3,-37 3,-33 0,-31 C-3,-33 -3,-37 0,-41 Z', '#dff6ff', { sh: 0.5, rim: 0, lw: 0.9, ink: '#4a8aa8' });
    // gauze ribbons trailing back
    L.K = K0; ctx.restore();
  };

  // ============================================================ HEAD — BACK
  YX.headBack = (ctx) => {
    for (const m of [-1, 1]) L.part(ctx, MX('M-29,-4 C-37,-9 -40,0 -38,8 C-37,15 -33,19 -28,17 Z', m), C.skin, { sh: 2, rim: 1 });
    L.part(ctx, 'M0,-46 C20,-46 33,-32 33,-12 C34,4 30,20 22,32 C14,40 -14,40 -22,32 C-30,20 -34,4 -33,-12 C-33,-32 -20,-46 0,-46 Z', C.hair, { sh: 4, hi: 1.5, rim: 1.4, ink: '#050407', detail: (c) => {
      for (let i = -6; i <= 6; i++) L.taper(c, [[i * 5, -44 + Math.abs(i)], [i * 4.4, -10], [i * 1.2, 28]], 1.1, C.hairHi, 'both', 0.6);
      for (const m of [-1, 1]) L.taper(c, MP([[-31, -20], [-30, 4], [-20, 26]], m), 2.6, C.streak, 'both', 0.7);
    } });
    L.part(ctx, L.tube([[0, 30], [1, 70], [-1, 120], [0, 160], [2, 186]], [17, 15, 13, 10, 5]), C.hair, { sh: 3, hi: 1, rim: 1.2, ink: '#050407', detail: (c) => { for (let i = -1; i <= 1; i++) L.taper(c, [[i * 4, 36], [i * 4.4, 100], [i * 2, 180]], 1.1, C.hairHi, 'both', 0.6); } });
    L.part(ctx, 'M-9,28 L9,28 L8,40 L-8,40 Z', C.gold, { sh: 1, rim: 0, lw: 1.1, detail: (c) => L.line(c, 'M-8,34 L8,34', C.goldD, 1) }); // nape cuff
    L.part(ctx, L.ellipse(0, -50, 12, 8), C.hair, { sh: 2, rim: 1, ink: '#050407' });
    YX.crown(ctx, 0, -52, 0.72);
    for (const m of [-1, 1]) L.part(ctx, MX('M-6,-50 C-14,-30 -20,20 -24,130 L-15,132 C-12,40 -8,-10 -2,-48 Z', m), '#2a2832', { sh: 1.5, rim: 0.8 }); // gauze ribbons
  };

  // ============================================================ PROPS
  YX.jar = (ctx, x, y, s = 1, o = {}) => { // 夜念's soul jar: celadon-white porcelain, red-string lid, paper seal, blue glow
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); const K0 = L.K; L.K = K0 / s;
    if (!o.noGlow) L.glow(ctx, 0, 6, 44, C.soul, 0.45);
    const body = 'M-11,-20 C-20,-18 -24,-8 -24,4 C-24,16 -18,24 -10,26 L10,26 C18,24 24,16 24,4 C24,-8 20,-18 11,-20 Z';
    L.part(ctx, body, C.jar, { sh: 4, hi: 1.6, rim: 1, ink: '#475a54', shCol: C.glaze, detail: (c) => {
      L.fill(c, L.ellipse(2, 6, 12, 11), C.soul, 0.32);                                         // light through the porcelain
      L.line(c, 'M-20,-6 C-10,-10 10,-10 20,-6', '#6f9488', 1.1); L.line(c, 'M-22,14 C-10,18 10,18 22,14', '#6f9488', 1.1);
      for (let i = 0; i < 5; i++) L.line(c, `M${-16 + i * 8},-4 C${-14 + i * 8},2 ${-18 + i * 8},8 ${-16 + i * 8},12`, '#7fa89b', 0.9); // lotus-petal band
      L.fill(c, L.ellipse(-12, -4, 3, 8, 0.2), '#fff', 0.55);
    } });
    L.part(ctx, 'M-12,-20 L12,-20 L11,-26 L-11,-26 Z', C.jar, { sh: 1.2, rim: 0, ink: '#475a54', shCol: C.glaze });
    L.part(ctx, 'M-14,-26 C-14,-32 14,-32 14,-26 Z', C.robe, { sh: 1, rim: 0.6 });                              // black lacquer lid
    L.part(ctx, L.circle(0, -33, 3), C.gold, { sh: 0.6, rim: 0, lw: 1 });
    L.part(ctx, 'M-4,-30 L4,-30 L5,6 L-5,6 Z', C.paper, { sh: 0.8, rim: 0, lw: 1, ink: '#7a6230', detail: (c) => { L.line(c, 'M0,-26 L0,2 M-2,-20 L2,-20 M-2,-12 L2,-12 M-2,-4 C0,-2 2,-4 2,-6', C.red, 1); } }); // talisman seal
    L.line(ctx, 'M-14,-24 C-6,-21 6,-21 14,-24', C.red, 2); L.line(ctx, 'M-2,-22 C-6,-16 -8,-10 -9,-2 M2,-22 C6,-16 8,-10 9,-2', C.red, 1.4);
    if (!o.noTally) { // 陳渡's matching half — 夜玄 keeps the 「同」 half (right half of the fish) tied to the jar
      L.line(ctx, 'M12,-20 C18,-6 20,10 18,24', C.red, 1.4);
      ctx.save(); ctx.translate(18, 42); ctx.scale(-1, 1); const K1 = L.K; L.K = K1;
      L.tallyHalf(ctx, C.bronze, '', '', false);
      ctx.restore(); L.K = K1;
      ctx.save(); ctx.fillStyle = L.dk(C.bronze, 0.5); ctx.font = `bold 7px ${L.FONT_ZH}`; ctx.textAlign = 'center'; ctx.fillText('同', 24, 48.5); ctx.restore();
    }
    L.K = K0; ctx.restore();
  };
  YX.staff = (ctx, x, top, o = {}) => { // 長明燈杖: black lacquer staff, gold cage lantern holding a captive soul-flame
    L.part(ctx, `M${x - 4},${top + 60} L${x + 4},${top + 60} L${x + 5},0 L${x - 5},0 Z`, C.robe, { sh: 2, hi: 1, rim: 1.2, detail: (c) => {
      for (let y = top + 120; y < -20; y += 90) L.part(c, `M${x - 5.5},${y} L${x + 5.5},${y} L${x + 5.5},${y + 6} L${x - 5.5},${y + 6} Z`, C.gold, { sh: 0.6, rim: 0, lw: 1 });
    } });
    L.part(ctx, `M${x - 6},-8 L${x + 6},-8 L${x + 3},0 L${x - 3},0 Z`, C.gold, { sh: 0.8, rim: 0, lw: 1 });
    // hook arm + lantern
    L.part(ctx, `M${x - 3},${top + 64} C${x - 3},${top + 20} ${x + 4},${top} ${x + 26},${top + 4} L${x + 26},${top + 10} C${x + 8},${top + 8} ${x + 3},${top + 24} ${x + 3},${top + 64} Z`, C.gold, { sh: 1.2, rim: 0.6, lw: 1.3 });
    const lx = x + 26, ly = top + 50;
    if (!o.unlit) L.glow(ctx, lx, ly, 60, C.soul, 0.5);
    L.line(ctx, `M${lx},${top + 10} L${lx},${ly - 26}`, C.goldD, 1.4);
    L.part(ctx, `M${lx - 14},${ly - 20} L${lx + 14},${ly - 20} L${lx + 10},${ly - 28} L${lx - 10},${ly - 28} Z`, C.gold, { sh: 1, rim: 0, lw: 1.2 });
    L.part(ctx, `M${lx - 13},${ly - 20} C${lx - 18},${ly - 6} ${lx - 18},${ly + 10} ${lx - 12},${ly + 20} L${lx + 12},${ly + 20} C${lx + 18},${ly + 10} ${lx + 18},${ly - 6} ${lx + 13},${ly - 20} Z`, '#d8f3ff', { sh: 2, hi: 0, rim: 0, ink: C.goldD, shCol: '#9fd9f2', detail: (c) => {
      L.fill(c, `M${lx},${ly - 10} C${lx + 6},${ly - 2} ${lx + 6},${ly + 8} ${lx},${ly + 12} C${lx - 6},${ly + 8} ${lx - 6},${ly - 2} ${lx},${ly - 10} Z`, '#ffffff', 0.9);
      for (const dx of [-9, -3, 3, 9]) L.line(c, `M${lx + dx},${ly - 20} C${lx + dx * 1.5},${ly} ${lx + dx * 1.4},${ly + 10} ${lx + dx},${ly + 20}`, C.gold, 1.6);
    } });
    L.part(ctx, `M${lx - 12},${ly + 20} L${lx + 12},${ly + 20} L${lx + 8},${ly + 26} L${lx - 8},${ly + 26} Z`, C.gold, { sh: 1, rim: 0, lw: 1.2 });
    L.line(ctx, `M${lx},${ly + 26} L${lx},${ly + 34}`, C.gold, 1.6);
    for (let i = -1; i <= 1; i++) L.taper(ctx, [[lx + i, ly + 33], [lx + i * 2, ly + 48]], 1.6, C.red, 'end');
  };

  // ============================================================ BODY parts shared by views
  const hemBand = (c, d, y0, y1) => { // gold hem band with painted lantern-wave pattern (texture, not geometry)
    L.clip(c, d, () => {
      c.fillStyle = C.gold; c.fillRect(-200, y0, 400, y1 - y0);
      c.fillStyle = L.dk(C.gold, 0.25); c.fillRect(-200, y1 - 3, 400, 3);
      for (let x = -120; x < 120; x += 16) {
        L.line(c, `M${x},${y1 - 6} C${x + 4},${y1 - 14} ${x + 12},${y1 - 14} ${x + 16},${y1 - 6}`, C.robe, 1.3);
        L.part(c, `M${x + 6},${y0 + 5} L${x + 10},${y0 + 5} L${x + 11},${y0 + 11} L${x + 5},${y0 + 11} Z`, C.robe, { sh: 0, hi: 0, rim: 0, lw: 0 });
      }
      c.fillStyle = C.white; c.fillRect(-200, y0 - 4, 400, 2.5);
    });
  };
  const strips = (ctx, cx, cy, list, front = true) => { // mantle of white silk strips 千條簑 radiating from the cloud collar
    for (const [ang, len, w, tone] of list) {
      const a = ang, x0 = cx + Math.sin(a) * 58, y0 = cy + Math.cos(a) * 30;
      const x1 = x0 + Math.sin(a) * len * 0.35, y1 = y0 + len;
      const d = L.tube([[x0, y0 - 8], [(x0 + x1) / 2, (y0 + y1) / 2], [x1, y1]], [w, w * 0.95, w * 0.85], 'flat');
      const col = tone ? C.white : L.mix(C.white, C.whiteD, 0.45);
      L.part(ctx, d, col, { sh: 2.2, hi: 0.8, rim: 1, lw: 1.3, ink: '#5a5560', detail: (c) => {
        L.taper(c, [[x0, y0], [x1, y1]], 1, L.mix(C.whiteD, C.white, 0.2), 'both', 0.7);
      } });
      // gold-dipped pointed tip
      const tx = x1, ty = y1;
      L.part(ctx, `M${tx - w * 0.47},${ty - 9} L${tx + w * 0.47},${ty - 9} L${tx + w * 0.42},${ty} L${tx},${ty + w * 0.7} L${tx - w * 0.42},${ty} Z`, C.gold, { sh: 1, hi: 0.4, rim: 0, lw: 1.2, ink: C.goldD });
    }
  };
  const mantleList = (back = false) => {
    const out = [];
    const n = 15;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), ang = (t - 0.5) * 2.6;
      const len = back ? 120 + Math.abs(t - 0.5) * 30 : 54 + Math.pow(Math.abs(t - 0.5) * 2, 1.6) * 70;
      out.push([ang, len, 11.5, i % 2]);
    }
    return out;
  };
  YX.cloudCollar = (ctx, y, back = false) => { // 雲肩: black silk, gold-piped lantern-lobed edge
    let d = 'M-22,' + (y - 18);
    const lobes = 8, R = 62;
    d = `M-24,${y - 20} C-44,${y - 16} -60,${y - 4} -64,${y + 12}`;
    for (let i = 0; i < lobes; i++) { const x0 = -64 + (128 / lobes) * i, x1 = x0 + 128 / lobes, ybase = y + 12 + Math.sin(((i + 0.5) / lobes) * Math.PI) * (back ? 24 : 30); d += ` C${x0 + 2},${ybase + 8} ${x1 - 2},${ybase + 8} ${x1},${ybase - 1}`; }
    d += ` C60,${y - 4} 44,${y - 16} 24,${y - 20} Z`;
    L.part(ctx, d, C.robe, { sh: 5, hi: 2, rim: 1.6, detail: (c) => {
      L.line(c, d, C.gold, 4);
      for (let i = 0; i < lobes; i++) { const x = -64 + (128 / lobes) * (i + 0.5), yb = y + 12 + Math.sin(((i + 0.5) / lobes) * Math.PI) * (back ? 24 : 30); L.line(c, `M${x - 4},${yb - 4} L${x},${yb - 10} L${x + 4},${yb - 4} L${x},${yb + 1} Z`, C.gold, 1.2); }
    } });
    return d;
  };

  // ============================================================ FRONT
  YX.front = (ctx, o = {}) => {
    // boots (toes under the hem)
    for (const m of [-1, 1]) {
      L.part(ctx, MX('M-46,-6 L-8,-6 L-8,1 C-22,3 -36,3 -46,1 Z', m), C.sole, { sh: 1, rim: 0, lw: 1.3 });
      L.part(ctx, MX('M-40,-24 C-46,-18 -48,-10 -46,-6 L-8,-6 C-7,-12 -8,-20 -12,-24 Z', m), C.boot, { sh: 2, hi: 1, rim: 1, lights: [MX('M-38,-14 C-34,-18 -26,-18 -22,-14 Z', m)] });
    }
    // robe 長袍
    const robe = 'M-24,-556 C-40,-552 -54,-542 -58,-526 C-56,-490 -50,-460 -46,-430 C-48,-380 -54,-300 -62,-200 C-68,-120 -74,-60 -80,-16 C-40,-12 40,-12 80,-16 C74,-60 68,-120 62,-200 C54,-300 48,-380 46,-430 C50,-460 56,-490 58,-526 C54,-542 40,-552 24,-556 Z';
    L.part(ctx, robe, C.robe, { sh: 12, hi: 3, rim: 2.2, rimCol: '#9fb3d6', shades: ['M40,-430 C44,-300 52,-180 66,-16 L80,-16 C74,-60 68,-120 62,-200 C54,-300 48,-380 46,-430 Z'],
      detail: (c) => {
        for (const [x0, x1, w] of [[-30, -46, 2.4], [-12, -16, 1.8], [10, 14, 1.8], [28, 40, 2.4], [-40, -64, 2]]) L.taper(c, [[x0, -400], [x0 + (x1 - x0) * 0.4, -220], [x1, -24]], w, L.lt(C.robe, 0.12));
        for (const [x0, x1] of [[-22, -32], [20, 30], [0, 2]]) L.taper(c, [[x0, -380], [x0 + (x1 - x0) * 0.5, -200], [x1, -20]], 2.4, '#0b0a0e');
        hemBand(c, robe, -44, -14);
        // 大襟 closure down his right side, gold piping & knot buttons
        L.line(c, 'M-46,-432 C-50,-360 -56,-260 -64,-150 C-68,-100 -72,-50 -76,-16', C.gold, 2.2);
        L.line(c, 'M-42,-432 C-46,-360 -52,-260 -60,-150', L.dk(C.gold, 0.4), 1, { a: 0.6 });
        // side slit flash of the white under-robe
        L.part(c, 'M-76,-110 C-72,-80 -72,-50 -76,-16 L-68,-16 C-68,-50 -68,-80 -76,-110 Z', C.lining, { sh: 1, rim: 0, lw: 1.2 });
        L.part(c, 'M76,-110 C72,-80 72,-50 76,-16 L68,-16 C68,-50 68,-80 76,-110 Z', C.lining, { sh: 1, rim: 0, lw: 1.2 });
      } });
    for (const y of [-400, -340, -280, -220]) L.knot(ctx, -48 - (y + 430) * 0.05, y, 2.6, C.gold);
    // sash with lantern clasp; long end hanging at his left
    L.part(ctx, 'M-48,-434 C-20,-428 20,-428 48,-434 L48,-414 C20,-408 -20,-408 -48,-414 Z', C.white, { sh: 3, hi: 1, rim: 1.4, detail: (c) => L.line(c, 'M-48,-424 C-20,-418 20,-418 48,-424', C.whiteD, 1) });
    L.part(ctx, L.tube([[30, -420], [36, -330], [34, -230]], [16, 14, 13], 'flat'), C.white, { sh: 3, hi: 1, rim: 1.2, detail: (c) => L.taper(c, [[30, -410], [33, -240]], 1.4, C.whiteD) });
    L.part(ctx, 'M27,-236 L41,-236 L40,-222 L28,-222 Z', C.gold, { sh: 1, rim: 0, lw: 1.2 });
    for (let i = -2; i <= 2; i++) L.taper(ctx, [[34 + i * 2.4, -222], [34 + i * 3, -196]], 1.8, i % 2 ? C.gold : C.goldD, 'end');
    L.part(ctx, 'M-8,-438 L8,-438 L10,-428 L8,-410 L-8,-410 L-10,-428 Z', C.gold, { sh: 1.5, hi: 0.6, rim: 0.6, lw: 1.3, detail: (c) => L.line(c, 'M-4,-432 L4,-432 L5,-420 L-5,-420 Z', C.goldD, 1) });
    // right arm (viewer-left) hanging in a wide sleeve with white turned-back cuff
    const slvL = 'M-44,-540 C-58,-536 -68,-520 -72,-500 C-78,-440 -86,-380 -98,-318 C-92,-306 -66,-304 -58,-312 C-58,-360 -56,-420 -48,-460 Z';
    L.part(ctx, slvL, C.robe, { sh: 8, hi: 2.5, rim: 2, rimCol: '#9fb3d6', detail: (c) => {
      L.taper(c, [[-56, -470], [-70, -420], [-80, -340]], 2.2, L.lt(C.robe, 0.14)); L.taper(c, [[-62, -450], [-74, -380], [-90, -326]], 2, '#0b0a0e');
    } });
    L.part(ctx, 'M-100,-322 C-90,-312 -68,-310 -57,-318 L-56,-304 C-68,-296 -92,-298 -102,-306 Z', C.white, { sh: 1.5, hi: 0.6, rim: 0.8, detail: (c) => L.line(c, 'M-101,-318 C-90,-308 -68,-306 -57,-314', C.gold, 1.6) });
    if (o.staff) { YX.staff(ctx, -84, -790, {}); L.hand(ctx, -82, -314, 0, 44, C.skin, { pose: 'grip', thin: true }); }
    else L.hand(ctx, -79, -306, 0.12, 48, C.skin, { pose: 'relax', thin: true, bony: true, mirror: false });
    // left arm (viewer-right): forearm forward, hand resting on the jar lid
    YX.jar(ctx, 74, -366, 1.05);
    const slvR = 'M44,-540 C58,-536 68,-520 72,-500 C78,-470 84,-440 88,-416 C84,-398 70,-392 58,-398 C56,-420 54,-440 48,-460 Z';
    L.part(ctx, slvR, C.robe, { sh: 7, hi: 2.5, rim: 2, rimCol: '#9fb3d6', detail: (c) => L.taper(c, [[58, -470], [72, -440], [80, -414]], 2, '#0b0a0e') });
    L.part(ctx, 'M56,-404 C66,-396 82,-398 90,-410 L94,-398 C86,-382 64,-382 54,-392 Z', C.white, { sh: 1.5, rim: 0.8, detail: (c) => L.line(c, 'M56,-400 C66,-392 82,-394 91,-405', C.gold, 1.6) });
    L.hand(ctx, 76, -398, -0.2, 44, C.skin, { pose: 'rest', thin: true });
    // neck & high white inner collar
    L.part(ctx, 'M-13,-596 C-14,-582 -15,-570 -16,-556 L16,-556 C15,-570 14,-582 13,-596 Z', C.skin, { sh: 3, rim: 1, shades: ['M-13,-596 C-6,-584 6,-584 13,-596 L13,-588 C6,-578 -6,-578 -13,-588 Z'], detail: (c) => { L.taper(c, [[-6, -584], [-9, -560]], 1, C.skinD, 'both', 0.6); L.taper(c, [[1, -572], [0, -566]], 1.4, C.skinD, 'both', 0.5); } });
    L.part(ctx, 'M-18,-566 C-12,-560 12,-560 18,-566 L19,-548 C10,-544 -10,-544 -19,-548 Z', C.white, { sh: 1.5, rim: 0.8, detail: (c) => L.line(c, 'M-18,-566 C-12,-560 12,-560 18,-566', C.gold, 1.5) });
    // mantle strips + cloud collar
    strips(ctx, 0, -538, mantleList(false));
    YX.cloudCollar(ctx, -536);
    L.part(ctx, 'M-6,-552 L6,-552 L8,-540 L5,-530 L-5,-530 L-8,-540 Z', C.gold, { sh: 1.2, rim: 0.5, lw: 1.2, detail: (c) => L.fill(c, L.ellipse(0, -541, 2.4, 3.5), C.soul, 0.9) }); // lantern clasp
    ctx.save(); ctx.translate(0, -620); YX.headFront(ctx, o.ex || 'calm'); ctx.restore();
  };

  // ============================================================ SIDE (facing viewer-left)
  YX.side = (ctx, o = {}) => {
    L.part(ctx, 'M-36,-6 L18,-6 L18,1 C0,3 -24,3 -38,1 Z', C.sole, { sh: 1, rim: 0, lw: 1.3 });
    L.part(ctx, 'M-34,-6 C-32,-16 -22,-22 -10,-24 L16,-24 L16,-6 Z', C.boot, { sh: 2, rim: 1, dx: -1 });
    // gauze ribbon & hair behind
    ctx.save(); ctx.translate(-6, -620); L.part(ctx, 'M4,-58 C22,-40 34,20 40,150 L32,152 C26,30 16,-30 0,-56 Z', '#2a2832', { sh: 1.5, rim: 1, dx: -1 }); ctx.restore();
    const sideStrip = (x0, len, splay, tone) => {
      const y0 = -520 - Math.cos((x0 / 40) * 1.2) * 14, x1 = x0 + splay;
      const d = L.tube([[x0, y0 - 10], [x0 + splay * 0.4, y0 + len * 0.5], [x1, y0 + len]], [11, 10.5, 10], 'flat');
      L.part(ctx, d, tone ? C.white : L.mix(C.white, C.whiteD, 0.45), { sh: 2, hi: 0.8, rim: 1, lw: 1.3, ink: '#5a5560', dx: -1 });
      L.part(ctx, `M${x1 - 5},${y0 + len - 8} L${x1 + 5},${y0 + len - 8} L${x1 + 4.4},${y0 + len} L${x1},${y0 + len + 7} L${x1 - 4.4},${y0 + len} Z`, C.gold, { sh: 0.6, rim: 0, lw: 1.1, ink: C.goldD });
    };
    for (let i = 0; i < 6; i++) sideStrip(40 - i * 6, 118 - i * 4, 16 - i * 2, i % 2); // back half, behind the body
    const robe = 'M-24,-556 C-34,-540 -36,-510 -34,-480 C-32,-450 -30,-430 -30,-410 C-32,-330 -36,-200 -40,-100 C-42,-60 -42,-36 -42,-16 C-10,-12 30,-12 56,-16 C50,-80 44,-160 40,-240 C36,-320 34,-380 32,-420 C34,-460 36,-500 30,-540 C24,-552 6,-560 -24,-556 Z';
    L.part(ctx, robe, C.robe, { sh: 10, hi: 3, rim: 2.2, dx: -1, rimCol: '#9fb3d6', detail: (c) => {
      for (const [x0, x1] of [[-20, -30], [6, 10], [24, 44]]) L.taper(c, [[x0, -400], [(x0 + x1) / 2, -200], [x1, -20]], 2.2, L.lt(C.robe, 0.12));
      L.taper(c, [[10, -380], [16, -200], [30, -20]], 2.4, '#0b0a0e');
      hemBand(c, robe, -44, -14);
      L.part(c, 'M40,-120 C46,-80 50,-50 54,-16 L46,-16 C44,-50 42,-80 40,-120 Z', C.lining, { sh: 1, rim: 0, lw: 1.2 });
    } });
    L.part(ctx, 'M-32,-434 C-10,-428 14,-428 34,-434 L34,-414 C14,-408 -10,-408 -32,-414 Z', C.white, { sh: 3, rim: 1.4, dx: -1 });
    // jar at his left hip (near side) + arm
    const slv = 'M-6,-540 C10,-540 18,-524 18,-504 C18,-474 16,-444 6,-420 C-6,-404 -26,-400 -38,-404 C-40,-412 -36,-420 -28,-426 C-18,-440 -14,-470 -14,-500 C-14,-520 -14,-536 -6,-540 Z';
    YX.jar(ctx, -18, -366, 1.05);
    L.part(ctx, slv, C.robe, { sh: 7, hi: 2.5, rim: 2, dx: -1, rimCol: '#9fb3d6', detail: (c) => { L.taper(c, [[8, -500], [8, -460], [-4, -424]], 2, '#0b0a0e'); L.taper(c, [[-8, -520], [-6, -470]], 2, L.lt(C.robe, 0.14)); } });
    L.part(ctx, 'M-40,-410 C-30,-402 -12,-402 -2,-414 L0,-400 C-10,-388 -32,-388 -42,-396 Z', C.white, { sh: 1.5, rim: 0.8, dx: -1, detail: (c) => L.line(c, 'M-40,-406 C-30,-398 -12,-398 -1,-410', C.gold, 1.6) });
    L.hand(ctx, -18, -398, 0.0, 44, C.skin, { pose: 'rest', thin: true, mirror: true });
    // neck, collar, side strips, cloud collar (profile)
    L.part(ctx, 'M-22,-600 C-22,-586 -22,-572 -22,-556 L10,-556 C10,-570 10,-584 12,-600 Z', C.skin, { sh: 3, rim: 1, dx: -1, detail: (c) => L.taper(c, [[-16, -590], [-14, -566]], 1.2, C.skinD, 'both', 0.6) });
    L.part(ctx, 'M-25,-566 C-14,-562 4,-562 13,-566 L14,-548 C4,-544 -14,-544 -26,-548 Z', C.white, { sh: 1.5, rim: 0.8, dx: -1, detail: (c) => L.line(c, 'M-25,-566 C-14,-562 4,-562 13,-566', C.gold, 1.5) });
    for (let i = 0; i < 9; i++) { const x0 = 6 - i * 6; sideStrip(x0, 60 + (i < 4 ? (4 - i) * 14 : 0), -2 - i * 1.6, i % 2); } // shoulder & front
    const cc = 'M-24,-566 C-38,-560 -48,-546 -48,-532 C-46,-520 -36,-512 -20,-510 C-4,-506 14,-508 30,-514 C42,-520 46,-532 42,-546 C36,-560 18,-568 -4,-568 Z';
    L.part(ctx, cc, C.robe, { sh: 4, hi: 1.5, rim: 1.6, dx: -1, detail: (c) => L.line(c, 'M-48,-532 C-46,-520 -36,-512 -20,-510 C-4,-506 14,-508 30,-514 C42,-520 46,-532 42,-546', C.gold, 4) });
    ctx.save(); ctx.translate(-6, -620); YX.headSide(ctx); ctx.restore();
  };

  // ============================================================ BACK
  YX.back = (ctx, o = {}) => {
    for (const m of [-1, 1]) {
      L.part(ctx, MX('M-46,-6 L-8,-6 L-8,1 C-22,3 -36,3 -46,1 Z', m), C.sole, { sh: 1, rim: 0, lw: 1.3 });
      L.part(ctx, MX('M-42,-22 C-46,-16 -48,-10 -46,-6 L-8,-6 C-7,-12 -8,-18 -10,-22 Z', m), C.boot, { sh: 2, rim: 1 });
    }
    const robe = 'M-24,-556 C-40,-552 -54,-542 -58,-526 C-56,-490 -50,-460 -46,-430 C-48,-380 -54,-300 -62,-200 C-68,-120 -74,-60 -80,-16 C-40,-12 40,-12 80,-16 C74,-60 68,-120 62,-200 C54,-300 48,-380 46,-430 C50,-460 56,-490 58,-526 C54,-542 40,-552 24,-556 Z';
    L.part(ctx, robe, C.robe, { sh: 12, hi: 3, rim: 2.2, rimCol: '#9fb3d6', detail: (c) => {
      L.line(c, 'M0,-556 L0,-16', '#0b0a0e', 1.4);
      for (const [x0, x1] of [[-30, -46], [28, 40]]) L.taper(c, [[x0, -400], [x0 + (x1 - x0) * 0.4, -220], [x1, -24]], 2.4, L.lt(C.robe, 0.12));
      hemBand(c, robe, -44, -14);
      // 長明宮 sigil: a lantern ringed by turning waves (gold embroidery, painted)
      c.save(); c.translate(0, -300);
      L.line(c, 'M-40,0 A40,40 0 1 0 40,0 A40,40 0 1 0 -40,0', C.gold, 2.2); L.line(c, 'M-33,0 A33,33 0 1 0 33,0 A33,33 0 1 0 -33,0', C.goldD, 1);
      for (let i = 0; i < 8; i++) { c.save(); c.rotate((i / 8) * Math.PI * 2); L.line(c, 'M0,-33 C8,-30 10,-24 6,-20 C2,-24 -2,-24 -4,-20', C.gold, 1.4); c.restore(); }
      L.line(c, 'M-9,-12 L9,-12 L12,8 L-12,8 Z M-6,-16 L6,-16 L9,-12 M-6,8 L-4,13 L4,13 L6,8 M0,-20 L0,-16', C.gold, 1.8);
      L.fill(c, 'M0,-6 C4,-2 4,3 0,5 C-4,3 -4,-2 0,-6 Z', C.soul, 0.9);
      c.restore();
      L.part(c, 'M-76,-110 C-72,-80 -72,-50 -76,-16 L-68,-16 C-68,-50 -68,-80 -76,-110 Z', C.lining, { sh: 1, rim: 0, lw: 1.2 });
      L.part(c, 'M76,-110 C72,-80 72,-50 76,-16 L68,-16 C68,-50 68,-80 76,-110 Z', C.lining, { sh: 1, rim: 0, lw: 1.2 });
    } });
    L.part(ctx, 'M-48,-434 C-20,-428 20,-428 48,-434 L48,-414 C20,-408 -20,-408 -48,-414 Z', C.white, { sh: 3, hi: 1, rim: 1.4 });
    // sleeves
    for (const m of [-1, 1]) {
      L.part(ctx, MX('M-44,-540 C-58,-536 -68,-520 -72,-500 C-78,-440 -86,-380 -98,-318 C-92,-306 -66,-304 -58,-312 C-58,-360 -56,-420 -48,-460 Z', m), C.robe, { sh: 8, hi: 2.5, rim: 2, rimCol: '#9fb3d6' });
      L.part(ctx, MX('M-100,-322 C-90,-312 -68,-310 -57,-318 L-56,-304 C-68,-296 -92,-298 -102,-306 Z', m), C.white, { sh: 1.5, rim: 0.8 });
      L.hand(ctx, -79 * m, -306, -0.12 * m, 48, C.skin, { pose: 'relax', thin: true, mirror: m > 0 });
    }
    YX.jar(ctx, -80, -368, 1.0, { noGlow: false });
    strips(ctx, 0, -538, mantleList(true));
    ctx.save(); ctx.translate(0, -620); YX.headBack(ctx); ctx.restore();
  };

  G.YX = YX;
})(window);
