// 彼岸燈 — character sprites: map walk sprites + battle sprites → G.Sprites
// (contract: docs/CONTRACTS.md "Character sprites").
//
// Everything is a PARAMETRIC procedural renderer: a spec (body type, skin, hair, outfit pieces,
// accessories, weapon) is turned into a small 2D rig (hips, knees, shoulders, elbows, head) for a view
// ('front' = walking down, 'back' = up, 'side' = facing LEFT; right = mirrored, 'q' = 3/4 battle view
// facing LEFT) and painted with Canvas 2D paths: soft top-left lit gradients, darkened-hue outlines.
// Every map frame (id+view+frame) and battle pose (id+pose) is rendered ONCE into a trimmed offscreen
// canvas (G.U.makeCanvas) and blitted; walk bob / breathing / ghost float are applied at blit time.
// Map frames 0 and 2 share one canvas; 'right' is the mirrored 'left' canvas.
//
// Frame sizes / anchors (logical px, anchor = FEET centre):
//   map adult ≈ 46–56 w × 88–94 h (child ≈ 70 h, giant procession figures size 1.45 ≈ 135 h,
//   buffalo ≈ 100 w), battle adult ≈ 150 h (weapons extend further, canvases are trimmed per pose).
//
// ── SPEC FORMAT for G.Sprites.define(id, spec) ────────────────────────────────────────────────────
// { base:'villager_m',            // optional: deep-merge on top of an existing id's spec
//   kind:'human'|'quad'|'bird',   // default human. quad: { species:'leopardcat'|'dog'|'cat'|'buffalo', col:{...} }
//                                 //                bird: { species:'chicken'|'crow' }
//   body:'adult'|'female'|'stout'|'elder'|'elderf'|'child'|'tall'|'tallf',  size: 1 (overall scale),
//   skin:'#hex', eyes:'#iris', eyeStyle:'round'|'soft'|'sharp'|'narrow'|'line'|'dot'|'fierce',
//   brows:'normal'|'grumpy'|'soft'|'fierce', mouth:'smile'|'flat'|'smirk'|'frown',
//   hair:{ style:'messy'|'side'|'center'|'part'|'straight'|'back'|'wild'|'tuft'|'bald',
//          color, sheen?, back:'short'|'long'|'lowtie'|'ponytail', len:0..1 (of head→feet),
//          knot:'topknot'|'bun'|'bunTop'|'twin'|'halfup', tie:'#ribbon', ribbon:bool (long ribbon ends),
//          locks:0..1.6 (face-framing strands, in head radii), vol:1, vines:bool, pins:[{type:'lantern'|'flower'|'gold', color}] },
//   hat:{ type:'douli'|'cap'|'scarf'|'band'|'wreath'|'tsou'|'crown'|'taoist'|'scholar'|'qing'|'guard'|
//              'ornate'|'bajia'|'giant'|'peaked'|'hood'|'veil'|'amis'|'tea', color, acc, fringe? },
//   face:{ beard:'goatee'|'long'|'full'|'mustache'|'whiskers', beardColor, paint:{base,mark,acc}|null,
//          tattoo:'truku_f'|'truku_m', mask:'ghost'|'facecloth', blush:bool, glasses:bool, horns:'#hex' },
//   top:{ color, len:0..1.05 (hem below hip in leg lengths; >0.35 = robe), closure:'cross'|'side'|'center'|
//         'open'|'round'|'none', inner, trim, sleeve:'long'|'wide'|'flow'|'rolled'|'short'|'none',
//         cuff:'#hex', bands:[{at,h,color,acc,motif:'diamond'|'zigzag'|'stripe'|'dots'|'cross'}],
//         stripes:{color,n}, emb:'#hex' (embroidery), flare, bare:bool (bare torso under vest) },
//   skirt:{ color, len, flare, bands:[...], trim, stripes },          // separate lower garment
//   bottom:{ type:'pants'|'wide'|'cropped'|'shorts'|'bare', color, cuff },
//   leggings:{ color, bands }, shoes:{ type:'cloth'|'sandal'|'boots'|'bare', color },
//   vest:{ color, trim, len, bands, stripes, open }, sash:{ color, w, tails, emblem:'taiji' }, belt:{ color },
//   apron:{ color, len }, cape:{ color, len, feathers, collar }, chest:{ color, trim }, bag:{ color, strap },
//   beads:{ colors:[], rows }, patch:{ text, color }, towel:{ color }, armor:{ color, trim },
//   bracers:{ color }, bracelet:{ color }, kasaya:{ color },
//   held:'cane'|'staff'|'lstaff'|'oar'|'spear'|'glaive'|'halberd'|'flag'|'pestle'|'lantern'|'oillamp'|'pipe'|
//        'fan'|'ffan'|'book'|'whisk'|'incense'|'axe'|'pick'|'rod'|'basket'|'yueqin'|'bow'|'plaque'|'abacus'|
//        'tray'|'broom'|'hoe'|'medbox'|'grass'|'fiber'|'saber'|'sword'|'flute'|'paddle'|'beads',
//   hip:[ 'gourd'|'flute'|'pouch'|'knife'|'fan'|'jade'|'sword'|'creel'|'lamp' ],
//   back:'sword'|'spear'|'basket'|'bundle'|'quiver'|'herbs'|'umbrella',
//   armPose:'brow'|'ear' (giant figures), weapon:'sword'|'spear'|'fan'|'flute'|'oar'|'lstaff'|'glaive'|'ffan'|'whisk'
//   (battle weapon style), aura:'#hex' (cast glow), ghost:bool, ghostTint:'#hex', glow:'#hex', halo:'#hex' }
// drawBattle also draws a soft ground shadow unless o.shadow === false; o.scale is supported by both draw calls.
// G.Sprites.frameInfo(id, 'map'|'battle', dirOrPose) -> {w,h,ax,ay}; G.Sprites.preload(ids, battle?); G.Sprites.clearCache().
// ────────────────────────────────────────────────────────────────────────────────────────────────────
'use strict';
(() => {
  const U = G.U;
  const PI = Math.PI, TAU = PI * 2, D = PI / 180;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max;
  const hypot = Math.hypot, atan2 = Math.atan2;
  const shade = U.shade, mix = U.mix, rgba = U.rgba, lerp = U.lerp, clamp = U.clamp;

  // =================================================================================== paint helpers
  const olC = {};
  function lum(col) { const [r, g, b] = U.hex2rgb(col); return (0.3 * r + 0.59 * g + 0.11 * b) / 255; }
  function ol(col) { // coloured outline: darkened hue, never pure black
    let v = olC[col];
    if (v) return v;
    const l = lum(col);
    v = l < 0.16 ? mix(shade(col, -0.35), '#1a1626', 0.35) : shade(col, l > 0.78 ? -0.45 : -0.52);
    return (olC[col] = v);
  }
  function grad(c, col, x0, y0, x1, y1, hi, lo) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, shade(col, hi));
    g.addColorStop(0.5, col);
    g.addColorStop(1, shade(col, lo));
    return g;
  }
  function paint(c, col, x0, y0, x1, y1, lw, hi = 0.16, lo = -0.2) {
    c.fillStyle = grad(c, col, x0, y0, x1, y1, hi, lo);
    c.fill();
    if (lw) { c.lineWidth = lw; c.strokeStyle = ol(col); c.lineJoin = 'round'; c.stroke(); }
  }
  function fill(c, col) { c.fillStyle = col; c.fill(); }
  function stroke(c, col, w) { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); }
  function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, max(0.05, rx), max(0.05, ry), rot, 0, TAU); }
  function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, max(0.05, r), 0, TAU); }
  function ball(c, x, y, r, col, lw, hi, lo) { circ(c, x, y, r); paint(c, col, x - r, y - r, x + r, y + r, lw, hi, lo); }
  function seg(c, x0, y0, x1, y1, col, w) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); stroke(c, col, w); }
  function band(c, pts, col, w, lw) { // a bordered strip along a polyline (trims, straps)
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (lw) { c.strokeStyle = ol(col); c.lineWidth = w + lw * 1.2; c.stroke(); }
    c.strokeStyle = col; c.lineWidth = w; c.stroke();
  }
  const lp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  function smoothTo(c, P, from = 1) { // continue the current sub-path smoothly through points P[from..]
    const n = P.length;
    if (n - from < 2) { for (let i = from; i < n; i++) c.lineTo(P[i][0], P[i][1]); return; }
    for (let i = from; i < n - 1; i++) c.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2);
    c.lineTo(P[n - 1][0], P[n - 1][1]);
  }
  // outline polygon around a polyline with per-point half widths and rounded caps
  function tubePath(c, pts, ws, capS = true, capE = true) {
    const n = pts.length, Lp = [], Rp = [], th = [];
    for (let i = 0; i < n; i++) {
      const a = pts[max(0, i - 1)], b = pts[min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const d = hypot(dx, dy) || 1; dx /= d; dy /= d;
      th.push(atan2(dy, dx));
      const w = ws[i], p = pts[i];
      Lp.push([p[0] - dy * w, p[1] + dx * w]);
      Rp.push([p[0] + dy * w, p[1] - dx * w]);
    }
    c.moveTo(Lp[0][0], Lp[0][1]);
    smoothTo(c, Lp);
    const e = pts[n - 1];
    if (capE) c.arc(e[0], e[1], max(0.05, ws[n - 1]), th[n - 1] + PI / 2, th[n - 1] - PI / 2, true);
    else c.lineTo(Rp[n - 1][0], Rp[n - 1][1]);
    const rr = Rp.slice().reverse();
    smoothTo(c, rr);
    const s = pts[0];
    if (capS) c.arc(s[0], s[1], max(0.05, ws[0]), th[0] - PI / 2, th[0] - 1.5 * PI, true);
    c.closePath();
  }
  function tube(c, pts, ws, col, lw, capS, capE, hi = 0.2, lo = -0.24) {
    c.beginPath();
    tubePath(c, pts, ws, capS !== false, capE !== false);
    const a = pts[0], b = pts[pts.length - 1];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const d = hypot(dx, dy) || 1; dx /= d; dy /= d;
    let nx = -dy, ny = dx;
    if (nx + ny > 0) { nx = -nx; ny = -ny; }
    const w = max(...ws), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    paint(c, col, mx + nx * w, my + ny * w, mx - nx * w, my - ny * w, lw, hi, lo);
  }
  function clipDo(c, fn) { c.save(); c.clip(); fn(); c.restore(); }
  // decorative woven/embroidered motif strip (x0..x1, centred at y, height h)
  function motif(c, x0, x1, y, h, acc, type, k) {
    c.save();
    c.fillStyle = acc; c.strokeStyle = acc; c.lineWidth = max(0.6, h * 0.16);
    const step = max(2.2 * k, h * 1.1);
    if (type === 'diamond') {
      for (let x = x0; x < x1 + step; x += step) {
        c.beginPath(); c.moveTo(x, y - h * 0.36); c.lineTo(x + step * 0.3, y); c.lineTo(x, y + h * 0.36); c.lineTo(x - step * 0.3, y); c.closePath(); c.fill();
      }
    } else if (type === 'zigzag') {
      c.beginPath(); c.moveTo(x0, y);
      let up = true;
      for (let x = x0; x < x1 + step; x += step / 2) { c.lineTo(x, y + (up ? -h * 0.3 : h * 0.3)); up = !up; }
      c.stroke();
    } else if (type === 'dots') {
      for (let x = x0; x < x1 + step; x += step * 0.7) { c.beginPath(); c.arc(x, y, h * 0.2, 0, TAU); c.fill(); }
    } else if (type === 'cross') {
      for (let x = x0; x < x1 + step; x += step) {
        c.fillRect(x - h * 0.08, y - h * 0.32, h * 0.16, h * 0.64);
        c.fillRect(x - h * 0.32, y - h * 0.08, h * 0.64, h * 0.16);
      }
    } else { // stripe
      c.fillRect(x0, y - h * 0.12, x1 - x0, h * 0.24);
    }
    c.restore();
  }
  function bandsIn(c, list, x0, x1, y0, y1, k) {
    for (const b of list) {
      const yy = y0 + (y1 - y0) * b.at, h = max(1.2 * k, (y1 - y0) * (b.h || 0.12));
      c.fillStyle = b.color; c.fillRect(x0, yy - h / 2, x1 - x0, h);
      c.fillStyle = rgba('#000000', 0.12); c.fillRect(x0, yy + h / 2 - max(0.5, h * 0.12), x1 - x0, max(0.5, h * 0.12));
      if (b.acc) motif(c, x0, x1, yy, h, b.acc, b.motif || 'diamond', k);
    }
  }

  // =================================================================================== proportions
  const BODY = {};
  BODY.adult = { hr: 18.5, hry: 17.5, neck: 3.4, torso: 25, leg: 23, sw: 10.6, ww: 8.8, hw: 9.8, legW: 3.8, armU: 10.4, armF: 10, armW: 3.1, hand: 3.1, hipSep: 4.7, foot: 6.6, stoop: 0 };
  BODY.female = Object.assign({}, BODY.adult, { torso: 24, leg: 23.5, sw: 9.2, ww: 7.1, hw: 9.2, legW: 3.3, armU: 10, armF: 9.4, armW: 2.7, hand: 2.85, hipSep: 4.1, foot: 6 });
  BODY.stout = Object.assign({}, BODY.adult, { sw: 12.6, ww: 12.8, hw: 12.6, legW: 4.4, armW: 3.6, hipSep: 5.5, hand: 3.5 });
  BODY.elder = Object.assign({}, BODY.adult, { torso: 23.5, leg: 21, sw: 10, ww: 9.3, hw: 9.7, stoop: 0.16, hr: 18, hry: 17 });
  BODY.elderf = Object.assign({}, BODY.female, { torso: 22.5, leg: 20.5, ww: 8.2, hw: 9.6, stoop: 0.2, hr: 18, hry: 17 });
  BODY.child = { hr: 16.4, hry: 15.6, neck: 2.4, torso: 17, leg: 14.5, sw: 7.6, ww: 6.9, hw: 7.5, legW: 3, armU: 7.2, armF: 6.8, armW: 2.5, hand: 2.6, hipSep: 3.4, foot: 5.2, stoop: 0 };
  BODY.tall = Object.assign({}, BODY.adult, { torso: 27, leg: 26, sw: 11, armU: 11.6, armF: 11 });
  BODY.tallf = Object.assign({}, BODY.female, { torso: 26, leg: 26.5, armU: 11, armF: 10.4 });
  // battle sprites: less chibi (≈3.3 heads), ~150 px
  const BAT = { hr: 1.27, hry: 1.27, neck: 1.5, torso: 1.62, leg: 2.35, sw: 1.42, ww: 1.42, hw: 1.42, legW: 1.45, armU: 2.05, armF: 2.05, armW: 1.42, hand: 1.36, hipSep: 1.55, foot: 1.55, stoop: 1 };
  function props(S, bat) {
    const b = BODY[S.body] || BODY.adult, P = {};
    for (const k in b) P[k] = bat ? b[k] * (BAT[k] || 1) : b[k];
    return P;
  }

  // =================================================================================== rig
  function ik(s, t, a, b, bend) {
    let dx = t[0] - s[0], dy = t[1] - s[1];
    let d = hypot(dx, dy);
    const dm = (a + b) * 0.995;
    if (d > dm) { dx *= dm / d; dy *= dm / d; d = dm; }
    if (d < abs(a - b) + 0.5) { const f = (abs(a - b) + 0.5) / (d || 1); dx *= f; dy *= f; d = abs(a - b) + 0.5; }
    const ph = atan2(dy, dx);
    const al = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1)) * (bend || -1);
    return [[s[0] + cos(ph + al) * a, s[1] + sin(ph + al) * a], [s[0] + dx, s[1] + dy]];
  }
  function rig(S, bat, view, pose) {
    const P = props(S, bat);
    const R = { S, P, bat, view, pose, lw: bat ? 1.9 : 1.4, k: P.hr / 18.5 };
    R.B = view === 'back';
    R.LT = view === 'side' || view === 'q' ? 1 : 0;
    R.T = view === 'side' ? 0.84 : view === 'q' ? 0.46 : 0;
    R.WF = view === 'side' ? 0.74 : view === 'q' ? 0.86 : 1;
    const DZ = (1 - R.LT) * 0.42 * (R.B ? -1 : 1);
    const proj = (a, L) => [-sin(a) * L * R.LT, cos(a) * L + sin(a) * L * DZ];
    R.proj = proj;
    const legs = pose.legs || [[0, 0], [0, 0]];
    R.legs = [];
    let drop = 0;
    for (let i = 0; i < 2; i++) {
      const [a, kn] = legs[i];
      const hx = R.LT ? (i ? -0.9 : 1.6) * R.k : (i ? 1 : -1) * P.hipSep;
      const kv = proj(a, P.leg / 2), av = proj(a - kn, P.leg / 2);
      R.legs.push({ hx, kv, av, a, kn });
      drop = max(drop, kv[1] + av[1]);
    }
    R.hipY = (R.LT ? -drop - 1 : -P.leg - 1) - (pose.hop || 0);
    for (const L of R.legs) {
      L.hip = [L.hx, R.hipY];
      L.knee = [L.hx + L.kv[0], R.hipY + L.kv[1]];
      L.ankle = [L.knee[0] + L.av[0], L.knee[1] + L.av[1]];
    }
    R.lean = (pose.lean || 0) + (pose.noStoop ? 0 : P.stoop);
    const hunch = R.LT ? 0 : R.lean;
    R.shY = R.hipY - P.torso + hunch * 4 * R.k;
    R.head = { x: -R.T * 1.4 * R.k, y: R.shY - P.neck - P.hry + hunch * 6 * R.k, rx: P.hr, ry: P.hry };
    // arms
    const arms = pose.arms || [{}, {}];
    R.arms = [];
    const armL = P.armU + P.armF;
    const mk = (i) => {
      const A = arms[i] || {};
      const sg = i ? 1 : -1;
      const sx = R.LT ? (i ? -0.6 : 2.6) * R.k : sg * (P.sw * R.WF - P.armW * 0.75);
      const s = [sx, R.shY + P.armW * 1.05];
      let e, w;
      if (A.to) {
        [e, w] = ik(s, [s[0] + A.to[0] * armL, s[1] + A.to[1] * armL], P.armU, P.armF, A.bend || -1);
      } else if (A.at) { // absolute target (used for two-handed grips)
        [e, w] = ik(s, A.at, P.armU, P.armF, A.bend || -1);
      } else {
        const a = A.a || 0, out = A.out != null ? A.out : (R.LT ? 0 : 0.1);
        const u = proj(a, P.armU);
        u[0] += sg * sin(out) * P.armU * (1 - R.LT);
        e = [s[0] + u[0], s[1] + u[1]];
        const f = proj(a + (A.e || 0), P.armF);
        f[0] += sg * sin(out + (A.eo || 0)) * P.armF * (1 - R.LT);
        w = [e[0] + f[0], e[1] + f[1]];
      }
      return { s, e, w, i };
    };
    R.arms[0] = mk(0);
    R.arms[1] = mk(1);
    // two-handed weapon grip: far hand placed on the weapon line held by the near hand
    const W = pose.w;
    if (W && W.two != null && W.type && PROPS[W.type]) {
      const L = propLen(R, W.type, W);
      const h = R.arms[1].w, a = W.ang * D;
      const tgt = [h[0] + cos(a) * L * W.two, h[1] + sin(a) * L * W.two];
      R.arms[0] = Object.assign(mk(0), {});
      const s = R.arms[0].s;
      const [e, w] = ik(s, tgt, P.armU, P.armF, W.bend2 || -1);
      R.arms[0].e = e; R.arms[0].w = w;
    }
    return R;
  }
  function legXAt(L, y) {
    const p = [L.hip, L.knee, L.ankle];
    if (y <= p[0][1]) return p[0][0];
    for (let i = 0; i < 2; i++) {
      const a = p[i], b = p[i + 1];
      if (y <= b[1] || i === 1) {
        const t = abs(b[1] - a[1]) < 0.01 ? 1 : clamp((y - a[1]) / (b[1] - a[1]), 0, 1);
        return a[0] + (b[0] - a[0]) * t;
      }
    }
    return p[2][0];
  }

  // =================================================================================== legs & feet
  function drawLeg(c, R, i, dim) {
    const S = R.S, P = R.P, L = R.legs[i], lw = R.lw, k = R.k;
    const d = (col) => (dim ? shade(col, -0.13) : col);
    const bt = S.bottom, type = bt.type || 'pants', w = P.legW;
    const pts = [L.hip, L.knee, L.ankle];
    if (type !== 'pants' && type !== 'wide') tube(c, pts, [w * 0.84, w * 0.74, w * 0.64], d(S.skin), lw);
    if (S.leggings) {
      const lg = S.leggings;
      tube(c, [lp(L.knee, L.ankle, 0.05), lp(L.knee, L.ankle, 0.92)], [w * 0.86, w * 0.76], d(lg.color), lw);
      if (lg.bands) {
        const m = lp(L.knee, L.ankle, 0.3);
        seg(c, m[0] - w * 0.8, m[1], m[0] + w * 0.8, m[1], d(lg.bands), 1.2 * k);
      }
    }
    const col = d(bt.color || '#3a3540');
    if (type === 'pants') tube(c, pts, [w, w * 0.92, w * 0.84], col, lw);
    else if (type === 'wide') tube(c, pts, [w * 1.06, w * 1.12, w * 1.2], col, lw);
    else if (type === 'cropped') tube(c, [L.hip, L.knee, lp(L.knee, L.ankle, 0.5)], [w * 1.06, w * 1.12, w * 1.14], col, lw);
    else if (type === 'shorts') tube(c, [L.hip, lp(L.hip, L.knee, 0.9)], [w * 1.08, w * 1.14], col, lw);
    if (bt.cuff && (type === 'pants' || type === 'wide')) {
      const m = lp(L.knee, L.ankle, 0.82);
      seg(c, m[0] - w, m[1], m[0] + w, m[1], d(bt.cuff), 1.6 * k);
    }
    if (type === 'cropped') { // rolled cuff
      const m = lp(L.knee, L.ankle, 0.48);
      ell(c, m[0], m[1], w * 1.12, w * 0.42); paint(c, shade(col, 0.1), m[0] - w, m[1] - 1, m[0] + w, m[1] + 1, lw * 0.8);
    }
    drawFoot(c, R, L, dim);
  }
  function drawFoot(c, R, L, dim) {
    const S = R.S, P = R.P, lw = R.lw, k = R.k, sh = S.shoes;
    const type = sh.type || 'cloth';
    const d = (col) => (dim ? shade(col, -0.13) : col);
    const col = d(sh.color || '#2b2730');
    const [x, y] = L.ankle;
    const fh = P.legW * 0.78;
    let fx = x, fy = y - fh * 0.62, rx = P.legW * 1.0, ry = fh;
    if (R.LT) { fx = x - P.foot * 0.28; rx = P.foot * 0.6; ry = fh * 0.86; }
    if (type === 'boots') tube(c, [lp(L.knee, L.ankle, 0.12), [x, y - fh * 0.8]], [P.legW * 1.04, P.legW * 0.98], col, lw);
    const bare = type === 'bare' || type === 'sandal';
    if (type === 'sandal') { // straw sole peeking out
      ell(c, fx, fy + ry * 0.45, rx * 1.08, ry * 0.62); paint(c, d(sh.color || '#c9a76c'), fx - rx, fy, fx + rx, fy + ry, lw * 0.8);
    }
    ell(c, fx, fy, rx, ry);
    paint(c, bare ? d(S.skin) : col, fx - rx, fy - ry, fx + rx, fy + ry, lw);
    if (type === 'sandal') seg(c, fx - rx * 0.8, fy - ry * 0.1, fx + rx * 0.8, fy - ry * 0.1, d('#9a7444'), 1.1 * k);
    if (type === 'cloth' || type === 'boots') {
      c.beginPath(); c.ellipse(fx, fy, rx, ry, 0, PI * 0.15, PI * 0.85);
      stroke(c, rgba('#ffffff', type === 'cloth' ? 0.5 : 0.18), 0.9 * k);
    }
  }

  // =================================================================================== lower garment
  function drawSkirt(c, R, sk, front) {
    const P = R.P, lw = R.lw, k = R.k;
    const y0 = R.hipY - (sk.top != null ? sk.top : 5) * k;
    const y1 = R.hipY + sk.len * P.leg;
    const fl = sk.flare != null ? sk.flare : 0.4;
    const wl = (P.hw + 0.4) * R.WF;
    let xl = -(P.hw + fl * sk.len * P.leg * 0.42) * R.WF, xr = -xl;
    if (R.LT) {
      for (const L of R.legs) {
        const lx = legXAt(L, y1);
        xl = min(xl, lx - P.legW * 1.3); xr = max(xr, lx + P.legW * 1.3);
      }
    }
    const cv = (R.B ? -1 : 1.8) * k;
    const path = () => {
      c.beginPath();
      c.moveTo(-wl, y0);
      c.quadraticCurveTo(lerp(-wl, xl, 0.4) - 0.8 * k, lerp(y0, y1, 0.55), xl, y1);
      c.quadraticCurveTo((xl + xr) / 2, y1 + cv * 1.5, xr, y1);
      c.quadraticCurveTo(lerp(wl, xr, 0.4) + 0.8 * k, lerp(y0, y1, 0.55), wl, y0);
      c.closePath();
    };
    path();
    paint(c, sk.color, xl, y0, xr, y0 + (y1 - y0) * 0.4, lw, 0.14, -0.22);
    clipDo(c, () => {
      // soft folds + shading toward the back side
      c.fillStyle = rgba('#000000', 0.1);
      c.beginPath(); c.ellipse(xr, (y0 + y1) / 2, (xr - xl) * 0.32, (y1 - y0) * 0.8, 0, 0, TAU); c.fill();
      if (sk.len > 0.3) {
        for (const f of [-0.42, 0.06, 0.48]) {
          c.beginPath(); c.moveTo(f * wl, y0 + 3 * k);
          c.quadraticCurveTo(f * (xr - xl) * 0.45 + (xl + xr) / 2 * 0.5, (y0 + y1) / 2, f * (xr - xl) * 0.5 + (xl + xr) / 2, y1 - 1);
          stroke(c, rgba(shade(sk.color, -0.4), 0.28), 0.9 * k);
        }
      }
      if (sk.stripes) {
        const n = sk.stripes.n || 5;
        for (let j = 0; j <= n; j++) {
          const yy = lerp(y0, y1, j / n);
          c.fillStyle = sk.stripes.color; c.fillRect(xl - 2, yy - 0.7 * k, xr - xl + 4, 1.4 * k);
        }
      }
      if (sk.bands) bandsIn(c, sk.bands, xl - 3, xr + 3, y0, y1 + 1.5 * k, k);
      if (sk.trim) {
        c.beginPath(); c.moveTo(xl - 2, y1 - 1.6 * k); c.quadraticCurveTo((xl + xr) / 2, y1 + cv * 1.5 - 1.6 * k, xr + 2, y1 - 1.6 * k);
        stroke(c, sk.trim, 2.4 * k);
      }
      if (front && !R.B && sk.overlap) { // robe overlap edge (交領 right-over-left)
        const ox = -R.T * P.hw * 0.5 + P.hw * 0.5 * R.WF;
        c.beginPath(); c.moveTo(ox, y0); c.quadraticCurveTo(ox + 1.5 * k, (y0 + y1) / 2, ox + 2.5 * k, y1 + 2);
        stroke(c, sk.trim || ol(sk.color), (sk.trim ? 2 : 1) * k);
      }
    });
    path(); c.lineWidth = lw; c.strokeStyle = ol(sk.color); c.stroke();
  }

  // =================================================================================== torso
  function bodicePath(c, R, sw, ww, hw, y0, yb, nw) {
    const k = R.k;
    const ya = y0 + (R.bat ? 13 : 9.5) * k;
    c.beginPath();
    c.moveTo(-nw, y0 - 0.8 * k);
    c.quadraticCurveTo(-sw * 0.8, y0 - 0.6 * k, -sw, y0 + 3.2 * k);
    c.quadraticCurveTo(-sw - 0.9 * k, y0 + 6.4 * k, -sw + 0.5 * k, ya);
    c.quadraticCurveTo(-ww - 0.3 * k, (ya + yb) / 2 + 1.5 * k, -hw, yb - 0.4 * k);
    c.quadraticCurveTo(0, yb + (R.B ? -0.6 : 1.9) * k, hw, yb - 0.4 * k);
    c.quadraticCurveTo(ww + 0.3 * k, (ya + yb) / 2 + 1.5 * k, sw - 0.5 * k, ya);
    c.quadraticCurveTo(sw + 0.9 * k, y0 + 6.4 * k, sw, y0 + 3.2 * k);
    c.quadraticCurveTo(sw * 0.8, y0 - 0.6 * k, nw, y0 - 0.8 * k);
    c.quadraticCurveTo(0, y0 + 1.5 * k, -nw, y0 - 0.8 * k);
    c.closePath();
  }
  function torsoDims(R, len) {
    const P = R.P;
    return {
      sw: P.sw * R.WF, ww: P.ww * R.WF, hw: P.hw * R.WF, nw: P.hr * 0.3,
      y0: R.shY, yb: len > 0.35 ? R.hipY + 2 * R.k : R.hipY + len * P.leg,
    };
  }
  function drawTorso(c, R) {
    const S = R.S, top = S.top, k = R.k, lw = R.lw;
    const { sw, ww, hw, nw, y0, yb } = torsoDims(R, top.len || 0);
    if (top.bare) { bodicePath(c, R, sw, ww, hw, y0, R.hipY + 1, nw); paint(c, S.skin, -sw, y0, sw, yb, lw); }
    if (top.closure !== 'skin') {
      bodicePath(c, R, sw, ww, hw, y0, yb, nw);
      if (!top.bare) {
        paint(c, top.color, -sw, y0, sw, y0 + (yb - y0) * 0.7, lw, 0.18, -0.2);
        clipDo(c, () => torsoDetails(c, R, top, sw, ww, hw, y0, yb, nw));
        bodicePath(c, R, sw, ww, hw, y0, yb, nw); c.lineWidth = lw; c.strokeStyle = ol(top.color); c.stroke();
      }
    }
    if (!top.bare) collar(c, R, top, sw, nw, y0, yb);
  }
  function torsoDetails(c, R, top, sw, ww, hw, y0, yb, nw) {
    const k = R.k;
    // soft shading: shadow on the back side, under-arm, lower body; highlight rim at front shoulder
    c.fillStyle = rgba('#000000', 0.12);
    c.beginPath(); c.ellipse(sw * 1.05, (y0 + yb) / 2 + 2 * k, sw * 0.55, (yb - y0) * 0.75, 0, 0, TAU); c.fill();
    c.fillStyle = rgba('#ffffff', 0.1);
    c.beginPath(); c.ellipse(-sw * 0.6, y0 + 2 * k, sw * 0.5, 3 * k, -0.3, 0, TAU); c.fill();
    if (top.stripes) {
      const n = top.stripes.n || 4;
      for (let j = 0; j < n * 2 + 1; j++) {
        const x = -sw + (2 * sw) * (j / (n * 2));
        c.fillStyle = top.stripes.color; c.fillRect(x - 0.8 * k, y0 - 2, 1.6 * k, yb - y0 + 4);
      }
    }
    if (top.bands) bandsIn(c, top.bands, -sw - 3, sw + 3, y0, yb, k);
    if (top.emb) { // sea-foam / cloud embroidery near hem
      c.strokeStyle = top.emb; c.lineWidth = 0.9 * k;
      for (let j = -2; j <= 2; j++) {
        const x = j * sw * 0.42, y = yb - 3.2 * k - abs(j) * 0.5 * k;
        c.beginPath(); c.arc(x, y, 1.7 * k, PI, TAU * 0.98); c.stroke();
        c.beginPath(); c.arc(x + 1.7 * k, y, 0.9 * k, PI, TAU); c.stroke();
      }
    }
    if (R.B) {
      seg(c, 0, y0 + 2 * k, 0, yb, rgba(shade(top.color, -0.45), 0.25), 0.8 * k);
      return;
    }
    const T = R.T, cx = -T * sw * 0.55;
    const trim = top.trim || shade(top.color, -0.28), tw = (R.bat ? 2.4 : 1.9) * k;
    const inner = top.inner;
    const cl = top.closure || 'cross';
    if (cl === 'cross') {
      if (inner) { c.beginPath(); c.moveTo(cx - nw * 0.95, y0 - 1 * k); c.lineTo(cx + nw * 0.95, y0 - 1 * k); c.lineTo(cx + nw * 0.15, y0 + 9 * k); c.closePath(); fill(c, inner); }
      band(c, [[cx + nw * 0.95, y0 - 0.8 * k], [cx + nw * 0.12, y0 + 9 * k]], trim, tw, R.lw * 0.6);
      band(c, [[cx - nw * 0.95, y0 - 0.8 * k], [cx + nw * 0.25, y0 + 9.6 * k], [cx + sw * 0.62, yb + 2]], trim, tw, R.lw * 0.6);
    } else if (cl === 'side') {
      band(c, [[cx + nw * 0.1, y0 + 1.2 * k], [cx + sw * 0.5, y0 + 2.6 * k], [cx + sw * 0.74, y0 + 8 * k], [cx + sw * 0.76, yb + 2]], trim, tw * 0.85, R.lw * 0.5);
      for (const t of [0.25, 0.55]) {
        const y = lerp(y0 + 2.4 * k, y0 + 9 * k, t), x = cx + sw * lerp(0.42, 0.72, t);
        ell(c, x, y, 1.1 * k, 0.6 * k); fill(c, shade(trim, -0.2));
      }
    } else if (cl === 'center') {
      seg(c, cx, y0 + 0.5 * k, cx, yb + 1, trim, tw * 0.55);
      const n = R.bat ? 4 : 3;
      for (let j = 0; j < n; j++) {
        const y = lerp(y0 + 3 * k, yb - 3 * k, j / max(1, n - 1));
        seg(c, cx - 1.6 * k, y, cx + 1.6 * k, y, top.button || shade(trim, -0.15), 1 * k);
      }
    } else if (cl === 'open') {
      if (inner) {
        c.beginPath(); c.moveTo(cx - nw * 0.85, y0 - 1); c.lineTo(cx + nw * 0.85, y0 - 1); c.lineTo(cx + 2.6 * k, yb + 2); c.lineTo(cx - 2.6 * k, yb + 2); c.closePath();
        fill(c, inner);
      }
      band(c, [[cx - nw * 0.9, y0 - 0.8 * k], [cx - 2.6 * k, yb + 2]], trim, tw, R.lw * 0.6);
      band(c, [[cx + nw * 0.9, y0 - 0.8 * k], [cx + 2.6 * k, yb + 2]], trim, tw, R.lw * 0.6);
    } else if (cl === 'vneck') {
      if (inner) { c.beginPath(); c.moveTo(cx - nw, y0 - 1); c.lineTo(cx + nw, y0 - 1); c.lineTo(cx, y0 + 7 * k); c.closePath(); fill(c, inner); }
      band(c, [[cx - nw, y0 - 0.8 * k], [cx, y0 + 7 * k], [cx + nw, y0 - 0.8 * k]], trim, tw * 0.8, R.lw * 0.5);
    }
  }
  function collar(c, R, top, sw, nw, y0) {
    const k = R.k, cl = top.closure || 'cross';
    if (cl === 'side' || cl === 'center' || cl === 'round' || R.B) {
      const trim = top.trim || shade(top.color, -0.28);
      c.beginPath(); c.moveTo(-nw * 1.02, y0 - 0.9 * k); c.quadraticCurveTo(0, y0 + (R.B ? -0.4 : 2.4) * k, nw * 1.02, y0 - 0.9 * k);
      c.strokeStyle = ol(trim); c.lineWidth = 2.6 * k; c.stroke();
      c.strokeStyle = trim; c.lineWidth = 1.7 * k; c.stroke();
    }
  }

  // =================================================================================== overlays
  function drawVest(c, R, v) {
    const k = R.k, lw = R.lw;
    const { sw, ww, hw, nw, y0 } = torsoDims(R, 0);
    const yb = R.hipY + (v.len || 0) * R.P.leg;
    const vs = sw * 0.94, gap = v.open === false ? 0 : 1.8 * k, cx = R.B ? 0 : -R.T * sw * 0.55;
    const panel = (sg) => { // sg -1 left panel, +1 right panel (front); whole back in back view
      c.beginPath();
      c.moveTo(cx + sg * nw * 0.95, y0 - 0.6 * k);
      c.quadraticCurveTo(sg * vs * 0.8, y0 - 0.4 * k, sg * vs, y0 + 3.3 * k);
      c.quadraticCurveTo(sg * (vs - 1.6 * k), y0 + 7 * k, sg * (sw - 1.2 * k), y0 + 9.5 * k);
      c.quadraticCurveTo(sg * (ww + 0.2 * k), (y0 + yb) / 2, sg * (hw + 0.3 * k), yb);
      c.lineTo(cx + sg * gap, yb + 1.2 * k);
      c.lineTo(cx + sg * gap * 0.8, y0 + 8 * k);
      c.closePath();
    };
    const parts = R.B || v.open === false ? [0] : [-1, 1];
    for (const sg of parts) {
      if (sg === 0) bodicePath(c, R, vs, ww + 0.2 * k, hw + 0.3 * k, y0 - 0.4, yb, nw * 0.95);
      else panel(sg);
      paint(c, v.color, -sw, y0, sw, yb, lw, 0.14, -0.22);
      clipDo(c, () => {
        if (v.stripes) {
          for (let x = -sw; x <= sw; x += 2.6 * k) { c.fillStyle = v.stripes; c.fillRect(x, y0 - 2, 1.2 * k, yb - y0 + 4); }
        }
        if (v.bands) bandsIn(c, v.bands, -sw - 2, sw + 2, y0, yb, k);
        if (v.trim) {
          if (sg === 0) { c.lineWidth = 3 * k; c.strokeStyle = v.trim; bodicePath(c, R, vs, ww + 0.2 * k, hw + 0.3 * k, y0 - 0.4, yb, nw * 0.95); c.stroke(); }
          else { panel(sg); c.lineWidth = 3 * k; c.strokeStyle = v.trim; c.stroke(); }
        }
      });
      if (sg === 0) bodicePath(c, R, vs, ww + 0.2 * k, hw + 0.3 * k, y0 - 0.4, yb, nw * 0.95); else panel(sg);
      c.lineWidth = lw; c.strokeStyle = ol(v.color); c.stroke();
    }
  }
  function drawSash(c, R, s, belt) {
    const k = R.k, lw = R.lw, P = R.P;
    const h = (belt ? 2.2 : s.w || 3.2) * k * (R.bat ? 1.25 : 1);
    const y = R.hipY - 3 * k, w = (P.ww + 0.9) * R.WF + (belt ? 0 : 0.4 * k);
    const cv = (R.B ? -0.8 : 1.6) * k;
    c.beginPath();
    c.moveTo(-w, y - h / 2); c.quadraticCurveTo(0, y - h / 2 + cv, w, y - h / 2);
    c.lineTo(w, y + h / 2); c.quadraticCurveTo(0, y + h / 2 + cv, -w, y + h / 2); c.closePath();
    paint(c, s.color, -w, y - h, -w, y + h, lw, 0.22, -0.2);
    const cx = R.B ? 0 : -R.T * w * 0.6;
    if (belt) {
      if (!R.B) { c.beginPath(); c.roundRect(cx - 1.6 * k, y - h * 0.6 + cv * 0.6, 3.2 * k, h * 1.2, 0.6 * k); paint(c, s.buckle || '#c9a24e', cx - 2, y - 2, cx + 2, y + 2, lw * 0.7); }
      return;
    }
    if (s.emblem === 'taiji' && !R.B) {
      const r = h * 0.62, ex = cx, ey = y + cv * 0.7;
      circ(c, ex, ey, r); fill(c, '#f2efe6');
      c.beginPath(); c.arc(ex, ey, r, -PI / 2, PI / 2); c.arc(ex, ey + r / 2, r / 2, PI / 2, -PI / 2, true); c.arc(ex, ey - r / 2, r / 2, PI / 2, -PI / 2, false); fill(c, '#25232c');
      circ(c, ex, ey, r); stroke(c, '#25232c', 0.6 * k);
    }
    if (s.tails !== false) { // knot + hanging tails at the front-right (back-left in back view)
      const kx = R.B ? -w * 0.45 : cx + w * 0.45, ky = y + cv * 0.6;
      const tl = (R.bat ? 16 : 9) * k;
      tube(c, [[kx, ky], [kx + 0.6 * k, ky + tl * 0.6], [kx + 0.2 * k, ky + tl]], [h * 0.34, h * 0.32, h * 0.26], shade(s.color, -0.06), lw * 0.8, true, false);
      tube(c, [[kx + 0.8 * k, ky], [kx + 2.6 * k, ky + tl * 0.5], [kx + 3.4 * k, ky + tl * 0.85]], [h * 0.3, h * 0.3, h * 0.24], s.color, lw * 0.8, true, false);
      ell(c, kx + 0.3 * k, ky, h * 0.42, h * 0.5); paint(c, shade(s.color, 0.06), kx - 2, ky - 2, kx + 2, ky + 2, lw * 0.8);
    }
  }
  function drawApron(c, R, a) {
    if (R.B) return;
    const k = R.k, lw = R.lw, P = R.P;
    const y0 = R.hipY - 5 * k, y1 = R.hipY + (a.len || 0.6) * P.leg;
    const cx = -R.T * P.ww * 0.6, w0 = P.ww * 0.85 * (1 - R.T * 0.5), w1 = P.hw * 1.0 * (1 - R.T * 0.5);
    c.beginPath(); c.moveTo(cx - w0, y0); c.lineTo(cx + w0, y0); c.quadraticCurveTo(cx + w1 + 0.5 * k, (y0 + y1) / 2, cx + w1, y1 - 1.5 * k);
    c.quadraticCurveTo(cx, y1 + 1.6 * k, cx - w1, y1 - 1.5 * k); c.quadraticCurveTo(cx - w1 - 0.5 * k, (y0 + y1) / 2, cx - w0, y0); c.closePath();
    paint(c, a.color, cx - w1, y0, cx + w1, y1, lw, 0.14, -0.18);
    seg(c, cx - w0 - 1.5 * k, y0 + 0.6 * k, cx + w0 + 1.5 * k, y0 + 0.6 * k, shade(a.color, -0.3), 1.6 * k);
  }
  function drawChest(c, R, ch) { // Tsou chest cover / bib
    if (R.B) return;
    const k = R.k, lw = R.lw, cx = -R.T * R.P.sw * 0.5;
    const y0 = R.shY + 1 * k, y1 = R.hipY - 4 * k, w = R.P.sw * 0.62 * (1 - R.T * 0.35);
    c.beginPath(); c.moveTo(cx - w * 0.6, y0); c.lineTo(cx + w * 0.6, y0); c.lineTo(cx + w, y0 + (y1 - y0) * 0.4);
    c.quadraticCurveTo(cx + w * 0.9, y1, cx, y1 + 1.5 * k); c.quadraticCurveTo(cx - w * 0.9, y1, cx - w, y0 + (y1 - y0) * 0.4); c.closePath();
    paint(c, ch.color, cx - w, y0, cx + w, y1, lw, 0.18, -0.2);
    if (ch.trim) {
      clipDo(c, () => { c.lineWidth = 2.6 * k; c.strokeStyle = ch.trim; c.stroke(); motif(c, cx - w, cx + w, y0 + (y1 - y0) * 0.55, 2.4 * k, ch.trim, 'diamond', k); });
    }
    seg(c, cx - w * 0.6, y0, cx - R.P.sw * 0.45, y0 - 2.4 * k, ch.cord || '#3a2a20', 0.9 * k);
    seg(c, cx + w * 0.6, y0, cx + R.P.sw * 0.45, y0 - 2.4 * k, ch.cord || '#3a2a20', 0.9 * k);
  }
  function drawBagStrap(c, R, b) {
    const k = R.k, P = R.P, lw = R.lw;
    const sg = R.B ? 1 : -1, cx = R.B ? 0 : -R.T * P.sw * 0.5;
    const a = [cx + sg * P.sw * 0.7 * R.WF, R.shY + 0.5 * k], z = [cx - sg * P.hw * 0.85 * R.WF, R.hipY - 2 * k];
    band(c, [a, z], b.strap || shade(b.color, -0.15), 1.6 * k, lw * 0.6);
  }
  function drawBag(c, R, b) {
    const k = R.k, P = R.P, lw = R.lw;
    const sg = R.B ? 1 : -1;
    const x = R.LT ? 1.5 * k : -sg * (P.hw * 0.95 + 1.5 * k), y = R.hipY + 1 * k;
    const w = 4.6 * k, h = 5.6 * k;
    c.beginPath(); c.roundRect(x - w / 2, y - h / 2, w, h, 1.5 * k); paint(c, b.color, x - w, y - h, x + w, y + h, lw);
    if (b.acc) { motif(c, x - w / 2 + 0.6 * k, x + w / 2 - 0.6 * k, y, 1.8 * k, b.acc, 'diamond', k * 0.6); }
    if (b.tassels) for (let j = -1; j <= 1; j++) seg(c, x + j * 1.3 * k, y + h / 2, x + j * 1.4 * k, y + h / 2 + 2.6 * k, b.tassels, 0.8 * k);
  }
  function drawBeads(c, R, b) {
    if (R.B) return;
    const k = R.k, cx = -R.T * R.P.sw * 0.55, y0 = R.shY;
    const cols = b.colors || ['#d9653a', '#f0c84a'];
    const rows = b.rows || 2;
    for (let r = 0; r < rows; r++) {
      const ry = (3 + r * 2.2) * k, rx = (R.P.hr * 0.36 + r * 1.6 * k) * (1 - R.T * 0.3);
      const n = 7 + r * 2;
      for (let j = 0; j <= n; j++) {
        const a = PI * (0.12 + 0.76 * j / n);
        const x = cx + cos(a) * rx * 1.25, y = y0 - 0.5 * k + sin(a) * ry;
        circ(c, x, y, (0.75 + (r === rows - 1 ? 0.15 : 0)) * k); fill(c, cols[(j + r) % cols.length]);
      }
    }
  }
  function drawPatch(c, R, p) {
    if (R.B || R.T > 0.7) return;
    const k = R.k, cx = -R.T * R.P.sw * 0.45, cy = R.shY + (R.hipY - R.shY) * 0.45;
    const r = R.P.sw * 0.5;
    circ(c, cx, cy, r); paint(c, '#f4efe2', cx - r, cy - r, cx + r, cy + r, R.lw * 0.7);
    c.fillStyle = p.color || '#b8282a'; c.font = `bold ${r * 1.45}px ${G.FONT_FAMILY || 'serif'}`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(p.text || '勇', cx, cy + r * 0.08);
  }
  function drawTowel(c, R, t) {
    const k = R.k, P = R.P, lw = R.lw;
    if (R.LT) {
      tube(c, [[0.5 * k, R.shY - 0.5 * k], [-2 * k, R.shY + 8 * k]], [1.8 * k, 1.6 * k], t.color, lw * 0.8);
      return;
    }
    const sg = R.B ? -1 : 1, x = sg * P.sw * 0.55;
    tube(c, [[x - sg * 2 * k, R.shY - 1.4 * k], [x + sg * 1.5 * k, R.shY + 1 * k], [x + sg * 1.8 * k, R.shY + 9 * k]], [1.7 * k, 1.9 * k, 1.6 * k], t.color, lw * 0.8);
  }
  function drawArmor(c, R, a) {
    const k = R.k, lw = R.lw;
    const { sw, ww, hw, nw, y0 } = torsoDims(R, 0);
    const yb = R.hipY - 2 * k;
    bodicePath(c, R, sw * 0.9, ww * 0.95, hw * 0.92, y0 + 3 * k, yb, nw);
    paint(c, a.color, -sw, y0, sw, yb, lw, 0.24, -0.25);
    clipDo(c, () => {
      c.strokeStyle = rgba(shade(a.color, -0.5), 0.5); c.lineWidth = 0.8 * k;
      for (let y = y0 + 6 * k; y < yb; y += 2.6 * k) {
        for (let x = -sw; x < sw; x += 3 * k) { c.beginPath(); c.arc(x + ((y / (2.6 * k)) % 2) * 1.5 * k, y, 1.5 * k, 0, PI); c.stroke(); }
      }
      if (a.trim && !R.B) { c.fillStyle = a.trim; c.beginPath(); c.arc(-R.T * sw * 0.5, y0 + (yb - y0) * 0.4, 2.6 * k, 0, TAU); c.fill(); }
    });
  }
  function drawPauldrons(c, R, a) {
    const k = R.k, lw = R.lw;
    for (const A of R.arms) {
      if (R.LT && A.i === 0) continue;
      const [x, y] = A.s;
      ell(c, x + (R.LT ? 0 : (A.i ? 1 : -1) * 0.8 * k), y - 0.5 * k, R.P.armW * 1.5, R.P.armW * 1.05);
      paint(c, a.trim || a.color, x - 4, y - 4, x + 4, y + 4, lw, 0.3, -0.2);
    }
  }
  function drawCapeBack(c, R, cp) { // behind the body (front/side views) or over the back (back view)
    const k = R.k, lw = R.lw, P = R.P;
    const y0 = R.shY - 1 * k, y1 = R.hipY + (cp.len || 0.8) * P.leg;
    const w0 = P.sw * 1.05 * R.WF, w1 = P.hw * 1.65 * R.WF + (cp.len || 0.8) * 3 * k;
    const dx = R.LT ? 5 * k : 0;
    const path = () => {
      c.beginPath(); c.moveTo(-w0 + dx * 0.3, y0);
      c.quadraticCurveTo(-w1 * 0.9 + dx, lerp(y0, y1, 0.5), -w1 + dx, y1);
      if (cp.feathers || cp.ragged) {
        const n = 9;
        for (let j = 1; j <= n; j++) { const x = lerp(-w1, w1, j / n) + dx; c.lineTo(x - (w1 / n), y1 + (j % 2 ? 3.5 : 0.5) * k); c.lineTo(x, y1); }
      } else c.quadraticCurveTo(dx, y1 + 2.5 * k, w1 + dx, y1);
      c.quadraticCurveTo(w1 * 0.9 + dx, lerp(y0, y1, 0.5), w0 + dx * 0.3, y0);
      c.closePath();
    };
    path();
    paint(c, cp.color, -w1, y0, w1, y1, lw, R.B ? 0.12 : -0.05, -0.28);
    if (cp.feathers) {
      clipDo(c, () => {
        c.strokeStyle = rgba(shade(cp.color, 0.35), 0.4); c.lineWidth = 0.8 * k;
        for (let y = y0 + 6 * k; y < y1; y += 4.5 * k) for (let x = -w1; x < w1; x += 4 * k) {
          c.beginPath(); c.moveTo(x + dx, y); c.quadraticCurveTo(x + dx + 1.5 * k, y + 2.5 * k, x + dx + 0.6 * k, y + 4 * k); c.stroke();
        }
      });
    }
  }
  function drawMantle(c, R, cp) { // cape collar over the shoulders
    const k = R.k, lw = R.lw, P = R.P;
    const y0 = R.shY - 1.5 * k, w = P.sw * 1.12 * R.WF, h = (cp.collar || 6) * k;
    c.beginPath(); c.moveTo(-w, y0 + 3 * k);
    c.quadraticCurveTo(-w * 0.9, y0 - 1.5 * k, 0, y0 - 1.2 * k); c.quadraticCurveTo(w * 0.9, y0 - 1.5 * k, w, y0 + 3 * k);
    if (cp.feathers) {
      for (let j = 8; j >= 0; j--) { const x = lerp(-w, w, j / 8); c.lineTo(x + w / 8, y0 + h + (j % 2 ? 1.8 : 0) * k); c.lineTo(x, y0 + h * 0.75); }
    } else c.quadraticCurveTo(0, y0 + h + 2 * k, -w, y0 + 3 * k);
    c.closePath();
    paint(c, cp.collarColor || shade(cp.color, 0.06), -w, y0, w, y0 + h, lw, 0.18, -0.2);
  }
  function drawKasaya(c, R, ks) { // monk's diagonal kāṣāya
    const k = R.k, lw = R.lw;
    const { sw, hw, y0 } = torsoDims(R, 0);
    const yb = R.hipY + 0.5 * R.P.leg;
    c.beginPath();
    if (R.B) { c.moveTo(-sw, y0 + 2 * k); c.lineTo(sw * 0.3, y0); c.lineTo(hw + 1, yb); c.lineTo(-hw - 1, yb); }
    else { c.moveTo(sw * 0.95, y0 + 2 * k); c.lineTo(sw * 0.2, y0 - 0.5 * k); c.lineTo(-hw - 1, yb - 4 * k); c.lineTo(-hw * 0.4, yb); c.lineTo(hw + 1, yb - 2 * k); }
    c.closePath();
    paint(c, ks.color, -sw, y0, sw, yb, lw, 0.14, -0.2);
    clipDo(c, () => { c.strokeStyle = rgba(shade(ks.color, -0.45), 0.5); c.lineWidth = 0.7 * k; for (let x = -sw * 2; x < sw * 2; x += 4 * k) { c.beginPath(); c.moveTo(x, y0 - 4); c.lineTo(x + 10 * k, yb + 4); c.stroke(); } });
  }

  // =================================================================================== arms & hands
  function drawArm(c, R, i, dim, hold) {
    const S = R.S, P = R.P, A = R.arms[i], top = S.top, lw = R.lw, k = R.k;
    const d = (col) => (dim ? shade(col, -0.14) : col);
    const sl = top.sleeve || 'long', w = P.armW;
    const s = A.s, e = A.e, wr = A.w;
    const col = d(top.armColor || top.color), skin = d(S.skin);
    if (sl === 'none' || sl === 'short' || sl === 'rolled' || top.bare) tube(c, [s, e, wr], [w * 0.88, w * 0.8, w * 0.72], skin, lw);
    if (!top.bare || top.sleeve === 'long') {
      if (sl === 'long') tube(c, [s, e, wr], [w, w * 0.96, w * 0.92], col, lw);
      else if (sl === 'wide' || sl === 'flow') {
        const f = sl === 'flow';
        const dir = [wr[0] - e[0], wr[1] - e[1]], dl = hypot(dir[0], dir[1]) || 1;
        const ext = f ? w * 1.0 : w * 0.25;
        const end = [wr[0] + dir[0] / dl * ext, wr[1] + dir[1] / dl * ext + (f ? w * 0.9 : 0)];
        tube(c, [s, e, end], [w * 1.05, w * (f ? 1.35 : 1.2), w * (f ? 2.05 : 1.6)], col, lw, true, false);
        // cuff opening
        const n = [-(end[1] - e[1]), end[0] - e[0]], nl = hypot(n[0], n[1]) || 1;
        const cw = w * (f ? 2.05 : 1.6);
        const cA = [end[0] + n[0] / nl * cw, end[1] + n[1] / nl * cw], cB = [end[0] - n[0] / nl * cw, end[1] - n[1] / nl * cw];
        c.beginPath(); c.moveTo(cA[0], cA[1]); c.lineTo(cB[0], cB[1]);
        if (top.cuff || top.ext) { c.strokeStyle = d(top.cuff || top.ext); c.lineWidth = 2.6 * k; c.stroke(); }
        c.strokeStyle = ol(col); c.lineWidth = lw * 0.8; c.stroke();
        if (top.ext) { // 歌仔戲 water sleeves
          const q = [end[0] + dir[0] / dl * w * 1.2, end[1] + w * 5];
          tube(c, [end, [lerp(end[0], q[0], 0.5) + w * 0.6, lerp(end[1], q[1], 0.5)], q], [cw * 0.9, cw * 0.95, cw * 0.8], d(top.ext), lw * 0.8, false, true, 0.1, -0.12);
        }
      } else if (sl === 'rolled') {
        tube(c, [s, e, lp(e, wr, 0.3)], [w * 1.03, w * 1.0, w * 1.06], col, lw);
        const m = lp(e, wr, 0.3);
        ell(c, m[0], m[1], w * 1.12, w * 0.6, atan2(wr[1] - e[1], wr[0] - e[0]) + PI / 2);
        paint(c, shade(col, 0.12), m[0] - w, m[1] - w, m[0] + w, m[1] + w, lw * 0.8);
      } else if (sl === 'short') tube(c, [s, lp(s, e, 0.9)], [w * 1.08, w * 1.12], col, lw);
      if (sl === 'long' && top.cuff) {
        const m = lp(e, wr, 0.86);
        tube(c, [lp(e, wr, 0.72), wr], [w * 1.02, w * 0.98], d(top.cuff), lw * 0.8);
        void m;
      }
    }
    if (S.bracers) tube(c, [lp(e, wr, 0.28), lp(e, wr, 0.96)], [w * 1.08, w * 1.02], d(S.bracers.color), lw);
    if (S.bracelet && (R.LT ? i === 1 : i === (R.B ? 1 : 0))) {
      const m = lp(e, wr, 0.9), a = atan2(wr[1] - e[1], wr[0] - e[0]) + PI / 2;
      ell(c, m[0], m[1], w * 0.95, w * 0.34, a); stroke(c, d(S.bracelet.color), 1.2 * k);
    }
    if (hold) hold();
    // hand
    const dir = [wr[0] - e[0], wr[1] - e[1]], dl = hypot(dir[0], dir[1]) || 1;
    const hx = wr[0] + dir[0] / dl * P.hand * 0.35, hy = wr[1] + dir[1] / dl * P.hand * 0.35;
    A.hand = [hx, hy];
    if (A.hidden) return;
    ball(c, hx, hy, P.hand, d(S.handColor || S.skin), lw, 0.22, -0.18);
  }

  // =================================================================================== head
  const FACE0 = [[-0.93, -0.28], [-0.97, 0.45], [-0.56, 0.93], [-0.13, 1.0], [0, 1.05], [0.13, 1.0], [0.56, 0.93], [0.97, 0.45], [0.93, -0.28], [0.74, -0.98], [-0.74, -0.98]];
  const FACE1 = [[-0.88, -0.4], [-1.02, 0.2], [-0.9, 0.8], [-0.64, 0.96], [-0.5, 1.03], [-0.32, 0.97], [-0.02, 0.9], [0.22, 0.6], [0.2, -0.3], [0.05, -0.98], [-0.72, -0.98]];
  function facePath(c, R) {
    const h = R.head, T = R.T;
    const p = FACE0.map((a, i) => [h.x + h.rx * lerp(a[0], FACE1[i][0], T), h.y + h.ry * lerp(a[1], FACE1[i][1], T)]);
    c.beginPath(); c.moveTo(p[0][0], p[0][1]);
    c.bezierCurveTo(p[1][0], p[1][1], p[2][0], p[2][1], p[3][0], p[3][1]);
    c.quadraticCurveTo(p[4][0], p[4][1], p[5][0], p[5][1]);
    c.bezierCurveTo(p[6][0], p[6][1], p[7][0], p[7][1], p[8][0], p[8][1]);
    c.bezierCurveTo(p[9][0], p[9][1], p[10][0], p[10][1], p[0][0], p[0][1]);
    c.closePath();
  }
  const HX = (R, u) => R.head.x + R.head.rx * (u * (1 - 0.36 * R.T) - 0.36 * R.T);
  const HY = (R, v) => R.head.y + R.head.ry * v;
  function hairVol(R, H) { return (H.vol || 1) * 2.3 * R.k; }
  function helmetPath(c, R, H) {
    const h = R.head, T = R.T, vol = hairVol(R, H);
    const cx = h.x + h.rx * 0.06 * T, cy = h.y - h.ry * 0.07;
    const Rx = h.rx + vol, Ry = h.ry + vol;
    const sl = H.side != null ? H.side : (H.back === 'short' || !H.back ? 0.3 : 0.6);
    const yF = h.y + h.ry * (R.B ? 0.74 : sl), yB = h.y + h.ry * (R.B ? 0.74 : lerp(sl, max(sl, 0.74), T));
    const aF = PI - Math.asin(clamp((yF - cy) / Ry, -0.99, 0.99));
    const aB = Math.asin(clamp((yB - cy) / Ry, -0.99, 0.99));
    c.beginPath();
    const sp = H.style === 'wild' ? 0.13 : H.style === 'messy' ? 0.05 : 0;
    if (sp) { // spiky silhouette
      const n = H.style === 'wild' ? 11 : 13, a1 = aB + TAU;
      c.moveTo(cx + Rx * cos(aF), cy + Ry * sin(aF));
      for (let j = 1; j <= n; j++) {
        const am = aF + (a1 - aF) * (j - 0.5) / n, ae = aF + (a1 - aF) * j / n;
        const f = 1 + sp * (0.6 + 0.4 * U.hash(j, 7, 3));
        c.quadraticCurveTo(cx + Rx * f * cos(am), cy + Ry * f * sin(am), cx + Rx * cos(ae), cy + Ry * sin(ae));
      }
    } else c.ellipse(cx, cy, Rx, Ry, 0, aF, aB + TAU, false);
    if (R.B) { // nape strand tips
      const x1 = cx + Rx * cos(aB), x0 = cx + Rx * cos(aF), n = 7;
      for (let j = 1; j <= n; j++) {
        const x = lerp(x1, x0, j / n);
        c.lineTo(x + (x0 - x1) / n * 0.5, yB + (H.style === 'wild' || H.style === 'messy' ? 3 : 1.6) * R.k);
        c.lineTo(x, yB - (j === n ? 0 : 0.8 * R.k));
      }
    } else if (T > 0.3) {
      c.quadraticCurveTo(h.x + h.rx * 0.55, yB + h.ry * 0.05, h.x + h.rx * 0.2, h.y + h.ry * 0.55);
      c.lineTo(h.x, h.y);
    } else c.lineTo(h.x + h.rx * 0.2, h.y + h.ry * 0.25);
    c.closePath();
    return { cx, cy, Rx, Ry };
  }
  function hairPaint(c, R, H, box) {
    paint(c, H.color, box.cx - box.Rx, box.cy - box.Ry, box.cx + box.Rx * 0.3, box.cy + box.Ry, R.lw, 0.16, -0.22);
  }
  function hairShine(c, R, H, clipPath) {
    const box = helmetPath(c, R, H);
    if (clipPath) clipPath();
    clipDo(c, () => {
      c.globalAlpha = lum(H.color) > 0.7 ? 0.75 : 0.5;
      c.strokeStyle = H.sheen || shade(H.color, 0.42);
      c.lineWidth = 2.3 * R.k;
      c.beginPath(); c.ellipse(box.cx - box.Rx * 0.06, box.cy - box.Ry * 0.1, box.Rx * 0.74, box.Ry * 0.6, 0, PI * 1.08, PI * 1.6); c.stroke();
      if (H.sheen && !clipPath && false) {
        c.globalAlpha = 0.3; c.fillStyle = H.sheen;
        c.beginPath(); c.ellipse(box.cx + box.Rx * 0.7, box.cy + box.Ry * 0.5, box.Rx * 0.5, box.Ry * 0.5, 0, 0, TAU); c.fill();
      }
    });
  }
  const BANGS = {
    messy: { s: 0, p: [[1.05, -0.06], [0.92, 0.25], [0.75, -0.1], [0.56, 0.2], [0.37, -0.16], [0.17, 0.16], [-0.03, -0.2], [-0.23, 0.18], [-0.44, -0.14], [-0.62, 0.22], [-0.8, -0.04], [-0.95, 0.34], [-1.06, 0.02]] },
    side: { s: 0, p: [[1.05, -0.02], [0.88, -0.3], [0.64, -0.42], [0.38, -0.3], [0.12, -0.06], [-0.16, 0.1], [-0.36, -0.02], [-0.55, 0.2], [-0.73, 0.05], [-0.9, 0.3], [-1.06, 0.04]] },
    center: { s: 1, p: [[1.06, 0.32], [0.97, 0.08], [0.7, -0.2], [0.36, -0.46], [0.05, -0.64], [-0.05, -0.64], [-0.36, -0.46], [-0.7, -0.2], [-0.97, 0.08], [-1.06, 0.32]] },
    part: { s: 1, p: [[1.06, 0.4], [0.94, 0.02], [0.66, -0.3], [0.36, -0.54], [0.22, -0.62], [0.04, -0.42], [-0.34, -0.16], [-0.7, 0.04], [-0.98, 0.3], [-1.06, 0.45]] },
    straight: { s: 0, p: [[1.05, 0.14], [0.86, 0.03], [0.66, 0.1], [0.44, 0.0], [0.22, 0.08], [0, 0.0], [-0.22, 0.08], [-0.44, 0.0], [-0.66, 0.1], [-0.86, 0.03], [-1.05, 0.14]] },
    back: { s: 1, p: [[1.04, -0.08], [0.72, -0.46], [0.3, -0.62], [-0.3, -0.62], [-0.72, -0.46], [-1.04, -0.08]] },
    wild: { s: 0, p: [[1.12, 0.12], [0.96, 0.34], [0.82, -0.16], [0.58, 0.18], [0.32, -0.32], [0.06, 0.06], [-0.2, -0.32], [-0.44, 0.14], [-0.7, -0.22], [-0.9, 0.3], [-1.12, 0.06]] },
    tuft: { s: 0, p: [[1.03, -0.12], [0.62, -0.5], [0.24, -0.6], [0.1, -0.22], [-0.04, -0.6], [-0.6, -0.5], [-1.03, -0.12]] },
  };
  function drawBangs(c, R, H) {
    const st = BANGS[H.style];
    if (!st || R.B) return;
    const h = R.head, vol = hairVol(R, H);
    const pts = st.p.map(([u, v]) => [HX(R, u), HY(R, v)]);
    const tips = () => { c.moveTo(pts[0][0], pts[0][1]); if (st.s) smoothTo(c, pts); else for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); };
    c.beginPath(); tips();
    const top = h.y - h.ry - vol * 1.3;
    c.bezierCurveTo(HX(R, -1.12), top, HX(R, 1.12), top, pts[0][0], pts[0][1]);
    c.closePath();
    c.fillStyle = grad(c, H.color, 0, h.y - h.ry, 0, h.y + h.ry * 0.35, 0.12, -0.2);
    c.fill();
    hairShine(c, R, H, () => { c.beginPath(); tips(); c.bezierCurveTo(HX(R, -1.12), top, HX(R, 1.12), top, pts[0][0], pts[0][1]); c.closePath(); });
    c.beginPath(); tips(); c.lineWidth = R.lw; c.strokeStyle = ol(H.color); c.lineJoin = 'round'; c.stroke();
    // strand lines
    c.strokeStyle = rgba(shade(H.color, -0.35), 0.55); c.lineWidth = 0.8 * R.k;
    for (let i = 1; i < pts.length - 1; i++) {
      if (pts[i][1] < pts[i - 1][1] && pts[i][1] < pts[i + 1][1]) {
        c.beginPath(); c.moveTo(pts[i][0], pts[i][1]); c.quadraticCurveTo(pts[i][0] + 0.5, pts[i][1] - h.ry * 0.2, lerp(pts[i][0], h.x, 0.25), pts[i][1] - h.ry * 0.38); c.stroke();
      }
    }
  }
  function drawLocks(c, R, H) {
    if (!H.locks || R.B) return;
    const h = R.head, k = R.k, T = R.T;
    const len = H.locks;
    const list = [{ x: h.x + h.rx * (0.9 - 1.0 * T), sg: 1 }];
    if (T < 0.6) list.push({ x: h.x + h.rx * (-0.9 - 0.12 * T), sg: -1 });
    for (const L of list) {
      const y0 = h.y - h.ry * 0.25, y1 = h.y + h.ry * (0.5 + len);
      const sw = (H.sway || 0) * 0.5;
      tube(c, [[L.x, y0], [L.x + L.sg * 1.2 * k, lerp(y0, y1, 0.5)], [L.x + L.sg * 0.6 * k + sw, y1]], [2.4 * k, 2.2 * k, 0.6 * k], H.color, R.lw * 0.85, true, true, 0.1, -0.2);
    }
  }
  // long hair / tails. layer 'behind' = before the body (front & side views), 'over' = back view
  function drawTail(c, R, H, layer) {
    const h = R.head, k = R.k, vol = hairVol(R, H), T = R.T;
    const feet = -h.y, back = H.back, sway = H.sway || 0;
    const L = (H.len || 0.4) * feet;
    if (!back || back === 'short') return;
    const col = H.color;
    if (R.view === 'front' || (R.view !== 'back' && layer === 'behindFront')) {
      if (back === 'ponytail') {
        const tx = h.x + h.rx * 0.15, ty = h.y - h.ry * 0.9;
        const pts = [[tx, ty], [h.x + h.rx * 1.05, h.y - h.ry * 0.35], [h.x + h.rx * 1.25 + sway, h.y + L * 0.45], [h.x + h.rx * 0.95 + sway * 1.4, h.y + L * 0.85]];
        tube(c, pts, [3.6 * k, 4.4 * k, 3.8 * k, 0.8 * k], col, R.lw, true, true, 0.12, -0.25);
        return;
      }
      const w0 = h.rx + vol, wb = h.rx * (back === 'lowtie' ? 1.02 : 1.12), y1 = h.y + L;
      c.beginPath(); c.moveTo(h.x - w0, h.y - h.ry * 0.2);
      c.bezierCurveTo(h.x - w0 * 1.06, h.y + L * 0.35, h.x - wb * 1.08, y1 - L * 0.25, h.x - wb * 0.85, y1);
      const n = 6;
      for (let j = 1; j <= n; j++) { const x = lerp(h.x - wb * 0.85, h.x + wb * 0.85, j / n); c.lineTo(x - wb * 0.85 / n, y1 - (j % 2 ? 0 : 3 * k) + 2.4 * k); c.lineTo(x, y1); }
      c.bezierCurveTo(h.x + wb * 1.08, y1 - L * 0.25, h.x + w0 * 1.06, h.y + L * 0.35, h.x + w0, h.y - h.ry * 0.2);
      c.closePath();
      paint(c, col, h.x - w0, h.y, h.x + w0, y1, R.lw, 0.06, -0.3);
      return;
    }
    if (R.view === 'back') {
      if (back === 'ponytail') {
        const tx = h.x, ty = h.y - h.ry * 0.55;
        tube(c, [[tx, ty], [tx + 0.8 * k + sway * 0.3, h.y + h.ry * 0.5], [tx + sway, h.y + L * 0.62], [tx + sway * 1.5, h.y + L]], [3.8 * k, 4.8 * k, 4.2 * k, 0.8 * k], col, R.lw, true, true, 0.14, -0.22);
        strands(c, R, [[tx, ty + 4 * k], [tx + sway, h.y + L * 0.9]], col);
        return;
      }
      if (back === 'lowtie') {
        const ny = h.y + h.ry * 0.95;
        const cy = h.y - h.ry * 0.07, Rx = h.rx + vol, Ry = h.ry + vol;
        c.beginPath(); c.ellipse(h.x, cy, Rx, Ry, 0, PI * 0.95, PI * 2.05);
        c.quadraticCurveTo(h.x + h.rx * 0.95, h.y + h.ry * 0.75, h.x + h.rx * 0.3, ny);
        c.lineTo(h.x - h.rx * 0.3, ny);
        c.quadraticCurveTo(h.x - h.rx * 0.95, h.y + h.ry * 0.75, h.x + Rx * cos(PI * 0.95), cy + Ry * sin(PI * 0.95)); c.closePath();
        paint(c, col, h.x - h.rx, h.y - h.ry, h.x + h.rx, ny, R.lw, 0.16, -0.2);
        hairShine(c, R, H, () => { c.beginPath(); c.ellipse(h.x, cy, Rx, Ry, 0, PI, TAU); c.closePath(); });
        for (const u of [-0.6, -0.25, 0.25, 0.6]) strands(c, R, [[h.x + u * h.rx, h.y - h.ry * 0.5], [h.x + u * h.rx * 0.3, ny - 1 * k]], col);
        ell(c, h.x, ny, h.rx * 0.34, 1.5 * k); paint(c, H.tie || '#d83a3a', h.x - 3, ny - 2, h.x + 3, ny + 2, R.lw * 0.6);
        tube(c, [[h.x, ny], [h.x + 0.6 * k + sway * 0.3, lerp(ny, h.y + L, 0.45)], [h.x + sway, h.y + L]], [h.rx * 0.3, h.rx * 0.42, h.rx * 0.14], col, R.lw, true, true, 0.14, -0.22);
        strands(c, R, [[h.x, ny + 3 * k], [h.x + sway, h.y + L * 0.95]], col);
        return;
      }
      // long / halfup sheet over the back
      const w0 = h.rx + vol, wb = h.rx * 0.98, y1 = h.y + L;
      c.beginPath(); c.ellipse(h.x, h.y - h.ry * 0.07, w0, h.ry + vol, 0, PI * 2.0, PI * 1.0, true); c.lineTo(h.x - w0, h.y - h.ry * 0.1);
      c.bezierCurveTo(h.x - w0 * 1.02, h.y + L * 0.3, h.x - wb * 1.02, y1 - L * 0.3, h.x - wb * 0.8, y1);
      const n = 6;
      for (let j = 1; j <= n; j++) { const x = lerp(h.x - wb * 0.8, h.x + wb * 0.8, j / n); c.lineTo(x - wb * 0.8 / n, y1 + (j % 2 ? 2.6 : 0.4) * k); c.lineTo(x, y1); }
      c.bezierCurveTo(h.x + wb * 1.02, y1 - L * 0.3, h.x + w0 * 1.02, h.y + L * 0.3, h.x + w0, h.y - h.ry * 0.07);
      c.closePath();
      paint(c, col, h.x - w0, h.y - h.ry, h.x + w0 * 0.5, y1, R.lw, 0.12, -0.24);
      hairShine(c, R, H, () => { c.beginPath(); c.ellipse(h.x, h.y - h.ry * 0.07, w0, h.ry + vol, 0, PI, TAU); c.closePath(); });
      clipDo(c, () => { for (let j = -2; j <= 2; j++) strands(c, R, [[h.x + j * h.rx * 0.35, h.y + h.ry * 0.3], [h.x + j * h.rx * 0.32, y1]], col); });
      return;
    }
    // side / q views: hanging behind the back (to the right, facing left)
    if (back === 'ponytail') {
      const tx = h.x + h.rx * (0.62 - 0.1 * (1 - T)), ty = h.y - h.ry * 0.82;
      const pts = [[tx, ty], [h.x + h.rx * 1.3, h.y - h.ry * 0.55], [h.x + h.rx * 1.55 + sway * 0.5, h.y + h.ry * 0.4], [h.x + h.rx * 1.35 + sway, h.y + L]];
      tube(c, pts, [3.6 * k, 4.6 * k, 4.2 * k, 0.8 * k], col, R.lw, true, true, 0.12, -0.24);
      strands(c, R, [pts[1], pts[3]], col);
    } else if (back === 'lowtie') {
      const nx = h.x + h.rx * 0.72, ny = h.y + h.ry * 0.62;
      tube(c, [[nx, ny], [nx + h.rx * 0.18 + sway * 0.3, lerp(ny, h.y + L, 0.45)], [nx + h.rx * 0.08 + sway, h.y + L]], [h.rx * 0.32, h.rx * 0.42, h.rx * 0.12], col, R.lw, true, true, 0.14, -0.24);
      strands(c, R, [[nx, ny + 3 * k], [nx + sway, h.y + L * 0.95]], col);
    } else {
      const pts = [[h.x + h.rx * 0.15, h.y - h.ry * 0.85], [h.x + h.rx + vol, h.y - h.ry * 0.05], [h.x + h.rx * 1.08 + sway * 0.5, h.y + L * 0.6], [h.x + h.rx * 0.88 + sway, h.y + L],
        [h.x + h.rx * 0.48 + sway * 0.8, h.y + L * 0.92], [h.x + h.rx * 0.32, h.y + L * 0.4], [h.x + h.rx * 0.1, h.y + h.ry * 0.5]];
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); smoothTo(c, pts); c.closePath();
      paint(c, col, h.x, h.y, h.x + h.rx * 1.3, h.y + L, R.lw, 0.06, -0.3);
      clipDo(c, () => { for (let j = 0; j < 3; j++) strands(c, R, [[h.x + h.rx * (0.5 + j * 0.2), h.y + h.ry * 0.4], [h.x + h.rx * (0.55 + j * 0.15) + sway, h.y + L]], col); });
    }
  }
  function strands(c, R, [a, b], col) {
    c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(a[0] + 1.5 * R.k, (a[1] + b[1]) / 2, b[0], b[1]);
    stroke(c, rgba(shade(col, lum(col) > 0.6 ? -0.3 : 0.3), 0.35), 0.8 * R.k);
  }
  function drawRibbon(c, R, H) { // long ribbon ends from a ponytail tie
    if (!H.ribbon) return;
    const h = R.head, k = R.k, sway = H.sway || 0, L = (H.len || 0.4) * -h.y * 0.85;
    let tx, ty, dx;
    if (R.view === 'back') { tx = h.x; ty = h.y - h.ry * 0.55; dx = 1; }
    else if (R.view === 'front') { tx = h.x + h.rx * 0.6; ty = h.y - h.ry * 0.7; dx = 1; }
    else { tx = h.x + h.rx * 0.62; ty = h.y - h.ry * 0.82; dx = 1; }
    const col = H.tie || '#d02a2a';
    for (const o of [-1, 1]) {
      const pts = [[tx, ty], [tx + dx * (3 + o) * k + sway * 0.4, ty + L * 0.3], [tx + dx * (1 + o * 2) * k + sway * 0.9, ty + L * 0.65], [tx + dx * (3 + o * 1.5) * k + sway * 1.3, ty + L]];
      tube(c, pts, [1 * k, 1.2 * k, 1.1 * k, 0.9 * k], o > 0 ? col : shade(col, -0.12), R.lw * 0.7, true, false, 0.2, -0.2);
    }
  }
  function drawKnot(c, R, H, phase) { // phase 'pre' (behind helmet) or 'post'
    const h = R.head, k = R.k, T = R.T, vol = hairVol(R, H), col = H.color;
    const kn = H.knot, top = h.y - h.ry - vol;
    if (kn === 'topknot' || kn === 'halfup') {
      if (phase !== 'post') return;
      const x = h.x + h.rx * 0.12 * T - (R.B ? 0 : 0), r = h.rx * (kn === 'halfup' ? 0.26 : 0.3), y = top - r * 0.35;
      ball(c, x, y, r, col, R.lw, 0.2, -0.2);
      if (H.style === 'messy' && kn === 'topknot') { // loose strands sticking out
        const fd = R.LT ? 1 : 1;
        tube(c, [[x + fd * r * 0.1, y - r * 0.5], [x + fd * r * 0.75, y - r * 1.15], [x + fd * r * 1.5, y - r * 1.2]], [r * 0.42, r * 0.3, r * 0.06], col, R.lw * 0.8, true, true, 0.2, -0.2);
        tube(c, [[x + fd * r * 0.2, y - r * 0.4], [x + fd * r * 0.95, y - r * 0.7], [x + fd * r * 1.45, y - r * 0.45]], [r * 0.3, r * 0.22, r * 0.05], col, R.lw * 0.7, true, true, 0.2, -0.2);
      }
      if (H.tie) { ell(c, x, y + r * 0.72, r * 0.9, r * 0.32); paint(c, H.tie, x - r, y, x + r, y + r, R.lw * 0.7); }
      return;
    }
    if (kn === 'bun') {
      if (R.B && phase === 'post') { const r = h.rx * 0.45; ball(c, h.x, h.y - h.ry * 0.12, r, col, R.lw, 0.22, -0.22); bunPins(c, R, H, h.x, h.y - h.ry * 0.12, r); return; }
      if (R.view === 'front' && phase === 'pre') { const r = h.rx * 0.42; ball(c, h.x, h.y - h.ry * 0.88, r, col, R.lw); return; }
      if (R.LT && phase === 'post') { const r = h.rx * 0.42; const x = h.x + h.rx * 0.95, y = h.y - h.ry * 0.25; ball(c, x, y, r, col, R.lw, 0.2, -0.2); bunPins(c, R, H, x, y, r); return; }
      return;
    }
    if (kn === 'bunTop' && phase === 'post') {
      const r = h.rx * 0.4, x = h.x + h.rx * 0.08 * T, y = top - r * 0.2;
      ball(c, x, y, r, col, R.lw, 0.22, -0.2); bunPins(c, R, H, x, y, r);
      return;
    }
    if (kn === 'twin' && phase === 'post') {
      for (const sg of [-1, 1]) {
        if (R.LT && sg < 0) { ball(c, h.x + h.rx * 0.3, top + h.ry * 0.12, h.rx * 0.3, shade(col, -0.1), R.lw); continue; }
        const x = R.LT ? h.x + h.rx * 0.55 : h.x + sg * h.rx * 0.72, y = h.y - h.ry * 0.86;
        ball(c, x, y, h.rx * 0.32, col, R.lw, 0.2, -0.2);
        if (H.tie) { c.beginPath(); c.arc(x, y, h.rx * 0.32, PI * 0.15, PI * 0.85); stroke(c, H.tie, 1.4 * k); }
      }
    }
  }
  function bunPins(c, R, H, x, y, r) {
    for (const p of H.pins || []) if (p.type === 'gold' || p.type === 'stick') {
      seg(c, x - r * 1.4, y - r * 0.2, x + r * 1.3, y - r * 0.7, p.color || '#d8b04c', 1.1 * R.k);
      ball(c, x + r * 1.3, y - r * 0.7, 1.2 * R.k, p.color || '#d8b04c', 0);
    }
  }
  function drawPins(c, R, H) {
    const h = R.head, k = R.k;
    for (const p of H.pins || []) {
      let x, y;
      if (R.B) { x = h.x - h.rx * 0.75; y = h.y - h.ry * 0.45; }
      else if (R.LT) { x = h.x + h.rx * 0.55; y = h.y - h.ry * 0.62; }
      else { x = h.x + h.rx * 0.82; y = h.y - h.ry * 0.55; }
      if (p.type === 'lantern') { // little red-gold lantern hairpin
        seg(c, x - 2.6 * k, y + 1.5 * k, x + 2.2 * k, y - 2.2 * k, '#d9b45a', 0.9 * k);
        const ly = y + 2.6 * k;
        seg(c, x, y, x, ly - 1.4 * k, '#c9a04a', 0.6 * k);
        ell(c, x, ly, 1.7 * k, 2.1 * k); paint(c, p.color || '#e0473a', x - 2, ly - 2, x + 2, ly + 2, 0.7 * k, 0.3, -0.15);
        c.fillStyle = rgba('#ffd27a', 0.6); ell(c, x - 0.3 * k, ly - 0.2 * k, 0.8 * k, 1.1 * k); c.fill();
        seg(c, x - 1.2 * k, ly - 2.1 * k, x + 1.2 * k, ly - 2.1 * k, '#d9b45a', 0.8 * k);
        seg(c, x, ly + 2.1 * k, x, ly + 3.6 * k, '#e0473a', 0.7 * k);
      } else if (p.type === 'flower') {
        const col = p.color || '#f08aa0';
        for (let j = 0; j < 5; j++) { const a = j * TAU / 5; circ(c, x + cos(a) * 1.4 * k, y + sin(a) * 1.4 * k, 1.1 * k); fill(c, col); }
        circ(c, x, y, 0.8 * k); fill(c, '#ffe27a');
      } else if (p.type === 'gold' && R.view !== 'back' && H.knot !== 'bun' && H.knot !== 'bunTop') {
        seg(c, x - 2 * k, y + 1 * k, x + 2.6 * k, y - 2.2 * k, p.color || '#d8b04c', 1 * k);
      }
    }
  }
  function drawVines(c, R, H) { // 藤婆: vines and leaves wound through the hair
    if (!H.vines) return;
    const h = R.head, k = R.k;
    c.strokeStyle = '#5c7a3a'; c.lineWidth = 1.1 * k;
    c.beginPath(); c.ellipse(h.x + h.rx * 0.05 * R.T, h.y - h.ry * 0.45, h.rx * 1.02, h.ry * 0.36, -0.08, PI * 0.95, PI * 2.05); c.stroke();
    for (let j = 0; j < 5; j++) {
      const a = PI * (1.05 + j * 0.22);
      const x = h.x + cos(a) * h.rx * 1.02, y = h.y - h.ry * 0.45 + sin(a) * h.ry * 0.36;
      ell(c, x, y, 1.8 * k, 1 * k, a + 0.6); paint(c, j % 2 ? '#7aa04a' : '#5f8a3c', x - 2, y - 2, x + 2, y + 2, 0.6 * k);
    }
  }

  // ---- face features
  function drawEye(c, x, y, w, h, sx, dir, col, st, expr, R) {
    const k = R.k, lid = R.S.lidColor || '#2a1d22';
    c.save(); c.translate(x, y); c.scale(sx * dir, 1);
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (expr === 'smile' || expr === 'closed') {
      c.beginPath(); c.moveTo(-w * 1.1, h * 0.25); c.quadraticCurveTo(0, -h * 0.85, w * 1.1, h * 0.25); stroke(c, lid, 1.15 * k * (R.bat ? 1.15 : 1));
      c.restore(); return;
    }
    if (expr === 'ko') { c.beginPath(); c.moveTo(-w * 1.1, -h * 0.15); c.quadraticCurveTo(0, h * 0.55, w * 1.1, -h * 0.15); stroke(c, lid, 1.1 * k); c.restore(); return; }
    if (expr === 'hurt') {
      c.beginPath(); c.moveTo(w * 1.0, -h * 0.6); c.lineTo(-w * 0.8, 0); c.lineTo(w * 1.0, h * 0.6); stroke(c, lid, 1.15 * k);
      c.restore(); return;
    }
    if (st === 'line') {
      c.beginPath(); c.moveTo(-w * 1.05, h * 0.1); c.quadraticCurveTo(0, -h * 0.5, w * 1.05, h * 0.1); stroke(c, lid, 1.05 * k);
      c.restore(); return;
    }
    if (st === 'blank') {
      ell(c, 0, 0, w * 1.05, h * 0.9); c.fillStyle = 'rgba(235,250,255,0.95)'; c.fill();
      c.restore(); return;
    }
    let ew = w, eh = h;
    if (st === 'dot') { ew = w * 0.62; eh = h * 0.72; }
    const hd = R.bat;
    if (st === 'fierce') {
      ell(c, 0, 0, w * 1.25, h * 0.85); fill(c, '#fbf6ea');
      circ(c, -w * 0.15, 0.1 * h, w * 0.55); fill(c, col);
      circ(c, -w * 0.15, 0.1 * h, w * 0.25); fill(c, '#100c10');
      c.beginPath(); c.moveTo(-w * 1.35, -h * 0.4); c.quadraticCurveTo(0, -h * 1.15, w * 1.4, -h * 0.75); stroke(c, lid, 1.4 * k);
      c.restore(); return;
    }
    if (hd && st !== 'dot') { // sclera for HD battle eyes
      ell(c, w * 0.1, h * 0.05, w * 1.3, h * 0.98); fill(c, '#fbf8f4');
      ew = w * 0.9; eh = h * 0.92;
    }
    c.save();
    if (st === 'narrow') { c.beginPath(); c.rect(-w * 2, -h * 0.1, w * 4, h * 2); c.clip(); }
    if (st === 'sharp') { c.beginPath(); c.moveTo(-w * 2, -h * 0.1); c.lineTo(w * 2, -h * 0.75); c.lineTo(w * 2, h * 2); c.lineTo(-w * 2, h * 2); c.closePath(); c.clip(); }
    ell(c, 0, 0, ew, eh);
    const g = c.createLinearGradient(0, -eh, 0, eh);
    g.addColorStop(0, shade(col, -0.62)); g.addColorStop(0.55, shade(col, -0.15)); g.addColorStop(1, shade(col, 0.28));
    c.fillStyle = g; c.fill();
    if (hd) { circ(c, 0, eh * 0.1, ew * 0.45); fill(c, shade(col, -0.7)); }
    circ(c, -ew * 0.32, -eh * 0.36, ew * 0.42); fill(c, '#ffffff');
    if (st !== 'dot') { circ(c, ew * 0.38, eh * 0.42, ew * 0.2); fill(c, rgba('#ffffff', 0.75)); }
    c.restore();
    // upper lid / lashes
    c.beginPath();
    if (st === 'narrow') { c.moveTo(-w * 1.2, -h * 0.05); c.quadraticCurveTo(0, -h * 0.32, w * 1.25, -h * 0.12); }
    else if (st === 'sharp') { c.moveTo(-w * 1.2, -h * 0.15); c.quadraticCurveTo(0, -h * 0.68, w * 1.35, -h * 0.85); }
    else if (st === 'dot') { c.moveTo(-w * 0.75, -h * 0.55); c.quadraticCurveTo(0, -h * 0.95, w * 0.75, -h * 0.55); }
    else { c.moveTo(-w * 1.18, -h * 0.42); c.quadraticCurveTo(0, -h * 1.22, w * 1.2, -h * 0.5); }
    stroke(c, lid, (st === 'dot' ? 0.9 : 1.25) * k * (hd ? 1.1 : 1));
    if (st === 'soft' || st === 'sharp') { c.beginPath(); c.moveTo(w * 1.1, -h * (st === 'sharp' ? 0.8 : 0.5)); c.lineTo(w * 1.55, -h * (st === 'sharp' ? 1.0 : 0.85)); stroke(c, lid, 0.9 * k); }
    if (hd && st !== 'dot') { c.beginPath(); c.moveTo(-w * 0.6, h * 0.95); c.quadraticCurveTo(0, h * 1.15, w * 0.8, h * 0.85); stroke(c, rgba(lid, 0.45), 0.7 * k); }
    c.restore();
  }
  function drawFace(c, R) {
    const S = R.S, h = R.head, k = R.k, T = R.T, F = S.face || {};
    const expr = R.pose.expr || 'normal';
    const skin = S.faceSkin || S.skin;
    // ears (front view, under the face edge)
    const earsShown = S.hair.ears !== false;
    if (T < 0.3 && earsShown) for (const sg of [-1, 1]) {
      const x = h.x + sg * h.rx * 0.95, y = h.y + h.ry * 0.18;
      ell(c, x, y, h.rx * 0.15, h.ry * 0.22); paint(c, skin, x - 3, y - 3, x + 3, y + 3, R.lw * 0.85);
    }
    facePath(c, R);
    paint(c, skin, h.x - h.rx, h.y - h.ry, h.x + h.rx * 0.6, h.y + h.ry, R.lw, 0.12, -0.12);
    clipDo(c, () => {
      // shading: under-bang shadow, back-side cheek shade
      c.fillStyle = rgba(shade(skin, -0.45), 0.22);
      c.beginPath(); c.ellipse(h.x - T * h.rx * 0.3, h.y - h.ry * 0.55, h.rx * 1.2, h.ry * 0.42, 0, 0, TAU); c.fill();
      c.fillStyle = rgba(shade(skin, -0.4), 0.14);
      c.beginPath(); c.ellipse(h.x + h.rx * (0.95 - T * 0.4), h.y + h.ry * 0.5, h.rx * 0.45, h.ry * 0.7, 0, 0, TAU); c.fill();
      if (F.paint) facePaint(c, R, F.paint);
      if (F.tattoo) faceTattoo(c, R, F.tattoo);
    });
    if (F.mask === 'ghost') { ghostMask(c, R); return; }
    // eyes
    const ey = h.y + h.ry * (S.eyeY || 0.22);
    const ew = h.rx * 0.15 * (S.eyeW || 1), eh = h.ry * 0.21 * (S.eyeH || 1);
    const st = S.eyeStyle || 'round';
    const eyes = [{ x: h.x + h.rx * (0.4 - 0.86 * T), sx: 1 - 0.12 * T, dir: 1 }];
    if (T < 0.7) eyes.push({ x: h.x + h.rx * (-0.4 - 0.46 * T), sx: 1 - 0.6 * T, dir: -1 });
    const ex = expr === 'normal' && S.blink ? 'closed' : expr;
    // blush
    if (F.blush !== false && st !== 'fierce') {
      for (const e of eyes) { ell(c, e.x + e.dir * h.rx * 0.06, ey + h.ry * 0.36, h.rx * 0.16 * e.sx, h.ry * 0.08); fill(c, rgba('#ff7a7a', R.bat ? 0.2 : 0.24)); }
    }
    for (const e of eyes) drawEye(c, e.x, ey, ew, eh, e.sx, e.dir, S.eyes, st, ex, R);
    // brows
    const bcol = S.browColor || (lum(S.hair.color) > 0.6 ? shade(S.hair.color, -0.35) : shade(S.hair.color, 0.05));
    const bs = S.brows || 'normal';
    for (const e of eyes) {
      const by = ey - eh * 1.75, bw = ew * 1.15 * e.sx;
      let inner = 0, outer = 0;
      if (bs === 'grumpy' || bs === 'fierce' || expr === 'focus' || expr === 'shout') { inner = eh * 0.45; outer = -eh * 0.15; }
      if (expr === 'hurt' || bs === 'soft' || expr === 'sad') { inner = -eh * 0.35; outer = eh * 0.15; }
      c.beginPath(); c.moveTo(e.x - e.dir * bw * 0.9, by + inner); c.quadraticCurveTo(e.x, by - eh * 0.25 + (inner + outer) / 2, e.x + e.dir * bw * 1.1, by + outer);
      stroke(c, bcol, (bs === 'fierce' ? 1.5 : 0.95) * k * (R.bat ? 1.1 : 1));
    }
    // nose
    const nx = h.x - h.rx * 0.9 * T, ny = h.y + h.ry * 0.42;
    if (T > 0.3) {
      c.beginPath(); c.moveTo(h.x - h.rx * (0.82 * T + 0.18), ny - h.ry * 0.14); c.lineTo(h.x - h.rx * (1.0 * T + 0.1), ny + h.ry * 0.03); c.lineTo(h.x - h.rx * (0.85 * T + 0.16), ny + h.ry * 0.08);
      stroke(c, ol(skin), 0.8 * k);
    } else { circ(c, nx, ny, 0.65 * k); fill(c, rgba(shade(skin, -0.45), 0.5)); }
    // mouth
    const mx = h.x - h.rx * 0.6 * T, my = h.y + h.ry * 0.64, mw = h.rx * 0.13 * (1 - T * 0.35);
    const mcol = '#7a3a36';
    const mo = expr === 'shout' ? 'open' : expr === 'hurt' ? 'grit' : expr === 'smile' ? 'smile' : expr === 'ko' ? 'flat' : (S.mouth || 'smile');
    c.beginPath();
    if (mo === 'open') { c.ellipse(mx, my + 0.4 * k, mw * 0.85, mw * 0.8, 0, 0, TAU); fill(c, '#6a2a2c'); c.beginPath(); c.ellipse(mx, my + mw * 0.55, mw * 0.5, mw * 0.25, 0, 0, TAU); fill(c, '#e07a7a'); }
    else if (mo === 'grit') { c.moveTo(mx - mw, my); c.lineTo(mx + mw, my + 0.3 * k); stroke(c, mcol, 1 * k); }
    else if (mo === 'flat') { c.moveTo(mx - mw * 0.7, my); c.lineTo(mx + mw * 0.7, my); stroke(c, mcol, 0.9 * k); }
    else if (mo === 'frown') { c.moveTo(mx - mw, my + 0.5 * k); c.quadraticCurveTo(mx, my - 0.8 * k, mx + mw, my + 0.5 * k); stroke(c, mcol, 0.9 * k); }
    else if (mo === 'smirk') { c.moveTo(mx - mw * 0.9, my); c.quadraticCurveTo(mx + mw * 0.2, my + 1 * k, mx + mw * 1.1, my - 0.9 * k); stroke(c, mcol, 0.95 * k); }
    else { c.moveTo(mx - mw * (mo === 'smile' && expr === 'smile' ? 1.3 : 1), my - 0.3 * k); c.quadraticCurveTo(mx, my + (expr === 'smile' ? 2.2 : 1.3) * k, mx + mw * (expr === 'smile' ? 1.3 : 1), my - 0.3 * k); stroke(c, mcol, 0.95 * k); }
    if (F.beard) drawBeard(c, R, F);
    if (F.glasses && T < 0.7) for (const e of eyes) { ell(c, e.x, ey, ew * 1.9 * e.sx, eh * 1.15); stroke(c, '#3a3030', 0.8 * k); }
    if (S.ear !== false && T >= 0.3 && earsShown) {
      const x = h.x + h.rx * (0.98 - 0.92 * T), y = h.y + h.ry * 0.18;
      ell(c, x, y, h.rx * 0.12, h.ry * 0.18); paint(c, skin, x - 3, y - 3, x + 3, y + 3, R.lw * 0.6);
      c.beginPath(); c.arc(x - h.rx * 0.01, y, h.rx * 0.055, -PI * 0.4, PI * 0.6); stroke(c, rgba(ol(skin), 0.7), 0.6 * k);
    }
  }
  function facePaint(c, R, p) { // painted faces: 八家將, 千里眼/順風耳, opera makeup
    const h = R.head, k = R.k, T = R.T;
    const X = (u) => h.x + h.rx * (u * (1 - 0.4 * T) - 0.5 * T), Y = (v) => h.y + h.ry * v;
    c.fillStyle = p.base; c.fillRect(h.x - h.rx * 1.2, h.y - h.ry * 1.2, h.rx * 2.4, h.ry * 2.4);
    if (p.style === 'opera') {
      for (const u of [-0.42, 0.4]) { if (T > 0.7 && u < 0) continue; const g = c.createRadialGradient(X(u), Y(0.3), 0, X(u), Y(0.3), h.rx * 0.5); g.addColorStop(0, rgba('#f0607a', 0.8)); g.addColorStop(1, rgba('#f0607a', 0)); c.fillStyle = g; c.fillRect(X(u) - h.rx, Y(-0.4), h.rx * 2, h.ry * 1.4); }
      return;
    }
    if (p.mark) {
      c.fillStyle = p.mark;
      for (const u of [-0.42, 0.42]) { if (T > 0.7 && u < 0) continue; c.beginPath(); c.ellipse(X(u), Y(0.12), h.rx * 0.27 * (1 - 0.4 * T), h.ry * 0.3, u * 0.6, 0, TAU); c.fill(); }
      c.beginPath(); c.moveTo(X(-0.25), Y(0.62)); c.quadraticCurveTo(X(0), Y(1.1), X(0.25), Y(0.62)); c.quadraticCurveTo(X(0), Y(0.8), X(-0.25), Y(0.62)); c.fill();
    }
    if (p.acc) {
      c.fillStyle = p.acc;
      c.beginPath(); c.moveTo(X(0), Y(-0.75)); c.quadraticCurveTo(X(0.2), Y(-0.4), X(0), Y(-0.15)); c.quadraticCurveTo(X(-0.2), Y(-0.4), X(0), Y(-0.75)); c.fill();
      for (const u of [-0.75, 0.75]) { if (T > 0.7 && u < 0) continue; c.beginPath(); c.arc(X(u), Y(0.5), h.rx * 0.08, 0, TAU); c.fill(); }
    }
  }
  function faceTattoo(c, R, t) { // Truku / Atayal 紋面 — muted blue-grey, drawn with restraint
    const h = R.head, k = R.k, T = R.T;
    const X = (u) => h.x + h.rx * (u * (1 - 0.4 * T) - 0.52 * T), Y = (v) => h.y + h.ry * v;
    c.fillStyle = rgba('#3d4762', 0.62);
    c.fillRect(X(0) - 0.85 * k, Y(-0.7), 1.7 * k, h.ry * 0.62); // forehead line
    if (t === 'truku_m') { c.fillRect(X(0) - 1 * k, Y(0.74), 2 * k, h.ry * 0.24); return; }
    c.fillStyle = rgba('#46506c', 0.42);
    c.beginPath(); // band from ear to ear sweeping down around the mouth (V-shaped)
    c.moveTo(X(-0.98), Y(0.38)); c.quadraticCurveTo(X(-0.3), Y(0.5), X(0), Y(0.56)); c.quadraticCurveTo(X(0.3), Y(0.5), X(0.98), Y(0.38));
    c.lineTo(X(0.94), Y(0.56)); c.quadraticCurveTo(X(0.3), Y(0.74), X(0), Y(0.86)); c.quadraticCurveTo(X(-0.3), Y(0.74), X(-0.94), Y(0.56)); c.closePath(); c.fill();
    c.strokeStyle = rgba('#2a3148', 0.3); c.lineWidth = 0.45 * k;
    for (let j = 1; j < 3; j++) { const o = j * 0.1; c.beginPath(); c.moveTo(X(-0.96), Y(0.4 + o * 0.9)); c.quadraticCurveTo(X(-0.3), Y(0.53 + o), X(0), Y(0.6 + o)); c.quadraticCurveTo(X(0.3), Y(0.53 + o), X(0.96), Y(0.4 + o * 0.9)); c.stroke(); }
  }
  function ghostMask(c, R) { // 鬼面 — pale demon mask with dark eye holes and red streaks
    const h = R.head, k = R.k, T = R.T;
    const X = (u) => h.x + h.rx * (u * (1 - 0.42 * T) - 0.45 * T), Y = (v) => h.y + h.ry * v;
    c.beginPath(); c.moveTo(X(-0.86), Y(-0.45)); c.quadraticCurveTo(X(0), Y(-0.85), X(0.86), Y(-0.45));
    c.quadraticCurveTo(X(0.95), Y(0.5), X(0), Y(1.02)); c.quadraticCurveTo(X(-0.95), Y(0.5), X(-0.86), Y(-0.45)); c.closePath();
    paint(c, '#e9e6e2', X(-1), Y(-0.8), X(1), Y(1), R.lw, 0.1, -0.25);
    c.fillStyle = '#16121a';
    for (const u of [-0.4, 0.4]) { if (T > 0.7 && u < 0) continue; c.beginPath(); c.moveTo(X(u - 0.24 * Math.sign(u)), Y(0.05)); c.quadraticCurveTo(X(u), Y(-0.12), X(u + 0.22 * Math.sign(u)), Y(0.12)); c.quadraticCurveTo(X(u), Y(0.32), X(u - 0.24 * Math.sign(u)), Y(0.05)); c.fill(); }
    c.fillStyle = 'rgba(255,90,70,0.9)';
    for (const u of [-0.4, 0.4]) { if (T > 0.7 && u < 0) continue; circ(c, X(u), Y(0.12), 0.7 * k); c.fill(); }
    c.strokeStyle = '#b0242a'; c.lineWidth = 1.2 * k;
    for (const u of [-0.55, 0.55]) { if (T > 0.7 && u < 0) continue; c.beginPath(); c.moveTo(X(u), Y(0.35)); c.lineTo(X(u * 0.8), Y(0.7)); c.stroke(); }
    c.beginPath(); c.moveTo(X(-0.25), Y(0.68)); for (let j = 0; j <= 4; j++) c.lineTo(X(-0.25 + j * 0.125), Y(j % 2 ? 0.78 : 0.68)); stroke(c, '#16121a', 0.9 * k);
    for (const u of [-0.5, 0.5]) { if (T > 0.7 && u < 0) continue; c.beginPath(); c.moveTo(X(u * 0.8), Y(-0.6)); c.quadraticCurveTo(X(u * 1.1), Y(-1.1), X(u * 1.25), Y(-1.15)); stroke(c, '#d8d2ca', 2 * k); }
  }
  function drawBeard(c, R, F) {
    const h = R.head, k = R.k, T = R.T, col = F.beardColor || R.S.hair.color;
    const X = (u) => h.x + h.rx * (u * (1 - 0.4 * T) - 0.55 * T), Y = (v) => h.y + h.ry * v;
    const b = F.beard;
    if (b === 'mustache' || b === 'whiskers' || b === 'long' || b === 'goatee' || b === 'full') {
      if (b === 'whiskers') {
        for (const sg of [-1, 1]) { if (T > 0.7 && sg < 0) continue; c.beginPath(); c.moveTo(X(0), Y(0.55)); c.quadraticCurveTo(X(sg * 0.35), Y(0.55), X(sg * 0.5), Y(0.95)); stroke(c, col, 1 * k); }
      } else {
        c.beginPath(); c.moveTo(X(-0.38), Y(0.66)); c.quadraticCurveTo(X(0), Y(0.48), X(0.38), Y(0.66)); c.quadraticCurveTo(X(0), Y(0.6), X(-0.38), Y(0.66)); c.closePath();
        paint(c, col, X(-0.4), Y(0.5), X(0.4), Y(0.7), R.lw * 0.6);
      }
    }
    if (b === 'goatee') { c.beginPath(); c.moveTo(X(-0.16), Y(0.86)); c.quadraticCurveTo(X(0), Y(1.45), X(0.16), Y(0.86)); c.closePath(); paint(c, col, X(-0.2), Y(0.8), X(0.2), Y(1.4), R.lw * 0.6); }
    if (b === 'long') {
      c.beginPath(); c.moveTo(X(-0.55), Y(0.6)); c.quadraticCurveTo(X(-0.5), Y(1.2), X(0), Y(1.95)); c.quadraticCurveTo(X(0.5), Y(1.2), X(0.55), Y(0.6)); c.quadraticCurveTo(X(0), Y(0.95), X(-0.55), Y(0.6)); c.closePath();
      paint(c, col, X(-0.6), Y(0.6), X(0.6), Y(1.9), R.lw * 0.7, 0.12, -0.15);
      clipDo(c, () => { for (let j = -2; j <= 2; j++) { c.beginPath(); c.moveTo(X(j * 0.18), Y(0.9)); c.lineTo(X(j * 0.08), Y(1.9)); stroke(c, rgba(shade(col, -0.3), 0.4), 0.6 * k); } });
    }
    if (b === 'full') {
      c.beginPath(); c.moveTo(X(-0.92), Y(0.2)); c.quadraticCurveTo(X(-0.95), Y(0.95), X(0), Y(1.25)); c.quadraticCurveTo(X(0.95), Y(0.95), X(0.92), Y(0.2));
      c.lineTo(X(0.75), Y(0.35)); c.quadraticCurveTo(X(0.55), Y(0.85), X(0), Y(0.85)); c.quadraticCurveTo(X(-0.55), Y(0.85), X(-0.75), Y(0.35)); c.closePath();
      paint(c, col, X(-1), Y(0.2), X(1), Y(1.2), R.lw * 0.7);
    }
  }

  // ---- hats
  function hatShadow(c, R, depth) {
    facePath(c, R);
    clipDo(c, () => { const h = R.head; c.fillStyle = rgba('#20141a', 0.22); c.beginPath(); c.ellipse(h.x, h.y - h.ry * (0.55 - depth), h.rx * 1.4, h.ry * 0.5, 0, 0, TAU); c.fill(); });
  }
  const HATS = {
    douli(c, R, o, phase) { // 斗笠 conical bamboo hat (fringe: Hakka 涼笠 cloth curtain)
      if (phase !== 'front') return;
      const h = R.head, k = R.k, lw = R.lw;
      const s = o.scale || 1;
      const bx = h.x, by = h.y - h.ry * 0.5, brx = h.rx * 1.62 * s, bry = h.ry * 0.5 * s, ay = h.y - h.ry * 1.55 * s;
      const col = o.color || '#d6b778';
      if (o.fringe) { // curtain behind/around
        c.beginPath(); c.ellipse(bx, by, brx * 0.98, bry, 0, 0, PI);
        c.lineTo(bx - brx * 0.98, by + h.ry * 0.5); c.ellipse(bx, by + h.ry * 0.5, brx * 0.98, bry, 0, PI, 0, true); c.closePath();
        if (!R.B) { c.save(); c.beginPath(); c.rect(bx - brx * 1.2, by - bry * 2, brx * 0.45, h.ry * 3); c.rect(bx + brx * 0.75, by - bry * 2, brx * 0.45, h.ry * 3); c.clip(); }
        c.beginPath(); c.ellipse(bx, by, brx * 0.98, bry, 0, 0, PI); c.lineTo(bx - brx * 0.98, by + h.ry * 0.55);
        c.ellipse(bx, by + h.ry * 0.55, brx * 0.98, bry * 1.05, 0, PI, 0, true); c.closePath();
        paint(c, o.fringe, bx - brx, by, bx + brx, by + h.ry, lw, 0.1, -0.2);
        for (let j = -6; j <= 6; j++) seg(c, bx + j * brx / 6.5, by + bry * 0.9 * cos(j / 6.5 * PI / 2), bx + j * brx / 6.5, by + h.ry * 0.5 + bry * cos(j / 6.5 * PI / 2), rgba('#000000', 0.25), 0.6 * k);
        if (!R.B) c.restore();
      }
      if (!R.B) hatShadow(c, R, 0.15);
      c.beginPath(); c.moveTo(bx - brx, by);
      c.quadraticCurveTo(bx - brx * 0.35, by - bry * 1.2, bx, ay);
      c.quadraticCurveTo(bx + brx * 0.35, by - bry * 1.2, bx + brx, by);
      c.ellipse(bx, by, brx, bry, 0, 0, PI);
      c.closePath();
      paint(c, col, bx - brx, ay, bx + brx * 0.6, by + bry, lw, 0.2, -0.24);
      clipDo(c, () => {
        c.strokeStyle = rgba(shade(col, -0.4), 0.45); c.lineWidth = 0.7 * k;
        for (let j = -5; j <= 5; j++) { c.beginPath(); c.moveTo(bx, ay); c.lineTo(bx + j * brx * 0.2, by + bry * (1 - abs(j) * 0.04)); c.stroke(); }
        for (const f of [0.45, 0.75]) { c.beginPath(); c.ellipse(bx, lerp(ay, by, f) + bry * f * 0.3, brx * f, bry * f, 0, 0, TAU); c.stroke(); }
        c.fillStyle = rgba('#000', 0.12); c.beginPath(); c.ellipse(bx + brx * 0.4, by + bry * 0.3, brx * 0.7, bry, 0, 0, TAU); c.fill();
      });
      ell(c, bx, ay + 0.6 * k, 1.4 * k, 1 * k); fill(c, shade(col, -0.3));
      if (!R.B && R.T < 0.6) for (const sg of [-1, 1]) seg(c, h.x + sg * h.rx * 0.8, by + bry * 0.6, h.x + sg * h.rx * 0.45, h.y + h.ry * 0.95, rgba('#6a4a2a', 0.7), 0.6 * k);
    },
    tea(c, R, o, phase) { HATS.douli(c, R, Object.assign({ fringe: o.fringe || '#e8e2d2', scale: 0.92 }, o), phase); },
    cap(c, R, o, phase) { // 瓜皮帽 skullcap with knot button
      if (phase !== 'front') return;
      const h = R.head, k = R.k, col = o.color || '#2a2632', vol = 2.3 * k;
      const cx = h.x + h.rx * 0.05 * R.T, cy = h.y - h.ry * 0.38;
      c.beginPath(); c.ellipse(cx, cy, h.rx + vol * 0.9, h.ry * 0.78, 0, PI, TAU); c.quadraticCurveTo(cx, cy + h.ry * 0.2, cx - h.rx - vol * 0.9, cy); c.closePath();
      paint(c, col, cx - h.rx, cy - h.ry, cx + h.rx, cy, R.lw, 0.24, -0.2);
      clipDo(c, () => { for (let j = -2; j <= 2; j++) { c.beginPath(); c.moveTo(cx + j * h.rx * 0.1, cy - h.ry * 0.78); c.quadraticCurveTo(cx + j * h.rx * 0.5, cy - h.ry * 0.4, cx + j * h.rx * 0.6, cy + 2); stroke(c, rgba('#ffffff', 0.12), 0.6 * k); } });
      ball(c, cx, cy - h.ry * 0.78, 1.8 * k, o.acc || '#c0302a', R.lw * 0.6);
    },
    scarf(c, R, o, phase) { // headscarf covering the hair, knot at nape
      const h = R.head, k = R.k, col = o.color || '#5c7aa8', vol = 3 * k;
      const cx = h.x + h.rx * 0.06 * R.T, cy = h.y - h.ry * 0.12;
      if (phase === 'back' || (phase === 'front' && R.B)) {
        c.beginPath();
        if (R.B) c.ellipse(cx, cy, h.rx + vol, h.ry + vol * 0.9, 0, 0, TAU);
        else c.ellipse(cx, cy, h.rx + vol, h.ry + vol * 0.9, 0, PI * 0.88, PI * 2.12);
        c.closePath();
        paint(c, col, cx - h.rx, cy - h.ry, cx + h.rx, cy + h.ry, R.lw, 0.18, -0.2);
        clipDo(c, () => { if (o.acc) for (let y = cy - h.ry * 1.2; y < cy + h.ry; y += 3.4 * k) for (let x = cx - h.rx * 1.2; x < cx + h.rx * 1.2; x += 3.4 * k) { circ(c, x + ((y / (3.4 * k)) | 0) % 2 * 1.7 * k, y, 0.7 * k); fill(c, o.acc); } });
        if (R.B || R.LT) { // knot & tails
          const kx = R.B ? h.x : h.x + h.rx * 0.95, ky = h.y + h.ry * 0.45;
          ball(c, kx, ky, 2.2 * k, shade(col, -0.05), R.lw * 0.8);
          tube(c, [[kx, ky], [kx + 2 * k, ky + 6 * k]], [1.6 * k, 1.2 * k], col, R.lw * 0.7);
          tube(c, [[kx, ky], [kx - 1.5 * k, ky + 5 * k]], [1.6 * k, 1.2 * k], shade(col, -0.1), R.lw * 0.7);
        }
        return;
      }
      if (phase !== 'front' || R.B) return;
      const X = (u) => HX(R, u), Y = (v) => HY(R, v);
      c.beginPath(); c.moveTo(X(-1.12), Y(0.25)); c.quadraticCurveTo(X(-0.9), Y(-0.6), X(0), Y(-0.6)); c.quadraticCurveTo(X(0.9), Y(-0.6), X(1.12), Y(0.25));
      c.quadraticCurveTo(X(1.2), Y(-1.3), X(0), Y(-1.18)); c.quadraticCurveTo(X(-1.2), Y(-1.3), X(-1.12), Y(0.25)); c.closePath();
      paint(c, col, X(-1), Y(-1.2), X(1), Y(0.2), R.lw, 0.2, -0.18);
      clipDo(c, () => { if (o.acc) for (let y = h.y - h.ry * 1.3; y < h.y; y += 3.4 * k) for (let x = h.x - h.rx * 1.3; x < h.x + h.rx * 1.3; x += 3.4 * k) { circ(c, x + ((y / (3.4 * k)) | 0) % 2 * 1.7 * k, y, 0.7 * k); fill(c, o.acc); } });
      c.beginPath(); c.moveTo(X(-1.1), Y(0.2)); c.quadraticCurveTo(X(-0.9), Y(-0.55), X(0), Y(-0.55)); c.quadraticCurveTo(X(0.9), Y(-0.55), X(1.1), Y(0.2)); stroke(c, shade(col, -0.25), 1.4 * k);
    },
    hood(c, R, o, phase) { HATS.scarf(c, R, Object.assign({}, o, { acc: null }), phase); },
    veil(c, R, o, phase) {
      const h = R.head, k = R.k, col = o.color || '#efeae2';
      if (phase === 'back') {
        c.beginPath(); c.moveTo(h.x - h.rx * 1.1, h.y - h.ry * 0.2); c.quadraticCurveTo(h.x - h.rx * 1.25, h.y - h.ry * 1.35, h.x, h.y - h.ry * 1.25);
        c.quadraticCurveTo(h.x + h.rx * 1.25, h.y - h.ry * 1.35, h.x + h.rx * 1.1, h.y - h.ry * 0.2);
        c.lineTo(h.x + h.rx * 1.25, h.y + h.ry * 1.6); c.lineTo(h.x - h.rx * 1.25, h.y + h.ry * 1.6); c.closePath();
        paint(c, col, h.x - h.rx, h.y - h.ry, h.x + h.rx, h.y + h.ry, R.lw, 0.1, -0.2);
        return;
      }
      if (phase !== 'front' || R.B) return;
      HATS.scarf(c, R, { color: col }, 'front');
    },
    band(c, R, o, phase) { // headband around the forehead (woven / coloured)
      if (phase !== 'front') return;
      const h = R.head, k = R.k, col = o.color || '#c0302a';
      const T = R.T, cy = h.y - h.ry * 0.42, rx = h.rx + 2.6 * k, ry = h.ry * 0.36, bh = (o.h || 3) * k;
      const a0 = R.B ? PI * 0.05 : PI * 0.02, a1 = R.B ? PI * 0.95 : PI * 0.98;
      c.beginPath(); c.ellipse(h.x + h.rx * 0.05 * T, cy, rx, ry, 0, a0, a1);
      c.ellipse(h.x + h.rx * 0.05 * T, cy - bh, rx, ry, 0, a1, a0, true); c.closePath();
      paint(c, col, h.x - rx, cy - bh, h.x + rx, cy + ry, R.lw * 0.8, 0.2, -0.18);
      if (o.acc) clipDo(c, () => motif(c, h.x - rx, h.x + rx, cy + ry * 0.85 - bh / 2, bh, o.acc, o.motif || 'diamond', k * 0.7));
      if (R.B || R.LT) { const kx = R.B ? h.x + h.rx * 0.2 : h.x + h.rx * 0.95, ky = cy - bh / 2 + (R.B ? ry : 0); tube(c, [[kx, ky], [kx + 2.5 * k, ky + 7 * k]], [1.2 * k, 1 * k], col, R.lw * 0.7); tube(c, [[kx, ky], [kx + 0.5 * k, ky + 8 * k]], [1.2 * k, 1 * k], shade(col, -0.12), R.lw * 0.7); }
    },
    wreath(c, R, o, phase) { // 卑南 flower wreath
      if (phase !== 'front') return;
      const h = R.head, k = R.k, T = R.T;
      const cx = h.x + h.rx * 0.05 * T, cy = h.y - h.ry * 0.62, rx = h.rx * 1.06, ry = h.ry * 0.38;
      const cols = o.colors || ['#f2c230', '#e0463a', '#f08a2a', '#f6efe0', '#e85a8a'];
      const n = 16;
      const pts = [];
      for (let j = 0; j < n; j++) { const a = j * TAU / n; pts.push([cx + cos(a) * rx, cy + sin(a) * ry, sin(a)]); }
      pts.sort((a, b) => a[2] - b[2]);
      let ci = 0;
      for (const [x, y, z] of pts) {
        if (z > 0.2 && R.B) continue;
        for (const dx of [-1, 1]) { ell(c, x + dx * 1.6 * k, y + 0.4 * k, 1.4 * k, 0.8 * k, dx * 0.5); fill(c, '#4f8a3a'); }
        const col = cols[(ci++ * 3) % cols.length];
        ball(c, x, y, 2.5 * k * (0.85 + z * 0.15), col, R.lw * 0.5, 0.25, -0.1);
        circ(c, x, y, 0.7 * k); fill(c, '#ffe9a0');
      }
    },
    amis(c, R, o, phase) { // Amis festive headband with pompoms & small plumes
      if (phase !== 'front') return;
      HATS.band(c, R, { color: o.color || '#f2f0ea', acc: o.acc || '#d4282a', motif: 'diamond', h: 3.6 }, 'front');
      const h = R.head, k = R.k, T = R.T, cy = h.y - h.ry * 0.62;
      const cols = ['#e83a3a', '#f2c230', '#3a9a5a', '#2f6ac0', '#e83a3a'];
      if (!R.B) for (let j = 0; j < 5; j++) { const u = -0.7 + j * 0.35; const x = HX(R, u); if (R.LT && u < -0.5) continue; ball(c, x, cy - 2 * k, 1.7 * k, cols[j], R.lw * 0.5, 0.3, -0.1); }
    },
    tsou(c, R, o, phase) { // Tsou leather cap with long feathers
      const h = R.head, k = R.k, T = R.T, col = o.color || '#7a5236';
      const cx = h.x + h.rx * 0.06 * T, cy = h.y - h.ry * 0.3;
      if (phase === 'pre' || (phase === 'front' && R.B)) {
        for (const [dx, a, len] of [[-0.05, -0.08, 1.5], [0.22, 0.22, 1.3]]) {
          const bx = R.LT ? cx + h.rx * (0.4 + dx) : cx + h.rx * dx * 1.4, by = cy - h.ry * 0.62;
          const ang = -PI / 2 + a + (R.LT ? 0.45 : 0);
          const tx = bx + cos(ang) * h.ry * len, ty = by + sin(ang) * h.ry * len;
          tube(c, [[bx, by], [(bx + tx) / 2, (by + ty) / 2], [tx, ty]], [0.7 * k, 2.2 * k, 0.8 * k], '#3a3234', R.lw * 0.6, true, true, 0.25, -0.1);
          seg(c, lerp(bx, tx, 0.72), lerp(by, ty, 0.72), lerp(bx, tx, 0.85), lerp(by, ty, 0.85), '#f2eee6', 2.6 * k);
        }
        if (phase === 'pre') return;
      }
      if (phase !== 'front') return;
      c.beginPath(); c.ellipse(cx, cy, h.rx + 2.8 * k, h.ry * 0.95, 0, PI * 0.98, PI * 2.02); c.quadraticCurveTo(cx, cy + h.ry * 0.18, cx - h.rx - 2.8 * k, cy + 0.5 * k); c.closePath();
      paint(c, col, cx - h.rx, cy - h.ry, cx + h.rx, cy, R.lw, 0.22, -0.22);
      clipDo(c, () => {
        c.strokeStyle = rgba('#f0e2c0', 0.55); c.lineWidth = 0.7 * k; c.setLineDash([1.2 * k, 1.2 * k]);
        c.beginPath(); c.ellipse(cx, cy - 1.5 * k, h.rx * 1.05, h.ry * 0.28, 0, 0, PI); c.stroke();
        c.beginPath(); c.moveTo(cx, cy - h.ry); c.lineTo(cx, cy); c.stroke(); c.setLineDash([]);
      });
    },
    crown(c, R, o, phase) { // small wooden / gold crown on the top knot (Taoist 冠) with a pin through it
      if (phase !== 'front') return;
      const h = R.head, k = R.k, col = o.color || '#9a6b3c';
      const x = h.x + h.rx * 0.12 * R.T, y = h.y - h.ry - 2.3 * k - h.rx * 0.26 * 0.35 - h.rx * 0.06;
      const w = h.rx * 0.36, hh = h.ry * 0.34;
      c.beginPath(); c.moveTo(x - w * 0.8, y + hh * 0.5); c.lineTo(x - w, y - hh * 0.5); c.quadraticCurveTo(x, y - hh * 0.8, x + w, y - hh * 0.5); c.lineTo(x + w * 0.8, y + hh * 0.5); c.quadraticCurveTo(x, y + hh * 0.75, x - w * 0.8, y + hh * 0.5); c.closePath();
      paint(c, col, x - w, y - hh, x + w, y + hh, R.lw * 0.8, 0.28, -0.2);
      seg(c, x - w * 1.7, y + hh * 0.05, x + w * 1.7, y - hh * 0.15, o.acc || '#e8dcc0', 1 * k);
      ball(c, x + w * 1.7, y - hh * 0.15, 0.9 * k, o.acc || '#e8dcc0', 0);
    },
    taoist(c, R, o, phase) { // soft black Taoist hat (混元巾-like)
      if (phase !== 'front') return;
      const h = R.head, k = R.k, col = o.color || '#23222c';
      const cx = h.x + h.rx * 0.08 * R.T, cy = h.y - h.ry * 0.62;
      c.beginPath(); c.moveTo(cx - h.rx * 1.02, cy + 1 * k); c.quadraticCurveTo(cx - h.rx * 0.95, cy - h.ry * 0.5, cx - h.rx * 0.62, cy - h.ry * 0.72); c.quadraticCurveTo(cx, cy - h.ry * 0.86, cx + h.rx * 0.62, cy - h.ry * 0.72); c.quadraticCurveTo(cx + h.rx * 0.95, cy - h.ry * 0.5, cx + h.rx * 1.02, cy + 1 * k); c.quadraticCurveTo(cx, cy + h.ry * 0.2, cx - h.rx * 1.02, cy + 1 * k); c.closePath();
      paint(c, col, cx - h.rx, cy - h.ry, cx + h.rx, cy, R.lw, 0.2, -0.2);
      if (!R.B) { const y = cy - h.ry * 0.3; c.beginPath(); c.roundRect(cx - 2.2 * k - R.T * h.rx * 0.4, y - 1.8 * k, 4.4 * k, 3.6 * k, 1 * k); paint(c, o.acc || '#d8c06a', cx - 2, y - 2, cx + 2, y + 2, R.lw * 0.5); }
    },
    scholar(c, R, o, phase) { // 儒巾 soft cap with ribbons behind
      const h = R.head, k = R.k, col = o.color || '#24232c';
      if (phase === 'pre' && !R.B) { if (R.LT) for (const d of [0, 1]) tube(c, [[h.x + h.rx * 0.8, h.y - h.ry * 0.5], [h.x + h.rx * (1.3 + d * 0.15), h.y + h.ry * (0.4 + d * 0.2)]], [1.4 * k, 1.2 * k], col, R.lw * 0.7); return; }
      if (phase !== 'front') return;
      HATS.taoist(c, R, { color: col, acc: R.S.hat.acc || shade(col, 0.15) }, 'front');
      if (R.B) for (const d of [-1, 1]) tube(c, [[h.x + d * 2 * k, h.y - h.ry * 0.3], [h.x + d * 4 * k, h.y + h.ry * 0.9]], [1.4 * k, 1.2 * k], col, R.lw * 0.7);
    },
    qing(c, R, o, phase) { // Qing soldier's conical hat with red tassel fringe (紅纓帽)
      if (phase !== 'front') return;
      HATS.douli(c, R, { color: o.color || '#3a3238', scale: 0.82 }, 'front');
      const h = R.head, k = R.k, ay = h.y - h.ry * 1.55 * 0.82, by = h.y - h.ry * 0.5;
      c.fillStyle = o.acc || '#c8282a';
      c.beginPath(); c.moveTo(h.x, ay - 1 * k);
      for (let j = 0; j <= 10; j++) { const a = PI + j * PI / 10; c.lineTo(h.x + cos(a) * h.rx * 1.05, lerp(ay, by, 0.62) + sin(a) * -h.ry * 0.06 + (j % 2) * 1.2 * k); }
      c.closePath(); c.fill(); c.strokeStyle = ol(o.acc || '#c8282a'); c.lineWidth = R.lw * 0.6; c.stroke();
      ball(c, h.x, ay, 1.8 * k, '#e8d070', R.lw * 0.6);
    },
    guard(c, R, o, phase) { // temple-guard helmet: dark dome, flaps, gold lamp emblem
      if (phase !== 'front') return;
      const h = R.head, k = R.k, col = o.color || '#2a2d3e';
      const cx = h.x + h.rx * 0.06 * R.T, cy = h.y - h.ry * 0.3;
      c.beginPath(); c.ellipse(cx, cy, h.rx + 3 * k, h.ry * 0.92, 0, PI * 0.92, PI * 2.08); c.lineTo(cx + h.rx + 3 * k, cy + h.ry * 0.6); c.lineTo(cx + h.rx * 0.75, cy + h.ry * 0.6);
      c.quadraticCurveTo(cx, cy - h.ry * 0.15, cx - h.rx * 0.75, cy + h.ry * 0.6); c.lineTo(cx - h.rx - 3 * k, cy + h.ry * 0.6); c.closePath();
      if (R.B) { c.beginPath(); c.ellipse(cx, cy, h.rx + 3 * k, h.ry * 1.05, 0, PI * 0.92, PI * 2.08); c.lineTo(cx + h.rx + 2 * k, cy + h.ry * 0.95); c.lineTo(cx - h.rx - 2 * k, cy + h.ry * 0.95); c.closePath(); }
      paint(c, col, cx - h.rx, cy - h.ry, cx + h.rx, cy + h.ry, R.lw, 0.26, -0.2);
      c.beginPath(); c.ellipse(cx, cy, h.rx + 3 * k, h.ry * 1.05, 0, PI * 0.95, PI * 2.05); stroke(c, o.acc || '#c9a24e', 1.2 * k);
      if (!R.B) { const ex = h.x - R.T * h.rx * 0.5, ey = cy - h.ry * 0.62; ell(c, ex, ey, 2 * k, 2.6 * k); paint(c, o.acc || '#c9a24e', ex - 2, ey - 2, ex + 2, ey + 2, R.lw * 0.6); circ(c, ex, ey, 1 * k); fill(c, '#7fd8ff'); }
      ball(c, cx, cy - h.ry * 1.05, 1.6 * k, o.acc || '#c9a24e', R.lw * 0.6);
    },
    ornate(c, R, o, phase) { // 歌仔戲 headdress: pearls, pompoms, golden phoenix
      if (phase !== 'front') return;
      const h = R.head, k = R.k, cx = h.x + h.rx * 0.05 * R.T, cy = h.y - h.ry * 0.62;
      c.beginPath(); c.ellipse(cx, cy, h.rx * 1.08, h.ry * 0.5, 0, PI * 1.02, PI * 1.98); c.lineTo(cx + h.rx * 0.9, cy + 2 * k); c.quadraticCurveTo(cx, cy - h.ry * 0.2, cx - h.rx * 0.9, cy + 2 * k); c.closePath();
      paint(c, o.color || '#d8b04c', cx - h.rx, cy - h.ry, cx + h.rx, cy, R.lw, 0.3, -0.2);
      for (let j = -3; j <= 3; j++) { if (R.LT && j < -1) continue; ball(c, cx + j * h.rx * 0.28, cy - h.ry * 0.3 - (3 - abs(j)) * 1.3 * k, 1.8 * k, j % 2 ? '#e83a5a' : '#3a8ae0', R.lw * 0.5, 0.35, -0.1); }
      for (let j = -4; j <= 4; j++) { if (R.LT && j < -2) continue; circ(c, cx + j * h.rx * 0.22, cy + 0.5 * k + abs(j) * 0.3 * k, 0.8 * k); fill(c, '#fbf6ee'); }
      if (!R.B) for (const sg of [-1, 1]) { if (R.LT && sg < 0) continue; const x = h.x + sg * h.rx * 1.02 - R.T * h.rx * 0.3; for (let j = 0; j < 4; j++) { circ(c, x, h.y - h.ry * 0.2 + j * 2.2 * k, 0.8 * k); fill(c, '#fbf6ee'); } ball(c, x, h.y - h.ry * 0.2 + 9 * k, 1.5 * k, '#e83a5a', R.lw * 0.4); }
    },
    bajia(c, R, o, phase) { // 八家將 headwear: black wrap, bright pompom and tassels
      if (phase !== 'front') return;
      const h = R.head, k = R.k;
      HATS.cap(c, R, { color: o.color || '#1e1c24', acc: '#d8b04c' }, 'front');
      const x = HX(R, 0), y = h.y - h.ry * 1.05;
      ball(c, x, y - 1.5 * k, 3.4 * k, o.acc || '#e8382e', R.lw * 0.6, 0.3, -0.15);
      for (let j = -1; j <= 1; j++) { const bx = HX(R, j * 0.55); ball(c, bx, h.y - h.ry * 0.62 - abs(j) * -1 * k, 1.7 * k, ['#f2c230', '#3ab06a', '#3a8ae0'][j + 1], R.lw * 0.4); }
      if (!R.B && R.T < 0.7) for (const sg of [-1, 1]) seg(c, h.x + sg * h.rx * 1.02, h.y - h.ry * 0.35, h.x + sg * h.rx * 1.08, h.y + h.ry * 0.45, '#e8382e', 1.4 * k);
    },
    giant(c, R, o, phase) { // 神將 crown with flame ornaments; horns for 順風耳
      const h = R.head, k = R.k;
      if (phase === 'pre' && o.horns) {
        for (const sg of [-1, 1]) { if (R.LT && sg < 0) continue; const x = R.LT ? h.x + h.rx * 0.2 : h.x + sg * h.rx * 0.55; tube(c, [[x, h.y - h.ry * 0.6], [x + sg * 3 * k, h.y - h.ry * 1.25], [x + sg * 1 * k, h.y - h.ry * 1.6]], [2.4 * k, 1.8 * k, 0.4 * k], o.horns, R.lw * 0.8, true, true, 0.3, -0.1); }
        return;
      }
      if (phase !== 'front') return;
      const cx = h.x + h.rx * 0.05 * R.T, cy = h.y - h.ry * 0.58, col = o.color || '#d8b04c';
      c.beginPath(); c.ellipse(cx, cy, h.rx * 1.05, h.ry * 0.36, 0, PI * 0.0, PI);
      c.lineTo(cx - h.rx * 1.05, cy - 3 * k);
      for (let j = 0; j <= 6; j++) { const x = lerp(cx - h.rx * 1.05, cx + h.rx * 1.05, j / 6); c.lineTo(x - h.rx * 0.17, cy - (j % 2 ? 4 : 9) * k - (3 - abs(j - 3)) * 1.2 * k); c.lineTo(x, cy - 3 * k); }
      c.closePath();
      paint(c, col, cx - h.rx, cy - h.ry, cx + h.rx, cy + h.ry * 0.3, R.lw, 0.3, -0.22);
      if (!R.B) { ell(c, HX(R, 0), cy + 0.5 * k, 2.6 * k, 3.2 * k); paint(c, o.acc || '#e23a3a', 0, cy - 3, 0, cy + 3, R.lw * 0.5, 0.4, -0.1); }
      for (const sg of [-1, 1]) { if (R.LT && sg < 0) continue; ball(c, R.LT ? h.x + h.rx * 0.6 : h.x + sg * h.rx * 1.05, cy + 1 * k, 2.6 * k, '#e8382e', R.lw * 0.5, 0.3, -0.15); }
    },
    peaked(c, R, o, phase) { // 19th-c. keeper's peaked cap
      if (phase !== 'front') return;
      const h = R.head, k = R.k, col = o.color || '#23304e';
      const cx = h.x + h.rx * 0.05 * R.T, cy = h.y - h.ry * 0.5;
      if (!R.B) { // visor
        const vx = R.LT ? cx - h.rx * 0.65 : cx;
        c.beginPath(); c.ellipse(vx, cy + 1.5 * k, h.rx * (R.LT ? 0.6 : 0.8), h.ry * 0.22, 0, 0, PI); c.closePath(); paint(c, '#15161c', vx - h.rx, cy, vx + h.rx, cy + 4, R.lw * 0.8);
      }
      c.beginPath(); c.moveTo(cx - h.rx * 0.95, cy + 1 * k); c.quadraticCurveTo(cx - h.rx * 1.12, cy - h.ry * 0.6, cx - h.rx * 0.4, cy - h.ry * 0.75);
      c.quadraticCurveTo(cx + h.rx * 0.5, cy - h.ry * 0.85, cx + h.rx * 1.12, cy - h.ry * 0.45); c.lineTo(cx + h.rx * 0.95, cy + 1 * k); c.quadraticCurveTo(cx, cy + h.ry * 0.12, cx - h.rx * 0.95, cy + 1 * k); c.closePath();
      paint(c, col, cx - h.rx, cy - h.ry, cx + h.rx, cy, R.lw, 0.22, -0.2);
      seg(c, cx - h.rx * 0.95, cy - 0.5 * k, cx + h.rx * 0.95, cy - 0.5 * k, '#c9a24e', 0.9 * k);
      if (!R.B) { circ(c, HX(R, 0), cy - h.ry * 0.38, 1.4 * k); fill(c, '#e0c060'); }
    },
  };

  function drawHead(c, R) {
    const S = R.S, H = S.hair, h = R.head, k = R.k;
    const hat = S.hat;
    const covers = hat && (hat.type === 'scarf' || hat.type === 'hood' || hat.type === 'veil');
    // neck
    const nk = [h.x + R.T * 0.5 * k, h.y + h.ry * 0.7];
    c.beginPath(); c.roundRect(nk[0] - h.rx * 0.22, nk[1], h.rx * 0.44, R.shY - nk[1] + 2 * k, 1.5 * k); paint(c, shade(S.skin, -0.12), nk[0] - 4, nk[1], nk[0] + 4, R.shY, R.lw * 0.8);
    if (R.B) {
      if (H.style !== 'bald') { drawKnot(c, R, H, 'pre'); }
      if (S.halo) haloBehind(c, R, S.halo);
      if (H.style !== 'bald' && !covers) {
        const box = helmetPath(c, R, H); hairPaint(c, R, H, box); hairShine(c, R, H);
        if (S.hair.ears !== false) for (const sg of [-1, 1]) { const x = h.x + sg * h.rx * 1.02, y = h.y + h.ry * 0.22; ell(c, x, y, h.rx * 0.12, h.ry * 0.2); paint(c, S.skin, x - 2, y - 2, x + 2, y + 2, R.lw * 0.8); }
      } else if (H.style === 'bald') {
        ell(c, h.x, h.y - h.ry * 0.05, h.rx * 1.02, h.ry * 1.0); paint(c, S.skin, h.x - h.rx, h.y - h.ry, h.x + h.rx, h.y + h.ry, R.lw, 0.15, -0.15);
      }
      if (hat && HATS[hat.type]) HATS[hat.type](c, R, hat, 'back');
      if (!covers) { drawKnot(c, R, H, 'post'); drawPins(c, R, H); }
      drawVines(c, R, H);
      if (hat && HATS[hat.type] && !covers) HATS[hat.type](c, R, hat, 'front');
      return;
    }
    if (S.halo) haloBehind(c, R, S.halo);
    if (hat && HATS[hat.type]) HATS[hat.type](c, R, hat, 'pre');
    if (H.style !== 'bald') {
      drawKnot(c, R, H, 'pre');
      if (!covers) { const box = helmetPath(c, R, H); hairPaint(c, R, H, box); hairShine(c, R, H); }
    }
    if (hat && covers) HATS[hat.type](c, R, hat, 'back');
    drawFace(c, R);
    if (H.style !== 'bald' && !covers) {
      drawBangs(c, R, H);
      drawLocks(c, R, H);
      drawKnot(c, R, H, 'post');
    } else if (H.style === 'bald') {
      facePath(c, R); clipDo(c, () => { c.fillStyle = rgba('#ffffff', 0.18); c.beginPath(); c.ellipse(h.x - h.rx * 0.3, h.y - h.ry * 0.62, h.rx * 0.35, h.ry * 0.18, -0.4, 0, TAU); c.fill(); });
    }
    if (S.face && S.face.mask === 'facecloth') faceCloth(c, R, S.face);
    drawVines(c, R, H);
    if (hat && HATS[hat.type]) HATS[hat.type](c, R, hat, 'front');
    drawPins(c, R, H);
  }
  function faceCloth(c, R, F) { // 澎湖 women's flower-print cloth covering cheeks & mouth against wind and sun
    const h = R.head, k = R.k, col = F.clothColor || '#d65a6a';
    const X = (u) => HX(R, u), Y = (v) => HY(R, v);
    c.beginPath(); c.moveTo(X(-1.12), Y(-0.3)); c.lineTo(X(-1.0), Y(0.42)); c.quadraticCurveTo(X(0), Y(0.36), X(1.0), Y(0.42)); c.lineTo(X(1.12), Y(-0.3));
    c.quadraticCurveTo(X(1.3), Y(1.1), X(0), Y(1.25)); c.quadraticCurveTo(X(-1.3), Y(1.1), X(-1.12), Y(-0.3)); c.closePath();
    paint(c, col, X(-1), Y(0), X(1), Y(1.2), R.lw, 0.15, -0.2);
    clipDo(c, () => { for (let y = h.y; y < h.y + h.ry * 1.4; y += 3.2 * k) for (let x = h.x - h.rx * 1.4; x < h.x + h.rx * 1.4; x += 3.6 * k) { circ(c, x + ((y / (3.2 * k)) | 0) % 2 * 1.8 * k, y, 0.8 * k); fill(c, F.clothAcc || '#f6e6a0'); } });
  }
  function haloBehind(c, R, col) {
    const h = R.head, k = R.k;
    const g = c.createRadialGradient(h.x, h.y - h.ry * 0.2, h.rx * 0.6, h.x, h.y - h.ry * 0.2, h.rx * 2);
    g.addColorStop(0, rgba(col, 0.5)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.fillRect(h.x - h.rx * 2.2, h.y - h.ry * 2.4, h.rx * 4.4, h.ry * 4.4);
    c.beginPath(); c.ellipse(h.x, h.y - h.ry * 0.25, h.rx * 1.45, h.ry * 1.45, 0, 0, TAU); stroke(c, rgba(col, 0.85), 1.6 * k);
  }

  // =================================================================================== props & weapons
  // each prop is drawn along +x from 0 (butt) to L (tip), centred on y=0; `grip` = where the hand holds it
  const PROPS = {};
  const P_ = (name, len, grip, bl, draw) => { PROPS[name] = { len, grip, bl, draw }; };
  const wood = '#7a5232', darkWood = '#4e3424', steel = '#cfd8e6';
  function stick(c, x0, x1, w, col, lw) { c.beginPath(); c.roundRect(x0, -w / 2, x1 - x0, w, w / 2); paint(c, col, 0, -w, 0, w, lw, 0.3, -0.25); }
  function tassel(c, x, y, len, col, k, dir = -1) {
    for (let j = -3; j <= 3; j++) { c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + dir * len * 0.5, y + j * 0.6 * k, x + dir * len, y + j * 1.1 * k + (j % 2) * k); stroke(c, j % 2 ? col : shade(col, -0.18), 1.1 * k); }
    ball(c, x, y, 1.2 * k, '#e2c45a', 0);
  }
  P_('sword', 38, 0.12, 1.85, (c, L, R, o) => {
    const t = R.bat ? 1.45 : 1, lw = R.lw * 0.75, k = R.k;
    if (o.tassel !== false) tassel(c, 0, 0, 7 * t, '#d0302a', k * 0.8);
    stick(c, 0, L * 0.2, 2.6 * t, '#3a2a2e', lw);
    for (let x = L * 0.04; x < L * 0.19; x += 1.6 * t) seg(c, x, -1.2 * t, x + 1 * t, 1.2 * t, rgba('#d8b04c', 0.6), 0.5 * t);
    c.beginPath(); c.roundRect(L * 0.2 - 1 * t, -3.4 * t, 2.4 * t, 6.8 * t, 1 * t); paint(c, '#d6b25a', 0, -3 * t, 0, 3 * t, lw, 0.35, -0.2);
    c.beginPath(); c.moveTo(L * 0.22 + 1.4 * t, -1.6 * t); c.lineTo(L - 4 * t, -1.45 * t); c.lineTo(L, 0); c.lineTo(L - 4 * t, 1.45 * t); c.lineTo(L * 0.22 + 1.4 * t, 1.6 * t); c.closePath();
    const g = c.createLinearGradient(0, -2 * t, 0, 2 * t); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#d4dcea'); g.addColorStop(1, '#8792a8');
    c.fillStyle = g; c.fill(); c.strokeStyle = '#59637a'; c.lineWidth = lw; c.stroke();
    seg(c, L * 0.24, 0, L - 5 * t, 0, rgba('#ffffff', 0.55), 0.5 * t);
    if (o.glow) { c.save(); c.globalCompositeOperation = 'lighter'; seg(c, L * 0.25, 0, L - 2 * t, 0, rgba(o.glow, 0.35), 4.5 * t); c.restore(); }
  });
  P_('scabbard', 38, 0.12, 1.85, (c, L, R) => { // sheathed sword (on back / hip)
    const t = R.bat ? 1.45 : 1, lw = R.lw * 0.75, k = R.k;
    tassel(c, 0, 0, 6 * t, '#d0302a', k * 0.8);
    stick(c, 0, L * 0.2, 2.6 * t, '#3a2a2e', lw);
    c.beginPath(); c.roundRect(L * 0.2 - 1 * t, -3.2 * t, 2.2 * t, 6.4 * t, 1 * t); paint(c, '#d6b25a', 0, -3 * t, 0, 3 * t, lw, 0.35, -0.2);
    c.beginPath(); c.roundRect(L * 0.22 + 1 * t, -2.1 * t, L * 0.78 - 1 * t, 4.2 * t, 2 * t); paint(c, '#2f2a38', 0, -2 * t, 0, 2 * t, lw, 0.3, -0.25);
    c.beginPath(); c.roundRect(L * 0.22 + 1 * t, -2.2 * t, 3 * t, 4.4 * t, 1 * t); paint(c, '#c9a24e', 0, -2, 0, 2, lw * 0.6, 0.3, -0.2);
    c.beginPath(); c.roundRect(L - 4 * t, -2.2 * t, 4 * t, 4.4 * t, 2 * t); paint(c, '#c9a24e', 0, -2, 0, 2, lw * 0.6, 0.3, -0.2);
  });
  P_('spear', 86, 0.42, 2.15, (c, L, R, o) => { // 紅纓槍
    const t = R.bat ? 1.4 : 1, lw = R.lw * 0.75, k = R.k;
    stick(c, 0, L * 0.86, 2.4 * t, o.shaft || '#6e3b2a', lw);
    c.beginPath(); c.roundRect(-0.5, -1.6 * t, 3.5 * t, 3.2 * t, 1 * t); paint(c, '#9aa2b2', 0, -2, 0, 2, lw * 0.6);
    // red tassel (紅纓)
    const tx = L * 0.86;
    for (let j = -4; j <= 4; j++) { c.beginPath(); c.moveTo(tx + 1 * t, 0); c.quadraticCurveTo(tx - 4 * t, j * 1.3 * t, tx - (9 + abs(j) * 0.3) * t, j * 1.9 * t + (o.sway || 0) * t); stroke(c, j % 2 ? '#e0302a' : '#b8202a', 1.5 * t); }
    c.beginPath(); c.roundRect(tx - 1 * t, -2 * t, 4.5 * t, 4 * t, 1.2 * t); paint(c, '#d6b25a', 0, -2 * t, 0, 2 * t, lw * 0.7, 0.3, -0.2);
    c.beginPath(); c.moveTo(tx + 3.4 * t, -1.6 * t); c.quadraticCurveTo(tx + 8 * t, -3.6 * t, L, 0); c.quadraticCurveTo(tx + 8 * t, 3.6 * t, tx + 3.4 * t, 1.6 * t); c.closePath();
    const g = c.createLinearGradient(0, -3 * t, 0, 3 * t); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#cdd6e4'); g.addColorStop(1, '#7d889e');
    c.fillStyle = g; c.fill(); c.strokeStyle = '#59637a'; c.lineWidth = lw; c.stroke();
    seg(c, tx + 4 * t, 0, L - 2 * t, 0, rgba('#ffffff', 0.5), 0.5 * t);
    void k;
  });
  P_('glaive', 82, 0.4, 2.0, (c, L, R) => { // 關刀-like guard glaive
    const t = R.bat ? 1.4 : 1, lw = R.lw * 0.75;
    stick(c, 0, L * 0.74, 2.6 * t, '#3a2a2a', lw);
    c.beginPath(); c.moveTo(L * 0.72, -2 * t); c.quadraticCurveTo(L * 0.86, -7 * t, L, -6 * t); c.quadraticCurveTo(L * 0.94, 0, L * 0.86, 3 * t); c.lineTo(L * 0.72, 2.6 * t); c.closePath();
    const g = c.createLinearGradient(0, -6 * t, 0, 3 * t); g.addColorStop(0, '#f6f8fc'); g.addColorStop(1, '#8a94a8'); c.fillStyle = g; c.fill(); c.strokeStyle = '#4e586c'; c.lineWidth = lw; c.stroke();
    c.beginPath(); c.roundRect(L * 0.7, -2.6 * t, 3 * t, 5.2 * t, 1 * t); paint(c, '#c9a24e', 0, -2, 0, 2, lw * 0.6);
    tassel(c, L * 0.7, 0, 7 * t, '#c8282a', t * 0.8);
  });
  P_('halberd', 104, 0.45, 1.7, (c, L, R) => { // 方天戟 for the giant figures
    const t = R.bat ? 1.4 : 1.3, lw = R.lw * 0.75;
    stick(c, 0, L * 0.86, 2.6 * t, '#8a2a2a', lw);
    c.beginPath(); c.moveTo(L * 0.84, -1.5 * t); c.lineTo(L, 0); c.lineTo(L * 0.84, 1.5 * t); c.closePath(); paint(c, steel, 0, -2, 0, 2, lw);
    for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(L * 0.8, sg * 1.5 * t); c.quadraticCurveTo(L * 0.76, sg * 8 * t, L * 0.86, sg * 9 * t); c.quadraticCurveTo(L * 0.84, sg * 4 * t, L * 0.88, sg * 1.5 * t); c.closePath(); paint(c, steel, 0, -8, 0, 8, lw); }
    tassel(c, L * 0.78, 0, 8 * t, '#e0302a', t * 0.8);
  });
  P_('staff', 72, 0.55, 2.0, (c, L, R) => { stick(c, 0, L, 2.4 * (R.bat ? 1.4 : 1), darkWood, R.lw * 0.75); });
  P_('cane', 36, 0.97, 1.6, (c, L, R) => { const t = R.bat ? 1.4 : 1; stick(c, 0, L, 2 * t, wood, R.lw * 0.7); c.beginPath(); c.arc(L, -2 * t, 2.2 * t, PI * 0.5, PI * 1.6, true); stroke(c, ol(wood), 2.6 * t); c.stroke(); stroke(c, wood, 1.6 * t); });
  P_('lstaff', 92, 0.48, 1.85, (c, L, R) => { // 夜玄's lantern staff
    const t = R.bat ? 1.4 : 1, lw = R.lw * 0.75;
    stick(c, 0, L * 0.9, 2.4 * t, '#5a3446', lw);
    for (const f of [0.3, 0.6]) seg(c, L * f, -1.3 * t, L * f, 1.3 * t, '#d6b25a', 1 * t);
    const [dx, dy] = worldDown(c);
    const hx = L * 0.97, hy = 0;
    c.beginPath(); c.moveTo(L * 0.86, 0); c.quadraticCurveTo(L * 1.02 - dx * 2 * t, -dy * 2 * t, hx + dx * 3 * t, hy + dy * 3 * t);
    stroke(c, ol('#d6b25a'), 2.6 * t); stroke(c, '#d6b25a', 1.6 * t);
    ball(c, L * 0.9, 0, 2 * t, '#d6b25a', lw * 0.6);
    const lx = hx + dx * 11 * t, ly = hy + dy * 11 * t;
    seg(c, hx + dx * 3 * t, hy + dy * 3 * t, lx - dx * 4 * t, ly - dy * 4 * t, '#d6b25a', 0.7 * t);
    c.save(); c.translate(lx, ly); c.rotate(atan2(dy, dx) - PI / 2);
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 12 * t); g.addColorStop(0, 'rgba(160,220,255,0.55)'); g.addColorStop(1, 'rgba(120,180,255,0)'); c.fillStyle = g; c.fillRect(-12 * t, -12 * t, 24 * t, 24 * t);
    c.restore();
    ell(c, 0, 0, 3.4 * t, 4.4 * t); paint(c, '#bfe6ff', -3, -4, 3, 4, lw * 0.8, 0.4, -0.2);
    seg(c, -2.6 * t, -4.3 * t, 2.6 * t, -4.3 * t, '#d6b25a', 1 * t); seg(c, -2.6 * t, 4.3 * t, 2.6 * t, 4.3 * t, '#d6b25a', 1 * t);
    c.restore();
  });
  function worldDown(c) { // world 'down' expressed in the current local frame (for things that hang)
    const m = c.getTransform();
    const det = m.a * m.d - m.b * m.c || 1;
    let x = -m.c / det, y = m.a / det;
    const l = hypot(x, y) || 1;
    return [x / l, y / l];
  }
  P_('oar', 70, 0.5, 2.0, (c, L, R, o) => { // (soul-)oar
    const t = R.bat ? 1.4 : 1, lw = R.lw * 0.75;
    stick(c, 0, L * 0.72, 2.2 * t, wood, lw);
    c.beginPath(); c.moveTo(L * 0.68, -1.4 * t); c.quadraticCurveTo(L * 0.78, -4.2 * t, L, -3.6 * t); c.quadraticCurveTo(L * 1.03, 0, L, 3.6 * t); c.quadraticCurveTo(L * 0.78, 4.2 * t, L * 0.68, 1.4 * t); c.closePath();
    paint(c, '#8a6040', L * 0.7, -4 * t, L, 4 * t, lw, 0.2, -0.2);
    if (o.soul !== false) { // painted eye + blue charm of the 引魂槳
      ell(c, L * 0.86, 0, 2.2 * t, 1.3 * t); fill(c, '#f0e6d0'); circ(c, L * 0.86, 0, 0.9 * t); fill(c, '#2a6ac0');
      const cx = L * 0.55, cy = 4 * t;
      seg(c, cx, 0, cx, cy, '#d0302a', 0.6 * t); ball(c, cx, cy + 1.5 * t, 1.6 * t, '#9fe0ff', lw * 0.5, 0.4, -0.1);
    }
  });
  P_('paddle', 46, 0.45, 2.0, (c, L, R) => PROPS.oar.draw(c, L, R, { soul: false }));
  P_('pestle', 46, 0.5, 1.8, (c, L, R) => { // 邵族 杵 (millet pestle)
    const t = R.bat ? 1.4 : 1, lw = R.lw * 0.75;
    c.beginPath(); c.moveTo(0, -3.2 * t); c.quadraticCurveTo(L * 0.25, -3.4 * t, L * 0.4, -1.8 * t); c.lineTo(L * 0.6, -1.8 * t); c.quadraticCurveTo(L * 0.75, -3.4 * t, L, -3.2 * t);
    c.lineTo(L, 3.2 * t); c.quadraticCurveTo(L * 0.75, 3.4 * t, L * 0.6, 1.8 * t); c.lineTo(L * 0.4, 1.8 * t); c.quadraticCurveTo(L * 0.25, 3.4 * t, 0, 3.2 * t); c.closePath();
    paint(c, '#9a7048', 0, -3, 0, 3, lw, 0.25, -0.25);
  });
  P_('flag', 62, 0.3, 1.8, (c, L, R) => { // 進香旗 pilgrim flag
    const t = R.bat ? 1.4 : 1, lw = R.lw * 0.7, k = R.k;
    stick(c, 0, L, 1.6 * t, '#6a4a2a', lw);
    c.beginPath(); c.moveTo(L * 0.95, 0); c.lineTo(L * 0.55, 0); c.lineTo(L * 0.76, 13 * t); c.closePath();
    paint(c, '#f0c83a', L * 0.6, 0, L, 12 * t, lw, 0.2, -0.15);
    clipDo(c, () => { c.strokeStyle = '#d0302a'; c.lineWidth = 2.4 * t; c.stroke(); });
    seg(c, L * 0.72, 3 * t, L * 0.72, 6.5 * t, '#c0282a', 0.9 * t);
    for (let j = 0; j < 3; j++) seg(c, L * (0.58 + j * 0.13), 0, L * (0.58 + j * 0.13), -2.5 * t, '#d0302a', 1 * t);
    ball(c, L, 0, 1.6 * t, '#e2c45a', lw * 0.5); void k;
  });
  P_('rod', 70, 0.08, 1.5, (c, L, R) => { const t = R.bat ? 1.4 : 1; stick(c, 0, L * 0.18, 2 * t, '#4a3a2a', R.lw * 0.6); c.beginPath(); c.moveTo(L * 0.18, 0); c.quadraticCurveTo(L * 0.6, 0, L, 2 * t); stroke(c, '#b8a070', 1.1 * t); c.beginPath(); c.moveTo(L, 2 * t); c.lineTo(L + 1, 14 * t); stroke(c, rgba('#ffffff', 0.5), 0.5); });
  P_('axe', 26, 0.2, 1.7, (c, L, R) => { const t = R.bat ? 1.4 : 1, lw = R.lw * 0.7; stick(c, 0, L, 2.2 * t, wood, lw); c.beginPath(); c.moveTo(L * 0.72, -1 * t); c.lineTo(L * 0.66, -7 * t); c.quadraticCurveTo(L * 0.86, -8 * t, L * 0.98, -5 * t); c.lineTo(L * 0.92, -1 * t); c.closePath(); paint(c, '#a8b0bc', 0, -8, 0, 0, lw); });
  P_('pick', 26, 0.2, 1.7, (c, L, R) => { const t = R.bat ? 1.4 : 1, lw = R.lw * 0.7; stick(c, 0, L, 2.2 * t, wood, lw); c.beginPath(); c.moveTo(L * 0.95, -1 * t); c.quadraticCurveTo(L * 0.7, -6 * t, L * 0.45, -8 * t); c.lineTo(L * 0.92, -2.2 * t); c.quadraticCurveTo(L * 1.2, -4 * t, L * 1.4, -8 * t); c.quadraticCurveTo(L * 1.2, -2 * t, L * 1.0, 1 * t); c.closePath(); paint(c, '#8a929e', L * 0.5, -8, L * 1.4, 0, lw); });
  P_('hoe', 44, 0.4, 1.7, (c, L, R) => { const t = R.bat ? 1.4 : 1, lw = R.lw * 0.7; stick(c, 0, L, 2 * t, wood, lw); c.beginPath(); c.moveTo(L, -1 * t); c.lineTo(L + 1 * t, 8 * t); c.lineTo(L - 6 * t, 9 * t); c.lineTo(L - 2 * t, 1 * t); c.closePath(); paint(c, '#8a929e', L - 6, 0, L, 9, lw); });
  P_('broom', 40, 0.4, 1.7, (c, L, R) => { const t = R.bat ? 1.4 : 1, lw = R.lw * 0.7; stick(c, 0, L * 0.7, 1.8 * t, '#8a6a3a', lw); c.beginPath(); c.moveTo(L * 0.68, -1.5 * t); c.lineTo(L, -5 * t); c.lineTo(L, 5 * t); c.lineTo(L * 0.68, 1.5 * t); c.closePath(); paint(c, '#c8a860', L * 0.7, -5, L, 5, lw); });
  P_('bow', 40, 0.5, 1.7, (c, L, R) => { const t = R.bat ? 1.4 : 1; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(L / 2, -10 * t, L, 0); stroke(c, ol('#7a4a2a'), 2.6 * t); stroke(c, '#7a4a2a', 1.6 * t); seg(c, 0, 0, L, 0, '#e8e0c8', 0.5 * t); });
  P_('saber', 30, 0.12, 1.85, (c, L, R) => { const t = R.bat ? 1.4 : 1, lw = R.lw * 0.7; stick(c, 0, L * 0.2, 2.4 * t, '#3a2a2a', lw); c.beginPath(); c.moveTo(L * 0.2, -1.6 * t); c.quadraticCurveTo(L * 0.7, -2.4 * t, L, -4.5 * t); c.quadraticCurveTo(L * 0.8, 1 * t, L * 0.2, 1.6 * t); c.closePath(); paint(c, steel, 0, -3, 0, 2, lw); });
  P_('pipe', 20, 0.15, 1.7, (c, L, R) => { const t = R.bat ? 1.4 : 1; seg(c, 0, 0, L, 0, ol('#6a4a30'), 2.2 * t); seg(c, 0, 0, L, 0, '#8a6038', 1.3 * t); c.beginPath(); c.roundRect(L - 1 * t, -3.6 * t, 3 * t, 4.6 * t, 1 * t); paint(c, '#4a3a2a', L, -3, L + 3, 1, R.lw * 0.5); circ(c, L + 0.5 * t, -4.5 * t, 1.2 * t); fill(c, 'rgba(255,140,60,0.8)'); for (let j = 0; j < 3; j++) { circ(c, L + (1 + j * 1.5) * t, -(7 + j * 3) * t, (1 + j * 0.5) * t); fill(c, `rgba(230,230,240,${0.4 - j * 0.1})`); } });
  P_('lantern', 14, 0.0, 1.6, (c, L, R, o) => { // red paper lantern hanging from a short stick (prop drawn pointing down)
    const t = R.bat ? 1.4 : 1, lw = R.lw * 0.7, col = o.color || '#d83a2e';
    seg(c, -3 * t, 0, 3 * t, 0, '#6a4a2a', 1.2 * t);
    seg(c, 0, 0, L * 0.35, 0, '#3a2a20', 0.6 * t);
    const cx = L * 0.35 + 5 * t;
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(cx, 0, 0, cx, 0, 11 * t); g.addColorStop(0, rgba(o.glow || '#ffb060', 0.45)); g.addColorStop(1, rgba(o.glow || '#ffb060', 0)); c.fillStyle = g; c.fillRect(cx - 11 * t, -11 * t, 22 * t, 22 * t);
    c.restore();
    ell(c, cx, 0, 5 * t, 4.2 * t); paint(c, col, cx - 5 * t, -4 * t, cx + 5 * t, 4 * t, lw, 0.35, -0.2);
    for (const f of [-0.5, 0, 0.5]) { c.beginPath(); c.ellipse(cx, 0, 5 * t, 4.2 * t * abs(f) + 0.01, 0, -PI / 2, PI / 2); stroke(c, rgba(shade(col, -0.4), 0.5), 0.5 * t); }
    seg(c, cx - 5 * t, -2.6 * t, cx - 5 * t, 2.6 * t, '#2a2020', 1.4 * t); seg(c, cx + 5 * t, -2.6 * t, cx + 5 * t, 2.6 * t, '#2a2020', 1.4 * t);
    seg(c, cx + 5.5 * t, 0, cx + 9 * t, 0, o.tassel || '#e8c050', 0.8 * t);
  });
  P_('oillamp', 14, 0.0, 1.6, (c, L, R) => { // 19th-c. hurricane lamp
    const t = R.bat ? 1.4 : 1, lw = R.lw * 0.7, cx = L * 0.3 + 5 * t;
    c.beginPath(); c.arc(0, 0, 0.1, 0, 1); seg(c, 0, 0, cx - 4 * t, 0, '#3a3a40', 0.8 * t);
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(cx, 0, 0, cx, 0, 13 * t); g.addColorStop(0, 'rgba(255,220,140,0.5)'); g.addColorStop(1, 'rgba(255,200,120,0)'); c.fillStyle = g; c.fillRect(cx - 13 * t, -13 * t, 26 * t, 26 * t);
    c.restore();
    ell(c, cx, 0, 3.6 * t, 2.8 * t); paint(c, '#fff0c0', cx - 3, -3, cx + 3, 3, lw, 0.4, -0.1);
    c.beginPath(); c.roundRect(cx - 4.4 * t, -3.4 * t, 1.6 * t, 6.8 * t, 0.5 * t); paint(c, '#3a3a44', 0, -3, 0, 3, lw * 0.6);
    c.beginPath(); c.roundRect(cx + 3.6 * t, -3.4 * t, 2 * t, 6.8 * t, 0.5 * t); paint(c, '#3a3a44', 0, -3, 0, 3, lw * 0.6);
  });
  P_('fan', 13, 0.0, 1.9, (c, L, R, o) => { // folding fan: open (o.open) or closed
    const t = R.bat ? 1.4 : 1, lw = R.lw * 0.7;
    if (!o.open) { c.beginPath(); c.moveTo(0, -1 * t); c.lineTo(L, -1.8 * t); c.lineTo(L, 1.8 * t); c.lineTo(0, 1 * t); c.closePath(); paint(c, '#5a3a2a', 0, -2, 0, 2, lw); seg(c, L * 0.3, 0, L, 0, rgba('#f0e6d0', 0.6), 0.8 * t); return; }
    const a0 = -0.95, a1 = 0.95;
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, L, a0, a1); c.closePath(); paint(c, o.paper || '#f2ead6', 0, -L, L, L, lw, 0.1, -0.12);
    clipDo(c, () => {
      c.fillStyle = rgba('#2a2a3a', 0.55); c.beginPath(); c.moveTo(L * 0.55, L * 0.3); c.lineTo(L * 0.75, -L * 0.05); c.lineTo(L * 0.85, L * 0.15); c.lineTo(L * 0.95, -L * 0.25); c.lineTo(L * 1.1, L * 0.3); c.closePath(); c.fill();
      if (o.mark) { circ(c, L * 0.75, -L * 0.45, L * 0.08); fill(c, '#c0302a'); }
    });
    c.beginPath(); c.arc(0, 0, L * 0.3, a0, a1); stroke(c, rgba('#5a3a2a', 0.7), 0.6 * t);
    for (let j = 0; j <= 8; j++) { const a = lerp(a0, a1, j / 8); seg(c, 0, 0, cos(a) * L * 0.32, sin(a) * L * 0.32, '#5a3a2a', 0.7 * t); }
  });
  P_('ffan', 14, 0.0, 1.9, (c, L, R) => { // black crow-feather fan
    const t = R.bat ? 1.4 : 1, lw = R.lw * 0.6;
    stick(c, -4 * t, 2 * t, 1.6 * t, '#3a2a2a', lw);
    for (let j = -4; j <= 4; j++) { const a = j * 0.2; c.save(); c.rotate(a); c.beginPath(); c.ellipse(L * 0.6, 0, L * 0.5, 2.4 * t, 0, 0, TAU); paint(c, j % 2 ? '#2a2632' : '#1c1a24', 0, -2, L, 2, lw, 0.3, -0.1); seg(c, 2 * t, 0, L * 1.05, 0, rgba('#8a7aa8', 0.5), 0.5 * t); c.restore(); }
  });
  P_('whisk', 16, 0.0, 1.9, (c, L, R) => { // 拂塵
    const t = R.bat ? 1.4 : 1;
    stick(c, 0, L * 0.6, 1.8 * t, '#8a5a3a', R.lw * 0.6);
    for (let j = -4; j <= 4; j++) { c.beginPath(); c.moveTo(L * 0.6, 0); c.quadraticCurveTo(L * 0.8, j * 0.8 * t, L * 0.75 + 12 * t, j * 1.5 * t + 8 * t); stroke(c, j % 2 ? '#f6f4f0' : '#dcd8d0', 1 * t); }
  });
  P_('flute', 26, 0.3, 1.9, (c, L, R, o) => { // jade flute 玉笛
    const t = R.bat ? 1.4 : 1, lw = R.lw * 0.7;
    c.beginPath(); c.roundRect(0, -1.3 * t, L, 2.6 * t, 1.3 * t);
    const g = c.createLinearGradient(0, -1.3 * t, 0, 1.3 * t); g.addColorStop(0, '#dff8ec'); g.addColorStop(0.5, '#86d0b0'); g.addColorStop(1, '#3f9478');
    c.fillStyle = g; c.fill(); c.strokeStyle = '#2f6e5a'; c.lineWidth = lw; c.stroke();
    for (let j = 0; j < 6; j++) { circ(c, L * (0.35 + j * 0.09), -0.2 * t, 0.45 * t); fill(c, '#235a48'); }
    for (const x of [0.06, 0.94]) seg(c, L * x, -1.3 * t, L * x, 1.3 * t, '#e8d070', 0.8 * t);
    if (o.tassel !== false) { seg(c, 1 * t, 0, -1 * t, 5 * t, '#d0302a', 0.7 * t); ball(c, -1.2 * t, 6 * t, 1.1 * t, '#e0302a', 0); }
  });
  P_('talisman', 9, 0.1, 1.9, (c, L, R) => { // yellow paper charm with red script
    const t = R.bat ? 1.4 : 1;
    c.beginPath(); c.rect(0, -2.4 * t, L, 4.8 * t); paint(c, '#f2d04a', 0, -2, L, 2, R.lw * 0.5, 0.2, -0.1);
    c.beginPath(); c.moveTo(L * 0.15, 0); for (let j = 1; j < 6; j++) c.lineTo(L * (0.15 + j * 0.14), (j % 2 ? -1.2 : 1.2) * t); stroke(c, '#c8202a', 0.7 * t);
    circ(c, L * 0.88, 0, 0.9 * t); stroke(c, '#c8202a', 0.5 * t);
  });
  P_('book', 9, 0.3, 1.7, (c, L, R) => { const t = R.bat ? 1.4 : 1; c.beginPath(); c.roundRect(0, -3.4 * t, L, 6.8 * t, 0.6 * t); paint(c, '#3a5a8a', 0, -3, L, 3, R.lw * 0.6); seg(c, L * 0.7, -3.2 * t, L * 0.7, 3.2 * t, '#e8e0c8', 0.8 * t); });
  P_('abacus', 11, 0.2, 1.7, (c, L, R) => { const t = R.bat ? 1.4 : 1; c.beginPath(); c.roundRect(0, -3.6 * t, L, 7.2 * t, 0.6 * t); paint(c, '#5a3a2a', 0, -3, L, 3, R.lw * 0.6); for (let x = 1.6; x < L - 1; x += 1.8) for (const y of [-2, 0.5, 2.2]) { circ(c, x * t / t, y * t, 0.6 * t); fill(c, '#d8b070'); } });
  P_('incense', 12, 0.1, 1.7, (c, L, R) => { const t = R.bat ? 1.4 : 1; for (const d of [-1.2, 0, 1.2]) { seg(c, 0, d * t * 0.6, L, d * t, '#c06a3a', 0.7 * t); circ(c, L, d * t, 0.7 * t); fill(c, '#ffb050'); } for (let j = 0; j < 3; j++) { circ(c, L + (2 + j * 2.4) * t, -(1 + j * 1.8) * t, (0.8 + j * 0.4) * t); fill(c, `rgba(230,230,240,${0.35 - j * 0.08})`); } });
  P_('basket', 10, 0.0, 1.7, (c, L, R, o) => { // round woven basket held by its rim
    const t = R.bat ? 1.4 : 1, cx = 5 * t;
    c.beginPath(); c.moveTo(cx - 6 * t, -1 * t); c.lineTo(cx + 6 * t, -1 * t); c.quadraticCurveTo(cx + 5.5 * t, 7 * t, cx, 7 * t); c.quadraticCurveTo(cx - 5.5 * t, 7 * t, cx - 6 * t, -1 * t); c.closePath();
    paint(c, o.color || '#b88a4a', cx - 6, -1, cx + 6, 7, R.lw * 0.7);
    clipDo(c, () => { for (let y = 0; y < 8 * t; y += 1.6 * t) seg(c, cx - 7 * t, y, cx + 7 * t, y, rgba('#5a3a1a', 0.35), 0.5 * t); });
    if (o.fill) { ell(c, cx, -1 * t, 6 * t, 1.6 * t); fill(c, o.fill); }
  });
  P_('tray', 12, 0.0, 1.7, (c, L, R) => { const t = R.bat ? 1.4 : 1; ell(c, 6 * t, 0, 7 * t, 2.2 * t); paint(c, '#7a4a2a', 0, -2, 12, 2, R.lw * 0.6); for (const d of [-2.5, 2]) { c.beginPath(); c.roundRect(6 * t + d * t - 1.2 * t, -3 * t, 2.4 * t, 2.4 * t, 0.6 * t); paint(c, '#f0ece0', 0, -3, 0, 0, R.lw * 0.4); } });
  P_('medbox', 10, 0.0, 1.7, (c, L, R) => { const t = R.bat ? 1.4 : 1; seg(c, 0, 0, 3 * t, 0, '#3a2a20', 0.8 * t); c.beginPath(); c.roundRect(3 * t, -4 * t, 8 * t, 8 * t, 1 * t); paint(c, '#8a5a32', 3, -4, 11, 4, R.lw * 0.6); seg(c, 7 * t, -2 * t, 7 * t, 2 * t, '#e8d8b0', 1 * t); seg(c, 5 * t, 0, 9 * t, 0, '#e8d8b0', 1 * t); });
  P_('yueqin', 22, 0.3, 1.7, (c, L, R) => { // 月琴 moon lute
    const t = R.bat ? 1.4 : 1, lw = R.lw * 0.7;
    stick(c, 0, L * 0.6, 2.2 * t, '#5a3a2a', lw);
    ball(c, L * 0.62 + 6 * t, 0, 7 * t, '#b8783a', lw, 0.25, -0.2);
    circ(c, L * 0.62 + 6 * t, 0, 5 * t); stroke(c, rgba('#5a3a1a', 0.45), 0.6 * t);
    for (const d of [-1, 1]) seg(c, 0, d * 0.5 * t, L * 0.62 + 10 * t, d * 0.8 * t, rgba('#f0e6c8', 0.7), 0.35 * t);
    c.beginPath(); c.roundRect(-2 * t, -1.8 * t, 3 * t, 3.6 * t, 0.8 * t); paint(c, '#4a2a1a', 0, -2, 0, 2, lw * 0.6);
  });
  P_('plaque', 12, 0.1, 1.8, (c, L, R) => { const t = R.bat ? 1.4 : 1; stick(c, 0, L * 0.4, 1.6 * t, '#5a3a2a', R.lw * 0.6); c.beginPath(); c.roundRect(L * 0.4, -3.6 * t, L * 0.62, 7.2 * t, 1 * t); paint(c, '#d8b04c', L * 0.4, -3, L, 3, R.lw * 0.6, 0.3, -0.2); seg(c, L * 0.55, 0, L * 0.9, 0, '#b0282a', 1.4 * t); });
  P_('grass', 16, 0.2, 1.7, (c, L, R) => { const t = R.bat ? 1.4 : 1; for (let j = -2; j <= 2; j++) { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(L * 0.6, j * 1.2 * t, L, j * 2.6 * t - 2 * t); stroke(c, j % 2 ? '#c8c098' : '#a8a070', 0.9 * t); } c.beginPath(); c.arc(L * 0.25, 0, 1.6 * t, 0, TAU); stroke(c, '#8a8050', 0.8 * t); });
  P_('fiber', 12, 0.2, 1.7, (c, L, R) => { const t = R.bat ? 1.4 : 1; for (let j = -3; j <= 3; j++) { c.beginPath(); c.moveTo(0, j * 0.4 * t); c.quadraticCurveTo(L * 0.5, j * 1 * t, L, j * 1.6 * t + 3 * t); stroke(c, j % 2 ? '#e2d6a8' : '#c8b884', 0.9 * t); } });
  P_('beads', 8, 0.0, 1.7, (c, L, R) => { const t = R.bat ? 1.4 : 1; for (let j = 0; j < 10; j++) { const a = j / 10 * TAU; circ(c, 4 * t + cos(a) * 3 * t, 3 * t + sin(a) * 3.5 * t, 0.8 * t); fill(c, '#5a3a2a'); } });
  P_('jar', 8, 0.0, 1.7, (c, L, R) => { const t = R.bat ? 1.4 : 1; ell(c, 3 * t, 0, 3.4 * t, 3.8 * t); paint(c, '#e8e2d2', 0, -3, 6, 4, R.lw * 0.6, 0.3, -0.2); c.beginPath(); c.roundRect(1.6 * t, -5.6 * t, 2.8 * t, 2.2 * t, 0.5 * t); paint(c, '#c0302a', 0, -6, 0, -3, R.lw * 0.5); });
  P_('gourd', 8, 0.0, 1.7, (c, L, R) => { const t = R.bat ? 1.4 : 1; ball(c, 0, 5.4 * t, 3.6 * t, '#d8a24a', R.lw * 0.6, 0.3, -0.2); ball(c, 0, 0.6 * t, 2.4 * t, '#d8a24a', R.lw * 0.6, 0.3, -0.2); seg(c, -2.2 * t, 2.6 * t, 2.2 * t, 2.6 * t, '#c0302a', 1 * t); });
  function propLen(R, type, o) {
    const P = PROPS[type];
    return ((o && o.len) || P.len) * (R.bat ? P.bl : 1) * (R.S.propScale || 1);
  }
  function drawProp(c, R, type, x, y, ang, o = {}) {
    const P = PROPS[type];
    if (!P) return;
    const L = propLen(R, type, o);
    c.save(); c.translate(x, y); c.rotate(ang);
    if (o.flipY) c.scale(1, -1);
    c.translate(-L * (o.grip != null ? o.grip : P.grip), 0);
    P.draw(c, L, R, o);
    c.restore();
  }

  // =================================================================================== hip & back items
  function hipItems(c, R) {
    const S = R.S, k = R.k, P = R.P;
    if (!S.hip) return;
    const sg = R.B ? -1 : 1;
    let n = 0;
    for (const it of S.hip) {
      const x = R.LT ? (n ? -2 * k : 2.5 * k) : sg * (P.hw * 0.95 * R.WF + (n ? -3 : 1) * k) * (n ? -1 : 1);
      const y = R.hipY - 1 * k;
      if (it === 'gourd') drawProp(c, R, 'gourd', x + sg * 0.5 * k, y, 0);
      else if (it === 'flute') drawProp(c, R, 'flute', x, y - 3 * k, R.LT ? -0.5 : sg * -0.9, { grip: 0.5, tassel: true });
      else if (it === 'fan') drawProp(c, R, 'fan', x - sg * 1 * k, y - 4 * k, R.LT ? -1.1 : -1.3);
      else if (it === 'pouch' || it === 'lamp') {
        const col = it === 'lamp' ? '#5a5a62' : '#c0302a';
        seg(c, x, y - 2 * k, x, y + 1 * k, '#3a2a20', 0.7 * k);
        c.beginPath(); c.roundRect(x - 2.4 * k, y + 1 * k, 4.8 * k, 5 * k, 1.6 * k); paint(c, col, x - 2, y, x + 2, y + 6, R.lw * 0.7, 0.25, -0.2);
        if (it === 'lamp') { circ(c, x, y + 3.5 * k, 1.2 * k); fill(c, '#ffd27a'); }
      } else if (it === 'knife') {
        drawProp(c, R, 'scabbard', x - sg * 2 * k, y - 1 * k, R.LT ? 2.6 : (sg > 0 ? 2.1 : 1.0), { len: 16 });
      } else if (it === 'sword') {
        if (!R.B) drawProp(c, R, 'scabbard', R.LT ? 4 * k : x - sg * 6 * k, y - 1 * k, R.LT ? 2.75 : (sg > 0 ? 2.5 : 0.65));
      } else if (it === 'jade') {
        seg(c, x, y, x, y + 4 * k, '#c0302a', 0.7 * k);
        c.beginPath(); c.roundRect(x - 1.6 * k, y + 4 * k, 3.2 * k, 4 * k, 0.8 * k); paint(c, '#8fd4b0', x - 2, y + 4, x + 2, y + 8, R.lw * 0.6, 0.3, -0.2);
        seg(c, x, y + 8 * k, x, y + 11 * k, '#c0302a', 0.8 * k);
      } else if (it === 'creel') drawProp(c, R, 'basket', x - sg * 4 * k, y, 0, { color: '#a8844a' });
      n++;
    }
  }
  function backItems(c, R, phase) { // phase: 'behind' (front/side views) or 'over' (back view)
    const S = R.S, k = R.k, P = R.P;
    const it = S.back;
    if (!it) return;
    if (R.bat && R.pose.w && (it === S.weapon || (it === 'sword' && S.weapon === 'sword'))) return; // weapon is in hand
    const B = R.B, sh = R.shY, hp = R.hipY;
    if (it === 'sword') {
      if (B) drawProp(c, R, 'scabbard', P.sw * 0.95, sh - 8 * k, 2.2);
      else if (R.LT) drawProp(c, R, 'scabbard', 5 * k, sh - 7 * k, 1.95);
      else drawProp(c, R, 'scabbard', -P.sw * 0.95, sh - 8 * k, 0.95);
    } else if (it === 'spear') {
      const L = propLen(R, 'spear');
      if (B) drawProp(c, R, 'spear', -P.sw * 0.2, (sh + hp) / 2, -PI / 2 - 0.4, { grip: 0.5 });
      else if (R.LT) drawProp(c, R, 'spear', 3 * k, (sh + hp) / 2, -PI / 2 + 0.38, { grip: 0.5 });
      else drawProp(c, R, 'spear', P.sw * 0.2, (sh + hp) / 2, -PI / 2 + 0.4, { grip: 0.5 });
      void L;
    } else if (it === 'basket' || it === 'herbs') {
      const x = R.LT ? 8 * k : 0, y = sh + 6 * k, w = P.sw * (R.LT ? 0.75 : 1.05), h = 16 * k;
      if (!B && !R.LT) { // just the rim peeks over the shoulders
        c.beginPath(); c.ellipse(x, sh - 1.5 * k, w, 3 * k, 0, PI, TAU); c.closePath(); paint(c, '#b08448', x - w, sh - 4, x + w, sh, R.lw * 0.8);
        if (it === 'herbs') for (let j = -2; j <= 2; j++) { ell(c, x + j * w * 0.35, sh - 4 * k - abs(j) * -0.5 * k, 2.4 * k, 1.4 * k, j * 0.5); paint(c, j % 2 ? '#6a9a4a' : '#4f8a3a', x - 2, sh - 6, x + 2, sh - 2, R.lw * 0.5); }
        return;
      }
      c.beginPath(); c.moveTo(x - w, y - h * 0.5); c.lineTo(x + w, y - h * 0.5); c.lineTo(x + w * 0.75, y + h * 0.55); c.quadraticCurveTo(x, y + h * 0.65, x - w * 0.75, y + h * 0.55); c.closePath();
      paint(c, '#b08448', x - w, y - h, x + w, y + h, R.lw);
      clipDo(c, () => { for (let yy = y - h; yy < y + h; yy += 2.2 * k) seg(c, x - w * 1.2, yy, x + w * 1.2, yy, rgba('#5a3a1a', 0.3), 0.6 * k); for (let xx = x - w; xx < x + w; xx += 3 * k) seg(c, xx, y - h, xx, y + h, rgba('#5a3a1a', 0.2), 0.5 * k); });
      if (it === 'herbs') for (let j = -2; j <= 2; j++) { ell(c, x + j * w * 0.35, y - h * 0.55 - 1.5 * k, 2.6 * k, 1.6 * k, j * 0.5); paint(c, j % 2 ? '#6a9a4a' : '#4f8a3a', x - 2, y - h, x + 2, y - h + 3, R.lw * 0.5); }
      else { ell(c, x, y - h * 0.5, w, 2.2 * k); paint(c, '#c89a58', x - w, y - h, x + w, y - h + 3, R.lw * 0.6); }
    } else if (it === 'bundle') { // firewood bundle
      const x = R.LT ? 7 * k : 0, y = sh + 4 * k;
      for (let j = -3; j <= 3; j++) tube(c, [[x + j * 2 * k - 8 * k, y - 8 * k + abs(j) * 0.5 * k], [x + j * 2 * k + 8 * k, y + 10 * k - abs(j) * 0.5 * k]], [1.3 * k, 1.3 * k], j % 2 ? '#8a6a44' : '#a07c50', R.lw * 0.6);
      seg(c, x - 5 * k, y - 3 * k, x + 4 * k, y + 6 * k, '#c8b080', 1.2 * k);
    } else if (it === 'quiver') {
      const x = B ? -P.sw * 0.5 : (R.LT ? 6 * k : P.sw * 0.6), y = sh + 4 * k;
      c.save(); c.translate(x, y); c.rotate(B ? 0.35 : -0.35);
      for (let j = -1; j <= 1; j++) seg(c, j * 1.4 * k, -10 * k, j * 1.4 * k, -15 * k, '#e8e0d0', 1.2 * k);
      c.beginPath(); c.roundRect(-3 * k, -10 * k, 6 * k, 20 * k, 2 * k); paint(c, '#7a5232', -3, -10, 3, 10, R.lw * 0.8);
      c.restore();
    } else if (it === 'umbrella') drawProp(c, R, 'staff', R.LT ? 6 * k : P.sw * 0.6, sh, -PI / 2 + 0.3, { len: 40, grip: 0.4 });
  }

  // =================================================================================== humanoid render
  function upper(c, R, fn) {
    c.save();
    if (R.LT && R.lean) { c.translate(0, R.hipY); c.rotate(-R.lean); c.translate(0, -R.hipY); }
    fn();
    c.restore();
  }
  function heldDraw(c, R, A) { // map-held item in this arm's hand
    const S = R.S, it = S.held;
    if (!it || !PROPS[it]) return;
    const k = R.k, [x, y] = [A.w[0], A.w[1]];
    const sg = R.LT ? -1 : (R.B ? -1 : 1);
    const long = { staff: 1, lstaff: 1, oar: 1, spear: 1, glaive: 1, halberd: 1, flag: 1, pestle: 1, paddle: 1, hoe: 1, broom: 1 };
    if (long[it]) {
      const ang = R.LT ? -PI / 2 - 0.2 : -PI / 2 + sg * 0.06;
      const L = propLen(R, it);
      drawProp(c, R, it, x, y + 1 * k, ang, { grip: clamp((-y - 2) / L, 0.12, 0.8) });
    } else if (it === 'cane') drawProp(c, R, 'cane', x, y, -PI / 2 + (R.LT ? -0.22 : sg * 0.1), { grip: clamp(1 - (-y - 1) / propLen(R, 'cane'), 0, 0.97) });
    else if (it === 'lantern' || it === 'oillamp') drawProp(c, R, it, x, y, PI / 2);
    else if (it === 'basket') drawProp(c, R, 'basket', x - 5 * k, y + 1 * k, 0);
    else if (it === 'medbox') drawProp(c, R, 'medbox', x, y, PI / 2);
    else if (it === 'yueqin') drawProp(c, R, 'yueqin', x, y, R.LT ? -2.4 : -PI / 2 - sg * 0.9);
    else if (it === 'rod') drawProp(c, R, 'rod', x, y, R.LT ? -2.2 : -PI / 2 + sg * 0.5);
    else if (it === 'axe' || it === 'pick' || it === 'saber' || it === 'sword') drawProp(c, R, it === 'sword' ? 'scabbard' : it, x, y, PI / 2 + (R.LT ? 0.6 : sg * -0.3), { grip: 0.12 });
    else if (it === 'pipe') drawProp(c, R, 'pipe', x, y, R.LT ? -2.3 : -PI / 2 + sg * 0.6);
    else if (it === 'bow') drawProp(c, R, 'bow', x, y, -PI / 2 + (R.LT ? -0.1 : 0));
    else drawProp(c, R, it, x, y, R.LT ? -2.3 : -PI / 2 + sg * 0.75);
  }
  function weaponDraw(c, R) {
    const W = R.pose.w;
    if (!W || !W.type) return;
    const h = R.arms[W.hand != null ? W.hand : 1].w;
    drawProp(c, R, W.type, h[0], h[1], W.ang * D, W);
    if (W.type2) drawProp(c, R, W.type2, R.arms[0].w[0], R.arms[0].w[1], (W.ang2 || 0) * D, W.o2 || {});
  }
  function drawHuman(c, S, R) {
    const v = R.view, H = S.hair;
    H.sway = R.pose.sway || 0;
    if (S.glow) {
      const g = c.createRadialGradient(0, R.shY, 0, 0, R.shY, -R.head.y * 0.7);
      g.addColorStop(0, rgba(S.glow, 0.3)); g.addColorStop(0.6, rgba(S.glow, 0.1)); g.addColorStop(1, rgba(S.glow, 0));
      const gr = -R.head.y * 0.7;
      c.fillStyle = g; c.fillRect(-gr, R.shY - gr, gr * 2, gr * 2);
    }
    const holdArm = R.LT ? (S.armPose ? 0 : 1) : R.B ? 0 : 1;
    const armFn = (i, dim) => drawArm(c, R, i, dim, () => {
      if (R.pose.w && (R.pose.w.hand != null ? R.pose.w.hand : 1) === i) weaponDraw(c, R);
      else if (!R.pose.w && !R.bat && i === holdArm) heldDraw(c, R, R.arms[i]);
      if (R.pose.item && i === 1) drawProp(c, R, R.pose.item, R.arms[1].w[0], R.arms[1].w[1] - 2 * R.k, -PI / 2, {});
    });
    const legs = () => {
      if (R.LT) { drawLeg(c, R, 0, true); drawLeg(c, R, 1, false); } else { drawLeg(c, R, 0, false); drawLeg(c, R, 1, false); }
    };
    const lower = () => {
      if (S.skirt) drawSkirt(c, R, S.skirt, true);
      if ((S.top.len || 0) > 0.35) drawSkirt(c, R, { color: S.top.color, len: S.top.len, flare: S.top.flare, trim: S.top.trim, bands: S.top.lowBands, overlap: S.top.closure === 'cross', stripes: S.top.lowStripes }, true);
    };
    const body = () => {
      drawTorso(c, R);
      if (S.kasaya) drawKasaya(c, R, S.kasaya);
      if (S.armor) drawArmor(c, R, S.armor);
      if (S.vest) drawVest(c, R, S.vest);
      if (S.chest) drawChest(c, R, S.chest);
      if (S.beads && !S.beadsOver) drawBeads(c, R, S.beads);
      if (S.patch) drawPatch(c, R, S.patch);
      if (S.bag) drawBagStrap(c, R, S.bag);
      if (S.sash) drawSash(c, R, S.sash, false);
      if (S.belt) drawSash(c, R, S.belt, true);
      if (S.apron) drawApron(c, R, S.apron);
      if (S.bag) drawBag(c, R, S.bag);
      if (S.towel) drawTowel(c, R, S.towel);
    };
    if (v === 'front') {
      upper(c, R, () => {
        if (S.cape) drawCapeBack(c, R, S.cape);
        drawTail(c, R, H, 'behind');
        drawRibbon(c, R, H);
        backItems(c, R, 'behind');
      });
      legs(); lower();
      upper(c, R, () => {
        body(); hipItems(c, R);
        armFn(0, false); armFn(1, false);
        if (S.armor) drawPauldrons(c, R, S.armor);
        if (S.cape) drawMantle(c, R, S.cape);
        drawHead(c, R);
        if (S.beadsOver) drawBeads(c, R, S.beads);
      });
    } else if (v === 'back') {
      legs(); lower();
      upper(c, R, () => {
        body();
        armFn(0, false); armFn(1, false);
        if (S.armor) drawPauldrons(c, R, S.armor);
        hipItems(c, R);
        if (S.cape) { drawCapeBack(c, R, S.cape); drawMantle(c, R, S.cape); }
        if (S.back !== 'spear') backItems(c, R, 'over');
        drawHead(c, R);
        drawTail(c, R, H, 'over');
        drawRibbon(c, R, H);
        if (S.back === 'spear') backItems(c, R, 'over');
        if (S.hat && S.hat.type === 'douli' && H.back && H.back !== 'short') { /* hat over tail */ HATS.douli(c, R, S.hat, 'front'); }
      });
    } else { // side / q (facing left)
      upper(c, R, () => {
        armFn(0, true);
        if (S.cape) drawCapeBack(c, R, S.cape);
        backItems(c, R, 'behind');
        drawTail(c, R, H, 'behind');
        drawRibbon(c, R, H);
      });
      legs(); lower();
      upper(c, R, () => {
        body(); hipItems(c, R);
        if (S.cape) drawMantle(c, R, S.cape);
        drawHead(c, R);
        armFn(1, false);
        if (S.armor) drawPauldrons(c, R, S.armor);
      });
    }
    if (R.pose.fx) for (const f of R.pose.fx) FX[f] && FX[f](c, R);
  }

  // =================================================================================== battle FX baked into poses
  const FX = {
    slash(c, R) {
      const h = R.arms[1].w, k = R.k;
      c.save(); c.globalCompositeOperation = 'lighter';
      const cx = h[0] + 18 * k, cy = h[1] - 4 * k;
      for (let j = 0; j < 3; j++) {
        c.beginPath(); c.arc(cx, cy, 48 * k - j * 6 * k, PI * 0.72, PI * 1.32);
        stroke(c, rgba(R.S.aura || '#ffffff', 0.3 - j * 0.08), (7 - j * 2) * k);
      }
      c.beginPath(); c.arc(cx, cy, 48 * k, PI * 0.74, PI * 1.3); stroke(c, 'rgba(255,255,255,0.55)', 1.4 * k);
      c.restore();
    },
    thrust(c, R) {
      const h = R.arms[1].w, k = R.k;
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let j = -2; j <= 2; j++) { const y = h[1] + j * 5 * k, x0 = h[0] - 120 * k - abs(j) * 6 * k; seg(c, x0, y, x0 + 50 * k - abs(j) * 10 * k, y, rgba(R.S.aura || '#ffffff', 0.35 - abs(j) * 0.06), 1.4 * k); }
      c.restore();
    },
    talis(c, R) {
      const h = R.arms[1].w, k = R.k;
      [[-34, -8, -0.3], [-50, 4, 0.15], [-26, 10, 0.5]].forEach(([dx, dy, a]) => {
        const x = h[0] + dx * k, y = h[1] + dy * k;
        c.save(); c.globalCompositeOperation = 'lighter';
        const g = c.createRadialGradient(x, y, 0, x, y, 12 * k); g.addColorStop(0, rgba(R.S.aura || '#9be36a', 0.5)); g.addColorStop(1, rgba(R.S.aura || '#9be36a', 0)); c.fillStyle = g; c.fillRect(x - 12 * k, y - 12 * k, 24 * k, 24 * k);
        c.restore();
        drawProp(c, R, 'talisman', x, y, PI + a, { grip: 0.5 });
      });
    },
    notes(c, R) {
      const h = R.head, k = R.k;
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let j = 0; j < 3; j++) { c.beginPath(); c.arc(h.x - 30 * k, h.y + 22 * k, (16 + j * 12) * k, PI * 0.7, PI * 1.3); stroke(c, rgba(R.S.aura || '#7fd3ff', 0.45 - j * 0.12), 2 * k); }
      c.restore();
      for (const [dx, dy] of [[-36, -8], [-52, 16], [-24, -26]]) {
        const x = h.x + dx * k, y = h.y + dy * k;
        ell(c, x, y, 2.6 * k, 2 * k, -0.4); fill(c, rgba('#dff6ff', 0.9));
        seg(c, x + 2.3 * k, y, x + 2.3 * k, y - 8 * k, rgba('#dff6ff', 0.9), 0.9 * k);
        seg(c, x + 2.3 * k, y - 8 * k, x + 5 * k, y - 6 * k, rgba('#dff6ff', 0.9), 0.9 * k);
      }
    },
    feathers(c, R) {
      const h = R.arms[1].w, k = R.k;
      [[-30, -10, -0.3], [-46, 4, 0.1], [-24, 12, 0.45], [-58, -4, -0.1]].forEach(([dx, dy, a]) => {
        const x = h[0] + dx * k, y = h[1] + dy * k;
        c.save(); c.translate(x, y); c.rotate(PI + a);
        c.beginPath(); c.ellipse(0, 0, 7 * k, 2 * k, 0, 0, TAU); paint(c, '#1e1b26', -7, -2, 7, 2, R.lw * 0.6, 0.3, -0.1);
        seg(c, -8 * k, 0, 7 * k, 0, rgba('#9a8ac8', 0.6), 0.6 * k);
        c.restore();
        c.save(); c.globalCompositeOperation = 'lighter';
        seg(c, x + 4 * k, y, x + 18 * k, y + a * 6 * k, rgba(R.S.aura || '#b07aff', 0.35), 1.6 * k);
        c.restore();
      });
    },
    ring(c, R) {
      const h = R.arms[1].w, k = R.k;
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let j = 0; j < 3; j++) { c.beginPath(); c.ellipse(h[0] - (20 + j * 16) * k, h[1], (6 + j * 4) * k, (12 + j * 8) * k, 0, 0, TAU); stroke(c, rgba(R.S.aura || '#7fd3ff', 0.5 - j * 0.13), 1.8 * k); }
      c.restore();
    },
    ward(c, R) {
      const k = R.k, x = -26 * k, y = R.shY + 20 * k;
      c.save(); c.globalCompositeOperation = 'lighter';
      c.beginPath(); c.ellipse(x, y, 12 * k, 40 * k, 0, 0, TAU);
      const g = c.createRadialGradient(x, y, 0, x, y, 40 * k); g.addColorStop(0, rgba(R.S.aura || '#9fe0ff', 0.05)); g.addColorStop(1, rgba(R.S.aura || '#9fe0ff', 0.28)); c.fillStyle = g; c.fill();
      stroke(c, rgba(R.S.aura || '#9fe0ff', 0.6), 1.4 * k);
      c.restore();
    },
    swirl(c, R) {
      const k = R.k, x = 0, y = R.head.y - 10 * k;
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let j = 0; j < 3; j++) { c.beginPath(); c.ellipse(x, y, (60 - j * 10) * k, (12 - j * 2) * k, 0, PI * (0.1 + j * 0.3), PI * (1.3 + j * 0.3)); stroke(c, rgba(R.S.aura || '#ffd36a', 0.4 - j * 0.1), 2.2 * k); }
      c.restore();
    },
    sparks(c, R) {
      const k = R.k, x0 = R.arms[1].w[0], y0 = R.arms[1].w[1];
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let j = 0; j < 7; j++) { const a = j * 0.9, r = (8 + (j * 7) % 13) * k; circ(c, x0 + cos(a) * r, y0 + sin(a) * r - 6 * k, (1 + (j % 3) * 0.5) * k); fill(c, rgba(R.S.aura || '#ffffff', 0.7)); }
      c.restore();
    },
  };

  // =================================================================================== quadrupeds & birds
  const QUAD = {
    leopardcat: { bl: 12.5, bh: 8.2, leg: 6.5, legW: 2.6, hr: 11.5, hry: 10.5, head: [-11.5, -9], ears: 'round', tail: 'ring', tl: 15, tw: 3.4,
      col: { base: '#c9984e', belly: '#f4ead2', dark: '#3a2a22', spot: '#4a3020', nose: '#e88a8a', eye: '#6a8a3a' }, spots: true, chibi: true },
    dog: { bl: 14.5, bh: 7.4, leg: 11, legW: 2.4, hr: 8.6, hry: 8, head: [-14.5, -6], ears: 'point', tail: 'curl', tl: 11, tw: 2.2, muzzle: 5.5,
      col: { base: '#d6a24c', belly: '#f2dcae', dark: '#6a4422', nose: '#2a2020', eye: '#3a2618', collar: '#c0302a' } },
    cat: { bl: 10.5, bh: 6.4, leg: 7, legW: 2, hr: 7.6, hry: 7, head: [-10.5, -6], ears: 'cat', tail: 'up', tl: 13, tw: 1.8,
      col: { base: '#e4a464', belly: '#fbf2e2', dark: '#b8703a', nose: '#e88a8a', eye: '#5a9a3a' }, stripes: true },
    buffalo: { bl: 32, bh: 15, leg: 19, legW: 5, hr: 12, hry: 12.5, head: [-31, -2], ears: 'buffalo', tail: 'tuft', tl: 22, tw: 1.6, muzzle: 6, horns: true,
      col: { base: '#5c6068', belly: '#7a7e86', dark: '#34363c', nose: '#2a2a2e', eye: '#1c1a1e' } },
  };
  function quadRender(c, S, view, pose, bat) {
    const Q = Object.assign({}, QUAD[S.species] || QUAD.dog);
    const col = Object.assign({}, Q.col, S.col || {});
    const sc = (S.size || 1);
    const k = 1, lw = bat ? 1.6 : 1.3;
    c.save(); c.scale(sc, sc);
    if (pose.belly) { c.translate(0, -(Q.leg + Q.bh * 1.1 + Q.hr * 1.0)); c.rotate(0.18); c.scale(1, -1); }
    else if (pose.rot) { c.translate(0, -Q.leg * 0.4); c.rotate(pose.rot); }
    const legY = -Q.leg - (pose.hop || 0);
    const by = legY - Q.bh * 0.55;
    const sw = pose.legs || [0, 0, 0, 0]; // swings: frontNear, frontFar, backNear, backFar
    const crouch = pose.crouch || 0;
    const legPts = (x, y, a, kn) => { const L = Q.leg + crouch * 0; const kx = x - sin(a) * L * 0.5, ky = y + cos(a) * L * 0.5; return [[x, y], [kx, ky], [kx - sin(a - (kn || 0)) * L * 0.55, ky + cos(a - (kn || 0)) * L * 0.5]]; };
    const leg = (p, dim, front) => {
      const cc = dim ? shade(col.base, -0.18) : col.base;
      tube(c, p, [Q.legW, Q.legW * 0.92, Q.legW * 0.85], cc, lw);
      const e = p[2];
      ell(c, e[0] - (view === 'side' ? 1.2 : 0), e[1] - Q.legW * 0.3, Q.legW * 1.15, Q.legW * 0.72);
      paint(c, S.species === 'buffalo' ? shade(col.dark, dim ? -0.1 : 0) : (dim ? shade(col.belly, -0.18) : col.belly), e[0] - 3, e[1] - 3, e[0] + 3, e[1] + 2, lw);
      void front;
    };
    const tail = (anchor, dirX, up) => {
      const [x, y] = anchor, L = Q.tl, sway = pose.tail || 0;
      let pts;
      if (Q.tail === 'ring') pts = [[x, y], [x + dirX * L * 0.45, y - L * 0.12 + sway], [x + dirX * L * 0.85, y - L * 0.45 + sway], [x + dirX * L * 0.95, y - L * 0.95 + sway * 1.5]];
      else if (Q.tail === 'curl') pts = [[x, y], [x + dirX * L * 0.35, y - L * 0.7], [x + dirX * L * 0.1, y - L * 1.05], [x - dirX * L * 0.25, y - L * 0.75]];
      else if (Q.tail === 'up') pts = [[x, y], [x + dirX * L * 0.3, y - L * 0.5], [x + dirX * L * 0.25, y - L * 0.95], [x + dirX * L * 0.05, y - L * 1.1]];
      else pts = [[x, y], [x + dirX * L * 0.15, y + L * 0.4], [x + dirX * L * 0.1, y + L * 0.75]];
      if (up === false) pts = pts.map(([px, py]) => [px, py]);
      tube(c, pts, Q.tail === 'tuft' ? [Q.tw, Q.tw * 0.8, Q.tw * 0.7] : [Q.tw * 0.9, Q.tw, Q.tw, Q.tw * 0.85], col.base, lw);
      if (Q.tail === 'ring') { // dark rings and tip
        c.save(); c.beginPath(); tubePath(c, pts, [Q.tw * 0.9, Q.tw, Q.tw, Q.tw * 0.85]); c.clip();
        for (let j = 1; j <= 4; j++) { const p = lerpPath(pts, j / 4.6); circ(c, p[0], p[1], Q.tw * 0.75); fill(c, col.dark); }
        const p = pts[pts.length - 1]; circ(c, p[0], p[1], Q.tw * 1.4); fill(c, col.dark);
        c.restore();
      }
      if (Q.tail === 'tuft') { const p = pts[2]; ell(c, p[0], p[1] + 2, 2.2, 3.4); paint(c, col.dark, p[0] - 2, p[1], p[0] + 2, p[1] + 5, lw * 0.7); }
    };
    const bodyShape = (cx, cy, rx, ry) => {
      ell(c, cx, cy, rx, ry); paint(c, col.base, cx - rx, cy - ry, cx + rx * 0.5, cy + ry, lw, 0.2, -0.22);
      clipDo(c, () => {
        c.fillStyle = col.belly; c.beginPath(); c.ellipse(cx, cy + ry * 0.95, rx * 0.8, ry * 0.45, 0, 0, TAU); c.fill();
        if (Q.spots) for (let j = 0; j < 14; j++) { const u = U.hash(j, 3, 7), w = U.hash(j, 5, 9); ell(c, cx + (u - 0.5) * rx * 1.8, cy - ry * 0.75 + w * ry * 1.25, 1.5, 1.1, u * 3); fill(c, rgba(col.spot, 0.85)); }
        if (Q.stripes) for (let j = -3; j <= 3; j++) { c.beginPath(); c.moveTo(cx + j * rx * 0.25, cy - ry); c.quadraticCurveTo(cx + j * rx * 0.25 + 2, cy - ry * 0.2, cx + j * rx * 0.22, cy + ry * 0.2); stroke(c, rgba(col.dark, 0.55), 1.4); }
        c.fillStyle = rgba('#000000', 0.12); c.beginPath(); c.ellipse(cx + rx * 0.4, cy + ry * 0.4, rx * 0.8, ry * 0.7, 0, 0, TAU); c.fill();
      });
    };
    const head = (hx, hy, face) => quadHead(c, S, Q, col, hx, hy, face, pose, lw, bat);
    if (view === 'side') {
      const bx = 0, fx = -Q.bl * 0.62, rx = Q.bl * 0.6;
      const hx = Q.head[0] + (pose.headX || 0), hy = by + Q.head[1] + (pose.headY || 0);
      leg(legPts(fx + 1.8, legY + 1, sw[1], 0), true); leg(legPts(rx + 1.8, legY + 1, sw[3], 0.3), true);
      if (S.species === 'buffalo') {} // tail drawn after body
      else tail([Q.bl * 0.9, by - Q.bh * 0.15], 1);
      bodyShape(bx, by, Q.bl, Q.bh);
      if (S.species === 'buffalo') tail([Q.bl * 0.92, by - Q.bh * 0.4], 1);
      leg(legPts(fx, legY, sw[0], 0), false); leg(legPts(rx, legY, sw[2], 0.3), false);
      if (col.collar) { c.beginPath(); c.ellipse(hx + Q.hr * 0.5, hy + Q.hry * 0.75, 2.4, Q.hry * 0.55, 0.4, 0, TAU); stroke(c, col.collar, 2); }
      head(hx, hy, 'side');
    } else if (view === 'front') {
      const hy = by + Q.head[1] * 0.45 + 3 + (pose.headY || 0);
      tail([Q.bl * 0.15, by - Q.bh * 0.6], 1);
      if (S.species !== 'buffalo') { leg(legPts(-Q.bl * 0.42, legY - 2.5, 0, 0).map(([x, y]) => [x, y]), true); leg(legPts(Q.bl * 0.42, legY - 2.5, 0, 0), true); }
      bodyShape(0, by - 2, Q.bl * 0.62, Q.bh * 1.15);
      const fl = (sg, s) => { const p = legPts(sg * Q.bl * 0.32, legY + 1.5, 0, 0); p[1][1] -= s * 1.5; p[2][1] -= s * 2.5; leg(p, false); };
      fl(-1, max(0, sw[0]) * 2); fl(1, max(0, sw[1]) * 2);
      if (col.collar) { c.beginPath(); c.ellipse(0, hy + Q.hry * 0.9, Q.hr * 0.6, 2.4, 0, 0, PI); stroke(c, col.collar, 2.2); }
      head(0, hy, 'front');
    } else {
      const hy = by + Q.head[1] * 0.6 - 1;
      head(0, hy, 'back');
      const bl = (sg, s) => { const p = legPts(sg * Q.bl * 0.34, legY + 1, 0, 0); p[1][1] -= s * 1.5; p[2][1] -= s * 2.5; leg(p, false); };
      bl(-1, max(0, sw[2]) * 2); bl(1, max(0, sw[3]) * 2);
      bodyShape(0, by, Q.bl * 0.64, Q.bh * 1.2);
      tail([0, by - Q.bh * 0.2], 0.25);
    }
    c.restore();
  }
  function lerpPath(pts, t) {
    const n = pts.length - 1, f = t * n, i = min(n - 1, Math.floor(f));
    return lp(pts[i], pts[i + 1], f - i);
  }
  function quadHead(c, S, Q, col, hx, hy, face, pose, lw, bat) {
    const hr = Q.hr, hry = Q.hry, expr = pose.expr || 'normal';
    const side = face === 'side', back = face === 'back';
    // ears
    const ear = (x, y, dir, far) => {
      const ec = far ? shade(col.base, -0.15) : col.base;
      if (Q.ears === 'round') { ell(c, x, y, hr * 0.32, hr * 0.3); paint(c, ec, x - 4, y - 4, x + 4, y + 4, lw); if (back) { circ(c, x, y + 0.5, hr * 0.12); fill(c, '#f6f0e4'); } else { ell(c, x, y + 0.8, hr * 0.17, hr * 0.15); fill(c, shade(col.base, -0.35)); } }
      else if (Q.ears === 'point' || Q.ears === 'cat') {
        const w = hr * (Q.ears === 'cat' ? 0.38 : 0.34), h = hr * (Q.ears === 'cat' ? 0.62 : 0.8);
        c.beginPath(); c.moveTo(x - w, y + h * 0.25); c.quadraticCurveTo(x + dir * w * 0.2, y - h, x + dir * w * 0.35, y - h * 0.95); c.quadraticCurveTo(x + w * 0.9, y - h * 0.3, x + w, y + h * 0.3); c.closePath();
        paint(c, ec, x - w, y - h, x + w, y, lw);
        if (!back) { c.beginPath(); c.moveTo(x - w * 0.5, y + h * 0.1); c.lineTo(x + dir * w * 0.25, y - h * 0.62); c.lineTo(x + w * 0.5, y + h * 0.15); c.closePath(); fill(c, rgba('#e8a090', 0.7)); }
      } else if (Q.ears === 'buffalo') { ell(c, x, y, hr * 0.42, hr * 0.2, dir * 0.4); paint(c, ec, x - 5, y - 3, x + 5, y + 3, lw); }
    };
    const horns = (x, y, sg, far) => {
      const hc = far ? '#bfb4a0' : '#d8cfbc';
      tube(c, [[x, y], [x + sg * hr * 1.0, y - hr * 0.35], [x + sg * hr * 1.7, y + hr * 0.05], [x + sg * hr * 1.75, y + hr * 0.55]], [hr * 0.22, hr * 0.2, hr * 0.14, hr * 0.04], hc, lw);
    };
    if (side) {
      ear(hx + hr * 0.38, hy - hry * 0.72, -1, true);
      if (Q.horns) horns(hx + hr * 0.2, hy - hry * 0.65, 1, true);
      ell(c, hx, hy, hr, hry); paint(c, col.base, hx - hr, hy - hry, hx + hr * 0.6, hy + hry, lw, 0.22, -0.2);
      if (Q.muzzle) { ell(c, hx - hr * 0.85, hy + hry * 0.35, Q.muzzle, hry * 0.48, 0.15); paint(c, S.species === 'buffalo' ? shade(col.base, -0.15) : col.belly, hx - hr * 1.4, hy, hx - hr * 0.4, hy + hry, lw); circ(c, hx - hr * 0.85 - Q.muzzle * 0.85, hy + hry * 0.18, 1.6); fill(c, col.nose); }
      clipDo(c, () => { // face marks
        ell(c, hx, hy, hr, hry); c.clip();
        if (Q.chibi) { // leopard cat: forehead stripes, white eye streak, cheek
          for (const d of [-1.5, 1.5]) seg(c, hx - hr * 0.3 + d, hy - hry * 0.95, hx - hr * 0.45 + d * 0.6, hy - hry * 0.3, rgba(col.dark, 0.85), 1.4);
          c.fillStyle = col.belly; c.beginPath(); c.ellipse(hx - hr * 0.62, hy + hry * 0.45, hr * 0.42, hry * 0.36, 0, 0, TAU); c.fill();
          seg(c, hx - hr * 0.55, hy + hry * 0.3, hx - hr * 0.1, hy + hry * 0.62, rgba(col.dark, 0.7), 1.1);
        }
      });
      ear(hx + hr * 0.12, hy - hry * 0.78, -1, false);
      if (Q.horns) horns(hx + hr * 0.05, hy - hry * 0.6, 1, false);
      // eye
      const ex = hx - hr * (Q.chibi ? 0.42 : 0.38), ey = hy - hry * (Q.chibi ? 0.02 : 0.12);
      qEye(c, ex, ey, hr, Q, col, expr);
      if (Q.chibi) {
        c.beginPath(); c.moveTo(ex - hr * 0.1, ey - hry * 0.38); c.lineTo(ex - hr * 0.42, ey - hry * 0.95); stroke(c, '#fbf6ea', 1.3);
        ell(c, hx - hr * 0.98, hy + hry * 0.25, 1.4, 1.1); fill(c, col.nose);
        c.beginPath(); c.moveTo(hx - hr * 0.98, hy + hry * 0.38); c.quadraticCurveTo(hx - hr * 0.82, hy + hry * (expr === 'shout' ? 0.75 : 0.55), hx - hr * 0.68, hy + hry * 0.42); stroke(c, '#5a3a32', 0.9);
        for (const d of [-1, 0, 1]) seg(c, hx - hr * 0.85, hy + hry * 0.45 + d * 1.5, hx - hr * 1.35, hy + hry * 0.4 + d * 2.2, rgba('#ffffff', 0.7), 0.5);
      }
      return;
    }
    if (back) {
      if (Q.horns) for (const sg of [-1, 1]) horns(hx + sg * hr * 0.5, hy - hry * 0.4, sg, false);
      for (const sg of [-1, 1]) ear(hx + sg * hr * (Q.ears === 'buffalo' ? 0.95 : 0.6), hy - hry * (Q.ears === 'buffalo' ? 0.25 : 0.72), sg, false);
      ell(c, hx, hy, hr, hry); paint(c, col.base, hx - hr, hy - hry, hx + hr, hy + hry, lw, 0.18, -0.22);
      if (Q.chibi) clipDo(c, () => { for (const d of [-2.5, 0, 2.5]) seg(c, hx + d, hy - hry, hx + d * 0.7, hy - hry * 0.2, rgba(col.dark, 0.7), 1.3); });
      return;
    }
    // front
    if (Q.horns) for (const sg of [-1, 1]) horns(hx + sg * hr * 0.55, hy - hry * 0.55, sg, false);
    for (const sg of [-1, 1]) ear(hx + sg * hr * (Q.ears === 'buffalo' ? 1.05 : 0.62), hy - hry * (Q.ears === 'buffalo' ? 0.2 : 0.72), sg, false);
    ell(c, hx, hy, hr * (Q.chibi ? 1.06 : 1), hry); paint(c, col.base, hx - hr, hy - hry, hx + hr * 0.6, hy + hry, lw, 0.22, -0.2);
    clipDo(c, () => {
      if (Q.chibi) {
        for (const d of [-2.2, 2.2]) seg(c, hx + d, hy - hry, hx + d * 0.8, hy - hry * 0.3, rgba(col.dark, 0.85), 1.4);
        for (const sg of [-1, 1]) { c.fillStyle = col.belly; c.beginPath(); c.ellipse(hx + sg * hr * 0.42, hy + hry * 0.5, hr * 0.38, hry * 0.3, 0, 0, TAU); c.fill(); seg(c, hx + sg * hr * 0.5, hy + hry * 0.25, hx + sg * hr * 0.95, hy + hry * 0.4, rgba(col.dark, 0.7), 1); }
      }
    });
    if (Q.muzzle) { ell(c, hx, hy + hry * 0.42, hr * 0.55, hry * 0.42); paint(c, S.species === 'buffalo' ? shade(col.base, -0.15) : col.belly, hx - 5, hy, hx + 5, hy + hry, lw); ell(c, hx, hy + hry * 0.3, S.species === 'buffalo' ? hr * 0.32 : 1.8, 1.3); fill(c, col.nose); }
    for (const sg of [-1, 1]) {
      const ex = hx + sg * hr * (Q.chibi ? 0.4 : 0.36), ey = hy - hry * (Q.chibi ? 0.02 : 0.12);
      qEye(c, ex, ey, hr, Q, col, expr);
      if (Q.chibi) { c.beginPath(); c.moveTo(ex - sg * hr * 0.15, ey - hry * 0.36); c.lineTo(ex - sg * hr * 0.05, ey - hry * 0.92); stroke(c, '#fbf6ea', 1.2); }
    }
    if (!Q.muzzle) {
      ell(c, hx, hy + hry * 0.28, 1.5, 1.1); fill(c, col.nose);
      c.beginPath(); c.moveTo(hx - 2.2, hy + hry * 0.45); c.quadraticCurveTo(hx - 1, hy + hry * 0.62, hx, hy + hry * 0.42); c.quadraticCurveTo(hx + 1, hy + hry * 0.62, hx + 2.2, hy + hry * 0.45);
      if (expr === 'shout') { ell(c, hx, hy + hry * 0.6, 1.8, 1.6); fill(c, '#7a2a2a'); } else stroke(c, '#5a3a32', 0.8);
    }
    if (col.collar && false) void 0;
    void bat;
  }
  function qEye(c, x, y, hr, Q, col, expr) {
    const r = hr * (Q.chibi ? 0.17 : 0.12);
    if (expr === 'smile' || expr === 'closed') { c.beginPath(); c.moveTo(x - r, y + r * 0.3); c.quadraticCurveTo(x, y - r * 1.1, x + r, y + r * 0.3); stroke(c, '#2a1a18', 1.1); return; }
    if (expr === 'hurt') { c.beginPath(); c.moveTo(x - r, y - r); c.lineTo(x + r * 0.6, y); c.lineTo(x - r, y + r); stroke(c, '#2a1a18', 1.1); return; }
    if (expr === 'ko') { for (const d of [-1, 1]) seg(c, x - r, y - r * d, x + r, y + r * d, '#2a1a18', 1); return; }
    ell(c, x, y, r, r * 1.2);
    const g = c.createLinearGradient(x, y - r, x, y + r); g.addColorStop(0, '#1a1410'); g.addColorStop(1, col.eye); c.fillStyle = g; c.fill();
    circ(c, x - r * 0.35, y - r * 0.45, r * 0.42); fill(c, '#ffffff');
    if (expr === 'focus') { c.beginPath(); c.moveTo(x - r * 1.4, y - r * 1.6); c.lineTo(x + r * 1.2, y - r * 1.0); stroke(c, '#2a1a18', 1); }
  }
  function birdRender(c, S, view, f, bat) {
    const crow = S.species === 'crow';
    const sc = S.size || 1, lw = 1.2;
    const base = crow ? '#24222c' : '#f2ece0', dark = crow ? '#141218' : '#c8a070';
    c.save(); c.scale(sc, sc);
    const hop = crow ? (f === 1 || f === 3 ? 3 : 0) : (f === 1 || f === 3 ? 1 : 0);
    const by = -9 - hop;
    const legsAt = (xs) => { for (const [x, s] of xs) { const y0 = by + 3; seg(c, x, y0, x - s, -0.5 - (crow && hop ? 2 : 0), crow ? '#3a3640' : '#e0a040', 1.2); seg(c, x - s - 1.6, -0.5, x - s + 1.6, -0.5, crow ? '#3a3640' : '#e0a040', 1); } };
    if (view === 'side') {
      legsAt([[0, f === 1 ? 2 : f === 3 ? -2 : 0], [2, f === 1 ? -2 : f === 3 ? 2 : 0]]);
      // tail
      c.beginPath(); c.moveTo(5, by - 2);
      if (crow) { c.lineTo(13, by + 1); c.lineTo(12, by + 3); c.lineTo(4, by + 2); }
      else { c.quadraticCurveTo(10, by - 14, 15, by - 9); c.quadraticCurveTo(12, by - 5, 6, by + 2); }
      c.closePath(); paint(c, crow ? '#1c1a24' : '#3a6a4a', 4, by - 14, 15, by + 2, lw, 0.3, -0.1);
      if (!crow) { c.beginPath(); c.moveTo(6, by - 3); c.quadraticCurveTo(12, by - 12, 14, by - 4); stroke(c, '#c8502a', 1.4); }
      ell(c, 1, by, 7, 5.6); paint(c, base, -6, by - 5, 8, by + 5, lw, 0.2, -0.2);
      ell(c, 2.5, by - 0.5, 4, 3, -0.2); paint(c, crow ? '#2e2a38' : '#e8dcc6', 0, by - 3, 6, by + 2, lw * 0.7, 0.2, -0.2);
      const hx = -5, hy = by - 6;
      ball(c, hx, hy, crow ? 3.6 : 3.4, base, lw, 0.2, -0.2);
      if (!crow) { for (let j = 0; j < 3; j++) ball(c, hx - 1.5 + j * 1.6, hy - 3.4 - (j === 1 ? 0.8 : 0), 1.3, '#d8302a', 0.6); ell(c, hx - 2.2, hy + 3, 1, 1.6); fill(c, '#d8302a'); }
      c.beginPath(); c.moveTo(hx - 3, hy - 1); c.lineTo(hx - (crow ? 7.5 : 6), hy + 0.3); c.lineTo(hx - 3, hy + 1.2); c.closePath(); fill(c, crow ? '#3a3640' : '#e8a83a');
      circ(c, hx - 1, hy - 0.6, 0.9); fill(c, crow ? '#d8d0e0' : '#1a1410');
    } else {
      legsAt([[-2, 0], [2, 0]]);
      if (view === 'back') { c.beginPath(); c.moveTo(-4, by - 2); c.quadraticCurveTo(0, by - (crow ? 6 : 16), 4, by - 2); c.closePath(); paint(c, crow ? '#1c1a24' : '#3a6a4a', -4, by - 14, 4, by, lw); }
      ell(c, 0, by, 6, 6); paint(c, base, -6, by - 6, 6, by + 6, lw, 0.2, -0.2);
      const hy = by - 7 + (view === 'back' ? 1 : 0);
      ball(c, 0, hy, 3.8, base, lw, 0.2, -0.2);
      if (!crow) { for (let j = 0; j < 3; j++) ball(c, -1.4 + j * 1.4, hy - 3.6 - (j === 1 ? 0.8 : 0), 1.2, '#d8302a', 0.5); }
      if (view === 'front') {
        for (const s of [-1, 1]) { circ(c, s * 1.7, hy - 0.5, 0.8); fill(c, crow ? '#d8d0e0' : '#1a1410'); }
        c.beginPath(); c.moveTo(-1.2, hy + 0.6); c.lineTo(0, hy + (crow ? 3.6 : 2.8)); c.lineTo(1.2, hy + 0.6); c.closePath(); fill(c, crow ? '#3a3640' : '#e8a83a');
        if (!crow) { ell(c, 0, hy + 3.4, 0.9, 1.4); fill(c, '#d8302a'); }
      }
    }
    c.restore();
    void dark; void bat;
  }

  // =================================================================================== poses
  function mapPose(S, view, f) {
    const s = f === 1 ? 1 : f === 3 ? -1 : 0;
    const p = { sway: -s * 1.5 };
    const longSkirt = (S.top && S.top.len > 0.6) || (S.skirt && S.skirt.len > 0.7);
    const st = longSkirt ? 0.7 : 1;
    if (view === 'side') {
      p.legs = s === 0 ? [[-0.06, 0.03], [0.08, 0.03]] : s > 0 ? [[-0.38 * st, 0.4 * st], [0.42 * st, 0.12]] : [[0.42 * st, 0.12], [-0.38 * st, 0.4 * st]];
      p.arms = s === 0 ? [{ a: 0.08, e: 0.18 }, { a: -0.06, e: 0.2 }] : [{ a: 0.45 * s, e: 0.35 }, { a: -0.45 * s, e: 0.25 + (s < 0 ? 0.3 : 0) }];
    } else {
      p.legs = s === 0 ? [[0, 0], [0, 0]] : s > 0 ? [[0.3, 0.05], [-0.22, 0.42]] : [[-0.22, 0.42], [0.3, 0.05]];
      p.arms = s === 0 ? [{ a: 0, e: 0.08 }, { a: 0, e: 0.08 }] : [{ a: -0.32 * s, e: 0.15 }, { a: 0.32 * s, e: 0.15 }];
    }
    const holdIdx = view === 'side' ? (S.armPose ? 0 : 1) : view === 'back' ? 0 : 1;
    if (S.held && { cane: 1, staff: 1, lstaff: 1, oar: 1, spear: 1, glaive: 1, halberd: 1, flag: 1, pestle: 1, paddle: 1, hoe: 1, broom: 1, lantern: 1, oillamp: 1, yueqin: 1, basket: 1, medbox: 1 }[S.held]) {
      const hi = holdIdx;
      p.arms[hi] = view === 'side' ? { a: 0.95, e: 0.3 } : { a: 0.2, e: 0.75, out: 0.45 };
      if (S.held === 'lantern' || S.held === 'oillamp' || S.held === 'basket' || S.held === 'medbox') p.arms[hi] = view === 'side' ? { a: 0.35, e: 0.25 } : { a: 0.1, e: 0.15, out: 0.35 };
      if (S.held === 'yueqin') p.arms[hi] = view === 'side' ? { a: 0.7, e: 1.0 } : { a: 0.3, e: 1.2, out: -0.2 };
    } else if (S.held) {
      const hi = holdIdx;
      p.arms[hi] = view === 'side' ? { a: 0.5, e: 1.2 } : { a: 0.15, e: 1.1, out: -0.1 };
    }
    if (S.armPose) { // giant figures: 千里眼 shading the eyes, 順風耳 cupping the ear
      const hi = view === 'side' ? 1 : view === 'back' ? 1 : 0;
      p.arms[hi] = S.armPose === 'brow' ? (view === 'side' ? { a: 1.75, e: 1.25 } : { a: 0.6, e: 2.4, out: 0.2, eo: -0.6 }) : (view === 'side' ? { a: 1.5, e: 1.6 } : { a: 0.3, e: 2.5, out: 0.5, eo: -0.5 });
    }
    if (S.armsBack) p.arms = view === 'side' ? [{ a: -0.4, e: 1.2 }, { a: -0.3, e: 1.3 }] : p.arms;
    return p;
  }
  // battle poses per weapon style. arm 'to' = hand target relative to its shoulder in arm lengths.
  // w: { type, ang (deg, canvas: 180 = forward/left, 270 = up), hand: 1 near | 0 far, two: grip offset for far hand (fraction of length) }
  function battlePose(S, pose) {
    const style = S.weapon || 'none';
    const base = {
      idle: { legs: [[-0.16, 0.06], [0.2, 0.1]], lean: 0.03, expr: 'normal' },
      ready: { legs: [[-0.45, 0.32], [0.5, 0.7]], lean: 0.14, expr: 'focus' },
      attack: { legs: [[-0.85, 0.05], [0.95, 1.15]], lean: 0.3, expr: 'shout' },
      cast: { legs: [[-0.22, 0.1], [0.25, 0.16]], lean: -0.05, expr: 'focus' },
      hurt: { legs: [[-0.02, 0.45], [0.38, 0.12]], lean: -0.32, tilt: 0.25, expr: 'hurt', sway: 3 },
      guard: { legs: [[-0.48, 0.48], [0.42, 0.8]], lean: 0.12, expr: 'focus' },
      victory: { legs: [[-0.12, 0.04], [0.16, 0.05]], lean: -0.05, expr: 'smile' },
      item: { legs: [[-0.12, 0.05], [0.18, 0.08]], lean: 0.02, expr: 'normal' },
      ko: { legs: [[-0.05, 0.02], [0.05, 0.02]], lean: 0, expr: 'ko', noStoop: true },
    };
    const p = Object.assign({}, base[pose] || base.idle);
    const A = (to, bend) => ({ to, bend: bend || -1 });
    const set = (near, far, w, extra) => { p.arms = [far, near]; if (w) p.w = w; if (extra) Object.assign(p, extra); };
    const sty = {
      sword: {
        idle: () => set(A([-0.3, 0.86]), { a: -0.12, e: 0.3 }, { type: 'sword', ang: 128, glow: S.aura }),
        ready: () => set(A([-0.78, 0.42]), A([-0.42, 0.28]), { type: 'sword', ang: 205, glow: S.aura }),
        attack: () => set(A([-0.98, 0.12]), { a: -1.0, e: 0.4 }, { type: 'sword', ang: 183, glow: S.aura }, { fx: ['slash'] }),
        cast: () => set(A([-0.8, -0.5], 1), A([-0.4, 0.3]), { type: 'sword', ang: 250, glow: S.aura }, { fx: ['sparks'] }),
        hurt: () => set(A([-0.1, 0.9]), { a: 0.7, e: 0.4 }, { type: 'sword', ang: 112 }),
        guard: () => set(A([-0.62, 0.32]), A([-0.55, 0.42]), { type: 'sword', ang: 262 }),
        victory: () => set(A([-0.72, -0.66], 1), A([0.3, 0.6], 1), { type: 'sword', ang: 255, glow: S.aura }),
        item: () => set(A([-0.62, -0.05]), { a: -0.1, e: 0.3 }, null, { item: 'jar' }),
        ko: () => set({ a: 0.2, e: 0.1 }, { a: -0.1, e: 0.1 }),
      },
      spear: {
        idle: () => set(A([-0.28, 0.55]), { a: -0.12, e: 0.25 }, { type: 'spear', ang: 268, grip: 0.4 }),
        ready: () => set(A([-0.72, 0.5]), null, { type: 'spear', ang: 194, grip: 0.55, two: -0.3 }),
        attack: () => set(A([-1.0, 0.25]), null, { type: 'spear', ang: 181, grip: 0.62, two: -0.32 }, { fx: ['thrust'] }),
        cast: () => set(A([-0.3, -0.92], 1), null, { type: 'spear', ang: 196, grip: 0.5, two: -0.3, bend2: 1 }, { fx: ['swirl'] }),
        hurt: () => set(A([-0.15, 0.85]), { a: 0.7, e: 0.4 }, { type: 'spear', ang: 125, grip: 0.45 }),
        guard: () => set(A([-0.62, 0.15]), null, { type: 'spear', ang: 168, grip: 0.62, two: -0.28 }),
        victory: () => set(A([-0.48, 0.18]), A([0.3, 0.6], 1), { type: 'spear', ang: 272, grip: 0.35 }),
        item: () => set(A([-0.62, -0.05]), { a: -0.1, e: 0.3 }, null, { item: 'jar' }),
        ko: () => set({ a: 0.2, e: 0.1 }, { a: -0.1, e: 0.1 }),
      },
      fan: {
        idle: () => set(A([-0.42, 0.32]), { a: -0.45, e: 1.4 }, { type: 'fan', ang: 250 }),
        ready: () => set(A([-0.68, 0.18]), A([-0.35, 0.3]), { type: 'fan', ang: 225, open: true, type2: 'talisman', ang2: 250 }),
        attack: () => set(A([-0.98, 0.05]), A([-0.25, -0.1], 1), { type: 'talisman', ang: 190, type2: 'fan', ang2: 230, o2: { open: true } }, { fx: ['talis'] }),
        cast: () => set(A([-0.38, -0.55], 1), A([0.1, 0.4]), { type: 'talisman', ang: 270, glow: S.aura }, { fx: ['sparks'] }),
        hurt: () => set(A([-0.15, 0.82]), { a: 0.7, e: 0.4 }, { type: 'fan', ang: 120 }),
        guard: () => set(A([-0.72, 0.05]), A([-0.3, 0.35]), { type: 'fan', ang: 205, open: true, len: 20 }, { fx: ['ward'] }),
        victory: () => set(A([-0.32, -0.28], 1), { a: -0.45, e: 1.4 }, { type: 'fan', ang: 250, open: true, mark: true }),
        item: () => set(A([-0.62, -0.05]), { a: -0.45, e: 1.4 }, null, { item: 'gourd' }),
        ko: () => set({ a: 0.2, e: 0.1 }, { a: -0.1, e: 0.1 }),
      },
      flute: {
        idle: () => set(A([-0.4, 0.62]), A([-0.25, 0.6]), { type: 'flute', ang: 165, grip: 0.3 }),
        ready: () => set(A([-0.58, 0.28]), A([-0.38, 0.32]), { type: 'flute', ang: 205, grip: 0.3 }),
        attack: () => set(A([-0.98, 0.0]), { a: -0.7, e: 0.4 }, { type: 'flute', ang: 182, grip: 0.25 }, { fx: ['ring'] }),
        cast: () => set(A([-0.58, -0.48], 1), null, { type: 'flute', ang: 176, grip: 0.18, two: 0.38, bend2: 1 }, { fx: ['notes'], expr: 'closed' }),
        hurt: () => set(A([-0.15, 0.85]), { a: 0.7, e: 0.4 }, { type: 'flute', ang: 120 }),
        guard: () => set(A([-0.62, 0.18]), A([-0.45, 0.3]), { type: 'flute', ang: 262, grip: 0.5 }, { fx: ['ward'] }),
        victory: () => set(A([-0.32, 0.38]), A([-0.2, 0.42]), { type: 'flute', ang: 240, grip: 0.4 }),
        item: () => set(A([-0.62, -0.05]), { a: -0.1, e: 0.3 }, null, { item: 'jar' }),
        ko: () => set({ a: 0.2, e: 0.1 }, { a: -0.1, e: 0.1 }),
      },
    };
    // pole-like weapons share the spear choreography; feather fan / whisk share the fan's
    const map = { oar: 'spear', lstaff: 'spear', glaive: 'spear', ffan: 'fan', whisk: 'fan' };
    const key = sty[style] ? style : map[style] || null;
    if (key && sty[key][pose]) {
      sty[key][pose]();
      if (p.w && map[style] && (p.w.type === 'spear' || p.w.type === 'fan')) p.w.type = style;
      if (p.w && style === 'lstaff' && pose === 'cast') { p.w.ang = 268; p.w.two = null; p.arms[1] = A([-0.3, -0.95], 1); p.arms[0] = A([-0.3, 0.3]); p.fx = ['sparks']; }
      if (p.w && style === 'whisk' && p.w.type === 'talisman' && pose !== 'attack') p.w.type = 'whisk';
      if (style === 'ffan' && p.w) { // 墨鴉 throws crow feathers instead of talismans
        if (p.w.type === 'talisman') p.w.type = pose === 'attack' ? 'ffan' : 'ffan';
        if (p.w.type2 === 'fan' || p.w.type2 === 'talisman') p.w.type2 = null;
        if (p.fx) p.fx = p.fx.map((f) => (f === 'talis' ? 'feathers' : f));
      }
    } else {
      const nf = {
        idle: [A([-0.2, 0.9]), { a: -0.1, e: 0.2 }], ready: [A([-0.6, 0.3]), A([-0.4, 0.35])], attack: [A([-1.0, 0.05]), { a: -1, e: 0.4 }],
        cast: [A([-0.5, -0.7], 1), A([-0.4, -0.5], 1)], hurt: [A([-0.1, 0.9]), { a: 0.6, e: 0.3 }], guard: [A([-0.5, 0.1]), A([-0.4, 0.15])],
        victory: [A([-0.2, -0.95], 1), A([0.3, 0.6], 1)], item: [A([-0.62, -0.05]), { a: 0, e: 0.3 }], ko: [{ a: 0.2, e: 0.1 }, { a: -0.1, e: 0.1 }],
      }[pose] || [{}, {}];
      set(nf[0], nf[1]);
      if (pose === 'item') p.item = 'jar';
    }
    if (p.w && p.w.two != null && !p.arms[0]) p.arms[0] = {};
    if (!p.arms[0]) p.arms[0] = {};
    return p;
  }
  function quadBattlePose(pose) {
    return {
      idle: { legs: [0.05, -0.05, -0.05, 0.05], tail: 0, expr: 'normal' },
      ready: { legs: [0.25, 0.15, -0.25, -0.15], crouch: 2, tail: -3, expr: 'focus', headY: 1 },
      attack: { legs: [0.9, 0.7, -0.8, -0.6], hop: 9, rot: -0.12, tail: 4, expr: 'shout' },
      cast: { legs: [0.05, -0.05, -0.05, 0.05], tail: -4, expr: 'closed', aura: true },
      hurt: { legs: [-0.3, -0.2, 0.3, 0.2], rot: 0.15, tail: 3, expr: 'hurt' },
      guard: { legs: [0.3, 0.3, -0.3, -0.3], tail: 2, expr: 'focus', headY: 2, crouch: 3 },
      victory: { legs: [0.1, 0, -0.1, 0], hop: 4, tail: -5, expr: 'smile' },
      item: { legs: [0.05, -0.05, -0.05, 0.05], tail: -2, expr: 'smile' },
      ko: { legs: [0.6, 0.5, -0.6, -0.5], belly: true, expr: 'ko' },
    }[pose] || { legs: [0, 0, 0, 0] };
  }

  // =================================================================================== registry & cache
  const RAW = {}, SPECS = {}, CACHE = new Map();
  function merge(a, b) {
    for (const key in b) {
      const v = b[key];
      if (v && typeof v === 'object' && !Array.isArray(v) && a[key] && typeof a[key] === 'object' && !Array.isArray(a[key])) a[key] = merge(Object.assign({}, a[key]), v);
      else a[key] = Array.isArray(v) ? v.slice() : (v && typeof v === 'object' ? merge({}, v) : v);
    }
    return a;
  }
  function normalize(s) {
    s = merge({}, s);
    s.kind = s.kind || 'human';
    if (s.kind !== 'human') return s;
    s.body = s.body || 'adult';
    s.skin = s.skin || '#f2cfb0';
    s.eyes = s.eyes || '#4a3328';
    s.hair = Object.assign({ style: 'messy', color: '#2a2630', back: 'short' }, s.hair || {});
    s.top = Object.assign({ color: '#6a7a8a', len: 0.2, closure: 'cross', sleeve: 'long' }, s.top || {});
    s.bottom = Object.assign({ type: 'pants', color: '#3a3540' }, s.bottom || {});
    s.shoes = Object.assign({ type: 'cloth', color: '#2b2730' }, s.shoes || {});
    if (s.hat && typeof s.hat === 'string') s.hat = { type: s.hat };
    if (s.hip && !Array.isArray(s.hip)) s.hip = [s.hip];
    return s;
  }
  function define(id, spec) {
    let raw = spec;
    if (spec.base && RAW[spec.base]) { raw = merge(merge({}, RAW[spec.base]), spec); delete raw.base; }
    RAW[id] = raw;
    SPECS[id] = normalize(raw);
    for (const key of Array.from(CACHE.keys())) if (key.split('|')[0] === id) CACHE.delete(key);
  }
  // render into a scratch canvas, then copy the opaque bounds into a tight cached canvas
  let scratch = null;
  function renderTrim(w, h, ax, ay, fn) {
    const S = G.S || 1;
    if (!scratch || scratch.lw < w || scratch.lh < h || scratch.sc !== S) {
      const lw = max(w, scratch && scratch.sc === S ? scratch.lw : 0), lh = max(h, scratch && scratch.sc === S ? scratch.lh : 0);
      scratch = document.createElement('canvas');
      scratch.width = Math.ceil(lw * S); scratch.height = Math.ceil(lh * S);
      scratch.lw = lw; scratch.lh = lh; scratch.sc = S;
      scratch.cx = scratch.getContext('2d', { willReadFrequently: true });
    }
    const x = scratch.cx;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, scratch.width, scratch.height);
    x.setTransform(S, 0, 0, S, ax * S, ay * S);
    x.lineCap = 'round'; x.lineJoin = 'round';
    fn(x);
    const W = Math.ceil(w * S), Hh = Math.ceil(h * S);
    const d = x.getImageData(0, 0, W, Hh).data;
    let x0 = W, y0 = Hh, x1 = -1, y1 = -1;
    for (let yy = 0; yy < Hh; yy++) {
      const row = yy * W * 4;
      let any = false;
      for (let xx = 0; xx < W; xx++) if (d[row + xx * 4 + 3] > 3) { any = true; if (xx < x0) x0 = xx; break; }
      if (!any) continue;
      for (let xx = W - 1; xx >= 0; xx--) if (d[row + xx * 4 + 3] > 3) { if (xx > x1) x1 = xx; break; }
      if (yy < y0) y0 = yy; y1 = yy;
    }
    if (x1 < 0) { const c = U.makeCanvas(1, 1); c.ax = 0; c.ay = 0; return c; }
    const lx0 = Math.floor(x0 / S) - 1, ly0 = Math.floor(y0 / S) - 1, lx1 = Math.ceil((x1 + 1) / S) + 1, ly1 = Math.ceil((y1 + 1) / S) + 1;
    const c = U.makeCanvas(lx1 - lx0, ly1 - ly0, S);
    const cx = c.getContext('2d');
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.drawImage(scratch, lx0 * S, ly0 * S, (lx1 - lx0) * S, (ly1 - ly0) * S, 0, 0, (lx1 - lx0) * S, (ly1 - ly0) * S);
    c.ax = ax - lx0; c.ay = ay - ly0;
    return c;
  }
  function ghostify(src, tint) {
    const c = U.makeCanvas(src.lw, src.lh, G.S || 1);
    const x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'color'; x.fillStyle = tint || '#9cc8f0'; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(214,236,255,0.38)'; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-out';
    const g = x.createLinearGradient(0, c.height * 0.6, 0, c.height);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.92)');
    x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    c.ax = src.ax; c.ay = src.ay;
    return c;
  }
  function mapFrame(id, view, f, ghost) {
    const key = id + '|m|' + view + '|' + f + (ghost ? '|g' : '') + '|' + (G.S || 1);
    let c = CACHE.get(key);
    if (c) return c;
    if (ghost) { c = ghostify(mapFrame(id, view, f, false), SPECS[id].ghostTint); CACHE.set(key, c); return c; }
    const S = SPECS[id];
    const sz = S.size || 1;
    const w = 150 * sz, h = 170 * sz;
    c = renderTrim(w, h, w / 2, h - 24 * sz, (x) => {
      if (S.kind === 'quad') quadRender(x, S, view, { legs: quadWalk(f, view) }, false);
      else if (S.kind === 'bird') birdRender(x, S, view, f, false);
      else {
        x.scale(sz, sz);
        const R = rig(S, false, view, mapPose(S, view, f));
        drawHuman(x, S, R);
      }
    });
    CACHE.set(key, c);
    return c;
  }
  function quadWalk(f, view) {
    const s = f === 1 ? 1 : f === 3 ? -1 : 0;
    if (view !== 'side') return [s, -s, -s, s];
    return [0.4 * s, -0.4 * s, -0.4 * s, 0.4 * s];
  }
  function battleFrame(id, pose, ghost) {
    const key = id + '|b|' + pose + (ghost ? '|g' : '') + '|' + (G.S || 1);
    let c = CACHE.get(key);
    if (c) return c;
    if (ghost) { c = ghostify(battleFrame(id, pose, false), SPECS[id].ghostTint); CACHE.set(key, c); return c; }
    const S = SPECS[id];
    const sz = S.size || 1;
    const w = 460 * sz, h = 330 * sz, ax = 270 * sz, ay = h - 40 * sz;
    c = renderTrim(w, h, ax, ay, (x) => {
      if (S.kind === 'quad') {
        const qp = quadBattlePose(pose);
        x.save();
        if (pose === 'ko') x.translate(0, -2);
        quadRender(x, Object.assign({}, S, { size: (S.size || 1) * 1.75 }), 'side', qp, true);
        x.restore();
        return;
      }
      if (S.kind === 'bird') { x.scale(1.7, 1.7); birdRender(x, S, 'side', 0, true); return; }
      x.scale(sz, sz);
      const p = battlePose(S, pose);
      if (pose === 'ko') {
        const R = rig(S, true, 'q', p);
        const hgt = -R.head.y;
        x.translate(-hgt * 0.5, -R.P.sw * 0.75);
        x.rotate(PI / 2 * 0.95);
        drawHuman(x, S, R);
        return;
      }
      drawHuman(x, S, rig(S, true, 'q', p));
    });
    CACHE.set(key, c);
    return c;
  }
  // soft ground shadow sprites cached by size
  const SHADOWS = {};
  function shadowSprite(rx) {
    const key = Math.round(rx * 2);
    let c = SHADOWS[key];
    if (c) return c;
    const r = key / 2, ry = r * 0.36;
    c = U.makeCanvas(r * 2 + 4, ry * 2 + 4, G.S || 1);
    const x = c.getContext('2d');
    x.translate(r + 2, ry + 2); x.scale(1, ry / r);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, 'rgba(18,14,30,0.42)'); g.addColorStop(0.6, 'rgba(18,14,30,0.26)'); g.addColorStop(1, 'rgba(18,14,30,0)');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill();
    c.ax = r + 2; c.ay = ry + 2;
    return (SHADOWS[key] = c);
  }
  function shadowR(S, bat) {
    if (S.kind === 'quad') { const Q = QUAD[S.species] || QUAD.dog; return (Q.bl * 1.05 + 4) * (S.size || 1) * (bat ? 1.75 : 1); }
    if (S.kind === 'bird') return 7 * (S.size || 1) * (bat ? 1.7 : 1);
    const b = BODY[S.body] || BODY.adult;
    return (b.hw + 6) * (S.size || 1) * (bat ? 1.6 : 1);
  }

  // =================================================================================== public API
  G.Sprites = {
    define,
    has: (id) => !!SPECS[id],
    ids: () => Object.keys(SPECS),
    spec: (id) => RAW[id],
    drawChar(ctx, id, dir, frame, x, y, o = {}) {
      if (!SPECS[id]) id = 'villager_m';
      const S = SPECS[id];
      const view = dir === 'up' ? 'back' : dir === 'down' ? 'front' : 'side';
      let f = ((frame | 0) % 4 + 4) % 4;
      if (f === 2) f = 0;
      const ghost = !!(S.ghost || o.ghost);
      const c = mapFrame(id, view, f, ghost);
      const sc = o.scale || 1;
      const flip = dir === 'right';
      let bob = f ? -1.2 * sc : 0;
      if (S.kind === 'bird') bob = 0;
      if (ghost) bob += (Math.sin((G.time || 0) * 2.4 + x * 0.05) * 2 - 3) * sc;
      ctx.save();
      const a = o.alpha != null ? o.alpha : 1;
      if (o.shadow !== false) {
        const s = shadowSprite(shadowR(S, false) * sc);
        ctx.globalAlpha = a * (ghost ? 0.45 : 1);
        ctx.drawImage(s, x - s.ax, y - s.ay, s.lw, s.lh);
      }
      ctx.globalAlpha = a * (ghost ? 0.78 : 1);
      if (flip) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(c, -c.ax * sc, y - c.ay * sc + bob, c.lw * sc, c.lh * sc); }
      else ctx.drawImage(c, x - c.ax * sc, y - c.ay * sc + bob, c.lw * sc, c.lh * sc);
      ctx.restore();
    },
    drawBattle(ctx, id, pose, t, x, y, o = {}) {
      if (!SPECS[id]) id = 'villager_m';
      const S = SPECS[id];
      if (!['idle', 'ready', 'attack', 'cast', 'hurt', 'ko', 'guard', 'victory', 'item'].includes(pose)) pose = 'idle';
      const ghost = !!(S.ghost || o.ghost);
      const c = battleFrame(id, pose, ghost);
      t = t || 0;
      const sc = o.scale || 1;
      const a = o.alpha != null ? o.alpha : 1;
      ctx.save();
      if (o.shadow !== false) {
        const s = shadowSprite(shadowR(S, true) * sc * (pose === 'ko' ? 1.9 : 1));
        ctx.globalAlpha = a * (ghost ? 0.45 : 1);
        ctx.drawImage(s, x - s.ax, y - s.ay, s.lw, s.lh);
      }
      ctx.translate(x, y);
      if (o.flip) ctx.scale(-1, 1);
      // live cast aura under the feet
      if (pose === 'cast') {
        const col = S.aura || '#9fe0ff', r = 46 * (S.size || 1) * sc;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * (0.55 + 0.25 * Math.sin(t * 6));
        ctx.scale(1, 0.32);
        const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
        g.addColorStop(0, rgba(col, 0.0)); g.addColorStop(0.7, rgba(col, 0.35)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.8, t * 2, t * 2 + PI * 1.6); ctx.stroke();
        ctx.restore();
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let j = 0; j < 6; j++) {
          const ph = (t * 0.8 + j / 6) % 1, px = Math.sin(j * 2.3 + t) * r * 0.6, py = -ph * 120 * sc;
          ctx.globalAlpha = a * (1 - ph) * 0.8; ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(px, py, 2 * sc, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      let sy = 1, dy = 0;
      if (pose === 'idle' || pose === 'ready' || pose === 'guard' || pose === 'cast') { sy = 1 + Math.sin(t * 2.4) * 0.012; }
      if (pose === 'victory') dy = -abs(Math.sin(t * 3)) * 3 * sc;
      if (ghost) dy += (Math.sin(t * 2.2) * 3 - 4) * sc;
      ctx.globalAlpha = a * (ghost ? 0.8 : 1);
      ctx.scale(sc, sc * sy);
      ctx.drawImage(c, -c.ax, -c.ay + dy / sc, c.lw, c.lh);
      ctx.restore();
    },
    // size info for engines/tools: approximate logical bounds of the map frame / battle pose
    frameInfo(id, kind = 'map', poseOrDir = 'down') {
      if (!SPECS[id]) return null;
      const c = kind === 'map' ? mapFrame(id, poseOrDir === 'up' ? 'back' : poseOrDir === 'down' ? 'front' : 'side', 0, false) : battleFrame(id, poseOrDir, false);
      return { w: c.lw, h: c.lh, ax: c.ax, ay: c.ay };
    },
    clearCache() { CACHE.clear(); },
    // optional: pre-render all map frames (and battle poses if battle=true) to avoid first-use hitches
    preload(ids, battle) {
      for (const id of ids || []) {
        if (!SPECS[id]) continue;
        const S = SPECS[id], g = !!S.ghost;
        for (const v of ['front', 'back', 'side']) for (const f of [0, 1, 3]) mapFrame(id, v, f, g);
        if (battle) for (const p of ['idle', 'ready', 'attack', 'cast', 'hurt', 'ko', 'guard', 'victory', 'item']) battleFrame(id, p, g);
      }
    },
  };

  // =================================================================================== character specs
  const SK = { fair: '#f8e3d2', light: '#f3d2b6', warm: '#ebc29c', tan: '#d8a47c', deep: '#bf8a62', old: '#e8c5a6', pale: '#ece6ea', ghost: '#e2e8f0' };
  const HC = { black: '#25222d', ink: '#1e2130', brown: '#4a3328', grey: '#8f8c94', white: '#e8e6ec', silver: '#e4ecf4' };

  // ---------------------------------------------------------------- main cast
  define('xinghe', { // 沈星河: messy dark short topknot, indigo short jacket, white inner, straw sandals, red string bracelet, sword on back
    body: 'adult', skin: SK.light, eyes: '#8a5230', eyeStyle: 'round',
    hair: { style: 'messy', color: '#2b2632', back: 'short', knot: 'topknot', tie: '#b8322c' },
    top: { color: '#34477e', len: 0.2, closure: 'cross', inner: '#f4f0e6', trim: '#23305c', sleeve: 'rolled' },
    sash: { color: '#7a4f34', w: 2.8, tails: true },
    bottom: { type: 'pants', color: '#2d2a34' }, shoes: { type: 'sandal', color: '#cfae72' },
    bracelet: { color: '#e0302a' }, back: 'sword', weapon: 'sword', aura: '#ff9a3c',
  });
  define('baizhi', { // 白芷 — client pick v2 #02 藍衫笛歌: long black hair half-up (jade comb, red string), indigo Hakka 藍衫 to mid-calf
    // with turned-back light-blue cuffs, dark 圍身裙 apron, black trousers, cloth shoes, jade flute (docs/design/v2/baizhi.md)
    body: 'female', skin: '#f3dccb', eyes: '#4a3024', eyeStyle: 'soft', brows: 'soft', mouth: 'smile',
    hair: { style: 'side', color: '#17151c', sheen: '#3a4a6a', back: 'long', len: 0.8, knot: 'halfup', tie: '#c3303a', locks: 1.2, pins: [{ type: 'gold', color: '#9fd3bd' }] },
    top: { color: '#36598a', len: 0.78, closure: 'side', inner: '#f4efe6', trim: '#a9c9e6', sleeve: 'wide', cuff: '#a9c9e6' },
    apron: { color: '#2b2a3a', len: 0.7 },
    bottom: { type: 'pants', color: '#1e1d26' },
    shoes: { type: 'cloth', color: '#2b2a3a' }, hip: ['jade'],
    glow: '#bfe8ff', weapon: 'flute', aura: '#7fd3ff',
  });
  define('hongying', { // 洛紅纓: black high ponytail with long red ribbon, crimson short robe, black leather vest & arm guards, white trousers, boots, red-tassel spear
    body: 'female', skin: SK.light, eyes: '#5a2620', eyeStyle: 'sharp', brows: 'fierce', mouth: 'flat',
    hair: { style: 'side', color: '#1f1c26', back: 'ponytail', len: 0.5, tie: '#d8282a', ribbon: true },
    top: { color: '#b4252c', len: 0.34, closure: 'cross', inner: '#f2ece2', trim: '#7a141a', sleeve: 'long' },
    vest: { color: '#25212a', trim: '#4e3e34', len: 0.04 },
    belt: { color: '#2a2228', buckle: '#d6b25a' }, bracers: { color: '#2a2328' },
    bottom: { type: 'pants', color: '#efe9de' }, shoes: { type: 'boots', color: '#2a2228' },
    back: 'spear', weapon: 'spear', aura: '#ffd36a',
  });
  define('yungui', { // 雲歸: long black half-up hair with wooden crown pin, faded blue-grey Taoist robe, yin-yang sash, gourd, fan
    body: 'tall', skin: '#efd2b8', eyes: '#3c3846', eyeStyle: 'narrow', mouth: 'smirk',
    hair: { style: 'part', color: '#24212c', back: 'long', len: 0.42, knot: 'halfup', locks: 0.7 },
    hat: { type: 'crown', color: '#9a6b3c', acc: '#efe4c8' },
    top: { color: '#7f90a2', len: 0.95, closure: 'cross', inner: '#ece8df', trim: '#4f5e70', sleeve: 'flow' },
    sash: { color: '#2b2a32', w: 3.4, emblem: 'taiji', tails: true },
    shoes: { type: 'cloth', color: '#2a2832' }, hip: ['gourd', 'fan'], weapon: 'fan', aura: '#9be36a',
  });
  define('tuanzi', { kind: 'quad', species: 'leopardcat', size: 1.3, aura: '#ffcf6a' }); // 糰子 石虎 spirit
  // 芋圓 Yuyuan: chubby blue-grey tabby, 星河's cat (client reference, docs/design/REFERENCES.md)
  define('yuyuan', { kind: 'quad', species: 'cat', size: 1.35, aura: '#d8c8ff',
    col: { base: '#8d929b', belly: '#dfe1e4', dark: '#4b4f57', nose: '#d99aa0', eye: '#a3ad3c' } });
  // 麻糬 Mochi: fluffy long-haired dilute calico, 白芷's companion (client reference)
  define('mochi', { kind: 'quad', species: 'cat', size: 1.3, aura: '#bfe8ff',
    col: { base: '#f3efe8', belly: '#ffffff', dark: '#8e939c', nose: '#f2a2ac', eye: '#b9cc3a' } });

  // ---------------------------------------------------------------- important NPCs
  define('chenbo', { // 陳伯: grumpy old lantern-maker, retired 引魂人
    body: 'elder', skin: SK.old, eyes: '#4a3328', eyeStyle: 'dot', brows: 'grumpy', mouth: 'frown',
    hair: { style: 'back', color: '#b4b0aa', knot: 'topknot', tie: '#5a4030' },
    face: { beard: 'goatee', beardColor: '#c8c4be' },
    top: { color: '#6a5a48', len: 0.28, closure: 'side', trim: '#4a3c30', sleeve: 'rolled' },
    apron: { color: '#463a32', len: 0.62 }, bottom: { type: 'wide', color: '#38322e' },
    shoes: { type: 'cloth' }, held: 'lantern', weapon: 'oar', aura: '#7fd3ff',
  });
  define('yexuan', { // 夜玄: head of 長明宮, calm & tragic; black-and-gold robes, lantern staff
    body: 'tall', skin: '#f1ddcc', eyes: '#b89a5a', eyeStyle: 'narrow', brows: 'soft', mouth: 'flat',
    hair: { style: 'center', color: '#1c1a26', sheen: '#5a5a7a', back: 'long', len: 0.55, knot: 'halfup', locks: 1.0 },
    hat: { type: 'crown', color: '#d6b25a', acc: '#f2e6c0' },
    top: { color: '#1d1c2a', len: 1.0, closure: 'cross', inner: '#f2efe8', trim: '#d4b25e', sleeve: 'flow', cuff: '#d4b25e', emb: '#d4b25e' },
    sash: { color: '#d4b25e', w: 3, tails: true }, cape: { color: '#2a2838', len: 0.95, collarColor: '#3a3650' },
    shoes: { type: 'cloth', color: '#1a1820' }, held: 'lstaff', weapon: 'lstaff', aura: '#a8d8ff',
  });
  define('qingfeng', { // 洛青鋒: 紅纓's elder brother, 洛家劍
    body: 'adult', skin: SK.light, eyes: '#4a2420', eyeStyle: 'sharp', brows: 'fierce', mouth: 'flat',
    hair: { style: 'side', color: '#1e1b24', back: 'ponytail', len: 0.32, tie: '#7a1a20' },
    top: { color: '#6a1e26', len: 0.34, closure: 'cross', inner: '#1c1a20', trim: '#2a1a1e', sleeve: 'long' },
    belt: { color: '#1e1a1e', buckle: '#b89a4a' }, bracers: { color: '#1e1a1e' },
    bottom: { type: 'pants', color: '#1e1c24' }, shoes: { type: 'boots', color: '#1a171c' },
    hip: ['sword'], weapon: 'sword', aura: '#ff6a5a',
  });
  define('qingfeng_mask', { base: 'qingfeng', // 「鬼面」
    face: { mask: 'ghost' }, top: { color: '#3a1a20', inner: '#141218' },
    cape: { color: '#17151c', len: 0.75, ragged: true, collarColor: '#24212a' }, aura: '#d04a5a',
  });
  define('qingxu', { // 清虛真人: old Taoist master
    body: 'elder', skin: SK.old, eyes: '#4a4048', eyeStyle: 'line', brows: 'soft',
    hair: { style: 'back', color: '#ecebef', back: 'long', len: 0.35, knot: 'bunTop' },
    hat: { type: 'crown', color: '#d6b25a', acc: '#f2e6c0' },
    face: { beard: 'long', beardColor: '#f2f0f4' },
    top: { color: '#e6ecf2', len: 1.0, closure: 'cross', inner: '#ffffff', trim: '#3c5a8a', sleeve: 'flow', cuff: '#3c5a8a' },
    sash: { color: '#3c5a8a', w: 3, emblem: 'taiji' }, shoes: { type: 'cloth', color: '#2a2832' },
    held: 'whisk', weapon: 'sword', aura: '#b8f06a',
  });
  define('moya', { // 墨鴉: 長明宮 envoy in a crow-feather cloak, smug
    body: 'adult', skin: '#eedcd0', eyes: '#7a3a9a', eyeStyle: 'sharp', mouth: 'smirk',
    hair: { style: 'wild', color: '#1c1a24', sheen: '#6a5a9a', back: 'short' },
    top: { color: '#1e1c26', len: 0.6, closure: 'cross', inner: '#5a2a6a', trim: '#4a3a5a', sleeve: 'long' },
    cape: { color: '#221f2c', len: 0.85, feathers: true, collar: 7 }, belt: { color: '#3a3044', buckle: '#b0a0d0' },
    bottom: { type: 'pants', color: '#1a1820' }, shoes: { type: 'boots', color: '#18161c' },
    held: 'ffan', weapon: 'ffan', aura: '#b07aff',
  });
  define('tengpo', { // 藤婆: fictional immortal hermit herbalist (belongs to no real people): vine-tied white hair, pipe, mossy robes
    body: 'elderf', skin: '#e2c2a0', eyes: '#5a6a3a', eyeStyle: 'line', mouth: 'smirk',
    hair: { style: 'back', color: '#efece4', back: 'long', len: 0.45, knot: 'bun', vines: true },
    top: { color: '#5e6b46', len: 0.95, closure: 'cross', inner: '#cfc6a2', trim: '#7d6b48', sleeve: 'wide', emb: '#8ea05a', lowBands: [{ at: 0.86, h: 0.08, color: '#4c5a38', acc: '#9aac64', motif: 'zigzag' }] },
    sash: { color: '#8a6a44', w: 2.6 }, shoes: { type: 'sandal' }, held: 'pipe', back: 'herbs',
  });
  define('nianer', { // 夜念: tired little ghost girl
    body: 'child', skin: SK.pale, eyes: '#5a6a8a', eyeStyle: 'soft', brows: 'soft', mouth: 'flat',
    hair: { style: 'straight', color: '#2a2834', knot: 'twin', tie: '#d0d8e8' },
    top: { color: '#f2f2f6', len: 0.9, closure: 'side', trim: '#b8c4d8', sleeve: 'long' },
    shoes: { type: 'cloth', color: '#e8eaf0' }, held: 'lantern', ghost: true,
  });
  define('lantern_mother', { // 燈母: glowing robed goddess (vision of light)
    body: 'tallf', size: 1.12, skin: '#fff4e8', eyes: '#e0a840', eyeStyle: 'line', brows: 'soft',
    hair: { style: 'center', color: '#fff2d6', sheen: '#ffd890', back: 'long', len: 0.7, knot: 'bunTop', locks: 1.3, pins: [{ type: 'gold', color: '#f2c860' }] },
    top: { color: '#fff7e6', len: 1.05, closure: 'cross', inner: '#ffffff', trim: '#e8c060', sleeve: 'flow', cuff: '#f0d080', emb: '#e8c060' },
    skirt: { color: '#ffeccc', len: 1.05, flare: 0.7, trim: '#e8c060' }, sash: { color: '#e8c060', w: 2.6 },
    shoes: { type: 'cloth', color: '#fff0d0' }, held: 'lantern', glow: '#ffd98a', halo: '#ffd27a',
  });

  // ---------------------------------------------------------------- Han NPC archetypes (Qing-era Taiwanese dress)
  define('villager_m', { body: 'adult', skin: SK.warm, eyes: '#3a2a22', eyeStyle: 'dot',
    hair: { style: 'messy', color: HC.black, knot: 'topknot' }, hat: { type: 'douli' },
    top: { color: '#4f6a8a', len: 0.24, closure: 'center', trim: '#3a4e68', sleeve: 'rolled' },
    sash: { color: '#8a7a5a', w: 2.2, tails: false }, bottom: { type: 'cropped', color: '#2f2e36' }, shoes: { type: 'sandal' } });
  define('villager_f', { body: 'female', skin: SK.light, eyes: '#3a2a22', eyeStyle: 'soft',
    hair: { style: 'part', color: HC.black, knot: 'bun', pins: [{ type: 'gold' }] },
    top: { color: '#6f9488', len: 0.42, closure: 'side', trim: '#2f4a44', sleeve: 'wide', cuff: '#2f4a44' },
    bottom: { type: 'wide', color: '#2c2b34' }, shoes: { type: 'cloth' } });
  define('villager_m2', { body: 'stout', skin: SK.tan, eyes: '#3a2a22', eyeStyle: 'dot', mouth: 'smile',
    hair: { style: 'back', color: HC.black, knot: 'topknot' }, hat: { type: 'band', color: '#e8e2d2' },
    top: { color: '#8a6a4a', len: 0.22, closure: 'side', trim: '#5a4430', sleeve: 'rolled' }, towel: { color: '#efeadc' },
    bottom: { type: 'cropped', color: '#3a3a40' }, shoes: { type: 'sandal' }, held: 'hoe' });
  define('villager_f2', { body: 'female', skin: SK.warm, eyes: '#3a2a22', eyeStyle: 'dot',
    hair: { style: 'part', color: HC.black, knot: 'bun' }, hat: { type: 'scarf', color: '#c8505a', acc: '#f6e0a0' },
    top: { color: '#5a7aa6', len: 0.4, closure: 'side', trim: '#2a3a5a', sleeve: 'wide' }, apron: { color: '#3a3640', len: 0.6 },
    bottom: { type: 'wide', color: '#2c2b34' }, shoes: { type: 'cloth' }, held: 'basket' });
  define('old_m', { body: 'elder', skin: SK.old, eyes: '#3a2a22', eyeStyle: 'line', mouth: 'smile',
    hair: { style: 'back', color: '#a8a6a4', knot: 'topknot' }, face: { beard: 'whiskers', beardColor: '#cfcbc4' },
    top: { color: '#7a6650', len: 0.32, closure: 'center', trim: '#5a4a3a', sleeve: 'long' },
    bottom: { type: 'wide', color: '#3a3632' }, shoes: { type: 'cloth' }, held: 'cane' });
  define('old_f', { body: 'elderf', skin: SK.old, eyes: '#3a2a22', eyeStyle: 'line', mouth: 'smile',
    hair: { style: 'back', color: '#b4b2b6', knot: 'bun', pins: [{ type: 'gold' }] },
    top: { color: '#3e4656', len: 0.42, closure: 'side', trim: '#8a9ab8', sleeve: 'wide', cuff: '#8a9ab8' },
    bottom: { type: 'wide', color: '#26252c' }, shoes: { type: 'cloth' }, held: 'cane' });
  define('child_m', { body: 'child', skin: SK.warm, eyes: '#3a2a22', mouth: 'smile',
    hair: { style: 'tuft', color: HC.black, knot: 'topknot', tie: '#c0302a' },
    top: { color: '#d4a24a', len: 0.2, closure: 'side', trim: '#8a5a2a', sleeve: 'short' },
    bottom: { type: 'shorts', color: '#4a4a5a' }, shoes: { type: 'bare' } });
  define('child_f', { body: 'child', skin: SK.light, eyes: '#3a2a22', eyeStyle: 'soft', mouth: 'smile',
    hair: { style: 'straight', color: HC.black, knot: 'twin', tie: '#e0303a' },
    top: { color: '#d0544a', len: 0.3, closure: 'side', trim: '#f2d8a0', sleeve: 'wide' },
    bottom: { type: 'cropped', color: '#3a4a6a' }, shoes: { type: 'cloth', color: '#c0302a' } });
  define('miner', { body: 'adult', skin: SK.tan, eyes: '#2a2018', eyeStyle: 'dot', brows: 'grumpy',
    hair: { style: 'messy', color: HC.black }, hat: { type: 'band', color: '#d8d0bc' },
    top: { color: '#6d5c48', len: 0.24, closure: 'open', inner: '#c8b8a0', trim: '#4a3c2e', sleeve: 'rolled' },
    belt: { color: '#3a2a20' }, bottom: { type: 'cropped', color: '#3c3a3a' }, shoes: { type: 'sandal' }, hip: ['lamp'], held: 'pick' });
  define('fisherman', { body: 'adult', skin: SK.deep, eyes: '#2a2018', eyeStyle: 'dot', mouth: 'smile',
    hair: { style: 'messy', color: HC.black }, hat: { type: 'douli', color: '#cfae6e' },
    top: { color: '#4c6a7e', len: 0.18, closure: 'open', inner: SK.deep, trim: '#2e4454', sleeve: 'short' },
    sash: { color: '#c8b890', w: 2, tails: false }, bottom: { type: 'shorts', color: '#2e3440' }, shoes: { type: 'bare' }, hip: ['creel'], held: 'rod' });
  define('merchant', { body: 'stout', skin: SK.light, eyes: '#3a2a22', eyeStyle: 'line', mouth: 'smile',
    hair: { style: 'back', color: HC.black }, hat: { type: 'cap', color: '#26232e', acc: '#c0302a' }, face: { beard: 'mustache' },
    top: { color: '#6a3e5e', len: 0.95, closure: 'side', trim: '#3a2234', sleeve: 'long' }, vest: { color: '#22202c', trim: '#c9a24e', len: 0.1, open: true },
    shoes: { type: 'cloth' }, held: 'abacus', hip: ['jade'] });
  define('shopkeeper_f', { body: 'female', skin: SK.light, eyes: '#3a2a22', eyeStyle: 'soft', mouth: 'smile',
    hair: { style: 'part', color: HC.black, knot: 'bun', pins: [{ type: 'flower', color: '#e8607a' }] },
    top: { color: '#b8664a', len: 0.4, closure: 'side', trim: '#5a2a1a', sleeve: 'wide' }, apron: { color: '#efe7d6', len: 0.62 },
    bottom: { type: 'wide', color: '#2e2c34' }, shoes: { type: 'cloth' } });
  define('scholar', { body: 'adult', skin: SK.fair, eyes: '#3a3040', eyeStyle: 'round', mouth: 'flat',
    hair: { style: 'part', color: HC.black, back: 'short' }, hat: { type: 'scholar', color: '#26252e' },
    top: { color: '#a8bccf', len: 1.0, closure: 'cross', inner: '#f2f0ea', trim: '#4a5e78', sleeve: 'wide' },
    sash: { color: '#4a5e78', w: 2, tails: true }, shoes: { type: 'cloth' }, held: 'book' });
  define('monk', { body: 'adult', skin: SK.warm, eyes: '#3a2a22', eyeStyle: 'line', mouth: 'smile',
    hair: { style: 'bald', color: '#8a6a5a' },
    top: { color: '#8f7a52', len: 1.0, closure: 'cross', inner: '#d8ccb0', trim: '#6a5a3a', sleeve: 'wide' }, kasaya: { color: '#a8502e' },
    beads: { colors: ['#5a3a2a', '#6a4a32'], rows: 1 }, beadsOver: true, shoes: { type: 'cloth', color: '#5a4a3a' }, held: 'beads' });
  define('taoist', { body: 'adult', skin: SK.light, eyes: '#3a2a22', eyeStyle: 'narrow',
    hair: { style: 'back', color: HC.black, knot: 'bunTop' }, hat: { type: 'taoist', color: '#22212c', acc: '#d8c06a' }, face: { beard: 'whiskers' },
    top: { color: '#2b3046', len: 1.0, closure: 'cross', inner: '#efebe0', trim: '#c8a84e', sleeve: 'flow' },
    sash: { color: '#c8a84e', w: 2.4 }, shoes: { type: 'cloth' }, held: 'whisk', weapon: 'whisk', aura: '#e8d070' });
  define('temple_guard', { body: 'stout', skin: SK.warm, eyes: '#2a2018', eyeStyle: 'sharp', brows: 'fierce', mouth: 'flat',
    hair: { style: 'back', color: HC.black }, hat: { type: 'guard', color: '#2a2d40', acc: '#c9a24e' },
    top: { color: '#3a3e5a', len: 0.55, closure: 'cross', inner: '#d8d2c4', trim: '#c9a24e', sleeve: 'long' },
    armor: { color: '#4a4e66', trim: '#c9a24e' }, belt: { color: '#2a2230', buckle: '#c9a24e' }, bracers: { color: '#2a2d40' },
    bottom: { type: 'pants', color: '#22222e' }, shoes: { type: 'boots', color: '#1e1e26' }, held: 'glaive', weapon: 'glaive', aura: '#9fd8ff' });
  define('soldier', { body: 'adult', skin: SK.warm, eyes: '#2a2018', eyeStyle: 'dot', brows: 'grumpy', mouth: 'flat',
    hair: { style: 'back', color: HC.black }, hat: { type: 'qing', color: '#3a3238', acc: '#c8282a' },
    top: { color: '#2f3b66', len: 0.4, closure: 'side', trim: '#1e2644', sleeve: 'long' }, vest: { color: '#b8342a', trim: '#2a1a1a', len: 0.12, open: false },
    patch: { text: '勇', color: '#1e2644' }, bottom: { type: 'wide', color: '#2a2a34' }, shoes: { type: 'boots', color: '#1e1c22' }, held: 'spear' });
  define('noble_m', { body: 'adult', skin: SK.fair, eyes: '#3a2a22', eyeStyle: 'narrow', mouth: 'smirk',
    hair: { style: 'back', color: HC.black }, hat: { type: 'cap', color: '#1c1a26', acc: '#c8282a' }, face: { beard: 'mustache' },
    top: { color: '#2f5070', len: 1.0, closure: 'side', trim: '#c9a24e', sleeve: 'long', emb: '#c9a24e' }, vest: { color: '#1c1b28', trim: '#c9a24e', len: 0.12, open: false },
    shoes: { type: 'cloth' }, held: 'fan', hip: ['jade'] });
  define('noble_f', { body: 'female', skin: SK.fair, eyes: '#4a2a2a', eyeStyle: 'soft', mouth: 'smile',
    hair: { style: 'center', color: HC.black, knot: 'bunTop', pins: [{ type: 'gold' }, { type: 'flower', color: '#f080a0' }] },
    top: { color: '#d88aa0', len: 0.62, closure: 'side', trim: '#c9a24e', sleeve: 'wide', cuff: '#f6e0e8', emb: '#c9a24e' },
    skirt: { color: '#7a3a5a', len: 1.0, flare: 0.5, trim: '#c9a24e' }, shoes: { type: 'cloth', color: '#c0405a' }, held: 'fan' });
  define('maid', { body: 'female', skin: SK.light, eyes: '#3a2a22', eyeStyle: 'soft',
    hair: { style: 'straight', color: HC.black, knot: 'twin', tie: '#5a8a7a' },
    top: { color: '#8fb0a0', len: 0.38, closure: 'side', trim: '#3a5a4e', sleeve: 'wide' }, apron: { color: '#f0ece2', len: 0.6 },
    bottom: { type: 'wide', color: '#3a4a46' }, shoes: { type: 'cloth' }, held: 'tray' });
  define('servant_old', { body: 'elder', skin: SK.old, eyes: '#3a2a22', eyeStyle: 'dot', mouth: 'flat',
    hair: { style: 'back', color: '#9a9894', knot: 'topknot' },
    top: { color: '#5a4e42', len: 0.3, closure: 'center', trim: '#3a3028', sleeve: 'rolled' }, apron: { color: '#3a342e', len: 0.5 },
    bottom: { type: 'wide', color: '#2e2a28' }, shoes: { type: 'cloth' }, held: 'broom' });
  define('actress', { body: 'female', skin: '#fbefe8', eyes: '#3a2020', eyeStyle: 'soft', mouth: 'smile', // 歌仔戲 costume
    face: { paint: { base: '#fbf2ee', style: 'opera' } },
    hair: { style: 'center', color: HC.black, back: 'long', len: 0.4 }, hat: { type: 'ornate', color: '#d8b04c' },
    top: { color: '#e04a6a', len: 0.62, closure: 'side', trim: '#f2c84a', sleeve: 'wide', ext: '#fbfbff', emb: '#f2c84a' },
    skirt: { color: '#f6e6c8', len: 1.0, flare: 0.5, trim: '#e04a6a' }, sash: { color: '#f2c84a', w: 2.4 }, shoes: { type: 'cloth', color: '#e04a6a' } });
  define('storyteller', { body: 'elder', skin: SK.old, eyes: '#3a2a22', eyeStyle: 'line', mouth: 'smile', // 阿炳
    hair: { style: 'back', color: '#8a8890' }, hat: { type: 'cap', color: '#2a2832', acc: '#c0302a' }, face: { beard: 'goatee', beardColor: '#bab6b0', glasses: true },
    top: { color: '#6a7a8e', len: 0.98, closure: 'side', trim: '#3a4656', sleeve: 'wide' }, vest: { color: '#2e2a30', trim: '#8a7a5a', len: 0.12, open: false },
    shoes: { type: 'cloth' }, held: 'fan' });
  define('doctor', { body: 'adult', skin: SK.light, eyes: '#3a2a22', eyeStyle: 'narrow', mouth: 'flat', // 林大夫
    hair: { style: 'back', color: HC.black, knot: 'bunTop' }, hat: { type: 'scholar', color: '#3a3a44' }, face: { beard: 'whiskers' },
    top: { color: '#5e7060', len: 0.98, closure: 'cross', inner: '#efebe0', trim: '#38463a', sleeve: 'wide' },
    sash: { color: '#38463a', w: 2 }, shoes: { type: 'cloth' }, held: 'medbox' });
  define('hunter', { body: 'adult', skin: SK.tan, eyes: '#2a2018', eyeStyle: 'sharp', brows: 'fierce', mouth: 'flat',
    hair: { style: 'messy', color: HC.black, knot: 'topknot' }, hat: { type: 'band', color: '#5a4a3a' },
    top: { color: '#6a6440', len: 0.26, closure: 'cross', inner: '#d8ccb0', trim: '#4a4430', sleeve: 'rolled' }, vest: { color: '#8a6a4a', trim: '#c8b090', len: 0.1 },
    belt: { color: '#3a2a20' }, bottom: { type: 'pants', color: '#3a3830' }, leggings: { color: '#6a5a44' }, shoes: { type: 'sandal' }, back: 'quiver', held: 'bow', hip: ['knife'] });
  define('sailor', { body: 'adult', skin: SK.deep, eyes: '#2a2018', eyeStyle: 'dot', mouth: 'smile',
    hair: { style: 'messy', color: HC.black }, hat: { type: 'scarf', color: '#3a5a8a' },
    top: { color: '#d8d0c0', len: 0.2, closure: 'open', inner: SK.deep, trim: '#8a7a6a', sleeve: 'short' },
    sash: { color: '#c0302a', w: 2.6 }, bottom: { type: 'wide', color: '#2e3a52' }, shoes: { type: 'bare' } });
  define('boatman', { body: 'adult', skin: SK.deep, eyes: '#2a2018', eyeStyle: 'dot',
    hair: { style: 'messy', color: HC.black }, hat: { type: 'douli', color: '#c8a868' },
    top: { color: '#5a6a72', len: 0.22, closure: 'center', trim: '#3a464c', sleeve: 'rolled' },
    bottom: { type: 'shorts', color: '#2e3036' }, shoes: { type: 'bare' }, held: 'paddle' });
  define('widow', { body: 'female', skin: SK.fair, eyes: '#3a2a2a', eyeStyle: 'soft', brows: 'soft', mouth: 'flat', // 阿蓮, in plain mourning white
    hair: { style: 'part', color: HC.black, knot: 'bun', pins: [{ type: 'flower', color: '#f4f2ee' }] },
    top: { color: '#e8e4dc', len: 0.95, closure: 'side', trim: '#b8b0a0', sleeve: 'wide' },
    sash: { color: '#cfc8b8', w: 2, tails: false }, shoes: { type: 'cloth', color: '#e8e4dc' } });
  define('ghost_m', { body: 'adult', skin: SK.ghost, eyes: '#3a4a5a', eyeStyle: 'dot', brows: 'soft', mouth: 'flat', ghost: true,
    hair: { style: 'wild', color: '#3a3a48', back: 'long', len: 0.3 },
    top: { color: '#b8c2cc', len: 0.5, closure: 'cross', inner: '#e0e6ec', trim: '#8a96a4', sleeve: 'long' }, bottom: { type: 'wide', color: '#7a8696' }, shoes: { type: 'bare' } });
  define('ghost_f', { body: 'female', skin: SK.ghost, eyes: '#3a4a5a', eyeStyle: 'soft', brows: 'soft', mouth: 'flat', ghost: true,
    hair: { style: 'center', color: '#2a2a36', back: 'long', len: 0.62, locks: 1.4 },
    top: { color: '#e4e8ee', len: 1.0, closure: 'side', trim: '#a8b4c4', sleeve: 'wide' }, shoes: { type: 'bare' } });
  define('ghost_child', { body: 'child', skin: SK.ghost, eyes: '#3a4a5a', eyeStyle: 'soft', brows: 'soft', mouth: 'flat', ghost: true,
    hair: { style: 'straight', color: '#2a2a36', knot: 'topknot' },
    top: { color: '#d8dee8', len: 0.35, closure: 'side', trim: '#98a4b4', sleeve: 'short' }, bottom: { type: 'shorts', color: '#8894a4' }, shoes: { type: 'bare' } });
  define('linto', { body: 'female', skin: '#eee8ee', eyes: '#4a3a4a', eyeStyle: 'soft', brows: 'soft', mouth: 'flat', ghost: true, ghostTint: '#c8a0d8', // 林投姐: a wronged spirit
    hair: { style: 'center', color: '#1e1c26', back: 'long', len: 0.75, locks: 1.5 },
    top: { color: '#ece6ea', len: 1.02, closure: 'side', trim: '#a88a9a', sleeve: 'wide' }, sash: { color: '#a85a6a', w: 2, tails: true }, shoes: { type: 'bare' } });
  define('woodcutter', { body: 'adult', skin: SK.tan, eyes: '#2a2018', eyeStyle: 'dot', mouth: 'smile',
    hair: { style: 'messy', color: HC.black, knot: 'topknot' }, hat: { type: 'band', color: '#8a6a4a' },
    top: { color: '#6b5e4a', len: 0.22, closure: 'side', trim: '#4a3e30', sleeve: 'rolled' }, belt: { color: '#3a2a20' },
    bottom: { type: 'cropped', color: '#3a3832' }, leggings: { color: '#c8b890' }, shoes: { type: 'sandal' }, back: 'bundle', held: 'axe' });
  define('tea_girl', { body: 'female', skin: SK.warm, eyes: '#3a2a22', eyeStyle: 'soft', mouth: 'smile',
    hair: { style: 'part', color: HC.black, back: 'short' }, hat: { type: 'tea', color: '#dcc088', fringe: '#f0ece2' },
    top: { color: '#7aa0b8', len: 0.36, closure: 'side', trim: '#3a5a6e', sleeve: 'long', cuff: '#f0ece2' },
    bottom: { type: 'wide', color: '#2e3440' }, shoes: { type: 'cloth' }, back: 'basket' });

  // ---------------------------------------------------------------- regional (see STORY_BIBLE cultural guide)
  define('temple_keeper', { body: 'elder', skin: SK.old, eyes: '#3a2a22', eyeStyle: 'line', mouth: 'smile', // 廟公
    hair: { style: 'back', color: '#a4a2a0' }, hat: { type: 'cap', color: '#2a2630', acc: '#d8b04c' }, face: { beard: 'whiskers', beardColor: '#d0ccc6' },
    top: { color: '#6b5544', len: 0.98, closure: 'side', trim: '#3e3028', sleeve: 'wide' }, vest: { color: '#2e2a2e', trim: '#8a6a4a', len: 0.12, open: false },
    shoes: { type: 'cloth' }, held: 'incense' });
  define('hakka_m', { body: 'adult', skin: SK.warm, eyes: '#2a2018', eyeStyle: 'dot', mouth: 'smile',
    hair: { style: 'back', color: HC.black, knot: 'topknot' }, hat: { type: 'douli', color: '#d4b470' },
    top: { color: '#2f5a96', len: 0.3, closure: 'side', trim: '#1a2c4e', sleeve: 'rolled' }, towel: { color: '#f0ece2' },
    bottom: { type: 'wide', color: '#1e1e26' }, shoes: { type: 'sandal' } });
  define('hakka_f', { body: 'female', skin: SK.light, eyes: '#2a2018', eyeStyle: 'soft', mouth: 'smile', // 藍衫 with contrasting cuffs, 涼笠 with cloth curtain
    hair: { style: 'part', color: HC.black, knot: 'bun', pins: [{ type: 'gold' }] }, hat: { type: 'douli', color: '#d8ba78', fringe: '#25232c' },
    top: { color: '#3a68aa', len: 0.62, closure: 'side', trim: '#1c2440', sleeve: 'wide', cuff: '#9cc0ea' },
    bottom: { type: 'wide', color: '#1e1d26' }, shoes: { type: 'cloth' } });
  define('saisiyat_elder', { body: 'elder', skin: SK.tan, eyes: '#2a2018', eyeStyle: 'line', mouth: 'flat', // 賽夏: white ramie with red woven bands, woven headband
    hair: { style: 'back', color: '#9a9896' }, hat: { type: 'band', color: '#efe8d8', acc: '#b8282a', motif: 'diamond', h: 3.4 },
    top: { color: '#2e2a2c', len: 0.25, closure: 'round', sleeve: 'long' },
    vest: { color: '#eee6d4', trim: '#b8282a', len: 0.3, bands: [{ at: 0.35, h: 0.12, color: '#b8282a', acc: '#f4ecdc', motif: 'diamond' }, { at: 0.82, h: 0.1, color: '#b8282a', acc: '#2a2a2e', motif: 'zigzag' }] },
    bottom: { type: 'pants', color: '#2a2628' }, shoes: { type: 'bare' }, held: 'grass' });
  define('tsou_m', { body: 'adult', skin: SK.tan, eyes: '#2a2018', eyeStyle: 'sharp', mouth: 'flat', // 鄒: red jacket, leather cap with feathers, chest cover, leggings
    hair: { style: 'back', color: HC.black }, hat: { type: 'tsou', color: '#7a5236' },
    top: { color: '#c0302c', len: 0.12, closure: 'open', inner: '#c0302c', trim: '#8a1a1a', sleeve: 'long' },
    chest: { color: '#2c4a7a', trim: '#e8d070' }, skirt: { color: '#24304a', len: 0.42, flare: 0.2, trim: '#c0302c' },
    bottom: { type: 'bare' }, leggings: { color: '#8a6440', bands: '#5a3a24' }, shoes: { type: 'bare' }, hip: ['knife'], bag: { color: '#a8302a', strap: '#2c4a7a', acc: '#e8d070' } });
  define('tsou_elder', { base: 'tsou_m', body: 'elder', skin: '#d0a07a', eyeStyle: 'line', brows: 'soft',
    hair: { style: 'back', color: '#a4a29e' }, face: { beard: 'whiskers', beardColor: '#c8c4bc' }, held: 'staff', bag: null });
  define('bunun_m', { body: 'adult', skin: SK.deep, eyes: '#2a2018', eyeStyle: 'sharp', mouth: 'flat', // 布農: white vest with bright woven geometric panels
    hair: { style: 'back', color: HC.black }, hat: { type: 'cap', color: '#6a4a30', acc: '#6a4a30' },
    top: { color: SK.deep, closure: 'skin', bare: true, sleeve: 'none', len: 0 },
    vest: { color: '#f0ebe0', len: 0.3, trim: '#2a2a30', bands: [{ at: 0.3, h: 0.14, color: '#d02a2a', acc: '#f2c230', motif: 'diamond' }, { at: 0.5, h: 0.1, color: '#2a4a9a', acc: '#f0ebe0', motif: 'zigzag' }, { at: 0.72, h: 0.12, color: '#1e1e24', acc: '#e85a2a', motif: 'diamond' }] },
    skirt: { color: '#1c1c24', len: 0.4, flare: 0.25 }, bottom: { type: 'bare' }, shoes: { type: 'bare' }, hip: ['knife'], held: 'bow' });
  define('bunun_f', { body: 'female', skin: SK.tan, eyes: '#2a2018', eyeStyle: 'soft', mouth: 'smile',
    hair: { style: 'part', color: HC.black, knot: 'bun' }, hat: { type: 'band', color: '#2a3a6a', acc: '#f2c230', motif: 'dots', h: 3 },
    top: { color: '#263868', len: 0.42, closure: 'side', trim: '#e2b23a', sleeve: 'long', cuff: '#d23a2a', bands: [{ at: 0.18, h: 0.1, color: '#d23a2a', acc: '#f2c230', motif: 'diamond' }] },
    skirt: { color: '#1e2232', len: 0.95, flare: 0.3, bands: [{ at: 0.86, h: 0.1, color: '#d23a2a', acc: '#f2c230', motif: 'diamond' }, { at: 0.72, h: 0.05, color: '#3a9a5a' }] },
    beads: { colors: ['#f2c230', '#d23a2a', '#3a8ad0'], rows: 2 }, shoes: { type: 'bare' } });
  define('thao_elder', { body: 'elder', skin: SK.tan, eyes: '#2a2018', eyeStyle: 'line', mouth: 'smile', // 邵: holds a 杵 (pestle) for 杵音
    hair: { style: 'back', color: '#cfcdca' }, hat: { type: 'band', color: '#b8282a', acc: '#f2ecdc', motif: 'zigzag', h: 2.8 },
    top: { color: '#efe8da', len: 0.3, closure: 'round', sleeve: 'long' },
    vest: { color: '#262229', trim: '#c0302a', len: 0.3, bands: [{ at: 0.9, h: 0.1, color: '#f2ecdc', acc: '#c0302a', motif: 'diamond' }] },
    skirt: { color: '#24222a', len: 0.5, flare: 0.25, trim: '#c0302a' }, bottom: { type: 'pants', color: '#2a2830' }, shoes: { type: 'bare' }, held: 'pestle' });
  define('tao_m', { body: 'adult', skin: SK.deep, eyes: '#2a2018', eyeStyle: 'round', mouth: 'flat', // 達悟: striped vest and loincloth, bare feet
    hair: { style: 'straight', color: HC.black, back: 'long', len: 0.22 },
    top: { color: SK.deep, closure: 'skin', bare: true, sleeve: 'none', len: 0 },
    vest: { color: '#efede4', len: 0.02, stripes: '#2a3e80', trim: '#2a3e80' },
    skirt: { color: '#2a3e80', len: 0.26, flare: 0.1, stripes: { color: '#efede4', n: 3 } }, bottom: { type: 'bare' }, shoes: { type: 'bare' },
    beads: { colors: ['#e8e4dc', '#c8c4bc'], rows: 1 } });
  define('tao_f', { body: 'female', skin: SK.deep, eyes: '#2a2018', eyeStyle: 'soft', mouth: 'smile',
    hair: { style: 'center', color: HC.black, back: 'long', len: 0.5, locks: 0.9 },
    top: { color: '#efede4', len: 0.12, closure: 'cross', inner: SK.deep, trim: '#2c4a8a', sleeve: 'none', stripes: { color: '#2c4a8a', n: 4 } },
    skirt: { color: '#efede4', len: 0.95, flare: 0.25, stripes: { color: '#2c4a8a', n: 7 } }, bottom: { type: 'bare' }, shoes: { type: 'bare' },
    beads: { colors: ['#e0663a', '#f2c84a', '#e0663a', '#2a8a7a'], rows: 3 } });
  define('puyuma_m', { body: 'adult', skin: SK.tan, eyes: '#2a2018', eyeStyle: 'round', mouth: 'smile', // 卑南: flower wreath, embroidered black jacket
    hair: { style: 'back', color: HC.black }, hat: { type: 'wreath' },
    top: { color: '#1c1c26', len: 0.22, closure: 'center', trim: '#e2b23a', sleeve: 'long', cuff: '#d63a3a',
      bands: [{ at: 0.3, h: 0.1, color: '#d63a3a', acc: '#f2c230', motif: 'cross' }, { at: 0.86, h: 0.12, color: '#e2b23a', acc: '#2a8a4a', motif: 'diamond' }] },
    skirt: { color: '#22345a', len: 0.55, flare: 0.25, bands: [{ at: 0.85, h: 0.14, color: '#d63a3a', acc: '#f2c230', motif: 'cross' }] },
    bottom: { type: 'bare' }, shoes: { type: 'bare' }, bag: { color: '#d63a3a', strap: '#e2b23a', acc: '#f2c230' } });
  define('amis_f', { body: 'female', skin: SK.tan, eyes: '#2a2018', eyeStyle: 'soft', mouth: 'smile', // 阿美: red jacket with bright trims, black skirt, festive headband
    hair: { style: 'part', color: HC.black, back: 'long', len: 0.3 }, hat: { type: 'amis' },
    top: { color: '#d4282a', len: 0.2, closure: 'center', trim: '#f2c230', sleeve: 'long', cuff: '#2f8a4a', button: '#f2c230',
      bands: [{ at: 0.92, h: 0.12, color: '#f2c230', acc: '#2f6ac0', motif: 'dots' }] },
    skirt: { color: '#17161c', len: 0.75, flare: 0.25, bands: [{ at: 0.88, h: 0.1, color: '#e83a3a' }, { at: 0.76, h: 0.06, color: '#2f8a4a' }, { at: 0.68, h: 0.05, color: '#f2c230' }] },
    bottom: { type: 'bare' }, leggings: { color: '#f2f0ea' }, shoes: { type: 'bare' }, bag: { color: '#e8e2d4', strap: '#d4282a', acc: '#d4282a', tassels: '#f2c230' } });
  define('amis_elder', { body: 'elder', skin: SK.tan, eyes: '#2a2018', eyeStyle: 'line', mouth: 'smile', // age-grade elder, alofo bag
    hair: { style: 'back', color: '#d4d2ce' }, hat: { type: 'band', color: '#d4282a', acc: '#f2c230', motif: 'diamond', h: 3.2 },
    top: { color: '#efebe2', len: 0.28, closure: 'round', sleeve: 'long' },
    vest: { color: '#c42a2a', trim: '#f2c230', len: 0.3, bands: [{ at: 0.55, h: 0.1, color: '#1c1a20', acc: '#f2c230', motif: 'diamond' }] },
    skirt: { color: '#1a191e', len: 0.5, flare: 0.2, trim: '#c42a2a' }, bottom: { type: 'pants', color: '#1e1d22' }, shoes: { type: 'bare' },
    bag: { color: '#efe8d8', strap: '#c42a2a', acc: '#c42a2a', tassels: '#f2c230' }, held: 'staff' });
  define('truku_elder', { body: 'elderf', skin: '#d0a07c', eyes: '#2a2018', eyeStyle: 'line', mouth: 'flat', // 太魯閣: elder with 紋面, red-white woven dress
    face: { tattoo: 'truku_f', blush: false },
    hair: { style: 'back', color: '#dcdad6', knot: 'bun' },
    top: { color: '#efe8da', len: 0.42, closure: 'cross', inner: '#efe8da', trim: '#a8242a', sleeve: 'long', cuff: '#a8242a',
      bands: [{ at: 0.3, h: 0.14, color: '#a8242a', acc: '#efe8da', motif: 'diamond' }, { at: 0.75, h: 0.1, color: '#1e1c22', acc: '#a8242a', motif: 'diamond' }] },
    skirt: { color: '#24222a', len: 0.92, flare: 0.25, bands: [{ at: 0.82, h: 0.14, color: '#a8242a', acc: '#efe8da', motif: 'diamond' }] },
    shoes: { type: 'bare' }, beads: { colors: ['#efe8da', '#a8242a'], rows: 1 } });
  define('kavalan_f', { body: 'female', skin: SK.tan, eyes: '#2a2018', eyeStyle: 'soft', mouth: 'smile', // 噶瑪蘭: banana-fibre weaving
    hair: { style: 'part', color: HC.black, knot: 'bun' }, hat: { type: 'band', color: '#1e2a44', acc: '#f2c230', motif: 'dots', h: 3 },
    top: { color: '#1f2a44', len: 0.4, closure: 'side', trim: '#d63a3a', sleeve: 'long', cuff: '#f2c230', bands: [{ at: 0.9, h: 0.1, color: '#d63a3a', acc: '#f4efe2', motif: 'zigzag' }] },
    skirt: { color: '#cdb88a', len: 0.9, flare: 0.3, stripes: { color: '#7a6a48', n: 6 } }, shoes: { type: 'bare' }, held: 'fiber' });
  define('bajiajiang', { body: 'adult', skin: SK.warm, eyes: '#1a1418', eyeStyle: 'fierce', brows: 'fierce', mouth: 'flat', // 八家將 painted-face troupe member
    face: { paint: { base: '#c8342c', mark: '#1d1a20', acc: '#f4ecd8' }, blush: false },
    hair: { style: 'back', color: HC.black }, hat: { type: 'bajia', color: '#1e1c24', acc: '#e8382e' },
    top: { color: '#c8342c', len: 0.5, closure: 'center', trim: '#e8c050', sleeve: 'long', cuff: '#e8c050' },
    vest: { color: '#2a2a34', trim: '#e8c050', len: 0.18, bands: [{ at: 0.5, h: 0.14, color: '#2f7a4a', acc: '#e8c050', motif: 'cross' }] },
    skirt: { color: '#2f6a4a', len: 0.62, flare: 0.3, trim: '#e8c050' }, bottom: { type: 'wide', color: '#efe8da' }, shoes: { type: 'sandal' }, held: 'plaque' });
  define('qianliyan', { body: 'stout', size: 1.45, skin: '#5f9a6a', eyes: '#f2d040', eyeStyle: 'fierce', brows: 'fierce', mouth: 'frown', // 千里眼 procession figure
    face: { paint: { base: '#5f9a6a', mark: null, acc: '#f2e8a0' }, blush: false },
    hair: { style: 'wild', color: '#c0482a', back: 'long', len: 0.18 }, hat: { type: 'giant', color: '#d8b04c', acc: '#e23a3a' },
    top: { color: '#2f5aa0', len: 1.0, closure: 'cross', inner: '#e8d070', trim: '#d8b04c', sleeve: 'wide', cuff: '#d8b04c' },
    armor: { color: '#c8a04a', trim: '#e23a3a' }, sash: { color: '#e23a3a', w: 3.2 }, cape: { color: '#a82a2a', len: 0.5, collarColor: '#d8b04c' },
    shoes: { type: 'boots', color: '#2a2228' }, held: 'halberd', armPose: 'brow' });
  define('shunfenger', { base: 'qianliyan', skin: '#c84a3a', eyes: '#f2d040', // 順風耳
    face: { paint: { base: '#c84a3a', mark: null, acc: '#f2e8a0' }, blush: false },
    hair: { style: 'wild', color: '#2a4a3a', back: 'long', len: 0.18 }, hat: { type: 'giant', color: '#d8b04c', acc: '#2a8a5a', horns: '#e8dcc0' },
    top: { color: '#2f7a4a', inner: '#e8d070' }, cape: { color: '#2a3a6a' }, held: 'axe', armPose: 'ear' });
  define('pilgrim', { body: 'adult', skin: SK.warm, eyes: '#2a2018', eyeStyle: 'dot', mouth: 'smile', // 進香客
    hair: { style: 'back', color: HC.black }, hat: { type: 'band', color: '#f0c83a', acc: '#c8282a', motif: 'stripe', h: 3 },
    top: { color: '#5a6a8a', len: 0.3, closure: 'side', trim: '#3a465e', sleeve: 'long' }, vest: { color: '#f0c83a', trim: '#c8282a', len: 0.12 },
    bottom: { type: 'wide', color: '#2e2e36' }, shoes: { type: 'sandal' }, hip: ['pouch'], held: 'flag' });
  define('yueqin_singer', { body: 'elder', skin: SK.tan, eyes: '#2a2018', eyeStyle: 'line', mouth: 'smile', // 恆春 月琴 folk singer
    hair: { style: 'back', color: '#a8a6a2' }, face: { beard: 'goatee', beardColor: '#c8c4bc' },
    top: { color: '#3a3a44', len: 0.32, closure: 'center', trim: '#24242c', sleeve: 'long' },
    bottom: { type: 'wide', color: '#2a2a30' }, shoes: { type: 'sandal' }, held: 'yueqin' });
  define('lighthouse_keeper', { body: 'adult', skin: '#efe2da', eyes: '#4a6a8a', eyeStyle: 'round', mouth: 'flat', ghost: true, // ghostly 19th-c. foreign keeper
    hair: { style: 'side', color: '#b89a6a', back: 'short' }, hat: { type: 'peaked', color: '#23304e' }, face: { beard: 'full', beardColor: '#a88a5a' },
    top: { color: '#26355a', len: 0.55, closure: 'center', trim: '#1a2440', sleeve: 'long', button: '#e0c060' }, belt: { color: '#2a2020', buckle: '#e0c060' },
    bottom: { type: 'pants', color: '#22263a' }, shoes: { type: 'boots', color: '#1e1c22' }, held: 'oillamp' });
  define('pirate_ghost', { body: 'adult', skin: '#d8ccc4', eyes: '#2a2a3a', eyeStyle: 'sharp', brows: 'fierce', mouth: 'smirk', ghost: true,
    hair: { style: 'wild', color: '#2a2630', back: 'long', len: 0.2 }, hat: { type: 'scarf', color: '#a82a2a' }, face: { beard: 'full', beardColor: '#3a3434' },
    top: { color: '#6a5a4a', len: 0.3, closure: 'open', inner: '#c8bcae', trim: '#4a3e32', sleeve: 'rolled' }, sash: { color: '#a82a2a', w: 3, tails: true },
    bottom: { type: 'cropped', color: '#3a3a44' }, shoes: { type: 'bare' }, held: 'saber' });
  define('fisher_f', { body: 'female', skin: SK.tan, eyes: '#2a2018', eyeStyle: 'soft', // 澎湖 fisherwoman: hat + flower-print face cloth against wind & sun
    hair: { style: 'part', color: HC.black, back: 'short' }, hat: { type: 'douli', color: '#d8ba78' }, face: { mask: 'facecloth', clothColor: '#d65a6a', clothAcc: '#f6e6a0' },
    top: { color: '#6a7aa0', len: 0.36, closure: 'side', trim: '#3a4666', sleeve: 'long', cuff: '#e8e2d2' },
    bottom: { type: 'wide', color: '#2c2e38' }, shoes: { type: 'sandal' }, held: 'basket' });

  // ---------------------------------------------------------------- animals
  define('dog', { kind: 'quad', species: 'dog' });   // 阿黃, yellow 台灣土狗 with a red collar
  define('cat', { kind: 'quad', species: 'cat' });
  define('buffalo', { kind: 'quad', species: 'buffalo' });
  define('chicken', { kind: 'bird', species: 'chicken' });
  define('crow', { kind: 'bird', species: 'crow' });
})();
