/* 彼岸燈 Shorelight — 陳伯 / 陳渡 (Chen Du) — final design v2: turnaround, hidden 引魂人 gear, bust, expressions, props.
 * Ground y = 0, body centre x = 0, 1 unit = 1 px at zoom 1. Scale 3.6 px/cm → 162 cm stooped ≈ 577 px, 6.4 heads (head 90).
 */
(function (G) {
  'use strict';
  const L = G.L;
  const C = {
    skin: '#c98f68', skinD: '#a86c52', blush: '#d77c64', lip: '#a65e4e',
    grey: '#cfc9c0', greyD: '#9d968f', scalp: '#c08d6e', stub: '#8f969e',
    iris: '#3a2618',
    indigo: '#4d6789', patch: '#7891ad', guard: '#2b3140', white: '#ebe4d2',
    apron: '#d9c6a0', stainR: '#b7382d', stainG: '#c99a3b', sash: '#5b3c2a',
    trou: '#2f2b30', wrap: '#c5bcaa', shoe: '#232026', sole: '#ebe5d6',
    bronze: '#b5823d', teal: '#4fd8c8', red: '#b8342b', bamboo: '#b08b52', brass: '#cfa64a', jade: '#7fb293',
    straw: '#b99b5f', strawD: '#8a6c3c', strawL: '#dcc48c', hat: '#c4a467', oar: '#4a3526', night: '#10202b',
  };
  const CB = { C };

  // ============================================================ HEAD — FRONT (face-local: eye line = 0, head 90 tall)
  CB.headFront = (ctx, ex = 'grump') => {
    const K = L.K;
    const skinO = { sh: 4.5, hi: 1.5, rim: 1.4 };
    // unshaved rear hair (Qing 薙髮: front shaved, rear grown into the queue) — seen behind the dome and the ears
    L.part(ctx, 'M-39,-22 C-42,-38 -26,-52 0,-52 C26,-52 42,-38 39,-22 L42,10 C41,16 37,17 35,14 L-35,14 C-37,17 -41,16 -42,10 Z', C.grey, { sh: 2, hi: 1, rim: 1, lw: 1.5, ink: C.greyD, detail: (c) => {
      for (let i = 0; i < 9; i++) { const x = -30 + i * 7.5; L.taper(c, [[x * 1.25, -46 + Math.abs(x) * 0.25], [x * 1.4, -38 + Math.abs(x) * 0.2]], 1, C.greyD, 'both', 0.7); }
      for (const m of [-1, 1]) for (let i = 0; i < 4; i++) L.taper(c, [[39.5 * m, -14 + i * 7], [41 * m, -8 + i * 7]], 1, C.greyD, 'both', 0.7);
    } });
    for (const m of [1, -1]) {
      const d = 'M-36,-6 C-46,-12 -51,-1 -48,9 C-46,17 -42,22 -36,20 Z';
      L.part(ctx, m > 0 ? d : L.mirrorD(d), C.skin, { sh: 2.5, hi: 0.8, rim: 1 });
      L.line(ctx, m > 0 ? 'M-38,-3 C-44,-6 -46,2 -44,8 C-43,13 -40,15 -38,13' : L.mirrorD('M-38,-3 C-44,-6 -46,2 -44,8 C-43,13 -40,15 -38,13'), C.skinD, 1.2);
    }
    // neck is drawn by body. Head skin (shaved dome + broad, jowly face)
    const head = 'M0,-47 C25,-47 39,-31 38,-9 C38,3 40,13 38,23 C36,33 27,40 17,44 C10,47 -10,47 -17,44 C-27,40 -36,33 -38,23 C-40,13 -38,3 -38,-9 C-39,-31 -25,-47 0,-47 Z';
    L.part(ctx, head, C.skin, {
      ...skinO,
      shades: [
        'M38,-9 C30,-6 26,4 27,14 C28,24 24,34 17,44 C27,40 36,33 38,23 C40,13 38,3 38,-9 Z',  // right cheek plane
        'M-30,-6 C-22,-9 -12,-8 -5,-5 C-12,-4 -22,-3 -30,-2 Z',                                  // L socket
        'M5,-5 C12,-8 22,-9 30,-6 C26,-1 14,-2 5,-3 Z',                                          // R socket
        'M2,-2 C5,4 6,10 8,14 C5,13 3,10 2,6 Z',                                                // nose side
      ],
      under: (c) => { // scalp stubble above the braid + ruddy cheeks/nose
        const g = c.createLinearGradient(0, -47, 0, -28); g.addColorStop(0, L.rgba(C.stub, 0.3)); g.addColorStop(1, L.rgba(C.stub, 0.0));
        c.fillStyle = g; c.fillRect(-50, -50, 100, 30);
        L.fill(c, L.ellipse(-14, -36, 12, 5, -0.3), '#fff', 0.13);
        L.fill(c, L.ellipse(-22, 12, 9, 6), C.blush, 0.35); L.fill(c, L.ellipse(22, 12, 9, 6), C.blush, 0.3);
        L.fill(c, L.ellipse(13, -38, 2.2, 1.6), C.skinD, 0.6); L.fill(c, L.ellipse(-18, -36, 1.5, 1.2), C.skinD, 0.5); // age spots
      },
    });
    // forehead wrinkles (between braid & brows)
    for (const [y, w] of [[-27, 1.5], [-22, 1.6], [-17.5, 1.3]]) L.taper(ctx, [[-21, y + 1], [-8, y - 1], [3, y + 0.5], [17, y - 1]], w, C.skinD, 'both', 0.85);
    L.taper(ctx, [[-4, -12], [-3, -7]], 1.4, C.skinD); L.taper(ctx, [[4, -12], [3, -7]], 1.4, C.skinD); // glabella frown lines
    // eyes — small, deep-set, hooded
    const smile = ex === 'smile', shout = ex === 'shout', stern = ex === 'stern';
    for (const m of [-1, 1]) {
      const cx = 16 * m;
      if (smile) {
        L.taper(ctx, [[cx - 7, 1.5], [cx, -2.2], [cx + 7, 1.5]], 2.6, '#2a1a14');
        L.taper(ctx, [[cx - 6, 5], [cx, 6.5], [cx + 6, 5]], 1.1, C.skinD);
      } else {
        const op = shout ? 5.5 : stern ? 3.2 : 3.8;
        const eye = `M${cx - 7},1 C${cx - 4},${1 - op} ${cx + 4},${1 - op} ${cx + 7},0.5 C${cx + 4},3 ${cx - 4},3.2 ${cx - 7},1 Z`;
        L.fill(ctx, eye, '#efe6da');
        L.clip(ctx, eye, () => {
          L.fill(ctx, L.circle(cx + m * -0.6, 0.6, 3.5), C.iris); L.fill(ctx, L.circle(cx + m * -0.6, 0.6, 1.6), '#120a07');
          L.fill(ctx, L.circle(cx + m * -0.6 - 1.2, -0.6, 0.9), '#fff', 0.9);
          L.fill(ctx, `M${cx - 8},-4 L${cx + 8},-4 L${cx + 8},0 C${cx},-1 ${cx - 4},-0.5 ${cx - 8},0.5 Z`, '#000', 0.22);
        });
        L.taper(ctx, [[cx - 7.5, 1.2], [cx - 3, 1 - op - 0.4], [cx + 3, 1 - op - 0.3], [cx + 7.5, 0.6]], 2.2, '#24160f');
        L.taper(ctx, [[cx - 6, 2.6], [cx, 3.6], [cx + 6, 2.2]], 0.9, C.skinD);
      }
      // hooded upper lid fold + bags + crow's feet
      L.taper(ctx, [[cx - 7 * m, -2.6], [cx - 1 * m, -4.8], [cx + 6 * m, -4], [cx + 9.5 * m, -0.6]], 1.3, C.skinD, 'both', 0.9);
      L.taper(ctx, [[cx - 6, 6], [cx, 7.8], [cx + 6, 5.6]], 1.1, C.skinD, 'both', 0.8);
      const ox = cx + 8.5 * m;
      L.taper(ctx, [[ox, 0], [ox + 4 * m, -1.5]], 1, C.skinD); L.taper(ctx, [[ox, 2], [ox + 4.5 * m, 3]], 1, C.skinD);
    }
    // brows — bushy grey, pulled down at the centre (grump)
    for (const m of [-1, 1]) {
      const inY = smile ? -11 : shout ? -7.5 : stern ? -5 : -6.5, arch = smile ? -15 : -14.5;
      const b = `M${6 * m},${inY} C${12 * m},${arch - 1} ${22 * m},${arch - 2.5} ${32 * m},${-10} C${35 * m},-8.5 ${36 * m},-6 ${34 * m},-5 C${26 * m},${-8} ${15 * m},${inY + 1.2} ${6 * m},${inY + 3.6} Z`;
      L.part(ctx, b, C.grey, { sh: 1.4, hi: 0.5, rim: 0, lw: 1.3, ink: C.greyD });
      for (let i = 0; i < 6; i++) { const t = i / 5, x = (8 + 24 * t) * m; L.taper(ctx, [[x, inY + 2.5 - t * 1.5 + (arch - inY) * Math.sin(t * 2.6) * 0.6], [x + 4 * m, arch + 1 + t * 2.6]], 0.9, C.greyD, 'both', 0.8); }
      L.taper(ctx, [[31 * m, -8], [37 * m, -4], [38 * m, 0]], 1.6, C.grey); // drooping long hairs
    }
    // nose — broad, bulbous, ruddy tip
    L.part(ctx, 'M-4,-2 C-5,5 -7,10 -9,14 C-12,16 -11,21 -7,21 C-4,23 4,23 7,21 C11,21 12,16 9,14 C7,10 5,5 4,-2 Z', C.skin, { sh: 2.2, hi: 0.8, rim: 0.8, lw: 1.3, under: (c) => L.fill(c, L.ellipse(0, 16, 6.5, 4.5), C.blush, 0.55) });
    L.fill(ctx, L.ellipse(-3, 20.2, 2.2, 1.2), '#5a2f24', 0.85); L.fill(ctx, L.ellipse(3, 20.2, 2.2, 1.2), '#5a2f24', 0.85);
    L.fill(ctx, L.ellipse(-1.5, 14.5, 1.6, 1.1), '#fff', 0.55);
    // nasolabial folds
    L.taper(ctx, [[-10, 15], [-17, 24], [-20, 33]], 1.6, C.skinD); L.taper(ctx, [[10, 15], [17, 24], [20, 33]], 1.7, C.skinD);
    L.taper(ctx, [[-26, 6], [-27, 16]], 1, C.skinD, 'both', 0.6); L.taper(ctx, [[26, 6], [27, 16]], 1, C.skinD, 'both', 0.6);
    // mouth
    if (shout) {
      L.part(ctx, 'M-9,29 C-5,26 5,26 9,29 C8,37 4,40 0,40 C-4,40 -8,37 -9,29 Z', '#5a2420', { sh: 1, rim: 0, lw: 1.3 });
      L.fill(ctx, 'M-6,28.5 C-2,27.5 2,27.5 6,28.5 L5,30.5 L-5,30.5 Z', '#efe6d8');
      L.fill(ctx, L.ellipse(0, 37, 4, 2), '#b0574c');
    } else if (smile) {
      L.taper(ctx, [[-9, 29], [0, 32], [9, 29]], 1.7, '#5a2f26');
      L.fill(ctx, 'M-6,31.5 C-2,34.5 2,34.5 6,31.5 C3,33.5 -3,33.5 -6,31.5 Z', C.lip, 0.8);
    } else {
      L.taper(ctx, [[-9, 32], [0, 30], [9, 32]], 1.7, '#5a2f26');
      L.fill(ctx, 'M-6,32.5 C-2,35 2,35 6,32.5 C3,34 -3,34 -6,32.5 Z', C.lip, 0.75);
      L.taper(ctx, [[-10, 33], [-12, 37]], 1, C.skinD); L.taper(ctx, [[10, 33], [12, 37]], 1, C.skinD); // downturned corners
    }
    // drooping grey mustache (八字鬍) + short chin tuft
    for (const m of [-1, 1]) {
      const lift = smile ? -3 : 0;
      const d = `M${1 * m},22 C${6 * m},21 ${12 * m},23 ${15 * m},${27 + lift} C${18 * m},${31 + lift} ${20 * m},${35 + lift} ${19 * m},${39 + lift} C${16 * m},${35 + lift} ${11 * m},${30 + lift * 0.5} ${5 * m},${29} C${3 * m},28.5 ${1 * m},28 0,27.5 Z`;
      L.part(ctx, d, C.grey, { sh: 1.3, hi: 0.5, rim: 0, lw: 1.2, ink: C.greyD });
      for (let i = 0; i < 4; i++) L.taper(ctx, [[(3 + i * 3.5) * m, 23.5 + i * 0.5], [(6 + i * 3.6) * m, 28 + i * 2.2 + lift * 0.6]], 0.8, C.greyD, 'both', 0.75);
    }
    L.part(ctx, 'M-5,40 C-3,43 -2,48 0,52 C2,48 3,43 5,40 C2,41.5 -2,41.5 -5,40 Z', C.grey, { sh: 1, rim: 0, lw: 1.1, ink: C.greyD });
    if (smile) { L.taper(ctx, [[-22, 9], [-15, 13]], 1.2, C.skinD, 'both', 0.6); L.taper(ctx, [[22, 9], [15, 13]], 1.2, C.skinD, 'both', 0.6); }
  };

  // braid band seen wrapped round the head (points along the band)
  CB.braidBand = (ctx, pts, w) => {
    L.part(ctx, L.tube(pts, pts.map(() => w), 'flat'), C.grey, { sh: 2.5, hi: 1, rim: 1, lw: 1.5, ink: C.greyD });
    const s = L.spl(pts, 10); let acc = 0, k = 0;
    for (let i = 1; i < s.length; i++) {
      acc += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
      if (acc > 6) {
        acc = 0; k++;
        const [x, y] = s[i], a = Math.atan2(s[i][1] - s[i - 1][1], s[i][0] - s[i - 1][0]);
        const sgn = k % 2 ? 1 : -1;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        L.line(ctx, `M-3.5,${-w * 0.45 * sgn} C-1,${-w * 0.1 * sgn} 1,${w * 0.1 * sgn} 3.5,${w * 0.45 * sgn}`, C.greyD, 1.1);
        ctx.restore();
      }
    }
  };

  // ============================================================ BODY — FRONT (day look)
  const MX = (d, m) => (m < 0 ? d : L.mirrorD(d));           // author on viewer-left (m=-1), mirror for m=+1
  const MP = (pts, m) => (m < 0 ? pts : pts.map(([x, y]) => [-x, y]));
  CB.legFront = (ctx, m) => {
    // shoe 布鞋 (black cotton upper, white layered 千層底 sole)
    L.part(ctx, MX('M-62,-6 L-12,-6 L-12,1 C-30,3 -48,3 -62,1 Z', m), C.sole, { sh: 1.5, rim: 0, lw: 1.4, detail: (c) => L.line(c, MX('M-60,-2 L-14,-2', m), L.dk(C.sole, 0.25), 0.8) });
    L.part(ctx, MX('M-50,-30 C-58,-22 -62,-10 -60,-5 L-14,-5 C-12,-12 -14,-24 -20,-30 Z', m), C.shoe, { sh: 3, hi: 1.5, rim: 1.2, lights: [MX('M-50,-20 C-46,-24 -38,-24 -34,-20 C-38,-18 -46,-18 -50,-20 Z', m)] });
    // leg wraps 綁腿
    L.part(ctx, MX('M-56,-118 C-54,-84 -50,-52 -48,-28 L-20,-28 C-18,-52 -18,-84 -16,-118 Z', m), C.wrap, { sh: 5, hi: 2, rim: 1.4, ao: [-60, -28, 0.3], detail: (c) => {
      for (let y = -112; y < -28; y += 10) L.line(c, MX(`M-60,${y + 6} Q-36,${y + 3} -14,${y - 4}`, m), L.dk(C.wrap, 0.32), 1.2);
    } });
    L.line(ctx, MX('M-55,-114 C-40,-118 -28,-118 -17,-114', m), C.red, 2.4);
    // wide trousers 大褲, ballooning over the wraps
    L.part(ctx, MX('M-6,-212 C-30,-214 -56,-212 -64,-206 C-70,-180 -68,-146 -58,-116 C-44,-110 -26,-110 -15,-116 C-12,-150 -8,-180 -6,-212 Z', m), C.trou, { sh: 7, hi: 2.5, rim: 1.6, ao: [-150, -110, 0.4], detail: (c) => {
      const k = L.dk(C.trou, 0.6);
      L.taper(c, MP([[-50, -204], [-56, -170], [-50, -130]], m), 2.2, k); L.taper(c, MP([[-28, -204], [-32, -160], [-28, -124]], m), 1.8, k);
      L.taper(c, MP([[-64, -140], [-52, -122], [-36, -116]], m), 1.8, k);
      L.taper(c, MP([[-62, -186], [-60, -160]], m), 2.4, L.lt(C.trou, 0.16));
    } });
  };

  // 連袖 cut-in-one sleeve: the shoulder line runs from the collar straight down the arm (no shoulder seam)
  CB.sleeveD = 'M-40,-474 C-56,-468 -68,-458 -76,-442 C-86,-420 -94,-392 -98,-362 L-66,-360 C-65,-376 -63,-392 -60,-404 C-56,-420 -50,-440 -40,-474 Z';
  CB.armFront = (ctx, m, o = {}) => {
    L.part(ctx, MX(CB.sleeveD, m), C.indigo, { sh: 7, hi: 2.4, rim: 1.8, lw: 0, ao: [-420, -360, 0.22], detail: (c) => {
      const k = L.dk(C.indigo, 0.5);
      L.taper(c, MP([[-62, -402], [-74, -394], [-84, -392]], m), 2, k); L.taper(c, MP([[-63, -388], [-76, -378], [-90, -378]], m), 1.8, k);
      L.taper(c, MP([[-64, -416], [-72, -414]], m), 1.5, k); L.taper(c, MP([[-80, -436], [-90, -404]], m), 1.6, L.lt(C.indigo, 0.18));
    } });
    L.line(ctx, MX('M-40,-474 C-56,-468 -68,-458 -76,-442 C-86,-420 -94,-392 -98,-362', m), L.ink(C.indigo), 2);
    L.line(ctx, MX('M-60,-404 C-63,-392 -65,-376 -66,-360', m), L.ink(C.indigo), 2);
    // rolled cuff
    L.part(ctx, MX('M-99,-374 C-88,-370 -76,-370 -64,-372 L-64,-352 C-76,-350 -88,-350 -101,-354 Z', m), L.lt(C.indigo, 0.12), { sh: 2, hi: 1, rim: 1, lw: 1.8, detail: (c) => L.line(c, MX('M-100,-364 C-88,-361 -76,-361 -64,-362', m), L.dk(C.indigo, 0.3), 1) });
    // sleeve guard 袖套 (forearm)
    L.part(ctx, L.tube([[83 * m, -356], [82 * m, -312], [80 * m, -270]], [34, 30, 27], 'flat'), C.guard, { sh: 5, hi: 2, rim: 1.6, detail: (c) => {
      L.taper(c, [[76 * m, -342], [79 * m, -300]], 1.6, L.lt(C.guard, 0.2));
      L.line(c, `M${66 * m},-294 L${100 * m},-294`, L.lt(C.guard, 0.15), 1.1, { dash: [3, 3] });
    } });
    L.line(ctx, `M${67 * m},-350 C${77 * m},-346 ${91 * m},-347 ${99 * m},-352`, C.white, 2.2);
    L.line(ctx, `M${67 * m},-274 C${76 * m},-270 ${86 * m},-270 ${93 * m},-274`, C.white, 2.2);
  };

  CB.bodyFront = (ctx, o = {}) => {
    for (const m of [-1, 1]) CB.legFront(ctx, m);
    // jacket 對襟短衫 — round, slightly sloping shoulders, soft belly
    const jacket = 'M-28,-478 C-46,-472 -62,-462 -70,-446 C-74,-432 -70,-418 -66,-404 C-72,-366 -78,-322 -78,-276 C-50,-271 -20,-269 0,-269 C20,-269 50,-271 78,-276 C78,-322 72,-366 66,-404 C70,-418 74,-432 70,-446 C62,-462 46,-472 28,-478 Z';
    L.part(ctx, jacket, C.indigo, { sh: 9, hi: 3, rim: 2, ao: [-330, -270, 0.25], shades: ['M36,-474 C56,-440 58,-380 62,-276 L78,-276 C78,-322 72,-366 66,-404 C70,-418 74,-432 70,-446 C62,-462 50,-470 36,-474 Z'],
      detail: (c) => {
        L.part(c, 'M-16,-474 C-9,-458 -4,-444 0,-428 C4,-444 9,-458 16,-474 Z', C.white, { sh: 2, rim: 0, lw: 1.3 });
        L.line(c, 'M0,-428 L0,-270', L.dk(C.indigo, 0.55), 2.2);
        L.line(c, 'M-16,-474 C-9,-458 -4,-444 0,-428 M16,-474 C9,-458 4,-444 0,-428', L.lt(C.indigo, 0.3), 3.2);
        L.taper(c, [[-62, -400], [-48, -390], [-36, -392]], 2, L.dk(C.indigo, 0.45)); L.taper(c, [[62, -400], [48, -390], [36, -392]], 2, L.dk(C.indigo, 0.45));
        L.taper(c, [[-34, -372], [-14, -362], [-4, -364]], 1.6, L.dk(C.indigo, 0.4)); L.taper(c, [[30, -380], [14, -366]], 1.4, L.dk(C.indigo, 0.4));
        c.save(); c.globalAlpha = 0.07; c.fillStyle = '#fff'; for (let i = 0; i < 70; i++) { const x = ((i * 37) % 150) - 75, y = -470 + ((i * 53) % 190); c.fillRect(x, y, 6, 1.2); } c.restore();
      } });
    L.part(ctx, 'M-29,-480 C-20,-489 20,-489 29,-480 C26,-474 20,-472 16,-474 C8,-478 -8,-478 -16,-474 C-20,-472 -26,-474 -29,-480 Z', L.dk(C.indigo, 0.15), { sh: 1.5, rim: 0, lw: 1.5 });
    for (const m of [-1, 1]) if (o.skipArm !== m) CB.armFront(ctx, m, o);
    L.knot(ctx, -4, -448, 2.6, L.lt(C.indigo, 0.35), true); L.knot(ctx, 0, -410, 3, '#22324a'); L.knot(ctx, 0, -384, 3, '#22324a'); L.knot(ctx, 0, -358, 3, '#22324a');
    // apron 圍裙 — knee length canvas, stained
    const apron = 'M-66,-346 C-69,-300 -70,-250 -66,-198 C-40,-193 40,-193 66,-198 C70,-250 69,-300 66,-346 C30,-340 -30,-340 -66,-346 Z';
    L.part(ctx, apron, C.apron, { sh: 7, hi: 2.5, rim: 1.8, ao: [-260, -196, 0.25], detail: (c) => {
      for (const [x0, x1] of [[-44, -48], [-12, -16], [22, 26], [48, 52]]) L.taper(c, [[x0, -330], [x0 - 2, -270], [x1, -204]], 2, L.dk(C.apron, 0.35));
      L.fill(c, 'M36,-262 C44,-268 52,-258 46,-250 C42,-242 32,-248 36,-262 Z', C.stainR, 0.7);
      L.fill(c, L.ellipse(50, -240, 3, 2.5), C.stainR, 0.6); L.fill(c, L.ellipse(-48, -226, 5, 3.5), C.stainR, 0.45);
      L.fill(c, 'M-40,-326 C-36,-328 -34,-318 -36,-302 C-37,-298 -39,-306 -40,-326 Z', C.stainG, 0.7);
      L.fill(c, L.ellipse(-22, -214, 6, 3), C.stainG, 0.45);
      L.line(c, 'M-64,-206 C-30,-201 30,-201 64,-206', L.dk(C.apron, 0.25), 1.2, { dash: [4, 3] });
    } });
    for (let i = 0; i < 5; i++) L.part(ctx, `M${-23 + i * 4},-330 L${-22 + i * 4.2},-358 L${-20 + i * 4.2},-358 L${-20 + i * 4},-330 Z`, i % 2 ? '#d8b878' : C.bamboo, { sh: 0.6, rim: 0, lw: 1 });
    L.part(ctx, 'M6,-330 L9,-366 L13,-366 L12,-330 Z', '#6b4a2e', { sh: 1, rim: 0, lw: 1.1 }); L.part(ctx, 'M8.5,-366 C8,-374 10,-380 11,-382 C12,-380 14,-374 13.5,-366 Z', '#1d1a1e', { sh: 0.6, rim: 0, lw: 1 });
    L.part(ctx, 'M-30,-332 C-12,-330 14,-330 32,-332 L30,-284 C10,-282 -10,-282 -28,-284 Z', L.dk(C.apron, 0.06), { sh: 3, hi: 1, rim: 0.8, detail: (c) => L.line(c, 'M-26,-327 C-8,-325 12,-325 28,-327 L26,-288 C8,-286 -8,-286 -24,-288 Z', L.dk(C.apron, 0.35), 1, { dash: [3, 2.5] }) });
    L.part(ctx, 'M-70,-352 C-30,-344 30,-344 70,-352 L70,-338 C30,-332 -30,-332 -70,-338 Z', C.sash, { sh: 2.5, hi: 1, rim: 1.4 });
    L.part(ctx, L.tube([[-60, -342], [-66, -322], [-62, -296]], [9, 8, 6]), C.sash, { sh: 2, rim: 1 });
    L.part(ctx, L.tube([[-54, -342], [-54, -326], [-50, -308]], [8, 7, 5]), L.lt(C.sash, 0.06), { sh: 2, rim: 1 });
    L.part(ctx, L.ellipse(-58, -344, 7, 6), C.sash, { sh: 2, rim: 1 });
    if (!o.noHand) for (const m of [-1, 1]) if (o.skipArm !== m && o.skipHand !== m) L.hand(ctx, 80 * m, -272, m * -0.08, 50, C.skin, { mirror: m > 0, pose: 'relax', bony: true });
    // neck — thick, short (stoop)
    L.part(ctx, 'M-26,-500 C-27,-492 -28,-484 -30,-476 C-12,-470 12,-470 30,-476 C28,-484 27,-492 26,-500 Z', C.skin, { sh: 4, hi: 1, rim: 1.2, shades: ['M-24,-500 C-10,-484 10,-484 24,-500 L26,-500 C26,-492 24,-486 20,-484 C8,-480 -8,-480 -20,-484 C-24,-486 -26,-492 -26,-500 Z'] });
    if (!o.noPipe) CB.pipe(ctx, [60, -400], [86, -296], 1);
    if (!o.noTally) CB.tally(ctx, -42, -306, 1, o.glow);
  };

  CB.pipe = (ctx, a, b, s = 1) => { // a = bowl end, b = mouthpiece end
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    ctx.save(); ctx.translate(a[0], a[1]); ctx.rotate(ang);
    L.part(ctx, `M0,-3 L${len - 14},-2.6 L${len - 14},2.6 L0,3 Z`, C.bamboo, { sh: 1.4, hi: 0.6, rim: 0, lw: 1.3, detail: (c) => { for (let x = 22; x < len - 20; x += 26) L.line(c, `M${x},-3 L${x},3`, L.dk(C.bamboo, 0.4), 1.4); } });
    L.part(ctx, `M${len - 15},-3.2 L${len},-2.4 C${len + 3},-2 ${len + 3},2 ${len},2.4 L${len - 15},3.2 Z`, C.jade, { sh: 1.2, rim: 0, lw: 1.2 });
    L.part(ctx, 'M-2,-3.6 L-2,3.6 L6,3.6 L6,-3.6 Z', C.brass, { sh: 1, rim: 0, lw: 1.2 });
    L.part(ctx, 'M-12,-9 C-14,-2 -12,4 -6,5 L2,4 L3,-4 C2,-8 -4,-11 -12,-9 Z', C.brass, { sh: 2, hi: 1, rim: 0, lw: 1.3 });
    L.fill(ctx, 'M-12,-9 C-9,-11 -2,-9 2,-5 C-2,-6 -8,-7 -12,-9 Z', '#2a1d14');
    // tobacco pouch hanging from the bowl end
    ctx.restore();
    L.line(ctx, `M${a[0] - 2},${a[1] + 4} C${a[0] - 4},${a[1] + 16} ${a[0] - 2},${a[1] + 22} ${a[0] - 3},${a[1] + 26}`, '#3a2a20', 1.4);
    L.part(ctx, `M${a[0] - 11},${a[1] + 26} C${a[0] - 12},${a[1] + 40} ${a[0] + 6},${a[1] + 42} ${a[0] + 5},${a[1] + 26} C${a[0] + 1},${a[1] + 23} ${a[0] - 7},${a[1] + 23} ${a[0] - 11},${a[1] + 26} Z`, '#6c4a35', { sh: 2.5, hi: 1, rim: 1 });
    L.line(ctx, `M${a[0] - 10},${a[1] + 28} L${a[0] + 4},${a[1] + 28}`, C.red, 2);
  };

  // bronze fish half-tally 符節 inscribed 「渡」 (陳渡's half). Shape is hooked at the tail so the halves lock.
  CB.tally = (ctx, x, y, s = 1, glow = false) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const K0 = L.K; L.K = K0 / s;
    L.line(ctx, 'M0,-36 C-2,-24 1,-14 0,-8', C.red, 2.2); L.line(ctx, 'M1.5,-36 C0,-24 2.5,-14 1.5,-8', C.teal, 1.2);
    L.part(ctx, 'M0,-12 L4,-6 L-4,-6 Z', C.red, { sh: 0.5, rim: 0, lw: 1 });
    if (glow) L.glow(ctx, 0, 6, 34, C.teal, 0.55);
    const d = 'M-11,-6 C-4,-8 4,-8 9,-3 C12,0 12,6 9,10 C5,15 -3,16 -9,13 L-5,9 L-12,6 L-6,3 L-12,0 Z';
    L.part(ctx, d, C.bronze, { sh: 2, hi: 1, rim: 0.8, lw: 1.4, detail: (c) => {
      L.fill(c, L.circle(4, 0, 1.6), '#2b1d10'); L.line(c, 'M-2,-5 C2,-2 2,8 -2,12', L.dk(C.bronze, 0.4), 1);
      for (let i = 0; i < 3; i++) L.line(c, `M${-6 + i * 3.4},${-3 + i * 0.2} C${-4 + i * 3.4},1 ${-4 + i * 3.4},6 ${-6 + i * 3.4},10`, L.lt(C.bronze, 0.3), 0.8);
    } });
    L.line(ctx, 'M-1,14 C-2,22 -1,28 -2,34 M1,14 C2,22 1,28 2,34 M0,14 L0,36', C.red, 1.4); // tassel
    if (glow) L.line(ctx, 'M-2,-1 C2,1 4,5 2,9', C.teal, 1.4);
    L.K = K0; ctx.restore();
  };


  // ============================================================ HEAD — PROFILE (facing viewer-left; origin = ear centre)
  CB.headSide = (ctx) => {
    // rear hair (grey, unshaved back of the skull) is part of the skull shape below
    const skull = 'M4,-53 C-16,-54 -32,-46 -39,-32 C-43,-22 -45,-14 -46,-9 C-45,-6 -43,-4 -42,-3 C-44,3 -49,10 -54,15 C-60,19 -59,26 -53,27 C-50,27.5 -47,27 -45,28 C-44,31 -44,33 -45,35 C-43,37 -42,39 -43,41 C-43,45 -43,49 -40,52 C-34,56 -24,55 -16,51 C-8,46 0,42 8,38 C16,32 24,24 30,14 C37,0 38,-22 32,-36 C26,-47 16,-53 4,-53 Z';
    L.part(ctx, skull, C.skin, { sh: 4, hi: 1.5, rim: 1.2, dx: -1, shades: ['M-30,46 C-20,40 -6,36 2,45 C-4,45 -10,47 -16,50 C-22,54 -28,52 -30,46 Z', 'M-41,-2 C-37,-6 -32,-6 -28,-3 C-32,0 -37,0 -41,-2 Z'],
      under: (c) => { L.fill(c, L.ellipse(-26, 16, 9, 7), C.blush, 0.35); L.fill(c, L.ellipse(-53, 20, 5, 4), C.blush, 0.6); L.fill(c, L.ellipse(-22, -38, 12, 5, 0.3), '#fff', 0.12); } });
    // rear hair cap
    L.part(ctx, 'M8,-52 C20,-51 30,-44 34,-32 C39,-16 36,4 28,20 C22,28 16,30 12,26 C14,14 12,4 8,-6 C6,-20 4,-38 8,-52 Z', C.grey, { sh: 2.5, hi: 1, rim: 1, dx: -1, lw: 1.5, ink: C.greyD, detail: (c) => {
      for (let i = 0; i < 7; i++) L.taper(c, [[10 + i * 3, -48 + i * 2], [20 + i * 2.2, -30 + i * 4], [26 + i * 0.6, -14 + i * 4]], 1, C.greyD, 'both', 0.7);
    } });
    // ear
    L.part(ctx, 'M-4,-10 C2,-14 10,-10 10,-2 C11,6 8,14 3,17 C-1,18 -4,14 -4,10 Z', C.skin, { sh: 2, hi: 0.8, rim: 1, dx: -1, detail: (c) => L.line(c, 'M-1,-6 C5,-8 7,-2 6,4 C5,9 3,11 0,11', C.skinD, 1.2) });
    // forehead wrinkles, brow, eye
    for (const y of [-28, -22, -17]) L.taper(ctx, [[-40, y], [-34, y - 1.2], [-28, y - 0.6]], 1.3, C.skinD, 'both', 0.8);
    L.part(ctx, 'M-44,-12 C-38,-16 -30,-16 -22,-13 C-20,-11 -20,-9 -22,-8 C-28,-10 -36,-10 -44,-8 Z', C.grey, { sh: 1, rim: 0, lw: 1.2, ink: C.greyD });
    L.taper(ctx, [[-23, -11], [-18, -6], [-17, -2]], 1.6, C.grey);
    L.fill(ctx, 'M-39,-2 C-36,-4.5 -33,-4.5 -31,-3 C-33,-0.5 -36,0 -39,-1 Z', '#efe6da');
    L.fill(ctx, L.ellipse(-37, -2.2, 1.6, 1.8), C.iris);
    L.taper(ctx, [[-40, -2], [-35, -5], [-30, -3.4]], 1.8, '#24160f'); L.taper(ctx, [[-35, -7], [-28, -6]], 1, C.skinD);
    L.taper(ctx, [[-36, 4], [-30, 5]], 1, C.skinD); L.taper(ctx, [[-28, -1], [-24, -2.5]], 0.9, C.skinD); L.taper(ctx, [[-28, 1.5], [-24, 2.5]], 0.9, C.skinD);
    L.taper(ctx, [[-44, 22], [-38, 30], [-35, 38]], 1.5, C.skinD); // nasolabial
    L.fill(ctx, L.ellipse(-50, 24, 2.6, 1.4, 0.3), '#5a2f24', 0.8); L.taper(ctx, [[-47, 13], [-45, 19], [-48, 24]], 1.2, C.skinD);
    // mustache & tuft
    L.part(ctx, 'M-49,27 C-44,26 -38,28 -35,32 C-33,36 -33,41 -35,45 C-37,41 -40,37 -45,35 C-46,32 -47,29 -49,27 Z', C.grey, { sh: 1.2, rim: 0, lw: 1.1, ink: C.greyD });
    L.part(ctx, 'M-42,46 C-39,49 -39,55 -44,61 C-46,56 -46,51 -44,47 Z', C.grey, { sh: 0.8, rim: 0, lw: 1.1, ink: C.greyD });
    L.taper(ctx, [[-43, 38.5], [-39, 39]], 1.3, '#5a2f26');
  };

  // ============================================================ HEAD — BACK (origin = eye line, as front)
  CB.headBack = (ctx) => {
    for (const m of [-1, 1]) L.part(ctx, MX('M-36,-6 C-46,-12 -51,-1 -48,9 C-46,17 -42,22 -36,20 Z', m), C.skin, { sh: 2.5, hi: 0.8, rim: 1 });
    L.part(ctx, 'M0,-47 C25,-47 39,-31 38,-9 C38,6 37,20 32,32 C22,42 -22,42 -32,32 C-37,20 -38,6 -38,-9 C-39,-31 -25,-47 0,-47 Z', C.grey, { sh: 4, hi: 1.5, rim: 1.4, ink: C.greyD,
      detail: (c) => { // hair combed back & down to the queue root at the occiput
        for (let i = -7; i <= 7; i++) { const a0 = (i / 7) * 1.25; L.taper(c, [[Math.sin(a0) * 40, -46 * Math.cos(a0 * 0.9) + 2], [Math.sin(a0) * 22, -16], [i * 0.9, 4]], 1.1, C.greyD, 'both', 0.7); }
        for (let i = -4; i <= 4; i++) L.taper(c, [[i * 8, 34 - Math.abs(i) * 2], [i * 3, 18], [i * 0.8, 9]], 1, C.greyD, 'both', 0.6);
      } });
    L.part(ctx, 'M-6,0 C-8,6 -5,12 0,13 C5,12 8,6 6,0 C3,-2 -3,-2 -6,0 Z', C.grey, { sh: 1.5, rim: 0, ink: C.greyD });
    L.line(ctx, 'M-6,9 L6,9', C.red, 2.2);
  };

  // queue braid hanging along a path
  CB.queue = (ctx, pts, w = 9) => {
    const s = L.spl(pts, 10), N = s.length;
    L.part(ctx, L.tube(pts, pts.map((_, i) => w * (1 - 0.4 * (i / (pts.length - 1))))), L.dk(C.grey, 0.12), { sh: 2, hi: 0, rim: 0.8, lw: 1.5, ink: C.greyD });
    let acc = 0, k = 0, total = 0; for (let i = 1; i < N; i++) total += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    let run = 0;
    for (let i = 1; i < N; i++) {
      const d = Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); acc += d; run += d;
      if (acc < 5.2) continue; acc = 0; k++;
      const [x, y] = s[i], a = Math.atan2(s[i][1] - s[i - 1][1], s[i][0] - s[i - 1][0]);
      const ww = w * (1 - 0.4 * (run / total)), sg = k % 2 ? 1 : -1;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      L.part(ctx, `M${-ww * 0.55},${sg * ww * 0.5} C${-ww * 0.2},${sg * ww * 0.55} ${ww * 0.5},${sg * ww * 0.1} ${ww * 0.55},${-sg * ww * 0.12} C${ww * 0.1},${-sg * ww * 0.05} ${-ww * 0.3},${sg * ww * 0.05} ${-ww * 0.55},${sg * ww * 0.5} Z`, C.grey, { sh: 1, hi: 0.4, rim: 0, lw: 1, ink: C.greyD });
      ctx.restore();
    }
    const e = s[N - 1];
    L.part(ctx, `M${e[0] - 3.5},${e[1] - 6} L${e[0] + 3.5},${e[1] - 6} L${e[0] + 3},${e[1] + 2} L${e[0] - 3},${e[1] + 2} Z`, C.red, { sh: 1, rim: 0, lw: 1.1 });
    for (let i = -2; i <= 2; i++) L.taper(ctx, [[e[0] + i, e[1] + 2], [e[0] + i * 1.6, e[1] + 24]], 1.5, i % 2 ? C.red : L.dk(C.red, 0.2), 'end');
  };

  // ============================================================ BODY — SIDE (facing viewer-left)
  CB.side = (ctx, o = {}) => {
    // far leg (peeks behind)
    ctx.save(); ctx.translate(10, 0);
    L.part(ctx, 'M-52,-5 L18,-5 L18,1 C-10,3 -40,3 -54,1 Z', L.dk(C.sole, 0.2), { sh: 1, rim: 0, lw: 1.3 });
    L.part(ctx, 'M-50,-6 C-48,-16 -36,-26 -22,-30 L12,-30 C14,-20 16,-10 16,-6 Z', L.dk(C.shoe, 0.2), { sh: 2, rim: 0 });
    ctx.restore();
    // queue down the back (drawn before body so the jacket collar overlaps its root)
    // near leg
    L.part(ctx, 'M-54,-5 L16,-5 L16,1 C-10,3 -40,3 -56,1 Z', C.sole, { sh: 1.2, rim: 0, lw: 1.4, detail: (c) => L.line(c, 'M-52,-2 L14,-2', L.dk(C.sole, 0.25), 0.8) });
    L.part(ctx, 'M-52,-6 C-50,-16 -38,-26 -22,-30 L12,-30 C14,-20 16,-10 16,-6 Z', C.shoe, { sh: 2.5, hi: 1, rim: 1.2, dx: -1, lights: ['M-46,-12 C-40,-20 -30,-24 -24,-24 C-30,-20 -38,-16 -46,-12 Z'] });
    L.part(ctx, 'M-28,-118 C-26,-86 -24,-56 -22,-28 L12,-28 C14,-50 20,-80 18,-118 Z', C.wrap, { sh: 5, hi: 2, rim: 1.4, dx: -1, detail: (c) => {
      for (let y = -112; y < -28; y += 10) L.line(c, `M-30,${y + 2} Q-6,${y + 6} 22,${y - 2}`, L.dk(C.wrap, 0.32), 1.2);
    } });
    L.line(ctx, 'M-28,-114 C-14,-112 4,-112 18,-115', C.red, 2.4);
    L.part(ctx, 'M-44,-262 C-46,-210 -42,-170 -34,-130 C-32,-124 -30,-120 -28,-116 C-12,-112 6,-112 22,-118 C28,-160 32,-210 34,-268 C10,-276 -24,-276 -44,-262 Z', C.trou, { sh: 7, hi: 2.5, rim: 1.6, dx: -1, ao: [-170, -116, 0.35], detail: (c) => {
      const k = L.dk(C.trou, 0.6);
      L.taper(c, [[-32, -240], [-34, -180], [-26, -132]], 2, k); L.taper(c, [[22, -240], [18, -170], [12, -124]], 2, k);
      L.taper(c, [[-36, -146], [-18, -130], [0, -122]], 1.8, k); L.taper(c, [[-30, -170], [-14, -150]], 1.6, k);
    } });
    // queue
    CB.queue(ctx, [[18, -540], [34, -500], [50, -458], [54, -410], [50, -360], [46, -318]], 10);
    // jacket (stooped: rounded upper back, head forward)
    L.part(ctx, 'M-32,-482 C-40,-462 -44,-440 -44,-414 C-46,-380 -48,-330 -46,-276 C-16,-271 18,-271 44,-276 C42,-320 40,-360 44,-400 C48,-440 38,-472 16,-490 C0,-494 -20,-490 -32,-482 Z', C.indigo, { sh: 8, hi: 3, rim: 2, dx: -1, ao: [-330, -274, 0.25], detail: (c) => {
      L.taper(c, [[20, -470], [36, -440], [40, -400]], 2, L.dk(C.indigo, 0.45));
      L.taper(c, [[-34, -400], [-20, -392]], 1.6, L.dk(C.indigo, 0.4));
      L.line(c, 'M44,-300 L50,-276', L.dk(C.indigo, 0.55), 1.6); // side slit
      c.save(); c.globalAlpha = 0.07; c.fillStyle = '#fff'; for (let i = 0; i < 50; i++) { const x = ((i * 37) % 90) - 45, y = -470 + ((i * 53) % 190); c.fillRect(x, y, 6, 1.2); } c.restore();
    } });
    L.part(ctx, 'M-31,-482 C-22,-488 2,-494 16,-490 L14,-480 C0,-484 -18,-480 -28,-474 Z', L.dk(C.indigo, 0.15), { sh: 1.5, rim: 0, lw: 1.5 });
    L.part(ctx, 'M-31,-480 C-34,-470 -36,-460 -38,-450 L-34,-448 C-30,-460 -28,-470 -26,-478 Z', C.white, { sh: 0.8, rim: 0, lw: 1.2 });
    // apron (side: thin canvas plane in front)
    L.part(ctx, 'M-48,-348 C-52,-300 -54,-250 -54,-198 L-44,-196 C-42,-250 -42,-300 -42,-346 Z', C.apron, { sh: 2, rim: 0.8, lw: 1.6, detail: (c) => L.fill(c, 'M-50,-250 L-46,-250 L-46,-238 L-50,-238 Z', C.stainR, 0.6) });
    L.part(ctx, 'M-50,-354 C-20,-358 20,-358 46,-354 L46,-340 C20,-344 -20,-344 -50,-340 Z', C.sash, { sh: 2.5, hi: 1, rim: 1.4, dx: -1 });
    // pipe at his left hip (near side)
    CB.pipe(ctx, [-8, -398], [20, -296], 1);
    // near arm
    L.part(ctx, L.tube([[6, -444], [4, -404], [0, -360]], [46, 38, 34]), C.indigo, { sh: 6, hi: 2, rim: 1.6, dx: -1, detail: (c) => { L.taper(c, [[10, -420], [8, -392], [4, -370]], 2, L.dk(C.indigo, 0.5)); } });
    L.part(ctx, L.tube([[1, -372], [0, -354]], [37, 36], 'flat'), L.lt(C.indigo, 0.12), { sh: 2, hi: 1, rim: 1, lw: 1.6 });
    L.part(ctx, L.tube([[0, -356], [-6, -312], [-12, -272]], [33, 30, 27], 'flat'), C.guard, { sh: 5, hi: 2, rim: 1.6, dx: -1 });
    L.line(ctx, 'M-16,-350 C-6,-346 8,-347 16,-352', C.white, 2.2);
    L.line(ctx, 'M-26,-276 C-18,-272 -6,-271 2,-275', C.white, 2.2);
    L.hand(ctx, -12, -274, 0.1, 50, C.skin, { mirror: true, pose: 'relax', bony: true });
    // neck + head (forward)
    L.part(ctx, 'M-34,-500 C-34,-492 -34,-486 -34,-478 C-14,-472 6,-478 18,-488 C16,-500 14,-510 12,-520 Z', C.skin, { sh: 4, rim: 1.2, dx: -1, detail: (c) => { L.taper(c, [[-24, -494], [-14, -486]], 1.2, C.skinD); L.taper(c, [[0, -504], [6, -494]], 1.2, C.skinD); } });
    ctx.save(); ctx.translate(-8, -524); ctx.rotate(-0.06); CB.headSide(ctx); ctx.restore();
  };

  // ============================================================ BODY — BACK
  CB.back = (ctx, o = {}) => {
    for (const m of [-1, 1]) {
      L.part(ctx, MX('M-62,-6 L-12,-6 L-12,1 C-30,3 -48,3 -62,1 Z', m), C.sole, { sh: 1.5, rim: 0, lw: 1.4 });
      L.part(ctx, MX('M-50,-30 C-56,-24 -60,-12 -58,-5 L-16,-5 C-14,-12 -16,-24 -20,-30 Z', m), C.shoe, { sh: 3, hi: 1.5, rim: 1.2 });
      L.part(ctx, MX('M-56,-118 C-56,-90 -52,-56 -48,-28 L-20,-28 C-18,-52 -18,-84 -16,-118 Z', m), C.wrap, { sh: 5, hi: 2, rim: 1.4, ao: [-60, -28, 0.3], detail: (c) => {
        for (let y = -112; y < -28; y += 10) L.line(c, MX(`M-60,${y - 3} Q-36,${y + 3} -14,${y + 6}`, m), L.dk(C.wrap, 0.32), 1.2);
      } });
      L.line(ctx, MX('M-55,-114 C-40,-118 -28,-118 -17,-114', m), C.red, 2.4);
      L.part(ctx, MX('M-4,-262 C-30,-266 -58,-262 -66,-250 C-72,-200 -68,-150 -58,-116 C-44,-110 -26,-110 -15,-116 C-10,-160 -6,-210 -4,-262 Z', m), C.trou, { sh: 7, hi: 2.5, rim: 1.6, detail: (c) => {
        const k = L.dk(C.trou, 0.6);
        L.taper(c, MP([[-50, -240], [-56, -180], [-50, -130]], m), 2.2, k); L.taper(c, MP([[-24, -236], [-28, -170], [-26, -124]], m), 1.8, k);
        L.taper(c, MP([[-56, -146], [-44, -128], [-28, -122]], m), 1.8, k);
      } });
    }
    L.part(ctx, 'M-28,-478 C-46,-472 -62,-462 -70,-446 C-74,-432 -70,-418 -66,-404 C-72,-366 -78,-322 -78,-276 C-50,-271 -20,-269 0,-269 C20,-269 50,-271 78,-276 C78,-322 72,-366 66,-404 C70,-418 74,-432 70,-446 C62,-462 46,-472 28,-478 Z', C.indigo, { sh: 9, hi: 3, rim: 2, ao: [-330, -270, 0.25],
      detail: (c) => {
        L.line(c, 'M0,-480 L0,-270', L.dk(C.indigo, 0.4), 1.4); // back seam
        // mended patch 補丁 (shoulder blade) — story detail: he still wears the jacket he had when 星河 was a baby
        L.part(c, 'M10,-446 L44,-450 L46,-414 L12,-410 Z', C.patch, { sh: 2, rim: 0, lw: 1.4, detail: (cc) => L.line(cc, 'M13,-443 L41,-446 L43,-417 L15,-413 Z', L.lt(C.patch, 0.4), 1.1, { dash: [2.5, 2] }) });
        L.taper(c, [[-40, -440], [-20, -420], [-10, -380]], 2, L.dk(C.indigo, 0.4)); L.taper(c, [[40, -400], [26, -372]], 1.8, L.dk(C.indigo, 0.4));
        L.line(c, 'M-74,-300 L-78,-276 M74,-300 L78,-276', L.dk(C.indigo, 0.55), 1.6);
        c.save(); c.globalAlpha = 0.07; c.fillStyle = '#fff'; for (let i = 0; i < 70; i++) { const x = ((i * 37) % 150) - 75, y = -470 + ((i * 53) % 190); c.fillRect(x, y, 6, 1.2); } c.restore();
      } });
    for (const m of [-1, 1]) CB.armFront(ctx, m, o);
    L.part(ctx, 'M-29,-480 C-20,-489 20,-489 29,-480 C24,-476 -24,-476 -29,-480 Z', L.dk(C.indigo, 0.15), { sh: 1.5, rim: 0, lw: 1.5 });
    // apron waist tie band + bow at the back
    L.part(ctx, 'M-70,-352 C-30,-344 30,-344 70,-352 L70,-338 C30,-332 -30,-332 -70,-338 Z', C.sash, { sh: 2.5, hi: 1, rim: 1.4 });
    L.part(ctx, 'M0,-346 C-10,-358 -26,-360 -28,-350 C-30,-340 -14,-336 0,-342 Z', C.sash, { sh: 2, rim: 1 });
    L.part(ctx, 'M0,-346 C10,-358 26,-360 28,-350 C30,-340 14,-336 0,-342 Z', C.sash, { sh: 2, rim: 1 });
    L.part(ctx, L.tube([[-3, -342], [-8, -320], [-6, -300]], [7, 6, 5]), C.sash, { sh: 1.5, rim: 1 });
    L.part(ctx, L.tube([[3, -342], [8, -322], [10, -306]], [7, 6, 5]), C.sash, { sh: 1.5, rim: 1 });
    L.part(ctx, L.ellipse(0, -345, 5, 5), L.dk(C.sash, 0.1), { sh: 1, rim: 0 });
    for (const m of [-1, 1]) L.hand(ctx, 80 * m, -272, m * -0.08, 50, C.skin, { mirror: m < 0, pose: 'relax', bony: true });
    CB.pipe(ctx, [-60, -400], [-86, -296], 1);
    L.part(ctx, 'M-26,-500 C-27,-492 -28,-484 -30,-476 C-12,-472 12,-472 30,-476 C28,-484 27,-492 26,-500 Z', C.skin, { sh: 4, rim: 1.2, detail: (c) => { for (const y of [-492, -486]) L.taper(c, [[-16, y], [0, y + 1.5], [16, y]], 1.2, C.skinD, 'both', 0.7); } });
    ctx.save(); ctx.translate(0, -531); CB.headBack(ctx); ctx.restore();
    CB.queue(ctx, [[0, -524], [0, -500], [1, -460], [0, -420], [-1, -380], [0, -330]], 10);
  };

  // ============================================================ HIDDEN 引魂人 GEAR (front, ready to row the Black Tide)
  CB.oar = (ctx, x, top, glow = true) => { // vertical 引魂槳, blade planted at y=0
    const bladeTop = -236;
    L.part(ctx, `M${x - 5},${top + 8} L${x + 5},${top + 8} L${x + 5.5},${bladeTop} L${x - 5.5},${bladeTop} Z`, C.oar, { sh: 2.5, hi: 1, rim: 1.2, detail: (c) => {
      L.line(c, `M${x - 1},${top + 20} L${x - 1},${bladeTop}`, L.lt(C.oar, 0.25), 1.2, { a: 0.6 });
    } });
    L.part(ctx, `M${x - 22},${top - 2} C${x - 22},${top - 9} ${x + 22},${top - 9} ${x + 22},${top - 2} L${x + 22},${top + 6} C${x + 10},${top + 10} ${x - 10},${top + 10} ${x - 22},${top + 6} Z`, C.oar, { sh: 2, hi: 1, rim: 1 }); // T-grip
    L.part(ctx, `M${x - 7},${top + 8} L${x + 7},${top + 8} L${x + 7},${top + 16} L${x - 7},${top + 16} Z`, C.bronze, { sh: 1.5, rim: 0, lw: 1.3 });
    for (let i = 0; i < 6; i++) L.line(ctx, `M${x - 6},${top + 60 + i * 6} L${x + 6},${top + 64 + i * 6}`, i % 2 ? C.teal : C.red, 2.4); // cord wrap
    // blade — dark wood, inlaid soul-tide lines (paint/emissive texture, not geometry)
    const blade = `M${x - 8},${bladeTop} C${x - 22},${bladeTop + 40} ${x - 25},${bladeTop + 150} ${x - 18},${-26} C${x - 12},${-6} ${x - 4},${-1} ${x},${-1} C${x + 4},${-1} ${x + 12},${-6} ${x + 18},${-26} C${x + 25},${bladeTop + 150} ${x + 22},${bladeTop + 40} ${x + 8},${bladeTop} Z`;
    L.part(ctx, blade, C.oar, { sh: 4, hi: 1.5, rim: 1.4, detail: (c) => {
      const ln = glow ? C.teal : L.lt(C.oar, 0.2);
      for (let i = 0; i < 4; i++) { const y = bladeTop + 70 + i * 30; L.line(c, `M${x - 16},${y} C${x - 8},${y - 8} ${x - 2},${y + 6} ${x + 4},${y - 2} C${x + 9},${y - 8} ${x + 13},${y - 2} ${x + 17},${y - 6}`, ln, 1.8); }
      L.line(c, `M${x},${bladeTop + 14} L${x},${bladeTop + 52}`, ln, 1.6);
      c.save(); c.fillStyle = ln; c.font = `bold 18px ${L.FONT_ZH}`; c.textAlign = 'center'; c.fillText('渡', x, bladeTop + 46 + 0); c.restore();
    } });
    if (glow) { for (let i = 0; i < 4; i++) L.glow(ctx, x, bladeTop + 80 + i * 30, 26, C.teal, 0.22); }
    L.part(ctx, `M${x - 9},${bladeTop - 8} L${x + 9},${bladeTop - 8} L${x + 10},${bladeTop + 6} L${x - 10},${bladeTop + 6} Z`, C.bronze, { sh: 1.5, hi: 0.6, rim: 0.6, lw: 1.4, detail: (c) => L.line(c, `M${x - 9},${bladeTop - 1} L${x + 9},${bladeTop - 1}`, L.dk(C.bronze, 0.4), 1) });
  };

  CB.soulLantern = (ctx, x, y, s = 1, lit = true) => { // 引魂燈: white paper globe, black lacquer caps, 「引」
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); const K0 = L.K; L.K = K0 / s;
    if (lit) L.glow(ctx, 0, 0, 70, C.teal, 0.5);
    L.line(ctx, 'M0,-40 L0,-26', '#2a2026', 1.6);
    L.part(ctx, 'M-9,-27 L9,-27 L11,-20 L-11,-20 Z', '#1f1b22', { sh: 1, rim: 0, lw: 1.3 });
    L.part(ctx, 'M-11,-20 C-26,-16 -26,16 -11,20 L11,20 C26,16 26,-16 11,-20 Z', lit ? '#e9fbf6' : '#efe7d6', { sh: 3, hi: 0, rim: 0, lw: 1.5, ink: '#2b3a3a', shCol: lit ? '#9fe6dc' : '#cfc3ad', detail: (c) => {
      for (const xx of [-12, -5, 5, 12]) L.line(c, `M${xx},-19 C${xx * 1.25},-6 ${xx * 1.25},6 ${xx},19`, lit ? '#8fd8cc' : '#bba98c', 0.9);
      c.save(); c.fillStyle = lit ? '#1f6e66' : '#3a3036'; c.font = `bold 15px ${L.FONT_ZH}`; c.textAlign = 'center'; c.fillText('引', 0, 6); c.restore();
    } });
    L.part(ctx, 'M-11,20 L11,20 L9,26 L-9,26 Z', '#1f1b22', { sh: 1, rim: 0, lw: 1.3 });
    L.line(ctx, 'M0,26 L0,32', C.red, 2); for (let i = -2; i <= 2; i++) L.taper(ctx, [[i * 0.8, 31], [i * 1.6, 46]], 1.6, C.red, 'end');
    L.K = K0; ctx.restore();
  };

  // straw rain cape 簑衣 — three tied tiers, open at the front
  CB.strawTier = (ctx, W, T, B, F, seed) => {
    let r = seed; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    for (const m of [-1, 1]) {
      const pts = []; const n = 16;
      for (let i = 0; i <= n; i++) { const t = i / n; pts.push([(-W - 4 + (W + 4 - F) * t) * -m * -1, B + Math.sin(t * Math.PI) * 4 + (rnd() - 0.5) * 6]); }
      let d = `M${-22 * m * -1 * -1},-478 C${-50 * m * -1 * -1},-472 ${-80 * m * -1 * -1},${T - 14} ${-W * m * -1 * -1},${T}`;
      // build in viewer-left space then mirror
      let dd = `M-22,-478 C-50,-472 -${W - 8},${T - 16} -${W},${T} L-${W + 6},${B}`;
      for (let i = 0; i <= n; i++) { const t = i / n, xx = -(W + 6) + (W + 6 - F) * t, yy = B + Math.sin(t * Math.PI) * 5 + (rnd() - 0.5) * 7; dd += ` L${xx.toFixed(1)},${yy.toFixed(1)}`; }
      dd += ` C-${F - 4},${(B - 60).toFixed(0)} -26,${-430} -22,-478 Z`;
      const path = MX(dd, m);
      L.part(ctx, path, C.straw, { sh: 8, hi: 2.5, rim: 2, ao: [T, B, 0.35], detail: (c) => {
        let rr = seed * 7 + (m > 0 ? 3 : 0); const rn = () => ((rr = (rr * 9301 + 49297) % 233280) / 233280);
        for (let i = 0; i < 70; i++) {
          const t = rn(), xx = -(W + 2) + (W + 2 - F) * t, y0 = T + (B - T) * 0.15 * rn() + (1 - t) * 0 - 8, y1 = B + 4 + rn() * 6;
          const col = [C.strawD, C.strawL, L.dk(C.straw, 0.15)][i % 3];
          L.taper(c, MP([[xx + 2, y0], [xx - 1 + (rn() - 0.5) * 3, (y0 + y1) / 2], [xx - 3 - t * 2, y1]], m), 1.5 + rn(), col, 'mid', 0.8);
        }
      } });
      // fringe tips poking past the edge
      let rr2 = seed * 13 + (m > 0 ? 5 : 1); const rn2 = () => ((rr2 = (rr2 * 9301 + 49297) % 233280) / 233280);
      for (let i = 0; i < 26; i++) { const t = i / 25, xx = -(W + 4) + (W + 4 - F) * t, yy = B + Math.sin(t * Math.PI) * 5 - 6; L.taper(ctx, MP([[xx, yy], [xx - 1.5, yy + 10 + rn2() * 8]], m), 2, i % 2 ? C.strawD : C.straw, 'end'); }
      // binding twine
      L.line(ctx, MX(`M-26,-470 C-52,-462 -${W - 10},${T - 4} -${W + 1},${T + 6}`, m), '#5b4426', 1.6, { dash: [5, 3] });
    }
  };

  CB.hat = (ctx, o = {}) => { // 斗笠 conical bamboo hat (origin = head eye line)
    const cone = 'M-106,-29 L0,-92 L106,-29 C104,-19 60,-12 0,-12 C-60,-12 -104,-19 -106,-29 Z';
    L.part(ctx, cone, C.hat, { sh: 8, hi: 3, rim: 2, ao: [-60, -12, 0.25], detail: (c) => {
      for (let i = -9; i <= 9; i++) L.line(c, `M0,-90 L${i * 11.6},${-14 - (1 - Math.abs(i) / 9) * 2}`, L.dk(C.hat, 0.28), 0.9);
      for (let k = 1; k <= 5; k++) { const t = k / 6; L.line(c, `M${-106 * t},${-92 + 63 * t} C${-60 * t},${-92 + 76 * t} ${60 * t},${-92 + 76 * t} ${106 * t},${-92 + 63 * t}`, L.dk(C.hat, 0.2), 0.8); }
      // painted order sigil: soul-lantern in a wave ring (teal lacquer)
      c.save(); c.translate(0, -44); L.line(c, 'M-14,0 C-14,-12 14,-12 14,0 C14,12 -14,12 -14,0 Z', C.teal, 2); L.line(c, 'M-6,-7 L6,-7 L8,6 L-8,6 Z M0,-11 L0,-7', C.teal, 1.8); L.line(c, 'M-22,10 C-16,6 -10,14 -4,10 C2,6 8,14 14,10 C18,7 20,9 22,10', C.teal, 1.5); c.restore();
    } });
    L.part(ctx, 'M-106,-29 C-104,-19 60,-12 0,-12 C-60,-12 -104,-19 -106,-29 Z', C.hat, { lw: 0, sh: 0, rim: 0 });
    L.part(ctx, 'M-107,-30 C-105,-18 -60,-10 0,-10 C60,-10 105,-18 107,-30 C106,-24 60,-15 0,-15 C-60,-15 -106,-24 -107,-30 Z', L.dk(C.hat, 0.35), { sh: 0, hi: 0, rim: 0, lw: 1.6 });
    L.part(ctx, L.ellipse(0, -91, 6, 4), L.dk(C.hat, 0.3), { sh: 1, rim: 0, lw: 1.3 });
  };

  CB.gear = (ctx, o = {}) => {
    const ox = -122;
    // oar behind the fist
    CB.oar(ctx, ox, -678, true);
    CB.bodyFront(ctx, { skipArm: -1, skipHand: 1, noPipe: true, noTally: true });
    // viewer-right hand holding the tally by its cord
    L.hand(ctx, 80, -272, -0.05, 50, C.skin, { mirror: true, pose: 'hook', bony: true });
    CB.tally(ctx, 76, -218, 1.15, true);
    // straw cape tiers (back to front)
    CB.strawTier(ctx, 104, -414, -294, 44, 11);
    CB.strawTier(ctx, 98, -436, -350, 34, 23);
    CB.strawTier(ctx, 86, -456, -408, 27, 37);
    // forearm rising along the cape's edge, fist on the oar shaft
    L.part(ctx, L.tube([[-100, -300], [-110, -282], [-117, -330], [ox + 2, -380]], [30, 31, 28, 26], 'flat'), C.guard, { sh: 4, hi: 1.5, rim: 1.4, detail: (c) => L.taper(c, [[-112, -300], [-116, -350]], 1.6, L.lt(C.guard, 0.2)) });
    L.part(ctx, 'M-88,-300 C-94,-286 -104,-276 -114,-276 C-122,-282 -124,-296 -118,-306 L-96,-312 Z', C.indigo, { sh: 3, hi: 1, rim: 1.2 }); // elbow of the sleeve peeking below the straw
    L.line(ctx, `M${ox - 14},-374 C${ox - 6},-370 ${ox + 6},-370 ${ox + 14},-376`, C.white, 2.2);
    L.hand(ctx, ox + 1, -376, Math.PI, 42, C.skin, { pose: 'grip', mirror: true });
    // lantern hanging off the T-grip
    L.line(ctx, `M${ox - 20},-680 C${ox - 26},-668 ${ox - 30},-656 ${ox - 30},-640`, '#2a2026', 1.6);
    CB.soulLantern(ctx, ox - 30, -600, 1, true);
    // neck/head/hat
    ctx.save(); ctx.translate(0, -531); CB.headFront(ctx, 'stern');
    L.clip(ctx, L.ellipse(0, -6, 44, 44), () => { const g = ctx.createLinearGradient(0, -16, 0, 10); g.addColorStop(0, 'rgba(24,26,48,0.75)'); g.addColorStop(0.6, 'rgba(24,26,48,0.35)'); g.addColorStop(1, 'rgba(24,26,48,0)'); ctx.fillStyle = g; ctx.fillRect(-60, -16, 120, 26); });
    L.glow(ctx, -40, 0, 30, C.teal, 0.18);
    L.line(ctx, 'M-34,-18 C-36,0 -30,30 -8,46 M34,-18 C36,0 30,30 8,46', '#4a3a26', 1.6); // chin cord
    CB.hat(ctx); ctx.restore();
  };

  CB.front = (ctx, o = {}) => {
    CB.bodyFront(ctx, o);
    ctx.save(); ctx.translate(0, -531); CB.headFront(ctx, o.ex || 'grump'); ctx.restore();
  };

  G.CB = CB;
})(window);
