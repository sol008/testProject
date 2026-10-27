// 彼岸燈 — bespoke main-cast builds for G.Char3D (see chars.js and docs/CONTRACTS_3D.md).
//
// Every cast member is a LOOK: a data spec deep-merged onto the character's G.Sprites spec, plus 3D-only data
// (face3d: painted-face parameters, body3d: proportions, style: rest-pose personality, props3d: weapon looks,
// expr: default expression) and optional bespoke part builders (parts: [fn(B, C)]) for signature pieces that the
// generic garment kit cannot express (tiered straw / feather capes, strip mantles, crowns …).
//
// Swapping a costume is a data change:  G.Char3D.defineLook('baizhi', 'opt07', { spec: {...}, face3d: {...} });
//                                        G.Char3D.setLook('baizhi', 'opt07');
// A look may name per-context variants ({ contextLooks: { battle: 'guide' } }) and extend another look
// ({ extend: 'day', spec: {...} }) — 陳伯 wears his hidden 引魂人 gear in battle without a second body.
//
// Sources: docs/design/REFERENCES.md (白芷 face & hair, binding), docs/design/v2/*.md + sheets (final designs:
// chenbo, yexuan, moya; the party's client picks per docs/design/PICKS.md: 星河 #07, 白芷 #02, 紅纓 #01, 雲歸 #01),
// docs/STORY_BIBLE.md. Party looks carry a `sheet` clip that reproduces the design card's pose (bench: anim=sheet).
'use strict';
(() => {
  const C = G.Char3D, I = C._internal;
  const { vadd, vsub, vsc, vnorm, vlerp, lerp, clamp, sstep, shade, rgba, mixc, wmix, grid, tube, blob } = I;
  const PI = Math.PI, TAU = PI * 2;
  const { sin, cos, abs, min, max, round, floor, pow, acos } = Math;
  const P2 = C.paint;
  C.HEROES = ['xinghe', 'baizhi', 'hongying', 'yungui', 'chenbo', 'yexuan', 'qingfeng', 'qingfeng_mask', 'qingxu', 'moya', 'tengpo', 'nianer', 'lantern_mother'];
  const look = (id, name, L) => C.defineLook(id, name, Object.assign({ hero: true }, L));

  // ================================================================================================ bespoke parts
  // Shoulder cape surface: neck ring → over the shoulder caps → falls (with flare) to yHem; open at the front.
  function capeSurf(B, yHem, inf, flare = 0.3, drop = 0) {
    const P = B.P, s = P.s, R = C.torsoRings(P);
    const yS = P.shoulderY - 0.045 * s - drop;
    return (th, t) => {
      const tS = 0.16;
      if (t <= tS) { const k = t / tS; const y = lerp(P.neckY + 0.004 * s - drop, yS, k); return C.torsoPt(C.ringAt(R, clamp(y, P.legTop, P.neckY)), th, lerp(0.016 * s + inf * 0.3, inf, k)); }
      const k = (t - tS) / (1 - tS);
      const a = C.torsoPt(C.ringAt(R, yS), th, inf);
      const y = lerp(yS, yHem, k);
      const body = C.torsoPt(C.ringAt(R, clamp(y, P.legTop - 0.06 * s, P.shoulderY)), th, inf);
      const fl = 1 + flare * pow(k, 1.2);
      let x = a[0] * fl, z = a[2] * fl - 0.02 * s * k;
      if (abs(body[0]) + 0.01 > abs(x)) x = body[0] + Math.sign(body[0]) * 0.01;
      if (body[2] < 0 && body[2] - 0.01 < z) z = min(z, body[2] - 0.015 * s);
      return [x, y, z];
    };
  }
  // Layered rain-cape (簑衣) / feather mantle: several shell tiers, each with a jagged fringe, open at the front.
  function tieredCape(B, o) {
    const P = B.P, s = P.s;
    const tiers = o.tiers;
    tiers.forEach((tr, i) => {
      const yHem = P.shoulderY - tr.len * s;
      const rect = B.rect('tier' + (o.key || '') + i, 2 * PI * (P.sh + 0.1), tr.len + 0.1, o.paint(i), {});
      const teeth = o.teeth || 22;
      const wave = (th) => -(o.toothLen || 0.05) * s * (0.55 + 0.45 * abs(sin(th * teeth * 0.5 + i))) * (o.ragged ? 0.6 + 0.4 * sin(th * 7.3 + i * 2) : 1);
      const surf0 = capeSurf(B, yHem, (tr.inf || 0.05) * s + (B.S.armor ? 0.015 : 0), tr.flare != null ? tr.flare : 0.35, (tr.drop || 0) * s);
      C.hemShell(B, { name: 'tier' + (o.key || '') + i, parent: 'chest', rect, yTop: P.neckY, yHem, inflate: tr.inf || 0.05, th0: o.open ? 0.3 : -PI, th1: o.open ? TAU - 0.3 : PI,
        chains: o.chains || 5, nu: 30, nv: 8, segs: 2, rigidTop: 0.3, stiff: o.stiff || 2.0, grav: o.grav || 0.6,
        surf: (th, t) => { const p = surf0(th, t); if (t > 0.97) p[1] += wave(th); return p; },
        topW: () => [[B.b('chest'), 0.85], [B.b('neck'), 0.15]], groups: ['body', 'leg'], hitR: 0.04 * s, uvf: (u, v) => [u, v] });
    });
  }
  const strawPaint = (base) => (i) => (g, x, y, w, h) => {
    P2.cloth(g, x, y, w, h, shade(base, -0.04 * i), { weave: 'straw', folds: false, weaveK: 0.5 });
    const R = I.rng('straw' + i);
    for (let k = 0; k < w * 0.7; k++) { const sx = x + R() * w; g.strokeStyle = rgba(R() < 0.5 ? shade(base, -0.35) : shade(base, 0.25), 0.35 + R() * 0.3); g.lineWidth = 0.8 + R(); g.beginPath(); g.moveTo(sx, y + R() * h * 0.3); g.lineTo(sx + (R() - 0.5) * 3, y + h); g.stroke(); }
    g.fillStyle = rgba(shade(base, -0.45), 0.6); g.fillRect(x - 2, y + h * 0.12, w + 4, max(1.5, h * 0.03)); // binding cord
    P2.aoEdges(g, x, y, w, h, 0.35, 0.05);
  };
  const featherPaint = (base, sheen) => (i) => (g, x, y, w, h) => {
    P2.cloth(g, x, y, w, h, base, { weave: 'silk', folds: false });
    const R = I.rng('fth' + i);
    const rows = 7, cols = 34;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const fx = x + (c + (r % 2) * 0.5) / cols * w, fy = y + (r + 0.75) / rows * h, fw = w / cols * 0.66, fh = h / rows * 1.7;
      g.fillStyle = rgba(shade(base, -0.25 + R() * 0.2), 0.95);
      g.beginPath(); g.moveTo(fx, fy - fh * 0.75); g.quadraticCurveTo(fx + fw, fy - fh * 0.1, fx, fy + fh * 0.35); g.quadraticCurveTo(fx - fw, fy - fh * 0.1, fx, fy - fh * 0.75); g.fill();
      g.strokeStyle = rgba(sheen, 0.55); g.lineWidth = 1; g.beginPath(); g.moveTo(fx, fy - fh * 0.65); g.lineTo(fx, fy + fh * 0.3); g.stroke();
    }
    P2.aoEdges(g, x, y, w, h, 0.3, 0.0);
  };
  // Stand-up feather ruff around the neck (cards radiating up & out)
  function featherRuff(B, o) {
    const P = B.P, s = P.s;
    const rect = C.swatch(B, 'crow');
    const n = o.n || 22;
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU;
      if (abs(Math.atan2(sin(th), cos(th))) < 0.35) continue; // open at the throat
      const c = [sin(th) * (P.neckR + 0.03 * s), P.neckY - 0.012 * s, cos(th) * (P.neckR + 0.03 * s) - 0.01];
      const out = [sin(th), 0, cos(th)];
      const L = (o.len || 0.09) * s * (0.85 + 0.3 * abs(cos(th * 3)));
      const pts = [c, vadd(c, vadd(vsc(out, L * 0.35), [0, L * 0.5, 0])), vadd(c, vadd(vsc(out, L * 0.75), [0, L * 0.85, 0]))];
      tube(B.G, pts, 4, rect, (t) => ({ rx: 0.018 * s * (1 - t * 0.85), ry: 0.0035 * s }), () => [[B.b('chest'), 0.6], [B.b('neck'), 0.4]], { nv: 4, up: out });
    }
  }
  // 千條簑: mantle of silk strips with gold-dipped tips (short at the front, long at the back), each on a 2-bone chain
  function stripMantle(B, o) {
    const P = B.P, s = P.s, R = C.torsoRings(P);
    const rect = B.rect('strip', 0.06, 0.6, (g, x, y, w, h, d) => {
      P2.cloth(g, x, y, w, h, o.color, { weave: 'silk', folds: false });
      g.fillStyle = o.tip; g.fillRect(x - 2, y + h * 0.84, w + 4, h * 0.17);
      g.fillStyle = rgba('#ffffff', 0.4); g.fillRect(x - 2, y + h * 0.84, w + 4, h * 0.02);
      g.strokeStyle = rgba(shade(o.color, -0.25), 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h * 0.84); g.stroke();
    });
    const n = o.n || 30;
    const yS = P.shoulderY + 0.005 * s;
    for (let i = 0; i < n; i++) {
      const th = -PI + (i + 0.5) / n * TAU;
      const front = max(0, cos(th));
      if (front > 0.92) continue; // clasp gap at the throat
      const L = lerp(o.back || 0.5, o.front || 0.2, pow(front, 0.7)) * s;
      const p0 = C.torsoPt(C.ringAt(R, yS), th, 0.075 * s);
      const outD = vnorm([sin(th), 0, cos(th)]);
      const p1 = vadd(p0, vadd(vsc(outD, 0.035 * s), [0, -L * 0.45, 0])), p2 = vadd(p0, vadd(vsc(outD, 0.06 * s), [0, -L, 0]));
      const ids = B.chain('strip' + i, 'chest', [p0, p1, p2], { stiff: 1.4, drag: 0.35, grav: 0.7, r: 0.018 * s, groups: ['body'], kind: 'ribbon' });
      const side = [cos(th), 0, -sin(th)];
      tube(B.G, [p0, p1, p2], 4, rect, (t) => ({ rx: (0.024 * (t < 0.82 ? 1 : (1 - t) / 0.18)) * s + 0.001, ry: 0.003 * s }),
        (t) => (t < 0.08 ? [[B.b('chest'), 1]] : [[ids[t < 0.5 ? 0 : 1], 1]]), { nv: 6, up: outD, uvf: (u, v) => [u, v] });
    }
  }
  // 雲肩 cloud collar: short closed shoulder cape with a lantern-lobed gold edge
  function cloudCollar(B, o) {
    const P = B.P, s = P.s;
    const rect = B.rect('cloudcollar', 2 * PI * (P.sh + 0.08), 0.2, (g, x, y, w, h, d) => {
      P2.cloth(g, x, y, w, h, o.color, { weave: 'silk', folds: false });
      g.strokeStyle = o.edge; g.lineWidth = max(2, h * 0.07);
      g.beginPath(); for (let k = 0; k <= 8; k++) { const cx = x + w * k / 8; g.moveTo(cx - w / 16, y + h * 0.9); g.quadraticCurveTo(cx, y + h * 0.55, cx + w / 16, y + h * 0.9); } g.stroke();
      g.fillStyle = o.edge; g.fillRect(x - 2, y + h * 0.92, w + 4, h * 0.09);
      for (let k = 0; k < 8; k++) { const cx = x + w * (k + 0.5) / 8; g.fillStyle = o.edge; g.beginPath(); g.arc(cx, y + h * 0.5, h * 0.06, 0, TAU); g.fill(); }
    });
    const yHem = P.shoulderY - (o.len || 0.12) * s;
    const surf0 = capeSurf(B, yHem, 0.055 * s, 0.45);
    C.hemShell(B, { name: 'cloud', parent: 'chest', rect, yTop: P.neckY, yHem, inflate: 0.055, th0: -PI, th1: PI, chains: 6, nu: 40, nv: 5, segs: 1, rigidTop: 0.5, stiff: 4,
      surf: (th, t) => { const p = surf0(th, t); if (t > 0.6) p[1] += -0.025 * s * abs(sin(th * 4)) * sstep(0.6, 1, t); return p; },
      topW: () => [[B.b('chest'), 1]], groups: ['body'], hitR: 0.03 * s });
    // gold lantern clasp at the throat
    const c = C.torsoPt(C.ringAt(C.torsoRings(P), P.neckY - 0.03 * s), 0, 0.05 * s);
    blob(B.G, 8, 6, C.swatch(B, 'gold'), c, [0.016 * s, 0.022 * s, 0.01 * s], [[B.b('chest'), 1]]);
  }
  // pendant drop earrings on short chains from the ear lobes
  function earrings(B, o) {
    const P = B.P, s = P.s, F = B.F;
    for (const sg of o.sides || [1, -1]) {
      // the lobe of the (small, tucked) ear: see buildHead (ear centre between eye and nose height)
      const lobe = C.headPt(B, sg * 1.6, acos(clamp((F.eyeY + F.noseY) * 0.5 + 0.02 - 0.16 * (F.ears || 1), -1, 1)), 0.006 * s);
      const L = (o.len || 0.045) * s;
      const pts = [lobe, vadd(lobe, [0, -L * 0.6, 0]), vadd(lobe, [0, -L, 0])];
      const ids = B.chain('ear' + (sg > 0 ? 'L' : 'R'), 'head', pts, { stiff: 0.6, drag: 0.3, grav: 1.2, r: 0.006, groups: [], kind: 'prop' });
      tube(B.G, [pts[0], pts[1]], 4, C.swatch(B, 'gold'), () => ({ rx: 0.0012 * s }), () => [[ids[0], 1]], { nv: 2, linear: true });
      blob(B.G, 6, 5, C.swatch(B, o.bead || 'dark'), pts[1], [0.0045 * s, 0.0045 * s, 0.0045 * s], [[ids[0], 1]]);
      blob(B.G, 7, 6, C.swatch(B, o.drop || 'jade'), vadd(pts[2], [0, 0.004 * s, 0]), [0.006 * s, 0.011 * s, 0.006 * s], [[ids[1], 1]]);
    }
  }
  // 長明冠 lantern crown on the top knot: black lacquer cage with gold frame, horizontal pin, blue captive flame,
  // black gauze ribbons trailing behind on chains
  function lanternCrown(B, o) {
    const P = B.P, s = P.s;
    const top = C.headPt(B, PI, 0.15, 0.03 * s);
    const W = [[B.b('head'), 1]];
    const lq = C.swatch(B, 'lacq'), gold = C.swatch(B, 'gold');
    const K = C.propKit(B, 'head', vadd(top, [0, 0.01 * s, 0]));
    K.lathe((v) => [lerp(0.026, 0.03, sin(v * PI)) * s, v * 0.055 * s], 'lacq', 10, 4);
    K.lathe((v) => [0.034 * s * (1 - v * 0.15), 0.055 * s + v * 0.006 * s], 'gold', 10, 2);
    K.lathe((v) => [0.033 * s, -0.002 + v * 0.008 * s], 'gold', 10, 1);
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + PI / 4; K.cyl([cos(a) * 0.03 * s, 0, sin(a) * 0.03 * s], [cos(a) * 0.03 * s, 0.056 * s, sin(a) * 0.03 * s], 0.0028 * s, 0.0028 * s, 'gold', 4); }
    K.cyl([-0.075 * s, 0.03 * s, 0], [0.075 * s, 0.03 * s, 0], 0.0035 * s, 0.0035 * s, 'gold', 5);
    K.ball([0, 0.085 * s, 0], 0.012 * s, 'blue', 0.8, 1.6, 0.8);
    B.lights.push({ bone: 'head', pos: K.T([0, 0.085 * s, 0]), color: '#8fdcff', i: 0.3, r: 1.2, flicker: 0.2 });
    const rr = I.clothRect(B, 'gauze', 0.08, 0.4, '#16151c', { weave: 'silk', folds: false });
    for (const sg of [-1, 1]) {
      const p0 = K.T([sg * 0.02 * s, 0.02 * s, -0.03 * s]);
      const pts = [p0, vadd(p0, [sg * 0.01, -0.12 * s, -0.04 * s]), vadd(p0, [sg * 0.015, -0.24 * s, -0.06 * s]), vadd(p0, [sg * 0.015, -0.34 * s, -0.07 * s])];
      const ids = B.chain('gauze' + (sg > 0 ? 'L' : 'R'), 'head', pts, { stiff: 0.6, drag: 0.3, grav: 0.9, r: 0.012, groups: ['body', 'head'], kind: 'ribbon' });
      C.ribbon(B, pts, ids, rr, (t) => (0.012 + 0.004 * t) * s, [1, 0, 0], () => 0.0015);
    }
  }
  // tied tail from the top knot (夜玄) with a gold cuff
  function knotTail(B, o) {
    const P = B.P, s = P.s;
    const lockR = B.rects.hairLock;
    const p0 = C.headPt(B, PI, 0.35, 0.03 * s);
    const L = (o.len || 0.4) * s;
    const pts = [p0, vadd(p0, [0, -0.05 * s, -0.05 * s]), vadd(p0, [0, -L * 0.45, -0.1 * s]), vadd(p0, [0, -L, -0.12 * s])];
    const ids = B.chain('ktail', 'head', pts, { stiff: 0.8, drag: 0.3, grav: 0.9, r: 0.03 * s, groups: ['body', 'head'], kind: 'hair' });
    C.lock(B, lockR, pts, 0.03 * s, 0.016 * s, (t) => [[ids[min(2, floor(t * 3))], 1]], { up: [1, 0, 0], nv: 12 });
    const g = C.swatch(B, 'gold');
    tube(B.G, [vadd(pts[1], [0, 0.012, 0.01]), vadd(pts[1], [0, -0.012, -0.012])], 8, g, () => ({ rx: 0.022 * s, ry: 0.018 * s }), () => [[ids[0], 1]], { nv: 1, linear: true });
  }
  // feathers at a chain tip (墨鴉's queue) / sticking up from a hat
  function featherTuft(B, bone, at, dirs, len, opts = {}) {
    const s = B.P.s, rect = C.swatch(B, 'crow');
    for (const d of dirs) {
      const dn = vnorm(d);
      const pts = [at, vadd(at, vsc(dn, len * 0.5 * s)), vadd(at, vsc(dn, len * s))];
      tube(B.G, pts, 4, rect, (t) => ({ rx: (0.012 * sin(min(1, t * 1.2) * PI) + 0.001) * s, ry: 0.002 * s }), () => [[typeof bone === 'number' ? bone : B.b(bone), 1]], { nv: 4, up: opts.up || [0, 0, 1] });
    }
  }

  // ================================================================================================ 沈星河 (FINAL: v2 #07 螢火劍客, docs/design/v2/xinghe.md §07)
  // The Firefly Swordsman, 7.4 heads, the tallest/leanest/sharpest cut: crown-high ponytail tied with a red cord
  // (wuxia), centre-parted fringe with long sideburn locks; narrow long face, long upturned amber eyes with firelight,
  // sword brows, pressed lips. Charcoal 大襟 long tunic to the knee (right overlap, ember piping, side slits, ember
  // flame-tongue embroidery at the hem) over a dark-red inner collar; long ember scarf (one end down the chest, one
  // trailing); wide leather belt with a round brass boss; leather bracers; black trousers tucked into tall riding
  // boots; 「螢火」 drawn with an ember glow along the edge, its lacquer scabbard slung at the left hip; red string on
  // the left wrist (the sword-finger hand).
  const XH = { char: '#2a2a31', ember: '#e0672a', scarf: '#d9622a', leather: '#5b3a26', brass: '#c99a3e', skin: '#e2ae88', hair: '#161317', boot: '#4e3626' };
  function xingheHem(g, x, y, w, h, d, U, V) { // ember flame tongues rising from the hem band (front + back)
    const by = y + h - max(2, h * 0.018);
    for (const c0 of [0, PI]) for (let k = -2; k <= 2; k++) {
      if (c0 === PI && k === 0) continue; // no flame on the centre-back seam
      let th = c0 + k * 0.32; if (th > PI) th -= TAU;
      const cx = U(th), fh = h * (0.085 + 0.03 * ((k + 5) % 2)), fw = w * 0.012;
      g.fillStyle = XH.ember;
      g.beginPath(); g.moveTo(cx - fw, by); g.quadraticCurveTo(cx - fw * 0.6, by - fh * 0.5, cx + fw * 0.5, by - fh); g.quadraticCurveTo(cx + fw * 0.2, by - fh * 0.45, cx + fw, by); g.closePath(); g.fill();
    }
    g.fillStyle = XH.ember; g.fillRect(x - 2, by - max(1.5, h * 0.006), w + 4, max(1.5, h * 0.008));
  }
  look('xinghe', 'v2_07', {
    spec: {
      body: 'adult', skin: XH.skin, eyes: '#9a521c',
      hair: { style: 'center', part: 0, color: XH.hair, sheen: '#4c4a62', back: 'ponytail', len: 0.36, tie: '#c8432b', tiePh: 0.22, arch: 0.08, sweep: 0.22, stiff: 0.9, locks: 0.95, vol: 1.12, bangLen: 0.1, bangSpread: 1.1, bangW: 1.3, front: 1.12, temple: 0.1 },
      hat: null,
      top: { color: XH.char, len: 0.46, closure: 'side', inner: '#6e2420', trim: XH.ember, sleeve: 'long', cuff: XH.char, slits: 0.07, hemArt: xingheHem },
      scarf: { color: XH.scarf, trim: '#b8481c', tail: 0.7, front: 0.26, w: 0.042, sweep: 1.0 },
      belt: { color: XH.leather, buckle: XH.brass, w: 0.05, round: 0.024 }, bracers: { color: XH.leather, from: 0.45, side: 'R' },
      bottom: { type: 'pants', color: '#1f1f25' }, shoes: { type: 'boots', color: XH.boot, sole: '#241a14', from: 0.47, flare: 1.14, band: '#4c382c' },
      sash: null, leggings: null, back: null, held: null,
      bracelet: { color: '#e0302a', side: 'L' }, hip: ['sword'], weapon: 'sword', aura: '#ff9a3c',
    },
    body3d: { H: 1.76, head: 0.228, headW: 0.164, headD: 0.19, legTop: 0.91, sh: 0.176, chestW: 0.146, waistW: 0.118, hipW: 0.138, armR: 0.044, foreR: 0.037, thighR: 0.07, calfR: 0.048 },
    face3d: { eyeStyle: 'sharp', ew: 0.31, eh: 0.4, tilt: 0.42, iris: '#9a521c', irisLight: '#ffb050', lash: 0.3, browW: 2.5, browArch: 0.06, browAng: -0.3, browCol: '#141116',
      chin: 0.52, jaw: 0.86, jawTop: -0.2, cheek: 0.0, mouth: 'flat', restCurve: -0.08, mouthW: 0.15, blush: 0.05 },
    expr: 'determined',
    props3d: { sword: { glow: 'ember', blade: 'steel', guard: 'bronze', pommel: 'bronze', grip: 'dark', tassel: true } },
    style: { rest: { head: [-2, 0, 0], chest: [-2, 0, 0] } },
    clips: {
      // the sheet pose (card art / select screen): 螢火 drawn low and angled at the ground, left hand in 劍指 at the chest
      sheet: () => ({ dur: 3, loop: true, k: [
        { t: 0, hp: [0, -0.01, 0], h: [0, -6, 0], sp: [0, 2, 0], ch: [-2, 6, 0], nk: [0, -4, 0], hd: [-2, -6, -2], fL: [0.03, 0, 0.02], fR: [-0.03, 0, -0.02], fLy: -6, fRy: 10,
          hR: [-0.27, 0.86, 0.12], hRd: [-0.5, -0.72, 0.42], hRm: 'on', hL: [0.06, 1.3, 0.22], hLr: [-70, 30, 20], hLm: 'on' },
        { t: 1.5, ch: [-0.5, 6, 0], hp: [0, -0.016, 0], hR: [-0.27, 0.855, 0.12], hL: [0.06, 1.305, 0.22] },
        { t: 3, hp: [0, -0.01, 0], ch: [-2, 6, 0], hR: [-0.27, 0.86, 0.12], hL: [0.06, 1.3, 0.22] },
      ] }),
    },
  });

  // ================================================================================================ 白芷 (FINAL: v2 #02 藍衫笛歌, docs/design/v2/baizhi.md §02)
  // Face & hair follow docs/design/REFERENCES.md (binding): very long straight jet-black hair (#17151C) with a blue-black
  // sheen, worn down, slightly off-centre part; the long face-framing curtain falls on the VIEWER'S LEFT (her right),
  // the other side is tucked behind the ear, where the long drop earring hangs (gold hook, dark bead, jade drop); soft
  // oval face; mid-sized dark-brown almond eyes, softly upturned, subtle double lid; natural soft brows; small nose; full
  // rose lips in a faint knowing half-smile; beauty mark on HER RIGHT cheek beside the nose (viewer's left); dreamy gaze.
  // Costume (Hakka guest outfit from the 竹塹 山歌 duel, 7 heads, vertical column + banner sleeves): indigo 藍衫 to
  // mid-calf (right overlap 大襟 with light-blue piping, side slits), wide banner sleeves with turned-back light-blue and
  // cream cuff bands, dark 圍身裙 bib apron on a silver neck chain with gold running stitch and embroidered flowers, black
  // trousers, cloth shoes; half-up loop with a jade comb and red string; red string at the wrist; jade flute with the
  // red-string 「白芷」 jade tag hanging from its foot.
  const BZ = { shirt: '#36598a', cuff: '#a9c9e6', cream: '#f4efe6', apron: '#2b2a3a', hair: '#17151c', sheen: '#5d6f98', skin: '#f3dccb', jade: '#9fd3bd', red: '#c3303a' };
  look('baizhi', 'v2_02', {
    spec: {
      body: 'female', skin: BZ.skin, eyes: '#4b2c20',
      hair: { style: 'center', part: 0.18, color: BZ.hair, sheen: BZ.sheen, back: 'long', len: 0.52, locks: 1.75, locksSide: 'R', tuck: 'L', tie: BZ.red, knot: 'halfup', knotPh: 0.36, loop: true,
        pins: [{ type: 'comb', color: BZ.jade, th: 1.15, ph: 0.45, w: 0.05, h: 0.02, string: BZ.red }], vol: 1.14, bangLen: -0.02, bangSpread: 1.35, bangW: 1.25, front: 1.1, temple: 0.12 },
      hat: null,
      top: { color: BZ.shirt, len: 0.72, closure: 'side', inner: BZ.cream, trim: BZ.cuff, sleeve: 'banner', cuff: BZ.cuff, cuff2: BZ.cream, cuffW: 0.15, sleeveR: 0.1, hang: 0.3, slits: 0.06, button: BZ.cream },
      apron: { color: BZ.apron, len: 0.62, bib: true, bibDrop: 0.075, bibW: 0.6, chain: '#c8ccd6', stitch: '#d8b860', emb: '#e8788a', embN: 3, band: '#1e1d2b', trim: '#4a5a82' },
      skirt: null, sash: null, vest: null,
      bottom: { type: 'pants', color: '#1e1d26' }, shoes: { type: 'cloth', color: BZ.apron, sole: '#8a8698' },
      bracelet: { color: BZ.red }, hip: ['jade'], held: null, weapon: 'flute', glow: '#bfe8ff', aura: '#7fd3ff',
    },
    // slender, graceful build (REFERENCES.md: slender neck and shoulders): narrow shoulders and waist with a soft hip
    // curve, long legs, a long slim neck, fine wrists, small hands and feet
    body3d: { H: 1.64, head: 0.222, headW: 0.164, headD: 0.184, legTop: 0.885, neckLen: 0.06, neckR: 0.031,
      sh: 0.137, chestW: 0.118, chestF: 0.084, chestB: 0.077, waistW: 0.088, waistF: 0.064, waistB: 0.062, hipW: 0.136, hipF: 0.086, hipB: 0.102,
      upArm: 0.262, foreArm: 0.222, armR: 0.03, elbowR: 0.024, foreR: 0.025, wristR: 0.0175, hand: 0.138, palm: 0.8,
      thighR: 0.066, kneeR: 0.038, calfR: 0.041, ankleR: 0.022, foot: 0.198, footW: 0.034, hipSep: 0.076 },
    // delicate oval face, gently tapered chin; large soft almond eyes, upturned outer corners, long lashes, subtle double
    // lid; natural softly arched brows; small refined nose; full rose-pink lips in a faint smile; light blush
    face3d: {
      eyeStyle: 'soft', ew: 0.29, eh: 0.6, tilt: 0.26, irisR: 0.6, iris: '#4b2c20', irisLight: '#9a6a46', lash: 1.0, lidW: 1.1, wing: 1.15, dbl: 0.85, low: 0.6,
      browW: 1.1, browArch: 0.42, browAng: 0.04, browCol: '#17131a', browY: 0.21,
      lips: '#cf7684', lipTint: 0.85, lipFull: 1.25, mouthW: 0.185, restCurve: 0.34,
      chin: 0.64, jaw: 0.9, jawTop: -0.28, cheek: 0.0, nose: 0.85, noseH: 0.1, blush: 0.6, blushCol: '#f2808e',
      marks: [{ x: -0.21, y: -0.34, r: 0.8, color: '#3a2224' }],
    },
    expr: 'dreamy',
    props3d: { flute: { mat: 'jade', tag: true, len: 1.45, foot: 0.3 } },
    // posture & motion: upright, relaxed, elegant economy of movement
    style: {
      rest: { chest: [-2, 0, 0], head: [-3, 0, -3], neck: [-3, 0, 0], shoulderL: [0, 0, 1.5], shoulderR: [0, 0, -1.5], upperArmL: [0, 0, -3], upperArmR: [0, 0, 3] },
      idle: { shift: 1, tilt: 4, hands: 'fold', sway: 0.8, dur: 5.5 },   // weight on one leg, hands lightly folded at the waist
      fidgets: ['f_look', 'f_shift', 'f_tuck'],
      // a lighter step: soft heel strike, smaller arm swing with soft elbows and wrists, feet near one line, a little
      // more hip sway and roll, a lifted chest
      gait: {
        walk: { lift: 0.065, bob: 0.014, sway: 0.028, hipYaw: 5, hipRoll: 5.5, chestYaw: -4, arm: 13, armOut: 3, elbow: 16, heel: 11, toeOff: 28, lean: 1.5, twist: 2, track: 0.03, toeOut: 3, wrist: 10, wristOut: 6 },
        jog: { arm: 22, armOut: 4, sway: 0.018, hipRoll: 4.5, track: 0.018, wrist: 8 },
        run: { arm: 32, sway: 0.012, track: 0.012, wrist: 6 },
      },
      // battle: a poised 丁字步 (front foot on the line, back foot turned out, weight back), flute raised to the lips
      stance: { flute: { fL: [0.0, 0, 0.1], fR: [-0.045, 0, -0.06], fLy: -2, fRy: 38, hp: [0.008, -0.022, -0.01], h: [0, -14, 2], sp: [0, 2, 0], ch: [-4, 9, -2], nk: [-2, -4, 2], hd: [-5, -8, 8],
        hR: [-0.16, 1.49, 0.17], hRr: [-4, 90, 0] } },
    },
    parts: [(B) => earrings(B, { sides: [1], len: 0.05, bead: 'dark', drop: 'jade' })],
    clips: {
      // the sheet pose: the jade flute held level across the body at the waist, both hands near its middle
      sheet: () => ({ dur: 4, loop: true, k: [
        { t: 0, hp: [0, 0, 0], ch: [-1, 0, 0], nk: [-2, 0, 0], hd: [-3, 6, -4], fL: [0.01, 0, 0], fR: [-0.01, 0, 0],
          hR: [-0.06, 1.06, 0.22], hRd: [1, 0, 0.03], hRroll: 90, hRm: 'on', hL: 0.13, hLm: 'on' },
        { t: 2, ch: [0.5, 0, 0], hp: [0, -0.005, 0], hR: [-0.06, 1.055, 0.22] },
        { t: 4, ch: [-1, 0, 0], hp: [0, 0, 0], hR: [-0.06, 1.06, 0.22] },
      ] }),
    },
  });

  // ================================================================================================ 洛紅纓 (FINAL: v2 #01 洛家槍・承, docs/design/v2/hongying.md §01)
  // The clan look made real, 7.3 heads: crown-high ponytail (as tall as a spear tassel) tied with a big red silk bow and a
  // red ribbon running down it, side-swept fringe with face-framing locks; sharp amber-brown eyes, fierce brows, a
  // confident half-smile. Clan-crimson Qing 箭袖袍 to the knee with darker roundel (團紋) figuring, white stand collar,
  // black hem band, side slits edged black with brass toggles; black leather 巴圖魯坎肩 with the 一字襟 brass-and-red button
  // row across the chest; wide black belt with a round brass boss; laced black leather bracers over horse-hoof cuffs;
  // moon-white fitted trousers; black soft riding boots with a crimson top band; a yellow sachet and a little cat charm
  // at the hip (she secretly loves cute things); the red-tassel 洛家槍 (on the back in the field, in hand in battle).
  const HY = { crimson: '#b0242c', leather: '#2a1d20', moon: '#e9e0d0', brass: '#c99a48', skin: '#f3d3bd', hair: '#21181f', red: '#c8323a' };
  function hongyingRobe(g, x, y, w, h) { // 團紋 roundels in a darker crimson over the robe body
    const R0 = min(w * 0.022, h * 0.03);
    g.strokeStyle = rgba(shade(HY.crimson, -0.32), 0.75); g.lineWidth = max(1, R0 * 0.18);
    for (let r = 0; r < 12; r++) for (let c = 0; c < 26; c++) {
      const cx = x + (c + (r % 2) * 0.5) / 26 * w, cy = y + h * (0.36 + r * 0.05);
      if (cy > y + h * 0.93) continue;
      g.beginPath(); g.arc(cx, cy, R0, 0, TAU); g.stroke(); g.beginPath(); g.arc(cx, cy, R0 * 0.45, 0, TAU); g.stroke();
    }
  }
  look('hongying', 'v2_01', {
    spec: {
      body: 'female', skin: HY.skin, eyes: '#b4581c',
      hair: { style: 'side', color: HY.hair, sheen: '#5a4a62', back: 'ponytail', len: 0.52, tie: HY.red, tiePh: 0.2, arch: 0.26, sweep: 0.22, stiff: 1.5, bow: 1.05, ribbon: true, ribbonLen: 0.5, locks: 0.7, vol: 1.1, bangW: 1.6, front: 1.12, temple: 0.1 },
      hat: null,
      top: { color: HY.crimson, len: 0.42, closure: 'side', inner: HY.moon, trim: HY.leather, collarColor: HY.moon, sleeve: 'long', cuff: '#1d1416', slits: 0.07, toggles: HY.brass,
        hemBand: { color: HY.leather, h: 0.035 }, hemArt: hongyingRobe },
      vest: { color: HY.leather, trim: '#3a2a2c', len: -0.2, open: false, closure: 'yizi', button: HY.brass, button2: HY.red, buttons: 9, rowAt: 0.17 },
      belt: { color: HY.leather, buckle: HY.brass, w: 0.05, round: 0.022 }, bracers: { color: HY.leather, from: 0.42 },
      bottom: { type: 'pants', color: HY.moon }, shoes: { type: 'boots', color: '#1e1618', sole: '#3a2a2a', from: 0.6, flare: 1.1, band: HY.crimson },
      sash: null, skirt: null, apron: null,
      hip: ['charm'], back: 'spear', weapon: 'spear', aura: '#ffd36a',
    },
    body3d: { sh: 0.158, chestW: 0.134, waistW: 0.104, armR: 0.037, foreR: 0.031 },
    face3d: { eyeStyle: 'sharp', ew: 0.275, eh: 0.74, tilt: 0.22, irisR: 0.6, iris: '#a8501c', irisLight: '#e89a50', lash: 0.75, browW: 1.55, browAng: -0.2, browArch: 0.2, browCol: '#1d161c',
      chin: 0.62, jaw: 0.9, jawTop: -0.28, mouth: 'smirk', restCurve: 0.18, lips: '#d46a72', lipTint: 0.4, blush: 0.25 },
    expr: 'determined',
    props3d: { spear: { tasselMat: 'tassel', grip: 0.46, len: 0.92 } },
    style: { rest: { chest: [-3, 0, 0], head: [-2, 0, 0], upperArmL: [0, 0, 3], upperArmR: [0, 0, -3] } },
    clips: {
      // the sheet pose: spear planted upright in the right hand, left fist on the hip, weight on the left leg
      sheet: () => ({ dur: 3, loop: true, k: [
        { t: 0, hp: [0.015, -0.005, 0], h: [0, 4, -2], sp: [0, -2, 1], ch: [-3, -4, 1], nk: [0, 2, 0], hd: [-2, 6, 3], fL: [0.02, 0, 0.01], fR: [-0.05, 0, 0.0], fRy: 12,
          hR: [-0.3, 0.88, 0.07], hRd: [0, 1, 0.02], hRm: 'on', hL: [0.21, 1.0, -0.03], hLr: [0, -90, 90], hLm: 'on' },
        { t: 1.5, ch: [-2, -4, 1], hp: [0.015, -0.01, 0] },
        { t: 3, ch: [-3, -4, 1], hp: [0.015, -0.005, 0] },
      ] }),
    },
  });

  // ================================================================================================ 雲歸 (FINAL: v2 #01 太虛青灰, docs/design/v2/yungui.md §01)
  // The canon answer, 7 heads, long straight lines + drooping wide sleeves, a lazy one-shoulder-low stance: long ink-black
  // hair half-up under a carved wooden crown with a cinnabar-tipped pin, long front locks over both shoulders; narrow,
  // half-lidded brown eyes and a lazy half-smile. Washed-out blue-grey 交領右衽 道袍 to the ankle with a deep-indigo
  // collar band under a wide white 護領 guard collar, flowing 廣袖 with indigo and white cuff bands; wide black belt with
  // the 太極 plaque and hanging black tails; talisman pouch at the right hip, amber rice-wine gourd on a red cord at the
  // left; cloud-toe shoes over white socks; the folding fan (in battle; resting on his shoulder in the sheet pose).
  const YG = { robe: '#7f93a6', indigo: '#3d4a63', white: '#efeadf', hair: '#25242e', skin: '#efd0b4', wood: '#9a6b3c', cinnabar: '#b8352a' };
  look('yungui', 'v2_01', {
    spec: {
      body: 'tall', skin: YG.skin, eyes: '#5a3a26',
      hair: { style: 'part', color: YG.hair, sheen: '#55557a', back: 'long', len: 0.44, knot: 'halfup', knotPh: 0.2, locks: 1.45, tie: '#5a3a24', vol: 1.05, front: 1.1, temple: 0.18 },
      hat: { type: 'crown', color: YG.wood, acc: YG.cinnabar },
      top: { color: YG.robe, len: 0.98, closure: 'cross', inner: YG.white, trim: YG.indigo, lapel: { w: 0.05, guard: YG.white, guardLen: 0.5 }, sleeve: 'flow', cuff: YG.indigo, cuff2: YG.white, cuffW: 0.12, emb: null },
      sash: { color: '#22212a', w: 3.6, emblem: 'taiji', tails: true, tailLen: 0.08 },
      belt: null, apron: null, vest: null,
      bottom: { type: 'pants', color: YG.white }, shoes: { type: 'cloth', color: '#24222c', sole: YG.white },
      hip: ['gourd', 'talisman'], held: null, weapon: 'fan', aura: '#9be36a',
    },
    body3d: { head: 0.252, headW: 0.172, headD: 0.19, sh: 0.176, chestW: 0.146, waistW: 0.124 },
    face3d: { eyeStyle: 'narrow', ew: 0.28, eh: 0.55, iris: '#5a3a26', irisLight: '#9a6a46', droop: 0.38, browAng: -0.05, browArch: 0.2, browW: 1.3, browCol: '#201e26',
      chin: 0.58, jaw: 0.88, jawTop: -0.25, mouth: 'smirk', restCurve: 0.25, blush: 0.12 },
    expr: 'smug',
    props3d: { fan: { mat: 'wood', rib: 'dark', len: 1.35, w: 1.9, tassel: false }, hip_gourd: { mat: 'gourd', cord: true } },
    style: { rest: { spine: [-3, 0, 2], chest: [-2, 3, 2], head: [3, -4, 6], upperArmL: [2, 0, 2] } },
    clips: {
      // the sheet pose: fan resting back on the right shoulder, the left arm hanging loose in its sleeve, one shoulder low
      sheet: () => ({ dur: 4, loop: true, k: [
        { t: 0, hp: [-0.012, -0.004, 0], h: [0, -3, 2], sp: [0, -2, 2], ch: [-1, -3, 3], nk: [0, 2, -2], hd: [2, 4, -5], fL: [0.03, 0, 0.0], fR: [-0.02, 0, 0.02], fLy: -4, fRy: 8,
          hR: [-0.27, 1.3, 0.05], hRd: [0.12, 1, -0.5], hRm: 'on' },
        { t: 2, ch: [0, -3, 3], hp: [-0.012, -0.01, 0], hR: [-0.27, 1.295, 0.05] },
        { t: 4, ch: [-1, -3, 3], hp: [-0.012, -0.004, 0], hR: [-0.27, 1.3, 0.05] },
      ] }),
    },
  });

  // ================================================================================================ 陳伯 · 陳渡  (FINAL, docs/design/v2/chenbo.md)
  // Day look (lantern shop): stocky 6.4-head 68-year-old, Qing shaved crown + grey queue with a red silk tie, heavy
  // drooping brows, 八字 moustache + chin tuft, ruddy bulbous nose, big ears; faded-indigo 對襟短衫 with knot buttons
  // over a white 汗衫, rolled 連袖 sleeves, navy sleeve guards with white tapes, stained canvas apron with a pocket, wide
  // ink-black trousers bloused over leg wraps, black cloth shoes with white soles, bamboo pipe at the left hip and the
  // bronze 「渡」 half-tally at the right. Gear look (battle/finale, same body): 斗笠 with the teal order sigil, three-tier
  // straw 簑衣, the soul-oar with glowing tide-line inlay and the paper soul-lantern hung from its grip.
  const CB = { indigo: '#4d6789', ecru: '#d9c6a0', ink: '#2f2b30', skin: '#c98f68', frost: '#cfc9c0', straw: '#b99b5f', teal: '#4fd8c8', red: '#b8342b', bronze: '#b5823d' };
  look('chenbo', 'day', {
    contextLooks: { battle: 'guide' },
    spec: {
      body: 'elder', skin: CB.skin, eyes: '#3a2a22',
      hair: { style: 'back', color: CB.frost, back: 'short', shaved: true, queue: true, tie: CB.red, knot: null },
      face: { beard: 'goatee', beardColor: CB.frost },
      top: { color: CB.indigo, len: 0.24, closure: 'center', inner: '#f0ece2', trim: '#34485f', sleeve: 'rolled', button: '#2a3550', mends: [{ th: Math.PI - 0.25, v: 0.3, w: 0.09, h: 0.08, color: '#5d7898' }] },
      bracers: { color: '#2a3550', tapes: '#f0ece2', cloth: true, from: 0.15 },
      apron: { color: CB.ecru, len: 0.6, pocket: true, stains: [{ x: 0.3, y: 0.55, r: 0.05, color: '#b8342b', a: 0.55 }, { x: 0.62, y: 0.72, r: 0.035, color: '#b8342b', a: 0.5 }, { x: 0.45, y: 0.4, r: 0.03, color: '#c8a038', a: 0.5 }, { x: 0.7, y: 0.3, r: 0.04, color: '#8a6a3a', a: 0.3 }] },
      bottom: { type: 'wide', color: CB.ink }, leggings: { color: '#cdc8c0', bands: CB.red },
      shoes: { type: 'cloth', color: CB.ink, sole: '#efe9dc' },
      held: null, hip: ['pipe', 'tally'], weapon: 'oar', sash: null, belt: { color: '#5a3a24' },
    },
    body3d: { H: 1.64, head: 0.252, headW: 0.196, headD: 0.205, neckLen: 0.035, neckR: 0.056, legTop: 0.8, sh: 0.19, chestW: 0.168, chestF: 0.11, waistW: 0.165, waistF: 0.13, hipW: 0.165, belly: 0.8, stoop: 0.75, armR: 0.05, foreR: 0.043, thighR: 0.085, calfR: 0.058, palm: 1.15 },
    face3d: { eyeStyle: 'dot', iris: '#2a1c16', ew: 0.2, eyeY: -0.06, browW: 2.7, browAng: -0.22, browArch: 0.0, browBushy: 1.5, browCol: '#ece8e0', browLow: 0.1, noseRed: '#e07868', nose: 1.5, ears: 1.35, chin: 0.62, jaw: 0.95, cheek: 0.05, mouth: 'frown', restCurve: -0.35, wrinkles: 1.2, blush: 0.25 },
    expr: 'grumpy',
    style: { rest: { upperArmL: [-2, 0, 4], upperArmR: [-2, 0, -4], foreArmL: [-8, 0, 0], foreArmR: [-8, 0, 0] } },
  });
  look('chenbo', 'guide', {
    extend: 'day',
    spec: {
      hat: { type: 'douli', color: CB.straw, sigil: CB.teal, strap: '#5a3a24' },
      hip: ['pipe', 'tallyGlow'],
      weapon: 'oar',
    },
    props3d: { oar: { len: 1.0, blade: 'darkwood', shaft: 'darkwood', collar: 'bronze', inlay: true, tgrip: 'darkwood', lantern: { mat: 'soul', cage: 'dark', r: 0.065, h: 0.15, light: '#4fd8c8', i: 1.0, range: 3.5, cord: 0.07 } } },
    expr: 'determined',
    parts: [(B) => tieredCape(B, { key: 'straw', open: true, paint: strawPaint(CB.straw), teeth: 26, toothLen: 0.06, tiers: [{ len: 0.62, inf: 0.07, flare: 0.42 }, { len: 0.42, inf: 0.085, flare: 0.4, drop: 0.0 }, { len: 0.22, inf: 0.1, flare: 0.38 }] })],
  });

  // ================================================================================================ 夜玄 「玄冥法師」 (FINAL, docs/design/v2/yexuan.md)
  // 184 cm, gaunt, 7.9 heads: floor-length black 大襟長袍 with white 立領 and gold piping/knots, wide sleeves with white
  // turned-back cuffs, gold lantern-and-wave hem band and back sigil, white sash with a gold clasp and long tasselled end,
  // black 雲肩 with a gold lobed edge, 千條簑 white-silk strip mantle with gold-dipped tips (short front, long back), 長明冠
  // lantern crown with a blue captive flame and black gauze ribbons; long narrow face, hollow cheeks, half-lidded
  // downturned gold eyes with sleepless shadows, sorrowful inner brows, thin moustache and pointed goatee, ink hair with
  // silver temples in a top knot with a tied tail; celadon soul-jar at the hip; 220 cm lantern staff with a gold cage.
  const YX = { black: '#1c1b22', white: '#eeeae0', gold: '#cda552', skin: '#e8d3c3', hair: '#18161c', silver: '#a19eab', blue: '#8fdcff' };
  function yexuanHem(g, x, y, w, h, d, U, V, Pn) { // gold lantern-and-wave hem band + back sigil (a lantern ringed by turning waves)
    const bh = h * 0.07, by = y + h - bh * 1.2;
    g.fillStyle = YX.gold; g.fillRect(x - 2, by, w + 4, bh);
    g.fillStyle = YX.black; for (let k = 0; k < 18; k++) { const cx = x + w * (k + 0.5) / 18; g.fillRect(cx - bh * 0.18, by + bh * 0.2, bh * 0.36, bh * 0.55); g.beginPath(); g.arc(cx, by + bh * 0.2, bh * 0.22, PI, 0); g.fill(); }
    g.strokeStyle = YX.black; g.lineWidth = max(1, bh * 0.08); g.beginPath(); for (let xx = x; xx < x + w; xx += 2) g.lineTo(xx, by + bh * 0.88 + sin((xx - x) / w * 60) * bh * 0.06); g.stroke();
    const cx = U(Math.PI - 0.001), cy = y + h * 0.42, r = min(h * 0.12, w * 0.05);
    g.strokeStyle = YX.gold; g.lineWidth = max(1.5, r * 0.08);
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.beginPath(); g.arc(cx + cos(a) * r * 0.78, cy + sin(a) * r * 0.78, r * 0.2, a, a + PI * 1.2); g.stroke(); }
    g.fillStyle = YX.gold; g.fillRect(cx - r * 0.2, cy - r * 0.35, r * 0.4, r * 0.6); g.fillRect(cx - r * 0.28, cy - r * 0.42, r * 0.56, r * 0.1); g.fillRect(cx - r * 0.28, cy + r * 0.25, r * 0.56, r * 0.1);
  }
  look('yexuan', 'final', {
    spec: {
      body: 'tall', skin: YX.skin, eyes: '#d8b050',
      hair: { style: 'center', part: 0, color: YX.hair, sheen: '#4a4a62', temples: YX.silver, back: 'short', knot: 'topknot', locks: 0.85, tie: YX.gold, bangLen: -0.25 },
      hat: null,
      face: { beard: 'goatee', beardColor: '#1a181e', beardThin: 0.55 },
      top: { color: YX.black, len: 1.04, closure: 'side', inner: YX.white, trim: YX.gold, sleeve: 'wide', cuff: YX.white, button: YX.gold, hemArt: yexuanHem },
      sash: { color: YX.white, w: 2.8, tails: true, tailLen: 0.25 },
      cape: null,
      shoes: { type: 'boots', color: YX.black, sole: '#f0ece2' }, held: 'lstaff', weapon: 'lstaff', hip: ['jar'],
    },
    body3d: { H: 1.84, head: 0.232, headW: 0.164, headD: 0.19, legTop: 0.96, chestW: 0.142, waistW: 0.118, hipW: 0.138, armR: 0.042, foreR: 0.035, neckLen: 0.058 },
    face3d: { eyeStyle: 'narrow', iris: '#c8a040', irisLight: '#f2d888', ew: 0.21, droop: 0.5, tilt: -0.08, bags: 1, browAng: 0.38, browArch: 0.1, browW: 1.15, browCol: '#1a181e', chin: 0.46, jaw: 0.82, jawTop: -0.18, cheek: -0.035, restCurve: 0.06, blush: 0, eyeShadow: '#a890b0' },
    expr: 'neutral',
    props3d: { lstaff: { len: 1.07, shaft: 'lacq', ring: 'gold', lantern: { mat: 'blue', cage: 'gold', r: 0.07, h: 0.18, light: YX.blue, i: 1.1, range: 3.6, cord: 0.05, tassel: true } } },
    style: { rest: { spine: [-1, 0, 0], chest: [-2, 0, 0], head: [2, 0, 0], upperArmL: [-6, -8, -3], upperArmR: [-6, 8, 3], foreArmL: [-28, 18, 0] } },
    parts: [
      (B) => cloudCollar(B, { color: YX.black, edge: YX.gold, len: 0.1 }),
      (B) => stripMantle(B, { color: YX.white, tip: YX.gold, n: 30, front: 0.22, back: 0.52 }),
      (B) => lanternCrown(B, {}),
      (B) => knotTail(B, { len: 0.42 }),
    ],
  });

  // ================================================================================================ 墨鴉 (FINAL, docs/design/v2/moya_sheet.png)
  // A Qing temple runner (走路仔) in a crow-feather mantle cut like a straw rain cape (three tiers, open front, chunky
  // tip hem) with a stand-up feather ruff: puffed top, skinny bound legs — a crow standing upright. Shaved crown +
  // queue tipped with a red cord and crow feathers; brown-black skullcap with a red knob and two crow feathers; side-
  // fastened ash-indigo jacket with vermilion piping and the runner's round 「明」 badge front & back; vermilion sash
  // with a tucked bundle of talismans and a black-lacquer 長明宮 token; linen leg wraps over black trousers; layered-sole
  // shoes; smug face with curled moustache; black-bamboo crook staff with a crow-head finial and a cold-blue 長明 lantern.
  const MY = { crow: '#1d1c27', sheen: '#55609a', indigo: '#5a627c', verm: '#c8372b', linen: '#ddd3bd', skin: '#ecc6a4' };
  look('moya', 'final', {
    spec: {
      skin: MY.skin, eyes: '#4a2a3a',
      hair: { style: 'back', color: '#16141c', back: 'short', shaved: true, queue: true, tie: MY.verm, knot: null, queueEnd: 0.95 },
      hat: { type: 'cap', color: '#3a2e2a', acc: MY.verm },
      face: { beard: 'goatee', beardColor: '#16141c', beardThin: 0.6, beardCurl: 1 },
      top: { color: MY.indigo, len: 0.36, closure: 'side', inner: '#e8e0d0', trim: MY.verm, sleeve: 'long', cuff: '#3e455a', button: '#c08a48' },
      patch: { text: '明', color: MY.verm },
      cape: null, belt: null,
      sash: { color: MY.verm, w: 3.4, tails: true },
      bottom: { type: 'wide', color: '#1a1820' }, leggings: { color: MY.linen, bands: '#a89c84' },
      shoes: { type: 'cloth', color: '#1a1820', sole: '#efe9dc' }, held: 'crook', weapon: 'crook', hip: ['tally'],
    },
    body3d: { sh: 0.17, chestW: 0.14, waistW: 0.118, thighR: 0.066, calfR: 0.044, headW: 0.172 },
    face3d: { eyeStyle: 'sharp', iris: '#3a2230', browAng: -0.1, browArch: 0.55, browW: 1.3, chin: 0.52, jaw: 0.86, jawTop: -0.2, mouth: 'smirk', restCurve: 0.42 },
    expr: 'smug',
    style: { rest: { chest: [-5, 0, 0], head: [-5, 0, 2], hips: [-2, 0, 0] } },
    parts: [
      (B) => tieredCape(B, { key: 'crow', open: true, paint: featherPaint(MY.crow, MY.sheen), teeth: 30, toothLen: 0.055, tiers: [{ len: 0.5, inf: 0.07, flare: 0.55 }, { len: 0.34, inf: 0.09, flare: 0.5 }, { len: 0.18, inf: 0.11, flare: 0.45 }] }),
      (B) => featherRuff(B, { n: 24, len: 0.1 }),
      (B) => { // crow feathers on the cap + at the queue tip
        const s = B.P.s, top = C.headPt(B, 0.3, 0.25, 0.03 * s);
        featherTuft(B, 'head', top, [[0.25, 1, -0.35], [0.45, 0.9, -0.25]], 0.17);
        const q = B.chains.find((c) => c.name === 'queue');
        if (q) featherTuft(B, q.bones[q.bones.length - 1], vadd(q.tail, [0, -0.06 * s, 0]), [[0.2, -1, -0.15], [-0.2, -1, -0.15], [0, -1, -0.3]], 0.11);
      },
      (B) => { // talisman bundle tucked in the sash + 長明宮 token on a red cord
        const P = B.P, s = P.s, R = C.torsoRings(P);
        const p = C.torsoPt(C.ringAt(R, P.waistY), -0.45, 0.05 * s);
        const K = C.propKit(B, 'spine', p);
        const tal = B.rect('talisman', 0.03, 0.06, (g, x, y, w, h) => { g.fillStyle = '#f2d060'; g.fillRect(x - 2, y - 2, w + 4, h + 4); g.strokeStyle = '#c8372b'; g.lineWidth = max(1, w * 0.1); g.beginPath(); g.moveTo(x + w * 0.5, y + h * 0.1); g.lineTo(x + w * 0.5, y + h * 0.9); g.moveTo(x + w * 0.2, y + h * 0.3); g.lineTo(x + w * 0.8, y + h * 0.3); g.stroke(); }, { px: [16, 32] });
        for (let k = 0; k < 4; k++) blob(B.G, 4, 4, tal, K.T([k * 0.012 - 0.018, 0.04 + k * 0.004, 0.01]), [1, 1, 1], K.W, { deform: (n) => [Math.sign(n[0]) * pow(abs(n[0]), 0.3) * 0.012 * s, Math.sign(n[1]) * pow(abs(n[1]), 0.3) * 0.045 * s, n[2] * 0.003 * s] });
      },
    ],
  });

  // ================================================================================================ 洛青鋒 / 「鬼面」
  // 紅纓's elder brother (洛家劍): dark wine robe over black, leather bracers and boots, low ponytail; as 「鬼面」 he adds a
  // lacquered demon mask and a ragged black cape. Sharp, guarded face.
  look('qingfeng', 'canon', {
    spec: { hair: { style: 'side', color: '#1b1820', sheen: '#4a4458', back: 'ponytail', len: 0.34, tie: '#7a1a20' }, top: { closure: 'side', button: '#b89a4a' }, bracers: { color: '#1e1a1e' }, hip: ['sword'] },
    face3d: { eyeStyle: 'sharp', iris: '#3a1e1e', browW: 1.5, chin: 0.56, jaw: 0.88, jawTop: -0.22, restCurve: -0.1 },
    props3d: { sword: { blade: 'steel', guard: 'gold', tassel: true } },
    expr: 'determined',
    style: { rest: { chest: [-2, 0, 0] } },
  });
  look('qingfeng_mask', 'canon', {
    spec: { hair: { style: 'side', color: '#1b1820', back: 'ponytail', len: 0.34, tie: '#4a1018' }, top: { closure: 'side' }, cape: { color: '#17151c', len: 0.75, ragged: true, collarColor: '#24212a' }, hip: ['sword'] },
    face3d: { eyeStyle: 'sharp', iris: '#3a1e1e', browW: 1.5, chin: 0.56, jaw: 0.88, jawTop: -0.22 },
    props3d: { sword: { blade: 'steel', guard: 'dark', tassel: false } },
  });

  // ================================================================================================ 清虛真人
  look('qingxu', 'canon', {
    spec: { hair: { style: 'back', color: '#efedf2', back: 'long', len: 0.3, knot: 'bunTop' }, hat: { type: 'crown', color: '#d6b25a', acc: '#f2e6c0', metal: true }, top: { emb: '#9ab0d0' } },
    face3d: { eyeStyle: 'line', browW: 1.6, browBushy: 0.8, browCol: '#f2f0f4', browAng: 0.2, chin: 0.5, wrinkles: 1.1, restCurve: 0.2, ears: 1.2 },
    props3d: { whisk: { handle: 'lacq' }, sword: { blade: 'steel', guard: 'gold', tassel: true } },
    expr: 'neutral',
    style: { rest: { chest: [-2, 0, 0] } },
  });

  // ================================================================================================ 藤婆 (fictional hermit herbalist — belongs to no real people)
  look('tengpo', 'canon', {
    spec: { hair: { style: 'back', color: '#efece4', back: 'long', len: 0.42, knot: 'bun', vines: true } },
    face3d: { eyeStyle: 'line', iris: '#4a5a32', wrinkles: 1.4, browBushy: 0.6, browCol: '#d8d4c8', chin: 0.5, mouth: 'smirk', restCurve: 0.4, nose: 1.3, ears: 1.2 },
    expr: 'smug',
  });

  // ================================================================================================ 夜念 (夜玄's daughter, a tired little ghost)
  look('nianer', 'canon', {
    spec: { hair: { style: 'straight', color: '#24222e', knot: 'twin', tie: '#d0d8e8' }, ghostTint: '#cfe4ff' },
    face3d: { eyeStyle: 'soft', iris: '#4a5a7a', droop: 0.35, browAng: 0.4, restCurve: -0.05, blush: 0.15, bags: 0.6 },
    expr: 'sad',
  });

  // ================================================================================================ 燈母 (vision of the Lantern Mother)
  look('lantern_mother', 'canon', {
    spec: { hair: { style: 'center', color: '#fff0d0', sheen: '#ffd890', back: 'long', len: 0.72, locks: 1.4 } },
    face3d: { eyeStyle: 'line', iris: '#d8a040', droop: 0.3, restCurve: 0.35, blush: 0.2, lips: '#e88a70' },
    expr: 'dreamy',
  });
})();
